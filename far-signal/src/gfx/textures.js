import * as THREE from 'three';
import { makeTileNoise } from '../core/noise.js';

// One tileable RGBA noise atlas feeds every procedural shader:
// R,G = fbm (two seeds), B = Worley F1 (cells), A = Worley F2-F1 (cell borders).
export function bakeNoiseTexture(size = 256) {
  const tn = makeTileNoise(9173);
  const tn2 = makeTileNoise(441);
  const data = new Uint8Array(size * size * 4);
  const w = [0, 0];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const r = tn.fbm(u, v, 4, 6) * 0.5 + 0.5;
      const g = tn2.fbm(u + 0.37, v + 0.11, 8, 5) * 0.5 + 0.5;
      tn.worley(u, v, 10, w);
      const i = (y * size + x) * 4;
      data[i] = Math.max(0, Math.min(255, (r * 1.25 - 0.125) * 255));
      data[i + 1] = Math.max(0, Math.min(255, (g * 1.25 - 0.125) * 255));
      data[i + 2] = Math.max(0, Math.min(255, w[0] * 255));
      data[i + 3] = Math.max(0, Math.min(255, (w[1] - w[0]) * 255 * 1.4));
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}
