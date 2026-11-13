// Tile vocabularies shared by worldgen, validator, renderer and action mode.

export const T = { WATER: 0, SAND: 1, DIRT: 2, GRASS: 3, MARSH: 4, ROCK: 5, RUBBLE: 6, FIELD: 7, CLIFF: 8 };
export const T_NAMES = ['water', 'sand', 'dirt', 'grass', 'marsh', 'rock', 'rubble', 'field', 'cliff'];
// Autotile priority: higher terrain overlays its edges onto lower neighbours.
export const T_PRIORITY = [0, 2, 3, 4, 1, 6, 5, 3.5, 7];

export const F = { NONE: 0, PLANK: 1, STONE: 2, TILE: 3, CONCRETE: 4, DIRTFLOOR: 5, COBBLE: 6, RAIL: 7, RUBBLEFLOOR: 8, SOIL: 9, ASPHALT: 10, TRACK: 11 };
export const F_BY_NAME = { plank: 1, stone: 2, tile: 3, concrete: 4, dirtfloor: 5, cobble: 6, rail: 7, rubblefloor: 8, rubble: 8, soil: 9, asphalt: 10, track: 11 };

// Collision: 0 free | 1 full (blocks move, bullets, sight) | 2 low (move+bullets) | 3 water (move) | 4 fence (move)
export const SOLID = { FREE: 0, FULL: 1, LOW: 2, WATER: 3, FENCE: 4 };

// Structure pieces (render + rules).
export const ST = { NONE: 0, WALL: 1, TOWER: 2, GATE: 3, BWALL: 4, DOOR: 5, FENCE: 6, BROKEN: 7 };

export const blocksMove = (s) => s !== 0;
export const blocksShot = (s) => s === 1 || s === 2;
export const blocksSight = (s) => s === 1;
