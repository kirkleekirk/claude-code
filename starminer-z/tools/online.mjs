// Two players in headless Chromium: A hosts, B joins by code, and what they share is checked
// (seeing each other, block changes, each other's dead, hits and kills, the clock, leaving and
// coming back, the host ending it). Needs the dev server and a PeerJS server (peer-server.mjs):
//   node tools/peer-server.mjs 9000 &
//   node tools/online.mjs [out dir]       (BASE=dev server URL, PEER=peer=host:port)
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';
const BASE = process.env.BASE || 'http://127.0.0.1:5173/';
const PEER = process.env.PEER || 'peer=127.0.0.1:9000';
const SHOTS = process.argv[2] || 'tools/out';
mkdirSync(SHOTS, { recursive: true });
const extra = process.env.Q || '';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', '--disable-features=WebRtcHideLocalIpsWithMdns'] });
const mk = async (tag) => {
  const ctx = await browser.newContext({ viewport: { width: 800, height: 450 } });
  // (no fonts from the web in here)
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  const page = await ctx.newPage();
  page.logs = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') page.logs.push(`[${tag} ${m.type()}] ${m.text().slice(0, 240)}`); });
  page.on('pageerror', (e) => page.logs.push(`[${tag} pageerror] ${e.message}`));
  return page;
};
const A = await mk('A'), B = await mk('B');
const ok = (c, what) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${what}`); if (!c) process.exitCode = 1; };
const wait = (page, fn, arg, t = 120000) => page.waitForFunction(fn, arg, { timeout: t, polling: 300 });
const T0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - T0) / 1000).toFixed(0)}s]`, ...a);

try {
  await A.goto(`${BASE}?play&${PEER}&rd=4&time=0.45&q=low${extra}`);
  await wait(A, () => window.__game?.ready, null, 240000);
  log('A ready');
  const code = await A.evaluate(async () => { await window.__app.hostOnline(); return window.__game.online?.code; });
  ok(/^[A-Z2-9]{5}$/.test(code || ''), `A hosts with a code (${code})`);

  await B.goto(`${BASE}?${PEER}&rd=4&q=low${extra}`);
  await wait(B, () => window.__app?.state === 'menu', null, 240000);
  log('B at the menu');
  await B.evaluate(() => window.__app.setName('Bea'));
  await B.evaluate((c) => window.__app.joinOnline(c), code);
  await wait(B, () => window.__app.game?.online && window.__app.game.ready, null, 240000);
  log('B joined and loaded');
  const seeds = await Promise.all([A.evaluate(() => window.__game.seed), B.evaluate(() => window.__app.game.seed)]);
  ok(seeds[0] === seeds[1], `same world (seed ${seeds[0]} / ${seeds[1]})`);

  // B stands next to A, A looks at B
  const ap = await A.evaluate(() => { const p = window.__game.player; return { x: p.pos.x, y: p.pos.y, z: p.pos.z, yaw: p.yaw }; });
  await B.evaluate((ap) => {
    const g = window.__app.game, p = g.player;
    p.pos.set(ap.x - Math.sin(ap.yaw) * 4, ap.y + 0.5, ap.z - Math.cos(ap.yaw) * 4);
    p.yaw = ap.yaw + Math.PI;
    g.inventory.select(0);
  }, ap);
  await wait(A, () => window.__game.online.players.size === 1 && [...window.__game.online.players.values()][0].heard);
  await wait(B, () => window.__app.game.online.players.size === 1 && [...window.__app.game.online.players.values()][0].heard);
  // (until A's view of B has caught up)
  // (until A's view of B has caught up with where B has got to: B may still be settling)
  let seen, bp;
  for (let k = 0; k < 20; k++) {
    await A.waitForFunction(() => { const r = [...window.__game.online.players.values()][0]; return r.tag.shown && r.pos.distanceTo(r.target) < 0.5; }, null, { timeout: 30000, polling: 300 }).catch(() => {});
    seen = await A.evaluate(() => { const r = [...window.__game.online.players.values()][0]; return { name: r.name, x: r.pos.x, z: r.pos.z, vis: r.puppet.root.visible, tag: r.tag.shown }; });
    bp = await B.evaluate(() => { const p = window.__app.game.player; return { x: p.pos.x, z: p.pos.z }; });
    if (Math.hypot(seen.x - bp.x, seen.z - bp.z) < 1.5) break;
    await A.waitForTimeout(1000);
  }
  ok(seen.name === 'Bea', `A sees B by name (${seen.name})`);
  ok(Math.hypot(seen.x - bp.x, seen.z - bp.z) < 1.5, `A sees B where B is (${seen.x.toFixed(1)},${seen.z.toFixed(1)} vs ${bp.x.toFixed(1)},${bp.z.toFixed(1)})`);
  ok(seen.vis && seen.tag, `B's avatar and name tag show on A (${seen.vis}, ${seen.tag})`);
  await A.screenshot({ path: `${SHOTS}/mp-a-sees-b.png` });

  // a block B puts down shows up for A, and one A digs out for B
  const spot = await B.evaluate(() => {
    const g = window.__app.game, p = g.player, w = g.world;
    const x = Math.floor(p.pos.x) + 1, z = Math.floor(p.pos.z) + 1, y = w.surfaceY(x, z) + 3;
    const id = w.getBlock(x, y - 3, z);
    w.setBlock(x, y, z, id);
    return { x, y, z, id };
  });
  await wait(A, (s) => window.__game.world.getBlock(s.x, s.y, s.z) === s.id, spot, 20000).then(() => ok(true, `B's block reaches A (id ${spot.id})`), () => ok(false, "B's block reaches A"));
  await A.evaluate((s) => window.__game.world.setBlock(s.x, s.y, s.z, 0), spot);
  await wait(B, (s) => window.__app.game.world.getBlock(s.x, s.y, s.z) === 0, spot, 20000).then(() => ok(true, "A's dig reaches B"), () => ok(false, "A's dig reaches B"));

  // a change far off, where B hasn't the ground loaded, is kept for when B gets there
  await A.evaluate(() => window.__game.world.setBlock(1000, 70, 1000, 1, true));
  await A.evaluate(() => { window.__game.online.blockSet(1000, 70, 1000, 1, 0); });
  // (headless frames are slow: give it time to come through)
  await wait(B, () => { const e = window.__app.game.world.edits.get(`${1000 >> 4},${1000 >> 4}`); return !!e && [...e.values()].includes(1); }, null, 20000)
    .then(() => ok(true, 'a change where B has no ground is kept for later'), () => ok(false, 'a change where B has no ground is kept for later'));

  // one of A's dead shows on B; B shoots it; it dies on A, and the kill is B's
  const zid = await A.evaluate(() => {
    const g = window.__game, p = g.player;
    const x = Math.floor(p.pos.x) + 3.5, z = Math.floor(p.pos.z) + 0.5;
    const e = g.enemies.spawn(0, x, g.world.surfaceY(x, z) + 1.1, z, 0.5);
    return e.nid;
  });
  await wait(B, (n) => [...window.__app.game.enemies.ghosts.values()].some((gh) => gh.nid === n && gh.heard), zid, 20000);
  ok(true, `A's zombie shows on B as a ghost (#${zid})`);
  await A.waitForTimeout(4000);
  const gs = await B.evaluate((n) => { const gh = [...window.__app.game.enemies.ghosts.values()].find((x) => x.nid === n); return { clip: gh.clipName, vis: gh.root.visible, hittable: gh.hittable, x: gh.pos.x, z: gh.pos.z }; }, zid);
  const es = await A.evaluate((n) => { const e = window.__game.enemies.list.find((x) => x.nid === n); return { clip: e.clip.name, x: e.pos.x, z: e.pos.z, state: e.state.name }; }, zid);
  ok(gs.clip === es.clip, `the ghost plays the same clip (${gs.clip} / ${es.clip})`);
  ok(Math.hypot(gs.x - es.x, gs.z - es.z) < 1.5, `the ghost is where the zombie is (${gs.x.toFixed(1)},${gs.z.toFixed(1)} vs ${es.x.toFixed(1)},${es.z.toFixed(1)})`);
  await B.screenshot({ path: `${SHOTS}/mp-b-sees-zombie.png` });
  const kills0 = await B.evaluate(() => window.__app.game.stats.kills);
  await wait(B, (n) => [...window.__app.game.enemies.ghosts.values()].find((x) => x.nid === n)?.hittable, zid, 30000);
  await B.evaluate((n) => { const gh = [...window.__app.game.enemies.ghosts.values()].find((x) => x.nid === n); gh.takeDamage(gh.pos.y + 1, { dmg: 100, type: 0 }); }, zid);
  await wait(A, (n) => window.__game.enemies.list.find((x) => x.nid === n)?.dead ?? true, zid, 20000).then(() => ok(true, "B's shot kills A's zombie"), () => ok(false, "B's shot kills A's zombie"));
  await wait(B, (k) => window.__app.game.stats.kills > k, kills0, 20000).then(() => ok(true, 'and the kill is counted for B'), () => ok(false, 'and the kill is counted for B'));

  // one of B's dead shows on A
  const bz = await B.evaluate(() => {
    const g = window.__app.game, p = g.player;
    const x = Math.floor(p.pos.x) - 2.5, z = Math.floor(p.pos.z) + 0.5;
    return g.enemies.spawn(26, x, g.world.surfaceY(x, z) + 1.1, z, 0.5).nid;
  });
  await wait(A, (n) => [...window.__game.enemies.ghosts.values()].some((gh) => gh.owner === 1 && gh.nid === n && gh.heard), bz, 20000).then(() => ok(true, "B's skeleton shows on A"), () => ok(false, "B's skeleton shows on A"));
  // (it stands still, out of reach, for later: it would kill B meanwhile)
  await B.evaluate((n) => {
    const g = window.__app.game, e = g.enemies.list.find((x) => x.nid === n), p = g.player;
    if (e) { e.pos.set(p.pos.x + 9, e.pos.y, p.pos.z); e.update = () => {}; }
    if (p.dead) g.respawn();
  }, bz);

  // the clock is the host's
  await A.evaluate(() => window.__app.sky.setTime(0.8, 3));
  // (the host sends it every 2 s of its game time, which runs slow in a headless browser)
  await B.waitForFunction(() => window.__app.sky.day === 3, null, { timeout: 90000, polling: 300 }).catch(() => {});
  const clk = await B.evaluate(() => ({ t: window.__app.sky.time, d: window.__app.sky.day }));
  ok(clk.d === 3 && Math.abs(clk.t - 0.8) < 0.01, `B's clock follows the host's (day ${clk.d}, ${clk.t.toFixed(3)})`);

  // B swings: A's view of B starts the use clip
  const u0 = await A.evaluate(() => [...window.__game.online.players.values()][0].uses);
  await B.evaluate(() => { const g = window.__app.game; g.viewModel.startSwing('tool', 0.34); g.uses++; });
  await wait(A, (u) => [...window.__game.online.players.values()][0].uses !== u, u0, 10000).then(() => ok(true, "B's swing reaches A"), () => ok(false, "B's swing reaches A"));

  // B fires: the bullet flies on A's machine too
  const bState = await B.evaluate(() => {
    // (headless, the mouse is never held, so the game pauses itself: back to it, and stay)
    const app = window.__app;
    app.onLockChange = () => {};
    const was = app.state;
    if (app.state === 'paused') app.resume();
    const g = app.game, inv = g.inventory;
    inv.slots[6] = inv.make('pistol', 1); inv.select(6);
    g.player.pitch = 0.3;
    return was;
  });
  // (once it's in hand: taking it out holds the trigger back a moment of game time, and the
  // game runs slow in here)
  await wait(B, () => window.__app.game.cooldown <= 0 && window.__app.game.lastSelected === 6, null, 30000).catch(() => {});
  await A.evaluate(() => { const o = window.__game.online, f = o.remoteShot.bind(o); window.__shots = 0; o.remoteShot = (...a) => { window.__shots++; return f(...a); }; });
  await B.evaluate(() => { const I = window.__app.input; window.__s0 = window.__app.game.stats.shots; I.down('primary'); setTimeout(() => I.up('primary'), 600); });
  await wait(A, () => window.__game.projectiles.bullets.length > 0, null, 20000).then(() => ok(true, `B's bullet flies on A's machine (B was ${bState})`), async () => {
    const b = await B.evaluate(() => { const app = window.__app, g = app.game; return { shots: g.stats.shots - window.__s0, held: g.inventory.held?.id, mag: g.inventory.held?.mag, state: app.state, cd: g.cooldown, dead: g.player.dead, ready: g.ready, paused: g.paused, menu: app.menuOpen, vis: app.menus.visible, mid: app.menus.id, screen: g.screenUp, death: g.deathShown }; });
    const a = await A.evaluate(() => ({ got: window.__shots, bullets: window.__game.projectiles.bullets.length }));
    ok(false, `B's bullet flies on A's machine (B was ${bState}; B ${JSON.stringify(b)}, A ${JSON.stringify(a)})`);
  });

  // A fills a crate: B has the same in it
  const crate = await A.evaluate(() => {
    const g = window.__game, p = g.player, x = Math.floor(p.pos.x) + 2, z = Math.floor(p.pos.z), y = g.world.surfaceY(x, z) + 1;
    g.world.setBlock(x, y, z, 25);
    const c = g.crates.get(x, y, z);
    c.slots[5] = g.inventory.make('gold', 9);
    g.crates.commit(c);
    return { x, y, z };
  });
  await wait(B, (c) => window.__app.game.crates.get(c.x, c.y, c.z, false)?.slots[5]?.id === 'gold', crate, 20000).then(() => ok(true, "what A puts in a crate is in it on B's machine"), () => ok(false, "what A puts in a crate is in it on B's machine"));

  // A lights TNT: it flashes on B's machine
  const tnt = await A.evaluate(() => {
    const g = window.__game, p = g.player, x = Math.floor(p.pos.x) - 6, z = Math.floor(p.pos.z) - 6, y = g.world.surfaceY(x, z) + 1;
    g.world.setBlock(x, y, z, 32);
    g.explosives.light(x, y, z);
    return { x, y, z };
  });
  await wait(B, () => window.__app.game.explosives.flashes.size > 0, null, 20000).then(() => ok(true, "A's lit TNT flashes on B's machine"), () => ok(false, "A's lit TNT flashes on B's machine"));
  // (four seconds of the host's game time: slow in here)
  await wait(B, (t) => window.__app.game.world.getBlock(t.x, t.y, t.z) === 0, tnt, 240000).then(() => ok(true, "and when it goes off, it's gone there too"), () => ok(false, "and when it goes off, it's gone there too"));

  // A's grenade goes off by B's skeleton: it dies on B's machine, and the kill is A's
  const kA = await A.evaluate(() => window.__game.stats.kills);
  const sk = await B.evaluate((n) => {
    const g = window.__app.game, e = g.enemies.list.find((x) => x.nid === n), p = g.player;
    if (!e) return null;
    e.health = 2;
    return { x: e.pos.x, y: e.pos.y, z: e.pos.z };
  }, bz);
  if (sk) {
    await A.waitForTimeout(1500);
    await A.evaluate((s) => { const g = window.__game; g.explosives.blast(new g.player.pos.constructor(s.x, s.y + 0.5, s.z), 4, 'grenade', true); }, sk);
    await wait(B, (n) => window.__app.game.enemies.list.find((x) => x.nid === n)?.dead ?? true, bz, 30000).then(() => ok(true, "A's grenade kills B's skeleton on B's machine"), () => ok(false, "A's grenade kills B's skeleton on B's machine"));
    await wait(A, (k) => window.__game.stats.kills > k, kA, 30000).then(() => ok(true, 'and the kill is counted for A'), () => ok(false, 'and the kill is counted for A'));
  } else ok(false, "B's skeleton is still there to blow up");

  // A's dragon: B sees it; B's shot hurts it on both machines; B's kill, and B's loot
  const freeze = (g, at) => {
    const b = g.dragons.brain;
    b.change = () => {}; b.state = { update() {} };
    b.pos.set(at.x, at.y, at.z); b.velocity = b.targetVelocity = 0; b.targetAltitude = at.y; b.orient();
  };
  const above = await B.evaluate(() => { const p = window.__app.game.player; if (p.dead) window.__app.game.respawn(); return { x: p.pos.x + 6, y: p.pos.y + 24, z: p.pos.z + 6 }; });
  await A.evaluate(([fz, at]) => { const g = window.__game; g.dragons.spawnDragon(0, true); new Function('g', 'at', `(${fz})(g, at)`)(g, at); }, [freeze.toString(), above]);
  await wait(B, () => window.__app.game.dragons.client?.got, null, 60000).then(() => ok(true, "A's dragon flies on B's machine"), () => ok(false, "A's dragon flies on B's machine"));
  const dpos = await Promise.all([A.evaluate(() => window.__game.dragons.brain.pos.toArray()), B.evaluate(() => window.__app.game.dragons.client.pos.toArray())]);
  ok(Math.hypot(dpos[0][0] - dpos[1][0], dpos[0][1] - dpos[1][1], dpos[0][2] - dpos[1][2]) < 1, 'where A flies it');
  const bShot = async (gun) => B.evaluate((gun) => {
    const g = window.__app.game, c = g.dragons.client, eye = g.player.eye, it = window.__ITEMS[gun];
    const d = c.pos.clone().sub(eye).normalize();
    g.fire(it, eye, eye, [d], true, g.online.myId);
    g.online.shot(it.id, eye, eye, [d]);
  }, gun);
  await B.evaluate(async () => { window.__ITEMS = (await import('/src/items/items.js')).ITEMS; window.__ITEMS.pistol.inaccuracy = 0; });
  await bShot('pistol');
  await wait(A, () => window.__game.dragons.client.health < 20, null, 60000).catch(() => {});
  const hp = await Promise.all([A.evaluate(() => window.__game.dragons.client.health), B.evaluate(() => window.__app.game.dragons.client.health)]);
  ok(Math.abs(hp[0] - 19.7) < 1e-6 && Math.abs(hp[1] - 19.7) < 1e-6, `B's bullet hurts it on both machines (${hp.join(' / ')})`);
  await Promise.all([A.evaluate(() => { window.__game.dragons.client.health = 0.2; }), B.evaluate(() => { window.__app.game.dragons.client.health = 0.2; })]);
  await bShot('pistol');
  await wait(A, () => window.__game.dragons.client?.dead ?? true, null, 60000).then(() => ok(true, "B's shot kills it, on A's machine too"), () => ok(false, "B's shot kills it, on A's machine too"));
  await wait(B, () => !window.__app.game.dragons.client, null, 240000).catch(() => {});
  const loot = await Promise.all([A.evaluate(() => window.__game.drops.list.filter((d) => d.id === 'explosive_powder').length), B.evaluate(() => window.__app.game.drops.list.filter((d) => d.id === 'explosive_powder').length)]);
  ok(loot[0] === 0 && loot[1] >= 2, `what it leaves is B's (A ${loot[0]}, B ${loot[1]} explosive powder)`);

  // A's dragon's fireball, at B: it goes off on B's machine and hurts B there
  await A.evaluate(() => { const g = window.__game; g.dragons.nextAllowed = 0; g.dragons.pending = false; });
  await A.evaluate(([fz, at]) => { const g = window.__game; g.dragons.spawnDragon(3, true); new Function('g', 'at', `(${fz})(g, at)`)(g, at); }, [freeze.toString(), above]);
  await wait(B, () => window.__app.game.dragons.client?.got, null, 60000).catch(() => {});
  await B.evaluate(() => { const p = window.__app.game.player; window.__hurt = []; const h = p.hurt.bind(p); p.hurt = (a, f, k) => { window.__hurt.push(k); return h(a, f, k); }; });
  await A.evaluate(() => { window.__fbs = 0; const D = window.__game.dragons, f = D.detonateFireball.bind(D); D.detonateFireball = (...a) => { window.__fbs++; return f(...a); }; });
  await A.evaluate(() => { const g = window.__game, r = [...g.online.players.values()][0], b = g.dragons.brain; b.shootTarget.set(r.pos.x, r.pos.y + 1, r.pos.z); b.shotPending = true; });
  await wait(B, () => window.__hurt.includes('fireball'), null, 60000).then(() => ok(true, "A's dragon's iceball hits B on B's machine"), async () => {
    const s = await Promise.all([A.evaluate(() => ({ fbs: window.__fbs, n: window.__game.dragons.fireballs.length })), B.evaluate(() => ({ n: window.__app.game.dragons.fireballs.length, hurt: window.__hurt }))]);
    ok(false, `A's dragon's iceball hits B on B's machine (${JSON.stringify(s)})`);
  });

  // A hands it to B (it's after B, far off): B flies it from then on, A still sees it
  await A.evaluate(() => { const g = window.__game, D = g.dragons, r = [...g.online.players.values()][0]; D.migrate(D.brain, { id: r.id, obj: r, local: false }); });
  await wait(B, () => !!window.__app.game.dragons.brain, null, 30000).then(() => ok(true, 'the dragon goes to B to fly'), () => ok(false, 'the dragon goes to B to fly'));
  await B.evaluate(([fz, at]) => { const g = window.__app.game; new Function('g', 'at', `(${fz})(g, at)`)(g, at); }, [freeze.toString(), { ...above, y: above.y + 6 }]);
  await wait(A, (y) => Math.abs(window.__game.dragons.client.pos.y - y) < 0.5, above.y + 6, 60000).then(() => ok(true, "A sees it where B flies it"), () => ok(false, 'A sees it where B flies it'));
  const brains = await A.evaluate(() => !!window.__game.dragons.brain);
  ok(!brains, "and A doesn't fly it any more");
  await B.evaluate(() => window.__app.game.dragons.removeDragon());
  await wait(A, () => !window.__game.dragons.client, null, 30000).then(() => ok(true, 'gone, on both'), () => ok(false, 'gone, on both'));

  // B leaves: A keeps B's things; B comes back and has them
  await B.evaluate(() => { const inv = window.__app.game.inventory; inv.slots[7] = inv.make('diamond', 7); });
  await B.evaluate(() => window.__app.leaveOnline());
  await wait(A, () => window.__game.online.players.size === 0, null, 20000).then(() => ok(true, 'A sees B leave'), () => ok(false, 'A sees B leave'));
  const kept = await A.evaluate(() => window.__game.guests.Bea?.inventory?.slots?.[7]);
  ok(kept && kept.id === 'diamond' && kept.count === 7, `A keeps what B had (${JSON.stringify(kept)})`);
  await wait(B, () => window.__app.state === 'menu', null, 240000);
  // (a dragon up when B comes back: B sees it from the start)
  await A.evaluate(() => { const D = window.__game.dragons; D.nextAllowed = 0; D.pending = false; D.spawnDragon(2, false); });
  await B.evaluate((c) => window.__app.joinOnline(c), code);
  await wait(B, () => window.__app.game?.online && window.__app.game.ready, null, 240000);
  const back = await B.evaluate(() => window.__app.game.inventory.slots[7]);
  ok(back && back.id === 'diamond' && back.count === 7, 'B has it back on rejoining');
  const joined = await B.evaluate(() => window.__app.game.dragons.client?.type ?? null);
  ok(joined === 2, `joining with a dragon up, B has it too (${joined})`);
  await A.evaluate(() => window.__game.dragons.removeDragon());

  // the host saves, and B's things are in the save
  await A.evaluate(() => window.__app.autosave());
  const saved = await A.evaluate(async () => { const { loadGame } = await import('/src/game/save.js'); const s = await loadGame(); return !!s?.guests?.Bea; });
  ok(saved, "the host's save holds B's things");

  // the host ends it: B goes back to the menu, told why
  await A.evaluate(() => window.__app.quitToMenu());
  await wait(B, () => window.__app.state === 'menu' && window.__app.menus.id === 'notice', null, 240000).then(() => ok(true, 'B is told the host ended the game'), () => ok(false, 'B is told the host ended the game'));
  const note = await B.evaluate(() => window.__app.menus.cur?.sub);
  log('B notice:', note);
  await B.screenshot({ path: `${SHOTS}/mp-b-notice.png` });
} catch (e) {
  console.log('FAIL', e.message);
  process.exitCode = 1;
}
const logs = [...A.logs, ...B.logs].filter((l) => !/GPU stall|WebGL|ReadPixels/.test(l));
console.log(logs.slice(0, 20).join('\n') || 'no errors');
await browser.close();
