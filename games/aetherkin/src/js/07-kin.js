/* ============================================================================
   KIN — a bound creature: its level, its Motes, and the nodes it has lit.
   ========================================================================== */
const LV_CAP = 50;
const MOVE_SLOTS = 4;
const ABIL_SLOTS = 2;
const passiveSlots = kin => 2 + (SPECIES[kin.sp].stage >= 2 ? 1 : 0);

const totalXpFor = lv => Math.round(1.2 * Math.pow(lv, 3));
const xpToNext = lv => (lv >= LV_CAP ? 0 : totalXpFor(lv + 1) - totalXpFor(lv));
/* one Mote per level, and a bonus Mote every tenth */
const motesForLevel = lv => (lv - 1) + Math.floor(lv / 10);

let _uid = 1;
function makeKin(speciesId, level, opts) {
  const o = opts || {};
  const sp = SPECIES[speciesId];
  const kin = {
    uid: _uid++, sp: speciesId, nick: o.nick || null, lv: clamp(level, 1, LV_CAP), xp: 0,
    res: {}, nodes: [], moves: [], abil: [], pass: [], hp: 0, spent: 0, bonusMotes: 0, caught: o.caught || null,
  };
  for (const k of STATS) kin.res[k] = o.perfect ? 15 : ri(0, 15);
  kin.xp = totalXpFor(kin.lv);
  /* the core node is lit for free */
  const lat = LATTICES[sp.fam];
  const core = lat.nodes.find(n => n.k === 'core');
  if (core) kin.nodes.push(core.id);
  kin.moves = [sp.innate, 'rend'].slice(0, MOVE_SLOTS);
  kin.hp = statsFor(kin).hp;
  if (o.build) for (const id of o.build) buyNode(kin, id, true);
  kin.hp = statsFor(kin).hp;
  return kin;
}

const kinName = kin => kin.nick || SPECIES[kin.sp].n;
const kinSpecies = kin => SPECIES[kin.sp];
const kinLattice = kin => LATTICES[SPECIES[kin.sp].fam];
const findNode = (kin, id) => kinLattice(kin).nodes.find(n => n.id === id);

/* flat stat bonuses granted by lit stat-nodes */
function latticeBonus(kin) {
  const out = { hp: 0, frc: 0, grd: 0, arc: 0, wrd: 0, swf: 0 };
  for (const id of kin.nodes) {
    const n = findNode(kin, id);
    if (n && n.stat) for (const k in n.stat) out[k] += n.stat[k];
  }
  return out;
}

function statsFor(kin) {
  const sp = SPECIES[kin.sp], lv = kin.lv, bonus = latticeBonus(kin), out = {};
  out.hp = Math.floor((2 * sp.base.hp + kin.res.hp) * lv / 100) + lv + 10 + bonus.hp;
  for (const k of ['frc', 'grd', 'arc', 'wrd', 'swf'])
    out[k] = Math.floor((2 * sp.base[k] + kin.res[k]) * lv / 100) + 5 + bonus[k];
  return out;
}
/* 0-100: how cleanly this individual resonates with its species */
const resonance = kin => Math.round(STATS.reduce((n, k) => n + kin.res[k], 0) / (STATS.length * 15) * 100);

/* ---------------- the lattice ------------------------------------------- */
function latticeState(kin) {
  const owned = new Set(kin.nodes);
  let spent = 0;
  const fam = SPECIES[kin.sp].fam;
  for (const id of kin.nodes) { const n = findNode(kin, id); if (n) spent += nodeCost(fam, n); }
  const total = motesForLevel(kin.lv) + (kin.bonusMotes || 0);
  return { owned, spent, total, free: total - spent };
}

/* Walk back up the requirement chain: if any ancestor sits on a branch this
   kin has closed off, the whole limb below it is closed too. */
function sealedBy(kin, node, lat, owned, depth) {
  if ((depth || 0) > 12) return null;
  if (node.excl) {
    const clash = lat.nodes.find(n => n.excl === node.excl && n.id !== node.id && owned.has(n.id));
    if (clash) return clash;
  }
  for (const r of (node.req || [])) {
    if (owned.has(r)) continue;
    const parent = lat.nodes.find(n => n.id === r);
    if (!parent) continue;
    const s = sealedBy(kin, parent, lat, owned, (depth || 0) + 1);
    if (s) return s;
  }
  return null;
}

function canBuy(kin, nodeId) {
  const fam = SPECIES[kin.sp].fam, lat = LATTICES[fam];
  const node = lat.nodes.find(n => n.id === nodeId);
  if (!node) return { ok: false, why: 'No such node.' };
  const st = latticeState(kin);
  if (st.owned.has(nodeId)) return { ok: false, why: 'Already lit.' };
  const seal = sealedBy(kin, node, lat, st.owned);
  if (seal) return { ok: false, why: 'Closed off for good by ' + nodeLabel(seal) + '.', sealed: true };
  const missing = (node.req || []).filter(r => !st.owned.has(r));
  if (missing.length) {
    const names = missing.map(r => nodeLabel(lat.nodes.find(n => n.id === r)));
    return { ok: false, why: 'Needs ' + names.join(' and ') + ' first.', locked: true };
  }
  const lv = nodeLevel(fam, node);
  if (kin.lv < lv) return { ok: false, why: 'Opens at level ' + lv + '.', early: true };
  if (node.k === 'evolve' && SPECIES[node.ref].from !== kin.sp)
    return { ok: false, why: 'Only ' + SPECIES[SPECIES[node.ref].from].n + ' can take this shape.', sealed: true };
  const cost = nodeCost(fam, node);
  if (st.free < cost) return { ok: false, why: 'Needs ' + cost + ' ' + plural(cost, 'Mote') + ' — ' + st.free + ' free.', poor: true };
  return { ok: true, cost };
}

function buyNode(kin, nodeId, force) {
  if (!force) { const c = canBuy(kin, nodeId); if (!c.ok) return c; }
  const lat = kinLattice(kin);
  const node = lat.nodes.find(n => n.id === nodeId);
  if (!node || kin.nodes.includes(nodeId)) return { ok: false, why: 'No such node.' };
  kin.nodes.push(nodeId);
  const events = [];
  if (node.k === 'move' || node.k === 'core') {
    if (kin.moves.length < MOVE_SLOTS && !kin.moves.includes(node.ref)) kin.moves.push(node.ref);
    events.push({ kind: 'move', ref: node.ref });
  } else if (node.k === 'ability') {
    if (kin.abil.length < ABIL_SLOTS && !kin.abil.includes(node.ref)) kin.abil.push(node.ref);
    events.push({ kind: 'ability', ref: node.ref });
  } else if (node.k === 'passive') {
    if (kin.pass.length < passiveSlots(kin) && !kin.pass.includes(node.ref)) kin.pass.push(node.ref);
    events.push({ kind: 'passive', ref: node.ref });
  } else if (node.k === 'evolve') {
    const before = statsFor(kin), ratio = kin.hp / before.hp;
    kin.sp = node.ref;
    kin.hp = Math.max(1, Math.round(statsFor(kin).hp * ratio));
    events.push({ kind: 'evolve', ref: node.ref });
  } else if (node.k === 'stat') {
    const gained = statsFor(kin).hp;
    kin.hp = Math.min(gained, kin.hp + (node.stat.hp || 0));
    events.push({ kind: 'stat', ref: node.n });
  }
  return { ok: true, events, node };
}

/* Reforging returns every Mote and puts the kin back in its first shape. */
function reforge(kin) {
  const lat = kinLattice(kin);
  const core = lat.nodes.find(n => n.k === 'core');
  let base = SPECIES[kin.sp];
  while (base.from) base = SPECIES[base.from];
  kin.sp = base.id;
  kin.nodes = core ? [core.id] : [];
  kin.moves = [base.innate, 'rend'];
  kin.abil = []; kin.pass = [];
  kin.hp = statsFor(kin).hp;
  return kin;
}

/* ---------------- learned pools & loadout ------------------------------- */
const UNIVERSAL_MOVES = ['rend', 'pulse', 'brace', 'quickstep'];
function loadoutOf(kin) {
  const moves = new Set(UNIVERSAL_MOVES), abil = new Set(), pass = new Set();
  for (const id of kin.nodes) {
    const n = findNode(kin, id); if (!n) continue;
    if (n.k === 'move' || n.k === 'core') moves.add(n.ref);
    else if (n.k === 'ability') abil.add(n.ref);
    else if (n.k === 'passive') pass.add(n.ref);
  }
  moves.add(SPECIES[kin.sp].innate);
  return { moves: [...moves], abil: [...abil], pass: [...pass] };
}
function equip(kin, kind, ref) {
  const pool = loadoutOf(kin);
  const list = kind === 'move' ? kin.moves : kind === 'ability' ? kin.abil : kin.pass;
  const cap = kind === 'move' ? MOVE_SLOTS : kind === 'ability' ? ABIL_SLOTS : passiveSlots(kin);
  const have = kind === 'move' ? pool.moves : kind === 'ability' ? pool.abil : pool.pass;
  const i = list.indexOf(ref);
  if (i >= 0) { if (kind === 'move' && list.length <= 1) return false; list.splice(i, 1); return true; }
  if (!have.includes(ref) || list.length >= cap) return false;
  list.push(ref); return true;
}

/* ---------------- experience -------------------------------------------- */
function grantXp(kin, amount) {
  const out = { gained: amount, levels: [], motes: 0 };
  if (kin.lv >= LV_CAP) { out.gained = 0; return out; }
  const before = motesForLevel(kin.lv);
  kin.xp += amount;
  while (kin.lv < LV_CAP && kin.xp >= totalXpFor(kin.lv + 1)) {
    const hpBefore = statsFor(kin).hp;
    kin.lv++;
    kin.hp += statsFor(kin).hp - hpBefore;
    out.levels.push(kin.lv);
  }
  if (kin.lv >= LV_CAP) kin.xp = Math.min(kin.xp, totalXpFor(LV_CAP));
  out.motes = motesForLevel(kin.lv) - before;
  return out;
}
const xpProgress = kin => {
  if (kin.lv >= LV_CAP) return 1;
  const lo = totalXpFor(kin.lv), hi = totalXpFor(kin.lv + 1);
  return clamp((kin.xp - lo) / (hi - lo), 0, 1);
};
const xpYield = (sp, lv) => Math.max(8, Math.round(sp.xp * lv / 5));

function nodeLabel(node) {
  if (!node) return '?';
  if (node.n) return node.n;
  if (node.k === 'move' || node.k === 'core') return MOVES[node.ref] ? MOVES[node.ref].n : node.ref;
  if (node.k === 'ability') return ABILITIES[node.ref] ? ABILITIES[node.ref].n : node.ref;
  if (node.k === 'passive') return PASSIVES[node.ref] ? PASSIVES[node.ref].n : node.ref;
  if (node.k === 'evolve') return 'Become ' + (SPECIES[node.ref] ? SPECIES[node.ref].n : node.ref);
  return node.id;
}
function nodeBlurb(node) {
  if (node.k === 'move' || node.k === 'core') { const m = MOVES[node.ref]; return m ? m.d : ''; }
  if (node.k === 'ability') { const a = ABILITIES[node.ref]; return a ? a.d : ''; }
  if (node.k === 'passive') { const p = PASSIVES[node.ref]; return p ? p.d : ''; }
  if (node.k === 'evolve') { const s = SPECIES[node.ref]; return s ? 'Takes the shape of ' + s.n + ' — ' + s.t.map(typeName).join(' / ') + '. This closes the other branch for good.' : ''; }
  if (node.k === 'stat') return Object.keys(node.stat).map(k => signed(node.stat[k]) + ' ' + STAT_NAME[k]).join(', ') + '.';
  return '';
}
const nodeHue = (kin, node) => {
  if (node.k === 'move' || node.k === 'core') return typeHue(MOVES[node.ref] ? MOVES[node.ref].t : 'aether');
  if (node.k === 'evolve') return typeHue(SPECIES[node.ref].t[0]);
  return { passive: '#9B77D6', ability: '#3FA9DE', stat: '#D9A441' }[node.k] || '#B9C2DA';
};
