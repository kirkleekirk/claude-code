// OG-style building: walls, floors, ramps and roofs snapped to a 4m grid, in wood,
// stone or metal. Pieces build up health over time, can be destroyed, and collapse
// when they lose support. Hammering is loud — the dead will come.
import * as THREE from 'three';
import { GeoBuilder } from '../world/geo.js';
import { TEX } from '../world/textures.js';
import { COL } from '../world/buildings.js';
import { makeWorldMaterial } from '../world/materials.js';

export const GRID = 4, LEVEL = 3.5;
export const PIECES = ['wall', 'floor', 'ramp', 'cone'];
export const MATS = {
  wood: { color: 0xc08a54, layer: TEX.PLANKS, hp: 150, start: 0.35, buildTime: 2.2, trim: 0x7a5232 },
  stone: { color: 0xa8a39a, layer: TEX.STONEWALL, hp: 300, start: 0.25, buildTime: 4.5, trim: 0x6a665e },
  metal: { color: 0x9aa2aa, layer: TEX.RIBBED, hp: 500, start: 0.2, buildTime: 6.5, trim: 0x5a6068 },
};
const COST = 10;

function pieceGeo(type, mat) {
  const m = MATS[mat];
  const gb = new GeoBuilder();
  const t = 0.24;
  gb.setColor(m.color).setLayer(m.layer);
  if (type === 'wall') {
    gb.box(0, LEVEL / 2, 0, GRID, LEVEL, t, 0.5);
    gb.setColor(m.trim).setLayer(TEX.PLANKS);
    gb.box(0, 0.08, 0, GRID, 0.16, t + 0.06, 0.5); gb.box(0, LEVEL - 0.08, 0, GRID, 0.16, t + 0.06, 0.5);
    gb.box(-GRID / 2 + 0.08, LEVEL / 2, 0, 0.16, LEVEL, t + 0.06, 0.5); gb.box(GRID / 2 - 0.08, LEVEL / 2, 0, 0.16, LEVEL, t + 0.06, 0.5);
    if (mat === 'wood') { gb.beam(-GRID / 2 + 0.2, 0.2, t / 2 + 0.03, GRID / 2 - 0.2, LEVEL - 0.2, t / 2 + 0.03, 0.12); gb.beam(-GRID / 2 + 0.2, 0.2, -t / 2 - 0.03, GRID / 2 - 0.2, LEVEL - 0.2, -t / 2 - 0.03, 0.12); }
  } else if (type === 'floor') {
    gb.box(0, 0, 0, GRID, t, GRID, 0.5);
    gb.setColor(m.trim).setLayer(TEX.PLANKS);
    for (const s of [-1, 1]) { gb.box(s * (GRID / 2 - 0.08), 0, 0, 0.16, t + 0.06, GRID, 0.5); gb.box(0, 0, s * (GRID / 2 - 0.08), GRID, t + 0.06, 0.16, 0.5); }
  } else if (type === 'ramp') {
    // rises along +z from y=0 at z=-2 to y=LEVEL at z=+2
    const len = Math.hypot(GRID, LEVEL);
    gb.push(); gb.rotateX(-Math.atan2(LEVEL, GRID)); gb.translate(0, 0, 0);
    gb.box(0, 0, 0, GRID, t, len, 0.5);
    gb.setColor(m.trim).setLayer(TEX.PLANKS);
    for (let k = -3; k <= 3; k++) gb.box(0, t / 2 + 0.03, k * len / 7, GRID - 0.3, 0.06, 0.14, 0.5);
    gb.box(-GRID / 2 + 0.08, 0, 0, 0.16, t + 0.08, len, 0.5); gb.box(GRID / 2 - 0.08, 0, 0, 0.16, t + 0.08, len, 0.5);
    gb.pop();
  } else if (type === 'cone') {
    const h = LEVEL * 0.5, g = GRID / 2;
    gb.tri([-g, 0, g], [g, 0, g], [0, h, 0]); gb.tri([g, 0, -g], [-g, 0, -g], [0, h, 0]);
    gb.tri([g, 0, g], [g, 0, -g], [0, h, 0]); gb.tri([-g, 0, -g], [-g, 0, g], [0, h, 0]);
    gb.tri([-g, -0.01, -g], [g, -0.01, -g], [g, -0.01, g]); gb.tri([-g, -0.01, -g], [g, -0.01, g], [-g, -0.01, g]);
  }
  return gb.build();
}

export class Builds {
  constructor(G) {
    this.G = G;
    this.group = new THREE.Group();
    this.group.name = 'builds';
    this.pieces = new Map(); // key → piece
    this.geos = {};
    for (const t of PIECES) for (const m in MATS) this.geos[t + m] = pieceGeo(t, m);
    this.mat = makeWorldMaterial({ lambert: G.gfx.q.lambert });
    this.buildingMat = new THREE.MeshStandardMaterial({ color: 0x9ad0ff, transparent: true, opacity: 0.5, roughness: 0.6, emissive: 0x3a7ac0, emissiveIntensity: 0.4 });
    this.ghostMat = new THREE.MeshBasicMaterial({ color: 0x5ab8ff, transparent: true, opacity: 0.35, depthWrite: false });
    this.ghostBad = new THREE.MeshBasicMaterial({ color: 0xff5a5a, transparent: true, opacity: 0.35, depthWrite: false });
    this.ghost = new THREE.Mesh(this.geos.wallwood, this.ghostMat);
    this.ghost.visible = false;
    this.ghost.renderOrder = 5;
    this.group.add(this.ghost);
    this.edges = new THREE.LineSegments(new THREE.EdgesGeometry(this.geos.wallwood), new THREE.LineBasicMaterial({ color: 0xbfe6ff }));
    this.ghost.add(this.edges);
  }
  key(p) { return `${p.type}:${p.i}:${p.j}:${p.k}:${p.dir}`; }
  // Compute the piece the survivor would place now
  target(s, type, yaw, pitch, rotate = 0) {
    const px = s.pos.x, pz = s.pos.z, py = s.pos.y;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const dir = Math.abs(fx) > Math.abs(fz) ? (fx > 0 ? 1 : 3) : (fz > 0 ? 2 : 0); // 0:-z 1:+x 2:+z 3:-x
    const ci = Math.floor(px / GRID), cj = Math.floor(pz / GRID);
    let ck = Math.floor((py + 0.6) / LEVEL);
    const up = pitch > 0.55 ? 1 : 0;
    const look = (d) => [[0, -1], [1, 0], [0, 1], [-1, 0]][d];
    const [dx, dz] = look(dir);
    let p;
    if (type === 'wall') {
      // edge of the player's cell in the facing direction
      const lx = px / GRID - ci, lz = pz / GRID - cj;
      const nearEdge = (dir === 0 && lz < 0.25) || (dir === 2 && lz > 0.75) || (dir === 1 && lx > 0.75) || (dir === 3 && lx < 0.25);
      let i = ci, j = cj;
      if (nearEdge) { i += dx; j += dz; }
      const k = ck + up;
      const rd = (dir + rotate) % 4;
      p = { type, i, j, k, dir: rd % 2 };
      // wall lies on cell edge: dir%2==0 → z-edge (plane z = const), 1 → x-edge
      if (rd % 2 === 0) { p.x = (i + 0.5) * GRID; p.z = (rd === 0 ? j : j + 1) * GRID; p.j = rd === 0 ? j : j + 1; p.rot = 0; }
      else { p.x = (rd === 3 ? i : i + 1) * GRID; p.z = (j + 0.5) * GRID; p.i = rd === 3 ? i : i + 1; p.rot = Math.PI / 2; }
      p.y = k * LEVEL;
    } else if (type === 'floor') {
      const look = pitch < -0.75;
      const i = look ? ci : ci + dx, j = look ? cj : cj + dz, k = ck + up;
      p = { type, i, j, k, dir: 0, x: (i + 0.5) * GRID, z: (j + 0.5) * GRID, y: k * LEVEL, rot: 0 };
    } else if (type === 'ramp') {
      const rd = (dir + rotate) % 4;
      const i = ci + dx, j = cj + dz, k = ck + (pitch > 0.9 ? 1 : 0);
      p = { type, i, j, k, dir: rd, x: (i + 0.5) * GRID, z: (j + 0.5) * GRID, y: k * LEVEL, rot: [Math.PI, Math.PI / 2, 0, -Math.PI / 2][rd] };
    } else {
      const i = up ? ci : ci + dx, j = up ? cj : cj + dz, k = ck + 1;
      p = { type, i, j, k, dir: 0, x: (i + 0.5) * GRID, z: (j + 0.5) * GRID, y: k * LEVEL, rot: 0 };
    }
    return p;
  }
  canPlace(p) {
    if (this.pieces.has(this.key(p))) return false;
    const g = this.G.world.heightAt(p.x, p.z);
    if (p.y + (p.type === 'wall' ? LEVEL : 0.5) < g - 0.2 && p.type !== 'wall') return false;
    if (p.y > g + 80) return false;
    if (this.G.world.isWater(p.x, p.z) && p.y < 0.5) return false;
    return true;
  }
  showGhost(p, mat, ok) {
    this.ghost.visible = !!p;
    if (!p) return;
    const geo = this.geos[p.type + mat];
    if (this.ghost.geometry !== geo) {
      this.ghost.geometry = geo;
      this.edges.geometry.dispose();
      this.edges.geometry = new THREE.EdgesGeometry(geo, 30);
    }
    this.ghost.material = ok ? this.ghostMat : this.ghostBad;
    this.ghost.position.set(p.x, p.y + (p.type === 'floor' ? 0 : 0) + (p.type === 'ramp' ? LEVEL / 2 : 0), p.z);
    this.ghost.rotation.set(0, p.rot, 0);
  }
  place(s, p, mat) {
    if (!this.canPlace(p)) return null;
    if (s.inv.mats[mat] < COST) { if (s.isPlayer) this.G.hud.toast(true, `Not enough ${mat}`); return null; }
    s.inv.mats[mat] -= COST;
    const M = MATS[mat];
    const piece = { ...p, mat, hp: M.hp * M.start, maxHp: M.hp, building: true, buildT: 0, owner: s.id, cols: [] };
    const mesh = new THREE.Mesh(this.geos[p.type + mat], this.buildingMat);
    mesh.position.set(p.x, p.y + (p.type === 'ramp' ? LEVEL / 2 : 0), p.z);
    mesh.rotation.y = p.rot;
    mesh.castShadow = true; mesh.receiveShadow = true;
    piece.mesh = mesh;
    this.group.add(mesh);
    this.addColliders(piece);
    this.pieces.set(this.key(p), piece);
    s.stats.built++;
    this.G.audio?.play('build_' + mat, piece, { vol: s.isPlayer ? 0.7 : 0.9 });
    this.G.emitNoise(p.x, p.z, 30, s, 'build');
    return piece;
  }
  addColliders(pc) {
    const P = this.G.physics;
    const ref = { piece: pc };
    const flags = COL.SOLID | COL.BULLET | COL.WALK | COL.BUILD;
    const c = Math.cos(pc.rot), s = Math.sin(pc.rot);
    if (pc.type === 'wall') pc.cols.push({ kind: 0, x: pc.x, y: pc.y + LEVEL / 2, z: pc.z, hx: GRID / 2, hy: LEVEL / 2, hz: 0.14, rot: pc.rot, flags, ref });
    else if (pc.type === 'floor') pc.cols.push({ kind: 0, x: pc.x, y: pc.y, z: pc.z, hx: GRID / 2, hy: 0.14, hz: GRID / 2, rot: 0, flags, ref });
    else if (pc.type === 'ramp') pc.cols.push({ kind: 1, x: pc.x, y: pc.y + LEVEL / 2, z: pc.z, hx: GRID / 2, hy: LEVEL / 2, hz: GRID / 2, rot: pc.rot, flags, ref });
    else if (pc.type === 'cone') pc.cols.push({ kind: 0, x: pc.x, y: pc.y + 0.15, z: pc.z, hx: GRID / 2, hy: 0.15, hz: GRID / 2, rot: 0, flags, ref });
    void c; void s;
    for (const col of pc.cols) P.add(col);
  }
  update(dt) {
    for (const pc of this.pieces.values()) {
      if (!pc.building) continue;
      const M = MATS[pc.mat];
      pc.buildT += dt;
      pc.hp = Math.min(pc.maxHp, pc.hp + (pc.maxHp * (1 - M.start) / M.buildTime) * dt);
      this.buildingMat.opacity = 0.5;
      if (pc.buildT >= M.buildTime) { pc.building = false; pc.mesh.material = this.mat; }
    }
  }
  // returns true if still standing
  damage(pc, dmg, src) {
    if (!this.pieces.has(this.key(pc))) return false;
    pc.hp -= dmg;
    if (pc.mesh) { pc.mesh.position.x += (Math.random() - 0.5) * 0.03; }
    if (pc.hp <= 0) { this.destroy(pc); this.checkSupport(); return false; }
    return true;
  }
  destroy(pc, quiet = false) {
    const k = this.key(pc);
    if (!this.pieces.has(k)) return;
    this.pieces.delete(k);
    this.group.remove(pc.mesh);
    for (const c of pc.cols) this.G.physics.remove(c);
    if (!quiet) {
      this.G.fx.debris(pc.x, pc.y + 1.5, pc.z, pc.mat);
      this.G.audio?.play('break_' + pc.mat, pc, { vol: 0.9 });
    }
  }
  grounded(pc) {
    const P = this.G.physics, W = this.G.world;
    // touching terrain?
    const pts = pc.type === 'wall' ? [[pc.x + Math.cos(pc.rot) * 1.8, pc.z - Math.sin(pc.rot) * 1.8], [pc.x - Math.cos(pc.rot) * 1.8, pc.z + Math.sin(pc.rot) * 1.8], [pc.x, pc.z]] : [[pc.x - 1.8, pc.z - 1.8], [pc.x + 1.8, pc.z - 1.8], [pc.x - 1.8, pc.z + 1.8], [pc.x + 1.8, pc.z + 1.8], [pc.x, pc.z]];
    for (const [x, z] of pts) if (W.heightAt(x, z) >= pc.y - 0.35) return true;
    // resting on a world collider (house, rock...)
    let onWorld = false;
    P.query(pc.x - 2.1, pc.z - 2.1, pc.x + 2.1, pc.z + 2.1, (c) => {
      if (c.ref && c.ref.piece) return;
      if (!(c.flags & COL.SOLID)) return;
      if (c.maxY >= pc.y - 0.4 && c.minY <= pc.y + 0.4) { onWorld = true; return false; }
    });
    return onWorld;
  }
  adjacent(a, b) {
    const box = (p) => {
      if (p.type === 'wall') { const c = Math.abs(Math.cos(p.rot)) > 0.5; return [p.x - (c ? 2 : 0.2), p.y, p.z - (c ? 0.2 : 2), p.x + (c ? 2 : 0.2), p.y + LEVEL, p.z + (c ? 0.2 : 2)]; }
      if (p.type === 'ramp') return [p.x - 2, p.y, p.z - 2, p.x + 2, p.y + LEVEL, p.z + 2];
      return [p.x - 2, p.y - 0.2, p.z - 2, p.x + 2, p.y + (p.type === 'cone' ? 1.8 : 0.2), p.z + 2];
    };
    const A = box(a), B = box(b), e = 0.25;
    return A[0] - e <= B[3] && A[3] + e >= B[0] && A[1] - e <= B[4] && A[4] + e >= B[1] && A[2] - e <= B[5] && A[5] + e >= B[2];
  }
  checkSupport() {
    const all = [...this.pieces.values()];
    if (!all.length) return;
    const supported = new Set();
    const queue = all.filter((p) => this.grounded(p));
    for (const p of queue) supported.add(p);
    while (queue.length) {
      const p = queue.pop();
      for (const q of all) if (!supported.has(q) && this.adjacent(p, q)) { supported.add(q); queue.push(q); }
    }
    let delay = 0;
    for (const p of all) if (!supported.has(p)) { delay += 60; setTimeout(() => this.destroy(p), delay); }
  }
  explosion(x, y, z, r, dmg) {
    for (const pc of [...this.pieces.values()]) {
      const d = Math.hypot(pc.x - x, pc.y + 1.5 - y, pc.z - z);
      if (d < r + 1.5) this.damage(pc, dmg * (1 - d / (r + 1.5) * 0.5), null);
    }
  }
  burnArea(x, y, z, r) {
    for (const pc of [...this.pieces.values()]) if (pc.mat === 'wood' && Math.hypot(pc.x - x, pc.z - z) < r + 2 && Math.abs(pc.y - y) < 4) this.damage(pc, 12, null);
  }
}
