import { describe, expect, it } from 'vitest';
import { HINT_COOLDOWN, HintBook, type HintRequest } from '@/ui/core/hints';

const hint = (id: string, priority = 0, duration = 10): HintRequest => ({ id, text: `Hint ${id}`, priority, duration });

describe('HintBook', () => {
  it('shows one hint at a time, highest priority first, then arrival order', () => {
    const b = new HintBook();
    expect(b.request(hint('low', 0))).toBe(true);
    expect(b.request(hint('high', 5))).toBe(true);
    expect(b.request(hint('low2', 0))).toBe(true);
    expect(b.tick(0.1, true)).toBe(true);
    expect(b.current?.id).toBe('high');
    b.learn('high');
    b.tick(0.1, true);
    expect(b.current?.id).toBe('low');
    b.learn('low');
    b.tick(0.1, true);
    expect(b.current?.id).toBe('low2');
  });

  it('refuses duplicates of a queued or showing hint', () => {
    const b = new HintBook();
    expect(b.request(hint('a'))).toBe(true);
    expect(b.request(hint('a'))).toBe(false);
    b.tick(0.1, true);
    expect(b.request(hint('a'))).toBe(false);
  });

  it('never repeats a learned hint, and learning hides it at once', () => {
    const b = new HintBook();
    b.request(hint('jump'));
    b.tick(0.1, true);
    expect(b.learn('jump')).toBe(true);
    expect(b.current).toBeNull();
    expect(b.learn('jump')).toBe(false);
    expect(b.request(hint('jump'))).toBe(false);
    expect(b.isLearned('jump')).toBe(true);
  });

  it('learning a queued hint removes it from the queue', () => {
    const b = new HintBook();
    b.request(hint('a', 1));
    b.request(hint('b', 0));
    b.learn('b');
    b.tick(0.1, true);
    b.learn('a');
    expect(b.tick(0.1, true)).toBe(false);
    expect(b.current).toBeNull();
  });

  it('treats dismissing as learning', () => {
    const b = new HintBook();
    expect(b.dismiss()).toBeNull();
    b.request(hint('map'));
    b.tick(0.1, true);
    expect(b.dismiss()).toBe('map');
    expect(b.isLearned('map')).toBe(true);
    expect(b.current).toBeNull();
  });

  it('rests a hint that timed out, then lets it return after the cool-down', () => {
    const b = new HintBook();
    b.request(hint('sprint', 0, 8));
    b.tick(0.1, true);
    b.tick(8, true);
    expect(b.current).toBeNull();
    expect(b.request(hint('sprint'))).toBe(false);
    b.tick(HINT_COOLDOWN - 1, true);
    expect(b.request(hint('sprint'))).toBe(false);
    b.tick(2, true);
    expect(b.request(hint('sprint'))).toBe(true);
  });

  it('waits while disabled and never promotes a hint into a menu', () => {
    const b = new HintBook();
    b.request(hint('a'));
    expect(b.tick(5, false)).toBe(false);
    expect(b.current).toBeNull();
    expect(b.tick(0.1, true)).toBe(true);
    expect(b.current?.id).toBe('a');
  });

  it('puts a hint cut short by a menu back at the front of the queue', () => {
    const b = new HintBook();
    b.request(hint('early', 1, 10));
    b.tick(0.1, true);
    b.request(hint('other', 0, 10));
    b.tick(2, true);
    expect(b.tick(0.1, false)).toBe(true);
    expect(b.current).toBeNull();
    b.tick(0.1, true);
    expect(b.current?.id).toBe('early');
    expect(b.shownFor).toBe(0);
  });

  it('does not count time while disabled toward the shown duration', () => {
    const b = new HintBook();
    b.request(hint('a', 0, 10));
    b.tick(0.1, true);
    b.tick(3, true);
    b.tick(30, false);
    b.tick(0.1, true);
    expect(b.current?.id).toBe('a');
    expect(b.shownFor).toBeLessThan(1);
  });

  it('rests a hint that was mostly read before a menu opened', () => {
    const b = new HintBook();
    b.request(hint('late', 0, 10));
    b.tick(0.1, true);
    b.tick(7, true);
    b.tick(0.1, false);
    b.tick(0.1, true);
    expect(b.current).toBeNull();
    expect(b.request(hint('late'))).toBe(false);
  });

  it('caps the queue, dropping the lowest priorities', () => {
    const b = new HintBook();
    for (let i = 0; i < 12; i++) b.request(hint(`h${i}`, i));
    const seen: string[] = [];
    for (let i = 0; i < 12; i++) {
      b.tick(0.1, true);
      if (b.current) seen.push(b.current.id);
      b.dismiss();
    }
    expect(seen).toEqual(['h11', 'h10', 'h9', 'h8', 'h7', 'h6', 'h5', 'h4']);
  });

  it('can forget a learned hint so Help can replay it', () => {
    const b = new HintBook();
    b.learn('aim');
    b.unlearn('aim');
    expect(b.isLearned('aim')).toBe(false);
    expect(b.request(hint('aim'))).toBe(true);
  });

  it('round-trips through its saved record and ignores junk', () => {
    const a = new HintBook();
    a.learn('b');
    a.learn('a');
    expect(a.serialize()).toEqual({ learned: ['a', 'b'] });
    const b = new HintBook(a.serialize());
    expect(b.isLearned('a') && b.isLearned('b')).toBe(true);
    expect(b.learnedIds().sort()).toEqual(['a', 'b']);
    const junk = new HintBook({ learned: ['ok', 3, null] as unknown as string[] });
    expect(junk.learnedIds()).toEqual(['ok']);
    expect(new HintBook(null).learnedIds()).toEqual([]);
    expect(new HintBook({ learned: 'nope' } as unknown as { learned: string[] }).learnedIds()).toEqual([]);
  });
});
