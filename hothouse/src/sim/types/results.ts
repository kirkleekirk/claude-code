import type { EffectId } from '@/content/effects';
import type { CustomerId, FrontId, PlaceableId, PropertyId, UpgradeId } from '@/content/ids';
import type { HarmonyId } from '@/content/mixRules';
import type { DealId, ProductId, StackId, SupplyId } from './core';
import type { NotebookPage, RelationshipLevel, SnipGrade } from './state';

/** Results returned by commands. */

// ── results ─────────────────────────────────────────────────────────────────

export interface TendResult {
  watered: boolean;
  fed: boolean;
  pruned: boolean;
  /** Need icons cleared, for UI pops. */
  cleared: number;
}

export interface HarvestResult {
  product: ProductId;
  stack: StackId;
  units: number;
  stars: number;
  /** 'peak' | 'early' | 'late' timing verdict. */
  timing: 'peak' | 'early' | 'late';
  grade: SnipGrade;
  streak: number;
  xp: number;
  /** Where the units went. */
  to: 'bag' | 'stash';
}

export interface Discovery {
  kind: 'product' | 'rule' | 'effect' | 'harmony' | 'apex';
  id: string;
  label: string;
}

export interface MixResult {
  product: ProductId;
  stack: StackId;
  units: number;
  effects: EffectId[];
  fused: EffectId | null;
  harmony: HarmonyId | null;
  isNew: boolean;
  discoveries: Discovery[];
  page: NotebookPage | null;
  xp: number;
  value: number;
}

/** A single effect line in a mix preview. `unknown` when the player has not seen the rule yet. */
export interface PreviewEffect {
  effect: EffectId | null;
  source: 'kept' | 'transformed' | 'added' | 'fused' | 'unknown';
  from: EffectId | null;
}

export interface MixPreview {
  effects: PreviewEffect[];
  /** True when every step is known, so the outcome is exact. */
  exact: boolean;
  fused: EffectId | null;
  harmony: HarmonyId | null;
  /** Estimated value per unit (known parts only). */
  value: number;
  cap: number;
  /** The product this would produce, if exact and already discovered. */
  known: ProductId | null;
}

export interface HaggleInfo {
  deal: DealId;
  stack: StackId;
  qty: number;
  /** Fair price per unit for this stack and customer. */
  fair: number;
  /** Visible mood-meter band per unit: the walk-away point lies somewhere inside. */
  bandLow: number;
  bandHigh: number;
  /** Auto-price per unit: always accepted, never Perfect. */
  safe: number;
  /** Slider range per unit. */
  min: number;
  max: number;
  /** 0–1 how well the stack matches what they want. */
  match: number;
  /** Customer reaction line for the current match. */
  line: string;
}

export interface DealOutcome {
  deal: DealId;
  customer: CustomerId;
  kind: 'sale' | 'counter' | 'walkaway';
  unitPrice: number;
  qty: number;
  total: number;
  tip: number;
  perfect: boolean;
  streak: number;
  xp: number;
  affinity: number;
  level: RelationshipLevel;
  levelUp: boolean;
  /** Street-heat change the police system should apply (witnessed handoffs). */
  streetHeat: number;
  /** Customer's line for the reaction card. */
  line: string;
}

export interface SampleResult {
  customer: CustomerId | null;
  unlocked: boolean;
  line: string;
}

export interface PurchaseResult {
  item: SupplyId | UpgradeId | PropertyId | FrontId | PlaceableId;
  qty: number;
  cost: number;
  paidWith: 'dirty' | 'clean' | 'mixed';
}

export interface BustReport {
  fee: number;
  lost: Array<{ stack: StackId; units: number }>;
  notoriety: number;
  line: string;
}

export interface RaidOutcome {
  result: 'repelled' | 'raided' | 'evaded' | 'bribed';
  confiscated: Array<{ stack: StackId; units: number }>;
  cashLost: number;
  lockdownSeconds: number;
  notorietyAfter: number;
}

export interface ShiftReport {
  seconds: number;
  fromDay: number;
  fromHours: number;
  toDay: number;
  toHours: number;
  earnedDirty: number;
  earnedClean: number;
  spent: number;
  deals: number;
  crewDeals: number;
  units: number;
  harvested: number;
  made: number;
  laundered: number;
  closeCalls: number;
  /** Short highlight lines ("Pilar named the new Blush 'Doris'."). */
  lines: string[];
  /** Why the skip stopped early, if it did. */
  interrupted: string | null;
}
