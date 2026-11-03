// GeoBuilder: accumulates triangles with per-vertex color, texture layer and emissive weight
// into a single BufferGeometry. Used for buildings, props, trees, everything static.
import * as THREE from 'three';

const _c = new THREE.Color();
const _v = new THREE.Vector3();
const _n = new THREE.Vector3();

export class GeoBuilder {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.uv = [];
    this.col = [];
    this.lay = [];
    this.emi = [];
    this.wind = null; // optional per-vertex sway weight
    this.matrix = new THREE.Matrix4();
    this.stack = [];
    this.layer = 0;
    this.emit = 0;
    this.sway = 0;
    this.color = new THREE.Color(1, 1, 1);
  }
  get count() { return this.pos.length / 3; }
  push() { this.stack.push(this.matrix.clone()); return this; }
  pop() { this.matrix.copy(this.stack.pop()); return this; }
  translate(x, y, z) { this.matrix.multiply(new THREE.Matrix4().makeTranslation(x, y, z)); return this; }
  rotateY(a) { this.matrix.multiply(new THREE.Matrix4().makeRotationY(a)); return this; }
  rotateX(a) { this.matrix.multiply(new THREE.Matrix4().makeRotationX(a)); return this; }
  rotateZ(a) { this.matrix.multiply(new THREE.Matrix4().makeRotationZ(a)); return this; }
  scale(x, y, z) { this.matrix.multiply(new THREE.Matrix4().makeScale(x, y ?? x, z ?? x)); return this; }
  setColor(hex) { if (typeof hex === 'number') this.color.setHex(hex); else this.color.copy(hex); return this; }
  setLayer(l) { this.layer = l; return this; }
  setEmit(e) { this.emit = e; return this; }
  setSway(s) { this.sway = s; if (s && !this.wind) this.wind = new Array(this.count).fill(0); return this; }

  vert(x, y, z, nx, ny, nz, u, v) {
    _v.set(x, y, z).applyMatrix4(this.matrix);
    if (!this._nmKey || !this._nmKey.equals(this.matrix)) {
      this._nmKey = (this._nmKey || new THREE.Matrix4()).copy(this.matrix);
      this._nm = (this._nm || new THREE.Matrix3()).getNormalMatrix(this.matrix);
    }
    _n.set(nx, ny, nz).applyMatrix3(this._nm).normalize();
    this.pos.push(_v.x, _v.y, _v.z);
    this.nor.push(_n.x, _n.y, _n.z);
    this.uv.push(u, v);
    this.col.push(this.color.r, this.color.g, this.color.b);
    this.lay.push(this.layer);
    this.emi.push(this.emit);
    if (this.wind) this.wind.push(this.sway * Math.max(0, y));
  }
  // quad p0..p3 counter-clockwise when seen from the front
  quad(p0, p1, p2, p3, uvs = null) {
    const ax = p1[0] - p0[0], ay = p1[1] - p0[1], az = p1[2] - p0[2];
    const bx = p3[0] - p0[0], by = p3[1] - p0[1], bz = p3[2] - p0[2];
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    const u = uvs || [[0, 0], [1, 0], [1, 1], [0, 1]];
    this.vert(...p0, nx, ny, nz, u[0][0], u[0][1]);
    this.vert(...p1, nx, ny, nz, u[1][0], u[1][1]);
    this.vert(...p2, nx, ny, nz, u[2][0], u[2][1]);
    this.vert(...p0, nx, ny, nz, u[0][0], u[0][1]);
    this.vert(...p2, nx, ny, nz, u[2][0], u[2][1]);
    this.vert(...p3, nx, ny, nz, u[3][0], u[3][1]);
  }
  tri(p0, p1, p2, uvs = null) {
    const ax = p1[0] - p0[0], ay = p1[1] - p0[1], az = p1[2] - p0[2];
    const bx = p2[0] - p0[0], by = p2[1] - p0[1], bz = p2[2] - p0[2];
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    const u = uvs || [[0, 0], [1, 0], [0.5, 1]];
    this.vert(...p0, nx, ny, nz, u[0][0], u[0][1]);
    this.vert(...p1, nx, ny, nz, u[1][0], u[1][1]);
    this.vert(...p2, nx, ny, nz, u[2][0], u[2][1]);
  }
  // Axis-aligned box (in current transform) centered at cx,cy,cz with full sizes sx,sy,sz.
  // uvScale: texture repeats per meter. faces: bitmask to skip (1 +x,2 -x,4 +y,8 -y,16 +z,32 -z)
  box(cx, cy, cz, sx, sy, sz, uvScale = 0.5, skip = 0) {
    const x0 = cx - sx / 2, x1 = cx + sx / 2, y0 = cy - sy / 2, y1 = cy + sy / 2, z0 = cz - sz / 2, z1 = cz + sz / 2;
    const k = uvScale;
    if (!(skip & 16)) this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [[x0 * k, y0 * k], [x1 * k, y0 * k], [x1 * k, y1 * k], [x0 * k, y1 * k]]);
    if (!(skip & 32)) this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [[-x1 * k, y0 * k], [-x0 * k, y0 * k], [-x0 * k, y1 * k], [-x1 * k, y1 * k]]);
    if (!(skip & 1)) this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [[-z1 * k, y0 * k], [-z0 * k, y0 * k], [-z0 * k, y1 * k], [-z1 * k, y1 * k]]);
    if (!(skip & 2)) this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [[z0 * k, y0 * k], [z1 * k, y0 * k], [z1 * k, y1 * k], [z0 * k, y1 * k]]);
    if (!(skip & 4)) this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [[x0 * k, -z1 * k], [x1 * k, -z1 * k], [x1 * k, -z0 * k], [x0 * k, -z0 * k]]);
    if (!(skip & 8)) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [[x0 * k, z0 * k], [x1 * k, z0 * k], [x1 * k, z1 * k], [x0 * k, z1 * k]]);
  }
  // Box between two points along local X (handy for beams/rails), thickness t, height h
  beam(x0, y0, z0, x1, y1, z1, t = 0.1, uvScale = 1) {
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
    const len = Math.hypot(dx, dy, dz);
    this.push();
    this.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    this.rotateY(Math.atan2(-dz, dx));
    this.rotateZ(Math.atan2(dy, Math.hypot(dx, dz)));
    this.box(0, 0, 0, len, t, t, uvScale);
    this.pop();
  }
  // Vertical cylinder (open or capped)
  cylinder(cx, cy, cz, rTop, rBot, h, seg = 8, uvScale = 0.5, caps = true, open = false) {
    const y0 = cy, y1 = cy + h;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      const u0 = (i / seg) * Math.PI * 2 * rBot * uvScale, u1 = ((i + 1) / seg) * Math.PI * 2 * rBot * uvScale;
      const ny = (rBot - rTop) / h;
      const p0 = [cx + c0 * rBot, y0, cz + s0 * rBot], p1 = [cx + c1 * rBot, y0, cz + s1 * rBot];
      const p2 = [cx + c1 * rTop, y1, cz + s1 * rTop], p3 = [cx + c0 * rTop, y1, cz + s0 * rTop];
      // smooth normals
      const n0 = [c0, ny, s0], n1 = [c1, ny, s1];
      const v0 = y0 * uvScale, v1 = y1 * uvScale;
      this.vertN(p0, n0, [u0, v0]); this.vertN(p2, n1, [u1, v1]); this.vertN(p1, n1, [u1, v0]);
      this.vertN(p0, n0, [u0, v0]); this.vertN(p3, n0, [u0, v1]); this.vertN(p2, n1, [u1, v1]);
      if (caps && !open && rTop > 0.001) this.tri([cx, y1, cz], p2, p3, [[0.5, 0.5], [c1 * 0.5 + 0.5, s1 * 0.5 + 0.5], [c0 * 0.5 + 0.5, s0 * 0.5 + 0.5]]);
      if (caps && !open) this.tri([cx, y0, cz], p0, p1);
    }
  }
  vertN(p, n, uv) { this.vert(p[0], p[1], p[2], n[0], n[1], n[2], uv[0], uv[1]); }
  // Displaced icosphere-ish blob for foliage, smooth shaded
  blob(cx, cy, cz, rx, ry, rz, detail = 1, jitter = 0.18, seed = 1) {
    const g = new THREE.IcosahedronGeometry(1, detail);
    const p = g.attributes.position;
    const idx = g.index ? g.index.array : null;
    const verts = [];
    let s = seed * 9301 + 49297;
    const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    const cache = new Map();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const key = `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
      let k = cache.get(key);
      if (k === undefined) { k = 1 + (rnd() - 0.5) * 2 * jitter; cache.set(key, k); }
      verts.push([x * k, y * k, z * k, x, y, z]);
    }
    const emitTri = (a, b, c) => {
      for (const v of [verts[a], verts[b], verts[c]]) {
        const shade = 0.72 + 0.28 * (v[4] * 0.5 + 0.5);
        const base = this.color.clone();
        this.color.multiplyScalar(shade);
        this.vert(cx + v[0] * rx, cy + v[1] * ry, cz + v[2] * rz, v[3], v[4], v[5], (v[0] * rx + v[2] * rz * 0.7) * 0.45, (v[1] * ry + v[2] * rz * 0.3) * 0.45);
        this.color.copy(base);
      }
    };
    if (idx) for (let i = 0; i < idx.length; i += 3) emitTri(idx[i], idx[i + 1], idx[i + 2]);
    else for (let i = 0; i < p.count; i += 3) emitTri(i, i + 1, i + 2);
    g.dispose();
  }
  // Generic: append an existing (non-indexed or indexed) geometry with current transform/color/layer
  addGeometry(geom, uvScale = 1) {
    const g = geom.index ? geom.toNonIndexed() : geom;
    const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      this.vert(p.getX(i), p.getY(i), p.getZ(i), n.getX(i), n.getY(i), n.getZ(i), uv ? uv.getX(i) * uvScale : 0, uv ? uv.getY(i) * uvScale : 0);
    }
    if (g !== geom) g.dispose();
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aLayer', new THREE.Float32BufferAttribute(this.lay, 1));
    g.setAttribute('aEmit', new THREE.Float32BufferAttribute(this.emi, 1));
    if (this.wind) g.setAttribute('aWind', new THREE.Float32BufferAttribute(this.wind, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
  isEmpty() { return this.pos.length === 0; }
}

export function hexColor(hex) { return _c.setHex(hex).clone(); }
