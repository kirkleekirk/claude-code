import { secondsUntil, dayTFromHours } from '@/core/clock';
import { fail, ok } from '@/core/types';
import { EVENTS } from '@/content/events';
import { EVENT_IDS, type EventId } from '@/content/ids';
import { DISTRICT_IDS, type DistrictId } from '@/content/places';
import type { EventInstance, SimResult } from '../api';
import { defaultMods, type Mods, type SimCtx } from '../ctx';
import { addHype } from './brand';
import { addNotoriety } from './notoriety';
import { addXp } from './progression';
import { rivalDemand } from './rivals';

/** Living events: a forecast a day ahead, active windows that bend the numbers, and outcomes. */

function lastDay(ctx: SimCtx, id: EventId): number {
  let d = -99;
  for (const e of ctx.state.events.list) if (e.event === id) d = Math.max(d, e.startDay);
  return d;
}

function schedule(ctx: SimCtx, id: EventId, inSeconds: number): EventInstance {
  const def = EVENTS[id];
  const ev = ctx.state.events;
  ev.seq += 1;
  const at = ctx.clockIn(inSeconds);
  const inst: EventInstance = {
    id: `ev${ev.seq}`, event: id, district: def.district, startAt: ctx.now + inSeconds, endAt: ctx.now + inSeconds + def.duration,
    startDay: at.day, startHours: at.hours, status: 'forecast', outcome: null,
  };
  ev.list.push(inst);
  ctx.emit('sim:event', { instance: inst.id, event: id, status: 'forecast', district: def.district });
  ctx.bump('events');
  return inst;
}

/** Roll tomorrow's events (called once per in-game day and once after the prologue). */
export function rollEvents(ctx: SimCtx, day: number): void {
  const ev = ctx.state.events;
  if (ev.lastRollDay >= day) return;
  ev.lastRollDay = day;
  const pool = EVENT_IDS.filter((id) => {
    const d = EVENTS[id];
    return d.weight > 0 && d.minRank <= ctx.rank && day + 1 - lastDay(ctx, id) > d.cooldown;
  });
  const count = ctx.rank >= 6 ? 2 : 1;
  const chosen: EventId[] = [];
  for (let i = 0; i < count && pool.length; i++) {
    const pick = ctx.rng.weighted(pool, (id) => EVENTS[id].weight);
    if (!pick) break;
    chosen.push(pick);
    pool.splice(pool.indexOf(pick), 1);
  }
  const clock = { day: ctx.state.clock.day, t: dayTFromHours(ctx.state.clock.hours), rate: 1 };
  for (const id of chosen) {
    let wait = secondsUntil(clock, EVENTS[id].start);
    if (wait < 240) wait += 960;
    schedule(ctx, id, wait);
  }
}

/** Dev and story: start an event right now. */
export function triggerEvent(ctx: SimCtx, id: EventId): EventInstance {
  const inst = schedule(ctx, id, 0);
  tickEvents(ctx);
  return inst;
}

function applyMods(mods: Mods, def: (typeof EVENTS)[EventId], district: DistrictId | null): void {
  const m = def.mods;
  const districts = district ? [district] : DISTRICT_IDS;
  if (m.thirst) mods.thirst *= m.thirst;
  if (m.growth) mods.growth *= m.growth;
  if (m.prices) mods.prices *= m.prices;
  if (m.notoriety) mods.notoriety *= m.notoriety;
  if (m.seeds) mods.seeds *= m.seeds;
  if (m.audit) mods.audit *= m.audit;
  if (m.requestRate) mods.requestRate *= m.requestRate;
  if (m.tips) mods.tips *= m.tips;
  for (const d of districts) {
    if (m.demand) mods.demand[d] = (mods.demand[d] ?? 1) * m.demand;
    if (m.police) mods.police[d] = (mods.police[d] ?? 1) * m.police;
  }
  if (m.vibes) for (const [v, k] of Object.entries(m.vibes)) mods.vibe[v as keyof Mods['vibe']] = (mods.vibe[v as keyof Mods['vibe']] ?? 1) * k!;
  if (m.supply) for (const [f, k] of Object.entries(m.supply)) mods.supply[f as keyof Mods['supply']] = (mods.supply[f as keyof Mods['supply']] ?? 1) * k!;
}

export function tickEvents(ctx: SimCtx): void {
  const ev = ctx.state.events;
  const mods = defaultMods();
  let changed = false;
  for (const inst of ev.list) {
    if (inst.status === 'forecast' && ctx.now >= inst.startAt) {
      inst.status = 'active';
      changed = true;
      ctx.emit('sim:event', { instance: inst.id, event: inst.event, status: 'started', district: inst.district });
    }
    if (inst.status === 'active' && ctx.now >= inst.endAt) {
      inst.status = 'done';
      changed = true;
      ctx.emit('sim:event', { instance: inst.id, event: inst.event, status: 'ended', district: inst.district });
    }
    if (inst.status === 'active') applyMods(mods, EVENTS[inst.event], inst.district);
  }
  for (const [d, k] of Object.entries(rivalDemand(ctx))) mods.demand[d as DistrictId] = (mods.demand[d as DistrictId] ?? 1) * k!;
  ctx.mods = mods;
  const before = ev.list.length;
  ev.list = ev.list.filter((e) => e.status !== 'done' || ctx.now - e.endAt < 1920);
  if (changed || ev.list.length !== before) ctx.bump('events');
}

export function eventOutcome(ctx: SimCtx, instance: string, outcome: string): SimResult {
  const inst = ctx.state.events.list.find((e) => e.id === instance);
  if (!inst) return fail('notFound');
  if (inst.outcome) return fail('alreadyDone');
  const o = EVENTS[inst.event].outcomes.find((x) => x.id === outcome);
  if (!o) return fail('invalid');
  inst.outcome = outcome;
  if (o.cash) ctx.earn(o.cash, 'dirty', 'reward');
  if (o.xp) addXp(ctx, o.xp, 'event');
  if (o.hype) addHype(ctx, o.hype);
  if (o.notoriety) addNotoriety(ctx, o.notoriety);
  if (o.rival) {
    const r = ctx.state.rivals[o.rival.id];
    r.pressure = Math.max(0, Math.min(100, r.pressure + o.rival.pressure));
    ctx.bump('rivals');
  }
  ctx.bump('events');
  return ok(undefined);
}

export function eventsForecast(ctx: SimCtx): EventInstance[] {
  return ctx.state.events.list.filter((e) => e.status !== 'done').sort((a, b) => a.startAt - b.startAt);
}
