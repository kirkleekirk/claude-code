/**
 * Stable string ids for every kind of authored content. Kept in one dependency-free file so the
 * sim API, the UI and the world can type against them before the full content tables load.
 * Saves store these ids; never rename one without a save migration.
 */

export const CUSTOMER_IDS = [
  // Palmetto Flats
  'marisol', 'gus', 'tiffani', 'raul', 'dot', 'jojo', 'hector', 'brenda',
  // Neon Strand
  'kiki', 'zeke', 'moonbeam', 'cortado', 'lucia', 'benny', 'nadia', 'trevor',
  // Deco Row
  'vivienne', 'marco', 'sasha', 'desmond', 'coco', 'ray',
  // Crown Point
  'priya', 'chad', 'evelyn', 'kwame', 'lena', 'gordon',
  // Cobalt Harbor
  'sal', 'ines', 'bao', 'rocky', 'fern',
  // The Sawgrass
  'annie', 'clyde', 'skeeter', 'mavis',
  // Isla Dorada
  'preston', 'giselle', 'teddy', 'ophelia',
  // Saltwater Keys
  'gill', 'pete', 'marina',
] as const;
export type CustomerId = (typeof CUSTOMER_IDS)[number];

/** Story contacts who text the player but do not buy. */
export const STORY_CONTACT_IDS = ['vale', 'pilar', 'tank', 'dex', 'sy', 'reyes', 'zen', 'duchess', 'yoli', 'wade', 'tipster', 'herald'] as const;
export type StoryContactId = (typeof STORY_CONTACT_IDS)[number];

/** Anyone with a message thread: customers, story contacts, and hired crew (`crew-…`). */
export type ContactId = CustomerId | StoryContactId | `crew-${string}`;

export const PROPERTY_IDS = ['ofelias', 'palmettoGarage', 'harborWarehouse', 'stiltHouse', 'penthouse'] as const;
export type PropertyId = (typeof PROPERTY_IDS)[number];

export const FRONT_IDS = ['sudsyFlamingo', 'tacoTsunami', 'leakyTiki', 'clubAftersun'] as const;
export type FrontId = (typeof FRONT_IDS)[number];

export const SHOP_IDS = ['sodAlmighty', 'mamaYolis', 'annieStall', 'docks', 'gulfDirect'] as const;
export type ShopId = (typeof SHOP_IDS)[number];

export const RIVAL_IDS = ['vale', 'mudflaps', 'zenith'] as const;
export type RivalId = (typeof RIVAL_IDS)[number];

export const CREW_ROLES = ['grower', 'cook', 'packer', 'dealer', 'driver', 'guard', 'accountant', 'lookout'] as const;
export type CrewRole = (typeof CREW_ROLES)[number];

export const TRACK_IDS = ['power', 'climate', 'security', 'capacity', 'style'] as const;
export type TrackId = (typeof TRACK_IDS)[number];

export const EVENT_IDS = [
  'beachParty', 'carMeet', 'parade', 'concert', 'heatWave', 'crackdown', 'shortage', 'customerTrouble', 'rivalAmbush',
  'boatChase', 'streetRace', 'fireworks', 'popUp', 'auditWeek', 'kingTide', 'fullMoon', 'farmersMarket', 'hurricaneWatch',
] as const;
export type EventId = (typeof EVENT_IDS)[number];

export const MISSION_IDS = [
  'inheritance', 'paella', 'greenThumb', 'skateNight', 'mudSeason', 'ringLight', 'cleanHands',
  'drawbridge', 'containerNight', 'helipad', 'podcast', 'paidInFull', 'hurricaneNight', 'morningAfter',
] as const;
export type MissionId = (typeof MISSION_IDS)[number];

export const UPGRADE_IDS = [
  'dripIrrigation', 'snipSnap', 'sunLamps', 'bigBowl', 'secondBurner', 'autoRestock', 'recipeBox', 'autoFeed',
  'climateControl', 'coldStill', 'breedingCabinet', 'chauffeur', 'sunPress', 'secretPage', 'blackout', 'crewVan',
] as const;
export type UpgradeId = (typeof UPGRADE_IDS)[number];

export const TIERS = ['bloom', 'dew', 'halos'] as const;
export type Tier = (typeof TIERS)[number];

export type Difficulty = 'chill' | 'classic' | 'sweaty';

/** Weather as the sim understands it (matches the renderer's preset ids). */
export type WeatherKind = 'clear' | 'hazy' | 'overcast' | 'rain' | 'storm' | 'hurricane';

/** Build Mode placeables (see `placeables.ts` for footprints, costs and effects). */
export const PLACEABLE_IDS = [
  // grow
  'planterBox', 'planterTrough', 'hydroTower', 'growLamp', 'sunLampRig', 'feedStation', 'trellis', 'dryingRack',
  // craft and work stations
  'workbench', 'coldStill', 'sunPress', 'packingTable', 'breedingCabinet', 'desk', 'lookoutPerch', 'guardPost',
  // storage
  'shelf', 'safe', 'fridge', 'lockers',
  // climate
  'boxFan', 'acUnit', 'dehumidifier', 'ceilingFan',
  // security
  'blackoutCurtains', 'camera', 'alarm', 'reinforcedDoor',
  // comfort
  'couch', 'coffeeMachine', 'jukebox', 'breakTable', 'hammock', 'arcadeCabinet', 'snackBar', 'massageChair',
  // decor
  'neonSign', 'lawnFlamingo', 'monstera', 'bostonFern', 'shagRug', 'lavaLamp', 'tikiTorch', 'mirrorBall',
  'aquarium', 'gatorStatue', 'stringLights', 'abuelaPortrait',
] as const;
export type PlaceableId = (typeof PLACEABLE_IDS)[number];

/** Stations crew and players work at; provided by placeables. */
export const STATION_KINDS = ['workbench', 'coldStill', 'sunPress', 'packing', 'feed', 'breeding', 'desk', 'lookout', 'guard'] as const;
export type StationKind = (typeof STATION_KINDS)[number];

export function isCustomerId(v: unknown): v is CustomerId {
  return typeof v === 'string' && (CUSTOMER_IDS as readonly string[]).includes(v);
}

export function isPropertyId(v: unknown): v is PropertyId {
  return typeof v === 'string' && (PROPERTY_IDS as readonly string[]).includes(v);
}
