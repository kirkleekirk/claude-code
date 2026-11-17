import type { Difficulty, Tier } from '@/content/ids';
import type { FeedProfile, LightLevel, RelationshipLevel } from './api';

/**
 * Every tuning number of the empire simulation, in one place. BALANCE.md documents the reasoning
 * and the bot results; change numbers here and re-run `npm run sim`.
 */

export const GROW = {
  /** Seconds for water to drain from full to empty at hardiness 1. */
  waterLife: 72,
  foodLife: 160,
  needAt: 0.22,
  thirstyRate: 0.35,
  hungryRate: 0.7,
  /** Growth thresholds for stages 1 (sprout) … 4 (ripe). */
  stageAt: [0.15, 0.35, 0.6, 1] as const,
  feedTime: { balanced: 1, speed: 0.75, yield: 1.1, quality: 1.1 } satisfies Record<FeedProfile, number>,
  feedYield: { balanced: 0, speed: -1, yield: 2, quality: 0 } satisfies Record<FeedProfile, number>,
  feedQuality: { balanced: 0, speed: -0.05, yield: -0.03, quality: 0.18 } satisfies Record<FeedProfile, number>,
  lightTime: { low: 1.15, standard: 1, blaze: 0.88 } satisfies Record<LightLevel, number>,
  lightQuality: { low: -0.1, standard: 0, blaze: 0.12 } satisfies Record<LightLevel, number>,
  lightVisibility: { low: 0.5, standard: 1, blaze: 1.8 } satisfies Record<LightLevel, number>,
  /** Seconds past the peak window before quality drops one and two notches. */
  lateSteps: [90, 240] as const,
  peakBonus: 0.08,
  latePenalty: [0.12, 0.25] as const,
  handBonus: 0.05,
  crewPenalty: 0.04,
  climatePerPoint: 0.02,
  climateCap: 10,
  powerPerLevel: 0.06,
  climateTrackPerLevel: 0.03,
  placeableQualityCap: 0.15,
  placeableYieldCap: 2,
} as const;

export const QUALITY_MULT: readonly number[] = [0, 0.7, 0.85, 1, 1.2, 1.45];

export const MIX = {
  baseCap: 3,
  batch: 5,
  maxAdditives: 3,
  /** Seconds per unit for queued jobs. */
  unitTime: { workbench: 8, coldStill: 18, sunPress: 10 } as const,
  dewInputs: 3,
  halosOutputs: 6,
  tierValue: { bloom: 1, dew: 4.5, halos: 1.5 } satisfies Record<Tier, number>,
  xpNewProduct: 30,
  xpPerEffect: 8,
  xpApex: 80,
  xpHarmony: 50,
  xpRule: 4,
  pageCash: 15,
} as const;

export const DEALS = {
  /** Tolerance (walk-away premium over fair price) by haggle style. */
  tolerance: { easygoing: 0.3, fair: 0.22, shrewd: 0.14, generous: 0.38, flaky: 0.26 },
  levelTolerance: { stranger: 0, regular: 0.04, loyal: 0.08, superfan: 0.12 } satisfies Record<RelationshipLevel, number>,
  fuzz: { stranger: 0.16, regular: 0.11, loyal: 0.06, superfan: 0.03 } satisfies Record<RelationshipLevel, number>,
  levelSpend: { stranger: 1, regular: 1.15, loyal: 1.3, superfan: 1.5 } satisfies Record<RelationshipLevel, number>,
  loyalTip: { stranger: 0, regular: 0.03, loyal: 0.06, superfan: 0.1 } satisfies Record<RelationshipLevel, number>,
  flowTip: 0.22,
  rainTip: 0.05,
  perfectBand: 0.94,
  safeShare: 0.55,
  lovedBonus: 0.12,
  dislikedPenalty: 0.25,
  missPenalty: 0.82,
  lowQualityPenalty: 0.85,
  /** Affinity thresholds. */
  regular: 12,
  loyal: 40,
  superfan: 75,
  satiationPerDeal: 0.55,
  satiationDecay: 1 / 300,
  xpBase: 10,
  xpPerDollar: 1 / 14,
  xpFirstDeal: 15,
  xpPerfect: 10,
} as const;

export const REQUESTS = {
  /** Mean seconds between new texts. */
  interval: 58,
  slots: 2,
  minLife: 160,
  maxLife: 270,
  counterChance: { easygoing: 0.55, fair: 0.4, shrewd: 0.2, generous: 0.7, flaky: 0.5 },
  counterBoost: 1.15,
  failAffinity: -3,
  walkUpCooldown: 75,
  walkUpChance: 0.45,
} as const;

export const ECONOMY = {
  startDirty: 120,
  startClean: 0,
  debt: 80000,
  /** Days between Vale's check-ins and the cumulative share expected at each. */
  debtCheckEvery: 3,
  debtShare: 0.12,
  cashPremium: 0.1,
  orderMarkup: 1.2,
} as const;

export const XP = {
  plant: 3,
  tend: 1,
  harvest: 10,
  harvestPerStar: 2,
  buy: 2,
  brand: 25,
  upgrade: 10,
  property: 100,
  sample: 4,
  escape: 20,
  levelUp: { regular: 20, loyal: 40, superfan: 80 } satisfies Record<Exclude<RelationshipLevel, 'stranger'>, number>,
} as const;

export const BRAND = {
  startHype: 5,
  decayPerMinute: 0.6,
  floor: 10,
  perLovedSale: 0.25,
  perDiscovery: 1,
  bustPenalty: 8,
  raidPenalty: 10,
} as const;

export const DIFFICULTY: Readonly<Record<Difficulty, {
  tolerance: number;
  fuzz: number;
  spend: number;
  notorietyGain: number;
  notorietyDecay: number;
  bustFee: number;
  bagLoss: number;
  raidLoss: number;
}>> = {
  chill: { tolerance: 0.08, fuzz: 0.7, spend: 1.15, notorietyGain: 0.6, notorietyDecay: 1.6, bustFee: 0.5, bagLoss: 0.25, raidLoss: 0.6 },
  classic: { tolerance: 0, fuzz: 1, spend: 1, notorietyGain: 1, notorietyDecay: 1, bustFee: 1, bagLoss: 0.4, raidLoss: 1 },
  sweaty: { tolerance: -0.06, fuzz: 1.2, spend: 0.9, notorietyGain: 1.35, notorietyDecay: 0.75, bustFee: 1.4, bagLoss: 0.55, raidLoss: 1.3 },
};
