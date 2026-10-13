// What's left undrawn from the light (the faces that look into unlit air, deep down; see the
// mesher), in headless Chromium: from above ground, fewer triangles and the same picture; from
// down in Hell's cavern, everything.
//   node tools/checks/hidden.mjs <dev server url> <out dir> [extra query, e.g. &nocmz]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
const [base, out, extra = ''] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 640, height: 360 } });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
let fails = 0;
const ok = (c, what) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${what}`); if (!c) fails++; };
const errors = [];

// the world drawn twice in one frame, as in play and whole: the triangles of each, and how many
// pixels differ (and by much)
const compare = (page, yaw, pitch) => page.evaluate(async ([yaw, pitch]) => {
  const a = window.__app, g = a.game, w = g.world, p = g.player, R = a.renderer, gl = R.gl;
  p.yaw = yaw; p.pitch = pitch; p.vel.set(0, 0, 0);
  g.update(1 / 60, a.input);
  const cam = g.camera, see = w.seeTheDark(cam.position.x, cam.position.y, cam.position.z);
  const draw = (all) => {
    w.darkAll = undefined; w.setDarkView(all);
    gl.info.autoReset = false; gl.info.reset();
    R.render(g.scene, cam);
    const tris = gl.info.render.triangles;
    gl.info.autoReset = true;
    return { tris, url: gl.domElement.toDataURL('image/png') };
  };
  const A = draw(see), B = draw(true);
  w.setDarkView(see);
  const load = (u) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = u; });
  const [ia, ib] = await Promise.all([load(A.url), load(B.url)]);
  const cv = document.createElement('canvas'); cv.width = ia.width; cv.height = ia.height;
  const x = cv.getContext('2d');
  x.drawImage(ia, 0, 0); const da = x.getImageData(0, 0, cv.width, cv.height).data;
  x.drawImage(ib, 0, 0); const db = x.getImageData(0, 0, cv.width, cv.height).data;
  let differ = 0, big = 0;
  for (let i = 0; i < da.length; i += 4) {
    const d = Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]);
    if (d > 24) differ++;
    if (d > 120) big++;
  }
  return { see, tris: A.tris, all: B.tris, differ, big, shot: A.url };
}, [yaw, pitch]);

const open = async (q) => {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  await page.goto(`${base}/?play&time=0.5&q=low&rd=6&fixedres&fly${q}${extra}`);
  await page.waitForFunction(() => window.__app?.state === 'playing' && window.__app.game?.ready, null, { timeout: 300000 });
  await page.evaluate(() => { window.__app.onLockChange = () => {}; });
  await page.waitForTimeout(8000);
  return page;
};

// over the hills by the start, and over the Lagoon's islands (where unlit air would be seen
// through if it counted so high)
for (const [name, q] of [['by the start', '&x=8.5&z=-7.5&y=100&pitch=-0.4'], ['over the Lagoon', '&x=450&z=300&y=110&pitch=-0.4']]) {
  const page = await open(q);
  for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const r = await compare(page, yaw, -0.4);
    const tag = `${name} facing ${Math.round((yaw * 180) / Math.PI)}`;
    writeFileSync(`${out}/${tag.replace(/ /g, '-')}.png`, Buffer.from(r.shot.split(',')[1], 'base64'));
    ok(!r.see && r.tris < r.all * 0.8, `${tag}: drawn without the unlit faces (${r.tris} triangles of ${r.all})`);
    ok(r.big === 0 && r.differ < 200, `${tag}: and it looks the same (${r.differ} pixels a little different, ${r.big} more)`);
  }
  await page.close();
}

// down in Hell's cavern under the start, all of it
{
  const page = await open('&x=8.5&z=-7.5&y=16');
  const r = await page.evaluate(() => {
    const a = window.__app, g = a.game, w = g.world, p = g.player, cam = g.camera;
    g.update(1 / 60, a.input);
    const L = w.lightAt(p.eye.x, p.eye.y, p.eye.z);
    return { y: p.pos.y, sky: L.sky, see: w.seeTheDark(cam.position.x, cam.position.y, cam.position.z), all: w.darkAll, block: w.getBlock(Math.floor(p.pos.x), Math.floor(p.eye.y), Math.floor(p.pos.z)) };
  });
  ok(r.see && r.all === true, `in Hell's cavern (y ${r.y.toFixed(1)}, no daylight: ${r.sky}), all of it is drawn`);
  await page.close();
}

ok(errors.length === 0, `no errors${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
await browser.close();
console.log(fails ? `${fails} failed` : 'all ok');
process.exit(fails ? 1 : 0);
