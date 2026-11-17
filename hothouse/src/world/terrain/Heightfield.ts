import { clamp, smootherstep, smoothstep } from '@/core/math';
import { fbm2 } from '@/core/noise';
import type { TimeSlicer } from '@/core/slicer';
import { distToPolyEdge, distToPolyline, pointInPoly } from '../geom';
import { inSawgrass, LANDMASSES, LEVEES, PLATEAU, sawgrassChannels, WORLD_HALF, type ShoreKind } from '../plan/coast';

/**
 * The ground: a regular height raster over the whole map (water level y = 0). Built once at load
 * from the coastline and Sawgrass channel field; queried by physics, placement, the terrain mesh,
 * the water shader (depth), the minimap and AI.
 */
export class Heightfield {
  /** Cells per side. */
  readonly res: number;
  /** Metres per cell. */
  readonly cell: number;
  readonly origin = -WORLD_HALF;
  readonly size = WORLD_HALF * 2;
  /** Heights at grid vertices, (res + 1)² row-major (row = z). */
  readonly heights: Float32Array;
  /** Signed distance to the nearest coast (positive on land), metres. */
  readonly coast: Float32Array;
  /** Shore kind of the nearest coast per vertex (0 beach, 1 wall, 2 mangrove). */
  readonly shore: Uint8Array;

  constructor(cellSize = 4) {
    this.cell = cellSize;
    this.res = Math.round(this.size / cellSize);
    const n = (this.res + 1) * (this.res + 1);
    this.heights = new Float32Array(n);
    this.coast = new Float32Array(n);
    this.shore = new Uint8Array(n);
  }

  /** Fill the raster, yielding to the browser as it goes. `progress` reports 0–1. */
  async build(slicer: TimeSlicer, progress: (f: number) => void): Promise<void> {
    const r1 = this.res + 1;
    const kinds: ShoreKind[] = ['beach', 'wall', 'mangrove'];
    for (let j = 0; j <= this.res; j++) {
      const z = this.origin + j * this.cell;
      for (let i = 0; i <= this.res; i++) {
        const x = this.origin + i * this.cell;
        let best = Infinity;
        let inside = false;
        let kind: ShoreKind = 'beach';
        for (const lm of LANDMASSES) {
          const d = distToPolyEdge(x, z, lm.poly);
          if (d < best) {
            best = d;
            kind = lm.shore(x, z);
          }
          if (!inside && pointInPoly(x, z, lm.poly)) inside = true;
        }
        let sd = inside ? best : -best;
        // Sawgrass: carve channels unless a levee keeps the road dry.
        if (inside && inSawgrass(x, z)) {
          let levee = Infinity;
          for (const l of LEVEES) levee = Math.min(levee, distToPolyline(x, z, l.line) - l.hw);
          const ch = sawgrassChannels(x, z);
          const water = smoothstep(0.43, 0.36, ch) * smoothstep(0, 14, levee);
          if (water > 0.5) {
            sd = Math.min(sd, -6 * (water - 0.5) * 2 - 0.5);
            kind = 'mangrove';
          } else if (water > 0.05) {
            sd = Math.min(sd, (0.5 - water) * 18);
            kind = 'mangrove';
          }
        }
        const k = j * r1 + i;
        this.coast[k] = sd;
        this.shore[k] = kinds.indexOf(kind);
        this.heights[k] = heightFor(sd, kind, x, z);
      }
      if (j % 8 === 0) {
        progress(j / this.res);
        await slicer.breathe();
      }
    }
    progress(1);
  }

  /** Bilinear height at a world position. */
  heightAt(x: number, z: number): number {
    return this.sample(this.heights, x, z);
  }

  /** Signed distance to the coast (positive on land). */
  coastAt(x: number, z: number): number {
    return this.sample(this.coast, x, z);
  }

  isWater(x: number, z: number): boolean {
    return this.heightAt(x, z) < -0.05;
  }

  /** Water depth (0 on land). */
  depthAt(x: number, z: number): number {
    return Math.max(0, -this.heightAt(x, z));
  }

  private sample(arr: Float32Array, x: number, z: number): number {
    const fx = clamp((x - this.origin) / this.cell, 0, this.res - 1e-4);
    const fz = clamp((z - this.origin) / this.cell, 0, this.res - 1e-4);
    const i = Math.floor(fx), j = Math.floor(fz);
    const tx = fx - i, tz = fz - j;
    const r1 = this.res + 1;
    const a = arr[j * r1 + i]!, b = arr[j * r1 + i + 1]!;
    const c = arr[(j + 1) * r1 + i]!, d = arr[(j + 1) * r1 + i + 1]!;
    return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
  }
}

/** Height profile across a shore. `sd` > 0 is land. */
export function heightFor(sd: number, kind: ShoreKind, x: number, z: number): number {
  if (sd >= 0) {
    if (kind === 'beach') {
      // A wide, gently rising beach with a soft berm; flat plateau beyond 90 m.
      const rise = smootherstep(0, 90, sd);
      const dune = Math.max(0, 1 - Math.abs(sd - 62) / 20) * 0.22 * fbm2(x * 0.05, z * 0.05, 2, 4);
      return PLATEAU * rise + dune;
    }
    if (kind === 'mangrove') {
      const mud = 0.28 + 0.22 * smoothstep(0, 30, sd);
      return Math.min(PLATEAU, mud + 0.1 * fbm2(x * 0.03, z * 0.03, 2, 9));
    }
    return PLATEAU;
  }
  const d = -sd;
  if (kind === 'beach') {
    // Shallow turquoise shelf, then the drop-off.
    return -Math.min(0.045 * d + 0.0004 * d * d, 14);
  }
  if (kind === 'mangrove') return -Math.min(0.35 + d * 0.06, 2.2);
  // Seawalls: deep right at the wall (quays and the bayfront).
  return -Math.min(3.2 + d * 0.025, 11);
}
