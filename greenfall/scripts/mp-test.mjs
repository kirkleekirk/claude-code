// Headless multiplayer test: starts the Greenfall server (wallet + relay), serves dist/, opens
// two browser contexts, hosts a server through the menus with one, finds and joins it from the
// server list with the other, starts the match and checks the shared world stays in sync.
//   npm run build && npm run test:mp
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.error('Playwright is required: npm i -D playwright'); process.exit(1); }

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, '..', 'dist');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff' };
const web = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0]) === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(root) || !fs.existsSync(p)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
}).listen(0);
const webPort = web.address().port;
const apiPort = 18000 + Math.floor(Math.random() * 1000);
const db = path.join(os.tmpdir(), `greenfall-mp-test-${process.pid}.json`);
const srv = spawn(process.execPath, [path.resolve(here, '..', 'server', 'server.mjs')], { env: { ...process.env, PORT: String(apiPort), DB_FILE: db }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));

const fails = [];
const check = (ok, what) => { console.log(`${ok ? '✓' : '✗'} ${what}`); if (!ok) fails.push(what); };
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
const open = async (name) => {
  const ctx = await browser.newContext({ viewport: { width: 800, height: 450 } });
  await ctx.addInitScript((port) => { window.GREENFALL_MP = `http://localhost:${port}`; }, apiPort);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  await page.goto(`http://localhost:${webPort}/?q=low`);
  await page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 180000 });
  await page.evaluate((n) => { window.__game.profile.data.name = n; window.__game.profile.data.settings.matchLength = 'quick'; }, name);
  return page;
};
const poll = (page, fn, arg, ms = 30000) => page.waitForFunction(fn, arg, { timeout: ms, polling: 250 }).then(() => true, () => false);

try {
  const host = await open('Hosty'), cli = await open('Joiner');
  // host through the menus
  await host.evaluate(() => { const ui = window.__game.ui; ui.mp.openBrowser(); ui.mp.openHost(); });
  await host.evaluate(() => [...document.querySelectorAll('.mp-host button')].find((b) => b.textContent === 'Create server').click());
  check(await poll(host, () => !!document.querySelector('.mp-room')), 'host created a server');
  // find it in the list with filters on, and join
  await cli.evaluate(() => window.__game.ui.mp.openBrowser());
  check(await poll(cli, () => [...document.querySelectorAll('.mp-row:not(.mp-head) .mp-name')].some((e) => e.textContent.includes("HOSTY'S SERVER") || e.textContent.includes("Hosty's server"))), 'server shows up in the list');
  await cli.evaluate(() => { const ui = window.__game.ui.mp; ui.filters.q = 'zzz-no-match'; ui.renderList(); });
  check(await cli.evaluate(() => !document.querySelector('.mp-row button')), 'search filter hides non-matching servers');
  await cli.evaluate(() => { const ui = window.__game.ui.mp; ui.filters.q = ''; ui.renderList(); });
  await cli.evaluate(() => [...document.querySelectorAll('.mp-row button')].find((b) => b.textContent === 'Join').click());
  check(await poll(host, () => document.querySelectorAll('.mp-player').length === 2) && await poll(cli, () => document.querySelectorAll('.mp-player').length === 2), 'both players are in the room');
  // start
  await host.evaluate(() => [...document.querySelectorAll('.mp-room button')].find((b) => b.textContent === 'Start match').click());
  check(await poll(host, () => window.__game.inMatch, null, 120000) && await poll(cli, () => window.__game.inMatch, null, 120000), 'match started for both');
  check(await poll(cli, () => [...window.__game.net.puppets.values()].some((p) => p.kind === 'h' && p.seen)), 'joining player sees the host');
  check(await host.evaluate(() => [...window.__game.net.puppets.values()].some((p) => p.kind === 'h')), 'host sees the joining player');
  check(await poll(cli, () => window.__game.match.totalPlayers > 2, null, 30000), 'match info (player count) reaches the joining player');
  // put the joiner next to the host
  const hp = await host.evaluate(() => { const P = window.__game.player; window.__game.match.godMode = false; return [P.pos.x, P.pos.y, P.pos.z]; });
  await cli.evaluate(([x, y, z]) => { const G = window.__game, P = G.player; G.view.buildAround(x, z, 200); P.pos.set(x + 4, y + 0.2, z); P.vel.set(0, 0, 0); }, hp);
  await poll(cli, () => { const h = [...window.__game.net.puppets.values()].find((p) => p.kind === 'h'); return h && h.pos.distanceTo(window.__game.player.pos) < 8; });
  // a zombie the host spawns next to the joiner shows up for the joiner
  await host.evaluate(([x, z]) => window.__game.zombies.spawn(x + 6, z + 2), [hp[0] + 4, hp[2]]);
  check(await poll(cli, () => window.__game.zombies.list.length > 0), 'host zombies appear for the joining player');
  // the host drops an item; the joiner sees it and picks it up; it disappears for the host
  const nid = await host.evaluate(() => { const G = window.__game, P = G.player; return G.inter.dropItem({ id: 'medkit', n: 1, r: 0 }, P.pos.x + 1.5, P.pos.y, P.pos.z).nid; });
  check(await poll(cli, (n) => !!window.__game.inter.items.find((i) => i.nid === n), nid), 'dropped item appears for the other player');
  await cli.evaluate((n) => { const G = window.__game; G.player.pickup(G.inter.items.find((i) => i.nid === n)); }, nid);
  check(await poll(host, (n) => !window.__game.inter.items.find((i) => i.nid === n), nid), 'picked-up item disappears for the host');
  // a door the host opens is open for the joiner
  const door = await host.evaluate(([x, z]) => { const G = window.__game; for (const b of G.inter.nearbyBuildings(x, z, 80)) for (const d of b.rt?.doors || []) if (!d.broken && !d.boarded) { const want = !d.open; G.inter.toggleDoor(d, G.player); return { b: b.id, i: b.rt.doors.indexOf(d), open: want }; } return null; }, [hp[0], hp[2]]);
  if (door) check(await poll(cli, (d) => { const b = window.__game.world.buildings[d.b]; const dd = b.rt?.doors[d.i]; return dd && dd.open === d.open; }, door), 'door state syncs');
  // same building loot everywhere
  const loot = await Promise.all([host, cli].map((p) => p.evaluate(() => window.__game.inter.items.filter((i) => /^L/.test(i.nid)).map((i) => [i.nid, i.id, i.r]))));
  const hm = new Map(loot[0].map(([n, id, r]) => [n, id + r]));
  const shared = loot[1].filter(([n]) => hm.has(n));
  check(shared.length > 10 && shared.every(([n, id, r]) => hm.get(n) === id + r), `building loot identical on both machines (${shared.length} shared items)`);
  // PvP: the joiner shoots the host
  const before = await host.evaluate(() => window.__game.player.health);
  await cli.evaluate(() => { const G = window.__game, P = G.player; P.addItem('m4', 1, 2); P.inv.ammo.a556 = 90; P.equip(P.inv.slots.findIndex((s) => s && s.id === 'm4') + 1); const h = [...G.net.puppets.values()].find((p) => p.kind === 'h'); for (let k = 0; k < 3; k++) { P.ws.cd = 0; G.weapons.fire(P, h.pos.clone().setY(h.pos.y + 1.2), { ads: true }); } });
  check(await poll(host, (b) => window.__game.player.health < b, before), 'shots from one player damage the other');
  // the joiner leaves; the host is told
  await cli.evaluate(() => window.__game.returnToLobby());
  check(await poll(host, () => ![...window.__game.net.puppets.values()].some((p) => p.kind === 'h')), 'host notices when a player leaves');
} catch (e) { fails.push(e.message); console.error('✗', e.message); }

check(errors.length === 0, 'no page errors' + (errors.length ? ':\n  ' + errors.slice(0, 6).join('\n  ') : ''));
await browser.close();
srv.kill(); web.close();
try { fs.unlinkSync(db); } catch (e) { /* ignore */ }
if (fails.length) { console.error(`✗ multiplayer test failed (${fails.length})`); process.exit(1); }
console.log('✓ multiplayer test passed');
