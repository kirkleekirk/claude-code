import * as THREE from 'three';

// Procedural sound design: every SFX is synthesised (Web Audio), pre-rendered
// offline into buffers with variations, then played through a 3D mix bus with
// convolution reverb and bus compression.

const SR = 44100;

function noiseData(len, kind = 'white', seed = 1) {
  const d = new Float32Array(len);
  let s = seed * 9301 + 49297;
  const rnd = () => { s = (s * 16807) % 2147483647; return (s / 2147483647) * 2 - 1; };
  if (kind === 'white') { for (let i = 0; i < len; i++) d[i] = rnd(); }
  else if (kind === 'pink') {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = rnd();
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
    }
  } else {
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * rnd()) / 1.02; d[i] = last * 3.5; }
  }
  return d;
}

class Synth {
  constructor(ctx) { this.c = ctx; this.noiseCache = {}; }
  noise(kind = 'white', dur = 2, seed = 1) {
    const key = kind + dur + seed;
    let b = this.noiseCache[key];
    if (!b) {
      const len = Math.ceil(dur * this.c.sampleRate);
      b = this.c.createBuffer(1, len, this.c.sampleRate);
      b.getChannelData(0).set(noiseData(len, kind, seed));
      this.noiseCache[key] = b;
    }
    const s = this.c.createBufferSource(); s.buffer = b; return s;
  }
  gain(v = 1) { const g = this.c.createGain(); g.gain.value = v; return g; }
  filt(type, f, Q = 0.7) { const b = this.c.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = Q; return b; }
  osc(type, f) { const o = this.c.createOscillator(); o.type = type; o.frequency.value = f; return o; }
  shaper(k = 2) {
    const ws = this.c.createWaveShaper();
    const n = 2048, curve = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; curve[i] = Math.tanh(x * k) / Math.tanh(k); }
    ws.curve = curve; ws.oversample = '2x';
    return ws;
  }
  /** envelope: points [[t, v], ...] relative to t0, exponential where possible */
  env(param, t0, pts, exp = true) {
    param.cancelScheduledValues(t0);
    param.setValueAtTime(pts[0][1], t0 + pts[0][0]);
    for (let i = 1; i < pts.length; i++) {
      const [t, v] = pts[i];
      if (exp && v > 0.0001 && pts[i - 1][1] > 0.0001) param.exponentialRampToValueAtTime(v, t0 + t);
      else param.linearRampToValueAtTime(v, t0 + t);
    }
  }
  /** amplitude envelope: attack, then exponential decay to silence */
  ad(param, t0, a, d, peak = 1, hold = 0) {
    param.setValueAtTime(0, t0);
    param.linearRampToValueAtTime(peak, t0 + a);
    if (hold) param.setValueAtTime(peak, t0 + a + hold);
    param.setTargetAtTime(0, t0 + a + hold, d / 4.5);
  }
  chain(...nodes) { for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]); return nodes[nodes.length - 1]; }
}

// ------------------------------------------------------------ recipes
// Each recipe: (S, out, t0, v) where v = variant index; returns duration.
const R = {};

function thump(S, out, t0, { f0 = 150, f1 = 45, dur = 0.25, sweep = 0.08, vol = 1, type = 'sine' } = {}) {
  const o = S.osc(type, f0), g = S.gain(0);
  S.env(o.frequency, t0, [[0, f0], [sweep, f1], [dur, f1 * 0.9]]);
  S.ad(g.gain, t0, 0.002, dur, vol);
  S.chain(o, g, out); o.start(t0); o.stop(t0 + dur + 0.3);
}
function burst(S, out, t0, { type = 'bandpass', f = 1500, Q = 1, dur = 0.08, vol = 1, kind = 'white', seed = 1, attack = 0.001, f1 = null } = {}) {
  const n = S.noise(kind, Math.max(0.5, dur + 0.5), seed), fl = S.filt(type, f, Q), g = S.gain(0);
  if (f1) S.env(fl.frequency, t0, [[0, f], [dur, f1]]);
  S.ad(g.gain, t0, attack, dur, vol);
  S.chain(n, fl, g, out); n.start(t0, Math.random() * 0.3); n.stop(t0 + dur + 0.4);
}
function sweepNoise(S, out, t0, { f0 = 400, f1 = 2400, f2 = null, dur = 0.25, Q = 1.2, vol = 0.8, kind = 'pink', attack = 0.08, seed = 3 } = {}) {
  const n = S.noise(kind, dur + 0.6, seed), fl = S.filt('bandpass', f0, Q), g = S.gain(0);
  const pts = f2 ? [[0, f0], [dur * 0.55, f1], [dur, f2]] : [[0, f0], [dur, f1]];
  S.env(fl.frequency, t0, pts);
  g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol, t0 + attack); g.gain.setTargetAtTime(0, t0 + attack, (dur - attack) / 3);
  S.chain(n, fl, g, out); n.start(t0, Math.random() * 0.4); n.stop(t0 + dur + 0.5);
}
function tone(S, out, t0, { f = 440, f1 = null, type = 'sine', a = 0.005, d = 0.4, vol = 0.5, vib = 0, vibF = 6, detune = 0 } = {}) {
  const o = S.osc(type, f), g = S.gain(0);
  o.detune.value = detune;
  if (f1) S.env(o.frequency, t0, [[0, f], [a + d, f1]]);
  if (vib) { const l = S.osc('sine', vibF), lg = S.gain(vib); l.connect(lg); lg.connect(o.frequency); l.start(t0); l.stop(t0 + a + d + 0.5); }
  S.ad(g.gain, t0, a, d, vol);
  S.chain(o, g, out); o.start(t0); o.stop(t0 + a + d + 0.6);
}
function clicks(S, out, t0, { n = 30, dur = 1, f = 3000, Q = 2, vol = 0.4, decay = true } = {}) {
  for (let i = 0; i < n; i++) {
    const t = t0 + Math.pow(Math.random(), decay ? 1.8 : 1) * dur;
    burst(S, out, t, { f: f * (0.6 + Math.random() * 0.9), Q, dur: 0.004 + Math.random() * 0.012, vol: vol * (decay ? 1 - (t - t0) / dur * 0.7 : 1) * (0.4 + Math.random() * 0.6), seed: i + 7 });
  }
}

R.punch_light = (S, out, t0, v) => {
  const p = 1 + (v - 1) * 0.07;
  const sh = S.shaper(2.2); sh.connect(out);
  thump(S, sh, t0, { f0: 170 * p, f1: 58 * p, dur: 0.2, vol: 1.0 });
  burst(S, sh, t0, { f: 1300 * p, Q: 0.8, dur: 0.06, vol: 0.9, seed: v });
  burst(S, out, t0, { type: 'highpass', f: 3800, Q: 0.5, dur: 0.012, vol: 0.55, seed: v + 9 });
  burst(S, out, t0 + 0.004, { f: 420, Q: 1.2, dur: 0.09, vol: 0.5, kind: 'pink', seed: v + 3 });
  return 0.45;
};
R.punch_heavy = (S, out, t0, v) => {
  const p = 1 + (v - 1) * 0.06;
  const sh = S.shaper(3); sh.connect(out);
  thump(S, sh, t0, { f0: 120 * p, f1: 36 * p, dur: 0.45, sweep: 0.12, vol: 1.15 });
  thump(S, out, t0, { f0: 60, f1: 30, dur: 0.6, sweep: 0.2, vol: 0.6 });
  burst(S, sh, t0, { f: 900 * p, Q: 0.7, dur: 0.12, vol: 1.0, seed: v + 1 });
  burst(S, out, t0, { type: 'highpass', f: 3000, dur: 0.018, vol: 0.7, seed: v + 2 });
  for (let i = 0; i < 4; i++) burst(S, out, t0 + 0.008 + i * 0.013 + Math.random() * 0.006, { f: 2200 + Math.random() * 1400, Q: 3, dur: 0.01, vol: 0.45, seed: v + 10 + i });
  burst(S, out, t0 + 0.01, { type: 'lowpass', f: 320, dur: 0.45, vol: 0.6, kind: 'brown', seed: v + 5 });
  return 0.9;
};
R.swing = (S, out, t0, v) => { sweepNoise(S, out, t0, { f0: 450, f1: 2600 + v * 200, f2: 900, dur: 0.2, Q: 1.6, vol: 2.2, attack: 0.07, seed: v }); return 0.35; };
R.swing_heavy = (S, out, t0, v) => { sweepNoise(S, out, t0, { f0: 220, f1: 1300 + v * 100, f2: 400, dur: 0.34, Q: 1.3, vol: 1.5, attack: 0.12, seed: v + 4 }); thump(S, out, t0 + 0.05, { f0: 90, f1: 50, dur: 0.25, vol: 0.4 }); return 0.5; };
R.sonic_boom = (S, out, t0, v) => {
  const sh = S.shaper(2.5); sh.connect(out);
  burst(S, sh, t0, { type: 'highpass', f: 700, dur: 0.03, vol: 1.2, seed: v });
  thump(S, sh, t0, { f0: 95, f1: 40, dur: 0.12, sweep: 0.05, vol: 1 });
  burst(S, sh, t0 + 0.085, { type: 'highpass', f: 600, dur: 0.035, vol: 1.1, seed: v + 1 });
  thump(S, out, t0 + 0.02, { f0: 58, f1: 26, dur: 1.9, sweep: 0.6, vol: 1.1 });
  burst(S, out, t0 + 0.03, { type: 'lowpass', f: 240, f1: 90, dur: 2.4, vol: 0.9, kind: 'brown', attack: 0.04, seed: v + 2 });
  sweepNoise(S, out, t0, { f0: 3000, f1: 400, dur: 0.9, Q: 0.6, vol: 0.5, attack: 0.01, kind: 'white', seed: v + 3 });
  return 2.8;
};
R.thunderclap = (S, out, t0, v) => {
  const sh = S.shaper(2.2); sh.connect(out);
  for (let i = 0; i < 4; i++) burst(S, sh, t0 + i * 0.006, { f: 1250, Q: 1.1, dur: 0.03, vol: 1.1 - i * 0.2, seed: v + i });
  burst(S, out, t0, { type: 'highpass', f: 2500, dur: 0.02, vol: 0.9, seed: v + 5 });
  thump(S, sh, t0 + 0.01, { f0: 80, f1: 30, dur: 1.4, sweep: 0.4, vol: 1.2 });
  burst(S, out, t0 + 0.04, { type: 'lowpass', f: 210, f1: 80, dur: 2.6, vol: 1.0, kind: 'brown', attack: 0.05, seed: v + 6 });
  clicks(S, out, t0 + 0.05, { n: 26, dur: 1.2, f: 1800, vol: 0.18 });
  return 3.2;
};
R.explosion = (S, out, t0, v) => {
  const sh = S.shaper(3.2); sh.connect(out);
  burst(S, sh, t0, { type: 'highpass', f: 900, dur: 0.04, vol: 1.3, seed: v });
  thump(S, sh, t0, { f0: 110, f1: 24, dur: 2.4, sweep: 0.5, vol: 1.35 });
  burst(S, sh, t0 + 0.005, { type: 'lowpass', f: 3200, f1: 140, dur: 1.8, vol: 1.1, kind: 'pink', attack: 0.01, seed: v + 1 });
  burst(S, out, t0 + 0.05, { type: 'lowpass', f: 160, f1: 60, dur: 3.2, vol: 1.0, kind: 'brown', attack: 0.06, seed: v + 2 });
  clicks(S, out, t0 + 0.1, { n: 70, dur: 1.8, f: 3200, vol: 0.3 });
  return 3.8;
};
R.ground_slam = (S, out, t0, v) => {
  const sh = S.shaper(2.8); sh.connect(out);
  burst(S, sh, t0, { type: 'highpass', f: 800, dur: 0.03, vol: 1.1, seed: v });
  thump(S, sh, t0, { f0: 120, f1: 30, dur: 1.2, sweep: 0.3, vol: 1.25 });
  burst(S, sh, t0, { type: 'lowpass', f: 2200, f1: 180, dur: 0.9, vol: 0.9, kind: 'pink', seed: v + 1 });
  burst(S, out, t0 + 0.03, { type: 'lowpass', f: 180, dur: 1.6, vol: 0.8, kind: 'brown', attack: 0.04, seed: v + 2 });
  clicks(S, out, t0 + 0.06, { n: 40, dur: 1.2, f: 2600, vol: 0.28 });
  return 2.2;
};
R.bolt_fire = (S, out, t0, v) => {
  const p = 1 + (v - 1) * 0.05;
  const car = S.osc('sine', 1250 * p), mod = S.osc('sine', 2875 * p), mg = S.gain(800), g = S.gain(0);
  S.env(car.frequency, t0, [[0, 1250 * p], [0.12, 480 * p]]);
  S.env(mod.frequency, t0, [[0, 2875 * p], [0.12, 1100 * p]]);
  S.env(mg.gain, t0, [[0, 900], [0.15, 20]]);
  mod.connect(mg); mg.connect(car.frequency);
  S.ad(g.gain, t0, 0.003, 0.16, 0.42);
  S.chain(car, g, out); car.start(t0); mod.start(t0); car.stop(t0 + 0.5); mod.stop(t0 + 0.5);
  tone(S, out, t0, { f: 2600 * p, f1: 3400 * p, type: 'sine', a: 0.004, d: 0.14, vol: 0.12, vib: 120, vibF: 31 });
  burst(S, out, t0, { f: 5200, Q: 0.8, dur: 0.035, vol: 0.32, seed: v });
  thump(S, out, t0, { f0: 260, f1: 110, dur: 0.08, vol: 0.35 });
  return 0.4;
};
R.bolt_hit = (S, out, t0, v) => {
  thump(S, out, t0, { f0: 480, f1: 150, dur: 0.07, sweep: 0.05, vol: 0.55 });
  burst(S, out, t0, { type: 'highpass', f: 5200, dur: 0.16, vol: 0.38, seed: v });
  tone(S, out, t0, { f: 1760 + v * 120, type: 'triangle', a: 0.002, d: 0.18, vol: 0.12 });
  return 0.35;
};
R.construct = (S, out, t0, v) => {
  sweepNoise(S, out, t0, { f0: 500, f1: 3200, dur: 0.35, Q: 2, vol: 0.5, attack: 0.15, kind: 'white', seed: v });
  [660, 990, 1320, 1760].forEach((f, i) => tone(S, out, t0 + i * 0.015, { f, type: 'sine', a: 0.01, d: 0.55, vol: 0.12, vib: 6, vibF: 7 }));
  thump(S, out, t0, { f0: 140, f1: 70, dur: 0.4, vol: 0.4 });
  return 0.9;
};
R.construct_hit = (S, out, t0, v) => {
  const sh = S.shaper(2); sh.connect(out);
  thump(S, sh, t0, { f0: 140, f1: 34, dur: 0.6, sweep: 0.15, vol: 1.1 });
  burst(S, sh, t0, { f: 1100, dur: 0.1, vol: 0.8, seed: v });
  tone(S, out, t0, { f: 1975, type: 'sine', a: 0.002, d: 0.5, vol: 0.25 });
  tone(S, out, t0, { f: 2960, type: 'sine', a: 0.002, d: 0.35, vol: 0.15 });
  burst(S, out, t0, { type: 'highpass', f: 6000, dur: 0.3, vol: 0.3, seed: v + 3 });
  return 1.0;
};
R.bubble_up = (S, out, t0, v) => {
  [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => { tone(S, out, t0 + i * 0.035, { f, type: 'sine', a: 0.03, d: 0.9, vol: 0.14, vib: 4, vibF: 5.5 }); tone(S, out, t0 + i * 0.035, { f: f * 2.003, type: 'sine', a: 0.02, d: 0.5, vol: 0.04 }); });
  sweepNoise(S, out, t0, { f0: 300, f1: 1400, dur: 0.4, Q: 0.7, vol: 0.35, attack: 0.2, seed: v });
  thump(S, out, t0 + 0.1, { f0: 120, f1: 70, dur: 0.5, vol: 0.4 });
  return 1.4;
};
R.bubble_hit = (S, out, t0, v) => {
  const p = 1 + (v - 2) * 0.06;
  tone(S, out, t0, { f: 2093 * p, type: 'sine', a: 0.001, d: 0.32, vol: 0.28 });
  tone(S, out, t0, { f: 3136 * p, type: 'sine', a: 0.001, d: 0.22, vol: 0.16 });
  tone(S, out, t0, { f: 4186 * p, type: 'sine', a: 0.001, d: 0.12, vol: 0.08 });
  burst(S, out, t0, { type: 'highpass', f: 4000, dur: 0.05, vol: 0.2, seed: v });
  return 0.5;
};
R.bubble_break = (S, out, t0, v) => {
  for (let i = 0; i < 46; i++) burst(S, out, t0 + Math.pow(Math.random(), 1.6) * 0.32, { f: 3000 + Math.random() * 6000, Q: 4, dur: 0.008 + Math.random() * 0.03, vol: 0.32, seed: i });
  tone(S, out, t0, { f: 2400, f1: 500, type: 'triangle', a: 0.002, d: 0.45, vol: 0.18 });
  thump(S, out, t0, { f0: 200, f1: 80, dur: 0.2, vol: 0.4 });
  return 0.8;
};
R.heal_pulse = (S, out, t0, v) => {
  const lp = S.filt('lowpass', 1600, 0.6); lp.connect(out);
  [220, 277.18, 329.63, 440, 554.37].forEach((f, i) => { tone(S, lp, t0, { f, type: 'sawtooth', a: 0.06, d: 1.5, vol: 0.06, detune: (i % 2 ? 7 : -7) }); tone(S, lp, t0, { f, type: 'triangle', a: 0.04, d: 1.3, vol: 0.06 }); });
  for (let i = 0; i < 9; i++) tone(S, out, t0 + 0.05 + Math.random() * 0.6, { f: 2000 + Math.random() * 2500, type: 'sine', a: 0.002, d: 0.25, vol: 0.05 });
  sweepNoise(S, out, t0, { f0: 600, f1: 2400, dur: 0.6, Q: 0.6, vol: 0.25, attack: 0.25, seed: v });
  return 1.9;
};
R.field = (S, out, t0, v) => {
  tone(S, out, t0, { f: 1800, f1: 160, type: 'sawtooth', a: 0.002, d: 0.35, vol: 0.16 });
  burst(S, out, t0, { f: 2400, Q: 1, dur: 0.15, vol: 0.4, seed: v });
  thump(S, out, t0, { f0: 180, f1: 60, dur: 0.4, vol: 0.6 });
  clicks(S, out, t0 + 0.02, { n: 50, dur: 1.4, f: 4200, Q: 3, vol: 0.18 });
  return 1.6;
};
R.crackle = (S, out, t0, v) => { clicks(S, out, t0, { n: 60, dur: 2, f: 3800, Q: 3, vol: 0.5, decay: false }); burst(S, out, t0, { f: 900, Q: 0.5, dur: 2, vol: 0.13, kind: 'pink', attack: 0.3, seed: v }); return 2; };
R.rock_rip = (S, out, t0, v) => {
  burst(S, out, t0, { type: 'lowpass', f: 300, dur: 0.6, vol: 0.9, kind: 'brown', attack: 0.02, seed: v });
  for (let i = 0; i < 18; i++) burst(S, out, t0 + Math.random() * 0.35, { f: 500 + Math.random() * 1200, Q: 2, dur: 0.02 + Math.random() * 0.04, vol: 0.5, seed: i + v });
  thump(S, out, t0, { f0: 90, f1: 40, dur: 0.5, vol: 0.7 });
  return 0.9;
};
R.rock_hit = (S, out, t0, v) => {
  const sh = S.shaper(2.4); sh.connect(out);
  thump(S, sh, t0, { f0: 130, f1: 35, dur: 0.7, sweep: 0.2, vol: 1.15 });
  burst(S, sh, t0, { type: 'lowpass', f: 2400, f1: 300, dur: 0.5, vol: 0.9, seed: v });
  for (let i = 0; i < 30; i++) burst(S, out, t0 + Math.pow(Math.random(), 1.5) * 0.7, { f: 900 + Math.random() * 2600, Q: 2.5, dur: 0.01 + Math.random() * 0.03, vol: 0.35, seed: i + 20 });
  return 1.2;
};
R.dash = (S, out, t0, v) => {
  burst(S, out, t0, { type: 'highpass', f: 900, dur: 0.03, vol: 0.9, seed: v });
  thump(S, out, t0, { f0: 110, f1: 45, dur: 0.35, vol: 0.8 });
  sweepNoise(S, out, t0, { f0: 300, f1: 4200, f2: 1200, dur: 0.42, Q: 1.1, vol: 0.85, attack: 0.04, kind: 'white', seed: v });
  return 0.7;
};
R.zip = (S, out, t0, v) => { sweepNoise(S, out, t0, { f0: 1200, f1: 6000, f2: 2000, dur: 0.16, Q: 1.5, vol: 0.7, attack: 0.02, kind: 'white', seed: v }); return 0.3; };
R.charge = (S, out, t0, v) => {
  const o = S.osc('sawtooth', 110), lp = S.filt('lowpass', 400, 3), g = S.gain(0);
  S.env(o.frequency, t0, [[0, 110], [1.3, 440]]);
  S.env(lp.frequency, t0, [[0, 300], [1.3, 4000]]);
  g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.25, t0 + 1.2); g.gain.linearRampToValueAtTime(0, t0 + 1.45);
  S.chain(o, lp, g, out); o.start(t0); o.stop(t0 + 1.5);
  sweepNoise(S, out, t0, { f0: 200, f1: 5000, dur: 1.35, Q: 2.5, vol: 0.35, attack: 1.2, kind: 'white', seed: v });
  return 1.6;
};
R.ult_ready = (S, out, t0, v) => {
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => { tone(S, out, t0 + i * 0.07, { f, type: 'triangle', a: 0.005, d: 0.6, vol: 0.18 }); tone(S, out, t0 + i * 0.07, { f: f * 2, type: 'sine', a: 0.005, d: 0.3, vol: 0.06 }); });
  thump(S, out, t0 + 0.28, { f0: 110, f1: 45, dur: 0.6, vol: 0.5 });
  return 1.2;
};
R.hitmark = (S, out, t0, v) => { tone(S, out, t0, { f: 2300, type: 'sine', a: 0.001, d: 0.045, vol: 0.3 }); burst(S, out, t0, { type: 'highpass', f: 5000, dur: 0.01, vol: 0.12, seed: v }); return 0.12; };
R.kill = (S, out, t0, v) => { tone(S, out, t0, { f: 880, type: 'triangle', a: 0.002, d: 0.18, vol: 0.3 }); tone(S, out, t0 + 0.09, { f: 1318.5, type: 'triangle', a: 0.002, d: 0.4, vol: 0.3 }); thump(S, out, t0, { f0: 140, f1: 55, dur: 0.3, vol: 0.5 }); return 0.7; };
R.step = (S, out, t0, v) => { thump(S, out, t0, { f0: 95, f1: 55, dur: 0.07, vol: 0.45 }); burst(S, out, t0, { f: 900 + v * 150, Q: 0.8, dur: 0.045, vol: 0.22, kind: 'pink', seed: v }); return 0.2; };
R.step_heavy = (S, out, t0, v) => { thump(S, out, t0, { f0: 80, f1: 38, dur: 0.18, vol: 0.85 }); burst(S, out, t0, { f: 600 + v * 100, Q: 0.8, dur: 0.06, vol: 0.32, kind: 'pink', seed: v }); burst(S, out, t0, { type: 'lowpass', f: 200, dur: 0.25, vol: 0.4, kind: 'brown', seed: v + 2 }); return 0.4; };
R.land = (S, out, t0, v) => { thump(S, out, t0, { f0: 110, f1: 40, dur: 0.3, vol: 0.9 }); burst(S, out, t0, { f: 700, Q: 0.6, dur: 0.12, vol: 0.4, kind: 'pink', seed: v }); burst(S, out, t0, { type: 'lowpass', f: 260, dur: 0.4, vol: 0.4, kind: 'brown', seed: v + 1 }); return 0.6; };
R.jump = (S, out, t0, v) => { sweepNoise(S, out, t0, { f0: 300, f1: 1600, dur: 0.22, Q: 1, vol: 1.4, attack: 0.05, seed: v }); return 0.3; };
R.takeoff = (S, out, t0, v) => { sweepNoise(S, out, t0, { f0: 200, f1: 2200, f2: 700, dur: 0.6, Q: 0.8, vol: 0.7, attack: 0.1, seed: v }); thump(S, out, t0, { f0: 90, f1: 40, dur: 0.4, vol: 0.5 }); return 0.9; };
R.death = (S, out, t0, v) => {
  thump(S, out, t0, { f0: 90, f1: 30, dur: 1.2, vol: 0.9 });
  [311, 294, 233].forEach((f, i) => tone(S, out, t0 + 0.05, { f, f1: f * 0.7, type: 'sawtooth', a: 0.02, d: 1.3, vol: 0.05 }));
  burst(S, out, t0, { type: 'lowpass', f: 400, dur: 0.8, vol: 0.5, kind: 'brown', seed: v });
  return 1.8;
};
R.respawn = (S, out, t0, v) => {
  const n = S.noise('white', 2, v), hp = S.filt('highpass', 6000, 0.7), g = S.gain(0);
  S.env(hp.frequency, t0, [[0, 6000], [0.8, 600]]);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.45, t0 + 0.75); g.gain.linearRampToValueAtTime(0, t0 + 0.85);
  S.chain(n, hp, g, out); n.start(t0); n.stop(t0 + 1);
  [440, 554.37, 659.25].forEach((f) => tone(S, out, t0 + 0.75, { f, type: 'triangle', a: 0.01, d: 0.8, vol: 0.12 }));
  thump(S, out, t0 + 0.75, { f0: 120, f1: 50, dur: 0.5, vol: 0.6 });
  return 1.7;
};
R.revive = (S, out, t0, v) => {
  [440, 554.37, 659.25, 880, 1108.7].forEach((f, i) => { tone(S, out, t0 + i * 0.06, { f, type: 'sine', a: 0.25, d: 1.8, vol: 0.1, vib: 3, vibF: 5 }); tone(S, out, t0 + i * 0.06, { f: f * 1.005, type: 'sine', a: 0.25, d: 1.6, vol: 0.06 }); });
  thump(S, out, t0 + 0.4, { f0: 70, f1: 45, dur: 0.25, vol: 0.8 });
  thump(S, out, t0 + 0.62, { f0: 70, f1: 45, dur: 0.3, vol: 0.9 });
  for (let i = 0; i < 14; i++) tone(S, out, t0 + Math.random() * 1.4, { f: 2500 + Math.random() * 3000, type: 'sine', a: 0.002, d: 0.3, vol: 0.04 });
  return 2.5;
};
R.unbound = (S, out, t0, v) => {
  // rising choir-like pad with formants + crackles, building to the burst 0.85 s in (unbound_burst,
  // played on the animation's burst event)
  const freqs = [110, 164.8, 220, 277.2, 329.6];
  const f1 = S.filt('bandpass', 730, 4), f2 = S.filt('bandpass', 1090, 5), mix = S.gain(0.73);
  f1.connect(mix); f2.connect(mix); mix.connect(out);
  for (const f of freqs) for (const d of [-9, 0, 9]) {
    const o = S.osc('sawtooth', f), g = S.gain(0);
    o.detune.value = d;
    S.env(o.frequency, t0, [[0, f * 0.5], [0.85, f]]);
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.05, t0 + 0.8); g.gain.setTargetAtTime(0, t0 + 1.0, 0.4);
    o.connect(g); g.connect(f1); g.connect(f2); o.start(t0); o.stop(t0 + 2.6);
  }
  clicks(S, out, t0 + 0.15, { n: 45, dur: 0.75, f: 4200, Q: 3, vol: 0.15, decay: false });
  return 2.6;
};
R.unbound_burst = (S, out, t0, v) => {
  const sh = S.shaper(2.5); sh.connect(out);
  thump(S, sh, t0, { f0: 100, f1: 28, dur: 1.6, sweep: 0.4, vol: 1.2 });
  burst(S, out, t0, { type: 'lowpass', f: 2600, f1: 200, dur: 1.4, vol: 0.7, kind: 'pink', seed: v });
  return 1.9;
};
R.beam_start = (S, out, t0, v) => {
  const sh = S.shaper(3); sh.connect(out);
  burst(S, sh, t0, { type: 'highpass', f: 1200, dur: 0.05, vol: 1.1, seed: v });
  thump(S, sh, t0, { f0: 140, f1: 38, dur: 1.0, vol: 1.1 });
  sweepNoise(S, out, t0, { f0: 6000, f1: 500, dur: 0.8, Q: 0.7, vol: 0.6, attack: 0.01, kind: 'white', seed: v });
  return 1.4;
};
R.beam_end = (S, out, t0, v) => { tone(S, out, t0, { f: 660, f1: 80, type: 'sawtooth', a: 0.01, d: 0.8, vol: 0.18 }); burst(S, out, t0, { type: 'lowpass', f: 1500, f1: 200, dur: 0.8, vol: 0.4, kind: 'pink', seed: v }); return 1.0; };
R.roar = (S, out, t0, v) => {
  const o = S.osc('sawtooth', 70), am = S.osc('sine', 28), amg = S.gain(0.5), g = S.gain(0), lp = S.filt('lowpass', 900, 2), fm = S.filt('bandpass', 650, 2.5);
  S.env(o.frequency, t0, [[0, 60], [0.25, 82], [1.1, 55]]);
  am.connect(amg); amg.connect(g.gain);
  g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.5, t0 + 0.12); g.gain.setTargetAtTime(0, t0 + 0.9, 0.2);
  S.chain(o, lp, fm, g, out); o.start(t0); am.start(t0); o.stop(t0 + 1.6); am.stop(t0 + 1.6);
  thump(S, out, t0, { f0: 90, f1: 32, dur: 1.1, vol: 0.9 });
  sweepNoise(S, out, t0, { f0: 200, f1: 1200, dur: 1.0, Q: 0.7, vol: 0.4, attack: 0.3, kind: 'brown', seed: v });
  return 1.8;
};
R.whistle = (S, out, t0, v) => { tone(S, out, t0, { f: 2400, f1: 380, type: 'sine', a: 0.1, d: 1.1, vol: 0.2, vib: 30, vibF: 9 }); sweepNoise(S, out, t0, { f0: 3000, f1: 600, dur: 1.2, Q: 3, vol: 0.3, attack: 0.6, kind: 'white', seed: v }); return 1.4; };
R.ui_click = (S, out, t0, v) => { tone(S, out, t0, { f: 1500, type: 'triangle', a: 0.001, d: 0.06, vol: 0.18 }); return 0.12; };
R.ui_hover = (S, out, t0, v) => { tone(S, out, t0, { f: 2400, type: 'sine', a: 0.001, d: 0.03, vol: 0.12 }); return 0.08; };
R.ui_select = (S, out, t0, v) => {
  sweepNoise(S, out, t0, { f0: 300, f1: 3000, dur: 0.4, Q: 1, vol: 0.45, attack: 0.2, kind: 'white', seed: v });
  [392, 523.25, 659.25, 783.99].forEach((f, i) => tone(S, out, t0 + 0.2 + i * 0.03, { f, type: 'triangle', a: 0.004, d: 0.7, vol: 0.12 }));
  thump(S, out, t0 + 0.2, { f0: 120, f1: 45, dur: 0.5, vol: 0.7 });
  return 1.1;
};
R.hurt = (S, out, t0, v) => { thump(S, out, t0, { f0: 160, f1: 60, dur: 0.15, vol: 0.5 }); burst(S, out, t0, { type: 'lowpass', f: 700, dur: 0.1, vol: 0.4, seed: v }); return 0.25; };
R.ready = (S, out, t0, v) => { tone(S, out, t0, { f: 1318.5, type: 'sine', a: 0.002, d: 0.2, vol: 0.12 }); tone(S, out, t0 + 0.05, { f: 1975.5, type: 'sine', a: 0.002, d: 0.25, vol: 0.08 }); return 0.4; };
R.denied = (S, out, t0, v) => { tone(S, out, t0, { f: 220, type: 'square', a: 0.002, d: 0.12, vol: 0.12 }); tone(S, out, t0 + 0.08, { f: 196, type: 'square', a: 0.002, d: 0.15, vol: 0.12 }); return 0.3; };

// ---------------- Robot ----------------
R.plasma_fire = (S, out, t0, v) => {
  // a punchy blaster: an FM zap sweeping down, a click and a little body
  const p = 1 + (v - 1) * 0.06;
  const car = S.osc('square', 900 * p), mod = S.osc('sine', 1350 * p), mg = S.gain(600), lp = S.filt('lowpass', 5000, 0.8), g = S.gain(0);
  S.env(car.frequency, t0, [[0, 900 * p], [0.09, 160 * p]]);
  S.env(mg.gain, t0, [[0, 700], [0.1, 10]]);
  mod.connect(mg); mg.connect(car.frequency);
  S.ad(g.gain, t0, 0.001, 0.11, 0.26);
  S.chain(car, lp, g, out); car.start(t0); mod.start(t0); car.stop(t0 + 0.3); mod.stop(t0 + 0.3);
  burst(S, out, t0, { type: 'highpass', f: 2500, dur: 0.012, vol: 0.4, seed: v });
  thump(S, out, t0, { f0: 180, f1: 70, dur: 0.08, vol: 0.45 });
  return 0.35;
};
R.plasma_hit = (S, out, t0, v) => {
  burst(S, out, t0, { f: 2200 + v * 300, Q: 1.2, dur: 0.05, vol: 0.5, seed: v });
  clicks(S, out, t0, { n: 6, dur: 0.08, f: 4200, vol: 0.25 });
  thump(S, out, t0, { f0: 220, f1: 90, dur: 0.06, vol: 0.3 });
  return 0.2;
};
R.missile_launch = (S, out, t0, v) => {
  burst(S, out, t0, { type: 'highpass', f: 1800, dur: 0.02, vol: 0.5, seed: v });
  sweepNoise(S, out, t0, { f0: 600, f1: 3200, f2: 1400, dur: 0.35, Q: 1.4, vol: 0.9, attack: 0.03, kind: 'white', seed: v + 1 });
  thump(S, out, t0, { f0: 140, f1: 70, dur: 0.12, vol: 0.4 });
  return 0.5;
};
R.missile_boom = (S, out, t0, v) => {
  const sh = S.shaper(2.6); sh.connect(out);
  burst(S, sh, t0, { type: 'highpass', f: 1200, dur: 0.02, vol: 0.9, seed: v });
  thump(S, sh, t0, { f0: 140, f1: 45, dur: 0.5, sweep: 0.15, vol: 0.9 });
  burst(S, sh, t0, { type: 'lowpass', f: 2600, f1: 240, dur: 0.5, vol: 0.7, kind: 'pink', seed: v + 1 });
  clicks(S, out, t0 + 0.02, { n: 14, dur: 0.4, f: 3200, vol: 0.2 });
  return 0.9;
};
R.pod_open = (S, out, t0, v) => {
  // two clacks and a servo whine
  burst(S, out, t0, { f: 1800, Q: 3, dur: 0.02, vol: 0.6, seed: v });
  burst(S, out, t0 + 0.07, { f: 1400, Q: 3, dur: 0.025, vol: 0.55, seed: v + 1 });
  tone(S, out, t0, { f: 520, f1: 980, type: 'sawtooth', a: 0.01, d: 0.12, vol: 0.05 });
  thump(S, out, t0 + 0.07, { f0: 160, f1: 90, dur: 0.07, vol: 0.35 });
  return 0.3;
};
R.barrier_up = (S, out, t0, v) => {
  // a hard-light wall: a rising hum, crystalline pings and a settling thrum
  const bp = S.filt('bandpass', 400, 2), g = S.gain(0); bp.connect(g); g.connect(out);
  for (const f of [110, 165, 220.5]) { const o = S.osc('sawtooth', f); S.env(o.frequency, t0, [[0, f * 0.7], [0.3, f]]); o.connect(bp); o.start(t0); o.stop(t0 + 1.2); }
  S.env(bp.frequency, t0, [[0, 300], [0.3, 2400], [1.0, 900]]);
  g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.22, t0 + 0.25); g.gain.setTargetAtTime(0, t0 + 0.4, 0.25);
  [1318.5, 1760, 2349.3, 2637].forEach((f, i) => tone(S, out, t0 + 0.05 + i * 0.045, { f, type: 'sine', a: 0.003, d: 0.5, vol: 0.07 }));
  sweepNoise(S, out, t0, { f0: 800, f1: 6000, dur: 0.3, Q: 2, vol: 0.3, attack: 0.25, kind: 'white', seed: v });
  thump(S, out, t0 + 0.22, { f0: 100, f1: 55, dur: 0.45, vol: 0.45 });
  return 1.3;
};
R.barrier_hit = (S, out, t0, v) => {
  tone(S, out, t0, { f: 1900 + v * 260, type: 'sine', a: 0.001, d: 0.22, vol: 0.12 });
  tone(S, out, t0, { f: 2850 + v * 300, type: 'sine', a: 0.001, d: 0.15, vol: 0.06 });
  burst(S, out, t0, { f: 3000, Q: 2, dur: 0.02, vol: 0.3, seed: v });
  thump(S, out, t0, { f0: 160, f1: 80, dur: 0.1, vol: 0.35 });
  return 0.4;
};
R.barrier_break = (S, out, t0, v) => {
  const sh = S.shaper(2); sh.connect(out);
  burst(S, sh, t0, { type: 'highpass', f: 2200, dur: 0.05, vol: 0.8, seed: v });
  clicks(S, out, t0, { n: 60, dur: 0.6, f: 5200, Q: 4, vol: 0.32 });
  [2637, 2093, 1568, 1175].forEach((f, i) => tone(S, out, t0 + i * 0.04, { f, f1: f * 0.6, type: 'triangle', a: 0.002, d: 0.4, vol: 0.06 }));
  thump(S, sh, t0, { f0: 130, f1: 50, dur: 0.4, vol: 0.6 });
  return 1.0;
};
R.emp_throw = (S, out, t0, v) => {
  // two armed-charge chirps over a crackling whoosh: the cue that an EMP is on its way
  tone(S, out, t0, { f: 1760, type: 'square', a: 0.002, d: 0.05, vol: 0.14 });
  tone(S, out, t0 + 0.09, { f: 1760, type: 'square', a: 0.002, d: 0.05, vol: 0.14 });
  sweepNoise(S, out, t0, { f0: 500, f1: 2000, dur: 0.2, Q: 1, vol: 1.1, attack: 0.05, seed: v });
  clicks(S, out, t0 + 0.02, { n: 12, dur: 0.3, f: 3200, Q: 5, vol: 0.22 });
  return 0.4;
};
R.emp_blast = (S, out, t0, v) => {
  // a crackling electric boom, then everything powering down
  const sh = S.shaper(3); sh.connect(out);
  burst(S, sh, t0, { type: 'highpass', f: 900, dur: 0.03, vol: 1, seed: v });
  thump(S, sh, t0, { f0: 120, f1: 35, dur: 0.9, sweep: 0.3, vol: 1 });
  clicks(S, out, t0, { n: 80, dur: 0.9, f: 3800, Q: 5, vol: 0.35 });
  tone(S, out, t0 + 0.02, { f: 2400, f1: 90, type: 'sawtooth', a: 0.01, d: 0.9, vol: 0.06 });
  tone(S, out, t0 + 0.02, { f: 1200, f1: 60, type: 'square', a: 0.01, d: 0.8, vol: 0.04 });
  burst(S, out, t0 + 0.01, { type: 'lowpass', f: 1400, f1: 200, dur: 0.7, vol: 0.5, kind: 'pink', seed: v + 2 });
  return 1.4;
};
R.drone_launch = (S, out, t0, v) => {
  // three rotor buzzes spinning up one after another
  for (let i = 0; i < 3; i++) {
    const t = t0 + i * 0.07, o = S.osc('sawtooth', 180 + i * 30), bp = S.filt('bandpass', 900 + i * 200, 3), g = S.gain(0);
    const am = S.osc('sine', 42 + i * 6), ag = S.gain(0.08);
    S.env(o.frequency, t, [[0, 180 + i * 30], [0.35, 420 + i * 60]]);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.12, t + 0.08); g.gain.setTargetAtTime(0, t + 0.3, 0.08);
    am.connect(ag); ag.connect(g.gain);
    S.chain(o, bp, g, out); o.start(t); am.start(t); o.stop(t + 0.7); am.stop(t + 0.7);
  }
  sweepNoise(S, out, t0, { f0: 400, f1: 2400, dur: 0.45, Q: 1.6, vol: 0.45, attack: 0.1, seed: v });
  return 0.9;
};
R.drone_heal = (S, out, t0, v) => {
  tone(S, out, t0, { f: 1568, f1: 2093, type: 'sine', a: 0.01, d: 0.18, vol: 0.08 });
  tone(S, out, t0 + 0.08, { f: 2349.3, type: 'sine', a: 0.01, d: 0.25, vol: 0.06 });
  return 0.45;
};
R.override = (S, out, t0, v) => {
  // the hack gathering: a climbing arpeggio of square blips, data stutter and a swelling hum, building
  // to the wave 0.78 s in (override_wave, played on the animation's wave event)
  const notes = [220, 277.2, 329.6, 440, 554.4, 659.3, 880, 1108.7];
  for (let i = 0; i < 16; i++) tone(S, out, t0 + i * 0.045, { f: notes[i % 8] * (i >= 8 ? 2 : 1), type: 'square', a: 0.002, d: 0.06, vol: 0.05 });
  const o = S.osc('sawtooth', 55), lp = S.filt('lowpass', 200, 6), g = S.gain(0);
  S.env(o.frequency, t0, [[0, 55], [0.75, 110]]); S.env(lp.frequency, t0, [[0, 200], [0.75, 2600]]);
  g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.28, t0 + 0.72); g.gain.setTargetAtTime(0, t0 + 0.78, 0.05);
  S.chain(o, lp, g, out); o.start(t0); o.stop(t0 + 1.2);
  clicks(S, out, t0 + 0.2, { n: 40, dur: 0.55, f: 2600, Q: 6, vol: 0.2, decay: false });
  return 1.2;
};
R.override_wave = (S, out, t0, v) => {
  const sh = S.shaper(2.6); sh.connect(out);
  burst(S, sh, t0, { type: 'highpass', f: 1000, dur: 0.03, vol: 1, seed: v });
  thump(S, sh, t0, { f0: 110, f1: 28, dur: 1.6, sweep: 0.45, vol: 1.2 });
  sweepNoise(S, out, t0, { f0: 6000, f1: 300, dur: 1.2, Q: 0.8, vol: 0.55, attack: 0.01, kind: 'white', seed: v + 1 });
  [880, 1318.5, 1760, 2637].forEach((f, i) => tone(S, out, t0 + 0.05 + i * 0.05, { f, type: 'sine', a: 0.01, d: 1.1, vol: 0.06, vib: 12, vibF: 9 }));
  clicks(S, out, t0 + 0.05, { n: 50, dur: 1.2, f: 3600, Q: 4, vol: 0.18 });
  return 2.2;
};
R.override_hit = (S, out, t0, v) => {
  // a digital glitch: stuttering square bursts
  [1200, 300, 1800, 450, 900, 2400].forEach((f, i) => tone(S, out, t0 + i * 0.028, { f, type: 'square', a: 0.001, d: 0.02, vol: 0.07 }));
  burst(S, out, t0, { f: 1500, Q: 0.8, dur: 0.12, vol: 0.35, seed: v });
  return 0.35;
};
R.overclock = (S, out, t0, v) => {
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(S, out, t0 + i * 0.05, { f, type: 'triangle', a: 0.004, d: 0.45, vol: 0.09 }));
  sweepNoise(S, out, t0, { f0: 600, f1: 4000, dur: 0.35, Q: 1.2, vol: 0.3, attack: 0.25, kind: 'white', seed: v });
  return 0.8;
};
R.bike_summon = (S, out, t0, v) => {
  // a jet streaking in, then the turbine catching
  sweepNoise(S, out, t0, { f0: 300, f1: 3000, f2: 900, dur: 0.5, Q: 0.9, vol: 0.8, attack: 0.35, kind: 'white', seed: v });
  const o = S.osc('sawtooth', 60), lp = S.filt('lowpass', 400, 2), g = S.gain(0);
  S.env(o.frequency, t0, [[0, 40], [0.5, 95]]); S.env(lp.frequency, t0, [[0, 200], [0.5, 1400]]);
  g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.25, t0 + 0.35); g.gain.setTargetAtTime(0, t0 + 0.45, 0.15);
  S.chain(o, lp, g, out); o.start(t0); o.stop(t0 + 1.2);
  tone(S, out, t0 + 0.1, { f: 700, f1: 1600, type: 'sine', a: 0.2, d: 0.4, vol: 0.05 });
  thump(S, out, t0 + 0.32, { f0: 110, f1: 55, dur: 0.3, vol: 0.4 });
  return 1.1;
};
R.bike_away = (S, out, t0, v) => {
  sweepNoise(S, out, t0, { f0: 2400, f1: 500, dur: 0.8, Q: 0.9, vol: 0.6, attack: 0.05, kind: 'white', seed: v });
  tone(S, out, t0, { f: 1500, f1: 500, type: 'sine', a: 0.02, d: 0.7, vol: 0.05 });
  return 1.0;
};
R.step_metal = (S, out, t0, v) => {
  thump(S, out, t0, { f0: 120, f1: 60, dur: 0.08, vol: 0.5 });
  burst(S, out, t0, { f: 1500 + v * 220, Q: 6, dur: 0.05, vol: 0.18, seed: v });
  tone(S, out, t0, { f: 2200 + v * 180, type: 'triangle', a: 0.001, d: 0.06, vol: 0.03 });
  burst(S, out, t0 + 0.02, { f: 700, Q: 1, dur: 0.04, vol: 0.12, kind: 'pink', seed: v + 3 });
  return 0.25;
};

const VARIANTS = { punch_light: 4, punch_heavy: 3, swing: 3, swing_heavy: 2, bolt_fire: 3, bolt_hit: 3, bubble_hit: 3, step: 4, step_heavy: 3, rock_hit: 2, zip: 2,
  plasma_fire: 3, plasma_hit: 3, missile_launch: 2, missile_boom: 2, barrier_hit: 3, step_metal: 4 };

export class AudioEngine {
  constructor() {
    this.ctx = null; this.buffers = {}; this.ready = false; this.volume = 0.8; this.listener = null;
    this.voices = 0; this.maxVoices = 40; this.lastPlay = {};
  }

  async init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC({ latencyHint: 'interactive' });
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = this.volume;
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -16; this.comp.knee.value = 10; this.comp.ratio.value = 5; this.comp.attack.value = 0.003; this.comp.release.value = 0.18;
    this.muffle = c.createBiquadFilter(); this.muffle.type = 'lowpass'; this.muffle.frequency.value = 20000;
    this.sfx = c.createGain(); this.sfx.gain.value = 1;
    this.reverb = c.createConvolver(); this.reverb.buffer = this.makeIR(2.6);
    this.revGain = c.createGain(); this.revGain.gain.value = 0.42;
    this.sfx.connect(this.muffle);
    this.reverb.connect(this.revGain); this.revGain.connect(this.muffle);
    this.muffle.connect(this.comp); this.comp.connect(this.master); this.master.connect(c.destination);
    this.ui = c.createGain(); this.ui.gain.value = 0.9; this.ui.connect(this.comp);
    this.listener = c.listener;
    await this.renderAll();
    this.startLoops();
    this.ready = true;
  }
  resume() { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume(); }
  setVolume(v) { this.volume = v; if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05); }

  makeIR(dur) {
    const c = this.ctx, len = Math.floor(dur * c.sampleRate);
    const b = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / c.sampleRate;
        const env = Math.pow(1 - i / len, 2.2) * Math.exp(-t * 1.6);
        const w = Math.random() * 2 - 1;
        const k = 0.15 + 0.8 * Math.exp(-t * 2.2); // darker tail
        lp = lp + (w - lp) * k;
        d[i] = lp * env * (i < 400 ? i / 400 : 1);
      }
    }
    return b;
  }

  async renderAll() {
    const jobs = [];
    for (const name in R) {
      const n = VARIANTS[name] || 1;
      this.buffers[name] = [];
      for (let v = 1; v <= n; v++) jobs.push(this.renderOne(name, v));
    }
    await Promise.all(jobs);
  }
  async renderOne(name, v) {
    // probe duration
    const dur = 4.2;
    const oc = new OfflineAudioContext(1, Math.ceil(dur * SR), SR);
    const S = new Synth(oc);
    const out = oc.createGain(); out.connect(oc.destination);
    const len = R[name](S, out, 0.005, v) + 0.1;
    const buf = await oc.startRendering();
    // trim + normalise peak
    const n = Math.min(buf.length, Math.ceil(len * SR));
    const data = buf.getChannelData(0).subarray(0, n);
    let peak = 0; for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(data[i]));
    const g = peak > 0.95 ? 0.95 / peak : 1;
    const outBuf = this.ctx.createBuffer(1, n, SR);
    const od = outBuf.getChannelData(0);
    for (let i = 0; i < n; i++) od[i] = data[i] * g * (i > n - 200 ? (n - i) / 200 : 1);
    this.buffers[name].push(outBuf);
  }

  /** listener follows camera */
  setListener(cam) {
    if (!this.ctx) return;
    const l = this.listener, p = cam.position;
    const f = cam.getWorldDirection(_f), u = _u.set(0, 1, 0).applyQuaternion(cam.quaternion);
    const t = this.ctx.currentTime;
    if (l.positionX) {
      l.positionX.setTargetAtTime(p.x, t, 0.02); l.positionY.setTargetAtTime(p.y, t, 0.02); l.positionZ.setTargetAtTime(p.z, t, 0.02);
      l.forwardX.setTargetAtTime(f.x, t, 0.02); l.forwardY.setTargetAtTime(f.y, t, 0.02); l.forwardZ.setTargetAtTime(f.z, t, 0.02);
      l.upX.setTargetAtTime(u.x, t, 0.02); l.upY.setTargetAtTime(u.y, t, 0.02); l.upZ.setTargetAtTime(u.z, t, 0.02);
    } else { l.setPosition(p.x, p.y, p.z); l.setOrientation(f.x, f.y, f.z, u.x, u.y, u.z); }
    this.camPos = p;
  }

  /**
   * play(name, { pos, vol, rate, ui, reverb, minGap })
   */
  play(name, o = {}) {
    if (!this.ready) return null;
    const list = this.buffers[name];
    if (!list || !list.length) return null;
    const now = this.ctx.currentTime;
    const gapKey = name + (o.key || '');
    if (o.minGap && this.lastPlay[gapKey] && now - this.lastPlay[gapKey] < o.minGap) return null;
    this.lastPlay[gapKey] = now;
    if (this.voices > this.maxVoices && !o.ui && !o.important) return null;
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = list[(Math.random() * list.length) | 0];
    src.playbackRate.value = (o.rate || 1) * (1 + (Math.random() - 0.5) * (o.jitter ?? 0.06));
    const g = c.createGain(); g.gain.value = o.vol ?? 1;
    src.connect(g);
    let tail = g;
    if (o.pos && !o.ui) {
      const pan = c.createPanner();
      pan.panningModel = 'equalpower'; pan.distanceModel = 'inverse';
      pan.refDistance = o.ref || 7; pan.rolloffFactor = o.rolloff ?? 1.1; pan.maxDistance = 400;
      if (pan.positionX) { pan.positionX.value = o.pos.x; pan.positionY.value = o.pos.y; pan.positionZ.value = o.pos.z; }
      else pan.setPosition(o.pos.x, o.pos.y, o.pos.z);
      // air absorption for distant sounds
      const d = this.camPos ? this.camPos.distanceTo(o.pos) : 0;
      if (d > 25) { const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.max(900, 18000 - d * 120); tail.connect(lp); tail = lp; }
      tail.connect(pan); tail = pan;
    }
    if (o.ui) tail.connect(this.ui);
    else {
      tail.connect(this.sfx);
      const rs = c.createGain(); rs.gain.value = o.reverb ?? 0.35; tail.connect(rs); rs.connect(this.reverb);
    }
    this.voices++;
    src.onended = () => { this.voices--; };
    src.start(now + (o.delay || 0));
    return { src, gain: g };
  }

  // ---------------- live loops ----------------
  startLoops() {
    const c = this.ctx;
    const nb = (kind, dur) => { const b = c.createBuffer(1, dur * c.sampleRate, c.sampleRate); b.getChannelData(0).set(noiseData(dur * c.sampleRate, kind, 77)); return b; };
    this.pinkBuf = nb('pink', 4); this.brownBuf = nb('brown', 4);
    // wind (flight)
    const w = {};
    w.src = c.createBufferSource(); w.src.buffer = this.pinkBuf; w.src.loop = true;
    w.bp = c.createBiquadFilter(); w.bp.type = 'bandpass'; w.bp.frequency.value = 500; w.bp.Q.value = 0.8;
    w.g = c.createGain(); w.g.gain.value = 0;
    w.src.connect(w.bp); w.bp.connect(w.g); w.g.connect(this.sfx);
    w.src2 = c.createBufferSource(); w.src2.buffer = this.brownBuf; w.src2.loop = true;
    w.lp = c.createBiquadFilter(); w.lp.type = 'lowpass'; w.lp.frequency.value = 300;
    w.g2 = c.createGain(); w.g2.gain.value = 0;
    w.src2.connect(w.lp); w.lp.connect(w.g2); w.g2.connect(this.sfx);
    w.src.start(); w.src2.start();
    this.wind = w;
  }
  setWind(speed, boost = 0) {
    if (!this.ready) return;
    const t = this.ctx.currentTime, w = this.wind;
    const k = Math.min(1, speed / 40);
    w.g.gain.setTargetAtTime(Math.min(0.5, k * 0.45 + boost * 0.15), t, 0.12);
    w.bp.frequency.setTargetAtTime(350 + k * 1500 + boost * 800, t, 0.15);
    w.g2.gain.setTargetAtTime(Math.min(0.6, Math.max(0, k - 0.3) * 0.7 + boost * 0.3), t, 0.15);
    w.lp.frequency.setTargetAtTime(200 + k * 500, t, 0.15);
  }
  /** continuous beam / hum voice; returns controller */
  beamVoice(pos) {
    if (!this.ready) return { set() {}, stop() {} };
    const c = this.ctx, t = c.currentTime;
    const out = c.createGain(); out.gain.value = 0;
    const pan = c.createPanner(); pan.panningModel = 'equalpower'; pan.refDistance = 10; pan.rolloffFactor = 0.8;
    out.connect(pan); pan.connect(this.sfx);
    const rs = c.createGain(); rs.gain.value = 0.3; pan.connect(rs); rs.connect(this.reverb);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400; lp.Q.value = 4;
    const sh = c.createWaveShaper(); { const n = 1024, cv = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; cv[i] = Math.tanh(x * 2.5); } sh.curve = cv; }
    lp.connect(sh); sh.connect(out);
    const oscs = [55, 110.4, 164.6, 220.8].map((f, i) => { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = (i - 1.5) * 8; const g = c.createGain(); g.gain.value = 0.22; o.connect(g); g.connect(lp); o.start(); return o; });
    const lfo = c.createOscillator(); lfo.frequency.value = 7; const lg = c.createGain(); lg.gain.value = 500; lfo.connect(lg); lg.connect(lp.frequency); lfo.start();
    const n = c.createBufferSource(); n.buffer = this.pinkBuf; n.loop = true;
    const nb = c.createBiquadFilter(); nb.type = 'bandpass'; nb.frequency.value = 1600; nb.Q.value = 0.9;
    const ng = c.createGain(); ng.gain.value = 0.9; n.connect(nb); nb.connect(ng); ng.connect(out); n.start();
    const whine = c.createOscillator(); whine.type = 'sine'; whine.frequency.value = 1760; const wg = c.createGain(); wg.gain.value = 0.05; whine.connect(wg); wg.connect(out); whine.start();
    out.gain.setTargetAtTime(0.75, t, 0.08);
    const setPos = (p) => { if (pan.positionX) { pan.positionX.setTargetAtTime(p.x, c.currentTime, 0.03); pan.positionY.setTargetAtTime(p.y, c.currentTime, 0.03); pan.positionZ.setTargetAtTime(p.z, c.currentTime, 0.03); } };
    if (pos) setPos(pos);
    return {
      set: (p, power = 1) => { if (p) setPos(p); out.gain.setTargetAtTime(0.75 * power, c.currentTime, 0.05); },
      stop: () => {
        const tt = c.currentTime; out.gain.setTargetAtTime(0, tt, 0.12);
        setTimeout(() => { [...oscs, lfo, n, whine].forEach((o) => { try { o.stop(); } catch (e) { /* stopped */ } }); out.disconnect(); }, 900);
      },
    };
  }
  /** the hoverbike's turbine: a low hum and a whine that climb with speed; returns controller */
  engineVoice(pos) {
    if (!this.ready) return { set() {}, stop() {} };
    const c = this.ctx, t = c.currentTime;
    const out = c.createGain(); out.gain.value = 0;
    const pan = c.createPanner(); pan.panningModel = 'equalpower'; pan.refDistance = 6; pan.rolloffFactor = 1.1;
    out.connect(pan); pan.connect(this.sfx);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500; lp.Q.value = 1.5; lp.connect(out);
    const hum = [62, 93.5].map((f, i) => { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = i ? 7 : -7; const g = c.createGain(); g.gain.value = 0.18; o.connect(g); g.connect(lp); o.start(); return o; });
    const whine = c.createOscillator(); whine.type = 'sine'; whine.frequency.value = 900; const wg = c.createGain(); wg.gain.value = 0.035; whine.connect(wg); wg.connect(out); whine.start();
    const n = c.createBufferSource(); n.buffer = this.pinkBuf; n.loop = true;
    const nb = c.createBiquadFilter(); nb.type = 'bandpass'; nb.frequency.value = 1200; nb.Q.value = 0.7;
    const ng = c.createGain(); ng.gain.value = 0.25; n.connect(nb); nb.connect(ng); ng.connect(out); n.start();
    out.gain.setTargetAtTime(0.4, t, 0.15);
    const setPos = (p) => { if (pan.positionX) { pan.positionX.setTargetAtTime(p.x, c.currentTime, 0.03); pan.positionY.setTargetAtTime(p.y, c.currentTime, 0.03); pan.positionZ.setTargetAtTime(p.z, c.currentTime, 0.03); } };
    if (pos) setPos(pos);
    return {
      set: (p, k = 0, boost = 0) => {
        const tt = c.currentTime;
        if (p) setPos(p);
        lp.frequency.setTargetAtTime(400 + k * 1400 + boost * 800, tt, 0.1);
        whine.frequency.setTargetAtTime(800 + k * 900 + boost * 500, tt, 0.1);
        hum[0].frequency.setTargetAtTime(62 + k * 30, tt, 0.15); hum[1].frequency.setTargetAtTime(93.5 + k * 45, tt, 0.15);
        ng.gain.setTargetAtTime(0.2 + k * 0.5, tt, 0.1);
        out.gain.setTargetAtTime(0.35 + k * 0.25, tt, 0.1);
      },
      stop: () => {
        out.gain.setTargetAtTime(0, c.currentTime, 0.1);
        setTimeout(() => { [...hum, whine, n].forEach((o) => { try { o.stop(); } catch (e) { /* stopped */ } }); out.disconnect(); }, 700);
      },
    };
  }
  setMuffle(k) { if (this.muffle) this.muffle.frequency.setTargetAtTime(20000 - k * 18500, this.ctx.currentTime, 0.1); }
}

const _f = new THREE.Vector3();
const _u = new THREE.Vector3();
