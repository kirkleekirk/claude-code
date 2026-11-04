// Real-time play-through: the game runs on the browser's own frame loop (no manual ticks) and is driven by real
// mouse and keyboard input, from the title screen through character creation and the story into play.
const { launch } = require('./harness.js');
async function runRealtime() {
  const R = []; let g;
  const ok = (name, cond, detail) => R.push({ group: 'Real-time play', name, ok: !!cond, detail: cond ? '' : String(detail) });
  try { g = await launch({ viewport: { width: 560, height: 315 }, realtime: true }); } catch (e) { ok('the browser frame loop drives the game', false, e.message); return { R, errors: [] }; }
  const { page, errors } = g; ok('the browser frame loop drives the game', true);
  const st = () => page.evaluate(() => { const G = GAME.G, P = G.player, c = G.camObj.position; return { mode: G.mode, ticks: G.loopTicks, cam: [c.x, c.y, c.z], camGround: GAME.terrainH(c.x, c.z), yaw: G.camYaw,
    p: P && [P.pos.x, P.pos.y, P.pos.z], ground: P && GAME.groundH(P.pos.x, P.pos.z, P.pos.y + 1), vy: P && P.vy, chi: P && P.chi, locked: GAME.Input.locked, noLock: GAME.Input.noLock }; });
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
  /* wait for game frames rather than wall time: software rendering in CI can run at a couple of frames per second */
  const frames = async (n) => { const t = await page.evaluate(() => GAME.G.loopTicks); await page.waitForFunction((t) => GAME.G.loopTicks >= t, t + n, { timeout: 240000, polling: 50 }); };
  try {
    await frames(3); const t0 = await st(); await frames(8); const t1 = await st();
    ok('title: the frame loop keeps ticking', t1.ticks >= t0.ticks + 8, `${t0.ticks} -> ${t1.ticks}`);
    ok('title: the camera flies above the valley, not under the map', t1.cam[1] > t1.camGround + 3, `camera y ${t1.cam[1].toFixed(2)} over ground ${t1.camGround.toFixed(2)}`);
    ok('title: the camera moves on its own', dist(t0.cam, t1.cam) > 0.2 || Math.abs(t0.cam[1] - t1.cam[1]) > 0.2, JSON.stringify([t0.cam, t1.cam]));
    await page.click('#bNew'); await frames(4); const c = await st();
    ok('creator opens over the scene', c.mode === 'creator' && await page.isVisible('#creator') && !(await page.isVisible('#title')), c.mode);
    ok('creator: the camera frames the character above ground', c.cam[1] > c.camGround + 0.3, `camera y ${c.cam[1].toFixed(2)} over ground ${c.camGround.toFixed(2)}`);
    await page.click('#creator >> text=Fire Nation'); await frames(2); for (let i = 0; i < 2; i++) { await page.click('#cNext'); await frames(1); }
    const nameBox = await page.$('#creator input[type=text], #creator input:not([type])'); if (nameBox) await nameBox.fill('Kanna');
    await page.click('#cNext'); await frames(3);
    ok('the story opens after creation', await page.isVisible('#story'), 'story hidden');
    for (let i = 0; i < 6 && await page.isVisible('#storySkip').catch(() => false); i++) { await page.click('#storySkip'); await frames(1); }
    await frames(10); const s0 = await st();
    ok('play starts with every menu closed', s0.mode === 'play' && !(await page.isVisible('#title')) && !(await page.isVisible('#creator')) && !(await page.isVisible('#story')) && await page.isVisible('#hud'), s0.mode);
    ok('the player spawns standing on the ground', Math.abs(s0.p[1] - s0.ground) < 0.15, `y ${s0.p[1].toFixed(2)} ground ${s0.ground.toFixed(2)}`);
    ok('the camera is above ground and close behind the player', s0.cam[1] > s0.camGround + 0.5 && dist(s0.cam, s0.p) < 9, `camera ${s0.cam.map((v) => v.toFixed(1))} player ${s0.p.map((v) => v.toFixed(1))}`);
    await page.keyboard.down('KeyW'); await frames(30); await page.keyboard.up('KeyW'); await frames(8); const s1 = await st();
    ok('holding W walks the player forward', dist(s0.p, s1.p) > 1, `moved ${dist(s0.p, s1.p).toFixed(2)} m`);
    ok('the player stays on the ground while walking', Math.abs(s1.p[1] - s1.ground) < 0.2, `y ${s1.p[1].toFixed(2)} ground ${s1.ground.toFixed(2)}`);
    ok('the camera follows the player', dist(s1.cam, s1.p) < 9 && s1.cam[1] > s1.camGround + 0.5, `camera ${s1.cam.map((v) => v.toFixed(1))} player ${s1.p.map((v) => v.toFixed(1))}`);
    const box = await page.locator('canvas.a-canvas').boundingBox(); const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.up(); await frames(3); const lk = await st();
    /* captured mouse: the browser reports relative motion (headless Chromium does not synthesise it, so feed the same events it would) */
    if (lk.locked) { await page.evaluate(() => { for (let i = 0; i < 8; i++) dispatchEvent(new MouseEvent('mousemove', { movementX: 15, movementY: 0 })); }); await frames(3); const s2 = await st();
      ok('the captured mouse turns the camera', Math.abs(s2.yaw - lk.yaw) > 0.05, `yaw ${lk.yaw.toFixed(3)} -> ${s2.yaw.toFixed(3)}`); }
    else ok('mouse capture was granted or the fallback took over', lk.noLock, 'neither captured nor in fallback');
    /* where capture is refused (embedded pages), a real drag turns the camera */
    await page.evaluate(() => { GAME.Input.unlock(); GAME.Input.lockFailed(); }); await frames(2); const d0 = await st();
    await page.mouse.move(cx, cy); await page.mouse.down(); for (let i = 0; i < 8; i++) { await page.mouse.move(cx + 15 * (i + 1), cy); await page.waitForTimeout(20); } await page.mouse.up(); await frames(3); const d1 = await st();
    ok('without capture, dragging the mouse turns the camera', Math.abs(d1.yaw - d0.yaw) > 0.05, `yaw ${d0.yaw.toFixed(3)} -> ${d1.yaw.toFixed(3)}`);
    await page.keyboard.press('Space'); await frames(2); const s3 = await st();
    ok('Space jumps', s3.p[1] > s3.ground + 0.05 || s3.vy > 0.5, `y ${s3.p[1].toFixed(2)} ground ${s3.ground.toFixed(2)} vy ${(s3.vy || 0).toFixed(2)}`);
    await frames(60); const s4 = await st();
    ok('the player lands back on the ground', Math.abs(s4.p[1] - s4.ground) < 0.15, `y ${s4.p[1].toFixed(2)} ground ${s4.ground.toFixed(2)}`);
    const chi0 = s4.chi; await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.up(); await frames(3); const s5 = await st();
    ok('a click bends the first technique (chi is spent)', s5.chi < chi0, `${chi0} -> ${s5.chi}`);
    await page.evaluate(() => GAME.Input.unlock()); await frames(2); await page.keyboard.press('Escape'); await frames(2); const pz = await st(); await page.keyboard.press('Escape'); await frames(2); const rs = await st();
    ok('Escape pauses and resumes', pz.mode === 'paused' && rs.mode === 'play', `${pz.mode} -> ${rs.mode}`);
    ok('the frame loop is still ticking at the end', rs.ticks > s0.ticks + 20, `${s0.ticks} -> ${rs.ticks}`);
  } catch (e) { ok('real-time play-through completes', false, e.message.split('\n')[0]); }
  let errs = errors.filter((e) => !/useLegacyLights|GPU stall/.test(e)); await g.close();
  /* phones: the on-screen stick walks the player and the touch view drags the camera, on the real frame loop */
  let m; try { m = await launch({ viewport: { width: 640, height: 300 }, touch: true, realtime: true }); } catch (e) { ok('touch: the browser frame loop drives the game', false, e.message); return { R, errors: errs }; }
  try { const mp = m.page; const frames = async (n) => { const t = await mp.evaluate(() => GAME.G.loopTicks); await mp.waitForFunction((t) => GAME.G.loopTicks >= t, t + n, { timeout: 240000, polling: 50 }); };
    await mp.evaluate(() => { document.getElementById('title').classList.add('hidden'); GAME.Boot.newGame({ name: 'Pema', nation: 'air', home: 'southern', bg: 'monk', look: Object.assign(defaultLook('air'), { body: 'B' }) }); });
    for (let i = 0; i < 6 && await mp.isVisible('#storySkip').catch(() => false); i++) { await mp.evaluate(() => { const b = document.getElementById('storySkip'); b.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await frames(1); }
    await frames(6); const p0 = await mp.evaluate(() => GAME.G.player.pos.toArray());
    ok('touch: play starts with the stick and buttons on screen', await mp.isVisible('#joy') && await mp.isVisible('#tA') && await mp.evaluate(() => GAME.G.mode === 'play'), 'touch controls hidden');
    await mp.evaluate(() => { const j = document.getElementById('joy'), r = j.getBoundingClientRect(); const mk = (type, x, y) => { const t = new Touch({ identifier: 7, target: j, clientX: x, clientY: y }); return new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [t], changedTouches: [t] }); };
      j.dispatchEvent(mk('touchstart', r.left + r.width / 2, r.top + r.height / 2)); window.dispatchEvent(mk('touchmove', r.left + r.width / 2, r.top + r.height * 0.05)); window.__endJoy = () => window.dispatchEvent(mk('touchend', r.left + r.width / 2, r.top)); });
    await frames(30); await mp.evaluate(() => window.__endJoy()); await frames(4); const p1 = await mp.evaluate(() => { const P = GAME.G.player; return [P.pos.x, P.pos.y, P.pos.z, GAME.groundH(P.pos.x, P.pos.z, P.pos.y + 1)]; });
    ok('touch: pushing the stick walks the player', Math.hypot(p1[0] - p0[0], p1[2] - p0[2]) > 1, `moved ${Math.hypot(p1[0] - p0[0], p1[2] - p0[2]).toFixed(2)} m`);
    ok('touch: the player stays on the ground', Math.abs(p1[1] - p1[3]) < 0.2, `y ${p1[1].toFixed(2)} ground ${p1[3].toFixed(2)}`);
    const cam = await mp.evaluate(() => { const c = GAME.G.camObj.position; return [c.y, GAME.terrainH(c.x, c.z)]; }); ok('touch: the camera is above the ground', cam[0] > cam[1] + 0.5, `camera y ${cam[0].toFixed(2)} ground ${cam[1].toFixed(2)}`);
  } catch (e) { ok('touch real-time play-through completes', false, e.message.split('\n')[0]); }
  errs = errs.concat(m.errors.filter((e) => !/useLegacyLights|GPU stall/.test(e))); await m.close(); return { R, errors: errs };
}
module.exports = { runRealtime };
if (require.main === module) runRealtime().then(({ R, errors }) => { for (const r of R) console.log(`${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : ' — ' + r.detail}`); console.log('errors', errors.slice(0, 5)); process.exit(R.every((r) => r.ok) && !errors.length ? 0 : 1); });
