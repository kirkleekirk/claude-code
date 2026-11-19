import { fail, ok } from '@/core/types';
import { CREW, CREW_BY_ID, ROLES } from '@/content/crew';
import type { ContactId, CrewRole, CustomerId, PropertyId } from '@/content/ids';
import type { StrainId } from '@/content/strains';
import { CREW_LINES } from '@/content/texts';
import { TURFS, type TurfId } from '@/content/turfs';
import type { CrewAssignment, CrewId, CrewState, PlantState, Recipe, RequestId, SimResult, StackId } from '../api';
import type { SimCtx } from '../ctx';
import { parseProduct, parseStack, stackValue } from '../products';
import { t } from '../strings';
import { addAffinity } from './customers';
import { autoPrice, openDeal } from './deals';
import { harvestPlant, plantSeed, tendPlant } from './growing';
import { crewSlots, emptyPots, moraleBonus, plantsAt, stationPlacement } from './layout';
import { queueJob } from './mixing';
import { addNotoriety } from './notoriety';
import { stat } from './progression';
import { unlockLock } from './progression';

/** Crew: hiring, assignments, the work each role does, morale, wages, quitting and win-backs. */

const PROPERTY_ROLES: ReadonlySet<CrewRole> = new Set(['grower', 'cook', 'packer', 'guard', 'accountant', 'lookout']);

function line(template: string, vars: Record<string, string>): string {
  let s = template;
  for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
  return s;
}

/** Crew ids double as message-thread ids (`crew-…`). */
function contact(c: CrewState): ContactId {
  return c.id as `crew-${string}`;
}

export function activeCrew(ctx: SimCtx): CrewState[] {
  return Object.values(ctx.state.crew).filter((c) => c.status !== 'quit');
}

export function crewOf(ctx: SimCtx, role: CrewRole, prop?: PropertyId): CrewState[] {
  return activeCrew(ctx).filter((c) => c.role === role && (prop === undefined || c.assignment.property === prop));
}

export function propertySlotsUsed(ctx: SimCtx, prop: PropertyId): number {
  return activeCrew(ctx).filter((c) => PROPERTY_ROLES.has(c.role) && c.assignment.property === prop).length;
}

function expectedWage(role: CrewRole, skill: number): number {
  return ROLES[role].wage * (0.7 + 0.1 * skill);
}

function speedOf(ctx: SimCtx, c: CrewState): number {
  const flow = c.assignment.property ? 0.85 + 0.3 * (ctx.state.properties[c.assignment.property].flowScore / 100) : 1;
  return (0.6 + 0.2 * c.skill) * (c.status === 'upset' ? 0.7 : 1) * flow;
}

// ── hiring ──────────────────────────────────────────────────────────────────

export function refreshCandidates(ctx: SimCtx): void {
  const hired = new Set(Object.values(ctx.state.crew).map((c) => c.def));
  const pool = CREW.filter(
    (d) => !hired.has(d.id) && (d.id === 'tank' || !d.named) && d.rank <= ctx.rank && !unlockLock(ctx, ROLES[d.role].unlock).locked,
  );
  ctx.rng.shuffle(pool);
  ctx.state.candidates = pool.slice(0, 4).map((d) => ({ def: d.id, wage: Math.round(d.wage * ctx.rng.range(0.95, 1.1)), expiresAt: ctx.now + 960 }));
  ctx.bump('crew');
}

function makeCrew(ctx: SimCtx, defId: string, wage: number): CrewState {
  const d = CREW_BY_ID[defId]!;
  return {
    id: `crew-${d.id}`, def: d.id, name: d.short, role: d.role, skill: d.skill, wage, morale: 65, hiredAt: ctx.now,
    assignment: { property: null, turf: null, recipe: null }, status: 'idle',
    activity: { kind: 'idle', property: null, placement: null, turf: null, progress: 0 },
    output: 0, quitAt: null, winBackUntil: null, timer: 0, praisedAt: -1e9, lowSince: null, unpaid: 0, delivery: null,
  };
}

function slotFor(ctx: SimCtx, role: CrewRole): PropertyId | null {
  if (!PROPERTY_ROLES.has(role)) return null;
  let best: PropertyId | null = null;
  let bestFree = 0;
  for (const id of Object.keys(ctx.state.properties) as PropertyId[]) {
    if (!ctx.state.properties[id].owned) continue;
    const free = crewSlots(ctx, id) - propertySlotsUsed(ctx, id);
    if (free > bestFree) {
      bestFree = free;
      best = id;
    }
  }
  return best;
}

export function hire(ctx: SimCtx, defId: string): SimResult<CrewId> {
  const cand = ctx.state.candidates.find((c) => c.def === defId);
  const d = CREW_BY_ID[defId];
  if (!cand || !d) return fail('notFound');
  const lock = unlockLock(ctx, ROLES[d.role].unlock);
  if (lock.locked) return fail('locked', lock.reason ?? undefined);
  if (PROPERTY_ROLES.has(d.role) && !slotFor(ctx, d.role)) return fail('full', t('noPot'));
  const paid = ctx.pay(cand.wage, 'any', 'wage');
  if (!paid.ok) return paid;
  ctx.state.candidates = ctx.state.candidates.filter((c) => c.def !== defId);
  return ok(join(ctx, defId, cand.wage));
}

/** Story hires (Pilar, Dex) join without the hiring pool. */
export function join(ctx: SimCtx, defId: string, wage?: number): CrewId {
  const d = CREW_BY_ID[defId]!;
  const existing = ctx.state.crew[`crew-${defId}`];
  if (existing && existing.status !== 'quit') return existing.id;
  const c = makeCrew(ctx, defId, wage ?? d.wage);
  ctx.state.crew[c.id] = c;
  stat(ctx, 'hires');
  autoAssignOne(ctx, c);
  ctx.text(contact(c), contact(c), line(ctx.rng.pick(CREW_LINES.hired), { name: c.name }));
  ctx.emit('sim:crew', { crew: c.id, change: 'hired' });
  ctx.bump('crew');
  return c.id;
}

export function fire(ctx: SimCtx, id: CrewId): SimResult {
  const c = ctx.state.crew[id];
  if (!c) return fail('notFound');
  if (c.assignment.turf) {
    const turf = ctx.state.turfs[c.assignment.turf];
    if (turf.dealer === c.id) turf.dealer = null;
  }
  delete ctx.state.crew[id];
  ctx.emit('sim:crew', { crew: id, change: 'fired' });
  ctx.bump('crew', 'territory');
  return ok(undefined);
}

// ── assignment ──────────────────────────────────────────────────────────────

export function assign(ctx: SimCtx, id: CrewId, patch: Partial<CrewAssignment>): SimResult {
  const c = ctx.state.crew[id];
  if (!c || c.status === 'quit') return fail('notFound');
  const next: CrewAssignment = { ...c.assignment, ...patch };
  if (next.property) {
    const st = ctx.state.properties[next.property];
    if (!st?.owned) return fail('notOwned', t('notOwned', { name: ctx.content.properties[next.property]?.name ?? '' }));
    if (PROPERTY_ROLES.has(c.role) && c.assignment.property !== next.property && propertySlotsUsed(ctx, next.property) >= crewSlots(ctx, next.property)) {
      return fail('full');
    }
  }
  if (next.turf) {
    if (c.role !== 'dealer') return fail('invalid');
    const turf = ctx.state.turfs[next.turf];
    if (!turf) return fail('notFound');
    if (turf.dealer && turf.dealer !== id) {
      const other = ctx.state.crew[turf.dealer];
      if (other) other.assignment.turf = null;
    }
    if (c.assignment.turf && c.assignment.turf !== next.turf) ctx.state.turfs[c.assignment.turf].dealer = null;
    turf.dealer = id;
  }
  c.assignment = next;
  if (c.status === 'idle' || c.status === 'needsSupplies') c.status = 'working';
  ctx.emit('sim:crew', { crew: id, change: 'assigned' });
  ctx.bump('crew', 'territory');
  return ok(undefined);
}

function bestTurf(ctx: SimCtx): TurfId | null {
  let best: TurfId | null = null;
  let bestScore = -Infinity;
  for (const id of ctx.content.turfIds) {
    const turf = ctx.state.turfs[id];
    if (turf.dealer) continue;
    const def = TURFS[id];
    const rival = Math.max(turf.influence.vale, turf.influence.mudflaps, turf.influence.zenith);
    const owned = Object.values(ctx.state.properties).some((p) => p.owned && ctx.content.properties[p.id] && def.district === ctx.content.places[p.id]?.district);
    const score = def.traffic * ctx.content.districts[def.district].wealth - rival * 0.05 + (owned ? 3 : 0) + turf.influence.player * 0.02;
    if (score > bestScore) {
      bestScore = score;
      best = id;
    }
  }
  return best;
}

function autoAssignOne(ctx: SimCtx, c: CrewState): boolean {
  if (c.role === 'dealer') {
    if (c.assignment.turf) return false;
    const turf = bestTurf(ctx);
    return turf ? assign(ctx, c.id, { turf }).ok : false;
  }
  if (c.role === 'driver') {
    c.status = 'working';
    return true;
  }
  if (c.assignment.property) return false;
  const prop = slotFor(ctx, c.role);
  return prop ? assign(ctx, c.id, { property: prop }).ok : false;
}

export function autoAssign(ctx: SimCtx): SimResult<number> {
  let n = 0;
  for (const c of activeCrew(ctx)) if (autoAssignOne(ctx, c)) n++;
  return ok(n);
}

// ── morale ──────────────────────────────────────────────────────────────────

export function praise(ctx: SimCtx, id: CrewId): SimResult {
  const c = ctx.state.crew[id];
  if (!c || c.status === 'quit') return fail('notFound');
  if (ctx.now - c.praisedAt < 120) return fail('cooldown', t('cooldown', { time: `${Math.ceil(120 - (ctx.now - c.praisedAt))}s` }));
  c.praisedAt = ctx.now;
  c.morale = Math.min(100, c.morale + 6);
  ctx.bump('crew');
  return ok(undefined);
}

export function bonus(ctx: SimCtx, id: CrewId, amount: number): SimResult {
  const c = ctx.state.crew[id];
  if (!c || c.status === 'quit') return fail('notFound');
  const n = Math.round(amount);
  if (n < 1) return fail('invalid');
  const paid = ctx.pay(n, 'any', 'wage');
  if (!paid.ok) return paid;
  c.morale = Math.min(100, c.morale + Math.min(30, (n / expectedWage(c.role, c.skill)) * 15));
  c.unpaid = 0;
  ctx.bump('crew');
  return ok(undefined);
}

export function winBack(ctx: SimCtx, id: CrewId): SimResult {
  const c = ctx.state.crew[id];
  if (!c || c.status !== 'quit') return fail('notFound');
  if (c.winBackUntil !== null && ctx.now > c.winBackUntil) return fail('expired');
  const paid = ctx.pay(c.wage * 2, 'any', 'wage');
  if (!paid.ok) return paid;
  c.status = 'idle';
  c.morale = 62;
  c.quitAt = null;
  c.winBackUntil = null;
  c.lowSince = null;
  c.unpaid = 0;
  autoAssignOne(ctx, c);
  ctx.text(contact(c), contact(c), line(CREW_LINES.wonBack, { name: c.name }));
  ctx.emit('sim:crew', { crew: id, change: 'wonBack' });
  ctx.bump('crew');
  return ok(undefined);
}

function moraleTarget(ctx: SimCtx, c: CrewState): number {
  const wage = Math.max(-1, Math.min(1, (c.wage / expectedWage(c.role, c.skill) - 1) * 2));
  const comfort = c.assignment.property ? Math.min(25, moraleBonus(ctx, c.assignment.property) * 0.6) : 8;
  const praiseBoost = Math.max(0, 12 * (1 - (ctx.now - c.praisedAt) / 600));
  const lockdown = c.assignment.property && ctx.state.properties[c.assignment.property].lockdownUntil > ctx.now ? 10 : 0;
  return 50 + wage * 20 + comfort + praiseBoost - c.unpaid * 20 - lockdown;
}

function tickMorale(ctx: SimCtx, c: CrewState, dt: number): void {
  const target = moraleTarget(ctx, c);
  const step = (4 * dt) / 60;
  c.morale = c.morale < target ? Math.min(target, c.morale + step) : Math.max(target, c.morale - step);
  c.morale = Math.max(0, Math.min(100, c.morale));
  if (c.morale < 25 && c.status !== 'upset') {
    c.status = 'upset';
    ctx.text(contact(c), contact(c), line(CREW_LINES.upset, { name: c.name }));
    ctx.emit('sim:crew', { crew: c.id, change: 'upset' });
  } else if (c.morale >= 30 && c.status === 'upset') {
    c.status = 'working';
  }
  if (c.morale < 8) {
    c.lowSince ??= ctx.now;
    if (ctx.now - c.lowSince > 90) {
      c.status = 'quit';
      c.quitAt = ctx.now;
      c.winBackUntil = ctx.now + 2 * 960;
      if (c.assignment.turf) ctx.state.turfs[c.assignment.turf].dealer = null;
      c.assignment = { property: null, turf: null, recipe: null };
      c.activity = { kind: 'idle', property: null, placement: null, turf: null, progress: 0 };
      ctx.text(contact(c), contact(c), line(ctx.rng.pick(CREW_LINES.quit), { name: c.name }));
      ctx.emit('sim:crew', { crew: c.id, change: 'quit' });
    }
  } else {
    c.lowSince = null;
  }
}

// ── work ────────────────────────────────────────────────────────────────────

function setActivity(c: CrewState, kind: CrewState['activity']['kind'], prop: PropertyId | null, placement: string | null, progress: number): void {
  const a = c.activity;
  a.kind = kind;
  a.property = prop;
  a.placement = placement;
  a.turf = c.assignment.turf;
  a.progress = progress;
}

function preferredStrain(ctx: SimCtx, prop: PropertyId): StrainId | null {
  const counts = new Map<string, number>();
  for (const p of plantsAt(ctx, prop)) counts.set(p.strain, (counts.get(p.strain) ?? 0) + 1);
  // Any seed the player owns: keep the bed's current strain going, then whatever there is most of.
  const options = Object.keys(ctx.state.supplies)
    .filter((k) => k.startsWith('seed:') && ctx.supply(k as `seed:${string}`) > 0)
    .map((k) => k.slice(5) as StrainId);
  if (options.length === 0) return null;
  options.sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || ctx.supply(`seed:${b}`) - ctx.supply(`seed:${a}`));
  return options[0]!;
}

function growerStep(ctx: SimCtx, c: CrewState, prop: PropertyId): void {
  const plants = plantsAt(ctx, prop);
  const placementOf = (p: PlantState) => p.pot.split(':')[0]!;
  const ripe = plants.find((p) => p.growth >= 1);
  if (ripe) {
    setActivity(c, 'harvest', prop, placementOf(ripe), 0);
    if (harvestPlant(ctx, ripe.id, [], 'crew').ok) c.output++;
    return;
  }
  const needy = plants.find((p) => p.water < 0.35 || p.food < 0.35 || (!p.pruned && p.growth < 1));
  if (needy) {
    setActivity(c, 'tend', prop, placementOf(needy), 0);
    tendPlant(ctx, needy.id, 'crew');
    return;
  }
  const pots = emptyPots(ctx, prop);
  if (pots.length) {
    const strain = preferredStrain(ctx, prop);
    if (strain) {
      setActivity(c, 'plant', prop, pots[0]!.split(':')[0]!, 0);
      plantSeed(ctx, prop, pots[0]!, strain, 'balanced', 'crew');
      return;
    }
    if (c.status !== 'needsSupplies') {
      c.status = 'needsSupplies';
      ctx.emit('sim:crew', { crew: c.id, change: 'needsSupplies' });
    }
  }
  setActivity(c, 'idle', prop, null, 0);
}

function cookStep(ctx: SimCtx, c: CrewState, prop: PropertyId): void {
  const jobs = ctx.state.jobs.filter((j) => j.property === prop);
  const bench = stationPlacement(ctx, prop, 'workbench');
  if (jobs.length) {
    const j = jobs[0]!;
    setActivity(c, 'cook', prop, stationPlacement(ctx, prop, j.station)?.id ?? bench?.id ?? null, j.progress / j.unitTime);
    return;
  }
  const recipe: Recipe | null = c.assignment.recipe;
  if (recipe) {
    const r = queueJob(ctx, prop, recipe, recipe.tierUp === 'halos' ? 2 : 5, 'crew');
    if (r.ok) {
      setActivity(c, 'cook', prop, bench?.id ?? null, 0);
      return;
    }
    if (r.error === 'stock' || r.error === 'supplies') {
      if (c.status !== 'needsSupplies') {
        c.status = 'needsSupplies';
        ctx.emit('sim:crew', { crew: c.id, change: 'needsSupplies' });
      }
    }
  }
  setActivity(c, 'idle', prop, null, 0);
}

/** Where a dealer on this turf gets stock from. */
function dealerSource(ctx: SimCtx, turf: TurfId): PropertyId | null {
  const district = TURFS[turf].district;
  const owned = (Object.keys(ctx.state.properties) as PropertyId[]).filter((id) => ctx.state.properties[id].owned && ctx.state.properties[id].lockdownUntil <= ctx.now);
  const logistics = ctx.hasUpgrade('crewVan') || crewOf(ctx, 'packer').length > 0 || crewOf(ctx, 'driver').length > 0;
  const local = owned.filter((id) => ctx.content.places[id]?.district === district);
  const candidates = logistics ? owned : local.length ? local : owned.slice(0, 1);
  let best: PropertyId | null = null;
  let units = 0;
  for (const id of candidates) {
    const n = ctx.totalUnits(id);
    if (n > units) {
      units = n;
      best = id;
    }
  }
  return best;
}

function dealerStep(ctx: SimCtx, c: CrewState, dt: number): void {
  const turfId = c.assignment.turf;
  if (!turfId) return setActivity(c, 'idle', null, null, 0);
  const turf = ctx.state.turfs[turfId];
  const def = TURFS[turfId];
  const source = dealerSource(ctx, turfId);
  if (!source) {
    if (c.status !== 'needsSupplies') {
      c.status = 'needsSupplies';
      ctx.emit('sim:crew', { crew: c.id, change: 'needsSupplies' });
    }
    return setActivity(c, 'deal', null, null, 0);
  }
  if (c.status === 'needsSupplies') c.status = 'working';
  const night = ctx.world.hours >= 20 || ctx.world.hours < 4 ? 1.2 : 1;
  const rival = Math.max(turf.influence.vale, turf.influence.mudflaps, turf.influence.zenith);
  const perMinute = (def.traffic / 6) * speedOf(ctx, c) * night * (ctx.mods.demand[def.district] ?? 1) * (1 - rival / 200);
  c.timer += (dt * perMinute) / 60;
  setActivity(c, 'deal', null, null, Math.min(1, c.timer));
  while (c.timer >= 1) {
    c.timer -= 1;
    const stash = ctx.state.properties[source].stash;
    let best: StackId | null = null;
    let bestValue = 0;
    for (const k in stash) {
      const v = stackValue(ctx, k);
      const p = parseProduct(parseStack(k)?.product ?? '');
      if (!p || (p.tier === 'halos' && def.district !== 'isla' && def.district !== 'deco')) continue;
      if (v > bestValue) {
        bestValue = v;
        best = k;
      }
    }
    if (!best) return;
    const units = Math.min(ctx.units(source, best), ctx.rng.int(1, 2));
    ctx.take(source, best, units);
    const sense = 0.85 + 0.15 * ctx.content.districts[def.district].wealth;
    const packer = crewOf(ctx, 'packer').length > 0 ? 1.1 : 1;
    const price = Math.round(bestValue * sense * 0.85 * packer * ctx.mods.prices * units);
    ctx.earn(price, 'dirty', 'crewDeal');
    c.output += 1;
    turf.sales += 1;
    turf.influence.player = Math.min(100, turf.influence.player + 0.8);
    for (const r of ['vale', 'mudflaps', 'zenith'] as const) turf.influence[r] = Math.max(0, turf.influence[r] - 0.3);
    ctx.ledger('crewDeals', 1);
    ctx.ledger('units', units);
    addNotoriety(ctx, 0.05);
    const regulars = ctx.content.customerList.filter((cd) => cd.district === def.district && ctx.state.customers[cd.id].unlocked);
    if (regulars.length) {
      const who = ctx.rng.pick(regulars).id as CustomerId;
      const cs = ctx.state.customers[who];
      cs.satiation = Math.min(1, cs.satiation + 0.2);
      addAffinity(ctx, who, 0.5);
    }
    ctx.bump('territory', 'inventory');
  }
}

export function delegateRequest(ctx: SimCtx, requestId: RequestId, crewId: CrewId): SimResult {
  const c = ctx.state.crew[crewId];
  const r = ctx.state.requests.find((x) => x.id === requestId);
  if (!c || c.status === 'quit' || c.role !== 'driver') return fail('invalid');
  if (c.delivery) return fail('busy');
  if (!r || (r.status !== 'accepted' && r.status !== 'pending') || r.story) return fail('expired', t('requestGone'));
  for (const id of Object.keys(ctx.state.properties) as PropertyId[]) {
    const st = ctx.state.properties[id];
    if (!st.owned || st.lockdownUntil > ctx.now) continue;
    for (const k in st.stash) {
      const p = parseProduct(parseStack(k)?.product ?? '');
      if (!p || p.tier !== r.wants.tier || st.stash[k]! < r.wants.qty) continue;
      if (r.wants.effects.length && !r.wants.effects.some((e) => p.effects.includes(e))) continue;
      ctx.take(id, k, r.wants.qty);
      r.status = 'accepted';
      c.delivery = { request: r.id, stack: k, qty: r.wants.qty, at: ctx.now + 70 / speedOf(ctx, c) };
      setActivity(c, 'drive', null, null, 0);
      ctx.bump('crew', 'requests');
      return ok(undefined);
    }
  }
  return fail('stock', t('stock'));
}

function driverStep(ctx: SimCtx, c: CrewState): void {
  const d = c.delivery;
  if (!d) return setActivity(c, 'drive', null, null, 0);
  if (ctx.now < d.at) return setActivity(c, 'drive', null, null, 0.5);
  c.delivery = null;
  const r = ctx.state.requests.find((x) => x.id === d.request);
  ctx.add('bag', d.stack, d.qty);
  if (!r || r.status !== 'accepted') {
    // The order fell through; the product returns to the bag via the driver.
    return;
  }
  const deal = openDeal(ctx, { request: r.id });
  if (!deal.ok) return;
  const saved = ctx.world.place;
  ctx.world = { ...ctx.world, place: null };
  const res = autoPrice(ctx, deal.value.id, d.stack, d.qty);
  ctx.world = { ...ctx.world, place: saved };
  if (res.ok) {
    c.output += 1;
    ctx.ledger('crewDeals', 1);
  }
}

export function tickCrew(ctx: SimCtx, dt: number): void {
  const list = activeCrew(ctx);
  if (list.length === 0) return;
  for (const c of list) {
    tickMorale(ctx, c, dt);
    if (c.status === 'quit') continue;
    const prop = c.assignment.property;
    if (prop && ctx.state.properties[prop].lockdownUntil > ctx.now) {
      setActivity(c, 'idle', prop, null, 0);
      continue;
    }
    if (c.role === 'dealer') {
      dealerStep(ctx, c, dt);
      continue;
    }
    if (c.role === 'driver') {
      driverStep(ctx, c);
      continue;
    }
    if (!prop) {
      setActivity(c, 'idle', null, null, 0);
      continue;
    }
    const station = ROLES[c.role].station;
    const placement = station ? stationPlacement(ctx, prop, station)?.id ?? null : null;
    if (c.role === 'grower' || c.role === 'cook') {
      c.timer += dt * speedOf(ctx, c);
      const interval = c.role === 'grower' ? 5 : 3;
      if (c.timer < interval) continue;
      c.timer = 0;
      if (c.role === 'grower') growerStep(ctx, c, prop);
      else cookStep(ctx, c, prop);
      // Back to work as soon as supplies turn up.
      if (c.status === 'needsSupplies' && c.activity.kind !== 'idle') c.status = 'working';
      continue;
    }
    const kind = c.role === 'guard' ? 'guard' : c.role === 'accountant' ? 'books' : c.role === 'lookout' ? 'watch' : 'pack';
    setActivity(c, kind, prop, placement, (ctx.now % 30) / 30);
    if (c.role === 'packer' && ctx.state.brand) ctx.state.brand.hype = Math.min(100, ctx.state.brand.hype + (0.4 * dt * speedOf(ctx, c)) / 60);
  }
  ctx.bump('crew');
}

/** Pay wages and refresh the hiring pool once per in-game day. */
export function crewNewDay(ctx: SimCtx): void {
  const list = activeCrew(ctx);
  const total = list.reduce((s, c) => s + c.wage, 0);
  if (total > 0) {
    if (ctx.pay(total, 'any', 'wage').ok) for (const c of list) c.unpaid = 0;
    else for (const c of list) c.unpaid += 1;
  }
  if (ctx.isUnlocked('feature:crew')) refreshCandidates(ctx);
}

/** Security points crew add to a property. */
export function guardSecurity(ctx: SimCtx, prop: PropertyId): number {
  return crewOf(ctx, 'guard', prop).reduce((s, c) => s + 6 * c.skill, 0);
}

export function lookoutPower(ctx: SimCtx, prop: PropertyId): number {
  return crewOf(ctx, 'lookout', prop).reduce((s, c) => s + c.skill, 0);
}

export function accountantPower(ctx: SimCtx): number {
  return crewOf(ctx, 'accountant').reduce((s, c) => s + c.skill, 0);
}
