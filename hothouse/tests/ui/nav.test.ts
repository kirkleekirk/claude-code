import { describe, expect, it } from 'vitest';
import { dirFrom, pickFirst, pickNext, score, type Rect } from '@/ui/core/nav';

const r = (x: number, y: number, w = 100, h = 40): Rect => ({ x, y, w, h });

/** A 3 × 2 grid of cards, 120 px apart horizontally and 60 px vertically. */
const grid = [r(0, 0), r(120, 0), r(240, 0), r(0, 60), r(120, 60), r(240, 60)];

describe('dirFrom', () => {
  it('maps stick and arrow deltas to the dominant direction', () => {
    expect(dirFrom(0, 0)).toBeNull();
    expect(dirFrom(1, 0)).toBe('right');
    expect(dirFrom(-1, 0.4)).toBe('left');
    expect(dirFrom(0.2, 1)).toBe('down');
    expect(dirFrom(0.3, -0.9)).toBe('up');
  });

  it('breaks exact diagonals toward horizontal', () => {
    expect(dirFrom(1, 1)).toBe('right');
    expect(dirFrom(-1, -1)).toBe('left');
  });
});

describe('score', () => {
  it('rejects candidates that are not in the requested direction', () => {
    const from = r(100, 100);
    expect(score(from, r(0, 100), 'right')).toBe(Infinity);
    expect(score(from, r(220, 100), 'left')).toBe(Infinity);
    expect(score(from, r(100, 0), 'down')).toBe(Infinity);
    expect(score(from, r(100, 160), 'up')).toBe(Infinity);
  });

  it('prefers a far aligned candidate to a near one off to the side', () => {
    const from = r(0, 0);
    const sameColumn = r(0, 200);
    const diagonal = r(150, 60);
    expect(score(from, sameColumn, 'down')).toBeLessThan(score(from, diagonal, 'down'));
  });

  it('scores by the gap between edges, not centres', () => {
    const from = r(0, 0);
    expect(score(from, r(130, 0), 'right')).toBeLessThan(score(from, r(150, 0), 'right'));
  });
});

describe('pickNext', () => {
  it('moves through a grid like a player expects', () => {
    expect(pickNext(grid[1]!, grid, 'down')).toBe(4);
    expect(pickNext(grid[4]!, grid, 'up')).toBe(1);
    expect(pickNext(grid[3]!, grid, 'right')).toBe(4);
    expect(pickNext(grid[2]!, grid, 'left')).toBe(1);
  });

  it('stops at the edge without wrap and wraps along the row or column with it', () => {
    expect(pickNext(grid[2]!, grid, 'right')).toBe(-1);
    expect(pickNext(grid[2]!, grid, 'right', true)).toBe(0);
    expect(pickNext(grid[0]!, grid, 'left', true)).toBe(2);
    expect(pickNext(grid[4]!, grid, 'down', true)).toBe(1);
  });

  it('never picks the focused rectangle itself', () => {
    const lone = [r(0, 0)];
    expect(pickNext(lone[0]!, lone, 'right', true)).toBe(-1);
  });

  it('goes from a wide button to the item under its centre', () => {
    const wide = r(0, 0, 360, 40);
    const row = [wide, r(0, 60), r(130, 60), r(260, 60)];
    expect(pickNext(wide, row, 'down')).toBe(2);
  });

  it('goes from a small item up to a wide button above it', () => {
    const row = [r(0, 0, 360, 40), r(0, 60), r(130, 60), r(260, 60)];
    expect(pickNext(row[3]!, row, 'up')).toBe(0);
  });

  it('prefers the next row over a far item in the current row when moving down', () => {
    const items = [r(0, 0), r(0, 60), r(600, 10)];
    expect(pickNext(items[0]!, items, 'down')).toBe(1);
  });
});

describe('pickFirst', () => {
  it('returns -1 for no candidates', () => {
    expect(pickFirst([])).toBe(-1);
  });

  it('picks the left-most item of the top row', () => {
    expect(pickFirst([grid[4]!, grid[2]!, grid[0]!, grid[3]!])).toBe(2);
  });

  it('treats items a few pixels lower as the same row', () => {
    // A taller card nudged 4 px down still starts the reading order on the left.
    expect(pickFirst([r(200, 0), r(0, 4, 100, 60), r(0, 100)])).toBe(1);
  });

  it('does not pull an item from the next row into the first one', () => {
    expect(pickFirst([r(200, 0), r(0, 30)])).toBe(0);
  });
});
