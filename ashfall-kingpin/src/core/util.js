// Small pure helpers shared by sim, world and render code.

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);
export const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
export const dist2 = (ax, ay, bx, by) => (bx - ax) * (bx - ax) + (by - ay) * (by - ay);
export const approach = (v, target, step) => (v < target ? Math.min(v + step, target) : Math.max(v - step, target));
export const round2 = (v) => Math.round(v * 100) / 100;
export const sum = (arr, f = (x) => x) => arr.reduce((a, x) => a + f(x), 0);

export function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function fmtMoney(v, short = false) {
  const n = Math.round(v);
  const neg = n < 0 ? '-' : '';
  const a = Math.abs(n);
  if (short && a >= 1e6) return `${neg}$${(a / 1e6).toFixed(a >= 1e7 ? 1 : 2)}M`;
  if (short && a >= 1e4) return `${neg}$${(a / 1e3).toFixed(1)}k`;
  return `${neg}$${a.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

export function fmtNum(v, d = 0) {
  if (!Number.isFinite(v)) return '0';
  return d ? v.toFixed(d) : Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function fmtPct(v, d = 0) { return `${(v * 100).toFixed(d)}%`; }

export function fmtClock(min) {
  const m = ((Math.floor(min) % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60), mm = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function fmtSigned(v, d = 0) { return (v >= 0 ? '+' : '') + (d ? v.toFixed(d) : Math.round(v)); }

export function titleCase(s) { return s.replace(/(^|[\s_-])([a-z])/g, (_, a, b) => (a === '_' || a === '-' ? ' ' : a) + b.toUpperCase()); }

export function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

// Rectangles: {x, y, w, h} in tiles (inclusive start, exclusive end).
export function rectsOverlap(a, b, pad = 0) {
  return a.x - pad < b.x + b.w && b.x - pad < a.x + a.w && a.y - pad < b.y + b.h && b.y - pad < a.y + a.h;
}
export function inRect(x, y, r) { return x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h; }

export const DIRS4 = [[0, -1], [1, 0], [0, 1], [-1, 0]];
export const DIRS8 = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
export const FACING_VEC = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };

export function plural(n, word, pl) { return `${n} ${n === 1 ? word : pl || word + 's'}`; }

export function hasNaN(obj, path = '', out = []) {
  if (typeof obj === 'number') { if (!Number.isFinite(obj)) out.push(path); }
  else if (obj && typeof obj === 'object') for (const k of Object.keys(obj)) hasNaN(obj[k], path + '.' + k, out);
  return out;
}
