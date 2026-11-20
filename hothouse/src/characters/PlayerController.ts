import { Vector3 } from 'three';
import { clamp, moveTowards, smoothstep } from '@/core/math';
import { tunables } from '@/core/tunables';
import { Collide, Query, RAPIER, TransformInterp, type PhysicsWorld } from '@/physics';
import type { Locomotion } from './api';

const cfg = tunables.group('player.foot', {
  walk: { value: 1.55, min: 0.5, max: 3, step: 0.05, label: 'walk speed (m/s)' },
  jog: { value: 4.2, min: 2, max: 7, step: 0.1, label: 'jog speed' },
  sprint: { value: 7.0, min: 4, max: 10, step: 0.1, label: 'sprint speed' },
  crouch: { value: 1.6, min: 0.5, max: 3, step: 0.05, label: 'crouch speed' },
  accel: { value: 26, min: 4, max: 80, step: 1, label: 'ground acceleration' },
  decel: { value: 34, min: 4, max: 80, step: 1, label: 'ground braking' },
  airAccel: { value: 7, min: 0, max: 30, step: 0.5, label: 'air control' },
  turnRate: { value: 14, min: 2, max: 30, step: 0.5, label: 'turn rate (rad/s)' },
  sprintTurnRate: { value: 7.5, min: 2, max: 30, step: 0.5 },
  jumpSpeed: { value: 5.3, min: 2, max: 9, step: 0.1, label: 'jump take-off (m/s)' },
  gravityUp: { value: 20, min: 5, max: 40, step: 0.5 },
  gravityDown: { value: 30, min: 5, max: 60, step: 0.5 },
  coyote: { value: 0.12, min: 0, max: 0.4, step: 0.01, label: 'coyote time' },
  jumpBuffer: { value: 0.15, min: 0, max: 0.4, step: 0.01 },
  wadeDepth: { value: 1.0, min: 0.3, max: 2, step: 0.05, label: 'deepest wading (m)' },
});

/** What the player asked for this tick, already in camera space. */
export interface FootIntent {
  /** Stick: x right, y forward, each −1…1. */
  moveX: number;
  moveY: number;
  sprint: boolean;
  /** True on the tick the jump button went down. */
  jump: boolean;
  crouch: boolean;
  /** Yaw of the camera the stick is relative to (radians, 0 faces −Z). */
  cameraYaw: number;
}

/** Water depth at a ground position (0 on land). */
export type DepthAt = (x: number, z: number) => number;

const _mv = { x: 0, y: 0, z: 0 };
const UP = { x: 0, y: 1, z: 0 };

/**
 * The player on foot: a kinematic capsule moved by Rapier's character controller (autostep for
 * curbs, snap-to-ground on stairs and slopes), with snappy acceleration, camera-relative
 * steering, coyote time and a jump buffer. It writes `loco` for the actor to animate.
 */
export class PlayerController {
  static readonly RADIUS = 0.3;
  static readonly HALF = 0.6;

  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  readonly velocity = new Vector3();
  readonly loco: Locomotion = { speed: 0, turnRate: 0, moveAngle: 0, grounded: true, vy: 0, crouch: 0 };
  /** Interpolated feet position and facing for rendering. */
  readonly renderPos = new Vector3();
  renderYaw = 0;
  yaw: number;
  grounded = true;
  crouch = 0;
  /** Impact speed of the most recent landing (m/s), consumed by the stage. */
  landing = 0;
  /** Seconds since the controller last stood on ground. */
  airTime = 0;
  private enabled = true;
  private vy = 0;
  private coyote = 0;
  private buffer = 0;
  private prevYaw: number;
  private readonly kcc: RAPIER.KinematicCharacterController;
  private readonly interp = new TransformInterp();
  private readonly hitInfo = new RAPIER.CharacterCollision();
  private readonly shape = new RAPIER.Capsule(PlayerController.HALF, PlayerController.RADIUS);
  private stepped = 0;
  private readonly moved = new RAPIER.Vector3(0, 0, 0);

  constructor(private readonly physics: PhysicsWorld, private readonly depthAt: DepthAt, x: number, y: number, z: number, yaw: number) {
    this.yaw = this.prevYaw = this.renderYaw = yaw;
    this.body = physics.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, y, z));
    const half = PlayerController.HALF, r = PlayerController.RADIUS;
    this.collider = physics.world.createCollider(
      RAPIER.ColliderDesc.capsule(half, r).setTranslation(0, half + r, 0).setFriction(0).setCollisionGroups(Collide.player),
      this.body,
    );
    physics.tag(this.collider, this);
    const k = physics.world.createCharacterController(0.03);
    k.setUp(UP);
    k.setMaxSlopeClimbAngle((50 * Math.PI) / 180);
    k.setMinSlopeSlideAngle((56 * Math.PI) / 180);
    k.enableAutostep(0.42, 0.12, false);
    k.enableSnapToGround(0.4);
    k.setApplyImpulsesToDynamicBodies(true);
    k.setCharacterMass(80);
    k.setSlideEnabled(true);
    this.kcc = k;
    this.interp.reset(this.body);
    this.renderPos.set(x, y, z);
  }

  get position(): Vector3 {
    const t = this.body.translation();
    return _pos.set(t.x, t.y, t.z);
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  /** Take the capsule out of the world (riding in a vehicle) or put it back. */
  setEnabled(on: boolean): void {
    if (on === this.enabled) return;
    this.enabled = on;
    this.body.setEnabled(on);
    if (on) {
      this.vy = 0;
      this.velocity.set(0, 0, 0);
    }
  }

  teleport(x: number, y: number, z: number, yaw = this.yaw): void {
    this.body.setTranslation({ x, y, z }, true);
    this.body.setNextKinematicTranslation({ x, y, z });
    this.yaw = this.prevYaw = this.renderYaw = yaw;
    this.velocity.set(0, 0, 0);
    this.vy = 0;
    this.interp.reset(this.body);
    this.renderPos.set(x, y, z);
  }

  /** Launch the body (knockdowns, explosions): sets velocity and leaves the ground. */
  launch(vx: number, vy: number, vz: number): void {
    this.velocity.set(vx, 0, vz);
    this.vy = vy;
    this.grounded = false;
    this.coyote = 0;
  }

  fixed(dt: number, intent: FootIntent | null): void {
    if (!this.enabled) return;
    this.prevYaw = this.yaw;
    const t = this.body.translation();

    // Stick → desired planar velocity, relative to the camera.
    let mx = intent?.moveX ?? 0, my = intent?.moveY ?? 0;
    let mag = Math.hypot(mx, my);
    if (mag > 1) {
      mx /= mag;
      my /= mag;
      mag = 1;
    }
    this.crouch = moveTowards(this.crouch, intent?.crouch && this.grounded ? 1 : 0, dt * 6);
    const crouching = this.crouch > 0.5;
    let target = 0;
    if (mag > 0.08) {
      if (crouching) target = cfg.crouch * Math.min(1, mag / 0.6);
      else if (intent?.sprint && mag > 0.5) target = cfg.sprint;
      else target = mag < 0.55 ? cfg.walk * (mag / 0.55) : cfg.walk + (cfg.jog - cfg.walk) * smoothstep(0.55, 0.95, mag);
    }
    const cy = intent?.cameraYaw ?? this.yaw;
    const fx = -Math.sin(cy), fz = -Math.cos(cy);
    const rx = Math.cos(cy), rz = -Math.sin(cy);
    let dx = rx * mx + fx * my, dz = rz * mx + fz * my;
    const dl = Math.hypot(dx, dz);
    if (dl > 1e-4) {
      dx /= dl;
      dz /= dl;
    }
    // Wading slows the player; deeper than chest height is a wall.
    const depth = this.depthAt(t.x, t.z);
    target *= 1 - smoothstep(0.25, 1.0, depth) * 0.5;
    let wantX = dx * target, wantZ = dz * target;

    // Accelerate toward it: sharp on the ground, gentle in the air.
    const ax = wantX - this.velocity.x, az = wantZ - this.velocity.z;
    const al = Math.hypot(ax, az);
    const rate = (this.grounded ? (target > 0.05 ? cfg.accel : cfg.decel) : cfg.airAccel) * dt;
    if (al > rate) {
      this.velocity.x += (ax / al) * rate;
      this.velocity.z += (az / al) * rate;
    } else {
      this.velocity.x = wantX;
      this.velocity.z = wantZ;
    }

    // Face the direction of travel.
    const planar = Math.hypot(this.velocity.x, this.velocity.z);
    if (target > 0.05 && dl > 1e-4) {
      const goal = Math.atan2(-dx, -dz);
      const turn = (intent?.sprint ? cfg.sprintTurnRate : cfg.turnRate) * dt * (this.grounded ? 1 : 0.4);
      this.yaw = turnTowards(this.yaw, goal, turn);
    }

    // Jumping, with coyote time and a buffered press.
    this.coyote = this.grounded ? cfg.coyote : this.coyote - dt;
    this.buffer = intent?.jump ? cfg.jumpBuffer : this.buffer - dt;
    if (this.buffer > 0 && this.coyote > 0 && !crouching && depth < 0.6) {
      this.vy = cfg.jumpSpeed;
      this.buffer = 0;
      this.coyote = 0;
      this.grounded = false;
      this.kcc.disableSnapToGround();
    }
    this.vy -= (this.vy > 0 ? cfg.gravityUp : cfg.gravityDown) * dt;
    this.vy = Math.max(this.vy, -45);

    _mv.x = this.velocity.x * dt;
    _mv.y = this.vy * dt;
    _mv.z = this.velocity.z * dt;
    if (depth >= cfg.wadeDepth * 0.8) {
      // Refuse steps that lead into deeper water.
      const ahead = this.depthAt(t.x + _mv.x * 8, t.z + _mv.z * 8);
      if (ahead > cfg.wadeDepth && ahead > depth) {
        _mv.x = 0;
        _mv.z = 0;
        this.velocity.x = 0;
        this.velocity.z = 0;
      }
    }
    this.kcc.computeColliderMovement(this.collider, _mv, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, Query.solid);
    const mv = this.kcc.computedMovement(this.moved);
    // Curbs and steps the controller refuses: try a manual step up (up, across, down).
    const asked0 = Math.hypot(_mv.x, _mv.z);
    if (this.grounded && asked0 > 1e-3 && Math.hypot(mv.x, mv.z) < asked0 * 0.5) {
      const ux = _mv.x / asked0, uz = _mv.z / asked0;
      // Land just past the edge if there is room, a little further on rounded or narrow tops.
      for (const extra of [0.08, 0.22, 0.4]) {
        const across = Math.max(asked0, 0.1) + extra;
        const rise = this.tryStep(t, ux, uz, across);
        if (rise > 0) {
          mv.x = ux * across;
          mv.z = uz * across;
          mv.y = rise + 0.01;
          this.stepped = rise;
          break;
        }
      }
    }
    const wasGrounded = this.grounded;
    this.grounded = this.kcc.computedGrounded() || this.stepped > 0;
    this.stepped = 0;
    if (this.grounded) {
      if (!wasGrounded && this.vy < -1) this.landing = -this.vy;
      this.vy = -1.5;
      this.airTime = 0;
      if (!this.kcc.snapToGroundEnabled()) this.kcc.enableSnapToGround(0.4);
    } else {
      this.airTime += dt;
      if (this.vy > 0 && mv.y < _mv.y * 0.5) this.vy = 0; // bumped a ceiling
    }
    // Walls: when the step was cut short, remove the part of the velocity pushing into whatever
    // stopped it, so the player slides along walls and never builds up pressure against them.
    const asked = Math.hypot(_mv.x, _mv.z);
    if (asked > 1e-5 && Math.hypot(mv.x, mv.z) < asked * 0.85) {
      const n = this.kcc.numComputedCollisions();
      for (let i = 0; i < n; i++) {
        const c = this.kcc.computedCollision(i, this.hitInfo);
        if (!c || c.normal1.y > 0.6) continue;
        const hl = Math.hypot(c.normal1.x, c.normal1.z);
        if (hl < 1e-3) continue;
        const ux = c.normal1.x / hl, uz = c.normal1.z / hl;
        const into = this.velocity.x * ux + this.velocity.z * uz;
        if (into < 0) {
          this.velocity.x -= into * ux;
          this.velocity.z -= into * uz;
        }
      }
    }
    this.body.setNextKinematicTranslation({ x: t.x + mv.x, y: t.y + mv.y, z: t.z + mv.z });

    // Locomotion for the actor.
    const l = this.loco;
    l.speed = planar;
    l.turnRate = dt > 0 ? wrap(this.yaw - this.prevYaw) / dt : 0;
    l.moveAngle = planar > 0.2 ? wrap(Math.atan2(-this.velocity.x, -this.velocity.z) - this.yaw) : 0;
    l.grounded = this.grounded;
    l.vy = this.grounded ? 0 : this.vy;
    l.crouch = this.crouch;
    void wantZ;
    void wantX;
  }

  /**
   * Step up onto a ledge no higher than STEP_UP: cast the capsule up, across by `across`, then down
   * onto the top. Returns the rise in metres, or 0 if any leg is blocked or the top is not flat.
   */
  private tryStep(t: { x: number; y: number; z: number }, ux: number, uz: number, across: number): number {
    const w = this.physics.world;
    const cy = t.y + PlayerController.HALF + PlayerController.RADIUS + 0.02;
    _sp.x = t.x; _sp.y = cy; _sp.z = t.z;
    _sv.x = 0; _sv.y = 1; _sv.z = 0;
    const flags = RAPIER.QueryFilterFlags.EXCLUDE_SENSORS;
    if (w.castShape(_sp, ROT, _sv, this.shape, 0, STEP_UP, false, flags, Query.solid, this.collider)) return 0;
    _sp.y = cy + STEP_UP;
    _sv.x = ux; _sv.y = 0; _sv.z = uz;
    if (w.castShape(_sp, ROT, _sv, this.shape, 0, across, false, flags, Query.solid, this.collider)) return 0;
    _sp.x += ux * across;
    _sp.z += uz * across;
    _sv.x = 0; _sv.y = -1; _sv.z = 0;
    const hit = w.castShape(_sp, ROT, _sv, this.shape, 0, STEP_UP + 0.06, false, flags, Query.solid, this.collider);
    if (!hit || hit.normal1.y < 0.7) return 0;
    const rise = STEP_UP + 0.02 - hit.time_of_impact;
    return rise > 0.03 && rise <= STEP_UP ? rise : 0;
  }

  /** After the physics step: remember the pose for interpolation. */
  afterStep(): void {
    if (this.enabled) this.interp.capture(this.body);
  }

  update(alpha: number): void {
    if (!this.enabled) return;
    this.interp.sample(alpha, this.renderPos, _q);
    this.renderYaw = this.prevYaw + wrap(this.yaw - this.prevYaw) * alpha;
  }

  dispose(): void {
    this.physics.world.removeCharacterController(this.kcc);
    this.physics.removeBody(this.body);
  }
}

const _pos = new Vector3();
/** Highest curb or stair the player steps up without jumping. */
const STEP_UP = 0.45;
const ROT = { x: 0, y: 0, z: 0, w: 1 };
const _sp = { x: 0, y: 0, z: 0 };
const _sv = { x: 0, y: 0, z: 0 };
const _q = { set: (_x: number, _y: number, _z: number, _w: number) => _q };

/** Wrap an angle to −π…π. */
export function wrap(a: number): number {
  return a - Math.round(a / (Math.PI * 2)) * Math.PI * 2;
}

/** Rotate `from` toward `to` by at most `step` radians along the short way round. */
export function turnTowards(from: number, to: number, step: number): number {
  const d = wrap(to - from);
  return from + clamp(d, -step, step);
}
