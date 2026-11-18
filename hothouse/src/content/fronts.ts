import type { FrontId } from './ids';
import type { PlaceId } from './places';

/**
 * Laundering fronts: each turns dirty cash clean up to a daily capacity, earns a little legit
 * money, and invites audits when pushed past capacity. One bar, one decision.
 */

export interface FrontDef {
  readonly id: FrontId;
  readonly name: string;
  readonly place: PlaceId;
  readonly rank: number;
  /** Unlock id required beyond rank. */
  readonly unlock: string;
  readonly price: number;
  readonly currency: 'any' | 'clean';
  /** Dirty dollars it can wash per in-game day at level 0. */
  readonly capacity: number;
  /** Share of laundered money lost to the process. */
  readonly fee: number;
  /** Clean income per day from honest business. */
  readonly legit: number;
  readonly line: string;
  /** Per-level upgrade blurbs (levels 1–3). */
  readonly levels: readonly [string, string, string];
  readonly icon: string;
}

export const FRONTS: Readonly<Record<FrontId, FrontDef>> = {
  sudsyFlamingo: {
    id: 'sudsyFlamingo', name: 'Sudsy Flamingo Car Wash', place: 'sudsyFlamingo', rank: 5, unlock: 'feature:fronts', price: 6000, currency: 'any',
    capacity: 2500, fee: 0.1, legit: 150, icon: 'carwash',
    line: 'Washes cars. Washes other things. Also resprays your car if the cops know it.',
    levels: ['A second wash bay.', 'Detailing service for the Isla crowd.', 'A pink neon flamingo on the roof. Visible from space.'],
  },
  tacoTsunami: {
    id: 'tacoTsunami', name: 'Taco Tsunami', place: 'tacoTsunami', rank: 5, unlock: 'feature:fronts', price: 9000, currency: 'any',
    capacity: 3500, fee: 0.12, legit: 220, icon: 'taco',
    line: 'A taco truck with a cult following and a cash box nobody counts.',
    levels: ['A second truck for the arena crowd.', 'Late-night window on the Strand.', 'Catering contracts. So many tacos.'],
  },
  leakyTiki: {
    id: 'leakyTiki', name: 'The Leaky Tiki', place: 'leakyTiki', rank: 6, unlock: 'feature:fronts', price: 25000, currency: 'clean',
    capacity: 8000, fee: 0.1, legit: 400, icon: 'tiki',
    line: 'Beach bar. Rum, regrets and a very good back office.',
    levels: ['Live music Thursdays.', 'A second bar on the sand.', 'Private cabanas. Very private.'],
  },
  clubAftersun: {
    id: 'clubAftersun', name: 'Club Aftersun', place: 'clubAftersun', rank: 8, unlock: 'front:clubAftersun', price: 60000, currency: 'clean',
    capacity: 20000, fee: 0.08, legit: 900, icon: 'disco',
    line: 'The hottest door in Deco Row. Everyone pays cash for everything.',
    levels: ['A rooftop lounge.', 'Bottle service and a velvet rope.', 'Resident DJ Cortado. The line wraps the block.'],
  },
};

export const FRONT_UPGRADE_SHARE = 0.4;
export const FRONT_CAPACITY_PER_LEVEL = 0.5;
