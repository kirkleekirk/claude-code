// Shared helpers for Playwright QA scripts: start a server, open the game with URL flags, wait for
// the harness, capture screenshots, and collect console output. Software WebGL (SwiftShader) is
// used so runs work headless; never trust absolute frame times from it.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer, preview } from 'vite';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const OUT = resolve(ROOT, 'qa/out');

/** Start a dev server (default) or preview the production build (`QA_SERVER=preview`). */
export async function startServer(mode = process.env.QA_SERVER ?? 'dev') {
  if (mode === 'preview') {
    const server = await preview({ root: ROOT, preview: { port: 4317, host: '127.0.0.1', strictPort: false }, logLevel: 'silent' });
    const url = server.resolvedUrls?.local?.[0] ?? 'http://127.0.0.1:4317/';
    return { url, close: () => new Promise((r) => server.httpServer.close(() => r())) };
  }
  // No watcher and no HMR: edits made while a QA run is in flight must never reload the page.
  const server = await createServer({ root: ROOT, server: { port: 5317, host: '127.0.0.1', strictPort: false, hmr: false, watch: null }, logLevel: 'silent' });
  await server.listen();
  const url = server.resolvedUrls?.local?.[0] ?? 'http://127.0.0.1:5317/';
  return { url, close: () => server.close() };
}

export async function launchBrowser() {
  return chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
  });
}

/**
 * Open the game. `query` is a URL query string without the leading `?`.
 * Returns the page and a live array of console/page errors.
 */
export async function openGame(browser, baseUrl, query = 'test=1', viewport = { width: 1280, height: 720 }, scale = 1) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: scale });
  const page = await context.newPage();
  const logs = [];
  page.on('console', (m) => {
    const t = m.type();
    if (t === 'error' || t === 'warning') logs.push(`[${t}] ${m.text()}`);
  });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await page.goto(`${baseUrl}?${query}`);
  await page.waitForFunction(() => globalThis.__HOTHOUSE__?.ready === true, null, { timeout: 180000 });
  return { page, context, logs };
}

/** Call a harness command inside the page. */
export function hh(page, command, ...args) {
  return page.evaluate(([c, a]) => globalThis.__HOTHOUSE__[c](...a), [command, args]);
}

/** Save the canvas (no DOM UI) as a PNG. */
export async function canvasShot(page, file) {
  const dataUrl = await hh(page, 'screenshot');
  const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, buf);
  return file;
}

/** Save the full page (canvas + UI) as a PNG. */
export async function pageShot(page, file) {
  mkdirSync(dirname(file), { recursive: true });
  await page.screenshot({ path: file });
  return file;
}

/**
 * Luminance statistics of the current canvas: mean, percentiles, and the share of crushed blacks
 * and clipped whites. Used to catch blown-out or muddy frames without a human looking.
 */
export async function lumaStats(page) {
  return page.evaluate(() => {
    const src = document.getElementById('game');
    const url = globalThis.__HOTHOUSE__.screenshot();
    return new Promise((resolveStats) => {
      const img = new Image();
      img.onload = () => {
        const w = 256;
        const h = Math.round((256 * img.height) / img.width);
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const g = c.getContext('2d');
        g.drawImage(img, 0, 0, w, h);
        const d = g.getImageData(0, 0, w, h).data;
        const lum = [];
        let sat = 0;
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i] / 255, gg = d[i + 1] / 255, b = d[i + 2] / 255;
          lum.push(0.2126 * r + 0.7152 * gg + 0.0722 * b);
          const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
          sat += mx > 0 ? (mx - mn) / mx : 0;
        }
        lum.sort((a, b) => a - b);
        const n = lum.length;
        const pct = (p) => lum[Math.min(n - 1, Math.floor(n * p))];
        resolveStats({
          mean: lum.reduce((a, b) => a + b, 0) / n,
          p05: pct(0.05), p50: pct(0.5), p95: pct(0.95),
          crushed: lum.filter((v) => v < 0.02).length / n,
          clipped: lum.filter((v) => v > 0.98).length / n,
          saturation: sat / n,
          size: [src.width, src.height],
        });
      };
      img.src = url;
    });
  });
}

export function out(...parts) {
  return resolve(OUT, ...parts);
}
