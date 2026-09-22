/* A trip on the train: setup, the main loop, loot, interactions, blizzard, extraction and wipes. */
(function () {
  'use strict';
  const D = AE.data;
  const R = AE.R;
  const U = AE.U;
  const GF = AE.game.gfx;
  const MD = AE.game.models;
  const WG = AE.game.world;
  const AC = AE.game.actors;
  const C = AE.game.combat;
  const IN = AE.game.input;
  const M = AE.meta;
  const RA = {};
  let run = null;

  RA.current = () => run;

  RA.start = function (G, offerId, hooks) {
    const offer = G.board.find((o) => o.id === offerId);
    if (!offer || !GF.ok) return null;
    const S = M.stats.compute(G);
    const train = WG.generate(G, offer);
    WG.buildMeshes(train);
    GF.scene.add(train.root);
    GF.scene.fog = new THREE.Fog(new THREE.Color(train.route.sky[1]), 38, 110);
    GF.scene.background = new THREE.Color(train.route.sky[1]);
    const T = S.team;
    const blizzardMax = train.route.blizzard * (1 + T.blizzardSlow) / (offer.mod === 'express' ? 1.25 : 1) / (1 + (T.hooks.blizzardFast || 0));
    run = {
      G, S, train, offer, hooks: hooks || {}, time: 0, active: 'finn', enemies: [], projectiles: [], zones: [], drops: [], coins: [], backpack: [], gold: 0, xp: 0,
      meter: 0, blizzardT: 0, blizzardMax, blizzard: 0, whiteout: null, switchCd: 0, once: {}, timers: {}, stats: { dmg: 0, kills: 0, elites: 0, chests: 0, supers: 0 },
      luckBonus: offer.mod === 'crowded' ? 0.25 : 0, over: null, paused: false, princess: null, decoy: null, inCombat: false, hitstopT: 0, shakeT: 0,
      interact: { target: null, p: 0 }, fullNoteT: 0, carIdx: 0, bossDown: false, cam: { x: 4, z: 0 },
    };
    const c0 = train.cars[0];
    run.heroes = { finn: AC.makeHero(run, 'finn', c0.x0 + 4, 0.8), jake: AC.makeHero(run, 'jake', c0.x0 + 3, -1.2) };
    bindRunApi(run);
    run.cam.x = c0.x0 + 6;
    IN.reset();
    IN.enabled = true;
    AE.ui.hud.show(run);
    run.banner(train.route.name, 'route');
    return run;
  };

  function bindRunApi(r) {
    r.popup = (x, y, z, text, cls) => AE.ui.hud.popup(x, y, z, text, cls);
    r.banner = (text, cls) => AE.ui.hud.banner(text, cls);
    r.hudNote = (text) => AE.ui.hud.note(text);
    r.shake = (s) => { if (AE.sfx.settings.shake !== false) r.shakeT = Math.max(r.shakeT, s); };
    r.hitstop = (t) => { r.hitstopT = Math.max(r.hitstopT, t); };
    r.addMeter = (amt, S) => { const before = r.meter; r.meter = Math.min(100, r.meter + amt * (1 + ((S && S.meterGain) || 0))); if (before < 100 && r.meter >= 100) { r.banner('Super ready! Press R', 'super'); } };
    r.setActive = (id, forced) => {
      r.active = id;
      if (forced) r.switchCd = 0.5;
      AE.ui.hud.refresh(r);
    };
    r.wipe = () => { if (!r.over) { r.overT = 1.4; r.pendingOver = 'wiped'; } };
    r.extract = (how) => { if (!r.over && !r.pendingOver) { r.pendingOver = 'escaped'; r.how = how; r.overT = 0.6; AE.sfx.play('extract'); r.banner(how === 'brake' ? 'The train screeches to a stop!' : how === 'flare' ? 'Lady Rainicorn swoops in!' : 'You leap off the train!', 'good'); } };
    r.spawnLoot = (x, z, loot) => spawnLoot(r, x, z, loot);
    r.smashNear = (h, reach, arcR, power) => smash(r, h.x, h.z, reach, power, h.facing, arcR);
    r.smashAt = (x, z, rad, power) => smash(r, x, z, rad, power, null, null);
    r.damageBreakable = (b, n) => damageBreakable(r, b, n);
    r.checkCarClear = (ci) => {
      const car = r.train.cars[ci];
      if (!car || car.cleared) return;
      if (!r.enemies.some((e) => !e.dead && e.car === ci)) { car.cleared = true; if (car.spawned && ci === r.carIdx) r.banner('Car cleared!', 'good'); }
    };
    r.onBossDown = () => { r.bossDown = true; r.banner('The Ice King is defeated! Pull the brake!', 'super'); AE.sfx.play('levelup'); };
  }

  /* ---------- loot ---------- */
  function spawnLoot(r, x, z, loot) {
    if (loot.gold > 0) {
      const n = Math.min(8, Math.max(1, Math.ceil(loot.gold / 6)));
      const each = loot.gold / n;
      for (let i = 0; i < n; i++) {
        const m = MD.coin();
        m.position.set(x, 0.3, z);
        GF.scene.add(m);
        const a = Math.random() * Math.PI * 2, s = R.float(1.5, 3.5);
        r.coins.push({ x, z, y: 0.3, vx: Math.cos(a) * s, vz: Math.sin(a) * s, vy: R.float(3, 5), mesh: m, value: each, t: 0 });
      }
    }
    for (const it of loot.items) dropItem(r, x, z, it, false);
  }
  function dropItem(r, x, z, it, manual) {
    const m = MD.drop(it);
    const a = Math.random() * Math.PI * 2, d = manual ? 0.8 : R.float(0.6, 1.6);
    const p = { x: x + Math.cos(a) * d, z: z + Math.sin(a) * d };
    WG.resolve(r.train, p, 0.3);
    m.position.set(p.x, 0, p.z);
    GF.scene.add(m);
    r.drops.push({ item: it, x: p.x, z: p.z, mesh: m, manual: !!manual, t: 0 });
    if (it.rarity >= 3 && !manual) { AE.sfx.play('rare'); r.popup(p.x, 1.6, p.z, D.RARITIES[it.rarity].name + '!', 'r' + it.rarity); }
  }
  function tryPickup(r, drop) {
    const it = drop.item;
    const T = r.S.team;
    if (it.kind === 'consumable') {
      for (const list of [r.G.belt, r.backpack]) for (const s of list) if (s && s.kind === 'consumable' && s.base === it.base && s.qty < D.STACK_MAX) {
        const m = Math.min(D.STACK_MAX - s.qty, it.qty); s.qty += m; it.qty -= m; if (it.qty <= 0) return true;
      }
      const e = r.G.belt.findIndex((b) => !b);
      if (e >= 0 && it.base !== 'skeleton_key') { r.G.belt[e] = it; return true; }
    }
    if (r.backpack.length >= T.backpack) return false;
    r.backpack.push(it);
    return true;
  }
  function updateLoot(r, dt, act) {
    const heroesAlive = [r.heroes.finn, r.heroes.jake].filter((h) => !h.ko);
    for (let i = r.coins.length - 1; i >= 0; i--) {
      const c = r.coins[i];
      c.t += dt;
      const near = heroesAlive.reduce((b, h) => { const d2 = U.dist2(h.x, h.z, c.x, c.z); return d2 < b.d2 ? { h, d2 } : b; }, { h: null, d2: 9 });
      if (c.t > 0.5 && near.h) {
        const dx = near.h.x - c.x, dz = near.h.z - c.z, d = Math.sqrt(near.d2) || 1;
        c.x += (dx / d) * 12 * dt; c.z += (dz / d) * 12 * dt; c.y = U.lerp(c.y, 0.8, dt * 10);
        if (d < 0.6) { r.gold += c.value; GF.scene.remove(c.mesh); r.coins.splice(i, 1); AE.sfx.play('coin'); continue; }
      } else {
        c.vy -= 14 * dt; c.x += c.vx * dt; c.z += c.vz * dt; c.y += c.vy * dt;
        if (c.y < 0.3) { c.y = 0.3; c.vy = Math.abs(c.vy) * 0.35; c.vx *= 0.6; c.vz *= 0.6; }
        const p = { x: c.x, z: c.z }; WG.resolve(r.train, p, 0.2); c.x = p.x; c.z = p.z;
      }
      c.mesh.position.set(c.x, c.y - 0.3, c.z);
      c.mesh.userData.spin.rotation.z += dt * 6;
    }
    r.fullNoteT = Math.max(0, r.fullNoteT - dt);
    for (let i = r.drops.length - 1; i >= 0; i--) {
      const d = r.drops[i];
      d.t += dt;
      d.mesh.userData.spin.rotation.y += dt * 2;
      d.mesh.userData.spin.position.y = 0.55 + Math.sin(d.t * 3) * 0.1;
      if (d.t < 0.5 || act.ko) continue;
      if (U.dist2(act.x, act.z, d.x, d.z) > 1.3) continue;
      if (d.manual && !IN.isHeld('interact')) continue;
      if (tryPickup(r, d)) {
        GF.scene.remove(d.mesh);
        r.drops.splice(i, 1);
        AE.sfx.play(d.item.rarity >= 3 ? 'rare' : 'pickup');
        AE.ui.hud.loot(d.item);
        if (d.item.relic) r.G.codex.relics[d.item.relic] = true;
      } else if (r.fullNoteT <= 0) { r.fullNoteT = 2.5; r.hudNote('Backpack full! Press I to drop or stash something in Jake’s tummy.'); }
    }
  }

  /* ---------- smashing things ---------- */
  function damageBreakable(r, b, n) {
    if (!b.alive) return;
    b.hp -= n;
    b.mesh.position.x = b.x + R.float(-0.08, 0.08);
    if (b.hp > 0) { AE.sfx.play('hit'); return; }
    b.alive = false;
    b.ob.active = false;
    GF.scene.remove(b.mesh);
    GF.burst(b.x, 0.5, b.z, b.type === 'luggage' ? '#e05a47' : '#c98d4e', 10, 4, { size: 0.16 });
    AE.sfx.play('break');
    spawnLoot(r, b.x, b.z, M.loot.drops('breakable', r.train.tier, r.S.team, { luckBonus: r.luckBonus }));
  }
  function smash(r, x, z, reach, power, facing, arcR) {
    const inArc = (px, pz, rad) => {
      const dx = px - x, dz = pz - z;
      const d = Math.hypot(dx, dz);
      if (d > reach + rad) return false;
      if (facing == null || d < 1) return true;
      return Math.abs(U.angleDiff(facing, Math.atan2(dx, dz))) <= arcR / 2 + 0.3;
    };
    for (const b of r.train.breakables) if (b.alive && Math.abs(b.x - x) < reach + 1 && inArc(b.x, b.z, b.s / 2)) damageBreakable(r, b, power);
    for (const car of r.train.cars) {
      if (car.lock && !car.lock.open && Math.abs(car.lock.x - x) < reach + 1 && inArc(car.lock.x, 0, 1.2)) {
        car.lock.hp -= power;
        AE.sfx.play('hit');
        r.popup(car.lock.x, 1.6, 0, car.lock.hp > 0 ? 'Clang!' : 'Smashed!', 'status');
        if (car.lock.hp <= 0) openLock(r, car);
      }
      if (car.ice && !car.ice.broken && inArc(car.ice.x, car.ice.z, 0.8)) {
        car.ice.hp -= power;
        GF.burst(car.ice.x, 1, car.ice.z, '#bfeeff', 5, 3, { size: 0.1 });
        AE.sfx.play('freeze');
        if (car.ice.hp <= 0) freePrincess(r, car);
      }
    }
  }
  function openLock(r, car) {
    car.lock.open = true;
    car.lock.ob.active = false;
    car.locked = false;
    car.group.remove(car.lock.mesh);
    GF.burst(car.lock.x, 1.2, 0, '#8a8f9a', 14, 5);
    r.banner('The vault is open!', 'good');
    AE.sfx.play('open');
  }
  function freePrincess(r, car) {
    car.ice.broken = true;
    car.ice.ob.active = false;
    car.group.remove(car.ice.mesh);
    GF.burst(car.ice.x, 1.2, car.ice.z, '#dff6ff', 18, 5);
    const m = MD.princess(car.ice.princess);
    m.position.set(car.ice.x, 0, car.ice.z);
    GF.scene.add(m);
    r.princess = { def: car.ice.princess, mesh: m, x: car.ice.x, z: car.ice.z };
    r.banner(`${car.ice.princess.name} is free! Get her off the train!`, 'super');
    AE.sfx.play('levelup');
  }

  /* ---------- interactions ---------- */
  function hasKey(r) {
    const i = r.G.belt.findIndex((b) => b && b.base === 'skeleton_key');
    if (i >= 0) return { list: r.G.belt, i, belt: true };
    const j = r.backpack.findIndex((b) => b.base === 'skeleton_key');
    return j >= 0 ? { list: r.backpack, i: j } : null;
  }
  function useKey(r, k) { const s = k.list[k.i]; s.qty -= 1; if (s.qty <= 0) { if (k.belt) k.list[k.i] = null; else k.list.splice(k.i, 1); } }
  function interactables(r, act) {
    const out = [];
    const buddy = act.id === 'finn' ? r.heroes.jake : r.heroes.finn;
    if (buddy.ko) out.push({ kind: 'revive', x: buddy.x, z: buddy.z, r: 1.8, time: 2.5 / (1 + r.S.team.reviveSpeed), label: `Wake up ${buddy.id === 'finn' ? 'Finn' : 'Jake'}` });
    for (const it of r.train.inter) {
      if (it.kind === 'chest' && it.ref.opened) continue;
      if (it.kind === 'lock' && it.ref.open) continue;
      if (it.kind === 'snail' && r.once.snail) continue;
      out.push(it);
    }
    return out;
  }
  function labelFor(r, it) {
    switch (it.kind) {
      case 'chest': return it.ref.locked ? (hasKey(r) ? 'Unlock the chest (Skeleton Key)' : 'Locked — needs a Skeleton Key') : 'Open the chest';
      case 'lock': return hasKey(r) ? 'Unlock the vault (Skeleton Key)' : 'Locked — smash the gate or bring a Skeleton Key';
      case 'bailout': return r.princess ? `Bail out with ${r.princess.def.name}` : 'Bail out — jump off the train';
      case 'brake': return r.train.route.final && !r.bossDown ? 'The Ice King won’t let you near the brake!' : 'Pull the emergency brake';
      case 'snail': return 'Wave at the snail';
      default: return it.label || '';
    }
  }
  function canComplete(r, it) {
    if (it.kind === 'chest' && it.ref.locked && !hasKey(r)) return false;
    if (it.kind === 'lock' && !hasKey(r)) return false;
    if (it.kind === 'brake' && r.train.route.final && !r.bossDown) return false;
    return true;
  }
  function complete(r, it) {
    switch (it.kind) {
      case 'chest': {
        const c = it.ref;
        if (c.locked) { const k = hasKey(r); if (!k) return; useKey(r, k); }
        c.opened = true;
        c.mesh.userData.lid.rotation.x = -1.9;
        r.stats.chests += 1;
        spawnLoot(r, c.x, c.z + 0.6, M.loot.drops(c.fancy ? 'vaultChest' : 'chest', r.train.tier, r.S.team, { luckBonus: r.luckBonus }));
        GF.burst(c.x, 0.9, c.z, '#ffcf3d', 12, 4, { add: true });
        AE.sfx.play('open');
        break;
      }
      case 'lock': { const k = hasKey(r); if (k) { useKey(r, k); openLock(r, r.train.cars[it.car]); } break; }
      case 'bailout': r.extract('bailout'); break;
      case 'brake': { const car = r.train.cars[it.car]; if (car.leverMesh) car.leverMesh.userData.arm.rotation.x = 0.7; r.extract('brake'); break; }
      case 'snail': {
        r.once.snail = true;
        r.luckBonus += 0.3;
        r.banner('The Waving Snail waves back. You feel lucky!', 'good');
        const car = r.train.cars[it.car];
        spawnLoot(r, it.x, it.z, { gold: 50 * r.train.tier, items: [M.loot.rollGear(r.train.tier, { minRarity: 2, luck: 0.5 })] });
        if (car.snailMesh) car.snailMesh.userData.stalk.rotation.z = 0.8;
        break;
      }
      case 'revive': C.revive(r, it.kind === 'revive' && r.active === 'finn' ? r.heroes.jake : r.heroes.finn, 0.3); break;
      default: break;
    }
  }
  function updateInteract(r, dt, act) {
    let best = null, bd = Infinity;
    if (!act.ko) for (const it of interactables(r, act)) {
      const d2 = U.dist2(act.x, act.z, it.x, it.z);
      if (d2 < it.r * it.r && d2 < bd) { bd = d2; best = it; }
    }
    const I = r.interact;
    if (best !== I.target) { I.target = best; I.p = 0; }
    if (!best) return;
    best.label = labelFor(r, best);
    if (IN.isHeld('interact') && canComplete(r, best)) {
      I.p += dt * (1 + r.S.team.interactSpeed);
      if (I.p >= best.time) { const t = best; I.p = 0; I.target = null; complete(r, t); }
    } else I.p = Math.max(0, I.p - dt * 2);
  }

  /* ---------- spawning ---------- */
  function spawnCar(r, car) {
    car.entered = true;
    const t = car.def;
    const tier = r.train.tier;
    const hero = r.heroes[r.active];
    let n = t.enemies ? R.int(t.enemies[0], t.enemies[1]) : 0;
    if (r.offer.mod === 'crowded') n = Math.round(n * 1.4);
    if (tier >= 4 && n) n += 1;
    const pool = [].concat(...r.train.route.fams.map((f) => D.FAMILIES[f] || []));
    for (let i = 0; i < n; i++) {
      const p = WG.freeSpot(r.train, car, 0.7, { x: hero.x, z: hero.z, r: 5.5 });
      if (p) AC.spawnEnemy(r, R.pick(pool), p.x, p.z, { car: car.i });
    }
    if (car.elite) {
      const p = WG.freeSpot(r.train, car, 1, { x: hero.x, z: hero.z, r: 8 }) || { x: (car.x0 + car.x1) / 2, z: 0 };
      if (tier >= 2) { const e = AC.spawnEnemy(r, R.pick(['lemongrab', 'magic_man']), p.x, p.z, { car: car.i }); r.banner(e.name + ' blocks the way!', 'bad'); }
      else { AC.spawnEnemy(r, 'slime', p.x, p.z, { car: car.i, promote: true }); r.banner('A King Slime oozes out!', 'bad'); }
    }
    if (car.boss) {
      const e = AC.spawnEnemy(r, car.boss, car.x1 - 8, 0, { car: car.i });
      r.boss = e;
      r.banner('THE ICE KING!', 'bad');
      r.popup(e.x, 3.5, e.z, 'You stole my princesses!', 'crit');
    }
    car.spawned = n > 0 || !!car.elite || !!car.boss;
    car.cleared = !car.spawned;
    if (car.i > 0) AE.ui.hud.carName(car);
  }

  /* ---------- the loop ---------- */
  RA.update = function (dtRaw) {
    const r = run;
    if (!r) return;
    let dt = Math.min(0.05, dtRaw);
    if (IN.take('pause')) { AE.ui.hud.togglePause(r); }
    if (IN.take('inventory')) { AE.ui.hud.toggleInventory(r); }
    if (r.paused) { IN.endFrame(); return; }
    if (r.pendingOver) {
      r.overT -= dt;
      if (r.overT <= 0) { finish(r, r.pendingOver); IN.endFrame(); return; }
    }
    if (r.hitstopT > 0) { r.hitstopT -= dt; dt *= 0.08; }
    r.time += dt;
    r.switchCd = Math.max(0, r.switchCd - dt);
    const act = r.heroes[r.active];
    const buddy = r.active === 'finn' ? r.heroes.jake : r.heroes.finn;
    if (!r.pendingOver) {
      if (IN.take('switch')) C.switchHero(r);
      for (let i = 0; i < 3; i++) if (IN.take('belt' + i)) C.useBelt(r, i);
      if (r.superAct) { r.superAct.update(dt, IN); AC.updatePlayer && tickOnly(r, act, dt); }
      else AC.updatePlayer(r, act, dt, IN);
      if (!(r.superAct)) AC.updateBuddy(r, buddy, act, dt); else tickOnly(r, buddy, dt);
    }
    for (const h of [act, buddy]) {
      if (h.ko) continue;
      if (!(r.superAct && h === buddy)) { h.x += h.vx * dt; h.z += h.vz * dt; }
      if (!(r.superAct && h === buddy) && !(h.state === 'ability' && h.liftY > 0.3)) WG.resolve(r.train, h, h.r * Math.min(1.4, h.scale));
    }
    const alive = [];
    for (const e of r.enemies) {
      if (e.dead) continue;
      AC.updateEnemy(r, e, dt);
      if (e.dead) continue;
      e.x += e.vx * dt; e.z += e.vz * dt;
      alive.push(e);
    }
    for (let i = 0; i < alive.length; i++) {
      const a = alive[i];
      for (let j = i + 1; j < alive.length; j++) {
        const b = alive[j];
        const dx = b.x - a.x, dz = b.z - a.z, rr = a.r + b.r;
        const d2 = dx * dx + dz * dz;
        if (d2 < rr * rr && d2 > 1e-6) { const d = Math.sqrt(d2), push = (rr - d) / 2; a.x -= (dx / d) * push; a.z -= (dz / d) * push; b.x += (dx / d) * push; b.z += (dz / d) * push; }
      }
      for (const h of [act, buddy]) {
        if (h.ko || a.boss) continue;
        const dx = a.x - h.x, dz = a.z - h.z, rr = a.r + h.r * 0.8;
        const d2 = dx * dx + dz * dz;
        if (d2 < rr * rr && d2 > 1e-6) { const d = Math.sqrt(d2); a.x = h.x + (dx / d) * rr; a.z = h.z + (dz / d) * rr; }
      }
      WG.resolve(r.train, a, a.r);
    }
    r.enemies = alive;
    C.updateProjectiles(r, dt);
    C.updateZones(r, dt);
    C.periodic(r, dt);
    GF.updateFx(dt);
    updateLoot(r, dt, act);
    const car = WG.carAt(r.train, act.x);
    if (car) { r.carIdx = car.i; if (!car.entered && act.x > car.x0 + 1.2) spawnCar(r, car); }
    r.inCombat = r.enemies.some((e) => e.car === r.carIdx);
    updateInteract(r, dt, act);
    if (r.princess) {
      const p = r.princess, lead = buddy.ko ? act : buddy;
      const tx = lead.x - Math.sin(lead.facing) * 1.6, tz = lead.z - Math.cos(lead.facing) * 1.6;
      const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
      if (d > 0.5) { const s = Math.min(d, 7 * dt * (d > 6 ? 2 : 1)); p.x += (dx / d) * s; p.z += (dz / d) * s; p.mesh.rotation.y = Math.atan2(dx, dz); }
      const q = { x: p.x, z: p.z }; WG.resolve(r.train, q, 0.4); p.x = q.x; p.z = q.z;
      p.mesh.position.set(p.x, Math.abs(Math.sin(r.time * 8)) * 0.05, p.z);
    }
    /* blizzard */
    if (!r.pendingOver) {
      r.blizzardT += dt;
      r.blizzard = Math.min(1, r.blizzardT / r.blizzardMax);
      if (r.blizzard >= 1 && r.whiteout == null) { r.whiteout = 25; r.banner('WHITEOUT! Get off the train!', 'bad'); AE.sfx.play('freeze'); }
      if (r.whiteout != null) {
        r.whiteout -= dt;
        for (const h of [act, buddy]) if (!h.ko) { h.hp -= h.maxHp * 0.02 * dt; h.st.chill = Math.max(h.st.chill || 0, 0.3); if (h.hp <= 0) { h.hp = 1; C.hurtHero(r, h, 5, null, { dot: true }); } }
        if (r.whiteout <= 0 && !r.pendingOver) { r.banner('Frozen solid...', 'bad'); r.pendingOver = 'wiped'; r.overT = 1.2; r.frozen = true; }
      }
    }
    if (r.decoy && (r.decoy.t -= dt) <= 0) r.decoy = null;
    for (const h of [act, buddy]) {
      AC.animateHero(r, h, dt);
      if (h.buffs.shield && !h.shieldMesh) { h.shieldMesh = new THREE.Mesh(GF.geo('sphere', 1.1, 20, 14), GF.basic('#7fe3ff', { opacity: 0.25, add: true })); h.mesh.add(h.shieldMesh); h.shieldMesh.position.y = 0.8; }
      if (!h.buffs.shield && h.shieldMesh) { h.mesh.remove(h.shieldMesh); h.shieldMesh = null; }
    }
    for (const e of r.enemies) AC.animateEnemy(e, dt);
    for (const car2 of r.train.cars) {
      if (car2.bailoutMesh) car2.bailoutMesh.material.opacity = 0.2 + Math.sin(r.time * 4) * 0.1;
      if (car2.snailMesh && !r.once.snail) car2.snailMesh.userData.stalk.rotation.z = Math.sin(r.time * 6) * 0.6;
    }
    updateCamera(r, act, dt);
    r.train.skyTex.offset.x += dt * 0.012;
    r.train.groundTex.offset.x += dt * 1.6;
    r.train.sky.position.x = GF.camera.position.x;
    AE.ui.hud.update(r, dt);
    IN.endFrame();
  };
  function tickOnly(r, h, dt) {
    for (const k in h.cds) h.cds[k] = Math.max(0, h.cds[k] - dt);
    for (const k in h.buffs) if (typeof h.buffs[k] === 'number') h.buffs[k] = Math.max(0, h.buffs[k] - dt);
    h.stateT += dt;
  }
  function updateCamera(r, act, dt) {
    const target = act.ko ? (r.active === 'finn' ? r.heroes.jake : r.heroes.finn) : act;
    const aim = act.aim;
    let tx = target.x + (aim ? (aim.x - target.x) * 0.12 : 0);
    tx = U.clamp(tx, r.train.minX + 6, r.train.maxX - 6);
    const tz = target.z * 0.35;
    r.cam.x = U.lerp(r.cam.x, tx, Math.min(1, dt * 6));
    r.cam.z = U.lerp(r.cam.z, tz, Math.min(1, dt * 4));
    let sx = 0, sy = 0;
    if (r.shakeT > 0) { r.shakeT = Math.max(0, r.shakeT - dt); const s = r.shakeT * 1.6; sx = R.float(-s, s); sy = R.float(-s, s); }
    const cam = GF.camera;
    const narrow = window.innerWidth < window.innerHeight;
    cam.position.set(r.cam.x + sx, (narrow ? 20 : 15.5) + sy, r.cam.z + (narrow ? 14 : 11.5));
    cam.lookAt(r.cam.x, 0.4, r.cam.z - 0.8);
  }

  /* ---------- the end of a trip ---------- */
  function finish(r, outcome) {
    r.over = outcome;
    IN.enabled = false;
    const G = r.G;
    const T = r.S.team;
    const route = r.train.route;
    const tier = r.train.tier;
    const levels = [];
    const result = { outcome, how: r.how, route: route.id, routeName: route.name, tier, kills: r.stats.kills, chests: r.stats.chests, time: Math.round(r.time), frozen: !!r.frozen };
    G.stats.trips += 1;
    G.stats.kills += r.stats.kills;
    G.stats.elites += r.stats.elites;
    G.stats.chests += r.stats.chests;
    G.stats.supers += r.stats.supers;
    if (outcome === 'escaped') {
      const bonus = r.how === 'brake' ? 1.25 : 1;
      let xp = (r.xp + 30 * tier) * bonus * (1 + T.xp) * (r.offer.mod === 'express' ? 1.3 : 1);
      const gold = Math.round(r.gold * bonus);
      G.gold += gold;
      const items = r.backpack.splice(0);
      const haul = U.sum(items, (i) => M.loot.value(i)) + gold;
      const before = G.overflow.length;
      for (const it of items) M.hub.addToStash(G, it);
      if (r.princess) { G.princesses[r.princess.def.id] = true; result.princess = r.princess.def.id; xp += 150 * tier; }
      levels.push(...M.gainXp(G, xp));
      if (!route.final) G.unlockedTier = Math.max(G.unlockedTier, Math.min(6, tier + 1));
      G.stats.escapes += 1;
      G.stats.bestHaul = Math.max(G.stats.bestHaul, haul);
      G.stats.deepest = Math.max(G.stats.deepest, tier);
      if (route.final && r.bossDown && r.how === 'brake') { G.iceKingBeaten = true; result.ending = true; }
      Object.assign(result, { items, gold, xp: Math.round(xp), levels, haul, overflow: G.overflow.length - before });
    } else {
      const lost = [...r.backpack];
      for (const k in G.equip) if (G.equip[k]) { lost.push(G.equip[k]); G.equip[k] = null; }
      for (let i = 0; i < G.belt.length; i++) if (G.belt[i]) { lost.push(G.belt[i]); G.belt[i] = null; }
      const xp = r.xp * (1 + T.xp);
      levels.push(...M.gainXp(G, xp));
      G.stats.wipes += 1;
      Object.assign(result, { lost, gold: 0, goldLost: Math.round(r.gold), xp: Math.round(xp), levels, tummy: G.tummy.slice() });
    }
    G.lastResult = result;
    M.hub.afterRaid(G);
    RA.teardown();
    if (r.hooks.onEnd) r.hooks.onEnd(result);
  }

  RA.abandon = function () { if (run && !run.over) { run.pendingOver = 'wiped'; run.overT = 0; run.paused = false; } };
  RA.teardown = function () {
    const r = run;
    if (!r) return;
    for (const e of r.enemies) GF.scene.remove(e.mesh);
    for (const h of [r.heroes.finn, r.heroes.jake]) GF.scene.remove(h.mesh);
    for (const p of r.projectiles) GF.scene.remove(p.mesh);
    for (const z of r.zones) { if (z.mesh) GF.scene.remove(z.mesh); if (z.tele) z.tele.alive = false; if (z.ring) z.ring.alive = false; }
    for (const d of r.drops) GF.scene.remove(d.mesh);
    for (const c of r.coins) GF.scene.remove(c.mesh);
    if (r.princess) GF.scene.remove(r.princess.mesh);
    if (r.bmo) GF.scene.remove(r.bmo);
    for (const b of r.train.breakables) if (b.mesh) GF.scene.remove(b.mesh);
    for (const c of r.train.chests) if (c.mesh) GF.scene.remove(c.mesh);
    GF.clearFx();
    WG.disposeTrain(r.train);
    GF.scene.fog = null;
    AE.ui.hud.hide();
    IN.enabled = false;
    run = null;
  };
  /* Drop an item from the backpack onto the floor (from the inventory screen). */
  RA.dropFromPack = function (uid) {
    const r = run;
    if (!r) return;
    const i = r.backpack.findIndex((x) => x.uid === uid);
    if (i < 0) return;
    const it = r.backpack.splice(i, 1)[0];
    const h = r.heroes[r.active];
    dropItem(r, h.x, h.z, it, true);
  };
  RA.packToTummy = function (uid) {
    const r = run;
    if (!r) return 'none';
    if (r.G.tummy.length >= r.S.team.tummy) return 'full';
    const i = r.backpack.findIndex((x) => x.uid === uid);
    if (i < 0) return 'none';
    r.G.tummy.push(r.backpack.splice(i, 1)[0]);
    return 'ok';
  };
  RA.tummyToPack = function (uid) {
    const r = run;
    if (!r) return 'none';
    if (r.backpack.length >= r.S.team.backpack) return 'full';
    const i = r.G.tummy.findIndex((x) => x.uid === uid);
    if (i < 0) return 'none';
    r.backpack.push(r.G.tummy.splice(i, 1)[0]);
    return 'ok';
  };

  AE.game.raid = RA;
})();
