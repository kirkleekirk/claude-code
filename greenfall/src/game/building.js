// Bricklaying. There is no free-form building: with a Mason's Trowel in hand you can lay a
// brick wall (plain, or with a window you can see and shoot through) on the ground, snapped
// to a 4 m grid. Walls cost stone, go up slowly and loudly, and can be smashed with melee
// weapons, guns and explosives.
import * as THREE from 'three';
import { GeoBuilder } from '../world/geo.js';
import { TEX } from '../world/textures.js';
import { COL } from '../world/buildings.js';
import { makeWorldMaterial } from '../world/materials.js';

export const GRID = 4, LEVEL = 3.2;
export const PIECES = ['wall', 'window'];
export const PIECE_NAMES = { wall: 'Brick Wall', window: 'Brick Wall with Window' };
export const PIECE_COST = { wall: 30, window: 25 }; // stone
const BRICK = { color: 0xb05a40, layer: TEX.BRICK, hp: 420, start: 0.2, buildTime: 5.5, trim: 0x8a8278 };
const T = 0.3; // wall thickness
const WIN = { w: 1.5, y0: 1.05, y1: 2.25 }; // window opening

// pieces of a wall as boxes [cx, cy, cz, sx, sy, sz] (local, wall runs along x)
function wallBoxes(type) {
  if (type === 'wall') return [[0, LEVEL / 2, 0, GRID, LEVEL, T]];
  const side = (GRID - WIN.w) / 2;
  return [
    [-(WIN.w / 2 + side / 2), LEVEL / 2, 0, side, LEVEL, T],
    [WIN.w / 2 + side / 2, LEVEL / 2, 0, side, LEVEL, T],
    [0, WIN.y0 / 2, 0, WIN.w, WIN.y0, T],
    [0, (WIN.y1 + LEVEL) / 2, 0, WIN.w, LEVEL - WIN.y1, T],
  ];
}
function pieceGeo(type) {
  const gb = new GeoBuilder();
  gb.setColor(BRICK.color).setLayer(BRICK.layer);
  for (const [x, y, z, sx, sy, sz] of wallBoxes(type)) gb.box(x, y, z, sx, sy, sz, 0.5);
  gb.setColor(BRICK.trim).setLayer(TEX.CONCRETE);
  gb.box(0, LEVEL - 0.06, 0, GRID + 0.04, 0.12, T + 0.08, 0.5); // capstones
  gb.box(0, 0.06, 0, GRID + 0.04, 0.12, T + 0.08, 0.5);
  if (type === 'window') gb.box(0, WIN.y0, 0, WIN.w + 0.2, 0.08, T + 0.16, 0.5); // sill
  return gb.build();
}

export class Builds {
  constructor(G) {
    this.G = G;
    this.group = new THREE.Group();
    this.group.name = 'builds';
    this.pieces = new Map(); // key → piece
    this.geos = {};
    for (const t of PIECES) this.geos[t] = pieceGeo(t);
    this.mat = makeWorldMaterial({ lambert: G.gfx.q.lambert });
    this.buildingMat = new THREE.MeshStandardMaterial({ color: 0xd08a6a, transparent: true, opacity: 0.6, roughness: 0.8 });
    this.ghostMat = new THREE.MeshBasicMaterial({ color: 0x5ab8ff, transparent: true, opacity: 0.35, depthWrite: false });
    this.ghostBad = new THREE.MeshBasicMaterial({ color: 0xff5a5a, transparent: true, opacity: 0.35, depthWrite: false });
    this.ghost = new THREE.Mesh(this.geos.wall, this.ghostMat);
    this.ghost.visible = false;
    this.ghost.renderOrder = 5;
    this.group.add(this.ghost);
  }
  costFor(s, type = 'wall') { return Math.max(1, Math.round(PIECE_COST[type] * (s.mods ? s.mods.get('buildCost') : 1))); }
  key(p) { return `${p.i}:${p.j}:${p.dir}`; }
  // the wall the survivor would lay now: on the edge of the grid cell they face
  target(s, type, yaw) {
    const px = s.pos.x, pz = s.pos.z;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const dir = Math.abs(fx) > Math.abs(fz) ? (fx > 0 ? 1 : 3) : (fz > 0 ? 2 : 0); // 0:-z 1:+x 2:+z 3:-x
    const ci = Math.floor(px / GRID), cj = Math.floor(pz / GRID);
    const lx = px / GRID - ci, lz = pz / GRID - cj;
    const nearEdge = (dir === 0 && lz < 0.3) || (dir === 2 && lz > 0.7) || (dir === 1 && lx > 0.7) || (dir === 3 && lx < 0.3);
    const [dx, dz] = [[0, -1], [1, 0], [0, 1], [-1, 0]][dir];
    let i = ci, j = cj;
    if (nearEdge) { i += dx; j += dz; }
    const p = { type, dir: dir % 2 };
    if (dir % 2 === 0) { p.i = i; p.j = dir === 0 ? j : j + 1; p.x = (i + 0.5) * GRID; p.z = p.j * GRID; p.rot = 0; }
    else { p.i = dir === 3 ? i : i + 1; p.j = j; p.x = p.i * GRID; p.z = (j + 0.5) * GRID; p.rot = Math.PI / 2; }
    // sit on the lowest ground under the wall, sunk a little so slopes don't leave gaps
    const c = Math.cos(p.rot), sn = Math.sin(p.rot), W = this.G.world;
    const hs = [W.heightAt(p.x, p.z), W.heightAt(p.x + c * 1.9, p.z - sn * 1.9), W.heightAt(p.x - c * 1.9, p.z + sn * 1.9)];
    const floor = this.G.physics.groundAt(p.x, p.z, s.pos.y + 1.2, 0.3);
    p.y = Math.max(Math.min(...hs), floor) - 0.25;
    p.span = Math.max(...hs) - Math.min(...hs);
    return p;
  }
  canPlace(p, s) {
    if (this.pieces.has(this.key(p))) return false;
    if (p.span > 1.4) return false; // too steep
    if (this.G.world.isWater(p.x, p.z)) return false;
    if (s && Math.abs(p.y + 0.25 - s.pos.y) > 1.6) return false; // must be laid where you stand
    // don't wall inside another building's walls or on a vehicle
    let blocked = false;
    const c = Math.cos(p.rot), sn = Math.sin(p.rot);
    for (const t of [-1.6, 0, 1.6]) {
      const x = p.x + c * t, z = p.z - sn * t;
      this.G.physics.query(x - 0.2, z - 0.2, x + 0.2, z + 0.2, (col) => {
        if (col.ref?.piece || !(col.flags & COL.SOLID)) return;
        if (col.maxY > p.y + 0.9 && col.minY < p.y + LEVEL - 0.5) { blocked = true; return false; }
      });
    }
    return !blocked;
  }
  showGhost(p, ok) {
    this.ghost.visible = !!p;
    if (!p) return;
    this.ghost.geometry = this.geos[p.type];
    this.ghost.material = ok ? this.ghostMat : this.ghostBad;
    this.ghost.position.set(p.x, p.y, p.z);
    this.ghost.rotation.set(0, p.rot, 0);
  }
  place(s, p) {
    if (!this.canPlace(p, s)) return null;
    const cost = this.costFor(s, p.type);
    if (s.inv.mats.stone < cost) { if (s.isPlayer) this.G.hud.toast(true, `Need ${cost} stone for bricks — break rocks with a pickaxe`); return null; }
    s.inv.mats.stone -= cost;
    const piece = { ...p, mat: 'brick', hp: BRICK.hp * BRICK.start, maxHp: BRICK.hp, building: true, buildT: 0, owner: s.id, cols: [], speed: s.mods ? s.mods.get('buildSpeed') : 1 };
    const mesh = new THREE.Mesh(this.geos[p.type], this.buildingMat);
    mesh.position.set(p.x, p.y, p.z);
    mesh.rotation.y = p.rot;
    mesh.castShadow = true; mesh.receiveShadow = true;
    piece.mesh = mesh;
    this.group.add(mesh);
    this.addColliders(piece);
    this.pieces.set(this.key(p), piece);
    s.stats.built++;
    this.G.audio?.play('build_stone', piece, { vol: s.isPlayer ? 0.7 : 0.9 });
    this.G.emitNoise(p.x, p.z, 35, s, 'build');
    this.G.net?.onBuild?.(piece);
    return piece;
  }
  // multiplayer: a wall another player laid
  placeNet(p) {
    if (this.pieces.has(this.key(p))) return null;
    const piece = { ...p, mat: 'brick', hp: BRICK.hp * BRICK.start, maxHp: BRICK.hp, building: true, buildT: 0, owner: null, cols: [], speed: 1 };
    const mesh = new THREE.Mesh(this.geos[p.type], this.buildingMat);
    mesh.position.set(p.x, p.y, p.z); mesh.rotation.y = p.rot; mesh.castShadow = true; mesh.receiveShadow = true;
    piece.mesh = mesh;
    this.group.add(mesh);
    this.addColliders(piece);
    this.pieces.set(this.key(p), piece);
    this.G.audio?.play('build_stone', piece, { vol: 0.8 });
    return piece;
  }
  addColliders(pc) {
    const P = this.G.physics;
    const ref = { piece: pc };
    const flags = COL.SOLID | COL.BULLET | COL.WALK | COL.BUILD;
    const c = Math.cos(pc.rot), sn = Math.sin(pc.rot);
    for (const [lx, ly, , sx, sy] of wallBoxes(pc.type)) {
      pc.cols.push({ kind: 0, x: pc.x + lx * c, y: pc.y + ly, z: pc.z - lx * sn, hx: sx / 2, hy: sy / 2, hz: T / 2, rot: pc.rot, flags, ref });
    }
    for (const col of pc.cols) P.add(col);
  }
  update(dt) {
    for (const pc of this.pieces.values()) {
      if (!pc.building) continue;
      pc.buildT += dt * pc.speed;
      pc.hp = Math.min(pc.maxHp, pc.hp + (pc.maxHp * (1 - BRICK.start) / BRICK.buildTime) * dt * pc.speed);
      if (pc.buildT >= BRICK.buildTime) { pc.building = false; pc.mesh.material = this.mat; }
    }
  }
  // returns true if still standing
  damage(pc, dmg, src) {
    if (!this.pieces.has(this.key(pc))) return false;
    pc.hp -= dmg;
    if (pc.mesh) { pc.mesh.position.x += (Math.random() - 0.5) * 0.03; }
    if (pc.hp <= 0) { this.destroy(pc); return false; }
    return true;
  }
  destroy(pc, quiet = false) {
    const k = this.key(pc);
    if (!this.pieces.has(k)) return;
    this.pieces.delete(k);
    this.group.remove(pc.mesh);
    for (const c of pc.cols) this.G.physics.remove(c);
    if (!quiet) {
      this.G.fx.debris(pc.x, pc.y + 1.5, pc.z, 'stone');
      this.G.audio?.play('break_stone', pc, { vol: 0.9 });
    }
    this.G.net?.onBuildGone?.(pc);
  }
  explosion(x, y, z, r, dmg) {
    for (const pc of [...this.pieces.values()]) {
      const d = Math.hypot(pc.x - x, pc.y + 1.5 - y, pc.z - z);
      if (d < r + 1.5) this.damage(pc, dmg * (1 - d / (r + 1.5) * 0.5), null);
    }
  }
  burnArea() { /* brick doesn't burn */ }
}
