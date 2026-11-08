// Claims: plant a flag to mark out a build area on the 2 m grid. A claim can
// take over an existing building that stands in its area (so you can rebuild
// a farmhouse your way) or start a fresh structure.
import * as THREE from 'three';
import { Structure } from './building/structure.js';
import { CELL } from './building/defs.js';
import { T } from './world/terrain.js';
import { isTouch } from './platform.js';

export const CLAIM_HALF = 10; // cells from the flag to the edge (40 m square)
const COLORS = ['#c4533a', '#d9a441', '#3f7cac', '#6a9a4a', '#8a4a9a'];

export class Claims {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.group = new THREE.Group();
    this.group.name = 'claims';
    game.scene.add(this.group);
    this.nextId = 1;
  }
  at(x, z, margin = 0) {
    for (const c of this.list) if (x >= c.x0 - margin && x <= c.x1 + margin && z >= c.z0 - margin && z <= c.z1 + margin) return c;
    return null;
  }
  // Can a claim be planted with its flag at grid vertex (vx, vz)?
  check(x, z) {
    const vx = Math.round(x / CELL), vz = Math.round(z / CELL);
    const x0 = (vx - CLAIM_HALF) * CELL, x1 = (vx + CLAIM_HALF) * CELL, z0 = (vz - CLAIM_HALF) * CELL, z1 = (vz + CLAIM_HALF) * CELL;
    if (this.game.inventory.claimKits <= 0) return { ok: false, why: 'You need a claim kit. Search houses and sheds for one.' };
    for (const c of this.list) if (!(x1 < c.x0 || x0 > c.x1 || z1 < c.z0 || z0 > c.z1)) return { ok: false, why: 'Too close to your other claim.' };
    const P = T.play;
    if (x0 < P.x0 || x1 > P.x1 || z0 < P.z0 || z1 > P.z1) return { ok: false, why: 'Too close to the edge of the county.' };
    if (this.game.world.terrain.height(vx * CELL, vz * CELL) < T.water + 0.6) return { ok: false, why: 'The ground is too wet here.' };
    return { ok: true, vx, vz, x0, x1, z0, z1 };
  }
  plant(x, z, silent = false, y = null) {
    const r = this.check(x, z);
    if (!r.ok) { if (!silent) this.game.hud.toast(r.why, 3); return null; }
    const g = this.game;
    g.inventory.claimKits--;
    const c = { id: 'C' + this.nextId++, vx: r.vx, vz: r.vz, x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1, color: COLORS[(this.nextId - 2) % COLORS.length] };
    // take over the building with the most floor area inside the claim
    let best = null, bestA = 0;
    for (const S of g.world.structures) {
      if (S.owner) continue;
      let a = 0;
      for (const k of S.floors.keys()) {
        const [fx, fz] = k.split(',').map(Number);
        const wx = S.ox + fx * CELL + 1, wz = S.oz + fz * CELL + 1;
        if (wx > c.x0 && wx < c.x1 && wz > c.z0 && wz < c.z1) a++;
      }
      if (a > bestA) { bestA = a; best = S; }
    }
    if (best) {
      c.structure = best;
      best.owner = c.id;
      c.adopted = true;
      if (!silent) g.hud.toast(`Claimed ${best.name.replace(/ @.*/, '')}. It's yours to rebuild.`, 3.5);
    } else {
      const fy = g.world.terrain.height(r.vx * CELL, r.vz * CELL);
      const S = new Structure({ name: 'Your base', kind: 'base', ox: c.x0, oz: c.z0, oy: Math.round((fy + 0.45) * 4) / 4, owner: c.id });
      g.world.structures.push(S);
      g.world.attach(S);
      c.structure = S;
      if (!silent) g.hud.toast(isTouch ? 'Claim planted. Tap Build to build.' : 'Claim planted. Press B to build.', 3);
    }
    const fx = r.vx * CELL, fz = r.vz * CELL;
    // on the floor you're standing on (not a counter, never the roof)
    const fy = g.physics.groundAt(fx, fz, y == null ? g.world.terrain.height(fx, fz) + 0.9 : y + 0.3);
    c.flag = [fx, fy, fz];
    this.list.push(c);
    this.buildMarkers(c);
    g.markDirty && g.markDirty();
    return c;
  }
  remove(c) {
    const g = this.game;
    this.list = this.list.filter((o) => o !== c);
    if (c.structure) c.structure.owner = null;
    if (c.markers) { this.group.remove(c.markers); c.markers.traverse((o) => o.geometry && o.geometry.dispose()); }
    g.inventory.claimKits++;
    g.hud.toast('Claim packed up. The flag is back in your pack.', 3);
    g.markDirty && g.markDirty();
  }
  // Flag pole with a banner and survey stakes with tape around the edge.
  buildMarkers(c) {
    const g = this.game, tr = g.world.terrain;
    const grp = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 3.2, 8), new THREE.MeshStandardMaterial({ color: 0x9a9a9a, metalness: 0.6, roughness: 0.4 }));
    pole.position.set(c.flag[0], c.flag[1] + 1.6, c.flag[2]);
    pole.castShadow = true;
    grp.add(pole);
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.7, 6, 2), new THREE.MeshStandardMaterial({ color: c.color, side: THREE.DoubleSide, roughness: 0.9 }));
    banner.position.set(c.flag[0] + 0.58, c.flag[1] + 2.75, c.flag[2]);
    banner.castShadow = true;
    grp.add(banner);
    c.banner = banner;
    // stakes every 4 m on the boundary, orange tape between
    const tapeMat = new THREE.MeshBasicMaterial({ color: 0xe8742a });
    const stakeMat = new THREE.MeshStandardMaterial({ color: 0xb08a5a });
    const pts = [];
    const step = 4;
    for (let x = c.x0; x < c.x1; x += step) pts.push([x, c.z0]);
    for (let z = c.z0; z < c.z1; z += step) pts.push([c.x1, z]);
    for (let x = c.x1; x > c.x0; x -= step) pts.push([x, c.z1]);
    for (let z = c.z1; z > c.z0; z -= step) pts.push([c.x0, z]);
    pts.push(pts[0]);
    const stakeGeo = new THREE.BoxGeometry(0.05, 0.9, 0.05);
    const stakes = new THREE.InstancedMesh(stakeGeo, stakeMat, pts.length);
    const m4 = new THREE.Matrix4();
    const tapePos = [];
    pts.forEach(([x, z], i) => {
      const y = g.physics.groundAt(x, z, tr.height(x, z) + 0.7);
      m4.makeTranslation(x, y + 0.45, z);
      stakes.setMatrixAt(i, m4);
      if (i) {
        const [px, pz] = pts[i - 1];
        const py = g.physics.groundAt(px, pz, tr.height(px, pz) + 0.7);
        tapePos.push(px, py + 0.75, pz, x, y + 0.75, z);
      }
    });
    stakes.castShadow = true;
    grp.add(stakes);
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.Float32BufferAttribute(tapePos, 3));
    grp.add(new THREE.LineSegments(tg, tapeMat));
    this.group.add(grp);
    c.markers = grp;
  }
  update(dt) {
    const t = performance.now() / 1000;
    for (const c of this.list) {
      if (!c.banner) continue;
      const p = c.banner.geometry.attributes.position;
      if (!c.bannerBase) c.bannerBase = p.array.slice();
      for (let i = 0; i < p.count; i++) {
        const x0 = c.bannerBase[i * 3];
        const k = (x0 + 0.55) / 1.1;
        p.setZ(i, Math.sin(t * 4 + x0 * 5) * 0.12 * k);
      }
      p.needsUpdate = true;
    }
  }
  toJSON() { return this.list.map((c) => ({ id: c.id, vx: c.vx, vz: c.vz, color: c.color, structure: c.structure.id, adopted: !!c.adopted })); }
}
