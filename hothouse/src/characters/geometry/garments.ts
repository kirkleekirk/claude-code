import { clamp, lerp, smoothstep } from '@/core/math';
import { Bone, LEG } from '../rig';
import { torsoFront, type BodyCtx } from './body';
import { Region } from './cloth';
import type { Paint, Ring, SkinBuilder } from './SkinBuilder';

/**
 * Garments that leave the body's surface: skirts and dresses, aprons, collars, hoods, lapels and
 * cargo pockets. Thin panels are built with an inside surface so nothing looks hollow from below.
 */

const TAU = Math.PI * 2;

/** Superellipse ring with separate front and back depth (front = −Z). */
function bodyRing(b: SkinBuilder, y: number, w: number, front: number, back: number, zc: number, seg: number, painter: (x: number, y: number, z: number, t: number, o: Paint) => void): Ring {
  const start = b.vertexCount;
  for (let i = 0; i < seg; i++) {
    const t = (i / seg) * TAU;
    const c = Math.cos(t), s = Math.sin(t);
    const x = Math.sign(c) * Math.abs(c) ** 0.85 * w;
    const z = zc + Math.sign(s) * Math.abs(s) ** 0.85 * (s < 0 ? front : back);
    b.vertex(x, y, z, t, painter);
  }
  return { start, count: seg, cx: 0, cy: y, cz: zc };
}

/** Skirt or dress panel from the waist down, flaring, with an inside and a hem. */
export function buildSkirt(ctx: BodyCtx): void {
  const { b, p, c } = ctx;
  const sk = c.skirt;
  if (!sk) return;
  const region = sk.region === 2 ? Region.TOP : Region.BOTTOM;
  const hipW = 0.167 * p.hips + 0.012;
  const waistW = 0.14 * p.waist + 0.012;
  const seg = 24;
  const rows = 8;
  const painterFor = (inside: boolean) => (x: number, y: number, _z: number, _t: number, o: Paint) => {
    o.region = region;
    const k = smoothstep(sk.top - 0.06, sk.hem, y);
    const leg = 0.62 * k;
    const side = clamp(0.5 - 0.5 * (x / hipW), 0, 1);
    o.b0 = Bone.hips;
    o.w0 = 1 - leg;
    o.b1 = Bone.thighL;
    o.w1 = leg * side;
    o.b2 = Bone.thighR;
    o.w2 = leg * (1 - side);
    o.ao = inside ? 0.45 : 1 - (1 - k) * 0.05;
  };
  const outer: Ring[] = [];
  const inner: Ring[] = [];
  for (const inside of [false, true]) {
    b.set(region, Bone.hips).begin();
    const list = inside ? inner : outer;
    const painter = painterFor(inside);
    for (let r = 0; r <= rows; r++) {
      const k = r / rows;
      const y = lerp(sk.top, sk.hem, k);
      const hipK = smoothstep(0.0, 0.35, k);
      const w = lerp(waistW, hipW, hipK) + sk.flare * k * k * 1.4 + (inside ? -0.005 : 0);
      const front = lerp(0.104 * (0.55 + 0.45 * p.waist) + 0.012 + p.belly * 0.03, 0.118 * (0.55 + 0.45 * p.hips) + 0.012, hipK) + sk.flare * k * k + (inside ? -0.005 : 0);
      const back = front + 0.012 * hipK * Math.max(0, p.hips - 0.94) * 3;
      list.push(bodyRing(b, y, w, front, back, 0.006, seg, painter));
    }
    for (let r = 0; r < rows; r++) b.bridge(list[r + 1]!, list[r]!, inside);
    b.end();
  }
  // Hem joins the two surfaces.
  b.set(region, Bone.hips).begin();
  b.bridge(inner[rows]!, outer[rows]!, false);
  b.end();
}

/** Work apron: a two-sided panel from chest to knee, a neck strap and waist ties. */
export function buildApron(ctx: BodyCtx): void {
  const { b, p, c } = ctx;
  if (!c.apron) return;
  const cols = 7, rows = 12;
  const yTop = 1.34, yBot = 0.6;
  const halfW = 0.15 * (0.6 + 0.4 * p.waist);
  // Lie on the chest and belly (following the real torso), then hang straight past the thighs,
  // never closer to the body than the bust or belly above.
  let lowest = 0;
  for (let y = 0.92; y <= 1.2; y += 0.02) lowest = Math.min(lowest, torsoFront(ctx, 0, y));
  const zAt = (x: number, y: number) => {
    const onTorso = Math.min(torsoFront(ctx, x, Math.max(y, 0.9)), torsoFront(ctx, 0, Math.max(y, 0.9)) * 0.92);
    const legFront = -0.1 - 0.012 * p.limbs - c.pantsLoose;
    const k = smoothstep(0.98, 0.86, y);
    return lerp(onTorso, Math.min(legFront, lowest), k) - 0.014;
  };
  const painter = (x: number, y: number, _z: number, _t: number, o: Paint) => {
    o.region = Region.APRON;
    const wChest = smoothstep(1.17, 1.3, y);
    const wHips = 1 - smoothstep(0.96, 1.08, y);
    const leg = smoothstep(0.92, 0.7, y) * 0.5;
    o.b0 = Bone.chest;
    o.w0 = wChest;
    o.b1 = Bone.spine;
    o.w1 = Math.max(0, 1 - wChest - wHips);
    o.b2 = Bone.hips;
    o.w2 = wHips * (1 - leg);
    if (leg > 0.001) {
      o.b0 = x < 0 ? Bone.thighL : Bone.thighR;
      o.w0 = leg;
      o.w1 = 0;
    }
  };
  for (const back of [false, true]) {
    b.set(Region.APRON, Bone.spine).begin();
    const start = b.vertexCount;
    for (let r = 0; r <= rows; r++) {
      const y = lerp(yTop, yBot, r / rows);
      const w = y > 1.2 ? lerp(halfW * 0.7, halfW, smoothstep(1.34, 1.2, y)) : halfW;
      for (let i = 0; i <= cols; i++) {
        const x = lerp(-w, w, i / cols);
        b.vertex(x, y, zAt(x, y) + (back ? 0.004 : 0), 0, painter);
      }
    }
    for (let r = 0; r < rows; r++) {
      for (let i = 0; i < cols; i++) {
        const a = start + r * (cols + 1) + i, d = a + cols + 1;
        if (back) {
          b.tri(a, d + 1, a + 1);
          b.tri(a, d, d + 1);
        } else {
          b.tri(a, a + 1, d + 1);
          b.tri(a, d + 1, d);
        }
      }
    }
    b.end();
  }
  b.set(Region.APRON, Bone.chest).begin();
  b.tube([[-halfW * 0.68, 1.34, zAt(-halfW * 0.68, 1.34)], [-0.06, 1.47, -0.03], [0, 1.5, 0.05], [0.06, 1.47, -0.03], [halfW * 0.68, 1.34, zAt(halfW * 0.68, 1.34)]], () => 0.007, 6, undefined, 0.45);
  b.end();
  b.set(Region.APRON, Bone.spine).begin();
  const tieY = 1.06;
  const tw = 0.14 * p.waist + 0.016;
  const tie: Array<[number, number, number]> = [];
  for (let i = 0; i <= 12; i++) {
    const t = Math.PI * (i / 12);
    tie.push([Math.cos(t) * tw * -1, tieY, Math.sin(t) * (0.1 + p.belly * 0.04 + 0.016) + 0.004]);
  }
  b.tube(tie, () => 0.0028, 6, undefined, 4.5);
  b.tube([[0, tieY, 0.112], [0.03, tieY - 0.09, 0.118]], () => 0.0028, 6, undefined, 4.5);
  b.tube([[0, tieY, 0.112], [-0.025, tieY - 0.1, 0.116]], () => 0.0028, 6, undefined, 4.5);
  b.end();
}

/** Shirt collars: a band round the neck and two points (open collars lie on the chest). */
export function buildCollar(ctx: BodyCtx): void {
  const { b, c } = ctx;
  if (!c.collar) return;
  const region = c.top === 'polo' ? Region.TRIM : Region.TOP;
  const open = c.neckline === 'open';
  const paint = (_x: number, y: number, _z: number, _t: number, o: Paint) => {
    o.region = region;
    const w = smoothstep(1.46, 1.52, y);
    o.b0 = Bone.chest;
    o.w0 = 1 - w;
    o.b1 = Bone.neck;
    o.w1 = w;
  };
  b.set(region, Bone.chest).begin();
  const band: Array<[number, number, number]> = [];
  for (let i = 0; i <= 14; i++) {
    const t = Math.PI * 0.18 + (Math.PI * 1.64 * i) / 14 - Math.PI / 2;
    // Open at the front (−Z): the arc runs round the back.
    const a = t + Math.PI;
    band.push([Math.cos(a) * 0.066, (open ? 1.452 : 1.462) + 0.012 * Math.max(0, Math.sin(a)), Math.sin(a) * -0.06 + 0.012]);
  }
  b.tube(band, () => 0.0045, 6, paint, 5);
  b.end();
  for (const sx of [-1, 1]) {
    b.set(region, Bone.chest).begin();
    const x0 = sx * 0.03, x1 = sx * (open ? 0.085 : 0.05);
    b.tube([[x0, open ? 1.44 : 1.46, -0.066], [x1, open ? 1.39 : 1.43, open ? -0.098 : -0.08]], (t) => 0.0045 - t * 0.0015, 6, paint, 3.6);
    b.end();
  }
}

/** Hoodie hood resting on the upper back, plus drawstrings. */
export function buildHood(ctx: BodyCtx): void {
  const { b, c } = ctx;
  if (!c.hood) return;
  b.set(Region.TOP, Bone.chest).begin();
  const paint = (_x: number, y: number, z: number, _t: number, o: Paint) => {
    const w = smoothstep(1.47, 1.53, y) * 0.5;
    o.b0 = Bone.chest;
    o.w0 = 1 - w;
    o.b1 = Bone.neck;
    o.w1 = w;
    o.ao = z < 0.06 ? 0.6 : 1;
  };
  b.ellipsoid(0, 1.468, 0.07, 0.115, 0.062, 0.068, 18, 10, paint, (dx, dy) => 1 - 0.18 * Math.max(0, dy) * (1 - Math.abs(dx)));
  b.end();
  b.set(Region.TRIM, Bone.chest).begin();
  b.tube([[-0.032, 1.45, -0.074], [-0.036, 1.39, -0.098], [-0.035, 1.33, -0.106]], () => 0.004, 5);
  b.tube([[0.032, 1.45, -0.074], [0.036, 1.39, -0.098], [0.035, 1.33, -0.106]], () => 0.004, 5);
  b.end();
}

/** Blazer lapels lying on the chest. */
export function buildLapels(ctx: BodyCtx): void {
  const { b, p, c } = ctx;
  if (!c.lapels) return;
  for (const sx of [-1, 1]) {
    b.set(Region.TOP, Bone.chest).begin();
    const paint = (_x: number, y: number, _z: number, _t: number, o: Paint) => {
      const w = 1 - smoothstep(1.16, 1.24, y);
      o.b0 = Bone.chest;
      o.w0 = 1 - w;
      o.b1 = Bone.spine;
      o.w1 = w;
    };
    const front = 0.11 * (0.55 + 0.45 * p.chest) + 0.016;
    b.tube([[sx * 0.075, 1.47, -0.064], [sx * 0.098, 1.39, -front + 0.006], [sx * 0.06, 1.28, -front - 0.002], [sx * 0.012, 1.15, -front + 0.004]], (t) => 0.006 * (1 - 0.4 * t), 6, paint, 4.5);
    b.end();
  }
}

/** Cargo pockets on the outside of each thigh. */
export function buildPockets(ctx: BodyCtx): void {
  const { b, c, joints } = ctx;
  if (!c.pockets) return;
  for (const side of [0, 1] as const) {
    const thigh = LEG[side][0];
    const sx = side === 0 ? -1 : 1;
    const x = joints[thigh * 3]! + sx * 0.088;
    b.set(Region.BOTTOM, thigh).begin();
    b.ellipsoid(x, 0.68, 0.004, 0.016, 0.065, 0.052, 10, 6, undefined, (dx) => (dx * sx < 0 ? 0.5 : 1));
    b.end();
  }
}
