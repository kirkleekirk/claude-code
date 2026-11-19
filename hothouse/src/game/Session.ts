import type { CharacterFactory } from '@/characters/api';
import { PLAYER_LOOKS, type Appearance } from '@/content/appearance';
import { DISTRICTS } from '@/content/places';
import { clockHours, dayTFromHours } from '@/core/clock';
import { log } from '@/core/log';
import { done, fail, type Result, type Vec2 } from '@/core/types';
import { applyPreset, profileForTier, type QualityTier } from '@/render';
import type { SaveMeta, SlotId } from '@/save';
import { createSim, loadSim, simSaveMeta, type Sim, type SimState, type SimWorldInput } from '@/sim';
import type { UiApi } from '@/ui/api';
import type { VehicleId } from '@/vehicles/defs';
import { districtAt } from '@/world/plan/districts';
import type { World } from '@/world/World';
import type { GameActions, NewGameOptions, TravelError } from './actions';
import type { Game, GameSystem } from './Game';
import { HudBridge } from './HudBridge';
import { MenuStage } from './MenuStage';
import { PlayStage } from './PlayStage';

/** World-side state that goes into a save next to the sim. */
interface WorldSave {
  appearance: Appearance;
  player: { x: number; y: number; z: number; yaw: number };
  vehicle: { id: VehicleId; x: number; z: number; yaw: number } | null;
  flow: number;
  weather: string;
  day: number;
  hours: number;
}

/** Sim ticks are batched: the economy does not need 60 Hz. */
const SIM_STEP = 0.5;
const AUTOSAVE_SECONDS = 180;

/**
 * The game session: the front end, starting, saving and loading games, the sim tick, the HUD
 * bridge, and every `GameActions` call the interface makes. One instance lives for the page.
 */
export class Session implements GameActions, GameSystem {
  sim: Sim | null = null;
  play: PlayStage | null = null;
  /** Seconds of play in this save. */
  playtime = 0;
  waypoint: Vec2 | string | null = null;
  /**
   * Show the title card when play starts. Automated runs turn it off: the card holds a cutscene
   * input context and the UI caps its timers at 0.1 s per update, so large manual steps barely
   * advance it.
   */
  titleCards = true;
  private ui: UiApi | null = null;
  private hud: HudBridge | null = null;
  private simAcc = 0;
  private autosaveAcc = 0;
  private readonly simWorld: SimWorldInput = {
    day: 1, hours: 18.7, weather: 'clear', district: null, place: null, insideProperty: null, streetHeat: 0, inVehicle: false, busy: false,
  };

  private world: World | null = null;

  constructor(private readonly game: Game, private readonly characters: CharacterFactory | null) {}

  /** The city, once it has been built behind the loading screen. */
  attachWorld(world: World): void {
    this.world = world;
  }

  private requireWorld(): World {
    if (!this.world) throw new Error('session used before the world was built');
    return this.world;
  }

  attachUi(ui: UiApi): void {
    this.ui = ui;
    this.hud = new HudBridge(ui, this.game);
  }

  /** Show the attract camera behind the main menu. */
  enterMenu(): void {
    this.play = null;
    this.sim = null;
    this.game.setStage(new MenuStage(this.game.ctx, this.requireWorld()));
    this.game.ctx.input.setBaseContext('menu');
    if (this.ui) {
      this.ui.hud.visible.value = false;
      this.ui.showFrontend('mainMenu');
    }
  }

  // ── GameSystem ─────────────────────────────────────────────────────────────

  fixed(dt: number): void {
    const sim = this.sim, play = this.play;
    if (!sim || !play) return;
    this.simAcc += dt;
    if (this.simAcc < SIM_STEP) return;
    const step = this.simAcc;
    this.simAcc = 0;
    const w = this.simWorld;
    const game = this.game;
    w.day = game.clock.day;
    w.hours = clockHours(game.clock);
    w.weather = game.weather;
    const p = play.mode === 'vehicle' && play.vehicle ? play.vehicle.position : play.player.position;
    w.district = districtAt(p.x, p.z);
    w.inVehicle = play.mode === 'vehicle';
    w.busy = play.mode === 'entering' || play.mode === 'exiting';
    try {
      sim.tick(step, w);
    } catch (err) {
      log.error('sim', 'tick failed', err);
    }
  }

  update(dt: number, _alpha: number, dtReal: number): void {
    const ui = this.ui;
    if (!ui) return;
    // Menus that pause the world stop the clock; the phone slows it.
    const loop = this.game.loop;
    if (loop) loop.timeScale = ui.pausesWorld.value ? 0 : ui.top.value === 'phone' ? 0.2 : 1;
    if (this.play && dt > 0) {
      this.playtime += dt;
      this.autosaveAcc += dt;
      if (this.autosaveAcc > AUTOSAVE_SECONDS && this.play.mode !== 'entering' && this.play.mode !== 'exiting') {
        this.autosaveAcc = 0;
        const res = this.saveSlot('auto');
        if (!res.ok) log.warn('save', `autosave skipped: ${res.error}`);
      }
    }
    this.hud?.update(dtReal, this.play, this.sim);
  }

  // ── session ────────────────────────────────────────────────────────────────

  newGame(options: NewGameOptions): void {
    const look = PLAYER_LOOKS[options.look] ?? PLAYER_LOOKS[0]!;
    const appearance: Appearance = { ...look.base, outfit: look.outfits[options.palette] ?? look.outfits[0] };
    const seed = (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0;
    this.sim = createSim({ seed, difficulty: options.difficulty, bus: this.game.ctx.bus });
    this.game.setTime(18 + 40 / 60);
    this.game.clock.day = 1;
    this.game.setWeather('clear');
    this.playtime = 0;
    this.startPlay(appearance, null);
  }

  continueGame(): void {
    const latest = this.game.ctx.saves.latest();
    if (latest) this.loadSlot(latest.slot);
  }

  loadSlot(slot: SlotId): void {
    const res = this.game.ctx.saves.read<SimState, WorldSave>(slot);
    if (!res.ok) {
      this.ui?.toast({ kind: 'danger', title: 'That save could not be read', body: res.error === 'newer' ? 'It was made by a newer version.' : 'The file is damaged.' });
      return;
    }
    const { data, recovered } = res.value;
    this.sim = loadSim(data.sim, this.game.ctx.bus);
    const w = data.world;
    this.game.clock.day = w.day;
    this.game.setTime(w.hours);
    this.game.setWeather(isWeather(w.weather) ? w.weather : 'clear');
    this.playtime = data.meta.playtime;
    this.startPlay(w.appearance, w);
    if (recovered) this.ui?.toast({ kind: 'warning', title: 'Loaded the backup copy', body: 'The newest save was damaged.' });
  }

  saveSlot(slot: SlotId): Result<SaveMeta, 'quota' | 'verify' | 'unsafe'> {
    const sim = this.sim, play = this.play;
    if (!sim || !play || play.mode === 'entering' || play.mode === 'exiting') return fail('unsafe');
    const v = play.mode === 'vehicle' ? play.vehicle : null;
    const p = play.player.position;
    const world: WorldSave = {
      appearance: play.appearance,
      player: { x: p.x, y: p.y, z: p.z, yaw: play.player.yaw },
      vehicle: v ? { id: v.def.id as VehicleId, x: v.position.x, z: v.position.z, yaw: v.yaw } : null,
      flow: play.flow.value,
      weather: this.game.weather,
      day: this.game.clock.day,
      hours: clockHours(this.game.clock),
    };
    const at = v ? v.position : p;
    const meta = {
      ...simSaveMeta(sim, Math.round(this.playtime)),
      day: this.game.clock.day,
      clockHours: clockHours(this.game.clock),
      location: DISTRICTS[districtAt(at.x, at.z)].name,
      thumb: this.game.ctx.gfx.thumbnail(192, 108),
      savedAt: Date.now(),
    };
    return this.game.ctx.saves.write(slot, meta, sim.serialize(), world);
  }

  deleteSlot(slot: SlotId): void {
    this.game.ctx.saves.remove(slot);
  }

  exportSlot(slot: SlotId): void {
    const res = this.game.ctx.saves.exportText(slot);
    if (!res.ok) {
      this.ui?.toast({ kind: 'danger', title: 'Nothing to export in that slot' });
      return;
    }
    const blob = new Blob([res.value], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hothouse-${slot === 'auto' ? 'autosave' : `slot-${slot}`}.hothouse`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  importSave(text: string, slot: SlotId): Result<SaveMeta, string> {
    return this.game.ctx.saves.importText(text, slot);
  }

  quitToMenu(): void {
    if (this.play) {
      const res = this.saveSlot('auto');
      if (!res.ok) log.warn('save', `autosave on quit skipped: ${res.error}`);
    }
    this.enterMenu();
  }

  quitGame(): void {
    if (this.play) this.saveSlot('auto');
    this.setFullscreen(false);
    this.ui?.showFrontend('goodbye');
  }

  // ── flow ───────────────────────────────────────────────────────────────────

  pause(): void {
    this.ui?.openPause();
  }

  resume(): void {
    this.ui?.closePause();
  }

  retry(): void {
    // Respawn on foot at the last safe spot: beside the car if there is one.
    const play = this.play;
    if (!play) return;
    play.respawn();
  }

  skipCutscene(): void {
    this.ui?.closeAll();
  }

  setFullscreen(on: boolean): void {
    const doc = document;
    if (on && !doc.fullscreenElement) void doc.documentElement.requestFullscreen?.().catch(() => undefined);
    if (!on && doc.fullscreenElement) void doc.exitFullscreen?.().catch(() => undefined);
  }

  // ── navigation and time ────────────────────────────────────────────────────

  setWaypoint(target: Vec2 | string | null): void {
    this.waypoint = target;
  }

  fastTravel(propertyId: string): Result<void, TravelError> {
    const sim = this.sim;
    if (!sim || !this.play) return fail('unavailable');
    const owned = (sim.state.properties as Record<string, { owned?: boolean } | undefined>)[propertyId];
    if (!owned?.owned) return fail('locked');
    return fail('unavailable');
  }

  callVehicle(_vehicleId: string): Result<void, TravelError> {
    return this.sim && this.play ? fail('locked') : fail('unavailable');
  }

  chauffeurTo(_target: string): Result<void, TravelError> {
    return this.sim && this.play ? fail('locked') : fail('unavailable');
  }

  waitUntil(hours: number): Result<void, TravelError> {
    const sim = this.sim;
    if (!sim || !this.play) return fail('unavailable');
    if (this.play.mode !== 'foot') return fail('unavailable');
    const report = sim.waitUntil(hours);
    if (report.seconds <= 0) return fail('mission');
    this.game.clock.day = sim.state.clock.day;
    this.game.clock.t = dayTFromHours(sim.state.clock.hours);
    this.game.setTime(sim.state.clock.hours);
    return done;
  }

  // ── modes ──────────────────────────────────────────────────────────────────

  enterPhotoMode(): void {
    this.ui?.toast({ kind: 'info', title: 'Photo Mode', body: 'Coming online with the camera crew.' });
  }

  enterBuildMode(): Result<void, 'notInProperty'> {
    return fail('notInProperty');
  }

  /** Time a short run of frames and apply the preset the hardware can hold at 60 fps. */
  async runBenchmark(): Promise<string> {
    const gfx = this.game.ctx.gfx;
    const tiers: QualityTier[] = ['ultra', 'high', 'medium', 'low'];
    const original = gfx.quality;
    let chosen: QualityTier = 'low';
    for (const tier of tiers) {
      gfx.applyQuality(profileForTier(tier));
      const ms = await timeFrames(gfx, 24);
      if (ms < 14.5) {
        chosen = tier;
        break;
      }
    }
    gfx.applyQuality(original);
    if (chosen !== 'potato') applyPreset(this.game.ctx.settings, chosen);
    return chosen;
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private startPlay(appearance: Appearance, restore: WorldSave | null): void {
    const play = new PlayStage(this.game.ctx, this.requireWorld(), this.characters, appearance);
    this.game.setStage(play);
    this.play = play;
    this.simAcc = 0;
    this.autosaveAcc = 0;
    if (restore) play.restore(restore.player, restore.vehicle, restore.flow);
    this.hud?.bind(play);
    const ui = this.ui;
    if (ui) {
      ui.showFrontend('none');
      ui.hud.visible.value = true;
      const hours = clockHours(this.game.clock);
      const h12 = ((Math.floor(hours) + 11) % 12) + 1;
      const mins = String(Math.floor((hours % 1) * 60)).padStart(2, '0');
      if (this.titleCards) void ui.titleCard({ title: 'Halcyon Bay', subtitle: `Day ${this.game.clock.day} · ${h12}:${mins} ${hours < 12 ? 'AM' : 'PM'}` });
    }
  }
}

function isWeather(w: string): w is 'clear' | 'hazy' | 'overcast' | 'rain' | 'storm' | 'hurricane' {
  return ['clear', 'hazy', 'overcast', 'rain', 'storm', 'hurricane'].includes(w);
}

/** Mean frame time (ms) of `n` synchronous renders. */
async function timeFrames(gfx: { render(dt: number): void }, n: number): Promise<number> {
  gfx.render(0);
  await new Promise((r) => requestAnimationFrame(r));
  const t0 = performance.now();
  for (let i = 0; i < n; i++) gfx.render(1 / 60);
  return (performance.now() - t0) / n;
}
