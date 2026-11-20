import { PLACE_IDS, type PlaceId } from '@/content/places';

/**
 * Where each named place is in Halcyon Bay: the point people meet at (street-side, on a
 * boardwalk or in a car park), the way its entrance faces, and the radius within which the player
 * counts as "there". The sim refers to places by id only; the world resolves them here.
 */
export interface PlaceSpot {
  readonly x: number;
  readonly z: number;
  /** Facing of the entrance (yaw, 0 faces −Z): a customer waiting here looks this way. */
  readonly yaw: number;
  readonly radius: number;
}

const N = 0;
const S = Math.PI;
const W = Math.PI / 2;
const E = -Math.PI / 2;

export const PLACE_SPOTS: Readonly<Record<PlaceId, PlaceSpot>> = {
  // ── Palmetto Flats (grid x −125…1000, z 0…470) ─────────────────────────────
  ofelias: { x: 860, z: 462, yaw: S, radius: 26 },
  palmettoGarage: { x: 250, z: 456, yaw: S, radius: 14 },
  sudsyFlamingo: { x: 900, z: 14, yaw: N, radius: 18 },
  sodAlmighty: { x: 566, z: 300, yaw: W, radius: 20 },
  mamaYolis: { x: 305, z: 131, yaw: N, radius: 12 },
  mangroveMart: { x: -110, z: 455, yaw: S, radius: 14 },
  palmettoPlaza: { x: 660, z: 60, yaw: N, radius: 40 },
  palmettoPark: { x: 100, z: 300, yaw: N, radius: 45 },
  gatorGolf: { x: 437, z: 180, yaw: N, radius: 45 },
  starlite: { x: 1080, z: 200, yaw: W, radius: 60 },
  theLot: { x: 437, z: 418, yaw: S, radius: 50 },
  // ── Neon Strand (the beach, boardwalk and pier, x < −615) ─────────────────
  boardwalk: { x: -815, z: -60, yaw: W, radius: 30 },
  skatePark: { x: -805, z: 300, yaw: W, radius: 28 },
  pier9: { x: -880, z: 0, yaw: W, radius: 30 },
  strandBeach: { x: -860, z: 160, yaw: W, radius: 50 },
  surfShack: { x: -805, z: -230, yaw: W, radius: 16 },
  tacoTsunami: { x: -790, z: 110, yaw: W, radius: 12 },
  leakyTiki: { x: -812, z: -170, yaw: W, radius: 16 },
  // ── Deco Row (x −615…−125) ────────────────────────────────────────────────
  chromePelican: { x: -439, z: 60, yaw: W, radius: 14 },
  flamingoCourt: { x: -298, z: -180, yaw: E, radius: 18 },
  rooftopPool: { x: -540, z: -60, yaw: N, radius: 20 },
  dripTide: { x: -439, z: -60, yaw: W, radius: 12 },
  clubAftersun: { x: -439, z: 200, yaw: W, radius: 16 },
  // ── Crown Point (x −125…325, z −700…−240) ──────────────────────────────────
  pinkertonLaw: { x: 100, z: -342, yaw: N, radius: 14 },
  firstCoastal: { x: 175, z: -467, yaw: N, radius: 14 },
  crownPlaza: { x: 100, z: -520, yaw: N, radius: 40 },
  arena: { x: 250, z: -640, yaw: N, radius: 60 },
  crownTower: { x: 100, z: -640, yaw: N, radius: 30 },
  zenithStudio: { x: -60, z: -400, yaw: N, radius: 14 },
  // ── Cobalt Harbor (north waterfront) ──────────────────────────────────────
  fishMarket: { x: -200, z: -760, yaw: N, radius: 24 },
  containerYard: { x: 0, z: -900, yaw: N, radius: 60 },
  casaVale: { x: -250, z: -712, yaw: N, radius: 16 },
  dexGarage: { x: -160, z: -480, yaw: W, radius: 16 },
  bigShellMarine: { x: -300, z: -790, yaw: N, radius: 18 },
  harborWarehouse: { x: 100, z: -850, yaw: N, radius: 30 },
  causeway: { x: -400, z: -820, yaw: W, radius: 60 },
  // ── Isla Dorada ───────────────────────────────────────────────────────────
  yachtClub: { x: -1150, z: -900, yaw: W, radius: 30 },
  marina: { x: -1180, z: -760, yaw: W, radius: 40 },
  penthouse: { x: -1030, z: -820, yaw: N, radius: 20 },
  // ── The Sawgrass (south of the trail) ─────────────────────────────────────
  airboatAnnies: { x: 300, z: 560, yaw: S, radius: 25 },
  gatorHole: { x: 600, z: 640, yaw: S, radius: 20 },
  boatRamp: { x: 100, z: 530, yaw: S, radius: 20 },
  stiltHouse: { x: 750, z: 620, yaw: S, radius: 20 },
  // ── Saltwater Keys ────────────────────────────────────────────────────────
  lighthouse: { x: -1150, z: 900, yaw: N, radius: 30 },
  crabShack: { x: -1000, z: 620, yaw: N, radius: 16 },
};

/** The named place the point (x, z) is at, if any (the nearest whose radius contains it). */
export function placeAt(x: number, z: number): PlaceId | null {
  let best: PlaceId | null = null;
  let bestD = Infinity;
  for (const id of PLACE_IDS) {
    const s = PLACE_SPOTS[id];
    const d = Math.hypot(x - s.x, z - s.z);
    if (d <= s.radius && d < bestD) {
      best = id;
      bestD = d;
    }
  }
  return best;
}
