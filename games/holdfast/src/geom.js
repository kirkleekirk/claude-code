// GeoBuilder: accumulates quads/boxes/arbitrary geometry and produces merged
// BufferGeometries. Surfaces are looked up in the texture atlas, so every
// opaque surface lands in one bucket (one draw call); glass gets its own.
// UVs default to world-space metres divided by the surface's tile size, so
// adjacent pieces line up seamlessly.
import * as THREE from 'three';
import { surf } from './atlas.js';

const _c = new THREE.Color();
export function rgb(hex) {
  _c.set(hex);
  return [_c.r, _c.g, _c.b];
}
export function mulc(c, k) { return [c[0] * k, c[1] * k, c[2] * k]; }

const classOf = (key) => (key === 'glass' ? 'glass' : 'opaque');

export class GeoBuilder {
  constructor(origin = [0, 0, 0]) {
    this.buckets = new Map();
    this.ox = origin[0]; this.oy = origin[1]; this.oz = origin[2];
  }
  bucket(key) {
    const cls = classOf(key);
    let b = this.buckets.get(cls);
    if (!b) { b = { pos: [], nor: [], uv: [], col: [], surf: [], idx: [] }; this.buckets.set(cls, b); }
    return b;
  }
  // World-space UV (metres) for a point on a face with normal n.
  autoUV(p, n) {
    const x = p[0] + this.ox, y = p[1] + this.oy, z = p[2] + this.oz;
    const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
    if (ay >= ax && ay >= az) return n[1] > 0 ? [x, -z] : [x, z];
    if (az >= ax) return n[2] > 0 ? [x, y] : [-x, y];
    return n[0] > 0 ? [-z, y] : [z, y];
  }
  // a,b,c,d counter-clockwise seen from the front. color: [r,g,b] or array of 4.
  // uvs (optional) are in metres.
  quad(key, a, b, c, d, color, uvs = null, normal = null) {
    const B = this.bucket(key);
    const S = surf(key);
    // Newell's method (robust when a corner collapses)
    const P = [a, b, c, d];
    const nw = [0, 0, 0];
    for (let i = 0; i < 4; i++) {
      const p = P[i], q = P[(i + 1) % 4];
      nw[0] += (p[1] - q[1]) * (p[2] + q[2]);
      nw[1] += (p[2] - q[2]) * (p[0] + q[0]);
      nw[2] += (p[0] - q[0]) * (p[1] + q[1]);
    }
    let n = normal;
    if (!n) {
      const l = Math.hypot(nw[0], nw[1], nw[2]) || 1;
      n = [nw[0] / l, nw[1] / l, nw[2] / l];
    } else if (nw[0] * n[0] + nw[1] * n[1] + nw[2] * n[2] < 0) {
      // caller gave a facing direction: fix the winding to match it
      const t = b; b = d; d = t;
      if (Array.isArray(color[0])) color = [color[0], color[3], color[2], color[1]];
      if (uvs) uvs = [uvs[0], uvs[3], uvs[2], uvs[1]];
    }
    const base = B.pos.length / 3;
    const pts = [a, b, c, d];
    for (let i = 0; i < 4; i++) {
      const p = pts[i];
      B.pos.push(p[0], p[1], p[2]);
      B.nor.push(n[0], n[1], n[2]);
      const uv = uvs ? uvs[i] : this.autoUV(p, n);
      B.uv.push(uv[0] / S.tile[0], uv[1] / S.tile[1]);
      const cc = Array.isArray(color[0]) ? color[i] : color;
      B.col.push(cc[0], cc[1], cc[2]);
      B.surf.push(S.layer, S.rough, S.metal);
    }
    // choose the diagonal that avoids streaking dark vertex colours
    const lum = (i) => B.col[(base + i) * 3] + B.col[(base + i) * 3 + 1] + B.col[(base + i) * 3 + 2];
    if (lum(0) + lum(2) < lum(1) + lum(3) - 1e-4) B.idx.push(base, base + 1, base + 3, base + 1, base + 2, base + 3);
    else B.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  tri(key, a, b, c, color, uvs = null) {
    const B = this.bucket(key);
    const S = surf(key);
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    n = [n[0] / l, n[1] / l, n[2] / l];
    const base = B.pos.length / 3;
    const pts = [a, b, c];
    for (let i = 0; i < 3; i++) {
      const p = pts[i];
      B.pos.push(p[0], p[1], p[2]);
      B.nor.push(n[0], n[1], n[2]);
      const uv = uvs ? uvs[i] : this.autoUV(p, n);
      B.uv.push(uv[0] / S.tile[0], uv[1] / S.tile[1]);
      const cc = Array.isArray(color[0]) ? color[i] : color;
      B.col.push(cc[0], cc[1], cc[2]);
      B.surf.push(S.layer, S.rough, S.metal);
    }
    B.idx.push(base, base + 1, base + 2);
  }
  // Axis-aligned box. faces: object with px,nx,py,ny,pz,nz (default all true).
  // color: [r,g,b] or function(faceName, vertexPos) -> [r,g,b]
  box(key, x0, y0, z0, x1, y1, z1, color, faces = null, keys = null) {
    const f = faces || ALL;
    const col = (name, p) => (typeof color === 'function' ? color(name, p) : color);
    const k = (name) => (keys && keys[name]) || key;
    const q = (name, a, b, c, d) => {
      if (f[name] === false) return;
      this.quad(k(name), a, b, c, d, [col(name, a), col(name, b), col(name, c), col(name, d)]);
    };
    q('px', [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]);
    q('nx', [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]);
    q('pz', [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]);
    q('nz', [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]);
    q('py', [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]);
    q('ny', [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]);
  }
  // Append an existing geometry transformed by a matrix.
  geometry(key, geo, matrix, color, uvScale = 1) {
    const B = this.bucket(key);
    const S = surf(key);
    const pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv;
    const colAttr = geo.attributes.color;
    const nm = new THREE.Matrix3().getNormalMatrix(matrix);
    const v = new THREE.Vector3(), nn = new THREE.Vector3();
    const base = B.pos.length / 3;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(matrix);
      B.pos.push(v.x, v.y, v.z);
      if (nor) { nn.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize(); B.nor.push(nn.x, nn.y, nn.z); }
      else B.nor.push(0, 1, 0);
      if (uv) B.uv.push(uv.getX(i) * uvScale, uv.getY(i) * uvScale); else B.uv.push(0, 0);
      if (colAttr) B.col.push(colAttr.getX(i) * color[0], colAttr.getY(i) * color[1], colAttr.getZ(i) * color[2]);
      else B.col.push(color[0], color[1], color[2]);
      B.surf.push(S.layer, S.rough, S.metal);
    }
    if (geo.index) {
      for (let i = 0; i < geo.index.count; i++) B.idx.push(base + geo.index.getX(i));
    } else {
      for (let i = 0; i < pos.count; i++) B.idx.push(base + i);
    }
  }
  isEmpty() { for (const b of this.buckets.values()) if (b.idx.length) return false; return true; }
  // Returns Map class -> BufferGeometry ('opaque' | 'glass')
  build() {
    const out = new Map();
    for (const [key, b] of this.buckets) {
      if (!b.idx.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
      g.setAttribute('surf', new THREE.Float32BufferAttribute(b.surf, 3));
      const n = b.pos.length / 3;
      g.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(b.idx, 1) : new THREE.Uint16BufferAttribute(b.idx, 1));
      g.computeBoundingSphere();
      g.computeBoundingBox();
      out.set(key, g);
    }
    return out;
  }
}
const ALL = { px: true, nx: true, py: true, ny: true, pz: true, nz: true };
