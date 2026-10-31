/* =====================================================================
   FX: GPU point-sprite particles + bending meshes
   ===================================================================== */
class Particles {
  constructor(scene, max, additive) {
    this.max = max; this.i = 0; this.alive = 0;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3); this.size = new Float32Array(max); this.alpha = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.v = new Float32Array(max * 3); this.life = new Float32Array(max); this.maxLife = new Float32Array(max); this.s0 = new Float32Array(max); this.s1 = new Float32Array(max);
    this.c0 = new Float32Array(max * 3); this.c1 = new Float32Array(max * 3); this.drag = new Float32Array(max); this.grav = new Float32Array(max); this.a0 = new Float32Array(max); this.swirl = new Float32Array(max);
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uScale: { value: 600 } },
      vertexShader: `attribute vec3 aColor; attribute float aSize; attribute float aAlpha; uniform float uScale; varying vec3 vC; varying float vA;
        void main(){ vC = aColor; vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = aAlpha > 0.001 ? clamp(aSize * uScale / -mv.z, 0.0, 400.0) : 0.0; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec3 vC; varying float vA; void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); float a = smoothstep(0.5, 0.0, r); a *= a; gl_FragColor = vec4(vC, a * vA);
        #include <colorspace_fragment>
      }`,
    });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false; this.points.renderOrder = 5; scene.add(this.points); this.geo = g;
  }
  emit(x, y, z, vx, vy, vz, life, s0, s1, c0, c1, opt = {}) {
    const i = this.i; this.i = (this.i + 1) % this.max;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z; this.v[i * 3] = vx; this.v[i * 3 + 1] = vy; this.v[i * 3 + 2] = vz;
    this.life[i] = life; this.maxLife[i] = life; this.s0[i] = s0; this.s1[i] = s1;
    this.c0[i * 3] = c0.r; this.c0[i * 3 + 1] = c0.g; this.c0[i * 3 + 2] = c0.b; this.c1[i * 3] = c1.r; this.c1[i * 3 + 1] = c1.g; this.c1[i * 3 + 2] = c1.b;
    this.drag[i] = opt.drag ?? 1.5; this.grav[i] = opt.grav ?? 0; this.a0[i] = opt.alpha ?? 1; this.swirl[i] = opt.swirl ?? 0;
  }
  update(dt) {
    let alive = 0;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { if (this.alpha[i] !== 0) this.alpha[i] = 0; continue; }
      alive++; this.life[i] -= dt; const k = 1 - this.life[i] / this.maxLife[i]; const d = Math.exp(-this.drag[i] * dt);
      let vx = this.v[i * 3] * d, vy = this.v[i * 3 + 1] * d + this.grav[i] * dt, vz = this.v[i * 3 + 2] * d;
      if (this.swirl[i]) { const sw = this.swirl[i] * dt; const nx = vx * Math.cos(sw) - vz * Math.sin(sw); vz = vx * Math.sin(sw) + vz * Math.cos(sw); vx = nx; }
      this.v[i * 3] = vx; this.v[i * 3 + 1] = vy; this.v[i * 3 + 2] = vz;
      this.pos[i * 3] += vx * dt; this.pos[i * 3 + 1] += vy * dt; this.pos[i * 3 + 2] += vz * dt;
      this.size[i] = U.lerp(this.s0[i], this.s1[i], k);
      for (let c = 0; c < 3; c++) this.col[i * 3 + c] = U.lerp(this.c0[i * 3 + c], this.c1[i * 3 + c], Math.min(1, k * 1.4));
      this.alpha[i] = this.a0[i] * Math.min(1, (1 - k) * 2.5) * Math.min(1, k * 12 + 0.2);
    }
    this.alive = alive;
    const g = this.geo; g.attributes.position.needsUpdate = true; g.attributes.aColor.needsUpdate = true; g.attributes.aSize.needsUpdate = true; g.attributes.aAlpha.needsUpdate = true;
  }
}
const CC = (h) => new THREE.Color(h);
const PAL = {
  fireA: CC('#fff0a0'), fireB: CC('#ff3a08'), fireC: CC('#ff8a1a'), flameA: CC('#ffb436'), flameB: CC('#c22a08'), ember: CC('#ffb040'), smokeA: CC('#6a5a50'), smokeB: CC('#2a2420'),
  dustA: CC('#b09a78'), dustB: CC('#7a6a50'), rockA: CC('#8a7a62'), waterA: CC('#c8f0ff'), waterB: CC('#2a8ad8'), iceA: CC('#ffffff'), iceB: CC('#8fd8ff'),
  airA: CC('#ffffff'), airB: CC('#c8dce8'), leaf: CC('#7aa64a'), heal: CC('#9fe8ff'), gold: CC('#ffd27a'), spirit: CC('#bfffd8'), blood: CC('#b02a1a'), snow: CC('#ffffff'), moon: CC('#d8ecff'),
};
const FX = {
  add: null, norm: null,
  init(scene) { this.add = new Particles(scene, IS_TOUCH ? 2200 : 4000, true); this.norm = new Particles(scene, IS_TOUCH ? 1400 : 2600, false); this.scene = scene; },
  update(dt, cam) { const h = window.innerHeight; const fov = cam.fov * Math.PI / 180; this.add.mat.uniforms.uScale.value = this.norm.mat.uniforms.uScale.value = h / (2 * Math.tan(fov / 2)); this.add.update(dt); this.norm.update(dt); },
  r: Math.random,
  // flames: solid orange-red body (normal blend keeps its colour in daylight) + small additive hot cores (glow at night)
  fire(p, n = 6, spd = 1.5, size = 0.5, up = 1.5) { for (let i = 0; i < n; i++) { const r = this.r; const x = p.x + (r() - 0.5) * 0.2, y = p.y + (r() - 0.5) * 0.2, z = p.z + (r() - 0.5) * 0.2, vx = (r() - 0.5) * spd, vy = up + r() * spd, vz = (r() - 0.5) * spd;
      this.norm.emit(x, y, z, vx, vy, vz, 0.32 + r() * 0.3, size * (0.8 + r() * 0.5), size * 0.2, PAL.flameA, PAL.flameB, { drag: 2, grav: 2, alpha: 0.92 });
      if (i % 2 === 0) this.add.emit(x, y, z, vx * 0.8, vy * 0.8, vz * 0.8, 0.22 + r() * 0.2, size * 0.55, size * 0.1, PAL.fireA, PAL.fireC, { drag: 2, grav: 2, alpha: 0.75 }); } },
  smoke(p, n = 2, size = 0.8) { for (let i = 0; i < n; i++) { const r = this.r; this.norm.emit(p.x + (r() - 0.5) * 0.3, p.y, p.z + (r() - 0.5) * 0.3, (r() - 0.5) * 0.4, 0.8 + r() * 0.6, (r() - 0.5) * 0.4, 1.2 + r(), size * 0.5, size * 2, PAL.smokeA, PAL.smokeB, { drag: 0.6, alpha: 0.35 }); } },
  embers(p, n = 2) { for (let i = 0; i < n; i++) { const r = this.r; this.add.emit(p.x + (r() - 0.5) * 0.4, p.y, p.z + (r() - 0.5) * 0.4, (r() - 0.5) * 0.8, 1 + r() * 2, (r() - 0.5) * 0.8, 0.8 + r() * 1.2, 0.08, 0.02, PAL.ember, PAL.fireB, { drag: 0.5, swirl: (r() - 0.5) * 4 }); } },
  burst(p, color1, color2, n = 20, spd = 5, size = 0.4, life = 0.6, opt = {}) { for (let i = 0; i < n; i++) { const r = this.r; const th = r() * Math.PI * 2, ph = Math.acos(2 * r() - 1); const s = spd * (0.4 + r() * 0.6);
      (opt.normal ? this.norm : this.add).emit(p.x, p.y, p.z, Math.sin(ph) * Math.cos(th) * s, Math.cos(ph) * s * (opt.flat ? 0.2 : 1) + (opt.up || 0), Math.sin(ph) * Math.sin(th) * s, life * (0.6 + r() * 0.6), size, size * 0.2, color1, color2, { drag: opt.drag ?? 3, grav: opt.grav ?? 0, alpha: opt.alpha ?? 1 }); } },
  dust(p, n = 12, spd = 3, size = 0.9) { for (let i = 0; i < n; i++) { const r = this.r; const a = r() * Math.PI * 2; this.norm.emit(p.x + Math.cos(a) * 0.3, p.y + 0.1, p.z + Math.sin(a) * 0.3, Math.cos(a) * spd * (0.5 + r()), 0.4 + r() * 1.2, Math.sin(a) * spd * (0.5 + r()), 0.8 + r() * 0.6, size * 0.6, size * 1.6, PAL.dustA, PAL.dustB, { drag: 2.5, alpha: 0.6 }); } },
  splash(p, n = 16, spd = 3) { for (let i = 0; i < n; i++) { const r = this.r; const a = r() * Math.PI * 2; this.norm.emit(p.x, p.y, p.z, Math.cos(a) * spd * r(), 2 + r() * 3, Math.sin(a) * spd * r(), 0.6 + r() * 0.3, 0.18, 0.08, PAL.waterA, PAL.waterB, { grav: -12, drag: 0.5, alpha: 0.85 }); } },
  air(p, dir, n = 10, spd = 6, size = 0.5) { for (let i = 0; i < n; i++) { const r = this.r; this.norm.emit(p.x + (r() - 0.5) * 0.4, p.y + (r() - 0.5) * 0.4, p.z + (r() - 0.5) * 0.4, dir.x * spd + (r() - 0.5) * 2, dir.y * spd + (r() - 0.5) * 2, dir.z * spd + (r() - 0.5) * 2, 0.4 + r() * 0.3, size, size * 2.2, PAL.airA, PAL.airB, { drag: 3, alpha: 0.35, swirl: (r() - 0.5) * 10 }); } },
  sparkle(p, c, n = 8, spread = 0.6, size = 0.18) { for (let i = 0; i < n; i++) { const r = this.r; this.add.emit(p.x + (r() - 0.5) * spread, p.y + (r() - 0.5) * spread, p.z + (r() - 0.5) * spread, (r() - 0.5) * 0.5, 0.5 + r() * 0.8, (r() - 0.5) * 0.5, 0.6 + r() * 0.6, size, 0.02, c, c, { drag: 1 }); } },
  ring(p, c1, c2, n = 30, spd = 6, size = 0.5, normal = false) { for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; (normal ? this.norm : this.add).emit(p.x, p.y, p.z, Math.cos(a) * spd, 0.3, Math.sin(a) * spd, 0.5, size, size * 1.5, c1, c2, { drag: 3, alpha: normal ? 0.5 : 1 }); } },
  leaves(p, n = 6) { for (let i = 0; i < n; i++) { const r = this.r; this.norm.emit(p.x + (r() - 0.5) * 2, p.y + r() * 1.5, p.z + (r() - 0.5) * 2, (r() - 0.5) * 2, -0.3 - r() * 0.5, (r() - 0.5) * 2, 2 + r(), 0.15, 0.15, PAL.leaf, PAL.leaf, { drag: 0.8, swirl: (r() - 0.5) * 6 }); } },
  snow(p, n = 1) { for (let i = 0; i < n; i++) { const r = this.r; this.norm.emit(p.x + (r() - 0.5) * 40, p.y + 12 + r() * 6, p.z + (r() - 0.5) * 40, (r() - 0.5) * 1, -2 - r(), (r() - 0.5) * 1, 6, 0.12, 0.1, PAL.snow, PAL.snow, { drag: 0.1, alpha: 0.8 }); } },
};
// a soft additive glow sprite that can be attached to things
function glowSprite(color, size, opacity = 1) {
  const m = new THREE.SpriteMaterial({ map: World.glowTex || (World.glowTex = softTex()), color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity, fog: false });
  const s = new THREE.Sprite(m); s.scale.set(size, size, 1); return s;
}

/* =====================================================================
   DYNAMIC POINT LIGHT POOL (campfires, fireballs) — kept tiny for mobile
   ===================================================================== */
const Lights = {
  pool: [], init(scene) { for (let i = 0; i < 3; i++) { const l = new THREE.PointLight(0xff8a3a, 0, 14, 1.6); scene.add(l); this.pool.push(l); } },
  update(sources, camPos) {
    sources.sort((a, b) => a.pos.distanceToSquared(camPos) - b.pos.distanceToSquared(camPos));
    this.pool.forEach((l, i) => { const s = sources[i]; if (s && s.pos.distanceTo(camPos) < 60) { l.position.copy(s.pos); l.position.y += 0.6; l.intensity = s.intensity * (0.85 + Math.random() * 0.25); l.color.setHex(s.color || 0xff8a3a); l.distance = s.range || 14; } else l.intensity = 0; });
  },
};

/* =====================================================================
   SOUND (procedural WebAudio)
   ===================================================================== */
const SFX = {
  ctx: null, master: null, noise: null, on: true, music: true, vol: 0.7,
  init() {
    if (this.ctx) return; try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    const c = this.ctx; this.master = c.createGain(); this.master.gain.value = this.vol; this.master.connect(c.destination);
    const len = c.sampleRate * 2; const buf = c.createBuffer(1, len, c.sampleRate); const d = buf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1; this.noise = buf;
    // ambient wind bed
    const src = c.createBufferSource(); src.buffer = buf; src.loop = true; const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 400; f.Q.value = 0.6; const g = c.createGain(); g.gain.value = 0.035;
    src.connect(f); f.connect(g); g.connect(this.master); src.start(); this.windGain = g; this.windF = f;
    this.nextNote = 0;
  },
  n(dur, type, freq, q, gain, attack = 0.005, sweepTo, delay = 0) {
    if (!this.ctx || !this.on) return; const c = this.ctx, t = c.currentTime + delay;
    const s = c.createBufferSource(); s.buffer = this.noise; const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur); f.Q.value = q;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  },
  tone(freq, dur, type = 'sine', gain = 0.1, delay = 0, slide) {
    if (!this.ctx || !this.on) return; const c = this.ctx, t = c.currentTime + delay; const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  },
  pluck(freq, gain = 0.05, delay = 0) { this.tone(freq, 1.6, 'triangle', gain, delay); this.tone(freq * 2, 0.6, 'sine', gain * 0.4, delay); },
  fire() { this.n(0.35, 'bandpass', 900, 0.8, 0.25, 0.01, 300); this.n(0.2, 'lowpass', 300, 1, 0.2); },
  bigfire() { this.n(0.9, 'bandpass', 700, 0.6, 0.35, 0.03, 200); this.n(0.7, 'lowpass', 200, 1, 0.3, 0.02); },
  earth() { this.n(0.5, 'lowpass', 180, 2, 0.5, 0.01, 60); this.tone(70, 0.35, 'sine', 0.25, 0, 40); },
  crack() { this.n(0.25, 'highpass', 1500, 0.8, 0.25); this.n(0.4, 'lowpass', 250, 1, 0.35); },
  water() { this.n(0.45, 'bandpass', 1200, 1.5, 0.18, 0.02, 500); this.n(0.3, 'bandpass', 2400, 3, 0.08, 0.05, 1200); },
  ice() { this.tone(1800, 0.25, 'sine', 0.06, 0, 2600); this.n(0.2, 'highpass', 3000, 1, 0.12); },
  air() { this.n(0.45, 'bandpass', 600, 0.9, 0.22, 0.04, 2400); },
  whoosh() { this.n(0.35, 'bandpass', 400, 0.7, 0.2, 0.05, 1800); },
  hit() { this.n(0.12, 'lowpass', 800, 1, 0.35); this.tone(120, 0.1, 'square', 0.06, 0, 60); },
  hurt() { this.n(0.25, 'lowpass', 500, 1, 0.35); this.tone(220, 0.2, 'sawtooth', 0.05, 0, 110); },
  roar(deep = 1) { this.n(0.9, 'bandpass', 220 / deep, 1.5, 0.4, 0.08, 120 / deep); this.tone(90 / deep, 0.8, 'sawtooth', 0.08, 0, 60 / deep); },
  squeak() { this.tone(1400, 0.12, 'triangle', 0.05, 0, 2000); this.tone(1700, 0.1, 'triangle', 0.04, 0.12, 2400); },
  ui() { this.tone(880, 0.08, 'triangle', 0.05); },
  coin() { this.tone(1320, 0.12, 'square', 0.03); this.tone(1760, 0.18, 'square', 0.03, 0.08); },
  eat() { this.n(0.08, 'bandpass', 1500, 2, 0.12); this.n(0.08, 'bandpass', 1300, 2, 0.12, 0.005, null, 0.15); },
  gong() { this.tone(110, 3, 'sine', 0.25); this.tone(220.5, 2.5, 'sine', 0.12); this.tone(331, 2, 'sine', 0.06); },
  unlock(el) { const scale = { fire: [293.7, 349.2, 392, 440, 523.3], water: [261.6, 293.7, 329.6, 392, 440], earth: [196, 220, 261.6, 293.7, 329.6], air: [329.6, 392, 440, 523.3, 587.3], avatar: [261.6, 329.6, 392, 523.3, 659.3] }[el] || [261.6, 293.7, 329.6, 392, 440];
    this.gong(); scale.forEach((f, i) => this.pluck(f, 0.07, 0.4 + i * 0.18)); this.pluck(scale[4] * 2, 0.05, 1.5); },
  step(soft) { this.n(0.06, 'lowpass', soft ? 400 : 700, 1, 0.05); },
  // ambient guzheng-like pentatonic noodling
  tick(dt, env) {
    if (!this.ctx) return; if (this.windGain) { this.windGain.gain.value = 0.02 + env.windy * 0.05; this.windF.frequency.value = 300 + env.windy * 400; }
    if (!this.music || !this.on) return; this.nextNote -= dt;
    if (this.nextNote <= 0) { const sc = env.night ? [220, 246.9, 293.7, 329.6, 392, 440] : [293.7, 329.6, 370, 440, 493.9, 587.3]; const f = sc[Math.floor(Math.random() * sc.length)];
      this.pluck(f, 0.025); if (Math.random() < 0.4) this.pluck(sc[Math.floor(Math.random() * sc.length)] * (Math.random() < 0.5 ? 0.5 : 1), 0.02, 0.35);
      this.nextNote = 1.6 + Math.random() * 3.5; if (Math.random() < 0.12) this.nextNote += 8; }
  },
};

/* =====================================================================
   ENTITIES
   ===================================================================== */
const G = {
  t: 0, mode: 'boot', time: 7.0, day: 1, dayLen: 840, ents: [], projectiles: [], structures: [], campfires: [], effects: [], drops: [],
  player: null, cam: null, scene: null, env: { night: 0, sun: 1, morning: 0, windy: 0.3, moon: 1, cloud: new THREE.Color() }, stats: {}, flags: {},
};
let ENT_ID = 1;
// stand-in used by AI before a player exists (title screen / creator)
const NOBODY = { pos: V3(1e5, 0, 1e5), vel: V3(), sprinting: false, meditating: false, sheltered: true, dead: true, invuln: 1, bg: null, hurt() {}, knock() {} };
const PL = () => G.player || NOBODY;
function moonPhase() { return 0.5 + 0.5 * Math.cos(((G.day - 1) % 8) / 8 * Math.PI * 2); } // 1 = full
function isNight() { return G.time >= 20 || G.time < 5; }

class Creature {
  constructor(species, x, z, opts = {}) {
    this.id = ENT_ID++; this.kind = 'animal'; this.species = species; this.sp = SPECIES[species]; this.name = this.sp.name;
    this.hp = this.maxHp = this.sp.hp; this.pos = V3(x, groundH(x, z), z); this.yaw = Math.random() * 6.28; this.vel = V3(); this.vy = 0;
    this.state = 'idle'; this.timer = 1 + Math.random() * 3; this.home = V3(x, 0, z); this.speed = 0; this.dir = 0;
    this.radius = this.sp.size * 0.55; this.height = this.sp.size * 1.1; this.model = buildCreature(species);
    if (species === 'turtleduck') { this.model.root.scale.setScalar(1.3); }
    G.scene.add(this.model.root); this.status = { burn: 0, slow: 0, frozen: 0, stun: 0 }; this.attackCd = 0; this.alive = true; this.harvested = false;
    this.flyA = Math.random() * 6.28; this.alt = 30; this.wind = 0; this.opts = opts; this.lastHitEl = null;
    if (species === 'badgermole') { this.state = 'rest'; this.yaw = opts.yaw || 0; }
    if (this.sp.fly && this.model.shadow) this.model.shadow.visible = false;
  }
  get hostile() { return !this.sp.prey && !this.sp.passive; }
  distToPlayer() { const p = PL().pos; return Math.hypot(p.x - this.pos.x, p.z - this.pos.z); }
  update(dt) {
    const P = PL(); const st = this.status; for (const k in st) if (st[k] > 0) st[k] -= dt;
    if (!this.alive) { this.deadT += dt; this.model.root.position.copy(this.pos); animateCreature(this.model, dt, { dead: true });
      if (this.deadT > (this.harvested ? 2 : 150)) this.remove(); return; }
    if (st.burn > 0) { this.burnTick = (this.burnTick || 0) - dt; if (this.burnTick <= 0) { this.burnTick = 0.5; this.damage(2.5, 'fire', null, true); } if (Math.random() < 0.4) FX.fire(V3(this.pos.x, this.pos.y + this.height * 0.6, this.pos.z), 1, 1, 0.4); }
    const dp = this.distToPlayer(); const nightK = isNight() ? 1.35 : 1;
    let tx = 0, tz = 0, spd = 0, graze = false, alert = false, rear = false;
    const sp = this.sp;
    if (this.species === 'skybison') return this.updateBison(dt);
    if (this.species === 'badgermole') return this.updateBadger(dt, dp);
    this.attackCd -= dt;
    const playerHidden = P.sheltered || P.dead || G.mode !== 'play';
    // fear of fire: predators will not approach lit campfires
    const fire = nearestLitFire(this.pos, 7);
    if (sp.prey) {
      const sense = sp.sense * (P.sprinting ? 1.35 : 1) * (P.meditating ? 0.5 : 1) * (P.bg && P.bg.perk.stealth || 1);
      if (!playerHidden && (dp < sense || this.provoked > 0)) {
        if (sp.fights && this.provoked > 0 && this.hp > this.maxHp * 0.3) { this.state = 'chase'; }
        else if (this.state !== 'flee') { this.state = 'flee'; this.timer = 3 + Math.random() * 3; if (Math.random() < 0.5) SFX.squeak(); }
      }
      // also flee from hunting predators
      if (this.state !== 'flee' && this.huntedBy && this.huntedBy.alive && this.huntedBy.pos.distanceTo(this.pos) < 14) { this.state = 'flee'; this.timer = 4; this.fleeFrom = this.huntedBy.pos; }
    } else if (this.hostile) {
      const aggro = sp.aggro * nightK * (P.sprinting ? 1.2 : 1) * (P.meditating ? 0.7 : 1);
      if (!playerHidden && dp < aggro && Math.hypot(P.pos.x, P.pos.z) > 42 && this.state !== 'return' && this.state !== 'flee' && !(fire && P.pos.distanceTo(fire.pos) < 6)) { if (this.state !== 'chase' && this.state !== 'attack') { this.state = 'chase'; SFX.roar(this.species === 'platypusbear' ? 1.2 : 1); G.ui.note(`A ${this.name} has spotted you!`, 'bad'); } }
      const inVillage = Math.hypot(P.pos.x, P.pos.z) < 42;
      if ((this.state === 'chase' || this.state === 'attack') && (playerHidden || inVillage || dp > aggro * 2.2 || this.home.distanceTo(V3(this.pos.x, 0, this.pos.z)) > 90)) { this.state = 'return'; this.timer = 8; }
      if (this.hp < this.maxHp * 0.22 && this.state !== 'flee' && Math.random() < 0.5 * dt) { this.state = 'flee'; this.timer = 6; }
      // hunt prey when idle
      if ((this.state === 'idle' || this.state === 'wander') && Math.random() < dt * 0.05) {
        const prey = G.ents.find(e => e.alive && e.kind === 'animal' && e.sp.prey && e.species !== 'ostrichhorse' && e.pos.distanceTo(this.pos) < 30);
        if (prey) { this.state = 'hunt'; this.prey = prey; prey.huntedBy = this; this.timer = 15; }
      }
    }
    this.provoked = (this.provoked || 0) - dt;
    // state machine
    this.timer -= dt;
    switch (this.state) {
      case 'idle': if (this.timer <= 0) { this.state = Math.random() < 0.6 ? 'wander' : 'graze'; this.timer = 3 + Math.random() * 5; this.dir = this.yaw + (Math.random() - 0.5) * 2.5;
          const hd = Math.hypot(this.pos.x - this.home.x, this.pos.z - this.home.z); if (hd > 30) this.dir = Math.atan2(this.home.x - this.pos.x, this.home.z - this.pos.z); } break;
      case 'graze': graze = true; if (this.timer <= 0) { this.state = 'idle'; this.timer = 0.5 + Math.random() * 2; } break;
      case 'wander': spd = sp.speed * 0.25; tx = Math.sin(this.dir); tz = Math.cos(this.dir); if (this.timer <= 0) { this.state = 'idle'; this.timer = 1 + Math.random() * 3; } break;
      case 'flee': { const from = this.fleeFrom || P.pos; const a = Math.atan2(this.pos.x - from.x, this.pos.z - from.z) + Math.sin(G.t * 2 + this.id) * 0.4; tx = Math.sin(a); tz = Math.cos(a); spd = sp.speed * (sp.size < 1 ? 1 : 0.9); alert = true;
        if (this.timer <= 0 && (dp > sp.sense * 1.4 || !sp.prey)) { this.state = 'idle'; this.timer = 1; this.fleeFrom = null; } break; }
      case 'return': { const a = Math.atan2(this.home.x - this.pos.x, this.home.z - this.pos.z); tx = Math.sin(a); tz = Math.cos(a); spd = sp.speed * 0.5; if (this.timer <= 0 || Math.hypot(this.home.x - this.pos.x, this.home.z - this.pos.z) < 8) { this.state = 'idle'; this.timer = 2; } break; }
      case 'hunt': { const pr = this.prey; if (!pr || !pr.alive || this.timer <= 0) { this.state = pr && !pr.alive ? 'feed' : 'idle'; this.timer = 8; break; }
        const d = pr.pos.distanceTo(this.pos); const a = Math.atan2(pr.pos.x - this.pos.x, pr.pos.z - this.pos.z); tx = Math.sin(a); tz = Math.cos(a); spd = sp.speed * 0.8;
        if (d < sp.reach + pr.radius) { pr.damage(sp.dmg * 2, 'claw', this); } break; }
      case 'feed': graze = true; if (this.timer <= 0) { this.state = 'idle'; this.timer = 2; } break;
      case 'chase': case 'attack': {
        const target = P.pos; const d = dp; const a = Math.atan2(target.x - this.pos.x, target.z - this.pos.z); alert = true;
        if (this.windup > 0) { this.windup -= dt; rear = this.species === 'platypusbear'; tx = Math.sin(a) * 0.01; tz = Math.cos(a) * 0.01; spd = 0.01; this.yaw = U.dampAng(this.yaw, a, 8, dt);
          if (this.windup <= 0) { this.lungeT = 0.35; if (d < sp.reach + 1.2 && !P.invuln) { P.hurt(sp.dmg, this); } else if (d < sp.reach + 1.2 && P.invuln) { G.ui.note('Dodged!', 'good'); } this.attackCd = 1.3 + Math.random() * 0.5; } break; }
        if (d < sp.reach + 0.4 && this.attackCd <= 0) { this.windup = 0.5; this.state = 'attack'; SFX.roar(1.4); break; }
        // avoid walking into fire
        if (fire && fire.pos.distanceTo(this.pos) < 5.5) { const fa = Math.atan2(this.pos.x - fire.pos.x, this.pos.z - fire.pos.z); tx = Math.sin(fa); tz = Math.cos(fa); spd = sp.speed * 0.6; break; }
        tx = Math.sin(a); tz = Math.cos(a); spd = d < sp.reach ? 0 : sp.speed * (this.state === 'attack' ? 0.6 : 1);
        if (this.state === 'attack' && this.attackCd > 0 && d < sp.reach + 0.5) spd = 0;
        break; }
    }
    if (this.lungeT > 0) this.lungeT -= dt;
    // statuses alter speed
    if (st.frozen > 0 || st.stun > 0) spd = 0; else if (st.slow > 0) spd *= 0.45;
    this.move(dt, tx, tz, spd);
    this.model.root.position.copy(this.pos); this.model.root.rotation.y = this.yaw;
    animateCreature(this.model, dt, { speed: this.curSpeed, graze, alert, rear: rear || (this.species === 'platypusbear' && this.windup > 0), lunge: this.lungeT > 0 ? 1 - this.lungeT / 0.35 : 0, frozen: st.frozen > 0, look: 0 });
    if (st.frozen > 0 && !this.iceMesh) { this.iceMesh = makeIce(this.radius * 1.6, this.height * 0.7); this.model.root.add(this.iceMesh); } else if (st.frozen <= 0 && this.iceMesh) { this.model.root.remove(this.iceMesh); FX.burst(V3(this.pos.x, this.pos.y + 0.5, this.pos.z), PAL.iceA, PAL.iceB, 14, 4, 0.2, 0.5, { grav: -10 }); this.iceMesh = null; SFX.ice(); }
  }
  move(dt, tx, tz, spd) {
    const sp = this.sp; let vx = tx * spd, vz = tz * spd;
    // look ahead for water / cliffs
    if (spd > 0.01 && !sp.swim) { const nx = this.pos.x + tx * 2.5, nz = this.pos.z + tz * 2.5; const gh = terrainH(nx, nz); if (gh < -0.4 || gh - this.pos.y > 4) { this.dir += Math.PI * 0.6 + Math.random(); this.timer = Math.min(this.timer, 1); vx *= -0.3; vz *= -0.3; } }
    if (Math.hypot(this.pos.x, this.pos.z) > 285) { const a = Math.atan2(-this.pos.x, -this.pos.z); vx = Math.sin(a) * Math.max(spd, 2); vz = Math.cos(a) * Math.max(spd, 2); }
    // knockback velocity
    this.vel.multiplyScalar(Math.exp(-4 * dt));
    this.pos.x += (vx + this.vel.x) * dt; this.pos.z += (vz + this.vel.z) * dt;
    resolveCollisions(this.pos, this.radius, this.pos.y);
    for (const s of G.structures) if (s.blocks && s.alive) s.blocks(this.pos, this.radius);
    const g = groundH(this.pos.x, this.pos.z, this.pos.y);
    this.vy += -20 * dt; this.pos.y += (this.vy + this.vel.y) * dt; this.vel.y *= Math.exp(-3 * dt);
    if (this.pos.y <= g) { this.pos.y = g; if (this.vy < -14) this.damage(Math.abs(this.vy) * 1.5, 'fall', null, true); this.vy = 0; }
    // deep water: float at the surface (swimmers sit high, others paddle half-submerged) so they stay hittable
    if (g < WORLD.sea - 0.4) { const floatY = WORLD.sea - (sp.swim ? 0.15 : this.height * 0.6); if (this.pos.y <= floatY) { this.pos.y = floatY; if (this.vy < 0) this.vy = 0; } this.swimming = true; } else this.swimming = false;
    const sm = Math.hypot(vx, vz); this.curSpeed = U.damp(this.curSpeed || 0, sm, 8, dt);
    if (sm > 0.05) this.yaw = U.dampAng(this.yaw, Math.atan2(vx, vz), 6, dt);
  }
  updateBison(dt) {
    const c = World.peakCenter; this.flyA += dt * 0.05 * (1 + (this.id % 2) * 0.3); const r = 60 + (this.id % 2) * 35;
    const nx = c.x + Math.cos(this.flyA) * r, nz = c.z + Math.sin(this.flyA) * r * 0.8; const ny = c.y + 18 + Math.sin(this.flyA * 3 + this.id) * 6 + (this.id % 2) * 10;
    const dx = nx - this.pos.x, dz = nz - this.pos.z; this.yaw = U.dampAng(this.yaw, Math.atan2(dx, dz), 1.5, dt);
    this.pos.set(nx, Math.max(ny, terrainH(nx, nz) + 8), nz); this.model.root.position.copy(this.pos); this.model.root.rotation.y = this.yaw; this.model.root.rotation.z = Math.sin(this.flyA * 2) * 0.08;
    if (this.model.shadow) this.model.shadow.visible = false;
    animateCreature(this.model, dt, { speed: 4 });
    if (Math.random() < dt * 0.02 && this.distToPlayer() < 120) SFX.roar(2.2);
  }
  updateBadger(dt, dp) {
    const P = PL(); const listen = dp < 18; const a = Math.atan2(P.pos.x - this.pos.x, P.pos.z - this.pos.z);
    this.model.root.position.copy(this.pos); this.model.root.rotation.y = this.yaw;
    const look = listen ? U.clamp(U.angDiff(this.yaw, a), -0.8, 0.8) : Math.sin(G.t * 0.2) * 0.3;
    animateCreature(this.model, dt, { speed: 0, graze: !listen, look });
    if (P.meditating && dp < 16 && Math.random() < dt * 0.8) FX.dust(V3(this.pos.x + (Math.random() - 0.5) * 3, this.pos.y, this.pos.z + (Math.random() - 0.5) * 3), 2, 1, 0.7);
  }
  damage(amount, el, src, silent) {
    if (!this.alive || this.sp.passive) return 0;
    this.hp -= amount; this.model.emissiveT = 0.18; this.lastHitEl = el;
    if (!silent) { G.ui.floater(this.pos, Math.round(amount), el); SFX.hit(); }
    if (this.sp.prey) { this.provoked = 6; } else if (src === G.player && this.state !== 'flee') this.state = 'chase';
    if (this.hp <= 0) this.die(el, src);
    return amount;
  }
  knock(dir, force, up = 2) { if (!this.alive || this.sp.passive) return; const m = 1 / Math.max(0.6, this.sp.size); this.vel.x += dir.x * force * m; this.vel.z += dir.z * force * m; this.vy += up * m; }
  die(el, src) {
    this.alive = false; this.deadT = 0; this.state = 'dead'; this.hp = 0;
    if (src === G.player) { Game.onKill(this, el); }
    G.ui.note(`${this.name} defeated.`, src === G.player ? 'good' : '');
  }
  remove() { G.scene.remove(this.model.root); this.removed = true; }
}
function makeIce(r, h) { const b = new GeoBuilder(); for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; b.add(new THREE.OctahedronGeometry(r * 0.4, 0), '#ffffff', Math.cos(a) * r * 0.55, h * 0.4, Math.sin(a) * r * 0.55, a, a, 0.3, 0.6, 1.6, 0.6); }
  return new THREE.Mesh(b.build(), new THREE.MeshPhongMaterial({ vertexColors: true, color: 0xbfe8ff, transparent: true, opacity: 0.7, shininess: 120, specular: 0xffffff, emissive: 0x1a3a5a })); }

/* ---------------- Humans: daofei & villagers ---------------- */
const DAOFEI = [
  { name: 'Yao the Breaker', role: 'leader', hp: 170, bender: 'earth', dmg: 16, look: { nation: 'earth', body: 'A', height: 1.08, build: 1.25, skin: '#c99a72', hair: 'topknot', hairColor: '#1b120c', eyes: '#2f2416', outfit: 0, beard: true }, palette: ['#5a3a2a', '#3a2a1a', '#8a1a12'] },
  { name: 'Daofei Rock-Slinger', role: 'ranged', hp: 90, bender: 'earth', dmg: 12, look: { nation: 'earth', body: 'A', height: 0.98, build: 1.05, skin: '#b5835c', hair: 'short', hairColor: '#2b1d12', eyes: '#2f2416', outfit: 0 }, palette: ['#6a4a2a', '#4a3a24', '#7a1a12'] },
  { name: 'Daofei Spearman', role: 'melee', hp: 85, dmg: 13, look: { nation: 'earth', body: 'A', height: 1.0, build: 1.1, skin: '#e1b892', hair: 'bun', hairColor: '#1b120c', eyes: '#5a3a22', outfit: 0 }, palette: ['#4a3a2a', '#2a221a', '#8a2a12'] },
  { name: 'Daofei Blade', role: 'melee', hp: 80, dmg: 12, look: { nation: 'earth', body: 'B', height: 0.97, build: 1.0, skin: '#c99a72', hair: 'braids', hairColor: '#2b1d12', eyes: '#2f2416', outfit: 0 }, palette: ['#5a2a22', '#2a1a14', '#a8321f'] },
  { name: 'Daofei Knife-Thrower', role: 'ranged', hp: 70, dmg: 9, look: { nation: 'earth', body: 'A', height: 0.95, build: 0.95, skin: '#f0cba6', hair: 'long', hairColor: '#4a3020', eyes: '#3d7a3a', outfit: 0 }, palette: ['#3a3a2a', '#2a2a1a', '#6a1a12'] },
];
class Human {
  constructor(def, x, z, kind) {
    this.id = ENT_ID++; this.kind = kind; this.def = def; this.name = def.name; this.hp = this.maxHp = def.hp || 100; this.pos = V3(x, groundH(x, z), z); this.home = V3(x, 0, z);
    this.yaw = def.yaw ?? Math.random() * 6.28; this.vel = V3(); this.vy = 0; this.radius = 0.4; this.height = 1.8; this.alive = true; this.state = 'idle'; this.timer = Math.random() * 3; this.status = { burn: 0, slow: 0, frozen: 0, stun: 0 };
    this.H = buildHumanoid(def.look, { palette: def.palette, hat: def.hat }); G.scene.add(this.H.root); this.attackCd = 1 + Math.random(); this.sp = { size: 1, prey: false };
    if (def.weapon !== false && kind === 'daofei') this.addWeapon(def.role);
    if (def.hat) { const b = new GeoBuilder(); b.add(new THREE.ConeGeometry(0.3, 0.14, 12), def.hat, 0, 0.24, 0); b.add(new THREE.CylinderGeometry(0.3, 0.3, 0.01, 12), def.hat, 0, 0.17, 0); this.H.J.head.add(new THREE.Mesh(b.build(), this.H.mat)); }
  }
  addWeapon(role) { const b = new GeoBuilder();
    if (this.def.role === 'melee' && this.name.includes('Spear')) { b.add(new THREE.CylinderGeometry(0.02, 0.02, 2.0, 5), '#6a4a2a', 0, 0, 0.3, Math.PI / 2, 0, 0); b.add(new THREE.ConeGeometry(0.05, 0.25, 5), '#c8c8c8', 0, 0, 1.4, Math.PI / 2, 0, 0); }
    else if (this.def.role === 'melee') { b.add(new THREE.BoxGeometry(0.06, 0.02, 0.8), '#d8d8d8', 0, 0, 0.45); b.add(new THREE.BoxGeometry(0.16, 0.04, 0.04), '#8a6a3a', 0, 0, 0.05); }
    else return;
    const w = new THREE.Mesh(b.build(), this.H.mat); this.H.J.handR.add(w); w.rotation.x = -0.3; }
  get hostile() { return this.kind === 'daofei'; }
  distToPlayer() { const p = PL().pos; return Math.hypot(p.x - this.pos.x, p.z - this.pos.z); }
  update(dt) {
    const P = PL(); for (const k in this.status) if (this.status[k] > 0) this.status[k] -= dt;
    if (!this.alive) { this.deadT += dt; animateHumanoid(this.H, dt, { dead: true, grounded: true }); this.H.root.position.copy(this.pos); if (this.deadT > 25 && this.kind === 'daofei') { G.scene.remove(this.H.root); this.removed = true; FX.dust(this.pos, 10); } return; }
    if (this.status.burn > 0) { this.burnTick = (this.burnTick || 0) - dt; if (this.burnTick <= 0) { this.burnTick = 0.5; this.damage(2.5, 'fire', null, true); } if (Math.random() < 0.4) FX.fire(V3(this.pos.x, this.pos.y + 1.1, this.pos.z), 1, 1, 0.35); }
    const dp = this.distToPlayer(); let tx = 0, tz = 0, spd = 0; let combat = false;
    if (this.kind === 'villager') {
      // face the player when nearby, wander otherwise
      if (dp < 5 && G.mode === 'play') { this.yaw = U.dampAng(this.yaw, Math.atan2(P.pos.x - this.pos.x, P.pos.z - this.pos.z), 5, dt); }
      else if (this.def.wander) { this.timer -= dt; if (this.timer <= 0) { if (this.state === 'idle') { this.state = 'walk'; const a = Math.random() * 6.28, r = Math.random() * this.def.wander; this.goal = V3(this.home.x + Math.cos(a) * r, 0, this.home.z + Math.sin(a) * r); this.timer = 8; } else { this.state = 'idle'; this.timer = 3 + Math.random() * 6; } }
        if (this.state === 'walk' && this.goal) { const a = Math.atan2(this.goal.x - this.pos.x, this.goal.z - this.pos.z); tx = Math.sin(a); tz = Math.cos(a); spd = 1.4; if (Math.hypot(this.goal.x - this.pos.x, this.goal.z - this.pos.z) < 0.8) { this.state = 'idle'; this.timer = 3 + Math.random() * 5; } } }
      if (this.def.night === 'home' && isNight()) { /* stays put at night */ spd = 0; }
    } else {
      // daofei combat AI
      const aware = G.flags.daofeiAlert || dp < 26 || this.provoked > 0;
      this.provoked = (this.provoked || 0) - dt;
      if (aware && !P.dead && G.mode === 'play' && !P.sheltered) {
        if (!G.flags.daofeiAlert) { G.flags.daofeiAlert = true; G.ui.note(`${this.name}: "Look — it's the Avatar! Get them!"`, 'bad'); SFX.roar(0.8); }
        combat = true; const a = Math.atan2(P.pos.x - this.pos.x, P.pos.z - this.pos.z); this.attackCd -= dt;
        if (this.windup > 0) { this.windup -= dt; this.yaw = U.dampAng(this.yaw, a, 10, dt); if (this.windup <= 0) this.strike(dp); }
        else if (this.def.role === 'ranged' || this.def.role === 'leader') {
          const ideal = this.def.role === 'leader' ? 7 : 13; const strafe = Math.sin(G.t * 0.7 + this.id) > 0 ? 1 : -1;
          if (dp > ideal + 4) { tx = Math.sin(a); tz = Math.cos(a); spd = 4.2; } else if (dp < ideal - 4) { tx = -Math.sin(a); tz = -Math.cos(a); spd = 3.5; } else { tx = Math.sin(a + strafe * 1.4); tz = Math.cos(a + strafe * 1.4); spd = 2.2; }
          if (this.attackCd <= 0) { this.windup = this.def.bender ? 0.75 : 0.45; playAction(this.H, this.def.bender ? 'earthLift' : 'punchR', 1); this.attackCd = 2.2 + Math.random() * 1.2; }
          this.yaw = U.dampAng(this.yaw, a, 8, dt);
        } else {
          if (dp > 1.9) { tx = Math.sin(a); tz = Math.cos(a); spd = 5.0; } else if (this.attackCd <= 0) { this.windup = 0.45; playAction(this.H, 'swing', 1); this.attackCd = 1.4 + Math.random() * 0.6; }
        }
        if (this.def.role === 'leader' && dp < 4 && this.attackCd <= 0.2 && !this.windup) { this.windup = 0.8; this.stomp = true; playAction(this.H, 'stomp', 1); this.attackCd = 4; }
      } else if (this.hostile) { // idle around the camp
        this.timer -= dt; if (this.timer <= 0) { this.timer = 4 + Math.random() * 6; this.goal = V3(this.home.x + (Math.random() - 0.5) * 10, 0, this.home.z + (Math.random() - 0.5) * 10); }
        if (this.goal && Math.hypot(this.goal.x - this.pos.x, this.goal.z - this.pos.z) > 1) { const a = Math.atan2(this.goal.x - this.pos.x, this.goal.z - this.pos.z); tx = Math.sin(a); tz = Math.cos(a); spd = 1.3; }
      }
    }
    if (this.status.frozen > 0 || this.status.stun > 0) spd = 0; else if (this.status.slow > 0) spd *= 0.45;
    const vx = tx * spd, vz = tz * spd; this.vel.multiplyScalar(Math.exp(-4 * dt));
    this.pos.x += (vx + this.vel.x) * dt; this.pos.z += (vz + this.vel.z) * dt; resolveCollisions(this.pos, this.radius, this.pos.y); for (const s of G.structures) if (s.blocks && s.alive) s.blocks(this.pos, this.radius);
    const g = groundH(this.pos.x, this.pos.z, this.pos.y); this.vy -= 20 * dt; this.pos.y += this.vy * dt; if (this.pos.y <= g) { this.pos.y = g; this.vy = 0; }
    const sm = Math.hypot(vx, vz); if (sm > 0.1 && !combat) this.yaw = U.dampAng(this.yaw, Math.atan2(vx, vz), 6, dt); else if (sm > 0.1 && this.def.role !== 'ranged' && this.def.role !== 'leader') this.yaw = U.dampAng(this.yaw, Math.atan2(vx, vz), 8, dt);
    this.H.root.position.copy(this.pos); this.H.root.rotation.y = this.yaw;
    animateHumanoid(this.H, dt, { speed: sm, grounded: true, combat, element: this.def.bender || 'none', id: this.id, frozen: this.status.frozen > 0 });
    if (this.status.frozen > 0 && !this.iceMesh) { this.iceMesh = makeIce(0.6, 1.0); this.H.root.add(this.iceMesh); } else if (this.status.frozen <= 0 && this.iceMesh) { this.H.root.remove(this.iceMesh); this.iceMesh = null; FX.burst(V3(this.pos.x, this.pos.y + 0.5, this.pos.z), PAL.iceA, PAL.iceB, 14, 4, 0.2, 0.5, { grav: -10 }); }
  }
  strike(dp) {
    const P = G.player;
    if (this.stomp) { this.stomp = false; Bending.shockwaveFX(this.pos, 6); SFX.earth(); if (dp < 6 && P.grounded && !P.invuln) { P.hurt(this.def.dmg, this); const d = V3(P.pos.x - this.pos.x, 0, P.pos.z - this.pos.z).normalize(); P.knock(d, 9, 5); } return; }
    if (this.def.role === 'ranged' || this.def.role === 'leader') {
      const from = V3(this.pos.x, this.pos.y + 1.4, this.pos.z); const to = V3(P.pos.x, P.pos.y + 1.0, P.pos.z); const lead = P.vel.clone().multiplyScalar(dp / 22); to.add(lead);
      const dir = to.sub(from).normalize();
      if (this.def.bender === 'earth') { Bending.spawnRock(from, dir, 20, this.def.dmg, this, 0.45); SFX.earth(); }
      else Bending.spawnKnife(from, dir, this.def.dmg, this);
    } else if (dp < 2.8) { if (!P.invuln) P.hurt(this.def.dmg, this); else G.ui.note('Dodged!', 'good'); }
  }
  damage(amount, el, src, silent) {
    if (!this.alive || this.kind !== 'daofei') return 0;
    this.hp -= amount; this.H.emissiveT = 0.18; this.provoked = 10; G.flags.daofeiAlert = true; if (!silent) { G.ui.floater(this.pos, Math.round(amount), el); SFX.hit(); if (Math.random() < 0.5) playAction(this.H, 'hit'); }
    if (this.hp <= 0) { this.alive = false; this.deadT = 0; this.hp = 0; Game.onKill(this, el); G.ui.note(`${this.name} yields!`, 'good'); Game.drop(this.pos, 'copper', 6 + Math.floor(Math.random() * 8)); if (this.def.role === 'leader') Game.drop(this.pos, 'map_frag', 1); }
    return amount;
  }
  knock(dir, force, up = 2) { if (!this.alive || this.kind !== 'daofei') return; this.vel.x += dir.x * force; this.vel.z += dir.z * force; this.vy += up; }
}
// setTimeout on the game clock: pauses with the game and stays deterministic in tests
function gameTimeout(fn, ms) { G.effects.push({ t: 0, update(dt) { this.t += dt * 1000; if (this.t >= ms) { fn(); return false; } return true; } }); }
function nearestLitFire(pos, r) { let best = null, bd = r; for (const f of G.campfires) { if (!f.lit) continue; const d = f.pos.distanceTo(pos); if (d < bd) { bd = d; best = f; } } return best; }

/* ---------------- spawning ---------------- */
const Spawner = {
  rng: U.rng(4242), timer: 0,
  zoneOk(zone, x, z) {
    const h = terrainH(x, z); const ri = regionInfo(x, z, h); const rc = ri.rc; const sl = slopeAt(x, z); const dr = U.polyDist(x, z, RIVER); const dl = Math.hypot((x + 80) / 1.15, z - 140);
    switch (zone) {
      case 'shore': return h > -1.6 && h < 0.2 && (dr < 13 || dl < 44) && rc > 40;
      case 'meadow': return h > 1 && rc > 45 && rc < 230 && ri.forest < 0.05 && ri.crag < 0.2 && ri.snow < 0.2 && ri.marsh < 0.3 && sl < 0.5;
      case 'forest': return h > 1 && rc > 55 && ri.forest > 0.05 && ri.crag < 0.2 && ri.snow < 0.2 && z > -100 && sl < 0.6;
      case 'plains': return h > 1 && x > 60 && x < 225 && z > -40 && z < 130 && ri.forest < 0.1 && sl < 0.5 && Math.hypot(x - LOC.daofei.x, z - LOC.daofei.z) > 40;
      case 'river': return h > 0.6 && h < 8 && (dr < 26 || (dl < 55 && dl > 40)) && rc > 70 && sl < 0.6;
      case 'highforest': return h > 4 && h < 50 && z < -60 && z > -170 && ri.crag < 0.3 && rc > 70 && sl < 0.8 && Math.hypot(x - LOC.badgercave.x, z - LOC.badgercave.z) > 25;
      case 'crags': return h > 0.5 && ri.crag > 0.6 && sl < 0.9 && Math.hypot(x - LOC.sunruins.x, z - LOC.sunruins.z) > 28;
    }
    return false;
  },
  point(zone, minPlayerDist = 0) {
    for (let tries = 0; tries < 900; tries++) {
      const x = (this.rng() - 0.5) * 560, z = (this.rng() - 0.5) * 560;
      if (!this.zoneOk(zone, x, z)) continue;
      if (G.player && Math.hypot(x - G.player.pos.x, z - G.player.pos.z) < minPlayerDist) continue;
      return [x, z];
    }
    return null;
  },
  initial() {
    for (const k in SPECIES) { const sp = SPECIES[k];
      if (k === 'skybison') { for (let i = 0; i < sp.count; i++) G.ents.push(new Creature(k, World.peakCenter.x, World.peakCenter.z)); continue; }
      if (k === 'badgermole') { const b = new Creature(k, World.caveCenter.x, World.caveCenter.z - 1.5, { yaw: Math.PI * 0.1 }); b.yaw = 0.2; G.ents.push(b); continue; }
      for (let i = 0; i < sp.count; i++) { const p = this.point(sp.zone, 0); if (!p) continue;
        if (sp.herd && i > 0) { const lead = G.ents.filter(e => e.species === k)[0]; if (lead) { p[0] = lead.home.x + (this.rng() - 0.5) * 14; p[1] = lead.home.z + (this.rng() - 0.5) * 14; } }
        G.ents.push(new Creature(k, p[0], p[1])); }
    }
  },
  tick(dt) {
    this.timer -= dt; if (this.timer > 0) return; this.timer = 6;
    for (const k in SPECIES) { const sp = SPECIES[k]; if (sp.passive) continue; const alive = G.ents.filter(e => e.species === k && e.alive).length; let target = sp.count;
      if (!sp.prey && isNight()) target += 1;
      if (alive < target) { const p = this.point(sp.zone, 70); if (p) G.ents.push(new Creature(k, p[0], p[1])); } }
    G.ents = G.ents.filter(e => !e.removed);
  },
};

/* =====================================================================
   PROJECTILES & BENDING STRUCTURES
   ===================================================================== */
const ROCK_GEO = (() => { const b = new GeoBuilder(); b.add(new THREE.DodecahedronGeometry(0.5, 1), '#8a7a62', 0, 0, 0, 0, 0, 0, 1, 1, 1, { jitter: 0.3, seed: 12, topTint: hexc('#a8987a') }); return b.build(); })();
const Bending = {
  hitTargets(p, r, owner, fn) {
    if (owner === G.player || owner === 'player') {
      for (const e of G.ents) { if (!e.alive || (e.sp && e.sp.passive) || e.kind === 'villager') continue; const dy = p.y - (e.pos.y + e.height * 0.5); const d = Math.hypot(p.x - e.pos.x, p.z - e.pos.z); if (d < r + e.radius && Math.abs(dy) < e.height * 0.6 + r) fn(e); }
    } else { const P = G.player; const d = Math.hypot(p.x - P.pos.x, p.z - P.pos.z); const dy = p.y - (P.pos.y + 0.9); if (d < r + 0.45 && Math.abs(dy) < 1.1 + r) fn(P); }
  },
  spawn(o) {
    const pr = Object.assign({ life: 2.5, grav: 0, r: 0.35, knock: 3, alive: true, t: 0, hit: new Set(), pierce: false }, o);
    if (pr.mesh) G.scene.add(pr.mesh); G.projectiles.push(pr); return pr;
  },
  spawnRock(from, dir, speed, dmg, owner, size = 0.6) {
    const m = new THREE.Mesh(ROCK_GEO, VCMAT()); m.scale.setScalar(size * 1.4); m.position.copy(from);
    return this.spawn({ el: 'earth', pos: from.clone(), vel: dir.clone().multiplyScalar(speed).add(V3(0, 2.5, 0)), grav: -9, r: size * 0.7, dmg, owner, mesh: m, life: 3, knock: 7, spin: V3(Math.random() * 8, Math.random() * 8, 0) });
  },
  spawnKnife(from, dir, dmg, owner) {
    const b = new GeoBuilder(); b.add(new THREE.BoxGeometry(0.04, 0.02, 0.4), '#e0e0e0'); const m = new THREE.Mesh(b.build(), VCMAT()); m.position.copy(from); m.lookAt(from.clone().add(dir));
    SFX.whoosh(); return this.spawn({ el: 'steel', pos: from.clone(), vel: dir.clone().multiplyScalar(26), grav: -3, r: 0.25, dmg, owner, mesh: m, life: 2, knock: 1, faceVel: true });
  },
  update(dt) {
    for (const p of G.projectiles) {
      if (!p.alive) continue; p.t += dt; p.life -= dt; if (p.life <= 0) { this.endProj(p, false); continue; }
      const steps = Math.ceil(p.vel.length() * dt / 0.5);
      for (let s = 0; s < steps && p.alive; s++) {
        const sdt = dt / steps; p.vel.y += p.grav * sdt; p.pos.addScaledVector(p.vel, sdt);
        // structures (earth walls) block enemy and player projectiles alike
        for (const st of G.structures) if (st.alive && st.stops && st.stops(p.pos, p.r)) { if (p.owner !== G.player) { Game.stat('blocked_earth', 1); G.ui.note('Blocked!', 'good'); } this.endProj(p, true); break; }
        if (!p.alive) break;
        // air shield deflects
        if (p.owner !== G.player && G.player.shieldT > 0 && p.pos.distanceTo(V3(G.player.pos.x, G.player.pos.y + 1, G.player.pos.z)) < 2.4) { p.vel.multiplyScalar(-1.1); p.owner = G.player; FX.air(p.pos, p.vel.clone().normalize(), 8, 3, 0.4); SFX.air(); continue; }
        const g = groundH(p.pos.x, p.pos.z, p.pos.y);
        if (p.pos.y < g) { this.endProj(p, true); break; }
        if (p.pos.y < WORLD.sea && g < WORLD.sea && p.el === 'fire') { FX.smoke(p.pos, 4, 1); this.endProj(p, false); break; }
        // static colliders
        const cl = collidersNear(p.pos.x, p.pos.z);
        for (const c of cl) { if (c.top !== undefined && p.pos.y > c.top) continue; if (c.type === 'circle' && Math.hypot(p.pos.x - c.x, p.pos.z - c.z) < c.r) { this.endProj(p, true); break; } }
        if (!p.alive) break;
        this.hitTargets(p.pos, p.r, p.owner, (e) => { if (p.hit.has(e) || !p.alive) return; p.hit.add(e); this.applyHit(p, e); if (!p.pierce) this.endProj(p, true); });
      }
      if (!p.alive) continue;
      if (p.mesh) { p.mesh.position.copy(p.pos); if (p.spin) { p.mesh.rotation.x += p.spin.x * dt; p.mesh.rotation.y += p.spin.y * dt; } if (p.faceVel) p.mesh.lookAt(p.pos.clone().add(p.vel)); if (p.spinZ) p.mesh.rotation.z += p.spinZ * dt; }
      if (p.trail) p.trail(p, dt);
      if (p.light) p.light.pos = p.pos;
    }
    G.projectiles = G.projectiles.filter(p => p.alive);
  },
  applyHit(p, e) {
    const dmg = p.dmg; const dir = p.vel.clone().setY(0).normalize();
    if (e === G.player) { if (G.player.invuln) return; G.player.hurt(dmg, p.owner); G.player.knock(dir, p.knock, 2); return; }
    const done = e.damage(dmg, p.el, G.player); if (done) Game.stat('hits_' + p.el, 1);
    if (p.el === 'fire' && Math.random() < 0.45) e.status.burn = 3;
    if (p.el === 'ice') { e.status.slow = 3; Game.stat('hits_water', 1); }
    if (p.el === 'iceprison') { e.status.frozen = 4.5; Game.stat('hits_water', 1); }
    if (p.el === 'earth') e.status.stun = 0.5;
    if (p.knock) { e.knock(dir, p.knock, p.el === 'air' ? 3 : 1.5); if (p.el === 'air') Game.stat('knock_air', 1); if (p.el === 'water') Game.stat('knock_water', 1); }
  },
  endProj(p, impact) {
    p.alive = false; if (p.mesh) G.scene.remove(p.mesh); if (p.onEnd) p.onEnd();
    const cc = World.cabbageCart; if (impact && cc && Math.hypot(p.pos.x - cc.x, p.pos.z - cc.z) < 3 && (!G.cabbageT || G.t - G.cabbageT > 6)) { G.cabbageT = G.t; G.ui.note('Cabbage Merchant: <b>"MY CABBAGES!"</b>', 'bad'); FX.burst(V3(cc.x, p.pos.y, cc.z), PAL.leaf, PAL.leaf, 20, 4, 0.3, 1, { normal: true, grav: -12, alpha: 1 }); Game.stat('cabbages', 1); }
    if (impact) {
      if (p.el === 'fire') { FX.burst(p.pos, PAL.fireA, PAL.fireB, 16, 4, 0.5, 0.45, { up: 1 }); FX.smoke(p.pos, 3, 1); }
      else if (p.el === 'earth') { FX.dust(p.pos, 10, 3, 0.8); FX.burst(p.pos, PAL.rockA, PAL.dustB, 10, 6, 0.25, 0.7, { normal: true, grav: -14, alpha: 1 }); SFX.crack(); }
      else if (p.el === 'water' || p.el === 'ice' || p.el === 'iceprison') { FX.splash(p.pos, 18, 3); if (p.el !== 'water') SFX.ice(); }
      else if (p.el === 'air') FX.air(p.pos, V3(0, 0.3, 0), 10, 3, 0.6);
      else FX.sparkle(p.pos, PAL.gold, 5);
    }
  },
  shockwaveFX(pos, radius) {
    const n = 14; const spikes = [];
    for (let ring = 0; ring < 2; ring++) for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 + ring * 0.2; const r = radius * (0.5 + ring * 0.5); const x = pos.x + Math.cos(a) * r, z = pos.z + Math.sin(a) * r; const y = groundH(x, z);
      const m = new THREE.Mesh(ROCK_GEO, VCMAT()); m.scale.set(0.6, 1.6, 0.6); m.position.set(x, y - 1.2, z); m.rotation.set(Math.random() * 0.4, a, Math.random() * 0.4); G.scene.add(m); spikes.push({ m, y, delay: ring * 0.12 + i * 0.004 }); FX.dust(V3(x, y, z), 2, 2, 0.8); }
    G.effects.push({ t: 0, dur: 1.4, update(dt) { this.t += dt; for (const s of spikes) { const u = U.clamp((this.t - s.delay) / 0.15, 0, 1); const down = U.clamp((this.t - 0.9) / 0.5, 0, 1); s.m.position.y = s.y - 1.2 + u * 1.4 - down * 1.6; } return this.t < this.dur; }, end() { spikes.forEach(s => G.scene.remove(s.m)); } });
  },
};

/* Earth wall */
function makeWall(pos, yaw, life) {
  const b = new GeoBuilder(); const w = 4.2, h = 2.6, d = 0.9;
  for (let i = 0; i < 4; i++) b.add(new THREE.BoxGeometry(w / 4 + 0.15, h * (0.9 + (i % 2) * 0.12), d), i % 2 ? '#8a7a62' : '#7a6a52', -w / 2 + (i + 0.5) * w / 4, h / 2, 0, (Math.random() - 0.5) * 0.06, 0, (Math.random() - 0.5) * 0.06, 1, 1, 1, { ao: 0.35, vary: 0.1, topTint: hexc('#9a8a6e') });
  b.add(new THREE.BoxGeometry(w + 0.3, 0.4, d + 0.5), '#6a5a42', 0, 0.1, 0, 0, 0, 0, 1, 1, 1, { jitter: 0.2 });
  const m = new THREE.Mesh(b.build(), VCMAT()); const gy = groundH(pos.x, pos.z); m.position.set(pos.x, gy - h, pos.z); m.rotation.y = yaw; G.scene.add(m);
  const col = addCollider({ type: 'box', x: pos.x, z: pos.z, hw: w / 2, hd: d / 2 + 0.1, rot: yaw, top: gy + h });
  const cs = Math.cos(yaw), sn = Math.sin(yaw);
  const s = { alive: true, t: 0, life, m, col, gy, h,
    stops(p, r) { if (p.y > gy + h + r || p.y < gy - 0.5) return false; const dx = p.x - pos.x, dz = p.z - pos.z; const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs; return Math.abs(lx) < w / 2 + r && Math.abs(lz) < d / 2 + r; },
    dispose() { this.alive = false; G.scene.remove(m); removeCollider(col); },
    update(dt) { this.t += dt; const up = U.smooth(0, 0.3, this.t); const down = U.smooth(this.life - 0.6, this.life, this.t); m.position.y = gy - h + h * up - h * down; if (this.t > this.life) this.dispose(); return this.alive; } };
  FX.dust(V3(pos.x, gy, pos.z), 18, 4, 1.1); SFX.earth(); return s;
}
/* Earth tent shelter */
function makeShelter(pos, yaw) {
  const b = new GeoBuilder(); const R = 2.3;
  for (let i = 0; i < 7; i++) { const a = yaw + i / 8 * Math.PI * 2 + Math.PI / 8; b.add(new THREE.BoxGeometry(2.0, 3.2, 0.5), i % 2 ? '#8a7a62' : '#7a6a52', Math.sin(a) * R, 1.2, Math.cos(a) * R, -0.42, a, 0, 1, 1, 1, { ao: 0.4, vary: 0.1, topTint: hexc('#9a8a6e') }); }
  b.add(new THREE.CylinderGeometry(0.8, 1.4, 0.6, 8), '#7a6a52', 0, 2.75, 0, 0, 0, 0, 1, 1, 1, { jitter: 0.2 });
  const m = new THREE.Mesh(b.build(), VCMAT()); const gy = groundH(pos.x, pos.z); m.position.set(pos.x, gy - 3.4, pos.z); G.scene.add(m);
  const s = { alive: true, t: 0, shelter: true, pos: V3(pos.x, gy, pos.z), m,
    blocks(p, r) { const d = Math.hypot(p.x - pos.x, p.z - pos.z); if (d < R + 0.8 + r && d > 0.01) { p.x = pos.x + (p.x - pos.x) / d * (R + 0.8 + r); p.z = pos.z + (p.z - pos.z) / d * (R + 0.8 + r); } },
    stops(p, r) { return p.y < gy + 3.2 && Math.hypot(p.x - pos.x, p.z - pos.z) < R + 0.5 + r && Math.hypot(p.x - pos.x, p.z - pos.z) > R - 0.6; },
    collapse() { this.collapsing = true; this.ct = 0; SFX.earth(); FX.dust(this.pos, 20, 3, 1.2); },
    dispose() { this.alive = false; G.scene.remove(m); },
    update(dt) { this.t += dt; if (this.collapsing) { this.ct += dt; m.position.y = gy - 3.4 * U.smooth(0, 0.7, this.ct); if (this.ct > 0.8) { this.alive = false; G.scene.remove(m); } return this.alive; }
      m.position.y = gy - 3.4 + 3.4 * U.smooth(0, 0.8, this.t); if (this.t < 0.8 && Math.random() < 0.5) FX.dust(V3(pos.x + (Math.random() - 0.5) * 4, gy, pos.z + (Math.random() - 0.5) * 4), 1, 2, 1); return true; } };
  SFX.earth(); gameTimeout(() => SFX.earth(), 250); return s;
}
/* Earth pillar */
function makePillar(pos) {
  const b = new GeoBuilder(); b.add(new THREE.CylinderGeometry(0.85, 1.05, 6, 7), '#7a6a52', 0, -3, 0, 0, 0, 0, 1, 1, 1, { jitter: 0.12, ao: 0.3, topTint: hexc('#9a8a6e') });
  const m = new THREE.Mesh(b.build(), VCMAT()); const gy = groundH(pos.x, pos.z); m.position.set(pos.x, gy - 0.2, pos.z); G.scene.add(m); const H = 5.0;
  const plat = { x: pos.x, z: pos.z, hw: 0.8, hd: 0.8, rot: 0, y: gy, c: 1, s: 0 }; PLATFORMS.push(plat);
  const col = addCollider({ type: 'circle', x: pos.x, z: pos.z, r: 0.9, top: gy + H });
  const s = { alive: true, t: 0, m,
    dispose() { this.alive = false; G.scene.remove(m); const i = PLATFORMS.indexOf(plat); if (i >= 0) PLATFORMS.splice(i, 1); removeCollider(col); },
    update(dt) { this.t += dt; const up = U.smooth(0, 0.25, this.t), down = U.smooth(9, 10, this.t); const top = gy + H * up - H * down; m.position.y = top; plat.y = top; col.top = top;
      if (this.t > 10) this.dispose(); return this.alive; } };
  FX.dust(V3(pos.x, gy, pos.z), 16, 4, 1); SFX.earth(); return s;
}

/* Campfires */
class Campfire {
  constructor(x, z, lit, opts = {}) { this.pos = V3(x, groundH(x, z), z); this.lit = lit; this.fuel = opts.permanent ? 1e9 : 240; this.permanent = !!opts.permanent;
    const b = new GeoBuilder(); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; b.add(new THREE.DodecahedronGeometry(0.18, 0), '#7a7268', Math.cos(a) * 0.55, 0.1, Math.sin(a) * 0.55); }
    for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + 0.3; b.add(new THREE.CylinderGeometry(0.06, 0.07, 0.9, 5), '#5a3a22', Math.cos(a) * 0.15, 0.25, Math.sin(a) * 0.15, Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9); }
    this.m = new THREE.Mesh(b.build(), VCMAT()); this.m.position.copy(this.pos); G.scene.add(this.m); this.glow = glowSprite(0xff8a3a, 4, 0); this.glow.position.set(0, 0.6, 0); this.m.add(this.glow); this.light = { pos: this.pos, intensity: 0, color: 0xff8a3a, range: 14 }; }
  update(dt) {
    if (this.lit) { if (!this.permanent) this.fuel -= dt; if (this.fuel <= 0) { this.lit = false; FX.smoke(this.pos, 6, 1); }
      const p = V3(this.pos.x, this.pos.y + 0.25, this.pos.z); if (Math.random() < 0.9) FX.fire(p, 2, 0.6, 0.55, 1.4); if (Math.random() < 0.3) FX.embers(p, 1); if (Math.random() < 0.15) FX.smoke(V3(p.x, p.y + 1, p.z), 1, 1);
      this.glow.material.opacity = 0.55 + Math.random() * 0.15; this.light.intensity = 2.2 * (0.6 + G.env.night * 0.6); }
    else { this.glow.material.opacity = 0; this.light.intensity = 0; }
  }
  remove() { G.scene.remove(this.m); }
}

/* Item drops on the ground */
class Drop {
  constructor(pos, item, n) { this.item = item; this.n = n; this.pos = pos.clone(); this.pos.y = groundH(pos.x, pos.z) + 0.3; this.t = 0;
    const b = new GeoBuilder(); b.add(new THREE.IcosahedronGeometry(0.18, 0), item === 'copper' ? '#d9a441' : '#e8d8b0'); this.m = new THREE.Mesh(b.build(), new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x3a2a0a })); this.m.position.copy(this.pos); G.scene.add(this.m); this.alive = true; }
  update(dt) { this.t += dt; this.m.position.y = this.pos.y + Math.sin(this.t * 3) * 0.1; this.m.rotation.y += dt * 2; if (Math.random() < 0.05) FX.sparkle(this.pos, PAL.gold, 1, 0.3, 0.12);
    const P = G.player; if (P.pos.distanceTo(this.pos) < 1.8) { Game.give(this.item, this.n); SFX.coin(); this.alive = false; G.scene.remove(this.m); } return this.alive; }
}
