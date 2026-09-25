// Item catalogue. Every object the player can carry is defined here.
// cat: weapon | ammo | food | med | mat | junk | util
// Weapon stats feed the combat system; see combat/Combat.js for how they are used.

export const MATS = ['cloth', 'scrap', 'tape', 'glue', 'fasteners', 'chemicals', 'electronics', 'gunpowder', 'steel', 'leather'];

const mat = (name, desc) => ({ name, cat: 'mat', stack: 10, desc });
const junk = (name, yields, desc) => ({ name, cat: 'junk', stack: 3, yields, desc });

export const ITEMS = {
  // ---- Materials
  cloth: mat('Cloth', 'Rags and linen. Bandages, backpack straps, shotgun wadding.'),
  scrap: mat('Scrap Metal', 'Bent sheet metal and bolts. The backbone of every recipe.'),
  tape: mat('Duct Tape', 'Holds a shiv together. Holds most things together.'),
  glue: mat('Glue', 'Wood glue and epoxy tubes.'),
  fasteners: mat('Fasteners', 'Screws, nails, rivets.'),
  chemicals: mat('Chemicals', 'Solvents and cleaners. Antiseptic and powder.'),
  electronics: mat('Electronics', 'Circuit boards and wire.'),
  gunpowder: mat('Gunpowder', 'Loose powder for reloading brass.'),
  steel: mat('Steel Stock', 'Good steel. Blades and springs.'),
  leather: mat('Leather', 'Grips, sheaths and straps.'),

  // ---- Junk (scrapped at the Recycler)
  clock: junk('Alarm Clock', { electronics: 1, scrap: 1, fasteners: 1 }, 'Stopped at 7:12.'),
  radio: junk('Transistor Radio', { electronics: 2, fasteners: 1 }, 'Only static now.'),
  whiskey: junk('Whiskey', { chemicals: 2 }, 'Half a bottle. Good for cleaning wounds.'),
  jewelry: junk('Jewelry Box', { fasteners: 2, cloth: 1 }, 'Worthless now, but the hinges are good.'),
  watch: junk('Pocket Watch', { fasteners: 2, scrap: 1 }, 'Engraved: "For W., 1962".'),
  toolkit: junk('Rusty Toolkit', { steel: 1, scrap: 2, fasteners: 2 }, 'Mostly rust. Some of it is steel.'),
  lighter: junk('Lighter', { chemicals: 1 }, 'Still has some fluid.'),
  cutlery: junk('Cutlery', { steel: 1, scrap: 1 }, 'Good forks.'),
  belt: junk('Leather Belt', { leather: 2 }, 'Worn thin at the buckle.'),
  fertilizer: junk('Fertilizer', { chemicals: 2, gunpowder: 1 }, 'Ammonium nitrate, damp.'),
  fireworks: junk('Fireworks', { gunpowder: 2 }, 'Left over from a Fourth nobody got to have.'),
  phone: junk('Dead Phone', { electronics: 1, chemicals: 1 }, '47 missed calls.'),
  blanket: junk('Wool Blanket', { cloth: 3 }, 'Smells like mildew.'),

  // ---- Food
  beans: { name: 'Canned Beans', cat: 'food', stack: 4, nourish: 20, heal: 5, desc: 'Cold is fine.' },
  crackers: { name: 'Saltines', cat: 'food', stack: 4, nourish: 12, heal: 2, desc: 'Stale, but sealed.' },
  jerky: { name: 'Jerky', cat: 'food', stack: 4, nourish: 18, heal: 4, desc: 'Gator, maybe.' },
  soda: { name: 'Soda', cat: 'food', stack: 4, nourish: 8, stamina: 40, desc: 'Warm and flat. Sugar keeps you swinging.' },
  mre: { name: 'MRE', cat: 'food', stack: 2, nourish: 40, heal: 10, desc: 'Meal, Ready-to-Eat. Chili mac.' },
  rice: { name: 'Bag of Rice', cat: 'food', stack: 3, nourish: 0, desc: 'Needs cooking. Pairs with beans.', raw: true },
  beansrice: { name: 'Red Beans & Rice', cat: 'food', stack: 2, nourish: 50, heal: 15, desc: 'Monday supper, any day now.' },
  gumbo: { name: 'Gumbo', cat: 'food', stack: 2, nourish: 75, heal: 30, desc: 'Dark roux, whatever else was on hand.' },

  // ---- Medicine
  bandage: { name: 'Bandage', cat: 'med', stack: 4, heal: 25, useTime: 1.4, desc: 'Wrap it tight. Restores 25 health.' },
  antiseptic: { name: 'Antiseptic', cat: 'med', stack: 3, heal: 10, useTime: 0.8, desc: 'Burns. Restores 10 health.' },
  pills: { name: 'Painkillers', cat: 'med', stack: 4, heal: 10, useTime: 0.6, regenBoost: 60, desc: 'Doubles stamina recovery for a minute.' },
  medkit: { name: 'Medkit', cat: 'med', stack: 2, heal: 65, useTime: 2.4, desc: 'Sutures and gauze. Restores 65 health.' },
  adrenaline: { name: 'Adrenaline', cat: 'med', stack: 2, heal: 0, useTime: 0.5, adrenaline: 30, desc: 'Full stamina, no drain for 30 seconds.' },

  // ---- Ammo
  ammo_9mm: { name: '9mm Rounds', cat: 'ammo', stack: 36, desc: 'For the pistol.' },
  ammo_38: { name: '.38 Special', cat: 'ammo', stack: 24, desc: 'For the revolver.' },
  ammo_12g: { name: '12 Gauge Shells', cat: 'ammo', stack: 16, desc: 'For the pump shotgun.' },
  ammo_308: { name: '.308 Rounds', cat: 'ammo', stack: 15, desc: 'For the bolt-action rifle.' },
  bolt: { name: 'Crossbow Bolts', cat: 'ammo', stack: 10, desc: 'Silent. Pull them back out of the dead.' },

  // ---- Utility
  battery: { name: 'Battery', cat: 'util', stack: 5, desc: 'Refills your flashlight.' },
  suppressor: { name: 'Suppressor', cat: 'util', stack: 1, desc: 'Screw onto a pistol. Quiet for about 40 shots.' },

  // ---- Melee weapons
  // type: stab | blunt | chop. pierce: skull penetration for stabs. head: skull damage for blunt/chop.
  // stick: chance the blade lodges in a skull on a kill. sever: power needed to take a head or leg.
  screwdriver: { name: 'Screwdriver', cat: 'weapon', slot: 'knife', kind: 'melee', type: 'stab', pierce: 0.8, head: 0, body: 8, reach: 1.25, speed: 0.85, stamina: 7, dur: 30, stick: 0.45, knock: 0.25, desc: 'Every survivor starts with one. Drive it through the temple.' },
  kitchen_knife: { name: 'Kitchen Knife', cat: 'weapon', slot: 'knife', kind: 'melee', type: 'stab', pierce: 0.72, head: 0, body: 10, reach: 1.3, speed: 0.8, stamina: 7, dur: 22, stick: 0.35, knock: 0.2, desc: 'Thin blade. Snaps if you lean on it.' },
  shiv: { name: 'Shiv', cat: 'weapon', slot: 'knife', kind: 'melee', type: 'stab', pierce: 0.78, head: 0, body: 9, reach: 1.25, speed: 0.8, stamina: 7, dur: 26, stick: 0.4, knock: 0.2, desc: 'Sharpened scrap and tape.' },
  combat_knife: { name: 'Combat Knife', cat: 'weapon', slot: 'knife', kind: 'melee', type: 'stab', pierce: 1.0, head: 0, body: 14, reach: 1.35, speed: 0.75, stamina: 6, dur: 70, stick: 0.25, knock: 0.25, desc: 'Full tang. Goes in and comes out.' },
  hammer: { name: 'Claw Hammer', cat: 'weapon', slot: 'melee', kind: 'melee', type: 'blunt', pierce: 0, head: 58, body: 14, reach: 1.45, speed: 1.0, stamina: 11, dur: 45, stick: 0, knock: 0.6, desc: 'Two good swings to the skull. One if you mean it.' },
  pipe: { name: 'Lead Pipe', cat: 'weapon', slot: 'melee', kind: 'melee', type: 'blunt', pierce: 0, head: 44, body: 16, reach: 1.6, speed: 1.05, stamina: 12, dur: 60, stick: 0, knock: 0.75, desc: 'Heavy and honest.' },
  bat: { name: 'Baseball Bat', cat: 'weapon', slot: 'melee', kind: 'melee', type: 'blunt', pierce: 0, head: 50, body: 20, reach: 1.8, speed: 1.15, stamina: 14, dur: 40, stick: 0, knock: 1.0, desc: 'Long reach. Knocks them flat.' },
  crowbar: { name: 'Crowbar', cat: 'weapon', slot: 'melee', kind: 'melee', type: 'blunt', pierce: 0, head: 54, body: 16, reach: 1.65, speed: 1.1, stamina: 13, dur: 90, stick: 0, knock: 0.7, desc: 'Nearly indestructible.' },
  machete: { name: 'Machete', cat: 'weapon', slot: 'melee', kind: 'melee', type: 'chop', pierce: 0, head: 70, body: 22, reach: 1.7, speed: 0.95, stamina: 12, dur: 55, stick: 0.2, knock: 0.45, sever: 0.8, desc: 'Takes heads when you commit to the swing.' },
  axe: { name: 'Fire Axe', cat: 'weapon', slot: 'melee', kind: 'melee', type: 'chop', pierce: 0, head: 110, body: 30, reach: 1.85, speed: 1.35, stamina: 19, dur: 70, stick: 0.3, knock: 0.9, sever: 0.65, heavy: true, desc: 'Slow, brutal. Splits riot helmets.' },

  // ---- Firearms
  // action: mag | cyl | pump | bolt | xbow. noise: radius in meters that walkers hear.
  pistol: { name: 'M9 Pistol', cat: 'weapon', slot: 'sidearm', kind: 'gun', action: 'mag', ammo: 'ammo_9mm', cap: 12, headDmg: 100, bodyDmg: 22, legDmg: 30, pellets: 1, spreadHip: 2.6, spreadAds: 0.55, recoil: 1.8, rate: 0.16, noise: 48, dur: 160, desc: 'Semi-auto, 12 round magazine. Accepts a suppressor.' },
  revolver: { name: '.38 Revolver', cat: 'weapon', slot: 'sidearm', kind: 'gun', action: 'cyl', ammo: 'ammo_38', cap: 6, headDmg: 160, bodyDmg: 35, legDmg: 45, pellets: 1, spreadHip: 2.2, spreadAds: 0.4, recoil: 3.4, rate: 0.35, noise: 55, dur: 220, desc: 'Six shots. Load them one at a time.' },
  shotgun: { name: 'Pump Shotgun', cat: 'weapon', slot: 'long', kind: 'gun', action: 'pump', ammo: 'ammo_12g', cap: 5, headDmg: 42, bodyDmg: 16, legDmg: 22, pellets: 9, pelletSpread: 3.8, spreadHip: 2.0, spreadAds: 0.6, recoil: 6.5, rate: 0.3, noise: 64, dur: 120, twoHanded: true, desc: 'Nine pellets. Pump after every shot.' },
  rifle: { name: 'Hunting Rifle', cat: 'weapon', slot: 'long', kind: 'gun', action: 'bolt', ammo: 'ammo_308', cap: 5, headDmg: 400, bodyDmg: 60, legDmg: 100, pellets: 1, spreadHip: 4.5, spreadAds: 0.06, recoil: 5.5, rate: 0.5, noise: 85, dur: 140, zoom: 30, penetrate: 2, armorPierce: true, twoHanded: true, desc: 'Bolt action with a 4x scope. Punches through two skulls.' },
  crossbow: { name: 'Crossbow', cat: 'weapon', slot: 'long', kind: 'gun', action: 'xbow', ammo: 'bolt', cap: 1, headDmg: 400, bodyDmg: 45, legDmg: 60, pellets: 1, spreadHip: 2.8, spreadAds: 0.15, recoil: 1.2, rate: 0.4, noise: 3, dur: 160, armorPierce: true, twoHanded: true, retrievable: true, desc: 'Nearly silent. Recover your bolts from the bodies.' },
};

export const SLOT_NAMES = { knife: 'Sheath', melee: 'Hip', sidearm: 'Holster', long: 'Shoulder' };
export const SLOT_ORDER = ['knife', 'melee', 'sidearm', 'long'];

export const CAT_LABEL = {
  weapon: 'Weapon', ammo: 'Ammo', food: 'Food', med: 'Medicine', mat: 'Material', junk: 'Salvage', util: 'Utility',
};

export function def(id) {
  const d = ITEMS[id];
  if (!d) throw new Error(`Unknown item: ${id}`);
  return d;
}

// Create an item instance. Weapons carry durability and, for guns, loaded state.
export function makeItem(id, qty = 1, opts = {}) {
  const d = def(id);
  const it = { id, qty: Math.min(qty, d.stack || 1) };
  if (d.cat === 'weapon') {
    it.qty = 1;
    it.dur = opts.dur ?? d.dur;
    if (d.kind === 'gun') {
      const loaded = opts.loaded ?? 0;
      it.gun = {
        loaded,
        chamber: d.action === 'mag' || d.action === 'pump' || d.action === 'bolt' ? (opts.chambered ? 'live' : 'empty') : 'none',
        magIn: true,
        open: false,
        spent: 0,
      };
      if (opts.sup) it.sup = opts.sup;
    }
  }
  if (id === 'suppressor') it.dur = opts.dur ?? 40;
  return it;
}

export function itemLabel(it) {
  const d = def(it.id);
  return d.name;
}

export function isStackable(id) {
  return (def(id).stack || 1) > 1;
}
