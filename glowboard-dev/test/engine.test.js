// Rule tests for the Card Wars engine. Run: node test/engine.test.js  (FROM=src to test sources)
'use strict';
const { Engine: E } = require('./load')({ from: process.env.FROM || undefined });
const K = E.kit;

let pass = 0, fail = 0;
const fails = [];
function test(name, fn) {
  try { fn(); pass++; } catch (e) { fail++; fails.push(name + '\n    ' + (e && e.message ? e.message : e)); }
}
function eq(a, b, msg) { if (a !== b) throw new Error((msg ? msg + ': ' : '') + 'expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a)); }
function ok(c, msg) { if (!c) throw new Error(msg || 'assertion failed'); }
function run(st, cmd) { const r = E.apply(st, cmd); if (r.error) throw new Error('command failed: ' + r.error + ' ' + JSON.stringify(cmd)); return r; }
function err(st, cmd) { return E.apply(st, cmd).error; }

const FILL = Array(20).fill('r_pancakes');
// Board-only scenario: P0 to act on turn 3 (fights and floops allowed), empty hands and boards.
function arena(o) {
  o = o || {};
  const g = E.newGame({ seed: o.seed || 'arena', first: 0, noMulligan: true, players: [
    { deck: { lands: o.lands0 || ['nice', 'nice', 'nice', 'nice'], cards: FILL } },
    { deck: { lands: o.lands1 || ['nice', 'nice', 'nice', 'nice'], cards: FILL } }] });
  const st = g.state;
  K.clear(st);
  st.turn = o.turn || 3; st.round = Math.ceil(st.turn / 2); st.active = 0;
  st.players[0].hand = []; st.players[1].hand = [];
  st.players[0].actions = 2; st.players[1].actions = 2;
  K.deck(st, 0, Array(10).fill('r_pancakes')); K.deck(st, 1, Array(10).fill('r_pancakes'));
  return st;
}
const C = (st, s, l) => st.players[s].lanes[l].creature;
const ATK = id => E.CARDS[id].atk, DEF = id => E.CARDS[id].def;
const B = (st, s, l) => st.players[s].lanes[l].building;

// ---------------------------------------------------------------- setup & flow
test('setup: 25 HP, 5-card hands, mulligan, first turn draws', () => {
  const g = E.newGame({ seed: 's1', first: 0, players: [{ deck: E.STARTERS.blue }, { deck: E.STARTERS.corn }] });
  const st = g.state;
  eq(st.phase, 'mulligan'); eq(st.players[0].hand.length, 5); eq(st.players[1].hand.length, 5); eq(st.players[0].hp, 25);
  let r = run(st, { t: 'mulligan', p: 0, redraw: true });
  eq(r.state.phase, 'mulligan');
  eq(err(r.state, { t: 'mulligan', p: 0, redraw: true }), 'Already decided');
  r = run(r.state, { t: 'mulligan', p: 1, redraw: false });
  eq(r.state.phase, 'main'); eq(r.state.turn, 1); eq(r.state.active, 0);
  eq(r.state.players[0].hand.length, 5, 'first player skips the first draw'); eq(r.state.players[0].actions, 2);
  eq(r.state.players[0].hand.length + r.state.players[0].deck.length, 20);
});
test('starter decks are legal', () => {
  for (const k in E.STARTERS) { const v = E.validateDeck(E.STARTERS[k]); ok(v.ok, k + ' ' + v.errs.join(',')); eq(v.warn.length, 0, k + ' warnings ' + v.warn.join(',')); }
});
test('deck validation catches copies, champions and size', () => {
  const d = { lands: ['corn', 'corn', 'corn', 'corn'], cards: Array(20).fill('c_husker') };
  ok(!E.validateDeck(d).ok);
  const d2 = { lands: ['corn', 'corn', 'corn', 'corn'], cards: E.STARTERS.corn.cards.slice(0, 19).concat(['b_pig']) };
  ok(E.validateDeck(d2).errs.some(e => e.includes('Champion')));
});
test('first player cannot floop or fight on turn 1', () => {
  const st = arena({ turn: 1 });
  K.put(st, 0, 0, 'b_cooldog');
  ok(E.floopBlock(st, 0, 0, 'c').includes('turn 1'));
  const r = run(st, { t: 'end', p: 0 });
  eq(r.state.players[1].hp, 25);
});
test('not your turn is rejected', () => {
  const st = arena(); eq(err(st, { t: 'end', p: 1 }), 'Not your turn');
});

// ---------------------------------------------------------------- landscapes & costs
test('landscape requirement = cost; champions need 3; rainbow needs none', () => {
  const st = arena({ lands0: ['corn', 'corn', 'blue', 'blue'] });
  const h = K.hand(st, 0, ['c_worm', 'c_maize', 'r_dan', 'b_cooldog']);
  eq(E.playBlock(st, 0, h[0].uid), '');
  ok(E.playBlock(st, 0, h[1].uid).includes('3 face-up Cornfield'));
  eq(E.playBlock(st, 0, h[2].uid), '');
  eq(E.playBlock(st, 0, h[3].uid), '');
  st.players[0].actions = 1;
  ok(E.playBlock(st, 0, h[0].uid).includes('Needs 2 Actions'));
});
test('playing spends actions; replacing a ready creature discards it; flooped creatures cannot be replaced', () => {
  const st = arena({ lands0: ['blue', 'blue', 'blue', 'blue'] });
  K.put(st, 0, 0, 'b_hotdog');
  K.put(st, 0, 1, 'b_hotdog', { flooped: true });
  const h = K.hand(st, 0, ['b_cooldog', 'b_skypup']);
  let r = run(st, { t: 'play', p: 0, uid: h[0].uid, lane: 0 });
  eq(C(r.state, 0, 0).id, 'b_cooldog'); eq(r.state.players[0].actions, 1);
  ok(r.state.players[0].discard.some(c => c.id === 'b_hotdog'));
  eq(err(r.state, { t: 'play', p: 0, uid: h[1].uid, lane: 1 }), 'Can\'t play there');
});

// ---------------------------------------------------------------- combat
test('fight: empty lane hits the hero', () => {
  const st = arena(); K.put(st, 0, 1, 'b_cooldog');
  eq(run(st, { t: 'end', p: 0 }).state.players[1].hp, 25 - ATK('b_cooldog'));
});
test('fight: attacker and defender deal damage simultaneously', () => {
  const st = arena(); K.put(st, 0, 0, 'b_cooldog'); K.put(st, 1, 0, 'c_scarecrow');
  const r = run(st, { t: 'end', p: 0 });
  eq(C(r.state, 0, 0).dmg, ATK('c_scarecrow')); eq(C(r.state, 1, 0).dmg, ATK('b_cooldog'));
});
test('fight: lethal damage destroys and discards', () => {
  const st = arena(); K.put(st, 0, 0, 'c_worm'); K.put(st, 1, 0, 'b_hotdog');
  const r = run(st, { t: 'end', p: 0 });
  eq(C(r.state, 1, 0), null); ok(r.state.players[1].discard.some(c => c.id === 'b_hotdog'));
  ok(r.events.some(e => e.t === 'death' && e.id === 'b_hotdog'));
  // Hot Dog Knight draws a card when destroyed
  ok(r.events.some(e => e.t === 'draw' && e.side === 1));
});
test('flooped creature skips its attack; Cool Dog stare lasts until your next turn', () => {
  const st = arena(); K.put(st, 0, 0, 'b_cooldog'); K.put(st, 1, 0, 'c_husker');
  let r = run(st, { t: 'floop', p: 0, lane: 0, slot: 'c' });
  eq(E.cStats(r.state, 1, 0).atk, 0);
  r = run(r.state, { t: 'end', p: 0 });
  eq(C(r.state, 1, 0).dmg, 0, 'flooped creature does not attack');
  r = run(r.state, { t: 'end', p: 1 });
  eq(C(r.state, 0, 0).dmg, 0, 'debuffed husker has 0 ATK and skips');
  eq(E.cStats(r.state, 1, 0).atk, 2, 'debuff expired');
});
test('flooped defender still deals damage back', () => {
  const st = arena(); K.put(st, 0, 0, 'b_cooldog', { flooped: true }); K.put(st, 1, 0, 'c_scarecrow');
  st.active = 1; st.turn = 4;
  const r = run(st, { t: 'end', p: 1 });
  eq(C(r.state, 0, 0).dmg, ATK('c_scarecrow')); eq(C(r.state, 1, 0).dmg, ATK('b_cooldog'));
});
test('empty lane: a building absorbs the hit and the excess spills to the hero', () => {
  const st = arena(); K.put(st, 0, 0, 'c_worm'); K.build(st, 1, 0, 'n_tower');
  let r = run(st, { t: 'end', p: 0 });
  eq(B(r.state, 1, 0).dmg, 3); eq(r.state.players[1].hp, 25);
  r = run(r.state, { t: 'end', p: 1 }); r = run(r.state, { t: 'end', p: 0 });
  eq(B(r.state, 1, 0), null); eq(r.state.players[1].hp, 24);
});
test('Guard intercepts attacks into an adjacent empty lane', () => {
  const st = arena(); K.put(st, 0, 1, 'b_cooldog'); K.put(st, 1, 0, 'i_golem');
  const r = run(st, { t: 'end', p: 0 });
  eq(r.state.players[1].hp, 25); eq(C(r.state, 1, 0).dmg, ATK('b_cooldog')); eq(C(r.state, 0, 1).dmg, ATK('i_golem'));
});
test('Flying ignores ground defenders and Guards and takes no hit back', () => {
  const st = arena(); K.put(st, 0, 2, 'b_skypup'); K.put(st, 1, 2, 'c_scarecrow');
  const r = run(st, { t: 'end', p: 0 });
  eq(r.state.players[1].hp, 23); eq(C(r.state, 0, 2).dmg, 0); eq(C(r.state, 1, 2).dmg, 0);
});
test('Flying is blocked by a flying defender', () => {
  const st = arena(); K.put(st, 0, 2, 'b_skypup'); K.put(st, 1, 2, 's_wisp');
  const r = run(st, { t: 'end', p: 0 });
  eq(r.state.players[1].hp, 25); eq(C(r.state, 1, 2), null);
});
test('Ranged attackers take no damage back', () => {
  const st = arena(); K.put(st, 0, 0, 'r_dan'); K.put(st, 1, 0, 'c_scarecrow');
  const r = run(st, { t: 'end', p: 0 });
  eq(C(r.state, 0, 0).dmg, 0); eq(C(r.state, 1, 0).dmg, ATK('r_dan'));
});
test('Siege adds damage to buildings; Candy Wall thorns hurt melee attackers', () => {
  const st = arena(); K.put(st, 0, 0, 'l_golem'); K.build(st, 1, 0, 'n_wall');
  const r = run(st, { t: 'end', p: 0 });
  eq(B(r.state, 1, 0).dmg, 6); eq(C(r.state, 0, 0).dmg, 2); eq(r.state.players[1].hp, 25);
});
test('Lifesteal heals the hero', () => {
  const st = arena(); st.players[0].hp = 20; K.put(st, 0, 0, 's_witch');
  const r = run(st, { t: 'end', p: 0 });
  eq(r.state.players[1].hp, 22); eq(r.state.players[0].hp, 23);
});
test('Shield absorbs damage first', () => {
  const st = arena(); K.put(st, 0, 0, 'b_cooldog'); K.put(st, 1, 0, 'c_scarecrow', { shield: 1 });
  const r = run(st, { t: 'end', p: 0 });
  eq(C(r.state, 1, 0).dmg, ATK('b_cooldog') - 1); eq(C(r.state, 1, 0).shield, 0);
});
test('0 ATK creatures do not attack', () => {
  const st = arena(); K.put(st, 0, 0, 'b_hotdog', { debuffs: [{ atk: -5, exp: 99 }] }); K.put(st, 1, 0, 'c_worm');
  const r = run(st, { t: 'end', p: 0 });
  eq(C(r.state, 0, 0).dmg, 0);
});

// ---------------------------------------------------------------- statuses
test('Burn deals its stacks at the end of its controller\'s turn, then decays', () => {
  const st = arena(); K.put(st, 0, 0, 'b_cooldog', { burn: 2 });
  let r = run(st, { t: 'end', p: 0 });
  eq(C(r.state, 0, 0).dmg, 2); eq(C(r.state, 0, 0).burn, 1);
  r = run(r.state, { t: 'end', p: 1 }); r = run(r.state, { t: 'end', p: 0 });
  eq(C(r.state, 0, 0).dmg, 3); eq(C(r.state, 0, 0).burn, 0);
});
test('Rot: 1 damage per turn and spreads to adjacent allies on death', () => {
  const st = arena(); K.put(st, 1, 1, 'c_cornball', { rot: true }); K.put(st, 1, 0, 'c_scarecrow'); K.put(st, 1, 2, 'c_husker');
  st.active = 1; st.turn = 4;
  let r = run(st, { t: 'end', p: 1 });
  eq(C(r.state, 1, 1).dmg, 1);
  r = run(r.state, { t: 'end', p: 0 }); r = run(r.state, { t: 'end', p: 1 });
  eq(C(r.state, 1, 1), null);
  ok(C(r.state, 1, 0).rot && C(r.state, 1, 2).rot, 'rot spread');
});
test('Rotting creatures cannot be healed', () => {
  const st = arena(); K.put(st, 0, 0, 'n_tart'); K.put(st, 0, 1, 'b_cooldog', { dmg: 3, rot: true });
  const r = run(st, { t: 'floop', p: 0, lane: 0, slot: 'c', targets: [{ side: 0, lane: 1 }] });
  eq(C(r.state, 0, 1).dmg, 3);
});
test('Two Chill = Frozen: no attack while frozen, thaws after its controller\'s turn', () => {
  const st = arena(); K.put(st, 0, 0, 'i_sprite'); K.put(st, 1, 0, 'c_husker', { chill: 1 });
  let r = run(st, { t: 'floop', p: 0, lane: 0, slot: 'c', targets: [{ side: 1, lane: 0 }] });
  ok(C(r.state, 1, 0).frozen); eq(C(r.state, 1, 0).chill, 0);
  r = run(r.state, { t: 'end', p: 0 });
  r = run(r.state, { t: 'end', p: 1 });
  eq(r.state.players[0].hp, 25, 'frozen husker did not attack');
  ok(!C(r.state, 1, 0).frozen, 'thawed');
});
test('Frozen defenders do not hit back', () => {
  const st = arena(); K.put(st, 0, 0, 'b_cooldog'); K.put(st, 1, 0, 'c_scarecrow', { frozen: true, thawAt: 4 });
  const r = run(st, { t: 'end', p: 0 });
  eq(C(r.state, 0, 0).dmg, 0); eq(C(r.state, 1, 0).dmg, ATK('b_cooldog'));
});
test('Cool Dog is too cool to be Chilled or Frozen', () => {
  const st = arena(); K.put(st, 0, 0, 'i_sprite'); K.put(st, 1, 0, 'b_cooldog');
  const r = run(st, { t: 'floop', p: 0, lane: 0, slot: 'c', targets: [{ side: 1, lane: 0 }] });
  eq(C(r.state, 1, 0).chill, 0); ok(r.events.some(e => e.t === 'immune' && e.cool));
  const st2 = arena({ lands0: ['ice', 'ice', 'ice', 'ice'] }); K.put(st2, 1, 1, 'b_cooldog'); const [df] = K.hand(st2, 0, ['i_freeze']);
  ok(!C(run(st2, { t: 'play', p: 0, uid: df.uid, targets: [{ side: 1, lane: 1 }] }).state, 1, 1).frozen);
});
test('Chill reduces ATK and wears off at the end of its controller\'s turn', () => {
  const st = arena(); K.put(st, 1, 0, 'c_worm', { chill: 1 });
  eq(E.cStats(st, 1, 0).atk, 2);
  st.active = 1; st.turn = 4;
  const r = run(st, { t: 'end', p: 1 });
  eq(r.state.players[0].hp, 23); eq(C(r.state, 1, 0).chill, 0);
});

// ---------------------------------------------------------------- Cornfield
test('Cornfield: Corn-Powered +1 ATK and Ripen growth', () => {
  const st = arena({ lands0: ['corn', 'corn', 'corn', 'corn'] }); K.put(st, 0, 0, 'c_husker');
  eq(E.cStats(st, 0, 0).atk, ATK('c_husker') + 1);
  const r = run(st, { t: 'end', p: 0 });
  eq(r.state.players[1].hp, 25 - ATK('c_husker') - 1);
  eq(C(r.state, 0, 0).ripen, 1); eq(E.cStats(r.state, 0, 0).atk, ATK('c_husker') + 2); eq(E.cStats(r.state, 0, 0).def, DEF('c_husker') + 1);
  const r2 = run(run(r.state, { t: 'end', p: 1 }).state, { t: 'end', p: 0 });
  eq(C(r2.state, 0, 0).ripen, 1, 'ripens once');
});
test('Ripen skips creatures that flooped or moved', () => {
  const st = arena({ lands0: ['corn', 'corn', 'corn', 'corn'] }); K.put(st, 0, 0, 'c_husker'); K.put(st, 0, 2, 'c_cornball'); K.put(st, 0, 3, 'b_cooldog');
  let r = run(st, { t: 'move', p: 0, from: 0, to: 1 });
  r = run(r.state, { t: 'end', p: 0 });
  eq(C(r.state, 0, 1).ripen, 0); eq(C(r.state, 0, 2).ripen, 1);
});
test('Pig eats the landscape across; Husker Knight collapses', () => {
  const st = arena({ lands0: ['blue', 'blue', 'blue', 'blue'], lands1: ['corn', 'corn', 'corn', 'corn'] });
  K.put(st, 0, 2, 'b_pig'); K.put(st, 1, 2, 'c_husker');
  let r = run(st, { t: 'floop', p: 0, lane: 2, slot: 'c' });
  ok(r.state.players[1].lanes[2].land.down); eq(C(r.state, 1, 2).dmg, 1);
  eq(E.countLand(r.state, 1, 'corn'), 3);
  r = run(r.state, { t: 'end', p: 0 });
  ok(!E.canAttack(r.state, 1, 2), 'collapsed');
  eq(E.cStats(r.state, 1, 2).atk, 2, 'no corn power on eaten land');
});
test('Immortal Maize Walker: triple damage with 3+ Cornfields, returns to hand', () => {
  const st = arena({ lands0: ['corn', 'corn', 'corn', 'swamp'] });
  K.put(st, 0, 3, 'c_maize');
  eq(E.cStats(st, 0, 3).atk, 3 * ATK('c_maize'), 'triple base on a swamp');
  K.put(st, 0, 0, 'c_maize', { dmg: DEF('c_maize') - 1 }); K.put(st, 1, 0, 'b_hotdog');
  eq(E.cStats(st, 0, 0).atk, 3 * ATK('c_maize') + 1, 'triple base plus Corn-Powered');
  const r = run(st, { t: 'end', p: 0 });
  eq(C(r.state, 0, 0), null); ok(r.state.players[0].hand.some(c => c.id === 'c_maize'));
  eq(C(r.state, 1, 0), null);
});
test('Silo of Truth reveals the hand and steals a chosen spell', () => {
  const st = arena({ lands0: ['corn', 'corn', 'corn', 'corn'] }); K.build(st, 0, 0, 'c_silo');
  const h = K.hand(st, 1, ['b_cooldog', 'c_bloodstorm', 'r_pancakes']);
  let r = run(st, { t: 'floop', p: 0, lane: 0, slot: 'b' });
  ok(r.events.some(e => e.t === 'reveal')); eq(r.state.pending.options.length, 2);
  eq(err(r.state, { t: 'end', p: 0 }), 'Finish your choice first');
  const red = E.redact(r.state, 0);
  ok(red.players[1].hand.every(c => c.id !== '?'), 'revealed hand visible to the silo owner');
  r = run(r.state, { t: 'choose', p: 0, uid: h[1].uid });
  ok(r.state.players[0].hand.some(c => c.id === 'c_bloodstorm')); eq(r.state.players[1].hand.length, 2);
});
test('Cerebral Bloodstorm hits every ready creature; flooped ones are safe', () => {
  const st = arena({ lands0: ['corn', 'corn', 'corn', 'corn'] });
  K.put(st, 0, 0, 'c_scarecrow'); K.put(st, 0, 1, 'b_cooldog', { flooped: true }); K.put(st, 1, 0, 'c_husker'); K.put(st, 1, 1, 'b_cooldog', { flooped: true });
  const [bs] = K.hand(st, 0, ['c_bloodstorm']);
  const r = run(st, { t: 'play', p: 0, uid: bs.uid, targets: [] });
  eq(C(r.state, 0, 0).dmg, 2); eq(C(r.state, 0, 1).dmg, 0); eq(C(r.state, 1, 0).dmg, 2); eq(C(r.state, 1, 1).dmg, 0);
});
test('Field of Nightmares fills every empty lane with Earlings; Husker Worm adds them beside it', () => {
  const st = arena({ lands0: ['corn', 'corn', 'corn', 'corn'] }); K.put(st, 0, 1, 'c_scarecrow');
  const [fn] = K.hand(st, 0, ['c_nightmares']);
  const r = run(st, { t: 'play', p: 0, uid: fn.uid, targets: [] });
  eq(C(r.state, 0, 0).id, 't_earling'); eq(C(r.state, 0, 2).id, 't_earling'); eq(C(r.state, 0, 3).id, 't_earling'); eq(C(r.state, 0, 1).id, 'c_scarecrow');
  const st2 = arena({ lands0: ['corn', 'corn', 'corn', 'corn'] }); K.put(st2, 0, 3, 'c_scarecrow');
  const [w] = K.hand(st2, 0, ['c_worm']);
  const r2 = run(st2, { t: 'play', p: 0, uid: w.uid, lane: 2 });
  eq(C(r2.state, 0, 1).id, 't_earling'); eq(C(r2.state, 0, 3).id, 'c_scarecrow');
});
test('Corn Ronin and Corn Dome add ATK', () => {
  const st = arena(); K.put(st, 0, 0, 'c_ronin'); K.put(st, 0, 1, 'b_hotdog'); K.put(st, 0, 3, 'b_hotdog');
  eq(E.cStats(st, 0, 0).atk, 4);
  K.build(st, 0, 1, 'c_dome');
  eq(E.cStats(st, 0, 0).atk, 5); eq(E.cStats(st, 0, 3).atk, 1);
});
test('Plant Corn converts your landscape; Cornucopia spawns Earlings', () => {
  const st = arena({ lands0: ['corn', 'blue', 'blue', 'blue'] }); K.build(st, 0, 0, 'c_cornucopia');
  const [pc] = K.hand(st, 0, ['c_plant']);
  let r = run(st, { t: 'play', p: 0, uid: pc.uid, targets: [{ side: 0, lane: 2, land: 1 }] });
  eq(r.state.players[0].lanes[2].land.type, 'corn');
  r = run(r.state, { t: 'end', p: 0 }); r = run(r.state, { t: 'end', p: 1 });
  let n = 0; for (let l = 0; l < 4; l++) if (C(r.state, 0, l) && C(r.state, 0, l).id === 't_earling') n++;
  eq(n, 1);
});

// ---------------------------------------------------------------- Blue Plains
test('Muddy: the Pig changes sides after killing on a Useless Swamp', () => {
  const st = arena({ lands1: ['swamp', 'swamp', 'swamp', 'swamp'] });
  K.put(st, 0, 1, 'b_pig'); K.put(st, 1, 1, 'c_cornball');
  const r = run(st, { t: 'end', p: 0 });
  eq(C(r.state, 0, 1), null);
  const pig = C(r.state, 1, 1); eq(pig && pig.id, 'b_pig'); ok(pig.stuck);
});
test('Cave of Solitude: a flooped creature naps, attacks hit the Cave, spells cannot target it', () => {
  const st = arena({ lands0: ['swamp', 'swamp', 'swamp', 'swamp'] });
  K.put(st, 1, 0, 'b_cooldog', { flooped: true }); K.build(st, 1, 0, 'b_cave'); K.put(st, 0, 0, 'c_worm'); K.put(st, 1, 1, 'c_husker');
  const [bb] = K.hand(st, 0, ['s_breath']);
  const opts = E.targetOptions(st, 0, { uid: bb.uid }, []);
  ok(!opts.some(o => o.side === 1 && o.lane === 0)); ok(opts.some(o => o.side === 1 && o.lane === 1));
  const r = run(st, { t: 'end', p: 0 });
  eq(C(r.state, 1, 0).dmg, 0); eq(B(r.state, 1, 0).dmg, 3);
});
test('Spirit Tower takes control of a 5+ ATK attacker', () => {
  const st = arena(); K.put(st, 0, 2, 'l_fp'); K.build(st, 1, 2, 'b_spirit');
  ok(E.cStats(st, 0, 2).atk >= 5);
  const r = run(st, { t: 'end', p: 0 });
  eq(C(r.state, 0, 2), null); eq(C(r.state, 1, 2).id, 'l_fp'); eq(B(r.state, 1, 2), null); eq(r.state.players[1].hp, 25);
});
test('Ancient Scholar studies (faster in a Schoolhouse) and raises the dead', () => {
  const st = arena({ lands0: ['blue', 'blue', 'blue', 'blue'] });
  K.put(st, 0, 0, 'b_scholar', { study: 1 }); K.build(st, 0, 0, 'b_school');
  const dis = K.discard(st, 0, ['b_pig']);
  eq(E.targetSteps(st, 0, { lane: 0, slot: 'c' }).length, 2);
  const r = run(st, { t: 'floop', p: 0, lane: 0, slot: 'c', targets: [{ uid: dis[0].uid }, { side: 0, lane: 3 }] });
  eq(C(r.state, 0, 3).id, 'b_pig'); eq(C(r.state, 0, 0).study, 0); eq(r.state.players[0].discard.length, 0);
});
test('Schoolhouse grants +1 DEF per turn (max 2)', () => {
  const st = arena(); K.put(st, 0, 0, 'b_cooldog'); K.build(st, 0, 0, 'b_school');
  let r = run(st, { t: 'end', p: 0 }); r = run(r.state, { t: 'end', p: 1 });
  eq(E.cStats(r.state, 0, 0).def, 6);
});
test('Mathematical! readies a flooped creature so it can floop again', () => {
  const st = arena({ lands0: ['blue', 'blue', 'blue', 'blue'], lands1: ['corn', 'corn', 'corn', 'corn'] });
  K.put(st, 0, 1, 'b_pig');
  const [m] = K.hand(st, 0, ['b_math']);
  let r = run(st, { t: 'floop', p: 0, lane: 1, slot: 'c' });
  r = run(r.state, { t: 'play', p: 0, uid: m.uid, targets: [{ side: 0, lane: 1 }] });
  ok(!C(r.state, 0, 1).flooped);
  r = run(r.state, { t: 'move', p: 0, from: 1, to: 2 });
  eq(r.state.players[0].actions, 2, 'Breezy move is free');
  r = run(r.state, { t: 'floop', p: 0, lane: 2, slot: 'c' });
  eq(E.countLand(r.state, 1, 'corn'), 2);
});
test('Rainicorn Ride moves an enemy creature to an empty lane on its side', () => {
  const st = arena({ lands0: ['blue', 'blue', 'blue', 'blue'] }); K.put(st, 1, 0, 'c_worm');
  const [rr] = K.hand(st, 0, ['b_ride']);
  const r = run(st, { t: 'play', p: 0, uid: rr.uid, targets: [{ side: 1, lane: 0 }, { side: 1, lane: 3 }] });
  eq(C(r.state, 1, 0), null); eq(C(r.state, 1, 3).id, 'c_worm');
});
test('Cloud Ranger gets +2 ATK when it moves', () => {
  const st = arena({ lands0: ['blue', 'blue', 'blue', 'blue'] }); K.put(st, 0, 0, 'b_ranger');
  const r = run(st, { t: 'move', p: 0, from: 0, to: 1 });
  eq(E.cStats(r.state, 0, 1).atk, ATK('b_ranger') + 2);
  eq(run(r.state, { t: 'end', p: 0 }).state.players[1].hp, 25 - ATK('b_ranger') - 2);
});

// ---------------------------------------------------------------- Useless Swamp
test('Useless Swamp: Grave Muck raises a Zombie; Mud Slinger applies Rot', () => {
  const st = arena({ lands0: ['swamp', 'swamp', 'swamp', 'swamp'] }); K.put(st, 0, 0, 's_slinger', { dmg: 3 }); K.put(st, 1, 0, 'b_cooldog');
  const r = run(st, { t: 'end', p: 0 });
  eq(C(r.state, 0, 0).id, 't_zombie'); ok(C(r.state, 1, 0).rot);
});
test('Crypt raises a Zombie when an ally nearby dies', () => {
  const st = arena(); K.build(st, 0, 1, 's_crypt'); K.put(st, 0, 0, 'b_cooldog', { dmg: 4 }); K.put(st, 1, 0, 'c_husker');
  const r = run(st, { t: 'end', p: 0 });
  eq(C(r.state, 0, 0), null); eq(C(r.state, 0, 1).id, 't_zombie');
});
test('Mud Pit trap: enemy gets Stuck and Rots, then the pit sinks', () => {
  const st = arena({ lands0: ['blue', 'blue', 'blue', 'blue'] }); K.build(st, 1, 2, 's_mudpit');
  ok(B(st, 1, 2).hidden);
  const [cd] = K.hand(st, 0, ['b_cooldog']);
  const r = run(st, { t: 'play', p: 0, uid: cd.uid, lane: 2 });
  const c = C(r.state, 0, 2); ok(c.stuck && c.rot); eq(B(r.state, 1, 2), null);
  eq(E.moveOptions(r.state, 0, 2).length, 0);
});
test('Hidden traps do not absorb attacks', () => {
  const st = arena(); K.put(st, 0, 3, 'b_cooldog'); K.build(st, 1, 3, 'r_booby');
  eq(run(st, { t: 'end', p: 0 }).state.players[1].hp, 25 - ATK('b_cooldog'));
});
test('The Reaper steals damaged enemies with 3 or less DEF left', () => {
  const st = arena({ lands0: ['swamp', 'swamp', 'swamp', 'swamp'] });
  K.put(st, 1, 0, 'b_cooldog', { dmg: 3 }); K.put(st, 1, 1, 'c_husker'); K.put(st, 1, 2, 'c_scarecrow', { dmg: 1 });
  const [rp] = K.hand(st, 0, ['s_reaper']);
  const r = run(st, { t: 'play', p: 0, uid: rp.uid, targets: [] });
  eq(C(r.state, 0, 0).id, 'b_cooldog'); ok(C(r.state, 0, 0).flooped); eq(C(r.state, 1, 0), null);
  eq(C(r.state, 1, 1).id, 'c_husker'); eq(C(r.state, 1, 2).id, 'c_scarecrow');
});
test('Unearth returns a creature from the discard pile with Rot', () => {
  const st = arena({ lands0: ['swamp', 'swamp', 'swamp', 'swamp'] });
  const d = K.discard(st, 0, ['b_cooldog']); const [u] = K.hand(st, 0, ['s_unearth']);
  const r = run(st, { t: 'play', p: 0, uid: u.uid, targets: [{ uid: d[0].uid }, { side: 0, lane: 3 }] });
  eq(C(r.state, 0, 3).id, 'b_cooldog'); ok(C(r.state, 0, 3).rot);
});
test('Witch\'s Cauldron sacrifices for 2 cards and an Action', () => {
  const st = arena(); K.build(st, 0, 0, 's_cauldron'); K.put(st, 0, 0, 'b_cooldog');
  const r = run(st, { t: 'floop', p: 0, lane: 0, slot: 'b' });
  eq(C(r.state, 0, 0), null); eq(r.state.players[0].hand.length, 2); eq(r.state.players[0].actions, 3);
});
test('The Lich makes every enemy Rot; Gravedigger raises Zombies', () => {
  const st = arena({ lands0: ['swamp', 'swamp', 'swamp', 'swamp'] });
  K.put(st, 0, 0, 's_lich'); K.put(st, 0, 2, 's_digger'); K.put(st, 1, 0, 'c_husker'); K.put(st, 1, 3, 'b_cooldog');
  let r = run(st, { t: 'floop', p: 0, lane: 0, slot: 'c' });
  ok(C(r.state, 1, 0).rot && C(r.state, 1, 3).rot); eq(r.state.players[0].actions, 1);
  r = run(r.state, { t: 'floop', p: 0, lane: 2, slot: 'c', targets: [{ side: 0, lane: 3 }] });
  eq(C(r.state, 0, 3).id, 't_zombie'); eq(r.state.players[0].actions, 0);
});
test('Grave Gobbler grows when creatures die', () => {
  const st = arena(); K.put(st, 0, 0, 's_gobbler'); K.put(st, 0, 1, 'c_worm'); K.put(st, 1, 1, 'b_hotdog');
  const r = run(st, { t: 'end', p: 0 });
  eq(C(r.state, 0, 0).gob, 1);
});

// ---------------------------------------------------------------- IcyLands
test('Ice Castle chills across; Frostbite chills on hit', () => {
  const st = arena({ lands0: ['ice', 'ice', 'ice', 'ice'] }); K.build(st, 0, 0, 'i_castle'); K.put(st, 1, 0, 'c_worm');
  K.put(st, 0, 1, 'i_golem'); K.put(st, 1, 1, 'c_scarecrow');
  const r = run(st, { t: 'end', p: 0 });
  eq(C(r.state, 1, 0).chill, 1); eq(E.cStats(r.state, 1, 0).atk, 2);
  eq(C(r.state, 1, 1).chill, 1, 'golem hit chills');
});
test('Frozen Lake freezes and damages an entering enemy', () => {
  const st = arena({ lands0: ['blue', 'blue', 'blue', 'blue'] }); K.build(st, 1, 1, 'i_lake');
  const [cd] = K.hand(st, 0, ['b_ranger']);
  const r = run(st, { t: 'play', p: 0, uid: cd.uid, lane: 1 });
  ok(C(r.state, 0, 1).frozen); eq(C(r.state, 0, 1).dmg, 2); eq(B(r.state, 1, 1), null);
  const r2 = run(r.state, { t: 'end', p: 0 });
  eq(r2.state.players[1].hp, 25, 'frozen this turn');
});
test('Blizzard Wizard pushes; crash damages both', () => {
  const st = arena(); K.put(st, 0, 1, 'i_wizard'); K.put(st, 1, 1, 'c_husker'); K.put(st, 1, 0, 'c_scarecrow');
  let r = run(st, { t: 'floop', p: 0, lane: 1, slot: 'c', targets: [{ side: 1, lane: 2 }] });
  eq(C(r.state, 1, 1), null); eq(C(r.state, 1, 2).id, 'c_husker');
  const st2 = arena(); K.put(st2, 0, 1, 'i_wizard'); K.put(st2, 1, 1, 'c_husker'); K.put(st2, 1, 0, 'c_scarecrow');
  r = run(st2, { t: 'floop', p: 0, lane: 1, slot: 'c', targets: [{ side: 1, lane: 0 }] });
  eq(C(r.state, 1, 1).dmg, 2); eq(C(r.state, 1, 0).dmg, 2);
});
test('Ice King freezes across and chills the rest', () => {
  const st = arena({ lands0: ['ice', 'ice', 'ice', 'ice'] }); K.put(st, 0, 1, 'i_king');
  K.put(st, 1, 1, 'c_worm'); K.put(st, 1, 3, 'c_husker');
  const r = run(st, { t: 'floop', p: 0, lane: 1, slot: 'c' });
  ok(C(r.state, 1, 1).frozen); eq(C(r.state, 1, 3).chill, 1); eq(r.state.players[0].actions, 1);
});
test('Snow Day converts a landscape and chills; Reclaim Landscape restores it', () => {
  const st = arena({ lands0: ['ice', 'ice', 'ice', 'ice'], lands1: ['corn', 'corn', 'corn', 'corn'] }); K.put(st, 1, 0, 'c_husker');
  const [sd] = K.hand(st, 0, ['i_snowday']);
  let r = run(st, { t: 'play', p: 0, uid: sd.uid, targets: [{ side: 1, lane: 0, land: 1 }] });
  eq(r.state.players[1].lanes[0].land.type, 'ice'); eq(C(r.state, 1, 0).chill, 1); eq(E.countLand(r.state, 1, 'corn'), 3);
  r = run(r.state, { t: 'end', p: 0 });
  const [rc] = K.hand(r.state, 1, ['r_reclaim']); r.state.players[1].actions = 2;
  r = run(r.state, { t: 'play', p: 1, uid: rc.uid, targets: [] });
  eq(r.state.players[1].lanes[0].land.type, 'corn');
});
test('Penguin Igloo hatches Penguins that chill', () => {
  const st = arena(); K.build(st, 0, 2, 'i_igloo');
  let r = run(st, { t: 'end', p: 0 }); r = run(r.state, { t: 'end', p: 1 });
  eq(C(r.state, 0, 2).id, 't_penguin');
});

// ---------------------------------------------------------------- NiceLands
test('Gumdrop Towers link for Shield 2; Nice Day heals', () => {
  const st = arena({ lands0: ['nice', 'nice', 'nice', 'nice'] });
  K.build(st, 0, 0, 'n_tower'); K.build(st, 0, 1, 'n_tower'); K.put(st, 0, 0, 'n_banana'); K.put(st, 0, 1, 'n_tart', { dmg: 2 });
  let r = run(st, { t: 'end', p: 0 }); r = run(r.state, { t: 'end', p: 1 });
  eq(C(r.state, 0, 0).shield, 2); eq(C(r.state, 0, 1).shield, 2); eq(C(r.state, 0, 1).dmg, 1);
});
test('Candy Lab makes the first spell each turn cheaper', () => {
  const st = arena({ lands0: ['nice', 'nice', 'nice', 'nice'] }); K.build(st, 0, 3, 'n_lab'); K.put(st, 0, 0, 'n_banana');
  const h = K.hand(st, 0, ['n_bubble', 'n_bubble']);
  eq(E.costOf(st, 0, h[0].uid), 0);
  const r = run(st, { t: 'play', p: 0, uid: h[0].uid, targets: [{ side: 0, lane: 0 }] });
  eq(r.state.players[0].actions, 2); eq(E.costOf(r.state, 0, h[1].uid), 1);
});
test('Princess Bubblegum: buildings zap across', () => {
  const st = arena({ lands0: ['nice', 'nice', 'nice', 'nice'] }); K.put(st, 0, 0, 'n_pb'); K.build(st, 0, 1, 'n_wall'); K.build(st, 0, 2, 'n_tower');
  K.put(st, 1, 1, 'c_worm'); K.put(st, 1, 2, 'c_husker'); K.put(st, 1, 3, 'b_cooldog');
  const r = run(st, { t: 'floop', p: 0, lane: 0, slot: 'c' });
  eq(C(r.state, 1, 1).dmg, 2); eq(C(r.state, 1, 2).dmg, 2); eq(C(r.state, 1, 3).dmg, 0);
});
test('Sweet Justice only targets lanes with your building', () => {
  const st = arena({ lands0: ['nice', 'nice', 'nice', 'nice'] }); K.build(st, 0, 2, 'n_wall'); K.put(st, 1, 2, 'c_worm'); K.put(st, 1, 0, 'c_husker');
  const [sj] = K.hand(st, 0, ['n_justice']);
  const o = E.targetOptions(st, 0, { uid: sj.uid }, []);
  eq(o.length, 1); eq(o[0].lane, 2);
});
test('Mr. Cupcake enters with Shield 2', () => {
  const st = arena({ lands0: ['nice', 'nice', 'nice', 'nice'] }); const [c] = K.hand(st, 0, ['n_cupcake']);
  eq(C(run(st, { t: 'play', p: 0, uid: c.uid, lane: 1 }).state, 0, 1).shield, 2);
});

// ---------------------------------------------------------------- LavaFlats
test('Scorch burns on hit; Fire Forge sharpens', () => {
  const st = arena({ lands0: ['lava', 'lava', 'lava', 'lava'] }); K.put(st, 0, 0, 'l_bun'); K.put(st, 1, 0, 'c_scarecrow'); K.build(st, 0, 0, 'l_forge');
  const r = run(st, { t: 'end', p: 0 });
  eq(C(r.state, 1, 0).burn, 1); eq(C(r.state, 0, 0).forge, 1); eq(E.cStats(r.state, 0, 0).atk, 3);
});
test('Lava Cannon hits building, else creature, else hero', () => {
  const st = arena(); K.build(st, 0, 0, 'l_cannon'); K.build(st, 1, 0, 'n_wall');
  K.build(st, 0, 1, 'l_cannon'); K.put(st, 1, 1, 'c_scarecrow');
  K.build(st, 0, 2, 'l_cannon');
  const r = run(st, { t: 'end', p: 0 });
  eq(B(r.state, 1, 0).dmg, 3); eq(C(r.state, 1, 1).dmg, 2); eq(r.state.players[1].hp, 23);
});
test('Fire Pit burns enemies in three lanes; Fireball splashes', () => {
  const st = arena({ lands0: ['lava', 'lava', 'lava', 'lava'] }); K.build(st, 0, 1, 'l_pit');
  K.put(st, 1, 0, 'c_scarecrow'); K.put(st, 1, 1, 'c_scarecrow'); K.put(st, 1, 2, 'c_scarecrow'); K.put(st, 1, 3, 'c_scarecrow');
  const [fb] = K.hand(st, 0, ['l_fireball']);
  let r = run(st, { t: 'play', p: 0, uid: fb.uid, targets: [{ side: 1, lane: 2 }] });
  eq(C(r.state, 1, 2).dmg, 3); eq(C(r.state, 1, 1).dmg, 1); eq(C(r.state, 1, 3).dmg, 1); eq(C(r.state, 1, 0).dmg, 0);
  r = run(r.state, { t: 'end', p: 0 });
  eq(C(r.state, 1, 0).burn, 1); eq(C(r.state, 1, 2).burn, 1); eq(C(r.state, 1, 3).burn, 0);
});
test('Eruption converts a landscape and deals 3; Fire Elemental explodes', () => {
  const st = arena({ lands0: ['lava', 'lava', 'lava', 'lava'] }); K.put(st, 1, 1, 'c_worm'); K.put(st, 0, 0, 'l_elemental', { dmg: 2 }); K.put(st, 1, 0, 'c_scarecrow');
  const [er] = K.hand(st, 0, ['l_eruption']);
  let r = run(st, { t: 'play', p: 0, uid: er.uid, targets: [{ side: 1, lane: 1, land: 1 }] });
  eq(r.state.players[1].lanes[1].land.type, 'lava'); eq(C(r.state, 1, 1).dmg, 3);
  r = run(r.state, { t: 'end', p: 0 });
  // elemental 3 atk hits scarecrow (6), takes 1 back -> dies at 3 dmg -> explodes for 2
  eq(C(r.state, 0, 0), null); eq(C(r.state, 1, 0).dmg, 5);
});
test('Flame Princess burns every enemy', () => {
  const st = arena({ lands0: ['lava', 'lava', 'lava', 'lava'] }); K.put(st, 0, 0, 'l_fp'); K.put(st, 1, 1, 'c_worm'); K.put(st, 1, 2, 'c_husker');
  const r = run(st, { t: 'floop', p: 0, lane: 0, slot: 'c' });
  eq(C(r.state, 1, 1).burn, 2); eq(C(r.state, 1, 2).burn, 2);
});

// ---------------------------------------------------------------- Rainbow
test('Volcano: can\'t floop the turn it is played; then wipes every creature', () => {
  const st = arena(); const [v] = K.hand(st, 0, ['r_volcano']);
  let r = run(st, { t: 'play', p: 0, uid: v.uid, lane: 0 });
  ok(E.floopBlock(r.state, 0, 0, 'b').includes('rumble'));
  const st2 = arena(); K.build(st2, 0, 0, 'r_volcano'); K.put(st2, 0, 1, 'b_cooldog'); K.put(st2, 1, 2, 'c_worm'); K.put(st2, 1, 3, 'c_maize');
  r = run(st2, { t: 'floop', p: 0, lane: 0, slot: 'b' });
  for (let l = 0; l < 4; l++) { eq(C(r.state, 0, l), null); eq(C(r.state, 1, l), null); }
  eq(B(r.state, 0, 0), null); ok(r.state.players[1].hand.some(c => c.id === 'c_maize'), 'immortal returns');
});
test('Teleport only targets your own creatures and can swap', () => {
  const st = arena(); K.put(st, 0, 0, 'b_cooldog'); K.put(st, 0, 3, 'c_husker'); K.put(st, 1, 1, 'c_worm');
  const [tp] = K.hand(st, 0, ['r_teleport']);
  const o = E.targetOptions(st, 0, { uid: tp.uid }, []);
  ok(o.every(x => x.side === 0));
  const r = run(st, { t: 'play', p: 0, uid: tp.uid, targets: [{ side: 0, lane: 0 }, { side: 0, lane: 3 }] });
  eq(C(r.state, 0, 3).id, 'b_cooldog'); eq(C(r.state, 0, 0).id, 'c_husker');
});
test('Archer Dan damages every enemy building, including traps', () => {
  const st = arena(); K.build(st, 1, 0, 'n_wall'); K.build(st, 1, 2, 'r_booby');
  const [d] = K.hand(st, 0, ['r_dan']);
  const r = run(st, { t: 'play', p: 0, uid: d.uid, lane: 1 });
  eq(B(r.state, 1, 0).dmg, 3); eq(B(r.state, 1, 2), null);
});
test('Magic Portal opens a twin and makes long moves free', () => {
  const st = arena(); K.put(st, 0, 0, 'b_cooldog');
  const [pt] = K.hand(st, 0, ['r_portal']);
  let r = run(st, { t: 'play', p: 0, uid: pt.uid, lane: 0 });
  let twin = -1; for (let l = 1; l < 4; l++) if (B(r.state, 0, l) && B(r.state, 0, l).id === 'r_portal') twin = l;
  ok(twin > 0, 'twin opened');
  const m = E.moveOptions(r.state, 0, 0).find(x => x.to === twin);
  ok(m && m.cost === 0, 'free portal move');
});
test('Booby Trap hits an entering enemy for 3', () => {
  const st = arena(); K.build(st, 1, 1, 'r_booby'); const [c] = K.hand(st, 0, ['c_worm']);
  st.players[0].lanes.forEach(L => { L.land = { type: 'corn', orig: 'corn', down: false, by: null }; });
  const r = run(st, { t: 'play', p: 0, uid: c.uid, lane: 1 });
  eq(C(r.state, 0, 1).dmg, 3);
});
test('Wandering Bald Man wanders, and gets stuck in a Useless Swamp', () => {
  const st = arena({ lands0: ['nice', 'nice', 'nice', 'nice'] }); K.put(st, 0, 0, 'r_baldman');
  st.active = 1; st.turn = 4;
  let r = run(st, { t: 'end', p: 1 });
  ok(!C(r.state, 0, 0), 'wandered');
  const st2 = arena({ lands0: ['swamp', 'nice', 'nice', 'nice'] }); K.put(st2, 0, 0, 'r_baldman'); st2.active = 1; st2.turn = 4;
  r = run(st2, { t: 'end', p: 1 });
  ok(C(r.state, 0, 0) && C(r.state, 0, 0).stuck, 'stuck in the mud');
});
test('Tree Fort heals; Nurse Poundcake heals the hero', () => {
  const st = arena(); K.build(st, 0, 0, 'r_treefort'); K.put(st, 0, 0, 'b_cooldog', { dmg: 3 }); K.put(st, 0, 1, 'r_poundcake');
  st.players[0].hp = 20;
  let r = run(st, { t: 'floop', p: 0, lane: 1, slot: 'c' });
  eq(r.state.players[0].hp, 22);
  r = run(r.state, { t: 'end', p: 0 }); r = run(r.state, { t: 'end', p: 1 });
  eq(C(r.state, 0, 0).dmg, 1);
});

// ---------------------------------------------------------------- actions
test('moves: 1 Action, Breezy free on Blue Plains, swaps, once per turn, Stuck/Frozen cannot', () => {
  const st = arena({ lands0: ['blue', 'nice', 'nice', 'nice'] });
  K.put(st, 0, 0, 'b_cooldog'); K.put(st, 0, 2, 'c_husker'); K.put(st, 0, 3, 'c_scarecrow', { stuck: true });
  eq(E.moveCost(st, 0, 0, 1), 0); eq(E.moveCost(st, 0, 2, 1), 1);
  let r = run(st, { t: 'move', p: 0, from: 2, to: 1 });
  eq(r.state.players[0].actions, 1);
  eq(E.moveOptions(r.state, 0, 1).length, 0, 'already moved');
  eq(E.moveOptions(r.state, 0, 3).length, 0, 'stuck');
  ok(!E.moveOptions(r.state, 0, 0).some(m => m.to === 1), 'cannot swap with a creature that already moved');
  const st2 = arena({ lands0: ['blue', 'nice', 'nice', 'nice'] }); K.put(st2, 0, 0, 'b_cooldog'); K.put(st2, 0, 1, 'c_husker');
  r = run(st2, { t: 'move', p: 0, from: 0, to: 1 });
  eq(C(r.state, 0, 1).id, 'b_cooldog'); eq(C(r.state, 0, 0).id, 'c_husker'); eq(r.state.players[0].actions, 2);
  const st3 = arena(); K.put(st3, 0, 1, 'c_husker', { frozen: true, thawAt: 9 });
  eq(E.moveOptions(st3, 0, 1).length, 0, 'frozen');
});
test('draw: costs 1 Action, hand max, reshuffles the discard pile', () => {
  const st = arena(); st.players[0].deck = []; K.discard(st, 0, ['b_cooldog', 'c_husker']);
  let r = run(st, { t: 'draw', p: 0 });
  eq(r.state.players[0].actions, 1); eq(r.state.players[0].hand.length, 1); eq(r.state.players[0].deck.length, 1);
  ok(r.events.some(e => e.t === 'reshuffle'));
  const st2 = arena(); K.hand(st2, 0, Array(8).fill('r_pancakes'));
  eq(err(st2, { t: 'draw', p: 0 }), 'Hand is full');
});

// ---------------------------------------------------------------- win conditions
test('hero at 0 HP loses', () => {
  const st = arena(); st.players[1].hp = 2; K.put(st, 0, 0, 'b_cooldog');
  const r = run(st, { t: 'end', p: 0 });
  eq(r.state.winner, 0); eq(r.state.phase, 'over'); ok(r.events.some(e => e.t === 'gameOver'));
  eq(err(r.state, { t: 'end', p: 1 }), 'The game is over');
});
test('overtime damages the active hero from round 15', () => {
  const st = arena(); st.turn = 28; st.round = 14; st.active = 1;
  const r = run(st, { t: 'end', p: 1 });
  eq(r.state.round, 15); eq(r.state.players[0].hp, 24);
});
test('concede ends the game', () => {
  const st = arena(); const r = run(st, { t: 'concede', p: 0 }); eq(r.state.winner, 1);
});
test('Heat Wave burns the hero directly', () => {
  const st = arena({ lands0: ['lava', 'lava', 'lava', 'lava'] }); const [h] = K.hand(st, 0, ['l_heatwave']);
  eq(run(st, { t: 'play', p: 0, uid: h.uid, targets: [] }).state.players[1].hp, 23);
});

// ---------------------------------------------------------------- determinism, redaction, fuzz
function playout(seed, decks, pick) {
  let st = E.newGame({ seed, players: [{ deck: decks[0] }, { deck: decks[1] }] }).state;
  let steps = 0;
  const rng = (() => { let s = E.hashSeed(seed + 'pick'); return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; })();
  while (st.winner == null && steps < 3000) {
    const p = st.pending ? st.pending.side : (st.phase === 'mulligan' ? (st.players[0].mulled == null ? 0 : 1) : st.active);
    const acts = E.legalActions(st, p);
    if (!acts.length) throw new Error('no legal actions for ' + p + ' phase ' + st.phase);
    const a = pick(acts, rng);
    const r = E.apply(st, a);
    if (r.error) throw new Error('legal action rejected: ' + r.error + ' ' + JSON.stringify(a));
    st = r.state; steps++;
  }
  return { st, steps };
}
const randomPick = (acts, rng) => { const non = acts.filter(a => a.t !== 'end'); if (non.length && rng() < 0.8) return non[Math.floor(rng() * non.length)]; return acts[Math.floor(rng() * acts.length)]; };
test('determinism: same seed and commands give the same game', () => {
  const a = playout('det', [E.STARTERS.corn, E.STARTERS.blue], randomPick);
  const b = playout('det', [E.STARTERS.corn, E.STARTERS.blue], randomPick);
  eq(JSON.stringify(a.st), JSON.stringify(b.st));
});
test('redaction hides hands, decks and traps', () => {
  const st = arena(); K.hand(st, 1, ['c_husker', 'c_worm']); K.build(st, 1, 0, 's_mudpit');
  const r = E.redact(st, 0);
  ok(r.players[1].hand.every(c => c.id === '?')); ok(r.players[1].deck.every(c => c.id === '?')); ok(r.players[0].deck.slice(0, -1).every(c => c.id === '?')); eq(r.players[0].deck[r.players[0].deck.length - 1].id, st.players[0].deck[st.players[0].deck.length - 1].id, 'own next card visible');
  eq(r.players[1].lanes[0].building.id, '?trap'); eq(st.players[1].lanes[0].building.id, 's_mudpit');
});
test('fuzz: random legal playouts never error and always finish; card count is conserved', () => {
  const keys = Object.keys(E.STARTERS);
  for (let i = 0; i < 150; i++) {
    const d0 = E.STARTERS[keys[i % keys.length]], d1 = E.STARTERS[keys[(i * 7 + 3) % keys.length]];
    const { st } = playout('fuzz' + i, [d0, d1], randomPick);
    ok(st.winner != null, 'game ' + i + ' finished');
    let n = 0;
    for (const P of st.players) {
      n += P.deck.length + P.hand.length + P.discard.filter(c => !E.CARDS[c.id].token).length;
      for (const L of P.lanes) { if (L.creature && !L.creature.token) n++; if (L.building && !L.building.twin) n++; }
    }
    eq(n, 40, 'cards conserved in game ' + i);
  }
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) { console.log('\nFAILURES:\n- ' + fails.join('\n- ')); process.exit(1); }
