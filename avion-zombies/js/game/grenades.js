import * as THREE from '../../vendor/three.module.min.js';
import { audio } from '../engine/audio.js';
import { rand } from '../util.js';

// Frag grenades and the Avion lure drone (tactical decoy).
export class Grenades {
  constructor(game) {
    this.game = game;
    this.list = [];
    const olive = new THREE.MeshStandardMaterial({ color: 0x4b5237, roughness: 0.7, metalness: 0.3 });
    this.fragGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.11, 10);
    this.fragMat = olive;
    this.droneMat = new THREE.MeshStandardMaterial({ color: 0x2d3136, roughness: 0.5, metalness: 0.6 });
    this.droneLight = new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 0.5, 0.3) });
  }

  reset() {
    for (const g of this.list) this.game.scene.remove(g.mesh);
    this.list = [];
  }

  activeLure() {
    return this.list.find((g) => g.kind === 'lure' && g.deployed && !g.dead) || null;
  }

  throw(kind, pos, vel) {
    let mesh;
    if (kind === 'frag') {
      mesh = new THREE.Mesh(this.fragGeo, this.fragMat);
    } else {
      mesh = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.07, 0.22), this.droneMat);
      mesh.add(body);
      for (const [x, z] of [[-0.16, -0.16], [0.16, -0.16], [-0.16, 0.16], [0.16, 0.16]]) {
        const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.01, 10), this.droneMat);
        rotor.position.set(x, 0.05, z);
        mesh.add(rotor);
      }
      const light = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), this.droneLight);
      light.position.y = -0.04;
      mesh.add(light);
    }
    mesh.position.copy(pos);
    mesh.castShadow = true;
    this.game.scene.add(mesh);
    this.list.push({ kind, mesh, pos: pos.clone(), vel: vel.clone(), t: 0, fuse: 2.4, deployed: false, dead: false, beepT: 0, hp: 6, settled: false });
  }

  update(dt) {
    const game = this.game;
    const phys = game.world.physics;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const g = this.list[i];
      g.t += dt;
      if (g.kind === 'lure' && g.deployed) {
        // hover and beep, then detonate
        g.life -= dt;
        g.mesh.position.set(g.pos.x + Math.sin(g.t * 2) * 0.05, g.pos.y + Math.sin(g.t * 3) * 0.06, g.pos.z);
        g.mesh.rotation.y += dt * 2;
        g.beepT -= dt;
        if (g.beepT <= 0) {
          g.beepT = Math.max(0.12, 0.6 * (g.life / 8));
          audio.play3D('drone_beep', g.pos, { volume: 0.9, refDistance: 6 });
          this.droneLight.color.setRGB(6, 0.5, 0.3);
        } else this.droneLight.color.setRGB(1.2, 0.1, 0.1);
        if (g.life <= 0 || g.hp <= 0) {
          game.explode(g.pos.clone(), 8, 3200 + game.director.round * 300, { noSelf: false });
          game.scene.remove(g.mesh);
          g.dead = true;
          this.list.splice(i, 1);
          game.zombies.markFlowDirty();
        }
        continue;
      }
      // ballistic flight with bounces
      if (!g.settled) {
        g.vel.y -= 18 * dt;
        const step = g.vel.clone().multiplyScalar(dt);
        const len = step.length();
        if (len > 1e-5) {
          const dir = step.clone().divideScalar(len);
          const hit = phys.raycast(g.pos.x, g.pos.y, g.pos.z, dir.x, dir.y, dir.z, len + 0.06, {});
          if (hit) {
            g.pos.set(hit.x - dir.x * 0.06, hit.y - dir.y * 0.06, hit.z - dir.z * 0.06);
            const n = new THREE.Vector3(hit.nx, hit.ny, hit.nz);
            const vn = g.vel.dot(n);
            g.vel.addScaledVector(n, -1.45 * vn).multiplyScalar(0.5);
            if (Math.abs(vn) > 2) audio.play3D('grenade_bounce', g.pos, { volume: Math.min(1, Math.abs(vn) / 8), refDistance: 3 });
            if (g.kind === 'lure') {
              g.deployed = true;
              g.life = 8;
              g.pos.y = hit.y + 1.5;
              g.mesh.rotation.set(0, 0, 0);
              game.zombies.markFlowDirty();
              audio.play3D('exo_equip', g.pos, { volume: 0.6, refDistance: 5 });
              continue;
            }
            if (g.vel.length() < 1.2 && hit.ny > 0.6) g.settled = true;
          } else g.pos.add(step);
        }
        g.mesh.position.copy(g.pos);
        g.mesh.rotation.x += dt * 9;
        g.mesh.rotation.z += dt * 5;
      }
      if (g.kind === 'frag') {
        if (g.t >= g.fuse) {
          game.explode(g.pos.clone(), 7, 260 + game.director.round * 70, {});
          game.scene.remove(g.mesh);
          this.list.splice(i, 1);
        }
      } else if (!g.deployed && g.t > 1.2) {
        g.deployed = true;
        g.life = 8;
        g.pos.y += 1.0;
        game.zombies.markFlowDirty();
      }
    }
  }
}
