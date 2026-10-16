// Ember Hollow: where everything you can buy, use or spawn from is placed.
// (Kept apart from the geometry so the numbers are easy to find and tune.)
import { LODGE_FLOOR, PLAZA_Y, PORTAL_MAIN, PORTAL_EXIT, STOCKADE_Z } from './eh_shape.js';

// Facing the Kestrel's lowered ramp across the lot.
export const PLAYER_START = { x: 14, z: 90, yaw: -0.95 };

// The Avion XV-9 "Kestrel" you flew in from Rainshadow, nose east; the exo rack is at the front
// of its cabin, up the ramp.
export const KESTREL = { x: 32, z: 84, rot: 0, floor: 1.0 };
export const EXO_STATION = { x: 36.4, z: 84, rot: -Math.PI / 2, floor: 1.0 };

const F = LODGE_FLOOR;
const Y = PLAZA_Y;

export const DOORS = [
  { id: 1, key: 'A', zones: [0, 1], cost: 750, type: 'swing', style: 'lodge', x: -42, z: 43.75, rot: 0, w: 2.6, h: 2.9, floor: F, label: 'Visitor Center' },
  { id: 2, key: 'B', zones: [0, 2], cost: 750, type: 'swing', style: 'rail', x: 18, z: STOCKADE_Z, rot: 0, w: 4.0, h: 1.6, label: 'Gem Mine Gate' },
  { id: 3, key: 'C', zones: [1, 3], cost: 1000, type: 'swing', style: 'steel', x: -45.5, z: 22.25, rot: 0, w: 1.4, h: 2.4, floor: F, label: 'Staff Exit' },
  { id: 4, key: 'D', zones: [2, 3], cost: 1000, type: 'swing', style: 'chain', x: 19.5, z: 9.8, rot: 0, w: 3.4, h: 2.4, floor: Y, label: 'Upper Trail' },
  { id: 5, key: 'E', zones: [3, 4], cost: 1250, type: 'swing', style: 'portal', x: PORTAL_MAIN.x, z: PORTAL_MAIN.z + 1.45, rot: 0, w: PORTAL_MAIN.w, h: PORTAL_MAIN.h, floor: Y, label: 'Cave Entrance' },
  { id: 6, key: 'F', zones: [3, 4], cost: 1250, type: 'blast', x: PORTAL_EXIT.x, z: PORTAL_EXIT.z + 1.0, rot: 0, w: PORTAL_EXIT.w, h: PORTAL_EXIT.h, floor: Y, label: 'Tour Exit' },
  { id: 7, key: 'G', zones: [4, 5], cost: 1500, type: 'blast', x: -39.2, z: -79.94, rot: Math.PI / 2 - 0.18, w: 4.0, h: 3.6, label: 'Staff Only' },
  { id: 8, key: 'H', zones: [5, 6], cost: 1500, type: 'debris', style: 'rocks', x: -108.5, z: -160.2, rot: 1.273, w: 5.2, h: 3.2, label: 'Clear the Rockfall' },
  { id: 9, key: 'I', zones: [5, 7], cost: 1500, type: 'blast', x: -88, z: -174, rot: 0, w: 4.4, h: 3.8, label: 'River Access' },
  { id: 10, key: 'J', zones: [6, 7], cost: 1250, type: 'debris', style: 'rocks', x: -144.3, z: -193.6, rot: -0.567, w: 5.6, h: 3.2, label: 'Clear the Rockfall' },
  { id: 11, key: 'K', zones: [7, 8], cost: 1750, type: 'blast', x: 21, z: -225.6, rot: Math.PI / 2 + 0.227, w: 7.4, h: 5.2, label: 'CALDERA' },
];

// The lodge's floor registers (zombies come up through the old heating ducts).
const LODGE_VENTS = [[-55.0, 41.6], [-45.6, 33.9], [-29.8, 42.5], [-52.6, 24.0], [-45.5, 23.4], [-29.6, 27.6]];

// [x, z, zone, type, highest floor they may stand on]
export const SPAWNERS = [
  // parking lot: out of the woods, over the fence onto the planting strips
  [-43.0, 70, 0], [-43.0, 96, 0], [-30, 104.6, 0], [-6, 104.6, 0], [20, 104.6, 0], [47.0, 101, 0], [47.0, 72, 0],
  // visitor center: up through the floor registers
  ...LODGE_VENTS.map(([x, z]) => [x, z, 1, 'vent', F + 0.3]),
  // gem mine + picnic grounds
  [10, 13, 2], [10, 57, 2], [34, 58.5, 2], [58, 59, 2], [74.5, 50, 2], [74.5, 26, 2], [56, 12.5, 2], [28, 13, 2],
  // plaza and the trail behind the lodge
  [-31, -19.5, 3], [-33, 3, 3], [-19, -21.5, 3], [8.5, -19.5, 3], [31, -19, 3], [31, 6, 3], [-40, 16.8, 3],
  // show cave: up through cracks in the floor
  [-3.4, -47, 4], [-28, -64, 4], [-21, -86, 4], [3, -61, 4], [7, -84, 4], [-3, -84.5, 4], [36, -101, 4], [52, -91, 4], [31, -50, 4],
  // Avion decline + checkpoint: out of the ducts
  [-58, -83, 5, 'vent'], [-86, -86, 5, 'vent'], [-75, -92, 5, 'vent'], [-85, -110, 5, 'vent'], [-87, -135, 5, 'vent'], [-96, -152, 5, 'vent'], [-82, -162, 5, 'vent'],
  // crystal grotto
  [-128, -165.6, 6], [-150, -166, 6], [-156, -180, 6], [-138, -184, 6], [-118, -164, 6],
  // underground river
  [-120, -212.6, 7], [-100, -212.4, 7], [-68, -216.2, 7], [-44, -219.8, 7], [-18, -222.8, 7], [4, -225.8, 7], [-90, -199.5, 7], [-88, -190, 7, 'vent'],
  // CALDERA
  [32, -214, 8], [38, -244, 8], [70, -245, 8], [77.5, -213.5, 8], [62, -205, 8, 'vent'], [34, -230, 8],
].map(([x, z, zone, type, maxY]) => ({ x, z, zone, type: type || 'ground', maxY: maxY ?? (zone === 0 ? 1.0 : zone === 2 ? 3.2 : zone === 3 ? (z > 9 ? 2.6 : Y + 0.3) : undefined) }));

export const WALLBUYS = [
  { weapon: 'owl', x: 24.07, y: 1.6, z: 65.7, rot: -Math.PI / 2 }, // back of the tour bus
  { weapon: 'wren', x: -24.53, y: 1.5, z: 37.0, rot: -Math.PI / 2, floor: F }, // snack bar, east wall
  { weapon: 'kestrel', x: 48.8, y: 1.6, z: 24.93, rot: 0 }, // pump house
  { weapon: 'shrike', x: -16.4, y: 1.6, z: -4.59, rot: 0, floor: Y }, // tour shelter
  { weapon: 'harrier', x: 1.31, y: 1.35, z: -37.5, rot: -Math.PI / 2 }, // entry tunnel supply board
  { weapon: 'osprey', x: 41.2, y: 1.35, z: -91.36, rot: 0 }, // cathedral supply board
  { weapon: 'heron', x: -88.3, y: 1.45, z: -78.33, rot: Math.PI }, // lamp house lockers
  { weapon: 'goshawk', x: -84.52, y: 1.55, z: -156, rot: -Math.PI / 2 }, // checkpoint booth
];

export const PERKS = [
  { perk: 'medic', x: 22.9, z: 87.9, rot: -Math.PI / 2, circuit: 'lot' }, // unloaded beside the ramp
  { perk: 'velocity', x: -29.0, z: 62.9, rot: 0, circuit: 'lot' },
  { perk: 'health', x: -59.07, z: 36.8, rot: Math.PI / 2, circuit: 'lodge', floor: F },
  { perk: 'reload', x: 66.0, z: 40.6, rot: -Math.PI / 2, circuit: 'mine' },
  { perk: 'slam', x: -24, z: -18.6, rot: 0.35, circuit: 'plaza', floor: Y },
  { perk: 'stabilizer', x: 46.6, z: -88.8, rot: -0.5, circuit: 'reactor' }, // the Cathedral Room
];

export const BOX_LOCATIONS = [
  { x: -53.0, z: 30.65, rot: 0, zone: 1, circuit: 'lodge', floor: F, beam: 2.6 },
  { x: 52, z: -86, rot: -Math.PI / 2, zone: 4, beam: 14 },
  { x: -133.8, z: -167.2, rot: 2.62, zone: 6, beam: 9 },
  { x: 64, z: -243.5, rot: 0, zone: 8, beam: 20 },
];
export const BOX_START = 0;

export const UPGRADE_STATION = { x: 64.5, z: -209.5, rot: Math.PI - 0.35, circuit: 'reactor' };

// Infinite Warfare style: every surface area has its own breaker.
export const POWER_SWITCHES = [
  { x: -37.28, z: 63.0, rot: Math.PI / 2, circuit: 'lot', style: 'breaker', prompt: 'Throw the parking lot breaker', sign: ['LOT LIGHTING', 'PANEL L-1'] },
  { x: -59.5, z: 28.4, rot: Math.PI / 2, circuit: 'lodge', style: 'breaker', prompt: 'Throw the visitor center breaker', sign: ['VISITOR CENTER', 'MAIN PANEL'], floor: F },
  { x: 46.8, z: 22.2, rot: -Math.PI / 2, circuit: 'mine', style: 'breaker', prompt: 'Throw the gem mine breaker', sign: ['GEM MINE', 'FLUME PUMP'] },
  { x: -9.0, z: -16.37, rot: Math.PI, circuit: 'plaza', style: 'breaker', prompt: 'Throw the cave entrance breaker', sign: ['CAVE ENTRANCE', 'LIGHTING'], floor: Y },
];

// The CALDERA control console (the reactor's "power switch") and the staff elevator.
export const REACTOR_CONSOLE = { x: 77.55, z: -224, rot: Math.PI / 2, floor: -65.1 };
export const ELEVATOR = {
  top: { x: -27.15, z: 25.2, rot: -Math.PI / 2, zone: 1, floor: F },
  bottom: { x: 54, z: -199.6, rot: Math.PI, zone: 8 },
};
