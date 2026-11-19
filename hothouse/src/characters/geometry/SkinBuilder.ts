import { BufferAttribute, BufferGeometry, Matrix4, Vector3 } from 'three';

/**
 * A small builder for skinned, procedurally shaped people. Parts are made of rings (superellipse
 * cross-sections) bridged into tubes, lathes and lat-long shells; every vertex carries its skin
 * weights and a `look` attribute (region, ambient occlusion, two free parameters) that the people
 * shader turns into skin, cloth, prints, hair and faces. Normals are smoothed per part.
 */

/** Per-vertex output of a paint callback. Reset to the builder's defaults before every call. */
export interface Paint {
  region: number;
  ao: number;
  extra: number;
  extra2: number;
  b0: number;
  w0: number;
  b1: number;
  w1: number;
  b2: number;
  w2: number;
}

/** Decide a vertex's region, occlusion and skin weights from its bind position and ring angle. */
export type Painter = (x: number, y: number, z: number, theta: number, out: Paint) => void;

class Grow {
  data: Float32Array;
  length = 0;
  constructor(cap: number) {
    this.data = new Float32Array(cap);
  }
  ensure(n: number): void {
    if (this.length + n <= this.data.length) return;
    let cap = this.data.length * 2;
    while (cap < this.length + n) cap *= 2;
    const next = new Float32Array(cap);
    next.set(this.data.subarray(0, this.length));
    this.data = next;
  }
}

class GrowU32 {
  data: Uint32Array;
  length = 0;
  constructor(cap: number) {
    this.data = new Uint32Array(cap);
  }
  ensure(n: number): void {
    if (this.length + n <= this.data.length) return;
    let cap = this.data.length * 2;
    while (cap < this.length + n) cap *= 2;
    const next = new Uint32Array(cap);
    next.set(this.data.subarray(0, this.length));
    this.data = next;
  }
}

/** A ring of vertices: start index and count (closed loop). */
export interface Ring {
  start: number;
  count: number;
  cx: number;
  cy: number;
  cz: number;
}

const _m = new Matrix4();
const _v = new Vector3();

export class SkinBuilder {
  private readonly pos = new Grow(12000);
  private readonly nrm = new Grow(12000);
  private readonly look = new Grow(16000);
  private readonly bi = new Grow(16000);
  private readonly bw = new Grow(16000);
  private readonly idx = new GrowU32(24000);
  private readonly paint: Paint = { region: 0, ao: 1, extra: 0, extra2: 0, b0: 0, w0: 1, b1: 0, w1: 0, b2: 0, w2: 0 };
  /** Defaults copied into `paint` before each painter call. */
  readonly base: Paint = { region: 0, ao: 1, extra: 0, extra2: 0, b0: 0, w0: 1, b1: 0, w1: 0, b2: 0, w2: 0 };
  /** Optional transform applied to every emitted position (null = identity). */
  private xf: Matrix4 | null = null;
  private partV = 0;
  private partI = 0;

  get vertexCount(): number {
    return this.pos.length / 3;
  }

  get indexCount(): number {
    return this.idx.length;
  }

  /** Set the default region and weights for a part (painters may still override per vertex). */
  set(region: number, b0: number, w0 = 1, b1 = 0, w1 = 0, b2 = 0, w2 = 0, ao = 1): this {
    const p = this.base;
    p.region = region;
    p.ao = ao;
    p.extra = 0;
    p.extra2 = 0;
    p.b0 = b0;
    p.w0 = w0;
    p.b1 = b1;
    p.w1 = w1;
    p.b2 = b2;
    p.w2 = w2;
    return this;
  }

  /** Transform subsequent vertices (null clears). */
  transform(m: Matrix4 | null): this {
    this.xf = m;
    return this;
  }

  /** Begin a part: normals are smoothed over each part separately. */
  begin(): this {
    this.partV = this.vertexCount;
    this.partI = this.idx.length;
    return this;
  }

  /** End a part: smooth its normals. */
  end(): this {
    this.smooth(this.partV, this.partI);
    return this;
  }

  /** Emit one vertex, painted at its (pre-transform) position. */
  vertex(x: number, y: number, z: number, theta: number, painter?: Painter): number {
    const p = this.paint;
    const b = this.base;
    p.region = b.region;
    p.ao = b.ao;
    p.extra = b.extra;
    p.extra2 = b.extra2;
    p.b0 = b.b0;
    p.w0 = b.w0;
    p.b1 = b.b1;
    p.w1 = b.w1;
    p.b2 = b.b2;
    p.w2 = b.w2;
    if (this.xf) {
      _v.set(x, y, z).applyMatrix4(this.xf);
      x = _v.x;
      y = _v.y;
      z = _v.z;
    }
    if (painter) painter(x, y, z, theta, p);
    const n = this.vertexCount;
    this.pos.ensure(3);
    this.nrm.ensure(3);
    this.look.ensure(4);
    this.bi.ensure(4);
    this.bw.ensure(4);
    let o = this.pos.length;
    this.pos.data[o] = x;
    this.pos.data[o + 1] = y;
    this.pos.data[o + 2] = z;
    this.pos.length += 3;
    this.nrm.length += 3;
    o = this.look.length;
    const L = this.look.data;
    L[o] = p.region;
    L[o + 1] = p.ao;
    L[o + 2] = p.extra;
    L[o + 3] = p.extra2;
    this.look.length += 4;
    const sum = p.w0 + p.w1 + p.w2 || 1;
    const I = this.bi.data, W = this.bw.data;
    I[o] = p.b0;
    I[o + 1] = p.b1;
    I[o + 2] = p.b2;
    I[o + 3] = 0;
    W[o] = p.w0 / sum;
    W[o + 1] = p.w1 / sum;
    W[o + 2] = p.w2 / sum;
    W[o + 3] = 0;
    this.bi.length += 4;
    this.bw.length += 4;
    return n;
  }

  tri(a: number, b: number, c: number): void {
    this.idx.ensure(3);
    const d = this.idx.data;
    const o = this.idx.length;
    d[o] = a;
    d[o + 1] = b;
    d[o + 2] = c;
    this.idx.length += 3;
  }

  /**
   * A closed superellipse ring around (cx, cy, cz) in the plane spanned by unit axes U and V.
   * `bump(theta)` scales the radius per angle (bulges, flats). θ = 0 lies on +U, π/2 on +V.
   */
  ring(
    cx: number, cy: number, cz: number,
    ux: number, uy: number, uz: number,
    vx: number, vy: number, vz: number,
    ru: number, rv: number, exponent: number, seg: number,
    painter?: Painter, bump?: (theta: number) => number, phase = 0,
  ): Ring {
    const start = this.vertexCount;
    const e = 2 / exponent;
    for (let i = 0; i < seg; i++) {
      const t = phase + (i / seg) * Math.PI * 2;
      const c = Math.cos(t), s = Math.sin(t);
      const k = bump ? bump(t) : 1;
      const a = Math.sign(c) * Math.abs(c) ** e * ru * k;
      const b = Math.sign(s) * Math.abs(s) ** e * rv * k;
      this.vertex(cx + ux * a + vx * b, cy + uy * a + vy * b, cz + uz * a + vz * b, t, painter);
    }
    return { start, count: seg, cx, cy, cz };
  }

  /** Horizontal ring (U = +X, V = +Z) at height y. θ = 0 is the right side, π/2 the back, 3π/2 the front. */
  hring(cx: number, y: number, cz: number, rx: number, rz: number, exponent: number, seg: number, painter?: Painter, bump?: (theta: number) => number): Ring {
    return this.ring(cx, y, cz, 1, 0, 0, 0, 0, 1, rx, rz, exponent, seg, painter, bump);
  }

  /**
   * Join two rings with the same vertex count. `outward` decides the winding: pass the sign of
   * dot(B − A, U × V) for the rings' axes so faces point away from the axis.
   */
  bridge(a: Ring, b: Ring, flip: boolean): void {
    const n = a.count;
    for (let i = 0; i < n; i++) {
      const i1 = (i + 1) % n;
      const a0 = a.start + i, a1 = a.start + i1, b0 = b.start + i, b1 = b.start + i1;
      if (flip) {
        this.tri(a0, a1, b1);
        this.tri(a0, b1, b0);
      } else {
        this.tri(a0, b1, a1);
        this.tri(a0, b0, b1);
      }
    }
  }

  /** Close a ring with a fan to an apex. `flip` as for `bridge` (apex plays the part of ring B). */
  cap(r: Ring, ax: number, ay: number, az: number, flip: boolean, painter?: Painter): void {
    const apex = this.vertex(ax, ay, az, 0, painter);
    const n = r.count;
    for (let i = 0; i < n; i++) {
      const i1 = (i + 1) % n;
      if (flip) this.tri(r.start + i, r.start + i1, apex);
      else this.tri(r.start + i, apex, r.start + i1);
    }
  }

  /**
   * Revolve a profile of [radius, height] pairs around a vertical axis through (cx, cy, cz).
   * Profiles run bottom → top for outward faces; a zero radius closes the end.
   */
  lathe(cx: number, cy: number, cz: number, profile: ReadonlyArray<readonly [number, number]>, seg: number, painter?: Painter, sx = 1, sz = 1): void {
    let prev: Ring | null = null;
    for (const [r, h] of profile) {
      const ring = this.ring(cx, cy + h, cz, 1, 0, 0, 0, 0, 1, Math.max(r, 1e-4) * sx, Math.max(r, 1e-4) * sz, 2, seg, painter);
      if (prev) this.bridge(prev, ring, h < prev.cy - cy);
      prev = ring;
    }
  }

  /** Lat-long ellipsoid. `shape(dx, dy, dz)` may return a radius multiplier for each direction. */
  ellipsoid(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, segU: number, segV: number, painter?: Painter, shape?: (dx: number, dy: number, dz: number) => number): void {
    const top = this.vertexCount;
    const s0 = shape ? shape(0, 1, 0) : 1;
    this.vertex(cx, cy + ry * s0, cz, 0, painter);
    const rings: number[] = [];
    for (let j = 1; j < segV; j++) {
      const phi = (j / segV) * Math.PI;
      const sy = Math.cos(phi), sr = Math.sin(phi);
      rings.push(this.vertexCount);
      for (let i = 0; i < segU; i++) {
        const t = (i / segU) * Math.PI * 2;
        const dx = Math.cos(t) * sr, dz = Math.sin(t) * sr;
        const k = shape ? shape(dx, sy, dz) : 1;
        this.vertex(cx + dx * rx * k, cy + sy * ry * k, cz + dz * rz * k, t, painter);
      }
    }
    const s1 = shape ? shape(0, -1, 0) : 1;
    const bottom = this.vertex(cx, cy - ry * s1, cz, Math.PI, painter);
    for (let i = 0; i < segU; i++) {
      const i1 = (i + 1) % segU;
      this.tri(top, rings[0]! + i1, rings[0]! + i);
    }
    for (let j = 0; j < rings.length - 1; j++) {
      const a = rings[j]!, b = rings[j + 1]!;
      for (let i = 0; i < segU; i++) {
        const i1 = (i + 1) % segU;
        this.tri(a + i, a + i1, b + i1);
        this.tri(a + i, b + i1, b + i);
      }
    }
    const last = rings[rings.length - 1]!;
    for (let i = 0; i < segU; i++) {
      const i1 = (i + 1) % segU;
      this.tri(last + i, last + i1, bottom);
    }
  }

  /**
   * A tube along a polyline with a radius per point (rounded caps at both ends). Rings are
   * oriented with a parallel-transport frame so twisting paths stay smooth.
   */
  tube(path: ReadonlyArray<readonly [number, number, number]>, radius: (t: number) => number, seg: number, painter?: Painter, flatten = 1): void {
    const n = path.length;
    if (n < 2) return;
    const dir = new Vector3(), u = new Vector3(), v = new Vector3(), prevDir = new Vector3();
    const tangentAt = (i: number, out: Vector3) => {
      const a = path[Math.max(0, i - 1)]!, b = path[Math.min(n - 1, i + 1)]!;
      return out.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
    };
    tangentAt(0, dir);
    u.set(0, 1, 0);
    if (Math.abs(dir.dot(u)) > 0.9) u.set(1, 0, 0);
    u.cross(dir).normalize();
    v.copy(dir).cross(u).normalize();
    const rings: Ring[] = [];
    for (let i = 0; i < n; i++) {
      prevDir.copy(dir);
      tangentAt(i, dir);
      // Parallel transport: rotate the frame by the change in direction.
      const axis = _v.copy(prevDir).cross(dir);
      const s = axis.length();
      if (s > 1e-6) {
        const ang = Math.atan2(s, prevDir.dot(dir));
        axis.divideScalar(s);
        _m.makeRotationAxis(axis, ang);
        u.applyMatrix4(_m).normalize();
        v.applyMatrix4(_m).normalize();
      }
      const p = path[i]!;
      const r = radius(i / (n - 1));
      rings.push(this.ring(p[0], p[1], p[2], u.x, u.y, u.z, v.x, v.y, v.z, r, r * flatten, 2, seg, painter));
    }
    // Rings run along +dir and U × V = dir, so faces point outward with flip = true.
    for (let i = 0; i < n - 1; i++) this.bridge(rings[i]!, rings[i + 1]!, true);
    const a = path[0]!, b = path[n - 1]!;
    const d0 = tangentAt(0, prevDir);
    const r0 = radius(0) * 0.6;
    this.cap(rings[0]!, a[0] - d0.x * r0, a[1] - d0.y * r0, a[2] - d0.z * r0, false, painter);
    const d1 = tangentAt(n - 1, prevDir);
    const r1 = radius(1) * 0.6;
    this.cap(rings[n - 1]!, b[0] + d1.x * r1, b[1] + d1.y * r1, b[2] + d1.z * r1, true, painter);
  }

  /** Area-weighted smooth normals for vertices from `v0`, using triangles from index `i0`. */
  smooth(v0: number, i0: number): void {
    const P = this.pos.data, N = this.nrm.data, I = this.idx.data;
    const vEnd = this.vertexCount;
    for (let i = v0 * 3; i < vEnd * 3; i++) N[i] = 0;
    for (let t = i0; t < this.idx.length; t += 3) {
      const a = I[t]!, b = I[t + 1]!, c = I[t + 2]!;
      if (a < v0 || b < v0 || c < v0) continue;
      const ax = P[a * 3]!, ay = P[a * 3 + 1]!, az = P[a * 3 + 2]!;
      const e1x = P[b * 3]! - ax, e1y = P[b * 3 + 1]! - ay, e1z = P[b * 3 + 2]! - az;
      const e2x = P[c * 3]! - ax, e2y = P[c * 3 + 1]! - ay, e2z = P[c * 3 + 2]! - az;
      const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
      for (const k of [a, b, c]) {
        N[k * 3] += nx;
        N[k * 3 + 1] += ny;
        N[k * 3 + 2] += nz;
      }
    }
    for (let k = v0; k < vEnd; k++) {
      const x = N[k * 3]!, y = N[k * 3 + 1]!, z = N[k * 3 + 2]!;
      const l = Math.hypot(x, y, z);
      if (l > 1e-12) {
        N[k * 3] = x / l;
        N[k * 3 + 1] = y / l;
        N[k * 3 + 2] = z / l;
      } else {
        N[k * 3 + 1] = 1;
      }
    }
  }

  /** Minimum y and maximum y over vertices with a region in `regions` (or all when omitted). */
  bounds(regions?: ReadonlySet<number>): { minY: number; maxY: number } {
    let minY = Infinity, maxY = -Infinity;
    const P = this.pos.data, L = this.look.data;
    for (let k = 0; k < this.vertexCount; k++) {
      if (regions && !regions.has(L[k * 4]!)) continue;
      const y = P[k * 3 + 1]!;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    return { minY, maxY };
  }

  build(): BufferGeometry {
    const g = new BufferGeometry();
    const n = this.vertexCount;
    g.setAttribute('position', new BufferAttribute(this.pos.data.slice(0, n * 3), 3));
    g.setAttribute('normal', new BufferAttribute(this.nrm.data.slice(0, n * 3), 3));
    g.setAttribute('look', new BufferAttribute(this.look.data.slice(0, n * 4), 4));
    const si = new Uint16Array(n * 4);
    const src = this.bi.data;
    for (let i = 0; i < n * 4; i++) si[i] = src[i]!;
    g.setAttribute('skinIndex', new BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new BufferAttribute(this.bw.data.slice(0, n * 4), 4));
    const count = this.idx.length;
    const index = n < 65536 ? new Uint16Array(count) : new Uint32Array(count);
    const id = this.idx.data;
    for (let i = 0; i < count; i++) index[i] = id[i]!;
    g.setIndex(new BufferAttribute(index, 1));
    return g;
  }
}
