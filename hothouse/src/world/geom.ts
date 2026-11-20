/**
 * 2D geometry on the ground plane (x, z). Points are `[x, z]` tuples; polygons are arrays of them.
 * Orientation convention: `area()` is positive for polygons that run counter-clockwise when
 * plotted with +x right and +z up (i.e. clockwise on a north-up map, where +z points south).
 */

export type P2 = [number, number];
export type Poly = P2[];

export function area(poly: ReadonlyArray<readonly [number, number]>): number {
  let a = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % n]!;
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

export function centroid(poly: ReadonlyArray<readonly [number, number]>): P2 {
  let cx = 0, cz = 0, a = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % n]!;
    const c = p[0] * q[1] - q[0] * p[1];
    cx += (p[0] + q[0]) * c;
    cz += (p[1] + q[1]) * c;
    a += c;
  }
  if (Math.abs(a) < 1e-9) {
    let sx = 0, sz = 0;
    for (const p of poly) {
      sx += p[0];
      sz += p[1];
    }
    return [sx / poly.length, sz / poly.length];
  }
  return [cx / (3 * a), cz / (3 * a)];
}

export function pointInPoly(x: number, z: number, poly: ReadonlyArray<readonly [number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i]!;
    const [xj, zj] = poly[j]!;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Distance from a point to a segment, and the parameter of the closest point. */
export function distToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

export function distToPolyline(px: number, pz: number, line: ReadonlyArray<readonly [number, number]>): number {
  let best = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i]!, b = line[i + 1]!;
    const d = distToSegment(px, pz, a[0], a[1], b[0], b[1]);
    if (d < best) best = d;
  }
  return best;
}

/** Distance to a closed polygon boundary (positive) — combine with `pointInPoly` for a signed field. */
export function distToPolyEdge(px: number, pz: number, poly: ReadonlyArray<readonly [number, number]>): number {
  let best = Infinity;
  for (let i = 0, n = poly.length; i < n; i++) {
    const a = poly[i]!, b = poly[(i + 1) % n]!;
    const d = distToSegment(px, pz, a[0], a[1], b[0], b[1]);
    if (d < best) best = d;
  }
  return best;
}

/** Intersection of the infinite lines p + t·d and q + s·e. Returns t, or null if parallel. */
export function lineIntersectT(px: number, pz: number, dx: number, dz: number, qx: number, qz: number, ex: number, ez: number): number | null {
  const den = dx * ez - dz * ex;
  if (Math.abs(den) < 1e-9) return null;
  return ((qx - px) * ez - (qz - pz) * ex) / den;
}

export function lerp2(a: readonly [number, number], b: readonly [number, number], t: number): P2 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

export function len2(a: readonly [number, number], b: readonly [number, number]): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

export function polylineLength(line: ReadonlyArray<readonly [number, number]>): number {
  let l = 0;
  for (let i = 0; i < line.length - 1; i++) l += len2(line[i]!, line[i + 1]!);
  return l;
}

/** Point and unit tangent at arc length `s` along a polyline. */
export function samplePolyline(line: ReadonlyArray<readonly [number, number]>, s: number): { x: number; z: number; dx: number; dz: number } {
  let acc = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i]!, b = line[i + 1]!;
    const l = len2(a, b);
    if (acc + l >= s || i === line.length - 2) {
      const t = l > 0 ? Math.min(1, Math.max(0, (s - acc) / l)) : 0;
      return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, dx: l > 0 ? (b[0] - a[0]) / l : 1, dz: l > 0 ? (b[1] - a[1]) / l : 0 };
    }
    acc += l;
  }
  const p = line[line.length - 1] ?? [0, 0];
  return { x: p[0], z: p[1], dx: 1, dz: 0 };
}

/**
 * Offset an open polyline sideways by `d` (positive = left of travel when +x right, +z up;
 * which is the right-hand side on a north-up map). Mitered joins, capped for sharp turns.
 */
export function offsetPolyline(line: ReadonlyArray<readonly [number, number]>, d: number): Poly {
  const n = line.length;
  const out: Poly = [];
  for (let i = 0; i < n; i++) {
    const p = line[i]!;
    const prev = line[Math.max(0, i - 1)]!;
    const next = line[Math.min(n - 1, i + 1)]!;
    let tx = next[0] - prev[0], tz = next[1] - prev[1];
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl;
    tz /= tl;
    let nx = -tz, nz = tx;
    let scale = 1;
    if (i > 0 && i < n - 1) {
      // Miter: scale the averaged normal by 1/cos(half angle).
      const ax = p[0] - prev[0], az = p[1] - prev[1];
      const al = Math.hypot(ax, az) || 1;
      const anx = -az / al, anz = ax / al;
      const cos = nx * anx + nz * anz;
      scale = 1 / Math.max(0.35, cos);
    }
    nx *= scale;
    nz *= scale;
    out.push([p[0] + nx * d, p[1] + nz * d]);
  }
  return out;
}

/**
 * Inset a closed polygon by `d` (positive shrinks a polygon with positive `area()`). Uses
 * per-edge offsets intersected at corners; good for convex-ish blocks and lots.
 */
export function insetPoly(poly: ReadonlyArray<readonly [number, number]>, d: number | ((edge: number) => number)): Poly {
  const n = poly.length;
  const sign = area(poly) >= 0 ? 1 : -1;
  const lines: Array<[number, number, number, number]> = [];
  for (let i = 0; i < n; i++) {
    const a = poly[i]!, b = poly[(i + 1) % n]!;
    let dx = b[0] - a[0], dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    // Inward normal for positive-area polygons is the left normal (−dz, dx).
    const dist = typeof d === 'number' ? d : d(i);
    const nx = -dz * sign, nz = dx * sign;
    lines.push([a[0] + nx * dist, a[1] + nz * dist, dx, dz]);
  }
  const out: Poly = [];
  for (let i = 0; i < n; i++) {
    const L0 = lines[(i + n - 1) % n]!;
    const L1 = lines[i]!;
    const t = lineIntersectT(L0[0], L0[1], L0[2], L0[3], L1[0], L1[1], L1[2], L1[3]);
    if (t === null) out.push([L1[0], L1[1]]);
    else out.push([L0[0] + L0[2] * t, L0[1] + L0[3] * t]);
  }
  return out;
}

/** Replace sharp corners with circular arcs of radius `r` (clamped to fit). */
export function filletPoly(poly: ReadonlyArray<readonly [number, number]>, r: number, segments = 5): Poly {
  const n = poly.length;
  const out: Poly = [];
  for (let i = 0; i < n; i++) {
    const p = poly[(i + n - 1) % n]!, c = poly[i]!, q = poly[(i + 1) % n]!;
    const ax = p[0] - c[0], az = p[1] - c[1];
    const bx = q[0] - c[0], bz = q[1] - c[1];
    const al = Math.hypot(ax, az), bl = Math.hypot(bx, bz);
    if (al < 1e-6 || bl < 1e-6) {
      out.push([c[0], c[1]]);
      continue;
    }
    const ux = ax / al, uz = az / al, vx = bx / bl, vz = bz / bl;
    const cos = Math.max(-1, Math.min(1, ux * vx + uz * vz));
    const ang = Math.acos(cos);
    if (ang > Math.PI - 0.05 || ang < 0.05) {
      out.push([c[0], c[1]]);
      continue;
    }
    const tanDist = Math.min(r / Math.tan(ang / 2), al * 0.45, bl * 0.45);
    const rr = tanDist * Math.tan(ang / 2);
    const s: P2 = [c[0] + ux * tanDist, c[1] + uz * tanDist];
    const e: P2 = [c[0] + vx * tanDist, c[1] + vz * tanDist];
    // Arc centre along the bisector.
    const bxn = ux + vx, bzn = uz + vz;
    const bl2 = Math.hypot(bxn, bzn) || 1;
    const centreDist = Math.hypot(tanDist, rr);
    const cx = c[0] + (bxn / bl2) * centreDist, cz = c[1] + (bzn / bl2) * centreDist;
    const a0 = Math.atan2(s[1] - cz, s[0] - cx);
    const a1 = Math.atan2(e[1] - cz, e[0] - cx);
    let da = a1 - a0;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    for (let k = 0; k <= segments; k++) {
      const a = a0 + (da * k) / segments;
      out.push([cx + Math.cos(a) * rr, cz + Math.sin(a) * rr]);
    }
  }
  return out;
}

/** Split a convex-ish polygon by the line through `p` with direction `d`. Returns [left, right]. */
export function splitPoly(poly: ReadonlyArray<readonly [number, number]>, px: number, pz: number, dx: number, dz: number): [Poly, Poly] {
  const left: Poly = [];
  const right: Poly = [];
  const side = (q: readonly [number, number]) => dx * (q[1] - pz) - dz * (q[0] - px);
  for (let i = 0, n = poly.length; i < n; i++) {
    const a = poly[i]!, b = poly[(i + 1) % n]!;
    const sa = side(a), sb = side(b);
    if (sa >= 0) left.push([a[0], a[1]]);
    if (sa <= 0) right.push([a[0], a[1]]);
    if ((sa > 0 && sb < 0) || (sa < 0 && sb > 0)) {
      const t = sa / (sa - sb);
      const ip: P2 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      left.push(ip);
      right.push([ip[0], ip[1]]);
    }
  }
  return [left, right];
}

/** Oriented bounding box via the longest edge direction: centre, axis (unit) and half-extents. */
export function obb(poly: ReadonlyArray<readonly [number, number]>): { cx: number; cz: number; ux: number; uz: number; hu: number; hv: number } {
  let best = -1;
  let ux = 1, uz = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const a = poly[i]!, b = poly[(i + 1) % n]!;
    const l = len2(a, b);
    if (l > best) {
      best = l;
      ux = (b[0] - a[0]) / (l || 1);
      uz = (b[1] - a[1]) / (l || 1);
    }
  }
  const vx = -uz, vz = ux;
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const p of poly) {
    const u = p[0] * ux + p[1] * uz;
    const v = p[0] * vx + p[1] * vz;
    if (u < u0) u0 = u;
    if (u > u1) u1 = u;
    if (v < v0) v0 = v;
    if (v > v1) v1 = v;
  }
  const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
  return { cx: cu * ux + cv * vx, cz: cu * uz + cv * vz, ux, uz, hu: (u1 - u0) / 2, hv: (v1 - v0) / 2 };
}

export function ensureCCW(poly: Poly): Poly {
  return area(poly) < 0 ? poly.slice().reverse() : poly;
}

/** Remove points closer than `eps` to their predecessor and collinear runs. */
export function cleanPoly(poly: ReadonlyArray<readonly [number, number]>, eps = 0.05): Poly {
  const out: Poly = [];
  for (const p of poly) {
    const last = out[out.length - 1];
    if (!last || len2(last, p) > eps) out.push([p[0], p[1]]);
  }
  if (out.length > 2 && len2(out[0]!, out[out.length - 1]!) <= eps) out.pop();
  const res: Poly = [];
  for (let i = 0, n = out.length; i < n; i++) {
    const a = out[(i + n - 1) % n]!, b = out[i]!, c = out[(i + 1) % n]!;
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(cross) > 1e-4 * len2(a, c)) res.push(b);
  }
  return res.length >= 3 ? res : out;
}

/** Axis-aligned bounds of a polygon. */
export function bounds(poly: ReadonlyArray<readonly [number, number]>): { x0: number; z0: number; x1: number; z1: number } {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const [x, z] of poly) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (z < z0) z0 = z;
    if (z > z1) z1 = z;
  }
  return { x0, z0, x1, z1 };
}
