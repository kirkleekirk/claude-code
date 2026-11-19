import type { PlaceableId, PropertyId, TrackId } from './ids';

/**
 * The five properties. Each has a Build Mode grid (1 cell = 1 m), door cells that must stay clear,
 * a starting layout, and five upgrade tracks. The world maps the grid onto the interior.
 */

export interface StartPlacement {
  readonly item: PlaceableId;
  readonly x: number;
  readonly y: number;
  readonly rot: 0 | 1 | 2 | 3;
}

export interface TrackDef {
  readonly id: TrackId;
  readonly name: string;
  readonly icon: string;
  /** One line per level 1–3 describing what it adds. */
  readonly levels: readonly [string, string, string];
}

export interface PropertyDef {
  readonly id: PropertyId;
  readonly name: string;
  readonly rank: number;
  /** Purchase price; Ofelia's is inherited. */
  readonly price: number;
  /** `any` accepts dirty cash (with a 10 % cash premium); `clean` needs laundered money. */
  readonly currency: 'any' | 'clean';
  readonly grid: { readonly w: number; readonly h: number };
  /** Cells that must stay free (entrances). */
  readonly doors: ReadonlyArray<readonly [number, number]>;
  /** Cells occupied by walls, pillars or fixtures. */
  readonly blocked: ReadonlyArray<readonly [number, number]>;
  readonly start: readonly StartPlacement[];
  readonly stash: number;
  readonly crew: number;
  /** Multiplier on track upgrade prices. */
  readonly trackScale: number;
  /** Daily legit income (clean) at style level 0, if the property has a storefront. */
  readonly legit: number;
  readonly blurbs: readonly [ramshackle: string, tidy: string, gleaming: string];
}

export const TRACKS: Readonly<Record<TrackId, TrackDef>> = {
  power: { id: 'power', name: 'Power', icon: 'bolt', levels: [
    'New breaker box. Lamps and stations run 6 % faster.',
    'Three-phase line. Another 6 %, and the lights stop flickering.',
    'Backup generator. Storms cannot stop the grind.',
  ] },
  climate: { id: 'climate', name: 'Climate', icon: 'thermo', levels: [
    'Fans that point the right way. Faster growth, slightly better blooms.',
    'Ducted AC. Plants and crew both stop sweating.',
    'Humidity control. Abuela would weep.',
  ] },
  security: { id: 'security', name: 'Security', icon: 'shield', levels: [
    'Deadbolts and a nosy neighbor on retainer.',
    'Cameras on every corner and a panic room shaped like a pantry.',
    'Steel shutters. Raids take a lot less.',
  ] },
  capacity: { id: 'capacity', name: 'Capacity', icon: 'boxes', levels: [
    'More storage and room for another crew member.',
    'A mezzanine. More storage, another crew slot.',
    'The back lot, roofed. Plenty of everything.',
  ] },
  style: { id: 'style', name: 'Style', icon: 'sparkle', levels: [
    'Fresh paint and a sign that is not hanging by one screw.',
    'Terrazzo, plants, good lighting. Crew morale up.',
    'Magazine-ready. Customers and crew both feel it.',
  ] },
};

export const TRACK_PRICES: readonly [number, number, number] = [320, 950, 2600];

export const PROPERTIES: Readonly<Record<PropertyId, PropertyDef>> = {
  ofelias: {
    id: 'ofelias', name: 'Ofelia’s Plants & Bait', rank: 1, price: 0, currency: 'any',
    grid: { w: 10, h: 6 }, doors: [[0, 2], [0, 3]], blocked: [[6, 0], [6, 1], [6, 4], [6, 5]],
    start: [
      { item: 'planterBox', x: 1, y: 0, rot: 0 },
      { item: 'planterBox', x: 3, y: 0, rot: 0 },
      { item: 'planterBox', x: 1, y: 5, rot: 0 },
      { item: 'feedStation', x: 5, y: 0, rot: 0 },
      { item: 'growLamp', x: 3, y: 5, rot: 0 },
      { item: 'workbench', x: 7, y: 0, rot: 0 },
      { item: 'shelf', x: 7, y: 5, rot: 0 },
      { item: 'boxFan', x: 9, y: 0, rot: 0 },
      { item: 'abuelaPortrait', x: 9, y: 3, rot: 0 },
    ],
    stash: 30, crew: 2, trackScale: 1, legit: 90,
    blurbs: [
      'Sun-faded sign, sagging gutters, a greenhouse held together by duct tape and prayer.',
      'Fresh paint, swept floors, and the bait cooler finally stopped buzzing.',
      'The prettiest bait shop in Florida. People stop to take photos of the sign.',
    ],
  },
  palmettoGarage: {
    id: 'palmettoGarage', name: 'Palmetto Garage', rank: 4, price: 8500, currency: 'any',
    grid: { w: 12, h: 8 }, doors: [[0, 3], [0, 4], [11, 3], [11, 4]], blocked: [[5, 0], [6, 0], [5, 7], [6, 7]],
    start: [
      { item: 'feedStation', x: 1, y: 0, rot: 0 },
      { item: 'planterTrough', x: 2, y: 0, rot: 0 },
      { item: 'planterTrough', x: 1, y: 7, rot: 0 },
      { item: 'shelf', x: 9, y: 0, rot: 0 },
    ],
    stash: 60, crew: 4, trackScale: 1.5, legit: 0,
    blurbs: [
      'Two bays, an oil stain shaped like Ohio, and a tire calendar from 1994.',
      'Epoxy floors and grow racks where the lifts used to be.',
      'A showroom for plants. The tire calendar stays; it is vintage now.',
    ],
  },
  harborWarehouse: {
    id: 'harborWarehouse', name: 'Harbor Warehouse 7', rank: 6, price: 24000, currency: 'clean',
    grid: { w: 18, h: 12 }, doors: [[0, 5], [0, 6], [17, 5], [17, 6], [8, 11], [9, 11]],
    blocked: [[6, 4], [6, 7], [11, 4], [11, 7]],
    start: [
      { item: 'feedStation', x: 1, y: 0, rot: 0 },
      { item: 'planterTrough', x: 2, y: 0, rot: 0 },
      { item: 'planterTrough', x: 7, y: 0, rot: 0 },
      { item: 'shelf', x: 15, y: 0, rot: 0 },
      { item: 'shelf', x: 15, y: 11, rot: 0 },
    ],
    stash: 150, crew: 8, trackScale: 3, legit: 0,
    blurbs: [
      'Rust, pigeons and a forklift with no wheels.',
      'Floodlights, clean concrete, and a loading dock that actually loads.',
      'An operation. Pallets, polish and a neon sign facing the water.',
    ],
  },
  stiltHouse: {
    id: 'stiltHouse', name: 'Sawgrass Stilt House', rank: 7, price: 22000, currency: 'any',
    grid: { w: 10, h: 8 }, doors: [[4, 0], [5, 0]], blocked: [[0, 7], [9, 7]],
    start: [
      { item: 'feedStation', x: 0, y: 0, rot: 0 },
      { item: 'planterBox', x: 1, y: 2, rot: 0 },
      { item: 'planterBox', x: 7, y: 2, rot: 0 },
      { item: 'hammock', x: 4, y: 6, rot: 0 },
    ],
    stash: 60, crew: 4, trackScale: 2, legit: 0,
    blurbs: [
      'Leaning, creaking, perfect. The frogs pay no rent.',
      'Screened porch, solar panels, and a dock that holds your weight.',
      'A swamp palace. String lights reflect in the black water.',
    ],
  },
  penthouse: {
    id: 'penthouse', name: 'Dorada Penthouse', rank: 9, price: 90000, currency: 'clean',
    grid: { w: 14, h: 10 }, doors: [[6, 0], [7, 0]], blocked: [[0, 0], [13, 0], [0, 9], [13, 9]],
    start: [
      { item: 'feedStation', x: 1, y: 1, rot: 0 },
      { item: 'aquarium', x: 5, y: 9, rot: 0 },
      { item: 'couch', x: 9, y: 5, rot: 0 },
    ],
    stash: 120, crew: 6, trackScale: 5, legit: 0,
    blurbs: [
      'White marble, empty rooms, and an echo that sounds expensive.',
      'Gold fixtures and a roof garden that faces the whole city.',
      'Your name in neon above the infinity pool. The coast is listening.',
    ],
  },
};
