import * as THREE from 'three';
import { CH } from './pose.js';
import { DEG, clamp, quatFrameToFrame } from '../engine/math.js';

// ---------------------------------------------------------------------------
// Skeleton definitions for the three supplied models. Every rig is normalised
// to a canonical T-pose at load so one set of authored poses drives them all.
// ---------------------------------------------------------------------------
const fingersRigify = (s) => ({
  thumb: [`thumb01${s}`, `thumb02${s}`, `thumb03${s}`],
  index: [`f_index01${s}`, `f_index02${s}`, `f_index03${s}`],
  middle: [`f_middle01${s}`, `f_middle02${s}`, `f_middle03${s}`],
  ring: [`f_ring01${s}`, `f_ring02${s}`, `f_ring03${s}`],
  pinky: [`f_pinky01${s}`, `f_pinky02${s}`, `f_pinky03${s}`],
});
const fingersEve = (s) => ({
  thumb: [1, 2, 3].map((i) => `Armature_${s}_Thumb_01_0${i}SHJnt`),
  index: [1, 2, 3].map((i) => `Armature_${s}_Finger_01_0${i}SHJnt`),
  middle: [1, 2, 3].map((i) => `Armature_${s}_Finger_02_0${i}SHJnt`),
  ring: [1, 2, 3].map((i) => `Armature_${s}_Finger_03_0${i}SHJnt`),
  pinky: [1, 2, 3].map((i) => `Armature_${s}_Finger_04_0${i}SHJnt`),
});
const fingersValve = (s) => {
  const f = (n) => [`ValveBipedBip01_${s}_Finger${n}`, `ValveBipedBip01_${s}_Finger${n}1`, `ValveBipedBip01_${s}_Finger${n}2`];
  return { thumb: f(0), index: f(1), middle: f(2), ring: f(3), pinky: f(4) };
};

const fingersBip = (s) => {
  const f = (n) => [0, 1, 2].map((i) => `bip_${n}_${i}_${s}`);
  return { thumb: f('thumb'), index: f('index'), middle: f('middle'), ring: f('ring'), pinky: f('pinky') };
};

export const RIG_DEFS = {
  invincible: {
    hips: 'Hips',
    spine: ['spine001', 'spine002', 'Chest'], spineW: [0.3, 0.33, 0.37],
    neck: 'NEck', head: 'Head',
    L: { clav: 'shoulderL', upper: 'upper_armL', fore: 'forearmL', hand: 'handL', thigh: 'thighL', shin: 'shinL', foot: 'footL', toe: 'toeL', fingers: fingersRigify('L') },
    R: { clav: 'shoulderR', upper: 'upper_armR', fore: 'forearmR', hand: 'handR', thigh: 'thighR', shin: 'shinR', foot: 'footR', toe: 'toeR', fingers: fingersRigify('R') },
    chains: [],
  },
  eve: {
    hips: 'Armature_ROOTSHJnt',
    spine: ['Armature_Spine_01SHJnt', 'Armature_Spine_02SHJnt', 'Armature_Spine_TopSHJnt'], spineW: [0.3, 0.33, 0.37],
    neck: 'Armature_Neck_01SHJnt', head: 'Armature_Neck_TopSHJnt',
    L: { clav: 'Armature_l_Arm_ClavicleSHJnt', upper: 'Armature_l_Arm_ShoulderSHJnt', fore: 'Armature_l_Arm_ElbowSHJnt', hand: 'Armature_l_Arm_WristSHJnt', thigh: 'Armature_l_Leg_HipSHJnt', shin: 'Armature_l_Leg_KneeSHJnt', foot: 'Armature_l_Leg_AnkleSHJnt', toe: 'Armature_l_Leg_BallSHJnt', fingers: fingersEve('l') },
    R: { clav: 'Armature_r_Arm_ClavicleSHJnt', upper: 'Armature_r_Arm_ShoulderSHJnt', fore: 'Armature_r_Arm_ElbowSHJnt', hand: 'Armature_r_Arm_WristSHJnt', thigh: 'Armature_r_Leg_HipSHJnt', shin: 'Armature_r_Leg_KneeSHJnt', foot: 'Armature_r_Leg_AnkleSHJnt', toe: 'Armature_r_Leg_BallSHJnt', fingers: fingersEve('r') },
    chains: [
      { name: 'hair', bones: ['Armature_hair_01_01SHJnt', 'Armature_hair_01_02SHJnt', 'Armature_hair_01_03SHJnt', 'Armature_hair_01_04SHJnt'], tipExtend: 0.09, stiffness: 0.22, drag: 0.9, gravity: 0.7, radius: 0.09 },
      { name: 'cape', bones: ['Armature_cape_01_01SHJnt', 'Armature_cape_01_02SHJnt', 'Armature_cape_01_03SHJnt'], tipExtend: 0.11, stiffness: 0.12, drag: 1.6, gravity: 1.0, radius: 0.13, behind: { fwd: 0.08, up: 0.1 } },
    ],
  },
  robot: {
    hips: 'bip_pelvis',
    spine: ['bip_spine_0', 'bip_spine_1', 'bip_spine_2', 'bip_spine_3', 'bip_spine_4'], spineW: [0.18, 0.2, 0.2, 0.22, 0.2],
    neck: 'bip_neck', head: 'bip_head',
    // the chest panels are skinned to proxy chains hanging off spine_2: they ride with the bones they shadow
    follow: [['spine_04_proxy_l', 'bip_spine_3'], ['spine_04_proxy_r', 'bip_spine_3'], ['spine_04_proxy_c', 'bip_spine_3'],
      ['clavicle_l_proxy_l', 'bip_collar_L'], ['clavicle_r_proxy_r', 'bip_collar_R'], ['clavicle_l_proxy_c', 'bip_collar_L'], ['clavicle_r_proxy_c', 'bip_collar_R']],
    L: { clav: 'bip_collar_L', upper: 'bip_upperArm_L', fore: 'bip_lowerArm_L', hand: 'bip_hand_L', thigh: 'bip_hip_L', shin: 'bip_knee_L', foot: 'bip_foot_L', toe: 'bip_toe_L', fingers: fingersBip('L') },
    R: { clav: 'bip_collar_R', upper: 'bip_upperArm_R', fore: 'bip_lowerArm_R', hand: 'bip_hand_R', thigh: 'bip_hip_R', shin: 'bip_knee_R', foot: 'bip_foot_R', toe: 'bip_toe_R', fingers: fingersBip('R') },
    chains: [],
  },
  omniman: {
    hips: 'ValveBipedBip01_Pelvis',
    spine: ['ValveBipedBip01_Spine', 'ValveBipedBip01_Spine1', 'ValveBipedBip01_Spine2', 'ValveBipedBip01_Spine4'], spineW: [0.22, 0.24, 0.26, 0.28],
    neck: 'ValveBipedBip01_Neck1', head: 'ValveBipedBip01_Head1',
    jaw: 'mandible_C',
    brows: { inner: ['brow_inner_L', 'brow_inner_R'] },
    follow: [['spine_01', 'ValveBipedBip01_Spine'], ['spine_02', 'ValveBipedBip01_Spine1'], ['spine_03', 'ValveBipedBip01_Spine2'], ['spine_04', 'ValveBipedBip01_Spine4']],
    L: { clav: 'ValveBipedBip01_L_Clavicle', upper: 'ValveBipedBip01_L_UpperArm', fore: 'ValveBipedBip01_L_Forearm', hand: 'ValveBipedBip01_L_Hand', thigh: 'ValveBipedBip01_L_Thigh', shin: 'ValveBipedBip01_L_Calf', foot: 'ValveBipedBip01_L_Foot', toe: 'ValveBipedBip01_L_Toe0', fingers: fingersValve('L') },
    R: { clav: 'ValveBipedBip01_R_Clavicle', upper: 'ValveBipedBip01_R_UpperArm', fore: 'ValveBipedBip01_R_Forearm', hand: 'ValveBipedBip01_R_Hand', thigh: 'ValveBipedBip01_R_Thigh', shin: 'ValveBipedBip01_R_Calf', foot: 'ValveBipedBip01_R_Foot', toe: 'ValveBipedBip01_R_Toe0', fingers: fingersValve('R') },
    chains: [
      { name: 'capeL', bones: ['Bone_Cape_3_01', 'Bone_Cape_3_02', 'Bone_Cape_3_03', 'Bone_Cape_3_04', 'Bone_Cape_3_05', 'Bone_Cape_3_06', 'cape_07_l'], stiffness: 0.08, drag: 2.6, gravity: 1.0, radius: 0.12, group: 'cape', behind: { fwd: 0.04, up: 0.06 } },
      { name: 'capeC', bones: ['Bone_Cape_4_01', 'Bone_Cape_4_02', 'Bone_Cape_4_03', 'Bone_Cape_4_04', 'Bone_Cape_4_05', 'Bone_Cape_4_06', 'cape_07_c'], stiffness: 0.08, drag: 2.6, gravity: 1.0, radius: 0.14, group: 'cape', behind: { fwd: 0.04, up: 0.06 } },
      { name: 'capeR', bones: ['Bone_Cape_5_01', 'Bone_Cape_5_02', 'Bone_Cape_5_03', 'Bone_Cape_5_04', 'Bone_Cape_5_05', 'Bone_Cape_5_06', 'cape_07_r'], stiffness: 0.08, drag: 2.6, gravity: 1.0, radius: 0.12, group: 'cape', behind: { fwd: 0.04, up: 0.06 } },
    ],
  },
};

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3(), _s = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _h = new THREE.Vector3();
const _e = new THREE.Euler();

class Joint {
  constructor(bone) {
    this.bone = bone;
    this.LT = new THREE.Quaternion(); // T-pose local rotation
    this.WT = new THREE.Quaternion(); // T-pose rig-space rotation
    this.PT = new THREE.Quaternion(); // parent's T-pose rig-space rotation
    this.PTinv = new THREE.Quaternion();
    this.pos = new THREE.Vector3(); // T-pose rig-space joint position
    this.restPos = bone.position.clone();
  }
  /** Apply a rig-space rotation delta expressed in T-pose context. */
  setDelta(dq) { this.bone.quaternion.copy(this.PTinv).multiply(dq).multiply(this.WT); }
  setRest() { this.bone.quaternion.copy(this.LT); }
}

export class Rig {
  /**
   * @param {THREE.Object3D} space rig space (must be at identity when constructed)
   * @param {object} def entry from RIG_DEFS
   */
  constructor(space, def) {
    this.space = space;
    this.def = def;
    this.bones = new Map();
    space.traverse((o) => { if (o.isBone && !this.bones.has(o.name)) this.bones.set(o.name, o); });
    const need = (n) => { const b = this.bones.get(n); if (!b) throw new Error('Missing bone ' + n); return b; };

    // Follow constraints: re-parent duplicate helper chains so they move with the main skeleton.
    for (const [child, target] of def.follow || []) {
      const c = this.bones.get(child), t = this.bones.get(target);
      if (c && t) t.attach(c);
    }

    space.updateMatrixWorld(true);
    this._spaceInv = new THREE.Matrix4();
    this._refreshSpace();

    // ---- Normalise to canonical T-pose ----
    for (const s of ['L', 'R']) {
      const d = def[s], sx = s === 'L' ? 1 : -1;
      const fingerBase = d.fingers.middle ? d.fingers.middle[0] : null;
      this._alignBone(need(d.upper), need(d.fore), _a.set(sx, 0, 0), null);
      this._alignBone(need(d.fore), need(d.hand), _a.set(sx, 0, 0), null);
      if (fingerBase && this.bones.get(fingerBase)) this._alignBone(need(d.hand), need(fingerBase), _a.set(sx, 0, 0), null);
      this._alignBone(need(d.thigh), need(d.shin), _a.set(0, -1, 0), need(d.foot));
      this._alignBone(need(d.shin), need(d.foot), _a.set(0, -1, 0), need(d.foot));
    }
    space.updateMatrixWorld(true);

    // ---- Record joints ----
    const J = (name) => { const b = this.bones.get(name); if (!b) return null; const j = new Joint(b); this._recordJoint(j); return j; };
    this.hips = J(def.hips);
    this.spine = def.spine.map(J);
    this.spineW = def.spineW;
    this.neck = J(def.neck);
    this.head = J(def.head);
    this.jaw = def.jaw ? J(def.jaw) : null;
    this.brows = def.brows ? def.brows.inner.map(J).filter(Boolean) : [];
    // hips position mapping from rig space to the hips' parent local space
    this.hips.parentInv3 = new THREE.Matrix3();
    {
      _m.multiplyMatrices(this._spaceInv, this.hips.bone.parent.matrixWorld).invert();
      this.hips.parentInv3.setFromMatrix4(_m);
    }
    this.side = {};
    for (const s of ['L', 'R']) {
      const d = def[s];
      const sd = {
        sx: s === 'L' ? 1 : -1,
        clav: J(d.clav), upper: J(d.upper), fore: J(d.fore), hand: J(d.hand),
        thigh: J(d.thigh), shin: J(d.shin), foot: J(d.foot), toe: J(d.toe),
        fingers: {},
      };
      for (const f in d.fingers) sd.fingers[f] = d.fingers[f].map(J).filter(Boolean);
      // arm frame at T-pose
      sd.upperLen = sd.upper.pos.distanceTo(sd.fore.pos);
      sd.foreLen = sd.fore.pos.distanceTo(sd.hand.pos);
      sd.armLen = sd.upperLen + sd.foreLen;
      sd.d0 = new THREE.Vector3().subVectors(sd.fore.pos, sd.upper.pos).normalize();
      sd.f0 = new THREE.Vector3().subVectors(sd.hand.pos, sd.fore.pos).normalize();
      sd.h0 = mirrorAxis(new THREE.Vector3(0, -1, 0), sd.sx); // elbow hinge
      orthonorm(sd.h0, sd.d0);
      // leg frame
      sd.thighLen = sd.thigh.pos.distanceTo(sd.shin.pos);
      sd.shinLen = sd.shin.pos.distanceTo(sd.foot.pos);
      sd.legD0 = new THREE.Vector3().subVectors(sd.shin.pos, sd.thigh.pos).normalize();
      sd.legH0 = new THREE.Vector3(1, 0, 0); orthonorm(sd.legH0, sd.legD0);
      sd.ankleHeight = sd.foot.pos.y;
      sd.toeLen = sd.toe ? sd.toe.pos.distanceTo(sd.foot.pos) : 0.15;
      // hand frame (palm normal from finger layout)
      const fb = (k) => (sd.fingers[k] && sd.fingers[k][0]) ? sd.fingers[k][0].pos : null;
      const mid = fb('middle') || fb('index');
      const handDir = new THREE.Vector3().subVectors(mid, sd.hand.pos).normalize();
      const sideV = new THREE.Vector3().subVectors(fb('index'), fb('pinky') || fb('ring')).normalize();
      const palm = new THREE.Vector3().crossVectors(handDir, sideV).normalize().multiplyScalar(sd.sx);
      sd.handDir = handDir; sd.palm = palm; sd.sideV = sideV;
      sd.flexAxis = new THREE.Vector3().crossVectors(handDir, palm).normalize();
      sd.devAxis = s === 'L' ? palm.clone() : palm.clone().negate();
      sd.rollAxis = handDir.clone().multiplyScalar(sd.sx);
      // finger curl axes
      sd.fingerAxes = {};
      for (const f in sd.fingers) {
        const ch = sd.fingers[f];
        if (ch.length < 2) continue;
        const fd = new THREE.Vector3().subVectors(ch[1].pos, ch[0].pos).normalize();
        let target = palm.clone();
        if (f === 'thumb') target = palm.clone().multiplyScalar(0.55).addScaledVector(sideV, -0.85).normalize();
        const curl = new THREE.Vector3().crossVectors(fd, target).normalize();
        const spread = new THREE.Vector3().crossVectors(fd, sideV).normalize();
        sd.fingerAxes[f] = { curl, spread };
      }
      this.side[s] = sd;
    }
    this.hipsHeight = this.hips.pos.y;
    this.headTop = new THREE.Box3().setFromObject(space).max.y;
    this.shoulderWidth = this.side.L.upper.pos.x - this.side.R.upper.pos.x;
    this.chains = [];
    for (const c of def.chains || []) {
      const joints = c.bones.map(J).filter(Boolean);
      if (joints.length >= 2) this.chains.push({ def: c, joints });
    }
  }

  _refreshSpace() {
    this.space.updateWorldMatrix(true, false);
    this._spaceInv.copy(this.space.matrixWorld).invert();
  }
  rigPos(obj, out) {
    _m.multiplyMatrices(this._spaceInv, obj.matrixWorld);
    return out.setFromMatrixPosition(_m);
  }
  rigQuat(obj, out) {
    _m.multiplyMatrices(this._spaceInv, obj.matrixWorld);
    _m.decompose(_p, out, _s);
    return out;
  }
  _recordJoint(j) {
    j.LT.copy(j.bone.quaternion);
    this.rigQuat(j.bone, j.WT);
    this.rigQuat(j.bone.parent, j.PT);
    j.PTinv.copy(j.PT).invert();
    this.rigPos(j.bone, j.pos);
  }
  _alignBone(bone, child, target, keepWorld) {
    this.space.updateMatrixWorld(true);
    const keepQ = keepWorld ? this.rigQuat(keepWorld, new THREE.Quaternion()) : null;
    const p0 = this.rigPos(bone, new THREE.Vector3());
    const p1 = this.rigPos(child, new THREE.Vector3());
    const dir = p1.sub(p0).normalize();
    const R = new THREE.Quaternion().setFromUnitVectors(dir, target.clone().normalize());
    const W = this.rigQuat(bone, new THREE.Quaternion());
    const P = this.rigQuat(bone.parent, new THREE.Quaternion());
    const W2 = R.multiply(W);
    bone.quaternion.copy(P.invert().multiply(W2));
    bone.updateMatrixWorld(true);
    if (keepQ) {
      const kp = this.rigQuat(keepWorld.parent, new THREE.Quaternion());
      keepWorld.quaternion.copy(kp.invert().multiply(keepQ));
      keepWorld.updateMatrixWorld(true);
    }
  }

  // -------------------------------------------------------------------------
  // Apply a pose. ctx: { aimQ: rig-space rotation of aim relative to body fwd,
  //   groundY: rig-space ground height, ikSpaceQ optional }
  // -------------------------------------------------------------------------
  apply(pose, ctx) {
    const v = pose.v;
    this._refreshSpace();
    // Root
    _e.set(v[CH.rootPitch] * DEG, v[CH.rootYaw] * DEG, v[CH.rootRoll] * DEG, 'YXZ');
    _q.setFromEuler(_e);
    this.hips.setDelta(_q);
    _a.set(v[CH.rootX], v[CH.rootY], v[CH.rootZ]).applyMatrix3(this.hips.parentInv3);
    this.hips.bone.position.copy(this.hips.restPos).add(_a);
    // Spine
    for (let i = 0; i < this.spine.length; i++) {
      const w = this.spineW[i];
      _e.set(v[CH.spinePitch] * DEG * w, v[CH.spineYaw] * DEG * w, v[CH.spineRoll] * DEG * w, 'YXZ');
      this.spine[i].setDelta(_q.setFromEuler(_e));
    }
    _e.set(v[CH.neckPitch] * DEG, v[CH.neckYaw] * DEG, v[CH.neckRoll] * DEG, 'YXZ');
    this.neck.setDelta(_q.setFromEuler(_e));
    _e.set(v[CH.headPitch] * DEG, v[CH.headYaw] * DEG, v[CH.headRoll] * DEG, 'YXZ');
    this.head.setDelta(_q.setFromEuler(_e));
    if (this.jaw) this.jaw.setDelta(_q.setFromAxisAngle(_a.set(1, 0, 0), v[CH.jaw] * 22 * DEG));
    for (let i = 0; i < this.brows.length; i++) {
      const b = this.brows[i];
      b.bone.position.copy(b.restPos);
      b.bone.position.y -= v[CH.browAnger] * 0.004;
    }
    // Clavicles
    for (const s of ['L', 'R']) {
      const sd = this.side[s], o = s === 'L' ? 0 : 0;
      const lift = v[CH[s + 'clavLift']] * DEG, fwd = v[CH[s + 'clavFwd']] * DEG;
      _q.setFromAxisAngle(_a.set(0, 0, sd.sx), lift);
      _q2.setFromAxisAngle(_b.set(0, -sd.sx, 0), fwd);
      sd.clav.setDelta(_q.multiply(_q2));
      void o;
    }
    this.space.updateMatrixWorld(true);
    for (const s of ['L', 'R']) this._solveArm(s, v, ctx);
    for (const s of ['L', 'R']) this._solveLeg(s, v, ctx);
    this.space.updateMatrixWorld(true);
  }

  _solveArm(s, v, ctx) {
    const sd = this.side[s], sx = sd.sx;
    const P = (c) => v[CH[s + c]];
    // --- FK direction / hinge in mirrored space ---
    const dm = _a.set(P('armX'), P('armY'), P('armZ'));
    if (dm.lengthSq() < 1e-8) dm.set(0, -1, 0);
    dm.normalize();
    const hm = naturalArmHinge(dm, _b);
    hm.applyAxisAngle(dm, P('armTwist') * DEG);
    const d = _c.set(dm.x * sx, dm.y, dm.z);
    const h = mirrorAxis(_h.copy(hm), sx);
    let bend = P('elbow') * DEG;
    // --- IK ---
    const w = P('ikW');
    if (w > 0.001) {
      const ik = this._armIK(s, sd, v, ctx);
      if (ik) {
        d.lerp(ik.d, w).normalize();
        h.lerp(ik.h, w); orthonorm(h, d);
        bend = bend + (ik.bend - bend) * w;
      }
    }
    sd.upper.setDelta(quatFrameToFrame(sd.d0, sd.h0, d, h, _q));
    _q.setFromAxisAngle(sd.h0, bend);
    _q2.setFromAxisAngle(sd.f0, P('foreTwist') * DEG * sx);
    sd.fore.setDelta(_q.multiply(_q2));
    _q.setFromAxisAngle(sd.flexAxis, P('handFlex') * DEG);
    _q2.setFromAxisAngle(sd.devAxis, P('handDev') * DEG);
    _q3.setFromAxisAngle(sd.rollAxis, P('handRoll') * DEG);
    sd.hand.setDelta(_q.multiply(_q2).multiply(_q3));
    // Fingers
    const fist = P('fist'), spread = P('spread');
    for (const f in sd.fingers) {
      const ch = sd.fingers[f], ax = sd.fingerAxes[f];
      if (!ax) continue;
      const thumb = f === 'thumb';
      const curls = thumb ? FIST_THUMB : FIST_CURL;
      const spr = thumb ? 18 : SPREAD[f] || 0;
      for (let i = 0; i < ch.length; i++) {
        const c = (curls[i] * fist + REST_CURL[i] * (1 - fist) * (thumb ? 0.3 : 1)) * DEG;
        _q.setFromAxisAngle(ax.curl, c);
        if (i === 0 && spr) _q.premultiply(_q2.setFromAxisAngle(ax.spread, spr * spread * DEG * (1 - fist)));
        ch[i].setDelta(_q);
      }
    }
  }

  /** Two-bone IK for an arm. Target coords are shoulder-relative, in arm lengths, mirrored, in aim frame. */
  _armIK(s, sd, v, ctx) {
    const sx = sd.sx;
    const S = this.rigPos(sd.upper.bone, _ikS);
    // target in rig space
    _ikT.set(v[CH[s + 'ikX']] * sx, v[CH[s + 'ikY']], v[CH[s + 'ikZ']]).multiplyScalar(sd.armLen);
    _ikP.set(v[CH[s + 'poleX']] * sx, v[CH[s + 'poleY']], v[CH[s + 'poleZ']]);
    if (ctx && ctx.aimQ) { _ikT.applyQuaternion(ctx.aimQ); _ikP.applyQuaternion(ctx.aimQ); }
    if (ctx && ctx.ikTarget && ctx.ikTarget[s]) _ikT.copy(ctx.ikTarget[s]).sub(S);
    _ikT.add(S);
    _ikP.add(S);
    const res = twoBoneIK(S, _ikT, _ikP, sd.upperLen, sd.foreLen, _ikRes);
    if (!res) return null;
    // convert to T-pose context of the upper arm's parent
    this.rigQuat(sd.upper.bone.parent, _q3);
    _q2.copy(sd.upper.PT).multiply(_q3.invert()); // K^-1 = PT * Pcur^-1
    res.d.applyQuaternion(_q2);
    res.h.applyQuaternion(_q2);
    return res;
  }

  _solveLeg(s, v, ctx) {
    const sd = this.side[s], sx = sd.sx;
    const P = (c) => v[CH[s + c]];
    const dm = _a.set(P('legX'), P('legY'), P('legZ'));
    if (dm.lengthSq() < 1e-8) dm.set(0, -1, 0);
    dm.normalize();
    const d = _c.set(dm.x * sx, dm.y, dm.z);
    const h = naturalLegHinge(d, _h);
    h.applyAxisAngle(d, P('legTwist') * DEG * -sx);
    let bend = P('knee') * DEG;
    const w = P('legIkW');
    if (w > 0.001) {
      const S = this.rigPos(sd.thigh.bone, _ikS);
      _ikT.set(P('legIkX'), P('legIkY'), P('legIkZ'));
      // knee pole: forward along foot yaw
      const yaw = (P('footYaw') * sx) * DEG + (ctx && ctx.legYaw ? ctx.legYaw : 0);
      _ikP.set(Math.sin(yaw), -0.35, Math.cos(yaw)).add(S);
      const res = twoBoneIK(S, _ikT, _ikP, sd.thighLen, sd.shinLen, _ikRes);
      if (res) {
        this.rigQuat(sd.thigh.bone.parent, _q3);
        _q2.copy(sd.thigh.PT).multiply(_q3.invert());
        res.d.applyQuaternion(_q2); res.h.applyQuaternion(_q2);
        d.lerp(res.d, w).normalize();
        h.lerp(res.h, w); orthonorm(h, d);
        bend = bend + (res.bend - bend) * w;
      }
    }
    sd.thigh.setDelta(quatFrameToFrame(sd.legD0, sd.legH0, d, h, _q));
    sd.shin.setDelta(_q.setFromAxisAngle(sd.legH0, bend));
    // Foot: local (relative to shin) vs ground aligned
    _e.set(P('footPitch') * DEG, P('footYaw') * DEG * sx, P('footRoll') * DEG * sx, 'YXZ');
    _q.setFromEuler(_e);
    sd.foot.setDelta(_q);
    const g = P('footGround');
    if (g > 0.001) {
      sd.thigh.bone.updateMatrixWorld(true);
      // desired rig rotation = yawPitchRoll * WT(foot)
      _q2.copy(_q).multiply(sd.foot.WT);
      this.rigQuat(sd.shin.bone, _q3);
      _q3.invert().multiply(_q2); // local
      sd.foot.bone.quaternion.slerp(_q3, g);
    }
    if (sd.toe) sd.toe.setDelta(_q.setFromAxisAngle(_a.set(1, 0, 0), P('toe') * DEG));
  }

  /**
   * After apply(): any foot below the world floor (FK legs or a fading air pose under a crouch can
   * push one through) is re-solved with leg IK onto it.
   */
  floorFeet(v, ctx, floorY) {
    const e = this.space.matrixWorld.elements, scale = Math.hypot(e[0], e[1], e[2]);
    let fixed = false;
    for (const s of ['L', 'R']) {
      const sd = this.side[s];
      _fp.setFromMatrixPosition(sd.foot.bone.matrixWorld);
      const minY = floorY + sd.ankleHeight * scale * 0.9;
      if (_fp.y >= minY) continue;
      _fp.y = minY;
      _fp.applyMatrix4(this._spaceInv);
      v[CH[s + 'legIkW']] = 1; v[CH[s + 'legIkX']] = _fp.x; v[CH[s + 'legIkY']] = _fp.y; v[CH[s + 'legIkZ']] = _fp.z;
      this._solveLeg(s, v, ctx);
      fixed = true;
    }
    if (fixed) this.space.updateMatrixWorld(true);
  }

  /** Current rig-space position of a joint (after apply). */
  jointPos(s, part, out) { return this.rigPos(this.side[s][part].bone, out); }
}

const FIST_CURL = [80, 95, 70];
const FIST_THUMB = [25, 30, 35];
const REST_CURL = [14, 18, 10];
const SPREAD = { index: 9, middle: 0, ring: -7, pinky: -14 };

const _ikS = new THREE.Vector3(), _ikT = new THREE.Vector3(), _ikP = new THREE.Vector3(), _fp = new THREE.Vector3();
const _ikRes = { d: new THREE.Vector3(), h: new THREE.Vector3(), bend: 0, elbow: new THREE.Vector3() };
const _t1 = new THREE.Vector3(), _t2 = new THREE.Vector3(), _t3 = new THREE.Vector3();

/** Analytic two-bone IK. Returns upper direction d, hinge h and bend angle (rad). */
export function twoBoneIK(S, T, Pole, L1, L2, out) {
  const st = _t1.subVectors(T, S);
  let dist = st.length();
  if (dist < 1e-5) return null;
  const dir = st.multiplyScalar(1 / dist);
  dist = clamp(dist, Math.abs(L1 - L2) + 1e-4, (L1 + L2) * 0.9995);
  const sp = _t2.subVectors(Pole, S);
  const h = out.h.crossVectors(sp, dir);
  if (h.lengthSq() < 1e-10) { h.set(1, 0, 0); orthonorm(h, dir); }
  h.normalize();
  const bendDir = _t3.crossVectors(dir, h).normalize(); // in plane, toward pole side
  // ensure bendDir points toward pole
  if (bendDir.dot(sp) < 0) bendDir.negate();
  const cosA = clamp((L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist), -1, 1);
  const a = Math.acos(cosA);
  out.elbow.copy(S).addScaledVector(dir, Math.cos(a) * L1).addScaledVector(bendDir, Math.sin(a) * L1);
  out.d.subVectors(out.elbow, S).normalize();
  const cosB = clamp((L1 * L1 + L2 * L2 - dist * dist) / (2 * L1 * L2), -1, 1);
  out.bend = Math.PI - Math.acos(cosB);
  // hinge must be orthogonal to d (it is, plane normal), keep orientation
  orthonorm(out.h, out.d);
  return out;
}

function orthonorm(h, d) {
  h.addScaledVector(d, -h.dot(d));
  if (h.lengthSq() < 1e-10) { h.set(0, 0, 1); h.addScaledVector(d, -h.dot(d)); }
  return h.normalize();
}
/** Mirror an axial vector (rotation axis) across the YZ plane for the right side. */
function mirrorAxis(a, sx) { if (sx < 0) { a.y = -a.y; a.z = -a.z; } return a; }

/** Elbow hinge that gives natural forward elbow flexion for a direction (mirrored left-side space). */
function naturalArmHinge(dm, out) {
  out.set(-1, -0.3, 0);
  // when arm points backward a lot, keep elbow pointing down/back
  return orthonorm(out, dm);
}
function naturalLegHinge(d, out) {
  out.set(1, 0, 0);
  return orthonorm(out, d);
}
