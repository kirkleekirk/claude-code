import { clamp, smoothstep } from '@/core/math';
import { ARM, Bone } from '../rig';
import { HEAD, faceZ, headPoint, type BodyCtx, type HeadShape } from './body';
import { Region } from './cloth';
import { HairTex } from './hair';
import type { Paint, SkinBuilder } from './SkinBuilder';

/**
 * Glasses, jewellery, the phone in hand, bags and facial hair. Everything is skinned into the
 * same mesh as the body so a person stays one draw call.
 */

const TAU = Math.PI * 2;
const _p = { x: 0, y: 0, z: 0 };

/** Eye centre in body space (matches the face shader's layout). */
export function eyeCentre(h: HeadShape, eyes: number, side: -1 | 1): [number, number, number] {
  const x = HEAD.x + side * HEAD.r * (0.3 + 0.06 * eyes);
  const y = HEAD.y + HEAD.r * 0.05;
  return [x, y, faceZ(h, x, y)];
}

/** A rounded box from rings (exponent 5 superellipse) along Y. */
function roundBox(b: SkinBuilder, cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, painter?: (x: number, y: number, z: number, t: number, o: Paint) => void): void {
  const r = Math.min(hx, hz) * 0.5;
  const prof: Array<[number, number]> = [[-hy, 0.55], [-hy + r * 0.3, 0.9], [-hy + r, 1], [hy - r, 1], [hy - r * 0.3, 0.9], [hy, 0.55]];
  let prev = null;
  let first = null;
  for (const [dy, k] of prof) {
    const ring = b.ring(cx, cy + dy, cz, 1, 0, 0, 0, 0, 1, hx * k, hz * k, 5, 16, painter);
    if (prev) b.bridge(prev, ring, false);
    else first = ring;
    prev = ring;
  }
  if (first) b.cap(first, cx, cy - hy, cz, true, painter);
  if (prev) b.cap(prev, cx, cy + hy, cz, false, painter);
}

export function buildGlasses(ctx: BodyCtx, h: HeadShape, kind: number, eyes: number): void {
  if (kind <= 0) return;
  const { b } = ctx;
  const frameRegion = kind === 1 || kind === 5 ? Region.METAL : Region.FRAME;
  const tinted = kind === 1 || kind === 4;
  const lensR = kind === 2 ? 0.021 : kind === 5 ? 0.017 : 0.022;
  const centres = [eyeCentre(h, eyes, -1), eyeCentre(h, eyes, 1)];
  const zOff = -0.014;
  if (kind === 4) {
    // Sport wrap: one curved band across both eyes.
    b.set(Region.LENS, Bone.head).begin();
    const pts: Array<[number, number, number]> = [];
    for (let i = 0; i <= 10; i++) {
      const u = (i / 10) * 2 - 1;
      const x = u * 0.078;
      const y = centres[0]![1] + 0.002 - u * u * 0.006;
      pts.push([x, y, faceZ(h, x * 0.92, y) + zOff - 0.002]);
    }
    b.tube(pts, () => 0.0035, 6, undefined, 5.6);
    b.end();
  }
  for (const [cx, cy, cz] of centres) {
    const z = cz + zOff;
    const shape = (t: number): [number, number] => {
      const c = Math.cos(t), s = Math.sin(t);
      if (kind === 1) return [c * lensR * 1.05, s * lensR * (s < 0 ? 1.1 : 0.85)];
      if (kind === 3) return [c * lensR * 1.12, s * lensR * 0.8 + Math.max(0, c * Math.sign(cx)) * 0.008 * Math.max(0, s)];
      if (kind === 5) return [c * lensR * 1.15, Math.min(s, 0.15) * lensR * 0.85];
      return [c * lensR, s * lensR];
    };
    if (tinted && kind !== 4) {
      b.set(Region.LENS, Bone.head).begin();
      const centre = b.vertex(cx, cy, z, 0);
      const start = b.vertexCount;
      for (let i = 0; i < 14; i++) {
        const [ox, oy] = shape((i / 14) * TAU);
        b.vertex(cx + ox, cy + oy, z + 0.002, 0);
      }
      for (let i = 0; i < 14; i++) b.tri(centre, start + ((i + 1) % 14), start + i);
      b.end();
    }
    if (kind !== 4) {
      b.set(frameRegion, Bone.head).begin();
      const ring: Array<[number, number, number]> = [];
      for (let i = 0; i <= 16; i++) {
        const [ox, oy] = shape((i / 16) * TAU);
        ring.push([cx + ox, cy + oy, z]);
      }
      b.tube(ring, () => (kind === 3 ? 0.0028 : 0.0018), 5);
      b.end();
    }
  }
  // Bridge and temples back to the ears.
  b.set(frameRegion, Bone.head).begin();
  const [l, r] = centres;
  const by = l![1] + 0.006;
  b.tube([[l![0] + lensR, by, l![2] + zOff], [0, by + 0.003, faceZ(h, 0, by) + zOff - 0.006], [r![0] - lensR, by, r![2] + zOff]], () => 0.0017, 4);
  for (const [cx, cy, cz] of centres) {
    const sx = Math.sign(cx);
    b.tube([[cx + sx * lensR * 1.05, cy + 0.004, cz + zOff], [sx * (h.rx + 0.006), cy + 0.006, HEAD.z - 0.02], [sx * (h.rx + 0.004), cy - 0.004, HEAD.z + 0.02]], () => 0.0017, 4);
  }
  b.end();
}

export function buildJewelry(ctx: BodyCtx, h: HeadShape, kind: number): void {
  if (kind <= 0) return;
  const { b, p, joints } = ctx;
  if (kind === 1) {
    b.set(Region.METAL, Bone.chest).begin();
    const pts: Array<[number, number, number]> = [];
    for (let i = 0; i <= 20; i++) {
      const t = (i / 20) * TAU;
      const front = Math.max(0, -Math.sin(t));
      pts.push([Math.cos(t) * 0.07, 1.468 - front * 0.045, 0.008 + Math.sin(t) * (0.062 + front * 0.03)]);
    }
    b.tube(pts, () => 0.0035, 5);
    b.end();
  } else if (kind === 2) {
    for (const sx of [-1, 1]) {
      b.set(Region.METAL, Bone.head).begin();
      const cx = sx * (h.rx * 0.97 + 0.004), cy = HEAD.y - 0.042, cz = HEAD.z + 0.008;
      const pts: Array<[number, number, number]> = [];
      for (let i = 0; i <= 12; i++) {
        const t = (i / 12) * TAU;
        pts.push([cx, cy - 0.012 + Math.sin(t) * 0.012, cz + Math.cos(t) * 0.012]);
      }
      b.tube(pts, () => 0.0018, 4);
      b.end();
    }
  } else {
    // Watch on the left wrist, bangles on the right.
    const side = kind === 3 ? 0 : 1;
    const fore = ARM[side][2];
    const jx = joints[fore * 3]!, jy = joints[fore * 3 + 1]!, jz = joints[fore * 3 + 2]!;
    const rr = 0.032 * (0.55 + 0.45 * p.limbs) + 0.004;
    const rings = kind === 3 ? [0.215] : [0.2, 0.218, 0.232];
    for (const d of rings) {
      b.set(kind === 3 ? Region.STRAP : Region.METAL, fore).begin();
      const pts: Array<[number, number, number]> = [];
      for (let i = 0; i <= 14; i++) {
        const t = (i / 14) * TAU;
        pts.push([jx + Math.cos(t) * rr, jy - d, jz + Math.sin(t) * rr * 0.95]);
      }
      b.tube(pts, () => (kind === 3 ? 0.006 : 0.0025), 5, undefined, kind === 3 ? 0.5 : 1);
      b.end();
    }
    if (kind === 3) {
      b.set(Region.METAL, fore).begin();
      b.ellipsoid(jx - 0.036 * (0.55 + 0.45 * p.limbs), jy - 0.215, jz, 0.006, 0.014, 0.014, 10, 6);
      b.end();
    }
  }
}

/** A phone held in the right hand, screen facing out from the palm. */
export function buildPhone(ctx: BodyCtx): void {
  const { b, joints } = ctx;
  const hand = Bone.handR;
  const hx = joints[hand * 3]!, hy = joints[hand * 3 + 1]!, hz = joints[hand * 3 + 2]!;
  const cx = hx + 0.014, cy = hy - 0.075, cz = hz - 0.012;
  b.set(Region.PHONE, hand).begin();
  roundBox(b, cx, cy, cz, 0.0048, 0.074, 0.035);
  b.end();
  b.set(Region.SCREEN, hand).begin();
  roundBox(b, cx + 0.0034, cy, cz, 0.0018, 0.068, 0.031);
  b.end();
}

export function buildBag(ctx: BodyCtx, kind: number): void {
  if (kind <= 0) return;
  const { b, p } = ctx;
  const byY = (x: number, y: number, o: Paint) => {
    const wChest = smoothstep(1.17, 1.3, y);
    const wHips = 1 - smoothstep(0.96, 1.08, y);
    o.b0 = Bone.chest;
    o.w0 = wChest;
    o.b1 = Bone.spine;
    o.w1 = Math.max(0, 1 - wChest - wHips);
    o.b2 = Bone.hips;
    o.w2 = wHips;
    if (y > 1.4 && Math.abs(x) > 0.08) {
      o.b2 = x < 0 ? Bone.clavL : Bone.clavR;
      o.w2 = 0.35;
    }
  };
  const strapPaint = (x: number, y: number, _z: number, _t: number, o: Paint) => {
    o.region = Region.STRAP;
    byY(x, y, o);
  };
  const bodyPaint = (x: number, y: number, _z: number, _t: number, o: Paint) => {
    o.region = Region.BAG;
    byY(x, y, o);
  };
  const back = 0.1 + 0.02 * p.chest;
  const front = 0.11 + 0.03 * Math.max(p.belly, p.chest - 1);
  if (kind === 1) {
    const bx = 0.205 * p.hips + 0.03;
    b.set(Region.BAG, Bone.spine).begin();
    roundBox(b, bx, 1.0, 0.075, 0.035, 0.15, 0.13, bodyPaint);
    b.end();
    b.set(Region.STRAP, Bone.chest).begin();
    b.tube([[bx - 0.01, 1.14, 0.0], [0.15, 1.38, -0.03], [0.12, 1.465, 0.0], [0.13, 1.4, back], [bx - 0.01, 1.14, 0.15]], () => 0.004, 5, strapPaint, 3.2);
    b.end();
  } else if (kind === 2) {
    b.set(Region.STRAP, Bone.chest).begin();
    b.tube([[-0.165, 1.0, -0.06], [-0.1, 1.17, -front - 0.01], [0.02, 1.33, -front - 0.012], [0.11, 1.45, -0.04], [0.11, 1.46, 0.04], [0.05, 1.3, back + 0.01], [-0.12, 1.08, back - 0.01], [-0.165, 1.0, 0.03]], () => 0.0035, 5, strapPaint, 3.2);
    b.end();
    b.set(Region.BAG, Bone.hips).begin();
    roundBox(b, -0.168 * p.hips - 0.02, 0.97, -0.03, 0.028, 0.065, 0.085, bodyPaint);
    b.end();
  } else if (kind === 3) {
    b.set(Region.BAG, Bone.chest).begin();
    roundBox(b, 0, 1.24, back + 0.07, 0.13, 0.18, 0.065, bodyPaint);
    b.end();
    for (const sx of [-1, 1]) {
      b.set(Region.STRAP, Bone.chest).begin();
      b.tube([[sx * 0.09, 1.38, back + 0.02], [sx * 0.1, 1.47, 0.02], [sx * 0.11, 1.42, -0.085], [sx * 0.13, 1.25, -front + 0.02], [sx * 0.13, 1.16, back - 0.02]], () => 0.005, 5, strapPaint, 3.5);
      b.end();
    }
  } else {
    b.set(Region.BAG, Bone.hips).begin();
    roundBox(b, 0, 1.0, -0.1 - p.belly * 0.04 - 0.03, 0.082, 0.038, 0.026, bodyPaint);
    b.end();
    b.set(Region.STRAP, Bone.hips).begin();
    const pts: Array<[number, number, number]> = [];
    const w = 0.15 * p.waist + 0.012;
    for (let i = 0; i <= 18; i++) {
      const t = (i / 18) * TAU;
      pts.push([Math.cos(t) * w, 1.01, 0.0 + Math.sin(t) * (Math.sin(t) < 0 ? 0.1 + p.belly * 0.045 + 0.012 : 0.1)]);
    }
    b.tube(pts, () => 0.0025, 5, strapPaint, 4.5);
    b.end();
  }
}

/** Moustache, beard or goatee (stubble is painted by the face shader). */
export function buildFacialHair(ctx: BodyCtx, h: HeadShape, kind: number): void {
  if (kind < 2) return;
  const { b } = ctx;
  const mouthY = HEAD.y - HEAD.r * 0.48 * h.len;
  b.set(Region.HAIR, Bone.head).begin();
  b.base.extra = HairTex.CURLS;
  const pts: Array<[number, number, number]> = [];
  for (let i = 0; i <= 8; i++) {
    const u = (i / 8) * 2 - 1;
    const x = u * 0.03;
    const y = mouthY + 0.013 - Math.abs(u) ** 1.6 * 0.01;
    pts.push([x, y, faceZ(h, x, y) - 0.0025]);
  }
  b.tube(pts, (t) => 0.0042 + 0.002 * Math.sin(t * Math.PI), 6, undefined, 0.6);
  b.end();
  if (kind === 2) {
    b.base.extra = 0;
    return;
  }
  // Beard (3) wraps the jaw; goatee (4) is the chin only.
  const cols = 16, rows = 7;
  const wide = kind === 3 ? 1.45 : 0.42;
  b.set(Region.HAIR, Bone.head).begin();
  b.base.extra = HairTex.CURLS;
  const start = b.vertexCount;
  const painter = (_x: number, _y: number, _z: number, _t: number, o: Paint) => {
    o.ao = 0.85;
  };
  for (let r = 0; r <= rows; r++) {
    for (let i = 0; i <= cols; i++) {
      const az = Math.PI * 1.5 + ((i / cols) * 2 - 1) * wide;
      const side = Math.abs(((i / cols) * 2 - 1));
      const top = kind === 3 ? -0.46 + side * 0.32 : -0.56;
      const dy = top - (r / rows) * (top + 0.99);
      const hr = Math.sqrt(Math.max(0, 1 - dy * dy));
      const dx = Math.cos(az) * hr, dz = Math.sin(az) * hr;
      headPoint(h, dx, clamp(dy, -0.99, 0.99), dz, _p);
      const len = Math.hypot(_p.x, _p.y, _p.z) || 1;
      const thick = (kind === 3 ? 0.011 : 0.009) * (1 - side * 0.45) * (r === 0 ? 0.35 : 1);
      const k = 1 + thick / len;
      b.vertex(HEAD.x + _p.x * k, HEAD.y + _p.y * k - (r === rows ? 0.006 : 0), HEAD.z + _p.z * k, az, painter);
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < cols; i++) {
      const a = start + r * (cols + 1) + i, d = a + cols + 1;
      b.tri(a, a + 1, d + 1);
      b.tri(a, d + 1, d);
    }
  }
  b.end();
  b.base.extra = 0;
}
