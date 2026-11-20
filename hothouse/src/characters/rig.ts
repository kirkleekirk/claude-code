import { BUILDS, OUTFITS, heightMetres, type Appearance, type ShoeStyle } from '@/content/appearance';

/**
 * The skeleton every person shares. Bodies are built at a neutral height of 1.76 m with the feet
 * on y = 0, facing −Z (the game's yaw 0); the character's right is +X. The whole body group is
 * then scaled to the appearance's height, so animation never needs to know how tall anyone is.
 */

export const NEUTRAL_HEIGHT = 1.76;

export const Bone = {
  hips: 0, spine: 1, chest: 2, neck: 3, head: 4, hair: 5,
  clavL: 6, upperArmL: 7, forearmL: 8, handL: 9, fingersL: 10,
  clavR: 11, upperArmR: 12, forearmR: 13, handR: 14, fingersR: 15,
  thighL: 16, shinL: 17, footL: 18, toeL: 19,
  thighR: 20, shinR: 21, footR: 22, toeR: 23,
} as const;

export type BoneId = (typeof Bone)[keyof typeof Bone];
export const BONE_COUNT = 24;

export const BONE_NAMES: readonly string[] = [
  'hips', 'spine', 'chest', 'neck', 'head', 'hair',
  'clavL', 'upperArmL', 'forearmL', 'handL', 'fingersL',
  'clavR', 'upperArmR', 'forearmR', 'handR', 'fingersR',
  'thighL', 'shinL', 'footL', 'toeL',
  'thighR', 'shinR', 'footR', 'toeR',
];

export const BONE_PARENT: readonly number[] = [
  -1, 0, 1, 2, 3, 4,
  2, 6, 7, 8, 9,
  2, 11, 12, 13, 14,
  0, 16, 17, 18,
  0, 20, 21, 22,
];

/** Limb chains by side: [clavicle, upper arm, forearm, hand, fingers] and [thigh, shin, foot, toe]. */
export const ARM = [[Bone.clavL, Bone.upperArmL, Bone.forearmL, Bone.handL, Bone.fingersL], [Bone.clavR, Bone.upperArmR, Bone.forearmR, Bone.handR, Bone.fingersR]] as const;
export const LEG = [[Bone.thighL, Bone.shinL, Bone.footL, Bone.toeL], [Bone.thighR, Bone.shinR, Bone.footR, Bone.toeR]] as const;

/** Segment lengths of the neutral figure (metres). */
export const SEG = {
  thigh: 0.42,
  shin: 0.42,
  upperArm: 0.29,
  forearm: 0.255,
  palm: 0.085,
  ankleY: 0.085,
  hipY: 0.98,
  hipJointY: 0.925,
  shoulderY: 1.43,
} as const;

/** How far below the body's ground plane the soles reach (skates and heels lift the whole body). */
export function soleLift(shoes: ShoeStyle): number {
  return shoes === 'skates' ? 0.078 : shoes === 'heels' ? 0.018 : shoes === 'boots' ? 0.008 : 0;
}

/** Body measurements derived from a build. Everything is in neutral-height metres. */
export interface Proportions {
  readonly shoulders: number;
  readonly chest: number;
  readonly waist: number;
  readonly hips: number;
  readonly limbs: number;
  readonly belly: number;
  /** Superellipse exponent of the torso: 2.2 soft … 2.9 angular. */
  readonly exponent: number;
  /** Shoulder-joint and hip-joint half spacing. */
  readonly shoulderX: number;
  readonly hipX: number;
  /** Half-width of the pelvis at its widest (for arm clearance). */
  readonly pelvisHalf: number;
  /** Idle arm abduction (radians) that keeps hands clear of the hips. */
  readonly armOut: number;
  /** Uniform scale from the neutral figure to this person's height. */
  readonly scale: number;
  /** Lift applied to the body for skates and heels (neutral metres). */
  readonly lift: number;
}

export function proportions(a: Appearance): Proportions {
  const b = BUILDS[a.build] ?? BUILDS[2]!;
  const outfit = OUTFITS[a.outfit] ?? OUTFITS[0]!;
  const shoulderX = 0.182 * b.shoulders;
  const hipX = 0.088 * (0.55 + 0.45 * b.hips);
  const pelvisHalf = 0.168 * b.hips + 0.01 * b.belly;
  const handHalf = 0.02 * b.limbs;
  // Hands hang ~0.52 m below the shoulder joint; abduct until they clear the pelvis.
  const clearance = pelvisHalf + handHalf + 0.018 - shoulderX;
  const armOut = Math.min(0.42, Math.max(0.07, Math.atan2(clearance, 0.5)));
  return {
    shoulders: b.shoulders,
    chest: b.chest,
    waist: b.waist,
    hips: b.hips,
    limbs: b.limbs,
    belly: b.belly,
    exponent: 2.2 + b.angular * 0.7,
    shoulderX,
    hipX,
    pelvisHalf,
    armOut,
    scale: heightMetres(a) / NEUTRAL_HEIGHT,
    lift: soleLift(outfit.shoes),
  };
}

/**
 * Rest positions of every joint in body space (neutral height, feet on y = 0), as a flat array of
 * xyz triples indexed by bone.
 */
export function restJoints(p: Proportions): Float32Array {
  const j = new Float32Array(BONE_COUNT * 3);
  const set = (bone: number, x: number, y: number, z: number) => {
    j[bone * 3] = x;
    j[bone * 3 + 1] = y;
    j[bone * 3 + 2] = z;
  };
  set(Bone.hips, 0, SEG.hipY, 0);
  set(Bone.spine, 0, 1.1, -0.004);
  set(Bone.chest, 0, 1.3, -0.006);
  set(Bone.neck, 0, 1.48, 0.006);
  set(Bone.head, 0, 1.575, 0.012);
  set(Bone.hair, 0, 1.66, 0.078);
  for (const side of [0, 1] as const) {
    const sx = side === 0 ? -1 : 1;
    const [clav, upper, fore, hand, fingers] = ARM[side];
    set(clav, sx * 0.035, 1.44, 0.002);
    set(upper, sx * p.shoulderX, SEG.shoulderY, 0.006);
    set(fore, sx * p.shoulderX, SEG.shoulderY - SEG.upperArm, 0.006);
    set(hand, sx * p.shoulderX, SEG.shoulderY - SEG.upperArm - SEG.forearm, 0.006);
    set(fingers, sx * p.shoulderX, SEG.shoulderY - SEG.upperArm - SEG.forearm - SEG.palm, 0.006);
    const [thigh, shin, foot, toe] = LEG[side];
    set(thigh, sx * p.hipX, SEG.hipJointY, 0);
    set(shin, sx * p.hipX, SEG.hipJointY - SEG.thigh, 0);
    set(foot, sx * p.hipX, SEG.ankleY, 0);
    set(toe, sx * p.hipX, 0.028, -0.118);
  }
  return j;
}

/** Joint rest position relative to its parent joint (what a Bone's `position` is at rest). */
export function restOffset(joints: Float32Array, bone: number, out: { x: number; y: number; z: number }): void {
  const parent = BONE_PARENT[bone]!;
  const px = parent < 0 ? 0 : joints[parent * 3]!;
  const py = parent < 0 ? 0 : joints[parent * 3 + 1]!;
  const pz = parent < 0 ? 0 : joints[parent * 3 + 2]!;
  out.x = joints[bone * 3]! - px;
  out.y = joints[bone * 3 + 1]! - py;
  out.z = joints[bone * 3 + 2]! - pz;
}
