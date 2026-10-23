// The crater's ground: a bowl with an irregular raised rim, a deeper pit where the blow landed,
// ejecta ridges and rubble noise, baked into a height grid. The payload's way through it is graded
// into a smooth ramp, so the cart never climbs anything steeper than about 8 degrees.
import { CRATER, STATION } from './layout.js';

const S = 0.5; // m per sample
export const HALF = 64; // the grid covers the crater's centre +- HALF metres
const N = Math.round((HALF * 2) / S) + 1;

function smooth(t) { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); }
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const h = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  return (h(xi, zi) * (1 - u) + h(xi + 1, zi) * u) * (1 - v) + (h(xi, zi + 1) * (1 - u) + h(xi + 1, zi + 1) * u) * v;
}
function fbm(x, z) { return vnoise(x, z) * 0.55 + vnoise(x * 2.03, z * 2.03) * 0.3 + vnoise(x * 4.1, z * 4.1) * 0.15; }

/** the crater before grading: m above street level at x, z */
export function rawCrater(x, z) {
  const dx = x - CRATER.x, dz = z - CRATER.z;
  const r = Math.hypot(dx, dz);
  if (r > HALF - 2) return 0;
  // (nothing heaps up inside the station: its floor stays at street level)
  const sb = STATION.box;
  if (x < sb[2] - 0.4 && z > sb[1] && z < sb[3]) return 0;
  const ang = Math.atan2(dz, dx);
  // a ragged rim: the punch came in from the north-east, so the bowl leans south-west
  const wob = 1 + 0.055 * Math.sin(ang * 3 + 1.3) + 0.035 * Math.sin(ang * 7 + 0.4) + 0.02 * Math.sin(ang * 13 + 2.1);
  const u = r / (CRATER.R * wob);
  let h = 0;
  if (u < 1) h -= CRATER.depth * Math.pow(1 - u * u, 1.25);
  // ejecta: a broad low lip around the rim, falling away outside it
  h += 1.7 * Math.exp(-(((u - 1.02) / 0.16) ** 2));
  // ridges thrown out along rays, strongest on the slopes
  h += 0.45 * Math.sin(ang * 17 + 0.7) * Math.sin(ang * 5) * smooth((u - 0.35) / 0.3) * smooth((1.15 - u) / 0.2);
  // the pit
  const p = CRATER.pit, pd = Math.hypot(x - p.x, z - p.z) / p.r;
  if (pd < 1.4) h -= p.depth * Math.pow(smooth((1.4 - pd) / 1.4), 1.6);
  // rubble lumps, fading out to the flat street
  h += (fbm(x * 0.22, z * 0.22) - 0.5) * 0.9 * smooth((1.08 - u) / 0.15);
  // the ejecta thins out to the flat street well inside the grid's edge
  return h * smooth((HALF - 3 - r) / 12);
}

/**
 * Bakes the crater, then grades a road along `route` (a polyline of [x, z] points crossing it):
 * the ground within 4 m of the road takes the road's own smoothed, slope-limited profile, blending
 * back to the raw crater by 10 m.
 */
export class Terrain {
  constructor(route) {
    this.x0 = CRATER.x - HALF; this.z0 = CRATER.z - HALF;
    const H = this.h = new Float32Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) H[j * N + i] = rawCrater(this.x0 + i * S, this.z0 + j * S);
    // the road's profile: the raw ground under it, averaged over 18 m, then limited to a grade of 0.14
    const pts = resample(route, 0.5);
    let prof = pts.map(([x, z]) => this.sample(x, z));
    const W = 36;
    prof = prof.map((_, i) => { let s = 0, n = 0; for (let k = -W; k <= W; k++) { const q = prof[Math.min(prof.length - 1, Math.max(0, i + k))]; s += q; n++; } return s / n; });
    const G = 0.14 * 0.5;
    for (let i = 1; i < prof.length; i++) prof[i] = Math.max(prof[i], prof[i - 1] - G);
    for (let i = prof.length - 2; i >= 0; i--) prof[i] = Math.max(prof[i], prof[i + 1] - G);
    // (it must meet the street at both ends)
    for (let i = 0; i < prof.length; i++) { const e = Math.min(i, prof.length - 1 - i) * 0.5; if (e < 6) prof[i] *= smooth(e / 6); }
    this.road = pts.map((p, i) => [p[0], p[1], prof[i]]);
    // blend: nearest road point per cell within 10 m
    const dist = new Float32Array(N * N).fill(1e9), rh = new Float32Array(N * N);
    for (const [x, z, y] of this.road) {
      const ci = Math.round((x - this.x0) / S), cj = Math.round((z - this.z0) / S), R = Math.ceil(10 / S);
      for (let j = Math.max(0, cj - R); j <= Math.min(N - 1, cj + R); j++) for (let i = Math.max(0, ci - R); i <= Math.min(N - 1, ci + R); i++) {
        const d = Math.hypot(this.x0 + i * S - x, this.z0 + j * S - z), k = j * N + i;
        if (d < dist[k]) { dist[k] = d; rh[k] = y; }
      }
    }
    for (let k = 0; k < N * N; k++) if (dist[k] < 10) { const w = 1 - smooth((dist[k] - 4) / 6); H[k] = H[k] * (1 - w) + rh[k] * w; }
    let mx = 0, mn = 0; for (const v of H) { if (v > mx) mx = v; if (v < mn) mn = v; }
    this.max = mx; this.min = mn;
  }
  /** bilinear height at x, z (0 outside the grid) */
  sample(x, z) {
    const fx = (x - this.x0) / S, fz = (z - this.z0) / S;
    if (fx < 0 || fz < 0 || fx >= N - 1 || fz >= N - 1) return 0;
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, H = this.h;
    const a = H[j * N + i], b = H[j * N + i + 1], c = H[(j + 1) * N + i], d = H[(j + 1) * N + i + 1];
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  }
  get size() { return N; }
  get step() { return S; }
}

/** a polyline resampled every `step` metres */
export function resample(pts, step) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L / step));
    for (let k = 0; k < n; k++) out.push([ax + (bx - ax) * k / n, az + (bz - az) * k / n]);
  }
  out.push(pts[pts.length - 1].slice(0, 2));
  return out;
}

/** Catmull-Rom curve through points (each [x, z]), `per` samples per span */
export function curve(pts, per = 12) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[pts.length - 1].slice(0, 2));
  return out;
}
