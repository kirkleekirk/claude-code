import { EventBus } from '@/core/events';
import { flags } from '@/core/flags';
import { GameLoop } from '@/core/loop';
import { log } from '@/core/log';
import { LookDevStage } from '@/debug/LookDevStage';
import { PeopleStage } from '@/debug/PeopleStage';
import { PipelineStage } from '@/debug/PipelineStage';
import { installHarness } from '@/debug/harness';
import { TimeSlicer } from '@/core/slicer';
import { World } from '@/world/World';
import { Input } from '@/input';
import { PhysicsWorld } from '@/physics';
import { Gfx, GfxUnsupportedError, MaterialKit, isQualityTier, profileForTier, profileFromSettings, webgl2Supported } from '@/render';
import { LocalStore, SaveManager, Settings } from '@/save';
import { showFallback } from './fallback';
import { Game } from './Game';
import { showSplash } from './splash';
import { createAudio } from '@/audio';
import type { BusId } from '@/audio/api';
import { DriveStage } from './DriveStage';

const isDev = import.meta.env.DEV;

/** Route uncaught errors into the log (QA reads it) instead of the console. */
function installErrorHandlers(): void {
  addEventListener('error', (e) => {
    log.error('uncaught', e.message || 'error', e.error);
    if (!isDev && !flags.debug) e.preventDefault();
  });
  addEventListener('unhandledrejection', (e) => {
    log.error('uncaught', 'unhandled rejection', e.reason);
    if (!isDev && !flags.debug) e.preventDefault();
  });
}

export async function boot(): Promise<void> {
  log.setEcho(isDev || flags.debug);
  installErrorHandlers();

  const canvas = document.getElementById('game') as HTMLCanvasElement | null;
  if (!canvas || !webgl2Supported()) {
    showFallback('webgl');
    return;
  }
  const splash = showSplash();

  const store = new LocalStore();
  const settings = new Settings(store);
  const saves = new SaveManager(store);
  const input = new Input();
  input.attach(canvas);
  const bus = new EventBus();

  const quality = isQualityTier(flags.gfx) ? profileForTier(flags.gfx) : profileFromSettings(settings);
  let gfx: Gfx;
  try {
    gfx = new Gfx(canvas, quality);
  } catch (err) {
    if (!(err instanceof GfxUnsupportedError)) log.error('boot', 'renderer creation failed', err);
    showFallback('webgl');
    return;
  }
  const physics = await PhysicsWorld.create();
  const kit = new MaterialKit(gfx.shared);
  const audio = createAudio({ muted: flags.mute });
  // The browser lets audio start only after a gesture; the first click or key unlocks it.
  const unlock = () => void audio.unlock();
  addEventListener('pointerdown', unlock, { once: true });
  addEventListener('keydown', unlock, { once: true });
  const buses: Array<[BusId, 'audio.master' | 'audio.music' | 'audio.sfx' | 'audio.ambience' | 'audio.ui' | 'audio.barks']> = [
    ['master', 'audio.master'], ['music', 'audio.music'], ['sfx', 'audio.sfx'], ['ambience', 'audio.ambience'], ['ui', 'audio.ui'], ['barks', 'audio.barks'],
  ];
  for (const [bus, id] of buses) settings.watch(id, (v) => audio.setVolume(bus, v / 100));
  const game = new Game({ gfx, kit, physics, input, settings, saves, bus, flags, audio });

  const harness = flags.test || flags.debug || isDev ? installHarness(game) : null;
  if (flags.debug || isDev) {
    const { mountTuningPanel } = await import('@/debug/TuningPanel');
    mountTuningPanel(game);
  }

  if (flags.sandbox === 'pipeline') {
    game.setStage(new PipelineStage(game.ctx));
  } else {
    const slicer = new TimeSlicer(14);
    const world = await World.build({ gfx, kit, physics, slicer, progress: (f, label) => splash.set(f * 0.92, label) });
    game.setStage(flags.sandbox === 'lookdev' ? new LookDevStage(game.ctx, world) : flags.sandbox === 'people' ? new PeopleStage(game.ctx, world) : new DriveStage(game.ctx, world));
  }

  const loop = new GameLoop(game);
  game.loop = loop;
  loop.onFatal = () => showFallback('crash');
  gfx.onContextLost = () => loop.stop();
  gfx.onContextRestored = () => {
    loop.resetTiming();
    loop.start();
  };

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      loop.stop();
      input.releaseAll();
      settings.flush();
      if (settings.peek('audio.muteOnBlur')) audio.suspend();
    } else {
      loop.resetTiming();
      loop.start();
      audio.resume();
    }
  });
  addEventListener('pagehide', () => settings.flush());

  splash.set(0.96, 'Warming up the neon');
  await gfx.prewarm();
  loop.start();
  splash.set(1, 'Ready');
  splash.remove();
  if (harness) harness.ready = true;
}
