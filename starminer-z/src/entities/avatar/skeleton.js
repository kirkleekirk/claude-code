// The skeletons that rattle out of the dark underground: the rig's own bones made bone. The
// skull is the avatar's head, blanched, with the eyes gone to black sockets and a pinprick of
// red light in each; spine, ribs, pelvis, limb and finger bones are built here; the feet are the
// avatar's own, thinned to knuckles. Everything is skinned by borrowing the weights of the
// nearest point of the avatar's body, so the bones move exactly as the body would have.

import * as THREE from 'three';
import { avatarAssets } from './assets.js';
import { mulberry32, smoothstep } from '../../core/noise.js';
import { regions } from './model.js';

const BONE = [0xd8cfb2, 0xcfc4a2, 0xe0d8c0, 0xc8bc98];
const ARM_Y = 1.03, ARM_Z = -0.012, WRIST = 0.515, LEG_X = 0.088, LEG_Z = -0.01;

// weights for a point from the nearest vertex of the avatar's body
function weightTransfer() {
  const body = avatarAssets().parts.m_body;
  const P = body.pos, n = body.count;
  return (x, y, z) => {
    let best = 0, bd = Infinity;
    for (let i = 0; i < n; i++) {
      const dx = P[i * 3] - x, dy = P[i * 3 + 1] - y, dz = P[i * 3 + 2] - z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < bd) { bd = d; best = i; }
    }
    const out = [];
    for (let k = 0; k < 4; k++) if (body.wt[best * 4 + k] > 0) out.push([body.idx[best * 4 + k], body.wt[best * 4 + k]]);
    return out;
  };
}

// A long bone from a to b: a shaft with knobs at the ends.
function longBone(a, b, r, knob = 1.6) {
  const len = a.distanceTo(b);
  const parts = [];
  const shaft = new THREE.CylinderGeometry(r * 0.85, r, len, 7, 3);
  // a little waisted in the middle
  const p = shaft.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = p.getY(i) / len + 0.5;
    const k = 1 - 0.22 * Math.sin(t * Math.PI);
    p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k);
  }
  shaft.computeVertexNormals();
  parts.push(shaft);
  const e1 = new THREE.SphereGeometry(r * knob, 8, 6); e1.translate(0, -len / 2, 0); e1.scale(1, 0.8, 1);
  const e2 = new THREE.SphereGeometry(r * knob * 0.9, 8, 6); e2.translate(0, len / 2, 0);
  parts.push(e1, e2);
  const g = merge(parts);
  // lay it along a -> b
  const dir = new THREE.Vector3().subVectors(b, a).normalize();
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  g.translate(mid.x, mid.y, mid.z);
  return g;
}

function tube(points, r, segs = 10) {
  const curve = new THREE.CatmullRomCurve3(points);
  return new THREE.TubeGeometry(curve, segs, r, 5, false);
}

function merge(list) {
  const pos = [], nor = [];
  for (const g0 of list) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    pos.push(...g.attributes.position.array);
    nor.push(...g.attributes.normal.array);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}

function shade(g, hex, k) {
  const c = new THREE.Color(hex).multiplyScalar(k);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

function bones(rand) {
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const list = [];
  // the spine, from the tail to under the skull
  for (let y = 0.76; y < 1.2; y += 0.027) {
    const w = y > 1.1 ? 0.022 : 0.03;
    const v = new THREE.BoxGeometry(w, 0.017, 0.026);
    v.translate(0, y, -0.05 + Math.sin((y - 0.76) * 5) * 0.012);
    list.push(v);
    const sp = new THREE.BoxGeometry(0.01, 0.012, 0.026); // the spinous process
    sp.translate(0, y - 0.004, -0.072 + Math.sin((y - 0.76) * 5) * 0.012);
    list.push(sp);
  }
  // the ribs, curving round from the spine and down toward the breastbone
  for (let k = 0; k < 7; k++) {
    const y = 1.065 - k * 0.026;
    const rx = 0.085 + Math.sin((k + 1) / 8 * Math.PI) * 0.03, rz = 0.07 + Math.sin((k + 1) / 8 * Math.PI) * 0.012;
    for (const s of [-1, 1]) {
      const pts = [];
      const end = Math.PI - (k < 5 ? 0.42 : 0.9);
      for (let i = 0; i <= 8; i++) {
        const a = (i / 8) * end;
        pts.push(V(s * Math.sin(a) * rx, y - 0.035 * (a / Math.PI) - 0.01 * Math.sin(a), -Math.cos(a) * rz - 0.004));
      }
      list.push(tube(pts, 0.0065, 10));
    }
  }
  // breastbone, collarbones, shoulder blades
  list.push(longBone(V(0, 0.93, 0.07), V(0, 1.06, 0.072), 0.009, 1.2));
  for (const s of [-1, 1]) {
    list.push(tube([V(0, 1.07, 0.068), V(s * 0.06, 1.08, 0.05), V(s * 0.115, 1.06, 0.0)], 0.0075, 6));
    const blade = new THREE.SphereGeometry(0.05, 8, 6);
    blade.scale(1, 1.15, 0.22);
    blade.rotateZ(s * 0.25);
    blade.translate(s * 0.07, 1.0, -0.07);
    list.push(blade);
  }
  // the pelvis: a basin, and the hip bones' wings
  const basin = new THREE.TorusGeometry(0.07, 0.02, 6, 14);
  basin.rotateX(Math.PI / 2);
  basin.scale(1, 1, 0.75);
  basin.translate(0, 0.73, -0.01);
  list.push(basin);
  for (const s of [-1, 1]) {
    // flared blades, edge-on from the front
    const wing = new THREE.SphereGeometry(0.05, 9, 7);
    wing.scale(0.22, 0.85, 0.95);
    wing.rotateY(s * 0.55);
    wing.rotateZ(-s * 0.35);
    wing.translate(s * 0.07, 0.785, -0.02);
    list.push(wing);
  }
  // arms and legs
  for (const s of [-1, 1]) {
    const sh = V(s * 0.12, ARM_Y, ARM_Z), el = V(s * 0.31, ARM_Y, ARM_Z), wr = V(s * (WRIST - 0.01), ARM_Y, ARM_Z);
    list.push(longBone(sh, el, 0.013));
    list.push(longBone(el, wr.clone().add(V(0, 0, 0.007)), 0.0075, 1.5));
    list.push(longBone(el.clone().add(V(0, -0.004, -0.008)), wr.clone().add(V(0, 0, -0.008)), 0.0065, 1.4));
    const hip = V(s * 0.08, 0.7, LEG_Z), knee = V(s * 0.082, 0.385, LEG_Z), ankle = V(s * 0.09, 0.105, LEG_Z - 0.01);
    list.push(longBone(hip, knee, 0.016));
    const cap = new THREE.SphereGeometry(0.02, 8, 6); cap.scale(1, 1, 0.6); cap.translate(s * 0.082, 0.385, LEG_Z + 0.03);
    list.push(cap);
    list.push(longBone(knee, ankle, 0.013));
    list.push(longBone(knee.clone().add(V(s * 0.018, -0.02, -0.006)), ankle.clone().add(V(s * 0.016, 0.01, -0.004)), 0.006, 1.3));
    // the hand: carpals, and a chain of bones down each finger, on the rig's own finger joints
    const carpus = new THREE.SphereGeometry(0.016, 7, 5);
    carpus.scale(1.3, 0.6, 1.5);
    carpus.translate(s * 0.53, 1.022, -0.028);
    list.push(carpus);
    for (const [z, x0, x1, x2, len] of [[0.009, 0.607, 0.647, 0.675, 0.024], [-0.017, 0.608, 0.651, 0.681, 0.026], [-0.043, 0.603, 0.643, 0.673, 0.024], [-0.066, 0.591, 0.626, 0.651, 0.02]]) {
      const y = 1.003;
      const pts = [V(s * 0.54, 1.02, -0.028 + (z + 0.028) * 0.5), V(s * x0, y, z), V(s * x1, y, z), V(s * x2, y, z), V(s * (x2 + len), y - 0.002, z)];
      for (let i = 0; i < 4; i++) list.push(longBone(pts[i], pts[i + 1], i === 0 ? 0.0048 : 0.0042 - i * 0.0004, 1.35));
    }
    const th = [V(s * 0.52, 1.024, -0.012), V(s * 0.57, 0.998, 0.024), V(s * 0.598, 0.984, 0.04), V(s * 0.622, 0.974, 0.052)];
    for (let i = 0; i < 3; i++) list.push(longBone(th[i], th[i + 1], 0.0052 - i * 0.0005, 1.35));
  }
  return list.map((g) => shade(g, BONE[0], 0.88 + rand() * 0.2));
}

// Feet: the avatar's own, thinned down to the bones.
function knuckles(v, region) {
  const ax = Math.abs(v.x), sx = Math.sign(v.x) || 1;
  if (region === 'hand') {
    const f = 0.55;
    v.y = ARM_Y + (v.y - ARM_Y) * f;
    v.z = ARM_Z + (v.z - ARM_Z) * 0.7;
    if (ax > WRIST) v.x = sx * (WRIST + (ax - WRIST) * 1.12);
  } else if (region === 'foot') {
    const cx = sx * LEG_X;
    v.x = cx + (v.x - cx) * 0.62;
    v.y *= 0.85;
  }
}

function skull(v) {
  // the cheeks fallen in, the jaw narrow; the cranium as it was
  const low = smoothstep(1.29, 1.17, v.y);
  v.x *= 1 - 0.2 * low;
  if (v.z > 0) v.z *= 1 - 0.1 * low;
  if (v.y < 1.22) v.y -= (1.22 - v.y) * 0.12;
}

let shared = null;

export function skeletonLook(seed = 1) {
  if (shared?.seed === seed) return shared;
  const rand = mulberry32(seed * 104729 + 7);
  const bone = BONE[Math.floor(rand() * BONE.length)];
  const R = regions().m_body;
  const look = {
    name: 'skeleton',
    sex: 'm',
    seed,
    skin: bone,
    bodyPart: 4,
    aged: 1,
    blinks: false,
    hair: { style: 'none' },
    top: null, bottoms: null, shoes: null,
    face: {
      eyes: 0, brows: -100, mouth: 13,
      iris: 0xff5a20,
      white: 0x000000,
      teeth: 0xe2d8bc,
      lip: 0x0a0604,
      socket: 1,
      eyeScale: 2.6,
      irisLo: 0.05,
      nose: [0, 1.236, 0.15, 0.03],
    },
    headScale: 0.92,
    glow: [3.2, 0.5, 0.12],
    bodyKeep: (a, b, c) => [a, b, c].every((i) => R[i] === 'foot'),
    bodyTransform: (v, region) => knuckles(v, region),
    headTransform: (v) => skull(v),
    build: (b) => {
      const transfer = weightTransfer();
      for (const g of bones(rand)) b.addSkinned(g, transfer, bone, 4, 0);
    },
  };
  shared = look;
  return look;
}
