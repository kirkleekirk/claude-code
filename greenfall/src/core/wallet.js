// Wallet: the one place Shards and cosmetics are granted or spent.
//
// Offline (default): everything lives in the local profile. Fine for a free game, but anyone
// can edit their own browser save — so never sell Shards in this mode.
// Online: set VITE_GREENFALL_API (build time) or window.GREENFALL_API to your server's URL
// (see /server). The server becomes the source of truth for Shards, purchases, match rewards
// and redeeming itch.io purchase keys; the local profile just mirrors it.
import { priceOf } from '../data/cosmetics.js';
import { computeRewards } from '../data/rewards.js';

const TOKEN_KEY = 'greenfall.token.v1';
const apiBase = () => (typeof window !== 'undefined' && window.GREENFALL_API) || (import.meta.env && import.meta.env.VITE_GREENFALL_API) || '';

export class Wallet {
  constructor(profile) {
    this.profile = profile;
    this.base = String(apiBase()).replace(/\/$/, '');
    this.online = false;
    this.store = null;
    this.error = null;
  }
  get configured() { return !!this.base; }
  token() { try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; } }
  async call(path, body, method = 'POST') {
    const res = await fetch(this.base + path, {
      method, headers: { 'content-type': 'application/json', ...(this.token() ? { authorization: 'Bearer ' + this.token() } : {}) },
      body: method === 'GET' ? undefined : JSON.stringify(body || {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);
    return data;
  }
  mirror(p) {
    const d = this.profile.data;
    for (const k of ['shards', 'owned', 'level', 'xp']) if (p[k] !== undefined) d[k] = p[k];
    if (p.equipped) d.equipped = { ...d.equipped, ...p.equipped };
    this.profile.save();
  }
  async init() {
    if (!this.configured) return false;
    try {
      const s = await this.call('/api/session', {});
      if (s.token) { try { localStorage.setItem(TOKEN_KEY, s.token); } catch (e) { /* */ } }
      this.mirror(s.profile);
      this.store = (await this.call('/api/store', null, 'GET')).packs || [];
      this.online = true;
    } catch (e) { this.error = e.message; this.online = false; }
    return this.online;
  }
  async buy(item) {
    const price = priceOf(item);
    if (!this.online) return this.profile.buy(item, price) ? { ok: true } : { ok: false, error: 'Not enough Shards' };
    try { const r = await this.call('/api/buy', { itemId: item.id }); this.mirror(r.profile); return { ok: true }; } catch (e) { return { ok: false, error: e.message }; }
  }
  async equip(type, id) {
    this.profile.equip(type, id);
    if (this.online) this.call('/api/equip', { type, id }).catch(() => {});
  }
  async matchStart(presetKey) {
    this.matchId = null;
    if (!this.online) return;
    try { this.matchId = (await this.call('/api/match/start', { preset: presetKey })).matchId; } catch (e) { /* play offline */ }
  }
  // Returns { shards, xp, levelUps } actually granted.
  async matchEnd(result) {
    const d = this.profile.data;
    if (this.online && this.matchId) {
      try {
        const r = await this.call('/api/match/end', { matchId: this.matchId, result });
        const before = d.level;
        this.mirror(r.profile);
        return { shards: r.shards, xp: r.xp, levelUps: d.level - before };
      } catch (e) { /* fall through to offline */ }
    }
    const { shards, xp } = computeRewards(result);
    d.shards += shards;
    const levelUps = this.profile.addXp(xp);
    this.profile.save();
    return { shards, xp, levelUps };
  }
  async redeem(code) {
    if (!this.online) return { ok: false, error: 'Codes need the online server' };
    try { const r = await this.call('/api/redeem', { code: code.trim() }); this.mirror(r.profile); return { ok: true, added: r.added }; } catch (e) { return { ok: false, error: e.message }; }
  }
}
