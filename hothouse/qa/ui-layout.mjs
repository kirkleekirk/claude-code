// Layout QA for the interface. Opens every lab screen at several resolutions and UI scales and
// checks: elements overflowing the viewport, clipped text, text contrast (4.5:1, or 3:1 for large
// text, composited over panels and scrims against a bright-sky worst case), hit targets under
// 40 px, and text under 14 px at 1920×1080 / 100 %. Writes qa/out/ui/layout-report.json and
// screenshots of any screen with problems. Exit code 1 when anything fails.
//
// Usage: node qa/ui-layout.mjs [--quick] [--screens a,b,c] [--sizes 1280x720,1920x1080] [--scales 100,150]
//        [--set a11y.dyslexiaFont=true …]   (settings runs write layout-report-<settings>.json)
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { launchBrowser, OUT, startServer } from './lib.mjs';

const args = process.argv.slice(2);
const quick = args.includes('--quick');
const listArg = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1].split(',') : null;
};
const onlyScreens = listArg('screens');
const sets = args.flatMap((a, i) => (a === '--set' ? [args[i + 1]] : []));
const setQuery = sets.map((kv) => {
  const [k, v = 'true'] = kv.split('=');
  return `&set.${k}=${encodeURIComponent(v)}`;
}).join('');
const setSuffix = sets.map((kv) => `-${kv.replace(/[^a-z0-9]+/gi, '_')}`).join('');
const RES = listArg('sizes')?.map((s) => s.split('x').map(Number)) ?? (quick ? [[1280, 720], [1920, 1080]] : [[1280, 720], [1920, 1080], [2560, 1440], [3440, 1440]]);
const SCALES = listArg('scales')?.map(Number) ?? (quick ? [100] : [80, 100, 150]);
const dir = resolve(OUT, 'ui', 'layout');
mkdirSync(dir, { recursive: true });

/** Runs inside the page. Returns the problems found on the current screen. */
function inspect(opts) {
  const vw = innerWidth;
  const vh = innerHeight;
  const root = document.getElementById('ui');
  const res = { overflow: [], clipped: [], contrast: [], targets: [], fonts: [], truncated: [], shadowed: 0, texts: 0 };
  const BACKDROP = { r: 240, g: 200, b: 144, a: 1 };
  const describe = (el) => {
    const cls = typeof el.className === 'string' && el.className.trim() ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}` : '';
    const t = (el.textContent || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 36);
    return `${el.tagName.toLowerCase()}${cls}${t ? ` "${t}"` : ''}`;
  };
  const parse = (c) => {
    if (!c) return null;
    let m = c.match(/^rgba?\(([^)]+)\)/);
    if (m) {
      const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    }
    m = c.match(/^color\(srgb ([^)]+)\)/);
    if (m) {
      const p = m[1].split(/[\s/]+/).filter(Boolean).map(Number);
      return { r: p[0] * 255, g: p[1] * 255, b: p[2] * 255, a: p.length > 3 ? p[3] : 1 };
    }
    return null;
  };
  const colorsIn = (img) => [...img.matchAll(/rgba?\([^)]+\)|color\(srgb[^)]+\)|#[0-9a-fA-F]{6}\b/g)].map((m) => {
    const s = m[0];
    if (s.startsWith('#')) return { r: parseInt(s.slice(1, 3), 16), g: parseInt(s.slice(3, 5), 16), b: parseInt(s.slice(5, 7), 16), a: 1 };
    return parse(s);
  }).filter(Boolean);
  const average = (cols) => cols.reduce((a, c) => ({ r: a.r + c.r / cols.length, g: a.g + c.g / cols.length, b: a.b + c.b / cols.length, a: a.a + c.a / cols.length }), { r: 0, g: 0, b: 0, a: 0 });
  const strongest = (cols) => cols.reduce((best, c) => (c.a > best.a ? c : best), cols[0]);
  const over = (t, b) => ({ r: t.r * t.a + b.r * (1 - t.a), g: t.g * t.a + b.g * (1 - t.a), b: t.b * t.a + b.b * (1 - t.a), a: 1 });
  const lum = (c) => {
    const f = (v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const layerColor = (el, scrim) => {
    const cs = getComputedStyle(el);
    let c = parse(cs.backgroundColor);
    if ((!c || c.a === 0) && cs.backgroundImage && cs.backgroundImage !== 'none') {
      const cols = colorsIn(cs.backgroundImage);
      // A stack of gradients is opaque if any stop is: use the opaque stops' average.
      const opaque = cols.filter((x) => x.a >= 0.99);
      if (opaque.length) c = { ...average(opaque), a: 1 };
      else if (cols.length) c = scrim ? strongest(cols) : average(cols);
    }
    return c && c.a > 0.01 ? c : null;
  };
  const isScrim = (el) => el.hasAttribute('data-backdrop') || /scrim|wash|letterbox/.test(typeof el.className === 'string' ? el.className : '');
  const effectiveBg = (el) => {
    const chain = [];
    for (let n = el; n && n !== document.body; n = n.parentElement) chain.push(n);
    let bg = BACKDROP;
    let cover = 0;
    for (let i = chain.length - 1; i >= 0; i--) {
      const node = chain[i];
      for (let s = node.parentElement?.firstElementChild; s && s !== node; s = s.nextElementSibling) {
        if (!isScrim(s)) continue;
        const c = layerColor(s, true);
        if (c) {
          bg = over(c, bg);
          cover += (1 - cover) * c.a;
        }
      }
      const c = layerColor(node, false);
      if (c) {
        bg = over(c, bg);
        cover += (1 - cover) * c.a;
      }
    }
    return { bg, cover };
  };
  const opacityChain = (el) => {
    let o = 1;
    for (let n = el; n && n !== document.body; n = n.parentElement) o *= Number(getComputedStyle(n).opacity);
    return o;
  };
  const clippedByAncestor = (el) => {
    for (let n = el.parentElement; n && n !== root; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') return true;
    }
    return false;
  };
  const ownText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 0);
  const interactive = 'button, [role="button"], [role="tab"], [role="switch"], [role="menuitem"], [data-focusable], input, select, a[href]';

  for (const el of root.querySelectorAll('*')) {
    if (el.closest('[aria-hidden="true"], svg, .hh-art')) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    const faded = opacityChain(el) < 0.5;

    if ((r.right > vw + 1 || r.bottom > vh + 1 || r.left < -1 || r.top < -1) && !clippedByAncestor(el)) {
      res.overflow.push(`${describe(el)} [${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}×${Math.round(r.height)}]`);
    }

    if (el.matches(interactive) && !faded && !el.classList.contains('hh-sr-only')) {
      if (r.width < 39.5 || r.height < 39.5) res.targets.push(`${describe(el)} ${Math.round(r.width)}×${Math.round(r.height)}`);
    }

    if (!ownText(el)) continue;
    res.texts++;
    const fs = parseFloat(cs.fontSize);
    const weight = Number(cs.fontWeight) || 400;
    if (opts.checkFonts && fs < 13.9 && !el.closest('.hh-glyph')) res.fonts.push(`${describe(el)} ${fs.toFixed(1)}px`);

    const ox = cs.overflowX;
    const oy = cs.overflowY;
    if ((ox === 'hidden' || ox === 'clip') && el.scrollWidth > el.clientWidth + 1) {
      if (cs.textOverflow === 'ellipsis') res.truncated.push(describe(el));
      else res.clipped.push(`${describe(el)} (x ${el.scrollWidth}>${el.clientWidth})`);
    }
    if ((oy === 'hidden' || oy === 'clip') && el.scrollHeight > el.clientHeight + 2 && cs.webkitLineClamp === 'none' && cs.textOverflow !== 'ellipsis') {
      res.clipped.push(`${describe(el)} (y ${el.scrollHeight}>${el.clientHeight})`);
    }

    if (faded || el.closest('.is-disabled, [aria-disabled="true"], :disabled, .hh-dialogue-ghost')) continue;
    // Gradient-filled display type (the wordmark) has no single colour to measure.
    if (cs.webkitBackgroundClip === 'text' || cs.backgroundClip === 'text') continue;
    let { bg, cover } = effectiveBg(el);
    // The selected segment's label sits on the lime thumb (a sibling, not an ancestor).
    if (el.closest('.hh-segmented-opt.is-on')) {
      bg = { r: 184, g: 245, b: 74, a: 1 };
      cover = 1;
    }
    if (cover < 0.55) {
      if (cs.textShadow && cs.textShadow !== 'none') {
        res.shadowed++;
        continue;
      }
    }
    const fgRaw = parse(cs.color);
    if (!fgRaw) continue;
    const fg = over(fgRaw, bg);
    const L1 = lum(fg);
    const L2 = lum(bg);
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const large = fs >= 24 || (fs >= 18.66 && weight >= 700);
    const need = large ? 3 : 4.5;
    if (ratio < need) res.contrast.push(`${describe(el)} ${ratio.toFixed(2)}:1 (needs ${need})`);
  }
  return res;
}

const server = await startServer();
const browser = await launchBrowser();
const report = {};
let failures = 0;
try {
  for (const [w, h] of RES) {
    for (const scale of SCALES) {
      const key = `${w}x${h}@${scale}`;
      const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
      page.setDefaultTimeout(120000);
      const consoleProblems = [];
      page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && consoleProblems.push(m.text()));
      page.on('pageerror', (e) => consoleProblems.push(e.message));
      await page.goto(`${server.url}ui-lab.html?qa=1&scale=${scale}&input=keyboard&set.a11y.reducedMotion=true${setQuery}&screen=components`);
      await page.waitForFunction(() => globalThis.__UILAB__?.ready === true, null, { timeout: 120000 });
      const screens = onlyScreens ?? (await page.evaluate(() => [...globalThis.__UILAB__.screens]));
      report[key] = {};
      for (const s of screens) {
        await page.evaluate((id) => globalThis.__UILAB__.open(id), s);
        await page.waitForTimeout(650);
        const r = await page.evaluate(inspect, { checkFonts: w === 1920 && h === 1080 && scale === 100 });
        const bad = r.overflow.length + r.clipped.length + r.contrast.length + r.targets.length + r.fonts.length;
        report[key][s] = r;
        if (bad) {
          failures += bad;
          await page.screenshot({ path: resolve(dir, `${s}-${w}x${h}-${scale}${setSuffix}.png`) });
          console.log(`✗ ${key} ${s}: ${[...r.overflow.map((x) => `overflow ${x}`), ...r.clipped.map((x) => `clipped ${x}`), ...r.contrast.map((x) => `contrast ${x}`), ...r.targets.map((x) => `target ${x}`), ...r.fonts.map((x) => `font ${x}`)].join('\n    ')}`);
        }
      }
      if (consoleProblems.length) {
        failures += consoleProblems.length;
        console.log(`✗ ${key} console: ${consoleProblems.join(' | ')}`);
      }
      const texts = Object.values(report[key]).reduce((a, r) => a + r.texts, 0);
      const truncated = Object.values(report[key]).reduce((a, r) => a + r.truncated.length, 0);
      console.log(`· ${key}: ${screens.length} screens, ${texts} text elements, ${truncated} intentional ellipses`);
      await page.close();
    }
  }
} finally {
  writeFileSync(resolve(dir, `layout-report${setSuffix}.json`), JSON.stringify(report, null, 1));
  await browser.close();
  await server.close();
}
console.log(failures ? `layout QA: ${failures} problem(s)` : 'layout QA: clean');
process.exit(failures ? 1 : 0);
