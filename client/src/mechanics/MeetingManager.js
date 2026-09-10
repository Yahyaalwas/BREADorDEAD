import { ChatBox } from '../ui/ChatBox.js';
import { WOOL_COLORS, QUICK_CHAT } from '../../../shared/constants.js';
import { Sfx } from '../audio/Sfx.js';

const $ = (id) => document.getElementById(id);

/** The argument: chat, quick-chat buttons for thumbs, the player list, voting. */
export class MeetingManager {
  constructor({ onVote, onChat }) {
    this.root = $('meeting');
    this.title = $('meeting-title');
    this.sub = $('meeting-sub');
    this.timerEl = $('meeting-timer');
    this.listEl = $('vote-list');
    this.noteEl = $('meeting-note');
    this.skipBtn = $('btn-skip');
    this.quickBox = $('quick-chat');
    this.chat = new ChatBox(onChat);
    this.onVote = onVote;
    this.onChat = onChat;
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

    const m = snap.meeting;
    const caller = snap.players.find((p) => p.id === m?.calledBy);
    if (m?.kind === 'body') {
      this.title.textContent = 'BODY FOUND';
      this.sub.textContent = `${caller ? caller.name : 'Someone'} found what is left of ${m.victimName}.`;
    } else {
      this.title.textContent = 'EMERGENCY MEETING';
      this.sub.textContent = `${caller ? caller.name : 'Someone'} rang the bell.`;
    }
    this.chat.setEnabled(!!snap.you && snap.you.alive);
    this.buildQuickChat(snap);
    Sfx.meeting();
    setTimeout(() => this.chat.focus(), 60);
  }

  /** Canned lines so a phone player can accuse someone with one thumb. */
  buildQuickChat(snap) {
    const others = snap.players.filter((p) => p.alive && p.id !== snap.you?.id);
    const pick = () => (others.length
      ? others[Math.floor(Math.random() * others.length)].name
      : 'someone');
    this.quickBox.innerHTML = '';
    for (const template of QUICK_CHAT.slice(0, 6)) {
      const text = template.replace('{n}', pick());
      const b = document.createElement('button');
      b.className = 'quick';
      b.textContent = text;
      b.onclick = () => { if (snap.you?.alive) this.onChat(text); };
      this.quickBox.appendChild(b);
    }
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
    Sfx.tap();
    this.noteEl.textContent = targetId === 'skip' ? 'You skipped.' : 'Vote cast.';
  }

  update(snap) {
    const m = snap.meeting;
    if (!m) return;
    this.chat.sync(snap.chat || []);

    const votes = Object.keys(m.votes || {}).length;
    const alive = snap.players.filter((p) => p.alive).length;
    this.timerEl.textContent = m.resolved
      ? 'Counting…'
      : `${Math.ceil(m.timer)}s · ${votes}/${alive} voted`;

    const canVote = snap.you && snap.you.alive && !m.resolved;
    this.skipBtn.disabled = !canVote || !!this.myVote;

    const tally = {};
    for (const t of Object.values(m.votes || {})) tally[t] = (tally[t] || 0) + 1;
    const sig = `${snap.players.map((p) => p.id + p.alive).join()}|${JSON.stringify(tally)}|${this.myVote}|${m.resolved}`;
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
      const color = `#${WOOL_COLORS[p.colorIndex % WOOL_COLORS.length].hex.toString(16).padStart(6, '0')}`;
      row.innerHTML = `<span class="swatch" style="background:${color}"></span>
        <span>${escapeHtml(p.name)}${p.alive ? '' : ' — eaten'}</span>
        <span class="tally">${'🐑'.repeat(tally[p.id] || 0)}</span>`;
      if (p.alive && canVote && !this.myVote) row.onclick = () => this.vote(p.id);
      this.listEl.appendChild(row);
    }
  }

  showResult(result) {
    if (!result) return;
    if (result.skipped) {
      this.chat.system('Nobody was thrown out. Back to work.');
    } else {
      this.chat.system(`${result.ejectedName} was thrown over the fence… ${
        result.wasWolf ? 'and they were the WOLF. 🐺' : 'and they were just a sheep. 🐑'}`);
    }
    this.noteEl.textContent = result.skipped ? 'Skipped.' : 'Ejected.';
    Sfx.eject();
  }

  destroy() { this.hide(); this.skipBtn.onclick = null; }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
