// Classes. Every class is built on a points budget: each bonus costs points and each
// drawback refunds points, and the two must cancel out. A big bonus therefore always comes
// with a big drawback. Values are percent changes (e.g. gunDamage: 15 = +15%).
export const STATS = {
  maxHealth: { label: 'Max health', w: 1.0 },
  gunDamage: { label: 'Gun damage', w: 1.2 },
  meleeDamage: { label: 'Melee damage', w: 0.4 },
  reloadSpeed: { label: 'Reload speed', w: 0.5 },
  accuracy: { label: 'Accuracy', w: 0.7 },
  moveSpeed: { label: 'Move speed', w: 2.0 },
  stamina: { label: 'Stamina', w: 0.35 },
  hunger: { label: 'Hunger & thirst drain', w: 0.6, lower: true },
  healPower: { label: 'Healing from meds', w: 0.5 },
  healSpeed: { label: 'Healing speed', w: 0.3 },
  infection: { label: 'Infection resistance', w: 0.3 },
  buildCost: { label: 'Build cost', w: 0.4, lower: true },
  buildSpeed: { label: 'Build & board-up speed', w: 0.25 },
  barricadeHp: { label: 'Barricade strength', w: 0.3 },
  repair: { label: 'Vehicle repair', w: 0.3 },
  fuel: { label: 'Fuel use', w: 0.3, lower: true },
  noise: { label: 'Noise you make', w: 0.6, lower: true },
  search: { label: 'Search speed', w: 0.2 },
  luck: { label: 'Extra loot found', w: 0.6 },
  packSlots: { label: 'Backpack slots', w: 5, unit: 'slot' },
  harvest: { label: 'Materials gathered', w: 0.3 },
};
// Unique abilities have a fixed point cost.
export const SPECIALS = {
  ironStomach: { label: 'Iron stomach: raw food & dirty water are safe', cost: 10 },
  fieldMedic: { label: 'Field medic: bandages slow infection', cost: 6 },
  hotwire: { label: 'Scrap repair: fix vehicles with 20 metal, no kit', cost: 8 },
};

export const CLASSES = [
  { id: 'survivor', name: 'Survivor', icon: '✦', color: '#9bff57', tagline: 'No strengths, no weaknesses. Good for learning.', mods: {}, kit: [['water', 1]] },
  { id: 'mechanic', name: 'Mechanic', icon: '🔧', color: '#f0a020', tagline: 'Keeps engines running and tanks full.', mods: { repair: 100, fuel: -35, gunDamage: -12, healPower: -30, stamina: -30, accuracy: -12 }, specials: ['hotwire'], kit: [['repairkit', 1], ['gascan', 1]] },
  { id: 'medic', name: 'Medic', icon: '✚', color: '#ff6b6b', tagline: 'Patches up fast, fights badly.', mods: { healPower: 40, healSpeed: 40, infection: 45, gunDamage: -25, reloadSpeed: -20, meleeDamage: -25 }, specials: ['fieldMedic'], kit: [['medkit', 1], ['bandage', 3]] },
  { id: 'carpenter', name: 'Carpenter', icon: '🔨', color: '#c08a54', tagline: 'Builds cheap, boards up fast, barricades hold.', mods: { buildCost: -30, buildSpeed: 60, barricadeHp: 60, harvest: 30, gunDamage: -15, accuracy: -20, stamina: -30, reloadSpeed: -20 }, kit: [['wood', 80]] },
  { id: 'soldier', name: 'Soldier', icon: '★', color: '#4fb3ff', tagline: 'Deadly with a gun, but hungry and loud.', mods: { gunDamage: 15, reloadSpeed: 25, accuracy: 20, hunger: 35, noise: 25, healPower: -20 }, kit: [['pistol', 1, 1], ['light', 32]] },
  { id: 'scout', name: 'Scout', icon: '➤', color: '#7af0d0', tagline: 'Fast and quiet, but fragile and travels light.', mods: { moveSpeed: 8, stamina: 50, noise: -25, maxHealth: -25, packSlots: -2, gunDamage: -10 }, kit: [['energy', 1]] },
  { id: 'farmer', name: 'Farmer', icon: '🌾', color: '#e8c840', tagline: 'Rarely hungry, eats anything. Not a fighter.', mods: { hunger: -35, harvest: 30, gunDamage: -15, reloadSpeed: -20, accuracy: -15 }, specials: ['ironStomach'], kit: [['apple', 3], ['campfire', 1]] },
  { id: 'hunter', name: 'Hunter', icon: '🎯', color: '#9ad87a', tagline: 'Steady aim and soft steps. Hurts more when hit.', mods: { accuracy: 30, noise: -20, gunDamage: 5, maxHealth: -15, healPower: -30, meleeDamage: -20 }, kit: [['crossbow', 1, 0], ['bolts', 8]] },
  { id: 'scavenger', name: 'Scavenger', icon: '⌕', color: '#b54ae8', tagline: 'Finds more, carries more, but can\'t take a beating.', mods: { search: 100, luck: 30, packSlots: 2, maxHealth: -20, gunDamage: -10, stamina: -30, meleeDamage: -15 }, kit: [['cloth', 3], ['chips', 1]] },
];
export const CLASS_BY_ID = Object.fromEntries(CLASSES.map((c) => [c.id, c]));

// Points for one class: { buff, nerf, lines: [{label, text, good, pts}] }
export function classBudget(c) {
  let buff = 0, nerf = 0;
  const lines = [];
  for (const [k, v] of Object.entries(c.mods || {})) {
    const st = STATS[k];
    const pts = Math.abs(v) * st.w;
    const good = st.lower ? v < 0 : v > 0;
    if (good) buff += pts; else nerf += pts;
    const text = st.unit ? `${v > 0 ? '+' : ''}${v} ${st.label.toLowerCase()}` : `${v > 0 ? '+' : ''}${v}% ${st.label.toLowerCase()}`;
    lines.push({ label: st.label, text, good, pts });
  }
  for (const s of c.specials || []) { buff += SPECIALS[s].cost; lines.push({ label: SPECIALS[s].label, text: SPECIALS[s].label, good: true, pts: SPECIALS[s].cost, special: true }); }
  lines.sort((a, b) => (b.good - a.good) || (b.pts - a.pts));
  return { buff, nerf, lines };
}

// Multiplier accessor: m('gunDamage') → 1.15 etc. (1 = unchanged)
export function makeMods(c) {
  const mods = {};
  for (const [k, v] of Object.entries((c && c.mods) || {})) mods[k] = k === 'packSlots' ? v : 1 + v / 100;
  const specials = new Set((c && c.specials) || []);
  return { get: (k) => (k === 'packSlots' ? (mods[k] || 0) : (mods[k] ?? 1)), has: (s) => specials.has(s) };
}
