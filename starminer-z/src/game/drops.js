// Items lying in the world: they pop out of a dug block, spin and bob, and fly to the player
// when they're close.

import * as THREE from 'three';
import { itemModel } from '../items/models.js';
import { ITEMS } from '../items/items.js';
import { SOLID } from '../world/blocks.js';

export class Drops {
  constructor(scene, world, propMat, blockMatFor, blockGeo) {
    this.scene = scene;
    this.world = world;
    this.mat = propMat;
    this.blockMatFor = blockMatFor;
    this.blockGeo = blockGeo;
    this.list = [];
    this.group = new THREE.Group();
    scene.add(this.group);
  }

  spawn(id, count, x, y, z, v = null) {
    const it = ITEMS[id];
    if (!it) return;
    let mesh;
    if (it.kind === 'block' && id !== 'torch') {
      mesh = new THREE.Mesh(this.blockGeo(), this.blockMatFor(it.block));
      mesh.scale.setScalar(0.25);
    } else {
      const m = itemModel(id);
      if (!m) return;
      mesh = new THREE.Mesh(m.geo, this.mat);
      mesh.scale.setScalar(it.kind === 'gun' ? 0.7 : 0.9);
    }
    mesh.position.set(x, y, z);
    this.group.add(mesh);
    this.list.push({ id, count, mesh, v: v || new THREE.Vector3((Math.random() - 0.5) * 2.5, 3 + Math.random() * 1.5, (Math.random() - 0.5) * 2.5), age: 0, spin: Math.random() * 6, rest: false });
  }

  // returns the drops picked up this frame: [{ id, count }]
  update(dt, player, inventory) {
    const out = [];
    const eye = new THREE.Vector3(player.pos.x, player.pos.y + 0.9, player.pos.z);
    for (let i = this.list.length - 1; i >= 0; i--) {
      const d = this.list[i];
      d.age += dt;
      const p = d.mesh.position;
      const to = eye.clone().sub(p);
      const dist = to.length();
      if (d.age > 0.45 && dist < 2.4 && !player.dead) {
        // drawn in
        d.v.lerp(to.normalize().multiplyScalar(9), Math.min(1, dt * 10));
        p.addScaledVector(d.v, dt);
        if (dist < 0.45) {
          const left = inventory.add(d.id, d.count);
          if (left < d.count) out.push({ id: d.id, count: d.count - left });
          if (left > 0) { d.count = left; d.age = -1.5; continue; }
          this.group.remove(d.mesh);
          this.list.splice(i, 1);
          continue;
        }
      } else {
        d.v.y -= 20 * dt;
        d.v.x *= 1 - Math.min(1, dt * 2); d.v.z *= 1 - Math.min(1, dt * 2);
        const ny = p.y + d.v.y * dt;
        if (SOLID[this.world.getBlock(p.x, ny - 0.12, p.z)]) { d.v.y = Math.abs(d.v.y) > 2 ? -d.v.y * 0.3 : 0; p.y = Math.floor(ny - 0.12) + 1.12; }
        else p.y = ny;
        const nx = p.x + d.v.x * dt, nz = p.z + d.v.z * dt;
        if (!SOLID[this.world.getBlock(nx, p.y, p.z)]) p.x = nx; else d.v.x = 0;
        if (!SOLID[this.world.getBlock(p.x, p.y, nz)]) p.z = nz; else d.v.z = 0;
      }
      d.mesh.rotation.y = d.spin + d.age * 2;
      // despawn after five minutes
      if (d.age > 300) { this.group.remove(d.mesh); this.list.splice(i, 1); }
    }
    return out;
  }

  clear() {
    for (const d of this.list) this.group.remove(d.mesh);
    this.list.length = 0;
  }
}
