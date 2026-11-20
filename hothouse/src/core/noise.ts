import { hash2 } from './rng';

/**
 * Deterministic coherent noise for world generation and procedural textures.
 * All functions are pure: the same inputs always give the same output on every machine.
 */

const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);

/** Value noise in [0, 1). */
export function valueNoise2(x: number, y: number, seed = 0): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = fade(xf);
  const v = fade(yf);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  const top = a + (b - a) * u;
  const bottom = c + (d - c) * u;
  return (top + (bottom - top) * v) / 4294967296;
}

const GRAD: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [0.7071, 0.7071], [-0.7071, 0.7071], [0.7071, -0.7071], [-0.7071, -0.7071],
];

function gradDot(ix: number, iy: number, dx: number, dy: number, seed: number): number {
  const g = GRAD[hash2(ix, iy, seed) & 7]!;
  return g[0] * dx + g[1] * dy;
}

/** Gradient (Perlin-style) noise in roughly [−1, 1]. */
export function gradNoise2(x: number, y: number, seed = 0): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = fade(xf);
  const v = fade(yf);
  const n00 = gradDot(xi, yi, xf, yf, seed);
  const n10 = gradDot(xi + 1, yi, xf - 1, yf, seed);
  const n01 = gradDot(xi, yi + 1, xf, yf - 1, seed);
  const n11 = gradDot(xi + 1, yi + 1, xf - 1, yf - 1, seed);
  const nx0 = n00 + (n10 - n00) * u;
  const nx1 = n01 + (n11 - n01) * u;
  return (nx0 + (nx1 - nx0) * v) * 1.4142;
}

/** Fractal value noise in [0, 1). */
export function fbm2(x: number, y: number, octaves = 4, seed = 0, lacunarity = 2, gain = 0.5): number {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise2(x * freq, y * freq, seed + i * 131);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

/** Tileable value noise in [0, 1): repeats every `period` units on both axes. */
export function tileNoise2(x: number, y: number, period: number, seed = 0): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = fade(xf);
  const v = fade(yf);
  const w = (n: number) => ((n % period) + period) % period;
  const a = hash2(w(xi), w(yi), seed);
  const b = hash2(w(xi + 1), w(yi), seed);
  const c = hash2(w(xi), w(yi + 1), seed);
  const d = hash2(w(xi + 1), w(yi + 1), seed);
  const top = a + (b - a) * u;
  const bottom = c + (d - c) * u;
  return (top + (bottom - top) * v) / 4294967296;
}

/** Tileable fractal noise in [0, 1) for seamless textures. `period` is in base-octave cells. */
export function tileFbm2(x: number, y: number, period: number, octaves = 4, seed = 0): number {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * tileNoise2(x * freq, y * freq, period * freq, seed + i * 131);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

/**
 * Worley / cellular noise: distance to the nearest feature point, in cells. Useful for cracks,
 * pebbles, foam and puddle shapes. Returns `[f1, f2]` packed as f1 + f2 * 16 is avoided: use the
 * out array to stay allocation-free.
 */
export function worley2(x: number, y: number, seed: number, out: [number, number]): [number, number] {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  let f1 = 9;
  let f2 = 9;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const cx = xi + i;
      const cy = yi + j;
      const px = cx + hash2(cx, cy, seed) / 4294967296;
      const py = cy + hash2(cx, cy, seed + 7919) / 4294967296;
      const d = Math.hypot(px - x, py - y);
      if (d < f1) {
        f2 = f1;
        f1 = d;
      } else if (d < f2) {
        f2 = d;
      }
    }
  }
  out[0] = f1;
  out[1] = f2;
  return out;
}
