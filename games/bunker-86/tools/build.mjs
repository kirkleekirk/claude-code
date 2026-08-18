#!/usr/bin/env node
/* Inline BUNKER '86 into a single self-contained HTML file.
 *
 *   node tools/build.mjs            -> dist/bunker-86.html
 *
 * The multi-file version under games/bunker-86/ is the one you host as a PWA.
 * This bundle is for anywhere that wants exactly one file: an artifact page,
 * an email attachment, a USB stick. It has no service worker and no manifest,
 * so it will not install to a home screen — it just runs.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

// Load order matters: util defines helpers the rest reach for at parse time.
const SCRIPTS = [
  'js/util.js', 'js/data.js', 'js/world.js', 'js/art.js',
  'js/audio.js', 'js/render.js', 'js/horror.js', 'js/sim.js',
  'js/ui.js', 'js/main.js'
];

let html = read('index.html');
const css = read('css/style.css');
const js = SCRIPTS.map((f) => '/* ===== ' + f + ' ===== */\n' + read(f)).join('\n');

html = html
  .replace('<link rel="stylesheet" href="css/style.css">', '<style>\n' + css + '\n</style>')
  .replace(/\n\s*<link rel="manifest"[^>]*>/, '')
  .replace(/\n\s*<link rel="icon"[^>]*>/, '')
  .replace(/\n\s*<link rel="apple-touch-icon"[^>]*>/, '')
  .replace(/\n\s*<script src="js\/[a-z]+\.js"><\/script>/g, '')
  .replace('</body>', '<script>\n' + js + '\n</script>\n</body>');

// The bundle has no sw.js next to it, so do not try to register one.
html = html.replace(
  "navigator.serviceWorker.register('sw.js')",
  "Promise.reject()"
);

mkdirSync(join(root, 'dist'), { recursive: true });
const out = join(root, 'dist', 'bunker-86.html');
writeFileSync(out, html);

const kb = (Buffer.byteLength(html) / 1024).toFixed(1);
console.log('wrote ' + out + '  (' + kb + ' KB)');
if (/<script src="js\//.test(html)) {
  console.error('WARNING: an external script tag survived inlining');
  process.exit(1);
}
