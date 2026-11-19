/**
 * Spatial navigation geometry (pure, DOM-free so it can be unit-tested).
 *
 * Given the focused element's rectangle, a direction and candidate rectangles, pick the candidate a
 * player would expect: the nearest one in that direction, strongly preferring candidates that line
 * up with the current one (same row for left/right, same column for up/down).
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Dir = 'left' | 'right' | 'up' | 'down';

export function dirFrom(dx: number, dy: number): Dir | null {
  if (dx === 0 && dy === 0) return null;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}

const cx = (r: Rect) => r.x + r.w / 2;
const cy = (r: Rect) => r.y + r.h / 2;

/** Overlap length of two 1-D ranges (negative = gap). */
function overlap(a0: number, a1: number, b0: number, b1: number): number {
  return Math.min(a1, b1) - Math.max(a0, b0);
}

/**
 * Score a candidate; lower is better. Infinity means "not in that direction".
 * - primary: distance along the direction from the current edge to the candidate's near edge.
 * - secondary: perpendicular offset between centres, forgiven when the ranges overlap.
 */
export function score(from: Rect, to: Rect, dir: Dir): number {
  const EPS = 1;
  let primary: number;
  let lateral: number;
  let aligned: number;
  switch (dir) {
    case 'right':
      if (cx(to) <= cx(from) + EPS || to.x + to.w <= from.x + from.w - EPS) return Infinity;
      primary = Math.max(0, to.x - (from.x + from.w));
      lateral = Math.abs(cy(to) - cy(from));
      aligned = overlap(from.y, from.y + from.h, to.y, to.y + to.h);
      break;
    case 'left':
      if (cx(to) >= cx(from) - EPS || to.x >= from.x + EPS) return Infinity;
      primary = Math.max(0, from.x - (to.x + to.w));
      lateral = Math.abs(cy(to) - cy(from));
      aligned = overlap(from.y, from.y + from.h, to.y, to.y + to.h);
      break;
    case 'down':
      if (cy(to) <= cy(from) + EPS || to.y + to.h <= from.y + from.h - EPS) return Infinity;
      primary = Math.max(0, to.y - (from.y + from.h));
      lateral = Math.abs(cx(to) - cx(from));
      aligned = overlap(from.x, from.x + from.w, to.x, to.x + to.w);
      break;
    case 'up':
      if (cy(to) >= cy(from) - EPS || to.y >= from.y + EPS) return Infinity;
      primary = Math.max(0, from.y - (to.y + to.h));
      lateral = Math.abs(cx(to) - cx(from));
      aligned = overlap(from.x, from.x + from.w, to.x, to.x + to.w);
      break;
  }
  // Aligned candidates get their lateral offset mostly forgiven; misaligned ones pay double.
  const lateralCost = aligned > 0 ? lateral * 0.15 : lateral * 2 + 40;
  return primary + lateralCost;
}

const same = (a: Rect, b: Rect) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

/** Index of the best candidate, or -1. `wrap` jumps to the far side when nothing lies ahead. */
export function pickNext(from: Rect, candidates: readonly Rect[], dir: Dir, wrap = false): number {
  let best = -1;
  let bestScore = Infinity;
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i]!;
    if (same(c, from)) continue;
    const s = score(from, c, dir);
    if (s < bestScore) {
      bestScore = s;
      best = i;
    }
  }
  if (best >= 0 || !wrap) return best;
  // Wrap: the candidate farthest in the opposite direction that shares the row/column.
  let far = -1;
  let farScore = -Infinity;
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i]!;
    if (same(c, from)) continue;
    const horizontal = dir === 'left' || dir === 'right';
    const shares = horizontal
      ? overlap(from.y, from.y + from.h, c.y, c.y + c.h) > 0
      : overlap(from.x, from.x + from.w, c.x, c.x + c.w) > 0;
    if (!shares) continue;
    const along = horizontal ? cx(c) : cy(c);
    const value = dir === 'right' || dir === 'down' ? -along : along;
    if (value > farScore) {
      farScore = value;
      far = i;
    }
  }
  return far;
}

/**
 * The candidate at the top-left reading position: the default when nothing is focused. The first
 * row is everything whose top edge sits above the middle of the top-most candidate, so items a few
 * pixels lower (different heights, baseline nudges) still count as the same row; the left-most wins.
 */
export function pickFirst(candidates: readonly Rect[]): number {
  let top = -1;
  for (let i = 0; i < candidates.length; i++) if (top < 0 || candidates[i]!.y < candidates[top]!.y) top = i;
  if (top < 0) return -1;
  const rowEnd = candidates[top]!.y + candidates[top]!.h / 2;
  let best = top;
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i]!;
    const b = candidates[best]!;
    if (c.y < rowEnd && (c.x < b.x || (c.x === b.x && c.y < b.y))) best = i;
  }
  return best;
}
