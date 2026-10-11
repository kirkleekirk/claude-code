// The later version's game modes, difficulties, worlds, menus and HUD, in headless Chromium.
//   node tools/checks/modes.mjs <dev server url> <out dir> [extra query, e.g. &nocmz]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';
const [base, out, extra = ''] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text().slice(0, 300)}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack?.split('\n').slice(0, 4).join('\n')}`));
let fails = 0;
const ok = (c, what) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${what}`); if (!c) fails++; };
const waitFor = async (fn, ms = 240000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await page.waitForTimeout(400); } return false; };
const E = (fn, arg) => page.evaluate(fn, arg);
const snap = async (name) => { await E(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); await page.waitForTimeout(300); await page.screenshot({ path: `${out}/${name}.png` }); };
const atMenu = () => waitFor(() => E(() => window.__app?.state === 'menu' && window.__app.menus.visible));
const inGame = () => waitFor(() => E(() => window.__app?.state === 'playing' && window.__app.game?.ready && !window.__app.game.attract));
const helpers = () => E(() => {
  const app = window.__app;
  app.onLockChange = () => {};
  if (app.menus.id === 'title') app.menus.pressStart();
  window.M = {
    id: () => app.menus.cur?.id,
    labels: () => (app.menus.cur?.items || []).map((x) => x.label),
    pick(label) {
      const un = (t) => String(t).replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
      const items = app.menus.cur?.items || [], i = items.findIndex((x) => un(x.label) === label || un(x.label).startsWith(label));
      if (i < 0) throw new Error(`no "${label}" in ${this.labels()}`);
      app.menus.activate(i);
    },
  };
  window.step = (sec, dt = 1 / 30) => { const g = app.game, I = app.input; for (let t = 0; t < sec - 1e-9; t += dt) { g.update(dt, I); I.endFrame(); } };
  window.press = (a) => { const I = app.input; I.down(a); window.step(1 / 30); I.up(a); window.step(1 / 30); };
});

// ---- the one world kept before there were several: into the list -------------------------------
await page.goto(`${base}/?rd=4&q=low${extra}`);
await page.evaluate(() => { try { localStorage.clear(); } catch { /* */ } });
await page.goto(`${base}/?rd=4&q=low${extra}`);
ok(await atMenu(), 'the menus come up');
await helpers();
// an old save: a game's own, as it used to be kept (one Endurance world)
await E(() => window.__app.startEndurance());
ok(await inGame(), 'an Endurance game starts');
const old = await E(async () => {
  const g = window.__app.game, data = g.serialize();
  data.maxDistance = 77;
  await new Promise((resolve) => {
    const req = indexedDB.open('starminer', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('worlds');
    req.onsuccess = () => { const t = req.result.transaction('worlds', 'readwrite'); t.objectStore('worlds').put(data, 'endurance'); t.oncomplete = resolve; };
  });
  localStorage.setItem('starminer.save', JSON.stringify({ day: data.day, days: data.days, maxDistance: 77, savedAt: Date.now(), seed: data.seed }));
  return { seed: data.seed, worlds: window.__app.worlds.length };
});
ok(old.worlds === 0, "an Endurance game isn't kept in the list");
await page.goto(`${base}/?rd=4&q=low${extra}`);
ok(await atMenu(), 'the menus come up again');
await helpers();
const mig = await E(() => ({ worlds: window.__app.worlds.map((w) => ({ name: w.name, seed: w.seed, d: w.maxDistance, creative: w.creative })), old: localStorage.getItem('starminer.save') }));
ok(mig.worlds.length === 1 && mig.worlds[0].seed === old.seed && mig.worlds[0].d === 77 && /^New World /.test(mig.worlds[0].name) && !mig.old, `the old save is a world of its own now (${JSON.stringify(mig.worlds[0])})`);

// ---- the menus: Play Offline, the modes and their descriptions, difficulty, the worlds ----------
const m1 = await E(() => {
  const app = window.__app;
  const main = M.labels();
  M.pick('Play Offline');
  const mode = { id: M.id(), labels: M.labels(), desc: app.menus.screenEl.querySelector('.desc')?.textContent };
  app.menus.select(1);
  mode.desc2 = app.menus.screenEl.querySelector('.desc')?.textContent;
  M.pick('Dragon Endurance');
  const locked = { id: M.id(), title: app.menus.cur.title, sub: app.menus.cur.sub };
  app.menus.back();
  M.pick('Survival');
  const diff = { id: M.id(), labels: M.labels(), sel: app.menus.cur.sel };
  M.pick('Normal');
  const worlds = { id: M.id(), labels: M.labels() };
  return { main, mode, locked, diff, worlds };
});
console.log(JSON.stringify(m1));
ok(m1.main.slice(0, 3).join() === 'Host Online,Join Online,Play Offline', `the main menu: ${m1.main.join(', ')}`);
ok(m1.mode.id === 'mode' && m1.mode.labels.slice(0, 4).join() === 'Endurance,Survival,Dragon Endurance,Creative', 'Choose a Game Mode: the four modes');
ok(/how far you can travel/.test(m1.mode.desc) && /fortress/.test(m1.mode.desc2), 'with the chosen one described beside them');
ok(m1.locked.title === 'Kill Undead Dragon', 'Dragon Endurance is locked till the Undead Dragon is killed');
ok(m1.diff.labels.slice(0, 4).join() === 'No Enemies,Easy,Normal,Hardcore' && m1.diff.sel === 2, 'the difficulties, Normal to start with');
ok(m1.worlds.labels[0] === 'Create World' && m1.worlds.labels.length === 4, `then the worlds: ${m1.worlds.labels.join(', ')}`);
await snap('menu-worlds');

// a new Survival world: kept, and there again next time
await E(() => M.pick('Create World'));
ok(await inGame(), 'a new Survival world starts');
const s1 = await E(async () => {
  const app = window.__app, g = app.game, p = g.player, w = g.world;
  const x = Math.floor(p.pos.x) + 2, z = Math.floor(p.pos.z), y = Math.floor(p.pos.y) + 3;
  w.setBlock(x, y, z, 23);
  await app.autosave();
  const info = { mode: g.mode, difficulty: g.difficulty, creative: g.creative, id: g.worldId, worlds: app.worlds.length, block: [x, y, z], kept: app.worlds.find((v) => v.id === g.worldId)?.name };
  info.min = g.enemies.minSpawnTime(0);
  g.difficulty = 'easy';
  info.minEasy = g.enemies.minSpawnTime(0);
  g.difficulty = 'normal';
  return info;
});
ok(s1.mode === 'survival' && s1.difficulty === 'normal' && !s1.creative && s1.id, `Survival, Normal (${JSON.stringify({ mode: s1.mode, d: s1.difficulty })})`);
ok(s1.worlds === 2 && /'s World |^New World /.test(s1.kept || ''), `kept in the list (${s1.kept})`);
ok(s1.min === 5 && s1.minEasy === 45, `the dead come quickly on Normal, slowly on Easy (${s1.min} s, ${s1.minEasy} s)`);
// the pause menu, and Teleport
const pm = await E(() => {
  const app = window.__app, g = app.game;
  app.pause();
  const items = M.labels();
  M.pick('Teleport');
  const tp = M.labels();
  const before = g.player.pos.clone();
  g.player.pos.y -= 6;
  M.pick('Teleport To Surface');
  return { items, tp, state: app.state, up: g.player.pos.y >= before.y - 1 };
});
ok(pm.items.includes('Teleport') && pm.items.includes('Inventory') && pm.items.includes('Save And Quit'), `the in-game menu: ${pm.items.join(', ')}`);
ok(pm.tp.join() === 'Return To Game,Teleport To Surface,Teleport To Start', `its Teleport menu: ${pm.tp.join(', ')}`);
ok(pm.state === 'playing' && pm.up, 'Teleport To Surface takes you up onto the ground');
await inGame();
// dying in Survival: three seconds, then back at the start
const d1 = await E(() => {
  const g = window.__app.game, p = g.player;
  p.hurt(1000, null, 'test');
  step(0.2);
  const a = g.deathScreen();
  step(3.1);
  const b = g.deathScreen();
  press('accept');
  const sp = g.spawnSpot();
  return { a, b, dead: p.dead, at: Math.hypot(p.pos.x - sp.x, p.pos.z - sp.z) };
});
ok(!d1.a.press && d1.a.lines.length === 0, 'dead in Survival: nothing for three seconds, and no distance shown');
ok(d1.b.press === 'Respawn' && !d1.dead && d1.at < 3, `then press to respawn, at the start (${d1.at.toFixed(1)} m from it)`);
await inGame();
// quit, and the world's there to go back to
await E(() => window.__app.quitToMenu());
ok(await atMenu(), 'Save And Quit goes back to the menu');
await helpers();
await E((name) => { M.pick('Play Offline'); M.pick('Survival'); M.pick('Normal'); M.pick(name); }, s1.kept);
ok(await inGame(), 'the world loads again');
const s2 = await E((b) => { const g = window.__app.game; return { id: g.worldId, block: g.world.getBlock(b[0], b[1], b[2]) }; }, s1.block);
ok(s2.id === s1.id && s2.block === 23, `with the gold wall put there (${s2.block})`);
await E(() => window.__app.quitToMenu());
await atMenu();
await helpers();

// ---- Creative: nothing used up; a normal world goes into Creative only with a yes ---------------
const c1 = await E((name) => {
  M.pick('Play Offline'); M.pick('Creative'); M.pick('Easy');
  const labels = M.labels();
  M.pick(name);
  const dlg = { id: window.__app.menus.cur.id, title: window.__app.menus.cur.title };
  window.__app.menus.back();
  M.pick('Create World');
  return { labels, dlg };
}, s1.kept);
ok(c1.labels.includes(s1.kept), 'in Creative, the other worlds are listed too');
ok(c1.dlg.title === 'Creative Mode', 'and picking one asks first: it would stay a Creative world');
ok(await inGame(), 'a new Creative world starts');
const c2 = await E(async () => {
  const { B } = await import('/src/world/blocks.js');
  const g = window.__app.game, inv = g.inventory, p = g.player, w = g.world;
  // a flat floor round the player, open above
  const x0 = Math.floor(p.pos.x), z0 = Math.floor(p.pos.z), y0 = Math.floor(p.pos.y) - 1;
  for (let dx = -5; dx <= 5; dx++) for (let dz = -5; dz <= 5; dz++) {
    w.setBlock(x0 + dx, y0, z0 + dz, B.BEDROCK);
    for (let y = y0 + 1; y < y0 + 8; y++) if (w.getBlock(x0 + dx, y, z0 + dz) !== B.AIR) w.setBlock(x0 + dx, y, z0 + dz, B.AIR);
  }
  p.pos.set(x0 + 0.5, y0 + 1, z0 + 0.5); p.vel.set(0, 0, 0);
  inv.slots[0] = inv.make('dirt', 5); inv.select(0); g.cooldown = 0;
  step(0.3);
  // aim at the top of the floor two blocks ahead and put one down
  const e = p.eye, tx = x0 + 0.5, tz = z0 - 1.5, ty = y0 + 1;
  const dx = tx - e.x, dy = ty - e.y, dz = tz - e.z, l = Math.hypot(dx, dy, dz);
  p.yaw = Math.atan2(-dx, -dz); p.pitch = Math.asin(dy / l);
  const placed0 = g.stats.placed;
  press('primary');
  step(0.3);
  return { creative: g.creative, infinite: inv.infinite, count: inv.slots[0]?.count, placed: g.stats.placed - placed0 };
});
ok(c2.creative && c2.infinite, 'Creative: the game and its inventory know it');
ok(c2.placed === 1 && c2.count === 5, `a block put down isn't used up (${c2.placed} placed, ${c2.count} left)`);
await E(() => window.__app.quitToMenu());
await atMenu();
await helpers();

// ---- Endurance: never kept; dead, it starts over ------------------------------------------------
const e0 = await E(() => window.__app.worlds.length);
await E(() => { M.pick('Play Offline'); M.pick('Endurance'); });
ok(await inGame(), 'Endurance starts straight away');
const e1 = await E(async () => {
  const app = window.__app, g = app.game, p = g.player;
  await app.autosave();
  const kept = app.worlds.length;
  g.maxDistance = 140;
  app.sky.setTime(0.6, 3);
  step(0.1);
  p.hurt(1000, null, 'test');
  step(3.3);
  const scr = g.deathScreen();
  press('accept');
  return { kept, scr, dead: p.dead, max: g.maxDistance, day: g.dayNumber, pause: (() => { app.pause(); const l = M.labels(); app.resume(); return l; })() };
});
ok(e1.kept === e0, "an Endurance world isn't kept");
ok(e1.scr.lines[0] === 'Distance Traveled: 140' && /Day/.test(e1.scr.lines[1]) && e1.scr.press === 'Restart', `dead in Endurance: how far, how long, and Restart (${JSON.stringify(e1.scr)})`);
ok(!e1.dead && e1.max < 40 && e1.day === 1, `restarting: alive at the start, back to the first day, with nothing travelled (${JSON.stringify({ dead: e1.dead, max: e1.max, day: e1.day })})`);
ok(!e1.pause.includes('Teleport') && e1.pause.includes('Main Menu'), `no Teleport in Endurance, and Main Menu (${e1.pause.join(', ')})`);
// the awards count only here
const a1 = await E(() => {
  const app = window.__app, g = app.game, A = app.awards;
  const k0 = A.total('kills');
  g.stats.kills += 3;
  app.awards.t = 0;
  step(0.6);
  return { n: (window.__AW = null, 0), k: A.total('kills') - k0 };
});
ok(a1.k === 3, `kills in Endurance count for the awards (${a1.k})`);
await E(() => window.__app.quitToMenu());
await atMenu();
await helpers();

// ---- Hardcore: nothing to start with; No Enemies: no one comes -------------------------------
await E(() => { M.pick('Play Offline'); M.pick('Survival'); M.pick('Hardcore'); M.pick('Create World'); });
ok(await inGame(), 'a Hardcore world starts');
const h1 = await E(() => {
  const app = window.__app, g = app.game;
  const items = g.inventory.slots.filter(Boolean).length;
  app.pause();
  const menu = M.labels();
  app.resume();
  const k0 = app.awards.total('kills');
  g.stats.kills += 2;
  app.awards.t = 0;
  step(0.6);
  return { items, menu, k: app.awards.total('kills') - k0 };
});
ok(h1.items === 0, 'Hardcore: you start with nothing');
ok(!h1.menu.includes('Teleport'), 'and there is no Teleport');
ok(h1.k === 0, "kills outside Endurance don't count for the awards");
await E(() => window.__app.quitToMenu());
await atMenu();
await helpers();
await E(() => { M.pick('Play Offline'); M.pick('Survival'); M.pick('No Enemies'); M.pick('Create World'); });
ok(await inGame(), 'a No Enemies world starts');
const n1 = await E(() => {
  const app = window.__app, g = app.game;
  app.sky.setTime(0.95, 2);
  g.dragons.nextAllowed = 0; g.dragons.distIndex = 0;
  const p = g.player.pos, was = p.clone();
  p.x += 150;
  step(1 / 30);
  p.copy(was);
  step(40);
  return { enemies: g.enemies.list.length, dragon: !!g.dragons.client };
});
ok(n1.enemies === 0 && !n1.dragon, `No Enemies: no one comes, night or not, and no dragons (${n1.enemies})`);
await E(() => window.__app.quitToMenu());
await atMenu();
await helpers();

// ---- Dragon Endurance: unlocked by the Undead Dragon; wave after wave -------------------------
const de = await E(() => {
  const app = window.__app;
  app.awards.data.totals.undeadDragonKills = 1;
  M.pick('Play Offline');
  const lbl = app.menus.cur.items.find((x) => x.label === 'Dragon Endurance');
  M.pick('Dragon Endurance');
  return { small: lbl.small, id: M.id() };
});
ok(de.small === '' && de.id === 'worlds', 'with the Undead Dragon killed, Dragon Endurance opens');
await E(() => M.pick('Create World'));
ok(await inGame(), 'a Dragon Endurance world starts');
const de1 = await E(() => {
  const g = window.__app.game, D = g.dragons;
  step(1);
  const first = D.client ? { type: D.client.type, health: D.client.health } : null;
  const surface = !g.enemies.list.length;
  // shoot it down
  D.client?.takeDamage({ enemyDamage: 100 }, D.myId);
  for (let k = 0; k < 600 && D.client; k++) step(0.1);
  const gone = !D.client, wait = D.enduranceT - D.t;
  D.enduranceT = D.t;
  step(0.5);
  const second = D.client ? { type: D.client.type, health: D.client.health } : null;
  return { first, surface, gone, wait, second, mode: g.mode };
});
console.log(JSON.stringify(de1));
ok(de1.mode === 'dragon' && de1.first?.type === 0 && de1.first.health === 25, `the first wave: a Fire Dragon, 25 of health (${JSON.stringify(de1.first)})`);
ok(de1.gone && de1.wait > 9 && de1.wait <= 30, `shot down, the next comes 10 to 30 s on (${de1.wait?.toFixed(1)})`);
ok(de1.second?.type === 1 && de1.second.health === 110, `a Forest Dragon, 100 tougher (less 15 for the kill: ${JSON.stringify(de1.second)})`);
await E(() => window.__app.quitToMenu());
await atMenu();
await helpers();

// ---- the HUD: red as you're hurt, an arrow to what did it --------------------------------------
await E(() => { M.pick('Play Offline'); M.pick('Survival'); M.pick('Easy'); M.pick('Create World'); });
await inGame();
const hud = await E(() => {
  const g = window.__app.game, p = g.player, h = g.hud;
  const from = p.pos.clone(); from.x += 5;
  p.hurt(30, from, 'test');
  step(0.1);
  const r = { red: parseFloat(h.redEl.style.opacity), arrows: h.arrows.length, t: h.arrowsEl.firstChild?.style.transform };
  step(3.2);
  r.after = h.arrows.length;
  return r;
});
ok(Math.abs(hud.red - 0.47 * 0.3) < 0.02, `hurt by 30, the screen goes a little red (${hud.red})`);
ok(hud.arrows === 1 && /rotate/.test(hud.t || '') && hud.after === 0, `and an arrow points to what did it, for three seconds (${hud.t})`);
await snap('hud-hurt');
await E(() => window.__app.quitToMenu());
await atMenu();
await helpers();

// ---- Options: Release Notes, Erase Storage ------------------------------------------------------
const op = await E(async () => {
  const app = window.__app;
  M.pick('Options');
  const labels = M.labels();
  M.pick('Release Notes');
  const notes = app.menus.screenEl.textContent.length;
  app.menus.back();
  M.pick('Erase Storage');
  const dlg = app.menus.cur.title;
  M.pick('Yes');
  for (let k = 0; k < 50 && app.worlds.length; k++) await new Promise((r) => setTimeout(r, 200));
  return { labels, notes, dlg, worlds: app.worlds.length, aw: Object.keys(app.awards.data.unlocked).length + Object.keys(app.awards.data.totals).length };
});
ok(op.labels.includes('Release Notes') && op.labels.includes('Erase Storage') && op.labels.includes('Brightness'), 'Options: Brightness, Release Notes, Erase Storage');
ok(op.notes > 400, 'the release notes');
ok(op.dlg === 'Erase Storage' && op.worlds === 0 && op.aw === 0, `Erase Storage asks, then every world and award is gone (${op.worlds}, ${op.aw})`);

console.log(logs.length ? logs.slice(0, 15).join('\n') : 'no errors');
console.log(fails ? `${fails} FAILED` : 'all ok');
await browser.close();
process.exit(fails ? 1 : 0);
