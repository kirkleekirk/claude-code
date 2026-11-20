import { Euler, Quaternion } from 'three';
import { ARM, BONE_COUNT, Bone, LEG } from '../rig';

/**
 * A pose is three Euler angles per bone (twist, then pitch, then roll: Three's 'ZXY' order) plus
 * a hips offset from rest. Layers blend in angle space, which is exact enough for the stylized,
 * mostly single-axis motion procedural animation produces and costs nothing to allocate.
 *
 * Conventions (body space: facing −Z, right = +X):
 *  - limbs hang along −Y: +x swings them forward, +z swings them toward +X;
 *  - spine, neck and head point +Y: −x bends forward, +y turns toward the character's left,
 *    +z leans to the left.
 */
export class Pose {
  readonly r = new Float32Array(BONE_COUNT * 3);
  /** Hips offset from rest (body space). */
  readonly hips = new Float32Array(3);

  reset(): this {
    this.r.fill(0);
    this.hips.fill(0);
    return this;
  }

  copy(o: Pose): this {
    this.r.set(o.r);
    this.hips.set(o.hips);
    return this;
  }

  set(bone: number, x: number, y: number, z: number): this {
    const i = bone * 3;
    this.r[i] = x;
    this.r[i + 1] = y;
    this.r[i + 2] = z;
    return this;
  }

  add(bone: number, x: number, y: number, z: number): this {
    const i = bone * 3;
    this.r[i] += x;
    this.r[i + 1] += y;
    this.r[i + 2] += z;
    return this;
  }

  /** this = lerp(this, o, w · mask[bone]); hips use `hipsW`. */
  blend(o: Pose, w: number, mask: Float32Array | null, hipsW = w): this {
    if (w <= 0) return this;
    const r = this.r, s = o.r;
    for (let b = 0; b < BONE_COUNT; b++) {
      const k = mask ? w * mask[b]! : w;
      if (k <= 0) continue;
      const i = b * 3;
      r[i] += (s[i]! - r[i]!) * k;
      r[i + 1] += (s[i + 1]! - r[i + 1]!) * k;
      r[i + 2] += (s[i + 2]! - r[i + 2]!) * k;
    }
    if (hipsW > 0) {
      for (let i = 0; i < 3; i++) this.hips[i] += (o.hips[i]! - this.hips[i]!) * hipsW;
    }
    return this;
  }
}

const _e = new Euler(0, 0, 0, 'ZXY');

export function quatFromPose(q: Quaternion, x: number, y: number, z: number): Quaternion {
  _e.set(x, y, z, 'ZXY');
  return q.setFromEuler(_e);
}

/** Write a quaternion back into a pose bone as 'ZXY' Euler angles. */
export function poseFromQuat(pose: Pose, bone: number, q: Quaternion): void {
  _e.setFromQuaternion(q, 'ZXY');
  pose.set(bone, _e.x, _e.y, _e.z);
}

function mask(bones: readonly number[], w = 1): Float32Array {
  const m = new Float32Array(BONE_COUNT);
  for (const b of bones) m[b] = w;
  return m;
}

const ARMS_L = ARM[0] as readonly number[];
const ARMS_R = ARM[1] as readonly number[];
const LEGS = [...LEG[0], ...LEG[1]] as readonly number[];

/** Bone masks for layering clips over locomotion. */
export const Mask = {
  FULL: mask([...Array(BONE_COUNT).keys()]),
  UPPER: mask([Bone.spine, Bone.chest, Bone.neck, Bone.head, ...ARMS_L, ...ARMS_R]),
  ARMS: mask([...ARMS_L, ...ARMS_R]),
  ARM_R: mask([...ARMS_R]),
  ARM_R_HEAD: mask([...ARMS_R, Bone.neck, Bone.head]),
  ARMS_HEAD: mask([...ARMS_L, ...ARMS_R, Bone.neck, Bone.head]),
  HEAD: mask([Bone.neck, Bone.head]),
  LEGS: mask(LEGS),
} as const;
