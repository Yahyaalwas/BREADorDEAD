/**
 * Mobile chrome: the chore drawer, and keeping the meeting chat input above the
 * software keyboard. It drives the same HUD elements the desktop layout uses —
 * CSS decides whether #hud-chores is a corner card or a drawer.
 */
const $ = (id) => document.getElementById(id);

export class MobileUI {
  constructor({ onOverlayOpen } = {}) {
    this.onOverlayOpen = onOverlayOpen || (() => {});
    this.bar = $('hud-mobilebar');
    this.drawerBtn = $('btn-drawer');
    this.scrim = $('drawer-scrim');
    this.drawerBtn.onclick = () => this.toggleDrawer();
    this.scrim.onclick = () => this.closeDrawer();

    // The role chip belongs in the top bar on a phone, but it is an absolute
    // corner on desktop — so the move follows the breakpoint, including a
    // mid-session rotate.
    this.mq = window.matchMedia('(pointer: coarse), (max-width: 820px)');
    this.applyLayout();
    this.mq.addEventListener?.('change', () => this.applyLayout());

    this.trackKeyboard();
  }

  applyLayout() {
    const home = this.mq.matches ? this.bar : $('hud');
    home.appendChild($('hud-role'));
  }

  toggleDrawer() {
    const open = document.body.classList.toggle('drawer-open');
    if (open) this.onOverlayOpen();
  }

  closeDrawer() { document.body.classList.remove('drawer-open'); }

  /**
   * iOS shrinks the visual viewport instead of resizing the window, so a fixed
   * chat bar would end up under the keyboard. --kb is how far up to push it.
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

  update(snap) {
    const you = snap.you;
    if (!you) return;
    const done = you.chores.filter((c) => c.done).length;
    const text = `${done}/${you.chores.length}`;
    const badge = $('chore-badge');
    if (badge.textContent !== text) badge.textContent = text;
  }

  reset() { this.closeDrawer(); }
}
