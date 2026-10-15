import { makeNoise2D } from '../util.js';

// Shared shape helpers for Ember Hollow (kept tiny so layout and builders can both use them).
export const ehNoise = makeNoise2D(1931);
export const PLAZA_Y = 4.5;
export const LODGE_FLOOR = 1.6;

// The foot of the cliff behind the plaza (z, varying with x).
export function cliffZ(x) {
  return -24 - 2.2 * ehNoise.fbm(x / 16 + 3, 1.7, 3) - 0.02 * Math.max(0, Math.abs(x) - 40) * 6;
}

export const PORTAL_MAIN = { x: 0, w: 3.8, h: 3.7 };
export const PORTAL_EXIT = { x: 25.5, w: 3.6, h: 3.4 };
PORTAL_MAIN.z = cliffZ(PORTAL_MAIN.x);
PORTAL_EXIT.z = cliffZ(PORTAL_EXIT.x);

// The visitor center lodge: floor raised on a river-rock foundation, log walls, shake roof.
// Edges sit on the 2 m terrain grid so the raised floor and the ground meet cleanly.
export const LODGE = { x0: -60, x1: -24, z0: 22, z1: 44, floor: LODGE_FLOOR, ceil: LODGE_FLOOR + 4.4, wall: 0.5 };
export const PORCH = { x0: -52, x1: -32, z0: 44, z1: 49.5 };
// interior partitions: the service strip along the back (north) wall
export const LODGE_BACK = 30;

// The parking lot (y = 0) and the walk up to the porch.
export const LOT = { x0: -44, x1: 48, z0: 62, z1: 106 };
export const WALKWAY = { x0: -44, x1: -40, z0: 49.5, z1: 62.2 };

// The plaza in front of the caves sits on retaining walls 2 m thick (they hide the terrain's
// 2 m grid step); the stairs come up through the south wall.
export const PLAZA = { x0: -34, x1: 32, z1: 8, wall: 2, parapet: 0.4 };
export const STAIRS_W = { x: -30.5, z0: 10, z1: 16.6, w: 3.4 };
export const STAIRS_E = { x: 19.5, z0: 10, z1: 16.6, w: 3.4 };

// The gem mine (picnic grounds) and its log stockade.
export const MINE = { x0: 8, x1: 76, z0: 10, z1: 60 };
export const STOCKADE_Z = 61.2;

// Is (x,z) in front of a cave portal, where the cliff is cut back to the plaza level?
export function portalNotch(x, z) {
  for (const p of [PORTAL_MAIN, PORTAL_EXIT]) {
    if (Math.abs(x - p.x) < 3.2 && z > p.z - 1.3 && z < p.z + 3) return true;
  }
  return false;
}

// The creek comes down from the north, runs through the picnic grounds and leaves east.
export const CREEK = [[71, -4], [67, 8], [60, 18], [52, 27], [48, 36], [51, 45], [61, 52], [74, 57.5], [84, 60]];

// The gravel trail from the lodge's back door to the foot of the plaza's west stairs.
export const TRAIL = [[-45.5, 21.6], [-45.5, 19.2], [-41, 17.6], [-34, 17.4], [STAIRS_W.x, STAIRS_W.z1 + 0.2]];

// Under the mountain: Mirror Lake in the Grand Gallery, the CALDERA's magma pit, the river.
export const MIRROR_LAKE = { x: -25, z: -70, r: 7.5, y: -4.4 };
export const PIT = { x: 52, z: -232, r: 12.5, lava: -91 };
export const RIVER = { pts: [[-132, -210], [-100, -209], [-70, -213], [-40, -217], [-10, -221], [16, -225]] };
// footbridges across the river (x where they cross, deck width)
export const RIVER_BRIDGES = [{ x: -90, w: 2.4 }];
// where the river rises and where it sinks (x)
export const RIVER_HEAD = -122;
export const RIVER_SINK = 8;
