// The things the avatar holds, as CastleMiner Z draws them: its own models (ripped from your copy
// of the game into local-assets/items by tools/cmz/rip_player.py; never committed), tinted by
// what they're made of, each set on the right hand's prop bone the way the original's
// InventoryItemClass.CreateEntity sets one there, with the clips that go with it.

import * as THREE from 'three';
import { loadGltfJson } from './gltf.js';
import { fileFetch } from '../../core/files.js';
import { ITEMS } from '../../items/items.js';
import { itemModel } from '../../items/models.js';
import { makePropMaterial, paint } from '../../gfx/propMaterial.js';
import { BlockItemMaterials, blockItemGeometry } from '../../gfx/blockItem.js';

const BASE = 'local-assets/items/';

// CMZColors, the original's colours for what things are made of
const MAT = { wood: 0x8b4513, stone: 0xa9a9a9, copper: 0xb87333, iron: 0x808080, gold: 0xffd700, diamond: 0x00ffff, bloodstone: 0x8b0000 };
const COAL = 0x000000, BRASS = 0xeae396, DARK_GRAY = 0xa9a9a9, WHITE = 0xffffff;
// the ores' chunks (CMZColors.IronOre, CopperOre; gold ore is just gold)
const ORES = { coal: [COAL, COAL], iron_ore: [0xb7410e, WHITE], copper_ore: [0x639283, WHITE], gold_ore: [MAT.gold, WHITE] };
// the Ammo model's bullet and its case, for each kind of round (a casing is the case alone)
const AMMO = {
  bullets: [DARK_GRAY, BRASS], bullets_iron: [0xd3d3d3, BRASS], bullets_gold: [0xffd700, MAT.iron], bullets_diamond: [0x00ffff, MAT.gold],
  bullets_bloodstone: [0x8b0000, MAT.diamond], bullets_laser: [0x32cd32, DARK_GRAY],
  casing_brass: [null, BRASS], casing_iron: [null, MAT.iron], casing_gold: [null, MAT.gold], casing_diamond: [null, MAT.diamond],
};

const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0);
const place = (q, p, s = 1) => ({ q, p: new THREE.Vector3(...p), s });
// on the prop bone: tools (and sticks and torches), small things, ore and coal, the compass, a
// block; guns and knives are made to sit in the hand as they are
const TOOL = place(new THREE.Quaternion().setFromAxisAngle(X, Math.PI / 2).multiply(new THREE.Quaternion().setFromAxisAngle(Y, Math.PI / 4)), [0, 0.111262, 0]);
const TORCH = { ...TOOL, s: 0.5 };
const SMALL = place(new THREE.Quaternion(0.481655, 0.059003, 0.870547, -0.081702), [0, 0.111925, 0], 0.5);
const ORE = place(SMALL.q, [0, 0.071925, 0], 0.35);
const COMPASS = place(new THREE.Quaternion(0.646987, 0.164309, 0.707839, -0.231028), [0, 0.093609, 0]);
const BLOCK = place(new THREE.Quaternion(-0.02068, -0.007978, 0.032576, 0.999223), [0, 0.065335, 0], 0.1);
const HAND = place(new THREE.Quaternion(), [0, 0, 0]);

// What the original holds for one of our items: its model, where it sits, which clips (see
// MODES in avatarAnim.js) and its colours (null: that part isn't drawn).
export function heldSpec(id) {
  const it = id ? ITEMS[id] : null;
  if (!it) return { mode: 'fist' };
  if (it.kind === 'tool' && it.tool === 'compass') return { model: 'compass', at: COMPASS, mode: 'generic', compass: true };
  // the clock, the locator and the teleporter sit in the hand as the compass does
  if (it.kind === 'tool' && (it.tool === 'clock' || it.tool === 'locator' || it.tool === 'teleporter')) return { model: it.tool, at: COMPASS, mode: 'generic' };
  // a laser sword is held as it is, its beam the colour of what it's made of
  if (it.kind === 'tool' && it.laser) return { model: 'saber', at: HAND, mode: 'tool', beam: it.beam };
  if (it.kind === 'tool') return { model: { pick: 'pickaxe', spade: 'spade', axe: 'axe' }[it.tool], at: TOOL, mode: 'tool', tint: MAT[it.mat] };
  if (it.kind === 'melee') return { model: 'knife', at: HAND, mode: 'tool', tint: MAT[it.mat] };
  // a rocket launcher has its rocket in the barrel (the guided one is grey)
  if (it.kind === 'gun' && it.gun === 'rocket') return { model: 'rpg', at: HAND, mode: 'rpg', gun: true, rocket: true, shade: it.guided ? 0x808080 : WHITE };
  if (it.kind === 'gun' && it.laser) return { model: `laser_${it.gun}`, at: HAND, mode: `laser_${it.gun}`, tint: it.color, gun: true };
  if (it.kind === 'gun') return { model: it.gun, at: HAND, mode: it.gun, tint: MAT[it.mat], gun: true };
  if (it.kind === 'grenade') return { model: 'grenade', at: HAND, mode: 'grenade' };
  if (id === 'torch') return { own: true, at: TORCH, mode: 'tool' };
  if (it.door) return { model: 'door', at: { ...TOOL, s: 0.1 }, mode: 'block' };
  if (it.kind === 'block') return { block: it.block, at: BLOCK, mode: 'block' };
  if (id === 'stick') return { model: 'pickaxe', at: TOOL, mode: 'generic', tint: null };
  if (ORES[id]) return { model: 'ore', at: ORE, mode: 'generic', tint: ORES[id][0], tint2: ORES[id][1] };
  if (id === 'copper' || id === 'iron' || id === 'gold') return { model: 'bars', at: SMALL, mode: 'generic', tint: MAT[id] };
  if (id === 'diamond') return { model: 'gems', at: SMALL, mode: 'generic', tint: MAT.diamond };
  if (AMMO[id]) return { model: 'ammo', at: SMALL, mode: 'generic', tint: AMMO[id][0], tint2: AMMO[id][1] };
  if (id === 'rockets') return { model: 'rocket', at: SMALL, mode: 'generic' };
  if (id === 'gunpowder' || id === 'explosive_powder') return { model: 'gunpowder', at: SMALL, mode: 'generic', tint: id === 'gunpowder' ? WHITE : 0xff0000 };
  return { own: true, at: SMALL, mode: 'generic' };
}

let LOADED = null;

// The models, once; false if they aren't there.
export function loadCmzItems() {
  if (!LOADED) LOADED = load();
  return LOADED;
}

async function load() {
  try {
    const r = await fileFetch(BASE + 'index.json');
    if (!r.ok) return false;
    const idx = await r.json();
    const models = {};
    await Promise.all(Object.entries(idx).map(async ([name, info]) => {
      const g = await loadGltfJson(BASE + info.file);
      models[name] = { scene: g.scene, info };
    }));
    return { models };
  } catch {
    return false;
  }
}

// Held things for one view: each made fresh when it's taken in hand, the materials kept.
export class HeldItems {
  constructor(L, sky, terrain, opts = {}) {
    this.L = L;
    this.sky = sky;
    this.terrain = terrain;
    this.opts = opts;
    this.mats = new Map();
    this.blockMats = new BlockItemMaterials(sky, terrain, opts);
    this.plain = makePropMaterial(sky, terrain, { ...opts, side: THREE.DoubleSide });
  }

  material(map) {
    const key = map ? map.uuid : 'plain';
    let m = this.mats.get(key);
    if (!m) {
      m = map ? makePropMaterial(this.sky, this.terrain, { ...this.opts, side: THREE.DoubleSide, map }) : this.plain;
      this.mats.set(key, m);
    }
    return m;
  }

  // { obj, spec, muzzle, turn }: obj goes on the prop bone; muzzle is a gun's barrel tip;
  // turn is the part that turns to point the way (the compass)
  make(id) {
    const spec = heldSpec(id);
    const obj = new THREE.Group();
    const out = { obj, spec, muzzle: null, turn: null };
    const at = spec.at;
    if (!at) return out;
    obj.quaternion.copy(at.q);
    obj.position.copy(at.p);
    obj.scale.setScalar(at.s);
    const M = spec.model && this.L.models[spec.model];
    if (M) {
      const m = M.scene.clone(true);
      m.traverse((o) => {
        if (o.name === 'BarrelTip') out.muzzle = o;
        if (!o.isMesh) return;
        const tint = o.name.includes('recolor2_') ? spec.tint2 ?? 0xffffff : o.name.includes('recolor_') ? spec.tint : spec.shade ?? 0xffffff;
        if (tint === null) { o.visible = false; return; }
        const src = o.material;
        const spec2 = src.userData?.specular?.[0] ?? 0;
        // (a laser sword's beam glows)
        if (o.name === 'Beam' && spec.beam != null) o.geometry = paint(o.geometry.clone(), spec.beam, 0, 1.2);
        else o.geometry = paint(o.geometry.clone(), tint, Math.min(0.6, spec2 * 1.4));
        o.material = this.material(src.map);
        o.frustumCulled = false;
      });
      if (spec.rocket && out.muzzle && this.L.models.rocket) this.loadRocket(m, out.muzzle);
      if (spec.compass) {
        const turn = new THREE.Group();
        turn.add(m);
        obj.add(turn);
        out.turn = turn;
      } else obj.add(m);
    } else if (spec.block != null) {
      const mesh = new THREE.Mesh(blockItemGeometry(), this.blockMats.get(spec.block));
      mesh.frustumCulled = false;
      obj.add(mesh);
    } else {
      const m = itemModel(id);
      if (m) {
        const mesh = new THREE.Mesh(m.geo, this.plain);
        mesh.frustumCulled = false;
        obj.add(mesh);
      }
    }
    return out;
  }

  // The rocket in a launcher's barrel (RocketLauncherBaseInventoryItemClass.CreateEntity): just
  // off the barrel's tip, pointing the way the barrel does, at 0.65 of its size.
  loadRocket(gun, tip) {
    gun.updateMatrixWorld(true);
    tip.updateMatrix();
    const left = new THREE.Vector3().setFromMatrixColumn(tip.matrix, 0).negate().normalize();
    const at = new THREE.Vector3(0.01, -0.005, 0.01).applyMatrix4(tip.matrix);
    // XNA's CreateWorld: its forward (-z) along the barrel, kept upright
    const z = left.clone().negate(), x = new THREE.Vector3(0, 1, 0).cross(z).normalize(), y = z.clone().cross(x);
    const r = this.L.models.rocket.scene.clone(true);
    r.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    r.position.copy(at);
    r.scale.setScalar(0.65);
    r.traverse((o) => {
      if (!o.isMesh) return;
      const src = o.material;
      o.geometry = paint(o.geometry.clone(), 0xffffff, 0);
      o.material = this.material(src.map);
      o.frustumCulled = false;
    });
    (tip.parent || gun).add(r);
  }

  setLight(v) {
    for (const m of this.mats.values()) m.uniforms.uObjLight.value.copy(v);
    this.plain.uniforms.uObjLight.value.copy(v);
    this.blockMats.setLight(v);
  }
}
