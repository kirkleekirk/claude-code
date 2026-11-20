import { lerp, smoothstep } from '@/core/math';
import type { ClipId, FaceExpression } from '../api';
import { ARM, Bone, LEG, SEG, type Proportions } from '../rig';
import { Quaternion, Vector3 } from 'three';
import { boneTransform, solveArm, solveLeg } from './ik';
import { Mask, type Pose } from './pose';

/**
 * Every action a person can perform, as procedural pose functions. A clip receives a copy of the
 * pose underneath it (locomotion or a posture) and overwrites the bones in its mask; the player
 * blends the result back with fades. `k` is progress 0–1, `t` seconds since the clip started.
 */

export interface ClipCtx {
  readonly joints: Float32Array;
  readonly prop: Proportions;
  /** Per-actor variation 0–1. */
  readonly seed: number;
}

export interface ClipDef {
  readonly dur: number;
  readonly loop: boolean;
  /** Stay on the last frame after finishing (until stopped or replaced). */
  readonly hold?: boolean;
  readonly mask: Float32Array;
  /** Drives the hips (full-body clips). */
  readonly hips?: boolean;
  /** Progress (0–1) that raises the 'contact' event. */
  readonly contact?: number;
  /** Lip-flap while playing. */
  readonly talk?: boolean;
  readonly expression?: FaceExpression;
  pose(P: Pose, k: number, t: number, c: ClipCtx): void;
}

const TAU = Math.PI * 2;
const _p = new Vector3();
const _q = new Quaternion();

/** Smooth envelope that rises over [0, a] and falls over [b, 1]. */
export function env(k: number, a: number, b: number): number {
  return smoothstep(0, a, k) * (1 - smoothstep(b, 1, k));
}

/** Piecewise smooth interpolation through flat [k0, v0, k1, v1, …] keys. */
export function kf(k: number, keys: readonly number[]): number {
  if (k <= keys[0]!) return keys[1]!;
  for (let i = 2; i < keys.length; i += 2) {
    if (k <= keys[i]!) {
      const a = keys[i - 2]!, b = keys[i]!;
      const t = (k - a) / (b - a);
      return keys[i - 1]! + (keys[i + 1]! - keys[i - 1]!) * t * t * (3 - 2 * t);
    }
  }
  return keys[keys.length - 1]!;
}

/** Arm by angles: forward swing, abduction, external twist, elbow flex, palm-up forearm turn. */
export function arm(P: Pose, side: 0 | 1, fwd: number, out: number, twist: number, elbow: number, palmUp = 0): void {
  const sx = side === 0 ? -1 : 1;
  const a = ARM[side];
  P.set(a[1], fwd, -sx * twist, sx * out);
  P.set(a[2], elbow, -sx * palmUp, 0);
}

/** Wrist flex toward the palm and finger curl (0 open … 1.4 fist). */
export function hand(P: Pose, side: 0 | 1, flex: number, curl: number): void {
  const sx = side === 0 ? -1 : 1;
  const a = ARM[side];
  P.set(a[3], 0, 0, -sx * flex);
  P.set(a[4], 0, 0, -sx * curl);
}

/** Shrug a shoulder (+ raises it). */
function shrug(P: Pose, side: 0 | 1, amount: number): void {
  P.set(ARM[side][0], 0, 0, (side === 0 ? -1 : 1) * amount);
}

/** Plant both feet near their stance positions after a clip moved the hips. */
function feet(P: Pose, c: ClipCtx, lx = 0, lz = 0, rx = 0, rz = 0, ly = 0, ry = 0, lp = 0, rp = 0): void {
  const hx = c.prop.hipX * 0.93;
  solveLeg(P, c.joints, 0, -hx + lx, SEG.ankleY + ly, lz, lp);
  solveLeg(P, c.joints, 1, hx + rx, SEG.ankleY + ry, rz, rp);
  P.set(LEG[0][3], Math.max(0, -lp) * 0.9, 0, 0);
  P.set(LEG[1][3], Math.max(0, -rp) * 0.9, 0, 0);
}

/** Body-space position of a bone origin under the clip pose. */
function at(P: Pose, c: ClipCtx, bone: number): Vector3 {
  boneTransform(P, c.joints, bone, _p, _q);
  return _p;
}

/** Seated pose shared by vehicle entry and exit (hips on a seat ~0.45 m below standing). */
function seatedLegs(P: Pose, k: number, side: 0 | 1, swingOut: number): void {
  const sx = side === 0 ? -1 : 1;
  for (const s of [0, 1] as const) {
    const leg = LEG[s];
    const lead = s === (side === 0 ? 1 : 0) ? 1 : 0.6;
    P.set(leg[0], lerp(0, 1.45, k), 0, sx * swingOut * lead + (s === 0 ? -0.06 : 0.06) * k);
    P.set(leg[1], lerp(0, -1.3, k), 0, 0);
    P.set(leg[2], lerp(0, -0.15, k), 0, 0);
  }
}

const C: Record<ClipId, ClipDef> = {
  // ── conversation and the deal ─────────────────────────────────────────────
  talk: {
    dur: 2.6, loop: true, mask: Mask.UPPER, talk: true,
    pose(P, k) {
      const a = Math.sin(TAU * k * 2), b = Math.sin(TAU * k * 3 + 1.3), c = Math.sin(TAU * k + 0.4);
      arm(P, 1, 0.34 + 0.14 * a, 0.2, 0.2, 1.1 + 0.25 * b, 0.5 + 0.2 * c);
      arm(P, 0, 0.2 + 0.08 * c, 0.16, 0.1, 0.62 + 0.25 * a * c, 0.2);
      hand(P, 1, 0.1, 0.35 + 0.2 * b);
      P.add(Bone.head, 0.05 * Math.sin(TAU * k * 4), 0.1 * Math.sin(TAU * k * 1.3), 0.04 * c);
      P.add(Bone.chest, 0, 0.05 * c, 0);
    },
  },
  nod: {
    dur: 0.9, loop: false, mask: Mask.HEAD,
    pose(P, k) {
      const n = Math.sin(Math.PI * Math.min(1, k * 2)) ** 2 * (k < 0.5 ? 1 : 0) + Math.sin(Math.PI * Math.max(0, k * 2 - 1)) ** 2 * 0.7;
      P.add(Bone.head, -0.26 * n, 0, 0);
      P.add(Bone.neck, -0.08 * n, 0, 0);
    },
  },
  shake: {
    dur: 1.1, loop: false, mask: Mask.HEAD,
    pose(P, k) {
      P.add(Bone.head, -0.04, 0.38 * Math.sin(TAU * k * 2) * env(k, 0.15, 0.8), 0);
    },
  },
  shrug: {
    dur: 1.25, loop: false, mask: Mask.UPPER, expression: 'worried',
    pose(P, k) {
      const e = env(k, 0.25, 0.7);
      shrug(P, 0, 0.26 * e);
      shrug(P, 1, 0.26 * e);
      for (const s of [0, 1] as const) {
        arm(P, s, lerp(0.05, 0.3, e), lerp(0.12, 0.35, e), lerp(0, 0.6, e), lerp(0.2, 1.35, e), 1.1 * e);
        hand(P, s, -0.2 * e, 0.15);
      }
      P.add(Bone.head, 0.05 * e, 0, 0.16 * e);
    },
  },
  point: {
    dur: 1.6, loop: false, mask: Mask.ARM_R_HEAD,
    pose(P, k) {
      const e = env(k, 0.25, 0.8);
      arm(P, 1, lerp(0.1, 1.42, e), lerp(0.12, 0.18, e), 0.1, lerp(0.2, 0.06, e), 0.3 * e);
      hand(P, 1, 0, lerp(0.3, 0.9, e));
      P.add(Bone.head, 0.04 * e, -0.22 * e, 0);
    },
  },
  wave: {
    dur: 2.0, loop: false, mask: Mask.UPPER, expression: 'happy',
    pose(P, k, t) {
      const e = env(k, 0.18, 0.82);
      arm(P, 1, lerp(0.1, 0.4, e), lerp(0.12, 1.2, e), lerp(0, 0.35 + 0.42 * Math.sin(t * TAU * 2.4), e), lerp(0.2, 1.45, e), 0.9 * e);
      hand(P, 1, 0, 0.05);
      shrug(P, 1, 0.1 * e);
      P.add(Bone.head, 0.06 * e, -0.12 * e, -0.08 * e);
    },
  },
  beckon: {
    dur: 1.7, loop: false, mask: Mask.ARMS,
    pose(P, k, t) {
      const e = env(k, 0.2, 0.8);
      arm(P, 1, lerp(0.1, 0.75, e), 0.15, 0.2, lerp(0.2, 1.15 + 0.2 * Math.sin(t * TAU * 2), e), 1.4 * e);
      hand(P, 1, 0, lerp(0.3, 0.6 + 0.7 * Math.max(0, Math.sin(t * TAU * 2)), e));
    },
  },
  handoff: {
    dur: 1.3, loop: false, mask: Mask.UPPER, contact: 0.5,
    pose(P, k, _t, c) {
      const e = env(k, 0.42, 0.62);
      P.add(Bone.spine, -0.08 * e, 0.05 * e, 0);
      P.add(Bone.head, -0.08 * e, 0, 0);
      solveArm(P, c.joints, 1, lerp(0.21, 0.07, e), lerp(0.88, 1.13, e), lerp(0.02, -0.44, e), 0.35);
      hand(P, 1, -0.1 * e, lerp(0.7, k > 0.5 ? 0.15 : 0.7, e));
    },
  },
  receive: {
    dur: 1.3, loop: false, mask: Mask.UPPER, contact: 0.5,
    pose(P, k, _t, c) {
      const reach = env(k, 0.42, 0.62);
      const pocket = smoothstep(0.62, 0.9, k) * (1 - smoothstep(0.92, 1, k));
      P.add(Bone.spine, -0.07 * reach, -0.05 * reach, 0);
      const x = lerp(-0.2, -0.06, reach) + pocket * -0.0;
      const y = lerp(0.9, 1.12, reach) + pocket * 0.08;
      const z = lerp(0.02, -0.43, reach) + pocket * 0.12;
      solveArm(P, c.joints, 0, x, y, z, 0.3);
      P.set(ARM[0][2], P.r[ARM[0][2] * 3]!, 1.3 * reach, 0);
      hand(P, 0, 0, k > 0.5 ? 1.0 : 0.15);
    },
  },
  count: {
    dur: 2.2, loop: true, mask: Mask.ARMS_HEAD, expression: 'smug',
    pose(P, _k, t, c) {
      solveArm(P, c.joints, 0, -0.05, 1.12, -0.28, 0.25);
      solveArm(P, c.joints, 1, 0.04, 1.14 + 0.012 * Math.sin(t * TAU * 4), -0.27, 0.25);
      hand(P, 0, 0, 0.9);
      hand(P, 1, 0, 0.4 + 0.5 * Math.max(0, Math.sin(t * TAU * 4)));
      P.add(Bone.head, -0.38, 0, 0);
    },
  },
  // ── work at the nursery ──────────────────────────────────────────────────
  pickup: {
    dur: 1.5, loop: false, mask: Mask.FULL, hips: true, contact: 0.55,
    pose(P, k, _t, c) {
      const e = kf(k, [0, 0, 0.45, 1, 0.6, 1, 1, 0]);
      P.hips[1] = -0.42 * e;
      P.hips[2] = 0.07 * e;
      P.set(Bone.hips, -0.25 * e, 0, 0);
      P.set(Bone.spine, -0.42 * e, 0, 0);
      P.set(Bone.chest, -0.15 * e, 0, 0);
      P.set(Bone.head, 0.3 * e, 0, 0);
      feet(P, c, 0, -0.03 * e, 0.02 * e, 0.06 * e);
      solveArm(P, c.joints, 1, lerp(0.21, 0.13, e), lerp(0.88, 0.16, e), lerp(0.02, -0.3, e), 0.2);
      arm(P, 0, 0.3 * e, 0.25, 0, 0.5 * e);
      hand(P, 1, 0, k > 0.55 ? 1.0 : 0.2);
    },
  },
  putdown: {
    dur: 1.4, loop: false, mask: Mask.FULL, hips: true, contact: 0.5,
    pose(P, k, _t, c) {
      const e = kf(k, [0, 0, 0.42, 1, 0.58, 1, 1, 0]);
      P.hips[1] = -0.4 * e;
      P.hips[2] = 0.07 * e;
      P.set(Bone.hips, -0.25 * e, 0, 0);
      P.set(Bone.spine, -0.4 * e, 0, 0);
      P.set(Bone.chest, -0.15 * e, 0, 0);
      P.set(Bone.head, 0.28 * e, 0, 0);
      feet(P, c, 0, -0.03 * e, 0.02 * e, 0.06 * e);
      for (const s of [0, 1] as const) solveArm(P, c.joints, s, (s ? 1 : -1) * lerp(0.2, 0.12, e), lerp(1.05, 0.2, e), lerp(-0.28, -0.32, e), 0.2);
      hand(P, 0, 0, k < 0.5 ? 0.9 : 0.2);
      hand(P, 1, 0, k < 0.5 ? 0.9 : 0.2);
    },
  },
  kneelWork: {
    dur: 3.0, loop: true, mask: Mask.FULL, hips: true,
    pose(P, k, t, c) {
      P.hips[1] = -0.5;
      P.hips[2] = 0.06;
      P.set(Bone.hips, -0.1, 0.05, 0);
      P.set(Bone.spine, -0.38, 0, 0);
      P.set(Bone.chest, -0.12, 0, 0);
      P.set(Bone.head, -0.25 + 0.05 * Math.sin(t * 0.7), 0.1 * Math.sin(t * 0.4), 0);
      const hx = c.prop.hipX;
      solveLeg(P, c.joints, 0, -hx - 0.02, SEG.ankleY, -0.24, 0);
      solveLeg(P, c.joints, 1, hx + 0.02, 0.085, 0.36, -1.35);
      const w = Math.sin(t * TAU * 1.3);
      solveArm(P, c.joints, 1, 0.06 + 0.03 * w, 0.24 + 0.03 * Math.abs(w), -0.34, 0.2);
      solveArm(P, c.joints, 0, -0.12, 0.27 + 0.02 * Math.sin(t * 3 + 1), -0.3, 0.2);
      hand(P, 0, 0.2, 0.6);
      hand(P, 1, 0.1, 0.4 + 0.3 * Math.abs(w));
      void k;
    },
  },
  water: {
    dur: 2.6, loop: true, mask: Mask.UPPER,
    pose(P, _k, t, c) {
      P.add(Bone.spine, -0.12, 0, 0);
      P.add(Bone.head, -0.3, 0.05 * Math.sin(t * 0.8), 0);
      solveArm(P, c.joints, 1, 0.18, 0.92 + 0.02 * Math.sin(t * 2), -0.3, 0.4);
      hand(P, 1, 0.25 + 0.15 * Math.sin(t * 1.6), 1.1);
      arm(P, 0, 0.05, 0.35, 0.6, 1.5);
      hand(P, 0, 0.3, 0.3);
    },
  },
  benchWork: {
    dur: 3.0, loop: true, mask: Mask.UPPER,
    pose(P, _k, t, c) {
      P.add(Bone.spine, -0.16, 0, 0);
      P.add(Bone.chest, -0.06, 0.04 * Math.sin(t * 0.9), 0);
      P.add(Bone.head, -0.42, 0, 0);
      const chop = Math.abs(Math.sin(t * TAU * 1.5));
      solveArm(P, c.joints, 0, -0.12, 0.98, -0.34, 0.3);
      solveArm(P, c.joints, 1, 0.1, 0.98 + 0.05 * chop, -0.37, 0.3);
      hand(P, 0, 0.1, 0.5);
      hand(P, 1, 0.1 + 0.2 * chop, 1.0);
    },
  },
  carry: {
    dur: 1.0, loop: true, mask: Mask.ARMS,
    pose(P, _k, _t, c) {
      solveArm(P, c.joints, 0, -0.17, 1.08, -0.28, 0.15);
      solveArm(P, c.joints, 1, 0.17, 1.08, -0.28, 0.15);
      hand(P, 0, 0.3, 0.8);
      hand(P, 1, 0.3, 0.8);
    },
  },
  // ── city life ────────────────────────────────────────────────────────────
  phoneCall: {
    dur: 3.0, loop: true, mask: Mask.ARM_R_HEAD, talk: true,
    pose(P, _k, t, c) {
      solveArm(P, c.joints, 1, 0.105, 1.6, -0.03, 0.75);
      hand(P, 1, 0.2, 0.9);
      P.add(Bone.head, 0.02, 0.15 * Math.sin(t * 0.6), -0.12);
    },
  },
  phoneText: {
    dur: 3.0, loop: true, mask: Mask.ARMS_HEAD,
    pose(P, _k, t, c) {
      solveArm(P, c.joints, 1, 0.03, 1.17, -0.25, 0.25);
      solveArm(P, c.joints, 0, -0.04, 1.16, -0.25, 0.25);
      hand(P, 1, -0.2, 0.7 + 0.15 * Math.sin(t * 9));
      hand(P, 0, -0.2, 0.8);
      P.add(Bone.head, -0.48, 0, 0);
      P.add(Bone.neck, -0.12, 0, 0);
    },
  },
  phoneFilm: {
    dur: 3.0, loop: true, mask: Mask.ARMS_HEAD,
    pose(P, _k, t, c) {
      solveArm(P, c.joints, 1, 0.08, 1.56 + 0.01 * Math.sin(t * 1.3), -0.4, 0.5);
      hand(P, 1, 0.1, 0.8);
      arm(P, 0, 0.1, 0.18, 0.1, 0.4);
      P.add(Bone.head, 0.03, -0.05, 0);
    },
  },
  sitBench: {
    dur: 4.0, loop: true, mask: Mask.FULL, hips: true,
    pose(P, _k, t, c) {
      P.hips[1] = -0.47;
      P.hips[2] = 0.17;
      P.set(Bone.hips, 0.1, 0, 0);
      P.set(Bone.spine, 0.06, 0.04 * Math.sin(t * 0.3), 0);
      P.set(Bone.chest, -0.04, 0, 0);
      P.set(Bone.head, -0.1 + 0.05 * Math.sin(t * 0.21), 0.35 * Math.sin(t * 0.17), 0);
      const hx = c.prop.hipX;
      solveLeg(P, c.joints, 0, -hx - 0.03, SEG.ankleY, -0.14, 0);
      solveLeg(P, c.joints, 1, hx + 0.03, SEG.ankleY, -0.12, 0);
      const knee = at(P, c, LEG[0][1]);
      solveArm(P, c.joints, 0, knee.x * 0.8, knee.y + 0.07, knee.z * 0.55 + 0.06, 0.2);
      const kneeR = at(P, c, LEG[1][1]);
      solveArm(P, c.joints, 1, kneeR.x * 0.8, kneeR.y + 0.07, kneeR.z * 0.55 + 0.06, 0.2);
      hand(P, 0, 0.3, 0.4);
      hand(P, 1, 0.3, 0.4);
    },
  },
  lean: {
    dur: 5.0, loop: true, mask: Mask.FULL, hips: true,
    pose(P, _k, t, c) {
      P.hips[2] = 0.06;
      P.hips[1] = -0.01;
      P.set(Bone.hips, 0.06, 0, 0);
      P.set(Bone.spine, 0.06, 0, 0);
      P.set(Bone.chest, 0.02, 0, 0);
      P.set(Bone.head, -0.1, 0.3 * Math.sin(t * 0.23), 0.05);
      const hx = c.prop.hipX;
      solveLeg(P, c.joints, 0, -hx * 0.9, SEG.ankleY, -0.08, 0);
      solveLeg(P, c.joints, 1, hx * 0.6, 0.36, 0.14, -0.4);
      solveArm(P, c.joints, 1, -0.11, 1.2, -0.13, 0.3);
      solveArm(P, c.joints, 0, 0.12, 1.18, -0.14, 0.3);
      hand(P, 0, 0.2, 0.5);
      hand(P, 1, 0.2, 0.5);
    },
  },
  dance: {
    dur: 2.0, loop: true, mask: Mask.FULL, hips: true, expression: 'happy',
    pose(P, k, _t, c) {
      const beat = Math.abs(Math.sin(TAU * k * 2));
      const sway = Math.sin(TAU * k);
      P.hips[1] = -0.05 * beat - 0.02;
      P.hips[0] = 0.045 * sway;
      P.set(Bone.hips, -0.05, 0.18 * sway, -0.08 * sway);
      P.set(Bone.spine, -0.04, -0.12 * sway, 0.06 * sway);
      P.set(Bone.chest, 0, -0.1 * sway, 0.04 * sway);
      P.set(Bone.head, -0.06 + 0.08 * beat, 0.1 * sway, 0.06 * Math.sin(TAU * k * 2));
      for (const s of [0, 1] as const) {
        const ph = s === 0 ? 0 : Math.PI;
        arm(P, s, 0.75 + 0.35 * Math.sin(TAU * k * 2 + ph), 0.45, 0.4, 1.45 + 0.2 * Math.sin(TAU * k * 2 + ph + 1), 0.4);
        hand(P, s, 0, 1.0);
      }
      feet(P, c, -0.04 * sway, -0.02, -0.04 * sway, 0.03, 0.04 * Math.max(0, sway), 0.04 * Math.max(0, -sway));
    },
  },
  cheer: {
    dur: 1.6, loop: false, mask: Mask.FULL, hips: true, expression: 'happy',
    pose(P, k, t, c) {
      const e = env(k, 0.15, 0.82);
      const hop = Math.max(0, Math.sin(t * TAU * 2.2)) * e;
      P.hips[1] = 0.06 * hop - 0.03 * e;
      P.set(Bone.spine, 0.08 * e, 0, 0);
      P.set(Bone.head, 0.18 * e, 0, 0);
      for (const s of [0, 1] as const) {
        arm(P, s, lerp(0.1, 2.75, e), lerp(0.12, 0.4, e), 0.2, lerp(0.2, 0.35 + 0.25 * hop, e));
        hand(P, s, 0, lerp(0.3, 1.2, e));
      }
      feet(P, c, 0, 0, 0, 0, 0.06 * hop, 0.06 * hop, -0.4 * hop, -0.4 * hop);
    },
  },
  smoke: {
    dur: 6.0, loop: true, mask: Mask.ARM_R_HEAD,
    pose(P, k, _t, c) {
      const up = env(Math.max(0, Math.min(1, (k - 0.15) / 0.3)), 0.35, 0.65);
      if (up > 0.001) solveArm(P, c.joints, 1, lerp(0.2, 0.025, up), lerp(1.05, 1.57, up), lerp(-0.12, -0.13, up), 0.6);
      else arm(P, 1, 0.25, 0.15, 0.3, 1.25, 0.3);
      if (up > 0.001) {
        const a = ARM[1];
        const base = P.r[a[2] * 3]!;
        P.set(a[2], lerp(1.25, base, up), P.r[a[2] * 3 + 1]!, 0);
      }
      hand(P, 1, 0.15, 0.9);
      P.add(Bone.head, 0.04 + 0.12 * smoothstep(0.42, 0.5, k) * (1 - smoothstep(0.55, 0.7, k)), 0, 0);
    },
  },
  // ── trouble (stylized, never gory) ───────────────────────────────────────
  cower: {
    dur: 2.0, loop: true, mask: Mask.FULL, hips: true, expression: 'worried',
    pose(P, _k, t, c) {
      const shiver = 0.015 * Math.sin(t * 31);
      P.hips[1] = -0.36;
      P.hips[2] = 0.05;
      P.set(Bone.hips, -0.2, 0, 0);
      P.set(Bone.spine, -0.48, 0, shiver);
      P.set(Bone.chest, -0.22, 0, 0);
      P.set(Bone.neck, -0.25, 0, 0);
      P.set(Bone.head, -0.3, 0, 0);
      feet(P, c, -0.03, -0.06, 0.03, 0.04);
      const head = at(P, c, Bone.head);
      solveArm(P, c.joints, 0, head.x + 0.02, head.y + 0.16, head.z - 0.07, 0.9);
      solveArm(P, c.joints, 1, head.x - 0.02, head.y + 0.18, head.z - 0.04, 0.9);
      hand(P, 0, 0.3, 0.5);
      hand(P, 1, 0.3, 0.5);
    },
  },
  handsUp: {
    dur: 2.0, loop: true, mask: Mask.ARMS_HEAD, expression: 'worried',
    pose(P, _k, t) {
      for (const s of [0, 1] as const) {
        arm(P, s, 0.25, 1.32, 1.1, 1.5 + 0.04 * Math.sin(t * 9 + s), 0.0);
        hand(P, s, -0.3, 0.05);
      }
      P.add(Bone.head, -0.06, 0, 0);
    },
  },
  shove: {
    dur: 0.8, loop: false, mask: Mask.UPPER,
    pose(P, k, _t, c) {
      const e = kf(k, [0, 0, 0.3, 1, 0.5, 1, 1, 0]);
      P.add(Bone.spine, -0.22 * e, 0, 0);
      P.add(Bone.chest, -0.08 * e, 0, 0);
      for (const s of [0, 1] as const) {
        solveArm(P, c.joints, s, (s ? 1 : -1) * lerp(0.2, 0.15, e), lerp(1.0, 1.3, e), lerp(-0.18, -0.5, e), 0.25);
        hand(P, s, -0.5 * e, 0.1);
      }
    },
  },
  punch: {
    dur: 0.7, loop: false, mask: Mask.UPPER,
    pose(P, k, _t, c) {
      const strike = kf(k, [0, 0, 0.2, 0, 0.36, 1, 0.55, 1, 1, 0]);
      const guard = env(k, 0.12, 0.85);
      P.add(Bone.chest, 0, 0.36 * strike - 0.1 * guard, 0);
      P.add(Bone.spine, -0.08 * guard, 0.1 * strike, 0);
      solveArm(P, c.joints, 1, lerp(0.14, 0.05, strike), lerp(1.35, 1.44, strike), lerp(-0.2, -0.58, strike), lerp(0.6, 0.1, strike));
      solveArm(P, c.joints, 0, lerp(-0.2, -0.09, guard), lerp(1.0, 1.44, guard), lerp(0.0, -0.22, guard), 0.6);
      hand(P, 0, 0, 1.3 * guard);
      hand(P, 1, 0, 1.4);
    },
  },
  hitReact: {
    dur: 0.65, loop: false, mask: Mask.UPPER, expression: 'surprised',
    pose(P, k) {
      const e = kf(k, [0, 0, 0.12, 1, 0.35, 0.8, 1, 0]);
      P.add(Bone.spine, 0.3 * e, 0, 0.06 * e);
      P.add(Bone.chest, 0.12 * e, 0, 0);
      P.add(Bone.head, 0.32 * e, 0.12 * e, 0);
      for (const s of [0, 1] as const) arm(P, s, 0.3 * e, 0.12 + 0.55 * e, 0.3, 0.3 + 0.5 * e);
    },
  },
  knockdown: {
    dur: 1.5, loop: false, hold: true, mask: Mask.FULL, hips: true, expression: 'surprised',
    pose(P, k) {
      const stagger = kf(k, [0, 0, 0.3, 1, 0.45, 0.6, 1, 0]);
      const fall = kf(k, [0, 0, 0.3, 0, 0.75, 1, 1, 1]);
      const bounce = kf(k, [0, 0, 0.74, 0, 0.82, 1, 1, 0]);
      P.hips[1] = -0.85 * fall + 0.02 * bounce;
      P.hips[2] = 0.12 * stagger + 0.35 * fall;
      P.set(Bone.hips, 1.42 * fall + 0.12 * stagger, 0.1 * fall, 0.05 * fall);
      P.set(Bone.spine, 0.2 * stagger - 0.05 * fall, 0, 0);
      P.set(Bone.chest, 0.1 * stagger, 0, 0);
      P.set(Bone.neck, -0.25 * fall, 0, 0);
      P.set(Bone.head, 0.3 * stagger - 0.2 * fall, 0.4 * fall, 0);
      // Lying on the back: one knee up with the foot flat, the other leg out; arms splayed on
      // the ground (on the reclined body, 'forward' points at the sky, so keep it near zero).
      for (const s of [0, 1] as const) {
        const leg = LEG[s];
        P.set(leg[0], lerp(0.25 * stagger, s ? -0.06 : 0.75, fall), 0, (s ? 1 : -1) * lerp(0, s ? 0.18 : 0.06, fall));
        P.set(leg[1], lerp(-0.5 * stagger, s ? -0.12 : -1.45, fall), 0, 0);
        P.set(leg[2], lerp(0, s ? -0.5 : 0.35, fall), 0, 0);
        arm(P, s, lerp(0.6 * stagger, 0.06, fall), lerp(0.3 + 0.4 * stagger, s ? 1.15 : 0.75, fall), 0.4, lerp(0.6 * stagger, s ? 0.25 : 0.7, fall), 0.4 * fall);
        hand(P, s, 0, 0.4);
      }
    },
  },
  getUp: {
    dur: 1.8, loop: false, mask: Mask.FULL, hips: true,
    pose(P, k, _t, c) {
      // Lying → sitting → kneeling → standing.
      const sit = smoothstep(0.0, 0.32, k);
      const kneel = smoothstep(0.3, 0.62, k);
      const stand = smoothstep(0.6, 1.0, k);
      const lie = 1 - sit;
      P.hips[1] = lerp(lerp(lerp(-0.83, -0.86, sit), -0.5, kneel), 0, stand);
      P.hips[2] = lerp(lerp(0.35, 0.2, sit), 0.05, kneel) * (1 - stand);
      P.set(Bone.hips, lerp(lerp(1.42, 0.25, sit), -0.25, kneel) * (1 - stand), 0, 0);
      P.set(Bone.spine, lerp(-0.05 * lie - 0.35 * sit, -0.4, kneel) * (1 - stand), 0, 0);
      P.set(Bone.chest, -0.1 * sit * (1 - stand), 0, 0);
      P.set(Bone.head, lerp(-0.2, 0.2, sit) * (1 - stand), 0, 0);
      if (kneel < 0.01) {
        for (const s of [0, 1] as const) {
          const leg = LEG[s];
          P.set(leg[0], lerp(s ? -0.06 : 0.75, 1.2, sit), 0, (s ? 1 : -1) * lerp(s ? 0.18 : 0.06, 0.12, sit));
          P.set(leg[1], lerp(s ? -0.12 : -1.45, -1.9, sit), 0, 0);
          P.set(leg[2], lerp(s ? -0.5 : 0.35, -0.2, sit), 0, 0);
        }
      } else {
        const hx = c.prop.hipX;
        solveLeg(P, c.joints, 0, -hx, SEG.ankleY, lerp(-0.25, 0, stand), 0);
        solveLeg(P, c.joints, 1, hx, lerp(0.085, SEG.ankleY, stand), lerp(0.36, 0.02, stand), lerp(-1.35, 0, stand));
      }
      for (const s of [0, 1] as const) {
        const push = (1 - stand) * Math.max(sit * (1 - kneel), kneel * 0.6);
        const lieOut = s ? 1.15 : 0.75;
        arm(P, s, lerp(lerp(0.06, 0.5, sit), -0.35, push) * (1 - stand), lerp(lerp(lieOut, 0.6, sit), 0.3, push) * (1 - stand) + c.prop.armOut * stand, 0.2, lerp(0.5, 0.15, push) * (1 - stand) + 0.2 * stand);
        hand(P, s, -0.6 * push, 0.2);
      }
    },
  },
  flee: {
    dur: 1.0, loop: true, mask: Mask.ARMS_HEAD, expression: 'worried',
    pose(P, k, t) {
      for (const s of [0, 1] as const) {
        const ph = s ? 0 : Math.PI;
        arm(P, s, 0.5 + 0.55 * Math.sin(TAU * k * 2 + ph), 0.55 + 0.2 * Math.sin(TAU * k * 2 + ph + 1), 0.3, 1.1 + 0.3 * Math.sin(TAU * k * 2), 0.2);
        hand(P, s, 0, 0.2);
      }
      const back = smoothstep(0.55, 0.7, (t * 0.35) % 1) * (1 - smoothstep(0.85, 1, (t * 0.35) % 1));
      P.add(Bone.head, 0.05, 0.9 * back, 0);
      P.add(Bone.neck, 0, 0.4 * back, 0);
    },
  },
  // ── vehicles ─────────────────────────────────────────────────────────────
  enterVehicleL: vehicleClip(0, true),
  enterVehicleR: vehicleClip(1, true),
  exitVehicleL: vehicleClip(0, false),
  exitVehicleR: vehicleClip(1, false),
};

/**
 * Getting in: turn toward the seat, duck, lead with the inside leg and drop onto the seat; the
 * controller moves the root along the door path and switches posture when the clip ends.
 * Getting out plays the same motion backwards with the outside leg first.
 */
function vehicleClip(door: 0 | 1, enter: boolean): ClipDef {
  // Using the left door the seat is to the actor's right (+X), and the reverse for the right door.
  const toward = door === 0 ? 1 : -1;
  return {
    dur: enter ? 1.15 : 1.05, loop: false, mask: Mask.FULL, hips: true,
    pose(P, k0, _t, c) {
      const k = enter ? k0 : 1 - k0;
      const duck = env(k, 0.3, 0.85);
      const sit = smoothstep(0.45, 1.0, k);
      const step = env(k, 0.2, 0.6);
      P.hips[0] = toward * 0.12 * step;
      P.hips[1] = -0.5 * sit - 0.06 * duck;
      P.hips[2] = 0.05 * sit;
      P.set(Bone.hips, -0.15 * duck, toward * -0.35 * step * (1 - sit), 0);
      P.set(Bone.spine, -0.45 * duck + 0.2 * sit * (1 - duck), 0, toward * -0.1 * duck);
      P.set(Bone.chest, -0.15 * duck, 0, 0);
      P.set(Bone.neck, -0.2 * duck, 0, 0);
      P.set(Bone.head, -0.15 * duck + 0.1 * sit, toward * 0.2 * duck, 0);
      if (sit > 0.02) {
        seatedLegs(P, sit, door, -0.25 * (1 - sit));
      } else {
        const hx = c.prop.hipX;
        const lead = door === 0 ? 1 : 0;
        solveLeg(P, c.joints, lead as 0 | 1, (lead ? hx : -hx) + toward * 0.18 * step, SEG.ankleY + 0.2 * step, -0.05 * step, -0.3 * step);
        solveLeg(P, c.joints, (1 - lead) as 0 | 1, lead ? -hx : hx, SEG.ankleY, 0, 0);
      }
      // One hand on the door frame, the other reaching for the seat.
      const inside = door === 0 ? 1 : 0;
      arm(P, (1 - inside) as 0 | 1, lerp(0.3, 0.9, duck), 0.4 * duck + c.prop.armOut, 0.2, lerp(0.3, 1.2, duck), 0.3);
      arm(P, inside as 0 | 1, lerp(0.2, 0.7, sit), 0.3 + 0.2 * duck, 0.1, lerp(0.3, 1.3, sit), 0.3);
      hand(P, 0, 0.1, 0.7);
      hand(P, 1, 0.1, 0.7);
    },
  };
}

export const CLIPS: Readonly<Record<ClipId, ClipDef>> = C;
