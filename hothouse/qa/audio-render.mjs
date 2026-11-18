// Audio QA: renders every sound family offline in Chromium through the real mixer and checks
// levels, broken samples, loudness consistency and engine pitch tracking. Writes
// qa/out/audio/report.json plus a few WAVs for human listening.
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchBrowser, out, startServer } from './lib.mjs';

const server = await startServer();
const browser = await launchBrowser();
let failed = false;
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
  await page.goto(`${server.url}audio-lab.html`);
  await page.waitForFunction(() => globalThis.__AUDIO_LAB__?.ready === true, null, { timeout: 120000 });
  const withWavs = process.env.QA_AUDIO_WAVS !== '0';
  const report = await page.evaluate((w) => globalThis.__AUDIO_LAB__.runReport(w), withWavs);
  const dir = out('audio');
  mkdirSync(dir, { recursive: true });
  for (const [name, b64] of Object.entries(report.wavs)) writeFileSync(`${dir}/${name}.wav`, Buffer.from(b64, 'base64'));
  const { wavs, ...rest } = report;
  writeFileSync(`${dir}/report.json`, JSON.stringify(rest, null, 2));
  for (const c of report.checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name} — ${c.detail}`);
  console.log(`rendered in ${(report.ms / 1000).toFixed(1)} s; ${Object.keys(wavs).length} WAVs → ${dir}`);
  if (report.checks.some((c) => !c.ok)) failed = true;
  if (errors.length) {
    failed = true;
    console.error('CONSOLE:\n' + errors.join('\n'));
  }
} finally {
  await browser.close();
  await server.close();
}
process.exit(failed ? 1 : 0);
