// Persistent player profile (localStorage). Everything is wrapped in try/catch so the
// game still runs in private windows / blocked storage.
import { DEFAULT_OWNED, DEFAULT_EQUIPPED } from '../data/cosmetics.js';

const KEY = 'greenfall.profile.v1';
const DEFAULTS = () => ({
  name: 'Survivor' + Math.floor(Math.random() * 9000 + 1000),
  shards: 1000,
  owned: [...DEFAULT_OWNED],
  equipped: { ...DEFAULT_EQUIPPED },
  level: 1, xp: 0,
  stats: { matches: 0, extractions: 0, kills: 0, zombieKills: 0, deaths: 0, timePlayed: 0, bestTime: 0, lootExtracted: 0, boatEscapes: 0, heliEscapes: 0 },
  settings: { quality: null, sens: 1, fov: 72, master: 0.8, sfx: 0.9, music: 0.5, ambient: 0.7, invertY: false, matchLength: 'standard', showFps: false, touch: 'auto' },
  seenTutorial: false,
  history: [],
});

export class Profile {
  constructor() { this.data = this.load(); }
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw);
        const def = DEFAULTS();
        return { ...def, ...d, stats: { ...def.stats, ...(d.stats || {}) }, settings: { ...def.settings, ...(d.settings || {}) }, equipped: { ...def.equipped, ...(d.equipped || {}) }, owned: Array.from(new Set([...(d.owned || []), ...DEFAULT_OWNED])) };
      }
    } catch (e) { /* ignore */ }
    return DEFAULTS();
  }
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* ignore */ } }
  owns(id) { return this.data.owned.includes(id); }
  buy(item, price) {
    if (this.owns(item.id) || this.data.shards < price) return false;
    this.data.shards -= price;
    this.data.owned.push(item.id);
    this.save();
    return true;
  }
  equip(type, id) { this.data.equipped[type] = id; this.save(); }
  xpForLevel(l) { return 600 + l * 150; }
  addXp(x) {
    const d = this.data;
    d.xp += x;
    let ups = 0;
    while (d.xp >= this.xpForLevel(d.level)) { d.xp -= this.xpForLevel(d.level); d.level++; ups++; d.shards += 100; }
    return ups;
  }
}
