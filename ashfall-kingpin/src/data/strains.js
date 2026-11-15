// Six fictional strains. grow = growth units (hours of full light) to harvest; yield = units per plot.
// light: growth rate by day/night outdoors. Indoors under lamps the rate is 1 around the clock.

export const STRAINS = {
  dust_devil: { name: 'Dust Devil', grow: 16, yield: 6, potency: 40, hardiness: 72, smell: 28, day: 1, night: 0.25, tint: 'sand', seedPrice: 6, rank: 0, desc: 'Fast and forgiving. Low yield, low potency.' },
  ashleaf: { name: 'Ashleaf', grow: 22, yield: 8, potency: 56, hardiness: 56, smell: 40, day: 1, night: 0.25, tint: 'olive', seedPrice: 14, rank: 0, desc: 'Balanced all-rounder. The street staple.' },
  rail_rose: { name: 'Rail Rose', grow: 36, yield: 7, potency: 80, hardiness: 40, smell: 55, day: 1, night: 0.25, tint: 'rust', seedPrice: 36, rank: 1, desc: 'High potency, slow, fussy. Premium buyers love it.' },
  glowvine: { name: 'Glowvine', grow: 26, yield: 7, potency: 62, hardiness: 50, smell: 44, day: 0.55, night: 1.7, tint: 'teal', seedPrice: 28, rank: 1, desc: 'Grows best at night. Faint glow, faint smell.' },
  marrow_kush: { name: 'Marrow Kush', grow: 32, yield: 13, potency: 50, hardiness: 62, smell: 72, day: 1, night: 0.25, tint: 'amber', seedPrice: 32, rank: 2, desc: 'Heavy yields, heavy smell. Bulk money.' },
  widows_veil: { name: "Widow's Veil", grow: 44, yield: 10, potency: 96, hardiness: 66, smell: 34, day: 1, night: 0.4, tint: 'gold', seedPrice: 0, rank: 9, legendary: true, desc: 'Legendary. Quest reward only. Sells for silly money.' },
};

export const BASE_STRAINS = Object.keys(STRAINS);

export const QUALITY = [
  { id: 'schwag', name: 'Schwag', mult: 0.6, min: 0 },
  { id: 'mid', name: 'Mid', mult: 1.0, min: 45 },
  { id: 'prime', name: 'Prime', mult: 1.5, min: 70 },
  { id: 'legendary', name: 'Legendary', mult: 2.4, min: 95 },
];

export const PACKS = {
  baggie: { name: 'Baggie', units: 1, base: 12, icon: 'baggie' },
  jar: { name: 'Jar', units: 4, base: 45, icon: 'jar' },
  brick: { name: 'Brick', units: 24, base: 300, icon: 'brick' },
};

export const STAGES = ['Seed', 'Sprout', 'Veg', 'Flower', 'Harvest'];
export const STAGE_AT = [0, 0.06, 0.22, 0.55, 1];

// Hybrid naming parts (deterministic per parent pair).
export const HYBRID_A = ['Dust', 'Ash', 'Rail', 'Glow', 'Marrow', 'Widow', 'Rust', 'Ember', 'Static', 'Dune', 'Cinder', 'Slag'];
export const HYBRID_B = ['Rose', 'Kush', 'Vine', 'Leaf', 'Devil', 'Veil', 'Haze', 'Bloom', 'Crown', 'Thistle', 'Moth', 'Spark'];
export const MUTATIONS = [
  { id: 'vigor', name: 'Vigorous', stat: 'grow', mult: 0.8, desc: 'Grows 20% faster' },
  { id: 'heavy', name: 'Heavy', stat: 'yield', mult: 1.25, desc: '+25% yield' },
  { id: 'potent', name: 'Potent', stat: 'potency', add: 12, desc: '+12 potency' },
  { id: 'hardy', name: 'Hardy', stat: 'hardiness', add: 18, desc: '+18 hardiness' },
  { id: 'odorless', name: 'Odourless', stat: 'smell', mult: 0.5, desc: 'Half the smell (less heat)' },
  { id: 'nocturne', name: 'Nocturne', stat: 'night', add: 0.8, desc: 'Grows strongly at night' },
];
