import { fmt } from '@/core/i18n';
import { fail, ok } from '@/core/types';
import type { CustomerDef, Hangout } from '@/content/customers';
import { EFFECTS, type EffectId } from '@/content/effects';
import type { CustomerId, Tier } from '@/content/ids';
import type { DistrictId, PlaceId } from '@/content/places';
import type {
  Chip, CustomerState, DealKind, RelationshipLevel, RequestState, RequestWants, SampleResult, SimResult, StackId, UnlockVia, WalkUpCandidate,
} from '../api';
import { DEALS, REQUESTS, XP } from '../balance';
import type { SimCtx } from '../ctx';
import { parseProduct, parseStack, productValue } from '../products';
import { t } from '../strings';
import { addXp, stat } from './progression';

/** Customers: unlocks, relationships, text requests, walk-ups and free samples. */

export const LEVELS: readonly RelationshipLevel[] = ['stranger', 'regular', 'loyal', 'superfan'];

export function levelFor(affinity: number): RelationshipLevel {
  if (affinity >= DEALS.superfan) return 'superfan';
  if (affinity >= DEALS.loyal) return 'loyal';
  if (affinity >= DEALS.regular) return 'regular';
  return 'stranger';
}

export function def(ctx: SimCtx, id: CustomerId): CustomerDef {
  return ctx.content.customers[id];
}

function inWindow(h: Hangout, hours: number): boolean {
  const x = ((hours % 24) + 24) % 24;
  return h.from <= h.to ? x >= h.from && x < h.to : x >= h.from || x < h.to;
}

export function activeHangout(d: CustomerDef, hours: number): Hangout | null {
  return d.hangouts.find((h) => inWindow(h, hours)) ?? null;
}

/** Where to meet: their current hangout, else the next one to open. */
export function meetPlace(d: CustomerDef, hours: number): PlaceId {
  const now = activeHangout(d, hours);
  if (now) return now.place;
  let best = d.hangouts[0]!;
  let bestWait = 99;
  for (const h of d.hangouts) {
    const wait = (((h.from - hours) % 24) + 24) % 24;
    if (wait < bestWait) {
      bestWait = wait;
      best = h;
    }
  }
  return best.place;
}

export function fill(ctx: SimCtx, template: string, vars: { effects?: readonly EffectId[]; qty?: number; place?: PlaceId; time?: string }): string {
  const names = (vars.effects ?? []).map((e) => EFFECTS[e].name);
  const effect = names.length === 0 ? t('anythingGood') : names.length === 1 ? names[0]! : t('or', { a: names[0]!, b: names[1]! });
  return template
    .replaceAll('{effect}', effect)
    .replaceAll('{qty}', String(vars.qty ?? 2))
    .replaceAll('{place}', vars.place ? ctx.content.places[vars.place].name : '')
    .replaceAll('{time}', vars.time ?? t('anyTime'))
    .replaceAll('{brand}', ctx.state.brand?.name ?? t('yourStuff'));
}

// ── unlocks and relationships ───────────────────────────────────────────────

export function unlockCustomer(ctx: SimCtx, id: CustomerId, via: UnlockVia, introFrom?: CustomerId): boolean {
  const c = ctx.state.customers[id];
  if (!c || c.unlocked) return false;
  c.unlocked = true;
  c.unlockedAt = ctx.now;
  c.unlockedVia = via;
  const d = def(ctx, id);
  if (via === 'referral' && introFrom) ctx.text(id, id, t('referralIntro', { name: def(ctx, introFrom).short }));
  else if (via === 'rank') ctx.text(id, id, t('vipIntro'));
  if (via !== 'start' && via !== 'story') ctx.toast(t('newCustomer', { name: d.short }), 'good', 'person');
  ctx.emit('sim:customerUnlocked', { customer: id, via });
  ctx.bump('customers');
  return true;
}

export function addAffinity(ctx: SimCtx, id: CustomerId, delta: number): boolean {
  const c = ctx.state.customers[id];
  if (!c || delta === 0) return false;
  const previous = c.level;
  c.affinity = Math.max(0, c.affinity + delta);
  c.level = levelFor(c.affinity);
  ctx.bump('customers');
  if (LEVELS.indexOf(c.level) <= LEVELS.indexOf(previous)) return false;
  // Climbed one or more levels: deliver each beat in order.
  for (let i = LEVELS.indexOf(previous) + 1; i <= LEVELS.indexOf(c.level); i++) {
    const level = LEVELS[i] as Exclude<RelationshipLevel, 'stranger'>;
    deliverBeat(ctx, c, level);
  }
  ctx.emit('sim:relationship', { customer: id, level: c.level, previous });
  ctx.toast(t('levelUp', { name: def(ctx, id).short, level: t(`level.${c.level}`) }), 'good', 'heart');
  return true;
}

function deliverBeat(ctx: SimCtx, c: CustomerState, level: Exclude<RelationshipLevel, 'stranger'>): void {
  if (c.beats.includes(level)) return;
  c.beats.push(level);
  addXp(ctx, XP.levelUp[level], 'relationship');
  const beat = def(ctx, c.id).beats.find((b) => b.level === level);
  if (!beat) return;
  ctx.text(c.id, c.id, beat.text, { kind: 'story' });
  const g = beat.gift;
  if (g) {
    if (g.cash) ctx.earn(g.cash, 'dirty', 'reward');
    if (g.seed) ctx.addSupply(`seed:${g.seed}`, g.qty ?? 1);
    if (g.additive) ctx.addSupply(`add:${g.additive}`, g.qty ?? 1);
  }
  if (beat.refer) unlockCustomer(ctx, beat.refer, 'referral', c.id);
}

// ── requests ────────────────────────────────────────────────────────────────

function openRequestOf(ctx: SimCtx, id: CustomerId): RequestState | null {
  return ctx.state.requests.find((r) => r.customer === id && (r.status === 'pending' || r.status === 'accepted')) ?? null;
}

function bestTierFor(ctx: SimCtx, d: CustomerDef): Tier {
  const has = (tier: Tier) => {
    const check = (store: Record<string, number>) => Object.keys(store).some((k) => parseProduct(parseStack(k)?.product ?? '')?.tier === tier);
    if (check(ctx.state.bag)) return true;
    return Object.values(ctx.state.properties).some((p) => p.owned && check(p.stash));
  };
  for (const tier of ['halos', 'dew'] as const) if (d.tiers.includes(tier) && has(tier) && ctx.rng.chance(0.6)) return tier;
  return d.tiers.includes('bloom') ? 'bloom' : d.tiers[0]!;
}

/** Most a customer will spend on one deal right now. */
export function maxSpend(ctx: SimCtx, id: CustomerId): number {
  const d = def(ctx, id);
  const c = ctx.state.customers[id];
  const night = ctx.world.hours >= 20 || ctx.world.hours < 5 ? 1.1 : 1;
  const demand = ctx.mods.demand[d.district] ?? 1;
  return d.budget * DEALS.levelSpend[c.level] * ctx.diff.spend * night * Math.max(0.6, demand) * ctx.mods.prices;
}

/** A reasonable reference price per unit for a customer and tier, from what the player owns. */
function referenceUnit(ctx: SimCtx, wants: RequestWants): number {
  let best = 0;
  const consider = (stack: StackId) => {
    const st = parseStack(stack);
    const p = st ? parseProduct(st.product) : null;
    if (!st || !p || p.tier !== wants.tier) return;
    if (wants.effects.length && !wants.effects.some((e) => p.effects.includes(e))) return;
    best = Math.max(best, productValue(ctx, p.tier, p.strain, p.effects, st.stars));
  };
  for (const k in ctx.state.bag) consider(k);
  for (const p of Object.values(ctx.state.properties)) if (p.owned) for (const k in p.stash) consider(k);
  if (best > 0) return best;
  return 36 * (wants.tier === 'dew' ? 4.5 : wants.tier === 'halos' ? 1.5 : 1);
}

export function requestChips(): Chip[] {
  return [
    { id: 'accept', label: t('chipAccept'), tone: 'primary' },
    { id: 'counter', label: t('chipCounter'), tone: 'secondary' },
    { id: 'decline', label: t('chipDecline'), tone: 'danger' },
  ];
}

export interface RequestOptions {
  effects?: EffectId[];
  qty?: number;
  tier?: Tier;
  place?: PlaceId;
  offer?: number;
  /** Seconds until it lapses; null = waits forever (story). */
  life?: number | null;
  kind?: DealKind;
  story?: string | null;
  text?: string;
  chips?: Chip[];
}

export function createRequest(ctx: SimCtx, id: CustomerId, opts: RequestOptions = {}): RequestState {
  const d = def(ctx, id);
  const c = ctx.state.customers[id];
  const lvl = LEVELS.indexOf(c.level);
  const effects = opts.effects ?? (
    (d.haggle === 'easygoing' || d.haggle === 'generous') && ctx.rng.chance(0.2)
      ? []
      : ctx.rng.shuffle([...d.loves]).slice(0, ctx.rng.chance(0.35) ? 2 : 1)
  );
  const qty = opts.qty ?? Math.max(1, ctx.rng.int(d.qty[0], d.qty[1]) + (lvl >= 2 ? 1 : 0) + (lvl >= 3 ? 1 : 0));
  const tier = opts.tier ?? bestTierFor(ctx, d);
  const wants: RequestWants = { effects, tier, qty, minStars: lvl >= 3 ? 3 : lvl >= 2 ? 2 : 1 };
  const place = opts.place ?? meetPlace(d, ctx.world.hours);
  const offer = opts.offer ?? Math.round(Math.min(maxSpend(ctx, id), qty * referenceUnit(ctx, wants)) / 5) * 5;
  const lifeScale = d.haggle === 'easygoing' || d.haggle === 'generous' ? 1.2 : d.haggle === 'shrewd' ? 0.85 : 1;
  const life = opts.life === undefined ? ctx.rng.range(REQUESTS.minLife, REQUESTS.maxLife) * lifeScale : opts.life;
  const expiresAt = life === null ? null : ctx.now + life;
  const by = expiresAt === null ? null : ctx.clockIn(expiresAt - ctx.now);
  const req: RequestState = {
    id: ctx.id('r'), customer: id, kind: opts.kind ?? 'street', place, wants, offer: Math.max(5, offer), createdAt: ctx.now,
    expiresAt, byDay: by?.day ?? null, byHours: by?.hours ?? null, status: 'pending', counter: null,
    story: opts.story ?? null, mission: null, message: null,
  };
  const time = expiresAt === null ? t('anyTime') : ctx.byText(expiresAt);
  const text = opts.text ?? fill(ctx, ctx.rng.pick(d.lines.request), { effects, qty, place, time });
  const msg = ctx.text(id, id, text, { kind: 'request', chips: opts.chips ?? requestChips(), request: req.id });
  req.message = msg.id;
  ctx.state.requests.push(req);
  c.lastRequestAt = ctx.now;
  ctx.emit('sim:request', { request: req.id, customer: id, status: 'pending' });
  ctx.bump('requests');
  return req;
}

export function replyRequest(ctx: SimCtx, id: string, reply: 'accept' | 'counter' | 'decline'): SimResult<RequestState> {
  const r = ctx.state.requests.find((x) => x.id === id);
  if (!r || (r.status !== 'pending' && !(reply === 'decline' && r.status === 'accepted'))) return fail('expired', t('requestGone'));
  const d = def(ctx, r.customer);
  const c = ctx.state.customers[r.customer];
  if (reply === 'accept') {
    r.status = 'accepted';
    ctx.text(r.customer, 'player', t('chipAccept'));
  } else if (reply === 'counter') {
    if (r.counter !== null || r.story) {
      r.status = 'accepted';
      ctx.text(r.customer, 'player', t('chipAccept'));
    } else {
      ctx.text(r.customer, 'player', t('chipCounter'));
      const chance = REQUESTS.counterChance[d.haggle] + (LEVELS.indexOf(c.level) * 0.08);
      if (ctx.rng.chance(chance)) {
        r.offer = Math.round((r.offer * REQUESTS.counterBoost) / 5) * 5;
        r.counter = r.offer;
        r.status = 'accepted';
        ctx.text(r.customer, r.customer, t('counterYes', { amount: fmt.money(r.offer) }));
      } else {
        r.counter = 0;
        c.mood = Math.max(-1, c.mood - 0.05);
        ctx.text(r.customer, r.customer, t('counterNo'), { kind: 'request', chips: requestChips().filter((x) => x.id !== 'counter'), request: r.id });
      }
    }
  } else {
    r.status = 'declined';
    c.mood = Math.max(-1, c.mood - 0.1);
    ctx.text(r.customer, 'player', t('chipDecline'));
    ctx.text(r.customer, r.customer, ctx.rng.pick(d.lines.decline));
  }
  if (r.message) {
    const found = ctx.findMessage(r.message);
    if (found && !found.message.chosen) found.message.chosen = reply;
  }
  ctx.emit('sim:request', { request: r.id, customer: r.customer, status: r.status });
  ctx.bump('requests', 'messages');
  if (r.status === 'accepted') ctx.onAction('requestAccepted', r);
  return ok(r);
}

function requestWeight(ctx: SimCtx, d: CustomerDef): number {
  const c = ctx.state.customers[d.id];
  if (!c.unlocked || c.satiation > 0.5 || openRequestOf(ctx, d.id)) return 0;
  if (ctx.now - c.lastRequestAt < 90 || ctx.now - c.lastDealAt < 60) return 0;
  if (ctx.state.deals.some((x) => x.customer === d.id && x.status === 'open')) return 0;
  let w = activeHangout(d, ctx.world.hours) ? 1.6 : 0.6;
  w *= [1, 1.3, 1.6, 2][LEVELS.indexOf(c.level)]!;
  w *= ctx.mods.demand[d.district] ?? 1;
  let vibe = 1;
  for (const e of d.loves) for (const v of EFFECTS[e].vibes) vibe = Math.max(vibe, ctx.mods.vibe[v] ?? 1);
  return w * vibe * (1 + c.mood * 0.3);
}

function requestSlots(ctx: SimCtx): number {
  return REQUESTS.slots + ctx.upgradeMods().requestSlots + (ctx.rank >= 5 ? 1 : 0) + (ctx.rank >= 8 ? 1 : 0);
}

export function tickCustomers(ctx: SimCtx, dt: number): void {
  const s = ctx.state;
  for (const id in s.customers) {
    const c = s.customers[id as CustomerId]!;
    if (c.satiation > 0) c.satiation = Math.max(0, c.satiation - dt * DEALS.satiationDecay);
    if (c.mood !== 0) c.mood = c.mood > 0 ? Math.max(0, c.mood - dt / 600) : Math.min(0, c.mood + dt / 600);
  }
  // Expiry.
  let changed = false;
  for (const r of s.requests) {
    if (r.expiresAt === null || ctx.now < r.expiresAt) continue;
    if (r.status === 'pending') {
      r.status = 'expired';
      changed = true;
      ctx.emit('sim:request', { request: r.id, customer: r.customer, status: 'expired' });
    } else if (r.status === 'accepted' && !s.deals.some((d) => d.request === r.id && d.status === 'open')) {
      r.status = 'failed';
      changed = true;
      addAffinity(ctx, r.customer, REQUESTS.failAffinity);
      ctx.text(r.customer, r.customer, ctx.rng.pick(def(ctx, r.customer).lines.decline));
      ctx.toast(t('requestExpired', { name: def(ctx, r.customer).short }), 'warn', 'clock');
      ctx.emit('sim:request', { request: r.id, customer: r.customer, status: 'failed' });
    }
  }
  // Keep only open requests and the most recent closed ones (for the Messages history chips).
  const before = s.requests.length;
  s.requests = s.requests.filter((r) => r.status === 'pending' || r.status === 'accepted' || ctx.now - r.createdAt < 900);
  if (changed || before !== s.requests.length) ctx.bump('requests');

  // New requests only after the prologue, and never during set-pieces.
  if (s.story.beats.prologueDone === undefined || ctx.world.busy) return;
  const flags = s.story.flags;
  const next = typeof flags.nextRequestAt === 'number' ? flags.nextRequestAt : ctx.now + 20;
  if (ctx.now < next) {
    flags.nextRequestAt = next;
    return;
  }
  const open = s.requests.filter((r) => r.status === 'pending' || r.status === 'accepted').length;
  const interval = REQUESTS.interval / (ctx.upgradeMods().requestRate * ctx.mods.requestRate);
  flags.nextRequestAt = ctx.now + interval * ctx.rng.range(0.6, 1.4);
  if (open >= requestSlots(ctx) || ctx.world.streetHeat >= 3) return;
  const pool = ctx.content.customerList;
  const pick = ctx.rng.weighted(pool, (d) => requestWeight(ctx, d));
  if (pick) createRequest(ctx, pick.id);
  tickWalkUps(ctx);
}

// ── walk-ups ────────────────────────────────────────────────────────────────

export function walkUpCandidates(ctx: SimCtx, place: PlaceId): WalkUpCandidate[] {
  const out: WalkUpCandidate[] = [];
  for (const d of ctx.content.customerList) {
    const c = ctx.state.customers[d.id];
    if (!c.unlocked || c.satiation > 0.5) continue;
    const h = activeHangout(d, ctx.world.hours);
    if (!h || h.place !== place) continue;
    if (ctx.state.deals.some((x) => x.customer === d.id && x.status === 'open')) continue;
    out.push({ customer: d.id, weight: [1, 1.2, 1.5, 1.8][LEVELS.indexOf(c.level)]! });
  }
  return out;
}

function tickWalkUps(ctx: SimCtx): void {
  const w = ctx.world;
  if (!w.place || w.inVehicle || w.busy || w.streetHeat >= 2) return;
  if (ctx.state.deals.some((d) => d.status === 'open')) return;
  const flags = ctx.state.story.flags;
  const ready = typeof flags.nextWalkUpAt === 'number' ? flags.nextWalkUpAt : 0;
  if (ctx.now < ready) return;
  flags.nextWalkUpAt = ctx.now + REQUESTS.walkUpCooldown * ctx.rng.range(0.8, 1.3);
  const cands = walkUpCandidates(ctx, w.place);
  if (cands.length === 0 || !ctx.rng.chance(REQUESTS.walkUpChance)) return;
  const pick = ctx.rng.weighted(cands, (c) => c.weight);
  if (pick) ctx.emit('sim:walkUp', { customer: pick.customer, place: w.place });
}

// ── samples ─────────────────────────────────────────────────────────────────

export function giveSample(ctx: SimCtx, target: CustomerId | { district: DistrictId }, stack: StackId): SimResult<SampleResult> {
  if (!ctx.isUnlocked('feature:samples')) return fail('locked', t('noSamplesYet'));
  const st = parseStack(stack);
  const prod = st ? parseProduct(st.product) : null;
  if (!st || !prod) return fail('notFound');
  if (ctx.units('bag', stack) < 1) return fail('stock', t('stock'));
  ctx.take('bag', stack, 1);
  stat(ctx, 'samples');
  addXp(ctx, XP.sample, 'sample');
  if (typeof target === 'string') {
    const c = ctx.state.customers[target];
    if (!c) return fail('notFound');
    if (!c.unlocked) unlockCustomer(ctx, target, 'sample');
    c.mood = Math.min(1, c.mood + 0.25);
    addAffinity(ctx, target, 3);
    return ok({ customer: target, unlocked: false, line: def(ctx, target).lines.sample });
  }
  const flags = ctx.state.story.flags;
  const pityKey = `samplePity_${target.district}`;
  const pity = typeof flags[pityKey] === 'number' ? (flags[pityKey] as number) : 0;
  const locked = ctx.content.customerList.filter(
    (d) => d.district === target.district && d.unlock.via === 'sample' && !ctx.state.customers[d.id].unlocked,
  );
  if (locked.length === 0) return ok({ customer: null, unlocked: false, line: t('passerbyShrug') });
  const match = (d: CustomerDef) => (d.loves.some((e) => prod.effects.includes(e)) ? 1 : 0) - (d.dislikes.some((e) => prod.effects.includes(e)) ? 0.5 : 0);
  const pick = ctx.rng.weighted(locked, (d) => 1 + Math.max(0, match(d)) * 2) ?? locked[0]!;
  const chance = 0.45 + 0.3 * Math.max(0, match(pick)) + pity * 0.2 + (st.stars - 3) * 0.05;
  if (ctx.rng.chance(chance)) {
    flags[pityKey] = 0;
    unlockCustomer(ctx, pick.id, 'sample');
    addAffinity(ctx, pick.id, 4);
    ctx.text(pick.id, pick.id, pick.lines.sample);
    return ok({ customer: pick.id, unlocked: true, line: pick.lines.sample });
  }
  flags[pityKey] = pity + 1;
  return ok({ customer: null, unlocked: false, line: t('passerbyShrug') });
}
