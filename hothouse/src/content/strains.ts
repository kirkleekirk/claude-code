import type { BaseEffectId, EffectId } from './effects';

/**
 * Ofelia's hybrids: twelve fictional ornamental botanicals, each with a signature effect and genes
 * that drive the grow loop. Growth times are in sim-seconds at standard light and balanced feed.
 */

export const STRAIN_IDS = [
  'abuelasBlush', 'gatorgrassGold', 'neonNana', 'swampHalo', 'causewayCoral', 'midnightMango',
  'lighthouseLime', 'pelicanPunch', 'hurricaneHibiscus', 'velvetManatee', 'flamingoFever', 'ghostOrchid9',
] as const;
export type BaseStrainId = (typeof STRAIN_IDS)[number];
/** Base strain ids, or `x-…` ids for strains bred in the Breeding Cabinet. */
export type StrainId = BaseStrainId | `x-${string}`;

export type FlowerForm = 'star' | 'ruffle' | 'cup' | 'spike' | 'puff' | 'orchid' | 'trumpet' | 'fan';

export interface StrainLook {
  readonly petal: string;
  readonly center: string;
  readonly leaf: string;
  /** Faint emissive tint under grow lights at night. */
  readonly glow: string;
  readonly form: FlowerForm;
  /** Petals per bloom. */
  readonly petals: number;
  /** Plant height at ripeness in metres. */
  readonly height: number;
  /** 0 = lanky, 1 = bushy. */
  readonly bushiness: number;
}

export interface StrainDef {
  readonly id: StrainId;
  readonly name: string;
  /** Short word used in product names ("Blush Tide"). */
  readonly short: string;
  readonly effect: EffectId;
  /** Sim-seconds from seed to ripe at standard settings. */
  readonly growTime: number;
  /** Units per harvest at balanced feed. */
  readonly yield: number;
  /** Base quality 0–1 before care, feed, light and timing. */
  readonly quality: number;
  /** Water use: 1 normal, higher drinks less and shrugs off neglect. */
  readonly hardiness: number;
  /** Bag appeal price multiplier. */
  readonly appeal: number;
  /** Base value per unit in dollars before effects. */
  readonly value: number;
  readonly seedPrice: number;
  /** Rank at which seeds are sold. */
  readonly rank: number;
  /** Seconds after ripening that still count as peak harvest. */
  readonly peakWindow: number;
  readonly look: StrainLook;
  readonly line: string;
  /** Ofelia's margin note on the Strain Dex page. */
  readonly note: string;
  /** Set for bred strains. */
  readonly parents?: readonly [StrainId, StrainId];
  readonly mutation?: string;
}

const s = (d: StrainDef): StrainDef => d;

export const STRAINS: Readonly<Record<BaseStrainId, StrainDef>> = {
  abuelasBlush: s({
    id: 'abuelasBlush', name: 'Abuela’s Blush', short: 'Blush', effect: 'sunkissed', growTime: 180, yield: 4, quality: 0.5, hardiness: 1.2,
    appeal: 1.0, value: 30, seedPrice: 15, rank: 1, peakWindow: 60,
    look: { petal: '#FF8FB1', center: '#FFD166', leaf: '#3E8E5E', glow: '#FF5FA0', form: 'ruffle', petals: 9, height: 0.85, bushiness: 0.7 },
    line: 'Pink ruffles, warm finish. The one that started it all.',
    note: 'My first cross. I named it after my own cheeks in July. Water twice, worry never.',
  }),
  gatorgrassGold: s({
    id: 'gatorgrassGold', name: 'Gatorgrass Gold', short: 'Gator', effect: 'mellowTide', growTime: 170, yield: 5, quality: 0.45, hardiness: 1.5,
    appeal: 0.95, value: 28, seedPrice: 14, rank: 1, peakWindow: 75,
    look: { petal: '#FFC23D', center: '#8A5A2A', leaf: '#5E8A3A', glow: '#FFB43D', form: 'spike', petals: 14, height: 1.0, bushiness: 0.45 },
    line: 'Tough as a gator’s handbag and twice as mellow.',
    note: 'You cannot kill this one. I have tried. Twice. On purpose.',
  }),
  neonNana: s({
    id: 'neonNana', name: 'Neon Nana', short: 'Nana', effect: 'discoFeet', growTime: 210, yield: 4, quality: 0.55, hardiness: 0.9,
    appeal: 1.35, value: 38, seedPrice: 28, rank: 2, peakWindow: 55,
    look: { petal: '#FF3D8B', center: '#17E0C8', leaf: '#2F7A5A', glow: '#FF3DD0', form: 'star', petals: 6, height: 0.75, bushiness: 0.6 },
    line: 'Hot pink stars that look lit even at noon.',
    note: 'Named for my friend Nana Ro, who still out-dances everyone at the Legion hall.',
  }),
  swampHalo: s({
    id: 'swampHalo', name: 'Swamp Halo', short: 'Halo', effect: 'dreamy', growTime: 200, yield: 5, quality: 0.55, hardiness: 1.1,
    appeal: 1.05, value: 34, seedPrice: 24, rank: 2, peakWindow: 65,
    look: { petal: '#C9A7FF', center: '#FFF4E3', leaf: '#4E7A68', glow: '#B07FFF', form: 'cup', petals: 5, height: 0.9, bushiness: 0.55 },
    line: 'Lavender cups that seem to hum after dark.',
    note: 'Found the mother plant in the Sawgrass under a full moon. Do not go looking. Mosquitoes.',
  }),
  causewayCoral: s({
    id: 'causewayCoral', name: 'Causeway Coral', short: 'Coral', effect: 'chatty', growTime: 190, yield: 5, quality: 0.5, hardiness: 1.0,
    appeal: 1.1, value: 32, seedPrice: 20, rank: 2, peakWindow: 60,
    look: { petal: '#FF6B5E', center: '#FFD47A', leaf: '#3E7A52', glow: '#FF6B5E', form: 'fan', petals: 7, height: 0.8, bushiness: 0.65 },
    line: 'Coral fans that never stop talking. Figuratively.',
    note: 'Grows best where it can see traffic. It likes to gossip.',
  }),
  midnightMango: s({
    id: 'midnightMango', name: 'Midnight Mango', short: 'Mango', effect: 'nightOwl', growTime: 220, yield: 5, quality: 0.6, hardiness: 1.0,
    appeal: 1.15, value: 40, seedPrice: 32, rank: 3, peakWindow: 60,
    look: { petal: '#FF9A3C', center: '#3A2A7A', leaf: '#2B5E4A', glow: '#FF8A2A', form: 'trumpet', petals: 5, height: 1.05, bushiness: 0.5 },
    line: 'Tangerine trumpets that only fully open after sunset.',
    note: 'A night bloomer, like me in the eighties.',
  }),
  lighthouseLime: s({
    id: 'lighthouseLime', name: 'Lighthouse Lime', short: 'Lime', effect: 'laserFocus', growTime: 230, yield: 4, quality: 0.62, hardiness: 1.0,
    appeal: 1.1, value: 42, seedPrice: 34, rank: 3, peakWindow: 55,
    look: { petal: '#B8F54A', center: '#FFFFFF', leaf: '#356E44', glow: '#C8FF5A', form: 'spike', petals: 18, height: 1.1, bushiness: 0.35 },
    line: 'Bright green spires. Smells like a clean desk.',
    note: 'Ask it a question and it will answer. Takes notes, too.',
  }),
  pelicanPunch: s({
    id: 'pelicanPunch', name: 'Pelican Punch', short: 'Punch', effect: 'bold', growTime: 200, yield: 5, quality: 0.55, hardiness: 1.15,
    appeal: 1.1, value: 36, seedPrice: 26, rank: 3, peakWindow: 60,
    look: { petal: '#FF5A48', center: '#FFE9D0', leaf: '#3B6E4A', glow: '#FF4A30', form: 'puff', petals: 24, height: 0.95, bushiness: 0.75 },
    line: 'Red pompoms with the confidence of a pelican stealing fries.',
    note: 'Keep it away from the Halo. They fight.',
  }),
  hurricaneHibiscus: s({
    id: 'hurricaneHibiscus', name: 'Hurricane Hibiscus', short: 'Hibiscus', effect: 'electric', growTime: 240, yield: 4, quality: 0.7, hardiness: 0.65,
    appeal: 1.3, value: 52, seedPrice: 45, rank: 4, peakWindow: 45,
    look: { petal: '#FF2E4D', center: '#FFD166', leaf: '#2E6A4A', glow: '#FF2E7A', form: 'trumpet', petals: 5, height: 1.2, bushiness: 0.6 },
    line: 'Big crimson blooms with a static crackle. Fussy. Worth it.',
    note: 'Fragile as my patience. Never let it go thirsty.',
  }),
  velvetManatee: s({
    id: 'velvetManatee', name: 'Velvet Manatee', short: 'Manatee', effect: 'couchGravity', growTime: 260, yield: 8, quality: 0.5, hardiness: 1.3,
    appeal: 0.95, value: 30, seedPrice: 30, rank: 4, peakWindow: 90,
    look: { petal: '#8E6BEA', center: '#D9D2F0', leaf: '#4A7A6A', glow: '#8E5BFF', form: 'puff', petals: 30, height: 0.7, bushiness: 0.95 },
    line: 'Soft purple puffs, slow growth, an absurd harvest.',
    note: 'Lazy, generous, round. Like your uncle Tito.',
  }),
  flamingoFever: s({
    id: 'flamingoFever', name: 'Flamingo Fever', short: 'Flamingo', effect: 'giggles', growTime: 210, yield: 5, quality: 0.6, hardiness: 1.0,
    appeal: 1.25, value: 38, seedPrice: 30, rank: 3, peakWindow: 60,
    look: { petal: '#FF9EC2', center: '#FF5A8A', leaf: '#3E7A5A', glow: '#FF6FB0', form: 'star', petals: 8, height: 1.0, bushiness: 0.5 },
    line: 'Pink, leggy and impossible to take seriously.',
    note: 'Stands on one stem when it thinks nobody is watching.',
  }),
  ghostOrchid9: s({
    id: 'ghostOrchid9', name: 'Ghost Orchid 9', short: 'Orchid', effect: 'thirdEye', growTime: 320, yield: 3, quality: 0.8, hardiness: 0.8,
    appeal: 1.4, value: 75, seedPrice: 90, rank: 6, peakWindow: 50,
    look: { petal: '#F4F8FF', center: '#2CC7B8', leaf: '#2B4E44', glow: '#7FFFF0', form: 'orchid', petals: 6, height: 0.6, bushiness: 0.3 },
    line: 'White and floating, like it forgot it has roots.',
    note: 'Attempts one through eight are in the compost. Be kind to number nine.',
  }),
};

export function isBaseStrain(id: string): id is BaseStrainId {
  return id in STRAINS;
}

export type { BaseEffectId };
