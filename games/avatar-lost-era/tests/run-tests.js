// Automated test runner: boots the real game in headless Chromium and runs tests/suite.js inside it.
// usage: node tests/run-tests.js [group,group]   (groups: world creation rules techniques trials survival creatures people quests ui save animation render perf mobile)
const { launch } = require('./harness.js'); const path = require('path'); const fs = require('fs');
const GROUPS = ['world', 'creation', 'rules', 'techniques', 'trials', 'survival', 'creatures', 'people', 'quests', 'ui', 'save', 'animation', 'render', 'perf'];
(async () => {
  const only = (process.argv[2] || '').split(',').filter(Boolean); const t0 = Date.now(); const all = [];
  const g = await launch({ viewport: { width: 1280, height: 720 } }); const { page, errors } = g;
  await page.addScriptTag({ path: path.join(__dirname, 'suite.js') });
  for (const grp of GROUPS) { if (only.length && !only.includes(grp)) continue; const s = Date.now();
    const res = await page.evaluate(async (grp) => { SUITE.results.length = 0; await SUITE.run([grp]); return SUITE.results.slice(); }, grp);
    all.push(...res); const f = res.filter(r => !r.ok); console.log(`${grp.padEnd(11)} ${String(res.length - f.length).padStart(4)}/${String(res.length).padEnd(4)} passed  (${((Date.now() - s) / 1000).toFixed(1)}s)`); for (const r of f) console.log(`   ✗ ${r.name} — ${r.detail}`); }
  const tickMs = await page.evaluate(() => window.__tickMs);
  if (errors.length) { all.push({ group: 'Console', name: 'no page errors or console errors', ok: false, detail: errors.slice(0, 5).join(' || ') }); } else all.push({ group: 'Console', name: 'no page errors or console errors', ok: true });
  await g.close();
  if (!only.length || only.includes('mobile')) { // phone-landscape layout
    const m = await launch({ viewport: { width: 900, height: 415 }, touch: true }); const mp = m.page; await mp.addScriptTag({ path: path.join(__dirname, 'suite.js') });
    const res = await mp.evaluate(async () => { const R = []; const ok = (name, c, d) => R.push({ group: 'Mobile', name, ok: !!c, detail: c ? '' : d });
      ok('touch controls enabled', document.body.classList.contains('touch'));
      GAME.Boot.newGame({ name: 'Pema', nation: 'air', home: 'southern', bg: 'monk', look: GAME.Creator.look || { nation: 'air', body: 'B', height: 1, build: 1, skin: '#e8c39a', hair: 'shaved', hairColor: '#111', eyes: '#5a8fa8', outfit: 0 } }); document.getElementById('storySkip').click(); GAME.Main.tick(0.016); GAME.UI.lastHud = -1; GAME.UI.hud(0.016);
      ok('touch overlay visible in play', !document.getElementById('touch').classList.contains('hidden'));
      const ids = ['joy', 'tA', 'tB', 'tC', 'tD', 'tJ', 'tF', 'tE', 'tRun', 'tMed', 'tEat', 'tMenu', 'tBag']; const rects = ids.map(id => { const b = document.getElementById(id).getBoundingClientRect(); return { id, l: b.left, t: b.top, r: b.right, b: b.bottom }; });
      for (const q of rects) ok(`touch control on screen: ${q.id}`, q.l >= 0 && q.t >= 0 && q.r <= innerWidth && q.b <= innerHeight, JSON.stringify(q));
      let ov = []; for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) { const a = rects[i], b = rects[j]; if (a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b) ov.push(a.id + '/' + b.id); } ok('touch controls do not overlap', !ov.length, ov.join(','));
      const fire = (id) => { const el = document.getElementById(id); el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: [], changedTouches: [] })); el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [], changedTouches: [] })); };
      const P = GAME.G.player; const vy0 = P.vy; fire('tJ'); ok('JUMP button jumps', P.vy > vy0, P.vy);
      for (let i = 0; i < 60; i++) GAME.Main.tick(1 / 30); const chi = P.chi; GAME.G.aimOverride = { point: P.pos.clone().add(new AFRAME.THREE.Vector3(0, 1, -10)) }; fire('tA'); ok('technique button casts', P.chi < chi, `${chi} -> ${P.chi}`);
      fire('tMed'); ok('CALM button meditates', P.meditating); P.meditating = false;
      fire('tBag'); ok('BAG button opens the scroll', GAME.UI.panelOpen); GAME.UI.closePanel();
      fire('tMenu'); ok('MENU button pauses', GAME.G.mode === 'paused'); GAME.UI.pause(false);
      const t = document.getElementById('tA'); ok('technique buttons show glyphs', t.textContent.length > 0 && t.textContent !== '·');
      const lab = document.getElementById('prompt'); ok('HUD fits the phone screen', document.getElementById('minimap').getBoundingClientRect().right <= innerWidth);
      GAME.UI.openPanel('skills'); const tv = document.getElementById('treeview').getBoundingClientRect(); ok('skill tree visible on phone', tv.height > 200, tv.height); GAME.UI.closePanel();
      return R; });
    all.push(...res); const f = res.filter(r => !r.ok); console.log(`mobile      ${String(res.length - f.length).padStart(4)}/${String(res.length).padEnd(4)} passed`); for (const r of f) console.log(`   ✗ ${r.name} — ${r.detail}`);
    if (m.errors.length) { all.push({ group: 'Console', name: 'no errors on mobile', ok: false, detail: m.errors.slice(0, 3).join(' || ') }); console.log(m.errors.slice(0, 3)); } else all.push({ group: 'Console', name: 'no errors on mobile', ok: true });
    await m.close();
  }
  const pass = all.filter(r => r.ok).length; const fail = all.length - pass;
  const groups = {}; for (const r of all) { groups[r.group] = groups[r.group] || { pass: 0, fail: 0 }; groups[r.group][r.ok ? 'pass' : 'fail']++; }
  const md = [`# Automated test report`, '', `Ran ${all.length} tests in ${((Date.now() - t0) / 1000).toFixed(0)}s — **${pass} passed, ${fail} failed**.`, tickMs ? `Average simulation tick in a busy scene: ${tickMs.toFixed(2)} ms.` : '', '', '| Area | Passed | Failed |', '|---|---|---|', ...Object.entries(groups).map(([k, v]) => `| ${k} | ${v.pass} | ${v.fail} |`), '', fail ? '## Failures' : '', ...all.filter(r => !r.ok).map(r => `- **${r.group}** · ${r.name}: ${r.detail}`), '', '## All tests', '', ...all.map(r => `- ${r.ok ? '✅' : '❌'} [${r.group}] ${r.name}`)].join('\n');
  if (!only.length) fs.writeFileSync(path.join(__dirname, 'REPORT.md'), md + '\n');
  console.log(`\nTOTAL ${pass}/${all.length} passed (${fail} failed) in ${((Date.now() - t0) / 1000).toFixed(0)}s`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('RUNNER FAIL', e); process.exit(2); });
