import type { CrewRole, StationKind } from './ids';

/** Crew roles and the people who fill them. Every crew member is an adult with a quirk. */

export interface RoleDef {
  readonly id: CrewRole;
  readonly name: string;
  readonly line: string;
  readonly icon: string;
  /** Station they work at, if any. */
  readonly station: StationKind | null;
  /** Unlock id needed before the role can be hired. */
  readonly unlock: string;
  /** Typical daily wage at skill 3. */
  readonly wage: number;
  /** Works a turf instead of a property. */
  readonly turf: boolean;
}

export const ROLES: Readonly<Record<CrewRole, RoleDef>> = {
  grower: { id: 'grower', name: 'Grower', line: 'Tends, harvests and replants at a property.', icon: 'leaf', station: 'feed', unlock: 'feature:crew', wage: 120, turf: false },
  cook: { id: 'cook', name: 'Cook', line: 'Runs the stations: mixes saved recipes, condenses Dew, presses Halos.', icon: 'bowl', station: 'workbench', unlock: 'feature:crew', wage: 140, turf: false },
  packer: { id: 'packer', name: 'Packer', line: 'Bags product in your branding and keeps dealers stocked.', icon: 'box', station: 'packing', unlock: 'feature:dealers', wage: 110, turf: false },
  dealer: { id: 'dealer', name: 'Dealer', line: 'Works a turf: serves regulars, builds influence, banks cash.', icon: 'handshake', station: null, unlock: 'feature:dealers', wage: 150, turf: true },
  driver: { id: 'driver', name: 'Driver', line: 'Delivers orders across town and restocks dealers.', icon: 'car', station: null, unlock: 'feature:chauffeur', wage: 130, turf: false },
  guard: { id: 'guard', name: 'Guard', line: 'Raises security. Raids and rivals think twice.', icon: 'shield', station: 'guard', unlock: 'feature:guards', wage: 170, turf: false },
  accountant: { id: 'accountant', name: 'Accountant', line: 'Fronts launder more with fewer audits.', icon: 'calculator', station: 'desk', unlock: 'feature:fronts', wage: 160, turf: false },
  lookout: { id: 'lookout', name: 'Lookout', line: 'Spots trouble early. Less notoriety, earlier raid tips.', icon: 'binoculars', station: 'lookout', unlock: 'feature:dealers', wage: 100, turf: false },
};

export interface CrewDef {
  readonly id: string;
  readonly name: string;
  readonly short: string;
  readonly age: number;
  readonly role: CrewRole;
  /** 1–5. */
  readonly skill: number;
  /** Dollars per in-game day. */
  readonly wage: number;
  readonly quirk: string;
  readonly pros: readonly string[];
  readonly cons: readonly string[];
  readonly appearance: string;
  /** Rank at which they show up in the hiring pool; named crew join through missions instead. */
  readonly rank: number;
  readonly named?: boolean;
}

const c = (d: CrewDef): CrewDef => d;

export const CREW: readonly CrewDef[] = [
  // named crew (join through story)
  c({ id: 'pilar', name: 'Pilar Quintero', short: 'Pilar', age: 24, role: 'grower', skill: 4, wage: 140, rank: 3, named: true, appearance: 'pilar-quintero',
    quirk: 'Names every plant. Gets upset if you get the names wrong.', pros: ['Best grower in the county', 'Perfect-timing harvests'], cons: ['Will lecture you about soil pH'] }),
  c({ id: 'dex', name: 'Dex Moreno', short: 'Dex', age: 33, role: 'driver', skill: 5, wage: 170, rank: 5, named: true, appearance: 'dex-moreno',
    quirk: 'Talks to cars in a soothing voice. They seem to listen.', pros: ['Fastest deliveries in Halcyon Bay', 'Never gets pulled over'], cons: ['Takes the scenic route on principle'] }),
  c({ id: 'tank', name: 'Teodoro “Tank” Banks', short: 'Tank', age: 38, role: 'guard', skill: 5, wage: 190, rank: 6, named: true, appearance: 'tank-banks',
    quirk: 'Bakes a guava cheesecake before every shift. Every shift.', pros: ['Raiders take one look and leave', 'Morale goes up when he bakes'], cons: ['Needs a kitchen, technically'] }),
  // growers
  c({ id: 'moss', name: 'Moss Holloway', short: 'Moss', age: 52, role: 'grower', skill: 3, wage: 115, rank: 3, appearance: 'moss-holloway',
    quirk: 'Whispers encouragement to seedlings. Swears it works.', pros: ['Gentle with fussy strains'], cons: ['Slow on harvest day'] }),
  c({ id: 'bea', name: 'Bea Castellanos', short: 'Bea', age: 68, role: 'grower', skill: 4, wage: 135, rank: 4, appearance: 'bea-castellanos',
    quirk: 'Retired orchid-show judge. Rates every plant out of ten, out loud.', pros: ['Quality-focused'], cons: ['Refuses to work Sundays'] }),
  c({ id: 'toby', name: 'Toby Nakamura', short: 'Toby', age: 27, role: 'grower', skill: 2, wage: 85, rank: 3, appearance: 'toby-nakamura',
    quirk: 'Has a podcast about houseplants with eleven listeners.', pros: ['Cheap', 'Eager'], cons: ['Forgets to prune'] }),
  // cooks
  c({ id: 'rocco', name: 'Rocco Bellini', short: 'Chef Rocco', age: 45, role: 'cook', skill: 4, wage: 160, rank: 3, appearance: 'rocco-bellini',
    quirk: 'Ex-cruise-ship chef. Calls the workbench “the galley.”', pros: ['Fast at the bench', 'Never wastes an additive'], cons: ['Sings opera while working'] }),
  c({ id: 'lulu', name: 'Lulu Park', short: 'Lulu', age: 31, role: 'cook', skill: 3, wage: 125, rank: 3, appearance: 'lulu-park',
    quirk: 'Former bartender. Shakes everything, including things that do not need shaking.', pros: ['Steady and reliable'], cons: ['Rearranges your additives by color'] }),
  c({ id: 'priyanka', name: 'Priyanka Das', short: 'Priyanka', age: 36, role: 'cook', skill: 5, wage: 210, rank: 6, appearance: 'priyanka-das',
    quirk: 'Pastry chef with a stopwatch and no patience for guesswork.', pros: ['Fastest cook available', 'Great with Dew and Halos'], cons: ['Expensive'] }),
  // packers
  c({ id: 'benito', name: 'Tío Benito', short: 'Tío Benny', age: 71, role: 'packer', skill: 3, wage: 95, rank: 4, appearance: 'tio-benito',
    quirk: 'Gift-wrapped for a department store for forty years. Ribbons everything.', pros: ['Beautiful packaging'], cons: ['Tells the same story about 1977'] }),
  c({ id: 'gwen', name: 'Gwen Albright', short: 'Gwen', age: 29, role: 'packer', skill: 4, wage: 120, rank: 4, appearance: 'gwen-albright',
    quirk: 'Runs a sticker shop online. Your logo is now on her laptop.', pros: ['Fast', 'Boosts brand hype'], cons: ['Will redesign your logo unasked'] }),
  // dealers
  c({ id: 'tony', name: '“Smooth” Tony Okafor', short: 'Smooth Tony', age: 34, role: 'dealer', skill: 3, wage: 140, rank: 4, appearance: 'tony-okafor',
    quirk: 'Has never once been in a hurry. Customers find it calming.', pros: ['Regulars love him'], cons: ['Slow on busy nights'] }),
  c({ id: 'roz', name: 'Rosalind “Roz” Kim', short: 'Roz', age: 40, role: 'dealer', skill: 4, wage: 175, rank: 4, appearance: 'roz-kim',
    quirk: 'Former real-estate agent. Calls every corner “a great location.”', pros: ['Strong sales', 'Builds influence fast'], cons: ['Expects a commission bonus'] }),
  c({ id: 'jerome', name: 'Jet-Ski Jerome', short: 'Jerome', age: 26, role: 'dealer', skill: 2, wage: 95, rank: 4, appearance: 'jet-ski-jerome',
    quirk: 'Arrives everywhere by jet ski, including places without water.', pros: ['Cheap', 'Great on the Strand'], cons: ['Attracts attention'] }),
  c({ id: 'coco-r', name: 'Coco Ramírez', short: 'Coco R.', age: 37, role: 'dealer', skill: 5, wage: 230, rank: 6, appearance: 'coco-ramirez',
    quirk: 'Knows everyone on Isla Dorada by their yacht.', pros: ['Best dealer for wealthy turfs'], cons: ['Will not work the Sawgrass'] }),
  // drivers
  c({ id: 'flip', name: 'Flip Navarro', short: 'Flip', age: 50, role: 'driver', skill: 4, wage: 140, rank: 5, appearance: 'flip-navarro',
    quirk: 'Retired stunt driver. Parks by sliding sideways. Always.', pros: ['Fast deliveries'], cons: ['Tires do not last'] }),
  c({ id: 'inez', name: 'Inez Duarte', short: 'Inez', age: 59, role: 'driver', skill: 3, wage: 110, rank: 5, appearance: 'inez-duarte',
    quirk: 'Drove the airport shuttle for twenty years. Has opinions about merging.', pros: ['Never gets noticed'], cons: ['Will not exceed the speed limit'] }),
  // guards
  c({ id: 'kev', name: 'Big Kev Moana', short: 'Big Kev', age: 42, role: 'guard', skill: 4, wage: 165, rank: 7, appearance: 'kev-moana',
    quirk: 'Ex-bouncer. Checks everyone’s ID, including the mail carrier.', pros: ['Raids go badly for raiders'], cons: ['Scares the regulars a bit'] }),
  c({ id: 'ox', name: 'Octavia “Ox” Reyes-Lind', short: 'Ox', age: 35, role: 'guard', skill: 3, wage: 140, rank: 7, appearance: 'octavia-reyes-lind',
    quirk: 'Former roller-derby captain. Knows how to take a hit and hand one back.', pros: ['Steady', 'Good with rival trouble'], cons: ['Brings her own playlist'] }),
  // accountants
  c({ id: 'delphine', name: 'Delphine Okoro', short: 'Delphine', age: 48, role: 'accountant', skill: 5, wage: 220, rank: 5, appearance: 'delphine-okoro',
    quirk: 'Ex-auditor. Knows exactly what auditors look for, because she used to.', pros: ['Audits nearly vanish', 'Fronts launder more'], cons: ['Expensive', 'Judges your receipts'] }),
  c({ id: 'murray', name: 'Murray Feld', short: 'Murray', age: 63, role: 'accountant', skill: 3, wage: 130, rank: 5, appearance: 'murray-feld',
    quirk: 'Runs a tax-prep kiosk at Palmetto Plaza. Has a calculator with a strap.', pros: ['Reliable'], cons: ['Naps after lunch'] }),
  // lookouts
  c({ id: 'birdie', name: 'Birdie Okonkwo-Hale', short: 'Birdie', age: 66, role: 'lookout', skill: 4, wage: 95, rank: 4, appearance: 'birdie-okonkwo-hale',
    quirk: 'Serious birdwatcher. Binoculars never come off. Notices everything.', pros: ['Raid tips arrive early'], cons: ['Will stop everything for a heron'] }),
  c({ id: 'nanaro', name: 'Nana Ro Delgado', short: 'Nana Ro', age: 79, role: 'lookout', skill: 3, wage: 80, rank: 4, appearance: 'nana-ro-delgado',
    quirk: 'Neighborhood-watch captain for thirty years. Knows every car on the street.', pros: ['Cheap', 'Neighbors trust her'], cons: ['Calls you to report minor parking violations'] }),
];

export const CREW_BY_ID: Readonly<Record<string, CrewDef>> = Object.fromEntries(CREW.map((d) => [d.id, d]));
