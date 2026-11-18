import type { EventBus } from '@/core/events';
import { rankDef } from '@/content/ranks';
import type { Migration, SaveMeta } from '@/save';
import { SIM_STATE_VERSION, type CreateSimOptions, type Sim, type SimState } from './api';
import { SimImpl } from './Sim';
import { createInitialState, zeroLedger } from './state';

export * from './api';

/** Start a new game. */
export function createSim(options: CreateSimOptions): Sim {
  return new SimImpl(createInitialState(options.seed, options.difficulty), options.bus ?? null);
}

/** Resume from a saved state (as produced by `sim.serialize()`). */
export function loadSim(state: SimState, bus?: EventBus | null): Sim {
  return new SimImpl(normalizeState(state), bus ?? null);
}

/**
 * Bring a saved state up to the current shape: fill fields added after the save was written with
 * their defaults and repair impossible values. Never throws on a well-formed save.
 */
export function normalizeState(raw: SimState): SimState {
  const fresh = createInitialState(raw.seed ?? 1, raw.difficulty ?? 'classic');
  const s = { ...fresh, ...raw } as SimState;
  s.version = SIM_STATE_VERSION;
  s.totals ??= zeroLedger(0);
  s.lastReport ??= zeroLedger(0);
  s.today ??= zeroLedger(s.clock?.day ?? 1);
  const money = s.money;
  for (const k of ['dirty', 'clean'] as const) if (!Number.isFinite(money[k]) || money[k] < 0) money[k] = 0;
  for (const id of Object.keys(fresh.missions.progress) as Array<keyof SimState['missions']['progress']>) {
    const p = s.missions.progress[id] ?? fresh.missions.progress[id];
    p.counter ??= 0;
    s.missions.progress[id] = p;
  }
  for (const c of Object.values(s.crew)) {
    c.praisedAt ??= -1e9;
    c.lowSince ??= null;
    c.unpaid ??= 0;
    c.delivery ??= null;
  }
  for (const d of s.deals) {
    d.bandOffset ??= 0.5;
    d.lastOffer ??= null;
  }
  for (const id of Object.keys(fresh.properties) as Array<keyof SimState['properties']>) s.properties[id] ??= fresh.properties[id];
  for (const id of Object.keys(fresh.customers) as Array<keyof SimState['customers']>) s.customers[id] ??= fresh.customers[id];
  for (const id of Object.keys(fresh.turfs) as Array<keyof SimState['turfs']>) s.turfs[id] ??= fresh.turfs[id];
  return s;
}

/**
 * Save-file migrations for `SaveManager` (keyed by the save version they upgrade from). The sim
 * state itself is normalized on load, so this stays empty until the save envelope changes.
 */
export const SIM_SAVE_MIGRATIONS: Readonly<Record<number, Migration>> = {};

/** What the save slot cards show, derived from the sim. The world adds location and thumbnail. */
export function simSaveMeta(sim: Sim, playtime: number): Omit<SaveMeta, 'slot' | 'location' | 'thumb' | 'savedAt'> {
  const s = sim.state;
  return {
    playtime,
    rank: s.progression.rank,
    rankTitle: rankDef(s.progression.rank).title,
    cash: s.money.dirty + s.money.clean,
    day: s.clock.day,
    clockHours: s.clock.hours,
    brand: s.brand?.name ?? null,
  };
}
