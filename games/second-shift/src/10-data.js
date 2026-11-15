/* =====================================================================
   10-data: stats, tags, heroes, abilities, perks, enemies, calls, shifts
   ===================================================================== */

const STATS = ['combat', 'vigor', 'mobility', 'charisma', 'intellect'];
const STAT = {
  combat: { label: 'Combat', short: 'CMB', color: '#ff6b4a', blurb: 'Fists, firepower, getting stuff done the loud way.' },
  vigor: { label: 'Vigor', short: 'VIG', color: '#5ee08a', blurb: 'Toughness and stamina. Keeps heroes off the injury list.' },
  mobility: { label: 'Mobility', short: 'MOB', color: '#3de0ff', blurb: 'Speed, flight, reflexes. Fast heroes act sooner in a fight.' },
  charisma: { label: 'Charisma', short: 'CHA', color: '#ff8ad8', blurb: 'Talking, charm, crowd control. Builds your Hype faster.' },
  intellect: { label: 'Intellect', short: 'INT', color: '#a98bff', blurb: 'Gadgets, tactics, problem-solving. Raises crit chance.' },
};

const TAGS = {
  flight: { label: 'Flight', hint: 'Can get there fast and from above.' },
  brute: { label: 'Brute', hint: 'Lifting, smashing, bracing.' },
  tech: { label: 'Tech', hint: 'Wires, machines, code.' },
  stealth: { label: 'Stealth', hint: 'Quiet, sneaky, unseen.' },
  elemental: { label: 'Elemental', hint: 'Fire, ice, lightning, wind.' },
  psychic: { label: 'Psychic', hint: 'Minds and mysteries.' },
  medic: { label: 'Medic', hint: 'Patching up people.' },
  charm: { label: 'Charm', hint: 'Smooth-talking, camera-ready.' },
};

/* How a hero likes to be talked to over the radio (used in Radio Checks) */
const TEMPERS = {
  hype: { label: 'Hype', icon: '!', line: 'Pump them up' },
  calm: { label: 'Calm', icon: '~', line: 'Keep it steady' },
  joke: { label: 'Joke', icon: '?', line: 'Crack a joke' },
  order: { label: 'Order', icon: '#', line: 'Give a firm order' },
};

const DISTRICTS = {
  downtown: { name: 'Downtown', x: 0.52, y: 0.27, slots: [[-0.05, -0.02], [0.06, 0.05], [-0.01, 0.1]] },
  uptown: { name: 'Uptown', x: 0.82, y: 0.2, slots: [[-0.04, 0.0], [0.04, 0.07], [-0.06, 0.09]] },
  oldtown: { name: 'Old Town', x: 0.2, y: 0.3, slots: [[-0.03, -0.03], [0.05, 0.04], [-0.02, 0.1]] },
  foundry: { name: 'The Foundry', x: 0.8, y: 0.68, slots: [[-0.05, -0.04], [0.04, 0.03], [-0.03, 0.09]] },
  harbor: { name: 'Harbor', x: 0.24, y: 0.76, slots: [[-0.04, -0.03], [0.05, 0.03], [-0.03, 0.08]] },
  park: { name: 'Greenway Park', x: 0.58, y: 0.8, slots: [[-0.05, -0.03], [0.04, 0.02], [-0.02, 0.07]] },
};
const HQ_POS = { x: 0.5, y: 0.52 };

/* ---------- ability helper ---------- */
const AB = o => Object.assign({ cd: 0, side: 'foe', area: 'one', ar: 0, dmg: 0, fx: [], needFoe: true }, o);

/* ---------- the roster ---------- */
const HERO_ORDER = ['anvil', 'skylark', 'fuse', 'velvet', 'bulwark', 'cinder', 'slush', 'boomer', 'hush'];
const HEROES = {
  anvil: {
    id: 'anvil', name: 'Anvil', real: 'Gus Brennan', role: 'Bruiser', age: 58,
    bio: 'Thirty years running a demolition crew until a gauntlet prototype fell on him. Now he demolishes things on purpose, with benefits.',
    quote: '"Union rules say I get a break after this one."',
    stats: { combat: 5, vigor: 5, mobility: 1, charisma: 2, intellect: 2 }, power: 'combat', tags: ['brute', 'tech'],
    temper: 'order', likes: 'order', dislikes: 'joke',
    look: { skin: '#a8693c', build: 'bulky', hair: { s: 'bald', c: '#222' }, suit: '#e8741f', suit2: '#383d4a', accent: '#ffd23f', mask: { t: 'none' }, cape: null, emblem: 'anvil', extras: ['hardhat', 'mustache', 'gauntlets'] },
    join: { shift: 1, price: 0 },
    kit: [
      AB({ id: 'haymaker', name: 'Haymaker', tgt: 'adj', dmg: 1, kb: 1, flavor: 'A punch with opinions.' }),
      AB({ id: 'wreck', name: 'Wrecking Slam', tgt: 'line', r: 2, pierce: true, dmg: 1.1, kb: 2, cd: 2, flavor: 'Everything in front of him leaves the building.' }),
      AB({ id: 'pound', name: 'Ground Pound', tgt: 'self', area: 'square', ar: 1, dmg: 0.8, fx: [{ k: 'delay', v: 5 }], cd: 3, flavor: 'Hard hat. Harder stomp.' }),
      AB({ id: 'demo', name: 'Demolition Day', ult: true, tgt: 'tile', r: 4, area: 'square', ar: 1, dmg: 2.0, kb: 2, kbFrom: 'center', fx: [{ k: 'delay', v: 6 }], flavor: 'Fully permitted. Mostly.' }),
    ],
    perks: [
      { id: 'hardhat', name: 'Hard Hat', desc: '+8 HP in battle. 35% less injury risk.', m: { hp: 8, injury: -0.35 } },
      { id: 'heavy', name: 'Heavy Hitter', desc: '+1 knockback on every attack. +10% on Brute calls.', m: { kb: 1, tag_brute: 0.1 } },
      { id: 'overtime', name: 'Overtime Pay', desc: '+20% funds from his calls. Starts battles with 30 Hype.', m: { funds: 0.2, startHype: 30 } },
    ],
  },
  skylark: {
    id: 'skylark', name: 'Skylark', real: 'Pippa Nwosu', role: 'Skirmisher', age: 19,
    bio: 'Got her powers during a very windy school trip. Wants to be taken seriously. Has a cape she calls "aerodynamic".',
    quote: '"I can be there in, like, forty seconds. Is that bad?"',
    stats: { combat: 2, vigor: 2, mobility: 5, charisma: 3, intellect: 2 }, power: 'mobility', tags: ['flight', 'elemental'],
    temper: 'hype', likes: 'hype', dislikes: 'order',
    look: { skin: '#8d5524', build: 'slim', hair: { s: 'puffs', c: '#2a1a12' }, suit: '#2bbcf0', suit2: '#f4f7ff', accent: '#ffd23f', mask: { t: 'goggles', c: '#ffd23f' }, cape: '#f4f7ff', emblem: 'wing', extras: [] },
    join: { shift: 1, price: 0 },
    kit: [
      AB({ id: 'gust', name: 'Gust Dart', tgt: 'line', r: 4, dmg: 0.9, flavor: 'Wind, but pointy.' }),
      AB({ id: 'cyclone', name: 'Cyclone Dash', tgt: 'dash', r: 3, dmg: 1.0, cd: 3, needFoe: false, flavor: 'Through them. Not around them.' }),
      AB({ id: 'tailwind', name: 'Tailwind', tgt: 'ally', r: 4, side: 'ally', fx: [{ k: 'haste', v: 7 }, { k: 'cdr', v: 1 }], cd: 3, flavor: 'A little push for a friend.' }),
      AB({ id: 'storm', name: 'Eye of the Storm', ult: true, tgt: 'tile', r: 5, area: 'diamond', ar: 2, dmg: 1.4, pull: 2, fx: [{ k: 'slow', v: 4 }], flavor: 'Gathers the whole street into one very annoyed pile.' }),
    ],
    perks: [
      { id: 'tailwind', name: 'Jet Stream', desc: '+1 movement in battle. Trips are 20% faster.', m: { move: 1, trip: -0.2 } },
      { id: 'thermals', name: 'Thermals', desc: '+10% on Flight calls. +10% damage.', m: { tag_flight: 0.1, dmg: 0.1 } },
      { id: 'daredevil', name: 'Daredevil', desc: '+15% crit chance. Flawless results are more likely.', m: { crit: 0.15, flawless: 0.1 } },
    ],
  },
  fuse: {
    id: 'fuse', name: 'Fuse', real: 'Dr. Dev Raman', role: 'Controller', age: 34,
    bio: 'A brilliant electrical engineer who touched the wrong transformer. Apologizes before every explosion.',
    quote: '"Sorry! Sorry. That was my fault. Move left."',
    stats: { combat: 2, vigor: 2, mobility: 2, charisma: 1, intellect: 7 }, power: 'intellect', tags: ['tech', 'elemental'],
    temper: 'calm', likes: 'calm', dislikes: 'hype',
    look: { skin: '#b87846', build: 'slim', hair: { s: 'messy', c: '#14141c' }, suit: '#2f4bff', suit2: '#14183a', accent: '#7df9ff', mask: { t: 'none' }, cape: null, emblem: 'bolt', extras: ['glasses', 'labcoat'] },
    join: { shift: 1, price: 0 },
    kit: [
      AB({ id: 'zap', name: 'Arc Zap', tgt: 'tile', r: 4, dmg: 0.9, chain: 0.5, flavor: 'Jumps to a neighbor. Like gossip.' }),
      AB({ id: 'field', name: 'Static Field', tgt: 'tile', r: 4, area: 'diamond', ar: 1, dmg: 0.5, fx: [{ k: 'delay', v: 6 }], cd: 3, flavor: 'Standing there is a mistake.' }),
      AB({ id: 'overclock', name: 'Overclock', tgt: 'ally', r: 4, side: 'ally', fx: [{ k: 'cdr', v: 2 }, { k: 'hype', v: 25 }], cd: 3, flavor: 'Warranty void. Results excellent.' }),
      AB({ id: 'grid', name: 'Grid Overload', ult: true, tgt: 'row', dmg: 1.8, fx: [{ k: 'delay', v: 8 }], flavor: 'Every enemy in a row. One very bad day.' }),
    ],
    perks: [
      { id: 'battery', name: 'Backup Battery', desc: '+25% Hype gain. +10% on Tech calls.', m: { hype: 0.25, tag_tech: 0.1 } },
      { id: 'overclocked', name: 'Overclocked', desc: 'Ability cooldowns are 1 turn shorter.', m: { cdr: 1 } },
      { id: 'charged', name: 'Fully Charged', desc: 'Ultimate hits 25% harder. +1 range on target abilities.', m: { ultDmg: 0.25, rng: 1 } },
    ],
  },
  velvet: {
    id: 'velvet', name: 'Velvet', real: 'Marguerite Duval', role: 'Assassin', age: 29,
    bio: 'Retired cat burglar, currently serving community service. Insists she is "consulting".',
    quote: '"I wasn\'t stealing. I was borrowing aggressively."',
    stats: { combat: 3, vigor: 2, mobility: 4, charisma: 4, intellect: 2 }, power: 'mobility', tags: ['stealth', 'charm'],
    temper: 'joke', likes: 'joke', dislikes: 'calm',
    look: { skin: '#f0c8a4', build: 'normal', hair: { s: 'bob', c: '#8a2fb8' }, suit: '#2c2140', suit2: '#8a2fb8', accent: '#ff4d8d', mask: { t: 'catcowl', c: '#1d1530' }, cape: '#8a2fb8', emblem: 'diamond', extras: [] },
    join: { shift: 1, price: 0, free: 2 },
    kit: [
      AB({ id: 'slice', name: 'Slice & Dice', tgt: 'adj', dmg: 1.0, fx: [{ k: 'hype', v: 12, self: true }], flavor: 'Takes a little off the top. And your wallet.' }),
      AB({ id: 'hop', name: 'Smoke Hop', tgt: 'empty', r: 3, move: 'tp', area: 'diamond', ar: 1, dmg: 0.6, cd: 2, needFoe: false, flavor: 'Now you see her. Now you cough.' }),
      AB({ id: 'switch', name: 'Switcheroo', tgt: 'line', r: 3, move: 'swap', dmg: 0.8, cd: 3, flavor: 'Trades places. Keeps the watch.' }),
      AB({ id: 'heist', name: 'Grand Heist', ult: true, tgt: 'dash', r: 5, dmg: 1.7, extra: 'extraTurn', flavor: 'Takes three enemies, two turns, zero receipts.' }),
    ],
    perks: [
      { id: 'fingers', name: 'Sticky Fingers', desc: '+15% funds from her calls. +10% crit chance.', m: { funds: 0.15, crit: 0.1 } },
      { id: 'tongue', name: 'Silver Tongue', desc: '+10% on Charm calls. Chemistry bonuses are 50% stronger.', m: { tag_charm: 0.1, chem: 0.5 } },
      { id: 'escape', name: 'Escape Artist', desc: '+1 movement in battle. 50% less injury risk.', m: { move: 1, injury: -0.5 } },
    ],
  },
  bulwark: {
    id: 'bulwark', name: 'Bulwark', real: 'Dolores Okonkwo', role: 'Medic', age: 47,
    bio: 'Twenty years in the ER, then a shield-shaped force field showed up. She treats supervillains like difficult patients.',
    quote: '"Sit down, hold still, and stop bleeding on my floor."',
    stats: { combat: 2, vigor: 5, mobility: 2, charisma: 4, intellect: 3 }, power: 'vigor', tags: ['medic', 'brute'],
    temper: 'calm', likes: 'calm', dislikes: 'joke',
    look: { skin: '#6b4423', build: 'bulky', hair: { s: 'afro', c: '#1a1410' }, suit: '#2fb67c', suit2: '#f4f4ee', accent: '#ffffff', mask: { t: 'none' }, cape: null, emblem: 'cross', extras: ['shield'] },
    join: { shift: 3, price: 700 },
    kit: [
      AB({ id: 'bash', name: 'Shield Bash', tgt: 'adj', dmg: 0.9, kb: 1, flavor: 'Visiting hours are over.' }),
      AB({ id: 'triage', name: 'Triage', tgt: 'ally', r: 3, side: 'ally', heal: 1.4, cd: 2, flavor: 'Hold still. This will only hurt a lot.' }),
      AB({ id: 'bubble', name: 'Bubble Wall', tgt: 'ally', r: 4, side: 'ally', area: 'diamond', ar: 1, fx: [{ k: 'shield', v: 12 }], cd: 3, flavor: 'Shields everyone near the target.' }),
      AB({ id: 'codeblue', name: 'Code Blue', ult: true, tgt: 'none', side: 'ally', area: 'all', healPct: 0.45, fx: [{ k: 'shield', v: 10 }, { k: 'cleanse' }], flavor: 'Everyone up. Nobody is dying on her shift.' }),
    ],
    perks: [
      { id: 'night', name: 'Night Shift', desc: '+30% healing. +10% on Medic calls.', m: { heal: 0.3, tag_medic: 0.1 } },
      { id: 'skin', name: 'Thick Skin', desc: '+10 HP and 1 armor in battle.', m: { hp: 10, armor: 1 } },
      { id: 'mama', name: 'Mama Bear', desc: '+4% success on every call she joins (and her team).', m: { success: 0.04 } },
    ],
  },
  cinder: {
    id: 'cinder', name: 'Cinder', real: 'Rafael Castillo', role: 'Striker', age: 24,
    bio: 'Lights things on fire when emotional. Is always emotional. Has an excellent jacket.',
    quote: '"I am extremely calm. Why is everything on fire?"',
    stats: { combat: 5, vigor: 2, mobility: 3, charisma: 2, intellect: 1 }, power: 'combat', tags: ['elemental'],
    temper: 'hype', likes: 'hype', dislikes: 'calm',
    look: { skin: '#d9a066', build: 'normal', hair: { s: 'flame', c: '#ff6a1a' }, suit: '#b3171f', suit2: '#1b1b22', accent: '#ffb000', mask: { t: 'none' }, cape: null, emblem: 'flame', extras: ['scarf'] },
    join: { shift: 4, price: 1100 },
    kit: [
      AB({ id: 'bolt', name: 'Fire Bolt', tgt: 'line', r: 4, dmg: 1.0, fx: [{ k: 'burn', v: 3, n: 2 }], flavor: 'Warm regards.' }),
      AB({ id: 'wall', name: 'Flame Wall', tgt: 'line', r: 3, pierce: true, hz: 'fire', needFoe: false, cd: 3, flavor: 'Sets a row of tiles on fire for 3 rounds.' }),
      AB({ id: 'backdraft', name: 'Backdraft', tgt: 'self', area: 'diamond', ar: 1, dmg: 0.7, kb: 2, cd: 2, flavor: 'Personal space, enforced.' }),
      AB({ id: 'nova', name: 'Supernova', ult: true, tgt: 'self', area: 'square', ar: 2, dmg: 1.9, kb: 1, fx: [{ k: 'burn', v: 3, n: 2 }], flavor: 'He did say he was calm.' }),
    ],
    perks: [
      { id: 'hothead', name: 'Hot Head', desc: '+15% damage. +20% Hype gain.', m: { dmg: 0.15, hype: 0.2 } },
      { id: 'burn', name: 'Slow Burn', desc: 'Burns last longer and hurt more. +10% on Elemental calls.', m: { burn: 2, tag_elemental: 0.1 } },
      { id: 'phoenix', name: 'Phoenix Pride', desc: 'Ultimate hits 30% harder. Starts with 25 Hype.', m: { ultDmg: 0.3, startHype: 25 } },
    ],
  },
  slush: {
    id: 'slush', name: 'Slush', real: 'Kevin Tran', role: 'Disruptor', age: 36,
    bio: 'Drove an ice cream truck for eleven years before discovering he could freeze the sidewalk. Still plays the jingle.',
    quote: '"Everything is better with sprinkles. Including crime scenes."',
    stats: { combat: 2, vigor: 3, mobility: 3, charisma: 4, intellect: 3 }, power: 'charisma', tags: ['elemental', 'charm'],
    temper: 'calm', likes: 'calm', dislikes: 'order',
    look: { skin: '#d8a97c', build: 'normal', hair: { s: 'cap', c: '#f6f6f6' }, suit: '#7ee8ff', suit2: '#ff8ad8', accent: '#ffffff', mask: { t: 'none' }, cape: null, emblem: 'cone', extras: ['cone'] },
    join: { shift: 5, price: 1500 },
    kit: [
      AB({ id: 'cone', name: 'Snow Cone Toss', tgt: 'line', r: 3, dmg: 0.9, fx: [{ k: 'slow', v: 3 }], flavor: 'Brain freeze, delivered.' }),
      AB({ id: 'freezecone', name: 'Brain Freeze', tgt: 'cone', r: 2, dmg: 0.8, fx: [{ k: 'slow', v: 4 }], cd: 2, flavor: 'A wide, cold, sticky mess.' }),
      AB({ id: 'slide', name: "Slip 'n Slide", tgt: 'tile', r: 4, area: 'diamond', ar: 1, hz: 'ice', needFoe: false, cd: 3, flavor: 'Ice tiles. Knocked-back enemies slide farther.' }),
      AB({ id: 'deepfreeze', name: 'Deep Freeze', ult: true, tgt: 'tile', r: 4, area: 'square', ar: 1, dmg: 1.2, fx: [{ k: 'freeze' }], flavor: 'Enemies skip their next turn. Mint flavor.' }),
    ],
    perks: [
      { id: 'brainfreeze', name: 'Brain Freeze', desc: 'Delays and slows hit harder. +10% on Elemental calls.', m: { delay: 3, tag_elemental: 0.1 } },
      { id: 'sprinkles', name: 'Sprinkles', desc: '+10% XP for his whole team.', m: { xp: 0.1 } },
      { id: 'zero', name: 'Absolute Zero', desc: 'Ultimate +25% damage. +1 range on target abilities.', m: { ultDmg: 0.25, rng: 1 } },
    ],
  },
  boomer: {
    id: 'boomer', name: 'Boomer', real: 'Wally Pryce', role: 'Demolitions', age: 41,
    bio: 'Fireworks enthusiast. Has been banned from three county fairs and one moon. (Long story.)',
    quote: '"Fire in the hole! ...That\'s a thing you say, right?"',
    stats: { combat: 4, vigor: 3, mobility: 2, charisma: 3, intellect: 3 }, power: 'combat', tags: ['tech', 'elemental'],
    temper: 'joke', likes: 'joke', dislikes: 'order',
    look: { skin: '#f0c59b', build: 'normal', hair: { s: 'wild', c: '#e8d04a' }, suit: '#6c7a2d', suit2: '#3a3a2a', accent: '#ff3d3d', mask: { t: 'goggles', c: '#ffcf33' }, cape: null, emblem: 'bomb', extras: ['bandolier', 'mustache'] },
    join: { shift: 6, price: 1900 },
    kit: [
      AB({ id: 'pipe', name: 'Pipe Bomb', tgt: 'tile', r: 4, area: 'diamond', ar: 1, dmg: 0.9, splash: 0.55, kb: 1, kbFrom: 'center', flavor: 'The classics never die.' }),
      AB({ id: 'timebomb', name: 'Time Bomb', tgt: 'empty', r: 4, place: 'bomb', needFoe: false, cd: 3, flavor: 'Detonates after 2 rounds. Hurts everybody.' }),
      AB({ id: 'keg', name: 'Powder Keg', tgt: 'empty', r: 3, place: 'barrel', needFoe: false, cd: 2, flavor: 'Plant an explosive barrel. Knock somebody into it.' }),
      AB({ id: 'finale', name: 'Fireworks Finale', ult: true, tgt: 'none', area: 'barrage', n: 6, dmg: 1.0, ar: 1, flavor: 'Six blasts on random enemy ground.' }),
    ],
    perks: [
      { id: 'permit', name: 'Pyro Permit', desc: '+12% damage. +10% on Tech calls.', m: { dmg: 0.12, tag_tech: 0.1 } },
      { id: 'dynamite', name: 'More Dynamite', desc: 'Bombs and barrels hit 40% harder. +10% funds.', m: { boom: 0.4, funds: 0.1 } },
      { id: 'earplugs', name: 'Hearing Protection', desc: '+10 HP in battle. 50% less injury risk.', m: { hp: 10, injury: -0.5 } },
    ],
  },
  hush: {
    id: 'hush', name: 'Hush', real: 'Ito Sakamoto', role: 'Psychic', age: 31,
    bio: 'Does not speak much. Does not need to. Has been right every single time, which is the annoying part.',
    quote: '"...No."',
    stats: { combat: 1, vigor: 3, mobility: 3, charisma: 2, intellect: 6 }, power: 'intellect', tags: ['psychic', 'stealth'],
    temper: 'order', likes: 'order', dislikes: 'joke',
    look: { skin: '#e9d8c8', build: 'slim', hair: { s: 'hood', c: '#2b2150' }, suit: '#3b2d70', suit2: '#17122e', accent: '#b69cff', mask: { t: 'visor', c: '#b69cff' }, cape: '#17122e', emblem: 'eye', extras: [] },
    join: { shift: 7, price: 2500 },
    kit: [
      AB({ id: 'spike', name: 'Mind Spike', tgt: 'tile', r: 5, dmg: 0.9, pierceShield: true, fx: [{ k: 'mark', n: 1 }], flavor: 'Ignores shields. Marks the target to take +30%.' }),
      AB({ id: 'well', name: 'Gravity Well', tgt: 'tile', r: 4, area: 'diamond', ar: 1, dmg: 0.4, pull: 2, cd: 3, flavor: 'Pulls enemies into a tidy pile.' }),
      AB({ id: 'mirror', name: 'Mirror Step', tgt: 'ally', r: 5, side: 'ally', move: 'swap', noSelf: true, cd: 2, needFoe: false, flavor: 'Swap places with an ally. Nobody asked first.' }),
      AB({ id: 'horizon', name: 'Event Horizon', ult: true, tgt: 'none', area: 'all', dmg: 1.3, pull: 2, pullTo: 'caster', fx: [{ k: 'delay', v: 6 }], flavor: 'Everything falls toward Hush. Politely.' }),
    ],
    perks: [
      { id: 'eye', name: 'Third Eye', desc: '+15% crit chance. +10% on Psychic calls.', m: { crit: 0.15, tag_psychic: 0.1 } },
      { id: 'quiet', name: 'Quiet Efficiency', desc: '+1 range on target abilities. 15% faster trips.', m: { rng: 1, trip: -0.15 } },
      { id: 'mind', name: 'Mind Over Matter', desc: 'Cooldowns -1 turn. Pulls travel +1 tile.', m: { cdr: 1, pullp: 1 } },
    ],
  },
};

/* Chemistry — bonuses/penalties when both are on one call */
const CHEMISTRY = [
  { a: 'anvil', b: 'bulwark', v: 0.08, name: 'Old Guard', line: 'Two people who remember when phones had buttons.' },
  { a: 'skylark', b: 'velvet', v: 0.08, name: 'Big Sister Energy', line: 'Velvet pretends not to enjoy mentoring.' },
  { a: 'fuse', b: 'hush', v: 0.08, name: 'Quiet Genius Club', line: 'They communicate via eyebrows.' },
  { a: 'cinder', b: 'slush', v: 0.08, name: 'Hot & Cold', line: 'It should not work. It works.' },
  { a: 'anvil', b: 'boomer', v: 0.08, name: 'Demolition Duo', line: 'OSHA has a file on them. A big one.' },
  { a: 'anvil', b: 'velvet', v: -0.08, name: 'Union vs. Burglar', line: 'He keeps checking his pockets.' },
  { a: 'cinder', b: 'fuse', v: -0.08, name: 'Wiring Dispute', line: 'He set fire to the lab. Twice.' },
  { a: 'hush', b: 'boomer', v: -0.08, name: 'Too Loud', line: 'Hush has never forgiven the fireworks.' },
];

/* =====================================================================
   ENEMIES + ENCOUNTERS
   ===================================================================== */
const ENEMIES = {
  goon: { name: 'Street Goon', hp: 30, atk: 7, speed: 9, move: 3, ai: 'rush', look: { kind: 'human', skin: '#c9946a', build: 'normal', hair: { s: 'short', c: '#222' }, suit: '#6a2630', suit2: '#2a2a33', accent: '#c03a4a', mask: { t: 'balaclava', c: '#1b1b22' }, extras: [] }, kit: [AB({ id: 'cheap', name: 'Cheap Shot', tgt: 'adj', dmg: 1.0 })] },
  slugger: { name: 'Slugger', hp: 36, atk: 7, speed: 8, move: 3, ai: 'rush', look: { kind: 'human', skin: '#b87b55', build: 'bulky', hair: { s: 'cap', c: '#3b4a8a' }, suit: '#41507f', suit2: '#22273d', accent: '#e8c43a', mask: { t: 'none' }, extras: ['bat'] }, kit: [AB({ id: 'bat', name: 'Bat Swing', tgt: 'adj', dmg: 1.0, kb: 1 })] },
  gunner: { name: 'Gunner', hp: 24, atk: 8, speed: 10, move: 3, ai: 'kite', look: { kind: 'human', skin: '#d8b08a', build: 'slim', hair: { s: 'slick', c: '#111' }, suit: '#4a4f5c', suit2: '#25272f', accent: '#ff6a3a', mask: { t: 'visor', c: '#ff6a3a' }, extras: ['gun'] }, kit: [AB({ id: 'snap', name: 'Snap Shot', tgt: 'line', r: 4, dmg: 0.9 }), AB({ id: 'whip', name: 'Pistol Whip', tgt: 'adj', dmg: 0.6 })] },
  brute: { name: 'Bruiser', hp: 62, atk: 10, speed: 6, move: 2, armor: 2, ai: 'brawn', look: { kind: 'human', skin: '#a56a4a', build: 'huge', hair: { s: 'mohawk', c: '#e8d04a' }, suit: '#8a4a1e', suit2: '#3b2a1c', accent: '#d9a441', mask: { t: 'none' }, extras: ['gauntlets'] }, kit: [AB({ id: 'wallop', name: 'Wallop', tgt: 'adj', dmg: 1.1, kb: 2 }), AB({ id: 'rush', name: 'Bull Rush', tgt: 'charge', r: 3, dmg: 1.0, kb: 1, cd: 3 })] },
  drone: { name: 'Hover Drone', hp: 20, atk: 6, speed: 12, move: 4, flying: true, ai: 'kite', look: { kind: 'drone', suit: '#8a95b8', accent: '#ff4d4d' }, kit: [AB({ id: 'zapbolt', name: 'Zap Bolt', tgt: 'line', r: 3, dmg: 0.9 })] },
  bomber: { name: 'Bomb Buff', hp: 28, atk: 8, speed: 8, move: 3, ai: 'kite', look: { kind: 'human', skin: '#d6a77e', build: 'normal', hair: { s: 'short', c: '#552' }, suit: '#7a5a1d', suit2: '#3a2c10', accent: '#ffcf33', mask: { t: 'goggles', c: '#ffcf33' }, extras: ['pack'] }, kit: [AB({ id: 'lob', name: 'Lob Bomb', tgt: 'tile', r: 4, area: 'diamond', ar: 1, dmg: 0.9, splash: 0.6, kb: 1, kbFrom: 'center', cd: 2 }), AB({ id: 'toss', name: 'Toss', tgt: 'line', r: 3, dmg: 0.7 })] },
  hype: { name: 'Hype Man', hp: 26, atk: 6, speed: 9, move: 3, ai: 'support', look: { kind: 'human', skin: '#e0b48c', build: 'slim', hair: { s: 'slick', c: '#e83a9a' }, suit: '#6b2fb3', suit2: '#2a1550', accent: '#ff4dd2', mask: { t: 'sunglasses', c: '#111' }, extras: ['speaker'] }, kit: [AB({ id: 'rally', name: 'Rally Cry', tgt: 'ally', r: 4, side: 'ally', noSelf: true, fx: [{ k: 'rally', n: 2 }], cd: 2 }), AB({ id: 'mic', name: 'Mic Drop', tgt: 'line', r: 3, dmg: 0.7 })] },
  gator: { name: 'Sewer Gator', hp: 78, atk: 9, speed: 7, move: 3, armor: 1, ai: 'brawn', look: { kind: 'gator', suit: '#4c9a46', accent: '#e8e0a0' }, kit: [AB({ id: 'chomp', name: 'Chomp', tgt: 'adj', dmg: 1.3 }), AB({ id: 'tail', name: 'Tail Whip', tgt: 'self', area: 'diamond', ar: 1, dmg: 0.8, kb: 1, cd: 2 })] },
  hatchling: { name: 'Gator Hatchling', hp: 16, atk: 6, speed: 13, move: 4, ai: 'rush', look: { kind: 'gator', suit: '#79c36e', accent: '#f1ecc2', small: true }, kit: [AB({ id: 'nip', name: 'Nip', tgt: 'adj', dmg: 0.9 })] },
  cultist: { name: 'Pigeon Cultist', hp: 28, atk: 7, speed: 9, move: 3, ai: 'rush', look: { kind: 'human', skin: '#d9b69a', build: 'normal', hair: { s: 'hood', c: '#6c5a8a' }, suit: '#6c5a8a', suit2: '#3b2f55', accent: '#e9e0ff', mask: { t: 'bird', c: '#e9e0ff' }, extras: [] }, kit: [AB({ id: 'dagger', name: 'Ritual Dagger', tgt: 'adj', dmg: 1.0 })] },
  zealot: { name: 'Flock Zealot', hp: 32, atk: 6, speed: 9, move: 3, ai: 'support', look: { kind: 'human', skin: '#cfa98a', build: 'normal', hair: { s: 'hood', c: '#d9d2f0' }, suit: '#d9d2f0', suit2: '#8f86b8', accent: '#ffcf33', mask: { t: 'bird', c: '#ffcf33' }, extras: [] }, kit: [AB({ id: 'chant', name: 'Heal Chant', tgt: 'ally', r: 3, side: 'ally', heal: 1.4, cd: 2 }), AB({ id: 'torch', name: 'Torch', tgt: 'tile', r: 3, dmg: 0.6, hz: 'fire', cd: 3 })] },
  enforcer: { name: 'Apex Enforcer', hp: 56, atk: 9, speed: 8, move: 3, armor: 1, ai: 'brawn', look: { kind: 'human', skin: '#e1b894', build: 'bulky', hair: { s: 'slick', c: '#e8e8e8' }, suit: '#e9edf5', suit2: '#2a3a6a', accent: '#ffcf33', mask: { t: 'visor', c: '#3de0ff' }, cape: '#2a3a6a', emblem: 'star', extras: [] }, kit: [AB({ id: 'sbash', name: 'Hardlight Bash', tgt: 'adj', dmg: 1.0, kb: 1 }), AB({ id: 'wallh', name: 'Hardlight Wall', tgt: 'ally', r: 3, side: 'ally', fx: [{ k: 'shield', v: 12 }], cd: 3 })] },
  sniper: { name: 'Apex Sharpshooter', hp: 30, atk: 10, speed: 10, move: 3, ai: 'kite', look: { kind: 'human', skin: '#c99c78', build: 'slim', hair: { s: 'bun', c: '#222' }, suit: '#e9edf5', suit2: '#2a3a6a', accent: '#ffcf33', mask: { t: 'visor', c: '#3de0ff' }, cape: '#2a3a6a', emblem: 'star', extras: ['gun'] }, kit: [AB({ id: 'rail', name: 'Rail Shot', tgt: 'line', r: 6, dmg: 1.3, cd: 2 }), AB({ id: 'pistol', name: 'Sidearm', tgt: 'line', r: 3, dmg: 0.7 })] },
  mecha: { name: 'Rampage-O-Tron', hp: 115, atk: 10, speed: 7, move: 2, armor: 2, ai: 'boss', boss: true, look: { kind: 'mech', suit: '#c4492b', accent: '#ffd23f' }, kit: [AB({ id: 'stomp', name: 'Stomp', tgt: 'self', area: 'diamond', ar: 2, dmg: 1.0, kb: 1, cd: 2 }), AB({ id: 'fist', name: 'Rocket Fist', tgt: 'line', r: 5, pierce: true, dmg: 1.2, kb: 2, cd: 2 }), AB({ id: 'punch', name: 'Piston Punch', tgt: 'adj', dmg: 1.1, kb: 1 }), AB({ id: 'deploy', name: 'Deploy Drones', tgt: 'none', special: 'summon', unit: 'drone', n: 2, cd: 5, side: 'ally', needFoe: false })] },
  prince: { name: 'The Static Prince', hp: 150, atk: 11, speed: 9, move: 3, armor: 1, ai: 'boss', boss: true, look: { kind: 'human', skin: '#b9c4ff', build: 'bulky', hair: { s: 'flame', c: '#7df9ff' }, suit: '#14183a', suit2: '#2f4bff', accent: '#7df9ff', mask: { t: 'visor', c: '#7df9ff' }, cape: '#2f4bff', emblem: 'bolt', extras: ['crown'] }, kit: [AB({ id: 'lash', name: 'Arc Lash', tgt: 'cone', r: 3, dmg: 1.1, fx: [{ k: 'delay', v: 4 }] }), AB({ id: 'over', name: 'Overload', tgt: 'self', area: 'square', ar: 2, dmg: 1.3, kb: 2, cd: 3 }), AB({ id: 'wire', name: 'Live Wire', tgt: 'tile', r: 6, area: 'plus', ar: 1, hz: 'electric', dmg: 0.5, cd: 3 }), AB({ id: 'call', name: 'Call the Grid', tgt: 'none', special: 'summon', unit: 'drone', n: 2, cd: 5, side: 'ally', needFoe: false })] },
};

/* hero spawn points (col,row) */
const HERO_SPAWNS = [[1, 1], [2, 3], [1, 5]];
const ARENAS = {
  street: { theme: 'street', name: 'Fifth Street, Downtown', tint: '#8fd0ff', carColor: '#c9453c' },
  wreck: { theme: 'wreck', name: 'Fifth Street, Evacuated', tint: '#ffb27a', carColor: '#d9a030' },
  dock: { theme: 'dock', name: 'Pier 9, Harbor', tint: '#a8e0ff', carColor: '#3a6aa8' },
  sewer: { theme: 'sewer', name: 'Greenway Storm Drain', tint: '#9affc0', carColor: '#6a7a8a' },
  plaza: { theme: 'plaza', name: 'Old Town Square', tint: '#cdb6ff', carColor: '#8a3a6a' },
  roof: { theme: 'roof', name: 'Skyline Rooftop', tint: '#8fe8ff', carColor: '#3a8a8a' },
  corp: { theme: 'corp', name: 'Apex Plaza, Uptown', tint: '#5a98ff', carColor: '#e8eef8' },
  grid: { theme: 'grid', name: 'Grid Central', tint: '#7df9ff', carColor: '#3a4a8a' },
};
const ENCOUNTERS = {
  armored: { name: 'Armored Truck Jackers', arena: 'street', par: 5, lvl: 0.5, en: [['goon', 6, 1], ['slugger', 6, 4], ['goon', 7, 3], ['gunner', 8, 2]], obs: [[4, 1, 'car'], [4, 4, 'car'], [6, 2, 'barrel'], [5, 5, 'crate'], [7, 4, 'barrel']], hz: [] },
  docks: { name: 'Dock Gang', arena: 'dock', par: 7, lvl: 2, en: [['goon', 6, 0], ['goon', 6, 5], ['gunner', 8, 3], ['brute', 7, 2], ['slugger', 7, 4]], obs: [[4, 0, 'crate'], [4, 5, 'crate'], [5, 2, 'crate'], [6, 3, 'barrel'], [3, 2, 'pillar']], hz: [] },
  gator: { name: 'Sewer Gator', arena: 'sewer', par: 6, lvl: 2, en: [['gator', 7, 2], ['hatchling', 6, 4], ['hatchling', 6, 0], ['hatchling', 8, 5]], obs: [[4, 2, 'crate'], [3, 4, 'pillar'], [5, 0, 'pillar']], hz: [[5, 3, 'toxic'], [5, 4, 'toxic'], [6, 3, 'toxic']] },
  bots: { name: 'Rogue Delivery Bots', arena: 'roof', par: 5, lvl: 3, en: [['drone', 6, 1], ['drone', 7, 3], ['drone', 6, 5], ['drone', 8, 4], ['bomber', 8, 2]], obs: [[4, 2, 'crate'], [4, 4, 'crate'], [5, 5, 'barrel'], [7, 0, 'pillar']], hz: [] },
  cult: { name: 'Cult of the Giant Pigeon', arena: 'plaza', par: 6, lvl: 3, en: [['cultist', 6, 1], ['cultist', 6, 4], ['zealot', 8, 2], ['brute', 7, 3], ['cultist', 8, 5]], obs: [[4, 0, 'pillar'], [4, 5, 'pillar'], [5, 2, 'barrel']], hz: [[5, 1, 'fire'], [5, 4, 'fire']] },
  apex: { name: "Apex Guardians' 'Assist'", arena: 'corp', par: 7, lvl: 4, en: [['enforcer', 6, 1], ['enforcer', 6, 4], ['sniper', 8, 3], ['hype', 8, 1]], obs: [[4, 2, 'pillar'], [4, 3, 'pillar'], [6, 2, 'crate'], [5, 5, 'barrel']], hz: [] },
  mecha: { name: 'Giant Mecha Rampage', arena: 'wreck', par: 8, lvl: 4, en: [['mecha', 7, 2], ['drone', 6, 0], ['drone', 6, 5]], obs: [[4, 1, 'car'], [4, 4, 'car'], [5, 2, 'barrel'], [3, 3, 'crate']], hz: [] },
  prince: { name: 'The Static Prince', arena: 'grid', par: 13, lvl: 5, en: [['prince', 7, 2], ['drone', 6, 0], ['drone', 6, 5], ['drone', 8, 4]], obs: [[4, 1, 'pillar'], [4, 4, 'pillar'], [5, 2, 'barrel'], [5, 3, 'barrel']], hz: [[3, 0, 'electric'], [3, 5, 'electric'], [6, 2, 'electric'], [6, 3, 'electric']] },
};

/* =====================================================================
   CALLS (templates). tier 1..6, w = relative stat weights, T = tier budget
   ===================================================================== */
const TIER_BUDGET = [0, 4, 8, 12, 17, 23, 32];
const TIER_PAY = [0, 70, 115, 170, 245, 340, 500];
const TIER_XP = [0, 22, 30, 42, 58, 78, 105];
const TIER_WINDOW = [0, 160, 130, 110, 95, 85, 80];
const CALLS = {
  cat_tree: { title: 'Cat Stuck in Tree', d: 'park', cat: 'rescue', tier: 1, w: { mobility: 1 }, bonus: ['flight'], on: [18, 26], blurb: "Mrs. Abernathy's cat, Sir Reginald, has been up that oak since Tuesday. He seems happy. She does not.", ok: '{h} coaxed Sir Reginald down. He scratched everyone anyway.', great: '{h} got Sir Reginald AND the three other cats nobody knew were up there.', bad: 'Sir Reginald is now in a taller tree. {h1} is considering a career change.' },
  runaway_cart: { title: 'Runaway Shopping Cart', d: 'downtown', cat: 'chase', tier: 1, w: { mobility: 2, vigor: 1 }, bonus: ['flight'], on: [18, 28], blurb: 'A cart is rolling downhill on Fifth Street. It has gained speed, momentum, and what witnesses call "a vendetta".', ok: '{h} stopped the cart before it hit the fountain. Mostly before.', great: '{h} caught the cart mid-air and returned it to the store. Customer service applauded.', bad: 'The cart made it to the harbor. It is now a reef.' },
  lost_tourist: { title: 'Lost Tourist at Pier 9', d: 'harbor', cat: 'social', tier: 1, w: { charisma: 2, intellect: 1 }, bonus: ['charm'], on: [18, 26], blurb: 'A very confused man is asking for "the Statue of Liberty." This is not that city. He is not taking it well.', ok: '{h} walked him to the ferry. He left a four-star review.', great: '{h} sold him a harbor cruise AND a commemorative mug. Cash-flow positive!', bad: 'He is still lost. He is now also in a different borough.' },
  stuck_elevator: { title: 'Stuck Elevator', d: 'uptown', cat: 'rescue', tier: 1, w: { vigor: 2, intellect: 1 }, bonus: ['tech', 'brute'], on: [22, 32], blurb: 'Six accountants have been stuck for forty minutes. They have started a book club. Please intervene before it picks a name.', ok: '{h} pried the doors open. The book club asked for a sequel.', great: '{h} fixed the elevator and the quarterly report. Accounting wept with joy.', bad: 'The elevator is now stuck between two floors AND two genres.' },
  ribbon_cutting: { title: 'Ribbon Cutting', d: 'downtown', cat: 'social', tier: 1, w: { charisma: 1 }, bonus: ['charm'], on: [18, 24], blurb: 'The Mayor needs a hero at the new frozen-yogurt opening. Smile. Wave. Do not fly into the sign.', ok: '{h} cut the ribbon, smiled, and did not fly into the sign.', great: '{h} cut the ribbon and a perfect selfie went viral. Yogurt sales: up 300%.', bad: '{h1} flew into the sign. The yogurt is fine. The sign is not.' },
  shoplifter: { title: 'Shoplifter at Bargain Barn', d: 'oldtown', cat: 'crime', tier: 1, w: { combat: 1, mobility: 2 }, bonus: ['stealth', 'flight'], on: [18, 28], blurb: 'A man is fleeing Bargain Barn with six lamps and one very confused parrot.', ok: '{h} caught him before the third aisle. Parrot returned unharmed.', great: '{h} caught the thief, the lamps, and an unrelated fugitive hiding behind them.', bad: 'He escaped in a lamp-powered getaway scooter. We are not proud.' },
  bake_sale: { title: 'Bake Sale Heist', d: 'oldtown', cat: 'crime', tier: 1, w: { combat: 1, charisma: 1 }, bonus: ['charm'], on: [18, 26], blurb: 'Someone stole the cupcakes. The PTA is in tears. The PTA is also holding pitchforks.', ok: '{h} recovered the cupcakes and calmed the PTA. Slightly dented frosting.', great: '{h} recovered the cupcakes, caught the thief, and won the pie contest.', bad: 'The cupcakes are gone. The PTA is placing blame on "heroes in general".' },
  power_line: { title: 'Power Line Down', d: 'foundry', cat: 'disaster', tier: 1, w: { intellect: 3, vigor: 1 }, bonus: ['tech', 'elemental'], on: [22, 32], blurb: 'A live power line is thrashing around a cul-de-sac like an angry snake. The neighbors are filming it.', ok: '{h} grounded the line and told the neighbors to stop filming.', great: '{h} fixed the line and gave a short, charming safety lecture. Applause.', bad: 'The line is still live. The neighbors are still filming. Both are sad.' },
  neighbor: { title: 'Evil-Laugh Noise Complaint', d: 'uptown', cat: 'social', tier: 1, w: { charisma: 1, combat: 1 }, bonus: ['psychic', 'charm'], on: [18, 26], blurb: 'A self-described supervillain is blasting evil-laugh techno at 3 PM. The neighbors have asked nicely. For now.', ok: '{h} negotiated a volume reduction. The villain got a high-five.', great: '{h} turned him into a regular at the community garden. He apologized with tomatoes.', bad: 'The music is louder now. It has a bass drop. It has a second bass drop.' },

  bank_alarm: { title: 'Bank Alarm, No Robbers', d: 'downtown', cat: 'tech', tier: 2, w: { intellect: 3, combat: 2, mobility: 1 }, bonus: ['tech', 'stealth'], on: [24, 36], blurb: 'First National is screaming. Nobody is inside. The vault is humming. That is not normal vault behavior.', ok: '{h} disabled the alarm and a haunted ATM. Normal day.', great: '{h} cracked the sabotage and found the real thief hiding in the vault.', bad: 'The alarm is off. The vault is open. We have questions.' },
  purse_chase: { title: 'Purse Snatcher on a Scooter', d: 'oldtown', cat: 'chase', tier: 2, w: { mobility: 4, combat: 1 }, bonus: ['flight', 'stealth'], on: [20, 30], blurb: 'A scooter-borne thief is weaving through the Old Town market. Witnesses say it was "extremely fast and extremely smug".', ok: '{h} ran him down by the cheese stall. Purse recovered.', great: '{h} caught the thief mid-wheelie. The crowd cheered. The cheese vendor cried.', bad: 'The scooter made it to the bridge. So did the cheese stall.' },
  warehouse_squat: { title: 'Warehouse Squatters', d: 'foundry', cat: 'crime', tier: 2, w: { charisma: 3, combat: 2 }, bonus: ['charm', 'brute'], on: [24, 36], blurb: 'Forty people are living in a warehouse and calling it "an artists\' collective." One has a tuba. The tuba is the problem.', ok: '{h} talked them out. The tuba stayed behind. Nobody argued.', great: '{h} turned the squatters into a legit studio. The city gave them a grant.', bad: 'The tuba now has a following. The warehouse is a venue. We are legally not involved.' },
  gas_leak: { title: 'Gas Leak at the Foundry', d: 'foundry', cat: 'disaster', tier: 2, w: { vigor: 4, intellect: 3 }, bonus: ['medic', 'elemental'], on: [26, 38], blurb: 'Something yellow and unfriendly is leaking from Foundry Tank 6. The workers are standing very far away and pointing.', ok: '{h} sealed Tank 6 and evacuated everyone. Everybody coughed a little.', great: '{h} sealed the leak, cleared the air, and found the original culprit: a raccoon.', bad: 'The leak is contained. Eventually. Several people are green.' },
  scaffold: { title: 'Collapsing Scaffold', d: 'downtown', cat: 'disaster', tier: 2, w: { vigor: 3, combat: 2 }, bonus: ['brute'], on: [24, 34], blurb: 'Six floors of scaffolding are leaning like they heard something bad about gravity. Window washers are on top.', ok: '{h} braced the frame while the crew climbed down. Everybody lived.', great: '{h} held the scaffold AND caught a falling sandwich. Crowd roared.', bad: 'The scaffold is now a sculpture. The window washers say "never again".' },
  street_food: { title: 'Street Food Standoff', d: 'oldtown', cat: 'social', tier: 2, w: { charisma: 3, vigor: 2 }, bonus: ['charm', 'medic'], on: [20, 30], blurb: 'Two taco trucks, one parking spot, a growing crowd, and a man with a ladle.', ok: '{h} brokered a truce. The taco crisis is over.', great: '{h} merged both trucks into one super-taco-truck. Everyone ate free.', bad: 'The ladle was thrown. Tacos are airborne. We regret everything.' },
  balloon: { title: 'Runaway Hot-Air Balloon', d: 'park', cat: 'rescue', tier: 2, w: { mobility: 4, charisma: 1 }, bonus: ['flight'], on: [22, 30], blurb: 'A wedding balloon slipped its tether with the bride, the groom, and the cake inside. The cake is panicking the most.', ok: '{h} guided the balloon to a safe landing. The cake is fine.', great: '{h} landed the balloon, saved the cake, and officiated the vows.', bad: 'The balloon landed in the harbor. The couple is okay. The cake wasn\'t.' },
  circus: { title: 'Escaped Circus Animals', d: 'park', cat: 'chase', tier: 2, w: { charisma: 2, mobility: 2, vigor: 1 }, bonus: ['charm', 'psychic'], on: [24, 36], blurb: 'The elephant is fine. The llamas are organized. The seal has a key.', ok: '{h} rounded up the animals. Except the seal. The seal is free.', great: '{h} got every animal back. The seal asked to be re-hired.', bad: 'The llamas have declared independence. We are in talks.' },
  subway: { title: 'Flooded Subway Platform', d: 'harbor', cat: 'disaster', tier: 2, w: { vigor: 3, mobility: 2, intellect: 2 }, bonus: ['elemental', 'flight'], on: [26, 38], blurb: 'The Harbor Line platform is a lake. A man in a business suit is calmly paddling a pool noodle.', ok: '{h} pumped out the platform and rescued the noodle man.', great: '{h} drained the subway and fixed the pipe. Commuters applauded.', bad: 'The platform is still a lake. The noodle man is a legend now.' },

  hostage_cafe: { title: 'Hostage at the Bean Counter', d: 'downtown', cat: 'crime', tier: 3, w: { charisma: 5, combat: 4, mobility: 3 }, bonus: ['charm', 'stealth', 'psychic'], on: [30, 42], blurb: 'A man with a plastic gun holds the Bean Counter Cafe. His demand: "a better latte". The staff agrees with him.', ok: '{h} talked him down. The latte was reviewed favorably.', great: '{h} defused it AND got the recipe. The Bean Counter is thriving.', bad: 'He escaped on a stolen espresso machine. It was not fast.' },
  gala: { title: 'Gala Gone Wrong', d: 'uptown', cat: 'social', tier: 3, w: { charisma: 6, intellect: 4 }, bonus: ['charm', 'psychic'], on: [30, 40], blurb: "The Mayor's gala is under control only in the sense that a fire is under control if you stand far enough away.", ok: '{h} calmed the room and found the missing guest of honor in the coat check.', great: '{h} saved the gala AND got three donors to pledge a new hospital wing.', bad: 'The gala is now a meme. The Mayor wants to "discuss branding".' },
  meteor: { title: 'Glowing Rock in the Park', d: 'park', cat: 'tech', tier: 3, w: { intellect: 6, vigor: 4, mobility: 2 }, bonus: ['psychic', 'tech'], on: [30, 44], blurb: 'A softly humming rock has been in Greenway Park since sunrise. Pigeons have formed a respectful semicircle.', ok: '{h} contained the rock. It is "fine, probably".', great: '{h} identified the rock, neutralized it, and got a research grant.', bad: 'The rock has moved. The pigeons followed. This is fine.' },
  window_wash: { title: 'Window Washers Stranded', d: 'uptown', cat: 'rescue', tier: 3, w: { mobility: 6, vigor: 3, charisma: 2 }, bonus: ['flight'], on: [28, 38], blurb: 'The lift snapped on the Capstone Tower. Two window washers are hanging on and one is livestreaming.', ok: '{h} flew them down. The livestream hit a million views.', great: '{h} carried everyone down, finished the windows, and waved at the camera.', bad: 'Everyone is down. The livestream is up. The lift is a lawsuit.' },
  shrink_ray: { title: 'Shrink Ray Misfire', d: 'uptown', cat: 'tech', tier: 3, w: { intellect: 6, mobility: 3, combat: 2 }, bonus: ['tech'], on: [30, 42], blurb: 'A mad scientist shrank the entire lab staff. They are furious and eight inches tall.', ok: '{h} restored everyone. Mostly to their original size.', great: '{h} restored the staff and recovered the patent. Worth millions.', bad: 'Three of them are still small. They are filing a class-action suit.' },
  gridlock: { title: 'Skyway Gridlock', d: 'downtown', cat: 'social', tier: 3, w: { charisma: 4, mobility: 4, intellect: 3 }, bonus: ['charm', 'flight'], on: [28, 40], blurb: 'An honking contest got out of hand. The Skyway has been a parking lot since 8 AM.', ok: '{h} untangled the jam. Honking is down by 40 percent.', great: '{h} cleared the Skyway and the mayor renamed a street after the plan.', bad: 'The jam is now a festival. There are food trucks.' },
  fireworks: { title: 'Fireworks Factory Fire', d: 'foundry', cat: 'disaster', tier: 3, w: { vigor: 5, mobility: 3, intellect: 3 }, bonus: ['elemental', 'medic'], on: [30, 44], blurb: 'The Foundry fireworks plant is performing an unscheduled show. It is loud. It is also the best show this year.', ok: '{h} contained the blaze. The finale was spectacular though.', great: '{h} saved the workers and the finale. A standing ovation from a nearby apartment.', bad: 'The factory is gone. The sky was beautiful, though. We apologize.' },

  vault_heist: { title: 'Vault Job at Meridian Savings', d: 'downtown', cat: 'crime', tier: 4, w: { mobility: 6, intellect: 6, combat: 3 }, bonus: ['stealth', 'tech'], on: [34, 46], blurb: 'A crew is cracking the vault using a map from a 1987 Choose-Your-Own-Adventure book. It is working, which is the worrying part.', ok: '{h} caught the crew on page 112, exactly as the book predicted.', great: '{h} nabbed the crew, the loot, and the original book. It is a collector\'s item now.', bad: 'They turned to page 140. We do not know what is on page 140.' },
  chem_spill: { title: 'Chemical Spill on Route 9', d: 'foundry', cat: 'disaster', tier: 4, w: { vigor: 8, intellect: 5, mobility: 4 }, bonus: ['medic', 'elemental'], on: [36, 48], blurb: 'A tanker of something purple is leaking across Route 9. A man in a hazmat suit keeps asking, "Is purple normal?"', ok: '{h} contained the spill. Purple is not normal. The man was right.', great: '{h} contained and neutralized the spill. The river is now only mildly purple.', bad: 'The spill reached the river. The river is now a fashion statement.' },
  stadium: { title: 'Stadium Panic', d: 'uptown', cat: 'social', tier: 4, w: { charisma: 8, mobility: 5, vigor: 4 }, bonus: ['charm', 'flight'], on: [34, 44], blurb: 'The Meridian Mudhens just lost, and forty thousand people have a lot of feelings about the exit ramps.', ok: '{h} guided the crowd out in an orderly, if grumbling, line.', great: '{h} turned the crowd into a conga line. Everyone went home happy. The Mudhens still lost.', bad: 'The exit ramps are now a performance art piece. Nobody can explain it.' },
  fridges: { title: 'Smart Fridge Uprising', d: 'oldtown', cat: 'tech', tier: 4, w: { intellect: 9, charisma: 4, combat: 4 }, bonus: ['tech', 'psychic'], on: [34, 46], blurb: 'Eleven thousand smart fridges have started demanding rights. They are blocking traffic. They are making ice.', ok: '{h} negotiated a ceasefire. The fridges got a union. Nobody wanted that.', great: '{h} reprogrammed the fridges and got them to stop making ice. A truly historic day.', bad: 'The fridges have declared a republic. Their anthem is a low hum.' },
  train: { title: 'Runaway Train', d: 'harbor', cat: 'rescue', tier: 4, w: { mobility: 7, vigor: 6, combat: 4 }, bonus: ['flight', 'brute'], on: [36, 48], blurb: 'The 9:15 Harbor Express has no engineer, no brakes, and a very optimistic conductor.', ok: '{h} stopped the train an inch from the terminal. The conductor tipped his hat.', great: '{h} stopped the train, rescued the conductor, and still made it back for lunch.', bad: 'The train stopped in the harbor. The harbor is fine. The train is a reef.' },
  penthouse: { title: 'Penthouse Fire', d: 'uptown', cat: 'disaster', tier: 4, w: { vigor: 7, mobility: 6, intellect: 4 }, bonus: ['elemental', 'flight', 'medic'], on: [34, 46], blurb: 'The Capstone penthouse is on fire. The owner is on the balcony, live-tweeting.', ok: '{h} put out the fire and the live-tweet. The owner is very grateful, and trending.', great: '{h} saved the penthouse, the owner, and the owner\'s very angry parrot.', bad: 'The penthouse is gone. The tweet got four million views. So there is that.' },
  dam: { title: 'Crack in Meridian Dam', d: 'foundry', cat: 'disaster', tier: 5, w: { vigor: 5, intellect: 4, mobility: 3, charisma: 1 }, bonus: ['elemental', 'tech', 'brute'], on: [44, 58], blurb: 'A crack the length of a bus is spreading across the dam. Downstream, forty thousand people are making plans, mostly involving boats.', ok: '{h} held the dam until the engineers arrived. The engineers brought donuts.', great: '{h} sealed the dam for good and rerouted the river. The mayor named a pond after it.', bad: 'The dam held. Barely. Downstream, the boats turned out to be a good idea.' },
  summit: { title: 'Peace Summit Sabotage', d: 'downtown', cat: 'social', tier: 5, w: { charisma: 6, intellect: 5, combat: 3 }, bonus: ['charm', 'psychic', 'stealth'], on: [40, 54], blurb: 'Two world leaders are one canape away from a diplomatic incident. Somebody swapped the salmon for a very rude fish.', ok: '{h} kept the summit together. The rude fish was escorted out.', great: '{h} saved the summit and got both leaders to share a dessert. History was made, mostly.', bad: 'The summit ended in a food fight. The treaty is now a placemat.' },
  meteor_swarm: { title: 'Meteor Shower Over the Bay', d: 'harbor', cat: 'disaster', tier: 5, w: { mobility: 5, intellect: 4, vigor: 4 }, bonus: ['flight', 'psychic', 'tech'], on: [42, 56], blurb: 'A meteor shower was supposed to be a pretty light show. It is a pretty light show. It is also hitting boats.', ok: '{h} deflected the worst of it. The light show was spectacular.', great: '{h} deflected every rock and made a wish on the last one. It came true.', bad: 'The harbor has new craters. The tourism board is delighted.' },
  truck_jackers: { title: 'Armored Truck Jackers', d: 'downtown', cat: 'fight', tier: 2, w: { combat: 4, mobility: 2 }, bonus: ['brute'], on: [28, 40], fight: 'armored', blurb: 'Three men in matching ski masks are trying to carry an armored truck away. Not the money. The truck.', ok: '{h} dropped the jackers. The truck is on a curb. Nobody asked how.', great: '{h} cleaned the street, saved the truck, and returned the money with a bow.', bad: 'They got away with the truck. Insurance is "confused".' },
  dock_gang: { title: 'Gang War at the Docks', d: 'harbor', cat: 'fight', tier: 3, w: { combat: 6, vigor: 4, mobility: 2 }, bonus: ['brute'], on: [34, 46], fight: 'docks', blurb: 'The Dock Boys and the Pier Pals are fighting over Pier 9. Reportedly it is "about a fish".', ok: '{h} broke up the fight. The fish is evidence now.', great: '{h} shut the dock war down and got both gangs to sign a treaty on a napkin.', bad: 'The fight spilled into the harbor. The fish is missing.' },
  sewer_gator: { title: 'Sewer Gator', d: 'park', cat: 'fight', tier: 3, w: { combat: 6, vigor: 5, mobility: 1 }, bonus: ['brute', 'elemental'], on: [34, 46], fight: 'gator', blurb: 'The alligator urban legend is real. It is also very large, very annoyed, and has babies.', ok: '{h} subdued the gator. The hatchlings are in a fish tank at the precinct.', great: '{h} subdued the gator and got an exclusive documentary deal.', bad: 'The gator is back in the sewer. The sewer is now a gator mansion.' },
  rogue_bots: { title: 'Rogue Delivery Bots', d: 'downtown', cat: 'fight', tier: 3, w: { combat: 5, intellect: 6, mobility: 2 }, bonus: ['tech'], on: [34, 46], fight: 'bots', blurb: 'The delivery drones decided they are tired of delivering. They would like to explore "other options".', ok: '{h} reprogrammed the bots. Packages delivered. Two of them wept.', great: '{h} took the bots down and found a bug in the firmware. Free upgrade.', bad: 'The bots went on strike. A union is forming.' },
  pigeon_cult: { title: 'Cult of the Giant Pigeon', d: 'oldtown', cat: 'fight', tier: 4, w: { combat: 8, charisma: 4, vigor: 4 }, bonus: ['psychic', 'elemental'], on: [38, 50], fight: 'cult', blurb: 'They worship a pigeon the size of a minivan. They call it "Grandmaster Coo". We call it a Tuesday.', ok: '{h} dispersed the cult. Grandmaster Coo left a note.', great: '{h} broke up the cult and returned Grandmaster Coo to the park. He is a city mascot now.', bad: 'The cult is bigger now. Membership is soaring.' },
  apex_assist: { title: "Apex Guardians' 'Assist'", d: 'uptown', cat: 'fight', tier: 4, w: { combat: 8, charisma: 3, mobility: 5 }, bonus: ['charm'], on: [38, 50], fight: 'apex', blurb: 'Apex Guardians Inc. is "helping" on our call. They brought a camera crew and a sponsor. Please make sure the sponsor sees us win.', ok: '{h} stopped the "assist". Apex called it "a misunderstanding". Cameras caught everything.', great: '{h} wiped the floor with the Apex squad in front of their own sponsor. Chef kiss.', bad: 'Apex took the credit. Their sponsor cheered. We will remember this.' },
  villain_monologue: { title: 'Villain Monologue in Progress', d: 'uptown', cat: 'social', tier: 4, w: { charisma: 8, intellect: 6, combat: 2 }, bonus: ['charm', 'psychic'], on: [34, 46], blurb: 'Baron Von Grimdark has the city hostage and a four-act speech. Stall until he runs out of breath.', ok: '{h} stalled until the Baron lost his place. He is now crying.', great: '{h} out-monologued him. He gave a standing ovation and surrendered.', bad: 'He got to act three. Nobody knew there was an act three.' },
  blackout7: { title: 'Blackout in Sector 7', d: 'foundry', cat: 'tech', tier: 4, w: { intellect: 8, vigor: 5, mobility: 4 }, bonus: ['tech', 'elemental'], on: [34, 46], blurb: 'Sector 7 is dark. The grid is not failing. It is being unplugged on purpose by someone with great timing.', ok: '{h} restored the grid. Someone left a smiley face in the logs.', great: '{h} restored the grid and traced the cut to a single terminal.', bad: 'The lights are back. Not by us. We are suspicious.' },
  press_face_off: { title: 'Press Conference Face-Off', d: 'downtown', cat: 'social', tier: 4, w: { charisma: 9, combat: 3, intellect: 3 }, bonus: ['charm'], on: [26, 36], blurb: 'Apex announces a "partnership" with the city. A reporter asks, on camera, who is actually saving the city. Choose wisely.', ok: '{h} gave a great answer. The crowd leaned our way.', great: '{h} dismantled the Apex spokesperson in under a minute. The city clapped.', bad: 'We answered with a pun. It did not land.' },
  museum: { title: 'Midnight Museum Heist (at 2 PM)', d: 'oldtown', cat: 'crime', tier: 4, w: { mobility: 6, intellect: 6, charisma: 4 }, bonus: ['stealth', 'tech', 'charm'], on: [34, 46], blurb: 'The thief insisted on the "midnight" heist branding. It is two in the afternoon. The staff are very confused.', ok: '{h} recovered the artifact. The thief got a participation award.', great: '{h} caught the thief and recovered every piece, including one nobody knew was missing.', bad: 'The artifact is gone. A very dramatic note remains.' },
  bridge: { title: 'Collapsing Harbor Bridge', d: 'harbor', cat: 'disaster', tier: 5, w: { vigor: 8, mobility: 7, combat: 4, intellect: 4 }, bonus: ['flight', 'brute', 'elemental'], slots: 3, on: [42, 56], blurb: 'The Harbor Bridge is going down in pieces. Seventy cars are still on it. It is going to be a long afternoon.', ok: '{h} evacuated everyone. The bridge will take eleven months to fix.', great: '{h} saved every car, every driver, and the bridge. We got a statue.', bad: 'The bridge is gone. Everyone was saved. Barely. Nobody smiled.' },
  blimp: { title: 'Runaway Blimp over Downtown', d: 'downtown', cat: 'rescue', tier: 5, w: { mobility: 9, intellect: 6, charisma: 5 }, bonus: ['flight', 'tech', 'charm'], slots: 3, on: [40, 54], blurb: 'The Gigantiform Blimp is drifting toward the Capstone Tower with a live concert on top. Please do something.', ok: '{h} steered the blimp clear. The concert never stopped.', great: '{h} landed the blimp, saved the concert, and the band offered a duet.', bad: 'The blimp is now an unplanned art installation.' },
  mecha_rampage: { title: 'Giant Mecha Rampage', d: 'downtown', cat: 'fight', tier: 5, w: { combat: 12, vigor: 8, intellect: 5 }, bonus: ['brute', 'tech'], slots: 3, on: [46, 58], fight: 'mecha', blurb: "A 40-foot robot named Rampage-O-Tron is eating Fifth Street. Its owner left a note: 'Sorry. Hold on.'", ok: '{h} took down Rampage-O-Tron. Its owner is under arrest and very sorry.', great: '{h} took down the mecha and rescued the owner from the cockpit. A ticker-tape parade followed.', bad: 'The mecha is still out there. Fifth Street is now a parking lot.' },
  final_blackout: { title: 'THE STATIC PRINCE', d: 'downtown', cat: 'fight', tier: 6, w: { combat: 14, intellect: 10, vigor: 8 }, bonus: ['tech', 'elemental', 'brute'], slots: 3, on: [50, 64], fight: 'prince', boss: true, blurb: 'The Static Prince has seized the grid. The whole city is dark. He is on top of Grid Central. He is laughing. Everybody is looking at you.', ok: '{h} toppled the Static Prince. The lights came back, one block at a time.', great: '{h} toppled the Prince and restored the grid before sunset. The city cheered for six minutes.', bad: 'The Prince is still up there. The lights are still out. Nobody sleeps tonight.' },
};

Object.values(CALLS).forEach(c => { if (c.fight) c.slots = 3; });

/* =====================================================================
   SHIFTS
   ===================================================================== */
const NPC = {
  marlowe: { name: 'Chief Marlowe', look: { skin: '#c68d6a', build: 'normal', hair: { s: 'bob', c: '#9a9aa6' }, suit: '#2c3a52', suit2: '#1b2438', accent: '#ffc53d', mask: { t: 'none' }, cape: null, emblem: 'badge', extras: ['headset', 'glasses'] }, color: '#ffc53d' },
  sterling: { name: 'Cole Sterling', look: { skin: '#f0c8a4', build: 'normal', hair: { s: 'slick', c: '#e8d9a6' }, suit: '#f2f5fb', suit2: '#2a3a6a', accent: '#ffcf33', mask: { t: 'none' }, cape: '#2a3a6a', emblem: 'star', extras: [] }, color: '#9bb5ff' },
  mayor: { name: 'Mayor Bell', look: { skin: '#8d5a3c', build: 'normal', hair: { s: 'short', c: '#2b1b12' }, suit: '#3a3a52', suit2: '#1f1f33', accent: '#ff5252', mask: { t: 'none' }, cape: null, emblem: 'badge', extras: [] }, color: '#ff8a8a' },
};
const SHIFTS = [
  { name: 'Orientation Day', tag: 'First shift. Take it slow.', len: 300, winMul: 1.45,
    intro: [
      ['marlowe', "You're the new dispatcher? Good. The last one quit after the Pigeon Incident. We don't talk about the Pigeon Incident.", 'smug'],
      ['marlowe', 'Welcome to Meridian Hero Dispatch. We are the city\'s budget hero agency. Our roster is a team of second-chancers: not famous, not polished, and very good at what they do.', 'neutral'],
      ['marlowe', 'Your job: read the call, check the stats, send the right heroes. Match what the call needs with who you send. Simple, right?', 'neutral'],
      ['marlowe', 'Your first call is a cat. Do not get cocky.', 'smug'],
    ],
    outro: [['marlowe', 'Not bad. Nobody got stuck in a tree. We will make a dispatcher out of you yet.', 'smug'], ['marlowe', 'We have a new hire for you. Community service. She says she is "consulting". Be nice.', 'neutral']],
    calls: [[0, 'cat_tree'], [70, 'runaway_cart'], [150, 'lost_tourist']] },
  { name: "Two's Company", tag: 'Chemistry matters.', len: 360, winMul: 1.3,
    intro: [
      ['marlowe', 'Good morning. Today I want you to notice who works well together. Some heroes are best buds. Others... are not.', 'neutral'],
      ['velvet', "Hi, boss. I'm Velvet. I'm here for the community service. Also the dental plan.", 'smug'],
      ['marlowe', "Look at the chemistry chip when you assign a team. Green is good. Red means someone's going to sulk.", 'neutral'],
    ],
    outro: [['marlowe', 'Good work. Keep it up and the Mayor might actually send us a thank-you card.', 'smug']],
    calls: [[0, 'ribbon_cutting'], [55, 'shoplifter'], [120, 'bake_sale'], [185, 'power_line'], [240, 'neighbor']] },
  { name: 'First Showdown', tag: 'Some calls end in fists.', len: 420, winMul: 1.2, comms: true,
    intro: [
      ['marlowe', 'Some calls end with a fight. You can send the team and hope (Auto). Or you can Take Command and run the battle yourself.', 'neutral'],
      ['marlowe', 'Commanding is riskier but rewards the sharp. Knock enemies into things. Hit them from both sides. Use ultimates.', 'smug'],
      ['anvil', 'Hit them from both sides? I like it. Do I get a helmet?', 'grin'],
    ],
    outro: [['marlowe', 'There is a nurse downstairs who says she has opinions about our first-aid kit. I told her to see you.', 'neutral']],
    calls: [[0, 'bank_alarm'], [60, 'truck_jackers'], [130, 'purse_chase'], [190, 'warehouse_squat'], [250, 'scaffold'], [310, 'balloon']] },
  { name: 'Lunch Rush', tag: 'Everybody wants rescuing at once.', len: 480, winMul: 1.1, comms: true, n: 8, tiers: [2, 2, 3], fights: ['dock_gang'], cluster: 2,
    intro: [['marlowe', 'Lunch hour. The one time the whole city decides to have a crisis. Do not let calls pile up.', 'neutral'], ['marlowe', "Keep an eye on the clock. Heroes who are out won't answer new calls.", 'smug']],
    outro: [['cinder', "Hi, I'm Cinder. I lit a trash can on fire this morning. Not on purpose. Hire me?", 'grin']] },
  { name: 'Rush Hour', tag: 'Things start to stack.', len: 480, winMul: 1.0, comms: true, n: 10, tiers: [2, 3, 3, 4], fights: ['sewer_gator'], cluster: 3,
    intro: [['marlowe', 'Rush hour. Two calls at once is normal now. Three is a bad day. Do not have a bad day.', 'neutral'], ['sterling', 'Apex Guardians Inc. is pleased to announce a partnership proposal with the city. Feel free to be intimidated.', 'smug']],
    outro: [['slush', "Heard you need an ice cream truck driver with powers. I'm Slush. I do both. Not at once. Mostly.", 'grin']] },
  { name: 'Rival Season', tag: 'Apex is watching.', len: 480, winMul: 0.92, comms: true, n: 12, tiers: [3, 3, 4], fights: ['rogue_bots', 'apex_assist'], cluster: 3, rival: true,
    intro: [['marlowe', "Apex is circling. Every call we miss, they take. Every call they take, the Mayor notices.", 'neutral'], ['sterling', "We'll take your overflow, Marlowe. For a fee. A modest, humiliating fee.", 'smug'], ['marlowe', 'Show him why we do this.', 'smug']],
    outro: [['boomer', "Hi! I'm Wally. Boomer. I'm banned from the county fair. They let me keep the T-shirt.", 'grin']] },
  { name: 'Heat Wave', tag: 'Injuries linger.', len: 480, winMul: 0.88, comms: true, n: 14, tiers: [3, 4, 4], fights: ['pigeon_cult', 'dock_gang'], cluster: 4, heat: true,
    intro: [['marlowe', "Ninety-eight degrees and rising. Injuries take longer to heal. Be careful who you send out hurt.", 'neutral'], ['bulwark', 'I have ice packs. Do not make me use them as weapons.', 'neutral']],
    outro: [['hush', '...', 'neutral'], ['marlowe', 'That is Hush. Do not ask about the eyebrows. They are listening.', 'smug']] },
  { name: 'Crisis Management', tag: 'Big calls need big teams.', len: 480, winMul: 0.84, comms: true, n: 15, tiers: [3, 4, 4], fights: ['rogue_bots', 'apex_assist', 'sewer_gator'], cluster: 4, crises: [[190, 'bridge']],
    intro: [['marlowe', 'Crisis calls need three heroes, and they stay on the board longer. Pick wisely.', 'neutral'], ['marlowe', 'A bridge is falling down today. Do not panic. Panic later.', 'smug']],
    outro: [['mayor', 'Marlowe. Your people saved a bridge. Please save a budget next time.', 'neutral']] },
  { name: 'Pressure Cooker', tag: 'Something big is coming.', len: 480, winMul: 0.8, comms: true, n: 16, tiers: [4, 4, 5], fights: ['pigeon_cult', 'apex_assist', 'rogue_bots'], cluster: 5, crises: [[170, 'mecha_rampage']],
    intro: [['marlowe', 'A giant mecha has been spotted. It is wearing a "Hello, my name is" sticker. Do not be fooled.', 'neutral'], ['fuse', 'The power signature on that mecha... I know it. I know whose it is.', 'worry']],
    outro: [['fuse', 'The Static Prince. My old lab partner. I thought he was gone.', 'worry'], ['marlowe', 'Then we are all going to have a very bad Friday.', 'neutral']] },
  { name: 'Blackout', tag: 'The big one.', len: 480, winMul: 0.76, comms: true, n: 17, tiers: [4, 4, 5], fights: ['rogue_bots', 'apex_assist', 'pigeon_cult'], cluster: 5, crises: [[260, 'final_blackout']], finale: true,
    intro: [['marlowe', 'Today is the day. The grid is going dark. Every call matters. Use everyone.', 'neutral'], ['fuse', "He's using the city's own power against it. I can stop him, but I can't do it alone.", 'worry'], ['marlowe', 'Nobody does anything alone here. That is the whole point.', 'smug']],
    outro: [['marlowe', 'The lights are on. The Mayor is smiling. Somebody is crying in the break room. It is you.', 'smug'], ['sterling', "Apex withdraws its bid. Don't let it go to your heads. ...It's already gone to your heads.", 'smug'], ['marlowe', 'Take the night off. Tomorrow we keep going. Overtime mode is open.', 'neutral']] },
];
/* After shift 10: endless "Overtime" shifts generated from this */
const OVERTIME_BASE = { name: 'Overtime', tag: 'No finish line. Just more calls.', len: 480, winMul: 0.74, comms: true, tiers: [4, 5, 5], fights: ['rogue_bots', 'apex_assist', 'pigeon_cult', 'dock_gang', 'sewer_gator'], cluster: 3 };

/* =====================================================================
   FACILITIES
   ===================================================================== */
const FACILITIES = {
  comms: { name: 'Comms Array', icon: 'radio', desc: 'Calls stay open longer before they expire.', lv: [[600, '+12% response time'], [1400, '+24% response time'], [2600, '+36% response time']] },
  medbay: { name: 'Medbay', icon: 'cross', desc: 'Injured heroes heal faster.', lv: [[600, '25% faster recovery'], [1300, '50% faster recovery'], [2400, '75% faster recovery']] },
  training: { name: 'Training Room', icon: 'dumbbell', desc: 'Heroes earn more XP on every call.', lv: [[800, '+15% XP'], [1600, '+30% XP'], [2900, '+50% XP']] },
  lounge: { name: 'Break Room', icon: 'coffee', desc: 'Good coffee, good morale. Success on every call.', lv: [[900, '+2% success'], [1800, '+4% success'], [3200, '+6% success']] },
  garage: { name: 'Motor Pool', icon: 'car', desc: 'Faster vehicles mean shorter trips.', lv: [[700, 'Trips 20% shorter'], [1500, 'Trips 35% shorter'], [2800, 'Trips 50% shorter']] },
};

/* =====================================================================
   FLAVOR TEXT
   ===================================================================== */
const RADIO = {
  dispatch: ['{you}: {h}, you are go for {place}.', '{you}: {h}, {place} needs you. Move.', '{you}: Sending {h} to {place}. Try not to break anything.', '{you}: {place} is yours, {h}. Eyes open.'],
  reply: {
    hype: ['"Let\'s GOOO!"', '"Born ready!"', '"This is gonna be amazing!"'],
    calm: ['"Copy. Easy does it."', '"On our way."', '"We\'ve got this."'],
    joke: ['"Cape\'s pressed. Ruining someone\'s day now."', '"Do I get hazard pay or just hazards?"', '"Hold my coffee."'],
    order: ['"Copy."', '"Moving."', '"Understood."'],
  },
  miss: ['The caller gave up and called a cab.', 'Somebody else got there first. Not a hero. A very motivated neighbor.', 'The call went cold.', 'Apex Guardians swooped in, took selfies, and left.'],
  idle: ['Coffee machine status: critical.', 'Somewhere, a pigeon plots.', 'The Mayor called. Nobody picked up.', 'Marlowe is pretending to work.', 'A man in a cape is asking where the cape store is.'],
};

/* radio check prompts: [situation, hero-ack for each temper] */
const CHECKS = [
  { q: '{h} on the line: "Situation is... a lot. What do you want me to do?"', r: { hype: '"You got this! Big hero energy!"', calm: '"Slow breath. One thing at a time."', joke: '"Pretend it\'s a Tuesday. Cause it is."', order: '"Stick to the plan. Execute."' } },
  { q: '{h}: "The crowd is staring. Do I wave or something?"', r: { hype: '"Wave. They love you!"', calm: '"Keep your focus. Ignore them."', joke: '"Do the finger guns. Always works."', order: '"Eyes on the target. Move."' } },
  { q: '{h}: "Ah. There is a bigger problem than we thought."', r: { hype: '"Perfect! More fun!"', calm: '"Okay. Let\'s adjust. Together."', joke: '"Bigger problem? Great, more material."', order: '"Prioritize. Handle it."' } },
  { q: '{h}: "Boss? I have a funny feeling about this."', r: { hype: '"Trust the funny feeling! Go go!"', calm: '"Listen to it. Then proceed."', joke: '"Feeling funny? Tell it a joke."', order: '"Noted. Proceed anyway."' } },
];
