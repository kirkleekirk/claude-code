import type { EffectFamily } from './effects';

/**
 * Ofelia's margin notes: the mentor voice of the game. Fierce, funny, wise, a little bossy.
 * Used on Notebook pages and as contextual hints.
 */

/** Notes for a new product page, by the family of its strongest effect. */
export const DISCOVERY_NOTES: Readonly<Record<EffectFamily | 'dud' | 'mixed', readonly string[]>> = {
  social: [
    'Loud ones sell themselves. Make sure they sell for enough.',
    'This one talks before it thinks. Like your Tío Rafa.',
    'Bring it to a party and leave before the karaoke.',
    'Good for people who say “one more song” and mean four.',
  ],
  body: [
    'Feels like a porch at four o’clock. Do not rush it.',
    'Warm all the way through. Like my flan, which you never visit for.',
    'For tired feet and long Tuesdays.',
    'The body knows. Let it.',
  ],
  mind: [
    'Sharp as my sewing scissors. Do not let your cousins borrow it.',
    'This one thinks in straight lines. Some people need that.',
    'For the night owls and the list makers.',
    'Smart little thing. Smarter than the man at the bank.',
  ],
  weird: [
    'I do not know what this one is. I know people will pay to find out.',
    'Strange is a flavor. Never let anyone tell you otherwise.',
    'The swamp taught me this. Do not ask what else it taught me.',
    'Keep it away from the TV. It makes the weatherman talk to you.',
  ],
  dud: [
    'Ay. No. Throw salt at it. Briny things fix this.',
    'Even I made this mistake. Once. Fine, twice.',
    'Smells like the bait cooler in August. Sell it cheap or fix it.',
  ],
  mixed: [
    'A little of everything. Like my kitchen drawer.',
    'Balanced. My mother would approve, and she approved of nothing.',
    'Write down how you made this. You will forget. I always did.',
  ],
};

export const APEX_NOTES: readonly string[] = [
  'THIS. This is what I was chasing for thirty years. You found it in an afternoon. I am so proud and so annoyed.',
  'Two of a kind, folded into one. That is the secret, mija. The plants want to agree.',
  'Frame this page. No, really. Frame it.',
  'I cried the first time I made one of these. Then I charged triple.',
];

export const HARMONY_NOTES: readonly string[] = [
  'A harmony! Three voices singing together. Customers can hear it even if they cannot name it.',
  'Some things belong together. Rice and beans. Me and a sun hat. These three.',
  'Sticker earned. I bought these stickers in 1991 and waited for this moment.',
];

export const TIER_NOTES: Readonly<Record<'dew' | 'halos', string>> = {
  dew: 'Cold and clear, like the morning after a storm. Three become one and the one is worth more.',
  halos: 'Pressed and stamped with your name. Now it is not just good, it is yours.',
};

export const STRAIN_NOTE_BRED = 'You made a new plant. Name it something your grandmother can say out loud.';

/** Contextual hints, keyed by feature. Shown once, in Ofelia's handwriting. */
export const HINTS: Readonly<Record<string, string>> = {
  harvest: 'Snip where the stem kinks. She will tell you when, mija. Listen.',
  tend: 'Hold and walk the row. Water, feed, pinch. Like braiding hair: steady, not fast.',
  plant: 'One seed per pot. Pick a feed: speed, yield or quality. You cannot have all three. Nobody can.',
  mix: 'Drop something in, shake it, see what happens. The Notebook remembers what you learn.',
  unknown: 'A question mark means you have not tried it. Try it. That is how I learned everything.',
  fusion: 'When two of the same family collide, they fuse into something better. Chase that.',
  haggle: 'Watch their face. Push until the smile gets thin, then stop.',
  heat: 'If the police get curious, be boring. Boring people go home.',
  bag: 'What you carry, you can lose. Pack what you will sell today.',
  drip: 'Drip irrigation. Buy it. I wasted a decade with a watering can.',
  crew: 'Hire people you would feed. Then feed them.',
  dealers: 'A dealer on a corner is a garden that walks.',
  fronts: 'Dirty money spends, but clean money sleeps well.',
  raid: 'When the tip comes, move the good stuff first. Plants grow back. Records do not.',
  build: 'Put the things that work together close together. Feet are lazy. So are crew.',
  samples: 'Give a little away. The ones who come back are worth it.',
  debt: 'Pay Ignacio on time and he is a gentleman. Pay early and he is a friend.',
  dew: 'Patience makes Dew. Three become one. Do not be greedy with the still.',
  breeding: 'Two good parents do not guarantee a good child. Ask your uncles.',
};

/** Lines for the Next Best Action card when there is nothing urgent. */
export const IDLE_NOTES: readonly string[] = [
  'Nothing burning? Go drive along the water at sunset. That is also work.',
  'Check the Notebook. There is always a question mark you have not answered.',
  'Hand out a sample. Somebody out there is your new favorite customer.',
];
