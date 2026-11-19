import { Matrix4 } from 'three';
import { clamp, lerp, smoothstep } from '@/core/math';
import { Bone } from '../rig';
import { HEAD, headPoint, type BodyCtx, type HeadShape } from './body';
import { Region } from './cloth';
import type { Paint, Ring } from './SkinBuilder';

/**
 * Forty hair styles and hats from a handful of builders: a scalp shell that follows the head with
 * a shaped hairline, curtains for long hair, strands for locs and braids, buns, crests, crowns,
 * brims and bills. `look.z` tells the shader the hair texture (smooth, curls, rows, waves, straw).
 */

const TAU = Math.PI * 2;
const FRONT = Math.PI * 1.5;

/** Hair texture codes for the shader (`look.z`). */
export const HairTex = { SMOOTH: 0, CURLS: 1, ROWS: 2, WAVES: 3, STRAW: 4, KNIT: 5 } as const;

interface ShellSpec {
  /** Hairline height (unit-sphere dy) at the face, the temples and the nape. */
  front: number;
  side: number;
  back: number;
  thick: (dx: number, dy: number, dz: number) => number;
  region?: number;
  tex?: number;
  /** Vertical stretch of the outer surface (hats are taller than the head). */
  stretch?: number;
  rows?: number;
}

const _p = { x: 0, y: 0, z: 0 };

function hairline(s: ShellSpec, t: number): number {
  const fz = Math.sin(t);
  const k = Math.abs(fz) ** 1.4;
  return fz < 0 ? lerp(s.side, s.front, k) : lerp(s.side, s.back, k);
}

/** A shell over the scalp down to a hairline, closed with a rim tucked under the edge. */
function shell(ctx: BodyCtx, h: HeadShape, s: ShellSpec, bone: number = Bone.head): Ring {
  const { b } = ctx;
  const cols = 30, rows = s.rows ?? 11;
  b.set(s.region ?? Region.HAIR, bone).begin();
  b.base.extra = s.tex ?? HairTex.SMOOTH;
  const painter = (_x: number, y: number, _z: number, _t: number, o: Paint) => {
    o.ao = clamp(0.62 + (y - HEAD.y + 0.06) * 3.2, 0.62, 1);
  };
  const q = { x: 0, y: 0, z: 0 };
  const point = (dx: number, dy: number, dz: number, off: number) => {
    headPoint(h, dx, dy, dz, _p);
    const len = Math.hypot(_p.x, _p.y, _p.z) || 1;
    const k = 1 + off / len;
    q.x = HEAD.x + _p.x * k;
    q.y = HEAD.y + _p.y * k * (s.stretch && dy > 0 ? 1 + (s.stretch - 1) * dy : 1);
    q.z = HEAD.z + _p.z * k;
    return q;
  };
  point(0, 1, 0, s.thick(0, 1, 0) + 0.002);
  const tx = q.x, ty = q.y, tz = q.z;
  let prev: Ring | null = null;
  let last: Ring | null = null;
  for (let r = 1; r <= rows; r++) {
    const start = b.vertexCount;
    for (let i = 0; i < cols; i++) {
      const t = (i / cols) * TAU;
      const e = hairline(s, t);
      const dy = 1 - (1 - e) * (r / rows) ** 0.95;
      const hr = Math.sqrt(Math.max(0, 1 - dy * dy));
      const dx = Math.cos(t) * hr, dz = Math.sin(t) * hr;
      point(dx, dy, dz, s.thick(dx, dy, dz) + 0.002);
      b.vertex(q.x, q.y, q.z, t, painter);
    }
    const ring = { start, count: cols, cx: HEAD.x, cy: HEAD.y, cz: HEAD.z };
    if (prev) b.bridge(prev, ring, true);
    else b.cap(ring, tx, ty, tz, false, painter);
    prev = ring;
    last = ring;
  }
  // Rim: fold the edge back under the hairline so the shell has visible thickness.
  const start = b.vertexCount;
  for (let i = 0; i < cols; i++) {
    const t = (i / cols) * TAU;
    const e = hairline(s, t) + 0.035;
    const hr = Math.sqrt(Math.max(0, 1 - e * e));
    point(Math.cos(t) * hr, e, Math.sin(t) * hr, -0.003);
    b.vertex(q.x, q.y, q.z, t, painter);
  }
  const rim = { start, count: cols, cx: HEAD.x, cy: HEAD.y, cz: HEAD.z };
  if (last) b.bridge(last, rim, false);
  b.end();
  b.base.extra = 0;
  return last!;
}

interface CurtainSpec {
  /** Bottom of the hair (body-space y). */
  bottom: number;
  vol: number;
  /** Open face angle each side of the front (radians). */
  open: number;
  wave?: number;
  tex?: number;
  /** Straight-cut fringe hanging over the forehead instead of an open face. */
  fringe?: boolean;
}

/** Long hair falling round the back and sides of the head, two-sided, swinging on the hair bone. */
function curtain(ctx: BodyCtx, h: HeadShape, c: CurtainSpec): void {
  const { b, p } = ctx;
  const cols = 18, rows = 10;
  const t0 = FRONT + c.open, t1 = FRONT + TAU - c.open;
  const yTop = HEAD.y + 0.02;
  const paintFor = (inside: boolean) => (_x: number, y: number, _z: number, _t: number, o: Paint) => {
    const k = smoothstep(yTop - 0.04, c.bottom, y);
    const chest = smoothstep(1.5, 1.36, y) * 0.55;
    o.b0 = Bone.head;
    o.w0 = Math.max(0, 1 - k * 0.8 - chest);
    o.b1 = Bone.hair;
    o.w1 = k * 0.8;
    o.b2 = Bone.chest;
    o.w2 = chest;
    o.ao = inside ? 0.42 : clamp(0.75 + (y - c.bottom) * 1.4, 0.75, 1);
  };
  const shoulderSpread = 0.03 + 0.03 * p.shoulders;
  const rings: [number[], number[]] = [[], []];
  for (const inside of [false, true]) {
    b.set(Region.HAIR, Bone.head).begin();
    b.base.extra = c.tex ?? HairTex.SMOOTH;
    const paint = paintFor(inside);
    for (let r = 0; r <= rows; r++) {
      const k = r / rows;
      const y = lerp(yTop, c.bottom, k);
      rings[inside ? 1 : 0].push(b.vertexCount);
      for (let i = 0; i <= cols; i++) {
        const t = lerp(t0, t1, i / cols);
        const cx = Math.cos(t), sz = Math.sin(t);
        // Around the skull at the top, past the neck, then resting on the shoulders and back.
        const below = HEAD.y - y;
        const dyHead = clamp((y - HEAD.y) / h.ry, -0.6, 0.9);
        headPoint(h, cx * Math.sqrt(1 - dyHead * dyHead), dyHead, sz * Math.sqrt(1 - dyHead * dyHead), _p);
        const headR = Math.hypot(_p.x, _p.z);
        const onShoulders = smoothstep(1.5, 1.4, y);
        let rx = Math.max(headR, 0.09) + c.vol + shoulderSpread * onShoulders * Math.abs(cx);
        let rz = Math.max(headR, 0.095) + c.vol;
        if (sz > 0) rz = Math.max(rz, 0.09 + c.vol + 0.03 * onShoulders + below * 0.05);
        if (c.wave) {
          const w = Math.sin(t * 9 + y * 40) * c.wave * smoothstep(0.02, 0.12, below);
          rx += w;
          rz += w;
        }
        const off = inside ? -0.012 : 0;
        let x = cx * (rx + off), z = HEAD.z + sz * (rz + off);
        // Front strands fall in front of the shoulders, never through the face.
        if (sz < -0.2) z = Math.max(z, HEAD.z - 0.07 + below * 0.15);
        x += Math.sign(cx) * 0.012 * smoothstep(0.1, 0.3, below);
        b.vertex(x, y, z, t, paint);
      }
    }
    const R = rings[inside ? 1 : 0];
    for (let r = 0; r < rows; r++) {
      const a = R[r]!, d = R[r + 1]!;
      for (let i = 0; i < cols; i++) {
        if (inside) {
          b.tri(a + i, d + i + 1, a + i + 1);
          b.tri(a + i, d + i, d + i + 1);
        } else {
          b.tri(a + i, a + i + 1, d + i + 1);
          b.tri(a + i, d + i + 1, d + i);
        }
      }
    }
    b.end();
  }
  // Close the bottom and the two front edges.
  b.set(Region.HAIR, Bone.hair).begin();
  b.base.extra = c.tex ?? HairTex.SMOOTH;
  const [O, I] = rings;
  const ob = O[rows]!, ib = I[rows]!;
  for (let i = 0; i < cols; i++) {
    b.tri(ob + i, ob + i + 1, ib + i + 1);
    b.tri(ob + i, ib + i + 1, ib + i);
  }
  for (let r = 0; r < rows; r++) {
    const oa = O[r]!, od = O[r + 1]!, ia = I[r]!, id = I[r + 1]!;
    b.tri(oa, id, ia);
    b.tri(oa, od, id);
    b.tri(oa + cols, ia + cols, id + cols);
    b.tri(oa + cols, id + cols, od + cols);
  }
  b.end();
  b.base.extra = 0;
  if (c.fringe) {
    b.set(Region.HAIR, Bone.head).begin();
    const fz = HEAD.z - h.rzF - 0.004;
    const pts: Array<[number, number, number]> = [];
    for (let i = 0; i <= 8; i++) {
      const u = (i / 8) * 2 - 1;
      pts.push([u * 0.07, HEAD.y + 0.045 - 0.006 * Math.cos(u * 6), fz + 0.025 * u * u]);
    }
    b.tube(pts, () => 0.007, 6, undefined, 3.2);
    b.end();
  }
}

/** A rounded lump of hair (buns, puffs) on the head bone. */
function bun(ctx: BodyCtx, x: number, y: number, z: number, r: number, tex: number = HairTex.SMOOTH, bone: number = Bone.head): void {
  const { b } = ctx;
  b.set(Region.HAIR, bone).begin();
  b.base.extra = tex;
  b.ellipsoid(x, y, z, r, r * 0.9, r, 14, 10, (_x, yy, _z, _t, o) => {
    o.ao = clamp(0.7 + (yy - y + r) * 4, 0.7, 1);
  });
  b.end();
  b.base.extra = 0;
}

/** Hanging strands (locs, braids, twists) rooted on the scalp. */
function strands(ctx: BodyCtx, h: HeadShape, n: number, length: number, radius: number, spread: number, tex: number, up = false): void {
  const { b } = ctx;
  for (let i = 0; i < n; i++) {
    const t = FRONT + 0.9 + (i / Math.max(1, n - 1)) * (TAU - 1.8);
    const dy = up ? 0.55 + 0.35 * ((i * 7) % 5) / 5 : 0.05 + 0.25 * ((i * 3) % 4) / 4;
    const hr = Math.sqrt(1 - dy * dy);
    headPoint(h, Math.cos(t) * hr, dy, Math.sin(t) * hr, _p);
    const rx = HEAD.x + _p.x * 1.08, ry = HEAD.y + _p.y * 1.04, rz = HEAD.z + _p.z * 1.08;
    const ox = Math.cos(t), oz = Math.sin(t);
    const path: Array<[number, number, number]> = [];
    const segs = up ? 3 : 6;
    for (let k = 0; k <= segs; k++) {
      const s = k / segs;
      if (up) {
        path.push([rx + ox * 0.03 * s, ry + 0.035 * s, rz + oz * 0.03 * s]);
      } else {
        const drop = length * s;
        const out = spread * Math.sin(Math.min(1, s * 2.2) * Math.PI * 0.5) + 0.01 * s;
        path.push([rx + ox * out, ry - drop, rz + oz * out + (oz > 0 ? 0.02 * s : 0)]);
      }
    }
    b.set(Region.HAIR, Bone.head).begin();
    b.base.extra = tex;
    const paint = (_x: number, y: number, _z: number, _t: number, o: Paint) => {
      const k = smoothstep(ry - 0.03, ry - length, y);
      o.b0 = Bone.head;
      o.w0 = 1 - k * 0.75;
      o.b1 = Bone.hair;
      o.w1 = k * 0.75;
    };
    b.tube(path, (s) => radius * (1 - s * 0.25), 6, paint);
    b.end();
  }
  b.base.extra = 0;
}

/** A flat bill out from the forehead (caps and visors). */
function bill(ctx: BodyCtx, h: HeadShape, dy: number, length: number, curve: number, width: number, region: number): void {
  const { b } = ctx;
  const cols = 10;
  b.set(region, Bone.head).begin();
  const rows: number[][] = [[], []];
  for (const bottom of [0, 1]) {
    for (let j = 0; j <= 2; j++) {
      const out = (j / 2) * length;
      rows[bottom]!.push(b.vertexCount);
      for (let i = 0; i <= cols; i++) {
        const u = (i / cols) * 2 - 1;
        const t = FRONT + u * width;
        const hr = Math.sqrt(1 - dy * dy);
        headPoint(h, Math.cos(t) * hr, dy, Math.sin(t) * hr, _p);
        const x = HEAD.x + _p.x * 1.06 + Math.cos(t) * out;
        const z = HEAD.z + _p.z * 1.06 + Math.sin(t) * out * 1.1;
        const y = HEAD.y + _p.y - out * 0.18 - curve * u * u * (j / 2) - (bottom ? 0.006 : 0);
        b.vertex(x, y, z, t);
      }
    }
  }
  const [T, B] = rows;
  for (let j = 0; j < 2; j++) {
    for (let i = 0; i < cols; i++) {
      const a = T![j]! + i, d = T![j + 1]! + i;
      b.tri(a, d + 1, d);
      b.tri(a, a + 1, d + 1);
      const a2 = B![j]! + i, d2 = B![j + 1]! + i;
      b.tri(a2, d2, d2 + 1);
      b.tri(a2, d2 + 1, a2 + 1);
    }
  }
  // Rim along the outer edge and the two ends.
  const te = T![2]!, be = B![2]!;
  for (let i = 0; i < cols; i++) {
    b.tri(te + i, be + i + 1, be + i);
    b.tri(te + i, te + i + 1, be + i + 1);
  }
  for (let j = 0; j < 2; j++) {
    const t0 = T![j]!, t1 = T![j + 1]!, b0 = B![j]!, b1 = B![j + 1]!;
    b.tri(t0, b0, b1);
    b.tri(t0, b1, t1);
    b.tri(t0 + cols, t1 + cols, b1 + cols);
    b.tri(t0 + cols, b1 + cols, b0 + cols);
  }
  b.end();
}

/** A round brim (bucket, fedora, sun hat): a two-sided annulus that droops at its edge. */
function brim(ctx: BodyCtx, y: number, rIn: number, rOut: number, droop: number, region: number, tex: number = HairTex.SMOOTH): void {
  const { b } = ctx;
  b.set(region, Bone.head).begin();
  b.base.extra = tex;
  const cz = HEAD.z + 0.006;
  const k = 1.12;
  const prof: Array<[number, number]> = [];
  for (let i = 0; i <= 4; i++) {
    const s = i / 4;
    prof.push([lerp(rIn, rOut, s), -droop * s * s]);
  }
  const ringsTop: Ring[] = [];
  const ringsBot: Ring[] = [];
  for (const [r, dy] of prof) ringsTop.push(b.ring(HEAD.x, y + dy, cz, 1, 0, 0, 0, 0, 1, r, r * k, 2, 28));
  for (const [r, dy] of prof) ringsBot.push(b.ring(HEAD.x, y + dy - 0.006, cz, 1, 0, 0, 0, 0, 1, r, r * k, 2, 28));
  for (let i = 0; i < prof.length - 1; i++) {
    b.bridge(ringsTop[i]!, ringsTop[i + 1]!, true);
    b.bridge(ringsBot[i]!, ringsBot[i + 1]!, false);
  }
  b.bridge(ringsTop[prof.length - 1]!, ringsBot[prof.length - 1]!, true);
  b.end();
  b.base.extra = 0;
}

const hairShell = (front: number, side: number, back: number, thick: number | ((dx: number, dy: number, dz: number) => number), tex: number = HairTex.SMOOTH): ShellSpec => ({
  front, side, back, tex, thick: typeof thick === 'number' ? () => thick : thick,
});

/** Thickness that swells toward the crown. */
const topBump = (base: number, top: number, at = 0.75) => (_dx: number, dy: number) => base + top * smoothstep(at - 0.5, at + 0.2, dy);

/** Build hair or a hat for HAIR_STYLES[style]. */
export function buildHair(ctx: BodyCtx, h: HeadShape, style: number): void {
  const curls = (base: number, amp: number) => (dx: number, dy: number, dz: number) => base + amp * (0.5 + 0.5 * Math.sin(dx * 23 + dy * 17) * Math.sin(dz * 21 - dy * 13)) * smoothstep(-0.3, 0.3, dy);
  switch (style) {
    case 0: shell(ctx, h, hairShell(0.5, 0.22, -0.5, 0.0035)); break;
    case 1: shell(ctx, h, hairShell(0.48, 0.18, -0.52, topBump(0.006, 0.01))); break;
    case 2: shell(ctx, h, hairShell(0.46, 0.15, -0.52, (dx, dy) => 0.008 + 0.016 * smoothstep(0.2, 0.9, dy) * (0.6 + 0.4 * dx))); break;
    case 3: shell(ctx, h, hairShell(0.46, 0.16, -0.5, (_dx, dy, dz) => 0.007 + 0.04 * smoothstep(0.3, 0.85, dy) * smoothstep(0.4, -0.7, dz))); break;
    case 4: shell(ctx, h, hairShell(0.46, 0.14, -0.5, curls(0.01, 0.022), HairTex.CURLS)); break;
    case 5: shell(ctx, h, hairShell(0.38, -0.12, -0.42, (_dx, dy) => 0.03 + 0.045 * smoothstep(-0.4, 0.6, dy), HairTex.CURLS)); break;
    case 6:
      shell(ctx, h, hairShell(0.44, 0.12, -0.5, 0.012, HairTex.CURLS));
      strands(ctx, h, 14, 0.04, 0.011, 0, HairTex.CURLS, true);
      break;
    case 7:
      shell(ctx, h, hairShell(0.44, 0.08, -0.45, 0.012, HairTex.ROWS));
      strands(ctx, h, 16, 0.3, 0.011, 0.035, HairTex.CURLS);
      break;
    case 8:
      shell(ctx, h, hairShell(0.46, 0.1, -0.45, 0.008, HairTex.ROWS));
      strands(ctx, h, 18, 0.38, 0.0085, 0.03, HairTex.ROWS);
      break;
    case 9: shell(ctx, h, hairShell(0.5, 0.15, -0.5, 0.005, HairTex.ROWS)); break;
    case 10:
      shell(ctx, h, hairShell(0.42, -0.2, -0.5, 0.012));
      curtain(ctx, h, { bottom: HEAD.y - 0.115, vol: 0.016, open: 0.62 });
      break;
    case 11: shell(ctx, h, hairShell(0.36, 0.08, -0.5, topBump(0.008, 0.012))); break;
    case 12:
      shell(ctx, h, hairShell(0.44, -0.1, -0.45, 0.01));
      curtain(ctx, h, { bottom: 1.24, vol: 0.012, open: 0.58 });
      break;
    case 13:
      shell(ctx, h, hairShell(0.44, -0.1, -0.45, 0.014, HairTex.WAVES));
      curtain(ctx, h, { bottom: 1.28, vol: 0.02, open: 0.6, wave: 0.008, tex: HairTex.WAVES });
      break;
    case 14: {
      shell(ctx, h, hairShell(0.46, 0.1, -0.4, 0.009));
      const { b } = ctx;
      b.set(Region.HAIR, Bone.head).begin();
      const pt = (_x: number, y: number, _z: number, _t: number, o: Paint) => {
        const k = smoothstep(HEAD.y + 0.06, HEAD.y - 0.25, y);
        o.b0 = Bone.head;
        o.w0 = 1 - k * 0.85;
        o.b1 = Bone.hair;
        o.w1 = k * 0.85;
      };
      b.tube([[0, HEAD.y + 0.085, HEAD.z + 0.085], [0, HEAD.y + 0.07, HEAD.z + 0.135], [0, HEAD.y - 0.02, HEAD.z + 0.15], [0, HEAD.y - 0.14, HEAD.z + 0.13], [0, HEAD.y - 0.26, HEAD.z + 0.11]], (s) => 0.028 * (1 - s * 0.55) + 0.01 * Math.sin(s * Math.PI), 10, pt);
      b.end();
      break;
    }
    case 15:
      shell(ctx, h, hairShell(0.46, 0.08, -0.42, 0.01));
      bun(ctx, 0, HEAD.y - 0.035, HEAD.z + 0.118, 0.042);
      break;
    case 16:
      shell(ctx, h, hairShell(0.46, 0.08, -0.42, 0.01));
      bun(ctx, 0, HEAD.y + 0.13, HEAD.z + 0.01, 0.045);
      break;
    case 17:
      shell(ctx, h, hairShell(0.46, 0.08, -0.42, 0.01));
      bun(ctx, -0.06, HEAD.y + 0.105, HEAD.z + 0.005, 0.036);
      bun(ctx, 0.06, HEAD.y + 0.105, HEAD.z + 0.005, 0.036);
      break;
    case 18:
      shell(ctx, h, hairShell(0.46, 0.12, -0.5, topBump(0.01, 0.012)));
      curtain(ctx, h, { bottom: 1.43, vol: 0.012, open: 1.25 });
      break;
    case 19: {
      shell(ctx, h, hairShell(0.5, 0.25, -0.5, 0.003));
      const { b } = ctx;
      b.set(Region.HAIR, Bone.head).begin();
      const pts: Array<[number, number, number]> = [];
      for (let i = 0; i <= 8; i++) {
        const a = -0.95 + (i / 8) * 2.15;
        const dy = Math.cos(a), dz = Math.sin(a);
        headPoint(h, 0, dy, dz, _p);
        pts.push([0, HEAD.y + _p.y * 1.08, HEAD.z + _p.z * 1.08]);
      }
      b.tube(pts, (s) => 0.011 * (0.6 + Math.sin(s * Math.PI) * 0.4), 8, undefined, 3.4);
      b.end();
      break;
    }
    case 20: shell(ctx, h, hairShell(0.5, 0.14, -0.5, 0.008)); break;
    case 21:
      shell(ctx, h, hairShell(0.3, -0.05, -0.45, curls(0.016, 0.014), HairTex.WAVES));
      curtain(ctx, h, { bottom: 1.42, vol: 0.022, open: 0.8, wave: 0.01, tex: HairTex.WAVES });
      break;
    case 22: shell(ctx, h, hairShell(0.46, 0.12, -0.5, topBump(0.009, 0.01))); break;
    case 23:
      shell(ctx, h, hairShell(0.4, -0.1, -0.45, curls(0.016, 0.02), HairTex.CURLS));
      curtain(ctx, h, { bottom: 1.4, vol: 0.03, open: 0.66, wave: 0.014, tex: HairTex.CURLS });
      break;
    case 24: shell(ctx, h, hairShell(0.46, 0.25, -0.5, (_dx, dy) => (dy > 0.45 ? 0.028 : 0.003) + 0.006 * smoothstep(0.3, 0.6, dy))); break;
    case 25: shell(ctx, h, hairShell(0.44, 0.0, -0.48, 0.008, HairTex.WAVES)); break;
    case 26: break;
    case 27: shell(ctx, h, hairShell(0.46, 0.3, -0.5, (dx, dy) => (Math.abs(dx) > 0.5 ? 0.003 : 0.018) + 0.006 * smoothstep(0.4, 0.9, dy))); break;
    case 28:
      shell(ctx, h, hairShell(0.18, -0.12, -0.45, 0.014));
      curtain(ctx, h, { bottom: 1.38, vol: 0.014, open: 0.62, fringe: true });
      break;
    case 29:
      shell(ctx, h, hairShell(0.44, -0.1, -0.45, 0.01));
      curtain(ctx, h, { bottom: 1.3, vol: 0.012, open: 0.6 });
      bun(ctx, 0, HEAD.y + 0.07, HEAD.z + 0.1, 0.03);
      break;
    default:
      buildHat(ctx, h, style);
  }
}

/** Hats (styles 30–39) with short hair showing underneath. */
function buildHat(ctx: BodyCtx, h: HeadShape, style: number): void {
  const under = hairShell(0.36, 0.0, -0.5, 0.006);
  const crown = (front: number, side: number, back: number, thick: number, stretch: number, tex: number = HairTex.SMOOTH): ShellSpec => ({
    front, side, back, thick: () => thick, region: Region.HAT, tex, stretch,
  });
  switch (style) {
    case 30:
    case 38:
      shell(ctx, h, under);
      shell(ctx, h, crown(0.3, 0.2, 0.08, 0.012, 1.07));
      bill(ctx, h, 0.3, 0.075, style === 30 ? 0.016 : 0.0, 0.62, Region.HAT_TRIM);
      bun(ctx, 0, HEAD.y + h.ry * 1.07 + 0.012, HEAD.z, 0.008);
      break;
    case 31:
      shell(ctx, h, under);
      shell(ctx, h, crown(0.28, 0.2, 0.12, 0.014, 1.04));
      brim(ctx, HEAD.y + h.ry * 0.24, 0.096, 0.138, 0.035, Region.HAT);
      break;
    case 32:
      shell(ctx, h, hairShell(0.46, 0.18, -0.5, topBump(0.008, 0.012)));
      shell(ctx, h, { front: 0.32, side: 0.24, back: 0.2, thick: (_dx, dy) => (dy > 0.5 ? -0.02 : 0.012), region: Region.HAT });
      bill(ctx, h, 0.36, 0.085, 0.02, 0.7, Region.HAT);
      break;
    case 33:
      shell(ctx, h, under);
      shell(ctx, h, crown(0.32, 0.22, 0.12, 0.016, 1.12, HairTex.STRAW));
      brim(ctx, HEAD.y + h.ry * 0.26, 0.098, 0.16, 0.018, Region.HAT, HairTex.STRAW);
      ctx.b.set(Region.HAT_TRIM, Bone.head).begin();
      ctx.b.lathe(HEAD.x, HEAD.y + h.ry * 0.26, HEAD.z + 0.006, [[0.0985, 0.002], [0.0975, 0.022]], 28, undefined, 1, 1.12);
      ctx.b.end();
      break;
    case 34:
      shell(ctx, h, { ...under, back: -0.1, side: -0.05 });
      curtain(ctx, h, { bottom: 1.36, vol: 0.012, open: 0.6 });
      shell(ctx, h, crown(0.26, 0.18, 0.12, 0.016, 1.03, HairTex.STRAW));
      brim(ctx, HEAD.y + h.ry * 0.2, 0.098, 0.24, 0.05, Region.HAT, HairTex.STRAW);
      break;
    case 35:
      shell(ctx, h, under);
      shell(ctx, h, { front: 0.3, side: -0.08, back: -0.25, thick: (_dx, dy) => 0.014 + 0.012 * smoothstep(0.8, 1, dy), region: Region.HAT, tex: HairTex.KNIT, stretch: 1.08 });
      break;
    case 36:
      shell(ctx, h, under);
      shell(ctx, h, { front: 0.36, side: 0.12, back: -0.15, thick: () => 0.008, region: Region.HAT });
      bun(ctx, 0, HEAD.y - 0.03, HEAD.z + 0.118, 0.018, HairTex.SMOOTH);
      ctx.b.set(Region.HAT, Bone.head).begin();
      ctx.b.tube([[0, HEAD.y - 0.035, HEAD.z + 0.125], [0.02, HEAD.y - 0.09, HEAD.z + 0.14]], () => 0.004, 5, undefined, 3);
      ctx.b.tube([[0, HEAD.y - 0.035, HEAD.z + 0.125], [-0.018, HEAD.y - 0.1, HEAD.z + 0.135]], () => 0.004, 5, undefined, 3);
      ctx.b.end();
      break;
    case 37:
      shell(ctx, h, under);
      ctx.b.set(Region.HAT, Bone.head).begin();
      ctx.b.lathe(HEAD.x, HEAD.y + h.ry * 0.3, HEAD.z + 0.004, [[0.094, 0.0], [0.098, 0.03], [0.115, 0.1], [0.112, 0.115], [0.0001, 0.115]], 28, undefined, 0.98, 1.1);
      ctx.b.end();
      ctx.b.set(Region.HAT_TRIM, Bone.head).begin();
      ctx.b.lathe(HEAD.x, HEAD.y + h.ry * 0.3, HEAD.z + 0.004, [[0.0965, 0.0], [0.099, 0.028]], 28, undefined, 0.98, 1.1);
      ctx.b.end();
      bill(ctx, h, 0.3, 0.06, 0.01, 0.6, Region.HAT_TRIM);
      break;
    case 39: {
      shell(ctx, h, hairShell(0.46, 0.14, -0.5, topBump(0.008, 0.01)));
      const { b } = ctx;
      b.set(Region.HAT, Bone.head).begin();
      const arc: Array<[number, number, number]> = [];
      for (let i = 0; i <= 10; i++) {
        const a = Math.PI * (i / 10);
        arc.push([Math.cos(a) * (h.rx + 0.022), HEAD.y + Math.sin(a) * (h.ry + 0.012) - 0.01, HEAD.z + 0.01]);
      }
      b.tube(arc, () => 0.007, 6, undefined, 2.4);
      b.end();
      for (const sx of [-1, 1]) {
        b.set(Region.HAT_TRIM, Bone.head).begin();
        _cup.makeRotationZ(-sx * Math.PI / 2).setPosition(HEAD.x + sx * (h.rx + 0.006), HEAD.y - 0.005, HEAD.z + 0.01);
        b.transform(_cup);
        b.lathe(0, 0, 0, [[0.0001, 0.0], [0.036, 0.0], [0.038, 0.018], [0.03, 0.03], [0.0001, 0.032]], 14);
        b.transform(null).end();
      }
      break;
    }
    default:
      shell(ctx, h, under);
  }
}

const _cup = new Matrix4();
