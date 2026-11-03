// Greenfall account & wallet server + multiplayer relay — zero dependencies (Node 18+).
//
// Source of truth for Shards, owned cosmetics and match rewards, plus redeeming Shard
// packs bought on itch.io. Run:   node server/server.mjs
// Generate gift codes:            node server/server.mjs codes 20 1000
//
// Env:
//   PORT=8787  DB_FILE=./greenfall-db.json
//   ALLOWED_ORIGINS=https://html-classic.itch.zone,https://yourname.itch.io   (default: itch.io + localhost)
//   ITCH_API_KEY=...                     itch.io API key (Settings → API keys)
//   ITCH_PACKS={"1234567":1000,"1234568":2800}   itch game/product id → Shards per purchase
//   STORE_PACKS=[{"id":"small","shards":1000,"label":"$1.99","url":"https://you.itch.io/greenfall-shards-1000"}]
import http from 'http';
import { attachRelay, PROTOCOL } from './relay.mjs';
import fs from 'fs';
import crypto from 'crypto';
import { BY_ID, priceOf, shopForDay, currentDay, DEFAULT_OWNED, DEFAULT_EQUIPPED, RETIRED, retiredRefund } from '../src/data/cosmetics.js';
import { computeRewards, applyXp, REWARD_CAPS } from '../src/data/rewards.js';

const PORT = +(process.env.PORT || 8787);
const DB_FILE = process.env.DB_FILE || './greenfall-db.json';
const ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
const ITCH_PACKS = JSON.parse(process.env.ITCH_PACKS || '{}');
const STORE_PACKS = JSON.parse(process.env.STORE_PACKS || '[]');
const MIN_MATCH = { quick: 0.35 * 25 * 60, standard: 0.35 * 65 * 60, marathon: 0.35 * 150 * 60 }; // earliest real extraction

let db = { players: {}, tokens: {}, matches: {}, codes: {}, redeemed: {} };
try { db = { ...db, ...JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) }; } catch (e) { /* new db */ }
// migrate: retired harvesting tools are refunded in Shards
for (const p of Object.values(db.players)) {
  if (!p.owned?.some((id) => RETIRED[id])) continue;
  p.shards += p.owned.reduce((n, id) => n + retiredRefund(id), 0);
  p.owned = p.owned.filter((id) => !RETIRED[id]);
  if (p.equipped) delete p.equipped.pickaxe;
}
let saveTimer = null;
const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => { fs.writeFileSync(DB_FILE + '.tmp', JSON.stringify(db)); fs.renameSync(DB_FILE + '.tmp', DB_FILE); }, 200); };
const hash = (t) => crypto.createHash('sha256').update(t).digest('hex');
const now = () => Date.now();

// ---- CLI: gift / manual-sale codes ----
if (process.argv[2] === 'codes') {
  const n = +(process.argv[3] || 10), shards = +(process.argv[4] || 1000);
  for (let i = 0; i < n; i++) { const c = 'GF-' + crypto.randomBytes(5).toString('hex').toUpperCase(); db.codes[c] = shards; console.log(c, shards); }
  fs.writeFileSync(DB_FILE, JSON.stringify(db));
  process.exit(0);
}

const publicProfile = (p) => ({ shards: p.shards, owned: p.owned, equipped: p.equipped, level: p.level, xp: p.xp, stats: p.stats });
function newPlayer() {
  const id = crypto.randomUUID(), token = crypto.randomBytes(32).toString('hex');
  db.players[id] = { id, shards: 1000, owned: [...DEFAULT_OWNED], equipped: { ...DEFAULT_EQUIPPED }, level: 1, xp: 0, stats: { matches: 0, extractions: 0 }, created: now(), rate: [] };
  db.tokens[hash(token)] = id;
  save();
  return { player: db.players[id], token };
}
function auth(req) { const h = req.headers.authorization || ''; const t = h.startsWith('Bearer ') ? h.slice(7) : ''; return t && db.players[db.tokens[hash(t)]]; }
function limited(p) { const t = now(); p.rate = (p.rate || []).filter((x) => t - x < 60000); p.rate.push(t); return p.rate.length > 40; }
async function itchKeyShards(code) {
  if (!process.env.ITCH_API_KEY) return null;
  for (const [gameId, shards] of Object.entries(ITCH_PACKS)) {
    const url = `https://itch.io/api/1/${process.env.ITCH_API_KEY}/game/${gameId}/download_keys?download_key=${encodeURIComponent(code)}`;
    try {
      const r = await fetch(url);
      const j = await r.json();
      if (j && j.download_key && !j.errors) return { shards, keyId: 'itch:' + j.download_key.id };
    } catch (e) { /* try next */ }
  }
  return null;
}

const routes = {
  'POST /api/session': async (req, body, p) => { if (p) return { profile: publicProfile(p) }; const n = newPlayer(); return { token: n.token, profile: publicProfile(n.player) }; },
  'GET /api/profile': async (req, body, p) => ({ profile: publicProfile(p) }),
  'GET /api/store': async () => ({ packs: STORE_PACKS }),
  'GET /api/time': async () => ({ now: Date.now(), day: currentDay() }),
  'GET /api/rooms': async () => ({ rooms: relay ? relay.listRooms() : [], protocol: PROTOCOL }),
  'POST /api/equip': async (req, { type, id }, p) => { const it = BY_ID[id]; if (!it || it.type !== type || !p.owned.includes(id)) throw [400, 'Not owned']; p.equipped[type] = id; save(); return { profile: publicProfile(p) }; },
  'POST /api/buy': async (req, { itemId }, p) => {
    const it = BY_ID[itemId];
    if (!it) throw [404, 'Unknown item'];
    const shop = shopForDay(currentDay());
    if (![...shop.featured, ...shop.daily].some((c) => c.id === itemId)) throw [400, 'Not in today\'s shop'];
    if (p.owned.includes(itemId)) throw [400, 'Already owned'];
    const price = priceOf(it);
    if (p.shards < price) throw [400, 'Not enough Shards'];
    p.shards -= price; p.owned.push(itemId); save();
    return { profile: publicProfile(p) };
  },
  'POST /api/match/start': async (req, { preset }, p) => {
    const id = crypto.randomUUID();
    db.matches[id] = { player: p.id, preset: REWARD_CAPS[preset] ? preset : 'standard', start: now() };
    save();
    return { matchId: id };
  },
  'POST /api/match/end': async (req, { matchId, result }, p) => {
    const m = db.matches[matchId];
    if (!m || m.player !== p.id || m.done) throw [400, 'Unknown match'];
    m.done = true;
    const elapsed = (now() - m.start) / 1000;
    const r = { ...result };
    r.time = Math.min(+r.time || 0, elapsed + 30);               // can't survive longer than real time
    r.kills = Math.min(+r.kills || 0, 59, Math.floor(elapsed / 20) + 1);   // at most ~1 survivor kill / 20s
    r.zombieKills = Math.min(+r.zombieKills || 0, Math.floor(elapsed / 2));
    r.loot = Math.min(+r.loot || 0, 2000); r.boarded = Math.min(+r.boarded || 0, 60); r.searched = Math.min(+r.searched || 0, 200);
    if (r.outcome === 'extracted' && elapsed < MIN_MATCH[m.preset]) r.outcome = 'eliminated'; // too fast to be real
    let { shards, xp } = computeRewards(r);
    shards = Math.min(shards, REWARD_CAPS[m.preset]);
    xp = Math.min(xp, REWARD_CAPS[m.preset] * 4);
    p.shards += shards;
    applyXp(p, xp);
    p.stats.matches++; if (r.outcome === 'extracted') p.stats.extractions++;
    save();
    return { shards, xp, profile: publicProfile(p) };
  },
  'POST /api/redeem': async (req, { code }, p) => {
    code = String(code || '').trim();
    if (!code) throw [400, 'Enter a code'];
    if (db.codes[code] !== undefined) {
      if (db.redeemed[code]) throw [400, 'Code already used'];
      const add = db.codes[code]; db.redeemed[code] = p.id; p.shards += add; save();
      return { added: add, profile: publicProfile(p) };
    }
    const k = await itchKeyShards(code);
    if (!k) throw [400, 'Invalid code'];
    if (db.redeemed[k.keyId]) throw [400, 'This purchase was already redeemed'];
    db.redeemed[k.keyId] = p.id; p.shards += k.shards; save();
    return { added: k.shards, profile: publicProfile(p) };
  },
};

function corsOrigin(origin) {
  if (!origin) return '';
  if (ORIGINS.length) return ORIGINS.includes(origin) ? origin : '';
  return /^https:\/\/([a-z0-9-]+\.)*itch\.(zone|io)$/.test(origin) || /^http:\/\/localhost(:\d+)?$/.test(origin) ? origin : '';
}
let relay = null;
const httpServer = http.createServer(async (req, res) => {
  const origin = corsOrigin(req.headers.origin);
  const head = { 'content-type': 'application/json', ...(origin ? { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'content-type, authorization', 'access-control-allow-methods': 'GET, POST, OPTIONS', vary: 'origin' } : {}) };
  if (req.method === 'OPTIONS') { res.writeHead(204, head); res.end(); return; }
  const key = `${req.method} ${req.url.split('?')[0]}`;
  const fn = routes[key];
  try {
    if (!fn) throw [404, 'Not found'];
    let raw = '';
    for await (const c of req) { raw += c; if (raw.length > 20000) throw [413, 'Too large']; }
    const body = raw ? JSON.parse(raw) : {};
    const p = auth(req);
    if (!p && key !== 'POST /api/session' && key !== 'GET /api/store' && key !== 'GET /api/time' && key !== 'GET /api/rooms') throw [401, 'Not signed in'];
    if (p && limited(p)) throw [429, 'Slow down'];
    const out = await fn(req, body, p);
    res.writeHead(200, head); res.end(JSON.stringify(out));
  } catch (e) {
    const [code, msg] = Array.isArray(e) ? e : [500, 'Server error'];
    if (!Array.isArray(e)) console.error(e);
    res.writeHead(code, head); res.end(JSON.stringify({ error: msg }));
  }
});
// multiplayer relay (server list + message relay) shares the port
relay = attachRelay(httpServer, { allowOrigin: (o) => !o || !!corsOrigin(o), log: (...a) => console.log(new Date().toISOString(), ...a) });
httpServer.listen(PORT, () => console.log(`Greenfall server (wallet + multiplayer relay) on :${PORT}`));
