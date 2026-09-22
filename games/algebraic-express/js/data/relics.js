/* Legendary and Glob-Tier uniques. `stats` apply to the wearer (trinkets: both heroes).
   `hooks` are named behaviours implemented in game/combat.js. */
(function () {
  'use strict';
  const D = AE.data;
  D.RELICS = {
    /* Finn's swords */
    scarlet:        { name: 'Scarlet, the Golden Sword', base: 'iron_sword', rarity: 4, minTier: 1, icon: 'sword', stats: { crit: 0.15 }, hooks: { critHeal: 0.03 },
                      desc: '+15% crit chance. Critical hits heal Finn for 3% of max HP.', lore: 'Finn’s first real sword. It’s gold. He loves it.' },
    demon_blood:    { name: 'Demon Blood Sword', base: 'iron_sword', rarity: 4, minTier: 3, icon: 'sword', stats: { dmg: 0.15, lifesteal: 0.06 }, hooks: { igniteEvery: 3 },
                      desc: '+15% damage and +6% lifesteal. Every third hit sets the target ablaze.', lore: 'Forged from a demon’s blood. Finn doesn’t like to talk about it.' },
    root_sword:     { name: 'Root Sword', base: 'great_sword', rarity: 4, minTier: 2, icon: 'sword', hooks: { rootChance: 0.2, rootedBonus: 0.25 },
                      desc: 'Hits have a 20% chance to root enemies in place. +25% damage to rooted enemies.', lore: 'It grew out of the ground exactly when Finn needed it.' },
    grass_sword:    { name: 'The Grass Sword', base: 'candy_dagger', rarity: 4, minTier: 3, icon: 'sword', stats: { reach: 0.8, atkSpd: 0.1 },
                      desc: '+80% reach and +10% attack speed. It wraps around your arm and won’t let go.', lore: 'A cursed blade that lives on Finn’s wrist now.' },
    night_sword:    { name: 'Night Sword', base: 'crystal_sword', rarity: 4, minTier: 5, icon: 'sword', hooks: { blizzardDmg: 0.5 },
                      desc: 'Deals up to 50% more damage as the blizzard closes in.', lore: 'Sharper in the dark.' },
    finn_sword:     { name: 'The Finn Sword', base: 'crystal_sword', rarity: 5, minTier: 6, icon: 'sword', stats: { dmg: 0.3 }, hooks: { beamEvery: 1 },
                      desc: '+30% damage. Every swing fires a sword beam.', lore: 'A blade made out of Finn. It’s complicated.' },
    /* Jake's fists */
    axe_bass:       { name: "Marceline's Axe Bass", base: 'stone_fists', rarity: 4, minTier: 3, icon: 'music', stats: { reach: 0.3 }, hooks: { wideArc: 1, stunChance: 0.15 },
                      desc: 'Jake swings it like an axe: huge arcs, +30% reach, 15% chance to stun.', lore: 'She said he could borrow it. Probably.' },
    jake_viola:     { name: "Jake's Viola", base: 'bow_wraps', rarity: 4, minTier: 2, icon: 'music', hooks: { waveEvery: 4 },
                      desc: 'Every fourth punch sends out a piercing sound wave.', lore: 'He plays it for the stars. Now he plays it at penguins.' },
    billy_gauntlet: { name: "Billy's Gauntlet", base: 'stone_fists', rarity: 4, minTier: 4, icon: 'fist', stats: { dmg: 0.4, knockback: 1 },
                      desc: '+40% damage. Punches send enemies flying.', lore: 'Once worn by Billy, the greatest hero of all time.' },
    /* Finn's gear */
    og_hat:         { name: "Finn's Original Hat", base: 'bear_hat', rarity: 4, minTier: 1, icon: 'hat', stats: { dmg: 0.1, hp: 20, speed: 0.08 },
                      desc: '+10% damage, +20 HP and +8% move speed for Finn.', lore: 'It’s just his hat. It’s the best hat.' },
    royal_armor:    { name: 'Candy Kingdom Royal Armor', base: 'candy_plate', rarity: 4, minTier: 2, icon: 'shield', hooks: { blockEvery: 6 },
                      desc: 'Blocks one hit completely every 6 seconds.', lore: 'Princess Bubblegum’s finest peppermint plating.' },
    /* Jake's gear */
    tummy_vest:     { name: 'Stretch-Knit Tummy Vest', base: 'sweater_vest', rarity: 4, minTier: 1, icon: 'tummy', stats: { tummy: 2 },
                      desc: '+2 Tummy slots. Whatever Jake swallows survives a wipe.', lore: 'Tree Trunks knitted it with room to grow.' },
    rainicorn_scarf:{ name: "Lady Rainicorn's Scarf", base: 'dog_collar', rarity: 4, minTier: 3, icon: 'rainbow', hooks: { rainbowTrail: 1 },
                      desc: 'Dashing leaves a rainbow trail that heals heroes and burns enemies.', lore: 'Smells like rainbows.' },
    /* trinkets (both heroes) */
    bmo_cartridge:  { name: "BMO's Game Cartridge", base: 'cloud_puff', rarity: 4, minTier: 2, icon: 'bmo', hooks: { bmoDrone: 1 },
                      desc: 'A tiny BMO hovers beside you, zapping enemies with pixel lasers.', lore: '“Who wants to play video games?”' },
    choose_receipt: { name: "Choose Goose's Golden Receipt", base: 'candy_charm', rarity: 4, minTier: 1, icon: 'goose', stats: { buyDiscount: 0.25, sellBonus: 0.25 },
                      desc: 'Buy for 25% less and sell for 25% more at Choose Goose’s shop.', lore: 'Choose goose, choose!' },
    owl_feather:    { name: 'Cosmic Owl Feather', base: 'tiny_bell', rarity: 4, minTier: 3, icon: 'feather', stats: { dodge: 0.08 }, hooks: { revealMap: 1 },
                      desc: 'The whole train shows on your map, treasure included. +8% dodge.', lore: 'Dreams of the future, one feather at a time.' },
    magic_hat:      { name: "Magic Man's Hat", base: 'tiny_bell', rarity: 4, minTier: 4, icon: 'hat', hooks: { blinkChance: 0.15 },
                      desc: 'When hit, 15% chance to blink away and take no damage.', lore: 'Now you see it.' },
    fp_ember:       { name: "Flame Princess's Ember", base: 'gem_ring', rarity: 4, minTier: 3, icon: 'flame', hooks: { burnAura: 1 },
                      desc: 'Both heroes scorch nearby enemies every second.', lore: 'Still warm. Always warm.' },
    apple_pie:      { name: "Tree Trunks' Apple Pie", base: 'bone_charm', rarity: 4, minTier: 1, icon: 'heart', hooks: { pieHeal: 1 },
                      desc: 'Every 25 seconds, both heroes heal 15% of max HP.', lore: 'Baked with love and a few questionable apples.' },
    waving_snail:   { name: 'The Waving Snail', base: 'candy_charm', rarity: 4, minTier: 1, icon: 'snail', stats: { luck: 0.25, xp: 0.1 },
                      desc: '+25% luck and +10% XP. He’s always been there. Waving.', lore: 'Look closely at every car.' },
    hambo:          { name: 'Hambo', base: 'bone_charm', rarity: 4, minTier: 2, icon: 'heart', stats: { xp: 0.2, hp: 25 },
                      desc: '+20% XP and +25 HP for both heroes.', lore: 'Marceline’s old teddy. He needs a hug.' },
    /* Glob-Tier */
    enchiridion:    { name: 'The Enchiridion', base: 'gem_ring', rarity: 5, minTier: 6, icon: 'book', stats: { dmg: 0.25, hpPct: 0.2, cdr: 0.2 },
                      desc: '+25% damage, +20% max HP and 20% faster cooldowns for both heroes.', lore: 'The hero’s handbook. It knows you’re worthy.' },
    ice_crown:      { name: 'The Ice Crown', base: 'gem_ring', rarity: 5, minTier: 6, icon: 'crown', stats: { chillChance: 0.25 }, hooks: { iceBolts: 2, blizzardFast: 0.15 },
                      desc: 'Every 2 seconds, fire an ice bolt at the nearest enemy. Hits chill. The blizzard comes 15% faster — the crown wants to go home.', lore: 'It whispers. Don’t listen.' },
    lich_fragment:  { name: 'Fragment of the Lich', base: 'bone_charm', rarity: 5, minTier: 6, icon: 'skull', stats: { dmg: 0.6 }, hooks: { lichDrain: 0.01 },
                      desc: '+60% damage. While fighting, lose 1% of max HP every second.', lore: 'Not a good idea. A very strong idea.' },
    nightosphere:   { name: 'Nightosphere Amulet', base: 'gem_ring', rarity: 5, minTier: 6, icon: 'flame', stats: { dmg: 0.15 }, hooks: { killBurst: 1 },
                      desc: '+15% damage. Defeated enemies erupt in hellfire that burns everything nearby.', lore: 'Hunson Abadeer wants it back. He can wait.' },
  };
})();
