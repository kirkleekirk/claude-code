// Deterministic noise toolkit: seeded RNG, value noise with analytic derivatives,
// gradient noise, fbm variants and tileable noise for texture baking.

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash2(ix, iz, seed = 0) {
  let h = (ix * 374761393 + iz * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export function smoothstep(a, b, x) {
  let t = (x - a) / (b - a);
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return t * t * (3 - 2 * t);
}

export class Noise {
  constructor(seed = 1) {
    const rnd = mulberry32(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = (rnd() * (i + 1)) | 0;
      const t = p[i]; p[i] = p[j]; p[j] = t;
    }
    this.perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
    this.vals = new Float32Array(256);
    this.gx = new Float32Array(256);
    this.gy = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      this.vals[i] = rnd();
      const a = rnd() * Math.PI * 2;
      this.gx[i] = Math.cos(a); this.gy[i] = Math.sin(a);
    }
    this.dx = 0; this.dy = 0;
  }

  // Value noise in [0,1]; derivatives are left in this.dx / this.dy.
  vnoise(x, y) {
    const xf = Math.floor(x), yf = Math.floor(y);
    const fx = x - xf, fy = y - yf;
    const xi = xf & 255, yi = yf & 255;
    const P = this.perm, V = this.vals;
    const a = V[P[xi + P[yi]]], b = V[P[xi + 1 + P[yi]]];
    const c = V[P[xi + P[yi + 1]]], d = V[P[xi + 1 + P[yi + 1]]];
    const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
    const uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
    const dux = 30 * fx * fx * (fx * (fx - 2) + 1);
    const duy = 30 * fy * fy * (fy * (fy - 2) + 1);
    const k1 = b - a, k2 = c - a, k4 = a - b - c + d;
    this.dx = dux * (k1 + k4 * uy);
    this.dy = duy * (k2 + k4 * ux);
    return a + k1 * ux + k2 * uy + k4 * ux * uy;
  }

  // Gradient noise, roughly [-1,1].
  pnoise(x, y) {
    const xf = Math.floor(x), yf = Math.floor(y);
    const fx = x - xf, fy = y - yf;
    const xi = xf & 255, yi = yf & 255;
    const P = this.perm, GX = this.gx, GY = this.gy;
    const i00 = P[xi + P[yi]], i10 = P[xi + 1 + P[yi]];
    const i01 = P[xi + P[yi + 1]], i11 = P[xi + 1 + P[yi + 1]];
    const n00 = GX[i00] * fx + GY[i00] * fy;
    const n10 = GX[i10] * (fx - 1) + GY[i10] * fy;
    const n01 = GX[i01] * fx + GY[i01] * (fy - 1);
    const n11 = GX[i11] * (fx - 1) + GY[i11] * (fy - 1);
    const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
    const uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
    const a = n00 + (n10 - n00) * ux;
    const b = n01 + (n11 - n01) * ux;
    return (a + (b - a) * uy) * 1.4142;
  }

  fbm(x, y, oct = 4, lac = 2.03, gain = 0.5) {
    let a = 0, amp = 0.5, norm = 0;
    for (let i = 0; i < oct; i++) {
      a += this.pnoise(x, y) * amp;
      norm += amp;
      const nx = x * 0.8 - y * 0.6, ny = x * 0.6 + y * 0.8;
      x = nx * lac + 17.3; y = ny * lac - 9.1;
      amp *= gain;
    }
    return a / norm;
  }

  // Ridged multifractal in [0,1]: sharp crests, good for spines and dunes.
  ridged(x, y, oct = 4, lac = 2.07, gain = 0.5) {
    let a = 0, amp = 0.5, norm = 0, prev = 1;
    for (let i = 0; i < oct; i++) {
      let n = 1 - Math.abs(this.pnoise(x, y));
      n *= n;
      a += n * amp * prev;
      norm += amp;
      prev = n;
      const nx = x * 0.8 - y * 0.6, ny = x * 0.6 + y * 0.8;
      x = nx * lac + 31.7; y = ny * lac + 5.3;
      amp *= gain;
    }
    return a / norm;
  }

  // Derivative-damped fbm: slopes suppress high octaves, which reads as erosion.
  erosion(x, y, oct = 8) {
    let a = 0, b = 1, dx = 0, dy = 0;
    for (let i = 0; i < oct; i++) {
      const n = this.vnoise(x, y);
      dx += this.dx; dy += this.dy;
      a += (b * n) / (1 + dx * dx + dy * dy);
      b *= 0.5;
      const nx = (0.8 * x - 0.6 * y) * 2.0, ny = (0.6 * x + 0.8 * y) * 2.0;
      x = nx; y = ny;
    }
    return a;
  }
}

// Tileable gradient noise for baking repeatable textures.
export function makeTileNoise(seed) {
  const rnd = mulberry32(seed);
  const p = new Uint8Array(512), gx = new Float32Array(256), gy = new Float32Array(256);
  const base = new Uint8Array(256);
  for (let i = 0; i < 256; i++) base[i] = i;
  for (let i = 255; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; const t = base[i]; base[i] = base[j]; base[j] = t; }
  for (let i = 0; i < 512; i++) p[i] = base[i & 255];
  for (let i = 0; i < 256; i++) { const a = rnd() * 6.2831853; gx[i] = Math.cos(a); gy[i] = Math.sin(a); }
  const px = new Float32Array(256), py = new Float32Array(256);
  for (let i = 0; i < 256; i++) { px[i] = rnd(); py[i] = rnd(); }

  function perlin(x, y, period) {
    const xf = Math.floor(x), yf = Math.floor(y);
    const fx = x - xf, fy = y - yf;
    const x0 = ((xf % period) + period) % period, y0 = ((yf % period) + period) % period;
    const x1 = (x0 + 1) % period, y1 = (y0 + 1) % period;
    const i00 = p[x0 + p[y0]], i10 = p[x1 + p[y0]], i01 = p[x0 + p[y1]], i11 = p[x1 + p[y1]];
    const n00 = gx[i00] * fx + gy[i00] * fy;
    const n10 = gx[i10] * (fx - 1) + gy[i10] * fy;
    const n01 = gx[i01] * fx + gy[i01] * (fy - 1);
    const n11 = gx[i11] * (fx - 1) + gy[i11] * (fy - 1);
    const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
    const uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
    const a = n00 + (n10 - n00) * ux, b = n01 + (n11 - n01) * ux;
    return (a + (b - a) * uy) * 1.4142;
  }
  function fbm(u, v, period, oct) {
    let a = 0, amp = 0.5, norm = 0, per = period;
    for (let i = 0; i < oct; i++) {
      a += perlin(u * per, v * per, per) * amp;
      norm += amp; amp *= 0.5; per *= 2;
    }
    return a / norm;
  }
  // Worley distances (F1, F2) with wraparound.
  function worley(u, v, cells, out) {
    const x = u * cells, y = v * cells;
    const xi = Math.floor(x), yi = Math.floor(y);
    let f1 = 9, f2 = 9;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const cx = xi + i, cy = yi + j;
      const wx = ((cx % cells) + cells) % cells, wy = ((cy % cells) + cells) % cells;
      const h = p[wx + p[wy]];
      const dx = cx + px[h] - x, dy = cy + py[h] - y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
    }
    out[0] = f1; out[1] = f2;
  }
  return { perlin, fbm, worley };
}
