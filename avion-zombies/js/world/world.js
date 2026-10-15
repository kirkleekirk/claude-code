import * as THREE from '../../vendor/three.module.min.js';
import { buildTextures, makeSign } from './textures.js';
import { buildMaterials, std } from './materials.js';
import { Terrain } from './terrain.js';
import { Sky } from './sky.js';
import { Builder, boxGeometry } from './builder.js';
import { buildVegetation } from './vegetation.js';
import { fogGLSL } from './fog.js';
import { PhysicsWorld } from '../engine/physics.js';
import { NavGrid } from '../engine/nav.js';
import { CaveField, WalkField } from './cave.js';
import { caveRockMaterial } from './cavemat.js';
import { LightVolume, caveUniforms, unbindCaveLight } from './cavelight.js';
import { rand, clamp, makeRng } from '../util.js';
import { audio } from '../engine/audio.js';

// Procedural textures and the materials built on them are the same for every map,
// so they are made once and reused when the player switches maps.
let SHARED = null;
export function sharedAssets() {
  if (!SHARED) {
    const textures = buildTextures();
    const materials = buildMaterials(textures);
    for (const t of Object.values(textures)) if (t && t.isTexture) t.userData.shared = true;
    for (const m of Object.values(materials)) {
      m.userData.shared = true;
      for (const k of ['map', 'normalMap']) if (m[k]) m[k].userData.shared = true;
    }
    SHARED = { textures, materials };
  }
  return SHARED;
}

// --- Static additive glow billboards (lamp halos, beacons) -------------------------------
const glowVert = /* glsl */ `
attribute vec3 iPos;
attribute vec4 iColor;
varying vec2 vUv;
varying vec4 vColor;
varying vec3 vViewPos;
void main() {
  vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
  mv.xy += position.xy * iColor.a;
  vViewPos = mv.xyz;
  vUv = position.xy + 0.5;
  vColor = iColor;
  gl_Position = projectionMatrix * mv;
}
`;
const glowFrag = /* glsl */ `
uniform sampler2D uTex;
varying vec2 vUv;
varying vec4 vColor;
varying vec3 vViewPos;
${fogGLSL.pars}
${fogGLSL.func}
void main() {
  // halos read as atmosphere at a distance; up close they fade so lamps don't white out the view
  float near = smoothstep(2.0, 14.0, length(vViewPos));
  float a = texture2D(uTex, vUv).a * (0.15 + 0.85 * near);
  vec3 fc;
  float f = worldFog(vViewPos, fc);
  gl_FragColor = vec4(vColor.rgb * a * 0.55 * (1.0 - f * 0.85), a);
}
`;

class GlowSet {
  constructor(list, texture, scene) {
    this.list = list;
    const N = Math.max(1, list.length);
    const geo = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    geo.index = quad.index;
    geo.setAttribute('position', quad.attributes.position);
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
    this.aColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4).setUsage(THREE.DynamicDrawUsage);
    list.forEach((g, i) => this.aPos.setXYZ(i, g.x, g.y, g.z));
    geo.setAttribute('iPos', this.aPos);
    geo.setAttribute('iColor', this.aColor);
    geo.instanceCount = list.length;
    const mat = new THREE.ShaderMaterial({
      vertexShader: glowVert, fragmentShader: glowFrag, transparent: true, depthWrite: false, fog: true,
      uniforms: { uTex: { value: texture }, ...fogGLSL.uniforms() },
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 25;
    scene.add(this.mesh);
    this.c = new THREE.Color();
  }
  set(i, color, intensity, size) {
    this.aColor.setXYZW(i, color.r * intensity, color.g * intensity, color.b * intensity, size);
    this.aColor.needsUpdate = true;
  }
}

// --- Fake volumetric floodlight beams -----------------------------------------------------
const beamVert = /* glsl */ `
varying float vT;
varying vec3 vNormalV;
varying vec3 vViewPos;
void main() {
  vT = -position.y;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vViewPos = mv.xyz;
  vNormalV = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * mv;
}
`;
const beamFrag = /* glsl */ `
uniform vec3 uColor;
uniform float uIntensity;
uniform float uTime;
varying float vT;
varying vec3 vNormalV;
varying vec3 vViewPos;
void main() {
  float fres = abs(dot(normalize(vNormalV), normalize(-vViewPos)));
  float along = clamp(vT, 0.0, 1.0);
  float a = pow(fres, 2.2) * (1.0 - along) * (1.0 - along) * smoothstep(0.0, 0.08, along);
  a *= 0.85 + 0.15 * sin(uTime * 0.7 + vT * 9.0);
  gl_FragColor = vec4(uColor * a * uIntensity, a);
}
`;

const DOOR_TIME = { gate: 1.3, blast: 1.5, debris: 1.6, swing: 1.4 };

// A lumpy boulder for rockfalls.
function boulderGeometry(r, seed) {
  const g = new THREE.IcosahedronGeometry(r, 1);
  const p = g.attributes.position;
  const rng = makeRng(seed);
  const bumps = [];
  for (let k = 0; k < 6; k++) bumps.push([rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1, 0.12 + rng() * 0.2]);
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = v.clone().normalize();
    let k = 1;
    for (const [bx, by, bz, a] of bumps) k += a * Math.max(0, n.x * bx + n.y * by + n.z * bz) ** 2 - a * 0.3;
    v.multiplyScalar(k);
    v.y *= 0.72;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  // the cave rock material wants colour + wetness per vertex
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const s = 0.85 + rng() * 0.2;
    col[i * 3] = 0.5 * s;
    col[i * 3 + 1] = 0.45 * s;
    col[i * 3 + 2] = 0.39 * s;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aWet', new THREE.BufferAttribute(new Float32Array(p.count).fill(0.15), 1));
  return g;
}

export class World {
  constructor(scene, quality, map) {
    this.scene = scene;
    this.quality = quality;
    this.map = map;
    // everything this map adds to the scene lives under one group, so switching maps is one removal
    this.root = new THREE.Group();
    this.root.name = 'world:' + map.INFO.id;
    scene.add(this.root);
    this.time = 0;
    // power circuits: Rainshadow has one main switch; other maps can split power by area
    this.mainCircuit = map.MAIN_CIRCUIT || 'main';
    this.circuits = {};
    for (const c of map.CIRCUITS || [{ id: 'main' }]) this.circuits[c.id] = { ...c, on: false, k: 0 };
    this.doors = [];
  }

  get power() {
    return this.powered(this.mainCircuit);
  }

  powered(id) {
    const c = this.circuits[id || this.mainCircuit];
    return !!(c && c.on);
  }

  // Build everything; reports progress (0..1) through onProgress.
  async build(onProgress = () => {}) {
    const step = async (p) => {
      onProgress(p);
      await new Promise((r) => setTimeout(r, 0));
    };
    const MAP = this.map;
    const root = this.root;
    const { textures, materials } = sharedAssets();
    this.textures = textures;
    this.materials = materials;
    await step(0.1);
    this.terrain = new Terrain({
      ...MAP.TERRAIN,
      heightFn: MAP.heightFn, colorFn: MAP.terrainColor, walkFn: MAP.walkFn, holeFn: MAP.terrainHole,
    });
    this.terrainMesh = this.terrain.buildMesh(this.textures);
    root.add(this.terrainMesh);
    await step(0.25);
    this.physics = new PhysicsWorld(this.terrain);
    this.sky = new Sky(this.scene, root, MAP.SKY);
    if (MAP.CAVE) await this._buildCave((p) => step(0.25 + p * 0.2));
    this.builder = new Builder(root, this.physics, this.materials);
    const built = MAP.build(this.builder, { terrain: this.terrain, textures: this.textures, materials: this.materials, world: this });
    this.fxPoints = { fires: [], smoke: [], sparks: [], beacons: [], cryo: [], screens: [], ...built.fx };
    this._buildDoors();
    this.builder.finalize();
    this.surfaceGroup = this.builder.regionGroups.surface || null;
    this.caveGroup = this.builder.regionGroups.cave || null;
    await step(0.45);
    if (MAP.VEGETATION !== false) {
      const density = { trees: this.quality.trees, ferns: this.quality.ferns, msaa: this.quality.msaa };
      this.vegetation = buildVegetation({
        scene: root, terrain: this.terrain, physics: this.physics, materials: this.materials, density,
        map: {
          inPlayable: MAP.inPlayable, treeClearance: MAP.treeClearance, meadowMask: MAP.meadowMask, fernAllowed: MAP.fernAllowed,
          rocks: MAP.ROCKS, logs: MAP.LOGS, extraTrees: MAP.EXTRA_TREES, config: MAP.VEGETATION || {}, surfaceHeight: MAP.surfaceHeight,
        },
      });
    }
    await step(0.7);
    this.nav = new NavGrid({ ...MAP.BOUNDS, cell: 0.5 });
    this.nav.build(this.physics, this.terrain, MAP.zoneAt);
    await step(0.8);
    if (MAP.LIGHTING) await this._bakeLight((p) => step(0.8 + p * 0.12));
    this._buildFx();
    this._buildLights();
    await step(1);
  }

  // ---- caves -----------------------------------------------------------------------------------
  async _buildCave(progress) {
    const MAP = this.map;
    const spec = typeof MAP.CAVE === 'function' ? MAP.CAVE(this) : MAP.CAVE;
    const cave = new CaveField(spec);
    await cave.bake((p) => progress(p * 0.3));
    this.cave = cave;
    this.terrain.cave = cave;
    this.physics.cave = cave;
    cave.buildWalk(spec.veto);
    await progress(0.4);
    // one wall-distance field for the whole map: cave walls underground, map edges outside
    this.walls = new WalkField({ ...MAP.BOUNDS, res: 0.5 }, (x, z) => (cave.inExtent(x, z) ? cave.walkableAt(x, z) : MAP.walkFn(x, z)));
    this.physics.walls = this.walls;
    // navigation uses the same edges (with room for a body)
    this.terrain.walkFn = (x, z) => this.walls.dist(x, z) > 0.3;
    const voxel = this.quality.caveVoxel || 0.5;
    const geos = await cave.mesh(voxel, spec.color, (p) => progress(0.45 + p * 0.55));
    this.caveMat = caveRockMaterial(spec.material || {});
    this.caveMeshes = [];
    for (const g of geos) {
      const m = new THREE.Mesh(g, this.caveMat);
      m.name = 'cave';
      this.root.add(m);
      this.caveMeshes.push(m);
    }
  }

  // Shadow test for the light bake: rock, open ground and (for lamps that ask) walls.
  _occluded(ax, ay, az, bx, by, bz, walls) {
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const d = Math.hypot(dx, dy, dz);
    const n = Math.ceil(d / 0.45);
    const cave = this.cave;
    for (let s = 1; s < n; s++) {
      const t = s / n;
      const x = ax + dx * t;
      const y = ay + dy * t;
      const z = az + dz * t;
      if (cave && cave.inExtent(x, z)) {
        if (cave.sdfBase(x, y, z) < -0.08) return true;
      } else if (y < this.terrain.surfaceAt(x, z) - 0.12) return true;
    }
    if (walls) {
      const hit = this.physics.raycast(ax, ay, az, dx / d, dy / d, dz / d, d - 0.25, { noTerrain: true, filter: (c) => c.opaque });
      if (hit) return true;
    }
    return false;
  }

  async _bakeLight(progress) {
    const MAP = this.map;
    const L = MAP.LIGHTING;
    const cave = this.cave;
    const terrain = this.terrain;
    const lv = new LightVolume(L.grid, {
      floorAt: (x, z) => (cave && cave.inExtent(x, z) ? terrain.heightAt(x, z) : L.floorAt ? L.floorAt(x, z, terrain.heightAt(x, z)) : terrain.heightAt(x, z)),
      // inside solid rock the "ceiling" is the mountainside above: only that counts as open air
      // (otherwise cave walls next to rock cells would read as being above their ceiling)
      ceilAt: (x, z) => {
        if (cave && cave.inExtent(x, z)) {
          return cave.distAt(x, z) > 0 ? cave.ceilAt(x, z) : Math.max(cave.ceilAt(x, z), terrain.surfaceAt(x, z) - 3);
        }
        return L.ceilAt ? L.ceilAt(x, z, terrain.heightAt(x, z)) : terrain.heightAt(x, z) + 10;
      },
      // the map is told whether a cave lies under the spot (open mountainside otherwise)
      skyAt: (x, z) => L.skyAt(x, z, !!(cave && cave.inExtent(x, z))),
      circuitAt: (x, z) => this.circuitIndex(L.circuitAt(x, z)),
      occluded: null,
      solid: (x, y, z) => (cave && cave.inExtent(x, z) ? cave.sdfBase(x, y, z) < 0 : y < terrain.surfaceAt(x, z) - 0.1),
    });
    if (cave) {
      // Cells at a chamber's edge (and in the rock just past it) have low ceilings; their walls
      // rise well above that. Give every cave cell the highest ceiling within 4.5 m, so walls and
      // vaults never count as "above the ceiling" (open sky). Only the mountainside does.
      const { nx, nz, res } = lv;
      const D = new Float32Array(nx * nz);
      const ext = new Uint8Array(nx * nz);
      for (let j = 0; j < nz; j++) {
        for (let i = 0; i < nx; i++) {
          const x = lv.minX + i * res;
          const z = lv.minZ + j * res;
          ext[j * nx + i] = cave.inExtent(x, z) ? 1 : 0;
          D[j * nx + i] = cave.distAt(x, z);
        }
      }
      const R = 3;
      const C2 = new Float32Array(lv.ceil);
      for (let j = 0; j < nz; j++) {
        for (let i = 0; i < nx; i++) {
          const o = j * nx + i;
          if (!ext[o]) continue;
          let m = lv.ceil[o];
          for (let dj = -R; dj <= R; dj++) {
            const jj = j + dj;
            if (jj < 0 || jj >= nz) continue;
            for (let di = -R; di <= R; di++) {
              const ii = i + di;
              if (ii < 0 || ii >= nx) continue;
              const q = jj * nx + ii;
              if (ext[q] && D[q] > 0 && lv.ceil[q] > m) m = lv.ceil[q];
            }
          }
          C2[o] = m;
        }
      }
      lv.ceil = C2;
    }
    for (const l of this.builder.bakedLights) {
      lv.add({ ...l });
    }
    const passable = (x, z) => (cave && cave.inExtent(x, z) ? cave.distAt(x, z) > -0.5 : true);
    if (L.waveFrom) lv.computeWave(L.waveFrom.x, L.waveFrom.z, passable);
    // how far underground each spot is, walking from the open air (for hiding the sky)
    if (cave) {
      const sources = [];
      for (let j = 0; j < lv.nz; j += 2) {
        for (let i = 0; i < lv.nx; i += 2) {
          const x = lv.minX + i * lv.res;
          const z = lv.minZ + j * lv.res;
          if (!cave.inExtent(x, z) && L.skyAt(x, z, false)[0] > 0.9) sources.push([x, z]);
        }
      }
      lv.depth = lv.geodesic(sources, passable);
    }
    // shadow test per light: lamps marked `occlude` also check walls and roofs
    lv.fns.occluded = (ax, ay, az, bx, by, bz, light) => this._occluded(ax, ay, az, bx, by, bz, light.occlude);
    await lv.bake((p) => progress(p));
    lv.bind();
    this.lightVol = lv;
    caveUniforms.uCaveFog.value.set(L.fog ?? 0x050607);
    caveUniforms.uCaveFogDensity.value = L.fogDensity ?? 0.03;
    caveUniforms.uCaveFogGlow.value = L.fogGlow ?? 0.03;
    if (L.ambient !== undefined) caveUniforms.uCaveAmbient.value.set(L.ambient);
    this.powerFront = 0;
  }

  // Baked light reaching (x,y,z) right now (circuit power and the reactor wave applied).
  lightAt(x, y, z, out) {
    const lv = this.lightVol;
    const L = this.map.LIGHTING;
    return lv.sample(x, y, z, this.powerAt(L.circuitAt(x, z), x, z), out);
  }

  // How far (m) you'd walk from here to open sky: 0 outdoors.
  depthAt(x, z) {
    const lv = this.lightVol;
    return lv && lv.depth ? lv.gridAt(lv.depth, x, z) : 0;
  }

  // circuit id -> shader slot (the main/reactor circuit is slot 0)
  circuitIndex(id) {
    if (id === null || id === undefined) return 7;
    const c = this.circuits[id];
    return c ? c.index ?? 0 : 7;
  }

  // 0..1 power of a lamp at (x,z) on a circuit, following the reactor wave (CPU side, for halos)
  powerAt(circuit, x, z) {
    const c = this.circuits[circuit];
    if (!c) return 1;
    let k = c.k;
    if ((c.index ?? 0) === 0 && this.lightVol && this.lightVol.waveDist) {
      const lv = this.lightVol;
      const i = clamp(Math.round((x - lv.minX) / lv.res), 0, lv.nx - 1);
      const j = clamp(Math.round((z - lv.minZ) / lv.res), 0, lv.nz - 1);
      k *= clamp((this.powerFront - lv.waveDist[j * lv.nx + i]) / 9, 0, 1);
    }
    return k;
  }

  // Remove this map from the scene and free its GPU buffers (shared materials stay).
  dispose() {
    this.scene.remove(this.root);
    const sharedMats = new Set(Object.values(this.materials));
    const sharedTex = new Set(Object.values(this.textures));
    const seen = new Set();
    this.root.traverse((o) => {
      if (o.geometry && !seen.has(o.geometry)) {
        seen.add(o.geometry);
        o.geometry.dispose();
      }
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) {
        if (sharedMats.has(m) || seen.has(m)) continue;
        seen.add(m);
        for (const k of ['map', 'normalMap', 'emissiveMap', 'roughnessMap', 'alphaMap', 'aoMap']) {
          const t = m[k];
          if (t && !sharedTex.has(t) && !seen.has(t)) {
            seen.add(t);
            t.dispose();
          }
        }
        m.dispose();
      }
    });
    if (this.sky.sun.shadow.map) this.sky.sun.shadow.map.dispose();
    if (this.ledTex) this.ledTex.dispose();
    if (this.lightVol) this.lightVol.dispose();
    unbindCaveLight();
  }

  // ---------------------------------------------------------------------------------------
  _buildDoors() {
    const B = this.builder;
    const M = this.materials;
    for (const d of this.map.DOORS) {
      const group = new THREE.Group();
      // doors in raised buildings give their sill height
      const y = d.floor ?? this.terrain.heightAt(d.x, d.z);
      group.position.set(d.x, y, d.z);
      group.rotation.y = d.rot;
      this.root.add(group);
      const colliders = [];
      const door = { data: d, group, colliders, open: false, t: 0, parts: [], y };
      const addCol = (w, h, dd) => {
        colliders.push(this.physics.addBox({
          x: d.x, y: y - 0.3, z: d.z, w, h: h + 0.3, d: dd, rot: d.rot, walkable: false, material: d.type === 'debris' ? 'wood' : 'metal',
          door: { id: d.id }, bullets: d.type !== 'gate',
        }));
      };
      if (d.type === 'gate') {
        const frame = new THREE.Group();
        const bar = (w, h, dd, x, yy, z, mat) => {
          const m = new THREE.Mesh(boxGeometry(w, h, dd, 2), mat);
          m.position.set(x, yy, z);
          m.castShadow = true;
          frame.add(m);
        };
        bar(d.w, 0.12, 0.12, 0, d.h - 0.1, 0, M.steelDark);
        bar(d.w, 0.12, 0.12, 0, 0.15, 0, M.steelDark);
        bar(0.12, d.h, 0.12, -d.w / 2, d.h / 2, 0, M.steelDark);
        bar(0.12, d.h, 0.12, d.w / 2, d.h / 2, 0, M.steelDark);
        bar(d.w, 0.08, 0.08, 0, d.h / 2, 0, M.hazard);
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(d.w, d.h - 0.2), M.chainlink);
        mesh.position.set(0, d.h / 2, 0);
        frame.add(mesh);
        const sign = makeSign([{ text: 'RESTRICTED', size: 60 }, { text: 'AVION SECURITY', size: 34, weight: 600 }], { w: 256, h: 128 });
        const sm = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.7), std({ map: sign, roughness: 0.7, side: THREE.DoubleSide }));
        sm.position.set(0, 1.6, 0.08);
        frame.add(sm);
        group.add(frame);
        door.parts.push({ obj: frame, kind: 'slide', amount: d.w * 0.95 });
        addCol(d.w, d.h, 0.3);
      } else if (d.type === 'blast') {
        const panel = new THREE.Mesh(boxGeometry(d.w, d.h, 0.3, 2), M.steelDark);
        panel.position.set(0, d.h / 2, 0);
        panel.castShadow = true;
        const stripe = new THREE.Mesh(boxGeometry(d.w, 0.35, 0.32, 2), M.hazard);
        stripe.position.set(0, -d.h / 2 + 0.25, 0);
        panel.add(stripe);
        const emb = makeSign([{ text: 'SEALED', size: 64 }, { text: d.label.toUpperCase(), size: 30, weight: 600 }], { w: 256, h: 128 });
        for (const side of [-1, 1]) {
          const sm = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8), std({ map: emb, roughness: 0.7 }));
          sm.position.set(0, 0.3, side * 0.16);
          if (side < 0) sm.rotation.y = Math.PI;
          panel.add(sm);
        }
        group.add(panel);
        door.parts.push({ obj: panel, kind: 'lift', amount: d.h - 0.2 });
        addCol(d.w, d.h, 0.4);
      } else if (d.type === 'swing') {
        this._swingDoor(d, door, group, M);
        addCol(d.w, d.style === 'rail' ? 4.2 : d.h, 0.3);
      } else if (d.style === 'rocks') {
        // rockfall: boulders wedged across the passage
        const rng = makeRng(d.id * 71);
        for (let k = 0; k < 9; k++) {
          const r = 0.55 + rng() * 0.6;
          const m = new THREE.Mesh(boulderGeometry(r, d.id * 13 + k), this.caveMat || M.rock);
          const lx = (k / 8 - 0.5) * d.w * 0.95 + (rng() - 0.5) * 0.5;
          m.position.set(lx, r * 0.6 + (k % 3 === 1 ? 1.1 : 0) + (k % 4 === 0 ? 1.8 : 0) * (Math.abs(lx) < d.w * 0.3 ? 1 : 0), (rng() - 0.5) * 1.4);
          m.rotation.set(rng() * 3, rng() * 3, rng() * 3);
          m.castShadow = true;
          group.add(m);
          door.parts.push({ obj: m, kind: 'debris', vx: (rng() - 0.5) * 2.5, vy: 1.5 + rng() * 2, vz: (rng() - 0.5) * 4 });
        }
        addCol(d.w, d.h, 2.6);
      } else {
        const rng = makeRng(d.id * 99);
        for (let k = 0; k < 5; k++) {
          const len = d.w * (0.8 + rng() * 0.4);
          const r = 0.3 + rng() * 0.25;
          const log = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.9, r, len, 9), M.log);
          log.rotation.z = Math.PI / 2;
          log.rotation.y = (rng() - 0.5) * 0.5;
          log.position.set((rng() - 0.5) * 1.2, r + (k > 2 ? 0.9 : 0) + (k > 3 ? 0.6 : 0), (rng() - 0.5) * 1.8);
          log.castShadow = true;
          group.add(log);
          door.parts.push({ obj: log, kind: 'debris', vx: (rng() - 0.5) * 2, vy: 2 + rng() * 2, vz: (rng() - 0.5) * 4 });
        }
        addCol(d.w, d.h, 2.4);
      }
      door.style = d.style || null;
      for (const p of door.parts) {
        p.home = p.obj.position.clone();
        p.homeRot = p.obj.rotation.clone();
      }
      this.doors.push(door);
    }
  }

  // Hinged doors: two leaves (one for narrow doors) in the map's styles.
  _swingDoor(d, door, group, M) {
    const leaves = d.w > 2.2 ? 2 : 1;
    const lw = d.w / leaves;
    const mk = (side) => {
      const hinge = new THREE.Group();
      hinge.position.set(side * d.w / 2, 0, 0);
      const leaf = new THREE.Group();
      leaf.position.set(-side * lw / 2, 0, 0);
      hinge.add(leaf);
      const box = (w, h, dd, x, y, z, mat) => {
        const m = new THREE.Mesh(boxGeometry(w, h, dd, 1.5), mat);
        m.position.set(x, y, z);
        m.castShadow = true;
        leaf.add(m);
        return m;
      };
      if (d.style === 'rail') {
        // split-rail gate: posts at the edges, three rails and a brace
        for (const y of [0.35, 0.9, 1.45]) box(lw - 0.1, 0.12, 0.1, 0, y, 0, M.planks);
        box(0.12, 1.7, 0.12, -lw / 2 + 0.1, 0.85, 0, M.planks);
        box(0.12, 1.7, 0.12, lw / 2 - 0.1, 0.85, 0, M.planks);
        const br = box(Math.hypot(lw - 0.3, 1.1), 0.1, 0.08, 0, 0.9, 0.08, M.planks);
        br.rotation.z = Math.atan2(1.1, lw - 0.3) * side;
      } else if (d.style === 'steel') {
        box(lw - 0.04, d.h - 0.02, 0.06, 0, d.h / 2, 0, M.steelDark);
        box(0.6, 0.05, 0.08, -side * 0.15, 1.05, 0.06, M.steel);
        const sign = makeSign([{ text: 'STAFF ONLY', size: 64 }, { text: 'AUTHORIZED PERSONNEL', size: 28, weight: 600 }], { w: 256, h: 128, bg: '#e9e6dc', fg: '#a8241c', stripe: false });
        const sm = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.31), std({ map: sign, roughness: 0.6 }));
        sm.position.set(0, 1.6, 0.035);
        leaf.add(sm);
        const sm2 = sm.clone();
        sm2.position.z = -0.035;
        sm2.rotation.y = Math.PI;
        leaf.add(sm2);
      } else if (d.style === 'chain') {
        // chain-link gate in a tube frame, Avion's sign on the first leaf
        for (const [w, h, x, y] of [[lw - 0.08, 0.06, 0, d.h - 0.05], [lw - 0.08, 0.06, 0, 0.12], [0.06, d.h, -lw / 2 + 0.05, d.h / 2], [0.06, d.h, lw / 2 - 0.05, d.h / 2], [lw - 0.08, 0.05, 0, d.h / 2]]) {
          box(w, h, 0.06, x, y, 0, M.steelDark);
        }
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(lw - 0.12, d.h - 0.2), M.chainlink);
        mesh.position.set(0, d.h / 2, 0);
        leaf.add(mesh);
        if (side < 0) {
          const sign = makeSign([{ text: 'RESTRICTED', size: 60 }, { text: 'AVION SECURITY', size: 34, weight: 600 }], { w: 256, h: 128 });
          const sm = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.45), std({ map: sign, roughness: 0.7, side: THREE.DoubleSide }));
          sm.position.set(0, 1.45, 0.05);
          leaf.add(sm);
        }
      } else if (d.style === 'portal') {
        // heavy plank doors with iron straps
        box(lw - 0.04, d.h - 0.04, 0.16, 0, d.h / 2, 0, M.planksDark || M.planks);
        for (const y of [0.5, d.h / 2, d.h - 0.5]) box(lw - 0.2, 0.12, 0.2, 0, y, 0, M.black);
        for (const y of [0.5, d.h / 2, d.h - 0.5]) {
          for (const xx of [-lw / 2 + 0.3, lw / 2 - 0.3]) {
            const rv = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), M.black);
            rv.position.set(xx, y, 0.11);
            leaf.add(rv);
          }
        }
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.02, 6, 16), M.black);
        ring.position.set(-side * (lw / 2 - 0.35), 1.15, 0.12);
        leaf.add(ring);
      } else {
        // lodge: varnished doors, glazed top half, brass pull
        box(lw - 0.04, d.h - 0.04, 0.08, 0, d.h / 2, 0, M.planksDark || M.planks);
        box(lw - 0.36, d.h * 0.42, 0.1, 0, d.h * 0.66, 0, M.glass);
        box(0.04, 0.5, 0.06, -side * (lw / 2 - 0.16), 1.1, 0.07, M.brass || M.steel);
      }
      group.add(hinge);
      door.parts.push({ obj: hinge, kind: 'swing', amount: side * 1.75 });
    };
    if (leaves === 2) {
      mk(-1);
      mk(1);
    } else mk(-1);
  }

  openDoor(door, instant = false) {
    if (door.open) return;
    door.open = true;
    door.t = instant ? 10 : 0;
    for (const c of door.colliders) c.disabled = true;
    this.nav.openDoor(door.data.id);
    const p = new THREE.Vector3(door.data.x, door.y + 1.4, door.data.z);
    if (!instant) audio.play3D(door.data.type === 'debris' ? 'debris' : door.data.type === 'swing' ? door.data.style === 'portal' ? 'door_heavy' : 'door_swing' : 'door_open', p, { volume: 1.2, refDistance: 6 });
  }

  resetDoors() {
    for (const door of this.doors) {
      door.open = false;
      door.t = 0;
      for (const c of door.colliders) c.disabled = false;
      for (const p of door.parts) {
        p.obj.position.copy(p.home);
        p.obj.rotation.copy(p.homeRot);
        p.obj.visible = true;
        p.obj.scale.set(1, 1, 1);
      }
    }
    this.nav.resetDoors();
  }

  _updateDoors(dt) {
    for (const door of this.doors) {
      if (!door.open || door.t > DOOR_TIME[door.data.type] + 1) continue;
      door.t += dt;
      const T = DOOR_TIME[door.data.type];
      const k = clamp(door.t / T, 0, 1);
      const e = k * k * (3 - 2 * k);
      for (const p of door.parts) {
        if (p.kind === 'slide') p.obj.position.x = p.home.x + p.amount * e;
        else if (p.kind === 'lift') p.obj.position.y = p.home.y + p.amount * e;
        else if (p.kind === 'swing') p.obj.rotation.y = p.homeRot.y + p.amount * e;
        else {
          const t = door.t;
          p.obj.position.set(p.home.x + p.vx * t, p.home.y + p.vy * t - 4.9 * t * t, p.home.z + p.vz * t);
          p.obj.rotation.x = p.homeRot.x + t * p.vz;
          const s = clamp(1 - (t - 0.7) / 0.9, 0, 1);
          p.obj.scale.setScalar(Math.max(0.001, s));
          if (s <= 0) p.obj.visible = false;
        }
      }
      if (door.data.type === 'debris' && door.t < 0.9 && this.particles && Math.random() < 0.5) {
        this.particles.dust(door.data.x + rand(-3, 3), door.y + rand(0.2, 1.5), door.data.z + rand(-1, 1), 0, 1, 0, [0.4, 0.34, 0.28], 2, 2);
      }
    }
  }

  // ---------------------------------------------------------------------------------------
  _buildFx() {
    const B = this.builder;
    const glowList = B.glows.map((g) => ({ ...g, color: new THREE.Color(g.color) }));
    this.beaconStart = glowList.length;
    for (const b of this.fxPoints.beacons) {
      glowList.push({ x: b.x, y: b.y, z: b.z, size: b.big ? 5 : 2.2, color: new THREE.Color(b.color), beacon: b });
      const m = new THREE.Mesh(new THREE.SphereGeometry(b.big ? 0.35 : 0.14, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(b.color).multiplyScalar(6) }));
      m.position.set(b.x, b.y, b.z);
      this.root.add(m);
      b.mesh = m;
    }
    this.glowList = glowList;
    this.glows = new GlowSet(glowList, this.textures.glow, this.root);
    glowList.forEach((g, i) => this.glows.set(i, g.color, !g.anchor || this.anchorActive(g.anchor) ? 1.2 : 0, g.size));

    // floodlight beams
    this.beams = [];
    for (const b of B.beams) {
      const geo = new THREE.CylinderGeometry(0.25, b.radius, b.length, 24, 1, true);
      geo.translate(0, -b.length / 2, 0);
      // vT runs 0..1 down the cone
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) pos.setY(i, pos.getY(i) / b.length);
      const mat = new THREE.ShaderMaterial({
        vertexShader: beamVert, fragmentShader: beamFrag, transparent: true, depthWrite: false, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        uniforms: { uColor: { value: new THREE.Color(b.color) }, uIntensity: { value: 0 }, uTime: { value: 0 } },
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.scale.set(1, b.length, 1);
      mesh.position.set(b.x, b.y, b.z);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), b.dir);
      mesh.renderOrder = 30;
      mesh.visible = false;
      this.root.add(mesh);
      this.beams.push({ mesh, data: b });
    }

    // blinking server LEDs
    const ledCanvas = document.createElement('canvas');
    ledCanvas.width = 64;
    ledCanvas.height = 128;
    const lc = ledCanvas.getContext('2d');
    lc.fillStyle = '#05090b';
    lc.fillRect(0, 0, 64, 128);
    const rng = makeRng(8);
    for (let y = 4; y < 128; y += 8) {
      for (let x = 4; x < 64; x += 8) {
        if (rng() < 0.45) continue;
        lc.fillStyle = rng() < 0.7 ? '#3cff9a' : rng() < 0.5 ? '#ffb030' : '#3aa0ff';
        lc.fillRect(x, y, 3, 2);
      }
    }
    const ledTex = new THREE.CanvasTexture(ledCanvas);
    ledTex.colorSpace = THREE.SRGBColorSpace;
    ledTex.wrapT = THREE.RepeatWrapping;
    this.ledTex = ledTex;
    const ledMat = new THREE.MeshBasicMaterial({ map: ledTex, color: new THREE.Color(2.4, 2.4, 2.4) });
    const screenCanvas = document.createElement('canvas');
    screenCanvas.width = 256;
    screenCanvas.height = 160;
    const sc = screenCanvas.getContext('2d');
    sc.fillStyle = '#04121a';
    sc.fillRect(0, 0, 256, 160);
    sc.strokeStyle = '#46d2ff';
    sc.lineWidth = 2;
    sc.beginPath();
    for (let x = 0; x < 256; x += 4) sc.lineTo(x, 80 + Math.sin(x * 0.08) * 30 * Math.sin(x * 0.013));
    sc.stroke();
    sc.fillStyle = '#46d2ff';
    sc.font = '18px monospace';
    sc.fillText('EXO-SUBJ 0417  ▲ VITALS ERR', 8, 22);
    sc.fillText('NEURAL SYNC: 0.00%', 8, 150);
    const screenTex = new THREE.CanvasTexture(screenCanvas);
    screenTex.colorSpace = THREE.SRGBColorSpace;
    const screenMat = new THREE.MeshBasicMaterial({ map: screenTex, color: new THREE.Color(1.8, 1.8, 1.8) });
    for (const s of this.fxPoints.screens) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(s.rack ? 0.9 : 0.9, s.rack ? 1.8 : 0.55), s.rack ? ledMat : screenMat);
      m.position.set(s.x, s.y, s.z);
      m.rotation.y = s.rot;
      if (!s.rack) m.rotation.x = -0.2;
      this.root.add(m);
    }
    this.fireTimers = this.fxPoints.fires.map(() => 0);
  }

  _buildLights() {
    const n = this.quality.lights;
    this.lightPool = [];
    for (let i = 0; i < n; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 10, 2);
      l.castShadow = false;
      this.root.add(l);
      this.lightPool.push({ light: l, anchor: null });
    }
    // event lights: muzzle flash + explosions
    this.flashLight = new THREE.PointLight(0xffb070, 0, 9, 2);
    this.root.add(this.flashLight);
    this.boomLight = new THREE.PointLight(0xff8a40, 0, 22, 2);
    this.root.add(this.boomLight);
    // the Nightwarden's own glow (always in the scene so lighting never recompiles)
    this.auxLight = new THREE.PointLight(0x9a6aff, 0, 14, 2);
    this.root.add(this.auxLight);
    this.boomT = 0;
    this.lightTimer = 0;
  }

  // A lamp is lit when its circuit is (or, for emergency lamps, until it is).
  anchorActive(a) {
    if (a.circuit && this.powered(a.circuit) === !!a.emergency) return false;
    return a.intensity > 0;
  }

  setPower(on) {
    this.setCircuit(this.mainCircuit, on);
  }

  setCircuit(id, on) {
    const c = this.circuits[id];
    if (!c) return;
    c.on = on;
    c.t = 0;
    if (!on) c.k = 0;
    this.glowList.forEach((g, i) => {
      const a = g.anchor;
      if (a && a.circuit === id) this.glows.set(i, g.color, on !== !!a.emergency ? 1.4 : 0, g.size);
    });
    for (const a of this.builder.lightAnchors) {
      if (a.circuit === id) a.mat.color.copy(a.baseColor).multiplyScalar(on !== !!a.emergency ? 1 : 0.04);
    }
    for (const b of this.beams) if ((b.data.circuit || this.mainCircuit) === id) b.mesh.visible = on;
    this.lightTimer = 0;
  }

  resetPower() {
    for (const id of Object.keys(this.circuits)) this.setCircuit(id, false);
  }

  muzzleFlash(pos, strength = 1) {
    this.flashLight.position.copy(pos);
    this.flashLight.intensity = 14 * strength;
    this.flashT = 0.05;
  }

  boom(pos, strength = 1) {
    this.boomLight.position.copy(pos);
    this.boomLight.position.y += 1;
    this.boomLight.intensity = 90 * strength;
    this.boomT = 0.45;
  }

  // Circuits fade in with a stutter; the reactor's power runs out through the caves as a wave.
  _updateCircuits(dt) {
    const lv = this.lightVol;
    const levels = this._levels || (this._levels = new Float32Array(8));
    let changed = false;
    for (const c of Object.values(this.circuits)) {
      let k = 0;
      if (c.on) {
        c.t += dt;
        const idx = c.index ?? 0;
        k = idx === 0 || c.t > 1.3 ? 1 : Math.random() < 0.2 + c.t * 0.6 ? 1 : 0.12;
      }
      if (k !== c.k) changed = true;
      c.k = k;
      levels[c.index ?? 0] = k;
    }
    const main = this.circuits[this.mainCircuit];
    const front = main && main.on ? Math.min(lv.waveMax + 40, this.powerFront + dt * (this.map.LIGHTING.waveSpeed || 38)) : 0;
    if (front !== this.powerFront) changed = true;
    this.powerFront = front;
    if (changed || !this._powerInit) {
      this._powerInit = true;
      lv.updatePower(levels, front);
      // halos of baked lamps follow their circuit
      for (let i = 0; i < this.beaconStart; i++) {
        const g = this.glowList[i];
        if (!g.baked) continue;
        const k = g.circuit ? this.powerAt(g.circuit, g.x, g.z) : 1;
        if (k !== g.k) {
          g.k = k;
          this.glows.set(i, g.color, 1.2 * k, g.size);
        }
      }
    }
  }

  update(dt, camPos, playerPos) {
    this.time += dt;
    const t = this.time;
    this._updateDoors(dt);
    if (this.lightVol) this._updateCircuits(dt);
    // dynamic light pool: nearest active anchors to the player
    this.lightTimer -= dt;
    if (this.lightTimer <= 0) {
      this.lightTimer = 0.3;
      const anchors = this.builder.lightAnchors.filter((a) => this.anchorActive(a));
      anchors.sort((a, b) => ((a.x - camPos.x) ** 2 + (a.z - camPos.z) ** 2) - ((b.x - camPos.x) ** 2 + (b.z - camPos.z) ** 2));
      this.lightPool.forEach((slot, i) => {
        slot.anchor = anchors[i] || null;
        if (slot.anchor) {
          slot.light.position.set(slot.anchor.x, slot.anchor.y, slot.anchor.z);
          slot.light.color.copy(slot.anchor.color);
          slot.light.distance = slot.anchor.distance;
        }
      });
    }
    for (const slot of this.lightPool) {
      const a = slot.anchor;
      if (!a) {
        slot.light.intensity = 0;
        continue;
      }
      let k = 1;
      if (a.flicker) {
        const f = Math.sin(t * 13.1 + a.x) * Math.sin(t * 7.3 + a.z * 1.7) + Math.sin(t * 31 + a.x * 3);
        k = f > 1.2 - a.flicker ? 0.25 : 1 - a.flicker * 0.25 * Math.random();
        a.mat.color.copy(a.baseColor).multiplyScalar(k);
      }
      // lamps sit high under ceilings: give them enough punch to light the floor
      const dim = a.dimUnpowered && !this.power ? 0.6 : 1;
      slot.light.intensity = a.intensity * k * dim * 2.6;
    }
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) this.flashLight.intensity = 0;
    }
    if (this.boomT > 0) {
      this.boomT -= dt;
      this.boomLight.intensity = Math.max(0, this.boomT / 0.45) ** 2 * 90;
    }
    // beacons: rotating/blinking
    for (let i = this.beaconStart; i < this.glowList.length; i++) {
      const g = this.glowList[i];
      const b = g.beacon;
      let k;
      if (b.always) k = (Math.sin(t * 2.4) > 0.3 ? 1.6 : 0.15);
      else if (this.powered(b.circuit)) k = 0;
      else k = Math.max(0, Math.sin(t * 5 + i)) ** 3 * 1.8;
      this.glows.set(i, g.color, k, g.size);
      b.mesh.visible = k > 0.05;
    }
    // flickering lamp halos follow their anchor
    this.glowList.forEach((g, i) => {
      if (g.anchor && g.anchor.flicker && this.anchorActive(g.anchor)) {
        const k = g.anchor.mat.color.r / Math.max(0.001, g.anchor.baseColor.r);
        this.glows.set(i, g.color, 1.2 * k, g.size);
      }
    });
    for (const b of this.beams) {
      b.mesh.material.uniforms.uTime.value = t;
      b.mesh.material.uniforms.uIntensity.value = b.data.intensity;
    }
    if (this.ledTex) this.ledTex.offset.y = Math.floor(t * 3) * 0.0625;
    // fires, smoke, cryo bubbles
    if (this.particles) {
      const P = this.particles;
      this.fxPoints.fires.forEach((f, i) => {
        this.fireTimers[i] -= dt;
        while (this.fireTimers[i] <= 0) {
          this.fireTimers[i] += 0.035 / f.size;
          P.add.spawn({
            x: f.x + rand(-0.3, 0.3) * f.size, y: f.y, z: f.z + rand(-0.3, 0.3) * f.size, vx: rand(-0.2, 0.2), vy: rand(1.2, 2.4) * f.size, vz: rand(-0.2, 0.2),
            life: rand(0.4, 0.8), size: 0.35 * f.size, size1: 0.05, r: 4.2, g: 1.6, b: 0.4, a: 0.9, a1: 0, cell: 1, rotV: rand(-2, 2),
          });
          if (Math.random() < 0.15) {
            P.add.spawn({
              x: f.x, y: f.y + 0.4, z: f.z, vx: rand(-0.6, 0.6), vy: rand(1.5, 3.5), vz: rand(-0.6, 0.6), life: rand(1, 2.2), size: 0.02,
              r: 6, g: 2.4, b: 0.6, a: 1, a1: 0, drag: 0.6, cell: 0,
            });
          }
        }
      });
      if (Math.random() < dt * 6) {
        for (const s of this.fxPoints.smoke) {
          P.alpha.spawn({
            x: s.x + rand(-0.3, 0.3), y: s.y, z: s.z + rand(-0.3, 0.3), vx: rand(0.2, 0.8), vy: rand(1.0, 1.8), vz: rand(-0.3, 0.3),
            life: rand(4, 7), size: 0.6, size1: rand(3.5, 6), r: 0.1, g: 0.095, b: 0.1, a: 0.45, a1: 0, drag: 0.15, cell: 1, rotV: rand(-0.3, 0.3),
          });
        }
      }
      if (Math.random() < dt * 8) {
        const c = this.fxPoints.cryo[Math.floor(Math.random() * this.fxPoints.cryo.length)];
        if (c && (c.x - camPos.x) ** 2 + (c.z - camPos.z) ** 2 < 900) {
          P.add.spawn({ x: c.x + rand(-0.35, 0.35), y: c.y, z: c.z + rand(-0.35, 0.35), vy: rand(0.5, 1.0), life: 2.2, size: 0.03, r: 0.4, g: 2.2, b: 1.6, a: 0.8, a1: 0, cell: 0 });
        }
      }
      this._caveFx(dt, camPos);
      // ground mist + dust motes around the player (out in the open; caves have their own)
      this._mistTimer = (this._mistTimer || 0) - dt;
      const deep = playerPos && this.lightVol && this.depthAt(playerPos.x, playerPos.z) > 6;
      if (this._mistTimer <= 0 && playerPos && !deep) {
        this._mistTimer = this.quality.post ? 0.12 : 0.3;
        const a = Math.random() * Math.PI * 2;
        const r = rand(6, 38);
        const x = playerPos.x + Math.cos(a) * r;
        const z = playerPos.z + Math.sin(a) * r;
        const y = this.terrain.heightAt(x, z);
        const fc = this.scene.fog.color;
        P.alpha.spawn({
          x, y: y + rand(0.3, 1.5), z, vx: rand(0.2, 0.6), vy: 0.02, vz: rand(-0.2, 0.2), life: rand(7, 11),
          size: rand(3, 5), size1: rand(6, 9), r: fc.r * 1.1, g: fc.g * 1.1, b: fc.b * 1.15, a: 0.1, a1: 0, cell: 1, rotV: rand(-0.05, 0.05),
        });
        if (Math.random() < 0.6) {
          P.add.spawn({
            x: camPos.x + rand(-5, 5), y: camPos.y + rand(-1.5, 2.5), z: camPos.z + rand(-5, 5), vx: rand(-0.1, 0.1), vy: rand(-0.05, 0.08), vz: rand(-0.1, 0.1),
            life: rand(3, 6), size: 0.012, r: 1.2, g: 1.0, b: 0.8, a: 0.7, a1: 0, cell: 0,
          });
        }
      }
    }
  }

  // How bright an unlit particle should look at a spot: open sky plus any baked lamp light.
  _litScale(x, y, z) {
    if (!this.lightVol) return 1;
    const L = this.map.LIGHTING;
    const sky = L.skyAt(x, z, !!(this.cave && this.cave.inExtent(x, z)))[0];
    const o = this._litTmp || (this._litTmp = {});
    this.lightAt(x, y, z, o);
    const lum = o.r * 0.3 + o.g * 0.59 + o.b * 0.11;
    return Math.min(1.2, sky * 0.9 + 0.04 + lum * 0.12);
  }

  // Steam off hot pools and the magma pit, white water, embers rising from the lava, the river.
  _caveFx(dt, camPos) {
    const P = this.particles;
    const fx = this.fxPoints;
    const near = (p, r) => (p.x - camPos.x) ** 2 + (p.z - camPos.z) ** 2 < r * r;
    for (const s of fx.steam || []) {
      if (!near(s, 50) || Math.random() > dt * (s.rate || 2) * (s.big ? 3 : 1)) continue;
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * s.r;
      const x = s.x + Math.cos(a) * r;
      const z = s.z + Math.sin(a) * r;
      const k = this._litScale(x, s.y + 1, z) * 0.9;
      P.alpha.spawn({
        x, y: s.y, z, vx: rand(-0.15, 0.15), vy: rand(0.5, 1.1) * (s.big ? 2.2 : 1), vz: rand(-0.15, 0.15), life: rand(3, 5.5),
        size: s.big ? 1.2 : 0.4, size1: s.big ? rand(5, 8) : rand(1.6, 2.6), r: 0.85 * k, g: 0.88 * k, b: 0.9 * k, a: s.big ? 0.28 : 0.22, a1: 0, drag: 0.2, cell: 1, rotV: rand(-0.2, 0.2),
      });
    }
    for (const f of fx.foam || []) {
      if (!near(f, 40) || Math.random() > dt * 9) continue;
      const k = this._litScale(f.x, f.y, f.z);
      P.alpha.spawn({
        x: f.x + rand(-f.r, f.r), y: f.y + 0.05, z: f.z + rand(-f.r, f.r) * 0.6, vx: rand(0.6, 1.6), vy: rand(0.05, 0.4), vz: rand(-0.2, 0.2), life: rand(0.8, 1.6),
        size: 0.25, size1: rand(0.8, 1.4), r: 0.9 * k, g: 0.94 * k, b: 0.96 * k, a: 0.35, a1: 0, drag: 0.6, cell: 1,
      });
    }
    for (const e of fx.embers || []) {
      if (!near(e, 60) || Math.random() > dt * 5) continue;
      P.add.spawn({
        x: e.x + rand(-e.r, e.r), y: e.y, z: e.z + rand(-e.r, e.r), vx: rand(-0.3, 0.3), vy: rand(2.5, 5), vz: rand(-0.3, 0.3), life: rand(3, 6),
        size: 0.05, size1: 0.02, r: 5, g: 1.6, b: 0.4, a: 1, a1: 0, drag: 0.15, cell: 0,
      });
    }
    // flecks of foam riding the river past the player
    const rv = fx.river;
    if (rv && Math.random() < dt * 14) {
      const { pts, lvl } = rv;
      let bi = -1;
      let bd = 900;
      for (let i = 0; i < pts.length; i++) {
        const d = (pts[i][0] - camPos.x) ** 2 + (pts[i][1] - camPos.z) ** 2;
        if (d < bd) {
          bd = d;
          bi = i;
        }
      }
      if (bi >= 0) {
        const i = Math.min(pts.length - 2, Math.max(0, bi + Math.floor(rand(-6, 4))));
        const t = Math.random();
        const x = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t;
        const z = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t + rand(-1.2, 1.2);
        const y = lvl[i] + (lvl[i + 1] - lvl[i]) * t + 0.03;
        const k = this._litScale(x, y, z);
        const dx = pts[i + 1][0] - pts[i][0];
        const dz = pts[i + 1][1] - pts[i][1];
        const l = Math.hypot(dx, dz);
        P.alpha.spawn({
          x, y, z, vx: (dx / l) * 1.6, vy: ((lvl[i + 1] - lvl[i]) / l) * 1.6, vz: (dz / l) * 1.6, life: rand(2, 4),
          size: 0.12, size1: 0.22, r: 0.85 * k, g: 0.9 * k, b: 0.92 * k, a: 0.5, a1: 0, cell: 1,
        });
      }
    }
  }

  zoneAt(x, z) {
    return this.map.zoneAt(x, z) - 1;
  }
}
