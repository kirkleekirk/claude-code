/* Active abilities. src 'tree' = unlocked in a skill tree; src 'item' = comes with a unique item and
   leaves your ability bar when the item is unequipped. Damage numbers are multiples of your hit damage.
   target: 'self' (around you), 'aim' (where the crosshair points on the floor), 'dir' (in the aim direction). */
(function () {
  'use strict';
  const D = DT.data;

  D.ABILITIES = {
    /* ---------- Finn (skill tree) ---------- */
    sword_spin:   { hero: 'finn', src: 'tree', name: 'Sword Spin', icon: 'spin', cd: 6, dmg: 1.6, radius: 3.0, target: 'self',
      desc: 'Spin in a full circle, hitting everything around you for 160% damage.' },
    heros_leap:   { hero: 'finn', src: 'tree', name: 'Hero’s Leap', icon: 'arrowUp', cd: 9, dmg: 2.0, radius: 2.8, range: 9, stun: 0.8, target: 'aim',
      desc: 'Leap to where you aim and slam down: 200% damage around you and a short Stun.' },
    sword_beam:   { hero: 'finn', src: 'tree', name: 'Sword Beam', icon: 'bolt', cd: 4, dmg: 1.5, range: 14, target: 'dir',
      desc: 'Fire a beam of sword energy that flies through every enemy in a line for 150% damage.' },
    battle_cry:   { hero: 'finn', src: 'tree', name: 'Battle Cry', icon: 'volume', cd: 14, dur: 6, target: 'self',
      desc: 'Yell really loud: +35% damage and +20% move speed for 6 seconds.' },
    pancake_toss: { hero: 'finn', src: 'tree', name: 'Bacon Pancakes', icon: 'pancake', cd: 16, dur: 5, radius: 2.8, target: 'self',
      desc: 'Drop a stack of Bacon Pancakes. Standing near it heals 6% of your max health every second for 5 seconds.' },
    hero_trap:    { hero: 'finn', src: 'tree', name: 'Hero Trap', icon: 'trap', cd: 8, dmg: 1.2, root: 2.5, target: 'self',
      desc: 'Set a trap at your feet. The first enemy to step on it takes 120% damage and is Rooted for 2.5 seconds. Up to 3 traps at once.' },
    shield_bash:  { hero: 'finn', src: 'tree', name: 'Shield Bash', icon: 'shield', cd: 8, dmg: 1.4, range: 5.5, stun: 1.2, target: 'dir',
      desc: 'Charge forward, bashing enemies out of the way: 140% damage and a 1.2 second Stun.' },
    grapple:      { hero: 'finn', src: 'tree', name: 'Grappling Hook', icon: 'hook', cd: 7, dmg: 1.3, range: 12, stun: 0.8, target: 'dir',
      desc: 'Fire a grappling hook where you aim. If it catches an enemy, you zip to it and strike for 130% damage. If not, you zip to where it landed.' },
    parry:        { hero: 'finn', src: 'tree', name: 'Perfect Parry', icon: 'shield', cd: 10, dur: 1.0, dmg: 2.5, radius: 3.2, target: 'self',
      desc: 'Raise your guard for 1 second. If anything hits you, you block it completely and counterattack everything around you for 250% damage.' },

    /* ---------- Jake (skill tree) ---------- */
    stretchy_slam: { hero: 'jake', src: 'tree', name: 'Stretchy Slam', icon: 'fist', cd: 7, dmg: 2.4, radius: 3.0, delay: 0.45, range: 10, target: 'aim',
      desc: 'A giant fist crashes down where you aim: 240% damage in a wide circle.' },
    stretch_grab:  { hero: 'jake', src: 'tree', name: 'Stretch Grab', icon: 'hand', cd: 6, dmg: 1.0, range: 10, stun: 1.0, target: 'dir',
      desc: 'Shoot out an arm, grab the first enemy it touches and yank it to you: 100% damage and a 1 second Stun.' },
    giant_jake:    { hero: 'jake', src: 'tree', name: 'Giant Jake', icon: 'arrowUp', cd: 20, dur: 8, target: 'self',
      desc: 'Grow huge for 8 seconds: +60% damage, +40% reach and +30% armor.' },
    shape_shield:  { hero: 'jake', src: 'tree', name: 'Shape Shield', icon: 'shield', cd: 15, dur: 5, target: 'self',
      desc: 'Stretch into a shield that soaks up damage equal to 40% of your max health for 5 seconds.' },
    bouncy_ball:   { hero: 'jake', src: 'tree', name: 'Bouncy Ball', icon: 'ball', cd: 7, dmg: 1.5, range: 10, target: 'dir',
      desc: 'Roll into a ball and bounce forward, bowling over enemies for 150% damage.' },
    copter_arms:   { hero: 'jake', src: 'tree', name: 'Helicopter Arms', icon: 'wind', cd: 12, dur: 3, dmg: 0.45, radius: 2.8, target: 'self',
      desc: 'Spin your arms like helicopter blades for 3 seconds: 45% damage to everything nearby four times a second, and +20% move speed.' },
    fist_rain:     { hero: 'jake', src: 'tree', name: 'Fist Rain', icon: 'rain', cd: 14, dmg: 0.9, radius: 4, count: 8, range: 12, target: 'aim',
      desc: 'Eight giant fists rain down around where you aim over 1.6 seconds, each hitting for 90% damage.' },
    stretchy_lasso:{ hero: 'jake', src: 'tree', name: 'Stretchy Lasso', icon: 'refresh', cd: 10, dmg: 0.8, range: 8, arc: 110, stun: 0.6, target: 'dir',
      desc: 'Stretch your arms into a lasso that grabs every enemy in front of you and squishes them together: 80% damage and a short Stun.' },
    doggy_howl:    { hero: 'jake', src: 'tree', name: 'Doggy Howl', icon: 'ghost', cd: 16, dur: 3, radius: 7, target: 'self',
      desc: 'Let out a terrifying howl. Nearby enemies run away in Fear for 3 seconds and take 25% more damage.' },

    /* ---------- abilities that come with unique items ---------- */
    blood_rush:   { hero: 'finn', src: 'item', name: 'Blood Rush', icon: 'dash', cd: 8, dmg: 1.2, range: 7, target: 'dir',
      desc: 'Dash forward through enemies, setting each one on fire and healing 4% of your max health for every enemy you pass through.' },
    root_snare:   { hero: 'finn', src: 'item', name: 'Root Snare', icon: 'vine', cd: 12, dmg: 1.0, radius: 4.5, root: 2.5, target: 'self',
      desc: 'Roots burst out of the floor around you: 100% damage, and every enemy nearby is Rooted for 2.5 seconds.' },
    grass_lash:   { hero: 'finn', src: 'item', name: 'Grass Lash', icon: 'vine', cd: 7, dmg: 1.4, range: 9, target: 'dir',
      desc: 'Whip a long grass vine forward: 140% damage to everything in a line, and it drags them to you.' },
    sword_storm:  { hero: 'finn', src: 'item', name: 'Sword Storm', icon: 'sparkle', cd: 18, dur: 3, dmg: 0.6, target: 'self',
      desc: 'For 3 seconds, fire 8 sword beams in every direction, again and again. Each beam hits for 60% damage.' },
    crystal_shell:{ hero: 'finn', src: 'item', name: 'Crystal Shell', icon: 'crystal', cd: 16, dur: 1.5, dmg: 2.0, radius: 4, target: 'self',
      desc: 'Turn into crystal: nothing can hurt you for 1.5 seconds, then the shell bursts for 200% damage around you.' },
    rocket_jump:  { hero: 'finn', src: 'item', name: 'Rocket Jump', icon: 'arrowUp', cd: 9, dmg: 1.8, radius: 3, range: 9, target: 'aim',
      desc: 'Blast off with your jet boots and land where you aim with an explosion: 180% damage.' },
    serenade:     { hero: 'jake', src: 'item', name: 'Serenade', icon: 'moon', cd: 18, dur: 3, radius: 6, heal: 0.12, target: 'self',
      desc: 'Play a sleepy song. Enemies nearby fall asleep (Stunned) for 3 seconds, and you heal 12% of your max health.' },
    axe_chop:     { hero: 'jake', src: 'item', name: 'Axe Chop', icon: 'sword', cd: 10, dmg: 3.2, range: 6, stun: 1, target: 'dir',
      desc: 'Swing the Axe Bass over your head and CHOP: 320% damage in a line in front of you and a 1 second Stun.' },
    rock_out:     { hero: 'jake', src: 'item', name: 'Rock Out', icon: 'music', cd: 12, dmg: 0.9, radius: 5, target: 'self',
      desc: 'Shred a killer solo: three shockwaves ripple out around you, each hitting for 90% damage and knocking enemies back.' },
    doom_blast:   { hero: 'jake', src: 'item', name: 'Doom Blast', icon: 'volume', cd: 14, dmg: 2.5, range: 10, freeze: 2, target: 'dir',
      desc: 'Blow the Guardian’s Horn: a huge cone blast for 250% damage that Freezes everything it hits for 2 seconds.' },
    soul_suck:    { hero: 'any', src: 'item', name: 'Soul Suck', icon: 'ghost', cd: 16, dur: 1.5, radius: 7, dmg: 0.6, target: 'self',
      desc: 'Open a tiny Nightosphere portal: enemies around you get pulled in and drained for 60% damage four times a second, and you heal for 20% of it.' },
    frost_nova:   { hero: 'any', src: 'item', name: 'Frost Nova', icon: 'snow', cd: 14, dmg: 1.2, radius: 6, freeze: 2.5, target: 'self',
      desc: 'Blast a ring of ice: 120% damage, and every enemy nearby is Frozen for 2.5 seconds.' },
  };
})();
