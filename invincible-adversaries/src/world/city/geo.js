import * as THREE from 'three';

/**
 * Accumulates triangles for one merged mesh: positions, normals, uvs, and an optional vec4 `aFac`
 * per vertex (facade style data). Quads and boxes are the building blocks of the whole city, so
 * each material ends up as a single draw call.
 */
export class GeoBuilder {
  constructor({ fac = false, col = false } = {}) {
    this.p = []; this.n = []; this.uv = []; this.fac = fac ? [] : null; this.col = col ? [] : null;
    this.curFac = [0, 0, 0, 0]; this.curCol = [1, 1, 1];
    this.xf = null;
  }
  /** positions and normals pass through Matrix4 m while it's set (null to stop): tilted wrecks */
  setXf(m) { this.xf = m; if (m) this._nm = new THREE.Matrix3().getNormalMatrix(m); return this; }
  get count() { return this.p.length / 3; }
  /** quad a-b-c-d (counter-clockwise seen from the front), uvs per corner */
  quad(a, b, c, d, uva = [0, 0], uvb = [1, 0], uvc = [1, 1], uvd = [0, 1], n = null) {
    const nn = n || faceNormal(a, b, c);
    this.tri(a, b, c, uva, uvb, uvc, nn);
    this.tri(a, c, d, uva, uvc, uvd, nn);
  }
  /** quad a-b-c-d facing `want` (flipped if the corners wind the other way); uvs per corner */
  face(want, a, b, c, d, uva = [0, 0], uvb = [1, 0], uvc = [1, 1], uvd = [0, 1]) {
    const n = faceNormal(a, b, c);
    if (n[0] * want[0] + n[1] * want[1] + n[2] * want[2] < 0) this.quad(d, c, b, a, uvd, uvc, uvb, uva, [-n[0], -n[1], -n[2]]);
    else this.quad(a, b, c, d, uva, uvb, uvc, uvd, n);
  }
  tri(a, b, c, ua, ub, uc, n = null) {
    const nn = n || faceNormal(a, b, c);
    this.tri3(a, b, c, ua, ub, uc, nn, nn, nn);
  }
  /** a triangle with a normal per corner */
  tri3(a, b, c, ua, ub, uc, na, nb, nc) {
    const e = this.xf && this.xf.elements, m = this.xf && this._nm.elements;
    for (const [v, u, nn] of [[a, ua, na], [b, ub, nb], [c, uc, nc]]) {
      let [x, y, z] = v, [nx, ny, nz] = nn;
      if (e) {
        [x, y, z] = [e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]];
        [nx, ny, nz] = [m[0] * nx + m[3] * ny + m[6] * nz, m[1] * nx + m[4] * ny + m[7] * nz, m[2] * nx + m[5] * ny + m[8] * nz];
        const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      }
      this.p.push(x, y, z); this.n.push(nx, ny, nz); this.uv.push(u[0], u[1]);
      if (this.fac) this.fac.push(...this.curFac);
      if (this.col) this.col.push(...this.curCol);
    }
  }
  /**
   * a wall rectangle in a vertical plane: from (x0, z0) to (x1, z1) at the base, y0..y1; uvs in
   * metres (u along the wall from u0, v = world height), facing to the right of the base line
   */
  wall(x0, z0, x1, z1, y0, y1, u0 = 0) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    this.quad([x0, y0, z0], [x1, y0, z1], [x1, y1, z1], [x0, y1, z0], [u0, y0], [u0 + len, y0], [u0 + len, y1], [u0, y1]);
  }
  /** axis-aligned box; faces: which of +x -x +y -y +z -z to emit (default all); uvs in metres */
  box(x0, y0, z0, x1, y1, z1, faces = 'xXyYzZ') {
    if (faces.includes('X')) this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [z1, y0], [z0, y0], [z0, y1], [z1, y1]); // +x
    if (faces.includes('x')) this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-z0, y0], [-z1, y0], [-z1, y1], [-z0, y1]); // -x
    if (faces.includes('Z')) this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [x0, y0], [x1, y0], [x1, y1], [x0, y1]); // +z
    if (faces.includes('z')) this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [-x1, y0], [-x0, y0], [-x0, y1], [-x1, y1]); // -z
    if (faces.includes('Y')) this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [x0, z1], [x1, z1], [x1, z0], [x0, z0]); // +y
    if (faces.includes('y')) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [x0, z0], [x1, z0], [x1, z1], [x0, z1]); // -y
  }
  /** a box turned by matrix m (THREE.Matrix4) about its own centre */
  boxM(m, sx, sy, sz) {
    const v = (x, y, z) => { const p = new THREE.Vector3(x * sx / 2, y * sy / 2, z * sz / 2).applyMatrix4(m); return [p.x, p.y, p.z]; };
    const c = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]].map((q) => v(...q));
    const F = [[4, 5, 6, 7, sx, sy], [1, 0, 3, 2, sx, sy], [5, 1, 2, 6, sz, sy], [0, 4, 7, 3, sz, sy], [7, 6, 2, 3, sx, sz], [0, 1, 5, 4, sx, sz]];
    for (const [a, b, cc, d, w, h] of F) this.quad(c[a], c[b], c[cc], c[d], [0, 0], [w, 0], [w, h], [0, h]);
  }
  /** vertical cylinder (or cone when r1 differs), centre x, z from y0 to y1 */
  cyl(x, z, r0, r1, y0, y1, seg = 12, caps = true) {
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      const u0 = a0 * r0, u1 = a1 * r0;
      const n0 = [c0, (r0 - r1) / (y1 - y0), s0], n1 = [c1, (r0 - r1) / (y1 - y0), s1];
      const A = [x + c0 * r0, y0, z + s0 * r0], B = [x + c1 * r0, y0, z + s1 * r0], C = [x + c1 * r1, y1, z + s1 * r1], D = [x + c0 * r1, y1, z + s0 * r1];
      // (smooth normals: per-vertex)
      const l0 = Math.hypot(...n0), l1 = Math.hypot(...n1), m0 = n0.map((q) => q / l0), m1 = n1.map((q) => q / l1);
      this.tri3(A, C, B, [u0, y0], [u1, y1], [u1, y0], m0, m1, m1);
      this.tri3(A, D, C, [u0, y0], [u0, y1], [u1, y1], m0, m0, m1);
      if (caps) {
        this.tri([x, y1, z], C, D, [0, 0], [0, 0], [0, 0], [0, 1, 0]);
        this.tri([x, y0, z], A, B, [0, 0], [0, 0], [0, 0], [0, -1, 0]);
      }
    }
  }
  /** a horizontal polygon (convex, counter-clockwise from above) at height y */
  cap(pts, y, up = true) {
    for (let i = 1; i < pts.length - 1; i++) {
      const a = [pts[0][0], y, pts[0][1]], b = [pts[i][0], y, pts[i][1]], c = [pts[i + 1][0], y, pts[i + 1][1]];
      if (up) this.tri(a, c, b, [a[0], a[2]], [c[0], c[2]], [b[0], b[2]], [0, 1, 0]);
      else this.tri(a, b, c, [a[0], a[2]], [b[0], b[2]], [c[0], c[2]], [0, -1, 0]);
    }
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    if (this.fac) g.setAttribute('aFac', new THREE.Float32BufferAttribute(this.fac, 4));
    if (this.col) g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}

function faceNormal(a, b, c) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz) || 1;
  return [nx / l, ny / l, nz / l];
}

/** seeded random numbers (mulberry32) so the city is the same every load */
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const hash2 = (x, z) => { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); };
