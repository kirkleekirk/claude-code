// Awards: milestones kept across every world you play (your furthest trip and longest life are
// bests; kills, digging, building and the rest add up). Kept in localStorage when it's there.

const KEY = 'starminer.awards';

export const AWARDS = [
  { id: 'steps', name: 'First Steps', desc: 'Travel 50 meters from the start tower', stat: 'maxDistance', goal: 50, best: true },
  { id: 'wanderer', name: 'Wanderer', desc: 'Travel 250 meters', stat: 'maxDistance', goal: 250, best: true },
  { id: 'desert', name: 'Dune Walker', desc: 'Reach the Desert, 950 meters out', stat: 'maxDistance', goal: 950, best: true },
  { id: 'peaks', name: 'Mountaineer', desc: 'Reach the Mountains, 1,600 meters out', stat: 'maxDistance', goal: 1600, best: true },
  { id: 'arctic', name: 'Frostbite', desc: 'Reach the Arctic, 2,300 meters out', stat: 'maxDistance', goal: 2300, best: true },
  { id: 'hell', name: 'Into The Fire', desc: 'Reach Hell, 3,400 meters out', stat: 'maxDistance', goal: 3400, best: true },
  { id: 'night', name: 'Survivor', desc: 'Live to see Day 2', stat: 'days', goal: 2, best: true },
  { id: 'week', name: 'Hard To Kill', desc: 'Live to see Day 7', stat: 'days', goal: 7, best: true },
  { id: 'month', name: 'Endurance', desc: 'Live to see Day 30', stat: 'days', goal: 30, best: true },
  { id: 'blood', name: 'First Blood', desc: 'Put down one of the dead', stat: 'kills', goal: 1 },
  { id: 'hunter', name: 'Hunter', desc: 'Kill 50 enemies', stat: 'kills', goal: 50 },
  { id: 'exterminator', name: 'Exterminator', desc: 'Kill 500 enemies', stat: 'kills', goal: 500 },
  { id: 'bones', name: 'Bone Collector', desc: 'Kill 10 skeletons', stat: 'skeletons', goal: 10 },
  { id: 'miner', name: 'Miner', desc: 'Dig 100 blocks', stat: 'dug', goal: 100 },
  { id: 'excavator', name: 'Excavator', desc: 'Dig 2,500 blocks', stat: 'dug', goal: 2500 },
  { id: 'builder', name: 'Builder', desc: 'Place 100 blocks', stat: 'placed', goal: 100 },
  { id: 'architect', name: 'Architect', desc: 'Place 1,000 blocks', stat: 'placed', goal: 1000 },
  { id: 'handy', name: 'Handy', desc: 'Craft 25 things', stat: 'crafted', goal: 25 },
  { id: 'gunsmith', name: 'Gunsmith', desc: 'Craft a gun', stat: 'guns', goal: 1 },
  { id: 'diamond', name: 'Diamonds!', desc: 'Dig up a diamond', stat: 'diamonds', goal: 1 },
  { id: 'trigger', name: 'Trigger Happy', desc: 'Fire 1,000 rounds', stat: 'shots', goal: 1000 },
];

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
    // bests: the furthest out, the most days
    for (const a of AWARDS) {
      if (!a.best) continue;
      const v = s[a.stat] || 0;
      if (v > (T[a.stat] || 0)) { T[a.stat] = v; this.dirty = true; }
    }
    // totals: what this game has added since last time (a loaded game starts from where it was)
    for (const k of new Set(AWARDS.filter((a) => !a.best).map((a) => a.stat))) {
      const v = s[k] || 0;
      const d = v - (last[k] ?? v);
      if (d > 0) { T[k] = (T[k] || 0) + d; this.dirty = true; }
      last[k] = v;
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

  save() {
    this.dirty = false;
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* storage blocked */ }
  }
}
