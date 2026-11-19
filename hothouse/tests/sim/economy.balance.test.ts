import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Bot, type BotKind, type BotReport } from './bots/bot';

/**
 * The headless economy simulator (`npm run sim`). Each bot plays three hours of game time through
 * the public sim API, with travel, menus and decisions costing time, and we check the pacing targets
 * of DESIGN.md §10 and look for runaway money. Results land in qa/out/balance/results.json and the
 * table in BALANCE.md is copied from there.
 *
 * Targets (a typical player, i.e. the median run): first purchase ≤ 4 min · Rank 2 ≈ 10 · Rank 3 ≈ 25
 * · Rank 6 ≈ 90 · finale-ready 2–3 h.
 */

const HOURS = 3;
const SEEDS = [11, 23, 37];
const KINDS: readonly BotKind[] = ['casual', 'optimizer', 'riskTaker'];
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../../qa/out/balance');

const minutes = (s: number | null | undefined) => (s === null || s === undefined ? null : Math.round((s / 60) * 10) / 10);

/** Median; runs that never got there count as "later than everything". */
function median(values: Array<number | null>): number | null {
  const v = values.map((x) => x ?? Infinity).sort((a, b) => a - b);
  const m = v[Math.floor(v.length / 2)]!;
  return Number.isFinite(m) ? m : null;
}

type Row = Record<string, number | null>;

function row(rs: BotReport[]): Row {
  const r: Row = {};
  r.firstPurchase = median(rs.map((x) => minutes(x.firstPurchase)));
  for (let rank = 2; rank <= 10; rank++) r[`rank${rank}`] = median(rs.map((x) => minutes(x.rankAt[rank])));
  r.finaleReady = median(rs.map((x) => minutes(x.finaleReady)));
  r.debtSettled = median(rs.map((x) => minutes(x.debtSettled)));
  r.earned = median(rs.map((x) => Math.round(x.earnedPerMinute.at(-1)?.[1] ?? 0)));
  r.deals = median(rs.map((x) => x.deals));
  r.crewDeals = median(rs.map((x) => x.crewDeals));
  r.missions = median(rs.map((x) => x.missions.length));
  r.products = median(rs.map((x) => x.products));
  r.busts = median(rs.map((x) => x.busts));
  r.raids = median(rs.map((x) => x.raids));
  r.maxNotoriety = median(rs.map((x) => Math.round(x.maxNotoriety)));
  return r;
}

describe('economy simulator', () => {
  const reports: Record<BotKind, BotReport[]> = { casual: [], optimizer: [], riskTaker: [] };
  const all = () => KINDS.flatMap((k) => reports[k]);

  it('runs every bot for three hours without errors', () => {
    for (const kind of KINDS) for (const seed of SEEDS) reports[kind].push(new Bot(kind, seed).run(HOURS * 3600));
    const table: Record<string, Row> = {};
    for (const kind of KINDS) table[kind] = row(reports[kind]);
    table.all = row(all());
    mkdirSync(OUT, { recursive: true });
    writeFileSync(resolve(OUT, 'results.json'), JSON.stringify({ hours: HOURS, seeds: SEEDS, table, reports }, null, 2));
    for (const r of all()) expect(r.cash.every(([, c]) => Number.isFinite(c) && c >= 0)).toBe(true);
  });

  it('hits the pacing targets for a typical player (median of all runs)', () => {
    const at = (rank: number) => median(all().map((r) => minutes(r.rankAt[rank])));
    expect(median(all().map((r) => minutes(r.firstPurchase)))!).toBeLessThanOrEqual(4);
    expect(at(2)).not.toBeNull();
    expect(at(2)!).toBeGreaterThanOrEqual(7);
    expect(at(2)!).toBeLessThanOrEqual(13);
    expect(at(3)!).toBeGreaterThanOrEqual(19);
    expect(at(3)!).toBeLessThanOrEqual(31);
    expect(at(6)!).toBeGreaterThanOrEqual(75);
    expect(at(6)!).toBeLessThanOrEqual(105);
    const finale = median(all().map((r) => minutes(r.finaleReady)));
    expect(finale).not.toBeNull();
    expect(finale!).toBeGreaterThanOrEqual(120);
    expect(finale!).toBeLessThanOrEqual(180);
  });

  it('keeps the temperaments in a sane spread', () => {
    // Experts get there faster, casual players later, but nobody is locked out or races through.
    const opt = median(reports.optimizer.map((r) => minutes(r.rankAt[6])));
    const casual = median(reports.casual.map((r) => minutes(r.rankAt[6])));
    expect(opt!).toBeGreaterThanOrEqual(55);
    expect(casual).not.toBeNull();
    expect(casual!).toBeLessThanOrEqual(150);
  });

  it('has no runaway money: earnings per minute stay bounded', () => {
    for (const r of all()) {
      const e = r.earnedPerMinute;
      const last = e.at(-1)!;
      const hourAgo = e.find(([m]) => m >= last[0] - 60)!;
      const rate = (last[1] - hourAgo[1]) / Math.max(1, last[0] - hourAgo[0]);
      expect(rate).toBeLessThan(6000);
    }
  });
});
