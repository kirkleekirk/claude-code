import type { Result, Vec2 } from '@/core/types';
import type { SaveMeta, SlotId } from '@/save';

/**
 * Everything the interface may ask the game to do. The UI never reaches into world or mode state
 * directly: it calls these, and reads results from signals. Empire changes go through `sim.cmd`.
 */

export type Difficulty = 'chill' | 'classic' | 'sweaty';

export interface NewGameOptions {
  /** One of the six preset looks, 0–5. */
  look: number;
  /** Outfit palette for the chosen look, 0–3. */
  palette: number;
  difficulty: Difficulty;
}

export type TravelError = 'locked' | 'heat' | 'mission' | 'unavailable';

export interface GameActions {
  // ── session ────────────────────────────────────────────────────────────────
  newGame(options: NewGameOptions): void;
  /** Load the most recent save. */
  continueGame(): void;
  loadSlot(slot: SlotId): void;
  saveSlot(slot: SlotId): Result<SaveMeta, 'quota' | 'verify' | 'unsafe'>;
  deleteSlot(slot: SlotId): void;
  /** Offer the slot as a downloadable `.hothouse` file. */
  exportSlot(slot: SlotId): void;
  importSave(text: string, slot: SlotId): Result<SaveMeta, string>;
  quitToMenu(): void;
  /** Browsers cannot close themselves: leaves fullscreen and shows the goodbye card. */
  quitGame(): void;

  // ── flow ───────────────────────────────────────────────────────────────────
  pause(): void;
  resume(): void;
  /** Restart the current mission checkpoint, or respawn after a bust. */
  retry(): void;
  skipCutscene(): void;
  setFullscreen(on: boolean): void;

  // ── navigation and time ────────────────────────────────────────────────────
  /** Route the GPS to a point, a POI id, or clear it with null. */
  setWaypoint(target: Vec2 | string | null): void;
  fastTravel(propertyId: string): Result<void, TravelError>;
  /** Have a crew driver bring a vehicle to the nearest road. */
  callVehicle(vehicleId: string): Result<void, TravelError>;
  /** Ride with the chauffeur to a POI or property. */
  chauffeurTo(target: string): Result<void, TravelError>;
  /** Skip time until the clock shows `hours` (0–24); produces a Shift Report. */
  waitUntil(hours: number): Result<void, TravelError>;

  // ── modes ──────────────────────────────────────────────────────────────────
  enterPhotoMode(): void;
  enterBuildMode(): Result<void, 'notInProperty'>;
  /** Re-run the hardware benchmark and apply the suggested preset. */
  runBenchmark(): Promise<string>;
}
