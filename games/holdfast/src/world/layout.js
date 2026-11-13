// Map plan for Bridger County: rolling farm hills far out west, the land
// around Carver's Crossing and Turkey Creek in the middle, the river town of
// Harlan's Landing in the east, the river beyond its floodwall.
// All structure lots sit on the global 2 m building grid.
import { FARM_SHIFT } from './terrain.js';

// The farm country was laid out on the old, smaller map; W() moves an x from
// there out to where it sits now (FARM_SHIFT further west).
export const W = (x) => x - FARM_SHIFT;
const WP = ([x, z]) => [W(x), z];

export const TOWN_NAME = "Harlan's Landing";

// Town street grid. Asphalt rects and sidewalk rects (x0, z0, x1, z1).
export const STREETS = {
  ns: [
    { name: 'Fountain St', x0: 80, x1: 88, z0: -134, z1: 134, walk: 4 },
    { name: 'Spanish St', x0: 124, x1: 132, z0: -134, z1: 134, walk: 4 },
    { name: 'Water St', x0: 172, x1: 182, z0: -134, z1: 134, walk: 4 },
  ],
  ew: [
    { name: 'Themis St', z0: -72, z1: -64, x0: 66, x1: 186, walk: 4 },
    { name: 'Main St', z0: -6, z1: 6, x0: 66, x1: 190, walk: 4 },
    { name: 'Broadway', z0: 64, z1: 72, x0: 66, x1: 186, walk: 4 },
  ],
  // asphalt lots (no markings)
  lots: [
    { x0: 140, z0: -56, x1: 166, z1: -36 }, { x0: 96, z0: -56, x1: 118, z1: -36 },
    { x0: 140, z0: 36, x1: 166, z1: 56 }, { x0: 96, z0: 36, x1: 118, z1: 56 },
  ],
};

// Roads outside town: centreline polylines (x, z); type: 'paved' | 'gravel'
export const ROADS = [
  {
    name: 'Highway 34', type: 'paved', width: 7.4, townEnd: true,
    pts: [[W(-330), 26], [W(-270), 30], [W(-215), 20], [W(-165), 30], [W(-120), 38], [W(-70), 26],
      // across the new land: through Carver's Crossing, over Turkey Creek
      [-650, 18], [-590, 8], [-530, 3], [-470, 2], [-410, 5], [-350, 13], [-290, 17], [-230, 13], [-160, 6], [-90, 9],
      [-20, 12], [20, 4], [48, 0], [66, 0]],
  },
  {
    name: 'County Road 210', type: 'gravel', width: 5.2,
    pts: [[-150, -262], [-151, -180], [-149, -100], [-150, -20], [-150, 30], [-151, 100], [-149, 180], [-150, 262]].map(WP),
  },
  {
    // leaves the highway (its first point is pinned to it when the world is built)
    name: 'Price Lane', type: 'gravel', width: 4.6, from: 'Highway 34',
    pts: [[-32, 12], [-36, -30], [-48, -70], [-57, -100], [-58, -112]].map(WP),
  },
  {
    name: 'Dekker Road', type: 'gravel', width: 4.6,
    pts: [[-150, 128], [-190, 130], [-226, 126], [-270, 132], [-330, 128]].map(WP),
  },
  {
    name: 'Bluff Road', type: 'paved', width: 6.6, townStart: true,
    pts: [[128, -134], [126, -160], [112, -192], [80, -214], [30, -226], [-40, -224], [-120, -217], [-200, -213], [-280, -213], [-360, -207], [-430, -199],
      [-470, -196], [-550, -203], [-610, -214], [W(-30), -222], [W(-90), -206], [W(-149), -200]],
  },
  {
    name: 'River Road', type: 'gravel', width: 5, townStart: true,
    pts: [[84, 134], [82, 160], [70, 190], [40, 222], [0, 240], [-80, 243], [-170, 240], [-250, 237], [-330, 236], [-410, 239], [-470, 241],
      [-560, 243], [-620, 245], [W(-60), 246], [W(-149), 240]],
  },
  {
    // north-south through Carver's Crossing, from Bluff Road to River Road
    name: 'Carver Road', type: 'gravel', width: 5.4,
    pts: [[-470, -196], [-471, -140], [-469, -70], [-470, 2], [-471, 80], [-469, 160], [-470, 241]],
  },
];

// Farmsteads. `at` is the house lot origin (cell aligned); buildings are
// placed relative to it. `drive` starts on a road (plus optional waypoints)
// and is extended to the house's front door. rot = quarter turns of the front (0 = front faces +Z).
const OLD_FARMS = [
  {
    name: 'Hollis Farm', at: [-196, -108], drive: [[-150, -110], [-166, -109]],
    house: { plan: 'foursquare', rot: 3, ext: 'white_siding', roof: 'black_shingle', at: [-196, -112] },
    barn: { plan: 'barn', rot: 0, at: [-232, -150], style: 'barn_red' },
    shed: { plan: 'machine_shed', rot: 0, at: [-200, -150] },
    bins: [[-214, -126, 4.2], [-222, -126, 4.2], [-218, -118, 3.4]],
    silo: [-246, -120],
    yard: [-250, -160, -168, -90],
  },
  {
    name: 'Dekker Farm', at: [-238, 92],
    house: { plan: 'farmhouse_l', rot: 0, ext: 'yellow_siding', roof: 'green_shingle', at: [-238, 98] },
    barn: { plan: 'barn', rot: 2, at: [-272, 80], style: 'barn_white' },
    shed: { plan: 'machine_shed', rot: 1, at: [-212, 80] },
    bins: [[-250, 72, 4], [-258, 72, 4]],
    silo: null,
    yard: [-286, 64, -200, 124],
    drive: [[-232, 128]],
  },
  {
    name: 'Price Farm', at: [-80, -134],
    house: { plan: 'cottage', rot: 3, ext: 'gray_siding', roof: 'brown_shingle', at: [-78, -136] },
    barn: { plan: 'barn_small', rot: 1, at: [-102, -150], style: 'barn_red' },
    shed: null,
    bins: [[-90, -114, 3.6]],
    silo: [-108, -124],
    yard: [-114, -160, -62, -104],
    drive: [[-58, -112], [-54, -127]],
  },
];

function farmWest(f) {
  return {
    ...f, at: WP(f.at), drive: f.drive && f.drive.map(WP), silo: f.silo && WP(f.silo),
    house: { ...f.house, at: WP(f.house.at) }, barn: f.barn && { ...f.barn, at: WP(f.barn.at) }, shed: f.shed && { ...f.shed, at: WP(f.shed.at) },
    bins: f.bins.map(([x, z, r]) => [W(x), z, r]), yard: [W(f.yard[0]), f.yard[1], W(f.yard[2]), f.yard[3]],
  };
}
export const FARMS = [
  ...OLD_FARMS.map(farmWest),
  // (the new places come last, so the old buildings keep their ids in saves)
  {
    name: 'Ostrander Farm', isNew: true, at: [-566, -140], drive: [[-470, -136], [-512, -136]],
    house: { plan: 'farmhouse_l', rot: 3, ext: 'white_siding', roof: 'gray_shingle', at: [-566, -142] },
    barn: { plan: 'barn', rot: 1, at: [-612, -170], style: 'barn_red' },
    shed: { plan: 'machine_shed', rot: 0, at: [-604, -124] },
    bins: [[-586, -178, 4.2], [-576, -178, 3.6]],
    silo: [-622, -140],
    yard: [-628, -186, -546, -104],
  },
  {
    name: 'Lindqvist Place', isNew: true, at: [-200, -40], drive: [[-176, 8], [-176, -18]],
    house: { plan: 'cottage', rot: 3, ext: 'white_siding', roof: 'green_shingle', at: [-200, -40] },
    barn: { plan: 'barn_small', rot: 0, at: [-224, -60], style: 'barn_red' },
    shed: null,
    bins: [[-212, -24, 3.2]],
    silo: null,
    yard: [-230, -70, -170, -16],
  },
  {
    name: 'Kessler Place', isNew: true, at: [-222, 156], drive: [[-216, 238], [-216, 206]],
    house: { plan: 'ranch', rot: 0, ext: 'sage_siding', roof: 'brown_shingle', at: [-222, 156] },
    barn: { plan: 'barn_small', rot: 1, at: [-250, 164], style: 'barn_white' },
    shed: null,
    bins: [[-234, 182, 3.4]],
    silo: null,
    yard: [-256, 142, -196, 194],
  },
];

// Fields: axis-aligned rects with crop type. Row direction 'x' or 'z'.
// The farm country's fields (moved west with it), the land around Carver's
// Crossing, and the two by the edge of town.
const FARM_FIELDS = [
  { crop: 'corn', x0: -300, z0: -236, x1: -164, z1: -168, rows: 'x' },
  { crop: 'corn', x0: -136, z0: -186, x1: -72, z1: -164, rows: 'x' },
  { crop: 'corn', x0: -300, z0: -84, x1: -168, z1: 8, rows: 'z' },
  { crop: 'beans', x0: -136, z0: -96, x1: -64, z1: -44, rows: 'x' },
  { crop: 'corn', x0: -136, z0: 86, x1: -40, z1: 116, rows: 'z' },
  { crop: 'hay', x0: -300, z0: 144, x1: -170, z1: 236, rows: 'x' },
  { crop: 'corn', x0: -132, z0: 140, x1: -28, z1: 222, rows: 'x' },
  { crop: 'pasture', x0: -136, z0: -40, x1: -64, z1: 6 },
  { crop: 'pasture', x0: -300, z0: 40, x1: -186, z1: 64 },
].map((f) => ({ ...f, x0: W(f.x0), x1: W(f.x1) }));
export const FIELDS = [
  ...FARM_FIELDS,
  { crop: 'corn', x0: -656, z0: -88, x1: -560, z1: -22, rows: 'z' },
  { crop: 'hay', x0: -654, z0: 62, x1: -542, z1: 160, rows: 'x' },
  { crop: 'pasture', x0: -440, z0: 50, x1: -372, z1: 126 },
  { crop: 'beans', x0: -440, z0: -168, x1: -368, z1: -62, rows: 'z' },
  { crop: 'corn', x0: -252, z0: 40, x1: -118, z1: 128, rows: 'x' },
  { crop: 'beans', x0: -258, z0: -182, x1: -140, z1: -84, rows: 'x' },
  { crop: 'corn', x0: -112, z0: -176, x1: -44, z1: -100, rows: 'z' },
  { crop: 'corn', x0: -10, z0: -200, x1: 70, z1: -120, rows: 'z' },
  { crop: 'beans', x0: 0, z0: 40, x1: 56, z1: 120, rows: 'z' },
];

// Woods: circles (x, z, r) of dense trees; and tree lines (polyline, spacing)
export const WOODS = [
  // farm country
  ...[{ x: -30, z: -60, r: 34 }, { x: -60, z: 150, r: 18 }, { x: -300, z: 100, r: 22 }, { x: -110, z: -230, r: 26 }].map((w) => ({ ...w, x: W(w.x) })),
  // between the farms and town
  { x: -12, z: -96, r: 22 }, { x: 10, z: 170, r: 30 }, { x: -600, z: 205, r: 22 }, { x: -90, z: 196, r: 24 }, { x: -400, z: -232, r: 16 },
  { x: -136, z: -34, r: 16 }, { x: -540, z: 186, r: 14 },
  // river bluffs north & south of town
  { x: 150, z: -190, r: 40 }, { x: 195, z: -165, r: 30 }, { x: 170, z: -230, r: 36 },
  { x: 150, z: 190, r: 42 }, { x: 196, z: 168, r: 28 }, { x: 160, z: 235, r: 36 },
  { x: 60, z: 210, r: 24 },
];
// Turkey Creek's wooded banks (the woods are planted along its course)
export const CREEK_WOODS = [-178, -150, -112, -80, -48, 54, 86, 118, 150, 186, 214];

// Town lots. type -> generator; at = [x, z] of the lot's min corner; rot quarter turns.
export const TOWN_LOTS = [
  // ---- downtown, north side of Main St (fronts face +Z / south toward Main St) ----
  { type: 'block', at: [136, -30], rot: 0, units: [
    { w: 4, d: 10, levels: 2, kind: 'hardware', sign: 'HARDWARE', style: 'red_brick' },
    { w: 4, d: 10, levels: 3, kind: 'store', sign: 'MERCANTILE', style: 'tan_brick' },
    { w: 4, d: 9, levels: 2, kind: 'diner', sign: 'RIVER DINER', style: 'painted_brick' },
    { w: 4, d: 7, levels: 2, kind: 'pharmacy', sign: 'PHARMACY', style: 'dark_brick' },
  ] },
  { type: 'block', at: [92, -30], rot: 0, units: [
    { w: 5, d: 10, levels: 2, kind: 'store', sign: 'FEED & SEED', style: 'red_brick' },
    { w: 4, d: 8, levels: 2, kind: 'bar', sign: 'TAVERN', style: 'dark_brick' },
    { w: 5, d: 9, levels: 2, kind: 'office', sign: 'BANK', style: 'tan_brick' },
  ] },
  // ---- south side of Main St (fronts face -Z / north) ----
  { type: 'block', at: [136, 10], rot: 2, units: [
    { w: 4, d: 8, levels: 2, kind: 'store', sign: 'ANTIQUES', style: 'red_brick' },
    { w: 4, d: 8, levels: 2, kind: 'office', sign: 'POST OFFICE', style: 'painted_brick' },
    { w: 4, d: 10, levels: 3, kind: 'store', sign: 'DRY GOODS', style: 'red_brick' },
    { w: 4, d: 8, levels: 2, kind: 'bar', sign: 'RIVER BAR', style: 'tan_brick' },
  ] },
  { type: 'block', at: [92, 10], rot: 2, units: [
    { w: 5, d: 10, levels: 2, kind: 'store', sign: 'GROCERY', style: 'tan_brick' },
    { w: 4, d: 8, levels: 2, kind: 'pharmacy', sign: 'DRUGS', style: 'red_brick' },
    { w: 5, d: 8, levels: 2, kind: 'office', sign: 'GAZETTE', style: 'dark_brick' },
  ] },
  // ---- residential ----
  { type: 'house', plan: 'foursquare', at: [96, -98], rot: 0, ext: 'blue_siding', roof: 'gray_shingle' },
  { type: 'house', plan: 'cottage', at: [110, -96], rot: 0, ext: 'white_siding', roof: 'black_shingle' },
  { type: 'church', at: [140, -124], rot: 0 },
  { type: 'house', plan: 'foursquare', at: [156, -98], rot: 0, ext: 'sage_siding', roof: 'black_shingle' },
  { type: 'house', plan: 'cottage', at: [96, 80], rot: 2, ext: 'white_siding', roof: 'green_shingle' },
  { type: 'house', plan: 'foursquare', at: [110, 80], rot: 2, ext: 'gray_siding', roof: 'black_shingle' },
  { type: 'house', plan: 'ranch', at: [138, 80], rot: 2, ext: 'yellow_siding', roof: 'brown_shingle' },
  { type: 'house', plan: 'cottage', at: [156, 80], rot: 2, ext: 'blue_siding', roof: 'gray_shingle' },
  { type: 'house', plan: 'ranch', at: [138, 110], rot: 0, ext: 'white_siding', roof: 'black_shingle' },
  { type: 'house', plan: 'ranch', at: [94, -122], rot: 0, ext: 'gray_siding', roof: 'black_shingle' },
  { type: 'house', plan: 'cottage', at: [156, -128], rot: 0, ext: 'yellow_siding', roof: 'brown_shingle' },
  { type: 'house', plan: 'foursquare', at: [96, 104], rot: 2, ext: 'white_siding', roof: 'green_shingle' },
  { type: 'house', plan: 'cottage', at: [156, 108], rot: 2, ext: 'sage_siding', roof: 'black_shingle' },
  { type: 'house', plan: 'cottage', at: [62, 40], rot: 1, ext: 'white_siding', roof: 'gray_shingle' },
  { type: 'house', plan: 'foursquare', at: [60, -48], rot: 1, ext: 'yellow_siding', roof: 'black_shingle' },
  { type: 'gas', at: [44, 8], rot: 2 },
];

// Carver's Crossing: a store and post office, a few houses and the grain
// elevator where Highway 34 meets Carver Road.
export const CROSSING = {
  name: "Carver's Crossing", at: [-470, 2],
  lots: [
    { type: 'block', at: [-458, -34], rot: 0, units: [
      { w: 5, d: 9, levels: 2, kind: 'store', sign: 'GENERAL STORE', style: 'red_brick' },
      { w: 4, d: 8, levels: 2, kind: 'office', sign: 'POST OFFICE', style: 'painted_brick' },
    ] },
    { type: 'house', plan: 'ranch', at: [-448, 22], rot: 2, ext: 'white_siding', roof: 'black_shingle' },
    { type: 'house', plan: 'cottage', at: [-424, 22], rot: 2, ext: 'yellow_siding', roof: 'brown_shingle' },
    { type: 'house', plan: 'foursquare', at: [-500, 22], rot: 2, ext: 'blue_siding', roof: 'gray_shingle' },
    { type: 'house', plan: 'cottage', at: [-496, -84], rot: 1, ext: 'gray_siding', roof: 'green_shingle' },
  ],
  elevator: [-494, -36],
};

// Fixed world features
export const FEATURES = {
  waterTower: [106, 118],
  floodwall: { x: 190, z0: -134, z1: 134, gate: [-6, 6] },
  spawn: [14, 2],
  churchCountry: { at: [W(-124), 58], rot: 2 },
};
