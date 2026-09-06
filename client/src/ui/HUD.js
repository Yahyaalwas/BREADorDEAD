import { TASK_DEFS, ROLE, TIMING } from '../../../shared/constants.js';

const $ = (id) => document.getElementById(id);

/** The DOM overlay on top of the Phaser canvas: timers, tasks, role, alerts. */
export class HUD {
  constructor() {
    this.root = $('hud');
    this.timer = $('hud-timer');
    this.taskbar = $('hud-taskbar');
    this.taskList = $('hud-tasks');
    this.roleBox = $('hud-role');
    this.log = $('hud-log');
    this.banner = $('hud-banner');
    this.screamBtn = $('btn-scream');
    this.reportBtn = $('btn-report');
    this._taskSig = '';
    this._roleSig = '';
  }

  show() { this.root.classList.add('on'); }
  hide() { this.root.classList.remove('on'); this.clearBanner(); this.log.innerHTML = ''; }

  onScream(fn) { this.screamBtn.onclick = fn; }
  onReport(fn) { this.reportBtn.onclick = fn; }

  update(snap) {
    if (!snap) return;
    const secs = Math.ceil(snap.roundTimer || 0);
    this.timer.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    this.timer.classList.toggle('danger', secs <= 10);
    this.taskbar.style.width = `${Math.round((snap.taskProgress || 0) * 100)}%`;

    const you = snap.you;
    if (you) {
      this.renderTasks(you);
      this.renderRole(you, snap);
      this.screamBtn.disabled = you.usedScream || !you.alive;
      this.screamBtn.textContent = you.usedScream ? 'SCREAMED' : 'SCREAM!';
      const nearBody = snap.bodies.some((b) => {
        const me = snap.players.find((p) => p.id === you.id);
        return me && Math.hypot(me.x - b.x, me.y - b.y) < 110;
      });
      this.reportBtn.hidden = !(nearBody && you.alive);
    }

    if (snap.toasterCrank > 0) {
      this.setBanner(`TOASTER CRANKED — EVACUATE (${Math.ceil(snap.toasterCrank)})`);
    } else if (this.banner.dataset.kind === 'toaster') {
      this.clearBanner();
    }
  }

  renderTasks(you) {
    const sig = you.tasks.map((t) => `${t.id}${t.done ? 1 : 0}${t.progress.toFixed(2)}`).join('|');
    if (sig === this._taskSig) return;
    this._taskSig = sig;
    const rows = you.tasks.map((t) => {
      const def = TASK_DEFS[t.id];
      return `<div class="task-item ${t.done ? 'done' : ''}">
        <div class="task-name">${t.done ? '✔' : '○'} ${def.name}</div>
        <div class="task-hint">${def.hint}</div>
        <div class="mini"><i style="width:${Math.round(t.progress * 100)}%"></i></div>
      </div>`;
    }).join('');
    this.taskList.innerHTML = `<div class="task-name" style="opacity:.6;margin-bottom:8px">TASKS</div>${rows}`;
  }

  renderRole(you, snap) {
    const alive = you.alive;
    const moldy = you.role === ROLE.MOLDY;
    const sig = `${you.role}${alive}${snap.round}`;
    if (sig === this._roleSig) return;
    this._roleSig = sig;
    this.roleBox.innerHTML = `
      <div class="role-badge ${moldy ? 'moldy' : 'fresh'}">${moldy ? 'MOLDY SLICE' : 'FRESH BREAD'}</div>
      <div class="muted">${alive ? `Round ${snap.round} / ${TIMING.MAX_ROUNDS}` : 'You are a ghost crumb'}</div>`;
  }

  addLog(text) {
    const el = document.createElement('div');
    el.className = 'log-line';
    el.textContent = text;
    this.log.appendChild(el);
    setTimeout(() => el.remove(), 4000);
    while (this.log.children.length > 5) this.log.firstChild.remove();
  }

  setBanner(text, kind = 'toaster') {
    this.banner.hidden = false;
    this.banner.textContent = text;
    this.banner.dataset.kind = kind;
  }

  clearBanner() {
    this.banner.hidden = true;
    this.banner.dataset.kind = '';
  }
}
