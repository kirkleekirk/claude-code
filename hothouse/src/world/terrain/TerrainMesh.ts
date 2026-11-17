import { BufferAttribute, BufferGeometry, Color, Group, Mesh, type Material } from 'three';
import { clamp, smoothstep } from '@/core/math';
import { fbm2 } from '@/core/noise';
import type { TimeSlicer } from '@/core/slicer';
import { LAYER_REFLECTED } from '@/render/layers';
import { PLATEAU } from '../plan/coast';
import type { Heightfield } from './Heightfield';

const CHUNK = 32; // cells per chunk side

const SAND_DRY = new Color('#EAD3A6');
const SAND_WARM = new Color('#E2C08C');
const SAND_WET = new Color('#A88E6C');
const SEABED = new Color('#C9B48C');
const GRASS = new Color('#8FA25C');
const GRASS_DRY = new Color('#B4AC72');
const MUD = new Color('#6E5C45');
const GROUND = new Color('#A79A7C');

const _c = new Color();

/** Colour and roughness for a terrain vertex. */
function surfaceAt(hf: Heightfield, k: number, x: number, z: number, out: Color): number {
  const h = hf.heights[k]!;
  const sd = hf.coast[k]!;
  const kind = hf.shore[k]!;
  const n = fbm2(x * 0.02, z * 0.02, 3, 31);
  if (h < -0.02) {
    // Seabed: seen through shallow water near beaches.
    out.copy(kind === 2 ? MUD : SEABED).multiplyScalar(clamp(1 - -h * 0.08, 0.35, 1));
    return 0.9;
  }
  if (kind === 2) {
    out.copy(MUD).lerp(GRASS, smoothstep(6, 40, sd) * 0.55 * n);
    return h < 0.15 ? 0.45 : 0.85;
  }
  if (kind === 0 && sd < 120) {
    // Beach: wet and glossy at the waterline, warm and dry up the slope, grass behind the dunes.
    out.copy(SAND_DRY).lerp(SAND_WARM, n);
    const wet = 1 - smoothstep(0, 9, sd);
    out.lerp(SAND_WET, wet);
    out.lerp(GRASS_DRY, smoothstep(88, 118, sd) * 0.8);
    return 0.95 - wet * 0.62;
  }
  // Inland ground: mostly under the city; sandy turf in open areas.
  out.copy(GROUND).lerp(GRASS, 0.35 + 0.4 * n);
  return 0.92;
}

/**
 * Terrain meshes in 128 m chunks. Deep-water chunks are skipped (the water shader colours depth
 * itself) and perfectly flat plateau chunks collapse to two triangles.
 */
export async function buildTerrain(hf: Heightfield, material: Material, slicer: TimeSlicer): Promise<Group> {
  const group = new Group();
  group.name = 'terrain';
  const r1 = hf.res + 1;
  const chunks = Math.ceil(hf.res / CHUNK);
  for (let cj = 0; cj < chunks; cj++) {
    for (let ci = 0; ci < chunks; ci++) {
      const i0 = ci * CHUNK, j0 = cj * CHUNK;
      const i1 = Math.min(hf.res, i0 + CHUNK), j1 = Math.min(hf.res, j0 + CHUNK);
      let minH = Infinity, maxH = -Infinity, minSd = Infinity;
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const k = j * r1 + i;
          const h = hf.heights[k]!;
          if (h < minH) minH = h;
          if (h > maxH) maxH = h;
          if (hf.coast[k]! < minSd) minSd = hf.coast[k]!;
        }
      }
      if (maxH < -1.6) continue;
      const flat = maxH - minH < 1e-4 && Math.abs(maxH - PLATEAU) < 1e-4 && minSd > 130;
      const geo = flat ? flatChunk(hf, i0, j0, i1, j1) : gridChunk(hf, i0, j0, i1, j1);
      const mesh = new Mesh(geo, material);
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.layers.set(LAYER_REFLECTED);
      mesh.name = `terrain-${ci}-${cj}`;
      group.add(mesh);
    }
    await slicer.breathe();
  }
  return group;
}

function flatChunk(hf: Heightfield, i0: number, j0: number, i1: number, j1: number): BufferGeometry {
  const x0 = hf.origin + i0 * hf.cell, x1 = hf.origin + i1 * hf.cell;
  const z0 = hf.origin + j0 * hf.cell, z1 = hf.origin + j1 * hf.cell;
  const k = j0 * (hf.res + 1) + i0;
  const rough = surfaceAt(hf, k, x0, z0, _c);
  const pos = new Float32Array([x0, PLATEAU, z0, x1, PLATEAU, z0, x1, PLATEAU, z1, x0, PLATEAU, z1]);
  const nrm = new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]);
  const col = new Float32Array(12);
  const surf = new Float32Array(16);
  for (let v = 0; v < 4; v++) {
    col.set([_c.r, _c.g, _c.b], v * 3);
    surf.set([rough, 0, 0, 8], v * 4);
  }
  const uv = new Float32Array([x0, z0, x1, z0, x1, z1, x0, z1]);
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('normal', new BufferAttribute(nrm, 3));
  g.setAttribute('color', new BufferAttribute(col, 3));
  g.setAttribute('uv', new BufferAttribute(uv, 2));
  g.setAttribute('surf', new BufferAttribute(surf, 4));
  g.setIndex([0, 3, 2, 0, 2, 1]);
  g.computeBoundingSphere();
  return g;
}

function gridChunk(hf: Heightfield, i0: number, j0: number, i1: number, j1: number): BufferGeometry {
  const w = i1 - i0 + 1, h = j1 - j0 + 1;
  const n = w * h;
  const pos = new Float32Array(n * 3);
  const nrm = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const uv = new Float32Array(n * 2);
  const surf = new Float32Array(n * 4);
  const r1 = hf.res + 1;
  const H = hf.heights;
  let v = 0;
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++, v++) {
      const k = j * r1 + i;
      const x = hf.origin + i * hf.cell, z = hf.origin + j * hf.cell;
      pos[v * 3] = x;
      pos[v * 3 + 1] = H[k]!;
      pos[v * 3 + 2] = z;
      const hl = H[j * r1 + Math.max(0, i - 1)]!, hr = H[j * r1 + Math.min(hf.res, i + 1)]!;
      const hd = H[Math.max(0, j - 1) * r1 + i]!, hu = H[Math.min(hf.res, j + 1) * r1 + i]!;
      const nx = hl - hr, nz = hd - hu, ny = 2 * hf.cell;
      const nl = Math.hypot(nx, ny, nz);
      nrm[v * 3] = nx / nl;
      nrm[v * 3 + 1] = ny / nl;
      nrm[v * 3 + 2] = nz / nl;
      const rough = surfaceAt(hf, k, x, z, _c);
      col[v * 3] = _c.r;
      col[v * 3 + 1] = _c.g;
      col[v * 3 + 2] = _c.b;
      uv[v * 2] = x;
      uv[v * 2 + 1] = z;
      surf[v * 4] = rough;
      surf[v * 4 + 3] = 8; // wet-capable
    }
  }
  const idx = new Uint16Array((w - 1) * (h - 1) * 6);
  let t = 0;
  for (let j = 0; j < h - 1; j++) {
    for (let i = 0; i < w - 1; i++) {
      const a = j * w + i, b = a + 1, c = a + w, d = c + 1;
      // Counter-clockwise seen from above (+Y): a, c, b and b, c, d.
      idx[t++] = a; idx[t++] = c; idx[t++] = b;
      idx[t++] = b; idx[t++] = c; idx[t++] = d;
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('normal', new BufferAttribute(nrm, 3));
  g.setAttribute('color', new BufferAttribute(col, 3));
  g.setAttribute('uv', new BufferAttribute(uv, 2));
  g.setAttribute('surf', new BufferAttribute(surf, 4));
  g.setIndex(new BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}

/** Heights transposed into Rapier's column-major layout (columns along X, rows along Z). */
export function rapierHeights(hf: Heightfield): Float32Array {
  const r1 = hf.res + 1;
  const out = new Float32Array(r1 * r1);
  for (let j = 0; j < r1; j++) for (let i = 0; i < r1; i++) out[i * r1 + j] = hf.heights[j * r1 + i]!;
  return out;
}
