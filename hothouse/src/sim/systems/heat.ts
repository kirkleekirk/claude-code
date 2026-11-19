import { fmt } from '@/core/i18n';
import { fail, ok } from '@/core/types';
import type { PropertyId } from '@/content/ids';
import { BUST_LINES, NEWS, RAID_LINES, TIPSTER_LINES } from '@/content/texts';
import type { BustReport, RaidOutcome, RaidPrep, RaidState, SimResult, StackId } from '../api';
import { BRAND, GROW, XP } from '../balance';
import type { SimCtx } from '../ctx';
import { stackValue } from '../products';
import { t } from '../strings';
import { addHype } from './brand';
import { guardSecurity, lookoutPower } from './crew';
import { hasStation, plantsAt, sumEffect } from './layout';
import { addNotoriety } from './notoriety';
import { addXp, stat } from './progression';

/** Long-term notoriety, telegraphed raids, busts, escapes, bribes, and property gauges. */

const RAID_THRESHOLDS = [40, 65, 85] as const;
const RAID_LEAD = 210;
const RAID_AUTO_RESOLVE = 45;
const LOCKDOWN = 240;

// ── gauges ──────────────────────────────────────────────────────────────────

export function visibilityOf(ctx: SimCtx, prop: PropertyId): number {
  const st = ctx.state.properties[prop];
  if (!st.owned) return 0;
  const plants = plantsAt(ctx, prop).length;
  const glow = plants * 2.2 * GROW.lightVisibility[st.lights];
  const raw = glow + sumEffect(ctx, prop, 'visibility') + (hasStation(ctx, prop, 'coldStill') ? 4 : 0);
  const reduced = raw * ctx.upgradeMods().visibility - lookoutPower(ctx, prop) * 8;
  return Math.round(Math.max(0, Math.min(100, reduced)));
}

export function securityOf(ctx: SimCtx, prop: PropertyId): number {
  const st = ctx.state.properties[prop];
  if (!st.owned) return 0;
  const raw = sumEffect(ctx, prop, 'security') + st.tracks.security * 10 + guardSecurity(ctx, prop);
  return Math.round(Math.max(0, Math.min(100, raw)));
}

export function refreshGauges(ctx: SimCtx): void {
  let changed = false;
  for (const id of Object.keys(ctx.state.properties) as PropertyId[]) {
    const st = ctx.state.properties[id];
    const v = visibilityOf(ctx, id);
    const s = securityOf(ctx, id);
    if (v !== st.visibility || s !== st.security) {
      st.visibility = v;
      st.security = s;
      changed = true;
    }
  }
  if (changed) ctx.bump('properties');
}

// ── raids ───────────────────────────────────────────────────────────────────

function raidTarget(ctx: SimCtx): PropertyId | null {
  let best: PropertyId | null = null;
  let bestScore = -1;
  for (const id of Object.keys(ctx.state.properties) as PropertyId[]) {
    const st = ctx.state.properties[id];
    if (!st.owned) continue;
    let value = 0;
    for (const k in st.stash) value += stackValue(ctx, k) * st.stash[k]!;
    const score = (st.visibility + 5) * (1 + value / 2000) + plantsAt(ctx, id).length;
    if (score > bestScore) {
      bestScore = score;
      best = id;
    }
  }
  return best;
}

function scheduleRaid(ctx: SimCtx): void {
  const prop = raidTarget(ctx);
  if (!prop) return;
  const lead = RAID_LEAD * (1 + lookoutPower(ctx, prop) * 0.1) * (hasStation(ctx, prop, 'lookout') ? 1.15 : 1) * (sumEffect(ctx, prop, 'security') >= 8 ? 1.1 : 1);
  const raid: RaidState = { property: prop, warnedAt: ctx.now, at: ctx.now + lead, status: 'warned', prep: [], outcome: null };
  ctx.state.heat.raid = raid;
  const place = ctx.content.properties[prop].name;
  ctx.text('tipster', 'tipster', ctx.rng.pick(TIPSTER_LINES.raid).replace('{place}', place), { kind: 'tip' });
  ctx.emit('sim:raid', { property: prop, status: 'warned', at: raid.at });
  ctx.bump('heat');
}

export function raidPrepare(ctx: SimCtx, action: RaidPrep): SimResult<RaidState> {
  const raid = ctx.state.heat.raid;
  if (!raid || (raid.status !== 'warned' && raid.status !== 'imminent')) return fail('notFound');
  if (raid.prep.includes(action)) return fail('alreadyDone', t('alreadyDone'));
  const prop = raid.property;
  if (action === 'moveStock') {
    const other = (Object.keys(ctx.state.properties) as PropertyId[]).find((id) => id !== prop && ctx.state.properties[id].owned);
    const stash = ctx.state.properties[prop].stash;
    for (const k of Object.keys(stash)) {
      const n = stash[k]!;
      ctx.take(prop, k, n);
      ctx.add(other ?? 'bag', k, n);
    }
  } else if (action === 'hireGuards') {
    const paid = ctx.pay(600 + ctx.rank * 150, 'any', 'raid');
    if (!paid.ok) return paid;
  } else if (action === 'bribe') {
    const cost = Math.round(1500 + ctx.state.heat.notoriety * 45 + ctx.rank * 200);
    const paid = ctx.pay(cost, 'any', 'bribe');
    if (!paid.ok) return paid;
    raid.status = 'cancelled';
    raid.outcome = { result: 'bribed', confiscated: [], cashLost: 0, lockdownSeconds: 0, notorietyAfter: 0 };
    addNotoriety(ctx, -12);
    raid.outcome.notorietyAfter = ctx.state.heat.notoriety;
    ctx.text('tipster', 'tipster', TIPSTER_LINES.cancelled.replace('{place}', ctx.content.properties[prop].name), { kind: 'tip' });
    ctx.emit('sim:raid', { property: prop, status: 'cancelled', at: raid.at });
  }
  raid.prep.push(action);
  ctx.bump('heat');
  return ok(raid);
}

function applyRaid(ctx: SimCtx, result: RaidOutcome['result']): RaidOutcome {
  const raid = ctx.state.heat.raid!;
  const prop = raid.property;
  const st = ctx.state.properties[prop];
  const security = securityOf(ctx, prop) + (raid.prep.includes('hireGuards') ? 20 : 0);
  const confiscated: Array<{ stack: StackId; units: number }> = [];
  let cashLost = 0;
  let lockdown = 0;
  let res = result;
  if (res === 'raided') {
    const share = Math.max(0.1, 0.5 * ctx.diff.raidLoss * (1 - security / 150));
    for (const k of Object.keys(st.stash)) {
      const n = Math.floor(st.stash[k]! * share);
      if (n > 0) {
        ctx.take(prop, k, n);
        confiscated.push({ stack: k, units: n });
      }
    }
    cashLost = ctx.lose(Math.min(ctx.state.money.dirty * 0.1, 2000 + ctx.rank * 500), 'dirty', 'raid');
    lockdown = LOCKDOWN;
    st.lockdownUntil = ctx.now + lockdown;
    addNotoriety(ctx, -25);
    addHype(ctx, -BRAND.raidPenalty);
  } else if (res === 'repelled') {
    addNotoriety(ctx, -15);
    addXp(ctx, 60, 'raid');
    ctx.state.heat.raidsSurvived += 1;
  } else if (res === 'evaded') {
    addNotoriety(ctx, -20);
    addXp(ctx, 40, 'raid');
    ctx.state.heat.raidsSurvived += 1;
  } else {
    res = 'bribed';
    addNotoriety(ctx, -12);
  }
  stat(ctx, 'raids');
  const outcome: RaidOutcome = { result: res, confiscated, cashLost, lockdownSeconds: lockdown, notorietyAfter: ctx.state.heat.notoriety };
  raid.status = 'resolved';
  raid.outcome = outcome;
  const units = confiscated.reduce((s, c) => s + c.units, 0);
  ctx.text('tipster', 'tipster', RAID_LINES[res].replace('{n}', String(units)), { kind: 'tip' });
  ctx.emit('sim:raid', { property: prop, status: 'resolved', at: raid.at });
  if (res === 'raided') ctx.onAction('news', NEWS.raid.replace('{place}', ctx.content.properties[prop].name));
  ctx.bump('heat', 'properties', 'inventory');
  return outcome;
}

/** The world reports how Raid Night went. */
export function raidResolve(ctx: SimCtx, result: RaidOutcome['result']): SimResult<RaidOutcome> {
  const raid = ctx.state.heat.raid;
  if (!raid || (raid.status !== 'active' && raid.status !== 'imminent' && raid.status !== 'warned')) return fail('notFound');
  return ok(applyRaid(ctx, result));
}

/** Without a Raid Night set-piece, prep decides the result. */
function autoResult(ctx: SimCtx, raid: RaidState): RaidOutcome['result'] {
  if (raid.prep.includes('moveStock')) return 'evaded';
  const security = securityOf(ctx, raid.property) + (raid.prep.includes('hireGuards') ? 20 : 0);
  return ctx.rng.chance(Math.min(0.85, security / 100 + (raid.prep.includes('standGround') ? 0.15 : 0))) ? 'repelled' : 'raided';
}

// ── busts, escapes, bribes ──────────────────────────────────────────────────

export function bust(ctx: SimCtx): SimResult<BustReport> {
  const cash = ctx.state.money.dirty + ctx.state.money.clean;
  const cap = 400 + ctx.rank * 450;
  const fee = Math.round(Math.min(cash * 0.08 * ctx.diff.bustFee, cap));
  const paidFee = ctx.lose(fee, 'dirty', 'bust');
  const lost: Array<{ stack: StackId; units: number }> = [];
  for (const k of Object.keys(ctx.state.bag)) {
    const have = ctx.state.bag[k]!;
    const n = Math.min(have, Math.max(have >= 2 ? 1 : 0, Math.round(have * ctx.diff.bagLoss)));
    if (n > 0) {
      ctx.take('bag', k, n);
      lost.push({ stack: k, units: n });
    }
  }
  addNotoriety(ctx, 8);
  addHype(ctx, -BRAND.bustPenalty);
  ctx.state.heat.busts += 1;
  ctx.state.heat.lastBustAt = ctx.now;
  stat(ctx, 'busts');
  ctx.state.progression.perfectStreak = 0;
  const report: BustReport = { fee: paidFee, lost, notoriety: ctx.state.heat.notoriety, line: ctx.rng.pick(BUST_LINES) };
  ctx.text('sy', 'sy', report.line, { kind: 'story' });
  ctx.emit('sim:bust', report);
  ctx.onAction('news', NEWS.bust.replace('{place}', ctx.world.place ? ctx.content.places[ctx.world.place].name : 'the Causeway'));
  ctx.bump('heat', 'inventory');
  return ok(report);
}

export function escaped(ctx: SimCtx, level: number): SimResult {
  const n = Math.max(1, Math.min(5, Math.round(level)));
  ctx.state.heat.escapes += 1;
  stat(ctx, 'escapes');
  addNotoriety(ctx, n * 1.5);
  addXp(ctx, XP.escape * n, 'escape');
  ctx.ledger('closeCalls', 1);
  ctx.bump('heat');
  return ok(undefined);
}

export function bribe(ctx: SimCtx, amount: number): SimResult<{ notoriety: number }> {
  const n = Math.round(amount);
  if (n < 500) return fail('invalid', t('cash', { amount: fmt.money(500) }));
  const paid = ctx.pay(n, 'any', 'bribe');
  if (!paid.ok) return paid;
  const h = ctx.state.heat;
  addNotoriety(ctx, -Math.min(30, n / 150));
  h.bribedUntil = Math.max(h.bribedUntil, ctx.now) + 120 + n / 20;
  return ok({ notoriety: h.notoriety });
}

// ── tick ────────────────────────────────────────────────────────────────────

export function tickHeat(ctx: SimCtx, dt: number): void {
  const h = ctx.state.heat;
  refreshGauges(ctx);
  // Visibility keeps attention simmering; time, bribes and clean fronts cool it down.
  let vis = 0;
  for (const st of Object.values(ctx.state.properties)) if (st.owned) vis += st.visibility;
  const fronts = Object.values(ctx.state.fronts).filter((f) => f.owned).length;
  const decay = (0.5 * ctx.diff.notorietyDecay * (h.bribedUntil > ctx.now ? 2 : 1) + fronts * 0.08) * (dt / 60);
  const gain = (vis / 100) * 0.3 * (dt / 60);
  if (gain > 0) addNotoriety(ctx, gain);
  if (decay > 0) addNotoriety(ctx, -decay);

  // Thresholds re-arm when notoriety falls well below them.
  h.thresholdsHit = h.thresholdsHit.filter((x) => h.notoriety >= x - 15);
  const raid = h.raid;
  if (!raid || raid.status === 'resolved' || raid.status === 'cancelled') {
    for (const x of RAID_THRESHOLDS) {
      if (h.notoriety >= x && !h.thresholdsHit.includes(x)) {
        h.thresholdsHit.push(x);
        if (ctx.state.story.beats.prologueDone !== undefined) scheduleRaid(ctx);
        break;
      }
    }
    return;
  }
  const place = ctx.content.properties[raid.property].name;
  if (raid.status === 'warned' && ctx.now >= raid.at - 30) {
    raid.status = 'imminent';
    ctx.text('tipster', 'tipster', TIPSTER_LINES.imminent.replace('{place}', place), { kind: 'tip' });
    ctx.emit('sim:raid', { property: raid.property, status: 'imminent', at: raid.at });
    ctx.bump('heat');
  }
  if (raid.status === 'imminent' && ctx.now >= raid.at && !ctx.world.busy) {
    raid.status = 'active';
    ctx.emit('sim:raid', { property: raid.property, status: 'active', at: raid.at });
    ctx.bump('heat');
  }
  // If nobody runs a Raid Night set-piece, it resolves on its own.
  if (raid.status === 'active' && ctx.now >= raid.at + RAID_AUTO_RESOLVE) applyRaid(ctx, autoResult(ctx, raid));
}

/** The world needs these for spawning cops: police multiplier per district from events and notoriety. */
export function policeLevel(ctx: SimCtx): number {
  return 1 + ctx.state.heat.notoriety / 100;
}
