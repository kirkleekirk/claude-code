// Procedural audio: every sound is synthesized with WebAudio (no audio assets).
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.vol = { master: 0.8, sfx: 0.9, music: 0.5, ambient: 0.7 };
    this.listener = { x: 0, y: 0, z: 0, yaw: 0 };
    this.voices = 0;
    this.loops = {};
    this.pluckCache = new Map();
  }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    this.ctx = new AC();
    const c = this.ctx;
    this.master = c.createGain();
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -14; this.comp.ratio.value = 4;
    this.master.connect(this.comp).connect(c.destination);
    this.bus = {};
    for (const k of ['sfx', 'music', 'ambient', 'ui']) { this.bus[k] = c.createGain(); this.bus[k].connect(this.master); }
    // simple reverb send
    this.verb = c.createConvolver();
    this.verb.buffer = this.impulse(2.2, 2.5);
    this.verbGain = c.createGain(); this.verbGain.gain.value = 0.22;
    this.verb.connect(this.verbGain).connect(this.master);
    this.noiseBuf = this.makeNoise(2);
    this.applyVolumes();
  }
  applyVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = this.vol.master;
    this.bus.sfx.gain.value = this.vol.sfx;
    this.bus.ui.gain.value = this.vol.sfx;
    this.bus.music.gain.value = this.vol.music;
    this.bus.ambient.gain.value = this.vol.ambient;
  }
  makeNoise(sec) {
    const c = this.ctx, b = c.createBuffer(1, c.sampleRate * sec, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  impulse(sec, decay) {
    const c = this.ctx, len = c.sampleRate * sec, b = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
    return b;
  }
  setListener(x, y, z, yaw) { this.listener.x = x; this.listener.y = y; this.listener.z = z; this.listener.yaw = yaw; }

  // ---- routing: returns {out, gainMul} where out is the node sound should connect to ----
  route(pos, range = 120, bus = 'sfx', verb = 0.15) {
    const c = this.ctx;
    const g = c.createGain();
    let mul = 1, pan = 0, muffle = 20000;
    if (pos) {
      const dx = pos.x - this.listener.x, dy = (pos.y ?? this.listener.y) - this.listener.y, dz = pos.z - this.listener.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > range) return null;
      mul = 1 / (1 + d / 6) * Math.max(0, 1 - d / range);
      mul = Math.min(1, mul * 1.6);
      // camera-relative pan: listener faces -z rotated by yaw
      const ang = Math.atan2(dx, dz);
      const rel = ang - (this.listener.yaw + Math.PI);
      pan = -Math.sin(rel) * Math.min(1, d / 4);
      muffle = Math.min(20000, 19000 * Math.pow(Math.max(0.02, 1 - d / range), 1.6) + 400);
    }
    const p = c.createStereoPanner ? c.createStereoPanner() : null;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = muffle;
    g.connect(f);
    if (p) { p.pan.value = Math.max(-1, Math.min(1, pan)); f.connect(p); p.connect(this.bus[bus]); if (verb) { const s = c.createGain(); s.gain.value = verb * (pos ? 1.5 : 1); p.connect(s).connect(this.verb); } }
    else { f.connect(this.bus[bus]); }
    return { out: g, mul };
  }
  env(gainNode, t0, a, peak, d, sustain = 0) {
    const g = gainNode.gain;
    g.setValueAtTime(0.0001, t0);
    g.linearRampToValueAtTime(peak, t0 + a);
    g.exponentialRampToValueAtTime(Math.max(0.0001, sustain || 0.0001), t0 + a + d);
  }
  noise(dest, t0, dur, type, freq, q, peak, attack = 0.002, fEnd = null) {
    const c = this.ctx;
    const src = c.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t0); f.Q.value = q;
    if (fEnd) f.frequency.exponentialRampToValueAtTime(fEnd, t0 + dur);
    const g = c.createGain();
    this.env(g, t0, attack, peak, dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t0, Math.random() * 1.5); src.stop(t0 + dur + attack + 0.05);
    return src;
  }
  osc(dest, t0, dur, type, f0, f1, peak, attack = 0.005) {
    const c = this.ctx;
    const o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    const g = c.createGain();
    this.env(g, t0, attack, peak, dur);
    o.connect(g).connect(dest);
    o.start(t0); o.stop(t0 + dur + attack + 0.05);
    return o;
  }

  play(name, pos = null, opts = {}) {
    if (!this.ctx || !this.enabled) return;
    if (this.voices > 40) return;
    const c = this.ctx, t = c.currentTime + 0.005;
    const range = { explosion: 700, shot_sniper: 600, shot_shotgun: 450, shot_ar: 450, shot_smg: 380, shot_pistol: 350, shot_revolver: 420, thunder: 9999, car_alarm: 250, alarm: 180, boat_horn: 1600, zombie_groan: 45, zombie_chase: 55, zombie_alert: 60, footstep: 30 }[name] || 90;
    const r = this.route(pos, range, opts.bus || 'sfx', opts.verb ?? 0.15);
    if (!r) return;
    const v = (opts.vol ?? 1) * r.mul;
    if (v < 0.005) return;
    const o = r.out;
    const p = opts.pitch ?? (0.94 + Math.random() * 0.12);
    this.voices++;
    setTimeout(() => this.voices--, 1500);
    const N = (dur, type, f, q, pk, a, fe) => this.noise(o, t, dur, type, f * p, q, pk * v, a, fe ? fe * p : null);
    const O = (dur, type, f0, f1, pk, a) => this.osc(o, t, dur, type, f0 * p, f1 * p, pk * v, a);
    switch (name) {
      case 'shot_ar': N(0.22, 'bandpass', 1300, 0.8, 1.0, 0.001, 500); N(0.06, 'highpass', 3000, 0.5, 0.5); O(0.18, 'sine', 90, 40, 0.9); this.echo(o, t, v, 1100); break;
      case 'shot_smg': N(0.12, 'bandpass', 1900, 0.9, 0.8, 0.001, 800); O(0.1, 'sine', 120, 60, 0.6); break;
      case 'shot_shotgun': N(0.45, 'lowpass', 2400, 0.5, 1.2, 0.001, 300); O(0.3, 'sine', 70, 30, 1.2); this.echo(o, t, v, 800); this.later(0.35, () => this.play('pump', pos, { vol: 0.5 })); break;
      case 'shot_sniper': N(0.08, 'highpass', 2500, 0.7, 1.0); N(0.9, 'lowpass', 1600, 0.4, 0.9, 0.001, 200); O(0.35, 'sine', 70, 30, 1.0); this.echo(o, t, v * 1.4, 900); break;
      case 'shot_pistol': N(0.14, 'bandpass', 1600, 0.9, 0.85, 0.001, 600); O(0.12, 'sine', 110, 50, 0.6); break;
      case 'shot_revolver': N(0.3, 'bandpass', 1000, 0.6, 1.1, 0.001, 300); O(0.25, 'sine', 80, 35, 1.0); this.echo(o, t, v, 900); break;
      case 'shot_crossbow': N(0.08, 'bandpass', 900, 2, 0.4); O(0.12, 'triangle', 220, 120, 0.3); break;
      case 'shot_suppressed': N(0.07, 'bandpass', 2600, 1.2, 0.5); O(0.05, 'square', 900, 400, 0.08); break;
      case 'pump': N(0.05, 'bandpass', 2500, 3, 0.4); this.later(0.12, () => N(0.05, 'bandpass', 1800, 3, 0.4)); break;
      case 'dryfire': O(0.03, 'square', 2200, 1800, 0.15); break;
      case 'reload': N(0.04, 'bandpass', 3000, 4, 0.3); this.later(0.35, () => N(0.05, 'bandpass', 2000, 4, 0.35)); this.later(0.7, () => O(0.04, 'square', 1500, 1200, 0.12)); break;
      case 'explosion': N(1.8, 'lowpass', 900, 0.5, 1.4, 0.005, 60); O(0.9, 'sine', 55, 25, 1.4); this.echo(o, t, v * 1.5, 500); break;
      case 'swing': N(0.18, 'bandpass', 700, 1.2, 0.35, 0.03, 1800); break;
      case 'hit_flesh': N(0.1, 'lowpass', 600, 1, 0.9); O(0.08, 'sine', 140, 70, 0.6); break;
      case 'hit_wood': N(0.08, 'bandpass', 700, 2, 0.8); O(0.12, 'triangle', 190, 150, 0.5); break;
      case 'hit_stone': N(0.07, 'bandpass', 1500, 2, 0.8); O(0.05, 'square', 400, 300, 0.15); break;
      case 'hit_metal': for (const f of [1200, 1870, 2650]) O(0.6, 'sine', f, f * 0.99, 0.25); N(0.04, 'highpass', 3000, 1, 0.4); break;
      case 'ricochet': O(0.25, 'sine', 3200 + Math.random() * 1500, 1200, 0.08); break;
      case 'tree_fall': N(1.4, 'lowpass', 500, 0.7, 0.8, 0.2, 120); this.later(1.1, () => O(0.4, 'sine', 60, 30, 0.9)); break;
      case 'clink': O(0.08, 'triangle', 1800, 1500, 0.2); break;
      case 'throw': N(0.25, 'bandpass', 900, 1, 0.3, 0.02, 400); break;
      case 'alarm': for (let k = 0; k < 6; k++) this.later(k * 0.08, () => O(0.05, 'square', 2200, 2200, 0.18)); break;
      case 'glass': for (let k = 0; k < 8; k++) this.later(k * 0.02, () => O(0.15, 'sine', 2500 + Math.random() * 3000, 2000, 0.12)); N(0.2, 'highpass', 4000, 1, 0.5); break;
      case 'whoosh': N(1.2, 'bandpass', 400, 0.6, 0.8, 0.1, 1200); break;
      case 'ignite': N(0.6, 'bandpass', 600, 0.8, 0.5, 0.05, 1500); break;
      case 'eat': for (let k = 0; k < 3; k++) this.later(k * 0.35, () => N(0.09, 'bandpass', 900 + Math.random() * 400, 3, 0.35)); break;
      case 'bandage': for (let k = 0; k < 4; k++) this.later(k * 0.4, () => N(0.25, 'highpass', 2500, 0.7, 0.2, 0.05)); break;
      case 'jump': N(0.06, 'lowpass', 500, 1, 0.3); break;
      case 'land': N(0.1, 'lowpass', 400, 1, 0.5); break;
      case 'land_hard': N(0.2, 'lowpass', 300, 1, 1.0); O(0.15, 'sine', 80, 40, 0.8); break;
      case 'bone': O(0.04, 'square', 600, 200, 0.4); N(0.06, 'bandpass', 1800, 4, 0.6); break;
      case 'cough': for (let k = 0; k < 2; k++) this.later(k * 0.28, () => { N(0.18, 'bandpass', 500, 1.5, 0.6, 0.01); O(0.12, 'sawtooth', 160, 120, 0.15); }); break;
      case 'footstep': N(0.06, 'lowpass', opts.surface === 'wood' ? 900 : 650, 1, 0.35); break;
      case 'zombie_groan': this.groan(o, t, v, p * (0.9 + Math.random() * 0.3), 1.1 + Math.random() * 0.8, 0.55); break;
      case 'zombie_chase': this.groan(o, t, v, p * 1.25, 0.8, 0.75, true); break;
      case 'zombie_alert': this.groan(o, t, v * 1.1, p * 1.7, 0.7, 0.9, true); break;
      case 'zombie_hurt': this.groan(o, t, v, p * 1.4, 0.35, 0.6); break;
      case 'zombie_die': this.groan(o, t, v, p * 1.1, 1.0, 0.7, false, 0.55); break;
      case 'zombie_attack': this.groan(o, t, v, p * 1.5, 0.4, 0.8, true); N(0.25, 'bandpass', 800, 0.8, 0.3, 0.05); break;
      case 'zombie_hit': N(0.12, 'lowpass', 700, 1, 1.0); O(0.1, 'sine', 110, 60, 0.7); break;
      case 'zombie_climb': N(0.5, 'bandpass', 400, 1, 0.4, 0.05); break;
      case 'rise': N(1.2, 'lowpass', 300, 0.8, 0.6, 0.2, 120); this.groan(o, t + 0.5, v * 0.7, p * 0.8, 1.2, 0.5); break;
      case 'smash': N(0.18, 'lowpass', 900, 0.8, 1.0); O(0.15, 'triangle', 120, 70, 0.7); break;
      case 'door_open': O(0.5, 'sawtooth', 280, 420, 0.04, 0.05); N(0.1, 'lowpass', 400, 1, 0.3); break;
      case 'door_close': N(0.12, 'lowpass', 500, 1, 0.7); O(0.1, 'sine', 120, 80, 0.5); break;
      case 'door_break': case 'board_break': N(0.5, 'lowpass', 1400, 0.6, 1.0, 0.002, 200); for (let k = 0; k < 5; k++) this.later(k * 0.05, () => O(0.08, 'triangle', 200 + Math.random() * 200, 100, 0.4)); break;
      case 'hammer': for (let k = 0; k < 4; k++) this.later(k * 0.22, () => { O(0.06, 'triangle', 900, 700, 0.5); N(0.05, 'bandpass', 1800, 3, 0.5); }); break;
      case 'crate_open': O(0.4, 'sine', 523, 523, 0.25); this.later(0.12, () => O(0.4, 'sine', 659, 659, 0.25)); this.later(0.24, () => O(0.6, 'sine', 784, 784, 0.25)); N(0.2, 'bandpass', 600, 1, 0.4); break;
      case 'car_alarm': for (let k = 0; k < 4; k++) this.later(k * 0.4, () => O(0.38, 'square', k % 2 ? 640 : 820, k % 2 ? 640 : 820, 0.22)); break;
      case 'pickup': O(0.08, 'sine', 880, 880, 0.18); this.later(0.07, () => O(0.1, 'sine', 1320, 1320, 0.18)); break;
      case 'build_wood': case 'build_stone': case 'build_metal': { const f = name === 'build_metal' ? 1400 : name === 'build_stone' ? 900 : 600; for (let k = 0; k < 2; k++) this.later(k * 0.12, () => { N(0.08, 'bandpass', f, 2, 0.6); O(0.07, 'triangle', f / 3, f / 4, 0.3); }); break; }
      case 'break_wood': case 'break_stone': case 'break_metal': N(0.6, 'lowpass', name === 'break_metal' ? 3000 : 1500, 0.5, 1, 0.002, 200); break;
      case 'thunder': this.thunder(o, t, v); break;
      case 'boat_horn': { const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700; f.connect(o); for (const fr of [98, 147]) { const os = c.createOscillator(); os.type = 'sawtooth'; os.frequency.value = fr; const g = c.createGain(); this.env(g, t, 0.15, 0.35 * v, 2.6, 0.2 * v); g.gain.setValueAtTime(0.3 * v, t + 2.4); g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2); os.connect(g).connect(f); os.start(t); os.stop(t + 3.3); } break; }
      case 'heli_flyby': N(3, 'lowpass', 400, 0.7, 0.8, 0.5); break;
      case 'crash': N(0.5, 'lowpass', 1800, 0.6, 1.1, 0.002, 200); O(0.3, 'sine', 70, 35, 1.0); for (let k = 0; k < 4; k++) this.later(k * 0.05, () => O(0.2, 'triangle', 900 + Math.random() * 900, 400, 0.15)); break;
      case 'pour': for (let k = 0; k < 6; k++) this.later(k * 0.35, () => N(0.3, 'bandpass', 700 + Math.random() * 300, 3, 0.3, 0.05)); break;
      case 'engine_start': for (let k = 0; k < 5; k++) this.later(k * 0.09, () => N(0.08, 'lowpass', 500, 1, 0.6)); this.later(0.45, () => O(0.5, 'sawtooth', 60, 110, 0.35)); break;
      case 'horn': { const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1800; f.connect(o); for (const fr of [415, 494]) { const os = c.createOscillator(); os.type = 'square'; os.frequency.value = fr; const g = c.createGain(); this.env(g, t, 0.02, 0.18 * v, 0.7, 0.1 * v); g.gain.setValueAtTime(0.12 * v, t + 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8); os.connect(g).connect(f); os.start(t); os.stop(t + 0.85); } break; }
      case 'ui_click': O(0.05, 'sine', 1100, 900, 0.25); break;
      case 'ui_hover': O(0.03, 'sine', 1500, 1500, 0.08); break;
      case 'ui_buy': for (let k = 0; k < 4; k++) this.later(k * 0.08, () => O(0.25, 'triangle', [523, 659, 784, 1047][k], [523, 659, 784, 1047][k], 0.25)); break;
      case 'ui_error': O(0.15, 'square', 220, 180, 0.15); break;
      case 'announce': O(0.5, 'triangle', 440, 440, 0.2); this.later(0.15, () => O(0.6, 'triangle', 660, 660, 0.2)); break;
      case 'kill': O(0.12, 'square', 900, 1400, 0.15); break;
      case 'hitmarker': O(0.04, 'square', 2600, 2600, 0.08); break;
      case 'headshot': O(0.06, 'square', 3200, 3600, 0.12); this.later(0.05, () => O(0.08, 'sine', 2400, 2400, 0.1)); break;
      case 'heartbeat': O(0.1, 'sine', 55, 45, 0.6); this.later(0.25, () => O(0.1, 'sine', 50, 40, 0.45)); break;
      case 'extract': for (let k = 0; k < 5; k++) this.later(k * 0.15, () => O(0.8, 'triangle', [392, 494, 587, 784, 988][k], [392, 494, 587, 784, 988][k], 0.25)); break;
      case 'death': for (let k = 0; k < 4; k++) this.later(k * 0.3, () => O(0.9, 'sawtooth', [330, 311, 294, 220][k], [330, 311, 294, 220][k] * 0.98, 0.12)); break;
      default: N(0.05, 'lowpass', 800, 1, 0.2);
    }
  }
  later(sec, fn) { setTimeout(fn, sec * 1000); }
  echo(dest, t, v, f) { const c = this.ctx; const dl = c.createDelay(1); dl.delayTime.value = 0.28; const g = c.createGain(); g.gain.value = 0.28; dest.connect(dl); dl.connect(g).connect(this.verb); this.noise(this.verb, t + 0.25, 0.6, 'lowpass', f, 0.5, v * 0.25); }
  groan(dest, t, v, pitch, dur, amp, harsh = false, slide = 0.8) {
    const c = this.ctx;
    const o = c.createOscillator(); o.type = 'sawtooth';
    const base = 85 * pitch;
    o.frequency.setValueAtTime(base, t);
    o.frequency.linearRampToValueAtTime(base * (harsh ? 1.3 : 1.1), t + dur * 0.3);
    o.frequency.exponentialRampToValueAtTime(base * slide, t + dur);
    const lfo = c.createOscillator(); lfo.frequency.value = 5 + Math.random() * 4;
    const lg = c.createGain(); lg.gain.value = base * 0.08; lfo.connect(lg).connect(o.frequency);
    const f1 = c.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = (harsh ? 750 : 480) * pitch; f1.Q.value = 3;
    const f2 = c.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = (harsh ? 1500 : 1000) * pitch; f2.Q.value = 4;
    const g = c.createGain();
    this.env(g, t, 0.08, amp * v, dur);
    o.connect(f1); o.connect(f2); f1.connect(g); f2.connect(g); g.connect(dest);
    o.start(t); lfo.start(t); o.stop(t + dur + 0.2); lfo.stop(t + dur + 0.2);
    this.noise(dest, t, dur * 0.8, 'bandpass', 700 * pitch, 1, v * amp * (harsh ? 0.5 : 0.25), 0.1);
  }
  thunder(dest, t, v) {
    this.noise(dest, t, 0.5, 'lowpass', 2000, 0.5, v * 0.7, 0.01, 400);
    this.noise(dest, t + 0.2, 4 + Math.random() * 2, 'lowpass', 220, 0.8, v * 1.0, 0.3, 50);
    this.osc(dest, t + 0.1, 2.5, 'sine', 45, 30, v * 0.6, 0.4);
  }
  // ---- loops ----
  loop(name, on, vol = 1, pos = null) {
    if (!this.ctx) return;
    let L = this.loops[name];
    if (on && !L) {
      const c = this.ctx;
      const g = c.createGain(); g.gain.value = 0;
      const bus = name === 'music' ? 'music' : name === 'wind' || name === 'crickets' || name === 'birds' || name === 'horde' || name === 'rain' ? 'ambient' : 'sfx';
      const p = c.createStereoPanner ? c.createStereoPanner() : null;
      if (p) { g.connect(p); p.connect(this.bus[bus]); } else g.connect(this.bus[bus]);
      L = this.loops[name] = { g, p, nodes: [], name };
      this.buildLoop(L);
    }
    if (!L) return;
    let v = on ? vol : 0;
    if (on && pos) {
      const dx = pos.x - this.listener.x, dz = pos.z - this.listener.z, dy = (pos.y || 0) - this.listener.y;
      const d = Math.hypot(dx, dy, dz);
      v *= Math.max(0, 1 - d / (name === 'heli' ? 900 : name === 'plane' ? 1500 : 300)) * Math.min(1, 40 / (d + 10));
      if (L.p) { const rel = Math.atan2(dx, dz) - (this.listener.yaw + Math.PI); L.p.pan.value = Math.max(-1, Math.min(1, -Math.sin(rel))); }
    }
    L.g.gain.setTargetAtTime(v, this.ctx.currentTime, 0.25);
  }
  buildLoop(L) {
    const c = this.ctx;
    const src = (type, f, q) => { const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true; const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; s.connect(fl); s.start(); L.nodes.push(s); return fl; };
    switch (L.name) {
      case 'wind': { const f = src('lowpass', 420, 0.6); const lfo = c.createOscillator(); lfo.frequency.value = 0.08; const lg = c.createGain(); lg.gain.value = 180; lfo.connect(lg).connect(f.frequency); lfo.start(); f.connect(L.g); break; }
      case 'rain': { src('highpass', 1800, 0.4).connect(L.g); break; }
      case 'heli': { const f = src('lowpass', 360, 1); const am = c.createGain(); am.gain.value = 0.5; const lfo = c.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 7; const lg = c.createGain(); lg.gain.value = 0.5; lfo.connect(lg).connect(am.gain); lfo.start(); f.connect(am).connect(L.g); const w = c.createOscillator(); w.type = 'sawtooth'; w.frequency.value = 520; const wg = c.createGain(); wg.gain.value = 0.03; w.connect(wg).connect(L.g); w.start(); L.nodes.push(w, lfo); break; }
      case 'plane': { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 72; const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 300; const og = c.createGain(); og.gain.value = 0.3; o.connect(f).connect(og).connect(L.g); o.start(); L.nodes.push(o); src('lowpass', 600, 0.5).connect(L.g); break; }
      case 'horde': { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 55; const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 220; f.Q.value = 2; const og = c.createGain(); og.gain.value = 0.25; o.connect(f).connect(og).connect(L.g); o.start(); L.nodes.push(o); src('bandpass', 500, 0.8).connect(L.g); break; }
      case 'crickets': { const o = c.createOscillator(); o.frequency.value = 4400; const am = c.createGain(); am.gain.value = 0; const lfo = c.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 18; const lg = c.createGain(); lg.gain.value = 0.04; lfo.connect(lg).connect(am.gain); const lfo2 = c.createOscillator(); lfo2.frequency.value = 0.7; const lg2 = c.createGain(); lg2.gain.value = 0.03; lfo2.connect(lg2).connect(am.gain); o.connect(am).connect(L.g); o.start(); lfo.start(); lfo2.start(); L.nodes.push(o, lfo, lfo2); break; }
      case 'fire': { src('bandpass', 1200, 0.5).connect(L.g); break; }
      default: break;
    }
  }
  // continuous engine sound for the vehicle you're driving
  engine(on, frac = 0, kind = 'bike') {
    if (!this.ctx) return;
    const c = this.ctx;
    if (on && !this.eng) {
      const g = c.createGain(); g.gain.value = 0;
      const o1 = c.createOscillator(); o1.type = 'sawtooth';
      const o2 = c.createOscillator(); o2.type = 'square';
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
      const g2 = c.createGain(); g2.gain.value = 0.35;
      o1.connect(f); o2.connect(g2).connect(f); f.connect(g); g.connect(this.bus.sfx);
      o1.start(); o2.start();
      this.eng = { g, o1, o2, f };
    }
    if (!this.eng) return;
    const t = c.currentTime;
    const base = kind === 'bike' ? 55 : 38;
    const rpm = base + frac * (kind === 'bike' ? 150 : 90);
    this.eng.o1.frequency.setTargetAtTime(rpm, t, 0.08);
    this.eng.o2.frequency.setTargetAtTime(rpm * 0.5, t, 0.08);
    this.eng.f.frequency.setTargetAtTime(500 + frac * 1600, t, 0.1);
    this.eng.g.gain.setTargetAtTime(on ? 0.16 + frac * 0.12 : 0, t, 0.15);
    if (!on) { const e = this.eng; this.eng = null; setTimeout(() => { try { e.o1.stop(); e.o2.stop(); e.g.disconnect(); } catch (err) { /* */ } }, 600); }
  }
  stopLoop(name) { const L = this.loops[name]; if (!L) return; L.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1); setTimeout(() => { for (const n of L.nodes) { try { n.stop(); } catch (e) { /* */ } } L.g.disconnect(); }, 600); delete this.loops[name]; }
  stopAll() { for (const k of Object.keys(this.loops)) this.stopLoop(k); this.stopMusic(); this.engine(false); }

  // ---- music: Karplus-Strong plucked guitar, country progression ----
  pluckBuffer(freq) {
    const key = Math.round(freq);
    if (this.pluckCache.has(key)) return this.pluckCache.get(key);
    const c = this.ctx, sr = c.sampleRate, len = Math.floor(sr * 2.2);
    const b = c.createBuffer(1, len, sr), d = b.getChannelData(0);
    const N = Math.floor(sr / freq);
    for (let i = 0; i < N; i++) d[i] = (Math.random() * 2 - 1) * 0.8;
    for (let i = N; i < len; i++) d[i] = 0.5 * (d[i - N] + d[i - N - 1]) * 0.9965;
    this.pluckCache.set(key, b);
    return b;
  }
  pluck(freq, t, v = 0.3) {
    const c = this.ctx;
    const s = c.createBufferSource(); s.buffer = this.pluckBuffer(freq);
    const g = c.createGain(); g.gain.value = v;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 3200;
    s.connect(f).connect(g).connect(this.bus.music);
    const sg = c.createGain(); sg.gain.value = 0.25; g.connect(sg).connect(this.verb);
    s.start(t);
  }
  startMusic(kind = 'lobby') {
    if (!this.ctx) return;
    this.stopMusic();
    const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
    const prog = kind === 'lobby'
      ? [[55, 59, 62, 67], [48, 55, 60, 64], [50, 57, 62, 66], [52, 59, 64, 67]] // G C D Em
      : [[52, 55, 59, 64], [48, 52, 55, 60], [50, 53, 57, 62], [47, 50, 55, 59]];
    const bpm = kind === 'lobby' ? 92 : 70;
    const beat = 60 / bpm;
    let bar = 0;
    const pattern = [0, 2, 1, 3, 2, 1, 3, 2];
    this.musicTimer = setInterval(() => {
      if (!this.ctx) return;
      const t0 = this.ctx.currentTime + 0.1;
      const chord = prog[bar % prog.length];
      this.pluck(midi(chord[0] - 12), t0, 0.35);
      for (let k = 0; k < 8; k++) this.pluck(midi(chord[pattern[k]] + (k === 6 && bar % 2 ? 2 : 0)), t0 + k * beat / 2, 0.16 + (k % 2 ? 0 : 0.05));
      if (bar % 4 === 3 && kind === 'lobby') { this.pluck(midi(chord[3] + 12), t0 + beat * 3, 0.12); this.pluck(midi(chord[2] + 12), t0 + beat * 3.5, 0.12); }
      bar++;
    }, beat * 4 * 1000);
  }
  stopMusic() { if (this.musicTimer) clearInterval(this.musicTimer); this.musicTimer = null; }
}
