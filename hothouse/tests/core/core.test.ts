import { describe, expect, it, vi } from 'vitest';
import {
  advanceClock, createClock, DAY_REAL_SECONDS, DAY_WINDOWS, dayTFromHours, hoursFromDayT, nightFactor, secondsUntil, windowAt,
} from '@/core/clock';
import { EventBus } from '@/core/events';
import { defineStrings, fmt } from '@/core/i18n';
import { angleDelta, curve, damp, springTo, wrapAngle } from '@/core/math';
import { Pool, Ring } from '@/core/pool';
import { hash2, hashString, Rng } from '@/core/rng';
import { tunables } from '@/core/tunables';

describe('Rng', () => {
  it('is deterministic for a seed and differs across seeds', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const c = new Rng(43);
    const sa = Array.from({ length: 20 }, () => a.nextU32());
    const sb = Array.from({ length: 20 }, () => b.nextU32());
    const sc = Array.from({ length: 20 }, () => c.nextU32());
    expect(sa).toEqual(sb);
    expect(sa).not.toEqual(sc);
  });

  it('round-trips its state', () => {
    const r = new Rng('halcyon');
    r.next();
    const state = r.getState();
    const x = [r.next(), r.next(), r.next()];
    const r2 = new Rng(state);
    expect([r2.next(), r2.next(), r2.next()]).toEqual(x);
  });

  it('stays inside its ranges and is roughly uniform', () => {
    const r = new Rng(7);
    const buckets = new Array(10).fill(0);
    for (let i = 0; i < 20000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      buckets[Math.floor(v * 10)]++;
      const n = r.int(3, 9);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(9);
    }
    for (const b of buckets) expect(Math.abs(b - 2000)).toBeLessThan(250);
  });

  it('forks without advancing the parent', () => {
    const r = new Rng(9);
    const before = r.getState();
    const child = r.fork('npc');
    expect(r.getState()).toEqual(before);
    expect(child.next()).not.toEqual(new Rng(9).next());
  });

  it('weighted picks respect zero weights', () => {
    const r = new Rng(1);
    for (let i = 0; i < 500; i++) expect(r.weightedIndex([0, 1, 0, 3])).not.toBe(0);
    expect(r.weightedIndex([0, 0])).toBe(-1);
  });

  it('hashes are stable', () => {
    expect(hashString('Halcyon Bay')).toBe(hashString('Halcyon Bay'));
    expect(hash2(10, -4, 3)).toBe(hash2(10, -4, 3));
    expect(hash2(10, -4, 3)).not.toBe(hash2(-4, 10, 3));
  });
});

describe('Clock', () => {
  it('windows cover the day and sum to the real day length', () => {
    let total = 0;
    let hour = 0;
    for (const w of DAY_WINDOWS) {
      expect(w.start).toBeCloseTo(hour, 6);
      hour = w.end;
      total += w.real;
    }
    expect(hour).toBe(24);
    expect(total).toBeCloseTo(DAY_REAL_SECONDS, 6);
  });

  it('hours and day-seconds are inverse', () => {
    for (let h = 0; h < 24; h += 0.37) {
      expect(hoursFromDayT(dayTFromHours(h))).toBeCloseTo(h, 5);
    }
  });

  it('golden hour is the longest daylight window', () => {
    const golden = DAY_WINDOWS.find((w) => w.id === 'golden')!;
    const midday = DAY_WINDOWS.find((w) => w.id === 'midday')!;
    expect(golden.real).toBeGreaterThan(midday.real * 2);
    expect(windowAt(18.67)).toBe('golden');
    expect(windowAt(23)).toBe('night');
  });

  it('advances and rolls over midnight', () => {
    const c = createClock(23.9);
    const rolled = advanceClock(c, 30);
    expect(rolled).toBe(1);
    expect(c.day).toBe(2);
    const s = secondsUntil(c, 9);
    expect(s).toBeGreaterThan(0);
    advanceClock(c, s);
    expect(hoursFromDayT(c.t)).toBeCloseTo(9, 4);
  });

  it('night factor is 1 at night, 0 by day, monotonic through dusk', () => {
    expect(nightFactor(23)).toBe(1);
    expect(nightFactor(13)).toBe(0);
    let prev = -1;
    for (let h = 18.5; h <= 20.6; h += 0.1) {
      const n = nightFactor(h);
      expect(n).toBeGreaterThanOrEqual(prev);
      prev = n;
    }
  });
});

declare module '@/core/events' {
  interface GameEvents {
    'test:ping': { n: number };
    'test:void': void;
  }
}

describe('EventBus', () => {
  it('delivers, unsubscribes and supports once', () => {
    const bus = new EventBus();
    const seen: number[] = [];
    const off = bus.on('test:ping', (p) => seen.push(p.n));
    bus.once('test:ping', (p) => seen.push(p.n * 10));
    bus.emit('test:ping', { n: 1 });
    bus.emit('test:ping', { n: 2 });
    off();
    bus.emit('test:ping', { n: 3 });
    expect(seen).toEqual([1, 10, 2]);
  });

  it('tolerates unsubscribe during emit and isolates throwing handlers', () => {
    const bus = new EventBus();
    const calls: string[] = [];
    const offA = bus.on('test:void', () => {
      calls.push('a');
      offA();
    });
    bus.on('test:void', () => {
      throw new Error('boom');
    });
    bus.on('test:void', () => calls.push('c'));
    bus.emit('test:void');
    bus.emit('test:void');
    expect(calls).toEqual(['a', 'c', 'c']);
  });
});

describe('math', () => {
  it('wraps angles into (−π, π]', () => {
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI, 9);
    expect(wrapAngle(-Math.PI)).toBeCloseTo(Math.PI, 9);
    expect(angleDelta(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(0.2, 9);
  });

  it('curves clamp and interpolate', () => {
    const k = [[0, 0], [10, 100], [20, 50]] as const;
    expect(curve(k, -5)).toBe(0);
    expect(curve(k, 5)).toBe(50);
    expect(curve(k, 15)).toBe(75);
    expect(curve(k, 99)).toBe(50);
  });

  it('damp is frame-rate independent', () => {
    let a = 0;
    for (let i = 0; i < 60; i++) a = damp(a, 1, 4, 1 / 60);
    let b = 0;
    for (let i = 0; i < 30; i++) b = damp(b, 1, 4, 1 / 30);
    expect(a).toBeCloseTo(b, 9);
  });

  it('springs settle on target', () => {
    const s = { x: 0, v: 0 };
    for (let i = 0; i < 600; i++) springTo(s, 5, 0.15, 1 / 60);
    expect(s.x).toBeCloseTo(5, 4);
  });
});

describe('i18n', () => {
  it('interpolates and pluralizes', () => {
    const t = defineStrings('test', { hello: 'Hi {name}', bag_one: '{n} bag', bag_other: '{n} bags' });
    expect(t('hello', { name: 'Kiki' })).toBe('Hi Kiki');
    expect(t.n('bag', 1)).toBe('1 bag');
    expect(t.n('bag', 4)).toBe('4 bags');
  });

  it('formats money, clock and speed', () => {
    expect(fmt.money(1240.4)).toBe('$1,240');
    expect(fmt.moneyDelta(-80)).toBe('−$80');
    expect(fmt.clock(18 + 40 / 60)).toBe('6:40 PM');
    expect(fmt.clock(0)).toBe('12:00 AM');
    expect(fmt.clock(18 + 40 / 60, true)).toBe('18:40');
    expect(fmt.speed(26.8224)).toBe(60);
  });
});

describe('pools and tunables', () => {
  it('pool reuses objects and honours its limit', () => {
    let made = 0;
    const p = new Pool(() => ({ id: made++ }), undefined, 2, 3);
    const a = p.acquire()!;
    const b = p.acquire()!;
    const c = p.acquire()!;
    expect(p.acquire()).toBeNull();
    p.release(b);
    expect(p.acquire()).toBe(b);
    expect(made).toBe(3);
    void a;
    void c;
  });

  it('ring keeps the newest entries', () => {
    const r = new Ring<number>(3);
    for (let i = 0; i < 5; i++) r.push(i);
    expect(r.toArray()).toEqual([2, 3, 4]);
  });

  it('tunables expose live values and report changes', () => {
    const g = tunables.group('test.group', { a: 1.5, b: { value: 3, min: 0, max: 10 }, on: true });
    const spy = vi.fn();
    const off = tunables.onChange(spy);
    tunables.set('test.group', 'a', 2);
    expect(g.a).toBe(2);
    expect(spy).toHaveBeenCalledWith('test.group', 'a', 2);
    expect(tunables.exportChanged()['test.group']).toEqual({ a: 2 });
    tunables.reset('test.group');
    expect(g.a).toBe(1.5);
    off();
  });
});
