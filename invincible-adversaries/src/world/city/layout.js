// Destroyed Chicago: the payload map's layout. Metres; x runs east, z runs south, y is up.
// The route follows the hand-drawn plan: north up State Street, east into the old station, south
// down its concourse and across the Great Hall, out through the blasted east wall and around the
// crater Omni-Man punched into the Loop, to the last point under the Wabash L.

export const BOUNDS = { minX: -110, maxX: 126, minZ: -62, maxZ: 100 };
export const CEILING = 88;

// ---------------------------------------------------------------- the crater
export const CRATER = { x: 24.3, z: 27.2, R: 51, depth: 9.5, pit: { x: 9, z: 42.6, r: 20, depth: 13 } };

// ---------------------------------------------------------------- payload route
// waypoints; the crater stretch is smoothed into a curve by the map. A and B are checkpoints.
export const ROUTE = [
  [-96.6, 66], // start: south end of State Street
  [-96.6, -10], // A: State Street, under the theatre's sign
  [-96.6, -41.6], // State & Adams
  [-63, -41.6], // through the station's west portal
  [-63, 46.4], // down the concourse
  [-26.2, 46.4], // B: out of the Great Hall's blasted east wall, on the crater's rim
  [-10.2, 19.2], [5.8, 9.6], [25, 8], [44.2, 11.2], [63.4, 22.4], [76.2, 32],
  [92.2, 40], // the last point, under the Wabash L
];
export const CHECKPOINTS = [1, 5, ROUTE.length - 1];

// spawn rooms per phase (0: to A, 1: to B, 2: to the end): centre, spread, and the box enemies
// can't stay in
// (door: the room's open side, where setup holds the attackers in)
export const SPAWNS = {
  attack: [
    { at: [-96.6, 93], spread: 6, room: [-109, 85, -84, 100], door: 'z0' },
    { at: [-91, -55], spread: 4, room: [-100, -60, -82, -49], door: 'z1' },
    { at: [-42, 8], spread: 5, room: [-54, 2, -31, 15], door: 'z1' },
  ],
  defend: [
    { at: [-91, -55], spread: 4, room: [-100, -60, -82, -49], door: 'z1' },
    { at: [-42, 8], spread: 5, room: [-54, 2, -31, 15], door: 'z1' },
    { at: [111, 13], spread: 4, room: [104, 2, 116, 24], door: 'x0' },
  ],
};

export const ORBS = [[-87.5, 20], [-106, -22], [-63.5, 4], [-45, 36], [2, -30], [48, 68], [86, -6], [88, 70], [-80, -44]];

// ---------------------------------------------------------------- buildings
// footprint [x0, z0, x1, z1], height h, facade style, top: intact | broken | sheared | collapsed,
// optional setbacks [[y, inset]], cavity (a room carved into the ground floor), holes (smashed
// through), sign (the Chicago Theatre marquee)
export const STYLES = ['glass', 'black', 'stone', 'brick', 'terracotta', 'concrete', 'deco'];
export const BUILDINGS = [
  // west wall of the map: State Street's west side
  { id: 'W1', box: [-140, -96, -109.6, -52], h: 165, style: 'black', top: 'intact', crown: 'antenna' },
  { id: 'W2', box: [-138, -52, -109.6, -12], h: 128, style: 'stone', top: 'broken', setbacks: [[96, 3]] },
  { id: 'W3', box: [-142, -12, -109.6, 34], h: 190, style: 'glass', top: 'sheared', holes: [[-109.6, 8, 52, 7]] },
  { id: 'W4', box: [-136, 34, -109.6, 70], h: 112, style: 'terracotta', top: 'broken' },
  { id: 'W5', box: [-140, 70, -109.6, 132], h: 150, style: 'deco', top: 'intact', setbacks: [[92, 4], [124, 5]], crown: 'spire' },
  // south wall (State Street dead-ends at S5; S1 sits behind the station)
  { id: 'S5', box: [-120, 104, -84, 136], h: 122, style: 'stone', top: 'broken' },
  { id: 'S6', box: [-84, 100, -28, 138], h: 96, style: 'brick', top: 'intact' },
  { id: 'S1', box: [-70, 64, -28, 100], h: 34, style: 'brick', top: 'collapsed' },
  { id: 'S2', box: [-28, 84, 20, 134], h: 108, style: 'glass', top: 'broken', holes: [[0, 84, 40, 9]] },
  { id: 'S3', box: [20, 86, 62, 136], h: 112, style: 'black', top: 'intact', crown: 'antenna' },
  { id: 'S4', box: [62, 82, 81, 134], h: 94, style: 'stone', top: 'sheared' },
  { id: 'S7', box: [104, 98, 152, 140], h: 124, style: 'concrete', top: 'intact' },
  // east wall, beyond Wabash and the L
  { id: 'E1', box: [104, -52, 126, -8], h: 90, style: 'concrete', top: 'broken' },
  { id: 'E2', box: [104, -8, 126, 34], h: 68, style: 'brick', top: 'broken', cavity: [104, 2, 116, 24, 6] },
  { id: 'E3', box: [104, 34, 126, 98], h: 100, style: 'glass', top: 'sheared' },
  { id: 'E4', box: [126, -96, 160, -10], h: 142, style: 'glass', top: 'intact' },
  { id: 'E5', box: [126, -10, 158, 50], h: 104, style: 'stone', top: 'intact', setbacks: [[80, 3]] },
  { id: 'E6', box: [126, 50, 162, 98], h: 172, style: 'deco', top: 'broken', setbacks: [[110, 4], [140, 4]] },
  // north wall, beyond Adams Street and the north L
  { id: 'N1', box: [-110, -92, -52, -48.6], h: 74, style: 'black', top: 'intact', cavity: [-100, -60, -82, -48.6, 6] },
  { id: 'N2', box: [-52, -92, -28, -48.6], h: 116, style: 'stone', top: 'broken' },
  { id: 'N5', box: [-28, -96, 30, -52], h: 122, style: 'glass', top: 'broken', holes: [[2, -52, 46, 10]] },
  { id: 'N3', box: [30, -96, 80, -52], h: 156, style: 'black', top: 'intact', crown: 'antenna' },
  { id: 'N4', box: [80, -96, 126, -52], h: 106, style: 'terracotta', top: 'broken' },
  // the block east of State Street (the theatre's vertical CHICAGO sign faces the street)
  { id: 'B1', box: [-83.6, -34.6, -74, -8], h: 46, style: 'stone', top: 'broken' },
  { id: 'B2', box: [-83.6, -3, -74, 30], h: 64, style: 'terracotta', top: 'intact', sign: { x: -83.6, z: 13, y0: 7, y1: 25 } },
  { id: 'B3', box: [-83.6, 35, -74, 70], h: 38, style: 'brick', top: 'collapsed' },
  { id: 'B4', box: [-83.6, 75, -74, 100], h: 56, style: 'concrete', top: 'broken' },
  // the station's north office block over the concourse's north end (spawn lobby into the hall)
  { id: 'O1', box: [-56, -48.6, -28, 16], h: 80, style: 'deco', top: 'broken', setbacks: [[52, 3]], cavity: [-54, 2, -31, 16, 6] },
  // around the crater
  { id: 'C5', box: [75, 58, 91, 82], h: 46, style: 'concrete', top: 'collapsed' },
];

// the old station: concourse down its west side, Great Hall beside it
export const STATION = {
  box: [-70, -48.6, -28, 64],
  concourse: { x0: -69, x1: -57, z0: -47.6, z1: 63, roof: 14 },
  hall: { x0: -56, x1: -29, z0: 16, z1: 63, spring: 20, crown: 27 },
  portal: { z0: -46, z1: -37, h: 9.5 }, // west portal off Adams Street (the payload's way in)
  doors: [[-7, -3.5], [31, 34]], // west doors off the alley
  breach: { z0: 39.5, z1: 53.5, h: 11 }, // the east wall, blown into the crater
  columns: [18, 26, 34, 42, 51, 59], // colonnade between concourse and hall (z)
};

// the elevated L: Lake Street line along the north, Wabash line down the east, junction at the NE
export const L_TRACK = {
  deck: 7.6, depth: 1.1, // bottom of the deck, thickness
  north: { z: -42, x0: -26, x1: 103, w: 10 },
  east: { x: 98, z0: -47, z1: 102, w: 10 },
  bentEvery: 13,
  broken: { x0: 10, x1: 32 }, // the span that fell into the crater (one end down on the rim)
  station: { z0: -30, z1: -10 }, // Wabash platform canopies
};

// cover and wreckage: [kind, x, z, rotation(0|1: along x / along z), extra]
export const PROPS = [
  // State Street
  ['bus', -101.5, 30, 1, { tipped: true }], ['car', -92, 52, 1], ['car', -90.5, 40, 1, { burnt: true }], ['taxi', -103, 10, 1],
  ['car', -92.4, -2, 1, { burnt: true, flipped: true }], ['car', -100.6, -16, 1], ['barrier', -102, -27, 0], ['barrier', -91, -27, 0],
  ['car', -104, 70, 1], ['police', -89.5, 78, 1], ['taxi', -98, 84, 0, { burnt: true }],
  ['rubble', -104.2, -29, 0, { w: 9.5, d: 12, h: 4.2 }],
  // Adams Street
  ['car', -86, -45.2, 0, { burnt: true }], ['police', -77, -37.6, 0], ['barrier', -74, -46.1, 0],
  // concourse and hall
  ['booth', -66.6, -20, 1], ['booth', -66.6, 8, 1], ['bench', -59.4, -30, 1], ['bench', -59.4, -6, 1],
  ['benches', -46, 26, 0], ['benches', -46, 34, 0], ['benches', -38, 26, 0], ['benches', -38, 34, 0], ['benches', -46, 56, 0], ['benches', -38, 56, 0],
  ['rubble', -36, 38.6, 0, { w: 5, d: 3.4, h: 1.2 }],
  // the crater
  ['slab', -6, 34, 0, { w: 7, d: 5, h: 2.2 }], ['slab', 18, 54, 1, { w: 6, d: 9, h: 3 }], ['slab', 40, 40, 0, { w: 8, d: 4, h: 2 }],
  ['car', 30, 20, 0, { burnt: true, flipped: true }], ['slab', 58, 50, 1, { w: 5, d: 7, h: 2.5 }], ['car', 52, 6, 1, { burnt: true }],
  ['slab', 6, -6, 0, { w: 6, d: 4, h: 1.6 }], ['slab', 66, 4, 1, { w: 4, d: 6, h: 2 }],
  // under the north L and Wabash
  ['car', -12, -30, 0, { burnt: true }], ['bus', 46, -32, 0, { burnt: true }], ['car', 70, -38, 0], ['taxi', 86, -30, 1, { flipped: true }],
  ['rubble', 71, -15, 0, { w: 13, d: 18, h: 5.5 }], ['car', 88, 18, 1, { burnt: true }], ['police', 97.6, 63, 1], ['barrier', 89.5, 29.4, 0], ['car', 85, 86, 1],
];

// burning things: [x, y, z, size]
export const FIRES = [
  [-90.5, 1.2, 40, 1], [-94.5, 0.6, -2, 0.8], [-86, 0.9, -45, 0.9], [30, -6.4, 20, 1.1], [52, -5.6, 6, 0.9], [9, -17, 42, 2.4],
  [46, 1.4, -32, 1.2], [88, 1, 18, 0.9], [-36, 1.2, 38.6, 0.8], [-98, 0.8, 84, 0.8], [12, -12, 36, 1.6], [2, -14, 48, 1.4],
];
