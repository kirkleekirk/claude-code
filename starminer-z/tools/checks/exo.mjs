// The exo suit (game/exo.js) and the armor slot it's worn in, in headless Chromium: its recipe
// (known once you carry an Advanced Chip) and making it; the armor slot, which takes nothing but
// armor, with the mouse, shift-clicks and a pad; worn, how it shows (on you in third person, its
// arms in first, the HUD's row); its Boost Jump, Boost Dodge (two charges, each back in a second
// and a half), Boost Slam (straight down: the dead round its landing hurt, no harm from the fall;
// not from low down) and Overclock (half as fast again, for as long as its battery lasts); what
// it takes of a hit, and wearing out; the falls its legs take; kept in a save; kept on dying,
// and dropped with everything on Hardcore; and the touch screen's buttons for it.
//   node tools/checks/exo.mjs <dev server url> <out dir> [extra query, e.g. &nocmz]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';
const [base, out, extra = ''] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const logs = [];
// (touch: a page that has a touch screen, as a phone's does)
const newPage = async (touch = false) => {
  const ctx = await browser.newContext({ viewport: { width: 960, height: 540 }, hasTouch: touch });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  const pg = await ctx.newPage();
  pg.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text().slice(0, 300)}`); });
  pg.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack?.split('\n').slice(0, 5).join('\n')}`));
  return pg;
};
let page = await newPage();
let fails = 0;
const ok = (c, what) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${what}`); if (!c) fails++; };
const E = (fn, arg) => page.evaluate(fn, arg);
const snap = async (name) => { await E(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); await page.waitForTimeout(300); await page.screenshot({ path: `${out}/${name}.png` }); };
// the middle of a cell on the screen (data-slot, data-armor)
const at = (sel) => E((sel) => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null; }, sel);
const click = async (sel, shift = false) => {
  const p = await at(sel);
  if (!p) return false;
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.click(p.x, p.y);
  if (shift) await page.keyboard.up('Shift');
  await page.waitForTimeout(100);
  return true;
};

// (out in the Desert, on a floor of its own)
const load = async (q = '') => {
  await page.goto(`${base}/?play&time=0.45&rd=4&q=low&x=1300.5&z=0.5&y=69${q}${extra}`);
  await page.waitForFunction(() => window.__app?.state === 'playing' && window.__app.game?.ready, null, { timeout: 300000 });
  await E(async () => {
    const app = window.__app, g = app.game, p = g.player, I = app.input, w = g.world;
    app.onLockChange = () => {};
    for (const e of g.enemies.list) e.gone = true;
    g.enemies.spawning = () => {};
    const { B } = await import('/src/world/blocks.js');
    const { RECIPES, ITEMS } = await import('/src/items/items.js');
    window.RECIPES = RECIPES; window.ITEMS = ITEMS;
    window.T = {
      step(sec, dt = 1 / 30) { for (let t = 0; t < sec - 1e-9; t += dt) { I.poll(dt); g.update(dt, I); I.endFrame(); } },
      press(a, sec = 1 / 30) { I.down(a); this.step(sec); I.up(a); this.step(1 / 30); },
      // till on the ground (sec at most)
      land(sec = 5) { for (let t = 0; t < sec && !p.onGround; t += 1 / 30) this.step(1 / 30); },
      // back to the middle of the floor, standing still
      home() { p.pos.set(this.x0 + 0.5, this.y0 + 1, this.z0 + 0.5); p.vel.set(0, 0, 0); p.fallStart = null; this.step(0.3); },
      flat: (v) => Math.hypot(v.x, v.z),
    };
    T.land();
    // a floor of bedrock, open above
    const x0 = Math.floor(p.pos.x), z0 = Math.floor(p.pos.z), y0 = Math.floor(p.pos.y) - 1;
    for (let dx = -16; dx <= 16; dx++) for (let dz = -16; dz <= 16; dz++) {
      w.setBlock(x0 + dx, y0, z0 + dz, B.BEDROCK);
      for (let y = y0 + 1; y < y0 + 30; y++) if (w.getBlock(x0 + dx, y, z0 + dz) !== B.AIR) w.setBlock(x0 + dx, y, z0 + dz, B.AIR);
    }
    Object.assign(T, { x0, y0, z0 });
    T.home();
    // what hurts the player, and how much (before the armor takes its share)
    window.hurts = [];
    const hurt = p.hurt.bind(p);
    p.hurt = (a, f, k) => { window.hurts.push([k, +a.toFixed(2)]); return hurt(a, f, k); };
  });
};
await load();

// ---- making it ----------------------------------------------------------------------------------
const rec = await E(async () => {
  const g = window.__app.game, inv = g.inventory;
  const r = RECIPES.find((x) => x.out === 'exo_suit');
  const known = () => inv.discoveredRecipes(RECIPES).includes(r);
  const before = known();
  inv.add('advanced_chip', 1);
  const withChip = known();
  inv.remove('advanced_chip', 1);
  const { iconFor } = await import('/src/items/icons.js');
  return { tab: r.tab, n: r.n, in: r.in, before, withChip, kind: ITEMS.exo_suit.kind, chip: ITEMS.advanced_chip?.name, icons: [iconFor('exo_suit').length, iconFor('advanced_chip').length] };
});
ok(rec.tab === 'gadgets' && rec.n === 1 && JSON.stringify(rec.in) === JSON.stringify([['advanced_chip', 2], ['iron', 12], ['diamond', 4], ['slime', 4]]),
  `the Exo Suit, under Gadgets: ${rec.in.map(([id, n]) => `${n} ${id}`).join(', ')}`);
ok(!rec.before && rec.withChip, 'its recipe known once you carry an Advanced Chip (not before)');
ok(rec.kind === 'armor' && rec.chip === 'Advanced Chip' && rec.icons.every((n) => n > 1000), `armor, and both have icons (${rec.icons.join(', ')} bytes)`);
const made = await E(() => {
  const g = window.__app.game, inv = g.inventory, c = (g.openCrafting(), g.crafting);
  inv.add('advanced_chip', 2); inv.add('iron', 12); inv.add('diamond', 4); inv.add('slime', 4);
  c.showCrafting();
  c.recipe = c.known.find((r) => r.out === 'exo_suit');
  c.craft();
  const r = { suit: inv.count('exo_suit'), left: ['advanced_chip', 'iron', 'diamond', 'slime'].map((id) => inv.count(id)) };
  c.showInventory();
  return r;
});
ok(made.suit === 1 && made.left.every((n) => n === 0), `made on the crafting screen, the things for it used (${made.left.join(', ')} left)`);

// ---- the armor slot -----------------------------------------------------------------------------
const slotOf = () => E(() => window.__app.game.inventory.slots.findIndex((s) => s?.id === 'exo_suit'));
const armor = () => E(() => { const inv = window.__app.game.inventory, c = window.__app.game.crafting; return { on: inv.armor?.id ?? null, hand: inv.hand?.s.id ?? null, ghost: !!c.armorCell.querySelector('.ghost') }; });
const empty = await armor();
let i = await slotOf();
await click(`[data-slot="${i}"]`);
await click('[data-armor]');
const put = await armor();
ok(empty.ghost && !empty.on && put.on === 'exo_suit' && !put.hand && !put.ghost, `the inventory's armor slot: empty, then the suit clicked into it (${JSON.stringify(put)})`);
await snap('1-armor-slot');
// (the stone pickaxe, in the hotbar's first slot, won't go in)
const pick = await E(() => window.__app.game.inventory.slots[0]?.id);
await click('[data-slot="0"]');
await click('[data-armor]');
const deny = await armor();
await click('[data-slot="0"]');
const back = await E(() => window.__app.game.inventory.slots[0]?.id);
ok(pick === 'pick_stone' && deny.on === 'exo_suit' && deny.hand === pick && back === pick, `nothing but armor goes in it (${JSON.stringify(deny)})`);
await click('[data-armor]', true);
const off = await armor();
i = await slotOf();
await click(`[data-slot="${i}"]`, true);
const on = await armor();
ok(!off.on && i >= 8 && on.on === 'exo_suit', `shift-click: off it comes, into the backpack (slot ${i}), and on again`);
// with a pad: off either end of the backpack's rows; A takes it out, and puts it back
const pad = await E(() => {
  const g = window.__app.game, c = g.crafting, inv = g.inventory, I = window.__app.input;
  I.lastDevice = 'pad';
  inv.slots[23] = null;
  c.at = { x: 7, y: 1 }; c.inBox = false; c.render();
  const path = [];
  T.press('rightpad'); path.push(c.onArmor);
  T.press('rightpad'); path.push(c.at.x === 0 && c.at.y === 1);
  T.press('leftpad'); path.push(c.onArmor);
  T.press('leftpad'); path.push(c.at.x === 7);
  T.press('rightpad');
  T.press('down'); path.push(c.at.x === 7 && c.at.y === 2);
  T.press('rightpad'); T.press('up'); path.push(c.at.x === 7 && c.at.y === 1);
  T.press('rightpad');
  // A: out of it; over to the backpack; A: in there; A, back over, A: on again
  T.press('jump'); const lifted = inv.hand?.s.id;
  T.press('leftpad'); T.press('jump'); const moved = inv.slots[23]?.id;
  T.press('jump'); T.press('rightpad'); T.press('jump');
  const again = inv.armor?.id;
  // a pickaxe won't go in
  c.at = { x: 0, y: 4 }; T.press('jump');
  c.at = { x: 8, y: 1 }; T.press('jump');
  const kept = [inv.armor?.id, inv.hand?.s.id];
  T.press('back_btn');
  return { path, lifted, moved, again, kept, pick: inv.slots[0]?.id };
});
ok(pad.path.every(Boolean), `with a pad: off either end of the backpack's rows to it, and back (${pad.path.join(' ')})`);
ok(pad.lifted === 'exo_suit' && pad.moved === 'exo_suit' && pad.again === 'exo_suit', 'and A takes it out, puts it down in the backpack, and back in the armor slot');
ok(pad.kept[0] === 'exo_suit' && pad.kept[1] === pick && pad.pick === pick, `nor with a pad (${pad.kept.join(', ')}; the pickaxe back in its slot)`);

// ---- worn -----------------------------------------------------------------------------------------
const worn = await E(() => {
  const app = window.__app, g = app.game, vm = g.viewModel;
  g.crafting.close(true);
  T.step(0.3);
  const hud = document.querySelector('.hud .exo');
  const r = { worn: g.exo.worn, mine: g.player.exo === g.exo, hud: hud?.classList.contains('on'), pips: [hud?.querySelectorAll('.ec i').length, hud?.querySelectorAll('.ec i.off').length], fill: hud?.querySelector('.eb b')?.style.width,
    first: vm.exo ? vm.exo.holders.length : vm.bracer ? 'bracer' : 0 };
  app.thirdPerson = true;
  T.step(0.3);
  r.third = g.puppet?.exo ? g.puppet.exo.holders.length : 0;
  r.flames = g.puppet?.exo?.flames.length ?? 0;
  return r;
});
ok(worn.worn && worn.mine && worn.hud && parseFloat(worn.fill) === 100 && worn.pips.join() === '2,0', `worn: the HUD's EXO row, its battery full (${worn.fill}) and both its dodge's charges`);
ok(worn.third === 13 && worn.flames === 2, `on you in third person: its frame (on ${worn.third} of your bones) and two thrusters`);
ok(worn.first === 4 || worn.first === 'bracer', `and its arms in first person (${worn.first})`);
await E(() => { const g = window.__app.game; g.player.yaw += Math.PI * 0.8; g.player.pitch = -0.15; T.step(0.2); });
await snap('2-third-person');
await E(() => { const g = window.__app.game; window.__app.thirdPerson = false; g.player.pitch = -0.25; T.step(0.3); });
await snap('3-first-person');

// ---- the boosts -----------------------------------------------------------------------------------
const jump = await E(() => {
  const g = window.__app.game, p = g.player;
  T.home();
  const y0 = p.pos.y;
  let top = y0;
  T.press('jump');
  for (let k = 0; k < 90 && !(p.onGround && k > 3); k++) { T.step(1 / 30); top = Math.max(top, p.pos.y); }
  const plain = top - y0;
  T.step(0.3);
  // again, with a boost at the top; then another press, higher up, that does nothing
  top = p.pos.y;
  T.press('jump');
  let boosted = false, again = null;
  for (let k = 0; k < 150 && !(p.onGround && k > 3); k++) {
    if (!boosted && p.vel.y <= 0.5) { T.press('jump'); boosted = p.vel.y > 8; }
    else if (boosted && again === null && p.vel.y < -2) { const v = p.vel.y; T.press('jump'); again = p.vel.y <= v; }
    else T.step(1 / 30);
    top = Math.max(top, p.pos.y);
  }
  const high = top - y0;
  // falling: a boost takes the fall's speed off
  T.home();
  p.pos.y += 12; p.fallStart = null;
  for (let k = 0; k < 60 && p.vel.y > -12; k++) T.step(1 / 30);
  const falling = p.vel.y;
  T.press('jump');
  const after = p.vel.y;
  window.hurts.length = 0;
  T.land();
  T.step(0.2);
  return { plain, high, boosted, again, falling, after, hurt: window.hurts.slice() };
});
ok(jump.plain > 2.25 && jump.plain <= 2.5 && jump.boosted && jump.high > jump.plain + 2.6 && jump.high < jump.plain + 3.2,
  `Boost Jump: jump again in the air, three metres more (${jump.plain.toFixed(2)} m, boosted ${jump.high.toFixed(2)} m)`);
ok(jump.again, 'once a jump: another press does nothing');
ok(jump.falling < -11.9 && jump.after > 9, `and falling, it takes the fall's speed off (${jump.falling.toFixed(1)} to ${jump.after.toFixed(1)} m/s)`);

const dodge = await E(() => {
  const g = window.__app.game, p = g.player, I = window.__app.input;
  T.home();
  p.yaw = 0;
  T.step(3.2);
  const full = g.exo.charges, go = (f) => { const a = p.pos.clone(); f(); const d = p.pos.clone().sub(a); return { d: T.flat(d), x: d.x, z: d.z }; };
  // standing: forward (yaw 0 faces -z)
  const d1 = go(() => { T.press('sprint'); T.step(0.6); });
  // going right: that way
  const d2 = go(() => { I.down('right'); T.press('sprint'); T.step(0.25); I.up('right'); T.step(0.4); });
  // none left: nothing; then they come back, the first a second and a half after the first went
  let none;
  const d3 = go(() => { T.press('sprint'); none = g.exo.charges; T.step(0.6); });
  const one = g.exo.charges;
  T.step(1.5); const two = g.exo.charges;
  // in the air too, holding you up a moment
  T.press('jump'); T.step(0.6);
  const vy = p.vel.y; T.press('sprint'); const held = p.vel.y;
  T.land(); T.step(0.3);
  return { full, d1, d2, d3, none, one, two, vy, held };
});
ok(dodge.full === 2 && dodge.d1.d > 2.5 && dodge.d1.d < 3.5 && -dodge.d1.z / dodge.d1.d > 0.99, `Boost Dodge: standing, forward (${dodge.d1.d.toFixed(2)} m)`);
ok(dodge.d2.d > 3 && dodge.d2.x / dodge.d2.d > 0.98, `going right, that way (${dodge.d2.d.toFixed(2)} m, with the walking)`);
ok(dodge.d3.d < 0.05 && dodge.none === 0 && dodge.one === 1 && dodge.two === 2, `two charges, none left after two, each back in a second and a half (${dodge.none} ${dodge.one} ${dodge.two})`);
// (the fall stopped, then two frames of it again)
ok(dodge.vy < -3 && dodge.held > -1.5, `in the air, it holds you up (${dodge.vy.toFixed(1)} to ${dodge.held.toFixed(1)} m/s)`);

const slam = await E(() => {
  const g = window.__app.game, p = g.player;
  T.home();
  T.step(3.2);
  // the dead: one by where it comes down, one further off but in reach, one out of it
  const z = [1.5, 3.2, 6].map((dx) => { const e = g.enemies.spawn(0, p.pos.x + dx, p.pos.y + 0.1, p.pos.z, 0.5); e.update = () => {}; return e; });
  const h0 = z.map((e) => e.health);
  const kills = g.stats.kills;
  window.hurts.length = 0;
  const y0 = p.pos.y;
  // from the top of a boost jump
  T.press('jump');
  for (let k = 0; k < 40 && p.vel.y > 0.5; k++) T.step(1 / 30);
  T.press('jump');
  for (let k = 0; k < 40 && p.vel.y > 0; k++) T.step(1 / 30);
  const top = p.pos.y - y0;
  T.press('crouch');
  const slamming = g.exo.slam, v = p.vel.y, straight = T.flat(p.vel);
  T.land(2);
  T.step(0.3);
  const r = { top, slamming, v, straight, z: z.map((e, i) => [h0[i], +e.health.toFixed(2), e.dead]), kills: g.stats.kills - kills, hurt: window.hurts.slice(), shake: g.shake };
  for (const e of z) e.gone = true;
  // not from low down: under two metres up
  T.home();
  T.press('jump'); T.step(0.05);
  const low = p.pos.y - y0;
  T.press('crouch');
  r.low = [+low.toFixed(2), g.exo.slam];
  T.land(); T.step(0.2);
  // from high up: as fast, and still no harm from it
  T.home();
  p.pos.y += 25; p.fallStart = null; T.step(1 / 30);
  window.hurts.length = 0;
  T.press('crouch');
  T.land(3); T.step(0.2);
  r.high = window.hurts.slice();
  return r;
});
ok(slam.slamming && slam.v <= -29.9 && slam.straight < 0.01, `Boost Slam: crouch at the top of a boost jump (${slam.top.toFixed(1)} m up): straight down at 30 m/s`);
ok(slam.z[0][1] < slam.z[0][0] && slam.z[1][1] < slam.z[1][0] && slam.z[0][0] - slam.z[0][1] > slam.z[1][0] - slam.z[1][1] && slam.z[2][1] === slam.z[2][0],
  `the dead round where it lands are hurt, the nearer the more; not those further off (${slam.z.map((z) => `${z[0]}->${z[1]}`).join(', ')})`);
ok(!slam.hurt.length && !slam.high.length && slam.shake > 0.3, `no harm to you from the fall, even from 25 m up (${JSON.stringify([...slam.hurt, ...slam.high])}); the ground shakes`);
ok(slam.low[0] < 2 && !slam.low[1], `not from low down (${slam.low[0]} m up)`);

const oc = await E(() => {
  const g = window.__app.game, p = g.player, I = window.__app.input, x = g.exo;
  T.home();
  const speed = () => { I.down('fwd'); T.step(0.5); const v = T.flat(p.vel); I.up('fwd'); T.step(0.3); return v; };
  const run = speed(), fov0 = g.camera.fov;
  const full = x.battery;
  T.press('ability');
  const on = x.overclock, hud = document.querySelector('.hud').classList.contains('overclock');
  const fast = speed(), fov = g.camera.fov / fov0;
  // how long it lasts, from full
  let t = 0.8 + 2 / 30;
  while (x.overclock && t < 8) { T.step(1 / 30); t += 1 / 30; }
  const r = { run, full, on, hud, fov, fast, lasted: t, spent: [x.overclock, +x.battery.toFixed(1)] };
  // back: after a second and a half, twelve and a half a second
  T.step(1.4); r.wait = +x.battery.toFixed(1);
  T.step(2.1); r.back = +x.battery.toFixed(1);
  // not under 10
  x.battery = 8; T.press('ability'); r.low = x.overclock;
  x.battery = 100;
  // the d-pad's down too, and again to stop
  T.press('down'); r.pad = x.overclock; T.press('down'); r.padOff = !x.overclock;
  return r;
});
ok(oc.run > 3.9 && oc.run < 4.1 && oc.fast > 5.9 && oc.fast < 6.1 && oc.on && oc.hud && oc.fov > 1.04, `Overclock: half as fast again (${oc.run.toFixed(2)} to ${oc.fast.toFixed(2)} m/s), the view wider (x${oc.fov.toFixed(3)}), the HUD lit for it`);
ok(oc.full === 100 && Math.abs(oc.lasted - 5) < 0.15 && !oc.spent[0] && oc.spent[1] === 0, `for as long as its battery lasts: from full, ${oc.lasted.toFixed(2)} s, then it stops`);
ok(oc.wait === 0 && oc.back > 23 && oc.back < 27, `its battery back after a second and a half, an eighth a second (${oc.wait} at 1.4 s, ${oc.back} at 3.5 s)`);
ok(!oc.low && oc.pad && oc.padOff, 'not on under a tenth; and on and off with the d-pad');

// ---- armor ----------------------------------------------------------------------------------------
const guard = await E(() => {
  const g = window.__app.game, p = g.player, inv = g.inventory;
  const d0 = inv.armor.dur, r = {};
  p.health = 100; p.hurt(20, null, 'hit'); r.hit = p.health; r.wear = +(d0 - inv.armor.dur).toFixed(2);
  p.health = 100; p.hurt(20, null, 'arrow'); r.arrow = p.health;
  p.health = 100; p.hurt(20, null, 'fall'); r.fall = p.health;
  p.health = 100; p.hurt(20, null, 'lava'); r.lava = p.health;
  // worn through: gone, and you're told
  inv.armor.dur = 3; p.health = 100; p.hurt(20, null, 'hit');
  T.step(0.1);
  r.gone = !inv.armor && !g.exo.worn && !g.player.exo;
  r.msg = g.hud.feed.map((f) => f.el.textContent).filter((t) => /worn out/.test(t));
  p.health = 100;
  return { ...r, uses: ITEMS.exo_suit.uses };
});
ok(guard.hit === 87 && guard.arrow === 87 && guard.wear === 7, `worn, it takes 35% of a hit, wearing by as much (20 -> ${100 - guard.hit}; ${guard.wear} of its ${guard.uses})`);
ok(guard.fall === 80 && guard.lava === 80, 'but not of a fall, nor of lava');
ok(guard.gone && guard.msg.length === 1, `worn through, it's gone ("${guard.msg[0]}")`);
const legs = await E(() => {
  const g = window.__app.game, p = g.player, inv = g.inventory;
  // (how fast it lands: from eight metres, 18 m/s; from twelve, 22)
  const was = p.onLand;
  let speed = 0;
  p.onLand = (v, b) => { speed = v; return was?.(v, b); };
  const drop = (h) => { T.home(); p.pos.y += h; p.fallStart = null; window.hurts.length = 0; T.step(1 / 30); T.land(3); T.step(0.2); p.health = 100; return [window.hurts.filter((x) => x[0] === 'fall').length, +speed.toFixed(1)]; };
  const without = drop(8);
  inv.armorBox[0] = inv.make('exo_suit', 1); inv.changed();
  T.step(0.1);
  const withIt = drop(8), twelve = drop(12);
  p.onLand = was;
  return { without, withIt, twelve };
});
ok(legs.without[0] === 1 && legs.withIt[0] === 0 && legs.twelve[0] === 1, `its legs take a fall of eight metres (${legs.withIt[1]} m/s; it hurts without it), not of twelve (${legs.twelve[1]} m/s)`);

// ---- kept ------------------------------------------------------------------------------------------
const kept = await E(() => {
  const g = window.__app.game, inv = g.inventory, Inv = inv.constructor;
  inv.armor.dur = 1234;
  const d = JSON.parse(JSON.stringify(g.serialize().inventory));
  const a = new Inv(); a.load(d);
  // lifted out of it on the inventory screen, it's saved where it came from
  inv.lift(0, false, inv.armorBox);
  const lifted = JSON.parse(JSON.stringify(inv.serialize()));
  inv.restore();
  // (and a save with something else in the armor slot: not put on)
  const b = new Inv(); b.load({ ...d, armor: { id: 'stone_pickaxe', count: 1, dur: 10 } });
  return { saved: d.armor, loaded: a.armor, lifted: lifted.armor, back: inv.armor?.id, bad: b.armor };
});
ok(kept.saved?.id === 'exo_suit' && kept.loaded?.id === 'exo_suit' && kept.loaded.dur === 1234, 'kept in the save, worn as much as it was');
ok(kept.lifted?.id === 'exo_suit' && kept.back === 'exo_suit', 'and in the save while lifted out of its slot');
ok(kept.bad === null, "a save with something else in the armor slot doesn't put that on");
const die = async (hard) => E(async (hard) => {
  const g = window.__app.game, p = g.player, inv = g.inventory;
  g.difficulty = hard ? 'hardcore' : 'normal';
  g.drops.list.length && g.drops.list.forEach((d) => { d.gone = true; });
  p.health = 1; p.hurt(10, null, 'test');
  T.step(0.1);
  const dead = p.dead, dropped = g.drops.list.filter((d) => !d.gone && d.id === 'exo_suit').length, worn = inv.armor?.id ?? null;
  g.respawn();
  return { dead, dropped, worn };
}, hard);
const d1 = await die(false);
ok(d1.dead && d1.worn === 'exo_suit' && !d1.dropped, 'dying, you keep it on, as the hotbar is kept');
await page.waitForFunction(() => window.__app.game.ready && !window.__app.game.player.dead, null, { timeout: 120000 }).catch(() => {});
const d2 = await die(true);
ok(d2.dead && !d2.worn && d2.dropped === 1, 'on Hardcore, it drops with everything else');
ok(logs.length === 0, `no errors${logs.length ? ': ' + logs.slice(0, 3).join(' | ') : ''}`);
logs.length = 0;

// ---- by touch ------------------------------------------------------------------------------------
page = await newPage(true);
await load();
const tb = (a) => `.touch .exob [data-a="${a}"]`;
const shown = () => E(() => getComputedStyle(document.querySelector('.touch .exob')).display);
const t0 = await shown();
await E(() => { const inv = window.__app.game.inventory; inv.armorBox[0] = inv.make('exo_suit', 1); inv.changed(); T.step(0.2); });
const t1 = await shown();
ok(t0 === 'none' && t1 === 'flex', `on a touch screen, its buttons show while it's worn (${t0}, then ${t1})`);
await snap('4-touch');
// (a tap, and time for the game to see it: its frames are slow in here)
const tap = async (sel, done) => { const p = await at(sel); await page.touchscreen.tap(p.x, p.y); await page.waitForFunction(done, null, { timeout: 15000, polling: 100 }).catch(() => {}); };
await tap(tb('sprint'), () => window.__app.game.exo.charges < 2);
await tap(tb('ability'), () => window.__app.game.exo.overclock);
const tt = await E(() => { const x = window.__app.game.exo; return { charges: x.charges, oc: x.overclock }; });
ok(tt.charges < 2 && tt.oc, `DASH dodges, OC overclocks (${JSON.stringify(tt)})`);
ok(logs.length === 0, `no errors there either${logs.length ? ': ' + logs.slice(0, 3).join(' | ') : ''}`);
await browser.close();
console.log(fails ? `${fails} failed` : 'all ok');
process.exit(fails ? 1 : 0);
