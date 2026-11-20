// People QA: renders the character showcase scenes and composes contact sheets in qa/out/people/.
// Usage: node qa/people.mjs [scene[:opt] ...]   e.g. node qa/people.mjs lineup loco:walk drivers:palmera
import { lstatSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'vite';
import { ROOT, canvasShot, hh, launchBrowser, openGame, out, startServer } from './lib.mjs';

/** Dev server; when node_modules is a symlink (git worktrees) its real path must be servable too. */
async function server() {
  const nm = join(ROOT, 'node_modules');
  if (!lstatSync(nm).isSymbolicLink()) return startServer();
  const s = await createServer({ root: ROOT, server: { port: 5318, host: '127.0.0.1', strictPort: false, hmr: false, watch: null, fs: { allow: [ROOT, realpathSync(nm)] } }, logLevel: 'silent' });
  await s.listen();
  return { url: s.resolvedUrls?.local?.[0] ?? 'http://127.0.0.1:5318/', close: () => s.close() };
}

const GAITS = ['idle', 'walk', 'jog', 'run', 'sprint', 'crouch', 'strafe', 'jump'];
const CARS = ['palmera', 'palmeraOutside', 'palmeraClose', 'gator', 'hammerhead', 'brisa', 'marshal'];
const CLIP_PAGES = [0, 1, 2, 3, 4, 5].map(String);
const DEFAULT = [
  ['lineup', '', 17.9],
  ...[0, 1, 2, 3].map((p) => ['hair', String(p), 17.9]),
  ['outfits', '0', 17.9], ['outfits', '1', 17.9],
  ['faces', '0', 17.75], ['faces', '1', 17.75],
  ...GAITS.map((g) => ['loco', g, 17.75]),
  ...CLIP_PAGES.map((p) => ['clips', p, 17.75]),
  ...CARS.map((c) => ['drivers', c, 17.9]),
  ['player', '', 18.2],
  ['crowd', '', 18.55],
  ['night', '', 22.3],
];
const args = process.argv.slice(2);
const cases = args.length ? args.map((a) => {
  const [scene, opt = '', hour] = a.split(':');
  return [scene, opt, Number(hour ?? (scene === 'night' ? 22.3 : scene === 'crowd' ? 18.55 : 17.8))];
}) : DEFAULT;

const SHEETS = {
  'sheet-hair': { files: [0, 1, 2, 3].map((p) => `hair-${p}`), cols: 2 },
  'sheet-outfits': { files: ['outfits-0', 'outfits-1'], cols: 1 },
  'sheet-faces': { files: ['faces-0', 'faces-1'], cols: 1 },
  'sheet-loco': { files: GAITS.map((g) => `loco-${g}`), cols: 2 },
  'sheet-clips': { files: CLIP_PAGES.map((p) => `clips-${p}`), cols: 2 },
  'sheet-drivers': { files: CARS.map((c) => `drivers-${c}`), cols: 2 },
};

const srv = await server();
const browser = await launchBrowser();
let failed = false;
const shots = {};
try {
  const t0 = Date.now();
  const { page, logs } = await openGame(browser, srv.url, 'test=1&sandbox=people&time=17.8');
  console.log(`boot ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  mkdirSync(out('people'), { recursive: true });
  for (const [scene, opt, hour] of cases) {
    await hh(page, 'setWeather', 'clear');
    await hh(page, 'setTime', hour);
    const debugWinding = opt.endsWith('!');
    const res = await hh(page, 'people', scene, debugWinding ? opt.slice(0, -1) || undefined : opt || undefined);
    if (debugWinding) await hh(page, 'peopleDebug', 'winding');
    // Physics-only stepping; the capture below does the one render.
    await hh(page, 'advance', 1.45, false);
    const name = opt ? `${scene}-${opt.replace('!', '-winding')}` : scene;
    const file = await canvasShot(page, out('people', `${name}.png`));
    shots[name] = file;
    const stats = await hh(page, 'peopleStats');
    console.log(`${name.padEnd(24)} actors ${String(res.actors).padStart(2)} verts ${Math.max(0, ...stats.vertices)} max  → ${file}`);
  }
  if (!args.length) {
    // Winding check: inverted faces show red on the lineup.
    await hh(page, 'setTime', 17.9);
    await hh(page, 'people', 'lineup');
    const n = await hh(page, 'peopleDebug', 'winding');
    await hh(page, 'advance', 0.5, false);
    await canvasShot(page, out('people', 'winding.png'));
    console.log(`winding overlay on ${n} actors → ${out('people', 'winding.png')}`);
    await hh(page, 'peopleDebug', 'off');
    // Contact sheets, composed in the page from the saved frames.
    for (const [sheet, { files, cols }] of Object.entries(SHEETS)) {
      const urls = [];
      for (const f of files) {
        if (!shots[f]) continue;
        const { readFileSync } = await import('node:fs');
        urls.push(`data:image/png;base64,${readFileSync(shots[f]).toString('base64')}`);
      }
      if (!urls.length) continue;
      const dataUrl = await page.evaluate(async ([list, c]) => {
        const imgs = await Promise.all(list.map((u) => new Promise((res) => {
          const im = new Image();
          im.onload = () => res(im);
          im.src = u;
        })));
        const w = 960, h = Math.round((960 * imgs[0].height) / imgs[0].width);
        const rows = Math.ceil(imgs.length / c);
        const cv = document.createElement('canvas');
        cv.width = w * c;
        cv.height = h * rows;
        const g = cv.getContext('2d');
        g.fillStyle = '#140B33';
        g.fillRect(0, 0, cv.width, cv.height);
        imgs.forEach((im, i) => g.drawImage(im, (i % c) * w, Math.floor(i / c) * h, w, h));
        return cv.toDataURL('image/png');
      }, [urls, cols]);
      const file = out('people', `${sheet}.png`);
      writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
      console.log(`${sheet.padEnd(24)} → ${file}`);
    }
  }
  const st = await hh(page, 'getState');
  if (logs.length || st.problems.length) {
    failed = true;
    console.error('PROBLEMS:\n' + [...logs, ...st.problems].join('\n'));
  }
} finally {
  await browser.close();
  await srv.close();
}
process.exit(failed ? 1 : 0);
