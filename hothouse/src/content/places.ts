/**
 * Districts and named places of Halcyon Bay. This file is the shared vocabulary between the world
 * (which gives every id a position and a building), the empire simulation (customers' hangouts,
 * meeting points, shops, properties) and the interface (map labels, objectives).
 *
 * The sim never deals in coordinates: it refers to places by id and the world resolves them.
 */

export const DISTRICT_IDS = ['flats', 'strand', 'deco', 'crown', 'harbor', 'sawgrass', 'isla', 'keys'] as const;
export type DistrictId = (typeof DISTRICT_IDS)[number];

export interface DistrictDef {
  readonly id: DistrictId;
  readonly name: string;
  /** One line for the map and the loading screen. */
  readonly blurb: string;
  /** Map tint (sRGB hex). Colour-blind mode pairs it with `pattern`. */
  readonly color: string;
  readonly pattern: 'dots' | 'stripes' | 'waves' | 'grid' | 'cross' | 'reeds' | 'scales' | 'chevrons';
  /** Baseline police presence 0–1 (day); night presence is derived per district. */
  readonly policeDay: number;
  readonly policeNight: number;
  /** Customer budget multiplier. */
  readonly wealth: number;
}

export const DISTRICTS: Readonly<Record<DistrictId, DistrictDef>> = {
  flats: {
    id: 'flats', name: 'Palmetto Flats', blurb: 'Pastel bungalows, cul-de-sacs and strip malls. Home.',
    color: '#B8F54A', pattern: 'dots', policeDay: 0.18, policeNight: 0.25, wealth: 0.9,
  },
  strand: {
    id: 'strand', name: 'Neon Strand', blurb: 'Boardwalk, pier, skate park and the loudest sunsets in Florida.',
    color: '#FF3D8B', pattern: 'stripes', policeDay: 0.3, policeNight: 0.62, wealth: 1.0,
  },
  deco: {
    id: 'deco', name: 'Deco Row', blurb: 'Pastel hotels, chrome diners and rooftop pools.',
    color: '#FFD166', pattern: 'chevrons', policeDay: 0.35, policeNight: 0.4, wealth: 1.45,
  },
  crown: {
    id: 'crown', name: 'Crown Point', blurb: 'Glass towers, billboards, the bank and the courthouse.',
    color: '#7FB6FF', pattern: 'grid', policeDay: 0.6, policeNight: 0.5, wealth: 1.6,
  },
  harbor: {
    id: 'harbor', name: 'Cobalt Harbor', blurb: 'Cranes, containers and the fish market. Vale’s turf.',
    color: '#17E0C8', pattern: 'cross', policeDay: 0.32, policeNight: 0.3, wealth: 1.1,
  },
  sawgrass: {
    id: 'sawgrass', name: 'The Sawgrass', blurb: 'Mangroves, stilt shacks and airboats. Nobody asks questions.',
    color: '#8BD17C', pattern: 'reeds', policeDay: 0.08, policeNight: 0.06, wealth: 0.75,
  },
  isla: {
    id: 'isla', name: 'Isla Dorada', blurb: 'Private island of mansions, a marina and the yacht club.',
    color: '#FF9A3C', pattern: 'scales', policeDay: 0.42, policeNight: 0.38, wealth: 2.4,
  },
  keys: {
    id: 'keys', name: 'Saltwater Keys', blurb: 'Fishing islets, bait shacks and the lighthouse.',
    color: '#9C8CFF', pattern: 'waves', policeDay: 0.1, policeNight: 0.12, wealth: 0.85,
  },
};

export type PlaceKind =
  | 'property' // owned or purchasable operations
  | 'front' // laundering businesses
  | 'shop' // buy things
  | 'service' // lawyer, garage, bank
  | 'hangout' // where customers spend time; walk-up and meet spots
  | 'landmark' // visible from afar, navigation
  | 'meet'; // quiet handoff spots

export interface PlaceDef {
  readonly id: string;
  readonly name: string;
  readonly district: DistrictId;
  readonly kind: PlaceKind;
  /** Has a seamless walk-in interior. */
  readonly interior?: boolean;
  /** Short description for the map card. */
  readonly blurb: string;
  /** Opening hours (clock hours, may wrap past midnight). Omitted = always open. */
  readonly open?: readonly [number, number];
}

const P = <const T extends PlaceDef>(p: T): T => p;

export const PLACES = {
  // ── properties ────────────────────────────────────────────────────────────
  ofelias: P({ id: 'ofelias', name: 'Ofelia’s Plants & Bait', district: 'flats', kind: 'property', interior: true, blurb: 'Grandma’s shop, back room and greenhouse. Yours now.' }),
  palmettoGarage: P({ id: 'palmettoGarage', name: 'Palmetto Garage', district: 'flats', kind: 'property', interior: true, blurb: 'A two-bay garage behind a closed tire shop.' }),
  harborWarehouse: P({ id: 'harborWarehouse', name: 'Harbor Warehouse 7', district: 'harbor', kind: 'property', interior: true, blurb: 'Big, loud, and nobody looks twice at trucks.' }),
  stiltHouse: P({ id: 'stiltHouse', name: 'Sawgrass Stilt House', district: 'sawgrass', kind: 'property', interior: true, blurb: 'Off the grid, over the water, under the radar.' }),
  penthouse: P({ id: 'penthouse', name: 'Dorada Penthouse', district: 'isla', kind: 'property', interior: true, blurb: 'Glass, gold and a view of everything you own.' }),
  // ── fronts ────────────────────────────────────────────────────────────────
  sudsyFlamingo: P({ id: 'sudsyFlamingo', name: 'Sudsy Flamingo Car Wash', district: 'flats', kind: 'front', blurb: 'Washes cars. Washes other things.', open: [7, 21] }),
  tacoTsunami: P({ id: 'tacoTsunami', name: 'Taco Tsunami', district: 'strand', kind: 'front', blurb: 'A taco truck with a cult following and a cash box.', open: [11, 3] }),
  leakyTiki: P({ id: 'leakyTiki', name: 'The Leaky Tiki', district: 'strand', kind: 'front', interior: true, blurb: 'Beach bar. Rum, regrets and a very good back office.', open: [12, 4] }),
  clubAftersun: P({ id: 'clubAftersun', name: 'Club Aftersun', district: 'deco', kind: 'front', interior: true, blurb: 'The hottest door in Deco Row, once you own it.', open: [21, 5] }),
  // ── shops and services ────────────────────────────────────────────────────
  sodAlmighty: P({ id: 'sodAlmighty', name: 'Sod Almighty Garden & Feed', district: 'flats', kind: 'shop', interior: true, blurb: 'Seeds, soil, lamps and planters.', open: [7, 21] }),
  mamaYolis: P({ id: 'mamaYolis', name: 'Mama Yoli’s Bodega', district: 'flats', kind: 'shop', interior: true, blurb: 'Additives, snacks and unsolicited advice.', open: [6, 24] }),
  mangroveMart: P({ id: 'mangroveMart', name: 'Mangrove Mart', district: 'flats', kind: 'shop', interior: true, blurb: 'Open all night. Hot dogs of uncertain age.' }),
  dripTide: P({ id: 'dripTide', name: 'Drip Tide', district: 'deco', kind: 'shop', interior: true, blurb: 'Outfits, shades and swagger.', open: [10, 22] }),
  dexGarage: P({ id: 'dexGarage', name: 'Dex’s Wrench & Wax', district: 'harbor', kind: 'service', interior: true, blurb: 'Paint, wheels, tuning and hidden compartments.', open: [8, 2] }),
  pinkertonLaw: P({ id: 'pinkertonLaw', name: 'Pinkerton Law', district: 'crown', kind: 'service', interior: true, blurb: 'Busted? Don’t panic.' }),
  firstCoastal: P({ id: 'firstCoastal', name: 'First Coastal Bank', district: 'crown', kind: 'service', blurb: 'Clean money only, please.', open: [9, 17] }),
  bigShellMarine: P({ id: 'bigShellMarine', name: 'Big Shell Marine', district: 'harbor', kind: 'shop', blurb: 'Boats, motors and bait by the bucket.', open: [7, 19] }),
  // ── hangouts ──────────────────────────────────────────────────────────────
  boardwalk: P({ id: 'boardwalk', name: 'The Boardwalk', district: 'strand', kind: 'hangout', blurb: 'Skaters, buskers and sunburnt tourists.' }),
  skatePark: P({ id: 'skatePark', name: 'Strand Skate Park', district: 'strand', kind: 'hangout', blurb: 'Bowls, rails and Kiki’s Tuesday class.' }),
  pier9: P({ id: 'pier9', name: 'Pier 9', district: 'strand', kind: 'hangout', blurb: 'The Ferris wheel, arcades and the best night views.' }),
  strandBeach: P({ id: 'strandBeach', name: 'Strand Beach', district: 'strand', kind: 'hangout', blurb: 'Volleyball, umbrellas, lifeguard towers.' }),
  surfShack: P({ id: 'surfShack', name: 'Gnarly Pelican Surf', district: 'strand', kind: 'hangout', blurb: 'Boards, wax and a hammock out back.' }),
  chromePelican: P({ id: 'chromePelican', name: 'The Chrome Pelican', district: 'deco', kind: 'hangout', interior: true, blurb: 'A chrome diner where everyone is having a meeting.' }),
  flamingoCourt: P({ id: 'flamingoCourt', name: 'Flamingo Court Motel', district: 'deco', kind: 'hangout', interior: true, blurb: 'The pink neon flamingo. Rooms by the night or by the hour.' }),
  rooftopPool: P({ id: 'rooftopPool', name: 'The Seabreeze Rooftop', district: 'deco', kind: 'hangout', blurb: 'Infinity pool, DJ, sunburn.' }),
  palmettoPlaza: P({ id: 'palmettoPlaza', name: 'Palmetto Plaza', district: 'flats', kind: 'hangout', blurb: 'Strip mall: laundromat, nail studio, vape shop, tax prep.' }),
  palmettoPark: P({ id: 'palmettoPark', name: 'Palmetto Park', district: 'flats', kind: 'hangout', blurb: 'Dog run, pickleball and a pond with a resident gator.' }),
  gatorGolf: P({ id: 'gatorGolf', name: 'Gator Golf', district: 'flats', kind: 'landmark', blurb: 'Eighteen holes and one enormous fiberglass gator.' }),
  starlite: P({ id: 'starlite', name: 'Starlite Drive-In', district: 'flats', kind: 'landmark', blurb: 'Double features under the stars.', open: [19, 2] }),
  fishMarket: P({ id: 'fishMarket', name: 'Cobalt Fish Market', district: 'harbor', kind: 'hangout', blurb: 'Ice, gulls and early-morning cash deals.', open: [4, 14] }),
  containerYard: P({ id: 'containerYard', name: 'Container Yard', district: 'harbor', kind: 'meet', blurb: 'Stacks of steel and blind corners.' }),
  casaVale: P({ id: 'casaVale', name: 'Casa Vale', district: 'harbor', kind: 'hangout', interior: true, blurb: 'Don Vale’s restaurant. The paella is excellent. So is the security.' }),
  crownPlaza: P({ id: 'crownPlaza', name: 'Crown Plaza', district: 'crown', kind: 'hangout', blurb: 'Fountains, food trucks and suits on lunch break.' }),
  arena: P({ id: 'arena', name: 'Halcyon Arena', district: 'crown', kind: 'landmark', blurb: 'Home of the Halcyon Herons.' }),
  crownTower: P({ id: 'crownTower', name: 'Crown Tower', district: 'crown', kind: 'landmark', blurb: 'The tallest thing in town, with the biggest billboard.' }),
  zenithStudio: P({ id: 'zenithStudio', name: 'Zenith Wellness Studio', district: 'crown', kind: 'hangout', blurb: 'Ring lights, cold plunges, warm lies.' }),
  airboatAnnies: P({ id: 'airboatAnnies', name: 'Airboat Annie’s', district: 'sawgrass', kind: 'hangout', blurb: 'Tours, rentals and gator jerky.', open: [7, 20] }),
  gatorHole: P({ id: 'gatorHole', name: 'The Gator Hole', district: 'sawgrass', kind: 'hangout', blurb: 'A stilt bar. The Mudflaps drink here.' }),
  boatRamp: P({ id: 'boatRamp', name: 'Mudbank Boat Ramp', district: 'sawgrass', kind: 'meet', blurb: 'Where the swamp road meets the water.' }),
  yachtClub: P({ id: 'yachtClub', name: 'Dorada Yacht Club', district: 'isla', kind: 'hangout', blurb: 'Members, guests, and guests of guests.' }),
  marina: P({ id: 'marina', name: 'Dorada Marina', district: 'isla', kind: 'hangout', blurb: 'Yachts with names like “Tax Shelter”.' }),
  lighthouse: P({ id: 'lighthouse', name: 'Old Keys Lighthouse', district: 'keys', kind: 'landmark', blurb: 'Retired since 1971. Very good for secrets.' }),
  crabShack: P({ id: 'crabShack', name: 'Salty Pete’s Crab Shack', district: 'keys', kind: 'hangout', blurb: 'Stone crabs and smugglers’ gossip.', open: [11, 23] }),
  causeway: P({ id: 'causeway', name: 'The Causeway', district: 'harbor', kind: 'landmark', blurb: 'The bridge to Isla Dorada. Best sunset drive in the state.' }),
  theLot: P({ id: 'theLot', name: 'The Lot', district: 'flats', kind: 'meet', blurb: 'A dead mall’s empty car park. Perfect for drifting.' }),
} as const satisfies Record<string, PlaceDef>;

export type PlaceId = keyof typeof PLACES;
export const PLACE_IDS = Object.keys(PLACES) as PlaceId[];

export function placesIn(district: DistrictId): PlaceDef[] {
  return PLACE_IDS.map((id) => PLACES[id] as PlaceDef).filter((p) => p.district === district);
}

/** True if the place is open at `hours` (clock hours 0–24). */
export function isOpen(place: PlaceDef, hours: number): boolean {
  if (!place.open) return true;
  const [a, b] = place.open;
  const h = ((hours % 24) + 24) % 24;
  if (a === b) return true;
  // [7, 21] is a same-day window; [21, 5] wraps past midnight.
  return a < b ? h >= a && h < b : h >= a || h < b;
}
