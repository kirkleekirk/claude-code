import type { PlaceId } from '@/content/places';

/**
 * Walk-in interiors are part of the city's geometry (no loading). Each registers the box it
 * occupies so the game knows when the player is indoors: the ambience goes indoor, the camera
 * keeps tighter, rain stops landing, and the sim learns which property the player is in.
 */
export interface InteriorVolume {
  readonly place: PlaceId;
  /** A short room name for debugging and the sim ("greenhouse", "back room", "shop"). */
  readonly room: string;
  readonly minX: number;
  readonly minY: number;
  readonly minZ: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly maxZ: number;
}

export class Interiors {
  private readonly volumes: InteriorVolume[] = [];

  add(v: InteriorVolume): void {
    this.volumes.push(v);
  }

  /** The interior containing the point, if any. */
  at(x: number, y: number, z: number): InteriorVolume | null {
    for (const v of this.volumes) {
      if (x >= v.minX && x <= v.maxX && y >= v.minY && y <= v.maxY && z >= v.minZ && z <= v.maxZ) return v;
    }
    return null;
  }

  all(): readonly InteriorVolume[] {
    return this.volumes;
  }
}

/**
 * Areas the generic lot planner leaves alone because a landmark builds its own buildings there
 * (minX, minZ, maxX, maxZ in world metres, inside the surrounding streets' curbs).
 */
export const RESERVED: ReadonlyArray<{ readonly id: string; readonly rect: readonly [number, number, number, number] }> = [
  // Ofelia's Plants & Bait: the whole block east of Coconut Grove Lane on Sawgrass Trail.
  { id: 'ofelias', rect: [775, 360, 1000, 470] },
];

export function isReserved(x: number, z: number): boolean {
  for (const r of RESERVED) {
    const [x0, z0, x1, z1] = r.rect;
    if (x >= x0 && x <= x1 && z >= z0 && z <= z1) return true;
  }
  return false;
}
