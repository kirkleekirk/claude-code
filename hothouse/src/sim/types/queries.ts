import type { AdditiveId } from '@/content/additives';
import type { CustomerId, FrontId, PlaceableId, PropertyId, RivalId, ShopId, StationKind, UpgradeId } from '@/content/ids';
import type { DistrictId, PlaceId } from '@/content/places';
import type { StrainDef, StrainId } from '@/content/strains';
import type { TurfId } from '@/content/turfs';
import type { CrewId, DealId, PlantId, ProductId, RequestId, SimResult, StackId, SupplyId } from './core';
import type { HaggleInfo, MixPreview } from './results';
import type { CandidateState, CrewState, DebtState, EventInstance, GoalState, PlantStage, StoryBeat } from './state';

/** Read-only selectors for the UI and world. */

// ── queries ─────────────────────────────────────────────────────────────────

export interface NextAction {
  id: string;
  /** Short verb-first line: "Harvest 2 ripe plants". */
  label: string;
  detail: string;
  icon: string;
  place: PlaceId | null;
  priority: number;
}

export interface UnlockInfo {
  id: string;
  label: string;
  detail: string;
  icon: string;
}

export interface RankInfo {
  rank: number;
  title: string;
  xp: number;
  xpThis: number;
  xpNext: number | null;
  progress: number;
  nextUnlocks: UnlockInfo[];
}

export interface TodaySummary {
  day: number;
  earned: number;
  spent: number;
  deals: number;
  perfect: number;
  units: number;
  harvested: number;
  discoveries: number;
  bestSeller: ProductId | null;
}

export interface DemandForecast {
  district: DistrictId;
  /** 0.5–2 relative demand now. */
  demand: number;
  trend: -1 | 0 | 1;
  /** Vibes the district wants right now. */
  wants: string[];
  line: string;
}

export interface Lockable {
  locked: boolean;
  /** "Unlocks at Rank 4 · Sells to Deco Row" */
  reason: string | null;
}

export interface UpgradeListing extends Lockable {
  id: UpgradeId;
  name: string;
  line: string;
  cost: number;
  owned: boolean;
  affordable: boolean;
  icon: string;
}

export interface ShopListing extends Lockable {
  shop: ShopId;
  item: SupplyId;
  name: string;
  price: number;
  owned: number;
  icon: string;
}

export interface PropertyStatus {
  id: PropertyId;
  owned: boolean;
  plants: number;
  ripe: number;
  thirsty: number;
  growing: number;
  jobs: number;
  stashUnits: number;
  visibility: number;
  security: number;
  lockdown: number;
  alerts: string[];
}

export interface PrologueStatus {
  step: number;
  beat: StoryBeat | null;
  /** HUD objective for the current step. */
  objective: string;
  place: PlaceId | null;
  /** Ofelia's margin-note hint for this step. */
  hint: string | null;
  /** True until the scripted dusk: the world keeps the clock at golden hour. */
  clockPinned: boolean;
  done: boolean;
}

export interface ObjectiveInfo {
  text: string;
  place: PlaceId | null;
  icon: string;
  source: 'mission' | 'prologue' | 'request' | 'suggestion';
}

export interface WalkUpCandidate {
  customer: CustomerId;
  /** 0–1 chance weight right now. */
  weight: number;
}

export interface SimQueries {
  rank(): RankInfo;
  today(): TodaySummary;
  forecast(): DemandForecast[];
  eventsForecast(): EventInstance[];
  nextActions(limit?: number): NextAction[];
  objective(): ObjectiveInfo | null;
  prologue(): PrologueStatus;
  goals(): GoalState[];
  operations(): PropertyStatus[];
  upgrades(): UpgradeListing[];
  shop(shop: ShopId): ShopListing[];
  /** Exact where rules are known; "?" entries otherwise. */
  mixPreview(base: StackId | ProductId, additives: readonly AdditiveId[], property?: PropertyId): MixPreview;
  /** Effects cap at a property's workbench right now. */
  mixCap(property: PropertyId): number;
  /** Best stack in the bag for a request or deal, by match then value. */
  bestStack(target: RequestId | DealId): StackId | null;
  haggle(deal: DealId, stack: StackId, qty: number): HaggleInfo | null;
  /** Value per unit of a stack before any customer adjustments. */
  unitValue(stack: StackId): number;
  walkUps(place: PlaceId): WalkUpCandidate[];
  bagUnits(): number;
  stackUnits(stack: StackId, where?: PropertyId | 'bag'): number;
  /** Product and stars of a stack id. */
  parseStack(stack: StackId): { product: ProductId; stars: number } | null;
  plantStage(plant: PlantId): PlantStage;
  /** Need icons for a plant (thirsty, hungry, prune, ripe). */
  plantNeeds(plant: PlantId): Array<'water' | 'food' | 'prune' | 'ripe' | 'overripe'>;
  strainDef(strain: StrainId): StrainDef | null;
  crewBoard(): CrewState[];
  candidates(): CandidateState[];
  propertyCaps(property: PropertyId): { pots: number; stations: StationKind[]; stash: number; crew: number };
  flowScore(property: PropertyId): { score: number; hint: string | null };
  /** Can this placeable go here? Returns the reason when not. */
  canPlace(property: PropertyId, item: PlaceableId, x: number, y: number, rot: 0 | 1 | 2 | 3): SimResult;
  territory(): Array<{ turf: TurfId; district: DistrictId; owner: 'player' | RivalId | null; player: number; trend: number; dealer: CrewId | null }>;
  bank(): { dirty: number; clean: number; debt: DebtState; fronts: Array<{ id: FrontId; owned: boolean; capacity: number; launderedToday: number; push: number; auditRisk: number }> };
  /** Expected clean cash from fronts today at current pushes. */
  launderForecast(): number;
  isLocked(unlock: string): Lockable;
  /** Player-visible clock projection: what time it will be after `seconds` at normal rate. */
  clockIn(seconds: number): { day: number; hours: number };
}
