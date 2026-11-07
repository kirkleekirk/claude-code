// Procedural sound effects with WebAudio (no audio files). Starts after the
// first user gesture, as browsers require.
export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    const start = () => {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); return; }
      try {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.5;
        this.master.connect(this.ctx.destination);
        this.noiseBuf = this.makeNoise();
        this.startAmbience();
      } catch (e) { this.enabled = false; }
    };
    addEventListener('pointerdown', start, { once: false });
    addEventListener('touchend', start, { once: false });
    addEventListener('keydown', start, { once: false });
  }
  makeNoise() {
    const c = this.ctx, b = c.createBuffer(1, c.sampleRate * 1.5, c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  ok() { return this.ctx && this.enabled && this.ctx.state === 'running'; }
  env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  noise(dur, freq, q, peak, type = 'bandpass', dest = this.master) {
    if (!this.ok()) return;
    const c = this.ctx, t = c.currentTime;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    s.connect(f); f.connect(g); g.connect(dest);
    this.env(g, t, 0.005, peak, dur);
    s.start(t, Math.random() * 0.5, dur + 0.1);
  }
  tone(freq, dur, peak, type = 'sine', slide = 0) {
    if (!this.ok()) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    const g = c.createGain();
    o.connect(g); g.connect(this.master);
    this.env(g, t, 0.01, peak, dur);
    o.start(t); o.stop(t + dur + 0.05);
  }
  swoosh() { this.noise(0.18, 900, 0.8, 0.25); }
  thud() { this.noise(0.12, 220, 1.2, 0.8, 'lowpass'); this.tone(90, 0.12, 0.4, 'sine', -40); }
  gunshot() { this.noise(0.35, 1400, 0.4, 1.0, 'lowpass'); this.tone(120, 0.2, 0.6, 'square', -80); }
  bang() { this.noise(0.15, 160, 1.5, 0.6, 'lowpass'); }
  build() { this.noise(0.06, 2400, 3, 0.35); setTimeout(() => this.noise(0.06, 2000, 3, 0.3), 110); }
  salvage() { this.noise(0.25, 600, 1, 0.35); }
  pickup() { this.tone(660, 0.08, 0.15, 'triangle'); setTimeout(() => this.tone(880, 0.1, 0.12, 'triangle'), 70); }
  hurt() { this.tone(160, 0.2, 0.3, 'sawtooth', -60); }
  groan(pos, dist) {
    if (!this.ok()) return;
    const v = Math.max(0, 0.22 * (1 - dist / 30));
    if (v < 0.01) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = 'sawtooth';
    const f0 = 70 + Math.random() * 40;
    o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f0 * 0.8, t + 1.1);
    const flt = c.createBiquadFilter(); flt.type = 'bandpass'; flt.frequency.value = 500 + Math.random() * 300; flt.Q.value = 4;
    const g = c.createGain();
    o.connect(flt); flt.connect(g); g.connect(this.master);
    this.env(g, t, 0.15, v, 1.0);
    o.start(t); o.stop(t + 1.3);
  }
  thunder() { this.noise(2.5, 90, 0.7, 0.9, 'lowpass'); }
  startAmbience() {
    // soft wind bed; volume follows weather via setWind()
    const c = this.ctx;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 400;
    const g = c.createGain(); g.gain.value = 0.03;
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start();
    this.windGain = g; this.windFilter = f;
  }
  setWind(w, rain) {
    if (!this.windGain) return;
    this.windGain.gain.value = 0.02 + w * 0.05 + rain * 0.06;
    this.windFilter.frequency.value = 300 + w * 500 + rain * 1500;
  }
}
