/* Real-time combat: the damage pipeline, status effects, Finn's sword combos, Jake's stretchy punches,
   dodges, enemy and boss attacks, projectiles and floor zones. Abilities, supers and snacks live in
   abilities.js. Everything reads the hero's stats `S` and behaviour switches `S.mods`. */
(function () {
  'use strict';
  const D = DT.data;
  const R = DT.R;
  const U = DT.U;
  const GF = DT.game.gfx;
  const WG = DT.game.world;
  const C = {};
  const say = (run, x, z, text, cls, y) => run.popup(x, y || 1.9, z, text, cls);
  const alive = (e) => e && !e.dead && e.state !== 'spawn';
  C.say = say;
  C.enemiesNear = (run, x, z, r) => run.enemies.filter((e) => alive(e) && U.dist2(e.x, e.z, x, z) < (r + e.r) * (r + e.r));
  C.nearestEnemy = function (run, x, z, max, not) {
    let best = null, bd = max * max;
    for (const e of run.enemies) { if (!alive(e) || e === not) continue; const d2 = U.dist2(x, z, e.x, e.z); if (d2 < bd) { bd = d2; best = e; } }
    return best;
  };
  const popY = (e) => (e.boss ? 3.4 : e.def.flying ? 2.2 : 1.9) * Math.min(1.4, e.scale || 1);

  /* ---------- healing and knockouts ---------- */
  C.healHero = function (run, h, amt, o) {
    o = o || {};
    if (h.ko || !(amt > 0)) return 0;
    const before = h.hp;
    h.hp = Math.min(h.maxHp, h.hp + amt);
    const got = h.hp - before;
    if (got >= 1 && !o.quiet) say(run, h.x, h.z, '+' + Math.round(got), 'heal');
    return got;
  };
  C.shieldEnd = function (run, h) {
    const sh = h.buffs.shield;
    h.buffs.shield = null;
    if (sh && sh.healEnd && sh.hp > 0) C.healHero(run, h, sh.hp);
  };
  function knockOut(run, h) {
    const M = h.S.mods;
    if (M.secondWind && !h.secondWind) {
      h.secondWind = true;
      h.hp = h.maxHp * M.secondWind; h.iframes = 2;
      run.banner('SECOND WIND!', 'good');
      GF.ring(h.x, h.z, 3, '#9be15d', 0.5);
      return;
    }
    const belt = run.G.chars[h.id].belt;
    const bi = belt.findIndex((b) => b && b.base === 'burrito');
    if (bi >= 0) {
      belt[bi].qty -= 1; if (belt[bi].qty <= 0) belt[bi] = null;
      h.hp = h.maxHp * 0.5; h.iframes = 2;
      run.banner('Everything Burrito! Back up!', 'good');
      return;
    }
    h.ko = true; h.hp = 0; h.state = 'idle'; h.vx = h.vz = 0;
    for (const f of h.fists) C.removeFist(f);
    h.fists = [];
    DT.sfx.play('ko');
    run.onHeroDown(h);
  }
  C.hurtHero = function (run, h, dmg, src, o) {
    o = o || {};
    if (h.ko || run.over || !(dmg > 0)) return 0;
    const S = h.S, M = S.mods;
    if (!o.dot) {
      if (h.iframes > 0 || h.buffs.invuln > 0 || h.state === 'super') return 0;
      if (h.buffs.parry > 0) { DT.game.abilities.parryCounter(run, h); return 0; }
      if (Math.random() < S.dodge) { say(run, h.x, h.z, 'Dodged!', 'good'); return 0; }
      if (M.blinkChance && Math.random() < M.blinkChance) {
        const a = Math.random() * Math.PI * 2;
        GF.burst(h.x, 0.8, h.z, '#b061ff', 10, 4, { dur: 0.4 });
        const to = WG.clampPath(run.train, h, { x: h.x + Math.cos(a) * 2.5, z: h.z + Math.sin(a) * 2.5 }, h.r);
        h.x = to.x; h.z = to.z;
        WG.resolve(run.train, h, h.r);
        say(run, h.x, h.z, 'Poof!', 'good');
        return 0;
      }
      if (M.blockEvery && h.blockT <= 0) { h.blockT = M.blockEvery; say(run, h.x, h.z, 'Blocked!', 'good'); GF.ring(h.x, h.z, 1.2, '#ffcf3d', 0.25); return 0; }
    }
    const giant = h.buffs.giant > 0;
    let d = dmg * (1 - DT.meta.stats.armorReduction(S.armor * (giant ? 1.3 : 1) + (giant ? 10 : 0)));
    if (h.buffs.mega > 0) d *= 0.5;
    if (h.buffs.shield) {
      const ab = Math.min(h.buffs.shield.hp, d);
      h.buffs.shield.hp -= ab; d -= ab;
      if (h.buffs.shield.hp <= 0) h.buffs.shield = null;
    }
    if (d <= 0) return 0;
    h.hp -= d;
    h.lastHurt = run.time;
    if (!o.dot) {
      DT.game.actors.flash(h);
      h.sqV = (h.sqV || 0) - 3.5; h.hurtT = 0.22;
      say(run, h.x, h.z, '-' + Math.round(d), 'hurt');
      DT.sfx.play('hurt');
      if (h === run.local) { run.shake(0.18); run.hurtFlash(); }
      if (src && src.kind === 'enemy' && !src.dead) {
        if (S.thorns) C.damage(run, src, dmg * S.thorns, { hero: h, src: 'proc', noCrit: true, noProc: true, meter: 0 });
        if (M.hurtChill) C.addStatus(run, src, 'chill', 2.5, { hero: h });
        /* vampires drink: they heal for part of the damage they deal */
        if (src.def.drain && !src.dead) { src.hp = Math.min(src.maxHp, src.hp + d * src.def.drain); if (Math.random() < 0.35) say(run, src.x, src.z, 'Slurp!', 'status', popY(src)); }
      }
    }
    if (h.hp <= 0) knockOut(run, h);
    return d;
  };

  /* ---------- status effects on enemies ---------- */
  C.addStatus = function (run, e, id, dur, o) {
    o = o || {};
    if (!e || e.dead) return;
    const cc = id === 'stun' || id === 'freeze' || id === 'root' || id === 'fear';
    if (cc) dur *= e.boss ? 0.35 : e.elite ? 0.6 : 1;
    if (id === 'chill' && e.st.chill > 0 && !e.boss) {
      const M = o.hero ? o.hero.S.mods : {};
      id = 'freeze'; dur = (1.2 + (M.freezeDur || 0)) * (e.elite ? 0.6 : 1);
    }
    if (id === 'freeze') {
      if (e.freezeImmune > 0) { e.st.chill = Math.max(e.st.chill || 0, 2); return; }
      if (!(e.st.freeze > 0)) { DT.sfx.play('freeze'); say(run, e.x, e.z, 'Frozen!', 'ice', popY(e)); }
    }
    e.st[id] = Math.max(e.st[id] || 0, dur);
    if (id === 'burn') e.dots.burn = { dps: Math.max(e.dots.burn ? e.dots.burn.dps : 0, o.dps || 3), t: dur, hero: o.hero };
    if (id === 'bleed') { const cur = e.dots.bleed; const stacks = Math.min(3, (cur ? cur.stacks : 0) + 1); e.dots.bleed = { dps: (o.dps || 3) * stacks, stacks, t: dur, hero: o.hero }; }
    if (id === 'stun' && !o.quiet) say(run, e.x, e.z, 'Stunned!', 'status', popY(e));
    if (id === 'root' && !o.quiet) say(run, e.x, e.z, 'Rooted!', 'status', popY(e));
    if (id === 'fear') say(run, e.x, e.z, 'Eek!', 'status', popY(e));
  };
  C.tickDots = function (run, e, dt) {
    for (const k in e.dots) {
      const d = e.dots[k];
      d.t -= dt;
      if (d.t <= 0) { delete e.dots[k]; continue; }
      e.hp -= d.dps * dt;
      e.dotAcc = (e.dotAcc || 0) + d.dps * dt;
      if (e.dotAcc >= 6) { if (DT.settings.numbers !== false) say(run, e.x, e.z, '-' + Math.round(e.dotAcc), k === 'burn' ? 'burn' : 'bleed', popY(e)); e.dotAcc = 0; }
      if (e.hp <= 0 && !e.dead) { C.killEnemy(run, e, d.hero || run.local, { src: 'dot' }); return; }
    }
  };
  /* Lightning that jumps from one enemy to others. */
  C.shock = function (run, h, from, dmg, n) {
    let cur = from;
    const hit = new Set([from]);
    from.st.shock = 2;
    for (let i = 0; i < n; i++) {
      let best = null, bd = 36;
      for (const e of run.enemies) { if (!alive(e) || hit.has(e)) continue; const d2 = U.dist2(cur.x, cur.z, e.x, e.z); if (d2 < bd) { bd = d2; best = e; } }
      if (!best) break;
      GF.line({ x: cur.x, y: 1, z: cur.z }, { x: best.x, y: 1, z: best.z }, '#8fe8ff', 0.18, 0.1);
      hit.add(best);
      best.st.shock = 2;
      C.damage(run, best, dmg, { hero: h, src: 'proc', noCrit: true, noProc: true, meter: 0.3 });
      cur = best;
    }
    DT.sfx.play('zap');
  };

  /* ---------- the damage pipeline ---------- */
  C.damage = function (run, e, base, o) {
    o = o || {};
    if (!alive(e)) return 0;
    const h = o.hero || run.local;
    const S = h.S, M = S.mods;
    let dmg = base;
    if (h.buffs.cry > 0) dmg *= 1.35;
    if (h.buffs.potion > 0) dmg *= 1.4;
    if (h.buffs.sandwich > 0) dmg *= 1.25;
    if (h.buffs.snack > 0) dmg *= 1.3;
    if (h.buffs.giant > 0) dmg *= 1.6;
    if (h.buffs.pancake > 0) dmg *= 1 + h.buffs.pancakeBuff;
    if (o.src === 'primary') dmg *= Math.max(0.1, 1 + S.primaryDmg);
    if (o.src === 'ability' || o.src === 'super') dmg *= 1 + S.abilityPower;
    const frozen = e.st.freeze > 0, cold = frozen || e.st.chill > 0;
    if (cold && M.vsCold) dmg *= 1 + M.vsCold;
    if (e.dots.burn && M.vsBurning) dmg *= 1 + M.vsBurning;
    if ((frozen || e.st.stun > 0 || e.st.root > 0) && M.vsDisabled) dmg *= 1 + M.vsDisabled;
    if ((e.boss || e.elite) && M.vsBig) dmg *= 1 + M.vsBig;
    const low = h.hp / h.maxHp < 0.35;
    if (low && M.lowHpDmg) dmg *= 1 + M.lowHpDmg;
    if (M.loopDmg) dmg *= 1 + M.loopDmg * (run.tunnel != null ? 1 : run.loop);
    if (e.st.shock > 0) dmg *= 1.15;
    if (e.st.fear > 0) dmg *= 1 + (e.fearAmp || 0.25);
    let crit = false;
    if (!o.noCrit && Math.random() < S.crit) { crit = true; dmg *= S.critDmg; }
    dmg = Math.max(1, Math.round(dmg * R.float(0.93, 1.07)));
    e.hp -= dmg;
    e.hitT = run.time;
    run.stats.dmg += dmg;
    run.addMeter(h, o.meter != null ? o.meter : o.src === 'primary' ? 2 : 1);
    if (DT.settings.numbers !== false || crit) say(run, e.x, e.z, String(dmg), crit ? 'crit' : o.src === 'primary' ? 'hit' : 'hit2', popY(e));
    DT.game.actors.flash(e);
    if (o.src !== 'dot') { e.sqV = Math.max(-9, (e.sqV || 0) - (e.boss ? 2.2 : crit ? 7 : 4.5)); e.hurtT = e.boss ? 0.08 : 0.14; }
    if (o.kb && !e.boss) {
      const fx = o.from ? o.from.x : h.x, fz = o.from ? o.from.z : h.z;
      const dx = e.x - fx, dz = e.z - fz, d = Math.hypot(dx, dz) || 1;
      const kb = o.kb * (1 + S.knockback) / (e.elite ? 3 : 1);
      e.kbx = (dx / d) * kb; e.kbz = (dz / d) * kb;
    }
    if (o.src === 'primary') {
      const ls = S.lifesteal + (low && M.lowHpLifesteal ? M.lowHpLifesteal : 0);
      if (ls) C.healHero(run, h, dmg * ls, { quiet: true });
    }
    if (!o.noProc && (o.src === 'primary' || o.src === 'ability')) procs(run, h, e, dmg, crit, o);
    if (frozen && M.shatter && !o.noProc && o.src !== 'dot') shatter(run, h, e, dmg);
    if (crit) DT.sfx.play('crit');
    else DT.sfx.play(o.src === 'primary' && h.id === 'jake' ? 'punch' : 'hit');
    if (o.src === 'primary' && M.executeBelow && !e.boss && !e.elite && e.hp > 0 && e.hp / e.maxHp < M.executeBelow) { e.hp = 0; say(run, e.x, e.z, 'Mercy!', 'status', popY(e) + 0.5); }
    if (e.hp <= 0) C.killEnemy(run, e, h, o);
    else if (e.def.arch === 'lemongrab' && e.hp < e.maxHp / 2 && !e.timers.summoned) { e.timers.summoned = true; C.summon(run, e, ['zombie', 'bean'], 2); say(run, e.x, e.z, 'UNACCEPTABLE!!!', 'crit', popY(e)); }
    return dmg;
  };
  function procs(run, h, e, dealt, crit, o) {
    const S = h.S, M = S.mods;
    const p = h.S.power;
    if ((S.burnChance && Math.random() < S.burnChance) || h.buffs.hotsauce > 0) C.addStatus(run, e, 'burn', 3, { hero: h, dps: p * 0.35 });
    if (S.chillChance && Math.random() < S.chillChance) C.addStatus(run, e, 'chill', 2.5, { hero: h });
    if (S.bleedChance && Math.random() < S.bleedChance) C.addStatus(run, e, 'bleed', 4, { hero: h, dps: p * 0.25 });
    if (S.stunChance && Math.random() < S.stunChance) C.addStatus(run, e, 'stun', 1, { hero: h });
    if (S.rootChance && Math.random() < S.rootChance) C.addStatus(run, e, 'root', 1.8, { hero: h });
    if (S.freezeChance && Math.random() < S.freezeChance) C.addStatus(run, e, 'freeze', 1.2 + (M.freezeDur || 0), { hero: h });
    if (o.src === 'primary' && M.primaryFreeze && Math.random() < M.primaryFreeze) C.addStatus(run, e, 'freeze', 1.2 + (M.freezeDur || 0), { hero: h });
    if (S.shockChance && Math.random() < S.shockChance) C.shock(run, h, e, dealt * 0.5 * (1 + (M.shockDmg || 0)), 2);
    if (o.src === 'primary' && M.igniteEvery) { h.ignite = (h.ignite || 0) + 1; if (h.ignite % M.igniteEvery === 0) C.addStatus(run, e, 'burn', 3, { hero: h, dps: p * 0.5 }); }
    if (M.gunterBottle && Math.random() < M.gunterBottle) run.later(0.25, () => { if (e.dead) return; GF.ring(e.x, e.z, 2.2, '#bfeeff', 0.35); GF.burst(e.x, 0.8, e.z, '#e8fbff', 10, 4); for (const n of C.enemiesNear(run, e.x, e.z, 2.2)) { C.damage(run, n, p * 0.6, { hero: h, src: 'proc', noCrit: true, noProc: true, meter: 0 }); C.addStatus(run, n, 'chill', 2.5, { hero: h }); } DT.sfx.play('shatter'); });
    if (crit) {
      if (M.critHeal) C.healHero(run, h, h.maxHp * M.critHeal, { quiet: true });
      if (M.critChain) C.shock(run, h, e, dealt * 0.6, M.critChain);
      if (M.critFreeze && Math.random() < M.critFreeze) C.addStatus(run, e, 'freeze', 1.2 + (M.freezeDur || 0), { hero: h });
    }
    if (o.src === 'primary' && M.echoChance && Math.random() < M.echoChance && !o.echo) run.later(0.12, () => { if (!e.dead) C.damage(run, e, dealt * 0.5, { hero: h, src: 'primary', noProc: true, echo: true, meter: 0.5 }); });
  }
  function shatter(run, h, e, dealt) {
    e.st.freeze = 0;
    GF.burst(e.x, 1, e.z, '#dff6ff', 14, 6, { size: 0.16 });
    GF.ring(e.x, e.z, 2.4, '#9fe3ff', 0.3);
    DT.sfx.play('shatter');
    say(run, e.x, e.z, 'SHATTER!', 'ice', popY(e) + 0.4);
    for (const n of C.enemiesNear(run, e.x, e.z, 2.4)) if (n !== e) C.damage(run, n, dealt * h.S.mods.shatter, { hero: h, src: 'proc', noCrit: true, noProc: true, meter: 0.3 });
  }

  C.killEnemy = function (run, e, h, o) {
    if (e.dead) return;
    e.dead = true;
    e.hp = 0;
    h = h || run.local;
    if (e.tele) { e.tele.alive = false; e.tele = null; }
    const col = e.def.tint || e.def.color || (e.def.model === 'penguin' ? '#26283a' : '#ffffff');
    const size = Math.max(0.7, e.r * (e.boss ? 1.6 : 1.5));
    GF.burst(e.x, 0.7, e.z, col, e.boss ? 16 : 7, 5);
    GF.poof(e.x, 0.45 + size * 0.35, e.z, size, e.def.fam === 'lich' || e.def.model === 'lich' ? '#c8ffb8' : null);
    GF.pop(e.mesh, e.boss ? 0.3 : 0.16);
    const t = run.train.tier;
    run.xp += e.def.xp * (1 + 0.35 * (t - 1)) * (e.elite && !e.def.elite ? 5 : 1);
    run.stats.kills += 1;
    run.G.codex.enemies[e.id] = (run.G.codex.enemies[e.id] || 0) + 1;
    if (e.elite) run.stats.elites += 1;
    run.addMeter(h, 3);
    const src = e.boss ? 'boss' : e.elite ? 'elite' : 'enemy';
    run.spawnLoot(e.x, e.z, DT.meta.loot.drops(src, t, h.S, { luckBonus: run.luckBonus }), h);
    const S = h.S, M = S.mods;
    if (!h.ko) {
      if (S.killHeal) C.healHero(run, h, h.maxHp * S.killHeal, { quiet: true });
      if (M.cdOnKill) for (const k in h.cds) h.cds[k] = Math.max(0, h.cds[k] - M.cdOnKill);
      if (M.frenzy) { h.frenzy = Math.min(3, h.frenzy + 1); h.frenzyT = 4; }
    }
    const nearby = () => C.enemiesNear(run, e.x, e.z, 3).filter((n) => n !== e);
    if (M.frostBurst && (e.st.chill > 0 || e.st.freeze > 0)) { GF.ring(e.x, e.z, 3, '#9fe3ff', 0.35); for (const n of nearby()) C.addStatus(run, n, 'chill', 2.5, { hero: h }); }
    if (M.burnSpread && e.dots.burn) { GF.ring(e.x, e.z, 3, '#ff7a2e', 0.35); for (const n of nearby()) C.addStatus(run, n, 'burn', 3, { hero: h, dps: e.dots.burn.dps }); }
    if (M.killBurst) {
      GF.ring(e.x, e.z, 2.6, '#ff5a1f', 0.4, { add: true });
      run.later(0.05, () => { for (const n of C.enemiesNear(run, e.x, e.z, 2.6)) if (n !== e) { C.damage(run, n, S.power * M.killBurst, { hero: h, src: 'proc', noProc: true, noCrit: true, meter: 0 }); C.addStatus(run, n, 'burn', 3, { hero: h, dps: S.power * 0.3 }); } });
    }
    if (e.boss) run.onBossDown(e);
    run.checkCarClear(e.car);
  };

  C.summon = function (run, e, ids, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const p = { x: e.x + Math.cos(a) * 2.4, z: e.z + Math.sin(a) * 2.4 };
      WG.resolve(run.train, p, 0.5);
      DT.game.actors.spawnEnemy(run, R.pick(ids), p.x, p.z, { car: e.car });
    }
  };

  /* ---------- the primary attack ---------- */
  C.tryAttack = function (run, h, cmd) {
    if (h.id === 'finn') finnSwing(run, h);
    else jakePunch(run, h, cmd);
  };
  const atkRate = (h) => h.S.attackRate * (1 + h.frenzy * (h.S.mods.frenzy || 0));

  /* Finn: the sword type decides the combo. */
  function finnSwing(run, h) {
    if (h.state === 'attack') { if (h.stateT > h.swingTime * 0.5) h.queued = true; return; }
    if (h.state !== 'idle') return;
    const type = h.S.swordType;
    const step = h.comboT > 0 ? (h.combo % type.combo.length) + 1 : 1;
    const c = type.combo[step - 1];
    h.combo = step;
    h.swingTime = c.t / atkRate(h);
    h.state = 'attack'; h.stateT = 0; h.hitDone = false; h.queued = false;
    DT.sfx.play(c.slam || step === type.combo.length ? 'heavy' : 'swing');
  }
  function finnHit(run, h) {
    const S = h.S, M = S.mods, type = S.swordType;
    const c = type.combo[h.combo - 1];
    const last = h.combo === type.combo.length;
    const giant = h.buffs.giant > 0 ? 1.4 : 1;
    const reach = type.reach * S.reachMult * giant;
    const arc = (c.arc * Math.PI) / 180;
    const mult = c.mult * (last ? 1 + S.finisherDmg : 1);
    if (c.lunge) { const to = WG.clampPath(run.train, h, { x: h.x + Math.sin(h.facing) * c.lunge, z: h.z + Math.cos(h.facing) * c.lunge }, h.r); h.x = to.x; h.z = to.z; WG.resolve(run.train, h, h.r); }
    let hits = 0;
    for (const e of run.enemies) {
      if (!alive(e)) continue;
      const dx = e.x - h.x, dz = e.z - h.z, d = Math.hypot(dx, dz);
      if (d > reach + e.r) continue;
      if (c.arc < 360 && Math.abs(U.angleDiff(h.facing, Math.atan2(dx, dz))) > arc / 2 && d > e.r + h.r + 0.3) continue;
      C.damage(run, e, S.power * mult, { hero: h, src: 'primary', kb: c.kb || 3.5 });
      hits++;
    }
    run.smashNear(h, reach, Math.min(arc, Math.PI * 2), last ? 2 : 1);
    GF.swoosh(h.x, h.z, h.facing, reach, Math.min(arc, Math.PI * 2 - 0.01), last ? '#ffd84a' : '#ffffff', 0.9);
    if (c.slam) { GF.ring(h.x, h.z, c.slam, '#ffcf3d', 0.35); GF.burst(h.x, 0.3, h.z, '#d9cbb8', 12, 5, { dur: 0.5 }); run.shake(0.2); }
    if (c.wave) C.fire(run, { owner: 'hero', hero: h, x: h.x, z: h.z, dir: h.facing, speed: 16, dmg: S.power * c.wave, r: 0.6, pierce: true, life: 0.7, color: '#b69cff', shape: 'beam', src: 'primary' });
    if (last && M.finisherQuake) { run.later(0.08, () => { GF.ring(h.x, h.z, 3.2, '#ffcf3d', 0.4); run.shake(0.2); for (const e of C.enemiesNear(run, h.x, h.z, 3.2)) C.damage(run, e, S.power * M.finisherQuake, { hero: h, src: 'proc', kb: 6, noProc: true, meter: 0.5 }); run.smashAt(h.x, h.z, 3.2, 1); }); }
    h.swings += 1;
    if (M.beamEvery && h.swings % M.beamEvery === 0) C.swordBeam(run, h, M.beamDmg || 0.7, null, 'primary');
    if (hits && h === run.local) run.hitstop(last ? 0.07 : 0.035);
  }
  C.swordBeam = function (run, h, mult, dir, src) {
    const d = dir != null ? dir : h.facing;
    C.fire(run, { owner: 'hero', hero: h, x: h.x + Math.sin(d) * 0.8, z: h.z + Math.cos(d) * 0.8, dir: d, speed: 19, dmg: h.S.power * mult, r: 0.6, pierce: true, life: 0.8, color: '#ffe066', shape: 'beam', kb: 3, src: src || 'ability' });
  };

  /* Jake: the instrument decides how the punch behaves. */
  const boost = (h) => 1 + (h.S.mods.formBoost || 0);
  function jakePunch(run, h, cmd) {
    if (h.fists.some((f) => f.main)) return;
    if ((h.punchCd || 0) > 0 || h.state !== 'idle') return;
    const S = h.S, M = S.mods, form = S.form, b = boost(h);
    const t = 0.42 / (atkRate(h) * form.spd);
    h.punchCd = t;
    h.punches += 1;
    h.punchT = 0.25;
    const dir = h.aimDir;
    h.facing = dir;
    const size = (h.buffs.giant > 0 ? 1.4 : 1) * (h.buffs.mega > 0 ? 1.6 : 1) * S.scale;
    const reach = form.reach * S.reachMult * size;
    const sfx = { viola: 'note', guitar: 'strum', drums: 'drum', keytar: 'zap', trumpet: 'heavy', bass: 'heavy', harmonica: 'note', tuba: 'heavy', theremin: 'zap' }[S.weapon.form] || 'punch';
    DT.sfx.play(sfx);
    const rhythmEvery = M.rhythmEvery || form.rhythm;
    if (rhythmEvery && h.punches % rhythmEvery === 0) cone(run, h, dir, reach, 110, form.mult * (1 + 0.6 * (form.rhythm ? b : 1) + (M.rhythmMult || 0)), '#ff8fc7', 5);
    if (M.beamEvery && h.punches % M.beamEvery === 0) C.fire(run, { owner: 'hero', hero: h, x: h.x, z: h.z, dir, speed: 16, dmg: S.power * (M.beamDmg || 0.7), r: 0.7, pierce: true, life: 0.9, color: '#ff8fc7', size: 0.5, src: 'primary' });
    if (form.cone) {
      /* trumpet: a blast in a cone, no fist to throw */
      cone(run, h, dir, reach, form.cone * Math.min(2, b), form.mult, '#ffe066', form.kb);
      h.fists.push(newFist(h, dir, reach * 0.35, { main: true, side: h.punches % 2, noHit: true, linger: 0 }));
      return;
    }
    if (form.sweep) {
      /* bass: a heavy swinging haymaker across a wide arc */
      const arcDeg = (M.wideArc ? 200 : form.sweep) * Math.min(1.5, 0.85 + 0.15 * b);
      let hits = 0;
      for (const e of run.enemies) {
        if (!alive(e)) continue;
        const dx = e.x - h.x, dz = e.z - h.z, d = Math.hypot(dx, dz);
        if (d > reach + e.r || Math.abs(U.angleDiff(dir, Math.atan2(dx, dz))) > (arcDeg * Math.PI) / 360) continue;
        C.damage(run, e, S.power * form.mult, { hero: h, src: 'primary', kb: form.kb });
        if (Math.random() < form.stunChance) C.addStatus(run, e, 'stun', 0.8, { hero: h });
        hits++;
      }
      GF.swoosh(h.x, h.z, dir, reach, (arcDeg * Math.PI) / 180, '#f6b42a', 1.0);
      run.smashNear(h, reach, (arcDeg * Math.PI) / 180, 2);
      h.fists.push(newFist(h, dir, reach, { main: true, side: h.punches % 2, noHit: true, linger: 0 }));
      if (hits && h === run.local) run.hitstop(0.06);
      return;
    }
    const linger = (form.linger || 0) * b + (M.linger || 0);
    const pierce = Math.round((form.pierce || 0) + (M.pierce || 0));
    const main = newFist(h, dir, reach, { main: true, side: h.punches % 2, linger, pierce, mult: form.mult });
    h.fists.push(main);
    const extra = (form.split ? Math.round((form.split - 1) * b) : 0) + (M.split || 0);
    const spread = form.spread || 0.3;
    for (let i = 0; i < extra; i++) {
      const k = Math.ceil((i + 1) / 2) * (i % 2 ? -1 : 1);
      h.fists.push(newFist(h, dir + k * spread, reach * 0.95, { linger: linger * 0.5, pierce, mult: form.split ? form.mult : form.mult * 0.5, mesh: true }));
    }
  }
  function newFist(h, dir, reach, o) {
    const f = Object.assign({ x: h.x, z: h.z, dir, dist: 0, maxR: reach, speed: Math.max(14, reach / 0.12), phase: 'out', t: 0, tick: 0, hit: new Set(), pierce: 0, linger: 0, mult: 1 }, o);
    if (f.mesh) { f.mesh = DT.game.models.fist(h.S.weapon.rarity >= 3 ? D.RARITIES[h.S.weapon.rarity].color : '#f6b42a'); f.mesh.scale.setScalar(h.scale); GF.scene.add(f.mesh); }
    return f;
  }
  C.removeFist = function (f) { if (f.mesh) GF.scene.remove(f.mesh); };
  function cone(run, h, dir, reach, deg, mult, color, kb) {
    const half = (deg * Math.PI) / 360;
    for (const e of run.enemies) {
      if (!alive(e)) continue;
      const dx = e.x - h.x, dz = e.z - h.z, d = Math.hypot(dx, dz);
      if (d > reach + e.r || Math.abs(U.angleDiff(dir, Math.atan2(dx, dz))) > half) continue;
      C.damage(run, e, h.S.power * mult, { hero: h, src: 'primary', kb: kb || 4 });
    }
    GF.swoosh(h.x, h.z, dir, reach, half * 2, color, 1.0);
    run.smashNear(h, reach, half * 2, 1);
  }
  function fistHit(run, h, f, e) {
    const S = h.S, M = S.mods, form = S.form, b = boost(h);
    let mult = f.mult;
    if (M.distDmg) mult *= 1 + M.distDmg * Math.min(1, f.dist / Math.max(1, f.maxR));
    if (h.buffs.mega > 0) mult *= 1.6;
    C.damage(run, e, S.power * mult, { hero: h, src: 'primary', kb: 4, from: h });
    const explode = (form.explode || 0) * b + (M.explode || 0);
    if (explode > 0 || h.buffs.mega > 0) {
      const r = (form.explodeR || 1.9) * (h.buffs.mega > 0 ? 1.4 : 1);
      GF.ring(e.x, e.z, r, M.explodeChill ? '#9fe3ff' : '#ffae00', 0.3);
      GF.burst(e.x, 0.8, e.z, M.explodeChill ? '#dff6ff' : '#ffcf3d', 8, 4, { dur: 0.35 });
      DT.sfx.play('drum');
      for (const n of C.enemiesNear(run, e.x, e.z, r)) {
        if (n !== e) C.damage(run, n, S.power * f.mult * Math.max(explode, h.buffs.mega > 0 ? 0.6 : 0), { hero: h, src: 'proc', noProc: true, noCrit: true, kb: 3, from: e, meter: 0.3 });
        if (M.explodeChill) C.addStatus(run, n, 'chill', 2.5, { hero: h });
      }
      run.smashAt(e.x, e.z, r, 1);
    }
    const chain = Math.round((form.chain || 0) * b) + (M.chain || 0);
    if (chain > 0) C.shock(run, h, e, S.power * ((form.chainMult || 0) + (M.chainMult || 0) || 0.5) * (1 + (M.shockDmg || 0)), chain);
    if (M.pull && !e.boss) { const dx = h.x - e.x, dz = h.z - e.z, d = Math.hypot(dx, dz) || 1; e.pull = { x: (dx / d) * 9, z: (dz / d) * 9, t: 0.22 }; }
  }
  function updateFists(run, h, dt, cmd) {
    if (h.punchCd > 0) h.punchCd -= dt;
    if (h.punchT > 0) h.punchT -= dt;
    for (let i = h.fists.length - 1; i >= 0; i--) {
      const f = h.fists[i];
      f.t += dt;
      if (f.phase === 'out') {
        f.dist = Math.min(f.maxR, f.dist + f.speed * dt);
        f.x = h.x + Math.sin(f.dir) * f.dist; f.z = h.z + Math.cos(f.dir) * f.dist;
        if (!f.noHit) for (const e of run.enemies) {
          if (!alive(e) || f.hit.has(e) || U.dist2(e.x, e.z, f.x, f.z) > (e.r + 0.5) ** 2) continue;
          f.hit.add(e);
          fistHit(run, h, f, e);
          if (f.pierce-- <= 0) { f.phase = f.linger > 0 ? 'hold' : 'back'; f.t = 0; break; }
        }
        const solid = WG.solidAt(run.train, f.x, f.z);
        if (solid && solid.kind === 'breakable') run.damageBreakable(solid.ref, 1);
        if (f.phase === 'out' && (f.dist >= f.maxR || (solid && solid.kind !== 'breakable'))) { f.phase = f.linger > 0 ? 'hold' : 'back'; f.t = 0; }
      } else if (f.phase === 'hold') {
        const held = !f.main || !cmd || cmd.attack || h !== run.local;
        if (f.t >= f.linger || (!held && f.t > 0.12)) { f.phase = 'back'; f.t = 0; f.hit = new Set(); continue; }
        if (f.main && h.aim) {
          /* steer the fist toward the crosshair, within stretching distance */
          const maxR = f.maxR * 1.15;
          let tx = h.aim.x, tz = h.aim.z;
          const ddx = tx - h.x, ddz = tz - h.z, dd = Math.hypot(ddx, ddz);
          if (dd > maxR) { tx = h.x + (ddx / dd) * maxR; tz = h.z + (ddz / dd) * maxR; }
          const mx = tx - f.x, mz = tz - f.z, md = Math.hypot(mx, mz);
          const step = Math.min(md, 11 * dt);
          if (md > 0.01) { f.x += (mx / md) * step; f.z += (mz / md) * step; }
          const p = { x: f.x, z: f.z }; WG.resolve(run.train, p, 0.2); f.x = p.x; f.z = p.z;
          f.dir = Math.atan2(f.x - h.x, f.z - h.z); f.dist = Math.hypot(f.x - h.x, f.z - h.z);
          h.facing = f.dir;
        }
        if ((f.tick -= dt) <= 0) {
          f.tick = 0.25;
          const tm = (h.S.form.tickMult || 0.35) + (h.S.mods.lingerMult || 0);
          for (const e of C.enemiesNear(run, f.x, f.z, 0.75)) C.damage(run, e, h.S.power * f.mult * tm, { hero: h, src: 'primary', kb: 1.5, from: f, meter: 0.6 });
          run.smashAt(f.x, f.z, 0.8, 1);
          GF.ring(f.x, f.z, 0.9, '#ff8fc7', 0.2, { y: 1.0 });
        }
      } else {
        const dx = h.x - f.x, dz = h.z - f.z, d = Math.hypot(dx, dz);
        const step = f.speed * 1.2 * dt;
        if (d <= Math.max(0.7, step)) { C.removeFist(f); h.fists.splice(i, 1); continue; }
        f.x += (dx / d) * step; f.z += (dz / d) * step;
        if (h.S.mods.returnHit && !f.noHit) for (const e of run.enemies) {
          if (!alive(e) || f.hit.has(e) || U.dist2(e.x, e.z, f.x, f.z) > (e.r + 0.5) ** 2) continue;
          f.hit.add(e);
          C.damage(run, e, h.S.power * f.mult * 0.7, { hero: h, src: 'primary', kb: -2, from: h, meter: 0.8 });
        }
      }
      if (f.mesh) f.mesh.position.set(f.x, 1.0 * h.scale, f.z);
    }
  }

  /* ---------- dodging ---------- */
  C.tryDash = function (run, h, cmd) {
    if (h.dashCharges < 1 || h.state === 'ability' || h.state === 'super' || h.state === 'dash') return;
    h.dashCharges -= 1;
    if (h.dashCharges < h.S.dashCharges) h.dashT = h.dashT || 0;
    const mv = cmd && cmd.moving;
    const dx = mv ? cmd.mx : Math.sin(h.facing), dz = mv ? cmd.mz : Math.cos(h.facing);
    const d = Math.hypot(dx, dz) || 1;
    h.state = 'dash'; h.stateT = 0; h.dashDir = { x: dx / d, z: dz / d };
    /* Finn tucks into a somersault, Jake balls up and rolls: about 4.5 m either way */
    h.dashDur = h.id === 'finn' ? 0.36 : 0.32; h.dashSpeed = h.id === 'finn' ? 12.5 : 15;
    h.iframes = h.dashDur + 0.02 + (h.S.mods.dashIframes || 0);
    h.facing = Math.atan2(dx, dz);
    h.dashHit = new Set();
    DT.sfx.play('dash');
    GF.dust(h.x - h.dashDir.x * 0.3, h.z - h.dashDir.z * 0.3, 0.6);
  };

  /* Progress whatever the hero is doing (swing, dash, ability, fists). */
  C.stepAction = function (run, h, dt, cmd) {
    if (h.id === 'jake') updateFists(run, h, dt, cmd);
    if (h.state === 'attack') {
      if (!h.hitDone && h.stateT >= h.swingTime * 0.38) { h.hitDone = true; finnHit(run, h); }
      if (h.stateT >= h.swingTime) {
        h.state = 'idle'; h.comboT = 0.55;
        if (h.combo === h.S.swordType.combo.length) h.comboT = 0;
        if (h.queued || (cmd && cmd.attack && h === run.local)) { h.queued = false; finnSwing(run, h); }
      }
    } else if (h.state === 'dash') {
      h.vx = h.dashDir.x * h.dashSpeed; h.vz = h.dashDir.z * h.dashSpeed;
      const M = h.S.mods;
      for (const e of run.enemies) {
        if (!alive(e) || h.dashHit.has(e) || U.dist2(e.x, e.z, h.x, h.z) > (e.r + h.r + 0.4) ** 2) continue;
        h.dashHit.add(e);
        if (h.id === 'jake') C.damage(run, e, h.S.power * 0.4, { hero: h, src: 'proc', kb: 7, meter: 1 });
        if (M.dashShock) C.shock(run, h, e, h.S.power * 0.5, 2);
        if (M.dashStun) C.addStatus(run, e, 'stun', M.dashStun, { hero: h });
      }
      if ((M.fireTrail || M.rainbowTrail) && (h.trailT = (h.trailT || 0) - dt) <= 0) { h.trailT = 0.05; C.zone(run, { kind: M.rainbowTrail ? 'rainbow' : 'fire', x: h.x, z: h.z, r: 0.9, dur: 2.5, hero: h }); }
      if (h.stateT >= h.dashDur) { h.state = 'idle'; h.vx = h.vz = 0; }
    } else if (h.state === 'ability' && h.act) {
      h.act.update(dt);
      if (h.stateT >= h.act.dur) { const a = h.act; h.state = 'idle'; h.act = null; h.liftY = 0; h.vx = h.vz = 0; if (a.end) a.end(); }
    }
  };

  /* ---------- enemy attacks ---------- */
  function applyEl(run, h, el, dmg) {
    if (el === 'fire') { h.st.burn = 2.5; h.burnDps = dmg * 0.15; }
    else if (el === 'ice') { h.st.chill = 2; if (Math.random() < 0.35) h.st.freeze = 0.7; }
    else if (el === 'slow') h.st.chill = 2;
    else if (el === 'shock') h.st.stun = Math.max(h.st.stun || 0, 0.35);
    else if (el === 'stun') h.st.stun = Math.max(h.st.stun || 0, 0.8);
    else if (el === 'root') h.st.root = Math.max(h.st.root || 0, 1.1);
  }
  C.applyEl = applyEl;
  /* Shove a hero (unless a Juggernaut / Thick Fur node makes them immune). */
  C.pushHero = function (run, h, fromX, fromZ, dist) {
    if (h.S.mods.kbImmune) return;
    const dx = h.x - fromX, dz = h.z - fromZ, d = Math.hypot(dx, dz) || 1;
    const to = WG.clampPath(run.train, h, { x: h.x + (dx / d) * dist, z: h.z + (dz / d) * dist }, h.r);
    h.x = to.x; h.z = to.z;
    WG.resolve(run.train, h, h.r);
  };
  C.hurtHeroesIn = function (run, x, z, r, dmg, src, el, extra) {
    for (const h of run.heroes) if (!h.ko && U.dist2(h.x, h.z, x, z) < (r + h.r) ** 2) {
      const d = C.hurtHero(run, h, dmg, src);
      if (d > 0) { applyEl(run, h, el, dmg); if (extra) extra(h); }
    }
  };
  C.enemyAttack = function (run, e, tgt, A) {
    const arch = A || e.def.arch;
    const el = e.def.burn ? 'fire' : e.def.chill ? 'ice' : null;
    if (e.def.arch === 'moon') { for (const off of [-0.28, 0, 0.28]) C.enemyShot(run, e, tgt, off); return; }
    if (arch === 'zapper') { C.zap(run, e); return; }
    if (arch === 'melee' || arch === 'lemongrab') {
      const reach = e.r + 0.9 + (e.reach || 0);
      C.hurtHeroesIn(run, e.x + Math.sin(e.facing) * reach * 0.6, e.z + Math.cos(e.facing) * reach * 0.6, reach * 0.7, e.dmg, e, el);
      GF.swoosh(e.x, e.z, e.facing, reach + 0.3, 1.8, e.transformed ? '#7ed957' : '#ff6b6b', 0.8);
      if (e.def.swordBeam && (e.hits = (e.hits || 0) + 1) % 3 === 0) C.enemyShot(run, e, tgt, 0, { shape: 'beam', speed: 14 });
    } else if (arch === 'tank') {
      C.hurtHeroesIn(run, e.slamAt.x, e.slamAt.z, 2.4, e.dmg, e, el, (h) => C.pushHero(run, h, e.slamAt.x, e.slamAt.z, 1.5));
      GF.ring(e.slamAt.x, e.slamAt.z, 2.6, e.def.chill ? '#9fe3ff' : '#ff9d2e', 0.35);
      GF.burst(e.slamAt.x, 0.2, e.slamAt.z, '#d9cbb8', 10, 4, { dur: 0.5 });
      run.shake(0.25);
    } else if (arch === 'bomber') {
      C.hurtHeroesIn(run, e.x, e.z, 2.3, e.dmg, e, 'fire');
      GF.ring(e.x, e.z, 2.6, '#ff7a2e', 0.4, { add: true });
      GF.burst(e.x, 0.5, e.z, '#ffae00', 16, 7);
      DT.sfx.play('explode');
      run.shake(0.3);
      e.hp = 0;
      C.killEnemy(run, e, run.local, { src: 'self' });
    } else if (arch === 'ranged') C.enemyShot(run, e, tgt, 0);
    else if (arch === 'magicman') for (const off of [-0.3, 0, 0.3]) C.enemyShot(run, e, tgt, off);
  };
  C.enemyShot = function (run, e, tgt, off, o) {
    o = o || {};
    const sh = e.def.shot || { speed: 10, color: '#ff4d4d' };
    const dir = (o.dir != null ? o.dir : Math.atan2(tgt.x - e.x, tgt.z - e.z)) + (off || 0);
    C.fire(run, { owner: 'enemy', src: e, x: e.x, z: e.z, y: e.boss ? 1.4 : 0.9, dir, speed: o.speed || sh.speed, dmg: e.dmg * (o.mult || 1), r: 0.35, life: 2.6, color: o.color || sh.color, size: sh.size || 0.3, shape: o.shape, el: o.el || sh.el || (sh.burn ? 'fire' : null) });
    DT.sfx.play('enemyShot');
  };
  /* A shout that hurts, stuns and (usually) shoves everyone nearby: Lemongrab's UNACCEPTABLE, the Lich's STOP,
     the Empress's hypnotic stare. */
  C.lemongrabScream = function (run, e, r, mult, stun, text, color, push) {
    GF.ring(e.x, e.z, r, color || '#ffd400', 0.45);
    say(run, e.x, e.z, text || 'UNACCEPTABLE!', 'crit', popY(e));
    run.shake(0.3);
    e.screaming = 0.5;
    C.hurtHeroesIn(run, e.x, e.z, r, e.dmg * mult, e, null, (h) => { h.st.stun = stun; if (push !== false) C.pushHero(run, h, e.x, e.z, 2.2); });
  };
  /* Hair Apes and Laser Wizards: after a wind-up along a marked line, zap everything on it. */
  C.zap = function (run, e) {
    const z = e.def.zap || {};
    const dir = e.zapDir != null ? e.zapDir : e.facing;
    const fx = Math.sin(dir), fz = Math.cos(dir);
    const end = WG.clampPath(run.train, e, { x: e.x + fx * (z.len || 11), z: e.z + fz * (z.len || 11) }, 0.1);
    const L = Math.hypot(end.x - e.x, end.z - e.z);
    for (const h of run.heroes) {
      if (h.ko) continue;
      const rx = h.x - e.x, rz = h.z - e.z, along = rx * fx + rz * fz, side = Math.abs(rx * fz - rz * fx);
      if (along > 0 && along < L + h.r && side < 0.45 + h.r && C.hurtHero(run, h, e.dmg, e) > 0) applyEl(run, h, z.el, e.dmg);
    }
    let a = { x: e.x + fx * 0.4, y: 1.1, z: e.z + fz * 0.4 };
    for (let i = 1; i <= 6; i++) {
      const t = i / 6, j = i < 6 ? (Math.random() - 0.5) * 0.6 : 0;
      const b = { x: e.x + fx * L * t + fz * j, y: 1.1, z: e.z + fz * L * t - fx * j };
      GF.line(a, b, z.color || '#7fdcff', 0.22, 0.13);
      a = b;
    }
    GF.burst(end.x, 1, end.z, z.color || '#7fdcff', 6, 3, { dur: 0.3 });
    if (z.text && Math.random() < 0.5) say(run, e.x, e.z, z.text, 'status', popY(e));
    DT.sfx.play('zap');
  };
  /* The Guardian Angel keeps its friends topped up — until you find out what it really is. */
  C.angelHeal = function (run, e) {
    GF.ring(e.x, e.z, 6, '#ffe066', 0.5);
    let n = 0;
    for (const o of run.enemies) if (!o.dead && o !== e && !o.boss && U.dist2(o.x, o.z, e.x, e.z) < 36 && o.hp < o.maxHp) { o.hp = Math.min(o.maxHp, o.hp + o.maxHp * 0.15); n++; GF.burst(o.x, 1.2, o.z, '#ffe066', 5, 2, { dur: 0.4 }); }
    if (n) say(run, e.x, e.z, 'Bless you, my children!', 'good', popY(e));
  };
  C.reveal = function (run, e) {
    e.revealed = true;
    const p = e.parts;
    if (p.faces) { p.faces[0].visible = false; p.faces[1].visible = true; }
    if (p.halo) p.halo.visible = false;
    e.speed *= 1.5; e.dmg *= 1.3; e.attackCd = 0.3;
    if (e.tele) { e.tele.alive = false; e.tele = null; }
    e.state = 'chase'; e.stateT = 0; e.lungeTo = null;
    e.name = 'Not-So-Guardian Angel';
    say(run, e.x, e.z, 'SURPRISE!!', 'crit', popY(e) + 0.4);
    run.shake(0.25);
    DT.sfx.play('scream');
    e.sqV = -8;
  };
  /* The Hierophant changes shape at half health: bigger, meaner, and his arm is a snake now. */
  C.transform = function (run, e) {
    e.transformed = true;
    const p = e.parts;
    if (p.snake) { p.snake.visible = true; if (p.arms && p.arms[1]) p.arms[1].visible = false; }
    e.scale *= 1.25; e.mesh.scale.setScalar(e.scale);
    e.dmg *= 1.35; e.speed *= 1.2; e.r *= 1.15; e.reach = 1.3;
    if (e.tele) { e.tele.alive = false; e.tele = null; }
    e.state = 'chase'; e.stateT = 0;
    say(run, e.x, e.z, 'Behold my TRUE shape!', 'crit', popY(e) + 0.4);
    GF.poof(e.x, 1, e.z, 1.4, '#e8d8ff');
    run.shake(0.3);
    DT.sfx.play('boss');
  };
  /* A big straight laser (Citadel Guardian's head, Future Finn's sword wave, the Lich's green fire). */
  function beamHit(run, e, b) {
    const fx = Math.sin(b.dir), fz = Math.cos(b.dir);
    const end = WG.clampPath(run.train, e, { x: e.x + fx * b.len, z: e.z + fz * b.len }, 0.1);
    const L = Math.hypot(end.x - e.x, end.z - e.z);
    for (const h of run.heroes) {
      if (h.ko) continue;
      const rx = h.x - e.x, rz = h.z - e.z, along = rx * fx + rz * fz, side = Math.abs(rx * fz - rz * fx);
      if (along > -0.5 && along < L + h.r && side < b.w / 2 + h.r * 0.6 && C.hurtHero(run, h, e.dmg * b.mult, e) > 0) applyEl(run, h, b.el, e.dmg);
    }
    GF.line({ x: e.x, y: 1.5, z: e.z }, end, b.color, 0.4, b.w * 0.5);
    GF.line({ x: e.x, y: 1.5, z: e.z }, end, '#ffffff', 0.25, b.w * 0.2);
    GF.burst(end.x, 1.2, end.z, b.color, 10, 5, { dur: 0.4 });
    run.shake(0.3);
    DT.sfx.play('zap');
  }
  C.blinkEnemy = function (run, e, tgt) {
    GF.burst(e.x, 1, e.z, '#43e0c5', 12, 4, { dur: 0.4 });
    const a = Math.random() * Math.PI * 2, d = R.float(5, 7);
    const p = { x: tgt.x + Math.cos(a) * d, z: tgt.z + Math.sin(a) * d };
    const car = run.train.cars[e.car];
    p.x = U.clamp(p.x, car.x0 + 1.5, car.x1 - 1.5);
    WG.resolve(run.train, p, e.r);
    e.x = p.x; e.z = p.z;
    GF.burst(e.x, 1, e.z, '#43e0c5', 12, 4, { dur: 0.4 });
  };

  /* ---------- bosses: one brain, many personalities (data/world.js) ---------- */
  C.bossThink = function (run, e, tgt, dt, slow) {
    const brain = D.BOSS_BRAINS[e.def.brain];
    const hpF = e.hp / e.maxHp;
    const phase = hpF > 0.66 ? 0 : hpF > 0.33 ? 1 : 2;
    if (phase !== e.phase || !e.started) {
      e.started = true;
      if (phase !== e.phase && phase > 0) { run.banner(phase === 1 ? `${e.name} is getting mad!` : `${e.name} is FURIOUS!`, 'bad'); DT.sfx.play('boss'); }
      e.phase = phase;
      say(run, e.x, e.z, brain.taunts[phase], 'crit', popY(e) + 0.6);
      /* the Demon Cat knows approximately many things, and one of them is: dogs are TERRIFYING */
      if (brain.fearsDogs && phase > 0 && run.heroes.some((h) => h.id === 'jake' && !h.ko)) {
        e.st.fear = 2; e.busy = null; if (e.tele) { e.tele.alive = false; e.tele = null; } e.telegraphing = false;
        run.later(0.8, () => { if (!e.dead) say(run, e.x, e.z, 'DOG! I smell DOG!', 'status', popY(e) + 0.3); });
      }
    }
    const P = brain.phases[phase];
    const T = e.timers;
    const dx = tgt.x - e.x, dz = tgt.z - e.z, dist = Math.hypot(dx, dz) || 1;
    const spd = e.speed * slow * (P.speed || 1);
    if (e.busy) { busyStep(run, e, tgt, dt); return; }
    e.facing = Math.atan2(dx, dz);
    const keep = P.keep != null ? P.keep : brain.keep;
    if (!keep) {
      if (dist > e.r + 1.3) { e.vx = (dx / dist) * spd; e.vz = (dz / dist) * spd; } else { e.vx = e.vz = 0; }
    } else {
      const orbit = e.walkT * 0.3;
      const px = tgt.x - (dx / dist) * keep + Math.cos(orbit) * 1.5, pz = tgt.z - (dz / dist) * keep + Math.sin(orbit) * 1.5;
      const mdx = px - e.x, mdz = pz - e.z, md = Math.hypot(mdx, mdz) || 1;
      if (md > 0.5) { e.vx = (mdx / md) * spd; e.vz = (mdz / md) * spd; } else { e.vx = e.vz = 0; }
    }
    const car = run.train.cars[e.car];
    for (const key of Object.keys(P)) {
      if (key === 'speed' || key === 'keep') continue;
      const pat = P[key];
      T[key] = (T[key] || R.float(0, pat.every * 0.5)) + dt;
      if (T[key] < pat.every) continue;
      T[key] = 0;
      switch (key) {
        case 'spread': for (let i = 0; i < pat.n; i++) C.enemyShot(run, e, tgt, (i - (pat.n - 1) / 2) * (pat.arc / Math.max(1, pat.n - 1)) * 2, { mult: pat.mult, el: pat.el }); break;
        case 'ring': for (let i = 0; i < pat.n; i++) C.enemyShot(run, e, tgt, 0, { dir: (i / pat.n) * Math.PI * 2 + e.walkT, mult: pat.mult, el: pat.el, speed: 9, color: pat.color }); break;
        case 'beam': { const dir = Math.atan2(dx, dz); e.busy = { kind: 'beam', t: 0, wind: pat.wind || 1, dir, len: pat.len || 15, w: pat.w || 1.3, mult: pat.mult, el: pat.el, color: pat.color || (e.def.shot && e.def.shot.color) || '#ffffff' }; e.tele = GF.telegraphRect(e.x, e.z, dir, pat.len || 15, pat.w || 1.3, pat.wind || 1, pat.color || '#ff3b3b'); e.vx = e.vz = 0; e.telegraphing = true; break; }
        case 'slam': e.busy = { kind: 'slam', t: 0, dur: 0.9, r: pat.r, mult: pat.mult }; e.vx = e.vz = 0; e.tele = GF.telegraph(e.x, e.z, pat.r, 0.9, '#ff3b3b'); e.telegraphing = true; break;
        case 'circles': for (let i = 0; i < pat.n; i++) { const a = Math.random() * Math.PI * 2, d = i === 0 ? 0.4 : R.float(1.5, 3.5); C.zone(run, { kind: 'bossAoE', x: tgt.x + Math.cos(a) * d, z: tgt.z + Math.sin(a) * d, r: pat.r, delay: 1.1, dmg: e.dmg * pat.mult, el: pat.el, src: e }); } break;
        case 'line': for (let i = 1; i <= pat.n; i++) C.zone(run, { kind: 'bossAoE', x: e.x + (dx / dist) * i * pat.gap, z: e.z + (dz / dist) * i * pat.gap, r: pat.r, delay: 0.7 + i * 0.07, dmg: e.dmg * pat.mult, el: pat.el, src: e }); break;
        case 'charge': { const len = Math.min(14, dist + 3); e.busy = { kind: 'charge', t: 0, wind: 0.8, dir: Math.atan2(dx, dz), len, mult: pat.mult, hit: new Set() }; e.tele = GF.telegraphRect(e.x, e.z, Math.atan2(dx, dz), len, e.r * 2 + 0.6, 0.8, '#ff3b3b'); e.vx = e.vz = 0; e.telegraphing = true; break; }
        case 'summon': { const n = run.enemies.filter((x) => !x.dead && !x.boss && x.car === e.car).length; if (n < pat.max) { C.summon(run, e, pat.ids, pat.n); say(run, e.x, e.z, 'Get them!', 'status', popY(e)); } break; }
        case 'scream': e.busy = { kind: 'scream', t: 0, dur: 0.9, r: pat.r, mult: pat.mult, stun: pat.stun, text: pat.text, color: pat.color }; e.vx = e.vz = 0; e.tele = GF.telegraph(e.x, e.z, pat.r, 0.9, pat.color || '#ffd400'); DT.sfx.play('scream'); break;
        case 'pull': e.busy = { kind: 'pull', t: 0, dur: pat.dur, str: pat.str }; e.vx = e.vz = 0; say(run, e.x, e.z, 'Come here…', 'crit', popY(e)); break;
        case 'blink': if (car) C.blinkEnemy(run, e, tgt); break;
        default: break;
      }
      break;
    }
  };
  function busyStep(run, e, tgt, dt) {
    const b = e.busy;
    b.t += dt;
    e.vx = e.vz = 0;
    if (b.kind === 'slam' && b.t >= b.dur) {
      if (e.tele) { e.tele.alive = false; e.tele = null; }
      C.hurtHeroesIn(run, e.x, e.z, b.r, e.dmg * b.mult, e, null);
      GF.ring(e.x, e.z, b.r + 0.3, '#ff9d2e', 0.4);
      GF.burst(e.x, 0.3, e.z, '#d9cbb8', 16, 6, { dur: 0.6 });
      DT.sfx.play('explode'); run.shake(0.35);
      e.busy = null; e.telegraphing = false;
    } else if (b.kind === 'scream' && b.t >= b.dur) {
      if (e.tele) { e.tele.alive = false; e.tele = null; }
      C.lemongrabScream(run, e, b.r, b.mult, b.stun, b.text, b.color);
      e.busy = null; e.telegraphing = false;
    } else if (b.kind === 'beam') {
      e.facing = b.dir;
      if (b.t >= b.wind && !b.fired) { b.fired = true; if (e.tele) { e.tele.alive = false; e.tele = null; } e.telegraphing = false; beamHit(run, e, b); }
      if (b.t >= b.wind + 0.35) e.busy = null;
    } else if (b.kind === 'charge') {
      if (b.t < b.wind) { e.facing = b.dir; return; }
      if (e.tele) { e.tele.alive = false; e.tele = null; e.telegraphing = false; }
      const k = b.t - b.wind;
      if (k < b.len / 18) {
        e.vx = Math.sin(b.dir) * 18; e.vz = Math.cos(b.dir) * 18;
        for (const h of run.heroes) if (!h.ko && !b.hit.has(h) && U.dist2(h.x, h.z, e.x, e.z) < (e.r + h.r + 0.2) ** 2) { b.hit.add(h); if (C.hurtHero(run, h, e.dmg * b.mult, e) > 0) C.pushHero(run, h, e.x, e.z, 2.5); }
        run.smashAt(e.x, e.z, e.r + 0.4, 2);
      } else e.busy = null;
    } else if (b.kind === 'pull') {
      for (const h of run.heroes) {
        if (h.ko || h.state === 'dash') continue;
        const dx = e.x - h.x, dz = e.z - h.z, d = Math.hypot(dx, dz) || 1;
        if (d > 1.6) { h.x += (dx / d) * b.str * dt; h.z += (dz / d) * b.str * dt; }
        if ((b.tick = (b.tick || 0) - dt) <= 0) { b.tick = 0.3; GF.line({ x: e.x, y: 2, z: e.z }, { x: h.x, y: 1, z: h.z }, '#ff4d6d', 0.3, 0.12); C.hurtHero(run, h, e.dmg * 0.12, e, { dot: true }); }
      }
      if (b.t >= b.dur) e.busy = null;
    }
  }

  /* ---------- projectiles ---------- */
  C.fire = function (run, o) {
    const size = o.size || 0.3;
    const mesh = new THREE.Mesh(GF.geo(o.shape === 'beam' ? 'box' : 'sphere', ...(o.shape === 'beam' ? [0.2, 0.25, 1.7] : [size, 10, 8])), GF.basic(o.color || '#ffffff', { add: o.owner === 'hero' }));
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
        if (!(p.pierce && solid.kind === 'breakable')) dead = true;
      }
      if (!dead && p.owner === 'hero') {
        for (const e of run.enemies) {
          if (!alive(e) || p.hit.has(e)) continue;
          if (U.dist2(p.x, p.z, e.x, e.z) < (e.r + p.r) ** 2) {
            p.hit.add(e);
            C.damage(run, e, p.dmg, { hero: p.hero, src: p.src || 'ability', kb: p.kb || 2, from: p, meter: p.meter != null ? p.meter : 1, noProc: p.noProc });
            if (p.onHit) p.onHit(e);
            if (p.chill) C.addStatus(run, e, 'chill', 2.5, { hero: p.hero });
            if (!p.pierce) { dead = true; break; }
          }
        }
      } else if (!dead) {
        for (const h of run.heroes) {
          if (h.ko || U.dist2(p.x, p.z, h.x, h.z) > (h.r + p.r) ** 2) continue;
          if (h.buffs.shield && h.buffs.shield.reflect) { p.owner = 'hero'; p.hero = h; p.vx *= -1.2; p.vz *= -1.2; p.hit = new Set(); p.dmg *= 1.5; p.src = 'proc'; GF.ring(p.x, p.z, 0.8, '#7fe3ff', 0.2); break; }
          const d = C.hurtHero(run, h, p.dmg, p.src);
          if (d > 0) applyEl(run, h, p.el, p.dmg);
          dead = true;
          break;
        }
      }
      if (dead) { GF.scene.remove(p.mesh); GF.burst(p.x, 0.9, p.z, p.color || '#ffffff', 3, 2, { dur: 0.25, size: 0.08 }); list.splice(i, 1); }
    }
  };

  /* ---------- floor zones ---------- */
  C.zone = function (run, z) {
    z.t = 0;
    if (z.kind === 'heal') {
      z.mesh = new THREE.Group();
      for (let i = 0; i < 4; i++) z.mesh.add(GF.part(GF.geo('cyl', 0.42 - i * 0.02, 0.42 - i * 0.02, 0.1, 18), '#e8b25c', [0, 0.06 + i * 0.11, 0]));
      z.mesh.add(GF.part(GF.geo('box', 0.5, 0.05, 0.12), '#c2413a', [0, 0.5, 0.05], { ink: false }));
      z.mesh.position.set(z.x, 0, z.z); GF.scene.add(z.mesh);
      z.ring = GF.telegraph(z.x, z.z, z.r, z.dur, '#7ed957');
    } else if (z.kind === 'trap') {
      z.mesh = new THREE.Group();
      z.mesh.add(GF.part(GF.geo('torus', 0.45, 0.07, 16), '#5a5f6a', [0, 0.08, 0], { rot: [Math.PI / 2, 0, 0] }));
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; z.mesh.add(GF.part(GF.geo('cone', 0.06, 0.25, 6), '#b8c2cc', [Math.cos(a) * 0.4, 0.18, Math.sin(a) * 0.4], { ink: false })); }
      z.mesh.position.set(z.x, 0, z.z); GF.scene.add(z.mesh);
    } else if (z.kind === 'slam') {
      z.tele = GF.telegraph(z.x, z.z, z.r, z.delay, '#ffcf3d');
      if (!z.noFist) { z.mesh = GF.part(GF.geo('sphere', 1.1 * (z.size || 1), 16, 12), '#f6b42a', [z.x, 7, z.z]); GF.scene.add(z.mesh); }
    } else if (z.kind === 'rainbow' || z.kind === 'fire') {
      z.mesh = new THREE.Mesh(GF.geo('circle', z.r, 16), GF.basic(z.kind === 'fire' ? R.pick(['#ff7a2e', '#ffae00', '#ff5a1f']) : R.pick(['#ff5f6d', '#ffc93c', '#6bd66b', '#6ab7ff', '#c77dff']), { opacity: 0.55 }));
      z.mesh.rotation.x = -Math.PI / 2; z.mesh.position.set(z.x, 0.04, z.z); GF.scene.add(z.mesh);
    } else if (z.kind === 'bossAoE') {
      z.tele = GF.telegraph(z.x, z.z, z.r, z.delay, z.el === 'fire' ? '#ff7a2e' : z.el === 'ice' ? '#5ec8ff' : z.el === 'shock' ? '#b8f1ff' : z.el === 'slow' ? '#7ed957' : '#ff3b3b');
      z.dur = z.delay + 0.05;
    } else if (z.kind === 'flare') {
      z.mesh = GF.beam('#ff8fc7', 14); z.mesh.position.set(z.x, 7, z.z); GF.scene.add(z.mesh);
      z.ring = GF.telegraph(z.x, z.z, z.r, z.dur, '#ff8fc7');
    }
    run.zones.push(z);
    return z;
  };
  C.updateZones = function (run, dt) {
    const list = run.zones;
    for (let i = list.length - 1; i >= 0; i--) {
      const z = list[i];
      z.t += dt;
      let done = z.t >= z.dur;
      if (z.kind === 'heal') {
        for (const h of run.heroes) if (!h.ko && U.dist2(h.x, h.z, z.x, z.z) < z.r * z.r) { C.healHero(run, h, h.maxHp * 0.06 * dt * (1 + h.S.healPower * 0.5), { quiet: true }); if (z.buff) { h.buffs.pancake = 0.3; h.buffs.pancakeBuff = z.buff; } }
      } else if (z.kind === 'trap') {
        for (const e of run.enemies) if (alive(e) && U.dist2(e.x, e.z, z.x, z.z) < (0.6 + e.r) ** 2) {
          C.damage(run, e, z.dmg, { hero: z.hero, src: 'ability', meter: 1 }); C.addStatus(run, e, 'root', z.root, { hero: z.hero });
          if (z.explode) { GF.ring(z.x, z.z, 2.6, '#ff7a2e', 0.35); for (const n of C.enemiesNear(run, z.x, z.z, 2.6)) if (n !== e) C.damage(run, n, z.dmg * 0.8, { hero: z.hero, src: 'ability', kb: 5, from: z }); DT.sfx.play('explode'); }
          GF.ring(z.x, z.z, 1.2, '#b8c2cc', 0.25); done = true; break;
        }
      } else if (z.kind === 'slam') {
        const k = Math.min(1, z.t / z.delay);
        if (z.mesh) z.mesh.position.y = 7 * (1 - k * k) + 0.6;
        if (!z.hitDone && z.t >= z.delay) {
          z.hitDone = true;
          for (const e of C.enemiesNear(run, z.x, z.z, z.r)) { C.damage(run, e, z.dmg, { hero: z.hero, src: z.src || 'ability', kb: 6, from: z, meter: 1.2 }); if (z.stun) C.addStatus(run, e, 'stun', z.stun, { hero: z.hero }); if (z.freeze) C.addStatus(run, e, 'freeze', z.freeze, { hero: z.hero }); }
          run.smashAt(z.x, z.z, z.r, 2);
          GF.ring(z.x, z.z, z.r + 0.4, '#ffcf3d', 0.35);
          GF.burst(z.x, 0.3, z.z, '#d9cbb8', 14, 6, { dur: 0.6 });
          DT.sfx.play('explode');
          run.shake(0.25);
          if (z.after) { const a = z.after; z.after = null; C.zone(run, a); }
        }
        if (z.hitDone && z.t >= z.delay + 0.2) done = true;
      } else if (z.kind === 'rainbow') {
        for (const h of run.heroes) if (!h.ko && U.dist2(h.x, h.z, z.x, z.z) < z.r * z.r) C.healHero(run, h, h.maxHp * 0.08 * dt, { quiet: true });
        for (const e of C.enemiesNear(run, z.x, z.z, z.r)) { e.hp -= z.hero.S.power * 0.8 * dt; if (e.hp <= 0) C.killEnemy(run, e, z.hero); }
      } else if (z.kind === 'fire') {
        if ((z.tick = (z.tick || 0) - dt) <= 0) { z.tick = 0.5; for (const e of C.enemiesNear(run, z.x, z.z, z.r)) C.addStatus(run, e, 'burn', 2, { hero: z.hero, dps: z.hero.S.power * 0.3 }); }
      } else if (z.kind === 'bossAoE') {
        if (done) {
          const col = z.el === 'fire' ? '#ff7a2e' : z.el === 'ice' ? '#9fe3ff' : z.el === 'shock' ? '#e8fbff' : '#ff9d2e';
          GF.ring(z.x, z.z, z.r + 0.3, col, 0.35);
          GF.burst(z.x, 0.4, z.z, col, 8, 3, { dur: 0.4 });
          C.hurtHeroesIn(run, z.x, z.z, z.r, z.dmg, z.src, z.el);
          if (z.el === 'shock') DT.sfx.play('zap'); else if (z.el === 'ice') DT.sfx.play('freeze'); else DT.sfx.play('hit');
        }
      } else if (z.kind === 'flare') {
        const h = run.local;
        if (!(h && !h.ko && U.dist2(h.x, h.z, z.x, z.z) < z.r * z.r)) z.t -= dt;
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

  DT.game.combat = C;
})();
