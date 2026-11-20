import { log } from './log';

/**
 * Fixed-timestep loop with interpolated rendering.
 *
 * - `fixed(dt)` runs at exactly `fixedDt` (60 Hz) zero or more times per frame.
 * - `update(dt, alpha)` runs once per frame with the scaled frame time and the interpolation
 *   factor between the previous and current fixed states.
 * - `render(dt)` draws.
 *
 * `timeScale` slows or freezes the world (phone, pause) while `frame(dtReal)` still fires so UI
 * and cameras stay alive. In manual mode (tests) nothing advances until `advance()` is called.
 */

export interface LoopCallbacks {
  /** Start of frame, real (unscaled) seconds. Input sampling goes here. */
  beginFrame(dtReal: number): void;
  fixed(dt: number): void;
  update(dt: number, alpha: number, dtReal: number): void;
  render(dtReal: number): void;
  endFrame(): void;
}

export interface LoopStats {
  /** Recent frame durations in ms (ring buffer, newest last after `snapshot`). */
  frameMs: number[];
  fixedMs: number;
  updateMs: number;
  renderMs: number;
  stepsLastFrame: number;
  droppedSeconds: number;
  frames: number;
}

const HISTORY = 240;

export class GameLoop {
  readonly fixedDt = 1 / 60;
  /** Catch-up limit; beyond this, time is dropped rather than spiralling. */
  maxSteps = 4;
  timeScale = 1;
  /** When true the loop is driven only by `advance()`. */
  manual = false;
  /** Total fixed steps run. */
  tick = 0;
  /** Total simulated seconds (fixed steps × fixedDt). */
  time = 0;
  /** Total real seconds of frames observed. */
  realTime = 0;

  private accumulator = 0;
  private last: number | null = null;
  private raf = 0;
  private running = false;
  private readonly history = new Float32Array(HISTORY);
  private historyIndex = 0;
  private fixedMs = 0;
  private updateMs = 0;
  private renderMs = 0;
  private steps = 0;
  private dropped = 0;
  private frames = 0;
  private consecutiveErrors = 0;
  /** Called once if the loop stops itself after repeated exceptions. */
  onFatal: ((err: unknown) => void) | null = null;

  constructor(private readonly cb: LoopCallbacks) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = null;
    this.raf = requestAnimationFrame(this.onFrame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  /** Forget elapsed time (after a tab switch or a long synchronous load). */
  resetTiming(): void {
    this.last = null;
    this.accumulator = 0;
  }

  /**
   * Deterministically run `seconds` of simulation (tests and time-lapse captures). Runs whole fixed
   * steps, then one update and optionally one render.
   */
  advance(seconds: number, render = true): void {
    const steps = Math.max(0, Math.round(seconds / this.fixedDt));
    this.cb.beginFrame(seconds);
    for (let i = 0; i < steps; i++) this.step();
    this.cb.update(steps * this.fixedDt, 1, seconds);
    if (render) this.cb.render(seconds);
    this.cb.endFrame();
  }

  stats(): LoopStats {
    const frameMs: number[] = [];
    for (let i = 0; i < HISTORY; i++) {
      const v = this.history[(this.historyIndex + i) % HISTORY]!;
      if (v > 0) frameMs.push(v);
    }
    return {
      frameMs,
      fixedMs: this.fixedMs,
      updateMs: this.updateMs,
      renderMs: this.renderMs,
      stepsLastFrame: this.steps,
      droppedSeconds: this.dropped,
      frames: this.frames,
    };
  }

  private step(): void {
    this.cb.fixed(this.fixedDt);
    this.tick++;
    this.time += this.fixedDt;
  }

  private readonly onFrame = (now: number): void => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.onFrame);
    // Harness-driven runs own the clock and the renderer (`advance` and `capture` render on demand);
    // idle frames would only compete with them for the main thread.
    if (this.manual) {
      this.last = null;
      return;
    }
    const dtReal = this.last === null ? this.fixedDt : Math.min((now - this.last) / 1000, 0.25);
    if (this.last !== null) {
      this.history[this.historyIndex] = now - this.last;
      this.historyIndex = (this.historyIndex + 1) % HISTORY;
    }
    this.last = now;
    this.realTime += dtReal;
    this.frames++;

    try {
      this.cb.beginFrame(dtReal);
      let steps = 0;
      const t0 = performance.now();
      this.accumulator += dtReal * this.timeScale;
      while (this.accumulator >= this.fixedDt && steps < this.maxSteps) {
        this.step();
        this.accumulator -= this.fixedDt;
        steps++;
      }
      if (this.accumulator >= this.fixedDt) {
        this.dropped += this.accumulator;
        this.accumulator = 0;
      }
      const t1 = performance.now();
      this.cb.update(dtReal * this.timeScale, this.accumulator / this.fixedDt, dtReal);
      const t2 = performance.now();
      this.cb.render(dtReal);
      const t3 = performance.now();
      this.cb.endFrame();
      this.steps = steps;
      // Light smoothing so the perf overlay is readable.
      this.fixedMs += (t1 - t0 - this.fixedMs) * 0.1;
      this.updateMs += (t2 - t1 - this.updateMs) * 0.1;
      this.renderMs += (t3 - t2 - this.renderMs) * 0.1;
      this.consecutiveErrors = 0;
    } catch (err) {
      this.consecutiveErrors++;
      log.error('loop', 'frame failed', err);
      if (this.consecutiveErrors >= 30) {
        this.stop();
        this.onFatal?.(err);
      }
    }
  };
}
