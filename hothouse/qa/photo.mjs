// Photo Mode QA: open it over play, try depth of field and the grades, capture (watermarked), and
// leave with the clock and camera restored. Saves canvas shots to qa/out/photo/.
// Usage: node qa/photo.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { canvasShot, hh, launchBrowser, openGame, out, startServer } from './lib.mjs';

const fails = [];
const report = {};
const server = await startServer();
const browser = await launchBrowser();
try {
  const { page, logs } = await openGame(browser, server.url, 'test=1&time=18.4');
  await hh(page, 'spawnVehicle', 'palmera', -768, 150, 0.35);
  await hh(page, 'advance', 1.5, false);
  const before = await hh(page, 'getState');
  report.opened = await hh(page, 'photoMode');
  if (!report.opened) fails.push('photo mode did not open');
  await hh(page, 'advance', 0.1, true);
  const panel = await page.evaluate(() => !!document.querySelector('.hh-photo, [data-layer="photoMode"], [class*="photo"]'));
  report.panel = panel;
  const looks = [
    ['plain', { grade: 'none', dof: false }],
    ['golden-dof', { grade: 'golden', dof: true, focusDistance: 6, aperture: 0.8, exposure: 0.3 }],
    ['noir', { grade: 'noir', dof: false, exposure: 0 }],
    ['neon-night', { grade: 'neon', timeOfDay: 21.5 }],
  ];
  for (const [name, set] of looks) {
    for (const [k, v] of Object.entries(set)) await hh(page, 'photoSet', k, v);
    await hh(page, 'advance', 0.05, true);
    await canvasShot(page, out('photo', `${name}.png`));
  }
  report.captureBytes = await hh(page, 'photoCapture');
  if (!(report.captureBytes > 10000)) fails.push(`capture too small: ${report.captureBytes} bytes`);
  await hh(page, 'photoExit');
  await hh(page, 'advance', 0.1, true);
  const after = await hh(page, 'getState');
  report.clock = { before: before.clock.hours, after: after.clock.hours };
  if (Math.abs(after.clock.hours - before.clock.hours) > 0.2) fails.push(`clock not restored: ${before.clock.hours} → ${after.clock.hours}`);
  const ses = await hh(page, 'session');
  if (ses.photo) fails.push('photo mode still active after exit');
  const problems = [...logs, ...after.problems];
  if (problems.length) fails.push(...problems.map((p) => `console: ${p.slice(0, 300)}`));
} finally {
  await browser.close();
  await server.close();
}
report.fails = fails;
mkdirSync(out('photo'), { recursive: true });
writeFileSync(out('photo', 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(fails.length ? 1 : 0);
