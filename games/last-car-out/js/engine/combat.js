/* Turn-based combat. All state lives in G.raid.combat (plain data, serializable).
   api(G) builds the combat API "C" that abilities, relics and skill hooks call into. */
(function () {
  'use strict';
  const D = LCO.data;
  const R = LCO.R;
  const U = LCO.U;
  const ENG = LCO.engine;
  const DEBUFFS = ['bleed', 'burn', 'corrupt', 'stun', 'chill', 'weak', 'exposed'];

  /* ---------- spawning ---------- */
  function spawn(id, tier, depthF, o) {
    o = o || {};
    const def = D.ENEMIES[id];
    const asc = o.asc || 0;
    let hpF = def.fixed ? 1 : (1 + 0.45 * (tier - 1)) * (1 + 0.2 * (depthF || 0));
    let dmgF = def.fixed ? 1 : 1.12 * (1 + 0.33 * (tier - 1)) * (1 + 0.15 * (depthF || 0));
    hpF *= 1 + 0.1 * asc;
    dmgF *= 1 + 0.08 * asc;
    if (o.mod === 'red_signal') dmgF *= 1.2;
    const promoted = !!(o.promote && !def.elite && !def.boss);
    if (promoted) { hpF *= 1.8; dmgF *= 1.2; }
    const hp = Math.round(R.int(def.hp[0], def.hp[1]) * hpF);
    const avg = (def.hp[0] + def.hp[1]) / 2;
    const xp = Math.round((avg * 0.5 + 5) * (1 + 0.35 * (tier - 1)) * (def.elite || promoted ? 2.5 : 1) * (def.boss ? 6 : 1));
    return {
      uid: U.uid('e'), id, name: (promoted ? 'Hulking ' : '') + def.name, hp, maxHp: hp, block: 0, armor: def.armor || 0,
      st: {}, intent: null, charging: null, fleeing: false, fled: false, stolen: [], stolenTickets: 0,
      hpF, dmgF, xp, elite: !!(def.elite || promoted), boss: !!def.boss, hunter: !!def.hunter,
      peaceful: (def.tags || []).includes('peaceful'), enraged: false, acted: false, lastMove: null, spawnedThisTurn: false,
    };
  }

  /* ---------- the combat API ---------- */
  function api(G) {
    const raid = G.raid;
    const cb = raid.combat;
    const S = ENG.stats.compute(G);
    cb.p.maxHp = S.maxHp;
    if (cb.p.hp > S.maxHp) cb.p.hp = S.maxHp;
    const C = { G, raid, cb, p: cb.p, enemies: cb.enemies, S, tier: raid.car.tier, L: G.level, mod: raid.car.mod };

    C.log = (t, cls) => { cb.log.push({ t, cls: cls || '' }); if (cb.log.length > 120) cb.log.shift(); };
    C.alive = () => cb.enemies.filter((e) => e.hp > 0 && !e.fled);
    C.flag = (k) => S.flags[k];
    C.spell = (n) => ENG.stats.spell(n, S);
    C.once = (k) => { if (cb.p.fightFlags[k]) return false; cb.p.fightFlags[k] = true; return true; };
    C.turnOnce = (k) => { if (cb.p.turnFlags[k]) return false; cb.p.turnFlags[k] = true; return true; };
    C.raidOnce = (k) => { raid.once = raid.once || {}; if (raid.once[k]) return false; raid.once[k] = true; return true; };
    C.randomEnemy = (exclude) => { const l = C.alive().filter((e) => e !== exclude); return l.length ? R.pick(l) : null; };
    C.gainFocus = (n) => { cb.p.focus = Math.min(S.maxFocus, cb.p.focus + n); };
    C.gainAp = (n) => { cb.p.ap += n; };
    C.gainGuard = (n) => { cb.p.guard += Math.max(0, Math.round(n)); };
    C.adjustInstability = (d) => { raid.instability = Math.max(0, raid.instability + d); };
    C.numberDelta = (d) => ENG.changeNumber(G, d, 'Fight', S);
    C.summon = (s) => { cb.p.summons.push(Object.assign({ uid: U.uid('s') }, s)); C.log(`${s.name} joins the fight.`, 'good'); };
    C.reduceCooldowns = (n, except) => { for (const k in cb.p.cds) if (k !== except) cb.p.cds[k] = Math.max(0, cb.p.cds[k] - n); };
    C.clear = (t, id) => { delete t.st[id]; };
    C.cleanse = (count) => {
      let n = 0;
      for (const id of DEBUFFS) { if (n >= count) break; if (cb.p.st[id]) { delete cb.p.st[id]; n++; } }
      if (n) C.log('You shake off a debuff.', 'good');
    };
    C.heal = (n) => {
      if (!(n > 0) || cb.p.hp <= 0) return 0;
      let amt = n * (1 + (S.healBonus || 0));
      if (cb.p.st.burn) amt *= 0.5;
      const before = cb.p.hp;
      cb.p.hp = Math.min(cb.p.maxHp, cb.p.hp + Math.round(amt));
      return cb.p.hp - before;
    };
    C.fire = (name, a, b) => {
      const list = S.hooks[name];
      if (!list) return;
      for (const h of list) { try { h.fn(C, a, b); } catch (err) { console.error('hook failed', h.src, err); } }
    };
    C.fireLethal = () => {
      const list = S.hooks.onLethal || [];
      for (const h of list) { try { if (h.fn(C)) return true; } catch (err) { console.error('hook failed', h.src, err); } }
      return false;
    };
    C.addStatus = (t, id, n) => addStatus(C, t, id, n);
    C.damage = (t, amount, o) => damage(C, t, amount, o);
    C.strike = (t, mult, o) => strike(C, t, mult, o);
    return C;
  }

  function addStatus(C, t, id, n) {
    n = Math.round(n || 0);
    if (n <= 0 || !t || t.hp <= 0) return false;
    const def = D.STATUSES[id];
    if (!def) return false;
    const isP = t === C.p;
    if (isP && def.kind === 'debuff') {
      if ((id === 'stun' && C.S.flags.stunImmune) || (id === 'weak' && C.S.flags.weakImmune) || (id === 'corrupt' && C.S.flags.corruptImmune)) { C.log(`You are immune to ${def.name}.`, 'good'); return false; }
      if (Math.random() < C.S.statusResist) { C.log(`You resist ${def.name}.`, 'good'); return false; }
    }
    if (!isP && id === 'corrupt' && C.S.flags.corruptBonus) n += C.S.flags.corruptBonus;
    if (!isP && id === 'stun' && t.boss && Math.random() < 0.5) { C.log(`${t.name} shrugs off the stun.`); return false; }
    t.st[id] = Math.min(99, (t.st[id] || 0) + n);
    if (id === 'chill' && t.st.chill >= 3) {
      t.st.chill = 0;
      delete t.st.chill;
      if (!(isP && C.S.flags.stunImmune)) {
        t.st.stun = (t.st.stun || 0) + 1;
        C.log(isP ? 'You are Chromed solid!' : `${t.name} is Chromed solid!`, isP ? 'bad' : 'good');
      }
    }
    return true;
  }

  /* Player (or player-side effect) damages an enemy. */
  function damage(C, t, amount, o) {
    o = o || {};
    const { cb, S, p } = C;
    const res = { dealt: 0, killed: false, blocked: 0, missed: false, crit: !!o.crit };
    if (!t || t.hp <= 0 || t.fled) return res;
    let dmg = amount;
    const direct = o.src === 'strike' || o.src === 'ability' || o.src === 'power' || o.src === 'summon';
    if (direct) {
      if (t.st.mirror > 0 && (o.src === 'strike' || o.src === 'ability')) {
        t.st.mirror -= 1;
        if (!t.st.mirror) delete t.st.mirror;
        C.log(`You hit ${t.name}'s reflection. It shatters harmlessly.`);
        res.missed = true;
        return res;
      }
      let m = 1;
      const frac = p.hp / p.maxHp;
      if (S.flags.berserk && frac < 0.5) m += 0.15 * S.flags.berserk;
      if (p.st.empower) m += 0.3;
      if (p.st.primal) m += 0.5;
      if (S.flags.lastCarOut && C.raid.instability >= 100) m += 0.4;
      if (S.flags.opportunist && DEBUFFS.some((k) => t.st[k] > 0)) m += S.flags.opportunist;
      if (S.flags.backstab && (t.st.stun > 0 || t.charging)) m += S.flags.backstab;
      if (S.flags.bullyBonus && (t.st.weak > 0 || t.st.stun > 0)) m += S.flags.bullyBonus;
      if (S.flags.chilledBonus && t.st.chill > 0) m += S.flags.chilledBonus;
      if (p.st.weak) m *= 0.75;
      if (p.st.chill) m *= Math.max(0.5, 1 - 0.1 * p.st.chill);
      dmg *= m;
      if (o.src === 'ability' && S.flags.abilityCrit && !o.noCrit && Math.random() < S.critChance + S.flags.abilityCrit) {
        dmg *= S.critDmg;
        res.crit = true;
      }
      if (t.st.exposed) dmg *= 1.25;
    }
    if (t.armor && o.src !== 'dot' && !o.ignoreArmor) dmg *= 1 - t.armor;
    dmg = Math.max(0, Math.round(dmg));
    if (t.block > 0 && !o.ignoreBlock && o.src !== 'dot') {
      const b = Math.min(t.block, dmg);
      t.block -= b;
      dmg -= b;
      res.blocked = b;
    }
    t.hp -= dmg;
    res.dealt = dmg;
    cb.stats.dealt += dmg;
    const lbl = o.label ? o.label + ': ' : '';
    C.log(`${lbl}${t.name} takes ${dmg}${res.crit ? ' — critical!' : ''}${res.blocked ? ` (${res.blocked} blocked)` : ''}.`, res.crit ? 'crit' : o.src === 'dot' ? 'dot' : '');
    if (p.st.eclipse && (o.src === 'strike' || o.src === 'ability') && dmg > 0 && t.hp > 0) addStatus(C, t, 'corrupt', Math.max(1, Math.round(dmg * 0.25)));
    if (o.src === 'dot' && o.dot === 'corrupt' && S.flags.corruptLeech && dmg > 0) C.heal(Math.round(dmg * S.flags.corruptLeech));
    const def = D.ENEMIES[t.id];
    if (t.hp > 0 && def && def.enrage && !t.enraged && t.hp < t.maxHp * def.enrage) {
      t.enraged = true;
      C.log(`${t.name} flickers with fury. Its attacks grow heavier!`, 'bad');
    }
    if (t.hp <= 0) {
      t.hp = 0;
      res.killed = true;
      onEnemyDeath(C, t);
    }
    return res;
  }

  function onEnemyDeath(C, t) {
    const { cb, raid, G, S } = C;
    C.log(`${t.name} is defeated.`, 'good');
    cb.rewards.xp += t.xp;
    G.stats.kills += 1;
    G.codex.enemies[t.id] = (G.codex.enemies[t.id] || 0) + 1;
    if (t.elite) { raid.flags.eliteKilled = true; G.stats.elites += 1; }
    if (t.boss) raid.flags['boss_' + t.id] = true;
    if (t.peaceful) { raid.flags.killedPeaceful = true; if (ENG.changeNumber(G, 1, 'Killed a peaceful denizen', S)) C.log('It never wanted to fight. Your Number rises by 1.', 'bad'); }
    if (t.stolen.length || t.stolenTickets) {
      cb.rewards.items.push(...t.stolen);
      cb.rewards.tickets += t.stolenTickets;
      t.stolen = [];
      t.stolenTickets = 0;
      C.log('You get back what it stole.', 'good');
    }
    const drops = ENG.loot.enemyDrops(t, C.tier, S, C.mod);
    cb.rewards.items.push(...drops.items);
    cb.rewards.tickets += drops.tickets;
    cb.rewards.scrap += drops.scrap;
    if (S.flags.spreadRot && t.st.corrupt > 0) {
      const n = Math.max(1, Math.round(t.st.corrupt * Math.min(1, S.flags.spreadRot)));
      for (const e of C.alive()) addStatus(C, e, 'corrupt', n);
    }
    if (S.flags.killRefundAp && C.turnOnce('killRefund')) C.gainAp(S.flags.killRefundAp);
    C.fire('onKill', t);
  }

  /* A weapon Strike (also used by abilities that "Strike"). */
  function strike(C, t, mult, o) {
    o = o || {};
    const { S, p } = C;
    const W = S.weapon;
    const out = { dmg: 0, crit: false, killed: false };
    if (!t || t.hp <= 0 || t.fled) return out;
    const hits = W.hits || 1;
    for (let h = 0; h < hits; h++) {
      if (t.hp <= 0 || t.fled) break;
      if (C.mod === 'deep_pit' && Math.random() < 0.15) { C.log(`${t.name} slips aside.`); continue; }
      let base = R.int(W.min, W.max) * (1 + S.dmgPct) + S.dmgFlat + (p.st.strength || 0);
      base *= mult;
      if (W.props.firstStrike && p.strikesFight === 0) base *= 1 + W.props.firstStrike;
      if (S.flags.momentum && p.strikesTurn > 0) base *= 1 + S.flags.momentum * p.strikesTurn;
      if (S.flags.spikeStacking) base *= 1 + S.flags.spikeStacking * p.strikesFight;
      if (S.flags.shatterStunned && t.st.stun > 0) base *= 2;
      const critChance = S.critChance + (C.mod === 'resonant' ? 0.1 : 0);
      const crit = p.nextCrit || Math.random() < critChance;
      if (crit) base *= S.critDmg + (C.mod === 'resonant' ? 0.5 : 0);
      p.nextCrit = false;
      const res = damage(C, t, Math.round(base), { src: 'strike', crit, ignoreBlock: W.props.ignoreBlock, label: o.label });
      p.strikesTurn += 1;
      p.strikesFight += 1;
      if (res.missed) continue;
      out.dmg += res.dealt;
      out.crit = out.crit || crit;
      if (crit && S.flags.glassFang && t.hp > 0) damage(C, t, Math.round((t.maxHp * S.flags.glassFang) / (t.boss ? 3 : 1)), { src: 'power', label: 'Glass Fang', ignoreBlock: true });
      if (S.lifesteal && res.dealt) C.heal(Math.round(res.dealt * S.lifesteal));
      if (t.hp > 0) {
        const bleedC = (S.bleedChance || 0) + (W.props.bleedChance || 0);
        if (bleedC && Math.random() < bleedC) addStatus(C, t, 'bleed', 2);
        if (p.st.primal) addStatus(C, t, 'bleed', 2);
        const stunC = (W.props.stunChance || 0) + (S.flags.extraStun || 0);
        if (stunC && Math.random() < stunC && addStatus(C, t, 'stun', 1)) C.log(`${t.name} is Stunned.`, 'good');
        if (W.props.corruptOnHit) addStatus(C, t, 'corrupt', W.props.corruptOnHit);
      }
      const hit = { dmg: res.dealt, crit, killed: t.hp <= 0 };
      C.fire('onStrike', t, hit);
      if (crit) C.fire('onCrit', t, hit);
      if (p.double && p.double.turns > 0 && !o.echo) {
        const tgt = t.hp > 0 ? t : C.randomEnemy();
        if (tgt) damage(C, tgt, Math.round(base * p.double.mult), { src: 'power', label: 'Your reflection' });
      }
      const cleave = S.flags.cleaveFull ? 1 : W.props.cleave || 0;
      if (cleave && !o.noCleave) for (const e of C.alive()) if (e !== t) damage(C, e, Math.round(base * cleave), { src: 'power', label: 'Cleave' });
    }
    out.killed = t.hp <= 0;
    return out;
  }

  ENG.combat = { spawn, api, addStatus, damage, strike, DEBUFFS };
})();

/* ---------- combat flow: turns, enemy AI, player actions ---------- */
(function () {
  'use strict';
  const D = LCO.data;
  const R = LCO.R;
  const U = LCO.U;
  const ENG = LCO.engine;
  const CB = ENG.combat;
  const { api, addStatus, damage } = CB;

  function checkLethal(C) {
    if (C.p.hp > 0) return false;
    if (C.fireLethal()) { if (C.p.hp <= 0) C.p.hp = 1; return false; }
    C.p.hp = 0;
    C.cb.over = 'lost';
    C.log('You fall.', 'bad');
    return true;
  }

  function dotOnPlayer(C, n, id) {
    let d = n;
    if (C.p.st.ward) d *= 0.5;
    if (C.p.st.eclipse) d *= 0.5;
    d = Math.max(1, Math.round(d));
    C.p.hp -= d;
    C.log(`${D.STATUSES[id].name} deals ${d} to you.`, 'bad');
    checkLethal(C);
  }

  function tickStart(C, u) {
    const isP = u === C.p;
    for (const id of Object.keys(u.st)) {
      if (C.cb.over || u.hp <= 0) return;
      const def = D.STATUSES[id];
      const n = u.st[id];
      if (!def || !n) { delete u.st[id]; continue; }
      if (def.decay === 'dot1') {
        if (isP) dotOnPlayer(C, n, id); else damage(C, u, n, { src: 'dot', dot: id, label: def.name });
        u.st[id] = n - 1;
      } else if (def.decay === 'grow') {
        const ticks = !isP && C.p.st.eclipse ? 2 : 1;
        for (let i = 0; i < ticks && u.hp > 0; i++) {
          if (isP) dotOnPlayer(C, u.st[id], id); else damage(C, u, u.st[id], { src: 'dot', dot: id, label: def.name });
        }
        u.st[id] = Math.min(99, u.st[id] + (isP ? 1 : 1 + (C.S.flags.festering || 0)));
      } else if (def.decay === 'heal1') {
        if (isP) C.heal(n); else u.hp = Math.min(u.maxHp, u.hp + n);
        u.st[id] = n - 1;
      } else if (def.decay === 'start') {
        u.st[id] = n - 1;
      }
      if (u.st[id] !== undefined && u.st[id] <= 0) delete u.st[id];
    }
  }
  function tickEnd(C, u) {
    for (const id of Object.keys(u.st)) {
      const def = D.STATUSES[id];
      if (def && def.decay === 'end') {
        u.st[id] -= 1;
        if (u.st[id] <= 0) delete u.st[id];
      }
    }
  }

  function enemyHitRange(C, e, m) {
    const f = (v) => {
      let x = v * e.dmgF + (e.st.strength || 0);
      if (e.st.weak) x *= 0.75;
      if (e.st.chill) x *= Math.max(0.5, 1 - 0.1 * e.st.chill);
      if (e.enraged) x *= 1.3;
      if (C.raid.instability >= 75) x *= 1.15;
      return x;
    };
    return [f(m.dmg[0]), f(m.dmg[1])];
  }

  /* Estimate the damage the player would actually take, for intent previews. */
  function mitigate(C, raw) {
    const { S, p } = C;
    let d = raw * (1 + (S.dmgTaken || 0));
    if (p.st.exposed) d *= 1.25;
    if (S.flags.enemyDmgReduce) d *= 1 - S.flags.enemyDmgReduce;
    if (p.st.ward) d *= 0.5;
    if (p.st.eclipse) d *= 0.5;
    const frac = p.hp / p.maxHp;
    if (S.flags.berserk && frac < 0.5) d *= 1 - 0.1 * S.flags.berserk;
    if (S.flags.tarSkin && frac <= 0.35) d *= 1 - S.flags.tarSkin;
    d *= 1 - ENG.stats.armorReduction(S.armor);
    return Math.max(1, Math.round(d));
  }

  function hitPlayer(C, e, raw) {
    const { p, S } = C;
    if (p.st.mirror > 0) {
      p.st.mirror -= 1;
      if (!p.st.mirror) delete p.st.mirror;
      C.log(`${e.name}'s attack shatters one of your Mirror Images.`, 'good');
      if (S.flags.mirrorRetaliate && e.hp > 0) damage(C, e, Math.round(((S.weapon.min + S.weapon.max) / 2) * (1 + S.dmgPct)), { src: 'power', label: 'Mirror shards' });
      C.fire('onDodge', e);
      return { dodged: true, dealt: 0 };
    }
    const dodge = S.flags.noDodge ? 0 : S.dodge + (C.mod === 'deep_pit' ? 0.15 : 0);
    if (Math.random() < dodge || (p.st.hidden && Math.random() < 0.5)) {
      C.log(`You slip past ${e.name}'s attack.`, 'good');
      C.fire('onDodge', e);
      return { dodged: true, dealt: 0 };
    }
    let raw2 = raw;
    if (C.mod === 'resonant' && Math.random() < 0.15) { raw2 *= 1.75; C.log(`${e.name} lands a ringing critical!`, 'bad'); }
    let dmg = mitigate(C, raw2);
    if (p.guard > 0) {
      const b = Math.min(p.guard, dmg);
      p.guard -= b;
      dmg -= b;
      if (b) C.log(`Your guard soaks up ${b}.`);
    }
    p.hp -= dmg;
    C.cb.stats.taken += dmg;
    if (dmg > 0) C.log(`${e.name} hits you for ${dmg}.`, 'bad');
    const thorns = (S.thorns || 0) + (p.st.thorns || 0);
    if (thorns && e.hp > 0) damage(C, e, thorns, { src: 'thorns', label: 'Thorns' });
    if (dmg > 0) C.fire('onTakeDamage', e, dmg);
    if (p.braceCounter && e.hp > 0 && p.hp > 0) {
      p.braceCounter = false;
      C.log('You counter!', 'good');
      CB.strike(C, e, 1, { noCleave: true, label: 'Counter' });
    }
    checkLethal(C);
    return { dodged: false, dealt: dmg };
  }

  function applyToPlayer(C, e, id, n) {
    if (C.S.flags.reflectDebuff && Math.random() < C.S.flags.reflectDebuff) {
      if (addStatus(C, e, id, n)) C.log(`You bounce ${D.STATUSES[id].name} back onto ${e.name}.`, 'good');
      return;
    }
    if (addStatus(C, C.p, id, n)) C.log(`${e.name} inflicts ${D.STATUSES[id].name} ${n}.`, 'bad');
  }

  function actSummons(C) {
    const p = C.p;
    const mult = C.S.flags.summonDouble ? 2 : 1;
    for (const s of p.summons) {
      if (s.turns <= 0 || C.cb.over) continue;
      if (s.id === 'oneone') {
        s.phase = (s.phase || 0) + 1;
        if (s.phase % 2 === 1) {
          C.heal(Math.round(p.maxHp * 0.12));
          C.gainGuard(Math.round(p.maxHp * 0.08));
          C.log('Glad-One beams at you. You feel better!', 'good');
        } else {
          C.log('Sad-One sighs a storm cloud over the room.', '');
          for (const e of C.alive()) { damage(C, e, s.dmg * mult, { src: 'summon', label: 'Gloom' }); if (e.hp > 0) addStatus(C, e, 'weak', 1); }
        }
      } else {
        const t = C.randomEnemy();
        if (t) damage(C, t, s.dmg * mult, { src: 'summon', label: s.name });
      }
      s.turns -= 1;
    }
    p.summons = p.summons.filter((s) => s.turns > 0);
  }

  /* ---------- enemy AI ---------- */
  function chooseIntent(C, e) {
    const def = D.ENEMIES[e.id];
    if (e.fleeing) { e.intent = { t: 'flee' }; return; }
    if (e.charging) { e.intent = Object.assign({ charged: true }, e.charging); return; }
    const alive = C.alive();
    let opts = def.moves.filter((m) => {
      if (m.t === 'summon') return alive.length < 4;
      if (m.t === 'heal') return (m.target === 'self' ? [e] : alive).some((a) => a.hp < a.maxHp * 0.7);
      if (m.t === 'steal') return C.raid.backpack.length > 0 || C.raid.carry.tickets > 0;
      if (m.t === 'mirror') return !(e.st.mirror > 0);
      if (m.t === 'buff' && m.target === 'self' && (e.st.strength || 0) >= 6) return false;
      if (m.t === 'number') return !C.S.flags.numberLock;
      return true;
    });
    if (!opts.length) opts = def.moves.filter((m) => m.t === 'attack');
    if (!opts.length) opts = [{ t: 'block', v: 4, w: 1 }];
    let m = R.weighted(opts.map((x) => [x.w || 1, x]));
    if (e.lastMove && m.t !== 'attack' && m.t === e.lastMove) {
      const other = opts.filter((x) => x.t !== m.t);
      if (other.length) m = R.weighted(other.map((x) => [x.w || 1, x]));
    }
    e.intent = U.clone(m);
  }

  function execIntent(C, e) {
    const m = e.intent;
    if (!m) return;
    e.acted = true;
    e.lastMove = m.t;
    const jam = C.S.flags.jammer || 0;
    if (jam && (m.t === 'buff' || m.t === 'summon' || m.t === 'charge') && Math.random() < jam) {
      C.log(`Your jammer scrambles ${e.name}'s signal.`, 'good');
      return;
    }
    switch (m.t) {
      case 'attack': {
        if (m.charged) e.charging = null;
        if (m.name) C.log(`${e.name} unleashes ${m.name}!`, 'bad');
        const hits = m.hits || 1;
        for (let h = 0; h < hits; h++) {
          if (C.p.hp <= 0 || e.hp <= 0 || C.cb.over) break;
          const [a, b] = enemyHitRange(C, e, m);
          const r = hitPlayer(C, e, R.float(a, b));
          if (r.dealt && m.status && !C.cb.over) applyToPlayer(C, e, m.status[0], m.status[1]);
          if (r.dealt && m.leech && e.hp > 0) { e.hp = Math.min(e.maxHp, e.hp + r.dealt); C.log(`${e.name} drinks deep and heals ${r.dealt}.`, 'bad'); }
        }
        break;
      }
      case 'block': e.block += Math.round(m.v * e.dmgF); C.log(`${e.name} braces (Block ${e.block}).`); break;
      case 'buff': {
        const tg = m.target === 'allies' ? C.alive() : [e];
        for (const t of tg) addStatus(C, t, m.status[0], m.status[1]);
        C.log(`${e.name} ${m.target === 'allies' ? 'rallies the others' : 'powers up'} (${D.STATUSES[m.status[0]].name} ${m.status[1]}).`, 'bad');
        break;
      }
      case 'debuff': applyToPlayer(C, e, m.status[0], m.status[1]); break;
      case 'heal': {
        const pool = m.target === 'self' ? [e] : C.alive();
        const t = pool.slice().sort((x, y) => x.hp / x.maxHp - y.hp / y.maxHp)[0];
        if (t) { const amt = Math.round(m.v * e.hpF); t.hp = Math.min(t.maxHp, t.hp + amt); C.log(`${e.name} mends ${t === e ? 'itself' : t.name} for ${amt}.`, 'bad'); }
        break;
      }
      case 'summon': {
        if (C.alive().length >= 4) break;
        const n = CB.spawn(m.id, C.tier, 0, { mod: C.mod, asc: C.G.ascension });
        n.spawnedThisTurn = true;
        C.cb.enemies.push(n);
        chooseIntent(C, n);
        C.log(`${e.name} calls for help — ${n.name} arrives!`, 'bad');
        break;
      }
      case 'charge': e.charging = U.clone(m.next); C.log(`${e.name} winds up ${m.next.name}…`, 'bad'); break;
      case 'steal': {
        const bp = C.raid.backpack;
        if (bp.length) {
          const it = bp.splice(R.int(0, bp.length - 1), 1)[0];
          e.stolen.push(it);
          e.fleeing = true;
          C.log(`${e.name} snatches your ${it.name}! Stop it before it runs.`, 'bad');
        } else if (C.raid.carry.tickets > 0) {
          const amt = Math.ceil(C.raid.carry.tickets * 0.3);
          C.raid.carry.tickets -= amt;
          e.stolenTickets += amt;
          e.fleeing = true;
          C.log(`${e.name} lifts ${amt} Tickets from your pocket!`, 'bad');
        } else {
          C.log(`${e.name} rummages through your empty pockets, disappointed.`);
        }
        break;
      }
      case 'flee':
        e.fled = true;
        C.log(`${e.name} escapes${e.stolen.length ? ' with your ' + e.stolen.map((i) => i.name).join(', ') : e.stolenTickets ? ` with ${e.stolenTickets} Tickets` : ''}!`, 'bad');
        break;
      case 'drain': C.p.focus = Math.max(0, C.p.focus - m.v); C.log(`${e.name} drains ${m.v} Focus.`, 'bad'); break;
      case 'number': if (ENG.changeNumber(C.G, 1, `${e.name} audited you`, C.S)) C.log(`${e.name} adds a tally to your palm. Number +1.`, 'bad'); break;
      case 'mirror': addStatus(C, e, 'mirror', 1); C.log(`${e.name} splits off a reflection.`); break;
      default: break;
    }
  }

  function enemyPhase(C) {
    for (const e of C.cb.enemies.slice()) {
      if (C.cb.over) return;
      if (e.hp <= 0 || e.fled || e.spawnedThisTurn) continue;
      e.block = 0;
      tickStart(C, e);
      if (e.hp <= 0) continue;
      if (e.st.stun > 0) {
        e.st.stun -= 1;
        if (!e.st.stun) delete e.st.stun;
        C.log(`${e.name} is stunned and can't act.`);
        tickEnd(C, e);
        continue;
      }
      execIntent(C, e);
      if (C.cb.over) return;
      tickEnd(C, e);
      if (!C.alive().length) break;
    }
    for (const e of C.alive()) {
      e.spawnedThisTurn = false;
      if (e.acted || !e.intent) chooseIntent(C, e);
      e.acted = false;
    }
  }

  /* ---------- turn structure ---------- */
  function startPlayerTurn(C, first) {
    const { p, S, cb } = C;
    p.turn = cb.turn;
    p.guard = 0;
    p.braceCounter = false;
    p.strikesTurn = 0;
    p.turnFlags = {};
    tickStart(C, p);
    if (checkEnd(C)) return;
    let skip = false;
    if (p.st.stun > 0) {
      p.st.stun -= 1;
      if (!p.st.stun) delete p.st.stun;
      skip = true;
      C.log('You are stunned and lose your turn!', 'bad');
    }
    const collapse = S.flags.lastCarOut && C.raid.instability >= 100 ? 1 : 0;
    p.ap = skip ? 0 : S.ap + (p.st.haste ? 1 : 0) + (p.st.primal ? 2 : 0) + collapse + p.apBonusNext;
    p.apBonusNext = 0;
    if (!first) {
      p.focus = Math.min(S.maxFocus, p.focus + S.focusRegen);
      for (const k in p.cds) p.cds[k] = Math.max(0, p.cds[k] - 1);
    }
    actSummons(C);
    if (checkEnd(C)) return;
    C.fire('onTurnStart');
    if (checkEnd(C)) return;
    if (skip) endPlayerTurn(C);
  }

  function endPlayerTurn(C) {
    const { cb, p } = C;
    if (cb.over) return;
    tickEnd(C, p);
    if (p.double) { p.double.turns -= 1; if (p.double.turns <= 0) p.double = null; }
    cb.phase = 'enemy';
    enemyPhase(C);
    if (checkEnd(C)) return;
    cb.turn += 1;
    cb.phase = 'player';
    C.log(`— Turn ${cb.turn} —`, 'turn');
    startPlayerTurn(C, false);
  }

  function checkEnd(C) {
    const cb = C.cb;
    if (cb.over) return cb.over;
    if (C.p.hp <= 0) checkLethal(C);
    if (cb.over) return cb.over;
    if (!C.alive().length) { cb.over = 'won'; C.log('The fight is over.', 'head'); }
    return cb.over;
  }

  function start(G, spec) {
    const raid = G.raid;
    const S = ENG.stats.compute(G);
    const tier = raid.car.tier;
    let enemies = spec.enemies;
    if (enemies) {
      for (const e of enemies) { e.st = {}; e.block = 0; e.charging = null; e.intent = null; e.acted = false; }
    } else {
      enemies = spec.ids.map((id) => CB.spawn(id, tier, spec.depthF || 0, { mod: raid.car.mod, asc: G.ascension, promote: spec.promote }));
    }
    raid.combat = {
      kind: spec.kind || 'fight', title: spec.title || 'Denizens block your way.', roomKey: spec.roomKey || null,
      enemies, turn: 1, phase: 'player', over: null, log: [], rewards: { xp: 0, tickets: 0, scrap: 0, items: [] }, stats: { dealt: 0, taken: 0 },
      p: { hp: Math.min(raid.hp, S.maxHp), maxHp: S.maxHp, focus: S.maxFocus, ap: 0, guard: 0, st: {}, cds: {}, summons: [], turn: 1,
        strikesTurn: 0, strikesFight: 0, sureFlee: false, nextCrit: false, double: null, braceCounter: false, apBonusNext: 0, turnFlags: {}, fightFlags: {} },
    };
    const C = api(G);
    C.log(raid.combat.title, 'head');
    if (raid.nextFight) { for (const k in raid.nextFight) addStatus(C, C.p, k, raid.nextFight[k]); raid.nextFight = null; }
    if (raid.car.mod === 'frost') { addStatus(C, C.p, 'chill', 1); for (const e of enemies) addStatus(C, e, 'chill', 1); }
    C.fire('onCombatStart');
    for (const e of C.alive()) if (!e.intent) chooseIntent(C, e);
    if (!checkEnd(C)) startPlayerTurn(C, true);
    return C;
  }

  /* ---------- player actions ---------- */
  function act(G, fn) {
    if (!G.raid || !G.raid.combat) return null;
    const C = api(G);
    if (C.cb.over || C.cb.phase !== 'player') return C;
    fn(C);
    checkEnd(C);
    return C;
  }
  const findTarget = (C, uid) => C.alive().find((e) => e.uid === uid) || C.alive()[0] || null;

  function abilityCost(S, raid, ab) { return Math.max(0, ab.focus - (S.flags.abilityDiscount || 0)) + (raid && raid.car.mod === 'hush' ? 1 : 0); }
  function abilityCooldown(S, ab) { return ab.cd > 0 ? Math.max(1, ab.cd - (S.flags.cdReduce || 0)) : 0; }

  function abilityState(C, id) {
    const ab = D.ABILITIES[id];
    if (!ab) return { ok: false, reason: 'Unknown' };
    const cost = abilityCost(C.S, C.raid, ab);
    const cd = C.p.cds[id] || 0;
    if (ab.oncePerRaid && C.raid.once && C.raid.once['ability_' + id]) return { ok: false, reason: 'Used this raid', cost };
    if (cd > 0) return { ok: false, reason: `Ready in ${cd}`, cost, cd };
    if (C.p.ap < ab.ap) return { ok: false, reason: 'Not enough AP', cost };
    if (C.p.focus < cost && !(C.S.flags.bloodPrice && C.p.hp > (cost - C.p.focus) * 3)) return { ok: false, reason: 'Not enough Focus', cost };
    if ((ab.target === 'enemy' || ab.target === 'all') && !C.alive().length) return { ok: false, reason: 'No target', cost };
    return { ok: true, cost };
  }

  const actions = {
    strike(G, uid) {
      return act(G, (C) => {
        const W = C.S.weapon;
        if (C.p.ap < W.ap) return C.log('Not enough AP to Strike.', 'warn');
        const t = findTarget(C, uid);
        if (!t) return;
        C.p.ap -= W.ap;
        CB.strike(C, t, 1);
      });
    },
    brace(G) {
      return act(G, (C) => {
        if (C.p.ap < 1) return C.log('Not enough AP to Brace.', 'warn');
        C.p.ap -= 1;
        const g = braceValue(C.S);
        C.gainGuard(g);
        if (C.S.flags.braceCounter) C.p.braceCounter = true;
        C.log(`You brace yourself (+${g} Guard).`, 'good');
      });
    },
    ability(G, id, uid) {
      return act(G, (C) => {
        const ab = D.ABILITIES[id];
        const st = abilityState(C, id);
        if (!st.ok) return C.log(`${ab ? ab.name : 'Ability'}: ${st.reason}.`, 'warn');
        const cost = st.cost;
        if (C.p.focus >= cost) C.p.focus -= cost;
        else { const missing = cost - C.p.focus; C.p.focus = 0; C.p.hp -= missing * 3; C.log(`Blood Price: you pay ${missing * 3} HP.`, 'bad'); }
        C.p.ap -= ab.ap;
        C.p.cds[id] = abilityCooldown(C.S, ab);
        if (ab.oncePerRaid) { C.raid.once = C.raid.once || {}; C.raid.once['ability_' + id] = true; }
        C.log(`You use ${ab.name}.`, 'you');
        const t = ab.target === 'enemy' ? findTarget(C, uid) : null;
        ab.use(C, t);
        C.fire('onAbility', id);
      });
    },
    item(G, slot, uid) {
      return act(G, (C) => {
        const stack = G.belt[slot];
        if (!stack) return;
        const def = D.CONSUMABLES[stack.base];
        if (def.use !== 'combat' && def.use !== 'both') return C.log(`${def.name} can't be used in a fight.`, 'warn');
        if (C.p.ap < 1) return C.log('Not enough AP to use an item.', 'warn');
        C.p.ap -= 1;
        const heal = 1 + (C.S.flags.consumableHeal || 0);
        const t = findTarget(C, uid);
        switch (stack.base) {
          case 'bandage': C.heal(Math.round(C.p.maxHp * 0.3 * heal)); C.clear(C.p, 'bleed'); break;
          case 'beans': C.heal(Math.round(C.p.maxHp * 0.12 * heal)); addStatus(C, C.p, 'regen', 3 + C.tier); break;
          case 'tonic': C.gainFocus(6); break;
          case 'salts': for (const k of CB.DEBUFFS) delete C.p.st[k]; C.gainAp(1); break;
          case 'firecracker': for (const e of C.alive()) damage(C, e, Math.round(14 * (1 + 0.35 * (C.tier - 1))), { src: 'power', label: 'Firecracker' }); break;
          case 'chrome_dust': if (t) addStatus(C, t, 'chill', 3); break;
          case 'mirror_tonic': addStatus(C, C.p, 'mirror', 2); break;
          case 'flare': C.cb.over = 'fled'; C.raid.flags.fled = true; C.log('The flare bursts. You run for it!', 'good'); break;
          default: break;
        }
        C.log(`You use ${def.name}.`, 'you');
        stack.qty -= 1;
        if (stack.qty <= 0) G.belt[slot] = null;
      });
    },
    flee(G) {
      return act(G, (C) => {
        if (C.cb.kind === 'boss') return C.log('There is nowhere to run from this.', 'warn');
        const ch = fleeChance(C);
        if (Math.random() < ch) { C.cb.over = 'fled'; C.raid.flags.fled = true; C.log('You get away!', 'good'); return; }
        C.log('You try to run, but they cut you off!', 'bad');
        C.p.ap = 0;
        endPlayerTurn(C);
      });
    },
    spare(G) {
      return act(G, (C) => {
        if (!canSpare(C)) return;
        C.cb.over = 'spared';
        C.raid.flags.spared = true;
        C.log('You lower your weapon. They scurry away, unharmed.', 'good');
      });
    },
    endTurn(G) { return act(G, (C) => endPlayerTurn(C)); },
  };

  function braceValue(S) { return Math.round((4 + S.armor + S.maxHp * 0.08) * (1 + (S.flags.braceBonus || 0))); }
  function fleeChance(C) {
    if (C.p.sureFlee || C.mod === 'greased') return 1;
    const n = C.alive().length;
    const elite = C.alive().some((e) => e.elite);
    return U.clamp(0.5 + C.S.dodge - 0.08 * (n - 1) - (elite ? 0.2 : 0), 0.1, 0.95);
  }
  function canSpare(C) {
    const a = C.alive();
    return a.length > 0 && a.every((e) => e.peaceful) && !C.cb.over;
  }

  /* Summary of an enemy's intent for the UI. */
  function intentInfo(C, e) {
    const m = e.intent;
    if (!m) return { icon: 'question', text: '…', cls: '' };
    switch (m.t) {
      case 'attack': {
        const [a, b] = enemyHitRange(C, e, m);
        const lo = mitigate(C, a), hi = mitigate(C, b);
        const dmg = lo === hi ? `${lo}` : `${lo}–${hi}`;
        const tail = (m.hits > 1 ? ` ×${m.hits}` : '') + (m.status ? ` + ${D.STATUSES[m.status[0]].name}` : '') + (m.leech ? ' (drain)' : '');
        return { icon: m.charged ? 'bomb' : 'swords', text: (m.name ? m.name + ': ' : 'Attack ') + dmg + tail, cls: m.charged ? 'danger' : 'attack' };
      }
      case 'block': return { icon: 'shield', text: `Block ${Math.round(m.v * e.dmgF)}`, cls: 'defend' };
      case 'buff': return { icon: 'up', text: `${m.target === 'allies' ? 'Rally' : 'Power up'}: ${D.STATUSES[m.status[0]].name} ${m.status[1]}`, cls: 'buff' };
      case 'debuff': return { icon: 'down', text: `${D.STATUSES[m.status[0]].name} ${m.status[1]} on you`, cls: 'debuff' };
      case 'heal': return { icon: 'plus', text: `Heal ${Math.round(m.v * e.hpF)}`, cls: 'buff' };
      case 'summon': return { icon: 'plus', text: 'Call for help', cls: 'buff' };
      case 'charge': return { icon: 'clock', text: `Winding up ${m.next.name}`, cls: 'danger' };
      case 'steal': return { icon: 'bag', text: 'Steal from your pack', cls: 'danger' };
      case 'flee': return { icon: 'flee', text: 'Run away with the loot', cls: 'danger' };
      case 'drain': return { icon: 'bolt', text: `Drain ${m.v} Focus`, cls: 'debuff' };
      case 'number': return { icon: 'hash', text: 'Audit: Number +1', cls: 'danger' };
      case 'mirror': return { icon: 'copy', text: 'Split a reflection', cls: 'buff' };
      default: return { icon: 'question', text: '…', cls: '' };
    }
  }

  Object.assign(CB, { start, actions, api, abilityState, abilityCost, abilityCooldown, intentInfo, braceValue, fleeChance, canSpare, checkEnd });
})();
