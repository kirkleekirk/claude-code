// Two players in headless Chromium: A hosts, B joins by code, and what they share is checked
// (seeing each other, block changes, each other's dead, hits and kills, the clock, the dragons,
// the alien ship, leaving and coming back, the host's options: PVP (an exo suit's slam with it
// too), kick, ban, restart; the host ending it; and an Endurance game: dying online, starting
// over, and closed once it's begun).
// Needs the dev server and a PeerJS server (peer-server.mjs):
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
  // A: a new Survival world, Normal, kept (an Endurance world isn't, and can't be joined once
  // it's begun: that's at the end)
  await A.goto(`${BASE}?${PEER}&rd=4&time=0.45&q=low&seed=1337${extra}`);
  await wait(A, () => window.__app?.state === 'menu', null, 240000);
  await A.evaluate(() => window.__app.startWorld({ mode: 'survival', difficulty: 'normal' }));
  await wait(A, () => window.__app.state === 'playing' && window.__app.game?.ready, null, 240000);
  await A.evaluate(() => { window.__game = window.__app.game; });
  log('A ready');
  const code = await A.evaluate(async () => { await window.__app.hostOnline(); return window.__game.online?.code; });
  ok(/^[A-Z2-9]{5}$/.test(code || ''), `A hosts with a code (${code})`);

  await B.goto(`${BASE}?${PEER}&rd=4&q=low${extra}`);
  await wait(B, () => window.__app?.state === 'menu', null, 240000);
  log('B at the menu');
  await B.evaluate(() => window.__app.setName('Bea'));
  await B.evaluate((c) => window.__app.joinOnline(c), code);
  log('B:', await B.evaluate(() => `${window.__app.state} ${window.__app.menus.id} ${window.__app.menus.cur?.sub ?? ''}`));
  await wait(B, () => window.__app.game?.online && window.__app.game.ready, null, 240000);
  log('B joined and loaded');
  const seeds = await Promise.all([A.evaluate(() => window.__game.seed), B.evaluate(() => window.__app.game.seed)]);
  ok(seeds[0] === seeds[1], `same world (seed ${seeds[0]} / ${seeds[1]})`);
  const how = await B.evaluate(() => { const g = window.__app.game; return { mode: g.mode, difficulty: g.difficulty, creative: g.creative, pvp: g.pvp }; });
  ok(how.mode === 'survival' && how.difficulty === 'normal' && !how.creative && how.pvp === 0, `played the host's way (${JSON.stringify(how)})`);

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
  // (nothing between B and where the dragon will be: trees and hills differ from world to world)
  await B.evaluate((at) => {
    const g = window.__app.game, w = g.world, e = g.player.eye;
    for (let k = 0; k <= 120; k++) {
      const f = k / 120, x = e.x + (at.x - e.x) * f, y = e.y + (at.y - e.y) * f, z = e.z + (at.z - e.z) * f;
      for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) for (let dz = -2; dz <= 2; dz++) {
        const bx = Math.floor(x) + dx, by = Math.floor(y) + dy, bz = Math.floor(z) + dz;
        if (by > Math.floor(g.player.pos.y) - 1 && w.getBlock(bx, by, bz) !== 0) w.setBlock(bx, by, bz, 0);
      }
    }
  }, above);
  await A.waitForTimeout(3000);
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
  await wait(B, () => window.__app.game.dragons.client.health < 20, null, 60000).catch(() => {});
  const hp = await Promise.all([A.evaluate(() => window.__game.dragons.client.health), B.evaluate(() => window.__app.game.dragons.client.health)]);
  ok(Math.abs(hp[0] - 19.7) < 1e-6 && Math.abs(hp[1] - 19.7) < 1e-6, `B's bullet hurts it on both machines (${hp.join(' / ')})`);
  await Promise.all([A.evaluate(() => { window.__game.dragons.client.health = 0.2; }), B.evaluate(() => { window.__app.game.dragons.client.health = 0.2; })]);
  await bShot('pistol');
  await wait(A, () => window.__game.dragons.client?.dead ?? true, null, 60000).then(() => ok(true, "B's shot kills it, on A's machine too"), () => ok(false, "B's shot kills it, on A's machine too"));
  await wait(B, () => !window.__app.game.dragons.client, null, 240000).catch(() => {});
  await wait(A, () => !window.__game.dragons.client, null, 240000).catch(() => {});
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

  // The alien ship, A's (the host's) to send: it comes when A's time for one is up (from the
  // second day on), and B has it where A does; B breaks a drone (A sees it give way) and goes
  // up; B's shot at a power node is taken off on A's machine, and A's word of it comes back.
  // (B then leaves from up there, and joins again: below.)
  const calm = () => {
    const app = window.__app, g = app.game;
    app.onLockChange = () => {};
    if (app.state === 'paused') app.resume();
    for (const e of g.enemies.list) e.gone = true;
    g.enemies.spawning = () => {};
    if (g.player.dead) g.respawn();
  };
  // (B's hurts counted, not taken: the core shoots at whoever's in its hall)
  const unhurt = () => { const p = window.__app.game.player; window.__shipHurt = []; if (!p.__hurt) { p.__hurt = p.hurt; p.hurt = (a, f, k) => { window.__shipHurt.push(k); }; } };
  const hurtable = () => { const p = window.__app.game.player; if (p.__hurt) { p.hurt = p.__hurt; delete p.__hurt; } };
  // (how often B hears the host's word on the boss's health)
  const countUx = () => { const M = window.__app.game.mothership, f = M.handleState.bind(M); window.__ux = 0; M.handleState = (...a) => { window.__ux++; return f(...a); }; };
  const bFires = (gun, at) => B.evaluate(([gun, at]) => {
    const g = window.__app.game, p = g.player, it = window.__ITEMS[gun], eye = p.eye.clone();
    const d = new eye.constructor(at[0], at[1], at[2]).sub(eye).normalize();
    p.yaw = Math.atan2(-d.x, -d.z); p.pitch = Math.asin(d.y);
    g.fire(it, eye, eye, [d], true, g.online.myId);
    g.online.shot(it.id, eye, eye, [d]);
  }, [gun, at]);
  const ship = (P) => P.evaluate(() => { const v = window.__app.game.mothership.visit; return v ? { s: v.seed, h: [v.hx, v.hz], a: v.dir, t: v.t, end: v.end, nodes: v.nodes.slice(), core: v.core, spent: v.drones.filter((d) => d.spent).map((d) => d.i) } : null; });
  // (back on their feet, if either was dead: a respawn waits for the ground at the start to load)
  const upAndReady = () => { const g = window.__app.game; return g.ready && !g.player.dead; };
  await A.evaluate(calm);
  await B.evaluate(calm);
  await wait(A, upAndReady, null, 120000).catch(() => {});
  await wait(B, upAndReady, null, 120000).catch(() => {});
  await Promise.all([A, B].map((P) => P.evaluate(async () => { window.SHIP = (await import('/src/game/mothership.js')).SHIP; })));
  const day = await A.evaluate(() => window.__game.dayNumber);
  await A.evaluate(() => { window.__game.mothership.wait = 0; });
  const came = await wait(A, () => !!window.__game.mothership.visit, null, 30000).then(() => true, () => false);
  ok(came && day >= 2, `A's ship comes when A's time for one is up (day ${day})`);
  await wait(B, () => !!window.__app.game.mothership.visit, null, 30000).catch(() => {});
  const vis = await Promise.all([ship(A), ship(B)]);
  ok(vis[0] && vis[1] && vis[0].s === vis[1].s && vis[0].h.join() === vis[1].h.join() && vis[0].a === vis[1].a, `B has it, where A has it, coming in the same way (${JSON.stringify(vis.map((v) => v && [v.s, ...v.h, v.a]))})`);
  // (on to when all its drones are down, on both)
  const allDown = () => { window.__app.game.mothership.visit.t = SHIP.DRONE_FIRST + 7 * SHIP.DRONE_EVERY + SHIP.DRONE_FALL + 1; };
  await A.evaluate(allDown);
  await B.evaluate(allDown);
  const landed = () => window.__app.game.mothership.visit?.drones.every((d) => d.state === 'landed');
  await wait(A, landed, null, 60000).catch(() => {});
  await wait(B, landed, null, 60000).catch(() => {});
  const where = () => window.__app.game.mothership.visit.drones.map((d) => `${d.state}:${d.lx},${d.base},${d.lz}`);
  const dr = await Promise.all([A.evaluate(where), B.evaluate(where)]);
  ok(dr[0].join() === dr[1].join() && dr[0].every((s) => s.startsWith('landed')), `its drones come down in the same places on both (${dr[1].slice(0, 2).join(' ')} ...)`);
  // B onto the drone nearest, and its eye shot till it gives way
  const di = await B.evaluate(() => {
    const g = window.__app.game, v = g.mothership.visit, p = g.player;
    const r = (d) => Math.hypot(d.lx + 0.5 - p.pos.x, d.lz + 0.5 - p.pos.z);
    const d = v.drones.reduce((a, b) => (r(b) < r(a) ? b : a));
    p.pos.set(d.lx + 1.4, d.base + 2.05, d.lz + 0.5); p.vel.set(0, 0, 0); p.fallStart = null;
    return d.i;
  });
  await B.evaluate(unhurt);
  await B.evaluate(countUx);
  const stood = await wait(B, (i) => { const g = window.__app.game, v = g.mothership.visit; return v.standingOn(v.drones[i], g.player); }, di, 30000).then(() => true, () => false);
  let eyeShots = 0;
  for (let k = 0; k < 8; k++) {
    const st = await B.evaluate((i) => { const v = window.__app.game.mothership.visit, d = v.drones[i]; return { at: [d.lx + 0.5, d.base + 2.42, d.lz + 0.5], hits: d.hits, up: !!v.lift || v.inside() }; }, di);
    if (st.up) break;
    await bFires('pistol', st.at);
    eyeShots++;
    await wait(B, ([i, h]) => { const v = window.__app.game.mothership.visit; return v.drones[i].hits > h || !!v.lift; }, [di, st.hits], 20000).catch(() => {});
  }
  const gave = await B.evaluate((i) => { const g = window.__app.game, v = g.mothership.visit, p = g.player; return { spent: v.drones[i].spent, lift: v.lift?.kind ?? (v.inside() ? 'in' : null), at: p.pos.toArray().map((x) => +x.toFixed(1)), dead: p.dead, hint: g.hud.hintEl.textContent }; }, di);
  ok(stood && gave.spent && (gave.lift === 'up' || gave.lift === 'in') && eyeShots === 5, `B stands on a drone and shoots its eye: it gives way at the fifth, and the light takes B up (${eyeShots} shots, stood ${stood}, ${JSON.stringify(gave)})`);
  await wait(A, (i) => window.__app.game.mothership.visit.drones[i].spent, di, 20000).then(() => ok(true, 'A sees that drone give way'), () => ok(false, 'A sees that drone give way'));
  await wait(B, () => { const v = window.__app.game.mothership.visit; return !v.lift && v.inside(); }, null, 60000).catch(() => {});
  const inB = await B.evaluate(() => { const g = window.__app.game; return { inside: g.mothership.visit.inside(), y: g.player.pos.y }; });
  ok(inB.inside, `B's in the ship (y ${inB.y.toFixed(1)})`);
  await wait(A, () => [...window.__game.online.players.values()][0].pos.y > 130, null, 30000).then(() => ok(true, 'and A sees B up there'), () => ok(false, 'and A sees B up there'));
  // B's shot at a node (from beside it, out from the middle, the core's shield not in the way)
  const n0 = await B.evaluate(() => {
    const g = window.__app.game, v = g.mothership.visit, p = g.player, [x, z] = SHIP.NODES[0];
    p.pos.set(v.origin.x + x + 3.7, SHIP.FLOOR + 0.01, v.origin.z + z + 1.2); p.vel.set(0, 0, 0);
    return [v.origin.x + x, SHIP.FLOOR + SHIP.NODE_Y, v.origin.z + z];
  });
  await B.waitForTimeout(1500);
  await bFires('pistol', n0);
  await wait(A, () => window.__app.game.mothership.visit.nodes[0] < SHIP.NODE_HEALTH, null, 20000).catch(() => {});
  await wait(B, () => window.__ux > 0, null, 20000).catch(() => {});
  const nh = await Promise.all([A.evaluate(() => window.__app.game.mothership.visit.nodes[0]), B.evaluate(() => ({ h: window.__app.game.mothership.visit.nodes[0], ux: window.__ux }))]);
  ok(nh[0] < 150 && Math.abs(nh[0] - nh[1].h) < 0.11 && nh[1].ux > 0, `B's shot at a power node is taken off on A's machine, and A's word of it comes back (${nh[0]} / ${nh[1].h}, heard ${nh[1].ux}x)`);

  // B leaves (from up in the ship): A keeps B's things, and B on the ground under it; B comes
  // back and has them
  await B.evaluate(() => { const inv = window.__app.game.inventory; inv.slots[7] = inv.make('diamond', 7); });
  await B.evaluate(() => window.__app.leaveOnline());
  await wait(A, () => window.__game.online.players.size === 0, null, 20000).then(() => ok(true, 'A sees B leave'), () => ok(false, 'A sees B leave'));
  // (kept by B's browser, not B's name)
  const bKey = `u:${await B.evaluate(() => window.__app.clientId())}`;
  const kept = await A.evaluate((k) => ({ it: window.__game.guests[k]?.inventory?.slots?.[7], byName: 'Bea' in window.__game.guests, y: window.__game.guests[k]?.player?.y }), bKey);
  ok(kept.it && kept.it.id === 'diamond' && kept.it.count === 7 && !kept.byName, `A keeps what B had, by B's browser (${JSON.stringify(kept)})`);
  ok(kept.y < 120, `and, B having left from up in the ship, keeps B on the ground under it (y ${kept.y?.toFixed(1)})`);
  await wait(B, () => window.__app.state === 'menu', null, 240000);
  // (a dragon up when B comes back: B sees it from the start; and the ship)
  await A.evaluate(() => { const D = window.__game.dragons; D.nextAllowed = 0; D.pending = false; D.spawnDragon(2, false); });
  await B.evaluate((c) => window.__app.joinOnline(c), code);
  await wait(B, () => window.__app.game?.online && window.__app.game.ready, null, 240000);
  const back = await B.evaluate(() => window.__app.game.inventory.slots[7]);
  ok(back && back.id === 'diamond' && back.count === 7, 'B has it back on rejoining');
  const joined = await B.evaluate(() => window.__app.game.dragons.client?.type ?? null);
  ok(joined === 2, `joining with a dragon up, B has it too (${joined})`);
  await A.evaluate(() => window.__game.dragons.removeDragon());
  const vs = await Promise.all([ship(A), ship(B)]);
  ok(vs[1] && vs[1].s === vs[0].s && vs[1].a === vs[0].a && Math.abs(vs[1].nodes[0] - vs[0].nodes[0]) < 0.11 && vs[1].spent.includes(di) && Math.abs(vs[1].t - vs[0].t) < 5,
    `and the ship, as it is: its time, its damaged node, its spent drone (${JSON.stringify(vs.map((v) => v && [v.t.toFixed(1), v.nodes[0], v.spent]))})`);

  // B brings it down (back up in its hall, the nodes broken, then the core): it comes down on
  // both, and B, who was in it, has its loot (A, who wasn't, none)
  await B.evaluate(calm);
  await wait(B, upAndReady, null, 120000).catch(() => {});
  await B.evaluate(unhurt);
  await B.evaluate(() => { const g = window.__app.game, v = g.mothership.visit, p = g.player; p.pos.set(v.origin.x + 6, SHIP.FLOOR + 0.01, v.origin.z + 1); p.vel.set(0, 0, 0); p.fallStart = null; });
  await wait(B, () => window.__app.game.mothership.visit.inside() && window.__app.game.player.onGround, null, 30000).catch(() => {});
  await B.evaluate(() => { const v = window.__app.game.mothership.visit; for (let k = 0; k < 4; k++) v.hitPart(k, SHIP.NODE_HEALTH); });
  const bare = await wait(B, () => !window.__app.game.mothership.visit.shielded, null, 30000).then(() => true, () => false);
  const aBare = await A.evaluate(() => !window.__app.game.mothership.visit.shielded);
  ok(bare && aBare, "B's hits break its nodes, on A's machine, and the core's shield drops on both");
  const before = await A.evaluate(() => window.__app.game.inventory.slots.filter(Boolean).map((s) => s.id));
  await B.evaluate(() => { const v = window.__app.game.mothership.visit; v.hitPart(4, 300); v.hitPart(4, 300); });
  await wait(A, () => window.__app.game.mothership.visit?.end === 'down', null, 30000).catch(() => {});
  await wait(B, () => window.__app.game.mothership.visit?.end === 'down', null, 30000).catch(() => {});
  const ends = await Promise.all([ship(A), ship(B)]);
  ok(ends[0]?.end === 'down' && ends[1]?.end === 'down', `B brings the core down: it ends on both (${ends.map((v) => v?.end).join(' / ')})`);
  await wait(B, () => !window.__app.game.mothership.visit, null, 240000).catch(() => {});
  await wait(A, () => !window.__app.game.mothership.visit, null, 240000).catch(() => {});
  const lootB = await B.evaluate(() => {
    const g = window.__app.game, has = (re) => g.inventory.slots.some((s) => s && re.test(s.id)) || g.drops.list.some((d) => re.test(d.id));
    return { chip: has(/^advanced_chip$/), slime: has(/^slime$/), rock: has(/^space_rock$/), y: g.player.pos.y, overlay: !!g.world.overlay };
  });
  const lootA = await A.evaluate((before) => {
    const g = window.__app.game, now = g.inventory.slots.filter(Boolean).map((s) => s.id);
    return { chip: now.some((id) => id === 'advanced_chip' && !before.includes(id)) || g.drops.list.some((d) => d.id === 'advanced_chip'), overlay: !!g.world.overlay };
  }, before);
  ok(lootB.chip && lootB.slime && lootB.rock && lootB.y < 120, `B is let down, and has its loot (${JSON.stringify(lootB)})`);
  ok(!lootA.chip, "and A, who wasn't in it, none");
  ok(!lootA.overlay && !lootB.overlay, 'then it goes, on both');
  await B.evaluate(hurtable);

  // the host saves, and B's things are in the save
  await A.evaluate(() => window.__app.autosave());
  const saved = await A.evaluate(async (k) => { const { loadWorld } = await import('/src/game/save.js'); const s = await loadWorld(window.__game.worldId); return !!s?.guests?.[k]; }, bKey);
  ok(saved, "the host's save holds B's things");

  // PVP: off, A's bullet goes by B; on (Host Options), it hurts B, on B's machine
  const standB = async () => {
    // a flat floor round A, clear above (it reaches B's machine too), A standing on it
    const ap2 = await A.evaluate(() => {
      const g = window.__game, p = g.player, w = g.world;
      const x0 = Math.floor(p.pos.x), z0 = Math.floor(p.pos.z), y0 = Math.floor(p.pos.y) - 1;
      for (let dx = -7; dx <= 7; dx++) for (let dz = -7; dz <= 7; dz++) {
        if (w.getBlock(x0 + dx, y0, z0 + dz) !== 15) w.setBlock(x0 + dx, y0, z0 + dz, 15);
        for (let y = y0 + 1; y < y0 + 6; y++) if (w.getBlock(x0 + dx, y, z0 + dz) !== 0) w.setBlock(x0 + dx, y, z0 + dz, 0);
      }
      p.pos.set(x0 + 0.5, y0 + 1, z0 + 0.5); p.vel.set(0, 0, 0);
      return { x: p.pos.x, y: p.pos.y, z: p.pos.z, yaw: p.yaw, floor: [x0, y0, z0] };
    });
    await wait(B, (f) => window.__app.game.world.getBlock(f[0] + 3, f[1], f[2] + 3) === 15, ap2.floor, 30000).catch(() => {});
    await B.evaluate((ap) => {
      const app = window.__app, g = app.game, p = g.player;
      app.onLockChange = () => {};
      if (app.state === 'paused') app.resume();
      if (p.dead) g.respawn();
      p.pos.set(ap.x - Math.sin(ap.yaw) * 4, ap.y, ap.z - Math.cos(ap.yaw) * 4);
      p.vel.set(0, 0, 0);
      p.health = p.maxHealth;
      if (!window.__hurtOn) { window.__hurtOn = true; window.__hurt = []; const h = p.hurt.bind(p); p.hurt = (a, f, k) => { window.__hurt.push(k); return h(a, f, k); }; }
      window.__hurt.length = 0;
    }, ap2);
    // (till A sees B standing there)
    await A.waitForFunction(() => { const r = [...window.__game.online.players.values()][0]; return r && r.pos.distanceTo(r.target) < 0.2; }, null, { timeout: 30000, polling: 300 }).catch(() => {});
    await A.waitForTimeout(1500);
  };
  const aShoots = () => A.evaluate(async () => {
    const g = window.__game, r = [...g.online.players.values()][0], eye = g.player.eye.clone();
    const { ITEMS } = await import('/src/items/items.js');
    ITEMS.pistol.inaccuracy = 0;
    const d = r.pos.clone(); d.y += 1.1; d.sub(eye).normalize();
    g.fire(ITEMS.pistol, eye, eye, [d], true, 0);
    g.online.shot('pistol', eye, eye, [d]);
  });
  await standB();
  await aShoots();
  await B.waitForTimeout(5000);
  const off = await B.evaluate(() => ({ h: window.__app.game.player.health, hurt: [...window.__hurt] }));
  ok(off.h === 100 && !off.hurt.length, `PVP off: A's bullet doesn't hurt B (${off.h})`);
  await A.evaluate(() => window.__game.setPvp(1));
  await wait(B, () => window.__app.game.pvp === 1, null, 20000).then(() => ok(true, 'PVP on: B hears of it'), () => ok(false, 'PVP on: B hears of it'));
  await standB();
  await aShoots();
  await wait(B, () => window.__hurt.includes('pvp'), null, 30000).catch(() => {});
  const on = await B.evaluate(() => ({ h: window.__app.game.player.health, hurt: [...window.__hurt] }));
  ok(on.hurt.includes('pvp') && Math.abs(on.h - 79) < 0.5, `and A's bullet takes a fifth of B's health (${on.h})`);
  // a swing at B (ProcessMeleePlayerMessage): the same again
  await A.evaluate(() => { const g = window.__game, r = [...g.online.players.values()][0]; g.online.meleePlayer(r.id, 'stone_pickaxe', g.player.pos); });
  await wait(B, () => window.__hurt.filter((k) => k === 'pvp').length >= 2, null, 30000).catch(() => {});
  const sw = await B.evaluate(() => window.__app.game.player.health);
  ok(Math.abs(sw - 58) < 1, `and so does A's swing (${sw})`);

  // B's exo suit: A sees it on B, and the flames of B's boosts; where B's slam comes down, A's
  // dead are hurt, on A's machine (the kill B's), and with PVP on, so is A
  await B.evaluate(() => { const inv = window.__app.game.inventory; inv.armorBox[0] = inv.make('exo_suit', 1); inv.changed(); });
  const suit = await wait(A, () => { const r = [...window.__game.online.players.values()][0]; return !!(r.flags & 32) && !!r.puppet.exo; }, null, 30000).then(() => true, () => false);
  ok(suit, 'B puts on an exo suit: A sees it on B');
  await A.evaluate(() => {
    const g = window.__game, r = [...g.online.players.values()][0], f = r.exoBoost.bind(r), p = g.player, h = p.hurt.bind(p);
    window.__xb = [];
    r.exoBoost = (...a) => { f(...a); window.__xb.push([a[0], +(r.puppet.exo?.power ?? -1).toFixed(2)]); };
    window.__aHurt = [];
    p.hurt = (a, fr, k) => { window.__aHurt.push([k, +a.toFixed(1)]); return h(a, fr, k); };
    p.health = p.maxHealth;
  });
  await B.evaluate(() => { const g = window.__app.game, p = g.player; p.vel.y = 3; p.onGround = false; g.exo.boostJump(p); });
  await wait(A, () => window.__xb.some((x) => x[0] === 0), null, 20000).catch(() => {});
  const xb = await A.evaluate(() => window.__xb.slice());
  ok(xb.some((x) => x[0] === 0 && x[1] > 0.9), `B's boost jump: the suit's thrusters fire on A's machine (${JSON.stringify(xb)})`);
  await standB();
  const sl = await A.evaluate(() => {
    const g = window.__game, p = g.player;
    // (one of A's dead, near its end, frozen by where B will come down: two and a half metres off)
    const x = p.pos.x - Math.sin(p.yaw) * 2.5, z = p.pos.z - Math.cos(p.yaw) * 2.5;
    const e = g.enemies.spawn(0, x + 1, p.pos.y + 0.1, z, 0.5);
    e.update = () => {}; e.health = 2;
    p.health = p.maxHealth;
    window.__aHurt.length = 0;
    return { nid: e.nid, x, y: p.pos.y, z };
  });
  const kB = await B.evaluate(() => window.__app.game.stats.kills);
  await B.evaluate((s) => {
    const g = window.__app.game, p = g.player, w = g.world, fy = Math.floor(s.y) - 1;
    // (open above where it comes down)
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (let y = fy + 1; y < fy + 12; y++) {
      const bx = Math.floor(s.x) + dx, bz = Math.floor(s.z) + dz;
      if (w.getBlock(bx, y, bz) !== 0) w.setBlock(bx, y, bz, 0);
    }
    p.pos.set(s.x, s.y + 6, s.z); p.vel.set(0, 0, 0); p.fallStart = null; p.onGround = false;
    window.__hurt.length = 0;
    g.exo.startSlam();
  }, sl);
  await wait(A, () => window.__xb.some((x) => x[0] === 3), null, 20000).catch(() => {});
  await wait(A, (n) => window.__game.enemies.list.find((e) => e.nid === n)?.dead ?? true, sl.nid, 20000).catch(() => {});
  const slA = await A.evaluate((n) => ({ xb: window.__xb.map((x) => x[0]), dead: window.__game.enemies.list.find((e) => e.nid === n)?.dead ?? true, hurt: window.__aHurt.slice(), h: window.__game.player.health }), sl.nid);
  await wait(B, (k) => window.__app.game.stats.kills > k, kB, 20000).catch(() => {});
  const slB = await B.evaluate(() => ({ kills: window.__app.game.stats.kills, hurt: [...window.__hurt], slam: window.__app.game.exo.slam }));
  ok(slA.xb.includes(2) && slA.xb.includes(3) && slA.dead && slB.kills > kB, `B's slam comes down on A's machine: A's zombie by it dies there, and the kill is B's (${JSON.stringify(slA.xb)})`);
  ok(slA.hurt.some(([k, a]) => k === 'pvp' && a === 25) && slA.h === 75 && !slB.hurt.includes('fall'), `with PVP on, it takes a quarter of A's health (${slA.h}); B is unhurt by the fall`);
  await B.evaluate(() => { const inv = window.__app.game.inventory; inv.armorBox[0] = null; inv.changed(); });
  await A.evaluate(() => { const p = window.__game.player; p.health = p.maxHealth; });
  await A.evaluate(() => window.__game.setPvp(0));

  // Host Options' Restart: everyone back at the start
  await B.evaluate(() => { const p = window.__app.game.player; p.pos.x += 20; p.pos.y += 2; });
  await A.evaluate(() => window.__game.restartForAll());
  await wait(B, () => { const g = window.__app.game, sp = g.spawnSpot(), p = g.player.pos; return Math.hypot(p.x - sp.x, p.z - sp.z) < 1; }, null, 30000)
    .then(() => ok(true, "the host's Restart puts B back at the start"), () => ok(false, "the host's Restart puts B back at the start"));

  // Kick: B's put out, told why, and can come back
  const bid = await A.evaluate(() => [...window.__game.online.players.values()][0].id);
  await A.evaluate((id) => window.__game.online.kick(id, false), bid);
  await wait(B, () => window.__app.state === 'menu' && window.__app.menus.id === 'notice', null, 240000).catch(() => {});
  const kick = await B.evaluate(() => window.__app.menus.cur?.title);
  ok(kick === 'Kicked', `the host kicks B: B is told (${kick})`);
  await wait(A, () => window.__game.online.players.size === 0, null, 20000).catch(() => {});
  await B.evaluate((c) => window.__app.joinOnline(c), code);
  await wait(B, () => window.__app.game?.online && window.__app.game.ready, null, 240000).then(() => ok(true, 'and can join again'), () => ok(false, 'and can join again'));
  // Ban: put out, and kept out till the host clears the list
  const bid2 = await A.evaluate(() => [...window.__game.online.players.values()][0].id);
  await A.evaluate((id) => window.__game.online.kick(id, true), bid2);
  await wait(B, () => window.__app.state === 'menu' && window.__app.menus.id === 'notice', null, 240000).catch(() => {});
  const ban = await B.evaluate(() => window.__app.menus.cur?.title);
  ok(ban === 'Banned', `the host bans B: B is told (${ban})`);
  await wait(A, () => window.__game.online.players.size === 0, null, 20000).catch(() => {});
  await B.evaluate((c) => window.__app.joinOnline(c), code);
  await wait(B, () => window.__app.menus.id === 'notice', null, 60000).catch(() => {});
  const refused = await B.evaluate(() => window.__app.menus.cur?.sub);
  ok(/banned/.test(refused || ''), `and can't come back (${refused})`);
  // the ban is B's browser, not B's name: someone else of that name isn't kept out, and a name
  // like "constructor" isn't taken for one (bans from before there were ids were names)
  const bn = await A.evaluate((bName) => {
    const app = window.__app, kept = localStorage.getItem('starminer.bans'), b = JSON.parse(kept || '{}');
    const key = Object.keys(b).find((k) => k.startsWith('u:'));
    const r = { key: !!key, same: !!key && app.banned(key.slice(2), 'Someone Else'), other: app.banned('zzzzzzzzzzzz99', bName), proto: app.banned(null, 'constructor') };
    localStorage.setItem('starminer.bans', JSON.stringify({ ...b, Old: 5 }));
    r.legacy = app.banned('qqqqqqqqqqqq11', 'Old');
    localStorage.setItem('starminer.bans', kept);
    return r;
  }, 'Bea');
  ok(bn.key && bn.same && !bn.other && !bn.proto && bn.legacy, `bans go by the browser, not the name (${JSON.stringify(bn)})`);
  await A.evaluate(() => window.__app.clearBans());
  await B.evaluate((c) => window.__app.joinOnline(c), code);
  await wait(B, () => window.__app.game?.online && window.__app.game.ready, null, 240000).then(() => ok(true, 'till the host clears the ban list'), () => ok(false, 'till the host clears the ban list'));

  // the host ends it: B goes back to the menu, told why
  await A.evaluate(() => window.__app.quitToMenu());
  await wait(B, () => window.__app.state === 'menu' && window.__app.menus.id === 'notice', null, 240000).then(() => ok(true, 'B is told the host ended the game'), () => ok(false, 'B is told the host ended the game'));
  const note = await B.evaluate(() => window.__app.menus.cur?.sub);
  log('B notice:', note);
  await B.screenshot({ path: `${SHOTS}/mp-b-notice.png` });

  // Endurance online: B joins before it's begun; dying, B waits, then comes back by A; with both
  // down, the host starts it over for everyone
  await wait(A, () => window.__app.state === 'menu', null, 240000);
  await A.evaluate(() => window.__app.startEndurance({ host: true }));
  await wait(A, () => window.__app.state === 'playing' && window.__app.game?.ready && window.__app.game.online?.code, null, 240000);
  const code2 = await A.evaluate(() => { window.__game = window.__app.game; window.__app.onLockChange = () => {}; return window.__game.online.code; });
  await B.evaluate((c) => window.__app.joinOnline(c), code2);
  await wait(B, () => window.__app.game?.online && window.__app.game.ready, null, 240000).then(() => ok(true, 'B joins an Endurance game before it has begun'), () => ok(false, 'B joins an Endurance game before it has begun'));
  await B.evaluate(() => { const app = window.__app, g = app.game; app.onLockChange = () => {}; if (app.state === 'paused') app.resume(); g.player.hurt(1000, null, 'test'); });
  await wait(B, () => window.__app.game.death?.showT <= 0, null, 60000).catch(() => {});
  const wB = await B.evaluate(() => window.__app.game.deathScreen());
  ok(wB.count > 10 && /Distance Traveled/.test(wB.lines[0]), `B, dead, waits to come back (${JSON.stringify(wB)})`);
  const aAt = await A.evaluate(() => window.__game.player.pos.toArray());
  await B.evaluate(() => { const g = window.__app.game; g.death.waitT = 0; window.__app.input.down('accept'); setTimeout(() => window.__app.input.up('accept'), 300); });
  await wait(B, () => !window.__app.game.player.dead, null, 30000).catch(() => {});
  const bAt = await B.evaluate(() => ({ dead: window.__app.game.player.dead, p: window.__app.game.player.pos.toArray() }));
  ok(!bAt.dead && Math.hypot(bAt.p[0] - aAt[0], bAt.p[2] - aAt[2]) < 3, `then comes back by A (${Math.hypot(bAt.p[0] - aAt[0], bAt.p[2] - aAt[2]).toFixed(1)} m off)`);
  await A.evaluate(() => { window.__game.player.hurt(1000, null, 'test'); });
  await B.evaluate(() => { window.__app.game.player.hurt(1000, null, 'test'); });
  await wait(A, () => window.__game.death?.showT <= 0 && [...window.__game.online.players.values()].every((r) => r.dead), null, 60000).catch(() => {});
  await wait(B, () => window.__app.game.death?.showT <= 0, null, 60000).catch(() => {});
  const both = await Promise.all([A.evaluate(() => window.__game.deathScreen().press), B.evaluate(() => window.__app.game.deathScreen().press)]);
  ok(both[0] === 'Restart' && both[1] === 'wait', `both down: the host can restart, B waits for it (${both.join(' / ')})`);
  await A.evaluate(() => { window.__app.input.down('accept'); setTimeout(() => window.__app.input.up('accept'), 300); });
  await wait(B, () => !window.__app.game.player.dead, null, 30000).catch(() => {});
  const up = await Promise.all([A.evaluate(() => window.__game.player.dead), B.evaluate(() => window.__app.game.player.dead)]);
  ok(!up[0] && !up[1], 'and everyone starts over');
  // begun (the host 100 m out): no one else can join
  await B.evaluate(() => window.__app.leaveOnline());
  await wait(B, () => window.__app.state === 'menu', null, 240000);
  await A.evaluate(() => { window.__game.maxDistance = 150; });
  await wait(A, () => window.__game.begun, null, 20000).catch(() => {});
  await B.evaluate((c) => window.__app.joinOnline(c), code2);
  await wait(B, () => window.__app.menus.id === 'notice', null, 60000).catch(() => {});
  const late = await B.evaluate(() => window.__app.menus.cur?.sub);
  ok(/already begun/.test(late || ''), `once it has begun, B can't join (${late})`);
} catch (e) {
  console.log('FAIL', e.message);
  process.exitCode = 1;
}
const logs = [...A.logs, ...B.logs].filter((l) => !/GPU stall|WebGL|ReadPixels/.test(l));
console.log(logs.slice(0, 20).join('\n') || 'no errors');
await browser.close();
