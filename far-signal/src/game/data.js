// Game content: items, recipes, suits, heroes, quest chain and story text.

export const HEROES = {
  rampart: { name: 'Rampart', role: 'The Bulwark', color: '#6fa8ff' },
  lodestar: { name: 'Lodestar', role: 'The Gravity Dancer', color: '#ffd98a' },
  voltara: { name: 'Voltara', role: 'The Living Capacitor', color: '#8fb4ff' },
  evergreen: { name: 'Evergreen', role: 'The Regrower', color: '#8dfc9a' },
  vesper: { name: 'Vesper', role: 'The Phase-Walker', color: '#c69cff' },
};

export const ITEMS = {
  scrap: { name: 'Gate Scrap', desc: 'Scorched plating thrown off the Lattice Gate on arrival.', color: '#c9a27a', icon: 'plate' },
  ferrite: { name: 'Ferrite', desc: 'Dense iron-bearing rock. Smelts clean.', color: '#c8693e', icon: 'rock' },
  lumen: { name: 'Lumen Crystal', desc: 'Stores light the way a battery stores charge.', color: '#54e6e0', icon: 'shard' },
  fiber: { name: 'Sinew Fiber', desc: 'Reed fiber. Braided, it outpulls aramid.', color: '#9bd86a', icon: 'leaf' },
  pod: { name: 'Breather Pod', desc: 'A plant bladder full of oxygen-rich gas.', color: '#c8ffd8', icon: 'orb' },
  bloom: { name: 'Aether Bloom', desc: 'Petals that never stop glowing.', color: '#ff7ad1', icon: 'flower' },
  chitin: { name: 'Skitter Chitin', desc: 'Light, hard, and it conducts.', color: '#8a9cd8', icon: 'plate' },
  gland: { name: 'Drifter Gland', desc: 'The organ that lifts a Drifter off the ground. Volatile.', color: '#d7a6ff', icon: 'drop' },
  emberglass: { name: 'Emberglass', desc: 'Volcanic glass that holds heat for days.', color: '#ff8a3a', icon: 'shard' },
  alloy: { name: 'Vance Alloy', desc: 'Ferrite refined with lumen flux. Your own recipe.', color: '#cfd8e6', icon: 'ingot' },
  korrite: { name: 'Korrite', desc: 'Titanium-grade ore from the moon Korr.', color: '#9fb4d8', icon: 'rock' },
  voltite: { name: 'Voltite', desc: 'A mineral that hums with standing current.', color: '#5a8cff', icon: 'shard' },
  heliox: { name: 'Heliox Core', desc: 'A geode of pressurised fusion fuel.', color: '#ffd45a', icon: 'orb' },
  core: { name: 'Sentinel Core', desc: 'The mind-stone of a vault guardian.', color: '#ffe9a8', icon: 'gem' },
  oxycell: { name: 'Oxy-Cell', desc: 'Restores 60 air.', color: '#c8ffd8', icon: 'cell', use: 'oxy' },
  serumRegen: { name: 'Regen Serum', desc: 'Restores 70 health over 6 seconds.', color: '#8dfc9a', icon: 'vial', use: 'regen' },
  serumQuick: { name: 'Quickstep Serum', desc: '+35% speed for 45 seconds.', color: '#8fb4ff', icon: 'vial', use: 'quick' },
  serumIron: { name: 'Ironhide Serum', desc: 'Halves damage taken for 45 seconds.', color: '#ffb35a', icon: 'vial', use: 'iron' },
  keystone: { name: 'Keystone', desc: 'A resonant wedge cut for the Spire.', color: '#fff2b0', icon: 'gem', key: true },
};

export const RESOURCE_ORDER = ['scrap', 'ferrite', 'lumen', 'fiber', 'pod', 'bloom', 'chitin', 'gland', 'emberglass', 'alloy', 'korrite', 'voltite', 'heliox', 'core', 'keystone'];
export const CONSUMABLES = ['serumRegen', 'serumQuick', 'serumIron', 'oxycell'];

export const STATIONS = {
  still: { name: 'Atmo Still', desc: 'Cracks Breather Pods into breathable air. Refills your tank while you stand near camp.' },
  fabricator: { name: 'Fabricator', desc: 'A bench printer for gear and frames.' },
  biolab: { name: 'Bio-Lab', desc: 'Centrifuge, culture racks and a very small fridge.' },
  refinery: { name: 'Refinery', desc: 'Smelts Ferrite into Vance Alloy.' },
  forge: { name: 'Suit Forge', desc: 'An assembly cradle for powered frames.' },
  gate: { name: 'Lattice Gate', desc: 'The machine from the signal.' },
};

export const SUITS = [
  { id: 0, name: 'Lab Rig', short: 'RIG', hp: 100, energy: 100, o2: 100, armor: 0, regen: 6, blurb: 'A pressure suit never meant to leave the lab.' },
  { id: 1, name: 'Mk I Scrapframe', short: 'MK I', hp: 130, energy: 120, o2: 150, armor: 0.15, regen: 7, blurb: 'Gate plating over chitin. Ugly. Holds.' },
  { id: 2, name: 'Mk II Rampart Frame', short: 'MK II', hp: 170, energy: 150, o2: 200, armor: 0.3, regen: 9, blurb: 'Korrite shell on the load paths Rampart taught you.' },
  { id: 3, name: 'Mk III Lodestar Frame', short: 'MK III', hp: 200, energy: 190, o2: 260, armor: 0.38, regen: 12, blurb: 'Heliox thrusters. Hold jump to fly.' },
  { id: 4, name: 'Mk IV Resonant Frame', short: 'MK IV', hp: 260, energy: 240, o2: 320, armor: 0.5, regen: 16, blurb: 'Sentinel cores woven through the frame. It sings near the Spire.' },
];

// cat: build | gear | suit | serum | supply
export const RECIPES = [
  { id: 'g_gauntlet', cat: 'gear', name: 'Pulse Gauntlet', station: null, cost: { scrap: 3 }, gives: { unlock: 'gauntlet' }, hero: 'rampart',
    desc: 'Fires kinetic bolts and a cutting beam for mining.', note: 'Rampart\'s bracers stored every hit she blocked and handed it back. Same idea, one tenth the hit.' },
  { id: 'c_oxy', cat: 'supply', name: 'Oxy-Cell', station: null, cost: { pod: 2 }, gives: { item: 'oxycell', n: 2 }, need: ['gauntlet'], desc: 'Two pocket canisters of air.' },
  { id: 'b_still', cat: 'build', name: 'Atmo Still', station: null, cost: { scrap: 4, pod: 3 }, gives: { station: 'still' }, need: ['gauntlet'], hero: 'evergreen',
    desc: 'Refills your air whenever you are at camp.', note: 'Evergreen grew a breathing hedge on the roof of the Vigil tower. I am borrowing the chemistry.' },
  { id: 'b_fabricator', cat: 'build', name: 'Fabricator', station: null, cost: { ferrite: 6, lumen: 4, scrap: 2 }, gives: { station: 'fabricator' }, need: ['st:still'],
    desc: 'Unlocks gear and the first powered frame.' },
  { id: 's_mk1', cat: 'suit', name: 'Mk I Scrapframe', station: 'fabricator', cost: { ferrite: 8, chitin: 4, fiber: 4 }, gives: { suit: 1 }, hero: 'rampart',
    desc: '+30 health, 15% armor, bigger air tank.', note: 'First frame I ever built was a brace for Rampart\'s cracked shoulder plate. This one is for me.' },
  { id: 'b_biolab', cat: 'build', name: 'Bio-Lab', station: null, cost: { fiber: 6, lumen: 4, ferrite: 4 }, gives: { station: 'biolab' }, need: ['st:fabricator'], hero: 'evergreen',
    desc: 'Brew serums from what grows here.' },
  { id: 'b_refinery', cat: 'build', name: 'Refinery', station: null, cost: { ferrite: 10, lumen: 6, chitin: 3 }, gives: { station: 'refinery' }, need: ['st:fabricator'],
    desc: 'Smelts Ferrite into Vance Alloy.' },
  { id: 'm_alloy', cat: 'supply', name: 'Vance Alloy', station: 'refinery', cost: { ferrite: 3, lumen: 1 }, gives: { item: 'alloy', n: 2 }, desc: 'Two ingots.' },
  { id: 'c_regen', cat: 'serum', name: 'Regen Serum', station: 'biolab', cost: { bloom: 2, pod: 1 }, gives: { item: 'serumRegen', n: 2 }, hero: 'evergreen',
    desc: 'Heals 70 over 6 seconds.', note: 'Evergreen let me sequence one leaf. One. This is the diluted, legal version.' },
  { id: 'c_quick', cat: 'serum', name: 'Quickstep Serum', station: 'biolab', cost: { gland: 1, bloom: 1 }, gives: { item: 'serumQuick', n: 2 }, hero: 'voltara',
    desc: '+35% movement speed for 45 seconds.', note: 'Voltara\'s nerves fire three times faster than mine. Drifter gland gets me half way there.' },
  { id: 'c_iron', cat: 'serum', name: 'Ironhide Serum', station: 'biolab', cost: { chitin: 2, bloom: 2 }, gives: { item: 'serumIron', n: 2 }, hero: 'rampart',
    desc: 'Halves damage taken for 45 seconds.' },
  { id: 'c_symbiote', cat: 'serum', name: 'Deep-Breath Symbiote', station: 'biolab', cost: { gland: 3, bloom: 4, pod: 6 }, gives: { unlock: 'symbiote' }, hero: 'evergreen',
    desc: 'Permanent. Veyra\'s air stops costing you anything.', note: 'A lung symbiote. Evergreen would call it gardening.' },
  { id: 'b_gate', cat: 'build', name: 'Repair the Lattice Gate', station: null, cost: { alloy: 8, lumen: 10, emberglass: 4 }, gives: { station: 'gate' }, need: ['st:refinery'],
    desc: 'Restores the Gate. Its nav core only resolves one neighbour: the moon Korr.' },
  { id: 'b_forge', cat: 'build', name: 'Suit Forge', station: null, cost: { alloy: 6, lumen: 6, chitin: 4 }, gives: { station: 'forge' }, need: ['st:refinery'], hero: 'rampart',
    desc: 'Assembles heavy frames and field projectors.' },
  { id: 'g_gauntlet2', cat: 'gear', name: 'Gauntlet Focus Lens', station: 'fabricator', cost: { alloy: 4, voltite: 4, lumen: 6 }, gives: { unlock: 'gauntlet2' }, need: ['gauntlet'], hero: 'voltara',
    desc: 'Bolts hit 60% harder. Mining beam cuts twice as fast.' },
  { id: 'g_cipher', cat: 'gear', name: 'Glyph Cipher', station: 'fabricator', cost: { voltite: 2, lumen: 4 }, gives: { unlock: 'cipher' }, hero: 'vesper',
    desc: 'Reads vault doors. They open for anyone who can answer.', note: 'Vesper said every lock is a question. This asks it back at four thousand hertz.' },
  { id: 'g_arc', cat: 'gear', name: 'Arc Caster', station: 'fabricator', cost: { voltite: 6, lumen: 6, alloy: 2 }, gives: { unlock: 'arc' }, hero: 'voltara',
    desc: 'Chain lightning that jumps between up to four targets.', note: 'I spent two years building Voltara a glove that would NOT do this.' },
  { id: 'g_boots', cat: 'gear', name: 'Grav Boots', station: 'fabricator', cost: { korrite: 5, voltite: 3, alloy: 3 }, gives: { unlock: 'boots' }, hero: 'lodestar',
    desc: 'A second jump in mid-air, and soft landings.', note: 'Lodestar does not fly. She falls, very carefully, in whichever direction she likes.' },
  { id: 's_mk2', cat: 'suit', name: 'Mk II Rampart Frame', station: 'forge', cost: { korrite: 8, alloy: 6, voltite: 4 }, gives: { suit: 2 }, need: ['suit:1'], hero: 'rampart',
    desc: '+70 health, 30% armor, larger cell.' },
  { id: 'g_aegis', cat: 'gear', name: 'Aegis Barrier', station: 'forge', cost: { korrite: 6, lumen: 8, chitin: 4 }, gives: { unlock: 'aegis' }, hero: 'rampart',
    desc: 'A hard-light shell that absorbs everything for four seconds.' },
  { id: 'g_dash', cat: 'gear', name: 'Phase Dash', station: 'fabricator', cost: { core: 2, voltite: 4, gland: 2 }, gives: { unlock: 'dash' }, hero: 'vesper',
    desc: 'Blink nine metres. Nothing can touch you mid-step.', note: 'Vesper never told me how she does it. A Sentinel core told me in an afternoon.' },
  { id: 's_mk3', cat: 'suit', name: 'Mk III Lodestar Frame', station: 'forge', cost: { heliox: 3, emberglass: 6, alloy: 8, core: 2 }, gives: { suit: 3 }, need: ['suit:2'], hero: 'lodestar',
    desc: 'Thrusters. Hold jump in the air to fly.' },
  { id: 's_mk4', cat: 'suit', name: 'Mk IV Resonant Frame', station: 'forge', cost: { core: 6, heliox: 4, korrite: 10, voltite: 8 }, gives: { suit: 4 }, need: ['suit:3'], hero: 'vesper',
    desc: '+160 health, 50% armor. Built from the vaults themselves.' },
];

export const NOTES = {
  signal: { title: 'The Signal', text: 'Fourteen hours of structured noise from a patch of sky with nothing in it. Not a greeting. Not a warning. A parts list, an assembly order and a wiring diagram. Whoever sent it assumed the reader could build.' },
  arrival: { title: 'Arrival', text: 'The Gate did what the blueprint said it would. It did not say the far end was a moon under a ringed giant, or that the transit would cook half the lattice. The sky here has no constellations I know.' },
  air: { title: 'Atmosphere', text: 'Nitrogen, argon, eleven percent oxygen. Enough to keep a fire lit and not enough to keep me conscious. The pod plants by the water concentrate it. So will I.' },
  night: { title: 'First Night', text: 'Everything that grows here glows. So does everything that hunts. The small ones travel in packs and avoid the camp lights. The large one does not.' },
  korr: { title: 'Korr', text: 'The Gate resolves exactly one other address: an airless moon, visible from camp, riddled with ore. No way home. But somebody mined Korr before me. The cuts are too straight.' },
  vault: { title: 'The Vaults', text: 'The murals repeat one image. A tower with a thread running up out of the sky, and worlds strung along the thread like beads. Travellers walk in at the bottom. When the beads line up, they walk out somewhere else.' },
  spire: { title: 'The Spire', text: 'It is not a monument. It is an elevator. Three keyed sockets at the base, three vaults built to hide the keys from anyone who could not earn them. I have never wanted to pass a test more.' },
  ending: { title: 'Alignment', text: 'The Spire is awake. The thread is lit all the way up. The orrery in the base shows the worlds drifting toward a line, and a count I can finally read. Not today. But soon. And one of those beads is blue.' },
};

// Linear main objective chain. `done` receives the save state.
export const QUESTS = [
  { id: 'scrap', title: 'Crash Landing', text: 'Salvage Gate Scrap from the wreckage', count: (s) => [s.inv.scrap || 0, 3], done: (s) => (s.inv.scrap || 0) >= 3 || s.unlocks.gauntlet, marker: 'landing',
    say: 'Suit integrity nominal. Gate integrity... not. Start with what fell off.' },
  { id: 'gauntlet', title: 'Crash Landing', text: 'Open Craft and assemble the Pulse Gauntlet', done: (s) => s.unlocks.gauntlet, say: 'Rampart\'s bracer design. I can build that from scrap in my sleep.' },
  { id: 'pods', title: 'Thin Air', text: 'Harvest Breather Pods near the lagoon', count: (s) => [s.inv.pod || 0, 3], done: (s) => (s.inv.pod || 0) >= 3 || s.stations.still, marker: 'lagoon', note: 'air',
    say: 'Tank is draining. Those pale bladders by the water are full of oxygen.' },
  { id: 'still', title: 'Thin Air', text: 'Build an Atmo Still at camp', done: (s) => s.stations.still, marker: 'landing' },
  { id: 'mine', title: 'Foothold', text: 'Mine Ferrite and Lumen Crystal', count: (s) => [Math.min(s.inv.ferrite || 0, 6) + Math.min(s.inv.lumen || 0, 4), 10], done: (s) => ((s.inv.ferrite || 0) >= 6 && (s.inv.lumen || 0) >= 4) || s.stations.fabricator,
    say: 'Air handled. Now I need a workshop. Rust-streaked boulders for iron, the bright crystals for power.' },
  { id: 'fabricator', title: 'Foothold', text: 'Build the Fabricator', done: (s) => s.stations.fabricator, marker: 'landing' },
  { id: 'mk1', title: 'What Hunts at Night', text: 'Forge the Mk I Scrapframe (Skitters drop chitin)', done: (s) => s.suit >= 1, note: 'night',
    say: 'Something is circling the camp. I want plating between it and me.' },
  { id: 'labs', title: 'Field Science', text: 'Build the Bio-Lab and the Refinery', count: (s) => [(s.stations.biolab ? 1 : 0) + (s.stations.refinery ? 1 : 0), 2], done: (s) => s.stations.biolab && s.stations.refinery, marker: 'landing' },
  { id: 'ember', title: 'The Dead Machine', text: 'Follow the canyon road east and mine Emberglass', count: (s) => [s.inv.emberglass || 0, 4], done: (s) => (s.inv.emberglass || 0) >= 4 || s.stations.gate, marker: 'mesa',
    say: 'The lattice needs a thermal buffer. There is volcanic glass in the red country to the east.' },
  { id: 'gate', title: 'The Dead Machine', text: 'Repair the Lattice Gate', done: (s) => s.stations.gate, marker: 'landing' },
  { id: 'korr', title: 'One Address', text: 'Step through the Gate', done: (s) => s.visited.korr, marker: 'landing', say: 'It resolves one destination. Not Earth. The ore moon, Korr.' },
  { id: 'korrMine', title: 'Ore Moon', text: 'Mine Korrite and Voltite on Korr', count: (s) => [Math.min(s.inv.korrite || 0, 8) + Math.min(s.inv.voltite || 0, 6), 14], done: (s) => ((s.inv.korrite || 0) >= 8 && (s.inv.voltite || 0) >= 6) || s.stations.forge, note: 'korr',
    say: 'No air, a third of the gravity, and more titanium than Meridian City has ever seen.' },
  { id: 'forge', title: 'Heavier Metal', text: 'Return to Veyra and build the Suit Forge', done: (s) => s.stations.forge, marker: 'landing' },
  { id: 'mk2', title: 'Heavier Metal', text: 'Forge the Mk II Rampart Frame', done: (s) => s.suit >= 2 },
  { id: 'cipher', title: 'A Door That Asks', text: 'Build a Glyph Cipher at the Fabricator', done: (s) => s.unlocks.cipher, say: 'There is a sealed door in the Crystal Reach. It keeps repeating a tone. I think it wants an answer.' },
  { id: 'vault1', title: 'Vault of Echoes', text: 'Enter the vault in the Crystal Reach and take its Keystone', done: (s) => s.keystones >= 1, marker: 'vaultEchoes', note: 'vault' },
  { id: 'boots', title: 'Out of Reach', text: 'Build Grav Boots (the next vault sits on a high dais)', done: (s) => s.unlocks.boots || s.keystones >= 2, say: 'The second door is up on a dais three metres high. Lodestar would laugh at me.' },
  { id: 'vault2', title: 'Vault of Embers', text: 'Take the Keystone from the vault in the Ember Mesa', done: (s) => s.keystones >= 2, marker: 'vaultEmbers' },
  { id: 'mk3', title: 'Across the Water', text: 'Forge the Mk III Lodestar Frame (Heliox is on Korr)', done: (s) => s.suit >= 3 || s.keystones >= 3, say: 'The last vault stands on a sea stack off the north-west coast. I am going to have to fly.' },
  { id: 'vault3', title: 'Vault of Tides', text: 'Fly to the sea stack and take the last Keystone', done: (s) => s.keystones >= 3, marker: 'vaultTides' },
  { id: 'spire', title: 'The Spire', text: 'Climb the Pilgrim\'s Stair north to the Spire', done: (s) => s.flags.reachedSpire, marker: 'spire', note: 'spire', say: 'Three keys. One tower. North, past the Spine.' },
  { id: 'warden', title: 'The Spire', text: 'Defeat the Warden', done: (s) => s.flags.wardenDead, marker: 'spire' },
  { id: 'activate', title: 'The Spire', text: 'Set the Keystones into the Spire', done: (s) => s.flags.spireAwake, marker: 'spire' },
  { id: 'free', title: 'Alignment Pending', text: 'The Spire is awake. The worlds are still drifting into line.', done: () => false },
];

export const INTRO_LINES = [
  { t: 0, text: 'MERIDIAN CITY' },
  { t: 3.2, text: 'The Vigil keeps this city standing. Five people who can fly, phase, regrow, and stop a train.' },
  { t: 9.5, text: 'Someone has to build what they break.' },
  { t: 14, text: 'Dr. Elias Vance. Sub-level four. No powers. Excellent tools.' },
];
