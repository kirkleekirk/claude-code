import * as THREE from 'three';
import { BOUNDS, CEILING, CRATER, SPAWNS, ORBS, BUILDINGS, FIRES } from './layout.js';
import { GeoBuilder } from './geo.js';
import { Terrain, HALF } from './terrain.js';
import { buildPath } from './route.js';
import { makeFacadeMaterial } from './facade.js';
import { makeSolidMaterial } from './solid.js';
import { makeGroundMaterial, makeGround } from './ground.js';
import { buildBuildings } from './buildings.js';
import { buildStation, departuresBoard } from './station.js';
import { buildElevated } from './elevated.js';
import { buildProps } from './props.js';
import { SKY, makeSky, buildSkyline, makeWater, makeSmokeColumns } from './sky.js';
import { FireField, makeShafts } from './fires.js';
import { makeTheatreSign } from './theatre.js';
import { updateFireLights } from './firelight.js';

const FOG_DENSITY = 0.0017;
// smoke rising from fires elsewhere in the city: [x, z, width, height]
const SMOKE_COLUMNS = [[-420, -380, 90, 520], [260, -520, 120, 600], [620, 240, 110, 480], [-300, 520, 80, 420], [40, -1100, 160, 700], [900, -150, 100, 520], [-850, -60, 130, 560]];

/**
 * Destroyed Chicago, the payload map. Builds everything under one root (hidden until activated),
 * the obstacle list for the world's collision, and the map config for useMap().
 */
export class ChicagoMap {
  constructor(scene, renderer) {
    this.scene = scene;
    const root = this.root = new THREE.Group();
    root.name = 'chicago';
    root.visible = false;
    scene.add(root);
    // the crater, its road graded along the cart's way from B to the end
    this.path = buildPath();
    const road = this.path.pts.slice(this.path.bIndex);
    this.road = road;
    const terrain = this.terrain = new Terrain(road);
    const ty = (x, z) => terrain.sample(x, z);
    const tn = (x, z) => { const e = 0.5; return new THREE.Vector3(ty(x - e, z) - ty(x + e, z), 2 * e, ty(x, z - e) - ty(x, z + e)).normalize(); };
    const mats = this.mats = { facade: makeFacadeMaterial(), solid: makeSolidMaterial(), ground: makeGroundMaterial() };
    // walls are single-sided: cast shadows from both faces, or light leaks through any hole in a
    // building's far wall (three.js renders only back faces into the shadow map by default)
    mats.facade.shadowSide = mats.solid.shadowSide = THREE.DoubleSide;
    const boxes = [];
    const add = (geo, mat, { cast = true, receive = true, name = '' } = {}) => {
      const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = receive; m.name = name; root.add(m); return m;
    };
    // buildings, one mesh each so they cull
    for (const b of BUILDINGS) {
      const { geometry, boxes: bb } = buildBuildings([b]);
      add(geometry, mats.facade, { name: 'bld-' + b.id });
      boxes.push(...bb);
    }
    // the station, the L, the props
    const gbF = new GeoBuilder({ fac: true }), gbS = new GeoBuilder({ fac: true, col: true }), gbG = new GeoBuilder({ fac: true, col: true });
    const extra = {};
    buildStation(gbF, gbS, gbG, boxes, extra, ty);
    add(gbF.build(), mats.facade, { name: 'station-walls' });
    add(gbS.build(), mats.solid, { name: 'station' });
    add(gbG.build(), mats.solid, { cast: false, name: 'station-glass' });
    const gbL = new GeoBuilder({ fac: true, col: true });
    buildElevated(gbL, boxes);
    add(gbL.build(), mats.solid, { name: 'elevated' });
    const gbP = new GeoBuilder({ fac: true, col: true });
    buildProps(gbP, boxes, ty, tn, road);
    add(gbP.build(), mats.solid, { name: 'props' });
    root.add(departuresBoard());
    const signB = BUILDINGS.find((b) => b.sign);
    if (signB) { const s = makeTheatreSign(signB.sign); root.add(s.group); boxes.push(...s.boxes); }
    // ground, sky, the far city
    root.add(makeGround(mats.ground, terrain));
    this.sky = makeSky(); root.add(this.sky);
    add(buildSkyline(), mats.facade, { cast: false, receive: false, name: 'skyline' });
    root.add(makeWater());
    this.smokeCols = makeSmokeColumns(SMOKE_COLUMNS, FOG_DENSITY); root.add(this.smokeCols);
    this.shafts = makeShafts(extra.shafts || [], SKY.sunDir); root.add(this.shafts);
    this.fires = new FireField(root, FIRES, ty);
    // lights
    this.sunDir = SKY.sunDir.clone();
    // (sky light is diffuse only, so it lifts the faces turned from the sun without putting a
    // highlight in every pane of glass)
    this.hemi = new THREE.HemisphereLight(0xcfd0cf, 0x8a7560, 1.35);
    this.sun = new THREE.DirectionalLight(0xffe4c0, 3.0);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = -105; sc.right = 105; sc.top = 105; sc.bottom = -105; sc.near = 10; sc.far = 900;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.06;
    root.add(this.hemi, this.sun, this.sun.target);
    this.setShadowRes(renderer ? renderer.q.shadow : 2048);
    this.fog = new THREE.FogExp2(SKY.haze.getHex(), FOG_DENSITY);
    if (renderer) {
      const pm = new THREE.PMREMGenerator(renderer.r);
      const envScene = new THREE.Scene();
      const s = makeSky(100); s.material.depthTest = false; s.material.uniforms.uSunDisc.value = 0;
      envScene.add(s);
      const gnd = new THREE.Mesh(new THREE.CircleGeometry(90, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x4a4540 }));
      gnd.position.y = -3; envScene.add(gnd);
      this.envRT = pm.fromScene(envScene, 0.04);
      pm.dispose();
    }
    // collision
    this.obstacles = boxes.filter((b) => b[3] - b[0] > 0.01 && b[4] - b[1] > 0.01 && b[5] - b[2] > 0.01)
      .map((b) => ({ type: 'box', min: new THREE.Vector3(b[0], b[1], b[2]), max: new THREE.Vector3(b[3], b[4], b[5]) }));
    const sp = (s) => new THREE.Vector3(s.at[0], 0, s.at[1]);
    this.config = {
      name: 'chicago',
      rect: BOUNDS,
      ceiling: CEILING,
      plazaR: 60,
      terrain: ty,
      terrainMax: terrain.max,
      terrainRegions: [{ x: CRATER.x, z: CRATER.z, r: HALF - 2 }],
      spawns: [sp(SPAWNS.attack[0]), sp(SPAWNS.defend[0])],
      spawnSpread: SPAWNS.attack[0].spread,
      orbs: ORBS,
    };
  }
  /** show or hide the city; when shown it owns the scene's fog and reflections */
  activate(on) {
    this.root.visible = on;
    if (!on) return;
    const s = this.scene;
    s.background = null;
    s.fog = this.fog;
    s.environment = this.envRT ? this.envRT.texture : null;
    s.environmentIntensity = 0.55;
  }
  setShadowRes(n) {
    this.sun.shadow.mapSize.set(n, n);
    if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
  }
  update(dt, time, focus, cam) {
    for (const m of Object.values(this.mats)) if (m.userData.U) m.userData.U.uTime.value = time;
    this.sky.material.uniforms.uTime.value = time;
    for (const c of this.smokeCols.children) c.material.uniforms.uTime.value = time;
    for (const c of this.shafts.children) c.material.uniforms.uTime.value = time;
    if (cam) { updateFireLights(FIRES, cam, time); this.fires.update(dt, cam); }
    // the shadow box follows the action, a little ahead of the camera
    const f = focus || new THREE.Vector3();
    const snap = 4;
    let fx = f.x, fz = f.z;
    if (cam) { const d = new THREE.Vector3(); cam.getWorldDirection(d); fx += d.x * 35; fz += d.z * 35; }
    fx = Math.round(fx / snap) * snap; fz = Math.round(fz / snap) * snap;
    this.sun.target.position.set(fx, 0, fz);
    this.sun.position.copy(this.sun.target.position).addScaledVector(this.sunDir, 420);
  }
}
