// Character model close-ups for visual review. usage: node tests/models.js <outdir>
const { launch, step, shot } = require('./harness.js'); const fs = require('fs');
const OUT = process.argv[2] || 'shots-models'; fs.mkdirSync(OUT, { recursive: true });
(async () => { const g = await launch({ viewport: { width: 960, height: 540 } }); const { page, errors } = g; await step(page, 0.2);
  await page.evaluate(() => { document.getElementById('title').classList.add('hidden'); document.getElementById('hud').classList.add('hidden'); GAME.G.mode = 'photo'; GAME.G.time = 15.5; });
  const pose = async (spec) => page.evaluate((spec) => { const { G } = GAME; (window.__ms || []).forEach(m => G.scene.remove(m.root)); window.__ms = [];
    spec.models.forEach((m, i) => { const look = Object.assign(defaultLook(m.n), m.look || {}); const H = buildHumanoid(look, m.opts || {}); const x = (i - (spec.models.length - 1) / 2) * (spec.gap || 0.9); const y = GAME.groundH(x, 12); H.root.position.set(x, y, 12); H.root.rotation.y = m.yaw || 0; G.scene.add(H.root); window.__ms.push(H);
      if (m.action) playAction(H, m.action); for (let k = 0; k < (m.frames || 40); k++) animateHumanoid(H, 1 / 60, Object.assign({ grounded: true, element: NATIONS[m.n].element }, m.st || {})); });
    const y = GAME.groundH(0, 12); const c = spec.cam; G.camObj.position.set(c[0], y + c[1], 12 + c[2]); GAME.aimCam(G.camObj, c[3] || 0, y + c[4], 12 + (c[5] || 0)); }, spec);
  const N = ['water', 'earth', 'fire', 'air'];
  await pose({ models: N.map(n => ({ n })), cam: [0, 1.05, 3.0, 0, 0.95], gap: 0.8 }); await step(page, 0.05); await shot(page, `${OUT}/m_lineup_A.png`);
  await pose({ models: N.map(n => ({ n, look: { body: 'B', hair: { water: 'braids', earth: 'long', fire: 'bun', air: 'long' }[n] } })), cam: [0, 1.05, 3.0, 0, 0.95], gap: 0.8 }); await step(page, 0.05); await shot(page, `${OUT}/m_lineup_B.png`);
  await pose({ models: N.map(n => ({ n, yaw: Math.PI })), cam: [0, 1.05, 3.0, 0, 0.95], gap: 0.8 }); await step(page, 0.05); await shot(page, `${OUT}/m_lineup_back.png`);
  await pose({ models: N.map(n => ({ n, yaw: -Math.PI / 2 })), cam: [0, 1.05, 3.0, 0, 0.95], gap: 0.8 }); await step(page, 0.05); await shot(page, `${OUT}/m_lineup_side.png`);
  for (const [n, hair, body] of [['water', 'wolftail', 'A'], ['water', 'loopies', 'B'], ['earth', 'bun', 'B'], ['fire', 'topknot', 'A'], ['air', 'shaved', 'A'], ['earth', 'long', 'A']]) {
    await pose({ models: [{ n, look: { hair, body, beard: n === 'earth' && hair === 'long', arrows: n === 'air' } }], cam: [0.12, 1.62, 0.55, 0, 1.6] }); await step(page, 0.05); await shot(page, `${OUT}/m_face_${n}_${hair}.png`); }
  await pose({ models: [{ n: 'fire', action: 'punchR', frames: 14, st: { combat: true } }], cam: [0.6, 1.35, 0.9, 0, 1.25] }); await step(page, 0.05); await shot(page, `${OUT}/m_punch.png`);
  await pose({ models: [{ n: 'earth', st: { combat: true }, frames: 90 }, { n: 'air', st: { combat: true }, frames: 90 }, { n: 'water', st: { meditate: true }, frames: 90 }, { n: 'fire', st: { speed: 4.6 }, frames: 33 }], cam: [0, 1.0, 4.6, 0, 0.9], gap: 1.1 }); await step(page, 0.05); await shot(page, `${OUT}/m_poses.png`);
  await pose({ models: [{ n: 'earth', look: { hair: 'long', beard: true, skin: '#d9ad84', hairColor: '#d8d4cc' }, opts: { palette: ['#6b5a3e', '#d8c79a', '#3b3222'] } }, { n: 'earth', opts: { palette: ['#5a3a2a', '#3a2a1a', '#8a1a12'] }, look: { hair: 'topknot', beard: true, build: 1.25, height: 1.08 } }], cam: [0, 1.2, 3.2, 0, 1.0], gap: 1.0 }); await step(page, 0.05); await shot(page, `${OUT}/m_npcs.png`);
  console.log('errors', errors.slice(0, 5), await page.evaluate(() => GAME.G.lastError || 'ok')); await g.close(); })().catch(e => { console.error('FAIL', e); process.exit(1); });
