import type { ContactId, CustomerId, FrontId, MissionId, RivalId, Tier } from './ids';
import type { PlaceId } from './places';

/**
 * The fourteen story missions as data. The world runs the set-pieces (`setPiece` ids) and reports
 * world-observed objectives with `cmd.objectiveDone`; objectives the sim can see (deliveries,
 * harvests, payments, purchases) complete on their own. Every mission is skippable mid-way via
 * fail → retry from the last checkpoint, and none can end the game.
 */

export type ObjectiveDef =
  | { readonly kind: 'goto'; readonly text: string; readonly place: PlaceId }
  | { readonly kind: 'talk'; readonly text: string; readonly contact: ContactId; readonly place: PlaceId }
  | { readonly kind: 'setpiece'; readonly text: string; readonly id: string; readonly place: PlaceId | null }
  | { readonly kind: 'escape'; readonly text: string; readonly heat: number }
  | { readonly kind: 'deliver'; readonly text: string; readonly customer: CustomerId | null; readonly qty: number; readonly tier?: Tier }
  | { readonly kind: 'harvest'; readonly text: string; readonly qty: number }
  | { readonly kind: 'buyFront'; readonly text: string; readonly front: FrontId }
  | { readonly kind: 'pay'; readonly text: string; readonly amount: number }
  | { readonly kind: 'choice'; readonly text: string; readonly options: ReadonlyArray<{ readonly id: string; readonly label: string; readonly line: string }> };

export interface MissionUnlock {
  readonly rank?: number;
  readonly after?: readonly MissionId[];
  readonly beat?: string;
  /** Becomes available once the debt is settled, whichever way. */
  readonly debtSettled?: boolean;
}

export interface MissionRewards {
  readonly cash: number;
  readonly currency: 'dirty' | 'clean';
  readonly xp: number;
  readonly hype?: number;
  readonly notoriety?: number;
  /** Crew member who joins on completion. */
  readonly crew?: string;
  readonly customer?: CustomerId;
  readonly unlock?: string;
  readonly rival?: { readonly id: RivalId; readonly pressure: number; readonly standing: number };
  readonly respect?: number;
}

export interface MissionDef {
  readonly id: MissionId;
  readonly act: 1 | 2 | 3;
  readonly title: string;
  readonly giver: ContactId;
  readonly blurb: string;
  readonly unlock: MissionUnlock;
  /** Clock window when it can be started, if any. */
  readonly window?: readonly [number, number];
  readonly briefing: readonly string[];
  readonly objectives: readonly ObjectiveDef[];
  /** Objective indices that act as checkpoints for instant retry. */
  readonly checkpoints: readonly number[];
  readonly setPiece: string;
  readonly rewards: MissionRewards;
  readonly outro: readonly string[];
}

const m = (d: MissionDef): MissionDef => d;

export const MISSIONS: Readonly<Record<MissionId, MissionDef>> = {
  inheritance: m({
    id: 'inheritance', act: 1, title: 'Inheritance', giver: 'sy', blurb: 'A failing bait shop, a greenhouse, and a notebook full of secrets.',
    unlock: {}, briefing: [], checkpoints: [], setPiece: 'firstSunsetDrive',
    objectives: [
      { kind: 'harvest', text: 'Harvest the ripe Abuela’s Blush', qty: 1 },
      { kind: 'deliver', text: 'Meet Kiki at the Boardwalk', customer: 'kiki', qty: 2 },
      { kind: 'deliver', text: 'Meet Marisol at Palmetto Plaza', customer: 'marisol', qty: 3 },
    ],
    rewards: { cash: 0, currency: 'dirty', xp: 0 }, outro: [],
  }),
  paella: m({
    id: 'paella', act: 1, title: 'Paella with the Don', giver: 'vale', window: [8, 11],
    blurb: 'Don Vale wants to talk about the debt. Over breakfast. At his place.',
    unlock: { after: ['inheritance'] },
    briefing: ['Nine o’clock, Casa Vale, Cobalt Harbor. Come hungry. Come alone. Mostly the first one. — I.V.'],
    objectives: [
      { kind: 'goto', text: 'Get to Casa Vale between 8 and 11 AM', place: 'casaVale' },
      { kind: 'talk', text: 'Have breakfast with Don Vale', contact: 'vale', place: 'casaVale' },
      { kind: 'setpiece', text: 'Lose the tail through the container yard', id: 'containerTail', place: 'containerYard' },
    ],
    checkpoints: [1, 2], setPiece: 'containerTail',
    rewards: { cash: 500, currency: 'dirty', xp: 160, customer: 'fern', respect: 5 },
    outro: ['You lost my nephew in the containers. He is embarrassed. I am impressed. We have an arrangement. — I.V.'],
  }),
  greenThumb: m({
    id: 'greenThumb', act: 1, title: 'Green Thumb for Hire', giver: 'pilar',
    blurb: 'A botanist with a van full of orchids needs a ride and a job.',
    unlock: { rank: 3, after: ['paella'] },
    briefing: [
      'Hi! You don’t know me. I’m Pilar. Your grandmother judged my orchids in 2019 and gave me a 9. I want a job.',
      'Also my van died at the boat ramp with forty orchids in it. Two problems, one solution: you.',
    ],
    objectives: [
      { kind: 'goto', text: 'Pick up Pilar at the Mudbank Boat Ramp', place: 'boatRamp' },
      { kind: 'setpiece', text: 'Drive the orchids home without bruising them', id: 'orchidRun', place: null },
      { kind: 'goto', text: 'Bring Pilar to Ofelia’s', place: 'ofelias' },
    ],
    checkpoints: [1], setPiece: 'orchidRun',
    rewards: { cash: 300, currency: 'dirty', xp: 220, crew: 'pilar' },
    outro: ['Every orchid survived. I named them after you. All forty. You’ll get used to it. — Pilar'],
  }),
  skateNight: m({
    id: 'skateNight', act: 1, title: 'Skate Night', giver: 'kiki', window: [19, 2],
    blurb: 'Kiki is throwing the party of the season and you are the guest of honor. And the supplier.',
    unlock: { rank: 3, after: ['greenThumb'] },
    briefing: ['SKATE NIGHT AT MY PLACE 🛼🛼🛼 the whole crew is coming. bring enough for everyone. like 6. maybe 8. love u'],
    objectives: [
      { kind: 'deliver', text: 'Bring 6 units to Kiki’s party', customer: 'kiki', qty: 6 },
      { kind: 'setpiece', text: 'Get out when the neighbors call the cops', id: 'skateNightExit', place: 'skatePark' },
      { kind: 'escape', text: 'Lose the heat', heat: 2 },
    ],
    checkpoints: [1], setPiece: 'skateNightExit',
    rewards: { cash: 1200, currency: 'dirty', xp: 280, hype: 6 },
    outro: ['best. party. ever. the cops were part of the party too (sort of). ur legendary now 🛼'],
  }),
  mudSeason: m({
    id: 'mudSeason', act: 2, title: 'Mud Season', giver: 'pilar',
    blurb: 'The Mudflaps are hitting supply runs in the Sawgrass. Annie needs help, and so do your seeds.',
    unlock: { rank: 4, after: ['greenThumb'] },
    briefing: [
      'Airboat Annie called. The Mudflaps took her Firefly Sugar shipment and half her dock. She says “bring someone who can drive.” That’s you.',
    ],
    objectives: [
      { kind: 'goto', text: 'Meet Annie at her landing', place: 'airboatAnnies' },
      { kind: 'setpiece', text: 'Chase the Mudflaps through the mangroves', id: 'mangroveAirboatChase', place: 'gatorHole' },
      { kind: 'goto', text: 'Bring the shipment back to Annie', place: 'airboatAnnies' },
    ],
    checkpoints: [1], setPiece: 'mangroveAirboatChase',
    rewards: { cash: 1500, currency: 'dirty', xp: 320, customer: 'annie', rival: { id: 'mudflaps', pressure: -20, standing: -15 } },
    outro: ['Larry the gator watched the whole chase. He was rooting for you. Larry roots for nobody. — Annie'],
  }),
  ringLight: m({
    id: 'ringLight', act: 2, title: 'Ring Light', giver: 'zen', window: [12, 18],
    blurb: 'Zenith Wellness opens a pop-up on the boardwalk during the Flamingo Parade. With your recipes.',
    unlock: { rank: 5, after: ['skateNight'] },
    briefing: [
      'Hey friend. Huge fan. We’re launching “Florida Calm” at the parade this afternoon. Inspired by local artisans. You know. Namaste. — Zen',
    ],
    objectives: [
      { kind: 'goto', text: 'Find the Zenith pop-up on the boardwalk', place: 'boardwalk' },
      { kind: 'setpiece', text: 'Sabotage the pop-up during the parade', id: 'paradeSabotage', place: 'boardwalk' },
      { kind: 'escape', text: 'Slip away through the parade', heat: 2 },
    ],
    checkpoints: [1], setPiece: 'paradeSabotage',
    rewards: { cash: 2000, currency: 'dirty', xp: 380, hype: 10, rival: { id: 'zenith', pressure: -25, standing: -20 } },
    outro: ['Our ring lights failed during the livestream. Four million people saw me cry. Interesting choice. — Zen'],
  }),
  cleanHands: m({
    id: 'cleanHands', act: 2, title: 'Clean Hands', giver: 'sy',
    blurb: 'Sy has a car wash for sale and a theory about money. Both are a little dirty.',
    unlock: { rank: 5, after: ['paella'] },
    briefing: [
      'Let’s talk money hygiene! The Sudsy Flamingo is for sale. Buy it, run your cash through it, sleep like a baby. Busted? Don’t panic. Broke? Also don’t panic. — Sy',
    ],
    objectives: [
      { kind: 'buyFront', text: 'Buy the Sudsy Flamingo Car Wash', front: 'sudsyFlamingo' },
      { kind: 'talk', text: 'Sign the papers at Pinkerton Law', contact: 'sy', place: 'pinkertonLaw' },
      { kind: 'setpiece', text: 'Shake the detective tailing you through the drive-in', id: 'driveInGetaway', place: 'starlite' },
    ],
    checkpoints: [1, 2], setPiece: 'driveInGetaway',
    rewards: { cash: 1000, currency: 'clean', xp: 340, notoriety: -10 },
    outro: ['Congratulations, you are a small-business owner! Taxes are due in April. Kidding. Mostly. — Sy'],
  }),
  drawbridge: m({
    id: 'drawbridge', act: 2, title: 'The Drawbridge', giver: 'dex',
    blurb: 'A garage genius wants to see how you drive before he works for you.',
    unlock: { rank: 5, after: ['cleanHands'] },
    briefing: ['Heard you drive like you stole it. Prove it. Wrench & Wax, tonight. Bring the truck, I’ll bring the attitude. — Dex'],
    objectives: [
      { kind: 'goto', text: 'Meet Dex at Wrench & Wax', place: 'dexGarage' },
      { kind: 'setpiece', text: 'Race Dex to the inlet bridge, and make the jump', id: 'drawbridgeJump', place: 'causeway' },
    ],
    checkpoints: [1], setPiece: 'drawbridgeJump',
    rewards: { cash: 1500, currency: 'dirty', xp: 420, crew: 'dex', unlock: 'feature:chauffeur' },
    outro: ['You cleared the bridge with a foot to spare. I cleared it with two. Close enough. I’m in. — Dex'],
  }),
  containerNight: m({
    id: 'containerNight', act: 2, title: 'Container Night', giver: 'vale', window: [22, 4],
    blurb: 'Vale has a favor. A ship, a container, and a harbor full of people who should not see you.',
    unlock: { rank: 6, after: ['paella', 'mudSeason'] },
    briefing: ['A small favor, between friends. Container 7-B, the Esperanza, tonight. Something of mine is inside. Something of yours could be too. — I.V.'],
    objectives: [
      { kind: 'goto', text: 'Get into the container yard after 10 PM', place: 'containerYard' },
      { kind: 'setpiece', text: 'Find container 7-B and get out unseen', id: 'containerShipNight', place: 'containerYard' },
      { kind: 'talk', text: 'Bring the cargo to Casa Vale', contact: 'vale', place: 'casaVale' },
    ],
    checkpoints: [1, 2], setPiece: 'containerShipNight',
    rewards: { cash: 5000, currency: 'dirty', xp: 520, unlock: 'feature:wholesale', respect: 15, rival: { id: 'vale', pressure: -10, standing: 20 } },
    outro: ['You returned what was mine and kept nothing. Rare. The docks are open to you now. Bulk prices. Family prices. — I.V.'],
  }),
  helipad: m({
    id: 'helipad', act: 3, title: 'Helipad Handoff', giver: 'gordon',
    blurb: 'A buyer wants twenty Halos delivered to the roof of Crown Tower. By helicopter. On a Thursday.',
    unlock: { rank: 7, after: ['containerNight'] },
    briefing: ['The helipad is unlocked on Thursdays. A gentleman with a helicopter would like twenty of your best. I saw nothing. — Gordon'],
    objectives: [
      { kind: 'deliver', text: 'Bring 20 Halos to the Crown Tower roof', customer: null, qty: 20, tier: 'halos' },
      { kind: 'setpiece', text: 'Make the handoff before the searchlight finds you', id: 'helipadHandoff', place: 'crownTower' },
      { kind: 'escape', text: 'Get off the tower and lose the heat', heat: 3 },
    ],
    checkpoints: [1, 2], setPiece: 'helipadHandoff',
    rewards: { cash: 9000, currency: 'dirty', xp: 650, hype: 8, notoriety: 6 },
    outro: ['The helicopter left a very large tip and one very confused pigeon. — Gordon'],
  }),
  podcast: m({
    id: 'podcast', act: 3, title: 'Podcast', giver: 'reyes',
    blurb: 'Det. Imani Reyes wants an interview. Off the record. On her podcast.',
    unlock: { rank: 7, after: ['ringLight'] },
    briefing: ['Season three of my podcast is about a mysterious florist. Chrome Pelican, booth six, tomorrow. You can talk to me or about me. — Det. Reyes'],
    objectives: [
      { kind: 'talk', text: 'Meet Det. Reyes in booth six', contact: 'reyes', place: 'chromePelican' },
      { kind: 'choice', text: 'Give her a story', options: [
        { id: 'vale', label: 'Feed her Vale’s shipments', line: 'Reyes starts digging into the docks. Vale will not be pleased.' },
        { id: 'mudflaps', label: 'Feed her the Mudflaps', line: 'The swamp gets a lot of police attention. The Duchess is furious.' },
        { id: 'zenith', label: 'Feed her Zenith Wellness', line: 'A three-part episode on Zenith’s “supply chain.” Montrose stops smiling.' },
        { id: 'nobody', label: 'Give her nothing', line: 'Reyes respects it, sort of. She keeps watching you instead.' },
      ] },
    ],
    checkpoints: [0], setPiece: 'podcastBooth',
    rewards: { cash: 0, currency: 'dirty', xp: 450 },
    outro: ['Episode drops Friday. You are “Source F.” F for florist. Or for something else. — Det. Reyes'],
  }),
  paidInFull: m({
    id: 'paidInFull', act: 3, title: 'Paid in Full', giver: 'vale',
    blurb: 'The debt comes due. Settle it with Vale: pay, partner, or defy.',
    unlock: { rank: 8, after: ['containerNight'] },
    briefing: ['It is time we settled your grandmother’s account, one way or another. Come to dinner. — I.V.'],
    objectives: [
      { kind: 'talk', text: 'Dinner with Don Vale at Casa Vale', contact: 'vale', place: 'casaVale' },
      { kind: 'choice', text: 'Settle the debt', options: [
        { id: 'pay', label: 'Pay what is left', line: 'You pay the rest. Vale toasts your grandmother.' },
        { id: 'partner', label: 'Offer a partnership', line: 'Vale takes a share of the harbor trade instead of the money. Needs his respect.' },
        { id: 'defy', label: 'Refuse to pay', line: 'Vale smiles. His men do not. You leave through the kitchen, fast.' },
      ] },
    ],
    checkpoints: [0], setPiece: 'valeShowdown',
    rewards: { cash: 0, currency: 'dirty', xp: 800 },
    outro: ['Whatever happens next, we did this properly. Ofelia would want that. — I.V.'],
  }),
  hurricaneNight: m({
    id: 'hurricaneNight', act: 3, title: 'Hurricane Night', giver: 'pilar',
    blurb: 'A hurricane hits Halcyon Bay. Move the empire somewhere high and dry while Zen Montrose makes his move.',
    unlock: { rank: 9, after: ['paidInFull'], beat: 'hurricaneWatch' },
    briefing: [
      'It’s here. Bridges are flooding, the power is out in the Flats, and Zenith trucks are circling our places. We need to move everything to the penthouse. Tonight.',
    ],
    objectives: [
      { kind: 'goto', text: 'Get to Ofelia’s before the water does', place: 'ofelias' },
      { kind: 'setpiece', text: 'Run the stash across town before the bridges close', id: 'hurricaneRun', place: null },
      { kind: 'setpiece', text: 'Stop Zenith’s convoy on the Causeway', id: 'causewayStandoff', place: 'causeway' },
      { kind: 'goto', text: 'Reach the Dorada Penthouse', place: 'penthouse' },
    ],
    checkpoints: [1, 2, 3], setPiece: 'hurricaneRun',
    rewards: { cash: 15000, currency: 'clean', xp: 1500, hype: 15, rival: { id: 'zenith', pressure: -60, standing: -30 } },
    outro: ['We made it. Every plant, every page of the notebook, and Gerald the monstera. The sun is coming up. — Pilar'],
  }),
  morningAfter: m({
    id: 'morningAfter', act: 3, title: 'The Morning After', giver: 'sy',
    blurb: 'The storm has passed. The coast is yours. What kind of owner will you be?',
    unlock: { after: ['hurricaneNight'] },
    briefing: ['Big decision, champ. Go legit and I can make it all very boring and very legal. Or don’t, and keep me very busy. — Sy'],
    objectives: [
      { kind: 'goto', text: 'Watch the sunrise from Ofelia’s greenhouse', place: 'ofelias' },
      { kind: 'choice', text: 'Choose what comes next', options: [
        { id: 'legit', label: 'Go legit', line: 'Ofelia’s becomes a garden-center brand with the best plants in Florida. Same vibes. Now with receipts.' },
        { id: 'crown', label: 'Take the crown', line: 'You stay in the shadows and run the coast. Higher stakes, higher everything.' },
      ] },
    ],
    checkpoints: [0], setPiece: 'sunriseGreenhouse',
    rewards: { cash: 0, currency: 'clean', xp: 1000 },
    outro: ['Water twice, worry never. — O.'],
  }),
};
