import { Vector3, type PerspectiveCamera } from 'three';
import { clamp, damp } from '@/core/math';
import { tunables } from '@/core/tunables';
import { Query, type PhysicsWorld } from '@/physics';
import { turnTowards, wrap } from './PlayerController';

const cfg = tunables.group('camera.foot', {
  distance: { value: 3.5, min: 1.5, max: 8, step: 0.1, label: 'distance (m)' },
  sprintDistance: { value: 4.1, min: 1.5, max: 9, step: 0.1 },
  height: { value: 1.58, min: 0.8, max: 2.4, step: 0.02, label: 'pivot height' },
  shoulder: { value: 0.42, min: -1, max: 1, step: 0.02, label: 'shoulder offset' },
  pitchMin: { value: -0.62, min: -1.3, max: 0, step: 0.01 },
  pitchMax: { value: 0.95, min: 0, max: 1.4, step: 0.01 },
  recenterDelay: { value: 1.6, min: 0, max: 6, step: 0.1, label: 'auto-recenter delay (s)' },
  recenterRate: { value: 1.4, min: 0, max: 6, step: 0.1 },
  sprintFov: { value: 7, min: 0, max: 20, step: 0.5, label: 'sprint FOV kick' },
  margin: { value: 0.28, min: 0.05, max: 1, step: 0.01, label: 'wall margin' },
});

const _pivot = new Vector3();
const _cam = new Vector3();
const _dir = new Vector3();
const _look = new Vector3();

export interface FootCameraInput {
  lookX: number;
  lookY: number;
  /** Pressed this frame: snap behind the player. */
  recenter: boolean;
}

/**
 * Over-the-shoulder orbit camera for play on foot. It pulls in instantly when a wall would come
 * between it and the player and eases back out, recenters behind the player after a moment of
 * travel without look input, and kicks the field of view on a sprint.
 */
export class ThirdPersonCamera {
  yaw = 0;
  pitch = 0.16;
  baseFov = 62;
  private dist = 3.5;
  private idle = 0;
  private fovKick = 0;
  private sprintMix = 0;
  private readonly smoothPivot = new Vector3();
  private snapped = false;

  constructor(private readonly physics: PhysicsWorld) {}

  /** Place the camera directly behind a facing without easing (spawn, exiting a car). */
  snap(yaw: number, pitch = 0.16): void {
    this.yaw = yaw;
    this.pitch = pitch;
    this.snapped = false;
    this.idle = 0;
  }

  /**
   * @param feet  interpolated feet position
   * @param facing  the player's yaw
   */
  update(cam: PerspectiveCamera, feet: Vector3, facing: number, speed: number, sprinting: boolean, crouch: number, dt: number, input: FootCameraInput): void {
    // Look input; recenter after a pause while moving.
    const looking = Math.abs(input.lookX) + Math.abs(input.lookY) > 1e-4;
    this.yaw = wrap(this.yaw - input.lookX);
    this.pitch = clamp(this.pitch + input.lookY, cfg.pitchMin, cfg.pitchMax);
    this.idle = looking ? 0 : this.idle + dt;
    if (input.recenter) {
      this.yaw = facing;
      this.pitch = 0.16;
    } else if (this.idle > cfg.recenterDelay && speed > 1.2) {
      const k = cfg.recenterRate * clamp(speed / 4, 0.3, 1.2) * dt;
      this.yaw = turnTowards(this.yaw, facing, k * Math.abs(wrap(facing - this.yaw)) + k * 0.15);
      this.pitch = damp(this.pitch, 0.16, 1.2, dt);
    }

    // Pivot above the feet, smoothed vertically so steps and landings do not jolt the frame.
    _pivot.set(feet.x, feet.y + cfg.height - crouch * 0.45, feet.z);
    if (!this.snapped) {
      this.smoothPivot.copy(_pivot);
      this.snapped = true;
    }
    this.smoothPivot.x = _pivot.x;
    this.smoothPivot.z = _pivot.z;
    this.smoothPivot.y = damp(this.smoothPivot.y, _pivot.y, 14, dt);

    this.sprintMix = damp(this.sprintMix, sprinting && speed > 5 ? 1 : 0, 3, dt);
    const want = cfg.distance + (cfg.sprintDistance - cfg.distance) * this.sprintMix;
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    // Shoulder: offset to the camera's right.
    const shoulder = cfg.shoulder;
    const ox = cy * shoulder, oz = -sy * shoulder;
    const px = this.smoothPivot.x + ox, py = this.smoothPivot.y, pz = this.smoothPivot.z + oz;
    _dir.set(sy * cp, sp, cy * cp);

    // Wall test from the shoulder pivot outward; pull in at once, ease back out.
    const hit = this.physics.raycast(px, py, pz, _dir.x, _dir.y, _dir.z, want + cfg.margin, Query.camera);
    const limit = hit.hit ? Math.max(0.55, hit.distance - cfg.margin) : want;
    this.dist = limit < this.dist ? limit : damp(this.dist, limit, 3.2, dt);

    _cam.set(px + _dir.x * this.dist, py + _dir.y * this.dist, pz + _dir.z * this.dist);
    // Never below the ground under the camera.
    const floor = this.physics.groundHeight(_cam.x, _cam.z, py + 2, _cam.y - 10) + 0.25;
    if (_cam.y < floor) _cam.y = floor;
    cam.position.copy(_cam);
    _look.set(px - _dir.x * 4, py - _dir.y * 4 + 0.08, pz - _dir.z * 4);
    cam.lookAt(_look);

    this.fovKick = damp(this.fovKick, this.sprintMix * cfg.sprintFov, 4, dt);
    const fov = this.baseFov + this.fovKick;
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
  }

  /** Distance the camera currently sits from the shoulder pivot (QA reads it). */
  get currentDistance(): number {
    return this.dist;
  }
}
