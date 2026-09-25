import * as THREE from 'three';

// Collects static geometry (boxes, cylinders, arbitrary geometries) with vertex
// colors and merges it into one mesh, so a whole city renders in a few draw calls.

const _c = new THREE.Color();
const _m = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _nm = new THREE.Matrix3();

export class Batcher {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.col = [];
    this.uv = [];
    this.idx = [];
    this.vcount = 0;
  }

  _color(hex, jitter) {
    _c.setHex(hex);
    if (jitter) {
      const k = 1 + (Math.random() * 2 - 1) * jitter;
      _c.r *= k; _c.g *= k; _c.b *= k;
    }
    return _c;
  }

  // Axis-aligned (optionally Y-rotated) box. ao darkens the lower vertices.
  box(cx, cy, cz, sx, sy, sz, hex, { rotY = 0, jitter = 0.06, ao = sy > 1.2 ? 0.72 : 1, uvs = 0.5, top = null } = {}) {
    const col = this._color(hex, jitter);
    const r = col.r, g = col.g, b = col.b;
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    const cr = Math.cos(rotY), sr = Math.sin(rotY);
    // face: normal, u axis, v axis (local), dims
    const faces = [
      [1, 0, 0, 0, 0, -1, 0, 1, 0, hx, hz, hy],
      [-1, 0, 0, 0, 0, 1, 0, 1, 0, hx, hz, hy],
      [0, 1, 0, 1, 0, 0, 0, 0, -1, hy, hx, hz],
      [0, -1, 0, 1, 0, 0, 0, 0, 1, hy, hx, hz],
      [0, 0, 1, 1, 0, 0, 0, 1, 0, hz, hx, hy],
      [0, 0, -1, -1, 0, 0, 0, 1, 0, hz, hx, hy],
    ];
    const topCol = top != null ? new THREE.Color().setHex(top) : null;
    for (let f = 0; f < 6; f++) {
      const F = faces[f];
      const nx = F[0], ny = F[1], nz = F[2];
      const ux = F[3], uy = F[4], uz = F[5];
      const vx = F[6], vy = F[7], vz = F[8];
      const d = F[9], ue = F[10], ve = F[11];
      const base = this.vcount;
      for (let k = 0; k < 4; k++) {
        const su = k === 0 || k === 3 ? -1 : 1;
        const sv = k < 2 ? -1 : 1;
        let lx = nx * d + ux * ue * su + vx * ve * sv;
        const ly = ny * d + uy * ue * su + vy * ve * sv;
        let lz = nz * d + uz * ue * su + vz * ve * sv;
        const wx = lx * cr + lz * sr;
        const wz = -lx * sr + lz * cr;
        this.pos.push(cx + wx, cy + ly, cz + wz);
        this.nor.push(nx * cr + nz * sr, ny, -nx * sr + nz * cr);
        const shade = ly < 0 && ny === 0 ? ao : 1;
        if (f === 2 && topCol) this.col.push(topCol.r, topCol.g, topCol.b);
        else this.col.push(r * shade, g * shade, b * shade);
        // world-scaled UVs so the grime texture tiles evenly
        this.uv.push((su * ue + ue) * uvs + cx * 0.13, (sv * ve + ve) * uvs + cy * 0.21 + cz * 0.07);
      }
      this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      this.vcount += 4;
    }
  }

  // Append any BufferGeometry transformed by a matrix, tinted with one color.
  geo(geometry, matrix, hex, jitter = 0.05) {
    const col = this._color(hex, jitter);
    const g = geometry.index ? geometry : geometry;
    const p = g.attributes.position;
    const n = g.attributes.normal;
    const uv = g.attributes.uv;
    _nm.getNormalMatrix(matrix);
    const base = this.vcount;
    for (let i = 0; i < p.count; i++) {
      _v.fromBufferAttribute(p, i).applyMatrix4(matrix);
      this.pos.push(_v.x, _v.y, _v.z);
      if (n) {
        _n.fromBufferAttribute(n, i).applyMatrix3(_nm).normalize();
        this.nor.push(_n.x, _n.y, _n.z);
      } else this.nor.push(0, 1, 0);
      this.col.push(col.r, col.g, col.b);
      if (uv) this.uv.push(uv.getX(i), uv.getY(i));
      else this.uv.push(0, 0);
    }
    if (g.index) {
      const ix = g.index.array;
      for (let i = 0; i < ix.length; i++) this.idx.push(base + ix[i]);
    } else {
      for (let i = 0; i < p.count; i++) this.idx.push(base + i);
    }
    this.vcount += p.count;
  }

  cylinder(cx, cy, cz, rTop, rBot, h, hex, segs = 8, opts = {}) {
    const key = `c${rTop}_${rBot}_${h}_${segs}`;
    const g = Batcher._cache[key] || (Batcher._cache[key] = new THREE.CylinderGeometry(rTop, rBot, h, segs, 1));
    _m.makeRotationFromEuler(new THREE.Euler(opts.rx || 0, opts.ry || 0, opts.rz || 0));
    _m.setPosition(cx, cy, cz);
    this.geo(g, _m, hex, opts.jitter ?? 0.05);
  }

  ico(cx, cy, cz, r, hex, sy = 1, detail = 0) {
    const key = `i${detail}`;
    const g = Batcher._cache[key] || (Batcher._cache[key] = new THREE.IcosahedronGeometry(1, detail));
    _m.makeScale(r, r * sy, r);
    _m.setPosition(cx, cy, cz);
    this.geo(g, _m, hex, 0.08);
  }

  cone(cx, cy, cz, r, h, hex, segs = 7) {
    const key = `k${segs}`;
    const g = Batcher._cache[key] || (Batcher._cache[key] = new THREE.ConeGeometry(1, 1, segs, 1));
    _m.makeScale(r, h, r);
    _m.setPosition(cx, cy, cz);
    this.geo(g, _m, hex, 0.06);
  }

  build(material) {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geom.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    geom.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    geom.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    geom.setIndex(this.vcount > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    geom.computeBoundingSphere();
    geom.computeBoundingBox();
    const mesh = new THREE.Mesh(geom, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    return mesh;
  }
}
Batcher._cache = {};

// Routes primitives into spatial chunks so the city can be frustum-culled.
export class ChunkedBatcher {
  constructor(size = 40) {
    this.size = size;
    this.chunks = new Map();
  }

  key(x, z) {
    return `${Math.floor(x / this.size)},${Math.floor(z / this.size)}`;
  }

  _get(x, z) {
    const k = this.key(x, z);
    let b = this.chunks.get(k);
    if (!b) {
      b = new Batcher();
      this.chunks.set(k, b);
    }
    return b;
  }

  box(cx, cy, cz, sx, sy, sz, hex, opts) { this._get(cx, cz).box(cx, cy, cz, sx, sy, sz, hex, opts); }
  geo(geometry, matrix, hex, jitter) { this._get(matrix.elements[12], matrix.elements[14]).geo(geometry, matrix, hex, jitter); }
  cylinder(cx, cy, cz, rTop, rBot, h, hex, segs, opts) { this._get(cx, cz).cylinder(cx, cy, cz, rTop, rBot, h, hex, segs, opts); }
  ico(cx, cy, cz, r, hex, sy, detail) { this._get(cx, cz).ico(cx, cy, cz, r, hex, sy, detail); }
  cone(cx, cy, cz, r, h, hex, segs) { this._get(cx, cz).cone(cx, cy, cz, r, h, hex, segs); }

  build(material) {
    const group = new THREE.Group();
    this.meshes = new Map();
    for (const [k, b] of this.chunks) {
      if (!b.vcount) continue;
      const m = b.build(material);
      this.meshes.set(k, m);
      group.add(m);
    }
    return group;
  }
}

// Merge a hierarchy of meshes into one vertex-colored geometry (in the root's space).
const _inv = new THREE.Matrix4();
const _rel = new THREE.Matrix4();
export function flattenToGeometry(root) {
  const b = new Batcher();
  root.updateMatrixWorld(true);
  _inv.copy(root.matrixWorld).invert();
  root.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    _rel.multiplyMatrices(_inv, o.matrixWorld);
    const hex = o.material && o.material.color ? o.material.color.getHex() : 0x888888;
    b.geo(o.geometry, _rel, hex, 0);
  });
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
  geom.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
  geom.setIndex(b.idx);
  geom.computeBoundingSphere();
  return geom;
}

// Build a vertex-colored geometry from a list of boxes: [x, y, z, sx, sy, sz, hex].
export function boxesGeometry(parts) {
  const b = new Batcher();
  for (const p of parts) b.box(p[0], p[1], p[2], p[3], p[4], p[5], p[6], { jitter: 0, ao: 1, rotY: p[7] || 0 });
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
  geom.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
  geom.setIndex(b.idx);
  geom.computeBoundingSphere();
  return geom;
}
