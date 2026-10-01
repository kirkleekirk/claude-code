/* META */
// Progression and screens: save/load, starter pick, home, Table Tour ladder, quick match, daily challenge,
// pass-and-play, deck builder, collection with levels, card packs, settings, results.
var Meta = (function () {
'use strict';
const E = Engine, R = Render;
const $ = s => document.querySelector(s);
const esc = s => UI.esc(s);
const KEY = 'cardwars.glowboard.save.v1';
const LANDC = R.LANDC;
let memStore = null;

// ------------------------------------------------------------------ persistence
function defaults() {
  return {
    v: 1, name: 'Finn', started: false, starter: null, unlocked: {}, cards: {}, sparks: 0, decks: [], active: 0,
    tour: { beaten: [] }, stats: { wins: 0, losses: 0, games: 0, streak: 0, best: 0, byLand: {} },
    settings: { sfx: 0.8, music: 0.45, haptics: true, reduceMotion: false, cbIcons: true, text: 1, speed: 1, timer: false, confirm: true, quality: 1 },
    tutorialDone: false, daily: { date: '', done: false }, seenRules: false
  };
}
let S = defaults();
function load() {
  let raw = null;
  try { raw = window.localStorage.getItem(KEY); } catch (e) { raw = memStore; }
  if (raw == null) raw = memStore;
  if (raw) { try { const d = JSON.parse(raw); S = Object.assign(defaults(), d); S.settings = Object.assign(defaults().settings, d.settings || {}); S.stats = Object.assign(defaults().stats, d.stats || {}); } catch (e) { S = defaults(); } }
  return S;
}
function save() {
  const raw = JSON.stringify(S);
  memStore = raw;
  try { window.localStorage.setItem(KEY, raw); } catch (e) { /* in-memory fallback */ }
}

// ------------------------------------------------------------------ data: opponents
const ex = E.expand;
const LSP_DECK = { lands: ['swamp', 'swamp', 'blue', 'blue'], cards: ex([['s_wisp', 2], ['s_slinger', 2], ['s_digger', 1], ['s_witch', 1], ['s_breath', 2], ['s_reaper', 1], ['b_hotdog', 2], ['b_cooldog', 2], ['b_skypup', 2], ['b_math', 1], ['b_ride', 1], ['r_pancakes', 1], ['r_teleport', 1], ['r_booby', 1]]) };
const TREE_DECK = { lands: ['nice', 'nice', 'nice', 'nice'], cards: ex([['n_banana', 2], ['n_butler', 2], ['n_tart', 2], ['n_guardian', 2], ['n_cupcake', 1], ['n_pb', 1], ['n_tower', 2], ['n_wall', 2], ['n_bubble', 1], ['n_science', 1], ['r_treefort', 2], ['r_pancakes', 2]]) };
const BUN_DECK = { lands: ['lava', 'lava', 'lava', 'lava'], cards: ex([['l_pup', 2], ['l_bun', 2], ['l_flambo', 1], ['l_elemental', 2], ['l_golem', 2], ['l_fp', 1], ['l_forge', 1], ['l_pit', 2], ['l_fireball', 2], ['l_heatwave', 2], ['r_glory', 1], ['r_baldman', 2]]) };
const TOUR = [
  { id: 'treetrunks', name: 'Tree Trunks', hero: 'treetrunks', land: 'nice', diff: 'easy', pers: 'turtle', lvl: 1, deck: TREE_DECK, quote: 'Well, aren’t you a sweet pea. Let’s play nice, now.', lines: ['Have an apple pie, sugar!', 'Oh my stars!', 'That’s not very nice.', 'I’m old, not slow!'] },
  { id: 'cinnamonbun', name: 'Cinnamon Bun', hero: 'cinnamonbun', land: 'lava', diff: 'easy', pers: 'aggro', lvl: 1, deck: BUN_DECK, quote: 'I’m a knight now! Knights play Card Wars, right?', lines: ['I’m a knight now!', 'Hot hot HOT!', 'Did I win? I can’t tell.', 'Flame Princess taught me that!'] },
  { id: 'gunter', name: 'Gunter', hero: 'gunter', land: 'ice', diff: 'easy', pers: 'tempo', lvl: 1, deck: E.STARTERS.ice, quote: 'Wenk.', lines: ['Wenk.', 'WENK!', '...wenk.', 'Wenk wenk.'] },
  { id: 'lemongrab', name: 'Earl of Lemongrab', hero: 'lemongrab', land: 'corn', diff: 'normal', pers: 'aggro', lvl: 1, deck: { lands: ['corn', 'corn', 'corn', 'corn'], cards: E.STARTERS.corn.cards }, quote: 'This game is UNACCEPTABLE! I shall win it.', lines: ['UNACCEPTABLE!', 'Acceptable.', 'Three hours dungeon!', 'You smell like... cards.'] },
  { id: 'lsp', name: 'Lumpy Space Princess', hero: 'lsp', land: 'swamp', diff: 'normal', pers: 'tempo', lvl: 1, deck: LSP_DECK, quote: 'Oh my glob, fine. One game. Then you owe me.', lines: ['Oh my glob!', 'Whatever.', 'You’re so lumping lame.', 'Lumps!'] },
  { id: 'bmo', name: 'BMO', hero: 'bmo', land: 'blue', diff: 'normal', pers: 'control', lvl: 2, deck: E.STARTERS.blue, quote: 'I do not play such games... with Jake. But I will play with YOU.', lines: ['BMO chop!', 'Who wants to play video games?', 'If this were a real attack, you’d be dead.', 'Beep boop.'] },
  { id: 'pb', name: 'Princess Bubblegum', hero: 'pb', land: 'nice', diff: 'normal', pers: 'control', lvl: 2, deck: E.STARTERS.nice, quote: 'I ran the numbers. Card Wars is 73% science.', lines: ['Science!', 'That’s not logical.', 'Hypothesis: you lose.', 'Peppermint Butler, take notes.'] },
  { id: 'fp', name: 'Flame Princess', hero: 'fp', land: 'lava', diff: 'hard', pers: 'aggro', lvl: 2, deck: E.STARTERS.lava, quote: 'I’m not evil. I’m just FIRE.', lines: ['Burn!', 'You can’t handle the heat.', 'I’m just fire!', 'Flambo, light ’em up.'] },
  { id: 'iceking', name: 'Ice King', hero: 'iceking', land: 'ice', diff: 'hard', pers: 'control', lvl: 2, deck: E.STARTERS.ice, quote: 'Finally someone who’ll play with me! Gunter, fetch my crown!', lines: ['Ice ice, baby!', 'Gunter, look! I’m winning!', 'Why won’t anyone play with me?', 'Freeze, you!'] },
  { id: 'marceline', name: 'Marceline', hero: 'marceline', land: 'swamp', diff: 'hard', pers: 'turtle', lvl: 2, deck: E.STARTERS.swamp, quote: 'I’m the Vampire Queen of this table. Deal me in.', lines: ['Boo!', 'Let’s make it spooky.', 'I’ve had a thousand years to practice.', 'Heh. Nice try.'] },
  { id: 'jake', name: 'Jake', hero: 'jake', land: 'corn', diff: 'hard', pers: 'aggro', lvl: 3, boss: true, deck: E.STARTERS.corn, quote: 'Card Wars is the greatest game ever! FOR THE GLORY OF JAKORIA!', lines: ['FOR THE GLORY OF JAKORIA!', 'Cornfields are AWESOME!', 'I floop the... uh... everything!', 'Babe in the woods, man.', 'Your beginner’s luck ends this round!'] }
];
const HEROES = { blue: 'finn', corn: 'jake', swamp: 'marceline', ice: 'iceking', nice: 'pb', lava: 'fp' };
const DESC = {
  blue: 'Finn’s deck. Free moves on Blue Plains, the landscape-eating Pig, Spirit Tower mind control.',
  corn: 'Jake’s deck. Swarms of Earlings, Husker Knights that Ripen, the Immortal Maize Walker.',
  swamp: 'Rot, Zombies that keep coming back, and The Reaper stealing souls.',
  ice: 'Chill and Freeze enemies, push them around, then smash with the Abominable Snowman.',
  nice: 'Shields, healing, Guards and buildings; Princess Bubblegum zaps with SCIENCE!',
  lava: 'Burn everything. Siege golems, the Lava Cannon and Flame Princess herself.'
};

// ------------------------------------------------------------------ collection helpers
function own(id) { return S.cards[id] ? S.cards[id].n : 0; }
function lvl(id) { return S.cards[id] ? S.cards[id].lvl || 1 : 1; }
function maxCopies(id) { return E.CARDS[id].r === 'L' ? 1 : 2; }
function grant(id, n) { const c = S.cards[id] || (S.cards[id] = { n: 0, lvl: 1 }); const add = Math.min(n, maxCopies(id) - c.n); c.n += Math.max(0, add); return Math.max(0, add); }
function unlockLand(land, silent) {
  if (S.unlocked[land]) return false;
  S.unlocked[land] = true;
  const st = E.STARTERS[land];
  const cnt = {}; st.cards.forEach(id => (cnt[id] = (cnt[id] || 0) + 1));
  for (const id in cnt) grant(id, cnt[id]);
  if (!S.decks.some(d => d.from === land)) S.decks.push({ name: st.name, lands: st.lands.slice(), cards: st.cards.slice(), from: land });
  save();
  if (!silent) UI.toast('New deck unlocked: ' + st.name + '!');
  return true;
}
function levelsFor() { const o = {}; for (const id in S.cards) o[id] = S.cards[id].lvl || 1; return o; }
function activeDeck() { const d = S.decks[S.active] || S.decks[0]; return d; }
function deckHero(d) {
  const cnt = {}; for (const t of d.lands) cnt[t] = (cnt[t] || 0) + 1;
  let best = d.lands[0], bn = 0; for (const t in cnt) if (cnt[t] > bn) { bn = cnt[t]; best = t; }
  return HEROES[best] || 'finn';
}
function deckValid(d) { const v = E.validateDeck(d); for (const id of d.cards) { const n = d.cards.filter(x => x === id).length; if (n > own(id)) { v.ok = false; v.errs.push('You only own ' + own(id) + ' ' + E.CARDS[id].name); break; } } return v; }

// ------------------------------------------------------------------ UI scaffolding
function screen(name, html) {
  let el = document.getElementById('scr-' + name);
  if (!el) { el = document.createElement('div'); el.id = 'scr-' + name; el.className = 'screen'; $('#screens').appendChild(el); }
  el.innerHTML = '<div class="scr">' + html + '</div>';
  UI.showScreen(name);
  return el;
}
function sparksHTML() { return '<span class="sparks">' + UI.ICON.spark + S.sparks + '</span>'; }
function topbar(title, back) { return '<div class="top">' + (back ? '<button class="iconbtn" data-back aria-label="Back"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></button>' : '') + '<h1>' + esc(title) + '</h1>' + sparksHTML() + '</div>'; }
function wireBack(el, fn) { const b = el.querySelector('[data-back]'); if (b) b.onclick = () => { Sound.play('click'); (fn || home)(); }; }
function landChip(t) { const c = document.createElement('canvas'); c.width = 40; c.height = 40; Art.landIcon(c.getContext('2d'), t, 20, 20, 15, '#1b1424'); return '<span class="landchip" style="background:' + LANDC[t] + '" title="' + E.LANDS[t].name + '"><img src="' + c.toDataURL() + '" style="width:1.2rem;height:1.2rem"></span>'; }
function portraitImg(id, size) { return '<img src="' + Art.portraitURL(id, 96) + '" style="width:' + size + ';height:' + size + ';border-radius:50%;background:#2a2140">'; }

// ------------------------------------------------------------------ home
function home() {
  R.mode = 'home';
  if (!S.started) { starterPick(); return; }
  const st = S.stats;
  const next = TOUR.find(o => !S.tour.beaten.includes(o.id));
  const el = screen('home', '<div class="homewrap"><div>' + '<div class="top" style="justify-content:flex-end">' + sparksHTML() + '</div>' +
    '<div class="logo"><div class="cw">CARD<br>WARS</div><div class="sub">GLOWBOARD</div><div class="fan">a fan-made tribute to the Adventure Time episode</div></div></div>' +
    '<div><div class="menu">' +
    '<button class="btn" data-go="tour">Table Tour' + (next ? '<br><small style="font-size:.6rem;opacity:.8">next: ' + esc(next.name) + '</small>' : '<br><small style="font-size:.6rem">champion!</small>') + '</button>' +
    '<div class="two"><button class="btn blue" data-go="quick">Quick Match</button><button class="btn blue" data-go="daily">Daily Challenge' + (S.daily.date === today() && S.daily.done ? ' ✓' : '') + '</button></div>' +
    '<div class="two"><button class="btn green" data-go="decks">Decks</button><button class="btn green" data-go="collection">Collection</button></div>' +
    '<div class="two"><button class="btn ghost" data-go="pvp">Pass &amp; Play</button><button class="btn ghost" data-go="learn">How to Play</button></div>' +
    '<button class="btn ghost" data-go="settings">Settings</button>' +
    '</div><div class="stat-line">Wins ' + st.wins + ' • Losses ' + st.losses + ' • Best streak ' + st.best + ' • Tour ' + S.tour.beaten.length + '/' + TOUR.length + '</div></div></div>');
  el.querySelectorAll('[data-go]').forEach(b => b.onclick = () => {
    Sound.unlock(); Sound.play('click');
    const g = b.dataset.go;
    if (g === 'tour') tour(); else if (g === 'quick') quick(); else if (g === 'daily') daily(); else if (g === 'decks') decks(); else if (g === 'collection') collection();
    else if (g === 'pvp') pvp(); else if (g === 'learn') learn(); else if (g === 'settings') settingsScreen(home);
  });
}
function starterPick() {
  const el = screen('starter', '<div class="logo"><div class="cw">CARD<br>WARS</div><div class="sub">GLOWBOARD</div></div>' +
    '<div class="center" style="margin:.6rem 0 1rem;display:flex;gap:.6rem;align-items:center;justify-content:center">' + portraitImg('bmo', '3rem') + '<div style="text-align:left;max-width:20rem;font-size:.85rem;line-height:1.35"><b>BMO:</b> Who wants to play Card Wars? Pick your first deck! You can unlock the others by beating their players on the Table Tour.</div></div>' +
    '<div class="starter" id="picks"></div>');
  const box = el.querySelector('#picks');
  for (const land of E.LAND_TYPES) {
    const st = E.STARTERS[land];
    const d = document.createElement('div'); d.className = 'pick'; d.style.setProperty('--fc', LANDC[land]);
    d.innerHTML = portraitImg(HEROES[land], '3.6rem') + '<b>' + esc(st.name) + '</b><span>' + esc(E.LANDS[land].name) + ' • ' + esc(E.LANDS[land].sig) + '</span><span>' + esc(DESC[land]) + '</span>';
    d.onclick = () => {
      Sound.unlock(); Sound.play('select');
      UI.modal('<h2>' + esc(st.name) + '?</h2><p class="center">' + esc(DESC[land]) + '</p><p class="center" style="font-size:.75rem">Home Advantage: ' + esc(E.LANDS[land].home) + '</p><div class="row"><button class="btn" data-ok>Take it!</button><button class="btn ghost" data-close>Back</button></div>');
      $('#modal [data-ok]').onclick = () => {
        UI.closeModal();
        S.started = true; S.starter = land; S.name = HEROES[land] === 'jake' ? 'Jake' : 'Finn';
        unlockLand(land, true); S.active = 0; S.sparks = 50; save();
        offerTutorial();
      };
    };
    box.appendChild(d);
  }
}
function offerTutorial() {
  UI.modal('<h2>New to Card Wars?</h2><p class="center">' + portraitImg('bmo', '3rem') + '</p><p class="center">BMO can teach you in a quick practice game: play a card, floop, fight, move and use a building.</p><div class="row"><button class="btn" data-tut>Teach me, BMO!</button><button class="btn ghost" data-skip>I know the rules</button></div>', { noClose: true });
  $('#modal [data-tut]').onclick = () => { UI.closeModal(); Tutorial.start(); };
  $('#modal [data-skip]').onclick = () => { UI.closeModal(); S.tutorialDone = true; save(); home(); };
}

// ------------------------------------------------------------------ table tour
function tour() {
  let h = topbar('Table Tour', true) + '<p class="center" style="font-size:.8rem;color:#b6a9d6;margin-top:-.4rem">Beat everyone at the table. Beating a player unlocks their landscape’s deck. Jake is waiting at the end…</p><div class="list" id="ol"></div>';
  const el = screen('tour', h); wireBack(el);
  const ol = el.querySelector('#ol');
  let unlockedIdx = 0; while (unlockedIdx < TOUR.length && S.tour.beaten.includes(TOUR[unlockedIdx].id)) unlockedIdx++;
  TOUR.forEach((o, i) => {
    const done = S.tour.beaten.includes(o.id), lock = i > unlockedIdx, cur = i === unlockedIdx;
    const d = document.createElement('div'); d.className = 'opp' + (done ? ' done' : '') + (lock ? ' lock' : '') + (cur ? ' cur' : '');
    const stars = { easy: '★', normal: '★★', hard: '★★★' }[o.diff] + (o.boss ? ' BOSS' : '');
    d.innerHTML = '<img src="' + Art.portraitURL(o.hero, 96) + '" style="width:3rem;height:3rem;border-radius:50%;background:#2a2140"><div class="o"><b>' + (i + 1) + '. ' + esc(o.name) + '</b><span><span class="tag" style="background:' + LANDC[o.land] + '">' + esc(E.LANDS[o.land].name) + '</span>' + stars + '</span></div><span class="badge">' + (done ? '✓ beaten' : lock ? '🔒' : 'Play') + '</span>';
    if (!lock) d.onclick = () => { Sound.play('click'); prematch(o, i); };
    ol.appendChild(d);
  });
}
function prematch(o, idx) {
  const deck = activeDeck();
  const v = deckValid(deck);
  UI.modal('<div class="center">' + portraitImg(o.hero, '5rem') + '</div><h2>' + esc(o.name) + '</h2><p class="center" style="font-style:italic">“' + esc(o.quote) + '”</p>' +
    '<p class="center" style="font-size:.78rem">Plays <b style="color:' + LANDC[o.land] + '">' + esc(E.LANDS[o.land].name) + '</b> • ' + o.diff.toUpperCase() + ' • card level ' + o.lvl + '</p>' +
    '<p class="center" style="font-size:.78rem">Your deck: <b>' + esc(deck.name) + '</b> ' + (v.ok ? '' : '<span style="color:#ff9aa6">(invalid: ' + esc(v.errs[0]) + ')</span>') + '</p>' +
    '<p class="center" style="font-size:.72rem;color:#b6a9d6">Winner is the Cool Guy. Loser drinks the Dweeb cup.</p>' +
    '<div class="row"><button class="btn" data-go ' + (v.ok ? '' : 'disabled') + '>Play!</button><button class="btn ghost" data-deck>Change deck</button></div>');
  $('#modal [data-go]').onclick = () => { UI.closeModal(); playVs(o, { tour: idx }); };
  $('#modal [data-deck]').onclick = () => { UI.closeModal(); decks(() => tour()); };
}
function seatFor(o, diff, lvlOverride) {
  const levels = {}; const L = lvlOverride || o.lvl || 1;
  for (const id of o.deck.cards) levels[id] = L;
  return { kind: 'ai', name: o.name, hero: o.hero, deck: o.deck, levels, difficulty: diff || o.diff, personality: o.pers, lines: o.lines };
}
function mySeat(deck) { return { kind: 'human', name: S.name, hero: deckHero(deck), deck: { lands: deck.lands, cards: deck.cards }, levels: levelsFor() }; }
function playVs(o, ctx) {
  const deck = activeDeck();
  const seed = 'm' + Date.now() + ':' + Math.floor(Math.random() * 1e9);
  const me = mySeat(deck), ai = seatFor(o, ctx.diff, ctx.lvl);
  if (ctx.handicap && ctx.handicap.apply) ctx.handicap.apply(me, ai);
  UI.start({ seed, mode: 'ai', seats: [me, ai], first: ctx.first, overtime: ctx.overtime, setup: ctx.setup, onEnd: res => results(res, o, ctx) });
}

// ------------------------------------------------------------------ quick match / daily / pvp
function quick() {
  UI.modal('<h2>Quick Match</h2><p class="center">A random opponent from the table.</p><div class="row"><button class="btn green" data-d="easy">Easy</button><button class="btn blue" data-d="normal">Normal</button><button class="btn red" data-d="hard">Hard</button></div>');
  document.querySelectorAll('#modal [data-d]').forEach(b => b.onclick = () => {
    UI.closeModal();
    const o = TOUR[Math.floor(Math.random() * TOUR.length)];
    const avg = Math.max(1, Math.round(Object.values(S.cards).reduce((a, c) => a + (c.lvl || 1), 0) / Math.max(1, Object.keys(S.cards).length)));
    const v = deckValid(activeDeck()); if (!v.ok) { UI.toast('Fix your deck first: ' + v.errs[0]); decks(); return; }
    playVs(o, { quick: true, diff: b.dataset.d, lvl: avg });
  });
}
function today() { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
const HANDICAPS = [
  { name: 'Short on HP', text: 'You start with 18 HP.', apply: (me) => { me.hp = 18; } },
  { name: 'Overtime Early', text: 'The board overheats from round 8.', overtime: 8 },
  { name: 'Second Fiddle', text: 'You always go second.', first: 1 },
  { name: 'Fortified Foe', text: 'Your opponent starts with two Candy Walls.', apply: (me, ai) => { ai.startBuildings = [{ id: 'n_wall', lane: 1 }, { id: 'n_wall', lane: 2 }]; } },
  { name: 'Head Start', text: 'Your opponent gets +1 Action on their first turn.', apply: (me, ai) => { ai.bonusActions = 1; } },
  { name: 'Pig Ate It', text: 'One of your landscapes starts eaten (face-down).', setup: st => { st.players[0].lanes[2].land.down = true; } }
];
function daily() {
  const seed = today(), h = E.hashSeed('daily' + seed);
  const o = TOUR[h % TOUR.length], hc = HANDICAPS[(h >>> 5) % HANDICAPS.length];
  const done = S.daily.date === seed && S.daily.done;
  UI.modal('<h2>Daily Challenge</h2><div class="center">' + portraitImg(o.hero, '4rem') + '</div><p class="center"><b>' + esc(o.name) + '</b> (HARD) • ' + esc(E.LANDS[o.land].name) + '</p>' +
    '<p class="center"><span class="tag" style="background:#ffcf3a">' + esc(hc.name) + '</span> ' + esc(hc.text) + '</p><p class="center" style="font-size:.78rem">Reward: 100 Sparks (once per day)' + (done ? ' — <b>already claimed today!</b>' : '') + '</p>' +
    '<div class="row"><button class="btn" data-go>Accept</button></div>');
  $('#modal [data-go]').onclick = () => {
    UI.closeModal();
    const v = deckValid(activeDeck()); if (!v.ok) { UI.toast('Fix your deck first: ' + v.errs[0]); decks(); return; }
    playVs(o, { daily: seed, diff: 'hard', lvl: 2, handicap: hc, overtime: hc.overtime, first: hc.first, setup: hc.setup });
  };
}
function pvp() {
  const options = S.decks.map((d, i) => ({ label: d.name, deck: d, i })).filter(x => deckValid(x.deck).ok);
  for (const land of E.LAND_TYPES) options.push({ label: E.STARTERS[land].name + ' (starter)', deck: E.STARTERS[land] });
  const sel = (n, def) => '<select data-p="' + n + '" style="width:100%;padding:.4rem;border-radius:.5rem;font-weight:800">' + options.map((o, i) => '<option value="' + i + '"' + (i === def ? ' selected' : '') + '>' + esc(o.label) + '</option>').join('') + '</select>';
  UI.modal('<h2>Pass &amp; Play</h2><p class="center">Two players, one device. Hands are hidden between turns.</p>' +
    '<p><b style="color:#3fc8ff">Player 1</b> <input data-n="0" value="Finn" style="width:7rem;padding:.3rem;border-radius:.4rem"><br>' + sel(0, 0) + '</p>' +
    '<p><b style="color:#ff9a2e">Player 2</b> <input data-n="1" value="Jake" style="width:7rem;padding:.3rem;border-radius:.4rem"><br>' + sel(1, Math.max(0, options.findIndex(o => o.deck === E.STARTERS.corn))) + '</p>' +
    '<div class="row"><button class="btn" data-go>Start</button></div>');
  $('#modal [data-go]').onclick = () => {
    const pick = n => options[+document.querySelector('#modal [data-p="' + n + '"]').value].deck;
    const name = n => (document.querySelector('#modal [data-n="' + n + '"]').value || ('Player ' + (n + 1))).slice(0, 14);
    const d0 = pick(0), d1 = pick(1), n0 = name(0), n1 = name(1);
    UI.closeModal();
    UI.start({ seed: 'pvp' + Date.now(), mode: 'pvp', seats: [{ kind: 'human', name: n0, hero: deckHero(d0), deck: d0 }, { kind: 'human', name: n1, hero: deckHero(d1), deck: d1 }], onEnd: res => results(res, null, { pvp: true }) });
  };
}

// ------------------------------------------------------------------ results & packs
function results(res, o, ctx) {
  const won = ctx.pvp ? null : res.winner === res.viewer;
  let sparks = 0, packN = 0, unlocked = null, first = false;
  if (!ctx.pvp && !ctx.tutorial) {
    S.stats.games++;
    const land = o ? o.land : 'blue';
    S.stats.byLand[land] = S.stats.byLand[land] || { w: 0, l: 0 };
    if (won) { S.stats.wins++; S.stats.streak++; S.stats.best = Math.max(S.stats.best, S.stats.streak); S.stats.byLand[land].w++; sparks = 30; packN = 3; }
    else { S.stats.losses++; S.stats.streak = 0; S.stats.byLand[land].l++; sparks = 10; packN = 1; }
    if (won && ctx.tour != null && !S.tour.beaten.includes(o.id)) { S.tour.beaten.push(o.id); first = true; sparks += 20; }
    if (won && o && !S.unlocked[o.land]) unlocked = o.land;
    if (won && ctx.daily && !(S.daily.date === ctx.daily && S.daily.done)) { S.daily = { date: ctx.daily, done: true }; sparks += 100; }
    S.sparks += sparks;
    if (unlocked) unlockLand(unlocked, true);
    save();
  }
  const title = ctx.pvp ? (res.winner >= 0 ? esc(res.names[res.winner]) + ' is the COOL GUY!' : 'Both dweebs! (draw)') : (won ? 'YOU’RE THE COOL GUY!' : 'DWEEB!');
  const sub = ctx.pvp ? '' : (won ? 'You win! Drink from the Cool Guy cup.' : 'You lose… drink the Dweeb cup (coffee grounds, kimchi, ham chunk juice).');
  const el = screen('result', '<div class="result"><div class="big" style="--rc:' + (won === false ? '#ff6a6a' : '#ffcf3a') + '">' + title + '</div><p>' + esc(sub) + '</p>' +
    '<div class="cups"><div class="cup ' + (won === false ? 'lose' : 'win') + '" style="--liq:' + (won === false ? '#6a7b2a' : '#5b2d0e') + '">' + (won === false ? 'DWEEB' : 'COOL GUY') + '</div></div>' +
    '<div class="rewards"><div class="rw"><span>Rounds</span><b>' + res.rounds + '</b></div><div class="rw"><span>Damage dealt</span><b>' + (res.stats ? res.stats.dealt : 0) + '</b></div><div class="rw"><span>Creatures destroyed</span><b>' + (res.stats ? res.stats.killed : 0) + '</b></div>' +
    (sparks ? '<div class="rw"><span>Sparks</span><b id="sparkCount">0</b></div>' : '') + '</div>' +
    (first ? '<p class="center" style="color:#7dff9a;font-weight:900">First win against ' + esc(o.name) + '! +20 bonus Sparks</p>' : '') +
    (unlocked ? '<p class="center" style="color:#ffcf3a;font-weight:900">New deck unlocked: ' + esc(E.STARTERS[unlocked].name) + '!</p>' : '') +
    '<div class="menu" style="margin-top:.6rem">' + (packN ? '<button class="btn" data-pack>Open card pack (' + packN + ')</button>' : '') +
    (o && !ctx.daily ? '<button class="btn blue" data-again>Rematch</button>' : '') +
    (ctx.tour != null && won && ctx.tour + 1 < TOUR.length ? '<button class="btn green" data-next>Next opponent</button>' : '') +
    '<button class="btn ghost" data-home>Home</button></div></div>');
  if (sparks) { let n = 0; const tgt = sparks; const t = setInterval(() => { n = Math.min(tgt, n + Math.ceil(tgt / 25)); const s = el.querySelector('#sparkCount'); if (s) s.textContent = '+' + n; if (n % 3 === 0) Sound.play('coin'); if (n >= tgt) clearInterval(t); }, 40); }
  const pk = el.querySelector('[data-pack]'); if (pk) pk.onclick = () => openPack(packN, () => results(res, o, Object.assign({}, ctx, { opened: true })));
  if (ctx.opened && pk) pk.remove();
  const ag = el.querySelector('[data-again]'); if (ag) ag.onclick = () => playVs(o, ctx);
  const nx = el.querySelector('[data-next]'); if (nx) nx.onclick = () => prematch(TOUR[ctx.tour + 1], ctx.tour + 1);
  el.querySelector('[data-home]').onclick = () => home();
  if (S.tour.beaten.length === TOUR.length && first && o && o.boss) setTimeout(() => UI.modal('<h2>Card Wars Champion!</h2><div class="center">' + portraitImg('jake', '4.5rem') + '</div><p class="center">“You beat me... fair and square. That’s... that’s cool, man. Want a sip of the Dweeb cup? It’s actually not that bad.”</p><div class="row"><button class="btn" data-close>Mathematical!</button></div>'), 900);
}
function rollCard() {
  const pool = E.COLLECTIBLE.filter(id => { const cd = E.CARDS[id]; return cd.land === 'rainbow' || S.unlocked[cd.land]; });
  const roll = Math.random() * 100, r = roll < 2 ? 'L' : roll < 12 ? 'E' : roll < 40 ? 'R' : 'C';
  let cand = pool.filter(id => E.CARDS[id].r === r);
  if (!cand.length) cand = pool;
  return cand[Math.floor(Math.random() * cand.length)];
}
function openPack(n, done) {
  const cards = []; for (let i = 0; i < n; i++) cards.push(rollCard());
  const el = screen('pack', topbar('Card Pack', false) + '<p class="center">Tap the pack!</p><div class="pack" id="pk"></div><div class="packrow" id="pr"></div><div class="menu hide" id="pd"><button class="btn" data-done>Continue</button></div>');
  const pk = el.querySelector('#pk'), pr = el.querySelector('#pr');
  pk.onclick = () => {
    Sound.play('pack'); pk.classList.add('burst');
    setTimeout(() => {
      pk.remove();
      let flipped = 0;
      cards.forEach((id, i) => {
        const f = document.createElement('div'); f.className = 'flip';
        const back = UI.cardEl('?', { back: true }); back.style.fontSize = '1.5rem';
        const front = UI.cardEl(id, { lvl: lvl(id) }); front.style.fontSize = '1.5rem';
        const fw = document.createElement('div'); fw.className = 'front'; fw.appendChild(front);
        const bw = document.createElement('div'); bw.appendChild(back);
        f.appendChild(bw); f.appendChild(fw);
        f.onclick = () => {
          if (f.classList.contains('open')) { UI.inspect(id, lvl(id)); return; }
          f.classList.add('open'); Sound.play(E.CARDS[id].r === 'L' || E.CARDS[id].r === 'E' ? 'win' : 'coin');
          const added = grant(id, 1);
          const tag = document.createElement('div'); tag.className = 'newtag';
          if (added) tag.textContent = own(id) === 1 ? 'NEW!' : '+1 COPY'; else { tag.textContent = 'MAXED +8✦'; tag.style.background = '#2f8ee8'; S.sparks += 8; }
          f.appendChild(tag); save();
          if (++flipped === cards.length) el.querySelector('#pd').classList.remove('hide');
        };
        pr.appendChild(f);
        setTimeout(() => f.animate([{ transform: 'translateY(2rem) scale(.6)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 350, easing: 'ease-out' }), i * 120);
      });
    }, 450);
  };
  el.querySelector('[data-done]').onclick = () => done();
}

// ------------------------------------------------------------------ decks
function decks(back) {
  const el = screen('decks', topbar('Decks', true) + '<div class="list" id="dl"></div><div class="menu"><button class="btn green" data-new>New deck</button></div>');
  wireBack(el, back || home);
  const dl = el.querySelector('#dl');
  S.decks.forEach((d, i) => {
    const v = deckValid(d);
    const row = document.createElement('div'); row.className = 'deckrow' + (i === S.active ? ' act' : '');
    row.innerHTML = portraitImg(deckHero(d), '2.6rem') + '<div class="o"><b>' + esc(d.name) + (i === S.active ? ' ★' : '') + '</b><span>' + d.cards.length + ' cards ' + (v.ok ? '' : '• <span style="color:#ff9aa6">' + esc(v.errs[0]) + '</span>') + '</span><div class="lands" style="margin-top:.25rem">' + d.lands.map(landChip).join('') + '</div></div>' +
      '<div style="display:flex;flex-direction:column;gap:.3rem"><button class="btn small" data-use>' + (i === S.active ? 'Active' : 'Use') + '</button><button class="btn blue small" data-edit>Edit</button></div>';
    row.querySelector('[data-use]').onclick = () => { if (!v.ok) { UI.toast('That deck isn’t legal yet'); return; } S.active = i; save(); Sound.play('select'); decks(back); };
    row.querySelector('[data-edit]').onclick = () => editDeck(i, back);
    dl.appendChild(row);
  });
  el.querySelector('[data-new]').onclick = () => {
    const base = activeDeck();
    S.decks.push({ name: 'New Deck ' + (S.decks.length + 1), lands: base.lands.slice(), cards: [] }); save(); editDeck(S.decks.length - 1, back);
  };
}
function editDeck(i, back) {
  const d = JSON.parse(JSON.stringify(S.decks[i]));
  let filter = 'all';
  const el = screen('deckedit', topbar('Edit Deck', true) +
    '<div class="editor"><div><input id="dn" value="' + esc(d.name) + '" maxlength="24" style="width:100%;padding:.45rem;border-radius:.6rem;border:0;font-weight:900;font-size:.95rem">' +
    '<p style="font-size:.75rem;margin:.5rem 0 .25rem;color:#b6a9d6">Landscapes (tap to change). A card of cost N needs N face-up landscapes of its type; Champions need 3.</p><div class="lands" id="ld"></div>' +
    '<div class="tabs" id="tabs" style="margin-top:.6rem"></div><div class="cgrid" id="pool"></div></div>' +
    '<div><div style="display:flex;justify-content:space-between;align-items:center"><b id="cnt"></b><span><button class="btn ghost small" data-auto>Auto-fill</button> <button class="btn ghost small" data-clear>Clear</button></span></div>' +
    '<div class="dl" id="list" style="margin-top:.4rem"></div><div id="msgs" style="margin-top:.5rem;display:flex;flex-direction:column;gap:.3rem"></div>' +
    '<div class="row" style="justify-content:flex-start"><button class="btn" data-save>Save</button>' + (S.decks.length > 1 ? '<button class="btn red small" data-del>Delete</button>' : '') + '</div></div></div>');
  wireBack(el, () => decks(back));
  const ld = el.querySelector('#ld'), pool = el.querySelector('#pool'), list = el.querySelector('#list'), msgs = el.querySelector('#msgs'), tabs = el.querySelector('#tabs');
  const avail = E.LAND_TYPES.filter(t => S.unlocked[t]);
  function renderLands() {
    ld.innerHTML = '';
    d.lands.forEach((t, k) => {
      const b = document.createElement('button'); b.className = 'landchip'; b.style.cssText = 'width:2.6rem;height:2.6rem;border:0;cursor:pointer;background:' + LANDC[t];
      b.innerHTML = landChip(t).replace('landchip', 'x'); b.title = E.LANDS[t].name;
      b.onclick = () => { const all = E.LAND_TYPES; d.lands[k] = all[(all.indexOf(t) + 1) % all.length]; Sound.play('select'); renderAll(); };
      ld.appendChild(b);
    });
  }
  function renderTabs() {
    tabs.innerHTML = '';
    ['all'].concat(E.LAND_TYPES, ['rainbow']).forEach(t => {
      const b = document.createElement('button'); b.textContent = t === 'all' ? 'All' : E.LANDS[t].name; if (t === filter) b.classList.add('on');
      if (t !== 'all' && t !== 'rainbow' && !S.unlocked[t]) b.textContent += ' 🔒';
      b.onclick = () => { filter = t; renderAll(); }; tabs.appendChild(b);
    });
  }
  function count(id) { return d.cards.filter(x => x === id).length; }
  function renderPool() {
    pool.innerHTML = '';
    const ids = E.COLLECTIBLE.filter(id => own(id) > 0 && (filter === 'all' || E.CARDS[id].land === filter)).sort((a, b) => E.CARDS[a].cost - E.CARDS[b].cost || E.CARDS[a].name.localeCompare(E.CARDS[b].name));
    if (!ids.length) pool.innerHTML = '<p style="grid-column:1/-1;font-size:.8rem;color:#b6a9d6">No cards here yet. Win games for packs and beat Table Tour players to unlock decks.</p>';
    for (const id of ids) {
      const left = own(id) - count(id);
      const c = UI.cardEl(id, { lvl: lvl(id), mini: true, dim: left <= 0 });
      const b = document.createElement('div'); b.className = 'cnt'; b.textContent = count(id) + '/' + own(id); c.appendChild(b);
      c.onclick = () => add(id);
      c.oncontextmenu = e => { e.preventDefault(); UI.inspect(id, lvl(id)); };
      let tm = null; c.onpointerdown = () => { tm = setTimeout(() => { tm = 'done'; UI.inspect(id, lvl(id)); }, 480); }; c.onpointerup = () => { if (tm !== 'done') clearTimeout(tm); };
      pool.appendChild(c);
    }
  }
  function add(id) {
    if (d.cards.length >= E.DECK_SIZE) { UI.toast('Deck is full (20)'); Sound.play('error'); return; }
    if (count(id) >= Math.min(own(id), maxCopies(id))) { UI.toast(E.CARDS[id].r === 'L' ? 'Only 1 copy of a Champion' : 'No more copies'); Sound.play('error'); return; }
    if (E.CARDS[id].r === 'L' && d.cards.some(x => E.CARDS[x].r === 'L' && x !== id)) { UI.toast('Only 1 Champion per deck'); Sound.play('error'); return; }
    d.cards.push(id); Sound.play('select'); renderAll();
  }
  function renderList() {
    list.innerHTML = '';
    const uniq = [...new Set(d.cards)].sort((a, b) => E.CARDS[a].cost - E.CARDS[b].cost || E.CARDS[a].name.localeCompare(E.CARDS[b].name));
    for (const id of uniq) {
      const cd = E.CARDS[id], row = document.createElement('div'); row.className = 'li';
      row.innerHTML = '<i style="background:' + LANDC[cd.land] + '">' + cd.cost + '</i><span>' + esc(cd.name) + '</span><em>x' + count(id) + '</em>';
      row.onclick = () => { d.cards.splice(d.cards.indexOf(id), 1); Sound.play('click'); renderAll(); };
      list.appendChild(row);
    }
    el.querySelector('#cnt').textContent = d.cards.length + ' / ' + E.DECK_SIZE + ' cards';
  }
  function renderMsgs() {
    const v = deckValid(d);
    msgs.innerHTML = v.errs.map(m => '<div class="msg bad">' + esc(m) + '</div>').join('') + v.warn.map(m => '<div class="msg">⚠ ' + esc(m) + '</div>').join('') + (v.ok ? '<div class="msg ok">Ready to play!</div>' : '');
  }
  function renderAll() { renderLands(); renderTabs(); renderPool(); renderList(); renderMsgs(); }
  renderAll();
  el.querySelector('[data-auto]').onclick = () => {
    const types = new Set(d.lands);
    const ids = E.COLLECTIBLE.filter(id => own(id) > 0 && (E.CARDS[id].land === 'rainbow' || types.has(E.CARDS[id].land)) && E.meetsReq({ players: [{ lanes: d.lands.map(t => ({ land: { type: t, down: false } })) }] }, 0, E.CARDS[id]));
    ids.sort((a, b) => (E.CARDS[b].land !== 'rainbow') - (E.CARDS[a].land !== 'rainbow') || E.CARDS[a].cost - E.CARDS[b].cost);
    let guard = 0;
    while (d.cards.length < E.DECK_SIZE && guard++ < 200) { let added = false; for (const id of ids) { if (d.cards.length >= E.DECK_SIZE) break; if (count(id) < Math.min(own(id), maxCopies(id)) && !(E.CARDS[id].r === 'L' && d.cards.some(x => E.CARDS[x].r === 'L'))) { d.cards.push(id); added = true; } } if (!added) break; }
    Sound.play('select'); renderAll();
  };
  el.querySelector('[data-clear]').onclick = () => { d.cards = []; renderAll(); };
  el.querySelector('[data-save]').onclick = () => { d.name = (el.querySelector('#dn').value || 'Deck').slice(0, 24); S.decks[i] = d; save(); Sound.play('coin'); UI.toast('Deck saved'); decks(back); };
  const del = el.querySelector('[data-del]');
  if (del) del.onclick = () => { UI.modal('<h2>Delete deck?</h2><div class="row"><button class="btn red" data-y>Delete</button><button class="btn ghost" data-close>Cancel</button></div>'); $('#modal [data-y]').onclick = () => { UI.closeModal(); S.decks.splice(i, 1); if (S.active >= S.decks.length) S.active = 0; save(); decks(back); }; };
}

// ------------------------------------------------------------------ collection
const LVL_COST = [0, 30, 80, 160];
function collection() {
  let filter = 'all';
  const el = screen('collection', topbar('Collection', true) + '<div class="tabs" id="tabs"></div><p style="font-size:.75rem;color:#b6a9d6;margin:.2rem 0 .6rem">Tap a card to inspect it and level it up with Sparks (+stats per level, max level 4).</p><div class="cgrid" id="grid"></div>');
  wireBack(el);
  function render() {
    const tabs = el.querySelector('#tabs'); tabs.innerHTML = '';
    ['all'].concat(E.LAND_TYPES, ['rainbow']).forEach(t => { const b = document.createElement('button'); b.textContent = t === 'all' ? 'All' : E.LANDS[t].name; if (t === filter) b.classList.add('on'); b.onclick = () => { filter = t; render(); }; tabs.appendChild(b); });
    const grid = el.querySelector('#grid'); grid.innerHTML = '';
    const ids = E.COLLECTIBLE.filter(id => filter === 'all' || E.CARDS[id].land === filter);
    let owned = 0;
    for (const id of ids) {
      const n = own(id); if (n) owned++;
      const c = UI.cardEl(id, { lvl: lvl(id), mini: true, locked: !n, count: n || null });
      c.onclick = () => openCard(id);
      grid.appendChild(c);
    }
    el.querySelector('h1').textContent = 'Collection ' + owned + '/' + ids.length;
  }
  function openCard(id) {
    const n = own(id), L = lvl(id), cost = LVL_COST[L];
    const extra = n ? (L < 4 ? '<div class="row"><button class="btn" data-up ' + (S.sparks < cost ? 'disabled' : '') + '>Level up → ' + (L + 1) + ' (' + cost + '✦)</button></div><p class="center" style="font-size:.72rem;color:#b6a9d6">You have ' + S.sparks + ' Sparks. Level 2: +1 DEF, Level 3: +1 ATK (spells +1 power), Level 4: +1 DEF.</p>' : '<p class="center">Max level!</p>')
      : '<p class="center" style="color:#b6a9d6">Not owned yet. ' + (E.CARDS[id].land === 'rainbow' || S.unlocked[E.CARDS[id].land] ? 'Find it in card packs.' : 'Beat a ' + E.LANDS[E.CARDS[id].land].name + ' player on the Table Tour to unlock.') + '</p>';
    UI.inspect(id, L, extra);
    const up = $('#modal [data-up]');
    if (up) up.onclick = () => { if (S.sparks < cost) return; S.sparks -= cost; S.cards[id].lvl = L + 1; save(); Sound.play('win'); UI.closeModal(); UI.toast(E.CARDS[id].name + ' is now level ' + (L + 1) + '!'); render(); };
  }
  render();
}

// ------------------------------------------------------------------ settings
function applySettings() {
  const st = S.settings;
  Sound.setVolume(st.sfx, st.music);
  UI.settings.haptics = st.haptics; UI.settings.reduceMotion = st.reduceMotion; UI.settings.timer = st.timer; UI.settings.confirmTouch = st.confirm;
  UI.settings.speed = st.speed; UI.D.speed = st.speed; const sb = document.getElementById('speedBtn'); if (sb) sb.textContent = st.speed + 'x';
  R.reduceMotion = st.reduceMotion; R.cbIcons = st.cbIcons; R.quality = st.quality; R.invalidate();
  document.body.classList.toggle('rm', st.reduceMotion);
  document.documentElement.style.setProperty('--ts', st.text);
  UI.layout();
}
function settingsScreen(back, inMatch) {
  const st = S.settings;
  const tg = (k, label) => '<div class="set">' + label + '<button class="toggle' + (st[k] ? ' on' : '') + '" data-t="' + k + '"></button></div>';
  const seg = (k, label, opts) => '<div class="set">' + label + '<div class="seg">' + opts.map(([v, l]) => '<button data-s="' + k + '" data-v="' + v + '"' + (String(st[k]) === String(v) ? ' class="on"' : '') + '>' + l + '</button>').join('') + '</div></div>';
  const html = '<div class="set">Sound effects<input type="range" min="0" max="1" step="0.05" value="' + st.sfx + '" data-r="sfx"></div>' +
    '<div class="set">Music<input type="range" min="0" max="1" step="0.05" value="' + st.music + '" data-r="music"></div>' +
    tg('haptics', 'Haptics (vibration)') + tg('reduceMotion', 'Reduce motion') + tg('cbIcons', 'Colour-blind icons on landscapes') +
    seg('text', 'Text size', [[0.9, 'S'], [1, 'M'], [1.12, 'L']]) + seg('speed', 'Game speed', [[1, '1x'], [2, '2x']]) +
    tg('timer', '45-second turn timer') + tg('confirm', 'Confirm targeted actions on touch') + seg('quality', 'Graphics', [[1, 'Crisp'], [0.75, 'Battery saver']]) +
    (inMatch ? '' : '<div class="set">Replay the tutorial<button class="btn small" data-tut>Start</button></div><div class="set">Reset all progress<button class="btn red small" data-reset>Reset</button></div>');
  let root;
  if (inMatch) { root = UI.modal('<h2>Settings</h2>' + html + '<div class="row"><button class="btn" data-close>Done</button></div>'); }
  else { root = screen('settings', topbar('Settings', true) + '<div style="max-width:30rem;margin:0 auto">' + html + '</div>'); wireBack(root, back || home); }
  root.querySelectorAll('[data-r]').forEach(r => r.oninput = () => { st[r.dataset.r] = +r.value; save(); applySettings(); });
  root.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { st[b.dataset.t] = !st[b.dataset.t]; b.classList.toggle('on', st[b.dataset.t]); save(); applySettings(); Sound.play('click'); });
  root.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { st[b.dataset.s] = +b.dataset.v; save(); applySettings(); Sound.play('click'); root.querySelectorAll('[data-s="' + b.dataset.s + '"]').forEach(x => x.classList.toggle('on', x === b)); });
  const t = root.querySelector('[data-tut]'); if (t) t.onclick = () => Tutorial.start();
  const rs = root.querySelector('[data-reset]'); if (rs) rs.onclick = () => {
    UI.modal('<h2>Reset everything?</h2><p class="center">Your collection, decks, Sparks and Table Tour progress will be erased.</p><div class="row"><button class="btn red" data-y>Reset</button><button class="btn ghost" data-close>Cancel</button></div>');
    $('#modal [data-y]').onclick = () => { UI.closeModal(); const keep = S.settings; S = defaults(); S.settings = keep; save(); home(); };
  };
}
UI.onSettings = () => { S.settings.speed = UI.settings.speed; save(); };

// ------------------------------------------------------------------ rules / pause menu
const RULES = '<div style="font-size:.82rem;line-height:1.45">' +
  '<p><b>Goal:</b> knock the other hero from <b>25 HP to 0</b>. Winner is the Cool Guy, loser is the Dweeb.</p>' +
  '<p><b>Board:</b> 4 lanes. You own a <b>Landscape</b> in each lane. Each lane holds one Creature (front) and one Building (back).</p>' +
  '<p><b>Your turn:</b> draw a card, then spend <b>2 Actions</b>: play cards (cost 0-2), <b>draw</b> an extra card (1), or <b>move</b> a creature one lane (1, free for Blue Plains creatures on Blue Plains).</p>' +
  '<p><b>Landscapes:</b> a card of cost N needs N face-up landscapes of its type. Champions need 3. Rainbow cards need none. The Pig can eat landscapes!</p>' +
  '<p><b>FLOOP:</b> many cards have a FLOOP ability. Flooping turns the card sideways: the creature skips its attack this turn but still defends.</p>' +
  '<p><b>FIGHT!</b> When you end your turn, every ready creature attacks the lane across. Both creatures deal damage at once. An empty lane hits the enemy building first (extra spills over) or the hero.</p>' +
  '<p><b>Home Advantage:</b> creatures standing on their own landscape type get a bonus (see each landscape).</p>' +
  '<p>The first player can’t floop or fight on the very first turn. From round 15 the board overheats and both heroes take growing damage.</p></div>';
function learn() {
  UI.modal('<h2>How to Play</h2>' + RULES + '<div class="row"><button class="btn" data-tut>Play the tutorial</button><button class="btn ghost" data-close>Got it</button></div>', { wide: true });
  $('#modal [data-tut]').onclick = () => { UI.closeModal(); Tutorial.start(); };
}
UI.onMenu = () => {
  const inTut = UI.M.mode === 'tutorial';
  UI.modal('<h2>Paused</h2><div class="menu"><button class="btn" data-close>Resume</button><button class="btn blue" data-rules>Rules</button><button class="btn blue" data-set>Settings</button>' +
    (UI.M.ended ? '' : '<button class="btn red" data-concede>' + (inTut ? 'Skip tutorial' : 'Concede') + '</button>') + '<button class="btn ghost" data-quit>Quit to home</button></div>');
  $('#modal [data-rules]').onclick = () => UI.modal('<h2>Rules</h2>' + RULES + '<div class="row"><button class="btn" data-close>Back</button></div>', { wide: true });
  $('#modal [data-set]').onclick = () => settingsScreen(null, true);
  const c = $('#modal [data-concede]'); if (c) c.onclick = () => { UI.closeModal(); if (inTut) { Tutorial.skip(); return; } UI.concede(); };
  $('#modal [data-quit]').onclick = () => { UI.closeModal(); if (inTut) { Tutorial.skip(); return; } if (!UI.M.ended && UI.M.mode === 'ai') { S.stats.losses++; S.stats.games++; S.stats.streak = 0; save(); } UI.quit(); home(); };
};

return { load, save, home, applySettings, get S() { return S; }, TOUR, HEROES, unlockLand, results, mySeat, deckHero, levelsFor, activeDeck, learn };
})();
/* END META */
