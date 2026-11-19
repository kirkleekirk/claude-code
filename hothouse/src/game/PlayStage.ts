import { Quaternion, Vector3 } from 'three';
import type { EngineFrame, EngineVoice, LoopHandle, StationId } from '@/audio/api';
import type { Actor, CharacterFactory } from '@/characters/api';
import { PlayerController, type FootIntent } from '@/characters/PlayerController';
import { ThirdPersonCamera } from '@/characters/ThirdPersonCamera';
import { appearanceFromSeed } from '@/content/appearance';
import { clamp, smoothstep } from '@/core/math';
import { extendHarness } from '@/debug/harness';
import { Query } from '@/physics';
import { ChaseCamera } from '@/vehicles/ChaseCamera';
import { FlowMeter, type FlowEvent } from '@/vehicles/FlowMeter';
import { VEHICLES, type VehicleDef, type VehicleId } from '@/vehicles/defs';
import { Vehicle } from '@/vehicles/Vehicle';
import { districtAt } from '@/world/plan/districts';
import { ROAD_Y } from '@/world/roads/RoadMesher';
import type { World } from '@/world/World';
import type { GameContext, Stage } from './Game';
import { Interactions } from './Interactions';

type Mode = 'foot' | 'vehicle' | 'entering' | 'exiting';

const ENTER_TIME = 0.6;
const EXIT_TIME = 0.5;
const BLEND_TIME = 0.55;
/** Above this speed, leaving the car is a bail-out roll instead of a step out. */
const BAIL_SPEED = 7;

const _v = new Vector3();
const _q = new Quaternion();
const _door = new Vector3();
const _seat = new Vector3();
const _from = new Vector3();

/** Hip point of a seat in the car's local space (side −1 = driver, left-hand drive). */
export function seatLocal(def: VehicleDef, side: -1 | 1, out: Vector3): Vector3 {
  const b = def.body;
  return out.set(side * b.width * 0.215, b.clearance + 0.3, b.length * 0.03);
}

/** Where a person stands to use a door (car local space). */
function doorLocal(def: VehicleDef, side: -1 | 1, out: Vector3): Vector3 {
  const b = def.body;
  return out.set(side * (b.width / 2 + 0.5), 0, b.length * 0.03);
}

interface Parked {
  vehicle: Vehicle;
  remove: () => void;
}

/**
 * Play in the open city: the player on foot or at the wheel. Owns the player controller, the
 * player's actor (once the character system supplies one), the cars in play, both camera rigs
 * with a blend between them, the interaction system, and the per-mode audio.
 */
export class PlayStage implements Stage {
  mode: Mode = 'foot';
  readonly player: PlayerController;
  actor: Actor | null = null;
  /** The car the player is in (or getting into / out of). */
  vehicle: Vehicle | null = null;
  readonly interactions = new Interactions();
  readonly flow: FlowMeter;
  /** Flow events raised during fixed steps, handed to audio and the HUD once per frame. */
  private readonly flowEvents: FlowEvent[] = [];
  /** Called once per frame for each flow event (the HUD shows callouts). */
  onFlowEvent: ((e: FlowEvent) => void) | null = null;
  readonly footCam: ThirdPersonCamera;
  readonly chase: ChaseCamera;
  private readonly parked = new Map<Vehicle, Parked>();
  private readonly look = { x: 0, y: 0 };
  private readonly intent: FootIntent = { moveX: 0, moveY: 0, sprint: false, jump: false, crouch: false, cameraYaw: 0 };
  private engine: EngineVoice | null = null;
  private skid: LoopHandle | null = null;
  private readonly frame: EngineFrame = { rpm: 800, throttle: 0, load: 0, speed: 0, slip: 0, surface: 'asphalt', interior: false, x: 0, y: 0, z: 0 };
  private lastImpact = 0;
  private transitionT = 0;
  private side: -1 | 1 = -1;
  private bail = false;
  private crouchToggle = false;
  private readonly blendPos = new Vector3();
  private readonly blendQuat = new Quaternion();
  private blendFov = 60;
  private blendT = 1;
  private readonly exitFrom = new Vector3();
  private readonly exitTo = new Vector3();

  constructor(private readonly ctx: GameContext, private readonly world: World, private readonly characters: CharacterFactory | null = null) {
    this.footCam = new ThirdPersonCamera(ctx.physics);
    this.flow = new FlowMeter(ctx.physics);
    this.chase = new ChaseCamera(ctx.physics);
    const hf = world.hf;
    this.player = new PlayerController(ctx.physics, (x, z) => hf.depthAt(x, z), -768, ROAD_Y + 0.2, 214, 0);
    this.player.setEnabled(false);
    if (characters) {
      this.actor = characters.create(appearanceFromSeed('player'), { name: 'player', castShadow: true });
      ctx.gfx.scene.add(this.actor.root);
    }
    const station = ctx.settings.peek('audio.defaultStation');
    ctx.audio.radio.setStation(station === 'off' ? null : (station as StationId));
    ctx.audio.score.setMood('silent');
    this.skid = ctx.audio.loop('skid');
    // Start at the wheel of the Palmera on the Strand.
    this.takeWheel(this.spawnCar('palmera', -768, 210, 0), -1);
    this.installHarness();
  }

  // ── vehicles ───────────────────────────────────────────────────────────────

  private spawnCar(id: VehicleId, x: number, z: number, yaw: number, y?: number): Vehicle {
    const def = VEHICLES[id]!;
    const v = new Vehicle(this.ctx.physics, this.ctx.kit, def, { x, y: y ?? ROAD_Y + 0.4, z, yaw }, def.paints[0]!);
    this.ctx.gfx.scene.add(v.group);
    return v;
  }

  /** Leave a car in the world that the player can get into. */
  park(id: VehicleId, x: number, z: number, yaw: number): Vehicle {
    const v = this.spawnCar(id, x, z, yaw);
    this.addParked(v);
    return v;
  }

  private addParked(v: Vehicle): void {
    v.controls.throttle = 0;
    v.controls.brake = 0;
    v.controls.steer = 0;
    v.controls.boost = false;
    v.controls.handbrake = true;
    const it = {
      id: `car-${v.group.id}`, x: 0, y: 0, z: 0, radius: 2.4, action: 'enterVehicle' as const,
      verb: 'Get in', object: `${v.def.make} ${v.def.model}`, priority: 0.2,
      when: () => this.mode === 'foot' && !v.airborne,
      run: () => this.beginEnter(v),
    };
    this.parked.set(v, { vehicle: v, remove: this.interactions.add(it) });
    this.placeDoorPrompt(v);
  }

  private placeDoorPrompt(v: Vehicle): void {
    const it = this.interactions.get(`car-${v.group.id}`);
    if (!it) return;
    // Offer the nearer door; the prompt sits where the player would stand.
    const p = this.player.position;
    v.toWorld(doorLocal(v.def, -1, _door), _door);
    v.toWorld(doorLocal(v.def, 1, _v), _v);
    const useRight = _v.distanceToSquared(p) < _door.distanceToSquared(p);
    const d = useRight ? _v : _door;
    it.x = d.x;
    it.y = d.y;
    it.z = d.z;
  }

  private takeWheel(v: Vehicle, side: -1 | 1): void {
    if (this.mode === 'entering') {
      const p = v.position;
      this.ctx.audio.sfx('doorClose', { x: p.x, y: p.y, z: p.z });
      this.ctx.audio.sfx('ignition', { x: p.x, y: p.y, z: p.z });
    }
    const parked = this.parked.get(v);
    if (parked) {
      parked.remove();
      this.parked.delete(v);
    }
    this.vehicle = v;
    this.side = side;
    v.controls.handbrake = false;
    this.mode = 'vehicle';
    this.ctx.input.setBaseContext('vehicle');
    this.engine?.dispose();
    this.engine = this.ctx.audio.engine(v.def.engine);
    this.engine.setPriority(true);
    this.ctx.audio.radio.setAudible(1, false);
    this.player.setEnabled(false);
    if (this.actor) {
      this.actor.posture = 'drive';
      v.group.add(this.actor.root);
      seatLocal(v.def, side, _seat);
      this.actor.root.position.copy(_seat);
      this.actor.root.rotation.set(0, 0, 0);
    }
    this.chase.snap();
  }

  private beginEnter(v: Vehicle): void {
    if (this.mode !== 'foot') return;
    const p = this.player.position;
    v.toWorld(doorLocal(v.def, -1, _door), _door);
    v.toWorld(doorLocal(v.def, 1, _v), _v);
    this.side = _v.distanceToSquared(p) < _door.distanceToSquared(p) ? 1 : -1;
    this.vehicle = v;
    this.mode = 'entering';
    this.transitionT = 0;
    this.exitFrom.copy(this.player.renderPos);
    this.player.setEnabled(false);
    this.interactions.clear();
    this.actor?.play(this.side < 0 ? 'enterVehicleL' : 'enterVehicleR');
    this.ctx.audio.sfx('doorOpen', { x: p.x, y: p.y, z: p.z });
    this.startBlend();
  }

  private beginExit(): void {
    const v = this.vehicle;
    if (!v || this.mode !== 'vehicle') return;
    this.bail = Math.abs(v.speed) > BAIL_SPEED;
    // Step out on the driver's side unless something is in the way.
    let side: -1 | 1 = this.side;
    for (const s of [this.side, -this.side as -1 | 1]) {
      v.toWorld(doorLocal(v.def, s, _door), _door);
      v.toWorld(seatLocal(v.def, s, _seat), _seat);
      _v.copy(_door).sub(_seat);
      const len = _v.length();
      _v.divideScalar(len);
      if (!this.ctx.physics.raycast(_seat.x, _seat.y + 0.5, _seat.z, _v.x, 0, _v.z, len + 0.2, Query.solid, v.rb).hit) {
        side = s;
        break;
      }
    }
    this.side = side;
    v.toWorld(seatLocal(v.def, side, this.exitFrom), this.exitFrom);
    v.toWorld(doorLocal(v.def, side, this.exitTo), this.exitTo);
    this.exitTo.y = this.ctx.physics.groundHeight(this.exitTo.x, this.exitTo.z, this.exitTo.y + 2.5, this.exitTo.y);
    this.mode = 'exiting';
    this.transitionT = 0;
    v.controls.throttle = 0;
    v.controls.brake = 0;
    v.controls.steer = 0;
    v.controls.boost = false;
    v.controls.handbrake = !this.bail;
    this.engine?.dispose();
    this.engine = null;
    this.ctx.audio.radio.setAudible(0, false);
    this.ctx.audio.sfx('doorOpen', { x: this.exitTo.x, y: this.exitTo.y, z: this.exitTo.z });
    if (this.actor) {
      // Back into world space for the walk out.
      this.ctx.gfx.scene.add(this.actor.root);
      this.actor.posture = 'stand';
      this.actor.play(this.bail ? 'knockdown' : side < 0 ? 'exitVehicleL' : 'exitVehicleR');
    }
    this.startBlend();
  }

  private finishExit(): void {
    const v = this.vehicle!;
    const yaw = v.yaw;
    this.player.teleport(this.exitTo.x, this.exitTo.y + 0.05, this.exitTo.z, yaw + (this.side < 0 ? Math.PI / 2 : -Math.PI / 2) * 0.35);
    this.player.setEnabled(true);
    if (this.bail) {
      const lv = v.rb.linvel();
      this.player.launch(lv.x * 0.45, 2.2, lv.z * 0.45);
      this.actor?.play('getUp');
      this.chase.kick(0.35);
    }
    this.addParked(v);
    if (this.bail) v.controls.handbrake = false;
    this.vehicle = null;
    this.mode = 'foot';
    this.ctx.input.setBaseContext('foot');
    this.footCam.snap(yaw);
  }

  // ── camera blend ───────────────────────────────────────────────────────────

  private startBlend(): void {
    const cam = this.ctx.gfx.camera;
    this.blendPos.copy(cam.position);
    this.blendQuat.copy(cam.quaternion);
    this.blendFov = cam.fov;
    this.blendT = 0;
  }

  private applyBlend(dt: number): void {
    if (this.blendT >= 1) return;
    this.blendT = Math.min(1, this.blendT + dt / BLEND_TIME);
    const k = smoothstep(0, 1, this.blendT);
    const cam = this.ctx.gfx.camera;
    cam.position.lerpVectors(this.blendPos, cam.position, k);
    _q.copy(this.blendQuat).slerp(cam.quaternion, k);
    cam.quaternion.copy(_q);
    const fov = this.blendFov + (cam.fov - this.blendFov) * k;
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
  }

  // ── loop ───────────────────────────────────────────────────────────────────

  fixed(dt: number): void {
    const input = this.ctx.input;
    const s = this.ctx.settings;
    for (const v of this.allVehicles()) {
      if (v === this.vehicle && this.mode === 'vehicle') {
        const c = v.controls;
        c.throttle = clamp(input.value('throttle'), 0, 1);
        c.brake = clamp(input.value('brake'), 0, 1);
        c.steer = clamp(input.value('steer'), -1, 1);
        c.handbrake = input.down('handbrake');
        c.boost = this.flow.canBoost(input.down('boost'));
        v.assists.traction = s.peek('game.assistTraction');
        v.assists.steering = s.peek('game.assistSteering');
        v.assists.countersteer = s.peek('game.assistCountersteer');
      }
      v.fixed(dt);
      if (v === this.vehicle && this.mode === 'vehicle') {
        this.flow.fixed(dt, v, input.down('boost'));
        for (const e of this.flow.events) this.flowEvents.push(e);
      }
    }

    if (this.mode === 'vehicle') {
      if (input.pressedFixed('exitVehicle') && this.actor) this.beginExit();
    } else if (this.mode === 'foot') {
      const it = this.intent;
      it.moveX = input.value('moveX');
      it.moveY = input.value('moveY');
      it.sprint = input.down('sprint');
      it.jump = input.pressedFixed('jump');
      if (input.pressedFixed('crouch')) this.crouchToggle = !this.crouchToggle;
      if (it.sprint || it.jump) this.crouchToggle = false;
      it.crouch = this.crouchToggle;
      it.cameraYaw = this.footCam.yaw;
      this.player.fixed(dt, it);
      const p = this.player.position;
      for (const v of this.parked.keys()) this.placeDoorPrompt(v);
      this.interactions.update(dt, p.x, p.y, p.z, this.player.yaw, input);
    } else {
      this.transitionT += dt;
      if (this.mode === 'entering' && this.transitionT >= ENTER_TIME) this.takeWheel(this.vehicle!, this.side);
      else if (this.mode === 'exiting' && this.transitionT >= EXIT_TIME) this.finishExit();
    }
  }

  postFixed(): void {
    for (const v of this.allVehicles()) v.afterStep();
    this.player.afterStep();
  }

  update(dt: number, alpha: number, dtReal: number): void {
    const ctx = this.ctx;
    const s = ctx.settings;
    this.world.update(dt);
    const night = smoothstep(0.25, 0.6, ctx.gfx.env.night) + ctx.gfx.env.storm * 0.8;
    for (const v of this.allVehicles()) {
      v.update(alpha, dt);
      v.setHeadlights(v === this.vehicle && this.mode === 'vehicle' ? night : 0);
    }
    this.player.update(alpha);
    ctx.input.look(this.look, dtReal, {
      mouseSensitivity: s.peek('controls.mouseSensitivity') / 100,
      padSensitivity: s.peek('controls.padSensitivity') / 100,
      invertY: s.peek('controls.invertY'),
    });
    const cam = ctx.gfx.camera;
    const baseFov = s.peek('gfx.fov');
    this.chase.baseFov = baseFov;
    this.chase.shakeScale = s.peek('a11y.screenShake') / 100;
    this.footCam.baseFov = baseFov - 6;

    if (this.mode === 'vehicle' || this.mode === 'entering') {
      if (this.mode === 'entering') this.animateEnter();
      this.chase.update(cam, this.vehicle!, dt, { lookX: this.look.x, lookY: this.look.y, lookBack: ctx.input.down('lookBack') });
    } else {
      if (this.mode === 'exiting') this.animateExit();
      const feet = this.mode === 'exiting' ? this.actor?.root.position ?? this.exitTo : this.player.renderPos;
      this.footCam.update(cam, feet, this.player.renderYaw, this.player.loco.speed, this.intent.sprint, this.player.crouch, dt, {
        lookX: this.look.x, lookY: this.look.y, recenter: ctx.input.pressed('recenter'),
      });
    }
    this.applyBlend(dtReal);

    if (this.actor) {
      if (this.mode === 'foot') {
        this.actor.root.position.copy(this.player.renderPos);
        this.actor.root.rotation.set(0, this.player.renderYaw, 0);
        Object.assign(this.actor.loco, this.player.loco);
      } else if (this.mode === 'vehicle' && this.vehicle) {
        this.actor.steer = this.vehicle.controls.steer * 0.9;
      }
      this.actor.update(dt, this.actor.root.getWorldPosition(_v).distanceTo(cam.position));
    }
    this.updateAudio();
    for (const e of this.flowEvents) this.onFlowEvent?.(e);
    this.flowEvents.length = 0;
  }

  private animateEnter(): void {
    const v = this.vehicle;
    if (!v || !this.actor) return;
    const k = clamp(this.transitionT / ENTER_TIME, 0, 1);
    v.group.updateMatrixWorld();
    doorLocal(v.def, this.side, _door).applyMatrix4(v.group.matrixWorld);
    seatLocal(v.def, this.side, _seat).applyMatrix4(v.group.matrixWorld);
    // Walk to the door, then swing into the seat.
    if (k < 0.45) _v.lerpVectors(this.exitFrom, _door, smoothstep(0, 0.45, k));
    else _v.lerpVectors(_door, _seat, smoothstep(0.45, 1, k));
    this.actor.root.position.copy(_v);
    this.actor.root.rotation.set(0, v.yaw + (k < 0.45 ? 0 : this.side * Math.PI * 0.5 * (1 - smoothstep(0.6, 1, k))), 0);
  }

  private animateExit(): void {
    if (!this.actor) return;
    const k = smoothstep(0, 1, clamp(this.transitionT / EXIT_TIME, 0, 1));
    _from.lerpVectors(this.exitFrom, this.exitTo, k);
    this.actor.root.position.copy(_from);
    this.actor.root.rotation.set(0, (this.vehicle?.yaw ?? 0) + this.side * Math.PI * 0.5 * (1 - k * 0.6), 0);
  }

  private updateAudio(): void {
    const { audio, input, gfx } = this.ctx;
    const env = gfx.env;
    const v = this.mode === 'vehicle' ? this.vehicle : null;
    const listener = v ? v.position : this.player.position;
    if (v) {
      const p = v.position;
      const f = this.frame;
      f.rpm = v.rpm;
      f.throttle = v.controls.throttle;
      f.load = clamp(v.controls.throttle * (1 - Math.abs(v.speed) / v.def.handling.topSpeed) + (v.controls.boost ? 0.3 : 0), 0, 1);
      f.speed = Math.abs(v.speed);
      f.slip = v.slip;
      f.x = p.x;
      f.y = p.y;
      f.z = p.z;
      this.engine?.update(f);
      this.skid?.set(v.airborne ? 0 : smoothstep(0.25, 0.8, v.slip) * smoothstep(4, 12, Math.abs(v.speed)), v.slip);
      this.skid?.setPosition(p.x, p.y, p.z);
      if (v.impact > 60000 && v.impact > this.lastImpact * 1.5) {
        audio.sfx(v.impact > 300000 ? 'impactHeavy' : 'impactLight', { x: p.x, y: p.y, z: p.z, intensity: clamp(v.impact / 600000, 0.2, 1) });
        this.chase.kick(clamp(v.impact / 900000, 0.05, 0.6));
      }
      this.lastImpact = v.impact;
      if (input.pressed('horn')) audio.sfx('horn', { x: p.x, y: p.y, z: p.z });
      if (input.pressed('radioNext')) audio.radio.next();
      if (input.pressed('radioPrev')) audio.radio.prev();
    } else {
      this.skid?.set(0, 0);
    }
    for (const e of this.flowEvents) {
      const p = listener;
      if (e === 'boostStart') audio.sfx('boost', { x: p.x, y: p.y, z: p.z });
      else if (e === 'full') audio.sfx('flowFull');
      else if (e === 'nearMiss') audio.sfx('crowdGasp', { x: p.x, y: p.y, z: p.z, intensity: 0.25 });
    }
    if (this.player.landing > 0) {
      const p = this.player.position;
      audio.sfx('land', { x: p.x, y: p.y, z: p.z, intensity: clamp(this.player.landing / 12, 0.2, 1) });
      this.player.landing = 0;
    }
    const hf = this.world.hf;
    audio.setAmbience({
      district: districtAt(listener.x, listener.z), hours: env.hours, rain: env.rain, storm: env.storm, wind: env.windStrength,
      indoor: 0, water: 1 - smoothstep(10, 140, Math.abs(hf.coastAt(listener.x, listener.z))), crowd: 0.25, traffic: 0.3,
    });
  }

  private *allVehicles(): IterableIterator<Vehicle> {
    if (this.vehicle) yield this.vehicle;
    for (const v of this.parked.keys()) if (v !== this.vehicle) yield v;
  }

  // ── harness ────────────────────────────────────────────────────────────────

  private installHarness(): void {
    extendHarness({
      vehicleState: () => {
        const v = this.vehicle;
        if (!v) return null;
        const p = v.position;
        const lv = v.rb.linvel();
        const r = v.rb.rotation();
        return {
          id: v.def.id, speed: v.speed, ground: Math.hypot(lv.x, lv.z), rpm: Math.round(v.rpm), gear: v.gear, drift: v.driftAngle, slip: v.slip,
          airborne: v.airborne, drifting: v.drifting, impact: Math.round(v.impact), flow: this.flow.value, boosting: this.flow.boosting, x: p.x, y: p.y, z: p.z, yaw: v.yaw,
          up: 1 - 2 * (r.x * r.x + r.z * r.z),
          wheels: v.wheels.map((w) => ({ contact: w.contact, comp: Math.round(w.compression * 1000) / 1000, load: Math.round(w.load) })),
        };
      },
      /** Replace the driven car (or take the wheel of a new one) at a pose. */
      spawnVehicle: (id: VehicleId, x: number, z: number, yaw: number, y?: number) => {
        if (this.vehicle) this.disposeVehicle(this.vehicle);
        this.vehicle = null;
        this.takeWheel(this.spawnCar(id, x, z, yaw, y), -1);
        return true;
      },
      parkVehicle: (id: VehicleId, x: number, z: number, yaw: number) => {
        this.park(id, x, z, yaw);
        return true;
      },
      setAssist: (name: 'traction' | 'steering' | 'countersteer', on: boolean) => {
        if (this.vehicle) this.vehicle.assists[name] = on;
      },
      flipVehicle: () => {
        const v = this.vehicle;
        if (!v) return;
        const p = v.position;
        v.rb.setTranslation({ x: p.x, y: p.y + 2, z: p.z }, true);
        v.rb.setRotation({ x: 1, y: 0, z: 0, w: 0 }, true);
      },
      /** Put the player on foot at a position (leaves any car where it is). */
      footSpawn: (x: number, z: number, yaw = 0) => {
        if (this.vehicle) {
          this.addParked(this.vehicle);
          this.vehicle = null;
        }
        this.engine?.dispose();
        this.engine = null;
        if (this.actor) this.ctx.gfx.scene.add(this.actor.root);
        const y = this.ctx.physics.groundHeight(x, z, 60, ROAD_Y) + 0.05;
        this.player.teleport(x, y, z, yaw);
        this.player.setEnabled(true);
        this.mode = 'foot';
        this.ctx.input.setBaseContext('foot');
        this.footCam.snap(yaw);
        return { x, y, z };
      },
      footState: () => {
        const p = this.player.position;
        const t = this.interactions.target;
        return {
          mode: this.mode, x: p.x, y: p.y, z: p.z, yaw: this.player.yaw, speed: this.player.loco.speed, grounded: this.player.grounded,
          vy: this.player.loco.vy, crouch: this.player.crouch, camDistance: this.footCam.currentDistance,
          prompt: this.interactions.prompt, target: t?.id ?? null,
        };
      },
      setCameraYaw: (yaw: number, pitch?: number) => this.footCam.snap(yaw, pitch),
      /** Leave the car now, even without a visible body (QA of the transition). */
      exitVehicle: () => {
        this.beginExit();
        return this.mode;
      },
      groundAt: (x: number, z: number) => this.ctx.physics.groundHeight(x, z, 80, -99),
    });
  }

  private disposeVehicle(v: Vehicle): void {
    const parked = this.parked.get(v);
    if (parked) {
      parked.remove();
      this.parked.delete(v);
    }
    if (this.actor && this.actor.root.parent === v.group) this.ctx.gfx.scene.add(this.actor.root);
    this.ctx.gfx.scene.remove(v.group);
    v.dispose(this.ctx.kit);
  }

  debugState(): Record<string, unknown> {
    return { stage: 'play', mode: this.mode, vehicle: this.vehicle?.def.id ?? null, parked: this.parked.size, world: this.world.stats };
  }

  dispose(): void {
    this.engine?.dispose();
    this.skid?.stop(0.2);
    this.ctx.audio.radio.setAudible(0, false);
    for (const v of [...this.allVehicles()]) this.disposeVehicle(v);
    this.player.dispose();
    this.actor?.dispose();
    this.characters?.dispose();
    this.world.dispose();
  }
}
