import { DISTRICTS, PLACE_IDS, PLACES, type DistrictId, type PlaceId, type PlaceKind } from '@/content/places';
import { LANDMASSES, WORLD_HALF } from '@/world/plan/coast';
import { PLACE_SPOTS } from '@/world/places';
import { carriageWidth, PROFILES, type RoadGraph, type RoadKind } from '@/world/roads/RoadGraph';

/**
 * Everything the 2D maps draw (the phone's Map app and the HUD minimap), as plain data in world
 * metres: +X east, −Z north. Built once from the city plan; the city never changes.
 */
export interface MapRoad {
  readonly points: ReadonlyArray<readonly [number, number]>;
  /** Carriageway width in metres. */
  readonly width: number;
  readonly kind: RoadKind;
  readonly name: string;
}

export interface MapPlace {
  readonly id: PlaceId;
  readonly name: string;
  readonly kind: PlaceKind;
  readonly district: DistrictId;
  readonly x: number;
  readonly z: number;
}

export interface MapDistrict {
  readonly id: DistrictId;
  readonly name: string;
  /** Where its label sits. */
  readonly x: number;
  readonly z: number;
  readonly color: string;
}

export interface MapData {
  /** The map spans −half…half on both axes. */
  readonly half: number;
  /** Land outlines (mainland, Isla Dorada, the Keys). Everything else is water. */
  readonly land: ReadonlyArray<ReadonlyArray<readonly [number, number]>>;
  readonly roads: readonly MapRoad[];
  readonly districts: readonly MapDistrict[];
  readonly places: readonly MapPlace[];
}

const LABELS: Readonly<Record<DistrictId, readonly [number, number]>> = {
  flats: [440, 230],
  strand: [-830, 60],
  deco: [-370, 60],
  crown: [100, -470],
  harbor: [-60, -930],
  sawgrass: [300, 720],
  isla: [-1035, -820],
  keys: [-1080, 820],
};

export function buildMapData(graph: RoadGraph): MapData {
  const roads: MapRoad[] = graph.edges.map((e) => ({
    points: e.points.map((p) => [p[0], p[1]] as const),
    width: carriageWidth(PROFILES[e.kind]),
    kind: e.kind,
    name: e.name,
  }));
  const places: MapPlace[] = PLACE_IDS.map((id) => {
    const p = PLACES[id];
    const s = PLACE_SPOTS[id];
    return { id, name: p.name, kind: p.kind, district: p.district, x: s.x, z: s.z };
  });
  const districts: MapDistrict[] = (Object.keys(LABELS) as DistrictId[]).map((id) => ({
    id, name: DISTRICTS[id].name, x: LABELS[id][0], z: LABELS[id][1], color: DISTRICTS[id].color,
  }));
  return {
    half: WORLD_HALF,
    land: LANDMASSES.map((l) => l.poly.map((p) => [p[0], p[1]] as const)),
    roads,
    districts,
    places,
  };
}
