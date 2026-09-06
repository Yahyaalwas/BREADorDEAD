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
  unlock() { audio(); },

  hop()        { noise({ dur: 0.12, gain: 0.18, filter: 420 }); tone({ freq: 180, slideTo: 90, dur: 0.12, type: 'triangle', gain: 0.14 }); },
  land()       { noise({ dur: 0.08, gain: 0.12, filter: 300 }); },
  toastDing()  { tone({ freq: 1320, dur: 0.5, type: 'sine', gain: 0.22 }); tone({ freq: 1980, dur: 0.4, gain: 0.1, delay: 0.04 }); },
  toastFail()  { tone({ freq: 220, slideTo: 90, dur: 0.35, type: 'square', gain: 0.16 }); },
  burn()       { noise({ dur: 0.7, gain: 0.3, filter: 2600, type: 'highpass' }); tone({ freq: 90, slideTo: 40, dur: 0.7, type: 'sawtooth', gain: 0.16 }); },
  squish()     { tone({ freq: 300, slideTo: 70, dur: 0.28, type: 'sawtooth', gain: 0.2 }); noise({ dur: 0.25, gain: 0.16, filter: 600 }); },
  pop()        { tone({ freq: 700, slideTo: 1500, dur: 0.09, type: 'sine', gain: 0.3 }); noise({ dur: 0.06, gain: 0.2, filter: 3000, type: 'highpass' }); },
  inflate()    { tone({ freq: 200, slideTo: 620, dur: 0.5, type: 'triangle', gain: 0.1 }); },
  scream()     { chord([196, 233, 277, 415], { dur: 1.2, gain: 0.13 }); tone({ freq: 880, slideTo: 220, dur: 0.8, type: 'sawtooth', gain: 0.1 }); },
  meeting()    { chord([110, 146.8, 174.6], { dur: 1.6, gain: 0.1 }); },
  vote()       { tone({ freq: 520, dur: 0.12, type: 'square', gain: 0.16 }); },
  eject()      { tone({ freq: 400, slideTo: 60, dur: 1.1, type: 'triangle', gain: 0.2 }); noise({ dur: 0.5, gain: 0.2, filter: 800, delay: 0.9 }); },
  win()        { [523, 659, 784, 1046].forEach((f, i) => tone({ freq: f, dur: 0.35, type: 'triangle', gain: 0.2, delay: i * 0.11 })); },
  lose()       { [392, 349, 294, 196].forEach((f, i) => tone({ freq: f, dur: 0.45, type: 'sawtooth', gain: 0.16, delay: i * 0.14 })); },
  crumb()      { tone({ freq: 900, dur: 0.07, type: 'square', gain: 0.12 }); },
  spore()      { noise({ dur: 0.9, gain: 0.22, filter: 700 }); tone({ freq: 140, slideTo: 60, dur: 0.9, type: 'sine', gain: 0.12 }); },
  knife()      { tone({ freq: 2400, slideTo: 600, dur: 0.16, type: 'sawtooth', gain: 0.18 }); },
  ant()        { tone({ freq: 300, slideTo: 900, dur: 0.2, type: 'square', gain: 0.1 }); },
  alarm()      { for (let i = 0; i < 3; i++) tone({ freq: 880, dur: 0.16, type: 'square', gain: 0.16, delay: i * 0.22 }); },
};
