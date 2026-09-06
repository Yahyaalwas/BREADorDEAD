/**
 * Mobile chrome: the tasks drawer, the ability sheet, and keeping the meeting
 * chat input above the software keyboard.
 *
 * It drives the *same* HUD elements the desktop layout uses — CSS decides
 * whether `#hud-tasks` is a corner panel or a drawer — so there is only ever one
 * copy of the task list and the ability bar to keep in sync.
 */
const $ = (id) => document.getElementById(id);

export class MobileUI {
  constructor({ onOverlayOpen } = {}) {
    this.onOverlayOpen = onOverlayOpen || (() => {});
    this.bar = $('hud-mobilebar');
    this.drawerBtn = $('btn-drawer');
    this.sheetBtn = $('btn-sheet');
    this.scrim = $('drawer-scrim');
    this.badge = $('tasks-badge');
    this.abilities = $('hud-abilities');

    this.drawerBtn.onclick = () => this.toggleDrawer();
    this.sheetBtn.onclick = () => this.toggleSheet();
    this.scrim.onclick = () => { this.closeDrawer(); this.closeSheet(); };
    // Using an ability should get the sheet out of the way immediately.
    this.abilities.addEventListener('click', () => this.closeSheet());

    // The role chip and SCREAM belong in the top bar on a phone, but the same
    // elements are absolute-positioned corners on desktop — so the move has to
    // follow the breakpoint, including a mid-session rotate or window resize.
    this.mq = window.matchMedia('(pointer: coarse), (max-width: 820px)');
    this.applyLayout();
    this.mq.addEventListener?.('change', () => this.applyLayout());

    this.trackKeyboard();
  }

  applyLayout() {
    const role = $('hud-role');
    const actions = $('hud-actions');
    const home = this.mq.matches ? this.bar : $('hud');
    home.appendChild(role);
    home.appendChild(actions);
  }

  toggleDrawer() {
    document.body.classList.toggle('drawer-open');
    if (document.body.classList.contains('drawer-open')) {
      this.closeSheet();
      this.onOverlayOpen();     // drop any held steering
    }
  }

  closeDrawer() { document.body.classList.remove('drawer-open'); }

  toggleSheet() {
    this.abilities.classList.toggle('open');
    if (this.abilities.classList.contains('open')) {
      this.closeDrawer();
      this.onOverlayOpen();
    }
    document.body.classList.toggle('sheet-open', this.abilities.classList.contains('open'));
  }

  closeSheet() {
    this.abilities.classList.remove('open');
    document.body.classList.remove('sheet-open');
  }

  /**
   * iOS shrinks the visual viewport instead of resizing the window, so a fixed
   * chat input would end up underneath the keyboard. --kb is how far up to push.
   */
  trackKeyboard() {
    const vv = window.visualViewport;
    if (!vv) return;
    const apply = () => {
      const overlap = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      document.documentElement.style.setProperty('--kb', `${Math.round(overlap)}px`);
    };
    vv.addEventListener('resize', apply);
    vv.addEventListener('scroll', apply);
    apply();
  }

  /** Called every frame with the current snapshot. */
  update(snap) {
    const you = snap.you;
    if (!you) return;
    const done = you.tasks.filter((t) => t.done).length;
    const text = `${done}/${you.tasks.length}`;
    if (this.badge.textContent !== text) this.badge.textContent = text;
    const moldy = you.role === 'moldy' && you.alive;
    if (this.sheetBtn.hidden === moldy) this.sheetBtn.hidden = !moldy;
    if (!moldy) this.closeSheet();
  }

  reset() {
    this.closeDrawer();
    this.closeSheet();
  }
}
