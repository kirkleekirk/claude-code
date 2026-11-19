import { Quaternion, Vector3 } from 'three';
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

/**
 * Plant a leg: the ankle reaches (tx, ty, tz) and the foot lies at `pitch` (radians, + = toes up)
 * relative to the body's ground plane. Returns how far the target was out of reach (0 = reached).
 */
export function solveLeg(pose: Pose, joints: Float32Array, side: 0 | 1, tx: number, ty: number, tz: number, pitch: number, roll = 0): number {
  const [thigh, shin, foot] = LEG[side];
  boneTransform(pose, joints, Bone.hips, _hp, _hq);
  // Hip joint in body space.
  _w.set(joints[thigh * 3]! - joints[0]!, joints[thigh * 3 + 1]! - joints[1]!, joints[thigh * 3 + 2]! - joints[2]!).applyQuaternion(_hq).add(_hp);
  _v.set(tx - _w.x, ty - _w.y, tz - _w.z);
  _qa.copy(_hq).invert();
  _v.applyQuaternion(_qa);
  const L1 = SEG.thigh, L2 = SEG.shin;
  const raw = _v.length();
  const D = Math.min(Math.max(raw, 0.12), (L1 + L2) * 0.9995);
  const miss = Math.max(0, raw - D);
  _v.divideScalar(raw || 1);
  const phi = -Math.asin(Math.max(-1, Math.min(1, _v.z)));
  const theta = Math.atan2(_v.x, -_v.y);
  const cosK = (L1 * L1 + L2 * L2 - D * D) / (2 * L1 * L2);
  const knee = Math.PI - Math.acos(Math.max(-1, Math.min(1, cosK)));
  const cosA = (L1 * L1 + D * D - L2 * L2) / (2 * L1 * D);
  const alpha = Math.acos(Math.max(-1, Math.min(1, cosA)));
  pose.set(thigh, phi + alpha, 0, theta);
  pose.set(shin, -knee, 0, 0);
  // Foot: undo the chain above it, then apply the wanted ground-relative tilt.
  quatFromPose(_qb, phi + alpha, 0, theta);
  _qc.copy(_hq).multiply(_qb);
  quatFromPose(_qb, -knee, 0, 0);
  _qc.multiply(_qb).invert();
  quatFromPose(_qb, pitch, 0, roll);
  _qc.multiply(_qb);
  poseFromQuat(pose, foot, _qc);
  return miss;
}

const _ax = new Vector3();

/**
 * Reach a hand: the wrist goes to (tx, ty, tz). `elbowOut` swings the elbow outward around the
 * shoulder–wrist line (radians). The hand keeps its pose-relative rotation.
 */
export function solveArm(pose: Pose, joints: Float32Array, side: 0 | 1, tx: number, ty: number, tz: number, elbowOut: number): number {
  const [clav, upper, fore] = ARM[side];
  boneTransform(pose, joints, clav, _hp, _hq);
  _w.set(joints[upper * 3]! - joints[clav * 3]!, joints[upper * 3 + 1]! - joints[clav * 3 + 1]!, joints[upper * 3 + 2]! - joints[clav * 3 + 2]!).applyQuaternion(_hq).add(_hp);
  _v.set(tx - _w.x, ty - _w.y, tz - _w.z);
  _qa.copy(_hq).invert();
  _v.applyQuaternion(_qa);
  const L1 = SEG.upperArm, L2 = SEG.forearm;
  const raw = _v.length();
  const D = Math.min(Math.max(raw, 0.08), (L1 + L2) * 0.999);
  const miss = Math.max(0, raw - D);
  _v.divideScalar(raw || 1);
  const phi = -Math.asin(Math.max(-1, Math.min(1, _v.z)));
  const theta = Math.atan2(_v.x, -_v.y);
  const cosK = (L1 * L1 + L2 * L2 - D * D) / (2 * L1 * L2);
  const elbow = Math.PI - Math.acos(Math.max(-1, Math.min(1, cosK)));
  const cosA = (L1 * L1 + D * D - L2 * L2) / (2 * L1 * D);
  const alpha = Math.acos(Math.max(-1, Math.min(1, cosA)));
  quatFromPose(_qb, phi - alpha, 0, theta);
  if (elbowOut !== 0) {
    // Swing the bend plane around the shoulder→wrist axis (outward for each side).
    _ax.copy(_v).normalize();
    _qc.setFromAxisAngle(_ax, (side === 0 ? -1 : 1) * elbowOut);
    _qb.premultiply(_qc);
  }
  poseFromQuat(pose, upper, _qb);
  pose.set(fore, elbow, pose.r[fore * 3 + 1]!, 0);
  return miss;
}
