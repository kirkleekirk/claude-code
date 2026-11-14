// Gun crafting tables: blueprints, components, materials, mods, ammo, grades, throwables.
// Range in tiles; noise in tiles of alert radius. All fictional.

export const NOISE = { None: 0, Low: 6, Med: 12, High: 18, 'V.High': 24, Extreme: 32 };

export const FAMILIES = {
  sidearm: { name: 'Sidearm', sound: 'shot_sidearm', icon: 'g_sidearm', handling: 1.2, demand: 1.0 },
  shotgun: { name: 'Shotgun', sound: 'shot_shotgun', icon: 'g_shotgun', handling: 0.9, demand: 0.9 },
  rifle: { name: 'Rifle', sound: 'shot_rifle', icon: 'g_rifle', handling: 0.8, demand: 1.1 },
  smg: { name: 'SMG', sound: 'shot_smg', icon: 'g_smg', handling: 1.0, demand: 1.0 },
  silent: { name: 'Silent', sound: 'shot_silent', icon: 'g_silent', handling: 0.9, demand: 0.8 },
  heavy: { name: 'Heavy', sound: 'shot_heavy', icon: 'g_heavy', handling: 0.6, demand: 1.2 },
};

export const BLUEPRINTS = [
  { id: 'pipe_pistol', name: 'Pipe Pistol', family: 'sidearm', ammo: 'light', dmg: 12, pellets: 1, rpm: 180, acc: 60, range: 10, mag: 8, noise: 'Med', bench: 1, value: 80, reload: 1.4, hours: 2, rank: 0 },
  { id: 'rebar_revolver', name: 'Rebar Revolver', family: 'sidearm', ammo: 'medium', dmg: 26, pellets: 1, rpm: 120, acc: 72, range: 14, mag: 6, noise: 'High', bench: 1, value: 140, reload: 2.0, hours: 3, rank: 0 },
  { id: 'sawn_off', name: 'Sawn-Off Scatter', family: 'shotgun', ammo: 'shell', dmg: 8, pellets: 8, rpm: 70, acc: 35, range: 6, mag: 2, noise: 'V.High', bench: 1, value: 120, reload: 1.8, hours: 3, rank: 0 },
  { id: 'rustlers_lever', name: "Rustler's Lever", family: 'rifle', ammo: 'medium', dmg: 34, pellets: 1, rpm: 75, acc: 82, range: 22, mag: 8, noise: 'High', bench: 2, value: 260, reload: 2.6, hours: 4, rank: 1 },
  { id: 'rattler', name: 'Rattler SMG', family: 'smg', ammo: 'light', dmg: 9, pellets: 1, rpm: 600, acc: 45, range: 9, mag: 30, noise: 'High', bench: 2, value: 300, reload: 2.0, hours: 4, rank: 1 },
  { id: 'pump_gutter', name: 'Pump Gutter', family: 'shotgun', ammo: 'shell', dmg: 7, pellets: 9, rpm: 60, acc: 45, range: 8, mag: 6, noise: 'V.High', bench: 2, value: 280, reload: 3.0, hours: 4, rank: 1 },
  { id: 'whisper', name: 'Whisper Crossbow', family: 'silent', ammo: 'bolt', dmg: 40, pellets: 1, rpm: 50, acc: 85, range: 20, mag: 1, noise: 'None', bench: 2, value: 320, reload: 1.6, hours: 4, rank: 1 },
  { id: 'needle', name: "Marksman's Needle", family: 'rifle', ammo: 'heavy', dmg: 70, pellets: 1, rpm: 40, acc: 95, range: 34, mag: 5, noise: 'V.High', bench: 3, value: 650, reload: 3.0, hours: 6, rank: 2 },
  { id: 'ironclad', name: 'Ironclad Carbine', family: 'rifle', ammo: 'medium', dmg: 22, pellets: 1, rpm: 360, acc: 70, range: 17, mag: 25, noise: 'High', bench: 3, value: 600, reload: 2.4, hours: 6, rank: 2 },
  { id: 'quiet_hand', name: 'Quiet Hand', family: 'smg', ammo: 'light', dmg: 11, pellets: 1, rpm: 420, acc: 62, range: 11, mag: 20, noise: 'Low', bench: 3, value: 560, reload: 1.9, hours: 6, rank: 2 },
  { id: 'hailstorm', name: 'Hailstorm LMG', family: 'heavy', ammo: 'heavy', dmg: 20, pellets: 1, rpm: 540, acc: 50, range: 20, mag: 80, noise: 'V.High', bench: 4, value: 1200, reload: 4.5, hours: 8, rank: 3 },
  { id: 'warden_breaker', name: 'Warden-Breaker', family: 'heavy', ammo: 'heavy', dmg: 120, pellets: 1, rpm: 25, acc: 90, range: 30, mag: 3, noise: 'Extreme', bench: 4, value: 1500, reload: 4.0, hours: 8, rank: 3 },
];
export const BP = Object.fromEntries(BLUEPRINTS.map((b) => [b.id, b]));

export const MATERIALS = {
  scrap: { name: 'Scrap', mult: 0.8, item: 'scrap', per: 2, bench: 1 },
  iron: { name: 'Iron', mult: 1.0, item: 'iron', per: 1, bench: 1 },
  steel: { name: 'Steel', mult: 1.2, item: 'steel', per: 1, bench: 2 },
  alloy: { name: 'Alloy', mult: 1.4, item: 'alloy', per: 1, bench: 3 },
};
export const MATERIAL_IDS = ['scrap', 'iron', 'steel', 'alloy'];

// Component stats they multiply; recipe in "ingots" of the chosen material plus extras.
export const COMPONENTS = {
  barrel: { name: 'Barrel', stats: ['range', 'acc', 'dmg'], ingots: 2, extra: {}, hours: 1.5, icon: 'c_barrel', desc: 'Range and accuracy' },
  frame: { name: 'Frame', stats: ['dur'], ingots: 3, extra: {}, hours: 2, icon: 'c_frame', desc: 'Durability' },
  action: { name: 'Action', stats: ['rpm', 'rel', 'dmg'], ingots: 2, extra: { spring: 1 }, hours: 2, icon: 'c_action', desc: 'Fire rate and reliability' },
  stock: { name: 'Stock/Grip', stats: ['handling'], ingots: 1, extra: { timber: 2 }, hours: 1.5, icon: 'c_stock', desc: 'Recoil and handling' },
  mag: { name: 'Magazine', stats: ['mag', 'reload'], ingots: 1, extra: { spring: 1 }, hours: 1, icon: 'c_mag', desc: 'Capacity and reload speed' },
};
export const COMP_IDS = Object.keys(COMPONENTS);

export const GRADES = [
  { id: 'junk', name: 'Junk', mult: 0.5, color: 'ink' },
  { id: 'common', name: 'Common', mult: 1.0, color: 'bone' },
  { id: 'fine', name: 'Fine', mult: 1.4, color: 'green' },
  { id: 'masterwork', name: 'Masterwork', mult: 2.0, color: 'sea' },
  { id: 'legendary', name: 'Legendary', mult: 3.2, color: 'gold' },
];

export const MOD_SLOTS = ['muzzle', 'optic', 'under', 'mag', 'stock'];
export const SLOT_NAMES = { muzzle: 'Muzzle', optic: 'Optic', under: 'Underbarrel', mag: 'Mag', stock: 'Stock' };
export const SLOTS_BY_BENCH = [0, 1, 2, 3, 5];

export const MODS = {
  iron_sights: { name: 'Iron Sights', slot: 'optic', fx: { acc: 1.05 }, recipe: { iron: 1 }, bench: 1, desc: '+5% accuracy' },
  scope: { name: 'Scope', slot: 'optic', fx: { acc: 1.2, range: 1.25, handling: 0.9 }, recipe: { steel: 1, polymer: 1 }, bench: 2, desc: '+20% accuracy, +25% range, slower handling' },
  laser: { name: 'Laser Dot', slot: 'under', fx: { acc: 1.12, visible: 1 }, recipe: { polymer: 1, brass: 1 }, bench: 2, desc: '+12% hip accuracy, but guards spot the dot' },
  suppressor: { name: 'Suppressor', slot: 'muzzle', fx: { noise: 0.35, dmg: 0.95 }, recipe: { steel: 2 }, bench: 2, not: ['silent', 'shotgun'], desc: 'Noise radius x0.35, -5% damage' },
  muzzle_brake: { name: 'Muzzle Brake', slot: 'muzzle', fx: { recoil: 0.7, noise: 1.2 }, recipe: { steel: 1 }, bench: 2, not: ['silent'], desc: '-30% recoil, louder' },
  choke: { name: 'Choke', slot: 'muzzle', fx: { spread: 0.65, range: 1.2 }, recipe: { iron: 1 }, bench: 1, only: ['shotgun'], desc: 'Tighter pellet spread, +20% range' },
  flash_hider: { name: 'Flash Hider', slot: 'muzzle', fx: { flash: 0.3, noise: 0.9 }, recipe: { iron: 1, polymer: 1 }, bench: 2, not: ['silent'], desc: 'Hides muzzle flash at night, slightly quieter' },
  bayonet: { name: 'Bayonet Lug', slot: 'muzzle', fx: { melee: 35 }, recipe: { iron: 1 }, bench: 1, desc: 'Melee bash hits for 35' },
  ext_mag: { name: 'Extended Mag', slot: 'mag', fx: { mag: 1.5, reload: 1.1 }, recipe: { iron: 1, spring: 1 }, bench: 1, not: ['silent'], desc: '+50% capacity' },
  drum_mag: { name: 'Drum Mag', slot: 'mag', fx: { mag: 2.5, reload: 1.4, handling: 0.85 }, recipe: { steel: 2, spring: 2 }, bench: 3, not: ['silent', 'shotgun'], desc: '+150% capacity, slow reload' },
  foregrip: { name: 'Foregrip', slot: 'under', fx: { recoil: 0.75 }, recipe: { timber: 1, polymer: 1 }, bench: 2, desc: '-25% recoil' },
  recoil_spring: { name: 'Recoil Spring', slot: 'stock', fx: { recoil: 0.8, rpm: 1.05 }, recipe: { spring: 2 }, bench: 2, desc: '-20% recoil, +5% fire rate' },
  polished_action: { name: 'Polished Action', slot: 'stock', fx: { jam: 0.3, rpm: 1.08 }, recipe: { steel: 1, brass: 1 }, bench: 3, desc: 'Jams x0.3, +8% fire rate' },
  stock_wrap: { name: 'Stock Wrap', slot: 'stock', fx: { handling: 1.15, recoil: 0.9 }, recipe: { timber: 1 }, bench: 1, desc: '+15% handling, -10% recoil' },
};

export const AMMO = {
  light: { name: 'Light', per: 12, value: 1.0, recipe: { brass: 1, propellant: 1, scrap: 1 }, icon: 'ammo', tint: 'gold' },
  medium: { name: 'Medium', per: 10, value: 1.6, recipe: { brass: 1, propellant: 1, scrap: 1 }, icon: 'ammo', tint: 'rust' },
  heavy: { name: 'Heavy', per: 8, value: 3.0, recipe: { brass: 2, propellant: 2, scrap: 1 }, icon: 'ammo', tint: 'ink' },
  shell: { name: 'Shell', per: 8, value: 2.0, recipe: { brass: 1, propellant: 1, scrap: 2 }, icon: 'shell', tint: 'heat' },
  bolt: { name: 'Bolt', per: 5, value: 2.5, recipe: { timber: 1, scrap: 1 }, icon: 'arrow', tint: 'wood' },
};
export const AMMO_VARIANTS = {
  std: { name: '', dmg: 1, pierce: 0, burn: 0, extra: {}, press: 1 },
  ap: { name: 'AP', dmg: 1.1, pierce: 0.6, burn: 0, extra: { steel: 1 }, press: 2 },
  inc: { name: 'Incendiary', dmg: 0.9, pierce: 0, burn: 1, extra: { fuel: 1 }, press: 2 },
};

export const THROWABLES = {
  molotov: { name: 'Molotov', recipe: { fuel: 1, scrap: 1 }, price: 30, icon: 'molotov', desc: 'Fire pool: burns for 6 s. Loud-ish.' },
  pipebomb: { name: 'Pipe Bomb', recipe: { iron: 1, propellant: 2 }, price: 60, icon: 'pipebomb', desc: 'Big boom, 2.5-tile radius. Very loud. Blows safes.' },
  caltrops: { name: 'Caltrops', recipe: { scrap: 2 }, price: 20, icon: 'caltrops', desc: 'Slows and hurts anyone crossing. Silent.' },
  smokepot: { name: 'Smoke Pot', recipe: { propellant: 1, polymer: 1 }, price: 25, icon: 'smoke', desc: 'Blocks sight for 10 s. Great for escapes.' },
};
export const GADGETS = {
  lockpick: { name: 'Lockpick Set', recipe: { spring: 1, scrap: 1 }, makes: 3, price: 15, icon: 'lockpick', desc: 'Picks locks and safes. Breaks on a botched pick.' },
  boltcutter: { name: 'Bolt Cutters', recipe: { steel: 2 }, makes: 1, price: 45, icon: 'cutters', desc: 'Cuts padlocks and chain fences instantly. 5 uses.' },
};
