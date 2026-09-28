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
  keycard: { name: 'Guard Keycard', cat: 'junk', stack: 3, keep: true, yields: { electronics: 2 }, desc: 'Opens a Living Guard weapons locker. Or scrap it for the chip.' },
  dogtags: junk('Guard Dog Tags', { steel: 1, fasteners: 1 }, 'LIVING GUARD — 9TH GARRISON. Someone\'s son.'),
  rosary: junk('Rosary', { fasteners: 1, cloth: 1 }, 'Wooden beads worn smooth.'),
  candles: junk('Church Candles', { chemicals: 1, cloth: 1 }, 'Tallow. They burn a long time.'),
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
  tlg_ration: { name: 'Guard Ration', cat: 'food', stack: 3, nourish: 45, heal: 10, desc: 'Grey bar stamped "COMPLETE NUTRITION — PROPERTY OF THE LIVING GUARD".' },
  catfish: { name: 'Smoked Catfish', cat: 'food', stack: 3, nourish: 30, heal: 5, desc: 'Somebody out in the stilts was still eating well.' },

  // ---- Medicine
  bandage: { name: 'Bandage', cat: 'med', stack: 4, heal: 25, useTime: 1.4, desc: 'Wrap it tight. Restores 25 health.' },
  antiseptic: { name: 'Antiseptic', cat: 'med', stack: 3, heal: 10, useTime: 0.8, desc: 'Burns. Restores 10 health.' },
  pills: { name: 'Painkillers', cat: 'med', stack: 4, heal: 10, useTime: 0.6, regenBoost: 60, desc: 'Doubles stamina recovery for a minute.' },
  medkit: { name: 'Medkit', cat: 'med', stack: 2, heal: 65, useTime: 2.4, desc: 'Sutures and gauze. Restores 65 health.' },
  adrenaline: { name: 'Adrenaline', cat: 'med', stack: 2, heal: 0, useTime: 0.5, adrenaline: 30, desc: 'Full stamina, no drain for 30 seconds.' },
  nano_injector: { name: 'Guard Injector', cat: 'med', stack: 2, heal: 50, useTime: 0.5, desc: 'Guard field medicine. Restores 50 health in seconds.' },

  // ---- Ammo
  arrow: { name: 'Arrows', cat: 'ammo', stack: 12, desc: 'Fletched shafts. Silent, and they come back out of the dead.' },
  bolt: { name: 'Crossbow Bolts', cat: 'ammo', stack: 10, desc: 'Silent. Pull them back out of the dead.' },
  ammo_38: { name: '.38 Special', cat: 'ammo', stack: 24, desc: 'Revolvers, zip guns and the lever carbine.' },
  ammo_9mm: { name: '9mm Rounds', cat: 'ammo', stack: 36, desc: 'Service pistols and submachine guns.' },
  ammo_45: { name: '.45 ACP', cat: 'ammo', stack: 21, desc: 'Fat, slow and final. For the 1911.' },
  ammo_12g: { name: '12 Gauge Shells', cat: 'ammo', stack: 16, desc: 'Every shotgun from the pipe gun up.' },
  ammo_556: { name: '5.56 Rounds', cat: 'ammo', stack: 30, desc: 'Military rifle rounds. AR-15 and M4.' },
  ammo_308: { name: '.308 Rounds', cat: 'ammo', stack: 15, desc: 'Big rifle rounds. Bolt guns and the marksman rifle.' },
  ecell: { name: 'Energy Cell', cat: 'ammo', stack: 6, desc: 'Guard power cell. One cell charges a laser weapon; an ejected cell is spent.' },

  // ---- Story: things people aboard the Magnolia asked you to find
  codebook: { name: 'Guard Codebook', cat: 'story', stack: 1, desc: 'LIVING GUARD — 9TH GARRISON — SIGNALS. Frequencies, call signs, and the tables Command uses to know a voice is really the Guard. Hale wants it.' },
  ledger: { name: 'Chapel Ledger', cat: 'story', stack: 1, desc: 'Father Anselme\'s parish book from Marais Noir: births, burials, who owes who for bait. The last pages are in a hurried hand. For Odile.' },
  demo_charge: { name: 'Demolition Charge', cat: 'story', stack: 1, desc: 'Powder and fertilizer packed in a coffee can, a kitchen timer wired to a blasting cap. Hale\'s design. Plant it on the relay mast at Outpost 9.' },

  // ---- Utility
  battery: { name: 'Battery', cat: 'util', stack: 5, desc: 'Refills your flashlight.' },
  suppressor: { name: 'Loose Suppressor', cat: 'junk', stack: 1, yields: { steel: 1, fasteners: 2 }, desc: 'A pistol can. The gunsmith bench can fit it as a mod for free.' },

  // ---- Melee weapons
  // type: stab | blunt | chop. pierce: skull penetration for stabs. head: skull damage for blunt/chop.
  // stick: chance the blade lodges in a skull on a kill. sever: power needed to take a head or leg.
  // tier: 0 scrap-built · 1 worn · 2 commercial · 3 military · 4 experimental
  screwdriver: { name: 'Screwdriver', tier: 0, cat: 'weapon', slot: 'knife', kind: 'melee', type: 'stab', pierce: 0.8, head: 0, body: 8, reach: 1.25, speed: 0.85, stamina: 7, dur: 30, stick: 0.45, knock: 0.25, desc: 'Every survivor starts with one. Drive it through the temple.' },
  kitchen_knife: { name: 'Kitchen Knife', tier: 0, cat: 'weapon', slot: 'knife', kind: 'melee', type: 'stab', pierce: 0.72, head: 0, body: 10, reach: 1.3, speed: 0.8, stamina: 7, dur: 22, stick: 0.35, knock: 0.2, desc: 'Thin blade. Snaps if you lean on it.' },
  shiv: { name: 'Shiv', tier: 0, cat: 'weapon', slot: 'knife', kind: 'melee', type: 'stab', pierce: 0.78, head: 0, body: 9, reach: 1.25, speed: 0.8, stamina: 7, dur: 26, stick: 0.4, knock: 0.2, desc: 'Sharpened scrap and tape.' },
  pipe: { name: 'Lead Pipe', tier: 0, cat: 'weapon', slot: 'melee', kind: 'melee', type: 'blunt', pierce: 0, head: 44, body: 16, reach: 1.6, speed: 1.05, stamina: 12, dur: 60, stick: 0, knock: 0.75, desc: 'Heavy and honest.' },
  bat: { name: 'Nail Bat', tier: 0, cat: 'weapon', slot: 'melee', kind: 'melee', type: 'blunt', pierce: 0, head: 50, body: 20, reach: 1.8, speed: 1.15, stamina: 14, dur: 40, stick: 0, knock: 1.0, desc: 'Long reach. Knocks them flat.' },
  hammer: { name: 'Claw Hammer', tier: 1, cat: 'weapon', slot: 'melee', kind: 'melee', type: 'blunt', pierce: 0, head: 58, body: 14, reach: 1.45, speed: 1.0, stamina: 11, dur: 45, stick: 0, knock: 0.6, desc: 'Two good swings to the skull. One if you mean it.' },
  crowbar: { name: 'Crowbar', tier: 1, cat: 'weapon', slot: 'melee', kind: 'melee', type: 'blunt', pierce: 0, head: 54, body: 16, reach: 1.65, speed: 1.1, stamina: 13, dur: 90, stick: 0, knock: 0.7, desc: 'Nearly indestructible.' },
  machete: { name: 'Machete', tier: 1, cat: 'weapon', slot: 'melee', kind: 'melee', type: 'chop', pierce: 0, head: 70, body: 22, reach: 1.7, speed: 0.95, stamina: 12, dur: 55, stick: 0.2, knock: 0.45, sever: 0.8, desc: 'Takes heads when you commit to the swing.' },
  combat_knife: { name: 'Combat Knife', tier: 2, cat: 'weapon', slot: 'knife', kind: 'melee', type: 'stab', pierce: 1.0, head: 0, body: 14, reach: 1.35, speed: 0.75, stamina: 6, dur: 70, stick: 0.25, knock: 0.25, desc: 'Full tang. Goes in and comes out.' },
  axe: { name: 'Fire Axe', tier: 2, cat: 'weapon', slot: 'melee', kind: 'melee', type: 'chop', pierce: 0, head: 110, body: 30, reach: 1.85, speed: 1.35, stamina: 19, dur: 70, stick: 0.3, knock: 0.9, sever: 0.65, heavy: true, desc: 'Slow, brutal. Splits riot helmets.' },
  tomahawk: { name: 'Tactical Tomahawk', tier: 3, cat: 'weapon', slot: 'melee', kind: 'melee', type: 'chop', pierce: 0, head: 95, body: 26, reach: 1.6, speed: 0.85, stamina: 11, dur: 110, stick: 0.15, knock: 0.6, sever: 0.75, heavy: true, desc: 'Military issue. Fast as a hatchet, splits helmets like an axe.' },
  shock_baton: { name: 'Shock Baton', tier: 4, cat: 'weapon', slot: 'melee', kind: 'melee', type: 'blunt', pierce: 0, head: 34, body: 14, reach: 1.5, speed: 0.9, stamina: 9, dur: 80, stick: 0, knock: 1.35, shock: true, desc: 'Guard issue. A crack of current drops the dead where they stand.' },
  thermal_knife: { name: 'Guard Thermal Knife', tier: 4, cat: 'weapon', slot: 'knife', kind: 'melee', type: 'stab', pierce: 1.15, head: 0, body: 18, reach: 1.35, speed: 0.72, stamina: 6, dur: 90, stick: 0, knock: 0.3, incendiary: true, desc: 'The edge glows cherry red. Never sticks, and whatever it cuts catches fire.' },

  // ---- Firearms
  // action: mag | cyl | break | pump | bolt | xbow | bow. noise: radius in meters that walkers hear.
  // family: which workbench mods fit. mods: the slots this gun has at the gunsmith bench.
  // hold: 'pistol' (one hand) or 'long' (two hands) for the first-person pose.

  // Tier 0: scrap-built. Crude, loud, cheap to make, and home to the wildest mods.
  zip_pistol: { name: 'Zip Pistol', tier: 0, family: 'scrap_pistol', mods: ['sights', 'barrel', 'grip', 'special'], cat: 'weapon', slot: 'sidearm', kind: 'gun', action: 'break', ammo: 'ammo_38', cap: 1, headDmg: 130, bodyDmg: 28, legDmg: 36, pellets: 1, spreadHip: 3.4, spreadAds: 1.1, recoil: 3.8, rate: 0.4, noise: 50, dur: 60, desc: 'A length of pipe, a spring and a nail for a firing pin. One shot, then break it open and feed it another.' },
  pipe_shotgun: { name: 'Pipe Shotgun', tier: 0, family: 'scrap_long', mods: ['sights', 'barrel', 'stock', 'special'], cat: 'weapon', slot: 'long', kind: 'gun', action: 'break', ammo: 'ammo_12g', cap: 1, headDmg: 40, bodyDmg: 15, legDmg: 20, pellets: 8, pelletSpread: 5.2, spreadHip: 2.4, spreadAds: 1.0, recoil: 8, rate: 0.4, noise: 66, dur: 50, twoHanded: true, desc: 'Water pipe and a slam-fire cap. Holds one shell and kicks like a mule.' },
  scrap_bow: { name: 'Scrap Bow', tier: 0, family: 'bow', mods: ['sights', 'string', 'rest', 'special'], cat: 'weapon', slot: 'long', kind: 'gun', action: 'bow', ammo: 'arrow', cap: 1, draw: 0.85, headDmg: 320, bodyDmg: 40, legDmg: 50, pellets: 1, spreadHip: 2.6, spreadAds: 0.5, recoil: 0.6, rate: 0.3, noise: 3, dur: 90, twoHanded: true, retrievable: true, desc: 'PVC limbs and paracord. Hold to draw, release to loose. Silent.' },
  crossbow: { name: 'Makeshift Crossbow', tier: 0, family: 'xbow', mods: ['sights', 'limbs', 'stock', 'special'], cat: 'weapon', slot: 'long', kind: 'gun', action: 'xbow', ammo: 'bolt', cap: 1, headDmg: 400, bodyDmg: 45, legDmg: 60, pellets: 1, spreadHip: 2.8, spreadAds: 0.15, recoil: 1.2, rate: 0.4, noise: 3, dur: 160, armorPierce: true, twoHanded: true, retrievable: true, desc: 'Leaf springs on a two-by-four. Nearly silent. Recover your bolts from the bodies.' },

  // Tier 1: good handmade guns and worn-out commercial ones.
  revolver: { name: 'Rusty .38 Revolver', tier: 1, family: 'revolver', mods: ['sights', 'barrel', 'grip', 'special'], cat: 'weapon', slot: 'sidearm', kind: 'gun', action: 'cyl', ammo: 'ammo_38', cap: 6, headDmg: 160, bodyDmg: 35, legDmg: 45, pellets: 1, spreadHip: 2.2, spreadAds: 0.45, recoil: 3.4, rate: 0.35, noise: 55, dur: 160, desc: 'Six shots, pitted steel. Load them one at a time.' },
  sawed_off: { name: 'Sawed-Off Double', tier: 1, family: 'scrap_long', mods: ['sights', 'barrel', 'stock', 'special'], hold: 'long', cat: 'weapon', slot: 'sidearm', kind: 'gun', action: 'break', ammo: 'ammo_12g', cap: 2, headDmg: 44, bodyDmg: 16, legDmg: 22, pellets: 9, pelletSpread: 5.5, spreadHip: 2.2, spreadAds: 1.2, recoil: 7.5, rate: 0.22, noise: 68, dur: 110, twoHanded: true, desc: 'Two barrels, cut short enough to holster. Break it, drop the hulls, feed it two.' },
  old_rifle: { name: 'Rusted Bolt Rifle', tier: 1, family: 'scrap_rifle', mods: ['sights', 'barrel', 'stock', 'special'], cat: 'weapon', slot: 'long', kind: 'gun', action: 'bolt', ammo: 'ammo_308', cap: 3, headDmg: 360, bodyDmg: 55, legDmg: 90, pellets: 1, spreadHip: 4.8, spreadAds: 0.28, recoil: 6, rate: 0.6, noise: 85, dur: 90, twoHanded: true, desc: 'Somebody\'s granddad\'s deer rifle. Iron sights and a sticky bolt. Riot helmets stop it.' },
  hunting_bow: { name: 'Hunting Bow', tier: 1, family: 'bow', mods: ['sights', 'string', 'rest', 'special'], cat: 'weapon', slot: 'long', kind: 'gun', action: 'bow', ammo: 'arrow', cap: 1, draw: 0.65, headDmg: 400, bodyDmg: 55, legDmg: 70, pellets: 1, spreadHip: 2.2, spreadAds: 0.3, recoil: 0.5, rate: 0.26, noise: 3, dur: 140, twoHanded: true, retrievable: true, desc: 'A proper compound bow. Draws smooth, hits hard, stays quiet.' },

  // Tier 2: store-bought and police guns.
  pistol: { name: '9mm Service Pistol', tier: 2, family: 'pistol', mods: ['sights', 'muzzle', 'mag', 'grip'], cat: 'weapon', slot: 'sidearm', kind: 'gun', action: 'mag', ammo: 'ammo_9mm', cap: 12, headDmg: 100, bodyDmg: 22, legDmg: 30, pellets: 1, spreadHip: 2.6, spreadAds: 0.55, recoil: 1.8, rate: 0.16, noise: 48, dur: 160, desc: 'Semi-auto, 12 round magazine. Takes a suppressor.' },
  m1911: { name: '.45 1911', tier: 2, family: 'pistol', mods: ['sights', 'muzzle', 'mag', 'grip'], cat: 'weapon', slot: 'sidearm', kind: 'gun', action: 'mag', ammo: 'ammo_45', cap: 7, headDmg: 180, bodyDmg: 34, legDmg: 44, pellets: 1, spreadHip: 2.4, spreadAds: 0.45, recoil: 3.0, rate: 0.2, noise: 52, dur: 200, desc: 'A century-old design that still settles arguments. Seven rounds of .45.' },
  shotgun: { name: 'Pump Shotgun', tier: 2, family: 'shotgun', mods: ['sights', 'muzzle', 'barrel', 'stock'], cat: 'weapon', slot: 'long', kind: 'gun', action: 'pump', ammo: 'ammo_12g', cap: 5, headDmg: 42, bodyDmg: 16, legDmg: 22, pellets: 9, pelletSpread: 3.8, spreadHip: 2.0, spreadAds: 0.6, recoil: 6.5, rate: 0.3, noise: 64, dur: 120, twoHanded: true, desc: 'Nine pellets. Pump after every shot.' },
  lever_rifle: { name: 'Lever-Action Carbine', tier: 2, family: 'rifle', mods: ['sights', 'muzzle', 'barrel', 'stock'], lever: true, cat: 'weapon', slot: 'long', kind: 'gun', action: 'pump', ammo: 'ammo_38', cap: 8, headDmg: 190, bodyDmg: 38, legDmg: 50, pellets: 1, spreadHip: 2.8, spreadAds: 0.3, recoil: 3.2, rate: 0.3, noise: 58, dur: 180, twoHanded: true, desc: 'Eight rounds of .38 through a tube magazine. Work the lever between shots.' },
  rifle: { name: 'Scoped Hunting Rifle', tier: 2, family: 'rifle', mods: ['muzzle', 'barrel', 'stock', 'mag'], cat: 'weapon', slot: 'long', kind: 'gun', action: 'bolt', ammo: 'ammo_308', cap: 5, headDmg: 400, bodyDmg: 60, legDmg: 100, pellets: 1, spreadHip: 4.5, spreadAds: 0.06, recoil: 5.5, rate: 0.5, noise: 85, dur: 140, zoom: 30, scope: true, penetrate: 2, armorPierce: true, twoHanded: true, desc: 'Bolt action with a 4x scope. Punches through two skulls.' },
  smg: { name: 'Compact SMG', tier: 2, family: 'carbine', mods: ['sights', 'muzzle', 'mag', 'stock'], cat: 'weapon', slot: 'long', kind: 'gun', action: 'mag', auto: true, ammo: 'ammo_9mm', cap: 30, headDmg: 90, bodyDmg: 18, legDmg: 24, pellets: 1, spreadHip: 3.2, spreadAds: 1.0, recoil: 1.1, rate: 0.08, noise: 50, dur: 180, twoHanded: true, desc: 'Full auto, thirty rounds of 9mm. Hold the trigger and pray.' },

  // Tier 3: military. Accurate, reliable, and made to be modded.
  m17: { name: 'M17 Pistol', tier: 3, family: 'pistol', mods: ['sights', 'muzzle', 'mag', 'grip'], cat: 'weapon', slot: 'sidearm', kind: 'gun', action: 'mag', ammo: 'ammo_9mm', cap: 17, headDmg: 115, bodyDmg: 24, legDmg: 32, pellets: 1, spreadHip: 2.0, spreadAds: 0.35, recoil: 1.5, rate: 0.14, noise: 46, dur: 260, desc: 'Army sidearm. Seventeen rounds, a clean trigger, and it never jams.' },
  ar15: { name: 'AR-15', tier: 3, family: 'carbine', mods: ['sights', 'muzzle', 'mag', 'stock', 'receiver'], cat: 'weapon', slot: 'long', kind: 'gun', action: 'mag', ammo: 'ammo_556', cap: 30, headDmg: 220, bodyDmg: 42, legDmg: 60, pellets: 1, spreadHip: 2.6, spreadAds: 0.18, recoil: 1.6, rate: 0.11, noise: 72, dur: 260, penetrate: 2, twoHanded: true, desc: 'Semi-auto 5.56. Light, accurate, and it takes every attachment ever made.' },
  m4: { name: 'M4 Carbine', tier: 3, family: 'carbine', mods: ['sights', 'muzzle', 'mag', 'stock'], cat: 'weapon', slot: 'long', kind: 'gun', action: 'mag', auto: true, ammo: 'ammo_556', cap: 30, headDmg: 200, bodyDmg: 40, legDmg: 55, pellets: 1, spreadHip: 2.8, spreadAds: 0.3, recoil: 1.5, rate: 0.075, noise: 74, dur: 240, penetrate: 2, twoHanded: true, desc: 'Select-fire military carbine. Full auto, thirty rounds, goes through two of them.' },
  combat_shotgun: { name: 'Combat Shotgun', tier: 3, family: 'shotgun', mods: ['sights', 'muzzle', 'mag', 'stock'], cat: 'weapon', slot: 'long', kind: 'gun', action: 'mag', ammo: 'ammo_12g', cap: 8, headDmg: 44, bodyDmg: 17, legDmg: 23, pellets: 9, pelletSpread: 3.2, spreadHip: 1.8, spreadAds: 0.5, recoil: 5.5, rate: 0.2, noise: 66, dur: 240, twoHanded: true, desc: 'Semi-auto, box-fed, eight shells as fast as you can pull.' },
  dmr: { name: 'Marksman Rifle', tier: 3, family: 'rifle', mods: ['muzzle', 'barrel', 'stock', 'mag'], cat: 'weapon', slot: 'long', kind: 'gun', action: 'mag', ammo: 'ammo_308', cap: 10, headDmg: 420, bodyDmg: 62, legDmg: 100, pellets: 1, spreadHip: 3.8, spreadAds: 0.05, recoil: 4.2, rate: 0.28, noise: 84, dur: 260, zoom: 28, scope: true, penetrate: 2, armorPierce: true, twoHanded: true, desc: 'Semi-auto .308 with a 5x optic. Ten rounds, ten skulls.' },

  // Experimental: Living Guard tech and other things nobody should have.
  photon_pistol: { name: 'Guard Photon Pistol', tier: 4, family: 'energy', mods: ['sights', 'emitter', 'cell', 'special'], cat: 'weapon', slot: 'sidearm', kind: 'gun', action: 'mag', energy: true, laser: true, ammo: 'ecell', cap: 10, headDmg: 140, bodyDmg: 38, legDmg: 55, pellets: 1, spreadHip: 1.6, spreadAds: 0.25, recoil: 0.9, rate: 0.28, noise: 20, dur: 150, armorPierce: true, desc: 'Ten bolts of light per cell, barely louder than a cough.' },
  arc_carbine: { name: 'Guard Arc Carbine', tier: 4, family: 'energy', mods: ['sights', 'emitter', 'cell', 'special'], cat: 'weapon', slot: 'long', kind: 'gun', action: 'mag', energy: true, laser: true, ammo: 'ecell', cap: 18, headDmg: 240, bodyDmg: 60, legDmg: 90, pellets: 1, spreadHip: 1.8, spreadAds: 0.1, recoil: 1.3, rate: 0.2, noise: 28, dur: 150, armorPierce: true, penetrate: 2, twoHanded: true, desc: 'The Living Guard\'s service weapon. Burns through helmets and the head behind them.' },
  scatter_emitter: { name: 'Guard Scatter Emitter', tier: 4, family: 'energy', mods: ['sights', 'emitter', 'cell'], cat: 'weapon', slot: 'long', kind: 'gun', action: 'mag', energy: true, laser: true, ammo: 'ecell', cap: 6, headDmg: 70, bodyDmg: 22, legDmg: 30, pellets: 7, pelletSpread: 3.5, spreadHip: 1.6, spreadAds: 0.6, recoil: 2.8, rate: 0.35, noise: 26, dur: 150, armorPierce: true, twoHanded: true, desc: 'A riot-control laser. Seven beams in a fan, six blasts to a cell.' },
  beam_lance: { name: 'Guard Beam Lance', tier: 4, family: 'energy', mods: ['emitter', 'cell'], cat: 'weapon', slot: 'long', kind: 'gun', action: 'mag', energy: true, laser: true, ammo: 'ecell', cap: 4, chargeTime: 0.7, headDmg: 900, bodyDmg: 180, legDmg: 200, pellets: 1, spreadHip: 1.2, spreadAds: 0.02, recoil: 3, rate: 0.9, noise: 30, dur: 120, zoom: 26, scope: true, penetrate: 6, armorPierce: true, twoHanded: true, desc: 'A sniper\'s laser. Charges for a breath, then burns a line through everything in front of it.' },
  herder_horn: { name: 'Herder Horn', tier: 4, family: 'horn', mods: ['emitter', 'cell'], cat: 'weapon', slot: 'sidearm', kind: 'gun', action: 'mag', energy: true, sonic: true, ammo: 'ecell', cap: 3, sonicRange: 9, sonicArc: 0.78, headDmg: 0, bodyDmg: 0, legDmg: 0, pellets: 1, spreadHip: 0, spreadAds: 0, recoil: 2.5, rate: 0.9, noise: 40, dur: 120, desc: 'A handheld piece of the herder mast. One blast knocks every dead thing in front of you flat.' },
};

export const TIERS = [
  { n: 0, name: 'Tier 0', label: 'Scrap-built', color: '#b8743e' },
  { n: 1, name: 'Tier 1', label: 'Worn', color: '#c9a24a' },
  { n: 2, name: 'Tier 2', label: 'Commercial', color: '#8fb3c6' },
  { n: 3, name: 'Tier 3', label: 'Military', color: '#9fbf6a' },
  { n: 4, name: 'Experimental', label: 'Living Guard tech', color: '#ff5a3c' },
];

export function tierOf(id) {
  const d = ITEMS[id];
  return d && d.tier != null ? TIERS[d.tier] : null;
}

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
      it.mods = opts.mods ? { ...opts.mods } : {};
    }
  }
  return it;
}

export function itemLabel(it) {
  const d = def(it.id);
  return d.name;
}

export function isStackable(id) {
  return (def(id).stack || 1) > 1;
}
