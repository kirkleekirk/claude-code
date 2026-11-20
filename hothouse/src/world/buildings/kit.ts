import { Vector3 } from 'three';
import type { Rng } from '@/core/rng';
import { SurfFlag, WinStyle, type MeshBuilder } from '@/render/geo/MeshBuilder';
import { area, insetPoly, type P2, type Poly } from '../geom';

/** A facade band: a horizontal slice of wall with an optional window grid. */
export interface Band {
  y0: number;
  y1: number;
  /** [cellW, cellH, style, seed]; omit for blank wall. */
  win?: readonly [number, number, number, number];
}

/** Orient a polygon so `MeshBuilder.wall` faces outward (negative signed area). */
export function outward(poly: Poly): Poly {
  return area(poly) > 0 ? poly.slice().reverse() : poly;
}

/** Rectangle footprint in a building's local frame: front at z = 0 facing −Z, depth along +Z. */
export function rectFootprint(w: number, d: number, z0 = 0): Poly {
  return [[w / 2, z0], [-w / 2, z0], [-w / 2, z0 + d], [w / 2, z0 + d]];
}

/**
 * Rectangle with rounded corners. `corners` radii in order: front-right, front-left, back-left,
 * back-right (0 = sharp).
 */
export function roundedRect(w: number, d: number, corners: readonly [number, number, number, number], seg = 7, z0 = 0): Poly {
  const hw = w / 2;
  const pts: Poly = [];
  const arc = (cx: number, cz: number, r: number, a0: number, a1: number) => {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + ((a1 - a0) * i) / seg;
      pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
    }
  };
  const [fr, fl, bl, br] = corners;
  // Walk front-right → front-left → back-left → back-right (outward orientation).
  if (fr > 0) arc(hw - fr, z0 + fr, fr, 0, -Math.PI / 2);
  else pts.push([hw, z0]);
  if (fl > 0) arc(-hw + fl, z0 + fl, fl, -Math.PI / 2, -Math.PI);
  else pts.push([-hw, z0]);
  if (bl > 0) arc(-hw + bl, z0 + d - bl, bl, Math.PI, Math.PI / 2);
  else pts.push([-hw, z0 + d]);
  if (br > 0) arc(hw - br, z0 + d - br, br, Math.PI / 2, 0);
  else pts.push([hw, z0 + d]);
  return pts;
}

const SMOOTH_COS = Math.cos((28 * Math.PI) / 180);

/**
 * Walls along a closed outward-oriented polygon. Straight runs get their own centred window grid
 * with blank margins at sharp corners; arc runs are smooth-shaded and share continuous UVs so band
 * windows wrap around curves.
 */
export function facade(b: MeshBuilder, poly: Poly, bands: readonly Band[], margin = 1.2): void {
  const n = poly.length;
  // Per-vertex smoothing: vertices on gentle turns get averaged normals.
  const edgeN: P2[] = [];
  for (let i = 0; i < n; i++) {
    const a = poly[i]!, c = poly[(i + 1) % n]!;
    const dx = c[0] - a[0], dz = c[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    // Outward normal of an outward-oriented edge: right of travel.
    edgeN.push([-dz / l, dx / l]);
  }
  const smooth: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const p = edgeN[(i - 1 + n) % n]!, q = edgeN[i]!;
    smooth.push(p[0] * q[0] + p[1] * q[1] > SMOOTH_COS);
  }
  // Continuous u along smooth chains.
  const uStart = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    if (smooth[i]) {
      const prev = (i - 1 + n) % n;
      uStart[i] = uStart[prev]! + Math.hypot(poly[i]![0] - poly[prev]![0], poly[i]![1] - poly[prev]![1]);
    }
  }
  for (let i = 0; i < n; i++) {
    const a = poly[i]!, c = poly[(i + 1) % n]!;
    const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
    if (len < 1e-3) continue;
    const na = smooth[i] ? avg(edgeN[(i - 1 + n) % n]!, edgeN[i]!) : edgeN[i]!;
    const nc = smooth[(i + 1) % n] ? avg(edgeN[i]!, edgeN[(i + 1) % n]!) : edgeN[i]!;
    const chained = smooth[i] || smooth[(i + 1) % n];
    for (const band of bands) {
      if (!band.win || chained) {
        if (band.win) b.windows(band.win[0], band.win[1], band.win[2], band.win[3]);
        else b.noWindows();
        quadSmooth(b, a, c, band.y0, band.y1, na, nc, uStart[i]!, uStart[i]! + len, band.y0);
        continue;
      }
      // Straight wall: blank margins, centred grid in the middle.
      const [cw] = band.win;
      const m = Math.min(margin, len * 0.2);
      const mid = len - 2 * m;
      const count = Math.max(0, Math.floor(mid / cw + 0.001));
      if (count === 0) {
        b.noWindows();
        quadSmooth(b, a, c, band.y0, band.y1, na, nc, 0, len, band.y0);
        continue;
      }
      const used = count * cw;
      const pad = (len - used) / 2;
      const t0 = pad / len, t1 = (pad + used) / len;
      const p0 = lerpP(a, c, t0), p1 = lerpP(a, c, t1);
      b.noWindows();
      quadSmooth(b, a, p0, band.y0, band.y1, na, edgeN[i]!, -pad, 0, band.y0);
      b.windows(band.win[0], band.win[1], band.win[2], band.win[3]);
      quadSmooth(b, p0, p1, band.y0, band.y1, edgeN[i]!, edgeN[i]!, 0, used, band.y0);
      b.noWindows();
      quadSmooth(b, p1, c, band.y0, band.y1, edgeN[i]!, nc, used, used + pad, band.y0);
    }
  }
  b.noWindows();
}

function avg(p: P2, q: P2): P2 {
  const x = p[0] + q[0], z = p[1] + q[1];
  const l = Math.hypot(x, z) || 1;
  return [x / l, z / l];
}

function lerpP(a: P2, c: P2, t: number): P2 {
  return [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t];
}

function quadSmooth(b: MeshBuilder, a: P2, c: P2, y0: number, y1: number, na: P2, nc: P2, u0: number, u1: number, vBase: number): void {
  const i0 = b.vertex(a[0], y0, a[1], na[0], 0, na[1], u0, y0 - vBase);
  const i1 = b.vertex(c[0], y0, c[1], nc[0], 0, nc[1], u1, y0 - vBase);
  const i2 = b.vertex(c[0], y1, c[1], nc[0], 0, nc[1], u1, y1 - vBase);
  const i3 = b.vertex(a[0], y1, a[1], na[0], 0, na[1], u0, y1 - vBase);
  b.quadIdx(i0, i1, i2, i3);
}

/** Extruded solid from an outward polygon (walls + top cap, optional bottom). */
export function slab(b: MeshBuilder, poly: Poly, y0: number, y1: number, bottom = false): void {
  b.noWindows();
  const o = outward(poly);
  let u = 0;
  for (let i = 0; i < o.length; i++) {
    const a = o[i]!, c = o[(i + 1) % o.length]!;
    b.wall(a[0], a[1], c[0], c[1], y0, y1, u, y0);
    u += Math.hypot(c[0] - a[0], c[1] - a[1]);
  }
  b.cap(o, y1, 1);
  if (bottom) b.cap(o, y0, -1);
}

/** A thin horizontal ledge that sticks out `depth` from the walls. */
export function ledge(b: MeshBuilder, poly: Poly, y: number, depth: number, thickness: number): void {
  const grown = insetPoly(outward(poly), -depth);
  slab(b, grown, y, y + thickness, true);
}

/** Parapet: a wall ring above the roof with a cap, plus the roof surface inside it. */
export function parapetRoof(b: MeshBuilder, poly: Poly, roofY: number, height: number, roofColor: string, wallColor: string, roofStyle: number = WinStyle.GRAVEL): void {
  const o = outward(poly);
  const inner = insetPoly(o, 0.3);
  b.surface(wallColor, 0.85, 0, 0, SurfFlag.WET).noWindows();
  facade(b, o, [{ y0: roofY, y1: roofY + height }]);
  // Inner face of the parapet (walk inner loop reversed so walls face inward).
  const innerRev = inner.slice().reverse();
  let u = 0;
  for (let i = 0; i < innerRev.length; i++) {
    const a = innerRev[i]!, c = innerRev[(i + 1) % innerRev.length]!;
    b.wall(a[0], a[1], c[0], c[1], roofY, roofY + height, u, roofY);
    u += Math.hypot(c[0] - a[0], c[1] - a[1]);
  }
  // Cap (between outer and inner rings) as a slab top strip.
  b.surface(wallColor, 0.7, 0, 0, SurfFlag.WET);
  ringCap(b, o, inner, roofY + height);
  b.surface(roofColor, 0.95, 0, 0, SurfFlag.WET).windows(1.2, 1.2, roofStyle, 11);
  b.cap(inner, roofY + 0.02, 1);
  b.noWindows();
}

/** Horizontal ring between two matching polygons at height y, facing up. */
export function ringCap(b: MeshBuilder, outer: Poly, inner: Poly, y: number): void {
  const n = outer.length;
  for (let i = 0; i < n; i++) {
    const a0 = outer[i]!, a1 = outer[(i + 1) % n]!;
    const b0 = inner[i]!, b1 = inner[(i + 1) % n]!;
    const v0 = b.vertex(a0[0], y, a0[1], 0, 1, 0, a0[0], a0[1]);
    const v1 = b.vertex(a1[0], y, a1[1], 0, 1, 0, a1[0], a1[1]);
    const v2 = b.vertex(b1[0], y, b1[1], 0, 1, 0, b1[0], b1[1]);
    const v3 = b.vertex(b0[0], y, b0[1], 0, 1, 0, b0[0], b0[1]);
    // Outward polygons have negative area: this order faces up.
    b.quadIdx(v0, v1, v2, v3);
  }
}

/** Glowing tube (neon) through local points. */
export function neon(b: MeshBuilder, pts: Vector3[], color: string, strength = 7, radius = 0.045): void {
  b.surface(color, 0.3, 0, strength, SurfFlag.FLICKER).noWindows();
  b.tube(pts, radius, 6);
}

/** Straight neon run between two local points. */
export function neonLine(b: MeshBuilder, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: string, strength = 7): void {
  neon(b, [new Vector3(x0, y0, z0), new Vector3(x1, y1, z1)], color, strength);
}

/** Rooftop clutter: AC units, vents, a water tank or dish. Keeps clear of the parapet. */
export function roofClutter(b: MeshBuilder, w: number, d: number, roofY: number, rng: Rng, z0 = 0): void {
  const count = Math.max(1, Math.round((w * d) / 140));
  for (let i = 0; i < count; i++) {
    const x = rng.range(-w / 2 + 2, w / 2 - 2);
    const z = z0 + rng.range(2, d - 2);
    const kind = rng.next();
    if (kind < 0.55) {
      b.surface('#C9CCD1', 0.55, 0.6, 0, SurfFlag.WET);
      b.boxOn(x, roofY, z, rng.range(1.2, 2.2), rng.range(0.9, 1.4), rng.range(1.0, 1.6));
      b.surface('#5A5E66', 0.6, 0.5, 0, 0);
      b.cylinder(x, roofY + 1.05, z, 0.42, 0.42, 0.1, 10, true);
    } else if (kind < 0.8) {
      b.surface('#B9BCC2', 0.5, 0.7, 0, SurfFlag.WET);
      b.cylinder(x, roofY, z, 0.18, 0.18, rng.range(0.8, 1.6), 8, true);
    } else if (kind < 0.92 && w > 14) {
      // Water tank on legs.
      b.surface('#7A5C46', 0.85, 0, 0, SurfFlag.WET);
      for (const [lx, lz] of [[-0.9, -0.9], [0.9, -0.9], [0.9, 0.9], [-0.9, 0.9]] as const) b.boxOn(x + lx, roofY, z + lz, 0.15, 2.2, 0.15);
      b.cylinder(x, roofY + 2.2, z, 1.25, 1.25, 2.4, 14, false);
      b.surface('#5B4535', 0.9, 0, 0, SurfFlag.WET);
      b.cylinder(x, roofY + 4.6, z, 1.3, 0.1, 0.8, 14, true);
    } else {
      b.surface('#E8E8EA', 0.4, 0.3, 0, SurfFlag.WET);
      b.sphere(x, roofY + 1.0, z, 0.55, 10, 6, 0.35);
      b.boxOn(x, roofY, z, 0.12, 0.9, 0.12);
    }
  }
}

/** Striped canvas awning over a span of the front wall (local frame, front at z = 0). */
export function awning(b: MeshBuilder, x0: number, x1: number, y: number, depth: number, drop: number, color: string): void {
  b.surface(color, 0.9, 0, 0, SurfFlag.WET).windows(0.6, 1, WinStyle.STRIPES, 1);
  const len = x1 - x0;
  // Sloped canopy from the wall out and down.
  b.quad([x1, y, 0], [x0, y, 0], [x0, y - drop, -depth], [x1, y - drop, -depth], [0, 0, len, Math.hypot(depth, drop)]);
  b.quad([x1, y - drop, -depth], [x0, y - drop, -depth], [x0, y, 0], [x1, y, 0], [0, 0, len, Math.hypot(depth, drop)]);
  // Valance.
  b.quad([x0, y - drop, -depth], [x1, y - drop, -depth], [x1, y - drop - 0.35, -depth], [x0, y - drop - 0.35, -depth], [0, 0, len, 0.35]);
  b.noWindows();
}

/** World-space position of a local point under the builder's current transform. */
export function toWorld(b: MeshBuilder, x: number, y: number, z: number): Vector3 {
  return new Vector3(x, y, z).applyMatrix4(b.matrix);
}

/** A piece of signage for the sign system to render. Positions are world space. */
export interface SignRequest {
  readonly text: string;
  readonly kind: 'neon' | 'painted' | 'blade' | 'billboard' | 'marquee';
  /** Font family key (see SignAtlas). */
  readonly font: string;
  /** sRGB hex for the main colour; neon uses it for the tube. */
  readonly color: string;
  readonly accent: string;
  readonly position: Vector3;
  /** Yaw so the sign's front faces −Z rotated by this angle. */
  readonly yaw: number;
  readonly width: number;
  readonly height: number;
  /** Stack letters vertically (blade signs). */
  readonly vertical?: boolean;
  readonly seed: number;
}
