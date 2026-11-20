import { fmt } from '@/core/i18n';
import { fail, ok } from '@/core/types';
import type { AdditiveId } from '@/content/additives';
import type { PropertyId, ShopId, TrackId, UpgradeId } from '@/content/ids';
import { isOpen } from '@/content/places';
import { itemKey } from '@/content/shops';
import type { BaseStrainId } from '@/content/strains';
import { VALE_LINES } from '@/content/texts';
import type { DebtState, PurchaseResult, ShopListing, SimResult, StackId, SupplyId, UpgradeListing } from '../api';
import { ECONOMY, XP } from '../balance';
import type { SimCtx } from '../ctx';
import { parseProduct, parseStack, stackValue } from '../products';
import { t } from '../strings';
import { visualState, stashCapacity } from './layout';
import { addXp, rankLock, unlockLock } from './progression';

/** Shops, deliveries, subscriptions, the Go-Bag, upgrades, property purchases and the debt. */

interface ItemInfo {
  name: string;
  price: number;
  rank: number;
  icon: string;
}

export function itemInfo(ctx: SimCtx, item: SupplyId): ItemInfo | null {
  if (item.startsWith('seed:')) {
    const s = ctx.strain(item.slice(5) as BaseStrainId);
    if (!s) return null;
    return { name: s.name, price: Math.round(s.seedPrice * ctx.mods.seeds), rank: s.rank, icon: 'seed' };
  }
  const a = ctx.content.additives[item.slice(4) as AdditiveId];
  if (!a) return null;
  return { name: a.name, price: Math.max(1, Math.round(a.price * (ctx.mods.supply[a.flavor] ?? 1))), rank: a.rank, icon: a.icon };
}

function shopOpenAt(ctx: SimCtx, shop: ShopId): { open: boolean; opens: number | null } {
  const s = ctx.content.shops[shop];
  if (!s.place) return { open: true, opens: null };
  const place = ctx.content.places[s.place];
  return { open: isOpen(place, ctx.world.hours), opens: place.open ? place.open[0] : null };
}

export function shopListing(ctx: SimCtx, shop: ShopId): ShopListing[] {
  const s = ctx.content.shops[shop];
  const shopLock = s.unlock ? unlockLock(ctx, s.unlock) : { locked: false, reason: null };
  return s.stock.map((it) => {
    const id = itemKey(it);
    const info = itemInfo(ctx, id)!;
    const lock = shopLock.locked ? shopLock : rankLock(ctx, info.rank);
    return {
      shop, item: id, name: info.name, price: Math.round(info.price * s.markup), owned: ctx.supply(id), icon: info.icon,
      locked: lock.locked, reason: lock.reason,
    };
  });
}

function checkShop(ctx: SimCtx, shop: ShopId, item: SupplyId, qty: number, inPerson: boolean): SimResult<{ unit: number; info: ItemInfo }> {
  const s = ctx.content.shops[shop];
  if (!s) return fail('notFound');
  if (s.unlock) {
    const l = unlockLock(ctx, s.unlock);
    if (l.locked) return fail('locked', l.reason ?? undefined);
  }
  if (!s.stock.some((it) => itemKey(it) === item)) return fail('invalid', t('notInStock', { shop: s.name }));
  const info = itemInfo(ctx, item);
  if (!info) return fail('notFound');
  const lock = rankLock(ctx, info.rank);
  if (lock.locked) return fail('locked', lock.reason ?? undefined);
  if (!Number.isInteger(qty) || qty < 1) return fail('invalid', t('qtyZero'));
  if (qty < s.minQty) return fail('invalid', t('minQty', { n: s.minQty }));
  if (inPerson) {
    if (s.place && ctx.world.place !== s.place) return fail('notHere', t('notHere', { place: s.name }));
    const open = shopOpenAt(ctx, shop);
    if (!open.open) return fail('closed', t('closed', { name: s.name, time: fmt.clock(open.opens ?? 0) }));
  }
  return ok({ unit: Math.round(info.price * s.markup), info });
}

function noteSupplyBeat(ctx: SimCtx, item: SupplyId): void {
  const f = ctx.state.story.flags;
  if (item.startsWith('seed:')) f.boughtSeed = true;
  else f.boughtAdditive = true;
  if (f.boughtSeed && f.boughtAdditive) ctx.beat('gardenStore');
}

export function buy(ctx: SimCtx, shop: ShopId, item: SupplyId, qty: number): SimResult<PurchaseResult> {
  const s = ctx.content.shops[shop];
  if (s && s.delivery > 0) return order(ctx, shop, item, qty);
  const check = checkShop(ctx, shop, item, qty, true);
  if (!check.ok) return check;
  const cost = check.value.unit * qty;
  const paid = ctx.pay(cost, 'any', 'purchase');
  if (!paid.ok) return paid;
  ctx.addSupply(item, qty);
  addXp(ctx, XP.buy, 'purchase');
  ctx.emit('sim:supplies', { item, qty, source: 'purchase' });
  noteSupplyBeat(ctx, item);
  ctx.onAction('buy', { shop, item, qty });
  return ok({ item, qty, cost, paidWith: paid.value });
}

export function order(ctx: SimCtx, shop: ShopId, item: SupplyId, qty: number): SimResult<PurchaseResult> {
  const check = checkShop(ctx, shop, item, qty, false);
  if (!check.ok) return check;
  const s = ctx.content.shops[shop];
  const unit = s.delivery > 0 ? check.value.unit : Math.round(check.value.unit * ECONOMY.orderMarkup);
  const cost = unit * qty;
  const paid = ctx.pay(cost, 'any', 'purchase');
  if (!paid.ok) return paid;
  ctx.state.orders.push({ id: ctx.id('o'), shop, item, qty, arriveAt: ctx.now + Math.max(30, s.delivery) });
  ctx.bump('supplies');
  noteSupplyBeat(ctx, item);
  return ok({ item, qty, cost, paidWith: paid.value });
}

export function subscribe(ctx: SimCtx, item: SupplyId, qty: number, everyDays: number): SimResult {
  const l = unlockLock(ctx, 'feature:subscriptions');
  if (l.locked) return fail('locked', l.reason ?? undefined);
  const info = itemInfo(ctx, item);
  if (!info) return fail('notFound');
  const lock = rankLock(ctx, info.rank);
  if (lock.locked) return fail('locked', lock.reason ?? undefined);
  if (!Number.isInteger(qty) || qty < 1 || qty > 99 || !Number.isInteger(everyDays) || everyDays < 1 || everyDays > 7) return fail('invalid');
  const subs = ctx.state.subscriptions.filter((s) => s.item !== item);
  subs.push({ item, qty, every: everyDays, nextDay: ctx.state.clock.day + 1, active: true });
  ctx.state.subscriptions = subs;
  ctx.bump('supplies');
  return ok(undefined);
}

export function unsubscribe(ctx: SimCtx, item: SupplyId): SimResult {
  const before = ctx.state.subscriptions.length;
  ctx.state.subscriptions = ctx.state.subscriptions.filter((s) => s.item !== item);
  if (ctx.state.subscriptions.length === before) return fail('notFound');
  ctx.bump('supplies');
  return ok(undefined);
}

// ── Go-Bag ──────────────────────────────────────────────────────────────────

export function packBag(ctx: SimCtx, prop: PropertyId, plan: 'smart' | Record<StackId, number> = 'smart'): SimResult<number> {
  const st = ctx.state.properties[prop];
  if (!st?.owned) return fail('notOwned', t('notOwned', { name: ctx.content.properties[prop]?.name ?? prop }));
  if (ctx.world.insideProperty !== prop) return fail('notHere', t('notHere', { place: ctx.content.properties[prop].name }));
  const want = new Map<StackId, number>();
  if (plan === 'smart') {
    // For every open request, the best stash stack that satisfies it; then a few of the most valuable.
    for (const r of ctx.state.requests) {
      if (r.status !== 'pending' && r.status !== 'accepted') continue;
      let best: StackId | null = null;
      let bestScore = -1;
      for (const k in st.stash) {
        const s = parseStack(k);
        const p = s ? parseProduct(s.product) : null;
        if (!s || !p || p.tier !== r.wants.tier) continue;
        const hits = r.wants.effects.length === 0 || r.wants.effects.some((e) => p.effects.includes(e));
        const score = (hits ? 1000 : 0) + stackValue(ctx, k);
        if (score > bestScore) {
          bestScore = score;
          best = k;
        }
      }
      if (best) want.set(best, (want.get(best) ?? 0) + r.wants.qty);
    }
    const top = Object.keys(st.stash).sort((a, b) => stackValue(ctx, b) - stackValue(ctx, a)).slice(0, 3);
    for (const k of top) want.set(k, (want.get(k) ?? 0) + 4);
  } else {
    for (const k in plan) if (plan[k]! > 0) want.set(k, Math.floor(plan[k]!));
  }
  let moved = 0;
  for (const [k, n] of want) {
    if (moved >= 40) break;
    const take = Math.min(n, ctx.units(prop, k), 40 - moved);
    if (take <= 0) continue;
    ctx.take(prop, k, take);
    ctx.add('bag', k, take);
    moved += take;
  }
  return ok(moved);
}

export function stow(ctx: SimCtx, prop: PropertyId, stack?: StackId, qty?: number): SimResult<number> {
  const st = ctx.state.properties[prop];
  if (!st?.owned) return fail('notOwned', t('notOwned', { name: ctx.content.properties[prop]?.name ?? prop }));
  if (ctx.world.insideProperty !== prop) return fail('notHere', t('notHere', { place: ctx.content.properties[prop].name }));
  let room = stashCapacity(ctx, prop) - ctx.totalUnits(prop);
  if (room <= 0) return fail('full', t('stashFull'));
  const stacks = stack ? [stack] : Object.keys(ctx.state.bag);
  let moved = 0;
  for (const k of stacks) {
    const n = Math.min(stack && qty !== undefined ? Math.floor(qty) : ctx.units('bag', k), ctx.units('bag', k), room);
    if (n <= 0) continue;
    ctx.take('bag', k, n);
    ctx.add(prop, k, n);
    moved += n;
    room -= n;
    if (room <= 0) break;
  }
  return ok(moved);
}

// ── upgrades and property ───────────────────────────────────────────────────

export function upgradeListings(ctx: SimCtx): UpgradeListing[] {
  return ctx.content.upgradeOrder.map((id) => {
    const up = ctx.content.upgrades[id];
    const owned = ctx.hasUpgrade(id);
    let lock = rankLock(ctx, up.rank);
    if (!lock.locked && up.requires) {
      const missing = up.requires.find((r) => !ctx.hasUpgrade(r));
      if (missing) lock = { locked: true, reason: t('lockedUpgrade', { name: ctx.content.upgrades[missing].name }) };
    }
    return {
      id, name: up.name, line: up.line, cost: up.cost, owned, affordable: ctx.canPay(up.cost, 'any'), icon: up.icon,
      locked: owned ? false : lock.locked, reason: owned ? null : lock.reason,
    };
  });
}

export function buyUpgrade(ctx: SimCtx, id: UpgradeId): SimResult<PurchaseResult> {
  const up = ctx.content.upgrades[id];
  if (!up) return fail('notFound');
  if (ctx.hasUpgrade(id)) return fail('alreadyDone', t('alreadyOwned'));
  const listing = upgradeListings(ctx).find((l) => l.id === id)!;
  if (listing.locked) return fail('locked', listing.reason ?? undefined);
  const paid = ctx.pay(up.cost, 'any', 'upgrade');
  if (!paid.ok) return paid;
  ctx.state.upgrades.push(id);
  if (up.effects.noWater) for (const p of Object.values(ctx.state.plants)) p.water = 1;
  if (up.effects.noFood) for (const p of Object.values(ctx.state.plants)) p.food = 1;
  addXp(ctx, XP.upgrade, 'upgrade');
  ctx.bump('upgrades', 'plants');
  if (up.effects.unlocks) ctx.emit('sim:unlock', { id: up.effects.unlocks, label: up.name, detail: up.line, icon: up.icon });
  if (id === 'dripIrrigation') ctx.beat('dripBought');
  ctx.onAction('upgrade', id);
  return ok({ item: id, qty: 1, cost: up.cost, paidWith: paid.value });
}

export function buyProperty(ctx: SimCtx, id: PropertyId): SimResult<PurchaseResult> {
  const def = ctx.content.properties[id];
  const st = ctx.state.properties[id];
  if (!def || !st) return fail('notFound');
  if (st.owned) return fail('alreadyDone', t('alreadyOwned'));
  const lock = rankLock(ctx, def.rank);
  if (lock.locked) return fail('locked', lock.reason ?? undefined);
  let cost = def.price;
  let currency: 'any' | 'clean' = 'clean';
  if (def.currency === 'any' && ctx.state.money.clean < def.price) {
    cost = Math.round(def.price * (1 + ECONOMY.cashPremium));
    currency = 'any';
  }
  const paid = ctx.pay(cost, currency, 'property');
  if (!paid.ok) return paid;
  st.owned = true;
  st.boughtAt = ctx.now;
  addXp(ctx, XP.property, 'property');
  ctx.bump('properties');
  ctx.toast(t('unlocked', { label: def.name }), 'good', 'house');
  ctx.onAction('propertyBought', id);
  return ok({ item: id, qty: 1, cost, paidWith: paid.value });
}

export function trackPrice(ctx: SimCtx, prop: PropertyId, track: TrackId): number | null {
  const level = ctx.state.properties[prop].tracks[track];
  if (level >= 3) return null;
  return Math.round(ctx.content.trackPrices[level]! * ctx.content.properties[prop].trackScale);
}

export function upgradeTrack(ctx: SimCtx, prop: PropertyId, track: TrackId): SimResult<PurchaseResult> {
  const st = ctx.state.properties[prop];
  if (!st) return fail('notFound');
  if (!st.owned) return fail('notOwned', t('notOwned', { name: ctx.content.properties[prop].name }));
  const price = trackPrice(ctx, prop, track);
  if (price === null) return fail('alreadyDone', t('alreadyDone'));
  const paid = ctx.pay(price, 'any', 'upgrade');
  if (!paid.ok) return paid;
  st.tracks[track] += 1;
  addXp(ctx, XP.upgrade, 'track');
  ctx.bump('properties');
  return ok({ item: `${prop}:${track}`, qty: 1, cost: price, paidWith: paid.value });
}

export function purchase(ctx: SimCtx, item: { id: string; label: string; price: number; currency: 'any' | 'dirty' | 'clean' }): SimResult<PurchaseResult> {
  if (!Number.isFinite(item.price) || item.price < 0) return fail('invalid');
  const paid = ctx.pay(item.price, item.currency, 'purchase');
  if (!paid.ok) return paid;
  return ok({ item: item.id, qty: 1, cost: Math.round(item.price), paidWith: paid.value });
}

// ── debt ────────────────────────────────────────────────────────────────────

export function remainingDebt(ctx: SimCtx): number {
  const d = ctx.state.money.debt;
  return Math.max(0, d.principal - d.paid);
}

export function startDebtSchedule(ctx: SimCtx): void {
  const d = ctx.state.money.debt;
  if (d.nextCheckDay > 0 || d.settled) return;
  d.nextCheckDay = ctx.state.clock.day + ECONOMY.debtCheckEvery;
  d.expectedByCheck = Math.round(d.principal * ECONOMY.debtShare * 0.5);
  ctx.text('vale', 'vale', VALE_LINES.scheduleStart.replace('{amount}', fmt.money(d.expectedByCheck)), { kind: 'story' });
  ctx.bump('cash');
}

export function payDebt(ctx: SimCtx, amount: number, from: 'dirty' | 'clean'): SimResult<DebtState> {
  const d = ctx.state.money.debt;
  if (d.settled) return fail('alreadyDone', t('alreadyDone'));
  const n = Math.min(Math.round(amount), remainingDebt(ctx));
  if (!Number.isFinite(n) || n < 1) return fail('invalid');
  const paid = ctx.pay(n, from, 'debt');
  if (!paid.ok) return paid;
  d.paid += n;
  ctx.onAction('debtPayment', n);
  if (d.nextCheckDay > 0 && d.paid >= d.expectedByCheck * 1.25) d.respect = Math.min(100, d.respect + 3);
  if (remainingDebt(ctx) <= 0) {
    d.settled = 'paid';
    d.respect = Math.min(100, d.respect + 25);
    ctx.text('vale', 'vale', VALE_LINES.paidOff, { kind: 'story' });
    ctx.onAction('debtPaid');
  }
  ctx.bump('cash');
  return ok({ ...d });
}

function debtCheck(ctx: SimCtx, day: number): void {
  const d = ctx.state.money.debt;
  if (d.settled || d.nextCheckDay <= 0 || day < d.nextCheckDay) return;
  if (d.paid >= d.expectedByCheck) {
    const ahead = d.paid >= d.expectedByCheck * 1.5;
    d.respect = Math.min(100, d.respect + (ahead ? 12 : 8));
    d.collectors = Math.max(0, d.collectors - 1);
    ctx.text('vale', 'vale', ctx.rng.pick(ahead ? VALE_LINES.ahead : VALE_LINES.onTime), { kind: 'story' });
  } else {
    d.missed += 1;
    d.collectors = Math.min(3, d.collectors + 1);
    d.respect = Math.max(0, d.respect - 10);
    ctx.text('vale', 'vale', ctx.rng.pick(VALE_LINES.missed), { kind: 'story' });
    ctx.text('tipster', 'tipster', ctx.rng.pick(VALE_LINES.collectors), { kind: 'story' });
  }
  d.nextCheckDay = day + ECONOMY.debtCheckEvery;
  d.expectedByCheck = Math.min(d.principal, Math.round(d.expectedByCheck + d.principal * ECONOMY.debtShare));
  ctx.text('vale', 'vale', VALE_LINES.nextDue.replace('{amount}', fmt.money(d.expectedByCheck)).replace('{n}', String(d.nextCheckDay)), { kind: 'system' });
  ctx.bump('cash');
}

// ── ticks ───────────────────────────────────────────────────────────────────

export function tickOrders(ctx: SimCtx): void {
  if (ctx.state.orders.length === 0) return;
  const arrived = ctx.state.orders.filter((o) => o.arriveAt <= ctx.now);
  if (arrived.length === 0) return;
  ctx.state.orders = ctx.state.orders.filter((o) => o.arriveAt > ctx.now);
  for (const o of arrived) {
    ctx.addSupply(o.item, o.qty);
    ctx.emit('sim:supplies', { item: o.item, qty: o.qty, source: 'delivery' });
    ctx.toast(t('delivery', { qty: o.qty, name: itemInfo(ctx, o.item)?.name ?? o.item }), 'info', 'box');
  }
}

/** Once per in-game day: subscriptions, Vale's check-in and storefront income. */
export function economyNewDay(ctx: SimCtx, day: number): void {
  for (const s of ctx.state.subscriptions) {
    if (!s.active || s.nextDay > day) continue;
    s.nextDay = day + s.every;
    const info = itemInfo(ctx, s.item);
    if (!info) continue;
    const cost = Math.round(info.price * 1.1) * s.qty;
    if (ctx.pay(cost, 'any', 'purchase').ok) {
      ctx.addSupply(s.item, s.qty);
      ctx.emit('sim:supplies', { item: s.item, qty: s.qty, source: 'subscription' });
    }
  }
  debtCheck(ctx, day);
  for (const id of Object.keys(ctx.state.properties) as PropertyId[]) {
    const st = ctx.state.properties[id];
    const legit = ctx.content.properties[id].legit;
    if (!st.owned || legit <= 0) continue;
    ctx.earn(Math.round(legit * (1 + 0.5 * visualState(ctx, id))), 'clean', 'legit');
  }
}
