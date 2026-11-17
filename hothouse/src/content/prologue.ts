import { HINTS } from './notes';
import type { PlaceId } from './places';

/**
 * The first ten minutes (brief §3, mission "Inheritance"). Each step shows one HUD objective and
 * completes on a story beat. Timings in comments are the target for a player following along.
 * Until the brand is named the world keeps the clock pinned at 6:40 PM; naming it lets dusk fall.
 */

export type PrologueBeat =
  | 'firstHarvest' | 'kikiAccepted' | 'kikiDelivered' | 'gardenStore' | 'firstPlant' | 'firstTend' | 'firstMix'
  | 'brandNamed' | 'secondAccepted' | 'secondDelivered' | 'dripBought' | 'valeText';

export interface PrologueStepDef {
  /** Beat that completes the step. */
  readonly beat: PrologueBeat;
  readonly objective: string;
  readonly place: PlaceId | null;
  readonly hint: string | null;
  readonly icon: string;
  /** Clock stays at golden hour while this step is current. */
  readonly pinned: boolean;
  /** For steps that can time out (seconds after the step starts), auto-complete. */
  readonly timeout?: number;
}

export const PROLOGUE: readonly PrologueStepDef[] = [
  // 0:45 — the greenhouse, one ripe plant
  { beat: 'firstHarvest', objective: 'Harvest the ripe Abuela’s Blush', place: 'ofelias', hint: HINTS.harvest!, icon: 'scissors', pinned: true },
  // 1:30 — Kiki texts
  { beat: 'kikiAccepted', objective: 'Answer Kiki’s text', place: null, hint: null, icon: 'chat', pinned: true },
  // 2:00–3:00 — drive the Gator to the boardwalk, first handoff and haggle
  { beat: 'kikiDelivered', objective: 'Meet Kiki at the Boardwalk', place: 'boardwalk', hint: HINTS.haggle!, icon: 'skate', pinned: true },
  // 4:30 — garden store
  { beat: 'gardenStore', objective: 'Buy seeds and honey at Sod Almighty', place: 'sodAlmighty', hint: null, icon: 'seed', pinned: true },
  // 6:00 — back home
  { beat: 'firstPlant', objective: 'Plant your new seeds at Ofelia’s', place: 'ofelias', hint: HINTS.plant!, icon: 'seed', pinned: true },
  { beat: 'firstTend', objective: 'Tend the greenhouse', place: 'ofelias', hint: HINTS.tend!, icon: 'water', pinned: true },
  { beat: 'firstMix', objective: 'Mix something new at the workbench', place: 'ofelias', hint: HINTS.mix!, icon: 'bowl', pinned: true },
  // 7:00 — brand
  { beat: 'brandNamed', objective: 'Name your brand', place: null, hint: null, icon: 'tag', pinned: true },
  // 8:00 — dusk falls, second customer
  { beat: 'secondAccepted', objective: 'Answer Marisol’s text', place: null, hint: null, icon: 'chat', pinned: false },
  { beat: 'secondDelivered', objective: 'Meet Marisol at Palmetto Plaza', place: 'palmettoPlaza', hint: null, icon: 'chat', pinned: false },
  // 10:00 — Rank 2, first real upgrade, then Vale
  { beat: 'dripBought', objective: 'Buy Drip Irrigation in Empire → Upgrades', place: null, hint: HINTS.drip!, icon: 'drip', pinned: false, timeout: 45 },
  { beat: 'valeText', objective: 'Check your phone', place: null, hint: null, icon: 'chat', pinned: false },
];

/** Seconds after a step starts before its scripted text arrives. */
export const PROLOGUE_DELAYS = {
  kikiText: 8,
  marisolText: 12,
  valeText: 6,
  syWelcome: 3,
} as const;

/** Scripted texts. Kiki's and Marisol's are requests; the others are story messages. */
export const PROLOGUE_TEXTS = {
  syWelcome:
    'Welcome to Halcyon Bay! Estate paperwork is done. Keys are under the flamingo. There is one small complication, we will talk. Busted? Don’t panic. — Sy Pinkerton, Esq.',
  kiki:
    'heyyy is this still Ofelia’s?? she always hooked me up for skate night 🛼 got anything sunny? party at the boardwalk rink tonight!! 2 is perfect',
  kikiThanks: 'ur a lifesaver. ofelia would be SO proud. ok also ur cute. ok bye 🛼',
  marisol:
    'Hi. Marisol, from down the street. Ofelia used to leave something mellow in my mailbox after night shifts. I am begging. Palmetto Plaza parking lot, 3 please.',
  marisolThanks: 'Okay. You have your grandmother’s hands. Going home to be horizontal.',
  vale: 'We should talk about your grandmother’s debt. Cobalt Harbor, nine in the morning. Come hungry. — I. Vale',
} as const;
