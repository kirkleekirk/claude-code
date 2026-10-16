// Avion armory. Every weapon is named for a bird of prey; sounds come from Snake's packs.
// damage = per pellet/bullet at close range. range = [falloffStart, falloffEnd, minMultiplier].
// reloadSeq entries: [time (s), sound, condition] where condition 'empty' only plays on an empty reload.

export const WEAPONS = {
  merlin: {
    name: 'M45 MERLIN', cls: 'PISTOL', model: 'pistol', cost: 0,
    damage: 48, headMult: 3.0, rpm: 400, mode: 'semi', mag: 8, reserve: 72,
    reload: 1.35, reloadEmpty: 1.7, spreadHip: 2.0, spreadAds: 0.2, recoil: 1.4, moveMul: 1.0,
    adsTime: 0.15, zoom: 1.15, range: [18, 45, 0.6], pen: 1,
    sound: { fire: 'fire_9mm', vol: 0.7, rate: 1.06 },
    reloadSeq: [[0.12, 'pistol_magout'], [0.7, 'pistol_magin'], [1.3, 'pistol_slide', 'empty']],
    up: { name: "MERLIN'S FURY", explosive: 2.2, mag: 12, reserve: 120 },
  },
  condor: {
    name: '.44 CONDOR', cls: 'REVOLVER', model: 'revolver', cost: 0,
    damage: 210, headMult: 3.5, rpm: 160, mode: 'semi', mag: 6, reserve: 48,
    reload: 2.6, reloadEmpty: 2.6, spreadHip: 2.4, spreadAds: 0.18, recoil: 4.2, moveMul: 0.98,
    adsTime: 0.18, zoom: 1.2, range: [25, 60, 0.7], pen: 3,
    sound: { fire: 'fire_308', vol: 0.95, rate: 1.12 },
    reloadSeq: [[0.15, 'rev_open'], [0.45, 'rev_eject'], [1.3, 'rev_load'], [1.6, 'rev_load'], [1.9, 'rev_load'], [2.3, 'rev_close']],
    reloadStyle: 'revolver',
    up: { name: "CONDOR'S CALL", mag: 8, reserve: 72, explosive: 3.0 },
  },
  wren: {
    name: 'MP-22 WREN', cls: 'PDW', model: 'pdw', cost: 1000, ammoCost: 500,
    damage: 34, headMult: 2.4, rpm: 1050, mode: 'auto', mag: 40, reserve: 280,
    reload: 2.0, reloadEmpty: 2.4, spreadHip: 3.2, spreadAds: 0.55, recoil: 0.45, moveMul: 1.0,
    adsTime: 0.14, zoom: 1.2, range: [14, 35, 0.55], pen: 1,
    sound: { fire: 'fire_22', vol: 0.62, rate: 1.0, tail: 'tail_22' },
    reloadSeq: [[0.2, 'rim_magout'], [0.85, 'rim_magin'], [1.75, 'rim_rack', 'empty']],
    up: { name: "WREN'S NEST", mag: 60, reserve: 420 },
  },
  kestrel: {
    name: 'KV-9 KESTREL', cls: 'SMG', model: 'smg', cost: 1200, ammoCost: 600,
    damage: 52, headMult: 2.5, rpm: 850, mode: 'auto', mag: 32, reserve: 256,
    reload: 2.1, reloadEmpty: 2.5, spreadHip: 2.8, spreadAds: 0.45, recoil: 0.7, moveMul: 0.98,
    adsTime: 0.16, zoom: 1.25, range: [16, 40, 0.55], pen: 1,
    sound: { fire: 'fire_9mm_dry', vol: 0.68, rate: 1.04, tail: 'tail_9mm' },
    reloadSeq: [[0.2, 'smg_magout'], [0.9, 'smg_magin'], [1.8, 'pistol_rack', 'empty']],
    up: { name: 'KESTREL REAPER', mag: 45, reserve: 360 },
  },
  shrike: {
    name: 'S-20 SHRIKE', cls: 'SHOTGUN', model: 'shotgun', cost: 1500, ammoCost: 750,
    damage: 60, headMult: 1.8, rpm: 72, mode: 'pump', mag: 6, reserve: 54, pellets: 8, pelletSpread: 4.2,
    reload: 0.48, reloadStyle: 'shell', spreadHip: 1.2, spreadAds: 0.8, recoil: 5.2, moveMul: 0.95,
    adsTime: 0.2, zoom: 1.15, range: [7, 20, 0.25], pen: 2,
    sound: { fire: 'fire_20g', vol: 0.95, rate: 1.0, cycle: 'pump', cycleAt: 0.32 },
    reloadSeq: [[0.08, 'shell_load']], reloadEndSeq: [[0.1, 'pump_slow']],
    up: { name: 'BUTCHERBIRD', mag: 10, reserve: 90, pellets: 10 },
  },
  harrier: {
    name: 'AR-56 HARRIER', cls: 'ASSAULT RIFLE', model: 'ar', cost: 2000, ammoCost: 1000,
    damage: 84, headMult: 2.4, rpm: 720, mode: 'auto', mag: 30, reserve: 240,
    reload: 2.3, reloadEmpty: 2.75, spreadHip: 3.0, spreadAds: 0.3, recoil: 0.85, moveMul: 0.93,
    adsTime: 0.22, zoom: 1.35, range: [30, 70, 0.7], pen: 2,
    sound: { fire: 'fire_556', vol: 0.72, rate: 1.0, tail: 'tail_556' },
    reloadSeq: [[0.25, 'ar_magout'], [1.0, 'ar_magin'], [2.05, 'ar_boltrelease', 'empty']],
    up: { name: 'SKY HARRIER', mag: 40, reserve: 360 },
  },
  goshawk: {
    name: 'AK-12 GOSHAWK', cls: 'ASSAULT RIFLE', model: 'ak', cost: 1800, ammoCost: 900,
    damage: 98, headMult: 2.4, rpm: 620, mode: 'auto', mag: 30, reserve: 210,
    reload: 2.4, reloadEmpty: 2.9, spreadHip: 3.2, spreadAds: 0.4, recoil: 1.15, moveMul: 0.92,
    adsTime: 0.23, zoom: 1.3, range: [28, 65, 0.7], pen: 2,
    sound: { fire: 'fire_762', vol: 0.78, rate: 1.0, tail: 'tail_762' },
    reloadSeq: [[0.25, 'ak_magout'], [1.05, 'ak_magin'], [2.1, 'ak_rack', 'empty']],
    up: { name: 'GOSHAWK TALON', mag: 45, reserve: 315 },
  },
  osprey: {
    name: 'MR-308 OSPREY', cls: 'MARKSMAN', model: 'dmr', cost: 1500, ammoCost: 750,
    damage: 180, headMult: 3.0, rpm: 320, mode: 'semi', mag: 15, reserve: 120,
    reload: 2.4, reloadEmpty: 2.9, spreadHip: 3.6, spreadAds: 0.08, recoil: 2.6, moveMul: 0.9,
    adsTime: 0.26, zoom: 2.2, scope: 'acog', range: [50, 120, 0.8], pen: 4,
    sound: { fire: 'fire_308', vol: 0.9, rate: 1.0 },
    reloadSeq: [[0.25, 'dmr_magout'], [1.1, 'dmr_magin'], [2.0, 'ar_charge', 'empty']],
    up: { name: 'OSPREY DIVE', mag: 20, reserve: 180 },
  },
  heron: {
    name: 'M-54 HERON', cls: 'SNIPER', model: 'sniper', cost: 1500, ammoCost: 750,
    damage: 600, headMult: 4.0, rpm: 48, mode: 'bolt', mag: 5, reserve: 45,
    reload: 3.0, reloadEmpty: 3.0, spreadHip: 6, spreadAds: 0.0, recoil: 5.5, moveMul: 0.86,
    adsTime: 0.32, zoom: 4.0, scope: 'sniper', range: [80, 200, 0.9], pen: 6,
    sound: { fire: 'fire_762r_full', vol: 1.0, rate: 1.0, cycle: 'bolt_cycle', cycleAt: 0.3 },
    reloadSeq: [[0.3, 'bolt_cycle'], [1.2, 'bolt_load'], [2.3, 'bolt_cycle']],
    up: { name: 'GREAT BLUE', mag: 8, reserve: 72, explosive: 3.2 },
  },
  owl: {
    name: '1894 OWL', cls: 'LEVER-ACTION', model: 'lever', cost: 500, ammoCost: 250,
    damage: 135, headMult: 3.2, rpm: 90, mode: 'lever', mag: 7, reserve: 63,
    reload: 0.55, reloadStyle: 'shell', spreadHip: 2.6, spreadAds: 0.12, recoil: 3.4, moveMul: 0.96,
    adsTime: 0.22, zoom: 1.45, range: [30, 70, 0.75], pen: 3,
    sound: { fire: 'fire_762_full', vol: 0.9, rate: 1.1, cycle: 'lever_cycle', cycleAt: 0.24 },
    reloadSeq: [[0.12, 'lever_load']], reloadEndSeq: [[0.05, 'lever_cycle']],
    up: { name: 'GREAT HORNED', mag: 12, reserve: 120, explosive: 2.0 },
  },
  albatross: {
    name: 'LMG-7 ALBATROSS', cls: 'LMG', model: 'lmg', cost: 0,
    damage: 110, headMult: 2.2, rpm: 760, mode: 'auto', mag: 100, reserve: 400,
    reload: 4.4, reloadEmpty: 4.8, spreadHip: 4.0, spreadAds: 0.6, recoil: 1.1, moveMul: 0.82,
    adsTime: 0.32, zoom: 1.35, range: [35, 80, 0.75], pen: 3,
    sound: { fire: 'fire_762r', vol: 0.82, rate: 0.97, tail: 'tail_762r' },
    reloadSeq: [[0.15, 'lmg_raise'], [1.0, 'ak_magout'], [1.8, 'mag_pouch'], [2.6, 'ak_magin'], [3.6, 'lmg_deploy']],
    up: { name: 'WANDERING ALBATROSS', mag: 150, reserve: 600 },
  },
  helios: {
    name: 'HELIOS MWG', cls: 'WONDER WEAPON', model: 'helios', cost: 0, wonder: true,
    damage: 2200, headMult: 1, rpm: 70, mode: 'beam', mag: 6, reserve: 30, beamRange: 14, beamAngle: 26,
    reload: 2.8, reloadEmpty: 2.8, spreadHip: 0, spreadAds: 0, recoil: 3.0, moveMul: 0.9,
    adsTime: 0.22, zoom: 1.15, range: [14, 14, 1], pen: 99,
    sound: { fire: 'helios_fire', vol: 1.0, rate: 1.0 },
    reloadSeq: [[0.3, 'mag_pouch2'], [1.0, 'exo_equip'], [2.3, 'ar_charge']],
    up: { name: 'HELIOS PRIME', mag: 10, reserve: 50, beamRange: 18, beamAngle: 36 },
  },
};

// Weighted 3D-printer (mystery box) pool. 'lure' is the tactical decoy drone.
export const BOX_POOL = [
  ['helios', 0.55], ['albatross', 1.2], ['condor', 1.2], ['wren', 0.9], ['kestrel', 0.9], ['shrike', 1.0],
  ['harrier', 1.0], ['goshawk', 1.0], ['osprey', 1.0], ['heron', 0.9], ['owl', 0.6], ['lure', 1.0],
];

export const UPGRADE_COSTS = [5000, 7500, 10000];
export const UPGRADE_SUFFIX = ['', '', ' MK-III', ' MK-IV'];
export const UPGRADE_DAMAGE = [1, 2.0, 3.0, 4.5];

export const PERKS = {
  health: { name: 'EXO HEALTH', cost: 2500, color: '#d8423a', desc: 'Armored plating: survive far more hits.', jingle: 'jingle_health', icon: 'health' },
  reload: { name: 'EXO RELOAD', cost: 3000, color: '#3fc79a', desc: 'Servo-assisted hands: reload twice as fast.', jingle: 'jingle_reload', icon: 'reload' },
  medic: { name: 'EXO MEDIC', cost: 500, color: '#3aa8e8', desc: 'Auto-injector: get back up when you go down (3 uses).', jingle: 'jingle_medic', icon: 'medic', noPower: true },
  slam: { name: 'EXO SLAM', cost: 2000, color: '#f08a2c', desc: 'Weaponized ground pound. Crouch in the air to slam.', jingle: 'jingle_slam', icon: 'slam' },
  stabilizer: { name: 'EXO STABILIZER', cost: 2000, color: '#e6c84a', desc: 'Gyro rig: less recoil, tighter aim, bigger headshots.', jingle: 'jingle_stabilizer', icon: 'stabilizer' },
  velocity: { name: 'EXO VELOCITY', cost: 2000, color: '#a77af0', desc: 'Faster movement, faster dodge recharge.', jingle: 'jingle_velocity', icon: 'velocity' },
};

export function weaponStats(id, level = 0) {
  const base = WEAPONS[id];
  if (!level) return { ...base, id, level: 0 };
  const up = base.up || {};
  const s = { ...base, ...up, id, level };
  s.name = (up.name || base.name) + UPGRADE_SUFFIX[level];
  s.damage = base.damage * UPGRADE_DAMAGE[level] * (base.wonder ? 1.2 : 1);
  s.mag = Math.round((up.mag || base.mag) * (level >= 3 ? 1.25 : 1));
  s.reserve = Math.round((up.reserve || base.reserve) * (level >= 2 ? 1.25 : 1));
  s.rpm = base.rpm * (level >= 2 ? 1.12 : 1);
  return s;
}
