// Icon contact sheet: every icon at 48 px (cream) and 24 px (lime) on ink, for visual review.
// Usage: node qa/ui-icons.mjs  →  qa/out/ui/icons.png
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'qa/out/ui/icons.png');
const { ICON_PATHS } = await import(pathToFileURL(resolve(ROOT, 'src/ui/icons/paths.ts')).href);
const names = Object.keys(ICON_PATHS);

const svg = (n, size) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS[n]}</svg>`;
const cell = (n) => `<div class="c">${svg(n, 48)}<div class="s">${svg(n, 24)}${svg(n, 16)}</div><span>${n}</span></div>`;
const html = `<!doctype html><html><body><div class="g">${names.map(cell).join('')}</div>
<style>
body{margin:0;background:#140B33;color:#FFF4E3;font:12px system-ui}
.g{display:grid;grid-template-columns:repeat(12,1fr);gap:6px;padding:10px}
.c{display:flex;flex-direction:column;align-items:center;gap:6px;padding:10px 2px 8px;background:#1F1450;border-radius:10px}
.s{display:flex;gap:8px;align-items:center;color:#B8F54A}
span{font-size:11px;opacity:.8}
</style></body></html>`;

mkdirSync(dirname(OUT), { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 1 });
await page.setContent(html);
await page.screenshot({ path: OUT, fullPage: true });
await browser.close();
console.log(`${names.length} icons → ${OUT}`);
