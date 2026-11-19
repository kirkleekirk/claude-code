import { Vector3 } from 'three';
import { clockHours } from '@/core/clock';
import { log } from '@/core/log';
import type { ActionId } from '@/input';
import { isWeatherId, WEATHER_IDS, type WeatherId } from '@/render/env/weatherPresets';
import type { Game } from '@/game/Game';

/**
 * The QA and automation surface, installed as `window.__HOTHOUSE__` in dev builds and with
 * `?test=1` / `?debug=1`. Playwright scripts drive the game exclusively through this object.
 * Systems register extra commands with `extend()` as they come online.
 */
export interface Harness {
  ready: boolean;
  /** Build identifier, for screenshot provenance. */
  build: string;
  setTime(hours: number): void;
  setWeather(id: WeatherId): void;
  setCamera(pos: [number, number, number], look: [number, number, number], fov?: number): void;
  releaseCamera(): void;
  /**
   * Switch to deterministic stepping and advance the simulation by `seconds`. With `render` false the
   * frame is updated but not drawn (physics-only measurements); `screenshot` always draws.
   */
  advance(seconds: number, render?: boolean): void;
  /** Return to real-time running. */
  realtime(): void;
  /** Force an action value (null releases it). */
  input(action: ActionId, value: number | null): void;
  /** Render a frame and return a PNG data URL. */
  screenshot(name?: string): string;
  perfSnapshot(): PerfSnapshot;
  getState(): Record<string, unknown>;
  /** Additional commands registered by systems (spawn, teleport, grantCash…). */
  [command: string]: unknown;
}

export interface PerfSnapshot {
  frames: number;
  /** Mean, 95th and 99th percentile and max frame time over the recent history, ms. */
  frameMs: { mean: number; p95: number; p99: number; max: number };
  cpuMs: { fixed: number; update: number; render: number };
  render: ReturnType<Game['ctx']['gfx']['stats']>;
  heapMB: number | null;
  droppedSeconds: number;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]!;
}

export function installHarness(game: Game): Harness {
  const gfx = game.ctx.gfx;
  const shots = new Map<string, string>();
  const h: Harness = {
    ready: false,
    build: __BUILD_TIME__,
    setTime(hours) {
      game.setTime(hours);
    },
    setWeather(id) {
      if (!isWeatherId(id)) throw new Error(`unknown weather "${String(id)}"; expected one of ${WEATHER_IDS.join(', ')}`);
      game.setWeather(id);
    },
    setCamera(pos, look, fov = gfx.camera.fov) {
      game.cameraPin = { position: new Vector3(...pos), target: new Vector3(...look), fov };
    },
    releaseCamera() {
      game.cameraPin = null;
    },
    advance(seconds, render = true) {
      const loop = game.loop;
      if (!loop) throw new Error('loop not started');
      loop.manual = true;
      // Step in one-second chunks so long advances keep rendering cost bounded.
      let left = Math.max(0, seconds);
      while (left > 0) {
        const chunk = Math.min(1, left);
        loop.advance(chunk, render && left - chunk <= 0);
        left -= chunk;
      }
    },
    realtime() {
      if (game.loop) {
        game.loop.manual = false;
        game.loop.resetTiming();
      }
    },
    input(action, value) {
      game.ctx.input.inject(action, value);
    },
    screenshot(name) {
      const url = gfx.capture('image/png');
      if (name) shots.set(name, url);
      return url;
    },
    perfSnapshot() {
      const s = game.loop?.stats();
      const sorted = [...(s?.frameMs ?? [])].sort((a, b) => a - b);
      const mean = sorted.length ? sorted.reduce((a, b) => a + b, 0) / sorted.length : 0;
      const mem = (performance as { memory?: { usedJSHeapSize: number } }).memory;
      return {
        frames: s?.frames ?? 0,
        frameMs: { mean, p95: percentile(sorted, 0.95), p99: percentile(sorted, 0.99), max: sorted[sorted.length - 1] ?? 0 },
        cpuMs: { fixed: s?.fixedMs ?? 0, update: s?.updateMs ?? 0, render: s?.renderMs ?? 0 },
        render: gfx.stats(),
        heapMB: mem ? Math.round((mem.usedJSHeapSize / 1048576) * 10) / 10 : null,
        droppedSeconds: s?.droppedSeconds ?? 0,
      };
    },
    getState() {
      const cam = gfx.camera.position;
      return {
        clock: { day: game.clock.day, hours: Math.round(clockHours(game.clock) * 100) / 100 },
        weather: game.weather,
        camera: { x: cam.x, y: cam.y, z: cam.z, fov: gfx.camera.fov },
        quality: gfx.quality.tier,
        problems: log.problems().map((e) => `${e.level} [${e.tag}] ${e.message}${e.count > 1 ? ` ×${e.count}` : ''}`),
        stage: game.stage?.debugState?.() ?? null,
      };
    },
  };
  (globalThis as unknown as { __HOTHOUSE__: Harness }).__HOTHOUSE__ = h;
  return h;
}

/** Register additional harness commands from any system. No-op when the harness is not installed. */
export function extendHarness(commands: Record<string, unknown>): void {
  const h = (globalThis as unknown as { __HOTHOUSE__?: Harness }).__HOTHOUSE__;
  if (h) Object.assign(h, commands);
}
