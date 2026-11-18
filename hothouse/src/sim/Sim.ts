import { advanceClock, dayTFromHours, hoursFromDayT, secondsUntil } from '@/core/clock';
import type { EventBus } from '@/core/events';
import { fmt } from '@/core/i18n';
import { log } from '@/core/log';
import { fail } from '@/core/types';
import type {
  DayLedger, ShiftReport, Sim, SimCommands, SimDevCommands, SimQueries, SimResult, SimState, SimWorldInput,
} from './api';
import { SimCtx } from './ctx';
import { buildQueries } from './queries';
import { zeroLedger } from './state';
import { t } from './strings';
import { crossStrains, pickCross } from './systems/breeding';
import { beginBuild, endBuild, move, place, remove } from './systems/build';
import { brandCommands } from './systems/commandsBrand';
import { assign, autoAssign, bonus, crewNewDay, delegateRequest, fire, hire, praise, refreshCandidates, tickCrew, winBack } from './systems/crew';
import { giveSample, replyRequest, tickCustomers, unlockCustomer } from './systems/customers';
import { acceptCounter, autoPrice, offer, openDeal, tickDeals, walkAway } from './systems/deals';
import {
  buy, buyProperty, buyUpgrade, economyNewDay, order, packBag, payDebt, purchase, stow, subscribe, tickOrders, unsubscribe, upgradeTrack,
} from './systems/economy';
import { eventOutcome, rollEvents, tickEvents, triggerEvent } from './systems/events';
import { buyFront, frontsNewDay, setLaunder, tickFronts, upgradeFront } from './systems/fronts';
import { clearPot, harvestPlant, plantAll, plantSeed, setLights, tendAll, tendPlant, tickPlants } from './systems/growing';
import { bribe, bust, escaped, raidPrepare, raidResolve, tickHeat } from './systems/heat';
import { cancelJob, cookAgain, mix, queueJob, refine, renameProduct, setFavorite, tickJobs } from './systems/mixing';
import { chooseEnding, missionComplete, missionFail, missionRetry, missionStart, objectiveDone, onMissionAction, tickMissions } from './systems/missions';
import { addNotoriety } from './systems/notoriety';
import { addXp, tickGoals } from './systems/progression';
import { rivalAction, tickRivals } from './systems/rivals';
import { addNews, markRead, newsOnce, onBeat, onRankStory, onStoryAction, readNews, replyChip, tickStory } from './systems/story';
import { tickBrand } from './systems/brand';

const MAX_STEP = 5;

/** Wrap every command so a bug becomes a logged `invalid` result instead of a crash. */
function guard<T extends object>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [name, fn] of Object.entries(obj) as Array<[string, (...args: unknown[]) => unknown]>) {
    out[name] = (...args: unknown[]) => {
      try {
        return fn(...args);
      } catch (err) {
        log.error('sim', `command ${name} threw`, err);
        return fail('invalid');
      }
    };
  }
  return out as T;
}

function diffLedger(a: DayLedger, b: DayLedger): DayLedger {
  const out = zeroLedger(a.day);
  for (const k of Object.keys(out) as Array<keyof DayLedger>) if (k !== 'day') out[k] = a[k] - b[k];
  return out;
}

export class SimImpl implements Sim {
  private readonly ctx: SimCtx;
  readonly cmd: SimCommands;
  readonly query: SimQueries;
  readonly dev: SimDevCommands;
  readonly rev: Sim['rev'];

  constructor(state: SimState, bus: EventBus | null) {
    const ctx = new SimCtx(state, bus);
    this.ctx = ctx;
    this.rev = ctx.rev;
    ctx.onBeat = (beat) => {
      onBeat(ctx, beat);
      if (beat === 'prologueDone') {
        rollEvents(ctx, ctx.state.clock.day);
        if (ctx.isUnlocked('feature:crew')) refreshCandidates(ctx);
      }
      if (beat === 'hurricaneWatch') {
        triggerEvent(ctx, 'hurricaneWatch');
        newsOnce(ctx, 'hurricane');
      }
    };
    ctx.onRank = (rank) => {
      onRankStory(ctx, rank);
      for (const c of ctx.content.customerList) if (c.unlock.via === 'rank' && c.unlock.rank <= rank) unlockCustomer(ctx, c.id, 'rank');
      if (rank === 3) refreshCandidates(ctx);
    };
    ctx.onAction = (action, data) => {
      onStoryAction(ctx, action, data);
      onMissionAction(ctx, action, data);
      if (action === 'news' && typeof data === 'string') addNews(ctx, data);
      if (action === 'deal') {
        const stats = ctx.state.progression.stats;
        if (stats.deals >= 10) newsOnce(ctx, 'firstDeals');
        if (ctx.state.progression.perfectStreak >= 5) newsOnce(ctx, 'perfectStreak');
      }
      if (action === 'stunt') newsOnce(ctx, 'stunt', { brand: ctx.state.brand?.name ?? '' });
    };
    this.cmd = guard(this.commands());
    this.query = buildQueries(ctx);
    this.dev = this.devCommands();
  }

  get state(): SimState {
    return this.ctx.state;
  }

  get content(): Sim['content'] {
    return this.ctx.content;
  }

  tick(dt: number, world: SimWorldInput): void {
    if (!(dt > 0) || !Number.isFinite(dt)) return;
    const ctx = this.ctx;
    const s = ctx.state;
    ctx.world = { ...world };
    let left = dt;
    while (left > 0) {
      const step = Math.min(MAX_STEP, left);
      left -= step;
      s.time += step;
      if (world.day > s.clock.day) for (let d = s.clock.day + 1; d <= world.day; d++) this.newDay(d);
      s.clock = { day: world.day, hours: world.hours };
      tickEvents(ctx);
      tickPlants(ctx, step);
      tickJobs(ctx, step);
      tickCrew(ctx, step);
      tickCustomers(ctx, step);
      tickDeals(ctx);
      tickBrand(ctx, step);
      tickFronts(ctx, step);
      tickHeat(ctx, step);
      tickRivals(ctx, step);
      tickOrders(ctx);
      tickStory(ctx);
      tickMissions(ctx);
      tickGoals(ctx);
    }
  }

  private newDay(day: number): void {
    const ctx = this.ctx;
    frontsNewDay(ctx);
    crewNewDay(ctx);
    economyNewDay(ctx, day);
    ctx.state.today = zeroLedger(day);
    if (ctx.state.story.beats.prologueDone !== undefined) rollEvents(ctx, day);
    ctx.bump('cash', 'progression');
  }

  skipTime(seconds: number): ShiftReport {
    const ctx = this.ctx;
    const s = ctx.state;
    const from = { ...s.clock };
    const before = { ...s.totals };
    const total = Math.max(0, Math.min(3 * 960, Number.isFinite(seconds) ? seconds : 0));
    const pinned = s.story.beats.prologueDone === undefined && s.story.beats.duskFalls === undefined;
    if (pinned || total <= 0) return this.report(from, before, 0, pinned ? t('stopPinned') : null);
    // Open requests wait while you rest; open handoffs end.
    for (const r of s.requests) if (r.expiresAt !== null && (r.status === 'pending' || r.status === 'accepted')) r.expiresAt += total;
    for (const d of s.deals) if (d.status === 'open') d.status = 'walked';
    const clock = { day: s.clock.day, t: dayTFromHours(s.clock.hours), rate: 1 };
    const world: SimWorldInput = { ...ctx.world, busy: true, streetHeat: 0, inVehicle: false };
    let done = 0;
    let interrupted: string | null = null;
    while (done < total) {
      const step = Math.min(MAX_STEP, total - done);
      advanceClock(clock, step);
      world.day = clock.day;
      world.hours = hoursFromDayT(clock.t);
      this.tick(step, world);
      done += step;
      const raid = s.heat.raid;
      if (raid && (raid.status === 'imminent' || (raid.status === 'warned' && raid.at - ctx.now < 60))) {
        interrupted = t('stopRaid');
        break;
      }
    }
    ctx.world = { ...world, busy: false };
    return this.report(from, before, done, interrupted);
  }

  waitUntil(hours: number): ShiftReport {
    const s = this.ctx.state;
    const clock = { day: s.clock.day, t: dayTFromHours(s.clock.hours), rate: 1 };
    return this.skipTime(secondsUntil(clock, hours));
  }

  shiftReport(): ShiftReport {
    const s = this.ctx.state;
    const report = this.report(s.clock, s.lastReport, 0, null);
    s.lastReport = { ...s.totals };
    return report;
  }

  private report(from: { day: number; hours: number }, before: DayLedger, seconds: number, interrupted: string | null): ShiftReport {
    const s = this.ctx.state;
    const d = diffLedger(s.totals, before);
    const lines: string[] = [];
    if (d.harvested > 0) lines.push(t('reportPlants', { n: d.harvested }));
    if (d.made > 0) lines.push(t('reportMade', { n: d.made }));
    if (d.crewDeals > 0) lines.push(t('reportCrewDeals', { n: d.crewDeals }));
    if (d.laundered > 0) lines.push(t('reportLaundered', { amount: fmt.money(d.laundered) }));
    if (d.closeCalls > 0) lines.push(t('reportCloseCalls', { n: d.closeCalls }));
    if (lines.length === 0) lines.push(t('reportQuiet'));
    return {
      seconds, fromDay: from.day, fromHours: from.hours, toDay: s.clock.day, toHours: s.clock.hours,
      earnedDirty: d.earnedDirty, earnedClean: d.earnedClean, spent: d.spent, deals: d.deals, crewDeals: d.crewDeals, units: d.units,
      harvested: d.harvested, made: d.made, laundered: d.laundered, closeCalls: d.closeCalls, lines, interrupted,
    };
  }

  serialize(): SimState {
    // Unsigned form so a save always reads back bit-identical.
    const [a, b, c, d] = this.ctx.rng.getState();
    this.ctx.state.rng = [a >>> 0, b >>> 0, c >>> 0, d >>> 0];
    return JSON.parse(JSON.stringify(this.ctx.state)) as SimState;
  }

  private commands(): SimCommands {
    const ctx = this.ctx;
    const r = <T>(res: SimResult<T>): SimResult<T> => res;
    return {
      plant: (prop, pot, strain, feed) => plantSeed(ctx, prop, pot, strain, feed),
      plantAll: (prop, strain, feed) => plantAll(ctx, prop, strain, feed),
      tend: (plant) => tendPlant(ctx, plant, 'player'),
      tendAll: (prop) => tendAll(ctx, prop, 'player'),
      harvest: (plant, grades) => harvestPlant(ctx, plant, grades, 'player'),
      setLights: (prop, level) => setLights(ctx, prop, level),
      clearPot: (plant) => clearPot(ctx, plant),
      mix: (prop, base, additives, qty) => mix(ctx, prop, base, additives, qty, 'player'),
      refine: (prop, base, qty) => refine(ctx, prop, base, qty, 'player'),
      queueJob: (prop, recipe, qty) => queueJob(ctx, prop, recipe, qty, 'player'),
      cancelJob: (job) => cancelJob(ctx, job),
      cookAgain: (product, qty) => cookAgain(ctx, product, qty),
      favorite: (product, on) => setFavorite(ctx, product, on),
      renameProduct: (product, name) => renameProduct(ctx, product, name),
      crossStrains: (a, b) => crossStrains(ctx, a, b),
      pickCross: (option, name) => pickCross(ctx, option, name),
      ...brandCommands(ctx),
      replyRequest: (request, reply) => replyRequest(ctx, request, reply),
      openDeal: (source) => openDeal(ctx, source),
      offer: (deal, input) => offer(ctx, deal, input),
      autoPrice: (deal, stack, qty, extras) => autoPrice(ctx, deal, stack, qty, extras),
      acceptCounter: (deal, extras) => acceptCounter(ctx, deal, extras),
      walkAway: (deal) => walkAway(ctx, deal),
      giveSample: (target, stack) => giveSample(ctx, target, stack),
      buy: (shop, item, qty) => buy(ctx, shop, item, qty),
      order: (shop, item, qty) => order(ctx, shop, item, qty),
      subscribe: (item, qty, every) => subscribe(ctx, item, qty, every),
      unsubscribe: (item) => unsubscribe(ctx, item),
      packBag: (prop, plan) => packBag(ctx, prop, plan),
      stow: (prop, stack, qty) => stow(ctx, prop, stack, qty),
      buyUpgrade: (id) => buyUpgrade(ctx, id),
      buyProperty: (id) => buyProperty(ctx, id),
      upgradeTrack: (prop, track) => upgradeTrack(ctx, prop, track),
      beginBuild: (prop) => beginBuild(ctx, prop),
      endBuild: (prop) => endBuild(ctx, prop),
      place: (prop, item, x, y, rot) => place(ctx, prop, item, x, y, rot),
      move: (prop, placement, x, y, rot) => move(ctx, prop, placement, x, y, rot),
      remove: (prop, placement) => remove(ctx, prop, placement),
      hire: (def) => hire(ctx, def),
      fire: (crew) => fire(ctx, crew),
      assign: (crew, assignment) => assign(ctx, crew, assignment),
      autoAssign: () => autoAssign(ctx),
      praise: (crew) => praise(ctx, crew),
      bonus: (crew, amount) => bonus(ctx, crew, amount),
      winBack: (crew) => winBack(ctx, crew),
      delegateRequest: (request, crew) => delegateRequest(ctx, request, crew),
      payDebt: (amount, from) => payDebt(ctx, amount, from),
      buyFront: (front) => buyFront(ctx, front),
      upgradeFront: (front) => upgradeFront(ctx, front),
      setLaunder: (front, push) => setLaunder(ctx, front, push),
      bust: () => bust(ctx),
      escaped: (level) => escaped(ctx, level),
      bribe: (amount) => bribe(ctx, amount),
      raidPrepare: (action) => raidPrepare(ctx, action),
      raidResolve: (result) => raidResolve(ctx, result),
      rivalAction: (rival, action, turf) => rivalAction(ctx, rival, action, turf),
      eventOutcome: (instance, outcome) => eventOutcome(ctx, instance, outcome),
      missionStart: (mission) => missionStart(ctx, mission),
      objectiveDone: (mission, objective) => objectiveDone(ctx, mission, objective),
      missionComplete: (mission, choice) => missionComplete(ctx, mission, choice),
      missionFail: (mission, reason) => missionFail(ctx, mission, reason),
      missionRetry: (mission) => missionRetry(ctx, mission),
      chooseEnding: (ending) => chooseEnding(ctx, ending),
      replyChip: (message, chip) => replyChip(ctx, message, chip),
      markRead: (thread) => markRead(ctx, thread),
      readNews: () => readNews(ctx),
      worldBeat: (beat) => {
        ctx.beat(beat);
        return r({ ok: true, value: undefined });
      },
      setDifficulty: (difficulty) => {
        if (difficulty !== 'chill' && difficulty !== 'classic' && difficulty !== 'sweaty') return fail('invalid');
        ctx.state.difficulty = difficulty;
        ctx.bump('progression');
        return { ok: true, value: undefined };
      },
      purchase: (item) => purchase(ctx, item),
    };
  }

  private devCommands(): SimDevCommands {
    const ctx = this.ctx;
    return {
      grantCash: (amount, kind = 'dirty') => ctx.earn(amount, kind, 'dev'),
      grantXp: (amount) => addXp(ctx, amount, 'dev'),
      unlockAll: () => {
        addXp(ctx, Math.max(0, ctx.content.ranks[ctx.content.ranks.length - 1]!.xp - ctx.state.progression.xp), 'dev');
        for (const c of ctx.content.customerList) unlockCustomer(ctx, c.id, 'debug');
        for (const p of Object.values(ctx.state.properties)) p.owned = true;
        for (const f of Object.values(ctx.state.fronts)) f.owned = true;
        for (const s of ctx.content.strainIds) ctx.addSupply(`seed:${s}`, 20);
        for (const a of ctx.content.additiveIds) ctx.addSupply(`add:${a}`, 20);
        ctx.earn(100000, 'dirty', 'dev');
        ctx.earn(100000, 'clean', 'dev');
        ctx.bump('properties', 'fronts');
      },
      triggerEvent: (event) => {
        triggerEvent(ctx, event);
      },
      setNotoriety: (value) => addNotoriety(ctx, Math.max(0, Math.min(100, value)) - ctx.state.heat.notoriety),
      ripenAll: (prop) => {
        for (const p of Object.values(ctx.state.plants)) if (p.property === prop && p.growth < 1) {
          p.growth = 1;
          p.ripeFor = 0;
        }
        ctx.bump('plants');
      },
      unlockCustomer: (customer) => {
        unlockCustomer(ctx, customer, 'debug');
      },
    };
  }
}

