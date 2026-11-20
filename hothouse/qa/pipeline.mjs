// Pipeline regression: renders the sandbox at key times of day and weathers, writes PNGs and
// luminance stats, and fails on any console error or logged problem.
import { writeFileSync } from 'node:fs';
import { canvasShot, hh, launchBrowser, lumaStats, openGame, out, startServer } from './lib.mjs';

const CASES = [
  ['dawn', 6.4, 'clear'], ['morning', 9.5, 'clear'], ['midday', 13, 'clear'], ['golden', 17.3, 'clear'],
  ['lategold', 18.67, 'clear'], ['dusk', 19.9, 'clear'], ['night', 23, 'clear'], ['rain', 18.2, 'rain'], ['storm', 15, 'storm'],
];

const server = await startServer();
const browser = await launchBrowser();
let failed = false;
try {
  const { page, logs } = await openGame(browser, server.url, `test=1&sandbox=pipeline&${process.env.QA_QUERY ?? ''}`);
  const report = {};
  for (const [name, hours, weather] of CASES) {
    await hh(page, 'setWeather', weather);
    await hh(page, 'setTime', hours);
    await hh(page, 'advance', 0.5);
    const file = await canvasShot(page, out('pipeline', `${name}.png`));
    report[name] = await lumaStats(page);
    console.log(`${name.padEnd(9)} mean ${report[name].mean.toFixed(3)} p05 ${report[name].p05.toFixed(3)} p95 ${report[name].p95.toFixed(3)} sat ${report[name].saturation.toFixed(2)} → ${file}`);
  }
  const state = await hh(page, 'getState');
  const perf = await hh(page, 'perfSnapshot');
  writeFileSync(out('pipeline', 'report.json'), JSON.stringify({ report, state, perf }, null, 2));
  console.log(`draws ${perf.render.drawCalls} tris ${perf.render.triangles} programs ${perf.render.programs}`);
  if (logs.length || state.problems.length) {
    failed = true;
    console.error('PROBLEMS:\n' + [...logs, ...state.problems].join('\n'));
  }
} finally {
  await browser.close();
  await server.close();
}
process.exit(failed ? 1 : 0);
