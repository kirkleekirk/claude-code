import { DataTexture, LinearFilter, LinearMipmapLinearFilter, RepeatWrapping, RGBAFormat, UnsignedByteType } from 'three';
import { tileFbm2, tileNoise2 } from '@/core/noise';
import { hash2 } from '@/core/rng';

/**
 * The shared tileable noise texture: R = billowy low-frequency fbm, G = mid fbm, B = fine fbm,
 * A = white noise. Sampled by sky clouds, water, wet roads, wind and heat haze.
 */
export function createNoiseTexture(size = 256, seed = 1337): DataTexture {
  const data = new Uint8Array(size * size * 4);
  const s = 1 / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const u = x * s;
      const v = y * s;
      const low = tileFbm2(u * 4, v * 4, 4, 5, seed);
      const mid = tileFbm2(u * 8, v * 8, 8, 4, seed + 101);
      // Ridged detail reads better than plain fbm for foam and cloud edges.
      const fine = 1 - Math.abs(tileNoise2(u * 32, v * 32, 32, seed + 202) * 2 - 1);
      const fine2 = tileFbm2(u * 24, v * 24, 24, 3, seed + 303);
      data[i] = Math.round(Math.min(1, Math.max(0, (low - 0.2) / 0.6)) * 255);
      data[i + 1] = Math.round(Math.min(1, Math.max(0, (mid - 0.2) / 0.6)) * 255);
      data[i + 2] = Math.round((fine * 0.5 + fine2 * 0.5) * 255);
      data[i + 3] = hash2(x, y, seed + 404) >>> 24;
    }
  }
  const tex = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  tex.name = 'hh-noise';
  return tex;
}
