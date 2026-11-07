// World generation: terrain stamps, structures, roads, props and vegetation.
import * as THREE from 'three';
import { Terrain, T, terrainMaterial, townPlane } from './terrain.js';
import { STREETS, ROADS, FARMS, FIELDS, WOODS, TOWN_LOTS, FEATURES } from './layout.js';
import { roadCentreline, buildRoadRibbon, buildTownStreets, buildTownMarkings } from './roads.js';
import { GeoBuilder, rgb } from '../geom.js';
import { buildingMaterial } from '../atlas.js';
import { PLANS } from '../building/prefabs.js';
import { rotateStructure } from '../building/planner.js';
import { CELL, STORY } from '../building/defs.js';
import { smoothstep, clamp, mulberry32, makeNoise2D } from '../util.js';
import { Trees, TREE, buildCrops, buildClumps, GrassField } from './vegetation.js';
import { riverFar } from './terrain.js';

const noise = makeNoise2D(2024);

export class World {
  constructor(scene, physics, progress = () => {}) {
    this.scene = scene;
    this.physics = physics;
    this.progress = progress;
    this.structures = [];
    this.roadSamples = [];
    this.group = new THREE.Group();
    this.group.name = 'world';
    scene.add(this.group);
    this.occupied = []; // rects reserved by buildings/roads [x0,z0,x1,z1,kind]
  }

  async generate(opts) {
    const P = this.progress;
    this.terrain = new Terrain();
    physicsBounds(this.physics);
    this.physics.terrain = this.terrain;
    const tr = this.terrain;

    P('Shaping the land', 0.05); await tick();
    // ---- town terrace: lawns level with the town plane ----
    tr.forRect(T.town.x0 - 2, T.town.z0, T.floodwallX, T.town.z1, (i, j, x, z) => {
      const k = tr.idx(i, j);
      const inner = 1 - smoothstep(T.town.z1 - 8, T.town.z1 + 2, Math.abs(z));
      const ix = smoothstep(T.town.x0 - 2, T.town.x0 + 6, x);
      tr.h[k] = tr.h[k] + (townPlane(x) + 0.02 - tr.h[k]) * inner * ix;
    });
    // riverwalk behind the floodwall, then riprap down to the water
    tr.forRect(T.floodwallX, T.town.z0 - 10, 232, T.town.z1 + 10, (i, j, x, z) => {
      const k = tr.idx(i, j);
      const inner = 1 - smoothstep(T.town.z1 - 4, T.town.z1 + 10, Math.abs(z));
      const walkY = townPlane(T.floodwallX) - 0.6;
      let y;
      if (x <= 201) y = walkY;
      else y = walkY + (-1.2 - walkY) * smoothstep(201, 224, x);
      tr.h[k] = tr.h[k] + (y - tr.h[k]) * inner;
    });

    // ---- rural roads: profile & stamp ----
    P('Laying roads', 0.12); await tick();
    for (const road of ROADS) {
      const s = roadCentreline(tr, road);
      road.samples = s;
      this.roadSamples.push(road);
    }
    // stamp in two passes so crossings agree (paved last wins)
    for (const road of [...ROADS].sort((a, b) => (a.type === 'paved') - (b.type === 'paved'))) {
      tr.stampRoad(road.samples, road.width / 2 + (road.type === 'paved' ? 1.1 : 0), road.type === 'paved' ? 6 : 4.5, 0);
    }
    // town streets: terrain just under the asphalt
    for (const s of [...STREETS.ns, ...STREETS.ew]) {
      tr.forRect(s.x0 - 0.5, s.z0 - 0.5, s.x1 + 0.5, s.z1 + 0.5, (i, j, x) => { tr.h[tr.idx(i, j)] = townPlane(x) - 0.08; });
    }

    // ---- structures ----
    P('Raising buildings', 0.25); await tick();
    this.placeTown();
    this.placeFarms();

    // ---- build meshes ----
    P('Building terrain', 0.45); await tick();
    const splat = makeSplatFn(this);
    tr.build(terrainMaterial(opts.texSize), splat, { farStep: 4 });
    this.group.add(tr.group);

    P('Paving streets', 0.55); await tick();
    const rb = new GeoBuilder();
    for (const road of ROADS) buildRoadRibbon(rb, road.samples, road);
    const town = new GeoBuilder();
    this.walk = [];
    buildTownStreets(town, STREETS, { x0: 60, z0: -136, x1: 192, z1: 136 }, { walk: this.walk });
    buildTownMarkings(town, STREETS);
    for (const b of [rb, town]) this.addStatic(b, { receive: true, cast: false });
    for (const w of this.walk) this.physics.add({ ...w, kind: 'walk' }, 'streets');

    P('Furnishing', 0.65); await tick();
    this.doors = [];
    for (const S of this.structures) this.attach(S);

    P('Growing trees', 0.78); await tick();
    this.placeVegetation(opts.quality);
  }

  // (Re)build a structure and register its collision & doors.
  attach(S) {
    if (S.group.parent) this.detach(S);
    S.rebuild((x, z) => this.terrain.height(x, z));
    this.group.add(S.group);
    for (const b of S.boxes) this.physics.add(b, S);
    for (const d of S.doors) {
      d.colBox = this.physics.add(d.collider(), d);
      this.doors.push(d);
    }
  }
  detach(S) {
    this.physics.removeOwner(S);
    for (const d of S.doors) { this.physics.removeOwner(d); if (d.colBox) this.physics.remove(d.colBox); }
    this.doors = this.doors.filter((d) => d.structure !== S);
    if (S.group.parent) S.group.parent.remove(S.group);
  }
  toggleDoor(d) {
    d.toggle();
    this.physics.remove(d.colBox);
    d.colBox = this.physics.add(d.collider(), d);
  }

  inField(x, z, m = 0) {
    for (const f of FIELDS) if (x > f.x0 - m && x < f.x1 + m && z > f.z0 - m && z < f.z1 + m) return f;
    return null;
  }
  inOccupied(x, z, m = 0) {
    for (const o of this.occupied) if (x > o[0] - m && x < o[2] + m && z > o[1] - m && z < o[3] + m) return true;
    return false;
  }
  inTownGrid(x, z) {
    return x > T.town.x0 - 2 && x < T.floodwallX + 1 && Math.abs(z) < T.town.z1 + 1;
  }
  onStreet(x, z, m = 0) {
    for (const st of STREETS.ns) if (x > st.x0 - st.walk - m && x < st.x1 + st.walk + m && z > st.z0 - m && z < st.z1 + m) return true;
    for (const st of STREETS.ew) if (z > st.z0 - st.walk - m && z < st.z1 + st.walk + m && x > st.x0 - m && x < st.x1 + m) return true;
    return false;
  }
  // can a tree / clump stand here?
  clearFor(x, z, roadM = 4, occM = 3) {
    const p = T.play;
    const h = this.terrain.height(x, z);
    if (h < T.water + 0.9) return false;
    if (this.roadDist && this.roadDist(x, z) < roadM) return false;
    if (this.inOccupied(x, z, occM)) return false;
    if (this.onStreet(x, z, 1.5)) return false;
    if (x > T.floodwallX - 4 && x < 205 && Math.abs(z) < T.town.z1 + 4) return false;
    void p;
    return true;
  }

  placeVegetation(quality) {
    const tr = this.terrain;
    const rng = mulberry32(777);
    const trees = this.trees = new Trees(this.scene, quality);
    const H = (x, z) => tr.height(x, z) - 0.15;
    const broad = [TREE.OAK, TREE.OAK2, TREE.MAPLE, TREE.OAK, TREE.MAPLE_FALL, TREE.OAK_FALL, TREE.MAPLE, TREE.MAPLE_RED];
    const plant = (x, z, kinds, sMin = 0.8, sMax = 1.2) => {
      if (!this.clearFor(x, z)) return false;
      if (this.inField(x, z, 1)) return false;
      const k = kinds[Math.floor(rng() * kinds.length)];
      trees.add(x, H(x, z), z, k, sMin + rng() * (sMax - sMin), rng);
      this.physics.add({ min: [x - 0.35, H(x, z), z - 0.35], max: [x + 0.35, H(x, z) + 4, z + 0.35], kind: 'tree', noGround: true }, 'trees');
      return true;
    };
    // woods
    for (const w of WOODS) {
      const n = Math.round((Math.PI * w.r * w.r) / 38);
      for (let i = 0; i < n; i++) {
        const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * w.r;
        const x = w.x + Math.cos(a) * r, z = w.z + Math.sin(a) * r;
        plant(x, z, rng() < 0.2 ? [TREE.CEDAR, TREE.CEDAR2, TREE.SHRUB] : broad, 0.85, 1.3);
      }
    }
    // fence-row tree lines along field edges
    for (const f of FIELDS) {
      const edges = [[f.x0, f.z0 - 4, f.x1, f.z0 - 4], [f.x0, f.z1 + 4, f.x1, f.z1 + 4], [f.x0 - 4, f.z0, f.x0 - 4, f.z1], [f.x1 + 4, f.z0, f.x1 + 4, f.z1]];
      for (const [ax, az, bx, bz] of edges) {
        if (rng() < 0.45) continue;
        const L = Math.hypot(bx - ax, bz - az);
        let t = rng() * 10;
        while (t < L) {
          if (rng() < 0.8) plant(ax + (bx - ax) * (t / L) + (rng() - 0.5) * 2, az + (bz - az) * (t / L) + (rng() - 0.5) * 2, rng() < 0.35 ? [TREE.CEDAR, TREE.CEDAR2] : [TREE.OAK, TREE.MAPLE, TREE.SHRUB, TREE.OAK_FALL], 0.7, 1.1);
          t += 6 + rng() * 9;
        }
      }
    }
    // farm windbreaks & yard trees
    for (const farm of FARMS) {
      const [x0, z0, x1, z1] = farm.yard;
      for (let x = x0; x < x1; x += 5 + rng() * 2) plant(x, z0 - 6 + rng(), [TREE.CEDAR, TREE.CEDAR2], 0.9, 1.15);
      for (let z = z0; z < z1; z += 5 + rng() * 2) plant(x0 - 6 + rng(), z, [TREE.CEDAR, TREE.CEDAR2], 0.9, 1.15);
      for (let i = 0; i < 6; i++) plant(x0 + rng() * (x1 - x0), z0 + rng() * (z1 - z0), [TREE.OAK, TREE.MAPLE, TREE.COTTON], 0.9, 1.25);
    }
    // town: street trees on residential parkways & yard trees
    for (const st of STREETS.ew) {
      if (st.name === 'Main St') continue;
      for (let x = st.x0 + 6; x < st.x1 - 6; x += 11 + rng() * 4) {
        for (const z of [st.z0 - st.walk - 2.5, st.z1 + st.walk + 2.5]) plant(x, z, [TREE.MAPLE, TREE.OAK, TREE.MAPLE_FALL], 0.8, 1.05);
      }
    }
    for (let i = 0; i < 140; i++) {
      const x = T.town.x0 + rng() * (T.floodwallX - T.town.x0 - 10), z = T.town.z0 + rng() * (T.town.z1 - T.town.z0);
      if (Math.abs(z) < 64 && x > 90) continue; // downtown stays paved
      plant(x, z, [TREE.MAPLE, TREE.OAK, TREE.OAK2, TREE.SHRUB, TREE.MAPLE_FALL], 0.8, 1.1);
    }
    // riverbank cottonwoods outside the floodwall
    for (let z = T.z0; z < T.z1; z += 7) {
      if (Math.abs(z) < T.town.z1 + 6) continue;
      for (let k = 0; k < 2; k++) {
        const x = 150 + rng() * 70;
        plant(x, z + rng() * 6, [TREE.COTTON, TREE.OAK, TREE.MAPLE], 0.9, 1.3);
      }
    }
    // far bank forest (scenery)
    for (let z = T.z0; z < T.z1; z += 9) {
      for (let x = riverFar(z) + 6; x < T.x1 - 10; x += 8 + rng() * 6) {
        const xx = x + rng() * 4, zz = z + rng() * 6;
        if (tr.height(xx, zz) < 1.2) continue;
        trees.add(xx, H(xx, zz), zz, broad[Math.floor(rng() * broad.length)], 0.9 + rng() * 0.5, rng);
      }
    }
    // scattered field-edge & pasture trees
    for (let i = 0; i < 260; i++) {
      const x = T.play.x0 + rng() * (60 - T.play.x0), z = T.play.z0 + rng() * (T.play.z1 - T.play.z0);
      const f = this.inField(x, z, 2);
      if (f && f.crop !== 'pasture') continue;
      plant(x, z, [TREE.OAK, TREE.OAK2, TREE.COTTON, TREE.SHRUB, TREE.CEDAR, TREE.OAK_FALL], 0.8, 1.3);
    }
    // scenery ring beyond the play area (west, north, south)
    for (let i = 0; i < 900; i++) {
      const x = T.x0 + rng() * (T.x1 - T.x0), z = T.z0 + rng() * (T.z1 - T.z0);
      const inside = x > T.play.x0 - 10 && x < T.play.x1 + 10 && z > T.play.z0 - 10 && z < T.play.z1 + 10;
      if (inside || tr.height(x, z) < 1.5) continue;
      trees.add(x, H(x, z), z, broad[Math.floor(rng() * broad.length)], 0.9 + rng() * 0.4, rng);
    }
    trees.build();

    // crops
    buildCrops(this.scene, FIELDS, tr, quality);

    // pampas & tall grass clumps along road ditches and field margins
    const clumps = [];
    for (const r of this.roadSamples) {
      for (let i = 0; i < r.samples.length; i += 2) {
        if (rng() > 0.22) continue;
        const p = r.samples[i];
        const side = rng() < 0.5 ? -1 : 1;
        const off = r.width / 2 + 3.2 + rng() * 2.5;
        const x = p.x + (p.nx || 0) * off * side, z = p.z + (p.nz || 0) * off * side;
        if (!this.clearFor(x, z, 2.8, 2) || this.inTownGrid(x, z)) continue;
        clumps.push({ x, y: tr.height(x, z), z, r: rng() * 6.28, s: 0.7 + rng() * 0.6 });
      }
    }
    buildClumps(this.scene, clumps);

    // grass tufts near the camera
    const fieldOf = (x, z) => this.inField(x, z, 0);
    this.grass = new GrassField(this.scene, quality, (x, z, r) => {
      const h = tr.height(x, z);
      if (h < T.water + 0.8) return -1;
      if (this.roadDist(x, z) < 1.4) return -1;
      if (this.inTownGrid(x, z) && Math.abs(z) < T.town.z1 - 6) return r < 0.04 ? 0 : -1; // mown lawns
      const f = fieldOf(x, z);
      if (f && (f.crop === 'corn' || f.crop === 'beans')) return -1;
      if (this.inOccupied(x, z, 0.5)) return -1;
      const dry = noise(x / 60, z / 60) * 0.5 + 0.5 > 0.62 || (f && f.crop === 'hay');
      return dry ? 1 : 0;
    }, (x, z) => tr.height(x, z));
  }

  update(dt, camPos) {
    if (this.trees) this.trees.update(camPos);
    if (this.grass) this.grass.update(camPos);
  }

  // Merge a GeoBuilder into static meshes
  addStatic(builder, { receive = true, cast = true } = {}) {
    for (const [key, geo] of builder.build()) {
      const m = new THREE.Mesh(geo, key === 'glass' ? null : buildingMaterial());
      m.receiveShadow = receive; m.castShadow = cast;
      m.matrixAutoUpdate = false;
      this.group.add(m);
    }
  }

  // Place a structure so its local cell (0,0) lands at world (x,z); floor at y.
  place(S, x, z, y) {
    S.ox = x; S.oz = z; S.oy = y;
    const b = S.bounds();
    // reserve and level the ground under its footprint
    const fp = S.footprintCells();
    for (const k of fp) {
      const [cx, cz] = k.split(',').map(Number);
      const x0 = x + cx * CELL, z0 = z + cz * CELL;
      this.terrain.clampBelow(x0, z0, x0 + CELL, z0 + CELL, y - 0.12);
    }
    this.occupied.push([b.wx0 - 1, b.wz0 - 1, b.wx1 + 1, b.wz1 + 1, 'building']);
    this.structures.push(S);
    return S;
  }

  placeTown() {
    for (const lot of TOWN_LOTS) {
      if (lot.type === 'house') {
        const fn = PLANS[lot.plan] || PLANS.foursquare;
        const S = fn({ name: lot.plan + '@' + lot.at.join(','), ext: lot.ext, roof: lot.roof, seed: lot.at[0] * 7 + lot.at[1] });
        rotateStructure(S, lot.rot || 0);
        const b = S.bounds();
        const cx = lot.at[0] + (b.x1 - b.x0) * CELL / 2;
        const y = townPlane(cx) + 0.55;
        // pad
        this.terrain.flattenRect(lot.at[0] - 2, lot.at[1] - 2, lot.at[0] + (b.x1 - b.x0) * CELL + 2, lot.at[1] + (b.z1 - b.z0) * CELL + 2, y - 0.5, 4);
        this.place(S, lot.at[0], lot.at[1], y);
        S.kind = 'house';
      }
    }
  }

  placeFarms() {
    for (const farm of FARMS) {
      const h = farm.house;
      const fn = PLANS[h.plan] || PLANS.foursquare;
      const S = fn({ name: farm.name, ext: h.ext, roof: h.roof, seed: farm.name.length });
      rotateStructure(S, h.rot || 0);
      const b = S.bounds();
      const w = (b.x1 - b.x0) * CELL, d = (b.z1 - b.z0) * CELL;
      const x0 = h.at[0], z0 = h.at[1];
      const ground = avgHeight(this.terrain, x0, z0, x0 + w, z0 + d);
      const y = ground + 0.55;
      this.terrain.flattenRect(x0 - 3, z0 - 3, x0 + w + 3, z0 + d + 3, y - 0.5, 10);
      this.place(S, x0, z0, y);
    }
  }
}

function avgHeight(tr, x0, z0, x1, z1) {
  let s = 0, n = 0;
  for (let x = x0; x <= x1; x += 2) for (let z = z0; z <= z1; z += 2) { s += tr.height(x, z); n++; }
  return s / n;
}

function physicsBounds(ph) {
  ph.bounds = { ...T.play };
}

export function tick() { return new Promise((r) => setTimeout(r, 0)); }

// Ground cover weights [grass, dry, dirt, gravel] (sand = remainder)
function makeSplatFn(world) {
  // distance-to-road raster (2 m), filled from road samples
  const R = 2, W = Math.ceil((T.x1 - T.x0) / R) + 1, H = Math.ceil((T.z1 - T.z0) / R) + 1;
  const dist = new Float32Array(W * H).fill(99);
  const halfW = new Float32Array(W * H).fill(0);
  for (const r of world.roadSamples) {
    const reach = r.width / 2 + 5;
    for (const p of r.samples) {
      const i0 = Math.floor((p.x - reach - T.x0) / R), i1 = Math.ceil((p.x + reach - T.x0) / R);
      const j0 = Math.floor((p.z - reach - T.z0) / R), j1 = Math.ceil((p.z + reach - T.z0) / R);
      for (let j = Math.max(0, j0); j <= Math.min(H - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(W - 1, i1); i++) {
        const d = Math.hypot(T.x0 + i * R - p.x, T.z0 + j * R - p.z) - r.width / 2;
        const k = j * W + i;
        if (d < dist[k]) { dist[k] = d; halfW[k] = r.width / 2; }
      }
    }
  }
  const roadD = (x, z) => {
    const i = Math.round((x - T.x0) / R), j = Math.round((z - T.z0) / R);
    if (i < 0 || j < 0 || i >= W || j >= H) return 99;
    return dist[j * W + i];
  };
  world.roadDist = roadD;
  return (x, z, h, slope) => {
    const nv = noise(x / 60, z / 60) * 0.5 + 0.5;
    let dry = smoothstep(0.5, 0.85, nv) * 0.75 + smoothstep(0.3, 0.6, noise(x / 17, z / 17)) * 0.15;
    let dirt = smoothstep(0.22, 0.45, slope);
    for (const f of FIELDS) {
      if (x > f.x0 - 1 && x < f.x1 + 1 && z > f.z0 - 1 && z < f.z1 + 1) {
        if (f.crop === 'corn' || f.crop === 'beans') { dirt = Math.max(dirt, 0.9); }
        else if (f.crop === 'hay') { dry = Math.max(dry, 0.85); }
        else if (f.crop === 'pasture') { dry *= 0.4; }
        break;
      }
    }
    const rd = roadD(x, z);
    let gravel = 1 - smoothstep(0.6, 2.6, rd);
    // in town: mown lawns, no dry patches
    if (x > T.town.x0 && x < T.floodwallX && Math.abs(z) < T.town.z1) { dry *= 0.25; }
    if (x > T.floodwallX && x < 226 && Math.abs(z) < 140) gravel = Math.max(gravel, smoothstep(200, 204, x) * (1 - smoothstep(222, 226, x)));
    const sand = 1 - smoothstep(0.6, 2.2, h - T.water);
    const k = 1 - sand;
    const gW = gravel, dW = dirt * (1 - gravel), dryW = dry * (1 - dirt) * (1 - gravel), grW = (1 - dry) * (1 - dirt) * (1 - gravel);
    return [clamp(grW * k, 0, 1), clamp(dryW * k, 0, 1), clamp(dW * k, 0, 1), clamp(gW * k, 0, 1)];
  };
}
export { STORY };
