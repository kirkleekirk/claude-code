import type { Flavor } from './additives';
import type { Vibe } from './effects';
import type { EventId, RivalId } from './ids';
import type { DistrictId, PlaceId } from './places';

/**
 * Living events. Each is forecast a day ahead on the phone, runs for a window of the clock, bends
 * the world's numbers while active, and some end with an outcome the world reports.
 */

export interface EventMods {
  thirst?: number;
  growth?: number;
  /** Demand multiplier in the event district (or everywhere if the event is citywide). */
  demand?: number;
  vibes?: Partial<Record<Vibe, number>>;
  prices?: number;
  police?: number;
  notoriety?: number;
  supply?: Partial<Record<Flavor, number>>;
  seeds?: number;
  audit?: number;
  requestRate?: number;
  tips?: number;
}

export interface EventOutcome {
  readonly id: string;
  readonly label: string;
  readonly cash: number;
  readonly xp: number;
  readonly hype: number;
  readonly notoriety: number;
  readonly rival?: { readonly id: RivalId; readonly pressure: number };
}

export interface EventDef {
  readonly id: EventId;
  readonly name: string;
  readonly blurb: string;
  readonly icon: string;
  /** null = citywide; otherwise where it happens. */
  readonly district: DistrictId | null;
  readonly place: PlaceId | null;
  /** Clock hour it starts and how many sim-seconds it runs. */
  readonly start: number;
  readonly duration: number;
  readonly minRank: number;
  /** Relative chance on a given day. 0 = only scheduled by story or other systems. */
  readonly weight: number;
  /** Minimum days before it can roll again. */
  readonly cooldown: number;
  readonly mods: EventMods;
  /** Outcomes the world can report (races, chases, sabotage). */
  readonly outcomes: readonly EventOutcome[];
  readonly tip: string;
}

const e = (d: EventDef): EventDef => d;

export const EVENTS: Readonly<Record<EventId, EventDef>> = {
  beachParty: e({ id: 'beachParty', name: 'Beach Party Surge', icon: 'party', district: 'strand', place: 'strandBeach', start: 16, duration: 300, minRank: 2, weight: 3, cooldown: 2,
    blurb: 'A radio station is throwing a party on Strand Beach. Everyone is there and everyone wants to dance.',
    mods: { demand: 1.6, vibes: { party: 1.7, beach: 1.4 }, police: 1.2, tips: 1.2 }, outcomes: [], tip: 'Bring Disco Feet and Giggles.' }),
  carMeet: e({ id: 'carMeet', name: 'Car Meet at The Lot', icon: 'car', district: 'flats', place: 'theLot', start: 21, duration: 240, minRank: 2, weight: 2, cooldown: 2,
    blurb: 'Tuners, lowriders and one very loud muscle car fill the dead mall’s parking lot.',
    mods: { demand: 1.3, vibes: { night: 1.5 }, tips: 1.5 }, outcomes: [
      { id: 'won', label: 'Won the drift showdown', cash: 600, xp: 80, hype: 4, notoriety: 1 },
      { id: 'lost', label: 'Spun out in style', cash: 0, xp: 25, hype: 1, notoriety: 0 },
    ], tip: 'Drifts here fill the Flow meter fast.' }),
  parade: e({ id: 'parade', name: 'Flamingo Parade', icon: 'flamingo', district: 'deco', place: 'flamingoCourt', start: 14, duration: 240, minRank: 3, weight: 2, cooldown: 3,
    blurb: 'Floats, marching bands and a twelve-foot inflatable flamingo crawl down Deco Row.',
    mods: { demand: 1.5, vibes: { party: 1.4, romance: 1.3 }, police: 1.5 }, outcomes: [], tip: 'Crowds hide handoffs, but the cops are thick.' }),
  concert: e({ id: 'concert', name: 'Arena Concert', icon: 'music', district: 'crown', place: 'arena', start: 20, duration: 300, minRank: 3, weight: 2, cooldown: 2,
    blurb: 'A synth-pop reunion tour sells out Halcyon Arena. The parking lots are a party.',
    mods: { demand: 1.6, vibes: { party: 1.5, night: 1.4 }, police: 1.3, prices: 1.1 }, outcomes: [], tip: 'Crown Point pays top dollar tonight.' }),
  heatWave: e({ id: 'heatWave', name: 'Heat Wave', icon: 'thermo', district: null, place: null, start: 10, duration: 420, minRank: 2, weight: 2, cooldown: 3,
    blurb: 'It is 101 in the shade and the shade is also 101. Plants are thirsty. People want to chill.',
    mods: { thirst: 2, vibes: { chill: 1.5, beach: 1.3 }, demand: 1.1 }, outcomes: [], tip: 'Water twice. Climate control makes plants shrug it off.' }),
  crackdown: e({ id: 'crackdown', name: 'Police Crackdown', icon: 'siren', district: 'strand', place: 'boardwalk', start: 18, duration: 360, minRank: 3, weight: 2, cooldown: 3,
    blurb: 'The mayor promised to “clean up the Strand” on TV. Patrols double for a night.',
    mods: { police: 2, notoriety: 1.5, prices: 1.2 }, outcomes: [], tip: 'Prices up, risk up. Or sell somewhere else tonight.' }),
  shortage: e({ id: 'shortage', name: 'Supplier Shortage', icon: 'crate', district: null, place: null, start: 7, duration: 600, minRank: 3, weight: 2, cooldown: 3,
    blurb: 'A container of citrus is stuck at customs. Lime and orange prices go through the roof.',
    mods: { supply: { citrus: 1.8 } }, outcomes: [], tip: 'Stock up before, or mix around it.' }),
  customerTrouble: e({ id: 'customerTrouble', name: 'A Friend in Trouble', icon: 'heart', district: null, place: null, start: 13, duration: 360, minRank: 3, weight: 2, cooldown: 2,
    blurb: 'One of your regulars is in a jam and texts you first. Helping them is the kind of thing people remember.',
    mods: {}, outcomes: [
      { id: 'helped', label: 'Showed up for them', cash: 0, xp: 70, hype: 2, notoriety: 0 },
      { id: 'missed', label: 'Could not make it', cash: 0, xp: 0, hype: 0, notoriety: 0 },
    ], tip: 'Loyal customers become superfans when you show up.' }),
  rivalAmbush: e({ id: 'rivalAmbush', name: 'Rival Ambush', icon: 'alert', district: 'sawgrass', place: 'boatRamp', start: 19, duration: 240, minRank: 4, weight: 1.5, cooldown: 3,
    blurb: 'The Mudflaps are planning to hit one of your dealers. Defend the turf or lose ground.',
    mods: { police: 0.8 }, outcomes: [
      { id: 'defended', label: 'Sent them back to the swamp', cash: 400, xp: 90, hype: 3, notoriety: 2, rival: { id: 'mudflaps', pressure: -15 } },
      { id: 'lost', label: 'Lost the corner for a night', cash: 0, xp: 10, hype: -2, notoriety: 0, rival: { id: 'mudflaps', pressure: 10 } },
    ], tip: 'Guards and a fast car help.' }),
  boatChase: e({ id: 'boatChase', name: 'Smuggler’s Run', icon: 'boat', district: 'harbor', place: 'fishMarket', start: 23, duration: 240, minRank: 5, weight: 1.5, cooldown: 3,
    blurb: 'A shipment of rare seeds is coming in by boat, and the harbor patrol is out tonight.',
    mods: {}, outcomes: [
      { id: 'escaped', label: 'Outran the harbor patrol', cash: 1500, xp: 120, hype: 4, notoriety: 3 },
      { id: 'dumped', label: 'Dumped the cargo and ran', cash: 0, xp: 30, hype: 0, notoriety: 1 },
    ], tip: 'Take a fast boat. The patrol hates the mangroves.' }),
  streetRace: e({ id: 'streetRace', name: 'Causeway Street Race', icon: 'flag', district: 'harbor', place: 'causeway', start: 22, duration: 180, minRank: 3, weight: 2, cooldown: 2,
    blurb: 'Midnight run over the Causeway. Winner takes the pot and the bragging rights.',
    mods: { police: 1.2 }, outcomes: [
      { id: 'first', label: 'First across the line', cash: 1200, xp: 120, hype: 5, notoriety: 2 },
      { id: 'podium', label: 'Podium finish', cash: 400, xp: 60, hype: 2, notoriety: 1 },
      { id: 'dnf', label: 'Did not finish (but looked cool)', cash: 0, xp: 20, hype: 1, notoriety: 1 },
    ], tip: 'Draft the leader on the bridge, boost on the downslope.' }),
  fireworks: e({ id: 'fireworks', name: 'Fireworks Festival', icon: 'firework', district: 'strand', place: 'pier9', start: 20.5, duration: 300, minRank: 2, weight: 2, cooldown: 3,
    blurb: 'Fireworks off Pier 9. The whole Strand looks up, and the whole Strand wants to feel something.',
    mods: { demand: 1.5, vibes: { romance: 1.6, party: 1.3 }, tips: 1.3 }, outcomes: [], tip: 'Golden Hour and Shimmer sell themselves tonight.' }),
  popUp: e({ id: 'popUp', name: 'Zenith Pop-Up', icon: 'ring', district: 'strand', place: 'boardwalk', start: 12, duration: 360, minRank: 4, weight: 1.5, cooldown: 3,
    blurb: 'Zenith Wellness sets up a ring-lit pop-up on the boardwalk, giving away free samples of something suspiciously familiar.',
    mods: { demand: 0.7, prices: 0.9 }, outcomes: [
      { id: 'sabotaged', label: 'The pop-up “lost power”', cash: 0, xp: 80, hype: 4, notoriety: 2, rival: { id: 'zenith', pressure: -15 } },
      { id: 'ignored', label: 'Let them have the day', cash: 0, xp: 0, hype: -2, notoriety: 0, rival: { id: 'zenith', pressure: 8 } },
    ], tip: 'Out-brand them, or make sure the ring lights fail.' }),
  auditWeek: e({ id: 'auditWeek', name: 'Audit Week', icon: 'calculator', district: null, place: null, start: 8, duration: 900, minRank: 5, weight: 1.5, cooldown: 4,
    blurb: 'The tax office announces “enhanced reviews” of local small businesses. Every front is a little more visible.',
    mods: { audit: 2 }, outcomes: [], tip: 'Ease off the fronts or hire an accountant.' }),
  kingTide: e({ id: 'kingTide', name: 'King Tide', icon: 'wave', district: 'sawgrass', place: 'boatRamp', start: 6, duration: 480, minRank: 3, weight: 1.5, cooldown: 3,
    blurb: 'Extra-high tides flood the swamp roads. Deliveries out there pay extra, if you can get there.',
    mods: { demand: 1.5, tips: 1.4 }, outcomes: [], tip: 'Airboats and high trucks only.' }),
  fullMoon: e({ id: 'fullMoon', name: 'Full Moon Bonfire', icon: 'moon', district: 'keys', place: 'lighthouse', start: 21, duration: 300, minRank: 4, weight: 1.5, cooldown: 3,
    blurb: 'A bonfire at the old lighthouse. Drums, driftwood and people who want to see things.',
    mods: { demand: 1.6, vibes: { weird: 2, creative: 1.5 } }, outcomes: [], tip: 'Third Eye and Shimmer, by the armful.' }),
  farmersMarket: e({ id: 'farmersMarket', name: 'Farmers Market', icon: 'basket', district: 'flats', place: 'palmettoPark', start: 7, duration: 360, minRank: 1, weight: 2, cooldown: 2,
    blurb: 'Saturday market in Palmetto Park. Seed vendors are feeling generous.',
    mods: { seeds: 0.75, demand: 1.2, vibes: { chill: 1.3 } }, outcomes: [], tip: 'Seeds are a quarter off today.' }),
  hurricaneWatch: e({ id: 'hurricaneWatch', name: 'Hurricane Watch', icon: 'storm', district: null, place: null, start: 9, duration: 1500, minRank: 9, weight: 0, cooldown: 99,
    blurb: 'A hurricane is spinning up in the Gulf. The city is boarding windows. Everyone is buying everything.',
    mods: { demand: 1.4, prices: 1.25, police: 0.7, requestRate: 1.3 }, outcomes: [], tip: 'Sell now. Then get your stash somewhere high and dry.' }),
};
