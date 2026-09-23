/* Abilities (skill tree + item abilities), casting rules, the two supers, snacks, and always-on effects
   (drones, auras, ice bolts, pie…). `am` = this ability's upgrades from skill-tree mod nodes. */
(function () {
  'use strict';
  const D = DT.data;
  const R = DT.R;
  const U = DT.U;
  const GF = DT.game.gfx;
  const WG = DT.game.world;
  const MD = DT.game.models;
  const C = DT.game.combat;
  const say = C.say;
  const A = {};

  function aoe(run, h, x, z, r, mult, o) {
    o = o || {};
    let n = 0;
    for (const e of C.enemiesNear(run, x, z, r)) {
      C.damage(run, e, h.S.power * mult, Object.assign({ hero: h, src: 'ability', from: { x, z }, meter: 1 }, o));
      if (o.stun) C.addStatus(run, e, 'stun', o.stun, { hero: h });
      if (o.root) C.addStatus(run, e, 'root', o.root, { hero: h });
      if (o.freeze) C.addStatus(run, e, 'freeze', o.freeze, { hero: h });
      if (o.chill) C.addStatus(run, e, 'chill', 2.5, { hero: h });
      if (o.burn) C.addStatus(run, e, 'burn', 3, { hero: h, dps: h.S.power * 0.4 });
      n++;
    }
    run.smashAt(x, z, r, 1);
    return n;
  }
  function act(h, dur, update, end) { h.state = 'ability'; h.stateT = 0; h.act = { dur, update: update || (() => {}), end }; }
  function reachPoint(run, h, range) {
    const a = h.aim || { x: h.x + Math.sin(h.facing) * range, z: h.z + Math.cos(h.facing) * range };
    const dx = a.x - h.x, dz = a.z - h.z, d = Math.hypot(dx, dz) || 1;
    const k = Math.min(1, range / d);
    const p = WG.clampPath(run.train, h, { x: h.x + dx * k, z: h.z + dz * k }, h.r);
    WG.resolve(run.train, p, h.r);
    return { x: p.x, z: p.z, dir: Math.atan2(dx, dz) };
  }
  /* enemies in a strip along `dir` from the hero */
  function inLine(run, h, dir, len, width) {
    const out = [];
    for (const e of C.enemiesNear(run, h.x, h.z, len + 1)) {
      const dx = e.x - h.x, dz = e.z - h.z;
      const along = dx * Math.sin(dir) + dz * Math.cos(dir);
      const across = Math.abs(dx * Math.cos(dir) - dz * Math.sin(dir));
      if (along > -0.5 && along < len && across < width / 2 + e.r) out.push({ e, along });
    }
    return out.sort((a, b) => a.along - b.along);
  }
  function inCone(run, h, dir, len, deg) {
    return C.enemiesNear(run, h.x, h.z, len).filter((e) => Math.abs(U.angleDiff(dir, Math.atan2(e.x - h.x, e.z - h.z))) <= (deg * Math.PI) / 360);
  }
  function leap(run, h, target, dur, height, end) {
    const sx = h.x, sz = h.z;
    h.iframes = Math.max(h.iframes, dur);
    h.facing = Math.atan2(target.x - h.x, target.z - h.z);
    act(h, dur, () => { const k = Math.min(1, h.stateT / dur); h.x = U.lerp(sx, target.x, k); h.z = U.lerp(sz, target.z, k); h.liftY = Math.sin(k * Math.PI) * height; }, () => { h.liftY = 0; end(); });
  }
  const pullToward = (e, x, z, speed, t) => { if (e.boss) return; const dx = x - e.x, dz = z - e.z, d = Math.hypot(dx, dz) || 1; e.pull = { x: (dx / d) * speed, z: (dz / d) * speed, t }; };

  const AB = {
    /* ---------- Finn ---------- */
    sword_spin(run, h, ab, aim, am) {
      const r = ab.radius * Math.sqrt(h.S.reachMult) * (1 + (am.radius || 0));
      if (am.pull) for (const e of C.enemiesNear(run, h.x, h.z, r + 2.5)) pullToward(e, h.x, h.z, 10, 0.18);
      const spin = (mult) => { aoe(run, h, h.x, h.z, r, mult, { kb: 6 }); GF.swoosh(h.x, h.z, h.facing, r, Math.PI * 2 - 0.01, '#ffe066', 0.9); GF.ring(h.x, h.z, r, '#ffffff', 0.25); };
      act(h, 0.3, () => { h.mesh.rotation.y += 0.9; });
      run.later(am.pull ? 0.15 : 0, () => spin(ab.dmg));
      if (am.twice) run.later(0.4, () => { if (!h.ko) spin(ab.dmg * 0.7); });
    },
    heros_leap(run, h, ab, aim, am) {
      const t = reachPoint(run, h, ab.range);
      const r = ab.radius * (1 + (am.radius || 0));
      leap(run, h, t, 0.45, 2.2, () => {
        aoe(run, h, h.x, h.z, r, ab.dmg, { kb: 7, stun: ab.stun });
        GF.ring(h.x, h.z, r + 0.4, '#56c3f5', 0.35); GF.burst(h.x, 0.3, h.z, '#d9cbb8', 12, 6);
        if (am.fire) for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; C.zone(run, { kind: 'fire', x: h.x + Math.cos(a) * r * 0.6, z: h.z + Math.sin(a) * r * 0.6, r: 1.2, dur: 3, hero: h }); }
        run.shake(0.3); DT.sfx.play('explode');
      });
    },
    sword_beam(run, h, ab, aim, am) {
      const n = 1 + (am.count || 0);
      for (let i = 0; i < n; i++) C.swordBeam(run, h, ab.dmg, h.aimDir + (i - (n - 1) / 2) * 0.22, 'ability');
    },
    battle_cry(run, h, ab, aim, am) {
      h.buffs.cry = ab.dur + (am.dur || 0);
      if (am.heal) C.healHero(run, h, h.maxHp * am.heal);
      GF.ring(h.x, h.z, 3.5, '#ffcf3d', 0.4);
      say(run, h.x, h.z, 'HYAAAH!', 'crit');
    },
    pancake_toss(run, h, ab, aim, am) {
      C.zone(run, { kind: 'heal', x: h.x, z: h.z, r: ab.radius * (1 + (am.radius || 0)), dur: ab.dur, buff: am.buff || 0 });
      say(run, h.x, h.z, 'Bacon pancakes!', 'heal');
    },
    hero_trap(run, h, ab, aim, am) {
      const traps = run.zones.filter((z) => z.kind === 'trap');
      if (traps.length >= 3 + (am.max || 0)) traps[0].t = traps[0].dur;
      C.zone(run, { kind: 'trap', x: h.x, z: h.z, r: 0.6, dur: 45, dmg: h.S.power * ab.dmg, root: ab.root, hero: h, explode: am.explode });
    },
    shield_bash(run, h, ab, aim, am) {
      const dir = h.aimDir, width = 1.6 * (am.wide ? 1.7 : 1), hit = new Set();
      h.facing = dir; h.iframes = Math.max(h.iframes, 0.3);
      act(h, 0.3, () => {
        h.vx = Math.sin(dir) * (ab.range / 0.3); h.vz = Math.cos(dir) * (ab.range / 0.3);
        for (const e of C.enemiesNear(run, h.x, h.z, width)) if (!hit.has(e)) { hit.add(e); C.damage(run, e, h.S.power * ab.dmg, { hero: h, src: 'ability', kb: 9 }); C.addStatus(run, e, 'stun', ab.stun * (1 + (am.stun || 0)), { hero: h }); }
        run.smashAt(h.x, h.z, width, 2);
      });
      GF.burst(h.x, 0.6, h.z, '#9aa3b0', 6, 3);
    },
    grapple(run, h, ab) {
      const dir = h.aimDir;
      const hits = inLine(run, h, dir, ab.range, 1.2);
      let target, enemy = null;
      if (hits.length) { enemy = hits[0].e; const d = Math.max(0, hits[0].along - enemy.r - 1.0); target = { x: h.x + Math.sin(dir) * d, z: h.z + Math.cos(dir) * d }; }
      else target = reachPoint(run, h, Math.min(ab.range, (h.aim && Math.hypot(h.aim.x - h.x, h.aim.z - h.z)) || ab.range));
      WG.resolve(run.train, target, h.r);
      GF.line({ x: h.x, y: 1.1, z: h.z }, { x: enemy ? enemy.x : target.x, y: 1.1, z: enemy ? enemy.z : target.z }, '#b8c2cc', 0.3, 0.06);
      leap(run, h, target, 0.28, 0.6, () => { if (enemy && !enemy.dead) { C.damage(run, enemy, h.S.power * ab.dmg, { hero: h, src: 'ability', kb: 4 }); C.addStatus(run, enemy, 'stun', ab.stun, { hero: h }); GF.ring(enemy.x, enemy.z, 1.6, '#ffffff', 0.25); } });
    },
    parry(run, h, ab, aim, am) {
      h.buffs.parry = ab.dur;
      h.parryAb = { ab, am };
      GF.ring(h.x, h.z, 1.4, '#ffe066', ab.dur, { from: 1 });
      say(run, h.x, h.z, 'En garde!', 'status');
    },

    /* ---------- Jake ---------- */
    stretchy_slam(run, h, ab, aim, am) {
      const t = reachPoint(run, h, ab.range);
      const r = ab.radius * (1 + (am.radius || 0));
      const z = { kind: 'slam', x: t.x, z: t.z, r, size: 1 + (am.radius || 0), dur: 5, delay: ab.delay, dmg: h.S.power * ab.dmg, hero: h };
      if (am.after) z.after = { kind: 'slam', x: t.x, z: t.z, r: r * 1.25, dur: 5, delay: 0.5, dmg: h.S.power * ab.dmg * 0.6, hero: h, noFist: true };
      C.zone(run, z);
      h.facing = t.dir;
    },
    stretch_grab(run, h, ab, aim, am) {
      const dir = h.aimDir;
      const hits = inLine(run, h, dir, ab.range, 1.1).slice(0, am.multi ? 3 : 1);
      const reach = hits.length ? hits[hits.length - 1].along : ab.range;
      h.fists.push({ main: true, noHit: true, side: 0, x: h.x, z: h.z, dir, dist: 0, maxR: reach, speed: reach / 0.15, phase: 'out', t: 0, tick: 0, hit: new Set(), pierce: 0, linger: 0, mult: 0 });
      const front = { x: h.x + Math.sin(dir) * 1.8, z: h.z + Math.cos(dir) * 1.8 };
      run.later(0.15, () => {
        for (const { e } of hits) {
          if (e.dead) continue;
          if (!e.boss) { e.x = front.x + R.float(-0.3, 0.3); e.z = front.z + R.float(-0.3, 0.3); WG.resolve(run.train, e, e.r); }
          C.damage(run, e, h.S.power * ab.dmg, { hero: h, src: 'ability', meter: 1.5 });
          C.addStatus(run, e, 'stun', ab.stun, { hero: h });
        }
        if (am.multi && hits.length > 1) { aoe(run, h, front.x, front.z, 2.2, 1.2, { kb: 3 }); GF.ring(front.x, front.z, 2.2, '#f6b42a', 0.3); DT.sfx.play('punch'); }
      });
    },
    giant_jake(run, h, ab, aim, am) {
      h.buffs.giant = ab.dur + (am.dur || 0);
      h.giantStomp = !!am.stomp;
      say(run, h.x, h.z, 'Giant Jake!', 'crit');
      GF.ring(h.x, h.z, 3.5, '#f6b42a', 0.4); run.shake(0.2);
    },
    shape_shield(run, h, ab, aim, am) {
      h.buffs.shield = { hp: h.maxHp * 0.4 * (1 + h.S.abilityPower * 0.5), t: ab.dur, reflect: !!am.reflect, healEnd: !!am.healEnd };
      say(run, h.x, h.z, 'Shield!', 'heal');
    },
    bouncy_ball(run, h, ab, aim, am) {
      const dir = h.aimDir, dx = Math.sin(dir), dz = Math.cos(dir);
      const bounces = am.bounces || 0;
      const dur = 0.45 + bounces * 0.22;
      const hit = new Set();
      let nextBounce = 0.45;
      h.facing = dir; h.iframes = Math.max(h.iframes, dur); h.buffs.ball = dur;
      act(h, dur, () => {
        h.vx = dx * 20; h.vz = dz * 20;
        for (const e of C.enemiesNear(run, h.x, h.z, h.r + 0.6)) if (!hit.has(e)) { hit.add(e); C.damage(run, e, h.S.power * ab.dmg, { hero: h, src: 'ability', kb: 9, meter: 1.5 }); }
        run.smashAt(h.x, h.z, h.r + 0.4, 1);
        if (bounces && h.stateT >= nextBounce) { nextBounce += 0.22; aoe(run, h, h.x, h.z, 2.2, ab.dmg * 0.6, { kb: 5 }); GF.ring(h.x, h.z, 2.2, '#f6b42a', 0.25); run.shake(0.12); hit.clear(); }
      }, () => { h.buffs.ball = 0; });
    },
    copter_arms(run, h, ab, aim, am) {
      h.buffs.copter = ab.dur + (am.dur || 0);
      h.copterPull = !!am.pull;
      h.copterTick = 0;
      say(run, h.x, h.z, 'Wheee!', 'status');
    },
    fist_rain(run, h, ab, aim, am) {
      const t = reachPoint(run, h, ab.range);
      const n = ab.count + (am.count || 0);
      for (let i = 0; i < n; i++) {
        run.later((i / n) * 1.6, () => {
          const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * ab.radius;
          const p = { x: t.x + Math.cos(a) * d, z: t.z + Math.sin(a) * d };
          WG.resolve(run.train, p, 0.3);
          C.zone(run, { kind: 'slam', x: p.x, z: p.z, r: 1.6, size: 0.6, dur: 5, delay: 0.35, dmg: h.S.power * ab.dmg, hero: h });
        });
      }
    },
    stretchy_lasso(run, h, ab, aim, am) {
      const dir = h.aimDir;
      const front = { x: h.x + Math.sin(dir) * 1.8, z: h.z + Math.cos(dir) * 1.8 };
      const got = inCone(run, h, dir, ab.range, ab.arc);
      GF.swoosh(h.x, h.z, dir, ab.range, (ab.arc * Math.PI) / 180, '#f6b42a', 1.0);
      for (const e of got) { pullToward(e, front.x, front.z, Math.max(4, Math.hypot(e.x - front.x, e.z - front.z) / 0.25), 0.25); }
      run.later(0.26, () => { for (const e of got) if (!e.dead) { C.damage(run, e, h.S.power * ab.dmg, { hero: h, src: 'ability', meter: 1.2 }); C.addStatus(run, e, 'stun', ab.stun + (am.stun || 0), { hero: h }); } if (got.length) { GF.ring(front.x, front.z, 1.8, '#f6b42a', 0.3); DT.sfx.play('punch'); } });
    },
    doggy_howl(run, h, ab, aim, am) {
      for (const e of C.enemiesNear(run, h.x, h.z, ab.radius)) { e.fearAmp = 0.25 + (am.amp || 0); C.addStatus(run, e, 'fear', ab.dur + (am.dur || 0), { hero: h }); }
      GF.ring(h.x, h.z, ab.radius, '#b58bff', 0.5);
      say(run, h.x, h.z, 'AWOOOO!', 'crit');
      DT.sfx.play('scream');
    },

    /* ---------- item abilities ---------- */
    blood_rush(run, h, ab) {
      const dir = h.aimDir, hit = new Set();
      h.facing = dir; h.iframes = Math.max(h.iframes, 0.35);
      act(h, 0.3, () => {
        h.vx = Math.sin(dir) * (ab.range / 0.3); h.vz = Math.cos(dir) * (ab.range / 0.3);
        for (const e of C.enemiesNear(run, h.x, h.z, h.r + 1)) if (!hit.has(e)) { hit.add(e); C.damage(run, e, h.S.power * ab.dmg, { hero: h, src: 'ability', kb: 3 }); C.addStatus(run, e, 'burn', 3, { hero: h, dps: h.S.power * 0.5 }); C.healHero(run, h, h.maxHp * 0.04, { quiet: true }); }
        GF.burst(h.x, 0.8, h.z, '#c2213a', 2, 2, { dur: 0.3 });
      });
    },
    root_snare(run, h, ab) {
      aoe(run, h, h.x, h.z, ab.radius, ab.dmg, { root: ab.root });
      GF.ring(h.x, h.z, ab.radius, '#6b8f3a', 0.45);
      for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; GF.burst(h.x + Math.cos(a) * ab.radius * 0.7, 0.2, h.z + Math.sin(a) * ab.radius * 0.7, '#5ad05a', 3, 2, { dur: 0.5 }); }
    },
    grass_lash(run, h, ab) {
      const dir = h.aimDir;
      const front = { x: h.x + Math.sin(dir) * 1.6, z: h.z + Math.cos(dir) * 1.6 };
      GF.line({ x: h.x, y: 1, z: h.z }, { x: h.x + Math.sin(dir) * ab.range, y: 1, z: h.z + Math.cos(dir) * ab.range }, '#5ad05a', 0.3, 0.16);
      for (const { e } of inLine(run, h, dir, ab.range, 1.4)) { C.damage(run, e, h.S.power * ab.dmg, { hero: h, src: 'ability' }); pullToward(e, front.x, front.z, 14, 0.2); }
    },
    sword_storm(run, h, ab) { h.buffs.storm = ab.dur; h.stormT = 0; say(run, h.x, h.z, 'SWORD STORM!', 'crit'); },
    crystal_shell(run, h, ab) {
      h.buffs.invuln = ab.dur;
      const shell = new THREE.Mesh(GF.geo('ico', 1.2), GF.basic('#c9b8ff', { opacity: 0.35, add: true }));
      shell.position.y = 0.9;
      h.mesh.add(shell);
      run.later(ab.dur, () => { h.mesh.remove(shell); aoe(run, h, h.x, h.z, ab.radius, ab.dmg, { kb: 7 }); GF.burst(h.x, 1, h.z, '#c9b8ff', 20, 7, { size: 0.16 }); GF.ring(h.x, h.z, ab.radius, '#a98bff', 0.4); DT.sfx.play('shatter'); });
    },
    rocket_jump(run, h, ab) {
      const t = reachPoint(run, h, ab.range);
      leap(run, h, t, 0.5, 3.2, () => { aoe(run, h, h.x, h.z, ab.radius, ab.dmg, { kb: 8 }); GF.ring(h.x, h.z, ab.radius + 0.4, '#ff7a2e', 0.4); GF.burst(h.x, 0.4, h.z, '#ffae00', 16, 7); DT.sfx.play('explode'); run.shake(0.35); });
      GF.burst(h.x, 0.2, h.z, '#ffae00', 10, 4, { dur: 0.4 });
    },
    serenade(run, h, ab) {
      for (const e of C.enemiesNear(run, h.x, h.z, ab.radius)) C.addStatus(run, e, 'stun', ab.dur, { hero: h, quiet: true });
      C.healHero(run, h, h.maxHp * ab.heal);
      GF.ring(h.x, h.z, ab.radius, '#ff8fc7', 0.6);
      say(run, h.x, h.z, '♪ Zzz… ♪', 'status');
      DT.sfx.play('note');
    },
    axe_chop(run, h, ab) {
      const dir = h.aimDir;
      act(h, 0.35, () => {}, () => {
        for (const { e } of inLine(run, h, dir, ab.range, 2.4)) { C.damage(run, e, h.S.power * ab.dmg, { hero: h, src: 'ability', kb: 6 }); C.addStatus(run, e, 'stun', ab.stun, { hero: h }); }
        GF.telegraphRect(h.x, h.z, dir, ab.range, 2.4, 0.2, '#c2213a');
        run.smashAt(h.x + Math.sin(dir) * ab.range / 2, h.z + Math.cos(dir) * ab.range / 2, ab.range / 2, 2);
        run.shake(0.35); DT.sfx.play('explode');
      });
    },
    rock_out(run, h, ab) {
      for (let i = 0; i < 3; i++) run.later(i * 0.4, () => { if (h.ko) return; aoe(run, h, h.x, h.z, ab.radius, ab.dmg, { kb: 7 }); GF.ring(h.x, h.z, ab.radius, ['#ff5f6d', '#ffc93c', '#6ab7ff'][i], 0.35); DT.sfx.play('strum'); });
    },
    doom_blast(run, h, ab) {
      const dir = h.aimDir;
      for (const e of inCone(run, h, dir, ab.range, 70)) { C.damage(run, e, h.S.power * ab.dmg, { hero: h, src: 'ability', kb: 8 }); C.addStatus(run, e, 'freeze', ab.freeze, { hero: h }); }
      GF.swoosh(h.x, h.z, dir, ab.range, (70 * Math.PI) / 180, '#bfeeff', 1.0);
      run.shake(0.4); DT.sfx.play('freeze');
    },
    soul_suck(run, h, ab) {
      let tick = 0;
      act(h, ab.dur, (dt) => {
        for (const e of C.enemiesNear(run, h.x, h.z, ab.radius)) pullToward(e, h.x, h.z, 5, 0.05);
        if ((tick -= dt) <= 0) {
          tick = 0.25;
          for (const e of C.enemiesNear(run, h.x, h.z, ab.radius)) { const d = C.damage(run, e, h.S.power * ab.dmg, { hero: h, src: 'ability', meter: 0.4 }); C.healHero(run, h, d * 0.2, { quiet: true }); GF.line({ x: e.x, y: 1, z: e.z }, { x: h.x, y: 1.2, z: h.z }, '#ff4d6d', 0.2, 0.08); }
        }
      });
      GF.ring(h.x, h.z, ab.radius, '#ff4d6d', ab.dur);
    },
    frost_nova(run, h, ab) {
      aoe(run, h, h.x, h.z, ab.radius, ab.dmg, { freeze: ab.freeze });
      GF.ring(h.x, h.z, ab.radius, '#9fe3ff', 0.5);
      GF.burst(h.x, 0.6, h.z, '#e8fbff', 18, 7);
      DT.sfx.play('freeze');
    },
  };

  /* ---------- casting ---------- */
  A.cast = function (run, h, id, echo) {
    const ab = D.ABILITIES[id];
    if (!ab || !AB[id]) return false;
    const S = h.S, M = S.mods;
    const am = S.abMods[id] || {};
    if (!echo) {
      if ((h.cds[id] || 0) > 0) { if (h === run.local) run.hudNote(`${ab.name} recharges in ${Math.ceil(h.cds[id])}s`); return false; }
      if (h.state === 'ability' || h.state === 'dash' || h.state === 'super') return false;
    }
    if (h.aim) h.facing = h.aimDir;
    if (AB[id](run, h, ab, h.aim, am) === false) return false;
    if (!echo) {
      h.cds[id] = ab.cd * Math.max(0.25, 1 - S.cdr) * Math.max(0.2, 1 + (am.cdMult || 0));
      (h.cdMax || (h.cdMax = {}))[id] = h.cds[id];
      if (M.echoAbility && Math.random() < M.echoAbility) run.later(0.4, () => { if (!h.ko) { A.cast(run, h, id, true); say(run, h.x, h.z, 'Encore!', 'status'); } });
      if (M.castShield) h.buffs.shield = { hp: ((h.buffs.shield && h.buffs.shield.hp) || 0) + h.maxHp * M.castShield, t: 4 };
      if (M.castStun) for (const e of C.enemiesNear(run, h.x, h.z, M.castStun)) C.addStatus(run, e, 'stun', 0.5, { hero: h, quiet: true });
      if (M.wildMagic) wildMagic(run, h);
      run.stats.casts = (run.stats.casts || 0) + 1;
    }
    DT.sfx.play('ability');
    return true;
  };
  function wildMagic(run, h) {
    const el = R.pick(['fire', 'ice', 'shock']);
    const col = { fire: '#ff7a2e', ice: '#9fe3ff', shock: '#e8fbff' }[el];
    GF.ring(h.x, h.z, 3.5, col, 0.35);
    for (const e of C.enemiesNear(run, h.x, h.z, 3.5)) {
      C.damage(run, e, h.S.power * 0.8, { hero: h, src: 'proc', noProc: true, meter: 0.3 });
      if (el === 'fire') C.addStatus(run, e, 'burn', 3, { hero: h, dps: h.S.power * 0.4 });
      else if (el === 'ice') C.addStatus(run, e, 'chill', 2.5, { hero: h });
    }
    if (el === 'shock') { const e = C.nearestEnemy(run, h.x, h.z, 6); if (e) C.shock(run, h, e, h.S.power * 0.6, 3); }
  }
  C.castSlot = function (run, h, i) {
    const id = run.G.chars[h.id].bars[i];
    if (!id) { if (h === run.local) run.hudNote('No ability on that key. Bind one in Loadout → Abilities.'); return; }
    if (!h.S.abilities.some((a) => a.id === id)) return;
    A.cast(run, h, id, false);
  };
  A.parryCounter = function (run, h) {
    const { ab, am } = h.parryAb || { ab: D.ABILITIES.parry, am: {} };
    h.buffs.parry = 0;
    h.iframes = 0.5;
    aoe(run, h, h.x, h.z, ab.radius, ab.dmg * (1 + (am.dmg || 0)), { kb: 8 });
    if (am.heal) C.healHero(run, h, h.maxHp * am.heal);
    GF.swoosh(h.x, h.z, h.facing, ab.radius, Math.PI * 2 - 0.01, '#ffe066', 0.9);
    say(run, h.x, h.z, 'PARRY!', 'crit');
    run.hitstop(0.08);
    DT.sfx.play('crit');
  };

  /* ---------- MATHEMATICAL! supers ---------- */
  C.trySuper = function (run, h) {
    if (run.meter < 100 || run.superAct || h.state === 'ability') return;
    run.meter = 0;
    run.stats.supers += 1;
    run.banner('MATHEMATICAL!', 'super');
    DT.sfx.play('super');
    run.shake(0.4);
    if (h.id === 'jake') {
      h.buffs.mega = 7;
      say(run, h.x, h.z, 'MEGA JAKE!', 'crit');
      return;
    }
    h.state = 'super'; h.stateT = 0;
    let next = 0;
    run.superAct = {
      t: 0, dur: 4,
      update(dt) {
        this.t += dt;
        h.vx = h.vz = 0;
        if ((next -= dt) <= 0) {
          next = 0.3;
          const e = C.nearestEnemy(run, h.x, h.z, 14);
          if (e) {
            const dx = e.x - h.x, dz = e.z - h.z, d = Math.hypot(dx, dz) || 1;
            GF.line({ x: h.x, y: 1, z: h.z }, { x: e.x, y: 1, z: e.z }, '#ffe066', 0.25, 0.14);
            const to = WG.clampPath(run.train, h, { x: e.x - (dx / d) * 1.1, z: e.z - (dz / d) * 1.1 }, h.r);
            h.x = to.x; h.z = to.z;
            WG.resolve(run.train, h, h.r);
            h.facing = Math.atan2(dx, dz);
          }
          aoe(run, h, h.x, h.z, 2.6, 1.5, { src: 'super', kb: 6, meter: 0 });
          GF.swoosh(h.x, h.z, h.facing, 2.6, Math.PI * 2 - 0.01, '#ffe066', 0.9);
          DT.sfx.play('swing');
        }
        if (this.t >= this.dur) this.end();
      },
      end() {
        h.state = 'idle';
        aoe(run, h, h.x, h.z, 4.5, 2.0, { src: 'super', kb: 10, meter: 0 });
        GF.ring(h.x, h.z, 4.5, '#ffffff', 0.5);
        run.shake(0.4);
        run.superAct = null;
      },
    };
  };

  /* ---------- snacks ---------- */
  C.useBelt = function (run, h, i) {
    const belt = run.G.chars[h.id].belt;
    const st = belt[i];
    if (!st || i >= h.S.belt) return;
    const heal = 1 + h.S.healPower;
    let used = true;
    switch (st.base) {
      case 'bacon_pancakes': C.healHero(run, h, h.maxHp * 0.35 * heal); say(run, h.x, h.z, 'Makin’ bacon pancakes!', 'heal'); break;
      case 'burrito': C.healHero(run, h, h.maxHp * 0.6 * heal); break;
      case 'candy': h.buffs.candy = 8; say(run, h.x, h.z, 'Sugar rush!', 'status'); break;
      case 'ice_cream': for (const e of C.enemiesNear(run, h.x, h.z, 6)) C.addStatus(run, e, 'freeze', 2.5, { hero: h }); GF.ring(h.x, h.z, 6, '#9fe3ff', 0.4); DT.sfx.play('freeze'); break;
      case 'science_potion': h.buffs.potion = 10; say(run, h.x, h.z, 'SCIENCE!', 'crit'); break;
      case 'gunter_bomb': { const t = reachPoint(run, h, 10); C.zone(run, { kind: 'slam', x: t.x, z: t.z, r: 3, dur: 5, delay: 0.7, dmg: h.S.power * 3, hero: h, noFist: true, src: 'proc' }); say(run, h.x, h.z, 'Wenk!', 'status'); break; }
      case 'pocket_watch': run.windBack(0.15); say(run, h.x, h.z, 'Tick… tock… rewind!', 'status'); DT.sfx.play('tick'); break;
      case 'rainbow_flare': if (run.zones.some((z) => z.kind === 'flare')) { used = false; break; } C.zone(run, { kind: 'flare', x: h.x, z: h.z, r: 2.5, dur: 6 }); run.banner('Lady Rainicorn is coming! Stay close to the flare.', 'good'); break;
      case 'skeleton_key': run.hudNote('Keys open locked chests and vaults on their own. Just walk up and hold E.'); used = false; break;
      default: used = false;
    }
    if (used) {
      if (h.S.mods.snackDamage) h.buffs.snack = 6;
      st.qty -= 1; if (st.qty <= 0) belt[i] = null;
      DT.sfx.play('pickup');
    }
  };

  /* ---------- always-on effects ---------- */
  C.periodic = function (run, dt) {
    for (const h of run.heroes) {
      if (h.ko) continue;
      const M = h.S.mods, P = h.timers || (h.timers = {});
      if (M.pieHeal && (P.pie = (P.pie || 0) + dt) >= M.pieHeal) { P.pie = 0; C.healHero(run, h, h.maxHp * 0.15); say(run, h.x, h.z, 'Pie time!', 'heal'); }
      if (M.bmoDrone) {
        if (!h.drones) { h.drones = []; for (let i = 0; i < M.bmoDrone; i++) { const m = MD.prop('crate', { size: 0.3 }); m.children.forEach((c) => { if (c.material && !c.userData.outline) c.material = GF.mat('#5ec7b5'); }); GF.scene.add(m); h.drones.push(m); } }
        h.drones.forEach((m, i) => { const a = run.time * 1.5 + (i * Math.PI * 2) / h.drones.length; m.position.set(h.x + Math.cos(a) * 1.4, 2.0 + Math.sin(run.time * 3 + i) * 0.15, h.z + Math.sin(a) * 1.4); });
        if ((P.bmo = (P.bmo || 0) + dt) >= 1) {
          P.bmo = 0;
          for (const m of h.drones) { const e = C.nearestEnemy(run, m.position.x, m.position.z, 11); if (e) C.fire(run, { owner: 'hero', hero: h, x: m.position.x, z: m.position.z, y: 2.0, dir: Math.atan2(e.x - m.position.x, e.z - m.position.z), speed: 17, dmg: h.S.power * (M.droneDmg || 0.6), r: 0.45, life: 1, color: '#7cffb2', size: 0.18, meter: 0.4, src: 'proc', noProc: true }); }
        }
      }
      if (M.iceBolts && (P.ice = (P.ice || 0) + dt) >= M.iceBolts) { const e = C.nearestEnemy(run, h.x, h.z, 12); if (e) { P.ice = 0; C.fire(run, { owner: 'hero', hero: h, x: h.x, z: h.z, dir: Math.atan2(e.x - h.x, e.z - h.z), speed: 16, dmg: h.S.power * (M.boltDmg || 0.7), r: 0.45, life: 1, color: '#9fe3ff', size: 0.28, chill: true, meter: 0.4, src: 'proc', noProc: true }); } }
      if (M.burnAura && (P.aura = (P.aura || 0) + dt) >= 1) { P.aura = 0; for (const e of C.enemiesNear(run, h.x, h.z, 2.6)) { C.damage(run, e, h.S.power * M.burnAura, { hero: h, src: 'proc', noCrit: true, noProc: true, meter: 0.2 }); C.addStatus(run, e, 'burn', 2, { hero: h, dps: h.S.power * 0.2 }); } GF.ring(h.x, h.z, 2.6, '#ff7a2e', 0.3); }
      if (M.lichDrain && run.inCombat && h.hp > 1) h.hp = Math.max(1, h.hp - h.maxHp * M.lichDrain * dt);
      if (h.buffs.copter > 0 && (h.copterTick = (h.copterTick || 0) - dt) <= 0) {
        h.copterTick = 0.25;
        const ab = D.ABILITIES.copter_arms;
        if (h.copterPull) for (const e of C.enemiesNear(run, h.x, h.z, ab.radius + 3)) { const dx = h.x - e.x, dz = h.z - e.z, d = Math.hypot(dx, dz) || 1; if (!e.boss && d > 1.2) e.pull = { x: (dx / d) * 6, z: (dz / d) * 6, t: 0.25 }; }
        for (const e of C.enemiesNear(run, h.x, h.z, ab.radius)) C.damage(run, e, h.S.power * ab.dmg, { hero: h, src: 'ability', kb: 3, meter: 0.4 });
        run.smashAt(h.x, h.z, ab.radius, 1);
      }
      const moving = Math.hypot(h.vx, h.vz) > 1;
      if (((h.buffs.giant > 0 && h.giantStomp) || h.buffs.mega > 0) && moving && (P.stomp = (P.stomp || 0) - dt) <= 0) {
        P.stomp = h.buffs.mega > 0 ? 0.6 : 0.5;
        const r = h.buffs.mega > 0 ? 2.8 : 2.4;
        for (const e of C.enemiesNear(run, h.x, h.z, r)) C.damage(run, e, h.S.power * (h.buffs.mega > 0 ? 0.5 : 0.4), { hero: h, src: h.buffs.mega > 0 ? 'super' : 'ability', kb: 4, meter: 0.2 });
        GF.ring(h.x, h.z, r, '#f6b42a', 0.25); run.shake(0.08);
      }
      if (h.buffs.storm > 0 && (h.stormT = (h.stormT || 0) - dt) <= 0) { h.stormT = 0.35; for (let i = 0; i < 8; i++) C.swordBeam(run, h, D.ABILITIES.sword_storm.dmg, (i / 8) * Math.PI * 2 + run.time, 'ability'); }
    }
  };
  A.cleanup = function (run) { for (const h of run.heroes) if (h.drones) { for (const m of h.drones) GF.scene.remove(m); h.drones = null; } };

  A.AB = AB;
  DT.game.abilities = A;
})();
