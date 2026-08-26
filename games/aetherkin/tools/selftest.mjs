#!/usr/bin/env node
// Loads the game bundle in a sandbox and checks it holds together.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const jsDir = join(root, 'src', 'js');
const files = readdirSync(jsDir).filter(f => f.endsWith('.js')).sort();
const code = files.map(f => readFileSync(join(jsDir, f), 'utf8')).join('\n');

const noop = () => {};
const stubEl = { style: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false }, dataset: {},
  appendChild: noop, append: noop, addEventListener: noop, setAttribute: noop, removeAttribute: noop,
  querySelector: () => null, querySelectorAll: () => [], remove: noop, focus: noop, getContext: () => null };
const ctx = {
  console, Math, Date, JSON, Object, Array, String, Number, Boolean, isNaN, parseInt, parseFloat, Set, Map, Error,
  document: Object.assign(Object.create(stubEl), { createElement: () => Object.create(stubEl), body: Object.create(stubEl),
    documentElement: Object.create(stubEl), addEventListener: noop, createDocumentFragment: () => Object.create(stubEl) }),
  window: { addEventListener: noop, matchMedia: () => ({ matches: false, addEventListener: noop }) },
  localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
  requestAnimationFrame: noop, setTimeout, clearTimeout, performance: { now: () => Date.now() },
};
ctx.globalThis = ctx; ctx.self = ctx;
vm.createContext(ctx);

const EXPORTS = ['TYPES','MOVES','ABILITIES','PASSIVES','SPECIES','LATTICES','STATS','nodeCost','nodeLevel',
  'typeMult','stageMult','makeKin','newBattle','statsFor','xpToNext','motesForLevel','ZONES','ITEMS','WARDENS',
  'latticeState','canBuy','buyNode','loadoutOf','aiChoose','FIELDS','STATUSES','srand','LV_CAP',
  'toFighter','active','useMove','useAbility','resolveTurn','autoBuild','autoEquip','wildKin','wardenTeam',
  'catchOdds','grantXp','equip','reforge','nodeLabel','xpYield','totalXpFor','passiveSlots','SHOP_STOCK'];
try {
  vm.runInContext(code + '\n;globalThis.__G = {' + EXPORTS.map(k => `${k}: typeof ${k} !== 'undefined' ? ${k} : undefined`).join(',') + '};', ctx, { filename: 'bundle.js' });
} catch (e) { console.error('LOAD FAILED:', e.message, '\n', e.stack.split('\n').slice(0, 4).join('\n')); process.exit(1); }
const G = ctx.__G;

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.error('  FAIL ' + msg); } };
const section = s => console.log('\n' + s);

/* ---------- data integrity ---------- */
section('data integrity');
const usedMoves = new Set(), usedAbil = new Set(), usedPass = new Set(), usedSpecies = new Set();
for (const [fam, lat] of Object.entries(G.LATTICES)) {
  const ids = new Set();
  ok(!!lat.title && !!lat.blurb, `${fam}: has title and blurb`);
  for (const n of lat.nodes) {
    ok(!ids.has(n.id), `${fam}: node id '${n.id}' is unique`);
    ids.add(n.id);
    for (const r of (n.req || [])) ok(ids.has(r) || lat.nodes.some(x => x.id === r), `${fam}/${n.id}: requirement '${r}' exists`);
    for (const r of (n.req || [])) { const p = lat.nodes.find(x => x.id === r); if (p) ok(p.r < n.r, `${fam}/${n.id}: requirement '${r}' is on an earlier ring`); }
    if (n.k === 'move')    { ok(!!G.MOVES[n.ref], `${fam}/${n.id}: move '${n.ref}' exists`); usedMoves.add(n.ref); }
    if (n.k === 'core')    { ok(!!G.MOVES[n.ref], `${fam}/${n.id}: core move '${n.ref}' exists`); usedMoves.add(n.ref); }
    if (n.k === 'ability') { ok(!!G.ABILITIES[n.ref], `${fam}/${n.id}: ability '${n.ref}' exists`); usedAbil.add(n.ref); }
    if (n.k === 'passive') { ok(!!G.PASSIVES[n.ref], `${fam}/${n.id}: passive '${n.ref}' exists`); usedPass.add(n.ref); }
    if (n.k === 'evolve')  { ok(!!G.SPECIES[n.ref], `${fam}/${n.id}: species '${n.ref}' exists`); usedSpecies.add(n.ref);
                             ok(G.SPECIES[n.ref] && G.SPECIES[n.ref].fam === fam, `${fam}/${n.id}: '${n.ref}' reads this lattice`); }
    if (n.k === 'stat')    { ok(n.stat && Object.keys(n.stat).length > 0, `${fam}/${n.id}: stat node grants something`);
                             ok(!!n.n, `${fam}/${n.id}: stat node has a name`); }
    ok(['core','move','passive','ability','stat','evolve'].includes(n.k), `${fam}/${n.id}: kind '${n.k}' is known`);
  }
  const roots = lat.nodes.filter(n => !n.req || !n.req.length);
  ok(roots.length === 1 && roots[0].k === 'core', `${fam}: exactly one free core node`);
  // every node reachable from the core
  const seen = new Set([roots[0].id]);
  let grew = true;
  while (grew) { grew = false; for (const n of lat.nodes) if (!seen.has(n.id) && (n.req || []).every(r => seen.has(r))) { seen.add(n.id); grew = true; } }
  ok(seen.size === lat.nodes.length, `${fam}: all ${lat.nodes.length} nodes reachable (${seen.size} reached)`);
  const evos = lat.nodes.filter(n => n.k === 'evolve');
  ok(lat.solo ? evos.length === 0 : evos.length === 2, `${fam}: ${lat.solo ? 'no' : 'two'} evolution nodes`);
}

section('species');
for (const [id, sp] of Object.entries(G.SPECIES)) {
  ok(!!G.LATTICES[sp.fam], `${id}: family lattice '${sp.fam}' exists`);
  ok(!!G.MOVES[sp.innate], `${id}: innate move '${sp.innate}' exists`);
  ok(sp.t.length >= 1 && sp.t.every(t => G.TYPES[t]), `${id}: aspects are real`);
  ok(G.STATS.every(k => typeof sp.base[k] === 'number' && sp.base[k] > 0), `${id}: has all six base stats`);
  ok(!!sp.dex && sp.dex.length > 20, `${id}: has a codex entry`);
  ok(!!sp.art && !!sp.art.form, `${id}: has an art descriptor`);
  const total = G.STATS.reduce((n, k) => n + sp.base[k], 0);
  ok(total > 290 && total < 480, `${id}: stat total ${total} in range`);
  if (sp.stage === 2) { ok(!!G.SPECIES[sp.from], `${id}: prior form exists`); ok(usedSpecies.has(id), `${id}: reachable from a lattice node`); }
}

section('unused content');
const orphans = (dict, used, label) => { const o = Object.keys(dict).filter(k => !used.has(k)); ok(o.length === 0, `${label}: nothing orphaned (${o.join(', ') || 'none'})`); };
for (const sp of Object.values(G.SPECIES)) usedMoves.add(sp.innate);
['rend','pulse','brace','quickstep'].forEach(m => usedMoves.add(m));
orphans(G.MOVES, usedMoves, 'moves');
orphans(G.ABILITIES, usedAbil, 'abilities');
orphans(G.PASSIVES, usedPass, 'passives');

section('type chart');
for (const [id, t] of Object.entries(G.TYPES)) {
  ok(/^#[0-9A-Fa-f]{6}$/.test(t.hue), `${id}: has a hue`);
  for (const o of [...t.beats, ...t.bends, ...t.voids]) ok(!!G.TYPES[o], `${id}: relation '${o}' is a real aspect`);
  ok(!t.beats.some(x => t.bends.includes(x)), `${id}: no aspect both beaten and bent`);
}
ok(G.typeMult('ember', ['verdant']) === 2, 'ember beats verdant');
ok(G.typeMult('ember', ['verdant','iron']) === 4, 'double weakness stacks to 4x');
ok(G.typeMult('mind', ['umbra']) === 0, 'mind cannot touch umbra');
ok(G.typeMult('aether', ['iron']) === 1, 'aether is always neutral');
for (const id of Object.keys(G.TYPES)) {
  if (id === 'aether') continue;
  const beatenBy = Object.entries(G.TYPES).filter(([, t]) => t.beats.includes(id));
  ok(beatenBy.length > 0, `${id}: something beats it`);
}


/* ---------- growth ---------- */
section('growth');
G.srand(20260826);
{
  const k = G.makeKin('emberkit', 1);
  ok(G.statsFor(k).hp > 10, 'level 1 kin has vitality');
  ok(k.nodes.length === 1, 'starts with only the free core node');
  ok(G.latticeState(k).free === 0, 'level 1 kin has no Motes to spend');
  G.grantXp(k, G.totalXpFor(50));
  ok(k.lv === 50, 'reaches the cap from a lump of experience');
  ok(G.latticeState(k).free === 54, 'level 50 grants 54 Motes (got ' + G.latticeState(k).free + ')');
  const lo = G.statsFor(G.makeKin('emberkit', 5)), hi = G.statsFor(G.makeKin('emberkit', 50));
  ok(G.STATS.every(s => hi[s] > lo[s]), 'every stat grows with level');
}
for (const [fam, lat] of Object.entries(G.LATTICES)) {
  const base = Object.values(G.SPECIES).find(sp => sp.fam === fam && sp.stage === 1 && !sp.from);
  for (const prefer of (lat.solo ? ['A'] : ['A', 'B'])) {
    const k = G.makeKin(base.id, 50);
    G.autoBuild(k, prefer);
    const st = G.latticeState(k);
    ok(st.spent <= st.total, fam + '/' + prefer + ': never overspends Motes');
    ok(k.moves.length >= 1 && k.moves.length <= 4, fam + '/' + prefer + ': legal move loadout');
    ok(k.abil.length <= 2, fam + '/' + prefer + ': legal ability loadout');
    ok(k.pass.length <= G.passiveSlots(k), fam + '/' + prefer + ': legal passive loadout');
    ok(k.nodes.length > 4, fam + '/' + prefer + ': actually spent its Motes (' + k.nodes.length + ' nodes)');
    if (!lat.solo) ok(G.SPECIES[k.sp].stage === 2 && G.SPECIES[k.sp].branch === prefer, fam + '/' + prefer + ': took the intended branch');
  }
}
{ /* the two branches are genuinely exclusive */
  const k = G.makeKin('emberkit', 50);
  const r = G.buyNode(k, 'ek_kin') && G.buyNode(k, 'ek_coal') && G.buyNode(k, 'ek_evoA');
  ok(k.sp === 'pyrelisk', 'buying the evolve node changes the kin');
  ok(G.passiveSlots(k) === 3, 'evolving opens a third passive slot');
  const other = G.canBuy(k, 'ek_evoB');
  ok(!other.ok && other.sealed, 'the other branch is sealed for good');
  const reforged = G.reforge(k);
  ok(reforged.sp === 'emberkit' && G.latticeState(k).spent === 0, 'reforging refunds everything and restores the first shape');
  ok(!G.canBuy(k, 'ek_evoB').sealed, 'after reforging the other branch is no longer sealed');
}

/* ---------- battle engine ---------- */
section('battle engine');
const valid = (bt, what) => {
  for (const side of [bt.you, bt.foe]) for (const f of side.party) {
    if (!Number.isFinite(f.hp) || f.hp < 0 || f.hp > f.maxhp) { console.error('   ' + what + ': bad hp ' + f.hp + '/' + f.maxhp + ' on ' + f.name); return false; }
    for (const k in f.stages) if (!Number.isFinite(f.stages[k]) || Math.abs(f.stages[k]) > 6) { console.error('   ' + what + ': bad stage'); return false; }
    if (!Number.isFinite(f.focus) || f.focus < 0 || f.focus > f.focusMax) { console.error('   ' + what + ': bad focus ' + f.focus); return false; }
  }
  return true;
};
G.srand(4242);
let moveErrors = 0;
for (const [id, mv] of Object.entries(G.MOVES)) {
  try {
    const a = G.makeKin('emberkit', 40), d = G.makeKin('gravelump', 40);
    a.moves = [id, 'rend'];
    const bt = G.newBattle([a], [d], { wild: true });
    for (let i = 0; i < 8 && !bt.over; i++) G.resolveTurn(bt, { type: 'move', id });
    if (!valid(bt, 'move ' + id)) { moveErrors++; }
  } catch (e) { console.error('   move ' + id + ' threw: ' + e.message); moveErrors++; }
}
ok(moveErrors === 0, 'all ' + Object.keys(G.MOVES).length + ' moves resolve cleanly');

let abilErrors = 0;
for (const [id, ab] of Object.entries(G.ABILITIES)) {
  try {
    const a = G.makeKin('brookling', 40), d = G.makeKin('zaplet', 40);
    a.abil = [id];
    const bt = G.newBattle([a, G.makeKin('mosskit', 40)], [d], { wild: true });
    for (let i = 0; i < 8 && !bt.over; i++) {
      const me = G.active(bt.you); me.focus = me.focusMax; me.cds = {};
      G.resolveTurn(bt, { type: 'ability', id });
    }
    if (!valid(bt, 'ability ' + id)) abilErrors++;
  } catch (e) { console.error('   ability ' + id + ' threw: ' + e.message); abilErrors++; }
}
ok(abilErrors === 0, 'all ' + Object.keys(G.ABILITIES).length + ' abilities resolve cleanly');

let passErrors = 0;
for (const [id, p] of Object.entries(G.PASSIVES)) {
  try {
    for (const both of [0, 1]) {
      const a = G.makeKin('frostnip', 40), d = G.makeKin('venomite', 40);
      G.autoBuild(a, 'A'); G.autoBuild(d, 'A');
      a.pass = [id]; if (both) d.pass = [id];
      const bt = G.newBattle([a], [d], { wild: true });
      for (let i = 0; i < 30 && !bt.over; i++) G.resolveTurn(bt, { type: 'move', id: a.moves[i % a.moves.length] });
      if (!valid(bt, 'passive ' + id)) { passErrors++; break; }
    }
  } catch (e) { console.error('   passive ' + id + ' threw: ' + e.message); passErrors++; }
}
ok(passErrors === 0, 'all ' + Object.keys(G.PASSIVES).length + ' passives survive a full battle, mirrored');

/* full random battles must terminate and stay sane */
{
  const ids = Object.keys(G.SPECIES);
  let stuck = 0, crashed = 0, wins = 0, losses = 0, turns = 0;
  for (let n = 0; n < 240; n++) {
    try {
      const mk = () => { const k = G.wildKin(ids[Math.floor(Math.random() * ids.length)], 20 + Math.floor(Math.random() * 30)); return k; };
      const you = [mk(), mk()], foe = [mk(), mk()];
      const bt = G.newBattle(you, foe, { wild: false, warden: true });
      let t = 0;
      while (!bt.over && t < 400) {
        t++;
        if (bt.pending === 'replace') { const i = bt.you.party.findIndex(x => x.hp > 0); if (i < 0) break; bt.you.idx = i; bt.pending = null; continue; }
        const me = G.active(bt.you);
        const act = G.aiChoose({ ...bt, foe: bt.you, you: bt.foe });
        G.resolveTurn(bt, act && act.type === 'move' && me.moves.includes(act.id) ? act : { type: 'move', id: me.moves[0] });
        if (!valid(bt, 'random battle')) { crashed++; break; }
      }
      turns += t;
      if (t >= 400) stuck++;
      if (bt.result === 'won') wins++; else if (bt.result === 'lost') losses++;
    } catch (e) { console.error('   random battle threw: ' + e.message + '\n' + e.stack.split('\n')[1]); crashed++; }
  }
  ok(crashed === 0, '240 random battles run without error');
  ok(stuck === 0, 'no battle stalls past 400 turns');
  ok(wins + losses > 200, 'battles reach a decision (' + (wins + losses) + '/240, avg ' + (turns / 240).toFixed(1) + ' turns)');
}

/* ---------- world ---------- */
section('world');
for (const z of G.ZONES) {
  ok(z.lv[0] < z.lv[1] && z.steps > 4, z.id + ': sane level band and length');
  ok(!!G.WARDENS[z.warden], z.id + ': warden exists');
  for (const [sp] of z.wild) ok(!!G.SPECIES[sp], z.id + ': wild kin ' + sp + ' exists');
  ok(!!z.blurb && !!z.hue, z.id + ': described and coloured');
}
for (const [id, w] of Object.entries(G.WARDENS)) {
  ok(w.team.length >= 2, id + ': fields a real team');
  ok(!!G.ITEMS[w.prize], id + ': prize is a real item');
  const team = G.wardenTeam(id);
  ok(team.length === w.team.length, id + ': team builds');
  ok(team.every(k => k.moves.length >= 1 && k.hp > 0), id + ': every warden kin is armed and standing');
  const nodes = team.reduce((n, k) => n + k.nodes.length, 0);
  ok(nodes > team.length * 4, id + ': warden kin have real lattice builds (' + nodes + ' nodes)');
}
for (const id of G.SHOP_STOCK) ok(!!G.ITEMS[id], 'shop stocks a real item: ' + id);
{
  const you = G.makeKin('emberkit', 20), foe = G.wildKin('gustling', 20);
  const bt = G.newBattle([you], [foe], { wild: true });
  const full = G.catchOdds(bt, 'bindstone');
  G.active(bt.foe).hp = 1;
  const hurt = G.catchOdds(bt, 'bindstone');
  const rift = G.catchOdds(bt, 'riftstone');
  ok(hurt > full, 'a worn-down kin is easier to bind');
  ok(rift > hurt, 'a better stone binds better');
  ok(full > 0 && rift <= 0.96, 'capture odds stay in range');
}

console.log(`\n${fails ? 'FAILED' : 'PASSED'}  ${checks - fails}/${checks} checks`);
process.exit(fails ? 1 : 0);
