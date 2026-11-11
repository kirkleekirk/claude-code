// Fully synthesised audio (no assets): one-shot effects, held loops and an ambient bed.
export class Audio {
  constructor() { this.ctx = null; this.volume = 0.8; this.loops = {}; this.amb = null; this.ambKind = null; this.muted = false; }

  // Must be called from a user gesture.
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 5;
      this.master.connect(comp); comp.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 1.5;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      if (this.ambKind) { const k = this.ambKind; this.ambKind = null; this.setAmbient(k); }
    } catch (e) { this.ctx = null; }
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }

  _tone(type, f0, f1, dur, vol, attack = 0.005, delay = 0) {
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  _noise(dur, vol, f0, f1, q = 1, type = 'bandpass', delay = 0) {
    const c = this.ctx, t = c.currentTime + delay;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t, Math.random()); s.stop(t + dur + 0.02);
  }

  play(name, v = 1) {
    if (!this.ctx || this.muted) return;
    const T = (...a) => this._tone(...a), N = (...a) => this._noise(...a);
    switch (name) {
      case 'shot': T('sawtooth', 920, 240, 0.12, 0.16 * v); T('sine', 1500, 500, 0.08, 0.1 * v); break;
      case 'eshot': T('square', 420, 140, 0.2, 0.1 * v); break;
      case 'hit': N(0.08, 0.2 * v, 2400, 700, 2); T('triangle', 320, 140, 0.08, 0.12 * v); break;
      case 'die': T('sawtooth', 300, 50, 0.4, 0.2 * v); N(0.3, 0.18 * v, 900, 150, 1); break;
      case 'boom': N(1.3, 0.5 * v, 500, 40, 0.7, 'lowpass'); T('sine', 120, 30, 1.2, 0.5 * v); break;
      case 'break': N(0.25, 0.28 * v, 3200, 500, 1.5); T('triangle', 880, 1760, 0.18, 0.1 * v, 0.005, 0.04); break;
      case 'jump': T('sine', 240, 420, 0.14, 0.14 * v); break;
      case 'boost': N(0.3, 0.22 * v, 600, 2600, 1.2); T('sine', 300, 900, 0.22, 0.14 * v); break;
      case 'land': N(0.12, 0.2 * v, 300, 90, 1, 'lowpass'); break;
      case 'step': N(0.05, 0.12 * v, 500 + Math.random() * 300, 200, 1.5); break;
      case 'dash': N(0.26, 0.26 * v, 4000, 300, 2); T('sine', 1200, 200, 0.24, 0.12 * v); break;
      case 'arc': N(0.35, 0.3 * v, 5000, 1200, 4); T('sawtooth', 1800, 90, 0.3, 0.16 * v); T('square', 60, 40, 0.3, 0.2 * v); break;
      case 'shield': T('sine', 260, 780, 0.35, 0.2 * v, 0.05); T('sine', 390, 1170, 0.4, 0.12 * v, 0.05); break;
      case 'block': T('triangle', 900, 500, 0.12, 0.18 * v); break;
      case 'hurt': T('sawtooth', 220, 90, 0.2, 0.22 * v); N(0.12, 0.2 * v, 800, 200, 1); break;
      case 'warn': T('square', 660, 660, 0.12, 0.1 * v); T('square', 660, 660, 0.12, 0.1 * v, 0.005, 0.2); break;
      case 'use': T('sine', 520, 1040, 0.25, 0.16 * v, 0.02); break;
      case 'ui': T('sine', 880, 1100, 0.06, 0.1 * v); break;
      case 'craft': [523, 659, 784, 1047].forEach((f, i) => T('triangle', f, f, 0.22, 0.14 * v, 0.01, i * 0.07)); break;
      case 'build': N(0.5, 0.2 * v, 300, 2400, 1); [392, 523, 659, 784, 1047].forEach((f, i) => T('triangle', f, f, 0.3, 0.13 * v, 0.01, 0.1 + i * 0.08)); break;
      case 'pickup': T('sine', 780 + Math.random() * 120, 1400, 0.09, 0.1 * v); break;
      case 'alert': T('sawtooth', 180, 320, 0.3, 0.12 * v, 0.05); break;
      case 'bite': N(0.1, 0.22 * v, 1500, 300, 2); break;
      case 'slam': N(0.6, 0.45 * v, 260, 40, 0.8, 'lowpass'); T('sine', 90, 35, 0.5, 0.4 * v); break;
      case 'ring': [659, 988, 1319].forEach((f, i) => T('sine', f, f, 0.7, 0.13 * v, 0.01, i * 0.05)); break;
      case 'door': N(1.0, 0.25 * v, 120, 60, 2, 'lowpass'); T('sine', 70, 50, 1.0, 0.25 * v, 0.1); break;
      case 'warp': N(2.4, 0.3 * v, 200, 6000, 1.5); T('sawtooth', 60, 900, 2.2, 0.16 * v, 0.4); T('sine', 90, 1400, 2.4, 0.16 * v, 0.4); break;
      case 'quest': [523, 784, 1047, 1568].forEach((f, i) => T('sine', f, f, 0.5, 0.12 * v, 0.02, i * 0.11)); break;
      case 'key': [392, 523, 659, 784, 1047, 1319].forEach((f, i) => T('triangle', f, f, 0.9, 0.12 * v, 0.02, i * 0.12)); break;
      default: break;
    }
  }

  // Sustained sound whose level follows repeated calls (0 fades it out).
  loop(name, vol) {
    if (!this.ctx) return;
    let L = this.loops[name];
    if (!L) {
      if (vol <= 0) return;
      const c = this.ctx, g = c.createGain();
      g.gain.value = 0;
      g.connect(this.master);
      const nodes = [];
      if (name === 'beam') {
        const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 196;
        const o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.value = 1176;
        const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 2;
        o.connect(f); f.connect(g); const g2 = c.createGain(); g2.gain.value = 0.3; o2.connect(g2); g2.connect(g);
        o.start(); o2.start(); nodes.push(o, o2);
      } else {
        const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
        const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 0.8;
        s.connect(f); f.connect(g); s.start(); nodes.push(s);
      }
      L = this.loops[name] = { g, nodes };
    }
    L.g.gain.setTargetAtTime(this.muted ? 0 : vol, this.ctx.currentTime, 0.05);
  }

  setAmbient(kind) {
    if (kind === this.ambKind) return;
    this.ambKind = kind;
    if (!this.ctx) return;
    const c = this.ctx;
    if (this.amb) { const old = this.amb; old.g.gain.setTargetAtTime(0, c.currentTime, 0.8); setTimeout(() => old.nodes.forEach((n) => { try { n.stop(); } catch (e) { /* done */ } }), 4000); this.amb = null; }
    if (!kind) return;
    const chords = { veyra: [110, 164.8, 247, 329.6], korr: [73.4, 110, 155.6], vault: [65.4, 98, 146.8, 207.6], earth: [130.8, 196, 246.9, 392], title: [98, 146.8, 220, 293.7] };
    const freqs = chords[kind] || chords.veyra;
    const g = c.createGain(); g.gain.value = 0; g.connect(this.master);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = kind === 'vault' ? 420 : 700; lp.Q.value = 0.7;
    lp.connect(g);
    const nodes = [];
    const lfo = c.createOscillator(); lfo.frequency.value = 0.07; const lg = c.createGain(); lg.gain.value = 220; lfo.connect(lg); lg.connect(lp.frequency); lfo.start(); nodes.push(lfo);
    for (const f of freqs) for (const det of [-5, 6]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
      const og = c.createGain(); og.gain.value = 0.045;
      o.connect(og); og.connect(lp); o.start(); nodes.push(o);
    }
    const w = c.createBufferSource(); w.buffer = this.noiseBuf; w.loop = true;
    const wf = c.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = kind === 'korr' ? 180 : 480; wf.Q.value = 0.5;
    const wg = c.createGain(); wg.gain.value = kind === 'vault' ? 0.025 : 0.07;
    w.connect(wf); wf.connect(wg); wg.connect(g); w.start(); nodes.push(w);
    g.gain.setTargetAtTime(0.5, c.currentTime, 1.5);
    this.amb = { g, nodes };
  }
}
