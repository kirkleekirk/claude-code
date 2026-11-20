import RAPIER from '@dimforge/rapier3d-compat';
import { log } from '@/core/log';

export { RAPIER };

/**
 * Collision membership bits. Use `groups(member, filter)` to build Rapier interaction groups.
 * Two colliders interact when each one's membership intersects the other's filter.
 */
export const Layer = {
  STATIC: 0x0001,
  VEHICLE: 0x0002,
  PLAYER: 0x0004,
  PROP: 0x0008,
  SENSOR: 0x0010,
  WATER: 0x0020,
  NPC: 0x0040,
  DEBRIS: 0x0080,
  ALL: 0xffff,
} as const;

export function groups(member: number, filter: number): number {
  return (((member & 0xffff) << 16) | (filter & 0xffff)) >>> 0;
}

/** Ready-made interaction groups for the common collider roles. */
export const Collide = {
  static: groups(Layer.STATIC, Layer.ALL),
  // People are kinematic: cars never collide with them in the solver (an immovable capsule would
  // stop a car dead). The character controller still treats cars as obstacles through its query,
  // and stages resolve car-versus-person hits as knockdowns.
  vehicle: groups(Layer.VEHICLE, Layer.STATIC | Layer.VEHICLE | Layer.PROP),
  player: groups(Layer.PLAYER, Layer.STATIC | Layer.PROP),
  prop: groups(Layer.PROP, Layer.STATIC | Layer.VEHICLE | Layer.PROP | Layer.PLAYER),
  npc: groups(Layer.NPC, Layer.VEHICLE),
  debris: groups(Layer.DEBRIS, Layer.STATIC),
  sensor: groups(Layer.SENSOR, Layer.PLAYER | Layer.VEHICLE),
  water: groups(Layer.WATER, 0),
} as const;

/** Query filters (what a ray or shape test can hit). */
export const Query = {
  ground: groups(Layer.ALL, Layer.STATIC),
  solid: groups(Layer.ALL, Layer.STATIC | Layer.VEHICLE | Layer.PROP),
  sight: groups(Layer.ALL, Layer.STATIC | Layer.VEHICLE),
  camera: groups(Layer.ALL, Layer.STATIC),
  water: groups(Layer.ALL, Layer.WATER),
} as const;

const RAY_NUDGE_X = 1.37e-4;
const RAY_NUDGE_Z = 0.71e-4;

export interface RayHit {
  hit: boolean;
  distance: number;
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  nz: number;
  collider: RAPIER.Collider | null;
}

export interface ContactInfo {
  /** Tag of the other collider (see `PhysicsWorld.tag`). */
  other: unknown;
  otherCollider: RAPIER.Collider;
  /** Peak contact force magnitude in newtons for this step. */
  force: number;
}

type ContactListener = (info: ContactInfo) => void;

/**
 * Thin, allocation-conscious wrapper around a Rapier world: fixed stepping, collision layers,
 * static-geometry helpers, ray queries that write into a reusable hit record, contact-force
 * callbacks, and collider → game-object tags.
 */
export class PhysicsWorld {
  readonly world: RAPIER.World;
  readonly hit: RayHit = { hit: false, distance: 0, x: 0, y: 0, z: 0, nx: 0, ny: 1, nz: 0, collider: null };

  private readonly events: RAPIER.EventQueue;
  private readonly ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
  private readonly tags = new Map<number, unknown>();
  private readonly contactListeners = new Map<number, ContactListener>();
  private readonly staticBody: RAPIER.RigidBody;
  private readonly info: ContactInfo = { other: undefined, otherCollider: null as unknown as RAPIER.Collider, force: 0 };

  private constructor() {
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = 1 / 60;
    this.events = new RAPIER.EventQueue(true);
    this.staticBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  }

  static async create(): Promise<PhysicsWorld> {
    await RAPIER.init();
    return new PhysicsWorld();
  }

  /** Advance one fixed step and dispatch contact-force callbacks. */
  step(dt: number): void {
    this.world.timestep = dt;
    this.world.step(this.events);
    if (this.contactListeners.size === 0) {
      this.events.clear();
      return;
    }
    this.events.drainContactForceEvents((e) => {
      const h1 = e.collider1();
      const h2 = e.collider2();
      const force = e.maxForceMagnitude();
      this.dispatch(h1, h2, force);
      this.dispatch(h2, h1, force);
    });
    this.events.drainCollisionEvents(() => undefined);
  }

  // ── static world ───────────────────────────────────────────────────────────

  /** Axis-aligned or yaw-rotated static box. Returns the collider (attached to the shared static body). */
  addStaticBox(
    cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, yaw = 0, group: number = Collide.static,
  ): RAPIER.Collider {
    const desc = RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(cx, cy, cz).setCollisionGroups(group);
    if (yaw !== 0) desc.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) });
    return this.world.createCollider(desc, this.staticBody);
  }

  addStaticCylinder(cx: number, cy: number, cz: number, halfHeight: number, radius: number, group: number = Collide.static): RAPIER.Collider {
    const desc = RAPIER.ColliderDesc.cylinder(halfHeight, radius).setTranslation(cx, cy, cz).setCollisionGroups(group);
    return this.world.createCollider(desc, this.staticBody);
  }

  /** Static triangle mesh in world space (ramps, bridges, curbs). */
  addStaticTrimesh(vertices: Float32Array, indices: Uint32Array, group: number = Collide.static): RAPIER.Collider {
    const desc = RAPIER.ColliderDesc.trimesh(vertices, indices).setCollisionGroups(group);
    return this.world.createCollider(desc, this.staticBody);
  }

  /**
   * Static heightfield centred at (cx, cz). `heights` holds (rows+1)×(cols+1) samples in
   * column-major order as Rapier expects; `sizeX`/`sizeZ` are the full extents in metres.
   */
  addHeightfield(
    cx: number, cz: number, rows: number, cols: number, heights: Float32Array, sizeX: number, sizeZ: number,
    group: number = Collide.static,
  ): RAPIER.Collider {
    const desc = RAPIER.ColliderDesc.heightfield(rows, cols, heights, { x: sizeX, y: 1, z: sizeZ })
      .setTranslation(cx, 0, cz)
      .setCollisionGroups(group);
    return this.world.createCollider(desc, this.staticBody);
  }

  removeCollider(collider: RAPIER.Collider): void {
    this.tags.delete(collider.handle);
    this.contactListeners.delete(collider.handle);
    this.world.removeCollider(collider, false);
  }

  removeBody(body: RAPIER.RigidBody): void {
    for (let i = 0; i < body.numColliders(); i++) {
      const h = body.collider(i).handle;
      this.tags.delete(h);
      this.contactListeners.delete(h);
    }
    this.world.removeRigidBody(body);
  }

  // ── tags and contacts ──────────────────────────────────────────────────────

  /** Associate a game object with a collider so queries and contacts can identify it. */
  tag(collider: RAPIER.Collider, data: unknown): void {
    this.tags.set(collider.handle, data);
  }

  tagOf(collider: RAPIER.Collider | null): unknown {
    return collider ? this.tags.get(collider.handle) : undefined;
  }

  /**
   * Report impacts on `collider` stronger than `threshold` newtons (crash sounds, damage, sparks).
   * The `ContactInfo` object is reused between calls; copy what you need.
   */
  onImpact(collider: RAPIER.Collider, threshold: number, listener: ContactListener): void {
    collider.setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS);
    collider.setContactForceEventThreshold(threshold);
    this.contactListeners.set(collider.handle, listener);
  }

  // ── queries ────────────────────────────────────────────────────────────────

  /**
   * Cast a ray; the result is written to `this.hit` (also returned). `dir` should be normalized so
   * `distance` is in metres.
   */
  raycast(
    ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDistance: number,
    filter: number = Query.ground, excludeBody?: RAPIER.RigidBody,
  ): RayHit {
    const ray = this.ray;
    // A ray running exactly along a heightfield grid line can slip between its triangles; a
    // sub-millimetre nudge keeps every query off the lines.
    ray.origin.x = ox + RAY_NUDGE_X; ray.origin.y = oy; ray.origin.z = oz + RAY_NUDGE_Z;
    ray.dir.x = dx; ray.dir.y = dy; ray.dir.z = dz;
    const res = this.world.castRayAndGetNormal(ray, maxDistance, true, undefined, filter, undefined, excludeBody);
    const hit = this.hit;
    if (!res) {
      hit.hit = false;
      hit.distance = maxDistance;
      hit.collider = null;
      return hit;
    }
    const t = res.timeOfImpact;
    hit.hit = true;
    hit.distance = t;
    hit.x = ox + dx * t; hit.y = oy + dy * t; hit.z = oz + dz * t;
    hit.nx = res.normal.x; hit.ny = res.normal.y; hit.nz = res.normal.z;
    hit.collider = res.collider;
    return hit;
  }

  /** True if nothing solid lies between the two points. */
  lineOfSight(ax: number, ay: number, az: number, bx: number, by: number, bz: number, filter: number = Query.sight): boolean {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-4) return true;
    const ray = this.ray;
    ray.origin.x = ax + RAY_NUDGE_X; ray.origin.y = ay; ray.origin.z = az + RAY_NUDGE_Z;
    ray.dir.x = dx / len; ray.dir.y = dy / len; ray.dir.z = dz / len;
    return this.world.castRay(ray, len, true, undefined, filter) === null;
  }

  /** Height of the ground below a point, or `fallback` if nothing is there. */
  groundHeight(x: number, z: number, fromY = 200, fallback = 0): number {
    const h = this.raycast(x, fromY, z, 0, -1, 0, fromY + 100, Query.ground);
    return h.hit ? h.y : fallback;
  }

  dispose(): void {
    this.tags.clear();
    this.contactListeners.clear();
    this.events.free();
    this.world.free();
  }

  private dispatch(self: number, other: number, force: number): void {
    const listener = this.contactListeners.get(self);
    if (!listener) return;
    const collider = this.world.getCollider(other);
    if (!collider) return;
    this.info.other = this.tags.get(other);
    this.info.otherCollider = collider;
    this.info.force = force;
    try {
      listener(this.info);
    } catch (err) {
      log.error('physics', 'impact listener threw', err);
    }
  }
}

/**
 * Stores the previous and current transform of a simulated body so rendering can interpolate
 * between fixed steps. Call `capture` after each physics step, `sample` every frame.
 */
export class TransformInterp {
  px = 0; py = 0; pz = 0;
  pqx = 0; pqy = 0; pqz = 0; pqw = 1;
  cx = 0; cy = 0; cz = 0;
  cqx = 0; cqy = 0; cqz = 0; cqw = 1;

  /** Snap both states to the body (after a teleport). */
  reset(body: RAPIER.RigidBody): void {
    this.capture(body);
    this.capture(body);
  }

  capture(body: RAPIER.RigidBody): void {
    this.px = this.cx; this.py = this.cy; this.pz = this.cz;
    this.pqx = this.cqx; this.pqy = this.cqy; this.pqz = this.cqz; this.pqw = this.cqw;
    const t = body.translation();
    const r = body.rotation();
    this.cx = t.x; this.cy = t.y; this.cz = t.z;
    this.cqx = r.x; this.cqy = r.y; this.cqz = r.z; this.cqw = r.w;
  }

  /** Write the interpolated transform into a Three-style position and quaternion. */
  sample(
    alpha: number,
    position: { set(x: number, y: number, z: number): unknown },
    quaternion: { set(x: number, y: number, z: number, w: number): unknown },
  ): void {
    const a = alpha;
    position.set(this.px + (this.cx - this.px) * a, this.py + (this.cy - this.py) * a, this.pz + (this.cz - this.pz) * a);
    // Normalized lerp along the shortest arc is indistinguishable from slerp at 60 Hz.
    let bx = this.cqx, by = this.cqy, bz = this.cqz, bw = this.cqw;
    if (this.pqx * bx + this.pqy * by + this.pqz * bz + this.pqw * bw < 0) {
      bx = -bx; by = -by; bz = -bz; bw = -bw;
    }
    const x = this.pqx + (bx - this.pqx) * a;
    const y = this.pqy + (by - this.pqy) * a;
    const z = this.pqz + (bz - this.pqz) * a;
    const w = this.pqw + (bw - this.pqw) * a;
    const n = 1 / Math.hypot(x, y, z, w);
    quaternion.set(x * n, y * n, z * n, w * n);
  }
}
