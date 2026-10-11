// Awards: the later CastleMiner Z's achievements (its CastleMinerZAchievementManager), with
// their names, goals and progress lines. Kept across every game you play, counted only in
// Endurance, as the original counts them: the furthest out and the deepest down are bests; the
// rest add up. Kept in localStorage when it's there.

const KEY = 'starminer.awards';

// stat: what it goes by; goal; best: a furthest-ever rather than a running total; unit (or one
// and many, or yes and no), for its progress line ("(3/100) Enemies Killed")
const award = (id, name, desc, stat, goal, extra = {}) => ({ id, name, desc, stat, goal, ...extra });

export const AWARDS = [
  // PlayTimeAchievement: hours online in Endurance
  award('timer1', 'Short Timer', 'Play Online For 1 Hours.', 'onlineTime', 3600, { hours: 1 }),
  award('timer10', 'Veteren MinerZ', 'Play Online For 10 Hours.', 'onlineTime', 36000, { hours: 10 }),
  award('timer100', 'MinerZ Potato', 'Play Online For 100 Hours.', 'onlineTime', 360000, { hours: 100 }),
  // DistaceTraveledAchievement: metres from the start
  ...[[50, 'First Contact'], [200, 'Leaving Home'], [1000, 'Desert Crawler'], [2300, 'Mountain Man'], [3000, 'Deep Freeze'], [3600, 'Hell On Earth'], [5000, 'Around the World']]
    .map(([d, name]) => award(`dist${d}`, name, `Travel At Least ${d}`, 'maxDistance', d, { best: true, unit: 'Distance Traveled' })),
  // DepthTraveledAchievement: metres below the old ground
  award('deep20', 'Deep Digger', 'Travel Down At Least 20', 'maxDepth', 20, { best: true, unit: 'Distance Traveled' }),
  award('deep40', 'Welcome To Hell', 'Travel Down At Least 40', 'maxDepth', 40, { best: true, unit: 'Distance Traveled' }),
  // DaysPastAchievement: days lived through
  ...[[1, 'Survived The Night'], [7, 'A Week Later'], [28, '28 Days Later'], [100, 'Survivor'], [196, '28 Weeks Later'], [365, 'Anniversary']]
    .map(([d, name]) => award(`days${d}`, name, `Survive for ${d} days`, 'daysSurvived', d, { unit: 'Days Survived' })),
  // TotalCraftedAchievement
  ...[[1, 'Tinkerer'], [100, 'Crafter'], [1000, 'Master Craftsman']].map(([n, name]) => award(`craft${n}`, name, `Craft ${n} items`, 'crafted', n, { unit: 'Items Crafted' })),
  // TotalKillsAchievement
  ...[[1, 'Self Defense'], [100, 'No Fear'], [1000, 'Zombie Slayer']].map(([n, name]) => award(`kills${n}`, name, `Kill ${n} Enemies`, 'kills', n, { unit: 'Enemies Killed' })),
  award('undead', 'Dragon Slayer', 'Kill The Undead Dragon', 'undeadDragonKills', 1, { yes: 'Undead Dragon Killed', no: 'Undead Dragon Not Killed' }),
  award('alien', 'Alien Encounter', 'Find An Alien', 'alienEncounters', 1, { one: 'Alien Encounter', many: 'Alien Encounters' }),
  award('laser', 'Alien Technology', 'Kill An Enemy With A Laser Weapon', 'laserKills', 1, { one: 'Enemy Killed', many: 'Enemies Killed' }),
  award('tnt', 'Demolition Expert', 'Craft TNT', 'tntCrafted', 1, { one: 'TNT Crafted', many: 'TNT Crafted' }),
  award('missile', 'Air Defense', 'Kill A Dragon With A Guided Missile', 'dragonsKilledWithGuidedMissile', 1, { one: 'Dragon Killed', many: 'Dragons Killed' }),
  award('fire', 'Fire In The Hole', 'Kill An Enemy With TNT', 'tntKills', 1, { one: 'Enemy Killed', many: 'Enemies Killed' }),
  award('boom', 'Boom', 'Kill An Enemy With A Grenade', 'grenadeKills', 1, { one: 'Enemy Killed', many: 'Enemies Killed' }),
];

// the original's ProgressTowardsUnlockMessage
export function progressLine(a, v) {
  if (a.hours) return `(${Math.floor(v / 3600)}/${a.hours}) hours played`;
  if (a.unit) return `(${Math.floor(v)}/${a.goal}) ${a.unit}`;
  if (a.yes) return v > 0 ? a.yes : a.no;
  return `${Math.floor(v)} ${v === 1 ? a.one : a.many}`;
}

export class Awards {
  constructor() {
    this.data = { unlocked: {}, totals: {} };
    try { Object.assign(this.data, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { /* storage blocked */ }
    this.data.unlocked ||= {};
    this.data.totals ||= {};
    this.seen = new WeakMap(); // game -> its stats when last counted
    this.t = 0;
    this.dirty = false;
  }

  value(a) { return this.data.totals[a.stat] || 0; }
  total(stat) { return this.data.totals[stat] || 0; }
  isUnlocked(a) { return !!this.data.unlocked[a.id]; }
  get count() { return AWARDS.filter((a) => this.isUnlocked(a)).length; }

  // Count what's happened in a game since the last look, and hand out what's been earned.
  check(game, dt = 0.016) {
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.5;
    const s = game.stats;
    const last = this.seen.get(game) || {};
    const T = this.data.totals;
    const stats = new Set(AWARDS.map((a) => a.stat));
    for (const k of stats) {
      const a = AWARDS.find((x) => x.stat === k), v = s[k] || 0;
      if (a.best) {
        // bests: the furthest out, the deepest down
        if (v > (T[k] || 0)) { T[k] = v; this.dirty = true; }
      } else {
        // totals: what this game has added since last time (a loaded game starts from where it was)
        const d = v - (last[k] ?? v);
        if (d > 0) { T[k] = (T[k] || 0) + d; this.dirty = true; }
        last[k] = v;
      }
    }
    this.seen.set(game, last);
    for (const a of AWARDS) {
      if (this.isUnlocked(a) || this.value(a) < a.goal) continue;
      this.data.unlocked[a.id] = Date.now();
      this.dirty = true;
      game.hud?.award(`Award: ${a.name}`, a.desc);
      game.audio?.award?.();
    }
    if (this.dirty) this.save();
  }

  // Erase Storage: every award and stat too
  erase() {
    this.data = { unlocked: {}, totals: {} };
    this.seen = new WeakMap();
    this.save();
  }

  save() {
    this.dirty = false;
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* storage blocked */ }
  }
}
