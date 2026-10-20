// Balance table. Every hero is deliberately over-the-top: high damage, short
// cooldowns and big mobility, offset against each other. Healing is weak on
// purpose: everyone has self-sustain, so a "healer" helps through abilities
// (shields, damage amp, burst heal, revive) rather than by healbotting.

export const HEROES = {
  invincible: {
    key: 'invincible', name: 'INVINCIBLE', real: 'Mark Grayson',
    role: 'DUELIST', roleTag: 'Flying Dive DPS',
    color: '#ffd400', accent: '#00aeef',
    hp: 375,
    radius: 0.42, height: 1.85,
    speed: 9.2, jump: 10.5,
    flight: { speed: 21, accel: 46, unlimited: true },
    regen: { delay: 4, rate: 35 },
    camDist: 4.1, camHeight: 1.55,
    ultCost: 2000,
    passive: { name: 'Viltrumite Physiology', desc: 'Unlimited flight. Regenerates 35 HP/s after 4s without taking damage.' },
    abilities: {
      primary: { name: 'Viltrumite Barrage', key: 'LMB', icon: 'fist', desc: '4-hit combo (34/34/40/62) that lunges onto enemies near your crosshair. Finisher launches.' },
      secondary: { name: 'Shockwave Clap', key: 'RMB', icon: 'clap', cd: 3.5, charges: 2, desc: 'Clap a 16m cone shockwave for 55 damage and knockback. 2 charges.' },
      a1: { name: 'Sonic Boom Dash', key: 'SHIFT', icon: 'dash', cd: 6, desc: 'Break the sound barrier: dash 32m, 65 damage to everyone in the path.' },
      a2: { name: 'Meteor Dive', key: 'E', icon: 'meteor', cd: 9, desc: 'Dive at the target point (up to 45m). 95 damage in 6m and knock-up.' },
      a3: { name: 'Skyward Slam', key: 'F', icon: 'grab', cd: 12, desc: 'Grab an enemy, rocket upward and slam them into the ground for 110 damage + stun.' },
      ult: { name: 'MACH BREAKER', key: 'Q', icon: 'ult_inv', desc: 'Rocket into the stratosphere, pick a target, and crash down at Mach 10: up to 420 damage in an 11m crater.' },
    },
  },
  eve: {
    key: 'eve', name: 'ATOM EVE', real: 'Samantha Eve Wilkins',
    role: 'STRATEGIST', roleTag: 'Shields & Support',
    color: '#ff4fd8', accent: '#ffd1f4',
    hp: 300,
    radius: 0.38, height: 1.74,
    speed: 8.0, jump: 9.5,
    flight: { speed: 15, accel: 34, duration: 7, regen: 1.6, unlimited: false },
    regen: { delay: 3, rate: 20 },
    camDist: 3.8, camHeight: 1.5,
    ultCost: 2200,
    passive: { name: 'Matter Reconstruction', desc: 'Flies on atomic energy (7s). Regenerates 20 HP/s after 3s. Bolts that hit near allies mend them slightly.' },
    abilities: {
      primary: { name: 'Particle Bolts', key: 'LMB', icon: 'bolt', desc: 'Rapid pink bolts, 24 damage each. Splash mends nearby allies for only 5 HP: shooting enemies is the real support.' },
      secondary: { name: 'Construct Fist', key: 'RMB', icon: 'cfist', cd: 6, desc: 'Fire a giant energy fist: 90 damage and heavy knockback.' },
      a1: { name: 'Atomic Bubble', key: 'SHIFT', icon: 'bubble', cd: 11, charges: 2, desc: 'Bubble the ally under your crosshair (or yourself): absorbs 225 damage for 4s. 2 charges.' },
      a2: { name: 'Disassembly Field', key: 'E', icon: 'field', cd: 12, desc: 'Throw an orb that unravels matter: enemies inside take +25% damage from ALL sources and are slowed.' },
      a3: { name: 'Restoration Pulse', key: 'F', icon: 'pulse', cd: 14, desc: 'Burst-heal allies within 15m for 80 (+40 over 2s) and cleanse slows.' },
      ult: { name: 'UNBOUND', key: 'Q', icon: 'ult_eve', desc: 'Break the mental block. Then choose: LMB Annihilation Beam (giant beam, 420 DPS) or RMB Reconstruction (revive ALL fallen allies + team-wide bubbles and heal).' },
    },
  },
  omniman: {
    key: 'omniman', name: 'OMNI-MAN', real: 'Nolan Grayson',
    role: 'VANGUARD', roleTag: 'Brawler Tank',
    color: '#e8212e', accent: '#f2f2f2',
    hp: 650,
    radius: 0.5, height: 1.98,
    speed: 8.8, jump: 11,
    flight: { speed: 17, accel: 40, duration: 8, regen: 1.5, unlimited: false },
    regen: { delay: 6, rate: 15 },
    camDist: 4.7, camHeight: 1.75,
    ultCost: 2400,
    passive: { name: 'Viltrumite Conqueror', desc: 'Heals for 25% of all damage dealt. Unstoppable: immune to knockback and slows. Flies for 8s.' },
    abilities: {
      primary: { name: 'Brutal Strikes', key: 'LMB', icon: 'fist', desc: '3-hit cleaving combo (58/58/96). The hammer-fist finisher sends out a ground shock.' },
      secondary: { name: 'Seismic Boulder', key: 'RMB', icon: 'boulder', cd: 5, desc: 'Rip a chunk of earth and hurl it: 105 damage + 45 splash.' },
      a1: { name: 'Viltrumite Charge', key: 'SHIFT', icon: 'charge', cd: 7, desc: 'Charge 24m, carrying the first enemy hit and slamming them for 120 total damage.' },
      a2: { name: 'Thunderclap', key: 'E', icon: 'clap', cd: 9, desc: 'Massive clap: 22m cone, 85 damage, huge knockback and 30% slow.' },
      a3: { name: "Conqueror's Will", key: 'F', icon: 'roar', cd: 16, desc: 'Gain 225 overhealth, +20% damage and 30% damage reduction for 4s.' },
      ult: { name: 'A FRACTION OF OUR POWER', key: 'Q', icon: 'ult_omni', desc: 'Blitz between up to 5 enemies within 40m, 150 damage each, ending in a thunderclap.' },
    },
  },
};

export const HERO_KEYS = ['invincible', 'eve', 'omniman'];

export const RULES = {
  respawn: 7,
  orbHeal: 150,
  orbRespawn: 15,
  ultPerDamage: 1,
  ultPerHeal: 1,
  ultPerShield: 0.8,
  ultPassive: 6, // points / s
  killUlt: 120,
};
