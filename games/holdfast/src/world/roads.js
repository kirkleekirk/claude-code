// Road meshes: rural ribbons (paved highway with lane paint, gravel county
// roads with tyre tracks) and the town street grid with sidewalks & curbs.
import * as THREE from 'three';
import { GeoBuilder, rgb, mulc } from '../geom.js';
import { resample, catmullRom, clamp } from '../util.js';
import { townPlane } from './terrain.js';

// Turn a control polyline into a smooth, profiled centreline.
export function roadCentreline(terrain, road) {
  const smooth = catmullRom(road.pts, 6);
  const fine = resample(smooth, 2);
  return terrain.profile(fine, road.type === 'paved' ? 30 : 20, road.type === 'paved' ? 0.07 : 0.1);
}

export function buildRoadRibbon(builder, samples, road) {
  const half = road.width / 2;
  const paved = road.type === 'paved';
  const sh = paved ? 1.1 : 0.0;
  const n = samples.length;
  // offsets across: shoulder edge, edge, inner track, centre...
  const xs = paved ? [-half - sh, -half, -half * 0.5, 0, half * 0.5, half, half + sh] : [-half, -half * 0.55, -half * 0.3, 0, half * 0.3, half * 0.55, half];
  const crown = (o) => -0.07 * (o / half) * (o / half);
  const rows = [];
  for (let i = 0; i < n; i++) {
    const p = samples[i];
    const a = samples[Math.max(0, i - 1)], b = samples[Math.min(n - 1, i + 1)];
    let dx = b.x - a.x, dz = b.z - a.z;
    const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const nx = -dz, nz = dx; // left normal
    rows.push(xs.map((o) => [p.x + nx * o, p.y + crown(Math.min(Math.abs(o), half) * Math.sign(o)) + (Math.abs(o) > half ? -0.05 : 0) + 0.04, p.z + nz * o]));
    p.nx = nx; p.nz = nz; p.dx = dx; p.dz = dz;
  }
  // distance along for UVs
  let s = 0;
  const S = [0];
  for (let i = 1; i < n; i++) { s += Math.hypot(samples[i].x - samples[i - 1].x, samples[i].z - samples[i - 1].z); S.push(s); }
  for (let i = 0; i < n - 1; i++) {
    for (let k = 0; k < xs.length - 1; k++) {
      const a = rows[i][k], b = rows[i][k + 1], c = rows[i + 1][k + 1], d = rows[i + 1][k];
      let key, col;
      if (paved) {
        const shoulder = k === 0 || k === xs.length - 2;
        key = shoulder ? 'gravel' : 'asphalt';
        col = shoulder ? [0.78, 0.74, 0.68] : [1, 1, 1];
      } else {
        key = 'gravel';
        const track = k === 1 || k === 4;
        col = track ? [0.82, 0.78, 0.72] : [1, 0.98, 0.95];
      }
      const uv = (p, o, si) => [o, S[si]];
      builder.quad(key, a, d, c, b, col, [uv(a, xs[k], i), uv(d, xs[k], i + 1), uv(c, xs[k + 1], i + 1), uv(b, xs[k + 1], i)], [0, 1, 0]);
    }
  }
  if (paved) {
    // lane paint: double yellow centre, white edge lines (dashes skipped)
    const line = (off, w, color, dash = 0) => {
      for (let i = 0; i < n - 1; i++) {
        if (dash && Math.floor(S[i] / dash) % 2) continue;
        const p = samples[i], q = samples[i + 1];
        const y0 = p.y + crown(off) + 0.055, y1 = q.y + crown(off) + 0.055;
        const A = [p.x + p.nx * (off - w), y0, p.z + p.nz * (off - w)], B = [p.x + p.nx * (off + w), y0, p.z + p.nz * (off + w)];
        const C = [q.x + q.nx * (off + w), y1, q.z + q.nz * (off + w)], D = [q.x + q.nx * (off - w), y1, q.z + q.nz * (off - w)];
        builder.quad('plain:paint', A, D, C, B, color, null, [0, 1, 0]);
      }
    };
    const yel = rgb('#d8b23a'), wht = mulc(rgb('#e8e6dc'), 0.95);
    line(-0.1, 0.05, yel); line(0.1, 0.05, yel);
    line(-half + 0.15, 0.06, wht); line(half - 0.15, 0.06, wht);
  }
}

// ---------------- town streets ----------------
// raster at 1 m: 0 none, 1 road, 2 sidewalk
export function buildTownStreets(builder, streets, bounds, out) {
  const { x0, z0, x1, z1 } = bounds;
  const W = x1 - x0, H = z1 - z0;
  const grid = new Uint8Array(W * H);
  const mark = (rx0, rz0, rx1, rz1, v, onlyIfZero) => {
    for (let z = Math.max(z0, rz0); z < Math.min(z1, rz1); z++) for (let x = Math.max(x0, rx0); x < Math.min(x1, rx1); x++) {
      const k = (z - z0) * W + (x - x0);
      if (onlyIfZero && grid[k]) continue;
      grid[k] = v;
    }
  };
  for (const s of streets.ns) mark(s.x0, s.z0, s.x1, s.z1, 1);
  for (const s of streets.ew) mark(s.x0, s.z0, s.x1, s.z1, 1);
  for (const s of streets.ns) { mark(s.x0 - s.walk, s.z0, s.x0, s.z1, 2, true); mark(s.x1, s.z0, s.x1 + s.walk, s.z1, 2, true); }
  for (const s of streets.ew) { mark(s.x0, s.z0 - s.walk, s.x1, s.z0, 2, true); mark(s.x0, s.z1, s.x1, s.z1 + s.walk, 2, true); }
  const at = (x, z) => (x < x0 || z < z0 || x >= x1 || z >= z1 ? 0 : grid[(z - z0) * W + (x - x0)]);
  const CURB = 0.15;
  const yOf = (x, type) => townPlane(x) + (type === 2 ? CURB : 0);
  // greedy rects per type
  const used = new Uint8Array(W * H);
  for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) {
    const t = at(x, z);
    const k = (z - z0) * W + (x - x0);
    if (!t || used[k]) continue;
    let xe = x;
    while (xe + 1 < x1 && at(xe + 1, z) === t && !used[(z - z0) * W + (xe + 1 - x0)]) xe++;
    let ze = z;
    outer: while (ze + 1 < z1) {
      for (let xx = x; xx <= xe; xx++) if (at(xx, ze + 1) !== t || used[(ze + 1 - z0) * W + (xx - x0)]) break outer;
      ze++;
    }
    for (let zz = z; zz <= ze; zz++) for (let xx = x; xx <= xe; xx++) used[(zz - z0) * W + (xx - x0)] = 1;
    const ax = x, bx = xe + 1, az = z, bz = ze + 1;
    const key = t === 1 ? 'asphalt' : 'sidewalk';
    const col = t === 1 ? [0.92, 0.92, 0.92] : [1, 1, 1];
    builder.quad(key, [ax, yOf(ax, t), bz], [bx, yOf(bx, t), bz], [bx, yOf(bx, t), az], [ax, yOf(ax, t), az], col);
    if (t === 2) out.walk.push({ min: [ax, yOf(ax, 2) - 0.6, az], max: [bx, Math.max(yOf(ax, 2), yOf(bx, 2)), bz] });
  }
  // curb faces: sidewalk next to road or nothing
  const curbC = rgb('#c9c6be');
  for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) {
    if (at(x, z) !== 2) continue;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nb = at(x + dx, z + dz);
      if (nb === 2) continue;
      const drop = nb === 1 ? CURB : CURB + 0.25;
      let a, b;
      if (dx === 1) { a = [x + 1, 0, z + 1]; b = [x + 1, 0, z]; }
      else if (dx === -1) { a = [x, 0, z]; b = [x, 0, z + 1]; }
      else if (dz === 1) { a = [x, 0, z + 1]; b = [x + 1, 0, z + 1]; }
      else { a = [x + 1, 0, z]; b = [x, 0, z]; }
      const ya = yOf(a[0], 2), yb = yOf(b[0], 2);
      builder.quad('concrete', [a[0], ya - drop, a[2]], [b[0], yb - drop, b[2]], [b[0], yb, b[2]], [a[0], ya, a[2]], curbC, null, [dx, 0, dz]);
    }
  }
  return { at, yOf };
}

// Painted markings for town streets: centre lines & crosswalks.
export function buildTownMarkings(builder, streets) {
  const yel = rgb('#d8b23a'), wht = rgb('#e6e4da');
  const Y = (x) => townPlane(x) + 0.02;
  for (const s of streets.ew) {
    const cz = (s.z0 + s.z1) / 2;
    // centre double line, interrupted at intersections
    let x = s.x0 + 1;
    while (x < s.x1 - 1) {
      const inX = streets.ns.some((n) => x + 1 > n.x0 - n.walk && x < n.x1 + n.walk);
      if (!inX) for (const o of [-0.12, 0.12]) builder.quad('plain:paint', [x, Y(x), cz + o + 0.05], [x + 1, Y(x + 1), cz + o + 0.05], [x + 1, Y(x + 1), cz + o - 0.05], [x, Y(x), cz + o - 0.05], yel);
      x += 1;
    }
  }
  for (const s of streets.ns) {
    const cx = (s.x0 + s.x1) / 2;
    for (let z = s.z0 + 1; z < s.z1 - 1; z++) {
      const inX = streets.ew.some((e) => z + 1 > e.z0 - e.walk && z < e.z1 + e.walk);
      if (inX) continue;
      for (const o of [-0.12, 0.12]) {
        const xa = cx + o - 0.05, xb = cx + o + 0.05;
        builder.quad('plain:paint', [xa, Y(xa), z + 1], [xb, Y(xb), z + 1], [xb, Y(xb), z], [xa, Y(xa), z], yel);
      }
    }
  }
  // crosswalks at each intersection side
  for (const e of streets.ew) for (const n of streets.ns) {
    if (n.z0 > e.z1 || n.z1 < e.z0 || e.x0 > n.x1 || e.x1 < n.x0) continue;
    // stripes across the E-W street just outside the intersection
    for (const sx of [n.x0 - 2.6, n.x1 + 0.6]) {
      for (let z = e.z0 + 0.4; z < e.z1 - 0.4; z += 1.0) {
        builder.quad('plain:paint', [sx, Y(sx), z + 0.5], [sx + 2, Y(sx + 2), z + 0.5], [sx + 2, Y(sx + 2), z], [sx, Y(sx), z], wht);
      }
    }
    for (const sz of [e.z0 - 2.6, e.z1 + 0.6]) {
      for (let x = n.x0 + 0.4; x < n.x1 - 0.4; x += 1.0) {
        builder.quad('plain:paint', [x, Y(x), sz + 2], [x + 0.5, Y(x + 0.5), sz + 2], [x + 0.5, Y(x + 0.5), sz], [x, Y(x), sz], wht);
      }
    }
  }
  // diagonal parking stripes on Main St
  const main = streets.ew.find((s) => s.name === 'Main St');
  if (main) {
    for (let x = main.x0 + 4; x < main.x1 - 4; x += 3) {
      const inX = streets.ns.some((n) => x + 3 > n.x0 - 6 && x < n.x1 + 6);
      if (inX) continue;
      for (const [zEdge, dir] of [[main.z0, 1], [main.z1, -1]]) {
        const za = zEdge + dir * 0.1, zb = zEdge + dir * 2.4;
        builder.quad('plain:paint', [x, Y(x), za], [x + 0.1, Y(x + 0.1), za], [x + 0.1, Y(x + 0.1), zb], [x, Y(x), zb], wht, null, [0, 1, 0]);
      }
    }
  }
  void clamp; void THREE;
}
