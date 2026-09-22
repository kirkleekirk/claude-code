/* Real-time combat: damage, statuses, melee, dashes, enemy attacks, projectiles, zones. */
(function () {
  'use strict';
  const D = AE.data;
  const R = AE.R;
  const U = AE.U;
  const GF = AE.game.gfx;
  const WG = AE.game.world;
  const C = {};
  const heroes = (run) => [run.heroes.finn, run.heroes.jake];
  const other = (run, h) => (h.id === 'finn' ? run.heroes.jake : run.heroes.finn);

  C.reachOf = (h) => (h.id === 'finn' ? 2.1 : 3.0) * h.S.reachMult * (h.buffs.giant > 0 ? 1.4 : 1);
  const say = (run, x, z, text, cls) => run.popup(x, 1.9, z, text, cls);

  /* ---------- healing, knockouts ---------- */
  C.healHero = function (run, h, amt, o) {
    o = o || {};
    if (h.ko || !(amt > 0)) return 0;
    const before = h.hp;
    h.hp = Math.min(h.maxHp, h.hp + amt);
    const got = h.hp - before;
    if (got >= 1 && !o.quiet) say(run, h.x, h.z, '+' + Math.round(got), 'heal');
    const share = run.S.team.healShare;
    if (share && !o.shared) { const b = other(run, h); if (!b.ko) C.healHero(run, b, got * share, { quiet: true, shared: true }); }
    return got;
  };
  C.revive = function (run, h, pct) {
    if (!h.ko) return;
    h.ko = false; h.koT = 0; h.state = 'idle'; h.st = {};
    h.hp = Math.max(1, h.maxHp * Math.min(1, pct + run.S.team.reviveHp));
    h.mesh.rotation.z = 0;
    h.iframes = 1.5;
    say(run, h.x, h.z, h.id === 'finn' ? 'Finn’s back!' : 'Jake’s back!', 'good');
    GF.ring(h.x, h.z, 2.2, '#7ed957', 0.5);
    AE.sfx.play('levelup');
  };
  function knockOut(run, h) {
    if (run.S.team.lastStand && !run.once.lastStand) {
      run.once.lastStand = true;
      h.hp = 1; h.buffs.invuln = 2;
      run.banner('ADVENTURE TIME!', 'good');
      return;
    }
    h.ko = true; h.hp = 0; h.koT = 0; h.state = 'idle'; h.vx = h.vz = 0;
    AE.sfx.play('ko');
    const b = other(run, h);
    run.banner(h.id === 'finn' ? 'Finn is down!' : 'Jake is down!', 'bad');
    if (!b.ko) {
      if (run.S.team.bffRage) { b.buffs.bff = 10; say(run, b.x, b.z, 'FOR ' + (h.id === 'finn' ? 'FINN' : 'JAKE') + '!', 'crit'); }
      if (run.active === h.id) run.setActive(b.id, true);
    } else run.wipe();
  }
  C.hurtHero = function (run, h, dmg, src, o) {
    o = o || {};
    if (h.ko || run.over || !(dmg > 0)) return 0;
    const S = h.S;
    if (!o.dot) {
      if (h.iframes > 0 || h.buffs.invuln > 0 || h.state === 'super') return 0;
      if (Math.random() < S.dodge) { say(run, h.x, h.z, 'Dodged!', 'good'); return 0; }
      const blink = (S.blinkChance || 0) + (S.hooks.blinkChance || 0);
      if (Math.random() < blink) {
        const a = Math.random() * Math.PI * 2;
        GF.burst(h.x, 0.8, h.z, '#b061ff', 10, 4, { dur: 0.4 });
        h.x += Math.cos(a) * 2.5; h.z += Math.sin(a) * 2.5;
        WG.resolve(run.train, h, h.r);
        say(run, h.x, h.z, 'Poof!', 'good');
        return 0;
      }
      if (S.hooks.blockEvery && h.blockT <= 0) { h.blockT = S.hooks.blockEvery; say(run, h.x, h.z, 'Blocked!', 'good'); GF.ring(h.x, h.z, 1.2, '#ffcf3d', 0.25); return 0; }
    }
    let d = dmg * (1 - AE.meta.stats.armorReduction(S.armor * (h.buffs.giant > 0 ? 1.3 : 1) + (h.buffs.giant > 0 ? 8 : 0)));
    if (h.id !== run.active) d *= 1 - (S.companionArmor || 0);
    if (h.buffs.shield) {
      const ab = Math.min(h.buffs.shield.hp, d);
      h.buffs.shield.hp -= ab; d -= ab;
      if (h.buffs.shield.hp <= 0) h.buffs.shield = null;
    }
    if (d <= 0) return 0;
    h.hp -= d;
    h.lastHurt = run.time;
    if (!o.dot) {
      AE.game.actors.flash(h);
      say(run, h.x, h.z, '-' + Math.round(d), 'hurt');
      AE.sfx.play('hurt');
      if (h.id === run.active) run.shake(0.18);
    }
    if (h.hp <= 0) knockOut(run, h);
    return d;
  };

  /* ---------- statuses ---------- */
  C.addStatus = function (run, e, id, dur, o) {
    if (e.dead) return;
    if (e.boss && (id === 'stun' || id === 'freeze' || id === 'root')) dur *= 0.35;
    if (id === 'chill' && e.st.chill > 0 && !e.boss) { e.st.freeze = Math.max(e.st.freeze || 0, 1.2); AE.sfx.play('freeze'); }
    e.st[id] = Math.max(e.st[id] || 0, dur);
    if (id === 'burn' || id === 'bleed') { e.dots[id] = { dps: Math.max(e.dots[id] ? e.dots[id].dps : 0, (o && o.dps) || 3), t: dur }; }
    if (id === 'stun') say(run, e.x, e.z, 'Stunned!', 'status');
  };
  C.tickDots = function (run, e, dt) {
    for (const k in e.dots) {
      const dt2 = e.dots[k];
      dt2.t -= dt;
      if (dt2.t <= 0) { delete e.dots[k]; continue; }
      e.hp -= dt2.dps * dt;
      e.dotAcc = (e.dotAcc || 0) + dt2.dps * dt;
      if (e.dotAcc >= 4) { say(run, e.x, e.z, '-' + Math.round(e.dotAcc), k === 'burn' ? 'burn' : 'bleed'); e.dotAcc = 0; }
      if (e.hp <= 0 && !e.dead) { C.killEnemy(run, e, null); return; }
    }
  };

  /* ---------- hitting enemies ---------- */
  C.hitEnemy = function (run, e, base, o) {
    o = o || {};
    if (!e || e.dead || e.state === 'spawn') return 0;
    const h = o.hero || run.heroes[run.active];
    const S = h.S;
    let dmg = base;
    if (h.buffs.cry > 0) dmg *= 1.35;
    if (h.buffs.potion > 0) dmg *= 1.4;
    if (h.buffs.giant > 0) dmg *= 1.6;
    if (h.buffs.bff > 0) dmg *= 1.5;
    if (h.id !== run.active && o.melee) dmg *= 0.55 + (S.companion || 0);
    const disabled = e.st.stun > 0 || e.st.root > 0 || e.st.freeze > 0;
    if (disabled && S.vsDisabled) dmg *= 1 + S.vsDisabled;
    if (S.hooks.rootedBonus && e.st.root > 0) dmg *= 1 + S.hooks.rootedBonus;
    if (S.hooks.blizzardDmg) dmg *= 1 + S.hooks.blizzardDmg * run.blizzard;
    let crit = false;
    if (!o.noCrit && Math.random() < S.crit) { crit = true; dmg *= S.critDmg; }
    dmg = Math.max(1, Math.round(dmg * R.float(0.9, 1.1)));
    e.hp -= dmg;
    run.stats.dmg += dmg;
    run.addMeter(o.meter != null ? o.meter : o.melee ? 2.2 : 1.2, S);
    say(run, e.x, e.z, String(dmg), crit ? 'crit' : o.melee ? 'hit' : 'hit2');
    AE.game.actors.flash(e);
    if (o.kb && !e.boss) {
      const dx = e.x - (o.from ? o.from.x : h.x), dz = e.z - (o.from ? o.from.z : h.z);
      const d = Math.hypot(dx, dz) || 1;
      const kb = o.kb * (1 + (S.knockback || 0)) / (e.elite ? 3 : 1);
      e.kbx = (dx / d) * kb; e.kbz = (dz / d) * kb;
    }
    if (S.lifesteal && o.melee) C.healHero(run, h, dmg * S.lifesteal, { quiet: true });
    if (!o.noProc) {
      const hk = S.hooks;
      if (S.burnChance && Math.random() < S.burnChance) C.addStatus(run, e, 'burn', 3, { dps: S.power * 0.3 });
      if (S.chillChance && Math.random() < S.chillChance) C.addStatus(run, e, 'chill', 2.5);
      if (S.bleedChance && Math.random() < S.bleedChance) C.addStatus(run, e, 'bleed', 4, { dps: S.power * 0.25 });
      if ((S.stunChance || 0) + (hk.stunChance || 0) > 0 && Math.random() < (S.stunChance || 0) + (hk.stunChance || 0)) C.addStatus(run, e, 'stun', 0.6);
      if (hk.rootChance && Math.random() < hk.rootChance) C.addStatus(run, e, 'root', 1.5);
      if (hk.igniteEvery && o.melee) { h.igniteN = (h.igniteN || 0) + 1; if (h.igniteN % hk.igniteEvery === 0) C.addStatus(run, e, 'burn', 3, { dps: S.power * 0.45 }); }
      if (crit && hk.critHeal) C.healHero(run, h, h.maxHp * hk.critHeal, { quiet: true });
      if (crit && hk.zapOnCrit) {
        const n = run.enemies.find((x) => x !== e && !x.dead && U.dist2(x.x, x.z, e.x, e.z) < 25);
        if (n) { C.zapLine(e, n, '#7fe3ff'); C.hitEnemy(run, n, dmg * 0.6, { hero: h, noProc: true, noCrit: true, meter: 0 }); }
      }
    }
    if (crit) AE.sfx.play('crit'); else AE.sfx.play(h.id === 'jake' && o.melee ? 'punch' : 'hit');
    if (e.hp <= 0) C.killEnemy(run, e, h);
    else if (e.def.arch === 'lemongrab' && e.hp < e.maxHp / 2 && !e.timers.summoned) { e.timers.summoned = true; C.summonMinions(run, e, 2); say(run, e.x, e.z, 'UNACCEPTABLE!!!', 'crit'); }
    return dmg;
  };
  C.zapLine = function (a, b, color) {
    const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
    const m = new THREE.Mesh(GF.geo('box', 0.08, 0.08, 1), GF.basic(color, { add: true }).clone());
    m.scale.z = d;
    m.position.set((a.x + b.x) / 2, 0.9, (a.z + b.z) / 2);
    m.rotation.y = Math.atan2(dx, dz);
    GF.scene.add(m);
    GF.fx.push({ m, t: 0, dur: 0.15, kind: 'fade' });
  };

  C.killEnemy = function (run, e, h) {
    if (e.dead) return;
    e.dead = true;
    e.hp = 0;
    if (e.tele) { e.tele.alive = false; e.tele = null; }
    const col = e.def.tint || e.def.color || (e.def.model === 'penguin' ? '#26283a' : '#ffffff');
    GF.burst(e.x, 0.7, e.z, col, 12, 5);
    GF.burst(e.x, 0.7, e.z, '#ffcf3d', 5, 3, { size: 0.08 });
    GF.scene.remove(e.mesh);
    const t = run.train.tier;
    run.xp += e.def.xp * (1 + 0.35 * (t - 1)) * (e.elite && !e.def.elite ? 5 : 1);
    run.stats.kills += 1;
    run.G.codex.enemies[e.id] = (run.G.codex.enemies[e.id] || 0) + 1;
    if (e.elite) run.stats.elites += 1;
    run.addMeter(3, h ? h.S : run.S[run.active]);
    const src = e.boss ? 'boss' : e.elite ? 'elite' : 'enemy';
    run.spawnLoot(e.x, e.z, AE.meta.loot.drops(src, t, run.S.team, { luckBonus: run.luckBonus }));
    const T = run.S.team;
    for (const hh of heroes(run)) {
      if (hh.ko) continue;
      if (hh.S.hooks.healOnKill) C.healHero(run, hh, hh.maxHp * 0.04, { quiet: true });
      if (hh.id === 'jake' && hh.S.killHeal) C.healHero(run, hh, hh.maxHp * hh.S.killHeal, { quiet: true });
    }
    if (T.hooks.killBurst) {
      GF.ring(e.x, e.z, 2.6, '#ff5a1f', 0.4, { add: true });
      for (const n of run.enemies) if (!n.dead && n !== e && U.dist2(n.x, n.z, e.x, e.z) < 7) { C.hitEnemy(run, n, run.S[run.active].power * 0.6, { noProc: true, meter: 0 }); C.addStatus(run, n, 'burn', 3, { dps: run.S[run.active].power * 0.3 }); }
    }
    if (e.boss) run.onBossDown(e);
    run.checkCarClear(e.car);
  };

  C.summonMinions = function (run, e, n) {
    const fams = run.train.route.fams;
    const pool = [].concat(...fams.map((f) => D.FAMILIES[f] || []));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const p = { x: e.x + Math.cos(a) * 2, z: e.z + Math.sin(a) * 2 };
      WG.resolve(run.train, p, 0.5);
      AE.game.actors.spawnEnemy(run, R.pick(pool), p.x, p.z, { car: e.car });
    }
  };

  /* ---------- hero melee ---------- */
  C.tryAttack = function (run, h) {
    if (h.state === 'attack') { if (h.stateT > h.swingTime * 0.55) h.queued = true; return; }
    if (h.attackCd > 0) return;
    const S = h.S;
    h.state = 'attack'; h.stateT = 0; h.hitDone = false; h.queued = false;
    if (h.id === 'finn') {
      h.combo = h.comboT > 0 ? (h.combo % 3) + 1 : 1;
      h.swingTime = (h.combo === 3 ? 0.4 : 0.3) / S.attackRate;
    } else {
      h.punches += 1;
      h.swingTime = 0.42 / S.attackRate;
    }
    AE.sfx.play('swing');
  };
  function meleeHit(run, h) {
    const S = h.S, hk = S.hooks;
    const reach = C.reachOf(h);
    let arc = h.id === 'finn' ? (110 * (S.weapon.arc || 1)) : (hk.wideArc ? 180 : 55);
    let mult = 1, kb = 3.5;
    let rhythm = false;
    if (h.id === 'finn') {
      if (h.combo === 2) mult = 1.1;
      if (h.combo === 3) { mult = 1.6 + (S.finisher || 0); arc = 170; kb = 8; }
    } else {
      mult = 1; kb = 5;
      if (S.rhythm && h.punches % 4 === 0) { rhythm = true; arc = 120; mult = 1 + S.rhythm; }
    }
    if (h.riposte) { mult *= 1 + S.riposte; h.riposte = false; }
    const arcR = (arc * Math.PI) / 180;
    let hits = 0;
    for (const e of run.enemies) {
      if (e.dead || e.state === 'spawn') continue;
      const dx = e.x - h.x, dz = e.z - h.z;
      const d = Math.hypot(dx, dz);
      if (d > reach + e.r) continue;
      if (Math.abs(U.angleDiff(h.facing, Math.atan2(dx, dz))) > arcR / 2 && d > e.r + h.r + 0.3) continue;
      C.hitEnemy(run, e, S.power * mult, { hero: h, melee: true, kb });
      hits++;
    }
    run.smashNear(h, reach, arcR, h.id === 'finn' && h.combo === 3 ? 2 : 1);
    if (h.id === 'finn') {
      GF.swoosh(h.x, h.z, h.facing, reach, arcR, h.combo === 3 ? '#ffd84a' : '#ffffff');
      if ((S.finisherBeam && h.combo === 3) || (hk.beamEvery && (h.swings = (h.swings || 0) + 1) % hk.beamEvery === 0)) C.swordBeam(run, h, 0.8);
    } else {
      const fx = h.x + Math.sin(h.facing) * reach * 0.9, fz = h.z + Math.cos(h.facing) * reach * 0.9;
      GF.ring(fx, fz, rhythm ? 2.4 : 1.1, rhythm ? '#ffcf3d' : '#ffffff', 0.2);
      if (hk.waveEvery && h.punches % hk.waveEvery === 0) C.fire(run, { owner: 'hero', hero: h, x: h.x, z: h.z, dir: h.facing, speed: 14, dmg: S.power * 0.9, r: 0.6, pierce: true, life: 1, color: '#ff8fc7', size: 0.5, onHit: (e) => C.addStatus(run, e, 'stun', 0.3) });
    }
    if (hits && h.id === run.active) run.hitstop(h.id === 'finn' && h.combo === 3 ? 0.07 : 0.035);
  }

  C.startDash = function (run, h, dx, dz) {
    h.state = 'dash'; h.stateT = 0; h.dashDir = { x: dx, z: dz };
    h.dashCd = h.S.dashCdFinal; h.iframes = 0.28;
    h.dashDur = h.id === 'finn' ? 0.2 : 0.24; h.dashSpeed = h.id === 'finn' ? 22 : 23;
    h.facing = Math.atan2(dx, dz);
    h.dashHit = new Set();
    if (h.id === 'finn' && h.S.riposte) h.riposte = true;
    AE.sfx.play('dash');
    GF.burst(h.x, 0.3, h.z, '#ffffff', 5, 2, { dur: 0.3, flat: true });
  };

  /* Progress whatever the hero is doing (attack swing, dash, ability, super). */
  C.stepAction = function (run, h, dt) {
    if (h.state === 'attack') {
      const hitAt = h.swingTime * (h.id === 'finn' ? 0.35 : 0.45);
      if (!h.hitDone && h.stateT >= hitAt) { h.hitDone = true; meleeHit(run, h); }
      if (h.stateT >= h.swingTime) {
        h.state = 'idle'; h.comboT = 0.5;
        if (h.combo === 3) h.comboT = 0;
        if (h.queued) { h.queued = false; C.tryAttack(run, h); }
      }
    } else if (h.state === 'dash') {
      h.vx = h.dashDir.x * h.dashSpeed; h.vz = h.dashDir.z * h.dashSpeed;
      if (h.id === 'jake') for (const e of run.enemies) {
        if (e.dead || h.dashHit.has(e) || U.dist2(e.x, e.z, h.x, h.z) > (e.r + h.r + 0.4) ** 2) continue;
        h.dashHit.add(e);
        C.hitEnemy(run, e, h.S.power * 0.5, { hero: h, kb: 7, meter: 1 });
      }
      if (h.S.hooks.rainbowTrail && (h.trailT = (h.trailT || 0) - dt) <= 0) { h.trailT = 0.05; C.zone(run, { kind: 'rainbow', x: h.x, z: h.z, r: 0.9, dur: 2.5 }); }
      if (h.stateT >= h.dashDur) { h.state = 'idle'; h.vx = h.vz = 0; }
    } else if (h.state === 'ability' && h.act) {
      h.act.update(dt);
      if (h.stateT >= h.act.dur) { if (h.act.end) h.act.end(); h.state = 'idle'; h.act = null; h.liftY = 0; h.vx = h.vz = 0; }
    } else if (h.state === 'super' && run.superAct) {
      /* driven by run.superAct in abilities section */
    }
  };

  /* ---------- enemy attacks ---------- */
  C.enemyAttack = function (run, e, tgt) {
    const arch = e.def.arch;
    const hurtIn = (x, z, r, mult, extra) => {
      for (const h of heroes(run)) if (!h.ko && U.dist2(h.x, h.z, x, z) < (r + h.r) ** 2) {
        const d = C.hurtHero(run, h, e.dmg * (mult || 1), e);
        if (d > 0) { if (e.def.burn) { h.st.burn = 2; h.burnDps = e.dmg * 0.15; } if (e.def.chill) h.st.chill = 1.5; if (extra) extra(h); }
      }
    };
    if (arch === 'melee' || arch === 'lemongrab') {
      const reach = e.r + 0.9;
      const fx = e.x + Math.sin(e.facing) * reach * 0.6, fz = e.z + Math.cos(e.facing) * reach * 0.6;
      hurtIn(fx, fz, reach * 0.7, 1);
      GF.swoosh(e.x, e.z, e.facing, reach + 0.3, 1.8, '#ff6b6b');
    } else if (arch === 'tank') {
      hurtIn(e.slamAt.x, e.slamAt.z, 2.4, 1, (h) => { const dx = h.x - e.slamAt.x, dz = h.z - e.slamAt.z, d = Math.hypot(dx, dz) || 1; h.x += (dx / d) * 1.5; h.z += (dz / d) * 1.5; });
      GF.ring(e.slamAt.x, e.slamAt.z, 2.6, e.def.chill ? '#9fe3ff' : '#ff9d2e', 0.35);
      GF.burst(e.slamAt.x, 0.2, e.slamAt.z, '#d9cbb8', 10, 4, { dur: 0.5 });
      run.shake(0.25);
    } else if (arch === 'bomber') {
      hurtIn(e.x, e.z, 2.3, 1);
      GF.ring(e.x, e.z, 2.6, '#ff7a2e', 0.4, { add: true });
      GF.burst(e.x, 0.5, e.z, '#ffae00', 16, 7);
      AE.sfx.play('explode');
      run.shake(0.3);
      e.hp = 0;
      C.killEnemy(run, e, null);
    } else if (arch === 'ranged') {
      C.enemyShot(run, e, tgt, 0);
    } else if (arch === 'magicman') {
      for (const off of [-0.3, 0, 0.3]) C.enemyShot(run, e, tgt, off);
    }
  };
  C.enemyShot = function (run, e, tgt, off, o) {
    o = o || {};
    const sh = e.def.shot || { speed: 10, color: '#ff4d4d' };
    const dir = Math.atan2(tgt.x - e.x, tgt.z - e.z) + (off || 0);
    C.fire(run, { owner: 'enemy', src: e, x: e.x, z: e.z, dir, speed: o.speed || sh.speed, dmg: e.dmg * (o.mult || 1), r: 0.35, life: 2.2, color: sh.color, size: 0.3, burn: sh.burn, chill: sh.chill });
    AE.sfx.play('enemyShot');
  };
  C.lemongrabScream = function (run, e) {
    GF.ring(e.x, e.z, 5.2, '#ffd400', 0.45);
    say(run, e.x, e.z, 'UNACCEPTABLE!', 'crit');
    run.shake(0.3);
    for (const h of heroes(run)) {
      if (h.ko || U.dist2(h.x, h.z, e.x, e.z) > 25) continue;
      if (C.hurtHero(run, h, e.dmg * 1.2, e) > 0) {
        h.st.stun = 0.6;
        const dx = h.x - e.x, dz = h.z - e.z, d = Math.hypot(dx, dz) || 1;
        h.x += (dx / d) * 2.2; h.z += (dz / d) * 2.2;
      }
    }
  };
  C.blinkEnemy = function (run, e, tgt) {
    GF.burst(e.x, 1, e.z, '#43e0c5', 12, 4, { dur: 0.4 });
    const a = Math.random() * Math.PI * 2, d = R.float(5, 7);
    const p = { x: tgt.x + Math.cos(a) * d, z: tgt.z + Math.sin(a) * d };
    const car = run.train.cars[e.car];
    p.x = U.clamp(p.x, car.x0 + 1, car.x1 - 1);
    WG.resolve(run.train, p, e.r);
    e.x = p.x; e.z = p.z;
    GF.burst(e.x, 1, e.z, '#43e0c5', 12, 4, { dur: 0.4 });
    if (R.chance(0.4)) say(run, e.x, e.z, R.pick(['Ha ha!', 'Magic!', 'Now you see me!']), 'status');
  };
  C.iceKingThink = function (run, e, tgt, dt) {
    const hpF = e.hp / e.maxHp;
    const phase = hpF > 0.66 ? 1 : hpF > 0.33 ? 2 : 3;
    if (phase !== e.phase) {
      e.phase = phase;
      if (phase > 1) { run.banner(phase === 2 ? 'The Ice King is getting mad!' : 'The Ice King is FURIOUS!', 'bad'); say(run, e.x, e.z, phase === 2 ? 'GUNTER! GET THEM!' : 'Why won’t anybody LOVE ME?!', 'crit'); }
    }
    const T = e.timers;
    const dx = tgt.x - e.x, dz = tgt.z - e.z, dist = Math.hypot(dx, dz) || 1;
    e.facing = Math.atan2(dx, dz);
    const orbit = e.walkT * 0.35;
    const want = 6;
    const px = tgt.x - (dx / dist) * want + Math.cos(orbit) * 1.5, pz = tgt.z - (dz / dist) * want + Math.sin(orbit) * 1.5;
    const mdx = px - e.x, mdz = pz - e.z, md = Math.hypot(mdx, mdz) || 1;
    const sp = e.speed * (e.st.chill > 0 ? 0.6 : 1) * (phase === 3 ? 1.3 : 1);
    if (md > 0.5) { e.vx = (mdx / md) * sp; e.vz = (mdz / md) * sp; } else { e.vx = e.vz = 0; }
    T.bolt = (T.bolt || 0) + dt;
    const boltEvery = phase === 1 ? 2.4 : phase === 2 ? 2.0 : 1.5;
    if (T.bolt > boltEvery) {
      T.bolt = 0;
      const n = phase === 3 ? 7 : 5;
      for (let i = 0; i < n; i++) C.enemyShot(run, e, tgt, (i - (n - 1) / 2) * 0.16);
    }
    if (phase >= 2) {
      T.summon = (T.summon || 0) + dt;
      if (T.summon > 11 && run.enemies.filter((x) => !x.dead && !x.boss).length < 6) { T.summon = 0; for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; const p = { x: e.x + Math.cos(a) * 2.5, z: e.z + Math.sin(a) * 2.5 }; WG.resolve(run.train, p, 0.5); AE.game.actors.spawnEnemy(run, i === 0 && phase === 3 ? 'bomb_penguin' : 'penguin', p.x, p.z, { car: e.car }); } say(run, e.x, e.z, 'Wenk wenk!', 'status'); }
      T.freeze = (T.freeze || 0) + dt;
      if (T.freeze > 7) {
        T.freeze = 0;
        for (const h of heroes(run)) if (!h.ko) C.zone(run, { kind: 'freezeCircle', x: h.x + R.float(-0.6, 0.6), z: h.z + R.float(-0.6, 0.6), r: 1.8, dur: 1.2, dmg: e.dmg * 1.2 });
      }
    }
    if (phase === 3) {
      T.beam = (T.beam || 0) + dt;
      if (T.beam > 5) {
        T.beam = 0;
        for (let i = 1; i <= 7; i++) C.zone(run, { kind: 'freezeCircle', x: e.x + (dx / dist) * i * 1.4, z: e.z + (dz / dist) * i * 1.4, r: 1.0, dur: 0.9, dmg: e.dmg * 0.9, lightning: true });
      }
    }
  };

  /* ---------- projectiles ---------- */
  C.fire = function (run, o) {
    const size = o.size || 0.3;
    const mesh = new THREE.Mesh(GF.geo(o.shape === 'beam' ? 'box' : 'sphere', ...(o.shape === 'beam' ? [0.2, 0.2, 1.6] : [size, 10, 8])), GF.basic(o.color || '#ffffff', { add: o.owner === 'hero' }));
    mesh.position.set(o.x, o.y || 0.9, o.z);
    mesh.rotation.y = o.dir;
    GF.scene.add(mesh);
    run.projectiles.push(Object.assign({ vx: Math.sin(o.dir) * o.speed, vz: Math.cos(o.dir) * o.speed, hit: new Set(), mesh, life: o.life || 1.5 }, o));
  };
  C.updateProjectiles = function (run, dt) {
    const list = run.projectiles;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.x += p.vx * dt; p.z += p.vz * dt;
      p.life -= dt;
      p.mesh.position.set(p.x, p.y || 0.9, p.z);
      let dead = p.life <= 0;
      const solid = WG.solidAt(run.train, p.x, p.z);
      if (solid && !dead) {
        if (p.owner === 'hero' && solid.kind === 'breakable') run.damageBreakable(solid.ref, 1);
        if (solid.kind !== 'ice' || p.owner === 'hero') dead = true;
      }
      if (!dead && p.owner === 'hero') {
        for (const e of run.enemies) {
          if (e.dead || p.hit.has(e) || e.state === 'spawn') continue;
          if (U.dist2(p.x, p.z, e.x, e.z) < (e.r + p.r) ** 2) {
            p.hit.add(e);
            C.hitEnemy(run, e, p.dmg, { hero: p.hero, kb: p.kb || 2, from: p, meter: p.meter != null ? p.meter : 1 });
            if (p.onHit) p.onHit(e);
            if (p.chill) C.addStatus(run, e, 'chill', 2.5);
            if (!p.pierce) { dead = true; break; }
          }
        }
      } else if (!dead) {
        for (const h of heroes(run)) {
          if (h.ko || U.dist2(p.x, p.z, h.x, h.z) > (h.r + p.r) ** 2) continue;
          if (h.buffs.shield && run.S.jake.shieldReflect) { p.owner = 'hero'; p.hero = run.heroes.jake; p.vx *= -1.2; p.vz *= -1.2; p.hit = new Set(); p.dmg *= 1.5; GF.ring(p.x, p.z, 0.8, '#7fe3ff', 0.2); break; }
          const d = C.hurtHero(run, h, p.dmg, p.src);
          if (d > 0) { if (p.burn) { h.st.burn = 2; h.burnDps = p.dmg * 0.15; } if (p.chill) h.st.chill = 1.5; }
          dead = true;
          break;
        }
      }
      if (dead) { GF.scene.remove(p.mesh); GF.burst(p.x, 0.9, p.z, p.color || '#ffffff', 3, 2, { dur: 0.25, size: 0.08 }); list.splice(i, 1); }
    }
  };

  /* ---------- zones: pancakes, traps, slams, rainbow trails, freeze circles, flares ---------- */
  C.zone = function (run, z) {
    z.t = 0;
    if (z.kind === 'heal') { z.mesh = new THREE.Group(); for (let i = 0; i < 4; i++) z.mesh.add(GF.part(GF.geo('cyl', 0.42 - i * 0.02, 0.42 - i * 0.02, 0.1, 18), '#e8b25c', [0, 0.06 + i * 0.11, 0])); z.mesh.add(GF.part(GF.geo('box', 0.5, 0.05, 0.12), '#c2413a', [0, 0.5, 0.05], { ink: false })); z.mesh.add(GF.part(GF.geo('box', 0.45, 0.05, 0.12), '#c2413a', [0.05, 0.52, -0.12], { ink: false })); z.mesh.position.set(z.x, 0, z.z); GF.scene.add(z.mesh); z.ring = GF.telegraph(z.x, z.z, z.r, z.dur, '#7ed957'); }
    else if (z.kind === 'trap') { z.mesh = new THREE.Group(); z.mesh.add(GF.part(GF.geo('torus', 0.45, 0.07, 16), '#5a5f6a', [0, 0.08, 0], { rot: [Math.PI / 2, 0, 0] })); for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; z.mesh.add(GF.part(GF.geo('cone', 0.06, 0.25, 6), '#b8c2cc', [Math.cos(a) * 0.4, 0.18, Math.sin(a) * 0.4], { ink: false })); } z.mesh.position.set(z.x, 0, z.z); GF.scene.add(z.mesh); }
    else if (z.kind === 'slam') { z.tele = GF.telegraph(z.x, z.z, z.r, z.delay, '#ffcf3d'); if (!z.noFist) { z.mesh = GF.part(GF.geo('sphere', 1.1, 16, 12), '#f6b42a', [z.x, 7, z.z]); GF.scene.add(z.mesh); } }
    else if (z.kind === 'rainbow') { z.mesh = new THREE.Mesh(GF.geo('circle', z.r, 16), GF.basic(R.pick(['#ff5f6d', '#ffc93c', '#6bd66b', '#6ab7ff', '#c77dff']), { opacity: 0.55 })); z.mesh.rotation.x = -Math.PI / 2; z.mesh.position.set(z.x, 0.04, z.z); GF.scene.add(z.mesh); }
    else if (z.kind === 'freezeCircle') { z.tele = GF.telegraph(z.x, z.z, z.r, z.dur, z.lightning ? '#b8f1ff' : '#5ec8ff'); }
    else if (z.kind === 'flare') { z.mesh = GF.beam('#ff8fc7', 12); z.mesh.position.set(z.x, 6, z.z); GF.scene.add(z.mesh); z.ring = GF.telegraph(z.x, z.z, z.r, z.dur, '#ff8fc7'); }
    run.zones.push(z);
    return z;
  };
  C.updateZones = function (run, dt) {
    const list = run.zones;
    for (let i = list.length - 1; i >= 0; i--) {
      const z = list[i];
      z.t += dt;
      let done = z.t >= z.dur;
      if (z.kind === 'heal') { for (const h of heroes(run)) if (!h.ko && U.dist2(h.x, h.z, z.x, z.z) < z.r * z.r) C.healHero(run, h, h.maxHp * 0.05 * dt * (1 + run.S.team.healPower * 0.5), { quiet: true }); }
      else if (z.kind === 'trap') {
        for (const e of run.enemies) if (!e.dead && e.state !== 'spawn' && U.dist2(e.x, e.z, z.x, z.z) < (0.6 + e.r) ** 2) {
          C.hitEnemy(run, e, z.dmg, { hero: z.hero, meter: 1 }); C.addStatus(run, e, 'root', z.root); GF.ring(z.x, z.z, 1.2, '#b8c2cc', 0.25); done = true; break;
        }
      } else if (z.kind === 'slam') {
        const k = Math.min(1, z.t / z.delay);
        if (z.mesh) z.mesh.position.y = 7 * (1 - k * k) + 0.6;
        if (!z.hitDone && z.t >= z.delay) {
          z.hitDone = true;
          for (const e of run.enemies) if (!e.dead && U.dist2(e.x, e.z, z.x, z.z) < (z.r + e.r) ** 2) { C.hitEnemy(run, e, z.dmg, { hero: z.hero, kb: 6, from: z, meter: 1.5 }); if (z.stun) C.addStatus(run, e, 'stun', z.stun); }
          run.smashAt(z.x, z.z, z.r, 2);
          GF.ring(z.x, z.z, z.r + 0.4, '#ffcf3d', 0.35);
          GF.burst(z.x, 0.3, z.z, '#d9cbb8', 14, 6, { dur: 0.6 });
          AE.sfx.play('explode');
          run.shake(0.3);
          if (z.after) { const a = z.after; z.after = null; C.zone(run, a); }
        }
        if (z.hitDone && z.t >= z.delay + 0.2) done = true;
      } else if (z.kind === 'rainbow') {
        for (const h of heroes(run)) if (!h.ko && U.dist2(h.x, h.z, z.x, z.z) < z.r * z.r) C.healHero(run, h, h.maxHp * 0.1 * dt, { quiet: true });
        for (const e of run.enemies) if (!e.dead && U.dist2(e.x, e.z, z.x, z.z) < (z.r + e.r) ** 2) { e.hp -= run.S[run.active].power * 0.8 * dt; if (e.hp <= 0) C.killEnemy(run, e, null); }
      } else if (z.kind === 'freezeCircle') {
        if (done) {
          GF.ring(z.x, z.z, z.r + 0.3, '#9fe3ff', 0.35);
          GF.burst(z.x, 0.4, z.z, '#dff6ff', 8, 3, { dur: 0.4 });
          for (const h of heroes(run)) if (!h.ko && U.dist2(h.x, h.z, z.x, z.z) < (z.r + h.r) ** 2) { if (C.hurtHero(run, h, z.dmg, null) > 0) { h.st.chill = 2; if (!z.lightning) h.st.freeze = 0.8; } }
          AE.sfx.play('freeze');
        }
      } else if (z.kind === 'flare') {
        const h = run.heroes[run.active];
        const near = U.dist2(h.x, h.z, z.x, z.z) < z.r * z.r;
        if (!near) { z.t -= dt; }
        if (z.t >= z.dur) { run.extract('flare'); return; }
      }
      if (done) {
        if (z.mesh) GF.scene.remove(z.mesh);
        if (z.tele) z.tele.alive = false;
        if (z.ring) z.ring.alive = false;
        list.splice(i, 1);
      }
    }
  };

  AE.game.combat = C;
})();

/* ---------- abilities, super, switching, snacks, relic effects ---------- */
(function () {
  'use strict';
  const D = AE.data;
  const R = AE.R;
  const U = AE.U;
  const GF = AE.game.gfx;
  const WG = AE.game.world;
  const C = AE.game.combat;
  const heroes = (run) => [run.heroes.finn, run.heroes.jake];
  const other = (run, h) => (h.id === 'finn' ? run.heroes.jake : run.heroes.finn);
  const say = (run, x, z, t, c) => run.popup(x, 1.9, z, t, c);
  function clampToTrain(run, p, r) { WG.resolve(run.train, p, r || 0.5); return p; }
  function aimAt(h, aim, range) {
    const tx = aim ? aim.x : h.x + Math.sin(h.facing) * range;
    const tz = aim ? aim.z : h.z + Math.cos(h.facing) * range;
    const dx = tx - h.x, dz = tz - h.z, d = Math.hypot(dx, dz) || 1;
    const k = Math.min(1, range / d);
    return { x: h.x + dx * k, z: h.z + dz * k, dir: Math.atan2(dx, dz) };
  }
  function aoe(run, h, x, z, r, mult, o) {
    o = o || {};
    let n = 0;
    for (const e of run.enemies) if (!e.dead && e.state !== 'spawn' && U.dist2(e.x, e.z, x, z) < (r + e.r) ** 2) { C.hitEnemy(run, e, h.S.power * mult, Object.assign({ hero: h, from: { x, z }, meter: 1.2 }, o)); if (o.stun) C.addStatus(run, e, 'stun', o.stun); n++; }
    run.smashAt(x, z, r, 1);
    return n;
  }

  C.swordBeam = function (run, h, mult, dirOverride) {
    const dir = dirOverride != null ? dirOverride : h.facing;
    C.fire(run, { owner: 'hero', hero: h, x: h.x + Math.sin(dir) * 0.8, z: h.z + Math.cos(dir) * 0.8, dir, speed: 18, dmg: h.S.power * (mult || 1.4), r: 0.55, pierce: true, life: 0.8, color: '#ffe066', shape: 'beam', kb: 3 });
  };

  const AB = {
    sword_spin(run, h, ab) {
      const r = ab.radius * Math.sqrt(h.S.reachMult);
      h.state = 'ability'; h.stateT = 0;
      h.act = { dur: 0.3, update: () => { h.mesh.rotation.y += 0.9; }, end: () => {} };
      aoe(run, h, h.x, h.z, r, ab.dmg, { kb: 6 });
      GF.swoosh(h.x, h.z, h.facing, r, Math.PI * 2 - 0.01, '#ffe066');
      GF.ring(h.x, h.z, r, '#ffffff', 0.25);
    },
    heros_leap(run, h, ab, aim) {
      const t = aimAt(h, aim, ab.range);
      const land = clampToTrain(run, { x: t.x, z: t.z }, h.r);
      const sx = h.x, sz = h.z;
      h.state = 'ability'; h.stateT = 0; h.iframes = 0.5; h.facing = t.dir;
      h.act = {
        dur: 0.45,
        update: () => { const k = Math.min(1, h.stateT / 0.45); h.x = U.lerp(sx, land.x, k); h.z = U.lerp(sz, land.z, k); h.liftY = Math.sin(k * Math.PI) * 2.2; },
        end: () => { h.liftY = 0; aoe(run, h, h.x, h.z, ab.radius, ab.dmg, { kb: 7, stun: ab.stun }); GF.ring(h.x, h.z, ab.radius + 0.4, '#56c3f5', 0.35); GF.burst(h.x, 0.3, h.z, '#d9cbb8', 12, 6); run.shake(0.3); AE.sfx.play('explode'); },
      };
    },
    sword_beam(run, h, ab) { C.swordBeam(run, h, ab.dmg); },
    battle_cry(run, h, ab) {
      for (const x of heroes(run)) if (!x.ko) { x.buffs.cry = ab.dur; GF.ring(x.x, x.z, 3, '#ffcf3d', 0.4); }
      say(run, h.x, h.z, 'Hyaaah!', 'crit');
    },
    pancake_toss(run, h, ab) { C.zone(run, { kind: 'heal', x: h.x, z: h.z, r: ab.radius, dur: ab.dur }); say(run, h.x, h.z, 'Bacon pancakes!', 'heal'); },
    hero_trap(run, h, ab) {
      const traps = run.zones.filter((z) => z.kind === 'trap');
      if (traps.length >= 3) traps[0].t = traps[0].dur;
      C.zone(run, { kind: 'trap', x: h.x, z: h.z, r: 0.6, dur: 45, dmg: h.S.power * ab.dmg, root: ab.root, hero: h });
    },
    stretchy_slam(run, h, ab, aim) {
      const t = aimAt(h, aim, 9);
      const p = clampToTrain(run, { x: t.x, z: t.z }, 0.3);
      const z = { kind: 'slam', x: p.x, z: p.z, r: ab.radius, dur: 5, delay: ab.delay, dmg: h.S.power * ab.dmg, hero: h };
      if (h.S.aftershock) z.after = { kind: 'slam', x: p.x, z: p.z, r: ab.radius * 1.2, dur: 5, delay: 0.5, dmg: h.S.power * ab.dmg * 0.6, hero: h, noFist: true };
      C.zone(run, z);
      h.facing = t.dir;
    },
    stretch_grab(run, h, ab, aim) {
      const t = aimAt(h, aim, ab.range);
      const dir = t.dir;
      h.facing = dir;
      let best = null, bt = Infinity;
      for (const e of run.enemies) {
        if (e.dead || e.state === 'spawn') continue;
        const dx = e.x - h.x, dz = e.z - h.z;
        const along = dx * Math.sin(dir) + dz * Math.cos(dir);
        const across = Math.abs(dx * Math.cos(dir) - dz * Math.sin(dir));
        if (along > 0 && along < ab.range && across < e.r + 0.5 && along < bt) { bt = along; best = e; }
      }
      const arm = h.parts.armR;
      h.state = 'ability'; h.stateT = 0;
      h.act = { dur: 0.35, update: () => { const k = h.stateT / 0.35; arm.group.rotation.x = -Math.PI / 2; AE.game.models.stretchArm(arm, (best ? bt : ab.range) * (k < 0.5 ? k * 2 : (1 - k) * 2) / h.scale + 0.44); } };
      if (best) {
        const px = h.x + Math.sin(dir) * 1.6, pz = h.z + Math.cos(dir) * 1.6;
        if (!best.boss) { best.x = px; best.z = pz; WG.resolve(run.train, best, best.r); }
        C.hitEnemy(run, best, h.S.power * ab.dmg, { hero: h, meter: 1.5 });
        C.addStatus(run, best, 'stun', ab.stun);
      }
    },
    giant_jake(run, h, ab) { h.buffs.giant = ab.dur; say(run, h.x, h.z, 'Giant Jake!', 'crit'); GF.ring(h.x, h.z, 3.5, '#f6b42a', 0.4); run.shake(0.2); },
    shape_shield(run, h, ab) { const hp = run.heroes.jake.maxHp * 0.4; for (const x of heroes(run)) if (!x.ko) x.buffs.shield = { hp, t: ab.dur }; say(run, h.x, h.z, 'Shield!', 'heal'); },
    bouncy_ball(run, h, ab, aim) {
      const t = aimAt(h, aim, ab.range);
      const dx = Math.sin(t.dir), dz = Math.cos(t.dir);
      h.facing = t.dir;
      h.state = 'ability'; h.stateT = 0; h.iframes = 0.5; h.buffs.ball = 0.45;
      const hitSet = new Set();
      h.act = {
        dur: 0.45,
        update: () => {
          h.vx = dx * 20; h.vz = dz * 20;
          for (const e of run.enemies) if (!e.dead && !hitSet.has(e) && U.dist2(e.x, e.z, h.x, h.z) < (e.r + h.r + 0.5) ** 2) { hitSet.add(e); C.hitEnemy(run, e, h.S.power * ab.dmg, { hero: h, kb: 9, meter: 1.5 }); }
          run.smashAt(h.x, h.z, h.r + 0.4, 1);
        },
        end: () => { h.vx = h.vz = 0; h.buffs.ball = 0; },
      };
    },
    copter_arms(run, h, ab) { h.buffs.copter = ab.dur; h.copterTick = 0; say(run, h.x, h.z, 'Wheee!', 'status'); },
    brofist(run, h) {
      for (const x of heroes(run)) if (!x.ko) { C.healHero(run, x, x.maxHp * 0.25); x.st = {}; x.burnDps = 0; }
      const b = other(run, h);
      GF.burst((h.x + b.x) / 2, 1.2, (h.z + b.z) / 2, '#ffcf3d', 14, 5, { add: true });
      say(run, (h.x + b.x) / 2, (h.z + b.z) / 2, 'BROFIST!', 'crit');
    },
    fastball(run, h, ab, aim) {
      const b = other(run, h);
      if (b.ko) { say(run, h.x, h.z, 'Buddy is down!', 'status'); return false; }
      const t = aimAt(h, aim, ab.range);
      const land = clampToTrain(run, { x: t.x, z: t.z }, b.r);
      const sx = b.x, sz = b.z;
      b.state = 'ability'; b.stateT = 0; b.iframes = 0.6;
      b.act = {
        dur: 0.5,
        update: () => { const k = Math.min(1, b.stateT / 0.5); b.x = U.lerp(sx, land.x, k); b.z = U.lerp(sz, land.z, k); b.liftY = Math.sin(k * Math.PI) * 3; },
        end: () => { b.liftY = 0; aoe(run, b, b.x, b.z, ab.radius, ab.dmg, { kb: 8 }); GF.ring(b.x, b.z, ab.radius + 0.4, '#ff8fc7', 0.35); run.shake(0.35); AE.sfx.play('explode'); },
      };
      say(run, h.x, h.z, 'Fastball Special!', 'crit');
    },
  };

  C.castSlot = function (run, h, i, aim) {
    const id = run.G.bars[h.id][i];
    if (!id) return;
    const ab = D.ABILITIES[id];
    if ((h.cds[id] || 0) > 0) { run.hudNote(`${ab.name} recharges in ${Math.ceil(h.cds[id])}s`); return; }
    if (h.state === 'ability' || h.state === 'dash' || h.state === 'super') return;
    if (aim) AE.game.actors.faceTo(h, aim.x, aim.z);
    if (AB[id](run, h, ab, aim) === false) return;
    h.cds[id] = ab.cd * (1 - h.S.cdr);
    AE.sfx.play('ability');
  };

  /* ---------- MATHEMATICAL! ---------- */
  C.trySuper = function (run, h, aim) {
    if (run.meter < 100 || run.superAct) return;
    const b = other(run, h);
    run.meter = 0;
    run.stats.supers += 1;
    const dur = 2.4 * (run.S.team.ultraSuper ? 1.5 : 1);
    const rider = b.ko ? null : b;
    h.state = 'super'; h.stateT = 0;
    if (rider) { rider.state = 'super'; rider.stateT = 0; }
    run.banner('MATHEMATICAL!', 'super');
    AE.sfx.play('super');
    run.shake(0.4);
    let tick = 0, beam = 0;
    run.superAct = {
      t: 0, dur,
      update(dt, IN) {
        this.t += dt;
        const a = IN.aimPoint(GF.camera);
        const mv = IN.move();
        let dir = h.facing;
        if (mv.mag > 0.2) dir = Math.atan2(mv.x, mv.z); else if (a) dir = Math.atan2(a.x - h.x, a.z - h.z);
        h.facing += U.angleDiff(h.facing, dir) * Math.min(1, dt * 6);
        h.vx = Math.sin(h.facing) * 12; h.vz = Math.cos(h.facing) * 12;
        if (rider) { rider.x = h.x; rider.z = h.z; rider.liftY = h.id === 'jake' ? 1.1 : 0.9; rider.facing = h.facing; }
        if ((tick -= dt) <= 0) {
          tick = 0.15;
          for (const e of run.enemies) if (!e.dead && e.state !== 'spawn' && U.dist2(e.x, e.z, h.x, h.z) < (2.4 + e.r) ** 2) C.hitEnemy(run, e, h.S.power * 1.2, { hero: h, kb: 9, meter: 0 });
          run.smashAt(h.x, h.z, 2.4, 3);
          GF.burst(h.x, 0.4, h.z, R.pick(['#ff5f6d', '#ffc93c', '#6bd66b', '#6ab7ff', '#c77dff']), 4, 3, { dur: 0.5, add: true });
        }
        if (run.S.team.ultraSuper && (beam -= dt) <= 0) { beam = 0.4; for (let k = 0; k < 4; k++) C.swordBeam(run, run.heroes.finn, 1, h.facing + k * (Math.PI / 2)); }
        if (this.t >= this.dur) this.end();
      },
      end() {
        h.state = 'idle'; h.vx = h.vz = 0;
        if (rider) { rider.state = 'idle'; rider.liftY = 0; const p = { x: h.x - Math.sin(h.facing) * 1.4, z: h.z - Math.cos(h.facing) * 1.4 }; WG.resolve(run.train, p, rider.r); rider.x = p.x; rider.z = p.z; }
        for (const e of run.enemies) if (!e.dead && U.dist2(e.x, e.z, h.x, h.z) < (4 + e.r) ** 2) C.hitEnemy(run, e, h.S.power * 2, { hero: h, kb: 10, meter: 0 });
        GF.ring(h.x, h.z, 4.5, '#ffffff', 0.5);
        run.shake(0.4);
        run.superAct = null;
      },
    };
  };

  /* ---------- tag switching ---------- */
  C.switchHero = function (run, forced) {
    const cur = run.heroes[run.active];
    const next = other(run, cur);
    if (next.ko || run.superAct) return false;
    if (!forced && run.switchCd > 0) return false;
    if (cur.state === 'ability' || next.state === 'ability') return false;
    run.setActive(next.id, false);
    run.switchCd = Math.max(0.4, 2 - run.S.team.switchCd);
    const T = run.S.team;
    if (T.tagStrike) {
      for (const e of run.enemies) if (!e.dead && U.dist2(e.x, e.z, next.x, next.z) < 9) C.hitEnemy(run, e, next.S.power * T.tagStrike, { hero: next, kb: 6, meter: 1 });
      GF.ring(next.x, next.z, 3, next.id === 'finn' ? '#56c3f5' : '#f6b42a', 0.3);
    }
    AE.sfx.play('switch');
    return true;
  };

  /* ---------- snacks & supplies ---------- */
  C.useBelt = function (run, i) {
    const G = run.G;
    const st = G.belt[i];
    if (!st) return;
    const h = run.heroes[run.active];
    const heal = 1 + run.S.team.healPower;
    let used = true;
    switch (st.base) {
      case 'bacon_pancakes': C.healHero(run, h, h.maxHp * 0.35 * heal); say(run, h.x, h.z, 'Makin’ bacon pancakes!', 'heal'); break;
      case 'burrito': for (const x of heroes(run)) { if (x.ko) C.revive(run, x, 0.5); else C.healHero(run, x, x.maxHp * 0.5 * heal); } break;
      case 'candy': for (const x of heroes(run)) x.buffs.candy = 8; say(run, h.x, h.z, 'Sugar rush!', 'status'); break;
      case 'ice_cream': for (const e of run.enemies) if (!e.dead && U.dist2(e.x, e.z, h.x, h.z) < 36) C.addStatus(run, e, 'freeze', 2.5); GF.ring(h.x, h.z, 6, '#9fe3ff', 0.4); AE.sfx.play('freeze'); break;
      case 'science_potion': for (const x of heroes(run)) x.buffs.potion = 10; say(run, h.x, h.z, 'SCIENCE!', 'crit'); break;
      case 'gunter_bomb': { const t = aimAt(h, h.aim, 8); C.zone(run, { kind: 'slam', x: t.x, z: t.z, r: 3, dur: 5, delay: 0.7, dmg: h.S.power * 3, hero: h, noFist: true }); say(run, h.x, h.z, 'Wenk!', 'status'); break; }
      case 'hot_cocoa': run.blizzardT = Math.max(0, run.blizzardT - run.blizzardMax * 0.15); if (run.whiteout != null) { run.whiteout = null; } say(run, h.x, h.z, 'Toasty!', 'heal'); break;
      case 'rainbow_flare': if (run.zones.some((z) => z.kind === 'flare')) { used = false; break; } C.zone(run, { kind: 'flare', x: h.x, z: h.z, r: 2.5, dur: 6 }); run.banner('Lady Rainicorn is coming! Stay close to the flare.', 'good'); break;
      case 'skeleton_key': run.hudNote('Keys are used automatically on locks and chests.'); used = false; break;
      default: used = false;
    }
    if (used) { st.qty -= 1; if (st.qty <= 0) G.belt[i] = null; AE.sfx.play('pickup'); }
  };

  /* ---------- always-on relic effects ---------- */
  C.periodic = function (run, dt) {
    const T = run.S.team, hk = T.hooks;
    const act = run.heroes[run.active];
    const P = run.timers;
    const nearest = (x, z, max) => { let b = null, bd = max * max; for (const e of run.enemies) { if (e.dead || e.state === 'spawn') continue; const d2 = U.dist2(x, z, e.x, e.z); if (d2 < bd) { bd = d2; b = e; } } return b; };
    if (hk.pieHeal && (P.pie = (P.pie || 0) + dt) >= 25) { P.pie = 0; for (const x of heroes(run)) C.healHero(run, x, x.maxHp * 0.15); say(run, act.x, act.z, 'Pie time!', 'heal'); }
    if (hk.bmoDrone) {
      if (!run.bmo) { run.bmo = AE.game.models.prop('crate', { size: 0.35 }); run.bmo.children.forEach((c) => { if (c.material && !c.userData.outline) c.material = GF.mat('#5ec7b5'); }); GF.scene.add(run.bmo); }
      const t = run.time;
      run.bmo.position.set(act.x + Math.cos(t * 1.5) * 1.3, 1.8 + Math.sin(t * 3) * 0.15, act.z + Math.sin(t * 1.5) * 1.3);
      if ((P.bmo = (P.bmo || 0) + dt) >= 1) { const e = nearest(run.bmo.position.x, run.bmo.position.z, 10); if (e) { P.bmo = 0; C.fire(run, { owner: 'hero', hero: act, x: run.bmo.position.x, z: run.bmo.position.z, y: 1.8, dir: Math.atan2(e.x - run.bmo.position.x, e.z - run.bmo.position.z), speed: 16, dmg: act.S.power * 0.6, r: 0.4, life: 1, color: '#7cffb2', size: 0.18, meter: 0.5 }); } }
    }
    if (hk.iceBolts && (P.ice = (P.ice || 0) + dt) >= hk.iceBolts) { const e = nearest(act.x, act.z, 11); if (e) { P.ice = 0; C.fire(run, { owner: 'hero', hero: act, x: act.x, z: act.z, dir: Math.atan2(e.x - act.x, e.z - act.z), speed: 15, dmg: act.S.power * 0.8, r: 0.45, life: 1, color: '#9fe3ff', size: 0.28, chill: true, meter: 0.5 }); } }
    if (hk.burnAura && (P.aura = (P.aura || 0) + dt) >= 1) {
      P.aura = 0;
      for (const x of heroes(run)) if (!x.ko) for (const e of run.enemies) if (!e.dead && U.dist2(x.x, x.z, e.x, e.z) < 6.25) { C.hitEnemy(run, e, x.S.power * 0.25, { hero: x, noCrit: true, noProc: true, meter: 0.2 }); C.addStatus(run, e, 'burn', 2, { dps: x.S.power * 0.2 }); }
    }
    if (hk.lichDrain && run.inCombat) for (const x of heroes(run)) if (!x.ko && x.hp > 1) x.hp = Math.max(1, x.hp - x.maxHp * hk.lichDrain * dt);
    const jake = run.heroes.jake;
    if (jake.buffs.copter > 0 && !jake.ko && (jake.copterTick = (jake.copterTick || 0) - dt) <= 0) {
      jake.copterTick = 0.25;
      const ab = D.ABILITIES.copter_arms;
      for (const e of run.enemies) if (!e.dead && e.state !== 'spawn' && U.dist2(e.x, e.z, jake.x, jake.z) < (ab.radius + e.r) ** 2) C.hitEnemy(run, e, jake.S.power * ab.dmg, { hero: jake, kb: 3, noCrit: false, meter: 0.4 });
      run.smashAt(jake.x, jake.z, ab.radius, 1);
    }
  };
})();
