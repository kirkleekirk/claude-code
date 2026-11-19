import type { UpgradeId } from './ids';

/**
 * Empire-wide upgrades bought from the phone's Empire → Upgrades list. Each one removes a chore,
 * opens a system or multiplies output. Prices are in dollars (dirty or clean), tuned in BALANCE.md.
 */

export interface UpgradeEffects {
  /** Plants never get thirsty. */
  noWater?: boolean;
  /** Plants never get hungry. */
  noFood?: boolean;
  /** Multiplier on growth time (0.8 = 20 % faster). */
  growTime?: number;
  /** Extra units per harvest. */
  yield?: number;
  /** Added to harvest quality (0–1 scale). */
  quality?: number;
  /** Workbench batch size cap. */
  batch?: number;
  /** Multiplier on mixing time per unit. */
  mixTime?: number;
  /** Effects cap at the workbench. */
  cap?: number;
  /** Extra simultaneous customer requests and request-rate multiplier. */
  requestSlots?: number;
  requestRate?: number;
  /** Visibility multiplier at every property. */
  visibility?: number;
  /** Ignore heat-wave thirst. */
  heatProof?: boolean;
  /** Unlocks a station, feature or app. */
  unlocks?: string;
}

export interface UpgradeDef {
  readonly id: UpgradeId;
  readonly name: string;
  readonly line: string;
  readonly rank: number;
  readonly cost: number;
  readonly icon: string;
  readonly effects: UpgradeEffects;
  /** Must own these first. */
  readonly requires?: readonly UpgradeId[];
}

const up = (d: UpgradeDef): UpgradeDef => d;

export const UPGRADES: Readonly<Record<UpgradeId, UpgradeDef>> = {
  dripIrrigation: up({ id: 'dripIrrigation', name: 'Drip Irrigation', rank: 2, cost: 240, icon: 'drip',
    line: 'Never refill again. Every pot drinks on its own, forever.', effects: { noWater: true } }),
  snipSnap: up({ id: 'snipSnap', name: 'Snip-Snap Trimmer', rank: 2, cost: 180, icon: 'scissors',
    line: 'Spring-loaded shears from a TV ad. One more unit per harvest.', effects: { yield: 1 } }),
  secondBurner: up({ id: 'secondBurner', name: 'Second Burner Phone', rank: 2, cost: 150, icon: 'phone',
    line: 'Two phones, twice the regulars. Texts arrive faster.', effects: { requestSlots: 2, requestRate: 1.3 } }),
  sunLamps: up({ id: 'sunLamps', name: 'Sun-Grade Lamps', rank: 3, cost: 650, icon: 'lamp',
    line: 'Lamps so warm the plants send postcards. Grows 20 % faster.', effects: { growTime: 0.8 } }),
  bigBowl: up({ id: 'bigBowl', name: 'Bigger Mixing Bowl', rank: 3, cost: 420, icon: 'bowl',
    line: 'Mix twelve at a time, and quicker. Abuela’s paella pan, repurposed.', effects: { batch: 12, mixTime: 0.7 } }),
  autoRestock: up({ id: 'autoRestock', name: 'Auto-Restock', rank: 3, cost: 300, icon: 'repeat',
    line: 'Subscribe to seeds and additives. They show up in the drop box.', effects: { unlocks: 'feature:subscriptions' } }),
  blackout: up({ id: 'blackout', name: 'Blackout Retrofit', rank: 3, cost: 520, icon: 'curtain',
    line: 'Tinted glass and heavy drapes everywhere. Visibility down a quarter.', effects: { visibility: 0.75 } }),
  recipeBox: up({ id: 'recipeBox', name: 'Ofelia’s Recipe Box', rank: 4, cost: 1200, icon: 'box',
    line: 'Her index cards, in order. Room for a fourth effect.', effects: { cap: 4 } }),
  autoFeed: up({ id: 'autoFeed', name: 'Auto-Feed Lines', rank: 4, cost: 900, icon: 'feed',
    line: 'Nutrient lines in every planter. Nobody goes hungry.', effects: { noFood: true }, requires: ['dripIrrigation'] }),
  climateControl: up({ id: 'climateControl', name: 'Climate Control', rank: 4, cost: 1500, icon: 'thermo',
    line: 'Perfect air, perfect blooms. Faster growth, better quality, heat-wave proof.', effects: { growTime: 0.85, quality: 0.05, heatProof: true } }),
  coldStill: up({ id: 'coldStill', name: 'Cold Still', rank: 4, cost: 2000, icon: 'still',
    line: 'Condenses three Bloom into one Dew. Place it in Build Mode.', effects: { unlocks: 'station:coldStill' } }),
  breedingCabinet: up({ id: 'breedingCabinet', name: 'Breeding Cabinet', rank: 5, cost: 2500, icon: 'dna',
    line: 'Cross two strains, pick a seedling, give it a terrible name.', effects: { unlocks: 'station:breedingCabinet' } }),
  chauffeur: up({ id: 'chauffeur', name: 'Chauffeur Service', rank: 5, cost: 1800, icon: 'car',
    line: 'Dex’s cousin drives you anywhere you own. Driving yourself still tips better.', effects: { unlocks: 'feature:chauffeur' } }),
  crewVan: up({ id: 'crewVan', name: 'Crew Van', rank: 5, cost: 3000, icon: 'van',
    line: 'A van with a fake plumbing logo. Dealers restock themselves.', effects: { unlocks: 'feature:crewVan' } }),
  sunPress: up({ id: 'sunPress', name: 'Sun Press', rank: 6, cost: 6000, icon: 'press',
    line: 'Presses one Dew into six logo-stamped Halos.', effects: { unlocks: 'station:sunPress' }, requires: ['coldStill'] }),
  secretPage: up({ id: 'secretPage', name: 'The Secret Page', rank: 7, cost: 8000, icon: 'page',
    line: 'The page she taped under the drawer. Room for a fifth effect.', effects: { cap: 5 }, requires: ['recipeBox'] }),
};

export const UPGRADE_ORDER: readonly UpgradeId[] = [
  'dripIrrigation', 'snipSnap', 'secondBurner', 'sunLamps', 'bigBowl', 'autoRestock', 'blackout', 'recipeBox', 'autoFeed',
  'climateControl', 'coldStill', 'breedingCabinet', 'chauffeur', 'crewVan', 'sunPress', 'secretPage',
];
