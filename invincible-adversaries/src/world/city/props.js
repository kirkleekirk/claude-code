import * as THREE from 'three';
import { PROPS, BUILDINGS, BOUNDS, CRATER } from './layout.js';
import { sol } from './solid.js';
import { rng } from './geo.js';

// Cover and wreckage on the streets: cars, taxis, police cruisers and CTA buses (some burnt out,
// flipped or on their side), Jersey barriers, the station's benches and ticket booths, slabs of
// road thrown up in the crater, heaps of rubble, and the street furniture: lamp posts (a few
// knocked flat), signals at the corners, hydrants, litter. Vehicles are built from extruded side
// profiles in their own frame and placed with a matrix, so a wreck can lie at any angle.

const UPV = new THREE.Vector3(0, 1, 0);

/** a side profile [[x, y]...] (counter-clockwise) extruded from z0 to z1 */
function extrude(gb, pts, z0, z1) {
  const v2 = pts.map(([x, y]) => new THREE.Vector2(x, y));
  const tris = THREE.ShapeUtils.triangulateShape(v2, []);
  for (const t of tris) {
    let [A, B, C] = t.map((i) => pts[i]);
    if ((B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]) < 0) [B, C] = [C, B];
    gb.tri([A[0], A[1], z1], [B[0], B[1], z1], [C[0], C[1], z1], A, B, C, [0, 0, 1]);
    gb.tri([A[0], A[1], z0], [C[0], C[1], z0], [B[0], B[1], z0], A, C, B, [0, 0, -1]);
  }
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
    const L = Math.hypot(bx - ax, by - ay);
    gb.face([by - ay, -(bx - ax), 0], [ax, ay, z0], [bx, by, z0], [bx, by, z1], [ax, ay, z1], [0, z0], [L, z0], [L, z1], [0, z1]);
  }
}
function wheel(gb, x, y, z, r, w, burnt) {
  const m = new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(x, y, z);
  const prev = gb.xf;
  gb.setXf(prev ? prev.clone().multiply(m) : m);
  sol(gb, burnt ? 0x231f1c : 0x151515, { pat: burnt ? 'burnt' : 'plain', rough: 0.9, grime: 0.4 });
  if (!burnt) gb.cyl(0, 0, r, r, -w / 2, w / 2, 12, true);
  sol(gb, burnt ? 0x3a2a20 : 0x8c8f92, { pat: burnt ? 'burnt' : 'steel', rough: 0.4, metal: 0.8, grime: 0.3 });
  gb.cyl(0, 0, r * 0.6, r * 0.6, -w / 2 - 0.01, w / 2 + 0.01, 10, true);
  gb.setXf(prev);
}

const CAR = {
  body: [[-2.35, 0.3], [2.35, 0.3], [2.43, 0.5], [2.37, 0.76], [2.2, 0.85], [0.95, 0.93], [-1.55, 0.96], [-2.25, 0.92], [-2.41, 0.74], [-2.43, 0.5]],
  cabin: [[0.95, 0.92], [0.12, 1.39], [-0.95, 1.41], [-1.55, 0.95]],
};
/** a sedan (kind: car | taxi | police) in frame m (origin on the ground under its middle, length along x) */
export function car(gb, m, { kind = 'car', burnt = false, color = null, R = Math.random } = {}) {
  gb.setXf(m);
  const W = 0.92, CW = 0.78, drop = burnt ? -0.12 : 0;
  const paint = color ?? (kind === 'taxi' ? 0xe0ad1c : kind === 'police' ? 0xe9eaec : [0x7d1d1d, 0x23324a, 0x595d60, 0x1d1f22, 0x8a8f94, 0x2c4433, 0xb8b2a4][Math.floor(R() * 7)]);
  const body = () => burnt ? sol(gb, 0x2a2420, { pat: 'burnt', rough: 0.95, grime: 0.6 }) : sol(gb, paint, { rough: 0.32, metal: 0.45, grime: 0.45 });
  const sub = new THREE.Matrix4().makeTranslation(0, drop, 0);
  gb.setXf(m.clone().multiply(sub));
  body();
  extrude(gb, CAR.body, -W, W);
  sol(gb, burnt ? 0x080706 : 0x10161a, { pat: burnt ? 'plain' : 'glass', rough: 0.12, metal: 0.3, grime: 0.2 });
  extrude(gb, CAR.cabin, -CW, CW);
  body();
  gb.box(-0.97, 1.38, -CW - 0.01, 0.16, 1.43, CW + 0.01, 'yYxXzZ');
  for (const s of [-1, 1]) gb.box(-0.44, 0.93, s * CW - 0.04, -0.34, 1.4, s * CW + 0.04, 'xXzZ');
  if (kind === 'police' && !burnt) {
    sol(gb, 0x1d3a7a, { rough: 0.4, metal: 0.3, grime: 0.3 });
    for (const s of [-1, 1]) gb.box(-2.2, 0.58, s * W - 0.012, 2.25, 0.68, s * W + 0.012, s > 0 ? 'Z' : 'z');
    sol(gb, 0x111111, { rough: 0.5 });
    gb.box(-0.62, 1.43, -0.62, -0.18, 1.5, 0.62);
    sol(gb, 0xff2020, { pat: 'lamp', emit: 2.4, grime: 0 }); gb.box(-0.6, 1.5, 0.05, -0.2, 1.6, 0.6);
    sol(gb, 0x2050ff, { pat: 'lamp', emit: 2.4, grime: 0 }); gb.box(-0.6, 1.5, -0.6, -0.2, 1.6, -0.05);
  }
  if (kind === 'taxi' && !burnt) {
    sol(gb, 0xf4f0e2, { pat: 'lamp', emit: 0.25, rough: 0.5, grime: 0.2 });
    gb.box(-0.55, 1.43, -0.32, -0.15, 1.68, 0.32);
  }
  if (!burnt) {
    sol(gb, 0xfff2d8, { pat: 'lamp', emit: 0.3, rough: 0.2, grime: 0.1 });
    for (const s of [-1, 1]) gb.box(2.36, 0.6, s * 0.65 - 0.22, 2.42, 0.74, s * 0.65 + 0.22, 'X');
    sol(gb, 0x8a0d0d, { pat: 'lamp', emit: 0.25, rough: 0.3, grime: 0.1 });
    for (const s of [-1, 1]) gb.box(-2.43, 0.62, s * 0.68 - 0.2, -2.38, 0.78, s * 0.68 + 0.2, 'x');
  }
  for (const x of [-1.45, 1.42]) for (const s of [-1, 1]) wheel(gb, x, 0.33, s * (W - 0.1), 0.33, 0.24, burnt);
  gb.setXf(null);
}

/** a CTA bus, 12 m long */
export function bus(gb, m, { burnt = false } = {}) {
  gb.setXf(m);
  const L = 6, W = 1.3;
  const body = () => burnt ? sol(gb, 0x2a2521, { pat: 'burnt', rough: 0.95, grime: 0.6 }) : sol(gb, 0xd9dcdd, { rough: 0.35, metal: 0.4, grime: 0.5 });
  body();
  extrude(gb, [[-L, 0.35], [L, 0.35], [L + 0.05, 0.9], [L - 0.05, 2.95], [L - 0.35, 3.15], [-L + 0.2, 3.15], [-L, 2.95], [-L - 0.03, 0.9]], -W, W);
  gb.box(-L * 0.55, 3.15, -0.95, L * 0.2, 3.55, 0.95, 'xXzZY');
  sol(gb, burnt ? 0x070605 : 0x11171b, { pat: burnt ? 'plain' : 'glass', rough: 0.12, metal: 0.3, grime: 0.25 });
  for (const s of [-1, 1]) for (let x = -L + 0.5; x < L - 1.6; x += 1.62) {
    if (s > 0 && Math.abs(x - (L - 2.6)) < 1.2) continue;
    gb.box(x, 1.35, s * W - 0.02, x + 1.45, 2.6, s * W + 0.02, s > 0 ? 'Z' : 'z');
  }
  gb.box(L + 0.02, 0.95, -1.15, L + 0.06, 2.75, 1.15, 'X');
  gb.box(-L - 0.06, 1.6, -0.9, -L - 0.02, 2.6, 0.9, 'x');
  gb.box(L - 2.4 - 1.1, 0.45, W - 0.03, L - 2.4 + 0.1, 2.75, W + 0.03, 'Z');
  if (!burnt) {
    sol(gb, 0x2b55a8, { rough: 0.45, metal: 0.3, grime: 0.3 });
    for (const s of [-1, 1]) gb.box(-L + 0.1, 1.05, s * W - 0.015, L - 0.1, 1.2, s * W + 0.015, s > 0 ? 'Z' : 'z');
    sol(gb, 0xc62a2a, { rough: 0.45, metal: 0.3, grime: 0.3 });
    for (const s of [-1, 1]) gb.box(-L + 0.1, 1.2, s * W - 0.015, L - 0.1, 1.28, s * W + 0.015, s > 0 ? 'Z' : 'z');
    sol(gb, 0xff9d2a, { pat: 'lamp', emit: 1.4, grime: 0 });
    gb.box(L + 0.03, 2.8, -0.85, L + 0.07, 3.05, 0.85, 'X');
  }
  for (const x of [-L + 2.3, L - 2.1]) for (const s of [-1, 1]) wheel(gb, x, 0.48, s * (W - 0.2), 0.48, 0.32, burnt);
  gb.setXf(null);
}

/** a frame on the ground at x, z: heading yaw, optionally flipped onto its roof or tipped on its side */
function placeFrame(x, y, z, yaw, { flipped = false, tipped = false, roof = 1.43, side = 0.92, normal = null } = {}) {
  const q = new THREE.Quaternion().setFromAxisAngle(UPV, yaw);
  if (normal) q.premultiply(new THREE.Quaternion().setFromUnitVectors(UPV, normal));
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(1, 1, 1));
  if (flipped) m.multiply(new THREE.Matrix4().makeRotationX(Math.PI)).multiply(new THREE.Matrix4().makeTranslation(0, -roof, 0));
  if (tipped) m.multiply(new THREE.Matrix4().makeTranslation(0, side, 0)).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
  return m;
}
/** the axis-aligned bounds of a box in frame m: x -hx..hx, y y0..y1, z -hz..hz (or z0..z1) */
function aabb(m, hx, y0, y1, hz, z0 = -hz, z1 = hz) {
  const b = new THREE.Box3(), v = new THREE.Vector3();
  for (const x of [-hx, hx]) for (const y of [y0, y1]) for (const z of [z0, z1]) b.expandByPoint(v.set(x, y, z).applyMatrix4(m));
  return [b.min.x, Math.max(b.min.y, -20), b.min.z, b.max.x, b.max.y, b.max.z];
}

function jersey(gb, m, len) {
  gb.setXf(m);
  sol(gb, 0xa9a59b, { pat: 'rubble', rough: 0.9, grime: 0.55 });
  const pts = [[-0.3, 0], [0.3, 0], [0.28, 0.08], [0.12, 0.33], [0.075, 0.81], [-0.075, 0.81], [-0.12, 0.33], [-0.28, 0.08]];
  // (the profile is across the barrier: extrude along its length via a quarter turn)
  gb.setXf(m.clone().multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2)));
  extrude(gb, pts, -len / 2, len / 2);
  gb.setXf(null);
}

function bench(gb, m, len, lamps) {
  gb.setXf(m);
  sol(gb, 0x5a3a22, { pat: 'wood', rough: 0.55, grime: 0.35 });
  gb.box(-len / 2, 0.42, -0.25, len / 2, 0.5, 0.25);
  gb.box(-len / 2, 0.5, -0.29, len / 2, 1.15, -0.21);
  sol(gb, 0x3b2616, { pat: 'wood', rough: 0.6, grime: 0.4 });
  for (let x = -len / 2; x <= len / 2 + 0.01; x += len / 5) gb.box(x - 0.06, 0, -0.3, x + 0.06, 0.75, 0.27);
  if (lamps) for (const x of [-len / 2 - 0.25, len / 2 + 0.25]) {
    sol(gb, 0x7a5a2a, { pat: 'steel', rough: 0.35, metal: 0.9, grime: 0.3 });
    gb.cyl(x, -0.25, 0.09, 0.06, 0, 3.0, 10, false);
    gb.cyl(x, -0.25, 0.2, 0.12, 0, 0.25, 10, true);
    sol(gb, 0xfff0d2, { pat: 'lamp', emit: 0.9, grime: 0 });
    gb.cyl(x, -0.25, 0.22, 0.22, 3.0, 3.4, 12, true);
  }
  gb.setXf(null);
}

function booth(gb, m) {
  gb.setXf(m);
  sol(gb, 0x4b2e1b, { pat: 'wood', rough: 0.5, grime: 0.35 });
  gb.box(-1.5, 0, -1.3, 1.5, 1.15, 1.3);
  gb.box(-1.6, 2.45, -1.4, 1.6, 2.8, 1.4);
  sol(gb, 0x7a5a2a, { pat: 'steel', rough: 0.35, metal: 0.9, grime: 0.3 });
  for (const [x, z] of [[-1.45, -1.25], [1.45, -1.25], [1.45, 1.25], [-1.45, 1.25]]) gb.box(x - 0.06, 1.15, z - 0.06, x + 0.06, 2.45, z + 0.06, 'xXzZ');
  sol(gb, 0x1b2226, { pat: 'glass', rough: 0.12, metal: 0.3, grime: 0.3 });
  gb.box(-1.42, 1.15, -1.22, 1.42, 2.45, 1.22, 'xXzZ');
  gb.setXf(null);
}

/** a slab of road or floor thrown up and tilted, rebar sticking out of its broken edge */
function slab(gb, m, w, d, h, R) {
  gb.setXf(m);
  sol(gb, 0x8b877d, { pat: 'rubble', rough: 0.95, grime: 0.6 });
  gb.box(-w / 2, -0.2, -d / 2, w / 2, 0.2, d / 2);
  sol(gb, 0x3d3c3b, { pat: 'plain', rough: 0.9, grime: 0.6 });
  gb.box(-w / 2 + 0.02, 0.2, -d / 2 + 0.02, w / 2 - 0.02, 0.24, d / 2 - 0.02, 'Y');
  sol(gb, 0x5a2a16, { pat: 'steel', rough: 0.9, metal: 0.5, grime: 0.6 });
  for (let x = -w / 2 + 0.3; x < w / 2; x += 0.45) {
    const l = 0.4 + R() * 1.2, a = (R() - 0.5) * 0.8;
    const s = new THREE.Matrix4().makeRotationZ(a).setPosition(x, 0, d / 2 + l / 2 * 0.9);
    gb.setXf(m.clone().multiply(s));
    gb.box(-0.025, -0.025, -l / 2, 0.025, 0.025, l / 2, 'xXyY');
  }
  gb.setXf(null);
  void h;
}

/** a heap of broken blocks; colliders as two stepped boxes */
export function rubblePile(gbS, boxes, cx, cz, rx, rz, h, R, color = 0x8e8577, y0 = 0) {
  sol(gbS, color, { pat: 'rubble', grime: 0.5 });
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const n = Math.round(10 + rx * rz * 1.2);
  for (let i = 0; i < n; i++) {
    const a = R() * Math.PI * 2, d = Math.sqrt(R());
    const px = cx + Math.cos(a) * d * rx, pz = cz + Math.sin(a) * d * rz;
    const k = 1 - d * d;
    const s = 0.4 + R() * (0.6 + k * 1.2);
    e.set(R() * 0.9, R() * Math.PI, R() * 0.9); q.setFromEuler(e);
    m.compose(new THREE.Vector3(px, y0 + k * h * (0.55 + R() * 0.4) - s * 0.2, pz), q, new THREE.Vector3(1, 1, 1));
    gbS.boxM(m, s * (1 + R()), s * (0.5 + R() * 0.6), s * (1 + R()));
  }
  // a few bent beams and rebar poking out
  sol(gbS, 0x4a3022, { pat: 'steel', rough: 0.85, metal: 0.4, grime: 0.6 });
  for (let i = 0; i < Math.round(rx * rz * 0.15); i++) {
    const a = R() * Math.PI * 2, d = Math.sqrt(R()) * 0.7;
    e.set((R() - 0.5) * 1.6, R() * Math.PI, (R() - 0.5) * 1.6); q.setFromEuler(e);
    m.compose(new THREE.Vector3(cx + Math.cos(a) * d * rx, y0 + h * (1 - d * d) * 0.7, cz + Math.sin(a) * d * rz), q, new THREE.Vector3(1, 1, 1));
    gbS.boxM(m, 0.12 + R() * 0.15, 0.12 + R() * 0.15, 1.5 + R() * 3);
  }
  boxes.push([cx - rx * 0.8, y0, cz - rz * 0.8, cx + rx * 0.8, y0 + h * 0.45, cz + rz * 0.8], [cx - rx * 0.45, y0, cz - rz * 0.45, cx + rx * 0.45, y0 + h * 0.85, cz + rz * 0.45]);
}

/** a Chicago street lamp: a tapered pole, an arm, a cobra-head; knocked over when `fallen` (radians) */
function lamp(gb, x, z, y, facing, fallen = 0, lit = false) {
  // (a fallen one lies along the sidewalk rather than across the road)
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(fallen, facing, 0, 'YXZ')), new THREE.Vector3(1, 1, 1));
  gb.setXf(m);
  sol(gb, 0x2a2d2e, { pat: 'steel', rough: 0.5, metal: 0.6, grime: 0.45 });
  gb.cyl(0, 0, 0.26, 0.26, 0, 0.6, 10, true);
  gb.cyl(0, 0, 0.17, 0.09, 0.6, 9.2, 10, false);
  const arm = new THREE.Matrix4().makeRotationZ(-1.45).setPosition(0.0, 9.0, 0);
  gb.setXf(m.clone().multiply(arm));
  gb.cyl(0, 0, 0.07, 0.06, 0, 2.6, 8, false);
  gb.setXf(m);
  gb.box(2.3, 8.95, -0.22, 3.1, 9.2, 0.22);
  sol(gb, 0xfff1d6, { pat: 'lamp', emit: lit ? 2.2 : 0.05, rough: 0.3, grime: 0.1 });
  gb.box(2.35, 8.88, -0.17, 3.05, 8.95, 0.17, 'y');
  gb.setXf(null);
}

/** a signal pole with a mast arm over the road and three heads */
function signal(gb, x, z, facing, len, blink) {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromAxisAngle(UPV, facing), new THREE.Vector3(1, 1, 1));
  gb.setXf(m);
  sol(gb, 0x2b2e2c, { pat: 'steel', rough: 0.5, metal: 0.55, grime: 0.45 });
  gb.cyl(0, 0, 0.18, 0.14, 0, 6.6, 10, true);
  gb.box(0, 6.2, -0.07, len, 6.34, 0.07);
  for (const k of [0.45, 0.8]) {
    const hx = len * k;
    sol(gb, 0x161616, { rough: 0.6, grime: 0.3 });
    gb.box(hx - 0.2, 5.0, -0.18, hx + 0.2, 6.2, 0.18);
    sol(gb, 0xff2a1a, { pat: 'lamp', emit: blink ? 2.6 : 0.15, grime: 0 });
    gb.box(hx - 0.12, 5.82, 0.18, hx + 0.12, 6.06, 0.2, 'Z');
    sol(gb, 0x553311, { pat: 'lamp', emit: 0.08, grime: 0 });
    gb.box(hx - 0.12, 5.48, 0.18, hx + 0.12, 5.72, 0.2, 'Z');
    sol(gb, 0x0f3320, { pat: 'lamp', emit: 0.06, grime: 0 });
    gb.box(hx - 0.12, 5.14, 0.18, hx + 0.12, 5.38, 0.2, 'Z');
  }
  gb.setXf(null);
}

/** distance from (x, z) to a polyline of [x, z] points */
function distToLine(pts, x, z) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}

/**
 * The blast's leavings: road slabs peeled up and tipped outward round the rim, chunks strewn down
 * the slopes, the stumps of the blocks it flattened in the corners around it. The cart's road
 * stays clear.
 */
function craterDebris(gb, boxes, ty, tn, road, R) {
  const up = new THREE.Vector3(0, 1, 0);
  const N = 46;
  for (let k = 0; k < N; k++) {
    const a = (k / N) * Math.PI * 2 + (R() - 0.5) * 0.08;
    const wob = 1 + 0.055 * Math.sin(a * 3 + 1.3) + 0.035 * Math.sin(a * 7 + 0.4);
    const r = CRATER.R * wob * (0.97 + R() * 0.08);
    const x = CRATER.x + Math.cos(a) * r, z = CRATER.z + Math.sin(a) * r;
    if (distToLine(road, x, z) < 8.5 || R() < 0.2) continue;
    const t = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)), inward = new THREE.Vector3(-Math.cos(a), 0, -Math.sin(a));
    const w = 3 + R() * 3.5, d = 2 + R() * 2.6, th = 0.32, tilt = 0.35 + R() * 0.6;
    const m = new THREE.Matrix4().makeBasis(t, up, inward).setPosition(x, ty(x, z) - 0.15, z)
      .multiply(new THREE.Matrix4().makeRotationY((R() - 0.5) * 0.4))
      .multiply(new THREE.Matrix4().makeRotationX(-tilt));
    gb.setXf(m);
    sol(gb, 0x77736b, { pat: 'rubble', rough: 0.95, grime: 0.55 });
    gb.box(-w / 2, -th, 0, w / 2, 0, d, 'xXyzZ');
    sol(gb, 0x2c2c2d, { pat: 'plain', rough: 0.9, grime: 0.5 });
    gb.box(-w / 2 + 0.03, -0.01, 0.03, w / 2 - 0.03, 0.0, d - 0.03, 'Y');
    if (R() < 0.4) { sol(gb, 0xb59a3a, { rough: 0.8, grime: 0.6 }); gb.box(-w / 2 + 0.3, 0.0, d * 0.45, w / 2 - 0.3, 0.004, d * 0.45 + 0.15, 'Y'); }
    gb.setXf(null);
    const bb = aabbM(m, -w / 2, w / 2, -th, 0, 0, d);
    boxes.push([bb[0] + 0.25, bb[1], bb[2] + 0.25, bb[3] - 0.25, bb[1] + (bb[4] - bb[1]) * 0.7, bb[5] - 0.25]);
  }
  // chunks down the slopes and on the floor
  for (let i = 0; i < 34; i++) {
    const a = R() * Math.PI * 2, rr = Math.sqrt(R()) * CRATER.R * 0.92;
    const x = CRATER.x + Math.cos(a) * rr, z = CRATER.z + Math.sin(a) * rr;
    if (distToLine(road, x, z) < 6.5) continue;
    const big = R() < 0.3;
    rubblePile(gb, boxes, x, z, big ? 2 + R() * 2 : 0.8 + R() * 1.2, big ? 1.6 + R() * 1.8 : 0.7 + R(), big ? 1.2 + R() * 1.4 : 0.5 + R() * 0.6, R, [0x6e675e, 0x5d5750, 0x7c7468][Math.floor(R() * 3)], ty(x, z) - 0.2);
  }
  // the flattened blocks in the corners
  for (const [x0, z0, x1, z1] of [[-25, -25, -7, -9], [48, -26, 62, -17], [-24, 68, -6, 81], [56, 67, 73, 80]]) ruin(gb, boxes, x0, z0, x1, z1, R, ty);
  void tn;
}
/** what's left of a building: a floor slab, broken walls round it, column stumps, heaps */
function ruin(gb, boxes, x0, z0, x1, z1, R, ty) {
  const y = Math.min(ty(x0, z0), ty(x1, z0), ty(x0, z1), ty(x1, z1));
  sol(gb, 0x4f4b46, { pat: 'rubble', rough: 0.95, grime: 0.7 });
  gb.box(x0, y - 0.3, z0, x1, y + 0.3, z1, 'xXzZY');
  boxes.push([x0, y - 0.3, z0, x1, y + 0.3, z1]);
  const brick = R() < 0.5, th = 0.45;
  const wallCol = brick ? [0x5a2e22, 0x4c271d, 0x63362a] : [0x6e6a62, 0x5f5b54, 0x76716a];
  const sides = [[x0, z0, x1, z0, 'x'], [x0, z1, x1, z1, 'x'], [x0, z0, x0, z1, 'z'], [x1, z0, x1, z1, 'z']];
  for (const [ax, az, bx, bz, along] of sides) {
    const L = along === 'x' ? bx - ax : bz - az;
    // a wall that steps down from a few standing piers to rubble height, with gaps blown in it
    let u = 0, h = 1 + R() * 4;
    while (u < L - 0.3) {
      const w = Math.min(L - u, 1.2 + R() * 1.6);
      h = Math.max(0.5, Math.min(6.5, h + (R() - 0.55) * 2.2));
      if (R() < 0.18) { u += w; continue; } // a gap
      sol(gb, wallCol[Math.floor(R() * 3)], { pat: brick ? 'plain' : 'ashlar', rough: 0.92, grime: 0.75 });
      const c = along === 'x' ? [ax + u, y + 0.3, az - th / 2, ax + u + w, y + 0.3 + h, az + th / 2] : [ax - th / 2, y + 0.3, az + u, ax + th / 2, y + 0.3 + h, az + u + w];
      gb.box(...c);
      boxes.push(c);
      u += w;
    }
  }
  sol(gb, 0x625e57, { pat: 'rubble', rough: 0.95, grime: 0.6 });
  for (let x = x0 + 4; x < x1 - 2; x += 5.5) for (let z = z0 + 4; z < z1 - 2; z += 5.5) {
    if (R() < 0.3) continue;
    const h = 0.8 + R() * 5;
    gb.box(x - 0.35, y + 0.3, z - 0.35, x + 0.35, y + 0.3 + h, z + 0.35);
    sol(gb, 0x3e2a1e, { pat: 'steel', rough: 0.85, metal: 0.4, grime: 0.6 });
    for (let k = 0; k < 3; k++) gb.box(x - 0.2 + k * 0.18, y + 0.3 + h, z - 0.02, x - 0.17 + k * 0.18, y + 0.6 + h + R() * 0.6, z + 0.02);
    sol(gb, 0x625e57, { pat: 'rubble', rough: 0.95, grime: 0.6 });
    boxes.push([x - 0.35, y + 0.3, z - 0.35, x + 0.35, y + 0.3 + h, z + 0.35]);
  }
  for (let k = 0; k < 4; k++) {
    const px = x0 + 2 + R() * (x1 - x0 - 4), pz = z0 + 2 + R() * (z1 - z0 - 4);
    rubblePile(gb, boxes, px, pz, 1.4 + R() * 2, 1.2 + R() * 1.6, 1 + R() * 1.4, R, brick ? 0x5a3a2e : 0x67625a, y + 0.3);
  }
}
/** bounds of the box x0..x1, y0..y1, z0..z1 in frame m */
function aabbM(m, x0, x1, y0, y1, z0, z1) {
  const b = new THREE.Box3(), v = new THREE.Vector3();
  for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [z0, z1]) b.expandByPoint(v.set(x, y, z).applyMatrix4(m));
  return [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z];
}

export function buildProps(gb, boxes, ty, tn, road = []) {
  const R = rng(99);
  const jit = () => (R() - 0.5) * 0.24;
  for (const [kind, x, z, rot, ex = {}] of PROPS) {
    const yaw = (rot ? Math.PI / 2 : 0) + jit();
    const y = ty(x, z);
    const normal = y < -0.05 || y > 0.05 ? tn(x, z) : null;
    if (kind === 'car' || kind === 'taxi' || kind === 'police') {
      const m = placeFrame(x, y, z, yaw + (R() < 0.5 ? Math.PI : 0), { flipped: ex.flipped, normal });
      car(gb, m, { kind, burnt: ex.burnt, R });
      boxes.push(aabb(placeFrame(x, y, z, yaw, { normal }), 2.4, 0, 1.45, 0.92));
    } else if (kind === 'bus') {
      const m = placeFrame(x, y, z, yaw, { tipped: ex.tipped, side: 1.3, normal });
      bus(gb, m, ex);
      boxes.push(ex.tipped ? aabb(placeFrame(x, y, z, yaw, { normal }), 6, 0, 2.6, 0, 0, 3.55) : aabb(placeFrame(x, y, z, yaw, { normal }), 6, 0, 3.2, 1.3));
    } else if (kind === 'barrier') {
      for (const k of [-1.55, 1.55]) {
        const m = placeFrame(x + Math.cos(yaw) * k, y, z - Math.sin(yaw) * k, yaw + jit() * 0.5);
        jersey(gb, m, 3);
      }
      boxes.push(aabb(placeFrame(x, y, z, yaw), 3.1, 0, 0.81, 0.3));
    } else if (kind === 'booth') {
      booth(gb, placeFrame(x, y, z, yaw - jit()));
      boxes.push(aabb(placeFrame(x, y, z, yaw), 1.5, 0, 2.8, 1.3));
    } else if (kind === 'bench' || kind === 'benches') {
      const yawS = rot ? Math.PI / 2 : 0;
      if (kind === 'benches') {
        bench(gb, placeFrame(x - Math.sin(yawS) * 0.3, y, z - Math.cos(yawS) * 0.3, yawS + Math.PI), 7, true);
        bench(gb, placeFrame(x + Math.sin(yawS) * 0.3, y, z + Math.cos(yawS) * 0.3, yawS), 7, false);
        boxes.push(aabb(placeFrame(x, y, z, yawS), 3.5, 0, 1.15, 0.6));
      } else {
        bench(gb, placeFrame(x, y, z, yawS), 7, true);
        boxes.push(aabb(placeFrame(x, y, z, yawS), 3.5, 0, 1.15, 0.32));
      }
    } else if (kind === 'slab') {
      const tilt = Math.atan2(ex.h, ex.d) * 0.9;
      const base = placeFrame(x, y, z, yaw, { normal });
      const m = base.clone().multiply(new THREE.Matrix4().makeTranslation(0, Math.sin(tilt) * ex.d / 2 + 0.1, 0)).multiply(new THREE.Matrix4().makeRotationX(-tilt));
      slab(gb, m, ex.w, ex.d, ex.h, R);
      const bb = aabb(m, ex.w / 2, -0.2, 0.2, ex.d / 2);
      boxes.push([bb[0] + 0.3, bb[1], bb[2] + 0.3, bb[3] - 0.3, bb[1] + (bb[4] - bb[1]) * 0.55, bb[5] - 0.3]);
    } else if (kind === 'rubble') {
      rubblePile(gb, boxes, x, z, ex.w / 2, ex.d / 2, ex.h, R, 0x8a8174, y);
    }
  }
  streetFurniture(gb, boxes, ty, R);
  craterDebris(gb, boxes, ty, tn, road, R);
}

/** lamps down the sidewalks, signals at the corners, hydrants, litter, heaps at the ruins' feet */
function streetFurniture(gb, boxes, ty, R) {
  const B = BOUNDS;
  const inMap = (x, z) => x > B.minX - 5 && x < B.maxX + 5 && z > B.minZ - 5 && z < B.maxZ + 5;
  const runs = [
    { x: -106.4, z0: -30, z1: 100, face: 0 }, { x: -86.8, z0: -30, z1: 100, face: Math.PI },
    { z: -35.4, x0: -100, x1: -76, face: Math.PI / 2 },
    { z: -27, x0: -20, x1: 76, face: Math.PI / 2 },
    { x: 79.8, z0: -24, z1: 54, face: 0 },
  ];
  for (const r of runs) {
    const along = r.x !== undefined ? 'z' : 'x', a = along === 'z' ? r.z0 : r.x0, b = along === 'z' ? r.z1 : r.x1;
    for (let u = a; u <= b; u += 22 + R() * 6) {
      const x = along === 'z' ? r.x : u, z = along === 'z' ? u : r.z;
      if (!inMap(x, z)) continue;
      const k = R();
      lamp(gb, x, z, ty(x, z), r.face, (R() < 0.5 ? -1 : 1) * (k < 0.22 ? 1.2 + R() * 0.35 : k < 0.35 ? 0.25 + R() * 0.3 : 0), false);
    }
  }
  signal(gb, -106.8, -35.2, 0, 7, true);
  signal(gb, -86.6, -48.2, Math.PI, 7, false);
  signal(gb, 80.2, -28, 0, 8, true);
  // hydrants
  for (const [x, z] of [[-106.8, 18], [-86.6, 58], [-86.6, -20], [-30, -27.6], [79.4, 40]]) {
    sol(gb, 0xb3261e, { rough: 0.5, metal: 0.2, grime: 0.5 });
    const y = ty(x, z);
    gb.cyl(x, z, 0.2, 0.18, y, y + 0.75, 10, true); gb.cyl(x, z, 0.24, 0.24, y + 0.75, y + 0.85, 10, true);
  }
  // rubble heaped at the feet of the broken towers along State Street and Wabash
  for (const bld of BUILDINGS) {
    if (bld.top === 'intact') continue;
    const [x0, z0, x1, z1] = bld.box;
    const sides = [];
    if (x1 < B.minX + 1 && x1 > B.minX - 1) sides.push(['x', x1 + 2.2, z0, z1]);
    for (const [, x, a, b] of sides) for (let z = a + 4; z < b - 4; z += 9 + R() * 8) {
      if (!inMap(x, z) || R() < 0.35) continue;
      rubblePile(gb, boxes, x, z, 1.6 + R() * 1.4, 2 + R() * 2, 1 + R() * 1.4, R, 0x857c70, ty(x, z));
    }
  }
  // paper and grit everywhere: flat scraps
  for (let i = 0; i < 520; i++) {
    const x = B.minX + R() * (B.maxX - B.minX), z = B.minZ + R() * (B.maxZ - B.minZ);
    const y = ty(x, z);
    if (Math.abs(y) > 0.3) continue;
    const c = R() < 0.5 ? [0x9c968a, 0x86806f, 0x77705f][Math.floor(R() * 3)] : 0x4a4640;
    sol(gb, c, { rough: 0.95, grime: 0.6 });
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y + 0.02, z), new THREE.Quaternion().setFromAxisAngle(UPV, R() * Math.PI), new THREE.Vector3(1, 1, 1));
    gb.setXf(m);
    const s = 0.1 + R() * 0.22;
    gb.box(-s, 0, -s * 0.7, s, 0.015 + (c === 0x4a4640 ? s * 0.4 : 0), s * 0.7, 'Y');
    gb.setXf(null);
  }
}
