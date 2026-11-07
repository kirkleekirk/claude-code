// Inventory, loot tables, interaction (doors, searching), and combat.
import * as THREE from 'three';

export const START_RES = { wood: 30, metal: 12, stone: 12, food: 3, meds: 2, ammo: 0, fuel: 0 };

export class Inventory {
  constructor() {
    this.res = { ...START_RES };
    this.claimKits = 1;
    this.weapons = { bat: true, pistol: false };
  }
  can(cost) { for (const k in cost) if ((this.res[k] || 0) < cost[k]) return false; return true; }
  pay(cost) { if (!this.can(cost)) return false; for (const k in cost) this.res[k] -= cost[k]; return true; }
  add(res) { for (const k in res) this.res[k] = (this.res[k] || 0) + res[k]; }
  toJSON() { return { res: this.res, claimKits: this.claimKits, weapons: this.weapons }; }
  load(j) { Object.assign(this.res, j.res || {}); this.claimKits = j.claimKits ?? this.claimKits; Object.assign(this.weapons, j.weapons || {}); }
}

// table -> list of [resource, min, max, chance]
const TABLES = {
  kitchen: [['food', 1, 4, 0.75], ['meds', 1, 1, 0.08], ['fuel', 1, 1, 0.06]],
  fridge: [['food', 1, 3, 0.6]],
  bedroom: [['meds', 1, 1, 0.25], ['ammo', 2, 6, 0.14], ['wood', 1, 2, 0.2], ['pistol', 1, 1, 0.04], ['kit', 1, 1, 0.03]],
  meds: [['meds', 1, 2, 0.6], ['food', 1, 1, 0.1]],
  office: [['ammo', 2, 5, 0.12], ['meds', 1, 1, 0.2], ['metal', 1, 2, 0.25], ['kit', 1, 1, 0.04]],
  store: [['food', 2, 5, 0.65], ['meds', 1, 2, 0.15], ['wood', 1, 2, 0.15]],
  hardware: [['metal', 2, 5, 0.7], ['wood', 2, 4, 0.5], ['stone', 1, 3, 0.35], ['fuel', 1, 1, 0.15]],
  register: [['ammo', 3, 8, 0.25], ['pistol', 1, 1, 0.08]],
  bar: [['food', 1, 3, 0.5], ['fuel', 1, 2, 0.3]],
  laundry: [['meds', 1, 1, 0.12], ['wood', 1, 1, 0.2]],
  garage: [['metal', 2, 4, 0.6], ['wood', 1, 3, 0.5], ['fuel', 1, 2, 0.35]],
  workshop: [['metal', 2, 5, 0.7], ['wood', 1, 3, 0.4], ['stone', 1, 2, 0.2]],
  crate: [['wood', 2, 5, 0.6], ['metal', 1, 3, 0.4], ['food', 1, 2, 0.25], ['stone', 1, 2, 0.2]],
  fuel: [['fuel', 2, 4, 0.8]],
  car: [['fuel', 1, 2, 0.6], ['metal', 1, 2, 0.4], ['ammo', 2, 4, 0.08], ['food', 1, 1, 0.2]],
  truck: [['fuel', 1, 3, 0.6], ['metal', 2, 3, 0.5], ['wood', 1, 3, 0.3], ['ammo', 3, 6, 0.1]],
};
const NAMES = { wood: 'Wood', metal: 'Metal', stone: 'Stone', food: 'Food', meds: 'Meds', ammo: 'Ammo', fuel: 'Fuel' };

export function rollLoot(table, inv) {
  const t = TABLES[table] || TABLES.crate;
  const got = [];
  for (const [k, a, b, p] of t) {
    if (Math.random() > p) continue;
    const n = a + Math.floor(Math.random() * (b - a + 1));
    if (k === 'pistol') {
      if (!inv.weapons.pistol) { inv.weapons.pistol = true; got.push('a pistol (Q to switch)'); inv.res.ammo += 6; }
      continue;
    }
    if (k === 'kit') { inv.claimKits += 1; got.push('a claim kit'); continue; }
    inv.res[k] += n;
    got.push(`${n} ${NAMES[k]}`);
  }
  return got;
}

// ---------------- interaction ----------------
export class Interaction {
  constructor(game) {
    this.game = game;
    this.target = null;
    this.hold = 0;
  }
  candidates() {
    const g = this.game, p = g.player.pos;
    const out = [];
    for (const d of g.world.doors) {
      const c = d.center;
      if (Math.abs(c[1] - 1 - p.y) > 1.5) continue;
      const dist = Math.hypot(c[0] - p.x, c[2] - p.z);
      if (dist < 2.1) out.push({ kind: 'door', ref: d, pos: c, dist });
    }
    const pushLoot = (it) => {
      if (it.searched) return;
      if (Math.abs(it.pos[1] - p.y - 0.8) > 1.6) return;
      const dist = Math.hypot(it.pos[0] - p.x, it.pos[2] - p.z);
      if (dist < 1.9) out.push({ kind: 'loot', ref: it, pos: it.pos, dist });
    };
    for (const S of g.world.structures) {
      const b = S._bb || (S._bb = S.bounds());
      if (!b || p.x < b.wx0 - 3 || p.x > b.wx1 + 3 || p.z < b.wz0 - 3 || p.z > b.wz1 + 3) continue;
      for (const it of S.interact) pushLoot(it);
    }
    for (const it of g.world.carLoot || []) pushLoot(it);
    if (g.claims) for (const c of g.claims.list) {
      const dist = Math.hypot(c.flag[0] - p.x, c.flag[2] - p.z);
      if (dist < 2) out.push({ kind: 'flag', ref: c, pos: c.flag, dist });
    }
    return out;
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
    if (best !== this.target) this.hold = 0;
    this.target = best;
    if (!best) { g.hud.setPrompt(null); return; }
    if (best.kind === 'door') {
      const d = best.ref;
      g.hud.setPrompt(d.broken ? 'Broken door' : d.open ? 'Close door' : 'Open door');
      if (inp.pressed('KeyE') && !d.broken) g.world.toggleDoor(d);
    } else if (best.kind === 'loot') {
      const holding = inp.down('KeyE');
      if (holding) this.hold += dt; else this.hold = Math.max(0, this.hold - dt * 2);
      const T = 1.3;
      g.hud.setPrompt(best.ref.label || 'Search', 'Hold E', this.hold > 0 ? this.hold / T : null);
      g.player.noise = Math.max(g.player.noise, holding ? 4 : 0);
      if (this.hold >= T) {
        this.hold = 0;
        best.ref.searched = true;
        if (best.ref.prop) best.ref.prop.searched = true;
        const got = rollLoot(best.ref.table, g.inventory);
        g.hud.toast(got.length ? 'Found ' + got.join(', ') : 'Nothing useful here', 2.5);
        g.markDirty && g.markDirty();
      }
    } else if (best.kind === 'flag') {
      g.hud.setPrompt('Hold E to pack up this claim', 'Hold E', this.hold > 0 ? this.hold / 2 : null);
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
    let hit = 0;
    for (const z of g.zombies.list) {
      if (z.dead) continue;
      const dx = z.pos.x - player.pos.x, dz = z.pos.z - player.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > player.weapon.reach + 0.3 || Math.abs(z.pos.y - player.pos.y) > 1.4) continue;
      const dot = (dx * fx + dz * fz) / (d || 1);
      if (dot < 0.25) continue;
      z.hurt(player.weapon.damage * (0.85 + Math.random() * 0.3), dx / (d || 1), dz / (d || 1), 'melee');
      hit++;
      if (hit >= 2) break;
    }
    if (hit) g.audio && g.audio.thud();
    else g.audio && g.audio.swoosh();
  }
  shoot(player) {
    const g = this.game, inv = g.inventory;
    if (inv.res.ammo <= 0) { g.hud.toast('Out of ammo', 1.5); return; }
    inv.res.ammo--;
    const cam = g.camera;
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    const spread = player.aiming ? 0.008 : 0.04;
    dir.x += (Math.random() - 0.5) * spread; dir.y += (Math.random() - 0.5) * spread; dir.z += (Math.random() - 0.5) * spread;
    dir.normalize();
    const o = cam.position.clone();
    // world hit distance
    const wr = g.physics.raycast(o.x, o.y, o.z, dir.x, dir.y, dir.z, 120, { skipGlass: false, filter: (b) => b.kind !== 'tree' || true });
    let best = wr.dist, target = null, head = false;
    for (const z of g.zombies.list) {
      if (z.dead) continue;
      // ray vs vertical capsule (approximate as cylinder r=0.33)
      const cx = z.pos.x - o.x, cz = z.pos.z - o.z;
      const a = dir.x * dir.x + dir.z * dir.z;
      const b = -2 * (cx * dir.x + cz * dir.z);
      const c = cx * cx + cz * cz - 0.33 * 0.33;
      const disc = b * b - 4 * a * c;
      if (disc < 0) continue;
      const t = (-b - Math.sqrt(disc)) / (2 * a);
      if (t < 0 || t > best) continue;
      const y = o.y + dir.y * t - z.pos.y;
      if (y < 0 || y > 1.8) continue;
      best = t; target = z; head = y > 1.48;
    }
    const end = o.clone().addScaledVector(dir, best);
    const hand = player.muzzleWorld ? player.muzzleWorld(new THREE.Vector3()) : player.char.handWorld(new THREE.Vector3());
    const geo = new THREE.BufferGeometry().setFromPoints([hand, end]);
    const line = new THREE.Line(geo, this.tracerMat);
    g.scene.add(line);
    this.tracers.push({ line, t: 0.06 });
    this.muzzle.position.copy(hand);
    this.muzzle.intensity = 6;
    if (target) {
      target.hurt(head ? 140 : 45, dir.x, dir.z, head ? 'head' : 'shot');
      if (head) g.hud.toast('Headshot', 0.8);
    }
    // gunshots are loud
    g.zombies.alertNoise(player.pos, 70);
    g.audio && g.audio.gunshot();
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
