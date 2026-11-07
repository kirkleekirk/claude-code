// Building designs. Each returns a Structure in canonical orientation
// (front door facing +Z / south). The world generator rotates and places them.
import { buildFromPlan } from './planner.js';

// Adds a full-width front porch along the south side of a plan building.
// x0..x1 inclusive cells, at row z (just outside the house), door cell gets an opening.
function addPorch(S, { x0, x1, z, openAt = [], style = 'white_siding', roof = 'black_shingle', pitch = 0.5, floor = 'porch', found = 'stone', railing = true, columns = '#f4f2ec' }) {
  for (let x = x0; x <= x1; x++) S.setFloor(x, z, 0, floor, found);
  for (let x = x0; x <= x1 + 1; x++) S.setColumn(x, z + 1, 0, columns);
  if (railing) {
    for (let x = x0; x <= x1; x++) if (!openAt.includes(x)) S.setWall(x, z + 1, 0, 0, 'railing', style, true);
    S.setWall(x0, z, 0, 1, 'railing', style, false);
    S.setWall(x1 + 1, z, 0, 1, 'railing', style, true);
  }
  for (let x = x0; x <= x1; x++) S.setRoof(x, z, 1, 1, pitch, roof);
  S.porch = { x0, x1, z, openAt };
}

export const PLANS = {
  // American foursquare farmhouse, 8 x 8 m, two stories, gable roof, front porch.
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
      rooms: {
        k: { kind: 'kitchen', floor: 'checker', wall: 'interior' },
        d: { kind: 'dining', floor: 'wood', wall: 'wallpaper' },
        h: { kind: 'hall', floor: 'wood' },
        l: { kind: 'living', floor: 'wood', wall: 'interior_blue' },
        r: { kind: 'kidroom', floor: 'wood', wall: 'wallpaper_rose' },
        s: { kind: 'bedroom', floor: 'carpet', wall: 'interior' },
        t: { kind: 'kidroom', floor: 'wood', wall: 'wallpaper' },
        b: { kind: 'bath', floor: 'tile', wall: 'tile_wall', window: 'small_window' },
      },
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
    addPorch(S, { x0: 0, x1: 3, z: 4, openAt: [1], style: opts.ext || 'white_siding', roof: opts.roof || 'black_shingle' });
    return S;
  },
};
