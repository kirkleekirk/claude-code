import { Rng } from '@/core/rng';
import { SurfFlag, WinStyle, type MeshBuilder } from '@/render/geo/MeshBuilder';
import { slab } from '../buildings/kit';
import type { SignRequest } from '../buildings/kit';
import type { ChunkGrid, TrimeshAccumulator } from '../ChunkGrid';
import { distToSegment, type Poly } from '../geom';
import { LANDMASSES, PLATEAU } from '../plan/coast';
import { addCapCollider, ROAD_Y, WALK_Y } from '../roads/RoadMesher';
import type { GlowCard } from '../props/streetProps';
import type { Heightfield } from '../terrain/Heightfield';

/** The Neon Strand's beach edge, from the curb of Bayshore Drive to the sand. */
export const STRAND = {
  curbX: -785.8,
  promenadeX: -797,
  boardwalkX: -815,
  z0: -322,
  z1: 452,
  pierZ: 0,
  pierHalfW: 7,
  pierEnd: -1120,
};
export const BOARDWALK_Y = WALK_Y + 0.35;
export const PIER_Y = 3.2;

export interface BeachfrontResult {
  glows: GlowCard[];
  signs: SignRequest[];
}

export function buildBeachfront(grid: ChunkGrid, col: TrimeshAccumulator, hf: Heightfield, seed: number): BeachfrontResult {
  const rng = new Rng(seed);
  const glows: GlowCard[] = [];
  const signs: SignRequest[] = [];
  const S = STRAND;

  // Promenade: pavers from the curb to the boardwalk, coral curb facing Bayshore Drive.
  for (let z = S.z0; z < S.z1; z += 96) {
    const z1 = Math.min(S.z1, z + 96);
    const b = grid.at(S.curbX, (z + z1) / 2, 'city');
    b.surface('#F07C68', 0.8, 0, 0, SurfFlag.WET).noWindows();
    b.wall(S.curbX, z, S.curbX, z1, ROAD_Y - 0.05, WALK_Y);
    b.surface('#E7C9A8', 0.86, 0, 0, SurfFlag.WET).windows(1.2, 1.2, WinStyle.PAVERS, 7);
    const poly: Poly = [[S.curbX, z], [S.promenadeX, z], [S.promenadeX, z1], [S.curbX, z1]];
    b.cap(poly, WALK_Y, 1);
    addCapCollider(col, poly, WALK_Y);
    col.addQuad([S.curbX, ROAD_Y - 0.05, z], [S.curbX, ROAD_Y - 0.05, z1], [S.curbX, WALK_Y, z1], [S.curbX, WALK_Y, z]);
  }

  // Boardwalk deck on posts, rail on the sand side, steps down every 64 m.
  for (let z = S.z0; z < S.z1; z += 48) {
    const z1 = Math.min(S.z1, z + 48);
    const b = grid.at(S.boardwalkX, (z + z1) / 2, 'city');
    b.surface('#A48D74', 0.88, 0, 0, SurfFlag.WET).windows(0.3, 0.3, WinStyle.DECK, 4);
    slab(b, [[S.promenadeX, z], [S.boardwalkX, z], [S.boardwalkX, z1], [S.promenadeX, z1]], WALK_Y - 0.1, BOARDWALK_Y);
    b.noWindows();
    addCapCollider(col, [[S.promenadeX, z], [S.boardwalkX, z], [S.boardwalkX, z1], [S.promenadeX, z1]], BOARDWALK_Y);
    b.surface('#8A6A4C', 0.9, 0, 0, SurfFlag.WET);
    for (let pz = z + 2; pz < z1; pz += 4) {
      const ground = Math.min(hf.heightAt(S.boardwalkX, pz), PLATEAU);
      b.box(S.boardwalkX + 0.4, (ground + BOARDWALK_Y) / 2, pz, 0.22, BOARDWALK_Y - ground, 0.22);
    }
    // Rail: posts and two rails, painted white.
    b.surface('#F4F0E8', 0.75, 0, 0, SurfFlag.WET);
    const gap = (zz: number) => Math.abs(zz % 64) < 3 || Math.abs(zz - S.pierZ) < S.pierHalfW + 1;
    for (let pz = z; pz <= z1; pz += 2.4) if (!gap(pz)) b.boxOn(S.boardwalkX + 0.15, BOARDWALK_Y, pz, 0.1, 1.05, 0.1);
    for (const h of [0.55, 1.0]) b.box(S.boardwalkX + 0.15, BOARDWALK_Y + h, (z + z1) / 2, 0.08, 0.06, z1 - z);
  }
  for (let z = Math.ceil(S.z0 / 64) * 64; z < S.z1; z += 64) {
    if (Math.abs(z - S.pierZ) < 20) continue;
    const b = grid.at(S.boardwalkX, z, 'city');
    stairs(b, col, S.boardwalkX, z, BOARDWALK_Y, hf);
  }
  // Globe lamps along the boardwalk.
  for (let z = S.z0 + 6; z < S.z1; z += 22) {
    const x = S.boardwalkX + 1.2;
    const b = grid.at(x, z, 'city');
    b.surface('#F2EFE8', 0.45, 0.5, 0, SurfFlag.WET);
    b.cylinder(x, BOARDWALK_Y, z, 0.07, 0.06, 3.8, 8, false);
    b.surface('#FFE7C2', 0.2, 0, 5, SurfFlag.NIGHT);
    b.sphere(x, BOARDWALK_Y + 4.0, z, 0.28, 10, 7);
    glows.push({ x, y: 0, z, radius: 6, color: '#FFD9A0', intensity: 0.5 });
  }

  // Lifeguard huts on stilts, each a different candy colour.
  const hutCols = ['#FF6FA3', '#17C2B0', '#FFD166', '#9C7BFF', '#FF8A5C', '#5FB8FF'];
  let hi = 0;
  for (let z = S.z0 + 40; z < S.z1 - 20; z += 118) {
    if (Math.abs(z - S.pierZ) < 30) continue;
    lifeguardHut(grid, col, -866, z, hf, hutCols[hi++ % hutCols.length]!, rng);
  }
  // Umbrella clusters and loungers on the sand.
  for (let z = S.z0 + 20; z < S.z1 - 10; z += rng.range(14, 30)) {
    if (Math.abs(z - S.pierZ) < 18) continue;
    const x = rng.range(-880, -846);
    umbrella(grid, x, z, hf, rng);
  }

  buildSeawalls(grid, col);
  return { glows, signs };
}

function stairs(b: MeshBuilder, col: TrimeshAccumulator, x: number, z: number, top: number, hf: Heightfield): void {
  const ground = hf.heightAt(x - 3, z);
  const steps = Math.max(2, Math.round((top - ground) / 0.18));
  b.surface('#B48C62', 0.88, 0, 0, SurfFlag.WET).noWindows();
  for (let i = 0; i < steps; i++) {
    const y = top - (i + 1) * ((top - ground) / steps);
    const sx = x - 0.4 - i * 0.32;
    b.box(sx, (y + ground) / 2 - 0.05, z, 0.34, Math.max(0.1, y - ground + 0.1), 2.6);
  }
  // Ramp-shaped collider so feet and wheels glide down.
  const x1 = x - 0.4 - steps * 0.32;
  col.addQuad([x, top, z - 1.3], [x1, ground, z - 1.3], [x1, ground, z + 1.3], [x, top, z + 1.3]);
}

function lifeguardHut(grid: ChunkGrid, col: TrimeshAccumulator, x: number, z: number, hf: Heightfield, color: string, rng: Rng): void {
  const b = grid.at(x, z, 'city');
  const g = hf.heightAt(x, z);
  const floorY = g + 1.6;
  b.surface('#E8E2D6', 0.85, 0, 0, SurfFlag.WET);
  for (const [dx, dz] of [[-1.1, -1.1], [1.1, -1.1], [1.1, 1.1], [-1.1, 1.1]] as const) b.boxOn(x + dx, g, z + dz, 0.18, 1.6, 0.18);
  b.surface('#D9CDBA', 0.9, 0, 0, SurfFlag.WET).windows(0.16, 0.16, WinStyle.DECK, 2);
  b.boxOn(x, floorY, z, 3.4, 0.16, 3.4);
  b.noWindows();
  // The hut: rounded Deco box in candy colours with a porthole and a flag.
  b.surface(color, 0.75, 0, 0, SurfFlag.WET).windows(1.0, 2.2, WinStyle.PORTHOLE, rng.int(1, 99));
  b.boxOn(x, floorY + 0.16, z, 2.4, 2.2, 2.4);
  b.noWindows();
  b.surface('#FFFFFF', 0.7, 0, 0, SurfFlag.WET);
  b.boxOn(x, floorY + 2.36, z, 2.9, 0.18, 2.9);
  b.boxOn(x, floorY + 2.54, z, 1.6, 0.35, 1.6);
  b.surface('#C9CDD2', 0.4, 0.7, 0, 0);
  b.cylinder(x + 1.2, floorY + 2.54, z + 1.2, 0.03, 0.03, 2.2, 5, false);
  b.surface('#FF3D3D', 0.8, 0, 0, SurfFlag.WET);
  b.pushTRS(x + 1.2, floorY + 4.3, z + 1.2, 0.4);
  b.quad([0.9, -0.25, 0], [0, -0.25, 0], [0, 0.25, 0], [0.9, 0.25, 0]);
  b.quad([0, -0.25, 0], [0.9, -0.25, 0], [0.9, 0.25, 0], [0, 0.25, 0]);
  b.pop();
  // Ramp to the sand.
  b.surface('#D9CDBA', 0.9, 0, 0, SurfFlag.WET);
  b.quad([x + 1.7, floorY + 0.16, z - 0.6], [x + 1.7, floorY + 0.16, z + 0.6], [x + 5.2, g, z + 0.6], [x + 5.2, g, z - 0.6]);
  b.quad([x + 5.2, g, z - 0.6], [x + 5.2, g, z + 0.6], [x + 1.7, floorY + 0.16, z + 0.6], [x + 1.7, floorY + 0.16, z - 0.6]);
  col.addQuad([x - 1.7, floorY + 0.16, z - 1.7], [x + 1.7, floorY + 0.16, z - 1.7], [x + 1.7, floorY + 0.16, z + 1.7], [x - 1.7, floorY + 0.16, z + 1.7]);
}

function umbrella(grid: ChunkGrid, x: number, z: number, hf: Heightfield, rng: Rng): void {
  const b = grid.at(x, z, 'city');
  const g = hf.heightAt(x, z);
  const cols = ['#FF6B5E', '#17B8A8', '#FFD166', '#FF8FB1', '#5FB8FF', '#B8F54A'];
  b.surface('#F4F0E8', 0.5, 0.2, 0, 0);
  b.cylinder(x, g - 0.2, z, 0.035, 0.035, 2.5, 6, false);
  b.surface(rng.pick(cols), 0.85, 0, 0, SurfFlag.WET).windows(0.5, 1, WinStyle.STRIPES, 3);
  b.cylinder(x, g + 2.05, z, 1.35, 0.06, 0.5, 12, true, false);
  b.noWindows();
  const loungers = rng.int(0, 2);
  for (let i = 0; i < loungers; i++) {
    const lx = x + (i === 0 ? -1.2 : 1.2), lz = z + rng.range(0.6, 1.8);
    b.surface('#FFFFFF', 0.7, 0, 0, SurfFlag.WET);
    b.boxOn(lx, g, lz, 0.65, 0.32, 1.8);
    b.surface(rng.pick(cols), 0.9, 0, 0, SurfFlag.WET);
    b.boxOn(lx, g + 0.32, lz + 0.1, 0.6, 0.04, 1.4);
  }
}

/** Concrete seawalls with a cap wherever the coast is a wall (bay front, quays, marina). */
function buildSeawalls(grid: ChunkGrid, col: TrimeshAccumulator): void {
  for (const lm of LANDMASSES) {
    const poly = lm.poly;
    const n = poly.length;
    for (let i = 0; i < n; i++) {
      const a = poly[i]!, c = poly[(i + 1) % n]!;
      const mx = (a[0] + c[0]) / 2, mz = (a[1] + c[1]) / 2;
      if (lm.shore(mx, mz) !== 'wall') continue;
      const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (len < 1 || Math.abs(mx) > 1450 || Math.abs(mz) > 1450) continue;
      const steps = Math.ceil(len / 60);
      for (let k = 0; k < steps; k++) {
        const t0 = k / steps, t1 = (k + 1) / steps;
        const p0: [number, number] = [a[0] + (c[0] - a[0]) * t0, a[1] + (c[1] - a[1]) * t0];
        const p1: [number, number] = [a[0] + (c[0] - a[0]) * t1, a[1] + (c[1] - a[1]) * t1];
        const b = grid.at((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, 'city');
        // Face the water: walls face right of travel, so run each edge both ways and keep the
        // one whose normal points away from land.
        const dx = p1[0] - p0[0], dz = p1[1] - p0[1];
        const l = Math.hypot(dx, dz);
        const nx = -dz / l, nz = dx / l;
        const probeX = (p0[0] + p1[0]) / 2 + nx * 3, probeZ = (p0[1] + p1[1]) / 2 + nz * 3;
        const outward = !insideAny(probeX, probeZ);
        const [s0, s1] = outward ? [p0, p1] : [p1, p0];
        b.surface('#CFC6B8', 0.85, 0, 0, SurfFlag.WET).windows(3, 1.2, WinStyle.CONCRETE, 5);
        b.wall(s0[0], s0[1], s1[0], s1[1], -2.6, PLATEAU + 0.3, 0, -2.6);
        b.noWindows();
        b.surface('#E8E2D8', 0.8, 0, 0, SurfFlag.WET);
        const capW = 0.5;
        const ox = (outward ? nx : -nx) * capW, oz = (outward ? nz : -nz) * capW;
        b.quad([s0[0], PLATEAU + 0.3, s0[1]], [s1[0], PLATEAU + 0.3, s1[1]], [s1[0] - ox, PLATEAU + 0.3, s1[1] - oz], [s0[0] - ox, PLATEAU + 0.3, s0[1] - oz]);
        col.addQuad([s0[0], -2.6, s0[1]], [s1[0], -2.6, s1[1]], [s1[0], PLATEAU + 1.4, s1[1]], [s0[0], PLATEAU + 1.4, s0[1]]);
      }
    }
  }
}

function insideAny(x: number, z: number): boolean {
  for (const lm of LANDMASSES) {
    let inside = false;
    const p = lm.poly;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      const [xi, zi] = p[i]!;
      const [xj, zj] = p[j]!;
      if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
    }
    if (inside) return true;
  }
  return false;
}

export function nearPier(x: number, z: number): boolean {
  return distToSegment(x, z, STRAND.boardwalkX, STRAND.pierZ, STRAND.pierEnd, STRAND.pierZ) < STRAND.pierHalfW + 2;
}

