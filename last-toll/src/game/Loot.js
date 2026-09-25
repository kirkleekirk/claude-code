import * as THREE from 'three';
import { itemModel } from '../world/Models.js';
import { def } from '../data/items.js';
import { radialTexture } from '../world/Textures.js';
import { boxesGeometry, flattenToGeometry, ChunkedBatcher } from '../world/Batcher.js';

const DOOR_MAT = new THREE.MeshLambertMaterial({ vertexColors: true });
const ITEM_MAT = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x161616 });
const ITEM_GEO = {};
function itemGeometry(id) {
  if (!ITEM_GEO[id]) ITEM_GEO[id] = flattenToGeometry(itemModel(id));
  return ITEM_GEO[id];
}

// World loot: searchable containers with animated doors, and physical items
// lying in the world that the player picks up by looking at them.

const _v = new THREE.Vector3();

export class Loot {
  constructor(scene, audio) {
    this.scene = scene;
    this.audio = audio;
    this.containers = [];
    this.items = [];
    this.doorBatch = new ChunkedBatcher(36);
    this.extras = [];
    this.group = new THREE.Group();
    scene.add(this.group);
    const ringMat = new THREE.MeshBasicMaterial({ map: radialTexture('rgba(255,236,190,0.9)', 'rgba(255,236,190,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    this.ring = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.visible = false;
    scene.add(this.ring);
  }

  addContainer({ kind, spec, x, z, y0 = 0, rotY = 0, fx = 0, fz = 1, items, label, noDoor = false }) {
    const g = new THREE.Group();
    g.position.set(x, y0, z);
    g.rotation.y = rotY;
    const style = noDoor ? 'none' : spec.door;
    const door = doorParts(spec, style);
    let doorRef = null;
    if (door) {
      // closed doors live in a static batch; opening swaps in an animated mesh
      const cr = Math.cos(rotY), sr = Math.sin(rotY);
      const key = this.doorBatch.key(x, z);
      const bb = this.doorBatch._get(x, z);
      const start = bb.vcount;
      for (const pt of door.parts) {
        const lx = door.pivot[0] + pt[0], ly = door.pivot[1] + pt[1], lz = door.pivot[2] + pt[2];
        bb.box(x + lx * cr + lz * sr, y0 + ly, z - lx * sr + lz * cr, pt[3], pt[4], pt[5], pt[6], { rotY, jitter: 0, ao: 1 });
      }
      doorRef = { key, start, count: bb.vcount - start };
      // lower drawer fronts never move: bake them into the city mesh
      if (style === 'drawer' && this.batch) {
        const w = spec.w, h = spec.h, d = spec.d;
        const doorCol = new THREE.Color(spec.color).multiplyScalar(0.82).getHex();
        for (let i = 0; i < 2; i++) {
          const ly = h * (0.4 - i * 0.28), lz = d / 2 + 0.015;
          for (const pt of [[0, ly, lz, w * 0.9, h * 0.26, 0.03, doorCol], [0, ly, lz + 0.025, 0.16, 0.025, 0.03, 0x222222]]) {
            this.batch.box(x + pt[0] * cr + pt[2] * sr, y0 + pt[1], z - pt[0] * sr + pt[2] * cr, pt[3], pt[4], pt[5], pt[6], { rotY, jitter: 0, ao: 1 });
          }
        }
      }
    }
    this.group.add(g);
    // AABB in world space
    const ca = Math.abs(Math.cos(rotY)), sa = Math.abs(Math.sin(rotY));
    const ex = (spec.w * ca + spec.d * sa) / 2 + 0.05, ez = (spec.w * sa + spec.d * ca) / 2 + 0.05;
    const c = {
      type: 'container',
      kind,
      label: label || spec.label,
      spec,
      style,
      items,
      opened: false,
      searched: false,
      group: g,
      pivot: null,
      door,
      doorRef,
      anim: 0,
      x, z, y0, rotY, fx, fz,
      aabb: { x0: x - ex, x1: x + ex, y0, y1: y0 + spec.h + 0.05, z0: z - ez, z1: z + ez },
      center: new THREE.Vector3(x, y0 + spec.h / 2, z),
    };
    this.containers.push(c);
    return c;
  }

  // Build meshes for all closed doors once the city is generated.
  finalize() {
    this.doorGroup = this.doorBatch.build(DOOR_MAT);
    this.scene.add(this.doorGroup);
  }

  open(c) {
    if (c.opened) return;
    c.opened = true;
    if (c.door) {
      // collapse the static copy and animate a real one
      const m = this.doorBatch.meshes && this.doorBatch.meshes.get(c.doorRef.key);
      if (m) {
        const pos = m.geometry.attributes.position;
        const a = pos.array, s0 = c.doorRef.start * 3;
        for (let v = 0; v < c.doorRef.count; v++) {
          a[s0 + v * 3] = a[s0];
          a[s0 + v * 3 + 1] = a[s0 + 1];
          a[s0 + v * 3 + 2] = a[s0 + 2];
        }
        pos.needsUpdate = true;
      }
      const pivot = new THREE.Group();
      pivot.position.set(c.door.pivot[0], c.door.pivot[1], c.door.pivot[2]);
      pivot.add(new THREE.Mesh(boxesGeometry(c.door.parts), DOOR_MAT));
      c.group.add(pivot);
      c.pivot = pivot;
    }
    this.audio.open(c.center, c.spec.sound || 'wood');
    c.spawnAt = 0.3;
  }

  _spillItems(c) {
    const spec = c.spec;
    const n = c.items.length;
    const lowTop = spec.h < 1.1 && !spec.mount && c.style !== 'drawer';
    for (let i = 0; i < n; i++) {
      const it = c.items[i];
      const t = n === 1 ? 0 : i / (n - 1) - 0.5;
      const along = t * Math.min(spec.w * 0.7, 0.9);
      const rx = Math.cos(c.rotY), rz = -Math.sin(c.rotY); // local +x in world
      let p;
      if (c.kind === 'shelf') {
        const lvl = 1 + (i % 2);
        p = new THREE.Vector3(c.x + (Math.random() - 0.5) * 0.8 * (c.fx ? 0 : 1), 0.17 + lvl * 0.48, c.z + (Math.random() - 0.5) * 0.8 * (c.fz ? 0 : 1));
        p.x += c.fx * 0.05 * (i % 2 ? 1 : -1);
        p.z += c.fz * 0.05 * (i % 2 ? 1 : -1);
      } else if (c.style === 'drawer') {
        // inside the pulled-out drawer
        p = new THREE.Vector3(c.x + rx * along * 0.8 + c.fx * (spec.d / 2 + 0.05), c.y0 + spec.h * 0.72, c.z + rz * along * 0.8 + c.fz * (spec.d / 2 + 0.05));
      } else if (lowTop) {
        p = new THREE.Vector3(c.x + rx * along, c.y0 + spec.h + 0.06, c.z + rz * along);
      } else if (spec.mount) {
        p = new THREE.Vector3(c.x + rx * along * 0.6 + c.fx * 0.25, c.y0 + 0.05, c.z + rz * along * 0.6 + c.fz * 0.25);
        p.y = 0.08;
        p.x += c.fx * 0.3;
        p.z += c.fz * 0.3;
      } else {
        p = new THREE.Vector3(c.x + rx * along + c.fx * (spec.d / 2 + 0.3), 0.08, c.z + rz * along + c.fz * (spec.d / 2 + 0.3));
      }
      this.spawnItem(it, p, c.rotY + (Math.random() - 0.5) * 0.8);
    }
    c.items = [];
    c.searched = true;
  }

  spawnItem(item, pos, rotY = 0) {
    const mesh = new THREE.Mesh(itemGeometry(item.id), ITEM_MAT);
    mesh.position.copy(pos);
    mesh.rotation.y = rotY;
    this.group.add(mesh);
    const d = def(item.id);
    const entry = { type: 'item', item, mesh, pos: mesh.position, radius: d.cat === 'weapon' ? 0.3 : 0.2, label: d.name };
    this.items.push(entry);
    return entry;
  }

  // Drop with a small toss (used when the player drops items / walkers drop loot).
  dropItem(item, pos) {
    const p = pos.clone();
    p.y = 0.08;
    return this.spawnItem(item, p, Math.random() * Math.PI * 2);
  }

  removeItem(entry) {
    const i = this.items.indexOf(entry);
    if (i >= 0) this.items.splice(i, 1);
    this.group.remove(entry.mesh);
  }

  addExtra(extra) {
    extra.type = extra.type || 'extra';
    this.extras.push(extra);
    return extra;
  }

  removeExtra(extra) {
    const i = this.extras.indexOf(extra);
    if (i >= 0) this.extras.splice(i, 1);
    if (extra.mesh && extra.mesh.parent && extra.ownMesh) extra.mesh.parent.remove(extra.mesh);
  }

  // Find what the player is looking at within reach.
  query(o, d, maxDist = 2.3) {
    let best = null, bestT = maxDist;
    const consider = (entry, center, radius) => {
      const lx = center.x - o.x, ly = center.y - o.y, lz = center.z - o.z;
      const tca = lx * d.x + ly * d.y + lz * d.z;
      if (tca < 0 || tca > bestT + radius) return;
      const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
      // generous cone: radius grows slightly with distance
      const rr = radius + tca * 0.06;
      if (d2 > rr * rr) return;
      const t = Math.max(0, tca - radius * 0.5);
      if (t < bestT) { bestT = t; best = entry; }
    };
    for (const it of this.items) {
      const p = it.pos;
      if (Math.abs(p.x - o.x) > 3 || Math.abs(p.z - o.z) > 3) continue;
      _v.set(p.x, p.y + 0.06, p.z);
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
    this.ring.position.set(p.x, (entry.type === 'item' ? p.y : 0.02) + 0.01, p.z);
  }

  update(dt, time, camPos = null, drawDist = 80) {
    // distance culling: fogged-out loot is not worth a draw call
    this.cullT = (this.cullT || 0) - dt;
    if (camPos && this.cullT <= 0) {
      this.cullT = 0.4;
      const d2 = (drawDist + 5) * (drawDist + 5);
      for (const c of this.containers) {
        if (!c.pivot) continue;
        const dx = c.x - camPos.x, dz = c.z - camPos.z;
        c.group.visible = dx * dx + dz * dz < d2;
      }
      for (const it of this.items) {
        const dx = it.pos.x - camPos.x, dz = it.pos.z - camPos.z;
        it.mesh.visible = dx * dx + dz * dz < d2;
      }
    }
    for (const c of this.containers) {
      if (!c.opened) continue;
      if (c.anim < 1) {
        c.anim = Math.min(1, c.anim + dt * 2.8);
        const e = 1 - Math.pow(1 - c.anim, 3);
        if (c.pivot) {
          if (c.style === 'hinge') c.pivot.rotation.y = -1.75 * e;
          else if (c.style === 'drawer') c.pivot.position.z = c.spec.d / 2 + 0.015 + 0.36 * e;
          else if (c.style === 'lid') c.pivot.rotation.x = -1.85 * e;
        }
      }
      if (!c.searched) {
        c.spawnAt -= dt;
        if (c.spawnAt <= 0) this._spillItems(c);
      }
    }
    if (this.ring.visible) this.ring.material.opacity = 0.55 + Math.sin(time * 6) * 0.25;
  }

  dispose() {
    if (this.doorGroup) {
      this.scene.remove(this.doorGroup);
      this.doorGroup.traverse((o) => o.geometry && o.geometry.dispose());
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

// Moving part of a container, in container-local space: pivot + boxes relative to it.
function doorParts(spec, style) {
  const w = spec.w, h = spec.h, d = spec.d;
  const col = new THREE.Color(spec.color).multiplyScalar(0.82).getHex();
  if (style === 'hinge') {
    return { pivot: [-w / 2 + 0.02, 0, d / 2 + 0.015], parts: [[w * 0.48, h / 2, 0, w * 0.96, h * 0.94, 0.03, col], [w * 0.88, h * 0.55, 0.03, 0.03, 0.12, 0.03, 0x222222]] };
  }
  if (style === 'drawer') {
    return { pivot: [0, h * 0.7, d / 2 + 0.015], parts: [[0, 0, 0, w * 0.9, h * 0.26, 0.03, col], [0, -0.01, -d * 0.4, w * 0.84, h * 0.2, d * 0.8, 0x3a2a1e], [0, 0, 0.025, 0.16, 0.025, 0.03, 0x222222]] };
  }
  if (style === 'lid') {
    return { pivot: [0, h, -d / 2], parts: [[0, 0.025, d / 2, w * 1.02, 0.05, d * 1.02, col]] };
  }
  return null;
}
