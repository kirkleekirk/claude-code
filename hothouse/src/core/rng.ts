/**
 * Deterministic randomness. `Rng` is a small, fast, serializable generator (sfc32); the `hash*`
 * helpers are stateless and used for world generation where results must depend only on position.
 */

export type RngState = readonly [number, number, number, number];

/** 32-bit string hash (FNV-1a with an avalanche finish). */
export function hashString(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return hash32(h);
}

/** Integer avalanche hash (murmur3 finalizer). */
export function hash32(x: number): number {
  let h = x | 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Hash two integers and a seed to a uint32. */
export function hash2(x: number, y: number, seed = 0): number {
  return hash32(Math.imul(x | 0, 0x1f1f1f1f) ^ hash32((y | 0) + Math.imul(seed | 0, 0x9e3779b1)));
}

/** Hash to a float in [0, 1). */
export function hash2f(x: number, y: number, seed = 0): number {
  return hash2(x, y, seed) / 4294967296;
}

export class Rng {
  private a = 0;
  private b = 0;
  private c = 0;
  private d = 0;

  constructor(seed: number | string | RngState = 1) {
    if (typeof seed === 'object') {
      this.setState(seed);
    } else {
      this.reseed(seed);
    }
  }

  reseed(seed: number | string): void {
    const s = typeof seed === 'string' ? hashString(seed) : seed >>> 0;
    this.a = hash32(s ^ 0x9e3779b9);
    this.b = hash32(s + 0x243f6a88);
    this.c = hash32(s ^ 0xb7e15162);
    this.d = 1;
    for (let i = 0; i < 12; i++) this.nextU32();
  }

  getState(): RngState {
    return [this.a, this.b, this.c, this.d];
  }

  setState(state: RngState): void {
    this.a = state[0] >>> 0;
    this.b = state[1] >>> 0;
    this.c = state[2] >>> 0;
    this.d = state[3] >>> 0;
  }

  /** A child generator derived from this one's state and a label; does not advance the parent. */
  fork(label: string | number): Rng {
    const l = typeof label === 'string' ? hashString(label) : hash32(label);
    return new Rng((hash32(this.a ^ l) ^ hash32(this.b + l) ^ this.c) >>> 0);
  }

  nextU32(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }

  /** Float in [0, 1). */
  next(): number {
    return this.nextU32() / 4294967296;
  }

  /** Float in [min, max). */
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  sign(): 1 | -1 {
    return this.next() < 0.5 ? -1 : 1;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick on empty array');
    return items[Math.floor(this.next() * items.length)]!;
  }

  /** Pick an index using non-negative weights. Returns -1 if all weights are zero. */
  weightedIndex(weights: readonly number[]): number {
    let total = 0;
    for (const w of weights) total += w > 0 ? w : 0;
    if (total <= 0) return -1;
    let r = this.next() * total;
    for (let i = 0; i < weights.length; i++) {
      const w = weights[i]!;
      if (w <= 0) continue;
      r -= w;
      if (r < 0) return i;
    }
    return weights.length - 1;
  }

  weighted<T>(items: readonly T[], weight: (item: T) => number): T | undefined {
    const i = this.weightedIndex(items.map(weight));
    return i < 0 ? undefined : items[i];
  }

  /** In-place Fisher–Yates shuffle. */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const tmp = items[i]!;
      items[i] = items[j]!;
      items[j] = tmp;
    }
    return items;
  }

  /** Approximately normal, mean 0, standard deviation 1. */
  gaussian(): number {
    const u = Math.max(this.next(), 1e-12);
    const v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /** Triangular distribution centred on 0 in [-1, 1]; cheap and bounded. */
  tri(): number {
    return this.next() - this.next();
  }
}
