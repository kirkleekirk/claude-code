// One small tileable noise texture shared by the sky's clouds, the cloud
// shadows on the ground, wind over the grass and the water.
//   R: cloud shapes (soft noise with billowed edges)   G: billows (cells)
//   B: fine wisps                                       A: slow, large variation
import * as THREE from 'three';

function hash2(ix, iy, seed) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const wrap = (i, p) => ((i % p) + p) % p;
// gradient noise that repeats every `period` cells, about -1..1
function perlin(x, y, period, seed) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10), v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const g = (ix, iy, dx, dy) => { const a = hash2(wrap(ix, period), wrap(iy, period), seed) * 6.2831853; return Math.cos(a) * dx + Math.sin(a) * dy; };
  const a = g(x0, y0, fx, fy), b = g(x0 + 1, y0, fx - 1, fy), c = g(x0, y0 + 1, fx, fy - 1), d = g(x0 + 1, y0 + 1, fx - 1, fy - 1);
  const top = a + u * (b - a), bot = c + u * (d - c);
  return (top + v * (bot - top)) * 1.41;
}
// distance to the nearest of one point per cell (repeating), 0..1
function worley(x, y, period, seed) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  let best = 9;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const cx = x0 + dx, cy = y0 + dy, wx = wrap(cx, period), wy = wrap(cy, period);
    const px = cx + hash2(wx, wy, seed), py = cy + hash2(wx, wy, seed + 7);
    const d = (px - x) * (px - x) + (py - y) * (py - y);
    if (d < best) best = d;
  }
  return Math.min(1, Math.sqrt(best));
}
const fbm = (fn, x, y, period, seed, oct) => {
  let s = 0, a = 1, tot = 0;
  for (let o = 0; o < oct; o++) { s += a * fn(x * period, y * period, period, seed + o * 13); tot += a; a *= 0.5; period *= 2; }
  return s / tot;
};

let tex = null;
export function noiseTexture(size = 256) {
  if (tex) return tex;
  const n = size * size, ch = [new Float32Array(n), new Float32Array(n), new Float32Array(n), new Float32Array(n)];
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const x = i / size, y = j / size, k = j * size + i;
    const p = fbm(perlin, x, y, 3, 11, 5) * 0.5 + 0.5;
    const w = 1 - fbm(worley, x, y, 4, 23, 3);
    ch[0][k] = p * 0.62 + w * 0.38;
    ch[1][k] = 1 - fbm(worley, x, y, 9, 41, 3);
    ch[2][k] = fbm(perlin, x, y, 16, 57, 3) * 0.5 + 0.5;
    ch[3][k] = fbm(perlin, x, y, 2, 71, 3) * 0.5 + 0.5;
  }
  const data = new Uint8Array(n * 4);
  ch.forEach((c, q) => {
    // stretch each channel over the whole range so thresholds mean the same everywhere
    let lo = Infinity, hi = -Infinity;
    for (let k = 0; k < n; k++) { if (c[k] < lo) lo = c[k]; if (c[k] > hi) hi = c[k]; }
    for (let k = 0; k < n; k++) data[k * 4 + q] = Math.round(((c[k] - lo) / (hi - lo)) * 255);
  });
  tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  tex.name = 'hfNoise';
  return tex;
}
