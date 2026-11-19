import { advanceClock, createClock, hoursFromDayT, type ClockState } from '@/core/clock';
import { EventBus } from '@/core/events';
import { Rng } from '@/core/rng';
import type { AdditiveId } from '@/content/additives';
import type { CrewRole, CustomerId, Difficulty, MissionId, PlaceableId, PropertyId, ShopId, UpgradeId } from '@/content/ids';
import type { PlaceId } from '@/content/places';
import { itemKey } from '@/content/shops';
import type { StrainId } from '@/content/strains';
import { createSim, type FeedProfile, type LightLevel, type ProductId, type Sim, type SimWorldInput, type StackId, type SupplyId } from '@/sim';
import { activeHangout } from '@/sim/systems/customers';
import { playMission } from './missions';
import { districtOf, travelSeconds } from './travel';

/**
 * Economy bots: they play HOTHOUSE through the public sim API with travel times, menu time and
 * decision time, the way a person would. Three temperaments probe the economy.
 */

export type BotKind = 'casual' | 'optimizer' | 'riskTaker';

export interface BotProfile {
  /** Seconds spent deciding what to do next, every loop. */
  readonly think: number;
  /** Multiplier on driving time (route knowledge, driving skill). */
  readonly drive: number;
  /** Multiplier on menus, texts and tutorials. */
  readonly ui: number;
  readonly haggle: 'auto' | 'read' | 'push';
  /** Typical handoff flow (0–1). */
  readonly flow: number;
  /** Chance per mix of trying an untested additive. */
  readonly explore: number;
  /** Chance per loop of wandering off for a while. */
  readonly idle: number;
  /** Chance a handoff is witnessed. */
  readonly witnessed: number;
  /** Seconds to play a mission set-piece. */
  readonly missionTime: number;
  /** Chance per loop of picking up an available story mission. */
  readonly missionChance: number;
  /** Chance of resting until a time-window mission opens rather than waiting it out. */
  readonly restForMissions: number;
  /** Orders supplies by phone instead of driving to the shops. */
  readonly market: boolean;
  readonly feed: FeedProfile;
  readonly lights: LightLevel;
  /** Cash kept back before spending on growth. */
  readonly buffer: number;
  readonly samples: boolean;
  /** Share of the crew plan this player hires. */
  readonly crew: number;
  /** Accepted requests this player juggles at once. */
  readonly juggle: number;
}

export const PROFILES: Readonly<Record<BotKind, BotProfile>> = {
  casual: {
    think: 5, drive: 1.25, ui: 1.3, haggle: 'auto', flow: 0.15, explore: 0.3, idle: 0.08, witnessed: 0.03, missionTime: 150, missionChance: 0.6, restForMissions: 0.5,
    market: false, feed: 'balanced', lights: 'standard', buffer: 400, samples: false, crew: 0.7, juggle: 2,
  },
  optimizer: {
    think: 2.5, drive: 0.9, ui: 0.8, haggle: 'read', flow: 0.6, explore: 0.4, idle: 0, witnessed: 0.02, missionTime: 90, missionChance: 0.95, restForMissions: 0.8,
    market: true, feed: 'quality', lights: 'blaze', buffer: 250, samples: true, crew: 1, juggle: 3,
  },
  riskTaker: {
    think: 4, drive: 0.85, ui: 1, haggle: 'push', flow: 0.45, explore: 0.2, idle: 0.05, witnessed: 0.22, missionTime: 110, missionChance: 0.75, restForMissions: 0.6,
    market: true, feed: 'yield', lights: 'blaze', buffer: 150, samples: true, crew: 0.9, juggle: 3,
  },
};

export interface BotReport {
  kind: BotKind;
  seed: number;
  firstPurchase: number | null;
  firstSale: number | null;
  rankAt: Record<number, number>;
  finaleReady: number | null;
  debtSettled: number | null;
  cash: Array<[number, number]>;
  earnedPerMinute: Array<[number, number]>;
  xpCurve: Array<[number, number]>;
  xpBy: Record<string, number>;
  earnedBy: Record<string, number>;
  spentBy: Record<string, number>;
  busts: number;
  raids: number;
  deals: number;
  walkUps: number;
  crewDeals: number;
  discoveries: number;
  apex: number;
  missions: string[];
  maxNotoriety: number;
  products: number;
  crewSize: number;
  properties: number;
}

const UPGRADE_PLAN: readonly UpgradeId[] = [
  'dripIrrigation', 'secondBurner', 'snipSnap', 'sunLamps', 'bigBowl', 'autoRestock', 'recipeBox', 'coldStill', 'autoFeed',
  'climateControl', 'blackout', 'crewVan', 'chauffeur', 'breedingCabinet', 'sunPress', 'secretPage',
];
const PROPERTY_PLAN = [['palmettoGarage', 4], ['harborWarehouse', 6], ['stiltHouse', 7], ['penthouse', 9]] as const;
const FRONT_PLAN = ['sudsyFlamingo', 'tacoTsunami', 'leakyTiki', 'clubAftersun'] as const;
const CREW_PLAN: readonly CrewRole[] = [
  'grower', 'cook', 'dealer', 'dealer', 'grower', 'packer', 'dealer', 'lookout', 'accountant', 'dealer', 'guard', 'cook', 'grower',
  'dealer', 'driver', 'guard', 'dealer', 'grower',
];
const BUILD_PLAN: readonly PlaceableId[] = [
  'planterBox', 'planterTrough', 'coldStill', 'sunPress', 'couch', 'packingTable', 'desk', 'planterTrough', 'hydroTower', 'safe',
];
const SHOPS_IN_PERSON: readonly ShopId[] = ['sodAlmighty', 'mamaYolis', 'annieStall'];

const bump = (m: Record<string, number>, k: string, n: number) => (m[k] = (m[k] ?? 0) + n);

export class Bot {
  readonly sim: Sim;
  readonly bus = new EventBus();
  readonly rng: Rng;
  readonly profile: BotProfile;
  readonly report: BotReport;
  place: PlaceId = 'ofelias';
  t = 0;
  /** In a set-piece: no new texts, no walk-ups. */
  busy = false;
  /** Cash set aside for a mission purchase; growth spending waits until it is covered. */
  saveFor = 0;
  /** Missions the bot set aside until this sim time (not enough product or cash). */
  readonly missionCooldown = new Map<MissionId, number>();
  private clock: ClockState = createClock(18 + 40 / 60);
  private walkUps: Array<{ customer: CustomerId; place: PlaceId }> = [];
  private lastSample = 0;
  private lastPhone = 0;
  private lastBuild = 0;

  constructor(readonly kind: BotKind, seed: number, difficulty: Difficulty = 'classic') {
    this.profile = PROFILES[kind];
    this.rng = new Rng(seed * 31 + 7);
    this.sim = createSim({ seed, difficulty, bus: this.bus });
    this.report = {
      kind, seed, firstPurchase: null, firstSale: null, rankAt: { 1: 0 }, finaleReady: null, debtSettled: null, cash: [], earnedPerMinute: [], xpCurve: [], xpBy: {},
      earnedBy: {}, spentBy: {}, busts: 0, raids: 0, deals: 0, walkUps: 0, crewDeals: 0, discoveries: 0, apex: 0, missions: [],
      maxNotoriety: 0, products: 0, crewSize: 0, properties: 1,
    };
    this.bus.on('sim:rankUp', (e) => (this.report.rankAt[e.rank] ??= Math.round(this.t)));
    this.bus.on('sim:walkUp', (e) => this.walkUps.push(e));
    this.bus.on('sim:bust', () => this.report.busts++);
    this.bus.on('sim:raid', (e) => e.status === 'resolved' && this.report.raids++);
    this.bus.on('sim:xp', (e) => bump(this.report.xpBy, e.reason, e.amount));
    this.bus.on('sim:cash', (e) => bump(e.delta < 0 ? this.report.spentBy : this.report.earnedBy, e.reason, Math.abs(e.delta)));
    this.bus.on('sim:mixed', (e) => {
      if (e.isNew) this.report.discoveries++;
      if (e.fused) this.report.apex++;
    });
    this.bus.on('sim:mission', (e) => e.status === 'done' && !this.report.missions.includes(e.mission) && this.report.missions.push(e.mission));
    this.bus.on('sim:deal', (e) => e.kind === 'sale' && this.report.firstSale === null && (this.report.firstSale = Math.round(this.t)));
    this.bus.on('sim:supplies', (e) => e.source === 'purchase' && this.report.firstPurchase === null && (this.report.firstPurchase = Math.round(this.t)));
  }

  // ── helpers ─────────────────────────────────────────────────────────────

  cash(): number {
    return this.sim.state.money.dirty + this.sim.state.money.clean;
  }

  afford(n: number): boolean {
    return this.cash() >= n;
  }

  /** Big-ticket spending leaves the mission savings alone; small essentials do not wait. */
  private spare(n: number): boolean {
    return this.cash() - (n >= 1000 ? this.saveFor : 0) >= n;
  }

  unlocked(id: string): boolean {
    return !this.sim.query.isLocked(id).locked;
  }

  ownedProps(): PropertyId[] {
    return (Object.keys(this.sim.state.properties) as PropertyId[]).filter((p) => this.sim.state.properties[p].owned);
  }

  private units(prop: PropertyId): number {
    const stash = this.sim.state.properties[prop].stash;
    let n = 0;
    for (const k in stash) n += stash[k]!;
    return n;
  }

  private crew(role: CrewRole, prop?: PropertyId) {
    return Object.values(this.sim.state.crew).filter((c) => c.role === role && c.status !== 'quit' && (!prop || c.assignment.property === prop));
  }

  /** Units matching a request anywhere the player can reach (bag and every stash). */
  stock(wants: { effects: readonly string[]; tier: string }): number {
    const sim = this.sim;
    const count = (store: Record<StackId, number>) => {
      let n = 0;
      for (const k in store) {
        const st = sim.query.parseStack(k);
        const p = st ? sim.state.products[st.product] : null;
        if (!p || p.tier !== wants.tier) continue;
        if (wants.effects.length && !wants.effects.some((e) => p.effects.includes(e as never))) continue;
        n += store[k]!;
      }
      return n;
    };
    return count(sim.state.bag) + this.ownedProps().reduce((s, p) => s + count(sim.state.properties[p].stash), 0);
  }

  bagTier(tier: string): number {
    return this.stockIn(this.sim.state.bag, tier);
  }

  private stockIn(store: Record<StackId, number>, tier: string): number {
    let n = 0;
    for (const k in store) {
      const st = this.sim.query.parseStack(k);
      if (st && this.sim.state.products[st.product]?.tier === tier) n += store[k]!;
    }
    return n;
  }

  // ── time and place ──────────────────────────────────────────────────────

  private world(transit: boolean): SimWorldInput {
    const owned = this.sim.state.properties[this.place as PropertyId]?.owned ? (this.place as PropertyId) : null;
    return {
      day: this.clock.day, hours: hoursFromDayT(this.clock.t), weather: 'clear', district: districtOf(this.place),
      place: transit ? null : this.place, insideProperty: transit ? null : owned, streetHeat: 0, inVehicle: transit, busy: this.busy,
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
      if (this.t - this.lastSample >= 300) this.sample();
      if (this.t - this.lastPhone >= 12) this.phone();
    }
  }

  /** Texts get answered within seconds, whatever else is going on (even at a red light). */
  private phone(): void {
    const sim = this.sim;
    this.lastPhone = this.t;
    // Mid-mission, texts wait (and may lapse).
    if (sim.state.missions.active) return;
    let room = this.profile.juggle - sim.state.requests.filter((r) => r.status === 'accepted' && !r.story && !r.mission).length;
    for (const r of sim.state.requests) {
      if (r.status !== 'pending' || r.story || !r.message) continue;
      const any = this.stock({ effects: [], tier: r.wants.tier });
      const yes = room > 0 && (this.stock(r.wants) >= r.wants.qty || any >= r.wants.qty || (this.kind === 'casual' && any > 0));
      if (yes) room--;
      sim.cmd.replyChip(r.message, yes ? (this.kind === 'riskTaker' && this.rng.chance(0.4) ? 'counter' : 'accept') : 'decline');
    }
  }

  /** Menus, texts and tutorials take longer for some players than others. */
  ui(seconds: number): void {
    this.wait(seconds * this.profile.ui);
  }

  private sample(): void {
    const s = this.sim.state;
    this.lastSample = this.t;
    const minute = Math.round(this.t / 60);
    this.report.cash.push([minute, s.money.dirty + s.money.clean]);
    this.report.xpCurve.push([minute, s.progression.xp]);
    this.report.earnedPerMinute.push([minute, s.money.lifetimeEarned]);
    this.report.maxNotoriety = Math.max(this.report.maxNotoriety, s.heat.notoriety);
    if (this.report.finaleReady === null && s.missions.progress.hurricaneNight.status !== 'locked') this.report.finaleReady = Math.round(this.t);
    if (this.report.debtSettled === null && s.money.debt.settled) this.report.debtSettled = Math.round(this.t);
  }

  go(to: PlaceId): void {
    if (to === this.place) return;
    let secs = travelSeconds(this.place, to) * this.profile.drive;
    // Dex's cousin drives you to anything you own: a short cutscene instead of the drive.
    if (this.sim.state.properties[to as PropertyId]?.owned && this.unlocked('feature:chauffeur')) secs = Math.min(secs, 20);
    this.wait(Math.max(1, secs - 2), true);
    this.place = to;
    this.wait(2);
    this.syncClock();
  }

  /** Keep the bot's clock aligned with the sim (time skips move the sim clock). */
  syncClock(): void {
    const c = this.sim.state.clock;
    if (c.day > this.clock.day || (c.day === this.clock.day && c.hours > hoursFromDayT(this.clock.t) + 0.05)) {
      this.clock = createClock(c.hours, c.day);
    }
  }

  // ── selling ──────────────────────────────────────────────────────────────

  sell(dealId: string): boolean {
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
    this.ui(6);
    let res;
    const style = this.profile.haggle === 'auto' && this.rng.chance(0.25) ? 'read' : this.profile.haggle;
    if (style === 'auto') res = sim.cmd.autoPrice(dealId, stack, qty, extras);
    else {
      const price = style === 'push' ? h.bandHigh : h.bandLow + (h.bandHigh - h.bandLow) * 0.3;
      res = sim.cmd.offer(dealId, { stack, qty, unitPrice: price, ...extras });
      if (res.ok && res.value.kind === 'counter') res = sim.cmd.acceptCounter(dealId, extras);
    }
    if (!res.ok || res.value.kind !== 'sale') {
      if (sim.state.deals.some((d) => d.id === dealId && d.status === 'open')) sim.cmd.walkAway(dealId);
      return false;
    }
    this.report.deals++;
    if (res.value.streetHeat > 0) {
      // A chase: sometimes it ends in cuffs.
      this.wait(45, true);
      if (this.rng.chance(0.45)) sim.cmd.bust();
      else sim.cmd.escaped(1 + (this.rng.chance(0.3) ? 1 : 0));
    }
    return true;
  }

  private handleRequests(): void {
    const sim = this.sim;
    const delegated = new Set(Object.values(sim.state.crew).map((c) => c.delivery?.request).filter(Boolean));
    const accepted = sim.state.requests.filter((r) => r.status === 'accepted' && !r.story && !delegated.has(r.id));
    accepted.sort((a, b) => travelSeconds(this.place, a.place) - travelSeconds(this.place, b.place));
    // A free driver takes the farthest job.
    const driver = Object.values(sim.state.crew).find((c) => c.role === 'driver' && c.status !== 'quit' && !c.delivery);
    if (driver && accepted.length > 1) {
      const far = accepted.at(-1)!;
      this.ui(3);
      if (sim.cmd.delegateRequest(far.id, driver.id).ok) accepted.pop();
    }
    for (const r of accepted.slice(0, 3)) {
      if (this.bagTier(r.wants.tier) < r.wants.qty) this.packFromStash();
      if (this.bagTier(r.wants.tier) < 1) continue;
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
      if (deal.ok && this.sell(deal.value.id)) this.report.walkUps++;
    }
  }

  /** Hang around a busy spot for walk-ups when there is product and nothing pressing. */
  private hangOut(): void {
    const sim = this.sim;
    if (sim.query.bagUnits() < 6 || sim.state.requests.some((r) => r.status === 'accepted')) return;
    const hot = sim.content.customerList
      .filter((c) => sim.state.customers[c.id].unlocked && sim.state.customers[c.id].satiation < 0.5)
      .map((c) => activeHangout(c, sim.state.clock.hours)?.place)
      .filter((p): p is PlaceId => !!p);
    if (!hot.length) return;
    hot.sort((a, b) => travelSeconds(this.place, a) - travelSeconds(this.place, b));
    this.go(hot[0]!);
    for (let i = 0; i < 4; i++) {
      this.wait(10);
      this.handleWalkUps();
      if (sim.state.requests.some((r) => r.status === 'pending')) break;
    }
  }

  packFromStash(): void {
    const props = this.ownedProps().filter((p) => this.units(p) > 0);
    if (!props.length) return;
    props.sort((a, b) => travelSeconds(this.place, a) - travelSeconds(this.place, b));
    const prop = props[0]!;
    this.go(prop);
    this.ui(3);
    this.sim.cmd.packBag(prop, 'smart');
  }

  // ── supplies ─────────────────────────────────────────────────────────────

  private bestStrain(): StrainId {
    const sim = this.sim;
    let best: StrainId = 'abuelasBlush';
    let score = 0;
    for (const id of sim.content.strainIds) {
      const s = sim.content.strains[id];
      if (s.rank > sim.state.progression.rank || !this.supplyShop(`seed:${id}`)) continue;
      const v = (s.value * s.appeal * s.yield) / s.growTime / (1 + s.seedPrice / 200);
      if (v > score) {
        score = v;
        best = id;
      }
    }
    return best;
  }

  private seeds(): number {
    let n = 0;
    for (const k in this.sim.state.supplies) if (k.startsWith('seed:')) n += this.sim.state.supplies[k as SupplyId] ?? 0;
    return n;
  }

  private pots(): number {
    return this.ownedProps().reduce((s, p) => s + this.sim.query.propertyCaps(p).pots, 0);
  }

  /** Where this player buys an item: the phone (Gulf Direct) or the cheapest open counter. */
  private supplyShop(item: SupplyId): ShopId | null {
    const sim = this.sim;
    const stocks = (s: ShopId) => sim.content.shops[s].stock.some((i) => itemKey(i) === item);
    const inPerson = SHOPS_IN_PERSON.find((s) => stocks(s) && !sim.query.shop(s).find((l) => l.item === item)?.locked) ?? null;
    const phone = this.unlocked('app:market') && stocks('gulfDirect') ? 'gulfDirect' : null;
    if (this.profile.market && phone) return phone;
    return inPerson ?? phone;
  }

  purchase(item: SupplyId, qty: number): boolean {
    const sim = this.sim;
    if (sim.state.orders.some((o) => o.item === item)) return false;
    let shop = this.supplyShop(item);
    if (!shop) return false;
    const price = sim.query.shop(shop).find((l) => l.item === item)?.price ?? Infinity;
    if (!this.afford(price * qty + this.profile.buffer * 0.25)) return false;
    if (shop !== 'gulfDirect') {
      const place = sim.content.shops[shop].place!;
      const open = sim.content.places[place].open;
      const hours = sim.state.clock.hours;
      if (open && (hours < open[0] || hours >= open[1]) && this.unlocked('app:market')) shop = 'gulfDirect';
    }
    if (shop === 'gulfDirect') {
      this.ui(5);
      return sim.cmd.order('gulfDirect', item, qty).ok;
    }
    this.go(sim.content.shops[shop].place!);
    this.ui(6);
    return sim.cmd.buy(shop, item, qty).ok;
  }

  private restock(): void {
    const sim = this.sim;
    const pots = this.pots();
    const key: SupplyId = `seed:${this.bestStrain()}`;
    if (this.unlocked('feature:subscriptions') && !sim.state.subscriptions.some((s) => s.item === key)) {
      for (const s of sim.state.subscriptions.filter((x) => x.item.startsWith('seed:'))) sim.cmd.unsubscribe(s.item);
      this.ui(4);
      sim.cmd.subscribe(key, Math.min(99, pots * 3), 1);
    }
    if (this.seeds() < pots) this.purchase(key, Math.max(6, Math.ceil(pots * 1.5) - this.seeds()));
    for (const c of this.crew('cook')) {
      for (const a of c.assignment.recipe?.additives ?? []) if ((sim.state.supplies[`add:${a}`] ?? 0) < 10) this.purchase(`add:${a}`, 30);
    }
  }

  // ── growing, mixing, refining ───────────────────────────────────────────

  private homeRounds(): void {
    const sim = this.sim;
    const props = this.ownedProps().sort((a, b) => travelSeconds(this.place, a) - travelSeconds(this.place, b));
    for (const prop of props) {
      const plants = Object.values(sim.state.plants).filter((p) => p.property === prop);
      const caps = sim.query.propertyCaps(prop);
      const self = this.crew('grower', prop).length === 0;
      const garden = self && (plants.some((p) => p.growth >= 1 || p.water < 0.3 || p.food < 0.3 || (!p.pruned && p.growth < 1)) || (caps.pots > plants.length && this.seeds() > 0));
      const raw = this.rawUnits(prop);
      const mix = caps.stations.includes('workbench') && raw >= 5 && (this.crew('cook', prop).length === 0 || this.rng.chance(this.profile.explore));
      const bag = sim.query.bagUnits();
      const swap = bag > 30 || (bag < 6 && this.units(prop) >= 6);
      if (!(garden || mix || swap)) continue;
      this.go(prop);
      if (self) this.tendGarden(prop);
      if (caps.stations.includes('workbench')) this.mixAt(prop);
      this.refineAt(prop);
      this.ui(4);
      if (sim.query.bagUnits() > 0) sim.cmd.stow(prop);
      sim.cmd.packBag(prop, 'smart');
    }
  }

  private tendGarden(prop: PropertyId): void {
    const sim = this.sim;
    if (sim.state.properties[prop].lights !== this.profile.lights && sim.state.progression.rank >= 2) sim.cmd.setLights(prop, this.profile.lights);
    const grades = this.kind === 'optimizer' ? (['perfect', 'perfect', 'good'] as const) : (['good', 'good', 'ok'] as const);
    for (const p of Object.values(sim.state.plants).filter((x) => x.property === prop && x.growth >= 1)) {
      this.ui(3);
      sim.cmd.harvest(p.id, grades);
    }
    const plants = Object.values(sim.state.plants).filter((x) => x.property === prop);
    if (plants.some((p) => p.water < 0.3 || p.food < 0.3 || (!p.pruned && p.growth < 1))) {
      this.ui(8);
      sim.cmd.tendAll(prop);
    }
    if (sim.query.propertyCaps(prop).pots > plants.length) {
      const best = this.bestStrain();
      const owned = Object.keys(sim.state.supplies).filter((k) => k.startsWith('seed:') && (sim.state.supplies[k as SupplyId] ?? 0) > 0);
      const strain = owned.includes(`seed:${best}`) ? best : (owned[0]?.slice(5) as StrainId | undefined);
      if (!strain) return;
      this.ui(4);
      sim.cmd.plantAll(prop, strain, this.profile.feed);
      this.ui(4);
      sim.cmd.tendAll(prop);
    }
  }

  private rawUnits(prop: PropertyId): number {
    const sim = this.sim;
    let n = 0;
    for (const store of [sim.state.bag, sim.state.properties[prop].stash]) {
      for (const k in store) {
        const p = sim.state.products[sim.query.parseStack(k)?.product ?? ''];
        if (p && p.tier === 'bloom' && p.base === null) n += store[k]!;
      }
    }
    return n;
  }

  private additivePrice(a: AdditiveId): number {
    return this.sim.content.additives[a].price;
  }

  /**
   * One batch at the workbench: usually the most valuable known mix for what is on hand; sometimes
   * (by temperament) a pair of additives nobody has tried on this stack yet, to see what happens.
   */
  private mixAt(prop: PropertyId): void {
    const sim = this.sim;
    const cap = sim.query.mixCap(prop);
    const batch = sim.state.upgrades.includes('bigBowl') ? 12 : 5;
    const stash = sim.state.properties[prop].stash;
    const have = (k: StackId) => (sim.state.bag[k] ?? 0) + (stash[k] ?? 0);
    const stacks = [...new Set([...Object.keys(sim.state.bag), ...Object.keys(stash)])]
      .filter((k) => {
        const p = sim.state.products[sim.query.parseStack(k)?.product ?? ''];
        return p && p.tier === 'bloom' && p.effects.length < cap && have(k) >= 3;
      })
      .sort((a, b) => have(b) - have(a))
      .slice(0, 3);
    if (!stacks.length) return;
    const pool = sim.content.additiveIds.filter((a) => sim.content.additives[a].rank <= sim.state.progression.rank && this.supplyShop(`add:${a}`));
    const cost = (adds: AdditiveId[]) => adds.reduce((s, a) => s + this.additivePrice(a), 0);
    let pick: { stack: StackId; adds: AdditiveId[] } | null = null;
    let qty = batch;
    if (this.rng.chance(this.profile.explore)) {
      // A small test batch with additives already on the shelf; keep a few new ones coming.
      const stack = stacks[0]!;
      const shelf = pool.filter((a) => (sim.state.supplies[`add:${a}`] ?? 0) >= 3);
      const untried: AdditiveId[][] = [];
      for (const a of shelf) for (const b of shelf) if (a !== b && !sim.query.mixPreview(stack, [a, b], prop).exact) untried.push([a, b]);
      if (untried.length) {
        pick = { stack, adds: this.rng.pick(untried) };
        qty = 3;
      }
      const missing = pool.filter((a) => !shelf.includes(a));
      if (untried.length < 4 && missing.length) this.purchase(`add:${this.rng.pick(missing)}`, 10);
    }
    if (!pick) {
      let gain = 3;
      for (const stack of stacks) {
        const base = sim.query.unitValue(stack);
        const value = (adds: AdditiveId[]) => {
          const pv = sim.query.mixPreview(stack, adds, prop);
          return pv.exact ? pv.value - base - cost(adds) : -Infinity;
        };
        const singles = pool.map((a) => ({ a, g: value([a]) })).sort((x, y) => y.g - x.g);
        const top = singles.slice(0, 5).map((x) => x.a);
        const options: AdditiveId[][] = [...top.map((a) => [a])];
        for (const a of top) for (const b of pool) if (a !== b) options.push([a, b]);
        for (const adds of options) {
          const g = value(adds);
          if (g > gain) {
            gain = g;
            pick = { stack, adds };
          }
        }
      }
    }
    if (!pick) return;
    qty = Math.min(have(pick.stack), qty);
    for (const a of pick.adds) {
      const owned = sim.state.supplies[`add:${a}`] ?? 0;
      if (owned >= qty) continue;
      if (!this.purchase(`add:${a}`, Math.max(qty - owned, 20)) || (sim.state.supplies[`add:${a}`] ?? 0) < qty) return;
    }
    this.go(prop);
    this.ui(7);
    sim.cmd.mix(prop, pick.stack, pick.adds, qty);
  }


  private refineAt(prop: PropertyId): void {
    const sim = this.sim;
    const stations = sim.query.propertyCaps(prop).stations;
    const stash = sim.state.properties[prop].stash;
    const have = (k: StackId) => (sim.state.bag[k] ?? 0) + (stash[k] ?? 0);
    const best = (tier: string, min: number) =>
      [...new Set([...Object.keys(sim.state.bag), ...Object.keys(stash)])]
        .filter((k) => sim.state.products[sim.query.parseStack(k)?.product ?? '']?.tier === tier && have(k) >= min)
        .sort((a, b) => sim.query.unitValue(b) - sim.query.unitValue(a))[0];
    if (stations.includes('coldStill')) {
      const stack = best('bloom', 9);
      if (stack) {
        this.ui(6);
        sim.cmd.refine(prop, stack, Math.floor(have(stack) / 3 / 2));
      }
    }
    if (stations.includes('sunPress')) {
      const stack = best('dew', 2);
      if (stack) {
        this.ui(6);
        sim.cmd.refine(prop, stack, Math.ceil(have(stack) / 2));
      }
    }
  }

  // ── expansion ────────────────────────────────────────────────────────────

  private expand(): void {
    const sim = this.sim;
    const rank = sim.state.progression.rank;
    for (const id of UPGRADE_PLAN) {
      const u = sim.query.upgrades().find((x) => x.id === id)!;
      if (u.owned || u.locked) continue;
      if (this.spare(u.cost + this.profile.buffer)) {
        this.ui(5);
        sim.cmd.buyUpgrade(id);
      }
      break;
    }
    for (const [id, minRank] of PROPERTY_PLAN) {
      if (sim.state.properties[id].owned || rank < minRank) continue;
      const def = sim.content.properties[id];
      const pot = def.currency === 'clean' ? sim.state.money.clean : this.cash();
      if (pot - this.saveFor > def.price * 1.15 + this.profile.buffer) {
        this.ui(8);
        if (sim.cmd.buyProperty(id).ok) this.report.properties++;
      }
      break;
    }
    for (const id of FRONT_PLAN) {
      if (sim.state.fronts[id].owned) continue;
      if (id === 'sudsyFlamingo' && sim.state.missions.progress.cleanHands.status !== 'done') break;
      if (this.spare(sim.content.fronts[id].price * 1.2 + this.profile.buffer) && sim.cmd.buyFront(id).ok) {
        this.ui(8);
        sim.cmd.setLaunder(id, this.kind === 'riskTaker' ? 1.3 : 1);
      }
      break;
    }
    if (this.unlocked('feature:crew')) this.manageCrew(rank);
    if (sim.state.time - this.lastBuild > 300) this.build();
  }

  private manageCrew(rank: number): void {
    const sim = this.sim;
    const target = Math.round(Math.max(0, (rank - 2) * 2) * this.profile.crew);
    const want = CREW_PLAN.slice(0, target);
    const counts = new Map<CrewRole, number>();
    for (const c of Object.values(sim.state.crew)) if (c.status !== 'quit') counts.set(c.role, (counts.get(c.role) ?? 0) + 1);
    for (const role of new Set(want)) {
      if ((counts.get(role) ?? 0) >= want.filter((r) => r === role).length) continue;
      const cand = sim.state.candidates
        .filter((c) => sim.content.crew[c.def]?.role === role)
        .sort((a, b) => sim.content.crew[b.def]!.skill - sim.content.crew[a.def]!.skill)[0];
      if (!cand || !this.afford(cand.wage * 2 + this.profile.buffer)) continue;
      this.ui(10);
      if (sim.cmd.hire(cand.def).ok) break;
    }
    for (const c of Object.values(sim.state.crew)) {
      if (c.status === 'quit' && c.winBackUntil && c.winBackUntil > sim.state.time && this.afford(c.wage * 2)) sim.cmd.winBack(c.id);
      if (c.status === 'upset' && this.afford(c.wage + this.profile.buffer)) sim.cmd.bonus(c.id, c.wage);
    }
    sim.cmd.autoAssign();
    this.assignRecipes();
    this.report.crewSize = Object.values(sim.state.crew).filter((c) => c.status !== 'quit').length;
  }

  /** The additive chain from a raw harvest to a product, if it fits in one recipe. */
  private chain(id: ProductId): { base: ProductId; additives: AdditiveId[] } | null {
    const products = this.sim.state.products;
    const adds: AdditiveId[] = [];
    let p = products[id];
    for (let guard = 0; p && p.base && guard < 4; guard++) {
      adds.unshift(...p.additives);
      p = products[p.base];
    }
    if (!p || p.base !== null || p.tier !== 'bloom' || adds.length === 0 || adds.length > 3) return null;
    return { base: p.id, additives: adds };
  }

  /** Cooks run the production line: the best known mix, then the Cold Still and the Sun Press. */
  private assignRecipes(): void {
    const sim = this.sim;
    const products = Object.values(sim.state.products);
    const growing = new Set(Object.values(sim.state.plants).map((p) => p.strain));
    let best: { base: ProductId; additives: AdditiveId[]; value: number; id: ProductId } | null = null;
    for (const p of products) {
      if (p.tier !== 'bloom' || !growing.has(p.strain)) continue;
      const c = this.chain(p.id);
      if (!c) continue;
      const v = sim.query.unitValue(`${p.id}*3`) - c.additives.reduce((s, a) => s + this.additivePrice(a), 0);
      if (!best || v > best.value) best = { ...c, value: v, id: p.id };
    }
    if (!best) return;
    const dew = products.filter((p) => p.tier === 'dew').sort((a, b) => sim.query.unitValue(`${b.id}*3`) - sim.query.unitValue(`${a.id}*3`))[0];
    for (const [i, c] of this.crew('cook').entries()) {
      const prop = c.assignment.property;
      if (!prop) continue;
      const stations = sim.query.propertyCaps(prop).stations;
      let recipe: { base: ProductId; additives: AdditiveId[]; tierUp?: 'dew' | 'halos' } = { base: best.base, additives: best.additives };
      if (i % 2 === 1 && stations.includes('coldStill')) recipe = { base: best.id, additives: [], tierUp: 'dew' };
      if (i % 3 === 2 && dew && stations.includes('sunPress')) recipe = { base: dew.id, additives: [], tierUp: 'halos' };
      const cur = c.assignment.recipe;
      if (cur && cur.base === recipe.base && cur.tierUp === recipe.tierUp && cur.additives.join() === recipe.additives.join()) continue;
      sim.cmd.assign(c.id, { recipe });
    }
  }

  /** Add planters and stations where they fit. */
  private build(): void {
    const sim = this.sim;
    this.lastBuild = sim.state.time;
    for (const prop of this.ownedProps()) {
      for (const item of BUILD_PLAN) {
        const def = sim.content.placeables[item];
        if (def.rank > sim.state.progression.rank || !this.spare(def.cost + this.profile.buffer * 2)) continue;
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
        if (placed) {
          this.ui(20);
          return;
        }
      }
    }
  }

  // ── money and heat ───────────────────────────────────────────────────────

  private handleMoney(): void {
    const sim = this.sim;
    const d = sim.state.money.debt;
    if (!d.settled && d.nextCheckDay > 0) {
      // Pay what Vale expects as the check-in approaches; keep a working reserve until then.
      const owed = Math.max(0, d.expectedByCheck - d.paid);
      const days = d.nextCheckDay - sim.state.clock.day - sim.state.clock.hours / 24;
      const reserve = days > 1 ? this.profile.buffer * 3 + 500 : this.profile.buffer;
      const spare = sim.state.money.dirty - reserve;
      if (owed > 0 && spare > 0) sim.cmd.payDebt(Math.min(owed * (this.kind === 'optimizer' ? 1.1 : 1), spare), 'dirty');
      const left = d.principal - d.paid;
      if (this.kind !== 'riskTaker' && left > 0 && sim.state.money.dirty - this.saveFor > left * 1.3 + 5000) sim.cmd.payDebt(left, 'dirty');
    }
    const raid = sim.state.heat.raid;
    if (raid && (raid.status === 'warned' || raid.status === 'imminent')) {
      if (this.kind !== 'riskTaker' && this.afford(6000)) sim.cmd.raidPrepare('bribe');
      else sim.cmd.raidPrepare(this.kind === 'riskTaker' ? 'standGround' : 'moveStock');
    }
    if (raid && raid.status === 'active') {
      this.wait(this.profile.missionTime, true);
      const roll = this.rng.next();
      sim.cmd.raidResolve(roll < (this.kind === 'casual' ? 0.35 : 0.5) ? 'evaded' : roll < 0.75 ? 'repelled' : 'raided');
    }
    if (sim.state.heat.notoriety > 55 && this.kind !== 'riskTaker' && this.afford(3000)) sim.cmd.bribe(1500);
  }

  private handleSamples(): void {
    const sim = this.sim;
    if (!this.profile.samples || !this.unlocked('feature:samples') || sim.state.time - this.lastSampleGiven < 180) return;
    const cheapest = Object.keys(sim.state.bag).sort((a, b) => sim.query.unitValue(a) - sim.query.unitValue(b))[0];
    if (!cheapest) return;
    this.lastSampleGiven = sim.state.time;
    this.ui(4);
    sim.cmd.giveSample({ district: districtOf(this.place) }, cheapest);
  }

  private lastSampleGiven = 0;

  // ── main loop ────────────────────────────────────────────────────────────

  /** The HUD objective nags: a story mission gets picked up when it is ready (by most players). */
  private storyCheck(): void {
    if (this.sim.state.missions.active || this.rng.chance(this.profile.missionChance)) playMission(this);
  }

  private step(): void {
    this.wait(this.profile.think);
    this.handleMoney();
    this.handleRequests();
    this.handleWalkUps();
    this.restock();
    this.storyCheck();
    this.homeRounds();
    this.handleRequests();
    this.expand();
    this.handleSamples();
    this.storyCheck();
    this.hangOut();
    if (this.rng.chance(this.profile.idle)) this.wait(this.rng.range(20, 60), true);
  }

  /** Play until `seconds` of game time have passed (call again to keep going). */
  run(seconds: number): BotReport {
    if (this.t === 0) this.playPrologue();
    while (this.t < seconds) this.step();
    this.sample();
    this.report.crewDeals = this.sim.state.totals.crewDeals;
    this.report.products = Object.keys(this.sim.state.products).length;
    return this.report;
  }

  /**
   * The first ten minutes, at the pace of someone meeting the game for the first time (brief §3:
   * harvest by 0:45, Kiki on the boardwalk by 3:00, the garden store by 4:00, home by 6:00, the
   * brand by 7:00, dusk at 8:00, Marisol and Rank 2 at about 10:00).
   */
  private playPrologue(): void {
    const sim = this.sim;
    this.ui(38); // cold open, Sy's text, walking into the greenhouse
    const ripe = Object.values(sim.state.plants).find((p) => p.growth >= 1);
    if (ripe) {
      this.ui(6);
      sim.cmd.harvest(ripe.id, this.kind === 'optimizer' ? ['perfect', 'perfect', 'perfect'] : ['good', 'perfect', 'good']);
    }
    for (let i = 0; i < 30 && !sim.state.requests.some((r) => r.customer === 'kiki'); i++) this.wait(1);
    this.ui(20); // read Kiki's text, answer
    const kiki = sim.state.requests.find((r) => r.customer === 'kiki');
    if (kiki?.message) sim.cmd.replyChip(kiki.message, 'accept');
    this.ui(8); // out to the Gator; the drive itself is the first sunset drive
    this.go('boardwalk');
    this.ui(10); // find Kiki among the skaters
    if (kiki) {
      const deal = sim.cmd.openDeal({ request: kiki.id });
      if (deal.ok) this.sell(deal.value.id);
    }
    this.ui(8); // the first-haggle explainer
    this.go('sodAlmighty');
    this.ui(8);
    sim.cmd.buy('sodAlmighty', 'seed:abuelasBlush', 3);
    sim.cmd.buy('sodAlmighty', 'add:honey', 4);
    this.ui(25); // Wade's sales pitch, a look around the shelves
    this.go('ofelias');
    this.ui(30); // the shop, the back room, Gerald the monstera
    this.tendGarden('ofelias');
    this.ui(15);
    const raw = Object.keys(sim.state.bag).find((k) => k.startsWith('b.abuelasBlush.sunkissed*'));
    if (raw) {
      this.ui(45); // Ofelia's Notebook, the mixing tutorial
      sim.cmd.mix('ofelias', raw, ['honey'], Math.min(3, sim.state.bag[raw] ?? 0));
    }
    this.ui(60); // the brand creator
    sim.cmd.createBrand('Bot Botanicals', { shape: 1, icon: 2, palette: 3, type: 1 }, 1);
    this.ui(35); // dusk falls: the city lights come on, a look around
    for (let i = 0; i < 30 && !sim.state.requests.some((r) => r.customer === 'marisol'); i++) this.wait(1);
    this.ui(15);
    const marisol = sim.state.requests.find((r) => r.customer === 'marisol');
    if (marisol?.message) sim.cmd.replyChip(marisol.message, 'accept');
    this.go('palmettoPlaza');
    this.ui(20); // find her car in the lot
    if (marisol) {
      const deal = sim.cmd.openDeal({ request: marisol.id });
      if (deal.ok) this.sell(deal.value.id);
    }
    this.ui(20); // Empire → Upgrades
    sim.cmd.buyUpgrade('dripIrrigation');
    this.ui(15);
  }
}
