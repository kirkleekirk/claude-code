// Player controller: WASD move, mouse aim, LMB fire, R reload, Q swap, Shift sprint, C sneak,
// Space dodge-roll, G throw, E interact, V melee/takedown, F squad order, X vehicle.
import { T, moveBox, angleTo, dirFromAngle, dist } from './core.js';
import { gunStats, gunName } from '../sim/craft.js';
import { VEHICLES } from '../data/progress.js';
import { THROWABLES } from '../data/guns.js';
import { count, takeItem } from '../sim/inventory.js';

export function makePlayer(S) {
  return {
    id: 0, kind: 'player', isPlayer: true, faction: 'player', x: S.player.x, y: S.player.y, r: 6, alive: true, hittable: true, ko: false,
    hp: S.player.hp, maxHp: S.player.maxHp, dir: 0, face: Math.PI / 2, anim: 0, moving: false, sneaking: false, sprint: false,
    stamina: 1, rollT: 0, rollCd: 0, iframes: 0, vx: 0, vy: 0, hurtT: 0, weapons: [null, null, null], wsel: 0, vehicle: null, inLight: false,
  };
}

// Sync weapon runtime from loadout guns (keeps loaded rounds per gun on the gun record).
export function syncWeapons(world) {
  const S = world.S, P = world.player;
  for (let i = 0; i < 3; i++) {
    const id = S.player.loadout[i];
    const g = id ? S.guns.find((x) => x.id === id) : null;
    if (!g) { if (S.player.loadout[i]) S.player.loadout[i] = null; P.weapons[i] = null; continue; }
    const cur = P.weapons[i];
    const st = gunStats(S, g);
    if (cur && cur.gun === g) { cur.st = st; continue; }
    P.weapons[i] = { gun: g, st, loaded: Math.min(g.loaded || 0, st.mag), reloadT: 0, cd: 0, bloom: 0, jammed: false, ammoVar: g.ammoVar || 'std' };
  }
  if (!P.weapons[P.wsel]) P.wsel = P.weapons.findIndex(Boolean) >= 0 ? P.weapons.findIndex(Boolean) : 0;
}

export function currentWeapon(world) { const P = world.player; return P.weapons[P.wsel] || null; }

export function updatePlayer(world, dt, input, aim, uiBlocked) {
  const P = world.player;
  const S = world.S;
  if (!P.alive) return;
  if (P.hurtT > 0) P.hurtT -= dt;
  if (P.iframes > 0) P.iframes -= dt;
  if (P.rollCd > 0) P.rollCd -= dt;
  const wpn = currentWeapon(world);
  for (const w of P.weapons) if (w) world.combat.updateWeapon(P, w, dt);
  // Vehicle driving.
  if (P.vehicle) return driveVehicle(world, dt, input);
  let mx = 0, my = 0;
  if (!uiBlocked) {
    if (input.down('left')) mx--;
    if (input.down('right')) mx++;
    if (input.down('up')) my--;
    if (input.down('down')) my++;
    if (input.pad.active) { mx += input.pad.lx; my += input.pad.ly; }
  }
  if (input.pressed('sneak') && !uiBlocked) { P.sneaking = !P.sneaking; world.toast(P.sneaking ? 'Sneaking: slower, quieter, harder to see.' : 'Walking.'); }
  const n = Math.hypot(mx, my);
  if (n > 1) { mx /= n; my /= n; }
  P.sprint = !uiBlocked && input.down('sprint') && n > 0 && P.stamina > 0.05 && !P.sneaking;
  const adren = world.perk('gun_dodge');
  if (P.sprint) P.stamina = Math.max(0, P.stamina - dt * (adren ? 0.22 : 0.3)); else P.stamina = Math.min(1, P.stamina + dt * 0.25);
  // Dodge roll.
  if (!uiBlocked && input.pressed('dodge') && P.rollCd <= 0 && P.rollT <= 0) {
    const a = n > 0 ? Math.atan2(my, mx) : P.face;
    P.rollT = 0.32; P.rollA = a; P.iframes = 0.3; P.rollCd = adren ? 0.55 : 0.85;
    world.sfx('dodge', P);
  }
  let speed = 3.6 * T;
  if (P.sprint) speed *= 1.55;
  if (P.sneaking) speed *= world.perk('fx_feet') ? 0.72 : 0.55;
  if (P.slowT > 0) { speed *= 0.5; P.slowT -= dt; }
  const carry = world.carryLoad();
  if (carry > world.carryCap()) speed *= 0.6;
  if (P.rollT > 0) {
    P.rollT -= dt;
    moveBox(world.Q, P, Math.cos(P.rollA) * 9 * T * dt, Math.sin(P.rollA) * 9 * T * dt);
  } else if (n > 0) {
    moveBox(world.Q, P, mx * speed * dt, my * speed * dt);
  }
  P.vx = mx * speed; P.vy = my * speed;
  P.moving = n > 0;
  if (P.moving) { P.anim += dt * (P.sprint ? 12 : 8); if (P.sprint && Math.random() < dt * 4) world.R.fx.dust(P.x, P.y, 1); if (P.sprint && !world.perk('fx_feet')) world.combat.noise(P.x, P.y, 4 * T, P); }
  // Aim + facing.
  P.face = Math.atan2(aim.y - P.y, aim.x - P.x);
  P.dir = dirFromAngle(P.face);
  if (uiBlocked) return;
  // Weapon select.
  for (let i = 0; i < 3; i++) if (input.pressed('slot' + (i + 1)) && P.weapons[i]) { P.wsel = i; world.sfx('tick', P); }
  if (input.pressed('swap')) { for (let k = 1; k <= 3; k++) { const j = (P.wsel + k) % 3; if (P.weapons[j]) { P.wsel = j; break; } } world.sfx('tick', P); }
  if (input.mouse.wheel && !world.game.ui.overUI) { const dir = Math.sign(input.mouse.wheel); for (let k = 1; k <= 3; k++) { const j = (P.wsel + dir * k + 9) % 3; if (P.weapons[j]) { P.wsel = j; break; } } }
  if (input.pressed('reload') && wpn) world.combat.startReload(P, wpn);
  // Fire: semi-auto for slow guns, auto above 300 rpm.
  const firing = (input.mouse.down[0] && !world.game.ui.overUI) || (input.pad.active && input.padDown('fire'));
  const fresh = (input.mouse.pressed[0] && !world.game.ui.overUI) || (input.pad.active && input.padPressed('fire'));
  if (wpn && P.rollT <= 0 && (fresh || (firing && wpn.st.rpm >= 300))) {
    const accMult = (world.perk('gun_aim') ? 1 : 1) * (P.sneaking ? 1.1 : 1);
    const unawareTarget = null;
    void unawareTarget;
    if (world.combat.tryFire(P, wpn, aim.x, aim.y, { accMult })) { wpn.gun.loaded = wpn.loaded; world.onPlayerShot(wpn); }
  }
  if (wpn) wpn.gun.loaded = wpn.loaded;
  // Throwables.
  if (input.pressed('throw') || input.pressed('slot4')) {
    const t = S.player.throwSel;
    if (input.pressed('slot4')) { cycleThrowable(world); }
    else if (t && count(S, t) > 0) { takeItem(S, t, 1); world.combat.throwItem(P, t, aim.x, aim.y); }
    else world.toast(`No ${t ? THROWABLES[t].name : 'throwables'} left. Craft them at the bench or buy at Crossroads.`);
  }
  if (input.pressed('melee')) world.melee(P);
  if (input.pressed('squad')) world.cycleSquadOrder(aim);
  if (input.pressed('vehicle')) world.toggleVehicle();
  if (input.pressed('interact')) world.interact();
}

export function cycleThrowable(world) {
  const S = world.S;
  const opts = Object.keys(THROWABLES);
  const cur = opts.indexOf(S.player.throwSel);
  for (let k = 1; k <= opts.length; k++) { const t = opts[(cur + k) % opts.length]; if (count(S, t) > 0 || k === opts.length) { S.player.throwSel = t; break; } }
  world.toast(`Throwable: ${THROWABLES[S.player.throwSel].name} (${count(S, S.player.throwSel)})`);
}

function driveVehicle(world, dt, input) {
  const P = world.player;
  const v = P.vehicle;
  const V = VEHICLES[v.type];
  let thr = 0, steerIn = 0;
  if (input.down('up')) thr += 1;
  if (input.down('down')) thr -= 0.6;
  if (input.down('left')) steerIn -= 1;
  if (input.down('right')) steerIn += 1;
  const maxSp = V.speed * 4.2 * T;
  v.speed += thr * maxSp * 1.6 * dt;
  v.speed *= 1 - dt * (thr ? 0.6 : 1.8);
  v.speed = Math.max(-maxSp * 0.4, Math.min(maxSp, v.speed));
  v.angle += steerIn * dt * 2.6 * Math.min(1, Math.abs(v.speed) / (2 * T)) * Math.sign(v.speed || 1);
  const dx = Math.cos(v.angle) * v.speed * dt, dy = Math.sin(v.angle) * v.speed * dt;
  const ok = moveBox(world.Q, v, dx, dy, 7, 5);
  if (!ok && Math.abs(v.speed) > 2 * T) { world.damageVehicle(v, Math.abs(v.speed) / T * 1.5); v.speed *= -0.3; world.shake(2); }
  P.x = v.x; P.y = v.y;
  P.moving = Math.abs(v.speed) > 4;
  // Ram enemies.
  if (Math.abs(v.speed) > 3 * T) for (const e of world.hash.query(v.x, v.y, 16, [])) if (e !== P && e.alive && e.hittable && e.kind !== 'vehicle' && dist(e, v) < 13 && world.hostileTo(e, P)) world.damage(e, Math.abs(v.speed) / T * (V.armor ? 7 : 4), P, { dir: v.angle, ram: true });
  if (Math.random() < dt * 6 * Math.min(1, Math.abs(v.speed) / maxSp)) world.sfx('engine', v);
  if (input.pressed('vehicle') || input.pressed('interact')) world.toggleVehicle();
}

export { gunName, angleTo };
