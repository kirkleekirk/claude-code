// The dead, after CastleMiner Z's: the avatar's boy starved down to skin and bone, grey-green and
// rotting, in what's left of a shirt and trousers, with long stringy hair, eyes burning red in
// sunken sockets and the teeth bared. Every one is a little different (a seed picks the rags,
// the hair, the skin and how far gone they are), but they all come off the same rig as the
// players, so they move with the same animations.

import * as THREE from 'three';
import { avatarAssets } from './assets.js';
import { mulberry32, Noise, smoothstep } from '../../core/noise.js';

// the rig in its bind pose (a T-pose): the arms lie along x at this height, the legs hang here
const ARM_Y = 1.03, ARM_Z = -0.012, WRIST = 0.515;
const LEG_X = 0.088, LEG_Z = -0.01;
const HEAD_C = new THREE.Vector3(0, 1.31, -0.005);

const SKINS = [0x6e7262, 0x76796a, 0x666b58, 0x7a7866, 0x6a705e, 0x80806e, 0x727a62];
const HAIRS = [0x3e3a26, 0x2a2620, 0x4a4030, 0x1e1c18, 0x55503e, 0x3a2e22];
const SHIRTS = [0x5a5638, 0x4a3c2c, 0x4c5560, 0x7a7466, 0x3c4a34, 0x5c3a30, 0x464a3a];
const TROUSERS = [0xffffff, 0xc8b090, 0x9a9080, 0xd0c8b8];

// Thin everything down. The same for the skin and the clothes over it, so they stay together;
// blended by position, so the joins (shoulders, hips, neck) stay smooth.
function starve(v) {
  const ax = Math.abs(v.x), sx = Math.sign(v.x) || 1;
  // arms: closer to the bone, and long bony fingers
  const arm = smoothstep(0.13, 0.21, ax) * smoothstep(0.8, 0.92, v.y);
  if (arm > 0) {
    const f = 1 - arm * (ax > WRIST ? 0.25 : 0.36);
    v.y = ARM_Y + (v.y - ARM_Y) * f;
    v.z = ARM_Z + (v.z - ARM_Z) * f;
    if (ax > WRIST) v.x = sx * (WRIST + (ax - WRIST) * 1.3);
  }
  // legs
  const leg = smoothstep(0.7, 0.58, v.y);
  if (leg > 0) {
    const f = 1 - leg * 0.3, cx = sx * LEG_X;
    v.x = cx + (v.x - cx) * f;
    v.z = LEG_Z + (v.z - LEG_Z) * f;
  }
  // a narrow chest, the belly sucked in under the ribs
  const torso = (1 - arm) * smoothstep(0.6, 0.7, v.y) * smoothstep(1.16, 1.08, v.y);
  if (torso > 0) {
    const waist = smoothstep(1.0, 0.8, v.y);
    v.x *= 1 - torso * (0.1 + waist * 0.08);
    v.z *= 1 - torso * (v.z > 0 ? 0.16 + waist * 0.2 : 0.12);
  }
  // a scrawny neck
  const neck = smoothstep(1.08, 1.13, v.y) * (1 - arm);
  if (neck > 0) {
    v.x *= 1 - neck * 0.26;
    v.z = -0.03 + (v.z + 0.03) * (1 - neck * 0.22);
  }
}

// Hollow cheeks and a long jaw.
function gaunt(v) {
  const low = smoothstep(1.3, 1.19, v.y);
  const front = smoothstep(-0.02, 0.1, v.z);
  v.x *= 1 - 0.13 * low * (0.4 + 0.6 * front);
  if (v.y < 1.23) v.y -= (1.23 - v.y) * 0.16;
}

// Triangles of a part to keep, for rags: torn away more toward the edges, with holes.
function tatters(part, seed, rule) {
  const P = part.pos;
  const n = new Noise(seed), m = new Noise(seed + 17);
  return (a, b, c) => {
    const x = (P[a * 3] + P[b * 3] + P[c * 3]) / 3;
    const y = (P[a * 3 + 1] + P[b * 3 + 1] + P[c * 3 + 1]) / 3;
    const z = (P[a * 3 + 2] + P[b * 3 + 2] + P[c * 3 + 2]) / 3;
    return rule(x, y, z, n.n3(x * 14, y * 14, z * 14), m.n3(x * 7 + 3, y * 7, z * 7));
  };
}

// Long stringy hair, in strands hanging from the scalp, and rags hanging from the shirt.
function ribbons(list, color) {
  const pos = [], nor = [], col = [];
  const c = new THREE.Color();
  for (const r of list) {
    // r: { pts: [Vector3...], side: Vector3 (across the strip), w, fold, shade }
    const N = r.pts.length;
    for (let i = 0; i < N - 1; i++) {
      for (const half of [-1, 1]) {
        const quad = [];
        for (const [k, s] of [[i, 0], [i, 1], [i + 1, 1], [i + 1, 0]]) {
          const t = k / (N - 1);
          const w = r.w * (1 - t * 0.55);
          const p = r.pts[k];
          const out = r.out[k];
          // a shallow fold down the middle of the strip, so it catches the light like a strand
          quad.push(new THREE.Vector3().copy(p).addScaledVector(r.side, half * s * w).addScaledVector(out, (1 - s) * r.fold * w));
        }
        const [a, b, cc, d] = half > 0 ? quad : [quad[1], quad[0], quad[3], quad[2]];
        const nrm = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a)).normalize();
        for (const v of [a, b, cc, a, cc, d]) {
          pos.push(v.x, v.y, v.z);
          nor.push(nrm.x, nrm.y, nrm.z);
          const t = Math.min(1, (r.pts[0].y - v.y) / Math.max(0.01, r.pts[0].y - r.pts[N - 1].y));
          c.setHex(color).multiplyScalar(r.shade * (0.6 + 0.4 * Math.min(1, t * 3)) * (1 - 0.25 * t));
          col.push(c.r, c.g, c.b);
        }
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

function hairStrands(rand, length) {
  const list = [];
  // the skull, roughly: a sphere round HEAD_C, a little wider than it is deep
  const R = 0.168;
  for (let i = 0; i < 84; i++) {
    // round the head from the front (0) through the sides to the back (pi), both ways
    const th = (rand() * 2 - 1) * Math.PI;
    const front = Math.cos(th);
    // the face stays clear, but for a few strands over the forehead
    const bang = front > 0.75;
    if (front > 0.42 && !bang) continue;
    if (bang && rand() < 0.5) continue;
    const out = new THREE.Vector3(Math.sin(th), 0, Math.cos(th));
    const side = new THREE.Vector3(Math.cos(th), 0, -Math.sin(th));
    // rooted on the scalp, from the crown down to above the ears
    const y0 = HEAD_C.y + (bang ? 0.12 : 0.05 + rand() * 0.1);
    const back = Math.max(0, -front);
    const L = bang ? 0.08 + rand() * 0.05 : length * (0.8 + rand() * 0.45) * (0.75 + 0.35 * back);
    const pts = [], outs = [];
    const S = 7;
    const wob = rand() * 6.28, lift = 0.004 + rand() * 0.014, drift = (rand() - 0.5) * 0.05;
    for (let k = 0; k < S; k++) {
      const t = k / (S - 1);
      const y = y0 - L * t;
      // over the curve of the skull (just off it), then hanging straight and a little apart
      const dy = Math.max(-R * 0.98, Math.min(R * 0.98, y - HEAD_C.y));
      const skull = y > HEAD_C.y ? Math.sqrt(R * R - dy * dy) : R;
      const r = skull * (1 - 0.07 * (1 - Math.abs(out.x))) + lift + (y < HEAD_C.y ? (HEAD_C.y - y) * 0.15 : 0);
      const p = new THREE.Vector3(HEAD_C.x, y, HEAD_C.z).addScaledVector(out, r + t * t * 0.02).addScaledVector(side, Math.sin(wob + t * 3) * 0.012 * t + drift * t * t);
      // over the shoulders, not through them
      if (Math.abs(out.x) > 0.55 && p.y < 1.14) p.y = 1.14 - (1.14 - p.y) * 0.15;
      pts.push(p);
      outs.push(out);
    }
    list.push({ pts, out: outs, side, w: 0.011 + rand() * 0.01, fold: 0.45, shade: 0.6 + rand() * 0.6 });
  }
  return list;
}

function rags(rand) {
  const list = [];
  const n = 9 + Math.floor(rand() * 6);
  for (let i = 0; i < n; i++) {
    const th = (i / n) * Math.PI * 2 + rand() * 0.4;
    const out = new THREE.Vector3(Math.sin(th), 0, Math.cos(th));
    const side = new THREE.Vector3(Math.cos(th), 0, -Math.sin(th));
    const L = 0.05 + rand() * 0.09;
    const pts = [], outs = [];
    for (let k = 0; k < 4; k++) {
      const t = k / 3;
      pts.push(new THREE.Vector3(out.x * (0.155 + t * 0.02), 0.7 - L * t, out.z * (0.115 + t * 0.02) - 0.005));
      outs.push(out);
    }
    list.push({ pts, out: outs, side, w: 0.025 + rand() * 0.02, fold: 0.15, shade: 0.75 + rand() * 0.35 });
  }
  return list;
}

const looks = new Map();

// The look for a zombie (built once per seed; the horde shares a handful of them).
export function zombieLook(seed = 1) {
  if (looks.has(seed)) return looks.get(seed);
  const A = avatarAssets();
  const rand = mulberry32(seed * 7919 + 13);
  const pick = (a) => a[Math.floor(rand() * a.length)];
  const hair = pick(HAIRS), shirt = pick(SHIRTS);
  const hairLen = 0.24 + rand() * 0.14;
  const shoes = rand() < 0.4;
  const look = {
    name: 'zombie',
    sex: 'm',
    seed,
    skin: pick(SKINS),
    rot: 1,
    grime: 1,
    tear: 0.6 + rand() * 0.4,
    blinks: false,
    hair: { style: 'short', color: hair },
    top: {
      tint: shirt,
      keep: tatters(A.parts.m_top, seed, (x, y, z, n) => {
        if (y < 0.76 && n > -0.25 + (y - 0.666) * 9) return false; // the hem in shreds
        if (Math.abs(x) > 0.24 && n > 0.1 - (Math.abs(x) - 0.24) * 4) return false; // the sleeves
        return true;
      }),
    },
    bottoms: {
      tint: pick(TROUSERS),
      keep: tatters(A.parts.m_bottoms, seed + 5, (x, y, z, n) => !(y < 0.42 && n > (y - 0.12) * 3.2 - 0.55)), // ragged below the knee
    },
    shoes: shoes ? { tint: 0x6a6058 } : null,
    face: {
      eyes: rand() < 0.7 ? 0 : 3,
      brows: rand() < 0.6 ? 2 : 1,
      mouth: pick([2, 2, 13, 12]),
      iris: 0xff3a1a,
      white: 0x1c0604,
      teeth: 0xa0905e,
      lip: 0x3a0c08,
      brow: 0x1c1810,
      socket: 0.85,
      eyeScale: 1.45,
      irisLo: 0.05,
    },
    glow: [2.4, 0.22, 0.06],
    bodyTransform: (v) => starve(v),
    clothTransform: (v) => starve(v),
    headTransform: (v) => gaunt(v),
    build: (b) => {
      // the strands follow the head, and the lower ends the shoulders a little
      const weights = (x, y) => {
        const h = Math.min(1, Math.max(0.35, (y - 1.1) / 0.14));
        return h >= 1 ? [['HEAD__Skeleton', 1]] : [['HEAD__Skeleton', h], ['NECK__Skeleton', 1 - h]];
      };
      const strands = ribbons(hairStrands(rand, hairLen), hair);
      strands.attributes.position.array.forEach((_, i, arr) => {
        if (i % 3 !== 0) return;
        const v = new THREE.Vector3(arr[i], arr[i + 1], arr[i + 2]);
        gaunt(v);
        arr[i] = v.x; arr[i + 1] = v.y; arr[i + 2] = v.z;
      });
      b.addSkinned(strands, weights, hair);
      // rags hanging from the shirt's hem
      const rg = ribbons(rags(rand), shirt);
      b.addSkinned(rg, () => [['BASE__Skeleton', 1]], shirt, 0, 1);
    },
  };
  looks.set(seed, look);
  return look;
}
