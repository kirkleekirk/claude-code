/* MAIN */
// Boot: load save, wire resize/orientation/visibility, run the frame loop.
(function () {
'use strict';
const cv = document.getElementById('cv');
let last = 0, running = true, raf = 0;
function frame(ts) {
  raf = 0;
  if (!running) return;
  const t = ts / 1000, dt = Math.min(0.05, last ? t - last : 0.016);
  last = t;
  try { UI.tick(dt); Render.frame(t, dt); } catch (e) { console.error(e); }
  raf = requestAnimationFrame(frame);
}
function boot() {
  Meta.load();
  Render.init(cv);
  UI.init();
  Meta.applySettings();
  UI.layout();
  Meta.home();
  raf = requestAnimationFrame(frame);
  testHooks();
}
// Test hooks (used by the automated smoke test and screenshots): #match, #autoplay[=N], #tutorial
function testHooks() {
  const h = location.hash || '';
  const E = Engine, S = Meta.S;
  const ensure = () => { if (!S.started) { S.started = true; S.starter = 'blue'; Meta.unlockLand('blue', true); Meta.unlockLand('corn', true); Meta.save(); } };
  window.CW = {
    stats: { games: 0, errors: 0, rounds: [] },
    autoplay(n, speed) {
      ensure();
      const keys = E.LAND_TYPES; let i = 0;
      UI.settings.speed = speed || 6; UI.D.speed = speed || 6;
      const one = () => {
        if (i >= n) { window.CW.done = true; return; }
        const a = keys[i % keys.length], b = keys[(i * 5 + 2) % keys.length]; i++;
        const seat = (land, k) => ({ kind: 'ai', name: E.STARTERS[land].name.split('\u2019')[0], hero: Meta.HEROES[land], deck: E.STARTERS[land], difficulty: k ? 'normal' : 'hard', personality: 'balanced', lines: ['Mathematical!'] });
        UI.start({ seed: 'auto' + i, mode: 'ai', seats: [seat(a, 0), seat(b, 1)], onEnd: res => { window.CW.stats.games++; window.CW.stats.rounds.push(res.rounds); setTimeout(one, 300); } });
      };
      one();
    }
  };
  window.CW.custom = function (o) {
    ensure();
    const K = E.kit;
    o = Object.assign({ hand: [], mine: [], theirs: [], bmine: [], btheirs: [], lands0: ['blue', 'blue', 'blue', 'blue'], lands1: ['corn', 'corn', 'corn', 'corn'], ohand: ['c_bloodstorm', 'r_pancakes', 'c_husker'] }, o || {});
    UI.start({ seed: 'custom', mode: 'ai', first: 0, noMulligan: true,
      seats: [Meta.mySeat({ lands: o.lands0, cards: E.STARTERS.blue.cards }), { kind: 'ai', name: 'Jake', hero: 'jake', deck: E.STARTERS.corn, difficulty: 'normal', personality: 'aggro', lines: ['Hmph.'] }],
      setup: st => {
        K.clear(st); K.lands(st, 0, o.lands0); K.lands(st, 1, o.lands1);
        K.hand(st, 0, o.hand); K.hand(st, 1, o.ohand);
        o.mine.forEach(([l, id, x]) => K.put(st, 0, l, id, x)); o.theirs.forEach(([l, id, x]) => K.put(st, 1, l, id, x));
        o.bmine.forEach(([l, id, x]) => K.build(st, 0, l, id, x)); o.btheirs.forEach(([l, id, x]) => K.build(st, 1, l, id, x));
        st.turn = 3; st.round = 2; st.players[0].actions = 2;
      }, onEnd: () => Meta.home() });
  };
  if (h.indexOf('#autoplay') === 0) { const n = +(h.split('=')[1] || 3); window.CW.autoplay(n, 6); }
  else if (h === '#match') { ensure(); const o = Meta.TOUR[3]; UI.start({ seed: 'shot', mode: 'ai', first: 0, seats: [Meta.mySeat(Meta.activeDeck()), { kind: 'ai', name: o.name, hero: o.hero, deck: o.deck, difficulty: 'normal', personality: o.pers, lines: o.lines }], onEnd: () => Meta.home() }); }
  else if (h === '#tutorial') { ensure(); Tutorial.start(); }
}
let rt = 0;
const relayout = () => { clearTimeout(rt); rt = setTimeout(() => { UI.layout(); }, 60); };
window.addEventListener('resize', relayout);
window.addEventListener('orientationchange', () => setTimeout(() => UI.layout(), 250));
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; Sound.suspend(true); }
  else { running = true; last = 0; Sound.suspend(false); if (!raf) raf = requestAnimationFrame(frame); }
});
window.addEventListener('pointerdown', () => Sound.unlock(), { once: true });
document.addEventListener('contextmenu', e => { if (e.target.closest && e.target.closest('#hand, #cv, .cgrid')) e.preventDefault(); });
window.addEventListener('error', e => { try { UI.toast('Oops: ' + (e.message || 'error')); } catch (_) { /* ignore */ } });
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
/* END MAIN */
