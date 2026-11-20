import { Rng } from '@/core/rng';

/**
 * How a person looks. One `Appearance` drives both the 3D character builder and the illustrated
 * dialogue portrait, so a character always looks like themselves. All indices are into the
 * palettes and style tables below; generation is deterministic from a seed.
 *
 * Variety targets: 12 builds × 20 skin tones × 40 hair styles/hats × 60+ outfits × accessories.
 */

export interface Appearance {
  /** Body build 0–11 (see BUILDS). */
  build: number;
  /** 0 = shortest (1.58 m) … 1 = tallest (1.94 m). */
  height: number;
  /** Index into SKIN_TONES (0–19). */
  skin: number;
  /** Index into HAIR_STYLES (0–39); hats are styles too. */
  hair: number;
  /** Index into HAIR_COLORS. */
  hairColor: number;
  /** Facial hair: 0 none, 1 stubble, 2 moustache, 3 beard, 4 goatee. */
  facialHair: number;
  /** Face shape variant 0–5 (jaw, cheek and nose proportions). */
  face: number;
  /** Brow weight 0–1 and eye spacing 0–1 for expression variety. */
  brow: number;
  eyes: number;
  /** Index into OUTFITS (generated, 76 entries). */
  outfit: number;
  /** Accessories. */
  glasses: number; // 0 none, 1 aviators, 2 round, 3 cat-eye, 4 sport wrap, 5 readers
  jewelry: number; // 0 none, 1 chain, 2 hoops, 3 watch, 4 bangles
  /** Carries a phone in hand while idle (phone-cam culture). */
  phone: boolean;
  bag: number; // 0 none, 1 tote, 2 crossbody, 3 backpack, 4 fanny pack
}

/** sRGB hex. Ordered light → deep with varied undertones. */
export const SKIN_TONES = [
  '#F6DCCB', '#F1D1BC', '#EEC8AE', '#E8BE9F', '#E3B391', '#DCA986', '#D59E7A', '#CC9270', '#C38665', '#B97B5C',
  '#AE7052', '#A2654A', '#965A42', '#8A503A', '#7E4733', '#723F2D', '#673828', '#5B3123', '#4F2A1E', '#43231A',
] as const;

export const HAIR_COLORS = [
  '#1C1416', '#2E1F1A', '#4A3022', '#6B4430', '#8C5A3A', '#B0703E', '#C99A5B', '#E2C487', '#EFE2C2', '#9C9AA0',
  '#E9E6E2', '#F07AB0', '#2CC7B8', '#8E6BEA',
] as const;

export type HairKind = 'hair' | 'hat' | 'bald';

export interface HairStyle {
  readonly name: string;
  readonly kind: HairKind;
  /** Volume 0–1 (how far the silhouette extends past the scalp). */
  readonly volume: number;
  /** Length 0 = scalp, 1 = past shoulders. */
  readonly length: number;
  /** Hats carry their own colour slot; hair uses the hair colour. */
  readonly hatColor?: string;
}

export const HAIR_STYLES: readonly HairStyle[] = [
  { name: 'Buzz', kind: 'hair', volume: 0.05, length: 0 },
  { name: 'Crop', kind: 'hair', volume: 0.15, length: 0.1 },
  { name: 'Side part', kind: 'hair', volume: 0.25, length: 0.2 },
  { name: 'Pompadour', kind: 'hair', volume: 0.5, length: 0.25 },
  { name: 'Curly top', kind: 'hair', volume: 0.45, length: 0.2 },
  { name: 'Afro', kind: 'hair', volume: 0.9, length: 0.35 },
  { name: 'Twists', kind: 'hair', volume: 0.5, length: 0.3 },
  { name: 'Locs', kind: 'hair', volume: 0.4, length: 0.8 },
  { name: 'Box braids', kind: 'hair', volume: 0.35, length: 0.9 },
  { name: 'Cornrows', kind: 'hair', volume: 0.1, length: 0.15 },
  { name: 'Bob', kind: 'hair', volume: 0.35, length: 0.45 },
  { name: 'Pixie', kind: 'hair', volume: 0.2, length: 0.15 },
  { name: 'Long straight', kind: 'hair', volume: 0.3, length: 0.95 },
  { name: 'Beach waves', kind: 'hair', volume: 0.5, length: 0.8 },
  { name: 'High ponytail', kind: 'hair', volume: 0.3, length: 0.7 },
  { name: 'Low bun', kind: 'hair', volume: 0.3, length: 0.4 },
  { name: 'Top knot', kind: 'hair', volume: 0.35, length: 0.3 },
  { name: 'Space buns', kind: 'hair', volume: 0.45, length: 0.3 },
  { name: 'Mullet', kind: 'hair', volume: 0.35, length: 0.6 },
  { name: 'Mohawk', kind: 'hair', volume: 0.6, length: 0.3 },
  { name: 'Slicked back', kind: 'hair', volume: 0.15, length: 0.3 },
  { name: 'Shag', kind: 'hair', volume: 0.55, length: 0.55 },
  { name: 'Silver fox', kind: 'hair', volume: 0.3, length: 0.25 },
  { name: 'Shoulder curls', kind: 'hair', volume: 0.7, length: 0.6 },
  { name: 'Undercut', kind: 'hair', volume: 0.3, length: 0.25 },
  { name: 'Finger waves', kind: 'hair', volume: 0.2, length: 0.3 },
  { name: 'Bald', kind: 'bald', volume: 0, length: 0 },
  { name: 'Shaved sides', kind: 'hair', volume: 0.2, length: 0.2 },
  { name: 'Bangs', kind: 'hair', volume: 0.35, length: 0.6 },
  { name: 'Half up', kind: 'hair', volume: 0.4, length: 0.75 },
  // hats
  { name: 'Trucker cap', kind: 'hat', volume: 0.3, length: 0.1, hatColor: '#FF6B5E' },
  { name: 'Bucket hat', kind: 'hat', volume: 0.35, length: 0.1, hatColor: '#F3E3C3' },
  { name: 'Visor', kind: 'hat', volume: 0.3, length: 0.4, hatColor: '#17E0C8' },
  { name: 'Straw fedora', kind: 'hat', volume: 0.35, length: 0.15, hatColor: '#E8C987' },
  { name: 'Sun hat', kind: 'hat', volume: 0.6, length: 0.6, hatColor: '#F7E6CF' },
  { name: 'Beanie', kind: 'hat', volume: 0.25, length: 0.2, hatColor: '#3A2A7A' },
  { name: 'Bandana', kind: 'hat', volume: 0.2, length: 0.3, hatColor: '#FF3D8B' },
  { name: 'Captain’s hat', kind: 'hat', volume: 0.3, length: 0.15, hatColor: '#FFFFFF' },
  { name: 'Snapback', kind: 'hat', volume: 0.3, length: 0.2, hatColor: '#140B33' },
  { name: 'Headphones', kind: 'hat', volume: 0.35, length: 0.4, hatColor: '#B8F54A' },
];

export interface BodyBuild {
  readonly name: string;
  /** Proportions relative to the neutral rig (1 = neutral). */
  readonly shoulders: number;
  readonly chest: number;
  readonly waist: number;
  readonly hips: number;
  readonly limbs: number;
  readonly belly: number;
  /** Softer (0) or more angular (1) silhouette. */
  readonly angular: number;
}

export const BUILDS: readonly BodyBuild[] = [
  { name: 'Willowy', shoulders: 0.88, chest: 0.86, waist: 0.82, hips: 0.92, limbs: 0.84, belly: 0, angular: 0.4 },
  { name: 'Slim', shoulders: 0.93, chest: 0.9, waist: 0.86, hips: 0.95, limbs: 0.9, belly: 0, angular: 0.5 },
  { name: 'Average', shoulders: 1, chest: 1, waist: 1, hips: 1, limbs: 1, belly: 0.1, angular: 0.5 },
  { name: 'Curvy', shoulders: 0.96, chest: 1.08, waist: 0.92, hips: 1.2, limbs: 1.02, belly: 0.1, angular: 0.2 },
  { name: 'Athletic', shoulders: 1.1, chest: 1.08, waist: 0.92, hips: 0.98, limbs: 1.08, belly: 0, angular: 0.7 },
  { name: 'Broad', shoulders: 1.2, chest: 1.16, waist: 1.08, hips: 1.04, limbs: 1.14, belly: 0.2, angular: 0.8 },
  { name: 'Stocky', shoulders: 1.12, chest: 1.12, waist: 1.14, hips: 1.08, limbs: 1.12, belly: 0.35, angular: 0.6 },
  { name: 'Soft', shoulders: 1.02, chest: 1.1, waist: 1.18, hips: 1.16, limbs: 1.1, belly: 0.5, angular: 0.2 },
  { name: 'Heavy', shoulders: 1.14, chest: 1.2, waist: 1.32, hips: 1.24, limbs: 1.2, belly: 0.8, angular: 0.3 },
  { name: 'Lanky', shoulders: 0.98, chest: 0.9, waist: 0.88, hips: 0.92, limbs: 0.88, belly: 0, angular: 0.65 },
  { name: 'Hourglass', shoulders: 1.0, chest: 1.12, waist: 0.86, hips: 1.16, limbs: 1.0, belly: 0, angular: 0.25 },
  { name: 'Barrel', shoulders: 1.16, chest: 1.24, waist: 1.24, hips: 1.04, limbs: 1.12, belly: 0.6, angular: 0.55 },
];

export type TopStyle =
  | 'tee' | 'tank' | 'aloha' | 'guayabera' | 'polo' | 'tracksuit' | 'blazer' | 'hoodie' | 'buttonDown' | 'windbreaker'
  | 'sundress' | 'jersey' | 'crop' | 'linenShirt' | 'apron';
export type BottomStyle = 'shorts' | 'jeans' | 'chinos' | 'skirt' | 'trackPants' | 'cargo' | 'leggings' | 'linen' | 'none';
export type ShoeStyle = 'sneakers' | 'sandals' | 'boots' | 'loafers' | 'heels' | 'skates' | 'flipflops';
export type PrintStyle = 'plain' | 'stripes' | 'palms' | 'hibiscus' | 'flamingos' | 'checks' | 'chevron';

export interface Outfit {
  readonly id: number;
  readonly name: string;
  readonly top: TopStyle;
  readonly bottom: BottomStyle;
  readonly shoes: ShoeStyle;
  readonly print: PrintStyle;
  /** sRGB hex: top base, top accent/print, bottom, shoes. */
  readonly colors: readonly [string, string, string, string];
}

/** Palettes for outfits: Florida pastels, beach brights, night-out darks, work uniforms. */
const OUTFIT_PALETTES: ReadonlyArray<readonly [string, string, string, string]> = [
  ['#FFB3C8', '#FFFFFF', '#F3E3C3', '#FFFFFF'], ['#8FE3D8', '#FF6B5E', '#2B3F78', '#F4F0E8'],
  ['#FFD47A', '#FF3D8B', '#3A2A7A', '#1F1450'], ['#F6F1E7', '#17E0C8', '#C9B08A', '#6B4430'],
  ['#2B1D66', '#FF3D8B', '#140B33', '#FFFFFF'], ['#FF6B5E', '#FFD166', '#F6F1E7', '#E9E6E2'],
  ['#B8F54A', '#140B33', '#4A5568', '#FFFFFF'], ['#1F2937', '#E5E7EB', '#111827', '#E5E7EB'],
  ['#7FB6D8', '#FFF4E3', '#E3DBFA', '#F7E6CF'], ['#E3DBFA', '#8E6BEA', '#3A2A7A', '#FFB3C8'],
  ['#3E8E7E', '#F9E7A8', '#E8E0D0', '#8A6A52'], ['#FF9A3C', '#FFF4E3', '#2E2A3A', '#F4F0E8'],
];

const OUTFIT_SHAPES: ReadonlyArray<readonly [string, TopStyle, BottomStyle, ShoeStyle, PrintStyle]> = [
  ['Boardwalk tee', 'tee', 'shorts', 'sneakers', 'plain'],
  ['Aloha Friday', 'aloha', 'chinos', 'loafers', 'hibiscus'],
  ['Flamingo shirt', 'aloha', 'shorts', 'sandals', 'flamingos'],
  ['Guayabera', 'guayabera', 'linen', 'loafers', 'plain'],
  ['Clubhouse polo', 'polo', 'chinos', 'loafers', 'plain'],
  ['Tracksuit', 'tracksuit', 'trackPants', 'sneakers', 'stripes'],
  ['Miami blazer', 'blazer', 'linen', 'loafers', 'plain'],
  ['Hoodie and jeans', 'hoodie', 'jeans', 'sneakers', 'plain'],
  ['Office escape', 'buttonDown', 'chinos', 'loafers', 'checks'],
  ['Windbreaker', 'windbreaker', 'cargo', 'sneakers', 'chevron'],
  ['Sundress', 'sundress', 'none', 'sandals', 'palms'],
  ['Game day', 'jersey', 'shorts', 'sneakers', 'stripes'],
  ['Crop and leggings', 'crop', 'leggings', 'sneakers', 'plain'],
  ['Linen set', 'linenShirt', 'linen', 'sandals', 'plain'],
  ['Tank and cutoffs', 'tank', 'shorts', 'flipflops', 'plain'],
  ['Skate session', 'tank', 'shorts', 'skates', 'stripes'],
  ['Night out', 'buttonDown', 'jeans', 'boots', 'plain'],
  ['Cocktail', 'sundress', 'none', 'heels', 'plain'],
  ['Work apron', 'apron', 'jeans', 'boots', 'plain'],
];

/** 76 outfits: every one of the 19 shapes crossed with four palettes chosen deterministically. */
export const OUTFITS: readonly Outfit[] = (() => {
  const list: Outfit[] = [];
  const rng = new Rng('hothouse-outfits');
  let id = 0;
  for (const shape of OUTFIT_SHAPES) {
    const palettes = rng.shuffle([...OUTFIT_PALETTES.keys()]).slice(0, 4);
    for (const p of palettes) {
      list.push({ id: id++, name: shape[0], top: shape[1], bottom: shape[2], shoes: shape[3], print: shape[4], colors: OUTFIT_PALETTES[p]! });
    }
  }
  return list;
})();

/** Height in metres for an appearance. */
export function heightMetres(a: Appearance): number {
  return 1.58 + a.height * 0.36;
}

/** A random adult. `rng` decides everything; the same seed always gives the same person. */
export function randomAppearance(rng: Rng): Appearance {
  const hair = rng.int(0, HAIR_STYLES.length - 1);
  return {
    build: rng.int(0, BUILDS.length - 1),
    height: Math.min(1, Math.max(0, 0.5 + rng.gaussian() * 0.22)),
    skin: rng.int(0, SKIN_TONES.length - 1),
    hair,
    hairColor: rng.weightedIndex([10, 10, 9, 7, 5, 3, 4, 4, 2, 3, 3, 1, 1, 1]),
    facialHair: rng.chance(0.3) ? rng.int(1, 4) : 0,
    face: rng.int(0, 5),
    brow: rng.next(),
    eyes: rng.next(),
    outfit: rng.int(0, OUTFITS.length - 1),
    glasses: rng.chance(0.35) ? rng.int(1, 5) : 0,
    jewelry: rng.chance(0.4) ? rng.int(1, 4) : 0,
    phone: rng.chance(0.3),
    bag: rng.chance(0.3) ? rng.int(1, 4) : 0,
  };
}

/** Appearance from a string seed (named characters). */
export function appearanceFromSeed(seed: string): Appearance {
  return randomAppearance(new Rng(seed));
}

export interface PlayerLook {
  readonly name: string;
  readonly tagline: string;
  readonly base: Appearance;
  /** Four outfit choices for the New Game palette picker. */
  readonly outfits: readonly [number, number, number, number];
}

const look = (a: Partial<Appearance> & Pick<Appearance, 'build' | 'skin' | 'hair' | 'hairColor' | 'outfit'>): Appearance => ({
  height: 0.55, facialHair: 0, face: 2, brow: 0.5, eyes: 0.5, glasses: 0, jewelry: 0, phone: false, bag: 0, ...a,
});

const outfitOf = (name: string, n: number): number => {
  const matches = OUTFITS.filter((o) => o.name === name);
  return (matches[n % matches.length] ?? OUTFITS[0]!).id;
};

/** The six looks offered on the New Game screen. */
export const PLAYER_LOOKS: readonly PlayerLook[] = [
  {
    name: 'Riviera', tagline: 'Linen, gold chain, zero worries.',
    base: look({ build: 4, skin: 9, hair: 3, hairColor: 1, outfit: outfitOf('Guayabera', 0), glasses: 1, jewelry: 1, height: 0.6, facialHair: 1 }),
    outfits: [outfitOf('Guayabera', 0), outfitOf('Miami blazer', 0), outfitOf('Aloha Friday', 1), outfitOf('Night out', 0)],
  },
  {
    name: 'Boardwalk', tagline: 'Sun-bleached and always late.',
    base: look({ build: 1, skin: 3, hair: 13, hairColor: 7, outfit: outfitOf('Tank and cutoffs', 0), glasses: 4, height: 0.45, face: 1 }),
    outfits: [outfitOf('Tank and cutoffs', 0), outfitOf('Boardwalk tee', 1), outfitOf('Crop and leggings', 0), outfitOf('Sundress', 1)],
  },
  {
    name: 'Night Shift', tagline: 'Dark fits, quiet hands, loud car.',
    base: look({ build: 5, skin: 16, hair: 9, hairColor: 0, outfit: outfitOf('Night out', 1), jewelry: 3, height: 0.7, facialHair: 3, face: 4 }),
    outfits: [outfitOf('Night out', 1), outfitOf('Hoodie and jeans', 0), outfitOf('Tracksuit', 0), outfitOf('Windbreaker', 0)],
  },
  {
    name: 'Botanist', tagline: 'Knows the Latin name of everything.',
    base: look({ build: 10, skin: 12, hair: 23, hairColor: 2, outfit: outfitOf('Linen set', 0), glasses: 2, jewelry: 2, height: 0.4, face: 0 }),
    outfits: [outfitOf('Linen set', 0), outfitOf('Sundress', 0), outfitOf('Work apron', 0), outfitOf('Office escape', 0)],
  },
  {
    name: 'Hustler', tagline: 'Two phones, three plans, one tracksuit.',
    base: look({ build: 6, skin: 6, hair: 38, hairColor: 1, outfit: outfitOf('Tracksuit', 1), jewelry: 1, phone: true, height: 0.5, facialHair: 4, face: 3 }),
    outfits: [outfitOf('Tracksuit', 1), outfitOf('Game day', 0), outfitOf('Windbreaker', 1), outfitOf('Hoodie and jeans', 1)],
  },
  {
    name: 'Old Money', tagline: 'Yacht shoes on a bait-shop budget.',
    base: look({ build: 9, skin: 1, hair: 22, hairColor: 10, outfit: outfitOf('Clubhouse polo', 0), glasses: 5, jewelry: 3, height: 0.75, face: 5 }),
    outfits: [outfitOf('Clubhouse polo', 0), outfitOf('Miami blazer', 1), outfitOf('Aloha Friday', 0), outfitOf('Office escape', 1)],
  },
];
