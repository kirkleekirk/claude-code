// Persistent player profile (localStorage). Everything is wrapped in try/catch so the
// game still runs in private windows / blocked storage.
import { DEFAULT_OWNED, DEFAULT_EQUIPPED } from '../data/cosmetics.js';
import { xpForLevel, applyXp } from '../data/rewards.js';

// Tamper check for the offline save. Not real security (anything in the browser can be
// edited) — it just stops casual edits. Real-money Shards must live on the server (see wallet.js).
const SALT = 'greenfall-county-1';
function sign(d) {
  const str = SALT + JSON.stringify([d.shards, d.owned, d.level, d.xp, d.stats && d.stats.matches, d.stats && d.stats.extractions]);
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

const KEY = 'greenfall.profile.v1';
const DEFAULTS = () => ({
  name: 'Survivor' + Math.floor(Math.random() * 9000 + 1000),
  shards: 1000,
  owned: [...DEFAULT_OWNED],
  equipped: { ...DEFAULT_EQUIPPED },
  level: 1, xp: 0,
  stats: { matches: 0, extractions: 0, kills: 0, zombieKills: 0, deaths: 0, timePlayed: 0, bestTime: 0, lootExtracted: 0, boatEscapes: 0, heliEscapes: 0 },
  settings: { classId: 'survivor', quality: null, sens: 1, fov: 72, master: 0.8, sfx: 0.9, music: 0.5, ambient: 0.7, invertY: false, matchLength: 'standard', showFps: false, touch: 'auto' },
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
        // migrate: gliders became bike paint
        if (d.owned) d.owned = d.owned.map((id) => (id.startsWith('gl_') ? { gl_canvas: 'pt_stock', gl_barn: 'pt_barn', gl_patch: 'pt_patch', gl_crop: 'pt_crop', gl_bat: 'pt_dusk', gl_toxic: 'pt_toxic', gl_balloon: 'pt_fair' }[id] || 'pt_stock' : id));
        if (d.equipped) { delete d.equipped.glider; }
        if (d.sig && d.sig !== sign(d)) { d.shards = 0; d.tampered = true; }
        return { ...def, ...d, stats: { ...def.stats, ...(d.stats || {}) }, settings: { ...def.settings, ...(d.settings || {}) }, equipped: { ...def.equipped, ...(d.equipped || {}) }, owned: Array.from(new Set([...(d.owned || []), ...DEFAULT_OWNED])) };
      }
    } catch (e) { /* ignore */ }
    return DEFAULTS();
  }
  save() { try { this.data.sig = sign(this.data); localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* ignore */ } }
  owns(id) { return this.data.owned.includes(id); }
  buy(item, price) {
    if (this.owns(item.id) || this.data.shards < price) return false;
    this.data.shards -= price;
    this.data.owned.push(item.id);
    this.save();
    return true;
  }
  equip(type, id) { this.data.equipped[type] = id; this.save(); }
  xpForLevel(l) { return xpForLevel(l); }
  addXp(x) { return applyXp(this.data, x); }
}
