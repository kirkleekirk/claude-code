import { Quaternion, Vector3 } from 'three';
import type { Posture } from '../api';
import { ARM, Bone, LEG, SEG } from '../rig';
import { hand, type ClipCtx } from './clips';
import { DRIVER_WHEEL, SIT_DROP } from '../ergonomics';
import { boneTransform, solveArm, solveLeg } from './ik';
import type { Pose } from './pose';

/**
 * Seated stances. For every seated posture the actor's root is the hip point (H-point): the
 * vehicle or chair places the root there and the hip joints sit on it.
 */

export { DRIVER_WHEEL, SIT_DROP } from '../ergonomics';

const _p = new Vector3();
const _q = new Quaternion();

/** Hips offset that puts the hip joints on the root (body space, neutral height). */
export const SEATED_HIPS_Y = -SEG.hipJointY;

/**
 * Write a seated pose. `scale` converts world metres to body space (1 / height scale); `steer`
 * turns the wheel for `drive`; `t` drives small idle motion.
 */
export function writeSeated(pose: Pose, posture: Exclude<Posture, 'stand'>, steer: number, c: ClipCtx, scale: number, t: number): void {
  pose.reset();
  pose.hips[1] = SEATED_HIPS_Y;
  const breath = Math.sin(t * 1.5);
  if (posture === 'drive' || posture === 'passenger') {
    const recline = posture === 'drive' ? 0.2 : 0.24;
    pose.set(Bone.hips, recline, 0, 0);
    pose.set(Bone.spine, 0.05, 0, 0);
    pose.set(Bone.chest, -0.05 + 0.01 * breath, 0, 0);
    pose.set(Bone.neck, -0.06, 0, 0);
    const look = posture === 'passenger' ? 0.35 * Math.sin(t * 0.13) + 0.15 * Math.sin(t * 0.41) : 0.04 * Math.sin(t * 0.3);
    pose.set(Bone.head, -(recline + 0.05 - 0.05 - 0.06) - 0.02, look, 0);
    for (const s of [0, 1] as const) {
      const leg = LEG[s];
      const sx = s === 0 ? -1 : 1;
      const relax = posture === 'passenger' ? 0.1 : 0;
      pose.set(leg[0], 1.5 - recline - 0.06 - relax, 0, sx * (0.07 + relax * 0.4));
      pose.set(leg[1], posture === 'drive' ? -1.02 : -1.2, 0, 0);
      pose.set(leg[2], -0.45, 0, 0);
    }
    if (posture === 'drive') {
      // Hands at ten and two, following the rim as the wheel turns.
      const cy = DRIVER_WHEEL.y * scale, cz = DRIVER_WHEEL.z * scale, r = DRIVER_WHEEL.radius * scale;
      const ct = Math.cos(DRIVER_WHEEL.tilt), st = Math.sin(DRIVER_WHEEL.tilt);
      const lim = Math.max(-1.25, Math.min(1.25, steer));
      for (const s of [0, 1] as const) {
        const a = (s === 0 ? Math.PI * 0.83 : Math.PI * 0.17) - lim;
        const gx = Math.cos(a) * r, gy = Math.sin(a) * r;
        solveArm(pose, c.joints, s, gx, cy + gy * ct, cz + gy * st, 0.55);
        hand(pose, s, 0.25, 1.25);
        const h = ARM[s][3];
        pose.add(h, s === 0 ? -0.3 : 0.3, 0, 0);
      }
    } else {
      for (const s of [0, 1] as const) handsOnThighs(pose, c, s);
    }
  } else {
    // Sitting on a chair or bench: thighs level, feet flat on the floor.
    pose.set(Bone.hips, 0.04, 0, 0);
    pose.set(Bone.spine, 0.02 + 0.006 * breath, 0.05 * Math.sin(t * 0.2), 0);
    pose.set(Bone.chest, -0.03, 0, 0);
    pose.set(Bone.head, -0.05 + 0.04 * Math.sin(t * 0.23), 0.3 * Math.sin(t * 0.11), 0);
    const ground = -SIT_DROP * scale + SEG.ankleY;
    const hx = c.prop.hipX;
    solveLeg(pose, c.joints, 0, -hx - 0.03, ground, -0.4, 0);
    solveLeg(pose, c.joints, 1, hx + 0.03, ground, -0.38, 0);
    for (const s of [0, 1] as const) handsOnThighs(pose, c, s);
  }
}

function handsOnThighs(pose: Pose, c: ClipCtx, s: 0 | 1): void {
  boneTransform(pose, c.joints, LEG[s][1], _p, _q);
  const kx = _p.x, ky = _p.y, kz = _p.z;
  boneTransform(pose, c.joints, LEG[s][0], _p, _q);
  solveArm(pose, c.joints, s, (kx + _p.x) * 0.5 * 1.1, (ky + _p.y) * 0.5 + 0.07, kz * 0.62 + _p.z * 0.38, 0.25);
  hand(pose, s, 0.35, 0.45);
}
