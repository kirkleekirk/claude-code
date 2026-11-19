import { Vector2 } from 'three';
import type { EngineFrame, EngineVoice, LoopHandle, StationId } from '@/audio/api';
import { smoothstep as ss } from '@/core/math';
import { districtAt } from '@/world/plan/districts';
import { clamp, smoothstep } from '@/core/math';
import { extendHarness } from '@/debug/harness';
import { ChaseCamera } from '@/vehicles/ChaseCamera';
import { VEHICLES, type VehicleId } from '@/vehicles/defs';
import { Vehicle } from '@/vehicles/Vehicle';
import { ROAD_Y } from '@/world/roads/RoadMesher';
import type { World } from '@/world/World';
import type { GameContext, Stage } from './Game';

const _look = new Vector2();

/**
 * Free driving in the city: the feel slice. One player vehicle, the chase camera and the world.
 * Later stages layer on-foot play, traffic and the empire on top of the same pieces.
 */
export class DriveStage implements Stage {
  vehicle: Vehicle;
  readonly cam: ChaseCamera;
  private readonly look = { x: 0, y: 0 };
  private engine: EngineVoice | null = null;
  private skid: LoopHandle | null = null;
  private readonly frame: EngineFrame = { rpm: 800, throttle: 0, load: 0, speed: 0, slip: 0, surface: 'asphalt', interior: false, x: 0, y: 0, z: 0 };
  private lastImpact = 0;

  constructor(private readonly ctx: GameContext, private readonly world: World) {
    this.cam = new ChaseCamera(ctx.physics);
    this.vehicle = this.spawn('palmera', -768, 210, 0);
    ctx.input.setBaseContext('vehicle');
    const station = ctx.settings.peek('audio.defaultStation');
    ctx.audio.radio.setStation(station === 'off' ? null : (station as StationId));
    ctx.audio.score.setMood('silent');
    extendHarness({
      vehicleState: () => {
        const v = this.vehicle;
        const p = v.position;
        return {
          id: v.def.id, speed: v.speed, rpm: Math.round(v.rpm), gear: v.gear, drift: v.driftAngle, slip: v.slip,
          airborne: v.airborne, x: p.x, y: p.y, z: p.z, yaw: v.yaw,
          up: (() => {
            const r = v.rb.rotation();
            return 1 - 2 * (r.x * r.x + r.z * r.z);
          })(),
          wheels: v.wheels.map((w) => ({ contact: w.contact, comp: Math.round(w.compression * 1000) / 1000, load: Math.round(w.load) })),
        };
      },
      spawnVehicle: (id: VehicleId, x: number, z: number, yaw: number, y?: number) => {
        this.vehicle.dispose(this.ctx.kit);
        this.ctx.gfx.scene.remove(this.vehicle.group);
        this.vehicle = this.spawn(id, x, z, yaw, y);
        this.cam.snap();
        return true;
      },
      setAssist: (name: 'traction' | 'steering' | 'countersteer', on: boolean) => {
        this.vehicle.assists[name] = on;
      },
      flipVehicle: () => {
        const p = this.vehicle.position;
        this.vehicle.rb.setTranslation({ x: p.x, y: p.y + 2, z: p.z }, true);
        this.vehicle.rb.setRotation({ x: 1, y: 0, z: 0, w: 0 }, true);
      },
    });
  }

  private spawn(id: VehicleId, x: number, z: number, yaw: number, y?: number): Vehicle {
    const def = VEHICLES[id]!;
    const v = new Vehicle(this.ctx.physics, this.ctx.kit, def, { x, y: y ?? ROAD_Y + 0.4, z, yaw }, def.paints[0]!);
    this.ctx.gfx.scene.add(v.group);
    this.engine?.dispose();
    this.engine = this.ctx.audio.engine(def.engine);
    this.engine.setPriority(true);
    this.skid ??= this.ctx.audio.loop('skid');
    return v;
  }

  fixed(dt: number): void {
    const input = this.ctx.input;
    const c = this.vehicle.controls;
    c.throttle = clamp(input.value('throttle'), 0, 1);
    c.brake = clamp(input.value('brake'), 0, 1);
    c.steer = clamp(input.value('steer'), -1, 1);
    c.handbrake = input.down('handbrake');
    c.boost = input.down('boost');
    const s = this.ctx.settings;
    this.vehicle.assists.traction = s.peek('game.assistTraction');
    this.vehicle.assists.steering = s.peek('game.assistSteering');
    this.vehicle.assists.countersteer = s.peek('game.assistCountersteer');
    this.vehicle.fixed(dt);
  }

  postFixed(): void {
    this.vehicle.afterStep();
  }

  update(dt: number, alpha: number, dtReal: number): void {
    const ctx = this.ctx;
    this.world.update(dt);
    this.vehicle.update(alpha, dt);
    this.vehicle.setHeadlights(smoothstep(0.25, 0.6, ctx.gfx.env.night) + ctx.gfx.env.storm * 0.8);
    const s = ctx.settings;
    ctx.input.look(this.look, dtReal, {
      mouseSensitivity: s.peek('controls.mouseSensitivity') / 100,
      padSensitivity: s.peek('controls.padSensitivity') / 100,
      invertY: s.peek('controls.invertY'),
    });
    _look.set(this.look.x, this.look.y);
    this.cam.baseFov = s.peek('gfx.fov');
    this.cam.shakeScale = s.peek('a11y.screenShake') / 100;
    this.cam.update(ctx.gfx.camera, this.vehicle, dt, { lookX: _look.x, lookY: _look.y, lookBack: ctx.input.down('lookBack') });
    this.updateAudio(dtReal);
  }

  private updateAudio(dtReal: number): void {
    const { audio, input, gfx } = this.ctx;
    const v = this.vehicle;
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
    this.skid?.set(v.airborne ? 0 : ss(0.25, 0.8, v.slip) * ss(4, 12, Math.abs(v.speed)), v.slip);
    this.skid?.setPosition(p.x, p.y, p.z);
    if (v.impact > 60000 && v.impact > this.lastImpact * 1.5) {
      audio.sfx(v.impact > 300000 ? 'impactHeavy' : 'impactLight', { x: p.x, y: p.y, z: p.z, intensity: clamp(v.impact / 600000, 0.2, 1) });
    }
    this.lastImpact = v.impact;
    if (input.pressed('horn')) audio.sfx('horn', { x: p.x, y: p.y, z: p.z });
    if (input.pressed('radioNext')) audio.radio.next();
    if (input.pressed('radioPrev')) audio.radio.prev();
    audio.radio.setAudible(1, true);
    const env = gfx.env;
    const hf = this.world.hf;
    audio.setAmbience({
      district: districtAt(p.x, p.z), hours: env.hours, rain: env.rain, storm: env.storm, wind: env.windStrength, indoor: 0,
      water: 1 - ss(10, 140, Math.abs(hf.coastAt(p.x, p.z))), crowd: 0.25, traffic: 0.3,
    });
    void dtReal;
  }

  debugState(): Record<string, unknown> {
    return { stage: 'drive', vehicle: this.vehicle.def.id, speed: this.vehicle.speed, world: this.world.stats };
  }

  dispose(): void {
    this.engine?.dispose();
    this.skid?.stop(0.2);
    this.ctx.audio.radio.setAudible(0, false);
    this.vehicle.dispose(this.ctx.kit);
    this.world.dispose();
  }
}
