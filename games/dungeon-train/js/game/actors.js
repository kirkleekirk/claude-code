/* Heroes (driven by commands) and enemies (archetype AI + bosses), with procedural animation. */
(function () {
  'use strict';
  const D = DT.data;
  const R = DT.R;
  const U = DT.U;
  const GF = DT.game.gfx;
  const MD = DT.game.models;
  const AC = {};
  const WHITE = window.THREE ? new THREE.MeshBasicMaterial({ color: 0xffffff }) : null;
  const ICE = window.THREE ? new THREE.MeshBasicMaterial({ color: 0x9fe3ff }) : null;

  /* ---------- hit flash ---------- */
  AC.flash = function (a, mat) {
    if (a.flashT > 0 && !a.iceLook) { a.flashT = 0.09; return; }
    if (a.iceLook) return;
    a.flashT = 0.09;
    a.flashSaved = [];
    a.mesh.traverse((o) => { if (o.isMesh && !o.userData.outline && o.renderOrder !== -1) { a.flashSaved.push([o, o.material]); o.material = mat || WHITE; } });
  };
  function unflash(a) { if (a.flashSaved) for (const [o, m] of a.flashSaved) o.material = m; a.flashSaved = null; }
  AC.freezeLook = function (a, on) {
    if (on && !a.iceLook) { if (a.flashSaved) unflash(a); a.flashT = 0; AC.flash(a, ICE); a.flashT = 99; a.iceLook = true; }
    else if (!on && a.iceLook) { a.flashT = 0; a.iceLook = false; unflash(a); }
  };

  /* ---------- heroes ---------- */
  AC.makeHero = function (run, heroId, x, z, S, equip, player) {
    const mesh = MD.hero(heroId, equip);
    mesh.position.set(x, 0, z);
    GF.scene.add(mesh);
    return {
      id: heroId, kind: 'hero', player, mesh, parts: mesh.userData.parts, x, z, vx: 0, vz: 0, r: S.radius, facing: Math.PI / 2, S,
      hp: S.maxHp, maxHp: S.maxHp, ko: false, state: 'idle', stateT: 0, combo: 0, comboT: 0, swingTime: 0.3, hitDone: false, queued: false,
      swings: 0, punches: 0, dashCharges: S.dashCharges, dashT: 0, dashDir: { x: 1, z: 0 }, iframes: 0, cds: {}, buffs: {}, st: {},
      lastHurt: -99, flashT: 0, walkT: 0, scale: S.scale, aim: { x: x + 4, z }, aimDir: Math.PI / 2, fists: [], liftY: 0, blockT: 0,
      frenzy: 0, frenzyT: 0, echo: [], secondWind: false,
    };
  };
  /* Rebuild the hero's model (after swapping gear mid-trip, which we don't allow — kept for the hub). */
  AC.heroSpeed = function (run, h) {
    const S = h.S, M = S.mods;
    let s = S.moveSpeed;
    if (h.buffs.cry > 0) s *= 1.2;
    if (h.buffs.candy > 0) s *= 1.35;
    if (h.buffs.copter > 0) s *= 1.2;
    if (h.buffs.mega > 0) s *= 0.9;
    if (M.lowHpSpeed && h.hp / h.maxHp < 0.35) s *= 1 + M.lowHpSpeed;
    if (h.st.chill > 0) s *= 0.6;
    if (h.state === 'attack') s *= h.id === 'finn' ? 0.55 : 0.7;
    return s;
  };
  AC.faceTo = function (a, x, z) { a.facing = Math.atan2(x - a.x, z - a.z); };

  /* Where the hero is aiming on the floor, from the command. */
  AC.aimFor = function (run, h, cmd) {
    const fx = Math.sin(cmd.yaw), fz = Math.cos(cmd.yaw);
    const g = cmd.ground;
    if (g) {
      const dx = g.x - h.x, dz = g.z - h.z, d = Math.hypot(dx, dz);
      const cursor = DT.game.input.mode === 'cursor';
      if (d > 1.0 && (cursor || dx * fx + dz * fz > 0.6)) return { x: g.x, z: g.z, dir: Math.atan2(dx, dz), dist: d };
    }
    return { x: h.x + fx * 8, z: h.z + fz * 8, dir: cmd.yaw, dist: 8 };
  };

  /* Drive a hero from a command. Works for the local player now and remote players later. */
  AC.updateHero = function (run, h, cmd, dt) {
    const C = DT.game.combat;
    tickHero(run, h, dt, cmd);
    if (h.ko) return;
    const aim = AC.aimFor(run, h, cmd);
    h.aim = aim; h.aimDir = aim.dir;
    const stunned = h.st.stun > 0 || h.st.freeze > 0;
    const free = h.state !== 'dash' && h.state !== 'ability' && h.state !== 'super';
    if (!stunned && free) {
      const sp = AC.heroSpeed(run, h) * (h.st.root > 0 ? 0 : 1);
      h.vx = cmd.mx * sp; h.vz = cmd.mz * sp;
      const fighting = cmd.attack || h.state === 'attack' || h.fists.some((f) => f.main);
      const want = fighting ? aim.dir : cmd.moving ? Math.atan2(cmd.mx, cmd.mz) : h.facing;
      h.facing += U.angleDiff(h.facing, want) * Math.min(1, dt * (fighting ? 22 : 14));
    }
    if (stunned) { h.vx = h.vz = 0; return; }
    if (cmd.dash) C.tryDash(run, h, cmd);
    if ((cmd.attack || cmd.attackPressed) && free) C.tryAttack(run, h, cmd);
    for (let i = 0; i < 4; i++) if (cmd.ab[i]) C.castSlot(run, h, i, cmd);
    if (cmd.super) C.trySuper(run, h, cmd);
    for (let i = 0; i < cmd.belt.length; i++) if (cmd.belt[i]) C.useBelt(run, h, i, cmd);
  };

  function tickHero(run, h, dt, cmd) {
    const C = DT.game.combat;
    h.stateT += dt;
    for (const k in h.cds) h.cds[k] = Math.max(0, h.cds[k] - dt);
    for (const k in h.buffs) if (typeof h.buffs[k] === 'number') h.buffs[k] = Math.max(0, h.buffs[k] - dt);
    if (h.buffs.shield && (h.buffs.shield.t -= dt) <= 0) C.shieldEnd(run, h);
    for (const k in h.st) h.st[k] = Math.max(0, h.st[k] - dt);
    if (h.burnDps && h.st.burn > 0) C.hurtHero(run, h, h.burnDps * dt, null, { dot: true });
    if (h.dashCharges < h.S.dashCharges) { h.dashT += dt; if (h.dashT >= h.S.dashCdFinal) { h.dashT = 0; h.dashCharges += 1; } }
    h.iframes = Math.max(0, h.iframes - dt);
    h.comboT = Math.max(0, h.comboT - dt);
    h.blockT = Math.max(0, h.blockT - dt);
    if ((h.frenzyT -= dt) <= 0) h.frenzy = 0;
    if (h.comboT <= 0 && h.state !== 'attack') h.combo = 0;
    if (h.flashT > 0 && (h.flashT -= dt) <= 0) unflash(h);
    if (h.ko) return;
    const S = h.S;
    if (S.regen && run.time - h.lastHurt > 3 && h.hp < h.maxHp) C.healHero(run, h, h.maxHp * S.regen * dt, { quiet: true });
    C.stepAction(run, h, dt, cmd);
  }

  /* ---------- enemies ---------- */
  AC.spawnEnemy = function (run, id, x, z, o) {
    o = o || {};
    const def = D.ENEMIES[id];
    const t = run.train.tier, ci = o.car || 0;
    const hpF = def.boss ? 1 : (1 + 0.75 * (t - 1)) * (1 + 0.04 * ci);
    const dmgF = def.boss ? 1 : (1 + 0.42 * (t - 1)) * (1 + 0.03 * ci) * (run.train.mod === 'treasure' ? 1.1 : 1);
    const promote = o.promote ? 1 : 0;
    const mesh = MD.enemy(def);
    if (promote) mesh.scale.multiplyScalar(1.7);
    mesh.position.set(x, 0, z);
    GF.scene.add(mesh);
    const hp = Math.round(def.hp * hpF * (promote ? 6 : 1));
    const e = {
      id, def, kind: 'enemy', mesh, parts: mesh.userData.parts, x, z, vx: 0, vz: 0, r: def.r * (promote ? 1.5 : 1), facing: -Math.PI / 2,
      hp, maxHp: hp, dmg: def.dmg * dmgF * (promote ? 1.6 : 1), speed: def.speed * (promote ? 0.85 : 1), state: 'spawn', stateT: 0,
      st: {}, dots: {}, kbx: 0, kbz: 0, flashT: 0, attackCd: R.float(0.4, 1.3), elite: !!(def.elite || promote), boss: !!def.boss,
      car: ci, name: (promote ? 'King ' : '') + def.name, walkT: Math.random() * 6, phase: 0, timers: {}, scale: mesh.scale.x, freezeImmune: 0, hitT: -9,
    };
    mesh.scale.multiplyScalar(0.01);
    GF.burst(x, 0.6, z, '#ffffff', 8, 3, { dur: 0.4 });
    run.enemies.push(e);
    return e;
  };

  function nearestHero(run, e) {
    let best = null, bd = Infinity;
    for (const h of run.heroes) {
      if (h.ko) continue;
      const d2 = U.dist2(e.x, e.z, h.x, h.z);
      if (d2 < bd) { bd = d2; best = h; }
    }
    return best;
  }
  AC.nearestHero = nearestHero;

  AC.updateEnemy = function (run, e, dt) {
    const C = DT.game.combat;
    e.stateT += dt;
    if (e.flashT > 0 && (e.flashT -= dt) <= 0 && !e.iceLook) unflash(e);
    for (const k in e.st) e.st[k] = Math.max(0, e.st[k] - dt);
    e.freezeImmune = Math.max(0, e.freezeImmune - dt);
    C.tickDots(run, e, dt);
    if (e.dead) return;
    const frozen = e.st.freeze > 0;
    if (!frozen && e.wasFrozen) { e.wasFrozen = false; e.freezeImmune = e.boss || e.elite ? 4 : 1.2; }
    if (frozen) e.wasFrozen = true;
    AC.freezeLook(e, frozen);
    if (e.state === 'spawn') {
      const k = Math.min(1, e.stateT / 0.45);
      e.mesh.scale.setScalar(e.scale * Math.max(0.01, k));
      if (k >= 1) { e.state = 'chase'; e.stateT = 0; }
      return;
    }
    if (Math.abs(e.kbx) + Math.abs(e.kbz) > 0.05) { e.x += e.kbx * dt; e.z += e.kbz * dt; e.kbx *= Math.pow(0.02, dt); e.kbz *= Math.pow(0.02, dt); }
    if (e.pull) { e.x += e.pull.x * dt; e.z += e.pull.z * dt; if ((e.pull.t -= dt) <= 0) e.pull = null; }
    if (e.st.stun > 0 || frozen) { e.vx = e.vz = 0; if (e.tele) { e.tele.alive = false; e.tele = null; } if (e.state !== 'chase') { e.state = 'chase'; e.stateT = 0; } return; }
    const tgt = nearestHero(run, e);
    if (!tgt) { e.vx = e.vz = 0; return; }
    e.target = tgt;
    const dx = tgt.x - e.x, dz = tgt.z - e.z;
    const dist = Math.hypot(dx, dz) || 0.001;
    const slow = (e.st.chill > 0 ? 0.55 : 1) * (e.st.root > 0 ? 0 : 1);
    const moveTo = (tx, tz, spd) => { const ddx = tx - e.x, ddz = tz - e.z; const d = Math.hypot(ddx, ddz) || 1; e.vx = (ddx / d) * spd; e.vz = (ddz / d) * spd; e.facing = Math.atan2(ddx, ddz); };
    const stop = () => { e.vx = e.vz = 0; };
    if (e.st.fear > 0) { moveTo(e.x - dx, e.z - dz, e.speed * 0.9 * (e.st.chill > 0 ? 0.55 : 1)); e.state = 'chase'; e.walkT += dt * 8; return; }
    const arch = e.def.arch;
    if (arch === 'boss') { C.bossThink(run, e, tgt, dt, slow); e.walkT += dt * (Math.hypot(e.vx, e.vz) > 0.2 ? 6 : 2); return; }
    const reach = e.r + (tgt.r || 0.5) + 0.55;
    e.attackCd = Math.max(0, e.attackCd - dt);
    switch (e.state) {
      case 'chase': {
        if (arch === 'ranged' || arch === 'magicman') {
          e.facing = Math.atan2(dx, dz);
          if (dist < 4.5) moveTo(e.x - dx, e.z - dz, e.speed * slow);
          else if (dist > 8) moveTo(tgt.x, tgt.z, e.speed * slow);
          else { e.vx = Math.cos(e.walkT * 0.7) * e.speed * 0.4 * slow; e.vz = Math.sin(e.walkT * 0.9) * e.speed * 0.4 * slow; }
          if (e.attackCd <= 0 && dist < 12) { e.state = 'windup'; e.stateT = 0; stop(); }
          if (arch === 'magicman' && (e.timers.blink = (e.timers.blink || 0) + dt) > 5) { e.timers.blink = 0; C.blinkEnemy(run, e, tgt); }
        } else {
          const spd = e.speed * slow * (arch === 'bomber' ? 1.1 : 1);
          if (arch === 'lunger' && dist < 5.5 && e.attackCd <= 0) { e.state = 'windup'; e.stateT = 0; stop(); e.lungeTo = { x: tgt.x, z: tgt.z }; e.tele = GF.telegraph(tgt.x, tgt.z, 1.2, 0.6); break; }
          if ((arch === 'melee' || arch === 'lemongrab') && dist < reach && e.attackCd <= 0) { e.state = 'windup'; e.stateT = 0; stop(); break; }
          if (arch === 'tank' && dist < reach + 1.3 && e.attackCd <= 0) { e.state = 'windup'; e.stateT = 0; stop(); const fx = e.x + (dx / dist) * 1.4, fz = e.z + (dz / dist) * 1.4; e.slamAt = { x: fx, z: fz }; e.tele = GF.telegraph(fx, fz, 2.4, 1.0); break; }
          if (arch === 'bomber' && dist < 1.4) { e.state = 'windup'; e.stateT = 0; stop(); e.tele = GF.telegraph(e.x, e.z, 2.3, 0.8); break; }
          if (arch === 'lemongrab' && (e.timers.scream = (e.timers.scream || 0) + dt) > 6.5) { e.timers.scream = 0; e.state = 'scream'; e.stateT = 0; stop(); e.tele = GF.telegraph(e.x, e.z, 5, 0.9, '#ffd400'); DT.sfx.play('scream'); break; }
          if (dist > reach * 0.8) moveTo(tgt.x, tgt.z, spd); else { stop(); e.facing = Math.atan2(dx, dz); }
        }
        break;
      }
      case 'windup': {
        const wind = arch === 'melee' || arch === 'lemongrab' ? 0.42 : arch === 'lunger' ? 0.6 : arch === 'tank' ? 1.0 : arch === 'bomber' ? 0.8 : 0.45;
        if (arch !== 'lunger') e.facing = Math.atan2(dx, dz);
        if (e.stateT >= wind) { e.state = 'attack'; e.stateT = 0; e.hitDone = false; if (e.tele) { e.tele.alive = false; e.tele = null; } C.enemyAttack(run, e, tgt); }
        break;
      }
      case 'attack': {
        if (arch === 'lunger') {
          const lt = e.lungeTo;
          const ldx = lt.x - e.x, ldz = lt.z - e.z;
          const ld = Math.hypot(ldx, ldz);
          if (ld > 0.4 && e.stateT < 0.45) { e.vx = (ldx / ld) * 15 * slow; e.vz = (ldz / ld) * 15 * slow; }
          else stop();
          if (!e.hitDone) for (const h of run.heroes) if (!h.ko && U.dist2(e.x, e.z, h.x, h.z) < (e.r + h.r + 0.2) ** 2) { e.hitDone = true; C.hurtHero(run, h, e.dmg, e); }
          if (e.stateT > 0.5) { e.state = 'recover'; e.stateT = 0; stop(); }
        } else if (e.stateT > 0.15) { e.state = 'recover'; e.stateT = 0; stop(); }
        break;
      }
      case 'scream': {
        if (e.stateT >= 0.9) { if (e.tele) { e.tele.alive = false; e.tele = null; } C.lemongrabScream(run, e, e.r * 5.5, 1.2, 0.6); e.state = 'recover'; e.stateT = 0; }
        break;
      }
      case 'recover': {
        stop();
        const rec = arch === 'tank' ? 1.0 : arch === 'lunger' ? 0.8 : arch === 'ranged' || arch === 'magicman' ? 0.2 : 0.55;
        if (e.stateT >= rec) { e.state = 'chase'; e.stateT = 0; e.attackCd = arch === 'ranged' ? R.float(1.4, 2.2) : arch === 'magicman' ? 2.2 : R.float(0.4, 0.9); }
        break;
      }
      default: e.state = 'chase';
    }
    e.walkT += dt * (Math.hypot(e.vx, e.vz) > 0.2 ? 8 : 2);
  };

  /* ---------- animation ---------- */
  AC.animateHero = function (run, h, dt) {
    const m = h.mesh, p = h.parts;
    m.position.set(h.x, h.liftY || 0, h.z);
    const d = U.angleDiff(m.rotation.y, h.facing);
    m.rotation.y += d * Math.min(1, dt * 18);
    const moving = Math.hypot(h.vx, h.vz) > 0.3;
    h.walkT += dt * (moving ? 11 : 2);
    const target = h.S.scale * (h.buffs.giant > 0 ? 1.8 : 1) * (h.buffs.mega > 0 ? 2.4 : 1);
    h.scale += (target - h.scale) * Math.min(1, dt * 6);
    m.scale.setScalar(h.scale);
    if (h.ko) { m.rotation.z = U.lerp(m.rotation.z, Math.PI / 2, dt * 6); m.position.y = 0.2; return; }
    m.rotation.z = U.lerp(m.rotation.z, 0, dt * 8);
    if (h.id === 'finn') {
      const sw = moving ? Math.sin(h.walkT) * 0.7 : 0;
      p.legL.rotation.x = sw; p.legR.rotation.x = -sw;
      p.head.position.y = 1.34 + (moving ? Math.abs(Math.sin(h.walkT)) * 0.05 : Math.sin(h.walkT) * 0.015);
      if (h.state === 'attack') {
        const k = Math.min(1, h.stateT / h.swingTime);
        const type = h.S.weapon.type;
        p.armR.rotation.x = -1.45;
        if (type === 'rapier') { p.sword.rotation.x = -Math.PI / 2 + 0.2; p.swingR.rotation.y = 0; p.armR.rotation.x = -1.2 - Math.sin(k * Math.PI) * 0.5; p.swingR.position.z = Math.sin(k * Math.PI) * 0.35; }
        else {
          p.sword.rotation.x = 0; p.swingR.position.z = 0;
          const dir = h.combo % 2 === 1 ? 1 : -1;
          p.swingR.rotation.y = h.combo === 3 ? U.lerp(2.2, -2.6, k) : dir * U.lerp(1.3, -1.3, k);
          if (type === 'great' && h.combo === 3) { p.swingR.rotation.y = 0; p.armR.rotation.x = U.lerp(-2.8, -0.6, k); }
        }
      } else if (h.state === 'dash') {
        m.rotation.x = Math.min(1, h.stateT / 0.28) * Math.PI * 2;
      } else {
        m.rotation.x = 0;
        p.swingR.position.z = U.lerp(p.swingR.position.z, 0, dt * 10);
        p.swingR.rotation.y = U.lerp(p.swingR.rotation.y, 0, dt * 10);
        p.armR.rotation.x = U.lerp(p.armR.rotation.x, moving ? -0.3 - sw * 0.3 : -0.2, dt * 10);
        p.sword.rotation.x = U.lerp(p.sword.rotation.x, -1.25, dt * 10);
        p.armL.rotation.x = moving ? sw * 0.6 : 0;
      }
      if (h.state !== 'dash') m.rotation.x = U.lerp(m.rotation.x, 0, dt * 12) % (Math.PI * 2);
    } else {
      p.body.position.y = moving ? Math.abs(Math.sin(h.walkT)) * 0.08 : Math.sin(h.walkT) * 0.02;
      const armR = p.armR, armL = p.armL;
      const main = h.fists.find((f) => f.main);
      if (main) {
        const arm = main.side ? armL : armR;
        const other = main.side ? armR : armL;
        const dx = main.x - h.x, dz = main.z - h.z;
        const len = Math.hypot(dx, dz);
        arm.group.rotation.x = -Math.PI / 2;
        arm.group.rotation.z = 0;
        MD.stretchArm(arm, Math.max(0.44, (len - 0.6 * h.scale) / h.scale));
        other.group.rotation.x = U.lerp(other.group.rotation.x, 0, dt * 10);
        if (other.len > 0.45) MD.stretchArm(other, U.lerp(other.len, 0.44, dt * 12));
      } else if (h.buffs.copter > 0) {
        for (const a of [armL, armR]) { a.group.rotation.x = 0; MD.stretchArm(a, 1.6); }
        armL.group.rotation.z = Math.PI / 2; armR.group.rotation.z = -Math.PI / 2;
        p.body.rotation.y += dt * 20;
      } else {
        p.body.rotation.y = U.lerp(p.body.rotation.y % (Math.PI * 2), 0, dt * 8);
        for (const [a, s] of [[armL, -1], [armR, 1]]) {
          a.group.rotation.x = U.lerp(a.group.rotation.x, moving ? Math.sin(h.walkT + (s > 0 ? 0 : Math.PI)) * 0.4 : 0, dt * 10);
          a.group.rotation.z = U.lerp(a.group.rotation.z, 0.15 * s, dt * 10);
          if (a.len > 0.45) MD.stretchArm(a, U.lerp(a.len, 0.44, dt * 12));
        }
      }
      if (h.state === 'dash' || h.buffs.ball > 0) { p.body.scale.set(0.8, 0.8, 0.8); m.rotation.x += dt * 25; }
      else { p.body.scale.set(1, 1, 1); m.rotation.x = 0; }
    }
  };
  AC.animateEnemy = function (e, dt) {
    const m = e.mesh;
    m.position.set(e.x, 0, e.z);
    const d = U.angleDiff(m.rotation.y, e.facing);
    m.rotation.y += d * Math.min(1, dt * 10);
    if (e.state === 'spawn' || e.dead) return;
    const b = e.parts.body;
    const moving = Math.hypot(e.vx, e.vz) > 0.2;
    if (b) {
      b.position.y = (e.def.flying ? 1.3 : 0) + (moving ? Math.abs(Math.sin(e.walkT)) * 0.1 : 0) + (e.def.model === 'iceking' || e.def.model === 'conductor' ? 0.3 + Math.sin(e.walkT * 0.5) * 0.12 : 0);
      b.rotation.z = moving && e.def.model === 'penguin' ? Math.sin(e.walkT) * 0.15 : 0;
      if (e.state === 'windup' || e.telegraphing) { b.rotation.x = -0.25; b.scale.setScalar(1 + Math.sin(e.stateT * 30) * 0.03); }
      else { b.rotation.x = e.state === 'attack' ? 0.35 : 0; b.scale.setScalar(1); }
    }
    if (e.parts.orbit) e.parts.orbit.rotation.y += dt * 2;
    if (e.parts.wingL) { const f = Math.sin(e.walkT * 3) * 0.6; e.parts.wingL.rotation.z = f; e.parts.wingR.rotation.z = -f; }
    if (e.parts.mouth) e.parts.mouth.scale.y = e.state === 'scream' || e.screaming ? 4 : 1;
  };

  DT.game.actors = AC;
})();
