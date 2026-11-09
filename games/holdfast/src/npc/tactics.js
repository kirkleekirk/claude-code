// How people fight. Everyone on two legs (your people, raiders, strangers
// who turn) uses these: pick the target that matters most, fight it at the
// range their weapon wants, keep a clear line of fire (and never shoot
// through a friend), back off from the dead to keep shooting, reload when
// there's a moment, strafe when people shoot back, fall back when it's too
// many or they're hurt badly, and go quiet with a bat when you're sneaking.
import { GUNS } from '../items.js';

// [too close, where they'd like to be, too far] for a weapon
export function ranges(def) {
  if (!def) return [0, 1.2, 1.6];
  if (def.pellets > 1) return [2.4, 5, Math.min(def.range, 13)];
  if (def.scope) return [8, 20, def.range * 1.15];
  if (def.cls === 'long') return [4, 11, def.range];
  return [3, 7, def.range];
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export class Tactics {
  constructor(soc) { this.soc = soc; this.game = soc.game; }
  friends(m) {
    const pl = this.game.player, out = [];
    if (m.faction === 'camp') {
      if (!pl.dead && !pl.released && pl.body !== m) out.push(pl);
      for (const o of this.soc.camp.members) if (o !== m && !o.dead && o.mode !== 'away' && !o.controlled) out.push(o);
    } else for (const o of this.soc.npcs) if (o !== m && !o.dead && o.faction === m.faction && (!m.rcamp || o.rcamp === m.rcamp)) out.push(o);
    return out;
  }
  // the dead around a point
  zombiesNear(p, r) {
    const out = [];
    for (const z of this.game.zombies.list) if (!z.dead && dist(z.pos, p) < r && Math.abs(z.pos.y - p.y) < 2.5) out.push(z);
    return out;
  }
  // is a friend standing between the shooter and what they're shooting at?
  friendInLine(m, t) {
    const dx = t.pos.x - m.pos.x, dz = t.pos.z - m.pos.z, d = Math.hypot(dx, dz) || 1, ux = dx / d, uz = dz / d;
    for (const f of this.friends(m)) {
      const fx = f.pos.x - m.pos.x, fz = f.pos.z - m.pos.z;
      const along = fx * ux + fz * uz;
      if (along < 0.4 || along > d + 0.6) continue;
      const across = Math.abs(fx * uz - fz * ux);
      if (across < 0.85 && Math.abs(f.pos.y - m.pos.y) < 2) return f;
    }
    return null;
  }
  // a spot a few metres away that's walkable, away from the dead and toward
  // friends (or home): where to back off or fall back to
  safeSpot(m, step = 4, threat = null) {
    const nav = this.soc.nav, zs = this.zombiesNear(m.pos, 16);
    const anchor = m.faction === 'camp' && m.mode === 'follow' && !this.game.player.dead ? this.game.player.pos : null;
    let best = null, bs = Infinity;
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      for (const s of [step, step * 0.6]) {
        const p = { x: m.pos.x + Math.cos(a) * s, y: m.pos.y, z: m.pos.z + Math.sin(a) * s };
        if (nav && !nav.lineClear(m.pos, p)) continue;
        let sc = 0;
        for (const z of zs) { const d = dist(z.pos, p); sc += 6 / Math.max(0.6, d); }
        if (threat && !threat.hurt) sc += 4 / Math.max(1, dist(threat.pos, p));
        if (anchor) sc += dist(anchor, p) * 0.12;
        // open ground beats a corner: how many ways out from there
        if (sc < bs) { bs = sc; best = p; }
        break;
      }
    }
    return best;
  }
  // ---------------- one person in a fight ----------------
  fight(m, t, dt) {
    const soc = this.soc, g = this.game;
    if (m.combatTarget !== t) { m.combatTarget = t; m.tacT = 0; m.strafeT = 0; }
    m.locked = false;
    if (m.anim.act) m.setAct(null);
    const d = dist(t.pos, m.pos), isZ = !!t.hurt;
    m.faceTarget = t.pos;
    m.seeT = (m.seeT || 0) - dt;
    if (m.seeT <= 0) { m.seeT = 0.3; m.sees = soc.clear(m.pos, t.pos); }
    const crowd = this.zombiesNear(m.pos, 3.2).length;
    const hurt = m.health < m.maxHealth * 0.3;
    // badly hurt with the dead on top of them, or swamped with only a bat:
    // get out, toward friends
    if ((hurt && crowd >= 1) || (crowd >= 3 && m.weapon !== 'gun') || crowd >= 5) {
      if (this.fallBack(m, t, dt, crowd)) return;
    }
    const gun = m.weapon === 'gun' ? m.gear.gun : null, def = gun && GUNS[gun.id];
    if (!gun && m.gear.gun && !m.saidDry) { m.saidDry = true; this.callout(m, 'I\u2019m dry! Bat it is.', 0); }
    else if (gun) m.saidDry = false;
    this.watch(m);
    // sneaking with you: a lone corpse gets the bat, not a gunshot
    const pl = g.player;
    const quiet = gun && isZ && m.faction === 'camp' && pl.crouch && !pl.released && this.zombiesNear(m.pos, 12).length <= 2 && t.prey !== pl;
    if (gun && !quiet) return this.shootFight(m, t, dt, d, def, isZ, crowd);
    return this.meleeFight(m, t, dt, d, isZ, crowd);
  }
  shootFight(m, t, dt, d, def, isZ, crowd) {
    const gun = m.gear.gun, [near, ideal, far] = ranges(def);
    // empty: reload where it's safe, back off while doing it
    if (gun.mag <= 0) {
      if (m.reloadT <= 0) { m.reloadT = def.reload * 1.15; this.callout(m, ['Reloading!', 'Changing mags!', 'Cover me, reloading!'][Math.floor(Math.random() * 3)], 9); }
      m.aiming = false;
      if (isZ && d < 4) { this.backOff(m, t, 4); return; }
      if (m.path && d > 6) m.stop();
      return;
    }
    // can't see it, or too far: close in by a real route until there's a shot
    if (!m.sees || d > far) {
      m.aiming = false;
      m.repathT = (m.repathT || 0) - dt;
      if (m.repathT <= 0) { m.repathT = 0.6; m.goTo(t.pos.x, t.pos.y, t.pos.z, d > 10); }
      return;
    }
    // the dead are too close for a gun: step back and keep shooting
    if (isZ && d < near && crowd < 3) {
      if (!m.path || (m.backT = (m.backT || 0) - dt) <= 0) { m.backT = 0.8; this.backOff(m, t, near + 2.5); }
      if (d > 2.3) this.tryShoot(m, t);
      return;
    }
    if (isZ && d < 2.2) { this.backOff(m, t, 3.5); return this.meleeHit(m, t); }
    // against people who shoot back: keep moving sideways between shots
    if (!isZ) {
      m.strafeT = (m.strafeT || 0) - dt;
      if (m.strafeT <= 0) {
        m.strafeT = 1.6 + Math.random() * 1.8;
        const dx = t.pos.x - m.pos.x, dz = t.pos.z - m.pos.z, l = Math.hypot(dx, dz) || 1;
        const side = (Math.random() < 0.5 ? -1 : 1) * (1.5 + Math.random() * 1.5);
        const toward = d > ideal * 1.4 ? 2 : d < ideal * 0.6 ? -1.5 : 0;
        const p = { x: m.pos.x - dz / l * side + dx / l * toward, y: m.pos.y, z: m.pos.z + dx / l * side + dz / l * toward };
        if (this.soc.nav.lineClear(m.pos, p)) m.goTo(p.x, p.y, p.z, true);
      }
    } else if (m.path && d < far * 0.9) m.stop();
    // something of ours in the way: take another shot that's clear, or move
    // for an angle, never shoot through them
    const f = this.friendInLine(m, t);
    if (f) {
      m.aiming = true;
      if (isZ) {
        const alt = this.zombiesNear(m.pos, far).filter((z) => z !== t && z.state === 'chase').sort((a, b) => dist(a.pos, m.pos) - dist(b.pos, m.pos)).slice(0, 5)
          .find((z) => dist(z.pos, m.pos) > 2.3 && !this.friendInLine(m, z) && this.soc.clear(m.pos, z.pos));
        if (alt) { m.faceTarget = alt.pos; m.attack(alt); return; }
      }
      m.angleT = (m.angleT || 0) - dt;
      if (!m.path || m.angleT <= 0) {
        m.angleT = 0.9;
        const dx = t.pos.x - m.pos.x, dz = t.pos.z - m.pos.z, l = Math.hypot(dx, dz) || 1;
        const sgn = ((f.pos.x - m.pos.x) * dz - (f.pos.z - m.pos.z) * dx) > 0 ? 1 : -1;
        for (const k of [2.6, 1.6, -2.6]) {
          const p = { x: m.pos.x + dz / l * k * sgn, y: m.pos.y, z: m.pos.z - dx / l * k * sgn };
          if (this.soc.nav.lineClear(m.pos, p)) { m.goTo(p.x, p.y, p.z, true); break; }
        }
      }
      return;
    }
    m.aiming = true;
    this.tryShoot(m, t);
  }
  tryShoot(m, t) { m.aiming = true; m.attack(t); }
  meleeHit(m, t) { if (dist(t.pos, m.pos) < 1.9) m.attack(t); }
  meleeFight(m, t, dt, d, isZ, crowd) {
    m.aiming = false;
    // hit and step back when more are coming, so they can't pile on
    if (isZ && crowd >= 2 && m.attackT > 0.6) { this.backOff(m, t, 2.2); return; }
    m.repathT = (m.repathT || 0) - dt;
    if (d > 1.35) {
      if (m.repathT <= 0) { m.repathT = 0.35; m.goTo(t.pos.x, t.pos.y, t.pos.z, true); }
    } else if (m.path && !(isZ && crowd >= 2)) m.stop();
    if (d < 1.8) m.attack(t);
  }
  // away from what's coming, keeping it in front
  backOff(m, t, want) {
    const dx = m.pos.x - t.pos.x, dz = m.pos.z - t.pos.z, l = Math.hypot(dx, dz) || 1;
    const nav = this.soc.nav;
    for (const a of [0, 0.5, -0.5, 1.0, -1.0, 1.5, -1.5]) {
      const c = Math.cos(a), s = Math.sin(a), ux = (dx / l) * c - (dz / l) * s, uz = (dx / l) * s + (dz / l) * c;
      const p = { x: m.pos.x + ux * want, y: m.pos.y, z: m.pos.z + uz * want };
      if (!nav || nav.lineClear(m.pos, p)) { m.goTo(p.x, p.y, p.z, true); return true; }
    }
    const p = this.safeSpot(m, want, t);
    if (p) { m.goTo(p.x, p.y, p.z, true); return true; }
    return false;
  }
  // get clear of it all, toward friends; true if they're moving
  fallBack(m, t, dt, crowd) {
    m.fallT = (m.fallT || 0) - dt;
    if (m.path && m.fallT > 0) { if (m.weapon === 'gun' && dist(t.pos, m.pos) > 2.5 && m.sees) m.attack(t); return true; }
    const p = this.safeSpot(m, 6, t);
    if (!p) return false;
    m.fallT = 1.2;
    m.aiming = false;
    m.goTo(p.x, p.y, p.z, true);
    if (!m.saidFall || m.t - m.saidFall > 12) { m.saidFall = m.t; m.say(crowd >= 3 ? ['Too many! Falling back!', 'Back, back, back!', 'They’re all over me!'][Math.floor(Math.random() * 3)] : ['I’m hurt, pulling back!', 'Cover me!'][Math.floor(Math.random() * 2)], 2); }
    return true;
  }
  // a word to the group in a fight, not too often
  callout(m, text, cd = 10) {
    const now = m.t;
    if (now - (m.callT || -99) < cd || (this.soc.clock * 60) - (this.lastCall || -99) < 3.5 || m.faction !== 'camp') return;
    if (!this.soc.playerNear(m.pos, 35)) return;
    m.callT = now; this.lastCall = (this.soc.clock * 60);
    m.say(text, 1.8);
  }
  // what a follower notices for you: the dead behind you, a runner
  watch(m) {
    const g = this.game, pl = g.player;
    if (pl.released || pl.dead || m.faction !== 'camp') return;
    const yaw = g.tpc.yaw, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    for (const z of this.zombiesNear(pl.pos, 7)) {
      if (z.state !== 'chase' || z.prey !== pl) continue;
      const rx = z.pos.x - pl.pos.x, rz = z.pos.z - pl.pos.z;
      if ((rx * fx + rz * fz) / (Math.hypot(rx, rz) || 1) < -0.3) { this.callout(m, ['Behind you!', 'On your six!', 'Watch your back!'][Math.floor(Math.random() * 3)], 8); return; }
    }
    for (const z of this.zombiesNear(m.pos, 25)) if (z.type === 'runner' && z.state === 'chase') { this.callout(m, ['Runner!', 'Fast one coming!'][Math.floor(Math.random() * 2)], 15); return; }
  }
  // between fights: top up the gun, see to wounds
  idle(m, dt) {
    m.idleT = (m.idleT || 0) - dt;
    if (m.idleT > 0) return;
    m.idleT = 1.5;
    const g = m.gear.gun;
    if (g && m.reloadT <= 0) {
      const def = GUNS[g.id];
      if (g.mag < def.mag * 0.6 && m.pack.count('ammo', def.ammo) > 0) m.reloadT = def.reload;
    }
    // you're out of ammo for your gun and they have some: they hand it over
    const pl = this.game.player, pb = pl.body;
    if (m.faction === 'camp' && m.mode === 'follow' && pb && pb !== m && pb.gear.gun && !pl.released && m.t - (m.shareT || -99) > 60 && this.soc.playerNear(m.pos, 4)) {
      const def = GUNS[pb.gear.gun.id], have = m.pack.count('ammo', def.ammo);
      const mine = m.gear.gun && GUNS[m.gear.gun.id].ammo === def.ammo;
      if (pb.pack.count('ammo', def.ammo) === 0 && pb.gear.gun.mag < def.mag * 0.3 && have >= (mine ? def.mag * 2 : 1)) {
        const n = Math.min(mine ? Math.floor(have / 2) : have, def.mag * 2), got = pb.pack.add('ammo', def.ammo, n);
        if (got > 0) {
          m.pack.take('ammo', def.ammo, got); m.shareT = m.t;
          m.say(['Here, take some of mine.', 'You\u2019re empty. Catch.', 'Got spare rounds, here.'][Math.floor(Math.random() * 3)], 2.5);
          this.game.hud.toast(`${m.first} gave you ${got} ${def.ammo === '12ga' ? 'shotgun shells' : def.ammo + ' rounds'}`, 2.5);
        }
      }
    }
    // patch themselves up with their own meds when it's bad and quiet
    if (m.faction === 'camp' && (m.health < m.maxHealth * 0.45 || m.injuries.some((i) => i.id === 'cut' && !i.treated)) && m.pack.count('res', 'meds') > 0 && m.t - (m.selfHealT || -99) > 25) {
      m.selfHealT = m.t;
      m.pack.take('res', 'meds', 1);
      m.health = Math.min(m.maxHealth, m.health + 30 + m.skill('medicine') * 8);
      const w = m.injuries.find((i) => !i.treated);
      if (w) { w.treated = true; w.t *= 0.6; }
      if (this.soc.playerNear(m.pos, 25)) m.say(['Hang on, let me wrap this.', 'Give me a second. I’m bleeding.', 'That’ll do for now.'][Math.floor(Math.random() * 3)], 2.5);
    }
  }
}
