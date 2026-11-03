// The lobby: your survivor standing in front of a red barn at golden hour.
import * as THREE from 'three';
import { Character } from '../game/character.js';
import { Sky, DayNight } from '../world/sky.js';
import { GeoBuilder } from '../world/geo.js';
import { generateBuilding } from '../world/buildings.js';
import { buildProp, buildFence } from '../world/props.js';
import { makeWorldMaterial } from '../world/materials.js';
import { cosmeticsFor } from '../data/cosmetics.js';
import { TEX } from '../world/textures.js';

export class Lobby {
  constructor(gfx) {
    this.gfx = gfx;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 6000);
    this.sky = new Sky();
    this.scene.add(this.sky.mesh);
    const dn = new DayNight(); dn.hour = 18.05; const e = dn.compute();
    const u = this.sky.uniforms;
    u.uZenith.value.copy(e.zenith); u.uHorizon.value.copy(e.horizon); u.uFogColor.value.copy(e.fog); u.uSunDir.value.copy(e.sunDir).setY(0.08).normalize();
    u.uMoonDir.value.copy(e.moonDir); u.uSunColor.value.copy(e.sun); u.uCloudCol.value.copy(e.cloudCol); u.uCloud.value = 0.45; u.uSunVis.value = 1;
    this.scene.fog = new THREE.FogExp2(e.fog.getHex(), 0.006);
    this.scene.add(new THREE.HemisphereLight(0xd0b8a0, 0x4a5a30, 1.0));
    const sun = new THREE.DirectionalLight(0xffb070, 2.6);
    sun.position.set(-20, 12, 14); sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const sc = sun.shadow.camera; sc.left = -12; sc.right = 12; sc.top = 12; sc.bottom = -12; sc.near = 1; sc.far = 80;
    this.scene.add(sun);
    // ground
    const gmat = new THREE.MeshStandardMaterial({ color: 0x6a9a3a, roughness: 1 });
    const ground = new THREE.Mesh(new THREE.CircleGeometry(400, 48), gmat);
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
    this.scene.add(ground);
    // barn + props via the real world generators
    const wm = makeWorldMaterial({});
    const gb = new GeoBuilder();
    const flat = { heightAt: () => 0 };
    generateBuilding({ id: 0, kind: 'barn', x: 9, z: -32, rot: -0.35, w: 16, d: 22, floors: 1, y: 0, seed: 42, style: { wall: 0xa3302a, roof: 0x4a4f57, trim: 0xf4f1ea } }, gb, null, 1);
    generateBuilding({ id: 1, kind: 'farmhouse', x: -24, z: -40, rot: 0.45, w: 13, d: 11, floors: 2, y: 0, seed: 7, style: { wall: 0xf6f3ea, roof: 0x3a4550, trim: 0xffffff, wallTex: 'SIDING', porch: true, shutter: 0x2f4f3a } }, gb, null, 1);
    const cols = [];
    buildProp({ type: 'haybale', x: -4.2, y: 0, z: -9, rot: 0.4, data: null }, gb, cols);
    buildProp({ type: 'haybale', x: 6.5, y: 0, z: -12, rot: 1.2, data: null }, gb, cols);
    buildProp({ type: 'haybale', x: 8.2, y: 0, z: -13.2, rot: 0.2, data: null }, gb, cols);
    buildProp({ type: 'tractor', x: 15, y: 0, z: -20, rot: -0.9, data: { color: 0x2f7d32 } }, gb, cols);
    buildProp({ type: 'truck', x: -9, y: 0, z: -16, rot: 1.0, data: { color: 0x2e5c8a } }, gb, cols);
    buildFence({ x1: -40, z1: -7, x2: -5, z2: -8, kind: 'rail' }, gb, cols, flat);
    buildFence({ x1: 5, z1: -8, x2: 44, z2: -6, kind: 'rail' }, gb, cols, flat);
    // porch deck under the character
    gb.setColor(0x9a7a58).setLayer(TEX.PLANKS); gb.box(0, 0.12, 0, 4, 0.24, 3, 0.5);
    const mesh = new THREE.Mesh(gb.build(), wm);
    mesh.castShadow = true; mesh.receiveShadow = true;
    this.scene.add(mesh);
    // trees (simple blobs)
    const tg = new GeoBuilder();
    const rnd = (a, b) => a + Math.random() * (b - a);
    for (let k = 0; k < 26; k++) {
      const a = rnd(-2.6, -0.4), d = rnd(30, 90);
      const x = Math.sin(a) * d * 1.6, z = -Math.cos(a) * d * 0.9 - 10;
      tg.setColor(0x5a4334).setLayer(TEX.BARK); tg.cylinder(x, 0, z, 0.3, 0.4, 4, 6);
      tg.setColor([0xe0892a, 0x6aa63c, 0xe3b23c, 0x4f8a30, 0xc4532c][k % 5]).setLayer(TEX.LEAVES); tg.blob(x, 6, z, rnd(3, 4.5), rnd(2.6, 3.6), rnd(3, 4.5), 1, 0.2, k);
    }
    const trees = new THREE.Mesh(tg.build(), wm); trees.castShadow = true; this.scene.add(trees);
    this.character = null;
    this.yaw = 0.25;
    this.dragging = false;
    this.emoteT = 6;
    this.t = 0;
  }
  setCosmetics(equipped) {
    const c = cosmeticsFor(equipped);
    if (this.character) this.scene.remove(this.character.root);
    this.character = new Character(c.outfit, { shadow: true });
    this.character.setBackBling(c.cosmetics.backbling);
    this.character.setPickaxe(c.cosmetics.pickaxe);
    this.character.setGlider(c.cosmetics.glider);
    this.character.root.position.set(0, 0.24, 0);
    this.scene.add(this.character.root);
    this.emote = c.emote;
    this.wrap = c.cosmetics.wrap;
  }
  playEmote(name) { if (this.character) { this.character.playEmote(name || this.emote); this.emoteT = 8; } }
  showPickaxe(v) { if (this.character?.pickaxe) { this.character.setWeapon(v ? 'pickaxe' : 'none'); } }
  showWeapon(wrap) { this.character?.setWeapon('ar', 4, wrap); this.character.anim.aimPitch = 0; }
  update(dt) {
    this.t += dt;
    const W = window.innerWidth, H = window.innerHeight;
    this.camera.aspect = W / H; this.camera.updateProjectionMatrix();
    const narrow = W < 760;
    const ox = narrow ? 0 : 0.9;
    this.camera.position.set(ox + Math.sin(this.t * 0.1) * 0.15, 1.5, 6.2);
    this.camera.lookAt(ox, 1.05, 0);
    if (this.character) {
      if (!this.dragging) this.yaw += (0.25 + Math.sin(this.t * 0.3) * 0.08 - this.yaw) * Math.min(1, dt * 0.6);
      this.character.root.rotation.y = this.yaw;
      this.emoteT -= dt;
      if (this.emoteT <= 0) { this.character.playEmote(this.emote); this.emoteT = 14; }
      if (this.character.anim.emote && this.character.anim.emoteT > 5) this.character.anim.emote = null;
      this.character.update(dt);
    }
    this.sky.uniforms.uTime.value += dt;
    this.sky.update(this.camera);
  }
}
