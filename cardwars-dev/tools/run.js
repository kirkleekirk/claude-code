// Scripted browser session: node tools/run.js <w> <h> <hash> "<step>;<step>..."  steps: click:<sel> | wait:<ms> | shot:<name> | tap:<x>,<y> | eval:<js> | key:<key>
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
const SP = '/tmp/claude-0/-home-user-claude-code/b730f0d2-9c71-5def-9be0-e3554ab90729/scratchpad/shots/';
(async () => {
  const [w, h, hash, script, touch] = process.argv.slice(2);
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1, hasTouch: touch === 'touch' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
  page.on('console', m => { const t = m.text(); if ((m.type() === 'error' || m.type() === 'warning') && !/GL Driver Message|GPU stall/.test(t)) errs.push('console.' + m.type() + ': ' + t); });
  await page.goto('file://' + path.resolve(__dirname, '..', '..', 'cardwars.html') + (hash === '-' ? '' : hash));
  await page.waitForTimeout(600);
  for (const step of (script || '').split('||').map(s => s.trim()).filter(Boolean)) {
    const i = step.indexOf(':'), k = step.slice(0, i), v = step.slice(i + 1);
    try {
      if (k === 'click') await page.click(v.startsWith('#modal') || v.startsWith('#') ? v : '#modal.on ' + v + ', .screen.on ' + v, { timeout: 4000 });
      else if (k === 'wait') await page.waitForTimeout(+v);
      else if (k === 'shot') await page.screenshot({ path: SP + v + '.png' });
      else if (k === 'tap') { const [x, y] = v.split(',').map(Number); await page.mouse.click(x, y); }
      else if (k === 'eval') { const r = await page.evaluate(v); if (r !== undefined) console.log('eval:', JSON.stringify(r)); }
      else if (k === 'key') await page.keyboard.press(v);
      else if (k === 'ttapcell') { const [sd, ln, sl] = v.split(','); const pt = await page.evaluate(([a, b, c]) => Scene.screenPos(+a, +b, c, 0.4), [sd, ln, sl]); await page.touchscreen.tap(pt.x, pt.y); }
      else if (k === 'ttap') { const [x, y] = v.split(',').map(Number); await page.touchscreen.tap(x, y); }
      else if (k === 'ttapsel') { const r = await page.evaluate(sel => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, v); if (!r) throw new Error('no ' + v); await page.touchscreen.tap(r.x, r.y); }
      else if (k === 'tapcell') { const [sd, ln, sl] = v.split(','); const pt = await page.evaluate(([a, b, c]) => Scene.screenPos(+a, +b, c, 0.4), [sd, ln, sl]); await page.mouse.click(pt.x, pt.y); }
      else if (k === 'dragcard') {
        const [id, sd, ln, sl] = v.split(',');
        const pts = await page.evaluate(([id, a, b, c]) => {
          const inst = UI.M.disp.players[UI.M.viewer].hand.find(x => x.id === id); if (!inst) return null;
          const el = document.querySelector('#hand .card[data-uid="' + inst.uid + '"]'); if (!el) return null;
          const r = el.getBoundingClientRect(); const p = Scene.screenPos(+a, +b, c, 0.3);
          return { x1: r.left + r.width / 2, y1: r.top + r.height / 2, x2: p.x, y2: p.y };
        }, [id, sd, ln, sl]);
        if (!pts) throw new Error('card not in hand: ' + id);
        await page.mouse.move(pts.x1, pts.y1); await page.mouse.down();
        for (let i = 1; i <= 14; i++) await page.mouse.move(pts.x1 + (pts.x2 - pts.x1) * i / 14, pts.y1 + (pts.y2 - pts.y1) * i / 14);
        await page.mouse.up();
      }
      else if (k === 'tapland') { const [sd, ln] = v.split(','); const pt = await page.evaluate(([a, b]) => Scene.screenPos(+a, +b, 'c', 0), [sd, ln]); await page.mouse.click(pt.x, pt.y); }
      else if (k === 'drag') { const [x1, y1, x2, y2] = v.split(',').map(Number); await page.mouse.move(x1, y1); await page.mouse.down(); for (let s = 1; s <= 12; s++) await page.mouse.move(x1 + (x2 - x1) * s / 12, y1 + (y2 - y1) * s / 12); await page.mouse.up(); }
    } catch (e) { errs.push('step ' + step + ' failed: ' + e.message.split('\n')[0]); }
  }
  console.log(errs.length ? errs.join('\n') : 'no errors');
  await browser.close();
})();
