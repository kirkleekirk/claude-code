// Headless smoke test: serves dist/, boots the game in Chromium (software WebGL), starts a
// Quick match and fast-forwards the simulation through the drop, the riverboat and the
// helicopter phase. Fails on any page error.
//   npm run build && npm run test:smoke
import http from 'http';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.error('Playwright is required: npm i -D playwright && npx playwright install chromium'); process.exit(1); }

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'dist');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0]) === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(root) || !fs.existsSync(p)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
}).listen(0);
const port = server.address().port;

const errors = [];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`http://localhost:${port}/?q=low`);
await page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 180000 });
console.log('✓ booted to lobby');
await page.evaluate(() => window.__game.startMatch('quick'));
await page.waitForFunction(() => window.__game.inMatch, null, { timeout: 120000 });
console.log('✓ match started');
const report = await page.evaluate(() => {
  const G = window.__game;
  G.renderer.setAnimationLoop(null);
  const sim = (secs) => { for (let i = 0; i < secs * 20; i++) { G.tick(0.05); G.updateEnv(0.05); G.hud.update(0.05); G.frame++; } };
  const P = G.player;
  G.match.godMode = true; // the test player has no hands on the keyboard
  sim(15);
  P.jumpFromPlane();
  sim(60);
  const landed = P.mode;
  G.match.elapsed = G.match.preset.duration * 0.46; sim(240);
  const boat = G.match.boatState;
  G.match.elapsed = G.match.preset.duration; sim(30);
  const heli = G.match.heliState;
  return { landed, boat, heli, alive: G.match.aliveCount, zombies: G.zombies.count, hordes: G.hordes.list.length };
});
console.log('✓ simulated', JSON.stringify(report));
await browser.close();
server.close();
if (errors.length) { console.error('✗ page errors:\n' + errors.join('\n')); process.exit(1); }
if (report.landed !== 'ground') { console.error('✗ player did not land: ' + report.landed); process.exit(1); }
if (report.heli === 'none') { console.error('✗ helicopter never triggered'); process.exit(1); }
console.log('✓ smoke test passed');
