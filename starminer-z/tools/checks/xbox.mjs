// The game as an Xbox's Edge has it (its user agent, a 1080p TV), in headless Chromium: it
// starts on Low (and an old Medium start moves there), draws itself smaller while frames are
// slow, shows the inventory's slots, and has every texture array's smaller copies right on the
// GPU (an Xbox's own make every layer's from the first: faraway land all grass).
//   node tools/checks/xbox.mjs <dev server url> <out dir> [extra query, e.g. &nocmz]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';
const [base, out, extra = '&nocmz'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; Xbox; Xbox Series X) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let fails = 0;
const ok = (c, what) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${what}`); if (!c) fails++; };
const logs = [];
const open = async (pre = null) => {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, userAgent: UA });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  if (pre) await ctx.addInitScript((s) => { try { localStorage.setItem('starminer.settings', s); } catch { /* */ } }, JSON.stringify(pre));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await page.goto(`${base}/?play&time=0.45${extra}`);
  await page.waitForFunction(() => window.__app?.state === 'playing' && window.__app.game?.ready, null, { timeout: 300000 });
  await page.evaluate(() => { window.__app.onLockChange = () => {}; });
  return { ctx, page };
};

// a first visit: Low, its view distance, and the pad's hints
{
  const { ctx, page } = await open();
  const s = await page.evaluate(() => ({ q: window.__app.settings.quality, rd: window.__app.settings.renderDistance, device: window.__app.input.lastDevice }));
  ok(s.q === 'low' && s.rd === 8 && s.device === 'pad', `an Xbox starts on Low, 8 chunks out, with the pad's hints (${JSON.stringify(s)})`);
  // slow frames (and they are, drawn in software at 1080p): it draws itself smaller
  await page.waitForFunction(() => window.__app.renderer.scale < 1, null, { timeout: 40000, polling: 500 }).catch(() => {});
  const r = await page.evaluate(() => ({ scale: window.__app.renderer.scale, ft: window.__app.renderer.ft, size: window.__app.renderer.size }));
  ok(r.scale < 1 && r.scale >= 0.55, `with frames slow (${(r.ft * 1000).toFixed(0)} ms), it draws itself smaller: ${r.scale.toFixed(2)} (${r.size.W} x ${r.size.H})`);
  // the inventory's slots
  const inv = await page.evaluate(() => {
    const g = window.__app.game;
    g.inventory.add('dirt', 20);
    g.openCrafting();
    const cells = g.crafting.cells.map((c) => c.getBoundingClientRect()).filter((b) => b.width > 20 && b.height > 20);
    const imgs = g.crafting.cells.filter((c) => c.querySelector('img')).length;
    return { cells: cells.length, imgs };
  });
  ok(inv.cells === 40 && inv.imgs >= 7, `the inventory shows its 40 slots, with what's in them (${inv.cells} slots, ${inv.imgs} things)`);
  await page.screenshot({ path: `${out}/xbox-inventory.png`, timeout: 240000 });
  await page.evaluate(() => window.__app.game.crafting.close());
  // the texture arrays' smaller copies, on the GPU, against the ones made for them
  const mips = await page.evaluate(async () => {
    const { blockTextureArray } = await import('/src/gfx/blockTextures.js');
    const { avatarAssets } = await import('/src/entities/avatar/assets.js');
    const R = window.__app.renderer.gl, gl = R.getContext(), A = avatarAssets();
    R.initTexture(A.clothes); R.initTexture(A.faceTex);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    let worst = 0, n = 0;
    for (const tex of [blockTextureArray(R), A.clothes, A.faceTex]) {
      const p = R.properties.get(tex), L = tex.image.depth;
      for (let level = 1; level < tex.mipmaps.length; level++) for (const layer of [0, Math.floor(L / 2), L - 1]) {
        const m = tex.mipmaps[level], w = m.width, h = m.height, px = new Uint8Array(w * h * 4);
        gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, p.__webglTexture, level, layer);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) { worst = 255; continue; }
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
        const want = m.data.subarray(layer * w * h * 4, (layer + 1) * w * h * 4);
        for (let i = 0; i < px.length; i++) worst = Math.max(worst, Math.abs(px[i] - want[i]));
        n++;
      }
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fb);
    return { worst, n, err: gl.getError() };
  });
  ok(mips.worst === 0 && mips.err === 0, `every texture array's smaller copies are the ones made for them (${mips.n} levels and layers checked)`);
  await ctx.close();
}

// someone who played before the change: the old Medium start moves to Low; a choice of High stays
{
  const { ctx, page } = await open({ quality: 'medium', renderDistance: 12, sound: 0.5 });
  const s = await page.evaluate(() => ({ q: window.__app.settings.quality, rd: window.__app.settings.renderDistance, sound: window.__app.settings.sound, v: window.__app.settings.v }));
  ok(s.q === 'low' && s.rd === 8 && s.sound === 0.5 && s.v === 2, `the Xbox's old Medium start moves to Low, the rest kept (${JSON.stringify(s)})`);
  await ctx.close();
}
{
  const { ctx, page } = await open({ quality: 'high', v: 2 });
  const q = await page.evaluate(() => window.__app.settings.quality);
  ok(q === 'high', `a choice made since stays (${q})`);
  await ctx.close();
}

console.log(logs.length ? logs.join('\n') : 'no errors');
console.log(fails ? `${fails} FAILED` : 'all ok');
await browser.close();
process.exit(fails ? 1 : 0);
