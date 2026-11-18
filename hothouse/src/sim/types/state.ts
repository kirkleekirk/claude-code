import type { AdditiveId } from '@/content/additives';
import type { EffectId } from '@/content/effects';
import type { ContactId, CrewRole, CustomerId, Difficulty, EventId, FrontId, MissionId, PlaceableId, PropertyId, RivalId, ShopId, StationKind, Tier, TrackId, UpgradeId } from '@/content/ids';
import type { HarmonyId } from '@/content/mixRules';
import type { DistrictId, PlaceId } from '@/content/places';
import type { StrainDef, StrainId } from '@/content/strains';
import type { TurfId } from '@/content/turfs';
import type { RngState } from '@/core/rng';
import type { CrewId, DealId, GoalId, JobId, MessageId, NewsId, PlacementId, PlantId, PotId, ProductId, RequestId, StackId, SupplyId } from './core';
import type { RaidOutcome } from './results';

/** The JSON-serializable empire state. */

// ── state ───────────────────────────────────────────────────────────────────

export type FeedProfile = 'balanced' | 'speed' | 'yield' | 'quality';
export type LightLevel = 'low' | 'standard' | 'blaze';
export type SnipGrade = 'perfect' | 'good' | 'ok' | 'miss';
/** 0 seedling · 1 sprout · 2 leafy · 3 budding · 4 ripe */
export type PlantStage = 0 | 1 | 2 | 3 | 4;

export interface PlantState {
  id: PlantId;
  property: PropertyId;
  pot: PotId;
  strain: StrainId;
  feed: FeedProfile;
  plantedAt: number;
  /** 0–1 growth toward ripe. */
  growth: number;
  /** Seconds since ripening; −1 while growing. */
  ripeFor: number;
  /** 0–1. Drains over time unless drip irrigation is installed. */
  water: number;
  /** 0–1 feeding level; tending refills it. */
  food: number;
  /** True once pruned during this growth stage. */
  pruned: boolean;
  /** Running average of care (water, food, pruning) used for quality. */
  care: number;
  careSamples: number;
  /** True if the player tended it by hand at least once (hand-crafted bonus). */
  handTended: boolean;
  lastTendedAt: number;
}

export interface ProductState {
  id: ProductId;
  tier: Tier;
  strain: StrainId;
  /** Canonical order. */
  effects: EffectId[];
  name: string;
  customName: boolean;
  /** The product it was mixed from (null for raw harvests). */
  base: ProductId | null;
  /** Additives in the last mix step that produced it (empty for raw and tier-ups). */
  additives: AdditiveId[];
  harmony: HarmonyId | null;
  discoveredAt: number;
  made: number;
  sold: number;
  favorite: boolean;
  /** Notebook page index, if this product earned one. */
  page: number | null;
}

/** How to make something again. */
export interface Recipe {
  base: ProductId;
  additives: AdditiveId[];
  /** Tier step instead of additives (Cold Still, Sun Press). */
  tierUp?: Tier;
}

export type JobStatus = 'queued' | 'running' | 'blocked' | 'done' | 'cancelled';

export interface JobState {
  id: JobId;
  property: PropertyId;
  station: StationKind;
  recipe: Recipe;
  /** Units of output requested and finished so far. */
  qty: number;
  done: number;
  /** Seconds into the current unit. */
  progress: number;
  /** Seconds per unit. */
  unitTime: number;
  status: JobStatus;
  blockedReason: string | null;
  by: 'player' | 'crew';
  /** Input stacks reserved at queue time, consumed per unit. */
  reserved: Record<StackId, number>;
  createdAt: number;
}

export type RelationshipLevel = 'stranger' | 'regular' | 'loyal' | 'superfan';

export interface CustomerState {
  id: CustomerId;
  unlocked: boolean;
  unlockedAt: number;
  unlockedVia: UnlockVia | null;
  /** 0–100+. Thresholds: regular 12, loyal 40, superfan 75. */
  affinity: number;
  level: RelationshipLevel;
  deals: number;
  spent: number;
  lastDealAt: number;
  lastRequestAt: number;
  /** 0–1: recently served customers want less for a while. */
  satiation: number;
  /** −1…1 short-term mood from the last interactions. */
  mood: number;
  /** Story beats delivered (`regular`, `loyal`, `superfan`). */
  beats: string[];
  /** Products this customer has loved (bought with a loved effect), most recent first. */
  favorites: ProductId[];
  referred: boolean;
}

export type UnlockVia = 'start' | 'story' | 'referral' | 'sample' | 'rank' | 'mission' | 'debug';

export type DealKind =
  | 'street' // standard handoff on foot
  | 'driveBy' // window deal from the car
  | 'busker' // boardwalk performer cover
  | 'houseParty' // several buyers at one address
  | 'yacht' // VIP package on Isla Dorada
  | 'wholesale' // bulk at the docks
  | 'deadDrop' // locker, no meeting
  | 'crewDelivery'; // a driver handles it

export type RequestStatus = 'pending' | 'accepted' | 'countered' | 'declined' | 'expired' | 'done' | 'failed';

export interface RequestWants {
  /** Any one of these effects satisfies; empty = "anything good". */
  effects: EffectId[];
  tier: Tier;
  qty: number;
  minStars: number;
}

export interface RequestState {
  id: RequestId;
  customer: CustomerId;
  kind: DealKind;
  place: PlaceId;
  wants: RequestWants;
  /** Total the customer offers up front for the whole order. */
  offer: number;
  createdAt: number;
  /** Absolute sim time it lapses, or null for story requests that wait. */
  expiresAt: number | null;
  /** Clock time to display ("by 8:15 PM"), projected at rate 1. */
  byDay: number | null;
  byHours: number | null;
  status: RequestStatus;
  /** Set when the player asked for more money. */
  counter: number | null;
  story: string | null;
  mission: MissionId | null;
  message: MessageId | null;
}

export interface DealState {
  id: DealId;
  customer: CustomerId;
  request: RequestId | null;
  kind: DealKind;
  place: PlaceId | null;
  wants: RequestWants;
  openedAt: number;
  /** Hidden: the customer's walk-away multiplier over fair price, fixed when the deal opens. */
  tolerance: number;
  /** Visible fuzz of the mood meter (narrows with relationship). */
  fuzz: number;
  /** 0–1: where the true walk-away point sits inside the visible band (fixed when the deal opens). */
  bandOffset: number;
  /** Counter-offer per unit after an over-reach, if any. */
  counterUnit: number | null;
  /** The stack and quantity of the last offer, so a counter can be accepted in one tap. */
  lastOffer: { stack: StackId; qty: number } | null;
  attempts: number;
  status: 'open' | 'closed' | 'walked';
}

export type MessageKind = 'text' | 'request' | 'system' | 'tip' | 'story' | 'news' | 'photo';

export interface Chip {
  id: string;
  label: string;
  tone?: 'primary' | 'secondary' | 'danger';
}

export interface Message {
  id: MessageId;
  from: ContactId | 'player';
  text: string;
  kind: MessageKind;
  at: number;
  day: number;
  hours: number;
  chips: Chip[] | null;
  chosen: string | null;
  request: RequestId | null;
}

export interface ThreadState {
  id: ContactId;
  messages: Message[];
  unread: number;
  lastAt: number;
  muted: boolean;
}

export type CrewStatus = 'working' | 'idle' | 'needsSupplies' | 'upset' | 'onBreak' | 'quit';

export interface CrewActivity {
  kind: 'tend' | 'harvest' | 'plant' | 'cook' | 'pack' | 'deal' | 'drive' | 'guard' | 'books' | 'watch' | 'break' | 'idle';
  property: PropertyId | null;
  placement: PlacementId | null;
  turf: TurfId | null;
  /** 0–1 through the current action, for animation timing. */
  progress: number;
}

export interface CrewAssignment {
  property: PropertyId | null;
  turf: TurfId | null;
  recipe: Recipe | null;
}

export interface CrewState {
  id: CrewId;
  /** Content id for named crew and authored candidates. */
  def: string;
  name: string;
  role: CrewRole;
  /** 1–5. */
  skill: number;
  /** Dollars per in-game day. */
  wage: number;
  /** 0–100. */
  morale: number;
  hiredAt: number;
  assignment: CrewAssignment;
  status: CrewStatus;
  activity: CrewActivity;
  /** Units produced, deals made, etc. for the Shift Report. */
  output: number;
  /** Set when they quit; win them back before `winBackUntil`. */
  quitAt: number | null;
  winBackUntil: number | null;
  /** Running timer used for production cadence. */
  timer: number;
  /** Last praise (respect decays over time). */
  praisedAt: number;
  /** When morale first dropped below the quitting line, if it has. */
  lowSince: number | null;
  /** Consecutive in-game days without pay. */
  unpaid: number;
  /** Delegated request a driver is delivering, with its arrival time. */
  delivery: { request: RequestId; stack: StackId; qty: number; at: number } | null;
}

export interface CandidateState {
  def: string;
  /** Asking wage today. */
  wage: number;
  expiresAt: number;
}

export interface Placement {
  id: PlacementId;
  item: PlaceableId;
  x: number;
  y: number;
  /** Quarter turns. */
  rot: 0 | 1 | 2 | 3;
  placedAt: number;
}

export interface PropertyState {
  id: PropertyId;
  owned: boolean;
  boughtAt: number;
  tracks: Record<TrackId, number>;
  lights: LightLevel;
  layout: Placement[];
  nextPlacement: number;
  stash: Record<StackId, number>;
  /** Sim time until which the property is locked down after a raid. */
  lockdownUntil: number;
  /** Derived gauges, 0–100, refreshed every tick. */
  visibility: number;
  security: number;
  /** 0–100: how short crew walking paths are. */
  flowScore: number;
  /** Placements made in the current Build Mode session refund in full. */
  buildSession: PlacementId[] | null;
}

export interface TurfState {
  /** Influence 0–100 per faction; the player key is `player`. */
  influence: Record<'player' | RivalId, number>;
  dealer: CrewId | null;
  sales: number;
  /** Rival pressure trend for the territory map arrows. */
  trend: number;
}

export interface RivalState {
  id: RivalId;
  /** −100 hostile … 100 allied. */
  standing: number;
  /** 0–100 how hard they are pushing right now. */
  pressure: number;
  allied: boolean;
  exposed: boolean;
  cooldowns: Partial<Record<RivalAction, number>>;
}

export type RivalAction = 'outBrand' | 'outPrice' | 'ambush' | 'ally' | 'bribe' | 'expose' | 'sabotage';

export type RaidStatus = 'warned' | 'imminent' | 'active' | 'resolved' | 'cancelled';
export type RaidPrep = 'moveStock' | 'hireGuards' | 'bribe' | 'standGround';

export interface RaidState {
  property: PropertyId;
  warnedAt: number;
  /** Sim time the raid begins. */
  at: number;
  status: RaidStatus;
  prep: RaidPrep[];
  outcome: RaidOutcome | null;
}

export interface HeatState {
  /** 0–100 long-term attention on the brand and properties. */
  notoriety: number;
  busts: number;
  escapes: number;
  lastBustAt: number;
  raid: RaidState | null;
  raidsSurvived: number;
  /** Next notoriety thresholds already used for raids (40, 65, 85). */
  thresholdsHit: number[];
  bribedUntil: number;
}

export interface FrontState {
  id: FrontId;
  owned: boolean;
  level: number;
  /** Share of daily capacity to push, 0–1.5 (over 1 risks an audit). */
  push: number;
  launderedToday: number;
  legitToday: number;
  audits: number;
}

export interface DebtState {
  principal: number;
  paid: number;
  /** Day the next instalment check happens and the cumulative amount expected by then. */
  nextCheckDay: number;
  expectedByCheck: number;
  missed: number;
  /** 0–100 Vale's respect from paying early and in full. */
  respect: number;
  /** Collector pressure 0–3 (story beats, never a fail state). */
  collectors: number;
  settled: 'paid' | 'partner' | 'defied' | null;
}

export interface MoneyState {
  dirty: number;
  clean: number;
  debt: DebtState;
  lifetimeEarned: number;
  lifetimeSpent: number;
}

export interface BrandLogo {
  shape: number;
  icon: number;
  palette: number;
  type: number;
}

export interface BrandState {
  name: string;
  logo: BrandLogo;
  packaging: number;
  /** 0–100. */
  hype: number;
  createdAt: number;
  stuntCooldowns: Record<string, number>;
}

export interface NotebookPage {
  index: number;
  kind: 'discovery' | 'harmony' | 'apex' | 'strain' | 'tier';
  product: ProductId | null;
  strain: StrainId | null;
  /** Illustration id for the UI (`doodle-…`). */
  doodle: string;
  note: string;
  stars: number;
  sticker: string | null;
  at: number;
}

export interface GoalState {
  id: GoalId;
  def: string;
  target: number;
  progress: number;
  /** Stat value when the goal was issued (progress = stat − base). */
  base: number;
  reward: { cash: number; xp: number };
  done: boolean;
}

export interface Stats {
  deals: number;
  perfectDeals: number;
  unitsSold: number;
  harvests: number;
  perfectSnips: number;
  plantsPlanted: number;
  tends: number;
  mixes: number;
  discoveries: number;
  samples: number;
  earned: number;
  spent: number;
  busts: number;
  escapes: number;
  raids: number;
  hires: number;
  laundered: number;
  flowTips: number;
  missions: number;
}

export interface ProgressionState {
  xp: number;
  rank: number;
  unlocks: string[];
  goals: GoalState[];
  goalsDone: number;
  stats: Stats;
  perfectStreak: number;
  bestPerfectStreak: number;
  snipStreak: number;
}

export interface EventInstance {
  id: string;
  event: EventId;
  district: DistrictId | null;
  /** Absolute sim times. */
  startAt: number;
  endAt: number;
  startDay: number;
  startHours: number;
  status: 'forecast' | 'active' | 'done';
  /** Outcome reported by the world for interactive events (race won, chase escaped…). */
  outcome: string | null;
}

export type MissionStatus = 'locked' | 'available' | 'active' | 'done' | 'failed';

export interface MissionProgress {
  status: MissionStatus;
  objective: number;
  checkpoint: number;
  attempts: number;
  startedAt: number;
  completedAt: number;
  choice: string | null;
  /** Progress inside the current objective (units delivered, plants harvested). */
  counter: number;
}

export type StoryBeat =
  | 'firstHarvest' | 'kikiText' | 'kikiAccepted' | 'kikiDelivered' | 'gardenStore' | 'firstPlant' | 'firstTend' | 'firstMix'
  | 'brandNamed' | 'duskFalls' | 'secondCustomer' | 'secondAccepted' | 'secondDelivered' | 'rank2' | 'dripPitch' | 'dripBought'
  | 'valeText' | 'prologueDone' | 'hurricaneWatch' | 'endingChosen'
  // observed by the world and reported with `cmd.worldBeat`
  | 'firstDrift' | 'policeNearMiss' | 'boardwalkArrived' | 'storeEntered';

export interface StoryState {
  beats: Partial<Record<StoryBeat, number>>;
  /** Index into the prologue step list. */
  prologue: number;
  prologueStepAt: number;
  ending: 'legit' | 'crown' | null;
  flags: Record<string, boolean | number | string>;
}

export interface NewsItem {
  id: NewsId;
  at: number;
  day: number;
  headline: string;
  source: string;
  read: boolean;
}

export interface Subscription {
  item: SupplyId;
  qty: number;
  /** In-game days between deliveries. */
  every: number;
  nextDay: number;
  active: boolean;
}

export interface SupplyOrder {
  id: string;
  shop: ShopId;
  item: SupplyId;
  qty: number;
  arriveAt: number;
}

export interface CrossOffer {
  parents: [StrainId, StrainId];
  options: StrainDef[];
  at: number;
}

/** Running totals for "Today" and Shift Reports. */
export interface DayLedger {
  day: number;
  earnedDirty: number;
  earnedClean: number;
  spent: number;
  deals: number;
  perfect: number;
  units: number;
  harvested: number;
  made: number;
  discoveries: number;
  closeCalls: number;
  laundered: number;
  crewDeals: number;
  xp: number;
}

export interface SimState {
  version: number;
  seed: number;
  rng: RngState;
  difficulty: Difficulty;
  /** Total sim-seconds elapsed. */
  time: number;
  /** Last clock seen from the world (mirror kept for saves and time skips). */
  clock: { day: number; hours: number };
  money: MoneyState;
  progression: ProgressionState;
  /** Carried product (Go-Bag). */
  bag: Record<StackId, number>;
  /** Seeds and additives, shared across owned properties. */
  supplies: Partial<Record<SupplyId, number>>;
  properties: Record<PropertyId, PropertyState>;
  plants: Record<PlantId, PlantState>;
  products: Record<ProductId, ProductState>;
  jobs: JobState[];
  knowledge: { rules: string[]; effects: EffectId[]; harmonies: HarmonyId[] };
  notebook: NotebookPage[];
  strains: { custom: Record<string, StrainDef>; grown: StrainId[]; seen: StrainId[]; offer: CrossOffer | null; crosses: number };
  brand: BrandState | null;
  customers: Record<CustomerId, CustomerState>;
  requests: RequestState[];
  deals: DealState[];
  threads: Record<string, ThreadState>;
  crew: Record<CrewId, CrewState>;
  candidates: CandidateState[];
  turfs: Record<TurfId, TurfState>;
  rivals: Record<RivalId, RivalState>;
  heat: HeatState;
  fronts: Record<FrontId, FrontState>;
  upgrades: UpgradeId[];
  subscriptions: Subscription[];
  orders: SupplyOrder[];
  events: { list: EventInstance[]; lastRollDay: number; seq: number };
  missions: { progress: Record<MissionId, MissionProgress>; active: MissionId | null };
  story: StoryState;
  news: NewsItem[];
  today: DayLedger;
  /** Ledger snapshot at the last Shift Report, for "since you were gone" digests. */
  lastReport: DayLedger;
  /** Monotonic counters for id generation. */
  seq: number;
}
