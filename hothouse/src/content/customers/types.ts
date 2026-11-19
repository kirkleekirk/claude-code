import type { AdditiveId } from '../additives';
import type { EffectId } from '../effects';
import type { CustomerId, MissionId, Tier } from '../ids';
import type { DistrictId, PlaceId } from '../places';
import type { BaseStrainId } from '../strains';

/**
 * A named customer. All customers are adults; ages are stated so it is never in doubt.
 *
 * Text templates may use `{effect}` (what they want), `{qty}`, `{place}`, `{time}` ("by 8:15 PM")
 * and `{brand}` (the player's brand or "your stuff").
 */

export type HaggleStyle = 'easygoing' | 'fair' | 'shrewd' | 'generous' | 'flaky';

export interface Hangout {
  readonly place: PlaceId;
  /** Clock hours; `to` may be smaller than `from` for windows past midnight. */
  readonly from: number;
  readonly to: number;
}

export interface CustomerLines {
  /** Request texts. */
  readonly request: readonly string[];
  /** After a sale. */
  readonly accept: readonly string[];
  /** When the player pushes past their limit. */
  readonly haggle: readonly string[];
  /** When the player declines or lets a request lapse. */
  readonly decline: readonly string[];
  /** Reaction to a product with an effect they love. */
  readonly loved: string;
  /** Reaction to a product that misses what they wanted. */
  readonly meh: string;
  /** Reaction to a free sample. */
  readonly sample: string;
}

export interface BeatGift {
  readonly cash?: number;
  readonly seed?: BaseStrainId;
  readonly additive?: AdditiveId;
  readonly qty?: number;
}

export interface CustomerBeat {
  readonly level: 'regular' | 'loyal' | 'superfan';
  readonly text: string;
  readonly gift?: BeatGift;
  /** Introduces another customer (unlocks them). */
  readonly refer?: CustomerId;
}

export type CustomerUnlock =
  | { readonly via: 'start' }
  | { readonly via: 'story' }
  | { readonly via: 'referral'; readonly from: CustomerId }
  | { readonly via: 'sample' }
  | { readonly via: 'rank'; readonly rank: number }
  | { readonly via: 'mission'; readonly mission: MissionId };

export interface CustomerDef {
  readonly id: CustomerId;
  readonly name: string;
  /** Name shown in chips and the HUD. */
  readonly short: string;
  readonly age: number;
  readonly pronouns: 'she' | 'he' | 'they';
  readonly archetype: string;
  readonly bio: string;
  readonly district: DistrictId;
  readonly hangouts: readonly Hangout[];
  /** Typical spend per deal in dollars. */
  readonly budget: number;
  readonly qty: readonly [number, number];
  readonly loves: readonly EffectId[];
  readonly dislikes: readonly EffectId[];
  readonly tiers: readonly Tier[];
  readonly haggle: HaggleStyle;
  readonly unlock: CustomerUnlock;
  /** Seed for `appearanceFromSeed`. */
  readonly appearance: string;
  /** Dialogue blip voice. */
  readonly voice: { readonly pitch: number; readonly brightness: number; readonly expressiveness: number };
  readonly lines: CustomerLines;
  readonly beats: readonly CustomerBeat[];
}
