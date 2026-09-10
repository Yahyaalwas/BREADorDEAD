// Tiny Web Audio kit. No sample files — every sound is synthesised, so the
// whole game still ships as code.

let ctx = null;
let master = null;
let enabled = true;

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function env(gain, t, attack, decay, peak = 1) {
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function tone({ freq = 440, type = 'sine', dur = 0.2, attack = 0.01, gain = 0.3, slideTo = null, delay = 0 }) {
  const c = audio();
  if (!c || !enabled) return;
  const t = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(slideTo, 1), t + dur);
  env(g, t, attack, dur, gain);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + dur + attack + 0.05);
}

function noise({ dur = 0.2, gain = 0.25, filter = 900, type = 'lowpass', delay = 0 }) {
  const c = audio();
  if (!c || !enabled) return;
  const t = c.currentTime + delay;
  const frames = Math.max(1, Math.floor(c.sampleRate * dur));
  const buffer = c.createBuffer(1, frames, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  const src = c.createBufferSource();
  src.buffer = buffer;
  const bq = c.createBiquadFilter();
  bq.type = type;
  bq.frequency.value = filter;
  const g = c.createGain();
  env(g, t, 0.005, dur, gain);
  src.connect(bq).connect(g).connect(master);
  src.start(t);
}

function chord(freqs, { dur = 0.9, type = 'sawtooth', gain = 0.14 } = {}) {
  freqs.forEach((f, i) => tone({ freq: f, type, dur, gain, delay: i * 0.02 }));
}

export const Sfx = {
  setEnabled(v) { enabled = !!v; },
  toggle() { enabled = !enabled; return enabled; },
  unlock() {
    // Cheap no-op once running, so it can be called on every tap.
    if (ctx && ctx.state === 'running') return;
    audio();
  },
  get running() { return !!ctx && ctx.state === 'running'; },

  tap()     { tone({ freq: 660, dur: 0.07, type: 'square', gain: 0.12 }); },
  ding()    { tone({ freq: 1180, dur: 0.4, gain: 0.2 }); tone({ freq: 1760, dur: 0.3, gain: 0.09, delay: 0.05 }); },
  bell()    { [880, 1320].forEach((f, i) => tone({ freq: f, dur: 1.1, type: 'sine', gain: 0.18, delay: i * 0.08 })); },
  chomp()   { noise({ dur: 0.22, gain: 0.3, filter: 700 }); tone({ freq: 150, slideTo: 60, dur: 0.25, type: 'sawtooth', gain: 0.2 }); },
  scream()  { chord([196, 233, 277, 415], { dur: 1.1, gain: 0.12 }); tone({ freq: 900, slideTo: 200, dur: 0.7, type: 'sawtooth', gain: 0.1 }); },
  meeting() { chord([110, 146.8, 174.6], { dur: 1.5, gain: 0.1 }); },
  eject()   { tone({ freq: 420, slideTo: 70, dur: 1.0, type: 'triangle', gain: 0.2 }); noise({ dur: 0.4, gain: 0.18, filter: 900, delay: 0.85 }); },
  fog()     { noise({ dur: 1.2, gain: 0.22, filter: 420 }); tone({ freq: 120, slideTo: 55, dur: 1.2, type: 'sine', gain: 0.12 }); },
  whoosh()  { noise({ dur: 0.35, gain: 0.24, filter: 1800, type: 'highpass' }); },
  win()     { [523, 659, 784, 1046].forEach((f, i) => tone({ freq: f, dur: 0.34, type: 'triangle', gain: 0.2, delay: i * 0.11 })); },
  lose()    { [392, 349, 294, 196].forEach((f, i) => tone({ freq: f, dur: 0.45, type: 'sawtooth', gain: 0.16, delay: i * 0.14 })); },
};
