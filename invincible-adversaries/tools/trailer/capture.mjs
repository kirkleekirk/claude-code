// node capture.mjs <outDir> <shotIdsCsv|all> [--preview N] [--audio name]
// Renders the listed shots through the game, piping 1080p frames into one H.264 file per shot.
// The game must be served (npm start); GAME_URL overrides http://localhost:5173/.
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
const args = process.argv.slice(2);
const out = args[0], which = args[1];
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const preview = +opt('--preview', 0);
const audioName = opt('--audio', null);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: preview ? 0.75 : 1.5 });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text().slice(0, 240)); });
page.on('pageerror', (e) => logs.push('pageerror: ' + e.message + ' ' + (e.stack || '').split('\n').slice(0, 3).join(' | ')));
const GAME = process.env.GAME_URL || 'http://localhost:5173/';
await page.goto(`${GAME}?manual&capture&quality=${preview ? 'medium' : 'high'}`);
await page.waitForFunction(() => window.__game && window.__game.state === 'title', null, { timeout: 240000 });
await page.addScriptTag({ path: path.join(path.dirname(new URL(import.meta.url).pathname), 'director.js') });
await page.waitForFunction(() => window.TR && window.TR.ready, null, { timeout: 30000 });
const list = await page.evaluate(() => TR.list());
const total = await page.evaluate(() => TR.total);
if (audioName) await page.evaluate((t) => TR.initAudio(t + 1.5), total);
const ids = which === 'all' ? list.map((s) => s.id) : which.split(',');
const sel = list.filter((s) => ids.includes(s.id)).sort((a, b) => a.t0 - b.t0);
console.log('total', total.toFixed(2), 's; shots', sel.map((s) => s.id).join(' '));
for (const s of sel) {
  const t0 = Date.now();
  const info = await page.evaluate((i) => TR.begin(i), s.i);
  let ff = null;
  if (!preview) {
    ff = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', '30', '-c:v', 'mjpeg', '-i', '-',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '13', '-pix_fmt', 'yuv420p', '-r', '30', path.join(out, `${String(s.i).padStart(2, '0')}_${s.id}.mp4`)], { stdio: ['pipe', 'inherit', 'inherit'] });
  }
  for (let f = 0; f < info.frames; f++) {
    const cap = !preview || f % preview === 0 || f === info.frames - 1;
    await page.evaluate(([f, cap]) => TR.frame(f, cap), [f, cap]);
    if (preview) {
      if (f % preview === 0 || f === info.frames - 1) await page.screenshot({ path: path.join(out, `${String(s.i).padStart(2, '0')}_${s.id}_${String(f).padStart(3, '0')}.jpg`), type: 'jpeg', quality: 80 });
    } else {
      const buf = await page.screenshot({ type: 'jpeg', quality: 95 });
      if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    }
  }
  if (ff) { ff.stdin.end(); await new Promise((r) => ff.on('close', r)); }
  console.log(`shot ${s.i} ${s.id}: ${info.frames} frames in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
if (audioName) {
  const a = await page.evaluate(() => TR.renderAudio());
  const pcm = Buffer.from(a.b64, 'base64');
  const hdr = Buffer.alloc(44);
  hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + pcm.length, 4); hdr.write('WAVE', 8); hdr.write('fmt ', 12);
  hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(2, 22); hdr.writeUInt32LE(a.sr, 24); hdr.writeUInt32LE(a.sr * 4, 28); hdr.writeUInt16LE(4, 32); hdr.writeUInt16LE(16, 34);
  hdr.write('data', 36); hdr.writeUInt32LE(pcm.length, 40);
  fs.writeFileSync(path.join(out, audioName), Buffer.concat([hdr, pcm]));
  console.log('audio written', audioName, (pcm.length / 4 / a.sr).toFixed(2), 's');
}
console.log(logs.slice(0, 30).join('\n') || 'no console errors');
await browser.close();
