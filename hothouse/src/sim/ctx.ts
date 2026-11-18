import { signal, type Signal } from '@preact/signals-core';
import { advanceClock, dayTFromHours, hoursFromDayT } from '@/core/clock';
import type { EventBus, GameEvents } from '@/core/events';
import { fmt } from '@/core/i18n';
import { Rng } from '@/core/rng';
import { done, fail, ok } from '@/core/types';
import type { AdditiveId, Flavor } from '@/content/additives';
import type { Vibe } from '@/content/effects';
import type { ContactId, PropertyId, UpgradeId } from '@/content/ids';
import type { DistrictId } from '@/content/places';
import { CONTENT, type Content } from '@/content/registry';
import type { StrainDef, StrainId } from '@/content/strains';
import type { UpgradeEffects } from '@/content/upgrades';
import {
  REV_CHANNELS, type CashReason, type Chip, type DayLedger, type Message, type MessageKind, type RequestId, type RevChannel, type SimResult,
  type SimState, type SimWorldInput, type StackId, type StoryBeat, type SupplyId,
} from './api';
import { DIFFICULTY } from './balance';
import { t } from './strings';

/** Temporary multipliers set by living events and weather (reset every tick by the events system). */
export interface Mods {
  /** Water drain speed. */
  thirst: number;
  growth: number;
  /** Customer demand per district (missing = 1). */
  demand: Partial<Record<DistrictId, number>>;
  /** Demand for vibes (missing = 1). */
  vibe: Partial<Record<Vibe, number>>;
  /** Price multiplier on every sale. */
  prices: number;
  /** Police presence per district, for the world (missing = 1). */
  police: Partial<Record<DistrictId, number>>;
  notoriety: number;
  /** Shop price multiplier per additive flavor. */
  supply: Partial<Record<Flavor, number>>;
  seeds: number;
  audit: number;
  requestRate: number;
  tips: number;
}

export function defaultMods(): Mods {
  return { thirst: 1, growth: 1, demand: {}, vibe: {}, prices: 1, police: {}, notoriety: 1, supply: {}, seeds: 1, audit: 1, requestRate: 1, tips: 1 };
}

export const DEFAULT_WORLD: Readonly<SimWorldInput> = {
  day: 1, hours: 18 + 40 / 60, weather: 'clear', district: 'flats', place: 'ofelias', insideProperty: 'ofelias',
  streetHeat: 0, inVehicle: false, busy: false,
};

/**
 * Everything a system needs: state, content, randomness, events, revision signals, and the small
 * shared helpers for money, inventory, messages and unlocks. Systems are plain functions that take
 * a `SimCtx`; the `Sim` object wires them to commands.
 */
export class SimCtx {
  readonly content: Content = CONTENT;
  readonly rng: Rng;
  readonly rev: Record<RevChannel, Signal<number>>;
  world: SimWorldInput = { ...DEFAULT_WORLD };
  mods: Mods = defaultMods();
  /** Installed by the story system: reacts to beats (prologue, missions). */
  onBeat: (beat: StoryBeat) => void = () => undefined;
  /** Installed by the Sim: reacts to rank-ups (customers, missions, story). */
  onRank: (rank: number) => void = () => undefined;
  /** Installed by the Sim: lets deals, harvests and purchases nudge story and missions. */
  onAction: (action: string, data?: unknown) => void = () => undefined;

  constructor(
    public state: SimState,
    public bus: EventBus | null,
  ) {
    this.rng = new Rng(state.rng);
    this.rev = Object.fromEntries(REV_CHANNELS.map((c) => [c, signal(0)])) as unknown as Record<RevChannel, Signal<number>>;
  }

  get now(): number {
    return this.state.time;
  }

  get rank(): number {
    return this.state.progression.rank;
  }

  get diff(): (typeof DIFFICULTY)[keyof typeof DIFFICULTY] {
    return DIFFICULTY[this.state.difficulty];
  }

  // ── plumbing ─────────────────────────────────────────────────────────────

  bump(...channels: RevChannel[]): void {
    for (const c of channels) this.rev[c].value++;
  }

  emit<K extends keyof GameEvents>(type: K, payload: GameEvents[K]): void {
    // Every sim:* event carries a payload; the bus's void-aware signature cannot see that generically.
    (this.bus as unknown as { emit(type: K, payload: GameEvents[K]): void } | null)?.emit(type, payload);
  }

  toast(text: string, tone: 'good' | 'info' | 'warn' | 'bad' = 'info', icon = 'info'): void {
    this.emit('sim:toast', { text, tone, icon });
  }

  id(prefix: string): string {
    this.state.seq += 1;
    return `${prefix}${this.state.seq}`;
  }

  /** Add to today's ledger and the running totals (Shift Reports diff the totals). */
  ledger(key: Exclude<keyof DayLedger, 'day'>, n: number): void {
    this.state.today[key] += n;
    this.state.totals[key] += n;
  }

  beat(beat: StoryBeat): void {
    const beats = this.state.story.beats;
    if (beats[beat] !== undefined) return;
    beats[beat] = this.now;
    this.emit('sim:beat', { beat });
    this.bump('story');
    this.onBeat(beat);
  }

  // ── money ────────────────────────────────────────────────────────────────

  earn(amount: number, kind: 'dirty' | 'clean', reason: CashReason): void {
    const n = Math.round(amount);
    if (n <= 0) return;
    const m = this.state.money;
    m[kind] += n;
    // Laundering converts money and refunds return it; neither is income.
    if (reason !== 'launder' && reason !== 'refund') {
      m.lifetimeEarned += n;
      this.ledger(kind === 'dirty' ? 'earnedDirty' : 'earnedClean', n);
      this.state.progression.stats.earned += n;
    }
    this.emit('sim:cash', { dirty: m.dirty, clean: m.clean, delta: n, kind, reason });
    this.bump('cash');
  }

  canPay(amount: number, currency: 'any' | 'dirty' | 'clean'): boolean {
    const m = this.state.money;
    const n = Math.round(amount);
    if (currency === 'clean') return m.clean >= n;
    if (currency === 'dirty') return m.dirty >= n;
    return m.dirty + m.clean >= n;
  }

  /** Spend money. `any` uses dirty cash first. */
  pay(amount: number, currency: 'any' | 'dirty' | 'clean', reason: CashReason): SimResult<'dirty' | 'clean' | 'mixed'> {
    const n = Math.max(0, Math.round(amount));
    if (!this.canPay(n, currency)) {
      return fail('cash', currency === 'clean' ? t('cashClean', { amount: fmt.money(n) }) : t('cash', { amount: fmt.money(n) }));
    }
    if (n === 0) return ok(currency === 'clean' ? 'clean' : 'dirty');
    const m = this.state.money;
    let paidWith: 'dirty' | 'clean' | 'mixed';
    if (currency === 'clean') {
      m.clean -= n;
      paidWith = 'clean';
    } else if (currency === 'dirty') {
      m.dirty -= n;
      paidWith = 'dirty';
    } else {
      const fromDirty = Math.min(m.dirty, n);
      m.dirty -= fromDirty;
      m.clean -= n - fromDirty;
      paidWith = fromDirty === n ? 'dirty' : fromDirty === 0 ? 'clean' : 'mixed';
    }
    m.lifetimeSpent += n;
    this.ledger('spent', n);
    this.state.progression.stats.spent += n;
    this.emit('sim:cash', { dirty: m.dirty, clean: m.clean, delta: -n, kind: paidWith === 'clean' ? 'clean' : 'dirty', reason });
    this.bump('cash');
    return ok(paidWith);
  }

  /** Remove money without a purchase (busts, raids, audits). Never goes below zero. */
  lose(amount: number, prefer: 'dirty' | 'clean', reason: CashReason): number {
    const m = this.state.money;
    let left = Math.max(0, Math.round(amount));
    const first = prefer;
    const second = prefer === 'dirty' ? 'clean' : 'dirty';
    const a = Math.min(m[first], left);
    m[first] -= a;
    left -= a;
    const b = Math.min(m[second], left);
    m[second] -= b;
    const total = a + b;
    if (total > 0) {
      this.emit('sim:cash', { dirty: m.dirty, clean: m.clean, delta: -total, kind: first, reason });
      this.bump('cash');
    }
    return total;
  }

  // ── inventory ────────────────────────────────────────────────────────────

  units(where: 'bag' | PropertyId, stack: StackId): number {
    const store = where === 'bag' ? this.state.bag : this.state.properties[where].stash;
    return store[stack] ?? 0;
  }

  add(where: 'bag' | PropertyId, stack: StackId, n: number): void {
    if (n <= 0) return;
    const store = where === 'bag' ? this.state.bag : this.state.properties[where].stash;
    store[stack] = (store[stack] ?? 0) + n;
    this.bump('inventory');
  }

  /** Take units; returns false (and changes nothing) if there are not enough. */
  take(where: 'bag' | PropertyId, stack: StackId, n: number): boolean {
    if (n <= 0) return true;
    const store = where === 'bag' ? this.state.bag : this.state.properties[where].stash;
    const have = store[stack] ?? 0;
    if (have < n) return false;
    if (have === n) delete store[stack];
    else store[stack] = have - n;
    this.bump('inventory');
    return true;
  }

  totalUnits(where: 'bag' | PropertyId): number {
    const store = where === 'bag' ? this.state.bag : this.state.properties[where].stash;
    let n = 0;
    for (const k in store) n += store[k]!;
    return n;
  }

  supply(id: SupplyId): number {
    return this.state.supplies[id] ?? 0;
  }

  addSupply(id: SupplyId, n: number): void {
    if (n <= 0) return;
    this.state.supplies[id] = (this.state.supplies[id] ?? 0) + n;
    this.bump('supplies');
  }

  takeSupply(id: SupplyId, n: number): boolean {
    const have = this.state.supplies[id] ?? 0;
    if (have < n) return false;
    if (have === n) delete this.state.supplies[id];
    else this.state.supplies[id] = have - n;
    this.bump('supplies');
    return true;
  }

  // ── messages ─────────────────────────────────────────────────────────────

  text(
    thread: ContactId,
    from: ContactId | 'player',
    text: string,
    opts: { kind?: MessageKind; chips?: Chip[] | null; request?: RequestId | null } = {},
  ): Message {
    let th = this.state.threads[thread];
    if (!th) {
      th = { id: thread, messages: [], unread: 0, lastAt: this.now, muted: false };
      this.state.threads[thread] = th;
    }
    const msg: Message = {
      id: this.id('m'),
      from,
      text,
      kind: opts.kind ?? 'text',
      at: this.now,
      day: this.world.day,
      hours: this.world.hours,
      chips: opts.chips ?? null,
      chosen: null,
      request: opts.request ?? null,
    };
    th.messages.push(msg);
    if (th.messages.length > 80) th.messages.splice(0, th.messages.length - 80);
    if (from !== 'player') th.unread += 1;
    th.lastAt = this.now;
    this.emit('sim:message', { thread, message: msg.id, from, text, kind: msg.kind });
    this.bump('messages');
    return msg;
  }

  findMessage(id: string): { thread: ContactId; message: Message } | null {
    for (const key in this.state.threads) {
      const th = this.state.threads[key]!;
      const m = th.messages.find((x) => x.id === id);
      if (m) return { thread: th.id, message: m };
    }
    return null;
  }

  // ── lookups ──────────────────────────────────────────────────────────────

  strain(id: StrainId): StrainDef | null {
    return (this.content.strains as Record<string, StrainDef>)[id] ?? this.state.strains.custom[id] ?? null;
  }

  hasUpgrade(id: UpgradeId): boolean {
    return this.state.upgrades.includes(id);
  }

  /** Combined effects of every owned upgrade. */
  upgradeMods(): Required<Pick<UpgradeEffects, 'growTime' | 'yield' | 'quality' | 'batch' | 'mixTime' | 'cap' | 'requestSlots' | 'requestRate' | 'visibility'>> & {
    noWater: boolean;
    noFood: boolean;
    heatProof: boolean;
  } {
    const out = { growTime: 1, yield: 0, quality: 0, batch: 0, mixTime: 1, cap: 0, requestSlots: 0, requestRate: 1, visibility: 1, noWater: false, noFood: false, heatProof: false };
    for (const id of this.state.upgrades) {
      const e = this.content.upgrades[id].effects;
      if (e.growTime) out.growTime *= e.growTime;
      if (e.yield) out.yield += e.yield;
      if (e.quality) out.quality += e.quality;
      if (e.batch) out.batch = Math.max(out.batch, e.batch);
      if (e.mixTime) out.mixTime *= e.mixTime;
      if (e.cap) out.cap = Math.max(out.cap, e.cap);
      if (e.requestSlots) out.requestSlots += e.requestSlots;
      if (e.requestRate) out.requestRate *= e.requestRate;
      if (e.visibility) out.visibility *= e.visibility;
      if (e.noWater) out.noWater = true;
      if (e.noFood) out.noFood = true;
      if (e.heatProof) out.heatProof = true;
    }
    return out;
  }

  isUnlocked(id: string): boolean {
    if (this.state.progression.unlocks.includes(id)) return true;
    for (const up of this.state.upgrades) if (this.content.upgrades[up].effects.unlocks === id) return true;
    return false;
  }

  additiveName(id: AdditiveId): string {
    return this.content.additives[id].name;
  }

  // ── clock ────────────────────────────────────────────────────────────────

  /** Clock after `seconds` at normal rate from the last known clock. */
  clockIn(seconds: number): { day: number; hours: number } {
    const c = { day: this.state.clock.day, t: dayTFromHours(this.state.clock.hours), rate: 1 };
    advanceClock(c, Math.max(0, seconds));
    return { day: c.day, hours: hoursFromDayT(c.t) };
  }

  /** "by 8:15 PM" text for a sim-time deadline. */
  byText(deadline: number): string {
    const c = this.clockIn(deadline - this.now);
    return t('byTime', { time: fmt.clock(c.hours) });
  }
}

export function result<T>(value: T): SimResult<T> {
  return ok(value);
}

export const okVoid: SimResult = done;
