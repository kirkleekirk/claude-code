// Building system definitions: grid constants, wall shapes, finishes.
//
// Everything built in the world (farmhouses, barns, storefronts and whatever
// the player builds) is made from the same pieces on one global grid:
//   - CELL x CELL floor tiles, at story levels STORY metres apart
//   - wall panels standing on cell edges; each panel is an 8 x 12 grid of
//     0.25 m cells (a "shape") which can be solid, window, door or open
//   - roof slopes, stairs and columns
// A wall's look is its shape plus a finish ("style") for each side.

export const CELL = 2;          // metres per grid cell
export const STORY = 3;         // metres per level
export const WALL_T = 0.2;      // wall thickness
export const HALF_T = WALL_T / 2;
export const SLAB_T = 0.2;      // floor slab thickness
export const SHAPE_COLS = 8;
export const SHAPE_ROWS = 12;
export const SUB = CELL / SHAPE_COLS; // 0.25 m
export const ROOF_TV = 0.2;     // vertical roof thickness
export const EAVE_OV = 0.45;    // eave overhang
export const RAKE_OV = 0.3;     // gable-end overhang
export const STAIR_STEPS = 16;

export const CELL_SOLID = '#';
export const CELL_WINDOW = 'w';
export const CELL_DOOR = 'd';
export const CELL_OPEN = '.';

// Shapes are written top row first; each row has 8 columns, left to right as
// seen from the wall's side A.
function shape(name, rows, extra = {}) {
  if (rows.length !== SHAPE_ROWS || rows.some((r) => r.length !== SHAPE_COLS)) {
    throw new Error('Bad shape ' + name);
  }
  return { name, rows, ...extra };
}
// Helper: build a shape by painting rectangles (col0,row0 from bottom-left).
function paint(name, rects, extra) {
  const g = [];
  for (let r = 0; r < SHAPE_ROWS; r++) g.push(new Array(SHAPE_COLS).fill(CELL_SOLID));
  for (const [ch, c0, c1, r0, r1] of rects) {
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) g[SHAPE_ROWS - 1 - r][c] = ch;
  }
  return shape(name, g.map((r) => r.join('')), extra);
}

export const BUILTIN_SHAPES = {
  solid: paint('Solid wall', []),
  window: paint('Window', [['w', 2, 5, 4, 8]]),
  small_window: paint('Small window', [['w', 3, 4, 5, 8]]),
  wide_window: paint('Wide window', [['w', 1, 6, 4, 8]]),
  picture_window: paint('Picture window', [['w', 1, 6, 3, 9]]),
  door: paint('Door', [['d', 2, 5, 0, 8]]),
  door_left: paint('Door (left)', [['d', 0, 3, 0, 8]]),
  door_window: paint('Door + window', [['d', 0, 3, 0, 8], ['w', 5, 6, 4, 8]]),
  doorway: paint('Doorway', [['.', 2, 5, 0, 8]]),
  wide_opening: paint('Wide opening', [['.', 0, 7, 0, 9]]),
  storefront: paint('Storefront glass', [['w', 0, 7, 2, 10]]),
  storefront_door: paint('Storefront door', [['d', 2, 5, 0, 8], ['w', 2, 5, 9, 10], ['w', 0, 1, 2, 10], ['w', 6, 7, 2, 10]]),
  half_wall: paint('Half wall', [['.', 0, 7, 4, 11]]),
  railing: paint('Railing', [['.', 0, 7, 4, 11]], { thin: true }),
  barn_door: paint('Barn door', [['d', 0, 7, 0, 9]]),
  loft_door: paint('Loft door', [['d', 2, 5, 2, 9]]),
  garage: paint('Garage opening', [['.', 0, 7, 0, 9]]),
  high_window: paint('High window', [['w', 1, 6, 8, 9]]),
  tall_window: paint('Tall window', [['w', 2, 5, 2, 9]]),
  arch_window: paint('Twin windows', [['w', 1, 2, 4, 9], ['w', 5, 6, 4, 9]]),
};

// Finishes. `mat` refers to a texture/material id in materials.js.
export const BUILTIN_STYLES = {
  white_siding:  { name: 'White clapboard', a: { mat: 'siding', color: '#efece4' }, b: { mat: 'plaster', color: '#e9e1cf' }, trim: '#fbfaf6' },
  yellow_siding: { name: 'Yellow clapboard', a: { mat: 'siding', color: '#e6d18e' }, b: { mat: 'plaster', color: '#ebe3d0' }, trim: '#fbfaf6' },
  blue_siding:   { name: 'Blue clapboard', a: { mat: 'siding', color: '#9eb2c4' }, b: { mat: 'plaster', color: '#e8e2d4' }, trim: '#fbfaf6' },
  sage_siding:   { name: 'Sage clapboard', a: { mat: 'siding', color: '#a7b38f' }, b: { mat: 'plaster', color: '#ece6d6' }, trim: '#fbfaf6' },
  gray_siding:   { name: 'Gray clapboard', a: { mat: 'siding', color: '#b9b6ae' }, b: { mat: 'plaster', color: '#e6e0d2' }, trim: '#f4f2ec' },
  red_brick:     { name: 'Red brick', a: { mat: 'brick', color: '#ffffff' }, b: { mat: 'plaster', color: '#e6dcc6' }, trim: '#e8dfc8' },
  dark_brick:    { name: 'Dark brick', a: { mat: 'brick', color: '#9c8f86' }, b: { mat: 'plaster', color: '#e3dccb' }, trim: '#2f3b33' },
  tan_brick:     { name: 'Tan brick', a: { mat: 'brick', color: '#e8cfaa' }, b: { mat: 'plaster', color: '#e8e1cf' }, trim: '#5a3326' },
  painted_brick: { name: 'Painted brick', a: { mat: 'paintedBrick', color: '#d8d0bf' }, b: { mat: 'plaster', color: '#e6dfcf' }, trim: '#3d4a42' },
  barn_red:      { name: 'Barn red boards', a: { mat: 'boardBatten', color: '#a3322a' }, b: { mat: 'boardBatten', color: '#b69a78' }, trim: '#f1eee6' },
  barn_white:    { name: 'White barn boards', a: { mat: 'boardBatten', color: '#ebe7de' }, b: { mat: 'boardBatten', color: '#b69a78' }, trim: '#ebe7de' },
  weathered:     { name: 'Weathered boards', a: { mat: 'boardBatten', color: '#9a8f80' }, b: { mat: 'boardBatten', color: '#a89478' }, trim: '#8d8273' },
  metal_shed:    { name: 'Sheet metal', a: { mat: 'metal', color: '#c4c7c9' }, b: { mat: 'metal', color: '#a9acaf' }, trim: '#9fa3a6' },
  green_metal:   { name: 'Green sheet metal', a: { mat: 'metal', color: '#6f8a6a' }, b: { mat: 'metal', color: '#a9acaf' }, trim: '#e8e8e2' },
  scrap_planks:  { name: 'Scrap planks', a: { mat: 'planks', color: '#ffffff' }, b: { mat: 'planks', color: '#e6e0d6' }, trim: '#8a6b4c' },
  cinder_block:  { name: 'Cinder block', a: { mat: 'cinder', color: '#d2cfc8' }, b: { mat: 'cinder', color: '#d8d5ce' }, trim: '#9b9892' },
  fieldstone:    { name: 'Fieldstone', a: { mat: 'stone', color: '#ffffff' }, b: { mat: 'plaster', color: '#e6dfcf' }, trim: '#d8d2c4' },
  concrete:      { name: 'Concrete', a: { mat: 'concrete', color: '#e6e3dc' }, b: { mat: 'concrete', color: '#e6e3dc' }, trim: '#bdbab3' },
  interior:      { name: 'Interior plaster', a: { mat: 'plaster', color: '#ebe4d2' }, b: { mat: 'plaster', color: '#ebe4d2' }, trim: '#f7f4ec' },
  interior_blue: { name: 'Interior blue', a: { mat: 'plaster', color: '#bfcbd2' }, b: { mat: 'plaster', color: '#ebe4d2' }, trim: '#f7f4ec' },
  wallpaper:     { name: 'Wallpaper', a: { mat: 'wallpaper', color: '#e2d2ae' }, b: { mat: 'wallpaper', color: '#e2d2ae' }, trim: '#f7f4ec' },
  wallpaper_rose:{ name: 'Rose wallpaper', a: { mat: 'wallpaper', color: '#e3c2bb' }, b: { mat: 'plaster', color: '#ebe4d2' }, trim: '#f7f4ec' },
  tile_wall:     { name: 'Tiled wall', a: { mat: 'tileWhite', color: '#f2f2ee' }, b: { mat: 'plaster', color: '#ebe4d2' }, trim: '#f7f4ec' },
};

export const FLOOR_STYLES = {
  wood:      { name: 'Wood floor', top: { mat: 'woodFloor', color: '#ffffff' }, bottom: { mat: 'plaster', color: '#f0ebe0' } },
  dark_wood: { name: 'Dark wood floor', top: { mat: 'woodFloor', color: '#9a8070' }, bottom: { mat: 'plaster', color: '#f0ebe0' } },
  checker:   { name: 'Checker tile', top: { mat: 'tileChecker', color: '#ffffff' }, bottom: { mat: 'plaster', color: '#f0ebe0' } },
  tile:      { name: 'White tile', top: { mat: 'tileWhite', color: '#ffffff' }, bottom: { mat: 'plaster', color: '#f0ebe0' } },
  carpet:    { name: 'Carpet', top: { mat: 'carpet', color: '#8c8070' }, bottom: { mat: 'plaster', color: '#f0ebe0' } },
  carpet_blue: { name: 'Blue carpet', top: { mat: 'carpet', color: '#6e7f92' }, bottom: { mat: 'plaster', color: '#f0ebe0' } },
  linoleum:  { name: 'Linoleum', top: { mat: 'linoleum', color: '#e9e2cc' }, bottom: { mat: 'plaster', color: '#f0ebe0' } },
  concrete:  { name: 'Concrete', top: { mat: 'concrete', color: '#d9d6cf' }, bottom: { mat: 'concrete', color: '#d9d6cf' } },
  planks:    { name: 'Rough planks', top: { mat: 'planks', color: '#ffffff' }, bottom: { mat: 'planks', color: '#d6cfc4' } },
  porch:     { name: 'Porch boards', top: { mat: 'planks', color: '#b8b4ae' }, bottom: { mat: 'planks', color: '#d8d4cc' } },
  barn:      { name: 'Barn boards', top: { mat: 'planks', color: '#c8b8a0' }, bottom: { mat: 'planks', color: '#b8a890' } },
  attic:     { name: 'Attic boards', top: { mat: 'planks', color: '#d8ccb8' }, bottom: { mat: 'plaster', color: '#f0ebe0' } },
  tar:       { name: 'Flat roof', top: { mat: 'tarRoof', color: '#ffffff' }, bottom: { mat: 'plaster', color: '#ece6da' } },
};

export const FOUNDATIONS = {
  concrete: { name: 'Concrete', mat: 'concrete', color: '#d6d2ca' },
  stone:    { name: 'Fieldstone', mat: 'stone', color: '#ffffff' },
  brick:    { name: 'Brick', mat: 'brick', color: '#ffffff' },
  cinder:   { name: 'Cinder block', mat: 'cinder', color: '#d2cfc8' },
};

export const ROOF_STYLES = {
  black_shingle: { name: 'Black shingles', top: { mat: 'shingles', color: '#4a4b4f' }, under: { mat: 'planks', color: '#d8d0c4' }, fascia: '#f4f2ec' },
  brown_shingle: { name: 'Brown shingles', top: { mat: 'shingles', color: '#6e5a4b' }, under: { mat: 'planks', color: '#d8d0c4' }, fascia: '#f4f2ec' },
  gray_shingle:  { name: 'Gray shingles', top: { mat: 'shingles', color: '#7d7e80' }, under: { mat: 'planks', color: '#d8d0c4' }, fascia: '#f4f2ec' },
  green_shingle: { name: 'Green shingles', top: { mat: 'shingles', color: '#5d6e5a' }, under: { mat: 'planks', color: '#d8d0c4' }, fascia: '#f4f2ec' },
  red_metal:     { name: 'Red metal', top: { mat: 'roofMetal', color: '#93322b' }, under: { mat: 'planks', color: '#c8b8a0' }, fascia: '#f1eee6' },
  silver_metal:  { name: 'Galvanized metal', top: { mat: 'roofMetal', color: '#c3c7ca' }, under: { mat: 'planks', color: '#c8b8a0' }, fascia: '#c3c7ca' },
  green_metal:   { name: 'Green metal', top: { mat: 'roofMetal', color: '#4c6a52' }, under: { mat: 'planks', color: '#c8b8a0' }, fascia: '#e8e8e2' },
  shake:         { name: 'Cedar shake', top: { mat: 'shake', color: '#ffffff' }, under: { mat: 'planks', color: '#d8d0c4' }, fascia: '#8a6b4c' },
};

export const PITCHES = [0.5, 1.0, 1.5, 2.0, 2.5];

// Resource costs per piece (wood, metal, stone).
export const COSTS = {
  floor: { wood: 2, stone: 1 },
  foundation: { stone: 3 },
  wall: { wood: 3 },
  roof: { wood: 2, metal: 1 },
  stairs: { wood: 6 },
  column: { wood: 1 },
};
export const MAT_COST_KIND = {
  siding: 'wood', planks: 'wood', boardBatten: 'wood', plaster: 'wood', wallpaper: 'wood', trim: 'wood',
  brick: 'stone', paintedBrick: 'stone', cinder: 'stone', stone: 'stone', concrete: 'stone', tileWhite: 'stone',
  metal: 'metal',
};

// ---- registries that also hold player-made designs ----
export const shapes = { ...BUILTIN_SHAPES };
export const styles = { ...BUILTIN_STYLES };

export function getShape(id) { return shapes[id] || shapes.solid; }
export function getStyle(id) { return styles[id] || styles.white_siding; }

// Parse a shape into a [row][col] grid with row 0 at the bottom.
const parsedCache = new Map();
export function shapeGrid(id) {
  const s = getShape(id);
  const key = id + '|' + s.rows.join('');
  let g = parsedCache.get(key);
  if (!g) {
    g = [];
    for (let r = 0; r < SHAPE_ROWS; r++) g.push(s.rows[SHAPE_ROWS - 1 - r].split(''));
    parsedCache.set(key, g);
  }
  return g;
}

export function registerShape(id, def) { shapes[id] = def; }
export function registerStyle(id, def) { styles[id] = def; }

// Edge/vertex/cell keys
export const cellKey = (x, z, l) => `${x},${z},${l}`;
export const wallKey = (x, z, l, a) => `${x},${z},${l},${a}`;
export const vertKey = (x, z, l) => `${x},${z},${l}`;
export const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // +X, +Z, -X, -Z

// Wall grid in e-order (k increases with the edge's axis), rows from the bottom.
export function wallGridE(w, a) {
  const src = shapeGrid(w.shape);
  let eInc = a === 0 ? !!w.flip : !w.flip;
  if (w.mirror) eInc = !eInc;
  const g = [];
  for (let r = 0; r < SHAPE_ROWS; r++) {
    const row = [];
    for (let k = 0; k < SHAPE_COLS; k++) row.push(src[r][eInc ? k : SHAPE_COLS - 1 - k]);
    g.push(row);
  }
  return g;
}
