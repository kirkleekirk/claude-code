import type { StoryContactId } from './ids';

/** Story characters who text the player. Every one is an adult with their own voice. */
export interface ContactDef {
  readonly id: StoryContactId;
  readonly name: string;
  readonly short: string;
  readonly role: string;
  readonly blurb: string;
  readonly appearance: string;
  readonly voice: { readonly pitch: number; readonly brightness: number; readonly expressiveness: number };
}

const c = (d: ContactDef): ContactDef => d;

export const CONTACTS: Readonly<Record<StoryContactId, ContactDef>> = {
  vale: c({ id: 'vale', name: 'Don Ignacio Vale', short: 'Don Vale', role: 'Restaurateur. Creditor.', appearance: 'ignacio-vale',
    blurb: 'Silver hair, linen suits, paella that makes grown men cry. Holds your grandmother’s debt and your attention.',
    voice: { pitch: 96, brightness: 0.3, expressiveness: 0.45 } }),
  pilar: c({ id: 'pilar', name: 'Pilar Quintero', short: 'Pilar', role: 'Botanist prodigy', appearance: 'pilar-quintero',
    blurb: 'Twenty-four, two degrees, one van full of seedlings. Names every plant. Has opinions about all of them.',
    voice: { pitch: 238, brightness: 0.8, expressiveness: 0.9 } }),
  tank: c({ id: 'tank', name: 'Teodoro “Tank” Banks', short: 'Tank', role: 'Gentle giant, guard, baker', appearance: 'tank-banks',
    blurb: 'Six-foot-six, soft-spoken, makes a guava cheesecake that has ended at least one feud.',
    voice: { pitch: 90, brightness: 0.25, expressiveness: 0.35 } }),
  dex: c({ id: 'dex', name: 'Dex Moreno', short: 'Dex', role: 'Garage genius', appearance: 'dex-moreno',
    blurb: 'Treats cars like therapy and therapy like a car. Can hear a bad spark plug from across the Causeway.',
    voice: { pitch: 150, brightness: 0.65, expressiveness: 0.7 } }),
  sy: c({ id: 'sy', name: 'Sy Pinkerton', short: 'Sy', role: 'Attorney at law (and on billboards)', appearance: 'sy-pinkerton',
    blurb: 'Pink suit, white teeth, face on every bus bench. “Busted? Don’t Panic.” He means it.',
    voice: { pitch: 160, brightness: 0.85, expressiveness: 0.95 } }),
  reyes: c({ id: 'reyes', name: 'Det. Imani Reyes', short: 'Det. Reyes', role: 'Detective, podcaster', appearance: 'imani-reyes',
    blurb: 'Relentless, funny, and three seasons into a true-crime podcast about a florist she cannot quite catch.',
    voice: { pitch: 206, brightness: 0.5, expressiveness: 0.5 } }),
  zen: c({ id: 'zen', name: 'Chase “Zen” Montrose', short: 'Zen', role: 'Founder, Zenith Wellness', appearance: 'chase-montrose',
    blurb: 'Ring-light halo, cold-plunge smile, a wellness empire that undercuts everyone and thanks them for it.',
    voice: { pitch: 138, brightness: 0.7, expressiveness: 0.55 } }),
  duchess: c({ id: 'duchess', name: 'Delphine “Duchess” Arceneaux', short: 'Duchess', role: 'Boss of the Mudflaps', appearance: 'delphine-arceneaux',
    blurb: 'Runs the airboat bikers of the Sawgrass from a throne made of crab traps. Polite. Terrifying.',
    voice: { pitch: 176, brightness: 0.4, expressiveness: 0.6 } }),
  yoli: c({ id: 'yoli', name: 'Mama Yoli', short: 'Mama Yoli', role: 'Bodega owner', appearance: 'mama-yoli',
    blurb: 'Knew your grandmother for forty years. Sells additives, advice, and guilt, in that order.',
    voice: { pitch: 192, brightness: 0.55, expressiveness: 0.85 } }),
  wade: c({ id: 'wade', name: 'Wade Pruitt', short: 'Wade', role: 'Clerk, Sod Almighty', appearance: 'wade-pruitt',
    blurb: 'Garden-store clerk with a laminated card of soil facts and a deep, private love of bees.',
    voice: { pitch: 118, brightness: 0.45, expressiveness: 0.4 } }),
  tipster: c({ id: 'tipster', name: 'Unknown Number', short: 'Unknown', role: 'Somebody who knows things', appearance: 'tipster',
    blurb: 'Texts arrive from a number that changes every time. The information never does.',
    voice: { pitch: 140, brightness: 0.2, expressiveness: 0.2 } }),
  herald: c({ id: 'herald', name: 'Halcyon Herald', short: 'Herald', role: 'News alerts', appearance: 'herald',
    blurb: 'The city paper. Push notifications only, because nobody reads the paper.',
    voice: { pitch: 150, brightness: 0.5, expressiveness: 0.3 } }),
};
