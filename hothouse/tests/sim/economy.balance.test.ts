import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Bot, type BotKind, type BotReport } from './bots/bot';

/**
 * The headless economy simulator. Each bot plays three hours of game time through the public sim
 * API; we check pacing against the targets in DESIGN.md §10 and look for runaway money.
 *
 * Targets: first purchase ≤ 4 min · Rank 2 ≈ 10 · Rank 3 ≈ 25 · Rank 6 ≈ 90 · finale-ready 2–3 h.
 */

const HOURS = 3;
const SEEDS = [11, 23, 37];
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../../qa/out/balance');

const min = (s: number | null | undefined) => (s === null || s === undefined ? null : Math.round((s / 60) * 10) / 10);

function median(values: Array<number | null>): number | null {
  const v = values.filter((x): x is number => x !== null).sort((a, b) => a - b);
  if (v.length === 0) return null;
  return v[Math.floor(v.length / 2)]!;
}

function runBot(kind: BotKind, seed: number): BotReport {
  return new Bot(kind, seed).run(HOURS * 3600);
}

describe('economy simulator', () => {
  const reports: Record<BotKind, BotReport[]> = { casual: [], optimizer: [], riskTaker: [] };

  it('runs every bot for three hours without errors', () => {
    for (const kind of ['casual', 'optimizer', 'riskTaker'] as const) {
      for (const seed of SEEDS) reports[kind].push(runBot(kind, seed));
    }
    const table: Record<string, Record<string, number | null>> = {};
    for (const kind of ['casual', 'optimizer', 'riskTaker'] as const) {
      const rs = reports[kind];
      table[kind] = {
        firstPurchase: median(rs.map((r) => min(r.firstPurchase))),
        rank2: median(rs.map((r) => min(r.rankAt[2]))),
        rank3: median(rs.map((r) => min(r.rankAt[3]))),
        rank4: median(rs.map((r) => min(r.rankAt[4]))),
        rank5: median(rs.map((r) => min(r.rankAt[5]))),
        rank6: median(rs.map((r) => min(r.rankAt[6]))),
        rank7: median(rs.map((r) => min(r.rankAt[7]))),
        rank8: median(rs.map((r) => min(r.rankAt[8]))),
        rank9: median(rs.map((r) => min(r.rankAt[9]))),
        finaleReady: median(rs.map((r) => min(r.finaleReady))),
        debtSettled: median(rs.map((r) => min(r.debtSettled))),
        cashAt3h: median(rs.map((r) => r.cash.at(-1)?.[1] ?? 0)),
        deals: median(rs.map((r) => r.deals)),
        crewDeals: median(rs.map((r) => r.crewDeals)),
        products: median(rs.map((r) => r.products)),
        apex: median(rs.map((r) => r.apex)),
        busts: median(rs.map((r) => r.busts)),
        raids: median(rs.map((r) => r.raids)),
        maxNotoriety: median(rs.map((r) => Math.round(r.maxNotoriety))),
      };
    }
    mkdirSync(OUT, { recursive: true });
    writeFileSync(resolve(OUT, 'results.json'), JSON.stringify({ table, reports }, null, 2));
    // eslint-disable-next-line no-console
    console.table(table);
    for (const rs of Object.values(reports)) for (const r of rs) expect(r.cash.every(([, c]) => Number.isFinite(c) && c >= 0)).toBe(true);
  });

  it('hits the pacing targets (median of casual and optimizer)', () => {
    const both = [...reports.casual, ...reports.optimizer];
    const first = median(both.map((r) => min(r.firstPurchase)))!;
    const r2 = median(both.map((r) => min(r.rankAt[2])))!;
    const r3 = median(both.map((r) => min(r.rankAt[3])))!;
    const r6 = median(both.map((r) => min(r.rankAt[6])))!;
    expect(first).toBeLessThanOrEqual(4.5);
    expect(r2).toBeGreaterThanOrEqual(7);
    expect(r2).toBeLessThanOrEqual(13);
    expect(r3).toBeGreaterThanOrEqual(18);
    expect(r3).toBeLessThanOrEqual(32);
    expect(r6).toBeGreaterThanOrEqual(70);
    expect(r6).toBeLessThanOrEqual(115);
    const finale = median(reports.optimizer.map((r) => min(r.finaleReady)));
    expect(finale).not.toBeNull();
    expect(finale!).toBeGreaterThanOrEqual(110);
    expect(finale!).toBeLessThanOrEqual(185);
  });

  it('has no runaway money: earnings per minute stay bounded and grow sanely', () => {
    for (const r of reports.optimizer) {
      const e = r.earnedPerMinute;
      const last = e.at(-1)!;
      const hourAgo = e.find(([m]) => m >= last[0] - 60)!;
      const rate = (last[1] - hourAgo[1]) / Math.max(1, last[0] - hourAgo[0]);
      expect(rate).toBeLessThan(8000);
    }
  });
});
