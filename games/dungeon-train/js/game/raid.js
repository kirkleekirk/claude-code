/* A trip on the Dungeon Train: setup, the main loop, loot, interactions, the Loop, extraction and wipes,
   and the cameras (locked by default, or a free third-person camera). The trip holds a list of players; each drives one hero with commands.
   Right now there's one local player — the structure is ready for more. */
(function () {
  'use strict';
  const D = DT.data;
  const R = DT.R;
  const U = DT.U;
  const GF = DT.game.gfx;
  const MD = DT.game.models;
  const WG = DT.game.world;
  const AC = DT.game.actors;
  const C = DT.game.combat;
  const IN = DT.game.input;
  const M = DT.meta;
  const RA = {};
  let run = null;
  RA.current = () => run;

  RA.start = function (G, offerId, heroId, hooks) {
    const offer = G.board.find((o) => o.id === offerId);
    if (!offer || !GF.ok) return null;
    const S = M.stats.compute(G, heroId);
    const train = WG.generate(G, offer);
    WG.buildMeshes(train);
    GF.scene.add(train.root);
    const line = train.line;
    const loopMax = line.loop * (1 + S.loopSlow) / (offer.mod === 'express' ? 1.25 : 1) / (1 + (S.mods.loopFast || 0));
    run = {
      G, heroId, train, offer, hooks: hooks || {}, time: 0, heroes: [], players: [], local: null,
      enemies: [], projectiles: [], zones: [], drops: [], coins: [], backpack: [], gold: 0, xp: 0, meter: 0,
      loopT: 0, loopMax, loop: 0, tunnel: null, laterQ: [],
      stats: { dmg: 0, kills: 0, elites: 0, chests: 0, supers: 0, bosses: 0 },
      luckBonus: offer.mod === 'crowded' ? 0.25 : offer.mod === 'elites' ? 0.4 : 0, over: null, pendingOver: null, paused: false,
      inCombat: false, hitstopT: 0, shakeT: 0, interact: { target: null, p: 0 }, fullNoteT: 0, carIdx: 0, boss: null, bossDown: false, trophy: null,
      cam: { yaw: IN.fixed ? Math.PI : Math.PI / 2, pitch: 0.3, dist: 5.8, x: 0, y: 3, z: 0 },
    };
    WG.setCameraMode(train, IN.fixed);
    GF.setFov(IN.fixed ? LOCK.fov : DT.settings.fov);
    run.reticle = makeReticle();
    const c0 = train.cars[0];
    const hero = AC.makeHero(run, heroId, c0.x0 + 4, 0, S, G.chars[heroId].equip, 'p1');
    run.heroes.push(hero);
    run.players.push({ id: 'p1', local: true, hero, cmd: null });
    run.local = hero;
    run.S = S;
    if (S.mods.freeSnack) { const belt = G.chars[heroId].belt; const i = belt.findIndex((b, k) => !b && k < S.belt); if (i >= 0) belt[i] = M.loot.rollConsumable(); }
    bindRunApi(run);
    GF.setMood({ light: 1, bg: line.sky[1], fog: [darker(line.trim), 30, 95], sun: [-10, 14, 1.5] });
    IN.reset();
    IN.enabled = true;
    IN.onLockChange = (s) => onLock(run, s);
    DT.ui.hud.show(run);
    run.banner(line.name, 'route');
    return run;
  };
  const darker = (hex) => { const c = new THREE.Color(hex); c.multiplyScalar(0.45); return '#' + c.getHexString(); };
  function onLock(r, state) {
    if (r !== run || r.over) return;
    if (state === 'unlocked' && !r.paused && !r.pendingOver && !DT.ui.hud.isMenuOpen()) DT.ui.hud.togglePause(r, true);
    if (state === 'failed') DT.ui.hud.note('Mouse lock isn’t available here, so aim with the cursor. Hold right-click (or use ← →) to turn the camera — or switch back to the locked camera in Settings.', 8);
    DT.ui.hud.refresh(r);
  }

  function bindRunApi(r) {
    r.popup = (x, y, z, text, cls) => DT.ui.hud.popup(x, y, z, text, cls);
    r.banner = (text, cls) => DT.ui.hud.banner(text, cls);
    r.hudNote = (text, secs) => DT.ui.hud.note(text, secs);
    r.shake = (s) => { if (DT.settings.shake !== false) r.shakeT = Math.max(r.shakeT, s); };
    r.hitstop = (t) => { r.hitstopT = Math.max(r.hitstopT, t); };
    r.hurtFlash = () => DT.ui.hud.hurt();
    r.later = (t, fn) => r.laterQ.push({ t, fn });
    r.addMeter = (h, amt) => {
      if (r.superAct || (h && h.buffs.mega > 0)) return;
      const before = r.meter;
      r.meter = Math.min(100, r.meter + amt * (1 + ((h && h.S.meterGain) || 0)));
      if (before < 100 && r.meter >= 100) r.banner('MATHEMATICAL! is ready — press Q', 'super');
    };
    r.windBack = (f) => { r.loopT = Math.max(0, r.loopT - r.loopMax * f); if (r.tunnel != null) exitTunnel(r); };
    r.onHeroDown = () => { if (r.heroes.every((h) => h.ko) && !r.pendingOver) { r.pendingOver = 'wiped'; r.overT = 1.6; r.banner('Knocked out…', 'bad'); } };
    r.extract = (how) => {
      if (r.over || r.pendingOver) return;
      r.pendingOver = 'escaped'; r.how = how; r.overT = 0.8;
      DT.sfx.play('extract');
      r.banner(how === 'brake' ? 'SCREEEECH! The train stops!' : how === 'flare' ? 'Lady Rainicorn swoops in!' : 'You jump off the train!', 'good');
    };
    r.spawnLoot = (x, z, loot) => spawnLoot(r, x, z, loot);
    r.smashNear = (h, reach, arcR, power) => smash(r, h.x, h.z, reach, power, h.facing, arcR);
    r.smashAt = (x, z, rad, power) => smash(r, x, z, rad, power, null, null);
    r.damageBreakable = (b, n) => damageBreakable(r, b, n);
    r.checkCarClear = (ci) => {
      const car = r.train.cars[ci];
      if (!car || car.cleared || !car.spawned) return;
      if (r.enemies.some((e) => !e.dead && e.car === ci)) return;
      car.cleared = true;
      let unlocked = 0;
      for (const c of r.train.chests) if (c.car === ci && c.locked) { c.locked = false; unlocked++; if (c.mesh && !c.keyLocked) c.mesh.remove(c.mesh.userData.lock); }
      if (car.type !== 'boss' && ci === r.carIdx) r.banner(unlocked ? 'Car cleared! The chest is unlocked.' : 'Car cleared!', 'good');
      if (unlocked) DT.sfx.play('unlock');
      const h = r.local;
      if (h && !h.ko && h.S.mods.clearHeal) C.healHero(r, h, h.maxHp * h.S.mods.clearHeal);
    };
    r.onBossDown = (e) => {
      r.bossDown = true;
      r.stats.bosses += 1;
      const car = r.train.cars[e.car];
      if (car.gate) { car.gate.open = true; car.gate.ob.active = false; if (car.gate.mesh) car.group.remove(car.gate.mesh); DT.sfx.play('door'); }
      const line = r.train.line;
      if (D.TROPHIES[line.id] && !r.G.trophies[line.id]) {
        const it = M.loot.makeTrophy(line.id);
        dropItem(r, e.x, e.z, it, false);
        r.banner(`${e.name} is beaten! Grab the trophy and get it home!`, 'super');
      } else if (line.final) r.banner(`${e.name} is beaten! Pull the brake to break the Loop!`, 'super');
      else r.banner(`${e.name} is beaten! The engine is open.`, 'super');
      DT.sfx.play('levelup');
      r.boss = null;
    };
  }

  /* ---------- loot ---------- */
  function spawnLoot(r, x, z, loot) {
    if (loot.gold > 0) {
      const n = Math.min(8, Math.max(1, Math.ceil(loot.gold / 6)));
      for (let i = 0; i < n; i++) {
        const m = MD.coin();
        m.position.set(x, 0.3, z);
        GF.scene.add(m);
        const a = Math.random() * Math.PI * 2, s = R.float(1.5, 3.5);
        r.coins.push({ x, z, y: 0.3, vx: Math.cos(a) * s, vz: Math.sin(a) * s, vy: R.float(3, 5), mesh: m, value: loot.gold / n, t: 0 });
      }
    }
    for (const it of loot.items) dropItem(r, x, z, it, false);
  }
  function dropItem(r, x, z, it, manual) {
    const m = MD.drop(it);
    const a = Math.random() * Math.PI * 2, d = manual ? 0.9 : R.float(0.6, 1.6);
    const p = { x: x + Math.cos(a) * d, z: z + Math.sin(a) * d };
    WG.resolve(r.train, p, 0.3);
    m.position.set(p.x, 0, p.z);
    GF.scene.add(m);
    r.drops.push({ item: it, x: p.x, z: p.z, mesh: m, manual: !!manual, t: 0 });
    if (it.rarity >= 3 && !manual) { DT.sfx.play('rare'); r.popup(p.x, 1.8, p.z, it.kind === 'trophy' ? 'TROPHY!' : D.RARITIES[it.rarity].name + '!', 'r' + it.rarity); }
  }
  function tryPickup(r, h, drop) {
    const it = drop.item;
    if (it.kind === 'trophy') { r.trophy = it; return true; }
    if (it.kind === 'consumable') {
      const belt = r.G.chars[h.id].belt;
      for (const list of [belt, r.backpack]) for (const s of list) if (s && s.kind === 'consumable' && s.base === it.base && s.qty < D.STACK_MAX) {
        const m = Math.min(D.STACK_MAX - s.qty, it.qty); s.qty += m; it.qty -= m; if (it.qty <= 0) return true;
      }
      const e = belt.findIndex((b, i) => !b && i < h.S.belt);
      if (e >= 0 && it.base !== 'skeleton_key') { belt[e] = it; return true; }
    }
    if (r.backpack.length >= h.S.backpack) return false;
    it.isNew = true;
    r.backpack.push(it);
    return true;
  }
  function updateLoot(r, dt) {
    const hs = r.heroes.filter((h) => !h.ko);
    for (let i = r.coins.length - 1; i >= 0; i--) {
      const c = r.coins[i];
      c.t += dt;
      let near = null, nd = Infinity;
      for (const h of hs) { const d2 = U.dist2(h.x, h.z, c.x, c.z); const mr = 3 + (h.S.mods.magnet || 0); if (d2 < mr * mr && d2 < nd) { nd = d2; near = h; } }
      if (c.t > 0.5 && near) {
        const dx = near.x - c.x, dz = near.z - c.z, d = Math.sqrt(nd) || 1;
        c.x += (dx / d) * 14 * dt; c.z += (dz / d) * 14 * dt; c.y = U.lerp(c.y, 0.8, dt * 10);
        if (d < 0.6) { r.gold += c.value; GF.scene.remove(c.mesh); r.coins.splice(i, 1); DT.sfx.play('coin'); continue; }
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
      if (d.t < 0.5) continue;
      for (const h of hs) {
        if (U.dist2(h.x, h.z, d.x, d.z) > 1.4) continue;
        if (d.manual && !(h === r.local && IN.isHeld('interact'))) continue;
        if (tryPickup(r, h, d)) {
          GF.scene.remove(d.mesh);
          r.drops.splice(i, 1);
          DT.sfx.play(d.item.rarity >= 3 ? 'rare' : 'pickup');
          DT.ui.hud.loot(d.item);
          if (d.item.unique) r.G.codex.uniques[d.item.unique] = true;
          if (d.item.kind === 'trophy') r.banner('Trophy grabbed! Now get off the train alive!', 'good');
        } else if (h === r.local && r.fullNoteT <= 0) { r.fullNoteT = 2.5; r.hudNote('Backpack full! Press Tab to drop something or tuck it into your safe pocket.'); }
        break;
      }
    }
  }

  /* ---------- smashing ---------- */
  function damageBreakable(r, b, n) {
    if (!b.alive) return;
    b.hp -= n;
    b.mesh.position.x = b.x + R.float(-0.08, 0.08);
    if (b.hp > 0) { DT.sfx.play('hit'); return; }
    b.alive = false;
    b.ob.active = false;
    if (b.mesh.parent) b.mesh.parent.remove(b.mesh);
    GF.burst(b.x, 0.5, b.z, b.type === 'urn' ? '#b8653a' : '#c98d4e', 10, 4, { size: 0.16 });
    DT.sfx.play('break');
    spawnLoot(r, b.x, b.z, M.loot.drops('breakable', r.train.tier, r.local.S, { luckBonus: r.luckBonus }));
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
        DT.sfx.play('hit');
        r.popup(car.lock.x, 1.8, 0, car.lock.hp > 0 ? 'Clang!' : 'Smashed!', 'status');
        if (car.lock.hp <= 0) openLock(r, car);
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
    DT.sfx.play('open');
  }

  /* ---------- interactions (hold E) ---------- */
  function hasKey(r, h) {
    const belt = r.G.chars[h.id].belt;
    const i = belt.findIndex((b) => b && b.base === 'skeleton_key');
    if (i >= 0) return { list: belt, i, belt: true };
    const j = r.backpack.findIndex((b) => b.base === 'skeleton_key');
    return j >= 0 ? { list: r.backpack, i: j } : null;
  }
  function useKey(r, k) { const s = k.list[k.i]; s.qty -= 1; if (s.qty <= 0) { if (k.belt) k.list[k.i] = null; else k.list.splice(k.i, 1); } }
  function labelFor(r, h, it) {
    switch (it.kind) {
      case 'chest': return it.ref.locked ? 'Locked — defeat every monster in this car' : it.ref.keyLocked ? (hasKey(r, h) ? 'Unlock the chest (Skeleton Key)' : 'This chest needs a Skeleton Key') : 'Open the treasure chest';
      case 'lock': return hasKey(r, h) ? 'Unlock the vault (Skeleton Key)' : 'Locked vault — smash the gate or bring a Skeleton Key';
      case 'bailout': return r.trophy ? 'Jump off with the trophy!' : 'Jump off the train';
      case 'brake': return 'Pull the emergency brake';
      case 'snail': return 'Wave at the snail';
      default: return '';
    }
  }
  function canComplete(r, h, it) {
    if (it.kind === 'chest') return !it.ref.locked && (!it.ref.keyLocked || !!hasKey(r, h));
    if (it.kind === 'lock') return !!hasKey(r, h);
    return true;
  }
  function complete(r, h, it) {
    switch (it.kind) {
      case 'chest': {
        const c = it.ref;
        if (c.keyLocked) { const k = hasKey(r, h); if (!k) return; useKey(r, k); c.keyLocked = false; }
        c.opened = true;
        c.mesh.userData.lid.rotation.x = -1.9;
        if (c.mesh.userData.lock.parent) c.mesh.remove(c.mesh.userData.lock);
        r.stats.chests += 1;
        const extra = (h.S.mods.chestBonus || 0) + (r.offer.mod === 'treasure' ? 1 : 0);
        spawnLoot(r, c.x, c.z + 0.7 * c.face, M.loot.drops(c.fancy ? 'vaultChest' : 'chest', r.train.tier, h.S, { luckBonus: r.luckBonus, extra }));
        GF.burst(c.x, 0.9, c.z, '#ffcf3d', 12, 4, { add: true });
        DT.sfx.play('open');
        break;
      }
      case 'lock': { const k = hasKey(r, h); if (k) { useKey(r, k); openLock(r, r.train.cars[it.car]); } break; }
      case 'bailout': r.extract('bailout'); break;
      case 'brake': { const car = r.train.cars[it.car]; if (car.leverMesh) car.leverMesh.userData.arm.rotation.x = 0.7; r.extract('brake'); break; }
      case 'snail': {
        r.once = r.once || {};
        r.once.snail = true;
        r.luckBonus += 0.3;
        r.banner('The Waving Snail waves back. You feel lucky!', 'good');
        const car = r.train.cars[it.car];
        spawnLoot(r, it.x, it.z, { gold: 50 * r.train.tier, items: [M.loot.rollGear(r.train.tier, { minRarity: 2, luck: 0.5, hero: h.id })] });
        if (car.snailMesh) car.snailMesh.userData.stalk.rotation.z = 0.8;
        break;
      }
      default: break;
    }
  }
  function updateInteract(r, h, cmd, dt) {
    let best = null, bd = Infinity;
    if (!h.ko) for (const it of r.train.inter) {
      if (it.kind === 'chest' && it.ref.opened) continue;
      if (it.kind === 'lock' && it.ref.open) continue;
      if (it.kind === 'snail' && r.once && r.once.snail) continue;
      const d2 = U.dist2(h.x, h.z, it.x, it.z);
      if (d2 < it.r * it.r && d2 < bd) { bd = d2; best = it; }
    }
    const I = r.interact;
    if (best !== I.target) { I.target = best; I.p = 0; }
    if (!best) return;
    best.label = labelFor(r, h, best);
    best.ready = canComplete(r, h, best);
    if (cmd.interact && best.ready) {
      I.p += dt * (1 + h.S.interactSpeed);
      if (I.p >= best.time) { const t = best; I.p = 0; I.target = null; complete(r, h, t); }
    } else I.p = Math.max(0, I.p - dt * 2);
  }

  /* ---------- spawning ---------- */
  function spawnCar(r, car, h) {
    car.entered = true;
    const t = car.def;
    const tier = r.train.tier;
    let n = t.enemies ? R.int(t.enemies[0], t.enemies[1]) : 0;
    if (r.offer.mod === 'crowded') n = Math.round(n * 1.4);
    if (tier >= 4 && n) n += 1;
    const line = r.train.line;
    const pool = [].concat(...line.fams.map((f) => D.FAMILIES[f] || []));
    for (let i = 0; i < n; i++) {
      const p = WG.freeSpot(r.train, car, 0.7, { x: h.x, z: h.z, r: 6 });
      if (!p) continue;
      const id = R.pick(pool);
      AC.spawnEnemy(r, id, p.x, p.z, { car: car.i });
      /* pack monsters (Crystal Ants) bring friends */
      for (let k = 1; k < (D.ENEMIES[id].group || 1); k++) {
        const q = { x: p.x + R.float(-1.2, 1.2), z: p.z + R.float(-1.2, 1.2) };
        WG.resolve(r.train, q, 0.4);
        AC.spawnEnemy(r, id, q.x, q.z, { car: car.i });
      }
    }
    if (car.elite) {
      const p = WG.freeSpot(r.train, car, 1, { x: h.x, z: h.z, r: 8 }) || { x: (car.x0 + car.x1) / 2 + 4, z: 0 };
      if (tier >= 2) { const e = AC.spawnEnemy(r, R.pick(line.elites || ['lemongrab', 'magic_man']), p.x, p.z, { car: car.i }); r.banner(e.name + ' blocks the way!', 'bad'); }
      else { AC.spawnEnemy(r, R.pick(pool), p.x, p.z, { car: car.i, promote: true }); r.banner('A king-sized monster!', 'bad'); }
    }
    if (car.boss) {
      const e = AC.spawnEnemy(r, car.boss, car.x1 - 9, 0, { car: car.i });
      e.facing = -Math.PI / 2;
      r.boss = e;
      r.banner(D.BOSS_BRAINS[e.def.brain].intro, 'bad');
      DT.sfx.play('boss');
      r.shake(0.4);
    }
    car.spawned = n > 0 || !!car.elite || !!car.boss;
    car.cleared = !car.spawned;
    if (car.cleared) for (const c of r.train.chests) if (c.car === car.i) { c.locked = false; if (!c.keyLocked && c.mesh) c.mesh.remove(c.mesh.userData.lock); }
  }

  /* ---------- the Loop ---------- */
  function enterTunnel(r) {
    r.tunnel = 25;
    r.banner('THE LOOP TUNNEL! Get off the train NOW!', 'bad');
    DT.sfx.play('boss');
    WG.setTunnel(r.train, true);
    GF.setMood({ light: 0.35, fog: ['#050508', 6, 38] });
  }
  function exitTunnel(r) {
    r.tunnel = null;
    WG.setTunnel(r.train, false);
    GF.setMood({ light: 1, fog: [darker(r.train.line.trim), 30, 95] });
    r.banner('Out of the tunnel… for now.', 'good');
  }

  /* ---------- the loop ---------- */
  RA.update = function (dtRaw) {
    const r = run;
    if (!r) return;
    let dt = Math.min(0.05, dtRaw);
    if (IN.take('pause')) DT.ui.hud.togglePause(r);
    if (IN.take('inventory')) DT.ui.hud.toggleInventory(r);
    if (r.paused) { IN.endFrame(); updateCamera(r, 0); return; }
    if (r.pendingOver) { r.overT -= dt; if (r.overT <= 0) { finish(r, r.pendingOver); IN.endFrame(); return; } }
    if (r.hitstopT > 0) { r.hitstopT -= dt; dt *= 0.1; }
    r.time += dt;
    const look = IN.lookDelta(dtRaw);
    const cam = r.cam;
    if (IN.fixed) {
      cam.yaw = Math.PI;
      if (look.zoom) { DT.settings.zoom = U.clamp((DT.settings.zoom || 1) + look.zoom * 0.08, LOCK.zoomMin, LOCK.zoomMax); DT.saveSettings(); }
    } else {
      cam.yaw += look.yaw;
      cam.pitch = U.clamp(cam.pitch + look.pitch, -0.3, 1.05);
      cam.dist = U.clamp(cam.dist + look.zoom * 0.6, 3.5, 9);
    }
    for (const p of r.players) {
      p.cmd = p.local && !r.pendingOver ? IN.command(GF.camera, cam.yaw) : IN.idle(cam.yaw);
      AC.updateHero(r, p.hero, p.cmd, dt);
    }
    if (r.superAct) r.superAct.update(dt);
    /* move in small steps so fast dashes and charges can't pass through walls or gates */
    for (const h of r.heroes) {
      if (h.ko) continue;
      const air = h.state === 'ability' && h.liftY > 0.3;
      const rr = h.r * Math.min(1.5, h.scale);
      const n = Math.max(1, Math.ceil((Math.hypot(h.vx, h.vz) * dt) / 0.25));
      for (let i = 0; i < n; i++) { h.x += (h.vx * dt) / n; h.z += (h.vz * dt) / n; WG.resolve(r.train, h, rr, air); }
    }
    const live = [];
    for (const e of r.enemies) {
      if (e.dead) continue;
      AC.updateEnemy(r, e, dt);
      if (e.dead) continue;
      const n = Math.max(1, Math.ceil((Math.hypot(e.vx, e.vz) * dt) / 0.3));
      if (n > 1) for (let i = 0; i < n; i++) { e.x += (e.vx * dt) / n; e.z += (e.vz * dt) / n; WG.resolve(r.train, e, e.r); }
      else { e.x += e.vx * dt; e.z += e.vz * dt; }
      live.push(e);
    }
    for (let i = 0; i < live.length; i++) {
      const a = live[i];
      for (let j = i + 1; j < live.length; j++) {
        const b = live[j];
        const dx = b.x - a.x, dz = b.z - a.z, rr = a.r + b.r, d2 = dx * dx + dz * dz;
        if (d2 < rr * rr && d2 > 1e-6) { const d = Math.sqrt(d2), push = (rr - d) / 2; a.x -= (dx / d) * push; a.z -= (dz / d) * push; b.x += (dx / d) * push; b.z += (dz / d) * push; }
      }
      for (const h of r.heroes) {
        if (h.ko || a.boss) continue;
        const dx = a.x - h.x, dz = a.z - h.z, rr = a.r + h.r * 0.8 * h.scale, d2 = dx * dx + dz * dz;
        if (d2 < rr * rr && d2 > 1e-6) { const d = Math.sqrt(d2); a.x = h.x + (dx / d) * rr; a.z = h.z + (dz / d) * rr; }
      }
      WG.resolve(r.train, a, a.r);
    }
    r.enemies = live;
    C.updateProjectiles(r, dt);
    C.updateZones(r, dt);
    C.periodic(r, dt);
    for (let i = r.laterQ.length - 1; i >= 0; i--) { const q = r.laterQ[i]; q.t -= dt; if (q.t <= 0) { r.laterQ.splice(i, 1); if (!r.over) q.fn(); } }
    GF.updateFx(dt);
    updateLoot(r, dt);
    const h = r.local;
    const car = WG.carAt(r.train, h.x);
    if (car) { r.carIdx = car.i; if (!car.entered && h.x > car.x0 + 1.2) spawnCar(r, car, h); }
    r.inCombat = r.enemies.some((e) => e.car === r.carIdx);
    updateInteract(r, h, r.players[0].cmd, dt);
    if (!r.pendingOver) {
      if (r.tunnel == null) {
        r.loopT += dt;
        r.loop = Math.min(1, r.loopT / r.loopMax);
        GF.setMood({ light: r.loop > 0.7 ? 1 - (r.loop - 0.7) * 0.8 : 1 });
        if (r.loop >= 1) enterTunnel(r);
      } else {
        r.tunnel -= dt;
        for (const hh of r.heroes) if (!hh.ko) C.hurtHero(r, hh, hh.maxHp * 0.02 * dt, null, { dot: true });
        if (r.tunnel <= 0) { r.banner('Looped… the train takes everything.', 'bad'); r.pendingOver = 'wiped'; r.overT = 1.4; r.looped = true; }
      }
    }
    for (const hh of r.heroes) {
      AC.animateHero(r, hh, dt);
      if (hh.buffs.shield && !hh.shieldMesh) { hh.shieldMesh = new THREE.Mesh(GF.geo('sphere', 1.1, 20, 14), GF.basic('#7fe3ff', { opacity: 0.25, add: true })); hh.mesh.add(hh.shieldMesh); hh.shieldMesh.position.y = 0.8; }
      if (!hh.buffs.shield && hh.shieldMesh) { hh.mesh.remove(hh.shieldMesh); hh.shieldMesh = null; }
    }
    for (const e of r.enemies) { AC.animateEnemy(e, dt); if (e.screaming > 0) e.screaming = Math.max(0, e.screaming - dt); }
    for (const c2 of r.train.cars) {
      if (c2.bailoutMesh) c2.bailoutMesh.material.opacity = 0.2 + Math.sin(r.time * 4) * 0.1;
      if (c2.snailMesh && !(r.once && r.once.snail)) c2.snailMesh.userData.stalk.rotation.z = Math.sin(r.time * 6) * 0.6;
    }
    for (const t of r.train.skyTex) t.offset.x += dt * 0.012;
    r.train.groundTex.offset.x += dt * 1.6;
    for (const w of r.train.wheels) w.rotation.z -= dt * 9;
    updateReticle(r, dt);
    for (const s of r.train.skies) s.position.x = GF.camera.position.x;
    updateCamera(r, dt);
    DT.ui.hud.update(r, dt);
    IN.endFrame();
  };

  /* ---------- cameras ---------- */
  /* The locked camera looks into the car from the aisle side, at a fixed angle, and slides along the
     train with the hero. It never turns, so W is always up the screen and D is always toward the engine.
     The near wall and the roof are cut away (see WG.setCameraMode). */
  const LOCK = { pitch: 0.7, fov: 40, dist: 14, zoomMin: 0.75, zoomMax: 1.3, lookZ: 0 };
  RA.LOCK = LOCK;
  function updateCamera(r, dt) {
    if (IN.fixed) lockedCamera(r, dt); else freeCamera(r, dt);
    fadeProps(r, dt);
  }
  function lockedCamera(r, dt) {
    const h = r.local, cam = r.cam;
    const big = h.buffs.mega > 0 || h.buffs.giant > 0 ? 1.2 : 1;
    const dist = LOCK.dist * (DT.settings.zoom || 1) * big * (r.superAct ? 1.06 : 1);
    /* follow along the train only: the whole width of the car always fits on screen */
    if (cam.fx == null) cam.fx = h.x;
    const k = dt ? 1 - Math.exp(-dt * 8) : 0;
    cam.fx += (h.x - cam.fx) * k;
    cam.fd = cam.fd == null ? dist : cam.fd + (dist - cam.fd) * (dt ? 1 - Math.exp(-dt * 6) : 0);
    const ty = 0.8, tz = LOCK.lookZ;
    cam.x = cam.fx; cam.y = ty + Math.sin(LOCK.pitch) * cam.fd; cam.z = tz + Math.cos(LOCK.pitch) * cam.fd;
    let sx = 0, sy = 0;
    if (r.shakeT > 0 && dt) { r.shakeT = Math.max(0, r.shakeT - dt); const s = r.shakeT * 0.9; sx = R.float(-s, s); sy = R.float(-s, s); }
    GF.camera.position.set(cam.x + sx, cam.y + sy, cam.z);
    GF.camera.lookAt(cam.fx + sx, ty + sy, tz);
  }
  /* Free camera: third person over the right shoulder, pulled in so walls never block the view. */
  function freeCamera(r, dt) {
    const h = r.local;
    const cam = r.cam;
    const sc = Math.sqrt(h.scale);
    const yaw = cam.yaw, pitch = cam.pitch;
    const dist = cam.dist * (h.buffs.mega > 0 || h.buffs.giant > 0 ? 1.35 : 1) * (r.superAct ? 1.2 : 1);
    const lx = Math.sin(yaw) * Math.cos(pitch), ly = -Math.sin(pitch), lz = Math.cos(yaw) * Math.cos(pitch);
    const rx = -Math.cos(yaw), rz = Math.sin(yaw);
    const pivot = { x: h.x + rx * 0.6 * sc, y: (h.liftY || 0) + 1.6 * sc, z: h.z + rz * 0.6 * sc };
    const want = { x: pivot.x - lx * dist, y: pivot.y - ly * dist, z: pivot.z - lz * dist };
    let safe = WG.cameraSafe(r.train, pivot, want);
    /* big monsters (bosses, elites) that get between the camera and the hero push the camera in and up,
       so you never lose sight of your hero behind a boss */
    const segx = safe.x - pivot.x, segz = safe.z - pivot.z, segL = Math.hypot(segx, segz) || 1;
    let pull = 1;
    for (const e of r.enemies) {
      if (e.dead || e.state === 'spawn' || !(e.boss || e.elite || e.r > 0.85)) continue;
      const er = e.r * 1.15 + 0.35;
      const t = ((e.x - pivot.x) * segx + (e.z - pivot.z) * segz) / (segL * segL);
      if (t <= 0 || t >= 1.25) continue;
      if (Math.hypot(e.x - (pivot.x + segx * t), e.z - (pivot.z + segz * t)) > er) continue;
      pull = Math.min(pull, Math.max(0.22, (t * segL - er) / segL));
    }
    if (pull < 1) safe = { x: pivot.x + segx * pull, y: Math.min(WG.WD.H - 0.5, safe.y + (1 - pull) * 1.5), z: pivot.z + segz * pull };
    const k = dt ? Math.min(1, dt * (pull < 1 ? 8 : 18)) : 1;
    if (cam.free !== true) { cam.x = safe.x; cam.y = safe.y; cam.z = safe.z; cam.free = true; }
    cam.x = U.lerp(cam.x, safe.x, k); cam.y = U.lerp(cam.y, safe.y, k); cam.z = U.lerp(cam.z, safe.z, k);
    let sx = 0, sy = 0;
    if (r.shakeT > 0 && dt) { r.shakeT = Math.max(0, r.shakeT - dt); const s = r.shakeT * 0.9; sx = R.float(-s, s); sy = R.float(-s, s); }
    GF.camera.position.set(cam.x + sx, cam.y + sy, cam.z);
    GF.camera.lookAt(pivot.x + lx * 12, pivot.y + ly * 12, pivot.z + lz * 12);
  }
  /* Switch cameras (from Settings), even in the middle of a trip. */
  RA.setCameraMode = function (fixed) {
    const r = run;
    IN.setCamera(fixed, DT.settings.cursorAim);
    if (!r) return;
    WG.setCameraMode(r.train, IN.fixed);
    GF.setFov(IN.fixed ? LOCK.fov : DT.settings.fov);
    r.cam.yaw = IN.fixed ? Math.PI : Math.PI / 2;
    r.cam.pitch = 0.3;
    r.cam.fx = null; r.cam.fd = null; r.cam.free = false;
    updateCamera(r, 0);
  };

  /* Tall props (mushrooms, shelves, cages…) that stand between the camera and the hero fade out,
     so they never hide your hero. The test is a real line of sight against each prop's box. */
  function segBox(ax, ay, az, bx, by, bz, x0, y0, z0, x1, y1, z1) {
    let t0 = 0, t1 = 1;
    const a = [ax, ay, az], d = [bx - ax, by - ay, bz - az], lo = [x0, y0, z0], hi = [x1, y1, z1];
    for (let i = 0; i < 3; i++) {
      if (Math.abs(d[i]) < 1e-9) { if (a[i] < lo[i] || a[i] > hi[i]) return false; continue; }
      let ta = (lo[i] - a[i]) / d[i], tb = (hi[i] - a[i]) / d[i];
      if (ta > tb) { const t = ta; ta = tb; tb = t; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) return false;
    }
    return true;
  }
  function fadeProps(r, dt) {
    const c = GF.camera.position, h = r.local;
    const cars = r.train.cars;
    for (let ci = Math.max(0, r.carIdx - 1); ci <= Math.min(cars.length - 1, r.carIdx + 1); ci++) {
      for (const p of cars[ci].props) {
        if (!p.tall || !p.mesh) continue;
        const s = p.size || 1, hw = (p.w * s) / 2 + 0.2, hd = (p.d * s) / 2 + 0.2, top = p.h * s;
        let hide = false;
        for (const y of [0.45, 1.35]) {
          if (segBox(c.x, c.y, c.z, h.x, (h.liftY || 0) + y * h.scale, h.z, p.x - hw, 0, p.z - hd, p.x + hw, top, p.z + hd)) { hide = true; break; }
        }
        setFade(r, p, hide ? 0.25 : 1, dt);
      }
    }
  }
  function setFade(r, p, want, dt) {
    const cur = p.fade == null ? 1 : p.fade;
    if (cur === want) return;
    let next = dt ? cur + (want - cur) * Math.min(1, dt * 12) : want;
    if (Math.abs(next - want) < 0.03) next = want;
    if (!p.fadeMats) {
      /* the first time a prop fades it gets its own materials (the originals are shared) */
      p.fadeMats = []; p.fadeInk = [];
      p.mesh.traverse((o) => {
        if (!o.isMesh) return;
        if (o.userData.outline || o.renderOrder === -1) { p.fadeInk.push(o); return; }
        o.material = o.material.clone();
        p.fadeMats.push(o.material);
        r.train.materials.push(o.material);
      });
    }
    p.fade = next;
    const solid = next >= 0.999;
    for (const m of p.fadeMats) {
      if (m.transparent !== !solid) { m.transparent = !solid; m.needsUpdate = true; }
      m.opacity = next; m.depthWrite = solid;
    }
    for (const o of p.fadeInk) o.visible = solid;
  }

  /* The aim marker on the floor under the cursor (it hugs the monster you're pointing at). */
  function makeReticle() {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(GF.geo('ring', 0.8, 1, 40), GF.basic('#ffffff', { opacity: 0.7 }));
    ring.rotation.x = -Math.PI / 2;
    const dot = new THREE.Mesh(GF.geo('circle', 0.12, 16), GF.basic('#ffffff', { opacity: 0.8 }));
    dot.rotation.x = -Math.PI / 2;
    g.add(ring, dot);
    g.userData = { ring, dot };
    g.visible = false;
    GF.scene.add(g);
    return g;
  }
  const RET_IDLE = window.THREE ? GF.lin('#ffffff') : null, RET_HOT = window.THREE ? GF.lin('#ff5a4a') : null;
  function updateReticle(r, dt) {
    const g = r.reticle, h = r.local;
    if (!g) return;
    g.visible = IN.mode === 'cursor' && !h.ko && !r.paused && !!h.aim;
    if (!g.visible) return;
    const tgt = h.aim.target && !h.aim.target.dead ? h.aim.target : null;
    const rad = tgt ? tgt.r + 0.25 : 0.34;
    g.userData.rad = U.lerp(g.userData.rad || rad, rad, Math.min(1, dt * 16));
    g.position.set(tgt ? tgt.x : h.aim.x, 0.04, tgt ? tgt.z : h.aim.z);
    g.scale.setScalar(g.userData.rad * (tgt ? 1 + Math.sin(r.time * 10) * 0.06 : 1));
    g.userData.ring.material.color.copy(tgt ? RET_HOT : RET_IDLE);
    g.userData.dot.visible = !tgt;
  }

  /* ---------- the end of a trip ---------- */
  function finish(r, outcome) {
    r.over = outcome;
    IN.enabled = false;
    IN.releaseLock();
    const G = r.G, heroId = r.heroId, Ch = G.chars[heroId], S = r.local.S;
    const line = r.train.line, tier = r.train.tier;
    const result = { outcome, how: r.how, hero: heroId, line: line.id, lineName: line.name, tier, kills: r.stats.kills, chests: r.stats.chests, bosses: r.stats.bosses, time: Math.round(r.time), looped: !!r.looped };
    G.stats.trips += 1; Ch.trips += 1;
    G.stats.kills += r.stats.kills; G.stats.elites += r.stats.elites; G.stats.chests += r.stats.chests; G.stats.supers += r.stats.supers; G.stats.bosses += r.stats.bosses;
    if (outcome === 'escaped') {
      const bonus = r.how === 'brake' ? 1.25 : 1;
      let xp = (r.xp + 30 * tier) * bonus * (1 + S.xp) * (r.offer.mod === 'express' ? 1.3 : 1);
      const gold = Math.round(r.gold * bonus);
      G.gold += gold;
      const items = r.backpack.splice(0);
      const haul = U.sum(items, (i) => M.loot.value(i)) + gold;
      const before = G.overflow.length;
      for (const it of items) { it.isNew = true; M.hub.addToStash(G, it); }
      if (r.trophy && D.TROPHIES[line.id] && !G.trophies[line.id]) { G.trophies[line.id] = true; result.trophy = line.id; xp += 150 * tier; }
      const levels = M.gainXp(G, heroId, xp);
      G.stats.escapes += 1;
      G.stats.bestHaul = Math.max(G.stats.bestHaul, haul);
      if (line.final && r.bossDown && r.how === 'brake') { G.conductorBeaten = true; result.ending = true; }
      Object.assign(result, { items, gold, xp: Math.round(xp), levels, haul, overflow: G.overflow.length - before });
    } else {
      const lost = [...r.backpack];
      if (r.trophy) lost.push(r.trophy);
      for (const k in Ch.equip) if (Ch.equip[k]) { lost.push(Ch.equip[k]); Ch.equip[k] = null; }
      for (let i = 0; i < Ch.belt.length; i++) if (Ch.belt[i]) { lost.push(Ch.belt[i]); Ch.belt[i] = null; }
      const xp = r.xp * 0.6 * (1 + S.xp);
      const levels = M.gainXp(G, heroId, xp);
      G.stats.wipes += 1;
      Object.assign(result, { lost, gold: 0, goldLost: Math.round(r.gold), xp: Math.round(xp), levels, safe: Ch.safe.slice() });
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
    DT.game.abilities.cleanup(r);
    for (const e of r.enemies) GF.scene.remove(e.mesh);
    for (const h of r.heroes) { GF.scene.remove(h.mesh); for (const f of h.fists) C.removeFist(f); }
    for (const p of r.projectiles) GF.scene.remove(p.mesh);
    for (const z of r.zones) { if (z.mesh) GF.scene.remove(z.mesh); if (z.tele) z.tele.alive = false; if (z.ring) z.ring.alive = false; }
    for (const d of r.drops) GF.scene.remove(d.mesh);
    for (const c of r.coins) GF.scene.remove(c.mesh);
    if (r.reticle) GF.scene.remove(r.reticle);
    GF.clearFx();
    WG.disposeTrain(r.train);
    GF.setMood({ light: 1, fog: null });
    GF.setFov(DT.settings.fov);
    DT.ui.hud.hide();
    IN.enabled = false;
    IN.onLockChange = null;
    IN.releaseLock();
    run = null;
  };

  /* ---------- inventory actions during a trip ---------- */
  RA.dropFromPack = function (uid) {
    const r = run;
    if (!r) return;
    const i = r.backpack.findIndex((x) => x.uid === uid);
    if (i < 0) return;
    dropItem(r, r.local.x, r.local.z, r.backpack.splice(i, 1)[0], true);
  };
  RA.packToSafe = function (uid) {
    const r = run;
    if (!r) return 'none';
    const safe = r.G.chars[r.heroId].safe;
    if (safe.length >= r.local.S.safe) return 'full';
    const i = r.backpack.findIndex((x) => x.uid === uid);
    if (i < 0) return 'none';
    safe.push(r.backpack.splice(i, 1)[0]);
    return 'ok';
  };
  RA.safeToPack = function (uid) {
    const r = run;
    if (!r) return 'none';
    if (r.backpack.length >= r.local.S.backpack) return 'full';
    const safe = r.G.chars[r.heroId].safe;
    const i = safe.findIndex((x) => x.uid === uid);
    if (i < 0) return 'none';
    r.backpack.push(safe.splice(i, 1)[0]);
    return 'ok';
  };
  /* Found something better? Put it on right now. The old item goes into the backpack. */
  RA.equipFromPack = function (uid, slotId) {
    const r = run;
    if (!r) return 'none';
    const i = r.backpack.findIndex((x) => x.uid === uid);
    if (i < 0) return 'none';
    const it = r.backpack[i];
    const why = M.hub.whyNot(r.G, r.heroId, it, slotId);
    if (why) return why;
    const H = D.HEROES[r.heroId];
    const slots = H.slots.filter((s) => s.kind === it.kind && !M.slotLock(r.G, r.heroId, s));
    const Ch = r.G.chars[r.heroId];
    const slot = slotId || (slots.find((s) => !Ch.equip[s.id]) || slots[0]).id;
    const old = Ch.equip[slot];
    r.backpack.splice(i, 1);
    Ch.equip[slot] = it;
    it.isNew = false;
    if (old) r.backpack.push(old);
    const g = M.stats.compute(r.G, r.heroId).abilities.find((a) => a.uid === it.uid);
    if (g) M.hub.autoBind(r.G, r.heroId, g.id);
    M.hub.fixChar(r.G, r.heroId);
    RA.refreshHero(r);
    return 'ok';
  };
  /* Re-read stats and rebuild the model after a gear change. */
  RA.refreshHero = function (r) {
    const h = r.local;
    const ratio = h.hp / h.maxHp;
    const S = M.stats.compute(r.G, r.heroId);
    h.S = S; r.S = S;
    h.maxHp = S.maxHp; h.hp = Math.max(1, S.maxHp * ratio); h.r = S.radius;
    for (const f of h.fists) C.removeFist(f);
    h.fists = [];
    const old = h.mesh;
    h.mesh = MD.hero(h.id, r.G.chars[h.id].equip);
    GF.xray(h.mesh, AC.XRAY[h.id]);
    h.mesh.position.copy(old.position); h.mesh.rotation.copy(old.rotation);
    h.parts = h.mesh.userData.parts;
    GF.scene.remove(old); GF.scene.add(h.mesh);
    if (h.drones) { for (const m of h.drones) GF.scene.remove(m); h.drones = null; }
    h.shieldMesh = null;
    DT.ui.hud.refresh(r);
  };

  DT.game.raid = RA;
})();
