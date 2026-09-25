// Raid destinations. Each zone reuses the city generator with its own lot mix,
// loot tier and walker pressure.

export const ZONES = [
  {
    id: 'cypress',
    name: 'Cypress Row',
    threat: 1,
    blurb: 'Shotgun houses and overgrown yards at the edge of the flood line. Thin walker traffic. Food, cloth, household salvage.',
    focus: 'Food · Cloth · Salvage',
    walkers: 32,
    maxWalkers: 46,
    tollMinutes: 10,
    lootTier: 1,
    riot: 0,
    fresh: 0.05,
    lots: [['house', 9], ['park', 1.2], ['yard', 1], ['shop', 1]],
    palette: { fog: 0x8a8f7a },
  },
  {
    id: 'railyard',
    name: 'Kessler Rail Yard',
    threat: 2,
    blurb: 'Warehouses and freight containers stacked along the spur. Tools, metal, powder. The dead wander between the stacks.',
    focus: 'Metal · Tools · Gunpowder',
    walkers: 46,
    maxWalkers: 64,
    tollMinutes: 9,
    lootTier: 2,
    riot: 0.06,
    fresh: 0.1,
    lots: [['warehouse', 4], ['containers', 3], ['house', 2], ['yard', 1]],
    palette: { fog: 0x7d8580 },
  },
  {
    id: 'quarter',
    name: 'St. Aubin Quarter',
    threat: 3,
    blurb: 'The old quarter under the bell tower. A National Guard checkpoint fell here. Guns, ammunition, medicine, and riot-gear dead.',
    focus: 'Guns · Ammo · Medicine',
    walkers: 62,
    maxWalkers: 86,
    tollMinutes: 8,
    lootTier: 3,
    riot: 0.2,
    fresh: 0.16,
    lots: [['shop', 3], ['clinic', 2], ['house', 2], ['checkpoint', 1.2], ['yard', 0.6]],
    palette: { fog: 0x86807a },
  },
];

export function zoneById(id) {
  return ZONES.find((z) => z.id === id) || ZONES[0];
}
