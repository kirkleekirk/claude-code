import * as THREE from 'three';

export const SHAPE = { GLOW: 0, DOT: 1, RING: 2, SPARK: 3, SMOKE: 4, STAR: 5, SHARD: 6, CHUNK: 7, FLARE: 8 };

const VERT = /* glsl */`
  attribute vec3 iPos;
  attribute vec4 iColor;
  attribute vec4 iMisc; // size, rot, shape, seed
  attribute vec3 iVel;  // stretch velocity (world)
  varying vec4 vColor;
  varying vec2 vUv;
  varying float vShape;
  varying float vSeed;
  uniform float uStretch;
  void main() {
    vUv = position.xy + 0.5;
    vColor = iColor;
    vShape = iMisc.z;
    vSeed = iMisc.w;
    float size = iMisc.x;
    vec4 mv = viewMatrix * vec4(iPos, 1.0);
    vec2 corner = position.xy * size;
    // velocity stretch (sparks)
    vec3 vv = (viewMatrix * vec4(iVel, 0.0)).xyz;
    float sp = length(vv.xy);
    if (sp > 0.001 && (vShape == 3.0 || vShape == 8.0)) {
      vec2 dir = vv.xy / sp;
      vec2 perp = vec2(-dir.y, dir.x);
      float len = size + sp * uStretch;
      corner = dir * position.x * len + perp * position.y * size * 0.35;
    } else {
      float c = cos(iMisc.y), s = sin(iMisc.y);
      corner = mat2(c, -s, s, c) * corner;
    }
    mv.xy += corner;
    // soft fade into ground for smoke
    if (vShape == 4.0) vColor.a *= smoothstep(0.0, size * 0.45, iPos.y + size * 0.1);
    // fade particles that get in the camera's face so effects never fog the screen
    float dz = -mv.z;
    vColor.a *= smoothstep(0.35, 0.35 + max(1.5, size * 1.6), dz);
    gl_Position = projectionMatrix * mv;
  }
`;
const FRAG = /* glsl */`
  precision highp float;
  varying vec4 vColor;
  varying vec2 vUv;
  varying float vShape;
  varying float vSeed;
  float h21(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
  float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float a = 0.0;
    int s = int(vShape + 0.5);
    if (s == 0) { a = exp(-r * r * 4.0) * (1.0 - smoothstep(0.85, 1.0, r)); }
    else if (s == 1) { a = 1.0 - smoothstep(0.55, 1.0, r); }
    else if (s == 2) { a = smoothstep(0.62, 0.8, r) * (1.0 - smoothstep(0.86, 1.0, r)); }
    else if (s == 3) { a = exp(-(p.x * p.x * 1.5 + p.y * p.y * 9.0)) * (1.0 - smoothstep(0.9, 1.0, abs(p.x))); }
    else if (s == 4) {
      float n = vn(p * 2.2 + vSeed * 13.0) * 0.6 + vn(p * 4.7 - vSeed * 7.0) * 0.4;
      a = (1.0 - smoothstep(0.3, 1.0, r)) * (0.55 + 0.6 * n);
      a = clamp(a, 0.0, 1.0);
    }
    else if (s == 5) {
      float ang = atan(p.y, p.x);
      float k = abs(cos(ang * 2.0 + vSeed * 6.28));
      float star = 1.0 - smoothstep(0.0, 0.2 + 0.8 * pow(k, 12.0), r);
      a = max(star, exp(-r * r * 9.0));
    }
    else if (s == 6) {
      // triangular shard
      vec2 q = p; q.y += 0.3;
      float tri = step(abs(q.x) * 1.6 + q.y * 0.9, 0.9) * step(-0.75, q.y);
      a = tri;
    }
    else if (s == 7) {
      float ang = atan(p.y, p.x);
      float rr = 0.75 + 0.2 * vn(vec2(ang * 1.7, vSeed * 9.0));
      a = 1.0 - smoothstep(rr - 0.06, rr, r);
    }
    else if (s == 8) {
      a = exp(-(p.x * p.x * 0.8 + p.y * p.y * 14.0));
      a += exp(-r * r * 10.0) * 0.6;
    }
    float alpha = a * vColor.a;
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(vColor.rgb * alpha, alpha);
  }
`;

export class ParticleSystem {
  constructor(scene, { max = 4000, additive = true, stretch = 0.045, order = 10 } = {}) {
    this.max = max;
    this.n = 0;
    const quad = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = quad.index;
    g.setAttribute('position', quad.getAttribute('position'));
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aMisc = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aVel = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iPos', this.aPos); g.setAttribute('iColor', this.aCol); g.setAttribute('iMisc', this.aMisc); g.setAttribute('iVel', this.aVel);
    g.instanceCount = 0;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: { uStretch: { value: stretch } },
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.CustomBlending,
    });
    if (!additive) {
      // premultiplied alpha "over"
      this.mat.blendSrc = THREE.OneFactor; this.mat.blendDst = THREE.OneMinusSrcAlphaFactor;
      this.mat.blendEquation = THREE.AddEquation;
    } else {
      this.mat.blending = THREE.CustomBlending;
      this.mat.blendSrc = THREE.OneFactor; this.mat.blendDst = THREE.OneFactor;
    }
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = order;
    scene.add(this.mesh);
    this.geo = g;
    // CPU state
    const F = (k) => new Float32Array(max * k);
    this.p = F(3); this.v = F(3); this.c0 = F(4); this.c1 = F(4);
    this.life = F(1); this.age = F(1); this.s0 = F(1); this.s1 = F(1);
    this.rot = F(1); this.rotV = F(1); this.drag = F(1); this.grav = F(1); this.shape = F(1); this.seed = F(1);
    this.floor = F(1); this.fadeIn = F(1); this.curve = F(1);
    this.scale = 1;
  }

  /**
   * o: { p:[x,y,z]|Vector3, v, life, size, size1, color:[r,g,b,a], color1, drag, grav, shape, rot, rotV, floor, fadeIn, curve }
   */
  spawn(o) {
    if (this.n >= this.max) return -1;
    const i = this.n++;
    const i3 = i * 3, i4 = i * 4;
    const P = o.p, Vv = o.v;
    this.p[i3] = P.x ?? P[0]; this.p[i3 + 1] = P.y ?? P[1]; this.p[i3 + 2] = P.z ?? P[2];
    if (Vv) { this.v[i3] = Vv.x ?? Vv[0]; this.v[i3 + 1] = Vv.y ?? Vv[1]; this.v[i3 + 2] = Vv.z ?? Vv[2]; }
    else { this.v[i3] = this.v[i3 + 1] = this.v[i3 + 2] = 0; }
    const c = o.color || [1, 1, 1, 1], c1 = o.color1 || [c[0], c[1], c[2], 0];
    for (let k = 0; k < 4; k++) { this.c0[i4 + k] = c[k] ?? 1; this.c1[i4 + k] = c1[k] ?? 0; }
    this.life[i] = o.life || 1; this.age[i] = 0;
    this.s0[i] = o.size ?? 0.3; this.s1[i] = o.size1 ?? this.s0[i];
    this.rot[i] = o.rot ?? Math.random() * 6.283; this.rotV[i] = o.rotV ?? 0;
    this.drag[i] = o.drag ?? 0; this.grav[i] = o.grav ?? 0;
    this.shape[i] = o.shape ?? 0; this.seed[i] = Math.random();
    this.floor[i] = o.floor ? 1 : 0;
    this.fadeIn[i] = o.fadeIn ?? 0;
    this.curve[i] = o.curve ?? 1;
    return i;
  }

  update(dt) {
    const n0 = this.n;
    let n = n0;
    const p = this.p, v = this.v;
    for (let i = 0; i < n; i++) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) {
        // swap remove
        n--;
        if (i !== n) this.copy(n, i);
        i--;
        continue;
      }
      const i3 = i * 3;
      const dr = Math.max(0, 1 - this.drag[i] * dt);
      v[i3] *= dr; v[i3 + 1] = v[i3 + 1] * dr - this.grav[i] * dt; v[i3 + 2] *= dr;
      p[i3] += v[i3] * dt; p[i3 + 1] += v[i3 + 1] * dt; p[i3 + 2] += v[i3 + 2] * dt;
      if (this.floor[i] && p[i3 + 1] < 0.02) { p[i3 + 1] = 0.02; v[i3 + 1] = -v[i3 + 1] * 0.35; v[i3] *= 0.7; v[i3 + 2] *= 0.7; }
      this.rot[i] += this.rotV[i] * dt;
    }
    this.n = n;
    // write GPU attributes
    const ap = this.aPos.array, ac = this.aCol.array, am = this.aMisc.array, av = this.aVel.array;
    for (let i = 0; i < n; i++) {
      const i3 = i * 3, i4 = i * 4;
      const t = this.age[i] / this.life[i];
      const tc = Math.pow(t, this.curve[i]);
      ap[i3] = p[i3]; ap[i3 + 1] = p[i3 + 1]; ap[i3 + 2] = p[i3 + 2];
      av[i3] = v[i3]; av[i3 + 1] = v[i3 + 1]; av[i3 + 2] = v[i3 + 2];
      const fi = this.fadeIn[i] > 0 ? Math.min(1, this.age[i] / this.fadeIn[i]) : 1;
      for (let k = 0; k < 4; k++) ac[i4 + k] = this.c0[i4 + k] + (this.c1[i4 + k] - this.c0[i4 + k]) * tc;
      ac[i4 + 3] *= fi;
      am[i4] = (this.s0[i] + (this.s1[i] - this.s0[i]) * t) * this.scale;
      am[i4 + 1] = this.rot[i]; am[i4 + 2] = this.shape[i]; am[i4 + 3] = this.seed[i];
    }
    this.geo.instanceCount = n;
    if (n > 0) {
      for (const a of [this.aPos, this.aCol, this.aMisc, this.aVel]) {
        a.clearUpdateRanges(); a.addUpdateRange(0, n * a.itemSize); a.needsUpdate = true;
      }
    }
  }

  copy(from, to) {
    const f3 = from * 3, t3 = to * 3, f4 = from * 4, t4 = to * 4;
    for (let k = 0; k < 3; k++) { this.p[t3 + k] = this.p[f3 + k]; this.v[t3 + k] = this.v[f3 + k]; }
    for (let k = 0; k < 4; k++) { this.c0[t4 + k] = this.c0[f4 + k]; this.c1[t4 + k] = this.c1[f4 + k]; }
    this.life[to] = this.life[from]; this.age[to] = this.age[from];
    this.s0[to] = this.s0[from]; this.s1[to] = this.s1[from];
    this.rot[to] = this.rot[from]; this.rotV[to] = this.rotV[from];
    this.drag[to] = this.drag[from]; this.grav[to] = this.grav[from];
    this.shape[to] = this.shape[from]; this.seed[to] = this.seed[from];
    this.floor[to] = this.floor[from]; this.fadeIn[to] = this.fadeIn[from]; this.curve[to] = this.curve[from];
  }
  clear() { this.n = 0; this.geo.instanceCount = 0; }
}
