/* Skill tree: 5 branches x 4 tiers x 3 nodes = 60 skills, 14 active abilities, plus the duo super.
   node.scope: whose stats a node changes ('finn' | 'jake' | 'both' | 'team'). */
(function () {
  'use strict';
  const D = AE.data;

  D.BRANCHES = [
    { id: 'hero',         name: 'Hero',         hero: 'finn', icon: 'sword', color: '#3d8bfd', motto: 'Finn’s sword arts.' },
    { id: 'adventurer',   name: 'Adventurer',   hero: 'finn', icon: 'bag',   color: '#3fb950', motto: 'Grab the loot. Get out alive.' },
    { id: 'stretchy',     name: 'Stretchy',     hero: 'jake', icon: 'fist',  color: '#f59e0b', motto: 'Jake’s big, bendy fists.' },
    { id: 'shapeshifter', name: 'Shapeshifter', hero: 'jake', icon: 'ball',  color: '#ec4899', motto: 'Jake’s magical body tricks.' },
    { id: 'bros',         name: 'Bros',         hero: 'both', icon: 'heart', color: '#ef4444', motto: 'Better together.' },
  ];
  D.TIER_REQ = [0, 0, 3, 7, 12];

  const S = {};
  function N(branch, id, tier, col, name, max, scope, o) { S[id] = Object.assign({ id, branch, tier, col, name, max, scope }, o); }
  const p = (x) => Math.round(x * 100);

  /* Hero (Finn) */
  N('hero', 'h_edge', 1, 0, 'Sharp Edge', 5, 'finn', { desc: (r) => `Finn deals ${6 * r}% more damage.`, stats: (r) => ({ dmg: 0.06 * r }) });
  N('hero', 'h_spin', 1, 1, 'Sword Spin', 1, 'finn', { ability: 'sword_spin' });
  N('hero', 'h_combo', 1, 2, 'Combo Master', 3, 'finn', { desc: (r) => `The third hit of Finn’s combo deals ${20 * r}% more damage.`, stats: (r) => ({ finisher: 0.2 * r }) });
  N('hero', 'h_instinct', 2, 0, "Hero's Instinct", 3, 'finn', { desc: (r) => `+${5 * r}% crit chance for Finn.`, stats: (r) => ({ crit: 0.05 * r }) });
  N('hero', 'h_leap', 2, 1, "Hero's Leap", 1, 'finn', { req: 'h_spin', ability: 'heros_leap' });
  N('hero', 'h_swift', 2, 2, 'Swift Swings', 3, 'finn', { desc: (r) => `Finn attacks ${8 * r}% faster.`, stats: (r) => ({ atkSpd: 0.08 * r }) });
  N('hero', 'h_beam', 3, 0, 'Sword Beam', 1, 'finn', { ability: 'sword_beam' });
  N('hero', 'h_wound', 3, 1, 'Wound Maker', 2, 'finn', { desc: (r) => `Finn’s hits have a ${15 * r}% chance to make enemies bleed.`, stats: (r) => ({ bleedChance: 0.15 * r }) });
  N('hero', 'h_riposte', 3, 2, 'Riposte', 2, 'finn', { desc: (r) => `After Finn rolls, his next attack deals ${50 * r}% more damage.`, stats: (r) => ({ riposte: 0.5 * r }) });
  N('hero', 'h_legend', 4, 0, 'Legendary Hero', 1, 'finn', { req: 'h_beam', desc: () => 'The third hit of Finn’s combo also fires a Sword Beam.', stats: () => ({ finisherBeam: 1 }) });
  N('hero', 'h_math', 4, 1, 'Critical Math', 3, 'finn', { desc: (r) => `Finn’s critical hits deal ${20 * r}% more damage.`, stats: (r) => ({ critDmg: 0.2 * r }) });
  N('hero', 'h_heart', 4, 2, "Hero's Heart", 2, 'finn', { desc: (r) => `+${3 * r}% lifesteal for Finn.`, stats: (r) => ({ lifesteal: 0.03 * r }) });

  /* Adventurer (Finn, extraction) */
  N('adventurer', 'a_pack', 1, 0, 'Big Backpack', 3, 'team', { desc: (r) => `+${2 * r} backpack slots.`, stats: (r) => ({ backpack: 2 * r }) });
  N('adventurer', 'a_cry', 1, 1, 'Battle Cry', 1, 'finn', { ability: 'battle_cry' });
  N('adventurer', 'a_tough', 1, 2, 'Tough Guy', 3, 'finn', { desc: (r) => `Finn gets ${8 * r}% more max HP.`, stats: (r) => ({ hpPct: 0.08 * r }) });
  N('adventurer', 'a_tummy', 2, 0, 'Tummy Training', 2, 'team', { desc: (r) => `+${r} Tummy ${r === 1 ? 'slot' : 'slots'}. Jake keeps whatever is in his tummy, even after a wipe.`, stats: (r) => ({ tummy: r }) });
  N('adventurer', 'a_pancake', 2, 1, 'Bacon Pancakes', 1, 'finn', { req: 'a_cry', ability: 'pancake_toss' });
  N('adventurer', 'a_roll', 2, 2, 'Tuck and Roll', 2, 'finn', { desc: (r) => `Finn’s roll recharges ${20 * r}% faster.`, stats: (r) => ({ dashCd: 0.2 * r }) });
  N('adventurer', 'a_nose', 3, 0, 'Treasure Nose', 3, 'team', { desc: (r) => `+${8 * r}% luck: better loot, more often.`, stats: (r) => ({ luck: 0.08 * r }) });
  N('adventurer', 'a_trap', 3, 1, 'Hero Trap', 1, 'finn', { ability: 'hero_trap' });
  N('adventurer', 'a_hands', 3, 2, 'Quick Hands', 2, 'team', { desc: (r) => `Open chests and bail out ${25 * r}% faster.`, stats: (r) => ({ interactSpeed: 0.25 * r }) });
  N('adventurer', 'a_brave', 4, 0, 'Adventure Time!', 1, 'team', { desc: () => 'Once per trip, a knockout blow leaves you at 1 HP with 2 seconds of invincibility instead.', stats: () => ({ lastStand: 1 }) });
  N('adventurer', 'a_warm', 4, 1, 'Warm Blood', 2, 'team', { desc: (r) => `The blizzard meter fills ${10 * r}% slower.`, stats: (r) => ({ blizzardSlow: 0.1 * r }) });
  N('adventurer', 'a_goose', 4, 2, "Choose Goose's Pal", 2, 'team', { desc: (r) => `Buy ${10 * r}% cheaper and sell for ${10 * r}% more.`, stats: (r) => ({ buyDiscount: 0.1 * r, sellBonus: 0.1 * r }) });

  /* Stretchy (Jake) */
  N('stretchy', 's_fists', 1, 0, 'Big Fists', 5, 'jake', { desc: (r) => `Jake deals ${6 * r}% more damage.`, stats: (r) => ({ dmg: 0.06 * r }) });
  N('stretchy', 's_slam', 1, 1, 'Stretchy Slam', 1, 'jake', { ability: 'stretchy_slam' });
  N('stretchy', 's_arms', 1, 2, 'Long Arms', 3, 'jake', { desc: (r) => `Jake’s punches reach ${12 * r}% further.`, stats: (r) => ({ reach: 0.12 * r }) });
  N('stretchy', 's_grab', 2, 0, 'Stretch Grab', 1, 'jake', { req: 's_slam', ability: 'stretch_grab' });
  N('stretchy', 's_ko', 2, 1, 'Knockout Punch', 3, 'jake', { desc: (r) => `Jake’s punches have a ${8 * r}% chance to stun and knock enemies ${10 * r}% further.`, stats: (r) => ({ stunChance: 0.08 * r, knockback: 0.1 * r }) });
  N('stretchy', 's_fur', 2, 2, 'Thick Fur', 3, 'jake', { desc: (r) => `+${3 * r} armor for Jake.`, stats: (r) => ({ armor: 3 * r }) });
  N('stretchy', 's_giant', 3, 0, 'Giant Jake', 1, 'jake', { ability: 'giant_jake' });
  N('stretchy', 's_rhythm', 3, 1, 'Viola Rhythm', 2, 'jake', { desc: (r) => `Every fourth punch hits everything in a wide cone for ${25 * r}% extra damage.`, stats: (r) => ({ rhythm: 0.25 * r }) });
  N('stretchy', 's_vigor', 3, 2, 'Bulldog Vigor', 3, 'jake', { desc: (r) => `Jake gets ${10 * r}% more max HP.`, stats: (r) => ({ hpPct: 0.1 * r }) });
  N('stretchy', 's_quake', 4, 0, 'Aftershock', 1, 'jake', { req: 's_giant', desc: () => 'Stretchy Slam hits a second time half a second later.', stats: () => ({ aftershock: 1 }) });
  N('stretchy', 's_crush', 4, 1, 'Crushing Grip', 2, 'jake', { desc: (r) => `Jake deals ${25 * r}% more damage to stunned, rooted or frozen enemies.`, stats: (r) => ({ vsDisabled: 0.25 * r }) });
  N('stretchy', 's_hungry', 4, 2, 'Hungry Dog', 2, 'jake', { desc: (r) => `Jake heals ${2 * r}% of max HP whenever an enemy goes down.`, stats: (r) => ({ killHeal: 0.02 * r }) });

  /* Shapeshifter (Jake, utility) */
  N('shapeshifter', 'm_shield', 1, 0, 'Shape Shield', 1, 'jake', { ability: 'shape_shield' });
  N('shapeshifter', 'm_rubber', 1, 1, 'Rubber Body', 3, 'jake', { desc: (r) => `+${5 * r}% dodge chance for Jake.`, stats: (r) => ({ dodge: 0.05 * r }) });
  N('shapeshifter', 'm_regen', 1, 2, 'Magic Metabolism', 3, 'both', { desc: (r) => `Out of danger for 3 seconds, heroes regenerate ${r}% of max HP per second.`, stats: (r) => ({ regen: 0.01 * r }) });
  N('shapeshifter', 'm_ball', 2, 0, 'Bouncy Ball', 1, 'jake', { req: 'm_shield', ability: 'bouncy_ball' });
  N('shapeshifter', 'm_buddy', 2, 1, 'Buddy System', 3, 'both', { desc: (r) => `Your buddy deals ${20 * r}% more damage while following you.`, stats: (r) => ({ companion: 0.2 * r }) });
  N('shapeshifter', 'm_stomach', 2, 2, 'Stretchy Stomach', 2, 'team', { desc: (r) => `Snacks heal ${25 * r}% more.`, stats: (r) => ({ healPower: 0.25 * r }) });
  N('shapeshifter', 'm_copter', 3, 0, 'Helicopter Arms', 1, 'jake', { ability: 'copter_arms' });
  N('shapeshifter', 'm_mastery', 3, 1, 'Shape Mastery', 3, 'both', { desc: (r) => `Abilities recharge ${6 * r}% faster for both heroes.`, stats: (r) => ({ cdr: 0.06 * r }) });
  N('shapeshifter', 'm_rescue', 3, 2, 'Stretchy Rescue', 2, 'team', { desc: (r) => `Wake a knocked-out buddy ${35 * r}% faster, with ${15 * r}% more HP.`, stats: (r) => ({ reviveSpeed: 0.35 * r, reviveHp: 0.15 * r }) });
  N('shapeshifter', 'm_reflect', 4, 0, 'Mirror Shield', 1, 'jake', { req: 'm_copter', desc: () => 'Shape Shield bounces enemy projectiles back at them.', stats: () => ({ shieldReflect: 1 }) });
  N('shapeshifter', 'm_mind', 4, 1, 'Mathematical Mind', 2, 'both', { desc: (r) => `The super meter fills ${20 * r}% faster.`, stats: (r) => ({ meterGain: 0.2 * r }) });
  N('shapeshifter', 'm_tricks', 4, 2, 'Dog Tricks', 2, 'jake', { desc: (r) => `When hit, Jake has a ${12 * r}% chance to bounce away unharmed.`, stats: (r) => ({ blinkChance: 0.12 * r }) });

  /* Bros (both) */
  N('bros', 'b_tag', 1, 0, 'Tag Team', 3, 'team', { desc: (r) => `Tagging in strikes every nearby enemy for ${100 + 50 * r}% damage.`, stats: (r) => ({ tagStrike: 1 + 0.5 * r }) });
  N('bros', 'b_fist', 1, 1, 'Brofist', 1, 'both', { ability: 'brofist' });
  N('bros', 'b_bond', 1, 2, 'Brotherly Bond', 3, 'both', { desc: (r) => `Both heroes get ${5 * r}% more max HP and deal ${3 * r}% more damage.`, stats: (r) => ({ hpPct: 0.05 * r, dmg: 0.03 * r }) });
  N('bros', 'b_fastball', 2, 0, 'Fastball Special', 1, 'both', { req: 'b_fist', ability: 'fastball' });
  N('bros', 'b_quick', 2, 1, 'Quick Tag', 2, 'team', { desc: (r) => `Tag switching recharges ${(0.6 * r).toFixed(1)} seconds faster.`, stats: (r) => ({ switchCd: 0.6 * r }) });
  N('bros', 'b_watch', 2, 2, 'Watch Your Back', 2, 'both', { desc: (r) => `Your following buddy takes ${20 * r}% less damage.`, stats: (r) => ({ companionArmor: 0.2 * r }) });
  N('bros', 'b_energy', 3, 0, 'Algebraic Energy', 3, 'both', { desc: (r) => `The super meter fills ${15 * r}% faster.`, stats: (r) => ({ meterGain: 0.15 * r }) });
  N('bros', 'b_never', 3, 1, 'Never Leave a Bro', 1, 'team', { desc: () => 'A knocked-out buddy wakes up on their own after 12 seconds.', stats: () => ({ autoRevive: 1 }) });
  N('bros', 'b_share', 3, 2, 'Shared Spirit', 2, 'team', { desc: (r) => `${10 * r}% of all healing a hero receives also heals their buddy.`, stats: (r) => ({ healShare: 0.1 * r }) });
  N('bros', 'b_ultra', 4, 0, 'Ultra Mathematical', 1, 'team', { req: 'b_energy', desc: () => 'MATHEMATICAL! lasts 50% longer and sprays sword beams.', stats: () => ({ ultraSuper: 1 }) });
  N('bros', 'b_rad', 4, 1, 'Rad Loot', 2, 'team', { desc: (r) => `+${10 * r}% luck and +${10 * r}% gold.`, stats: (r) => ({ luck: 0.1 * r, goldFind: 0.1 * r }) });
  N('bros', 'b_bff', 4, 2, 'Best Friends Forever', 1, 'team', { desc: () => 'When your buddy is knocked out, you deal 50% more damage and move 50% faster for 10 seconds.', stats: () => ({ bffRage: 1 }) });

  D.SKILLS = S;
  D.SKILL_LIST = Object.values(S);

  D.ABILITIES = {
    sword_spin:    { hero: 'finn', name: 'Sword Spin',       icon: 'refresh', cd: 6,  dmg: 1.6, radius: 3,   desc: 'Spin in a full circle: 160% damage to everything around Finn.' },
    heros_leap:    { hero: 'finn', name: "Hero's Leap",      icon: 'star',    cd: 9,  dmg: 2.0, radius: 2.8, range: 7, stun: 0.8, desc: 'Leap to where you aim and slam down: 200% damage and a short stun.' },
    sword_beam:    { hero: 'finn', name: 'Sword Beam',       icon: 'bolt',    cd: 4,  dmg: 1.4, range: 14, desc: 'Fire a piercing beam of sword energy: 140% damage to everything in a line.' },
    battle_cry:    { hero: 'finn', name: 'Battle Cry',       icon: 'music',   cd: 14, dur: 6, desc: 'Both heroes deal 35% more damage and move 20% faster for 6 seconds.' },
    pancake_toss:  { hero: 'finn', name: 'Bacon Pancakes',   icon: 'pancake', cd: 16, dur: 5, radius: 2.6, desc: 'Drop a stack of pancakes: heroes nearby heal 5% of max HP per second for 5 seconds.' },
    hero_trap:     { hero: 'finn', name: 'Hero Trap',        icon: 'trap',    cd: 8,  dmg: 1.2, root: 2.5, desc: 'Set a trap. The first enemy to step on it takes 120% damage and is rooted for 2.5 seconds.' },
    stretchy_slam: { hero: 'jake', name: 'Stretchy Slam',    icon: 'fist',    cd: 7,  dmg: 2.4, radius: 3, delay: 0.45, desc: 'A giant fist crashes down where you aim: 240% damage in a wide circle.' },
    stretch_grab:  { hero: 'jake', name: 'Stretch Grab',     icon: 'hand',    cd: 6,  dmg: 1.0, range: 9, stun: 1, desc: 'Shoot out an arm, grab the first enemy it touches and yank it close: 100% damage and a 1 second stun.' },
    giant_jake:    { hero: 'jake', name: 'Giant Jake',       icon: 'star',    cd: 20, dur: 8, desc: 'Grow huge for 8 seconds: +60% damage, +40% reach, +30% armor.' },
    shape_shield:  { hero: 'jake', name: 'Shape Shield',     icon: 'shield',  cd: 15, dur: 5, desc: 'Wrap both heroes in stretchy shields that soak up damage equal to 40% of Jake’s max HP for 5 seconds.' },
    bouncy_ball:   { hero: 'jake', name: 'Bouncy Ball',      icon: 'ball',    cd: 7,  dmg: 1.5, range: 9, desc: 'Roll into a ball and bounce forward, bowling over enemies for 150% damage.' },
    copter_arms:   { hero: 'jake', name: 'Helicopter Arms',  icon: 'wind',    cd: 12, dur: 3, dmg: 0.45, radius: 2.6, desc: 'Spin your arms like rotor blades for 3 seconds: 45% damage to everything nearby four times a second, and +20% speed.' },
    brofist:       { hero: 'both', name: 'Brofist',          icon: 'heart',   cd: 18, desc: 'Bump fists: both heroes heal 25% of max HP and shake off every bad effect.' },
    fastball:      { hero: 'both', name: 'Fastball Special', icon: 'ball',    cd: 10, dmg: 2.2, radius: 3, range: 8, desc: 'One hero hurls the other at your aim point: 220% damage where they land.' },
  };
  D.SUPER = { name: 'MATHEMATICAL!', desc: 'When the meter is full, Finn rides Jake in an unstoppable charge that tramples everything in its path.' };
  D.fmtP = p;
})();
