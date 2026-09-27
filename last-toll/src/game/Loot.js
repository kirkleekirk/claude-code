import * as THREE from 'three';
import { itemModel } from '../world/Models.js';
import { def } from '../data/items.js';
import { radialTexture } from '../world/Textures.js';
import { boxesGeometry, flattenToGeometry, ChunkedBatcher } from '../world/Batcher.js';
import { shellParts, leafParts, slotList, containerHeight } from './containers.js';

// World loot: hollow containers with animated doors, lids and drawers, and
// physical items the player picks up by looking at them.
//
// Items resting in the world from the start are baked into static batches (one
// draw call per chunk) and hidden in place when taken. Items that appear later
// (container contents, drops) are individual meshes.

const DOOR_MAT = new THREE.MeshLambertMaterial({ vertexColors: true });
const ITEM_MAT = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x161616 });

// Loot geometry, normalised so it rests on y=0 and is centred in x/z.
const SHAPES = {};
export function itemShape(id) {
  if (!SHAPES[id]) {
    const geo = flattenToGeometry(itemModel(id));
    geo.computeBoundingBox();
    const b = geo.boundingBox;
    geo.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    const size = new THREE.Vector3();
    geo.boundingBox.getSize(size);
    SHAPES[id] = { geo, size, scale: def(id).cat === 'weapon' ? 1 : 1.35 };
  }
  return SHAPES[id];
}

const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

// Hide a baked range of vertices by folding it into a degenerate point far below the floor.
function collapse(mesh, ref) {
  const pos = mesh.geometry.attributes.position;
  const a = pos.array, s0 = ref.start * 3;
  const x = a[s0], z = a[s0 + 2];
  for (let v = 0; v < ref.count; v++) {
    a[s0 + v * 3] = x;
    a[s0 + v * 3 + 1] = -50;
    a[s0 + v * 3 + 2] = z;
  }
  pos.needsUpdate = true;
}

export class Loot {
  constructor(scene, audio) {
    this.scene = scene;
    this.audio = audio;
    this.containers = [];
    this.items = [];
    this.pending = [];
    this.extras = [];
    this.doorBatch = new ChunkedBatcher(36);
    this.itemBatch = new ChunkedBatcher(36);
    this.finalized = false;
    this.batch = null; // the city's static batch, set by the generator
    this.group = new THREE.Group();
    scene.add(this.group);
    const ringMat = new THREE.MeshBasicMaterial({ map: radialTexture('rgba(255,236,190,0.9)', 'rgba(255,236,190,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    this.ring = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.visible = false;
    scene.add(this.ring);
  }

  // Container space -> world space.
  _toWorld(c, lx, ly, lz, out) {
    const cr = Math.cos(c.rotY), sr = Math.sin(c.rotY);
    return out.set(c.x + lx * cr + lz * sr, c.y0 + ly, c.z - lx * sr + lz * cr);
  }

  addContainer({ kind, spec, x, z, y0 = 0, rotY = 0, items, label, locked = null }) {
    const c = {
      type: 'container', kind, spec, label: label || spec.label, items: items || [],
      opened: false, x, z, y0, rotY, anim: 0, leaves: [], slots: slotList(spec),
      locked: locked ?? spec.locked ?? null,
    };
    // body shell goes into the city's static mesh
    if (this.batch) {
      for (const pt of shellParts(spec)) {
        this._toWorld(c, pt[0], pt[1], pt[2], _v);
        this.batch.box(_v.x, _v.y, _v.z, pt[3], pt[4], pt[5], pt[6], { rotY, jitter: 0, ao: 1 });
      }
    }
    // closed doors/lids/drawers live in a static batch until opened
    c.leafSpec = leafParts(spec);
    const bb = this.doorBatch._get(x, z);
    const start = bb.vcount;
    for (const leaf of c.leafSpec) {
      for (const pt of leaf.parts) {
        this._toWorld(c, leaf.pivot[0] + pt[0], leaf.pivot[1] + pt[1], leaf.pivot[2] + pt[2], _v);
        bb.box(_v.x, _v.y, _v.z, pt[3], pt[4], pt[5], pt[6], { rotY, jitter: 0, ao: 1 });
      }
    }
    c.doorRef = { key: this.doorBatch.key(x, z), start, count: bb.vcount - start };
    const g = new THREE.Group();
    g.position.set(x, y0, z);
    g.rotation.y = rotY;
    this.group.add(g);
    c.group = g;
    const ca = Math.abs(Math.cos(rotY)), sa = Math.abs(Math.sin(rotY));
    const ex = (spec.w * ca + spec.d * sa) / 2 + 0.04, ez = (spec.w * sa + spec.d * ca) / 2 + 0.04;
    c.aabb = { x0: x - ex, x1: x + ex, y0, y1: y0 + containerHeight(spec) + 0.04, z0: z - ez, z1: z + ez };
    c.center = new THREE.Vector3(x, y0 + spec.h / 2, z);
    this.containers.push(c);
    return c;
  }

  // Build the static meshes once the level is generated.
  finalize() {
    this.doorGroup = this.doorBatch.build(DOOR_MAT);
    this.doorGroup.traverse((o) => { o.castShadow = false; });
    this.scene.add(this.doorGroup);
    this.itemGroup = this.itemBatch.build(ITEM_MAT);
    this.itemGroup.traverse((o) => { o.castShadow = false; });
    this.scene.add(this.itemGroup);
    this.finalized = true;
  }

  open(c) {
    if (c.opened) return;
    c.opened = true;
    const m = this.doorBatch.meshes && this.doorBatch.meshes.get(c.doorRef.key);
    if (m && c.doorRef.count) collapse(m, c.doorRef);
    for (const leaf of c.leafSpec) {
      const pivot = new THREE.Group();
      pivot.position.set(leaf.pivot[0], leaf.pivot[1], leaf.pivot[2]);
      const mesh = new THREE.Mesh(boxesGeometry(leaf.parts), DOOR_MAT);
      pivot.add(mesh);
      c.group.add(pivot);
      c.leaves.push({ pivot, motion: leaf.motion, open: leaf.open, z0: leaf.pivot[2] });
    }
    this._placeItems(c);
    this.audio.open(c.center, c.spec.sound || 'wood');
  }

  // Choose a scale and heading so an item fits the slot it rests in.
  _fit(id, slot) {
    const sh = itemShape(id);
    const sx = sh.size.x, sy = sh.size.y, sz = sh.size.z;
    const slotLong = Math.max(slot.max[0], slot.max[2]), slotShort = Math.min(slot.max[0], slot.max[2]);
    const long = Math.max(sx, sz), short = Math.min(sx, sz);
    let rot = (sx >= sz) === (slot.max[0] >= slot.max[2]) ? 0 : Math.PI / 2;
    const scale = Math.max(0.3, Math.min(sh.scale, slotLong / long, slotShort / Math.max(short, 0.01), slot.max[1] / Math.max(sy, 0.01)));
    // a little disorder when there is room for it
    if (long * scale < slotShort * 0.8) rot += (Math.random() - 0.5) * 0.9;
    return { scale, rot };
  }

  _placeItems(c) {
    const n = c.items.length;
    for (let i = 0; i < n; i++) {
      const it = c.items[i];
      const slot = c.slots[i % c.slots.length];
      const stackY = Math.floor(i / c.slots.length) * 0.05;
      const { scale, rot } = this._fit(it.id, slot);
      const mesh = new THREE.Mesh(itemShape(it.id).geo, ITEM_MAT);
      mesh.scale.setScalar(scale);
      if (slot.leaf != null && c.leaves[slot.leaf]) {
        // rides out with the drawer, becomes a free item when the drawer stops
        mesh.position.set(slot.p[0], slot.p[1] + stackY, slot.p[2]);
        mesh.rotation.y = rot;
        c.leaves[slot.leaf].pivot.add(mesh);
        this.pending.push({ c, mesh, item: it });
      } else {
        this._toWorld(c, slot.p[0], slot.p[1] + stackY, slot.p[2], mesh.position);
        mesh.rotation.y = c.rotY + rot;
        this.group.add(mesh);
        this._register(it, mesh);
      }
    }
    c.items = [];
  }

  _register(item, mesh, extra = {}) {
    const d = def(item.id);
    const sh = itemShape(item.id);
    const entry = {
      type: 'item', item, mesh, pos: mesh.position, label: d.name,
      radius: Math.max(0.12, Math.min(0.35, Math.max(sh.size.x, sh.size.z) * mesh.scale.x * 0.55)),
      height: sh.size.y * mesh.scale.x,
      ...extra,
    };
    this.items.push(entry);
    return entry;
  }

  // Place an item in the world. Items created while the level is being built are
  // baked into a static batch; anything later gets its own mesh.
  spawnItem(item, pos, rotY = 0, opts = {}) {
    const sh = itemShape(item.id);
    const scale = opts.scale ?? sh.scale;
    if (!this.finalized && opts.static !== false) {
      const bb = this.itemBatch._get(pos.x, pos.z);
      const start = bb.vcount;
      _q.setFromAxisAngle(UP, rotY);
      _s.setScalar(scale);
      _m.compose(pos, _q, _s);
      bb.geoColored(sh.geo, _m);
      const ref = { key: this.itemBatch.key(pos.x, pos.z), start, count: bb.vcount - start };
      const d = def(item.id);
      const entry = {
        type: 'item', item, pos: pos.clone(), label: d.name, batchRef: ref,
        radius: Math.max(0.12, Math.min(0.35, Math.max(sh.size.x, sh.size.z) * scale * 0.55)),
        height: sh.size.y * scale,
      };
      this.items.push(entry);
      return entry;
    }
    const mesh = new THREE.Mesh(sh.geo, ITEM_MAT);
    mesh.scale.setScalar(scale);
    mesh.position.copy(pos);
    mesh.rotation.y = rotY;
    this.group.add(mesh);
    return this._register(item, mesh);
  }

  // Drops (from the player's pack or a dead walker) land on the floor.
  dropItem(item, pos, floorY = 0.08) {
    const p = pos.clone();
    p.y = floorY;
    return this.spawnItem(item, p, Math.random() * Math.PI * 2, { static: false });
  }

  removeItem(entry) {
    const i = this.items.indexOf(entry);
    if (i >= 0) this.items.splice(i, 1);
    if (entry.batchRef) {
      const m = this.itemBatch.meshes && this.itemBatch.meshes.get(entry.batchRef.key);
      if (m) collapse(m, entry.batchRef);
    } else if (entry.mesh) this.group.remove(entry.mesh);
  }

  addExtra(extra) {
    extra.type = extra.type || 'extra';
    this.extras.push(extra);
    return extra;
  }

  removeExtra(extra) {
    const i = this.extras.indexOf(extra);
    if (i >= 0) this.extras.splice(i, 1);
  }

  // Find what the player is looking at within reach.
  query(o, d, maxDist = 2.3) {
    let best = null, bestT = maxDist;
    const consider = (entry, center, radius) => {
      const lx = center.x - o.x, ly = center.y - o.y, lz = center.z - o.z;
      const tca = lx * d.x + ly * d.y + lz * d.z;
      if (tca < 0 || tca > bestT + radius) return;
      const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
      const rr = radius + tca * 0.05;
      if (d2 > rr * rr) return;
      const t = Math.max(0, tca - radius * 0.5);
      if (t < bestT) { bestT = t; best = entry; }
    };
    for (const it of this.items) {
      const p = it.pos;
      if (Math.abs(p.x - o.x) > 3 || Math.abs(p.z - o.z) > 3) continue;
      _v.set(p.x, p.y + Math.min(0.2, it.height * 0.5), p.z);
      consider(it, _v, it.radius);
    }
    for (const ex of this.extras) {
      const p = ex.getPos ? ex.getPos(_v) : ex.pos;
      if (Math.abs(p.x - o.x) > 3 || Math.abs(p.z - o.z) > 3) continue;
      consider(ex, p, ex.radius || 0.3);
    }
    for (const c of this.containers) {
      if (c.opened) continue;
      const b = c.aabb;
      if (o.x < b.x0 - 3 || o.x > b.x1 + 3 || o.z < b.z0 - 3 || o.z > b.z1 + 3) continue;
      const t = rayAabb(o, d, b, bestT);
      if (t >= 0 && t < bestT) { bestT = t; best = c; }
    }
    return best;
  }

  highlight(entry) {
    if (!entry || entry.type === 'container') {
      this.ring.visible = false;
      return;
    }
    const p = entry.getPos ? entry.getPos(_v) : entry.pos;
    this.ring.visible = true;
    this.ring.position.set(p.x, p.y + 0.012, p.z);
    const r = entry.type === 'item' ? Math.max(0.35, entry.radius * 2.6) : 0.7;
    this.ring.scale.setScalar(r / 0.7);
  }

  update(dt, time, camPos = null, drawDist = 80) {
    this.cullT = (this.cullT || 0) - dt;
    if (camPos && this.cullT <= 0) {
      this.cullT = 0.4;
      const d2 = (drawDist + 5) * (drawDist + 5);
      for (const c of this.containers) {
        if (!c.leaves.length) continue;
        const dx = c.x - camPos.x, dz = c.z - camPos.z;
        c.group.visible = dx * dx + dz * dz < d2;
      }
      for (const it of this.items) {
        if (!it.mesh) continue;
        const dx = it.pos.x - camPos.x, dz = it.pos.z - camPos.z;
        it.mesh.visible = dx * dx + dz * dz < d2;
      }
    }
    for (const c of this.containers) {
      if (!c.opened || c.anim >= 1) continue;
      c.anim = Math.min(1, c.anim + dt * 2.6);
      const e = 1 - Math.pow(1 - c.anim, 3);
      for (const l of c.leaves) {
        if (l.motion === 'hingeY') l.pivot.rotation.y = l.open * e;
        else if (l.motion === 'hingeX') l.pivot.rotation.x = l.open * e;
        else l.pivot.position.z = l.z0 + l.open * e;
      }
      if (c.anim >= 1) {
        // drawer contents become ordinary items where the drawer stopped
        c.group.updateMatrixWorld(true);
        for (let i = this.pending.length - 1; i >= 0; i--) {
          const pd = this.pending[i];
          if (pd.c !== c) continue;
          this.group.attach(pd.mesh);
          this._register(pd.item, pd.mesh);
          this.pending.splice(i, 1);
        }
      }
    }
    if (this.ring.visible) this.ring.material.opacity = 0.55 + Math.sin(time * 6) * 0.25;
  }

  dispose() {
    for (const g of [this.doorGroup, this.itemGroup]) {
      if (!g) continue;
      this.scene.remove(g);
      g.traverse((o) => o.geometry && o.geometry.dispose());
    }
    this.scene.remove(this.group);
    this.scene.remove(this.ring);
  }
}

function rayAabb(o, d, b, maxT) {
  let tmin = 0, tmax = maxT;
  for (const [oa, da, a0, a1] of [[o.x, d.x, b.x0, b.x1], [o.y, d.y, b.y0, b.y1], [o.z, d.z, b.z0, b.z1]]) {
    if (Math.abs(da) < 1e-9) {
      if (oa < a0 || oa > a1) return -1;
    } else {
      let t1 = (a0 - oa) / da, t2 = (a1 - oa) / da;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return -1;
    }
  }
  return tmin;
}
