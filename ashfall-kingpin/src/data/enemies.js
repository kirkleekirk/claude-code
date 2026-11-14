// Enemy archetypes (10), bosses (3 rival leaders + the Chancellor) and faction compositions.
// speed in tiles/s; vision in tiles; acc 0..1 multiplies the gun's accuracy.

export const ARCHETYPES = {
  militia: { name: 'Militia Guard', hp: 60, speed: 2.4, vision: 8, hearing: 1, acc: 0.6, react: 0.7, gun: 'rebar_revolver', armor: 0, ai: 'standard', look: 'compact' },
  sniper: { name: 'Watchtower Sniper', hp: 50, speed: 0, vision: 15, hearing: 0.6, acc: 0.95, react: 1.1, gun: 'needle', armor: 0, ai: 'sniper', look: 'compact', telegraph: 0.9 },
  shield: { name: 'Shield Heavy', hp: 130, speed: 1.6, vision: 7, hearing: 0.8, acc: 0.5, react: 0.8, gun: 'pump_gutter', armor: 0.15, ai: 'shield', look: 'warden', shield: true },
  feral: { name: 'Feral Dog', hp: 22, speed: 4.0, vision: 6, hearing: 1.8, acc: 1, react: 0.4, melee: 6, armor: 0, ai: 'dog', dog: true },
  dog: { name: 'Guard Dog', hp: 35, speed: 5.2, vision: 6, hearing: 2.2, acc: 1, react: 0.3, melee: 9, armor: 0, ai: 'dog', dog: true },
  medic: { name: 'Medic', hp: 50, speed: 2.6, vision: 7, hearing: 1, acc: 0.45, react: 0.8, gun: 'pipe_pistol', armor: 0, ai: 'medic', look: 'compact', heals: 14 },
  captain: { name: 'Captain', hp: 95, speed: 2.4, vision: 9, hearing: 1.2, acc: 0.7, react: 0.6, gun: 'rustlers_lever', armor: 0.1, ai: 'captain', look: 'warden', buff: 0.2, calls: true },
  warden: { name: 'Warden Elite', hp: 115, speed: 2.8, vision: 10, hearing: 1.4, acc: 0.78, react: 0.5, gun: 'ironclad', armor: 0.3, ai: 'flanker', look: 'warden', grenades: true },
  brute: { name: 'Raider Brute', hp: 170, speed: 3.0, vision: 7, hearing: 1, acc: 1, react: 0.6, melee: 22, armor: 0.1, ai: 'charger', look: 'rustjaw' },
  zealot: { name: 'Cultist Zealot', hp: 55, speed: 3.0, vision: 8, hearing: 1, acc: 0.5, react: 0.5, gun: 'pipe_pistol', armor: 0, ai: 'zealot', look: 'ashchoir', molotov: true, fearless: true },
  bounty: { name: 'Bounty Hunter', hp: 95, speed: 2.9, vision: 11, hearing: 1.5, acc: 0.8, react: 0.45, gun: 'rustlers_lever', armor: 0.1, ai: 'flanker', look: 'bounty', smoke: true },
  scav: { name: 'Scavenger', hp: 45, speed: 2.6, vision: 7, hearing: 1, acc: 0.45, react: 0.8, gun: 'sawn_off', armor: 0, ai: 'standard', look: 'scav' },
  raider: { name: 'Rustjaw Raider', hp: 65, speed: 2.7, vision: 8, hearing: 1, acc: 0.55, react: 0.6, gun: 'rattler', armor: 0, ai: 'standard', look: 'rustjaw' },
  smuggler: { name: 'Pale Hand Smuggler', hp: 60, speed: 2.7, vision: 9, hearing: 1.2, acc: 0.65, react: 0.6, gun: 'quiet_hand', armor: 0, ai: 'flanker', look: 'palehand' },
};

export const BOSSES = {
  rustjaw: { name: 'Big Tooth Marlo', hp: 650, speed: 2.4, gun: 'hailstorm', armor: 0.2, look: { top: 'rust', top2: 'ink', topStyle: 'vest', hat: 5, hatC: 'heat', pants: 'wood', hairStyle: 2 }, phases: ['Suppressive fire and charges', 'Calls in three brutes', 'Enraged: faster fire, molotovs'] },
  palehand: { name: 'Iris Vane', hp: 480, speed: 3.2, gun: 'needle', armor: 0.1, look: { top: 'bone', top2: 'ink', topStyle: 'jacket', hat: 6, hatC: 'bone', pants: 'ink', hairStyle: 1 }, phases: ['Snipes from cover (laser telegraph)', 'Smoke and relocation with bodyguards', 'Closes in with a Quiet Hand'] },
  ashchoir: { name: 'Sister Cinder', hp: 540, speed: 2.6, gun: 'pipe_pistol', armor: 0.1, look: { top: 'ink', top2: 'heat', topStyle: 'robe', hat: 4, hatC: 'heat', pants: 'ink' }, phases: ['Molotov volleys', 'Sermon: zealots empowered, fire ring', 'Fire nova'] },
  compact: { name: 'Chancellor Orrin Hale', hp: 900, speed: 2.2, gun: 'warden_breaker', armor: 0.35, look: { top: 'teal', top2: 'gold', topStyle: 'armor', hat: 3, pants: 'ink' }, phases: ['Shielded by two pylons: destroy them', 'Warden-Breaker barrage', 'Calls the last Daybreak squads; artillery marks'] },
};

// Who spawns where. Settlements scale guard count with alarm/heat; camps by rival strength.
export const COMPOSITION = {
  compact: ['militia', 'militia', 'militia', 'dog', 'medic', 'captain', 'shield'],
  warden: ['warden', 'warden', 'shield', 'medic', 'captain'],
  rustjaw: ['raider', 'raider', 'brute', 'raider', 'dog'],
  palehand: ['smuggler', 'smuggler', 'smuggler', 'medic'],
  ashchoir: ['zealot', 'zealot', 'zealot', 'brute'],
  dogs: ['feral', 'feral', 'feral'],
  scav: ['scav', 'scav', 'feral', 'scav'],
  raiders: ['raider', 'raider', 'brute', 'scav'],
  zealots: ['zealot', 'zealot', 'scav'],
  elite: ['warden', 'bounty', 'shield', 'warden'],
};

export const FACTION_OF_LOOK = { compact: 'compact', warden: 'compact', rustjaw: 'rustjaw', palehand: 'palehand', ashchoir: 'ashchoir', scav: 'wild', bounty: 'bounty' };
