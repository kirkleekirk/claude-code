import { hashString } from '@/core/rng';
import { fail, ok } from '@/core/types';
import type { CustomerId } from '@/content/ids';
import type { PlaceId } from '@/content/places';
import type {
  DealId, DealOutcome, DealState, HaggleInfo, OfferInput, RequestId, RequestWants, SimResult, StackId, StoryBeat,
} from '../api';
import { BRAND, DEALS } from '../balance';
import type { SimCtx } from '../ctx';
import { parseProduct, parseStack, productValue } from '../products';
import { t } from '../strings';
import { addHype } from './brand';
import { addAffinity, def, LEVELS, maxSpend } from './customers';
import { addNotoriety } from './notoriety';
import { addXp, stat } from './progression';

/** The handoff: one price slider against a customer's hidden, fuzzy walk-away point. */

interface Fair {
  fair: number;
  match: number;
  loved: number;
  disliked: number;
  hitsWanted: boolean;
}

/** Deterministic pick (queries must never consume the sim RNG). */
function pickLine(lines: readonly string[], seed: string): string {
  return lines[hashString(seed) % lines.length]!;
}

export function fairFor(ctx: SimCtx, customer: CustomerId, stack: StackId, qty: number, wants: RequestWants): Fair | null {
  const st = parseStack(stack);
  const p = st ? parseProduct(st.product) : null;
  if (!st || !p) return null;
  const d = def(ctx, customer);
  const value = productValue(ctx, p.tier, p.strain, p.effects, st.stars);
  const sense = 0.85 + 0.15 * ctx.content.districts[d.district].wealth;
  const loved = p.effects.filter((e) => d.loves.includes(e)).length;
  const disliked = p.effects.filter((e) => d.dislikes.includes(e)).length;
  const hitsWanted = wants.effects.length === 0 || wants.effects.some((e) => p.effects.includes(e));
  let mult = 1 + DEALS.lovedBonus * Math.min(3, loved) - DEALS.dislikedPenalty * disliked;
  if (!hitsWanted) mult *= DEALS.missPenalty;
  if (st.stars < wants.minStars) mult *= DEALS.lowQualityPenalty;
  if (!d.tiers.includes(p.tier)) mult *= 0.8;
  const demand = ctx.mods.demand[d.district] ?? 1;
  let fair = value * sense * Math.max(0.35, mult) * ctx.mods.prices * (0.9 + 0.1 * demand);
  fair = Math.min(fair, maxSpend(ctx, customer) / Math.max(1, qty));
  const match = Math.min(1, Math.max(0, (hitsWanted ? 0.5 : 0) + 0.2 * loved - 0.3 * disliked + (st.stars >= wants.minStars ? 0.2 : 0) + (p.effects.some((e) => ctx.content.effects[e].kind === 'apex') ? 0.1 : 0)));
  return { fair: Math.max(1, fair), match, loved, disliked, hitsWanted };
}

export function openDeal(ctx: SimCtx, source: { request: RequestId } | { walkUp: CustomerId; place: PlaceId }): SimResult<DealState> {
  let customer: CustomerId;
  let wants: RequestWants;
  let request: RequestId | null = null;
  let kind: DealState['kind'] = 'street';
  let place: PlaceId | null;
  if ('request' in source) {
    const r = ctx.state.requests.find((x) => x.id === source.request);
    if (!r || (r.status !== 'accepted' && r.status !== 'pending')) return fail('expired', t('requestGone'));
    if (ctx.world.place && ctx.world.place !== r.place) return fail('notHere', t('notHere', { place: ctx.content.places[r.place].name }));
    const existing = ctx.state.deals.find((d) => d.request === r.id && d.status === 'open');
    if (existing) return ok(existing);
    if (r.status === 'pending') r.status = 'accepted';
    customer = r.customer;
    wants = { ...r.wants, effects: [...r.wants.effects] };
    request = r.id;
    kind = r.kind;
    place = r.place;
  } else {
    const c = ctx.state.customers[source.walkUp];
    if (!c || !c.unlocked) return fail('notFound');
    const existing = ctx.state.deals.find((d) => d.customer === source.walkUp && d.status === 'open');
    if (existing) return ok(existing);
    const d = def(ctx, source.walkUp);
    const lvl = LEVELS.indexOf(c.level);
    customer = source.walkUp;
    wants = { effects: ctx.rng.shuffle([...d.loves]).slice(0, 2), tier: 'bloom', qty: Math.max(1, ctx.rng.int(1, 2) + (lvl >= 2 ? 1 : 0)), minStars: 1 };
    place = source.place;
  }
  const d = def(ctx, customer);
  const c = ctx.state.customers[customer];
  let tolerance = DEALS.tolerance[d.haggle] + DEALS.levelTolerance[c.level] + c.mood * 0.05 + ctx.rng.tri() * 0.06 + ctx.diff.tolerance;
  if (d.haggle === 'flaky') tolerance += ctx.rng.tri() * 0.12;
  const deal: DealState = {
    id: ctx.id('d'), customer, request, kind, place, wants, openedAt: ctx.now,
    tolerance: Math.min(0.6, Math.max(0.05, tolerance)), fuzz: DEALS.fuzz[c.level] * ctx.diff.fuzz, bandOffset: ctx.rng.next(),
    counterUnit: null, lastOffer: null, attempts: 0, status: 'open',
  };
  ctx.state.deals.push(deal);
  ctx.emit('sim:dealOpened', { deal: deal.id, customer, place });
  ctx.bump('deals');
  return ok(deal);
}

function openDealById(ctx: SimCtx, id: DealId): DealState | null {
  const d = ctx.state.deals.find((x) => x.id === id);
  return d && d.status === 'open' ? d : null;
}

export function haggleInfo(ctx: SimCtx, dealId: DealId, stack: StackId, qty: number): HaggleInfo | null {
  const deal = ctx.state.deals.find((x) => x.id === dealId);
  if (!deal) return null;
  const n = Math.max(1, Math.floor(qty));
  const f = fairFor(ctx, deal.customer, stack, n, deal.wants);
  if (!f) return null;
  const walk = f.fair * (1 + deal.tolerance);
  const width = f.fair * deal.fuzz * 2;
  const low = Math.max(f.fair, walk - width * deal.bandOffset);
  const lines = def(ctx, deal.customer).lines;
  const line = f.loved > 0 && f.hitsWanted ? lines.loved : !f.hitsWanted || f.disliked > 0 ? lines.meh : pickLine(lines.accept, deal.id);
  return {
    deal: deal.id, stack, qty: n, fair: Math.round(f.fair),
    bandLow: Math.round(low), bandHigh: Math.round(low + width),
    safe: Math.round(f.fair * (1 + deal.tolerance * DEALS.safeShare)),
    min: Math.max(1, Math.round(f.fair * 0.7)), max: Math.round(f.fair * 1.9) + 1,
    match: f.match, line,
  };
}

function checkSale(ctx: SimCtx, deal: DealState, stack: StackId, qty: number): SimResult<number> {
  const n = Math.floor(qty);
  if (n < 1) return fail('invalid', t('qtyZero'));
  if (n > deal.wants.qty + 1) return fail('invalid');
  if (ctx.units('bag', stack) < n) return fail('stock', t('stock'));
  return ok(n);
}

function completeSale(
  ctx: SimCtx, deal: DealState, stack: StackId, qty: number, unitPrice: number, perfect: boolean, extras: Pick<OfferInput, 'flow' | 'witnessed'>,
): DealOutcome {
  const d = def(ctx, deal.customer);
  const c = ctx.state.customers[deal.customer];
  const st = parseStack(stack)!;
  const p = parseProduct(st.product)!;
  const f = fairFor(ctx, deal.customer, stack, qty, deal.wants)!;
  ctx.take('bag', stack, qty);
  const total = Math.round(unitPrice * qty);
  const flow = Math.min(1, Math.max(0, extras.flow ?? 0));
  const rain = ctx.world.weather === 'rain' || ctx.world.weather === 'storm' ? DEALS.rainTip : 0;
  const tip = Math.round(total * (flow * DEALS.flowTip + DEALS.loyalTip[c.level] + rain) * ctx.mods.tips);
  ctx.earn(total, 'dirty', 'deal');
  if (tip > 0) ctx.earn(tip, 'dirty', 'tip');

  const product = ctx.state.products[st.product];
  if (product) product.sold += qty;
  const firstDeal = c.deals === 0;
  c.deals += 1;
  c.spent += total + tip;
  c.lastDealAt = ctx.now;
  c.satiation = Math.min(1, c.satiation + DEALS.satiationPerDeal);
  if (f.loved > 0 && f.hitsWanted) {
    c.favorites = [st.product, ...c.favorites.filter((x) => x !== st.product)].slice(0, 5);
    const brand = ctx.state.brand;
    if (brand) addHype(ctx, BRAND.perLovedSale + (ctx.content.brand.packaging[brand.packaging]?.hype ?? 0));
  }
  c.mood = Math.min(1, c.mood + (f.loved > 0 ? 0.15 : 0.05));
  const prog = ctx.state.progression;
  prog.perfectStreak = perfect ? prog.perfectStreak + 1 : 0;
  prog.bestPerfectStreak = Math.max(prog.bestPerfectStreak, prog.perfectStreak);

  let affinity = 4 + (f.loved > 0 && f.hitsWanted ? 3 : 0) + (st.stars >= 4 ? 2 : 0) - f.disliked * 4 - (qty < deal.wants.qty ? 2 : 0) - (f.hitsWanted ? 0 : 2);
  affinity = Math.max(-4, affinity);
  const levelUp = addAffinity(ctx, deal.customer, affinity);

  const xp = Math.round(DEALS.xpBase + Math.min(60, (total + tip) * DEALS.xpPerDollar) + (firstDeal ? DEALS.xpFirstDeal : 0) + (perfect ? DEALS.xpPerfect * Math.min(5, prog.perfectStreak) : 0));
  addXp(ctx, xp, 'deal');
  stat(ctx, 'deals');
  stat(ctx, 'unitsSold', qty);
  if (perfect) stat(ctx, 'perfectDeals');
  if (flow >= 0.25) stat(ctx, 'flowTips');

  ctx.ledger('deals', 1);
  ctx.ledger('units', qty);
  if (perfect) ctx.ledger('perfect', 1);

  let streetHeat = 0;
  if (extras.witnessed) {
    streetHeat = 1;
    ctx.ledger('closeCalls', 1);
    addNotoriety(ctx, 1.5);
  } else {
    addNotoriety(ctx, 0.12 * (p.tier === 'bloom' ? 1 : 1.5));
  }

  deal.status = 'closed';
  if (deal.request) {
    const r = ctx.state.requests.find((x) => x.id === deal.request);
    if (r) {
      r.status = 'done';
      ctx.emit('sim:request', { request: r.id, customer: r.customer, status: 'done' });
      if (r.story) ctx.beat(r.story as StoryBeat);
    }
  }
  const line = f.loved > 0 && f.hitsWanted ? d.lines.loved : !f.hitsWanted || f.disliked > 0 ? d.lines.meh : pickLine(d.lines.accept, deal.id);
  const outcome: DealOutcome = {
    deal: deal.id, customer: deal.customer, kind: 'sale', unitPrice: Math.round(unitPrice), qty, total, tip, perfect, streak: prog.perfectStreak,
    xp, affinity, level: c.level, levelUp, streetHeat, line,
  };
  ctx.emit('sim:deal', outcome);
  ctx.bump('deals', 'requests', 'customers');
  ctx.onAction('deal', outcome);
  return outcome;
}

export function offer(ctx: SimCtx, dealId: DealId, input: OfferInput): SimResult<DealOutcome> {
  const deal = openDealById(ctx, dealId);
  if (!deal) return fail('expired', t('dealGone'));
  const n = checkSale(ctx, deal, input.stack, input.qty);
  if (!n.ok) return n;
  const f = fairFor(ctx, deal.customer, input.stack, n.value, deal.wants);
  if (!f) return fail('notFound');
  const unit = Math.max(1, Math.round(input.unitPrice));
  const walk = f.fair * (1 + deal.tolerance);
  deal.lastOffer = { stack: input.stack, qty: n.value };
  if (unit <= walk) {
    const perfect = deal.counterUnit === null && unit >= walk * DEALS.perfectBand;
    return ok(completeSale(ctx, deal, input.stack, n.value, unit, perfect, input));
  }
  deal.attempts += 1;
  deal.counterUnit = Math.max(Math.round(f.fair), Math.round(walk * (0.97 - 0.03 * (deal.attempts - 1))));
  addAffinity(ctx, deal.customer, unit > walk * 1.3 ? -2 : -1);
  const c = ctx.state.customers[deal.customer];
  c.mood = Math.max(-1, c.mood - 0.1);
  const lines = def(ctx, deal.customer).lines;
  const outcome: DealOutcome = {
    deal: deal.id, customer: deal.customer, kind: 'counter', unitPrice: deal.counterUnit, qty: n.value, total: deal.counterUnit * n.value,
    tip: 0, perfect: false, streak: ctx.state.progression.perfectStreak, xp: 0, affinity: unit > walk * 1.3 ? -2 : -1,
    level: c.level, levelUp: false, streetHeat: 0, line: pickLine(lines.haggle, `${deal.id}:${deal.attempts}`),
  };
  ctx.emit('sim:deal', outcome);
  ctx.bump('deals');
  return ok(outcome);
}

export function autoPrice(ctx: SimCtx, dealId: DealId, stack: StackId, qty: number, extras: Pick<OfferInput, 'flow' | 'witnessed'> = {}): SimResult<DealOutcome> {
  const deal = openDealById(ctx, dealId);
  if (!deal) return fail('expired', t('dealGone'));
  const n = checkSale(ctx, deal, stack, qty);
  if (!n.ok) return n;
  const f = fairFor(ctx, deal.customer, stack, n.value, deal.wants);
  if (!f) return fail('notFound');
  deal.lastOffer = { stack, qty: n.value };
  return ok(completeSale(ctx, deal, stack, n.value, Math.round(f.fair * (1 + deal.tolerance * DEALS.safeShare)), false, extras));
}

export function acceptCounter(ctx: SimCtx, dealId: DealId, extras: Pick<OfferInput, 'flow' | 'witnessed'> = {}): SimResult<DealOutcome> {
  const deal = openDealById(ctx, dealId);
  if (!deal) return fail('expired', t('dealGone'));
  if (deal.counterUnit === null || !deal.lastOffer) return fail('notReady');
  const n = checkSale(ctx, deal, deal.lastOffer.stack, deal.lastOffer.qty);
  if (!n.ok) return n;
  return ok(completeSale(ctx, deal, deal.lastOffer.stack, n.value, deal.counterUnit, false, extras));
}

export function walkAway(ctx: SimCtx, dealId: DealId): SimResult {
  const deal = openDealById(ctx, dealId);
  if (!deal) return fail('expired', t('dealGone'));
  deal.status = 'walked';
  if (deal.request) {
    const r = ctx.state.requests.find((x) => x.id === deal.request);
    if (r && !r.story) {
      r.status = 'failed';
      addAffinity(ctx, deal.customer, -1);
      ctx.emit('sim:request', { request: r.id, customer: r.customer, status: 'failed' });
    }
  }
  ctx.bump('deals', 'requests');
  return ok(undefined);
}

/** Best stack in the bag for what a request or deal wants. */
export function bestStack(ctx: SimCtx, target: RequestId | DealId): StackId | null {
  const deal = ctx.state.deals.find((d) => d.id === target);
  const req = deal ? null : ctx.state.requests.find((r) => r.id === target);
  const wants = deal?.wants ?? req?.wants;
  const customer = deal?.customer ?? req?.customer;
  if (!wants || !customer) return null;
  let best: StackId | null = null;
  let bestScore = -Infinity;
  for (const stack in ctx.state.bag) {
    const units = ctx.state.bag[stack]!;
    if (units <= 0) continue;
    const f = fairFor(ctx, customer, stack, Math.min(units, wants.qty), wants);
    const st = parseStack(stack);
    const p = st ? parseProduct(st.product) : null;
    if (!f || !st || !p) continue;
    const score = (f.hitsWanted ? 100 : 0) + (p.tier === wants.tier ? 40 : 0) + f.loved * 10 - f.disliked * 30 + (units >= wants.qty ? 20 : 0) + st.stars + f.fair / 100;
    if (score > bestScore) {
      bestScore = score;
      best = stack;
    }
  }
  return best;
}

/** Customers do not wait forever at a handoff; tidy closed deals. */
export function tickDeals(ctx: SimCtx): void {
  let changed = false;
  for (const d of ctx.state.deals) {
    if (d.status === 'open' && ctx.now - d.openedAt > 240) {
      d.status = 'walked';
      changed = true;
    }
  }
  const before = ctx.state.deals.length;
  ctx.state.deals = ctx.state.deals.filter((d) => d.status === 'open' || ctx.now - d.openedAt < 300);
  if (changed || before !== ctx.state.deals.length) ctx.bump('deals');
}
