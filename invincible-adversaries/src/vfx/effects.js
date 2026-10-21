import * as THREE from 'three';
import { ParticleSystem, SHAPE } from './particles.js';
import { rand, clamp, clamp01, ease, lerp, TAU } from '../engine/math.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3(), _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

// ------------------------------------------------------------------ shaders
const ENERGY_VERT = /* glsl */`
  varying vec3 vN; varying vec3 vV; varying vec2 vUv; varying vec3 vObj;
  void main() {
    vUv = uv; vObj = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;
const NOISE_GLSL = /* glsl */`
  float h3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float n3(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
  float fbm(vec3 p) { return n3(p) * 0.5 + n3(p * 2.03) * 0.3 + n3(p * 4.1) * 0.2; }
`;

function energyMat({ color = 0xffffff, intensity = 2, fresnel = 2.0, noise = 0.6, scroll = new THREE.Vector2(0, 1), side = THREE.FrontSide, rimOnly = false, edgeFade = false } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color).multiplyScalar(intensity) },
      uOpacity: { value: 1 }, uTime: { value: 0 }, uFres: { value: fresnel }, uNoise: { value: noise },
      uScroll: { value: scroll }, uRimOnly: { value: rimOnly ? 1 : 0 }, uEdge: { value: edgeFade ? 1 : 0 },
    },
    vertexShader: ENERGY_VERT,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uOpacity, uTime, uFres, uNoise, uRimOnly, uEdge; uniform vec2 uScroll;
      varying vec3 vN; varying vec3 vV; varying vec2 vUv; varying vec3 vObj;
      ${NOISE_GLSL}
      void main() {
        float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
        float fr = pow(f, uFres);
        float n = fbm(vec3(vUv * vec2(6.0, 3.0) + uScroll * uTime, uTime * 0.5));
        float a = mix(1.0, n * 1.6, uNoise) * (uRimOnly > 0.5 ? fr : (0.18 + fr));
        if (uEdge > 0.5) a *= smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.7, vUv.y);
        a *= uOpacity;
        if (a < 0.002) discard;
        gl_FragColor = vec4(uColor * a, a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side,
  });
}

function ringMat(color, intensity = 1.5, soft = 0.35, additive = true) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color).multiplyScalar(intensity) }, uOpacity: { value: 1 }, uTime: { value: 0 }, uSoft: { value: soft }, uSeed: { value: Math.random() * 10 } },
    vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uOpacity, uTime, uSoft, uSeed; varying vec2 vUv;
      ${NOISE_GLSL}
      void main() {
        vec2 p = vUv * 2.0 - 1.0; float r = length(p);
        float ang = atan(p.y, p.x);
        float band = smoothstep(1.0 - uSoft, 0.92, r) * (1.0 - smoothstep(0.96, 1.0, r));
        float n = n3(vec3(ang * 4.0, r * 6.0 - uTime * 3.0, uSeed));
        float a = band * (0.55 + 0.75 * n) * uOpacity;
        if (a < 0.003) discard;
        gl_FragColor = vec4(uColor * a, a);
      }`,
    transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, side: THREE.DoubleSide,
  });
}

// ------------------------------------------------------------------ textures
function craterTexture(kind = 'crater') {
  const S = 512, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const cx = S / 2;
  if (kind === 'crater') {
    const grd = g.createRadialGradient(cx, cx, 0, cx, cx, S / 2);
    grd.addColorStop(0, 'rgba(20,18,16,0.95)'); grd.addColorStop(0.35, 'rgba(45,40,36,0.85)');
    grd.addColorStop(0.62, 'rgba(70,64,58,0.55)'); grd.addColorStop(1, 'rgba(70,64,58,0)');
    g.fillStyle = grd; g.fillRect(0, 0, S, S);
    // radial cracks
    g.strokeStyle = 'rgba(15,12,10,0.9)';
    for (let i = 0; i < 22; i++) {
      let a = Math.random() * TAU, r = S * 0.12, x = cx + Math.cos(a) * r, y = cx + Math.sin(a) * r;
      g.lineWidth = 2 + Math.random() * 4;
      g.beginPath(); g.moveTo(x, y);
      const len = S * (0.25 + Math.random() * 0.22);
      for (let k = 0; k < 8; k++) { a += (Math.random() - 0.5) * 0.5; r += len / 8; x = cx + Math.cos(a) * r; y = cx + Math.sin(a) * r; g.lineTo(x, y); g.lineWidth *= 0.85; }
      g.stroke();
    }
    // rim chunks
    for (let i = 0; i < 90; i++) {
      const a = Math.random() * TAU, r = S * (0.28 + Math.random() * 0.12);
      g.fillStyle = `rgba(${90 + Math.random() * 40},${84 + Math.random() * 30},${76 + Math.random() * 30},0.8)`;
      g.beginPath(); g.arc(cx + Math.cos(a) * r, cx + Math.sin(a) * r, 2 + Math.random() * 7, 0, TAU); g.fill();
    }
  } else if (kind === 'scorch') {
    const grd = g.createRadialGradient(cx, cx, 0, cx, cx, S / 2);
    grd.addColorStop(0, 'rgba(40,10,30,0.85)'); grd.addColorStop(0.5, 'rgba(60,20,50,0.5)'); grd.addColorStop(1, 'rgba(60,20,50,0)');
    g.fillStyle = grd; g.fillRect(0, 0, S, S);
  } else if (kind === 'atom') {
    g.strokeStyle = 'rgba(255,120,220,1)'; g.lineWidth = 10;
    g.beginPath(); g.arc(cx, cx, S * 0.46, 0, TAU); g.stroke();
    g.lineWidth = 4; g.beginPath(); g.arc(cx, cx, S * 0.4, 0, TAU); g.stroke();
    for (let k = 0; k < 3; k++) { g.save(); g.translate(cx, cx); g.rotate(k * Math.PI / 3); g.beginPath(); g.ellipse(0, 0, S * 0.36, S * 0.12, 0, 0, TAU); g.stroke(); g.restore(); }
    g.fillStyle = 'rgba(255,170,240,1)'; g.beginPath(); g.arc(cx, cx, S * 0.05, 0, TAU); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function comicTexture(text, fill, stroke) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.translate(256, 128); g.rotate(-0.12);
  // burst
  g.fillStyle = '#fff200'; g.strokeStyle = '#000'; g.lineWidth = 8;
  g.beginPath();
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * TAU, r = i % 2 ? 105 : 125 + Math.random() * 18;
    g.lineTo(Math.cos(a) * r * 1.9, Math.sin(a) * r * 0.95);
  }
  g.closePath(); g.fill(); g.stroke();
  g.font = '900 104px Anton, Impact, "Arial Black", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineJoin = 'round'; g.lineWidth = 18; g.strokeStyle = '#000'; g.strokeText(text, 0, 6);
  g.fillStyle = fill; g.fillText(text, 0, 6);
  g.lineWidth = 3; g.strokeStyle = stroke; g.strokeText(text, 0, 6);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ------------------------------------------------------------------ effect objects
class TimedMesh {
  constructor(mesh, life, onUpdate) { this.mesh = mesh; this.life = life; this.t = 0; this.onUpdate = onUpdate; }
  update(dt) {
    this.t += dt;
    const k = this.t / this.life;
    if (k >= 1) return false;
    this.onUpdate(k, dt, this.t);
    return true;
  }
  dispose(scene) { scene.remove(this.mesh); if (this.mesh.material && this.mesh.material.dispose && !this.mesh.material.userData.shared) this.mesh.material.dispose(); }
}

export class Trail {
  constructor(fx, { color = 0xffffff, intensity = 1.5, width = 0.25, life = 0.25, max = 48, minDist = 0.04, taper = true, additive = true } = {}) {
    this.fx = fx; this.life = life; this.width = width; this.max = max; this.minDist = minDist; this.taper = taper;
    this.pts = []; // {p, t}
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 2 * 3);
    this.alpha = new Float32Array(max * 2);
    this.uvs = new Float32Array(max * 2 * 2);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('uv', new THREE.BufferAttribute(this.uvs, 2).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let i = 0; i < max - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setIndex(idx);
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color).multiplyScalar(intensity) }, uOpacity: { value: 1 } },
      vertexShader: /* glsl */`attribute float aAlpha; varying float vA; varying vec2 vUv; void main(){ vA = aAlpha; vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */`uniform vec3 uColor; uniform float uOpacity; varying float vA; varying vec2 vUv;
        void main(){ float e = 1.0 - pow(abs(vUv.y * 2.0 - 1.0), 2.0); float a = vA * e * uOpacity; if (a < 0.003) discard; gl_FragColor = vec4(uColor * a, a); }`,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 8;
    fx.scene.add(this.mesh);
    this.time = 0;
    this.emitting = true;
    this.dead = false;
  }
  push(p) {
    const last = this.pts[this.pts.length - 1];
    if (last && last.p.distanceToSquared(p) < this.minDist * this.minDist) { last.p.copy(p); last.t = this.time; return; }
    this.pts.push({ p: p.clone(), t: this.time });
    if (this.pts.length > this.max) this.pts.shift();
  }
  update(dt, cam) {
    this.time += dt;
    while (this.pts.length && this.time - this.pts[0].t > this.life) this.pts.shift();
    const n = this.pts.length;
    if (!this.emitting && n < 2) { this.dead = true; return false; }
    const camPos = cam.position;
    for (let i = 0; i < this.max; i++) {
      const pi = Math.min(i, n - 1);
      if (n < 2) { this.alpha[i * 2] = this.alpha[i * 2 + 1] = 0; continue; }
      const P = this.pts[pi].p;
      const Pn = this.pts[Math.min(pi + 1, n - 1)].p, Pp = this.pts[Math.max(pi - 1, 0)].p;
      _v.subVectors(Pn, Pp); if (_v.lengthSq() < 1e-8) _v.set(0, 1, 0);
      _w.subVectors(camPos, P);
      _u.crossVectors(_v, _w).normalize();
      const age = (this.time - this.pts[pi].t) / this.life;
      const k = n > 1 ? pi / (n - 1) : 1; // 0 tail .. 1 head
      const w = this.width * (this.taper ? k : 1) * (1 - age * 0.5);
      const o = i * 6;
      this.pos[o] = P.x + _u.x * w; this.pos[o + 1] = P.y + _u.y * w; this.pos[o + 2] = P.z + _u.z * w;
      this.pos[o + 3] = P.x - _u.x * w; this.pos[o + 4] = P.y - _u.y * w; this.pos[o + 5] = P.z - _u.z * w;
      const a = i < n ? clamp01(1 - age) * k : 0;
      this.alpha[i * 2] = this.alpha[i * 2 + 1] = a;
      this.uvs[i * 4] = k; this.uvs[i * 4 + 1] = 0; this.uvs[i * 4 + 2] = k; this.uvs[i * 4 + 3] = 1;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
    this.geo.attributes.uv.needsUpdate = true;
    return true;
  }
  stop() { this.emitting = false; }
  dispose() { this.fx.scene.remove(this.mesh); this.geo.dispose(); this.mat.dispose(); }
}

class LightPool {
  constructor(scene, n = 6) {
    this.lights = [];
    for (let i = 0; i < n; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 12, 2);
      l.castShadow = false;
      scene.add(l);
      this.lights.push({ l, t: 0, life: 0, i0: 0, follow: null });
    }
  }
  flash(pos, color, intensity = 30, range = 12, life = 0.25, follow = null) {
    let best = this.lights[0];
    for (const s of this.lights) { if (s.t >= s.life) { best = s; break; } if (s.life - s.t < best.life - best.t) best = s; }
    best.l.position.copy(pos); best.l.color.set(color); best.l.distance = range;
    best.i0 = intensity; best.t = 0; best.life = life; best.follow = follow;
    best.l.intensity = intensity;
    return best;
  }
  update(dt) {
    for (const s of this.lights) {
      if (s.t >= s.life) { s.l.intensity = 0; continue; }
      s.t += dt;
      if (s.follow) s.l.position.copy(s.follow);
      const k = clamp01(s.t / s.life);
      s.l.intensity = s.i0 * (1 - k) * (1 - k);
    }
  }
}

class Debris {
  constructor(scene, max = 260) {
    const geo = new THREE.IcosahedronGeometry(1, 0);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setXYZ(i, pos.getX(i) * (0.8 + Math.random() * 0.4), pos.getY(i) * (0.6 + Math.random() * 0.3), pos.getZ(i) * (0.8 + Math.random() * 0.4));
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.castShadow = true;
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.items = [];
    this.max = max;
    this.m = new THREE.Matrix4(); this.s = new THREE.Vector3(); this.color = new THREE.Color();
  }
  spawn(p, v, size, color = 0x9a9590, life = 3.5) {
    if (this.items.length >= this.max) this.items.shift();
    this.items.push({ p: p.clone(), v: v.clone(), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(rand(0, 6), rand(0, 6), rand(0, 6))), av: new THREE.Vector3(rand(-12, 12), rand(-12, 12), rand(-12, 12)), size, t: 0, life, color: new THREE.Color(color).multiplyScalar(rand(0.75, 1.1)), rest: false });
  }
  update(dt) {
    const it = this.items;
    for (let i = it.length - 1; i >= 0; i--) {
      const d = it[i];
      d.t += dt;
      if (d.t > d.life + 1) { it.splice(i, 1); continue; }
      if (!d.rest) {
        d.v.y -= 22 * dt;
        d.p.addScaledVector(d.v, dt);
        _q.setFromEuler(new THREE.Euler(d.av.x * dt, d.av.y * dt, d.av.z * dt));
        d.q.multiply(_q);
        if (d.p.y < d.size * 0.5) {
          d.p.y = d.size * 0.5;
          if (Math.abs(d.v.y) < 2) { d.rest = d.v.lengthSq() < 4; d.v.y = 0; }
          d.v.y = Math.abs(d.v.y) * 0.32; d.v.x *= 0.6; d.v.z *= 0.6; d.av.multiplyScalar(0.6);
        }
      }
      if (d.t > d.life) d.p.y -= dt * d.size; // sink
    }
    this.mesh.count = it.length;
    for (let i = 0; i < it.length; i++) {
      const d = it[i];
      const sc = d.size * (d.t < 0.06 ? d.t / 0.06 : 1);
      this.m.compose(d.p, d.q, this.s.set(sc, sc, sc));
      this.mesh.setMatrixAt(i, this.m);
      this.mesh.setColorAt(i, d.color);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

// ---------------- Bubble shield ----------------
const BUBBLE_VERT = /* glsl */`
  attribute vec3 bary;
  varying vec3 vBary; varying vec3 vN; varying vec3 vV; varying vec3 vObj;
  void main() {
    vBary = bary; vObj = normalize(position);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }`;
const BUBBLE_FRAG = /* glsl */`
  uniform vec3 uColor; uniform float uOpacity, uTime, uPulse, uBreak;
  uniform vec4 uHits[4];
  varying vec3 vBary; varying vec3 vN; varying vec3 vV; varying vec3 vObj;
  ${NOISE_GLSL}
  void main() {
    float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
    float fr = pow(f, 2.2);
    float e = min(min(vBary.x, vBary.y), vBary.z);
    float edge = 1.0 - smoothstep(0.0, 0.045, e);
    float cell = n3(vObj * 9.0 + uTime * 0.7);
    float shimmer = smoothstep(0.62, 0.95, n3(vObj * 5.0 - vec3(0.0, uTime * 1.3, 0.0)));
    float hit = 0.0;
    for (int i = 0; i < 4; i++) {
      vec4 h = uHits[i];
      float hl = length(h.xyz);
      if (h.w > 1.0 || hl < 1e-4) continue;
      float ang = acos(clamp(dot(vObj, h.xyz / hl), -1.0, 1.0));
      float rr = h.w * 2.2;
      hit += exp(-pow((ang - rr) * 7.0, 2.0)) * (1.0 - h.w) * 0.85 + exp(-ang * 6.0) * (1.0 - h.w) * (1.0 - h.w) * 0.7;
    }
    // hits ripple across the shell; kept moderate because the bubble is additive and blooms
    float a = 0.06 + fr * 0.9 + edge * (0.22 + fr * 0.6) * (0.6 + 0.4 * cell) + shimmer * 0.12 + min(hit, 1.2);
    a *= uOpacity * (1.0 + uPulse * 0.3);
    a *= 1.0 - uBreak;
    a *= gl_FrontFacing ? 1.0 : 0.4;
    gl_FragColor = vec4(uColor * a, a);
  }`;

export class Bubble {
  constructor(fx, target, { radius = 1.25, color = 0xff4fd8 } = {}) {
    this.fx = fx; this.target = target; this.radius = radius;
    if (!fx._bubbleGeo) {
      const g = new THREE.IcosahedronGeometry(1, 3);
      const n = g.attributes.position.count;
      const b = new Float32Array(n * 3);
      for (let i = 0; i < n; i += 3) { b[i * 3] = 1; b[i * 3 + 4] = 1; b[i * 3 + 8] = 1; }
      g.setAttribute('bary', new THREE.BufferAttribute(b, 3));
      fx._bubbleGeo = g;
    }
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color).multiplyScalar(1.6) }, uOpacity: { value: 0 }, uTime: { value: 0 }, uPulse: { value: 0 }, uBreak: { value: 0 }, uHits: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, 1, 0, 2)) } },
      vertexShader: BUBBLE_VERT, fragmentShader: BUBBLE_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(fx._bubbleGeo, this.mat);
    this.mesh.renderOrder = 9;
    fx.scene.add(this.mesh);
    this.t = 0; this.hitIdx = 0; this.state = 'grow'; this.breakT = 0; this.alive = true;
    this.pulse = 0;
  }
  hit(worldPos) {
    const h = this.mat.uniforms.uHits.value[this.hitIdx++ % 4];
    _v.copy(worldPos).sub(this.mesh.position);
    if (_v.lengthSq() < 1e-6) _v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
    _v.normalize();
    h.set(_v.x, _v.y, _v.z, 0);
    this.pulse = 1;
  }
  pop(broken) { this.state = broken ? 'break' : 'fade'; this.breakT = 0; if (broken) this.fx.bubbleBreak(this.mesh.position, this.radius); }
  update(dt) {
    this.t += dt;
    const u = this.mat.uniforms;
    u.uTime.value = this.t;
    for (const h of u.uHits.value) if (h.w <= 1.0) h.w += dt * 1.6;
    this.pulse = Math.max(0, this.pulse - dt * 4);
    u.uPulse.value = this.pulse;
    const tp = this.target.bubbleCenter ? this.target.bubbleCenter(_w) : this.target.root.position;
    this.mesh.position.copy(tp);
    let s = this.radius;
    if (this.state === 'grow') {
      const k = clamp01(this.t / 0.28);
      s *= ease.back(k);
      u.uOpacity.value = k;
      if (k >= 1) this.state = 'hold';
    } else if (this.state === 'hold') {
      u.uOpacity.value = 1;
      s *= 1 + Math.sin(this.t * 4.5) * 0.012;
    } else {
      this.breakT += dt;
      const k = clamp01(this.breakT / (this.state === 'break' ? 0.12 : 0.35));
      u.uOpacity.value = 1 - k;
      s *= this.state === 'break' ? 1 + k * 0.25 : 1 - k * 0.15;
      if (k >= 1) { this.dispose(); return false; }
    }
    this.mesh.scale.setScalar(Math.max(0.01, s));
    return true;
  }
  dispose() { if (!this.alive) return; this.alive = false; this.fx.scene.remove(this.mesh); this.mat.dispose(); }
}

// ---------------- Beam (Eve "Unbound" ult) ----------------
export class Beam {
  constructor(fx, { color = 0xff3fd2, width = 1 } = {}) {
    this.fx = fx; this.width = width;
    this.group = new THREE.Group();
    const cyl = new THREE.CylinderGeometry(1, 1, 1, 32, 1, true);
    cyl.translate(0, 0.5, 0); cyl.rotateX(Math.PI / 2); // along +Z from 0..1
    const mk = (c, i, fres, noise, scroll) => { const m = energyMat({ color: c, intensity: i, fresnel: fres, noise, scroll: new THREE.Vector2(0, scroll) }); return new THREE.Mesh(cyl, m); };
    this.core = mk(0xffffff, 3.2, 0.6, 0.25, -7);
    this.mid = mk(color, 2.1, 1.2, 0.7, -5);
    this.outer = mk(color, 0.7, 2.6, 0.9, -3);
    this.spiral = mk(0xff9cf0, 1.1, 1.0, 1.0, -9);
    this.group.add(this.outer, this.mid, this.core, this.spiral);
    for (const m of [this.core, this.mid, this.outer, this.spiral]) { m.frustumCulled = false; m.renderOrder = 9; }
    fx.scene.add(this.group);
    this.origin = new THREE.Vector3(); this.end = new THREE.Vector3(); this.len = 1;
    this.t = 0; this.power = 0; this.alive = true;
    this.light = null;
  }
  set(origin, end, power) {
    this.origin.copy(origin); this.end.copy(end); this.power = power;
    _v.subVectors(end, origin);
    this.len = Math.max(0.1, _v.length());
    this.group.position.copy(origin);
    _q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), _v.normalize());
    this.group.quaternion.copy(_q);
  }
  update(dt) {
    this.t += dt;
    const p = this.power, w = this.width;
    const wob = 1 + Math.sin(this.t * 40) * 0.06 + Math.sin(this.t * 23) * 0.04;
    this.core.scale.set(0.32 * w * p * wob, 0.32 * w * p * wob, this.len);
    this.mid.scale.set(0.75 * w * p * wob, 0.75 * w * p * wob, this.len);
    this.outer.scale.set(1.45 * w * p, 1.45 * w * p, this.len);
    this.spiral.scale.set(1.05 * w * p, 1.05 * w * p, this.len);
    this.spiral.rotation.z = this.t * 9;
    for (const m of [this.core, this.mid, this.outer, this.spiral]) { m.material.uniforms.uTime.value = this.t; m.material.uniforms.uOpacity.value = clamp01(p * 1.2); }
    return this.alive;
  }
  dispose() { this.alive = false; this.fx.scene.remove(this.group); for (const m of [this.core, this.mid, this.outer, this.spiral]) m.material.dispose(); }
}

// ------------------------------------------------------------------ manager
export class Effects {
  constructor(scene, renderer, camera, quality = 1) {
    this.scene = scene; this.renderer = renderer; this.camRig = camera;
    this.add = new ParticleSystem(scene, { max: Math.round(7000 * quality), additive: true, order: 12 });
    this.alpha = new ParticleSystem(scene, { max: Math.round(3500 * quality), additive: false, order: 11 });
    this.lights = new LightPool(scene, 6);
    this.debris = new Debris(scene, 280);
    this.items = [];
    this.trails = [];
    this.updaters = [];
    this.tex = { crater: craterTexture('crater'), scorch: craterTexture('scorch'), atom: craterTexture('atom') };
    this.comicCache = new Map();
    this.ringGeo = new THREE.RingGeometry(0.0, 1, 64, 1); this.ringGeo.rotateX(-Math.PI / 2);
    this.sphereGeo = new THREE.SphereGeometry(1, 32, 16);
    this.coneGeo = new THREE.CylinderGeometry(1, 0.08, 1, 32, 1, true); this.coneGeo.translate(0, -0.5, 0); this.coneGeo.rotateX(-Math.PI / 2);
    this.decals = [];
    this.timeScaleCb = null;
    this.gore = true;
  }

  cam() { return this.camRig.cam; }

  update(dt) {
    this.add.update(dt);
    this.alpha.update(dt);
    this.lights.update(dt);
    this.debris.update(dt);
    this.items = this.items.filter((it) => { const a = it.update(dt); if (!a) it.dispose(this.scene); return a; });
    const cam = this.cam();
    this.trails = this.trails.filter((t) => { const a = t.update(dt, cam); if (!a) t.dispose(); return a; });
    this.updaters = this.updaters.filter((u) => u(dt) !== false);
    // decals fade
    for (let i = this.decals.length - 1; i >= 0; i--) {
      const d = this.decals[i];
      d.t += dt;
      const fadeStart = d.life - 2;
      if (d.t > fadeStart) d.mesh.material.opacity = d.op * (1 - (d.t - fadeStart) / 2);
      if (d.t > d.life) { this.scene.remove(d.mesh); d.mesh.material.dispose(); this.decals.splice(i, 1); }
    }
  }

  every(fn) { this.updaters.push(fn); }
  trail(opts) { const t = new Trail(this, opts); this.trails.push(t); return t; }

  // ---------- primitives ----------
  ring(pos, { color = 0xffffff, intensity = 1.5, r0 = 0.3, r1 = 6, life = 0.45, soft = 0.4, y = 0.05, normal = null, additive = true } = {}) {
    const m = new THREE.Mesh(this.ringGeo, ringMat(color, intensity, soft, additive));
    m.position.copy(pos); if (y !== null && !normal) m.position.y = Math.max(m.position.y, y);
    if (normal) m.quaternion.setFromUnitVectors(UP, normal);
    m.renderOrder = 7;
    this.scene.add(m);
    this.items.push(new TimedMesh(m, life, (k, dt, t) => {
      const e = ease.out3(k);
      m.scale.setScalar(lerp(r0, r1, e));
      m.material.uniforms.uOpacity.value = (1 - k) * (1 - k);
      m.material.uniforms.uTime.value = t;
    }));
    return m;
  }
  sphere(pos, { color = 0xffffff, intensity = 2, r0 = 0.2, r1 = 3, life = 0.35, fresnel = 2.5, noise = 0.5 } = {}) {
    const m = new THREE.Mesh(this.sphereGeo, energyMat({ color, intensity, fresnel, noise, rimOnly: false }));
    m.position.copy(pos); m.renderOrder = 7;
    this.scene.add(m);
    this.items.push(new TimedMesh(m, life, (k, dt, t) => {
      m.scale.setScalar(lerp(r0, r1, ease.out3(k)));
      m.material.uniforms.uOpacity.value = (1 - k) * (1 - k);
      m.material.uniforms.uTime.value = t;
    }));
    return m;
  }
  /** vapor cone for sonic booms; dir = travel direction */
  sonicCone(pos, dir, { scale = 1, life = 0.55, color = 0xffffff } = {}) {
    const m = new THREE.Mesh(this.coneGeo, energyMat({ color, intensity: 1.1, fresnel: 1.4, noise: 0.9, scroll: new THREE.Vector2(0, -6), side: THREE.DoubleSide, edgeFade: true }));
    m.position.copy(pos);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), _v.copy(dir).normalize());
    m.renderOrder = 7;
    this.scene.add(m);
    this.items.push(new TimedMesh(m, life, (k, dt, t) => {
      const e = ease.out3(k);
      m.scale.set((1.2 + e * 2.2) * scale, (1.2 + e * 2.2) * scale, (2.2 + e * 2.5) * scale);
      m.material.uniforms.uOpacity.value = (1 - k) * 0.9;
      m.material.uniforms.uTime.value = t;
    }));
  }
  decal(pos, size, kind = 'crater', life = 14, opacity = 0.9, rot = Math.random() * TAU) {
    const mat = new THREE.MeshBasicMaterial({ map: this.tex[kind], transparent: true, depthWrite: false, opacity, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    if (kind === 'atom') { mat.blending = THREE.AdditiveBlending; mat.color.setRGB(1.5, 0.45, 1.3); }
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), mat);
    m.position.set(pos.x, 0.03 + this.decals.length * 0.0005, pos.z);
    m.rotation.y = rot;
    m.renderOrder = 2;
    this.scene.add(m);
    this.decals.push({ mesh: m, t: 0, life, op: opacity });
    if (this.decals.length > 40) { const d = this.decals.shift(); this.scene.remove(d.mesh); d.mesh.material.dispose(); }
    return m;
  }
  comic(pos, text = 'WHAM!', { fill = '#ff2d2d', stroke = '#fff', size = 2.4, life = 0.7 } = {}) {
    const key = text + fill;
    let tex = this.comicCache.get(key);
    if (!tex) { tex = comicTexture(text, fill, stroke); this.comicCache.set(key, tex); }
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false });
    const s = new THREE.Sprite(mat);
    s.position.copy(pos);
    s.renderOrder = 30;
    this.scene.add(s);
    const rot = rand(-0.25, 0.25);
    this.items.push(new TimedMesh(s, life, (k) => {
      const pop = k < 0.15 ? ease.back(k / 0.15) : 1 + (k - 0.15) * 0.15;
      s.scale.set(size * pop, size * 0.5 * pop, 1);
      mat.rotation = rot;
      mat.opacity = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      s.position.y += 0.004;
    }));
  }

  // ---------- particle presets ----------
  sparks(pos, dir, { n = 14, color = [3, 2.6, 2, 1], speed = 14, spread = 0.7, life = 0.35, size = 0.06, grav = 9 } = {}) {
    for (let i = 0; i < n; i++) {
      _v.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(spread);
      if (dir) _v.add(dir);
      _v.normalize().multiplyScalar(speed * rand(0.4, 1.1));
      this.add.spawn({ p: pos, v: _v, life: life * rand(0.6, 1.2), size, size1: size * 0.5, color, color1: [color[0], color[1] * 0.5, color[2] * 0.3, 0], shape: SHAPE.SPARK, drag: 2.5, grav });
    }
  }
  glow(pos, { color = [3, 3, 3, 1], size = 1.5, life = 0.15, size1 } = {}) {
    this.add.spawn({ p: pos, life, size, size1: size1 ?? size * 1.6, color, color1: [color[0], color[1], color[2], 0], shape: SHAPE.GLOW, curve: 0.6 });
  }
  star(pos, { color = [4, 4, 4, 1], size = 1.6, life = 0.12 } = {}) {
    this.add.spawn({ p: pos, life, size: size * 0.6, size1: size * 1.4, color, color1: [color[0], color[1], color[2], 0], shape: SHAPE.STAR, rot: rand(0, 6) });
  }
  smoke(pos, { n = 10, color = [0.58, 0.56, 0.54, 0.34], size = 1.2, size1 = 3.2, speed = 3, life = 1.1, up = 0.6, spread = 1, grav = -0.4, drag = 1.6 } = {}) {
    for (let i = 0; i < n; i++) {
      _v.set(rand(-1, 1), rand(0, up), rand(-1, 1)).normalize().multiplyScalar(speed * rand(0.3, 1));
      _w.set(rand(-1, 1), rand(-0.2, 0.4), rand(-1, 1)).multiplyScalar(spread * 0.3).add(pos);
      this.alpha.spawn({ p: _w, v: _v, life: life * rand(0.7, 1.3), size: size * rand(0.7, 1.2), size1: size1 * rand(0.8, 1.2), color, color1: [color[0] * 1.1, color[1] * 1.1, color[2] * 1.1, 0], shape: SHAPE.SMOKE, drag, grav, rotV: rand(-1, 1), curve: 0.8, fadeIn: 0.05 });
    }
  }
  dustRing(pos, { n = 28, radius = 1, speed = 12, size = 1.4, size1 = 3.6, color = [0.62, 0.6, 0.56, 0.4], life = 1.0 } = {}) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rand(-0.1, 0.1);
      _v.set(Math.cos(a), 0.08, Math.sin(a));
      _w.copy(pos).addScaledVector(_v, radius); _w.y = 0.3;
      this.alpha.spawn({ p: _w, v: _v.clone().multiplyScalar(speed * rand(0.6, 1.1)).setY(rand(0.5, 2)), life: life * rand(0.7, 1.2), size, size1, color, color1: [color[0], color[1], color[2], 0], shape: SHAPE.SMOKE, drag: 3.2, grav: -0.3, rotV: rand(-1, 1), curve: 0.7, fadeIn: 0.04 });
    }
  }
  blood(pos, dir, { n = 10, speed = 7 } = {}) {
    if (!this.gore) return;
    for (let i = 0; i < n; i++) {
      _v.set(rand(-1, 1), rand(-0.3, 1), rand(-1, 1)).normalize().multiplyScalar(0.6).add(dir || UP).normalize().multiplyScalar(speed * rand(0.3, 1.1));
      this.alpha.spawn({ p: pos, v: _v, life: rand(0.35, 0.7), size: rand(0.05, 0.12), size1: 0.03, color: [0.55, 0.0, 0.02, 0.95], color1: [0.3, 0, 0.01, 0], shape: SHAPE.DOT, drag: 1.2, grav: 18, floor: true });
    }
  }
  rocks(pos, { n = 10, speed = 9, size = 0.25, up = 1.2, spread = 1, color = 0x9a958e, dir = null } = {}) {
    for (let i = 0; i < n; i++) {
      _v.set(rand(-1, 1) * spread, rand(0.4, 1) * up, rand(-1, 1) * spread);
      if (dir) _v.addScaledVector(dir, 0.8);
      _v.normalize().multiplyScalar(speed * rand(0.4, 1.1));
      this.debris.spawn(_w.copy(pos).add(new THREE.Vector3(rand(-0.4, 0.4), 0.2, rand(-0.4, 0.4))), _v, size * rand(0.5, 1.4), color, rand(2.5, 4.5));
    }
  }
  converge(center, { n = 16, radius = 2.5, color = [3, 1, 2.6, 1], life = 0.5, size = 0.12 } = {}) {
    for (let i = 0; i < n; i++) {
      _v.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(radius * rand(0.6, 1));
      _w.copy(center).add(_v);
      this.add.spawn({ p: _w, v: _v.multiplyScalar(-1 / life), life, size, size1: size * 2, color: [color[0], color[1], color[2], 0], color1: color, shape: SHAPE.SPARK, curve: 1 });
    }
  }

  // ---------- composite effects ----------
  punchImpact(pos, dir, { power = 1, color = 0xffffff, gore = true } = {}) {
    const c = new THREE.Color(color);
    // kept compact: the struck hero has to stay readable through the impact frames
    this.star(pos, { color: [2.0 * c.r, 1.9 * c.g, 1.75 * c.b, 1], size: 0.6 * power, life: 0.075 });
    this.glow(pos, { color: [1.3, 1.2, 1.1, 0.5], size: 0.42 * power, life: 0.12 });
    this.sparks(pos, dir, { n: Math.round(10 * power), speed: 11 * power, spread: 0.9, life: 0.26, color: [3.0, 2.5, 1.8, 1], size: 0.05 });
    this.ring(pos, { color: 0xffffff, intensity: 1.1, r0: 0.15, r1: 1.3 * power, life: 0.2, normal: _u.copy(dir).normalize(), soft: 0.6 });
    if (gore) this.blood(pos, dir, { n: Math.round(6 * power), speed: 6 + power * 3 });
    // light from just in front of the impact (the fist side): at the contact point itself the
    // inverse-square falloff would blow out the struck hero's chest
    this.lights.flash(_w.copy(pos).addScaledVector(_u.copy(dir).normalize(), -0.7), 0xfff0d0, 5 * power, 4.5, 0.09);
    if (power > 1.2) this.renderer.addWave(pos, { strength: 0.025 * power, life: 0.35, speed: 1.2, width: 0.05 });
  }
  groundSlam(pos, { power = 1, color = 0xffffff, crater = true, dust = true } = {}) {
    const p = _v.copy(pos); p.y = 0.05;
    this.ring(p, { color: 0xffffff, intensity: 1.35, r0: 0.5, r1: 7 * power, life: 0.5, soft: 0.25 });
    this.ring(p, { color: 0xffe2b0, intensity: 0.7, r0: 0.3, r1: 11 * power, life: 0.8, soft: 0.5 });
    this.sphere(_w.copy(p).setY(0.4), { color, intensity: 0.75, r0: 0.5, r1: 4.5 * power, life: 0.26, fresnel: 2.2 });
    this.glow(_w.copy(p).setY(0.8), { color: [1.8, 1.6, 1.4, 1], size: 2.2 * power, life: 0.15 });
    if (dust) { this.dustRing(p, { n: Math.round(26 * power), radius: 0.8, speed: 15 * power, size: 1.4 * power, size1: 4 * power }); this.smoke(_w.copy(p).setY(0.6), { n: Math.round(8 * power), size: 1.6 * power, size1: 4.5 * power, speed: 4 }); }
    this.rocks(p, { n: Math.round(12 * power), speed: 10 * power, size: 0.22 * power });
    this.sparks(_w.copy(p).setY(0.3), UP, { n: Math.round(18 * power), speed: 16 * power, spread: 1.2, life: 0.5 });
    if (crater) this.decal(p, 5.5 * power, 'crater', 16, 0.95);
    this.lights.flash(_w.copy(p).setY(1.8), 0xfff0dd, 24 * power, 14 * power, 0.3);
    this.renderer.addWave(p, { strength: 0.05 * power, life: 0.55, speed: 1.6, width: 0.07 });
  }
  sonicBoom(pos, dir, { scale = 1 } = {}) {
    this.sonicCone(pos, dir, { scale });
    this.ring(pos, { color: 0xffffff, intensity: 1.5, r0: 0.5, r1: 7 * scale, life: 0.4, normal: dir, soft: 0.25 });
    this.ring(pos, { color: 0xcfe8ff, intensity: 0.75, r0: 1, r1: 12 * scale, life: 0.7, normal: dir, soft: 0.45 });
    this.glow(pos, { color: [2.4, 2.4, 2.7, 1], size: 2.4 * scale, life: 0.14 });
    for (let i = 0; i < 24; i++) {
      _v.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize();
      _v.addScaledVector(dir, -_v.dot(dir)).normalize().multiplyScalar(rand(6, 14) * scale);
      this.alpha.spawn({ p: pos, v: _v, life: rand(0.4, 0.9), size: 0.6 * scale, size1: 2.2 * scale, color: [0.92, 0.95, 1, 0.45], color1: [1, 1, 1, 0], shape: SHAPE.SMOKE, drag: 4 });
    }
    this.lights.flash(pos, 0xddeeff, 22 * scale, 12, 0.2);
    this.renderer.addWave(pos, { strength: 0.06 * scale, life: 0.6, speed: 1.8, width: 0.08 });
  }
  energyBurst(pos, { color = [3, 0.8, 2.6, 1], size = 1, n = 14, light = 0xff55dd } = {}) {
    this.glow(pos, { color: [color[0] * 1.3, color[1] * 1.3, color[2] * 1.3, 1], size: 1.2 * size, life: 0.18 });
    this.star(pos, { color: [color[0] * 1.5, color[1] * 1.5, color[2] * 1.5, 1], size: 1.0 * size, life: 0.1 });
    for (let i = 0; i < n; i++) {
      _v.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(rand(3, 9) * size);
      this.add.spawn({ p: pos, v: _v, life: rand(0.25, 0.5), size: 0.07 * size, size1: 0.02, color, color1: [color[0], color[1] * 0.5, color[2], 0], shape: SHAPE.SPARK, drag: 3, grav: 2 });
    }
    this.ring(pos, { color: new THREE.Color(color[0] / 3, color[1] / 3, color[2] / 3), intensity: 2, r0: 0.1, r1: 1.4 * size, life: 0.25, normal: _u.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize(), soft: 0.5 });
    this.lights.flash(pos, light, 18 * size, 6, 0.15);
  }
  bubbleBreak(pos, radius) {
    for (let i = 0; i < 40; i++) {
      _v.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize();
      _w.copy(pos).addScaledVector(_v, radius);
      this.add.spawn({ p: _w, v: _v.multiplyScalar(rand(3, 8)), life: rand(0.4, 0.8), size: rand(0.12, 0.25), size1: 0.05, color: [3.5, 1.2, 3.0, 1], color1: [2, 0.4, 2, 0], shape: SHAPE.SHARD, rotV: rand(-12, 12), grav: 6, drag: 1 });
    }
    this.glow(pos, { color: [3, 1, 2.8, 0.8], size: radius * 2.5, life: 0.2 });
    this.lights.flash(pos, 0xff55dd, 25, 8, 0.2);
  }
  healBurst(pos, { color = [1.2, 3.2, 1.8, 1] } = {}) {
    for (let i = 0; i < 10; i++) {
      _v.set(rand(-0.5, 0.5), rand(0.2, 1.8), rand(-0.5, 0.5));
      this.add.spawn({ p: _w.copy(pos).add(_v), v: [0, rand(0.8, 2), 0], life: rand(0.5, 0.9), size: rand(0.08, 0.16), size1: 0.02, color, color1: [color[0], color[1], color[2], 0], shape: SHAPE.STAR, rotV: 2 });
    }
  }
  /** column of light (revive / spawn) */
  pillar(pos, { color = 0xff6be0, height = 14, radius = 1.2, life = 1.6, intensity = 2.2 } = {}) {
    const geo = new THREE.CylinderGeometry(1, 1, 1, 32, 1, true); geo.translate(0, 0.5, 0);
    const m = new THREE.Mesh(geo, energyMat({ color, intensity, fresnel: 1.2, noise: 0.8, scroll: new THREE.Vector2(0, -2), edgeFade: true }));
    m.position.set(pos.x, 0, pos.z); m.renderOrder = 7;
    this.scene.add(m);
    this.items.push(new TimedMesh(m, life, (k, dt, t) => {
      const grow = ease.out3(clamp01(k * 4));
      m.scale.set(radius * (1 - k * 0.6), height * grow, radius * (1 - k * 0.6));
      m.material.uniforms.uOpacity.value = Math.sin(Math.PI * Math.min(1, k * 1.1));
      m.material.uniforms.uTime.value = t;
    }));
    return m;
  }
  shake(t) { this.camRig.addTrauma(t); }
}
