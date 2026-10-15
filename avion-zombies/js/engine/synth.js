// Procedural sound design. Everything here is rendered once at load time with
// OfflineAudioContext, so the runtime only ever plays plain AudioBuffers.

const SR = 44100;

let noiseBuf = null;
function noiseBuffer() {
  if (noiseBuf) return noiseBuf;
  const len = SR * 4;
  noiseBuf = new AudioBuffer({ length: len, numberOfChannels: 2, sampleRate: SR });
  for (let c = 0; c < 2; c++) {
    const d = noiseBuf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

async function render(duration, build, channels = 1) {
  const ctx = new OfflineAudioContext(channels, Math.ceil(duration * SR), SR);
  build(ctx, ctx.destination, duration);
  return ctx.startRendering();
}

// --- tiny graph helpers -------------------------------------------------------------------

function gainNode(ctx, value = 1) {
  const g = ctx.createGain();
  g.gain.value = value;
  return g;
}

function env(param, t0, points) {
  // points: [[time, value, 'lin'|'exp'|'set'], ...] relative to t0
  param.setValueAtTime(points[0][1], t0 + points[0][0]);
  for (let i = 1; i < points.length; i++) {
    const [t, v, mode] = points[i];
    if (mode === 'exp') param.exponentialRampToValueAtTime(Math.max(v, 0.0001), t0 + t);
    else if (mode === 'set') param.setValueAtTime(v, t0 + t);
    else param.linearRampToValueAtTime(v, t0 + t);
  }
}

function osc(ctx, type, freq, t0 = 0, t1 = null) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  o.start(t0);
  if (t1 != null) o.stop(t1);
  return o;
}

function noise(ctx, t0 = 0, t1 = null, offset = Math.random() * 2) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuffer();
  s.loop = true;
  s.start(t0, offset);
  if (t1 != null) s.stop(t1);
  return s;
}

function filter(ctx, type, freq, q = 0.7) {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
}

function chain(...nodes) {
  for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
  return nodes[nodes.length - 1];
}

function shaper(ctx, amount = 2) {
  const ws = ctx.createWaveShaper();
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * amount) / Math.tanh(amount);
  }
  ws.curve = curve;
  return ws;
}

function bell(ctx, out, t, freq, dur, vol = 0.3, ratios = [1, 2.76, 5.4, 8.93]) {
  ratios.forEach((r, i) => {
    const o = osc(ctx, 'sine', freq * r, t, t + dur);
    const g = gainNode(ctx, 0);
    env(g.gain, t, [[0, 0], [0.004, vol / (i + 1)], [dur * (1 - i * 0.18), 0.0001, 'exp']]);
    chain(o, g, out);
  });
}

function tone(ctx, out, t, freq, dur, { type = 'sine', vol = 0.3, attack = 0.005, release = null, lp = null, detune = 0 } = {}) {
  const o = osc(ctx, type, freq, t, t + dur + 0.05);
  o.detune.value = detune;
  const g = gainNode(ctx, 0);
  env(g.gain, t, [[0, 0], [attack, vol], [dur, 0.0001, 'exp']]);
  if (release != null) g.gain.setTargetAtTime(0, t + release, 0.05);
  if (lp) chain(o, filter(ctx, 'lowpass', lp), g, out);
  else chain(o, g, out);
  return o;
}

function noiseBurst(ctx, out, t, dur, { type = 'lowpass', freq = 1000, q = 0.7, vol = 0.5, attack = 0.002, sweepTo = null } = {}) {
  const n = noise(ctx, t, t + dur + 0.05);
  const f = filter(ctx, type, freq, q);
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
  const g = gainNode(ctx, 0);
  env(g.gain, t, [[0, 0], [attack, vol], [dur, 0.0001, 'exp']]);
  chain(n, f, g, out);
  return f;
}

// Seamless loop: render longer, then crossfade the tail into the head.
function makeLoop(buf, fade) {
  const n = Math.floor(fade * buf.sampleRate);
  const len = buf.length - n;
  const out = new AudioBuffer({ length: len, numberOfChannels: buf.numberOfChannels, sampleRate: buf.sampleRate });
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const src = buf.getChannelData(c);
    const dst = out.getChannelData(c);
    for (let i = 0; i < len; i++) dst[i] = src[i];
    for (let i = 0; i < n; i++) {
      const a = i / n;
      dst[i] = src[i] * a + src[len + i] * (1 - a);
    }
  }
  return out;
}

// ------------------------------------------------------------------------------------------
// Recipes
// ------------------------------------------------------------------------------------------

const R = {};

R.ui_hover = () => render(0.06, (ctx, out) => {
  tone(ctx, out, 0, 2600, 0.04, { vol: 0.12 });
  noiseBurst(ctx, out, 0, 0.015, { type: 'highpass', freq: 5000, vol: 0.06 });
});

R.ui_click = () => render(0.16, (ctx, out) => {
  tone(ctx, out, 0, 140, 0.1, { type: 'square', vol: 0.18, lp: 900 });
  tone(ctx, out, 0, 1200, 0.05, { vol: 0.12 });
  noiseBurst(ctx, out, 0, 0.02, { type: 'bandpass', freq: 3000, vol: 0.2 });
});

R.ui_back = () => render(0.16, (ctx, out) => {
  const o = tone(ctx, out, 0, 900, 0.12, { vol: 0.15 });
  o.frequency.exponentialRampToValueAtTime(420, 0.12);
});

R.buy = () => render(0.7, (ctx, out) => {
  noiseBurst(ctx, out, 0, 0.08, { type: 'lowpass', freq: 900, vol: 0.6 });
  tone(ctx, out, 0, 70, 0.12, { vol: 0.5 });
  bell(ctx, out, 0.06, 1318, 0.5, 0.25);
  bell(ctx, out, 0.16, 1760, 0.45, 0.22);
  noiseBurst(ctx, out, 0.05, 0.03, { type: 'bandpass', freq: 4000, vol: 0.25 });
});

R.deny = () => render(0.42, (ctx, out) => {
  for (let i = 0; i < 2; i++) {
    const t = i * 0.17;
    tone(ctx, out, t, 98, 0.13, { type: 'square', vol: 0.22, lp: 700 });
    tone(ctx, out, t, 104, 0.13, { type: 'square', vol: 0.18, lp: 700 });
  }
});

R.hitmarker = () => render(0.06, (ctx, out) => {
  noiseBurst(ctx, out, 0, 0.025, { type: 'highpass', freq: 3500, vol: 0.5 });
  tone(ctx, out, 0, 3800, 0.03, { vol: 0.15 });
});

R.hit_kill = () => render(0.14, (ctx, out) => {
  noiseBurst(ctx, out, 0, 0.03, { type: 'highpass', freq: 2500, vol: 0.5 });
  tone(ctx, out, 0, 150, 0.1, { vol: 0.5 });
});

R.headshot = () => render(0.3, (ctx, out) => {
  noiseBurst(ctx, out, 0, 0.12, { type: 'bandpass', freq: 1700, q: 1.2, vol: 0.9 });
  tone(ctx, out, 0, 95, 0.18, { vol: 0.6 });
  noiseBurst(ctx, out, 0.02, 0.2, { type: 'bandpass', freq: 700, q: 3, vol: 0.35 });
});

R.door_open = () => render(1.9, (ctx, out) => {
  const o = osc(ctx, 'sawtooth', 190, 0, 1.4);
  o.frequency.linearRampToValueAtTime(330, 1.2);
  const g = gainNode(ctx, 0);
  env(g.gain, 0, [[0, 0], [0.1, 0.12], [1.15, 0.1], [1.4, 0]]);
  chain(o, filter(ctx, 'bandpass', 900, 2), g, out);
  noiseBurst(ctx, out, 0, 0.9, { type: 'highpass', freq: 3500, vol: 0.18, attack: 0.05 });
  noiseBurst(ctx, out, 1.35, 0.4, { type: 'lowpass', freq: 500, vol: 0.8 });
  tone(ctx, out, 1.35, 60, 0.35, { vol: 0.6 });
  bell(ctx, out, 1.37, 210, 0.4, 0.08);
});

R.debris = () => render(2.2, (ctx, out) => {
  noiseBurst(ctx, out, 0, 1.9, { type: 'lowpass', freq: 220, vol: 0.9, attack: 0.05 });
  for (let i = 0; i < 14; i++) {
    const t = Math.random() * 1.5;
    noiseBurst(ctx, out, t, 0.08 + Math.random() * 0.1, { type: 'bandpass', freq: 400 + Math.random() * 900, q: 2, vol: 0.35 });
  }
  tone(ctx, out, 0, 45, 1.2, { vol: 0.5 });
});

R.power_on = () => render(4.2, (ctx, out) => {
  noiseBurst(ctx, out, 0, 0.6, { type: 'lowpass', freq: 600, vol: 1.0 });
  const sub = tone(ctx, out, 0, 70, 1.4, { vol: 0.9 });
  sub.frequency.exponentialRampToValueAtTime(32, 1.4);
  const hum = osc(ctx, 'sawtooth', 38, 0.3, 4.2);
  hum.frequency.exponentialRampToValueAtTime(118, 3.0);
  const lp = filter(ctx, 'lowpass', 120, 2);
  lp.frequency.exponentialRampToValueAtTime(2200, 3.2);
  const g = gainNode(ctx, 0);
  env(g.gain, 0.3, [[0, 0], [1.2, 0.25], [3.0, 0.28], [3.9, 0]]);
  chain(hum, lp, g, out);
  for (let i = 0; i < 26; i++) {
    const t = 0.2 + Math.random() * 3.2;
    noiseBurst(ctx, out, t, 0.01 + Math.random() * 0.03, { type: 'highpass', freq: 2500, vol: 0.4 });
  }
  bell(ctx, out, 3.0, 440, 1.0, 0.1);
});

R.power_hum = async () => makeLoop(await render(4.5, (ctx, out) => {
  const g = gainNode(ctx, 0.2);
  [60, 120, 180, 240].forEach((f, i) => chain(osc(ctx, i ? 'sine' : 'sawtooth', f), gainNode(ctx, 0.4 / (i + 1)), g));
  chain(g, filter(ctx, 'lowpass', 500), out);
}), 0.5);

R.perk_buy = () => render(1.6, (ctx, out) => {
  const o = osc(ctx, 'sawtooth', 220, 0, 0.6);
  o.frequency.linearRampToValueAtTime(440, 0.5);
  const g = gainNode(ctx, 0);
  env(g.gain, 0, [[0, 0], [0.05, 0.1], [0.55, 0]]);
  chain(o, filter(ctx, 'bandpass', 1200, 3), g, out);
  noiseBurst(ctx, out, 0.5, 0.45, { type: 'highpass', freq: 4000, vol: 0.3, attack: 0.02 });
  [0, 0.12, 0.24].forEach((t, i) => tone(ctx, out, 0.75 + t, [880, 1108, 1318][i], 0.3, { type: 'triangle', vol: 0.2 }));
  tone(ctx, out, 0.5, 60, 0.3, { vol: 0.4 });
});

// Each Exo upgrade machine gets its own little retro-synth jingle.
const JINGLES = {
  health: { tempo: 0.16, notes: [57, 60, 64, 62, 60, 57, 55, 57, 0, 64, 64, 62, 60], bass: [45, 45, 43, 45] },
  reload: { tempo: 0.12, notes: [69, 71, 72, 74, 72, 71, 69, 0, 69, 71, 72, 76, 74, 72], bass: [45, 48, 50, 45] },
  medic: { tempo: 0.18, notes: [64, 67, 71, 69, 67, 64, 66, 67, 0, 71, 72, 71], bass: [40, 43, 47, 40] },
  slam: { tempo: 0.14, notes: [52, 52, 55, 52, 58, 57, 55, 0, 52, 52, 55, 52, 59, 58], bass: [40, 40, 43, 40] },
  stabilizer: { tempo: 0.15, notes: [62, 66, 69, 66, 62, 66, 69, 74, 73, 71, 69], bass: [50, 47, 45, 50] },
  velocity: { tempo: 0.11, notes: [72, 74, 76, 79, 76, 74, 72, 0, 72, 74, 76, 81, 79, 76], bass: [48, 52, 55, 48] },
};
const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
for (const [name, j] of Object.entries(JINGLES)) {
  R['jingle_' + name] = () => {
    const len = j.notes.length * j.tempo + 1.2;
    return render(len, (ctx, out) => {
      const bus = gainNode(ctx, 0.9);
      bus.connect(out);
      j.notes.forEach((n, i) => {
        if (!n) return;
        const t = i * j.tempo;
        tone(ctx, bus, t, midi(n), j.tempo * 1.6, { type: 'square', vol: 0.09, lp: 2600 });
        tone(ctx, bus, t, midi(n + 12), j.tempo * 1.2, { type: 'triangle', vol: 0.05 });
      });
      j.bass.forEach((n, i) => {
        const t = i * (len - 1.2) / j.bass.length;
        tone(ctx, bus, t, midi(n - 12), (len - 1.2) / j.bass.length, { type: 'triangle', vol: 0.22 });
      });
      bell(ctx, bus, len - 1.15, midi(j.notes[j.notes.length - 1] || 60), 1.1, 0.1);
    });
  };
}

R.box_open = () => render(0.9, (ctx, out) => {
  noiseBurst(ctx, out, 0, 0.6, { type: 'highpass', freq: 2500, vol: 0.25, attack: 0.03 });
  tone(ctx, out, 0.5, 55, 0.3, { vol: 0.6 });
  noiseBurst(ctx, out, 0.5, 0.15, { type: 'lowpass', freq: 700, vol: 0.6 });
});

R.box_spin = () => render(4.6, (ctx, out) => {
  const whirr = osc(ctx, 'sawtooth', 80, 0, 4.4);
  whirr.frequency.linearRampToValueAtTime(140, 4.2);
  const g = gainNode(ctx, 0);
  env(g.gain, 0, [[0, 0], [0.2, 0.09], [4.1, 0.09], [4.4, 0]]);
  chain(whirr, filter(ctx, 'lowpass', 600), g, out);
  for (let t = 0.1; t < 4.2; t += 0.09) {
    const f = 700 + Math.random() * 1400;
    tone(ctx, out, t, f, 0.05, { type: 'square', vol: 0.035, lp: 3000 });
  }
  bell(ctx, out, 4.25, 1568, 0.35, 0.18);
});

R.box_ready = () => render(0.9, (ctx, out) => {
  bell(ctx, out, 0, 1046, 0.8, 0.2);
  bell(ctx, out, 0.1, 1568, 0.7, 0.15);
});

R.box_glitch = () => render(1.8, (ctx, out) => {
  const o = osc(ctx, 'square', 900, 0, 1.6);
  o.frequency.exponentialRampToValueAtTime(40, 1.5);
  const g = gainNode(ctx, 0);
  env(g.gain, 0, [[0, 0], [0.02, 0.15], [1.5, 0]]);
  chain(o, filter(ctx, 'lowpass', 1800), g, out);
  for (let i = 0; i < 20; i++) {
    noiseBurst(ctx, out, Math.random() * 1.5, 0.02 + Math.random() * 0.05, { type: 'bandpass', freq: 500 + Math.random() * 4000, q: 4, vol: 0.4 });
  }
});

R.upgrade = () => render(3.8, (ctx, out) => {
  const o = osc(ctx, 'sawtooth', 90, 0, 3.4);
  o.frequency.exponentialRampToValueAtTime(880, 3.2);
  const lfo = osc(ctx, 'sine', 9);
  const lfoG = gainNode(ctx, 0.06);
  const g = gainNode(ctx, 0);
  env(g.gain, 0, [[0, 0], [0.3, 0.1], [3.1, 0.16], [3.3, 0]]);
  chain(lfo, lfoG);
  lfoG.connect(g.gain);
  const lp = filter(ctx, 'lowpass', 300, 4);
  lp.frequency.exponentialRampToValueAtTime(5000, 3.2);
  chain(o, lp, g, out);
  noiseBurst(ctx, out, 3.2, 0.5, { type: 'bandpass', freq: 2500, q: 1, vol: 0.6 });
  const zap = tone(ctx, out, 3.2, 2400, 0.4, { type: 'sawtooth', vol: 0.2, lp: 5000 });
  zap.frequency.exponentialRampToValueAtTime(120, 3.6);
  tone(ctx, out, 3.25, 50, 0.5, { vol: 0.7 });
});

R.powerup_spawn = () => render(1.4, (ctx, out) => {
  [880, 1320, 1760, 2217].forEach((f, i) => {
    const o = tone(ctx, out, i * 0.05, f, 1.2, { vol: 0.07, attack: 0.08 });
    const v = osc(ctx, 'sine', 6 + i);
    const vg = gainNode(ctx, 12);
    chain(v, vg, o.frequency);
  });
});

R.powerup_loop = async () => makeLoop(await render(3.4, (ctx, out) => {
  const g = gainNode(ctx, 0.08);
  [330, 494.5, 660].forEach((f) => {
    const o = osc(ctx, 'sine', f);
    const v = osc(ctx, 'sine', 0.8 + Math.random());
    const vg = gainNode(ctx, 3);
    chain(v, vg, o.frequency);
    chain(o, g);
  });
  g.connect(out);
}), 0.4);

R.powerup_grab = () => render(1.0, (ctx, out) => {
  [523, 659, 784, 1046].forEach((f, i) => tone(ctx, out, i * 0.03, f, 0.9, { type: 'triangle', vol: 0.12 }));
  noiseBurst(ctx, out, 0, 0.3, { type: 'highpass', freq: 6000, vol: 0.12 });
});

R.round_start = () => render(5.0, (ctx, out) => {
  const bus = gainNode(ctx, 1);
  const ws = shaper(ctx, 1.6);
  chain(bus, ws, filter(ctx, 'lowpass', 1800), out);
  [55, 82.4, 110, 65.4].forEach((f, i) => {
    const o = osc(ctx, 'sawtooth', f, 0, 4.8);
    o.detune.value = (i - 1.5) * 7;
    const g = gainNode(ctx, 0);
    env(g.gain, 0, [[0, 0], [0.9, 0.16], [2.6, 0.12], [4.6, 0.0001, 'exp']]);
    const lp = filter(ctx, 'lowpass', 200, 1);
    lp.frequency.linearRampToValueAtTime(1200, 1.0);
    lp.frequency.linearRampToValueAtTime(300, 4.5);
    chain(o, lp, g, bus);
  });
  bell(ctx, out, 0.85, 196, 3.5, 0.2, [1, 2.4, 4.1, 6.3, 8.9]);
  noiseBurst(ctx, out, 0.85, 1.6, { type: 'bandpass', freq: 400, q: 0.6, vol: 0.3 });
  tone(ctx, out, 0.85, 41, 2.0, { vol: 0.7 });
});

R.round_end = () => render(5.5, (ctx, out) => {
  const notes = [69, 68, 64, 63, 57];
  notes.forEach((n, i) => bell(ctx, out, 0.4 + i * 0.42, midi(n), 2.4, 0.12, [1, 2.0, 3.01, 4.2]));
  const pad = gainNode(ctx, 0);
  env(pad.gain, 0, [[0, 0], [1.5, 0.12], [4.0, 0.08], [5.4, 0]]);
  [45, 52, 57, 60].forEach((n) => {
    const o = osc(ctx, 'sawtooth', midi(n), 0, 5.5);
    o.detune.value = Math.random() * 14 - 7;
    chain(o, filter(ctx, 'bandpass', 700, 0.8), pad);
  });
  pad.connect(out);
});

R.swarm_horn = () => render(4.5, (ctx, out) => {
  const bus = gainNode(ctx, 0.9);
  chain(bus, shaper(ctx, 3), filter(ctx, 'lowpass', 900), out);
  [43.6, 87.3, 130.8].forEach((f, i) => {
    const o = osc(ctx, 'sawtooth', f, 0, 4.4);
    o.detune.value = i * 5;
    const g = gainNode(ctx, 0);
    env(g.gain, 0, [[0, 0], [0.25, 0.3], [2.5, 0.25], [4.3, 0.0001, 'exp']]);
    chain(o, g, bus);
  });
  tone(ctx, out, 0, 32, 3, { vol: 0.8 });
});

R.exo_jump = () => render(0.6, (ctx, out) => {
  const f = noiseBurst(ctx, out, 0, 0.45, { type: 'bandpass', freq: 500, q: 1.3, vol: 0.9, attack: 0.01 });
  f.frequency.exponentialRampToValueAtTime(2600, 0.25);
  noiseBurst(ctx, out, 0, 0.3, { type: 'lowpass', freq: 300, vol: 0.6 });
  tone(ctx, out, 0, 80, 0.2, { vol: 0.5 });
});

R.exo_dodge = () => render(0.35, (ctx, out) => {
  const f = noiseBurst(ctx, out, 0, 0.28, { type: 'bandpass', freq: 2400, q: 1.1, vol: 0.9, attack: 0.005 });
  f.frequency.exponentialRampToValueAtTime(700, 0.28);
  tone(ctx, out, 0, 110, 0.12, { vol: 0.35 });
});

R.exo_slam = () => render(1.6, (ctx, out) => {
  const s = tone(ctx, out, 0, 85, 1.0, { vol: 1.0 });
  s.frequency.exponentialRampToValueAtTime(28, 0.9);
  noiseBurst(ctx, out, 0, 0.9, { type: 'lowpass', freq: 500, vol: 1.0 });
  noiseBurst(ctx, out, 0, 0.05, { type: 'highpass', freq: 1500, vol: 0.6 });
  for (let i = 0; i < 10; i++) {
    noiseBurst(ctx, out, 0.05 + Math.random() * 0.6, 0.06, { type: 'bandpass', freq: 600 + Math.random() * 1500, q: 2, vol: 0.25 });
  }
});

R.exo_land = () => render(0.25, (ctx, out) => {
  noiseBurst(ctx, out, 0, 0.18, { type: 'lowpass', freq: 400, vol: 0.8 });
  tone(ctx, out, 0, 70, 0.15, { vol: 0.5 });
});

R.exo_equip = () => render(1.8, (ctx, out) => {
  const o = tone(ctx, out, 0, 220, 1.0, { type: 'sawtooth', vol: 0.1, lp: 2400 });
  o.frequency.exponentialRampToValueAtTime(1100, 0.9);
  for (let i = 0; i < 6; i++) noiseBurst(ctx, out, 0.1 + i * 0.13, 0.03, { type: 'bandpass', freq: 2500, q: 3, vol: 0.4 });
  tone(ctx, out, 1.05, 1318, 0.18, { type: 'triangle', vol: 0.18 });
  tone(ctx, out, 1.25, 1760, 0.4, { type: 'triangle', vol: 0.18 });
  tone(ctx, out, 0.9, 55, 0.4, { vol: 0.6 });
});

R.exo_ready = () => render(0.12, (ctx, out) => tone(ctx, out, 0, 1900, 0.08, { type: 'triangle', vol: 0.07 }));

R.emp = () => render(1.5, (ctx, out) => {
  const buzz = osc(ctx, 'square', 60, 0, 1.2);
  const g = gainNode(ctx, 0);
  env(g.gain, 0, [[0, 0], [0.01, 0.25], [1.1, 0]]);
  chain(buzz, filter(ctx, 'lowpass', 2500), g, out);
  for (let i = 0; i < 30; i++) noiseBurst(ctx, out, Math.random() * 1.0, 0.015, { type: 'highpass', freq: 3000, vol: 0.5 });
  const dn = tone(ctx, out, 0.1, 900, 1.2, { type: 'sawtooth', vol: 0.12, lp: 3000 });
  dn.frequency.exponentialRampToValueAtTime(50, 1.3);
});

function footstep(kind) {
  return () => render(0.22, (ctx, out) => {
    if (kind === 'dirt') {
      noiseBurst(ctx, out, 0, 0.11, { type: 'lowpass', freq: 500 + Math.random() * 400, vol: 0.7 });
      noiseBurst(ctx, out, 0.01, 0.05, { type: 'bandpass', freq: 2200 + Math.random() * 1500, q: 1.5, vol: 0.18 });
    } else if (kind === 'metal') {
      noiseBurst(ctx, out, 0, 0.06, { type: 'lowpass', freq: 900, vol: 0.5 });
      const base = 900 + Math.random() * 600;
      [1, 2.31, 3.7].forEach((r, i) => tone(ctx, out, 0, base * r, 0.18 - i * 0.04, { vol: 0.05 / (i + 1) }));
    } else {
      noiseBurst(ctx, out, 0, 0.07, { type: 'bandpass', freq: 1100 + Math.random() * 500, q: 0.9, vol: 0.6 });
      tone(ctx, out, 0, 120, 0.05, { vol: 0.2 });
    }
  });
}
for (let i = 1; i <= 4; i++) {
  R['foot_dirt_' + i] = footstep('dirt');
  R['foot_hard_' + i] = footstep('hard');
}
for (let i = 1; i <= 3; i++) R['foot_metal_' + i] = footstep('metal');

R.land = () => render(0.35, (ctx, out) => {
  noiseBurst(ctx, out, 0, 0.25, { type: 'lowpass', freq: 450, vol: 0.9 });
  tone(ctx, out, 0, 65, 0.2, { vol: 0.5 });
});

R.explosion = () => render(3.0, (ctx, out) => {
  noiseBurst(ctx, out, 0, 0.05, { type: 'highpass', freq: 800, vol: 1.0 });
  const body = noiseBurst(ctx, out, 0, 2.2, { type: 'lowpass', freq: 1400, vol: 1.0, attack: 0.003 });
  body.frequency.exponentialRampToValueAtTime(140, 2.0);
  const sub = tone(ctx, out, 0, 70, 1.6, { vol: 1.0 });
  sub.frequency.exponentialRampToValueAtTime(30, 1.4);
  for (let i = 0; i < 18; i++) {
    noiseBurst(ctx, out, 0.1 + Math.random() * 1.8, 0.02 + Math.random() * 0.06, { type: 'bandpass', freq: 800 + Math.random() * 3000, q: 2, vol: 0.15 });
  }
}, 2);

R.grenade_bounce = () => render(0.2, (ctx, out) => {
  [2400, 3710, 5200].forEach((f, i) => tone(ctx, out, 0, f * (0.95 + Math.random() * 0.1), 0.15 - i * 0.03, { vol: 0.12 / (i + 1) }));
  noiseBurst(ctx, out, 0, 0.02, { type: 'lowpass', freq: 1500, vol: 0.3 });
});

R.grenade_pin = () => render(0.3, (ctx, out) => {
  noiseBurst(ctx, out, 0, 0.02, { type: 'highpass', freq: 3000, vol: 0.4 });
  bell(ctx, out, 0.03, 2900, 0.25, 0.05, [1, 1.9, 2.7]);
  noiseBurst(ctx, out, 0.12, 0.12, { type: 'bandpass', freq: 1400, q: 1, vol: 0.35, sweepTo: 600 });
});

R.melee_swing = () => render(0.3, (ctx, out) => {
  const f = noiseBurst(ctx, out, 0, 0.22, { type: 'bandpass', freq: 600, q: 1.6, vol: 0.7, attack: 0.04 });
  f.frequency.exponentialRampToValueAtTime(2200, 0.15);
});

R.melee_hit = () => render(0.3, (ctx, out) => {
  tone(ctx, out, 0, 95, 0.16, { vol: 0.9 });
  noiseBurst(ctx, out, 0, 0.12, { type: 'lowpass', freq: 700, vol: 0.9 });
  noiseBurst(ctx, out, 0.01, 0.16, { type: 'bandpass', freq: 1100, q: 4, vol: 0.4 });
});

R.impact_flesh = () => render(0.16, (ctx, out) => {
  noiseBurst(ctx, out, 0, 0.09, { type: 'bandpass', freq: 800, q: 2.5, vol: 0.8 });
  tone(ctx, out, 0, 110, 0.07, { vol: 0.4 });
});

R.impact_metal = () => render(0.35, (ctx, out) => {
  noiseBurst(ctx, out, 0, 0.03, { type: 'highpass', freq: 2000, vol: 0.5 });
  const base = 1500 + Math.random() * 900;
  [1, 1.73, 2.9].forEach((r, i) => tone(ctx, out, 0, base * r, 0.3 - i * 0.07, { vol: 0.07 / (i + 1) }));
});

R.impact_dirt = () => render(0.14, (ctx, out) => {
  noiseBurst(ctx, out, 0, 0.1, { type: 'lowpass', freq: 900, vol: 0.6 });
});

R.impact_wood = () => render(0.16, (ctx, out) => {
  noiseBurst(ctx, out, 0, 0.1, { type: 'bandpass', freq: 520, q: 3, vol: 0.9 });
  tone(ctx, out, 0, 260, 0.08, { vol: 0.2 });
});

R.heartbeat = () => render(0.7, (ctx, out) => {
  tone(ctx, out, 0, 52, 0.16, { vol: 0.9 });
  tone(ctx, out, 0.22, 48, 0.2, { vol: 0.7 });
});

R.helios_fire = () => render(1.1, (ctx, out) => {
  const car = osc(ctx, 'sine', 140, 0, 1.0);
  const mod = osc(ctx, 'sine', 47, 0, 1.0);
  const mg = gainNode(ctx, 220);
  chain(mod, mg, car.frequency);
  const g = gainNode(ctx, 0);
  env(g.gain, 0, [[0, 0], [0.03, 0.5], [0.9, 0.0001, 'exp']]);
  chain(car, shaper(ctx, 2.5), g, out);
  const f = noiseBurst(ctx, out, 0, 0.8, { type: 'bandpass', freq: 300, q: 2, vol: 0.6 });
  f.frequency.exponentialRampToValueAtTime(3500, 0.5);
  for (let i = 0; i < 14; i++) noiseBurst(ctx, out, Math.random() * 0.8, 0.01, { type: 'highpass', freq: 3000, vol: 0.4 });
});

R.upgrade_layer = () => render(0.3, (ctx, out) => {
  const car = osc(ctx, 'sawtooth', 1800, 0, 0.25);
  car.frequency.exponentialRampToValueAtTime(180, 0.2);
  const g = gainNode(ctx, 0);
  env(g.gain, 0, [[0, 0], [0.003, 0.25], [0.22, 0.0001, 'exp']]);
  chain(car, filter(ctx, 'lowpass', 4500), g, out);
});

R.wind_loop = async () => makeLoop(await render(14, (ctx, out) => {
  const n = noise(ctx, 0);
  const lp = filter(ctx, 'lowpass', 500, 0.5);
  const lfo = osc(ctx, 'sine', 0.09);
  const lg = gainNode(ctx, 280);
  chain(lfo, lg, lp.frequency);
  const g = gainNode(ctx, 0.35);
  const lfo2 = osc(ctx, 'sine', 0.13);
  const lg2 = gainNode(ctx, 0.15);
  chain(lfo2, lg2, g.gain);
  chain(n, lp, g, out);
  const hi = noise(ctx, 0);
  const bp = filter(ctx, 'bandpass', 2400, 3);
  const g2 = gainNode(ctx, 0.04);
  chain(hi, bp, g2, out);
}, 2), 2);

R.owl = () => render(2.4, (ctx, out) => {
  const hoots = [[0, 0.22, 360], [0.35, 0.18, 350], [0.75, 0.6, 330]];
  for (const [t, d, f] of hoots) {
    const o = osc(ctx, 'sine', f, t, t + d + 0.1);
    o.frequency.linearRampToValueAtTime(f * 0.94, t + d);
    const g = gainNode(ctx, 0);
    env(g.gain, t, [[0, 0], [0.05, 0.2], [d, 0.15], [d + 0.08, 0]]);
    chain(o, filter(ctx, 'lowpass', 900), g, out);
    noiseBurst(ctx, out, t, d, { type: 'bandpass', freq: f * 2, q: 6, vol: 0.02 });
  }
});

R.howl = () => render(4.5, (ctx, out) => {
  const o = osc(ctx, 'sawtooth', 380, 0, 4.2);
  o.frequency.linearRampToValueAtTime(640, 0.8);
  o.frequency.linearRampToValueAtTime(600, 2.6);
  o.frequency.linearRampToValueAtTime(420, 4.0);
  const v = osc(ctx, 'sine', 5.5);
  const vg = gainNode(ctx, 9);
  chain(v, vg, o.frequency);
  const g = gainNode(ctx, 0);
  env(g.gain, 0, [[0, 0], [0.5, 0.12], [3.0, 0.1], [4.1, 0]]);
  chain(o, filter(ctx, 'bandpass', 800, 3), filter(ctx, 'lowpass', 1400), g, out);
});

R.creak = () => render(1.8, (ctx, out) => {
  const o = osc(ctx, 'sawtooth', 70, 0, 1.6);
  o.frequency.linearRampToValueAtTime(95, 0.7);
  o.frequency.linearRampToValueAtTime(62, 1.5);
  const g = gainNode(ctx, 0);
  env(g.gain, 0, [[0, 0], [0.3, 0.12], [1.2, 0.1], [1.6, 0]]);
  chain(o, filter(ctx, 'bandpass', 520, 6), g, out);
});

R.drone_beep = () => render(0.14, (ctx, out) => tone(ctx, out, 0, 1850, 0.1, { type: 'square', vol: 0.12, lp: 4000 }));

R.crackle_loop = async () => makeLoop(await render(2.6, (ctx, out) => {
  for (let i = 0; i < 60; i++) {
    noiseBurst(ctx, out, Math.random() * 2.5, 0.004 + Math.random() * 0.02, { type: 'highpass', freq: 1500 + Math.random() * 3000, vol: 0.3 + Math.random() * 0.4 });
  }
  const b = osc(ctx, 'square', 120, 0);
  const g = gainNode(ctx, 0.02);
  chain(b, filter(ctx, 'lowpass', 900), g, out);
}), 0.2);

R.fire_loop = async () => makeLoop(await render(4.2, (ctx, out) => {
  const n = noise(ctx, 0);
  chain(n, filter(ctx, 'lowpass', 380), gainNode(ctx, 0.25), out);
  for (let i = 0; i < 40; i++) {
    noiseBurst(ctx, out, Math.random() * 4, 0.01 + Math.random() * 0.03, { type: 'bandpass', freq: 1200 + Math.random() * 2500, q: 2, vol: 0.25 });
  }
}), 0.4);

R.alarm = async () => makeLoop(await render(2.0, (ctx, out) => {
  const o = osc(ctx, 'square', 620, 0);
  o.frequency.setValueAtTime(620, 0);
  o.frequency.setValueAtTime(820, 0.5);
  o.frequency.setValueAtTime(620, 1.0);
  o.frequency.setValueAtTime(820, 1.5);
  chain(o, filter(ctx, 'lowpass', 1500), gainNode(ctx, 0.08), out);
}), 0.02);

R.thunder = () => render(5, (ctx, out) => {
  const f = noiseBurst(ctx, out, 0, 4.5, { type: 'lowpass', freq: 220, vol: 0.9, attack: 0.4 });
  f.frequency.linearRampToValueAtTime(90, 4.0);
}, 2);

R.dirt_burst = () => render(0.9, (ctx, out) => {
  noiseBurst(ctx, out, 0, 0.6, { type: 'lowpass', freq: 380, vol: 0.8, attack: 0.03 });
  for (let i = 0; i < 8; i++) noiseBurst(ctx, out, Math.random() * 0.5, 0.05, { type: 'bandpass', freq: 900 + Math.random() * 1200, q: 2, vol: 0.2 });
});

R.revive = () => render(1.4, (ctx, out) => {
  [392, 523, 659, 784].forEach((f, i) => tone(ctx, out, i * 0.08, f, 1.0, { type: 'triangle', vol: 0.12 }));
});

R.game_over = () => render(6, (ctx, out) => {
  const pad = gainNode(ctx, 0);
  env(pad.gain, 0, [[0, 0], [1.0, 0.18], [4.5, 0.12], [6, 0]]);
  [38, 45, 50, 53].forEach((n) => {
    const o = osc(ctx, 'sawtooth', midi(n), 0, 6);
    o.detune.value = Math.random() * 12 - 6;
    chain(o, filter(ctx, 'lowpass', 600), pad);
  });
  pad.connect(out);
  bell(ctx, out, 0.2, midi(57), 4.0, 0.2, [1, 2.0, 2.76, 5.4]);
  bell(ctx, out, 1.6, midi(52), 4.0, 0.16, [1, 2.0, 2.76, 5.4]);
});

// Dark, slowly breathing ambient bed for the match (Ghosts-style tension drone).
R.ambient_bed = async () => makeLoop(await render(34, (ctx, out) => {
  const bus = gainNode(ctx, 0.5);
  bus.connect(out);
  const notes = [[36, 0], [43, 0], [48, 8], [51, 8], [46, 17], [50, 17], [43, 25], [48, 25]];
  for (const [n, t] of notes) {
    for (let k = 0; k < 2; k++) {
      const o = osc(ctx, 'sawtooth', midi(n), t, t + 11);
      o.detune.value = k ? 8 : -8;
      const g = gainNode(ctx, 0);
      env(g.gain, t, [[0, 0], [3.5, 0.05], [7.5, 0.045], [11, 0]]);
      const lp = filter(ctx, 'lowpass', 320, 0.8);
      lp.frequency.linearRampToValueAtTime(700, t + 6);
      lp.frequency.linearRampToValueAtTime(260, t + 11);
      chain(o, lp, g, bus);
    }
  }
  const sub = osc(ctx, 'sine', midi(24), 0);
  chain(sub, gainNode(ctx, 0.12), bus);
  for (let i = 0; i < 7; i++) bell(ctx, bus, 2 + i * 4.6 + Math.random(), midi(72 + [0, 3, 7, 10, 2][i % 5]), 4, 0.03);
}, 2), 2.5);

// ---- Project Daybreak + the Nightwarden ---------------------------------------------------

// Throat: a detuned saw growl through moving vocal-tract formants, plus breath and sub.
function growl(ctx, out, t, dur, { f0 = 62, f1 = 48, vol = 0.5, rough = 3.5 } = {}) {
  const bus = gainNode(ctx, 0);
  env(bus.gain, t, [[0, 0], [0.12, vol], [dur * 0.7, vol * 0.85], [dur, 0.0001, 'exp']]);
  const sh = shaper(ctx, rough);
  for (let k = 0; k < 3; k++) {
    const o = osc(ctx, 'sawtooth', f0 * (1 + k * 0.012), t, t + dur + 0.05);
    o.frequency.exponentialRampToValueAtTime(f1 * (1 + k * 0.01), t + dur);
    const vib = osc(ctx, 'sine', 7 + k * 1.3, t, t + dur + 0.05);
    const vg = gainNode(ctx, f0 * 0.06);
    chain(vib, vg, o.frequency);
    chain(o, gainNode(ctx, 0.35), sh);
  }
  [[420, 6], [880, 5], [1900, 4]].forEach(([f, q], i) => {
    const bp = filter(ctx, 'bandpass', f, q);
    bp.frequency.linearRampToValueAtTime(f * (1.25 - i * 0.05), t + dur * 0.35);
    bp.frequency.linearRampToValueAtTime(f * 0.8, t + dur);
    chain(sh, bp, gainNode(ctx, [1, 0.7, 0.35][i]), bus);
  });
  const breath = noise(ctx, t, t + dur + 0.05);
  chain(breath, filter(ctx, 'bandpass', 900, 0.8), gainNode(ctx, 0.25), bus);
  const sub = osc(ctx, 'sine', f0 * 0.5, t, t + dur + 0.05);
  chain(sub, gainNode(ctx, 0.6), bus);
  bus.connect(out);
}

R.boss_roar = () => render(3.4, (ctx, out) => {
  growl(ctx, out, 0, 3.2, { f0: 70, f1: 44, vol: 0.55 });
  noiseBurst(ctx, out, 0, 2.8, { type: 'lowpass', freq: 160, vol: 0.5, attack: 0.3 });
}, 2);

R.boss_growl = () => render(1.6, (ctx, out) => growl(ctx, out, 0, 1.4, { f0: 58, f1: 50, vol: 0.4, rough: 2.5 }));

R.boss_stomp = () => render(0.8, (ctx, out) => {
  const s = tone(ctx, out, 0, 58, 0.45, { vol: 0.95 });
  s.frequency.exponentialRampToValueAtTime(34, 0.4);
  noiseBurst(ctx, out, 0, 0.35, { type: 'lowpass', freq: 420, vol: 0.8 });
  noiseBurst(ctx, out, 0.01, 0.12, { type: 'bandpass', freq: 1300, q: 1.5, vol: 0.2 });
});

R.boss_slam = () => render(2.6, (ctx, out) => {
  noiseBurst(ctx, out, 0, 0.06, { type: 'highpass', freq: 600, vol: 1.0 });
  const body = noiseBurst(ctx, out, 0, 1.8, { type: 'lowpass', freq: 900, vol: 1.0 });
  body.frequency.exponentialRampToValueAtTime(90, 1.6);
  const sub = tone(ctx, out, 0, 52, 1.8, { vol: 1.0 });
  sub.frequency.exponentialRampToValueAtTime(26, 1.6);
  bell(ctx, out, 0.01, 180, 1.6, 0.12, [1, 2.4, 3.9]);
  for (let i = 0; i < 16; i++) noiseBurst(ctx, out, 0.1 + Math.random() * 1.4, 0.03 + Math.random() * 0.08, { type: 'bandpass', freq: 300 + Math.random() * 1500, q: 2, vol: 0.18 });
}, 2);

R.shockwave = () => render(1.6, (ctx, out) => {
  const f = noiseBurst(ctx, out, 0, 1.4, { type: 'bandpass', freq: 180, q: 1.2, vol: 0.8, attack: 0.05 });
  f.frequency.exponentialRampToValueAtTime(1600, 1.2);
  const o = tone(ctx, out, 0, 90, 1.3, { type: 'sawtooth', vol: 0.18, lp: 600 });
  o.frequency.exponentialRampToValueAtTime(40, 1.2);
});

R.boss_charge = () => render(1.5, (ctx, out) => {
  growl(ctx, out, 0, 1.2, { f0: 80, f1: 120, vol: 0.45, rough: 4 });
  const f = noiseBurst(ctx, out, 0.2, 1.1, { type: 'bandpass', freq: 400, q: 1, vol: 0.4 });
  f.frequency.exponentialRampToValueAtTime(2400, 1.2);
});

R.shield_hit = () => render(0.35, (ctx, out) => {
  bell(ctx, out, 0, 1900 + Math.random() * 500, 0.3, 0.09, [1, 1.51, 2.32]);
  tone(ctx, out, 0, 140, 0.1, { vol: 0.25 });
  noiseBurst(ctx, out, 0, 0.04, { type: 'highpass', freq: 3500, vol: 0.2 });
});

R.shield_break = () => render(2.2, (ctx, out) => {
  for (let i = 0; i < 40; i++) noiseBurst(ctx, out, Math.random() * 0.9, 0.01 + Math.random() * 0.05, { type: 'highpass', freq: 2500 + Math.random() * 4000, vol: 0.35 });
  [0, 0.05, 0.11, 0.18].forEach((t, i) => bell(ctx, out, t, [2637, 2093, 1568, 1319][i], 1.4, 0.1, [1, 2.0, 2.76]));
  const d = tone(ctx, out, 0, 400, 1.8, { type: 'sawtooth', vol: 0.12, lp: 2000 });
  d.frequency.exponentialRampToValueAtTime(40, 1.8);
  noiseBurst(ctx, out, 0, 0.5, { type: 'lowpass', freq: 500, vol: 0.7 });
});

R.shield_up = () => render(1.8, (ctx, out) => {
  const f = noiseBurst(ctx, out, 0, 1.4, { type: 'bandpass', freq: 3000, q: 1, vol: 0.45, attack: 1.2 });
  f.frequency.exponentialRampToValueAtTime(300, 1.4);
  const o = tone(ctx, out, 0.2, 55, 1.5, { type: 'sawtooth', vol: 0.25, lp: 400, attack: 1.0 });
  o.frequency.exponentialRampToValueAtTime(70, 1.5);
  bell(ctx, out, 1.3, 110, 0.6, 0.15, [1, 2.76]);
});

R.orb_launch = () => render(0.9, (ctx, out) => {
  const f = noiseBurst(ctx, out, 0, 0.7, { type: 'lowpass', freq: 300, q: 4, vol: 0.7, attack: 0.05 });
  f.frequency.exponentialRampToValueAtTime(1800, 0.6);
  const o = tone(ctx, out, 0, 160, 0.6, { type: 'triangle', vol: 0.25 });
  o.frequency.exponentialRampToValueAtTime(420, 0.5);
});

R.orb_loop = async () => makeLoop(await render(2.2, (ctx, out) => {
  const o = osc(ctx, 'sawtooth', 73, 0);
  const lfo = osc(ctx, 'sine', 5.5);
  chain(lfo, gainNode(ctx, 9), o.frequency);
  chain(o, filter(ctx, 'bandpass', 600, 3), gainNode(ctx, 0.2), out);
  for (let i = 0; i < 30; i++) noiseBurst(ctx, out, Math.random() * 2, 0.01, { type: 'highpass', freq: 3000, vol: 0.12 });
}), 0.3);

R.orb_burst = () => render(0.9, (ctx, out) => {
  noiseBurst(ctx, out, 0, 0.35, { type: 'lowpass', freq: 1200, vol: 0.8 });
  tone(ctx, out, 0, 90, 0.3, { vol: 0.6 });
  for (let i = 0; i < 14; i++) noiseBurst(ctx, out, Math.random() * 0.6, 0.01, { type: 'highpass', freq: 3000, vol: 0.3 });
  bell(ctx, out, 0, 990, 0.5, 0.05, [1, 1.7]);
});

R.daybreak_hum = async () => makeLoop(await render(4.0, (ctx, out) => {
  const g = gainNode(ctx, 0.16);
  [110, 165, 220, 330].forEach((f, i) => {
    const o = osc(ctx, i ? 'sine' : 'triangle', f, 0);
    const lfo = osc(ctx, 'sine', 0.25 + i * 0.1);
    chain(lfo, gainNode(ctx, f * 0.004), o.frequency);
    chain(o, gainNode(ctx, 0.5 / (i + 1)), g);
  });
  chain(g, filter(ctx, 'lowpass', 1400), out);
}), 0.5);

R.daybreak_charge = () => render(1.2, (ctx, out) => {
  const o = tone(ctx, out, 0, 220, 1.0, { type: 'triangle', vol: 0.18 });
  o.frequency.exponentialRampToValueAtTime(660, 0.9);
  bell(ctx, out, 0.85, 1320, 0.35, 0.06);
});

R.daybreak_ready = () => render(1.8, (ctx, out) => {
  [64, 68, 71, 76, 80].forEach((n, i) => bell(ctx, out, i * 0.09, midi(n + 12), 1.2, 0.12, [1, 2.0, 3.01]));
  tone(ctx, out, 0, midi(52), 1.5, { type: 'triangle', vol: 0.18 });
});

R.daybreak_ignite = () => render(5.5, (ctx, out) => {
  const pad = gainNode(ctx, 0);
  env(pad.gain, 0, [[0, 0], [0.9, 0.2], [3.6, 0.16], [5.4, 0]]);
  [40, 52, 56, 59, 64, 68].forEach((n) => {
    for (const d of [-7, 7]) {
      const o = osc(ctx, 'sawtooth', midi(n), 0, 5.5);
      o.detune.value = d;
      chain(o, filter(ctx, 'lowpass', 2400), pad);
    }
  });
  pad.connect(out);
  const sweep = noiseBurst(ctx, out, 0, 2.2, { type: 'bandpass', freq: 200, q: 0.7, vol: 0.6, attack: 1.4 });
  sweep.frequency.exponentialRampToValueAtTime(6000, 2.0);
  noiseBurst(ctx, out, 1.9, 1.6, { type: 'lowpass', freq: 600, vol: 0.9 });
  tone(ctx, out, 1.9, 48, 1.4, { vol: 0.8 });
  for (let i = 0; i < 10; i++) bell(ctx, out, 2.0 + i * 0.12, midi(76 + [0, 4, 7, 12, 16][i % 5]), 1.6, 0.05);
}, 2);

R.night_fall = () => render(4.2, (ctx, out) => {
  const pad = gainNode(ctx, 0);
  env(pad.gain, 0, [[0, 0], [0.6, 0.24], [3.0, 0.16], [4.2, 0]]);
  [36, 39, 42].forEach((n) => {
    const o = osc(ctx, 'sawtooth', midi(n + 12), 0, 4.2);
    o.frequency.exponentialRampToValueAtTime(midi(n), 3.0);
    chain(o, filter(ctx, 'lowpass', 500), pad);
  });
  pad.connect(out);
  const th = noiseBurst(ctx, out, 0.3, 3.5, { type: 'lowpass', freq: 200, vol: 0.8, attack: 0.5 });
  th.frequency.linearRampToValueAtTime(80, 3.5);
}, 2);

R.prism_hum = async () => makeLoop(await render(3.0, (ctx, out) => {
  const g = gainNode(ctx, 0.1);
  [1318, 1975, 2637].forEach((f, i) => {
    const o = osc(ctx, 'sine', f, 0);
    const trem = osc(ctx, 'sine', 3 + i * 1.7);
    const tg = gainNode(ctx, 0.5);
    chain(trem, gainNode(ctx, 0.5), tg.gain);
    chain(o, tg, gainNode(ctx, 0.4 / (i + 1)), g);
  });
  g.connect(out);
}), 0.4);

R.prism_take = () => render(1.4, (ctx, out) => {
  [76, 80, 83, 88, 92].forEach((n, i) => bell(ctx, out, i * 0.07, midi(n), 0.9, 0.1, [1, 2.0, 3.0]));
  const o = tone(ctx, out, 0, 330, 0.6, { type: 'triangle', vol: 0.12 });
  o.frequency.exponentialRampToValueAtTime(1320, 0.5);
});

R.prism_install = () => render(1.6, (ctx, out) => {
  noiseBurst(ctx, out, 0, 0.06, { type: 'bandpass', freq: 2200, q: 2, vol: 0.5 });
  tone(ctx, out, 0, 90, 0.2, { vol: 0.5 });
  [64, 71, 76].forEach((n, i) => bell(ctx, out, 0.12 + i * 0.12, midi(n + 12), 1.2, 0.1));
});

R.mirror_servo = () => render(1.6, (ctx, out) => {
  const o = osc(ctx, 'sawtooth', 160, 0, 1.2);
  o.frequency.linearRampToValueAtTime(240, 0.6);
  o.frequency.linearRampToValueAtTime(140, 1.1);
  const lfo = osc(ctx, 'sine', 32, 0, 1.2);
  chain(lfo, gainNode(ctx, 25), o.frequency);
  const g = gainNode(ctx, 0);
  env(g.gain, 0, [[0, 0], [0.05, 0.12], [1.05, 0.1], [1.2, 0]]);
  chain(o, filter(ctx, 'bandpass', 900, 2), g, out);
  noiseBurst(ctx, out, 1.15, 0.08, { type: 'lowpass', freq: 700, vol: 0.6 });
  bell(ctx, out, 1.2, 1568, 0.4, 0.08);
});

R.radio_static = () => render(1.0, (ctx, out) => {
  const n = noise(ctx, 0, 1.0);
  const g = gainNode(ctx, 0);
  env(g.gain, 0, [[0, 0], [0.03, 0.35], [0.7, 0.2], [1.0, 0]]);
  chain(n, filter(ctx, 'bandpass', 1800, 0.8), g, out);
  for (let i = 0; i < 20; i++) noiseBurst(ctx, out, Math.random() * 0.9, 0.01, { type: 'highpass', freq: 2500, vol: 0.4 });
  tone(ctx, out, 0, 1000, 0.08, { type: 'square', vol: 0.05 });
});

R.boss_death = () => render(6, (ctx, out) => {
  growl(ctx, out, 0, 3.2, { f0: 90, f1: 38, vol: 0.5 });
  noiseBurst(ctx, out, 3.1, 0.08, { type: 'highpass', freq: 800, vol: 1.0 });
  const body = noiseBurst(ctx, out, 3.1, 2.6, { type: 'lowpass', freq: 1600, vol: 1.0 });
  body.frequency.exponentialRampToValueAtTime(110, 5.5);
  const sub = tone(ctx, out, 3.1, 64, 2.2, { vol: 1.0 });
  sub.frequency.exponentialRampToValueAtTime(28, 5.2);
  [64, 68, 71, 76].forEach((n, i) => bell(ctx, out, 3.2 + i * 0.08, midi(n + 12), 2.6, 0.1));
}, 2);

R.victory = () => render(7, (ctx, out) => {
  const seq = [[0, [52, 59, 64, 68]], [1.6, [49, 56, 61, 64]], [3.2, [45, 52, 57, 61]], [4.6, [47, 54, 59, 63, 66]]];
  for (const [t, chord] of seq) {
    const g = gainNode(ctx, 0);
    env(g.gain, t, [[0, 0], [0.35, 0.16], [t === 4.6 ? 2.2 : 1.4, 0.12], [t === 4.6 ? 2.4 : 1.6, 0]]);
    for (const n of chord) {
      const o = osc(ctx, 'sawtooth', midi(n), t, t + 2.5);
      o.detune.value = Math.random() * 10 - 5;
      chain(o, filter(ctx, 'lowpass', 1800), g);
    }
    g.connect(out);
    bell(ctx, out, t, midi(chord[chord.length - 1] + 12), 1.4, 0.1);
  }
  tone(ctx, out, 0, midi(28), 6.5, { vol: 0.25, attack: 0.4 });
}, 2);

// Battle drums for the boss fight: low toms and a pulsing drone, 8 bars of 92 bpm.
R.boss_loop = async () => makeLoop(await render(10.9, (ctx, out) => {
  const beat = 60 / 92;
  const bus = gainNode(ctx, 0.55);
  bus.connect(out);
  const hit = (t, f, v) => {
    const o = tone(ctx, bus, t, f, 0.35, { vol: v });
    o.frequency.exponentialRampToValueAtTime(f * 0.55, t + 0.3);
    noiseBurst(ctx, bus, t, 0.08, { type: 'lowpass', freq: 900, vol: v * 0.4 });
  };
  const pattern = [1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0];
  for (let bar = 0; bar < 8; bar++) {
    for (let i = 0; i < 16; i++) {
      const t = (bar * 4 + i / 4) * beat;
      if (t > 10.4) break;
      if (pattern[i]) hit(t, i % 8 === 0 ? 62 : 82, i % 8 === 0 ? 0.9 : 0.55);
      if (i % 4 === 2) noiseBurst(ctx, bus, t, 0.05, { type: 'highpass', freq: 5000, vol: 0.08 });
    }
  }
  for (const [n, t] of [[38, 0], [41, 2.6], [36, 5.2], [43, 7.8]]) {
    const o = osc(ctx, 'sawtooth', midi(n), t, t + 3.2);
    const g = gainNode(ctx, 0);
    env(g.gain, t, [[0, 0], [0.8, 0.06], [2.4, 0.05], [3.2, 0]]);
    chain(o, filter(ctx, 'lowpass', 500), g, bus);
  }
}, 2), 0.5);

export const SYNTH_NAMES = Object.keys(R);

export async function renderAll(onEach) {
  const out = {};
  const names = Object.keys(R);
  // render in small batches to avoid starving the main thread
  for (let i = 0; i < names.length; i += 6) {
    const batch = names.slice(i, i + 6);
    const bufs = await Promise.all(batch.map((n) => R[n]().catch((e) => {
      console.warn('synth failed', n, e);
      return null;
    })));
    batch.forEach((n, k) => {
      if (bufs[k]) out[n] = bufs[k];
      if (onEach) onEach(n);
    });
  }
  return out;
}
