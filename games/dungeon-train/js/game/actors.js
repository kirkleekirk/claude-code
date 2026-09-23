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
  const ICE = window.THREE ? new THREE.MeshBasicMaterial({ color: GF.lin('#9fe3ff') }) : null;

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
      const k = Math.min(1, e.stateT / 0.42), q = k - 1;
      const pop = 1 + 2.7 * q * q * q + 1.7 * q * q;
      e.mesh.scale.setScalar(e.scale * Math.max(0.01, pop));
      if (k >= 1) { e.state = 'chase'; e.stateT = 0; e.mesh.scale.setScalar(e.scale); e.sqV = -3; }
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
    /* elites with two sides */
    if (arch === 'angel' && !e.revealed && e.hp < e.maxHp * 0.5) C.reveal(run, e);
    if (arch === 'shifter' && !e.transformed && e.hp < e.maxHp * 0.5) C.transform(run, e);
    if (arch === 'angel' && !e.revealed && (e.timers.heal = (e.timers.heal || 0) + dt) > 5) { e.timers.heal = 0; C.angelHeal(run, e); }
    /* A = how it fights right now */
    const A = arch === 'angel' ? (e.revealed ? 'lunger' : 'ranged') : arch === 'bufo' ? (e.mode || 'lunger') : arch === 'fool' ? 'lunger'
      : arch === 'hypno' || arch === 'moon' ? 'ranged' : arch === 'shifter' ? 'melee' : arch;
    const reach = e.r + (tgt.r || 0.5) + 0.55 + (e.reach || 0);
    e.attackCd = Math.max(0, e.attackCd - dt);
    switch (e.state) {
      case 'chase': {
        if (arch === 'bufo' && !e.modeSet && e.attackCd <= 0) { e.mode = R.chance(0.5) ? 'lunger' : 'magicman'; e.modeSet = true; }
        if (A === 'ranged' || A === 'magicman' || A === 'zapper') {
          e.facing = Math.atan2(dx, dz);
          if (dist < 4.5) moveTo(e.x - dx, e.z - dz, e.speed * slow);
          else if (dist > 8) moveTo(tgt.x, tgt.z, e.speed * slow);
          else { e.vx = Math.cos(e.walkT * 0.7) * e.speed * 0.4 * slow; e.vz = Math.sin(e.walkT * 0.9) * e.speed * 0.4 * slow; }
          const range = A === 'zapper' ? (e.def.zap.len || 11) - 1 : 12;
          if (e.attackCd <= 0 && dist < range) {
            e.state = 'windup'; e.stateT = 0; stop();
            if (A === 'zapper') { const z = e.def.zap; e.zapDir = Math.atan2(dx, dz); e.tele = GF.telegraphRect(e.x, e.z, e.zapDir, z.len || 11, 0.9, z.wind || 0.75, z.color || '#7fdcff'); }
          }
          if (arch === 'magicman' && (e.timers.blink = (e.timers.blink || 0) + dt) > 5) { e.timers.blink = 0; C.blinkEnemy(run, e, tgt); }
          if (arch === 'hypno' && (e.timers.hypno = (e.timers.hypno || 0) + dt) > 7) {
            e.timers.hypno = 0; e.state = 'scream'; e.stateT = 0; stop();
            e.screamCfg = { r: 5.5, mult: 0.5, stun: 1.3, text: 'Look into my eye…', color: '#ff4d6d', push: false };
            e.tele = GF.telegraph(e.x, e.z, 5.5, 0.9, '#ff4d6d');
          }
        } else {
          const spd = e.speed * slow * (arch === 'bomber' ? 1.1 : 1);
          if (A === 'lunger' && dist < 5.5 && e.attackCd <= 0) { e.state = 'windup'; e.stateT = 0; stop(); e.lungeTo = { x: tgt.x, z: tgt.z }; e.tele = GF.telegraph(tgt.x, tgt.z, 1.2, 0.6); break; }
          if ((A === 'melee' || arch === 'lemongrab') && dist < reach && e.attackCd <= 0) { e.state = 'windup'; e.stateT = 0; stop(); break; }
          if (arch === 'tank' && dist < reach + 1.3 && e.attackCd <= 0) { e.state = 'windup'; e.stateT = 0; stop(); const fx = e.x + (dx / dist) * 1.4, fz = e.z + (dz / dist) * 1.4; e.slamAt = { x: fx, z: fz }; e.tele = GF.telegraph(fx, fz, 2.4, 1.0); break; }
          if (arch === 'bomber' && dist < 1.4) { e.state = 'windup'; e.stateT = 0; stop(); e.tele = GF.telegraph(e.x, e.z, 2.3, 0.8); break; }
          if (arch === 'lemongrab' && (e.timers.scream = (e.timers.scream || 0) + dt) > 6.5) { e.timers.scream = 0; e.state = 'scream'; e.stateT = 0; stop(); e.screamCfg = null; e.tele = GF.telegraph(e.x, e.z, 5, 0.9, '#ffd400'); DT.sfx.play('scream'); break; }
          if (arch === 'fool') {
            /* the Fool never comes at you in a straight line */
            const px = -dz / dist, pz = dx / dist, o = Math.sin((e.animT || 0) * 2.6) * 2.4;
            moveTo(tgt.x + px * o, tgt.z + pz * o, spd * 1.1);
          } else if (dist > reach * 0.8) moveTo(tgt.x, tgt.z, spd); else { stop(); e.facing = Math.atan2(dx, dz); }
        }
        break;
      }
      case 'windup': {
        const wind = A === 'melee' || arch === 'lemongrab' ? 0.42 : A === 'lunger' ? 0.6 : arch === 'tank' ? 1.0 : arch === 'bomber' ? 0.8 : A === 'zapper' ? (e.def.zap.wind || 0.75) : 0.45;
        if (A !== 'lunger' && A !== 'zapper') e.facing = Math.atan2(dx, dz);
        if (e.stateT >= wind) { e.state = 'attack'; e.stateT = 0; e.hitDone = false; if (e.tele) { e.tele.alive = false; e.tele = null; } C.enemyAttack(run, e, tgt, A); }
        break;
      }
      case 'attack': {
        if (A === 'lunger' && e.lungeTo) {
          const lt = e.lungeTo;
          const ldx = lt.x - e.x, ldz = lt.z - e.z;
          const ld = Math.hypot(ldx, ldz);
          if (ld > 0.4 && e.stateT < 0.45) { e.vx = (ldx / ld) * 15 * slow; e.vz = (ldz / ld) * 15 * slow; }
          else stop();
          if (!e.hitDone) for (const h of run.heroes) if (!h.ko && U.dist2(e.x, e.z, h.x, h.z) < (e.r + h.r + 0.2) ** 2) { e.hitDone = true; C.hurtHero(run, h, e.dmg, e); }
          if (e.stateT > 0.5) { e.state = 'recover'; e.stateT = 0; stop(); if (arch === 'bufo' || arch === 'fool') e.sqV = -5; }
        } else if (e.stateT > 0.15) { e.state = 'recover'; e.stateT = 0; stop(); }
        break;
      }
      case 'scream': {
        if (e.stateT >= 0.9) {
          if (e.tele) { e.tele.alive = false; e.tele = null; }
          const c = e.screamCfg;
          if (c) C.lemongrabScream(run, e, c.r, c.mult, c.stun, c.text, c.color, c.push);
          else C.lemongrabScream(run, e, e.r * 5.5, 1.2, 0.6);
          e.state = 'recover'; e.stateT = 0;
        }
        break;
      }
      case 'recover': {
        stop();
        const rec = arch === 'tank' ? 1.0 : A === 'lunger' ? 0.8 : A === 'ranged' || A === 'magicman' || A === 'zapper' ? 0.25 : 0.55;
        if (e.stateT >= rec) {
          e.state = 'chase'; e.stateT = 0; e.modeSet = false;
          e.attackCd = A === 'ranged' ? R.float(1.4, 2.2) : A === 'magicman' ? 2.2 : A === 'zapper' ? R.float(2.0, 3.0) : R.float(0.4, 0.9);
        }
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
    h.animT = (h.animT || 0) + dt;
    const target = h.S.scale * (h.buffs.giant > 0 ? 1.8 : 1) * (h.buffs.mega > 0 ? 2.4 : 1);
    h.scale += (target - h.scale) * Math.min(1, dt * 6);
    /* squash & stretch: squash going into a dodge, stretch coming out of it, a little pop on each swing */
    if (h.state !== h.prevState) {
      if (h.state === 'dash') h.sqV = (h.sqV || 0) - 6;
      else if (h.prevState === 'dash') h.sqV = (h.sqV || 0) + 4;
      else if (h.state === 'attack') h.sqV = (h.sqV || 0) + 2.2;
      h.prevState = h.state;
    }
    h.sq = h.sq || 0; h.sqV = h.sqV || 0;
    h.sqV += (-90 * h.sq - 12 * h.sqV) * dt;
    h.sq += h.sqV * dt;
    const sq = U.clamp(h.sq, -0.3, 0.3);
    m.scale.set(h.scale * (1 - sq * 0.5), h.scale * (1 + sq), h.scale * (1 - sq * 0.5));
    if (h.hurtT > 0) h.hurtT -= dt;
    if (h.ko) { m.rotation.z = U.lerp(m.rotation.z, Math.PI / 2, dt * 6); m.position.y = 0.2; return; }
    m.rotation.z = U.lerp(m.rotation.z, 0, dt * 8);
    const stunned = h.st.stun > 0 || h.st.freeze > 0;
    if (h.id === 'finn') {
      const sw = moving ? Math.sin(h.walkT) * 0.85 : 0;
      p.legL.rotation.x = U.lerp(p.legL.rotation.x, sw, Math.min(1, dt * 16));
      p.legR.rotation.x = U.lerp(p.legR.rotation.x, -sw, Math.min(1, dt * 16));
      p.head.position.y = 1.34 + (moving ? Math.abs(Math.sin(h.walkT)) * 0.06 : Math.sin(h.animT * 2.4) * 0.015);
      p.head.rotation.z = stunned ? Math.sin(h.animT * 14) * 0.2 : U.lerp(p.head.rotation.z, moving ? Math.sin(h.walkT * 0.5) * 0.05 : 0, dt * 8);
      if (h.state === 'attack') {
        const k = Math.min(1, h.stateT / h.swingTime);
        const type = h.S.weapon.type;
        p.armR.rotation.x = -1.45;
        if (type === 'rapier') { p.sword.rotation.x = -Math.PI / 2 + 0.2; p.swingR.rotation.y = 0; p.armR.rotation.x = -1.2 - Math.sin(k * Math.PI) * 0.5; p.swingR.position.z = Math.sin(k * Math.PI) * 0.35; }
        else {
          p.sword.rotation.x = 0; p.swingR.position.z = 0;
          const dir = h.combo % 2 === 1 ? 1 : -1;
          /* ease-out swing: fast through the middle, a little overshoot at the end */
          const e2 = 1 - Math.pow(1 - k, 3);
          p.swingR.rotation.y = h.combo === 3 ? U.lerp(2.2, -2.6, e2) : dir * U.lerp(1.3, -1.45, e2);
          if (type === 'great' && h.combo === 3) { p.swingR.rotation.y = 0; p.armR.rotation.x = U.lerp(-2.8, -0.5, e2); }
        }
        p.armL.rotation.x = U.lerp(p.armL.rotation.x, 0.5, dt * 12);
        h.lean = U.lerp(h.lean || 0, 0.14, dt * 12);
      } else if (h.state === 'dash') {
        m.rotation.x = Math.min(1, h.stateT / 0.28) * Math.PI * 2;
      } else {
        p.swingR.position.z = U.lerp(p.swingR.position.z, 0, dt * 10);
        p.swingR.rotation.y = U.lerp(p.swingR.rotation.y, 0, dt * 10);
        p.armR.rotation.x = U.lerp(p.armR.rotation.x, moving ? -0.35 - sw * 0.35 : -0.2 + Math.sin(h.animT * 2.4) * 0.04, dt * 10);
        p.sword.rotation.x = U.lerp(p.sword.rotation.x, -1.25, dt * 10);
        p.armL.rotation.x = U.lerp(p.armL.rotation.x, moving ? sw * 0.8 : Math.sin(h.animT * 2.4 + 1) * 0.05, dt * 12);
        h.lean = U.lerp(h.lean || 0, moving ? 0.12 : 0, dt * 8);
      }
      if (h.hurtT > 0) h.lean = -0.25;
      if (h.state !== 'dash') m.rotation.x = U.lerp(m.rotation.x % (Math.PI * 2), h.lean || 0, dt * 14);
    } else {
      const bounce = moving ? Math.abs(Math.sin(h.walkT)) * 0.09 : Math.sin(h.animT * 2.2) * 0.02;
      p.body.position.y = bounce;
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
          a.group.rotation.x = U.lerp(a.group.rotation.x, moving ? Math.sin(h.walkT + (s > 0 ? 0 : Math.PI)) * 0.55 : Math.sin(h.animT * 2.2 + s) * 0.05, dt * 10);
          a.group.rotation.z = U.lerp(a.group.rotation.z, 0.15 * s, dt * 10);
          if (a.len > 0.45) MD.stretchArm(a, U.lerp(a.len, 0.44, dt * 12));
        }
      }
      /* Jake waddles, his ears flop and his tail wags */
      p.body.rotation.z = U.lerp(p.body.rotation.z, stunned ? Math.sin(h.animT * 14) * 0.12 : moving ? Math.sin(h.walkT) * 0.11 : 0, dt * 10);
      if (p.earL) {
        const flop = moving ? Math.sin(h.walkT * 2) * 0.22 : Math.sin(h.animT * 1.6) * 0.05;
        p.earL.rotation.z = U.lerp(p.earL.rotation.z, -0.38 - flop - (h.hurtT > 0 ? 0.5 : 0), dt * 12);
        p.earR.rotation.z = U.lerp(p.earR.rotation.z, 0.38 + flop + (h.hurtT > 0 ? 0.5 : 0), dt * 12);
      }
      if (p.tail) p.tail.rotation.y = Math.sin(h.animT * (moving ? 14 : 6)) * (h.hurtT > 0 ? 0.05 : 0.5);
      const ball = h.state === 'dash' || h.buffs.ball > 0;
      const k2 = ball ? 0.8 : 1;
      p.body.scale.set(k2, k2, k2);
      if (ball) m.rotation.x += dt * 25;
      else m.rotation.x = U.lerp(m.rotation.x % (Math.PI * 2), h.hurtT > 0 ? -0.2 : moving ? 0.08 : 0, dt * 14);
    }
  };
  /* Cartoon animation for monsters: squash & stretch on a spring (hits, hops, landings), rubber-hose walk
     cycles, flapping wings, wagging tails, wobbly tentacles, an anticipation crouch before attacks and a
     big lean into the swing. Each model says which parts it has (see bestiary.js). */
  const lerpA = (a, b, k) => a + (b - a) * k;
  AC.animateEnemy = function (e, dt) {
    const m = e.mesh, p = e.parts, def = e.def;
    m.position.set(e.x, 0, e.z);
    const d = U.angleDiff(m.rotation.y, e.facing);
    m.rotation.y += d * Math.min(1, dt * 10);
    if (e.state === 'spawn' || e.dead) return;
    const b = p.body;
    if (!b) return;
    e.animT = (e.animT || Math.random() * 10) + dt;
    const T = e.animT, t = e.walkT;
    const moving = Math.hypot(e.vx, e.vz) > 0.2;
    const busy = e.busy;
    const wind = e.state === 'windup' || e.telegraphing || (busy && busy.kind !== 'pull' && busy.t < (busy.wind || busy.dur || 0) * 0.9);
    const atk = e.state === 'attack' || e.state === 'scream' || (busy && busy.kind === 'charge' && busy.t >= busy.wind) || (e.screaming > 0);
    const k = Math.min(1, dt * 14);
    /* squash & stretch spring */
    e.sq = e.sq || 0; e.sqV = e.sqV || 0;
    e.sqV += (-80 * e.sq - 11 * e.sqV) * dt;
    e.sq += e.sqV * dt;
    let sy = 1 + e.sq, sx = 1 - e.sq * 0.6;
    let y = def.flying ? 1.3 : 0, lean = 0, roll = 0;
    if (p.float) y += 0.18 + Math.sin(T * 2.1) * 0.1;
    if (p.hop) {
      const h = moving ? Math.abs(Math.sin(t * 0.8)) : 0;
      y += h * 0.3 * (p.hopH || 1);
      const st = moving ? (h - 0.35) : 0;
      sy *= 1 + st * 0.2; sx *= 1 - st * 0.1;
      if (moving && e.lastHop != null && e.lastHop > 0.25 && h < 0.08) e.sqV -= 2.5;
      e.lastHop = h;
    } else if (moving) y += Math.abs(Math.sin(t)) * (p.bob != null ? p.bob : 0.06);
    if (!moving && !p.hop) { const br = Math.sin(T * 2.4) * 0.02; sy *= 1 + br; sx *= 1 - br * 0.5; }
    if (p.ooze) { const o = Math.sin(T * 3) * 0.05; sy *= 1 + o; sx *= 1 - o * 0.5; }
    if (p.waddle && moving) roll = Math.sin(t) * p.waddle;
    if (wind) { lean = -0.2; sy *= 0.9 + Math.sin(T * 40) * 0.02; sx *= 1.06; }
    else if (atk) { lean = 0.3; sy *= 1.1; sx *= 0.94; }
    if (e.hurtT > 0) { e.hurtT -= dt; lean -= 0.3 * Math.min(1, e.hurtT / 0.14); }
    if (e.st.stun > 0 || e.st.freeze > 0) { roll = e.st.freeze > 0 ? 0 : Math.sin(T * 12) * 0.06; lean = 0; }
    b.position.y = lerpA(b.position.y, y, Math.min(1, dt * 20));
    b.rotation.x = lerpA(b.rotation.x, lean, k);
    b.rotation.z = lerpA(b.rotation.z, roll, k);
    b.scale.set(sx, sy, sx);
    const frozen = e.st.freeze > 0;
    if (frozen) return;
    /* legs: alternate (or diagonal pairs for four-legged monsters) */
    if (p.legs) {
      const amp = p.legAmp || 0.6;
      p.legs.forEach((g, i) => {
        const r0 = g.userData.r0, ph = p.legPh ? p.legPh[i] : i * Math.PI;
        const tx = r0.x + (moving ? Math.sin(t + ph) * amp : 0);
        g.rotation.x = lerpA(g.rotation.x, tx, k);
      });
    }
    /* arms: swing opposite the legs, raise in the wind-up, strike in the attack */
    if (p.arms) {
      p.arms.forEach((g, i) => {
        if (!g.visible) return;
        const r0 = g.userData.r0, ax = g.userData.ax || 'x', sgn = g.userData.sgn || 1;
        let target = r0[ax];
        if (p.rub && wind) {
          g.rotation.z = lerpA(g.rotation.z, r0.z - sgn * 0.7, k);
          target = r0.x - 1.1 + Math.sin(T * 38) * 0.18;
        } else if (wind && p.armWind != null) target = r0[ax] + p.armWind * (ax === 'z' ? sgn : 1);
        else if (atk && p.armWind != null) target = r0[ax] + (p.armHit || 0.4) * (ax === 'z' ? sgn : 1);
        else if (moving) target = r0[ax] + Math.sin(t + (i % 2 ? 0 : Math.PI)) * (p.armAmp != null ? p.armAmp : 0.5) * (ax === 'z' ? sgn : 1);
        else target = r0[ax] + Math.sin(T * 2.4 + i) * 0.04;
        if (p.rub && !wind) g.rotation.z = lerpA(g.rotation.z, r0.z, k);
        g.rotation[ax] = lerpA(g.rotation[ax], target, k);
      });
    }
    if (p.wings) {
      const f = Math.sin(T * (p.flapSpeed || 3) * (moving || def.flying ? 2.2 : 1)) * (p.flapAmp || 0.6);
      for (const w of p.wings) w.rotation.z = w.userData.r0.z + f * (w.userData.sgn || 1);
    }
    if (p.tail) p.tail.rotation.y = p.tail.userData.r0.y + Math.sin(T * (moving ? 9 : 3)) * 0.4;
    if (p.flames) p.flames.forEach((f, i) => { const s0 = f.userData.s0, q = 1 + Math.sin(T * 14 + i * 1.7) * 0.16 + Math.sin(T * 23 + i) * 0.06; f.scale.set(s0.x * (2 - q), s0.y * q, s0.z * (2 - q)); });
    if (p.tentacles) p.tentacles.forEach((tn, j) => tn.userData.segs.forEach((sg, i) => { if (!i) return; const r0 = sg.userData.r0; sg.rotation.z = r0.z + Math.sin(T * 2.2 + i * 0.7 + j * 1.3) * (atk ? 0.4 : 0.22); sg.rotation.x = r0.x + Math.cos(T * 1.7 + i * 0.5 + j) * 0.15; }));
    if (p.eyes) p.eyes.forEach((ey, i) => { const blink = (T * 0.7 + i * 0.37) % 3.2 < 0.12; ey.scale.y = lerpA(ey.scale.y, blink ? 0.1 : 1, Math.min(1, dt * 30)); });
    if (p.orbit) p.orbit.rotation.y += dt * (atk ? 6 : 2);
    if (p.spin) p.spin.rotation.y += dt * (p.spinSpeed || 2);
    if (p.halo) p.halo.position.y = 0.36 + Math.sin(T * 3) * 0.03;
    if (p.jaw) p.jaw.rotation.x = lerpA(p.jaw.rotation.x, p.jaw.userData.r0.x + (atk || e.screaming > 0 ? 0.55 : wind ? 0.22 : Math.max(0, Math.sin(T * 1.3)) * 0.06), k);
    if (p.mouth) p.mouth.scale.y = e.state === 'scream' || e.screaming > 0 ? 4 : 1;
    if (p.head && p.headTilt) p.head.rotation.z = lerpA(p.head.rotation.z, moving ? Math.sin(t * 0.5) * p.headTilt * 0.5 : Math.sin(T * 0.8) * p.headTilt * 0.4, Math.min(1, dt * 6));
    if (p.bubble) {
      const popped = e.phase >= 2;
      p.bubble.visible = !popped;
      if (popped && p.rider) p.rider.position.y = lerpA(p.rider.position.y, 0.05, Math.min(1, dt * 5));
    }
  };

  DT.game.actors = AC;
})();
