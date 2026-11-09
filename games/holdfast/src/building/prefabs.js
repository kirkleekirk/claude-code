// Building designs. Each returns a Structure in canonical orientation
// (front door facing +Z / south). The world generator rotates and places them.
import { buildFromPlan, gableRoof } from './planner.js';
import { Structure } from './structure.js';

// Porch along one side of a plan building. side 's': row z just south of the
// house spanning x0..x1. side 'e': column x just east spanning z0..z1.
function addPorch(S, { side = 's', x0, x1, z, x, z0, z1, openAt = [], style = 'white_siding', roof = 'black_shingle', pitch = 0.5, floor = 'porch', found = 'stone', railing = true, columns = '#f4f2ec', covered = true }) {
  if (side === 's') {
    for (let i = x0; i <= x1; i++) S.setFloor(i, z, 0, floor, found);
    if (covered) for (let i = x0; i <= x1 + 1; i++) S.setColumn(i, z + 1, 0, columns);
    if (railing) {
      for (let i = x0; i <= x1; i++) if (!openAt.includes(i)) S.setWall(i, z + 1, 0, 0, 'railing', style, true);
      S.setWall(x0, z, 0, 1, 'railing', style, false);
      S.setWall(x1 + 1, z, 0, 1, 'railing', style, true);
    }
    if (covered) for (let i = x0; i <= x1; i++) S.setRoof(i, z, 1, 1, pitch, roof);
    S.porch = { side, x0, x1, z, openAt };
  } else {
    for (let j = z0; j <= z1; j++) S.setFloor(x, j, 0, floor, found);
    for (let j = z0; j <= z1 + 1; j++) S.setColumn(x + 1, j, 0, columns);
    if (railing) {
      for (let j = z0; j <= z1; j++) if (!openAt.includes(j)) S.setWall(x + 1, j, 0, 1, 'railing', style, true);
      S.setWall(x, z0, 0, 0, 'railing', style, false);
      S.setWall(x, z1 + 1, 0, 0, 'railing', style, true);
    }
    for (let j = z0; j <= z1; j++) S.setRoof(x, j, 1, 0, pitch, roof);
    S.porch = { side, x, z0, z1, openAt };
  }
}

const HOUSE_ROOMS = {
  k: { kind: 'kitchen', floor: 'checker', wall: 'interior' },
  d: { kind: 'dining', floor: 'wood', wall: 'wallpaper' },
  h: { kind: 'hall', floor: 'wood' },
  l: { kind: 'living', floor: 'wood', wall: 'interior_blue' },
  r: { kind: 'kidroom', floor: 'wood', wall: 'wallpaper_rose' },
  s: { kind: 'bedroom', floor: 'carpet', wall: 'interior' },
  t: { kind: 'kidroom', floor: 'wood', wall: 'wallpaper' },
  b: { kind: 'bath', floor: 'tile', wall: 'tile_wall', window: 'small_window' },
  a: { kind: 'bath', floor: 'tile', wall: 'tile_wall', window: 'small_window' },
};

export const PLANS = {
  // American foursquare farmhouse, 8 x 8 m, two stories, gable roof, porch.
  foursquare(opts = {}) {
    const S = buildFromPlan({
      name: opts.name || 'Farmhouse', kind: 'house', seed: opts.seed || 1,
      ext: opts.ext || 'white_siding', found: 'stone', floor: 'wood',
      levels: [
        ['kkdd',
         'kkdd',
         'hhll',
         'hhll'],
        ['rrss',
         'hhss',
         'Hhbb',
         'Hhtt'],
      ],
      rooms: HOUSE_ROOMS,
      doors: [
        [0, 'h', 'l', 'doorway'],
        [0, 'h', 'k', 'door'],
        [0, 'k', 'd', 'wide_opening'],
        [0, 'd', 'l', 'doorway'],
        [1, 'h', 'r', 'door', 0], [1, 'h', 's'], [1, 'h', 'b'], [1, 'h', 't'],
      ],
      exits: [{ x: 1, z: 3, side: 's' }, { x: 0, z: 0, side: 'n' }],
      stairs: [{ x: 0, z: 3, level: 0, dir: 3, color: '#ffffff' }],
      roof: { type: 'gable', axis: 'x', pitch: 1.5, style: opts.roof || 'black_shingle' },
    });
    if (opts.sidePorch) addPorch(S, { side: 'e', x: 4, z0: 1, z1: 3, openAt: [3], style: opts.ext || 'white_siding', roof: opts.roof || 'black_shingle' });
    else addPorch(S, { x0: 0, x1: 3, z: 4, openAt: [1], style: opts.ext || 'white_siding', roof: opts.roof || 'black_shingle' });
    return S;
  },
  farmhouse_l(opts = {}) { return PLANS.foursquare({ ...opts, sidePorch: true }); },

  // One-story bungalow, 8 x 8 m with a front porch.
  cottage(opts = {}) {
    const S = buildFromPlan({
      name: opts.name || 'Cottage', kind: 'house', seed: opts.seed || 2,
      ext: opts.ext || 'white_siding', found: 'concrete', floor: 'wood',
      levels: [
        ['kkar',
         'kkhr',
         'llls',
         'llls'],
      ],
      rooms: { ...HOUSE_ROOMS, r: { kind: 'bedroom', floor: 'carpet', wall: 'wallpaper' }, s: { kind: 'kidroom', floor: 'wood', wall: 'interior' } },
      doors: [
        [0, 'l', 'k', 'doorway'], [0, 'l', 'h', 'doorway'], [0, 'h', 'a'], [0, 'h', 'r'], [0, 'l', 's', 'door', 0],
      ],
      exits: [{ x: 1, z: 3, side: 's' }, { x: 0, z: 0, side: 'n' }],
      roof: { type: 'gable', axis: 'x', pitch: 1.5, style: opts.roof || 'black_shingle' },
    });
    // one-story: an open stoop (a porch roof would collide with the main eave)
    addPorch(S, { x0: 0, x1: 2, z: 4, openAt: [1], style: opts.ext || 'white_siding', covered: false });
    return S;
  },

  // One-story ranch, 12 x 8 m.
  ranch(opts = {}) {
    return buildFromPlan({
      name: opts.name || 'Ranch house', kind: 'house', seed: opts.seed || 3,
      ext: opts.ext || 'yellow_siding', found: 'concrete', floor: 'wood',
      levels: [
        ['rrakkk',
         'rrhllk',
         'sshlll',
         'sshlll'],
      ],
      rooms: { ...HOUSE_ROOMS, r: { kind: 'bedroom', floor: 'carpet', wall: 'interior' }, s: { kind: 'bedroom', floor: 'carpet_blue', wall: 'wallpaper' }, l: { kind: 'living', floor: 'carpet', wall: 'interior' } },
      doors: [
        [0, 'h', 'r'], [0, 'h', 's'], [0, 'h', 'a'], [0, 'h', 'l', 'wide_opening', 1], [0, 'l', 'k', 'wide_opening'],
      ],
      exits: [{ x: 3, z: 3, side: 's' }, { x: 5, z: 0, side: 'n' }],
      roof: { type: 'gable', axis: 'x', pitch: 1.0, style: opts.roof || 'brown_shingle' },
    });
  },

  // Large gambrel barn with hay loft, 12 x 16 m.
  barn(opts = {}) {
    const st = opts.style || 'barn_red';
    const S = buildFromPlan({
      name: opts.name || 'Barn', kind: 'barn', seed: opts.seed || 4,
      ext: st, int: st, found: 'concrete', floor: 'concrete',
      levels: [
        ['aaaaaa', 'aaaaaa', 'aaaaaa', 'aaaaaa', 'aaaaaa', 'aaaaaa', 'aaaaaa', 'aaaaaa'],
        // F: open to below (the hay hole, and the stairwell over the stairs at x 0)
        ['ffffff', 'ffffff', 'ffffff', 'ffffff', 'ffFFff', 'FfFFff', 'FfFFff', 'ffFFff'],
      ],
      rooms: { a: { kind: 'barn', floor: 'concrete', wall: st }, f: { kind: 'loft', floor: 'barn', wall: st } },
      exits: [{ x: 2, z: 7, side: 's', shape: 'barn_door' }, { x: 3, z: 7, side: 's', shape: 'barn_door' },
        { x: 2, z: 0, side: 'n', shape: 'barn_door' }, { x: 3, z: 0, side: 'n', shape: 'barn_door' }],
      stairs: [{ x: 0, z: 6, level: 0, dir: 3, color: '#b8a080', side: '#a08a6c' }],
      windowAt: (x, z, l, a) => {
        if (l === 0 && a === 1) return z % 2 ? 'high_window' : 'solid';
        if (l === 1 && a === 0 && z === 8 && (x === 2 || x === 3)) return x === 2 ? 'loft_door' : 'solid';
        if (l === 1 && a === 1) return z % 3 === 1 ? 'small_window' : 'solid';
        return 'solid';
      },
      roofs: [{ x0: 0, z0: 0, x1: 5, z1: 7, level: 2, axis: 'z', pitches: [2.6, 1.6, 0.7], style: opts.roof || 'red_metal' }],
    });
    return S;
  },

  // Smaller gable barn / shed with loft, 8 x 12 m.
  barn_small(opts = {}) {
    const st = opts.style || 'barn_red';
    return buildFromPlan({
      name: opts.name || 'Small barn', kind: 'barn', seed: opts.seed || 5,
      ext: st, int: st, found: 'concrete', floor: 'concrete',
      levels: [
        ['aaaa', 'aaaa', 'aaaa', 'aaaa', 'aaaa', 'aaaa'],
      ],
      rooms: { a: { kind: 'barn', floor: 'concrete', wall: st } },
      exits: [{ x: 1, z: 5, side: 's', shape: 'barn_door' }, { x: 2, z: 5, side: 's', shape: 'barn_door' }, { x: 1, z: 0, side: 'n', shape: 'door' }],
      windowAt: (x, z, l, a) => (a === 1 && z % 2 === 1 ? 'small_window' : 'solid'),
      roofs: [{ x0: 0, z0: 0, x1: 3, z1: 5, level: 1, axis: 'z', pitch: 2.0, style: opts.roof || 'silver_metal' }],
    });
  },

  // Pole-style machine shed, 12 x 12 m, tall open interior.
  machine_shed(opts = {}) {
    const st = opts.style || 'metal_shed';
    const S = buildFromPlan({
      name: opts.name || 'Machine shed', kind: 'shed', seed: opts.seed || 6,
      ext: st, int: st, found: 'concrete', floor: 'concrete',
      levels: [
        ['gggggg', 'gggggg', 'gggggg', 'gggggg', 'gggggg', 'gggggg'],
        ['GGGGGG', 'GGGGGG', 'GGGGGG', 'GGGGGG', 'GGGGGG', 'GGGGGG'],
      ],
      rooms: { g: { kind: 'garage', floor: 'concrete', wall: st } },
      exits: [1, 2, 3, 4].map((x) => ({ x, z: 5, side: 's', shape: 'garage' })).concat([{ x: 5, z: 0, side: 'n', shape: 'door' }]),
      windowAt: (x, z, l, a) => (l === 1 && a === 1 ? 'high_window' : 'solid'),
      roofs: [{ x0: 0, z0: 0, x1: 5, z1: 5, level: 2, axis: 'z', pitch: 0.6, style: opts.roof || 'silver_metal' }],
    });
    return S;
  },

  // White country church with a front bell tower.
  church(opts = {}) {
    const st = opts.ext || 'white_siding';
    const S = buildFromPlan({
      name: opts.name || 'Church', kind: 'church', seed: opts.seed || 7,
      ext: st, found: 'stone', floor: 'wood',
      levels: [
        ['nnnn', 'nnnn', 'nnnn', 'nnnn', 'nnnn', 'nnnn', 'nnnn', '.vv.', '.vv.'],
        ['NNNN', 'NNNN', 'NNNN', 'NNNN', 'NNNN', 'NNNN', 'NNNN', '.VV.', '.VV.'],
        ['....', '....', '....', '....', '....', '....', '....', '.VV.', '.VV.'],
        ['....', '....', '....', '....', '....', '....', '....', '.VV.', '.VV.'],
      ],
      rooms: { n: { kind: 'church', floor: 'wood', wall: 'interior' }, v: { kind: 'hall', floor: 'wood', wall: 'interior' } },
      doors: [[0, 'v', 'n', 'wide_opening', 0]],
      exits: [{ x: 1, z: 8, side: 's', shape: 'door' }, { x: 2, z: 8, side: 's', shape: 'door' }],
      windowAt: (x, z, l, a) => {
        if (z >= 7) return l === 3 ? 'arch_window' : (l === 1 && a === 0 && z === 9 ? 'tall_window' : 'solid');
        if (a === 1 && z < 7) return l === 0 ? (z % 2 ? 'tall_window' : 'solid') : (z % 2 ? 'small_window' : 'solid');
        if (a === 0 && z === 0) return l === 1 ? 'tall_window' : 'solid';
        return 'solid';
      },
      roofs: [
        { x0: 0, z0: 0, x1: 3, z1: 6, level: 2, axis: 'z', pitch: 2.2, style: opts.roof || 'black_shingle' },
        { x0: 1, z0: 7, x1: 2, z1: 8, level: 4, axis: 'x', pitch: 2.4, style: opts.roof || 'black_shingle' },
      ],
    });
    S.addProp('anchor_spire', 2 * 2, 4 * 3 + 2.3, 8 * 2, 0, {}); // world adds the belfry spire
    return S;
  },

  // Cinder-block gas station with a pump canopy.
  gas(opts = {}) {
    const S = buildFromPlan({
      name: opts.name || 'Gas station', kind: 'store', seed: opts.seed || 8,
      ext: 'cinder_block', found: 'concrete', floor: 'linoleum',
      levels: [['sssw', 'sssg', 'sssg']],
      rooms: { s: { kind: 'store', floor: 'linoleum', wall: 'interior' }, w: { kind: 'bath', floor: 'tile', wall: 'tile_wall' }, g: { kind: 'storage', floor: 'concrete', wall: 'cinder_block' } },
      doors: [[0, 's', 'w'], [0, 's', 'g']],
      exits: [{ x: 1, z: 2, side: 's', shape: 'storefront_door' }],
      windowAt: (x, z, l, a) => (a === 0 && z === 3 ? (x === 0 || x === 2 ? 'storefront' : 'solid') : 'solid'),
      roof: { type: 'flat' },
    });
    // canopy: columns + roof slab in front, as part of the same structure
    for (let x = 0; x <= 3; x++) for (let z = 5; z <= 7; z++) S.setFloor(x, z, 1, 'tar', 'concrete');
    for (const [x, z] of [[0, 5], [4, 5], [0, 8], [4, 8]]) S.setColumn(x, z, 0, '#e8e6e0');
    S.canopy = { x0: 0, z0: 5, x1: 3, z1: 7 };
    return S;
  },
};

// ------------------------------------------------------------------
// Downtown block: storefront units side by side, front facing +Z.
// units: [{ w, d, levels, kind, sign, style }]
// ------------------------------------------------------------------
const UNIT_LETTERS = 'abcdefghijklmnopqrstuvwxyzαβγδεζηθικλμνξοπρστυφχψω';
export function townBlock(units, name = 'Downtown block') {
  const D = Math.max(...units.map((u) => u.d));
  const maxL = Math.max(...units.map((u) => u.levels));
  const levels = [];
  for (let l = 0; l < maxL; l++) levels.push(Array.from({ length: D }, () => []));
  const rooms = {}, doors = [], exits = [], stairs = [];
  let x0 = 0, li = 0;
  const unitAt = [];
  const take = (def) => { const c = UNIT_LETTERS[li++]; rooms[c] = def; return c; };
  for (const u of units) {
    const W = u.w;
    const off = D - u.d; // align fronts
    const L0 = { s: take({ kind: u.kind === 'office' ? 'office' : u.kind, floor: u.kind === 'diner' ? 'checker' : u.kind === 'bar' ? 'dark_wood' : 'wood', wall: u.kind === 'office' ? 'interior' : 'wallpaper', window: 'storefront' }),
      h: take({ kind: 'hall', floor: 'linoleum', wall: 'interior' }), g: take({ kind: 'storage', floor: 'concrete', wall: 'cinder_block' }) };
    const L1 = { k: take({ kind: 'apartment', floor: 'linoleum', wall: 'interior' }), b: take({ kind: 'bedroom', floor: 'carpet', wall: 'wallpaper_rose' }),
      a: take({ kind: 'bath', floor: 'tile', wall: 'tile_wall', window: 'small_window' }), o: take({ kind: 'living', floor: 'wood', wall: 'interior_blue' }) };
    const L2 = u.levels > 2 ? { q: take({ kind: 'storage', floor: 'wood', wall: 'interior' }) } : null;
    for (let l = 0; l < maxL; l++) for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
      let c = '.';
      const zz = z - off; // unit-local row
      if (zz >= 0 && l < u.levels) {
        if (l === 0) {
          if (zz <= 2) c = L0.g;
          else if (x === W - 1) c = L0.h;
          else c = L0.s;
        } else if (l === 1) {
          if (x === W - 1 && (zz === 4 || zz === 5)) c = L0.h.toUpperCase();
          else if (x === W - 1 && zz === 3) c = L0.h;
          else if (zz <= 1) c = x < W - 2 ? L1.k : L1.b;
          else if (zz === 2) c = x < W - 2 ? L1.o : L1.a;
          else c = L1.o;
          if (u.levels > 2 && x === 0 && (zz === 4 || zz === 5)) c = L1.o; // stair to level 2 sits in the front room
        } else {
          c = (x === 0 && (zz === 4 || zz === 5)) ? L2.q.toUpperCase() : L2.q;
        }
      }
      levels[l][z][x0 + x] = c;
    }
    // doors
    doors.push([0, L0.s, L0.g, 'door'], [0, L0.h, L0.g, 'door']);
    doors.push([1, L0.h, L1.o, 'door'], [1, L0.h, L1.a, 'door'], [1, L1.o, L1.k, 'doorway'], [1, L1.k, L1.b, 'door']);
    // exits: storefront door, street door to stairs, back door
    exits.push({ x: x0 + 1, z: D - 1, side: 's', shape: 'storefront_door' });
    exits.push({ x: x0 + W - 1, z: D - 1, side: 's', shape: 'door' });
    exits.push({ x: x0 + 1, z: off, side: 'n', shape: 'door' });
    stairs.push({ x: x0 + W - 1, z: off + 5, level: 0, dir: 3, color: '#c8b8a0' });
    if (u.levels > 2) stairs.push({ x: x0, z: off + 5, level: 1, dir: 3, color: '#c8b8a0' });
    unitAt.push({ x0, x1: x0 + W - 1, u, off });
    x0 += W;
  }
  const unitOf = (x) => unitAt.find((t) => x >= t.x0 && x <= t.x1);
  const spec = {
    name, kind: 'commercial', seed: units.length,
    ext: units[0].style, found: 'brick', floor: 'wood',
    levels: levels.map((lv) => lv.map((row) => Array.from({ length: x0 }, (_, i) => row[i] || '.').join(''))),
    rooms, doors, exits, stairs,
    windowAt: (x, z, l, a) => {
      const t = unitOf(a === 1 ? Math.min(x, x0 - 1) : x);
      if (!t) return 'solid';
      const front = a === 0 && z === D;
      const back = a === 0 && z === t.off;
      if (front) return l === 0 ? (x === t.x0 + 1 ? 'storefront_door' : x === t.x1 ? 'door' : 'storefront') : 'tall_window';
      if (back) return l === 0 ? 'small_window' : 'window';
      if (a === 1) return l === 0 ? 'solid' : (z % 2 ? 'window' : 'solid');
      return 'window';
    },
    parapetStyleAt: (x) => { const t = unitOf(Math.min(x, x0 - 1)); return t ? t.u.style : units[0].style; },
    roof: { type: 'flat' },
  };
  const S = buildFromPlan(spec);
  // per-unit exterior finishes
  for (const [k, w] of S.walls) {
    const [x, z, l, a] = k.split(',').map(Number);
    const t = unitOf(a === 1 ? Math.min(x, x0 - 1) : x);
    if (!t) continue;
    const st = w.style;
    if (['red_brick', 'tan_brick', 'dark_brick', 'painted_brick', 'white_siding'].includes(st) || st === units[0].style) w.style = t.u.style;
  }
  S.units = unitAt.map((t) => ({ x0: t.x0, x1: t.x1, sign: t.u.sign, levels: t.u.levels, style: t.u.style, kind: t.u.kind, off: t.off }));
  S.depth = D;
  return S;
}
