import type { BottomStyle, Outfit, ShoeStyle, TopStyle } from '@/content/appearance';

/**
 * Surface regions painted per vertex (`look.x`). The people shader looks each one up in the
 * actor's palette, so geometry never bakes colour and one shape serves every colourway.
 */
export const Region = {
  SKIN: 0,
  /** Head skin: the face is drawn on it. */
  HEAD: 1,
  /** Top base colour; carries the outfit's print. */
  TOP: 2,
  /** Top accent: collars, cuffs, plackets, stripes. */
  TRIM: 3,
  BOTTOM: 4,
  /** Accent on the bottoms (track stripes, cuffs). */
  BOTTOM_TRIM: 5,
  SHOE: 6,
  SOLE: 7,
  HAIR: 8,
  HAT: 9,
  HAT_TRIM: 10,
  METAL: 11,
  LENS: 12,
  FRAME: 13,
  BAG: 14,
  STRAP: 15,
  PHONE: 16,
  SCREEN: 17,
  APRON: 18,
  WHEEL: 19,
  /** The shirt under a blazer or apron (the outfit's accent). */
  UNDER: 20,
} as const;

export const REGION_COUNT = 21;

export type Neckline = 'crew' | 'v' | 'collar' | 'scoop' | 'high' | 'open' | 'strap';

/** How an outfit covers the body, in neutral-height metres. */
export interface ClothSpec {
  readonly top: TopStyle;
  readonly bottom: BottomStyle;
  readonly shoes: ShoeStyle;
  /** Sleeve length as a fraction of the arm (0 = sleeveless, 1 = to the wrist). */
  readonly sleeve: number;
  /** Extra sleeve radius (loose shirts). */
  readonly sleeveLoose: number;
  /** Lowest point of the top. */
  readonly topHem: number;
  /** Extra torso radius under the top. */
  readonly topLoose: number;
  readonly neckline: Neckline;
  /** Bare midriff between these heights (crop tops), or null. */
  readonly midriff: readonly [number, number] | null;
  /** Shoulders bare outside thin straps. */
  readonly bareShoulders: boolean;
  /** Where trousers end (y), or −1 for bare legs (skirts, dresses). */
  readonly pantsEnd: number;
  readonly pantsLoose: number;
  /** Skirt or dress panel from the waist, or null. */
  readonly skirt: { readonly top: number; readonly hem: number; readonly flare: number; readonly region: number } | null;
  readonly collar: boolean;
  readonly hood: boolean;
  readonly lapels: boolean;
  readonly apron: boolean;
  /** Vertical accent placket down the front (button shirts, polos, zips). */
  readonly placket: number;
  /** Side stripes on sleeves and trousers (tracksuits). */
  readonly sideStripes: boolean;
  /** Cargo pockets on the thighs. */
  readonly pockets: boolean;
}

const LONG: ReadonlySet<TopStyle> = new Set(['tracksuit', 'blazer', 'hoodie', 'buttonDown', 'windbreaker']);

export function clothSpec(o: Outfit): ClothSpec {
  const t = o.top;
  const sleeve = LONG.has(t) ? 1 : t === 'linenShirt' ? 0.72 : t === 'tank' || t === 'sundress' ? 0 : t === 'crop' ? 0.32 : 0.42;
  const sleeveLoose = t === 'aloha' || t === 'guayabera' || t === 'jersey' ? 0.016 : t === 'linenShirt' || t === 'windbreaker' || t === 'hoodie' ? 0.012 : t === 'blazer' ? 0.01 : 0.006;
  const topLoose = t === 'windbreaker' || t === 'hoodie' ? 0.016 : t === 'aloha' || t === 'jersey' || t === 'linenShirt' || t === 'guayabera' ? 0.012 : t === 'blazer' ? 0.014 : t === 'tank' || t === 'crop' ? 0.004 : 0.008;
  const topHem = t === 'blazer' ? 0.86 : t === 'crop' ? 1.17 : t === 'aloha' || t === 'guayabera' || t === 'linenShirt' || t === 'hoodie' || t === 'jersey' ? 0.9 : t === 'sundress' ? 0.98 : 0.94;
  const neckline: Neckline = t === 'tracksuit' || t === 'windbreaker' ? 'high'
    : t === 'polo' || t === 'buttonDown' ? 'collar'
      : t === 'aloha' || t === 'guayabera' || t === 'linenShirt' ? 'open'
        : t === 'jersey' || t === 'blazer' ? 'v'
          : t === 'tank' || t === 'crop' ? 'scoop'
            : t === 'sundress' ? 'strap' : 'crew';
  const b = o.bottom;
  const pantsEnd = b === 'shorts' ? 0.6 : b === 'skirt' || b === 'none' ? -1 : b === 'leggings' ? 0.1 : 0.075;
  const pantsLoose = b === 'linen' || b === 'trackPants' ? 0.02 : b === 'cargo' ? 0.022 : b === 'shorts' ? 0.016 : b === 'leggings' ? 0.002 : b === 'jeans' ? 0.01 : 0.008;
  let skirt: ClothSpec['skirt'] = null;
  if (t === 'sundress') skirt = { top: 1.02, hem: o.shoes === 'heels' ? 0.5 : 0.56, flare: 0.07, region: 2 };
  else if (b === 'skirt') skirt = { top: 1.0, hem: 0.6, flare: 0.05, region: 4 };
  return {
    top: t,
    bottom: b,
    shoes: o.shoes,
    sleeve,
    sleeveLoose,
    topHem,
    topLoose,
    neckline,
    midriff: t === 'crop' ? [b === 'leggings' ? 1.0 : 0.98, 1.17] : null,
    bareShoulders: t === 'tank' || t === 'sundress',
    pantsEnd,
    pantsLoose,
    skirt,
    collar: neckline === 'collar' || neckline === 'open',
    hood: t === 'hoodie',
    lapels: t === 'blazer',
    apron: t === 'apron',
    placket: t === 'polo' ? 1.27 : t === 'buttonDown' || t === 'guayabera' ? 0.94 : t === 'tracksuit' || t === 'windbreaker' ? 0.94 : 0,
    sideStripes: t === 'tracksuit' || b === 'trackPants',
    pockets: b === 'cargo',
  };
}

/** Outfit print as the shader's pattern id. Tracksuit stripes run down the sides instead. */
export function printId(o: Outfit): number {
  if (o.top === 'tracksuit') return 0;
  return ['plain', 'stripes', 'palms', 'hibiscus', 'flamingos', 'checks', 'chevron'].indexOf(o.print);
}
