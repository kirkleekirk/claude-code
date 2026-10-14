// When the graphics fail, in headless Chromium: a browser without WebGL gets a message saying what
// to try, and graphics lost mid-game save the world and wait (and the game carries on once
// they're back).
//   node tools/checks/graphics.mjs <dev server url> <out dir>
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const [base, out] = process.argv.slice(2);
let fails = 0;
const ok = (c, what) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${what}`); if (!c) fails++; };
const route = (ctx) => ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));

// 1. a browser with no WebGL
{
  const b = await chromium.launch({ args: ['--disable-webgl', '--disable-webgl2', '--disable-3d-apis'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } }); await route(ctx);
  const page = await ctx.newPage();
  await page.goto(`${base}/?rd=4&q=low`);
  await page.waitForFunction(() => /3D graphics/.test(document.body.innerText), null, { timeout: 60000 }).catch(() => {});
  const text = await page.evaluate(() => document.body.innerText);
  ok(/couldn't start its 3D graphics/.test(text) && /Things to try/.test(text) && /Xbox button/.test(text), 'no WebGL: the page says so, and what to try');
  console.log(text.split('\n').map((l) => `   | ${l}`).join('\n'));
  await page.screenshot({ path: `${out}/no-webgl.png` });
  await b.close();
}

// 2. the graphics lost mid-game, and back
{
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 960, height: 540 } }); await route(ctx);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`${base}/?rd=4&q=low`);
  await page.waitForFunction(() => window.__app?.state === 'menu', null, { timeout: 240000 });
  await page.evaluate(() => { const a = window.__app; a.onLockChange = () => {}; a.menus.pressStart(); a.startWorld({ mode: 'survival', difficulty: 'normal' }); });
  await page.waitForFunction(() => window.__app.state === 'playing' && window.__app.game?.ready, null, { timeout: 240000 });
  ok(true, 'a normal start still works');
  const lost = await page.evaluate(async () => {
    const app = window.__app, gl = app.renderer.gl.getContext(), ext = gl.getExtension('WEBGL_lose_context');
    window.__ext = ext;
    const before = app.game.time;
    ext.loseContext();
    await new Promise((r) => setTimeout(r, 1500));
    return { lost: !!app.lostGfx, el: app.lostEl?.textContent || '', saved: app.worlds.length, still: app.game.time - before };
  });
  ok(lost.lost && /stopped the game's graphics/.test(lost.el) && /has been saved/.test(lost.el), `lost: the game says so (${lost.el})`);
  ok(lost.saved === 1, `and the world is saved (${lost.saved})`);
  ok(lost.still < 0.2, `and nothing goes on meanwhile (${lost.still.toFixed(2)} s of game time)`);
  await page.screenshot({ path: `${out}/lost.png` });
  const back = await page.evaluate(async () => {
    const app = window.__app;
    window.__ext.restoreContext();
    await new Promise((r) => setTimeout(r, 3000));
    return { lost: !!app.lostGfx, el: !!app.lostEl, t: app.game.time };
  });
  ok(!back.lost && !back.el, 'back again: the game carries on');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/restored.png` });
  console.log(errs.length ? errs.slice(0, 5).join('\n') : 'no page errors');
  await b.close();
}
console.log(fails ? `${fails} FAILED` : 'all ok');
process.exit(fails ? 1 : 0);
