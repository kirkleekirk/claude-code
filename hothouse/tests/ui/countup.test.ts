import { describe, expect, it } from 'vitest';
import { CountUp, countDuration, easeOutQuart, formatDelta } from '@/ui/core/countup';

/** Step a counter at 60 fps until it settles; returns the frames taken and every value shown. */
function run(c: CountUp, maxFrames = 600): { frames: number; shown: number[] } {
  const shown: number[] = [];
  let frames = 0;
  while (c.animating && frames < maxFrames) {
    c.step(1 / 60);
    shown.push(c.display);
    frames++;
  }
  return { frames, shown };
}

describe('countDuration', () => {
  it('is zero for no change and symmetric for gains and losses', () => {
    expect(countDuration(0)).toBe(0);
    expect(countDuration(-500)).toBe(countDuration(500));
  });

  it('grows with the size of the change and is capped', () => {
    expect(countDuration(10)).toBeLessThan(countDuration(1000));
    expect(countDuration(1000)).toBeLessThan(countDuration(100000));
    expect(countDuration(1e12)).toBe(0.9);
    expect(countDuration(1)).toBeGreaterThan(0.2);
  });
});

describe('easeOutQuart', () => {
  it('runs from 0 to 1, clamps outside, and only rises', () => {
    expect(easeOutQuart(0)).toBe(0);
    expect(easeOutQuart(1)).toBe(1);
    expect(easeOutQuart(-1)).toBe(0);
    expect(easeOutQuart(2)).toBe(1);
    let prev = 0;
    for (let t = 0.05; t <= 1; t += 0.05) {
      const v = easeOutQuart(t);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
    expect(easeOutQuart(0.5)).toBeGreaterThan(0.9);
  });
});

describe('CountUp', () => {
  it('starts settled on the rounded initial value', () => {
    const c = new CountUp(12.6);
    expect(c.display).toBe(13);
    expect(c.animating).toBe(false);
    expect(c.step(1)).toBe(false);
  });

  it('counts up to exactly the target, never overshooting or going backwards', () => {
    const c = new CountUp(100);
    c.set(1340);
    expect(c.animating).toBe(true);
    expect(c.value).toBe(1340);
    const { frames, shown } = run(c);
    expect(c.display).toBe(1340);
    expect(frames).toBeLessThanOrEqual(Math.ceil(countDuration(1240) * 60) + 1);
    for (let i = 1; i < shown.length; i++) expect(shown[i]!).toBeGreaterThanOrEqual(shown[i - 1]!);
    expect(Math.max(...shown)).toBe(1340);
  });

  it('counts down for losses', () => {
    const c = new CountUp(500);
    c.set(80);
    const { shown } = run(c);
    expect(c.display).toBe(80);
    for (let i = 1; i < shown.length; i++) expect(shown[i]!).toBeLessThanOrEqual(shown[i - 1]!);
  });

  it('retargets from what is on screen so a change mid-count stays smooth', () => {
    const c = new CountUp(0);
    c.set(1000);
    for (let i = 0; i < 5; i++) c.step(1 / 60);
    const mid = c.display;
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1000);
    c.set(2000);
    c.step(1 / 60);
    expect(c.display).toBeGreaterThanOrEqual(mid);
    run(c);
    expect(c.display).toBe(2000);
  });

  it('jumps straight to the value when instant', () => {
    const c = new CountUp(0, true);
    c.set(999);
    expect(c.display).toBe(999);
    expect(c.animating).toBe(false);
    const d = new CountUp(0);
    d.set(50, true);
    expect(d.display).toBe(50);
  });

  it('ignores setting the value it already shows', () => {
    const c = new CountUp(42);
    c.set(42);
    expect(c.animating).toBe(false);
  });
});

describe('formatDelta', () => {
  const money = (n: number) => `$${n.toLocaleString('en-US')}`;

  it('signs gains with a plus and losses with a true minus sign', () => {
    expect(formatDelta(420, money)).toBe('+$420');
    expect(formatDelta(-80, money)).toBe('−$80');
    expect(formatDelta(12, String)).toBe('+12');
  });

  it('shows zero without a sign', () => {
    expect(formatDelta(0, money)).toBe('$0');
  });
});
