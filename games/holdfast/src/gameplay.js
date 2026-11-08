// Inventory, loot tables, interaction (doors, searching), and combat.
import * as THREE from 'three';
import { isTouch } from './platform.js';
import { GUNS, rollLoot, itemName, START_RES, Storage } from './items.js';
import { conditionMods } from './condition.js';
export { START_RES, Storage as Inventory, rollLoot };

// ---------------- interaction ----------------
export class Interaction {
  constructor(game) {
    this.game = game;
    this.target = null;
    this.hold = 0;
  }
  // nothing solid between the player's chest and the point (within slack)
  canReach(pt, slack) {
    const g = this.game, p = g.player.pos;
    const ox = p.x, oy = p.y + 1.2, oz = p.z;
    const dx = pt[0] - ox, dy = pt[1] - oy, dz = pt[2] - oz;
    const len = Math.hypot(dx, dy, dz);
    if (len < slack) return true;
    const hit = g.physics.raycast(ox, oy, oz, dx / len, dy / len, dz / len, len, { noTerrain: true, skipGlass: false,
      filter: (b) => b.kind !== 'door' && b.kind !== 'tree' && b.kind !== 'car' && b.kind !== 'walk' && b.kind !== 'fence' });
    return hit.dist >= len - slack;
  }
  candidates() {
    const g = this.game, p = g.player.pos;
    const out = [];
    for (const d of g.world.doors) {
      const c = d.center;
      if (Math.abs(c[1] - 1 - p.y) > 1.5) continue;
      const dist = Math.hypot(c[0] - p.x, c[2] - p.z);
      if (dist < 2.1 && this.canReach(c, 0.35)) out.push({ kind: 'door', ref: d, pos: c, dist });
    }
    const pushLoot = (it) => {
      if (it.searched) return;
      if (Math.abs(it.pos[1] - p.y - 0.8) > 1.6) return;
      const dist = Math.hypot(it.pos[0] - p.x, it.pos[2] - p.z);
      if (dist < 1.9 && this.canReach(it.pos, 0.7)) out.push({ kind: 'loot', ref: it, pos: it.pos, dist });
    };
    for (const S of g.world.structures) {
      const b = S._bb || (S._bb = S.bounds());
      if (!b || p.x < b.wx0 - 3 || p.x > b.wx1 + 3 || p.z < b.wz0 - 3 || p.z > b.wz1 + 3) continue;
      for (const it of S.interact) pushLoot(it);
    }
    for (const it of g.world.carLoot || []) pushLoot(it);
    const soc = g.society;
    if (soc) {
      for (const it of soc.lootables) pushLoot(it);
      const f = g.tpc.forward;
      for (const n of soc.npcs) {
        if (n.dead || n.mode === 'away' || n.faction === 'raider' || n.angry) continue;
        if (Math.abs(n.pos.y - p.y) > 1.4) continue;
        const dist = Math.hypot(n.pos.x - p.x, n.pos.z - p.z);
        if (dist > 2.6) continue;
        // people beside you only count when you look their way
        if (!n.downed && ((n.pos.x - p.x) * f.x + (n.pos.z - p.z) * f.z) / (dist || 1) < 0.55) continue;
        const pos = [n.pos.x, n.pos.y + (n.downed ? 0.4 : 1.3), n.pos.z];
        out.push({ kind: n.downed ? 'revive' : 'npc', ref: n, pos, dist: dist - 0.4 });
      }
    }
    if (g.claims) for (const c of g.claims.list) {
      const dist = Math.hypot(c.flag[0] - p.x, c.flag[2] - p.z);
      if (dist < 2) out.push({ kind: 'flag', ref: c, pos: c.flag, dist });
    }
    return out;
  }
  // a container searched to the bottom (third person or command view)
  // a container searched: what fits goes in your pack, what doesn't stays
  // there for next time
  finishSearch(ref) {
    const g = this.game;
    const first = !ref.left;
    const entries = ref.left || [...rollLoot(ref.table, g.mods ? g.mods.loot : 1), ...(ref.extra || [])];
    ref.extra = null;
    const { got, left } = g.giveLoot(g.player.body, entries);
    ref.left = left.length ? left : null;
    ref.searched = !left.length;
    if (ref.prop) ref.prop.searched = ref.searched;
    if (first && g.society) got.push(...g.society.searchBonus(ref));
    const msg = got.length ? 'Found ' + got.join(', ') : left.length ? '' : 'Nothing useful here';
    if (msg) g.hud.loot(msg);
    if (left.length) g.hud.toast(`Pack full. Left behind: ${left.map((e) => itemName(e.kind, e.id, e.n)).join(', ')}`, 3.5);
    g.markDirty && g.markDirty();
  }
  update(dt) {
    const g = this.game, inp = g.input;
    if (g.player.dead || g.buildMode?.active) { g.hud.setPrompt(null); return; }
    const cands = this.candidates();
    // prefer what the camera faces
    const f = g.tpc.forward;
    let best = null, bs = -Infinity;
    for (const c of cands) {
      const dx = c.pos[0] - g.player.pos.x, dz = c.pos[2] - g.player.pos.z;
      const l = Math.hypot(dx, dz) || 1;
      const facing = (dx * f.x + dz * f.z) / l;
      const s = facing * 1.5 - c.dist;
      if (s > bs) { bs = s; best = c; }
    }
    // candidates are rebuilt every frame: compare what they point at
    if (!best || !this.target || best.ref !== this.target.ref) this.hold = 0;
    this.target = best;
    if (!best) { g.hud.setPrompt(null); return; }
    if (best.kind === 'door') {
      const d = best.ref;
      g.hud.setPrompt(d.broken ? 'Broken door' : d.open ? 'Close door' : 'Open door');
      if (inp.pressed('KeyE') && !d.broken) g.world.toggleDoor(d);
    } else if (best.kind === 'loot') {
      const holding = inp.down('KeyE');
      if (holding) this.hold += dt; else this.hold = Math.max(0, this.hold - dt * 2);
      const T = 1.3 * (g.mods ? g.mods.search : 1);
      g.hud.setPrompt(best.ref.label || 'Search', 'Hold E', this.hold > 0 ? this.hold / T : null);
      g.player.noise = Math.max(g.player.noise, holding ? 4 : 0);
      if (this.hold >= T) { this.hold = 0; this.finishSearch(best.ref); }
    } else if (best.kind === 'npc') {
      const n = best.ref;
      g.hud.setPrompt(`Talk to ${n.first}`);
      if (inp.pressed('KeyE')) { g.society.ui.openTalk(n); inp.pressedSet.delete('KeyE'); }
    } else if (best.kind === 'revive') {
      const n = best.ref;
      const holding = inp.down('KeyE');
      if (holding) this.hold += dt; else this.hold = Math.max(0, this.hold - dt * 2);
      g.hud.setPrompt(`Help ${n.first} up`, 'Hold E', this.hold > 0 ? this.hold / 1.6 : null);
      if (this.hold >= 1.6) { this.hold = 0; n.revive(g.player); }
    } else if (best.kind === 'flag') {
      g.hud.setPrompt(isTouch ? 'Hold Use to pack up this claim' : 'Hold E to pack up this claim', 'Hold E', this.hold > 0 ? this.hold / 2 : null);
      if (inp.down('KeyE')) this.hold += dt; else this.hold = 0;
      if (this.hold > 2) { this.hold = 0; g.claims.remove(best.ref); }
    }
  }
}

// ---------------- combat ----------------
export class Combat {
  constructor(game) {
    this.game = game;
    this.tracers = [];
    const mat = new THREE.LineBasicMaterial({ color: 0xffe8a0, transparent: true, opacity: 0.8 });
    this.tracerMat = mat;
    this.muzzle = new THREE.PointLight(0xffc070, 0, 8);
    game.scene.add(this.muzzle);
  }
  melee(player) {
    const g = this.game;
    const fx = Math.sin(player.facing), fz = Math.cos(player.facing);
    const cm = player.body ? conditionMods(player.body) : { melee: 1 };
    let hit = 0;
    const people = g.society ? g.society.hittable() : [];
    for (const z of [...g.zombies.list, ...people]) {
      if (z.dead) continue;
      const dx = z.pos.x - player.pos.x, dz = z.pos.z - player.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > player.weapon.reach + 0.3 || Math.abs(z.pos.y - player.pos.y) > 1.4) continue;
      const dot = (dx * fx + dz * fz) / (d || 1);
      if (dot < 0.25) continue;
      const dmg = player.weapon.damage * (0.85 + Math.random() * 0.3) * cm.melee;
      if (z.hurt) z.hurt(dmg, dx / (d || 1), dz / (d || 1), 'melee');
      else {
        // a sleeping or unaware person takes a sneak attack hard
        const unaware = z.sleeping || (z.rcamp && z.rcamp.state === 'calm' && !z.combatTarget);
        z.damage(dmg * (unaware && player.crouch ? 3.2 : unaware ? 1.6 : 1), player);
        g.society.onPlayerHit(z);
      }
      hit++;
      if (hit >= 2) break;
    }
    if (hit) g.audio && g.audio.thud();
    else g.audio && g.audio.swoosh();
  }
  // a shot from the gun in hand. aim: { origin, dir } fires from the gun
  // itself (top view), otherwise along the camera
  shoot(player, aim = null) {
    const g = this.game, gun = player.gun;
    if (!gun) return;
    const def = GUNS[gun.id];
    if (gun.mag <= 0) { player.startReload(); return; }
    gun.mag--;
    const cam = g.camera;
    const base = new THREE.Vector3();
    if (aim) base.copy(aim.dir); else cam.getWorldDirection(base);
    const cm = player.body ? conditionMods(player.body) : { spread: 1 };
    const moving = Math.min(1, player.speed / 4);
    const spread = def.spread * (player.aiming ? (def.scope ? 0.04 : def.quick ? 0.15 : 0.25) : 1) * (g.mods ? g.mods.spread : 1) * cm.spread * (1 + moving * 0.7) * (def.pellets > 1 ? 1 : 1);
    const o = aim ? aim.origin.clone() : cam.position.clone();
    const tMin = aim ? 0.1 : Math.max(0, o.distanceTo(player.pos) - 0.8);
    const hand = player.muzzleWorld ? player.muzzleWorld(new THREE.Vector3()) : player.char.handWorld(new THREE.Vector3());
    const people = g.society ? g.society.hittable() : [];
    const targets = [...g.zombies.list, ...people];
    const dealt = new Map();
    let anyHead = false;
    for (let i = 0; i < def.pellets; i++) {
      const dir = base.clone();
      const a = Math.random() * Math.PI * 2, r = spread * Math.sqrt(Math.random());
      const up = Math.abs(dir.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      const sx = new THREE.Vector3().crossVectors(dir, up).normalize(), sy = new THREE.Vector3().crossVectors(sx, dir).normalize();
      dir.addScaledVector(sx, Math.cos(a) * r).addScaledVector(sy, Math.sin(a) * r).normalize();
      const reach = Math.min(def.range * 2.2, 250);
      const wr = g.physics.raycast(o.x, o.y, o.z, dir.x, dir.y, dir.z, reach, { skipGlass: false });
      let best = wr.dist, target = null, head = false;
      for (const z of targets) {
        if (z.dead) continue;
        // ray vs vertical capsule (approximate as cylinder r=0.33)
        const cx = z.pos.x - o.x, cz = z.pos.z - o.z;
        const A = dir.x * dir.x + dir.z * dir.z;
        const B = -2 * (cx * dir.x + cz * dir.z);
        const C = cx * cx + cz * cz - 0.33 * 0.33;
        const disc = B * B - 4 * A * C;
        if (disc < 0) continue;
        const t = (-B - Math.sqrt(disc)) / (2 * A);
        if (t < tMin || t > best) continue;
        const y = o.y + dir.y * t - z.pos.y;
        if (y < 0 || y > 1.8) continue;
        best = t; target = z; head = y > 1.48;
      }
      if (i < 4) {
        const end = o.clone().addScaledVector(dir, best);
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([hand, end]), this.tracerMat);
        g.scene.add(line);
        this.tracers.push({ line, t: 0.06 });
      }
      if (target) {
        const fall = Math.max(0.25, 1 - Math.max(0, best - def.range) / def.range);
        const dmg = def.dmg * fall * (g.mods ? g.mods.gun : 1) * (head ? (def.pellets > 1 ? 1.5 : 2.6) : 1);
        dealt.set(target, (dealt.get(target) || 0) + dmg);
        if (head && def.pellets === 1) anyHead = true;
      }
    }
    for (const [t, dmg] of dealt) {
      const dx = t.pos.x - player.pos.x, dz = t.pos.z - player.pos.z, dd = Math.hypot(dx, dz) || 1;
      if (t.hurt) t.hurt(dmg, dx / dd, dz / dd, def.knock ? 'melee' : anyHead ? 'head' : 'shot');
      else { t.damage(dmg, player); g.society.onPlayerHit(t); }
    }
    if (anyHead && dealt.size) g.hud.toast('Headshot', 0.8);
    this.muzzle.position.copy(hand);
    this.muzzle.intensity = 6;
    // the kick (third person only)
    if (!aim && g.tpc) g.tpc.pitch = Math.min(0.95, g.tpc.pitch + def.recoil * 0.012);
    if (gun.mag === 0) setTimeout(() => player.gun === gun && player.startReload(), 250);
    // gunshots are loud; some louder than others
    g.zombies.alertNoise(player.pos, def.noise);
    if (g.society) g.society.raiders.hear(player.pos, def.noise * 1.2, null);
    g.audio && g.audio.gunshot(Math.min(1.3, def.noise / 70));
  }
  update(dt) {
    for (const tr of this.tracers) {
      tr.t -= dt;
      if (tr.t <= 0) { this.game.scene.remove(tr.line); tr.line.geometry.dispose(); }
    }
    this.tracers = this.tracers.filter((t) => t.t > 0);
    this.muzzle.intensity = Math.max(0, this.muzzle.intensity - dt * 80);
  }
}
