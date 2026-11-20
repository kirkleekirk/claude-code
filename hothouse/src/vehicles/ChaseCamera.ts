import { Vector3, type PerspectiveCamera } from 'three';
import { angleDelta, clamp, damp, dampAngle, smoothstep } from '@/core/math';
import { tunables } from '@/core/tunables';
import { Query, type PhysicsWorld } from '@/physics';
import type { Vehicle } from './Vehicle';

const cfg = tunables.group('camera.chase', {
  distance: { value: 5.9, min: 3, max: 12, step: 0.05 },
  distanceFast: { value: 7.4, min: 3, max: 14, step: 0.05 },
  height: { value: 1.95, min: 0.5, max: 5, step: 0.05 },
  lookHeight: { value: 1.15, min: 0, max: 3, step: 0.05 },
  lookAhead: { value: 0.12, min: 0, max: 0.6, step: 0.01, label: 'look ahead (s)' },
  followYaw: { value: 5.5, min: 0.5, max: 20, step: 0.1 },
  followPos: { value: 11, min: 1, max: 30, step: 0.5 },
  driftLean: { value: 0.55, min: 0, max: 1, step: 0.01 },
  fovKick: { value: 13, min: 0, max: 30, step: 0.5 },
  boostKick: { value: 6, min: 0, max: 20, step: 0.5 },
  recenterDelay: { value: 1.4, min: 0.2, max: 5, step: 0.1 },
});

const _target = new Vector3();
const _desired = new Vector3();
const _dir = new Vector3();
const _look = new Vector3();

export interface ChaseInput {
  lookX: number;
  lookY: number;
  lookBack: boolean;
}

/**
 * Third-person chase camera for vehicles. Follows the direction of travel (so drifts show the
 * car's flank), pulls back and widens with speed, never clips through walls, and returns to centre
 * after the player looks around.
 */
export class ChaseCamera {
  baseFov = 68;
  /** 0–1 user shake scale (accessibility). */
  shakeScale = 1;
  private yaw = 0;
  private pitch = 0.08;
  private manualYaw = 0;
  private manualPitch = 0;
  private idle = 10;
  private dist = 6;
  private trauma = 0;
  private time = 0;
  private readonly pos = new Vector3();
  private initialised = false;

  constructor(private readonly physics: PhysicsWorld) {}

  snap(): void {
    this.initialised = false;
  }

  /** Add camera trauma (0–1) from impacts, landings and explosions. */
  kick(amount: number): void {
    this.trauma = clamp(this.trauma + amount, 0, 1);
  }

  update(cam: PerspectiveCamera, v: Vehicle, dt: number, input: ChaseInput): void {
    this.time += dt;
    const speed = Math.abs(v.speed);
    const fast = smoothstep(8, 50, speed);
    const lv = v.rb.linvel();
    const carYaw = v.yaw;
    const moveYaw = Math.atan2(-lv.x, -lv.z);
    // Lean toward the direction of travel while sliding; follow the nose otherwise.
    const lean = speed > 6 && v.speed > 0 ? clamp(Math.abs(v.driftAngle) * 1.6, 0, 1) * cfg.driftLean : 0;
    const desiredYaw = carYaw + angleDelta(carYaw, moveYaw) * lean + (input.lookBack ? Math.PI : 0);

    // Manual look with auto-recentre.
    if (Math.abs(input.lookX) > 1e-4 || Math.abs(input.lookY) > 1e-4) {
      this.manualYaw -= input.lookX;
      this.manualPitch = clamp(this.manualPitch + input.lookY, -0.35, 0.7);
      this.idle = 0;
    } else {
      this.idle += dt;
      if (this.idle > cfg.recenterDelay && speed > 2) {
        this.manualYaw = damp(this.manualYaw, 0, 2.5, dt);
        this.manualPitch = damp(this.manualPitch, 0, 2.5, dt);
      }
    }

    const p = v.position;
    if (!this.initialised) {
      this.yaw = desiredYaw;
      this.dist = cfg.distance;
    }
    this.yaw = input.lookBack ? desiredYaw : dampAngle(this.yaw, desiredYaw, cfg.followYaw * (0.6 + fast * 0.6), dt);
    const yaw = this.yaw + this.manualYaw;
    const pitch = this.pitch + this.manualPitch;
    const wantDist = cfg.distance + (cfg.distanceFast - cfg.distance) * fast;
    this.dist = damp(this.dist, wantDist, 3, dt);

    _target.set(p.x, p.y + cfg.lookHeight, p.z);
    _dir.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    _desired.copy(_target).addScaledVector(_dir, -this.dist);
    _desired.y += cfg.height - cfg.lookHeight;
    // Keep the camera out of walls: cast from the car toward the camera.
    _look.subVectors(_desired, _target);
    const len = _look.length();
    if (len > 0.01) {
      _look.divideScalar(len);
      const hit = this.physics.raycast(_target.x, _target.y, _target.z, _look.x, _look.y, _look.z, len + 0.3, Query.camera, v.rb);
      if (hit.hit) _desired.copy(_target).addScaledVector(_look, Math.max(1.2, hit.distance - 0.35));
    }
    // Never below the ground.
    const ground = this.physics.groundHeight(_desired.x, _desired.z, _desired.y + 4, -100);
    _desired.y = Math.max(_desired.y, ground + 0.45);

    if (!this.initialised) {
      this.pos.copy(_desired);
      this.initialised = true;
    } else {
      const k = 1 - Math.exp(-cfg.followPos * dt);
      this.pos.lerp(_desired, k);
    }
    cam.position.copy(this.pos);
    // Look slightly ahead along the velocity.
    _look.set(p.x + lv.x * cfg.lookAhead, p.y + cfg.lookHeight, p.z + lv.z * cfg.lookAhead);
    cam.lookAt(_look);

    // Shake: impacts plus a faint high-speed buzz.
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    if (v.impact > 0) this.kick(clamp(v.impact / 400000, 0, 0.6));
    const shake = (this.trauma * this.trauma + fast * fast * 0.04) * this.shakeScale;
    if (shake > 1e-4) {
      const t = this.time;
      cam.rotateX(Math.sin(t * 37.1) * 0.012 * shake + Math.sin(t * 13.7) * 0.008 * shake);
      cam.rotateY(Math.sin(t * 29.3 + 1.7) * 0.012 * shake);
      cam.rotateZ(Math.sin(t * 21.9 + 0.4) * 0.01 * shake);
    }

    const fov = this.baseFov + cfg.fovKick * fast + (v.controls.boost ? cfg.boostKick : 0);
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = damp(cam.fov, fov, 4, dt);
      cam.updateProjectionMatrix();
    }
  }
}
