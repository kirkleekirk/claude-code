import type { EffectId } from './effects';

/**
 * Kitchen-and-kitsch additives for Ofelia's Notebook. Each one adds its own effect and transforms
 * some effects already on a product (see `mixRules.ts`). Flavors behave consistently so players can
 * reason about unknown combinations. Every additive is a fictional, comedic household ingredient.
 */

export const FLAVORS = ['citrus', 'sweet', 'spicy', 'buzz', 'briny', 'glow'] as const;
export type Flavor = (typeof FLAVORS)[number];

export interface FlavorDef {
  readonly id: Flavor;
  readonly name: string;
  /** One-line rule of thumb shown in the Notebook's appendix once a rule of this flavor is known. */
  readonly tendency: string;
  readonly color: string;
}

export const FLAVOR_DEFS: Readonly<Record<Flavor, FlavorDef>> = {
  citrus: { id: 'citrus', name: 'Citrus', tendency: 'Sharpens things up: body buzz turns into brainwork.', color: '#C8F04A' },
  sweet: { id: 'sweet', name: 'Sweet', tendency: 'Softens everything into something mellow or giggly.', color: '#FFB3C8' },
  spicy: { id: 'spicy', name: 'Spicy', tendency: 'Wakes the mellow stuff up and turns it loud.', color: '#FF6B5E' },
  buzz: { id: 'buzz', name: 'Buzz', tendency: 'Shakes off sleepy effects: focused, wired, or both.', color: '#FFD166' },
  briny: { id: 'briny', name: 'Briny', tendency: 'Grounds a product: cancels duds and calms extremes.', color: '#8FE3D8' },
  glow: { id: 'glow', name: 'Glow', tendency: 'Pushes things somewhere weird. Mystery Bait bites back.', color: '#B48CFF' },
};

export const ADDITIVE_IDS = [
  'keyLime', 'bloodOrange',
  'guava', 'honey', 'taffy',
  'gatorTears', 'pinkPeppercorn',
  'cafecito', 'volt',
  'pickleBrine', 'seaSalt',
  'moonJelly', 'fireflySugar', 'mysteryBait',
] as const;
export type AdditiveId = (typeof ADDITIVE_IDS)[number];

export interface AdditiveDef {
  readonly id: AdditiveId;
  readonly name: string;
  readonly flavor: Flavor;
  /** The effect this additive adds when there is room on the product. */
  readonly adds: EffectId;
  /** Shop price per unit (one unit per product unit mixed). */
  readonly price: number;
  /** Rank at which shops start stocking it. */
  readonly rank: number;
  readonly line: string;
  readonly color: string;
  readonly icon: string;
}

const a = (d: AdditiveDef): AdditiveDef => d;

export const ADDITIVES: Readonly<Record<AdditiveId, AdditiveDef>> = {
  keyLime: a({ id: 'keyLime', name: 'Key Lime Zest', flavor: 'citrus', adds: 'laserFocus', price: 7, rank: 2, color: '#C8F04A', icon: 'lime',
    line: 'Grated off a lime that has seen things.' }),
  bloodOrange: a({ id: 'bloodOrange', name: 'Blood Orange Fizz', flavor: 'citrus', adds: 'chatty', price: 9, rank: 2, color: '#FF5A48', icon: 'soda',
    line: 'A soda so dramatic it insists on its own lighting.' }),
  guava: a({ id: 'guava', name: 'Guava Paste', flavor: 'sweet', adds: 'giggles', price: 5, rank: 1, color: '#FF7F9E', icon: 'guava',
    line: 'Mama Yoli says it fixes everything. She means everything.' }),
  honey: a({ id: 'honey', name: 'Orange-Blossom Honey', flavor: 'sweet', adds: 'mellowTide', price: 6, rank: 1, color: '#FFC23D', icon: 'honey',
    line: 'Sold at the garden store “for the bees”. Wink.' }),
  taffy: a({ id: 'taffy', name: 'Saltwater Taffy', flavor: 'sweet', adds: 'nostalgic', price: 6, rank: 2, color: '#FFB3C8', icon: 'candy',
    line: 'Boardwalk souvenir. Has outlived three gift shops.' }),
  gatorTears: a({ id: 'gatorTears', name: 'Gator Tears Hot Sauce', flavor: 'spicy', adds: 'bold', price: 8, rank: 2, color: '#FF3D1F', icon: 'sauce',
    line: 'The label says “Sincerely sorry.” The sauce is not.' }),
  pinkPeppercorn: a({ id: 'pinkPeppercorn', name: 'Pink Peppercorn', flavor: 'spicy', adds: 'discoFeet', price: 11, rank: 3, color: '#FF7FBF', icon: 'pepper',
    line: 'Technically a berry. Do not tell it.' }),
  cafecito: a({ id: 'cafecito', name: 'Cafecito Shot', flavor: 'buzz', adds: 'nightOwl', price: 7, rank: 2, color: '#8A5A3A', icon: 'coffee',
    line: 'Two sips. Your eyelids file for divorce.' }),
  volt: a({ id: 'volt', name: 'Volt! Powder', flavor: 'buzz', adds: 'electric', price: 12, rank: 3, color: '#7FD4FF', icon: 'bolt',
    line: 'Comes with a warning label that is also a dare.' }),
  pickleBrine: a({ id: 'pickleBrine', name: 'Pickle Brine', flavor: 'briny', adds: 'couchGravity', price: 5, rank: 2, color: '#9BC46A', icon: 'jar',
    line: 'The original sports drink, according to one uncle.' }),
  seaSalt: a({ id: 'seaSalt', name: 'Sea Salt Flakes', flavor: 'briny', adds: 'sunkissed', price: 8, rank: 2, color: '#DDEFF5', icon: 'salt',
    line: 'Hand-raked off the Keys by a man named Gill.' }),
  moonJelly: a({ id: 'moonJelly', name: 'Moon Jelly', flavor: 'glow', adds: 'dreamy', price: 13, rank: 3, color: '#C9A7FF', icon: 'jelly',
    line: 'A jiggly lavender preserve. Glows faintly at night.' }),
  fireflySugar: a({ id: 'fireflySugar', name: 'Firefly Sugar', flavor: 'glow', adds: 'shimmer', price: 15, rank: 4, color: '#F5FF8A', icon: 'firefly',
    line: 'Sparkly sugar from a swamp stall. Do not ask how.' }),
  mysteryBait: a({ id: 'mysteryBait', name: 'Mystery Bait', flavor: 'glow', adds: 'slowMo', price: 4, rank: 1, color: '#7A8A55', icon: 'bait',
    line: 'Grandma’s leftover bait-shop special. Labeled only “NO”.' }),
};

export function isAdditiveId(v: unknown): v is AdditiveId {
  return typeof v === 'string' && v in ADDITIVES;
}
