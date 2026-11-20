import { BufferAttribute, BufferGeometry, Color, Matrix3, Matrix4, Vector3, type ColorRepresentation } from 'three';

/** Growable typed array; avoids millions of boxed numbers during world generation. */
class F32 {
  data: Float32Array;
  length = 0;
  constructor(capacity = 1024) {
    this.data = new Float32Array(capacity);
  }
  reserve(n: number): void {
    if (this.length + n <= this.data.length) return;
    let cap = this.data.length * 2;
    while (cap < this.length + n) cap *= 2;
    const next = new Float32Array(cap);
    next.set(this.data.subarray(0, this.length));
    this.data = next;
  }
  push1(a: number): void {
    this.reserve(1);
    this.data[this.length++] = a;
  }
  push2(a: number, b: number): void {
    this.reserve(2);
    const d = this.data;
    d[this.length++] = a;
    d[this.length++] = b;
  }
  push3(a: number, b: number, c: number): void {
    this.reserve(3);
    const d = this.data;
    d[this.length++] = a;
    d[this.length++] = b;
    d[this.length++] = c;
  }
  push4(a: number, b: number, c: number, e: number): void {
    this.reserve(4);
    const d = this.data;
    d[this.length++] = a;
    d[this.length++] = b;
    d[this.length++] = c;
    d[this.length++] = e;
  }
  view(): Float32Array {
    return this.data.slice(0, this.length);
  }
}

class U32 {
  data: Uint32Array;
  length = 0;
  constructor(capacity = 1024) {
    this.data = new Uint32Array(capacity);
  }
  push3(a: number, b: number, c: number): void {
    if (this.length + 3 > this.data.length) {
      const next = new Uint32Array(this.data.length * 2);
      next.set(this.data);
      this.data = next;
    }
    const d = this.data;
    d[this.length++] = a;
    d[this.length++] = b;
    d[this.length++] = c;
  }
}

/** Surface flags packed into `surf.w` (sum of bits, stored as a float). */
export const SurfFlag = {
  /** Emissive only at night (signs, lit windows, lamp heads). */
  NIGHT: 1,
  /** Flickering neon (shader adds a per-object flicker). */
  FLICKER: 2,
  /** Glass: forces low roughness and env reflections. */
  GLASS: 4,
  /** Receives rain wetness. */
  WET: 8,
} as const;

/** Window styles understood by the facade shader (`win.z`). */
export const WinStyle = {
  NONE: 0,
  PUNCHED: 1, // individual windows with sills
  BAND: 2, // horizontal ribbon windows (Streamline)
  ARCHED: 3, // round-topped (Mediterranean)
  CURTAIN: 4, // glass tower curtain wall with mullions
  STOREFRONT: 5, // tall ground-floor glass with transom
  MOTEL: 6, // door + window pairs
  PORTHOLE: 7, // round (Deco accents)
  SHUTTERED: 8, // with louvered shutters (bungalows)
  CORRUGATED: 9, // no windows: corrugated metal ribs
  // Ground and roof patterns (uber material, metre UVs).
  CONCRETE: 20,
  PAVERS: 21,
  BRICK: 22,
  DECK: 23,
  PARKING: 24,
  POOL: 25,
  LAWN: 26,
  PLAIN: 27,
  BARREL_TILE: 28,
  SHINGLE: 29,
  GRAVEL: 30,
  METAL_ROOF: 31,
  STRIPES: 32,
} as const;

const _v = new Vector3();
const _n = new Vector3();
const _a = new Vector3();
const _b = new Vector3();
const _c = new Vector3();
const _d = new Vector3();
const _e1 = new Vector3();
const _e2 = new Vector3();

export type V3 = readonly [number, number, number];

/**
 * Builds one merged `BufferGeometry` from many primitives. Each vertex carries position, normal,
 * linear colour, metre-scale UVs and a `surf` attribute (roughness, metalness, emissive, flags);
 * optionally `win` (facade window grid) and `sway` (wind weight). One material can then draw a whole
 * chunk of the city in a single call.
 */
export class MeshBuilder {
  private readonly pos = new F32(4096);
  private readonly nrm = new F32(4096);
  private readonly col = new F32(4096);
  private readonly uvs = new F32(2048);
  private readonly surfA = new F32(4096);
  private readonly winA = new F32(16);
  private readonly swayA = new F32(16);
  private readonly idx = new U32(4096);
  private vertexCount = 0;
  private useWin = false;
  private useSway = false;

  /** Current surface for subsequent vertices (linear RGB). */
  readonly color = new Color(1, 1, 1);
  rough = 0.8;
  metal = 0;
  emissive = 0;
  flags = 0;
  /** Current window grid: [cellW, cellH, style, seed]. */
  readonly winParams: [number, number, number, number] = [0, 0, 0, 0];
  sway = 0;
  /** Transform applied to everything added. */
  readonly matrix = new Matrix4();
  private readonly normalMatrix = new Matrix3();
  private readonly stack: Matrix4[] = [];

  constructor(options: { windows?: boolean; sway?: boolean } = {}) {
    this.useWin = options.windows ?? false;
    this.useSway = options.sway ?? false;
  }

  get vertices(): number {
    return this.vertexCount;
  }

  get triangles(): number {
    return this.idx.length / 3;
  }

  // ── state ────────────────────────────────────────────────────────────────

  /** Set the surface. Colours are sRGB in, stored linear. */
  surface(color: ColorRepresentation, rough = 0.8, metal = 0, emissive = 0, flags = 0): this {
    this.color.set(color);
    this.rough = rough;
    this.metal = metal;
    this.emissive = emissive;
    this.flags = flags;
    return this;
  }

  /** Surface from an already-linear colour (no conversion). */
  surfaceLinear(color: Color, rough = 0.8, metal = 0, emissive = 0, flags = 0): this {
    this.color.copy(color);
    this.rough = rough;
    this.metal = metal;
    this.emissive = emissive;
    this.flags = flags;
    return this;
  }

  windows(cellW: number, cellH: number, style: number, seed: number): this {
    this.winParams[0] = cellW;
    this.winParams[1] = cellH;
    this.winParams[2] = style;
    this.winParams[3] = seed;
    return this;
  }

  noWindows(): this {
    this.winParams[0] = 0;
    this.winParams[1] = 0;
    this.winParams[2] = 0;
    return this;
  }

  push(m?: Matrix4): this {
    this.stack.push(this.matrix.clone());
    if (m) this.matrix.multiply(m);
    this.normalMatrix.getNormalMatrix(this.matrix);
    return this;
  }

  pop(): this {
    const m = this.stack.pop();
    if (m) this.matrix.copy(m);
    this.normalMatrix.getNormalMatrix(this.matrix);
    return this;
  }

  /** Translate + rotate about Y + uniform/non-uniform scale, pushed onto the stack. */
  pushTRS(x: number, y: number, z: number, yaw = 0, sx = 1, sy = sx, sz = sx): this {
    const m = new Matrix4().makeRotationY(yaw).scale(_v.set(sx, sy, sz)).setPosition(x, y, z);
    return this.push(m);
  }

  // ── raw vertices ─────────────────────────────────────────────────────────

  vertex(x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, v: number): number {
    _v.set(x, y, z).applyMatrix4(this.matrix);
    _n.set(nx, ny, nz).applyMatrix3(this.normalMatrix).normalize();
    this.pos.push3(_v.x, _v.y, _v.z);
    this.nrm.push3(_n.x, _n.y, _n.z);
    this.col.push3(this.color.r, this.color.g, this.color.b);
    this.uvs.push2(u, v);
    this.surfA.push4(this.rough, this.metal, this.emissive, this.flags);
    if (this.useWin) this.winA.push4(this.winParams[0], this.winParams[1], this.winParams[2], this.winParams[3]);
    if (this.useSway) this.swayA.push1(this.sway);
    return this.vertexCount++;
  }

  /** Override the colour of the most recent vertex (gradients, ambient occlusion baking). */
  tintLast(r: number, g: number, b: number): void {
    const d = this.col.data;
    const i = this.col.length - 3;
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
  }

  /** Set the sway weight of the most recent vertex. */
  swayLast(w: number): void {
    if (this.useSway) this.swayA.data[this.swayA.length - 1] = w;
  }

  triangle(a: number, b: number, c: number): void {
    this.idx.push3(a, b, c);
  }

  /** Two triangles a-b-c, a-c-d (counter-clockwise when viewed from the front). */
  quadIdx(a: number, b: number, c: number, d: number): void {
    this.idx.push3(a, b, c);
    this.idx.push3(a, c, d);
  }

  // ── primitives ───────────────────────────────────────────────────────────

  /**
   * Flat quad from four corners in counter-clockwise order (seen from the front). UVs default to
   * metres along the first edge (u) and the last edge (v), which suits walls and slabs.
   */
  quad(p0: V3, p1: V3, p2: V3, p3: V3, uv?: readonly [number, number, number, number]): void {
    _a.set(p0[0], p0[1], p0[2]);
    _b.set(p1[0], p1[1], p1[2]);
    _c.set(p2[0], p2[1], p2[2]);
    _d.set(p3[0], p3[1], p3[2]);
    _e1.subVectors(_b, _a);
    _e2.subVectors(_d, _a);
    const n = _n.crossVectors(_e1, _e2).normalize();
    const nx = n.x, ny = n.y, nz = n.z;
    const [u0, v0, u1, v1] = uv ?? [0, 0, _e1.length(), _e2.length()];
    const i0 = this.vertex(p0[0], p0[1], p0[2], nx, ny, nz, u0, v0);
    const i1 = this.vertex(p1[0], p1[1], p1[2], nx, ny, nz, u1, v0);
    const i2 = this.vertex(p2[0], p2[1], p2[2], nx, ny, nz, u1, v1);
    const i3 = this.vertex(p3[0], p3[1], p3[2], nx, ny, nz, u0, v1);
    this.quadIdx(i0, i1, i2, i3);
  }

  /**
   * Vertical wall from (x0,z0) to (x1,z1), bottom y0 to top y1, facing to the right of the
   * direction of travel (outward for counter-clockwise footprints seen from above with +Z south).
   * UVs: u = metres along the wall starting at `u0`, v = metres above `vBase`.
   */
  wall(x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, u0 = 0, vBase = 0): void {
    const len = Math.hypot(x1 - x0, z1 - z0);
    this.quad([x0, y0, z0], [x1, y0, z1], [x1, y1, z1], [x0, y1, z0], [u0, y0 - vBase, u0 + len, y1 - vBase]);
  }

  /** Axis-aligned box centred at (cx, cy, cz). `faces` bitmask: 1 +x, 2 −x, 4 +y, 8 −y, 16 +z, 32 −z. */
  box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, faces = 63): void {
    const x0 = cx - sx / 2, x1 = cx + sx / 2;
    const y0 = cy - sy / 2, y1 = cy + sy / 2;
    const z0 = cz - sz / 2, z1 = cz + sz / 2;
    if (faces & 16) this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]);
    if (faces & 32) this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]);
    if (faces & 1) this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]);
    if (faces & 2) this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]);
    if (faces & 4) this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [x0, z1, x1, z0]);
    if (faces & 8) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]);
  }

  /** Box with its base at y0 (convenient for props standing on the ground). */
  boxOn(cx: number, y0: number, cz: number, sx: number, sy: number, sz: number, faces = 63): void {
    this.box(cx, y0 + sy / 2, cz, sx, sy, sz, faces);
  }

  /**
   * Cylinder or cone along Y from y0 to y1. Smooth sides; optional caps. `radial` segments.
   */
  cylinder(cx: number, y0: number, cz: number, r0: number, r1: number, height: number, radial = 12, caps = true, smooth = true): void {
    const y1 = y0 + height;
    const slope = (r0 - r1) / height;
    const ny = slope / Math.hypot(1, slope);
    const nr = 1 / Math.hypot(1, slope);
    const circ = Math.PI * 2 * Math.max(r0, r1);
    if (smooth) {
      const base = this.vertexCount;
      for (let i = 0; i <= radial; i++) {
        const a = (i / radial) * Math.PI * 2;
        const c = Math.cos(a), s = Math.sin(a);
        const u = (i / radial) * circ;
        this.vertex(cx + c * r0, y0, cz + s * r0, c * nr, ny, s * nr, u, 0);
        this.vertex(cx + c * r1, y1, cz + s * r1, c * nr, ny, s * nr, u, height);
      }
      for (let i = 0; i < radial; i++) {
        const a = base + i * 2;
        this.quadIdx(a, a + 1, a + 3, a + 2);
      }
    } else {
      for (let i = 0; i < radial; i++) {
        const a0 = (i / radial) * Math.PI * 2;
        const a1 = ((i + 1) / radial) * Math.PI * 2;
        this.quad(
          [cx + Math.cos(a0) * r0, y0, cz + Math.sin(a0) * r0], [cx + Math.cos(a1) * r0, y0, cz + Math.sin(a1) * r0],
          [cx + Math.cos(a1) * r1, y1, cz + Math.sin(a1) * r1], [cx + Math.cos(a0) * r1, y1, cz + Math.sin(a0) * r1],
        );
      }
    }
    if (caps) {
      if (r1 > 0.001) this.disc(cx, y1, cz, r1, radial, 1);
      if (r0 > 0.001) this.disc(cx, y0, cz, r0, radial, -1);
    }
  }

  /** Horizontal disc facing up (dir 1) or down (dir −1). */
  disc(cx: number, y: number, cz: number, r: number, radial = 12, dir: 1 | -1 = 1): void {
    const centre = this.vertex(cx, y, cz, 0, dir, 0, cx, cz);
    const first = this.vertexCount;
    for (let i = 0; i <= radial; i++) {
      const a = (i / radial) * Math.PI * 2;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      this.vertex(x, y, z, 0, dir, 0, x, z);
    }
    for (let i = 0; i < radial; i++) {
      if (dir > 0) this.triangle(centre, first + i + 1, first + i);
      else this.triangle(centre, first + i, first + i + 1);
    }
  }

  /** UV sphere (smooth). */
  sphere(cx: number, cy: number, cz: number, r: number, widthSeg = 12, heightSeg = 8, sy = 1): void {
    const base = this.vertexCount;
    for (let j = 0; j <= heightSeg; j++) {
      const v = j / heightSeg;
      const phi = v * Math.PI;
      for (let i = 0; i <= widthSeg; i++) {
        const u = i / widthSeg;
        const th = u * Math.PI * 2;
        const nx = -Math.cos(th) * Math.sin(phi);
        const ny = Math.cos(phi);
        const nz = Math.sin(th) * Math.sin(phi);
        this.vertex(cx + nx * r, cy + ny * r * sy, cz + nz * r, nx, ny / Math.max(sy, 0.01), nz, u * Math.PI * 2 * r, v * Math.PI * r);
      }
    }
    for (let j = 0; j < heightSeg; j++) {
      for (let i = 0; i < widthSeg; i++) {
        const a = base + j * (widthSeg + 1) + i;
        const b = a + widthSeg + 1;
        if (j !== 0) this.triangle(a, b, a + 1);
        if (j !== heightSeg - 1) this.triangle(a + 1, b, b + 1);
      }
    }
  }

  /**
   * Extrude a simple polygon (x, z pairs, counter-clockwise seen from above with −Z up the page)
   * from y0 to y1, with walls and optional top/bottom caps. Wall UVs run in metres around the
   * perimeter so facade windows line up across corners.
   */
  extrude(poly: ReadonlyArray<readonly [number, number]>, y0: number, y1: number, opts: { top?: boolean; bottom?: boolean; walls?: boolean; vBase?: number } = {}): void {
    const n = poly.length;
    if (opts.walls ?? true) {
      let u = 0;
      for (let i = 0; i < n; i++) {
        const [ax, az] = poly[i]!;
        const [bx, bz] = poly[(i + 1) % n]!;
        this.wall(ax, az, bx, bz, y0, y1, u, opts.vBase ?? y0);
        u += Math.hypot(bx - ax, bz - az);
      }
    }
    if (opts.top ?? true) this.cap(poly, y1, 1);
    if (opts.bottom) this.cap(poly, y0, -1);
  }

  /** Fill a polygon horizontally (ear clipping; handles concave outlines). */
  cap(poly: ReadonlyArray<readonly [number, number]>, y: number, dir: 1 | -1 = 1): void {
    const base = this.vertexCount;
    for (const [x, z] of poly) this.vertex(x, y, z, 0, dir, 0, x, z);
    const tris = triangulate(poly);
    for (let i = 0; i < tris.length; i += 3) {
      // Footprints are counter-clockwise viewed from above (with +Z toward the viewer's bottom),
      // which is clockwise in the XZ plane's right-handed sense; flip as needed so caps face `dir`.
      if (dir > 0) this.triangle(base + tris[i]!, base + tris[i + 2]!, base + tris[i + 1]!);
      else this.triangle(base + tris[i]!, base + tris[i + 1]!, base + tris[i + 2]!);
    }
  }

  /**
   * Revolve a profile of (radius, y) points around Y. Good for planters, lamp heads, bollards,
   * palm trunks and Ferris-wheel hubs.
   */
  lathe(cx: number, cz: number, profile: ReadonlyArray<readonly [number, number]>, radial = 12): void {
    const base = this.vertexCount;
    const m = profile.length;
    let along = 0;
    const vAt: number[] = [0];
    for (let j = 1; j < m; j++) {
      along += Math.hypot(profile[j]![0] - profile[j - 1]![0], profile[j]![1] - profile[j - 1]![1]);
      vAt.push(along);
    }
    for (let i = 0; i <= radial; i++) {
      const a = (i / radial) * Math.PI * 2;
      const c = Math.cos(a), s = Math.sin(a);
      for (let j = 0; j < m; j++) {
        const [r, y] = profile[j]!;
        const p = profile[Math.max(0, j - 1)]!;
        const q = profile[Math.min(m - 1, j + 1)]!;
        // Normal perpendicular to the profile tangent.
        let tr = q[0] - p[0], ty = q[1] - p[1];
        const tl = Math.hypot(tr, ty) || 1;
        tr /= tl;
        ty /= tl;
        this.vertex(cx + c * r, y, cz + s * r, c * ty, -tr, s * ty, (i / radial) * Math.PI * 2 * Math.max(r, 0.05), vAt[j]!);
      }
    }
    for (let i = 0; i < radial; i++) {
      for (let j = 0; j < m - 1; j++) {
        const a = base + i * m + j;
        const b = base + (i + 1) * m + j;
        this.quadIdx(a, a + 1, b + 1, b);
      }
    }
  }

  /**
   * Tube along a path of points with per-point radius (smooth). Used for neon, railings, cables,
   * palm trunks and car pipes. Frames are propagated to avoid twisting.
   */
  tube(path: ReadonlyArray<Vector3>, radius: number | ((t: number) => number), radial = 8, swayFn?: (t: number) => number): void {
    const n = path.length;
    if (n < 2) return;
    const base = this.vertexCount;
    const t = new Vector3();
    const nrm = new Vector3();
    const bin = new Vector3();
    const prevT = new Vector3();
    let along = 0;
    for (let i = 0; i < n; i++) {
      const p = path[i]!;
      const a = path[Math.max(0, i - 1)]!;
      const b = path[Math.min(n - 1, i + 1)]!;
      t.subVectors(b, a).normalize();
      if (i === 0) {
        // Initial normal: any vector not parallel to the tangent.
        nrm.set(0, 1, 0);
        if (Math.abs(t.y) > 0.9) nrm.set(1, 0, 0);
        bin.crossVectors(t, nrm).normalize();
        nrm.crossVectors(bin, t).normalize();
      } else {
        // Parallel transport: rotate the previous frame by the change in tangent.
        const axis = _e1.crossVectors(prevT, t);
        const s = axis.length();
        if (s > 1e-6) {
          axis.divideScalar(s);
          const ang = Math.asin(Math.min(1, s));
          nrm.applyAxisAngle(axis, ang);
          bin.applyAxisAngle(axis, ang);
        }
      }
      prevT.copy(t);
      if (i > 0) along += p.distanceTo(path[i - 1]!);
      const u = i / (n - 1);
      const r = typeof radius === 'number' ? radius : radius(u);
      if (swayFn) this.sway = swayFn(u);
      for (let k = 0; k <= radial; k++) {
        const ang = (k / radial) * Math.PI * 2;
        const cx = Math.cos(ang), sx = Math.sin(ang);
        _n.set(nrm.x * cx + bin.x * sx, nrm.y * cx + bin.y * sx, nrm.z * cx + bin.z * sx);
        this.vertex(p.x + _n.x * r, p.y + _n.y * r, p.z + _n.z * r, _n.x, _n.y, _n.z, (k / radial) * Math.PI * 2 * Math.max(r, 0.02), along);
      }
    }
    for (let i = 0; i < n - 1; i++) {
      for (let k = 0; k < radial; k++) {
        const a = base + i * (radial + 1) + k;
        const b = a + radial + 1;
        this.quadIdx(a, a + 1, b + 1, b);
      }
    }
  }

  /** Merge an existing indexed or non-indexed geometry with the current surface and transform. */
  geometry(geo: BufferGeometry): void {
    const p = geo.getAttribute('position');
    const nm = geo.getAttribute('normal');
    const uv = geo.getAttribute('uv');
    const base = this.vertexCount;
    for (let i = 0; i < p.count; i++) {
      this.vertex(p.getX(i), p.getY(i), p.getZ(i), nm ? nm.getX(i) : 0, nm ? nm.getY(i) : 1, nm ? nm.getZ(i) : 0, uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
    }
    const index = geo.getIndex();
    if (index) for (let i = 0; i < index.count; i += 3) this.triangle(base + index.getX(i), base + index.getX(i + 1), base + index.getX(i + 2));
    else for (let i = 0; i < p.count; i += 3) this.triangle(base + i, base + i + 1, base + i + 2);
  }

  /** Append everything from another builder (same attribute layout). */
  append(other: MeshBuilder): void {
    const base = this.vertexCount;
    const n = other.vertexCount;
    this.pos.reserve(n * 3);
    this.pos.data.set(other.pos.data.subarray(0, n * 3), this.pos.length);
    this.pos.length += n * 3;
    this.nrm.reserve(n * 3);
    this.nrm.data.set(other.nrm.data.subarray(0, n * 3), this.nrm.length);
    this.nrm.length += n * 3;
    this.col.reserve(n * 3);
    this.col.data.set(other.col.data.subarray(0, n * 3), this.col.length);
    this.col.length += n * 3;
    this.uvs.reserve(n * 2);
    this.uvs.data.set(other.uvs.data.subarray(0, n * 2), this.uvs.length);
    this.uvs.length += n * 2;
    this.surfA.reserve(n * 4);
    this.surfA.data.set(other.surfA.data.subarray(0, n * 4), this.surfA.length);
    this.surfA.length += n * 4;
    if (this.useWin) {
      if (other.useWin) {
        this.winA.reserve(n * 4);
        this.winA.data.set(other.winA.data.subarray(0, n * 4), this.winA.length);
        this.winA.length += n * 4;
      } else for (let i = 0; i < n; i++) this.winA.push4(0, 0, 0, 0);
    }
    if (this.useSway) {
      if (other.useSway) {
        this.swayA.reserve(n);
        this.swayA.data.set(other.swayA.data.subarray(0, n), this.swayA.length);
        this.swayA.length += n;
      } else for (let i = 0; i < n; i++) this.swayA.push1(0);
    }
    const oi = other.idx;
    for (let i = 0; i < oi.length; i += 3) this.idx.push3(base + oi.data[i]!, base + oi.data[i + 1]!, base + oi.data[i + 2]!);
    this.vertexCount += n;
  }

  isEmpty(): boolean {
    return this.vertexCount === 0;
  }

  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(this.pos.view(), 3));
    g.setAttribute('normal', new BufferAttribute(this.nrm.view(), 3));
    g.setAttribute('color', new BufferAttribute(this.col.view(), 3));
    g.setAttribute('uv', new BufferAttribute(this.uvs.view(), 2));
    g.setAttribute('surf', new BufferAttribute(this.surfA.view(), 4));
    if (this.useWin) g.setAttribute('win', new BufferAttribute(this.winA.view(), 4));
    if (this.useSway) g.setAttribute('sway', new BufferAttribute(this.swayA.view(), 1));
    const indices = this.idx.data.slice(0, this.idx.length);
    g.setIndex(new BufferAttribute(this.vertexCount > 65535 ? indices : Uint16Array.from(indices), 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

/**
 * Ear-clipping triangulation for a simple polygon given as (x, z) pairs. Returns vertex indices.
 * Robust enough for building footprints and road junction fills.
 */
export function triangulate(poly: ReadonlyArray<readonly [number, number]>): number[] {
  const n = poly.length;
  if (n < 3) return [];
  // Signed area in the XZ plane decides winding.
  let area = 0;
  for (let i = 0; i < n; i++) {
    const [x0, z0] = poly[i]!;
    const [x1, z1] = poly[(i + 1) % n]!;
    area += x0 * z1 - x1 * z0;
  }
  const idx: number[] = [];
  for (let i = 0; i < n; i++) idx.push(i);
  if (area < 0) idx.reverse();
  const out: number[] = [];
  let guard = n * n;
  while (idx.length > 3 && guard-- > 0) {
    let clipped = false;
    for (let i = 0; i < idx.length; i++) {
      const ia = idx[(i + idx.length - 1) % idx.length]!;
      const ib = idx[i]!;
      const ic = idx[(i + 1) % idx.length]!;
      const [ax, az] = poly[ia]!;
      const [bx, bz] = poly[ib]!;
      const [cx, cz] = poly[ic]!;
      const cross = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
      if (cross <= 1e-9) continue; // reflex
      let inside = false;
      for (const j of idx) {
        if (j === ia || j === ib || j === ic) continue;
        const [px, pz] = poly[j]!;
        if (pointInTri(px, pz, ax, az, bx, bz, cx, cz)) {
          inside = true;
          break;
        }
      }
      if (inside) continue;
      out.push(ia, ib, ic);
      idx.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break; // degenerate input: fall back to a fan for the remainder
  }
  if (idx.length === 3) out.push(idx[0]!, idx[1]!, idx[2]!);
  else for (let i = 1; i < idx.length - 1; i++) out.push(idx[0]!, idx[i]!, idx[i + 1]!);
  return out;
}

function pointInTri(px: number, pz: number, ax: number, az: number, bx: number, bz: number, cx: number, cz: number): boolean {
  const d1 = (px - bx) * (az - bz) - (ax - bx) * (pz - bz);
  const d2 = (px - cx) * (bz - cz) - (bx - cx) * (pz - cz);
  const d3 = (px - ax) * (cz - az) - (cx - ax) * (pz - az);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}
