// The island of Greenfall County, laid out from the hand-drawn concept map:
//   NW  – Millbrook: small town + very rural residential lanes
//   N   – Route 9 Plaza: the retail strip
//   W/SW– Hollow Creek: farms and the main country area
//   C   – Cedar Ridge: big rolling country (lake, sawmill, fairgrounds, quarry, hills)
//   NE  – Pelican Harbor: a deep-water bay cutting into the north coast
//   E   – Bellerose: an old coastal town (French-quarter style balconies, cathedral, cemetery, wharf)
//   far E – open ocean (reserved for the future ocean update)
// World units are meters. x grows east, z grows south. Sea level is y = 0.

export const WORLD = { W: 4800, H: 3000, CELL: 4 };
export const GW = WORLD.W / WORLD.CELL + 1;
export const GH = WORLD.H / WORLD.CELL + 1;

// Clockwise coastline polygon. Noise is added on top of this at generation time.
export const COAST = [
  [230, 240], [700, 165], [1300, 190], [1900, 150], [2450, 205], [2770, 190],
  [2820, 420], [2870, 620], [2990, 760], [3180, 790], [3330, 720], [3390, 500], [3425, 205],
  [3620, 215], [3760, 420], [3730, 900], [3790, 1300], [3770, 1800], [3790, 2300],
  [3710, 2700], [3450, 2850], [2900, 2820], [2300, 2870], [1700, 2830], [1100, 2860],
  [600, 2825], [255, 2700], [175, 2200], [215, 1600], [155, 1000], [195, 500],
];

// Stretches of coast that get a hard sea wall / quay instead of a sandy beach.
export const QUAYS = [
  { x1: 2880, z1: 700, x2: 3360, z2: 830 }, // harbor south quay
  { x1: 3690, z1: 1450, x2: 3820, z2: 2250 }, // Bellerose wharf
];

export const REGIONS = {
  millbrook: { name: 'Millbrook', poly: [[150, 130], [1180, 130], [1180, 1060], [150, 1060]] },
  retail: { name: 'Route 9 Plaza', poly: [[1180, 130], [1720, 130], [1720, 1050], [1180, 1050]] },
  farms: { name: 'Hollow Creek', poly: [[150, 1060], [1260, 1050], [1260, 2900], [150, 2900]] },
  harbor: { name: 'Pelican Harbor', poly: [[2500, 120], [3850, 120], [3850, 1100], [2500, 1100]] },
  bellerose: { name: 'Bellerose', poly: [[3020, 1100], [3850, 1100], [3850, 2900], [3020, 2900]] },
  // everything else is Cedar Ridge
};

export const ROAD_TYPES = {
  highway: { width: 9, layer: 'ASPHALT', color: 0x55575c, lines: 'highway', shoulder: 7, z: 0.1 },
  country: { width: 7, layer: 'ASPHALT', color: 0x5e5f63, lines: 'country', shoulder: 6, z: 0.09 },
  street: { width: 8, layer: 'ASPHALT', color: 0x606166, lines: 'street', shoulder: 4, z: 0.085 },
  cobble: { width: 7.5, layer: 'COBBLE', color: 0x8a8174, lines: null, shoulder: 4, z: 0.085 },
  gravel: { width: 5.5, layer: 'GRAVEL', color: 0xa39785, lines: null, shoulder: 5, z: 0.07 },
  dirt: { width: 4.6, layer: 'DIRTROAD', color: 0x9a7a55, lines: null, shoulder: 4, z: 0.06 },
};

// Hand-authored road network (control points, smoothed with Catmull-Rom at generation).
export const ROADS = [
  // Route 9 – the island's spine: Millbrook → Plaza → Cedar Ridge → Pelican Harbor → Bellerose
  { name: 'Route 9', type: 'highway', pts: [[200, 640], [520, 602], [900, 592], [1150, 590], [1450, 596], [1700, 630], [1980, 690],
    [2280, 760], [2560, 880], [2760, 950], [2990, 985], [3200, 965], [3420, 925], [3445, 1120], [3422, 1320], [3420, 1700],
    [3420, 2100], [3420, 2420], [3380, 2730]] },
  // Old Mill Road – the long diagonal through the farms (straight off the sketch)
  { name: 'Old Mill Rd', type: 'country', pts: [[1300, 592], [1310, 820], [1250, 1060], [1110, 1300], [960, 1600], [860, 1900],
    [790, 2200], [705, 2500], [640, 2760]] },
  { name: 'Haygood Ln', type: 'country', pts: [[960, 1600], [720, 1590], [470, 1650], [240, 1700]] },
  // Cedar Ridge cross-country road → Bellerose
  { name: 'Lakeview Rd', type: 'country', pts: [[1110, 1300], [1400, 1350], [1700, 1420], [1840, 1560], [1960, 1720], [2250, 1760],
    [2480, 1860], [2800, 1890], [3100, 1880], [3420, 1860]] },
  { name: 'Ridge Rd', type: 'country', pts: [[1700, 630], [1720, 950], [1780, 1200], [1810, 1420], [1840, 1560]] },
  { name: 'Lookout Rd', type: 'gravel', pts: [[1960, 1720], [1830, 1950], [1720, 2150], [1690, 2420], [1740, 2620], [1750, 2790]] },
  { name: 'County Line Rd', type: 'country', pts: [[790, 2200], [1100, 2300], [1400, 2370], [1690, 2420], [2000, 2470], [2400, 2520],
    [2800, 2460], [3100, 2380], [3420, 2330]] },
  { name: 'Sawmill Rd', type: 'gravel', pts: [[1720, 950], [1900, 900], [2050, 880]] },
  { name: 'Harbor W', type: 'street', pts: [[2760, 950], [2735, 800], [2700, 620], [2660, 420], [2630, 300]] },
  { name: 'Harbor E', type: 'street', pts: [[3420, 925], [3480, 760], [3500, 560], [3560, 360], [3600, 290]] },
  { name: 'Fair Rd', type: 'gravel', pts: [[2480, 1860], [2540, 2000], [2560, 2140]] },
  { name: 'Redbarn Ln', type: 'dirt', pts: [[1780, 1200], [2050, 1180], [2300, 1150], [2500, 1200]] },
  { name: 'Quarry Rd', type: 'gravel', pts: [[2400, 2520], [2440, 2600], [2480, 2680]] },
  { name: 'Miller Ln', type: 'dirt', pts: [[860, 1900], [600, 1960], [380, 2080]] },
  { name: 'Orchard Ln', type: 'dirt', pts: [[705, 2500], [500, 2420], [330, 2380]] },
  { name: 'Creek Ln', type: 'dirt', pts: [[1250, 1060], [1050, 1150], [800, 1220], [520, 1260], [300, 1220]] },
  { name: 'Pine Ln', type: 'gravel', pts: [[980, 430], [1000, 300], [1080, 220]] },
  { name: 'Hollow Ln', type: 'gravel', pts: [[480, 760], [380, 850], [260, 960]] },
  { name: 'Maple Ln', type: 'gravel', pts: [[560, 430], [480, 330], [360, 260]] },
  { name: 'Bayou Rd', type: 'dirt', pts: [[2800, 1890], [2860, 1620], [2950, 1400], [3050, 1300], [3180, 1300]] },
  { name: 'Ridge Spur', type: 'dirt', pts: [[2000, 2470], [2150, 2250], [2300, 2120], [2480, 2100]] },
];

// Town grids get generated as simple straight streets.
export const MILLBROOK_GRID = {
  ns: [{ x: 560, z1: 420, z2: 905 }, { x: 700, z1: 300, z2: 905 }, { x: 840, z1: 300, z2: 905 }, { x: 980, z1: 300, z2: 905 }],
  ew: [{ z: 430, x1: 480, x2: 1060 }, { z: 760, x1: 480, x2: 1060 }, { z: 900, x1: 560, x2: 980 }],
};
export const BELLEROSE_GRID = {
  ns: [{ x: 3180, z1: 1300, z2: 2450 }, { x: 3300, z1: 1300, z2: 2450 }, { x: 3545, z1: 1300, z2: 2450 }, { x: 3650, z1: 1300, z2: 2300 }],
  ew: [{ z: 1300, x1: 3120, x2: 3700 }, { z: 1450, x1: 3120, x2: 3720 }, { z: 1600, x1: 3120, x2: 3720 }, { z: 1760, x1: 3120, x2: 3720 },
    { z: 1920, x1: 3120, x2: 3720 }, { z: 2080, x1: 3120, x2: 3720 }, { z: 2240, x1: 3120, x2: 3700 }, { z: 2450, x1: 3120, x2: 3700 }],
};

export const POIS = [
  { id: 'millbrook', name: 'Millbrook', x: 760, z: 620, r: 320, loot: 1.0, major: true },
  { id: 'maple', name: 'Maple Hollow', x: 420, z: 300, r: 200, loot: 0.8 },
  { id: 'plaza', name: 'Route 9 Plaza', x: 1440, z: 640, r: 260, loot: 1.2, major: true },
  { id: 'farms', name: 'Hollow Creek Farms', x: 760, z: 1900, r: 450, loot: 0.9, major: true },
  { id: 'coop', name: 'Grain Co-op', x: 1020, z: 1520, r: 120, loot: 1.1 },
  { id: 'haygood', name: 'Haygood Ranch', x: 420, z: 1520, r: 180, loot: 0.9 },
  { id: 'orchard', name: 'Dawson Orchard', x: 430, z: 2330, r: 180, loot: 0.9 },
  { id: 'sawmill', name: 'Sawmill', x: 2000, z: 860, r: 140, loot: 1.1 },
  { id: 'lake', name: 'Lake Wren', x: 2080, z: 1480, r: 260, loot: 1.0 },
  { id: 'lookout', name: 'Lookout Hill', x: 1500, z: 2150, r: 150, loot: 1.2 },
  { id: 'fair', name: 'County Fairgrounds', x: 2560, z: 2020, r: 170, loot: 1.3, major: true },
  { id: 'quarry', name: 'Old Quarry', x: 2470, z: 2600, r: 140, loot: 1.1 },
  { id: 'redbarn', name: 'Redbarn Farm', x: 2330, z: 1170, r: 160, loot: 1.0 },
  { id: 'harbor', name: 'Pelican Harbor', x: 3080, z: 880, r: 330, loot: 1.2, major: true },
  { id: 'lighthouse', name: 'Lighthouse Point', x: 3600, z: 290, r: 120, loot: 1.2 },
  { id: 'bellerose', name: 'Bellerose', x: 3410, z: 1800, r: 420, loot: 1.2, major: true },
  { id: 'cemetery', name: 'St. Agnes Cemetery', x: 3200, z: 2340, r: 110, loot: 1.0 },
  { id: 'gull', name: 'Gull Point', x: 1760, z: 2790, r: 120, loot: 1.0 },
  { id: 'bayou', name: 'Bayou Bend', x: 2900, z: 1560, r: 160, loot: 0.9 },
];

export const LAKE = { x: 2080, z: 1480, rx: 220, rz: 150 };
export const LOOKOUT_HILL = { x: 1500, z: 2150, h: 42, sigma: 230 };
export const QUARRY = { x: 2470, z: 2620, rx: 95, rz: 70, depth: 16 };

// Where survivors wake up. Mostly farms, Millbrook and the open country; never the
// harbor or Bellerose (those are dangerous places you travel to).
export const SPAWN_ZONES = [
  { name: 'Hollow Creek Farms', x0: 260, z0: 1150, x1: 1220, z1: 2740, w: 4 },
  { name: 'Millbrook', x0: 260, z0: 230, x1: 1150, z1: 1010, w: 2.6 },
  { name: 'Cedar Ridge', x0: 1300, z0: 1000, x1: 2500, z1: 2720, w: 2.4 },
  { name: 'Route 9 Plaza', x0: 1200, z0: 260, x1: 1700, z1: 1000, w: 0.6 },
  { name: 'Redbarn Farm', x0: 1750, z0: 950, x1: 2600, z1: 1350, w: 0.8 },
];
export const NO_SPAWN = [{ x0: 2500, z0: 0, x1: 4800, z1: 1150 }, { x0: 2700, z0: 1100, x1: 4800, z1: 3000 }];

// Mid-match riverboat evac docks (the boat steams in from the ocean / bay).
export const DOCKS = [
  { id: 'wharf', name: 'Bellerose Wharf', x: 3815, z: 1880, boatX: 3860, boatZ: 1880, rot: 0 },
  { id: 'harbor', name: 'Pelican Harbor Quay', x: 3100, z: 730, boatX: 3100, boatZ: 680, rot: Math.PI / 2 },
  { id: 'gull', name: 'Gull Point Pier', x: 1760, z: 2905, boatX: 1810, boatZ: 2930, rot: 0 },
];

// Candidate helicopter landing zones (open, flat-ish areas).
export const LZS = [
  { name: 'Plaza Parking', x: 1500, z: 560 }, { name: 'Millbrook Park', x: 770, z: 690 },
  { name: 'Haygood Pasture', x: 520, z: 1450 }, { name: 'Hollow Creek Fields', x: 700, z: 2100 },
  { name: 'Lake Meadow', x: 1880, z: 1300 }, { name: 'Fairgrounds', x: 2600, z: 2080 },
  { name: 'Quarry Floor', x: 2470, z: 2620 }, { name: 'Harbor Yard', x: 3550, z: 700 },
  { name: 'Cathedral Square', x: 3360, z: 1690 }, { name: 'Redbarn Field', x: 2200, z: 1300 },
  { name: 'Lookout Hill', x: 1520, z: 2120 }, { name: 'County Line Field', x: 1250, z: 2450 },
];
