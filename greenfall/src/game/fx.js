// Visual effects: particles (sparks, dust, dirt, ichor, smoke, embers), tracers, muzzle
// flashes, explosions, fires/campfires, pooled point lights, rain, spores and fireflies.
import * as THREE from 'three';
import { M } from './character.js';

const VERT = `attribute float aSize; attribute vec4 aColor; varying vec4 vColor;
  void main(){ vColor = aColor; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = aSize * (300.0 / -mv.z); gl_Position = projectionMatrix * mv; }`;
const FRAG = `varying vec4 vColor; void main(){ vec2 c = gl_PointCoord - 0.5; float d = dot(c,c); if (d > 0.25) discard; float a = smoothstep(0.25, 0.0, d); gl_FragColor = vec4(vColor.rgb, vColor.a * a); }`;

class ParticlePool {
  constructor(max, additive) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.grow = new Float32Array(max);
    this.baseA = new Float32Array(max);
    this.next = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    this.points = new THREE.Points(g, new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
  }
  emit(x, y, z, vx, vy, vz, life, size, r, g, b, a = 1, grav = 0, drag = 0, grow = 0) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = life; this.maxLife[i] = life;
    this.size[i] = size; this.grow[i] = grow;
    this.col[i * 4] = r; this.col[i * 4 + 1] = g; this.col[i * 4 + 2] = b; this.col[i * 4 + 3] = a; this.baseA[i] = a;
    this.grav[i] = grav; this.drag[i] = drag;
  }
  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { if (this.col[i * 4 + 3] !== 0) this.col[i * 4 + 3] = 0; continue; }
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.maxLife[i]);
      const d = 1 - this.drag[i] * dt;
      this.vel[i * 3] *= d; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d - this.grav[i] * dt; this.vel[i * 3 + 2] *= d;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] += this.grow[i] * dt;
      this.col[i * 4 + 3] = this.baseA[i] * Math.min(1, k * 2.5);
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
  }
}

export class FX {
  constructor(G) {
    this.G = G;
    this.group = new THREE.Group();
    this.group.name = 'fx';
    this.add = new ParticlePool(1800, true);
    this.norm = new ParticlePool(2400, false);
    this.group.add(this.add.points, this.norm.points);
    // tracers
    this.tracerMax = 64;
    this.tracerPos = new Float32Array(this.tracerMax * 6);
    this.tracerLife = new Float32Array(this.tracerMax);
    this.tracerCol = new Float32Array(this.tracerMax * 6);
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(this.tracerPos, 3).setUsage(THREE.DynamicDrawUsage));
    tg.setAttribute('color', new THREE.BufferAttribute(this.tracerCol, 3).setUsage(THREE.DynamicDrawUsage));
    this.tracers = new THREE.LineSegments(tg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.tracers.frustumCulled = false;
    this.group.add(this.tracers);
    this.tracerNext = 0;
    // light pool
    this.lights = [];
    for (let i = 0; i < 4; i++) { const l = new THREE.PointLight(0xffc070, 0, 14, 2); l.userData.t = 0; this.group.add(l); this.lights.push(l); }
    this.persist = []; // campfires, fires
    this.fireLights = [];
    for (let i = 0; i < 3; i++) { const l = new THREE.PointLight(0xff8a3a, 0, 22, 1.6); this.group.add(l); this.fireLights.push(l); }
    // rain
    const RN = 2600;
    this.rainN = RN;
    this.rainPos = new Float32Array(RN * 6);
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xa8d8b8, transparent: true, opacity: 0.32, depthWrite: false }));
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    this.group.add(this.rain);
    this.rainSeed = new Float32Array(RN * 3).map(() => Math.random());
    this.rainAmount = 0;
    this.ambientT = 0;
    this.stuck = [];
  }
  flashLight(x, y, z, color, intensity, dist, dur) {
    let l = this.lights.find((ll) => ll.userData.t <= 0) || this.lights[0];
    l.position.set(x, y, z); l.color.setHex(color); l.intensity = intensity; l.distance = dist; l.userData.t = dur; l.userData.max = intensity; l.userData.dur = dur;
  }
  muzzle(x, y, z, dx, dy, dz, suppressed) {
    const n = suppressed ? 3 : 8;
    for (let i = 0; i < n; i++) this.add.emit(x + dx * 0.1, y + dy * 0.1, z + dz * 0.1, dx * (4 + Math.random() * 6) + (Math.random() - 0.5), dy * 5 + (Math.random() - 0.5), dz * (4 + Math.random() * 6) + (Math.random() - 0.5), 0.06 + Math.random() * 0.05, suppressed ? 0.25 : 0.5, 1, 0.8, 0.4, 1);
    if (!suppressed) this.flashLight(x, y, z, 0xffc070, 6, 12, 0.06);
    for (let i = 0; i < 2; i++) this.norm.emit(x + dx * 0.3, y, z + dz * 0.3, dx + (Math.random() - 0.5) * 0.5, 0.4 + Math.random() * 0.3, dz + (Math.random() - 0.5) * 0.5, 0.8, 0.3, 0.7, 0.7, 0.7, 0.25, -0.2, 1.5, 0.8);
  }
  tracer(x0, y0, z0, x1, y1, z1, color = 0xfff2a0) {
    const i = this.tracerNext;
    this.tracerNext = (this.tracerNext + 1) % this.tracerMax;
    const c = new THREE.Color(color);
    // short streak starting slightly ahead of the muzzle
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
    const L = Math.hypot(dx, dy, dz) || 1;
    const s = Math.min(L, 2.5) / L;
    this.tracerPos.set([x0 + dx * s, y0 + dy * s, z0 + dz * s, x1, y1, z1], i * 6);
    this.tracerCol.set([c.r, c.g, c.b, c.r * 0.6, c.g * 0.6, c.b * 0.6], i * 6);
    this.tracerLife[i] = 0.07;
  }
  impact(x, y, z, nx, ny, nz, kind) {
    const P = { dust: [0.7, 0.68, 0.62, false], dirt: [0.45, 0.36, 0.25, false], wood: [0.62, 0.45, 0.28, false], stone: [0.62, 0.62, 0.6, false], spark: [1, 0.75, 0.3, true], blood: [0.6, 0.06, 0.05, false], ichor: [0.28, 0.42, 0.12, false], armor: [0.4, 0.75, 1, true] }[kind] || [0.7, 0.7, 0.7, false];
    const pool = P[3] ? this.add : this.norm;
    const n = kind === 'spark' ? 10 : 7;
    for (let i = 0; i < n; i++) {
      const s = 1.5 + Math.random() * 3;
      pool.emit(x + nx * 0.05, y + ny * 0.05, z + nz * 0.05, nx * s + (Math.random() - 0.5) * 2.5, ny * s + Math.random() * 2, nz * s + (Math.random() - 0.5) * 2.5, 0.25 + Math.random() * 0.35, P[3] ? 0.12 : 0.18 + Math.random() * 0.12, P[0], P[1], P[2], 1, P[3] ? 9 : 6, 1.5, 0);
    }
    if (!P[3]) this.norm.emit(x, y, z, nx * 0.4, 0.3, nz * 0.4, 0.7, 0.4, P[0], P[1], P[2], 0.4, -0.1, 2, 1.2);
  }
  dirtBurst(x, y, z) {
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 3;
      this.norm.emit(x + Math.cos(a) * 0.4, y + 0.1, z + Math.sin(a) * 0.4, Math.cos(a) * s, 2 + Math.random() * 4, Math.sin(a) * s, 0.8 + Math.random() * 0.6, 0.25 + Math.random() * 0.2, 0.36, 0.28, 0.18, 1, 9, 1.2);
    }
    for (let i = 0; i < 6; i++) this.norm.emit(x, y + 0.3, z, (Math.random() - 0.5), 0.6, (Math.random() - 0.5), 1.8, 0.8, 0.45, 0.4, 0.3, 0.35, -0.1, 1, 1.5);
  }
  explosion(x, y, z, r) {
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * Math.PI * 2, e = Math.random() * 1.2, s = 4 + Math.random() * 10;
      this.add.emit(x, y + 0.3, z, Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s + 2, Math.sin(a) * Math.cos(e) * s, 0.35 + Math.random() * 0.4, 0.7 + Math.random() * 0.8, 1, 0.55 + Math.random() * 0.3, 0.15, 1, 3, 3, 1);
    }
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 3;
      this.norm.emit(x + Math.cos(a), y + 0.5, z + Math.sin(a), Math.cos(a) * s, 2 + Math.random() * 3, Math.sin(a) * s, 2.5 + Math.random() * 2, 1.5, 0.22, 0.22, 0.2, 0.55, -0.3, 1.2, 1.4);
    }
    this.flashLight(x, y + 1, z, 0xffa040, 40, r * 6, 0.35);
  }
  debris(x, y, z, mat) {
    const c = { wood: [0.7, 0.5, 0.3], stone: [0.6, 0.6, 0.58], metal: [0.6, 0.64, 0.68] }[mat] || [0.6, 0.6, 0.6];
    for (let i = 0; i < 24; i++) this.norm.emit(x + (Math.random() - 0.5) * 3, y + (Math.random() - 0.5) * 2, z + (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 5, Math.random() * 5, (Math.random() - 0.5) * 5, 0.8 + Math.random() * 0.5, 0.25 + Math.random() * 0.25, c[0], c[1], c[2], 1, 12, 0.5);
    for (let i = 0; i < 8; i++) this.norm.emit(x, y, z, (Math.random() - 0.5) * 2, 0.5, (Math.random() - 0.5) * 2, 1.5, 1.2, c[0], c[1], c[2], 0.35, -0.1, 1.5, 1.4);
  }
  flash(x, y, z, color) { this.flashLight(x, y, z, color, 8, 18, 0.4); }
  stuckBolt(x, y, z, dx, dy, dz) {
    const m = new THREE.Mesh(FX.boltGeo || (FX.boltGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.6, 5).rotateX(Math.PI / 2)), M(0x5a4a3a));
    m.position.set(x - dx * 0.25, y - dy * 0.25, z - dz * 0.25);
    m.lookAt(x + dx, y + dy, z + dz);
    this.group.add(m);
    this.stuck.push({ m, t: 30 });
  }
  addFire(x, y, z, r) {
    const f = { x, y, z, r, kind: 'fire', t: 0 };
    this.persist.push(f);
    return f;
  }
  removeFire(f) { const i = this.persist.indexOf(f); if (i >= 0) this.persist.splice(i, 1); }
  addCampfire(x, y, z) {
    const g = new THREE.Group();
    const stone = M(0x7a7670, { rough: 1 }), log = M(0x5a3a22, { rough: 0.9 }), coal = M(0xff6a20, { emissive: 1.5 });
    for (let k = 0; k < 9; k++) { const a = (k / 9) * Math.PI * 2; const s = new THREE.Mesh(FX.stoneGeo || (FX.stoneGeo = new THREE.DodecahedronGeometry(0.16, 0)), stone); s.position.set(Math.cos(a) * 0.55, 0.08, Math.sin(a) * 0.55); s.castShadow = true; g.add(s); }
    for (let k = 0; k < 4; k++) { const l = new THREE.Mesh(FX.logGeo || (FX.logGeo = new THREE.CylinderGeometry(0.07, 0.08, 0.9, 6)), log); l.rotation.z = 1.1; l.rotation.y = (k / 4) * Math.PI * 2; l.position.y = 0.25; g.add(l); }
    const c = new THREE.Mesh(FX.coalGeo || (FX.coalGeo = new THREE.SphereGeometry(0.22, 8, 6)), coal); c.scale.y = 0.4; c.position.y = 0.08; g.add(c);
    g.position.set(x, y, z);
    this.group.add(g);
    const f = { x, y, z, r: 0.6, kind: 'campfire', mesh: g, t: 0 };
    this.persist.push(f);
    return f;
  }
  removeCampfire(f) { if (f.mesh) this.group.remove(f.mesh); this.removeFire(f); }

  update(dt, camPos, env) {
    this.add.update(dt);
    this.norm.update(dt);
    for (let i = 0; i < this.tracerMax; i++) if (this.tracerLife[i] > 0) { this.tracerLife[i] -= dt; if (this.tracerLife[i] <= 0) this.tracerPos.fill(0, i * 6, i * 6 + 6); }
    this.tracers.geometry.attributes.position.needsUpdate = true;
    this.tracers.geometry.attributes.color.needsUpdate = true;
    for (const l of this.lights) if (l.userData.t > 0) { l.userData.t -= dt; l.intensity = Math.max(0, l.userData.max * (l.userData.t / l.userData.dur)); }
    for (let i = this.stuck.length - 1; i >= 0; i--) { const s = this.stuck[i]; s.t -= dt; if (s.t <= 0) { this.group.remove(s.m); this.stuck.splice(i, 1); } }
    // fires & campfires: flames + nearest lights
    const sorted = this.persist.map((f) => [f, Math.hypot(f.x - camPos.x, f.z - camPos.z)]).sort((a, b) => a[1] - b[1]);
    for (let i = 0; i < this.fireLights.length; i++) {
      const l = this.fireLights[i];
      const e = sorted[i];
      if (e && e[1] < 120) { const f = e[0]; l.position.set(f.x, f.y + 1.2, f.z); l.intensity = (f.kind === 'fire' ? 8 : 5) * (0.8 + Math.random() * 0.35); l.distance = f.kind === 'fire' ? 26 : 18; }
      else l.intensity = 0;
    }
    for (const [f, d] of sorted) {
      if (d > 90) continue;
      const n = f.kind === 'fire' ? 6 : 2;
      for (let k = 0; k < n; k++) {
        const a = Math.random() * Math.PI * 2, rr = Math.random() * f.r;
        this.add.emit(f.x + Math.cos(a) * rr, f.y + 0.15, f.z + Math.sin(a) * rr, (Math.random() - 0.5) * 0.4, 1.2 + Math.random() * 1.5, (Math.random() - 0.5) * 0.4, 0.45 + Math.random() * 0.4, f.kind === 'fire' ? 0.9 : 0.55, 1, 0.45 + Math.random() * 0.3, 0.1, 1, -1, 0.5, -0.6);
      }
      if (Math.random() < dt * 6) this.norm.emit(f.x, f.y + 1.2, f.z, (Math.random() - 0.5) * 0.3, 0.8, (Math.random() - 0.5) * 0.3, 3, 0.6, 0.25, 0.25, 0.25, 0.3, -0.05, 0.3, 0.9);
      if (Math.random() < dt * 4) this.add.emit(f.x, f.y + 0.6, f.z, (Math.random() - 0.5), 2 + Math.random() * 2, (Math.random() - 0.5), 1.5, 0.08, 1, 0.6, 0.2, 1, -0.3, 0.2);
    }
    // rain during storms
    const rainWant = env ? Math.max(0, env.storm - 0.45) * 1.8 : 0;
    this.rainAmount += (rainWant - this.rainAmount) * Math.min(1, dt * 0.5);
    this.rain.visible = this.rainAmount > 0.05;
    if (this.rain.visible) {
      const n = Math.floor(this.rainN * Math.min(1, this.rainAmount));
      const R = 30, H = 22, t = this.G.time;
      for (let i = 0; i < this.rainN; i++) {
        const o = i * 6;
        if (i >= n) { this.rainPos[o + 1] = -9999; this.rainPos[o + 4] = -9999; continue; }
        const sx = this.rainSeed[i * 3], sz = this.rainSeed[i * 3 + 1], so = this.rainSeed[i * 3 + 2];
        const x = camPos.x + (sx - 0.5) * 2 * R, z = camPos.z + (sz - 0.5) * 2 * R;
        const y = camPos.y + H / 2 - (((t * 22 + so * H) % H));
        this.rainPos[o] = x; this.rainPos[o + 1] = y; this.rainPos[o + 2] = z;
        this.rainPos[o + 3] = x + 0.08; this.rainPos[o + 4] = y - 0.7; this.rainPos[o + 5] = z + 0.03;
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
      this.rain.material.opacity = 0.18 + this.rainAmount * 0.18;
    }
    // ambient: spores in horde zones, fireflies at dusk/night, falling leaves by day
    this.ambientT -= dt;
    if (this.ambientT <= 0 && env) {
      this.ambientT = 0.05;
      const inH = this.G.hordes?.inside(camPos.x, camPos.z);
      if (inH) for (let k = 0; k < 3; k++) this.add.emit(camPos.x + (Math.random() - 0.5) * 40, camPos.y + (Math.random() - 0.3) * 10, camPos.z + (Math.random() - 0.5) * 40, (Math.random() - 0.5) * 0.3, 0.2 + Math.random() * 0.3, (Math.random() - 0.5) * 0.3, 4, 0.12, 0.55, 1, 0.4, 0.8, -0.02, 0.1);
      if (env.night > 0.4 && env.storm < 0.95 && Math.random() < 0.6) this.add.emit(camPos.x + (Math.random() - 0.5) * 50, camPos.y - 1 + Math.random() * 3, camPos.z + (Math.random() - 0.5) * 50, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.5, 3 + Math.random() * 2, 0.14, 0.75, 1, 0.35, 0.9, 0, 0.3);
      if (env.night < 0.3 && Math.random() < 0.35) {
        const c = [[0.85, 0.55, 0.15], [0.9, 0.75, 0.2], [0.7, 0.3, 0.1]][Math.floor(Math.random() * 3)];
        this.norm.emit(camPos.x + (Math.random() - 0.5) * 40, camPos.y + 6 + Math.random() * 6, camPos.z + (Math.random() - 0.5) * 40, 0.6 + Math.random() * 0.4, -0.8, 0.3 * (Math.random() - 0.5), 7, 0.16, c[0], c[1], c[2], 0.9, 0.02, 0.1);
      }
    }
  }
}
