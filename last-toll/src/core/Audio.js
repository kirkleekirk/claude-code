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

    // Shared reverb bus for the outdoor slap and distant sounds.
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

  gunshot(kind, pos, suppressed = false, loudness = 50) {
    if (!this.enabled) return;
    const t = this.now;
    if (suppressed && loudness > 14) {
      // a scrap suppressor: quieter, but it still coughs
      const out = this._out(pos, { ref: 2.5, reverb: 0.15 });
      this._noise(out, t, 0.2, { type: 'lowpass', freq: 1400, freqEnd: 300, gain: 0.55 });
      this._tone(out, t, 0.1, { freq: 150, freqEnd: 50, gain: 0.35 });
      return;
    }
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
      zip_pistol: { g: 1.05, body: 900, tail: 0.45, thump: 110 },
      pipe_shotgun: { g: 1.6, body: 650, tail: 0.8, thump: 70 },
      sawed_off: { g: 1.6, body: 700, tail: 0.8, thump: 80 },
      old_rifle: { g: 1.4, body: 1700, tail: 0.8, thump: 100 },
      m1911: { g: 1.15, body: 1000, tail: 0.45, thump: 110 },
      lever_rifle: { g: 1.2, body: 1300, tail: 0.55, thump: 120 },
      smg: { g: 0.85, body: 1500, tail: 0.25, thump: 150 },
      m17: { g: 1.0, body: 1450, tail: 0.35, thump: 150 },
      ar15: { g: 1.25, body: 2400, tail: 0.6, thump: 120 },
      m4: { g: 1.2, body: 2400, tail: 0.5, thump: 120 },
      combat_shotgun: { g: 1.4, body: 850, tail: 0.65, thump: 90 },
      dmr: { g: 1.45, body: 2100, tail: 0.85, thump: 100 },
      explosion: { g: 2.2, body: 420, tail: 1.6, thump: 45 },
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
      case 'breakOpen': click(0, 900, 0.45, 0.06); this._noise(out, t + 0.04, 0.08, { type: 'bandpass', freq: 600, q: 2, gain: 0.25 }); break;
      case 'breakClose': click(0, 800, 0.55, 0.05); ping(0.02, 1500, 0.1); break;
      case 'lever': this._noise(out, t, 0.07, { type: 'bandpass', freq: 1100, q: 3, gain: 0.4 }); click(0.12, 2200, 0.45); break;
      case 'bench': click(0, 1400, 0.3, 0.05); click(0.08, 900, 0.35, 0.06); ping(0.14, 2600, 0.06); break;
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

  // Curfew siren: a rising and falling wail from far across the water.
  siren(duration = 9) {
    if (!this.enabled) return;
    const ctx = this.ctx;
    const t = this.now;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.32, t + 1.2);
    out.gain.setValueAtTime(0.32, t + duration - 1.5);
    out.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1400;
    out.connect(lp);
    lp.connect(this.sfx);
    const send = ctx.createGain();
    send.gain.value = 0.8;
    lp.connect(send);
    send.connect(this.reverb);
    for (const [type, mul, g] of [['sawtooth', 1, 0.5], ['square', 1.006, 0.25], ['sine', 0.5, 0.6]]) {
      const o = ctx.createOscillator();
      o.type = type;
      const og = ctx.createGain();
      og.gain.value = g;
      const base = 280 * mul;
      o.frequency.setValueAtTime(base, t);
      for (let k = 0; k < duration / 3; k++) {
        o.frequency.linearRampToValueAtTime(base * 2.2, t + k * 3 + 1.5);
        o.frequency.linearRampToValueAtTime(base, t + k * 3 + 3);
      }
      o.connect(og);
      og.connect(out);
      o.start(t);
      o.stop(t + duration + 0.1);
    }
  }

  // The herder pylons: a sub-bass throb with a thin dissonant whine on top.
  herderPulse(duration = 7, level = 1) {
    if (!this.enabled) return;
    const ctx = this.ctx;
    const t = this.now;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.5 * level, t + 1);
    out.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    out.connect(this.sfx);
    const sub = ctx.createOscillator();
    sub.frequency.value = 38;
    const am = ctx.createGain();
    am.gain.value = 0.6;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 1.6;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 0.5;
    lfo.connect(lfoG);
    lfoG.connect(am.gain);
    sub.connect(am);
    am.connect(out);
    const whine = ctx.createOscillator();
    whine.type = 'sine';
    whine.frequency.setValueAtTime(1480, t);
    whine.frequency.linearRampToValueAtTime(1395, t + duration);
    const wg = ctx.createGain();
    wg.gain.value = 0.05;
    whine.connect(wg);
    wg.connect(out);
    for (const n of [sub, lfo, whine]) { n.start(t); n.stop(t + duration + 0.1); }
  }

  thunder(delay = 1) {
    if (!this.enabled) return;
    const t = this.now + delay;
    const out = this._out(null, { reverb: 0.5 });
    this._noise(out, t, 0.25, { type: 'lowpass', freq: 1800, freqEnd: 300, gain: 0.5 * Math.min(1, 1.5 / delay) });
    this._noise(out, t + 0.1, 4.5, { type: 'lowpass', freq: 380, freqEnd: 60, gain: 0.9, attack: 0.2, buf: this.brownBuf });
    this._noise(out, t + 0.8, 2.5, { type: 'lowpass', freq: 220, freqEnd: 60, gain: 0.5, attack: 0.3, buf: this.brownBuf });
  }

  laserCharge(pos, dur = 0.6) {
    if (!this.enabled) return;
    const t = this.now;
    const out = this._out(pos, { ref: 3, rolloff: 1 });
    this._tone(out, t, dur, { type: 'sawtooth', freq: 220, freqEnd: 1900, gain: 0.08, attack: dur * 0.8 });
    this._tone(out, t, dur, { type: 'sine', freq: 440, freqEnd: 3800, gain: 0.05, attack: dur * 0.8 });
  }

  laser(pos, player = false) {
    if (!this.enabled) return;
    const t = this.now;
    const out = this._out(pos, { ref: player ? 2 : 4, rolloff: 0.9, reverb: 0.35 });
    this._tone(out, t, 0.22, { type: 'sawtooth', freq: 2600, freqEnd: 180, gain: 0.35 });
    this._tone(out, t, 0.16, { type: 'square', freq: 1300, freqEnd: 90, gain: 0.12 });
    this._noise(out, t, 0.12, { type: 'bandpass', freq: 3200, q: 1.5, gain: 0.45 });
    this._noise(out, t + 0.02, 0.35, { type: 'highpass', freq: 5000, gain: 0.12 });
  }

  burn(pos) {
    if (!this.enabled) return;
    const out = this._out(pos, { ref: 1.5 });
    this._noise(out, this.now, 0.3, { type: 'highpass', freq: 2500, gain: 0.3 });
  }

  splash(pos, big = 1) {
    if (!this.enabled) return;
    const t = this.now;
    const out = this._out(pos, { ref: 3 });
    this._noise(out, t, 0.5 * big, { type: 'lowpass', freq: 1600, freqEnd: 300, gain: 0.55 * big });
    this._noise(out, t + 0.05, 0.3, { type: 'bandpass', freq: 800, q: 1, gain: 0.3 });
    for (let i = 0; i < 4; i++) this._tone(out, t + 0.35 + Math.random() * 0.6, 0.05, { type: 'sine', freq: 900 + Math.random() * 900, freqEnd: 500, gain: 0.05 });
  }

  wade() {
    if (!this.enabled) return;
    const out = this._out(null);
    this._noise(out, this.now, 0.25, { type: 'lowpass', freq: 900, freqEnd: 300, gain: 0.12 });
  }

  // A looping hum for things that hover: returns a handle to move and stop it.
  hum(pos, freq = 118) {
    if (!this.enabled) return null;
    const ctx = this.ctx;
    const p = ctx.createPanner();
    p.panningModel = 'equalpower';
    p.distanceModel = 'inverse';
    p.refDistance = 4;
    p.rolloffFactor = 1.2;
    p.connect(this.sfx);
    const g = ctx.createGain();
    g.gain.value = 0.14;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 520;
    f.Q.value = 0.8;
    f.connect(g);
    g.connect(p);
    const oscs = [freq, freq * 1.03, freq * 2.01].map((fr, i) => {
      const o = ctx.createOscillator();
      o.type = i === 2 ? 'square' : 'sawtooth';
      o.frequency.value = fr;
      o.connect(f);
      o.start();
      return o;
    });
    const set = (v) => {
      if (p.positionX) { p.positionX.value = v.x; p.positionY.value = v.y; p.positionZ.value = v.z; } else p.setPosition(v.x, v.y, v.z);
    };
    set(pos);
    return {
      set,
      level: (v) => g.gain.setTargetAtTime(v, ctx.currentTime, 0.2),
      stop: () => { for (const o of oscs) { try { o.stop(); } catch (_) { /* stopped */ } } p.disconnect(); },
    };
  }

  alarm(pos) {
    if (!this.enabled) return;
    const t = this.now;
    const out = this._out(pos, { ref: 6, rolloff: 0.7 });
    for (let i = 0; i < 4; i++) {
      this._tone(out, t + i * 0.32, 0.14, { type: 'square', freq: 1320, gain: 0.12 });
      this._tone(out, t + i * 0.32 + 0.16, 0.14, { type: 'square', freq: 990, gain: 0.12 });
    }
  }

  radio() {
    if (!this.enabled) return;
    const out = this._out(null);
    this._noise(out, this.now, 0.6, { type: 'bandpass', freq: 2200, q: 0.8, gain: 0.08, attack: 0.05 });
  }

  // Spoken Guard broadcasts through the browser's speech engine, when it has one.
  broadcast(text) {
    if (!this.enabled) return;
    this.radio();
    try {
      const synth = window.speechSynthesis;
      if (!synth) return;
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 0.82;
      u.pitch = 0.45;
      u.volume = Math.min(1, this.volume * 0.9);
      synth.cancel();
      synth.speak(u);
    } catch (_) { /* speech is optional */ }
  }

  // A crew member's line, read aloud if the browser has a voice for it.
  speak(text, voice = {}, enabled = true) {
    if (!this.enabled || !enabled) return;
    try {
      const synth = window.speechSynthesis;
      if (!synth) return;
      const u = new SpeechSynthesisUtterance(text.replace(/\.\.\./g, ','));
      u.rate = voice.rate ?? 0.95;
      u.pitch = voice.pitch ?? 1;
      u.lang = voice.lang || 'en-US';
      u.volume = Math.min(1, this.volume * 0.95);
      synth.cancel();
      synth.speak(u);
    } catch (_) { /* speech is optional */ }
  }

  hush() {
    try { window.speechSynthesis?.cancel(); } catch (_) { /* optional */ }
  }

  // The demolition charge's timer.
  beep(pos, urgent = false) {
    if (!this.enabled) return;
    const t = this.now;
    const out = this._out(pos, { ref: 3, rolloff: 1.1 });
    this._tone(out, t, 0.07, { type: 'square', freq: urgent ? 1760 : 1320, gain: 0.07 });
  }

  // ---- Distant horror, placed around the listener -----------------------------

  _around(dist) {
    const a = Math.random() * Math.PI * 2;
    const l = this.listenerPos;
    return { x: l.x + Math.cos(a) * dist, y: 1.5, z: l.z + Math.sin(a) * dist };
  }

  scream() {
    if (!this.enabled) return;
    const ctx = this.ctx;
    const t = this.now;
    const out = this._out(this._around(40 + Math.random() * 30), { ref: 8, rolloff: 0.6, reverb: 0.8 });
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    const f0 = 480 + Math.random() * 200;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.linearRampToValueAtTime(f0 * 1.5, t + 0.3);
    o.frequency.linearRampToValueAtTime(f0 * 0.7, t + 1.4);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1100;
    bp.Q.value = 3;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18, t + 0.1);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
    o.connect(bp);
    bp.connect(g);
    g.connect(out);
    o.start(t);
    o.stop(t + 1.6);
  }

  distantShots() {
    if (!this.enabled) return;
    const pos = this._around(80 + Math.random() * 40);
    const n = 1 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) setTimeout(() => (Math.random() < 0.5 ? this.laser(pos) : this.gunshot('rifle', pos)), i * (180 + Math.random() * 300));
  }

  creak() {
    if (!this.enabled) return;
    this.open(this._around(6 + Math.random() * 10), 'wood');
  }

  chime() {
    if (!this.enabled) return;
    const t = this.now;
    const out = this._out(this._around(8 + Math.random() * 10), { ref: 3, reverb: 0.6 });
    for (let i = 0; i < 4; i++) {
      const f = [1318, 1568, 1760, 2093, 2349][Math.floor(Math.random() * 5)];
      this._tone(out, t + i * (0.2 + Math.random() * 0.3), 1.8, { type: 'sine', freq: f, gain: 0.03 });
    }
  }

  frogs() {
    if (!this.enabled) return;
    const t = this.now;
    const out = this._out(this._around(10 + Math.random() * 25), { ref: 4 });
    const n = 3 + Math.floor(Math.random() * 5);
    const f = 110 + Math.random() * 80;
    for (let i = 0; i < n; i++) {
      this._tone(out, t + i * 0.28, 0.16, { type: 'square', freq: f, freqEnd: f * 0.7, gain: 0.05 });
      this._noise(out, t + i * 0.28, 0.1, { type: 'bandpass', freq: 600, q: 4, gain: 0.05 });
    }
  }

  gatorBellow() {
    if (!this.enabled) return;
    const out = this._out(this._around(30 + Math.random() * 30), { ref: 6, reverb: 0.3 });
    this._noise(out, this.now, 1.6, { type: 'lowpass', freq: 180, freqEnd: 90, gain: 0.5, attack: 0.3, buf: this.brownBuf });
    this._tone(out, this.now, 1.5, { type: 'sawtooth', freq: 48, freqEnd: 42, gain: 0.12, attack: 0.3 });
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
    // dread drone (during the Sweep)
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
