// Game state factory and shared helpers. S is plain JSON; keys starting with '_' are transient.
import { SETTLEMENT_IDS, MARKET_IDS, PLACE } from '../data/places.js';
import { RANKS, rankOf, levelFromXp } from '../data/progress.js';
import { hashStr } from '../core/rng.js';

export const SAVE_VERSION = 3;
export const MIN_PER_DAY = 1440;
export const DAWN = 360;
export const RIVAL_IDS = ['rustjaw', 'palehand', 'ashchoir'];

export const DIFFICULTY = {
  easy: { name: 'Easy', price: 1.15, heat: 0.7, enemy: 0.8, cost: 0.9, permadeath: false, desc: 'Better prices, less heat, softer enemies.' },
  normal: { name: 'Normal', price: 1.0, heat: 1.0, enemy: 1.0, cost: 1.0, permadeath: false, desc: 'The intended balance.' },
  hard: { name: 'Hard', price: 0.9, heat: 1.25, enemy: 1.25, cost: 1.1, permadeath: false, desc: 'Tighter margins, hotter streets, tougher guards.' },
  ironman: { name: 'Ironman', price: 0.9, heat: 1.25, enemy: 1.25, cost: 1.1, permadeath: true, desc: 'Hard, and death is permanent. One save.' },
};

export function newGame(seed = 1337, diff = 'normal', opts = {}) {
  const S = {
    v: SAVE_VERSION, seed, rng: (seed ^ 0x9e3779b9) >>> 0, diff, ironman: diff === 'ironman',
    day: 1, min: DAWN, total: 0, speed: 1,
    money: { dirty: 250, carried: 0, clean: 0, frozen: 0, frozenDays: 0, debt: 0, debtDue: 0 },
    rep: 0, xp: 0, level: 1, perkPts: 0, perks: {},
    notoriety: 0, goodwill: 50, favors: 0,
    heat: Object.fromEntries(MARKET_IDS.map((t) => [t, 0])),
    towns: {}, markets: {}, inv: {}, guns: [], nextId: 1,
    hollow: { size: 4, cells: new Array(36).fill(null), up: { security: 0, storage: 0, power: 0, tunnel: 0 }, bench: 1, power: 0, powerCap: 0, noPower: false },
    drying: [], curing: [], packAuto: { on: false, form: 'baggie', keepBud: 0 },
    queues: { smelter: [], lathe: [], press: [], bench: [] }, standing: [], autoChain: true,
    crew: [], candidates: {}, candDay: 0,
    businesses: [], loans: [], loanOffers: [], protection: {},
    rivals: {}, compact: { seats: 0, daybreak: null, crackdownDays: 0, councilQuest: 0 },
    contracts: { board: [], active: [], nextDay: 1 }, tips: [],
    events: { pending: [], seen: {}, cooldown: {} },
    regulars: [], strains: { known: { dust_devil: true, ashleaf: false }, hybrids: {}, codex: [] },
    bps: { pipe_pistol: true, rebar_revolver: true, sawn_off: true },
    vehicles: { owned: {}, active: null },
    arms: { compact: 0, rustjaw: 0, palehand: 0, ashchoir: 0 },
    laylow: 0, visited: { hollow: true, millbrook: true, crossroads: true },
    tutorial: { step: 0, on: opts.tutorial !== false, done: opts.tutorial === false, flags: {}, shown: {} },
    ach: {}, stats: {}, flags: {}, hints: {},
    hist: [], today: newLedgerDay(), log: [], news: [], journal: [],
    player: { x: 64 * 16 + 8, y: 100 * 16 + 8, hp: 100, maxHp: 100, loadout: [null, null, null], sel: 0, throwSel: 'molotov', carry: {}, dead: false, inVehicle: null },
    mission: null, ending: null, sandbox: false, defense: null, recon: {},
    _fx: [],
  };
  for (const id of SETTLEMENT_IDS) {
    const p = PLACE[id];
    S.towns[id] = { status: 'normal', alarm: 0, devast: 0, lootReady: 1, occupied: false, controlled: false, garrison: 0, wealth: p.wealth, lastHit: -99, inspected: 0, contestDays: 0, hits: 0 };
  }
  for (const id of MARKET_IDS) S.markets[id] = { sat: {}, mods: [] };
  for (const rid of RIVAL_IDS) S.rivals[rid] = newRival(rid);
  // Starting Hollow: 4 outdoor plots on the top row and Bench I below them.
  for (let i = 0; i < 4; i++) S.hollow.cells[i] = { fac: 'plot', plant: null };
  S.hollow.cells[6] = { fac: 'bench' };
  S.inv['seed:dust_devil'] = 5;
  S.inv['ammo:light'] = 12;
  S.inv.compost = 4;
  const g = makeGun(S, 'pipe_pistol', { barrel: ['scrap', 3], frame: ['scrap', 3], action: ['scrap', 3], stock: ['scrap', 3], mag: ['scrap', 3] }, 'common', false, {});
  g.name = 'Old Faithful';
  g.loaded = 8;
  S.player.loadout[0] = g.id;
  S.inv['ammo:light'] = 4;
  return S;
}

export function newLedgerDay() { return { inc: {}, exp: {}, dirtyIn: 0, cleanIn: 0, dirtyOut: 0, cleanOut: 0, rep: 0, heat: 0 }; }

export function newRival(rid) {
  const base = {
    rustjaw: { name: 'Rustjaw Raiders', leader: 'Big Tooth Marlo', camp: 'rustjaw', color: 'rust', icon: 'jaw', temper: 0.75, greed: 0.8, style: 'aggressive' },
    palehand: { name: 'The Pale Hand', leader: 'Iris Vane', camp: 'palehand', color: 'bone', icon: 'hand', temper: 0.4, greed: 0.9, style: 'smuggler' },
    ashchoir: { name: 'The Ash Choir', leader: 'Sister Cinder', camp: 'ashchoir', color: 'heat', icon: 'candle', temper: 0.55, greed: 0.5, style: 'cult' },
  }[rid];
  const turf = { rustjaw: { coppergate: 25, millbrook: 10 }, palehand: { harbor9: 30, millbrook: 10 }, ashchoir: { stverity: 15, foundry: 20, newhaven: 10 } }[rid];
  return { id: rid, ...base, alive: true, strength: 14, wealth: 600, attitude: -5, stance: 'neutral', stanceDays: 0, turf, intel: 0, raidPlanned: 0, tribute: 0, bossDown: false, lastMove: '' };
}

// ---------- logging, fx ----------
export function log(S, text, kind = 'info') {
  S.log.push({ day: S.day, min: Math.floor(S.min), text, kind });
  if (S.log.length > 300) S.log.splice(0, S.log.length - 300);
  fx(S, 'toast', { text, kind });
}
export function fx(S, type, data = {}) { if (!S._fx) S._fx = []; S._fx.push({ type, ...data }); if (S._fx.length > 200) S._fx.shift(); }
export function journal(S, text) { S.journal.push({ day: S.day, text }); if (S.journal.length > 200) S.journal.shift(); }
export function stat(S, k, n = 1) { S.stats[k] = (S.stats[k] || 0) + n; }
export function statMax(S, k, v) { if ((S.stats[k] || 0) < v) S.stats[k] = v; }

// ---------- money ----------
export const dirtyTotal = (S) => S.money.dirty + S.money.carried;
export function earn(S, kind, amount, cat) {
  if (!(amount > 0)) return;
  amount = Math.round(amount * 100) / 100;
  if (kind === 'clean') { S.money.clean += amount; S.today.cleanIn += amount; }
  else if (kind === 'carried') { S.money.carried += amount; S.today.dirtyIn += amount; stat(S, 'dirtyEarned', amount); }
  else { S.money.dirty += amount; S.today.dirtyIn += amount; stat(S, 'dirtyEarned', amount); }
  if (cat) S.today.inc[cat] = (S.today.inc[cat] || 0) + amount;
}
export function canAfford(S, kind, amount) { return kind === 'clean' ? S.money.clean >= amount - 1e-6 : dirtyTotal(S) >= amount - 1e-6; }
export function spend(S, kind, amount, cat) {
  if (!(amount > 0)) return true;
  if (!canAfford(S, kind, amount)) return false;
  if (kind === 'clean') { S.money.clean -= amount; S.today.cleanOut += amount; }
  else {
    const fromCarried = Math.min(S.money.carried, amount);
    S.money.carried -= fromCarried;
    S.money.dirty -= amount - fromCarried;
    S.today.dirtyOut += amount;
  }
  if (S.money.dirty < 0) S.money.dirty = 0;
  if (cat) S.today.exp[cat] = (S.today.exp[cat] || 0) + amount;
  return true;
}

// ---------- reputation, rank, level ----------
export const rank = (S) => rankOf(S.rep);
export const rankName = (S) => RANKS[rank(S)].name;
export function addRep(S, n, why, cat) {
  if (!n) return;
  if (n > 0) { const by = S.stats.repBy || (S.stats.repBy = {}); const k = cat || why || 'misc'; by[k] = Math.round(((by[k] || 0) + n) * 10) / 10; }
  const before = rank(S);
  S.rep = Math.max(0, S.rep + n);
  if (n > 0) {
    S.xp += n;
    S.today.rep += n;
    const lvl = levelFromXp(S.xp);
    while (S.level < lvl) { S.level++; S.perkPts++; fx(S, 'level', { level: S.level }); log(S, `Level ${S.level}: +1 perk point`, 'good'); }
  }
  const after = rank(S);
  if (after > before) {
    log(S, `RANK UP: ${RANKS[after].name}! Unlocked: ${RANKS[after].unlocks.join(', ')}`, 'rank');
    journal(S, `Became ${RANKS[after].name} on day ${S.day}.`);
    fx(S, 'rank', { rank: after });
    S.flags['rank_' + after] = S.day;
    if (!S.stats.rankDay) S.stats.rankDay = {};
    S.stats.rankDay[after] = S.total;
  }
  if (why && Math.abs(n) >= 10) fx(S, 'rep', { n, why });
}

export const hasPerk = (S, id) => !!S.perks[id];
export const D = (S) => DIFFICULTY[S.diff] || DIFFICULTY.normal;
export const hour = (S) => Math.floor(S.min / 60) % 24;
export const isDay = (S) => { const h = hour(S); return h >= 6 && h < 20; };
export const nextId = (S) => S.nextId++;
export const marketOpen = (S, town) => town === 'crossroads' || (hour(S) >= 7 && hour(S) < 20);

// ---------- guns (shared so newGame can issue the starter pistol) ----------
export function makeGun(S, bp, comps, grade, unreliable, mods) {
  const id = nextId(S);
  const g = { id, bp, comps: {}, grade, unreliable: !!unreliable, mods: { ...mods }, dur: 100, maxDur: 100, loaded: 0, ammoVar: 'std', name: '', kills: 0 };
  for (const [k, [mat, stars]] of Object.entries(comps)) g.comps[k] = { mat, stars };
  const frameMult = { scrap: 0.8, iron: 1.0, steel: 1.2, alloy: 1.4 }[g.comps.frame.mat] * (1 + 0.08 * (g.comps.frame.stars - 3));
  g.maxDur = Math.round(100 * frameMult);
  g.dur = g.maxDur;
  S.guns.push(g);
  return g;
}
export const gunById = (S, id) => S.guns.find((g) => g.id === id) || null;

export function seededName(S, salt) { return hashStr(String(S.seed) + salt); }
