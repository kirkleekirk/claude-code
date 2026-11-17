import { ADDITIVES, ADDITIVE_IDS, FLAVOR_DEFS, type AdditiveDef, type AdditiveId, type Flavor, type FlavorDef } from './additives';
import { EFFECTS, EFFECT_IDS, type EffectDef, type EffectId } from './effects';
import { HARMONIES, HARMONY_IDS, MIX_RULES, type HarmonyDef, type HarmonyId, type MixRule } from './mixRules';
import { DISTRICTS, PLACES, type DistrictDef, type DistrictId, type PlaceDef, type PlaceId } from './places';
import { STRAINS, STRAIN_IDS, type BaseStrainId, type StrainDef } from './strains';
import { TURFS, TURF_IDS, type TurfDef, type TurfId } from './turfs';

/**
 * The typed content registry handed to the sim and readable by the UI and world (`sim.content`).
 * Everything here is static authored data; per-playthrough data (bred strains) lives in sim state.
 */
export interface Content {
  readonly effects: Readonly<Record<EffectId, EffectDef>>;
  readonly effectIds: readonly EffectId[];
  readonly additives: Readonly<Record<AdditiveId, AdditiveDef>>;
  readonly additiveIds: readonly AdditiveId[];
  readonly flavors: Readonly<Record<Flavor, FlavorDef>>;
  readonly rules: readonly MixRule[];
  readonly harmonies: Readonly<Record<HarmonyId, HarmonyDef>>;
  readonly harmonyIds: readonly HarmonyId[];
  readonly strains: Readonly<Record<BaseStrainId, StrainDef>>;
  readonly strainIds: readonly BaseStrainId[];
  readonly districts: Readonly<Record<DistrictId, DistrictDef>>;
  readonly places: Readonly<Record<PlaceId, PlaceDef>>;
  readonly turfs: Readonly<Record<TurfId, TurfDef>>;
  readonly turfIds: readonly TurfId[];
}

export const CONTENT: Content = {
  effects: EFFECTS,
  effectIds: EFFECT_IDS,
  additives: ADDITIVES,
  additiveIds: ADDITIVE_IDS,
  flavors: FLAVOR_DEFS,
  rules: MIX_RULES,
  harmonies: HARMONIES,
  harmonyIds: HARMONY_IDS,
  strains: STRAINS,
  strainIds: STRAIN_IDS,
  districts: DISTRICTS,
  places: PLACES,
  turfs: TURFS,
  turfIds: TURF_IDS,
};
