import type { DistrictId } from '@/content/places';
import { ISLA } from './cityPlan';

/**
 * Which district a ground position belongs to. District edges follow the street plan in
 * DESIGN.md §2; water belongs to the nearest shore's district.
 */
export function districtAt(x: number, z: number): DistrictId {
  const ix = (x - ISLA.x) / 330, iz = (z - ISLA.z) / 270;
  if (ix * ix + iz * iz < 1) return 'isla';
  if (z > 470) return x < -880 ? 'keys' : 'sawgrass';
  if (z < -700 || (x > -150 && z < -230 && x > 700)) return 'harbor';
  if (x >= -150 && z < -230) return 'crown';
  if (x < -615) return 'strand';
  if (x < -125) return z < -360 ? 'harbor' : 'deco';
  return 'flats';
}
