import { clamp, damp, dampAngle, fract, lerp, smoothstep } from '@/core/math';
import type { Rng } from '@/core/rng';
import type { Locomotion } from '../api';
import { ARM, Bone, LEG, SEG, type Proportions } from '../rig';
import { solveLeg } from './ik';
import type { Pose } from './pose';

/** Locomotion events, as a bit mask returned by `evaluate`. */
export const LocoEvent = { FOOT_L: 1, FOOT_R: 2, LAND: 4 } as const;

const TAU = Math.PI * 2;
const LEG_REACH = (SEG.thigh + SEG.shin) * 0.992;

/** Idle variants: [duration (s), weight in the random pick]. */
const IDLES: ReadonlyArray<readonly [number, number]> = [
  [0, 0], // none
  [3.2, 3], // look around
  [3.6, 3], // shift weight
  [2.8, 2], // check the watch
  [2.6, 1], // stretch
  [2.2, 1], // scratch the head
  [3.4, 2], // hands on hips
  [2.4, 1], // tap a foot
];

/**
 * Procedural walking, running, crouching, strafing, jumping and idling. Feet are planted by IK
 * on a cycle whose stance length equals the distance the body travels, so they never slide; the
 * pelvis drops whenever a stride would overreach.
 */
export class Locomotor {
  phase = 0;
  move = 0;
  gait = 0;
  speed = 0;
  angle = 0;
  crouch = 0;
  air = 0;
  lean = 0;
  private airTime = 0;
  private minVy = 0;
  private landT = 9;
  private landK = 0;
  private wasGrounded = true;
  private turnPhase = 0;
  private turnAmt = 0;
  private time = 0;
  private idle = 0;
  private idleT = 0;
  private idleNext = 4;
  private idleSide = 1;
  private readonly prevPh = new Float32Array(2);
  private readonly fx = new Float32Array(2);
  private readonly fy = new Float32Array(2);
  private readonly fz = new Float32Array(2);
  private readonly fp = new Float32Array(2);

  constructor(private readonly rng: Rng) {
    this.time = rng.next() * 100;
    this.idleNext = 3 + rng.next() * 6;
  }

  /** Evaluate the locomotion pose into `pose` (reset first). Returns LocoEvent bits. */
  evaluate(dt: number, loco: Locomotion, pose: Pose, p: Proportions, joints: Float32Array, idleOk: boolean): number {
    let events = 0;
    this.time += dt;
    const v = Math.abs(loco.speed);
    this.speed = damp(this.speed, v, 12, dt);
    const s = this.speed;
    this.move = damp(this.move, s > 0.1 ? 1 : 0, s > 0.1 ? 9 : 5, dt);
    this.gait = damp(this.gait, smoothstep(1.9, 3.5, s), 6, dt);
    this.crouch = damp(this.crouch, clamp(loco.crouch, 0, 1), 9, dt);
    this.angle = dampAngle(this.angle, loco.moveAngle, 10, dt);
    this.lean = damp(this.lean, clamp(loco.turnRate * s * 0.05, -0.32, 0.32), 6, dt);
    // Air and landing.
    if (!loco.grounded) {
      this.airTime += dt;
      this.minVy = Math.min(this.minVy, loco.vy);
    } else if (!this.wasGrounded) {
      if (this.airTime > 0.12) {
        this.landK = clamp(-this.minVy / 9, 0.18, 1);
        this.landT = 0;
        events |= LocoEvent.LAND;
      }
      this.airTime = 0;
      this.minVy = 0;
    }
    this.wasGrounded = loco.grounded;
    this.air = damp(this.air, loco.grounded ? 0 : 1, loco.grounded ? 18 : 10, dt);
    this.landT += dt;

    // Cadence (steps per second) rises with speed; one cycle is two steps.
    const cadence = s < 2 ? 1.15 + 0.5 * s : 2.15 + 0.16 * (s - 2);
    const freq = cadence * 0.5;
    this.phase = fract(this.phase + dt * freq * (0.25 + 0.75 * this.move));
    const duty = lerp(lerp(0.64, 0.58, smoothstep(0.3, 1.8, s)), lerp(0.42, 0.32, smoothstep(3.5, 7.5, s)), this.gait);
    const half = (s * duty) / freq * 0.5;
    const lift = lerp(0.07 + 0.025 * Math.min(s, 2), 0.13 + 0.035 * Math.min(s, 8), this.gait) * this.move * (1 - 0.4 * this.crouch);
    const dx = -Math.sin(this.angle), dz = -Math.cos(this.angle);
    const backpedal = smoothstep(1.9, 2.6, Math.abs(this.angle));
    const strafe = this.move * (1 - backpedal) * clamp(this.angle, -0.9, 0.9);

    // Turning on the spot: little alternating steps.
    this.turnAmt = damp(this.turnAmt, smoothstep(0.5, 1.6, Math.abs(loco.turnRate)) * (1 - this.move), 8, dt);
    this.turnPhase = fract(this.turnPhase + dt * 1.8);

    // Idle variants.
    const idleW = (1 - this.move) * (1 - this.air) * (idleOk ? 1 : 0) * (1 - this.turnAmt);
    this.idleT += dt;
    if (this.idle === 0 && this.idleT > this.idleNext) {
      this.idle = this.pickIdle();
      this.idleT = 0;
      this.idleSide = this.rng.chance(0.5) ? 1 : -1;
    } else if (this.idle !== 0 && this.idleT > IDLES[this.idle]![0]) {
      this.idle = 0;
      this.idleT = 0;
      this.idleNext = 4 + this.rng.next() * 8;
    }
    const idleK = this.idle === 0 ? 0 : smoothstep(0, 0.45, this.idleT) * (1 - smoothstep(IDLES[this.idle]![0] - 0.5, IDLES[this.idle]![0], this.idleT)) * idleW;

    pose.reset();
    // ── pelvis ───────────────────────────────────────────────────────────
    const ph = this.phase;
    const walkBob = -0.02 * this.move * (1 - this.gait) * (0.5 + 0.5 * Math.cos(2 * TAU * ph));
    const runBob = -0.038 * this.move * this.gait * (0.5 + 0.5 * Math.cos(2 * TAU * (ph - duty * 0.5)));
    const landEnv = this.landT < 0.08 ? this.landT / 0.08 : 1 - smoothstep(0.08, 0.42, this.landT);
    const breath = Math.sin(this.time * TAU * 0.24);
    const sway = 0.012 * Math.sin(this.time * 0.55) * idleW + (this.idle === 2 ? this.idleSide * 0.028 * idleK : 0);
    let hipsY = -0.3 * this.crouch + walkBob + runBob - 0.15 * this.landK * landEnv + 0.004 * breath * idleW;
    const hipsYaw = -0.085 * this.move * (1 - 0.35 * this.gait) * Math.cos(TAU * ph) * (1 - backpedal * 0.5) + strafe * 0.42;
    const hipsRoll = 0.035 * this.move * Math.sin(2 * TAU * ph) * (1 - this.gait * 0.5) - sway * 1.4;
    const hipsPitch = -0.035 * this.move - 0.06 * this.gait * this.move - 0.16 * this.crouch;
    pose.hips[0] = sway;
    // ── feet targets ─────────────────────────────────────────────────────
    const air = this.air;
    const vy = loco.vy;
    let lowest = Infinity;
    const { fx, fy, fz, fp } = this;
    for (let i = 0; i < 2; i++) {
      const sx = i === 0 ? -1 : 1;
      const pi = fract(ph + (i === 0 ? 0 : 0.5));
      let along: number, up: number, pitch: number;
      if (pi < duty) {
        const u = pi / duty;
        along = lerp(half, -half, u);
        up = smoothstep(0.72, 1, u) * 0.035 * this.move;
        pitch = (u < 0.14 ? (1 - u / 0.14) * 0.2 : 0) * this.move - smoothstep(0.6, 1, u) * 0.42 * this.move;
      } else {
        const u = (pi - duty) / (1 - duty);
        const e = u * u * (3 - 2 * u);
        along = lerp(-half, half, e);
        up = lift * Math.sin(Math.PI * Math.min(1, u * (1 + 0.25 * this.gait))) ** 0.85;
        pitch = lerp(-0.45, 0.22, u) * this.move;
      }
      // Footstep at heel strike (the stance begins as the phase wraps).
      if (this.prevPh[i]! > 0.75 && pi < 0.25 && this.move > 0.35 && loco.grounded) events |= i === 0 ? LocoEvent.FOOT_L : LocoEvent.FOOT_R;
      this.prevPh[i] = pi;
      // Turning on the spot lifts the feet in turn.
      const tp = fract(this.turnPhase + (i === 0 ? 0 : 0.5));
      up += this.turnAmt * 0.04 * Math.max(0, Math.sin(tp * TAU));
      // Idle: tap a foot.
      if (this.idle === 7 && sx === this.idleSide) {
        pitch -= idleK * 0.3 * (0.5 + 0.5 * Math.sin(this.idleT * TAU * 2.2));
      }
      const stanceX = sx * (p.hipX * 0.93 + 0.045 * this.crouch) - sway * 0.2;
      let x = stanceX + dx * along;
      let z = dz * along + (this.crouch * (i === 0 ? -0.06 : 0.07));
      let y = SEG.ankleY + up;
      // Airborne: tuck on the way up, reach for the ground on the way down.
      if (air > 0.001) {
        const tuck = vy > 0 ? 0.24 : vy > -4 ? 0.14 : 0.04;
        const ax = sx * p.hipX;
        const az = i === 0 ? -0.1 : 0.12;
        const ay = SEG.ankleY + tuck + 0.12 * (1 - Math.min(1, Math.abs(vy) / 6));
        x = lerp(x, ax, air);
        z = lerp(z, az, air);
        y = lerp(y, ay, air);
        pitch = lerp(pitch, -0.35, air);
      }
      fx[i] = x;
      fy[i] = y;
      fz[i] = z;
      fp[i] = pitch;
      // Lowest pelvis height the leg allows (hip joint ≈ 0.055 below the hips bone).
      const hx = sx * p.hipX - x, hz = -z;
      const reachY = y + Math.sqrt(Math.max(0, LEG_REACH * LEG_REACH - hx * hx - hz * hz)) + 0.055 - SEG.hipY;
      lowest = Math.min(lowest, reachY);
    }
    if (air > 0.001) hipsY = lerp(hipsY, 0.02, air);
    pose.hips[1] = Math.min(hipsY, lowest);
    pose.set(Bone.hips, hipsPitch, hipsYaw, hipsRoll);
    // ── spine, chest, head ───────────────────────────────────────────────
    const lookAround = this.idle === 1 ? Math.sin(Math.min(1, this.idleT / 3.2) * TAU) * 0.65 * idleK : 0;
    const spinePitch = -(0.04 * this.move + 0.15 * this.gait * this.move) - this.crouch * 0.22 + 0.01 * breath * idleW;
    const chestPitch = -0.03 * this.gait * this.move - this.crouch * 0.12 + 0.014 * breath + (this.idle === 4 ? 0.18 * idleK : 0);
    pose.set(Bone.spine, spinePitch, -hipsYaw * 0.55, this.lean * 0.6 + hipsRoll * -0.5);
    pose.set(Bone.chest, chestPitch, -hipsYaw * 0.75 - strafe * 0.25, this.lean * 0.35);
    const level = -(hipsPitch + spinePitch + chestPitch);
    pose.set(Bone.neck, level * 0.35, lookAround * 0.35, -this.lean * 0.4);
    pose.set(Bone.head, level * 0.55 + 0.03 * Math.sin(this.time * 0.37) * idleW + (this.idle === 3 ? -0.45 * idleK : 0), lookAround * 0.55 - (hipsYaw * 0.3), -this.lean * 0.3 + 0.025 * Math.sin(this.time * 0.29) * idleW);
    // ── arms ─────────────────────────────────────────────────────────────
    const swing = lerp(0.24 + 0.1 * Math.min(1, s / 1.6), 0.72, this.gait) * this.move * (1 - 0.6 * backpedal);
    for (let i = 0; i < 2; i++) {
      const sx = i === 0 ? -1 : 1;
      const [clav, upper, fore, hand, fingers] = ARM[i]!;
      const sw = (i === 0 ? -1 : 1) * swing * Math.cos(TAU * ph) + 0.12 * this.gait * this.move;
      let fwd = sw + 0.06 + this.crouch * 0.35;
      let out = p.armOut + 0.06 * this.gait + 0.02 * breath * idleW;
      let elbow = lerp(0.16 + 0.14 * this.move, 1.45 + 0.18 * sw, this.gait) + this.crouch * 0.4;
      let twist = -sx * 0.12;
      let fing = 0.28 + 0.4 * this.gait;
      let handX = 0.04;
      // Air: arms up and out for balance.
      if (air > 0.001) {
        fwd = lerp(fwd, 0.35 + (vy < -4 ? 0.6 : 0), air);
        out = lerp(out, p.armOut + (vy < -4 ? 1.0 : 0.45), air);
        elbow = lerp(elbow, 0.55, air);
      }
      // Idle variants that use the arms.
      if (idleK > 0) {
        if (this.idle === 3 && i === 0) {
          fwd = lerp(fwd, 0.55, idleK);
          out = lerp(out, 0.1, idleK);
          elbow = lerp(elbow, 1.85, idleK);
          twist = lerp(twist, 1.2, idleK);
        } else if (this.idle === 4) {
          fwd = lerp(fwd, 2.7, idleK);
          out = lerp(out, 0.25, idleK);
          elbow = lerp(elbow, 0.35, idleK);
          fing = lerp(fing, 0.0, idleK);
        } else if (this.idle === 5 && sx === this.idleSide) {
          fwd = lerp(fwd, 1.4, idleK);
          out = lerp(out, 1.1, idleK);
          elbow = lerp(elbow, 2.2, idleK);
          handX = lerp(handX, 0.3 * Math.sin(this.idleT * 14), idleK);
        } else if (this.idle === 6) {
          fwd = lerp(fwd, -0.15, idleK);
          out = lerp(out, 0.55, idleK);
          elbow = lerp(elbow, 1.6, idleK);
          twist = lerp(twist, -sx * 0.9, idleK);
        }
      }
      pose.set(clav, 0, 0, sx * (0.02 * breath * idleW + (this.idle === 4 ? 0.12 * idleK : 0)));
      pose.set(upper, fwd, twist, sx * out);
      pose.set(fore, elbow, 0, 0);
      pose.set(hand, handX, 0, 0);
      pose.set(fingers, fing, 0, 0);
    }
    // ── legs (IK) ────────────────────────────────────────────────────────
    for (let i = 0; i < 2; i++) {
      solveLeg(pose, joints, i as 0 | 1, fx[i]!, fy[i]!, fz[i]!, fp[i]!);
      const toe = LEG[i]![3];
      pose.set(toe, Math.max(0, -fp[i]!) * 0.9, 0, 0);
    }
    return events;
  }

  private pickIdle(): number {
    let total = 0;
    for (const [, w] of IDLES) total += w;
    let r = this.rng.next() * total;
    for (let i = 0; i < IDLES.length; i++) {
      r -= IDLES[i]![1];
      if (r <= 0) return i;
    }
    return 1;
  }
}
