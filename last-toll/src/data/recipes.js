// Hub crafting. Benches level 1-3; recipes unlock at a bench level.

export const BENCHES = [
  { id: 'weapon', name: 'Weapon Bench', blurb: 'Blades, repairs, and the suppressor.', max: 3 },
  { id: 'ammo', name: 'Ammo Press', blurb: 'Reload brass. Powder in, rounds out.', max: 3 },
  { id: 'med', name: 'Infirmary', blurb: 'Bandages, antiseptic, medkits.', max: 3 },
  { id: 'kitchen', name: 'Galley Stove', blurb: 'Hot food keeps your strength up.', max: 2 },
];

export const RECIPES = [
  // Weapon bench
  { id: 'r_shiv', bench: 'weapon', level: 1, out: ['shiv', 1], cost: { scrap: 2, tape: 1 } },
  { id: 'r_crowbar', bench: 'weapon', level: 2, out: ['crowbar', 1], cost: { steel: 2, fasteners: 1 } },
  { id: 'r_machete', bench: 'weapon', level: 2, out: ['machete', 1], cost: { steel: 2, leather: 1, tape: 1 } },
  { id: 'r_suppressor', bench: 'weapon', level: 2, out: ['suppressor', 1], cost: { scrap: 2, glue: 1, cloth: 2, fasteners: 1 } },
  { id: 'r_combat_knife', bench: 'weapon', level: 3, out: ['combat_knife', 1], cost: { steel: 2, leather: 1, glue: 1 } },
  { id: 'r_axe', bench: 'weapon', level: 3, out: ['axe', 1], cost: { steel: 3, leather: 1, fasteners: 2 } },
  { id: 'r_crossbow', bench: 'weapon', level: 3, out: ['crossbow', 1], cost: { steel: 2, fasteners: 3, cloth: 2, glue: 2 } },
  // Ammo press
  { id: 'r_9mm', bench: 'ammo', level: 1, out: ['ammo_9mm', 8], cost: { gunpowder: 1, scrap: 1 } },
  { id: 'r_bolt', bench: 'ammo', level: 1, out: ['bolt', 3], cost: { scrap: 1, fasteners: 1, cloth: 1 } },
  { id: 'r_powder', bench: 'ammo', level: 2, out: ['gunpowder', 2], cost: { chemicals: 3 } },
  { id: 'r_38', bench: 'ammo', level: 2, out: ['ammo_38', 6], cost: { gunpowder: 1, scrap: 1, fasteners: 1 } },
  { id: 'r_12g', bench: 'ammo', level: 2, out: ['ammo_12g', 4], cost: { gunpowder: 2, cloth: 1, scrap: 1 } },
  { id: 'r_308', bench: 'ammo', level: 3, out: ['ammo_308', 5], cost: { gunpowder: 2, steel: 1, scrap: 1 } },
  // Infirmary
  { id: 'r_bandage', bench: 'med', level: 1, out: ['bandage', 2], cost: { cloth: 3 } },
  { id: 'r_antiseptic', bench: 'med', level: 1, out: ['antiseptic', 1], cost: { chemicals: 2 } },
  { id: 'r_medkit', bench: 'med', level: 2, out: ['medkit', 1], cost: { bandage: 2, antiseptic: 1, tape: 1 } },
  { id: 'r_pills', bench: 'med', level: 2, out: ['pills', 2], cost: { chemicals: 2, glue: 1 } },
  { id: 'r_adrenaline', bench: 'med', level: 3, out: ['adrenaline', 1], cost: { chemicals: 3, pills: 1 } },
  // Galley
  { id: 'r_beansrice', bench: 'kitchen', level: 1, out: ['beansrice', 1], cost: { beans: 1, rice: 1 } },
  { id: 'r_gumbo', bench: 'kitchen', level: 2, out: ['gumbo', 1], cost: { beans: 2, rice: 1, crackers: 1 } },
];

export const BENCH_UPGRADES = {
  weapon: [null, null, { scrap: 4, fasteners: 3, tape: 2 }, { steel: 3, electronics: 2, fasteners: 4, glue: 2 }],
  ammo: [null, null, { scrap: 4, fasteners: 3, gunpowder: 1 }, { steel: 3, electronics: 2, fasteners: 4 }],
  med: [null, null, { scrap: 3, cloth: 4, glue: 1 }, { chemicals: 3, electronics: 2, glue: 2 }],
  kitchen: [null, null, { scrap: 4, fasteners: 2, glue: 2 }],
};

export const PACK_UPGRADES = [
  { cost: { cloth: 4, leather: 2, fasteners: 2 } },
  { cost: { cloth: 6, leather: 3, tape: 2 } },
  { cost: { cloth: 8, leather: 4, steel: 1 } },
];

export const PACK_BASE = 10;
export const PACK_STEP = 2;

// Repair costs by weapon family.
export function repairCost(d) {
  if (d.kind === 'gun') return { fasteners: 2, glue: 1, scrap: 1 };
  if (d.type === 'stab' || d.type === 'chop') return { scrap: 1, tape: 1 };
  return { scrap: 1, tape: 1 };
}
