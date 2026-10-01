/* ENGINE */
// Pure, deterministic Card Wars rules engine. No DOM access. State is plain JSON.
// apply(state, command) -> { state, events, error }. Seeded PRNG lives inside the state.
var Engine = (function () {
'use strict';

const LANES = 4, START_HP = 25, ACTIONS = 2, HAND_MAX = 8, START_HAND = 5;
const DECK_SIZE = 20, MAX_COPIES = 2, OVERTIME = 15, MAX_ROUNDS = 40, SHIELD_CAP = 5;

const LANDS = {
  blue:  { name: 'Blue Plains',   hero: 'finn',      color: '#4aa8ff', home: 'Breezy: moving costs 0 Actions.', sig: 'Floop tricks & mobility' },
  corn:  { name: 'Cornfield',     hero: 'jake',      color: '#ffcf3a', home: 'Corn-Powered: +1 ATK.', sig: 'Swarm & growth' },
  swamp: { name: 'Useless Swamp', hero: 'marceline', color: '#b077f0', home: 'Grave Muck: a 1/1 Zombie rises in its lane when it is destroyed.', sig: 'Rot, Zombies & soul-stealing' },
  ice:   { name: 'IcyLands',      hero: 'iceking',   color: '#8fe9ff', home: 'Frostbite: creatures it damages in fights get Chilled.', sig: 'Chill, Freeze & control' },
  nice:  { name: 'NiceLands',     hero: 'pb',        color: '#ff8fd0', home: 'Nice Day: heals 1 at the start of your turn.', sig: 'Shields, buildings & spells' },
  lava:  { name: 'LavaFlats',     hero: 'fp',        color: '#ff6b3d', home: 'Scorch: creatures it damages in fights Burn 1.', sig: 'Burn, siege & aggro' },
  rainbow: { name: 'Rainbow', hero: null, color: '#f4f0ff', home: '', sig: 'Neutral' }
};
const LAND_TYPES = ['blue', 'corn', 'swamp', 'ice', 'nice', 'lava'];
const RARITY = { C: 'Common', R: 'Rare', E: 'Epic', L: 'Champion', T: 'Token' };

const KEYWORDS = {
  floop: 'FLOOP: turn the card sideways to use its ability. Once per turn. A flooped creature does not attack, but still defends.',
  guard: 'Guard: enemy attacks into your adjacent empty lanes hit this creature instead.',
  flying: 'Flying: ignores non-flying defenders and Guards when it attacks, and takes no damage back.',
  ranged: 'Ranged: takes no damage back when it attacks (unless the defender is Ranged).',
  siege: 'Siege: deals extra damage to buildings.',
  lifesteal: 'Lifesteal: fight damage it deals heals your hero.',
  shield: 'Shield: absorbs that much damage.',
  burn: 'Burn: takes Burn damage at the end of its controller\'s turn, then Burn goes down by 1.',
  chill: 'Chill: -1 ATK per stack. 2 stacks = Frozen. Wears off at the end of its controller\'s turn.',
  frozen: 'Frozen: can\'t attack, floop, move or hit back. Thaws at the end of its controller\'s next turn.',
  rot: 'Rot: takes 1 damage at the end of its controller\'s turn and can\'t be healed. Spreads to adjacent allies when it dies.',
  stuck: 'Stuck: can\'t move or be moved.',
  ripen: 'Ripen: at the end of your turn, if it didn\'t floop or move and stands on a face-up Cornfield, it grows +1/+1 (once).',
  immortal: 'Immortal: returns to its owner\'s hand when destroyed.',
  trap: 'Trap: played face-down. Springs when an enemy creature enters the opposing lane.',
  token: 'Token: vanishes when it leaves play.'
};

// ---------------------------------------------------------------- CARD DATA
// Every card is data. Abilities name an effect handler (fx) and a trigger (on). Targets (tg) are
// resolved by the target system. Adding a card only needs a new row (and an fx if the effect is new).
const CARDS = {};
function def(o) {
  o.req = o.req == null ? o.cost : o.req;
  o.kw = o.kw || {}; o.ab = o.ab || []; o.r = o.r || 'C';
  if (o.type === 'creature') { o.atk = o.atk || 0; o.def = o.def || 1; }
  if (o.type === 'building') { o.def = o.def || 1; }
  o.floop = o.ab.find(a => a.on === 'floop') || null;
  CARDS[o.id] = o;
}

// ---- BLUE PLAINS (Finn)
def({ id: 'b_hotdog', name: 'Hot Dog Knight', land: 'blue', type: 'creature', cost: 0, atk: 1, def: 2, r: 'C', art: 'hotdog',
  ab: [{ on: 'death', fx: 'drawCards', n: 1 }], text: 'When destroyed, draw a card.', flavor: 'Brave. Bun-armored. Mostly mustard.' });
def({ id: 'b_cooldog', name: 'Cool Dog', land: 'blue', type: 'creature', cost: 1, atk: 3, def: 5, r: 'C', art: 'cooldog',
  ab: [{ on: 'floop', fx: 'coolStare', n: 2 }], text: 'FLOOP: The enemy creature across gets -2 ATK until your next turn.', flavor: '"Cool Dog? That\'s a cool dog."' });
def({ id: 'b_scholar', name: 'Ancient Scholar', land: 'blue', type: 'creature', cost: 1, atk: 2, def: 5, r: 'R', art: 'scholar',
  ab: [{ on: 'floop', fx: 'study', plan: 'scholar' }], text: 'FLOOP: Study (+2 with a Schoolhouse here). At 3 Study: Raise the Dead - put a creature from your discard pile into an empty lane.', flavor: '"My Ancient Scholar\'s been studying the Raise the Dead ability."' });
def({ id: 'b_skypup', name: 'Sky Pup', land: 'blue', type: 'creature', cost: 1, atk: 2, def: 4, r: 'C', art: 'skypup',
  kw: { flying: 1 }, text: 'Flying.', flavor: 'Floats on pure enthusiasm.' });
def({ id: 'b_ranger', name: 'Cloud Ranger', land: 'blue', type: 'creature', cost: 2, atk: 4, def: 6, r: 'R', art: 'ranger',
  ab: [{ on: 'moved', fx: 'buffSelfTurn', n: 2 }], text: 'Whenever it moves, it gets +2 ATK this turn.', flavor: 'Rides the Blue Plains breeze into empty lanes.' });
def({ id: 'b_pig', name: 'The Pig', land: 'blue', type: 'creature', cost: 2, req: 3, atk: 4, def: 7, r: 'L', art: 'pig',
  kw: { muddy: 1 }, ab: [{ on: 'floop', fx: 'eatLand' }],
  text: 'FLOOP: Eat the landscape across (flip it face-down) and deal 1 damage to the creature on it. Muddy: if the Pig attacks and destroys a creature on a Useless Swamp, it gets stuck in the mud - that swamp\'s owner takes control of it.',
  flavor: '"What do you expect if all your power comes from corn? Pigs EAT corn, dude."' });
def({ id: 'b_school', name: 'Schoolhouse', land: 'blue', type: 'building', cost: 1, def: 5, r: 'C', art: 'school',
  ab: [{ on: 'start', fx: 'schoolLearn' }], text: 'At the start of your turn, your creature here gains +1 DEF permanently (max +2). Ancient Scholar studies twice as fast here.', flavor: 'Homework is a kind of armor.' });
def({ id: 'b_spirit', name: 'Spirit Tower', land: 'blue', type: 'building', cost: 2, def: 6, r: 'E', art: 'spirit',
  kw: { spirit: 5 }, text: 'When an enemy creature with 5+ ATK attacks this lane, cancel the attack and take control of it. Then the Spirit Tower fades.', flavor: '"Look! My Tower\'s doin\' a thing!"' });
def({ id: 'b_cave', name: 'Cave of Solitude', land: 'blue', type: 'building', cost: 1, def: 6, r: 'R', art: 'cave',
  kw: { cave: 1 }, text: 'Your flooped creature here naps inside: it can\'t be attacked, targeted or damaged by enemies.', flavor: '"I move my Pig to the Cave of Solitude so he can take a nap."' });
def({ id: 'b_math', name: 'Mathematical!', land: 'blue', type: 'spell', cost: 0, r: 'R', art: 'math',
  ab: [{ on: 'cast', fx: 'readyCreature', tg: ['myFlooped'] }], text: 'Ready one of your flooped creatures. It can floop or fight again.', flavor: 'Algebraic!' });
def({ id: 'b_adv', name: 'Adventure Time!', land: 'blue', type: 'spell', cost: 2, r: 'E', art: 'advtime',
  ab: [{ on: 'cast', fx: 'teamBuffTurn', n: 2, draw: 1 }], text: 'Your creatures get +2 ATK this turn. Draw a card.', flavor: 'Come on, grab your friends.' });
def({ id: 'b_ride', name: 'Rainicorn Ride', land: 'blue', type: 'spell', cost: 1, r: 'C', art: 'rainicorn',
  ab: [{ on: 'cast', fx: 'relocate', tg: ['anyMovable', 'emptyLaneSameSide'] }], text: 'Move any creature (yours or an enemy\'s) to an empty lane on its side.', flavor: 'Lady Rainicorn won\'t play Card Wars. She will give rides.' });

// ---- CORNFIELD (Jake)
def({ id: 'c_cornball', name: 'Cornball', land: 'corn', type: 'creature', cost: 0, atk: 1, def: 2, r: 'C', art: 'cornball',
  kw: { ripen: 1 }, text: 'Ripen.', flavor: 'Just a little guy. Growing.' });
def({ id: 'c_husker', name: 'Husker Knight', land: 'corn', type: 'creature', cost: 1, atk: 2, def: 4, r: 'C', art: 'husker',
  kw: { ripen: 1, collapse: 1 }, text: 'Ripen. Collapses (can\'t attack) while its landscape is face-down.', flavor: '"My Husker Knights draw energy from corn!"' });
def({ id: 'c_scarecrow', name: 'Scarecrow', land: 'corn', type: 'creature', cost: 1, atk: 1, def: 6, r: 'C', art: 'scarecrow',
  kw: { guard: 1 }, text: 'Guard.', flavor: 'Scares crows. And Pigs, sometimes.' });
def({ id: 'c_worm', name: 'Husker Worm', land: 'corn', type: 'creature', cost: 2, atk: 3, def: 5, r: 'R', art: 'worm',
  ab: [{ on: 'play', fx: 'tokensAdj', token: 't_earling' }], text: 'When played, put a 1/1 Earling into each adjacent empty lane.', flavor: 'It burrows. They follow.' });
def({ id: 'c_ronin', name: 'Corn Ronin', land: 'corn', type: 'creature', cost: 2, atk: 2, def: 5, r: 'R', art: 'ronin',
  kw: { swarm: 1 }, text: '+1 ATK for each other creature you control.', flavor: 'A masterless kernel. Strongest in a crowd.' });
def({ id: 'c_maize', name: 'Immortal Maize Walker', land: 'corn', type: 'creature', cost: 2, req: 3, atk: 1, def: 7, r: 'L', art: 'maize',
  kw: { triple: 1, immortal: 1 }, text: 'Deals triple damage while you control 3+ face-up Cornfields. Immortal.', flavor: '"I LOVE CORN!"' });
def({ id: 'c_silo', name: 'Silo of Truth', land: 'corn', type: 'building', cost: 2, def: 5, r: 'E', art: 'silo',
  ab: [{ on: 'floop', fx: 'siloPeek' }], text: 'FLOOP: See your opponent\'s hand and face-down buildings, then steal a Spell from their hand.', flavor: '"Pfff, you got really lame cards. I\'ll take the Cerebral Bloodstorm, though."' });
def({ id: 'c_cornucopia', name: 'Cornucopia', land: 'corn', type: 'building', cost: 1, def: 4, r: 'R', art: 'cornucopia',
  ab: [{ on: 'start', fx: 'tokenRandomEmpty', token: 't_earling' }], text: 'At the start of your turn, put a 1/1 Earling into a random empty lane of yours.', flavor: 'Never runs out. Never cleans up.' });
def({ id: 'c_dome', name: 'Corn Dome', land: 'corn', type: 'building', cost: 2, def: 5, r: 'R', art: 'dome',
  kw: { aura: 1 }, text: 'Your creatures in this lane and adjacent lanes get +1 ATK.', flavor: 'Pop-pop-power.' });
def({ id: 'c_bloodstorm', name: 'Cerebral Bloodstorm', land: 'corn', type: 'spell', cost: 1, r: 'R', art: 'bloodstorm',
  ab: [{ on: 'cast', fx: 'bloodstorm', n: 2 }], text: 'Deal 2 damage to every Ready creature - yours too! Flooped creatures are safe.', flavor: '"Since I\'m not attacking, it only hurts your own troops."' });
def({ id: 'c_nightmares', name: 'Field of Nightmares', land: 'corn', type: 'spell', cost: 2, r: 'E', art: 'nightmares',
  ab: [{ on: 'cast', fx: 'tokensAllEmpty', token: 't_earling' }], text: 'Summon the Legion of Earlings: a 1/1 Earling into each of your empty lanes.', flavor: '"...to scare your Pig to death!"' });
def({ id: 'c_plant', name: 'Plant Corn', land: 'corn', type: 'spell', cost: 0, r: 'C', art: 'plant',
  ab: [{ on: 'cast', fx: 'convertLand', land: 'corn', tg: ['myLand'] }], text: 'Turn one of your landscapes into a face-up Cornfield.', flavor: 'Cornfields are AWESOME.' });
def({ id: 't_earling', name: 'Earling', land: 'corn', type: 'creature', cost: 0, atk: 1, def: 1, r: 'T', art: 'earling', token: 1,
  text: 'Token.', flavor: 'An ear of corn with ears.' });

// ---- USELESS SWAMP (Marceline)
def({ id: 's_wisp', name: 'Swamp Wisp', land: 'swamp', type: 'creature', cost: 0, atk: 1, def: 1, r: 'C', art: 'wisp',
  kw: { flying: 1 }, text: 'Flying.', flavor: 'Smells like the bottom of a boot.' });
def({ id: 's_slinger', name: 'Mud Slinger', land: 'swamp', type: 'creature', cost: 1, atk: 2, def: 4, r: 'C', art: 'slinger',
  kw: { rotter: 1 }, text: 'Creatures it damages in fights Rot.', flavor: 'Pigs can\'t leave mud landscapes once they\'re on them.' });
def({ id: 's_digger', name: 'Gravedigger', land: 'swamp', type: 'creature', cost: 1, atk: 1, def: 5, r: 'R', art: 'digger',
  ab: [{ on: 'floop', cost: 1, fx: 'tokenAt', token: 't_zombie', tg: ['adjEmptyLane'] }], text: 'FLOOP (1 Action): Raise a 1/1 Zombie in an adjacent empty lane.', flavor: 'Digs up friends.' });
def({ id: 's_witch', name: 'Bog Witch', land: 'swamp', type: 'creature', cost: 2, atk: 3, def: 6, r: 'R', art: 'witch',
  kw: { lifesteal: 1 }, text: 'Lifesteal.', flavor: 'Brews soup. Do not eat the soup.' });
def({ id: 's_gobbler', name: 'Grave Gobbler', land: 'swamp', type: 'creature', cost: 2, atk: 3, def: 5, r: 'R', art: 'gobbler',
  ab: [{ on: 'anyDeath', fx: 'gobble', n: 3 }], text: 'Whenever another creature is destroyed, it gets +1 ATK permanently (max +3).', flavor: 'Nothing goes to waste in the swamp.' });
def({ id: 's_lich', name: 'The Lich', land: 'swamp', type: 'creature', cost: 2, req: 3, atk: 4, def: 8, r: 'L', art: 'lich',
  ab: [{ on: 'floop', cost: 1, fx: 'rotAllEnemies' }], text: 'FLOOP (1 Action): Every enemy creature Rots.', flavor: 'All will be still.' });
def({ id: 's_crypt', name: 'Crypt', land: 'swamp', type: 'building', cost: 1, def: 5, r: 'C', art: 'crypt',
  ab: [{ on: 'allyDeath', fx: 'cryptRaise', token: 't_zombie' }], text: 'When one of your creatures in this or an adjacent lane is destroyed, raise a 1/1 Zombie here.', flavor: 'Always has room for one more.' });
def({ id: 's_mudpit', name: 'Mud Pit', land: 'swamp', type: 'building', cost: 1, def: 3, r: 'R', art: 'mudpit',
  kw: { trap: 1 }, ab: [{ on: 'trap', fx: 'mudTrap' }], text: 'Trap. When an enemy creature enters the opposing lane, it gets Stuck and Rots. Then the pit sinks.', flavor: '"Pigs can\'t leave mud landscapes once they\'re on them!"' });
def({ id: 's_cauldron', name: 'Witch\'s Cauldron', land: 'swamp', type: 'building', cost: 2, def: 5, r: 'R', art: 'cauldron',
  ab: [{ on: 'floop', fx: 'cauldron', cond: 'myCreatureHere' }], text: 'FLOOP: Destroy your creature here: draw 2 cards and gain 1 Action.', flavor: 'Bubble bubble.' });
def({ id: 's_reaper', name: 'The Reaper', land: 'swamp', type: 'spell', cost: 2, r: 'E', art: 'reaper',
  ab: [{ on: 'cast', fx: 'reap', n: 2 }], text: 'Take control of every damaged enemy creature with 2 or less DEF left.', flavor: '"My boys!"' });
def({ id: 's_unearth', name: 'Unearth', land: 'swamp', type: 'spell', cost: 1, r: 'C', art: 'unearth',
  ab: [{ on: 'cast', fx: 'unearth', tg: ['myDiscardCreature', 'myEmptyLane'] }], text: 'Put a creature from your discard pile into an empty lane of yours. It Rots.', flavor: 'Back for one more round.' });
def({ id: 's_breath', name: 'Bog Breath', land: 'swamp', type: 'spell', cost: 1, r: 'C', art: 'breath',
  ab: [{ on: 'cast', fx: 'dmgRot', n: 2, tg: ['anyCreature'] }], text: 'Deal 2 damage to a creature. It Rots.', flavor: 'Mint does not help.' });
def({ id: 't_zombie', name: 'Zombie', land: 'swamp', type: 'creature', cost: 0, atk: 1, def: 1, r: 'T', art: 'zombie', token: 1,
  text: 'Token.', flavor: 'Brains? Candy? Either.' });

// ---- ICYLANDS (Ice King)
def({ id: 'i_gunter', name: 'Gunter', land: 'ice', type: 'creature', cost: 0, atk: 1, def: 3, r: 'R', art: 'gunter',
  ab: [{ on: 'floop', fx: 'gunter' }], text: 'FLOOP: Deal 1 damage to a random enemy creature and Chill it.', flavor: 'Wenk.' });
def({ id: 'i_golem', name: 'Snow Golem', land: 'ice', type: 'creature', cost: 1, atk: 2, def: 6, r: 'C', art: 'golem',
  kw: { guard: 1 }, text: 'Guard.', flavor: 'Cold shoulder, warm heart.' });
def({ id: 'i_sprite', name: 'Snow Sprite', land: 'ice', type: 'creature', cost: 1, atk: 2, def: 4, r: 'C', art: 'sprite',
  kw: { ranged: 1 }, ab: [{ on: 'floop', fx: 'chillTarget', n: 1, tg: ['enemyCreature'] }], text: 'Ranged. FLOOP: Chill an enemy creature.', flavor: 'Snowballs. Infinite snowballs.' });
def({ id: 'i_yeti', name: 'Abominable Snowman', land: 'ice', type: 'creature', cost: 2, atk: 5, def: 7, r: 'R', art: 'yeti',
  kw: { vsChill: 2 }, text: 'Deals +2 damage to Chilled or Frozen creatures.', flavor: 'Hates warm weather and warm hugs.' });
def({ id: 'i_wizard', name: 'Blizzard Wizard', land: 'ice', type: 'creature', cost: 2, atk: 3, def: 7, r: 'R', art: 'wizard',
  ab: [{ on: 'floop', fx: 'push', n: 2, tg: ['pushDir'] }], text: 'FLOOP: Push the enemy creature across into an adjacent lane. If an enemy creature is already there, both take 2 damage.', flavor: 'Sweeps the board like a snowplow.' });
def({ id: 'i_king', name: 'Ice King', land: 'ice', type: 'creature', cost: 2, req: 3, atk: 4, def: 8, r: 'L', art: 'iceking',
  ab: [{ on: 'floop', cost: 1, fx: 'iceKing' }], text: 'FLOOP (1 Action): Freeze the enemy creature across and Chill every other enemy creature.', flavor: '"Gunter, fetch me my Card Wars crown!"' });
def({ id: 'i_castle', name: 'Ice Castle', land: 'ice', type: 'building', cost: 1, def: 7, r: 'R', art: 'castle',
  ab: [{ on: 'end', fx: 'chillAcross' }], text: 'At the end of your turn, Chill the enemy creature across.', flavor: 'Drafty in all the right places.' });
def({ id: 'i_lake', name: 'Frozen Lake', land: 'ice', type: 'building', cost: 1, def: 3, r: 'R', art: 'lake',
  kw: { trap: 1 }, ab: [{ on: 'trap', fx: 'iceTrap', n: 2 }], text: 'Trap. When an enemy creature enters the opposing lane, Freeze it and deal 2 damage. Then the ice cracks.', flavor: 'Thin ice, thick trouble.' });
def({ id: 'i_igloo', name: 'Penguin Igloo', land: 'ice', type: 'building', cost: 1, def: 4, r: 'C', art: 'igloo',
  ab: [{ on: 'start', fx: 'tokenHere', token: 't_penguin' }], text: 'At the start of your turn, if your creature slot here is empty, a 1/1 Penguin waddles out.', flavor: 'Seventeen Gunters. Or one Gunter, seventeen times.' });
def({ id: 'i_freeze', name: 'Deep Freeze', land: 'ice', type: 'spell', cost: 1, r: 'C', art: 'freeze',
  ab: [{ on: 'cast', fx: 'freezeTarget', tg: ['enemyCreature'] }], text: 'Freeze an enemy creature.', flavor: 'Chill out.' });
def({ id: 'i_blizzard', name: 'Blizzard', land: 'ice', type: 'spell', cost: 2, r: 'E', art: 'blizzard',
  ab: [{ on: 'cast', fx: 'blizzard', n: 2 }], text: 'Deal 2 damage to every enemy creature and Chill them.', flavor: 'Snow day for everyone!' });
def({ id: 'i_snowday', name: 'Snow Day', land: 'ice', type: 'spell', cost: 1, r: 'R', art: 'snowday',
  ab: [{ on: 'cast', fx: 'convertLand', land: 'ice', chill: 1, tg: ['anyLand'] }], text: 'Turn any landscape into IcyLands. Chill the creature on it.', flavor: 'No school! (Sorry, Ancient Scholar.)' });
def({ id: 't_penguin', name: 'Penguin', land: 'ice', type: 'creature', cost: 0, atk: 1, def: 1, r: 'T', art: 'penguin', token: 1,
  kw: { chiller: 1 }, text: 'Token. Chills creatures it damages.', flavor: 'Wenk wenk.' });

// ---- NICELANDS (Princess Bubblegum)
def({ id: 'n_banana', name: 'Banana Guard', land: 'nice', type: 'creature', cost: 0, atk: 1, def: 3, r: 'C', art: 'banana',
  kw: { guard: 1 }, text: 'Guard.', flavor: '"Bananas! Defend the castle!"' });
def({ id: 'n_butler', name: 'Peppermint Butler', land: 'nice', type: 'creature', cost: 1, atk: 1, def: 4, r: 'R', art: 'butler',
  ab: [{ on: 'floop', fx: 'shieldTarget', n: 2, tg: ['allyCreature'] }], text: 'FLOOP: Give an ally Shield 2.', flavor: 'Knows a few dark tricks. Uses them nicely.' });
def({ id: 'n_tart', name: 'Royal Tart Toter', land: 'nice', type: 'creature', cost: 1, atk: 2, def: 5, r: 'C', art: 'tart',
  ab: [{ on: 'floop', fx: 'healTarget', n: 3, tg: ['allyCreature'] }], text: 'FLOOP: Heal 3 damage from an ally.', flavor: 'Tarts heal everything. Science says so.' });
def({ id: 'n_guardian', name: 'Gumball Guardian', land: 'nice', type: 'creature', cost: 2, atk: 2, def: 8, r: 'R', art: 'guardian',
  kw: { guard: 1, ranged: 1 }, text: 'Guard. Ranged.', flavor: 'Laser eyes, gumball heart.' });
def({ id: 'n_cupcake', name: 'Mr. Cupcake', land: 'nice', type: 'creature', cost: 2, atk: 4, def: 6, r: 'C', art: 'cupcake',
  ab: [{ on: 'play', fx: 'shieldSelf', n: 2 }], text: 'Enters with Shield 2.', flavor: 'Bodyguard. Frosting. Muscles.' });
def({ id: 'n_pb', name: 'Princess Bubblegum', land: 'nice', type: 'creature', cost: 2, req: 3, atk: 3, def: 8, r: 'L', art: 'pb',
  ab: [{ on: 'floop', cost: 1, fx: 'pbScience', n: 2 }], text: 'FLOOP (1 Action): SCIENCE! Each of your buildings zaps the enemy creature across from it for 2.', flavor: '"Science is about trying things!"' });
def({ id: 'n_tower', name: 'Gumdrop Tower', land: 'nice', type: 'building', cost: 1, def: 5, r: 'C', art: 'tower',
  kw: { link: 1 }, ab: [{ on: 'start', fx: 'gumdrop' }], text: 'At the start of your turn, your creature here gets Shield 1 (Shield 2 while you control another Gumdrop Tower - they link).', flavor: 'Sticky, sweet, sturdy.' });
def({ id: 'n_lab', name: 'Candy Lab', land: 'nice', type: 'building', cost: 1, def: 4, r: 'R', art: 'lab',
  kw: { spellDiscount: 1 }, text: 'Your first Spell each turn costs 1 less.', flavor: 'Mostly safe. Mostly.' });
def({ id: 'n_wall', name: 'Candy Wall', land: 'nice', type: 'building', cost: 1, def: 8, r: 'C', art: 'wall',
  kw: { thorns: 2 }, text: 'Creatures that attack this building take 2 damage.', flavor: 'Hard candy. Very hard.' });
def({ id: 'n_bubble', name: 'Bubble Barrier', land: 'nice', type: 'spell', cost: 1, r: 'C', art: 'bubble',
  ab: [{ on: 'cast', fx: 'bubble', n: 2, tg: ['allyCreature'] }], text: 'Give a creature and its adjacent allies Shield 2.', flavor: 'Pop-proof. Mostly.' });
def({ id: 'n_science', name: 'Science!', land: 'nice', type: 'spell', cost: 0, r: 'R', art: 'science',
  ab: [{ on: 'cast', fx: 'science' }], text: 'Draw a card. If you control a building, draw 2 instead.', flavor: 'Hypothesis: more cards.' });
def({ id: 'n_justice', name: 'Sweet Justice', land: 'nice', type: 'spell', cost: 2, r: 'E', art: 'justice',
  ab: [{ on: 'cast', fx: 'dmgTarget', n: 4, tg: ['enemyNearMyBuilding'] }], text: 'Deal 4 damage to an enemy creature in a lane where you have a building.', flavor: 'The Candy Kingdom always gets its tart back.' });

// ---- LAVAFLATS (Flame Princess)
def({ id: 'l_pup', name: 'Fire Wolf Pup', land: 'lava', type: 'creature', cost: 0, atk: 2, def: 1, r: 'C', art: 'firepup',
  text: 'A hot-tempered little wolf.', flavor: 'Awoo! (Ouch, hot.)' });
def({ id: 'l_bun', name: 'Cinnamon Bun', land: 'lava', type: 'creature', cost: 1, atk: 2, def: 5, r: 'C', art: 'bun',
  kw: { guard: 1 }, text: 'Guard.', flavor: '"I\'m a knight now!"' });
def({ id: 'l_flambo', name: 'Flambo', land: 'lava', type: 'creature', cost: 1, atk: 1, def: 4, r: 'R', art: 'flambo',
  ab: [{ on: 'floop', fx: 'burnTarget', n: 2, tg: ['enemyCreature'] }], text: 'FLOOP: Burn 2 an enemy creature.', flavor: '"Flame shield? Nah, flame THIS."' });
def({ id: 'l_elemental', name: 'Fire Elemental', land: 'lava', type: 'creature', cost: 1, atk: 3, def: 3, r: 'C', art: 'elemental',
  ab: [{ on: 'death', fx: 'explodeAcross', n: 2 }], text: 'When destroyed, deal 2 damage to the enemy creature across.', flavor: 'Goes out with a bang.' });
def({ id: 'l_golem', name: 'Lava Golem', land: 'lava', type: 'creature', cost: 2, atk: 4, def: 7, r: 'R', art: 'lavagolem',
  kw: { siege: 2 }, text: 'Siege 2.', flavor: 'Walls are just slow snacks.' });
def({ id: 'l_fp', name: 'Flame Princess', land: 'lava', type: 'creature', cost: 2, req: 3, atk: 5, def: 6, r: 'L', art: 'fp',
  ab: [{ on: 'floop', cost: 1, fx: 'burnAllEnemies', n: 2 }], text: 'FLOOP (1 Action): Burn 2 every enemy creature.', flavor: '"I\'m not evil. I\'m just FIRE."' });
def({ id: 'l_forge', name: 'Fire Forge', land: 'lava', type: 'building', cost: 1, def: 5, r: 'R', art: 'forge',
  ab: [{ on: 'end', fx: 'forge', n: 2 }], text: 'At the end of your turn, your creature here gets +1 ATK permanently (max +2).', flavor: 'Hot metal, hotter tempers.' });
def({ id: 'l_cannon', name: 'Lava Cannon', land: 'lava', type: 'building', cost: 2, def: 4, r: 'R', art: 'cannon',
  ab: [{ on: 'end', fx: 'cannon' }], text: 'At the end of your turn, fire across this lane: 3 damage to a building, else 2 to the creature, else 2 to the hero.', flavor: 'Siege, but spicy.' });
def({ id: 'l_pit', name: 'Fire Pit', land: 'lava', type: 'building', cost: 1, def: 3, r: 'C', art: 'firepit',
  ab: [{ on: 'end', fx: 'firePit', n: 1 }], text: 'At the end of your turn, Burn 1 the enemy creatures in this lane and adjacent lanes.', flavor: 'S\'mores for one. Burns for all.' });
def({ id: 'l_fireball', name: 'Fireball', land: 'lava', type: 'spell', cost: 1, r: 'C', art: 'fireball',
  ab: [{ on: 'cast', fx: 'fireball', n: 3, tg: ['anyCreature'] }], text: 'Deal 3 damage to a creature and 1 to the creatures beside it.', flavor: 'Classic.' });
def({ id: 'l_eruption', name: 'Eruption', land: 'lava', type: 'spell', cost: 2, r: 'E', art: 'eruption',
  ab: [{ on: 'cast', fx: 'convertLand', land: 'lava', dmg: 3, tg: ['anyLand'] }], text: 'Turn any landscape into LavaFlats and deal 3 damage to the creature on it.', flavor: 'The floor is lava. Literally.' });
def({ id: 'l_heatwave', name: 'Heat Wave', land: 'lava', type: 'spell', cost: 1, r: 'R', art: 'heatwave',
  ab: [{ on: 'cast', fx: 'heatwave', n: 2 }], text: 'Deal 2 damage to the enemy hero. Burn 1 every enemy creature.', flavor: 'Somebody open a window.' });

// ---- RAINBOW (neutral)
def({ id: 'r_baldman', name: 'Wandering Bald Man', land: 'rainbow', type: 'creature', cost: 0, atk: 2, def: 2, r: 'C', art: 'baldman',
  ab: [{ on: 'start', fx: 'wander' }], text: 'At the start of your turn, wanders into a random empty lane of yours - unless he is stuck in a Useless Swamp.', flavor: '"Well... I\'ve still got my Wandering Bald Man." (He got stuck in the mud.)' });
def({ id: 'r_dan', name: 'Archer Dan', land: 'rainbow', type: 'creature', cost: 2, atk: 3, def: 5, r: 'E', art: 'dan',
  kw: { ranged: 1 }, ab: [{ on: 'play', fx: 'danVolley', n: 3 }], text: 'Ranged. When played, deal 3 damage to every enemy building.', flavor: '"Whoa. Math."' });
def({ id: 'r_poundcake', name: 'Nurse Poundcake', land: 'rainbow', type: 'creature', cost: 1, atk: 1, def: 5, r: 'C', art: 'poundcake',
  ab: [{ on: 'floop', fx: 'healHero', n: 2 }], text: 'FLOOP: Heal your hero 2.', flavor: 'Bedside manner: excellent. Bedside snacks: also excellent.' });
def({ id: 'r_teleport', name: 'Teleport', land: 'rainbow', type: 'spell', cost: 0, r: 'C', art: 'teleport',
  ab: [{ on: 'cast', fx: 'teleport', tg: ['myMovable', 'myOtherLane'] }], text: 'Move one of your creatures to any lane of yours (swapping if needed). Only works on your own creatures!', flavor: '"Wouldn\'t Teleport only work on your own creatures?"' });
def({ id: 'r_reclaim', name: 'Reclaim Landscape', land: 'rainbow', type: 'spell', cost: 1, r: 'R', art: 'reclaim',
  ab: [{ on: 'cast', fx: 'reclaim' }], text: 'Restore all your landscapes: flip them face-up and undo enemy conversions.', flavor: '"Now I reconstitute my cornfields!"' });
def({ id: 'r_pancakes', name: 'Bacon Pancakes', land: 'rainbow', type: 'spell', cost: 1, r: 'C', art: 'pancakes',
  ab: [{ on: 'cast', fx: 'drawCards', n: 2 }], text: 'Draw 2 cards.', flavor: 'Makin\' bacon pancakes...' });
def({ id: 'r_glory', name: 'For the Glory!', land: 'rainbow', type: 'spell', cost: 1, r: 'R', art: 'glory',
  ab: [{ on: 'cast', fx: 'teamBuffTurn', n: 1, draw: 1 }], text: 'Your creatures get +1 ATK this turn. Draw a card.', flavor: '"FOR THE GLORY OF JAKORIA!"' });
def({ id: 'r_volcano', name: 'Volcano', land: 'rainbow', type: 'building', cost: 2, def: 6, r: 'E', art: 'volcano',
  ab: [{ on: 'floop', fx: 'volcano', cond: 'notFresh' }], text: 'FLOOP: Destroy ALL creatures - yours too! Then the Volcano is spent. (Can\'t floop the turn it\'s played.)', flavor: '"I floop the Volcano!" "That\'ll destroy your kingdom too!" "Hmm. Maybe."' });
def({ id: 'r_treefort', name: 'Tree Fort', land: 'rainbow', type: 'building', cost: 1, def: 6, r: 'C', art: 'treefort',
  ab: [{ on: 'start', fx: 'healHere', n: 2 }], text: 'At the start of your turn, your creature here heals 2.', flavor: 'Home sweet tree.' });
def({ id: 'r_portal', name: 'Magic Portal', land: 'rainbow', type: 'building', cost: 1, def: 3, r: 'R', art: 'portal',
  kw: { portal: 1 }, ab: [{ on: 'play', fx: 'portalTwin' }], text: 'When played, a twin Portal opens in another empty building slot of yours. Your creatures move between Portal lanes for free, at any distance.', flavor: 'Step in, step out, step on someone.' });
def({ id: 'r_booby', name: 'Booby Trap', land: 'rainbow', type: 'building', cost: 0, def: 2, r: 'C', art: 'booby',
  kw: { trap: 1 }, ab: [{ on: 'trap', fx: 'boobyTrap', n: 3 }], text: 'Trap. When an enemy creature enters the opposing lane, deal 3 damage to it. Then it\'s spent.', flavor: 'Gotcha.' });

// Unknown placeholders (used only inside redacted states for fair AI search).
CARDS['?'] = { id: '?', name: 'Unknown', land: 'rainbow', type: 'unknown', cost: 99, req: 99, kw: {}, ab: [], r: 'T', floop: null, art: 'back', text: '' };
// Inside a redacted state an unknown face-down building is assumed to sting for 2 (expected value).
CARDS['?trap'] = { id: '?trap', name: 'Face-down building', land: 'rainbow', type: 'building', cost: 0, req: 0, def: 2, kw: { trap: 1 }, ab: [{ on: 'trap', fx: 'boobyTrap', n: 2 }], r: 'T', floop: null, art: 'back', text: 'A mystery.' };

const COLLECTIBLE = Object.keys(CARDS).filter(id => !CARDS[id].token && CARDS[id].r !== 'T' && id[0] !== '?');

// ---------------------------------------------------------------- PRNG
function hashSeed(x) {
  const s = String(x == null ? 'glow' : x);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h || 1;
}
function rand(st) {
  let t = (st.rng = (st.rng + 0x6D2B79F5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function randInt(st, n) { return Math.floor(rand(st) * n); }
function shuffle(st, a) { for (let i = a.length - 1; i > 0; i--) { const j = randInt(st, i + 1); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

function clone(o) {
  if (o === null || typeof o !== 'object') return o;
  if (Array.isArray(o)) { const a = new Array(o.length); for (let i = 0; i < o.length; i++) a[i] = clone(o[i]); return a; }
  const r = {}; for (const k in o) r[k] = clone(o[k]); return r;
}

// ---------------------------------------------------------------- HELPERS
const lvlAtk = l => (l >= 3 ? 1 : 0);
const lvlDef = l => (l >= 2 ? 1 : 0) + (l >= 4 ? 1 : 0);
const card = id => CARDS[id] || CARDS['?'];
const inLane = l => l >= 0 && l < LANES;
function cr(st, side, lane) { return inLane(lane) ? st.players[side].lanes[lane].creature : null; }
function bl(st, side, lane) { return inLane(lane) ? st.players[side].lanes[lane].building : null; }
function land(st, side, lane) { return st.players[side].lanes[lane].land; }
function abN(ab, lvl) { return (ab.n || 0) + (lvl >= 3 && ab.n ? 1 : 0); }
function countLand(st, side, type) {
  let n = 0; const L = st.players[side].lanes;
  for (let i = 0; i < LANES; i++) if (!L[i].land.down && L[i].land.type === type) n++;
  return n;
}
function findCreature(st, uid) {
  for (let s = 0; s < 2; s++) for (let l = 0; l < LANES; l++) { const c = st.players[s].lanes[l].creature; if (c && c.uid === uid) return { side: s, lane: l, c }; }
  return null;
}
function emptyLanes(st, side) { const r = []; for (let l = 0; l < LANES; l++) if (!st.players[side].lanes[l].creature) r.push(l); return r; }
function onHome(st, side, lane) {
  const c = cr(st, side, lane); if (!c || c.token) return false;
  const L = land(st, side, lane); return !L.down && L.type === card(c.id).land;
}
// A flooped creature in a lane with a face-up Cave of Solitude is napping: enemies can't touch it.
function napping(st, side, lane) {
  const c = cr(st, side, lane); if (!c || !c.flooped) return false;
  const b = bl(st, side, lane); return !!(b && !b.hidden && card(b.id).kw.cave);
}
function targetable(st, side, lane, bySide) { const c = cr(st, side, lane); return !!c && (side === bySide || !napping(st, side, lane)); }

function cStats(st, side, lane) {
  const P = st.players[side], c = P.lanes[lane].creature; if (!c) return null;
  const cd = card(c.id);
  const base = (cd.atk || 0) + lvlAtk(c.lvl);
  let atk = base + (c.pAtk || 0) + (c.tAtk || 0);
  if (cd.kw.triple && countLand(st, side, 'corn') >= 3) atk += base * 2;
  const def = (cd.def || 1) + lvlDef(c.lvl) + (c.pDef || 0);
  const home = onHome(st, side, lane);
  if (home && cd.land === 'corn') atk += 1;
  for (let l = lane - 1; l <= lane + 1; l++) { const b = bl(st, side, l); if (b && !b.hidden && card(b.id).kw.aura) atk += 1; }
  if (cd.kw.swarm) { for (let l = 0; l < LANES; l++) if (l !== lane && P.lanes[l].creature) atk += 1; }
  if (c.debuffs) for (const d of c.debuffs) atk += d.atk;
  atk -= (c.chill || 0);
  if (atk < 0) atk = 0;
  return { atk, def, hp: def - c.dmg, home };
}
function bDef(b) { return (card(b.id).def || 1) + Math.max(0, (b.lvl || 1) - 1); }

function mkInst(st, id, lvl, owner) { return { uid: st.uid++, id, lvl: lvl || 1, owner }; }
function mkCreature(st, inst, side) {
  return { uid: inst.uid, id: inst.id, lvl: inst.lvl || 1, owner: inst.owner == null ? side : inst.owner, dmg: 0, flooped: false, fl: false,
    moved: false, frozen: false, thawAt: 0, chill: 0, burn: 0, rot: false, shield: 0, stuck: false, pAtk: 0, pDef: 0, tAtk: 0,
    debuffs: [], study: 0, ripen: 0, forge: 0, school: 0, gob: 0, born: st.turn, token: !!card(inst.id).token, lastHit: null };
}

// ---------------------------------------------------------------- GAME SETUP
function makePlayer(st, cfg, side) {
  const lands = (cfg.deck && cfg.deck.lands) || ['blue', 'blue', 'blue', 'blue'];
  const levels = cfg.levels || {};
  const deck = ((cfg.deck && cfg.deck.cards) || []).map(id => mkInst(st, id, levels[id] || cfg.level || 1, side));
  shuffle(st, deck);
  return {
    name: cfg.name || ('Player ' + (side + 1)), hero: cfg.hero || 'finn', hp: cfg.hp || START_HP, maxHp: cfg.hp || START_HP,
    deck, hand: [], discard: [], actions: 0, mulled: null, spells: 0, bonusActions: cfg.bonusActions || 0,
    revealTurn: -1, peekTurn: -1, burn: 0,
    lanes: [0, 1, 2, 3].map(i => ({ land: { type: lands[i] || 'blue', orig: lands[i] || 'blue', down: false, by: null }, creature: null, building: null }))
  };
}

function newGame(cfg) {
  cfg = cfg || {};
  const st = { v: 1, rng: hashSeed(cfg.seed), turn: 0, round: 0, active: 0, first: 0, phase: 'mulligan', winner: null,
    reason: '', uid: 1, pending: null, players: [], ot: cfg.overtime || OVERTIME, noMulligan: !!cfg.noMulligan };
  const pc = cfg.players || [{}, {}];
  st.players = [makePlayer(st, pc[0] || {}, 0), makePlayer(st, pc[1] || {}, 1)];
  st.first = cfg.first === 0 || cfg.first === 1 ? cfg.first : randInt(st, 2);
  st.active = st.first;
  const ev = [];
  for (let p = 0; p < 2; p++) {
    const pre = (pc[p] && pc[p].startBuildings) || [];
    for (const sb of pre) { st.players[p].lanes[sb.lane].building = Object.assign(mkInst(st, sb.id, sb.lvl || 1, p), { dmg: 0, flooped: false, fl: false, hidden: !!card(sb.id).kw.trap, born: 0 }); }
    for (let i = 0; i < START_HAND; i++) drawCard(st, p, ev, true);
  }
  ev.push({ t: 'setup', first: st.first });
  if (st.noMulligan) { st.players[0].mulled = false; st.players[1].mulled = false; startGame(st, ev); }
  return { state: st, events: ev };
}

function startGame(st, ev) {
  st.phase = 'main';
  st.turn = 0;
  beginTurn(st, ev);
}

// ---------------------------------------------------------------- CORE MUTATIONS
function drawCard(st, side, ev, silent) {
  const P = st.players[side];
  if (P.hand.length >= HAND_MAX) { ev.push({ t: 'handFull', side }); return null; }
  if (!P.deck.length) {
    if (!P.discard.length) return null;
    P.deck = P.discard.filter(c => !card(c.id).token); P.discard = [];
    shuffle(st, P.deck);
    ev.push({ t: 'reshuffle', side, n: P.deck.length });
    if (!P.deck.length) return null;
  }
  const c = P.deck.pop();
  P.hand.push(c);
  ev.push({ t: 'draw', side, uid: c.uid, id: c.id, silent: !!silent, rng: 1 });
  return c;
}

function toDiscard(st, inst) {
  if (card(inst.id).token) return;
  const owner = inst.owner == null ? 0 : inst.owner;
  st.players[owner].discard.push({ uid: inst.uid, id: inst.id, lvl: inst.lvl || 1, owner });
}

function damageCreature(st, side, lane, n, src, ev, kind) {
  const c = cr(st, side, lane);
  if (!c || n <= 0) return 0;
  if (src && src.side != null && src.side !== side && napping(st, side, lane)) { ev.push({ t: 'immune', side, lane }); return 0; }
  let absorbed = 0;
  if (c.shield > 0) { absorbed = Math.min(c.shield, n); c.shield -= absorbed; n -= absorbed; }
  if (n > 0) c.dmg += n;
  if (src && src.uid != null) c.lastHit = { side: src.side, uid: src.uid, atk: src.atk ? 1 : 0 };
  ev.push({ t: 'damage', side, lane, n, absorbed, kind: kind || 'fx', hp: cStats(st, side, lane).hp });
  return n;
}
function healCreature(st, side, lane, n, ev) {
  const c = cr(st, side, lane); if (!c || n <= 0 || c.rot || c.dmg <= 0) return 0;
  const h = Math.min(n, c.dmg); c.dmg -= h;
  ev.push({ t: 'heal', side, lane, n: h });
  return h;
}
function damageBuilding(st, side, lane, n, ev) {
  const b = bl(st, side, lane); if (!b || n <= 0) return 0;
  b.dmg += n;
  ev.push({ t: 'bdamage', side, lane, n, hp: bDef(b) - b.dmg });
  return n;
}
function damageHero(st, side, n, ev, kind) {
  if (n <= 0 || st.winner != null) return 0;
  const P = st.players[side];
  P.hp -= n;
  ev.push({ t: 'hero', side, n, hp: P.hp, kind: kind || 'fight' });
  return n;
}
function healHero(st, side, n, ev) {
  const P = st.players[side]; const h = Math.max(0, Math.min(n, P.maxHp - P.hp));
  if (h > 0) { P.hp += h; ev.push({ t: 'heroHeal', side, n: h, hp: P.hp }); }
  return h;
}
function addShield(st, side, lane, n, ev) {
  const c = cr(st, side, lane); if (!c) return;
  c.shield = Math.min(SHIELD_CAP, (c.shield || 0) + n);
  ev.push({ t: 'status', side, lane, s: 'shield', n: c.shield });
}
function applyBurn(st, side, lane, n, ev) {
  const c = cr(st, side, lane); if (!c || n <= 0) return;
  c.burn = Math.min(9, (c.burn || 0) + n);
  ev.push({ t: 'status', side, lane, s: 'burn', n: c.burn });
}
function applyRot(st, side, lane, ev) {
  const c = cr(st, side, lane); if (!c || c.rot) return;
  c.rot = true; ev.push({ t: 'status', side, lane, s: 'rot', n: 1 });
}
function freeze(st, side, lane, ev) {
  const c = cr(st, side, lane); if (!c) return;
  c.frozen = true; c.chill = 0;
  c.thawAt = st.active === side ? st.turn + 2 : st.turn + 1;
  ev.push({ t: 'status', side, lane, s: 'freeze', n: 1 });
}
function chill(st, side, lane, n, ev) {
  const c = cr(st, side, lane); if (!c || n <= 0) return;
  if (c.frozen) return;
  c.chill = (c.chill || 0) + n;
  if (c.chill >= 2) freeze(st, side, lane, ev);
  else ev.push({ t: 'status', side, lane, s: 'chill', n: c.chill });
}

function spawnToken(st, side, lane, id, ev) {
  if (!inLane(lane) || cr(st, side, lane)) return false;
  const inst = mkInst(st, id, 1, side);
  st.players[side].lanes[lane].creature = mkCreature(st, inst, side);
  ev.push({ t: 'summon', side, lane, uid: inst.uid, id, token: 1 });
  enterLane(st, side, lane, ev);
  return true;
}

// A creature entered a lane (played, put, raised, moved or stolen): enemy traps across spring.
function enterLane(st, side, lane, ev) {
  const o = 1 - side, b = bl(st, o, lane), c = cr(st, side, lane);
  if (!b || !b.hidden || !c) return;
  const cd = card(b.id);
  b.hidden = false;
  ev.push({ t: 'trap', side: o, lane, id: b.id, uid: b.uid });
  const ab = cd.ab.find(a => a.on === 'trap');
  if (ab) FX[ab.fx](st, ab, { side: o, lane, slot: 'b', uid: b.uid, id: b.id, lvl: b.lvl }, [{ side, lane }], ev);
  // traps are one-shot
  if (st.players[o].lanes[lane].building === b) {
    st.players[o].lanes[lane].building = null;
    toDiscard(st, b);
    ev.push({ t: 'bdeath', side: o, lane, uid: b.uid, id: b.id, spent: 1 });
  }
}

function placeCreature(st, side, lane, inst, ev, how) {
  const c = mkCreature(st, inst, side);
  st.players[side].lanes[lane].creature = c;
  ev.push({ t: 'summon', side, lane, uid: c.uid, id: c.id, how: how || 'play' });
  return c;
}

function moveCreature(st, side, from, to, ev, forced) {
  const L = st.players[side].lanes;
  const a = L[from].creature, b = L[to].creature;
  if (!a) return false;
  L[to].creature = a; L[from].creature = b;
  if (!forced) { a.moved = true; if (b) b.moved = true; }
  ev.push({ t: 'move', side, from, to, swap: !!b, forced: !!forced, uid: a.uid });
  if (!forced) {
    for (const [cc, ln] of [[a, to], [b, from]]) {
      if (!cc) continue;
      const ab = card(cc.id).ab.find(x => x.on === 'moved');
      if (ab) FX[ab.fx](st, ab, srcOf(st, side, ln, 'c'), [], ev);
    }
  }
  enterLane(st, side, to, ev);
  if (b) enterLane(st, side, from, ev);
  return true;
}

// Steal: creature moves to the other side. Lands in the same lane if free, else the nearest free lane,
// else it is destroyed. Stolen creatures arrive flooped (exhausted).
function takeControl(st, fromSide, lane, ev, prefLane) {
  const c = cr(st, fromSide, lane); if (!c) return false;
  const to = 1 - fromSide;
  st.players[fromSide].lanes[lane].creature = null;
  let dest = null;
  const pref = prefLane == null ? lane : prefLane;
  if (!cr(st, to, pref)) dest = pref;
  else {
    let best = 99;
    for (const l of emptyLanes(st, to)) if (Math.abs(l - pref) < best) { best = Math.abs(l - pref); dest = l; }
  }
  if (dest == null) {
    ev.push({ t: 'death', side: fromSide, lane, uid: c.uid, id: c.id, token: c.token ? 1 : 0, cause: 'nowhere' });
    toDiscard(st, c);
    return false;
  }
  c.flooped = true; c.fl = true; c.debuffs = []; c.chill = 0; c.tAtk = 0;
  st.players[to].lanes[dest].creature = c;
  ev.push({ t: 'steal', from: fromSide, lane, to, toLane: dest, uid: c.uid, id: c.id });
  enterLane(st, to, dest, ev);
  return true;
}

function srcOf(st, side, lane, slot) {
  const x = slot === 'b' ? bl(st, side, lane) : cr(st, side, lane);
  return x ? { side, lane, slot, uid: x.uid, id: x.id, lvl: x.lvl } : { side, lane, slot };
}

function destroyCreature(st, side, lane, ev, cause) {
  const P = st.players[side];
  const c = P.lanes[lane].creature; if (!c) return;
  const cd = card(c.id);
  const L = P.lanes[lane].land;
  P.lanes[lane].creature = null;
  ev.push({ t: 'death', side, lane, uid: c.uid, id: c.id, token: cd.token ? 1 : 0, cause: cause || 'killed' });
  // where the card goes
  if (!cd.token) {
    const owner = st.players[c.owner];
    if (cd.kw.immortal && owner.hand.length < HAND_MAX) {
      owner.hand.push({ uid: c.uid, id: c.id, lvl: c.lvl, owner: c.owner });
      ev.push({ t: 'immortal', side: c.owner, uid: c.uid, id: c.id });
    } else toDiscard(st, c);
  }
  const src = { side, lane, slot: 'c', uid: c.uid, id: c.id, lvl: c.lvl };
  for (const ab of cd.ab) if (ab.on === 'death') FX[ab.fx](st, ab, src, [], ev);
  // Muddy Pig: killing a creature that stood on a Useless Swamp gets the Pig stuck there.
  if (c.lastHit && c.lastHit.atk && cause === 'killed' && !L.down && L.type === 'swamp') {
    const k = findCreature(st, c.lastHit.uid);
    if (k && k.side !== side && card(k.c.id).kw.muddy) {
      const pigUid = k.c.uid;
      ev.push({ t: 'say', side: k.side, text: 'The Pig is stuck in the mud!' });
      takeControl(st, k.side, k.lane, ev, lane);
      const f = findCreature(st, pigUid); if (f) f.c.stuck = true;
    }
  }
  // Grave Muck (Useless Swamp home advantage)
  if (!cd.token && cd.land === 'swamp' && !L.down && L.type === 'swamp' && cause !== 'replace') spawnToken(st, side, lane, 't_zombie', ev);
  // Rot spreads to adjacent allies
  if (c.rot) for (const l of [lane - 1, lane + 1]) if (cr(st, side, l)) applyRot(st, side, l, ev);
  // allied-death triggers (Crypt)
  for (let l = lane - 1; l <= lane + 1; l++) {
    const b = bl(st, side, l);
    if (b && !b.hidden) for (const ab of card(b.id).ab) if (ab.on === 'allyDeath') FX[ab.fx](st, ab, srcOf(st, side, l, 'b'), [{ side, lane }], ev);
  }
  // any-death triggers (Grave Gobbler)
  for (let s = 0; s < 2; s++) for (let l = 0; l < LANES; l++) {
    const x = cr(st, s, l);
    if (x) for (const ab of card(x.id).ab) if (ab.on === 'anyDeath') FX[ab.fx](st, ab, srcOf(st, s, l, 'c'), [], ev);
  }
}

function destroyBuilding(st, side, lane, ev, cause) {
  const b = bl(st, side, lane); if (!b) return;
  st.players[side].lanes[lane].building = null;
  toDiscard(st, b);
  ev.push({ t: 'bdeath', side, lane, uid: b.uid, id: b.id, cause: cause || 'destroyed' });
}

function checkDeaths(st, ev) {
  for (let guard = 0; guard < 40; guard++) {
    let found = false;
    for (const side of [st.active, 1 - st.active]) {
      for (let l = 0; l < LANES; l++) {
        const c = cr(st, side, l);
        if (c && c.dmg >= cStats(st, side, l).def) { destroyCreature(st, side, l, ev, 'killed'); found = true; }
        const b = bl(st, side, l);
        if (b && b.dmg >= bDef(b)) { destroyBuilding(st, side, l, ev); found = true; }
      }
    }
    if (!found) break;
  }
  checkWin(st, ev);
}

function checkWin(st, ev) {
  if (st.winner != null) return true;
  const a = st.players[0].hp <= 0, b = st.players[1].hp <= 0;
  if (!a && !b) return false;
  st.winner = a && b ? st.active : (a ? 1 : 0);
  st.reason = 'hp';
  st.phase = 'over';
  ev.push({ t: 'gameOver', winner: st.winner, reason: 'hp' });
  return true;
}

// ---------------------------------------------------------------- EFFECTS (fx handlers)
// Signature: (state, ability, source, targets, events). Targets are {side,lane} or {uid}.
const FX = {
  noop() {},
  drawCards(st, ab, s, t, ev) { for (let i = 0; i < (ab.n || 1); i++) drawCard(st, s.side, ev); },
  coolStare(st, ab, s, t, ev) {
    const o = 1 - s.side, c = cr(st, o, s.lane);
    if (!c || napping(st, o, s.lane)) return;
    c.debuffs.push({ atk: -ab.n, exp: st.turn + 2 });
    ev.push({ t: 'buff', side: o, lane: s.lane, atk: -ab.n, temp: 1 });
  },
  study(st, ab, s, t, ev) {
    const c = cr(st, s.side, s.lane); if (!c) return;
    const b = bl(st, s.side, s.lane);
    c.study += (b && !b.hidden && b.id === 'b_school') ? 2 : 1;
    ev.push({ t: 'study', side: s.side, lane: s.lane, n: c.study });
    if (c.study >= 3 && t.length === 2) {
      c.study -= 3;
      ev.push({ t: 'say', side: s.side, text: 'Raise the Dead!' });
      raise(st, s.side, t[0].uid, t[1].lane, ev, false);
    }
  },
  buffSelfTurn(st, ab, s, t, ev) { const c = cr(st, s.side, s.lane); if (c) { c.tAtk += ab.n; ev.push({ t: 'buff', side: s.side, lane: s.lane, atk: ab.n, temp: 1 }); } },
  eatLand(st, ab, s, t, ev) {
    const o = 1 - s.side, L = land(st, o, s.lane);
    if (!L.down) { L.down = true; ev.push({ t: 'land', side: o, lane: s.lane, type: L.type, down: true, cause: 'eat' }); }
    if (cr(st, o, s.lane)) damageCreature(st, o, s.lane, 1, s, ev);
  },
  schoolLearn(st, ab, s, t, ev) {
    const c = cr(st, s.side, s.lane);
    if (c && c.school < 2) { c.school++; c.pDef++; ev.push({ t: 'buff', side: s.side, lane: s.lane, def: 1, perm: 1 }); }
  },
  readyCreature(st, ab, s, t, ev) {
    const c = cr(st, t[0].side, t[0].lane); if (!c) return;
    c.flooped = false; ev.push({ t: 'ready', side: t[0].side, lane: t[0].lane });
  },
  teamBuffTurn(st, ab, s, t, ev) {
    const n = abN(ab, s.lvl);
    for (let l = 0; l < LANES; l++) { const c = cr(st, s.side, l); if (c) { c.tAtk += n; ev.push({ t: 'buff', side: s.side, lane: l, atk: n, temp: 1 }); } }
    for (let i = 0; i < (ab.draw || 0); i++) drawCard(st, s.side, ev);
  },
  relocate(st, ab, s, t, ev) {
    const a = t[0], b = t[1];
    if (!cr(st, a.side, a.lane) || cr(st, a.side, b.lane)) return;
    moveCreature(st, a.side, a.lane, b.lane, ev, true);
  },
  tokensAdj(st, ab, s, t, ev) { for (const l of [s.lane - 1, s.lane + 1]) spawnToken(st, s.side, l, ab.token, ev); },
  tokenRandomEmpty(st, ab, s, t, ev) {
    const e = emptyLanes(st, s.side); if (!e.length) return;
    spawnToken(st, s.side, e[randInt(st, e.length)], ab.token, ev);
  },
  tokensAllEmpty(st, ab, s, t, ev) { for (const l of emptyLanes(st, s.side)) spawnToken(st, s.side, l, ab.token, ev); },
  tokenAt(st, ab, s, t, ev) { spawnToken(st, s.side, t[0].lane, ab.token, ev); },
  tokenHere(st, ab, s, t, ev) { spawnToken(st, s.side, s.lane, ab.token, ev); },
  bloodstorm(st, ab, s, t, ev) {
    const n = abN(ab, s.lvl);
    for (let side = 0; side < 2; side++) for (let l = 0; l < LANES; l++) {
      const c = cr(st, side, l); if (c && !c.flooped) damageCreature(st, side, l, n, { side: s.side }, ev);
    }
  },
  convertLand(st, ab, s, t, ev) {
    const L = land(st, t[0].side, t[0].lane);
    L.type = ab.land; L.down = false; L.by = t[0].side === s.side ? null : s.side;
    ev.push({ t: 'land', side: t[0].side, lane: t[0].lane, type: ab.land, down: false, cause: 'convert' });
    if (ab.chill && cr(st, t[0].side, t[0].lane)) chill(st, t[0].side, t[0].lane, ab.chill, ev);
    if (ab.dmg && cr(st, t[0].side, t[0].lane)) damageCreature(st, t[0].side, t[0].lane, ab.dmg + (s.lvl >= 3 ? 1 : 0), { side: s.side }, ev);
  },
  siloPeek(st, ab, s, t, ev) {
    const o = 1 - s.side, O = st.players[o];
    O.revealTurn = st.turn; O.peekTurn = st.turn;
    const traps = [];
    for (let l = 0; l < LANES; l++) { const b = bl(st, o, l); if (b && b.hidden) traps.push({ lane: l, id: b.id }); }
    ev.push({ t: 'reveal', side: o, to: s.side, cards: O.hand.map(c => c.id), traps, info: 1 });
    const opts = O.hand.filter(c => card(c.id).type === 'spell').map(c => c.uid);
    if (opts.length) { st.pending = { kind: 'steal', side: s.side, from: o, options: opts }; ev.push({ t: 'pending', side: s.side, kind: 'steal' }); }
  },
  gobble(st, ab, s, t, ev) {
    const c = cr(st, s.side, s.lane);
    if (c && c.gob < (ab.n || 3)) { c.gob++; c.pAtk++; ev.push({ t: 'buff', side: s.side, lane: s.lane, atk: 1, perm: 1 }); }
  },
  rotAllEnemies(st, ab, s, t, ev) { const o = 1 - s.side; for (let l = 0; l < LANES; l++) if (targetable(st, o, l, s.side)) applyRot(st, o, l, ev); },
  cryptRaise(st, ab, s, t, ev) { spawnToken(st, s.side, s.lane, ab.token, ev); },
  mudTrap(st, ab, s, t, ev) { const v = cr(st, t[0].side, t[0].lane); if (v) { v.stuck = true; ev.push({ t: 'status', side: t[0].side, lane: t[0].lane, s: 'stuck', n: 1 }); applyRot(st, t[0].side, t[0].lane, ev); } },
  cauldron(st, ab, s, t, ev) {
    if (!cr(st, s.side, s.lane)) return;
    destroyCreature(st, s.side, s.lane, ev, 'sacrifice');
    drawCard(st, s.side, ev); drawCard(st, s.side, ev);
    st.players[s.side].actions += 1;
    ev.push({ t: 'actions', side: s.side, n: st.players[s.side].actions });
  },
  reap(st, ab, s, t, ev) {
    const o = 1 - s.side, lim = abN(ab, s.lvl);
    for (let l = 0; l < LANES; l++) {
      const c = cr(st, o, l);
      if (c && c.dmg > 0 && targetable(st, o, l, s.side) && cStats(st, o, l).hp <= lim) takeControl(st, o, l, ev);
    }
  },
  unearth(st, ab, s, t, ev) { raise(st, s.side, t[0].uid, t[1].lane, ev, true); },
  dmgRot(st, ab, s, t, ev) {
    const x = t[0]; if (!cr(st, x.side, x.lane)) return;
    applyRot(st, x.side, x.lane, ev);
    damageCreature(st, x.side, x.lane, abN(ab, s.lvl), { side: s.side }, ev);
  },
  gunter(st, ab, s, t, ev) {
    const o = 1 - s.side; const opts = [];
    for (let l = 0; l < LANES; l++) if (targetable(st, o, l, s.side)) opts.push(l);
    if (!opts.length) return;
    const l = opts[randInt(st, opts.length)];
    ev.push({ t: 'zap', from: { side: s.side, lane: s.lane }, to: { side: o, lane: l }, kind: 'ice', rng: 1 });
    damageCreature(st, o, l, 1, s, ev); chill(st, o, l, 1, ev);
  },
  chillTarget(st, ab, s, t, ev) { chill(st, t[0].side, t[0].lane, ab.n || 1, ev); },
  push(st, ab, s, t, ev) {
    const o = 1 - s.side, from = s.lane, to = t[0].lane;
    const e = cr(st, o, from); if (!e || napping(st, o, from)) return;
    const n = ab.n || 2;
    if (e.stuck) { damageCreature(st, o, from, n, s, ev); return; }
    if (cr(st, o, to)) {
      ev.push({ t: 'crash', side: o, from, to });
      damageCreature(st, o, from, n, s, ev); damageCreature(st, o, to, n, s, ev);
      return;
    }
    moveCreature(st, o, from, to, ev, true);
  },
  iceKing(st, ab, s, t, ev) {
    const o = 1 - s.side;
    if (targetable(st, o, s.lane, s.side)) freeze(st, o, s.lane, ev);
    for (let l = 0; l < LANES; l++) if (l !== s.lane && targetable(st, o, l, s.side)) chill(st, o, l, 1, ev);
  },
  chillAcross(st, ab, s, t, ev) { const o = 1 - s.side; if (targetable(st, o, s.lane, s.side)) chill(st, o, s.lane, 1, ev); },
  iceTrap(st, ab, s, t, ev) { const v = t[0]; if (!cr(st, v.side, v.lane)) return; freeze(st, v.side, v.lane, ev); damageCreature(st, v.side, v.lane, ab.n || 2, s, ev); },
  freezeTarget(st, ab, s, t, ev) { freeze(st, t[0].side, t[0].lane, ev); },
  blizzard(st, ab, s, t, ev) {
    const o = 1 - s.side, n = abN(ab, s.lvl);
    for (let l = 0; l < LANES; l++) if (targetable(st, o, l, s.side)) { damageCreature(st, o, l, n, { side: s.side }, ev); chill(st, o, l, 1, ev); }
  },
  shieldTarget(st, ab, s, t, ev) { addShield(st, t[0].side, t[0].lane, ab.n, ev); },
  healTarget(st, ab, s, t, ev) { healCreature(st, t[0].side, t[0].lane, ab.n, ev); },
  shieldSelf(st, ab, s, t, ev) { addShield(st, s.side, s.lane, ab.n, ev); },
  pbScience(st, ab, s, t, ev) {
    const o = 1 - s.side;
    for (let l = 0; l < LANES; l++) {
      const b = bl(st, s.side, l);
      if (b && !b.hidden && targetable(st, o, l, s.side)) {
        ev.push({ t: 'zap', from: { side: s.side, lane: l, slot: 'b' }, to: { side: o, lane: l }, kind: 'science' });
        damageCreature(st, o, l, ab.n, s, ev);
      }
    }
  },
  gumdrop(st, ab, s, t, ev) {
    const c = cr(st, s.side, s.lane); if (!c) return;
    let towers = 0;
    for (let l = 0; l < LANES; l++) { const b = bl(st, s.side, l); if (b && !b.hidden && b.id === 'n_tower') towers++; }
    const want = towers >= 2 ? 2 : 1;
    if (c.shield < want) { c.shield = want; ev.push({ t: 'status', side: s.side, lane: s.lane, s: 'shield', n: c.shield }); }
  },
  bubble(st, ab, s, t, ev) {
    const x = t[0], n = abN(ab, s.lvl);
    for (let l = x.lane - 1; l <= x.lane + 1; l++) if (cr(st, x.side, l)) addShield(st, x.side, l, n, ev);
  },
  science(st, ab, s, t, ev) {
    let has = false; for (let l = 0; l < LANES; l++) if (bl(st, s.side, l)) has = true;
    drawCard(st, s.side, ev); if (has) drawCard(st, s.side, ev);
  },
  dmgTarget(st, ab, s, t, ev) { damageCreature(st, t[0].side, t[0].lane, abN(ab, s.lvl), { side: s.side }, ev); },
  burnTarget(st, ab, s, t, ev) { applyBurn(st, t[0].side, t[0].lane, ab.n, ev); },
  explodeAcross(st, ab, s, t, ev) {
    const o = 1 - s.side;
    if (targetable(st, o, s.lane, s.side)) { ev.push({ t: 'zap', from: { side: s.side, lane: s.lane }, to: { side: o, lane: s.lane }, kind: 'fire' }); damageCreature(st, o, s.lane, ab.n, { side: s.side }, ev); }
  },
  burnAllEnemies(st, ab, s, t, ev) { const o = 1 - s.side; for (let l = 0; l < LANES; l++) if (targetable(st, o, l, s.side)) applyBurn(st, o, l, ab.n, ev); },
  forge(st, ab, s, t, ev) {
    const c = cr(st, s.side, s.lane);
    if (c && c.forge < (ab.n || 2)) { c.forge++; c.pAtk++; ev.push({ t: 'buff', side: s.side, lane: s.lane, atk: 1, perm: 1, forge: 1 }); }
  },
  cannon(st, ab, s, t, ev) {
    const o = 1 - s.side, b = bl(st, o, s.lane);
    ev.push({ t: 'zap', from: { side: s.side, lane: s.lane, slot: 'b' }, to: { side: o, lane: s.lane, slot: b && !b.hidden ? 'b' : (cr(st, o, s.lane) ? 'c' : 'hero') }, kind: 'cannon' });
    if (b && !b.hidden) damageBuilding(st, o, s.lane, 3, ev);
    else if (targetable(st, o, s.lane, s.side)) damageCreature(st, o, s.lane, 2, s, ev);
    else if (!cr(st, o, s.lane)) damageHero(st, o, 2, ev, 'cannon');
  },
  firePit(st, ab, s, t, ev) { const o = 1 - s.side; for (let l = s.lane - 1; l <= s.lane + 1; l++) if (targetable(st, o, l, s.side)) applyBurn(st, o, l, 1, ev); },
  fireball(st, ab, s, t, ev) {
    const x = t[0]; if (!cr(st, x.side, x.lane)) return;
    damageCreature(st, x.side, x.lane, abN(ab, s.lvl), { side: s.side }, ev);
    for (const l of [x.lane - 1, x.lane + 1]) if (cr(st, x.side, l) && (x.side === s.side || targetable(st, x.side, l, s.side))) damageCreature(st, x.side, l, 1, { side: s.side }, ev);
  },
  heatwave(st, ab, s, t, ev) {
    const o = 1 - s.side;
    damageHero(st, o, abN(ab, s.lvl), ev, 'spell');
    for (let l = 0; l < LANES; l++) if (targetable(st, o, l, s.side)) applyBurn(st, o, l, 1, ev);
  },
  wander(st, ab, s, t, ev) {
    const c = cr(st, s.side, s.lane); if (!c || c.stuck || c.frozen) return;
    const L = land(st, s.side, s.lane);
    if (!L.down && L.type === 'swamp') { c.stuck = true; ev.push({ t: 'status', side: s.side, lane: s.lane, s: 'stuck', n: 1 }); return; }
    const e = emptyLanes(st, s.side); if (!e.length) return;
    const to = e[randInt(st, e.length)];
    moveCreature(st, s.side, s.lane, to, ev, true);
    const L2 = land(st, s.side, to), c2 = cr(st, s.side, to);
    if (c2 === c && !L2.down && L2.type === 'swamp') { c.stuck = true; ev.push({ t: 'status', side: s.side, lane: to, s: 'stuck', n: 1 }); }
  },
  danVolley(st, ab, s, t, ev) {
    const o = 1 - s.side, n = abN(ab, s.lvl);
    for (let l = 0; l < LANES; l++) if (bl(st, o, l)) {
      ev.push({ t: 'zap', from: { side: s.side, lane: s.lane }, to: { side: o, lane: l, slot: 'b' }, kind: 'arrow' });
      damageBuilding(st, o, l, n, ev);
    }
  },
  healHero(st, ab, s, t, ev) { healHero(st, s.side, ab.n || 2, ev); },
  teleport(st, ab, s, t, ev) {
    const a = t[0], b = t[1];
    if (!cr(st, a.side, a.lane)) return;
    moveCreature(st, a.side, a.lane, b.lane, ev, true);
  },
  reclaim(st, ab, s, t, ev) {
    for (let l = 0; l < LANES; l++) {
      const L = land(st, s.side, l);
      if (L.down || (L.by != null && L.by !== s.side)) {
        L.down = false; if (L.by != null && L.by !== s.side) { L.type = L.orig; L.by = null; }
        ev.push({ t: 'land', side: s.side, lane: l, type: L.type, down: false, cause: 'reclaim' });
      }
    }
  },
  volcano(st, ab, s, t, ev) {
    ev.push({ t: 'volcano', side: s.side, lane: s.lane });
    for (const side of [s.side, 1 - s.side]) for (let l = 0; l < LANES; l++) if (cr(st, side, l)) destroyCreature(st, side, l, ev, 'volcano');
    destroyBuilding(st, s.side, s.lane, ev, 'erupted');
  },
  healHere(st, ab, s, t, ev) { healCreature(st, s.side, s.lane, ab.n || 2, ev); },
  portalTwin(st, ab, s, t, ev) {
    const P = st.players[s.side]; const opts = [];
    for (let l = 0; l < LANES; l++) if (l !== s.lane && !P.lanes[l].building) opts.push(l);
    if (!opts.length) return;
    const l = opts[randInt(st, opts.length)];
    const inst = mkInst(st, 'r_portal', s.lvl || 1, s.side);
    P.lanes[l].building = Object.assign(inst, { dmg: 0, flooped: false, fl: false, hidden: false, born: st.turn, twin: 1 });
    ev.push({ t: 'build', side: s.side, lane: l, uid: inst.uid, id: 'r_portal', twin: 1, rng: 1 });
  },
  boobyTrap(st, ab, s, t, ev) { const v = t[0]; if (cr(st, v.side, v.lane)) damageCreature(st, v.side, v.lane, ab.n || 3, s, ev); }
};

function raise(st, side, uid, lane, ev, rot) {
  const P = st.players[side];
  const i = P.discard.findIndex(c => c.uid === uid);
  if (i < 0 || cr(st, side, lane)) return false;
  const inst = P.discard.splice(i, 1)[0];
  const c = placeCreature(st, side, lane, inst, ev, 'raise');
  if (rot) applyRot(st, side, lane, ev);
  enterLane(st, side, lane, ev);
  return !!c;
}

// ---------------------------------------------------------------- TARGETING
// Target kinds -> option lists. Options: {side,lane} for creatures/lanes/lands, {uid} for cards.
const TG = {
  enemyCreature(st, p) { const o = 1 - p, r = []; for (let l = 0; l < LANES; l++) if (targetable(st, o, l, p)) r.push({ side: o, lane: l }); return r; },
  allyCreature(st, p) { const r = []; for (let l = 0; l < LANES; l++) if (cr(st, p, l)) r.push({ side: p, lane: l }); return r; },
  anyCreature(st, p) { return TG.allyCreature(st, p).concat(TG.enemyCreature(st, p)); },
  myFlooped(st, p) { const r = []; for (let l = 0; l < LANES; l++) { const c = cr(st, p, l); if (c && c.flooped && !c.frozen) r.push({ side: p, lane: l }); } return r; },
  anyMovable(st, p) {
    const r = [];
    for (let s = 0; s < 2; s++) {
      if (!emptyLanes(st, s).length) continue;
      for (let l = 0; l < LANES; l++) { const c = cr(st, s, l); if (c && !c.stuck && targetable(st, s, l, p)) r.push({ side: s, lane: l }); }
    }
    return r;
  },
  emptyLaneSameSide(st, p, src, ch) { return emptyLanes(st, ch[0].side).map(l => ({ side: ch[0].side, lane: l })); },
  myLand(st, p) { return [0, 1, 2, 3].map(l => ({ side: p, lane: l, land: 1 })); },
  anyLand(st, p) { const r = []; for (let s of [p, 1 - p]) for (let l = 0; l < LANES; l++) r.push({ side: s, lane: l, land: 1 }); return r; },
  adjEmptyLane(st, p, src) { return [src.lane - 1, src.lane + 1].filter(l => inLane(l) && !cr(st, p, l)).map(l => ({ side: p, lane: l })); },
  myDiscardCreature(st, p) {
    const seen = {}, r = [];
    for (const c of st.players[p].discard) { const cd = card(c.id); if (cd.type === 'creature' && !cd.token && !seen[c.id + ':' + c.lvl]) { seen[c.id + ':' + c.lvl] = 1; r.push({ uid: c.uid, id: c.id }); } }
    return r;
  },
  myEmptyLane(st, p) { return emptyLanes(st, p).map(l => ({ side: p, lane: l })); },
  myMovable(st, p) { const r = []; for (let l = 0; l < LANES; l++) { const c = cr(st, p, l); if (c && !c.stuck) r.push({ side: p, lane: l }); } return r; },
  myOtherLane(st, p, src, ch) {
    const r = [];
    for (let l = 0; l < LANES; l++) { if (l === ch[0].lane) continue; const c = cr(st, p, l); if (!c || !c.stuck) r.push({ side: p, lane: l }); }
    return r;
  },
  pushDir(st, p, src) {
    const o = 1 - p; if (!targetable(st, o, src.lane, p)) return [];
    return [src.lane - 1, src.lane + 1].filter(inLane).map(l => ({ side: o, lane: l }));
  },
  enemyNearMyBuilding(st, p) { const o = 1 - p, r = []; for (let l = 0; l < LANES; l++) if (bl(st, p, l) && targetable(st, o, l, p)) r.push({ side: o, lane: l }); return r; }
};
// Dynamic target plans (targets depend on the state).
const PLANS = {
  scholar(st, p, src) {
    const c = cr(st, p, src.lane); if (!c) return [];
    const b = bl(st, p, src.lane);
    const gain = (b && !b.hidden && b.id === 'b_school') ? 2 : 1;
    if (c.study + gain >= 3 && TG.myDiscardCreature(st, p).length && emptyLanes(st, p).length) return ['myDiscardCreature', 'myEmptyLane'];
    return [];
  }
};

function abilityOf(st, p, src) {
  if (src.uid != null && src.lane == null) {
    const inst = st.players[p].hand.find(c => c.uid === src.uid); if (!inst) return null;
    const cd = card(inst.id);
    if (cd.type === 'spell') return cd.ab.find(a => a.on === 'cast') || null;
    return null;
  }
  const x = src.slot === 'b' ? bl(st, p, src.lane) : cr(st, p, src.lane);
  return x ? card(x.id).floop : null;
}
function targetSteps(st, p, src) {
  const ab = abilityOf(st, p, src); if (!ab) return [];
  if (ab.plan) return PLANS[ab.plan](st, p, src);
  return ab.tg || [];
}
// Options for the next target step, given choices made so far. Returns null when no more steps.
function targetOptions(st, p, src, chosen) {
  const steps = targetSteps(st, p, src);
  chosen = chosen || [];
  if (chosen.length >= steps.length) return null;
  return TG[steps[chosen.length]](st, p, src, chosen);
}
function sameOpt(a, b) {
  if (a.uid != null || b.uid != null) return a.uid === b.uid;
  return a.side === b.side && a.lane === b.lane;
}
function validTargets(st, p, src, targets) {
  const steps = targetSteps(st, p, src);
  targets = targets || [];
  if (targets.length !== steps.length) return false;
  for (let i = 0; i < steps.length; i++) {
    const opts = TG[steps[i]](st, p, src, targets.slice(0, i));
    if (!opts.some(o => sameOpt(o, targets[i]))) return false;
  }
  return true;
}

// ---------------------------------------------------------------- RULE QUERIES
function spellCost(st, p, cd) {
  let c = cd.cost;
  if (cd.type === 'spell' && st.players[p].spells === 0) {
    for (let l = 0; l < LANES; l++) { const b = bl(st, p, l); if (b && !b.hidden && card(b.id).kw.spellDiscount) { c = Math.max(0, c - 1); break; } }
  }
  return c;
}
function costOf(st, p, uid) {
  const inst = st.players[p].hand.find(c => c.uid === uid); if (!inst) return 99;
  return spellCost(st, p, card(inst.id));
}
function meetsReq(st, p, cd) { return cd.land === 'rainbow' || cd.req <= 0 || countLand(st, p, cd.land) >= cd.req; }

// Why a card can't be played (or '' if it can, ignoring targets/lanes).
function playBlock(st, p, uid) {
  if (st.winner != null) return 'The game is over';
  if (st.pending) return 'Finish your choice first';
  if (st.phase !== 'main' || st.active !== p) return 'Not your turn';
  const inst = st.players[p].hand.find(c => c.uid === uid); if (!inst) return 'Not in hand';
  const cd = card(inst.id);
  if (cd.type === 'unknown') return 'Unknown card';
  const cost = spellCost(st, p, cd);
  if (cost > st.players[p].actions) return 'Needs ' + cost + ' Action' + (cost > 1 ? 's' : '');
  if (!meetsReq(st, p, cd)) return 'Needs ' + cd.req + ' face-up ' + LANDS[cd.land].name;
  return '';
}
function playLanes(st, p, uid) {
  const inst = st.players[p].hand.find(c => c.uid === uid); if (!inst) return [];
  const cd = card(inst.id), r = [];
  for (let l = 0; l < LANES; l++) {
    if (cd.type === 'creature') { const c = cr(st, p, l); if (!c || !c.flooped) r.push(l); }
    else if (cd.type === 'building') r.push(l);
  }
  return r;
}
function floopBlock(st, p, lane, slot) {
  if (st.winner != null) return 'The game is over';
  if (st.pending) return 'Finish your choice first';
  if (st.phase !== 'main' || st.active !== p) return 'Not your turn';
  if (st.turn === 1) return 'The first player can\'t floop on turn 1';
  const x = slot === 'b' ? bl(st, p, lane) : cr(st, p, lane);
  if (!x) return 'Nothing there';
  const cd = card(x.id), ab = cd.floop;
  if (!ab) return 'No FLOOP ability';
  if (x.hidden) return 'Traps spring on their own';
  if (x.flooped) return 'Already flooped';
  if (slot !== 'b' && x.frozen) return 'Frozen';
  if ((ab.cost || 0) > st.players[p].actions) return 'Needs ' + ab.cost + ' Action';
  if (ab.cond === 'notFresh' && x.born === st.turn) return 'Needs a turn to rumble';
  if (ab.cond === 'myCreatureHere' && !cr(st, p, lane)) return 'Needs your creature in this lane';
  const steps = targetSteps(st, p, { lane, slot });
  if (steps.length && !hasTargetChain(st, p, { lane, slot }, [])) return 'No valid target';
  return '';
}
function hasTargetChain(st, p, src, chosen) {
  const opts = targetOptions(st, p, src, chosen);
  if (opts === null) return true;
  for (const o of opts) if (hasTargetChain(st, p, src, chosen.concat([o]))) return true;
  return false;
}
function moveCost(st, p, from, to) {
  const c = cr(st, p, from); if (!c) return 99;
  const bf = bl(st, p, from), bt = bl(st, p, to);
  if (bf && bt && !bf.hidden && !bt.hidden && card(bf.id).kw.portal && card(bt.id).kw.portal) return 0;
  if (Math.abs(from - to) !== 1) return 99;
  const L = land(st, p, from);
  if (card(c.id).land === 'blue' && !L.down && L.type === 'blue') return 0;
  return 1;
}
function moveOptions(st, p, from) {
  const c = cr(st, p, from), r = [];
  if (!c || st.active !== p || st.phase !== 'main' || st.pending || st.winner != null) return r;
  if (c.frozen || c.stuck || c.moved) return r;
  for (let to = 0; to < LANES; to++) {
    if (to === from) continue;
    const cost = moveCost(st, p, from, to);
    if (cost > st.players[p].actions) continue;
    const o = cr(st, p, to);
    if (o && (o.frozen || o.stuck || o.moved)) continue;
    r.push({ to, cost, swap: !!o });
  }
  return r;
}
function canAttack(st, side, lane) {
  const c = cr(st, side, lane);
  if (!c || st.turn === 1 || c.flooped || c.frozen) return false;
  if (card(c.id).kw.collapse && land(st, side, lane).down) return false;
  return cStats(st, side, lane).atk > 0;
}

// ---------------------------------------------------------------- TURN FLOW
function beginTurn(st, ev) {
  st.turn += 1;
  st.round = Math.ceil(st.turn / 2);
  const p = st.active, P = st.players[p];
  P.actions = ACTIONS + (st.turn <= 2 ? P.bonusActions : 0);
  P.spells = 0;
  for (let s = 0; s < 2; s++) for (let l = 0; l < LANES; l++) {
    const c = cr(st, s, l);
    if (c && c.debuffs.length) c.debuffs = c.debuffs.filter(d => d.exp > st.turn);
  }
  for (let l = 0; l < LANES; l++) {
    const c = cr(st, p, l); if (c) { c.flooped = false; c.fl = false; c.moved = false; }
    const b = bl(st, p, l); if (b) { b.flooped = false; b.fl = false; }
  }
  ev.push({ t: 'turn', side: p, turn: st.turn, round: st.round });
  if (st.round > MAX_ROUNDS) { endByRounds(st, ev); return; }
  if (st.round >= st.ot) {
    const n = st.round - st.ot + 1;
    ev.push({ t: 'overtime', side: p, n });
    damageHero(st, p, n, ev, 'overtime');
    if (checkWin(st, ev)) return;
  }
  // start-of-turn effects: home heals, then buildings, then creatures (left to right)
  for (let l = 0; l < LANES; l++) {
    const c = cr(st, p, l);
    if (c && card(c.id).land === 'nice' && onHome(st, p, l)) healCreature(st, p, l, 1, ev);
  }
  for (let l = 0; l < LANES; l++) {
    const b = bl(st, p, l);
    if (b && !b.hidden) for (const ab of card(b.id).ab) if (ab.on === 'start') FX[ab.fx](st, ab, srcOf(st, p, l, 'b'), [], ev);
  }
  const uids = [];
  for (let l = 0; l < LANES; l++) { const c = cr(st, p, l); if (c) uids.push(c.uid); }
  for (const uid of uids) {
    const f = findCreature(st, uid); if (!f || f.side !== p) continue;
    for (const ab of card(f.c.id).ab) if (ab.on === 'start') FX[ab.fx](st, ab, srcOf(st, p, f.lane, 'c'), [], ev);
  }
  checkDeaths(st, ev);
  if (st.winner != null) return;
  if (st.turn > 1) drawCard(st, p, ev);   // the first player skips their first draw
}

function endByRounds(st, ev) {
  const a = st.players[0].hp, b = st.players[1].hp;
  st.winner = a === b ? -1 : (a > b ? 0 : 1);
  st.reason = 'rounds'; st.phase = 'over';
  ev.push({ t: 'gameOver', winner: st.winner, reason: 'rounds' });
}

function resolveAttack(st, p, lane, ev) {
  const o = 1 - p, A = cr(st, p, lane), ak = card(A.id).kw;
  const atk = cStats(st, p, lane).atk;
  if (atk <= 0) return;
  const ob = bl(st, o, lane);
  // Spirit Tower: big attackers get possessed
  if (ob && !ob.hidden && card(ob.id).kw.spirit && atk >= card(ob.id).kw.spirit) {
    ev.push({ t: 'spirit', side: o, lane, uid: A.uid });
    takeControl(st, p, lane, ev, lane);
    destroyBuilding(st, o, lane, ev, 'faded');
    return;
  }
  let D = cr(st, o, lane), dLane = lane;
  if (D && napping(st, o, lane)) D = null;
  if (D && ak.flying && !card(D.id).kw.flying) D = null;
  if (!D && !ak.flying) {
    let best = -1, bestHp = -1;
    for (const l of [lane - 1, lane + 1]) {
      const g = cr(st, o, l);
      if (g && card(g.id).kw.guard && !g.frozen && !napping(st, o, l)) { const hp = cStats(st, o, l).hp; if (hp > bestHp) { bestHp = hp; best = l; } }
    }
    if (best >= 0) { D = cr(st, o, best); dLane = best; }
  }
  const src = { side: p, lane, uid: A.uid, atk: 1 };
  if (D) {
    const dk = card(D.id).kw, ds = cStats(st, o, dLane);
    let toD = atk + (ak.vsChill && (D.chill > 0 || D.frozen) ? ak.vsChill : 0);
    let back = 0;
    if (!(ak.ranged && !dk.ranged) && !D.frozen) back = ds.atk + (dk.vsChill && (A.chill > 0 || A.frozen) ? dk.vsChill : 0);
    ev.push({ t: 'attack', side: p, lane, toSide: o, toLane: dLane, kind: 'creature', guard: dLane !== lane ? 1 : 0, ranged: ak.ranged ? 1 : 0, flying: ak.flying ? 1 : 0, back });
    const dealtD = damageCreature(st, o, dLane, toD, src, ev, 'fight');
    const dealtA = back > 0 ? damageCreature(st, p, lane, back, { side: o, lane: dLane, uid: D.uid }, ev, 'fight') : 0;
    if (dealtD > 0) onFightHit(st, p, lane, o, dLane, ev);
    if (dealtA > 0) onFightHit(st, o, dLane, p, lane, ev);
    if (ak.lifesteal && dealtD > 0) healHero(st, p, dealtD, ev);
    if (dk.lifesteal && dealtA > 0) healHero(st, o, dealtA, ev);
    return;
  }
  const B = bl(st, o, lane);
  if (B && !B.hidden) {
    const rem = bDef(B) - B.dmg;
    const hit = atk + (ak.siege || 0);
    ev.push({ t: 'attack', side: p, lane, toSide: o, toLane: lane, kind: 'building', flying: ak.flying ? 1 : 0, ranged: ak.ranged ? 1 : 0 });
    damageBuilding(st, o, lane, hit, ev);
    const th = card(B.id).kw.thorns;
    if (th && !ak.ranged) damageCreature(st, p, lane, th, { side: o }, ev, 'thorns');
    const spill = Math.min(atk, Math.max(0, hit - rem));
    if (spill > 0) damageHero(st, o, spill, ev, 'fight');
    if (ak.lifesteal) healHero(st, p, Math.min(atk, rem) + spill, ev);
    return;
  }
  ev.push({ t: 'attack', side: p, lane, toSide: o, toLane: lane, kind: 'hero', flying: ak.flying ? 1 : 0, ranged: ak.ranged ? 1 : 0 });
  damageHero(st, o, atk, ev, 'fight');
  if (ak.lifesteal) healHero(st, p, atk, ev);
}

function onFightHit(st, aSide, aLane, dSide, dLane, ev) {
  const A = cr(st, aSide, aLane), D = cr(st, dSide, dLane); if (!A || !D) return;
  const ak = card(A.id).kw, home = onHome(st, aSide, aLane), land0 = card(A.id).land;
  if (ak.rotter) applyRot(st, dSide, dLane, ev);
  if (ak.chiller || (home && land0 === 'ice')) chill(st, dSide, dLane, 1, ev);
  if (home && land0 === 'lava') applyBurn(st, dSide, dLane, 1, ev);
}

function fightPhase(st, ev) {
  const p = st.active;
  ev.push({ t: 'fightPhase', side: p });
  for (let lane = 0; lane < LANES; lane++) {
    if (!canAttack(st, p, lane)) continue;
    resolveAttack(st, p, lane, ev);
    checkDeaths(st, ev);
    if (st.winner != null) return;
  }
}

function endTurn(st, ev) {
  const p = st.active, P = st.players[p];
  if (st.turn > 1) fightPhase(st, ev);
  if (st.winner != null) return;
  // end-of-turn building effects
  for (let l = 0; l < LANES; l++) {
    const b = bl(st, p, l);
    if (b && !b.hidden) for (const ab of card(b.id).ab) if (ab.on === 'end') FX[ab.fx](st, ab, srcOf(st, p, l, 'b'), [], ev);
  }
  checkDeaths(st, ev); if (st.winner != null) return;
  // Ripen
  for (let l = 0; l < LANES; l++) {
    const c = cr(st, p, l);
    if (c && card(c.id).kw.ripen && !c.fl && !c.moved && c.ripen < 1) {
      const L = land(st, p, l);
      if (!L.down && L.type === 'corn') { c.ripen++; c.pAtk++; c.pDef++; ev.push({ t: 'buff', side: p, lane: l, atk: 1, def: 1, perm: 1, ripen: 1 }); }
    }
  }
  // Burn & Rot tick on the active player's creatures
  for (let l = 0; l < LANES; l++) {
    const c = cr(st, p, l); if (!c) continue;
    if (c.burn > 0) { const n = c.burn; c.burn--; damageCreature(st, p, l, n, null, ev, 'burn'); }
    if (cr(st, p, l) && c.rot) damageCreature(st, p, l, 1, null, ev, 'rot');
  }
  checkDeaths(st, ev); if (st.winner != null) return;
  // Thaw & chill wear-off
  for (let l = 0; l < LANES; l++) {
    const c = cr(st, p, l); if (!c) continue;
    if (c.frozen && c.thawAt <= st.turn) { c.frozen = false; ev.push({ t: 'status', side: p, lane: l, s: 'thaw', n: 0 }); }
    if (c.chill) { c.chill = 0; ev.push({ t: 'status', side: p, lane: l, s: 'chill', n: 0 }); }
  }
  for (let s = 0; s < 2; s++) for (let l = 0; l < LANES; l++) { const c = cr(st, s, l); if (c) c.tAtk = 0; }
  ev.push({ t: 'endTurn', side: p });
  st.active = 1 - p;
  beginTurn(st, ev);
}

// ---------------------------------------------------------------- COMMANDS
function exec(st, cmd, ev) {
  if (!cmd || !cmd.t) return 'Bad command';
  if (cmd.t === 'concede') {
    if (st.winner != null) return 'The game is over';
    st.winner = 1 - cmd.p; st.reason = 'concede'; st.phase = 'over';
    ev.push({ t: 'gameOver', winner: st.winner, reason: 'concede' });
    return null;
  }
  if (st.winner != null) return 'The game is over';
  if (cmd.t === 'mulligan') {
    if (st.phase !== 'mulligan') return 'Not mulligan time';
    const P = st.players[cmd.p];
    if (P.mulled != null) return 'Already decided';
    P.mulled = !!cmd.redraw;
    if (cmd.redraw) {
      P.deck = P.deck.concat(P.hand); P.hand = [];
      shuffle(st, P.deck);
      for (let i = 0; i < START_HAND; i++) drawCard(st, cmd.p, ev, true);
      ev.push({ t: 'mulligan', side: cmd.p, rng: 1 });
    }
    if (st.players[0].mulled != null && st.players[1].mulled != null) startGame(st, ev);
    return null;
  }
  if (cmd.t === 'choose') {
    const pd = st.pending;
    if (!pd || pd.side !== cmd.p) return 'Nothing to choose';
    st.pending = null;
    if (pd.kind === 'steal' && cmd.uid != null) {
      if (!pd.options.includes(cmd.uid)) return 'Not an option';
      const O = st.players[pd.from], i = O.hand.findIndex(c => c.uid === cmd.uid);
      if (i >= 0) {
        const inst = O.hand.splice(i, 1)[0];
        inst.owner = pd.side;
        st.players[pd.side].hand.push(inst);
        ev.push({ t: 'stealCard', from: pd.from, to: pd.side, uid: inst.uid, id: inst.id });
      }
    }
    return null;
  }
  if (st.phase !== 'main') return 'Not playing yet';
  if (cmd.p !== st.active) return 'Not your turn';
  if (st.pending) return 'Finish your choice first';
  const p = cmd.p, P = st.players[p];
  switch (cmd.t) {
    case 'end': endTurn(st, ev); return null;
    case 'draw': {
      if (P.actions < 1) return 'Needs 1 Action';
      if (P.hand.length >= HAND_MAX) return 'Hand is full';
      if (!P.deck.length && !P.discard.some(c => !card(c.id).token)) return 'No cards left';
      P.actions -= 1;
      ev.push({ t: 'buyDraw', side: p });
      drawCard(st, p, ev);
      return null;
    }
    case 'move': {
      const opts = moveOptions(st, p, cmd.from);
      const m = opts.find(o => o.to === cmd.to);
      if (!m) return 'Can\'t move there';
      P.actions -= m.cost;
      moveCreature(st, p, cmd.from, cmd.to, ev, false);
      checkDeaths(st, ev);
      return null;
    }
    case 'floop': {
      const slot = cmd.slot === 'b' ? 'b' : 'c';
      const why = floopBlock(st, p, cmd.lane, slot);
      if (why) return why;
      const src = srcOf(st, p, cmd.lane, slot);
      const targets = cmd.targets || [];
      if (!validTargets(st, p, { lane: cmd.lane, slot }, targets)) return 'Invalid target';
      const x = slot === 'b' ? bl(st, p, cmd.lane) : cr(st, p, cmd.lane);
      const ab = card(x.id).floop;
      P.actions -= ab.cost || 0;
      x.flooped = true; x.fl = true;
      ev.push({ t: 'floop', side: p, lane: cmd.lane, slot, id: x.id, uid: x.uid });
      FX[ab.fx](st, ab, src, targets, ev);
      checkDeaths(st, ev);
      return null;
    }
    case 'play': {
      const why = playBlock(st, p, cmd.uid);
      if (why) return why;
      const idx = P.hand.findIndex(c => c.uid === cmd.uid);
      const inst = P.hand[idx], cd = card(inst.id);
      const cost = spellCost(st, p, cd);
      if (cd.type === 'spell') {
        const ab = cd.ab.find(a => a.on === 'cast');
        const targets = cmd.targets || [];
        if (!validTargets(st, p, { uid: cmd.uid }, targets)) return 'Invalid target';
        P.hand.splice(idx, 1); P.actions -= cost; P.spells += 1;
        ev.push({ t: 'cast', side: p, uid: inst.uid, id: inst.id, targets });
        if (ab) FX[ab.fx](st, ab, { side: p, lane: null, slot: null, uid: inst.uid, id: inst.id, lvl: inst.lvl }, targets, ev);
        toDiscard(st, Object.assign({}, inst, { owner: p }));
        checkDeaths(st, ev);
        return null;
      }
      const lane = cmd.lane;
      if (!playLanes(st, p, cmd.uid).includes(lane)) return 'Can\'t play there';
      P.hand.splice(idx, 1); P.actions -= cost;
      inst.owner = inst.owner == null ? p : inst.owner;
      if (cd.type === 'creature') {
        const old = cr(st, p, lane);
        if (old) { P.lanes[lane].creature = null; ev.push({ t: 'replace', side: p, lane, slot: 'c', uid: old.uid, id: old.id }); toDiscard(st, old); }
        placeCreature(st, p, lane, inst, ev, 'play');
        if (cd.id === 'c_maize') ev.push({ t: 'say', side: p, text: 'I LOVE CORN!' });
        for (const ab of cd.ab) if (ab.on === 'play') FX[ab.fx](st, ab, srcOf(st, p, lane, 'c'), [], ev);
        enterLane(st, p, lane, ev);
      } else {
        const old = bl(st, p, lane);
        if (old) { P.lanes[lane].building = null; ev.push({ t: 'replace', side: p, lane, slot: 'b', uid: old.uid, id: old.id }); toDiscard(st, old); }
        P.lanes[lane].building = Object.assign({ uid: inst.uid, id: inst.id, lvl: inst.lvl, owner: inst.owner }, { dmg: 0, flooped: false, fl: false, hidden: !!cd.kw.trap, born: st.turn });
        ev.push({ t: 'build', side: p, lane, uid: inst.uid, id: inst.id, hidden: !!cd.kw.trap });
        for (const ab of cd.ab) if (ab.on === 'play') FX[ab.fx](st, ab, srcOf(st, p, lane, 'b'), [], ev);
      }
      checkDeaths(st, ev);
      return null;
    }
  }
  return 'Unknown command';
}

function apply(state, cmd, opts) {
  const st = opts && opts.inPlace ? state : clone(state);
  const ev = (opts && opts.events) || [];
  const err = exec(st, cmd, ev);
  return { state: st, events: ev, error: err || null };
}

// Enumerate every legal command for player p (used by AI and tests).
function legalActions(st, p, opts) {
  const out = [];
  if (st.winner != null) return out;
  if (st.pending) {
    if (st.pending.side === p) { for (const u of st.pending.options) out.push({ t: 'choose', p, uid: u }); out.push({ t: 'choose', p, uid: null }); }
    return out;
  }
  if (st.phase === 'mulligan') { if (st.players[p].mulled == null) { out.push({ t: 'mulligan', p, redraw: false }, { t: 'mulligan', p, redraw: true }); } return out; }
  if (st.active !== p) return out;
  out.push({ t: 'end', p });
  const P = st.players[p];
  const seen = {};
  for (const inst of P.hand) {
    const key = inst.id + ':' + inst.lvl; if (seen[key]) continue; seen[key] = 1;
    if (playBlock(st, p, inst.uid)) continue;
    const cd = card(inst.id);
    if (cd.type === 'spell') {
      const src = { uid: inst.uid };
      const chains = [];
      (function walk(ch) {
        const o = targetOptions(st, p, src, ch);
        if (o === null) { chains.push(ch); return; }
        for (const x of o) walk(ch.concat([x]));
      })([]);
      for (const ch of chains) out.push({ t: 'play', p, uid: inst.uid, targets: ch });
    } else {
      for (const l of playLanes(st, p, inst.uid)) out.push({ t: 'play', p, uid: inst.uid, lane: l });
    }
  }
  for (let l = 0; l < LANES; l++) for (const slot of ['c', 'b']) {
    if (floopBlock(st, p, l, slot)) continue;
    const src = { lane: l, slot }, chains = [];
    (function walk(ch) {
      const o = targetOptions(st, p, src, ch);
      if (o === null) { chains.push(ch); return; }
      for (const x of o) walk(ch.concat([x]));
    })([]);
    for (const ch of chains) out.push({ t: 'floop', p, lane: l, slot, targets: ch });
  }
  for (let l = 0; l < LANES; l++) for (const m of moveOptions(st, p, l)) out.push({ t: 'move', p, from: l, to: m.to });
  if (P.actions >= 1 && P.hand.length < HAND_MAX && (P.deck.length || P.discard.some(c => !card(c.id).token))) out.push({ t: 'draw', p });
  return out;
}

// What a player is allowed to know. Hidden cards become '?' so the AI can't peek.
function redact(st, viewer) {
  const s = clone(st), o = 1 - viewer, O = s.players[o];
  const revealed = O.revealTurn === s.turn;
  if (!revealed) O.hand = O.hand.map(c => ({ uid: c.uid, id: '?', lvl: 1, owner: c.owner }));
  O.deck = O.deck.map(c => ({ uid: c.uid, id: '?', lvl: 1, owner: c.owner }));
  // your own deck order is unknown to you, except the top card (shown as "Next card" in the UI)
  s.players[viewer].deck = s.players[viewer].deck.map((c, i, a) => (i === a.length - 1 ? c : { uid: c.uid, id: '?', lvl: 1, owner: c.owner }));
  if (O.peekTurn !== s.turn) for (let l = 0; l < LANES; l++) { const b = O.lanes[l].building; if (b && b.hidden) b.id = '?trap'; }
  s.rng = (s.rng ^ 0x5bd1e995) >>> 0;
  return s;
}

// Fight preview for the active player: per-lane outcome of ending the turn now (no turn switch).
function previewFights(st) {
  const s = clone(st), ev = [];
  if (s.winner != null || s.phase !== 'main') return { events: [], lanes: [] };
  const p = s.active;
  if (s.turn > 1) fightPhase(s, ev);
  return { events: ev, state: s, side: p };
}

function validateDeck(deck) {
  const errs = [], warn = [];
  if (!deck || !Array.isArray(deck.cards)) return { ok: false, errs: ['No cards'], warn };
  if (deck.cards.length !== DECK_SIZE) errs.push('Deck needs exactly ' + DECK_SIZE + ' cards (' + deck.cards.length + ')');
  const cnt = {}; let champs = 0;
  for (const id of deck.cards) {
    const cd = CARDS[id];
    if (!cd || cd.token || id[0] === '?') { errs.push('Unknown card ' + id); continue; }
    cnt[id] = (cnt[id] || 0) + 1;
    if (cd.r === 'L') champs++;
  }
  for (const id in cnt) if (cnt[id] > (CARDS[id].r === 'L' ? 1 : MAX_COPIES)) errs.push('Too many copies of ' + CARDS[id].name);
  if (champs > 1) errs.push('Only 1 Champion per deck');
  if (!Array.isArray(deck.lands) || deck.lands.length !== LANES || deck.lands.some(t => !LAND_TYPES.includes(t))) errs.push('Pick 4 landscapes');
  else {
    const have = {}; for (const t of deck.lands) have[t] = (have[t] || 0) + 1;
    for (const id in cnt) { const cd = CARDS[id]; if (cd.land !== 'rainbow' && cd.req > (have[cd.land] || 0)) warn.push(cd.name + ' needs ' + cd.req + ' ' + LANDS[cd.land].name); }
  }
  return { ok: errs.length === 0, errs, warn };
}

function actionsLeftSummary(st, p) {
  // Counts things the player could still do (for the End Turn button hint).
  if (st.active !== p || st.phase !== 'main' || st.winner != null) return { cards: 0, floops: 0, moves: 0, total: 0 };
  let cards = 0, floops = 0, moves = 0;
  const seen = {};
  for (const inst of st.players[p].hand) {
    if (seen[inst.uid]) continue; seen[inst.uid] = 1;
    if (playBlock(st, p, inst.uid)) continue;
    const cd = card(inst.id);
    if (cd.type === 'spell' && !hasTargetChain(st, p, { uid: inst.uid }, [])) continue;
    cards++;
  }
  for (let l = 0; l < LANES; l++) { if (!floopBlock(st, p, l, 'c')) floops++; if (!floopBlock(st, p, l, 'b')) floops++; }
  return { cards, floops, moves, total: cards + floops };
}

// ---------------------------------------------------------------- DECKS
// Starter decks (one per landscape). Each: 4 landscapes + 20 cards.
function expand(list) { const r = []; for (const [id, n] of list) for (let i = 0; i < n; i++) r.push(id); return r; }
const STARTERS = {
  blue: { name: 'Finn\'s Blue Plains', hero: 'finn', lands: ['blue', 'blue', 'blue', 'blue'], cards: expand([
    ['b_hotdog', 2], ['b_cooldog', 2], ['b_scholar', 1], ['b_skypup', 2], ['b_ranger', 2], ['b_pig', 1], ['b_school', 1], ['b_spirit', 1],
    ['b_cave', 1], ['b_math', 2], ['b_adv', 1], ['b_ride', 1], ['r_poundcake', 1], ['r_teleport', 1], ['r_pancakes', 1]]) },
  corn: { name: 'Jake\'s Cornfield', hero: 'jake', lands: ['corn', 'corn', 'swamp', 'corn'], cards: expand([
    ['c_cornball', 2], ['c_husker', 2], ['c_scarecrow', 1], ['c_worm', 2], ['c_ronin', 1], ['c_maize', 1], ['c_silo', 1], ['c_cornucopia', 1],
    ['c_dome', 1], ['c_bloodstorm', 1], ['c_nightmares', 1], ['c_plant', 1], ['r_baldman', 1], ['r_dan', 1], ['r_volcano', 1], ['r_reclaim', 1], ['r_teleport', 1]]) },
  swamp: { name: 'Marceline\'s Useless Swamp', hero: 'marceline', lands: ['swamp', 'swamp', 'swamp', 'swamp'], cards: expand([
    ['s_wisp', 2], ['s_slinger', 2], ['s_digger', 2], ['s_witch', 1], ['s_gobbler', 2], ['s_lich', 1], ['s_crypt', 1], ['s_mudpit', 1],
    ['s_cauldron', 1], ['s_reaper', 1], ['s_unearth', 1], ['s_breath', 2], ['r_booby', 1], ['r_pancakes', 1], ['r_treefort', 1]]) },
  ice: { name: 'Ice King\'s IcyLands', hero: 'iceking', lands: ['ice', 'ice', 'ice', 'ice'], cards: expand([
    ['i_gunter', 2], ['i_golem', 2], ['i_sprite', 2], ['i_yeti', 2], ['i_wizard', 1], ['i_king', 1], ['i_castle', 1], ['i_lake', 1],
    ['i_igloo', 1], ['i_freeze', 2], ['i_blizzard', 1], ['i_snowday', 1], ['r_poundcake', 1], ['r_reclaim', 1], ['r_treefort', 1]]) },
  nice: { name: 'Bubblegum\'s NiceLands', hero: 'pb', lands: ['nice', 'nice', 'nice', 'nice'], cards: expand([
    ['n_banana', 2], ['n_butler', 2], ['n_tart', 1], ['n_guardian', 2], ['n_cupcake', 2], ['n_pb', 1], ['n_tower', 2], ['n_lab', 1],
    ['n_wall', 1], ['n_bubble', 1], ['n_science', 2], ['n_justice', 1], ['r_pancakes', 1], ['r_glory', 1]]) },
  lava: { name: 'Flame Princess\'s LavaFlats', hero: 'fp', lands: ['lava', 'lava', 'lava', 'lava'], cards: expand([
    ['l_pup', 2], ['l_bun', 2], ['l_flambo', 2], ['l_elemental', 2], ['l_golem', 2], ['l_fp', 1], ['l_forge', 1], ['l_cannon', 1],
    ['l_pit', 1], ['l_fireball', 2], ['l_eruption', 1], ['l_heatwave', 1], ['r_glory', 1], ['r_baldman', 1]]) }
};

// Scenario kit: used by rule tests and the scripted tutorial to set up exact boards.
const kit = {
  put(st, side, lane, id, extra) {
    const c = mkCreature(st, mkInst(st, id, (extra && extra.lvl) || 1, side), side);
    Object.assign(c, extra || {});
    st.players[side].lanes[lane].creature = c; return c;
  },
  build(st, side, lane, id, extra) {
    const b = Object.assign(mkInst(st, id, (extra && extra.lvl) || 1, side), { dmg: 0, flooped: false, fl: false, hidden: !!card(id).kw.trap, born: st.turn - 1 }, extra || {});
    st.players[side].lanes[lane].building = b; return b;
  },
  hand(st, side, ids) { st.players[side].hand = ids.map(id => mkInst(st, id, 1, side)); return st.players[side].hand; },
  deck(st, side, ids) { st.players[side].deck = ids.map(id => mkInst(st, id, 1, side)); return st.players[side].deck; },
  discard(st, side, ids) { st.players[side].discard = ids.map(id => mkInst(st, id, 1, side)); return st.players[side].discard; },
  lands(st, side, types) { types.forEach((t, i) => { st.players[side].lanes[i].land = { type: t, orig: t, down: false, by: null }; }); },
  clear(st) { for (const P of st.players) for (const L of P.lanes) { L.creature = null; L.building = null; } }
};

return {
  kit,
  LANES, START_HP, ACTIONS, HAND_MAX, START_HAND, DECK_SIZE, MAX_COPIES, OVERTIME,
  LANDS, LAND_TYPES, RARITY, KEYWORDS, CARDS, COLLECTIBLE, STARTERS, expand,
  newGame, apply, legalActions, redact, clone, previewFights, validateDeck,
  cStats, bDef, countLand, playBlock, playLanes, floopBlock, moveOptions, moveCost, canAttack,
  targetSteps, targetOptions, validTargets, hasTargetChain, costOf, spellCost, meetsReq, napping, findCreature,
  actionsLeftSummary, hashSeed, card
};
})();
/* END ENGINE */
