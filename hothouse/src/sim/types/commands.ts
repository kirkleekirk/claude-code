import type { AdditiveId } from '@/content/additives';
import type { ContactId, CustomerId, Difficulty, EventId, FrontId, MissionId, PlaceableId, PropertyId, RivalId, ShopId, TrackId, UpgradeId } from '@/content/ids';
import type { DistrictId, PlaceId } from '@/content/places';
import type { StrainId } from '@/content/strains';
import type { TurfId } from '@/content/turfs';
import type { CrewId, DealId, JobId, MessageId, PlacementId, PlantId, PotId, ProductId, RequestId, SimResult, StackId, SupplyId } from './core';
import type { BustReport, DealOutcome, HarvestResult, MixResult, PurchaseResult, RaidOutcome, SampleResult, TendResult } from './results';
import type { BrandLogo, CrewAssignment, CrossOffer, DealState, DebtState, FeedProfile, LightLevel, RaidPrep, RaidState, Recipe, RequestState, RivalAction, SnipGrade } from './state';

/** Player intent: validated commands that return `SimResult`s. */

// ── commands ────────────────────────────────────────────────────────────────

export interface OfferInput {
  stack: StackId;
  qty: number;
  unitPrice: number;
  /** 0–1: Flow meter share delivered with (driving tips). */
  flow?: number;
  /** A cop or nosy witness had eyes on the handoff and the player pushed through. */
  witnessed?: boolean;
}

export interface SimCommands {
  // growing
  plant(property: PropertyId, pot: PotId, strain: StrainId, feed?: FeedProfile): SimResult<PlantId>;
  /** Plant every empty pot at a property with this strain while seeds last. */
  plantAll(property: PropertyId, strain: StrainId, feed?: FeedProfile): SimResult<number>;
  tend(plant: PlantId): SimResult<TendResult>;
  tendAll(property: PropertyId): SimResult<number>;
  /** `grades` from the snip chain (empty or all 'good' for hold-to-harvest). */
  harvest(plant: PlantId, grades: readonly SnipGrade[]): SimResult<HarvestResult>;
  setLights(property: PropertyId, level: LightLevel): SimResult;
  clearPot(plant: PlantId): SimResult;
  // mixing and products
  mix(property: PropertyId, base: StackId, additives: readonly AdditiveId[], qty: number): SimResult<MixResult>;
  /** Tier up at the Cold Still (3 Bloom → 1 Dew) or Sun Press (1 Dew → 6 Halos). */
  refine(property: PropertyId, base: StackId, qty: number): SimResult<MixResult>;
  queueJob(property: PropertyId, recipe: Recipe, qty: number): SimResult<JobId>;
  cancelJob(job: JobId): SimResult;
  /** Queue the product's saved recipe at the best property for it. */
  cookAgain(product: ProductId, qty: number): SimResult<JobId>;
  favorite(product: ProductId, on: boolean): SimResult;
  renameProduct(product: ProductId, name: string): SimResult;
  crossStrains(a: StrainId, b: StrainId): SimResult<CrossOffer>;
  pickCross(option: number, name: string): SimResult<StrainId>;
  // brand
  createBrand(name: string, logo: BrandLogo, packaging: number): SimResult;
  updateBrand(patch: Partial<{ name: string; logo: BrandLogo; packaging: number }>): SimResult;
  stunt(kind: 'beachParty' | 'graffiti' | 'influencer' | 'billboard'): SimResult<{ hype: number; cost: number }>;
  // customers and deals
  replyRequest(request: RequestId, reply: 'accept' | 'counter' | 'decline'): SimResult<RequestState>;
  /** Open the handoff when the player meets the customer (request) or a walk-up approaches. */
  openDeal(source: { request: RequestId } | { walkUp: CustomerId; place: PlaceId }): SimResult<DealState>;
  offer(deal: DealId, input: OfferInput): SimResult<DealOutcome>;
  /** Sell at the safe auto-price. */
  autoPrice(deal: DealId, stack: StackId, qty: number, extras?: Pick<OfferInput, 'flow' | 'witnessed'>): SimResult<DealOutcome>;
  acceptCounter(deal: DealId, extras?: Pick<OfferInput, 'flow' | 'witnessed'>): SimResult<DealOutcome>;
  walkAway(deal: DealId): SimResult;
  giveSample(target: CustomerId | { district: DistrictId }, stack: StackId): SimResult<SampleResult>;
  // inventory and shopping
  buy(shop: ShopId, item: SupplyId, qty: number): SimResult<PurchaseResult>;
  order(shop: ShopId, item: SupplyId, qty: number): SimResult<PurchaseResult>;
  subscribe(item: SupplyId, qty: number, everyDays: number): SimResult;
  unsubscribe(item: SupplyId): SimResult;
  /** Move stock from a property stash into the Go-Bag (smart = what today's demand wants). */
  packBag(property: PropertyId, plan?: 'smart' | Record<StackId, number>): SimResult<number>;
  stow(property: PropertyId, stack?: StackId, qty?: number): SimResult<number>;
  buyUpgrade(upgrade: UpgradeId): SimResult<PurchaseResult>;
  buyProperty(property: PropertyId): SimResult<PurchaseResult>;
  upgradeTrack(property: PropertyId, track: TrackId): SimResult<PurchaseResult>;
  // build mode
  beginBuild(property: PropertyId): SimResult;
  endBuild(property: PropertyId): SimResult;
  place(property: PropertyId, item: PlaceableId, x: number, y: number, rot: 0 | 1 | 2 | 3): SimResult<PlacementId>;
  move(property: PropertyId, placement: PlacementId, x: number, y: number, rot: 0 | 1 | 2 | 3): SimResult;
  remove(property: PropertyId, placement: PlacementId): SimResult<{ refund: number }>;
  // crew
  hire(candidateDef: string): SimResult<CrewId>;
  fire(crew: CrewId): SimResult;
  assign(crew: CrewId, assignment: Partial<CrewAssignment>): SimResult;
  autoAssign(): SimResult<number>;
  praise(crew: CrewId): SimResult;
  bonus(crew: CrewId, amount: number): SimResult;
  winBack(crew: CrewId): SimResult;
  // money
  payDebt(amount: number, from: 'dirty' | 'clean'): SimResult<DebtState>;
  buyFront(front: FrontId): SimResult<PurchaseResult>;
  upgradeFront(front: FrontId): SimResult<PurchaseResult>;
  setLaunder(front: FrontId, push: number): SimResult;
  // law
  bust(cause?: string): SimResult<BustReport>;
  escaped(level: number): SimResult;
  bribe(amount: number): SimResult<{ notoriety: number }>;
  raidPrepare(action: RaidPrep): SimResult<RaidState>;
  raidResolve(result: RaidOutcome['result']): SimResult<RaidOutcome>;
  // rivals and events
  rivalAction(rival: RivalId, action: RivalAction, turf?: TurfId): SimResult<{ cost: number; line: string }>;
  eventOutcome(instance: string, outcome: string): SimResult;
  // story and missions
  missionStart(mission: MissionId): SimResult;
  objectiveDone(mission: MissionId, objective: number): SimResult;
  missionComplete(mission: MissionId, choice?: string): SimResult;
  missionFail(mission: MissionId, reason: string): SimResult;
  missionRetry(mission: MissionId): SimResult;
  chooseEnding(ending: 'legit' | 'crown'): SimResult;
  replyChip(message: MessageId, chip: string): SimResult;
  markRead(thread: ContactId): SimResult;
  readNews(): SimResult;
  /** World-observed beats the sim cannot see (e.g. the first drift). */
  worldBeat(beat: 'firstDrift' | 'policeNearMiss' | 'boardwalkArrived' | 'storeEntered'): SimResult;
  setDifficulty(difficulty: Difficulty): SimResult;
}

/** Test-harness only. */
export interface SimDevCommands {
  grantCash(amount: number, kind?: 'dirty' | 'clean'): void;
  grantXp(amount: number): void;
  unlockAll(): void;
  triggerEvent(event: EventId): void;
  setNotoriety(value: number): void;
  ripenAll(property: PropertyId): void;
  unlockCustomer(customer: CustomerId): void;
}
