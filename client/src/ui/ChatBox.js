const $ = (id) => document.getElementById(id);

/** Meeting chat. Dead bread can read but the living never see them type. */
export class ChatBox {
  constructor(onSend) {
    this.log = $('chat-log');
    this.form = $('chat-form');
    this.input = $('chat-input');
    this.seen = new Set();
    this.form.onsubmit = (e) => {
      e.preventDefault();
      const text = this.input.value.trim();
      if (!text) return;
      this.input.value = '';
      onSend(text);
    };
  }

  clear() {
    this.log.innerHTML = '';
    this.seen.clear();
  }

  setEnabled(enabled, placeholder) {
    this.input.disabled = !enabled;
    this.form.querySelector('button').disabled = !enabled;
    this.input.placeholder = placeholder || (enabled ? 'Say something breadful…' : 'Ghost crumbs cannot speak.');
  }

  system(text) {
    this.append({ id: `sys${Date.now()}${Math.random()}`, system: true, text });
  }

  /** Accepts the whole chat array; only unseen messages are appended. */
  sync(messages = []) {
    for (const m of messages) this.append(m);
  }

  append(m) {
    if (this.seen.has(m.id)) return;
    this.seen.add(m.id);
    const el = document.createElement('div');
    el.className = `chat-msg ${m.dead ? 'dead' : ''} ${m.system ? 'system' : ''}`;
    el.innerHTML = m.system
      ? escapeHtml(m.text)
      : `<b>${escapeHtml(m.name)}${m.dead ? ' (dead)' : ''}:</b> ${escapeHtml(m.text)}`;
    this.log.appendChild(el);
    this.log.scrollTop = this.log.scrollHeight;
  }

  focus() { if (!this.input.disabled) this.input.focus(); }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
