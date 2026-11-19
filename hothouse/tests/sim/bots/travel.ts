import { PLACES, type DistrictId, type PlaceId } from '@/content/places';

/**
 * A coarse travel model of Halcyon Bay for the economy bots: district centres on the 2.8 km map
 * (DESIGN.md §2), an average door-to-door driving speed, and parking/walking overhead. Crossing the
 * whole city takes about 90 seconds, matching the brief.
 */

const CENTRE: Readonly<Record<DistrictId, readonly [number, number]>> = {
  flats: [520, 120],
  strand: [-850, 0],
  deco: [-560, -40],
  crown: [420, -520],
  harbor: [100, -820],
  sawgrass: [0, 760],
  isla: [-920, -660],
  keys: [-1100, 920],
};

const SPEED = 24;
const OVERHEAD = 9;
const SAME_DISTRICT = 16;

export function districtOf(place: PlaceId): DistrictId {
  return PLACES[place].district;
}

/** Seconds to get from one named place to another. */
export function travelSeconds(from: PlaceId, to: PlaceId): number {
  if (from === to) return 0;
  const a = districtOf(from);
  const b = districtOf(to);
  if (a === b) return SAME_DISTRICT;
  const [ax, az] = CENTRE[a];
  const [bx, bz] = CENTRE[b];
  // Water crossings (Isla, Keys) route over bridges: a little longer than straight-line.
  const detour = a === 'isla' || b === 'isla' || a === 'keys' || b === 'keys' ? 1.25 : 1.1;
  return Math.round((Math.hypot(bx - ax, bz - az) * detour) / SPEED + OVERHEAD);
}
