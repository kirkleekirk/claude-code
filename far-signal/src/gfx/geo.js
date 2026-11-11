import * as THREE from 'three';

const _v = new THREE.Vector3(), _n = new THREE.Vector3();

// Accumulates transformed primitives into one geometry with per-vertex
// colour, glow (emissive weight) and sway (wind weight).
export class Geo {
  constructor() { this.p = []; this.n = []; this.c = []; this.a = []; }

  // fn(localPos, localNormal, out[r,g,b,glow,sway], index) is evaluated in the
  // primitive's own space, before the matrix is applied.
  add(src, matrix, fn, flat = false) {
    const g = src.index ? src.toNonIndexed() : src.clone();
    if (!g.attributes.normal) g.computeVertexNormals();
    const P = g.attributes.position, N = g.attributes.normal;
    const out = [1, 1, 1, 0, 0];
    for (let i = 0; i < P.count; i++) {
      _v.fromBufferAttribute(P, i); _n.fromBufferAttribute(N, i);
      out[0] = out[1] = out[2] = 1; out[3] = out[4] = 0;
      fn(_v, _n, out, i);
      this.c.push(out[0], out[1], out[2]);
      this.a.push(out[3], out[4]);
    }
    if (matrix) g.applyMatrix4(matrix);
    if (flat) g.computeVertexNormals();
    const P2 = g.attributes.position, N2 = g.attributes.normal;
    for (let i = 0; i < P2.count; i++) {
      this.p.push(P2.getX(i), P2.getY(i), P2.getZ(i));
      this.n.push(N2.getX(i), N2.getY(i), N2.getZ(i));
    }
    g.dispose();
    if (src._temp) src.dispose();
    return this;
  }

  // Darken vertices near the ground so props sit in their own contact shadow.
  groundAO(height, strength = 0.6) {
    for (let i = 0; i < this.p.length / 3; i++) {
      const y = this.p[i * 3 + 1];
      const k = 1 - strength * Math.max(0, 1 - y / height);
      this.c[i * 3] *= k; this.c[i * 3 + 1] *= k; this.c[i * 3 + 2] *= k;
    }
    return this;
  }

  get triangles() { return this.p.length / 9; }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.p), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.n), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.c), 3));
    g.setAttribute('aFx', new THREE.BufferAttribute(new Float32Array(this.a), 2));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

export const M = {
  // compose translate * rotate(euler) * scale
  trs(x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
    return new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')),
      new THREE.Vector3(sx, sy, sz),
    );
  },
};

// Tube swept along a polyline with per-point radius. Smooth normals.
export function tubeGeo(points, radii, sides = 6, capEnd = true) {
  const n = points.length;
  const pos = [], idx = [];
  const t = new THREE.Vector3(), u = new THREE.Vector3(), v = new THREE.Vector3(), ref = new THREE.Vector3();
  let prevU = null;
  for (let i = 0; i < n; i++) {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(n - 1, i + 1)];
    t.subVectors(b, a).normalize();
    if (prevU) { u.copy(prevU).addScaledVector(t, -prevU.dot(t)).normalize(); }
    else { ref.set(0, 0, 1); if (Math.abs(t.z) > 0.9) ref.set(1, 0, 0); u.crossVectors(t, ref).normalize(); }
    v.crossVectors(t, u).normalize();
    prevU = u.clone();
    const r = radii[i];
    for (let s = 0; s < sides; s++) {
      const ang = (s / sides) * Math.PI * 2;
      const cx = Math.cos(ang) * r, sy = Math.sin(ang) * r;
      pos.push(points[i].x + u.x * cx + v.x * sy, points[i].y + u.y * cx + v.y * sy, points[i].z + u.z * cx + v.z * sy);
    }
  }
  for (let i = 0; i < n - 1; i++) for (let s = 0; s < sides; s++) {
    const a = i * sides + s, b = i * sides + ((s + 1) % sides), c = a + sides, d = b + sides;
    idx.push(a, b, c, b, d, c);
  }
  if (capEnd) {
    const tip = pos.length / 3;
    const last = points[n - 1];
    pos.push(last.x, last.y, last.z);
    for (let s = 0; s < sides; s++) idx.push((n - 1) * sides + s, (n - 1) * sides + ((s + 1) % sides), tip);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g._temp = true;
  return g;
}

// Tapered ribbon (double sided in the shader) bending along a quadratic path.
export function bladeGeo(base, mid, tip, width, segs = 3) {
  const pos = [], idx = [];
  const p = new THREE.Vector3(), side = new THREE.Vector3(), dir = new THREE.Vector3();
  dir.subVectors(tip, base);
  side.set(-dir.z, 0, dir.x);
  if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
  side.normalize();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, it = 1 - t;
    p.set(0, 0, 0).addScaledVector(base, it * it).addScaledVector(mid, 2 * it * t).addScaledVector(tip, t * t);
    const w = width * (1 - t * 0.92) * 0.5;
    pos.push(p.x - side.x * w, p.y, p.z - side.z * w, p.x + side.x * w, p.y, p.z + side.z * w);
  }
  for (let i = 0; i < segs; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g._temp = true;
  return g;
}

export function temp(geo) { geo._temp = true; return geo; }
