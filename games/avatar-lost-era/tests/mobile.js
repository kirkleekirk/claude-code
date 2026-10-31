// Mobile (touch, landscape phone) layout screenshots.
const { launch, step, shot, startGame } = require('./harness.js');
const fs = require('fs'); const OUT = process.argv[2] || 'shots-mobile'; fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const g = await launch({ viewport: { width: 900, height: 415 }, touch: true, query: '&touch=1' }); const { page, errors } = g;
  console.log('touch mode:', await page.evaluate(() => document.body.classList.contains('touch') || 'ontouchstart' in window));
  await shot(page, OUT + '/m0_title.png');
  await page.evaluate(() => { document.getElementById('title').classList.add('hidden'); GAME.Creator.open(); }); await step(page, 0.3); await shot(page, OUT + '/m1_creator.png');
  await page.evaluate(() => { document.getElementById('creator').classList.add('hidden'); GAME.G.scene.remove(GAME.Creator.model.root); GAME.Creator.model = null; });
  await startGame(page, { name: 'Pema', nation: 'air', home: 'southern', bg: 'monk', look: { nation: 'air', body: 'B', height: 1, build: 1, skin: '#e8c39a', hair: 'shaved', hairColor: '#111', eyes: '#5a8fa8', outfit: 0 } });
  await step(page, 0.6); await shot(page, OUT + '/m2_hud.png');
  await page.evaluate(() => GAME.UI.openPanel('skills')); await shot(page, OUT + '/m3_skills.png');
  await page.evaluate(() => { GAME.UI.closePanel(); GAME.UI.openPanel('map'); }); await shot(page, OUT + '/m4_map.png');
  await page.evaluate(() => { GAME.UI.closePanel(); const b = GAME.G.ents.find(e => e.def && e.def.id === 'mei'); GAME.Dialog.open(b); }); await shot(page, OUT + '/m5_dialog.png');
  // touch buttons should all be inside the viewport and not overlap each other
  const r = await page.evaluate(() => { GAME.Dialog.close(); const ids = ['joy', 'tA', 'tB', 'tC', 'tD', 'tJ', 'tF', 'tE', 'tRun', 'tMed', 'tEat', 'tMenu', 'tBag']; const rects = ids.map(id => { const b = document.getElementById(id).getBoundingClientRect(); return { id, l: b.left, t: b.top, r: b.right, b: b.bottom }; });
    const out = rects.filter(q => q.l < 0 || q.t < 0 || q.r > innerWidth || q.b > innerHeight).map(q => q.id); const ov = [];
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) { const a = rects[i], b = rects[j]; if (a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b) ov.push(a.id + '/' + b.id); } return { out, ov }; });
  console.log('offscreen:', r.out, 'overlaps:', r.ov); console.log('errors', errors.slice(0, 5)); await g.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
