import { clamp, smoothstep } from '@/core/math';
import { tunables } from '@/core/tunables';
import { Query, type PhysicsWorld } from '@/physics';
import type { Vehicle } from './Vehicle';

const cfg = tunables.group('vehicle.flow', {
  driftRate: { value: 0.24, min: 0, max: 0.5, step: 0.005, label: 'drift fill /s' },
  airRate: { value: 0.16, min: 0, max: 0.6, step: 0.01, label: 'air fill /s' },
  speedRate: { value: 0.025, min: 0, max: 0.2, step: 0.005, label: 'flat-out fill /s' },
  nearMiss: { value: 0.07, min: 0, max: 0.3, step: 0.005, label: 'near-miss burst' },
  landing: { value: 0.05, min: 0, max: 0.3, step: 0.005, label: 'clean landing burst' },
  drain: { value: 0.22, min: 0.05, max: 1, step: 0.01, label: 'boost drain /s' },
  cool: { value: 0.03, min: 0, max: 0.3, step: 0.005, label: 'cooling /s' },
  coolDelay: { value: 2.5, min: 0, max: 10, step: 0.1 },
  startBoost: { value: 0.15, min: 0, max: 1, step: 0.01, label: 'needed to start a boost' },
});

export type FlowEvent = 'drift' | 'nearMiss' | 'air' | 'landing' | 'full' | 'boostStart' | 'boostEnd';

const SIDE_REACH = 1.25;

/**
 * The Flow meter: driving with style (long drifts, near misses, air, flat-out runs) fills it; boost
 * burns it. It cools slowly when idle and never takes anything away for crashing.
 */
export class FlowMeter {
  value = 0;
  boosting = false;
  /** Seconds of the current drift (0 when not drifting); the HUD shows a combo from it. */
  driftTime = 0;
  /** Events raised during the last `fixed` call. */
  readonly events: FlowEvent[] = [];
  private idle = 0;
  private airTime = 0;
  private wasFull = false;
  private readonly sideTimer = [0, 0];
  private readonly sideClose = [false, false];
  private readonly sideCooldown = [0, 0];
  private lastImpact = 0;

  constructor(private readonly physics: PhysicsWorld) {}

  get boostReady(): boolean {
    return this.value >= cfg.startBoost;
  }

  /** May the car burn boost this step? Keeps burning down to empty once started. */
  canBoost(wants: boolean): boolean {
    if (!wants) return false;
    return this.boosting ? this.value > 0.005 : this.value >= cfg.startBoost;
  }

  reset(): void {
    this.value = 0;
    this.boosting = false;
    this.driftTime = 0;
    this.idle = 0;
    this.airTime = 0;
  }

  fixed(dt: number, v: Vehicle, boostHeld: boolean): void {
    this.events.length = 0;
    const speed = Math.abs(v.speed);
    let gain = 0;

    // Drifts: angle and speed both count; holding one longer builds a combo.
    const angle = Math.abs(v.driftAngle);
    const drifting = !v.airborne && angle > 0.2 && speed > 9;
    if (drifting) {
      if (this.driftTime === 0) this.events.push('drift');
      this.driftTime += dt;
      const combo = 1 + Math.min(this.driftTime, 4) * 0.12;
      gain += cfg.driftRate * smoothstep(0.15, 0.55, angle) * smoothstep(9, 28, speed) * combo * dt;
    } else if (this.driftTime > 0 && angle < 0.12) this.driftTime = 0;

    // Air: after a short hop, every moment airborne fills; landing upright adds a burst.
    if (v.airborne) {
      this.airTime += dt;
      if (this.airTime > 0.35) {
        if (this.airTime - dt <= 0.35) this.events.push('air');
        gain += cfg.airRate * dt;
      }
    } else {
      if (this.airTime > 0.6) {
        const r = v.rb.rotation();
        const up = 1 - 2 * (r.x * r.x + r.z * r.z);
        if (up > 0.85) {
          gain += cfg.landing;
          this.events.push('landing');
        }
      }
      this.airTime = 0;
    }

    // Flat out.
    if (!v.airborne && speed > v.def.handling.topSpeed * 0.82) gain += cfg.speedRate * dt;

    // Near misses: something solid slides past a flank within reach at speed, without a hit.
    if (speed > 17 && !v.airborne) gain += this.nearMisses(dt, v);
    this.lastImpact = v.impact;

    // Boost burns the meter.
    const burning = this.canBoost(boostHeld);
    if (burning && !this.boosting) this.events.push('boostStart');
    if (!burning && this.boosting) this.events.push('boostEnd');
    this.boosting = burning;
    if (burning) gain -= cfg.drain * dt;

    if (gain > 0) this.idle = 0;
    else this.idle += dt;
    if (this.idle > cfg.coolDelay && !burning) gain -= cfg.cool * dt;
    this.value = clamp(this.value + gain, 0, 1);
    const full = this.value >= 0.999;
    if (full && !this.wasFull) this.events.push('full');
    this.wasFull = this.value >= 0.95 ? full || this.wasFull : false;
  }

  private nearMisses(dt: number, v: Vehicle): number {
    let gain = 0;
    const p = v.position;
    const r = v.rb.rotation();
    // Car right vector from the rotation quaternion.
    const rx = 1 - 2 * (r.y * r.y + r.z * r.z), rz = 2 * (r.x * r.z - r.w * r.y);
    const halfW = v.def.body.width / 2;
    const y = p.y + v.def.body.clearance + 0.45;
    for (let side = 0; side < 2; side++) {
      const s = side === 0 ? -1 : 1;
      this.sideCooldown[side] = Math.max(0, this.sideCooldown[side]! - dt);
      const hit = this.physics.raycast(p.x + rx * s * halfW, y, p.z + rz * s * halfW, rx * s, 0, rz * s, SIDE_REACH, Query.solid, v.rb);
      if (hit.hit) {
        this.sideClose[side] = true;
        this.sideTimer[side] = 0;
      } else if (this.sideClose[side]) {
        // Cleared the obstacle: it counts if the car did not scrape it on the way past.
        this.sideTimer[side]! += dt;
        if (this.sideTimer[side]! > 0.12) {
          this.sideClose[side] = false;
          if (v.impact < 40000 && this.lastImpact < 40000 && this.sideCooldown[side] === 0) {
            gain += cfg.nearMiss;
            this.sideCooldown[side] = 1.2;
            this.events.push('nearMiss');
          }
        }
      }
    }
    return gain;
  }
}
