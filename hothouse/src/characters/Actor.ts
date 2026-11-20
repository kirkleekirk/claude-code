import { Bone as ThreeBone, Group, Object3D, Quaternion, Skeleton, SkinnedMesh, Vector3, type MeshStandardMaterial } from 'three';
import type { Appearance } from '@/content/appearance';
import { clamp, damp } from '@/core/math';
import { Rng, hash2 } from '@/core/rng';
import type { MaterialKit } from '@/render/materials/MaterialKit';
import type { Actor, ActorEvent, AttachSlot, ClipId, FaceExpression, Locomotion, PlayOptions, Posture } from './api';
import { ClipPlayer } from './anim/clipPlayer';
import type { ClipCtx } from './anim/clips';
import { FaceState } from './anim/face';
import { LocoEvent, Locomotor } from './anim/locomotion';
import { Pose, quatFromPose } from './anim/pose';
import { writeSeated } from './anim/postures';
import type { PersonGeometry } from './geometry/build';
import { applyAppearance, createPeopleMaterial, createUniforms, type PeopleUniforms } from './material';
import { BONE_COUNT, BONE_NAMES, BONE_PARENT, Bone, SEG, proportions, restOffset, type Proportions } from './rig';

/** Distance bands (metres): full detail, reduced rate, distant, culled. */
export const LOD = { near: 20, mid: 60, far: 150 } as const;

/** Per-frame bookkeeping shared by every actor of one factory. */
export class FrameStats {
  frame = 0;
  full = 0;
  reduced = 0;
  culled = 0;
  ms = 0;
  lastFull = 0;
  lastReduced = 0;
  lastCulled = 0;
  lastMs = 0;

  /** An actor updated twice since the last roll-over: a new frame has begun. */
  roll(): void {
    this.lastFull = this.full;
    this.lastReduced = this.reduced;
    this.lastCulled = this.culled;
    this.lastMs = this.ms;
    this.full = this.reduced = this.culled = 0;
    this.ms = 0;
    this.frame++;
  }
}

const _v = new Vector3();
const _w = new Vector3();
const _q = new Quaternion();
const _off = { x: 0, y: 0, z: 0 };

export interface ActorOptions {
  name?: string;
  castShadow?: boolean;
}

export class ActorImpl implements Actor {
  readonly root = new Group();
  readonly body = new Group();
  readonly mesh: SkinnedMesh;
  readonly bones: ThreeBone[] = [];
  readonly appearance: Appearance;
  readonly height: number;
  readonly loco: Locomotion = { speed: 0, turnRate: 0, moveAngle: 0, grounded: true, vy: 0, crouch: 0 };
  posture: Posture = 'stand';
  steer = 0;
  onEvent: ((e: ActorEvent) => void) | null = null;
  /** Current detail level: 0 near, 1 reduced, 2 distant, 3 culled. */
  level = 0;

  readonly uniforms: PeopleUniforms;
  readonly material: MeshStandardMaterial;
  readonly prop: Proportions;
  private readonly skeleton: Skeleton;
  private readonly ctx: ClipCtx;
  private readonly loc: Locomotor;
  private readonly clips = new ClipPlayer();
  private readonly face: FaceState;
  private readonly pose = new Pose();
  private readonly seated = new Pose();
  private readonly sockets: Record<AttachSlot, Object3D>;
  private readonly attached: Record<AttachSlot, Object3D | null> = { handR: null, handL: null, head: null, back: null };
  private seatPosture: Exclude<Posture, 'stand'> = 'drive';
  private seatW = 0;
  private time = 0;
  private acc = 0;
  private tick = 0;
  private stamp = -1;
  private readonly stagger: number;
  private culled = false;
  private disposed = false;
  private lookTarget: Vector3 | null = null;
  private readonly lookAt0 = new Vector3();
  private lookYaw = 0;
  private lookPitch = 0;
  private lookW = 0;
  private hairX = 0;
  private hairZ = 0;
  private hairVX = 0;
  private hairVZ = 0;
  private readonly prevPos = new Vector3();
  private readonly prevVel = new Vector3();
  private hasPrev = false;
  private readonly onContact = () => this.emit('contact');

  private readonly castShadow: boolean;

  constructor(
    private readonly kit: MaterialKit,
    appearance: Appearance,
    readonly geo: PersonGeometry,
    private readonly frame: FrameStats,
    serial: number,
    opts: ActorOptions,
    private readonly release: (actor: ActorImpl) => void,
  ) {
    this.appearance = { ...appearance };
    this.castShadow = opts.castShadow ?? true;
    this.prop = proportions(appearance);
    this.height = this.prop.scale * 1.76;
    const seed = hash2(serial, appearance.outfit * 131 + appearance.skin * 7 + appearance.hair, 913);
    const rng = new Rng(seed);
    this.loc = new Locomotor(rng.fork('loco'));
    this.face = new FaceState(rng.fork('face'));
    this.stagger = seed % 4;
    this.ctx = { joints: geo.joints, prop: this.prop, seed: (seed % 1000) / 1000 };
    // Skeleton at rest, bound with the body group at identity.
    for (let i = 0; i < BONE_COUNT; i++) {
      const b = new ThreeBone();
      b.name = BONE_NAMES[i]!;
      restOffset(geo.joints, i, _off);
      b.position.set(_off.x, _off.y, _off.z);
      b.matrixAutoUpdate = false;
      b.updateMatrix();
      this.bones.push(b);
    }
    for (let i = 0; i < BONE_COUNT; i++) {
      const parent = BONE_PARENT[i]!;
      if (parent >= 0) this.bones[parent]!.add(this.bones[i]!);
    }
    this.body.add(this.bones[Bone.hips]!);
    this.uniforms = createUniforms();
    applyAppearance(this.uniforms, appearance);
    this.material = createPeopleMaterial(kit, this.uniforms);
    this.mesh = new SkinnedMesh(geo.geometry, this.material);
    this.mesh.name = 'person-mesh';
    this.mesh.castShadow = this.castShadow;
    this.mesh.receiveShadow = true;
    this.body.add(this.mesh);
    this.body.updateMatrixWorld(true);
    this.skeleton = new Skeleton(this.bones);
    this.mesh.bind(this.skeleton);
    this.body.scale.setScalar(this.prop.scale);
    this.body.position.y = this.prop.lift * this.prop.scale;
    this.root.add(this.body);
    this.root.name = opts.name ?? 'person';
    const sock = (bone: number, x: number, y: number, z: number) => {
      const o = new Object3D();
      o.name = 'socket';
      o.position.set(x, y, z);
      this.bones[bone]!.add(o);
      return o;
    };
    this.sockets = {
      handR: sock(Bone.handR, 0.012, -0.075, -0.012),
      handL: sock(Bone.handL, -0.012, -0.075, -0.012),
      head: sock(Bone.head, 0, 0.215, 0),
      back: sock(Bone.chest, 0, 0.02, 0.17),
    };
    this.evaluate(0, 0);
  }

  // ── Actor API ──────────────────────────────────────────────────────────

  play(clip: ClipId, opts?: PlayOptions): void {
    this.clips.play(clip, opts);
  }

  stop(clip?: ClipId, fade?: number): void {
    this.clips.stop(clip, fade);
  }

  isPlaying(clip: ClipId): boolean {
    return this.clips.isPlaying(clip);
  }

  /** Showcases: keep the eyes open for a while (photo stills). */
  deferBlink(seconds: number): void {
    this.face.deferBlink(seconds);
  }

  /** Showcases and tests: jump the gait cycle to a phase (0–1); the next update poses it. */
  setCyclePhase(p: number): void {
    this.loc.phase = p - Math.floor(p);
  }

  lookAt(target: Vector3 | null): void {
    if (target) {
      this.lookAt0.copy(target);
      this.lookTarget = this.lookAt0;
    } else {
      this.lookTarget = null;
    }
  }

  setExpression(e: FaceExpression, hold?: number): void {
    this.face.set(e, hold);
  }

  attach(slot: AttachSlot, obj: Object3D | null): void {
    const prev = this.attached[slot];
    if (prev && prev !== obj) prev.removeFromParent();
    this.attached[slot] = obj;
    if (obj) this.sockets[slot].add(obj);
  }

  socketPosition(slot: AttachSlot, out: Vector3): Vector3 {
    const s = this.sockets[slot];
    s.updateWorldMatrix(true, false);
    return s.getWorldPosition(out);
  }

  update(dt: number, cameraDistance: number): void {
    if (this.disposed) return;
    const t0 = performance.now();
    const f = this.frame;
    if (this.stamp === f.frame) f.roll();
    this.stamp = f.frame;
    this.time += dt;
    // Gameplay-relevant clocks run at every distance, even when nothing is drawn.
    this.clips.advance(dt, this.onContact);
    this.advancePosture(dt);
    if (cameraDistance > LOD.far) {
      this.setCulled(true);
      this.level = 3;
      f.culled++;
      f.ms += performance.now() - t0;
      return;
    }
    this.setCulled(false);
    this.level = cameraDistance < LOD.near ? 0 : cameraDistance < LOD.mid ? 1 : 2;
    this.mesh.castShadow = this.level <= 1 && this.castShadow;
    this.acc += dt;
    this.tick++;
    const every = this.level === 0 ? 1 : this.level === 1 ? 2 : 4;
    if (this.level === 0) f.full++;
    else f.reduced++;
    if ((this.tick + this.stagger) % every === 0) {
      this.evaluate(this.acc, this.level);
      this.acc = 0;
    }
    f.ms += performance.now() - t0;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    for (const slot of ['handR', 'handL', 'head', 'back'] as const) this.attached[slot]?.removeFromParent();
    this.clips.clear();
    this.skeleton.dispose();
    this.kit.release(this.material);
    this.release(this);
  }

  // ── internals ──────────────────────────────────────────────────────────

  private emit(e: ActorEvent): void {
    this.onEvent?.(e);
  }

  private setCulled(c: boolean): void {
    if (c === this.culled) return;
    this.culled = c;
    if (c) this.root.remove(this.body);
    else this.root.add(this.body);
  }

  private advancePosture(dt: number): void {
    if (this.posture !== 'stand') this.seatPosture = this.posture;
    const target = this.posture === 'stand' ? 0 : 1;
    const before = this.seatW;
    this.seatW = target > before ? Math.min(1, before + dt / 0.35) : Math.max(0, before - dt / 0.3);
    if (before < 1 && this.seatW >= 1) this.emit('seated');
    if (before > 0 && this.seatW <= 0) this.emit('stood');
  }

  /** Build the pose for this frame and push it to the bones. */
  private evaluate(dt: number, level: number): void {
    const P = this.pose;
    const sw = this.seatW * this.seatW * (3 - 2 * this.seatW);
    let events = 0;
    if (sw < 0.999) {
      events = this.loc.evaluate(dt, this.loco, P, this.prop, this.geo.joints, this.clips.count === 0 && this.lookW < 0.1);
    } else {
      P.reset();
    }
    if (sw > 0.001) {
      writeSeated(this.seated, this.seatPosture, this.steer, this.ctx, 1 / this.prop.scale, this.time);
      P.blend(this.seated, sw, null, sw);
    }
    this.body.position.y = this.prop.lift * this.prop.scale * (1 - sw);
    this.clips.apply(P, this.ctx);
    if (level <= 1) this.applyLook(dt, P);
    if (level === 0) this.applyHair(dt, P);
    this.writeBones(P);
    if (level === 0) {
      const lookX = -clamp(this.lookYawTarget * 1.6, -1, 1);
      const lookY = clamp(this.lookPitchTarget * 1.8, -1, 1);
      this.face.update(dt, this.uniforms, this.clips.expression, this.clips.talk, lookX, lookY, this.lookW);
    }
    if (events && sw < 0.5 && this.clips.fullBody < 0.5) {
      if (events & LocoEvent.FOOT_L) this.emit('footL');
      if (events & LocoEvent.FOOT_R) this.emit('footR');
      if (events & LocoEvent.LAND) this.emit('land');
    }
  }

  private lookYawTarget = 0;
  private lookPitchTarget = 0;

  private applyLook(dt: number, P: Pose): void {
    let yaw = 0, pitch = 0, want = 0;
    if (this.lookTarget) {
      _v.copy(this.lookTarget);
      this.root.worldToLocal(_v);
      const s = this.prop.scale;
      const dx = _v.x / s, dy = _v.y / s - (1.645 + P.hips[1]! + this.body.position.y / s), dz = _v.z / s;
      yaw = Math.atan2(-dx, -dz);
      pitch = Math.atan2(dy, Math.hypot(dx, dz));
      want = Math.abs(yaw) < 2.3 ? 1 : 0;
      yaw = clamp(yaw, -1.25, 1.25);
      pitch = clamp(pitch, -0.6, 0.55);
    }
    this.lookYawTarget = yaw * want;
    this.lookPitchTarget = pitch * want;
    this.lookW = damp(this.lookW, want, 5, dt);
    this.lookYaw = damp(this.lookYaw, yaw, 7, dt);
    this.lookPitch = damp(this.lookPitch, pitch, 7, dt);
    const w = this.lookW * (1 - this.clips.headOwned * 0.85);
    if (w <= 0.001) return;
    const y = this.lookYaw * w, p = this.lookPitch * w;
    P.add(Bone.chest, 0, y * 0.18, 0);
    P.add(Bone.neck, p * 0.35, y * 0.32, 0);
    P.add(Bone.head, p * 0.55, y * 0.45, 0);
  }

  /** Long hair, ponytails and braids trail the head's motion on a damped spring. */
  private applyHair(dt: number, P: Pose): void {
    if (dt <= 0) return;
    const e = this.root.matrixWorld.elements;
    _v.set(e[12]!, e[13]!, e[14]!);
    if (!this.hasPrev) {
      this.prevPos.copy(_v);
      this.prevVel.set(0, 0, 0);
      this.hasPrev = true;
    }
    _w.copy(_v).sub(this.prevPos).divideScalar(dt);
    this.prevPos.copy(_v);
    // Acceleration in the actor's frame (forward is −Z).
    const ax = (_w.x - this.prevVel.x) / dt, az = (_w.z - this.prevVel.z) / dt;
    this.prevVel.copy(_w);
    const fx = -e[8]!, fz = -e[10]!;
    const rx = e[0]!, rz = e[2]!;
    const fl = Math.hypot(fx, fz) || 1, rl = Math.hypot(rx, rz) || 1;
    const aFwd = (ax * fx + az * fz) / fl, aRight = (ax * rx + az * rz) / rl;
    const vFwd = (_w.x * fx + _w.z * fz) / fl;
    const head = P.r[Bone.hips * 3]! + P.r[Bone.spine * 3]! + P.r[Bone.chest * 3]! + P.r[Bone.neck * 3]! + P.r[Bone.head * 3]!;
    const tx = clamp(-aFwd * 0.012 - vFwd * 0.035, -0.6, 0.35) - head * 0.7;
    const tz = clamp(aRight * 0.01, -0.4, 0.4) - (P.r[Bone.head * 3 + 2]! + P.r[Bone.neck * 3 + 2]!) * 0.6;
    const k = 60, c = 9;
    const h = Math.min(dt, 1 / 30);
    this.hairVX += (k * (tx - this.hairX) - c * this.hairVX) * h;
    this.hairVZ += (k * (tz - this.hairZ) - c * this.hairVZ) * h;
    this.hairX += this.hairVX * h;
    this.hairZ += this.hairVZ * h;
    P.set(Bone.hair, this.hairX, 0, this.hairZ);
  }

  private writeBones(P: Pose): void {
    const r = P.r;
    for (let i = 0; i < BONE_COUNT; i++) {
      const b = this.bones[i]!;
      quatFromPose(_q, r[i * 3]!, r[i * 3 + 1]!, r[i * 3 + 2]!);
      b.quaternion.copy(_q);
      if (i === Bone.hips) b.position.set(P.hips[0]!, SEG.hipY + P.hips[1]!, P.hips[2]!);
      b.updateMatrix();
    }
  }
}
