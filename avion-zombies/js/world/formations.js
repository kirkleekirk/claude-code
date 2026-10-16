import * as THREE from '../../vendor/three.module.min.js';
import { makeRng, clamp, lerp } from '../util.js';

// Cave formations (speleothems), built as small procedural meshes and merged per material.
// Colours are baked into the vertices: creamy calcite with darker wet tips, orange iron bands.

const UP = new THREE.Vector3(0, 1, 0);

// A lathe-style formation along +y from 0..len. radiusAt(t) in metres; colour per t.
function lathe(len, radiusAt, colorAt, seed, seg = 8, rings = 10, bend = 0) {
  const rng = makeRng(seed);
  const pos = [];
  const col = [];
  const idx = [];
  const phase = rng() * 6.28;
  const bx = (rng() - 0.5) * bend;
  const bz = (rng() - 0.5) * bend;
  const c = new THREE.Color();
  for (let r = 0; r <= rings; r++) {
    const t = r / rings;
    const rad = Math.max(0.0015, radiusAt(t));
    const cx = bx * t * t;
    const cz = bz * t * t;
    colorAt(t, c);
    for (let s = 0; s < seg; s++) {
      const a = (s / seg) * Math.PI * 2;
      const wob = 1 + 0.12 * Math.sin(a * 3 + phase + t * 5) + 0.06 * Math.sin(a * 5 - phase);
      pos.push(cx + Math.cos(a) * rad * wob, t * len, cz + Math.sin(a) * rad * wob);
      const shade = 0.88 + 0.12 * Math.sin(a * 2 + phase);
      col.push(c.r * shade, c.g * shade, c.b * shade);
    }
  }
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < seg; s++) {
      const a = r * seg + s;
      const b = r * seg + ((s + 1) % seg);
      const c2 = a + seg;
      const d = b + seg;
      idx.push(a, c2, b, b, c2, d);
    }
  }
  // cap the far end
  const tip = pos.length / 3;
  colorAt(1, c);
  pos.push(bx, len, bz);
  col.push(c.r * 0.9, c.g * 0.9, c.b * 0.9);
  for (let s = 0; s < seg; s++) idx.push(rings * seg + s, tip, rings * seg + ((s + 1) % seg));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// calcite: cream with iron-orange bands, darker and wetter toward drip tips
function calcite(base, t, c, tipDark, seed) {
  const band = 0.5 + 0.5 * Math.sin(t * 23 + seed);
  c.setRGB(base[0], base[1], base[2]);
  c.lerp(new THREE.Color(0.76, 0.5, 0.3), band * 0.22);
  c.multiplyScalar(1 - tipDark * t * t * 0.35);
}

const CREAM = [0.86, 0.76, 0.6];
const BUFF = [0.78, 0.66, 0.5];
const WHITE = [0.92, 0.9, 0.84];

export function stalactite(len, r0, seed, tint = CREAM) {
  return lathe(
    len,
    (t) => r0 * Math.pow(1 - t, 0.85) * (1 + 0.18 * Math.sin(t * 17 + seed)) + 0.006,
    (t, c) => calcite(tint, t, c, 1, seed),
    seed, 8, Math.max(5, Math.round(len * 4)), 0.08 * len,
  );
}

export function stalagmite(h, r0, seed, tint = BUFF) {
  return lathe(
    h,
    (t) => r0 * Math.pow(Math.max(0, 1 - Math.pow(t, 2.2)), 0.55) * (1 + 0.14 * Math.sin(t * 11 + seed) + 0.25 * Math.exp(-t * 6)),
    (t, c) => calcite(tint, 1 - t, c, 0.3, seed),
    seed, 9, Math.max(6, Math.round(h * 3)), 0.04 * h,
  );
}

// floor-to-ceiling column: flared at both ends, waisted, with drip rings
export function column(h, r0, seed, tint = BUFF) {
  return lathe(
    h,
    (t) => r0 * (0.5 + 0.5 * Math.pow(Math.abs(2 * t - 1), 1.6)) * (1 + 0.1 * Math.sin(t * 29 + seed)) * (1 + 0.5 * Math.exp(-t * 10) + 0.35 * Math.exp(-(1 - t) * 10)),
    (t, c) => calcite(tint, t, c, 0, seed),
    seed, 10, Math.max(10, Math.round(h * 2.5)), 0,
  );
}

// A hanging curtain: a thin folded sheet under a line on the ceiling. pts: top edge points
// [x, y, z] (world), drop(t): hang length along the edge. "Cave bacon": orange and white bands.
export function drapery(pts, drop, seed, bacon = true) {
  const rng = makeRng(seed);
  const pos = [];
  const col = [];
  const idx = [];
  const steps = Math.max(8, Math.round(polyLen(pts) / 0.18));
  const rows = 6;
  const c = new THREE.Color();
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const [x, y, z, nx, nz] = polyAt(pts, t);
    // folds: the sheet zig-zags across its line
    const fold = Math.sin(t * steps * 0.9 + seed) * 0.12 + Math.sin(t * steps * 0.37) * 0.06;
    const hang = drop(t) * (0.85 + 0.15 * Math.sin(t * 40 + seed));
    for (let r = 0; r <= rows; r++) {
      const v = r / rows;
      const thin = 1 - v * 0.6;
      pos.push(x + nx * fold * thin, y - hang * v, z + nz * fold * thin);
      const band = bacon ? 0.5 + 0.5 * Math.sin(v * 7 + t * 3 + seed) : 0.5;
      c.setRGB(0.88, 0.8, 0.66).lerp(new THREE.Color(0.8, 0.42, 0.22), band * 0.6);
      c.multiplyScalar(0.9 + 0.1 * rng());
      col.push(c.r, c.g, c.b);
    }
  }
  for (let s = 0; s < steps; s++) {
    for (let r = 0; r < rows; r++) {
      const a = s * (rows + 1) + r;
      const b = a + rows + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function polyLen(pts) {
  let l = 0;
  for (let i = 0; i < pts.length - 1; i++) l += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][2] - pts[i][2]);
  return l;
}
function polyAt(pts, t) {
  const total = polyLen(pts);
  let d = t * total;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const l = Math.hypot(b[0] - a[0], b[2] - a[2]);
    if (d <= l || i === pts.length - 2) {
      const k = l > 0 ? clamp(d / l, 0, 1) : 0;
      const dx = (b[0] - a[0]) / (l || 1);
      const dz = (b[2] - a[2]) / (l || 1);
      return [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k), -dz, dx];
    }
    d -= l;
  }
  const p = pts[pts.length - 1];
  return [p[0], p[1], p[2], 0, 1];
}

// Lumpy flowstone mound (scaled, squashed blob), e.g. stacked into a frozen waterfall.
export function flowLump(rx, ry, rz, seed) {
  const g = new THREE.SphereGeometry(1, 12, 9);
  const p = g.attributes.position;
  const rng = makeRng(seed);
  const ph = rng() * 6;
  const col = [];
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const k = 1 + 0.08 * Math.sin(v.x * 5 + ph) * Math.sin(v.z * 4 - ph) + 0.05 * Math.sin(v.y * 9 + ph);
    p.setXYZ(i, v.x * rx * k, v.y * ry * k, v.z * rz * k);
    // ripples of banded cream and orange running down the slope
    const band = 0.5 + 0.5 * Math.sin(v.y * 14 + v.x * 2 + ph);
    col.push(lerp(0.9, 0.78, band * 0.5), lerp(0.8, 0.55, band * 0.5), lerp(0.62, 0.36, band * 0.5));
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

// A rimstone dam: a low curved lip around a pool.
export function rimstone(r, a0, a1, h, seed) {
  const rng = makeRng(seed);
  const pos = [];
  const col = [];
  const idx = [];
  const n = Math.max(6, Math.round(((a1 - a0) * r) / 0.25));
  for (let i = 0; i <= n; i++) {
    const a = lerp(a0, a1, i / n);
    const rr = r * (1 + 0.06 * Math.sin(a * 7 + seed));
    const hh = h * (0.7 + 0.3 * rng());
    const cx = Math.cos(a);
    const cz = Math.sin(a);
    pos.push(cx * (rr - 0.08), -0.05, cz * (rr - 0.08), cx * rr, hh, cz * rr, cx * (rr + 0.12), -0.05, cz * (rr + 0.12));
    for (let k = 0; k < 3; k++) col.push(0.84, 0.74, 0.58);
  }
  for (let i = 0; i < n; i++) {
    const a = i * 3;
    const b = a + 3;
    idx.push(a, b, a + 1, a + 1, b, b + 1, a + 1, b + 1, a + 2, a + 2, b + 1, b + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// A selenite (gypsum) blade: long hexagonal prism with a chisel tip at both ends.
export function crystal(len, r, seed) {
  const g = new THREE.CylinderGeometry(r, r, len, 6, 3, false);
  const p = g.attributes.position;
  const rng = makeRng(seed);
  const flat = 0.55 + rng() * 0.3;
  // most blades are milky white; some carry a faint honey tint, some are clearer and cooler
  const tint = rng();
  const base = tint < 0.3 ? [1.0, 0.9, 0.74] : tint < 0.55 ? [0.86, 0.93, 1.0] : [0.97, 0.96, 0.93];
  const col = [];
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i);
    let y = p.getY(i);
    let z = p.getZ(i) * flat;
    // chisel ends
    const e = Math.abs(y) / (len / 2);
    if (e > 0.98) {
      x *= 0.35;
      z *= 0.35;
      y += Math.sign(y) * r * 0.9;
    }
    p.setXYZ(i, x, y, z);
    const s = 0.86 + 0.14 * rng();
    col.push(base[0] * s, base[1] * s, base[2] * s);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

// Breakdown boulder (angular slab that fell from the ceiling long ago).
export function boulder(r, seed, tint = [0.52, 0.47, 0.41]) {
  const g = new THREE.IcosahedronGeometry(r, 1);
  const p = g.attributes.position;
  const rng = makeRng(seed);
  const cuts = [];
  for (let k = 0; k < 7; k++) {
    const n = new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize();
    cuts.push([n, r * (0.55 + rng() * 0.35)]);
  }
  const v = new THREE.Vector3();
  const col = [];
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    // flatten against random planes: blocky, fractured faces
    for (const [n, d] of cuts) {
      const proj = v.dot(n);
      if (proj > d) v.addScaledVector(n, d - proj);
    }
    v.y *= 0.7;
    p.setXYZ(i, v.x, v.y, v.z);
    const s = 0.82 + 0.25 * rng();
    col.push(tint[0] * s, tint[1] * s, tint[2] * s);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

// Place a geometry at (x,y,z) with yaw, optional tilt and uniform scale (returns a matrix).
export function placeAt(x, y, z, yaw = 0, tilt = 0, tiltDir = 0, scale = 1) {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0));
  if (tilt) {
    const axis = new THREE.Vector3(Math.cos(tiltDir), 0, Math.sin(tiltDir));
    q.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, tilt));
  }
  m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(scale, scale, scale));
  return m;
}

// Upside-down placement (for hanging things built pointing up).
export function hangAt(x, y, z, yaw = 0) {
  const m = new THREE.Matrix4().makeRotationX(Math.PI);
  m.premultiply(new THREE.Matrix4().makeRotationY(yaw));
  m.setPosition(x, y, z);
  return m;
}

export { UP, CREAM, BUFF, WHITE };
