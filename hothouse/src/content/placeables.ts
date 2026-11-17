import type { PlaceableId, StationKind } from './ids';

/**
 * Build Mode placeables. Footprints are in grid cells (1 cell = 1 m); `w` runs along x and `h`
 * along y before rotation. Effects stack across a property unless noted.
 */

export type PlaceableCategory = 'grow' | 'craft' | 'storage' | 'climate' | 'security' | 'comfort' | 'decor';

export interface PlaceableEffects {
  /** Plant slots this placeable provides. */
  pots?: number;
  station?: StationKind;
  /** Added to the stash capacity in units. */
  stash?: number;
  /** Crew morale bonus while at this property (diminishing past 30 total). */
  morale?: number;
  /** Security gauge points. */
  security?: number;
  /** Visibility gauge points (negative hides). */
  visibility?: number;
  /** Climate points; each point is +2 % growth speed up to 10 points. */
  climate?: number;
  /** Quality bonus (0–1 scale) for plants at this property, capped at 0.15 total. */
  quality?: number;
  /** Extra harvest units for plants in the same property, capped at +2. */
  yield?: number;
  /** Style points toward the property's visual state. */
  style?: number;
  /** Mixing speed multiplier at this property's stations. */
  mixSpeed?: number;
}

export interface PlaceableDef {
  readonly id: PlaceableId;
  readonly name: string;
  readonly category: PlaceableCategory;
  readonly w: number;
  readonly h: number;
  readonly cost: number;
  readonly rank: number;
  /** Requires an upgrade or unlock id before it shows up on the shelf. */
  readonly unlock?: string;
  /** At most this many per property. */
  readonly max?: number;
  readonly line: string;
  readonly icon: string;
  readonly effects: PlaceableEffects;
}

const p = (d: PlaceableDef): PlaceableDef => d;

export const PLACEABLES: Readonly<Record<PlaceableId, PlaceableDef>> = {
  // ── grow ─────────────────────────────────────────────────────────────────
  planterBox: p({ id: 'planterBox', name: 'Planter Box', category: 'grow', w: 2, h: 1, cost: 60, rank: 1, icon: 'planter',
    line: 'Two pots in a cedar box. Classic.', effects: { pots: 2 } }),
  planterTrough: p({ id: 'planterTrough', name: 'Long Trough', category: 'grow', w: 4, h: 1, cost: 160, rank: 3, icon: 'trough',
    line: 'Four pots in a galvanized trough from a farm auction.', effects: { pots: 4 } }),
  hydroTower: p({ id: 'hydroTower', name: 'Hydro Tower', category: 'grow', w: 2, h: 2, cost: 650, rank: 5, icon: 'tower',
    line: 'Six pots stacked vertically. Gurgles soothingly.', effects: { pots: 6, quality: 0.02 } }),
  growLamp: p({ id: 'growLamp', name: 'Grow Lamp', category: 'grow', w: 1, h: 1, cost: 90, rank: 1, icon: 'lamp',
    line: 'Magenta light, happy leaves, very visible from the street.', effects: { climate: 1, quality: 0.02, visibility: 4 } }),
  sunLampRig: p({ id: 'sunLampRig', name: 'Sun Lamp Rig', category: 'grow', w: 2, h: 1, cost: 380, rank: 4, icon: 'lamp',
    line: 'A ceiling rig of full-spectrum lamps. Glows like a stadium.', effects: { climate: 2, quality: 0.04, visibility: 8 } }),
  feedStation: p({ id: 'feedStation', name: 'Feed Station', category: 'grow', w: 1, h: 1, cost: 120, rank: 1, max: 1, icon: 'feed',
    line: 'Water and nutrients on tap. Tending draws from here, no refills.', effects: { station: 'feed' } }),
  trellis: p({ id: 'trellis', name: 'Bamboo Trellis', category: 'grow', w: 1, h: 1, cost: 70, rank: 2, icon: 'trellis',
    line: 'Gives the vines something to brag about. One more unit per harvest.', effects: { yield: 1 } }),
  dryingRack: p({ id: 'dryingRack', name: 'Drying Rack', category: 'grow', w: 1, h: 2, cost: 240, rank: 3, icon: 'rack',
    line: 'Cures every harvest a little better.', effects: { quality: 0.05 } }),
  // ── craft and work stations ──────────────────────────────────────────────
  workbench: p({ id: 'workbench', name: 'Mixing Workbench', category: 'craft', w: 2, h: 1, cost: 200, rank: 1, icon: 'bowl',
    line: 'Ofelia’s old potting bench, now with a mixing bowl.', effects: { station: 'workbench' } }),
  coldStill: p({ id: 'coldStill', name: 'Cold Still', category: 'craft', w: 2, h: 2, cost: 600, rank: 4, unlock: 'station:coldStill', max: 2, icon: 'still',
    line: 'Copper coils and frost. Three Bloom in, one Dew out.', effects: { station: 'coldStill', visibility: 2 } }),
  sunPress: p({ id: 'sunPress', name: 'Sun Press', category: 'craft', w: 2, h: 1, cost: 900, rank: 6, unlock: 'station:sunPress', max: 2, icon: 'press',
    line: 'Stamps Dew into glossy Halos with your logo on top.', effects: { station: 'sunPress' } }),
  packingTable: p({ id: 'packingTable', name: 'Packing Table', category: 'craft', w: 2, h: 1, cost: 260, rank: 3, icon: 'box',
    line: 'Where product puts on its Sunday best. Packers work here.', effects: { station: 'packing', mixSpeed: 1.1 } }),
  breedingCabinet: p({ id: 'breedingCabinet', name: 'Breeding Cabinet', category: 'craft', w: 1, h: 1, cost: 400, rank: 5, unlock: 'station:breedingCabinet', max: 1, icon: 'dna',
    line: 'A humid glass cabinet for introducing two strains to each other.', effects: { station: 'breeding' } }),
  desk: p({ id: 'desk', name: 'Office Desk', category: 'craft', w: 2, h: 1, cost: 180, rank: 5, icon: 'desk',
    line: 'Where the accountant makes numbers behave.', effects: { station: 'desk' } }),
  lookoutPerch: p({ id: 'lookoutPerch', name: 'Lookout Perch', category: 'security', w: 1, h: 1, cost: 150, rank: 4, icon: 'binoculars',
    line: 'A lawn chair, binoculars and a thermos. Lookouts post up here.', effects: { station: 'lookout', security: 3 } }),
  guardPost: p({ id: 'guardPost', name: 'Guard Post', category: 'security', w: 1, h: 1, cost: 220, rank: 7, icon: 'shield',
    line: 'A stool by the door and a very serious clipboard.', effects: { station: 'guard', security: 5 } }),
  // ── storage ──────────────────────────────────────────────────────────────
  shelf: p({ id: 'shelf', name: 'Steel Shelf', category: 'storage', w: 2, h: 1, cost: 110, rank: 1, icon: 'shelf',
    line: 'Holds forty units and a coffee can of mystery screws.', effects: { stash: 40 } }),
  safe: p({ id: 'safe', name: 'Floor Safe', category: 'storage', w: 1, h: 1, cost: 700, rank: 4, max: 2, icon: 'safe',
    line: 'Raids take less. The combination is Abuela’s birthday.', effects: { stash: 30, security: 8 } }),
  fridge: p({ id: 'fridge', name: 'Retro Fridge', category: 'storage', w: 1, h: 1, cost: 160, rank: 2, icon: 'fridge',
    line: 'Mint green, humming, full of snacks and product.', effects: { stash: 20, morale: 3 } }),
  lockers: p({ id: 'lockers', name: 'Staff Lockers', category: 'storage', w: 2, h: 1, cost: 240, rank: 3, icon: 'lockers',
    line: 'Somewhere for the crew to keep their stuff. Morale up.', effects: { stash: 10, morale: 4 } }),
  // ── climate ──────────────────────────────────────────────────────────────
  boxFan: p({ id: 'boxFan', name: 'Box Fan', category: 'climate', w: 1, h: 1, cost: 40, rank: 1, icon: 'fan',
    line: 'Loud, cheap, sincere.', effects: { climate: 1 } }),
  acUnit: p({ id: 'acUnit', name: 'Window AC', category: 'climate', w: 1, h: 1, cost: 320, rank: 2, icon: 'ac',
    line: 'Drips on the sidewalk, saves the harvest.', effects: { climate: 3, morale: 2 } }),
  dehumidifier: p({ id: 'dehumidifier', name: 'Dehumidifier', category: 'climate', w: 1, h: 1, cost: 280, rank: 3, icon: 'drop',
    line: 'Florida in, Arizona out.', effects: { climate: 1, quality: 0.03 } }),
  ceilingFan: p({ id: 'ceilingFan', name: 'Rattan Ceiling Fan', category: 'climate', w: 1, h: 1, cost: 150, rank: 2, icon: 'fan',
    line: 'Turns slowly, judges quietly.', effects: { climate: 1, style: 2, morale: 1 } }),
  // ── security ─────────────────────────────────────────────────────────────
  blackoutCurtains: p({ id: 'blackoutCurtains', name: 'Blackout Curtains', category: 'security', w: 2, h: 1, cost: 130, rank: 2, icon: 'curtain',
    line: 'The grow-glow stays inside where it belongs.', effects: { visibility: -10 } }),
  camera: p({ id: 'camera', name: 'Security Camera', category: 'security', w: 1, h: 1, cost: 260, rank: 3, icon: 'camera',
    line: 'Mostly films raccoons. Occasionally films cops.', effects: { security: 6 } }),
  alarm: p({ id: 'alarm', name: 'Alarm Panel', category: 'security', w: 1, h: 1, cost: 340, rank: 4, max: 1, icon: 'alarm',
    line: 'Raids get spotted earlier. Also goes off for pelicans.', effects: { security: 8 } }),
  reinforcedDoor: p({ id: 'reinforcedDoor', name: 'Reinforced Door', category: 'security', w: 1, h: 1, cost: 600, rank: 5, max: 2, icon: 'door',
    line: 'Steel core, pastel paint. Nobody suspects a mint-green door.', effects: { security: 12 } }),
  // ── comfort ──────────────────────────────────────────────────────────────
  couch: p({ id: 'couch', name: 'Thrift Couch', category: 'comfort', w: 2, h: 1, cost: 120, rank: 1, icon: 'couch',
    line: 'Floral, saggy, beloved. Break room essential.', effects: { morale: 5, style: 1 } }),
  coffeeMachine: p({ id: 'coffeeMachine', name: 'Espresso Machine', category: 'comfort', w: 1, h: 1, cost: 300, rank: 3, icon: 'coffee',
    line: 'Makes cafecito strong enough to read minds.', effects: { morale: 6, mixSpeed: 1.05 } }),
  jukebox: p({ id: 'jukebox', name: 'Jukebox', category: 'comfort', w: 1, h: 1, cost: 450, rank: 3, icon: 'jukebox',
    line: 'Plays Sunset FM and three freestyle classics. Crew love it.', effects: { morale: 8, style: 3, visibility: 1 } }),
  breakTable: p({ id: 'breakTable', name: 'Break Table', category: 'comfort', w: 2, h: 2, cost: 140, rank: 2, icon: 'table',
    line: 'Dominoes on Fridays. Arguments on Saturdays.', effects: { morale: 4 } }),
  hammock: p({ id: 'hammock', name: 'Hammock', category: 'comfort', w: 2, h: 1, cost: 110, rank: 2, icon: 'hammock',
    line: 'Ten-minute naps, forty-minute vibes.', effects: { morale: 4, style: 1 } }),
  arcadeCabinet: p({ id: 'arcadeCabinet', name: 'Arcade Cabinet', category: 'comfort', w: 1, h: 1, cost: 520, rank: 4, icon: 'arcade',
    line: 'One game, about a gator, impossible on purpose.', effects: { morale: 7, style: 2 } }),
  snackBar: p({ id: 'snackBar', name: 'Snack Bar', category: 'comfort', w: 2, h: 1, cost: 260, rank: 3, icon: 'snack',
    line: 'Pastelitos, plantain chips and a very old can of nuts.', effects: { morale: 6 } }),
  massageChair: p({ id: 'massageChair', name: 'Massage Chair', category: 'comfort', w: 1, h: 1, cost: 1100, rank: 6, icon: 'chair',
    line: 'Has seven settings and opinions about your posture.', effects: { morale: 10, style: 2 } }),
  // ── decor ────────────────────────────────────────────────────────────────
  neonSign: p({ id: 'neonSign', name: 'Brand Neon Sign', category: 'decor', w: 2, h: 1, cost: 480, rank: 3, icon: 'neon',
    line: 'Your logo in cursive neon. Gorgeous. Very visible.', effects: { style: 6, visibility: 6, morale: 2 } }),
  lawnFlamingo: p({ id: 'lawnFlamingo', name: 'Lawn Flamingo', category: 'decor', w: 1, h: 1, cost: 25, rank: 1, icon: 'flamingo',
    line: 'Plastic, pink, perfect.', effects: { style: 1 } }),
  monstera: p({ id: 'monstera', name: 'Monstera', category: 'decor', w: 1, h: 1, cost: 80, rank: 1, icon: 'leaf',
    line: 'A morale plant. Pilar named it Gerald.', effects: { morale: 3, style: 1 } }),
  bostonFern: p({ id: 'bostonFern', name: 'Boston Fern', category: 'decor', w: 1, h: 1, cost: 50, rank: 1, icon: 'fern',
    line: 'Drapes dramatically. Cleans the air. Hates drafts.', effects: { morale: 2, quality: 0.01 } }),
  shagRug: p({ id: 'shagRug', name: 'Shag Rug', category: 'decor', w: 2, h: 2, cost: 140, rank: 2, icon: 'rug',
    line: 'Tangerine, deep pile, swallows dropped scissors.', effects: { style: 3, morale: 2 } }),
  lavaLamp: p({ id: 'lavaLamp', name: 'Lava Lamp', category: 'decor', w: 1, h: 1, cost: 60, rank: 1, icon: 'lava',
    line: 'Hypnotic. Possibly older than the building.', effects: { style: 2, morale: 1 } }),
  tikiTorch: p({ id: 'tikiTorch', name: 'Tiki Torch', category: 'decor', w: 1, h: 1, cost: 45, rank: 1, icon: 'torch',
    line: 'Citronella and ambience in equal measure.', effects: { style: 1, visibility: 1 } }),
  mirrorBall: p({ id: 'mirrorBall', name: 'Mirror Ball', category: 'decor', w: 1, h: 1, cost: 220, rank: 4, icon: 'disco',
    line: 'Every room deserves a little Saturday night.', effects: { style: 4, morale: 3 } }),
  aquarium: p({ id: 'aquarium', name: 'Aquarium', category: 'decor', w: 2, h: 1, cost: 600, rank: 5, icon: 'fish',
    line: 'Three angelfish named Faith, Hope and Plausible Deniability.', effects: { style: 5, morale: 5 } }),
  gatorStatue: p({ id: 'gatorStatue', name: 'Mini Fiberglass Gator', category: 'decor', w: 2, h: 1, cost: 300, rank: 3, icon: 'gator',
    line: 'A scale model of the one at Gator Golf. Wears sunglasses.', effects: { style: 4, morale: 2 } }),
  stringLights: p({ id: 'stringLights', name: 'String Lights', category: 'decor', w: 2, h: 1, cost: 70, rank: 1, icon: 'lights',
    line: 'Warm bulbs on a sagging wire. Instant patio.', effects: { style: 2, morale: 1, visibility: 1 } }),
  abuelaPortrait: p({ id: 'abuelaPortrait', name: 'Abuela’s Portrait', category: 'decor', w: 1, h: 1, cost: 0, rank: 1, max: 1, icon: 'portrait',
    line: 'Ofelia, 1983, holding a prize ribbon and a garden hose like a sword.', effects: { morale: 6, style: 2 } }),
};

export const PLACEABLE_ORDER = Object.keys(PLACEABLES) as PlaceableId[];

/** Footprint after a quarter-turn rotation. */
export function footprint(def: PlaceableDef, rot: 0 | 1 | 2 | 3): { w: number; h: number } {
  return rot % 2 === 0 ? { w: def.w, h: def.h } : { w: def.h, h: def.w };
}
