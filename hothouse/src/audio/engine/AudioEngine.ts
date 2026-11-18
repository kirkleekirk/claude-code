import { signal } from '@preact/signals-core';
import { log } from '@/core/log';
import { Ambience } from '../ambience/ambience';
import type {
  AmbienceContext, AudioApi, AudioStats, BusId, EngineProfile, EngineVoice, LoopHandle, LoopSound, Sfx, SfxOptions, UiSound, VoiceProfile,
} from '../api';
import { Radio } from '../music/radio';
import { Score } from '../music/score';
import { playBlip } from '../synth/blip';
import { makeDest, withOut } from '../synth/kit';
import { playSfxRecipe, SFX_BASE_DB, SFX_FLAT, SFX_INFO, SFX_TRIM_DB } from '../synth/sfx';
import { playUi, UI_BASE_DB, UI_TRIM_DB } from '../synth/ui';
import type { ListenerState } from '../synth/engineVoice';
import { clamp01f, clampf, dbToGain, fin } from '../util/params';
import { LazyEngine, LazyLoop, makePanner, type HandleHost } from './handles';
import { Mixer } from './mixer';
import { VoiceManager } from './voices';

export interface AudioOptions {
  /** Keep everything silent and cheap (headless runs, `?mute=1`). */
  muted?: boolean;
  /** Station playlist seed. */
  seed?: number;
}

type CtxCtor = new (opts?: AudioContextOptions) => AudioContext;

const SCHEDULE_INTERVAL_MS = 40;
const GESTURES = ['pointerdown', 'keydown', 'touchend', 'mousedown'] as const;

/**
 * The audio engine. Safe to construct at any time: no `AudioContext` exists until `unlock()`
 * (call it from the click-to-start gesture). Until then every call is a cheap no-op, except that
 * loop and engine handles remember their state and come alive after unlock.
 */
export class AudioEngine implements AudioApi, HandleHost {
  readonly unlocked = signal(false);
  readonly radio: Radio;
  readonly score: Score;
  readonly listener: ListenerState = { x: 0, y: 0, z: 0 };

  private _ctx: BaseAudioContext | null = null;
  private realCtx: AudioContext | null = null;
  private mixer: Mixer | null = null;
  private readonly ambience = new Ambience();
  private readonly voices = new VoiceManager();
  private readonly loops = new Set<LazyLoop>();
  private readonly engines = new Set<LazyEngine>();
  private readonly volumes: Record<BusId, number> = { master: 0.8, music: 0.7, sfx: 0.85, ambience: 0.7, ui: 0.7, barks: 0.8 };
  private readonly muted: boolean;
  private timeScale = 1;
  private suspendedByUser = false;
  private disposed = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private gestureArmed = false;
  private unlocking: Promise<void> | null = null;
  private fwd = { x: 0, y: 0, z: -1 };
  private detuneSeed = 1;
  private failed = false;
  /** Rendering into an OfflineAudioContext (QA): no wall-clock timers. */
  private offline = false;

  constructor(options: AudioOptions = {}) {
    this.muted = !!options.muted;
    this.radio = new Radio(options.seed ?? 0);
    this.score = new Score();
  }

  get ctx(): BaseAudioContext | null {
    return this._ctx;
  }

  // ── lifecycle ──────────────────────────────────────────────────────────────

  unlock(): Promise<void> {
    if (this.muted || this.disposed || this.failed) return Promise.resolve();
    if (this.realCtx) return this.resumeContext();
    if (this.unlocking) return this.unlocking;
    const g = globalThis as unknown as { AudioContext?: CtxCtor; webkitAudioContext?: CtxCtor };
    const Ctor = g.AudioContext ?? g.webkitAudioContext;
    if (!Ctor) {
      this.failed = true;
      log.info('audio', 'Web Audio is not available; continuing silently');
      return Promise.resolve();
    }
    let ctx: AudioContext;
    try {
      ctx = new Ctor({ latencyHint: 'interactive' });
    } catch (err) {
      this.failed = true;
      log.warn('audio', `could not create an audio context: ${String(err)}`);
      return Promise.resolve();
    }
    this.realCtx = ctx;
    this.build(ctx, ctx.destination);
    ctx.onstatechange = () => this.onState();
    if (typeof setInterval !== 'undefined') this.timer = setInterval(() => this.schedule(), SCHEDULE_INTERVAL_MS);
    this.unlocking = this.resumeContext().finally(() => {
      this.unlocking = null;
    });
    return this.unlocking;
  }

  /**
   * Build the full graph on any context. `unlock()` uses the real one; QA builds on an
   * `OfflineAudioContext` to render and measure sounds.
   */
  build(ctx: BaseAudioContext, destination: AudioNode): void {
    this._ctx = ctx;
    this.offline = typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext;
    const mixer = new Mixer(ctx, destination);
    this.mixer = mixer;
    for (const bus of Object.keys(this.volumes) as BusId[]) mixer.setVolume(bus, this.volumes[bus]);
    mixer.setTimeScale(this.timeScale);
    this.radio.attach({ ctx, music: mixer.input.music, hall: mixer.hallSend });
    this.score.attach({ ctx, music: mixer.input.music, hall: mixer.hallSend, duck: (a, s) => mixer.duck('music', a, s) });
    this.ambience.attach(ctx, mixer.input.ambience);
    mixer.setIndoor(this.ambience.indoor);
  }

  update(dt: number): void {
    if (this.disposed) return;
    const mixer = this.mixer;
    const ctx = this._ctx;
    if (!mixer || !ctx) {
      // No sound yet, but the radio's "now playing" card still follows the timeline.
      this.radio.update();
      return;
    }
    const now = ctx.currentTime;
    mixer.update(now);
    this.voices.prune(now);
    this.schedule();
    this.ambience.update(fin(dt, 0));
    for (const l of this.loops) l.tick();
    for (const e of this.engines) e.tick();
  }

  suspend(): void {
    this.suspendedByUser = true;
    const ctx = this.realCtx;
    if (ctx && ctx.state === 'running') ctx.suspend().catch(() => undefined);
  }

  resume(): void {
    this.suspendedByUser = false;
    void this.resumeContext();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.disarmGesture();
    for (const l of [...this.loops]) l.stop(0.01);
    for (const e of [...this.engines]) e.dispose();
    const ctx = this._ctx;
    if (ctx) this.voices.stopAll(ctx.currentTime);
    this.radio.dispose();
    this.score.dispose();
    this.ambience.dispose();
    this.mixer?.dispose();
    this.mixer = null;
    this._ctx = null;
    const real = this.realCtx;
    this.realCtx = null;
    if (real && real.state !== 'closed') real.close().catch(() => undefined);
    this.unlocked.value = false;
  }

  stats(): AudioStats {
    const real = this.realCtx;
    const state: AudioStats['state'] = this.muted
      ? 'muted'
      : this.failed
        ? 'unavailable'
        : !real
          ? 'locked'
          : real.state === 'running'
            ? 'running'
            : real.state === 'closed'
              ? 'closed'
              : 'suspended';
    return {
      state,
      voices: this.voices.active,
      loops: this.loops.size,
      engines: this.engines.size,
      latency: real ? fin((real.outputLatency ?? 0) + (real.baseLatency ?? 0), 0) : 0,
    };
  }

  // ── listener and mix ───────────────────────────────────────────────────────

  setListener(px: number, py: number, pz: number, fx: number, fy: number, fz: number): void {
    const l = this.listener;
    l.x = fin(px, l.x);
    l.y = fin(py, l.y);
    l.z = fin(pz, l.z);
    const len = Math.hypot(fin(fx), fin(fy), fin(fz));
    if (len > 1e-4) this.fwd = { x: fx / len, y: fy / len, z: fz / len };
    const ctx = this._ctx;
    if (!ctx) return;
    const L = ctx.listener;
    const t = ctx.currentTime;
    if (L.positionX) {
      L.positionX.setTargetAtTime(l.x, t, 0.015);
      L.positionY.setTargetAtTime(l.y, t, 0.015);
      L.positionZ.setTargetAtTime(l.z, t, 0.015);
      L.forwardX.setTargetAtTime(this.fwd.x, t, 0.015);
      L.forwardY.setTargetAtTime(this.fwd.y, t, 0.015);
      L.forwardZ.setTargetAtTime(this.fwd.z, t, 0.015);
      L.upX.value = 0;
      L.upY.value = 1;
      L.upZ.value = 0;
    } else {
      L.setPosition(l.x, l.y, l.z);
      L.setOrientation(this.fwd.x, this.fwd.y, this.fwd.z, 0, 1, 0);
    }
  }

  setVolume(bus: BusId, volume: number): void {
    this.volumes[bus] = clamp01f(volume, 0.8);
    this.mixer?.setVolume(bus, this.volumes[bus]);
  }

  duck(bus: BusId, amount: number, seconds: number): void {
    this.mixer?.duck(bus, amount, seconds);
  }

  setTimeScale(scale: number): void {
    this.timeScale = clampf(scale, 0.05, 1, 1);
    this.mixer?.setTimeScale(this.timeScale);
  }

  setAmbience(c: AmbienceContext): void {
    this.ambience.set(c);
    this.mixer?.setIndoor(clamp01f(c.indoor));
  }

  // ── sounds ─────────────────────────────────────────────────────────────────

  ui(sound: UiSound): void {
    const ctx = this._ctx;
    const mixer = this.mixer;
    if (!ctx || !mixer || this.muted) return;
    const t = ctx.currentTime + 0.003;
    if (!this.voices.admit(`ui:${sound}`, t, 3)) return;
    try {
      const vg = ctx.createGain();
      vg.gain.value = dbToGain(UI_BASE_DB + (UI_TRIM_DB[sound] ?? 0));
      vg.connect(mixer.input.ui);
      // Reverb sends tap the recipe before the voice gain, so they get the same trim.
      const send = ctx.createGain();
      send.gain.value = vg.gain.value;
      send.connect(mixer.hallSend);
      const end = playUi(makeDest(ctx, vg, send), sound, t);
      this.track(`ui:${sound}`, vg, t, end, send);
    } catch (err) {
      log.warn('audio', `ui sound ${sound} failed: ${String(err)}`);
    }
  }

  sfx(sound: Sfx, opts: SfxOptions = {}): void {
    const ctx = this._ctx;
    const mixer = this.mixer;
    if (!ctx || !mixer || this.muted) return;
    const info = SFX_INFO[sound];
    if (!info) return;
    const t = ctx.currentTime + 0.003;
    if (!this.voices.admit(sound, t, info.limit)) return;
    try {
      const vg = ctx.createGain();
      vg.gain.value = clampf(opts.volume ?? 1, 0, 4, 1) * dbToGain(SFX_BASE_DB + (SFX_TRIM_DB[sound] ?? 0));
      const bus = opts.bus && opts.bus !== 'master' ? mixer.input[opts.bus] : mixer.input.sfx;
      let room = info.room;
      let panner: PannerNode | null = null;
      const positioned = opts.x !== undefined && opts.z !== undefined && !SFX_FLAT.has(sound);
      if (positioned) {
        const x = fin(opts.x!), y = fin(opts.y ?? this.listener.y), z = fin(opts.z!);
        const dist = Math.hypot(x - this.listener.x, y - this.listener.y, z - this.listener.z);
        panner = makePanner(ctx, info.ref, dist < 30);
        if (panner.positionX) {
          panner.positionX.setValueAtTime(x, t);
          panner.positionY.setValueAtTime(y, t);
          panner.positionZ.setValueAtTime(z, t);
        } else {
          panner.setPosition(x, y, z);
        }
        vg.connect(panner).connect(bus);
        room += Math.min(0.3, dist / 200);
      } else {
        vg.connect(bus);
      }
      const roomSend = ctx.createGain();
      roomSend.gain.value = room;
      vg.connect(roomSend).connect(mixer.roomSend);
      const pitch = clampf(opts.pitch ?? 1, 0.25, 4, 1) * mixer.pitchScale * (1 + (this.rand() - 0.5) * 0.05);
      const d = withOut(makeDest(ctx, vg), vg, pitch);
      const end = playSfxRecipe(d, sound, t, clamp01f(opts.intensity ?? 0.5, 0.5), opts.surface ?? 'asphalt');
      this.track(sound, vg, t, end, roomSend, panner);
    } catch (err) {
      log.warn('audio', `sfx ${sound} failed: ${String(err)}`);
    }
  }

  loop(sound: LoopSound, opts: SfxOptions = {}): LoopHandle {
    const bus = opts.bus === 'ambience' || opts.bus === 'music' || opts.bus === 'ui' || opts.bus === 'barks' ? opts.bus : 'sfx';
    const h = new LazyLoop(this, sound, bus, clampf(opts.volume ?? 1, 0, 4, 1));
    if (opts.x !== undefined && opts.z !== undefined) h.setPosition(opts.x, opts.y ?? 0, opts.z);
    if (!this.disposed) this.loops.add(h);
    return h;
  }

  engine(profile: EngineProfile): EngineVoice {
    const h = new LazyEngine(this, profile);
    if (!this.disposed) this.engines.add(h);
    return h;
  }

  blip(voice: VoiceProfile, emphasis = 0): void {
    const ctx = this._ctx;
    const mixer = this.mixer;
    if (!ctx || !mixer || this.muted) return;
    const t = ctx.currentTime + 0.003;
    if (!this.voices.admit('blip', t, 2)) return;
    try {
      playBlip(ctx, mixer.input.barks, voice, emphasis, t);
      mixer.duck('music', 0.22, 0.25);
    } catch (err) {
      log.warn('audio', `blip failed: ${String(err)}`);
    }
  }

  // ── HandleHost ─────────────────────────────────────────────────────────────

  busFor(name: 'sfx' | 'ambience' | 'music' | 'ui' | 'barks'): AudioNode | null {
    return this.mixer ? this.mixer.input[name] : null;
  }

  release(handle: LazyLoop | LazyEngine): void {
    if (handle instanceof LazyLoop) this.loops.delete(handle);
    else this.engines.delete(handle);
  }

  // ── internals ──────────────────────────────────────────────────────────────

  /** Music scheduling; also driven by a timer so long frames never starve the lookahead. */
  private schedule(): void {
    if (this.disposed) return;
    try {
      this.radio.update();
      this.score.update();
    } catch (err) {
      log.warn('audio', `music scheduling failed: ${String(err)}`);
    }
  }

  private track(id: string, vg: GainNode, t: number, end: number, extra?: AudioNode, extra2?: AudioNode | null): void {
    const ctx = this._ctx!;
    const stopAt = Math.max(t + 0.05, fin(end, t + 1)) + 0.3;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      vg.disconnect();
      extra?.disconnect();
      extra2?.disconnect();
    };
    const timers = !this.offline && typeof setTimeout !== 'undefined';
    this.voices.add({
      id, start: t, end: stopAt,
      stop: (at) => {
        vg.gain.setTargetAtTime(0, at, 0.015);
        if (timers) setTimeout(release, 200);
      },
    });
    if (timers) setTimeout(release, Math.max(0, (stopAt - ctx.currentTime) * 1000) + 600);
  }

  private async resumeContext(): Promise<void> {
    const ctx = this.realCtx;
    if (!ctx || ctx.state === 'closed') return;
    if (ctx.state !== 'running') {
      try {
        await ctx.resume();
      } catch {
        // Resume can be refused outside a gesture; the gesture listener retries.
      }
    }
    this.onState();
    if (ctx.state === 'running') this.radio.resync();
  }

  private onState(): void {
    const ctx = this.realCtx;
    if (!ctx) return;
    const running = ctx.state === 'running';
    if (this.unlocked.peek() !== running) this.unlocked.value = running;
    if (!running && !this.suspendedByUser && ctx.state !== 'closed') this.armGesture();
    else this.disarmGesture();
  }

  private readonly onGesture = (): void => {
    if (this.suspendedByUser) return;
    void this.resumeContext();
  };

  private armGesture(): void {
    if (this.gestureArmed || typeof addEventListener === 'undefined') return;
    this.gestureArmed = true;
    for (const g of GESTURES) addEventListener(g, this.onGesture, { capture: true, passive: true });
  }

  private disarmGesture(): void {
    if (!this.gestureArmed || typeof removeEventListener === 'undefined') return;
    this.gestureArmed = false;
    for (const g of GESTURES) removeEventListener(g, this.onGesture, { capture: true });
  }

  private rand(): number {
    this.detuneSeed = (Math.imul(this.detuneSeed, 1664525) + 1013904223) >>> 0;
    return this.detuneSeed / 4294967296;
  }
}
