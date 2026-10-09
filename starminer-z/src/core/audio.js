// Every sound in the game, made on the spot with Web Audio: no recordings. Footsteps for each
// kind of ground, digging and building, the guns, the dead groaning and the bones rattling,
// wind that rises with the storm, thunder, and a slow, uneasy score under it all.
//
// The context can only start after the player does something (a key, a click, a tap), so
// nothing plays until unlock(). Every method is safe to call before then: it does nothing.

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);
// the score keeps to a dark minor mode (A aeolian, with the flat second for unease)
const SCALE = [0, 1, 3, 5, 7, 8, 10];

export class Audio {
  constructor(app) {
    this.app = app;
    this.ctx = null;
    this.vol = { sound: app.settings.sound ?? 0.9, music: app.settings.music ?? 0.6 };
    this.listener = { x: 0, y: 0, z: 0, yaw: 0 };
    this.musicT = 2;
    this.chordT = 0;
    this.groans = 0;
  }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { this.ctx = new AC(); } catch { this.ctx = null; return; }
    const c = this.ctx;
    this.master = c.createGain();
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 4;
    this.master.connect(comp).connect(c.destination);
    this.sfx = c.createGain(); this.sfx.connect(this.master);
    this.music = c.createGain(); this.music.connect(this.master);
    this.amb = c.createGain(); this.amb.connect(this.master);
    // a big, dark room for everything to ring in
    this.verb = c.createConvolver();
    this.verb.buffer = this.impulse(3.2, 2.6);
    this.verbIn = c.createGain(); this.verbIn.gain.value = 0.5;
    this.verbIn.connect(this.verb).connect(this.master);
    this.white = this.noise(2, 'white');
    this.brown = this.noise(4, 'brown');
    this.setVolumes(this.vol.sound, this.vol.music);
    this.startAmbience();
  }

  setVolumes(sound, music) {
    this.vol.sound = sound; this.vol.music = music;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.sfx.gain.setTargetAtTime(sound, t, 0.05);
    this.amb.gain.setTargetAtTime(sound * 0.8, t, 0.05);
    this.music.gain.setTargetAtTime(music * 0.5, t, 0.05);
  }

  // ---- building blocks ---------------------------------------------------------------------------

  noise(seconds, kind) {
    const c = this.ctx, n = Math.floor(c.sampleRate * seconds);
    const b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
    }
    return b;
  }

  impulse(seconds, decay) {
    const c = this.ctx, n = Math.floor(c.sampleRate * seconds);
    const b = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay);
    }
    return b;
  }

  // Where a sound comes from: a stereo pan and a gain for its distance (null pos: in your head).
  where(pos, range = 40) {
    if (!pos) return { pan: 0, gain: 1 };
    const L = this.listener;
    const dx = pos.x - L.x, dy = (pos.y ?? L.y) - L.y, dz = pos.z - L.z;
    const d = Math.hypot(dx, dy, dz);
    if (d > range) return null;
    const rx = Math.cos(L.yaw), rz = -Math.sin(L.yaw);
    const pan = d > 0.01 ? Math.max(-1, Math.min(1, (dx * rx + dz * rz) / d)) : 0;
    return { pan: pan * 0.85, gain: 1 / Math.pow(1 + d / 7, 1.4) };
  }

  // An output for one sound: through a panner to the effects bus, with some sent to the room.
  out(pos, range, wet = 0.15, gain = 1) {
    const c = this.ctx;
    const p = this.where(pos, range);
    if (!p) return null;
    const g = c.createGain();
    g.gain.value = gain * p.gain;
    let node = g;
    if (c.createStereoPanner) { const s = c.createStereoPanner(); s.pan.value = p.pan; g.connect(s); node = s; }
    node.connect(this.sfx);
    if (wet > 0) { const w = c.createGain(); w.gain.value = wet * (pos ? 1 + (1 - p.gain) : 1); node.connect(w).connect(this.verbIn); }
    return g;
  }

  burst(dest, { t = 0, dur = 0.1, f = 1200, q = 1, type = 'bandpass', gain = 1, attack = 0.002, buf = this.white, rate = 1 } = {}) {
    const c = this.ctx, t0 = c.currentTime + t;
    const s = c.createBufferSource();
    s.buffer = buf;
    s.playbackRate.value = rate;
    const fl = c.createBiquadFilter();
    fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
    s.connect(fl).connect(g).connect(dest);
    // long sounds loop the noise; short ones start somewhere random in it
    if (dur > buf.duration - 0.1) s.loop = true;
    s.start(t0, Math.max(0, Math.random() * (buf.duration - dur - 0.05)));
    s.stop(t0 + dur + 0.05);
    return fl;
  }

  tone(dest, { t = 0, dur = 0.2, f = 440, f2 = null, type = 'sine', gain = 0.3, attack = 0.005 } = {}) {
    const c = this.ctx, t0 = c.currentTime + t;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t0);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
    o.connect(g).connect(dest);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
    return o;
  }

  // ---- the world ---------------------------------------------------------------------------------

  static GROUND = {
    grass: { f: 900, q: 0.8, dur: 0.09, gain: 0.35 }, dirt: { f: 700, q: 0.9, dur: 0.08, gain: 0.35 },
    sand: { f: 2400, q: 0.5, dur: 0.11, gain: 0.22, type: 'highpass' }, stone: { f: 1800, q: 1.6, dur: 0.06, gain: 0.32 },
    snow: { f: 1500, q: 0.6, dur: 0.14, gain: 0.3 }, wood: { f: 420, q: 3, dur: 0.07, gain: 0.4 },
    metal: { f: 2600, q: 6, dur: 0.12, gain: 0.25 }, glass: { f: 3200, q: 4, dur: 0.08, gain: 0.25 }, leaves: { f: 3000, q: 0.5, dur: 0.12, gain: 0.2 },
  };

  step(mat, sprint) {
    if (!this.ctx) return;
    const G = Audio.GROUND[mat] || Audio.GROUND.stone;
    const o = this.out(null, 0, 0.04, sprint ? 0.55 : 0.4);
    this.burst(o, { ...G, f: G.f * (0.85 + Math.random() * 0.3) });
    if (mat === 'snow') this.burst(o, { t: 0.03, f: 900, q: 0.7, dur: 0.1, gain: 0.2 });
  }

  land(mat, speed) {
    if (!this.ctx) return;
    const o = this.out(null, 0, 0.08, Math.min(1, speed / 14));
    this.burst(o, { ...(Audio.GROUND[mat] || Audio.GROUND.stone), dur: 0.16 });
    this.tone(o, { f: 120, f2: 50, dur: 0.15, gain: 0.5 });
  }

  dig(mat, cannot) {
    if (!this.ctx) return;
    const G = Audio.GROUND[mat] || Audio.GROUND.stone;
    const o = this.out(null, 0, 0.1, 0.55);
    this.burst(o, { ...G, dur: G.dur * 1.4, gain: G.gain * 1.3 });
    if (cannot || mat === 'stone' || mat === 'metal') this.tone(o, { f: cannot ? 1700 : 1100 + Math.random() * 300, dur: 0.07, type: 'triangle', gain: 0.12 });
  }

  breakBlock(mat) {
    if (!this.ctx) return;
    const G = Audio.GROUND[mat] || Audio.GROUND.stone;
    const o = this.out(null, 0, 0.18, 0.7);
    this.burst(o, { ...G, dur: 0.3, gain: G.gain * 1.4, q: G.q * 0.6 });
    this.burst(o, { t: 0.04, f: G.f * 0.5, q: 0.7, dur: 0.22, gain: 0.25 });
    this.tone(o, { f: 160, f2: 60, dur: 0.18, gain: 0.35 });
  }

  place(mat) {
    if (!this.ctx) return;
    const o = this.out(null, 0, 0.08, 0.6);
    this.burst(o, { ...(Audio.GROUND[mat] || Audio.GROUND.stone), dur: 0.1 });
    this.tone(o, { f: 180, f2: 90, dur: 0.1, gain: 0.35 });
  }

  pickup() {
    if (!this.ctx) return;
    const o = this.out(null, 0, 0.1, 0.35);
    this.tone(o, { f: 880, f2: 1320, dur: 0.12, type: 'triangle', gain: 0.25 });
  }

  equip() {
    if (!this.ctx) return;
    const o = this.out(null, 0, 0.05, 0.3);
    this.burst(o, { f: 2200, q: 2, dur: 0.06, gain: 0.25 });
  }

  melee(hit) {
    if (!this.ctx) return;
    const o = this.out(null, 0, 0.1, 0.6);
    this.burst(o, { f: 600, q: 0.6, dur: 0.12, gain: 0.3, type: 'lowpass' });
    if (hit) this.tone(o, { f: 140, f2: 60, dur: 0.12, gain: 0.5 });
  }

  toolBreak() {
    if (!this.ctx) return;
    const o = this.out(null, 0, 0.2, 0.6);
    for (let i = 0; i < 3; i++) this.tone(o, { t: i * 0.04, f: 2400 - i * 500, dur: 0.15, type: 'triangle', gain: 0.18 });
  }

  // ---- guns -----------------------------------------------------------------------------------

  gunshot(gun) {
    if (!this.ctx) return;
    const P = {
      pistol: { f: 1400, body: 110, dur: 0.22, gain: 0.85 }, smg: { f: 1800, body: 140, dur: 0.14, gain: 0.7 },
      assault: { f: 1200, body: 95, dur: 0.24, gain: 0.95 }, shotgun: { f: 700, body: 70, dur: 0.42, gain: 1.1 },
      rifle: { f: 2200, body: 80, dur: 0.5, gain: 1.15 },
    }[gun] || { f: 1400, body: 110, dur: 0.22, gain: 0.85 };
    const o = this.out(null, 0, 0.45, P.gain);
    this.burst(o, { f: P.f, q: 0.7, dur: P.dur, gain: 0.9, attack: 0.001 });
    this.burst(o, { f: 5000, q: 0.5, dur: 0.05, gain: 0.5, type: 'highpass', attack: 0.0005 });
    this.tone(o, { f: P.body * 2, f2: P.body * 0.5, dur: P.dur * 0.8, gain: 0.9, attack: 0.001 });
    // the report coming back off the hills
    this.burst(o, { t: 0.18 + Math.random() * 0.1, f: 500, q: 0.6, dur: P.dur * 2.2, gain: 0.12, type: 'lowpass', buf: this.brown });
  }

  reload() {
    if (!this.ctx) return;
    const o = this.out(null, 0, 0.05, 0.5);
    this.burst(o, { f: 3000, q: 5, dur: 0.05, gain: 0.4 });
    this.burst(o, { t: 0.25, f: 2200, q: 4, dur: 0.06, gain: 0.35 });
  }

  reloadDone() {
    if (!this.ctx) return;
    const o = this.out(null, 0, 0.05, 0.55);
    this.burst(o, { f: 2600, q: 6, dur: 0.05, gain: 0.45 });
    this.burst(o, { t: 0.08, f: 1600, q: 5, dur: 0.07, gain: 0.4 });
  }

  dryFire() {
    if (!this.ctx) return;
    this.burst(this.out(null, 0, 0.02, 0.4), { f: 3400, q: 8, dur: 0.04, gain: 0.4 });
  }

  impact(mat, pos) {
    if (!this.ctx) return;
    const o = this.out(pos, 50, 0.2, 0.5);
    if (!o) return;
    this.burst(o, { ...(Audio.GROUND[mat] || Audio.GROUND.stone), dur: 0.08 });
  }

  // ---- the player ---------------------------------------------------------------------------

  hurt() {
    if (!this.ctx) return;
    const o = this.out(null, 0, 0.1, 0.7);
    this.tone(o, { f: 180, f2: 70, dur: 0.22, type: 'sawtooth', gain: 0.18 });
    this.burst(o, { f: 400, q: 0.8, dur: 0.15, gain: 0.4, type: 'lowpass' });
  }

  death() {
    if (!this.ctx) return;
    const o = this.out(null, 0, 0.5, 0.8);
    this.tone(o, { f: 220, f2: 55, dur: 1.6, type: 'sawtooth', gain: 0.12, attack: 0.05 });
    this.tone(o, { f: 110, f2: 40, dur: 2.4, gain: 0.4, attack: 0.05 });
  }

  // ---- the dead --------------------------------------------------------------------------------

  // A groan: a buzzing throat through two vowel formants, sagging in pitch.
  groan(pos, { gain = 0.7, dur = 1.1 + Math.random() * 0.8, pitch = 85 + Math.random() * 45, harsh = 0 } = {}) {
    const o = this.out(pos, 42, 0.35, gain);
    if (!o) return;
    const c = this.ctx, t0 = c.currentTime;
    const src = c.createOscillator();
    src.type = 'sawtooth';
    src.frequency.setValueAtTime(pitch * 1.15, t0);
    src.frequency.linearRampToValueAtTime(pitch, t0 + dur * 0.3);
    src.frequency.exponentialRampToValueAtTime(pitch * 0.72, t0 + dur);
    const vib = c.createOscillator(); vib.frequency.value = 5 + Math.random() * 4;
    const vg = c.createGain(); vg.gain.value = pitch * 0.04;
    vib.connect(vg).connect(src.frequency);
    const env = c.createGain();
    env.gain.setValueAtTime(0, t0);
    env.gain.linearRampToValueAtTime(0.5, t0 + 0.15);
    env.gain.setValueAtTime(0.5, t0 + dur * 0.6);
    env.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
    for (const [f, q, g] of [[520 + Math.random() * 200, 6, 1], [1150 + Math.random() * 300, 8, 0.5]]) {
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
      const gg = c.createGain(); gg.gain.value = g;
      src.connect(bp).connect(gg).connect(env);
    }
    // breath and rasp
    const n = c.createBufferSource(); n.buffer = this.white;
    const nf = c.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 900; nf.Q.value = 1.2;
    const ng = c.createGain(); ng.gain.value = 0.25 + harsh * 0.5;
    n.connect(nf).connect(ng).connect(env);
    env.connect(o);
    src.start(t0); vib.start(t0); n.start(t0, Math.random());
    src.stop(t0 + dur + 0.1); vib.stop(t0 + dur + 0.1); n.stop(t0 + dur + 0.1);
  }

  rattle(pos, gain = 0.6) {
    const o = this.out(pos, 32, 0.3, gain);
    if (!o) return;
    const n = 7 + Math.floor(Math.random() * 7);
    for (let i = 0; i < n; i++) this.burst(o, { t: i * (0.035 + Math.random() * 0.03), f: 2400 + Math.random() * 1800, q: 7, dur: 0.035, gain: 0.5 * (1 - i / n * 0.5) });
  }

  enemyIdle(kind, pos) {
    if (!this.ctx) return;
    if (kind === 'skeleton') this.rattle(pos, 0.45);
    else this.groan(pos, { gain: 0.6 });
  }

  enemyAttack(kind, pos) {
    if (!this.ctx) return;
    if (kind === 'skeleton') { this.rattle(pos, 0.7); return; }
    this.groan(pos, { gain: 0.85, dur: 0.5, pitch: 120 + Math.random() * 40, harsh: 1 });
  }

  enemyHurt(kind, pos) {
    if (!this.ctx) return;
    const o = this.out(pos, 50, 0.15, 0.7);
    if (!o) return;
    this.burst(o, { f: 300, q: 0.7, dur: 0.12, gain: 0.6, type: 'lowpass' });
    if (kind === 'skeleton') this.rattle(pos, 0.4);
    else this.groan(pos, { gain: 0.5, dur: 0.35, pitch: 140 });
  }

  enemyDie(kind, pos) {
    if (!this.ctx) return;
    if (kind === 'skeleton') { this.rattle(pos, 0.9); this.rattle(pos, 0.6); }
    else this.groan(pos, { gain: 0.8, dur: 1.4, pitch: 100 });
    const o = this.out(pos, 40, 0.2, 0.6);
    if (o) this.tone(o, { t: 0.5, f: 90, f2: 40, dur: 0.25, gain: 0.6 });
  }

  enemyDig(pos) {
    if (!this.ctx) return;
    const o = this.out(pos, 30, 0.2, 0.7);
    if (!o) return;
    this.burst(o, { f: 900, q: 0.8, dur: 0.12, gain: 0.6 });
    this.tone(o, { f: 130, f2: 60, dur: 0.12, gain: 0.5 });
  }

  // ---- the sky ---------------------------------------------------------------------------------

  thunder(delay = 1, loud = 0.7) {
    if (!this.ctx) return;
    const o = this.out(null, 0, 0.6, loud);
    if (delay < 1.2) this.burst(o, { t: delay, f: 1800, q: 0.4, dur: 0.35, gain: 0.5, type: 'lowpass' });
    this.burst(o, { t: delay + 0.05, f: 180, q: 0.5, dur: 3.5 + Math.random() * 2.5, gain: 1.2, type: 'lowpass', buf: this.brown, attack: 0.25 });
    this.burst(o, { t: delay + 0.6, f: 90, q: 0.5, dur: 3, gain: 0.8, type: 'lowpass', buf: this.brown, attack: 0.5 });
  }

  storm() {
    if (!this.ctx) return;
    this.thunder(0.4, 0.9);
    const o = this.out(null, 0, 0.6, 0.5);
    this.tone(o, { f: 55, dur: 6, gain: 0.25, attack: 2.5 });
    this.tone(o, { f: 58.3, dur: 6, gain: 0.2, attack: 2.5 });
  }

  dawn() {
    if (!this.ctx) return;
    const o = this.out(null, 0, 0.7, 0.4);
    [57, 60, 64].forEach((n, i) => this.tone(o, { t: i * 0.3, f: NOTE(n), dur: 3, type: 'triangle', gain: 0.08, attack: 0.6 }));
  }

  // ---- the front end ----------------------------------------------------------------------------

  ui(kind) {
    if (!this.ctx) return;
    const o = this.out(null, 0, 0.05, 0.35);
    if (kind === 'move') this.tone(o, { f: 660, dur: 0.05, type: 'triangle', gain: 0.18 });
    else if (kind === 'select' || kind === 'open') { this.tone(o, { f: 520, dur: 0.08, type: 'triangle', gain: 0.2 }); this.tone(o, { t: 0.06, f: 780, dur: 0.1, type: 'triangle', gain: 0.18 }); }
    else if (kind === 'back') this.tone(o, { f: 440, f2: 330, dur: 0.1, type: 'triangle', gain: 0.18 });
    else if (kind === 'deny') this.tone(o, { f: 160, dur: 0.15, type: 'square', gain: 0.08 });
  }

  craft() {
    if (!this.ctx) return;
    const o = this.out(null, 0, 0.15, 0.5);
    this.burst(o, { f: 1600, q: 3, dur: 0.08, gain: 0.4 });
    this.tone(o, { t: 0.05, f: 700, f2: 1050, dur: 0.18, type: 'triangle', gain: 0.2 });
  }

  award() {
    if (!this.ctx) return;
    const o = this.out(null, 0, 0.5, 0.45);
    [69, 72, 76, 81].forEach((n, i) => this.tone(o, { t: i * 0.11, f: NOTE(n), dur: 0.9, type: 'triangle', gain: 0.14 }));
  }

  // ---- the air ----------------------------------------------------------------------------------

  startAmbience() {
    const c = this.ctx;
    // wind: brown noise through a wandering band
    const w = c.createBufferSource(); w.buffer = this.brown; w.loop = true;
    this.windF = c.createBiquadFilter(); this.windF.type = 'bandpass'; this.windF.frequency.value = 400; this.windF.Q.value = 0.6;
    this.windG = c.createGain(); this.windG.gain.value = 0;
    w.connect(this.windF).connect(this.windG).connect(this.amb);
    w.start();
    // a low drone under the night
    this.drone = [41, 41.7].map((m) => {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = NOTE(m);
      const g = c.createGain(); g.gain.value = 0;
      o.connect(g).connect(this.amb);
      o.start();
      return g;
    });
  }

  // Each frame: where the ears are, and how the air should sound.
  update(dt, cam, info = {}) {
    if (!this.ctx || !cam) return;
    const L = this.listener;
    L.x = cam.position.x; L.y = cam.position.y; L.z = cam.position.z;
    L.yaw = cam.rotation.y;
    const c = this.ctx, t = c.currentTime;
    const gloom = info.gloom ?? 0, night = info.night ?? 0, under = info.underground ?? 0;
    const height = Math.max(0, Math.min(1, ((info.y ?? 64) - 70) / 50));
    this.windG.gain.setTargetAtTime((0.05 + gloom * 0.22 + height * 0.25) * (1 - under * 0.85), t, 0.5);
    this.windF.frequency.setTargetAtTime(300 + 250 * Math.sin(t * 0.13) + 200 * Math.sin(t * 0.31) + gloom * 150, t, 0.4);
    for (const g of this.drone) g.gain.setTargetAtTime(0.035 * Math.max(night * gloom, under * 0.6, info.menu ? 0.6 : 0), t, 1.5);
    this.score(dt, info);
  }

  // The score: slow, uneasy chords and a few bare notes, darker once the storm is in.
  score(dt, info) {
    const c = this.ctx;
    this.chordT -= dt;
    this.musicT -= dt;
    const dark = Math.max(info.gloom ?? 0, info.menu ? 1 : 0);
    const root = dark > 0.5 ? 45 : 50;
    if (this.chordT <= 0) {
      this.chordT = 9 + Math.random() * 6;
      const deg = [0, 5, 3, 6, 1][Math.floor(Math.random() * 5)];
      const notes = [0, 2, 4].map((k) => root + SCALE[(deg + k) % 7] + 12 * Math.floor((deg + k) / 7));
      for (const n of notes) this.pad(NOTE(n - 12), 11, 0.05);
      if (dark > 0.5 && Math.random() < 0.35) this.pad(NOTE(root - 11), 11, 0.03); // the flat second, rubbing
    }
    if (this.musicT <= 0) {
      this.musicT = 2.5 + Math.random() * 5;
      const n = root + 12 + SCALE[Math.floor(Math.random() * 7)] + (Math.random() < 0.3 ? 12 : 0);
      this.bell(NOTE(n), 0.07);
    }
    void c;
  }

  pad(f, dur, gain) {
    const c = this.ctx, t0 = c.currentTime;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + dur * 0.35);
    g.gain.linearRampToValueAtTime(0, t0 + dur);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700; lp.Q.value = 0.7;
    g.connect(lp).connect(this.music);
    const w = c.createGain(); w.gain.value = 0.6; lp.connect(w).connect(this.verbIn);
    for (const d of [-6, 6]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = d;
      const og = c.createGain(); og.gain.value = 0.5;
      o.connect(og).connect(g);
      o.start(t0); o.stop(t0 + dur + 0.1);
    }
  }

  bell(f, gain) {
    const c = this.ctx, t0 = c.currentTime;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0005, t0 + 3.5);
    g.connect(this.music);
    const w = c.createGain(); w.gain.value = 1.2; g.connect(w).connect(this.verbIn);
    for (const [m, a] of [[1, 1], [2.01, 0.25], [3.02, 0.08]]) {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f * m;
      const og = c.createGain(); og.gain.value = a;
      o.connect(og).connect(g);
      o.start(t0); o.stop(t0 + 3.6);
    }
  }
}
