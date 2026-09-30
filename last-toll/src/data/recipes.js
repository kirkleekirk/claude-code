// Stations aboard the Magnolia. Each crafting station levels 1-3; recipes and
// mods unlock with the station's level. Missing components are broken down out
// of salvage automatically when you craft, the way a good workbench should.

export const STATIONS = {
  workshop: { name: 'Workshop Bench', verb: 'Build', blurb: 'Hand-built weapons, blades and gear.', max: 3 },
  reloading: { name: 'Reloading Bench', verb: 'Load', blurb: 'Powder in, rounds out. Arrows and bolts too.', max: 3 },
  infirmary: { name: 'Infirmary', verb: 'Prepare', blurb: 'Bandages, antiseptic, medkits.', max: 3 },
  galley: { name: 'Galley Stove', verb: 'Cook', blurb: 'Hot food keeps your strength up.', max: 2 },
  gunsmith: { name: 'Weapon Workbench', verb: 'Install', blurb: 'Mods, repairs and upgrades for your guns.', max: 3 },
};

// cat groups recipes in the bench's list.
export const RECIPES = [
  // Workshop
  { id: 'r_shiv', bench: 'workshop', cat: 'Blades', level: 1, out: ['shiv', 1], cost: { scrap: 2, tape: 1 } },
  { id: 'r_pipe', bench: 'workshop', cat: 'Blunt', level: 1, out: ['pipe', 1], cost: { scrap: 3, tape: 1 } },
  { id: 'r_zip', bench: 'workshop', cat: 'Scrap guns', level: 1, out: ['zip_pistol', 1], cost: { scrap: 3, fasteners: 2, tape: 2 } },
  { id: 'r_pipe_shotgun', bench: 'workshop', cat: 'Scrap guns', level: 1, out: ['pipe_shotgun', 1], cost: { scrap: 4, fasteners: 2, tape: 2, glue: 1 } },
  { id: 'r_scrap_bow', bench: 'workshop', cat: 'Bows', level: 1, out: ['scrap_bow', 1], cost: { scrap: 2, cloth: 2, tape: 2, glue: 1 } },
  { id: 'r_crossbow', bench: 'workshop', cat: 'Bows', level: 2, out: ['crossbow', 1], cost: { steel: 2, fasteners: 3, cloth: 2, glue: 2 } },
  { id: 'r_hunting_bow', bench: 'workshop', cat: 'Bows', level: 2, out: ['hunting_bow', 1], cost: { steel: 1, glue: 2, cloth: 2, fasteners: 2, leather: 1 } },
  { id: 'r_crowbar', bench: 'workshop', cat: 'Blunt', level: 2, out: ['crowbar', 1], cost: { steel: 2, fasteners: 1 } },
  { id: 'r_machete', bench: 'workshop', cat: 'Blades', level: 2, out: ['machete', 1], cost: { steel: 2, leather: 1, tape: 1 } },
  { id: 'r_combat_knife', bench: 'workshop', cat: 'Blades', level: 3, out: ['combat_knife', 1], cost: { steel: 2, leather: 1, glue: 1 } },
  { id: 'r_axe', bench: 'workshop', cat: 'Blades', level: 3, out: ['axe', 1], cost: { steel: 3, leather: 1, fasteners: 2 } },
  // Hale's plans, only while the relay at Outpost 9 still stands
  { id: 'r_charge', bench: 'workshop', cat: 'Demolition', level: 1, out: ['demo_charge', 1], cost: { gunpowder: 4, chemicals: 3, electronics: 2, tape: 2, fasteners: 2 }, story: 'mast' },
  // the Covenant job, once Hale has told you about the ship
  { id: 'r_torch', bench: 'workshop', cat: 'The Covenant', level: 1, out: ['cutting_torch', 1], cost: { steel: 2, chemicals: 4, fasteners: 2, electronics: 1, tape: 1 }, heist: true },
  { id: 'r_plate', bench: 'workshop', cat: 'The Covenant', level: 1, out: ['hull_plate', 1], cost: { steel: 3, fasteners: 3, scrap: 2 }, heist: true },
  { id: 'r_heist_charge', bench: 'workshop', cat: 'The Covenant', level: 1, out: ['demo_charge', 1], cost: { gunpowder: 4, chemicals: 3, electronics: 2, tape: 2, fasteners: 2 }, heist: true, notStory: 'mast' },
  // Reloading bench
  { id: 'r_arrow', bench: 'reloading', cat: 'Arrows & bolts', level: 1, out: ['arrow', 4], cost: { scrap: 1, cloth: 1, glue: 1 } },
  { id: 'r_bolt', bench: 'reloading', cat: 'Arrows & bolts', level: 1, out: ['bolt', 3], cost: { scrap: 1, fasteners: 1, cloth: 1 } },
  { id: 'r_38', bench: 'reloading', cat: 'Handgun', level: 1, out: ['ammo_38', 6], cost: { gunpowder: 1, scrap: 1, fasteners: 1 } },
  { id: 'r_9mm', bench: 'reloading', cat: 'Handgun', level: 1, out: ['ammo_9mm', 8], cost: { gunpowder: 1, scrap: 1 } },
  { id: 'r_12g', bench: 'reloading', cat: 'Shotgun', level: 1, out: ['ammo_12g', 4], cost: { gunpowder: 2, cloth: 1, scrap: 1 } },
  { id: 'r_powder', bench: 'reloading', cat: 'Powder', level: 2, out: ['gunpowder', 2], cost: { chemicals: 3 } },
  { id: 'r_45', bench: 'reloading', cat: 'Handgun', level: 2, out: ['ammo_45', 6], cost: { gunpowder: 1, scrap: 1, fasteners: 1 } },
  { id: 'r_308', bench: 'reloading', cat: 'Rifle', level: 2, out: ['ammo_308', 5], cost: { gunpowder: 2, steel: 1, scrap: 1 } },
  { id: 'r_556', bench: 'reloading', cat: 'Rifle', level: 3, out: ['ammo_556', 10], cost: { gunpowder: 2, steel: 1, fasteners: 1 } },
  { id: 'r_ecell', bench: 'reloading', cat: 'Guard tech', level: 3, out: ['ecell', 1], cost: { electronics: 2, chemicals: 1, scrap: 1 } },
  // Infirmary
  { id: 'r_bandage', bench: 'infirmary', cat: 'Dressings', level: 1, out: ['bandage', 2], cost: { cloth: 3 } },
  { id: 'r_antiseptic', bench: 'infirmary', cat: 'Dressings', level: 1, out: ['antiseptic', 1], cost: { chemicals: 2 } },
  { id: 'r_medkit', bench: 'infirmary', cat: 'Kits', level: 2, out: ['medkit', 1], cost: { bandage: 2, antiseptic: 1, tape: 1 } },
  { id: 'r_pills', bench: 'infirmary', cat: 'Drugs', level: 2, out: ['pills', 2], cost: { chemicals: 2, glue: 1 } },
  { id: 'r_adrenaline', bench: 'infirmary', cat: 'Drugs', level: 3, out: ['adrenaline', 1], cost: { chemicals: 3, pills: 1 } },
  { id: 'r_injector', bench: 'infirmary', cat: 'Kits', level: 3, out: ['nano_injector', 1], cost: { medkit: 1, electronics: 1 } },
  // Galley
  { id: 'r_beansrice', bench: 'galley', cat: 'Supper', level: 1, out: ['beansrice', 1], cost: { beans: 1, rice: 1 } },
  { id: 'r_catfish', bench: 'galley', cat: 'Supper', level: 1, out: ['catfish', 1], cost: { jerky: 1, chemicals: 1 } },
  { id: 'r_gumbo', bench: 'galley', cat: 'Supper', level: 2, out: ['gumbo', 1], cost: { beans: 2, rice: 1, crackers: 1 } },
];

export const STATION_UPGRADES = {
  workshop: [null, null, { scrap: 4, fasteners: 3, tape: 2 }, { steel: 3, electronics: 2, fasteners: 4, glue: 2 }],
  reloading: [null, null, { scrap: 4, fasteners: 3, gunpowder: 1 }, { steel: 3, electronics: 2, fasteners: 4 }],
  infirmary: [null, null, { scrap: 3, cloth: 4, glue: 1 }, { chemicals: 3, electronics: 2, glue: 2 }],
  galley: [null, null, { scrap: 4, fasteners: 2, glue: 2 }],
  gunsmith: [null, null, { scrap: 4, fasteners: 3, tape: 2, glue: 1 }, { steel: 3, electronics: 3, fasteners: 4, glue: 2 }],
};

export const PACK_UPGRADES = [
  { cost: { cloth: 4, leather: 2, fasteners: 2 } },
  { cost: { cloth: 6, leather: 3, tape: 2 } },
  { cost: { cloth: 8, leather: 4, steel: 1 } },
];

export const PACK_BASE = 10;
export const PACK_STEP = 2;

// Repair costs by tier.
export function repairCost(d) {
  if (d.kind !== 'gun') return d.tier >= 2 ? { steel: 1, tape: 1 } : { scrap: 1, tape: 1 };
  return [
    { scrap: 1, tape: 1 },
    { scrap: 1, fasteners: 1, glue: 1 },
    { fasteners: 2, glue: 1, scrap: 1 },
    { steel: 1, fasteners: 2, glue: 1 },
    { electronics: 2, glue: 1 },
  ][d.tier ?? 2];
}
