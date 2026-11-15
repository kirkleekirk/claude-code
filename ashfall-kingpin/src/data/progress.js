// Ranks, perks, vehicles, Hollow facilities and upgrades.

export const RANKS = [
  { id: 'scavenger', name: 'Scavenger', rep: 0, unlocks: ['The Hollow, 4 grow plots, Bench I', 'Street sales in Millbrook', 'Ruin I scavenging'] },
  { id: 'hustler', name: 'Hustler', rep: 100, unlocks: ['First hires', 'First front business', 'Copper Gate trade', 'Bench II', 'Strain crossbreeding'] },
  { id: 'supplier', name: 'Supplier', rep: 400, unlocks: ['Managers', 'Harbor Nine trade', 'Bulk smuggling', 'Rackets: protection & loans', 'Vehicle I: Handcart', 'Bench III', 'Hollow 5x5'] },
  { id: 'boss', name: 'Boss', rep: 1200, unlocks: ['4-person squad', 'Saint Verity trade', 'Foundry raids', 'Rival diplomacy', 'Casino', 'Bench IV', 'Hollow expansion 6x6', 'Vehicle II: Dune Buggy'] },
  { id: 'warlord', name: 'Warlord', rep: 3000, unlocks: ['Occupy settlements', 'Convoy ambushes', 'Vehicle III: Armored Hauler', 'Compact crackdowns begin'] },
  { id: 'kingpin', name: 'Kingpin', rep: 7000, unlocks: ['New Haven endgame questline'] },
];

export function rankOf(rep) { let r = 0; for (let i = 0; i < RANKS.length; i++) if (rep >= RANKS[i].rep) r = i; return r; }

// Settlement trade access by rank (street sales and markets).
export const TRADE_RANK = { millbrook: 0, crossroads: 0, coppergate: 1, harbor9: 2, stverity: 3, foundry: 3, newhaven: 3 };

export const PERKS = {
  // Operator (economy)
  op_green: { tree: 'operator', name: 'Green Boss', tier: 0, desc: '+10% yield on every harvest.' },
  op_market: { tree: 'operator', name: 'Market Sense', tier: 0, desc: 'Saturation builds 20% slower when you sell.' },
  op_tongue: { tree: 'operator', name: 'Silver Tongue', tier: 1, desc: '+6% on every sale price.' },
  op_books: { tree: 'operator', name: 'Clean Books', tier: 1, desc: 'Laundering fees -3 points; audit risk grows 20% slower.' },
  op_bulk: { tree: 'operator', name: 'Bulk Buyer', tier: 2, desc: 'Materials and seeds cost 15% less.' },
  op_wages: { tree: 'operator', name: 'Union Buster', tier: 2, desc: 'Wages -12%.' },
  op_chain: { tree: 'operator', name: 'Supply Chain', tier: 3, desc: 'Craft and process times -15%.' },
  op_empire: { tree: 'operator', name: 'Diversified', tier: 3, desc: 'Fronts earn +12% legit revenue.' },
  // Gunman (combat)
  gun_aim: { tree: 'gunman', name: 'Steady Aim', tier: 0, desc: '+15% accuracy with every gun.' },
  gun_reload: { tree: 'gunman', name: 'Quick Hands', tier: 0, desc: 'Reload 25% faster.' },
  gun_hp: { tree: 'gunman', name: 'Thick Skin', tier: 1, desc: '+25 max HP.' },
  gun_dodge: { tree: 'gunman', name: 'Adrenaline', tier: 1, desc: 'Dodge-roll cooldown -35%, sprint lasts longer.' },
  gun_smith: { tree: 'gunman', name: 'Gun Nut', tier: 2, desc: '+0.5 average star on components you craft; better grade rolls.' },
  gun_squad: { tree: 'gunman', name: 'Squad Leader', tier: 2, desc: 'Squad deals +20% damage and gets +20 HP.' },
  gun_exec: { tree: 'gunman', name: 'Executioner', tier: 3, desc: '+50% damage against unaware targets.' },
  gun_will: { tree: 'gunman', name: 'Iron Will', tier: 3, desc: 'Lose 7% instead of 15% cash when downed; revive once per raid at 30 HP.' },
  // Fixer (stealth & social)
  fx_feet: { tree: 'fixer', name: 'Light Feet', tier: 0, desc: 'Sneak speed +30%; footsteps make no noise.' },
  fx_locks: { tree: 'fixer', name: 'Lockmaster', tier: 0, desc: 'Lockpick and safe windows 40% wider.' },
  fx_ghost: { tree: 'fixer', name: 'Ghost', tier: 1, desc: 'Guards detect you 25% slower.' },
  fx_bribe: { tree: 'fixer', name: 'Smooth Operator', tier: 1, desc: 'Bribes and tribute 25% cheaper.' },
  fx_snitch: { tree: 'fixer', name: 'Snitch Hunter', tier: 2, desc: 'Crew snitch chance -60%; vetting is free.' },
  fx_network: { tree: 'fixer', name: 'Fixer Network', tier: 2, desc: 'Heat decays +1.5 per day everywhere.' },
  fx_scape: { tree: 'fixer', name: 'Fall Guy', tier: 3, desc: 'Scapegoats cost half and remove 50% more heat.' },
  fx_inside: { tree: 'fixer', name: 'Inside Contacts', tier: 3, desc: 'Every raid starts with +1 recon intel.' },
};
export const PERK_TREES = { operator: 'Operator', gunman: 'Gunman', fixer: 'Fixer' };

// Level from lifetime REP earned (xp). One perk point per level.
export const levelFromXp = (xp) => 1 + Math.floor(Math.sqrt(Math.max(0, xp) / 12));
export const xpForLevel = (lvl) => 12 * (lvl - 1) * (lvl - 1);

export const VEHICLES = {
  handcart: { name: 'Handcart', rank: 2, price: 900, speed: 1.15, carry: 40, hp: 60, drive: false, desc: 'Push-cart. +40 carry, faster travel between towns.' },
  buggy: { name: 'Dune Buggy', rank: 3, price: 6500, speed: 2.4, carry: 60, hp: 140, drive: true, desc: 'Fast, loud, fun. +60 carry. Getaway-ready.' },
  hauler: { name: 'Armored Hauler', rank: 4, price: 22000, speed: 1.9, carry: 160, hp: 420, drive: true, armor: 0.5, desc: 'Plated truck. +160 carry, rams barricades, shrugs off bullets.' },
};

// Hollow grid facilities (each fills one 2x2-tile cell).
export const FACILITIES = {
  plot: { name: 'Grow Plot', cost: 60, rank: 0, icon: 'sprout', desc: 'Outdoor plot. Cheap, visible (smell heat), raidable. Grows by daylight.' },
  growroom: { name: 'Indoor Grow Room', cost: 650, rank: 1, icon: 'bud', power: 3, desc: 'Lamps 24/7, hidden smell. Needs 3 power and a water tank.' },
  generator: { name: 'Generator', cost: 380, rank: 1, icon: 'bolt', desc: '+10 power. Burns 1 fuel every 6 hours while loaded.' },
  watertank: { name: 'Water Tank', cost: 260, rank: 1, icon: 'drop', desc: 'Feeds up to 4 grow rooms. Tops up outdoor plots for tending crew.' },
  dryrack: { name: 'Drying Rack', cost: 150, rank: 0, icon: 'bud', desc: '+30 units of drying capacity.' },
  cureroom: { name: 'Cure Shelf', cost: 220, rank: 0, icon: 'jar', desc: '+30 units of curing capacity.' },
  compost: { name: 'Compost Bin', cost: 90, rank: 0, icon: 'compost', desc: 'Turns 1 scrap into 3 compost every 6 hours.' },
  smelter: { name: 'Smelter', cost: 320, rank: 0, icon: 'fuel', desc: 'Scrap to iron, iron to steel. Burns fuel.' },
  lathe: { name: 'Parts Lathe', cost: 420, rank: 0, icon: 'c_action', desc: 'Ingots + timber to the five gun components.' },
  press: { name: 'Ammo Press', cost: 260, rank: 0, icon: 'ammo', desc: 'Brass + propellant + scrap to ammunition.' },
  bench: { name: 'Assembly Bench', cost: 240, rank: 0, icon: 'g_rifle', desc: 'Blueprint + 5 components + mods = gun. Upgradeable I-IV.' },
  lab: { name: 'Breeding Lab', cost: 520, rank: 1, icon: 'seed', desc: 'Crossbreed strains into hybrids.' },
  safe: { name: 'Safe', cost: 450, rank: 0, icon: 'lock', desc: '+$6,000 protected stash. Raiders steal far less.' },
  bunks: { name: 'Bunks', cost: 320, rank: 1, icon: 'sleep', desc: '+8 crew housing and +5 morale.' },
  training: { name: 'Training Room', cost: 900, rank: 2, icon: 'target', desc: 'Assigned trainees gain skill 3x faster.' },
  turret: { name: 'Turret', cost: 750, rank: 2, icon: 'target', desc: 'Automatic defense during Hollow raids.' },
  watchpost: { name: 'Watch Post', cost: 260, rank: 1, icon: 'flag', desc: 'Guards posted here fight twice as well.' },
  traps: { name: 'Trap Field', cost: 220, rank: 1, icon: 'caltrops', desc: 'Caltrops and tripwires slow raiders.' },
  still: { name: 'Moonshine Still', cost: 600, rank: 2, icon: 'jug', desc: 'Grain + fuel to moonshine at home (heat on sale).' },
};
export const BENCH_UPGRADE = [null, null, { cost: 600, rank: 1 }, { cost: 1800, rank: 2 }, { cost: 5000, rank: 3 }];

export const HOLLOW_UPGRADES = {
  security: { name: 'Security', max: 3, cost: [800, 2400, 6000], rank: [1, 2, 3], desc: 'Reinforced walls and gate: raiders need longer, steal less.' },
  storage: { name: 'Storage', max: 3, cost: [500, 1500, 4000], rank: [0, 1, 2], desc: '+50% inventory capacity and +$4,000 stash per level.' },
  power: { name: 'Power Grid', max: 2, cost: [700, 2000], rank: [1, 2], desc: 'Generators burn 25% less fuel per level.' },
  tunnel: { name: 'Secret Tunnel', max: 1, cost: [3500], rank: [2], desc: 'Halves stash losses in a lost defense; lets you slip out to lay low.' },
};
export const GRID_SIZE_BY_RANK = [4, 4, 5, 6, 6, 6];
