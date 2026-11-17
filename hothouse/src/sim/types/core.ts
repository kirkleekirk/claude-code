import type { AdditiveId } from '@/content/additives';
import type { PropertyId, WeatherKind } from '@/content/ids';
import type { DistrictId, PlaceId } from '@/content/places';
import type { Result } from '@/core/types';

/** Ids, errors and the world input the sim receives every tick. */

export const SIM_STATE_VERSION = 1;

// ── ids ─────────────────────────────────────────────────────────────────────

/** `${tier}.${strain}.${effects joined by "+"}` — stable and readable. */
export type ProductId = string;
/** `${ProductId}*${stars}` — one inventory stack (quality is per stack). */
export type StackId = string;
export type PlantId = string;
/** `${PlacementId}:${slot}` */
export type PotId = string;
export type PlacementId = string;
export type JobId = string;
export type RequestId = string;
export type DealId = string;
export type MessageId = string;
export type CrewId = string;
export type GoalId = string;
export type NewsId = string;
/** `seed:${StrainId}` or `add:${AdditiveId}` */
export type SupplyId = `seed:${string}` | `add:${AdditiveId}`;

// ── errors ──────────────────────────────────────────────────────────────────

export type SimError =
  | 'notFound' // unknown id
  | 'invalid' // malformed arguments
  | 'locked' // needs a higher rank or a story unlock
  | 'notOwned' // property or front not owned
  | 'closed' // shop closed at this hour
  | 'cash' // cannot afford
  | 'stock' // not enough product
  | 'supplies' // not enough seeds or additives
  | 'full' // no free slot or capacity
  | 'busy' // station, crew member or customer already occupied
  | 'cooldown'
  | 'lockdown' // property under police lockdown
  | 'tooHot' // street heat too high for this
  | 'notHere' // player must be at the place
  | 'alreadyDone'
  | 'expired'
  | 'occupied' // build cell taken
  | 'blocked' // build placement blocks a door or path
  | 'notReady'; // e.g. plant not ripe

/** Every command result. On failure `detail` is a short sentence the UI can show as-is. */
export type SimResult<T = void> = Result<T, SimError>;

// ── world input ─────────────────────────────────────────────────────────────

/** What only the world knows, supplied on every `tick`. */
export interface SimWorldInput {
  /** Clock day (1-based) and hours (0–24) as shown to the player. */
  day: number;
  hours: number;
  weather: WeatherKind;
  /** District the player is in, if any (null on open water). */
  district: DistrictId | null;
  /** Named place the player is at (inside its radius or interior), if any. */
  place: PlaceId | null;
  /** Owned property the player is inside, if any. */
  insideProperty: PropertyId | null;
  /** Street heat 0–5 from the police system. */
  streetHeat: number;
  inVehicle: boolean;
  /** A set-piece or cutscene is running: hold new texts, walk-ups and raids. */
  busy: boolean;
}
