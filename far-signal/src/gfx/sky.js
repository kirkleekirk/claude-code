import * as THREE from 'three';
import { COMMON } from './shaderlib.js';
import { G, commonUniforms } from './globals.js';

const SKY_VERT = /* glsl */`
varying vec3 vDir;
void main(){
  vDir = position;
  vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
  gl_Position = p.xyww;
}`;

const SKY_FRAG = /* glsl */`
${COMMON}
uniform vec3 uPlanetDir; uniform float uPlanetRad; uniform vec3 uPlanetAxis;
uniform vec3 uPlanetA; uniform vec3 uPlanetB; uniform vec3 uPlanetC; uniform vec3 uPlanetRim;
uniform vec3 uRingCol; uniform float uRingOn;
uniform vec3 uMoonDir[2]; uniform float uMoonRad[2]; uniform vec3 uMoonA[2]; uniform vec3 uMoonB[2]; uniform float uMoonKind[2];
uniform float uStarVis; uniform float uNebVis; uniform float uPlanetVis; uniform float uAurora;
uniform float uCloud; uniform vec3 uCloudLit; uniform vec3 uCloudDark;
uniform vec3 uNebA; uniform vec3 uNebB; uniform vec3 uGalN; uniform vec3 uGalX;
uniform vec3 uSunDisc; uniform float uSunCos; uniform float uBeam; uniform vec3 uBeamDir;
varying vec3 vDir;

float hash13(vec3 p3){ p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }

vec4 triNoise(vec3 d, float s){
  vec3 w = abs(d); w = w * w; w /= (w.x + w.y + w.z);
  return texture2D(uNoise, d.yz * s) * w.x + texture2D(uNoise, d.zx * s + 0.37) * w.y + texture2D(uNoise, d.xy * s + 0.71) * w.z;
}

vec3 stars(vec3 d, float dens){
  vec3 col = vec3(0.0);
  for (int i = 0; i < 2; i++){
    float sc = i == 0 ? 150.0 : 290.0;
    vec3 p = d * sc + float(i) * 7.3;
    vec3 ip = floor(p); vec3 fp = fract(p) - 0.5;
    float h = hash13(ip);
    float thr = 0.962 - dens * 0.06;
    if (h > thr){
      float b = (h - thr) / (1.0 - thr);
      float r = 0.10 + 0.22 * b;
      float s = smoothstep(r, 0.0, length(fp));
      float tw = 0.75 + 0.25 * sin(uTime * (2.0 + b * 5.0) + h * 400.0);
      vec3 tint = mix(vec3(0.72, 0.84, 1.0), vec3(1.0, 0.82, 0.66), fract(h * 71.0));
      col += tint * s * s * (0.35 + 3.2 * b * b) * tw;
    }
  }
  return col;
}

vec3 nebula(vec3 d, out float band){
  float lat = dot(d, uGalN);
  band = exp(-lat * lat * 7.5);
  vec4 n1 = triNoise(d, 0.55);
  vec4 n2 = triNoise(d, 1.9);
  float cloud = n1.r * 0.65 + n2.g * 0.35;
  float dust = smoothstep(0.42, 0.74, n2.r * 0.6 + n1.g * 0.4);
  float core = exp(-max(1.0 - dot(d, uGalX), 0.0) * 5.0);
  float dens = band * smoothstep(0.22, 0.8, cloud + band * 0.38);
  vec3 col = mix(uNebA, uNebB, smoothstep(0.32, 0.68, n1.g)) * dens * 0.6;
  col += vec3(1.0, 0.84, 0.72) * core * band * 0.55;
  col *= 1.0 - dust * 0.7 * band;
  col += uNebB * 0.05 * smoothstep(0.55, 0.92, n1.r) * (1.0 - band);
  return col;
}

float ringProfile(float rr){
  float n = texture2D(uNoise, vec2(rr * 1.9, 0.37)).g;
  float n2 = texture2D(uNoise, vec2(rr * 7.0, 0.61)).r;
  float d = 0.35 + 0.65 * smoothstep(0.25, 0.75, n * 0.7 + n2 * 0.3);
  d *= smoothstep(1.22, 1.3, rr) * (1.0 - smoothstep(2.3, 2.42, rr));
  d *= 1.0 - 0.85 * smoothstep(0.03, 0.0, abs(rr - 1.86));
  d *= 1.0 - 0.6 * smoothstep(0.015, 0.0, abs(rr - 1.52));
  return d;
}

// Ringed gas giant: analytic sphere + ring-plane intersection in direction space.
vec4 giant(vec3 d){
  vec3 C = uPlanetDir; float R = uPlanetRad; vec3 A = uPlanetAxis; vec3 L = uSkySun;
  float b = dot(d, C);
  float disc = b * b - (1.0 - R * R);
  vec3 col = vec3(0.0); float a = 0.0; float tS = 1e9;
  if (disc > 0.0 && b > 0.0){
    float sq = sqrt(disc);
    tS = b - sq;
    vec3 n = (d * tS - C) / R;
    a = smoothstep(0.0, sqrt(R * 0.004), sq);
    vec3 bx = normalize(cross(A, C));
    vec3 bz = cross(A, bx);
    float lat = dot(n, A);
    float lon = atan(dot(n, bx), dot(n, bz));
    float turb = texture2D(uNoise, vec2(lon * 0.33 + uTime * 0.0012, lat * 2.1)).r;
    float turb2 = texture2D(uNoise, vec2(lon * 1.05 - uTime * 0.0017, lat * 6.0)).g;
    float y = lat * 8.5 + (turb - 0.5) * 1.7 + (turb2 - 0.5) * 0.7;
    float bn = sin(y * 3.14159) * 0.5 + 0.5;
    float bn2 = sin(y * 7.3 + 1.3) * 0.5 + 0.5;
    vec3 base = mix(uPlanetA, uPlanetB, bn);
    base = mix(base, uPlanetC, bn2 * 0.32 + smoothstep(0.6, 0.9, turb2) * 0.3);
    float ndl = dot(n, L);
    float lit = smoothstep(-0.14, 0.4, ndl);
    float mu = max(dot(n, -d), 0.0);
    vec3 pc = base * lit * (0.3 + 0.7 * sqrt(mu));
    pc += uPlanetRim * pow(1.0 - mu, 3.0) * smoothstep(-0.35, 0.3, ndl) * 0.9;
    float dn = dot(L, A);
    if (uRingOn > 0.5 && abs(dn) > 1e-3){
      float s = -R * dot(n, A) / dn;
      if (s > 0.0){
        float rr = length(n * R + L * s) / R;
        if (rr > 1.2 && rr < 2.45) pc *= 1.0 - 0.7 * ringProfile(rr);
      }
    }
    pc += base * 0.012;
    col = pc;
  }
  float dA = dot(d, A);
  if (uRingOn > 0.5 && abs(dA) > 1e-4){
    float tr = dot(C, A) / dA;
    if (tr > 0.0){
      vec3 Pr = d * tr - C;
      float rr = length(Pr) / R;
      if (rr > 1.2 && rr < 2.45){
        float dens = ringProfile(rr);
        float bb = dot(Pr, L); float cc = dot(Pr, Pr) - R * R;
        float sh = (bb < 0.0) ? smoothstep(-0.002, 0.004, cc - bb * bb) : 1.0;
        float sameSide = step(0.0, dot(L, A) * dot(-C, A));
        vec3 rc = uRingCol * (0.06 + 0.94 * sh) * mix(0.3, 1.0, sameSide);
        rc *= 0.8 + 0.4 * texture2D(uNoise, vec2(rr * 13.0, 0.2)).r;
        float ra = dens * 0.92;
        if (tr < tS){ col = mix(col, rc, ra); a = a + ra * (1.0 - a); }
        else { col = mix(rc, col, a); a = a + ra * (1.0 - a); }
      }
    }
  }
  return vec4(col, a);
}

vec4 moon(vec3 d, vec3 C, float R, vec3 cA, vec3 cB, float kind){
  float b = dot(d, C);
  float disc = b * b - (1.0 - R * R);
  if (disc <= 0.0 || b <= 0.0) return vec4(0.0);
  float sq = sqrt(disc);
  vec3 n = (d * (b - sq) - C) / R;
  float a = smoothstep(0.0, sqrt(R * 0.004), sq);
  vec4 t1 = triNoise(n, 0.8); vec4 t2 = triNoise(n, 2.9);
  vec3 base = mix(cA, cB, smoothstep(0.36, 0.66, t1.r * 0.7 + t2.g * 0.3));
  float ndl = dot(n, uSkySun);
  float mu = max(dot(n, -d), 0.0);
  vec3 col;
  if (kind < 0.5){
    base *= 0.72 + 0.5 * smoothstep(0.08, 0.5, t2.b);
    base *= 0.85 + 0.3 * t2.a;
    col = base * smoothstep(-0.04, 0.22, ndl) * (0.35 + 0.65 * max(ndl, 0.0)) * (0.6 + 0.4 * sqrt(mu));
  } else {
    float cl = smoothstep(0.5, 0.78, t2.r * 0.6 + t1.g * 0.5);
    base = mix(base, vec3(0.95, 0.96, 1.0), cl * 0.85);
    float lit = smoothstep(-0.12, 0.35, ndl);
    col = base * lit * (0.4 + 0.6 * sqrt(mu));
    col += vec3(0.35, 0.7, 1.0) * pow(1.0 - mu, 3.0) * smoothstep(-0.3, 0.3, ndl) * 0.8;
  }
  col += base * 0.01;
  return vec4(col, a);
}

vec3 aurora(vec3 d){
  if (d.y < 0.04) return vec3(0.0);
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 7; i++){
    float fi = float(i);
    float h = 0.9 + fi * 0.085;
    vec2 p = d.xz * (h / (d.y + 0.08));
    float n = texture2D(uNoise, p * 0.043 + vec2(uTime * 0.004, fi * 0.013)).r;
    float n2 = texture2D(uNoise, p * 0.011 - vec2(uTime * 0.0017, 0.0)).g;
    float curtain = pow(max(1.0 - abs(n * 2.0 - 1.0) * 2.6, 0.0), 3.0) * smoothstep(0.4, 0.62, n2);
    vec3 c = mix(vec3(0.08, 1.0, 0.55), vec3(0.5, 0.22, 1.0), fi / 6.0);
    acc += c * curtain * (1.0 - fi / 9.0);
  }
  float fade = smoothstep(0.04, 0.3, d.y) * smoothstep(1.0, 0.55, d.y);
  return acc * 0.2 * fade;
}

vec4 clouds(vec3 d){
  if (d.y < 0.01 || uCloud < 0.01) return vec4(0.0);
  vec2 p = d.xz / (d.y + 0.12);
  vec2 q = p * 0.16 + uTime * vec2(0.0016, 0.0007);
  float w = texture2D(uNoise, q * 0.31 + 0.2).g;
  vec2 qs = vec2(q.x * 0.5 + q.y * 0.22, q.y * 1.15 - q.x * 0.1) + (w - 0.5) * 0.3;
  float n = texture2D(uNoise, qs).r * 0.56 + texture2D(uNoise, qs * 3.1 + 0.3).g * 0.28 + texture2D(uNoise, qs * 9.3 + 0.7).r * 0.16;
  float cov = smoothstep(1.0 - uCloud, 1.0 - uCloud + 0.34, n);
  vec2 sdir = normalize(uSkySun.xz + 1e-4) * 0.02;
  vec2 q2 = qs + sdir;
  float n2 = texture2D(uNoise, q2).r * 0.56 + texture2D(uNoise, q2 * 3.1 + 0.3).g * 0.28 + 0.08;
  float lit = clamp((n - n2) * 4.5 + 0.5, 0.0, 1.0);
  float sunward = pow(max(dot(d, uSkySun), 0.0), 4.0);
  vec3 c = mix(uCloudDark, uCloudLit, lit) + uSunGlow * sunward * 0.35;
  float fade = smoothstep(0.01, 0.2, d.y);
  return vec4(c, cov * cov * fade * 0.85);
}

void main(){
  vec3 d = normalize(vDir);
  vec3 atm = skyGradient(d);
  float up = smoothstep(-0.03, 0.2, d.y);
  float band;
  vec3 space = nebula(d, band) * uNebVis;
  space += stars(d, band) * uStarVis;
  vec4 pl = giant(d);
  space = space * (1.0 - pl.a) + pl.rgb * pl.a * uPlanetVis;
  float occ = pl.a;
  for (int i = 0; i < 2; i++){
    if (uMoonRad[i] > 0.0){
      vec4 m = moon(d, uMoonDir[i], uMoonRad[i], uMoonA[i], uMoonB[i], uMoonKind[i]);
      space = mix(space, m.rgb * uPlanetVis, m.a);
      occ = max(occ, m.a);
    }
  }
  float sd = dot(d, uSkySun);
  float sdisc = smoothstep(uSunCos - 0.00016, uSunCos + 0.00005, sd);
  space += uSunDisc * sdisc * (1.0 - occ);
  vec3 col = atm * (1.0 - occ * 0.35 * uPlanetVis) + space * up;
  if (uAurora > 0.01) col += aurora(d) * uAurora * (1.0 - occ * 0.6);
  if (uBeam > 0.001){
    float bd = max(dot(normalize(d.xz + 1e-5), normalize(uBeamDir.xz)), 0.0);
    col += vec3(0.5, 0.95, 1.0) * pow(bd, 6000.0) * uBeam * smoothstep(0.0, 0.3, d.y);
  }
  vec4 cl = clouds(d);
  col = mix(col, cl.rgb, cl.a);
  col = mix(col, uHorizon * 0.55, smoothstep(0.0, -0.25, d.y));
  gl_FragColor = vec4(col, 1.0);
}`;

const tmpA = new THREE.Color(), tmpB = new THREE.Color();
const KEY_COLORS = ['zenith', 'horizon', 'glow', 'sun', 'ambSky', 'ambGround', 'cloudLit', 'cloudDark'];
const KEY_SCALARS = ['glowI', 'sunI', 'ambI', 'starVis', 'nebVis', 'planetVis', 'exposure', 'fog'];

function prepKeys(keys) {
  return keys.map((k) => {
    const o = { s: k.s };
    for (const c of KEY_COLORS) o[c] = new THREE.Color(k[c] ?? 0x000000);
    for (const c of KEY_SCALARS) o[c] = k[c] ?? 1;
    return o;
  });
}

export const dirFrom = (azDeg, elDeg) => {
  const az = (azDeg * Math.PI) / 180, el = (elDeg * Math.PI) / 180;
  // azimuth 0 = north (-z), 90 = east (+x)
  return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
};

export class Sky {
  constructor() {
    this.uniforms = commonUniforms({
      uPlanetDir: { value: new THREE.Vector3(0, 0.5, -1).normalize() }, uPlanetRad: { value: 0.3 },
      uPlanetAxis: { value: new THREE.Vector3(0.2, 1, 0.3).normalize() },
      uPlanetA: { value: new THREE.Color() }, uPlanetB: { value: new THREE.Color() }, uPlanetC: { value: new THREE.Color() },
      uPlanetRim: { value: new THREE.Color() }, uRingCol: { value: new THREE.Color() }, uRingOn: { value: 1 },
      uMoonDir: { value: [new THREE.Vector3(1, 0.5, 0).normalize(), new THREE.Vector3(-1, 0.5, 0).normalize()] },
      uMoonRad: { value: [0, 0] },
      uMoonA: { value: [new THREE.Color(), new THREE.Color()] }, uMoonB: { value: [new THREE.Color(), new THREE.Color()] },
      uMoonKind: { value: [0, 0] },
      uStarVis: { value: 1 }, uNebVis: { value: 1 }, uPlanetVis: { value: 1 }, uAurora: { value: 0 },
      uCloud: { value: 0.5 }, uCloudLit: { value: new THREE.Color() }, uCloudDark: { value: new THREE.Color() },
      uNebA: { value: new THREE.Color(0x3a4cff) }, uNebB: { value: new THREE.Color(0xd24cff) },
      uGalN: { value: new THREE.Vector3(0.5, 0.6, 0.3).normalize() }, uGalX: { value: new THREE.Vector3(1, 0, 0) },
      uSunDisc: { value: new THREE.Color() }, uSunCos: { value: Math.cos(0.022) },
      uBeam: { value: 0 }, uBeamDir: { value: new THREE.Vector3(0, 0, -1) },
    });
    this.material = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, uniforms: this.uniforms,
      side: THREE.BackSide, depthTest: false, depthWrite: false,
    });
    this.mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 3), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    this.mesh.layers.enable(1);
    this.time = 0.62;
    this.sunDir = new THREE.Vector3(0, 1, 0);
    this.keyDir = new THREE.Vector3(0, 1, 0);
    this.sunY = 1;
    this.night = 0;
    this.exposure = 1;
    this.cfg = null;
  }

  setPlanet(cfg) {
    this.cfg = cfg;
    this.keys = prepKeys(cfg.keys);
    const u = this.uniforms;
    const g = cfg.giant;
    this.giantDir = dirFrom(g.az, g.el);
    u.uPlanetDir.value.copy(this.giantDir);
    u.uPlanetRad.value = Math.sin((g.size * Math.PI) / 180);
    u.uPlanetAxis.value.set(g.axis[0], g.axis[1], g.axis[2]).normalize();
    u.uPlanetA.value.set(g.colA); u.uPlanetB.value.set(g.colB); u.uPlanetC.value.set(g.colC);
    u.uPlanetRim.value.set(g.rim); u.uRingCol.value.set(g.ring); u.uRingOn.value = g.ringOn ? 1 : 0;
    for (let i = 0; i < 2; i++) {
      const m = cfg.moons[i];
      if (m) {
        u.uMoonDir.value[i].copy(dirFrom(m.az, m.el));
        u.uMoonRad.value[i] = Math.sin((m.size * Math.PI) / 180);
        u.uMoonA.value[i].set(m.colA); u.uMoonB.value[i].set(m.colB);
        u.uMoonKind.value[i] = m.kind;
      } else u.uMoonRad.value[i] = 0;
    }
    u.uNebA.value.set(cfg.nebA); u.uNebB.value.set(cfg.nebB);
    u.uGalN.value.set(cfg.galN[0], cfg.galN[1], cfg.galN[2]).normalize();
    const gx = new THREE.Vector3(cfg.galX[0], cfg.galX[1], cfg.galX[2]);
    gx.addScaledVector(u.uGalN.value, -gx.dot(u.uGalN.value)).normalize();
    u.uGalX.value.copy(gx);
    u.uCloud.value = cfg.cloud;
    this.update(0);
  }

  // t in [0,1): 0.25 sunrise, 0.5 noon, 0.75 sunset.
  sunAt(t, out) {
    const c = this.cfg;
    const a = (t - 0.25) * Math.PI * 2;
    out.set(Math.cos(a), Math.sin(a) * c.sunArc, c.sunTilt * (0.6 + 0.4 * Math.abs(Math.sin(a)))).normalize();
    return out;
  }

  update(dt, paused = false) {
    const c = this.cfg;
    if (!c) return;
    if (!paused) this.time = (this.time + dt / c.dayLength) % 1;
    this.sunAt(this.time, this.sunDir);
    const s = this.sunDir.y;
    this.sunY = s;
    const K = this.keys;
    let i = 0;
    while (i < K.length - 2 && s > K[i + 1].s) i++;
    const a = K[i], b = K[i + 1];
    let f = (s - a.s) / (b.s - a.s);
    f = Math.max(0, Math.min(1, f));
    const L = (name) => tmpA.copy(a[name]).lerp(b[name], f);
    const S = (name) => a[name] + (b[name] - a[name]) * f;
    const u = this.uniforms;
    G.uZenith.value.copy(L('zenith'));
    G.uHorizon.value.copy(L('horizon'));
    G.uSunGlow.value.copy(L('glow')).multiplyScalar(S('glowI'));
    const ambI = S('ambI');
    G.uAmbSky.value.copy(L('ambSky')).multiplyScalar(ambI);
    G.uAmbGround.value.copy(L('ambGround')).multiplyScalar(ambI);
    u.uCloudLit.value.copy(L('cloudLit'));
    u.uCloudDark.value.copy(L('cloudDark'));
    u.uStarVis.value = S('starVis');
    u.uNebVis.value = S('nebVis');
    u.uPlanetVis.value = S('planetVis');
    this.exposure = S('exposure');
    G.uFog.value.set(c.fogDensity * S('fog'), c.fogFalloff, c.fogBase, c.fogMax);
    G.uSkySun.value.copy(this.sunDir);
    const dayFade = Math.max(0, Math.min(1, (s + 0.045) / 0.065));
    const sunI = S('sunI') * dayFade * dayFade * (3 - 2 * dayFade);
    let nightF = (-0.055 - s) / 0.105;
    nightF = Math.max(0, Math.min(1, nightF));
    this.night = nightF;
    u.uAurora.value = c.aurora * nightF;
    if (s > -0.05) {
      this.keyDir.copy(this.sunDir);
      // keep the key light off the exact horizon so shadows stay finite
      if (this.keyDir.y < 0.035) { this.keyDir.y = 0.035; this.keyDir.normalize(); }
      G.uSunColor.value.copy(L('sun')).multiplyScalar(sunI);
    } else {
      this.keyDir.copy(this.giantDir);
      G.uSunColor.value.set(c.shine).multiplyScalar(c.shineI * nightF);
    }
    G.uSunDir.value.copy(this.keyDir);
    tmpB.copy(L('sun')).multiplyScalar(c.sunDisc * Math.max(0.25, Math.min(1, s * 4 + 0.6)));
    u.uSunDisc.value.copy(tmpB);
  }

  follow(camera) {
    this.mesh.position.copy(camera.position);
  }
}
