// Front-end flow QA in real time: click-to-start, the main menu over the attract camera, New
// Game, the title card, the driving HUD, the pause menu and back. Page screenshots (canvas + UI)
// land in qa/out/flow/. Fails on any console error or warning or a missing screen.
// Usage: node qa/flow.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { hh, launchBrowser, out, startServer } from './lib.mjs';

const fails = [];
const report = {};
const server = await startServer();
const browser = await launchBrowser();
/**
 * Page screenshot with the game loop paused on its last frame: under software rendering the
 * compositor cannot capture while every frame redraws the city.
 */
async function shot(page, name) {
  await hh(page, 'advance', 0, true);
  await page.screenshot({ path: out('flow', `${name}.png`), timeout: 120000 });
  await hh(page, 'realtime');
}
const scopes = (page) => page.evaluate(() => [...document.querySelectorAll('[data-scope]')].map((e) => e.getAttribute('data-scope')));
async function waitScope(page, name, timeout = 60000) {
  try {
    await page.waitForFunction((n) => !!document.querySelector(`[data-scope="${n}"]`), name, { timeout });
    return true;
  } catch {
    fails.push(`screen "${name}" never appeared (open: ${(await scopes(page)).join(', ') || 'none'})`);
    return false;
  }
}

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const logs = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  const t0 = Date.now();
  await page.goto(`${server.url}?test=1&frontend=1&time=18.2&gfx=potato`);
  await page.waitForFunction(() => globalThis.__HOTHOUSE__?.ready === true, null, { timeout: 180000 });
  report.loadSeconds = Math.round((Date.now() - t0) / 100) / 10;
  // Frosted-glass panels re-blur the whole frame in software compositing; the look is checked
  // separately in the UI lab shots.
  await hh(page, 'setSetting', 'gfx.uiBlur', false);
  if (await waitScope(page, 'click-to-start')) await shot(page, '01-click-to-start');

  await page.mouse.click(640, 360);
  if (await waitScope(page, 'main-menu')) {
    await page.waitForTimeout(2500);
    await shot(page, '02-main-menu');
  }

  await page.getByText('New game', { exact: true }).first().click();
  if (await waitScope(page, 'new-game')) {
    await page.waitForTimeout(800);
    await shot(page, '03-new-game');
  }

  await page.getByText('Start the season').click();
  if (await waitScope(page, 'title-card', 20000)) {
    await page.waitForTimeout(900);
    await shot(page, '04-title-card');
  }
  await page.waitForFunction(() => !document.querySelector('[data-scope="title-card"]'), null, { timeout: 30000 }).catch(() => fails.push('title card never closed'));
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(2500);
  await page.keyboard.up('KeyW');
  await shot(page, '05-hud-driving');
  const st = await hh(page, 'getState');
  report.stage = st.stage;
  if (st.stage?.stage !== 'play') fails.push(`expected the play stage, got ${JSON.stringify(st.stage)}`);

  await page.keyboard.press('Escape');
  if (await waitScope(page, 'pause', 10000)) {
    await page.waitForTimeout(600);
    await shot(page, '06-pause');
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
  const open = await scopes(page);
  if (open.includes('pause')) fails.push('pause menu did not close on Escape');

  const problems = [...logs, ...st.problems];
  if (problems.length) fails.push(...problems.map((p) => `console: ${p.slice(0, 300)}`));
} finally {
  await browser.close();
  await server.close();
}
report.fails = fails;
mkdirSync(out('flow'), { recursive: true });
writeFileSync(out('flow', 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(fails.length ? 1 : 0);
