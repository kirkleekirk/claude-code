import * as THREE from '../../vendor/three.module.min.js';
import { mergeGeometries, basic, std } from './materials.js';
import { fixtureMaterial } from './cavelight.js';

// Box geometry whose UVs are in world metres / uvScale, so textures keep their size.
export function boxGeometry(w, h, d, uvScale = 4) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  // face order: +x, -x, +y, -y, +z, -z (4 verts each)
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, (uv.getX(i) * dims[f][0]) / uvScale, (uv.getY(i) * dims[f][1]) / uvScale);
    }
  }
  return g;
}

// Collects static geometry per material and merges it into a few draw calls.
export class Builder {
  constructor(scene, physics, materials) {
    this.scene = scene;
    this.physics = physics;
    this.M = materials;
    this.batches = new Map();
    this.group = new THREE.Group();
    this.group.name = 'structures';
    scene.add(this.group);
    // big maps tag what they build by region ('surface' / 'cave') so whole regions can be hidden
    this.region = 'surface';
    this.regionGroups = {};
    this.lightAnchors = [];
    this.glows = [];
    this.beams = [];
    // lamps whose light is baked into the light volume (maps with a LIGHTING block)
    this.bakedLights = [];
    // their glowing fittings, batched per circuit and switched by the shader
    this.fixtureBatches = new Map();
  }

  // A lamp baked into the light volume: light + a glowing fitting (+ an optional halo).
  // o: { color, intensity, range, circuit, spot:{dir,angle,penumbra}, fitting: geometry|null,
  //      rot, glow (size) , occlude (test walls in the bake), bright }
  bakedLamp(x, y, z, o = {}) {
    const color = o.color ?? 0xffe2b8;
    const circuit = o.circuit ?? null;
    this.bakedLights.push({ x, y, z, color, intensity: o.intensity ?? 12, range: o.range ?? 14, spot: o.spot || null, circuit, occlude: !!o.occlude });
    if (o.fitting !== null) {
      const g = o.fitting || new THREE.SphereGeometry(o.size ?? 0.12, 10, 8);
      const m = new THREE.Matrix4().makeRotationY(o.rot || 0);
      if (o.tilt) m.multiply(new THREE.Matrix4().makeRotationX(o.tilt));
      m.setPosition(x, y, z);
      this.fixture(g, m, color, o.bright ?? 5, circuit);
    }
    if (o.glow) this.glows.push({ x, y, z, size: o.glow, color, circuit, baked: true });
  }

  // Emissive geometry that lights up with its circuit.
  fixture(geometry, matrix, color, bright, circuit) {
    const key = new THREE.Color(color).getHexString() + ':' + bright + ':' + circuit + ':' + this.region;
    let b = this.fixtureBatches.get(key);
    if (!b) {
      b = { color, bright, circuit, items: [], region: this.region };
      this.fixtureBatches.set(key, b);
    }
    b.items.push({ geometry, matrix });
  }

  _batch(mat, geometry, matrix, opts = {}) {
    const region = opts.region || this.region;
    const key = mat.uuid + (opts.cast === false ? ':nc' : '') + ':' + region;
    let b = this.batches.get(key);
    if (!b) {
      b = { mat, items: [], cast: opts.cast !== false, receive: opts.receive !== false, region };
      this.batches.set(key, b);
    }
    b.items.push({ geometry, matrix });
  }

  // y is the bottom of the box.
  box(x, y, z, w, h, d, o = {}) {
    const mat = typeof o.mat === 'string' ? this.M[o.mat] : o.mat || this.M.concrete;
    const rot = o.rot || 0;
    const g = boxGeometry(w, h, d, o.uv || 4);
    const m = new THREE.Matrix4().makeRotationY(rot);
    if (o.rx || o.rz) m.multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(o.rx || 0, 0, o.rz || 0)));
    m.setPosition(x, y + h / 2, z);
    if (o.visible !== false) this._batch(mat, g, m, o);
    let col = null;
    if (o.collide !== false) {
      col = this.physics.addBox({
        x, y, z, w, h, d, rot,
        walkable: o.walkable !== false,
        material: o.phys || guessPhys(o.mat),
        nav: o.nav !== false,
        bullets: o.bullets !== false,
        climbable: o.climbable !== false,
      });
      // blocks baked lamp light (walls, roofs); see-through things don't
      col.opaque = o.opaque ?? (o.visible !== false && !/glass|chainlink|cryo/.test(typeof o.mat === 'string' ? o.mat : ''));
    }
    return col;
  }

  // Arbitrary geometry (already positioned via matrix).
  mesh(geometry, matrix, mat, o = {}) {
    this._batch(typeof mat === 'string' ? this.M[mat] : mat, geometry, matrix, o);
  }

  cylinder(x, y, z, r, h, o = {}) {
    const g = new THREE.CylinderGeometry(o.rTop ?? r, r, h, o.seg || 12, 1, !!o.open);
    const m = new THREE.Matrix4();
    if (o.horizontal) m.makeRotationFromEuler(new THREE.Euler(0, o.rot || 0, Math.PI / 2));
    m.setPosition(x, y + (o.horizontal ? r : h / 2), z);
    this._batch(typeof o.mat === 'string' ? this.M[o.mat] : o.mat || this.M.steel, g, m, o);
    if (o.collide !== false && !o.horizontal) {
      return this.physics.addCylinder({ x, z, r, y0: y, y1: y + h, walkable: o.walkable ?? true, material: o.phys || 'metal' });
    }
    return null;
  }

  // Wall from (x1,z1) to (x2,z2) with openings [{at, w, h}] measured along the wall.
  wall(x1, z1, x2, z2, o = {}) {
    const h = o.h ?? 4;
    const t = o.t ?? 0.4;
    const y0 = o.y0 ?? 0;
    const len = Math.hypot(x2 - x1, z2 - z1);
    const dx = (x2 - x1) / len;
    const dz = (z2 - z1) / len;
    const rot = Math.atan2(-dz, dx);
    const segs = [];
    let cursor = 0;
    const openings = (o.openings || []).slice().sort((a, b) => a.at - b.at);
    for (const op of openings) {
      const a = op.at - op.w / 2;
      if (a > cursor) segs.push([cursor, a, 0, h]);
      const oh = op.h ?? 3;
      if (oh < h) segs.push([a, a + op.w, oh, h]); // lintel
      if (op.sill) segs.push([a, a + op.w, 0, op.sill]);
      cursor = op.at + op.w / 2;
    }
    if (cursor < len) segs.push([cursor, len, 0, h]);
    for (const [s0, s1, b0, b1] of segs) {
      const mid = (s0 + s1) / 2;
      const cx = x1 + dx * mid;
      const cz = z1 + dz * mid;
      this.box(cx, y0 + b0, cz, s1 - s0, b1 - b0, t, { ...o, rot, walkable: o.walkable ?? false });
    }
    return { rot, len, dx, dz };
  }

  // Shipping container (12.2 x 2.6 x 2.4). Walkable roof for exo players.
  container(x, z, rot, y, color, o = {}) {
    const len = o.len || 12.2;
    const M = this.M;
    const mat = M[color] || M.olive;
    this.box(x, y, z, len, 2.6, 2.44, { mat, rot, uv: 2.6, phys: 'metal' });
    // corrugated skin overlay on the long sides
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    for (const side of [-1, 1]) {
      const ox = s * side * 1.23;
      const oz = c * side * 1.23;
      this.box(x + ox, y + 0.1, z + oz, len - 0.3, 2.4, 0.04, { mat: M.corrugated, rot, collide: false, uv: 2.4 });
    }
    // door end bars
    const ex = c * (len / 2 + 0.02);
    const ez = -s * (len / 2 + 0.02);
    for (let k = -1; k <= 1; k += 2) {
      this.box(x + ex + s * k * 0.5, y + 0.1, z + ez + c * k * 0.5, 0.06, 2.4, 0.06, { mat: M.steelDark, rot, collide: false });
    }
  }

  // Chain-link fence along a polyline, with posts. Bullets pass through the mesh.
  fence(input, o = {}) {
    const h = o.h ?? 3;
    const M = this.M;
    // split long runs so panels follow the terrain
    const points = [input[0]];
    for (let i = 0; i < input.length - 1; i++) {
      const [ax, az] = input[i];
      const [bx, bz] = input[i + 1];
      const n = o.yFn ? Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 6)) : 1;
      for (let k = 1; k <= n; k++) points.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
    }
    for (let i = 0; i < points.length - 1; i++) {
      const [x1, z1] = points[i];
      const [x2, z2] = points[i + 1];
      const len = Math.hypot(x2 - x1, z2 - z1);
      const rot = Math.atan2(-(z2 - z1) / len, (x2 - x1) / len);
      const cx = (x1 + x2) / 2;
      const cz = (z1 + z2) / 2;
      const y = o.yFn ? o.yFn(cx, cz) : 0;
      const g = new THREE.PlaneGeometry(len, h);
      const uv = g.attributes.uv;
      for (let k = 0; k < uv.count; k++) uv.setXY(k, (uv.getX(k) * len) / 1.6, (uv.getY(k) * h) / 1.6);
      const m = new THREE.Matrix4().makeRotationY(rot);
      m.setPosition(cx, y + h / 2, cz);
      this.mesh(g, m, M.chainlink, { cast: false });
      this.physics.addBox({ x: cx, y: y - 0.5, z: cz, w: len, h: h + 0.5, d: 0.12, rot, walkable: false, material: 'metal', bullets: false });
      const posts = Math.max(1, Math.round(len / 3));
      for (let p = 0; p <= posts; p++) {
        const px = x1 + ((x2 - x1) * p) / posts;
        const pz = z1 + ((z2 - z1) * p) / posts;
        const py = o.yFn ? o.yFn(px, pz) : 0;
        this.cylinder(px, py - 0.3, pz, 0.05, h + 0.6, { mat: 'steelDark', seg: 6, collide: false });
      }
      // barbed wire top rail
      const top = new THREE.CylinderGeometry(0.03, 0.03, len, 4);
      const tm = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0, rot, Math.PI / 2));
      tm.setPosition(cx, y + h + 0.25, cz);
      this.mesh(top, tm, M.steelDark, { cast: false });
    }
  }

  // Lamp head with a glow sprite. Registers a light anchor for the dynamic light pool.
  lamp(x, y, z, o = {}) {
    const color = o.color ?? 0xffd2a0;
    const mat = basic({ color });
    mat.color.multiplyScalar(o.bright ?? 4.5);
    const g = o.shape === 'tube' ? new THREE.BoxGeometry(o.len || 1.2, 0.08, 0.12) : new THREE.CylinderGeometry(0.22, 0.28, 0.12, 10);
    const m = new THREE.Matrix4().makeRotationY(o.rot || 0);
    m.setPosition(x, y, z);
    const mesh = new THREE.Mesh(g, mat);
    mesh.applyMatrix4(m);
    // mesh: false for a light with no visible fitting (a glow from somewhere off-screen)
    if (o.mesh !== false) this.regionGroup(this.region).add(mesh);
    // circuit: lit only once that circuit has power (emergency lamps: only until it has)
    const anchor = {
      x, y: y - 0.3, z, color: new THREE.Color(color), intensity: o.intensity ?? 18, distance: o.distance ?? 14,
      flicker: o.flicker || 0, circuit: o.circuit ?? (o.needsPower ? 'main' : null), emergency: !!o.emergency,
      dimUnpowered: !!o.dimUnpowered, zone: o.zone ?? -1, mesh, mat, baseColor: mat.color.clone(),
    };
    this.lightAnchors.push(anchor);
    if (o.glow !== false) this.glows.push({ x, y: y - 0.05, z, size: o.glowSize ?? 2.2, color, anchor });
    return anchor;
  }

  // Fake volumetric floodlight beam (rendered by the FX layer).
  beam(x, y, z, dir, o = {}) {
    this.beams.push({ x, y, z, dir: dir.clone().normalize(), length: o.length ?? 22, radius: o.radius ?? 5, color: o.color ?? 0xfff0d8, circuit: o.circuit ?? (o.needsPower ? 'main' : null), intensity: o.intensity ?? 0.22 });
  }

  sign(x, y, z, rot, texture, w, h, o = {}) {
    const mat = o.emissive
      ? basic({ map: texture, transparent: !!o.transparent })
      : std({ map: texture, roughness: 0.75, transparent: !!o.transparent, alphaTest: o.transparent ? 0.1 : 0 });
    if (o.emissive) mat.color.multiplyScalar(o.emissive);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = rot;
    mesh.receiveShadow = true;
    this.regionGroup(this.region).add(mesh);
    return mesh;
  }

  regionGroup(region) {
    let g = this.regionGroups[region];
    if (!g) {
      g = new THREE.Group();
      g.name = 'region:' + region;
      this.group.add(g);
      this.regionGroups[region] = g;
    }
    return g;
  }

  finalize() {
    for (const b of this.batches.values()) {
      const geo = mergeGeometries(b.items);
      const mesh = new THREE.Mesh(geo, b.mat);
      mesh.castShadow = b.cast;
      mesh.receiveShadow = b.receive;
      this.regionGroup(b.region).add(mesh);
    }
    this.batches.clear();
    for (const b of this.fixtureBatches.values()) {
      const mesh = new THREE.Mesh(mergeGeometries(b.items), fixtureMaterial(b.color, b.bright));
      mesh.name = 'fixtures:' + b.circuit;
      this.regionGroup(b.region || 'surface').add(mesh);
    }
    this.fixtureBatches.clear();
  }
}

function guessPhys(mat) {
  if (!mat || typeof mat !== 'string') return 'concrete';
  if (/steel|olive|corrugated|rust|black|hazard/.test(mat)) return 'metal';
  if (/plank|log|bark/.test(mat)) return 'wood';
  if (/rock/.test(mat)) return 'rock';
  return 'concrete';
}
