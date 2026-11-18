// Look-dev capture: renders named shots at chosen times and weathers.
// Usage: node qa/lookdev.mjs [shot:hour:weather ...]   e.g. causeway:18.67:clear strand:20.2:rain
import { writeFileSync } from 'node:fs';
import { canvasShot, hh, launchBrowser, lumaStats, openGame, out, startServer } from './lib.mjs';

const DEFAULT = [
  'causeway:18.67:clear', 'strand:17.4:clear', 'deco:19.9:clear', 'beach:18.4:clear', 'bayfront:18.9:clear',
  'skyline:20.1:clear', 'crown:22.5:rain', 'strand:21.5:rain', 'bayshoreSunset:18.75:clear', 'aerial:17.6:clear',
];
const cases = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT;
const width = Number(process.env.QA_W ?? 1280);
const height = Number(process.env.QA_H ?? 720);

const server = await startServer();
const browser = await launchBrowser();
let failed = false;
try {
  const t0 = Date.now();
  const { page, logs } = await openGame(browser, server.url, `test=1&${process.env.QA_QUERY ?? ''}`, { width, height });
  console.log(`boot ${(Date.now() - t0) / 1000}s`, JSON.stringify(await hh(page, 'worldStats')));
  const report = {};
  for (const c of cases) {
    const [shot, hour, weather = 'clear'] = c.split(':');
    await hh(page, 'setWeather', weather);
    await hh(page, 'setTime', Number(hour));
    await hh(page, 'lookdev', shot, false);
    await hh(page, 'advance', 1.5);
    const name = `${shot}-${hour}-${weather}`;
    const file = await canvasShot(page, out('lookdev', `${name}.png`));
    const stats = await lumaStats(page);
    const perf = await hh(page, 'perfSnapshot');
    report[name] = { ...stats, draws: perf.render.drawCalls, tris: perf.render.triangles };
    console.log(`${name.padEnd(30)} mean ${stats.mean.toFixed(3)} p05 ${stats.p05.toFixed(3)} p95 ${stats.p95.toFixed(3)} sat ${stats.saturation.toFixed(2)} draws ${perf.render.drawCalls} tris ${(perf.render.triangles / 1e6).toFixed(2)}M → ${file}`);
  }
  const state = await hh(page, 'getState');
  writeFileSync(out('lookdev', 'report.json'), JSON.stringify({ report, state }, null, 2));
  if (logs.length || state.problems.length) {
    failed = true;
    console.error('PROBLEMS:\n' + [...logs, ...state.problems].join('\n'));
  }
} finally {
  await browser.close();
  await server.close();
}
process.exit(failed ? 1 : 0);
