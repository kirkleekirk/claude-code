import { EventBus } from '@/core/events';
import { flags } from '@/core/flags';
import { GameLoop } from '@/core/loop';
import { log } from '@/core/log';
import { LookDevStage } from '@/debug/LookDevStage';
import { PipelineStage } from '@/debug/PipelineStage';
import { installHarness } from '@/debug/harness';
import { TimeSlicer } from '@/core/slicer';
import { World } from '@/world/World';
import { Input } from '@/input';
import { PhysicsWorld } from '@/physics';
import { Gfx, GfxUnsupportedError, MaterialKit, applyPreset, isQualityTier, profileForTier, profileFromSettings, webgl2Supported } from '@/render';
import { LocalStore, SaveManager, Settings } from '@/save';
import { showFallback } from './fallback';
import { Game } from './Game';
import { showSplash } from './splash';
import { createAudio } from '@/audio';
import type { BusId } from '@/audio/api';
import { MenuStage } from './MenuStage';
import { Session } from './Session';
import { createUi } from '@/ui';
import { openPhotoStore } from '@/save/photos';

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

  // Graphics settings apply live (the forced `?gfx=` tier wins).
  if (!isQualityTier(flags.gfx)) {
    let dirty = false;
    for (const id of GFX_SETTINGS) settings.watch(id, () => (dirty = true));
    game.systems.push({
      update: () => {
        if (!dirty) return;
        dirty = false;
        gfx.applyQuality(profileFromSettings(settings));
      },
    });
  }

  // The pipeline sandbox has no world and no interface.
  if (flags.sandbox === 'pipeline') {
    game.setStage(new PipelineStage(game.ctx));
    splash.set(1, 'Ready');
    await gfx.prewarm();
    loop.start();
    splash.remove();
    if (harness) harness.ready = true;
    return;
  }

  // The interface mounts first so the loading screen is the real one.
  const session = new Session(game, null);
  const photos = await openPhotoStore();
  const uiRoot = document.getElementById('ui');
  if (!uiRoot) throw new Error('missing #ui root');
  const ui = createUi(uiRoot, {
    input, settings, saves, actions: session, sound: audio, blip: (voice, emphasis) => audio.blip(voice, emphasis), photos,
    applyGraphicsPreset: (preset) => applyPreset(settings, preset),
    onUserGesture: () => void audio.unlock(),
    version: __BUILD_TIME__,
  });
  session.attachUi(ui);
  game.systems.push(session, { update: (_dt, _alpha, dtReal) => ui.update(dtReal) });
  splash.remove();
  ui.showFrontend('clickToStart');
  ui.setLoading(0.02, 'Waking up the bay');

  const slicer = new TimeSlicer(14);
  const world = await World.build({ gfx, kit, physics, slicer, progress: (f, label) => ui.setLoading(0.02 + f * 0.9, label) });
  session.attachWorld(world);
  game.setStage(new MenuStage(game.ctx, world));
  ui.setLoading(0.95, 'Warming up the neon');
  await gfx.prewarm();
  loop.start();
  ui.setLoading(1, 'Ready');

  if (flags.sandbox === 'lookdev') {
    game.setStage(new LookDevStage(game.ctx, world));
    ui.showFrontend('none');
    if (harness) harness.ready = true;
    return;
  }
  // Automated runs go straight into play unless they are testing the front end itself.
  if (flags.test && flags.raw.get('frontend') !== '1') {
    session.titleCards = false;
    session.newGame({ look: 0, palette: 0, difficulty: 'classic' });
    if (harness) harness.ready = true;
    return;
  }
  if (harness) harness.ready = true;
  await ui.waitForStart();
  session.enterMenu();
}

const GFX_SETTINGS = [
  'gfx.resolutionScale', 'gfx.shadows', 'gfx.reflections', 'gfx.ambientOcclusion', 'gfx.effects', 'gfx.drawDistance',
  'gfx.motionBlur', 'gfx.lensEffects', 'gfx.filmGrain',
] as const;
