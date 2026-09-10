import { CHORES, ROLE, TIMING } from '../../../shared/constants.js';

const $ = (id) => document.getElementById(id);

/** The DOM overlay on the canvas: chores, the context button and wolf powers. */
export class HUD {
  constructor() {
    this.root = $('hud');
    this.bar = $('chore-bar');
    this.list = $('chore-list');
    this.roleBox = $('hud-role');
    this.logBox = $('hud-log');
    this.primary = $('btn-primary');
    this.wolfBox = $('wolf-powers');
    this.badge = $('chore-badge');
    this._sig = '';
    this._roleSig = '';
  }

  show() { this.root.classList.add('on'); }
  hide() { this.root.classList.remove('on'); this.logBox.innerHTML = ''; }

  onPrimary(press, release) {
    this.primary.addEventListener('pointerdown', (e) => { e.preventDefault(); press(); });
    this.primary.addEventListener('pointerup', release);
    this.primary.addEventListener('pointercancel', release);
    this.primary.addEventListener('pointerleave', release);
  }

  onWolf(fn) {
    this.wolfBox.querySelectorAll('[data-power]').forEach((b) => {
      b.onclick = () => fn(b.dataset.power);
    });
  }

  update(snap, action) {
    const you = snap.you;
    this.bar.style.width = `${Math.round((snap.choreProgress || 0) * 100)}%`;
    if (!you) return;

    const done = you.chores.filter((c) => c.done).length;
    this.badge.textContent = `${done}/${you.chores.length}`;
    this.renderChores(you);
    this.renderRole(you, snap);

    // The one button, relabelled for whatever is under your feet.
    if (action) {
      this.primary.hidden = false;
      this.primary.textContent = action.label;
      this.primary.className = `primary ${action.tone}`;
    } else {
      this.primary.hidden = true;
    }

    const wolf = you.role === ROLE.WOLF && you.alive;
    this.wolfBox.hidden = !wolf;
    if (wolf) {
      this.setPower('eat', you.eatCd, you.canEat);
      this.setPower('tunnel', you.tunnelCd, you.atHay);
      this.setPower('fog', you.fogCd, true);
    }
  }

  setPower(name, cooldown, ready) {
    const btn = this.wolfBox.querySelector(`[data-power="${name}"]`);
    if (!btn) return;
    const cd = btn.querySelector('.cd');
    const usable = cooldown <= 0.05 && ready;
    btn.classList.toggle('ready', usable);
    if (cooldown > 0.05) { cd.hidden = false; cd.textContent = Math.ceil(cooldown); }
    else cd.hidden = true;
  }

  renderChores(you) {
    const sig = you.chores.map((c) => `${c.id}${c.done ? 1 : 0}${c.progress.toFixed(2)}`).join('|');
    if (sig === this._sig) return;
    this._sig = sig;
    this.list.innerHTML = you.chores.map((c) => {
      const def = CHORES.find((d) => d.id === c.id);
      return `<div class="chore ${c.done ? 'done' : ''}">
        <div class="chore-name">${c.done ? '✔' : def.emoji} ${def.name}</div>
        <div class="chore-where">${def.room.toLowerCase()}</div>
        <div class="mini"><i style="width:${Math.round(c.progress * 100)}%"></i></div>
      </div>`;
    }).join('');
  }

  renderRole(you, snap) {
    const sig = `${you.role}${you.alive}${snap.fog}`;
    if (sig === this._roleSig) return;
    this._roleSig = sig;
    const wolf = you.role === ROLE.WOLF;
    this.roleBox.innerHTML = `<div class="role ${wolf ? 'wolf' : 'sheep'}">${wolf ? '🐺 WOLF' : '🐑 SHEEP'}</div>
      <div class="muted">${you.alive ? (wolf ? 'Eat them all' : 'Finish the chores') : 'Ghost — keep watching'}</div>`;
  }

  log(text) {
    const el = document.createElement('div');
    el.className = 'log-line';
    el.textContent = text;
    this.logBox.appendChild(el);
    setTimeout(() => el.remove(), 4000);
    while (this.logBox.children.length > 4) this.logBox.firstChild.remove();
  }
}
