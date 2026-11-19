import { Matrix4 } from 'three';
import { clamp, lerp, smoothstep } from '@/core/math';
import { ARM, Bone, LEG, type Proportions } from '../rig';
import { Region, type ClothSpec } from './cloth';
import type { Paint, SkinBuilder } from './SkinBuilder';

/**
 * The body: torso, neck, head, arms, hands, legs and shoes. Clothing is part of the body surface
 * (regions plus a little inflation and a lip at every hem), so a person is one closed, smooth,
 * skinned shape. Separate garments (skirts, collars, hoods, aprons) live in `garments.ts`.
 */

const _wheel = new Matrix4();

/** Sole weights: heel on the foot bone, toe box on the toe bone. */
function soleWeights(foot: number, toe: number) {
  return (_x: number, _y: number, z: number, _t: number, o: Paint) => {
    const wt = smoothstep(-0.085, -0.13, z);
    o.b0 = foot;
    o.w0 = 1 - wt;
    o.b1 = toe;
    o.w1 = wt;
  };
}

const gauss = (x: number, mu: number, sigma: number) => Math.exp(-((x - mu) * (x - mu)) / (2 * sigma * sigma));
const TAU = Math.PI * 2;

/** Torso keys: y, half-width, half-depth, centre z (neutral build). */
const TORSO: ReadonlyArray<readonly [number, number, number, number]> = [
  [0.835, 0.07, 0.056, 0.0],
  [0.86, 0.136, 0.092, 0.006],
  [0.9, 0.162, 0.106, 0.01],
  [0.95, 0.167, 0.11, 0.009],
  [1.0, 0.155, 0.102, 0.002],
  [1.05, 0.139, 0.095, -0.004],
  [1.1, 0.135, 0.095, -0.008],
  [1.16, 0.143, 0.1, -0.012],
  [1.22, 0.151, 0.106, -0.014],
  [1.28, 0.157, 0.109, -0.012],
  [1.34, 0.162, 0.105, -0.007],
  [1.39, 0.165, 0.096, -0.001],
  [1.43, 0.157, 0.083, 0.004],
  [1.455, 0.118, 0.068, 0.007],
  [1.475, 0.062, 0.054, 0.008],
];

interface Section {
  w: number;
  front: number;
  back: number;
  zc: number;
}

function torsoSection(y: number, p: Proportions, out: Section): Section {
  let i = 0;
  while (i < TORSO.length - 2 && TORSO[i + 1]![0] < y) i++;
  const a = TORSO[i]!, b = TORSO[i + 1]!;
  const t = smoothstep(0, 1, clamp((y - a[0]) / (b[0] - a[0]), 0, 1));
  const w = lerp(a[1], b[1], t), d = lerp(a[2], b[2], t);
  const hipK = 1 - smoothstep(0.98, 1.08, y);
  const shK = smoothstep(1.33, 1.41, y);
  const chestK = smoothstep(1.13, 1.23, y) * (1 - shK);
  const waistK = clamp(1 - hipK - chestK - shK, 0, 1);
  const ws = hipK * p.hips + waistK * p.waist + chestK * p.chest + shK * p.shoulders;
  out.w = w * ws;
  const ds = 0.55 + 0.45 * ws;
  const belly = p.belly * 0.42 * gauss(y, 1.1, 0.08);
  const bust = Math.max(0, p.chest - 1.02) * 0.9 * gauss(y, 1.255, 0.055);
  const seat = Math.max(0, p.hips - 0.94) * 0.55 * gauss(y, 0.925, 0.055);
  const blades = 0.05 * gauss(y, 1.32, 0.06);
  out.front = d * ds * (1 + belly + bust);
  out.back = d * ds * (1 + seat + blades);
  out.zc = lerp(a[3], b[3], t) - belly * 0.012;
  return out;
}

/** Shared painter state for one person. */
export interface BodyCtx {
  readonly b: SkinBuilder;
  readonly p: Proportions;
  readonly c: ClothSpec;
  readonly joints: Float32Array;
}

/** Region of the torso surface at (x, y, z) for this outfit. */
function torsoRegion(ctx: BodyCtx, x: number, y: number, z: number, front: boolean): number {
  const c = ctx.c;
  const ax = Math.abs(x);
  if (c.skirt && y < c.skirt.top) return c.skirt.region === 2 ? Region.TOP : Region.BOTTOM;
  const midriff = c.midriff && y > c.midriff[0] && y < c.midriff[1];
  const inTop = y >= c.topHem && !midriff;
  if (!inTop) {
    if (midriff) return Region.SKIN;
    if (c.pantsEnd >= 0 || c.skirt) return c.sideStripes && ax > ctx.p.hipX + 0.07 && Math.abs(z) < 0.03 ? Region.BOTTOM_TRIM : Region.BOTTOM;
    return Region.SKIN;
  }
  const topRegion = c.apron ? Region.UNDER : Region.TOP;
  // Necklines.
  const neckY = 1.462;
  switch (c.neckline) {
    case 'v':
    case 'open': {
      const depth = c.neckline === 'v' ? 1.37 : 1.385;
      if (front && y > depth + ax * 1.7) return Region.SKIN;
      break;
    }
    case 'scoop':
      if (front && y > 1.405 + (ax * ax) * 2.6) return Region.SKIN;
      if (!front && y > 1.44) return Region.SKIN;
      break;
    case 'strap':
      if (y > 1.36 && Math.abs(ax - 0.088) > 0.016) return Region.SKIN;
      break;
    default:
      if (y > neckY + (front ? 0 : 0.006)) return Region.SKIN;
  }
  if (c.bareShoulders && c.neckline !== 'strap' && ax > 0.118 && y > 1.33) return Region.SKIN;
  // Lapels open over the shirt.
  if (c.lapels && front && y > 1.13 && ax < (y - 1.12) * 0.62) return Region.UNDER;
  if (c.placket > 0 && front && ax < 0.009 && y > c.placket) return Region.TRIM;
  if (c.sideStripes && ax > 0.12 && Math.abs(z) < 0.025 && y > 1.0) return Region.TRIM;
  return topRegion;
}

/** Extra torso radius from clothing at height y. */
function torsoInflate(ctx: BodyCtx, y: number): number {
  const c = ctx.c;
  const midriff = c.midriff && y > c.midriff[0] && y < c.midriff[1];
  if (y >= c.topHem && !midriff) return c.topLoose;
  if (midriff) return 0;
  if (c.pantsEnd >= 0) return y < 1.005 ? 0.006 : 0;
  return 0.002;
}

const _sec: Section = { w: 0, front: 0, back: 0, zc: 0 };

export function buildTorso(ctx: BodyCtx): void {
  const { b, p, c } = ctx;
  const heights = new Set<number>();
  for (let y = 0.835; y <= 1.476; y += 0.026) heights.add(Math.round(y * 1000) / 1000);
  heights.add(1.475);
  const hem = (y: number) => {
    heights.add(y + 0.005);
    heights.add(y + 0.0012);
    heights.add(y - 0.0012);
  };
  if (c.topHem > 0.84 && c.topHem < 1.46) hem(c.topHem);
  if (c.midriff) {
    hem(c.midriff[0]);
    hem(c.midriff[1]);
  }
  if (c.pantsEnd >= 0 && c.topHem > 1.005) hem(1.005);
  const ys = [...heights].filter((y) => y >= 0.835 && y <= 1.475).sort((a, b2) => a - b2);
  const seg = 22;
  const e = 2 / p.exponent;
  b.set(Region.SKIN, Bone.hips).begin();
  let ringZc = 0;
  const painter = (x: number, y: number, z: number, _t: number, o: Paint) => {
    const front = z < ringZc;
    o.region = torsoRegion(ctx, x, y, z, front);
    // Weights: hips → spine → chest; legs pull the lowest rings, clavicles the shoulder tops.
    const wHips = 1 - smoothstep(0.96, 1.08, y);
    const wChest = smoothstep(1.17, 1.3, y);
    const wSpine = Math.max(0, 1 - wHips - wChest);
    const ax = Math.abs(x);
    const leg = (1 - smoothstep(0.85, 0.94, y)) * smoothstep(0.02, 0.07, ax) * 0.55;
    const clav = smoothstep(1.37, 1.45, y) * smoothstep(0.08, 0.15, ax) * 0.45;
    if (leg > 0.001) {
      o.b0 = Bone.hips;
      o.w0 = wHips * (1 - leg);
      o.b1 = x < 0 ? Bone.thighL : Bone.thighR;
      o.w1 = leg;
      o.b2 = Bone.spine;
      o.w2 = wSpine;
    } else if (clav > 0.001) {
      o.b0 = Bone.chest;
      o.w0 = wChest * (1 - clav);
      o.b1 = x < 0 ? Bone.clavL : Bone.clavR;
      o.w1 = clav;
      o.b2 = Bone.spine;
      o.w2 = wSpine;
    } else {
      o.b0 = Bone.hips;
      o.w0 = wHips;
      o.b1 = Bone.spine;
      o.w1 = wSpine;
      o.b2 = Bone.chest;
      o.w2 = wChest;
    }
    // Occlusion: armpits, crotch, under the chin.
    const pit = gauss(y, 1.3, 0.06) * smoothstep(0.1, 0.15, ax) * (1 - Math.abs(z) * 8);
    const crotch = (1 - smoothstep(0.84, 0.9, y)) * (1 - smoothstep(0.02, 0.08, ax));
    o.ao = clamp(1 - Math.max(0, pit) * 0.3 - crotch * 0.35 - smoothstep(1.455, 1.475, y) * 0.12, 0.4, 1);
  };
  let prev: ReturnType<SkinBuilder['ring']> | null = null;
  let first: ReturnType<SkinBuilder['ring']> | null = null;
  for (const y of ys) {
    const s = torsoSection(y, p, _sec);
    ringZc = s.zc;
    const add = torsoInflate(ctx, y) + (isLip(ctx, y) ? 0.004 : 0);
    const start = b.vertexCount;
    for (let i = 0; i < seg; i++) {
      const t = (i / seg) * TAU;
      const cs = Math.cos(t), sn = Math.sin(t);
      const x = Math.sign(cs) * Math.abs(cs) ** e * (s.w + add);
      const depth = (sn < 0 ? s.front : s.back) + add;
      const z = s.zc + Math.sign(sn) * Math.abs(sn) ** e * depth;
      b.vertex(x, y, z, t, painter);
    }
    const ring = { start, count: seg, cx: 0, cy: y, cz: s.zc };
    if (prev) b.bridge(prev, ring, false);
    else first = ring;
    prev = ring;
  }
  // Close the crotch and the neck base.
  if (first) b.cap(first, 0, 0.828, 0.004, true, painter);
  if (prev) b.cap(prev, 0, 1.48, 0.008, false, painter);
  b.end();
}

/** True just above a hem: those rings get the lip. */
function isLip(ctx: BodyCtx, y: number): boolean {
  const c = ctx.c;
  const near = (h: number) => y > h + 0.003 && y < h + 0.007;
  return near(c.topHem) || (c.midriff !== null && near(c.midriff[1])) || (c.pantsEnd >= 0 && c.topHem > 1.005 && near(1.005));
}

export function buildNeck(ctx: BodyCtx): void {
  const { b, c } = ctx;
  b.set(Region.SKIN, Bone.neck).begin();
  const high = c.neckline === 'high';
  const painter = (_x: number, y: number, z: number, _t: number, o: Paint) => {
    o.region = high && y < 1.53 ? Region.TRIM : Region.SKIN;
    const wChest = 1 - smoothstep(1.44, 1.5, y);
    const wHead = smoothstep(1.55, 1.6, y);
    o.b0 = Bone.chest;
    o.w0 = wChest;
    o.b1 = Bone.neck;
    o.w1 = Math.max(0, 1 - wChest - wHead);
    o.b2 = Bone.head;
    o.w2 = wHead;
    o.ao = z < 0 && y > 1.54 ? 0.72 : 0.92;
  };
  let prev = null;
  for (const [y, r, z] of [[1.43, 0.06, 0.006], [1.47, 0.052, 0.007], [1.5, 0.048, 0.008], [1.53, 0.046, 0.01], [1.57, 0.045, 0.012], [1.61, 0.044, 0.016]] as const) {
    const add = high && y < 1.535 ? 0.014 : 0;
    const ring = b.hring(0, y, z, r + add, (r + add) * 0.94, 2, 16, painter);
    if (prev) b.bridge(prev, ring, false);
    prev = ring;
  }
  b.end();
}

/** Face shapes: jaw width, cheek fullness, chin length, head length. */
const FACES: ReadonlyArray<readonly [number, number, number, number]> = [
  [0.82, 0.96, 1.0, 1.0],
  [0.95, 1.05, 0.88, 0.97],
  [1.04, 0.96, 0.96, 1.0],
  [0.74, 1.02, 1.04, 1.0],
  [0.86, 0.92, 1.12, 1.05],
  [0.78, 1.08, 1.0, 1.0],
];

/** Head centre and radius in body space (the face shader reads these). */
export const HEAD = { x: 0, y: 1.645, z: 0.006, r: 0.118 } as const;

export interface HeadShape {
  readonly rx: number;
  readonly ry: number;
  readonly rzF: number;
  readonly rzB: number;
  readonly jaw: number;
  readonly cheek: number;
  readonly chin: number;
  readonly len: number;
}

export function headShape(face: number): HeadShape {
  const [jaw, cheek, chin, len] = FACES[face] ?? FACES[0]!;
  return { rx: 0.084, ry: 0.118 * len, rzF: 0.092, rzB: 0.104, jaw, cheek, chin, len };
}

/** Surface point of the head in the unit direction (dx, dy, dz), relative to `HEAD`. */
export function headPoint(h: HeadShape, dx: number, dy: number, dz: number, out: { x: number; y: number; z: number }): void {
  const lower = smoothstep(-0.05, -0.9, dy);
  const wScale = lerp(1, h.jaw * 0.84, lower) * (1 + (h.cheek - 1) * gauss(dy, -0.2, 0.25));
  let x = dx * h.rx * wScale;
  let y = dy * h.ry;
  const front = dz < 0;
  let z = dz * (front ? h.rzF : h.rzB) * (1 - 0.18 * lower * (front ? 0 : 1));
  // Chin: the lower face reaches a little further down and forward.
  if (front && dy < -0.5) {
    const k = smoothstep(-0.5, -0.95, dy) * smoothstep(0.6, 0.0, Math.abs(dx));
    y -= k * 0.012 * h.chin;
    z -= k * 0.01 * h.chin;
  }
  // Flatter face plane for the painted features; fuller cranium at the back.
  if (front) z *= 1 - 0.12 * gauss(dy, 0.05, 0.4) * smoothstep(0.75, 0.2, Math.abs(dx));
  else z *= 1 + 0.06 * gauss(dy, 0.35, 0.3);
  x *= 1 + 0.04 * gauss(dy, 0.4, 0.3);
  out.x = x;
  out.y = y;
  out.z = z;
}

/** Front surface z of the head at body-space (x, y) (for glasses and facial hair). */
export function faceZ(h: HeadShape, x: number, y: number): number {
  const dy = clamp((y - HEAD.y) / h.ry, -0.99, 0.99);
  const lower = smoothstep(-0.05, -0.9, dy);
  const wScale = lerp(1, h.jaw * 0.84, lower) * (1 + (h.cheek - 1) * gauss(dy, -0.2, 0.25));
  const dx = clamp((x - HEAD.x) / (h.rx * wScale), -0.99, 0.99);
  const dz = -Math.sqrt(Math.max(0.0001, 1 - dx * dx - dy * dy));
  headPoint(h, dx, dy, dz, _hp);
  return HEAD.z + _hp.z;
}

const _hp = { x: 0, y: 0, z: 0 };

export function buildHead(ctx: BodyCtx, face: number): void {
  const { b } = ctx;
  const h = headShape(face);
  const segU = 28, segV = 20;
  b.set(Region.HEAD, Bone.head).begin();
  const painter = (_x: number, y: number, z: number, _t: number, o: Paint) => {
    o.ao = y < HEAD.y - 0.085 && z > HEAD.z - 0.02 ? 0.8 : 1;
  };
  const top = b.vertex(HEAD.x, HEAD.y + h.ry, HEAD.z, 0, painter);
  const rings: number[] = [];
  for (let j = 1; j < segV; j++) {
    const phi = (j / segV) * Math.PI;
    const dy = Math.cos(phi), sr = Math.sin(phi);
    rings.push(b.vertexCount);
    for (let i = 0; i < segU; i++) {
      const t = (i / segU) * TAU;
      headPoint(h, Math.cos(t) * sr, dy, Math.sin(t) * sr, _hp);
      b.vertex(HEAD.x + _hp.x, HEAD.y + _hp.y, HEAD.z + _hp.z, t, painter);
    }
  }
  const bottom = b.vertex(HEAD.x, HEAD.y - h.ry * 0.98, HEAD.z - 0.012, Math.PI, painter);
  for (let i = 0; i < segU; i++) b.tri(top, rings[0]! + ((i + 1) % segU), rings[0]! + i);
  for (let j = 0; j < rings.length - 1; j++) {
    const a = rings[j]!, c = rings[j + 1]!;
    for (let i = 0; i < segU; i++) {
      const i1 = (i + 1) % segU;
      b.tri(a + i, a + i1, c + i1);
      b.tri(a + i, c + i1, c + i);
    }
  }
  const last = rings[rings.length - 1]!;
  for (let i = 0; i < segU; i++) b.tri(last + i, last + ((i + 1) % segU), bottom);
  b.end();
  // Nose: a soft wedge; `extra` = 1 keeps the face painter off it.
  b.set(Region.HEAD, Bone.head).begin();
  b.base.extra = 1;
  const ny = HEAD.y - 0.022 * h.len;
  const nz = faceZ(h, 0, ny) + 0.006;
  b.ellipsoid(HEAD.x, ny, nz, 0.013, 0.024, 0.016, 10, 8, undefined, (_dx, dy, dz) => (dz < 0 ? 1 + 0.25 * (1 - Math.abs(dy)) : 0.7) * (dy < 0 ? 1.05 : 0.9));
  b.end();
  // Ears.
  for (const sx of [-1, 1]) {
    b.begin();
    b.ellipsoid(HEAD.x + sx * h.rx * 0.97, HEAD.y - 0.004, HEAD.z + 0.012, 0.011, 0.03, 0.02, 10, 7);
    b.end();
  }
  b.base.extra = 0;
}

/** Arm radius profile: distance below the shoulder joint → radius (neutral limbs). */
const ARM_R: ReadonlyArray<readonly [number, number]> = [
  [-0.044, 0.024], [-0.034, 0.038], [-0.016, 0.048], [0.01, 0.053], [0.05, 0.051], [0.1, 0.048], [0.16, 0.045], [0.22, 0.042],
  [0.27, 0.0395], [0.29, 0.039], [0.31, 0.0395], [0.35, 0.042], [0.4, 0.041], [0.45, 0.036], [0.5, 0.031], [0.537, 0.0285],
];

export function buildArm(ctx: BodyCtx, side: 0 | 1): void {
  const { b, p, c, joints } = ctx;
  const sx = side === 0 ? -1 : 1;
  const [clav, upper, fore, hand] = ARM[side];
  const jx = joints[upper * 3]!, jy = joints[upper * 3 + 1]!, jz = joints[upper * 3 + 2]!;
  const end = c.sleeve * 0.537;
  const cuff = c.top === 'tracksuit' || c.top === 'hoodie' || c.top === 'windbreaker';
  const sleeveRegion = c.apron ? Region.UNDER : Region.TOP;
  const ss = new Set<number>(ARM_R.map((k) => k[0]));
  if (c.sleeve > 0 && end < 0.53) {
    ss.add(end + 0.0015);
    ss.add(end - 0.0015);
    ss.add(end - 0.006);
  }
  const list = [...ss].sort((a2, b2) => a2 - b2);
  const radius = (s: number) => {
    let i = 0;
    while (i < ARM_R.length - 2 && ARM_R[i + 1]![0] < s) i++;
    const a = ARM_R[i]!, bb = ARM_R[i + 1]!;
    return lerp(a[1], bb[1], smoothstep(0, 1, clamp((s - a[0]) / (bb[0] - a[0]), 0, 1)));
  };
  b.set(Region.SKIN, upper).begin();
  const painter = (x: number, y: number, z: number, t: number, o: Paint) => {
    const s = jy - y;
    const sleeved = c.sleeve > 0 && s < end;
    o.region = sleeved ? sleeveRegion : Region.SKIN;
    if (sleeved && cuff && s > end - 0.035) o.region = Region.TRIM;
    if (sleeved && c.sideStripes && Math.abs(Math.cos(t) - sx) < 0.08) o.region = Region.TRIM;
    if (c.bareShoulders && s < 0.0) o.region = Region.SKIN;
    const wClav = (1 - smoothstep(-0.03, 0.03, s)) * 0.4;
    const wFore = smoothstep(0.255, 0.335, s);
    const wHand = smoothstep(0.49, 0.535, s) * 0.25;
    o.b0 = clav;
    o.w0 = wClav;
    o.b1 = upper;
    o.w1 = Math.max(0, 1 - wClav - wFore);
    o.b2 = wHand > 0 ? hand : fore;
    o.w2 = wHand > 0 ? wHand : wFore;
    if (wHand > 0) {
      o.b1 = fore;
      o.w1 = 1 - wHand;
      o.w0 = 0;
    }
    // The inside of the upper arm sits in the torso's shadow.
    const inward = -Math.cos(t) * sx;
    o.ao = 1 - Math.max(0, inward) * (1 - smoothstep(0.0, 0.2, s)) * 0.28;
    void x;
    void z;
  };
  let prev = null;
  let first = null;
  for (const s of list) {
    const sleeved = c.sleeve > 0 && s < end;
    const loose = sleeved ? c.sleeveLoose + (s > end - 0.007 && s < end ? 0.004 : 0) : 0;
    const r = radius(s) * (0.55 + 0.45 * p.limbs) + loose;
    const ring = b.hring(jx, jy - s, jz + (s > 0.3 ? 0.004 : 0), r, r * 0.95, 2, 14, painter);
    if (prev) b.bridge(prev, ring, true);
    else first = ring;
    prev = ring;
  }
  if (first) b.cap(first, jx, jy + 0.05, jz, false, painter);
  if (prev) b.cap(prev, jx, jy - 0.545, jz + 0.004, true, painter);
  b.end();
  buildHand(ctx, side);
}

/** Mitten hand with a thumb; the palm faces the body. Fingers bend on their own bone. */
function buildHand(ctx: BodyCtx, side: 0 | 1): void {
  const { b, p, joints } = ctx;
  const sx = side === 0 ? -1 : 1;
  const hand = ARM[side][3], fingers = ARM[side][4];
  const hx = joints[hand * 3]!, hy = joints[hand * 3 + 1]!, hz = joints[hand * 3 + 2]! + 0.004;
  const k = 0.8 + 0.2 * p.limbs;
  b.set(Region.SKIN, hand).begin();
  const painter = (_x: number, y: number, _z: number, _t: number, o: Paint) => {
    const s = hy - y;
    const wf = smoothstep(0.07, 0.1, s);
    o.b0 = hand;
    o.w0 = 1 - wf;
    o.b1 = fingers;
    o.w1 = wf;
  };
  const prof: ReadonlyArray<readonly [number, number, number]> = [
    [-0.01, 0.016, 0.026], [0.0, 0.017, 0.029], [0.02, 0.019, 0.036], [0.05, 0.018, 0.041], [0.085, 0.0155, 0.04],
    [0.115, 0.013, 0.037], [0.145, 0.0105, 0.031], [0.162, 0.0075, 0.021],
  ];
  let prev = null;
  let first = null;
  for (const [s, tx, tz] of prof) {
    const ring = b.ring(hx - sx * 0.003, hy - s, hz, 1, 0, 0, 0, 0, 1, tx * k, tz * k, 2.4, 12, painter);
    if (prev) b.bridge(prev, ring, true);
    else first = ring;
    prev = ring;
  }
  if (first) b.cap(first, hx, hy + 0.014, hz, false, painter);
  if (prev) b.cap(prev, hx - sx * 0.003, hy - 0.171, hz, true, painter);
  b.end();
  b.set(Region.SKIN, hand).begin();
  b.tube([[hx + sx * 0.006, hy - 0.018, hz - 0.02], [hx + sx * 0.008, hy - 0.05, hz - 0.034], [hx + sx * 0.006, hy - 0.082, hz - 0.04]], (t) => (0.0115 - t * 0.0025) * k, 8);
  b.end();
}

/** Leg radius profile: distance below the hip joint → radius (neutral). */
const LEG_R: ReadonlyArray<readonly [number, number]> = [
  [-0.07, 0.04], [-0.05, 0.072], [-0.02, 0.085], [0.04, 0.086], [0.12, 0.082], [0.2, 0.077], [0.28, 0.07], [0.36, 0.06],
  [0.42, 0.054], [0.46, 0.054], [0.52, 0.058], [0.58, 0.061], [0.64, 0.057], [0.7, 0.049], [0.76, 0.04], [0.81, 0.035], [0.845, 0.034],
];

export function buildLeg(ctx: BodyCtx, side: 0 | 1): void {
  const { b, p, c, joints } = ctx;
  const sx = side === 0 ? -1 : 1;
  const [thigh, shin, foot] = LEG[side];
  const jx = joints[thigh * 3]!, jy = joints[thigh * 3 + 1]!;
  const pants = c.pantsEnd >= 0;
  const endS = jy - c.pantsEnd;
  const wide = c.bottom === 'linen' || c.bottom === 'trackPants' || c.bottom === 'cargo';
  const ss = new Set<number>(LEG_R.map((k) => k[0]));
  if (pants && endS < 0.83) {
    ss.add(endS - 0.0015);
    ss.add(endS + 0.0015);
    ss.add(endS - 0.006);
  }
  const list = [...ss].sort((a2, b2) => a2 - b2);
  const radius = (s: number) => {
    let i = 0;
    while (i < LEG_R.length - 2 && LEG_R[i + 1]![0] < s) i++;
    const a = LEG_R[i]!, bb = LEG_R[i + 1]!;
    return lerp(a[1], bb[1], smoothstep(0, 1, clamp((s - a[0]) / (bb[0] - a[0]), 0, 1)));
  };
  const thighK = (0.6 + 0.4 * p.limbs) * (0.85 + 0.15 * p.hips);
  const shinK = 0.62 + 0.38 * p.limbs;
  b.set(Region.SKIN, thigh).begin();
  const painter = (_x: number, y: number, _z: number, t: number, o: Paint) => {
    const s = jy - y;
    const covered = pants && s < endS;
    o.region = covered ? Region.BOTTOM : Region.SKIN;
    if (covered && c.sideStripes && Math.abs(Math.cos(t) - sx) < 0.07) o.region = Region.BOTTOM_TRIM;
    const wHips = (1 - smoothstep(-0.06, 0.07, s)) * 0.5;
    const wShin = smoothstep(0.37, 0.46, s);
    const wFoot = smoothstep(0.79, 0.845, s) * 0.3;
    o.b0 = Bone.hips;
    o.w0 = wHips;
    o.b1 = thigh;
    o.w1 = Math.max(0, 1 - wHips - wShin);
    o.b2 = shin;
    o.w2 = wShin;
    if (wFoot > 0) {
      o.b0 = foot;
      o.w0 = wFoot;
      o.b1 = shin;
      o.w1 = 1 - wFoot;
      o.w2 = 0;
    }
    const inward = -Math.cos(t) * sx;
    o.ao = clamp(1 - Math.max(0, inward) * (1 - smoothstep(0.0, 0.12, s)) * 0.4 - (Math.sin(t) > 0.6 ? 0.1 * gauss(s, 0.43, 0.03) : 0), 0.4, 1);
  };
  let prev = null;
  let first = null;
  for (const s of list) {
    const covered = pants && s < endS;
    let r = radius(s) * (s < 0.42 ? thighK : lerp(thighK, shinK, smoothstep(0.42, 0.5, s)));
    if (covered) {
      r += c.pantsLoose + (s > endS - 0.007 && s < endS ? 0.004 : 0);
      if (wide && s > 0.3) r = Math.max(r, 0.066 + c.pantsLoose * 0.5);
    }
    const calf = 0.008 * gauss(s, 0.56, 0.06);
    const ring = b.hring(jx - sx * 0.008 * smoothstep(0.0, 0.42, s), jy - s, calf, r, r * 0.97, 2, 16, painter);
    if (prev) b.bridge(prev, ring, true);
    else first = ring;
    prev = ring;
  }
  if (first) b.cap(first, jx, jy + 0.085, 0, false, painter);
  if (prev) b.cap(prev, jx - sx * 0.008, jy - 0.86, 0, true, painter);
  b.end();
}

/** Shoe outline keys: z, half-width, top height. */
const SHOE: ReadonlyArray<readonly [number, number, number]> = [
  [0.064, 0.03, 0.078], [0.05, 0.037, 0.092], [0.025, 0.041, 0.1], [-0.01, 0.043, 0.098], [-0.045, 0.045, 0.08],
  [-0.08, 0.047, 0.064], [-0.115, 0.047, 0.054], [-0.15, 0.043, 0.047], [-0.175, 0.035, 0.041], [-0.192, 0.022, 0.034],
];

export function buildShoe(ctx: BodyCtx, side: 0 | 1): void {
  const { b, c, joints } = ctx;
  const [, shin, foot, toe] = LEG[side];
  const fx = joints[foot * 3]! * 0.94;
  const style = c.shoes;
  const open = style === 'sandals' || style === 'flipflops';
  const chunky = style === 'sneakers' || style === 'skates' || style === 'boots';
  const slim = style === 'loafers' || style === 'heels';
  const soleH = open ? 0.012 : chunky ? 0.026 : 0.013;
  const top = style === 'skates' ? 0.03 : 0;
  b.set(Region.SHOE, foot).begin();
  const painter = (_x: number, y: number, z: number, _t: number, o: Paint) => {
    o.region = y < soleH ? Region.SOLE : open ? Region.SKIN : Region.SHOE;
    const wt = smoothstep(-0.085, -0.13, z);
    o.b0 = foot;
    o.w0 = 1 - wt;
    o.b1 = toe;
    o.w1 = wt;
    o.ao = y < 0.006 ? 0.55 : 1;
  };
  let prev = null;
  let first = null;
  let lastZ = 0;
  for (const [z, hw, h0] of SHOE) {
    let w = hw + (chunky ? 0.005 : slim ? -0.005 : 0);
    let h = h0 + (open ? -0.016 : chunky ? 0.006 : slim ? -0.012 : 0);
    if (style === 'heels' && z < -0.12) w *= 1 - smoothstep(-0.12, -0.19, z) * 0.35;
    if (z > -0.02) h += top * smoothstep(-0.02, 0.04, z);
    const ring = b.ring(fx, h / 2, z, 1, 0, 0, 0, 1, 0, w, h / 2, chunky ? 3 : 2.6, 16, painter);
    if (prev) b.bridge(prev, ring, false);
    else first = ring;
    prev = ring;
    lastZ = z;
  }
  if (first) b.cap(first, fx, 0.04, 0.072, true, painter);
  if (prev) b.cap(prev, fx, 0.016, lastZ - 0.008, false, painter);
  b.end();
  if (open) {
    // Thin sole and straps over bare feet.
    b.set(Region.SOLE, foot).begin();
    b.ellipsoid(fx, 0.006, -0.062, 0.05, 0.0065, 0.136, 14, 4, soleWeights(foot, toe));
    b.end();
    b.set(Region.SHOE, foot).begin();
    if (style === 'flipflops') {
      b.tube([[fx - 0.035, 0.014, -0.06], [fx - 0.008, 0.03, -0.12], [fx, 0.012, -0.15]], () => 0.005, 6);
      b.tube([[fx + 0.035, 0.014, -0.06], [fx + 0.008, 0.03, -0.12], [fx, 0.012, -0.15]], () => 0.005, 6);
    } else {
      b.tube([[fx - 0.046, 0.016, -0.09], [fx, 0.05, -0.085], [fx + 0.046, 0.016, -0.09]], () => 0.009, 6, undefined, 0.5);
      b.tube([[fx - 0.04, 0.02, 0.0], [fx, 0.072, 0.004], [fx + 0.04, 0.02, 0.0]], () => 0.007, 6, undefined, 0.5);
    }
    b.end();
  }
  if (style === 'boots' || style === 'skates') {
    const tall = style === 'skates' ? 0.2 : 0.27;
    b.set(Region.SHOE, foot).begin();
    const shaftPaint = (_x: number, y: number, _z: number, _t: number, o: Paint) => {
      const w = smoothstep(0.09, 0.16, y);
      o.b0 = foot;
      o.w0 = 1 - w;
      o.b1 = shin;
      o.w1 = w;
    };
    b.lathe(fx, 0, 0.004, [[0.048, 0.05], [0.05, 0.1], [0.049, 0.16], [0.05, tall], [0.042, tall + 0.004]], 14, shaftPaint, 1, 1.05);
    b.end();
  }
  if (style === 'heels') {
    b.set(Region.SOLE, foot).begin();
    b.tube([[fx, 0.03, 0.05], [fx, -0.012, 0.055]], (t) => 0.009 - t * 0.004, 6);
    b.end();
  }
  if (style === 'skates') {
    b.set(Region.SOLE, foot).begin();
    b.ellipsoid(fx, -0.009, -0.045, 0.02, 0.009, 0.125, 10, 4);
    b.end();
    for (const z of [0.045, -0.012, -0.07, -0.128]) {
      // Wheel: a short cylinder with its axle along X.
      _wheel.makeRotationZ(Math.PI / 2).setPosition(fx, -0.047, z);
      b.set(Region.WHEEL, foot).transform(_wheel).begin();
      b.lathe(0, 0, 0, [[0.0001, -0.012], [0.031, -0.012], [0.031, 0.012], [0.0001, 0.012]], 12);
      b.end().transform(null);
    }
  }
}
