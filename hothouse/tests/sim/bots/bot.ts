import { advanceClock, createClock, hoursFromDayT, type ClockState } from '@/core/clock';
import { EventBus } from '@/core/events';
import { Rng } from '@/core/rng';
import type { AdditiveId } from '@/content/additives';
import type { CustomerId, Difficulty, PlaceableId, PropertyId, UpgradeId } from '@/content/ids';
import { MISSIONS } from '@/content/missions';
import type { PlaceId } from '@/content/places';
import type { StrainId } from '@/content/strains';
import { createSim, type FeedProfile, type LightLevel, type Sim, type SimWorldInput, type StackId } from '@/sim';
import { activeHangout, meetPlace } from '@/sim/systems/customers';
import { districtOf, travelSeconds } from './travel';

/**
 * Economy bots: they play HOTHOUSE through the public sim API with travel times, action durations
 * and decision costs, the way a person would. Three temperaments probe the economy.
 */

export type BotKind = 'casual' | 'optimizer' | 'riskTaker';

export interface BotProfile {
  readonly think: number;
  readonly drive: number;
  readonly haggle: 'auto' | 'read' | 'push';
  readonly flow: number;
  readonly explore: number;
  readonly idle: number;
  readonly witnessed: number;
  readonly missionTime: number;
  readonly feed: FeedProfile;
  readonly lights: LightLevel;
  readonly buffer: number;
  readonly samples: boolean;
}

export const PROFILES: Readonly<Record<BotKind, BotProfile>> = {
  casual: { think: 7, drive: 1.3, haggle: 'auto', flow: 0.15, explore: 0.25, idle: 0.12, witnessed: 0.03, missionTime: 150, feed: 'balanced', lights: 'standard', buffer: 400, samples: false },
  optimizer: { think: 3, drive: 0.9, haggle: 'read', flow: 0.6, explore: 0.35, idle: 0, witnessed: 0.02, missionTime: 90, feed: 'quality', lights: 'blaze', buffer: 250, samples: true },
  riskTaker: { think: 4, drive: 0.85, haggle: 'push', flow: 0.45, explore: 0.15, idle: 0.05, witnessed: 0.22, missionTime: 110, feed: 'yield', lights: 'blaze', buffer: 150, samples: true },
};

export interface BotReport {
  kind: BotKind;
  firstPurchase: number | null;
  rankAt: Record<number, number>;
  finaleReady: number | null;
  debtSettled: number | null;
  cash: Array<[number, number]>;
  earnedPerMinute: Array<[number, number]>;
  busts: number;
  raids: number;
  deals: number;
  crewDeals: number;
  discoveries: number;
  apex: number;
  missions: string[];
  maxNotoriety: number;
  products: number;
}

const UPGRADE_PLAN: readonly UpgradeId[] = [
  'dripIrrigation', 'snipSnap', 'secondBurner', 'bigBowl', 'sunLamps', 'autoRestock', 'recipeBox', 'climateControl', 'autoFeed',
  'coldStill', 'blackout', 'breedingCabinet', 'crewVan', 'chauffeur', 'sunPress', 'secretPage',
];

export class Bot {
  readonly sim: Sim;
  readonly bus = new EventBus();
  readonly rng: Rng;
  readonly profile: BotProfile;
  readonly report: BotReport;
  place: PlaceId = 'ofelias';
  t = 0;
  private clock: ClockState = createClock(18 + 40 / 60);
  private walkUps: Array<{ customer: CustomerId; place: PlaceId }> = [];
  private lastSample = 0;
  private lastBuild = 0;

  constructor(readonly kind: BotKind, seed: number, difficulty: Difficulty = 'classic') {
    this.profile = PROFILES[kind];
    this.rng = new Rng(seed * 31 + 7);
    this.sim = createSim({ seed, difficulty, bus: this.bus });
    this.report = {
      kind, firstPurchase: null, rankAt: { 1: 0 }, finaleReady: null, debtSettled: null, cash: [], earnedPerMinute: [], busts: 0, raids: 0,
      deals: 0, crewDeals: 0, discoveries: 0, apex: 0, missions: [], maxNotoriety: 0, products: 0,
    };
    this.bus.on('sim:rankUp', (e) => (this.report.rankAt[e.rank] ??= Math.round(this.t)));
    this.bus.on('sim:walkUp', (e) => this.walkUps.push(e));
    this.bus.on('sim:bust', () => this.report.busts++);
    this.bus.on('sim:raid', (e) => e.status === 'resolved' && this.report.raids++);
    this.bus.on('sim:supplies', (e) => e.source === 'purchase' && this.report.firstPurchase === null && (this.report.firstPurchase = Math.round(this.t)));
  }

  // ── helpers ─────────────────────────────────────────────────────────────

  private afford(n: number): boolean {
    return this.sim.state.money.dirty + this.sim.state.money.clean >= n;
  }

  private unlocked(id: string): boolean {
    return !this.sim.query.isLocked(id).locked;
  }

  private units(prop: PropertyId): number {
    const stash = this.sim.state.properties[prop].stash;
    let n = 0;
    for (const k in stash) n += stash[k]!;
    return n;
  }

  // ── time and place ──────────────────────────────────────────────────────

  private world(transit: boolean): SimWorldInput {
    const owned = this.sim.state.properties[this.place as PropertyId]?.owned ? (this.place as PropertyId) : null;
    return {
      day: this.clock.day, hours: hoursFromDayT(this.clock.t), weather: 'clear', district: districtOf(this.place),
      place: transit ? null : this.place, insideProperty: transit ? null : owned, streetHeat: 0, inVehicle: transit, busy: false,
    };
  }

  wait(seconds: number, transit = false): void {
    let left = seconds;
    while (left > 0) {
      const step = Math.min(1, left);
      const s = this.sim.state.story.beats;
      if (s.prologueDone !== undefined || s.duskFalls !== undefined) advanceClock(this.clock, step);
      this.sim.tick(step, this.world(transit));
      this.t += step;
      left -= step;
      if (Math.floor(this.t) % 300 === 0 && step === 1) this.sample();
    }
  }

  private sample(): void {
    const s = this.sim.state;
    const minute = Math.round(this.t / 60);
    if (this.report.cash.at(-1)?.[0] === minute) return;
    this.report.cash.push([minute, s.money.dirty + s.money.clean]);
    this.report.earnedPerMinute.push([minute, s.money.lifetimeEarned]);
    this.report.maxNotoriety = Math.max(this.report.maxNotoriety, s.heat.notoriety);
    if (this.report.finaleReady === null && s.missions.progress.hurricaneNight.status !== 'locked') this.report.finaleReady = Math.round(this.t);
    if (this.report.debtSettled === null && s.money.debt.settled) this.report.debtSettled = Math.round(this.t);
  }

  go(to: PlaceId): void {
    const secs = travelSeconds(this.place, to) * this.profile.drive;
    this.wait(secs, true);
    this.place = to;
    this.syncClock();
  }

  /** Keep the bot's clock aligned with the sim (time skips move the sim clock). */
  private syncClock(): void {
    const c = this.sim.state.clock;
    if (c.day > this.clock.day || (c.day === this.clock.day && c.hours > hoursFromDayT(this.clock.t) + 0.05)) {
      this.clock = createClock(c.hours, c.day);
    }
  }

  // ── selling ──────────────────────────────────────────────────────────────

  private sell(dealId: string): boolean {
    const sim = this.sim;
    const deal = sim.state.deals.find((d) => d.id === dealId);
    const stack = sim.query.bestStack(dealId);
    if (!deal || !stack) {
      sim.cmd.walkAway(dealId);
      return false;
    }
    const qty = Math.max(1, Math.min(sim.state.bag[stack] ?? 0, deal.wants.qty));
    const h = sim.query.haggle(dealId, stack, qty)!;
    const witnessed = this.rng.chance(this.profile.witnessed);
    const extras = { flow: this.rng.next() * this.profile.flow * 1.6, witnessed };
    this.wait(5);
    let res;
    const style = this.profile.haggle === 'auto' && this.rng.chance(0.25) ? 'read' : this.profile.haggle;
    if (style === 'auto') res = sim.cmd.autoPrice(dealId, stack, qty, extras);
    else {
      const price = style === 'push' ? h.bandHigh : h.bandLow + (h.bandHigh - h.bandLow) * 0.3;
      res = sim.cmd.offer(dealId, { stack, qty, unitPrice: price, ...extras });
      if (res.ok && res.value.kind === 'counter') res = sim.cmd.acceptCounter(dealId, extras);
    }
    if (!res.ok || res.value.kind !== 'sale') return false;
    this.report.deals++;
    if (res.value.streetHeat > 0) {
      // A chase: risk-takers sometimes get caught.
      this.wait(45, true);
      if (this.rng.chance(0.45)) sim.cmd.bust();
      else sim.cmd.escaped(1 + (this.rng.chance(0.3) ? 1 : 0));
    }
    return true;
  }

  private haveFor(wants: { effects: readonly string[]; tier: string; qty: number }, store: Record<StackId, number>): number {
    let n = 0;
    for (const k in store) {
      const st = this.sim.query.parseStack(k);
      const p = st ? this.sim.state.products[st.product] : null;
      if (!p || p.tier !== wants.tier) continue;
      if (wants.effects.length && !wants.effects.some((e) => p.effects.includes(e as never))) continue;
      n += store[k]!;
    }
    return n;
  }

  /** Units of the right tier, whatever the effects (a player sells what they have). */
  private tierStock(tier: string): number {
    const sim = this.sim;
    const count = (store: Record<StackId, number>) => this.haveFor({ effects: [], tier, qty: 0 }, store);
    return count(sim.state.bag) + this.ownedProps().reduce((s, p) => s + count(sim.state.properties[p].stash), 0);
  }

  private handleRequests(): void {
    const sim = this.sim;
    for (const r of [...sim.state.requests]) {
      if (r.status !== 'pending' || r.story) continue;
      const exact = this.haveFor(r.wants, sim.state.bag) + this.ownedProps().reduce((s, p) => s + this.haveFor(r.wants, sim.state.properties[p].stash), 0);
      const any = this.tierStock(r.wants.tier);
      const yes = exact >= r.wants.qty || any >= r.wants.qty || (this.kind === 'casual' && any > 0);
      this.wait(this.kind === 'casual' ? 4 : 2);
      if (r.message) sim.cmd.replyChip(r.message, yes ? (this.kind === 'riskTaker' && this.rng.chance(0.5) ? 'counter' : 'accept') : 'decline');
    }
    const accepted = sim.state.requests.filter((r) => r.status === 'accepted' && !r.story);
    accepted.sort((a, b) => travelSeconds(this.place, a.place) - travelSeconds(this.place, b.place));
    for (const r of accepted.slice(0, 3)) {
      if (this.haveFor({ effects: [], tier: r.wants.tier, qty: 0 }, sim.state.bag) < r.wants.qty) this.packFromStash();
      if (this.haveFor({ effects: [], tier: r.wants.tier, qty: 0 }, sim.state.bag) < 1) continue;
      this.go(r.place);
      const deal = sim.cmd.openDeal({ request: r.id });
      if (deal.ok) this.sell(deal.value.id);
    }
  }

  private handleWalkUps(): void {
    const pending = this.walkUps.filter((w) => w.place === this.place);
    this.walkUps = [];
    for (const w of pending.slice(0, 2)) {
      if (this.sim.query.bagUnits() < 1) return;
      const deal = this.sim.cmd.openDeal({ walkUp: w.customer, place: w.place });
      if (deal.ok) this.sell(deal.value.id);
    }
  }

  // ── growing and mixing ───────────────────────────────────────────────────

  private ownedProps(): PropertyId[] {
    return (Object.keys(this.sim.state.properties) as PropertyId[]).filter((p) => this.sim.state.properties[p].owned);
  }

  private bestStrain(): StrainId {
    const sim = this.sim;
    let best: StrainId = 'abuelasBlush';
    let score = 0;
    for (const id of sim.content.strainIds) {
      const s = sim.content.strains[id];
      if (s.rank > sim.state.progression.rank) continue;
      const v = (s.value * s.appeal * s.yield) / s.growTime / (1 + s.seedPrice / 200);
      if (v > score) {
        score = v;
        best = id;
      }
    }
    return best;
  }

  private ensureSeeds(n: number): StrainId | null {
    const sim = this.sim;
    const strain = this.bestStrain();
    if ((sim.state.supplies[`seed:${strain}`] ?? 0) >= n) return strain;
    const owned = Object.keys(sim.state.supplies).find((k) => k.startsWith('seed:') && (sim.state.supplies[k as `seed:${string}`] ?? 0) > 0);
    const price = sim.content.strains[strain as keyof typeof sim.content.strains].seedPrice;
    const qty = Math.max(n, 6);
    if (!this.afford(price * qty + this.profile.buffer * 0.3)) return owned ? (owned.slice(5) as StrainId) : null;
    if (this.unlocked('app:market') && this.kind === 'optimizer') sim.cmd.order('gulfDirect', `seed:${strain}`, qty);
    else {
      this.go('sodAlmighty');
      this.wait(8);
      sim.cmd.buy('sodAlmighty', `seed:${strain}`, qty);
    }
    return strain;
  }

  private farm(prop: PropertyId): void {
    const sim = this.sim;
    const plants = Object.values(sim.state.plants).filter((p) => p.property === prop);
    const ripe = plants.filter((p) => p.growth >= 1);
    const needy = plants.some((p) => p.water < 0.3 || p.food < 0.3 || (!p.pruned && p.growth < 1));
    const caps = sim.query.propertyCaps(prop);
    const empty = caps.pots - plants.length + ripe.length;
    if (!ripe.length && !needy && empty <= 0) return;
    const strain = empty > 0 ? this.ensureSeeds(empty) : null;
    this.go(prop);
    if (sim.state.properties[prop].lights !== this.profile.lights && sim.state.progression.rank >= 2) sim.cmd.setLights(prop, this.profile.lights);
    for (const p of ripe) {
      this.wait(3);
      const grades = this.kind === 'optimizer' ? (['perfect', 'perfect', 'good'] as const) : (['good', 'good', 'ok'] as const);
      sim.cmd.harvest(p.id, grades);
    }
    if (needy) {
      this.wait(10);
      sim.cmd.tendAll(prop);
    }
    if (strain) {
      this.wait(4);
      sim.cmd.plantAll(prop, strain, this.profile.feed);
      this.wait(6);
      sim.cmd.tendAll(prop);
    }
    this.stowExtra(prop);
  }

  private stowExtra(prop: PropertyId): void {
    // Keep a working bag, stow the rest for crew and dealers.
    if (this.sim.query.bagUnits() > 30) this.sim.cmd.stow(prop);
  }

  private packFromStash(): void {
    const props = this.ownedProps().filter((p) => this.units(p) > 0);
    if (!props.length) return;
    const prop = props[0]!;
    this.go(prop);
    this.wait(3);
    this.sim.cmd.packBag(prop, 'smart');
  }

  /** Pick the best known mix (or explore) for a raw stack and run one batch. */
  private mixAt(prop: PropertyId): void {
    const sim = this.sim;
    const raws = Object.keys(sim.state.bag).filter((k) => k.startsWith('b.') && (sim.state.bag[k] ?? 0) >= 2 && sim.state.products[sim.query.parseStack(k)!.product]?.base === null);
    if (!raws.length) return;
    const raw = raws.sort((a, b) => (sim.state.bag[b] ?? 0) - (sim.state.bag[a] ?? 0))[0]!;
    const pool = sim.content.additiveIds.filter((a) => sim.content.additives[a].rank <= sim.state.progression.rank);
    let best: AdditiveId[] | null = null;
    let bestScore = sim.query.unitValue(raw) * 1.05;
    const explore = this.rng.chance(this.profile.explore);
    for (const a of pool) {
      for (const b of [null, ...pool]) {
        const adds = b ? [a, b] : [a];
        const pv = sim.query.mixPreview(raw, adds);
        const cost = adds.reduce((s, x) => s + sim.content.additives[x].price, 0);
        const score = (pv.exact ? pv.value : explore ? pv.value * 1.3 + 15 : 0) - cost;
        if (score > bestScore) {
          bestScore = score;
          best = adds;
        }
      }
    }
    if (!best) return;
    const qty = Math.min(sim.state.bag[raw] ?? 0, sim.query.mixCap(prop) >= 4 ? 12 : 5);
    for (const a of best) {
      const have = sim.state.supplies[`add:${a}`] ?? 0;
      if (have >= qty) continue;
      if (!this.buyAdditive(a, qty - have + 6)) return;
    }
    this.go(prop);
    this.wait(7);
    const r = sim.cmd.mix(prop, raw, best, qty);
    if (r.ok) {
      if (r.value.isNew) this.report.discoveries++;
      if (r.value.fused) this.report.apex++;
    }
  }

  private buyAdditive(a: AdditiveId, qty: number): boolean {
    const sim = this.sim;
    const shop = (['mamaYolis', 'sodAlmighty', 'annieStall'] as const).find((s) => sim.content.shops[s].stock.some((i) => 'additive' in i && i.additive === a));
    if (!shop) return false;
    const cost = sim.content.additives[a].price * qty;
    if (!this.afford(cost)) return false;
    if (this.kind === 'optimizer' && this.unlocked('app:market') && sim.content.shops.gulfDirect.stock.some((i) => 'additive' in i && i.additive === a)) {
      return sim.cmd.order('gulfDirect', `add:${a}`, qty).ok;
    }
    this.go(sim.content.shops[shop].place!);
    this.wait(6);
    return sim.cmd.buy(shop, `add:${a}`, qty).ok;
  }

  // ── expansion ────────────────────────────────────────────────────────────

  private expand(): void {
    const sim = this.sim;
    const rank = sim.state.progression.rank;
    for (const id of UPGRADE_PLAN) {
      const u = sim.query.upgrades().find((x) => x.id === id)!;
      if (u.owned || u.locked) continue;
      if (this.afford(u.cost + this.profile.buffer)) sim.cmd.buyUpgrade(id);
      break;
    }
    // Properties.
    for (const [id, minRank] of [['palmettoGarage', 4], ['harborWarehouse', 6], ['stiltHouse', 7], ['penthouse', 9]] as const) {
      const st = sim.state.properties[id];
      if (st.owned || rank < minRank) continue;
      const price = sim.content.properties[id].price;
      if (sim.state.money.dirty + sim.state.money.clean > price * 1.25 + this.profile.buffer) sim.cmd.buyProperty(id);
      break;
    }
    // Fronts.
    for (const id of ['sudsyFlamingo', 'tacoTsunami', 'leakyTiki', 'clubAftersun'] as const) {
      const f = sim.state.fronts[id];
      if (f.owned) continue;
      if (sim.cmd.buyFront(id).ok) sim.cmd.setLaunder(id, this.kind === 'riskTaker' ? 1.3 : 1);
      break;
    }
    // Crew.
    if (this.unlocked('feature:crew')) {
      const roles = ['grower', 'cook', 'dealer', 'dealer', 'grower', 'packer', 'dealer', 'accountant', 'lookout', 'guard', 'dealer', 'cook', 'driver'] as const;
      const have = Object.values(sim.state.crew).filter((c) => c.status !== 'quit');
      const want = roles.slice(0, Math.min(roles.length, rank * 2 - 4));
      const counts = new Map<string, number>();
      for (const c of have) counts.set(c.role, (counts.get(c.role) ?? 0) + 1);
      for (const role of want) {
        const n = counts.get(role) ?? 0;
        const needed = want.filter((r) => r === role).length;
        if (n >= needed) continue;
        const cand = sim.state.candidates.filter((c) => sim.content.crew[c.def]?.role === role).sort((a, b) => sim.content.crew[b.def]!.skill - sim.content.crew[a.def]!.skill)[0];
        if (cand && this.afford(cand.wage * 3 + this.profile.buffer)) {
          const r = sim.cmd.hire(cand.def);
          if (r.ok) counts.set(role, n + 1);
        }
        break;
      }
      for (const c of Object.values(sim.state.crew)) {
        if (c.status === 'quit' && c.winBackUntil && c.winBackUntil > sim.state.time) sim.cmd.winBack(c.id);
        if (c.status === 'upset') sim.cmd.bonus(c.id, c.wage);
        if (c.role === 'cook' && c.assignment.property && !c.assignment.recipe) {
          const fav = Object.values(sim.state.products).filter((p) => p.base && p.tier === 'bloom').sort((a, b) => b.made - a.made)[0];
          if (fav) sim.cmd.assign(c.id, { recipe: { base: fav.base!, additives: fav.additives } });
        }
      }
      sim.cmd.autoAssign();
    }
    if (sim.state.time - this.lastBuild > 300) this.build();
  }

  /** Add planters and stations where they fit. */
  private build(): void {
    const sim = this.sim;
    this.lastBuild = sim.state.time;
    const wants: PlaceableId[] = ['planterBox', 'planterTrough', 'coldStill', 'sunPress', 'couch', 'packingTable', 'desk', 'planterTrough', 'hydroTower', 'safe'];
    for (const prop of this.ownedProps()) {
      for (const item of wants) {
        const def = sim.content.placeables[item];
        if (def.rank > sim.state.progression.rank || !this.afford(def.cost + this.profile.buffer * 2)) continue;
        if (def.effects.station && sim.query.propertyCaps(prop).stations.includes(def.effects.station)) continue;
        const grid = sim.content.properties[prop].grid;
        let placed = false;
        sim.cmd.beginBuild(prop);
        for (let y = 0; y < grid.h && !placed; y++) {
          for (let x = 0; x < grid.w && !placed; x++) {
            if (sim.query.canPlace(prop, item, x, y, 0).ok) placed = sim.cmd.place(prop, item, x, y, 0).ok;
          }
        }
        sim.cmd.endBuild(prop);
        if (placed) return;
      }
    }
  }

  private refine(): void {
    const sim = this.sim;
    for (const prop of this.ownedProps()) {
      const stations = sim.query.propertyCaps(prop).stations;
      for (const station of ['coldStill', 'sunPress'] as const) {
        if (!stations.includes(station)) continue;
        const tier = station === 'coldStill' ? 'b.' : 'd.';
        const stack = Object.keys(sim.state.bag)
          .filter((k) => k.startsWith(tier) && (sim.state.bag[k] ?? 0) >= (station === 'coldStill' ? 6 : 1))
          .sort((a, b) => sim.query.unitValue(b) - sim.query.unitValue(a))[0];
        if (!stack) continue;
        this.go(prop);
        this.wait(8);
        const n = station === 'coldStill' ? Math.floor((sim.state.bag[stack] ?? 0) / 3 / 2) : Math.min(3, sim.state.bag[stack] ?? 0);
        if (n > 0) sim.cmd.refine(prop, stack, n);
      }
    }
  }

  private handleMoney(): void {
    const sim = this.sim;
    const d = sim.state.money.debt;
    if (!d.settled && d.nextCheckDay > 0) {
      const owed = Math.max(0, d.expectedByCheck - d.paid);
      const spare = sim.state.money.dirty - this.profile.buffer;
      if (owed > 0 && spare > 0) sim.cmd.payDebt(Math.min(owed + (this.kind === 'optimizer' ? 1000 : 0), spare), 'dirty');
      const left = d.principal - d.paid;
      if (this.kind !== 'riskTaker' && left > 0 && sim.state.money.dirty > left * 1.4 + 4000) sim.cmd.payDebt(left, 'dirty');
    }
    const raid = sim.state.heat.raid;
    if (raid && (raid.status === 'warned' || raid.status === 'imminent')) {
      if (this.afford(5000) && this.kind !== 'riskTaker') sim.cmd.raidPrepare('bribe');
      else sim.cmd.raidPrepare('moveStock');
    }
    if (sim.state.heat.notoriety > 55 && this.kind !== 'riskTaker' && this.afford(3000)) sim.cmd.bribe(1500);
  }

  private handleSamples(): void {
    const sim = this.sim;
    if (!this.profile.samples || !this.unlocked('feature:samples') || sim.state.time - this.lastSample < 180) return;
    const cheapest = Object.keys(sim.state.bag).sort((a, b) => sim.query.unitValue(a) - sim.query.unitValue(b))[0];
    if (!cheapest) return;
    this.lastSample = sim.state.time;
    this.wait(4);
    sim.cmd.giveSample({ district: districtOf(this.place) }, cheapest);
  }

  // ── missions ─────────────────────────────────────────────────────────────

  private missions(): void {
    const sim = this.sim;
    const id = sim.state.missions.active ?? (Object.keys(sim.state.missions.progress) as Array<keyof typeof MISSIONS>).find((m) => {
      const s = sim.state.missions.progress[m].status;
      return s === 'available' || s === 'failed';
    });
    if (!id) return;
    if (!sim.state.missions.active && !sim.cmd.missionStart(id).ok) return;
    const def = MISSIONS[id];
    for (let guard = 0; guard < 12 && sim.state.missions.active === id; guard++) {
      const p = sim.state.missions.progress[id];
      const obj = def.objectives[p.objective];
      if (!obj) break;
      if (obj.kind === 'goto' || obj.kind === 'talk') {
        this.go(obj.place);
        this.wait(25);
        sim.cmd.objectiveDone(id, p.objective);
      } else if (obj.kind === 'setpiece' || obj.kind === 'escape') {
        if (obj.kind === 'setpiece' && obj.place) this.go(obj.place);
        this.wait(this.profile.missionTime);
        if (this.rng.chance(this.kind === 'casual' ? 0.25 : 0.1)) {
          sim.cmd.missionFail(id, 'set-piece failed');
          this.wait(10);
          sim.cmd.missionRetry(id);
          this.wait(this.profile.missionTime * 0.5);
        }
        sim.cmd.objectiveDone(id, sim.state.missions.progress[id].objective);
      } else if (obj.kind === 'deliver') {
        const customer = obj.customer;
        let tries = 0;
        while (sim.state.missions.active === id && sim.state.missions.progress[id].objective === p.objective && tries++ < 6) {
          if (sim.query.bagUnits() < 1) this.packFromStash();
          if (sim.query.bagUnits() < 1) break;
          const who = customer ?? (Object.keys(sim.state.customers) as CustomerId[]).find((c) => sim.state.customers[c].unlocked && sim.content.customers[c].tiers.includes(obj.tier ?? 'bloom'));
          if (!who) break;
          const meet = meetPlace(sim.content.customers[who], sim.state.clock.hours);
          this.go(meet);
          const deal = sim.cmd.openDeal({ walkUp: who, place: meet });
          if (!deal.ok || !this.sell(deal.value.id)) break;
        }
        if (sim.state.missions.active === id && sim.state.missions.progress[id].objective === p.objective) {
          sim.cmd.missionFail(id, 'not enough product');
          return;
        }
      } else if (obj.kind === 'buyFront') {
        if (!sim.cmd.buyFront(obj.front).ok) {
          sim.cmd.missionFail(id, 'cannot afford');
          return;
        }
      } else if (obj.kind === 'choice') {
        let choice = obj.options[0]!.id;
        if (id === 'paidInFull') {
          const left = sim.state.money.debt.principal - sim.state.money.debt.paid;
          choice = this.afford(left) ? 'pay' : sim.state.money.debt.respect >= 60 ? 'partner' : 'defy';
        }
        if (id === 'podcast') choice = 'zenith';
        if (id === 'morningAfter') choice = 'legit';
        this.wait(20);
        if (!sim.cmd.missionComplete(id, choice).ok) {
          sim.cmd.missionFail(id, 'choice blocked');
          return;
        }
      } else break;
    }
    if (sim.state.missions.progress[id].status === 'done' && !this.report.missions.includes(id)) this.report.missions.push(id);
  }

  // ── main loop ────────────────────────────────────────────────────────────

  private step(): void {
    const sim = this.sim;
    this.wait(this.profile.think);
    this.handleMoney();
    this.handleRequests();
    this.handleWalkUps();
    for (const prop of this.ownedProps()) this.farm(prop);
    const bench = this.ownedProps().find((p) => sim.query.propertyCaps(p).stations.includes('workbench'));
    if (bench) this.mixAt(bench);
    this.refine();
    this.expand();
    this.handleSamples();
    if (sim.state.missions.active || this.rng.chance(0.5)) this.missions();
    // Hang around a busy hangout for walk-ups when the bag is full and nothing else is pressing.
    if (sim.query.bagUnits() >= 6 && sim.state.requests.every((r) => r.status !== 'accepted')) {
      const hot = sim.content.customerList.filter((c) => sim.state.customers[c.id].unlocked).map((c) => activeHangout(c, sim.state.clock.hours)?.place).filter(Boolean) as PlaceId[];
      if (hot.length) {
        this.go(this.rng.pick(hot));
        this.wait(30);
        this.handleWalkUps();
      }
    }
    if (this.rng.chance(this.profile.idle)) this.wait(this.rng.range(20, 60), true);
  }

  run(seconds: number): BotReport {
    this.playPrologue();
    while (this.t < seconds) this.step();
    this.sample();
    this.report.crewDeals = this.sim.state.totals.crewDeals;
    this.report.products = Object.keys(this.sim.state.products).length;
    return this.report;
  }

  private playPrologue(): void {
    const sim = this.sim;
    this.wait(20);
    const ripe = Object.values(sim.state.plants).find((p) => p.growth >= 1);
    if (ripe) {
      this.wait(5);
      sim.cmd.harvest(ripe.id, this.kind === 'optimizer' ? ['perfect', 'perfect', 'perfect'] : ['good', 'perfect', 'good']);
    }
    this.wait(12);
    const kiki = sim.state.requests.find((r) => r.customer === 'kiki');
    if (kiki?.message) sim.cmd.replyChip(kiki.message, 'accept');
    this.go('boardwalk');
    if (kiki) {
      const deal = sim.cmd.openDeal({ request: kiki.id });
      if (deal.ok) this.sell(deal.value.id);
    }
    this.go('sodAlmighty');
    this.wait(15);
    sim.cmd.buy('sodAlmighty', 'seed:abuelasBlush', 3);
    sim.cmd.buy('sodAlmighty', 'add:honey', 4);
    this.go('ofelias');
    this.farm('ofelias');
    this.wait(5);
    sim.cmd.tendAll('ofelias');
    const raw = Object.keys(sim.state.bag).find((k) => k.startsWith('b.abuelasBlush.sunkissed*'));
    if (raw) {
      this.wait(8);
      sim.cmd.mix('ofelias', raw, ['honey'], Math.min(3, sim.state.bag[raw] ?? 0));
    }
    this.wait(this.kind === 'casual' ? 45 : 25);
    sim.cmd.createBrand('Bot Botanicals', { shape: 1, icon: 2, palette: 3, type: 1 }, 1);
    this.wait(15);
    const marisol = sim.state.requests.find((r) => r.customer === 'marisol');
    if (marisol?.message) sim.cmd.replyChip(marisol.message, 'accept');
    this.farm('ofelias');
    this.go('palmettoPlaza');
    if (marisol) {
      const deal = sim.cmd.openDeal({ request: marisol.id });
      if (deal.ok) this.sell(deal.value.id);
    }
    this.wait(5);
    sim.cmd.buyUpgrade('dripIrrigation');
    this.wait(15);
  }
}
