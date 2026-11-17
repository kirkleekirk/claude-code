import type { Difficulty } from '@/content/ids';
import type { Content } from '@/content/registry';
import type { EventBus } from '@/core/events';
import type { ReadonlySignal } from '@preact/signals-core';
import type { SimCommands, SimDevCommands } from './commands';
import type { SimWorldInput } from './core';
import type { SimQueries } from './queries';
import type { ShiftReport } from './results';
import type { SimState } from './state';

/** The `Sim` object itself and its revision channels. */

// ── revision channels ───────────────────────────────────────────────────────

export const REV_CHANNELS = [
  'cash', 'inventory', 'supplies', 'plants', 'products', 'jobs', 'notebook', 'brand', 'customers', 'requests', 'deals',
  'messages', 'crew', 'properties', 'territory', 'rivals', 'heat', 'fronts', 'events', 'missions', 'progression',
  'goals', 'news', 'story', 'upgrades',
] as const;
export type RevChannel = (typeof REV_CHANNELS)[number];

// ── the sim ─────────────────────────────────────────────────────────────────

export interface CreateSimOptions {
  seed: number;
  difficulty: Difficulty;
  bus?: EventBus | null;
}

export interface Sim {
  readonly state: SimState;
  readonly content: Content;
  readonly cmd: SimCommands;
  readonly query: SimQueries;
  readonly dev: SimDevCommands;
  /** Bumps when the slice changes; read `.value` inside UI effects. */
  readonly rev: Readonly<Record<RevChannel, ReadonlySignal<number>>>;
  /** Advance by sim-seconds. Call from the fixed step (e.g. 0.5 s every 30 steps). */
  tick(dt: number, world: SimWorldInput): void;
  /** Skip time while the player rests; the empire keeps running. */
  skipTime(seconds: number): ShiftReport;
  waitUntil(hours: number): ShiftReport;
  /** Digest since the last report (returning to base). Resets the baseline. */
  shiftReport(): ShiftReport;
  /** Deep copy of the state as plain JSON. */
  serialize(): SimState;
}
