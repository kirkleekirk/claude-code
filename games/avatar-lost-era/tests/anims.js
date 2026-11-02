// Animation review sheets: every action at four moments, gaits and poses, both body frames side by side.
// usage: node tests/anims.js <outdir> [filter]
const { launch, step, shot } = require('./harness.js'); const fs = require('fs');
const OUT = process.argv[2] || 'shots-anims'; const FILTER = process.argv[3] || ''; fs.mkdirSync(OUT, { recursive: true });
(async () => { const g = await launch({ viewport: { width: 1600, height: 600 } }); const { page, errors } = g; await step(page, 0.2);
  await page.evaluate(() => { document.getElementById('title').classList.add('hidden'); document.getElementById('hud').classList.add('hidden'); GAME.G.mode = 'photo'; GAME.G.time = 13; });
  const sheet = async (name, specs, cam) => { if (FILTER && !name.includes(FILTER)) return;
    const info = await page.evaluate(({ specs, cam }) => { const { G } = GAME; (window.__ms || []).forEach((m) => G.scene.remove(m.root)); window.__ms = []; const info = [];
      specs.forEach((m, i) => { const look = Object.assign(defaultLook(m.n || 'earth'), { body: m.body }, m.look || {}); const H = buildHumanoid(look); const x = (i - (specs.length - 1) / 2) * (m.gap || 0.72); const y = GAME.groundH(x, 12);
        H.root.position.set(x, y, 12); H.root.rotation.y = m.yaw ?? 0.6; G.scene.add(H.root); window.__ms.push(H); H.phase = m.phase || 0;
        const st = Object.assign({ grounded: true, element: NATIONS[look.nation].element }, m.st || {});
        if (m.action) { playAction(H, m.action); const dur = ACTIONS[m.action].dur; let t = 0; while (t < m.u * dur) { animateHumanoid(H, 1 / 120, st); t += 1 / 120; } }
        else { const n = m.frames || 90; for (let k = 0; k < n; k++) { if (k === n - 30 && m.phase !== undefined) H.phase = m.phase; animateHumanoid(H, 1 / 60, st); } }
        H.root.updateMatrixWorld(true); const f = (s) => { const v = V3(); H.J['foot' + s].getWorldPosition(v); return +(v.y - y).toFixed(3); }; info.push(`${m.label || ''} feet ${f('L')} ${f('R')} hips ${H.J.hips.position.y.toFixed(3)}`); });
      const c = cam || [0, 0.95, 2.4, 0, 0.82]; const y = GAME.groundH(0, 12); G.camObj.position.set(c[0], y + c[1], 12 + c[2]); GAME.aimCam(G.camObj, c[3], y + c[4], 12); return info; }, { specs, cam });
    await step(page, 0.05); await shot(page, `${OUT}/${name}.png`); console.log(name, info.join(' | ')); };
  const acts = await page.evaluate(() => Object.keys(ACTIONS));
  for (const a of acts) await sheet(`act_${a}`, ['A', 'B'].flatMap((body) => [0.12, 0.32, 0.55, 0.8].map((u) => ({ body, action: a, u, n: 'earth', label: body + u }))));
  for (const body of ['A', 'B']) {
    const gait = [{ label: 'idle' }, ...[[1.4, 0], [1.4, 1.57], [4.5, 0], [4.5, 1.57], [7.5, 0], [7.5, 1.57], [9, 0.8]].map(([v, p]) => ({ label: `v${v}p${p}`, st: { speed: v }, phase: p }))];
    await sheet(`gait_side_${body}`, gait.map((m) => Object.assign({ body, yaw: Math.PI / 2, n: 'fire' }, m)));
    await sheet(`gait_front_${body}`, gait.map((m) => Object.assign({ body, yaw: 0.35, n: 'water' }, m)));
    await sheet(`poses_${body}`, [['earth', { combat: true, element: 'earth' }], ['fire', { combat: true, element: 'fire' }], ['water', { combat: true, element: 'water' }], ['air', { combat: true, element: 'air' }],
      ['air', { meditate: true }], ['water', { swim: true, speed: 2.5, grounded: false }], ['earth', { grounded: false, vy: 3 }], ['fire', { sleep: true }], ['earth', { dead: true }]].map(([n, st]) => ({ body, n, st, label: Object.keys(st).join('+'), frames: 150 })), [0, 0.95, 2.9, 0, 0.72]);
    await sheet(`poses_side_${body}`, [['earth', { combat: true, element: 'earth' }], ['fire', { combat: true, element: 'fire' }], ['water', { combat: true, element: 'water' }], ['air', { combat: true, element: 'air' }],
      ['air', { meditate: true }], ['fire', { sleep: true }], ['earth', { dead: true }]].map(([n, st]) => ({ body, n, st, yaw: Math.PI / 2, label: Object.keys(st).join('+'), frames: 150 })), [0, 0.95, 2.9, 0, 0.72]);
  }
  console.log('errors', errors.slice(0, 5), await page.evaluate(() => GAME.G.lastError || 'ok')); await g.close(); })().catch((e) => { console.error('FAIL', e); process.exit(1); });
