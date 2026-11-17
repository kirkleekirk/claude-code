import type { RivalId } from './ids';
import type { DistrictId, PlaceId } from './places';

/**
 * Territory: 31 turfs across the districts. The world gives each turf a polygon on the map; the
 * sim tracks influence per faction. `anchor` is the place a dealer works from.
 */

export const TURF_IDS = [
  'flatsCuldesacs', 'flatsPlaza', 'flatsPark', 'flatsGolf', 'flatsTrail',
  'strandPier', 'strandSkate', 'strandNorth', 'strandSouth', 'strandTiki',
  'decoFlamingo', 'decoPromenade', 'decoPools', 'decoDiner',
  'crownPlaza', 'crownArena', 'crownTowers', 'crownCourt',
  'harborQuay', 'harborMarket', 'harborYard', 'harborCauseway',
  'sawAnnies', 'sawStilts', 'sawRamp', 'sawDeep',
  'islaMarina', 'islaClub', 'islaEstates',
  'keysLighthouse', 'keysShacks',
] as const;
export type TurfId = (typeof TURF_IDS)[number];

export interface TurfDef {
  readonly id: TurfId;
  readonly name: string;
  readonly district: DistrictId;
  readonly anchor: PlaceId;
  /** Customers per hour a dealer can serve here at skill 3. */
  readonly traffic: number;
  /** Faction that starts with a foothold, and how strong. */
  readonly rival: RivalId | null;
  readonly rivalStart: number;
}

const t = (d: TurfDef): TurfDef => d;

export const TURFS: Readonly<Record<TurfId, TurfDef>> = {
  flatsCuldesacs: t({ id: 'flatsCuldesacs', name: 'The Cul-de-sacs', district: 'flats', anchor: 'palmettoPark', traffic: 5, rival: null, rivalStart: 0 }),
  flatsPlaza: t({ id: 'flatsPlaza', name: 'Palmetto Plaza', district: 'flats', anchor: 'palmettoPlaza', traffic: 7, rival: 'zenith', rivalStart: 8 }),
  flatsPark: t({ id: 'flatsPark', name: 'Gator Pond Park', district: 'flats', anchor: 'palmettoPark', traffic: 5, rival: null, rivalStart: 0 }),
  flatsGolf: t({ id: 'flatsGolf', name: 'Gator Golf Strip', district: 'flats', anchor: 'gatorGolf', traffic: 6, rival: null, rivalStart: 0 }),
  flatsTrail: t({ id: 'flatsTrail', name: 'Sawgrass Trail', district: 'flats', anchor: 'starlite', traffic: 4, rival: 'mudflaps', rivalStart: 10 }),
  strandPier: t({ id: 'strandPier', name: 'Pier 9', district: 'strand', anchor: 'pier9', traffic: 10, rival: 'zenith', rivalStart: 12 }),
  strandSkate: t({ id: 'strandSkate', name: 'Skate Park', district: 'strand', anchor: 'skatePark', traffic: 8, rival: null, rivalStart: 0 }),
  strandNorth: t({ id: 'strandNorth', name: 'North Boardwalk', district: 'strand', anchor: 'boardwalk', traffic: 9, rival: 'zenith', rivalStart: 10 }),
  strandSouth: t({ id: 'strandSouth', name: 'South Beach Shacks', district: 'strand', anchor: 'surfShack', traffic: 7, rival: null, rivalStart: 0 }),
  strandTiki: t({ id: 'strandTiki', name: 'Tiki Row', district: 'strand', anchor: 'leakyTiki', traffic: 8, rival: null, rivalStart: 0 }),
  decoFlamingo: t({ id: 'decoFlamingo', name: 'Flamingo Court', district: 'deco', anchor: 'flamingoCourt', traffic: 7, rival: 'vale', rivalStart: 10 }),
  decoPromenade: t({ id: 'decoPromenade', name: 'The Promenade', district: 'deco', anchor: 'dripTide', traffic: 8, rival: 'zenith', rivalStart: 18 }),
  decoPools: t({ id: 'decoPools', name: 'Rooftop Pools', district: 'deco', anchor: 'rooftopPool', traffic: 6, rival: 'zenith', rivalStart: 22 }),
  decoDiner: t({ id: 'decoDiner', name: 'Diner Corner', district: 'deco', anchor: 'chromePelican', traffic: 6, rival: null, rivalStart: 0 }),
  crownPlaza: t({ id: 'crownPlaza', name: 'Crown Plaza', district: 'crown', anchor: 'crownPlaza', traffic: 9, rival: 'zenith', rivalStart: 25 }),
  crownArena: t({ id: 'crownArena', name: 'Arena Lots', district: 'crown', anchor: 'arena', traffic: 8, rival: 'vale', rivalStart: 12 }),
  crownTowers: t({ id: 'crownTowers', name: 'The Towers', district: 'crown', anchor: 'crownTower', traffic: 7, rival: 'zenith', rivalStart: 30 }),
  crownCourt: t({ id: 'crownCourt', name: 'Courthouse Steps', district: 'crown', anchor: 'pinkertonLaw', traffic: 5, rival: 'vale', rivalStart: 15 }),
  harborQuay: t({ id: 'harborQuay', name: 'The Quay', district: 'harbor', anchor: 'casaVale', traffic: 6, rival: 'vale', rivalStart: 45 }),
  harborMarket: t({ id: 'harborMarket', name: 'Fish Market', district: 'harbor', anchor: 'fishMarket', traffic: 7, rival: 'vale', rivalStart: 40 }),
  harborYard: t({ id: 'harborYard', name: 'Container Yard', district: 'harbor', anchor: 'containerYard', traffic: 4, rival: 'vale', rivalStart: 50 }),
  harborCauseway: t({ id: 'harborCauseway', name: 'Causeway Foot', district: 'harbor', anchor: 'causeway', traffic: 5, rival: 'vale', rivalStart: 30 }),
  sawAnnies: t({ id: 'sawAnnies', name: 'Annie’s Landing', district: 'sawgrass', anchor: 'airboatAnnies', traffic: 4, rival: 'mudflaps', rivalStart: 30 }),
  sawStilts: t({ id: 'sawStilts', name: 'Stilt Row', district: 'sawgrass', anchor: 'stiltHouse', traffic: 3, rival: 'mudflaps', rivalStart: 35 }),
  sawRamp: t({ id: 'sawRamp', name: 'Mudbank Ramp', district: 'sawgrass', anchor: 'boatRamp', traffic: 3, rival: 'mudflaps', rivalStart: 40 }),
  sawDeep: t({ id: 'sawDeep', name: 'The Gator Hole', district: 'sawgrass', anchor: 'gatorHole', traffic: 4, rival: 'mudflaps', rivalStart: 55 }),
  islaMarina: t({ id: 'islaMarina', name: 'Dorada Marina', district: 'isla', anchor: 'marina', traffic: 5, rival: 'zenith', rivalStart: 20 }),
  islaClub: t({ id: 'islaClub', name: 'Yacht Club', district: 'isla', anchor: 'yachtClub', traffic: 5, rival: 'vale', rivalStart: 20 }),
  islaEstates: t({ id: 'islaEstates', name: 'The Estates', district: 'isla', anchor: 'penthouse', traffic: 4, rival: 'zenith', rivalStart: 25 }),
  keysLighthouse: t({ id: 'keysLighthouse', name: 'Lighthouse Point', district: 'keys', anchor: 'lighthouse', traffic: 3, rival: 'mudflaps', rivalStart: 20 }),
  keysShacks: t({ id: 'keysShacks', name: 'Crab Shack Row', district: 'keys', anchor: 'crabShack', traffic: 4, rival: 'mudflaps', rivalStart: 15 }),
};

export function turfsIn(district: DistrictId): TurfDef[] {
  return TURF_IDS.map((id) => TURFS[id]).filter((d) => d.district === district);
}
