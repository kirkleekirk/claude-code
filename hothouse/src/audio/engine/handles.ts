import type { EngineFrame, EngineProfile, EngineVoice, LoopHandle, LoopSound } from '../api';
import { LOOP_BUILDERS, LOOP_REF, type LoopVoice } from '../synth/loops';
import { SynthEngineVoice, type ListenerState } from '../synth/engineVoice';
import { buffers } from './buffers';
import { clamp01f, clampf, fin, glide } from '../util/params';

/**
 * Handles the game holds for sustained sounds. They are valid before the audio context exists:
 * state is recorded and the real nodes are built on the first update after unlock.
 */

export interface HandleHost {
  readonly ctx: BaseAudioContext | null;
  readonly listener: ListenerState;
  busFor(name: 'sfx' | 'ambience' | 'music' | 'ui' | 'barks'): AudioNode | null;
  release(handle: LazyLoop | LazyEngine): void;
}

/** Loops whose pitch should follow relative motion (Doppler). */
const DOPPLER: ReadonlySet<LoopSound> = new Set<LoopSound>(['siren', 'helicopter', 'airboatFan', 'alarm']);

export class LazyLoop implements LoopHandle {
  private level = 0;
  private param = 0;
  private x = 0;
  private y = 0;
  private z = 0;
  private positioned = false;
  private stopped = false;
  private voice: LoopVoice | null = null;
  private panner: PannerNode | null = null;
  private lastDist = -1;
  private lastT = 0;

  constructor(
    private readonly host: HandleHost,
    readonly sound: LoopSound,
    private readonly bus: 'sfx' | 'ambience' | 'music' | 'ui' | 'barks',
    private readonly volume: number,
  ) {}

  get alive(): boolean {
    return !this.stopped;
  }

  set(level: number, param?: number): void {
    if (this.stopped) return;
    this.level = clamp01f(level);
    if (param !== undefined) this.param = clamp01f(param);
    const ctx = this.host.ctx;
    if (this.voice && ctx) this.voice.set(this.level * this.volume, this.param, ctx.currentTime);
  }

  setPosition(x: number, y: number, z: number): void {
    this.x = fin(x);
    this.y = fin(y);
    this.z = fin(z);
    this.positioned = true;
    const ctx = this.host.ctx;
    if (this.panner && ctx) setPannerPosition(this.panner, this.x, this.y, this.z, ctx.currentTime);
  }

  stop(fadeSeconds = 0.3): void {
    if (this.stopped) return;
    this.stopped = true;
    const ctx = this.host.ctx;
    if (this.voice && ctx) {
      const fade = clampf(fadeSeconds, 0.01, 10, 0.3);
      const t = ctx.currentTime;
      glide(this.voice.output.gain, 0, t, fade / 4);
      this.voice.stop(t + fade + 0.05);
      const panner = this.panner;
      if (panner && typeof setTimeout !== 'undefined') setTimeout(() => panner.disconnect(), (fade + 0.5) * 1000);
    }
    this.voice = null;
    this.host.release(this);
  }

  /** Build nodes when possible; apply Doppler. Called every frame by the engine. */
  tick(): void {
    const ctx = this.host.ctx;
    if (this.stopped || !ctx) return;
    if (!this.voice) {
      if (this.level <= 0.001) return;
      const out = this.host.busFor(this.bus);
      if (!out) return;
      this.voice = LOOP_BUILDERS[this.sound](ctx, buffers(ctx));
      if (this.positioned) {
        this.panner = makePanner(ctx, LOOP_REF[this.sound], true);
        setPannerPosition(this.panner, this.x, this.y, this.z, ctx.currentTime);
        this.voice.output.connect(this.panner).connect(out);
      } else {
        this.voice.output.connect(out);
      }
      this.voice.set(this.level * this.volume, this.param, ctx.currentTime);
    }
    if (this.positioned && DOPPLER.has(this.sound)) {
      const l = this.host.listener;
      const dist = Math.hypot(this.x - l.x, this.y - l.y, this.z - l.z);
      const t = ctx.currentTime;
      const dt = t - this.lastT;
      if (this.lastDist >= 0 && dt > 0.01) {
        const v = clampf((dist - this.lastDist) / dt, -100, 100, 0);
        this.voice.setDetune(1200 * Math.log2(343 / (343 + v)), t);
      }
      this.lastDist = dist;
      this.lastT = t;
    }
  }
}

export class LazyEngine implements EngineVoice {
  private frame: EngineFrame | null = null;
  private isPlayer = false;
  private real: SynthEngineVoice | null = null;
  private disposed = false;

  constructor(private readonly host: HandleHost, private readonly profile: EngineProfile) {}

  get alive(): boolean {
    return !this.disposed;
  }

  update(frame: EngineFrame): void {
    if (this.disposed) return;
    this.frame = frame;
    this.real?.update(frame);
  }

  setPriority(isPlayer: boolean): void {
    this.isPlayer = isPlayer;
    this.real?.setPriority(isPlayer);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.real?.dispose();
    this.real = null;
    this.host.release(this);
  }

  tick(): void {
    const ctx = this.host.ctx;
    if (this.disposed || this.real || !ctx || !this.frame) return;
    const out = this.host.busFor('sfx');
    if (!out) return;
    this.real = new SynthEngineVoice(ctx, this.profile, out, this.host.listener, this.isPlayer);
    this.real.update(this.frame);
  }
}

export function makePanner(ctx: BaseAudioContext, ref: number, hrtf: boolean): PannerNode {
  const p = ctx.createPanner();
  p.panningModel = hrtf ? 'HRTF' : 'equalpower';
  p.distanceModel = 'inverse';
  p.refDistance = Math.max(0.5, ref);
  p.rolloffFactor = 1.1;
  p.maxDistance = 2000;
  return p;
}

export function setPannerPosition(p: PannerNode, x: number, y: number, z: number, t: number): void {
  if (p.positionX) {
    glide(p.positionX, x, t, 0.02);
    glide(p.positionY, y, t, 0.02);
    glide(p.positionZ, z, t, 0.02);
  } else {
    p.setPosition(x, y, z);
  }
}
