/* ============================================================================
   WORLD — bag, zones, wardens, capture, saving.
   ========================================================================== */
const ITEMS = {
  bindstone:  { n: 'Bindstone', kind: 'stone', power: 1.0, cost: 110, d: 'A common binding stone. Works best on kin that are already worn down.' },
  keenstone:  { n: 'Keenstone', kind: 'stone', power: 1.7, cost: 340, d: 'Cut to a finer edge. Noticeably better odds on a stubborn kin.' },
  riftstone:  { n: 'Riftstone', kind: 'stone', power: 2.8, cost: 950, d: 'Quarried from the Spire itself. Very few kin slip a Riftstone.' },
  salve:      { n: 'Field Salve', kind: 'heal', amount: 70, cost: 90, d: 'Mends 70 vitality on one kin.' },
  draught:    { n: 'Deep Draught', kind: 'heal', amount: 200, cost: 260, d: 'Mends 200 vitality on one kin.' },
  panacea:    { n: 'Panacea', kind: 'cure', cost: 210, d: 'Clears every status from one kin.' },
  tonic:      { n: 'Focus Tonic', kind: 'focus', amount: 3, cost: 170, d: 'Restores 3 Focus in battle.' },
  waking_ash: { n: 'Waking Ash', kind: 'revive', frac: 0.5, cost: 620, d: 'Wakes an unbound kin at half vitality.' },
  mote_shard: { n: 'Mote Shard', kind: 'mote', cost: 1600, d: 'Crystallised growth. Grants one kin a permanent extra Mote.' },
  ether:      { n: 'Growth Ether', kind: 'xp', amount: 1400, cost: 700, d: 'Grants 1400 experience to one kin.' },
};
const SHOP_STOCK = ['bindstone', 'keenstone', 'riftstone', 'salve', 'draught', 'panacea', 'tonic', 'waking_ash', 'ether', 'mote_shard'];

const ZONES = [
  { id: 'verge', n: 'Cinderfall Verge', hue: '#F2683C', lv: [3, 6], steps: 12, gold: [30, 70], warden: 'sela',
    blurb: 'Scrub and black glass on the slope of a vent that has not gone out in living memory. Warm underfoot, even at night.',
    wild: [['emberkit', 5], ['gravelump', 4], ['gustling', 3], ['scrapjaw', 2]] },
  { id: 'fen', n: 'Brackmere Fen', hue: '#3FA9DE', lv: [9, 14], steps: 14, gold: [60, 130], warden: 'ovid',
    blurb: 'Standing water over peat, and peat over something older. The paths move between visits and nobody has ever mapped it twice.',
    wild: [['brookling', 5], ['mosskit', 4], ['venomite', 4], ['shadeling', 2]] },
  { id: 'shelf', n: 'Thundershelf', hue: '#F0C33C', lv: [16, 22], steps: 15, gold: [110, 220], warden: 'kesh',
    blurb: 'A limestone table two hundred feet above the plain, where the weather arrives from underneath.',
    wild: [['zaplet', 5], ['gustling', 4], ['scrapjaw', 3], ['glimmoth', 3], ['frostnip', 2]] },
  { id: 'wood', n: 'Hollowlight Wood', hue: '#5FBF6A', lv: [24, 31], steps: 16, gold: [190, 340], warden: 'maren',
    blurb: 'Old growth that holds the light it caught during the day and lets it back out slowly after dark. Nothing here is in a hurry.',
    wild: [['mosskit', 4], ['glimmoth', 4], ['shadeling', 3], ['nullwisp', 3], ['venomite', 2], ['bloomwisp', 1]] },
  { id: 'spire', n: 'The Rift Spire', hue: '#9B77D6', lv: [33, 42], steps: 18, gold: [300, 520], warden: 'vail',
    blurb: 'The place all of this comes from. The stair goes up further than the outside of the building allows.',
    wild: [['nullwisp', 3], ['frostnip', 3], ['cinderfox', 2], ['maelstrix', 2], ['voltairn', 2], ['glacianth', 2], ['duskmoth', 2], ['quakemaw', 2]] },
];
const zoneById = id => ZONES.find(z => z.id === id);

const WARDENS = {
  sela:  { n: 'Warden Sela', title: 'Keeper of the Verge', hue: '#F2683C', reward: 420, prize: 'keenstone',
    intro: '“You have got one kin and a handful of Motes. Show me you know where they went.”',
    beat: '“Better than most. The Fen will not be as patient with you as I was.”',
    team: [{ sp: 'gravelump', lv: 8, prefer: 'A' }, { sp: 'emberkit', lv: 10, prefer: 'B' }] },
  ovid:  { n: 'Warden Ovid', title: 'Fenwarden', hue: '#3FA9DE', reward: 780, prize: 'panacea',
    intro: '“Everything in this water is patient. I hope you brought something that lasts.”',
    beat: '“You did not out-hit me. You out-waited me. That is the harder lesson, so — good.”',
    team: [{ sp: 'venomite', lv: 15, prefer: 'A' }, { sp: 'brookling', lv: 16, prefer: 'A' }, { sp: 'shadeling', lv: 17, prefer: 'B' }] },
  kesh:  { n: 'Warden Kesh', title: 'Of the Shelf', hue: '#F0C33C', reward: 1300, prize: 'riftstone',
    intro: '“Up here the weather comes from below. So does everything else. Keep up.”',
    beat: '“Fast enough. Go and be fast somewhere greener.”',
    team: [{ sp: 'gustling', lv: 22, prefer: 'A' }, { sp: 'scrapjaw', lv: 23, prefer: 'B' }, { sp: 'voltairn', lv: 25, prefer: 'A' }] },
  maren: { n: 'Warden Maren', title: 'Of the Hollowlight', hue: '#5FBF6A', reward: 2100, prize: 'mote_shard',
    intro: '“Nothing in this wood needs to beat you today. It only needs to still be standing tomorrow.”',
    beat: '“You spent your Motes well. Most Binders spend them fast instead.”',
    team: [{ sp: 'bloomwisp', lv: 30, prefer: 'B' }, { sp: 'thornmane', lv: 31, prefer: 'A' }, { sp: 'solmoth', lv: 32, prefer: 'A' }] },
  vail:  { n: 'Arch-Binder Vail', title: 'At the Top of the Stair', hue: '#9B77D6', reward: 4000, prize: 'riftstone',
    intro: '“I read your lattice on the way up. I know which branch you took. Convince me it was the right one.”',
    beat: '“It was the right one. Or you made it right, which counts for more.”',
    team: [{ sp: 'oracline', lv: 40, prefer: 'A' }, { sp: 'bastionox', lv: 41, prefer: 'A' }, { sp: 'cinderfox', lv: 42, prefer: 'B' }, { sp: 'voidmind', lv: 44, prefer: 'B' }] },
};

/* ---------------- automatic lattice builds ------------------------------ */
/* Wild kin and warden kin light their own lattices, so a level-30 wild is a
   real build and not a bag of base stats. */
function autoBuild(kin, prefer) {
  const lat = kinLattice(kin);
  const side = prefer === 'B' ? 1 : -1;
  for (let guard = 0; guard < 120; guard++) {
    const st = latticeState(kin);
    const options = lat.nodes.filter(n => !st.owned.has(n.id) && canBuy(kin, n.id).ok);
    if (!options.length) break;
    const score = n => {
      let s = (6 - n.r) * 6 + rnd() * 4;
      if (n.k === 'evolve') s += (SPECIES[n.ref].branch === (prefer || 'A')) ? 400 : -900;
      if (Math.sign(n.c) === side || n.c === 0) s += 14;
      return s;
    };
    const best = options.sort((a, b) => score(b) - score(a))[0];
    if (score(best) < -100) break;
    if (!buyNode(kin, best.id).ok) break;
  }
  autoEquip(kin);
  kin.hp = statsFor(kin).hp;
  return kin;
}
function autoEquip(kin) {
  const pool = loadoutOf(kin);
  const rank = id => { const m = MOVES[id]; if (!m) return 0; return (m.c === 'stat' ? 55 : (m.p || 0)) + (m.t !== 'aether' ? 25 : 0); };
  const wanted = pool.moves.slice().sort((a, b) => rank(b) - rank(a)).slice(0, MOVE_SLOTS);
  if (!wanted.includes(SPECIES[kin.sp].innate)) wanted[wanted.length - 1] = SPECIES[kin.sp].innate;
  kin.moves = wanted.length ? wanted : ['rend'];
  kin.abil = pool.abil.slice(0, ABIL_SLOTS);
  kin.pass = pool.pass.slice(0, passiveSlots(kin));
  return kin;
}
function wildKin(speciesId, level) {
  const kin = makeKin(speciesId, level);
  autoBuild(kin, chance(0.5) ? 'A' : 'B');
  return kin;
}
function wardenTeam(id) {
  const w = WARDENS[id];
  return w.team.map(m => { const k = makeKin(m.sp, m.lv, { perfect: false }); k.bonusMotes = 4; autoBuild(k, m.prefer); k.hp = statsFor(k).hp; return k; });
}

/* ---------------- capture ----------------------------------------------- */
function catchOdds(bt, stoneId) {
  const f = active(bt.foe), sp = SPECIES[f.sp], stone = ITEMS[stoneId];
  const hpFactor = (3 * f.maxhp - 2 * f.hp) / (3 * f.maxhp);
  let bonus = 1;
  if (f.status === 'chill' || f.status === 'shock') bonus = 2;
  else if (f.status) bonus = 1.5;
  if (f.marks.root) bonus *= 1.15;
  const a = sp.catch * stone.power * hpFactor * bonus * 3.2;
  return clamp(a / 255, 0.02, 0.96);
}
function useItemInBattle(bt, itemId, targetIdx) {
  const item = ITEMS[itemId];
  if (!item) return;
  const you = bt.you;
  if (item.kind === 'stone') {
    if (!bt.wild) { bt.say('A warden’s kin cannot be bound.', 'weak'); return; }
    const f = active(bt.foe);
    const p = catchOdds(bt, itemId);
    bt.say('You throw a ' + item.n + ' at ' + f.name + '.', 'act');
    const per = Math.pow(p, 1 / 3);
    let shakes = 0;
    while (shakes < 3 && chance(per)) shakes++;
    bt.shakes = shakes;
    if (shakes >= 3) {
      bt.over = true; bt.result = 'caught';
      f.kin.hp = f.hp;
      bt.caught = f.kin;
      bt.say(f.name + ' is bound.', 'crit');
    } else {
      bt.say(['It does not even settle.', 'One turn — and it is out.', 'Two turns. So close.'][shakes], 'weak');
    }
    return;
  }
  const target = you.party[targetIdx === undefined ? you.idx : targetIdx];
  if (!target) return;
  if (item.kind === 'heal') { if (isDown(target)) { bt.say(target.name + ' is past a salve.', 'weak'); return; } healFighter(bt, target, item.amount); }
  else if (item.kind === 'cure') { target.status = null; target.statusTurns = 0; target.marks = {}; bt.say(target.name + ' is cleared.', 'good'); }
  else if (item.kind === 'focus') { target.focus = Math.min(target.focusMax, target.focus + item.amount); bt.say(target.name + ' steadies — Focus ' + target.focus + '.', 'good'); }
  else if (item.kind === 'revive') {
    if (!isDown(target)) { bt.say(target.name + ' is still standing.', 'weak'); return; }
    target.hp = Math.round(target.maxhp * item.frac); target.down = false;
    bt.say(target.name + ' is bound back into the world.', 'good');
  }
}

/* ---------------- game state & saving ----------------------------------- */
const SAVE_KEY = 'aetherkin.save.v1';
const GAME = {
  binder: 'Binder', party: [], box: [], bag: {}, gold: 320,
  zone: 0, step: 0, cleared: [], seen: {}, bound: {}, started: false, wins: 0, version: 1,
};
const bagCount = id => GAME.bag[id] || 0;
const addItem = (id, n) => { GAME.bag[id] = (GAME.bag[id] || 0) + (n === undefined ? 1 : n); };
const takeItem = id => { if (!GAME.bag[id]) return false; GAME.bag[id]--; if (!GAME.bag[id]) delete GAME.bag[id]; return true; };
const partyAlive = () => GAME.party.some(k => k.hp > 0);
const unlockedZones = () => ZONES.filter((z, i) => i === 0 || GAME.cleared.includes(ZONES[i - 1].id));

function addKin(kin) {
  GAME.bound[kin.sp] = true;
  GAME.seen[kin.sp] = true;
  if (GAME.party.length < 4) { GAME.party.push(kin); return 'party'; }
  GAME.box.push(kin); return 'box';
}
function restParty() { for (const k of GAME.party) k.hp = statsFor(k).hp; }

function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      binder: GAME.binder, party: GAME.party, box: GAME.box, bag: GAME.bag, gold: GAME.gold,
      zone: GAME.zone, step: GAME.step, cleared: GAME.cleared, seen: GAME.seen, bound: GAME.bound,
      started: GAME.started, wins: GAME.wins, version: GAME.version,
    }));
    return true;
  } catch (e) { return false; }
}
function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const d = JSON.parse(raw);
    if (!d || !d.started || !Array.isArray(d.party)) return false;
    /* drop anything a later build no longer knows about */
    d.party = d.party.filter(k => k && SPECIES[k.sp]);
    d.box = (d.box || []).filter(k => k && SPECIES[k.sp]);
    if (!d.party.length) return false;
    for (const k of d.party.concat(d.box)) {
      k.nodes = (k.nodes || []).filter(id => findNode(k, id));
      const pool = loadoutOf(k);
      k.moves = (k.moves || []).filter(m => pool.moves.includes(m));
      if (!k.moves.length) k.moves = [SPECIES[k.sp].innate];
      k.abil = (k.abil || []).filter(a => pool.abil.includes(a));
      k.pass = (k.pass || []).filter(p => pool.pass.includes(p));
      k.hp = clamp(k.hp || 0, 0, statsFor(k).hp);
      if (!k.res) { k.res = {}; for (const s of STATS) k.res[s] = 8; }
    }
    Object.assign(GAME, d);
    _uid = Math.max(1, ...GAME.party.concat(GAME.box).map(k => k.uid || 0)) + 1;
    return true;
  } catch (e) { return false; }
}
const hasSave = () => { try { const r = localStorage.getItem(SAVE_KEY); return !!r && JSON.parse(r).started; } catch (e) { return false; } };
const wipeSave = () => { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} };

/* ---------------- exploration ------------------------------------------- */
function rollEncounter(zone) {
  const lv = ri(zone.lv[0], zone.lv[1]);
  const sp = weighted(zone.wild);
  GAME.seen[sp] = true;
  return wildKin(sp, lv);
}
function exploreStep(zone) {
  GAME.step++;
  if (GAME.step >= zone.steps) return { kind: 'warden', warden: zone.warden };
  const roll = weighted([['wild', 62], ['gold', 14], ['item', 12], ['quiet', 12]]);
  if (roll === 'wild') return { kind: 'wild', kin: rollEncounter(zone) };
  if (roll === 'gold') { const g = ri(zone.gold[0], zone.gold[1]); GAME.gold += g; return { kind: 'gold', gold: g }; }
  if (roll === 'item') {
    const tier = ZONES.indexOf(zone);
    const id = weighted([['salve', 30], ['bindstone', 26], ['tonic', 14], ['keenstone', tier >= 1 ? 14 : 4],
      ['draught', tier >= 1 ? 12 : 3], ['panacea', 8], ['waking_ash', tier >= 2 ? 7 : 2], ['ether', tier >= 3 ? 6 : 1], ['riftstone', tier >= 3 ? 4 : 0]]);
    addItem(id); return { kind: 'item', item: id };
  }
  return { kind: 'quiet' };
}
const QUIET_LINES = [
  'Nothing on the path. The light shifts and settles.',
  'Something watches from cover and decides against it.',
  'You find a Binder’s old camp ring, long cold.',
  'Tracks, crossing yours, going the other way.',
  'The wind turns over and the air tastes of aether.',
  'A shed carapace, still warm. Its owner is nearby and does not want company.',
];
