import { DAY_REAL_SECONDS } from '@/core/clock';
import { fmt } from '@/core/i18n';
import { fail, ok } from '@/core/types';
import { FRONTS, FRONT_CAPACITY_PER_LEVEL, FRONT_UPGRADE_SHARE } from '@/content/fronts';
import type { FrontId } from '@/content/ids';
import { AUDIT_LINES } from '@/content/texts';
import type { PurchaseResult, SimResult } from '../api';
import { XP } from '../balance';
import type { SimCtx } from '../ctx';
import { t } from '../strings';
import { accountantPower } from './crew';
import { addNotoriety } from './notoriety';
import { addXp, rankLock, stat, unlockLock } from './progression';

/** Laundering fronts: one bar (today's progress) and one decision (how hard to push). */

export function frontCapacity(ctx: SimCtx, id: FrontId): number {
  const st = ctx.state.fronts[id];
  const def = FRONTS[id];
  return Math.round(def.capacity * (1 + FRONT_CAPACITY_PER_LEVEL * st.level) * (1 + 0.08 * accountantPower(ctx)));
}

export function auditRisk(ctx: SimCtx, id: FrontId): number {
  const st = ctx.state.fronts[id];
  const over = Math.max(0, st.push - 1);
  return Math.min(0.95, over * 1.8 * ctx.mods.audit * Math.max(0.2, 1 - 0.1 * accountantPower(ctx)));
}

export function buyFront(ctx: SimCtx, id: FrontId): SimResult<PurchaseResult> {
  const def = FRONTS[id];
  const st = ctx.state.fronts[id];
  if (!def || !st) return fail('notFound');
  if (st.owned) return fail('alreadyDone', t('alreadyOwned'));
  const r = rankLock(ctx, def.rank);
  if (r.locked) return fail('locked', r.reason ?? undefined);
  const u = unlockLock(ctx, def.unlock);
  if (u.locked) return fail('locked', u.reason ?? undefined);
  const paid = ctx.pay(def.price, def.currency, 'front');
  if (!paid.ok) return paid;
  st.owned = true;
  st.push = 1;
  addXp(ctx, XP.property, 'front');
  ctx.bump('fronts');
  ctx.onAction('frontBought', id);
  return ok({ item: id, qty: 1, cost: def.price, paidWith: paid.value });
}

export function upgradeFront(ctx: SimCtx, id: FrontId): SimResult<PurchaseResult> {
  const def = FRONTS[id];
  const st = ctx.state.fronts[id];
  if (!def || !st) return fail('notFound');
  if (!st.owned) return fail('notOwned', t('notOwned', { name: def.name }));
  if (st.level >= 3) return fail('alreadyDone', t('alreadyDone'));
  const cost = Math.round(def.price * FRONT_UPGRADE_SHARE * (st.level + 1));
  const paid = ctx.pay(cost, 'any', 'front');
  if (!paid.ok) return paid;
  st.level += 1;
  addXp(ctx, XP.upgrade, 'front');
  ctx.bump('fronts');
  return ok({ item: `${id}:${st.level}`, qty: 1, cost, paidWith: paid.value });
}

export function setLaunder(ctx: SimCtx, id: FrontId, push: number): SimResult {
  const st = ctx.state.fronts[id];
  if (!st) return fail('notFound');
  if (!st.owned) return fail('notOwned', t('notOwned', { name: FRONTS[id].name }));
  if (!Number.isFinite(push)) return fail('invalid');
  st.push = Math.max(0, Math.min(1.5, Math.round(push * 20) / 20));
  ctx.bump('fronts');
  return ok(undefined);
}

/** Expected clean cash from today's remaining laundering at current pushes. */
export function launderForecast(ctx: SimCtx): number {
  let total = 0;
  for (const id of Object.keys(ctx.state.fronts) as FrontId[]) {
    const st = ctx.state.fronts[id];
    if (!st.owned) continue;
    const left = Math.max(0, frontCapacity(ctx, id) * st.push - st.launderedToday);
    total += left * (1 - FRONTS[id].fee);
  }
  return Math.round(Math.min(total, ctx.state.money.dirty));
}

export function tickFronts(ctx: SimCtx, dt: number): void {
  let changed = false;
  for (const id of Object.keys(ctx.state.fronts) as FrontId[]) {
    const st = ctx.state.fronts[id];
    if (!st.owned || st.push <= 0) continue;
    const target = frontCapacity(ctx, id) * st.push;
    const left = target - st.launderedToday;
    if (left <= 0) continue;
    const amount = Math.min(left, (target / DAY_REAL_SECONDS) * dt, ctx.state.money.dirty);
    if (amount < 1) continue;
    const n = Math.floor(amount);
    const m = ctx.state.money;
    m.dirty -= n;
    st.launderedToday += n;
    const clean = Math.round(n * (1 - FRONTS[id].fee));
    ctx.earn(clean, 'clean', 'launder');
    ctx.ledger('laundered', n);
    stat(ctx, 'laundered', n);
    changed = true;
  }
  if (changed) ctx.bump('fronts', 'cash');
}

/** End of an in-game day: audits for over-pushed fronts, legit income, reset the daily bar. */
export function frontsNewDay(ctx: SimCtx): void {
  for (const id of Object.keys(ctx.state.fronts) as FrontId[]) {
    const st = ctx.state.fronts[id];
    if (!st.owned) continue;
    const def = FRONTS[id];
    const risk = auditRisk(ctx, id);
    if (risk > 0 && st.launderedToday > frontCapacity(ctx, id) && ctx.rng.chance(risk)) {
      const fine = Math.round(st.launderedToday * 0.25);
      const paid = ctx.lose(fine, 'clean', 'audit');
      st.audits += 1;
      addNotoriety(ctx, 5);
      ctx.text('herald', 'herald', AUDIT_LINES.audit.replace('{name}', def.name).replace('{amount}', fmt.money(paid)), { kind: 'system' });
    }
    ctx.earn(Math.round(def.legit * (1 + 0.3 * st.level)), 'clean', 'legit');
    st.legitToday = Math.round(def.legit * (1 + 0.3 * st.level));
    st.launderedToday = 0;
  }
  ctx.bump('fronts');
}
