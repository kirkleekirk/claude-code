// Weapon mods for the gunsmith bench.
//
// Every gun has a family and a list of mod slots (see data/items.js). A mod fits a
// slot for one or more families, or only specific guns. Its effect is a set of stat
// changes applied on top of the gun's base stats:
//   mul: multiply a stat    set: replace a stat    add: add to a stat
//
// Quality follows the gun's tier. Scrap-built guns get shoddy mods with real
// drawbacks, but also the wild, expensive specials (fire, armour-piercing,
// explosives). Military guns get clean, dependable attachments.

export const SLOT_LABEL = {
  sights: 'Sights', muzzle: 'Muzzle', barrel: 'Barrel', mag: 'Magazine', stock: 'Stock', grip: 'Grip',
  receiver: 'Receiver', special: 'Special', string: 'String', rest: 'Arrow Rest', limbs: 'Limbs',
  emitter: 'Emitter', cell: 'Cell Housing',
};

export const QUALITY = {
  shoddy: { label: 'Shoddy', color: '#b8743e', bench: 1 },
  standard: { label: 'Standard', color: '#c9c2ad', bench: 2 },
  fine: { label: 'Fine', color: '#9fbf6a', bench: 3 },
  special: { label: 'Special', color: '#ff8a3c', bench: 2 },
  exp: { label: 'Experimental', color: '#ff5a3c', bench: 3 },
};

const M = (id, slot, fam, quality, name, fx, cost, desc, look, extra = {}) => ({ id, slot, fam, quality, name, fx, cost, desc, look, ...extra });

export const MODS = [
  // ---- Scrap handguns (zip pistol) and the rusty revolver --------------------------------
  M('notch_sight', 'sights', ['scrap_pistol', 'revolver'], 'shoddy', 'Filed Notch Sight', { mul: { spreadAds: 0.8 } }, { scrap: 1, tape: 1 }, 'A notch filed into a scrap of tin. Better than squinting down the pipe.', 'notch'),
  M('scrap_reflex', 'sights', ['scrap_pistol', 'revolver', 'scrap_long', 'xbow'], 'shoddy', 'Scrap Reflex Sight', { mul: { spreadAds: 0.62, spreadHip: 0.95 }, add: { sightY: 0.02 } }, { scrap: 2, glue: 1, electronics: 1 }, 'A shard of mirror and a dot of nail polish. Mostly lines up.', 'scrap_reflex'),
  M('long_pipe', 'barrel', ['scrap_pistol'], 'shoddy', 'Long Pipe Barrel', { mul: { spreadAds: 0.8, recoil: 0.9, headDmg: 1.1, bodyDmg: 1.1 } }, { scrap: 2, tape: 1 }, 'Another eight inches of pipe. Straighter shots, harder hits.', 'long_pipe'),
  M('bottle_sup', 'barrel', ['scrap_pistol'], 'shoddy', 'Soda-Bottle Suppressor', { set: { noise: 16 }, mul: { spreadHip: 1.15, spreadAds: 1.25, headDmg: 0.9, bodyDmg: 0.9 } }, { scrap: 1, tape: 2, cloth: 1 }, 'A two-liter bottle stuffed with rags. Quiet, but it throws your aim off.', 'bottle'),
  M('six_inch', 'barrel', ['revolver'], 'shoddy', 'Six-Inch Barrel', { mul: { spreadAds: 0.72, headDmg: 1.1, recoil: 0.9 } }, { steel: 1, scrap: 2, fasteners: 1 }, 'A longer barrel pulled off a parts gun. Rust and all.', 'long_barrel'),
  M('tape_grip', 'grip', ['scrap_pistol', 'revolver'], 'shoddy', 'Taped Grip', { mul: { recoil: 0.82 } }, { tape: 2, cloth: 1 }, 'Friction tape, lots of it.', 'tape_grip'),
  M('walnut_grip', 'grip', ['revolver'], 'standard', 'Carved Walnut Grip', { mul: { recoil: 0.72, spreadHip: 0.88 } }, { leather: 1, glue: 1, fasteners: 1 }, 'Hand-carved and oiled. Sits in the palm like it grew there.', 'wood_grip'),
  M('incendiary_cyl', 'special', ['revolver'], 'special', 'Dragon\'s Breath Cylinder', { set: { incendiary: true }, mul: { bodyDmg: 1.1 } }, { chemicals: 6, gunpowder: 4, steel: 2, lighter: 2, fireworks: 1 }, 'Hand-packed magnesium loads. Anything you hit goes up in flames, and the fire jumps to any dead that stumble too close to it.', 'incendiary'),
  M('rebar_dart', 'special', ['scrap_pistol'], 'special', 'Rebar Dart Chamber', { set: { armorPierce: true, penetrate: 3, knockdown: true }, mul: { headDmg: 2, bodyDmg: 2.4 } }, { steel: 4, fasteners: 4, gunpowder: 3, glue: 2 }, 'Fires a sharpened length of rebar instead of a bullet. Pins them to the wall, helmets and all.', 'rebar'),

  // ---- Scrap long guns (pipe shotgun, sawed-off) ----------------------------------------
  M('bead_sight', 'sights', ['scrap_long'], 'shoddy', 'Bent-Nail Bead', { mul: { spreadAds: 0.82, pelletSpread: 0.95 } }, { fasteners: 1, glue: 1 }, 'A nail head epoxied to the barrel.', 'bead'),
  M('taped_choke', 'barrel', ['scrap_long'], 'shoddy', 'Hose-Clamp Choke', { mul: { pelletSpread: 0.7, bodyDmg: 1.05 } }, { scrap: 2, fasteners: 1 }, 'Squeezes the pattern tighter. Mostly.', 'choke'),
  M('pipe_stock', 'stock', ['scrap_long', 'scrap_rifle', 'xbow'], 'shoddy', 'Pipe Stock', { mul: { recoil: 0.72, spreadHip: 0.9 } }, { scrap: 3, tape: 1 }, 'Plumbing, bent to fit a shoulder.', 'pipe_stock'),
  M('rag_stock', 'stock', ['scrap_long', 'scrap_rifle'], 'shoddy', 'Rag-Padded Stock', { mul: { recoil: 0.84 } }, { cloth: 3, tape: 1 }, 'Rags wound around the butt. Your shoulder thanks you.', 'rag_stock'),
  M('rebar_slug', 'special', [], 'special', 'Rebar Slug Loads', { set: { pellets: 1, pelletSpread: 0, penetrate: 4, armorPierce: true, knockdown: true, headDmg: 420, bodyDmg: 95, legDmg: 120 } }, { steel: 4, gunpowder: 4, fasteners: 3, glue: 2 }, 'One fat slug of rebar per shell. It goes through four of them and knocks them all flat.', 'rebar', { only: ['pipe_shotgun'] }),
  M('twin_trigger', 'special', [], 'special', 'Twin Trigger', { set: { dual: true, knockdown: true }, mul: { recoil: 1.35 } }, { steel: 3, fasteners: 4, gunpowder: 2, electronics: 1 }, 'Both barrels at once. Anything in front of you goes down, and probably stays down.', 'twin', { only: ['sawed_off'] }),

  // ---- Scrap rifle (old bolt rifle) -----------------------------------------------------
  M('peep_sight', 'sights', ['scrap_rifle', 'rifle'], 'shoddy', 'Peep Sight', { mul: { spreadAds: 0.72 } }, { scrap: 1, fasteners: 1, glue: 1 }, 'A washer on a post. Your eye centers it on its own.', 'peep'),
  M('pipe_scope', 'sights', ['scrap_rifle'], 'shoddy', 'Pipe Scope (2x)', { set: { scope: true, zoom: 44 }, mul: { spreadAds: 0.55 }, add: { sightY: 0.03 } }, { scrap: 2, glue: 2, electronics: 1, tape: 1 }, 'Two magnifying lenses in a length of conduit. Blurry at the edges.', 'pipe_scope'),
  M('rewrapped_barrel', 'barrel', ['scrap_rifle'], 'shoddy', 'Rewrapped Barrel', { mul: { spreadAds: 0.78, headDmg: 1.05 } }, { steel: 1, tape: 2, scrap: 1 }, 'The barrel, cleaned, straightened and re-bedded with wire.', 'long_barrel'),
  M('oil_filter', 'barrel', ['scrap_rifle'], 'shoddy', 'Oil-Filter Suppressor', { set: { noise: 24 }, mul: { spreadAds: 1.2, headDmg: 0.9 } }, { scrap: 2, fasteners: 2, glue: 1 }, 'An oil filter threaded onto the muzzle. Good for about the life of the gun.', 'oil_filter'),
  M('ap_chamber', 'special', ['scrap_rifle'], 'special', 'Tungsten AP Rechamber', { set: { armorPierce: true, penetrate: 4 }, mul: { headDmg: 1.15, bodyDmg: 1.3 } }, { steel: 5, electronics: 2, gunpowder: 4, fasteners: 4 }, 'Rechambered for hand-turned tungsten cores. Goes through riot helmets, Guard plate, and the three dead lined up behind them.', 'ap'),

  // ---- Bows ---------------------------------------------------------------------------------
  M('pin_sight', 'sights', ['bow'], 'shoddy', 'Pin Sight', { mul: { spreadAds: 0.6 } }, { scrap: 1, fasteners: 1 }, 'Three pins for three distances.', 'pin'),
  M('waxed_string', 'string', ['bow'], 'shoddy', 'Waxed String', { mul: { draw: 0.78 } }, { cloth: 1, candles: 1 }, 'Beeswax on the string. Draws faster and quieter.', 'string'),
  M('cable_string', 'string', ['bow'], 'standard', 'Steel Cable String', { mul: { headDmg: 1.2, bodyDmg: 1.3, draw: 1.15 } }, { steel: 1, fasteners: 2 }, 'Harder to pull. Hits like a truck.', 'cable'),
  M('whisker_rest', 'rest', ['bow'], 'shoddy', 'Whisker Rest', { mul: { spreadHip: 0.7, spreadAds: 0.85 } }, { cloth: 1, glue: 1, scrap: 1 }, 'Holds the arrow steady while you draw.', 'rest'),
  M('fire_arrows', 'special', ['bow'], 'special', 'Pitch-Soaked Arrowheads', { set: { incendiary: true } }, { chemicals: 5, cloth: 4, lighter: 2, candles: 2 }, 'Pitch-soaked rag wound behind the head, lit off the bowstring striker. They burn, and it spreads.', 'fire_arrow'),
  M('broadheads', 'special', [], 'special', 'Heavy Broadheads', { set: { armorPierce: true, knockdown: true }, mul: { bodyDmg: 1.8 } }, { steel: 4, fasteners: 3, glue: 2 }, 'Three-blade steel heads. They punch through helmets and knock the dead off their feet.', 'broadhead', { only: ['hunting_bow'] }),

  // ---- Makeshift crossbow -------------------------------------------------------------------
  M('leaf_limbs', 'limbs', ['xbow'], 'shoddy', 'Truck Leaf-Spring Limbs', { mul: { headDmg: 1.2, bodyDmg: 1.35, reloadMul: 1.25 } }, { steel: 2, fasteners: 2 }, 'Heavier springs. Harder to crank, harder hitting.', 'limbs'),
  M('explosive_bolts', 'special', ['xbow'], 'special', 'Pipe-Bomb Bolt Tips', { set: { explosive: true, retrievable: false } }, { gunpowder: 6, fireworks: 2, fasteners: 4, electronics: 1 }, 'Bolt tips packed with powder and a nail-head striker. Loud. Very loud. Flattens everything around the hit.', 'bomb_tip'),

  // ---- Service pistols (9mm, 1911, M17) -------------------------------------------------
  M('night_sights', 'sights', ['pistol'], 'standard', 'Tritium Night Sights', { mul: { spreadAds: 0.75 } }, { electronics: 1, glue: 1 }, 'Three glowing dots. Line them up in the dark.', 'night_sights'),
  M('pistol_dot', 'sights', ['pistol'], 'fine', 'Pistol Red Dot', { mul: { spreadAds: 0.55, spreadHip: 0.9 }, add: { sightY: 0.022 } }, { electronics: 2, glue: 1, fasteners: 1 }, 'A slide-mounted reflex sight. Fast and precise.', 'mini_dot'),
  M('pistol_sup', 'muzzle', ['pistol'], 'standard', 'Pistol Suppressor', { set: { noise: 12 }, mul: { headDmg: 0.95 } }, { steel: 1, fasteners: 2, cloth: 2, glue: 1 }, 'Brings a gunshot down to a sharp clap. The dead two rooms over won\'t hear it.', 'suppressor', { alt: { suppressor: 1 } }),
  M('compensator', 'muzzle', ['pistol'], 'standard', 'Compensator', { mul: { recoil: 0.6 } }, { steel: 1, fasteners: 1 }, 'Vents the gas upward so the muzzle stays down.', 'comp'),
  M('ext_mag_p', 'mag', ['pistol'], 'standard', 'Extended Magazine', { mul: { cap: 1.6 } }, { steel: 1, fasteners: 2, scrap: 1 }, 'More rounds between reloads.', 'ext_mag'),
  M('rubber_grip', 'grip', ['pistol'], 'standard', 'Rubber Grip Sleeve', { mul: { recoil: 0.85, spreadHip: 0.85 } }, { leather: 1, glue: 1 }, 'Stays put in a sweaty hand.', 'rubber_grip'),

  // ---- Shotguns (pump, combat) --------------------------------------------------------------
  M('ghost_ring', 'sights', ['shotgun'], 'standard', 'Ghost-Ring Sights', { mul: { spreadAds: 0.75, pelletSpread: 0.92 } }, { steel: 1, fasteners: 1 }, 'Big aperture, fast target.', 'peep'),
  M('holo', 'sights', ['shotgun', 'carbine'], 'fine', 'Holographic Sight', { mul: { spreadAds: 0.58, spreadHip: 0.9 }, add: { sightY: 0.03 } }, { electronics: 2, glue: 1, fasteners: 2 }, 'A reticle that floats on the target. Both eyes open.', 'holo'),
  M('full_choke', 'muzzle', ['shotgun'], 'standard', 'Full Choke', { mul: { pelletSpread: 0.62 } }, { steel: 1, fasteners: 1 }, 'Tight patterns at range.', 'choke'),
  M('breacher', 'muzzle', ['shotgun'], 'standard', 'Breacher Brake', { mul: { recoil: 0.72, pelletSpread: 1.12 } }, { steel: 1, fasteners: 2 }, 'Toothed muzzle brake. Cuts the kick, widens the spread.', 'breacher'),
  M('long_barrel_sg', 'barrel', ['shotgun'], 'standard', '28-inch Barrel', { mul: { pelletSpread: 0.8, headDmg: 1.1, bodyDmg: 1.1 } }, { steel: 2, fasteners: 1 }, 'A bird barrel. Tighter, harder, longer.', 'long_barrel'),
  M('recoil_pad', 'stock', ['shotgun'], 'standard', 'Recoil Pad', { mul: { recoil: 0.75 } }, { leather: 1, glue: 1 }, 'Thick rubber on the butt.', 'recoil_pad'),
  M('sg_drum', 'mag', [], 'fine', '12-Round Drum', { set: { cap: 12 }, mul: { reloadMul: 1.3 } }, { steel: 2, fasteners: 3, scrap: 2 }, 'Twelve shells before you reload.', 'drum', { only: ['combat_shotgun'] }),
  M('frag12', 'mag', [], 'special', 'Frag-12 Magazine', { set: { explosive: true, pellets: 1, pelletSpread: 0, headDmg: 180, bodyDmg: 80 } }, { gunpowder: 8, electronics: 2, steel: 2, fireworks: 2 }, 'Fin-stabilised explosive slugs. Every shot is a grenade.', 'frag_mag', { only: ['combat_shotgun'] }),

  // ---- Rifles (hunting, lever, marksman) --------------------------------------------------
  M('scout_scope', 'sights', ['rifle'], 'standard', 'Scout Scope (2.5x)', { set: { scope: true, zoom: 40 }, mul: { spreadAds: 0.5 }, add: { sightY: 0.03 } }, { electronics: 1, glue: 1, steel: 1 }, 'Long eye relief, forward-mounted. Fast for a scope.', 'scout_scope'),
  M('rifle_sup', 'muzzle', ['rifle'], 'fine', 'Rifle Suppressor', { set: { noise: 20 }, mul: { headDmg: 0.95 } }, { steel: 2, fasteners: 2, cloth: 2, glue: 1 }, 'A full-size can. The shot still carries, but not far.', 'suppressor_long'),
  M('muzzle_brake', 'muzzle', ['rifle', 'carbine'], 'standard', 'Muzzle Brake', { mul: { recoil: 0.65 } }, { steel: 1, fasteners: 1 }, 'Kills the climb between shots.', 'brake'),
  M('match_barrel', 'barrel', ['rifle'], 'fine', 'Match Barrel', { mul: { spreadAds: 0.6, headDmg: 1.1, bodyDmg: 1.1 } }, { steel: 2, fasteners: 2, glue: 1 }, 'Free-floated and lapped. Hits where you point it.', 'long_barrel'),
  M('adj_stock', 'stock', ['rifle', 'carbine'], 'standard', 'Adjustable Stock', { mul: { recoil: 0.78, spreadHip: 0.85 } }, { scrap: 2, fasteners: 2, glue: 1 }, 'Sized to you. Steadier from the hip and the shoulder.', 'adj_stock'),
  M('ext_mag_r', 'mag', ['rifle'], 'standard', 'Extended Magazine', { add: { cap: 3 } }, { steel: 1, fasteners: 2 }, 'Three more rounds.', 'ext_mag'),

  // ---- Carbines and SMGs (SMG, AR-15, M4) ---------------------------------------------------
  M('red_dot', 'sights', ['carbine'], 'standard', 'Red Dot Sight', { mul: { spreadAds: 0.62 }, add: { sightY: 0.03 } }, { electronics: 1, glue: 1, fasteners: 1 }, 'A simple reflex sight.', 'red_dot'),
  M('acog', 'sights', ['carbine'], 'fine', '4x Combat Scope', { set: { scope: true, zoom: 34 }, mul: { spreadAds: 0.45 }, add: { sightY: 0.035 } }, { electronics: 2, glue: 1, steel: 1, fasteners: 1 }, 'A rugged 4x prism sight.', 'acog'),
  M('flash_hider', 'muzzle', ['carbine'], 'standard', 'Flash Hider', { mul: { recoil: 0.9, spreadHip: 0.9 } }, { steel: 1 }, 'Less flash, a little less climb.', 'flash'),
  M('carbine_sup', 'muzzle', ['carbine'], 'fine', 'Suppressor', { set: { noise: 16 }, mul: { headDmg: 0.95 } }, { steel: 2, fasteners: 2, cloth: 1, glue: 1 }, 'Turns a rifle crack into a cough.', 'suppressor_long'),
  M('ext_mag_c', 'mag', ['carbine'], 'standard', 'Extended Magazine', { mul: { cap: 1.5 } }, { steel: 1, fasteners: 2, scrap: 1 }, 'Half again as many rounds.', 'ext_mag'),
  M('drum_c', 'mag', ['carbine'], 'fine', 'Drum Magazine', { set: { cap: 60 }, mul: { reloadMul: 1.4 } }, { steel: 2, fasteners: 3, scrap: 2 }, 'Sixty rounds. Slow to swap.', 'drum'),
  M('auto_sear', 'receiver', [], 'fine', 'Drop-In Auto Sear', { set: { auto: true }, mul: { rate: 0.75, spreadHip: 1.1 } }, { steel: 2, electronics: 1, fasteners: 3 }, 'Makes it an M16 in all but name. Full auto.', 'sear', { only: ['ar15'] }),
  M('match_trigger', 'receiver', [], 'standard', 'Match Trigger', { mul: { rate: 0.85, spreadAds: 0.85 } }, { steel: 1, fasteners: 2 }, 'A crisp, light break.', 'trigger', { only: ['ar15'] }),

  // ---- Living Guard tech ---------------------------------------------------------------------
  M('guard_optic', 'sights', ['energy'], 'fine', 'Guard Optic', { mul: { spreadAds: 0.5 }, add: { sightY: 0.025 } }, { electronics: 2, keycard: 1 }, 'A Guard sight with a projected reticle.', 'guard_optic'),
  M('focus_lens', 'emitter', ['energy'], 'exp', 'Focusing Lens', { mul: { headDmg: 1.2, bodyDmg: 1.25, spreadAds: 0.8 } }, { electronics: 3, glue: 1, ecell: 1 }, 'Tightens the beam. Burns hotter.', 'lens'),
  M('split_prism', 'emitter', [], 'exp', 'Split Prism', { set: { pellets: 3, pelletSpread: 1.4 }, mul: { headDmg: 0.8 } }, { electronics: 3, glue: 2, ecell: 1 }, 'Splits every bolt into three.', 'prism', { only: ['photon_pistol'] }),
  M('cap_bank', 'cell', ['energy', 'horn'], 'exp', 'Capacitor Bank', { mul: { cap: 1.5 } }, { electronics: 3, ecell: 1, scrap: 1 }, 'Squeezes half again as many shots from a cell.', 'cap_bank'),
  M('overcharge', 'special', [], 'exp', 'Overcharged Coil', { set: { incendiary: true, penetrate: 4 }, mul: { recoil: 1.2 } }, { electronics: 4, ecell: 2, chemicals: 2, keycard: 1 }, 'Runs the coil past its rating. Every hit sets them burning, and the beam goes through four.', 'overcharge', { only: ['arc_carbine'] }),
  M('thermal_rounds', 'special', [], 'exp', 'Thermal Bolt Driver', { set: { incendiary: true } }, { electronics: 3, ecell: 1, chemicals: 2 }, 'Every bolt leaves them burning.', 'overcharge', { only: ['photon_pistol'] }),
  M('wide_bell', 'emitter', ['horn'], 'exp', 'Wide Bell', { mul: { sonicArc: 0.8, sonicRange: 1.1 } }, { scrap: 3, electronics: 2 }, 'A flared horn. Knocks down a wider fan of them.', 'bell'),
  M('beam_amp', 'emitter', [], 'exp', 'Beam Amplifier', { mul: { headDmg: 1.15, bodyDmg: 1.3 }, set: { penetrate: 9 } }, { electronics: 4, ecell: 1, keycard: 1 }, 'Nothing stops the beam.', 'lens', { only: ['beam_lance'] }),
];

export const MOD_BY_ID = Object.fromEntries(MODS.map((m) => [m.id, m]));

export function modDef(id) {
  return MOD_BY_ID[id] || null;
}

// Mods that fit a slot of this gun.
export function modsFor(gunId, slot, d) {
  return MODS.filter((m) => m.slot === slot && (m.only ? m.only.includes(gunId) : m.fam.includes(d.family)));
}
