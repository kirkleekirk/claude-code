import * as THREE from 'three';
import { Pose, CH, NCH } from './pose.js';
import { ChainSystem } from './chains.js';
import { DEG, TAU, clamp, clamp01, lerp, damp, dampT, smoothstep, Spring, noise1, fbm1, ease } from '../engine/math.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);
const FWD = new THREE.Vector3(0, 0, 1);
const frac = (x) => x - Math.floor(x);

export const STYLES = {
  invincible: {
    stanceW: 0.11, stanceSplit: 0.06, cadenceBase: 1.0, cadencePerSpeed: 0.17, cadenceMax: 2.5,
    bob: 0.045, crouchRun: 0.05, leanRun: 15, armSwing: 0.75, elbowRun: 95, yawAmp: 9, rollAmp: 4, swayAmp: 0.02,
    stepHeight: 0.30, fistRun: 0.8, heavy: 0, flyPose: 'superman', idle: 'fighter', chestUp: 0,
  },
  omniman: {
    stanceW: 0.15, stanceSplit: 0.08, cadenceBase: 0.9, cadencePerSpeed: 0.15, cadenceMax: 2.2,
    bob: 0.06, crouchRun: 0.06, leanRun: 12, armSwing: 0.55, elbowRun: 80, yawAmp: 7, rollAmp: 6, swayAmp: 0.03,
    stepHeight: 0.26, fistRun: 0.9, heavy: 1, flyPose: 'omni', idle: 'proud', chestUp: 6,
  },
  eve: {
    stanceW: 0.09, stanceSplit: 0.05, cadenceBase: 1.05, cadencePerSpeed: 0.18, cadenceMax: 2.6,
    bob: 0.04, crouchRun: 0.035, leanRun: 13, armSwing: 0.6, elbowRun: 85, yawAmp: 11, rollAmp: 5, swayAmp: 0.035,
    stepHeight: 0.24, fistRun: 0.25, heavy: 0, flyPose: 'eve', idle: 'graceful', chestUp: 2,
  },
};

class Action {
  constructor(clip, opts) {
    this.clip = clip; this.t = 0; this.speed = opts.speed ?? clip.speedScale ?? 1; this.w = 0;
    this.fadeIn = opts.fadeIn ?? clip.fadeIn; this.fadeOut = opts.fadeOut ?? clip.fadeOut;
    this.onEvent = opts.onEvent; this.onEnd = opts.onEnd; this.ev = 0; this.ending = false; this.endT = 0;
    this.hold = !!opts.hold; // loop until stop()
    this.weight = opts.weight ?? 1;
    this.mirror = !!opts.mirror;
    this.data = opts.data || {};
  }
}

export class Animator {
  constructor(rig, style) {
    this.rig = rig;
    this.style = style;
    this.base = new Pose();
    this.out = new Pose();
    this.tmp = new Pose();
    this.chains = new ChainSystem(rig);
    this.time = Math.random() * 10;
    this.phase = 0;
    this.moveBlend = 0;
    this.runBlend = 0;
    this.airBlend = 0;
    this.flyBlend = 0;
    this.moveDir = new THREE.Vector2(0, 1);
    this.legYaw = 0;
    this.prevVel = new THREE.Vector3();
    this.accelLocal = new THREE.Vector3();
    this.leanF = new Spring(0, 1.6, 0.75);
    this.leanS = new Spring(0, 1.6, 0.75);
    this.land = new Spring(0, 2.8, 0.42);
    this.flinchP = new Spring(0, 3.2, 0.32);
    this.flinchY = new Spring(0, 3.2, 0.32);
    this.flinchR = new Spring(0, 3.2, 0.32);
    this.bank = new Spring(0, 1.4, 0.8);
    this.lookYaw = new Spring(0, 3.0, 0.9);
    this.lookPitch = new Spring(0, 3.0, 0.9);
    this.bodyQ = new THREE.Quaternion();
    this.bodyTarget = new THREE.Quaternion();
    this.action = null;
    this.fading = [];
    this.overlay = null; // secondary layered action (e.g. arm-only while moving)
    this.prevYaw = 0;
    this.yawRate = 0;
    this.feet = {
      L: { plant: new THREE.Vector3(), step: null, init: false },
      R: { plant: new THREE.Vector3(), step: null, init: false },
    };
    this.deathT = -1;
    this.tumble = new THREE.Quaternion();
    this.tumbleVel = new THREE.Vector3();
    this.colliders = [
      { a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0.15 },
      { a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0.1 },
      { a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0.1 },
    ];
    this.extra = { glow: 0 };
    this.ctx = { aimQ: new THREE.Quaternion(), legYaw: 0, ikTarget: null };
    this.additive = new Pose(); this.additive.v.fill(0); // kits write per-frame additive offsets here
    this.footPhase = { L: 0, R: 0 };
    this.aimRig = new THREE.Vector3(0, 0, 1);
    this.hoverClip = null;
  }

  // ---------------- actions ----------------
  play(clip, opts = {}) {
    if (this.action) { this.action.ending = true; this.action.endT = 0; this.fading.push(this.action); }
    this.action = new Action(clip, opts);
    return this.action;
  }
  stop(fade) {
    if (this.action) {
      this.action.ending = true; this.action.endT = 0;
      if (fade !== undefined) this.action.fadeOut = fade;
      this.fading.push(this.action); this.action = null;
    }
  }
  playOverlay(clip, opts = {}) {
    if (this.overlay) { this.overlay.ending = true; this.fading.push(this.overlay); }
    this.overlay = new Action(clip, opts);
    return this.overlay;
  }
  get busy() { return !!this.action && !this.action.ending; }

  hit(dirRig, amount) {
    // dirRig: direction the hit travels, in rig space
    const k = clamp(amount, 0, 1.5);
    this.flinchP.v += dirRig.z * 160 * k;
    this.flinchR.v += -dirRig.x * 120 * k;
    this.flinchY.v += (Math.random() - 0.5) * 140 * k;
  }

  // ---------------- main update ----------------
  /**
   * s: { mode, vel(world), yaw, aimDir(world), dt, grounded, landed, jumped, boost, flyStyle,
   *      deadT, deadDir, maxSpeed, combat(0..1) }
   */
  update(dt, s) {
    this.time += dt;
    const st = this.style, rig = this.rig, base = this.base;
    base.reset();
    // world -> container local velocity
    const cy = Math.cos(-s.yaw), sy = Math.sin(-s.yaw);
    const lx = s.vel.x * cy + s.vel.z * sy;
    const lz = -s.vel.x * sy + s.vel.z * cy;
    const ly = s.vel.y;
    // acceleration (local)
    const ax = (lx - this.prevVel.x) / Math.max(dt, 1e-3), az = (lz - this.prevVel.z) / Math.max(dt, 1e-3);
    const ay = (ly - this.prevVel.y) / Math.max(dt, 1e-3);
    this.prevVel.set(lx, ly, lz);
    this.yawRate = damp(this.yawRate, wrap(s.yaw - this.prevYaw) / Math.max(dt, 1e-3), 8, dt);
    this.prevYaw = s.yaw;
    const hspeed = Math.hypot(lx, lz);
    const mode = s.mode;
    const ground = mode === 'ground';
    const fly = mode === 'fly';
    const air = mode === 'air';

    this.airBlend = damp(this.airBlend, air ? 1 : 0, air ? 14 : 18, dt);
    this.flyBlend = damp(this.flyBlend, fly ? 1 : 0, 6, dt);
    const groundW = clamp01(1 - this.airBlend - this.flyBlend);

    // --- ground locomotion --- (a tumbling hero skids: legs hold the stance instead of running)
    if (groundW > 0.001 || ground) {
      if (mode === 'tumble') this.groundLoco(dt, s, 0, 0, 0, 0, 0);
      else this.groundLoco(dt, s, lx, lz, hspeed, ax, az);
    }
    // air (jump/fall) pose
    if (this.airBlend > 0.001) {
      this.tmp.reset();
      this.airPose(this.tmp, ly, s);
      base.lerp(this.tmp, this.airBlend);
    }
    if (this.flyBlend > 0.001) {
      this.tmp.reset();
      this.flyPose(this.tmp, dt, s, lx, ly, lz, ax, ay, az);
      base.lerp(this.tmp, this.flyBlend);
    }
    // landing compression
    if (s.landed) this.land.v -= clamp(s.landed, 0, 30) * 0.055;
    this.land.update(dt, 0);
    const comp = Math.min(0, this.land.x);
    base.v[CH.rootY] += comp * 0.45;
    base.v[CH.spinePitch] += -comp * 30;
    base.v[CH.headPitch] += comp * 10;
    base.v[CH.LclavLift] += comp * 25; base.v[CH.RclavLift] += comp * 25;

    // breathing & micro motion
    const br = Math.sin(this.time * TAU * 0.27);
    base.v[CH.spinePitch] += br * 1.2 * (1 - this.moveBlend * 0.7);
    base.v[CH.LclavLift] += br * 1.4; base.v[CH.RclavLift] += br * 1.4;

    // --- aim / look ---
    this.computeAim(s);
    const aimYaw = Math.atan2(this.aimRig.x, this.aimRig.z);
    const aimPitch = Math.asin(clamp(this.aimRig.y, -1, 1));
    this.combat = damp(this.combat || 0, s.combat || 0, 4, dt);
    const lookOn = s.mode === 'dead' || s.mode === 'tumble' ? 0 : 1;
    this.lookYaw.update(dt, clamp(aimYaw, -1.25, 1.25) * lookOn);
    this.lookPitch.update(dt, clamp(aimPitch, -1.2, 1.5) * lookOn);
    const lyaw = this.lookYaw.x / DEG, lpit = this.lookPitch.x / DEG;
    const fb = this.flyBlend;
    base.v[CH.spinePitch] += -lpit * lerp(0.32, 0.12, fb);
    base.v[CH.spineYaw] += lyaw * 0.35;
    base.v[CH.neckPitch] += -lpit * lerp(0.3, 0.45, fb); base.v[CH.neckYaw] += lyaw * 0.3;
    base.v[CH.headPitch] += -lpit * lerp(0.35, 0.45, fb); base.v[CH.headYaw] += lyaw * 0.35;

    // --- actions ---
    const out = this.out;
    out.copy(base);
    this.runActions(dt, base, out);

    // --- kit additive offsets (recoil etc.) ---
    { const av = this.additive.v, ov = out.v; for (let i = 0; i < NCH; i++) { if (av[i] !== 0) { ov[i] += av[i]; av[i] = 0; } } }
    // --- additive flinch ---
    this.flinchP.update(dt, 0); this.flinchY.update(dt, 0); this.flinchR.update(dt, 0);
    out.v[CH.spinePitch] += this.flinchP.x * 0.6; out.v[CH.headPitch] += this.flinchP.x * 0.5;
    out.v[CH.spineRoll] += this.flinchR.x * 0.5; out.v[CH.headRoll] += this.flinchR.x * 0.4;
    out.v[CH.spineYaw] += this.flinchY.x * 0.4; out.v[CH.headYaw] += this.flinchY.x * 0.3;
    out.v[CH.LclavLift] += Math.abs(this.flinchP.x) * 0.4; out.v[CH.RclavLift] += Math.abs(this.flinchP.x) * 0.4;

    // --- death / tumble --- (blended in and out so the limbs never switch pose in one frame)
    this.deadW = mode === 'dead' ? damp(this.deadW || 0, 1, 18, dt) : 0;
    if (this.deadW > 0.001) this.deadPose(out, s, this.deadW);
    if (mode === 'tumble') this.lastSettle = s.tumbleSettle || 0;
    this.tumbleW = damp(this.tumbleW || 0, mode === 'tumble' ? 1 : 0, mode === 'tumble' ? 30 : 14, dt);
    if (mode === 'dead') this.tumbleW = 0;
    if (this.tumbleW > 0.001) this.tumblePose(out, dt, s, this.tumbleW);

    // --- apply ---
    this.ctx.legYaw = this.legYaw;
    rig.apply(out, this.ctx);
    if (mode === 'ground' && s.floorY != null) rig.floorFeet(out.v, this.ctx, s.floorY);
    // secondary chains
    if (this.chains.chains.length) {
      this.updateColliders();
      const wind = _w.set(0, 0, 0);
      const flutter = clamp(s.vel.length() * 0.45, 0, 16) + (s.flutter || 0);
      this.chains.update(dt, { wind, flutter, colliders: this.colliders, torso: this.torso });
    }
  }

  // ---------------- locomotion ----------------
  groundLoco(dt, s, lx, lz, speed, ax, az) {
    const st = this.style, rig = this.rig, b = this.base;
    const moving = speed > 0.35;
    this.moveBlend = damp(this.moveBlend, smoothstep(0.25, 1.6, speed), 9, dt);
    this.runBlend = damp(this.runBlend, smoothstep(2.0, 6.5, speed), 5, dt);
    const mb = this.moveBlend, rb = this.runBlend;
    if (moving) this.moveDir.set(lx / speed, lz / speed);
    const dx = this.moveDir.x, dz = this.moveDir.y;
    // lower body orientation toward movement for strafes
    let targetLegYaw = 0;
    if (mb > 0.2) {
      const fwd = dz >= -0.2;
      targetLegYaw = fwd ? Math.atan2(dx, Math.max(dz, 0.2)) : Math.atan2(-dx, -dz);
      targetLegYaw = clamp(targetLegYaw * 0.55, -0.7, 0.7);
    }
    this.legYaw = damp(this.legYaw, targetLegYaw, 8, dt);

    // cadence (cycles per second) and duty factor beta (share of the cycle a foot is planted). The
    // planted foot sweeps speed * beta / f of ground; where the legs can't reach that far (sprints),
    // contact gets shorter, and then the cadence rises, so feet never skate to make up the difference
    let f = clamp(st.cadenceBase + speed * st.cadencePerSpeed, 0.6, st.cadenceMax) * (s.cadenceScale || 1);
    let beta = lerp(0.62, 0.34, rb);
    const sdL = rig.side.L, legLen = (sdL.thighLen + sdL.shinLen) * 0.985;
    const drop = sdL.thigh.pos.y - (st.crouchRun * rb + 0.012 + 0.02 * mb) - st.bob * rb * 0.5 - sdL.ankleHeight;
    const maxStance = 2 * Math.sqrt(Math.max(0.01, legLen * legLen - drop * drop));
    if (speed * beta > maxStance * f) {
      beta = Math.max(0.2, maxStance * f / speed);
      if (speed * beta > maxStance * f) f = Math.min(speed * beta / maxStance, st.cadenceMax * 1.4);
      beta = Math.min(beta, Math.max(0.2, maxStance * f / speed));
    }
    if (mb > 0.01) this.phase += f * dt;
    this.gaitBeta = beta;
    const stance = Math.min(speed * beta / f, maxStance);
    const H = lerp(0.07, st.stepHeight, rb);
    const hipH = rig.hipsHeight;
    // feet
    const legOff = Math.cos(this.legYaw), legOffS = Math.sin(this.legYaw);
    for (const side of ['L', 'R']) {
      const sd = rig.side[side];
      const ph = frac(this.phase + (side === 'L' ? 0 : 0.5));
      let along, lift, pitch;
      if (ph < beta) {
        const u = ph / beta;
        along = stance * (0.5 - u);
        lift = 0;
        pitch = lerp(-12, 32, smoothstep(0.45, 1, u)) * rb + lerp(-6, 14, u) * (1 - rb);
      } else {
        const u = (ph - beta) / (1 - beta);
        const e = ease.inout(u);
        along = -stance * 0.5 + stance * e;
        // heel kick for running: extra back/up early in the swing
        along -= Math.sin(Math.PI * Math.min(1, u * 1.6)) * 0.18 * rb * stance * 0.5;
        lift = H * Math.pow(Math.sin(Math.PI * u), 0.85) * (0.6 + 0.4 * rb);
        pitch = lerp(40, -18, smoothstep(0.1, 0.95, u)) * (0.4 + 0.6 * rb);
      }
      const sx = sd.sx;
      // stance base point in model space: the hips turn toward the movement (legYaw), so the feet's
      // spacing turns with them, but their travel along the ground stays exactly against the motion
      const bxw = sx * st.stanceW * (1 - rb * 0.4);
      const mx = dx * along, mz = dz * along;
      const rx = bxw * legOff + mx, rz = -bxw * legOffS + mz;
      this._gait = this._gait || { L: new THREE.Vector3(), R: new THREE.Vector3(), P: { L: 0, R: 0 } };
      this._gait[side].set(rx, sd.ankleHeight + lift, rz);
      this._gait.P[side] = pitch;
      // heel strike event
      const prevPh = this.footPhase[side];
      if (mb > 0.35 && ph < prevPh && this.onFootstep) this.onFootstep(side, 0.5 + rb * 0.5);
      this.footPhase[side] = ph;
    }
    // idle stance with planted feet (only while standing; re-anchored on landing). A lunge slides
    // the body faster than the gait shows, so the feet travel with it instead of staying planted.
    this.updatePlants(dt, mb, s.mode === 'ground' && !s.slide);
    for (const side of ['L', 'R']) {
      const g = this._gait[side];
      const ft = this.feet[side];
      const idleTarget = this.plantModel(side, _v);
      const tgt = _u.copy(idleTarget).lerp(g, mb);
      b.set(side + 'legIkW', 1);
      b.set(side + 'legIkX', tgt.x); b.set(side + 'legIkY', tgt.y); b.set(side + 'legIkZ', tgt.z);
      b.set(side + 'footGround', 1);
      b.set(side + 'footPitch', this._gait.P[side] * mb + (ft.step ? -10 * Math.sin(Math.PI * ft.step.u) : 0));
      b.set(side + 'footYaw', (this.legYaw / DEG) * rig.side[side].sx + 6);
      b.set(side + 'toe', mb * clamp(this._gait.P[side], 0, 40) * -0.6);
    }
    // hips
    const ph = this.phase;
    const bob = st.bob * rb + 0.015 * (1 - rb);
    const crouch = st.crouchRun * rb + 0.012 + 0.02 * mb; // knees soften when moving: longer reach for the planted foot
    b.v[CH.rootY] += (-bob * (0.5 + 0.5 * Math.cos(2 * TAU * (ph - beta * 0.5))) - crouch) * mb - 0.022 * (1 - mb);
    const yawA = st.yawAmp * (0.4 + 0.6 * rb) * Math.abs(dz);
    b.v[CH.rootYaw] += (-yawA * Math.cos(TAU * ph) * Math.sign(dz || 1)) * mb + (this.legYaw / DEG);
    b.v[CH.rootRoll] += st.rollAmp * Math.cos(TAU * (ph - beta * 0.5)) * mb;
    b.v[CH.rootX] += st.swayAmp * Math.cos(TAU * (ph - beta * 0.5)) * mb * (1 - rb * 0.7);
    // idle weight shift
    const idleShift = fbm1(this.time * 0.25, 2);
    b.v[CH.rootX] += idleShift * 0.025 * (1 - mb);
    b.v[CH.rootRoll] += -idleShift * 2.5 * (1 - mb);
    // torso
    this.accelLocal.set(ax, 0, az);
    const la = s.noLean ? 0 : 1;
    const leanF = this.leanF.update(Math.min(dt, 0.05), clamp(az * 0.6 * la, -8, 9));
    const leanS = this.leanS.update(Math.min(dt, 0.05), clamp(-ax * 0.6 * la, -8, 8));
    b.v[CH.spinePitch] += (st.leanRun * rb + 3 * mb) * Math.max(0.2, dz) + leanF - st.chestUp * (1 - mb * 0.6);
    // lean into turns; clamped so a sharp aim flick while running can't fold the torso sideways
    b.v[CH.spineRoll] += leanS + clamp(this.yawRate * speed * -0.6, -12, 12) * la;
    b.v[CH.spineYaw] += yawA * 1.35 * Math.cos(TAU * ph) * Math.sign(dz || 1) * mb - (this.legYaw / DEG);
    b.v[CH.headYaw] += -yawA * 0.5 * Math.cos(TAU * ph) * mb;
    b.v[CH.headPitch] += -(st.leanRun * rb * 0.5) * mb;
    // arms
    const swing = st.armSwing * (0.45 + 0.55 * rb);
    for (const side of ['L', 'R']) {
      const phs = frac(ph + (side === 'L' ? 0 : 0.5));
      const sw = -Math.cos(TAU * phs) * swing * Math.sign(dz || 1) * (0.35 + 0.65 * Math.abs(dz));
      const ix = this.idleArm(side);
      const ax_ = lerp(ix.x, 0.18 + Math.abs(dx) * 0.2, mb);
      const ay_ = lerp(ix.y, -0.95, mb);
      const az_ = lerp(ix.z, sw + 0.12 * rb, mb);
      b.set(side + 'armX', ax_); b.set(side + 'armY', ay_); b.set(side + 'armZ', az_);
      b.set(side + 'elbow', lerp(ix.elbow, lerp(25, st.elbowRun, rb) + Math.max(0, sw) * 25 * rb, mb));
      b.set(side + 'fist', lerp(ix.fist, lerp(0.45, st.fistRun, rb), mb));
      b.set(side + 'armTwist', lerp(ix.twist, -10, mb));
      b.set(side + 'foreTwist', lerp(ix.fore || 0, 0, mb));
      b.set(side + 'handFlex', lerp(ix.flex || 0, 8 * rb, mb));
      b.set(side + 'spread', ix.spread || 0);
    }
  }

  idleArm(side) {
    const k = this.style.idle, t = this.time;
    const n = fbm1(t * 0.3 + (side === 'L' ? 0 : 7), 2);
    const combat = this.combat || 0;
    if (k === 'fighter') {
      // relaxed heroic stance, fists loosely closed; raises guard when in combat
      return {
        x: lerp(0.2, 0.32, combat) + n * 0.02, y: lerp(-0.97, -0.5, combat), z: lerp(0.06, 0.42, combat),
        elbow: lerp(18, 110, combat), fist: lerp(0.55, 1, combat), twist: lerp(0, -25, combat), flex: 0,
      };
    }
    if (k === 'proud') {
      return { x: 0.3 + n * 0.02, y: -0.95, z: 0.02, elbow: 22 + n * 4, fist: 0.75, twist: 8, flex: -6 };
    }
    // graceful (Eve): open hands with a little spread, energy ready
    return { x: 0.22 + n * 0.03, y: -0.95, z: 0.1 + combat * 0.12, elbow: 26 + combat * 20, fist: 0.12, twist: -6, flex: -12 - combat * 18, spread: 0.6, fore: -20 };
  }

  // feet planting for idle / turning in place
  plantModel(side, out) {
    const ft = this.feet[side];
    if (ft.step) {
      const s = ft.step;
      out.copy(s.from).lerp(s.to, ease.inout(s.u));
      out.y += Math.sin(Math.PI * s.u) * 0.09;
    } else out.copy(ft.plant);
    // world -> model
    this.rig.space.updateWorldMatrix(true, false);
    _m.copy(this.rig.space.matrixWorld).invert();
    out.applyMatrix4(_m);
    return out;
  }
  updatePlants(dt, mb, grounded = true) {
    const rig = this.rig, st = this.style;
    rig.space.updateWorldMatrix(true, false);
    const M = rig.space.matrixWorld;
    let stepping = !!(this.feet.L.step || this.feet.R.step);
    for (const side of ['L', 'R']) {
      const ft = this.feet[side], sd = rig.side[side];
      // ideal idle stance position (model -> world)
      const split = (side === 'L' ? 1 : -1) * st.stanceSplit;
      const ideal = _w.set(sd.sx * (st.stanceW + 0.03), sd.ankleHeight, split).applyMatrix4(M);
      if (!grounded || !ft.init || mb > 0.5) {
        // while moving, plants follow the gait so stopping is seamless; airborne, they ride along
        // with the body and get re-planted on landing (ground loco still blends out after takeoff)
        const g = this._gait[side];
        ft.plant.copy(g).applyMatrix4(M);
        ft.plant.y = Math.min(ft.plant.y, M.elements[13] + sd.ankleHeight);
        if (!ft.init || !grounded) ft.plant.copy(ideal);
        ft.init = grounded; ft.step = null;
        continue;
      }
      // standing at a different height than the plant (dropped off a ledge): re-anchor, never reach up
      if (Math.abs(ft.plant.y - ideal.y) > 0.2) { ft.plant.copy(ideal); ft.step = null; continue; }
      if (ft.step) {
        ft.step.u += dt / ft.step.dur;
        if (ft.step.u >= 1) { ft.plant.copy(ft.step.to); ft.step = null; this.onFootstep && this.onFootstep(side, 0.4); }
        else ft.step.to.lerp(ideal, 0.25);
        continue;
      }
      const err = Math.hypot(ft.plant.x - ideal.x, ft.plant.z - ideal.z);
      const other = this.feet[side === 'L' ? 'R' : 'L'];
      const otherBusy = other.step && other.step.u < 0.5;
      if (err > 0.16 && (!stepping || (!otherBusy && err > 0.4))) {
        ft.step = { from: ft.plant.clone(), to: ideal.clone(), u: 0, dur: clamp(0.24 - err * 0.12, 0.11, 0.22) };
        stepping = true;
      }
    }
  }

  airPose(p, vy, s) {
    const rising = clamp01(vy / 6), falling = clamp01(-vy / 10);
    const t = this.time;
    p.assign({
      spinePitch: lerp(4, 10, rising) - falling * 6,
      Barm: [0.45 + falling * 0.2, -0.55 + rising * 0.15, 0.25 - falling * 0.1],
      Belbow: 40 + falling * 10, Bfist: 0.6,
      Lleg: [0.08, -0.82, 0.55 - falling * 0.35], Lknee: lerp(70, 25, falling),
      Rleg: [0.06, -0.95, 0.15 - falling * 0.1], Rknee: lerp(95, 35, falling),
      BfootPitch: 25, BlegIkW: 0, BfootGround: 0,
      rootY: -0.05,
      headPitch: falling * 8,
    });
    p.v[CH.LarmZ] += Math.sin(t * 9) * 0.05 * falling;
    p.v[CH.RarmZ] -= Math.sin(t * 9) * 0.05 * falling;
  }

  // ---------------- flight ----------------
  flyPose(p, dt, s, lx, ly, lz, ax = 0, ay = 0, az = 0) {
    const st = this.style, t = this.time;
    const speed = Math.hypot(lx, ly, lz);
    // braking: decelerating against the motion pulls the body upright and a little back to stop
    const decel = -(ax * lx + ay * ly + az * lz) / Math.max(speed, 1e-3);
    this.brake = damp(this.brake || 0, clamp01((decel - 6) / 20) * smoothstep(2, 6, speed), 8, dt);
    // Sinking only tips the body into a head-first dive when there's forward motion to dive along
    // or the hero aims down; a plain descent stays feet-first. Close to the ground on the way
    // down the body flares upright so every landing happens on the feet.
    const dn = Math.max(0, -ly);
    const aimDown = clamp01(-s.aimDir.y * 1.4 - 0.2);
    const lyT = ly >= 0 ? ly : -Math.min(dn, Math.hypot(lx, lz) * 1.5 + dn * aimDown);
    const gd = s.groundDist ?? 99, tti = gd / Math.max(dn, 0.5);
    const flare = dn > 0.5 ? Math.max(1 - smoothstep(0.15, 0.6, tti), 1 - smoothstep(0.8, 2.5, gd)) * clamp01(dn / 1.5) : 0;
    this.flare = flare;
    const tSpeed = Math.hypot(lx, lyT, lz) * (1 - flare) * (1 - 0.7 * this.brake);
    const cruise = smoothstep(3, 14, tSpeed);
    const boost = clamp01(s.boost || 0);
    const vFwd = lz / Math.max(speed, 1e-3), vUp = ly / Math.max(speed, 1e-3);
    const ascend = clamp01(vUp) * smoothstep(2, 8, speed);
    const bobY = Math.sin(t * TAU * 0.45) * 0.045 * (1 - cruise);
    // hover
    const hov = this._fp1 ||= new Pose(); hov.reset();
    if (st.flyPose === 'superman') {
      hov.assign({
        rootY: bobY, spinePitch: 6, headPitch: 6,
        Larm: [0.22, -0.95, 0.06], Rarm: [0.22, -0.95, 0.04], Belbow: 22, Bfist: 0.85, BarmTwist: 4,
        Lleg: [0.04, -0.98, 0.04], Lknee: 10, Rleg: [0.02, -0.96, 0.16], Rknee: 42,
        BfootPitch: 40, BlegIkW: 0, BfootGround: 0, Btoe: 10,
      });
    } else if (st.flyPose === 'omni') {
      hov.assign({
        rootY: bobY, spinePitch: -6, headPitch: -4,
        Barm: [0.3, -0.94, -0.04], Belbow: 16, Bfist: 0.9, BarmTwist: 8,
        Lleg: [0.08, -0.98, 0.02], Lknee: 6, Rleg: [0.06, -0.97, 0.08], Rknee: 18,
        BfootPitch: 30, BlegIkW: 0, BfootGround: 0,
      });
    } else {
      hov.assign({
        rootY: bobY, spinePitch: 2, headPitch: 4,
        Larm: [0.42, -0.85, 0.12], Rarm: [0.4, -0.86, 0.08], Belbow: 28, Bfist: 0.1, Bspread: 0.8, BhandFlex: -25, BforeTwist: -30,
        Lleg: [0.02, -0.98, 0.02], Lknee: 8, Rleg: [0.0, -0.95, 0.2], Rknee: 55,
        BfootPitch: 45, BlegIkW: 0, BfootGround: 0,
      });
    }
    // cruise (body tilted forward by visual root; pose is in body space)
    const cr = this._fp2 ||= new Pose(); cr.reset();
    if (st.flyPose === 'superman') {
      cr.assign({
        spinePitch: -4,
        Rarm: [0.08, 0.96, 0.25], Relbow: 6, Rfist: 1, RarmTwist: 0, RhandFlex: 0,
        Larm: [0.12, -0.98, -0.12], Lelbow: 14, Lfist: 0.9,
        Lleg: [0.03, -0.99, -0.06], Lknee: 6, Rleg: [0.01, -0.98, -0.02], Rknee: 26,
        BfootPitch: 55, BlegIkW: 0, BfootGround: 0,
      });
    } else if (st.flyPose === 'omni') {
      cr.assign({
        spinePitch: -8,
        Barm: [0.18, -0.96, -0.18], Belbow: 10, Bfist: 1, BarmTwist: 10,
        Lleg: [0.04, -0.99, -0.05], Lknee: 4, Rleg: [0.03, -0.99, -0.02], Rknee: 10,
        BfootPitch: 50, BlegIkW: 0, BfootGround: 0,
      });
    } else {
      cr.assign({
        spinePitch: -6,
        Larm: [0.5, -0.8, -0.2], Rarm: [0.48, -0.82, -0.18], Belbow: 20, Bfist: 0.05, Bspread: 0.7, BhandFlex: -10,
        Lleg: [0.03, -0.99, -0.04], Lknee: 10, Rleg: [0.0, -0.97, 0.05], Rknee: 50,
        BfootPitch: 55, BlegIkW: 0, BfootGround: 0,
      });
    }
    // streamlined boost
    const bo = this._fp3 ||= new Pose(); bo.reset();
    bo.assign({
      spinePitch: -2,
      Barm: [0.06, -0.99, -0.12], Belbow: 4, Bfist: 1,
      Bleg: [0.01, -1, -0.03], Bknee: 3, BfootPitch: 60, BlegIkW: 0, BfootGround: 0,
    });
    if (st.flyPose === 'superman') bo.assign({ Rarm: [0.02, 0.99, 0.12], Relbow: 0, Larm: [0.02, 0.99, 0.1], Lelbow: 0 });
    // ascend: fist up (superman), body upright
    const as = this._fp4 ||= new Pose(); as.reset();
    as.assign({
      spinePitch: -4,
      Rarm: [0.1, 0.97, 0.12], Relbow: 4, Rfist: 1, Larm: [0.2, -0.96, -0.05], Lelbow: 12, Lfist: 0.9,
      Bleg: [0.02, -1, -0.04], Lknee: 4, Rknee: 14, BfootPitch: 55, BlegIkW: 0, BfootGround: 0,
    });
    if (st.flyPose === 'eve') as.assign({ Rarm: [0.35, -0.85, -0.15], Larm: [0.35, -0.85, -0.15], Rfist: 0, Lfist: 0, Belbow: 20 });
    if (st.flyPose === 'omni') as.assign({ Rarm: [0.25, -0.95, -0.1], Relbow: 10 });

    p.copy(hov);
    p.lerp(cr, cruise * (1 - ascend));
    p.lerp(as, ascend);
    p.lerp(bo, boost);
    // leg flutter & drift
    const fl = Math.sin(t * 2.1) * 4 * (1 - boost);
    p.v[CH.Lknee] += fl; p.v[CH.Rknee] -= fl;
    p.v[CH.LarmX] += Math.sin(t * 1.3) * 0.02; p.v[CH.RarmX] += Math.sin(t * 1.1 + 1) * 0.02;
    // lateral lean of legs when strafing
    p.v[CH.LlegX] += clamp(-lx * 0.01, -0.15, 0.15);
    p.v[CH.RlegX] += clamp(lx * 0.01, -0.15, 0.15);

    // body orientation (visual root) in container-yaw frame; only flight drives it, so the
    // fly pose blending out after a landing can't tip a running hero into the superman pose
    if (s.mode !== 'fly') return;
    const k = smoothstep(1.5, 11, tSpeed) * 0.96;
    const vz = lz < 0 ? lz * 0.3 : lz;
    _v.set(lx, lyT, vz);
    if (_v.lengthSq() > 1e-6) _v.normalize(); else _v.set(0, 1, 0);
    _w.copy(UP).lerp(_v, k).addScaledVector(_v, -0.3 * this.brake);
    if (_w.lengthSq() < 1e-6) _w.copy(UP);
    _w.normalize();
    // rotate about UP x dir; a straight-down dive pitches forward instead of picking an arbitrary roll
    _u.crossVectors(UP, _w);
    const sn = _u.length();
    if (sn < 1e-4) _u.set(1, 0, 0); else _u.divideScalar(sn);
    this.bodyTarget.setFromAxisAngle(_u, Math.atan2(sn, UP.dot(_w)));
    // banking from yaw rate
    const bankT = clamp(-this.yawRate * Math.min(speed, 30) * 0.035, -1.0, 1.0);
    this.bank.update(dt, bankT);
    _q2.setFromAxisAngle(FWD, this.bank.x * smoothstep(4, 15, speed));
    this.bodyTarget.multiply(_q2);
  }

  /** body tilt (relative to container yaw frame) for the hero to apply around the pelvis */
  bodyTilt(dt, mode) {
    if (mode !== 'fly') this.bodyTarget.identity();
    // standing on the ground the feet have to get under the body quickly; falling can take longer
    // (a flier about to touch down flips upright fast: a hard dive still lands feet-first), never
    // faster than 16 rad/s so no recovery snaps the whole body round in a frame
    let k = dampT(mode === 'fly' ? 5.5 + 16 * (this.flare || 0) : mode === 'ground' ? 16 : 10, dt);
    const ang = this.bodyQ.angleTo(this.bodyTarget);
    if (ang * k > 16 * dt) k = 16 * dt / ang;
    this.bodyQ.slerp(this.bodyTarget, k);
    return this.bodyQ;
  }

  computeAim(s) {
    // aim direction in rig space
    const rs = this.rig.space;
    rs.updateWorldMatrix(true, false);
    rs.matrixWorld.decompose(_v, _q, _u);
    this.aimRig.copy(s.aimDir).applyQuaternion(_q.invert()).normalize();
    this.ctx.aimQ.setFromUnitVectors(FWD, this.aimRig);
  }

  runActions(dt, base, out) {
    const tmp = this.tmp;
    const step = (a) => {
      a.t += dt * a.speed;
      const c = a.clip;
      // events
      while (a.ev < c.events.length && a.t >= c.events[a.ev].t) {
        const e = c.events[a.ev++];
        a.onEvent && a.onEvent(e.e, e, a);
      }
      if (!a.ending) {
        a.w = Math.min(1, a.w + dt / Math.max(1e-3, a.fadeIn));
        if (!c.loop && !a.hold && a.t >= c.duration) {
          a.ending = true; a.endT = 0;
          a.onEnd && a.onEnd(a);
        }
      } else {
        a.endT += dt;
        a.w = Math.max(0, a.w - dt / Math.max(1e-3, a.fadeOut));
      }
      return a.w > 0;
    };
    const blend = (a) => {
      tmp.copy(out);
      const t = a.clip.loop || a.hold ? (a.clip.loop ? a.t : Math.min(a.t, a.clip.duration)) : Math.min(a.t, a.clip.duration);
      a.clip.sample(t, base, tmp);
      out.lerp(tmp, ease.inout(a.w) * a.weight, a.clip.effMask);
    };
    this.fading = this.fading.filter((a) => { const alive = step(a); if (alive) blend(a); return alive; });
    if (this.action) {
      step(this.action);
      blend(this.action);
      if (this.action.ending) { this.fading.push(this.action); this.action = null; }
    }
    if (this.overlay) {
      step(this.overlay);
      blend(this.overlay);
      if (this.overlay.ending) { this.fading.push(this.overlay); this.overlay = null; }
    }
  }

  deadPose(out, s, w = 1) {
    const t = s.deadT;
    const u = clamp01(t / 0.6);
    const d = this._dp ||= new Pose();
    d.copy(out);
    d.assign({
      Barm: [0.75, -0.5, 0.15], Belbow: 35, Bfist: 0.2, Bspread: 0.3,
      Lleg: [0.12, -0.98, 0.05], Lknee: 25, Rleg: [0.05, -0.95, 0.2], Rknee: 40,
      BlegIkW: 0, BfootGround: 0, BfootPitch: 30,
      headPitch: -15 + u * 10, headYaw: 25, spinePitch: -8,
      LikW: 0, RikW: 0,
    });
    d.v[CH.rootY] = 0;
    out.lerp(d, w);
  }

  tumblePose(out, dt, s, w = 1) {
    const air = this._tp ||= new Pose();
    const res = this._tr ||= new Pose();
    res.copy(out);
    air.copy(out);
    air.assign({
      Barm: [0.7, 0.2, 0.3], Belbow: 50, Bfist: 0.3,
      Lleg: [0.15, -0.6, 0.6], Lknee: 80, Rleg: [0.1, -0.9, 0.2], Rknee: 50,
      BlegIkW: 0, BfootGround: 0, spinePitch: 20, headPitch: 15, LikW: 0, RikW: 0,
    });
    // coming down (tumbleSettle -> 1) the hero rights itself into a braced crouch: the legs keep
    // the ground stance, and every getup clip starts from this same crouch
    const k = clamp01(s.mode === 'tumble' ? s.tumbleSettle || 0 : this.lastSettle || 0);
    if (k < 0.001) res.copy(air);
    else {
      const sk = this._sk ||= new Pose();
      sk.copy(out);
      sk.assign({ rootY: -0.42, spinePitch: 38, headPitch: -18, Barm: [0.5, -0.6, 0.35], Belbow: 45, Bfist: 0.5, LikW: 0, RikW: 0 });
      res.copy(air);
      res.lerp(sk, k);
    }
    out.lerp(res, w);
  }

  updateColliders() {
    const r = this.rig;
    const c = this.colliders;
    r.rigPos(r.hips.bone, _v); toWorld(r, _v, c[0].a);
    r.rigPos(r.spine[r.spine.length - 1].bone, _v); toWorld(r, _v, c[0].b);
    c[0].r = 0.13 * (r.hipsHeight / 1.0);
    // torso frame for cape constraints: up along the spine, forward = facing made orthogonal to it
    const T = (this.torso ||= { up: new THREE.Vector3(), fwd: new THREE.Vector3() });
    T.up.subVectors(c[0].b, c[0].a).normalize();
    const m = r.space.matrixWorld.elements;
    T.fwd.set(m[8], m[9], m[10]).normalize();
    T.fwd.addScaledVector(T.up, -T.fwd.dot(T.up));
    if (T.fwd.lengthSq() < 1e-6) T.fwd.set(m[4], m[5], m[6]).negate();
    T.fwd.normalize();
    for (let i = 0; i < 2; i++) {
      const sd = r.side[i ? 'R' : 'L'];
      r.rigPos(sd.thigh.bone, _v); toWorld(r, _v, c[i + 1].a);
      r.rigPos(sd.shin.bone, _v); toWorld(r, _v, c[i + 1].b);
      c[i + 1].r = 0.085 * (r.hipsHeight / 1.0);
    }
  }
}

function toWorld(rig, v, out) { return out.copy(v).applyMatrix4(rig.space.matrixWorld); }
function wrap(a) { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; }
