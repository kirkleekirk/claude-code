import { Rng } from '@/core/rng';
import { CUSTOMER_IDS, FRONT_IDS, MISSION_IDS, PROPERTY_IDS, RIVAL_IDS, type Difficulty, type PropertyId } from '@/content/ids';
import { PROPERTIES } from '@/content/properties';
import { unlocksUpTo } from '@/content/ranks';
import { TURFS, TURF_IDS } from '@/content/turfs';
import {
  SIM_STATE_VERSION, type CustomerState, type DayLedger, type FrontState, type MissionProgress, type Placement, type PlantState,
  type PropertyState, type RivalState, type SimState, type Stats, type TurfState,
} from './api';
import { ECONOMY } from './balance';

/** Short prefixes keep placement and pot ids readable in saves ("of3:1"). */
export const PROPERTY_PREFIX: Readonly<Record<PropertyId, string>> = {
  ofelias: 'of', palmettoGarage: 'pg', harborWarehouse: 'hw', stiltHouse: 'sh', penthouse: 'ph',
};

export function zeroStats(): Stats {
  return {
    deals: 0, perfectDeals: 0, unitsSold: 0, harvests: 0, perfectSnips: 0, plantsPlanted: 0, tends: 0, mixes: 0,
    discoveries: 0, samples: 0, earned: 0, spent: 0, busts: 0, escapes: 0, raids: 0, hires: 0, laundered: 0, flowTips: 0, missions: 0,
  };
}

export function zeroLedger(day: number): DayLedger {
  return {
    day, earnedDirty: 0, earnedClean: 0, spent: 0, deals: 0, perfect: 0, units: 0, harvested: 0, made: 0, discoveries: 0,
    closeCalls: 0, laundered: 0, crewDeals: 0, xp: 0,
  };
}

function initialProperty(id: PropertyId): PropertyState {
  const def = PROPERTIES[id];
  const prefix = PROPERTY_PREFIX[id];
  const layout: Placement[] = def.start.map((s, i) => ({ id: `${prefix}${i + 1}`, item: s.item, x: s.x, y: s.y, rot: s.rot, placedAt: 0 }));
  return {
    id, owned: id === 'ofelias', boughtAt: 0,
    tracks: { power: 0, climate: 0, security: 0, capacity: 0, style: 0 },
    lights: 'standard', layout, nextPlacement: layout.length + 1, stash: {}, lockdownUntil: 0,
    visibility: 0, security: 0, flowScore: 70, buildSession: null,
  };
}

function plant(id: string, pot: string, growth: number, water: number, food: number): PlantState {
  return {
    id, property: 'ofelias', pot, strain: 'abuelasBlush', feed: 'balanced', plantedAt: 0, growth,
    ripeFor: growth >= 1 ? 0 : -1, water, food, pruned: true, care: 0.82, careSamples: 20, handTended: false, lastTendedAt: 0,
  };
}

/** A brand-new game: Ofelia's with one ripe plant, two half-grown, three empty pots and $120. */
export function createInitialState(seed: number, difficulty: Difficulty): SimState {
  const rng = new Rng(seed >>> 0);
  const properties = Object.fromEntries(PROPERTY_IDS.map((id) => [id, initialProperty(id)])) as Record<PropertyId, PropertyState>;
  const customers = Object.fromEntries(
    CUSTOMER_IDS.map((id): [string, CustomerState] => [id, {
      id, unlocked: false, unlockedAt: 0, unlockedVia: null, affinity: 0, level: 'stranger', deals: 0, spent: 0, lastDealAt: -1e9,
      lastRequestAt: -1e9, satiation: 0, mood: 0, beats: [], favorites: [], referred: false,
    }]),
  ) as SimState['customers'];
  const turfs = Object.fromEntries(
    TURF_IDS.map((id): [string, TurfState] => {
      const d = TURFS[id];
      const influence = { player: 0, vale: 0, mudflaps: 0, zenith: 0 };
      if (d.rival) influence[d.rival] = d.rivalStart;
      return [id, { influence, dealer: null, sales: 0, trend: 0 }];
    }),
  ) as SimState['turfs'];
  const rivals = Object.fromEntries(
    RIVAL_IDS.map((id): [string, RivalState] => [id, {
      id, standing: id === 'mudflaps' ? -10 : 0, pressure: id === 'zenith' ? 15 : id === 'vale' ? 10 : 20, allied: false, exposed: false, cooldowns: {},
    }]),
  ) as SimState['rivals'];
  const fronts = Object.fromEntries(
    FRONT_IDS.map((id): [string, FrontState] => [id, { id, owned: false, level: 0, push: 1, launderedToday: 0, legitToday: 0, audits: 0 }]),
  ) as SimState['fronts'];
  const missions = Object.fromEntries(
    MISSION_IDS.map((id): [string, MissionProgress] => [id, {
      status: id === 'inheritance' ? 'active' : 'locked', objective: 0, checkpoint: 0, attempts: id === 'inheritance' ? 1 : 0,
      startedAt: 0, completedAt: 0, choice: null,
    }]),
  ) as SimState['missions']['progress'];

  return {
    version: SIM_STATE_VERSION,
    seed: seed >>> 0,
    rng: rng.getState(),
    difficulty,
    time: 0,
    clock: { day: 1, hours: 18 + 40 / 60 },
    money: {
      dirty: ECONOMY.startDirty, clean: ECONOMY.startClean,
      debt: { principal: ECONOMY.debt, paid: 0, nextCheckDay: 0, expectedByCheck: 0, missed: 0, respect: 20, collectors: 0, settled: null },
      lifetimeEarned: 0, lifetimeSpent: 0,
    },
    progression: { xp: 0, rank: 1, unlocks: unlocksUpTo(1), goals: [], goalsDone: 0, stats: zeroStats(), perfectStreak: 0, bestPerfectStreak: 0, snipStreak: 0 },
    bag: {},
    supplies: { 'add:mysteryBait': 6 },
    properties,
    plants: {
      p1: plant('p1', 'of1:0', 1, 0.8, 0.8),
      p2: plant('p2', 'of1:1', 0.45, 0.62, 0.7),
      p3: plant('p3', 'of2:0', 0.38, 0.55, 0.7),
    },
    products: {},
    jobs: [],
    knowledge: { rules: [], effects: ['sunkissed'], harmonies: [] },
    notebook: [],
    strains: { custom: {}, grown: [], seen: ['abuelasBlush'], offer: null, crosses: 0 },
    brand: null,
    customers,
    requests: [],
    deals: [],
    threads: {},
    crew: {},
    candidates: [],
    turfs,
    rivals,
    heat: { notoriety: 0, busts: 0, escapes: 0, lastBustAt: -1e9, raid: null, raidsSurvived: 0, thresholdsHit: [], bribedUntil: 0 },
    fronts,
    upgrades: [],
    subscriptions: [],
    orders: [],
    events: { list: [], lastRollDay: 0, seq: 0 },
    missions: { progress: missions, active: 'inheritance' },
    story: { beats: {}, prologue: 0, prologueStepAt: 0, ending: null, flags: {} },
    news: [],
    today: zeroLedger(1),
    lastReport: zeroLedger(1),
    seq: 10,
  };
}
