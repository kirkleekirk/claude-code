import { fmt } from '@/core/i18n';
import type { AdditiveId } from '@/content/additives';
import { EFFECTS, type Vibe } from '@/content/effects';
import { FRONTS } from '@/content/fronts';
import type { FrontId, PropertyId } from '@/content/ids';
import { MISSIONS } from '@/content/missions';
import { DISTRICT_IDS, type DistrictId, type PlaceId } from '@/content/places';
import type {
  DemandForecast, NextAction, ObjectiveInfo, PropertyStatus, SimQueries, StackId, TodaySummary,
} from './api';
import type { SimCtx } from './ctx';
import { parseProduct, parseStack, stackValue } from './products';
import { canPlace, flowScore } from './systems/build';
import { def as customerDef } from './systems/customers';
import { bestStack, haggleInfo } from './systems/deals';
import { remainingDebt, shopListing, upgradeListings } from './systems/economy';
import { eventsForecast } from './systems/events';
import { auditRisk, frontCapacity, launderForecast } from './systems/fronts';
import { plantNeeds, stageOf } from './systems/growing';
import { crewSlots, emptyPots, plantsAt, potsOf, stashCapacity, stationsOf } from './systems/layout';
import { mixCap, previewMix } from './systems/mixing';
import { objectiveText } from './systems/missions';
import { rankInfo, unlockLock } from './systems/progression';
import { territoryRows } from './systems/rivals';
import { idleNote, prologueStatus } from './systems/story';
import { walkUpCandidates } from './systems/customers';

/** Read-only selectors. Queries never advance the RNG or change state. */

/** When each district wants product most (clock hours → multiplier). */
const DISTRICT_RHYTHM: Readonly<Record<DistrictId, (h: number) => number>> = {
  flats: (h) => (h >= 7 && h < 19 ? 1.1 : 0.9),
  strand: (h) => (h >= 15 || h < 2 ? 1.3 : 0.85),
  deco: (h) => (h >= 19 || h < 3 ? 1.25 : 0.95),
  crown: (h) => (h >= 9 && h < 21 ? 1.15 : 0.9),
  harbor: (h) => (h >= 4 && h < 12 ? 1.3 : 0.9),
  sawgrass: (h) => (h >= 19 || h < 5 ? 1.1 : 0.95),
  isla: (h) => (h >= 16 && h < 24 ? 1.3 : 0.85),
  keys: () => 1,
};

function vibesOf(ctx: SimCtx, district: DistrictId): Vibe[] {
  const score = new Map<Vibe, number>();
  for (const c of ctx.content.customerList) {
    if (c.district !== district) continue;
    for (const e of c.loves) for (const v of EFFECTS[e].vibes) score.set(v, (score.get(v) ?? 0) + 1);
  }
  for (const [v, k] of Object.entries(ctx.mods.vibe)) score.set(v as Vibe, (score.get(v as Vibe) ?? 0) * (k ?? 1) + ((k ?? 1) > 1 ? 3 : 0));
  return [...score.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([v]) => v);
}

const VIBE_LABEL: Readonly<Record<Vibe, string>> = {
  party: 'Party', chill: 'Chill', focus: 'Focus', creative: 'Creative', night: 'Night owl', beach: 'Beach', romance: 'Romance', weird: 'Weird', sleep: 'Sleepy',
};

function forecast(ctx: SimCtx): DemandForecast[] {
  const h = ctx.world.hours;
  return DISTRICT_IDS.map((d) => {
    const demand = Math.max(0.5, Math.min(2, (ctx.mods.demand[d] ?? 1) * DISTRICT_RHYTHM[d](h)));
    const wants = vibesOf(ctx, d).map((v) => VIBE_LABEL[v]);
    const trend: -1 | 0 | 1 = demand > 1.08 ? 1 : demand < 0.92 ? -1 : 0;
    const name = ctx.content.districts[d].name;
    const line = `${name} wants ${wants[0] ?? 'Chill'}${trend > 0 ? ' ▲' : trend < 0 ? ' ▼' : ''}`;
    return { district: d, demand: Math.round(demand * 100) / 100, trend, wants, line };
  });
}

function today(ctx: SimCtx): TodaySummary {
  const l = ctx.state.today;
  let best: string | null = null;
  let sold = 0;
  for (const p of Object.values(ctx.state.products)) if (p.sold > sold) {
    sold = p.sold;
    best = p.id;
  }
  return {
    day: l.day, earned: l.earnedDirty + l.earnedClean, spent: l.spent, deals: l.deals + l.crewDeals, perfect: l.perfect,
    units: l.units, harvested: l.harvested, discoveries: l.discoveries, bestSeller: best,
  };
}

function hasMatching(ctx: SimCtx, wants: { effects: readonly string[]; tier: string; qty: number }): boolean {
  let n = 0;
  for (const k in ctx.state.bag) {
    const p = parseProduct(parseStack(k)?.product ?? '');
    if (!p || p.tier !== wants.tier) continue;
    if (wants.effects.length && !wants.effects.some((e) => p.effects.includes(e as never))) continue;
    n += ctx.state.bag[k]!;
  }
  return n >= wants.qty;
}

function nextActions(ctx: SimCtx, limit = 3): NextAction[] {
  const out: NextAction[] = [];
  const add = (a: NextAction) => out.push(a);
  const mission = objectiveText(ctx);
  if (mission) add({ id: 'mission', label: mission.text, detail: MISSIONS[ctx.state.missions.active!].title, icon: 'star', place: mission.place as PlaceId | null, priority: 100 });
  const pro = prologueStatus(ctx);
  if (!pro.done && pro.objective) add({ id: 'prologue', label: pro.objective, detail: pro.hint ?? '', icon: 'star', place: pro.place, priority: 95 });
  const raid = ctx.state.heat.raid;
  if (raid && (raid.status === 'warned' || raid.status === 'imminent')) {
    add({ id: 'raid', label: `Prepare for the raid at ${ctx.content.properties[raid.property].name}`, detail: `Tip came in. About ${fmt.duration(raid.at - ctx.now)} left.`, icon: 'siren', place: raid.property, priority: 90 });
  }
  for (const r of ctx.state.requests) {
    const name = customerDef(ctx, r.customer).short;
    if (r.status === 'accepted') {
      if (hasMatching(ctx, r.wants)) add({ id: `meet-${r.id}`, label: `Meet ${name} at ${ctx.content.places[r.place].name}`, detail: r.expiresAt ? ctx.byText(r.expiresAt) : '', icon: 'handshake', place: r.place, priority: 85 });
      else add({ id: `make-${r.id}`, label: `Get ${r.wants.qty} ${r.wants.effects.length ? r.wants.effects.map((e) => EFFECTS[e].name).join(' or ') : 'good'} units for ${name}`, detail: 'Harvest, mix or pack the bag', icon: 'bowl', place: null, priority: 60 });
    } else if (r.status === 'pending') {
      add({ id: `reply-${r.id}`, label: `Answer ${name}’s text`, detail: 'Accept, counter or decline', icon: 'chat', place: null, priority: 80 });
    }
  }
  for (const id of Object.keys(ctx.state.properties) as PropertyId[]) {
    if (!ctx.state.properties[id].owned) continue;
    const plants = plantsAt(ctx, id);
    const name = ctx.content.properties[id].name;
    const ripe = plants.filter((p) => p.growth >= 1).length;
    if (ripe) add({ id: `harvest-${id}`, label: `Harvest ${ripe} ripe plant${ripe > 1 ? 's' : ''}`, detail: name, icon: 'scissors', place: id, priority: 70 });
    const needy = plants.filter((p) => plantNeeds(ctx, p).some((n) => n === 'water' || n === 'food' || n === 'prune')).length;
    if (needy) add({ id: `tend-${id}`, label: `Tend ${needy} plant${needy > 1 ? 's' : ''}`, detail: name, icon: 'water', place: id, priority: 65 });
    const empty = emptyPots(ctx, id).length;
    if (empty) {
      const seeds = Object.keys(ctx.state.supplies).some((k) => k.startsWith('seed:') && (ctx.state.supplies[k as `seed:${string}`] ?? 0) > 0);
      add(seeds
        ? { id: `plant-${id}`, label: `Plant ${empty} empty pot${empty > 1 ? 's' : ''}`, detail: name, icon: 'seed', place: id, priority: 55 }
        : { id: 'seeds', label: 'Buy seeds at Sod Almighty', detail: `${empty} empty pots at ${name}`, icon: 'seed', place: 'sodAlmighty', priority: 50 });
    }
  }
  const upgrade = upgradeListings(ctx).filter((u) => !u.owned && !u.locked && u.affordable).sort((a, b) => a.cost - b.cost)[0];
  if (upgrade) add({ id: `upgrade-${upgrade.id}`, label: `Buy ${upgrade.name}`, detail: upgrade.line, icon: upgrade.icon, place: null, priority: 45 });
  for (const id of Object.keys(ctx.state.missions.progress) as Array<keyof typeof MISSIONS>) {
    if (ctx.state.missions.progress[id].status === 'available' && !ctx.state.missions.active) {
      add({ id: `mission-${id}`, label: `New job: ${MISSIONS[id].title}`, detail: MISSIONS[id].blurb, icon: 'star', place: null, priority: 40 });
      break;
    }
  }
  for (const c of Object.values(ctx.state.crew)) {
    if (c.status === 'upset' || c.status === 'needsSupplies' || (c.status === 'quit' && c.winBackUntil !== null && c.winBackUntil > ctx.now)) {
      add({ id: `crew-${c.id}`, label: `${c.name} needs attention`, detail: c.status === 'needsSupplies' ? 'Out of supplies' : c.status === 'quit' ? 'Quit — win them back' : 'Morale is low', icon: 'crew', place: null, priority: 35 });
    }
  }
  const debt = ctx.state.money.debt;
  if (!debt.settled && debt.nextCheckDay > 0 && debt.paid < debt.expectedByCheck) {
    add({ id: 'debt', label: `Pay Vale ${fmt.money(debt.expectedByCheck - debt.paid)} by day ${debt.nextCheckDay}`, detail: `${fmt.money(remainingDebt(ctx))} left in total`, icon: 'bank', place: null, priority: 30 });
  }
  if (ctx.isUnlocked('feature:samples') && ctx.content.customerList.some((c) => c.unlock.via === 'sample' && !ctx.state.customers[c.id].unlocked)) {
    add({ id: 'samples', label: 'Hand out a free sample', detail: 'Strangers become regulars', icon: 'gift', place: null, priority: 20 });
  }
  add({ id: 'idle', label: idleNote(ctx), detail: '', icon: 'leaf', place: null, priority: 10 });
  return out.sort((a, b) => b.priority - a.priority).slice(0, Math.max(1, limit));
}

function objective(ctx: SimCtx): ObjectiveInfo | null {
  const mission = objectiveText(ctx);
  if (mission) return { text: mission.text, place: mission.place as PlaceId | null, icon: 'star', source: 'mission' };
  const pro = prologueStatus(ctx);
  if (!pro.done && pro.objective) return { text: pro.objective, place: pro.place, icon: 'star', source: 'prologue' };
  const r = ctx.state.requests.find((x) => x.status === 'accepted');
  if (r) return { text: `Meet ${customerDef(ctx, r.customer).short} at ${ctx.content.places[r.place].name}`, place: r.place, icon: 'handshake', source: 'request' };
  const top = nextActions(ctx, 1)[0];
  return top ? { text: top.label, place: top.place, icon: top.icon, source: 'suggestion' } : null;
}

function operations(ctx: SimCtx): PropertyStatus[] {
  return (Object.keys(ctx.state.properties) as PropertyId[]).map((id) => {
    const st = ctx.state.properties[id];
    const plants = plantsAt(ctx, id);
    const alerts: string[] = [];
    const thirsty = plants.filter((p) => p.water < 0.22).length;
    const ripe = plants.filter((p) => p.growth >= 1).length;
    if (st.owned) {
      if (ripe) alerts.push(`${ripe} ripe`);
      if (thirsty) alerts.push(`${thirsty} thirsty`);
      if (st.lockdownUntil > ctx.now) alerts.push('Lockdown');
      if (ctx.state.heat.raid?.property === id && (ctx.state.heat.raid.status === 'warned' || ctx.state.heat.raid.status === 'imminent')) alerts.push('Raid coming');
      if (ctx.totalUnits(id) >= stashCapacity(ctx, id)) alerts.push('Stash full');
    }
    return {
      id, owned: st.owned, plants: plants.length, ripe, thirsty, growing: plants.length - ripe,
      jobs: ctx.state.jobs.filter((j) => j.property === id).length, stashUnits: ctx.totalUnits(id),
      visibility: st.visibility, security: st.security, lockdown: Math.max(0, st.lockdownUntil - ctx.now), alerts,
    };
  });
}

export function buildQueries(ctx: SimCtx): SimQueries {
  return {
    rank: () => rankInfo(ctx),
    today: () => today(ctx),
    forecast: () => forecast(ctx),
    eventsForecast: () => eventsForecast(ctx),
    nextActions: (limit) => nextActions(ctx, limit),
    objective: () => objective(ctx),
    prologue: () => prologueStatus(ctx),
    goals: () => ctx.state.progression.goals,
    operations: () => operations(ctx),
    upgrades: () => upgradeListings(ctx),
    shop: (shop) => shopListing(ctx, shop),
    mixPreview: (base: StackId, additives: readonly AdditiveId[]) => {
      const st = parseStack(base);
      const p = parseProduct(st ? st.product : base);
      if (!p) return { effects: [], exact: false, fused: null, harmony: null, value: 0, cap: mixCap(ctx), known: null };
      return previewMix(ctx, p.effects, p.tier, p.strain, st?.stars ?? 3, additives);
    },
    mixCap: () => mixCap(ctx),
    bestStack: (target) => bestStack(ctx, target),
    haggle: (deal, stack, qty) => haggleInfo(ctx, deal, stack, qty),
    unitValue: (stack) => Math.round(stackValue(ctx, stack)),
    walkUps: (place) => walkUpCandidates(ctx, place),
    bagUnits: () => ctx.totalUnits('bag'),
    stackUnits: (stack, where = 'bag') => ctx.units(where, stack),
    parseStack: (stack) => parseStack(stack),
    plantStage: (plant) => stageOf(ctx.state.plants[plant]?.growth ?? 0),
    plantNeeds: (plant) => (ctx.state.plants[plant] ? plantNeeds(ctx, ctx.state.plants[plant]) : []),
    strainDef: (strain) => ctx.strain(strain),
    crewBoard: () => Object.values(ctx.state.crew),
    candidates: () => ctx.state.candidates,
    propertyCaps: (prop) => ({ pots: potsOf(ctx, prop).length, stations: stationsOf(ctx, prop), stash: stashCapacity(ctx, prop), crew: crewSlots(ctx, prop) }),
    flowScore: (prop) => flowScore(ctx, prop),
    canPlace: (prop, item, x, y, rot) => canPlace(ctx, prop, item, x, y, rot),
    territory: () => territoryRows(ctx),
    bank: () => ({
      dirty: ctx.state.money.dirty, clean: ctx.state.money.clean, debt: { ...ctx.state.money.debt },
      fronts: (Object.keys(FRONTS) as FrontId[]).map((id) => {
        const st = ctx.state.fronts[id];
        return { id, owned: st.owned, capacity: frontCapacity(ctx, id), launderedToday: st.launderedToday, push: st.push, auditRisk: auditRisk(ctx, id) };
      }),
    }),
    launderForecast: () => launderForecast(ctx),
    isLocked: (unlock) => unlockLock(ctx, unlock),
    clockIn: (seconds) => ctx.clockIn(seconds),
  };
}
