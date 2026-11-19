import { Vector3 } from 'three';
import { advanceClock, clockHours, createClock, dayTFromHours, type ClockState } from '@/core/clock';
import type { EventBus } from '@/core/events';
import type { Flags } from '@/core/flags';
import type { GameLoop, LoopCallbacks } from '@/core/loop';
import type { AudioApi } from '@/audio/api';
import type { Input } from '@/input';
import type { PhysicsWorld } from '@/physics';
import type { Gfx, MaterialKit } from '@/render';
import { setWeather, type WeatherId } from '@/render/env/weatherPresets';
import type { SaveManager, Settings } from '@/save';

/** Systems every part of the game may use. Created once at boot. */
export interface GameContext {
  readonly gfx: Gfx;
  readonly kit: MaterialKit;
  readonly physics: PhysicsWorld;
  readonly input: Input;
  readonly settings: Settings;
  readonly saves: SaveManager;
  readonly bus: EventBus;
  readonly flags: Flags;
  readonly audio: AudioApi;
}

/** A self-contained slice of runtime behaviour (the world in play, a sandbox, the front end). */
export interface Stage {
  /** Fixed 60 Hz step: physics-driven movement and gameplay logic (before the physics step). */
  fixed(dt: number): void;
  /** After the physics step: capture transforms for interpolation, read contacts. */
  postFixed?(dt: number): void;
  /** Once per frame: interpolation, animation, cameras, effects. `dt` is scaled game time. */
  update(dt: number, alpha: number, dtReal: number): void;
  /** Serializable snapshot for the test harness. */
  debugState?(): Record<string, unknown>;
  dispose(): void;
}

/** A long-lived system ticked alongside the stage (the session, the sim bridge, the HUD bridge). */
export interface GameSystem {
  /** After the stage's fixed step and the physics step. */
  fixed?(dt: number): void;
  /** After the stage's update, before rendering. */
  update?(dt: number, alpha: number, dtReal: number): void;
}

export interface CameraPin {
  position: Vector3;
  target: Vector3;
  fov: number;
}

/**
 * The composition root at runtime: owns the clock, the active stage, and the per-frame order of
 * operations. It implements the loop callbacks so `GameLoop` drives everything through here.
 */
export class Game implements LoopCallbacks {
  readonly clock: ClockState;
  /** When false the clock holds still (menus, cinematics, the pinned prologue). */
  clockRunning = true;
  stage: Stage | null = null;
  /** Harness or photo-mode camera override, applied after the stage positions the camera. */
  cameraPin: CameraPin | null = null;
  loop: GameLoop | null = null;
  weather: WeatherId = 'clear';
  readonly systems: GameSystem[] = [];

  constructor(readonly ctx: GameContext) {
    this.clock = createClock(ctx.flags.time ?? 18 + 40 / 60);
    ctx.gfx.environment.setTime(clockHours(this.clock));
    if (ctx.flags.weather) this.setWeather(ctx.flags.weather as WeatherId);
  }

  setStage(stage: Stage | null): void {
    this.stage?.dispose();
    this.stage = stage;
  }

  setTime(hours: number): void {
    this.clock.t = dayTFromHours(hours);
    this.ctx.gfx.environment.setTime(hours);
  }

  setWeather(id: WeatherId): void {
    this.weather = id;
    setWeather(this.ctx.gfx.environment.weather, id);
  }

  // ── loop callbacks ─────────────────────────────────────────────────────────

  beginFrame(dtReal: number): void {
    this.ctx.input.beginFrame(dtReal);
  }

  fixed(dt: number): void {
    this.stage?.fixed(dt);
    this.ctx.physics.step(dt);
    this.stage?.postFixed?.(dt);
    for (const s of this.systems) s.fixed?.(dt);
    if (this.clockRunning) advanceClock(this.clock, dt);
    this.ctx.input.endFixedStep();
  }

  update(dt: number, alpha: number, dtReal: number): void {
    const gfx = this.ctx.gfx;
    gfx.environment.setTime(clockHours(this.clock));
    this.stage?.update(dt, alpha, dtReal);
    for (const s of this.systems) s.update?.(dt, alpha, dtReal);
    const pin = this.cameraPin;
    if (pin) {
      const cam = gfx.camera;
      cam.position.copy(pin.position);
      cam.lookAt(pin.target);
      if (cam.fov !== pin.fov) {
        cam.fov = pin.fov;
        cam.updateProjectionMatrix();
      }
    }
    gfx.camera.updateMatrixWorld();
    gfx.update(dt);
    const cam = gfx.camera;
    const e = cam.matrixWorld.elements;
    this.ctx.audio.setListener(cam.position.x, cam.position.y, cam.position.z, -e[8]!, -e[9]!, -e[10]!);
    this.ctx.audio.update(dtReal);
  }

  render(): void {
    this.ctx.gfx.render(0);
  }

  endFrame(): void {
    this.ctx.input.endFrame();
  }
}
