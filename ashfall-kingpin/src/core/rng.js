// Seeded randomness. Sim state keeps its RNG as a plain integer (S.rng) so saves stay JSON.

export function mulberryStep(s) {
  s = (s + 0x6D2B79F5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [s, ((t ^ (t >>> 14)) >>> 0) / 4294967296];
}

// Object-style RNG for world decoration and action mode.
export class RNG {
  constructor(seed) { this.s = seed >>> 0; }
  next() { const [s, v] = mulberryStep(this.s); this.s = s; return v; }
  range(a, b) { return a + (b - a) * this.next(); }
  int(a, b) { return a + Math.floor(this.next() * (b - a + 1)); }
  chance(p) { return this.next() < p; }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(this.next() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr;
  }
}

// State-bound helpers: every sim random draw goes through S.rng.
export function rnd(S) { const [s, v] = mulberryStep(S.rng); S.rng = s; return v; }
export function rint(S, a, b) { return a + Math.floor(rnd(S) * (b - a + 1)); }
export function rrange(S, a, b) { return a + (b - a) * rnd(S); }
export function rchance(S, p) { return rnd(S) < p; }
export function rpick(S, arr) { return arr[Math.floor(rnd(S) * arr.length)]; }
export function rweighted(S, items, weightOf) {
  let total = 0;
  for (const it of items) total += Math.max(0, weightOf(it));
  if (total <= 0) return null;
  let r = rnd(S) * total;
  for (const it of items) { r -= Math.max(0, weightOf(it)); if (r <= 0) return it; }
  return items[items.length - 1];
}

// Stateless hashing / value noise for deterministic decoration.
export function hash2(x, y, seed = 0) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function valueNoise(x, y, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm(x, y, seed = 0, oct = 3) {
  let amp = 1, f = 1, sum = 0, norm = 0;
  for (let i = 0; i < oct; i++) { sum += valueNoise(x * f, y * f, seed + i * 101) * amp; norm += amp; amp *= 0.5; f *= 2; }
  return sum / norm;
}

export function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
