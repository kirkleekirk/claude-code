import { CUSTOMER_IDS, type CustomerId } from '../ids';
import { COAST } from './coast';
import { DECO_CROWN } from './decoCrown';
import { FLATS_STRAND } from './flatsStrand';
import type { CustomerDef } from './types';

export type { BeatGift, CustomerBeat, CustomerDef, CustomerLines, CustomerUnlock, Hangout, HaggleStyle } from './types';

const ALL: readonly CustomerDef[] = [...FLATS_STRAND, ...DECO_CROWN, ...COAST];

export const CUSTOMERS: Readonly<Record<CustomerId, CustomerDef>> = Object.fromEntries(ALL.map((c) => [c.id, c])) as Record<
  CustomerId,
  CustomerDef
>;

/** Customers in canonical id order (deterministic iteration). */
export const CUSTOMER_LIST: readonly CustomerDef[] = CUSTOMER_IDS.map((id) => CUSTOMERS[id]);
