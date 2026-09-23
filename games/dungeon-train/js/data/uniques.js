/* Legendary (4) and Glob-Tier (5) uniques: named items with fixed signature effects.
   `stats` are fixed numbers (flat ones like hp grow with item tier), `mods` are behaviour switches,
   `grants` is an ability the wearer can bind while it's equipped. `effects` is what the player reads. */
(function () {
  'use strict';
  const D = DT.data;

  D.UNIQUES = {
    /* ---------- Finn: swords ---------- */
    scarlet: {
      name: 'Scarlet', kind: 'sword', base: 'iron_sword', rarity: 4, minTier: 1, art: 'sword_scarlet',
      stats: { crit: 0.15 }, mods: { critHeal: 0.03, critChain: 1 },
      effects: [{ name: 'Golden Edge', text: '+15% crit chance. Critical hits heal you for 3% of your max health and zap one more enemy with lightning.' }],
      lore: 'Finn’s golden sword. He’s had it forever. He loves it.',
    },
    demon_blood: {
      name: 'Demon Blood Sword', kind: 'sword', base: 'bone_sword', rarity: 4, minTier: 3, art: 'sword_demon', grants: 'blood_rush',
      stats: { dmg: 0.15, lifesteal: 0.06 }, mods: { igniteEvery: 3 },
      effects: [{ name: 'Hungry Blade', text: '+15% damage and 6% Lifesteal. Every 3rd hit sets the enemy on fire (Burn).' }],
      lore: 'Forged from a demon’s blood. Finn doesn’t like to talk about it.',
    },
    root_sword: {
      name: 'Root Sword', kind: 'sword', base: 'broadsword', rarity: 4, minTier: 2, art: 'sword_root', grants: 'root_snare',
      stats: { rootChance: 0.2 }, mods: { vsDisabled: 0.3 },
      effects: [{ name: 'Grabby Roots', text: 'Hits have a 20% chance to Root enemies in place. +30% damage to Rooted, Stunned or Frozen enemies.' }],
      lore: 'It grew out of the ground exactly when Finn needed it.',
    },
    grass_sword: {
      name: 'The Grass Sword', kind: 'sword', base: 'rapier', rarity: 4, minTier: 3, art: 'sword_grass', grants: 'grass_lash',
      stats: { reach: 0.8, atkSpd: 0.1 },
      effects: [{ name: 'Living Blade', text: '+80% reach and +10% attack speed. The grass stretches out to stab enemies from way back.' }],
      lore: 'A cursed blade that wraps around your wrist. It’s grown on Finn. Literally.',
    },
    magma_blade: {
      name: 'Magma Blade', kind: 'sword', base: 'iron_sword', rarity: 4, minTier: 4, art: 'sword_magma',
      stats: { burnChance: 0.3 }, mods: { vsBurning: 0.3, burnSpread: 1 },
      effects: [{ name: 'Wildfire', text: 'Hits have a 30% chance to Burn. +30% damage to Burning enemies, and Burning enemies spread their fire when defeated.' }],
      lore: 'Borrowed from the Fire Kingdom. Nobody said “borrow”.',
    },
    guardian_blade: {
      name: 'Guardian Blade', kind: 'sword', base: 'crystal_blade', rarity: 4, minTier: 4, art: 'sword_guardian',
      stats: { crit: 0.08 }, mods: { critFreeze: 0.3, shatter: 0.5 },
      effects: [{ name: 'Crystal Crits', text: '+8% crit chance. Critical hits have a 30% chance to Freeze. Hitting a Frozen enemy Shatters it for 50% bonus damage to everything nearby.' }],
      lore: 'Chipped off a Crystal Guardian. It still wants to guard something.',
    },
    night_sword: {
      name: 'Night Sword', kind: 'sword', base: 'crystal_blade', rarity: 4, minTier: 5, art: 'sword_night',
      stats: { crit: 0.05 }, mods: { loopDmg: 0.6 },
      effects: [{ name: 'Sharper in the Dark', text: '+5% crit chance. Deals up to 60% more damage as the Loop closes in — full power inside the Loop Tunnel.' }],
      lore: 'It drinks the dark. The Dungeon Train has plenty.',
    },
    finn_sword: {
      name: 'The Finn Sword', kind: 'sword', base: 'crystal_blade', rarity: 5, minTier: 6, art: 'sword_finn', grants: 'sword_storm',
      stats: { dmg: 0.3 }, mods: { beamEvery: 1, beamDmg: 0.6 },
      effects: [{ name: 'Hero’s Echo', text: '+30% damage. EVERY swing also fires a Sword Beam that flies through enemies for 60% damage.' }],
      lore: 'A blade made out of Finn. It’s complicated.',
    },
    /* ---------- Finn: armor ---------- */
    og_hat: {
      name: 'Finn’s Original Hat', kind: 'helmet', base: 'bear_hat', rarity: 4, minTier: 1, art: 'hat_og',
      stats: { dmg: 0.1, hp: 20, speed: 0.08, safe: 1 },
      effects: [{ name: 'The Best Hat', text: '+10% damage, +20 health and +8% move speed. Secret pocket: +1 Hat Stash slot.' }],
      lore: 'It’s just his hat. It’s the best hat.',
    },
    magic_hat: {
      name: 'Magic Man’s Hat', kind: 'helmet', base: 'wizard_hat', rarity: 4, minTier: 4, art: 'hat_magic',
      stats: { cdr: 0.1 }, mods: { blinkChance: 0.15 },
      effects: [{ name: 'Now You See Me', text: 'Abilities recharge 10% faster. When something hits you, 15% chance to blink away and take no damage.' }],
      lore: 'He wants it back. He’ll have to catch you first.',
    },
    royal_armor: {
      name: 'Candy Kingdom Royal Armor', kind: 'armor', base: 'knight_plate', rarity: 4, minTier: 2, art: 'plate_royal',
      stats: { armorPct: 0.2, speed: 0.05 }, mods: { blockEvery: 5 },
      effects: [{ name: 'Royal Guard', text: '+20% armor, and the heavy plate doesn’t slow you down. Completely blocks one hit every 5 seconds.' }],
      lore: 'Princess Bubblegum’s finest peppermint plating.',
    },
    flame_shield: {
      name: 'Flambo’s Flame Shield', kind: 'armor', base: 'hero_tunic', rarity: 4, minTier: 3, art: 'tunic_flame',
      mods: { burnAura: 0.25, fireTrail: 1 },
      effects: [{ name: 'Flame Shield', text: 'You’re wrapped in magic fire: nearby enemies get scorched and Burned every second, and your dodge leaves a trail of fire.' }],
      lore: '“Flambo!” — Flambo',
    },
    crystal_armor: {
      name: 'Crystal Guardian Armor', kind: 'armor', base: 'chainmail', rarity: 4, minTier: 5, art: 'chainmail_crystal', grants: 'crystal_shell',
      stats: { armorPct: 0.15, thorns: 0.4 },
      effects: [{ name: 'Crystal Skin', text: '+15% armor. Enemies that hit you take 40% of the damage back as crystal shards.' }],
      lore: 'It hums in harmony with the Crystal Dimension.',
    },
    billys_gauntlet: {
      name: 'Billy’s Gauntlet', kind: 'gauntlets', base: 'iron_gauntlets', rarity: 4, minTier: 4, art: 'gauntlets_billy',
      stats: { primaryDmg: 0.35, knockback: 1 }, mods: { finisherQuake: 0.6 },
      effects: [{ name: 'Hero’s Fist', text: 'Your sword combo deals 35% more damage and sends enemies flying. The last hit of each combo also sends out a shockwave for 60% damage.' }],
      lore: 'Once worn by Billy, the greatest hero of all time.',
    },
    jet_boots: {
      name: 'BMO’s Jet Boots', kind: 'boots', base: 'winged_boots', rarity: 4, minTier: 3, art: 'boots_jet', grants: 'rocket_jump',
      stats: { speed: 0.08 }, mods: { dashCharges: 1, dashShock: 1 },
      effects: [{ name: 'Rocket Feet', text: '+8% move speed. Store 2 dodges at once, and dodging through enemies Shocks them.' }],
      lore: 'BMO built them from a video game controller and a lot of hope.',
    },
    finns_backpack: {
      name: 'Finn’s Green Backpack', kind: 'pack', base: 'adventure_pack', rarity: 4, minTier: 1, art: 'pack_finn',
      stats: { backpack: 5, belt: 1 }, mods: { magnet: 4, freeSnack: 1 },
      effects: [{ name: 'Everything Pocket', text: '+5 backpack slots and +1 snack belt slot. Coins fly to you from far away, and every trip starts with a free snack on your belt.' }],
      lore: 'Somehow there’s always a snack in the bottom.',
    },
    /* ---------- Jake: instruments ---------- */
    jakes_viola: {
      name: 'Jake’s Viola', kind: 'instrument', base: 'old_viola', rarity: 4, minTier: 2, art: 'viola_jake', grants: 'serenade',
      stats: { abilityPower: 0.2 }, mods: { rhythmEvery: 3, rhythmMult: 0.8 },
      effects: [{ name: 'Sweet Music', text: 'Abilities deal 20% more damage. Every 3rd punch plays a note that also hits everything in a wide cone for 80% more damage.' }],
      lore: 'He plays it for the stars. Now he plays it at skeletons.',
    },
    axe_bass: {
      name: 'Marceline’s Axe Bass', kind: 'instrument', base: 'upright_bass', rarity: 4, minTier: 3, art: 'bass_axe', grants: 'axe_chop',
      stats: { lifesteal: 0.06, stunChance: 0.15 }, mods: { wideArc: 1 },
      effects: [{ name: 'Vampire Queen’s Axe', text: 'Your haymaker swings in a huge half-circle. 6% Lifesteal and a 15% chance to Stun.' }],
      lore: 'She said he could borrow it. Probably.',
    },
    rainbow_riff: {
      name: 'Rainbow Riff', kind: 'instrument', base: 'garage_guitar', rarity: 4, minTier: 2, art: 'guitar_rainbow', grants: 'rock_out',
      mods: { linger: 2.2, lingerMult: 0.25, pierce: 2 },
      effects: [{ name: 'Endless Solo', text: 'Hold attack and your fist stays in the air for a LONG time (up to 3 seconds). Steer it with your aim to drag it through enemies — it hits everything it touches, over and over, and punches go through 2 extra enemies.' }],
      lore: 'Lady Rainicorn strung it with actual rainbow.',
    },
    party_drums: {
      name: 'Party Drum Kit', kind: 'instrument', base: 'bongo_drums', rarity: 4, minTier: 4, art: 'drums_party',
      mods: { explode: 0.8, explodeChill: 1 },
      effects: [{ name: 'Ice Cold Beats', text: 'Punch explosions are 80% stronger and Chill everything they hit.' }],
      lore: 'Every car’s a party car if you bring these.',
    },
    lsp_squeezebox: {
      name: 'Lumpy Space Squeezebox', kind: 'instrument', base: 'squeezebox', rarity: 4, minTier: 3, art: 'accordion_lsp',
      mods: { split: 2, pierce: 1 },
      effects: [{ name: 'Oh My Glob', text: 'Every punch throws 2 MORE fists (5 in total), and every fist goes through 1 extra enemy.' }],
      lore: 'It’s lumpy. Don’t ask where she got it.',
    },
    cosmic_keytar: {
      name: 'Cosmic Keytar', kind: 'instrument', base: 'keytar', rarity: 4, minTier: 5, art: 'keytar_cosmic',
      stats: { shockChance: 0.2 }, mods: { chain: 3, chainMult: 0.2 },
      effects: [{ name: 'Space Static', text: 'Your punch lightning jumps to 3 MORE enemies (5 in total) and hits harder. 20% chance on hit to Shock.' }],
      lore: 'Picks up radio stations from other dimensions.',
    },
    trunks_banjo: {
      name: 'Tree Trunks’ Banjo', kind: 'instrument', base: 'banjo', rarity: 4, minTier: 1, art: 'banjo_trunks',
      stats: { atkSpd: 0.15 }, mods: { pieHeal: 15, echoChance: 0.15 },
      effects: [{ name: 'Front Porch Pickin’', text: '+15% attack speed. 15% chance for a punch to hit twice. Every 15 seconds you eat some pie and heal 15% of your health.' }],
      lore: 'Smells like apple pie. Everything of hers does.',
    },
    guardian_horn: {
      name: 'The Guardian’s Horn', kind: 'instrument', base: 'brass_trumpet', rarity: 5, minTier: 6, art: 'trumpet_guardian', grants: 'doom_blast',
      stats: { dmg: 0.2 }, mods: { primaryFreeze: 0.25, shatter: 0.8 },
      effects: [{ name: 'Glacier Blast', text: '+20% damage. Every blast has a 25% chance to Freeze what it hits, and hitting a Frozen enemy Shatters it for 80% bonus damage to everything nearby.' }],
      lore: 'The horn a Gumball Guardian blows when the kingdom is in danger. It’s VERY loud.',
    },
    /* ---------- Jake: collars ---------- */
    holding_collar: {
      name: 'Collar of Holding', kind: 'collar', base: 'dog_collar', rarity: 4, minTier: 2, art: 'collar_holding',
      stats: { safe: 2, abilityPower: 0.2 },
      effects: [{ name: 'Tummy Upgrade', text: '+2 Tummy slots and abilities deal 20% more damage.' }],
      lore: 'The tag says “If found, feed him.”',
    },
    rainicorn_scarf: {
      name: 'Lady Rainicorn’s Scarf', kind: 'collar', base: 'bow_tie', rarity: 4, minTier: 3, art: 'scarf_rainbow',
      stats: { cdr: 0.1 }, mods: { rainbowTrail: 1 },
      effects: [{ name: 'Rainbow Road', text: 'Abilities recharge 10% faster. Your stretch-dash leaves a rainbow that heals you and burns enemies.' }],
      lore: 'Smells like rainbows. And a little like Jake.',
    },
    /* ---------- relics (either hero) ---------- */
    frost_heart: {
      name: 'The Frost Heart', kind: 'relic', base: 'gem_ring', rarity: 4, minTier: 3, art: 'relic_frost',
      mods: { primaryFreeze: 0.25, freezeDur: 0.8, vsCold: 0.25 },
      effects: [{ name: 'Deep Freeze', text: 'Your attacks have a 25% chance to Freeze enemies solid for 2 seconds. Chilled and Frozen enemies take 25% more damage from you.' }],
      lore: 'Cold to the touch. Colder to the enemies.',
    },
    gunter_bottle: {
      name: 'Gunter’s Glass Bottle', kind: 'relic', base: 'tiny_bell', rarity: 4, minTier: 4, art: 'relic_bottle',
      mods: { gunterBottle: 0.2 },
      effects: [{ name: 'Wenk!', text: 'When you hit something, 20% chance Gunter throws a bottle at it: it smashes in an icy splash for 60% damage and Chills everything nearby.' }],
      lore: 'Gunter smash.',
    },
    bmo_cartridge: {
      name: 'BMO’s Game Cartridge', kind: 'relic', base: 'cloud_puff', rarity: 4, minTier: 2, art: 'relic_bmo',
      mods: { bmoDrone: 2, droneDmg: 0.8 },
      effects: [{ name: 'Player Two', text: 'Two tiny pixel buddies float beside you and zap enemies for 80% damage every second.' }],
      lore: '“Who wants to play video games?”',
    },
    choose_receipt: {
      name: 'Choose Goose’s Golden Receipt', kind: 'relic', base: 'candy_charm', rarity: 4, minTier: 1, art: 'relic_receipt',
      stats: { buyDiscount: 0.25, sellBonus: 0.25 },
      effects: [{ name: 'Best Customer', text: 'Buy things 25% cheaper and sell things for 25% more at Choose Goose’s shop (while the wearer is your selected hero).' }],
      lore: 'Choose goose, choose!',
    },
    owl_feather: {
      name: 'Cosmic Owl Feather', kind: 'relic', base: 'tiny_bell', rarity: 4, minTier: 3, art: 'relic_feather',
      stats: { dodge: 0.08 }, mods: { revealMap: 1 },
      effects: [{ name: 'Dream Vision', text: 'Every chest and exit on the train shows on your radar. +8% chance to dodge hits.' }],
      lore: 'Dreams of the future, one feather at a time.',
    },
    fp_ember: {
      name: 'Flame Princess’s Ember', kind: 'relic', base: 'gem_ring', rarity: 4, minTier: 3, art: 'relic_ember',
      mods: { burnAura: 0.35, vsBurning: 0.2 },
      effects: [{ name: 'Still Warm', text: 'Every second you scorch nearby enemies for 35% damage and set them on fire. +20% damage to Burning enemies.' }],
      lore: 'Still warm. Always warm.',
    },
    apple_pie: {
      name: 'Tree Trunks’ Apple Pie', kind: 'relic', base: 'bone_charm', rarity: 4, minTier: 1, art: 'relic_pie',
      mods: { pieHeal: 15 },
      effects: [{ name: 'Second Helping', text: 'Every 15 seconds you eat some pie and heal 15% of your max health.' }],
      lore: 'Baked with love and a few questionable apples.',
    },
    waving_snail: {
      name: 'The Waving Snail', kind: 'relic', base: 'snail_shell', rarity: 4, minTier: 1, art: 'relic_snail',
      stats: { luck: 0.25, xp: 0.12 },
      effects: [{ name: 'He’s Always There', text: '+25% luck and +12% experience.' }],
      lore: 'Look closely at every car. He’s waving.',
    },
    hambo: {
      name: 'Hambo', kind: 'relic', base: 'bone_charm', rarity: 4, minTier: 2, art: 'relic_hambo',
      stats: { xp: 0.2, hp: 25 },
      effects: [{ name: 'Needs a Hug', text: '+20% experience and +25 max health.' }],
      lore: 'Marceline’s old teddy.',
    },
    enchiridion: {
      name: 'The Enchiridion', kind: 'relic', base: 'gem_ring', rarity: 5, minTier: 6, art: 'relic_book',
      stats: { dmg: 0.25, hpPct: 0.2, cdr: 0.2 },
      effects: [{ name: 'The Hero’s Handbook', text: '+25% damage, +20% max health, and abilities recharge 20% faster.' }],
      lore: 'The hero’s handbook. It knows you’re worthy.',
    },
    ice_crown: {
      name: 'The Ice Crown', kind: 'relic', base: 'gem_ring', rarity: 5, minTier: 6, art: 'relic_crown', grants: 'frost_nova',
      stats: { chillChance: 0.25 }, mods: { primaryFreeze: 0.2, iceBolts: 2, boltDmg: 0.8, frostBurst: 1, loopFast: 0.15 },
      effects: [{ name: 'Winter’s Wrath', text: 'Hits have a 25% chance to Chill and your attacks have a 20% chance to Freeze. Every 2 seconds you fire an ice bolt. Enemies that die while cold burst and Chill everything nearby.' }, { name: 'Impatient Crown', text: 'The Loop closes 15% faster — the crown wants to get home.' }],
      lore: 'It whispers. Don’t listen.',
    },
    lich_fragment: {
      name: 'Fragment of the Lich', kind: 'relic', base: 'bone_charm', rarity: 5, minTier: 6, art: 'relic_lich',
      stats: { dmg: 0.6 }, mods: { lichDrain: 0.01 },
      effects: [{ name: 'Terrible Power', text: '+60% damage. While enemies are nearby, you lose 1% of your max health every second.' }],
      lore: 'Not a good idea. A very strong idea.',
    },
    nightosphere_amulet: {
      name: 'Nightosphere Amulet', kind: 'relic', base: 'gem_ring', rarity: 5, minTier: 6, art: 'relic_amulet', grants: 'soul_suck',
      stats: { dmg: 0.15 }, mods: { killBurst: 0.8 },
      effects: [{ name: 'Chaos Everywhere', text: '+15% damage. Defeated enemies erupt in hellfire for 80% damage and set everything nearby on fire.' }],
      lore: 'Hunson Abadeer wants it back. He can wait.',
    },
  };
})();
