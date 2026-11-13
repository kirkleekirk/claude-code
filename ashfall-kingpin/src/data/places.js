// Hand-authored master plan. Identical every new game; only decoration is seeded.
// `anchor` is the brief's anchor tile; `at` is the top-left of the footprint actually used.
// The validator asserts |footprint centre - anchor| <= 4 on both axes.

export const WORLD_W = 128;
export const WORLD_H = 128;
export const TILE = 16;
export const CHUNK = 16;

// Size classes: [width, height] in tiles (world orientation; a rotated M is listed as [26, 32]).
export const SIZE = { S: [24, 20], M: [32, 26], L: [40, 32], XL: [52, 40], C: [16, 12] };

// HQ / vault footprint per size class: [w, d] (w across the main street, d along it).
export const HQ_SIZE = { S: [7, 5], M: [9, 6], L: [11, 6], XL: [13, 7], C: [7, 5] };
// Plaza [w, d] and whether the template gets a cross street.
export const PLAZA = { S: [7, 4, false], M: [9, 5, true], L: [11, 5, true], XL: [13, 7, true], C: [0, 0, false] };

export const PLACES = [
  {
    id: 'hollow', name: 'The Hollow', kind: 'hollow', anchor: [64, 104], at: [46, 90], w: 36, h: 32, gate: 'N',
    palette: 'hollow', faction: 'player', blurb: 'Your rusted rail depot. Grow, forge and stash here.',
  },
  {
    id: 'millbrook', name: 'Millbrook Rest', kind: 'settlement', size: 'S', anchor: [28, 96], at: [18, 90], w: 24, h: 20, gate: 'N',
    palette: 'farm', faction: 'compact', wealth: 60, traffic: 0.8, drugTolerance: 1.0, lots: 2, guards: 5, folk: 8,
    hq: { name: 'Grain Depot', role: 'hq' },
    buildings: [['tavern', 'The Tired Mule'], ['store', 'Feed & Seed'], ['barracks', 'Watch House']],
    blurb: 'A farming village of tired people and good soil. Easy money, small demand.',
  },
  {
    id: 'coppergate', name: 'Copper Gate', kind: 'settlement', size: 'M', anchor: [104, 84], at: [88, 71], w: 32, h: 26, gate: 'W',
    palette: 'mining', faction: 'compact', wealth: 110, traffic: 1.0, drugTolerance: 1.1, lots: 3, guards: 8, folk: 10,
    hq: { name: 'Assay Office', role: 'hq' },
    buildings: [['tavern', 'The Rusty Pick'], ['gunshop', 'Brass Tacks Guns'], ['fence', "Lucky Lou's"], ['barracks', 'Militia Post'], ['clinic', 'Patch Clinic']],
    blurb: 'Mining town with a hunger for iron. Best gun market and a fence that asks no questions.',
  },
  {
    id: 'harbor9', name: 'Harbor Nine', kind: 'settlement', size: 'M', anchor: [16, 58], at: [4, 49], w: 32, h: 26, gate: 'E',
    palette: 'port', faction: 'compact', wealth: 120, traffic: 1.2, drugTolerance: 1.2, lots: 3, guards: 8, folk: 11,
    hq: { name: 'Customs House', role: 'hq' },
    buildings: [['tavern', 'The Brine'], ['smuggler', 'Pier Nine Exchange'], ['store', 'Net & Tackle'], ['barracks', 'Harbor Watch']],
    blurb: 'Port of smugglers. Bulk buyers pay less but never talk.',
  },
  {
    id: 'stverity', name: 'Saint Verity', kind: 'settlement', size: 'M', anchor: [30, 28], at: [13, 14], w: 26, h: 32, gate: 'S',
    palette: 'pious', faction: 'compact', wealth: 150, traffic: 0.9, drugTolerance: 0.35, lots: 3, guards: 9, folk: 10,
    hq: { name: 'Reliquary Vault', role: 'hq' },
    buildings: [['chapel', 'Chapel of the Verity'], ['tavern', 'Pilgrim Hostel'], ['clinic', 'Mercy House'], ['barracks', 'Verity Guard']],
    blurb: 'Pious enclave. Hates drugs, loves clean money. Fronts here launder beautifully.',
  },
  {
    id: 'foundry', name: 'The Foundry', kind: 'settlement', size: 'L', anchor: [106, 38], at: [94, 18], w: 32, h: 40, gate: 'S',
    palette: 'industrial', faction: 'compact', wealth: 170, traffic: 1.1, drugTolerance: 0.8, lots: 4, guards: 12, folk: 12,
    hq: { name: 'Armory Keep', role: 'hq' },
    buildings: [['armory', 'Foundry Exchange'], ['tavern', 'Slag & Ale'], ['workshop', 'Rivet Works'], ['barracks', 'Iron Watch'], ['barracks', 'Gate Watch'], ['clinic', 'Burn Ward']],
    blurb: 'Industrial fortress. The best materials in the wastes, and the guards to match.',
  },
  {
    id: 'newhaven', name: 'New Haven', kind: 'settlement', size: 'XL', anchor: [64, 18], at: [40, 2], w: 52, h: 40, gate: 'S',
    palette: 'capital', faction: 'compact', wealth: 260, traffic: 1.4, drugTolerance: 0.7, lots: 5, guards: 16, folk: 16, capital: true,
    hq: { name: 'Council Hall', role: 'hq' },
    buildings: [['store', 'Haven Market Hall'], ['tavern', 'The Last Light'], ['bank', 'Compact Treasury'], ['barracks', 'Warden Barracks'], ['barracks', 'North Barracks'], ['clinic', 'Haven Infirmary']],
    blurb: 'The last city and seat of the Compact. Rich, watchful and very far from forgiving.',
  },
  {
    id: 'crossroads', name: 'Crossroads Market', kind: 'market', anchor: [64, 64], at: [55, 57], w: 18, h: 14, gate: 'X',
    palette: 'market', faction: 'neutral', wealth: 90, traffic: 1.3, drugTolerance: 1.5, noViolence: true,
    blurb: 'Neutral black market. No guns drawn, no questions asked. Mags keeps a stall here.',
  },
  {
    id: 'rustjaw', name: 'Rustjaw Fort', kind: 'camp', size: 'C', anchor: [96, 112], at: [88, 106], w: 16, h: 12, gate: 'N',
    palette: 'rustjaw', faction: 'rustjaw', hq: { name: "Marlo's Hall", role: 'hq' }, buildings: [['barracks', 'Bunkhouse'], ['warehouse', 'Scrap Store']],
    blurb: 'Rustjaw Raiders stronghold. Loud, hungry for guns.',
  },
  {
    id: 'palehand', name: 'Pale Hand Warehouses', kind: 'camp', size: 'C', anchor: [8, 78], at: [4, 76], w: 16, h: 12, gate: 'S',
    palette: 'palehand', faction: 'palehand', hq: { name: "Vane's Office", role: 'hq' }, buildings: [['warehouse', 'Bonded Store'], ['barracks', 'Dock Crew']],
    blurb: 'The Pale Hand: smugglers, price-cutters and poachers.',
  },
  {
    id: 'ashchoir', name: 'Ash Choir Cathedral', kind: 'camp', size: 'C', anchor: [80, 50], at: [73, 48], w: 14, h: 12, gate: 'S',
    palette: 'ashchoir', faction: 'ashchoir', hq: { name: 'The Nave', role: 'hq' }, buildings: [['barracks', 'Choir Loft'], ['warehouse', 'Ember Store']],
    blurb: 'A cult that sings to the ash. Saboteurs, blight-bringers, recruiters.',
  },
  // Ruins: tier I-IV loot. `open` is the side with the main gap in the fence.
  { id: 'ruin_motel', name: 'Gutted Motel', kind: 'ruin', tier: 1, anchor: [54, 78], at: [47, 72], w: 14, h: 12, open: 'E', palette: 'ruin', enemies: 'dogs', blurb: 'Ruin I. Feral dogs and loose scrap. Close to home.' },
  { id: 'ruin_silo', name: 'Collapsed Silo', kind: 'ruin', tier: 1, anchor: [28, 116], at: [21, 111], w: 14, h: 11, open: 'E', palette: 'ruin', enemies: 'dogs', blurb: 'Ruin I. Grain bins full of rust.' },
  { id: 'ruin_busdepot', name: 'Old Bus Depot', kind: 'ruin', tier: 2, anchor: [54, 51], at: [47, 47], w: 12, h: 9, open: 'N', palette: 'ruin', enemies: 'scav', blurb: 'Ruin II. Scavenger squatters.' },
  { id: 'ruin_chapel', name: 'Drowned Chapel', kind: 'ruin', tier: 2, anchor: [8, 104], at: [3, 98], w: 14, h: 12, open: 'N', palette: 'ruin', enemies: 'scav', blurb: 'Ruin II. Half sunk in the marsh.' },
  { id: 'ruin_graveyard', name: 'Caravan Graveyard', kind: 'ruin', tier: 2, anchor: [118, 110], at: [111, 105], w: 14, h: 10, open: 'N', palette: 'ruin', enemies: 'raiders', blurb: 'Ruin II. Wrecked trucks in the dunes.' },
  { id: 'ruin_signal', name: 'Signal Tower', kind: 'ruin', tier: 3, anchor: [120, 64], at: [114, 60], w: 12, h: 10, open: 'W', palette: 'ruin', enemies: 'raiders', blurb: 'Ruin III. Old relay station, old tech.' },
  { id: 'ruin_mall', name: 'Sunken Mall', kind: 'ruin', tier: 3, anchor: [20, 6], at: [16, 1], w: 14, h: 10, open: 'W', palette: 'ruin', enemies: 'zealots', blurb: 'Ruin III. Collapsed shopping arcade.' },
  { id: 'ruin_transformer', name: 'Transformer Yard', kind: 'ruin', tier: 4, anchor: [112, 8], at: [105, 3], w: 14, h: 10, open: 'S', palette: 'ruin', enemies: 'elite', blurb: 'Ruin IV. Pre-Collapse power yard. Alloy, if you live.' },
];

export const PLACE = Object.fromEntries(PLACES.map((p) => [p.id, p]));
export const SETTLEMENTS = PLACES.filter((p) => p.kind === 'settlement');
export const SETTLEMENT_IDS = SETTLEMENTS.map((p) => p.id);
export const CAMPS = PLACES.filter((p) => p.kind === 'camp');
export const RUINS = PLACES.filter((p) => p.kind === 'ruin');
export const MARKET_IDS = [...SETTLEMENT_IDS, 'crossroads'];

// Roads: 3-wide asphalt with curbs (ring road, spokes, spurs). Polylines of tile centres, axis-aligned.
export const ROADS = [
  { id: 'ring', pts: [[44, 44], [90, 44], [90, 66], [84, 66], [84, 86], [44, 86], [44, 44]] },
  { id: 'spoke_n', pts: [[66, 42], [66, 50], [64, 50], [64, 56]] },
  { id: 'spoke_s', pts: [[64, 71], [64, 89]] },
  { id: 'spoke_w', pts: [[36, 62], [50, 62], [50, 64], [54, 64]] },
  { id: 'spoke_e', pts: [[73, 64], [89, 64]] },
  { id: 'spur_sv', pts: [[26, 46], [26, 47], [43, 47]] },
  { id: 'spur_foundry', pts: [[110, 58], [110, 66], [92, 66]] },
  { id: 'spur_copper', pts: [[86, 84], [87, 84]] },
  { id: 'spur_mill', pts: [[30, 89], [30, 86], [43, 86]] },
];

// Dirt tracks (2-wide) to camps and ruins. Brush covers [c, c+1].
export const TRACKS = [
  { id: 't_rustjaw', pts: [[84, 88], [84, 100], [95, 100], [95, 105]] },
  { id: 't_graveyard', pts: [[96, 100], [117, 100], [117, 104]] },
  { id: 't_signal', pts: [[112, 63], [113, 63]] },
  { id: 't_transformer', pts: [[92, 42], [92, 14], [111, 14], [111, 13]] },
  { id: 't_mall', pts: [[24, 46], [8, 46], [8, 5], [15, 5]] },
  { id: 't_silo', pts: [[42, 88], [42, 115], [35, 115]] },
  { id: 't_chapel', pts: [[28, 88], [9, 88], [9, 97]] },
  { id: 't_ashchoir', pts: [[79, 60], [79, 62]] },
  { id: 't_busdepot', pts: [[52, 46], [53, 46]] },
  { id: 't_motel', pts: [[61, 77], [62, 77]] },
];

// Hand-painted 32x32 biome map (each cell = 4x4 tiles), upsampled with seeded edge noise.
// W sea, M flooded marsh, C ruined city, B rocky badlands, D ash dunes, F dead farmland, G dry scrub.
export const BIOME_MAP = [
  'MMCCCCCCCCCCCCCCCCCCCCCCBBBBBBBB',
  'MMCCCCCCCCCCCCCCCCCCCCCCBBBBBBBB',
  'MMCCCCCCCCCCCCCCCCCCCCCCBBBBBBBB',
  'WMMCCCCCCCCCCCCCCCCCCCCCBBBBBBBB',
  'WMMCCCCCCCCCCCCCCCCCCCCCBBBBBBBB',
  'WMMCCCCCCCCCCCCCCCCCCCCCBBBBBBBB',
  'WMMMCCCCCCCCCCCCCCCCCCCCBBBBBBBB',
  'WMMMCCCCCCCCCCCCCCCCCCCBBBBBBBBB',
  'WMMMMCCCCCCCCCCCCCCCCCCBBBBBBBBB',
  'WMMMMGGGCCCCCCCCCCCCCCBBBBBBBBBB',
  'WMMMMGGGGGGCCCCCCCCCCBBBBBBBBBBB',
  'WMMMMGGGGGGGGGGGGGGBBBBBBBBBBBBB',
  'WMMMMGGGGGGGGGGGGGGBBBBBBBBBBDDD',
  'WMMMMGGGGGGGGGGGGGGBBBBBBBBBDDDD',
  'WMMMMGGGGGGGGGGGGGGGBBBBBBBDDDDD',
  'WMMMMGGGGGGGGGGGGGGGBBBBBBBDDDDD',
  'WMMMMGGGGGGGGGGGGGGGBBBBBBDDDDDD',
  'WMMMMGGGGGGGGGGGGGGGBBBBBBDDDDDD',
  'WMMMMMGGGGGGGGGGGGGGGBBBBBDDDDDD',
  'WMMMMMGGGGGGGGGGGGGGGBBBBDDDDDDD',
  'WMMMMMGGGGGGGGGGGGGGGGBBBDDDDDDD',
  'WMMMMMFFFFFFFFFFFFFFFGBBBDDDDDDD',
  'WMMMMFFFFFFFFFFFFFFFFFFBDDDDDDDD',
  'WMMMMFFFFFFFFFFFFFFFFFFDDDDDDDDD',
  'WMMMMFFFFFFFFFFFFFFFFFFDDDDDDDDD',
  'WMMMMFFFFFFFFFFFFFFFFFFDDDDDDDDD',
  'WMMMMFFFFFFFFFFFFFFFFFFDDDDDDDDD',
  'WMMMMFFFFFFFFFFFFFFFFFFDDDDDDDDD',
  'WWMMMFFFFFFFFFFFFFFFFFDDDDDDDDDD',
  'WWMMMFFFFFFFFFFFFFFFFFDDDDDDDDDD',
  'WWWMMFFFFFFFFFFFFFFFFFDDDDDDDDDD',
  'WWWMMFFFFFFFFFFFFFFFFFDDDDDDDDDD',
];

// Building archetypes: footprint [w, h] (w along the street frontage), floor, interior props.
export const ARCHETYPES = {
  tavern:   { size: [6, 5], floor: 'plank', props: ['bar', 'table', 'table', 'barrel'], sign: 'TAVERN', lamp: true },
  store:    { size: [5, 4], floor: 'plank', props: ['shelf', 'crates', 'shelf'], sign: 'STORE', lamp: true },
  barracks: { size: [5, 4], floor: 'stone', props: ['bunk', 'bunk', 'rack'], sign: 'WATCH', lamp: true },
  clinic:   { size: [5, 4], floor: 'tile', props: ['cot', 'shelf'], sign: 'CLINIC', lamp: true },
  gunshop:  { size: [5, 4], floor: 'plank', props: ['rack', 'bench', 'crates'], sign: 'GUNS', lamp: true },
  fence:    { size: [4, 4], floor: 'plank', props: ['crates', 'shelf'], sign: 'PAWN', lamp: true },
  smuggler: { size: [6, 4], floor: 'plank', props: ['crates', 'crates', 'barrel'], sign: 'EXCHANGE', lamp: true },
  chapel:   { size: [6, 5], floor: 'stone', props: ['pew', 'pew', 'altar'], sign: 'CHAPEL', lamp: true },
  armory:   { size: [6, 5], floor: 'stone', props: ['rack', 'crates', 'anvil'], sign: 'EXCHANGE', lamp: true },
  workshop: { size: [5, 4], floor: 'stone', props: ['anvil', 'bench', 'crates'], sign: 'WORKS', lamp: true },
  bank:     { size: [6, 4], floor: 'tile', props: ['desk', 'safe', 'desk'], sign: 'TREASURY', lamp: true },
  warehouse:{ size: [6, 4], floor: 'plank', props: ['crates', 'crates', 'barrel', 'crates'], sign: '', lamp: false },
  lot:      { size: [5, 4], floor: 'plank', props: ['crates'], sign: 'FOR SALE', lamp: false },
  house:    { size: [4, 4], floor: 'plank', props: ['bed', 'table'], sign: '', lamp: false },
  hq:       { size: null, floor: 'tile', props: ['desk', 'crates', 'desk'], sign: '', lamp: true },
  ruin:     { size: [5, 4], floor: 'rubble', props: ['rubble'], sign: '', lamp: false },
};

export const HOUSE_SIZES = [[5, 4], [4, 4]];

// Material palettes: settlements differ by these, never by geometry.
export const STYLES = {
  hollow:     { wall: 'rust', roof: 'tin', roofRamp: 'rust', street: 'dirtfloor', lane: 'dirtfloor', plaza: 'concrete', fence: 'metal', banner: 'amber', trim: 'wood' },
  farm:       { wall: 'wood', roof: 'shingle', roofRamp: 'rust', street: 'dirtfloor', lane: 'dirtfloor', plaza: 'cobble', fence: 'wood', banner: 'olive', trim: 'sand' },
  mining:     { wall: 'ink', roof: 'tin', roofRamp: 'rust', street: 'cobble', lane: 'dirtfloor', plaza: 'cobble', fence: 'metal', banner: 'gold', trim: 'rust' },
  port:       { wall: 'sea', roof: 'tarp', roofRamp: 'teal', street: 'plank', lane: 'dirtfloor', plaza: 'plank', fence: 'wood', banner: 'sea', trim: 'wood' },
  pious:      { wall: 'bone', roof: 'shingle', roofRamp: 'teal', street: 'cobble', lane: 'cobble', plaza: 'tile', fence: 'stone', banner: 'gold', trim: 'gold' },
  industrial: { wall: 'rust', roof: 'flat', roofRamp: 'ink', street: 'concrete', lane: 'concrete', plaza: 'concrete', fence: 'metal', banner: 'heat', trim: 'ink' },
  capital:    { wall: 'bone', roof: 'flat', roofRamp: 'teal', street: 'concrete', lane: 'cobble', plaza: 'tile', fence: 'stone', banner: 'teal', trim: 'teal' },
  market:     { wall: 'wood', roof: 'tarp', roofRamp: 'amber', street: 'dirtfloor', lane: 'dirtfloor', plaza: 'cobble', fence: 'wood', banner: 'gold', trim: 'wood' },
  rustjaw:    { wall: 'rust', roof: 'tin', roofRamp: 'rust', street: 'dirtfloor', lane: 'dirtfloor', plaza: 'dirtfloor', fence: 'metal', banner: 'heat', trim: 'ink' },
  palehand:   { wall: 'bone', roof: 'flat', roofRamp: 'bone', street: 'plank', lane: 'dirtfloor', plaza: 'plank', fence: 'wood', banner: 'bone', trim: 'ink' },
  ashchoir:   { wall: 'ink', roof: 'shingle', roofRamp: 'ink', street: 'cobble', lane: 'dirtfloor', plaza: 'cobble', fence: 'stone', banner: 'heat', trim: 'heat' },
  ruin:       { wall: 'ink', roof: 'collapsed', roofRamp: 'ink', street: 'rubblefloor', lane: 'rubblefloor', plaza: 'rubblefloor', fence: 'metal', banner: 'ink', trim: 'ink' },
};
