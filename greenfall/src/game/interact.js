// Interactables: doors, window/door barricades, searchable containers, world loot,
// supply crates, campfires, water, car alarms. Also building lookups + nav pathfinding.
import * as THREE from 'three';
import { COL } from '../world/buildings.js';
import { ITEMS, WEAPONS, AMMO, LOOT, CAT_WEIGHTS, CONTAINER_LOOT, RARITY_WEIGHTS, weaponMinRarity, RARITY_HEX } from '../data/items.js';
import { buildWeaponModel, M, RARITY_COLORS } from './character.js';
import { RNG } from '../core/rng.js';
import { clamp } from '../core/math.js';
import { CX as CHUNKS_X } from '../world/terrain.js';

const BOARD_COST = 20, DOOR_BOARD_COST = 30;
const BOARD_HP = 320, DOOR_HP = 260, DOOR_BOARD_HP = 520;

export class Interact {
  constructor(G) {
    this.G = G;
    this.group = new THREE.Group();
    this.group.name = 'interact';
    this.items = []; // world loot
    this.campfires = [];
    this.crates = [];
    this.rng = new RNG(99);
    this.doorGeo = new THREE.BoxGeometry(1, 1, 0.07);
    this.doorMats = [M(0x7a4a2a, { rough: 0.7 }), M(0xe8e2d4, { rough: 0.6 }), M(0x2f4f3a, { rough: 0.6 }), M(0x5a2a24, { rough: 0.6 })];
    this.knobMat = M(0xd4b04a, { metal: 0.8, rough: 0.3 });
    this.boardGeo = new THREE.BoxGeometry(1, 0.2, 0.05);
    this.boardMat = M(0x9a7a50, { rough: 0.9 });
    this.boardMat2 = M(0x8a6a44, { rough: 0.9 });
    this.nailMat = M(0x444444, { metal: 0.6 });
    this.itemGroup = new THREE.Group();
    this.group.add(this.itemGroup);
    this.glowMats = RARITY_COLORS.map((c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    this.beamGeo = new THREE.CylinderGeometry(0.08, 0.25, 2.2, 8, 1, true);
    this.beamGeo.translate(0, 1.1, 0);
    this.ringGeo = new THREE.RingGeometry(0.25, 0.42, 24);
    this.ringGeo.rotateX(-Math.PI / 2);
    this.activeChunks = new Set();
    this.alarms = [];
    this.doorsActive = [];
    this.activeWindows = new Set();
  }

  // ---------------- chunk lifecycle ----------------
  onChunkNear(ch) {
    this.activeChunks.add(ch);
    ch.dyn = new THREE.Group();
    for (const b of ch.buildings) {
      const rt = b.rt;
      if (!rt) continue;
      for (const d of rt.doors) this.createDoor(d, ch);
      for (const w of rt.windows) if (w.boarded > 0) { this.boardCollider(w); this.activeWindows.add(w); }
      if (!b.lootSpawned) this.spawnBuildingLoot(b);
    }
    for (const c of this.crates) if (!c.mesh && this.G.view.chunkOf(c.x, c.z) === ch) this.makeCrateMesh(c);
    this.group.add(ch.dyn);
  }
  onChunkFar(ch) {
    this.activeChunks.delete(ch);
    for (const b of ch.buildings) {
      if (!b.rt) continue;
      for (const d of b.rt.doors) { if (d.col) this.G.physics.remove(d.col); this.dropDoorMesh(d); d.col = null; const i = this.doorsActive.indexOf(d); if (i >= 0) this.doorsActive.splice(i, 1); }
      for (const w of b.rt.windows) { if (w.col) this.G.physics.remove(w.col); if (w.boardMesh) { w.boardMesh.parent?.remove(w.boardMesh); w.boardMesh = null; } w.col = null; this.activeWindows.delete(w); }
    }
    for (const it of this.items) if (it.mesh && this.chunkOfItem(it) === ch) { this.itemGroup.remove(it.mesh); it.mesh = null; it.model = null; }
    for (const c of this.crates) if (c.mesh && this.G.view.chunkOf(c.x, c.z) === ch) { this.itemGroup.remove(c.mesh); c.mesh = null; }
    if (ch.dyn) this.group.remove(ch.dyn);
    ch.dyn = null;
  }
  chunkOfItem(it) { return this.G.view.chunkOf(it.x, it.z); }

  // ---------------- doors ----------------
  createDoor(d, ch) {
    if (d.broken) return;
    d.angle = d.open ? 1.6 : 0;
    this.updateDoorCollider(d);
    this.doorsActive.push(d);
  }
  makeDoorMesh(d) {
    if (d.mesh || d.broken) return;
    const g = new THREE.Group();
    g.position.set(d.x, d.floorY + d.sill, d.z);
    g.rotation.y = d.rot;
    const pivot = new THREE.Group();
    pivot.position.x = d.hingeL * d.w / 2 * -1;
    g.add(pivot);
    const panel = new THREE.Mesh(this.doorGeo, this.doorMats[d.building % this.doorMats.length]);
    panel.scale.set(d.w - 0.06, d.h - 0.04, 1);
    panel.position.set(d.hingeL * (d.w / 2), d.h / 2, 0);
    panel.castShadow = true;
    pivot.add(panel);
    const knob = new THREE.Mesh(Interact.knobGeo || (Interact.knobGeo = new THREE.SphereGeometry(0.04, 6, 5)), this.knobMat);
    knob.position.set(d.hingeL * (d.w - 0.15), d.h * 0.45, 0.06);
    pivot.add(knob);
    d.mesh = g; d.pivot = pivot;
    pivot.rotation.y = d.angle * (d.swing ?? -1) * d.hingeL;
    this.group.add(g);
    if (d.boarded > 0) this.makeBoardMesh(d);
  }
  dropDoorMesh(d) {
    if (d.mesh) { d.mesh.parent?.remove(d.mesh); d.mesh = null; d.pivot = null; }
    if (d.boardMesh) { d.boardMesh.parent?.remove(d.boardMesh); d.boardMesh = null; }
  }
  updateDoorCollider(d) {
    const P = this.G.physics;
    if (d.col) { P.remove(d.col); d.col = null; }
    if (d.broken) return;
    if (!d.open || d.boarded > 0) {
      d.col = { kind: 0, x: d.x, y: d.floorY + d.sill + d.h / 2, z: d.z, hx: d.w / 2, hy: d.h / 2, hz: 0.08, rot: d.rot, flags: COL.SOLID | COL.BULLET, ref: d.boarded > 0 ? { barricade: d, door: d } : { door: d } };
      P.add(d.col);
    }
  }
  toggleDoor(d, by) {
    if (d.broken) return;
    if (d.boarded > 0) { this.G.hud.toast(by?.isPlayer, 'Door is barricaded'); return; }
    d.open = !d.open;
    if (!d.pivot) d.angle = d.open ? 1.6 : 0;
    if (d.open && by) {
      // swing away from the opener
      const side = (by.pos.x - d.x) * d.nx + (by.pos.z - d.z) * d.nz;
      d.swing = side > 0 ? -1 : 1;
    }
    this.updateDoorCollider(d);
    this.G.audio?.play(d.open ? 'door_open' : 'door_close', d, { vol: 0.7 });
    this.G.emitNoise(d.x, d.z, 5, by, 'door');
  }
  damageDoor(d, dmg, src) {
    if (d.broken) return false;
    if (d.boarded > 0) return this.damageBarricade(d, dmg, src);
    d.hp = (d.hp ?? DOOR_HP) - dmg;
    if (d.mesh) d.shakeT = 0.2;
    if (d.hp <= 0) {
      d.broken = true; d.open = true;
      if (d.mesh && d.mesh.parent) d.mesh.parent.remove(d.mesh);
      d.mesh = null;
      this.updateDoorCollider(d);
      this.G.audio?.play('door_break', d, { vol: 1 });
      this.G.fx.impact(d.x, d.floorY + 1, d.z, d.nx, 0, d.nz, 'wood');
      return false;
    }
    return true;
  }

  // ---------------- barricades ----------------
  makeBoardMesh(rec) {
    if (rec.boardMesh) { rec.boardMesh.parent?.remove(rec.boardMesh); }
    const g = new THREE.Group();
    const y0 = rec.floorY + rec.sill;
    g.position.set(rec.x + rec.nx * 0.16, y0, rec.z + rec.nz * 0.16);
    g.rotation.y = rec.rot;
    const n = rec.kind === 'door' ? 4 : 3;
    const r = new RNG(Math.floor(rec.x * 7 + rec.z));
    for (let k = 0; k < n; k++) {
      const b = new THREE.Mesh(this.boardGeo, k % 2 ? this.boardMat : this.boardMat2);
      b.scale.set(rec.w + 0.35, 1, 1);
      b.position.set(r.range(-0.05, 0.05), (rec.h * (k + 0.6)) / (n + 0.2), 0.02 * k);
      b.rotation.z = r.range(-0.35, 0.35);
      b.castShadow = true;
      g.add(b);
    }
    rec.boardMesh = g;
    this.group.add(g);
  }
  boardCollider(rec) {
    if (rec.kind === 'door') { this.updateDoorCollider(rec); return; }
    if (rec.col) this.G.physics.remove(rec.col);
    const y0 = rec.floorY + rec.sill;
    rec.col = { kind: 0, x: rec.x, y: y0 + rec.h / 2, z: rec.z, hx: rec.w / 2 + 0.1, hy: rec.h / 2, hz: 0.12, rot: rec.rot, flags: COL.SOLID | COL.BULLET, ref: { barricade: rec } };
    this.G.physics.add(rec.col);
  }
  createBoards(rec) {
    this.boardCollider(rec);
    if (rec.kind !== 'door') this.activeWindows.add(rec);
    this.makeBoardMesh(rec);
  }
  board(rec, by) {
    const cost = rec.kind === 'door' ? DOOR_BOARD_COST : BOARD_COST;
    if (by.inv.mats.wood < cost) { this.G.hud.toast(by.isPlayer, `Need ${cost} wood to board up`); return false; }
    if (rec.kind === 'door' && rec.open) { rec.open = false; this.updateDoorCollider(rec); }
    by.inv.mats.wood -= cost;
    rec.boarded = 1;
    rec.hp = rec.kind === 'door' ? DOOR_BOARD_HP : BOARD_HP;
    by.stats.boarded++;
    this.createBoards(rec);
    this.G.audio?.play('hammer', rec, { vol: 0.9 });
    this.G.emitNoise(rec.x, rec.z, 35, by, 'hammer');
    return true;
  }
  unboard(rec, by) {
    rec.boarded = 0;
    if (rec.boardMesh) rec.boardMesh.parent?.remove(rec.boardMesh);
    rec.boardMesh = null;
    if (rec.kind !== 'door' && rec.col) { this.G.physics.remove(rec.col); rec.col = null; }
    if (rec.kind === 'door') this.updateDoorCollider(rec);
    this.activeWindows.delete(rec);
    if (by) by.addItem('wood', 10);
    this.G.audio?.play('board_break', rec, { vol: 0.7 });
  }
  damageBarricade(rec, dmg, src) {
    if (!rec.boarded) return false;
    rec.hp -= dmg;
    if (rec.boardMesh) { rec.boardMesh.position.x += (Math.random() - 0.5) * 0.04; }
    if (rec.hp <= 0) {
      this.unboard(rec, null);
      this.G.audio?.play('board_break', rec, { vol: 1 });
      this.G.fx.impact(rec.x, rec.floorY + 1, rec.z, rec.nx, 0, rec.nz, 'wood');
      if (this.G.player.indoor && this.G.player.indoor.b.id === rec.building) this.G.hud.announce('THE BARRICADE BROKE!', 'red');
      return false;
    }
    return true;
  }

  // ---------------- loot ----------------
  rollRarity(table) { return this.rng.weighted(RARITY_WEIGHTS[table]); }
  rollItem(cat, rarityTable = 'floor') {
    const id = this.rng.weighted(LOOT[cat]);
    if (cat === 'ammo') return { id, n: AMMO[id].pickup, r: 0 };
    const def = ITEMS[id];
    if (def.type === 'weapon') {
      let r = this.rollRarity(rarityTable);
      r = Math.max(r, weaponMinRarity(id));
      if (!def.dmg[r]) r = def.dmg.findIndex((v) => v > 0);
      return { id, n: 1, r, mag: def.mag ?? 0, ammo: def.ammo };
    }
    let n = 1;
    if (id === 'cloth') n = this.rng.int(1, 3);
    if (id === 'bandage') n = this.rng.int(2, 4);
    if (def.type === 'throw') n = this.rng.int(1, 2);
    return { id, n, r: 0 };
  }
  spawnBuildingLoot(b) {
    b.lootSpawned = true;
    const rt = b.rt;
    const G = this.G;
    const poi = G.poiAt?.(b.x, b.z);
    const mul = (poi ? poi.loot : 0.8) * (G.match?.lootMul ?? 1);
    let placed = 0;
    const cap = 2 + Math.ceil(rt.rooms.length * 0.8) + (b.kind === 'store' || b.kind === 'bigbox' || b.kind === 'warehouse' ? 4 : 0);
    for (const spot of this.rng.shuffle([...rt.loot])) {
      if (placed >= cap) break;
      if (!this.rng.chance(0.3 * mul)) continue;
      placed++;
      const cats = CAT_WEIGHTS[spot.cat || b.shopCat || 'default'] || CAT_WEIGHTS.default;
      const cat = this.rng.weighted(cats);
      const it = this.rollItem(cat, spot.tier > 1 ? 'container' : 'floor');
      this.addWorldItem(it, spot.x, spot.y, spot.z);
      if (it.ammo && this.rng.chance(0.8)) this.addWorldItem({ id: it.ammo, n: AMMO[it.ammo].pickup, r: 0 }, spot.x + 0.4, spot.y, spot.z + 0.2);
    }
    // supply crate
    if (rt.loot.length && this.rng.chance(0.07 * mul + (b.kind === 'barn' || b.kind === 'warehouse' ? 0.12 : 0))) {
      const spot = this.rng.pick(rt.loot);
      this.crates.push({ x: spot.x, y: spot.y, z: spot.z, rot: b.rot, opened: false, mesh: null, kind: 'supply' });
    }
  }
  addWorldItem(it, x, y, z) {
    const rec = { ...it, x, y, z, mesh: null, t: 0 };
    this.items.push(rec);
    const p = this.G.player;
    if (p && Math.hypot(x - p.pos.x, z - p.pos.z) < 70) this.makeItemMesh(rec);
    return rec;
  }
  dropItem(it, x, y, z) {
    // scatter a little, but never through a wall
    let px = x, pz = z;
    for (let tries = 0; tries < 4; tries++) {
      const a = Math.random() * Math.PI * 2, r = 0.5 + Math.random() * 0.5;
      const tx = x + Math.cos(a) * r, tz = z + Math.sin(a) * r;
      if (this.G.physics.lineOfSight(x, y + 0.3, z, tx, y + 0.3, tz)) { px = tx; pz = tz; break; }
    }
    const gy = this.G.physics.groundAt(px, pz, y + 1.0);
    return this.addWorldItem(it, px, gy + 0.02, pz);
  }
  makeItemMesh(rec) {
    const g = new THREE.Group();
    const def = ITEMS[rec.id];
    let model;
    if (AMMO[rec.id]) {
      model = new THREE.Mesh(Interact.ammoGeo || (Interact.ammoGeo = new THREE.BoxGeometry(0.3, 0.18, 0.2)), M(parseInt(AMMO[rec.id].color.slice(1), 16)));
      model.position.y = 0.09;
    } else if (rec.id === 'wood' || rec.id === 'stone' || rec.id === 'metal') {
      model = new THREE.Mesh(Interact.matGeo || (Interact.matGeo = new THREE.BoxGeometry(0.4, 0.25, 0.3)), M({ wood: 0xa0784a, stone: 0x9a9a9a, metal: 0x7a8a9a }[rec.id]));
      model.position.y = 0.12;
    } else if (def?.type === 'weapon') {
      model = buildWeaponModel(def.model, rec.r);
      model.rotation.set(0, 0, Math.PI / 2);
      model.position.y = 0.12;
      model.scale.setScalar(1.3);
    } else if (def?.type === 'throw') {
      model = buildWeaponModel(def.model, 0);
      model.position.y = 0.1;
      model.scale.setScalar(1.4);
    } else {
      const col = parseInt((def?.color || '#ffffff').slice(1), 16);
      const geo = def?.type === 'valuable' ? (Interact.valGeo || (Interact.valGeo = new THREE.OctahedronGeometry(0.14))) : def?.type === 'heal' ? (Interact.healGeo || (Interact.healGeo = new THREE.BoxGeometry(0.28, 0.12, 0.2))) : (Interact.foodGeo || (Interact.foodGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.2, 10)));
      model = new THREE.Mesh(geo, M(col, { rough: def?.type === 'valuable' ? 0.2 : 0.6, metal: def?.type === 'valuable' ? 0.7 : 0, emissive: def?.type === 'valuable' ? 0.2 : 0 }));
      model.position.y = 0.12;
    }
    model.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    g.add(model);
    const rarity = def?.type === 'weapon' ? rec.r : def?.type === 'valuable' ? 4 : -1;
    if (rarity >= 0) {
      const ring = new THREE.Mesh(this.ringGeo, this.glowMats[rarity]);
      ring.position.y = 0.03;
      g.add(ring);
      if (rarity >= 2) { const beam = new THREE.Mesh(this.beamGeo, this.glowMats[rarity]); g.add(beam); }
    }
    g.position.set(rec.x, rec.y, rec.z);
    g.rotation.y = (rec.x * 13.1) % 6.28;
    rec.mesh = g;
    rec.model = model;
    this.itemGroup.add(g);
  }
  removeWorldItem(rec) {
    if (rec.mesh) this.itemGroup.remove(rec.mesh);
    const i = this.items.indexOf(rec);
    if (i >= 0) this.items.splice(i, 1);
  }
  makeCrateMesh(c) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(Interact.crateGeo || (Interact.crateGeo = new THREE.BoxGeometry(1.0, 0.6, 0.65)), M(0x3f5a32, { rough: 0.6 }));
    body.position.y = 0.3; body.castShadow = true; g.add(body);
    const lid = new THREE.Mesh(Interact.lidGeo || (Interact.lidGeo = new THREE.BoxGeometry(1.04, 0.1, 0.69)), M(0x2f4a26, { rough: 0.6 }));
    lid.position.y = c.opened ? 0.7 : 0.62; if (c.opened) lid.rotation.x = -1.2; g.add(lid);
    for (const sx of [-0.35, 0.35]) { const s = new THREE.Mesh(Interact.strapGeo || (Interact.strapGeo = new THREE.BoxGeometry(0.06, 0.62, 0.67)), M(0xf0c040, { metal: 0.5, rough: 0.4, emissive: c.opened ? 0 : 0.6 })); s.position.set(sx, 0.31, 0); g.add(s); }
    if (!c.opened) { const glow = new THREE.Mesh(this.beamGeo, this.glowMats[4]); glow.scale.set(2, 1.3, 2); g.add(glow); }
    g.position.set(c.x, c.y, c.z);
    g.rotation.y = c.rot;
    c.mesh = g; c.lid = lid;
    this.itemGroup.add(g);
  }
  openCrate(c, by) {
    if (c.opened) return;
    c.opened = true;
    if (c.mesh) { this.itemGroup.remove(c.mesh); c.mesh = null; this.makeCrateMesh(c); }
    const n = c.kind === 'airdrop' ? 5 : 3;
    const table = c.kind === 'airdrop' ? 'airdrop' : 'supply';
    const cats = c.kind === 'airdrop' ? [['weapon', 60], ['heal', 25], ['throw', 15]] : [['weapon', 45], ['heal', 30], ['throw', 15], ['valuable', 10]];
    for (let k = 0; k < n; k++) {
      const it = this.rollItem(this.rng.weighted(cats), table);
      this.dropItem(it, c.x, c.y + 0.6, c.z);
      if (it.ammo) this.dropItem({ id: it.ammo, n: AMMO[it.ammo].pickup * 2, r: 0 }, c.x, c.y + 0.6, c.z);
    }
    this.dropItem({ id: 'wood', n: 30, r: 0 }, c.x, c.y + 0.6, c.z);
    this.G.audio?.play('crate_open', c, { vol: 1 });
    this.G.emitNoise(c.x, c.z, 12, by, 'crate');
  }
  searchContainer(c, by) {
    if (c.searched) return;
    c.searched = true;
    by.stats.searched++;
    const table = CONTAINER_LOOT[c.kind] || CONTAINER_LOOT.cabinet;
    const n = this.rng.chance(0.3) ? 0 : this.rng.int(1, c.kind === 'fridge' || c.kind === 'shelf' ? 3 : 2);
    if (n === 0) { this.G.hud.toast(by.isPlayer, 'Nothing useful...'); return; }
    for (let k = 0; k < n; k++) {
      const it = this.rollItem(this.rng.weighted(table), 'container');
      this.dropItem(it, c.x, c.y + 0.3, c.z);
    }
  }

  // ---------------- campfires ----------------
  placeCampfire(x, y, z, owner) {
    const G = this.G;
    const cf = { x, y, z, owner, t: 300, fx: G.fx.addCampfire(x, y, z) };
    this.campfires.push(cf);
    G.audio?.play('ignite', cf, { vol: 0.8 });
    return cf;
  }
  cook(by) {
    const conv = [['rawmeat', 'cookedmeat'], ['rawchicken', 'cookedchicken'], ['corn', 'roastcorn'], ['dirtywater', 'water']];
    let n = 0;
    for (const L of [by.inv.slots, by.inv.pack]) for (const s of L) {
      if (!s) continue;
      const c = conv.find((cv) => cv[0] === s.id);
      if (c) { s.id = c[1]; n += s.n; }
    }
    by.refreshModel();
    this.G.hud.toast(by.isPlayer, n ? `Cooked ${n} item${n > 1 ? 's' : ''}` : 'Nothing to cook');
    return n;
  }
  // ---------------- car alarms ----------------
  carAlarm(prop) {
    if (prop.alarmUsed) return;
    prop.alarmUsed = true;
    if (Math.random() > 0.55) return;
    this.alarms.push({ prop, t: 20, tick: 0 });
    this.G.hud?.toastNear(prop, 'CAR ALARM!');
  }

  // ---------------- per-frame ----------------
  update(dt) {
    const G = this.G;
    this.doorStreamT = (this.doorStreamT || 0) - dt;
    if (this.doorStreamT <= 0) {
      this.doorStreamT = 0.3;
      const cp = G.camera.position;
      for (const d of this.doorsActive) {
        const dd = Math.abs(d.x - cp.x) + Math.abs(d.z - cp.z);
        if (!d.mesh && dd < 75) this.makeDoorMesh(d);
        else if (d.mesh && dd > 105) this.dropDoorMesh(d);
      }
      for (const w of this.activeWindows) {
        const dd = Math.abs(w.x - cp.x) + Math.abs(w.z - cp.z);
        if (!w.boardMesh && dd < 90) this.makeBoardMesh(w);
        else if (w.boardMesh && dd > 120) { w.boardMesh.parent?.remove(w.boardMesh); w.boardMesh = null; }
      }
    }
    for (const d of this.doorsActive) {
      if (!d.pivot) continue;
      const target = d.open ? 1.6 : 0;
      d.angle += (target - d.angle) * Math.min(1, dt * 9);
      d.pivot.rotation.y = d.angle * (d.swing ?? -1) * d.hingeL;
      if (d.shakeT > 0) { d.shakeT -= dt; d.pivot.rotation.y += Math.sin(G.time * 80) * 0.05; }
    }
    // stream loot meshes in/out around the camera
    this.streamT = (this.streamT || 0) - dt;
    if (this.streamT <= 0) {
      this.streamT = 0.35;
      const cp = G.camera.position;
      for (const it of this.items) {
        const d = Math.abs(it.x - cp.x) + Math.abs(it.z - cp.z);
        if (!it.mesh && d < 80) this.makeItemMesh(it);
        else if (it.mesh && d > 110) { this.itemGroup.remove(it.mesh); it.mesh = null; it.model = null; }
      }
    }
    for (let i = this.campfires.length - 1; i >= 0; i--) {
      const c = this.campfires[i];
      c.t -= dt;
      c.tick = (c.tick || 0) - dt;
      if (c.tick <= 0) { c.tick = 4; if ((G.env?.night || 0) > 0.4) G.emitNoise(c.x, c.z, 55, c.owner, 'light'); }
      if (c.t <= 0) { G.fx.removeCampfire(c.fx); this.campfires.splice(i, 1); }
    }
    for (let i = this.alarms.length - 1; i >= 0; i--) {
      const a = this.alarms[i];
      a.t -= dt; a.tick -= dt;
      if (a.tick <= 0) { a.tick = 1.6; G.emitNoise(a.prop.x, a.prop.z, 140, null, 'alarm', true); G.audio?.play('car_alarm', a.prop, { vol: 1 }); G.fx.flash(a.prop.x, a.prop.y + 1, a.prop.z, 0xffa040); }
      if (a.t <= 0) this.alarms.splice(i, 1);
    }
    // auto-pickup ammo/materials by walking over
    const p = G.player;
    if (p.alive && !p.extracted) {
      for (let i = this.items.length - 1; i >= 0; i--) {
        const it = this.items[i];
        if (!(AMMO[it.id] || it.id === 'wood' || it.id === 'stone' || it.id === 'metal')) continue;
        if (Math.abs(it.x - p.pos.x) > 1.3 || Math.abs(it.z - p.pos.z) > 1.3 || Math.abs(it.y - p.pos.y) > 1.6) continue;
        const left = p.addItem(it.id, it.n);
        if (left < it.n) { G.hud.pickup(it.id, it.n - left, 0); G.audio?.play('pickup', null, { vol: 0.5 }); }
        if (left <= 0) this.removeWorldItem(it); else it.n = left;
      }
    }
  }
  explosion(x, y, z, r) {
    for (const b of this.nearbyBuildings(x, z, r + 30)) {
      if (!b.rt) continue;
      for (const w of b.rt.windows) if (w.boarded && Math.hypot(w.x - x, w.z - z) < r) this.damageBarricade(w, 400, null);
      for (const d of b.rt.doors) if (Math.hypot(d.x - x, d.z - z) < r) this.damageDoor(d, 400, null);
    }
  }

  // ---------------- queries ----------------
  nearbyBuildings(x, z, r) {
    const out = [];
    const v = this.G.view;
    const cx0 = Math.floor((x - r) / 256), cx1 = Math.floor((x + r) / 256), cz0 = Math.floor((z - r) / 256), cz1 = Math.floor((z + r) / 256);
    for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) {
      const ch = v.chunks[cz * CHUNKS_X + cx];
      if (!ch || cx < 0 || cx >= CHUNKS_X) continue;
      for (const b of ch.buildings) if (Math.abs(b.x - x) < r + 30 && Math.abs(b.z - z) < r + 30) out.push(b);
    }
    return out;
  }
  buildingAt(x, y, z) {
    for (const b of this.nearbyBuildings(x, z, 2)) {
      const dx = x - b.x, dz = z - b.z;
      const c = Math.cos(b.rot), s = Math.sin(b.rot);
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      if (Math.abs(lx) > b.w / 2 || Math.abs(lz) > b.d / 2) continue;
      if (!b.rt) return { b, floor: 0, room: -1 };
      const rooms = b.rt.rooms;
      let best = -1, floor = 0;
      for (let i = 0; i < rooms.length; i++) {
        const rm = rooms[i];
        if (y < rm.y0 - 0.6 || y > rm.y1 + 0.2) continue;
        if (lx >= rm.x0 - 0.2 && lx <= rm.x1 + 0.2 && lz >= rm.z0 - 0.2 && lz <= rm.z1 + 0.2) { best = i; floor = rm.floor; break; }
      }
      if (best < 0) {
        if (y > b.y + 1 && rooms.length) { /* on roof or between */ }
        if (rooms.length && y < rooms[0].y0 - 1) continue;
        if (best < 0 && rooms.length) { const top = Math.max(...rooms.map((r) => r.y1)); if (y > top + 0.5) continue; }
      }
      return { b, floor, room: best };
    }
    return null;
  }
  // A* over the building nav graph. Returns array of node objects.
  findPath(b, fromPos, toPos, fromIn, toIn) {
    const rt = b.rt;
    const nodes = rt.nav.nodes;
    if (!rt.adj) {
      rt.adj = nodes.map(() => []);
      for (const [a, c, kind] of rt.nav.edges) { rt.adj[a].push([c, kind]); rt.adj[c].push([a, kind]); }
      for (const e of rt.entrances) { nodes[e.out].entrance = e; nodes[e.inn].entrance = e; }
    }
    const nearestOf = (pos, filter) => {
      let best = -1, bd = 1e9;
      for (let i = 0; i < nodes.length; i++) {
        if (!filter(nodes[i])) continue;
        const d = Math.hypot(nodes[i].x - pos.x, nodes[i].z - pos.z) + Math.abs(nodes[i].y - pos.y) * 3;
        if (d < bd) { bd = d; best = i; }
      }
      return best;
    };
    const start = fromIn && fromIn.room >= 0 ? rt.rooms[fromIn.room].nav : nearestOf(fromPos, (n) => n.type === 'out' && n.entrance && n.entrance.ground);
    const goal = toIn && toIn.room >= 0 ? rt.rooms[toIn.room].nav : nearestOf(toPos, (n) => n.type === 'out');
    if (start < 0 || goal < 0) return null;
    const dist = new Map([[start, 0]]), prev = new Map();
    const open = [start];
    const h = (i) => Math.hypot(nodes[i].x - nodes[goal].x, nodes[i].z - nodes[goal].z);
    let guard = 0;
    while (open.length && guard++ < 500) {
      open.sort((a, c) => (dist.get(a) + h(a)) - (dist.get(c) + h(c)));
      const cur = open.shift();
      if (cur === goal) break;
      for (const [nb, kind] of rt.adj[cur]) {
        const n = nodes[nb];
        let cost = Math.hypot(n.x - nodes[cur].x, n.z - nodes[cur].z) + Math.abs(n.y - nodes[cur].y) * 2;
        if (kind === 'vault') { cost += 4; const e = n.entrance; if (e && e.rec.boarded) cost += 12; }
        if (kind === 'walk' && n.entrance && n.entrance.rec.kind === 'door' && n.entrance.rec.boarded) cost += 14;
        const nd = dist.get(cur) + cost;
        if (nd < (dist.get(nb) ?? Infinity)) { dist.set(nb, nd); prev.set(nb, [cur, kind]); if (!open.includes(nb)) open.push(nb); }
      }
    }
    if (!prev.has(goal) && start !== goal) return null;
    const path = [];
    let cur = goal;
    while (cur !== undefined && cur !== start) {
      const p = prev.get(cur);
      const node = { x: nodes[cur].x, y: nodes[cur].y, z: nodes[cur].z };
      path.unshift({ node, kind: p ? p[1] : 'walk', id: cur });
      cur = p ? p[0] : undefined;
    }
    path.unshift({ node: { x: nodes[start].x, y: nodes[start].y, z: nodes[start].z }, kind: 'walk', id: start });
    // flatten to waypoint objects with vault annotations
    const out = path.map((p) => ({ ...p.node, entrance: nodes[p.id].entrance }));
    for (let i = 0; i < path.length - 1; i++) if (path[i + 1].kind === 'vault') { out[i].vaultTo = out[i + 1]; }
    return out;
  }

  // what can the player interact with right now?
  findInteraction(s, aimDir) {
    const G = this.G;
    let best = null, bs = -1e9;
    const consider = (kind, obj, x, y, z, range, prompt, hold = 0) => {
      const dx = x - s.pos.x, dy = y - (s.pos.y + 1.2), dz = z - s.pos.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > range) return;
      const dot = (dx * aimDir.x + dy * aimDir.y + dz * aimDir.z) / (d || 1);
      const score = dot * 2 - d * 0.6;
      if (dot < 0.2 && d > 1.2) return;
      if (score > bs) { bs = score; best = { kind, obj, prompt, hold, x, y, z }; }
    };
    for (const it of this.items) {
      if (Math.abs(it.x - s.pos.x) > 3 || Math.abs(it.z - s.pos.z) > 3) continue;
      const def = ITEMS[it.id];
      const name = AMMO[it.id] ? AMMO[it.id].name : def ? def.name : it.id;
      const rar = def?.type === 'weapon' ? ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'][it.r] + ' ' : '';
      consider('item', it, it.x, it.y + 0.2, it.z, 2.6, `Pick up ${rar}${name}${it.n > 1 ? ' x' + it.n : ''}`);
    }
    for (const c of this.crates) if (!c.opened && Math.abs(c.x - s.pos.x) < 3 && Math.abs(c.z - s.pos.z) < 3) consider('crate', c, c.x, c.y + 0.5, c.z, 2.6, 'Open Supply Crate', 0.9);
    for (const b of this.nearbyBuildings(s.pos.x, s.pos.z, 6)) {
      const rt = b.rt;
      if (!rt) continue;
      for (const d of rt.doors) {
        if (d.broken || Math.abs(d.x - s.pos.x) > 3 || Math.abs(d.z - s.pos.z) > 3) continue;
        if (d.boarded) consider('unboard', d, d.x, d.floorY + 1.2, d.z, 2.4, 'Remove boards', 2.0);
        else {
          consider('door', d, d.x, d.floorY + 1.1, d.z, 2.4, d.open ? 'Close Door' : 'Open Door');
          if (!d.open) consider('boarddoor', d, d.x, d.floorY + 1.6, d.z, 1.6, `Barricade Door (${DOOR_BOARD_COST} wood)`, 2.8);
        }
      }
      for (const w of rt.windows) {
        if (Math.abs(w.x - s.pos.x) > 3 || Math.abs(w.z - s.pos.z) > 3 || Math.abs(w.floorY - s.pos.y) > 2) continue;
        if (w.boarded) consider('unboard', w, w.x, w.y, w.z, 2.2, 'Remove boards', 2.0);
        else consider('board', w, w.x, w.y, w.z, 2.2, `Board Up Window (${BOARD_COST} wood)`, 2.5);
      }
      for (const c of rt.containers) {
        if (c.searched || Math.abs(c.x - s.pos.x) > 3 || Math.abs(c.z - s.pos.z) > 3) continue;
        const names = { fridge: 'Fridge', cabinet: 'Cabinet', dresser: 'Dresser', medcab: 'Medicine Cabinet', toolbox: 'Toolbox', shelf: 'Shelf', register: 'Cash Register', crate: 'Crate' };
        consider('search', c, c.x, c.y, c.z, 2.3, `Search ${names[c.kind] || 'Container'}`, 1.2);
      }
    }
    for (const cf of this.campfires) consider('cook', cf, cf.x, cf.y + 0.4, cf.z, 2.6, 'Cook food / boil water', 3.5);
    // water's edge
    const wl = G.world.waterLevelAt(s.pos.x + aimDir.x * 1.5, s.pos.z + aimDir.z * 1.5);
    const gh = G.world.heightAt(s.pos.x + aimDir.x * 1.5, s.pos.z + aimDir.z * 1.5);
    if (wl > 0.5 && gh < wl && s.pos.y - wl < 1.8 && !s.swimming) {
      const lx = s.pos.x + aimDir.x * 1.5, lz = s.pos.z + aimDir.z * 1.5;
      if (bs < -1) best = { kind: 'water', obj: null, prompt: 'Fill bottle (dirty water)', hold: 1.5, x: lx, y: wl, z: lz };
    }
    return best;
  }
}
