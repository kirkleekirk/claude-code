// All audio is synthesised: SFX from oscillators + noise, an adaptive generative score
// (dusty minor pentatonic, western-noir) with calm/hustle/raid/chase layers, and ambience.

const SCALE = [0, 3, 5, 7, 10]; // minor pentatonic intervals
const ROOT = 110; // A2
const PROG = [0, 0, 10, 7, 0, 0, 5, 7]; // A A G E | A A D E (semitones over root), 2 bars each
const LAYERS = ['pad', 'guitar', 'bass', 'perc', 'ostinato', 'chase'];
const MIX = {
  calm: [0.9, 0.9, 0.15, 0, 0, 0], hustle: [0.6, 1, 0.9, 0.6, 0, 0],
  raid: [0.4, 0.5, 1, 0.9, 0.8, 0], chase: [0.3, 0.3, 1, 1, 0.9, 1], menu: [0.8, 0.8, 0.4, 0.2, 0, 0],
};
const CUES = { alarm: 'Alarm bell', explosion: 'Explosion', dog_bark: 'Dog barking', alert: 'Guard alerted', siren: 'Warden siren', kaching: 'Ka-ching', levelup: 'Rank up', death: 'You went down', door: 'Door creaks', jam: 'Gun jammed', shot_heavy: 'Heavy gunfire', fire_whoosh: 'Fire' };

const hz = (semi) => ROOT * Math.pow(2, semi / 12);

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.vol = { master: 0.8, music: 0.55, sfx: 0.8 };
    this.mood = 'menu';
    this.layerGain = {};
    this.step = 0;
    this.nextTime = 0;
    this.melody = 2;
    this.onCue = null;
    this.ambNight = 0;
    this.ambMachine = 0;
    this.lastPlay = {};
  }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const c = this.ctx = new AC();
      this.master = c.createGain(); this.master.connect(c.destination);
      this.musicBus = c.createGain(); this.musicBus.connect(this.master);
      this.sfxBus = c.createGain(); this.sfxBus.connect(this.master);
      this.ambBus = c.createGain(); this.ambBus.connect(this.master);
      const len = c.sampleRate * 2;
      this.noise = c.createBuffer(1, len, c.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      for (const L of LAYERS) { const g = c.createGain(); g.gain.value = 0; g.connect(this.musicBus); this.layerGain[L] = g; }
      this.applyVolumes();
      this.startAmbience();
      this.nextTime = c.currentTime + 0.1;
      this.timer = setInterval(() => this.schedule(), 25);
    } catch (e) { this.ctx = null; }
  }

  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.vol.master, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.vol.music * 0.5, t, 0.1);
    this.sfxBus.gain.setTargetAtTime(this.vol.sfx * 0.7, t, 0.05);
    this.ambBus.gain.setTargetAtTime(this.vol.sfx * 0.5, t, 0.1);
  }
  setVolumes(v) { Object.assign(this.vol, v); this.applyVolumes(); }
  setMuted(m) { this.muted = m; this.applyVolumes(); }
  setMood(m) { this.mood = MIX[m] ? m : 'calm'; }

  // ---------- primitives ----------
  osc(type, f0, f1, t0, dur, gain, dest, attack = 0.005) {
    const c = this.ctx;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dest);
    o.start(t0); o.stop(t0 + dur + 0.05);
    return o;
  }
  noiseHit(t0, dur, gain, type, freq, q, dest, f1) {
    const c = this.ctx;
    const s = c.createBufferSource(); s.buffer = this.noise;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t0); f.Q.value = q;
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(dest);
    s.start(t0, Math.random() * 1.5); s.stop(t0 + dur + 0.05);
  }

  // ---------- SFX ----------
  play(name, vol = 1, pan = 0) {
    if (!this.ctx || this.muted) { if (this.onCue && CUES[name]) this.onCue(CUES[name]); return; }
    const now = this.ctx.currentTime;
    if (this.lastPlay[name] && now - this.lastPlay[name] < 0.025) return;
    this.lastPlay[name] = now;
    if (this.onCue && CUES[name]) this.onCue(CUES[name]);
    let dest = this.sfxBus;
    if (pan && this.ctx.createStereoPanner) { const p = this.ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); p.connect(this.sfxBus); dest = p; }
    if (vol !== 1) { const g = this.ctx.createGain(); g.gain.value = vol; g.connect(dest); dest = g; }
    const t = now + 0.005;
    const v = vol;
    void v;
    switch (name) {
      case 'ui': this.osc('sine', 900, 1300, t, 0.05, 0.15, dest); break;
      case 'ui_back': this.osc('sine', 700, 420, t, 0.06, 0.13, dest); break;
      case 'ui_error': this.osc('square', 170, 150, t, 0.14, 0.08, dest); break;
      case 'tab': this.osc('triangle', 520, 640, t, 0.05, 0.12, dest); break;
      case 'kaching': this.osc('triangle', 1320, 1320, t, 0.25, 0.18, dest); this.osc('triangle', 1760, 1760, t + 0.07, 0.35, 0.16, dest); this.noiseHit(t, 0.12, 0.12, 'highpass', 5000, 1, dest); break;
      case 'coin': this.osc('triangle', 1600, 2000, t, 0.08, 0.1, dest); break;
      case 'shot_sidearm': this.noiseHit(t, 0.12, 0.7, 'bandpass', 1600, 0.8, dest, 500); this.osc('sine', 180, 60, t, 0.1, 0.5, dest); break;
      case 'shot_shotgun': this.noiseHit(t, 0.35, 0.9, 'lowpass', 2400, 0.7, dest, 300); this.osc('sine', 110, 40, t, 0.22, 0.7, dest); break;
      case 'shot_rifle': this.noiseHit(t, 0.28, 0.8, 'bandpass', 2600, 0.6, dest, 400); this.noiseHit(t + 0.03, 0.4, 0.15, 'lowpass', 800, 0.5, dest); this.osc('sine', 150, 50, t, 0.14, 0.55, dest); break;
      case 'shot_smg': this.noiseHit(t, 0.07, 0.55, 'bandpass', 2000, 1, dest, 900); this.osc('square', 140, 70, t, 0.05, 0.18, dest); break;
      case 'shot_silent': this.osc('triangle', 420, 180, t, 0.12, 0.25, dest); this.noiseHit(t, 0.1, 0.18, 'highpass', 3000, 0.5, dest); break;
      case 'shot_heavy': this.noiseHit(t, 0.45, 1, 'lowpass', 1800, 0.6, dest, 200); this.osc('sine', 90, 30, t, 0.35, 0.9, dest); break;
      case 'reload': this.noiseHit(t, 0.03, 0.35, 'bandpass', 3000, 3, dest); this.noiseHit(t + 0.18, 0.04, 0.4, 'bandpass', 2200, 3, dest); break;
      case 'jam': case 'empty': this.noiseHit(t, 0.025, 0.4, 'bandpass', 4000, 4, dest); break;
      case 'hit': this.noiseHit(t, 0.07, 0.4, 'lowpass', 900, 1, dest); this.osc('sine', 160, 90, t, 0.06, 0.25, dest); break;
      case 'hurt': this.osc('sawtooth', 240, 120, t, 0.16, 0.15, dest); this.noiseHit(t, 0.08, 0.2, 'lowpass', 700, 1, dest); break;
      case 'ko': this.osc('sine', 120, 50, t, 0.25, 0.4, dest); break;
      case 'explosion': this.noiseHit(t, 1.1, 1, 'lowpass', 1600, 0.7, dest, 80); this.osc('sine', 70, 25, t, 0.8, 0.9, dest); break;
      case 'fire_whoosh': this.noiseHit(t, 0.6, 0.5, 'bandpass', 400, 0.8, dest, 1500); break;
      case 'dog_bark': this.osc('sawtooth', 420, 280, t, 0.09, 0.2, dest); this.osc('sawtooth', 400, 260, t + 0.16, 0.1, 0.2, dest); break;
      case 'alarm': for (let k = 0; k < 4; k++) this.osc('square', k % 2 ? 900 : 620, k % 2 ? 900 : 620, t + k * 0.28, 0.26, 0.09, dest); break;
      case 'siren': for (let k = 0; k < 3; k++) this.osc('sawtooth', 500, 900, t + k * 0.5, 0.5, 0.07, dest); break;
      case 'door': this.osc('sawtooth', 110, 160, t, 0.3, 0.06, dest); break;
      case 'tick': this.noiseHit(t, 0.015, 0.25, 'highpass', 5000, 1, dest); break;
      case 'lock_ok': this.osc('triangle', 660, 660, t, 0.08, 0.15, dest); this.osc('triangle', 990, 990, t + 0.08, 0.15, 0.15, dest); break;
      case 'lock_fail': this.osc('square', 220, 140, t, 0.2, 0.08, dest); break;
      case 'dodge': case 'throw': this.noiseHit(t, 0.18, 0.25, 'bandpass', 900, 1, dest, 2500); break;
      case 'step': this.noiseHit(t, 0.03, 0.06, 'lowpass', 600, 1, dest); break;
      case 'levelup': [0, 3, 7, 12].forEach((s, k) => this.osc('triangle', hz(s + 24), hz(s + 24), t + k * 0.09, 0.4, 0.15, dest)); break;
      case 'achievement': [0, 7, 12, 15, 19].forEach((s, k) => this.osc('triangle', hz(s + 24), hz(s + 24), t + k * 0.07, 0.5, 0.12, dest)); break;
      case 'notify': this.osc('sine', 880, 880, t, 0.1, 0.1, dest); this.osc('sine', 1175, 1175, t + 0.09, 0.15, 0.1, dest); break;
      case 'harvest': this.osc('triangle', hz(31), hz(31), t, 0.2, 0.12, dest); this.osc('triangle', hz(36), hz(36), t + 0.06, 0.3, 0.1, dest); break;
      case 'craft': this.osc('square', 1240, 1180, t, 0.12, 0.07, dest); this.osc('square', 1660, 1600, t, 0.1, 0.05, dest); this.noiseHit(t, 0.05, 0.3, 'highpass', 2500, 1, dest); break;
      case 'plant': this.noiseHit(t, 0.08, 0.2, 'lowpass', 500, 1, dest); this.osc('sine', 660, 990, t + 0.05, 0.08, 0.06, dest); break;
      case 'water': for (let k = 0; k < 4; k++) this.noiseHit(t + k * 0.06, 0.05, 0.15, 'bandpass', 700 + k * 200, 6, dest); break;
      case 'alert': this.osc('square', 500, 1000, t, 0.15, 0.08, dest); break;
      case 'bell': this.osc('sine', 523, 523, t, 1.4, 0.12, dest); this.osc('sine', 1046, 1046, t, 0.9, 0.05, dest); break;
      case 'card': this.noiseHit(t, 0.05, 0.25, 'highpass', 2500, 1, dest); this.osc('sine', 440, 660, t + 0.03, 0.1, 0.06, dest); break;
      case 'death': [12, 7, 3, 0].forEach((s, k) => this.osc('triangle', hz(s), hz(s), t + k * 0.18, 0.5, 0.12, dest)); break;
      case 'heat': this.osc('sawtooth', 70, 60, t, 0.6, 0.08, dest); break;
      case 'engine': this.osc('sawtooth', 60, 75, t, 0.25, 0.05, dest); break;
      case 'melee': this.noiseHit(t, 0.08, 0.35, 'lowpass', 1200, 1, dest); break;
      default: this.osc('sine', 600, 600, t, 0.05, 0.08, dest);
    }
  }

  // ---------- generative music ----------
  schedule() {
    const c = this.ctx;
    if (!c) return;
    const target = MIX[this.mood] || MIX.calm;
    LAYERS.forEach((L, i) => this.layerGain[L].gain.setTargetAtTime(target[i], c.currentTime, 1.2));
    const spb = 60 / 92 / 4; // 16th notes at 92 bpm
    while (this.nextTime < c.currentTime + 0.15) {
      this.musicStep(this.step, this.nextTime);
      this.step++;
      this.nextTime += spb;
    }
    this.ambienceTick();
  }

  musicStep(step, t) {
    const bar = Math.floor(step / 16), s16 = step % 16;
    const chord = PROG[Math.floor(bar / 2) % PROG.length];
    const G = this.layerGain;
    if (s16 === 0 && bar % 2 === 0) {
      for (const semi of [chord, chord + 7, chord + 12]) {
        const o = this.osc('sawtooth', hz(semi + 12), hz(semi + 12), t, 4.4, 0.035, this.padFilter(), 0.9);
        o.detune.value = (Math.random() - 0.5) * 14;
      }
    }
    const dens = this.mood === 'calm' || this.mood === 'menu' ? 0.18 : this.mood === 'hustle' ? 0.32 : 0.42;
    if (s16 % 2 === 0 && Math.random() < dens) {
      this.melody = Math.max(0, Math.min(9, this.melody + [-2, -1, -1, 0, 1, 1, 2][Math.floor(Math.random() * 7)]));
      const semi = SCALE[this.melody % 5] + 12 * Math.floor(this.melody / 5) + 12;
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1800; f.connect(G.guitar);
      this.osc('triangle', hz(semi), hz(semi) * 0.995, t, 0.9, 0.16, f, 0.003);
      this.osc('sawtooth', hz(semi), hz(semi), t, 0.25, 0.04, f, 0.002);
    }
    if (s16 === 0 || s16 === 8 || (s16 === 14 && Math.random() < 0.5)) this.osc('triangle', hz(chord - 12), hz(chord - 12), t, 0.5, 0.3, G.bass, 0.01);
    if (s16 % 2 === 0) this.noiseHit(t, 0.04, s16 % 4 === 2 ? 0.16 : 0.08, 'highpass', 7000, 1, G.perc);
    if (s16 === 0 || s16 === 8) this.osc('sine', 120, 45, t, 0.18, 0.5, G.perc);
    if (s16 % 2 === 1 || Math.random() < 0.3) this.osc('square', hz(chord), hz(chord), t, 0.07, 0.03, G.ostinato);
    if (s16 % 4 === 2) { this.noiseHit(t, 0.12, 0.3, 'lowpass', 300, 1, G.chase); this.osc('sine', 180, 90, t, 0.12, 0.3, G.chase); }
    if (s16 % 1 === 0 && this.mood === 'chase') this.noiseHit(t, 0.02, 0.06, 'highpass', 9000, 1, G.chase);
  }

  padFilter() {
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 900; f.Q.value = 0.4;
    f.connect(this.layerGain.pad);
    return f;
  }

  // ---------- ambience ----------
  startAmbience() {
    const c = this.ctx;
    const s = c.createBufferSource(); s.buffer = this.noise; s.loop = true;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 500; f.Q.value = 0.6;
    const lfo = c.createOscillator(); lfo.frequency.value = 0.07;
    const lg = c.createGain(); lg.gain.value = 260;
    lfo.connect(lg); lg.connect(f.frequency);
    this.windGain = c.createGain(); this.windGain.gain.value = 0.05;
    s.connect(f); f.connect(this.windGain); this.windGain.connect(this.ambBus);
    s.start(); lfo.start();
    const m = c.createOscillator(); m.type = 'sawtooth'; m.frequency.value = 52;
    const mf = c.createBiquadFilter(); mf.type = 'lowpass'; mf.frequency.value = 160;
    this.machGain = c.createGain(); this.machGain.gain.value = 0;
    m.connect(mf); mf.connect(this.machGain); this.machGain.connect(this.ambBus); m.start();
    this.lastAmb = 0;
  }
  setAmbience(night, machine) { this.ambNight = night; this.ambMachine = machine; }
  ambienceTick() {
    const c = this.ctx;
    const t = c.currentTime;
    this.windGain.gain.setTargetAtTime(0.04 + this.ambNight * 0.03, t, 1);
    this.machGain.gain.setTargetAtTime(this.ambMachine * 0.05, t, 0.8);
    if (t - this.lastAmb > 0.35) {
      this.lastAmb = t;
      if (this.ambNight > 0.5 && Math.random() < 0.5) for (let k = 0; k < 3; k++) this.osc('sine', 4200 + Math.random() * 600, 4400, t + k * 0.05, 0.03, 0.012, this.ambBus);
      if (this.ambMachine > 0.3 && Math.random() < 0.08) this.noiseHit(t, 0.08, 0.06 * this.ambMachine, 'bandpass', 2400, 4, this.ambBus);
    }
  }
}
