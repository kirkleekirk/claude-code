// Run a module in the dev server's page context and print what it returns (for measuring assets).
//   node tools/eval.mjs <base url> <file.js>   (the file's default export: async () => value)
// The file is copied under tools/out/ so the dev server resolves its imports.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { copyFileSync, mkdirSync } from 'node:fs';
const [base, file] = process.argv.slice(2);
mkdirSync('tools/out/eval', { recursive: true });
const name = `e${Date.now()}.js`;
copyFileSync(file, `tools/out/eval/${name}`);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`${base}/tools/blank.html`);
const out = await page.evaluate(async (u) => JSON.stringify(await (await import(u)).default(), null, 1), `/tools/out/eval/${name}`);
console.log(out);
await browser.close();
