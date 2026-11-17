import type { ContactId, CustomerId, EventId, MissionId, PlaceableId, PropertyId } from '@/content/ids';
import type { DistrictId, PlaceId } from '@/content/places';
import type { StrainId } from '@/content/strains';
import type { CrewId, DealId, GoalId, JobId, MessageId, NewsId, PlacementId, PlantId, PotId, ProductId, RequestId, SupplyId } from './core';
import type { UnlockInfo } from './queries';
import type { BustReport, DealOutcome, Discovery, HarvestResult, MixResult, TendResult } from './results';
import type { MessageKind, MissionStatus, NotebookPage, PlantStage, RaidStatus, RelationshipLevel, RequestStatus, StoryBeat, UnlockVia } from './state';

/** `sim:*` events announced on the game event bus. */

// ── events ──────────────────────────────────────────────────────────────────

export type CashReason =
  | 'deal' | 'tip' | 'crewDeal' | 'purchase' | 'upgrade' | 'property' | 'wage' | 'launder' | 'legit' | 'debt' | 'bust'
  | 'raid' | 'bribe' | 'stunt' | 'reward' | 'refund' | 'front' | 'audit' | 'build' | 'sample' | 'dev';

declare module '@/core/events' {
  interface GameEvents {
    'sim:cash': { dirty: number; clean: number; delta: number; kind: 'dirty' | 'clean'; reason: CashReason };
    'sim:xp': { amount: number; total: number; reason: string };
    'sim:rankUp': { rank: number; title: string; unlocks: UnlockInfo[] };
    'sim:unlock': UnlockInfo;
    'sim:plantStage': { plant: PlantId; property: PropertyId; stage: PlantStage };
    'sim:planted': { plant: PlantId; property: PropertyId; pot: PotId; strain: StrainId };
    'sim:tended': { plant: PlantId; result: TendResult; by: 'player' | 'crew' };
    'sim:harvest': HarvestResult & { plant: PlantId; property: PropertyId; by: 'player' | 'crew' };
    'sim:mixed': MixResult & { by: 'player' | 'crew'; property: PropertyId };
    'sim:discovery': { product: ProductId | null; page: NotebookPage | null; discoveries: Discovery[] };
    'sim:jobDone': { job: JobId; property: PropertyId; product: ProductId; units: number };
    'sim:message': { thread: ContactId; message: MessageId; from: ContactId | 'player'; text: string; kind: MessageKind };
    'sim:request': { request: RequestId; customer: CustomerId; status: RequestStatus };
    'sim:dealOpened': { deal: DealId; customer: CustomerId; place: PlaceId | null };
    'sim:deal': DealOutcome;
    'sim:relationship': { customer: CustomerId; level: RelationshipLevel; previous: RelationshipLevel };
    'sim:customerUnlocked': { customer: CustomerId; via: UnlockVia };
    /** The world should spawn this customer walking up to the player at `place`. */
    'sim:walkUp': { customer: CustomerId; place: PlaceId };
    'sim:crew': { crew: CrewId; change: 'hired' | 'fired' | 'quit' | 'upset' | 'wonBack' | 'assigned' | 'idle' | 'needsSupplies' };
    'sim:notoriety': { value: number; delta: number };
    'sim:raid': { property: PropertyId; status: RaidStatus; at: number };
    'sim:bust': BustReport;
    'sim:event': { instance: string; event: EventId; status: 'forecast' | 'started' | 'ended'; district: DistrictId | null };
    'sim:mission': { mission: MissionId; status: MissionStatus; objective: number };
    'sim:beat': { beat: StoryBeat };
    'sim:news': { id: NewsId; headline: string };
    'sim:goal': { goal: GoalId; status: 'new' | 'done' };
    'sim:toast': { text: string; tone: 'good' | 'info' | 'warn' | 'bad'; icon: string };
    'sim:supplies': { item: SupplyId; qty: number; source: 'purchase' | 'delivery' | 'subscription' };
    'sim:built': { property: PropertyId; placement: PlacementId; item: PlaceableId; change: 'placed' | 'moved' | 'removed' };
  }
}
