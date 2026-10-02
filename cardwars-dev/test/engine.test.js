// Rule tests for the Card Wars engine (show rules). Run: node test/engine.test.js  (FROM=src to test sources)
'use strict';
const { Engine: E, AI } = require('./load')({ from: process.env.FROM || undefined });
const K = E.kit;

let pass = 0, fail = 0;
const fails = [];
function test(name, fn) {
  try { fn(); pass++; } catch (e) { fail++; fails.push(name + '\n    ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n    ') : e)); }
}
function eq(a, b, msg) { if (a !== b) throw new Error((msg ? msg + ': ' : '') + 'expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a)); }
function ok(c, msg) { if (!c) throw new Error(msg || 'assertion failed'); }
function run(st, cmd) { const r = E.apply(st, cmd); if (r.error) throw new Error('command failed: ' + r.error + ' ' + JSON.stringify(cmd)); return r; }
function err(st, cmd) { return E.apply(st, cmd).error; }

const FILL = Array(20).fill('r_pancakes');
// Board-only scenario: player 0 to act on turn 3 with 2 Actions, empty hands, empty boards (no landmarks).
function arena(o) {
  o = o || {};
  const g = E.newGame({ seed: o.seed || 'arena', first: 0, noMulligan: true, noSetup: true, players: [
    { deck: { lands: o.lands0 || ['nice', 'nice', 'nice', 'nice'], cards: FILL } },
    { deck: { lands: o.lands1 || ['nice', 'nice', 'nice', 'nice'], cards: FILL } }] });
  const st = g.state;
  K.clear(st);
  st.turn = o.turn || 3; st.round = Math.ceil(st.turn / 2); st.active = 0; st.pending = null;
  st.players[0].hand = []; st.players[1].hand = [];
  st.players[0].actions = 2; st.players[1].actions = 2;
  K.deck(st, 0, Array(10).fill('r_pancakes')); K.deck(st, 1, Array(10).fill('r_pancakes'));
  return st;
}
const C = (st, s, l) => st.players[s].lanes[l].creature;
const B = (st, s, l) => st.players[s].lanes[l].building;
const hand = (st, s, id) => st.players[s].hand.find(c => c.id === id);
// Call BATTLE; if the defender gets a window, they take it without doing anything.
function battle(st) {
  let s = run(st, { t: 'battle', p: st.active }).state;
  if (s.pending && s.pending.kind === 'defend') s = run(s, { t: 'defend', p: s.pending.side }).state;
  return s;
}
// The other player takes a quiet turn (discard if asked, then BATTLE with no attacks).
function passTurn(st) {
  let s = st;
  if (s.pending && s.pending.kind === 'discard') s = run(s, { t: 'discard', p: s.pending.side, uid: s.players[s.pending.side].hand[0].uid }).state;
  return battle(s);
}

// ---------------------------------------------------------------- setup & turn flow
test('new game: kingdom landmarks stand on the lands; the second player holds one extra card', () => {
  const st = E.newGame({ seed: 's1', first: 0, players: [{ deck: E.STARTERS.blue }, { deck: E.STARTERS.corn }] }).state;
  eq(st.phase, 'mulligan');
  eq(st.players[0].hand.length, 5); eq(st.players[1].hand.length, 6);
  eq(B(st, 0, 0).id, 'b_school'); ok(B(st, 0, 0).kingdom); eq(B(st, 0, 2).id, 'k_fortress');
  eq(B(st, 1, 0).id, 'k_corncastle'); eq(B(st, 1, 2).id, 'c_dome');
  eq(E.kingdomSize(st, 0), 2); eq(E.kingdomSize(st, 1), 2);
  for (const p of [0, 1]) eq(st.players[p].hand.length + st.players[p].deck.length, 20);
});
test('one mulligan each, then a secret setup: 2 Actions, 3 for the player going second', () => {
  let st = E.newGame({ seed: 's2', first: 1, players: [{ deck: E.STARTERS.blue }, { deck: E.STARTERS.corn }] }).state;
  st = run(st, { t: 'mulligan', p: 0, redraw: true }).state;
  eq(err(st, { t: 'mulligan', p: 0, redraw: true }), 'Already decided');
  eq(st.players[0].hand.length, 6, 'a mulligan keeps the hand size');
  st = run(st, { t: 'mulligan', p: 1, redraw: false }).state;
  eq(st.phase, 'setup'); eq(st.players[1].actions, 2); eq(st.players[0].actions, 3);
});
test('setup: cards go down hidden, then "floop your land cards" reveals the board and starts the game', () => {
  let st = E.newGame({ seed: 's3', first: 0, noMulligan: true, players: [{ deck: E.STARTERS.blue }, { deck: E.STARTERS.corn }] }).state;
  eq(st.phase, 'setup');
  K.hand(st, 0, ['b_cooldog', 'b_math', 'b_skypup']);
  eq(E.playBlock(st, 0, hand(st, 0, 'b_math').uid), 'Set up creatures and buildings only');
  st = run(st, { t: 'play', p: 0, uid: hand(st, 0, 'b_cooldog').uid, lane: 1 }).state;
  eq(C(st, 0, 1).id, 'b_cooldog'); eq(st.players[0].actions, 1);
  const red = E.redact(st, 1);
  eq(red.players[0].lanes[1].creature, null, 'keep those honeys hidden');
  ok(red.players[0].lanes[0].building, 'landmarks are public');
  let r = run(st, { t: 'ready', p: 0 }); st = r.state;
  eq(st.phase, 'setup'); ok(r.events.some(e => e.t === 'setupDone'));
  eq(err(st, { t: 'play', p: 0, uid: st.players[0].hand[0].uid, lane: 2 }), 'Already set up');
  r = run(st, { t: 'ready', p: 1 }); st = r.state;
  eq(st.phase, 'main'); ok(r.events.some(e => e.t === 'kingdom'));
  eq(st.turn, 1); eq(st.active, 0); eq(st.players[0].actions, 2);
  eq(st.pending, null, 'the first player skips the discard on turn 1');
});
test('"You\'re supposed to discard a card and pick up a new one first" - then the hand refills to 5', () => {
  let st = arena();
  K.put(st, 0, 0, 'r_hotdog'); K.put(st, 1, 0, 'r_hotdog');
  K.hand(st, 1, ['r_pancakes', 'r_teleport']);
  st = battle(st);
  eq(st.active, 1); eq(st.pending && st.pending.kind, 'discard');
  eq(err(st, { t: 'draw', p: 1 }), 'Finish your choice first');
  eq(err(st, { t: 'discard', p: 0, uid: 1 }), 'Nothing to discard now');
  st = run(st, { t: 'discard', p: 1, uid: st.players[1].hand[0].uid }).state;
  eq(st.pending, null); eq(st.players[1].discard.length, 1); eq(st.players[1].hand.length, 5);
});
test('the discard step always picks up at least one card', () => {
  let st = arena();
  K.put(st, 0, 0, 'r_hotdog'); K.put(st, 1, 0, 'r_hotdog');
  K.hand(st, 1, Array(7).fill('r_teleport'));
  st = battle(st);
  st = run(st, { t: 'discard', p: 1, uid: st.players[1].hand[0].uid }).state;
  eq(st.players[1].hand.length, 7);
});
test('2 Actions a turn: picking up a card costs 1', () => {
  const st = arena(); K.put(st, 0, 0, 'r_hotdog');
  let s = run(st, { t: 'draw', p: 0 }).state; eq(s.players[0].actions, 1); eq(s.players[0].hand.length, 1);
  s = run(s, { t: 'draw', p: 0 }).state; eq(s.players[0].actions, 0);
  eq(err(s, { t: 'draw', p: 0 }), 'Needs 1 Action');
  eq(err(s, { t: 'draw', p: 1 }), 'Not your turn');
});
test('a card costs as many Actions as face-up landscapes of its type it needs; Rainbow needs none', () => {
  const st = arena({ lands0: ['blue', 'blue', 'corn', 'corn'] });
  K.hand(st, 0, ['c_earlings', 'b_marauder', 'r_hotdog', 'c_archer']);
  eq(E.playBlock(st, 0, hand(st, 0, 'c_earlings').uid), '');
  eq(E.playBlock(st, 0, hand(st, 0, 'b_marauder').uid), '');
  eq(E.playBlock(st, 0, hand(st, 0, 'r_hotdog').uid), '');
  eq(E.playBlock(st, 0, hand(st, 0, 'c_archer').uid), 'Needs 3 face-up Cornfield');
  const s = run(st, { t: 'play', p: 0, uid: hand(st, 0, 'b_marauder').uid, lane: 0 }).state;
  eq(s.players[0].actions, 0);
  eq(E.playBlock(s, 0, hand(s, 0, 'c_earlings').uid), 'Needs 1 Action');
  eq(E.playBlock(s, 0, hand(s, 0, 'r_hotdog').uid), '', 'cost 0 still fits');
  st.players[0].lanes[2].land.down = true; st.players[0].lanes[3].land.down = true;
  eq(E.playBlock(st, 0, hand(st, 0, 'c_earlings').uid), 'Needs 1 face-up Cornfield', 'face-down lands don\'t count');
});
test('replacing: only a ready creature can be replaced, and kingdom landmarks can\'t be', () => {
  const st = arena();
  K.put(st, 0, 0, 'r_hotdog'); K.put(st, 0, 1, 'r_hotdog', { fl: true });
  K.build(st, 0, 2, 'n_wall', { kingdom: true });
  K.hand(st, 0, ['r_baldman', 'r_treefort']);
  const bm = hand(st, 0, 'r_baldman'), tf = hand(st, 0, 'r_treefort');
  ok(E.playLanes(st, 0, bm.uid).includes(0)); ok(!E.playLanes(st, 0, bm.uid).includes(1), 'flooped creature');
  ok(!E.playLanes(st, 0, tf.uid).includes(2), 'landmark');
  const s = run(st, { t: 'play', p: 0, uid: bm.uid, lane: 0 }).state;
  eq(C(s, 0, 0).id, 'r_baldman'); eq(s.players[0].discard[0].id, 'r_hotdog');
});
test('moving: 1 Action to an adjacent empty lane; free for Blue Plains creatures on Blue Plains; once a turn', () => {
  const st = arena({ lands0: ['blue', 'blue', 'nice', 'nice'] });
  K.put(st, 0, 0, 'b_cooldog'); K.put(st, 0, 2, 'n_banana');
  eq(JSON.stringify(E.moveOptions(st, 0, 0)), JSON.stringify([{ to: 1, cost: 0 }]));
  eq(E.moveOptions(st, 0, 2).map(o => o.to + ':' + o.cost).join(), '1:1,3:1');
  let s = run(st, { t: 'move', p: 0, from: 0, to: 1 }).state;
  eq(s.players[0].actions, 2); eq(C(s, 0, 1).id, 'b_cooldog');
  s = run(s, { t: 'move', p: 0, from: 2, to: 3 }).state; eq(s.players[0].actions, 1);
  eq(E.moveOptions(s, 0, 1).length, 0, 'already moved');
  eq(err(s, { t: 'move', p: 0, from: 3, to: 2 }), 'Can\'t move there');
});
test('FLOOP turns a card left to use its ability (no attack this turn); ACTIVATE turns a creature right and toggles', () => {
  const st = arena();
  K.put(st, 0, 1, 'n_butler'); K.put(st, 0, 2, 'r_hotdog'); K.put(st, 1, 2, 'r_hotdog');
  let s = run(st, { t: 'floop', p: 0, lane: 1, slot: 'c', targets: [{ side: 0, lane: 2 }] }).state;
  ok(C(s, 0, 1).fl); eq(C(s, 0, 2).shield, 2);
  ok(E.activateBlock(s, 0, 1).includes('Flooped'));
  eq(E.floopBlock(s, 0, 1, 'c'), 'Already flooped');
  s = run(s, { t: 'activate', p: 0, lane: 2 }).state; ok(C(s, 0, 2).act); eq(s.players[0].attacks.length, 1);
  s = run(s, { t: 'activate', p: 0, lane: 2 }).state; ok(!C(s, 0, 2).act); eq(s.players[0].attacks.length, 0);
});
test('BATTLE: an attacker hits the creature across, which hits back; damage stays', () => {
  const st = arena();
  K.put(st, 0, 1, 'r_hotdog'); K.put(st, 1, 1, 'r_poundcake');
  let s = run(st, { t: 'activate', p: 0, lane: 1 }).state;
  s = battle(s);
  eq(C(s, 1, 1).dmg, 2); eq(C(s, 0, 1).dmg, 1); eq(s.active, 1);
  s = passTurn(s);
  eq(C(s, 1, 1).dmg, 2, 'damage stays until healed');
});
test('no creature across: hit the building across, otherwise storm the kingdom (nearest building)', () => {
  const st = arena();
  K.put(st, 0, 0, 'r_hotdog'); K.put(st, 0, 3, 'r_hotdog');
  K.build(st, 1, 0, 'r_treefort'); K.build(st, 1, 2, 'r_treefort');
  const t0 = E.attackTarget(st, 0, 0); eq(t0.slot, 'b'); eq(t0.lane, 0); ok(!t0.storm);
  const t3 = E.attackTarget(st, 0, 3); eq(t3.slot, 'b'); eq(t3.lane, 2); ok(t3.storm);
  let s = run(st, { t: 'activate', p: 0, lane: 0 }).state; s = run(s, { t: 'activate', p: 0, lane: 3 }).state;
  s = battle(s);
  eq(B(s, 1, 0).dmg, 2); eq(B(s, 1, 2).dmg, 2);
});
test('a Guard steps in front of an attack into the empty lane beside it', () => {
  const st = arena();
  K.put(st, 0, 1, 'r_hotdog'); K.put(st, 1, 2, 'n_banana'); K.build(st, 1, 1, 'r_treefort');
  const t = E.attackTarget(st, 0, 1); eq(t.slot, 'c'); eq(t.lane, 2); ok(t.guard);
});
test('Flying goes over the creature across to hit a building', () => {
  const st = arena();
  K.put(st, 0, 1, 'b_skypup'); K.put(st, 1, 1, 'r_poundcake'); K.build(st, 1, 3, 'r_treefort');
  const t = E.attackTarget(st, 0, 1); eq(t.slot, 'b'); eq(t.lane, 3); ok(t.storm);
});
test('Cool Dog: creatures beside him can\'t be attacked, and they still hold their lane', () => {
  const st = arena();
  K.put(st, 1, 1, 'b_cooldog'); K.put(st, 1, 2, 'r_hotdog'); K.build(st, 1, 2, 'r_treefort');
  K.put(st, 0, 2, 'r_hotdog');
  ok(!E.canBeAttacked(st, 1, 2)); eq(E.attackTarget(st, 0, 2), null);
  ok(E.activateBlock(st, 0, 2).includes('Nothing to attack'));
});
test('"What\'ll you use to defend?": block from the same or an adjacent lane, toggle, then resolve', () => {
  const st = arena();
  K.put(st, 0, 1, 'r_hotdog'); K.put(st, 1, 2, 'r_poundcake'); K.put(st, 1, 0, 'r_hotdog'); K.build(st, 1, 1, 'r_treefort');
  let s = run(st, { t: 'activate', p: 0, lane: 1 }).state;
  s = run(s, { t: 'battle', p: 0 }).state;
  eq(s.pending && s.pending.kind, 'defend'); eq(s.pending.side, 1);
  eq(err(s, { t: 'draw', p: 0 }), 'Finish your choice first');
  eq(E.blockOptions(s, 1).map(o => o.lane).sort().join(), '0,2');
  const at = C(s, 0, 1).uid;
  s = run(s, { t: 'block', p: 1, lane: 2, at }).state; eq(s.blocks[at], C(s, 1, 2).uid);
  s = run(s, { t: 'block', p: 1, lane: 2, at }).state; eq(s.blocks[at], undefined, 'toggles off');
  s = run(s, { t: 'block', p: 1, lane: 2, at }).state;
  s = run(s, { t: 'defend', p: 1 }).state;
  eq(C(s, 1, 2).dmg, 2, 'the blocker took the hit'); eq(B(s, 1, 1).dmg, 0, 'the building was spared');
  eq(C(s, 0, 1).dmg, 1, 'the blocker hit back');
});
test('with nothing to defend with, the battle resolves at once', () => {
  const st = arena();
  K.put(st, 0, 1, 'r_hotdog'); K.build(st, 1, 1, 'r_treefort'); K.put(st, 1, 3, 'r_hotdog');
  let s = run(st, { t: 'activate', p: 0, lane: 1 }).state;
  s = run(s, { t: 'battle', p: 0 }).state;
  eq(s.active, 1); eq(B(s, 1, 1).dmg, 2);
});
test('the Pig floops while defending: eats the Cornfields and can\'t be attacked while flooped', () => {
  const st = arena({ lands0: ['corn', 'corn', 'corn', 'corn'] });
  K.put(st, 0, 1, 'c_cornball'); K.put(st, 1, 1, 'r_pig'); K.build(st, 1, 0, 'r_treefort');
  let s = run(st, { t: 'activate', p: 0, lane: 1 }).state;
  s = run(s, { t: 'battle', p: 0 }).state;
  eq(s.pending && s.pending.kind, 'defend');
  s = run(s, { t: 'floop', p: 1, lane: 1, slot: 'c', targets: [] }).state;
  eq(s.players[0].lanes.filter(L => L.land.down).length, 4, 'every Cornfield eaten');
  ok(!E.canBeAttacked(s, 1, 1));
  s = run(s, { t: 'defend', p: 1 }).state;
  eq(C(s, 1, 1).dmg, 0);
});
test('an empty side at the end of a turn loses ("that\'s the game"); both empty is a draw', () => {
  const st = arena();
  K.put(st, 0, 1, 'r_hotdog'); K.put(st, 1, 1, 'r_baldman');
  let s = run(st, { t: 'activate', p: 0, lane: 1 }).state;
  s = battle(s);
  eq(s.winner, 0); eq(s.reason, 'wipe');
  const s2 = run(arena(), { t: 'battle', p: 0 }).state;
  eq(s2.winner, -1); eq(s2.reason, 'both');
  eq(err(s, { t: 'draw', p: 1 }), 'The game is over');
});
test('concede ends the game for the other player', () => {
  const st = arena(); K.put(st, 0, 0, 'r_hotdog'); K.put(st, 1, 0, 'r_hotdog');
  const s = run(st, { t: 'concede', p: 1 }).state;
  eq(s.winner, 0); eq(s.reason, 'concede');
});

// ---------------------------------------------------------------- show cards
test('Husker Knights draw energy from corn: +2 ATK per face-up Cornfield, and collapse with none', () => {
  const st = arena({ lands1: ['corn', 'corn', 'swamp', 'corn'] });
  K.put(st, 1, 0, 'c_husker');
  eq(E.cStats(st, 1, 0).atk, 6);
  K.build(st, 1, 0, 'k_corncastle'); K.build(st, 1, 1, 'c_dome');
  for (const l of [0, 1, 3]) st.players[1].lanes[l].land.down = true;
  eq(E.cStats(st, 1, 0).atk, 0, 'castle and dome bonuses don\'t help a collapsed knight');
  st.active = 1; ok(E.activateBlock(st, 1, 0).includes('Collapsed'));
});
test('the Pig eats every enemy Cornfield (once)', () => {
  const st = arena({ lands1: ['corn', 'corn', 'swamp', 'corn'] });
  K.put(st, 0, 2, 'r_pig'); K.put(st, 1, 0, 'c_husker');
  const r = run(st, { t: 'floop', p: 0, lane: 2, slot: 'c', targets: [] });
  eq(r.state.players[1].lanes.map(x => x.land.down).join(), 'true,true,false,true');
  ok(r.events.some(e => e.t === 'eat'));
  eq(E.cStats(r.state, 1, 0).atk, 0);
  eq(E.floopBlock(r.state, 0, 2, 'c'), 'Already flooped');
  K.build(r.state, 0, 0, 'r_treefort');
  let s = battle(r.state); s = passTurn(s);
  eq(s.active, 0); ok(E.floopBlock(s, 0, 2, 'c').startsWith('Full'), 'one big meal, then the Pig is full');
});
test('"Pigs can\'t leave mud landscapes": a Pig that wins a fight on an enemy Useless Swamp gets stuck and changes sides', () => {
  const st = arena({ lands1: ['swamp', 'swamp', 'swamp', 'swamp'] });
  K.put(st, 0, 1, 'r_pig'); K.build(st, 0, 0, 'r_treefort'); K.put(st, 1, 1, 'r_baldman'); K.build(st, 1, 3, 'r_treefort');
  const pig = C(st, 0, 1).uid;
  let s = run(st, { t: 'activate', p: 0, lane: 1 }).state;
  const r = E.apply(s, { t: 'battle', p: 0 }); s = r.state;
  if (s.pending && s.pending.kind === 'defend') s = run(s, { t: 'defend', p: 1 }).state;
  const f = E.findCreature(s, pig);
  ok(f, 'the Pig survived'); eq(f.side, 1); ok(f.c.stuck);
});
test('Silo of Truth: when it\'s flooped into play, see the hand and take one card', () => {
  const st = arena({ lands0: ['corn', 'corn', 'corn', 'corn'] });
  K.put(st, 0, 0, 'r_hotdog'); K.put(st, 1, 0, 'r_hotdog');
  K.hand(st, 0, ['c_silo']); K.hand(st, 1, ['r_bloodstorm', 'r_pancakes']);
  const r = run(st, { t: 'play', p: 0, uid: hand(st, 0, 'c_silo').uid, lane: 3 });
  ok(r.events.some(e => e.t === 'reveal'));
  let s = r.state; eq(s.pending.kind, 'steal');
  eq(E.redact(s, 0).players[1].hand.map(c => c.id).join(), 'r_bloodstorm,r_pancakes', 'the hand is revealed this turn');
  eq(err(s, { t: 'activate', p: 0, lane: 0 }), 'Finish your choice first');
  s = run(s, { t: 'choose', p: 0, uid: hand(s, 1, 'r_bloodstorm').uid }).state;
  eq(s.players[0].hand.map(c => c.id).join(), 'r_bloodstorm'); eq(s.players[1].hand.length, 1);
  eq(s.players[0].hand[0].owner, 0);
});
test('Ancient Scholar studies inside the Schoolhouse, then raises the dead from his next turn', () => {
  const st = arena({ lands0: ['blue', 'blue', 'blue', 'blue'] });
  K.build(st, 0, 0, 'b_school'); K.put(st, 0, 0, 'b_scholar'); K.put(st, 1, 2, 'r_hotdog');
  K.discard(st, 0, ['b_cooldog']);
  let s = run(st, { t: 'activate', p: 0, lane: 0 }).state;
  const sc = C(s, 0, 0); ok(sc.inside); eq(sc.study, 1); eq(s.players[0].attacks.length, 0, 'studying isn\'t an attack');
  ok(!E.canBeAttacked(s, 0, 0));
  ok(E.floopBlock(s, 0, 0, 'c').includes('next turn'));
  s = battle(s); s = passTurn(s);
  eq(s.active, 0);
  const src = { lane: 0, slot: 'c' };
  const t1 = E.targetOptions(s, 0, src, []).find(o => o.id === 'b_cooldog');
  const t2 = E.targetOptions(s, 0, src, [t1]).find(o => o.lane === 2);
  s = run(s, { t: 'floop', p: 0, lane: 0, slot: 'c', targets: [t1, t2] }).state;
  eq(C(s, 0, 2).id, 'b_cooldog');
});
test('Cave of Solitude: your creature naps inside, heals 2, and can\'t be attacked until your next turn', () => {
  const st = arena();
  K.build(st, 0, 1, 'b_cave'); K.put(st, 0, 1, 'r_poundcake', { dmg: 3 }); K.put(st, 1, 1, 'r_hotdog');
  const s = run(st, { t: 'floop', p: 0, lane: 1, slot: 'b', targets: [] }).state;
  const c = C(s, 0, 1); ok(c.nap); eq(c.dmg, 1);
  ok(!E.canBeAttacked(s, 0, 1));
});
test('Spirit Tower possesses an attacker with 4 or more ATK, then fades', () => {
  const st = arena();
  K.build(st, 1, 2, 'b_spirit'); K.put(st, 1, 0, 'r_hotdog');
  K.put(st, 0, 2, 'b_skypup'); K.build(st, 0, 0, 'r_treefort');
  const pup = C(st, 0, 2).uid;
  let s = run(st, { t: 'activate', p: 0, lane: 2 }).state;
  s = battle(s);
  const f = E.findCreature(s, pup); ok(f); eq(f.side, 1);
  eq(B(s, 1, 2), null, 'the Tower fades');
});
test('Volcano: not the turn it\'s played; then lava destroys every creature, scorches the lands and melts this lane', () => {
  const st = arena();
  K.hand(st, 0, ['r_volcano']);
  K.put(st, 0, 0, 'b_cooldog'); K.put(st, 0, 1, 'r_hotdog'); K.put(st, 1, 1, 'r_hotdog'); K.put(st, 1, 2, 'r_poundcake');
  K.build(st, 1, 3, 'r_treefort'); K.build(st, 1, 0, 'r_treefort');
  let s = run(st, { t: 'play', p: 0, uid: hand(st, 0, 'r_volcano').uid, lane: 3 }).state;
  eq(E.floopBlock(s, 0, 3, 'b'), 'It needs a turn to rumble');
  s = battle(s); s = passTurn(s);
  eq(s.active, 0);
  s = run(s, { t: 'floop', p: 0, lane: 3, slot: 'b', targets: [] }).state;
  eq(C(s, 0, 0).id, 'b_cooldog', 'Cool Dog is too cool for lava');
  eq(C(s, 0, 1), null); eq(C(s, 1, 1), null); eq(C(s, 1, 2), null);
  ok(s.players[0].lanes.concat(s.players[1].lanes).every(L => L.land.down));
  eq(B(s, 0, 3), null, 'the Volcano is spent'); eq(B(s, 1, 3), null, 'the building across melts'); ok(B(s, 1, 0), 'other lanes keep their buildings');
});
test('Summon Archer Dan needs 3 Cornfields; Dan joins your lane and destroys every enemy building', () => {
  const st = arena({ lands0: ['corn', 'corn', 'swamp', 'corn'] });
  K.hand(st, 0, ['c_archer']); K.build(st, 1, 0, 'r_treefort'); K.build(st, 1, 2, 'n_wall', { kingdom: true });
  K.put(st, 1, 1, 'r_hotdog');
  const uid = hand(st, 0, 'c_archer').uid;
  eq(E.playBlock(st, 0, uid), '');
  const s = run(st, { t: 'play', p: 0, uid, targets: [{ side: 0, lane: 1 }] }).state;
  eq(B(s, 1, 0), null); eq(B(s, 1, 2), null, 'even landmarks');
  eq(C(s, 0, 1).id, 't_dan');
  st.players[0].lanes[3].land.down = true;
  eq(E.playBlock(st, 0, uid), 'Needs 3 face-up Cornfield');
});
test('Reclaim Landscape flips your lands back up and revives Husker Knights', () => {
  const st = arena({ lands0: ['corn', 'corn', 'corn', 'swamp'] });
  for (const l of [0, 1, 2]) st.players[0].lanes[l].land.down = true;
  K.discard(st, 0, ['c_husker', 'c_husker']); K.hand(st, 0, ['r_reclaim']);
  K.put(st, 0, 1, 'r_hotdog');
  const s = run(st, { t: 'play', p: 0, uid: hand(st, 0, 'r_reclaim').uid, targets: [] }).state;
  ok(s.players[0].lanes.every(L => !L.land.down));
  eq(C(s, 0, 0).id, 'c_husker'); eq(C(s, 0, 2).id, 'c_husker'); eq(C(s, 0, 1).id, 'r_hotdog');
});
test('Field Reaper costs an extra discard and steals every damaged enemy creature', () => {
  const st = arena({ lands0: ['corn', 'corn', 'corn', 'corn'] });
  K.hand(st, 0, ['c_reaper', 'r_pancakes']);
  K.put(st, 1, 0, 'r_poundcake', { dmg: 1 }); K.put(st, 1, 1, 'r_hotdog'); K.put(st, 1, 3, 'r_cooper', { dmg: 2 });
  const rp = hand(st, 0, 'c_reaper'), pc = hand(st, 0, 'r_pancakes');
  const pound = C(st, 1, 0).uid, coop = C(st, 1, 3).uid;
  eq(err(st, { t: 'play', p: 0, uid: rp.uid, lane: 2 }), 'Pick a card to discard');
  const s = run(st, { t: 'play', p: 0, uid: rp.uid, lane: 2, targets: [{ uid: pc.uid, id: pc.id }] }).state;
  eq(s.players[0].hand.length, 0); eq(s.players[0].discard.map(c => c.id).join(), 'r_pancakes');
  eq(C(s, 1, 1).id, 'r_hotdog', 'undamaged creatures stay');
  eq(E.findCreature(s, pound).side, 0); eq(E.findCreature(s, coop).side, 0);
});
test('Cerebral Bloodstorm: every creature that fights this battle takes 2, yours too', () => {
  const st = arena();
  K.put(st, 0, 1, 'r_poundcake'); K.put(st, 1, 1, 'r_poundcake'); K.put(st, 1, 3, 'r_hotdog');
  K.hand(st, 0, ['r_bloodstorm']);
  let s = run(st, { t: 'play', p: 0, uid: hand(st, 0, 'r_bloodstorm').uid, targets: [] }).state;
  s = run(s, { t: 'activate', p: 0, lane: 1 }).state;
  s = battle(s);
  eq(C(s, 0, 1).dmg, 3); eq(C(s, 1, 1).dmg, 3); eq(C(s, 1, 3).dmg, 0, 'creatures that don\'t fight are safe');
});
test('Field of Nightmares: the defender can\'t floop or block, and the Legion of Earlings scares what it fights to death', () => {
  const st = arena({ lands0: ['corn', 'corn', 'corn', 'corn'] });
  K.put(st, 0, 1, 'c_earlings'); K.put(st, 1, 1, 'r_poundcake'); K.put(st, 1, 2, 'r_hotdog'); K.build(st, 1, 0, 'r_treefort');
  K.hand(st, 0, ['c_nightmares']);
  let s = run(st, { t: 'play', p: 0, uid: hand(st, 0, 'c_nightmares').uid, targets: [] }).state;
  s = run(s, { t: 'activate', p: 0, lane: 1 }).state;
  s = run(s, { t: 'battle', p: 0 }).state;
  eq(s.active, 1, 'no defense window at all');
  eq(C(s, 1, 1), null, 'scared to death'); eq(C(s, 0, 1).dmg, 0, 'no damage back');
});
test('Immortal Maize Walker: hides in your Useless Swamp, triple ATK with 3 Cornfields, back to hand when destroyed', () => {
  const st = arena({ lands0: ['corn', 'corn', 'corn', 'swamp'] });
  K.hand(st, 0, ['c_maize']); K.put(st, 1, 3, 'r_poundcake'); K.put(st, 1, 0, 'r_hotdog');
  const uid = hand(st, 0, 'c_maize').uid;
  eq(E.playLanes(st, 0, uid).join(), '3');
  let s = run(st, { t: 'play', p: 0, uid, lane: 3 }).state;
  eq(E.cStats(s, 0, 3).atk, 15);
  C(s, 0, 3).dmg = 4;
  s = run(s, { t: 'activate', p: 0, lane: 3 }).state;
  s = battle(s);
  eq(C(s, 0, 3), null); ok(hand(s, 0, 'c_maize'), 'back in hand');
});
test('Teleport moves only your own creature to one of your empty lanes', () => {
  const st = arena();
  K.put(st, 0, 0, 'r_hotdog'); K.put(st, 1, 0, 'r_hotdog'); K.hand(st, 0, ['r_teleport']);
  const src = { uid: hand(st, 0, 'r_teleport').uid };
  const a = E.targetOptions(st, 0, src, []);
  ok(a.every(o => o.side === 0), 'only your own');
  const b = E.targetOptions(st, 0, src, [a[0]]).find(o => o.lane === 3);
  const s = run(st, { t: 'play', p: 0, uid: src.uid, targets: [a[0], b] }).state;
  eq(C(s, 0, 3).id, 'r_hotdog'); eq(C(s, 0, 0), null);
});

// ---------------------------------------------------------------- endings, privacy, robustness
test('overtime from round 13 wears every kingdom down; after round 24 the judges count kingdoms', () => {
  const st = arena({ turn: 24 });
  K.build(st, 0, 0, 'n_wall'); K.build(st, 1, 0, 'n_wall'); K.put(st, 1, 1, 'r_poundcake');
  const r = run(st, { t: 'battle', p: 0 });
  ok(r.events.some(e => e.t === 'overtime'));
  eq(B(r.state, 1, 0).dmg, 1); eq(C(r.state, 1, 1).dmg, 1); eq(B(r.state, 0, 0).dmg, 0, 'only the player whose turn starts');
  const st2 = arena({ turn: 48 });
  K.build(st2, 0, 0, 'n_wall'); K.build(st2, 0, 1, 'n_wall'); K.build(st2, 1, 0, 'n_wall');
  const r2 = run(st2, { t: 'battle', p: 0 });
  eq(r2.state.winner, 0); eq(r2.state.reason, 'points'); ok(r2.events.some(e => e.t === 'judges'));
});
test('redact hides the other hand, every deck order and face-down buildings', () => {
  const st = arena();
  K.hand(st, 1, ['r_pancakes', 'r_teleport']); K.build(st, 1, 2, 'r_booby');
  const red = E.redact(st, 0);
  ok(red.players[1].hand.every(c => c.id === '?')); ok(red.players[1].deck.every(c => c.id === '?'));
  eq(red.players[1].lanes[2].building.id, '?trap');
  eq(st.players[1].lanes[2].building.id, 'r_booby', 'the real state is untouched');
});
test('a Booby Trap springs when an enemy creature attacks into its lane', () => {
  const st = arena();
  K.build(st, 1, 2, 'r_booby'); K.put(st, 1, 0, 'r_hotdog'); K.put(st, 0, 2, 'r_poundcake');
  let s = run(st, { t: 'activate', p: 0, lane: 2 }).state;
  const r = E.apply(s, { t: 'battle', p: 0 }); s = r.state;
  if (s.pending && s.pending.kind === 'defend') s = run(s, { t: 'defend', p: 1 }).state;
  eq(C(s, 0, 2).dmg, 3); eq(B(s, 1, 2), null, 'spent');
});
test('starter decks are legal', () => {
  for (const k in E.STARTERS) { const v = E.validateDeck(E.STARTERS[k]); ok(v.ok, k + ' ' + v.errs.join(',')); }
});
test('deck validation catches too many copies and a wrong size', () => {
  ok(!E.validateDeck({ lands: ['corn', 'corn', 'corn', 'corn'], cards: Array(20).fill('c_husker') }).ok);
  ok(!E.validateDeck({ lands: ['corn', 'corn', 'corn', 'corn'], cards: E.STARTERS.corn.cards.slice(0, 19) }).ok);
});
test('deterministic: the same seed replays the same game', () => {
  const mk = () => E.newGame({ seed: 'det', players: [{ deck: E.STARTERS.blue }, { deck: E.STARTERS.corn }] }).state;
  const a = AI.playGame(mk(), { difficulty: 'easy', useTime: false, seed: 3 }, null, 3000);
  const b = AI.playGame(mk(), { difficulty: 'easy', useTime: false, seed: 3 }, null, 3000);
  ok(a.winner != null, 'the game ended');
  eq(JSON.stringify(a), JSON.stringify(b));
});
test('fuzz: 150 games of random legal moves never error, never get stuck, and conserve every card', () => {
  const keys = Object.keys(E.STARTERS);
  let seed = 12345;
  const rnd = n => { seed = (seed * 1103515245 + 12345) >>> 0; return seed % n; };
  for (let g = 0; g < 150; g++) {
    let st = E.newGame({ seed: 'fz' + g, players: [{ deck: E.STARTERS[keys[g % 6]] }, { deck: E.STARTERS[keys[(g * 7 + 3) % 6]] }] }).state;
    let steps = 0;
    while (st.winner == null && steps < 3000) {
      let acts = [];
      for (const p of [0, 1]) acts = acts.concat(E.legalActions(st, p));
      ok(acts.length, 'stuck in game ' + g + ' (' + st.phase + ')');
      let cmd = acts[rnd(acts.length)];
      if (rnd(5) === 0) { const end = acts.find(x => x.t === 'battle' || x.t === 'defend' || x.t === 'ready'); if (end) cmd = end; }
      const r = E.apply(st, cmd);
      if (r.error) throw new Error('game ' + g + ': ' + r.error + ' ' + JSON.stringify(cmd));
      st = r.state; steps++;
      const seen = {};
      for (const P of st.players) {
        for (const c of P.hand.concat(P.deck, P.discard)) { ok(!seen[c.uid], 'duplicate card ' + c.uid); seen[c.uid] = 1; }
        for (const L of P.lanes) for (const x of [L.creature, L.building]) if (x && !x.token && !x.kingdom && E.CARDS[x.id].r !== 'K') { ok(!seen[x.uid], 'duplicate on board ' + x.uid); seen[x.uid] = 1; }
      }
      eq(Object.keys(seen).length, 40, 'card count in game ' + g + ' after ' + JSON.stringify(cmd));
    }
    ok(st.winner != null, 'game ' + g + ' ended');
  }
});
test('the AI finishes games from every starter without illegal moves', () => {
  const keys = Object.keys(E.STARTERS);
  for (let i = 0; i < 6; i++) {
    const st0 = E.newGame({ seed: 'ai' + i, players: [{ deck: E.STARTERS[keys[i]] }, { deck: E.STARTERS[keys[(i + 1) % 6]] }] }).state;
    const st = AI.playGame(st0, { difficulty: 'normal', useTime: false, seed: i + 1, tune: { nodes: 80 } }, null, 3000);
    ok(st.winner != null, keys[i] + ' game ended');
    ok(st.round >= 3, 'not a trivial game');
  }
});

console.log(pass + ' passed, ' + fail + ' failed');
if (fail) { console.log('\nFAILURES:\n' + fails.join('\n')); process.exit(1); }
