// Firing, melee/harvesting, projectiles (bolts, sniper rounds, grenades, molotovs,
// alarm clocks), fire areas and explosions. Every shot makes noise the dead can hear.
import * as THREE from 'three';
import { WEAPONS, THROWABLES, ITEMS } from '../data/items.js';
import { COL } from '../world/buildings.js';
import { TREE_INFO } from '../world/vegetation.js';
import { clamp } from '../core/math.js';

const _v = new THREE.Vector3();

// ray vs sphere → t or Infinity
function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const px = ox - cx, py = oy - cy, pz = oz - cz;
  const b = px * dx + py * dy + pz * dz;
  const c = px * px + py * py + pz * pz - r * r;
  const disc = b * b - c;
  if (disc < 0) return Infinity;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : (c < 0 ? 0 : Infinity);
}
export function survivorHitSpheres(s) {
  const y = s.pos.y, c = s.crouch ? 0.7 : 1;
  return [[s.pos.x, y + 1.62 * (s.crouch ? 0.72 : 1), s.pos.z, 0.2, 'head'], [s.pos.x, y + 1.22 * c, s.pos.z, 0.33, 'body'], [s.pos.x, y + 0.82 * c, s.pos.z, 0.3, 'body'], [s.pos.x, y + 0.38, s.pos.z, 0.26, 'legs']];
}

export class Weapons {
  constructor(G) {
    this.G = G;
    this.projectiles = [];
    this.fires = [];
    this.lures = [];
    this.alarms = [];
    this.projGroup = new THREE.Group();
    G.scene.add(this.projGroup);
  }

  // nearest entity hit along a ray (survivors + zombies)
  rayEntities(ox, oy, oz, dx, dy, dz, maxT, shooter) {
    let best = maxT, hit = null;
    for (const s of this.G.survivors) {
      if (!s.alive || s === shooter || s.extracted || !s.physical) continue;
      // quick reject
      const tx = s.pos.x - ox, tz = s.pos.z - oz;
      const along = tx * dx + tz * dz;
      if (along < -1 || along > best + 1) continue;
      const perp = Math.abs(tx * dz - tz * dx);
      if (perp > 1.2) continue;
      for (const sp of survivorHitSpheres(s)) {
        const t = raySphere(ox, oy, oz, dx, dy, dz, sp[0], sp[1], sp[2], sp[3]);
        if (t < best) { best = t; hit = { t, survivor: s, part: sp[4] }; }
      }
    }
    const zh = this.G.zombies.raycast(ox, oy, oz, dx, dy, dz, best);
    if (zh && zh.t < best) { best = zh.t; hit = zh; }
    const ah = this.G.animals?.raycast(ox, oy, oz, dx, dy, dz, best);
    if (ah && ah.t < best) { best = ah.t; hit = ah; }
    return hit;
  }

  // trace one bullet; returns end point
  traceBullet(shooter, def, rarity, ox, oy, oz, dx, dy, dz, range, dmgMul = 1) {
    const G = this.G;
    const wh = G.physics.raycast(ox, oy, oz, dx, dy, dz, range);
    const maxT = wh ? wh.t : range;
    const eh = this.rayEntities(ox, oy, oz, dx, dy, dz, maxT, shooter);
    const base = (def.dmg[rarity] || def.dmg[def.dmg.length - 1]) * (shooter.mods ? shooter.mods.get('gunDamage') : 1);
    if (eh) {
      const dist = eh.t;
      let dmg = base * dmgMul;
      if (def.pellets) dmg *= clamp(1.25 - dist / 18, 0.25, 1);
      else if (def.range < 120) dmg *= clamp(1.15 - dist / (def.range * 1.6), 0.55, 1);
      const head = eh.part === 'head';
      if (head) dmg *= def.head;
      dmg = Math.round(dmg);
      const px = ox + dx * eh.t, py = oy + dy * eh.t, pz = oz + dz * eh.t;
      if (eh.survivor) {
        const hadArmor = eh.survivor.armor > 0;
        const dealt = eh.survivor.takeDamage(dmg, shooter, { type: 'bullet', head, weapon: def.name });
        shooter.stats.damage += dealt;
        G.fx.impact(px, py, pz, -dx, -dy, -dz, hadArmor ? 'armor' : 'blood');
        if (shooter.isPlayer) G.hud.hit(px, py, pz, dmg, head, hadArmor);
        if (eh.survivor.isPlayer) G.hud.damageFrom(shooter.pos);
        eh.survivor.onShotBy?.(shooter);
      } else if (eh.zombie) {
        G.zombies.damage(eh.zombie, dmg, shooter, { head, dir: [dx, dz] });
        G.fx.impact(px, py, pz, -dx, -dy, -dz, 'ichor');
        if (shooter.isPlayer) G.hud.hit(px, py, pz, dmg, head, false);
      } else if (eh.animal) {
        G.animals.damage(eh.animal, dmg, shooter);
        G.fx.impact(px, py, pz, -dx, -dy, -dz, 'blood');
        if (shooter.isPlayer) G.hud.hit(px, py, pz, dmg, head, false);
      }
      return [px, py, pz];
    }
    if (wh) {
      this.hitCollider(wh, shooter, base * dmgMul * (def.pellets ? 1 : 1), dx, dz);
      return [wh.x, wh.y, wh.z];
    }
    return [ox + dx * range, oy + dy * range, oz + dz * range];
  }
  hitCollider(wh, shooter, dmg, dx, dz) {
    const G = this.G;
    const c = wh.collider;
    let kind = 'dust';
    if (c) {
      const ref = c.ref;
      if (ref?.piece) { G.builds.damage(ref.piece, dmg, shooter); kind = ref.piece.mat === 'wood' ? 'wood' : ref.piece.mat === 'stone' ? 'stone' : 'spark'; }
      else if (ref?.barricade) { G.inter.damageBarricade(ref.barricade, dmg * 0.6, shooter); kind = 'wood'; }
      else if (ref?.door) { G.inter.damageDoor(ref.door, dmg * 0.5, shooter); kind = 'wood'; }
      else if (ref?.vehicle) { kind = 'spark'; G.rides.damage(ref.vehicle, dmg, shooter); }
      else if (ref?.type === 'car' || ref?.type === 'metal') { kind = 'spark'; if (ref.type === 'car' && ref.prop) G.inter.carAlarm(ref.prop); }
      else if (ref?.type === 'tree' || ref?.type === 'wood' || ref?.type === 'fence') kind = 'wood';
      else if (ref?.type === 'rock') kind = 'stone';
      else if (c.building !== undefined) kind = 'dust';
    } else kind = 'dirt';
    G.fx.impact(wh.x, wh.y, wh.z, wh.n[0], wh.n[1], wh.n[2], kind);
    G.audio?.play('ricochet', { x: wh.x, y: wh.y, z: wh.z }, { vol: 0.25 });
  }

  // ----- main entry: fire the shooter's active weapon toward aim point -----
  // returns true if a shot was fired
  fire(s, aimPoint, opts = {}) {
    const G = this.G;
    const slot = s.activeSlot();
    if (!slot) return false;
    const def = WEAPONS[slot.id];
    if (!def || s.ws.cd > 0 || s.ws.reload > 0) return false;
    if (def.melee) return this.melee(s, def, slot.r, aimPoint);
    if (slot.mag <= 0) { this.startReload(s); if (s.isPlayer) G.audio?.play('dryfire', null, { vol: 0.5 }); return false; }
    slot.mag--;
    s.ws.cd = 1 / def.rate;
    s.ws.lastShot = G.time;
    // muzzle origin
    const muzzle = this.muzzlePos(s);
    let dx = aimPoint.x - muzzle.x, dy = aimPoint.y - muzzle.y, dz = aimPoint.z - muzzle.z;
    const L = Math.hypot(dx, dy, dz) || 1;
    dx /= L; dy /= L; dz /= L;
    const moving = Math.hypot(s.vel.x, s.vel.z) > 1;
    let spread = (opts.ads ? def.adsSpread : def.spread) + s.ws.bloom;
    if (moving) spread *= 1.5;
    if (!s.onGround) spread *= 2;
    if (s.crouch) spread *= 0.72;
    if (opts.spreadMul) spread *= opts.spreadMul;
    if (s.mods) spread /= s.mods.get('accuracy');
    const pellets = def.pellets || 1;
    let endPts = [];
    for (let p = 0; p < pellets; p++) {
      const [ex, ey, ez] = this.spreadDir(dx, dy, dz, spread);
      if (def.projectile || def.drop) {
        this.spawnBullet(s, def, slot.r, muzzle, ex, ey, ez);
      } else {
        const end = this.traceBullet(s, def, slot.r, muzzle.x, muzzle.y, muzzle.z, ex, ey, ez, def.range * 1.4);
        endPts.push(end);
      }
    }
    s.ws.bloom = Math.min(def.spread * 2.2, s.ws.bloom + def.bloom);
    // fx
    G.fx.muzzle(muzzle.x, muzzle.y, muzzle.z, dx, dy, dz, def.suppressed);
    for (const e of endPts.slice(0, 4)) if (!def.suppressed || Math.random() < 0.3) G.fx.tracer(muzzle.x, muzzle.y, muzzle.z, e[0], e[1], e[2], s.isPlayer ? 0xfff2a0 : 0xffc070);
    G.audio?.play(def.suppressed ? 'shot_suppressed' : 'shot_' + def.model, s.isPlayer ? null : s.pos, { vol: s.isPlayer ? 0.75 : 1 });
    G.emitNoise(s.pos.x, s.pos.z, def.noise, s, 'gunshot');
    s.character?.playAction('recoil', 0.18);
    if (s.isPlayer) G.player.addRecoil(def.recoil * (opts.ads ? 0.6 : 1));
    if (slot.mag <= 0 && (s.inv.ammo[def.ammo] || 0) > 0 && def.mag > 1) this.startReload(s);
    else if (def.mag === 1 && (s.inv.ammo[def.ammo] || 0) > 0) this.startReload(s);
    return true;
  }
  spreadDir(dx, dy, dz, spread) {
    if (spread <= 0) return [dx, dy, dz];
    // random point in cone
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread;
    // build basis
    let ux = -dz, uy = 0, uz = dx;
    let ul = Math.hypot(ux, uz);
    if (ul < 1e-5) { ux = 1; uz = 0; ul = 1; }
    ux /= ul; uz /= ul;
    const vx = dy * uz - dz * uy, vy = dz * ux - dx * uz, vz = dx * uy - dy * ux;
    const ca = Math.cos(a) * r, sa = Math.sin(a) * r;
    let ex = dx + ux * ca + vx * sa, ey = dy + uy * ca + vy * sa, ez = dz + uz * ca + vz * sa;
    const l = Math.hypot(ex, ey, ez);
    return [ex / l, ey / l, ez / l];
  }
  muzzlePos(s) {
    const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
    const rx = -fz, rz = fx; // right of facing... character faces +z local, right = -x local
    return _v.set(s.pos.x + fx * 0.55 - rx * 0.22, s.pos.y + (s.crouch ? 1.05 : 1.42), s.pos.z + fz * 0.55 - rz * 0.22).clone();
  }
  startReload(s) {
    const slot = s.activeSlot();
    if (!slot) return false;
    const def = WEAPONS[slot.id];
    if (!def || def.melee || s.ws.reload > 0 || slot.mag >= def.mag) return false;
    if ((s.inv.ammo[def.ammo] || 0) <= 0) { if (s.isPlayer) this.G.hud.toast(true, `No ${def.ammo} ammo`); return false; }
    const t = (def.reload[slot.r] ?? def.reload[0]) / (s.mods ? s.mods.get('reloadSpeed') : 1);
    s.ws.reload = t;
    s.ws.reloadTotal = s.ws.reload;
    s.character?.playAction('reload', s.ws.reload);
    this.G.audio?.play('reload', s.isPlayer ? null : s.pos, { vol: 0.5 });
    return true;
  }
  updateShooter(s, dt) {
    const ws = s.ws;
    if (ws.cd > 0) ws.cd -= dt;
    ws.bloom = Math.max(0, ws.bloom - dt * 0.09);
    if (ws.reload > 0) {
      ws.reload -= dt;
      if (ws.reload <= 0) {
        ws.reload = 0;
        const slot = s.activeSlot();
        const def = slot && WEAPONS[slot.id];
        if (def && !def.melee) {
          if (def.perShell) {
            if (s.inv.ammo[def.ammo] > 0 && slot.mag < def.mag) {
              slot.mag++; s.inv.ammo[def.ammo]--;
              if (slot.mag < def.mag && s.inv.ammo[def.ammo] > 0) { ws.reload = (def.reload[slot.r] ?? def.reload[0]) / (s.mods ? s.mods.get('reloadSpeed') : 1); }
            }
          } else {
            const need = def.mag - slot.mag;
            const take = Math.min(need, s.inv.ammo[def.ammo]);
            slot.mag += take; s.inv.ammo[def.ammo] -= take;
          }
        }
      }
    }
  }

  // ----- melee & harvesting -----
  melee(s, def, rarity, aimPoint) {
    const G = this.G;
    s.ws.cd = 1 / def.rate;
    s.character?.playAction('swing', 0.42);
    G.audio?.play('swing', s.isPlayer ? null : s.pos, { vol: 0.5 });
    const dmg = (def.dmg[rarity] ?? 40) * (s.mods ? s.mods.get('meleeDamage') : 1);
    this._meleeAt(s, dmg, def.range, aimPoint, false);
    return true;
  }
  swingPickaxe(s, aimPoint) {
    if (s.ws.cd > 0) return false;
    s.ws.cd = 0.62;
    s.character?.playAction('swing', 0.45);
    this.G.audio?.play('swing', s.isPlayer ? null : s.pos, { vol: 0.45 });
    setTimeout(() => { if (s.alive) this._meleeAt(s, 20 * (s.mods ? s.mods.get('meleeDamage') : 1), 2.6, aimPoint, true); }, 140);
    return true;
  }
  _meleeAt(s, dmg, range, aimPoint, harvest) {
    const G = this.G;
    const ox = s.pos.x, oy = s.pos.y + (s.crouch ? 0.9 : 1.3), oz = s.pos.z;
    let dx = aimPoint.x - ox, dy = aimPoint.y - oy, dz = aimPoint.z - oz;
    const L = Math.hypot(dx, dy, dz) || 1;
    dx /= L; dy /= L; dz /= L;
    // entities first (wide-ish)
    let hit = null;
    for (const off of [0, 0.25, -0.25]) {
      const c = Math.cos(off), sn = Math.sin(off);
      const rdx = dx * c - dz * sn, rdz = dx * sn + dz * c;
      hit = this.rayEntities(ox, oy, oz, rdx, dy, rdz, range, s);
      if (hit) break;
    }
    if (hit) {
      const px = ox + dx * hit.t, py = oy + dy * hit.t, pz = oz + dz * hit.t;
      const head = hit.part === 'head';
      const d = Math.round(dmg * (head ? 1.3 : 1));
      if (hit.survivor) { hit.survivor.takeDamage(d, s, { type: 'melee', head }); s.stats.damage += d; if (hit.survivor.isPlayer) G.hud.damageFrom(s.pos); }
      else if (hit.zombie) G.zombies.damage(hit.zombie, d, s, { head, dir: [dx, dz], melee: true });
      else if (hit.animal) G.animals.damage(hit.animal, d, s);
      G.fx.impact(px, py, pz, -dx, -dy, -dz, hit.zombie ? 'ichor' : 'blood');
      if (s.isPlayer) G.hud.hit(px, py, pz, d, head, false);
      G.audio?.play('hit_flesh', s.isPlayer ? null : s.pos, { vol: 0.7 });
      G.emitNoise(s.pos.x, s.pos.z, 8, s, 'melee');
      return;
    }
    const wh = G.physics.raycast(ox, oy, oz, dx, dy, dz, range, COL.SOLID);
    if (!wh) return;
    const c = wh.collider;
    G.fx.impact(wh.x, wh.y, wh.z, wh.n[0], wh.n[1], wh.n[2], 'dust');
    if (!c) return;
    const ref = c.ref;
    let gain = null, amt = 0;
    if (ref?.piece) { G.builds.damage(ref.piece, harvest ? 50 : dmg, s); G.audio?.play('hit_wood', s.isPlayer ? null : s.pos, { vol: 0.6 }); return; }
    if (ref?.barricade) { G.inter.damageBarricade(ref.barricade, dmg, s); G.audio?.play('hit_wood', s.isPlayer ? null : s.pos, { vol: 0.6 }); return; }
    if (ref?.door) { G.inter.damageDoor(ref.door, dmg, s); G.audio?.play('hit_wood', s.isPlayer ? null : s.pos, { vol: 0.6 }); return; }
    if (!harvest) return;
    if (ref?.type === 'tree') {
      const ti = ref.tree;
      const info = TREE_INFO[G.world.trees.t[ti]];
      gain = 'wood'; amt = Math.round(7 * (info?.wood || 1) + Math.random() * 3);
      ref.hp = (ref.hp ?? 140 * (info?.wood || 1)) - 36;
      G.fx.impact(wh.x, wh.y, wh.z, wh.n[0], wh.n[1], wh.n[2], 'wood');
      G.audio?.play('hit_wood', s.isPlayer ? null : s.pos, { vol: 0.8 });
      if (ref.hp <= 0) { G.view.removeTree(ti); G.audio?.play('tree_fall', wh, { vol: 0.8 }); amt += 10; }
    } else if (ref?.type === 'rock') { gain = 'stone'; amt = 7 + Math.floor(Math.random() * 4); G.audio?.play('hit_stone', s.isPlayer ? null : s.pos, { vol: 0.8 }); G.fx.impact(wh.x, wh.y, wh.z, wh.n[0], wh.n[1], wh.n[2], 'stone'); }
    else if (ref?.type === 'car' || ref?.type === 'metal') { gain = 'metal'; amt = 6 + Math.floor(Math.random() * 4); G.audio?.play('hit_metal', s.isPlayer ? null : s.pos, { vol: 0.8 }); G.fx.impact(wh.x, wh.y, wh.z, wh.n[0], wh.n[1], wh.n[2], 'spark'); if (ref.type === 'car' && ref.prop && Math.random() < 0.25) G.inter.carAlarm(ref.prop); }
    else if (ref?.type === 'wood' || ref?.type === 'fence') { gain = 'wood'; amt = 5 + Math.floor(Math.random() * 3); G.audio?.play('hit_wood', s.isPlayer ? null : s.pos, { vol: 0.7 }); }
    else if (c.building !== undefined) { gain = ['wood', 'stone', 'wood'][Math.floor(Math.random() * 3)]; amt = 3; G.audio?.play('hit_wood', s.isPlayer ? null : s.pos, { vol: 0.6 }); }
    if (gain) {
      amt = Math.round(amt * (s.mods ? s.mods.get('harvest') : 1));
      const left = s.addItem(gain, amt);
      if (s.isPlayer && amt - left > 0) G.hud.matGain(gain, amt - left);
      G.emitNoise(s.pos.x, s.pos.z, 24, s, 'harvest');
    }
  }

  // ----- projectiles -----
  spawnBullet(s, def, rarity, from, dx, dy, dz) {
    const mesh = new THREE.Mesh(Weapons.boltGeo || (Weapons.boltGeo = new THREE.BoxGeometry(0.04, 0.04, def.projectile ? 0.7 : 1.4)), Weapons.boltMat || (Weapons.boltMat = new THREE.MeshBasicMaterial({ color: 0xfff0b0 })));
    mesh.position.copy(from);
    this.projGroup.add(mesh);
    this.projectiles.push({ kind: 'bullet', def, rarity, owner: s, pos: from.clone(), vel: new THREE.Vector3(dx, dy, dz).multiplyScalar(def.speed), life: 4, mesh, gravity: def.drop });
  }
  throwItem(s, id, aimPoint) {
    const G = this.G;
    const def = THROWABLES[id];
    const from = new THREE.Vector3(s.pos.x, s.pos.y + 1.6, s.pos.z);
    let dx = aimPoint.x - from.x, dy = aimPoint.y - from.y, dz = aimPoint.z - from.z;
    const L = Math.hypot(dx, dy, dz) || 1;
    dx /= L; dy /= L; dz /= L;
    const speed = 22;
    const vel = new THREE.Vector3(dx * speed, dy * speed + 5, dz * speed);
    vel.add(s.vel.clone().multiplyScalar(0.5));
    const mesh = new THREE.Group();
    const model = (G.models?.throwable(def.model)) || new THREE.Mesh(new THREE.SphereGeometry(0.08), new THREE.MeshStandardMaterial({ color: 0x556b2f }));
    mesh.add(model);
    mesh.position.copy(from);
    this.projGroup.add(mesh);
    this.projectiles.push({ kind: id, def, owner: s, pos: from, vel, life: def.fuse ?? 10, mesh, gravity: 22, bounces: 0 });
    s.character?.playAction('throw', 0.4);
    G.audio?.play('throw', s.isPlayer ? null : s.pos, { vol: 0.5 });
  }
  update(dt) {
    const G = this.G;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      const ox = p.pos.x, oy = p.pos.y, oz = p.pos.z;
      p.vel.y -= (p.gravity || 0) * dt;
      const sx = p.vel.x * dt, sy = p.vel.y * dt, sz = p.vel.z * dt;
      const L = Math.hypot(sx, sy, sz);
      let done = false;
      if (L > 0.0001) {
        const dx = sx / L, dy = sy / L, dz = sz / L;
        if (p.kind === 'bullet') {
          const wh = G.physics.raycast(ox, oy, oz, dx, dy, dz, L);
          const maxT = wh ? wh.t : L;
          const eh = this.rayEntities(ox, oy, oz, dx, dy, dz, maxT, p.owner);
          if (eh || wh) {
            this.traceBullet(p.owner, p.def, p.rarity, ox, oy, oz, dx, dy, dz, L + 0.01);
            if (p.def.projectile && wh && !eh) G.fx.stuckBolt?.(wh.x, wh.y, wh.z, dx, dy, dz);
            done = true;
          }
        } else {
          const wh = G.physics.raycast(ox, oy, oz, dx, dy, dz, L + 0.1, COL.SOLID | COL.BULLET);
          if (wh) {
            if (p.kind === 'molotov') { this.ignite(wh.x, wh.y, wh.z, p.owner); done = true; }
            else {
              // bounce
              const n = wh.n;
              const vn = p.vel.x * n[0] + p.vel.y * n[1] + p.vel.z * n[2];
              p.vel.x -= 1.6 * vn * n[0]; p.vel.y -= 1.6 * vn * n[1]; p.vel.z -= 1.6 * vn * n[2];
              p.vel.multiplyScalar(0.45);
              p.pos.set(wh.x + n[0] * 0.08, wh.y + n[1] * 0.08, wh.z + n[2] * 0.08);
              if (p.bounces++ < 4 && p.vel.length() > 1.5) G.audio?.play('clink', p.pos, { vol: 0.4 });
              if (p.vel.length() < 1.2) { p.vel.set(0, 0, 0); p.gravity = 0; p.resting = true; }
              p.mesh.position.copy(p.pos);
              if (p.kind === 'noisemaker' && p.resting && !p.armed) { p.armed = true; p.life = p.def.lure; this.lures.push(p); }
              continue;
            }
          }
        }
      }
      if (!done) {
        p.pos.x += sx; p.pos.y += sy; p.pos.z += sz;
        const g = G.world.heightAt(p.pos.x, p.pos.z);
        if (p.pos.y < g + 0.05 && p.kind !== 'bullet') {
          p.pos.y = g + 0.06;
          if (p.kind === 'molotov') { this.ignite(p.pos.x, g, p.pos.z, p.owner); done = true; }
          else { p.vel.y = Math.abs(p.vel.y) * 0.35; p.vel.x *= 0.5; p.vel.z *= 0.5; if (Math.abs(p.vel.y) < 1) { p.vel.set(0, 0, 0); p.gravity = 0; p.resting = true; if (p.kind === 'noisemaker' && !p.armed) { p.armed = true; p.life = p.def.lure; this.lures.push(p); } } }
        } else if (p.pos.y < g - 0.5 && p.kind === 'bullet') done = true;
        p.mesh.position.copy(p.pos);
        if (p.kind === 'bullet') p.mesh.lookAt(p.pos.x + p.vel.x, p.pos.y + p.vel.y, p.pos.z + p.vel.z);
        else if (!p.resting) { p.mesh.rotation.x += dt * 8; p.mesh.rotation.z += dt * 5; }
      }
      if (p.kind === 'noisemaker' && p.armed) {
        p.tick = (p.tick || 0) - dt;
        if (p.tick <= 0) { p.tick = 1.0; G.emitNoise(p.pos.x, p.pos.z, p.def.noise, p.owner, 'lure', true); G.audio?.play('alarm', p.pos, { vol: 0.9 }); }
      }
      if (!done && p.life <= 0) {
        if (p.kind === 'grenade') this.explode(p.pos.x, p.pos.y, p.pos.z, p.def.radius, p.def.dmg, p.owner);
        done = true;
      }
      if (done) {
        this.projGroup.remove(p.mesh);
        this.projectiles.splice(i, 1);
        const li = this.lures.indexOf(p); if (li >= 0) this.lures.splice(li, 1);
      }
    }
    // fires
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i];
      f.t -= dt;
      f.tick -= dt;
      if (f.tick <= 0) {
        f.tick = 0.5;
        for (const s of G.survivors) if (s.alive && s.physical && Math.hypot(s.pos.x - f.x, s.pos.z - f.z) < f.r && Math.abs(s.pos.y - f.y) < 2.5) s.takeDamage(Math.round(THROWABLES.molotov.fireDps * 0.5), f.owner, { type: 'fire' });
        G.zombies.burnArea(f.x, f.z, f.r, THROWABLES.molotov.fireDps * 0.9, f.owner);
        G.builds.burnArea?.(f.x, f.y, f.z, f.r);
      }
      if (f.t <= 0) { G.fx.removeFire(f.fx); this.fires.splice(i, 1); }
    }
  }
  ignite(x, y, z, owner) {
    const G = this.G;
    const r = THROWABLES.molotov.fireRadius;
    const fx = G.fx.addFire(x, y, z, r);
    this.fires.push({ x, y, z, r, t: THROWABLES.molotov.fireTime, tick: 0, owner, fx });
    G.audio?.play('glass', { x, y, z }, { vol: 0.8 });
    G.audio?.play('whoosh', { x, y, z }, { vol: 0.8 });
    G.emitNoise(x, z, THROWABLES.molotov.noise, owner, 'fire');
  }
  explode(x, y, z, radius, dmg, owner) {
    const G = this.G;
    G.fx.explosion(x, y, z, radius);
    G.audio?.play('explosion', { x, y, z }, { vol: 1 });
    G.emitNoise(x, z, 300, owner, 'explosion', true);
    for (const s of G.survivors) {
      if (!s.alive || !s.physical) continue;
      const d = Math.hypot(s.pos.x - x, s.pos.y + 1 - y, s.pos.z - z);
      if (d < radius && G.physics.lineOfSight(x, y + 0.3, z, s.pos.x, s.pos.y + 1, s.pos.z)) {
        const dealt = s.takeDamage(Math.round(dmg * (1 - d / radius * 0.7)), owner, { type: 'explosion' });
        if (owner) owner.stats.damage += dealt;
        if (owner?.isPlayer && s !== owner) G.hud.hit(s.pos.x, s.pos.y + 1.5, s.pos.z, Math.round(dmg * (1 - d / radius * 0.7)), false, false);
      }
    }
    G.zombies.explosion(x, y, z, radius, dmg, owner);
    G.animals?.explosion?.(x, y, z, radius, dmg, owner);
    G.builds.explosion(x, y, z, radius, 220);
    G.inter.explosion(x, y, z, radius);
    G.rides?.explosion(x, y, z, radius, dmg);
    const pd = Math.hypot(G.player.pos.x - x, G.player.pos.z - z);
    if (pd < 60) G.player.shake(Math.max(0, 1 - pd / 60) * 0.8);
  }
}
