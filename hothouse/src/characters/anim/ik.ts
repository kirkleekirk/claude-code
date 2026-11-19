import { Matrix4, Quaternion, Vector3 } from 'three';
import { ARM, BONE_PARENT, Bone, LEG, SEG } from '../rig';
import { poseFromQuat, quatFromPose, type Pose } from './pose';

/**
 * Forward kinematics over a pose and analytic two-bone IK for legs and arms. Everything is in
 * body space at neutral height; no allocation after module load.
 */

const _q = new Quaternion();
const _qa = new Quaternion();
const _qb = new Quaternion();
const _qc = new Quaternion();
const _v = new Vector3();
const _w = new Vector3();
const _chain: number[] = [];

/**
 * Body-space position and rotation of a bone's origin under a pose (the bone's own rotation is
 * included in `outQ`).
 */
export function boneTransform(pose: Pose, joints: Float32Array, bone: number, outP: Vector3, outQ: Quaternion): void {
  _chain.length = 0;
  for (let b = bone; b >= 0; b = BONE_PARENT[b]!) _chain.push(b);
  outQ.identity();
  outP.set(0, 0, 0);
  for (let i = _chain.length - 1; i >= 0; i--) {
    const b = _chain[i]!;
    const parent = BONE_PARENT[b]!;
    // Offset from the parent joint, rotated by everything above.
    _v.set(
      joints[b * 3]! - (parent >= 0 ? joints[parent * 3]! : 0),
      joints[b * 3 + 1]! - (parent >= 0 ? joints[parent * 3 + 1]! : 0),
      joints[b * 3 + 2]! - (parent >= 0 ? joints[parent * 3 + 2]! : 0),
    );
    if (b === Bone.hips) _v.x += pose.hips[0]!, _v.y += pose.hips[1]!, _v.z += pose.hips[2]!;
    outP.add(_v.applyQuaternion(outQ));
    quatFromPose(_q, pose.r[b * 3]!, pose.r[b * 3 + 1]!, pose.r[b * 3 + 2]!);
    outQ.multiply(_q);
  }
}

const _hp = new Vector3();
const _hq = new Quaternion();
const _a = new Vector3();
const _pole = new Vector3();
const _e = new Vector3();
const _bx = new Vector3();
const _by = new Vector3();
const _bz = new Vector3();
const _m = new Matrix4();

/**
 * Pole-vector two-bone IK in the parent's frame. `_v` holds the target relative to the root joint
 * and `_pole` the preferred bend direction, both in the parent frame. The middle joint is placed
 * toward the pole, so a limb never swivels on small changes of the target. Writes the upper bone's
 * rotation into `outQ` and returns the middle joint's bend angle. `bendSign` is −1 when the lower
 * bone folds toward the bone's local −Z (elbows) and +1 toward +Z (knees).
 */
function twoBone(L1: number, L2: number, minD: number, bendSign: number, outQ: Quaternion): { bend: number; miss: number } {
  const raw = _v.length();
  const D = Math.min(Math.max(raw, minD), (L1 + L2) * 0.9995);
  _a.copy(_v).divideScalar(raw || 1);
  // Middle joint: on the circle around the root→target axis, toward the pole.
  _pole.addScaledVector(_a, -_pole.dot(_a));
  if (_pole.lengthSq() < 1e-8) _pole.set(1, 0, 0).addScaledVector(_a, -_a.x);
  _pole.normalize();
  const cosA = Math.max(-1, Math.min(1, (L1 * L1 + D * D - L2 * L2) / (2 * L1 * D)));
  const sinA = Math.sqrt(1 - cosA * cosA);
  _e.copy(_a).multiplyScalar(L1 * cosA).addScaledVector(_pole, L1 * sinA);
  // Upper bone frame: its −Y runs root→middle, its ±Z points where the lower bone folds.
  _by.copy(_e).normalize().negate();
  _bz.copy(_a).multiplyScalar(D).sub(_e);
  _bz.addScaledVector(_by, -_bz.dot(_by));
  if (_bz.lengthSq() < 1e-10) _bz.copy(_pole).negate();
  _bz.normalize().multiplyScalar(bendSign);
  _bx.crossVectors(_by, _bz).normalize();
  _bz.crossVectors(_bx, _by).normalize();
  _m.makeBasis(_bx, _by, _bz);
  outQ.setFromRotationMatrix(_m);
  const cosK = Math.max(-1, Math.min(1, (L1 * L1 + L2 * L2 - D * D) / (2 * L1 * L2)));
  return { bend: Math.PI - Math.acos(cosK), miss: Math.max(0, raw - D) };
}

/**
 * Plant a leg: the ankle reaches (tx, ty, tz) and the foot lies at `pitch` (radians, + = toes up)
 * relative to the body's ground plane. Knees point forward. Returns how far the target was out
 * of reach (0 = reached).
 */
export function solveLeg(pose: Pose, joints: Float32Array, side: 0 | 1, tx: number, ty: number, tz: number, pitch: number, roll = 0): number {
  const [thigh, shin, foot] = LEG[side];
  boneTransform(pose, joints, Bone.hips, _hp, _hq);
  // Hip joint in body space.
  _w.set(joints[thigh * 3]! - joints[0]!, joints[thigh * 3 + 1]! - joints[1]!, joints[thigh * 3 + 2]! - joints[2]!).applyQuaternion(_hq).add(_hp);
  _qa.copy(_hq).invert();
  _v.set(tx - _w.x, ty - _w.y, tz - _w.z).applyQuaternion(_qa);
  _pole.set((side === 0 ? -1 : 1) * 0.12, 0, -1).applyQuaternion(_qa);
  const r = twoBone(SEG.thigh, SEG.shin, 0.12, 1, _qb);
  poseFromQuat(pose, thigh, _qb);
  pose.set(shin, -r.bend, 0, 0);
  // Foot: undo the chain above it, then apply the wanted ground-relative tilt.
  _qc.copy(_hq).multiply(_qb);
  quatFromPose(_qb, -r.bend, 0, 0);
  _qc.multiply(_qb).invert();
  quatFromPose(_qb, pitch, 0, roll);
  _qc.multiply(_qb);
  poseFromQuat(pose, foot, _qc);
  return r.miss;
}

/**
 * Reach a hand: the wrist goes to (tx, ty, tz). Elbows hang down and a little out and back;
 * `elbowOut` swings them further outward around the shoulder–wrist line (radians). The hand
 * keeps its pose-relative rotation.
 */
export function solveArm(pose: Pose, joints: Float32Array, side: 0 | 1, tx: number, ty: number, tz: number, elbowOut: number): number {
  const [clav, upper, fore] = ARM[side];
  const sx = side === 0 ? -1 : 1;
  boneTransform(pose, joints, clav, _hp, _hq);
  _w.set(joints[upper * 3]! - joints[clav * 3]!, joints[upper * 3 + 1]! - joints[clav * 3 + 1]!, joints[upper * 3 + 2]! - joints[clav * 3 + 2]!).applyQuaternion(_hq).add(_hp);
  _qa.copy(_hq).invert();
  _v.set(tx - _w.x, ty - _w.y, tz - _w.z).applyQuaternion(_qa);
  // Pole in body space (down, out, back), swung outward by elbowOut, then into the parent frame.
  const out = 0.35 + Math.sin(elbowOut) * 1.4;
  _pole.set(sx * out, -1, 0.3).applyQuaternion(_qa);
  const r = twoBone(SEG.upperArm, SEG.forearm, 0.08, -1, _qb);
  poseFromQuat(pose, upper, _qb);
  pose.set(fore, r.bend, pose.r[fore * 3 + 1]!, 0);
  return r.miss;
}
