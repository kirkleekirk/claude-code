import * as THREE from 'three';
import { Terrain } from './terrain.js';
import { Flora } from './flora.js';
import { Nodes } from './nodes.js';
import { Colliders } from '../core/colliders.js';
import { buildGate, buildStation, buildVaultEntrance, buildSpire, buildWreckage } from './structures.js';
import { STATIONS } from '../game/data.js';
import { addLight } from '../gfx/globals.js';

// Camp layout: offsets from the landing site and facing.
export const STATION_PADS = {
  still: { x: -11, z: 6, ry: 0.9, cat: 'supply' },
  fabricator: { x: 11, z: 7, ry: -0.8, cat: 'gear' },
  biolab: { x: -15, z: -6, ry: 1.3, cat: 'serum' },
  refinery: { x: 15, z: -7, ry: -1.3, cat: 'supply' },
  forge: { x: 0, z: -17, ry: 0, cat: 'suit' },
};

export const VAULTS = {
  echoes: { name: 'Vault of Echoes', poi: 'vaultEchoes', color: 0x35f0e0, rise: 0.9, face: [1, 0.2], key: 1 },
  embers: { name: 'Vault of Embers', poi: 'vaultEmbers', color: 0xff8a30, rise: 2.8, face: [-1, 0.25], key: 2 },
  tides: { name: 'Vault of Tides', poi: 'vaultTides', color: 0x6fa8ff, rise: 0.9, face: [1, 0.55], key: 3 },
};

export class PlanetWorld {
  constructor(game, def, data) {
    this.game = game; this.def = def; this.type = 'planet';
    this.sea = def.hasWater ? def.sea : -1e9;
    this.flyFloor = this.sea;
    this.gravity = def.gravity;
    this.group = new THREE.Group();
    this.colliders = new Colliders();
    this.terrain = new Terrain(game.gfx, data);
    this.group.add(this.terrain.group);
    this.interactables = [];
    this.lights = [];
    this._buildSites();
    this.flora = new Flora(game.gfx, this.terrain, def, this.colliders);
    this.group.add(this.flora.group);
    this.nodes = new Nodes(game, this);
    this.group.add(this.nodes.group);
    this.refresh();
  }

  _buildSites() {
    const { def, game } = this;
    const s = game.state;
    const L = def.pois.landing;
    this.base = new THREE.Vector3(L.x, L.flat, L.z);
    // --- Gate
    this.gate = buildGate();
    this.gate.position.copy(this.base);
    this.group.add(this.gate);
    this.colliders.addCircle(L.x, L.z, 3.5, L.flat + 0.62, { walk: true });
    this.colliders.addCircle(L.x - 2.5, L.z, 0.75, L.flat + 3, { walk: false });
    this.colliders.addCircle(L.x + 2.5, L.z, 0.75, L.flat + 3, { walk: false });
    this.interactables.push({
      id: 'gate', pos: new THREE.Vector3(L.x, L.flat + 1.2, L.z + 2.2), r: 4.2,
      label: () => (s.stations.gate ? (def.kind === 'veyra' ? 'Travel to Korr' : 'Return to Veyra') : 'Lattice Gate: burnt out. Repair it from Craft'),
      act: () => { if (s.stations.gate) game.travel(def.kind === 'veyra' ? 'korr' : 'veyra'); else game.ui.openPanel('craft', 'build'); },
    });
    this.lights.push({ x: L.x, y: L.flat + 3.2, z: L.z, r: 14, c: [0.25, 0.8, 0.9], on: () => s.stations.gate });

    if (def.kind === 'veyra') {
      const wreck = buildWreckage();
      wreck.position.copy(this.base);
      this.group.add(wreck);
      // --- Stations (shown once built)
      this.stations = {};
      for (const id in STATION_PADS) {
        const pad = STATION_PADS[id];
        const m = buildStation(id);
        const x = L.x + pad.x, z = L.z + pad.z;
        m.position.set(x, this.terrain.heightAt(x, z) - 0.05, z);
        m.rotation.y = pad.ry;
        m.visible = false;
        this.group.add(m);
        const col = this.colliders.addCircle(x, z, 1.5, m.position.y + 2.2, { walk: false });
        col.dead = true;
        this.stations[id] = { mesh: m, col, grow: 1 };
        this.interactables.push({
          id: 'st_' + id, pos: new THREE.Vector3(x, m.position.y + 1.2, z), r: 3.6,
          label: () => (s.stations[id] ? 'Use ' + STATIONS[id].name : null),
          act: () => game.ui.openPanel('craft', pad.cat),
        });
        const lc = { still: [0.3, 0.9, 0.5], fabricator: [0.3, 0.8, 0.9], biolab: [0.3, 0.9, 0.6], refinery: [1.0, 0.45, 0.12], forge: [0.35, 0.6, 1.0] }[id];
        this.lights.push({ x, y: m.position.y + 1.6, z, r: 9, c: lc, on: () => s.stations[id] });
      }
      // --- Vault entrances
      this.vaultDoors = {};
      for (const id in VAULTS) {
        const v = VAULTS[id], p = def.pois[v.poi];
        const e = buildVaultEntrance(v.color, v.rise, v.key * 7);
        const ry = Math.atan2(v.face[0], v.face[1]);
        e.position.set(p.x, p.flat, p.z);
        e.rotation.y = ry;
        this.group.add(e);
        const cs = Math.cos(ry), sn = Math.sin(ry);
        const W = (lx, lz) => [p.x + lx * cs + lz * sn, p.z - lx * sn + lz * cs];
        const top = p.flat + v.rise;
        let q = W(0, 0); this.colliders.addBox(q[0], q[1], 8, 7, -ry, top, { walk: true });
        if (v.rise <= 1) { q = W(0, 7.7); this.colliders.addBox(q[0], q[1], 3.2, 0.75, -ry, p.flat + v.rise * 0.5, { walk: true }); }
        for (const sx of [-1, 1]) {
          q = W(sx * 3.3, -3.2); this.colliders.addBox(q[0], q[1], 1.1, 1.2, -ry, top + 8, { walk: false, bottom: top - 0.1 });
          q = W(sx * 6.4, 4.6); this.colliders.addCircle(q[0], q[1], 0.8, top + 10, { walk: false, bottom: top - 0.1 });
        }
        q = W(0, -4.0); this.colliders.addBox(q[0], q[1], 2.3, 0.5, -ry, top + 8, { walk: false, bottom: top - 0.1 });
        q = W(0, -1.6);
        this.vaultDoors[id] = e.userData.door;
        const need = () => {
          if (!s.unlocks.cipher) return 'The door repeats a tone. You need a Glyph Cipher';
          if (s.keystones < v.key - 1) return 'The glyphs stay dark. Another vault comes first';
          return null;
        };
        this.interactables.push({
          id: 'vault_' + id, pos: new THREE.Vector3(q[0], top + 1.2, q[1]), r: 3.4,
          label: () => need() || (s.keystones >= v.key ? 'Re-enter the ' + v.name : 'Enter the ' + v.name),
          act: () => { const n = need(); if (n) game.ui.toast(n, 'warn'); else game.enterVault(id); },
          locked: () => !!need(),
        });
        const c = new THREE.Color(v.color);
        this.lights.push({ x: q[0], y: top + 3, z: q[1], r: 12, c: [c.r, c.g, c.b], on: () => true });
      }
      // --- Spire
      const sp = def.pois.spire;
      this.spire = buildSpire();
      this.spire.position.set(sp.x, sp.flat, sp.z);
      this.group.add(this.spire);
      this.spireBase = new THREE.Vector3(sp.x, sp.flat, sp.z);
      this.colliders.addCircle(sp.x, sp.z, 38.6, sp.flat + 2.7, { walk: true });
      this.colliders.addCircle(sp.x, sp.z, 25.8, sp.flat + 5.4, { walk: true });
      this.colliders.addCircle(sp.x, sp.z, 6.7, sp.flat + 4000, { walk: false });
      for (let i = 0; i < 12; i++) {
        const z = i < 6 ? 44.5 - i : 31.5 - (i - 6);
        this.colliders.addBox(sp.x, sp.z + z, 4.5, 0.56, 0, sp.flat + (i + 1) * 0.45, { walk: true });
      }
      this.colliders.addBox(sp.x, sp.z + 11, 1.7, 0.7, 0, sp.flat + 5.4 + 1.3, { walk: false, bottom: sp.flat + 5 });
      this.interactables.push({
        id: 'spire', pos: new THREE.Vector3(sp.x, sp.flat + 6.4, sp.z + 12.4), r: 3.6,
        label: () => (s.flags.spireAwake ? 'The Spire is awake' : !s.flags.wardenDead ? null : s.keystones < 3 ? 'Three empty sockets' : 'Set the Keystones'),
        act: () => { if (s.flags.wardenDead && s.keystones >= 3 && !s.flags.spireAwake) game.activateSpire(); },
      });
    }
  }

  // Sync built stations, gate state and vault doors with the save state.
  refresh(animate = null) {
    const s = this.game.state;
    const gateOn = !!s.stations.gate;
    this.gate.rotation.set(gateOn ? 0 : -0.07, 0, gateOn ? 0 : 0.2);
    this.gate.position.y = this.base.y - (gateOn ? 0 : 0.35);
    this.gate.userData.body.material.uniforms.uMat2.value.x = gateOn ? 1.6 : 0.12;
    this.gate.userData.lattice.material.uniforms.uMat2.value.x = gateOn ? 2.2 : 0.1;
    this.gateOn = gateOn;
    if (this.stations) {
      for (const id in this.stations) {
        const st = this.stations[id], on = !!s.stations[id];
        if (on && !st.mesh.visible && animate === id) st.grow = 0;
        st.mesh.visible = on;
        st.col.dead = !on;
      }
    }
    if (this.vaultDoors) {
      for (const id in VAULTS) {
        const v = VAULTS[id];
        const locked = !s.unlocks.cipher || s.keystones < v.key - 1;
        this.vaultDoors[id].material.uniforms.uLocked.value = locked ? 1 : 0;
      }
    }
    if (this.spire) {
      const awake = !!s.flags.spireAwake;
      this.spire.userData.mat.uniforms.uMat2.value.x = awake ? 2.2 : 0.25;
      this.spire.userData.beam.visible = awake;
      this.spire.userData.beam.material.uniforms.uOn.value = awake ? 1 : 0;
    }
  }

  groundAt(x, z, feetY) { return this.colliders.groundAt(x, z, feetY, this.terrain.heightAt(x, z)); }

  resolve(pos, radius, feetY, headY) {
    const lim = this.terrain.half - 12;
    if (pos.x > lim) pos.x = lim; else if (pos.x < -lim) pos.x = -lim;
    if (pos.z > lim) pos.z = lim; else if (pos.z < -lim) pos.z = -lim;
    return this.colliders.resolve(pos, radius, feetY, headY);
  }

  solidAt(x, y, z) { return y < this.terrain.heightAt(x, z) || this.colliders.blocked(x, y, z); }

  walkable(x, z, y) {
    if (!this.terrain.inBounds(x, z, 14)) return false;
    const h = this.terrain.heightAt(x, z);
    if (h < this.sea + 0.35) return false;
    if (h - y > 1.3) return false;
    return !this.colliders.blocked(x, h + 0.6, z);
  }

  safeAt(x, z, extra = 0) {
    const r = (this.def.kind === 'veyra' ? 32 : 20) + extra;
    const dx = x - this.base.x, dz = z - this.base.z;
    return dx * dx + dz * dz < r * r;
  }

  spawnPoint() { return { pos: new THREE.Vector3(this.base.x + 0.5, this.base.y, this.base.z + 9), yaw: 0 }; }

  update(dt, camPos, playerPos) {
    const g = this.game;
    this.terrain.update(camPos, g.gfx.q.drawDist);
    this.flora.update(camPos, playerPos);
    this.nodes.update(dt);
    const u = this.gate.userData;
    const spin = this.gateOn ? 1 : 0.04;
    u.lattice.rotation.z += dt * 0.9 * spin;
    u.lattice2.rotation.z -= dt * 1.4 * spin;
    const po = u.portal.material.uniforms.uOn;
    po.value += ((this.gateOn ? 1 : 0) - po.value) * Math.min(1, dt * 2);
    u.portal.visible = po.value > 0.01;
    if (!this.gateOn && Math.random() < dt * 1.6) {
      g.particles.emit(this.base.x + (Math.random() - 0.5) * 4, this.base.y + 1 + Math.random() * 4, this.base.z + (Math.random() - 0.5), (Math.random() - 0.5) * 3, 2 + Math.random() * 3, (Math.random() - 0.5) * 3, 0.5, 0.5, 1, 0.6, 0.2, 9, 1);
    }
    if (this.stations) for (const id in this.stations) {
      const st = this.stations[id];
      if (st.grow < 1) { st.grow = Math.min(1, st.grow + dt * 1.3); const k = 1 - Math.pow(1 - st.grow, 3); st.mesh.scale.set(k, k, k); }
    }
    for (const l of this.lights) {
      if (!l.on()) continue;
      const d = Math.hypot(l.x - playerPos.x, l.z - playerPos.z);
      if (d < 70) addLight(l.x, l.y, l.z, l.r, l.c[0] * 1.3, l.c[1] * 1.3, l.c[2] * 1.3);
    }
  }

  dispose() {
    this.terrain.dispose(); this.flora.dispose(); this.nodes.dispose();
    this.group.traverse((o) => { if (o.isMesh && o.geometry && !o.isInstancedMesh) o.geometry.dispose(); });
  }
}
