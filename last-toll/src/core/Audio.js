// Procedural audio. No sample files: every sound is synthesized with WebAudio
// nodes so the game ships as code only. Positional sounds use PannerNodes placed
// in world space; the listener follows the camera.

export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.volume = 0.8;
    this.activeGroans = 0;
    this.listenerPos = { x: 0, y: 0, z: 0 };
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 10;
    comp.ratio.value = 5;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    this.master.connect(comp);
    comp.connect(ctx.destination);

    // Shared reverb bus for the outdoor slap and the bell.
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._impulse(3.2, 2.6);
    this.reverbGain = ctx.createGain();
    this.reverbGain.gain.value = 0.35;
    this.reverb.connect(this.reverbGain);
    this.reverbGain.connect(this.master);

    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);

    this.noiseBuf = this._noiseBuffer(2, 'white');
    this.brownBuf = this._noiseBuffer(4, 'brown');
    this.enabled = true;
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  get now() { return this.ctx ? this.ctx.currentTime : 0; }

  _noiseBuffer(seconds, kind) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'brown') {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else d[i] = w;
    }
    return buf;
  }

  _impulse(seconds, decay) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  updateListener(pos, forward, up) {
    if (!this.ctx) return;
    this.listenerPos = pos;
    const l = this.ctx.listener;
    const t = this.ctx.currentTime;
    if (l.positionX) {
      l.positionX.setTargetAtTime(pos.x, t, 0.02);
      l.positionY.setTargetAtTime(pos.y, t, 0.02);
      l.positionZ.setTargetAtTime(pos.z, t, 0.02);
      l.forwardX.setTargetAtTime(forward.x, t, 0.02);
      l.forwardY.setTargetAtTime(forward.y, t, 0.02);
      l.forwardZ.setTargetAtTime(forward.z, t, 0.02);
      l.upX.setTargetAtTime(up.x, t, 0.02);
      l.upY.setTargetAtTime(up.y, t, 0.02);
      l.upZ.setTargetAtTime(up.z, t, 0.02);
    } else {
      l.setPosition(pos.x, pos.y, pos.z);
      l.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
    }
  }

  // Output node for a sound: positional panner or the plain sfx bus.
  _out(pos, { ref = 2, rolloff = 1.1, maxDist = 90, reverb = 0 } = {}) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    if (pos) {
      const p = ctx.createPanner();
      p.panningModel = 'equalpower';
      p.distanceModel = 'inverse';
      p.refDistance = ref;
      p.rolloffFactor = rolloff;
      p.maxDistance = maxDist;
      if (p.positionX) {
        p.positionX.value = pos.x;
        p.positionY.value = pos.y;
        p.positionZ.value = pos.z;
      } else p.setPosition(pos.x, pos.y, pos.z);
      g.connect(p);
      p.connect(this.sfx);
      if (reverb > 0) {
        const s = ctx.createGain();
        s.gain.value = reverb;
        p.connect(s);
        s.connect(this.reverb);
      }
    } else {
      g.connect(this.sfx);
      if (reverb > 0) {
        const s = ctx.createGain();
        s.gain.value = reverb;
        g.connect(s);
        s.connect(this.reverb);
      }
    }
    return g;
  }

  _noise(out, t, dur, { type = 'lowpass', freq = 1000, q = 0.7, gain = 0.5, attack = 0.002, freqEnd = null, buf = null, rate = 1 } = {}) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buf || this.noiseBuf;
    src.playbackRate.value = rate;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(out);
    const offset = Math.random() * Math.max(0, src.buffer.duration - dur - 0.1);
    src.start(t, offset, dur + 0.05);
    return src;
  }

  _tone(out, t, dur, { type = 'sine', freq = 440, freqEnd = null, gain = 0.3, attack = 0.005 } = {}) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(Math.max(10, freqEnd), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(out);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  // ---- Weapons -----------------------------------------------------------

  gunshot(kind, pos, suppressed = false) {
    if (!this.enabled) return;
    const t = this.now;
    if (suppressed) {
      const out = this._out(pos, { ref: 2, reverb: 0.05 });
      this._noise(out, t, 0.12, { type: 'bandpass', freq: 1800, q: 1.2, gain: 0.35, freqEnd: 600 });
      this._tone(out, t, 0.06, { freq: 180, freqEnd: 60, gain: 0.25 });
      this._noise(out, t + 0.02, 0.05, { type: 'highpass', freq: 4000, gain: 0.15 });
      return;
    }
    const cfg = {
      pistol: { g: 1.0, body: 1400, tail: 0.35, thump: 150 },
      revolver: { g: 1.2, body: 1100, tail: 0.5, thump: 120 },
      shotgun: { g: 1.45, body: 800, tail: 0.7, thump: 90 },
      rifle: { g: 1.4, body: 2000, tail: 0.8, thump: 110 },
    }[kind] || { g: 1, body: 1200, tail: 0.4, thump: 130 };
    const out = this._out(pos, { ref: 4, rolloff: 0.8, reverb: 0.6 });
    this._noise(out, t, 0.04, { type: 'highpass', freq: 3000, gain: 0.9 * cfg.g });
    this._noise(out, t, cfg.tail, { type: 'lowpass', freq: cfg.body * 2.5, freqEnd: 200, gain: 1.0 * cfg.g, q: 0.5 });
    this._tone(out, t, 0.18, { freq: cfg.thump, freqEnd: 40, gain: 0.9 * cfg.g });
    this._noise(out, t + 0.05, cfg.tail * 1.6, { type: 'lowpass', freq: 500, freqEnd: 120, gain: 0.25 * cfg.g, buf: this.brownBuf });
  }

  crossbow(pos) {
    if (!this.enabled) return;
    const t = this.now;
    const out = this._out(pos);
    this._tone(out, t, 0.12, { type: 'triangle', freq: 320, freqEnd: 90, gain: 0.35 });
    this._noise(out, t, 0.15, { type: 'bandpass', freq: 2500, freqEnd: 800, q: 2, gain: 0.3 });
  }

  dryFire() {
    if (!this.enabled) return;
    const t = this.now;
    const out = this._out(null);
    this._noise(out, t, 0.03, { type: 'bandpass', freq: 3500, q: 4, gain: 0.35 });
  }

  mech(kind) {
    if (!this.enabled) return;
    const t = this.now;
    const out = this._out(null);
    const click = (dt, f, g = 0.3, d = 0.04) => this._noise(out, t + dt, d, { type: 'bandpass', freq: f, q: 5, gain: g });
    const ping = (dt, f, g = 0.08) => this._tone(out, t + dt, 0.08, { type: 'triangle', freq: f, gain: g });
    switch (kind) {
      case 'magOut': click(0, 2200, 0.3); ping(0.01, 1800); this._noise(out, t + 0.05, 0.12, { type: 'bandpass', freq: 900, q: 1, gain: 0.12 }); break;
      case 'magIn': click(0, 1600, 0.35); click(0.06, 2600, 0.4); ping(0.07, 2400); break;
      case 'rack': click(0, 1400, 0.35, 0.06); click(0.12, 2600, 0.45); ping(0.13, 3100, 0.1); break;
      case 'pump': this._noise(out, t, 0.09, { type: 'bandpass', freq: 900, q: 2, gain: 0.45 }); this._noise(out, t + 0.14, 0.09, { type: 'bandpass', freq: 1300, q: 2, gain: 0.5 }); click(0.22, 2400, 0.3); break;
      case 'shell': click(0, 1200, 0.3, 0.05); this._noise(out, t + 0.03, 0.05, { type: 'bandpass', freq: 700, q: 2, gain: 0.2 }); break;
      case 'bolt': click(0, 1100, 0.4, 0.05); click(0.1, 1700, 0.35, 0.05); click(0.22, 2400, 0.4); break;
      case 'cylOpen': click(0, 2000, 0.3); ping(0.02, 2600); break;
      case 'cylClose': click(0, 1500, 0.45); ping(0.01, 2100); break;
      case 'eject': for (let i = 0; i < 4; i++) ping(0.05 + i * 0.03 + Math.random() * 0.02, 3500 + Math.random() * 1200, 0.05); break;
      case 'round': click(0, 2800, 0.25, 0.03); break;
      case 'crank': for (let i = 0; i < 5; i++) click(i * 0.09, 900 + i * 60, 0.25, 0.05); break;
      case 'jam': click(0, 900, 0.4, 0.06); break;
      case 'holster': this._noise(out, t, 0.15, { type: 'bandpass', freq: 600, q: 1, gain: 0.18 }); break;
      default: click(0, 2000);
    }
  }

  whoosh(power = 1) {
    if (!this.enabled) return;
    const t = this.now;
    const out = this._out(null);
    this._noise(out, t, 0.22, { type: 'bandpass', freq: 400 + 900 * power, freqEnd: 250, q: 1.4, gain: 0.12 + 0.2 * power, attack: 0.06 });
  }

  meleeHit(kind, pos, power = 1) {
    if (!this.enabled) return;
    const t = this.now;
    const out = this._out(pos, { ref: 2 });
    const g = 0.4 + 0.6 * power;
    if (kind === 'stab') {
      this._noise(out, t, 0.05, { type: 'highpass', freq: 2500, gain: 0.5 * g });
      this._tone(out, t, 0.08, { freq: 220, freqEnd: 90, gain: 0.35 * g });
      this._noise(out, t + 0.02, 0.28, { type: 'bandpass', freq: 700, freqEnd: 180, q: 3, gain: 0.55 * g });
    } else if (kind === 'crack') {
      this._noise(out, t, 0.06, { type: 'highpass', freq: 1800, gain: 0.8 * g });
      this._tone(out, t, 0.14, { freq: 140, freqEnd: 50, gain: 0.7 * g });
      this._noise(out, t + 0.03, 0.25, { type: 'bandpass', freq: 500, freqEnd: 150, q: 2, gain: 0.5 * g });
    } else if (kind === 'slash') {
      this._noise(out, t, 0.14, { type: 'bandpass', freq: 1800, freqEnd: 500, q: 1.5, gain: 0.6 * g });
      this._noise(out, t + 0.02, 0.2, { type: 'bandpass', freq: 500, freqEnd: 200, q: 2, gain: 0.4 * g });
    } else if (kind === 'thud') {
      this._tone(out, t, 0.16, { freq: 110, freqEnd: 45, gain: 0.7 * g });
      this._noise(out, t, 0.12, { type: 'lowpass', freq: 900, gain: 0.45 * g });
    } else if (kind === 'deflect') {
      this._tone(out, t, 0.25, { type: 'triangle', freq: 1900, freqEnd: 1700, gain: 0.25 });
      this._noise(out, t, 0.05, { type: 'highpass', freq: 3000, gain: 0.5 });
    } else if (kind === 'wall') {
      this._noise(out, t, 0.08, { type: 'bandpass', freq: 1200, q: 1.5, gain: 0.5 * g });
      this._tone(out, t, 0.1, { freq: 180, freqEnd: 90, gain: 0.3 * g });
    }
  }

  splat(pos) {
    if (!this.enabled) return;
    const t = this.now;
    const out = this._out(pos, { ref: 1.5 });
    this._noise(out, t, 0.18, { type: 'bandpass', freq: 500, freqEnd: 160, q: 2.5, gain: 0.4 });
  }

  pullOut(pos) {
    if (!this.enabled) return;
    const t = this.now;
    const out = this._out(pos, { ref: 1.5 });
    this._noise(out, t, 0.3, { type: 'bandpass', freq: 250, freqEnd: 900, q: 4, gain: 0.5 });
    this._noise(out, t + 0.22, 0.06, { type: 'highpass', freq: 2500, gain: 0.3 });
  }

  impact(pos, surface = 'hard') {
    if (!this.enabled) return;
    const t = this.now;
    const out = this._out(pos, { ref: 2 });
    if (surface === 'flesh') this._noise(out, t, 0.1, { type: 'bandpass', freq: 400, q: 1.5, gain: 0.35 });
    else this._noise(out, t, 0.06, { type: 'bandpass', freq: 2500 + Math.random() * 1500, q: 2, gain: 0.35 });
  }

  weaponBreak() {
    if (!this.enabled) return;
    const t = this.now;
    const out = this._out(null);
    this._noise(out, t, 0.08, { type: 'highpass', freq: 2000, gain: 0.8 });
    this._noise(out, t + 0.04, 0.3, { type: 'bandpass', freq: 600, freqEnd: 200, q: 1, gain: 0.4 });
    this._tone(out, t, 0.3, { type: 'triangle', freq: 900, freqEnd: 300, gain: 0.15 });
  }

  // ---- Walkers -----------------------------------------------------------

  groan(pos, pitch = 1, intensity = 0.5, dur = 1.2) {
    if (!this.enabled || this.activeGroans > 7) return;
    const ctx = this.ctx;
    const t = this.now;
    this.activeGroans++;
    setTimeout(() => this.activeGroans--, (dur + 0.2) * 1000);
    const out = this._out(pos, { ref: 1.8, rolloff: 1.3, maxDist: 45 });
    const base = (70 + Math.random() * 45) * pitch;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(base * 1.15, t);
    o.frequency.linearRampToValueAtTime(base * (0.8 + Math.random() * 0.4), t + dur * 0.5);
    o.frequency.linearRampToValueAtTime(base * 0.75, t + dur);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5 + Math.random() * 6;
    const lfoG = ctx.createGain();
    lfoG.gain.value = base * 0.06;
    lfo.connect(lfoG);
    lfoG.connect(o.frequency);
    const f1 = ctx.createBiquadFilter();
    f1.type = 'bandpass';
    f1.frequency.setValueAtTime(450 + Math.random() * 250, t);
    f1.frequency.linearRampToValueAtTime(300 + Math.random() * 200, t + dur);
    f1.Q.value = 5;
    const f2 = ctx.createBiquadFilter();
    f2.type = 'bandpass';
    f2.frequency.value = 1000 + Math.random() * 500;
    f2.Q.value = 7;
    const g = ctx.createGain();
    const peak = 0.25 + intensity * 0.55;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + dur * 0.25);
    g.gain.exponentialRampToValueAtTime(peak * 0.6, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f1);
    o.connect(f2);
    f1.connect(g);
    const g2 = ctx.createGain();
    g2.gain.value = 0.5;
    f2.connect(g2);
    g2.connect(g);
    g.connect(out);
    this._noise(out, t, dur * 0.9, { type: 'bandpass', freq: 800, q: 1, gain: 0.08 + 0.2 * intensity, attack: dur * 0.3 });
    o.start(t);
    lfo.start(t);
    o.stop(t + dur + 0.05);
    lfo.stop(t + dur + 0.05);
  }

  snarl(pos) {
    this.groan(pos, 1.35, 1, 0.7);
    if (!this.enabled) return;
    const out = this._out(pos, { ref: 1.5 });
    this._noise(out, this.now, 0.6, { type: 'bandpass', freq: 1400, freqEnd: 600, q: 1.5, gain: 0.3, attack: 0.05 });
  }

  bite() {
    if (!this.enabled) return;
    const t = this.now;
    const out = this._out(null);
    for (let i = 0; i < 3; i++) this._noise(out, t + i * 0.07, 0.08, { type: 'bandpass', freq: 900 + i * 300, q: 2, gain: 0.7 });
    this._tone(out, t, 0.2, { freq: 90, freqEnd: 40, gain: 0.8 });
    this._noise(out, t + 0.1, 0.5, { type: 'bandpass', freq: 400, freqEnd: 150, q: 3, gain: 0.5 });
  }

  bodyFall(pos) {
    if (!this.enabled) return;
    const t = this.now;
    const out = this._out(pos, { ref: 2 });
    this._tone(out, t, 0.2, { freq: 80, freqEnd: 35, gain: 0.6 });
    this._noise(out, t, 0.2, { type: 'lowpass', freq: 600, gain: 0.35 });
  }

  // ---- Player / world ------------------------------------------------------

  footstep(intensity = 0.5, surface = 'ground') {
    if (!this.enabled) return;
    const t = this.now;
    const out = this._out(null);
    const f = surface === 'wood' ? 700 : surface === 'metal' ? 1600 : 1100;
    this._noise(out, t, 0.07 + intensity * 0.05, { type: 'bandpass', freq: f * (0.8 + Math.random() * 0.4), q: 1.2, gain: 0.05 + intensity * 0.1 });
    if (surface === 'wood') this._tone(out, t, 0.06, { freq: 140, freqEnd: 90, gain: 0.05 * intensity });
  }

  hurt() {
    if (!this.enabled) return;
    const t = this.now;
    const out = this._out(null);
    this._tone(out, t, 0.25, { type: 'sawtooth', freq: 210, freqEnd: 140, gain: 0.12 });
    this._noise(out, t, 0.2, { type: 'bandpass', freq: 700, q: 1, gain: 0.25 });
  }

  heartbeat(rate = 1) {
    if (!this.enabled) return;
    const t = this.now;
    const out = this._out(null);
    this._tone(out, t, 0.12, { freq: 55, freqEnd: 40, gain: 0.5 * rate });
    this._tone(out, t + 0.22, 0.1, { freq: 50, freqEnd: 38, gain: 0.35 * rate });
  }

  breath(heavy = 1) {
    if (!this.enabled) return;
    const t = this.now;
    const out = this._out(null);
    this._noise(out, t, 0.5, { type: 'bandpass', freq: 1100, q: 0.8, gain: 0.05 * heavy, attack: 0.15 });
  }

  pickup() {
    if (!this.enabled) return;
    const t = this.now;
    const out = this._out(null);
    this._noise(out, t, 0.08, { type: 'bandpass', freq: 1500, q: 1.5, gain: 0.25 });
    this._tone(out, t + 0.02, 0.06, { type: 'triangle', freq: 660, freqEnd: 880, gain: 0.06 });
  }

  open(pos, kind = 'wood') {
    if (!this.enabled) return;
    const ctx = this.ctx;
    const t = this.now;
    const out = this._out(pos, { ref: 1.5 });
    if (kind === 'metal') {
      this._noise(out, t, 0.25, { type: 'bandpass', freq: 1800, freqEnd: 1200, q: 6, gain: 0.3 });
      this._noise(out, t + 0.22, 0.08, { type: 'bandpass', freq: 900, q: 2, gain: 0.35 });
      return;
    }
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(90, t);
    o.frequency.linearRampToValueAtTime(140, t + 0.2);
    o.frequency.linearRampToValueAtTime(70, t + 0.45);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1200;
    f.Q.value = 8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.connect(f);
    f.connect(g);
    g.connect(out);
    o.start(t);
    o.stop(t + 0.55);
    this._noise(out, t + 0.4, 0.08, { type: 'lowpass', freq: 600, gain: 0.2 });
  }

  eat() {
    if (!this.enabled) return;
    const t = this.now;
    const out = this._out(null);
    for (let i = 0; i < 4; i++) this._noise(out, t + i * 0.16, 0.09, { type: 'bandpass', freq: 1200 + Math.random() * 800, q: 1.5, gain: 0.18 });
  }

  bandage() {
    if (!this.enabled) return;
    const t = this.now;
    const out = this._out(null);
    for (let i = 0; i < 3; i++) this._noise(out, t + i * 0.25, 0.2, { type: 'highpass', freq: 2500, gain: 0.12, attack: 0.08 });
  }

  flashlight() {
    if (!this.enabled) return;
    const out = this._out(null);
    this._noise(out, this.now, 0.025, { type: 'bandpass', freq: 3000, q: 3, gain: 0.3 });
  }

  ui(kind = 'click') {
    if (!this.enabled) return;
    const t = this.now;
    const out = this._out(null);
    if (kind === 'error') this._tone(out, t, 0.15, { type: 'square', freq: 140, gain: 0.05 });
    else if (kind === 'craft') {
      this._noise(out, t, 0.08, { type: 'bandpass', freq: 1400, q: 2, gain: 0.3 });
      this._noise(out, t + 0.12, 0.08, { type: 'bandpass', freq: 1900, q: 2, gain: 0.3 });
      this._tone(out, t + 0.2, 0.2, { type: 'triangle', freq: 520, freqEnd: 780, gain: 0.08 });
    } else this._noise(out, t, 0.03, { type: 'bandpass', freq: 2200, q: 2, gain: 0.15 });
  }

  // A church bell: inharmonic partials with long, staggered decays.
  bell(distance = 1, strikes = 1) {
    if (!this.enabled) return;
    const ctx = this.ctx;
    const base = 98;
    const partials = [
      [0.5, 0.9, 9], [1, 0.7, 7], [1.19, 0.5, 5], [1.5, 0.35, 4], [2.0, 0.4, 3.5],
      [2.51, 0.2, 2.5], [2.66, 0.18, 2.2], [3.01, 0.15, 1.8], [4.1, 0.08, 1.2],
    ];
    for (let s = 0; s < strikes; s++) {
      const t = this.now + s * 3.2;
      const out = ctx.createGain();
      out.gain.value = 0.55 * distance;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2400 * distance + 400;
      out.connect(lp);
      lp.connect(this.sfx);
      const send = ctx.createGain();
      send.gain.value = 0.9;
      lp.connect(send);
      send.connect(this.reverb);
      for (const [ratio, amp, dec] of partials) {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = base * ratio * (1 + (Math.random() - 0.5) * 0.002);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(amp * 0.4, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
        o.connect(g);
        g.connect(out);
        o.start(t);
        o.stop(t + dec + 0.1);
      }
      this._noise(out, t, 0.05, { type: 'bandpass', freq: 2000, q: 1, gain: 0.3 });
    }
  }

  // ---- Ambience ------------------------------------------------------------

  startAmbience() {
    if (!this.enabled || this.amb) return;
    const ctx = this.ctx;
    const amb = { nodes: [] };
    // wind
    const wind = ctx.createBufferSource();
    wind.buffer = this.brownBuf;
    wind.loop = true;
    const wf = ctx.createBiquadFilter();
    wf.type = 'lowpass';
    wf.frequency.value = 500;
    const wg = ctx.createGain();
    wg.gain.value = 0.18;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 250;
    lfo.connect(lfoG);
    lfoG.connect(wf.frequency);
    wind.connect(wf);
    wf.connect(wg);
    wg.connect(this.master);
    wind.start();
    lfo.start();
    // water lapping
    const water = ctx.createBufferSource();
    water.buffer = this.noiseBuf;
    water.loop = true;
    const wtf = ctx.createBiquadFilter();
    wtf.type = 'bandpass';
    wtf.frequency.value = 350;
    wtf.Q.value = 0.8;
    const wtg = ctx.createGain();
    wtg.gain.value = 0.0;
    const wl = ctx.createOscillator();
    wl.frequency.value = 0.35;
    const wlg = ctx.createGain();
    wlg.gain.value = 0.03;
    wl.connect(wlg);
    wlg.connect(wtg.gain);
    water.connect(wtf);
    wtf.connect(wtg);
    wtg.connect(this.master);
    water.start();
    wl.start();
    // night insects
    const bug = ctx.createOscillator();
    bug.type = 'square';
    bug.frequency.value = 4200;
    const bugAm = ctx.createOscillator();
    bugAm.frequency.value = 22;
    const bugAmG = ctx.createGain();
    bugAmG.gain.value = 0.5;
    const bugG = ctx.createGain();
    bugG.gain.value = 0;
    const bugF = ctx.createBiquadFilter();
    bugF.type = 'bandpass';
    bugF.frequency.value = 4200;
    bugF.Q.value = 10;
    bugAm.connect(bugAmG);
    bugAmG.connect(bugG.gain);
    bug.connect(bugF);
    bugF.connect(bugG);
    const bugOut = ctx.createGain();
    bugOut.gain.value = 0;
    bugG.connect(bugOut);
    bugOut.connect(this.master);
    bug.start();
    bugAm.start();
    // dread drone (after the toll)
    const drone = ctx.createOscillator();
    drone.type = 'sawtooth';
    drone.frequency.value = 41;
    const drone2 = ctx.createOscillator();
    drone2.type = 'sawtooth';
    drone2.frequency.value = 41.6;
    const df = ctx.createBiquadFilter();
    df.type = 'lowpass';
    df.frequency.value = 160;
    const dg = ctx.createGain();
    dg.gain.value = 0;
    drone.connect(df);
    drone2.connect(df);
    df.connect(dg);
    dg.connect(this.master);
    drone.start();
    drone2.start();
    amb.windGain = wg;
    amb.bugOut = bugOut;
    amb.droneGain = dg;
    amb.waterGain = wtg;
    amb.stop = () => {
      for (const n of [wind, lfo, water, wl, bug, bugAm, drone, drone2]) {
        try { n.stop(); } catch (_) { /* already stopped */ }
      }
      for (const g of [wg, wtg, bugOut, dg]) g.disconnect();
    };
    this.amb = amb;
  }

  setAmbience({ wind = 0.18, insects = 0, drone = 0 }) {
    if (!this.amb) return;
    const t = this.now;
    this.amb.windGain.gain.setTargetAtTime(wind, t, 1);
    this.amb.bugOut.gain.setTargetAtTime(insects * 0.012, t, 2);
    this.amb.droneGain.gain.setTargetAtTime(drone * 0.08, t, 3);
  }

  stopAmbience() {
    if (this.amb) {
      this.amb.stop();
      this.amb = null;
    }
  }
}
