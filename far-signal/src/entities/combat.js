import * as THREE from 'three';
import { addLight } from '../gfx/globals.js';
import { ITEMS } from '../game/data.js';

const glowMat = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);

// Projectiles, beam segments and loot orbs. Everything is pooled.
export class Combat {
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    this.bolts = [];
    const boltGeo = new THREE.CapsuleGeometry(0.055, 0.7, 2, 6).rotateX(Math.PI / 2);
    for (let i = 0; i < 48; i++) {
      const m = new THREE.Mesh(boltGeo, glowMat(0xffffff));
      m.visible = false; m.frustumCulled = false;
      this.group.add(m);
      this.bolts.push({ mesh: m, alive: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, dmg: 0, enemy: false, col: [1, 1, 1] });
    }
    this.segs = [];
    const segGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true).rotateX(Math.PI / 2);
    for (let i = 0; i < 64; i++) {
      const m = new THREE.Mesh(segGeo, glowMat(0xffffff));
      m.visible = false; m.frustumCulled = false;
      this.group.add(m);
      this.segs.push({ mesh: m, life: 0, max: 1 });
    }
    this.loot = [];
    const lootGeo = new THREE.OctahedronGeometry(0.13);
    for (let i = 0; i < 40; i++) {
      const m = new THREE.Mesh(lootGeo, glowMat(0xffffff));
      m.visible = false; m.frustumCulled = false;
      this.group.add(m);
      this.loot.push({ mesh: m, alive: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), item: null, t: 0 });
    }
    this.beamOn = false;
  }

  clear() {
    for (const b of this.bolts) { b.alive = false; b.mesh.visible = false; }
    for (const s of this.segs) { s.life = 0; s.mesh.visible = false; }
    for (const l of this.loot) { l.alive = false; l.mesh.visible = false; }
  }

  _bolt(pos, dir, speed, dmg, enemy, color, scale = 1) {
    const b = this.bolts.find((x) => !x.alive) || this.bolts[0];
    b.alive = true; b.pos.copy(pos); b.vel.copy(dir).multiplyScalar(speed); b.life = enemy ? 4 : 1.5; b.dmg = dmg; b.enemy = enemy; b.col = color;
    b.mesh.visible = true;
    b.mesh.material.color.setRGB(color[0] * 2.5, color[1] * 2.5, color[2] * 2.5);
    b.mesh.scale.set(enemy ? 3.2 * scale : 1, enemy ? 3.2 * scale : 1, enemy ? 0.45 * scale : 1);
    b.mesh.position.copy(pos);
    b.mesh.lookAt(tmp.copy(pos).add(dir));
    return b;
  }
  playerBolt(pos, dir, dmg, color) { return this._bolt(pos, dir, 85, dmg, false, color); }
  enemyBolt(pos, dir, speed, dmg, color) { return this._bolt(pos, dir, speed, dmg, true, color || [1, 0.5, 0.4]); }

  // One glowing segment between two points that fades over `life` seconds.
  segment(a, b, radius, color, life = 0.08) {
    const s = this.segs.find((x) => x.life <= 0) || this.segs[0];
    const len = a.distanceTo(b);
    s.mesh.position.copy(a).add(b).multiplyScalar(0.5);
    s.mesh.lookAt(b);
    s.mesh.scale.set(radius, radius, len);
    s.mesh.material.color.setRGB(color[0] * 2.2, color[1] * 2.2, color[2] * 2.2);
    s.mesh.material.opacity = 1;
    s.mesh.visible = true;
    s.life = life; s.max = life;
  }

  // Jagged lightning between two points.
  arc(a, b, color, life = 0.22) {
    const n = Math.max(3, Math.min(9, Math.round(a.distanceTo(b) / 1.6)));
    let prev = a.clone();
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const p = a.clone().lerp(b, t);
      if (i < n) p.add(tmp.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(1.1));
      this.segment(prev, p, 0.05, color, life);
      prev = p;
    }
  }

  spawnLoot(pos, item) {
    const l = this.loot.find((x) => !x.alive) || this.loot[0];
    l.alive = true; l.item = item; l.t = 0;
    l.pos.copy(pos);
    l.vel.set((Math.random() - 0.5) * 4, 4 + Math.random() * 3, (Math.random() - 0.5) * 4);
    l.mesh.material.color.set(ITEMS[item].color).multiplyScalar(2);
    l.mesh.visible = true;
  }

  update(dt) {
    const g = this.game, w = g.world, p = g.player;
    for (const b of this.bolts) {
      if (!b.alive) continue;
      b.life -= dt;
      const step = tmp.copy(b.vel).multiplyScalar(dt);
      const from = b.pos, len = step.length();
      let hit = false;
      if (b.enemy) {
        tmp2.copy(from).add(step);
        const cx = p.pos.x, cy = p.pos.y + 1.0, cz = p.pos.z;
        if (!p.dead && Math.hypot(tmp2.x - cx, tmp2.z - cz) < 0.75 && Math.abs(tmp2.y - cy) < 1.2) { p.damage(b.dmg, from); hit = true; }
      } else {
        // swept sphere test against creatures
        const dir = tmp2.copy(b.vel).normalize();
        let best = null, bestT = len;
        for (const c of g.creatures) {
          if (c.dead) continue;
          const cc = c.center(_c);
          const ox = cc.x - from.x, oy = cc.y - from.y, oz = cc.z - from.z;
          const t = ox * dir.x + oy * dir.y + oz * dir.z;
          if (t < -c.radius || t > len + c.radius) continue;
          const px = ox - dir.x * t, py = oy - dir.y * t, pz = oz - dir.z * t;
          const rr = c.radius + 0.25;
          if (px * px + py * py + pz * pz < rr * rr && t < bestT + c.radius) { best = c; bestT = t; }
        }
        if (best) {
          best.damage(b.dmg, from);
          g.ui.floatText(best.center(_c), Math.round(b.dmg), '#ffe9a8');
          g.audio.play('hit', 0.5);
          hit = true;
        }
      }
      b.pos.add(step);
      if (!hit && (b.life <= 0 || w.solidAt(b.pos.x, b.pos.y, b.pos.z))) hit = true;
      if (hit) {
        b.alive = false; b.mesh.visible = false;
        g.particles.burst(b.pos, b.enemy ? 8 : 10, 5, 0.35, 0.7, b.col[0], b.col[1], b.col[2], { gravity: 3 });
        continue;
      }
      b.mesh.position.copy(b.pos);
      if (b.enemy) addLight(b.pos.x, b.pos.y, b.pos.z, 5, b.col[0] * 0.8, b.col[1] * 0.8, b.col[2] * 0.8);
    }
    for (const s of this.segs) {
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) { s.mesh.visible = false; continue; }
      s.mesh.material.opacity = s.life / s.max;
    }
    for (const l of this.loot) {
      if (!l.alive) continue;
      l.t += dt;
      const dx = p.pos.x - l.pos.x, dy = p.pos.y + 1 - l.pos.y, dz = p.pos.z - l.pos.z;
      const d = Math.hypot(dx, dy, dz);
      if (l.t > 0.5 && d < 7 && !p.dead) {
        const pull = 22 / Math.max(d, 0.6);
        l.vel.x += (dx / d) * pull * dt * 6; l.vel.y += (dy / d) * pull * dt * 6; l.vel.z += (dz / d) * pull * dt * 6;
        l.vel.multiplyScalar(1 - Math.min(1, dt * 3));
        if (d < 1.0) {
          l.alive = false; l.mesh.visible = false;
          g.give(l.item, 1);
          continue;
        }
      } else {
        l.vel.y -= 14 * dt;
        const gy = w.groundAt(l.pos.x, l.pos.z, l.pos.y + 1) + 0.45;
        if (l.pos.y < gy) { l.pos.y = gy; l.vel.y = Math.abs(l.vel.y) * 0.3; l.vel.x *= 0.6; l.vel.z *= 0.6; }
      }
      l.pos.addScaledVector(l.vel, dt);
      l.mesh.position.copy(l.pos);
      l.mesh.rotation.y += dt * 3; l.mesh.rotation.x += dt * 1.7;
      if (l.t > 90) { l.alive = false; l.mesh.visible = false; }
    }
  }
}
const _c = new THREE.Vector3();
