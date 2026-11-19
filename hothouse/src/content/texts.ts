/**
 * Story texts for recurring systems: Vale's debt check-ins, the tipster, crew drama, audits and
 * the Halcyon Herald's reactive headlines. `{amount}`, `{name}`, `{place}`, `{brand}`, `{n}`
 * are filled by the sim.
 */

export const VALE_LINES = {
  scheduleStart:
    'A pleasure, truly. Your grandmother paid me a little every few days, with interest and a smile. I would like the same arrangement. {amount} by our next talk. — I.V.',
  onTime: [
    'Punctual. I like punctual. My nephew could learn from you. — I.V.',
    'Received with gratitude. Come by for paella, the prawns are excellent this week. — I.V.',
    'Your grandmother would be proud. I am, at least, impressed. — I.V.',
  ],
  ahead: [
    'Early? You are spoiling me. My accountant cried a little. — I.V.',
    'Ahead of schedule. People notice these things, mija. Good people and the other kind. — I.V.',
  ],
  missed: [
    'We are behind. I am a patient man. My collectors are less patient men. — I.V.',
    'Two of my associates will stop by to say hello. Only hello. For now. — I.V.',
    'I am disappointed, which is worse than angry. Ask anyone. — I.V.',
  ],
  collectors: [
    'A large man in a linen suit is sitting in your parking lot eating a pastelito. He says hi.',
    'Vale’s collectors left a basket of oranges on your counter. And a calculator.',
    'Someone parked a very nice car across your driveway and waved for twenty minutes.',
  ],
  paidOff: 'Paid in full. You are free, and you are welcome at my table any time. I mean both of those things. — I.V.',
  nextDue: 'Next check-in: {amount} by day {n}.',
} as const;

export const TIPSTER_LINES = {
  raid: [
    'Cops are planning a visit to {place}. Not tonight. Soon. Move what matters.',
    'Heard a detective say “{place}” twice at the diner. Thought you’d want to know.',
    'Search warrant with your address on it is sitting on a desk downtown. {place}. Tick tock.',
  ],
  imminent: 'They’re rolling to {place}. Now-ish.',
  cancelled: 'Raid on {place} got called off. Someone made a phone call. Lucky you.',
} as const;

export const RAID_LINES = {
  repelled: 'They found nothing worth the paperwork. The sergeant apologized to your monstera.',
  raided: 'They took {n} units and a lot of photos. Lockdown for a while. Plants will grow back.',
  evaded: 'The stash was long gone by the time they kicked the door. You should get a better door anyway.',
  bribed: 'Somebody downtown lost the warrant. Expensive somebody.',
} as const;

export const BUST_LINES: readonly string[] = [
  'Sy Pinkerton met you at the station with a smoothie and a retainer form. Busted? Don’t panic.',
  'You were out before the paperwork was. Sy says hi, and also you owe him.',
  'Sy argued the bag was “decorative botanicals.” The judge laughed. You walked.',
];

export const CREW_LINES = {
  hired: [
    '{name} showed up early with snacks. Promising.',
    '{name} already named the break room plant.',
    '{name} asked where the good scissors are. Good sign.',
  ],
  upset: '{name} is grumbling. Better pay, a break room, or a kind word would help.',
  quit: [
    '{name} quit. Left a note: “Respect is a two-way street. So is my car. Bye.”',
    '{name} walked out mid-shift and took the good scissors.',
    '{name} quit in a dramatic voicemail with background music.',
  ],
  wonBack: '{name} is back. Says it was never about the money. It was a little about the money.',
  idle: '{name} has nothing to do and is reorganizing the shelves alphabetically.',
  needsSupplies: '{name} is out of supplies at {place}.',
} as const;

export const AUDIT_LINES = {
  audit: 'The tax office sent a very polite auditor to {name}. Fine: {amount}. Push less through it for a while.',
  clean: '{name} passed inspection. The auditor bought a T-shirt.',
} as const;

/** Herald headlines. Keyed by trigger; one is picked when the trigger fires the first time (or each time for repeatables). */
export const NEWS = {
  start: 'Beloved bait-shop owner’s grandchild moves into Palmetto Flats; neighbors “cautiously curious”',
  firstDeals: 'Local nursery’s mysterious boom baffles economists',
  brand: '“{brand}” stickers appear on boardwalk; skaters deny everything',
  rank3: 'Palmetto Flats reports sudden surge in “very relaxed” residents',
  rank5: 'Who is the florist everyone keeps whispering about? An investigation (part 1 of 9)',
  rank7: 'City council debates whether “being suspiciously good at plants” is a crime',
  rank9: 'Halcyon Bay named “Most Chill City in Florida” by a magazine nobody has heard of',
  bust: 'Arrest near {place} ends in shrug; suspect’s lawyer appears “within minutes, in pink”',
  raid: 'Police raid on {place} turns up “mostly ferns,” spokesperson confirms',
  apex: 'Area resident claims to have “seen the face of the Gulf”; doctors call it “a good Tuesday”',
  stunt: 'Mysterious {brand} party draws hundreds; organizers “just love the beach”',
  hurricane: 'Hurricane watch issued for Halcyon Bay; residents board windows, stock up on snacks',
  legit: '{brand} goes legit with garden-center chain; customers report “the same vibes, now with receipts”',
  crown: 'Nobody knows who runs Halcyon Bay anymore. Nobody minds.',
  perfectStreak: 'Boardwalk vendors report “surprisingly firm but fair” negotiations sweeping the Strand',
  zenith: 'Zenith Wellness founder Chase Montrose launches “Florida Calm” line; critics call it “suspiciously familiar”',
} as const;
