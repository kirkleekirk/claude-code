/**
 * Short rotating goals (three active at a time). Each tracks a stat counter from the moment it is
 * issued. Targets scale with rank; rewards scale with the target.
 */

export type GoalStat =
  | 'deals' | 'perfectDeals' | 'unitsSold' | 'harvests' | 'perfectSnips' | 'tends' | 'mixes' | 'discoveries'
  | 'samples' | 'earned' | 'flowTips' | 'escapes' | 'laundered';

export interface GoalDef {
  readonly id: string;
  /** `{n}` is the target. */
  readonly text: string;
  readonly stat: GoalStat;
  /** Target by rank band: ranks 1–2, 3–4, 5–6, 7–8, 9–10. */
  readonly targets: readonly [number, number, number, number, number];
  readonly minRank: number;
  readonly icon: string;
  /** Unlock id required (e.g. samples), if any. */
  readonly unlock?: string;
}

export const GOALS: readonly GoalDef[] = [
  { id: 'deals', text: 'Close {n} deals', stat: 'deals', targets: [3, 5, 8, 12, 16], minRank: 1, icon: 'handshake' },
  { id: 'perfect', text: 'Land {n} Perfect Deals', stat: 'perfectDeals', targets: [1, 2, 3, 5, 6], minRank: 1, icon: 'sparkle' },
  { id: 'units', text: 'Sell {n} units', stat: 'unitsSold', targets: [8, 16, 30, 50, 80], minRank: 2, icon: 'bag' },
  { id: 'harvest', text: 'Harvest {n} plants', stat: 'harvests', targets: [3, 6, 10, 14, 20], minRank: 1, icon: 'scissors' },
  { id: 'snips', text: 'Hit {n} perfect snips', stat: 'perfectSnips', targets: [4, 8, 12, 16, 20], minRank: 1, icon: 'target' },
  { id: 'tend', text: 'Tend {n} plants', stat: 'tends', targets: [6, 12, 18, 24, 30], minRank: 1, icon: 'water' },
  { id: 'mix', text: 'Mix {n} batches', stat: 'mixes', targets: [2, 4, 6, 8, 10], minRank: 1, icon: 'bowl' },
  { id: 'discover', text: 'Discover {n} new products', stat: 'discoveries', targets: [1, 2, 3, 4, 5], minRank: 1, icon: 'book' },
  { id: 'samples', text: 'Hand out {n} free samples', stat: 'samples', targets: [2, 3, 4, 5, 6], minRank: 3, icon: 'gift', unlock: 'feature:samples' },
  { id: 'earn', text: 'Earn {n}', stat: 'earned', targets: [500, 1500, 5000, 12000, 25000], minRank: 1, icon: 'cash' },
  { id: 'flow', text: 'Deliver with Flow {n} times', stat: 'flowTips', targets: [1, 2, 3, 4, 5], minRank: 1, icon: 'flow' },
  { id: 'escape', text: 'Shake off the police {n} times', stat: 'escapes', targets: [1, 1, 2, 2, 3], minRank: 3, icon: 'siren' },
  { id: 'launder', text: 'Launder {n}', stat: 'laundered', targets: [0, 0, 3000, 8000, 20000], minRank: 5, icon: 'bank', unlock: 'feature:fronts' },
];

export function goalBand(rank: number): 0 | 1 | 2 | 3 | 4 {
  return rank <= 2 ? 0 : rank <= 4 ? 1 : rank <= 6 ? 2 : rank <= 8 ? 3 : 4;
}
