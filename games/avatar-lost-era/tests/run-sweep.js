// Large-scale sweep runner (thousands of checks). usage: node tests/run-sweep.js [groups] [screenshotDir]
// groups: vegetation colliders roads roam interact anatomy creatures techniques dialogue saveload render layout
const { launch } = require('./harness.js'); const path = require('path'); const fs = require('fs');
const IN_PAGE = ['vegetation', 'colliders', 'roads', 'roam', 'interact', 'anatomy', 'creatures', 'techniques', 'dialogue', 'saveload'];
(async () => {
  const only = (process.argv[2] || '').split(',').filter(Boolean); const OUT = process.argv[3]; if (OUT) fs.mkdirSync(OUT, { recursive: true });
  const want = (g) => !only.length || only.includes(g); const t0 = Date.now(); const all = [];
  const report = (grp, res, secs) => { all.push(...res); const f = res.filter(r => !r.ok); console.log(`${grp.padEnd(11)} ${String(res.length - f.length).padStart(5)}/${String(res.length).padEnd(5)} passed  (${secs.toFixed(1)}s)`); for (const r of f.slice(0, 25)) console.log(`   ✗ ${r.name} — ${r.detail}`); if (f.length > 25) console.log(`   … ${f.length - 25} more`); };
  let g = await launch({ viewport: { width: 1280, height: 720 } }); let { page, errors } = g;
  await page.addScriptTag({ path: path.join(__dirname, 'suite.js') }); await page.addScriptTag({ path: path.join(__dirname, 'sweep.js') });
  for (const grp of IN_PAGE) { if (!want(grp)) continue; const s = Date.now(); const res = await page.evaluate(async (grp) => { SWEEP.results.length = 0; await SWEEP.run([grp]); return SWEEP.results.slice(); }, grp); report(grp, res, (Date.now() - s) / 1000); }

  if (want('render')) { const s = Date.now(); const res = [];
    await page.evaluate(() => { TH.fresh('earth'); TH.isolate(); document.getElementById('hud').classList.add('hidden'); document.getElementById('title').classList.add('hidden'); });
    const views = [];
    for (let gx = -3; gx <= 3; gx++) for (let gz = -3; gz <= 3; gz++) views.push({ name: `grid ${gx},${gz}`, x: gx * 80, z: gz * 80, time: 12, look: 'center' });
    const L = await page.evaluate(() => Object.entries(LOC).filter(([k]) => k !== 'lake').map(([k, v]) => ({ k, x: v.x, z: v.z, r: v.r, name: v.name })));
    for (const l of L) for (const [tn, time] of [['day', 11], ['sunset', 18.3], ['night', 23]]) views.push({ name: `${l.name} (${tn})`, x: l.x, z: l.z + Math.max(18, l.r * 0.7), time, look: 'landmark', lx: l.x, lz: l.z });
    for (const v of views) {
      const st = await page.evaluate((v) => { const p = G.player; let x = v.x, z = v.z; for (let k = 0; k < 40 && terrainH(x, z) < 0.6; k++) { x *= 0.93; z *= 0.93; } if (Math.hypot(x, z) > 280) { x *= 280 / Math.hypot(x, z); z *= 280 / Math.hypot(x, z); }
        TH.place(x, z, 0); const tx = v.look === 'landmark' ? v.lx : 0, tz = v.look === 'landmark' ? v.lz : 0; let yaw = Math.atan2(tx - x, tz - z); if (v.look !== 'landmark') { for (let k = 0; k < 4; k++) { const fx = x + Math.sin(yaw) * 12, fz = z + Math.cos(yaw) * 12; if (terrainH(fx, fz) < terrainH(x, z) + 4) break; yaw += Math.PI / 2; } } /* don't stare into a cliff face */ p.yaw = yaw; G.camYaw = yaw + Math.PI; G.camPitch = -0.12; G.camDist = 6; G.time = v.time; G.dayLen = 1e9;
        TH.tick(0.4); const s2 = G.sceneEl; s2.renderer.render(s2.object3D, s2.camera); const gl = s2.renderer.getContext(); const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight; const px = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
        let sum = 0, sum2 = 0, n = 0, black = 0, clear = 0, nan = 0; for (let i = 0; i < px.length; i += 4 * 53) { const l = (px[i] + px[i + 1] + px[i + 2]) / 3; sum += l; sum2 += l * l; n++; if (px[i] + px[i + 1] + px[i + 2] < 6) black++; if (Math.abs(px[i] - 135) < 3 && Math.abs(px[i + 1] - 181) < 3 && Math.abs(px[i + 2] - 216) < 3) clear++; }
        return { x, z, mean: sum / n, sd: Math.sqrt(Math.max(0, sum2 / n - (sum / n) ** 2)), black: black / n, clear: clear / n }; }, v);
      const okv = st.mean > 10 && st.mean < 245 && st.sd > 7 && st.black < 0.12 && st.clear < 0.005;
      res.push({ group: 'Render', name: `viewpoint ${v.name} renders cleanly`, ok: okv, detail: okv ? '' : JSON.stringify(st) });
      if (OUT) await page.screenshot({ path: path.join(OUT, `v_${v.name.replace(/-/g, 'm').replace(/[^a-z0-9]+/gi, '_')}.png`), timeout: 90000 });
    }
    await page.evaluate(() => { document.getElementById('hud').classList.remove('hidden'); G.dayLen = 840; }); report('render', res, (Date.now() - s) / 1000); }

  const layoutCheck = async (pg, label, touch) => pg.evaluate(([label, touch]) => { const R = []; const ok = (name, c, d) => R.push({ group: 'Layout', name: `${label}: ${name}`, ok: !!c, detail: c ? '' : d });
    const W = innerWidth, Hh = innerHeight; const rect = (sel) => { const e = document.querySelector(sel); if (!e || e.offsetParent === null && getComputedStyle(e).position !== 'fixed') return null; const r = e.getBoundingClientRect(); return r.width && r.height ? r : null; };
    const onScreen = (sel) => { const r = rect(sel); return !r || (r.left >= -1 && r.top >= -1 && r.right <= W + 1 && r.bottom <= Hh + 1) || `${sel} ${Math.round(r.left)},${Math.round(r.top)}–${Math.round(r.right)},${Math.round(r.bottom)} vs ${W}x${Hh}`; };
    const overlap = (a, b) => { const A = rect(a), B = rect(b); if (!A || !B) return false; return A.left < B.right - 2 && B.left < A.right - 2 && A.top < B.bottom - 2 && B.top < A.bottom - 2; };
    TH.fresh('fire'); TH.isolate(); G.ui.note('A test notification line'); UI.lastHud = -1; UI.hud(0.016);
    for (const sel of ['#bars', '#compass', '#clock', '#minimap', '#region', '#hotbar', '#quest', '#feed', '#cross']) { const r = onScreen(sel); ok(`${sel} on screen`, r === true, r); }
    for (const [a, b] of [['#bars', '#compass'], ['#compass', '#minimap'], ['#clock', '#minimap'], ['#bars', '#minimap'], ['#hotbar', '#quest'], ['#quest', '#bars'], ['#region', '#feed'], ['#hotbar', '#cross']]) ok(`${a} and ${b} do not overlap`, !overlap(a, b), 'overlap');
    if (touch) { for (const [a, b] of [['#quest', '#tMenu'], ['#quest', '#tBag'], ['#joy', '#quest'], ['#hotbar', '#compass']]) ok(`${a} and ${b} do not overlap`, !overlap(a, b), 'overlap'); }
    for (const tab of ['skills', 'inv', 'map', 'journal', 'char']) { UI.openPanel(tab); const r = onScreen('#panel .scroll'); const close = rect('#pClose'); ok(`${tab} panel fits`, r === true && close && close.right <= W && close.top >= 0, r === true ? 'close button hidden' : r); UI.closePanel(); }
    const bao = G.ents.find(e => e.def && e.def.id === 'bao'); Dialog.open(bao); const dr = onScreen('#dialog'); const last = [...document.querySelectorAll('#dialog .ch button')].pop().getBoundingClientRect(); ok('dialogue fits with every choice visible', dr === true && last.bottom <= Hh + 1, dr === true ? `last choice at ${Math.round(last.bottom)}` : dr); Dialog.close();
    TH.closeOverlays(); if (G.player) G.scene.remove(G.player.H.root); Creator.open(); const cr = onScreen('#creator .scroll'); const nb = rect('#cNext'); ok('character creator fits with its buttons visible', cr === true && nb && nb.bottom <= Hh + 1, cr === true ? 'buttons cut off' : cr); document.getElementById('creator').classList.add('hidden'); G.scene.remove(Creator.model.root); Creator.model = null;
    Boot.title(); const b1 = rect('#bNew'); ok('title menu buttons visible', b1 && b1.bottom <= Hh && b1.top >= 0, b1 ? `bNew at ${Math.round(b1.top)}` : 'hidden'); document.getElementById('title').classList.add('hidden'); TH.fresh('fire');
    return R; }, [label, touch]);

  if (want('layout')) { const s = Date.now(); let res = [];
    for (const [w, h] of [[1920, 1080], [1600, 900], [1366, 768], [1280, 720], [1024, 768], [800, 600], [2560, 1080], [3440, 1440]]) { await page.setViewportSize({ width: w, height: h }); await page.evaluate(() => window.dispatchEvent(new Event('resize'))); res = res.concat(await layoutCheck(page, `desktop ${w}x${h}`, false)); }
    report('layout', res, (Date.now() - s) / 1000); }
  if (errors.length) all.push({ group: 'Console', name: 'no page/console errors during sweep', ok: false, detail: errors.slice(0, 4).join(' || ') }); else all.push({ group: 'Console', name: 'no page/console errors during sweep', ok: true });
  await g.close();
  if (want('layout')) { const s = Date.now(); let res = [];
    const m = await launch({ viewport: { width: 915, height: 412 }, touch: true }); await m.page.addScriptTag({ path: path.join(__dirname, 'suite.js') });
    for (const [w, h] of [[915, 412], [844, 390], [740, 360], [667, 375], [1024, 600], [1180, 820]]) { await m.page.setViewportSize({ width: w, height: h }); await m.page.evaluate(() => window.dispatchEvent(new Event('resize'))); res = res.concat(await layoutCheck(m.page, `touch ${w}x${h}`, true)); }
    await m.page.setViewportSize({ width: 390, height: 844 }); const rot = await m.page.evaluate(() => { document.body.classList.add('playing'); return getComputedStyle(document.getElementById('rotate')).display; }); res.push({ group: 'Layout', name: 'portrait phone asks to rotate', ok: rot === 'flex', detail: rot });
    res.push({ group: 'Console', name: 'no errors on touch devices', ok: !m.errors.length, detail: m.errors.slice(0, 3).join(' || ') });
    await m.close(); report('layout/touch', res, (Date.now() - s) / 1000); }
  const pass = all.filter(r => r.ok).length; const fail = all.length - pass; const groups = {}; for (const r of all) { groups[r.group] = groups[r.group] || { pass: 0, fail: 0 }; groups[r.group][r.ok ? 'pass' : 'fail']++; }
  const md = [`# Sweep report`, '', `Ran ${all.length} checks in ${((Date.now() - t0) / 1000).toFixed(0)}s — **${pass} passed, ${fail} failed**.`, '', '| Area | Passed | Failed |', '|---|---|---|', ...Object.entries(groups).map(([k, v]) => `| ${k} | ${v.pass} | ${v.fail} |`), '', fail ? '## Failures' : '', ...all.filter(r => !r.ok).map(r => `- **${r.group}** · ${r.name}: ${r.detail}`)].join('\n');
  if (!only.length) fs.writeFileSync(path.join(__dirname, 'SWEEP_REPORT.md'), md + '\n');
  console.log(`\nSWEEP TOTAL ${pass}/${all.length} passed (${fail} failed) in ${((Date.now() - t0) / 1000).toFixed(0)}s`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('SWEEP RUNNER FAIL', e); process.exit(2); });
