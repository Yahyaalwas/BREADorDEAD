import { ChatBox } from '../ui/ChatBox.js';
import { BREAD_COLORS } from '../../../shared/constants.js';
import { Sfx } from '../audio/Sfx.js';

const $ = (id) => document.getElementById(id);

/** Full-screen meeting overlay: chat, the player list, voting and the verdict. */
export class MeetingManager {
  constructor({ onVote, onChat }) {
    this.root = $('meeting');
    this.title = $('meeting-title');
    this.timerEl = $('meeting-timer');
    this.listEl = $('vote-list');
    this.noteEl = $('meeting-note');
    this.skipBtn = $('btn-skip');
    this.chat = new ChatBox(onChat);
    this.onVote = onVote;
    this.open = false;
    this.myVote = null;
    this.resultShown = false;
    this.skipBtn.onclick = () => this.vote('skip');
  }

  show(snap) {
    if (this.open) return;
    this.open = true;
    this.myVote = null;
    this.resultShown = false;
    this._sig = '';
    this.root.classList.add('on');
    this.chat.clear();
    const you = snap.you;
    this.chat.setEnabled(!!you && you.alive);
    const m = snap.meeting;
    this.title.textContent = m?.type === 'body' ? 'Body Reported'
      : m?.type === 'round' ? 'Time — Everyone to the Table'
      : 'Emergency Meeting';
    const caller = snap.players.find((p) => p.id === m?.calledBy);
    this.chat.system(caller ? `${caller.name} called it.` : 'The round ended. Talk.');
    Sfx.meeting();
    setTimeout(() => this.chat.focus(), 60);
  }

  hide() {
    if (!this.open) return;
    this.open = false;
    this.root.classList.remove('on');
    this.noteEl.textContent = '';
  }

  vote(targetId) {
    if (this.myVote) return;
    this.myVote = targetId;
    this.onVote(targetId);
    Sfx.vote();
    this.noteEl.textContent = targetId === 'skip' ? 'You skipped.' : 'Vote cast.';
  }

  update(snap) {
    const m = snap.meeting;
    if (!m) return;
    this.chat.sync(snap.chat || []);

    const secs = Math.ceil(m.timer);
    const votes = Object.keys(m.votes || {}).length;
    const alive = snap.players.filter((p) => p.alive).length;
    this.timerEl.textContent = m.resolved
      ? 'Counting the crumbs…'
      : `${secs}s left · ${votes}/${alive} voted`;

    const canVote = snap.you && snap.you.alive && !m.resolved;
    this.skipBtn.disabled = !canVote || !!this.myVote;

    const tally = {};
    for (const t of Object.values(m.votes || {})) tally[t] = (tally[t] || 0) + 1;

    const sig = `${snap.players.map((p) => `${p.id}${p.alive}`).join()}|${JSON.stringify(tally)}|${this.myVote}|${m.resolved}`;
    if (sig !== this._sig) {
      this._sig = sig;
      this.renderList(snap, tally, canVote);
    }

    if (m.resolved && !this.resultShown) {
      this.resultShown = true;
      this.showResult(m.result);
    }
  }

  renderList(snap, tally, canVote) {
    this.listEl.innerHTML = '';
    for (const p of snap.players) {
      const row = document.createElement('div');
      row.className = `vote-row ${p.alive ? '' : 'dead'} ${this.myVote === p.id ? 'voted' : ''}`;
      const color = `#${BREAD_COLORS[p.colorIndex % BREAD_COLORS.length].toString(16).padStart(6, '0')}`;
      row.innerHTML = `<span class="swatch" style="background:${color}"></span>
        <span>${escapeHtml(p.name)}${p.alive ? '' : ' — crisp'}</span>
        <span class="tally">${'●'.repeat(tally[p.id] || 0)}</span>`;
      if (p.alive && canVote && !this.myVote) row.onclick = () => this.vote(p.id);
      this.listEl.appendChild(row);
    }
  }

  showResult(result) {
    if (!result) return;
    if (result.skipped) {
      this.chat.system('No one was ejected. The kitchen stays crowded.');
    } else {
      this.chat.system(`${result.ejectedName} went over the edge… ${
        result.wasMoldy ? 'and they were the Moldy Slice.' : 'and they were just bread.'}`);
    }
    this.noteEl.textContent = result.skipped ? 'Skipped.' : 'Ejected.';
    Sfx.eject();
  }

  destroy() {
    this.hide();
    this.skipBtn.onclick = null;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
