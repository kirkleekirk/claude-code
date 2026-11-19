import { ADDITIVES, ADDITIVE_IDS, FLAVOR_DEFS, type AdditiveDef, type AdditiveId, type Flavor, type FlavorDef } from './additives';
import {
  BRAND_NAME_FIRST, BRAND_NAME_SECOND, LOGO_ICONS, LOGO_PALETTES, LOGO_SHAPES, LOGO_TYPES, PACKAGING, STUNTS,
  type LogoPalette, type LogoShape, type LogoType, type PackagingDef, type StuntDef, type StuntId,
} from './brand';
import { CONTACTS, type ContactDef } from './contacts';
import { CREW, CREW_BY_ID, ROLES, type CrewDef, type RoleDef } from './crew';
import { CUSTOMERS, CUSTOMER_LIST, type CustomerDef } from './customers';
import { EFFECTS, EFFECT_IDS, type EffectDef, type EffectId } from './effects';
import { EVENTS, type EventDef } from './events';
import { FRONTS, type FrontDef } from './fronts';
import { GOALS, type GoalDef } from './goals';
import type { CrewRole, CustomerId, EventId, FrontId, MissionId, PlaceableId, PropertyId, RivalId, ShopId, StoryContactId, TrackId, UpgradeId } from './ids';
import { MISSIONS, type MissionDef } from './missions';
import { HARMONIES, HARMONY_IDS, MIX_RULES, type HarmonyDef, type HarmonyId, type MixRule } from './mixRules';
import { PLACEABLES, PLACEABLE_ORDER, type PlaceableDef } from './placeables';
import { DISTRICTS, PLACES, type DistrictDef, type DistrictId, type PlaceDef, type PlaceId } from './places';
import { PROLOGUE, type PrologueStepDef } from './prologue';
import { PROPERTIES, TRACKS, TRACK_PRICES, type PropertyDef, type TrackDef } from './properties';
import { RANKS, type RankDef } from './ranks';
import { RIVALS, RIVAL_ACTIONS, type RivalActionDef, type RivalActionId, type RivalDef } from './rivals';
import { SHOPS, type ShopDef } from './shops';
import { STRAINS, STRAIN_IDS, type BaseStrainId, type StrainDef } from './strains';
import { TURFS, TURF_IDS, type TurfDef, type TurfId } from './turfs';
import { UPGRADES, UPGRADE_ORDER, type UpgradeDef } from './upgrades';

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
  readonly customers: Readonly<Record<CustomerId, CustomerDef>>;
  readonly customerList: readonly CustomerDef[];
  readonly contacts: Readonly<Record<StoryContactId, ContactDef>>;
  readonly ranks: readonly RankDef[];
  readonly upgrades: Readonly<Record<UpgradeId, UpgradeDef>>;
  readonly upgradeOrder: readonly UpgradeId[];
  readonly shops: Readonly<Record<ShopId, ShopDef>>;
  readonly placeables: Readonly<Record<PlaceableId, PlaceableDef>>;
  readonly placeableOrder: readonly PlaceableId[];
  readonly properties: Readonly<Record<PropertyId, PropertyDef>>;
  readonly tracks: Readonly<Record<TrackId, TrackDef>>;
  readonly trackPrices: readonly [number, number, number];
  readonly brand: {
    readonly shapes: readonly LogoShape[];
    readonly icons: readonly string[];
    readonly palettes: readonly LogoPalette[];
    readonly types: readonly LogoType[];
    readonly packaging: readonly PackagingDef[];
    readonly nameFirst: readonly string[];
    readonly nameSecond: readonly string[];
    readonly stunts: Readonly<Record<StuntId, StuntDef>>;
  };
  readonly prologue: readonly PrologueStepDef[];
  readonly goals: readonly GoalDef[];
  readonly crew: Readonly<Record<string, CrewDef>>;
  readonly crewList: readonly CrewDef[];
  readonly roles: Readonly<Record<CrewRole, RoleDef>>;
  readonly fronts: Readonly<Record<FrontId, FrontDef>>;
  readonly rivals: Readonly<Record<RivalId, RivalDef>>;
  readonly rivalActions: Readonly<Record<RivalActionId, RivalActionDef>>;
  readonly events: Readonly<Record<EventId, EventDef>>;
  readonly missions: Readonly<Record<MissionId, MissionDef>>;
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
  customers: CUSTOMERS,
  customerList: CUSTOMER_LIST,
  contacts: CONTACTS,
  ranks: RANKS,
  upgrades: UPGRADES,
  upgradeOrder: UPGRADE_ORDER,
  shops: SHOPS,
  placeables: PLACEABLES,
  placeableOrder: PLACEABLE_ORDER,
  properties: PROPERTIES,
  tracks: TRACKS,
  trackPrices: TRACK_PRICES,
  brand: {
    shapes: LOGO_SHAPES,
    icons: LOGO_ICONS,
    palettes: LOGO_PALETTES,
    types: LOGO_TYPES,
    packaging: PACKAGING,
    nameFirst: BRAND_NAME_FIRST,
    nameSecond: BRAND_NAME_SECOND,
    stunts: STUNTS,
  },
  prologue: PROLOGUE,
  goals: GOALS,
  crew: CREW_BY_ID,
  crewList: CREW,
  roles: ROLES,
  fronts: FRONTS,
  rivals: RIVALS,
  rivalActions: RIVAL_ACTIONS,
  events: EVENTS,
  missions: MISSIONS,
};
