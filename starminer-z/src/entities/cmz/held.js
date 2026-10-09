// The things the avatar holds, as CastleMiner Z draws them: its own models (ripped from your copy
// of the game into local-assets/items by tools/cmz/rip_player.py; never committed), tinted by
// what they're made of, each set on the right hand's prop bone the way the original's
// InventoryItemClass.CreateEntity sets one there, with the clips that go with it.

import * as THREE from 'three';
import { loadGltfJson } from './gltf.js';
import { ITEMS } from '../../items/items.js';
import { itemModel } from '../../items/models.js';
import { makePropMaterial, paint } from '../../gfx/propMaterial.js';
import { BlockItemMaterials, blockItemGeometry } from '../../gfx/blockItem.js';

const BASE = 'local-assets/items/';

// CMZColors, the original's colours for what things are made of
const MAT = { wood: 0x8b4513, stone: 0xa9a9a9, copper: 0xb87333, iron: 0x808080, gold: 0xffd700, diamond: 0x00ffff, bloodstone: 0x8b0000 };
const COAL = 0x000000, BRASS = 0xeae396, DARK_GRAY = 0xa9a9a9;

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
  if (it.kind === 'tool') return { model: { pick: 'pickaxe', spade: 'spade', axe: 'axe' }[it.tool], at: TOOL, mode: 'tool', tint: MAT[it.mat] };
  if (it.kind === 'melee') return { model: 'knife', at: HAND, mode: 'tool', tint: MAT[it.mat] };
  if (it.kind === 'gun') return { model: it.gun, at: HAND, mode: it.gun, tint: MAT[it.mat], gun: true };
  if (id === 'torch') return { own: true, at: TORCH, mode: 'tool' };
  if (it.kind === 'block') return { block: it.block, at: BLOCK, mode: 'block' };
  if (id === 'stick') return { model: 'pickaxe', at: TOOL, mode: 'generic', tint: null };
  if (id === 'coal') return { model: 'ore', at: ORE, mode: 'generic', tint: COAL, tint2: COAL };
  if (id === 'copper' || id === 'iron' || id === 'gold') return { model: 'bars', at: SMALL, mode: 'generic', tint: MAT[id] };
  if (id === 'diamond') return { model: 'gems', at: SMALL, mode: 'generic', tint: MAT.diamond };
  if (id === 'bullets') return { model: 'ammo', at: SMALL, mode: 'generic', tint: DARK_GRAY, tint2: BRASS };
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
    const r = await fetch(BASE + 'index.json');
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
        const tint = o.name.includes('recolor2_') ? spec.tint2 ?? 0xffffff : o.name.includes('recolor_') ? spec.tint : 0xffffff;
        if (tint === null) { o.visible = false; return; }
        const src = o.material;
        const spec2 = src.userData?.specular?.[0] ?? 0;
        o.geometry = paint(o.geometry.clone(), tint, Math.min(0.6, spec2 * 1.4));
        o.material = this.material(src.map);
        o.frustumCulled = false;
      });
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

  setLight(v) {
    for (const m of this.mats.values()) m.uniforms.uObjLight.value.copy(v);
    this.plain.uniforms.uObjLight.value.copy(v);
    this.blockMats.setLight(v);
  }
}
