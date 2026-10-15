import * as rainshadow from './map_rainshadow.js';
import * as emberhollow from './map_emberhollow.js';

// Every playable map. Each module exports the same shape: INFO, TERRAIN, ZONES, DOORS, SPAWNERS,
// buyables, height/zone functions and a build(builder, ctx) that places its structures.
export const MAPS = { rainshadow, emberhollow };
export const MAP_IDS = Object.keys(MAPS);
export const DEFAULT_MAP = 'rainshadow';

export function getMap(id) {
  return MAPS[id] || MAPS[DEFAULT_MAP];
}
