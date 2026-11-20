import { fmt } from '@/core/i18n';
import { goalBand, type GoalDef, type GoalStat } from '@/content/goals';
import { DISTRICTS } from '@/content/places';
import { MAX_RANK, rankDef, rankForXp, rankOfUnlock } from '@/content/ranks';
import type { GoalState, Lockable, RankInfo, Stats, UnlockInfo } from '../api';
import type { SimCtx } from '../ctx';
import { t } from '../strings';

/** XP, ranks, unlock checks, stat counters and rotating goals. */

export function addXp(ctx: SimCtx, amount: number, reason: string): void {
  const n = Math.round(amount);
  if (n <= 0) return;
  const p = ctx.state.progression;
  p.xp += n;
  ctx.ledger('xp', n);
  ctx.emit('sim:xp', { amount: n, total: p.xp, reason });
  const target = rankForXp(p.xp);
  while (p.rank < target && p.rank < MAX_RANK) {
    p.rank += 1;
    const def = rankDef(p.rank);
    const unlocks: UnlockInfo[] = def.unlocks.map((u) => ({ id: u.id, label: u.label, detail: u.detail, icon: u.icon }));
    for (const u of def.unlocks) if (!p.unlocks.includes(u.id)) p.unlocks.push(u.id);
    ctx.emit('sim:rankUp', { rank: p.rank, title: def.title, unlocks });
    ctx.toast(t('rankUp', { rank: p.rank, title: def.title }), 'good', 'star');
    ctx.onRank(p.rank);
  }
  ctx.bump('progression');
}

/** Increment a stat counter (and let goals see it). */
export function stat(ctx: SimCtx, key: keyof Stats, n = 1): void {
  ctx.state.progression.stats[key] += n;
  ctx.bump('progression');
}

export function rankInfo(ctx: SimCtx): RankInfo {
  const p = ctx.state.progression;
  const def = rankDef(p.rank);
  const next = p.rank < MAX_RANK ? rankDef(p.rank + 1) : null;
  const xpThis = def.xp;
  const xpNext = next ? next.xp : null;
  return {
    rank: p.rank, title: def.title, xp: p.xp, xpThis, xpNext,
    progress: xpNext === null ? 1 : Math.min(1, (p.xp - xpThis) / Math.max(1, xpNext - xpThis)),
    nextUnlocks: next ? next.unlocks.map((u) => ({ id: u.id, label: u.label, detail: u.detail, icon: u.icon })) : [],
  };
}

/** "Unlocks at Rank 4" (optionally "· Sells to Deco Row"). */
export function rankLock(ctx: SimCtx, rank: number, where?: string): Lockable {
  if (ctx.rank >= rank) return { locked: false, reason: null };
  return { locked: true, reason: where ? t('lockedRankWhere', { rank, where }) : t('lockedRank', { rank }) };
}

/** Lock status for an unlock id (rank-granted, upgrade-granted or story). */
export function unlockLock(ctx: SimCtx, id: string): Lockable {
  if (ctx.isUnlocked(id)) return { locked: false, reason: null };
  const rank = rankOfUnlock(id);
  if (rank !== null && rank > ctx.rank) return { locked: true, reason: t('lockedRank', { rank }) };
  for (const upId of ctx.content.upgradeOrder) {
    const up = ctx.content.upgrades[upId];
    if (up.effects.unlocks === id) return { locked: true, reason: t('lockedUpgrade', { name: up.name }) };
  }
  return { locked: true, reason: t('lockedStory') };
}

export function districtName(id: keyof typeof DISTRICTS): string {
  return DISTRICTS[id].name;
}

// ── goals ───────────────────────────────────────────────────────────────────

function statValue(ctx: SimCtx, s: GoalStat): number {
  return ctx.state.progression.stats[s];
}

function goalText(def: GoalDef, target: number): string {
  const n = def.stat === 'earned' || def.stat === 'laundered' ? fmt.money(target) : String(target);
  return def.text.replace('{n}', n);
}

export function goalLabel(ctx: SimCtx, g: GoalState): string {
  const def = ctx.content.goals.find((d) => d.id === g.def);
  return def ? goalText(def, g.target) : g.def;
}

function issueGoal(ctx: SimCtx): void {
  const p = ctx.state.progression;
  const active = new Set(p.goals.map((g) => g.def));
  const band = goalBand(ctx.rank);
  const pool = ctx.content.goals.filter(
    (d) => !active.has(d.id) && d.minRank <= ctx.rank && (!d.unlock || ctx.isUnlocked(d.unlock)) && d.targets[band] > 0,
  );
  if (pool.length === 0) return;
  const def = ctx.rng.pick(pool);
  const target = def.targets[band];
  const money = def.stat === 'earned' || def.stat === 'laundered';
  const xp = Math.round(25 + 15 * (band + 1) + (money ? 0 : target * 2));
  const cash = Math.round((def.stat === 'earned' ? target * 0.1 : 60 * (band + 1) * (1 + band * 0.6)) / 5) * 5;
  const g: GoalState = {
    id: ctx.id('g'), def: def.id, target, progress: 0, base: statValue(ctx, def.stat), reward: { cash, xp }, done: false,
  };
  p.goals.push(g);
  ctx.emit('sim:goal', { goal: g.id, status: 'new' });
  ctx.bump('goals');
}

/** Keep three goals running; pay out finished ones. Cheap enough to run every tick. */
export function tickGoals(ctx: SimCtx): void {
  const p = ctx.state.progression;
  // Goals start once the prologue is over so the first ten minutes stay focused.
  if (ctx.state.story.beats.prologueDone === undefined) return;
  let changed = false;
  for (const g of p.goals) {
    if (g.done) continue;
    const def = ctx.content.goals.find((d) => d.id === g.def);
    if (!def) {
      g.done = true;
      continue;
    }
    const progress = Math.max(0, statValue(ctx, def.stat) - g.base);
    if (progress !== g.progress) {
      g.progress = Math.min(progress, g.target);
      changed = true;
    }
    if (progress >= g.target) {
      g.done = true;
      p.goalsDone += 1;
      ctx.earn(g.reward.cash, 'dirty', 'reward');
      addXp(ctx, g.reward.xp, 'goal');
      ctx.emit('sim:goal', { goal: g.id, status: 'done' });
      ctx.toast(t('goalDone', { text: goalText(def, g.target) }), 'good', def.icon);
      changed = true;
    }
  }
  const before = p.goals.length;
  p.goals = p.goals.filter((g) => !g.done);
  if (p.goals.length !== before) changed = true;
  while (p.goals.length < 3) {
    const n = p.goals.length;
    issueGoal(ctx);
    if (p.goals.length === n) break;
    changed = true;
  }
  if (changed) ctx.bump('goals');
}
