import * as THREE from 'three';

export const DEG = Math.PI / 180;
export const TAU = Math.PI * 2;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => clamp01((v - a) / (b - a));
export const remap = (v, a, b, c, d) => lerp(c, d, invLerp(a, b, v));
export const smoothstep = (a, b, v) => { const t = invLerp(a, b, v); return t * t * (3 - 2 * t); };
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randSign = () => (Math.random() < 0.5 ? -1 : 1);
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];

/** Frame-rate independent exponential smoothing factor. */
export const dampT = (lambda, dt) => 1 - Math.exp(-lambda * dt);
export const damp = (a, b, lambda, dt) => lerp(a, b, dampT(lambda, dt));

export function dampAngle(a, b, lambda, dt) {
  return a + wrapAngle(b - a) * dampT(lambda, dt);
}
export function wrapAngle(a) {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

export const ease = {
  linear: (t) => t,
  in: (t) => t * t,
  out: (t) => 1 - (1 - t) * (1 - t),
  inout: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  in3: (t) => t * t * t,
  out3: (t) => 1 - Math.pow(1 - t, 3),
  out5: (t) => 1 - Math.pow(1 - t, 5),
  inout3: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  back: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  elastic: (t) => (t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (TAU / 3)) + 1),
  snap: (t) => 1 - Math.pow(1 - t, 8),
};

/** Critically damped spring for scalars (semi-implicit). */
export class Spring {
  constructor(value = 0, freq = 6, damping = 1) {
    this.x = value; this.v = 0; this.freq = freq; this.damping = damping; this.target = value;
  }
  update(dt, target = this.target) {
    const w = TAU * this.freq;
    const z = this.damping;
    // Implicit integration for stability at large dt.
    const f = 1 + 2 * dt * z * w;
    const oo = w * w, hoo = dt * oo, hhoo = dt * hoo;
    const detInv = 1 / (f + hhoo);
    const detX = f * this.x + dt * this.v + hhoo * target;
    const detV = this.v + hoo * (target - this.x);
    this.x = detX * detInv;
    this.v = detV * detInv;
    return this.x;
  }
  reset(v) { this.x = v; this.v = 0; this.target = v; }
}

export class Spring3 {
  constructor(v = new THREE.Vector3(), freq = 6, damping = 1) {
    this.x = new Spring(v.x, freq, damping); this.y = new Spring(v.y, freq, damping); this.z = new Spring(v.z, freq, damping);
    this.value = v.clone();
  }
  update(dt, t) {
    this.value.set(this.x.update(dt, t.x), this.y.update(dt, t.y), this.z.update(dt, t.z));
    return this.value;
  }
  reset(v) { this.x.reset(v.x); this.y.reset(v.y); this.z.reset(v.z); this.value.copy(v); }
  impulse(v) { this.x.v += v.x; this.y.v += v.y; this.z.v += v.z; }
}

// ---------- Noise ----------
const perm = new Uint8Array(512);
{
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  let s = 1337;
  for (let i = 255; i > 0; i--) {
    s = (s * 16807) % 2147483647;
    const j = s % (i + 1);
    const t = p[i]; p[i] = p[j]; p[j] = t;
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
}
const grad1 = (h, x) => ((h & 1) ? -x : x) * (1 + (h & 7) / 4);
/** 1D gradient noise in [-1, 1]. */
export function noise1(x) {
  const i = Math.floor(x); const f = x - i;
  const u = f * f * (3 - 2 * f);
  const a = grad1(perm[i & 255], f), b = grad1(perm[(i + 1) & 255], f - 1);
  return (a + (b - a) * u) * 0.5;
}
export function fbm1(x, oct = 3) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += a * noise1(x * f + i * 17.3); f *= 2; a *= 0.5; }
  return s;
}

// ---------- Scratch objects ----------
export const V = () => new THREE.Vector3();
export const Q = () => new THREE.Quaternion();
export const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();
export const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
export const _m1 = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
export const _e1 = new THREE.Euler();
export const UP = new THREE.Vector3(0, 1, 0);
export const FWD = new THREE.Vector3(0, 0, 1);
export const RIGHT = new THREE.Vector3(1, 0, 0);

/** Quaternion whose basis maps x->a, y->b, z->c (orthonormal columns). */
export function quatFromBasis(a, b, c, out = new THREE.Quaternion()) {
  _m1.makeBasis(a, b, c);
  return out.setFromRotationMatrix(_m1);
}

const _fa = new THREE.Vector3(), _fb = new THREE.Vector3(), _fm1 = new THREE.Matrix4(), _fm2 = new THREE.Matrix4();
/** Rotation mapping frame (d0,h0) onto frame (d1,h1); both pairs orthonormal. */
export function quatFrameToFrame(d0, h0, d1, h1, out = new THREE.Quaternion()) {
  _fa.crossVectors(d0, h0);
  _fm1.makeBasis(d0, h0, _fa);
  _fb.crossVectors(d1, h1);
  _fm2.makeBasis(d1, h1, _fb);
  _fm1.transpose(); // inverse of rotation matrix
  _fm2.multiply(_fm1);
  return out.setFromRotationMatrix(_fm2);
}

export function yawQuat(yaw, out = new THREE.Quaternion()) {
  return out.setFromAxisAngle(UP, yaw);
}

/** Direction (unit) from yaw/pitch, yaw 0 = +Z, positive yaw turns toward +X. */
export function dirFromYawPitch(yaw, pitch, out = new THREE.Vector3()) {
  const cp = Math.cos(pitch);
  return out.set(Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp);
}

export function yawOf(v) { return Math.atan2(v.x, v.z); }
export function pitchOf(v) { return Math.atan2(v.y, Math.hypot(v.x, v.z)); }

/** Distance from point p to segment ab, returns t param via out object. */
export function closestOnSegment(p, a, b, out) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const len2 = abx * abx + aby * aby + abz * abz;
  let t = len2 > 1e-9 ? ((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / len2 : 0;
  t = clamp01(t);
  out.set(a.x + abx * t, a.y + aby * t, a.z + abz * t);
  return t;
}

/** Segment-segment closest distance squared (for capsule tests). */
export function segSegDist2(p1, q1, p2, q2) {
  const d1x = q1.x - p1.x, d1y = q1.y - p1.y, d1z = q1.z - p1.z;
  const d2x = q2.x - p2.x, d2y = q2.y - p2.y, d2z = q2.z - p2.z;
  const rx = p1.x - p2.x, ry = p1.y - p2.y, rz = p1.z - p2.z;
  const a = d1x * d1x + d1y * d1y + d1z * d1z;
  const e = d2x * d2x + d2y * d2y + d2z * d2z;
  const f = d2x * rx + d2y * ry + d2z * rz;
  let s, t;
  if (a <= 1e-9 && e <= 1e-9) { s = t = 0; }
  else if (a <= 1e-9) { s = 0; t = clamp01(f / e); }
  else {
    const c = d1x * rx + d1y * ry + d1z * rz;
    if (e <= 1e-9) { t = 0; s = clamp01(-c / a); }
    else {
      const b = d1x * d2x + d1y * d2y + d1z * d2z;
      const denom = a * e - b * b;
      s = denom !== 0 ? clamp01((b * f - c * e) / denom) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = clamp01(-c / a); }
      else if (t > 1) { t = 1; s = clamp01((b - c) / a); }
    }
  }
  const cx = p1.x + d1x * s - (p2.x + d2x * t);
  const cy = p1.y + d1y * s - (p2.y + d2y * t);
  const cz = p1.z + d1z * s - (p2.z + d2z * t);
  return cx * cx + cy * cy + cz * cz;
}

/** Ray vs sphere: returns distance or -1. dir must be normalized. */
export function raySphere(o, d, c, r) {
  const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const cc = ox * ox + oy * oy + oz * oz - r * r;
  const h = b * b - cc;
  if (h < 0) return -1;
  const s = Math.sqrt(h);
  let t = -b - s;
  if (t < 0) t = -b + s;
  return t < 0 ? -1 : t;
}

export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
