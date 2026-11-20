import { fmt } from '@/core/i18n';
import { fail, ok } from '@/core/types';
import type { CustomerId, FrontId, MissionId, Tier } from '@/content/ids';
import { MISSIONS, type MissionDef, type ObjectiveDef } from '@/content/missions';
import { NEWS } from '@/content/texts';
import type { DealOutcome, HarvestResult, MissionProgress, SimResult, StoryBeat } from '../api';
import type { SimCtx } from '../ctx';
import { parseProduct, parseStack } from '../products';
import { t } from '../strings';
import { addHype } from './brand';
import { join } from './crew';
import { createRequest, unlockCustomer } from './customers';
import { payDebt, remainingDebt, startDebtSchedule } from './economy';
import { addNotoriety } from './notoriety';
import { addXp, stat } from './progression';
import { addNews } from './story';

/** The story mission state machine. The world runs set-pieces and reports what it sees. */

const ORDER = Object.keys(MISSIONS) as MissionId[];

function prog(ctx: SimCtx, id: MissionId): MissionProgress {
  return ctx.state.missions.progress[id];
}

function unlocked(ctx: SimCtx, def: MissionDef): boolean {
  const u = def.unlock;
  if (u.rank !== undefined && ctx.rank < u.rank) return false;
  if (u.after && !u.after.every((m) => prog(ctx, m).status === 'done')) return false;
  if (u.beat && ctx.state.story.beats[u.beat as StoryBeat] === undefined) return false;
  if (u.debtSettled && !ctx.state.money.debt.settled) return false;
  return true;
}

export function tickMissions(ctx: SimCtx): void {
  if (ctx.state.story.beats.prologueDone === undefined) return;
  for (const id of ORDER) {
    if (id === 'inheritance') continue;
    const p = prog(ctx, id);
    if (p.status !== 'locked') continue;
    const def = MISSIONS[id];
    if (!unlocked(ctx, def)) continue;
    p.status = 'available';
    for (const line of def.briefing) ctx.text(def.giver, def.giver, line, { kind: 'story' });
    ctx.emit('sim:mission', { mission: id, status: 'available', objective: 0 });
    ctx.bump('missions');
  }
}

function inWindow(window: readonly [number, number], hours: number): boolean {
  const [a, b] = window;
  return a <= b ? hours >= a && hours < b : hours >= a || hours < b;
}

export function missionStart(ctx: SimCtx, id: MissionId): SimResult {
  const def = MISSIONS[id];
  if (!def) return fail('notFound');
  const p = prog(ctx, id);
  if (p.status !== 'available' && p.status !== 'failed') return fail('locked', t('missionNotAvailable'));
  const active = ctx.state.missions.active;
  if (active && active !== id) return fail('busy', t('missionBusy'));
  if (def.window && !inWindow(def.window, ctx.world.hours)) {
    return fail('closed', t('missionWindow', { from: fmt.clock(def.window[0]), to: fmt.clock(def.window[1]) }));
  }
  if (p.status === 'failed') p.objective = p.checkpoint;
  else {
    p.objective = 0;
    p.checkpoint = 0;
  }
  p.status = 'active';
  p.attempts += 1;
  p.counter = 0;
  p.startedAt = ctx.now;
  ctx.state.missions.active = id;
  ctx.emit('sim:mission', { mission: id, status: 'active', objective: p.objective });
  ctx.bump('missions');
  enterObjective(ctx, id);
  return ok(undefined);
}

/** The richest unlocked buyer for a tier (for deliveries with no named customer); anyone rich will do. */
function buyerFor(ctx: SimCtx, tier: Tier): CustomerId | null {
  let best: CustomerId | null = null;
  let score = 0;
  for (const d of ctx.content.customerList) {
    if (!ctx.state.customers[d.id].unlocked) continue;
    const s = d.budget * (d.tiers.includes(tier) ? 10 : 1);
    if (s <= score) continue;
    score = s;
    best = d.id;
  }
  return best;
}

/** A delivery objective becomes an accepted request: the buyer waits at the set-piece, as long as it takes. */
function openMissionRequest(ctx: SimCtx, id: MissionId): void {
  // The prologue's scripted texts (Kiki, Marisol) are Inheritance's deliveries.
  if (id === 'inheritance') return;
  const def = MISSIONS[id];
  const p = prog(ctx, id);
  const obj = def.objectives[p.objective];
  if (!obj || obj.kind !== 'deliver' || p.counter >= obj.qty) return;
  if (ctx.state.requests.some((r) => r.mission === id && (r.status === 'pending' || r.status === 'accepted'))) return;
  const tier = obj.tier ?? 'bloom';
  const customer = obj.customer ?? buyerFor(ctx, tier);
  if (!customer) return;
  const next = def.objectives[p.objective + 1];
  const place = next?.kind === 'setpiece' && next.place ? next.place : undefined;
  const qty = obj.qty - p.counter;
  const where = place ? ctx.content.places[place].name : t('anyTime');
  const req = createRequest(ctx, customer, {
    qty, tier, effects: [], place, life: null, kind: obj.customer ? 'houseParty' : 'yacht', chips: [],
    text: t('missionRequest', { qty: String(qty), place: where }),
  });
  req.status = 'accepted';
  req.mission = id;
}

/** Entering an objective: skip what is already true, and open deliveries as requests. */
function enterObjective(ctx: SimCtx, id: MissionId): void {
  const p = prog(ctx, id);
  const obj = MISSIONS[id].objectives[p.objective];
  if (!obj) return;
  if ((obj.kind === 'buyFront' && ctx.state.fronts[obj.front]?.owned) || (obj.kind === 'pay' && ctx.state.money.debt.paid >= obj.amount)) {
    advance(ctx, id);
    return;
  }
  if (obj.kind === 'deliver') openMissionRequest(ctx, id);
}

function closeMissionRequests(ctx: SimCtx, id: MissionId): void {
  for (const r of ctx.state.requests) {
    if (r.mission !== id || (r.status !== 'pending' && r.status !== 'accepted')) continue;
    r.status = 'expired';
    ctx.emit('sim:request', { request: r.id, customer: r.customer, status: 'expired' });
  }
  ctx.bump('requests');
}

function advance(ctx: SimCtx, id: MissionId): void {
  const def = MISSIONS[id];
  const p = prog(ctx, id);
  p.objective += 1;
  p.counter = 0;
  if (def.checkpoints.includes(p.objective)) p.checkpoint = p.objective;
  ctx.emit('sim:mission', { mission: id, status: 'active', objective: p.objective });
  ctx.bump('missions');
  if (p.objective >= def.objectives.length) complete(ctx, id, null);
  else enterObjective(ctx, id);
}

export function objectiveDone(ctx: SimCtx, id: MissionId, index: number): SimResult {
  const p = prog(ctx, id);
  if (!p || p.status !== 'active') return fail('notFound');
  if (index !== p.objective) return fail('invalid');
  const obj = MISSIONS[id].objectives[index];
  if (obj?.kind === 'choice') return fail('notReady', t('needsChoice'));
  advance(ctx, id);
  return ok(undefined);
}

function applyChoice(ctx: SimCtx, id: MissionId, choice: string): SimResult {
  if (id === 'paidInFull') {
    const d = ctx.state.money.debt;
    if (choice === 'pay') {
      const left = remainingDebt(ctx);
      if (left > 0) {
        const from = ctx.state.money.dirty >= left ? 'dirty' : 'clean';
        const r = payDebt(ctx, left, from);
        if (!r.ok) return r;
      }
      d.settled = 'paid';
    } else if (choice === 'partner') {
      if (d.respect < 60) return fail('locked', t('needsMoreRespect'));
      d.settled = 'partner';
      ctx.state.rivals.vale.allied = true;
      ctx.state.rivals.vale.standing = Math.min(100, ctx.state.rivals.vale.standing + 40);
    } else if (choice === 'defy') {
      d.settled = 'defied';
      ctx.state.rivals.vale.standing = Math.max(-100, ctx.state.rivals.vale.standing - 60);
      ctx.state.rivals.vale.pressure = Math.min(100, ctx.state.rivals.vale.pressure + 40);
    } else return fail('invalid');
    ctx.bump('cash', 'rivals');
  } else if (id === 'podcast') {
    if (choice === 'vale' || choice === 'mudflaps' || choice === 'zenith') {
      const r = ctx.state.rivals[choice];
      r.pressure = Math.max(0, r.pressure - 30);
      r.standing = Math.max(-100, r.standing - 30);
      addNotoriety(ctx, -10);
      ctx.state.story.flags.reyesAlly = true;
    } else if (choice === 'nobody') {
      addNotoriety(ctx, -5);
    } else return fail('invalid');
  } else if (id === 'morningAfter') {
    if (choice !== 'legit' && choice !== 'crown') return fail('invalid');
    ctx.state.story.ending = choice;
    ctx.beat('endingChosen');
    addNews(ctx, choice === 'legit' ? NEWS.legit.replace('{brand}', ctx.state.brand?.name ?? 'Ofelia’s') : NEWS.crown);
  }
  return ok(undefined);
}

function complete(ctx: SimCtx, id: MissionId, choice: string | null): void {
  const def = MISSIONS[id];
  const p = prog(ctx, id);
  p.status = 'done';
  p.completedAt = ctx.now;
  p.choice = choice;
  if (ctx.state.missions.active === id) ctx.state.missions.active = null;
  const r = def.rewards;
  if (r.cash) ctx.earn(r.cash, r.currency, 'reward');
  if (r.xp) addXp(ctx, r.xp, 'mission');
  if (r.hype) addHype(ctx, r.hype);
  if (r.notoriety) addNotoriety(ctx, r.notoriety);
  if (r.crew) join(ctx, r.crew);
  if (r.customer) unlockCustomer(ctx, r.customer, 'mission');
  if (r.unlock && !ctx.state.progression.unlocks.includes(r.unlock)) ctx.state.progression.unlocks.push(r.unlock);
  if (r.respect) ctx.state.money.debt.respect = Math.min(100, ctx.state.money.debt.respect + r.respect);
  if (r.rival) {
    const rv = ctx.state.rivals[r.rival.id];
    rv.pressure = Math.max(0, Math.min(100, rv.pressure + r.rival.pressure));
    rv.standing = Math.max(-100, Math.min(100, rv.standing + r.rival.standing));
  }
  if (id === 'paella') startDebtSchedule(ctx);
  for (const line of def.outro) ctx.text(def.giver, def.giver, line, { kind: 'story' });
  stat(ctx, 'missions');
  ctx.emit('sim:mission', { mission: id, status: 'done', objective: p.objective });
  ctx.bump('missions', 'progression');
}

export function missionComplete(ctx: SimCtx, id: MissionId, choice?: string): SimResult {
  const def = MISSIONS[id];
  const p = prog(ctx, id);
  if (!def || !p || p.status !== 'active') return fail('notFound');
  const obj = def.objectives[p.objective];
  if (obj?.kind === 'choice') {
    if (!choice || !obj.options.some((o) => o.id === choice)) return fail('notReady', t('needsChoice'));
    const r = applyChoice(ctx, id, choice);
    if (!r.ok) return r;
    complete(ctx, id, choice);
    return ok(undefined);
  }
  if (p.objective < def.objectives.length - 1) return fail('notReady');
  complete(ctx, id, choice ?? null);
  return ok(undefined);
}

export function missionFail(ctx: SimCtx, id: MissionId, reason: string): SimResult {
  const p = prog(ctx, id);
  if (!p || p.status !== 'active') return fail('notFound');
  p.status = 'failed';
  p.counter = 0;
  if (ctx.state.missions.active === id) ctx.state.missions.active = null;
  closeMissionRequests(ctx, id);
  ctx.state.story.flags[`missionFail_${id}`] = reason.slice(0, 80);
  ctx.emit('sim:mission', { mission: id, status: 'failed', objective: p.objective });
  ctx.bump('missions');
  return ok(undefined);
}

export function missionRetry(ctx: SimCtx, id: MissionId): SimResult {
  const p = prog(ctx, id);
  if (!p || p.status !== 'failed') return fail('notFound');
  return missionStart(ctx, id);
}

/** Objectives the sim can see complete themselves. */
export function onMissionAction(ctx: SimCtx, action: string, data: unknown): void {
  const id = ctx.state.missions.active;
  if (!id) return;
  const p = prog(ctx, id);
  const obj: ObjectiveDef | undefined = MISSIONS[id].objectives[p.objective];
  if (!obj) return;
  if (obj.kind === 'deliver' && action === 'deal') {
    const o = data as DealOutcome;
    if (o.kind !== 'sale' || (obj.customer && o.customer !== obj.customer)) return;
    if (obj.tier) {
      const deal = ctx.state.deals.find((d) => d.id === o.deal);
      const tier = deal?.lastOffer ? parseProduct(parseStack(deal.lastOffer.stack)?.product ?? '')?.tier : null;
      if (tier !== obj.tier) return;
    }
    p.counter += o.qty;
    ctx.bump('missions');
    if (p.counter >= obj.qty) {
      closeMissionRequests(ctx, id);
      advance(ctx, id);
    } else openMissionRequest(ctx, id);
  } else if (obj.kind === 'harvest' && action === 'harvest') {
    p.counter += 1;
    ctx.bump('missions');
    if (p.counter >= obj.qty) advance(ctx, id);
  } else if (obj.kind === 'buyFront' && action === 'frontBought' && (data as FrontId) === obj.front) {
    advance(ctx, id);
  } else if (obj.kind === 'pay' && (action === 'debtPaid' || action === 'debtPayment') && ctx.state.money.debt.paid >= obj.amount) {
    advance(ctx, id);
  }
}

/** The world tells us a harvest happened through the sim; route it to missions. */
export function noteHarvest(ctx: SimCtx, res: HarvestResult): void {
  onMissionAction(ctx, 'harvest', res);
}

export function chooseEnding(ctx: SimCtx, ending: 'legit' | 'crown'): SimResult {
  const p = prog(ctx, 'morningAfter');
  if (p.status === 'active') return missionComplete(ctx, 'morningAfter', ending);
  if (prog(ctx, 'hurricaneNight').status !== 'done') return fail('locked', t('lockedStory'));
  if (ctx.state.story.ending === ending) return fail('alreadyDone');
  ctx.state.story.ending = ending;
  ctx.beat('endingChosen');
  ctx.bump('story');
  return ok(undefined);
}

export function objectiveText(ctx: SimCtx): { text: string; place: string | null } | null {
  const id = ctx.state.missions.active;
  if (!id) return null;
  const p = prog(ctx, id);
  const obj = MISSIONS[id].objectives[p.objective];
  if (!obj) return null;
  const place = 'place' in obj ? obj.place : null;
  const counter = (obj.kind === 'deliver' || obj.kind === 'harvest') && obj.qty > 1 ? ` (${p.counter}/${obj.qty})` : '';
  return { text: `${obj.text}${counter}`, place };
}
