// Seeded random numbers and smooth noise. Everything procedural in a raid draws
// from one RNG so a seed reproduces the same map and loot.

export function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class RNG {
  constructor(seed = Date.now()) {
    this.seed = seed >>> 0;
    this._r = mulberry32(this.seed);
  }
  next() { return this._r(); }
  range(a, b) { return a + (b - a) * this._r(); }
  int(a, b) { return Math.floor(a + (b - a + 1) * this._r()); }
  chance(p) { return this._r() < p; }
  pick(arr) { return arr[Math.floor(this._r() * arr.length)]; }
  sign() { return this._r() < 0.5 ? -1 : 1; }
  // entries: [[value, weight], ...]
  weighted(entries) {
    let total = 0;
    for (const e of entries) total += e[1];
    let r = this._r() * total;
    for (const e of entries) {
      r -= e[1];
      if (r <= 0) return e[0];
    }
    return entries[entries.length - 1][0];
  }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this._r() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}

// 1D value noise in [-1, 1], used for weapon sway and flicker.
const PERM = new Float32Array(512);
{
  const r = mulberry32(1337);
  for (let i = 0; i < 512; i++) PERM[i] = r() * 2 - 1;
}
export function noise1(x) {
  const i = Math.floor(x);
  const f = x - i;
  const a = PERM[i & 511];
  const b = PERM[(i + 1) & 511];
  const u = f * f * (3 - 2 * f);
  return a + (b - a) * u;
}
