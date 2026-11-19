import type { AdditiveId } from './additives';
import type { ShopId, StoryContactId } from './ids';
import type { PlaceId } from './places';
import type { BaseStrainId } from './strains';

/**
 * Where seeds and additives come from. In-person shops are cheapest; Gulf Direct delivers to the
 * drop box at a markup; the docks sell in bulk at a discount once Vale's people trust you.
 */

export type ShopItem = { readonly seed: BaseStrainId } | { readonly additive: AdditiveId };

export interface ShopDef {
  readonly id: ShopId;
  readonly name: string;
  /** Physical location, or null for the phone-only supplier. */
  readonly place: PlaceId | null;
  readonly keeper: StoryContactId | null;
  readonly keeperName: string;
  /** Greeting lines the counter UI cycles through. */
  readonly greetings: readonly string[];
  /** Line when the player buys something. */
  readonly thanks: readonly string[];
  readonly stock: readonly ShopItem[];
  /** Price multiplier on the item's list price. */
  readonly markup: number;
  /** Minimum quantity per purchase (wholesale). */
  readonly minQty: number;
  /** Unlock id required to shop here (null = always). */
  readonly unlock: string | null;
  /** Delivery delay in sim-seconds for phone orders (0 = carry out). */
  readonly delivery: number;
}

const seed = (s: BaseStrainId): ShopItem => ({ seed: s });
const add = (a: AdditiveId): ShopItem => ({ additive: a });

export const SHOPS: Readonly<Record<ShopId, ShopDef>> = {
  sodAlmighty: {
    id: 'sodAlmighty', name: 'Sod Almighty Garden & Feed', place: 'sodAlmighty', keeper: 'wade', keeperName: 'Wade',
    greetings: [
      'Welcome to Sod Almighty. Seeds, soil, salvation.',
      'Your grandma bought her honey here every Tuesday. For the bees, she said. She did not have bees.',
      'We price-match any garden center within the city limits. There are none.',
    ],
    thanks: ['Go forth and germinate.', 'Tell the bees I said hi.', 'Receipt’s in the bag. So is a free sticker. You’re welcome.'],
    stock: [
      seed('abuelasBlush'), seed('gatorgrassGold'), seed('neonNana'), seed('causewayCoral'), seed('midnightMango'),
      seed('lighthouseLime'), seed('pelicanPunch'), seed('flamingoFever'), seed('hurricaneHibiscus'), seed('velvetManatee'),
      add('honey'),
    ],
    markup: 1, minQty: 1, unlock: null, delivery: 0,
  },
  mamaYolis: {
    id: 'mamaYolis', name: 'Mama Yoli’s Bodega', place: 'mamaYolis', keeper: 'yoli', keeperName: 'Mama Yoli',
    greetings: [
      '¡Ay, Ofelia’s grandbaby! You look thin. Buy a cafecito.',
      'Guava paste fixes everything. Heartbreak, flat tires, taxes.',
      'You want the good salt? The good salt is behind me. The good salt is always behind me.',
    ],
    thanks: ['Tell your abuela I said— oh. Tell her anyway.', 'Eat something.', 'Don’t mix the pickle with the honey. Or do. I’m not your mother.'],
    stock: [
      add('guava'), add('keyLime'), add('bloodOrange'), add('taffy'), add('gatorTears'), add('pinkPeppercorn'),
      add('cafecito'), add('volt'), add('pickleBrine'), add('seaSalt'),
    ],
    markup: 1, minQty: 1, unlock: null, delivery: 0,
  },
  annieStall: {
    id: 'annieStall', name: 'Annie’s Swamp Stall', place: 'airboatAnnies', keeper: null, keeperName: 'Airboat Annie',
    greetings: [
      'Moon Jelly’s fresh. Well, fresh-ish. It glows, so it’s fine.',
      'Firefly Sugar, by the scoop. Don’t ask where it comes from. I asked once. Regretted it.',
      'Watch the third step. Larry lives under it. Larry is a gator.',
    ],
    thanks: ['Mind the gators on your way out.', 'Bring the jar back, I reuse ’em.', 'Pleasure doin’ swamp business.'],
    stock: [add('moonJelly'), add('fireflySugar'), add('mysteryBait'), seed('swampHalo'), seed('gatorgrassGold'), seed('ghostOrchid9')],
    markup: 1, minQty: 1, unlock: null, delivery: 0,
  },
  docks: {
    id: 'docks', name: 'Fish Market Back Door', place: 'fishMarket', keeper: null, keeperName: 'Sal’s nephew',
    greetings: [
      'Bulk only. We don’t do cute little bags back here.',
      'Mr. Vale says you’re good for it. Mr. Vale is usually right.',
    ],
    thanks: ['Pleasure. Don’t park in the loading zone.', 'Ice is extra. Kidding. Mostly.'],
    stock: [
      add('guava'), add('honey'), add('keyLime'), add('bloodOrange'), add('taffy'), add('gatorTears'), add('pinkPeppercorn'),
      add('cafecito'), add('volt'), add('pickleBrine'), add('seaSalt'), add('moonJelly'), add('fireflySugar'),
    ],
    markup: 0.75, minQty: 10, unlock: 'feature:wholesale', delivery: 0,
  },
  gulfDirect: {
    id: 'gulfDirect', name: 'Gulf Direct', place: null, keeper: null, keeperName: 'Gulf Direct',
    greetings: ['Order by phone, delivered to your drop box. Mostly on time.'],
    thanks: ['Your order is on its way. Track it never.'],
    stock: [
      seed('abuelasBlush'), seed('gatorgrassGold'), seed('neonNana'), seed('swampHalo'), seed('causewayCoral'), seed('midnightMango'),
      seed('lighthouseLime'), seed('pelicanPunch'), seed('flamingoFever'), seed('hurricaneHibiscus'), seed('velvetManatee'),
      add('guava'), add('honey'), add('keyLime'), add('bloodOrange'), add('taffy'), add('gatorTears'), add('pinkPeppercorn'),
      add('cafecito'), add('volt'), add('pickleBrine'), add('seaSalt'), add('moonJelly'),
    ],
    markup: 1.2, minQty: 1, unlock: 'app:market', delivery: 60,
  },
};

export function itemKey(item: ShopItem): `seed:${string}` | `add:${AdditiveId}` {
  return 'seed' in item ? `seed:${item.seed}` : `add:${item.additive}`;
}
