import type { RivalId, StoryContactId } from './ids';
import type { DistrictId } from './places';

/** The three rival factions and the ways the player can answer them. */

export type RivalActionId = 'outBrand' | 'outPrice' | 'ambush' | 'ally' | 'bribe' | 'expose' | 'sabotage';

export interface RivalActionDef {
  readonly id: RivalActionId;
  readonly name: string;
  readonly line: string;
  readonly cost: number;
  /** Seconds before it can be used again against the same rival. */
  readonly cooldown: number;
  readonly rank: number;
  readonly pressure: number;
  readonly standing: number;
  readonly influence: number;
  readonly notoriety: number;
}

export const RIVAL_ACTIONS: Readonly<Record<RivalActionId, RivalActionDef>> = {
  outBrand: { id: 'outBrand', name: 'Out-brand them', line: 'A campaign that makes yours the name people say. Needs real hype.', cost: 1500, cooldown: 960, rank: 4, pressure: -15, standing: -5, influence: 10, notoriety: 1 },
  outPrice: { id: 'outPrice', name: 'Undercut them', line: 'A cheap week on their turf. Customers follow the deal.', cost: 900, cooldown: 960, rank: 4, pressure: -10, standing: -10, influence: 8, notoriety: 0 },
  ambush: { id: 'ambush', name: 'Hit their supply', line: 'Intercept a delivery. Loud, effective, remembered.', cost: 0, cooldown: 1440, rank: 6, pressure: -20, standing: -25, influence: 15, notoriety: 6 },
  ally: { id: 'ally', name: 'Make peace', line: 'Share the coast. Needs their respect first.', cost: 2500, cooldown: 2880, rank: 6, pressure: -60, standing: 30, influence: 0, notoriety: 0 },
  bribe: { id: 'bribe', name: 'Pay them off', line: 'Money talks. Their pressure goes quiet for a while.', cost: 3000, cooldown: 1440, rank: 5, pressure: -20, standing: 5, influence: 0, notoriety: 0 },
  expose: { id: 'expose', name: 'Tip off Det. Reyes', line: 'Feed the detective a story about them instead of you.', cost: 0, cooldown: 2880, rank: 7, pressure: -40, standing: -40, influence: 12, notoriety: -10 },
  sabotage: { id: 'sabotage', name: 'Sabotage', line: 'Something breaks at exactly the wrong moment for them.', cost: 800, cooldown: 1200, rank: 5, pressure: -15, standing: -15, influence: 10, notoriety: 3 },
};

export interface RivalDef {
  readonly id: RivalId;
  readonly name: string;
  readonly leader: StoryContactId;
  readonly color: string;
  readonly home: readonly DistrictId[];
  /** What the world gives them to drive. */
  readonly vehicle: 'sedan' | 'airboat' | 'suv';
  readonly blurb: string;
  readonly model: string;
  /** Lines their leader texts when pressure spikes or when you act against them. */
  readonly pressureLines: readonly string[];
  readonly answerLines: Readonly<Partial<Record<RivalActionId, string>>>;
  /** Which actions fit them (others are allowed but cost more). */
  readonly weakTo: readonly RivalActionId[];
}

export const RIVALS: Readonly<Record<RivalId, RivalDef>> = {
  vale: {
    id: 'vale', name: 'Vale Imports', leader: 'vale', color: '#C9A227', home: ['harbor', 'crown'], vehicle: 'sedan',
    blurb: 'Old-school import business behind a family restaurant. Polite, patient, everywhere.',
    model: 'Controls the docks and wholesale. Leans on debtors. Rewards respect.',
    pressureLines: [
      'My people tell me you are selling near the quay. Come, we will discuss it over dessert. — I.V.',
      'The harbor is a family. Families have rules. Learn them. — I.V.',
    ],
    answerLines: {
      ally: 'Partners, then. My grandmother and yours would have liked this. — I.V.',
      expose: 'Someone has been talking to the police about my shipments. I hope it was not you. — I.V.',
      ambush: 'A crate of mine went missing. I will find it. I always do. — I.V.',
    },
    weakTo: ['ally', 'bribe', 'outPrice'],
  },
  mudflaps: {
    id: 'mudflaps', name: 'The Mudflaps', leader: 'duchess', color: '#7A8A3A', home: ['sawgrass', 'keys'], vehicle: 'airboat',
    blurb: 'Airboat-riding swamp bikers. Loud engines, louder vests, surprisingly good manners.',
    model: 'Raid supply lines in the Sawgrass and the Keys. Respect strength.',
    pressureLines: [
      'Saw your little truck on the swamp road. Pretty paint. Be a shame. — Duchess',
      'Swamp tax is due, sugar. We take cash, crates, or apologies. — Duchess',
    ],
    answerLines: {
      ambush: 'You hit my boys’ run. Bold. I like bold. I also hate it. — Duchess',
      ally: 'Truce. You keep off the deep channels, we keep off your porch. — Duchess',
      bribe: 'Money’s the only language the swamp speaks fluently. Received. — Duchess',
    },
    weakTo: ['ambush', 'sabotage', 'bribe'],
  },
  zenith: {
    id: 'zenith', name: 'Zenith Wellness', leader: 'zen', color: '#E9E6FF', home: ['crown', 'deco', 'strand'], vehicle: 'suv',
    blurb: 'A hyper-branded wellness empire with ring lights, cold plunges and suspiciously familiar products.',
    model: 'Poaches customers with marketing and discounts. Hates bad press.',
    pressureLines: [
      'Love what you’re doing. Truly. We’re launching something similar next week. Namaste. — Zen',
      'Your customers look stressed. We have a retreat for that. 40% off for your regulars. — Zen',
    ],
    answerLines: {
      outBrand: 'Interesting campaign. Very… grassroots. We’re pivoting. — Zen',
      expose: 'A podcast host is asking about our supply chain. I wonder who sent her. — Zen',
      sabotage: 'Our pop-up’s ring lights all failed at once. Energy is everything. Yours is chaotic. — Zen',
    },
    weakTo: ['outBrand', 'expose', 'sabotage'],
  },
};
