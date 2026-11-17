import { fbm2 } from '@/core/noise';
import { Rng } from '@/core/rng';
import type { P2, Poly } from '../geom';

/**
 * Halcyon Bay's shoreline. World units are metres, +X east, +Z south, water level y = 0.
 * Land plateau sits at `PLATEAU` so roads and lots are perfectly flat; shores are typed so the
 * terrain builder knows whether to grade a beach, drop a seawall or fray into mangroves.
 */

export const PLATEAU = 0.6;
export const WORLD_HALF = 1400;

export type ShoreKind = 'beach' | 'wall' | 'mangrove';

export interface LandMass {
  readonly id: string;
  readonly poly: Poly;
  /** Shore type for a point on this landmass's coast. */
  shore(x: number, z: number): ShoreKind;
}

/** Mainland: Strand beach on the west, bay seawall on the north, harbor quays, Sawgrass mangroves south. */
const MAINLAND: Poly = [
  [-898, -318], [-880, -342], [-850, -352], [-700, -356], [-520, -352], [-340, -350], [-205, -353],
  [-162, -366], [-146, -400], [-142, -600], [-146, -820], [-142, -1000], [-150, -1150],
  [-120, -1168], [0, -1170], [300, -1171], [700, -1169], [1100, -1171], [1520, -1170],
  [1520, 1520], [600, 1520], [100, 1450], [-300, 1390], [-470, 1190], [-590, 1010], [-655, 830], [-715, 650],
  [-790, 530], [-860, 488], [-902, 430], [-907, 300], [-905, 150], [-903, 0], [-905, -150], [-903, -260],
];

function islaDorada(): Poly {
  const rng = new Rng('isla-dorada');
  const pts: Poly = [];
  const cx = -1030, cz = -820, rx = 318, rz = 246;
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const wobble = 1 + 0.05 * Math.sin(a * 3 + 0.7) + 0.025 * rng.tri();
    pts.push([cx + Math.cos(a) * rx * wobble, cz + Math.sin(a) * rz * wobble]);
  }
  return pts;
}

function islet(cx: number, cz: number, r: number, seed: string): Poly {
  const rng = new Rng(seed);
  const pts: Poly = [];
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    const w = 1 + 0.18 * Math.sin(a * 2 + rng.range(0, 6)) + 0.08 * rng.tri();
    pts.push([cx + Math.cos(a) * r * w, cz + Math.sin(a) * r * 0.82 * w]);
  }
  return pts;
}

export const LANDMASSES: readonly LandMass[] = [
  {
    id: 'mainland',
    poly: MAINLAND,
    shore(x, z) {
      if (z > 470) return 'mangrove';
      if (x < -860 && z > -335) return 'beach';
      return 'wall';
    },
  },
  {
    id: 'isla',
    poly: islaDorada(),
    shore(x, z) {
      // Seawalled marina on the east side facing the causeway; beaches elsewhere.
      return x > -840 && z > -930 && z < -700 ? 'wall' : 'beach';
    },
  },
  { id: 'key1', poly: islet(-1150, 640, 95, 'key1'), shore: () => 'beach' },
  { id: 'key2', poly: islet(-1015, 800, 80, 'key2'), shore: () => 'beach' },
  { id: 'key3', poly: islet(-1190, 945, 105, 'key3'), shore: () => 'beach' },
  { id: 'key4', poly: islet(-1055, 1085, 75, 'key4'), shore: () => 'mangrove' },
  { id: 'lighthouseKey', poly: islet(-1205, 1195, 70, 'key5'), shore: () => 'beach' },
];

/**
 * Corridors that must stay dry land inside the Sawgrass (road levees). Polylines with half-width.
 */
export const LEVEES: ReadonlyArray<{ line: P2[]; hw: number }> = [
  { line: [[-790, 470], [-300, 470], [200, 470], [700, 470], [1250, 470]], hw: 22 },
  { line: [[1250, 470], [1250, 1400]], hw: 24 },
  { line: [[300, 470], [380, 760], [520, 1050], [700, 1300]], hw: 16 },
  { line: [[-300, 470], [-420, 700], [-520, 930]], hw: 16 },
];

/** Sawgrass channel field: < 0.4 is water (outside levees). Deterministic. */
export function sawgrassChannels(x: number, z: number): number {
  const warp = fbm2(x * 0.004, z * 0.004, 3, 77) * 120;
  return fbm2((x + warp) * 0.0065, (z - warp) * 0.0065, 4, 911);
}

/** The Sawgrass region (south of the trail). */
export function inSawgrass(x: number, z: number): boolean {
  return z > 490 && x > -760;
}
