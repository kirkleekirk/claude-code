/* Car themes (raid zones), car rules (modifiers), and lessons (side objectives). */
(function () {
  'use strict';
  const D = LCO.data;

  D.CARS = {
    corgi:      { name: 'The Corgi Car',      tiers: [1, 4],  fams: ['corgi'],      tint: '#2b2014', accent: '#d9914a', blurb: 'A kingdom of very good dogs with very strict laws.',
                  flavor: ['A royal proclamation is nailed to the wall. It is mostly paw prints.', 'Somewhere nearby, a trumpet plays four notes and a dog sneezes.', 'Tiny thrones line the corridor. All of them are occupied by naps.'] },
    ballpit:    { name: 'The Ball Pit Car',   tiers: [1, 4],  fams: ['ballpit'],    tint: '#24162a', accent: '#e25c6a', blurb: 'Knee-deep plastic spheres, and something moving underneath.',
                  flavor: ['The balls shift. Something below shifts with them.', 'You find a shoe. Then another shoe. Not a matching one.', 'A slide leads up into darkness. You decide not to find out.'] },
    unfinished: { name: 'The Unfinished Car', tiers: [2, 6],  fams: ['unfinished'], tint: '#1b2221', accent: '#cfd6d2', blurb: 'Wireframe walls and furniture that never got its textures.',
                  flavor: ['A label on the wall reads TODO: SOMETHING NICE HERE.', 'The floor is a grid of glowing lines. It is surprisingly firm.', 'A window shows a placeholder sky: flat blue, no clouds, no sun.'] },
    desert:     { name: 'The Desert Car',     tiers: [2, 6],  fams: ['desert'],     tint: '#2e2213', accent: '#d9b36a', blurb: 'A sun that never sets, bolted to the ceiling.',
                  flavor: ['Heat shimmers above sand that goes on far longer than a train car should.', 'A saloon door swings in a wind that is not there.', 'Bleached bones spell out WRONG CAR in careful letters.'] },
    beach:      { name: 'The Beach Car',      tiers: [2, 6],  fams: ['beach'],      tint: '#132430', accent: '#f2b33c', blurb: 'Endless shoreline, wet sand, and very bold seagulls.',
                  flavor: ['Waves roll in from the front of the car and out through the back.', 'Someone built a sandcastle shaped exactly like this car.', 'A towel is spread out with nobody on it. It is still warm.'] },
    crystal:    { name: 'The Crystal Car',    tiers: [3, 8],  fams: ['crystal'],    tint: '#16222b', accent: '#7fd3e6', blurb: 'Every surface rings when touched. So does every blow.',
                  flavor: ['Your footsteps chime a little tune you almost recognize.', 'Light splits into colors that do not have names.', 'A crystal grows a fraction of an inch while you watch.'] },
    library:    { name: 'The Library Car',    tiers: [3, 8],  fams: ['library'],    tint: '#221a24', accent: '#b98ae8', blurb: 'Shelves to the ceiling. The ceiling is very far away.',
                  flavor: ['A sign reads QUIET. Someone has underlined it eleven times.', 'A book falls open to a page describing exactly where you are standing.', 'The card catalog drawers are breathing. Slowly.'] },
    swamp:      { name: 'The Toad Car',       tiers: [3, 7],  fams: ['swamp'],      tint: '#16220f', accent: '#a8c46a', blurb: 'A humid bog ruled by an ancient, dignified toad.',
                  flavor: ['The water is warm and smells faintly of soup.', 'Lily pads form a path. Most of them hold your weight.', 'A frog in a tiny tie watches you, taking notes.'] },
    mirror:     { name: 'The Reflection Car', tiers: [4, 9],  fams: ['mirror'],     tint: '#1a1f27', accent: '#c3ccd6', blurb: 'Everything here is reversed, including the people.',
                  flavor: ['Your reflection is a half-step behind you. Then a half-step ahead.', 'The writing on the walls reads correctly, which is worse.', 'A mirror shows this room, but tidier.'] },
    chrome:     { name: 'The Chrome Car',     tiers: [4, 9],  fams: ['chrome'],     tint: '#18222a', accent: '#a9c6d6', blurb: 'A cold, polished car where anything can be frozen solid.',
                  flavor: ['Your breath freezes into a tiny cloud and falls to the floor.', 'Everything here is polished to a shine. Even the dust.', 'A chromed passenger stands mid-step, forever about to leave.'] },
    ledger:     { name: 'The Accounting Car', tiers: [5, 9],  fams: ['ledger'],     tint: '#1a2119', accent: '#7ff0d0', blurb: 'Clerks tally every passenger’s Number, and they are strict.',
                  flavor: ['Rows of desks. Stacks of forms. One of the forms has your name on it.', 'An adding machine prints a tape that reads 1, 1, 1, 1, 1…', 'A notice: ALL NUMBERS ARE FINAL. APPEALS ARE ALSO NUMBERS.'] },
    ghom:       { name: 'The Ghom Car',       tiers: [6, 10], fams: ['ghom'],       tint: '#150f19', accent: '#d9508a', blurb: 'Darkness that sticks to you, and tapes that play your worst days.',
                  flavor: ['A tape player clicks on by itself. You know the voice.', 'The dark here is thick enough to leave fingerprints on.', 'Something behind you rewinds.'] },
    apex:       { name: 'The Apex Hideout',   tiers: [6, 10], fams: ['apex'],       tint: '#241713', accent: '#e0583c', blurb: 'Passengers who stopped wanting to leave — and started hunting.',
                  flavor: ['Graffiti: WE LIKE IT HERE. Underneath, in another hand: WE REALLY DO.', 'A scoreboard lists names and very high Numbers.', 'You find a pile of confiscated denizen hats.'] },
    void:       { name: 'The Null Car',       tiers: [7, 10], fams: ['void'],       tint: '#0b1010', accent: '#7ff0d0', blurb: 'A car that has been deleted and has not noticed yet.',
                  flavor: ['The walls are there when you look at them, mostly.', 'Your footsteps arrive a moment after you do.', 'There is a doorway to nothing. It is labeled NOTHING.'] },
    engine:     { name: 'The Engine',         tiers: [10, 10], fams: ['void', 'hunter'], tint: '#1c120d', accent: '#ff6a4a', blurb: 'The front of the train. It has been waiting for you.', special: true,
                  flavor: ['The floor thrums like a heartbeat.', 'Coal glows red in the seams of the walls.', 'Every door here has your Number on it.'] },
  };
  D.CAR_ORDER = ['corgi', 'ballpit', 'unfinished', 'desert', 'beach', 'crystal', 'library', 'swamp', 'mirror', 'chrome', 'ledger', 'ghom', 'apex', 'void'];

  /* Car rules. `minTier` gates the nastier ones. */
  D.MODIFIERS = {
    ordinary:   { name: 'Ordinary',       desc: 'Nothing unusual. Suspicious.' },
    scorching:  { name: 'Scorching',      desc: 'Lose 2% of max HP whenever you change rooms.' },
    resonant:   { name: 'Resonant',       desc: 'Everyone gets +10% Crit Chance and +50% Crit Damage — enemies too.', minTier: 2 },
    deep_pit:   { name: 'Deep Footing',   desc: 'Everyone gets +15% Dodge.' },
    unsteady:   { name: 'Unsteady Floor', desc: 'Instability rises 30% faster, but loot is worth 25% more.' },
    overstock:  { name: 'Overstocked',    desc: 'Every cache holds an extra item.' },
    garrison:   { name: 'Garrisoned',     desc: 'Fights have an extra enemy. +20% Loot Find.', minTier: 2 },
    lights_out: { name: 'Lights Out',     desc: 'You only see the rooms right next to you.' },
    hush:       { name: 'Hush',           desc: 'Abilities cost 1 more Focus. +20% Experience.' },
    frost:      { name: 'Chrome Frost',   desc: 'Everyone starts each fight with 1 Chill.', minTier: 3 },
    audited:    { name: 'Audited',        desc: 'Every change to your Number is doubled — up or down.', minTier: 3 },
    lost_prop:  { name: 'Lost Property',  desc: 'Valuables turn up twice as often.' },
    hunted:     { name: 'Hunted',         desc: 'A Steward guards a Relic cache somewhere in this car.', minTier: 3 },
    greased:    { name: 'Greased Rails',  desc: 'Fleeing always works.' },
    red_signal: { name: 'Red Signal',     desc: 'Enemies hit 20% harder and drop 30% more loot.', minTier: 4 },
  };

  D.LESSONS = {
    mercy:     { name: 'Mercy',        desc: 'Let a peaceful denizen go when you could have finished it.' },
    courage:   { name: 'Courage',      desc: 'Defeat the car’s elite.' },
    letting_go:{ name: 'Letting Go',   desc: 'Extract carrying 4 or fewer items in your backpack.' },
    patience:  { name: 'Patience',     desc: 'Rest in a quiet nook.' },
    honesty:   { name: 'Honesty',      desc: 'Leave the vault sealed.' },
    kindness:  { name: 'Kindness',     desc: 'Help a denizen in need.' },
    resolve:   { name: 'Resolve',      desc: 'Win at least one fight and never flee.' },
    curiosity: { name: 'Curiosity',    desc: 'Explore at least 60% of the car before leaving.' },
    long_way:  { name: 'The Long Way', desc: 'Leave through the Far Door.' },
  };

  D.RUMORS = [
    { id: 'relic',    text: 'A Relic is rumored to be in the vault.' },
    { id: 'rich',     text: 'Passengers say this car is full of valuables.' },
    { id: 'quiet',    text: 'Said to be quiet. Fewer fights, fewer prizes.' },
    { id: 'merchant', text: 'A wandering merchant was seen here.' },
    { id: 'none',     text: 'Nobody has come back to talk about it.' },
  ];

  /* Room type display info. */
  D.ROOMS = {
    entry:   { name: 'Entry Door',       icon: 'door',     short: 'In' },
    empty:   { name: 'Corridor',         icon: 'train',    short: '' },
    cache:   { name: 'Cache',            icon: 'chest',    short: 'Loot' },
    fight:   { name: 'Denizens',         icon: 'swords',   short: 'Fight' },
    elite:   { name: 'Elite',            icon: 'crown',    short: 'Elite' },
    event:   { name: 'Curiosity',        icon: 'question', short: 'Event' },
    rest:    { name: 'Quiet Nook',       icon: 'bed',      short: 'Rest' },
    vault:   { name: 'Vault',            icon: 'vault',    short: 'Vault' },
    shrine:  { name: 'Shrine',           icon: 'shrine',   short: 'Shrine' },
    merchant:{ name: 'Wandering Merchant', icon: 'cart',   short: 'Shop' },
    trap:    { name: 'Hazard',           icon: 'trap',     short: 'Hazard' },
    hunter:  { name: 'Steward’s Post',   icon: 'eye',      short: 'Steward' },
    boss:    { name: 'Boss',             icon: 'crown',    short: 'Boss' },
    far:     { name: 'The Far Door',     icon: 'door',     short: 'Exit' },
    hatch:   { name: 'Emergency Hatch',  icon: 'hatch',    short: 'Exit' },
    locked:  { name: 'Locked Coupling',  icon: 'lock',     short: 'Exit' },
    toll:    { name: 'Toll Gate',        icon: 'ticket',   short: 'Exit' },
    home:    { name: 'The Door Home',    icon: 'door',     short: 'Home' },
  };
  D.EXIT_TYPES = ['far', 'hatch', 'locked', 'toll', 'home'];
})();
