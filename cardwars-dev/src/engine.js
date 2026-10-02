/* ENGINE */
// Card Wars rules engine: the game Finn and Jake play in Adventure Time ("Card Wars", S4E14), with the
// gaps the episode leaves filled from the official Cryptozoic rulebook. Pure and deterministic: no DOM,
// plain-JSON state, seeded PRNG inside the state.  apply(state, command) -> { state, events, error }.
//
// Turn (show): ready your cards -> discard a card and pick up a new one -> spend 2 Actions flooping cards
// onto the board, floop abilities, move -> ACTIVATE creatures to attack -> BATTLE: "So, what'll you use to
// defend?" (the defender may floop abilities or activate ready creatures to block) -> fights resolve.
// A kingdom with no creatures and no buildings at the end of a turn has fallen: "That's the game, boyee!"
var Engine = (function () {
'use strict';

const LANES = 4, ACTIONS = 2, HAND_MAX = 8, START_HAND = 5, HAND_REFILL = 5, SETUP_BUDGET = 2;
const DECK_SIZE = 20, MAX_COPIES = 2, OVERTIME = 13, MAX_ROUNDS = 24, SHIELD_CAP = 5;

const LANDS = {
  blue:  { name: 'Blue Plains',   hero: 'finn',      color: '#4aa8ff', home: 'Breezy: your Blue Plains creatures move for free from a Blue Plains.', sig: 'Tricks, defense & the Pig' },
  corn:  { name: 'Cornfield',     hero: 'jake',      color: '#ffcf3a', home: 'Corn-Powered: your Cornfield creatures get +1 ATK while standing on a Cornfield.', sig: 'Corn power & big attacks' },
  swamp: { name: 'Useless Swamp', hero: 'marceline', color: '#b077f0', home: 'Grave Muck: when your Useless Swamp creature is destroyed on a Useless Swamp, a 1/1 Zombie rises.', sig: 'Rot, Zombies & souls' },
  ice:   { name: 'IcyLands',      hero: 'iceking',   color: '#8fe9ff', home: 'Frostbite: your IcyLands creatures Chill what they damage in fights while on IcyLands.', sig: 'Chill, Freeze & control' },
  nice:  { name: 'NiceLands',     hero: 'pb',        color: '#ff8fd0', home: 'Nice Day: your NiceLands creatures on NiceLands heal 1 at the start of your turn.', sig: 'Shields, buildings & science' },
  lava:  { name: 'LavaFlats',     hero: 'fp',        color: '#ff6b3d', home: 'Scorch: your LavaFlats creatures Burn what they damage in fights while on LavaFlats.', sig: 'Burn & siege' },
  rainbow: { name: 'Rainbow', hero: null, color: '#f4f0ff', home: '', sig: 'Any landscape' }
};
const LAND_TYPES = ['blue', 'corn', 'swamp', 'ice', 'nice', 'lava'];
const RARITY = { C: 'Common', R: 'Rare', E: 'Epic', L: 'Legendary', K: 'Kingdom', T: 'Token' };

const KEYWORDS = {
  floop: 'FLOOP: turn the card sideways (left) to use its ability. Free unless it says otherwise. It stays turned until your next turn, so it can\'t attack.',
  activate: 'ACTIVATE: turn a creature sideways (right) to attack the lane across. Attacks happen when you call BATTLE.',
  defend: 'Defending: when the enemy calls BATTLE you may floop ready cards or activate a ready creature to block an attack in its own or an adjacent lane.',
  landmark: 'Kingdom landmark: flooped onto the board with your land cards. Can\'t be replaced.',
  guard: 'Guard: blocks attacks into your adjacent lanes that have no creature - without having to be ready.',
  flying: 'Flying: flies over the creature across and strikes a building (the one across, or the nearest). Only Flying creatures can block it.',
  storm: 'Storming the kingdom: with no creature or building across, an attacker charges the nearest enemy building.',
  ranged: 'Ranged: takes no damage back when it attacks (unless the defender is Ranged too).',
  siege: 'Siege: deals extra damage to buildings.',
  vamp: 'Vampiric: fight damage it deals heals it.',
  shield: 'Shield: absorbs that much damage.',
  burn: 'Burn: takes Burn damage at the end of its controller\'s turn, then Burn goes down by 1.',
  chill: 'Chill: -1 ATK per stack. 2 stacks = Frozen. Wears off at the end of its controller\'s turn.',
  frozen: 'Frozen: can\'t attack, block, floop, move or hit back. Thaws at the end of its controller\'s next turn.',
  rot: 'Rot: takes 1 damage at the end of its controller\'s turn and can\'t be healed. Spreads to adjacent allies when it dies.',
  stuck: 'Stuck: can\'t move or be moved.',
  ripen: 'Ripen: at the end of your turn, if it didn\'t floop, attack or move and stands on a face-up Cornfield, it grows +1/+1 (once).',
  immortal: 'Immortal: returns to its owner\'s hand when destroyed.',
  trap: 'Trap: played face-down. Springs when an enemy creature enters or attacks the lane across.',
  napping: 'Napping: sleeping in the Cave of Solitude. Enemies can\'t attack, target or steal it until your next turn.',
  studying: 'Studying: inside the Schoolhouse. Enemies can\'t attack, target or steal it, and Volcanos can\'t touch it.',
  collapse: 'Collapsed: Husker Knights with no corn to draw energy from have 0 ATK and can\'t attack.',
  token: 'Token: vanishes when it leaves play.'
};

// ---------------------------------------------------------------- CARD DATA
// Every card is data. Abilities name an effect handler (fx) and a trigger (on). Targets (tg) are resolved by
// the target system. cost = Actions to play = how many face-up landscapes of its type you need (official rule).
const CARDS = {};
function def(o) {
  o.req = o.req == null ? (o.land === 'rainbow' ? 0 : o.cost) : o.req;
  o.kw = o.kw || {}; o.ab = o.ab || []; o.r = o.r || 'C';
  if (o.type === 'creature') { o.atk = o.atk || 0; o.def = o.def || 1; }
  if (o.type === 'building') o.def = o.def || 1;
  o.floop = o.ab.find(a => a.on === 'floop') || null;
  CARDS[o.id] = o;
}

// ---- KINGDOM LANDMARKS: they appear when you floop your land cards ("his land and buildings appear").
def({ id: 'k_fortress', name: 'Astral Fortress', land: 'blue', type: 'building', cost: 0, def: 8, r: 'K', art: 'fortress',
  kw: { fort: 2 }, text: 'Kingdom landmark. Your creature in this lane gets +2 DEF.', flavor: 'Flooped at the very start of the game. Looks amazing.' });
def({ id: 'k_corncastle', name: 'Corn Castle', land: 'corn', type: 'building', cost: 0, def: 7, r: 'K', art: 'corncastle',
  kw: { castle: 2 }, text: 'Kingdom landmark. Your creature in this lane gets +2 ATK.', flavor: 'For the glory of Jakoria!' });
def({ id: 'k_mausoleum', name: 'Mausoleum', land: 'swamp', type: 'building', cost: 0, def: 7, r: 'K', art: 'mausoleum',
  kw: { fort: 1, castle: 1 }, text: 'Kingdom landmark. Your creature in this lane gets +1 ATK and +1 DEF.', flavor: 'Quiet neighbors. Mostly.' });
def({ id: 'k_icepalace', name: 'Ice Palace', land: 'ice', type: 'building', cost: 0, def: 7, r: 'K', art: 'icepalace',
  kw: { fort: 2 }, text: 'Kingdom landmark. Your creature in this lane gets +2 DEF.', flavor: 'Seventeen penguins and one very lonely king.' });
def({ id: 'k_candycastle', name: 'Candy Castle', land: 'nice', type: 'building', cost: 0, def: 8, r: 'K', art: 'candycastle',
  ab: [{ on: 'start', fx: 'healHere', n: 2 }], text: 'Kingdom landmark. At the start of your turn, your creature in this lane heals 2.', flavor: 'Sweet, sturdy, scientifically sound.' });
def({ id: 'k_firepalace', name: 'Fire Palace', land: 'lava', type: 'building', cost: 0, def: 7, r: 'K', art: 'firepalace',
  kw: { castle: 2 }, text: 'Kingdom landmark. Your creature in this lane gets +2 ATK.', flavor: 'Hot. Very hot.' });

// ---- BLUE PLAINS (Finn's deck in the episode)
def({ id: 'b_cooldog', name: 'Cool Dog', land: 'blue', type: 'creature', cost: 1, atk: 4, def: 6, r: 'C', art: 'cooldog',
  kw: { cool: 1, volcanoProof: 1 }, text: 'Your creatures in the lanes next to Cool Dog can\'t be attacked. Too cool: can\'t be Chilled or Frozen, and Volcanos don\'t melt it.',
  flavor: '"Can my Cool Dog and Ancient Scholar defeat your Husker Knights?"' });
def({ id: 'b_scholar', name: 'Ancient Scholar', land: 'blue', type: 'creature', cost: 1, atk: 3, def: 4, r: 'R', art: 'scholar',
  kw: { scholar: 1 }, ab: [{ on: 'floop', fx: 'raiseDead', cond: 'learned', tg: ['myDiscardCreature', 'myEmptyLane'] }],
  text: 'ACTIVATE in a lane with your Schoolhouse to Study: he goes inside (enemies and Volcanos can\'t touch him) and learns Raise the Dead. FLOOP after studying (even while defending): Raise the Dead - put a creature from your discard pile into an empty lane.',
  flavor: '"Actually, my Ancient Scholar\'s been studying the Raise the Dead ability."' });
def({ id: 'b_skypup', name: 'Sky Pup', land: 'blue', type: 'creature', cost: 1, atk: 4, def: 5, r: 'C', art: 'skypup',
  kw: { flying: 1 }, text: 'Flying.', flavor: 'Floats on pure enthusiasm.' });
def({ id: 'b_soldier', name: 'Spirit Soldier', land: 'blue', type: 'creature', cost: 1, atk: 4, def: 6, r: 'C', art: 'soldier',
  kw: { rally: 1 }, text: 'Your creatures in adjacent lanes get +1 ATK.', flavor: 'Extra-large. Extra-spooky. Extra-supportive.' });
def({ id: 'b_marauder', name: 'Woadic Marauder', land: 'blue', type: 'creature', cost: 2, atk: 5, def: 4, r: 'R', art: 'marauder',
  ab: [{ on: 'floop', fx: 'razeAcross', n: 4, own: 1, cond: 'buildingAcross' }], text: 'FLOOP (your turn): Smash the enemy building across for 4 damage.', flavor: 'Woad paint, war cry, wrecked walls.' });
def({ id: 'b_chief', name: 'Woadic Chief', land: 'blue', type: 'creature', cost: 2, atk: 4, def: 6, r: 'E', art: 'chief',
  kw: { spellPower: 2 }, text: '+2 ATK for each Spell you cast this turn.', flavor: 'The more spells you play, the higher his ATK goes.' });
def({ id: 'b_bard', name: 'Embarrassing Bard', land: 'blue', type: 'creature', cost: 1, atk: 3, def: 5, r: 'C', art: 'bard',
  ab: [{ on: 'floop', fx: 'embarrass' }], text: 'FLOOP (even while defending): The enemy creature across is too embarrassed to floop or block until your next turn, and gets -1 ATK.', flavor: 'His songs are about you. All of them.' });
def({ id: 'b_ranger', name: 'Cloud Ranger', land: 'blue', type: 'creature', cost: 2, atk: 6, def: 6, r: 'R', art: 'ranger',
  ab: [{ on: 'moved', fx: 'buffSelfTurn', n: 2 }], text: 'Whenever it moves, it gets +2 ATK this turn.', flavor: 'Rides the Blue Plains breeze.' });
def({ id: 'b_school', name: 'Schoolhouse', land: 'blue', type: 'building', cost: 1, def: 7, r: 'C', art: 'school',
  kw: { school: 1, volcanoProof: 1 }, ab: [{ on: 'start', fx: 'schoolLearn' }],
  text: 'Ancient Scholars study here. Volcanos can\'t touch it. At the start of your turn, your creature in this lane gains +1 DEF (max +2).', flavor: '"I\'m attackin\' your schoolhouse with my Husker Knights!"' });
def({ id: 'b_spirit', name: 'Spirit Tower', land: 'blue', type: 'building', cost: 2, def: 6, r: 'E', art: 'spirit',
  kw: { spirit: 4 }, text: 'When an enemy creature with 4 or more ATK attacks this lane, the Tower possesses it: you take control of it. Then the Tower fades.', flavor: '"Look! My Tower\'s doin\' a thing!"' });
def({ id: 'b_cave', name: 'Cave of Solitude', land: 'blue', type: 'building', cost: 1, def: 6, r: 'R', art: 'cave',
  ab: [{ on: 'floop', fx: 'cave', cond: 'myCreatureHere' }], text: 'FLOOP (even while defending): your creature in this lane takes a nap inside and heals 2. Until your next turn enemies can\'t attack, target or steal it (it can\'t attack either).',
  flavor: '"I move my Pig to the Cave of Solitude so he can take a nap."' });
def({ id: 'b_math', name: 'Mathematical!', land: 'blue', type: 'spell', cost: 1, r: 'R', art: 'math',
  ab: [{ on: 'cast', fx: 'readyCreature', tg: ['myFlooped'] }], text: 'Ready one of your flooped creatures. It can floop or attack again.', flavor: 'Algebraic!' });
def({ id: 'b_ride', name: 'Rainicorn Ride', land: 'blue', type: 'spell', cost: 1, r: 'C', art: 'rainicorn',
  ab: [{ on: 'cast', fx: 'relocate', tg: ['anyMovable', 'emptyLaneSameSide'] }], text: 'Move any creature (yours or an enemy\'s) to an empty lane on its side.', flavor: 'Lady Rainicorn won\'t play Card Wars. She will give rides.' });
def({ id: 'b_adv', name: 'Adventure Time!', land: 'blue', type: 'spell', cost: 2, r: 'E', art: 'advtime',
  ab: [{ on: 'cast', fx: 'teamBuffTurn', n: 2, draw: 1 }], text: 'Your creatures get +2 ATK this turn. Pick up a card.', flavor: 'Come on, grab your friends.' });

// ---- CORNFIELD (Jake's deck in the episode: three Cornfields and one Useless Swamp)
def({ id: 'c_husker', name: 'Husker Knights', land: 'corn', type: 'creature', cost: 1, atk: 0, def: 2, r: 'C', art: 'husker',
  kw: { cornPower: 2 }, text: 'They draw energy from corn: +2 ATK for each face-up Cornfield you control. No corn and they collapse.', flavor: '"My Husker Knights draw energy from corn!"' });
def({ id: 'c_earlings', name: 'Legion of Earlings', land: 'corn', type: 'creature', cost: 1, atk: 4, def: 2, r: 'R', art: 'earlings',
  kw: { scare: 1 }, text: 'During your Field of Nightmares, the creature they fight is scared to death: destroyed, and it deals no damage back.', flavor: '"...and activate my Legion of Earlings to scare your Pig to death!"' });
def({ id: 'c_cornball', name: 'Cornball', land: 'corn', type: 'creature', cost: 1, atk: 2, def: 3, r: 'C', art: 'cornball',
  kw: { ripen: 1 }, text: 'Ripen.', flavor: 'Just a little guy. Growing.' });
def({ id: 'c_scarecrow', name: 'Scarecrow', land: 'corn', type: 'creature', cost: 1, atk: 1, def: 6, r: 'C', art: 'scarecrow',
  kw: { guard: 1 }, text: 'Guard.', flavor: 'Scares crows. And Pigs, sometimes.' });
def({ id: 'c_feedman', name: 'Feed Man', land: 'corn', type: 'creature', cost: 2, atk: 2, def: 5, r: 'R', art: 'feedman',
  kw: { barnPower: 3 }, text: '+3 ATK while you control a Hay Barn - his power source.', flavor: '"I floop the Hay Barn, and I attack with Feed Man!"' });
def({ id: 'c_reaper', name: 'Field Reaper', land: 'corn', type: 'creature', cost: 2, atk: 4, def: 4, r: 'L', art: 'reaper',
  extra: { discard: 1 }, ab: [{ on: 'play', fx: 'reapSouls' }],
  text: 'Extra cost: discard a card. When he is flooped into play he steals the souls of every damaged enemy creature: you take control of them. Napping and studying creatures are safe.', flavor: '"My boys!"' });
def({ id: 'c_maize', name: 'Immortal Maize Walker', land: 'corn', type: 'creature', cost: 2, atk: 5, def: 5, r: 'L', art: 'maize',
  kw: { triple: 1, immortal: 1, hides: 'swamp' }, text: 'Hides in the Useless Swamp: can only be played onto your face-up Useless Swamp. Cornfields give it triple ATK (3+ face-up Cornfields). Immortal.', flavor: '"I LOVE CORN!"' });
def({ id: 'c_silo', name: 'Silo of Truth', land: 'corn', type: 'building', cost: 2, def: 5, r: 'E', art: 'silo',
  ab: [{ on: 'play', fx: 'siloPeek' }], text: 'When it\'s flooped into play: your opponent reveals their hand and you take one card from it.', flavor: '"Pfff, you got really lame cards. I\'ll take the Cerebral Bloodstorm, though."' });
def({ id: 'c_dome', name: 'Corn Dome', land: 'corn', type: 'building', cost: 1, def: 6, r: 'R', art: 'dome',
  kw: { aura: 1 }, text: 'Your creatures in this lane and adjacent lanes get +1 ATK.', flavor: 'Pop-pop-power.' });
def({ id: 'c_barn', name: 'Hay Barn', land: 'corn', type: 'building', cost: 1, def: 6, r: 'C', art: 'barn',
  kw: { fort: 1, barn: 1 }, text: 'Feed Man\'s power source. Your creature in this lane gets +1 DEF.', flavor: 'Smells like a championship.' });
def({ id: 'c_henge', name: 'Stonehenge', land: 'corn', type: 'building', cost: 1, def: 6, r: 'R', art: 'henge',
  kw: { henge: 1 }, text: 'Your creature in this lane can floop AND attack in the same turn.', flavor: 'Nobody knows why it\'s in the cornfield. It just is.' });
def({ id: 'c_archer', name: 'Summon Archer Dan', land: 'corn', type: 'spell', cost: 2, req: 3, r: 'L', art: 'dan',
  ab: [{ on: 'cast', fx: 'summonDan', token: 't_dan', tg: ['myEmptyLane'] }], text: 'Needs 3 Cornfields. Archer Dan (3/3, Ranged) joins an empty lane of yours and shoots a corn-arrow at every enemy building, destroying them all.', flavor: '"Whoa. Math."' });
def({ id: 'c_nightmares', name: 'Field of Nightmares', land: 'corn', type: 'spell', cost: 1, r: 'R', art: 'nightmares',
  ab: [{ on: 'cast', fx: 'nightmares' }], text: 'This turn the board is a Field of Nightmares: enemy creatures are too scared to floop or block, and your Legion of Earlings scare what they fight to death.', flavor: '"I cast Field of Nightmares!"' });
def({ id: 'c_plant', name: 'Plant Corn', land: 'corn', type: 'spell', cost: 1, r: 'C', art: 'plant',
  ab: [{ on: 'cast', fx: 'convertLand', land: 'corn', tg: ['myLand'] }], text: 'Turn one of your landscapes into a face-up Cornfield.', flavor: '"CORNFIELDS ARE AWESOME!"' });
def({ id: 't_dan', name: 'Archer Dan', land: 'corn', type: 'creature', cost: 0, atk: 3, def: 3, r: 'T', art: 'dan', token: 1,
  kw: { ranged: 1 }, text: 'Ranged.', flavor: 'Can shoot a whole quiver of corn-arrows in one battle.' });

// ---- USELESS SWAMP (Marceline)
def({ id: 's_wisp', name: 'Swamp Wisp', land: 'swamp', type: 'creature', cost: 1, atk: 2, def: 2, r: 'C', art: 'wisp',
  kw: { flying: 1 }, text: 'Flying.', flavor: 'Smells like the bottom of a boot.' });
def({ id: 's_slinger', name: 'Mud Slinger', land: 'swamp', type: 'creature', cost: 1, atk: 2, def: 4, r: 'C', art: 'slinger',
  kw: { rotter: 1 }, text: 'Creatures it damages in fights Rot.', flavor: 'Flings mud. Mud flings back.' });
def({ id: 's_digger', name: 'Gravedigger', land: 'swamp', type: 'creature', cost: 1, atk: 1, def: 5, r: 'R', art: 'digger',
  ab: [{ on: 'floop', fx: 'tokenAt', token: 't_zombie', tg: ['adjEmptyLane'] }], text: 'FLOOP: Raise a 1/1 Zombie in an adjacent empty lane.', flavor: 'Digs up friends.' });
def({ id: 's_witch', name: 'Bog Witch', land: 'swamp', type: 'creature', cost: 2, atk: 3, def: 5, r: 'R', art: 'witch',
  kw: { vamp: 1 }, text: 'Vampiric.', flavor: 'Brews soup. Do not eat the soup.' });
def({ id: 's_gobbler', name: 'Grave Gobbler', land: 'swamp', type: 'creature', cost: 2, atk: 3, def: 5, r: 'R', art: 'gobbler',
  ab: [{ on: 'anyDeath', fx: 'gobble', n: 3 }], text: 'Whenever another creature is destroyed, it gets +1 ATK permanently (max +3).', flavor: 'Nothing goes to waste in the swamp.' });
def({ id: 's_lich', name: 'The Lich', land: 'swamp', type: 'creature', cost: 2, atk: 4, def: 7, r: 'L', art: 'lich',
  ab: [{ on: 'floop', cost: 1, own: 1, fx: 'rotAllEnemies' }], text: 'FLOOP (1 Action, your turn): Every enemy creature Rots.', flavor: 'All will be still.' });
def({ id: 's_crypt', name: 'Crypt', land: 'swamp', type: 'building', cost: 1, def: 5, r: 'C', art: 'crypt',
  ab: [{ on: 'allyDeath', fx: 'cryptRaise', token: 't_zombie' }], text: 'When one of your creatures in this or an adjacent lane is destroyed, a 1/1 Zombie rises here (once per turn).', flavor: 'Always room for one more.' });
def({ id: 's_mudpit', name: 'Mud Pit', land: 'swamp', type: 'building', cost: 1, def: 3, r: 'R', art: 'mudpit',
  kw: { trap: 1 }, ab: [{ on: 'trap', fx: 'mudTrap' }], text: 'Trap. When an enemy creature enters or attacks the lane across, it gets Stuck and Rots. Then the pit sinks.', flavor: '"Pigs can\'t leave mud landscapes once they\'re on them!"' });
def({ id: 's_cauldron', name: 'Witch\'s Cauldron', land: 'swamp', type: 'building', cost: 2, def: 5, r: 'R', art: 'cauldron',
  ab: [{ on: 'floop', fx: 'cauldron', cond: 'myCreatureHere', own: 1 }], text: 'FLOOP (your turn): Destroy your creature in this lane: pick up 2 cards and gain 1 Action.', flavor: 'Bubble bubble.' });
def({ id: 's_harvest', name: 'Soul Harvest', land: 'swamp', type: 'spell', cost: 2, r: 'E', art: 'harvest',
  ab: [{ on: 'cast', fx: 'harvest', tg: ['enemyDamaged'] }], text: 'Take control of a damaged enemy creature with 2 or less DEF left.', flavor: 'Marceline only drinks the red. And the souls, apparently.' });
def({ id: 's_unearth', name: 'Unearth', land: 'swamp', type: 'spell', cost: 1, r: 'C', art: 'unearth',
  ab: [{ on: 'cast', fx: 'unearth', tg: ['myDiscardCreature', 'myEmptyLane'] }], text: 'Put a creature from your discard pile into an empty lane of yours. It Rots.', flavor: 'Back for one more round.' });
def({ id: 's_breath', name: 'Bog Breath', land: 'swamp', type: 'spell', cost: 1, r: 'C', art: 'breath',
  ab: [{ on: 'cast', fx: 'dmgRot', n: 2, tg: ['anyCreature'] }], text: 'Deal 2 damage to a creature. It Rots.', flavor: 'Mint does not help.' });
def({ id: 't_zombie', name: 'Zombie', land: 'swamp', type: 'creature', cost: 0, atk: 1, def: 1, r: 'T', art: 'zombie', token: 1,
  text: 'Token.', flavor: 'Brains? Candy? Either.' });

// ---- ICYLANDS (Ice King)
def({ id: 'i_gunter', name: 'Gunter', land: 'ice', type: 'creature', cost: 1, atk: 2, def: 3, r: 'R', art: 'gunter',
  ab: [{ on: 'floop', fx: 'gunter' }], text: 'FLOOP: Deal 1 damage to a random enemy creature and Chill it.', flavor: 'Wenk.' });
def({ id: 'i_golem', name: 'Snow Golem', land: 'ice', type: 'creature', cost: 1, atk: 2, def: 6, r: 'C', art: 'golem',
  kw: { guard: 1 }, text: 'Guard.', flavor: 'Cold shoulder, warm heart.' });
def({ id: 'i_sprite', name: 'Snow Sprite', land: 'ice', type: 'creature', cost: 1, atk: 3, def: 3, r: 'C', art: 'sprite',
  kw: { ranged: 1 }, ab: [{ on: 'floop', fx: 'chillTarget', n: 1, tg: ['enemyCreature'] }], text: 'Ranged. FLOOP: Chill an enemy creature.', flavor: 'Snowballs. Infinite snowballs.' });
def({ id: 'i_yeti', name: 'Abominable Snowman', land: 'ice', type: 'creature', cost: 2, atk: 5, def: 7, r: 'R', art: 'yeti',
  kw: { vsChill: 2 }, text: 'Deals +2 damage to Chilled or Frozen creatures.', flavor: 'Hates warm weather and warm hugs.' });
def({ id: 'i_wizard', name: 'Blizzard Wizard', land: 'ice', type: 'creature', cost: 2, atk: 3, def: 6, r: 'R', art: 'wizard',
  ab: [{ on: 'floop', fx: 'push', n: 2, tg: ['pushDir'] }], text: 'FLOOP: Push the enemy creature across into an adjacent lane. If an enemy creature is already there, both take 2 damage.', flavor: 'Sweeps the board like a snowplow.' });
def({ id: 'i_king', name: 'Ice King', land: 'ice', type: 'creature', cost: 2, atk: 4, def: 7, r: 'L', art: 'iceking',
  ab: [{ on: 'floop', cost: 1, own: 1, fx: 'iceKing' }], text: 'FLOOP (1 Action, your turn): Freeze the enemy creature across and Chill every other enemy creature.', flavor: '"Gunter, fetch me my Card Wars crown!"' });
def({ id: 'i_castle', name: 'Ice Castle', land: 'ice', type: 'building', cost: 1, def: 6, r: 'R', art: 'castle',
  ab: [{ on: 'end', fx: 'chillAcross' }], text: 'At the end of your turn, Chill the enemy creature across.', flavor: 'Drafty in all the right places.' });
def({ id: 'i_lake', name: 'Frozen Lake', land: 'ice', type: 'building', cost: 1, def: 3, r: 'R', art: 'lake',
  kw: { trap: 1 }, ab: [{ on: 'trap', fx: 'iceTrap', n: 2 }], text: 'Trap. When an enemy creature enters or attacks the lane across, Freeze it and deal 2 damage. Then the ice cracks.', flavor: 'Thin ice, thick trouble.' });
def({ id: 'i_igloo', name: 'Penguin Igloo', land: 'ice', type: 'building', cost: 1, def: 5, r: 'C', art: 'igloo',
  ab: [{ on: 'start', fx: 'tokenHere', token: 't_penguin' }], text: 'At the start of your turn, if your lane here has no creature, a 1/1 Penguin waddles out.', flavor: 'Seventeen Gunters. Or one Gunter, seventeen times.' });
def({ id: 'i_freeze', name: 'Deep Freeze', land: 'ice', type: 'spell', cost: 1, r: 'C', art: 'freeze',
  ab: [{ on: 'cast', fx: 'freezeTarget', tg: ['enemyCreature'] }], text: 'Freeze an enemy creature.', flavor: 'Chill out.' });
def({ id: 'i_blizzard', name: 'Blizzard', land: 'ice', type: 'spell', cost: 2, r: 'E', art: 'blizzard',
  ab: [{ on: 'cast', fx: 'blizzard', n: 2 }], text: 'Deal 1 damage to every enemy creature and Chill them.', flavor: 'Snow day for everyone!' });
def({ id: 'i_snowday', name: 'Snow Day', land: 'ice', type: 'spell', cost: 1, r: 'R', art: 'snowday',
  ab: [{ on: 'cast', fx: 'convertLand', land: 'ice', chill: 1, tg: ['anyLand'] }], text: 'Turn any landscape into IcyLands. Chill the creature on it.', flavor: 'No school! (Sorry, Ancient Scholar.)' });
def({ id: 't_penguin', name: 'Penguin', land: 'ice', type: 'creature', cost: 0, atk: 1, def: 1, r: 'T', art: 'penguin', token: 1,
  kw: { chiller: 1 }, text: 'Token. Chills creatures it damages.', flavor: 'Wenk wenk.' });

// ---- NICELANDS (Princess Bubblegum)
def({ id: 'n_banana', name: 'Banana Guard', land: 'nice', type: 'creature', cost: 1, atk: 2, def: 4, r: 'C', art: 'banana',
  kw: { guard: 1 }, text: 'Guard.', flavor: '"Bananas! Defend the castle!"' });
def({ id: 'n_butler', name: 'Peppermint Butler', land: 'nice', type: 'creature', cost: 1, atk: 2, def: 4, r: 'R', art: 'butler',
  ab: [{ on: 'floop', fx: 'shieldTarget', n: 2, tg: ['allyCreature'] }], text: 'FLOOP: Give one of your creatures Shield 2.', flavor: 'Knows a few dark tricks. Uses them nicely.' });
def({ id: 'n_tart', name: 'Royal Tart Toter', land: 'nice', type: 'creature', cost: 1, atk: 2, def: 5, r: 'C', art: 'tart',
  ab: [{ on: 'floop', fx: 'healTarget', n: 3, tg: ['allyCreature'] }], text: 'FLOOP: Heal 3 damage from one of your creatures.', flavor: 'Tarts heal everything. Science says so.' });
def({ id: 'n_guardian', name: 'Gumball Guardian', land: 'nice', type: 'creature', cost: 2, atk: 2, def: 8, r: 'R', art: 'guardian',
  kw: { guard: 1, ranged: 1 }, text: 'Guard. Ranged.', flavor: 'Laser eyes, gumball heart.' });
def({ id: 'n_cupcake', name: 'Mr. Cupcake', land: 'nice', type: 'creature', cost: 2, atk: 4, def: 6, r: 'C', art: 'cupcake',
  ab: [{ on: 'play', fx: 'shieldSelf', n: 2 }], text: 'Enters with Shield 2.', flavor: 'Bodyguard. Frosting. Muscles.' });
def({ id: 'n_pb', name: 'Princess Bubblegum', land: 'nice', type: 'creature', cost: 2, atk: 3, def: 8, r: 'L', art: 'pb',
  ab: [{ on: 'floop', cost: 1, own: 1, fx: 'pbScience', n: 2 }], text: 'FLOOP (1 Action, your turn): SCIENCE! Each of your buildings zaps the enemy creature across from it for 2.', flavor: '"Science is about trying things!"' });
def({ id: 'n_tower', name: 'Gumdrop Tower', land: 'nice', type: 'building', cost: 1, def: 5, r: 'C', art: 'tower',
  kw: { link: 1 }, ab: [{ on: 'start', fx: 'gumdrop' }], text: 'At the start of your turn, your creature here gets Shield 1 (Shield 2 while you control another Gumdrop Tower).', flavor: 'Sticky, sweet, sturdy.' });
def({ id: 'n_lab', name: 'Candy Lab', land: 'nice', type: 'building', cost: 1, def: 5, r: 'R', art: 'lab',
  kw: { spellDiscount: 1 }, text: 'Your first Spell each turn costs 1 less Action.', flavor: 'Mostly safe. Mostly.' });
def({ id: 'n_wall', name: 'Candy Wall', land: 'nice', type: 'building', cost: 1, def: 8, r: 'C', art: 'wall',
  kw: { thorns: 2 }, text: 'Creatures that attack this building take 2 damage.', flavor: 'Hard candy. Very hard.' });
def({ id: 'n_bubble', name: 'Bubble Barrier', land: 'nice', type: 'spell', cost: 1, r: 'C', art: 'bubble',
  ab: [{ on: 'cast', fx: 'bubble', n: 2, tg: ['allyCreature'] }], text: 'Give a creature and its adjacent allies Shield 2.', flavor: 'Pop-proof. Mostly.' });
def({ id: 'n_science', name: 'Science!', land: 'nice', type: 'spell', cost: 1, r: 'R', art: 'science',
  ab: [{ on: 'cast', fx: 'science' }], text: 'Pick up a card. If you control a building that isn\'t a landmark, pick up 2 instead.', flavor: 'Hypothesis: more cards.' });
def({ id: 'n_justice', name: 'Sweet Justice', land: 'nice', type: 'spell', cost: 2, r: 'E', art: 'justice',
  ab: [{ on: 'cast', fx: 'dmgTarget', n: 4, tg: ['enemyNearMyBuilding'] }], text: 'Deal 4 damage to an enemy creature in a lane where you have a building.', flavor: 'The Candy Kingdom always gets its tart back.' });

// ---- LAVAFLATS (Flame Princess)
def({ id: 'l_pup', name: 'Fire Wolf Pup', land: 'lava', type: 'creature', cost: 1, atk: 3, def: 3, r: 'C', art: 'firepup',
  text: 'A hot-tempered little wolf.', flavor: 'Awoo! (Ouch, hot.)' });
def({ id: 'l_bun', name: 'Cinnamon Bun', land: 'lava', type: 'creature', cost: 1, atk: 3, def: 5, r: 'C', art: 'bun',
  kw: { guard: 1 }, text: 'Guard.', flavor: '"I\'m a knight now!"' });
def({ id: 'l_flambo', name: 'Flambo', land: 'lava', type: 'creature', cost: 1, atk: 2, def: 4, r: 'R', art: 'flambo',
  ab: [{ on: 'floop', fx: 'burnTarget', n: 2, tg: ['enemyCreature'] }], text: 'FLOOP: Burn 2 an enemy creature.', flavor: '"Flame shield? Nah, flame THIS."' });
def({ id: 'l_elemental', name: 'Fire Elemental', land: 'lava', type: 'creature', cost: 1, atk: 3, def: 3, r: 'C', art: 'elemental',
  ab: [{ on: 'death', fx: 'explodeAcross', n: 2 }], text: 'When destroyed, deal 2 damage to the enemy creature across.', flavor: 'Goes out with a bang.' });
def({ id: 'l_golem', name: 'Lava Golem', land: 'lava', type: 'creature', cost: 2, atk: 5, def: 7, r: 'R', art: 'lavagolem',
  kw: { siege: 2 }, text: 'Siege 2.', flavor: 'Walls are just slow snacks.' });
def({ id: 'l_fp', name: 'Flame Princess', land: 'lava', type: 'creature', cost: 2, atk: 5, def: 7, r: 'L', art: 'fp',
  ab: [{ on: 'floop', cost: 1, own: 1, fx: 'burnAllEnemies', n: 2 }], text: 'FLOOP (1 Action, your turn): Burn 2 every enemy creature.', flavor: '"I\'m not evil. I\'m just FIRE."' });
def({ id: 'l_forge', name: 'Fire Forge', land: 'lava', type: 'building', cost: 1, def: 5, r: 'R', art: 'forge',
  ab: [{ on: 'end', fx: 'forge', n: 2 }], text: 'At the end of your turn, your creature in this lane gets +1 ATK permanently (max +2).', flavor: 'Hot metal, hotter tempers.' });
def({ id: 'l_cannon', name: 'Lava Cannon', land: 'lava', type: 'building', cost: 2, def: 5, r: 'R', art: 'cannon',
  ab: [{ on: 'end', fx: 'cannon' }], text: 'At the end of your turn, fire across this lane: 3 damage to the enemy building, or else 2 to the enemy creature.', flavor: 'Siege, but spicy.' });
def({ id: 'l_pit', name: 'Fire Pit', land: 'lava', type: 'building', cost: 1, def: 4, r: 'C', art: 'firepit',
  ab: [{ on: 'end', fx: 'firePit', n: 1 }], text: 'At the end of your turn, Burn 1 the enemy creatures in this lane and adjacent lanes.', flavor: 'S\'mores for one. Burns for all.' });
def({ id: 'l_fireball', name: 'Fireball', land: 'lava', type: 'spell', cost: 1, r: 'C', art: 'fireball',
  ab: [{ on: 'cast', fx: 'fireball', n: 3, tg: ['anyCreature'] }], text: 'Deal 3 damage to a creature and 1 to the creatures beside it.', flavor: 'Classic.' });
def({ id: 'l_eruption', name: 'Eruption', land: 'lava', type: 'spell', cost: 2, r: 'E', art: 'eruption',
  ab: [{ on: 'cast', fx: 'convertLand', land: 'lava', dmg: 3, tg: ['anyLand'] }], text: 'Turn any landscape into LavaFlats and deal 3 damage to the creature on it.', flavor: 'The floor is lava. Literally.' });
def({ id: 'l_heatwave', name: 'Heat Wave', land: 'lava', type: 'spell', cost: 1, r: 'R', art: 'heatwave',
  ab: [{ on: 'cast', fx: 'heatwave', n: 2 }], text: 'Deal 2 damage to every enemy building. Burn 1 every enemy creature.', flavor: 'Somebody open a window.' });

// ---- RAINBOW (any landscape; every 0-cost card is Rainbow - official rule)
def({ id: 'r_pig', name: 'The Pig', land: 'rainbow', type: 'creature', cost: 1, atk: 2, def: 2, r: 'L', art: 'pig',
  kw: { muddy: 1, pigNap: 1 }, ab: [{ on: 'floop', fx: 'eatCorn' }],
  text: 'FLOOP (once; even while defending): The Pig eats every enemy Cornfield (they flip face-down). No Cornfields? It eats the landscape across. Can\'t be attacked while flooped. Pigs can\'t leave mud: if it wins a fight on an enemy Useless Swamp, it gets stuck there and that player takes it.',
  flavor: '"What do you expect if all your power units come from corn? Pigs EAT corn, dude."' });
def({ id: 'r_baldman', name: 'Wandering Bald Man', land: 'rainbow', type: 'creature', cost: 0, atk: 1, def: 1, r: 'C', art: 'baldman',
  ab: [{ on: 'start', fx: 'wander' }], text: 'At the start of your turn he wanders into a random empty lane of yours - unless he\'s stuck in the mud of a Useless Swamp.', flavor: '"Well... I\'ve still got my Wandering Bald Man." (He got stuck in the mud.)' });
def({ id: 'r_hotdog', name: 'Hot Dog Knight', land: 'rainbow', type: 'creature', cost: 0, atk: 2, def: 3, r: 'C', art: 'hotdog',
  ab: [{ on: 'death', fx: 'drawCards', n: 1 }], text: 'When destroyed, pick up a card.', flavor: 'Brave. Bun-armored. Mostly mustard.' });
def({ id: 'r_poundcake', name: 'Nurse Poundcake', land: 'rainbow', type: 'creature', cost: 1, atk: 1, def: 5, r: 'C', art: 'poundcake',
  ab: [{ on: 'floop', fx: 'healTarget', n: 3, tg: ['allyCreature'] }], text: 'FLOOP: Heal 3 damage from one of your creatures.', flavor: 'Bedside manner: excellent.' });
def({ id: 'r_cooper', name: 'The Cooper', land: 'rainbow', type: 'creature', cost: 1, atk: 1, def: 4, r: 'R', art: 'cooper',
  ab: [{ on: 'floop', fx: 'readyCreature', tg: ['myOtherFlooped'] }], text: 'FLOOP: Unfloop another of your creatures. It can floop or attack again.', flavor: '"I floop the Cooper."' });
def({ id: 'r_ultradog', name: 'Ultra Dog', land: 'rainbow', type: 'creature', cost: 2, atk: 2, def: 3, r: 'E', art: 'ultradog',
  ab: [{ on: 'play', fx: 'mohawk', n: 2 }, { on: 'floop', fx: 'coldNose', own: 1 }], text: 'When played, your strongest other creature gets a mohawk: +2 ATK. FLOOP (your turn): Cold Nose - ice covers every battlefield: Freeze every creature on the board, yours too.',
  flavor: 'A low-class maneuver this late in the tourney.' });
def({ id: 'r_bloodstorm', name: 'Cerebral Bloodstorm', land: 'rainbow', type: 'spell', cost: 1, r: 'R', art: 'bloodstorm',
  ab: [{ on: 'cast', fx: 'bloodstorm', n: 2 }], text: 'A brain storm rages over this battle: every creature that fights - attacking or defending, yours too - takes 2 damage.', flavor: '"Since I\'m not actually attacking, your Cerebral Bloodstorm only does damage to your own kingdom\'s troops."' });
def({ id: 'r_teleport', name: 'Teleport', land: 'rainbow', type: 'spell', cost: 0, r: 'C', art: 'teleport',
  ab: [{ on: 'cast', fx: 'teleport', tg: ['myMovable', 'myEmptyLane'] }], text: 'Move one of your creatures to one of your empty lanes. Only works on your own creatures!', flavor: '"Wouldn\'t Teleport only work on your own creatures?"' });
def({ id: 'r_reclaim', name: 'Reclaim Landscape', land: 'rainbow', type: 'spell', cost: 0, r: 'R', art: 'reclaim',
  ab: [{ on: 'cast', fx: 'reclaim' }], text: 'Reconstitute all your landscapes (flip them face-up, undo enemy changes). Husker Knights in your discard pile revive onto empty lanes with a restored Cornfield.', flavor: '"Now I reconstitute my cornfields! My Husker Knights revive!"' });
def({ id: 'r_volcano', name: 'Volcano', land: 'rainbow', type: 'building', cost: 2, def: 5, r: 'L', art: 'volcano',
  ab: [{ on: 'floop', fx: 'volcano', own: 1, cond: 'notFresh' }], text: 'FLOOP (your turn, not the turn it\'s played): ERUPT! Lava destroys EVERY creature on the board (yours too!) and both buildings in this lane, and scorches every landscape face-down. Studying Scholars, Cool Dogs and Schoolhouses survive.', flavor: '"That\'ll destroy your kingdom too, won\'t it?!" "Hmm. Maybe."' })
def({ id: 'r_pancakes', name: 'Bacon Pancakes', land: 'rainbow', type: 'spell', cost: 1, r: 'C', art: 'pancakes',
  ab: [{ on: 'cast', fx: 'drawCards', n: 2 }], text: 'Pick up 2 cards.', flavor: 'Makin\' bacon pancakes...' });
def({ id: 'r_glory', name: 'For the Glory!', land: 'rainbow', type: 'spell', cost: 1, r: 'R', art: 'glory',
  ab: [{ on: 'cast', fx: 'teamBuffTurn', n: 1, draw: 1 }], text: 'Your creatures get +1 ATK this turn. Pick up a card.', flavor: '"FOR THE GLORY!"' });
def({ id: 'r_treefort', name: 'Tree Fort', land: 'rainbow', type: 'building', cost: 1, def: 6, r: 'C', art: 'treefort',
  ab: [{ on: 'start', fx: 'healHere', n: 2 }], text: 'At the start of your turn, your creature in this lane heals 2.', flavor: 'Home sweet tree.' });
def({ id: 'r_portal', name: 'Magic Portal', land: 'rainbow', type: 'building', cost: 1, def: 4, r: 'R', art: 'portal',
  kw: { portal: 1 }, ab: [{ on: 'play', fx: 'portalTwin' }], text: 'When played, a twin Portal opens in another empty building spot of yours. Your creatures move between Portal lanes for free, at any distance.', flavor: 'Step in, step out, step on someone.' });
def({ id: 'r_booby', name: 'Booby Trap', land: 'rainbow', type: 'building', cost: 0, def: 2, r: 'C', art: 'booby',
  kw: { trap: 1 }, ab: [{ on: 'trap', fx: 'boobyTrap', n: 3 }], text: 'Trap. When an enemy creature enters or attacks the lane across, deal 3 damage to it. Then it\'s spent.', flavor: 'Gotcha.' });

// Unknown placeholders (only inside redacted states, for fair AI search).
CARDS['?'] = { id: '?', name: 'Unknown', land: 'rainbow', type: 'unknown', cost: 99, req: 99, kw: {}, ab: [], r: 'T', floop: null, art: 'back', text: '' };
// A face-down enemy building is assumed to sting for 2 (expected value).
CARDS['?trap'] = { id: '?trap', name: 'Face-down building', land: 'rainbow', type: 'building', cost: 0, req: 0, def: 2, kw: { trap: 1 }, ab: [{ on: 'trap', fx: 'boobyTrap', n: 2 }], r: 'T', floop: null, art: 'back', text: 'A mystery.' };

const COLLECTIBLE = Object.keys(CARDS).filter(id => !CARDS[id].token && CARDS[id].r !== 'T' && CARDS[id].r !== 'K' && id[0] !== '?');

// Kingdom landmarks by main landscape (custom decks get the set of their most common landscape).
const KINGDOMS = {
  blue: [{ id: 'b_school', lane: 0 }, { id: 'k_fortress', lane: 2 }],
  corn: [{ id: 'k_corncastle', lane: 0 }, { id: 'c_dome', lane: 2 }],
  swamp: [{ id: 'k_mausoleum', lane: 1 }, { id: 's_crypt', lane: 3 }],
  ice: [{ id: 'k_icepalace', lane: 1 }, { id: 'i_igloo', lane: 3 }],
  nice: [{ id: 'k_candycastle', lane: 1 }, { id: 'n_tower', lane: 3 }],
  lava: [{ id: 'k_firepalace', lane: 1 }, { id: 'l_forge', lane: 3 }]
};
function mainLand(lands) {
  const n = {}; let best = 'blue', bn = -1;
  for (const t of lands || []) n[t] = (n[t] || 0) + 1;
  for (const t of LAND_TYPES) if ((n[t] || 0) > bn) { bn = n[t] || 0; best = t; }
  return best;
}
function kingdomOf(deck) { return (deck && deck.kingdom) || KINGDOMS[mainLand(deck && deck.lands)]; }

// ---------------------------------------------------------------- PRNG
function hashSeed(x) {
  const s = String(x == null ? 'cardwars' : x);
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
function kingdomSize(st, side) {
  let n = 0; const L = st.players[side].lanes;
  for (let l = 0; l < LANES; l++) { if (L[l].creature) n++; if (L[l].building) n++; }
  return n;
}
function onHome(st, side, lane) {
  const c = cr(st, side, lane); if (!c || c.token) return false;
  const L = land(st, side, lane); return !L.down && L.type === card(c.id).land;
}
// Enemies can't attack, target, damage or steal a creature that is napping (Cave) or studying (Schoolhouse).
function untouchable(st, side, lane) { const c = cr(st, side, lane); return !!(c && (c.nap || c.inside)); }
function targetable(st, side, lane, bySide) { const c = cr(st, side, lane); return !!c && (side === bySide || !untouchable(st, side, lane)); }
function coolGuarded(st, side, lane) {
  for (const l of [lane - 1, lane + 1]) { const c = cr(st, side, l); if (c && card(c.id).kw.cool) return true; }
  return false;
}
function canBeAttacked(st, side, lane) {
  const c = cr(st, side, lane); if (!c) return false;
  if (untouchable(st, side, lane)) return false;
  if (c.fl && card(c.id).kw.pigNap) return false;
  if (coolGuarded(st, side, lane)) return false;
  return true;
}
function hengeHere(st, side, lane) { const b = bl(st, side, lane); return !!(b && !b.hidden && card(b.id).kw.henge); }
function schoolHere(st, side, lane) { const b = bl(st, side, lane); return !!(b && !b.hidden && card(b.id).kw.school); }

function cStats(st, side, lane) {
  const P = st.players[side], c = P.lanes[lane].creature; if (!c) return null;
  const cd = card(c.id), k = cd.kw;
  let base = (cd.atk || 0) + lvlAtk(c.lvl);
  if (k.cornPower) base += k.cornPower * countLand(st, side, 'corn');
  let atk = base + (c.pAtk || 0) + (c.tAtk || 0);
  if (k.triple && countLand(st, side, 'corn') >= 3) atk += base * 2;
  let def = (cd.def || 1) + lvlDef(c.lvl) + (c.pDef || 0);
  const home = onHome(st, side, lane);
  if (home && cd.land === 'corn' && !k.cornPower) atk += 1;
  for (let l = lane - 1; l <= lane + 1; l++) {
    const b = bl(st, side, l); if (b && !b.hidden && card(b.id).kw.aura) atk += 1;
    if (l !== lane) { const n = cr(st, side, l); if (n && card(n.id).kw.rally) atk += 1; }
  }
  const b = bl(st, side, lane);
  if (b && !b.hidden) { const bk = card(b.id).kw; if (bk.castle) atk += bk.castle; if (bk.fort) def += bk.fort; }
  if (k.spellPower && st.active === side) atk += k.spellPower * (P.spells || 0);
  if (k.barnPower) { for (let l = 0; l < LANES; l++) { const x = bl(st, side, l); if (x && !x.hidden && card(x.id).kw.barn) { atk += k.barnPower; break; } } }
  if (c.debuffs) for (const d of c.debuffs) atk += d.atk;
  atk -= (c.chill || 0);
  if (atk < 0) atk = 0;
  if (k.cornPower && countLand(st, side, 'corn') === 0) atk = 0;   // no corn to draw energy from: they collapse
  return { atk, def, hp: def - c.dmg, home };
}
function bDef(b) { return (card(b.id).def || 1) + Math.max(0, (b.lvl || 1) - 1); }

function mkInst(st, id, lvl, owner) { return { uid: st.uid++, id, lvl: lvl || 1, owner }; }
function mkCreature(st, inst, side) {
  return { uid: inst.uid, id: inst.id, lvl: inst.lvl || 1, owner: inst.owner == null ? side : inst.owner, dmg: 0,
    fl: false, act: false, moved: false, nap: false, inside: false, study: 0, frozen: false, thawAt: 0, chill: 0, burn: 0,
    rot: false, shield: 0, stuck: false, pAtk: 0, pDef: 0, tAtk: 0, debuffs: [], ripen: 0, forge: 0, school: 0, gob: 0,
    born: st.turn, token: !!card(inst.id).token, lastHit: null };
}
function mkBuilding(st, inst, side, extra) {
  return Object.assign({ uid: inst.uid, id: inst.id, lvl: inst.lvl || 1, owner: inst.owner == null ? side : inst.owner, dmg: 0,
    fl: false, hidden: !!card(inst.id).kw.trap, born: st.turn, kingdom: false }, extra || {});
}

// ---------------------------------------------------------------- GAME SETUP
function makePlayer(st, cfg, side) {
  const deckCfg = cfg.deck || {};
  const lands = deckCfg.lands || ['blue', 'blue', 'blue', 'blue'];
  const levels = cfg.levels || {};
  const deck = (deckCfg.cards || []).map(id => mkInst(st, id, levels[id] || cfg.level || 1, side));
  shuffle(st, deck);
  return {
    name: cfg.name || ('Player ' + (side + 1)), hero: cfg.hero || 'finn', deck, hand: [], discard: [],
    actions: 0, mulled: null, ready: false, spells: 0, bonusActions: cfg.bonusActions || 0, attacks: [],
    revealTurn: -1, peekTurn: -1,
    lanes: [0, 1, 2, 3].map(i => ({ land: { type: lands[i] || 'blue', orig: lands[i] || 'blue', down: false, by: null }, creature: null, building: null }))
  };
}

function newGame(cfg) {
  cfg = cfg || {};
  const st = { v: 2, rng: hashSeed(cfg.seed), turn: 0, round: 0, active: 0, first: 0, phase: 'mulligan', winner: null,
    reason: '', uid: 1, pending: null, blocks: {}, fx: { storm: 0, nightmares: -1 }, players: [],
    ot: cfg.overtime || OVERTIME, maxRounds: cfg.maxRounds || MAX_ROUNDS,
    noMulligan: !!cfg.noMulligan, noSetup: !!cfg.noSetup, noDiscard: !!cfg.noDiscard };
  const pc = cfg.players || [{}, {}];
  st.players = [makePlayer(st, pc[0] || {}, 0), makePlayer(st, pc[1] || {}, 1)];
  st.first = cfg.first === 0 || cfg.first === 1 ? cfg.first : randInt(st, 2);
  st.active = st.first;
  const ev = [];
  for (let p = 0; p < 2; p++) {
    const kd = (pc[p] && pc[p].kingdom) || kingdomOf(pc[p] && pc[p].deck);
    for (const k of kd || []) st.players[p].lanes[k.lane].building = mkBuilding(st, mkInst(st, k.id, k.lvl || 1, p), p, { kingdom: true, born: 0, hidden: false });
    const n = START_HAND + (p !== st.first ? 1 : 0);   // the second player picks up one extra card
    for (let i = 0; i < n; i++) drawCard(st, p, ev, true);
  }
  ev.push({ t: 'setup', first: st.first });
  if (st.noMulligan) { st.players[0].mulled = false; st.players[1].mulled = false; enterSetup(st, ev); }
  return { state: st, events: ev };
}

// Kingdom setup (show): both players secretly place cards, then "floop your land cards" reveals everything.
function enterSetup(st, ev) {
  if (st.noSetup) { startGame(st, ev); return; }
  st.phase = 'setup';
  st.players.forEach((P, i) => { P.actions = SETUP_BUDGET + (i !== st.first ? 1 : 0); P.ready = false; });   // the second player gets one more
  ev.push({ t: 'setupPhase' });
}
function startGame(st, ev) {
  st.phase = 'main';
  for (const P of st.players) { P.ready = true; P.actions = 0; }
  ev.push({ t: 'kingdom' });
  st.turn = 0;
  beginTurn(st, ev);
}

// ---------------------------------------------------------------- CORE MUTATIONS
function drawCard(st, side, ev, silent) {
  const P = st.players[side];
  if (P.hand.length >= HAND_MAX) { ev.push({ t: 'handFull', side }); return null; }
  if (!P.deck.length) { ev.push({ t: 'deckEmpty', side }); return null; }   // official: no reshuffle, no penalty
  const c = P.deck.pop();
  P.hand.push(c);
  ev.push({ t: 'draw', side, uid: c.uid, id: c.id, silent: !!silent, rng: 1 });
  return c;
}

function toDiscard(st, inst) {
  if (card(inst.id).token || card(inst.id).r === 'K' || inst.kingdom) return;   // landmarks aren't deck cards
  const owner = inst.owner == null ? 0 : inst.owner;
  st.players[owner].discard.push({ uid: inst.uid, id: inst.id, lvl: inst.lvl || 1, owner });
}

function damageCreature(st, side, lane, n, src, ev, kind) {
  const c = cr(st, side, lane);
  if (!c || n <= 0) return 0;
  if (src && src.side != null && src.side >= 0 && src.side !== side && untouchable(st, side, lane)) { ev.push({ t: 'immune', side, lane }); return 0; }
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
function damageBuilding(st, side, lane, n, ev, kind) {
  const b = bl(st, side, lane); if (!b || n <= 0) return 0;
  b.dmg += n;
  ev.push({ t: 'bdamage', side, lane, n, hp: bDef(b) - b.dmg, kind: kind || 'fight' });
  return n;
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
  if (card(c.id).kw.cool) { ev.push({ t: 'immune', side, lane, cool: 1 }); return; }
  c.frozen = true; c.chill = 0;
  c.thawAt = st.active === side ? st.turn + 2 : st.turn + 1;
  ev.push({ t: 'status', side, lane, s: 'freeze', n: 1 });
}
function chill(st, side, lane, n, ev) {
  const c = cr(st, side, lane); if (!c || n <= 0) return;
  if (card(c.id).kw.cool) { ev.push({ t: 'immune', side, lane, cool: 1 }); return; }
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

// A face-down enemy building springs when a creature enters (or attacks) the lane across.
function springTrap(st, o, lane, side, cLane, ev) {
  const b = bl(st, o, lane); if (!b || !b.hidden) return false;
  const cd = card(b.id);
  b.hidden = false;
  ev.push({ t: 'trap', side: o, lane, id: b.id, uid: b.uid });
  const ab = cd.ab.find(a => a.on === 'trap');
  if (ab && cr(st, side, cLane)) FX[ab.fx](st, ab, { side: o, lane, slot: 'b', uid: b.uid, id: b.id, lvl: b.lvl }, [{ side, lane: cLane }], ev);
  if (st.players[o].lanes[lane].building === b) {
    st.players[o].lanes[lane].building = null;
    toDiscard(st, b);
    ev.push({ t: 'bdeath', side: o, lane, uid: b.uid, id: b.id, spent: 1 });
  }
  return true;
}
function enterLane(st, side, lane, ev) {
  if (st.phase === 'setup') return;
  const o = 1 - side, b = bl(st, o, lane);
  if (b && b.hidden && cr(st, side, lane)) springTrap(st, o, lane, side, lane, ev);
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
  if (!forced) a.moved = true;
  ev.push({ t: 'move', side, from, to, swap: !!b, forced: !!forced, uid: a.uid });
  if (!forced) {
    const ab = card(a.id).ab.find(x => x.on === 'moved');
    if (ab) FX[ab.fx](st, ab, srcOf(st, side, to, 'c'), [], ev);
  }
  enterLane(st, side, to, ev);
  if (b) enterLane(st, side, from, ev);
  return true;
}

// Steal: the creature crosses to the other side - same lane if free, else the nearest free lane, else it is
// destroyed. Stolen creatures arrive exhausted (official Field Reaper ruling) and lose temporary effects.
function takeControl(st, fromSide, lane, ev, prefLane) {
  const c = cr(st, fromSide, lane); if (!c) return false;
  const to = 1 - fromSide;
  st.players[fromSide].lanes[lane].creature = null;
  const P = st.players[fromSide];
  if (P.attacks.length) P.attacks = P.attacks.filter(u => u !== c.uid);
  let dest = null;
  const pref = prefLane == null ? lane : prefLane;
  if (!cr(st, to, pref)) dest = pref;
  else { let best = 99; for (const l of emptyLanes(st, to)) if (Math.abs(l - pref) < best) { best = Math.abs(l - pref); dest = l; } }
  if (dest == null) {
    ev.push({ t: 'death', side: fromSide, lane, uid: c.uid, id: c.id, token: c.token ? 1 : 0, cause: 'nowhere' });
    toDiscard(st, c);
    return false;
  }
  c.fl = true; c.act = false; c.nap = false; c.inside = false; c.debuffs = []; c.chill = 0; c.tAtk = 0;
  st.players[to].lanes[dest].creature = c;
  for (const k in st.blocks) if (st.blocks[k] === c.uid || +k === c.uid) delete st.blocks[k];
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
  if (P.attacks.length) P.attacks = P.attacks.filter(u => u !== c.uid);
  ev.push({ t: 'death', side, lane, uid: c.uid, id: c.id, token: cd.token ? 1 : 0, cause: cause || 'killed' });
  if (!cd.token) {
    const owner = st.players[c.owner];
    if (cd.kw.immortal && owner.hand.length < HAND_MAX) {
      owner.hand.push({ uid: c.uid, id: c.id, lvl: c.lvl, owner: c.owner });
      ev.push({ t: 'immortal', side: c.owner, uid: c.uid, id: c.id });
    } else toDiscard(st, c);
  }
  const src = { side, lane, slot: 'c', uid: c.uid, id: c.id, lvl: c.lvl };
  for (const ab of cd.ab) if (ab.on === 'death') FX[ab.fx](st, ab, src, [], ev);
  // Pigs can't leave mud: a Pig that wins a fight on an enemy Useless Swamp gets stuck and changes sides.
  if (c.lastHit && c.lastHit.atk && (cause === 'killed' || cause === 'scared') && !L.down && L.type === 'swamp') {
    const k = findCreature(st, c.lastHit.uid);
    if (k && k.side !== side && card(k.c.id).kw.muddy) {
      const pigUid = k.c.uid;
      ev.push({ t: 'say', side, text: 'Pigs can\'t leave mud landscapes once they\'re on them! The Pig is mine!' });
      takeControl(st, k.side, k.lane, ev, lane);
      const f = findCreature(st, pigUid); if (f) { f.c.stuck = true; ev.push({ t: 'status', side: f.side, lane: f.lane, s: 'stuck', n: 1 }); }
    }
  }
  if (!cd.token && cd.land === 'swamp' && !L.down && L.type === 'swamp' && cause !== 'replace' && cause !== 'volcano') spawnToken(st, side, lane, 't_zombie', ev);
  if (c.rot) for (const l of [lane - 1, lane + 1]) if (cr(st, side, l)) applyRot(st, side, l, ev);
  for (let l = lane - 1; l <= lane + 1; l++) {
    const b = bl(st, side, l);
    if (b && !b.hidden) for (const ab of card(b.id).ab) if (ab.on === 'allyDeath') FX[ab.fx](st, ab, srcOf(st, side, l, 'b'), [{ side, lane }], ev);
  }
  for (let s = 0; s < 2; s++) for (let l = 0; l < LANES; l++) {
    const x = cr(st, s, l);
    if (x) for (const ab of card(x.id).ab) if (ab.on === 'anyDeath') FX[ab.fx](st, ab, srcOf(st, s, l, 'c'), [], ev);
  }
}

function destroyBuilding(st, side, lane, ev, cause) {
  const b = bl(st, side, lane); if (!b) return;
  st.players[side].lanes[lane].building = null;
  toDiscard(st, b);
  ev.push({ t: 'bdeath', side, lane, uid: b.uid, id: b.id, cause: cause || 'destroyed', kingdom: b.kingdom ? 1 : 0 });
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
}

function gameOver(st, ev, winner, reason) {
  st.winner = winner; st.reason = reason; st.phase = 'over'; st.pending = null;
  ev.push({ t: 'gameOver', winner, reason });
}
// "You have no creatures left. That's the game, boyee!" - checked at the end of every turn.
function checkKingdoms(st, ev) {
  if (st.winner != null) return true;
  const a = kingdomSize(st, 0), b = kingdomSize(st, 1);
  if (a > 0 && b > 0) return false;
  gameOver(st, ev, a === 0 && b === 0 ? -1 : (a === 0 ? 1 : 0), a === 0 && b === 0 ? 'both' : 'wipe');
  return true;
}
function kingdomScore(st, side) {
  let n = 0, tough = 0; const L = st.players[side].lanes;
  for (let l = 0; l < LANES; l++) {
    if (L[l].creature) { n++; tough += Math.max(0, cStats(st, side, l).hp); }
    if (L[l].building) { n++; tough += Math.max(0, bDef(L[l].building) - L[l].building.dmg); }
  }
  return { n, tough };
}
// Tourney rules ("the slight point lead gives the win"): at the time limit the bigger kingdom wins.
function judges(st, ev) {
  const a = kingdomScore(st, 0), b = kingdomScore(st, 1);
  let w = -1;
  if (a.n !== b.n) w = a.n > b.n ? 0 : 1;
  else if (a.tough !== b.tough) w = a.tough > b.tough ? 0 : 1;
  ev.push({ t: 'judges', score: [a, b] });
  gameOver(st, ev, w, w < 0 ? 'cats' : 'points');
}

// ---------------------------------------------------------------- EFFECTS (fx handlers)
// Signature: (state, ability, source, targets, events). Targets are {side,lane} or {uid}.
const FX = {
  noop() {},
  drawCards(st, ab, s, t, ev) { for (let i = 0; i < (ab.n || 1); i++) drawCard(st, s.side, ev); },
  raiseDead(st, ab, s, t, ev) {
    const c = cr(st, s.side, s.lane); if (!c) return;
    c.study = Math.max(0, c.study - 1); c.inside = false;
    ev.push({ t: 'say', side: s.side, text: 'My Ancient Scholar raises the dead!' });
    raise(st, s.side, t[0].uid, t[1].lane, ev, false);
  },
  razeAcross(st, ab, s, t, ev) {
    const o = 1 - s.side, b = bl(st, o, s.lane); if (!b) return;
    ev.push({ t: 'zap', from: { side: s.side, lane: s.lane }, to: { side: o, lane: s.lane, slot: 'b' }, kind: 'raze' });
    damageBuilding(st, o, s.lane, abN(ab, s.lvl), ev, 'raze');
  },
  embarrass(st, ab, s, t, ev) {
    const o = 1 - s.side, c = cr(st, o, s.lane); if (!c || untouchable(st, o, s.lane)) return;
    c.debuffs.push({ atk: -1, exp: st.turn + 2, shy: 1 });
    ev.push({ t: 'buff', side: o, lane: s.lane, atk: -1, temp: 1, shy: 1 });
  },
  buffSelfTurn(st, ab, s, t, ev) { const c = cr(st, s.side, s.lane); if (c) { c.tAtk += ab.n; ev.push({ t: 'buff', side: s.side, lane: s.lane, atk: ab.n, temp: 1 }); } },
  eatCorn(st, ab, s, t, ev) {
    const o = 1 - s.side; let ate = 0;
    const pig = cr(st, s.side, s.lane); if (pig) pig.ate = 1;   // one big meal: then it's full
    ev.push({ t: 'eat', side: s.side, lane: s.lane });
    for (let l = 0; l < LANES; l++) {
      const L = land(st, o, l);
      if (!L.down && L.type === 'corn') { L.down = true; ate++; ev.push({ t: 'land', side: o, lane: l, type: L.type, down: true, cause: 'eat' }); }
    }
    if (!ate) { const L = land(st, o, s.lane); if (!L.down) { L.down = true; ev.push({ t: 'land', side: o, lane: s.lane, type: L.type, down: true, cause: 'eat' }); } }
  },
  schoolLearn(st, ab, s, t, ev) {
    const c = cr(st, s.side, s.lane);
    if (c && c.school < 2) { c.school++; c.pDef++; ev.push({ t: 'buff', side: s.side, lane: s.lane, def: 1, perm: 1 }); }
  },
  cave(st, ab, s, t, ev) {
    const c = cr(st, s.side, s.lane); if (!c) return;
    c.nap = true;
    healCreature(st, s.side, s.lane, 2, ev);
    if (c.act) { c.act = false; const P = st.players[s.side]; P.attacks = P.attacks.filter(u => u !== c.uid); }
    for (const k in st.blocks) if (st.blocks[k] === c.uid) { delete st.blocks[k]; c.act = false; }
    ev.push({ t: 'status', side: s.side, lane: s.lane, s: 'nap', n: 1 });
  },
  readyCreature(st, ab, s, t, ev) {
    const c = cr(st, t[0].side, t[0].lane); if (!c) return;
    c.fl = false; ev.push({ t: 'ready', side: t[0].side, lane: t[0].lane });
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
  tokenAt(st, ab, s, t, ev) { spawnToken(st, s.side, t[0].lane, ab.token, ev); },
  tokenHere(st, ab, s, t, ev) { spawnToken(st, s.side, s.lane, ab.token, ev); },
  bloodstorm(st, ab, s, t, ev) { st.fx.storm = abN(ab, s.lvl); ev.push({ t: 'storm', side: s.side, n: st.fx.storm }); },
  nightmares(st, ab, s, t, ev) { st.fx.nightmares = s.side; ev.push({ t: 'nightmares', side: s.side }); },
  convertLand(st, ab, s, t, ev) {
    const L = land(st, t[0].side, t[0].lane);
    L.type = ab.land; L.down = false; L.scorch = false; L.by = t[0].side === s.side ? null : s.side;
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
    const opts = O.hand.map(c => c.uid);
    if (opts.length) { st.pending = { kind: 'steal', side: s.side, from: o, options: opts }; ev.push({ t: 'pending', side: s.side, kind: 'steal' }); }
  },
  reapSouls(st, ab, s, t, ev) {
    const o = 1 - s.side; let n = 0;
    for (let l = 0; l < LANES; l++) { const c = cr(st, o, l); if (c && c.dmg > 0 && !untouchable(st, o, l)) { ev.push({ t: 'reap', side: s.side, from: o, lane: l }); if (takeControl(st, o, l, ev, l)) n++; } }
    if (n) ev.push({ t: 'say', side: s.side, text: 'The Reaper steals the souls of your creatures!' });
  },
  summonDan(st, ab, s, t, ev) {
    const o = 1 - s.side;
    spawnToken(st, s.side, t[0].lane, ab.token, ev);
    for (let l = 0; l < LANES; l++) if (bl(st, o, l)) {
      ev.push({ t: 'zap', from: { side: s.side, lane: t[0].lane }, to: { side: o, lane: l, slot: 'b' }, kind: 'arrow' });
      destroyBuilding(st, o, l, ev, 'arrow');
    }
  },
  gobble(st, ab, s, t, ev) {
    const c = cr(st, s.side, s.lane);
    if (c && c.gob < (ab.n || 3)) { c.gob++; c.pAtk++; ev.push({ t: 'buff', side: s.side, lane: s.lane, atk: 1, perm: 1 }); }
  },
  rotAllEnemies(st, ab, s, t, ev) { const o = 1 - s.side; for (let l = 0; l < LANES; l++) if (targetable(st, o, l, s.side)) applyRot(st, o, l, ev); },
  cryptRaise(st, ab, s, t, ev) { const b = bl(st, s.side, s.lane); if (!b || b.raised === st.turn) return; if (spawnToken(st, s.side, s.lane, ab.token, ev)) b.raised = st.turn; },
  mudTrap(st, ab, s, t, ev) { const v = cr(st, t[0].side, t[0].lane); if (v) { v.stuck = true; ev.push({ t: 'status', side: t[0].side, lane: t[0].lane, s: 'stuck', n: 1 }); applyRot(st, t[0].side, t[0].lane, ev); } },
  cauldron(st, ab, s, t, ev) {
    if (!cr(st, s.side, s.lane)) return;
    destroyCreature(st, s.side, s.lane, ev, 'sacrifice');
    drawCard(st, s.side, ev); drawCard(st, s.side, ev);
    st.players[s.side].actions += 1;
    ev.push({ t: 'actions', side: s.side, n: st.players[s.side].actions });
  },
  harvest(st, ab, s, t, ev) { const x = t[0]; if (cr(st, x.side, x.lane)) { ev.push({ t: 'reap', side: s.side, from: x.side, lane: x.lane }); takeControl(st, x.side, x.lane, ev); } },
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
    const e = cr(st, o, from); if (!e || untouchable(st, o, from)) return;
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
    const o = 1 - s.side, n = abN(ab, s.lvl) - 1;
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
    let has = false; for (let l = 0; l < LANES; l++) { const b = bl(st, s.side, l); if (b && !b.kingdom) has = true; }
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
    const tgt = b && !b.hidden ? 'b' : (targetable(st, o, s.lane, s.side) ? 'c' : null);
    if (!tgt) return;
    ev.push({ t: 'zap', from: { side: s.side, lane: s.lane, slot: 'b' }, to: { side: o, lane: s.lane, slot: tgt }, kind: 'cannon' });
    if (tgt === 'b') damageBuilding(st, o, s.lane, 3, ev, 'cannon');
    else damageCreature(st, o, s.lane, 2, s, ev);
  },
  firePit(st, ab, s, t, ev) { const o = 1 - s.side; for (let l = s.lane - 1; l <= s.lane + 1; l++) if (targetable(st, o, l, s.side)) applyBurn(st, o, l, 1, ev); },
  fireball(st, ab, s, t, ev) {
    const x = t[0]; if (!cr(st, x.side, x.lane)) return;
    damageCreature(st, x.side, x.lane, abN(ab, s.lvl), { side: s.side }, ev);
    for (const l of [x.lane - 1, x.lane + 1]) if (cr(st, x.side, l) && (x.side === s.side || targetable(st, x.side, l, s.side))) damageCreature(st, x.side, l, 1, { side: s.side }, ev);
  },
  heatwave(st, ab, s, t, ev) {
    const o = 1 - s.side, n = abN(ab, s.lvl);
    for (let l = 0; l < LANES; l++) { const b = bl(st, o, l); if (b && !b.hidden) damageBuilding(st, o, l, n, ev, 'spell'); }
    for (let l = 0; l < LANES; l++) if (targetable(st, o, l, s.side)) applyBurn(st, o, l, 1, ev);
  },
  wander(st, ab, s, t, ev) {
    const c = cr(st, s.side, s.lane); if (!c || c.stuck || c.frozen) return;
    const L = land(st, s.side, s.lane);
    if (!L.down && L.type === 'swamp') { c.stuck = true; ev.push({ t: 'status', side: s.side, lane: s.lane, s: 'stuck', n: 1 }); return; }
    const e = emptyLanes(st, s.side); if (!e.length) return;
    const to = e[randInt(st, e.length)];
    moveCreature(st, s.side, s.lane, to, ev, true);
    ev.push({ t: 'wander', side: s.side, lane: to, rng: 1 });
    const L2 = land(st, s.side, to), c2 = cr(st, s.side, to);
    if (c2 === c && !L2.down && L2.type === 'swamp') { c.stuck = true; ev.push({ t: 'status', side: s.side, lane: to, s: 'stuck', n: 1 }); }
  },
  mohawk(st, ab, s, t, ev) {
    let best = -1, ba = -1;
    for (let l = 0; l < LANES; l++) { if (l === s.lane) continue; const c = cr(st, s.side, l); if (c) { const a = cStats(st, s.side, l).atk; if (a > ba) { ba = a; best = l; } } }
    if (best < 0) return;
    const c = cr(st, s.side, best); c.pAtk += ab.n || 2; c.mohawk = 1;
    ev.push({ t: 'buff', side: s.side, lane: best, atk: ab.n || 2, perm: 1, mohawk: 1 });
  },
  coldNose(st, ab, s, t, ev) {
    ev.push({ t: 'coldNose', side: s.side });
    for (const side of [0, 1]) for (let l = 0; l < LANES; l++) if (cr(st, side, l) && (side === s.side || targetable(st, side, l, s.side))) freeze(st, side, l, ev);
  },
  healHere(st, ab, s, t, ev) { healCreature(st, s.side, s.lane, ab.n || 2, ev); },
  teleport(st, ab, s, t, ev) {
    const a = t[0], b = t[1];
    if (!cr(st, a.side, a.lane) || cr(st, a.side, b.lane)) return;
    moveCreature(st, a.side, a.lane, b.lane, ev, true);
  },
  reclaim(st, ab, s, t, ev) {
    let corn = [];
    for (let l = 0; l < LANES; l++) {
      const L = land(st, s.side, l);
      if (L.down || (L.by != null && L.by !== s.side)) {
        L.down = false; L.scorch = false; if (L.by != null && L.by !== s.side) { L.type = L.orig; L.by = null; }
        ev.push({ t: 'land', side: s.side, lane: l, type: L.type, down: false, cause: 'reclaim' });
        if (L.type === 'corn') corn.push(l);
      }
    }
    const P = st.players[s.side]; let revived = 0;
    for (const l of corn) {
      if (cr(st, s.side, l)) continue;
      const k = P.discard.find(c => card(c.id).kw.cornPower);
      if (!k) break;
      raise(st, s.side, k.uid, l, ev, false); revived++;
    }
    if (revived) ev.push({ t: 'say', side: s.side, text: 'My Husker Knights revive!' });
  },
  volcano(st, ab, s, t, ev) {
    const lane = s.lane;
    ev.push({ t: 'volcano', side: s.side, lane });
    for (const side of [0, 1]) for (let l = 0; l < LANES; l++) {
      const L = land(st, side, l);
      if (!L.down) { L.down = true; L.scorch = true; ev.push({ t: 'land', side, lane: l, type: L.type, down: true, cause: 'lava' }); }
    }
    for (const side of [s.side, 1 - s.side]) for (let l = 0; l < LANES; l++) {
      const c = cr(st, side, l); if (!c) continue;
      if (c.inside || card(c.id).kw.volcanoProof) { ev.push({ t: 'immune', side, lane: l, volcano: 1 }); continue; }
      destroyCreature(st, side, l, ev, 'volcano');
    }
    for (const side of [0, 1]) { const b = bl(st, side, lane); if (b && !card(b.id).kw.volcanoProof) destroyBuilding(st, side, lane, ev, 'lava'); }
  },
  portalTwin(st, ab, s, t, ev) {
    const P = st.players[s.side]; const opts = [];
    for (let l = 0; l < LANES; l++) if (l !== s.lane && !P.lanes[l].building) opts.push(l);
    if (!opts.length) return;
    const l = opts[randInt(st, opts.length)];
    const inst = mkInst(st, 'r_portal', s.lvl || 1, s.side);
    P.lanes[l].building = mkBuilding(st, inst, s.side, { twin: 1, hidden: false });
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
  enemyDamaged(st, p) { const o = 1 - p, r = []; for (let l = 0; l < LANES; l++) { const c = cr(st, o, l); if (c && c.dmg > 0 && cStats(st, o, l).hp <= 2 && targetable(st, o, l, p)) r.push({ side: o, lane: l }); } return r; },
  allyCreature(st, p) { const r = []; for (let l = 0; l < LANES; l++) if (cr(st, p, l)) r.push({ side: p, lane: l }); return r; },
  anyCreature(st, p) { return TG.allyCreature(st, p).concat(TG.enemyCreature(st, p)); },
  myFlooped(st, p) { const r = []; for (let l = 0; l < LANES; l++) { const c = cr(st, p, l); if (c && c.fl && !c.frozen) r.push({ side: p, lane: l }); } return r; },
  myOtherFlooped(st, p, src) { return TG.myFlooped(st, p).filter(o => o.lane !== src.lane); },
  anyMovable(st, p) {
    const r = [];
    for (let s = 0; s < 2; s++) {
      if (!emptyLanes(st, s).length) continue;
      for (let l = 0; l < LANES; l++) { const c = cr(st, s, l); if (c && !c.stuck && !c.act && targetable(st, s, l, p)) r.push({ side: s, lane: l }); }
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
  myMovable(st, p) { const r = []; for (let l = 0; l < LANES; l++) { const c = cr(st, p, l); if (c && !c.stuck && !c.act) r.push({ side: p, lane: l }); } return r; },
  pushDir(st, p, src) {
    const o = 1 - p; if (!targetable(st, o, src.lane, p)) return [];
    return [src.lane - 1, src.lane + 1].filter(inLane).map(l => ({ side: o, lane: l }));
  },
  enemyNearMyBuilding(st, p) { const o = 1 - p, r = []; for (let l = 0; l < LANES; l++) if (bl(st, p, l) && targetable(st, o, l, p)) r.push({ side: o, lane: l }); return r; },
  myHandOther(st, p, src) { const r = [], seen = {}; for (const c of st.players[p].hand) if (c.uid !== src.uid && !seen[c.id]) { seen[c.id] = 1; r.push({ uid: c.uid, id: c.id }); } return r; }
};

function abilityOf(st, p, src) {
  if (src.uid != null && src.lane == null) {
    const inst = st.players[p].hand.find(c => c.uid === src.uid); if (!inst) return null;
    const cd = card(inst.id);
    if (cd.type === 'spell') return cd.ab.find(a => a.on === 'cast') || null;
    if (cd.extra && cd.extra.discard) return { tg: ['myHandOther'] };
    return null;
  }
  const x = src.slot === 'b' ? bl(st, p, src.lane) : cr(st, p, src.lane);
  return x ? card(x.id).floop : null;
}
function targetSteps(st, p, src) { const ab = abilityOf(st, p, src); return ab ? (ab.tg || []) : []; }
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
function hasTargetChain(st, p, src, chosen) {
  const opts = targetOptions(st, p, src, chosen);
  if (opts === null) return true;
  for (const o of opts) if (hasTargetChain(st, p, src, chosen.concat([o]))) return true;
  return false;
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
function inSetup(st, p) { return st.phase === 'setup' && !st.players[p].ready; }

// Why a card can't be played ('' if it can, ignoring targets/lanes).
function playBlock(st, p, uid) {
  if (st.winner != null) return 'The game is over';
  const setup = inSetup(st, p);
  if (!setup) {
    if (st.pending) return 'Finish your choice first';
    if (st.phase !== 'main' || st.active !== p) return 'Not your turn';
  }
  const inst = st.players[p].hand.find(c => c.uid === uid); if (!inst) return 'Not in hand';
  const cd = card(inst.id);
  if (cd.type === 'unknown') return 'Unknown card';
  if (setup && cd.type === 'spell') return 'Set up creatures and buildings only';
  const cost = spellCost(st, p, cd);
  if (cost > st.players[p].actions) return 'Needs ' + cost + ' Action' + (cost === 1 ? '' : 's');
  if (!meetsReq(st, p, cd)) return 'Needs ' + cd.req + ' face-up ' + LANDS[cd.land].name;
  if (cd.extra && cd.extra.discard && st.players[p].hand.length < 2) return 'Needs another card to discard';
  if (cd.type !== 'spell' && !playLanes(st, p, uid).length) return 'No room';
  return '';
}
function playLanes(st, p, uid) {
  const inst = st.players[p].hand.find(c => c.uid === uid); if (!inst) return [];
  const cd = card(inst.id), r = [];
  for (let l = 0; l < LANES; l++) {
    if (cd.type === 'creature') {
      const c = cr(st, p, l);
      if (c && (c.fl || c.act)) continue;            // official: only a Ready creature can be replaced
      if (cd.kw.hides) { const L = land(st, p, l); if (L.down || L.type !== cd.kw.hides) continue; }
      r.push(l);
    } else if (cd.type === 'building') { const b = bl(st, p, l); if (!b || !b.kingdom) r.push(l); }
  }
  return r;
}
function defending(st, p) { return !!(st.pending && st.pending.kind === 'defend' && st.pending.side === p); }
function floopBlock(st, p, lane, slot) {
  if (st.winner != null) return 'The game is over';
  if (st.phase !== 'main') return 'Not now';
  const def = defending(st, p);
  if (st.pending && !def) return 'Finish your choice first';
  if (!def && st.active !== p) return 'Not your turn';
  const x = slot === 'b' ? bl(st, p, lane) : cr(st, p, lane);
  if (!x) return 'Nothing there';
  const cd = card(x.id), ab = cd.floop;
  if (!ab) return 'No FLOOP ability';
  if (x.hidden) return 'Traps spring on their own';
  if (x.fl) return 'Already flooped';
  if (slot !== 'b') {
    if (x.act && !(x.inside && ab.fx === 'raiseDead') && !hengeHere(st, p, lane)) return 'Already activated';
    if (x.frozen) return 'Frozen';
    if (x.nap) return 'Napping';
    if (x.debuffs && x.debuffs.some(d => d.shy)) return 'Too embarrassed';
  }
  if (def) {
    if (ab.own) return 'Only on your own turn';
    if (ab.cost) return 'Needs Actions (only on your turn)';
    if (st.fx.nightmares === 1 - p) return 'Too scared to floop (Field of Nightmares)';
  } else if ((ab.cost || 0) > st.players[p].actions) return 'Needs ' + ab.cost + ' Action';
  if (ab.cond === 'learned' && !(x.study > 0)) return 'Needs to study first (activate him in a Schoolhouse lane)';
  if (ab.cond === 'learned' && x.studied === st.turn) return 'Still studying - Raise the Dead is ready from the next turn';
  if (ab.cond === 'myCreatureHere' && !cr(st, p, lane)) return 'Needs your creature in this lane';
  if (ab.cond === 'notFresh' && x.born === st.turn) return 'It needs a turn to rumble';
  if (ab.cond === 'buildingAcross' && !bl(st, 1 - p, lane)) return 'No building across';
  if (ab.fx === 'embarrass' && !(cr(st, 1 - p, lane) && !untouchable(st, 1 - p, lane))) return 'Nobody across to embarrass';
  if (ab.fx === 'cave') { const c = cr(st, p, lane); if (c && c.nap) return 'Already napping'; }
  if (ab.fx === 'eatCorn' && x.ate) return 'Full - the Pig already had its meal';
  if (ab.fx === 'eatCorn' && !pigFood(st, p, lane)) return 'Nothing left to eat';
  if (ab.fx === 'mohawk') return 'Not a floop';
  const steps = targetSteps(st, p, { lane, slot });
  if (steps.length && !hasTargetChain(st, p, { lane, slot }, [])) return 'No valid target';
  return '';
}
function pigFood(st, p, lane) {
  const o = 1 - p;
  for (let l = 0; l < LANES; l++) { const L = land(st, o, l); if (!L.down && L.type === 'corn') return true; }
  return !land(st, o, lane).down;
}

// What an attack from this lane would hit right now: {slot:'c'|'b', side, lane, guard?} or null.
// No creature across: an adjacent Guard steps in, else the building across is hit, else the attacker storms
// the kingdom and hits the nearest enemy building. Fliers go over the creature across to reach a building.
function attackTarget(st, p, lane) {
  const o = 1 - p, A = cr(st, p, lane); if (!A) return null;
  const ak = card(A.id).kw;
  const D = cr(st, o, lane), B = bl(st, o, lane);
  if (ak.flying) {
    if (B) return { slot: 'b', side: o, lane };
    const n = nearestBuilding(st, o, lane); if (n >= 0) return { slot: 'b', side: o, lane: n, storm: 1 };
  }
  if (D) return canBeAttacked(st, o, lane) ? { slot: 'c', side: o, lane } : null;   // an untouchable creature still holds its lane
  if (!ak.flying) {
    let best = -1, bestHp = -1;
    for (const l of [lane - 1, lane + 1]) {
      const g = cr(st, o, l);
      if (g && card(g.id).kw.guard && !g.frozen && canBeAttacked(st, o, l)) { const hp = cStats(st, o, l).hp; if (hp > bestHp) { bestHp = hp; best = l; } }
    }
    if (best >= 0) return { slot: 'c', side: o, lane: best, guard: 1 };
  }
  if (B) return { slot: 'b', side: o, lane };
  const n = nearestBuilding(st, o, lane);
  return n >= 0 ? { slot: 'b', side: o, lane: n, storm: 1 } : null;
}
function nearestBuilding(st, o, lane) {
  let best = -1, bd = 99, bh = 99;
  for (let l = 0; l < LANES; l++) {
    const b = bl(st, o, l); if (!b) continue;
    const d = Math.abs(l - lane), h = bDef(b) - b.dmg;
    if (d < bd || (d === bd && h < bh)) { bd = d; bh = h; best = l; }
  }
  return best;
}
function activateBlock(st, p, lane) {
  if (st.winner != null) return 'The game is over';
  if (st.phase !== 'main' || st.active !== p) return 'Not your turn';
  if (st.pending) return 'Finish your choice first';
  const c = cr(st, p, lane); if (!c) return 'Nothing there';
  if (c.act) return c.inside ? 'Studying' : '';
  if (c.fl && !hengeHere(st, p, lane)) return 'Flooped - it can\'t attack this turn';
  if (c.frozen) return 'Frozen';
  if (c.nap) return 'Napping';
  if (card(c.id).kw.scholar && schoolHere(st, p, lane)) return c.study > 0 ? 'Already studied - floop him to Raise the Dead' : '';
  if (cStats(st, p, lane).atk <= 0) return card(c.id).kw.cornPower ? 'Collapsed - no corn!' : 'No ATK';
  if (!attackTarget(st, p, lane)) return 'Nothing to attack across';
  return '';
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
  if (c.frozen || c.stuck || c.moved || c.act || c.nap) return r;
  for (let to = 0; to < LANES; to++) {
    if (to === from || cr(st, p, to)) continue;    // official: never into a lane where you have a creature
    const cost = moveCost(st, p, from, to);
    if (cost > st.players[p].actions) continue;
    r.push({ to, cost });
  }
  return r;
}
// Blocking (defender, during "So, what'll you use to defend?"): a ready creature steps in front of an attack
// aimed at its own lane or an adjacent lane.
function blockOptions(st, p) {
  const r = [];
  if (!defending(st, p) || st.fx.nightmares === 1 - p) return r;
  const A = st.players[1 - p];
  const taken = {};
  for (const k in st.blocks) taken[st.blocks[k]] = 1;
  for (const uid of A.attacks) {
    const f = findCreature(st, uid); if (!f || f.side !== 1 - p) continue;
    if (st.blocks[uid] != null) continue;
    const flying = card(f.c.id).kw.flying;
    for (let l = f.lane - 1; l <= f.lane + 1; l++) {
      const d = cr(st, p, l);
      if (!d || d.fl || d.act || d.frozen || d.nap || d.inside || taken[d.uid] || d.debuffs.some(x => x.shy)) continue;
      if (flying && !card(d.id).kw.flying) continue;
      if (cStats(st, p, l).atk <= 0 && cStats(st, p, l).hp <= 0) continue;
      r.push({ t: 'block', p, lane: l, at: uid });
    }
  }
  return r;
}

// ---------------------------------------------------------------- TURN FLOW
function beginTurn(st, ev) {
  st.turn += 1;
  st.round = Math.ceil(st.turn / 2);
  const p = st.active, P = st.players[p];
  P.actions = ACTIONS + (st.turn <= 2 ? P.bonusActions : 0);
  P.spells = 0; P.attacks = [];
  st.fx = { storm: 0, nightmares: -1 };
  st.blocks = {};
  for (let s = 0; s < 2; s++) for (let l = 0; l < LANES; l++) {
    const c = cr(st, s, l);
    if (c && c.debuffs.length) c.debuffs = c.debuffs.filter(d => d.exp > st.turn);
  }
  // 1. Ready all of your cards (studying Scholars come out of the Schoolhouse, nappers wake up)
  for (let l = 0; l < LANES; l++) {
    const c = cr(st, p, l); if (c) { c.fl = false; c.act = false; c.moved = false; c.nap = false; c.inside = false; }
    const b = bl(st, p, l); if (b) b.fl = false;
  }
  ev.push({ t: 'turn', side: p, turn: st.turn, round: st.round });
  if (st.round > st.maxRounds) { judges(st, ev); return; }
  if (st.round >= st.ot) {
    // Overtime: the kingdom crumbles - everything you control takes damage at the start of your turn.
    const n = Math.min(3, 1 + Math.floor((st.round - st.ot) / 3));
    ev.push({ t: 'overtime', side: p, n });
    for (let l = 0; l < LANES; l++) { if (cr(st, p, l)) damageCreature(st, p, l, n, null, ev, 'overtime'); if (bl(st, p, l)) damageBuilding(st, p, l, n, ev, 'overtime'); }
    checkDeaths(st, ev);
  }
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
  // 2. "You're supposed to discard a card and pick up a new one first." (not on the very first turn)
  if (st.turn === 1) return;
  if (P.hand.length && !st.noDiscard) { st.pending = { kind: 'discard', side: p }; ev.push({ t: 'pending', side: p, kind: 'discard' }); }
  else refill(st, p, ev);
}
// After the discard: pick up a new card, and keep picking up until you hold a full hand again.
function refill(st, p, ev) {
  const P = st.players[p];
  const n = Math.max(1, HAND_REFILL - P.hand.length);
  for (let i = 0; i < n; i++) if (!drawCard(st, p, ev)) break;
}

function resolveAttack(st, p, lane, ev) {
  const o = 1 - p, A = cr(st, p, lane); if (!A) return;
  const ak = card(A.id).kw;
  if (st.fx.storm) {
    ev.push({ t: 'stormHit', side: p, lane });
    damageCreature(st, p, lane, st.fx.storm, null, ev, 'storm');
    if (A.dmg >= cStats(st, p, lane).def) { destroyCreature(st, p, lane, ev, 'storm'); return; }
  }
  const atk = cStats(st, p, lane).atk;
  if (atk <= 0) { ev.push({ t: 'fizzle', side: p, lane, uid: A.uid, why: ak.cornPower ? 'collapse' : 'weak' }); return; }
  const ob = bl(st, o, lane);
  if (ob && !ob.hidden && card(ob.id).kw.spirit && atk >= card(ob.id).kw.spirit) {
    ev.push({ t: 'spirit', side: o, lane, uid: A.uid });
    takeControl(st, p, lane, ev, lane);
    destroyBuilding(st, o, lane, ev, 'faded');
    return;
  }
  // a blocker that stepped in?
  let T = null;
  const bu = st.blocks[A.uid];
  if (bu != null) {
    const f = findCreature(st, bu);
    if (f && f.side === o && Math.abs(f.lane - lane) <= 1 && !f.c.nap && !f.c.inside) T = { slot: 'c', side: o, lane: f.lane, block: 1 };
  }
  if (!T) T = attackTarget(st, p, lane);
  if (!T) { ev.push({ t: 'fizzle', side: p, lane, uid: A.uid, why: 'nothing' }); return; }
  const src = { side: p, lane, uid: A.uid, atk: 1 };
  if (T.slot === 'c') {
    const D = cr(st, o, T.lane), dk = card(D.id).kw;
    if (ak.scare && st.fx.nightmares === p) {
      ev.push({ t: 'attack', side: p, lane, toSide: o, toLane: T.lane, kind: 'creature', scare: 1, block: T.block ? 1 : 0 });
      ev.push({ t: 'scare', side: o, lane: T.lane, uid: D.uid });
      D.lastHit = { side: p, uid: A.uid, atk: 1 };
      destroyCreature(st, o, T.lane, ev, 'scared');
      return;
    }
    const ds = cStats(st, o, T.lane);
    const toD = atk + (ak.vsChill && (D.chill > 0 || D.frozen) ? ak.vsChill : 0);
    let back = 0;
    if (!(ak.ranged && !dk.ranged) && !D.frozen) back = ds.atk + (dk.vsChill && (A.chill > 0 || A.frozen) ? dk.vsChill : 0);
    ev.push({ t: 'attack', side: p, lane, toSide: o, toLane: T.lane, kind: 'creature', guard: T.guard ? 1 : 0, block: T.block ? 1 : 0, ranged: ak.ranged ? 1 : 0, back });
    if (st.fx.storm) { ev.push({ t: 'stormHit', side: o, lane: T.lane }); damageCreature(st, o, T.lane, st.fx.storm, null, ev, 'storm'); }
    const dealtD = damageCreature(st, o, T.lane, toD, src, ev, 'fight');
    const dealtA = back > 0 ? damageCreature(st, p, lane, back, { side: o, lane: T.lane, uid: D.uid }, ev, 'fight') : 0;
    if (dealtD > 0) onFightHit(st, p, lane, o, T.lane, ev);
    if (dealtA > 0) onFightHit(st, o, T.lane, p, lane, ev);
    if (ak.vamp && dealtD > 0) healCreature(st, p, lane, dealtD, ev);
    if (dk.vamp && dealtA > 0) healCreature(st, o, T.lane, dealtA, ev);
    return;
  }
  const B = bl(st, o, T.lane);
  if (B.hidden) { ev.push({ t: 'attack', side: p, lane, toSide: o, toLane: T.lane, kind: 'building', trap: 1, storm: T.storm ? 1 : 0 }); springTrap(st, o, T.lane, p, lane, ev); return; }
  ev.push({ t: 'attack', side: p, lane, toSide: o, toLane: T.lane, kind: 'building', flying: ak.flying ? 1 : 0, storm: T.storm ? 1 : 0 });
  damageBuilding(st, o, T.lane, atk + (ak.siege || 0), ev);
  const th = card(B.id).kw.thorns;
  if (th && !ak.ranged) damageCreature(st, p, lane, th, { side: o }, ev, 'thorns');
}

function onFightHit(st, aSide, aLane, dSide, dLane, ev) {
  const A = cr(st, aSide, aLane), D = cr(st, dSide, dLane); if (!A || !D) return;
  const ak = card(A.id).kw, home = onHome(st, aSide, aLane), land0 = card(A.id).land;
  if (ak.rotter) applyRot(st, dSide, dLane, ev);
  if (ak.chiller || (home && land0 === 'ice')) chill(st, dSide, dLane, 1, ev);
  if (home && land0 === 'lava') applyBurn(st, dSide, dLane, 1, ev);
}

function resolveBattle(st, ev) {
  const p = st.active, P = st.players[p];
  ev.push({ t: 'fightPhase', side: p, n: P.attacks.length });
  const order = P.attacks.slice();
  for (const uid of order) {
    if (st.winner != null) return;
    const f = findCreature(st, uid); if (!f || f.side !== p || !f.c.act) continue;
    resolveAttack(st, p, f.lane, ev);
    checkDeaths(st, ev);
  }
  P.attacks = [];
  endTurn(st, ev);
}

function endTurn(st, ev) {
  const p = st.active;
  for (let l = 0; l < LANES; l++) {
    const b = bl(st, p, l);
    if (b && !b.hidden) for (const ab of card(b.id).ab) if (ab.on === 'end') FX[ab.fx](st, ab, srcOf(st, p, l, 'b'), [], ev);
  }
  checkDeaths(st, ev);
  for (let l = 0; l < LANES; l++) {
    const c = cr(st, p, l);
    if (c && card(c.id).kw.ripen && !c.fl && !c.act && !c.moved && c.ripen < 1) {
      const L = land(st, p, l);
      if (!L.down && L.type === 'corn') { c.ripen++; c.pAtk++; c.pDef++; ev.push({ t: 'buff', side: p, lane: l, atk: 1, def: 1, perm: 1, ripen: 1 }); }
    }
  }
  for (let l = 0; l < LANES; l++) {
    const c = cr(st, p, l); if (!c) continue;
    if (c.burn > 0) { const n = c.burn; c.burn--; damageCreature(st, p, l, n, null, ev, 'burn'); }
    if (cr(st, p, l) && c.rot) damageCreature(st, p, l, 1, null, ev, 'rot');
  }
  checkDeaths(st, ev);
  for (let l = 0; l < LANES; l++) {
    const c = cr(st, p, l); if (!c) continue;
    if (c.frozen && c.thawAt <= st.turn) { c.frozen = false; ev.push({ t: 'status', side: p, lane: l, s: 'thaw', n: 0 }); }
    if (c.chill) { c.chill = 0; ev.push({ t: 'status', side: p, lane: l, s: 'chill', n: 0 }); }
  }
  for (let s = 0; s < 2; s++) for (let l = 0; l < LANES; l++) { const c = cr(st, s, l); if (c) c.tAtk = 0; }
  st.fx = { storm: 0, nightmares: -1 };
  st.blocks = {};
  st.pending = null;
  ev.push({ t: 'endTurn', side: p });
  if (checkKingdoms(st, ev)) return;
  st.active = 1 - p;
  beginTurn(st, ev);
}

// ---------------------------------------------------------------- COMMANDS
function exec(st, cmd, ev) {
  if (!cmd || !cmd.t) return 'Bad command';
  if (cmd.t === 'concede') {
    if (st.winner != null) return 'The game is over';
    gameOver(st, ev, 1 - cmd.p, 'concede');
    return null;
  }
  if (st.winner != null) return 'The game is over';
  const p = cmd.p, P = st.players[p];
  if (!P) return 'Bad player';
  if (cmd.t === 'mulligan') {
    if (st.phase !== 'mulligan') return 'Not mulligan time';
    if (P.mulled != null) return 'Already decided';
    P.mulled = !!cmd.redraw;
    if (cmd.redraw) {
      const n = P.hand.length;
      P.deck = P.deck.concat(P.hand); P.hand = [];
      shuffle(st, P.deck);
      for (let i = 0; i < n; i++) drawCard(st, p, ev, true);
      ev.push({ t: 'mulligan', side: p, rng: 1 });
    }
    if (st.players[0].mulled != null && st.players[1].mulled != null) enterSetup(st, ev);
    return null;
  }
  if (st.phase === 'setup') {
    if (P.ready) return 'Already set up';
    if (cmd.t === 'ready') {
      P.ready = true; P.actions = 0;
      ev.push({ t: 'setupDone', side: p });
      if (st.players[0].ready && st.players[1].ready) startGame(st, ev);
      return null;
    }
    if (cmd.t === 'play') return playCard(st, p, cmd, ev, true);
    return 'Set up your kingdom first';
  }
  if (cmd.t === 'choose') {
    const pd = st.pending;
    if (!pd || pd.kind !== 'steal' || pd.side !== p) return 'Nothing to choose';
    st.pending = null;
    if (cmd.uid != null) {
      if (!pd.options.includes(cmd.uid)) { st.pending = pd; return 'Not an option'; }
      const O = st.players[pd.from], i = O.hand.findIndex(c => c.uid === cmd.uid);
      if (i >= 0) {
        const inst = O.hand.splice(i, 1)[0];
        inst.owner = pd.side;
        P.hand.push(inst);
        ev.push({ t: 'stealCard', from: pd.from, to: pd.side, uid: inst.uid, id: inst.id });
      }
    }
    return null;
  }
  if (cmd.t === 'discard') {
    const pd = st.pending;
    if (!pd || pd.kind !== 'discard' || pd.side !== p) return 'Nothing to discard now';
    const i = P.hand.findIndex(c => c.uid === cmd.uid);
    if (i < 0) return 'Not in hand';
    const inst = P.hand.splice(i, 1)[0];
    toDiscard(st, inst);
    st.pending = null;
    ev.push({ t: 'discard', side: p, uid: inst.uid, id: inst.id });
    refill(st, p, ev);
    return null;
  }
  if (st.phase !== 'main') return 'Not playing yet';
  if (defending(st, p)) {
    if (cmd.t === 'floop') return floopCmd(st, p, cmd, ev);
    if (cmd.t === 'block') {
      const at = cmd.at, d = cr(st, p, cmd.lane);
      if (!d) return 'Nothing there';
      if (st.blocks[at] === d.uid) { delete st.blocks[at]; d.act = false; ev.push({ t: 'unblock', side: p, lane: cmd.lane, at }); return null; }
      if (!blockOptions(st, p).some(o => o.lane === cmd.lane && o.at === at)) return 'Can\'t block that';
      st.blocks[at] = d.uid; d.act = true;
      const f = findCreature(st, at);
      ev.push({ t: 'block', side: p, lane: cmd.lane, at, atLane: f ? f.lane : null, uid: d.uid });
      return null;
    }
    if (cmd.t === 'defend') {
      st.pending = null;
      ev.push({ t: 'defended', side: p });
      resolveBattle(st, ev);
      return null;
    }
    return 'Defend first';
  }
  if (p !== st.active) return 'Not your turn';
  if (st.pending) return 'Finish your choice first';
  switch (cmd.t) {
    case 'battle': {
      ev.push({ t: 'battleCall', side: p, attacks: P.attacks.slice() });
      const o = 1 - p;
      if (P.attacks.length && defenseOptions(st, o, true).length) {
        st.pending = { kind: 'defend', side: o };
        ev.push({ t: 'pending', side: o, kind: 'defend' });
        return null;
      }
      resolveBattle(st, ev);
      return null;
    }
    case 'draw': {
      if (P.actions < 1) return 'Needs 1 Action';
      if (P.hand.length >= HAND_MAX) return 'Hand is full';
      if (!P.deck.length) return 'No cards left';
      P.actions -= 1;
      ev.push({ t: 'buyDraw', side: p });
      drawCard(st, p, ev);
      return null;
    }
    case 'move': {
      const m = moveOptions(st, p, cmd.from).find(o => o.to === cmd.to);
      if (!m) return 'Can\'t move there';
      P.actions -= m.cost;
      moveCreature(st, p, cmd.from, cmd.to, ev, false);
      checkDeaths(st, ev);
      return null;
    }
    case 'activate': {
      const why = activateBlock(st, p, cmd.lane);
      if (why) return why;
      const c = cr(st, p, cmd.lane);
      if (c.act) { c.act = false; P.attacks = P.attacks.filter(u => u !== c.uid); ev.push({ t: 'deactivate', side: p, lane: cmd.lane, uid: c.uid }); return null; }
      c.act = true;
      if (card(c.id).kw.scholar && schoolHere(st, p, cmd.lane)) {
        c.inside = true; c.study = Math.min(1, c.study + 1); c.studied = st.turn;
        ev.push({ t: 'study', side: p, lane: cmd.lane, uid: c.uid });
        return null;
      }
      P.attacks.push(c.uid);
      ev.push({ t: 'activate', side: p, lane: cmd.lane, uid: c.uid, target: attackTarget(st, p, cmd.lane) });
      return null;
    }
    case 'floop': return floopCmd(st, p, cmd, ev);
    case 'play': return playCard(st, p, cmd, ev, false);
  }
  return 'Unknown command';
}

function floopCmd(st, p, cmd, ev) {
  const slot = cmd.slot === 'b' ? 'b' : 'c';
  const why = floopBlock(st, p, cmd.lane, slot);
  if (why) return why;
  const src = srcOf(st, p, cmd.lane, slot);
  const targets = cmd.targets || [];
  if (!validTargets(st, p, { lane: cmd.lane, slot }, targets)) return 'Invalid target';
  const x = slot === 'b' ? bl(st, p, cmd.lane) : cr(st, p, cmd.lane);
  const ab = card(x.id).floop;
  if (!defending(st, p)) st.players[p].actions -= ab.cost || 0;
  x.fl = true;
  ev.push({ t: 'floop', side: p, lane: cmd.lane, slot, id: x.id, uid: x.uid, defense: defending(st, p) ? 1 : 0 });
  FX[ab.fx](st, ab, src, targets, ev);
  checkDeaths(st, ev);
  return null;
}

function playCard(st, p, cmd, ev, setup) {
  const P = st.players[p];
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
  let extra = null;
  if (cd.extra && cd.extra.discard) {
    if (!validTargets(st, p, { uid: cmd.uid }, cmd.targets || [])) return 'Pick a card to discard';
    extra = cmd.targets[0].uid;
  }
  P.hand.splice(idx, 1); P.actions -= cost;
  if (extra != null) {
    const j = P.hand.findIndex(c => c.uid === extra);
    const d = P.hand.splice(j, 1)[0]; toDiscard(st, d);
    ev.push({ t: 'discard', side: p, uid: d.uid, id: d.id, extra: 1 });
  }
  inst.owner = inst.owner == null ? p : inst.owner;
  if (cd.type === 'creature') {
    const old = cr(st, p, lane);
    if (old) { P.lanes[lane].creature = null; ev.push({ t: 'replace', side: p, lane, slot: 'c', uid: old.uid, id: old.id }); toDiscard(st, old); }
    placeCreature(st, p, lane, inst, ev, setup ? 'setup' : 'play');
    if (!setup) {
      if (cd.id === 'c_maize') ev.push({ t: 'say', side: p, text: 'I LOVE CORN!' });
      for (const ab of cd.ab) if (ab.on === 'play') FX[ab.fx](st, ab, srcOf(st, p, lane, 'c'), [], ev);
      enterLane(st, p, lane, ev);
    }
  } else {
    const old = bl(st, p, lane);
    if (old) { P.lanes[lane].building = null; ev.push({ t: 'replace', side: p, lane, slot: 'b', uid: old.uid, id: old.id }); toDiscard(st, old); }
    P.lanes[lane].building = mkBuilding(st, inst, p);
    ev.push({ t: 'build', side: p, lane, uid: inst.uid, id: inst.id, hidden: !!cd.kw.trap, setup: setup ? 1 : 0 });
    if (!setup) for (const ab of cd.ab) if (ab.on === 'play') FX[ab.fx](st, ab, srcOf(st, p, lane, 'b'), [], ev);
  }
  checkDeaths(st, ev);
  return null;
}

function apply(state, cmd, opts) {
  const st = opts && opts.inPlace ? state : clone(state);
  const ev = (opts && opts.events) || [];
  const err = exec(st, cmd, ev);
  return { state: st, events: ev, error: err || null };
}

// Floops usable while defending (no Action cost, not own-turn-only) plus blocks.
function defenseOptions(st, p, assumePending) {
  const saved = st.pending;
  if (assumePending) st.pending = { kind: 'defend', side: p };
  const out = [];
  try {
    if (st.fx.nightmares !== 1 - p) {
      for (let l = 0; l < LANES; l++) for (const slot of ['c', 'b']) {
        if (floopBlock(st, p, l, slot)) continue;
        floopChains(st, p, l, slot, out);
      }
      for (const b of blockOptions(st, p)) out.push(b);
    }
  } finally { st.pending = saved; }
  return out;
}
function floopChains(st, p, l, slot, out) {
  const src = { lane: l, slot }, chains = [];
  (function walk(ch) {
    const o = targetOptions(st, p, src, ch);
    if (o === null) { chains.push(ch); return; }
    for (const x of o) walk(ch.concat([x]));
  })([]);
  for (const ch of chains) out.push({ t: 'floop', p, lane: l, slot, targets: ch });
}

// Every legal command for player p (used by the AI and tests).
function legalActions(st, p) {
  const out = [];
  if (st.winner != null) return out;
  const P = st.players[p];
  if (st.phase === 'mulligan') { if (P.mulled == null) out.push({ t: 'mulligan', p, redraw: false }, { t: 'mulligan', p, redraw: true }); return out; }
  if (st.pending) {
    const pd = st.pending;
    if (pd.side !== p) return out;
    if (pd.kind === 'steal') { for (const u of pd.options) out.push({ t: 'choose', p, uid: u }); out.push({ t: 'choose', p, uid: null }); }
    else if (pd.kind === 'discard') { const seen = {}; for (const c of P.hand) if (!seen[c.id]) { seen[c.id] = 1; out.push({ t: 'discard', p, uid: c.uid }); } }
    else if (pd.kind === 'defend') { for (const o of defenseOptions(st, p)) out.push(o); out.push({ t: 'defend', p }); }
    return out;
  }
  const setup = inSetup(st, p);
  if (!setup && (st.phase !== 'main' || st.active !== p)) return out;
  out.push(setup ? { t: 'ready', p } : { t: 'battle', p });
  const seen = {};
  for (const inst of P.hand) {
    const key = inst.id + ':' + inst.lvl; if (seen[key]) continue; seen[key] = 1;
    if (playBlock(st, p, inst.uid)) continue;
    const cd = card(inst.id);
    const chains = [];
    const src = { uid: inst.uid };
    (function walk(ch) {
      const o = targetOptions(st, p, src, ch);
      if (o === null) { chains.push(ch); return; }
      for (const x of o) walk(ch.concat([x]));
    })([]);
    if (cd.type === 'spell') { for (const ch of chains) out.push({ t: 'play', p, uid: inst.uid, targets: ch }); }
    else for (const l of playLanes(st, p, inst.uid)) for (const ch of chains) out.push(ch.length ? { t: 'play', p, uid: inst.uid, lane: l, targets: ch } : { t: 'play', p, uid: inst.uid, lane: l });
  }
  if (setup) return out;
  for (let l = 0; l < LANES; l++) for (const slot of ['c', 'b']) if (!floopBlock(st, p, l, slot)) floopChains(st, p, l, slot, out);
  for (let l = 0; l < LANES; l++) { const c = cr(st, p, l); if (c && !c.act && !activateBlock(st, p, l)) out.push({ t: 'activate', p, lane: l }); }
  for (let l = 0; l < LANES; l++) for (const m of moveOptions(st, p, l)) out.push({ t: 'move', p, from: l, to: m.to });
  if (P.actions >= 1 && P.hand.length < HAND_MAX && P.deck.length) out.push({ t: 'draw', p });
  return out;
}

// What a player is allowed to know. Hidden cards become '?' so the AI can't peek.
function redact(st, viewer) {
  const s = clone(st), o = 1 - viewer, O = s.players[o];
  const revealed = O.revealTurn === s.turn;
  if (!revealed) O.hand = O.hand.map(c => ({ uid: c.uid, id: '?', lvl: 1, owner: c.owner }));
  O.deck = O.deck.map(c => ({ uid: c.uid, id: '?', lvl: 1, owner: c.owner }));
  s.players[viewer].deck = s.players[viewer].deck.map((c, i, a) => (i === a.length - 1 ? c : { uid: c.uid, id: '?', lvl: 1, owner: c.owner }));
  if (O.peekTurn !== s.turn) for (let l = 0; l < LANES; l++) { const b = O.lanes[l].building; if (b && b.hidden) b.id = '?trap'; }
  if (s.phase === 'setup') for (let l = 0; l < LANES; l++) {   // the other kingdom is still hidden behind its land cards
    const L = O.lanes[l];
    if (L.creature) { O.hand.push({ uid: L.creature.uid, id: '?', lvl: 1, owner: o }); L.creature = null; }
    if (L.building && !L.building.kingdom) { O.hand.push({ uid: L.building.uid, id: '?', lvl: 1, owner: o }); L.building = null; }
  }
  s.rng = (s.rng ^ 0x5bd1e995) >>> 0;
  return s;
}

// Resolve the declared attacks of the active player on a copy (no defense, no end of turn) - fight preview.
function previewBattle(st) {
  const s = clone(st), ev = [];
  if (s.winner != null || s.phase !== 'main') return { events: [], state: s };
  const p = s.active, order = s.players[p].attacks.slice();
  for (const uid of order) {
    const f = findCreature(s, uid); if (!f || f.side !== p || !f.c.act) continue;
    resolveAttack(s, p, f.lane, ev);
    checkDeaths(s, ev);
  }
  return { events: ev, state: s, side: p };
}
// Threat preview: if `side` attacked with every creature that could, what would happen? (for AI evaluation)
function previewThreat(st, side) {
  const s = clone(st), ev = [];
  if (s.winner != null) return { state: s, events: ev };
  s.active = side; s.pending = null; s.blocks = {}; s.fx = { storm: 0, nightmares: -1 };
  const P = s.players[side]; P.attacks = [];
  for (let l = 0; l < LANES; l++) {
    const c = cr(s, side, l); if (!c) continue;
    c.fl = false; c.act = false; c.nap = false; c.inside = false;
  }
  for (let l = 0; l < LANES; l++) {
    const c = cr(s, side, l); if (!c || c.frozen) continue;
    if (card(c.id).kw.scholar && schoolHere(s, side, l)) continue;
    if (cStats(s, side, l).atk > 0 && attackTarget(s, side, l)) { c.act = true; P.attacks.push(c.uid); }
  }
  for (const uid of P.attacks.slice()) {
    const f = findCreature(s, uid); if (!f || f.side !== side) continue;
    resolveAttack(s, side, f.lane, ev);
    checkDeaths(s, ev);
  }
  return { state: s, events: ev };
}

function validateDeck(deck) {
  const errs = [], warn = [];
  if (!deck || !Array.isArray(deck.cards)) return { ok: false, errs: ['No cards'], warn };
  if (deck.cards.length !== DECK_SIZE) errs.push('Deck needs exactly ' + DECK_SIZE + ' cards (' + deck.cards.length + ')');
  const cnt = {};
  for (const id of deck.cards) {
    const cd = CARDS[id];
    if (!cd || cd.token || cd.r === 'K' || id[0] === '?') { errs.push('Unknown card ' + id); continue; }
    cnt[id] = (cnt[id] || 0) + 1;
  }
  for (const id in cnt) if (cnt[id] > (CARDS[id].r === 'L' ? 1 : MAX_COPIES)) errs.push('Too many copies of ' + CARDS[id].name + (CARDS[id].r === 'L' ? ' (Legendary: 1 copy)' : ''));
  if (!Array.isArray(deck.lands) || deck.lands.length !== LANES || deck.lands.some(t => !LAND_TYPES.includes(t))) errs.push('Pick 4 landscapes');
  else {
    const have = {}; for (const t of deck.lands) have[t] = (have[t] || 0) + 1;
    for (const id in cnt) {
      const cd = CARDS[id];
      if (cd.land !== 'rainbow' && cd.req > (have[cd.land] || 0)) warn.push(cd.name + ' needs ' + cd.req + ' ' + LANDS[cd.land].name);
      if (cd.kw.hides && !have[cd.kw.hides]) warn.push(cd.name + ' hides in a ' + LANDS[cd.kw.hides].name);
    }
  }
  return { ok: errs.length === 0, errs, warn };
}

function actionsLeftSummary(st, p) {
  if (st.active !== p || st.phase !== 'main' || st.winner != null || st.pending) return { cards: 0, floops: 0, attacks: 0, total: 0 };
  let cards = 0, floops = 0, attacks = 0;
  for (const inst of st.players[p].hand) {
    if (playBlock(st, p, inst.uid)) continue;
    const cd = card(inst.id);
    if (cd.type === 'spell' && !hasTargetChain(st, p, { uid: inst.uid }, [])) continue;
    cards++;
  }
  for (let l = 0; l < LANES; l++) {
    if (!floopBlock(st, p, l, 'c')) floops++;
    if (!floopBlock(st, p, l, 'b')) floops++;
    const c = cr(st, p, l); if (c && !c.act && !activateBlock(st, p, l)) attacks++;
  }
  return { cards, floops, attacks, total: cards + floops + attacks };
}

// ---------------------------------------------------------------- DECKS
function expand(list) { const r = []; for (const [id, n] of list) for (let i = 0; i < n; i++) r.push(id); return r; }
const STARTERS = {
  blue: { name: 'Finn\'s Blue Plains', hero: 'finn', lands: ['blue', 'blue', 'blue', 'blue'], cards: expand([
    ['b_cooldog', 2], ['b_scholar', 2], ['b_skypup', 2], ['b_soldier', 1], ['b_marauder', 2], ['b_chief', 1], ['b_ranger', 1], ['b_bard', 1],
    ['r_pig', 1], ['b_spirit', 1], ['b_cave', 1], ['r_bloodstorm', 1], ['r_teleport', 1], ['r_hotdog', 2], ['b_math', 1]]) },
  corn: { name: 'Jake\'s Cornfield', hero: 'jake', lands: ['corn', 'corn', 'corn', 'swamp'], cards: expand([
    ['c_husker', 2], ['c_earlings', 2], ['c_cornball', 1], ['c_scarecrow', 1], ['c_reaper', 1], ['c_maize', 1], ['c_silo', 1], ['c_henge', 1],
    ['c_archer', 1], ['c_nightmares', 1], ['c_plant', 1], ['r_baldman', 2], ['r_volcano', 1], ['r_reclaim', 2], ['r_teleport', 1], ['c_feedman', 1]]) },
  swamp: { name: 'Marceline\'s Useless Swamp', hero: 'marceline', lands: ['swamp', 'swamp', 'swamp', 'swamp'], cards: expand([
    ['s_wisp', 2], ['s_slinger', 2], ['s_digger', 2], ['s_witch', 1], ['s_gobbler', 2], ['s_lich', 1], ['s_crypt', 1], ['s_mudpit', 1],
    ['s_cauldron', 1], ['s_harvest', 1], ['s_unearth', 1], ['s_breath', 2], ['r_booby', 1], ['r_pancakes', 1], ['r_treefort', 1]]) },
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
    const b = mkBuilding(st, mkInst(st, id, (extra && extra.lvl) || 1, side), side, Object.assign({ born: st.turn - 1 }, extra || {}));
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
  LANES, ACTIONS, HAND_MAX, START_HAND, HAND_REFILL, SETUP_BUDGET, DECK_SIZE, MAX_COPIES, OVERTIME, MAX_ROUNDS,
  LANDS, LAND_TYPES, RARITY, KEYWORDS, CARDS, COLLECTIBLE, STARTERS, KINGDOMS, expand, kingdomOf, mainLand,
  newGame, apply, legalActions, defenseOptions, blockOptions, redact, clone, previewBattle, previewThreat, validateDeck,
  cStats, bDef, countLand, kingdomSize, kingdomScore, playBlock, playLanes, floopBlock, activateBlock, attackTarget,
  moveOptions, moveCost, canBeAttacked, untouchable, targetSteps, targetOptions, validTargets, hasTargetChain,
  costOf, spellCost, meetsReq, findCreature, actionsLeftSummary, hashSeed, card, defending, inSetup
};
})();
/* END ENGINE */
