// What you see of yourself in first person: your arm and whatever it's holding, drawn on top of
// the world with its own narrower camera. It sways as you turn, bobs as you walk, swings when
// you dig, kicks when you fire, and drops out of view to reload.

import * as THREE from 'three';
import { makePropMaterial, paint } from './propMaterial.js';
import { itemModel } from '../items/models.js';
import { ITEMS } from '../items/items.js';
import { BlockItemMaterials, blockItemGeometry } from './blockItem.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const ease = (t) => t * t * (3 - 2 * t);

class Spring {
  constructor(k = 120, d = 14) { this.k = k; this.d = d; this.x = new THREE.Vector3(); this.v = new THREE.Vector3(); this.t = new THREE.Vector3(); }
  update(dt) {
    const a = this.t.clone().sub(this.x).multiplyScalar(this.k).addScaledVector(this.v, -this.d);
    this.v.addScaledVector(a, dt);
    this.x.addScaledVector(this.v, dt);
  }
}

export class ViewModel {
  constructor(skyUniforms, terrainUniforms) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(56, 1, 0.01, 20);
    this.scene.add(this.camera);
    this.root = new THREE.Group();
    this.camera.add(this.root);
    this.mat = makePropMaterial(skyUniforms, terrainUniforms, { noFog: true, noShadow: true, side: THREE.DoubleSide });
    this.blockMats = new BlockItemMaterials(skyUniforms, terrainUniforms, { noFog: true, noShadow: true });
    this.skyUniforms = skyUniforms;
    this.terrainUniforms = terrainUniforms;
    this.holder = new THREE.Group();
    this.root.add(this.holder);
    this.itemMesh = null;
    this.itemId = null;
    this.info = {};
    // the arm (replaced by the avatar's own arm once that's loaded)
    this.armMat = makePropMaterial(skyUniforms, terrainUniforms, { noFog: true, noShadow: true });
    this.arm = this.makeArm(0xd9a582, 0x3a5a8a);
    this.holder.add(this.arm);
    this.swing = 0; // 0..1 through a swing
    this.swinging = false;
    this.swingKind = 'tool';
    this.swingTime = 0.32;
    this.recoil = new Spring(220, 22);
    this.sway = new Spring(80, 12);
    this.equip = 1;
    this.reload = 0; // 0..1 while reloading
    this.reloadTime = 1;
    this.ads = 0;
    this.sprint = 0;
    this.time = 0;
    this.flash = this.makeFlash();
    this.root.add(this.flash);
    this.flashTimer = 0;
    this.needle = null;
    this.lastYaw = 0;
    this.lastPitch = 0;
    this.hidden = false;
  }

  makeArm(skin, sleeve) {
    const parts = [];
    const fore = new RoundedBoxGeometry(0.075, 0.075, 0.42, 3, 0.03);
    fore.translate(0, 0, 0.24);
    parts.push(paint(fore, skin));
    const sl = new RoundedBoxGeometry(0.092, 0.092, 0.22, 3, 0.035);
    sl.translate(0, 0, 0.5);
    parts.push(paint(sl, sleeve));
    const hand = new RoundedBoxGeometry(0.085, 0.07, 0.1, 3, 0.03);
    hand.translate(0, 0.005, 0.0);
    parts.push(paint(hand, skin));
    const g = new THREE.Group();
    for (const p of parts) g.add(new THREE.Mesh(p, this.armMat));
    g.userData.simple = true;
    return g;
  }

  // Swap in the avatar's own arm: a mesh whose origin is the right hand, forearm along +z.
  setArm(obj) {
    this.holder.remove(this.arm);
    this.arm = obj;
    this.holder.add(obj);
  }

  makeFlash() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,250,220,1)');
    grd.addColorStop(0.25, 'rgba(255,200,90,0.9)');
    grd.addColorStop(0.6, 'rgba(255,120,30,0.35)');
    grd.addColorStop(1, 'rgba(255,80,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    // spikes
    g.globalCompositeOperation = 'lighter';
    g.strokeStyle = 'rgba(255,220,140,0.7)';
    g.lineWidth = 3;
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; g.beginPath(); g.moveTo(32, 32); g.lineTo(32 + Math.cos(a) * 30, 32 + Math.sin(a) * 30); g.stroke(); }
    const tex = new THREE.CanvasTexture(c);
    const m = new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, transparent: true, color: new THREE.Color(6, 4.2, 2.4) });
    const s = new THREE.Sprite(m);
    s.scale.set(0.16, 0.16, 1);
    s.visible = false;
    return s;
  }

  blockMaterial(blockId) { return this.blockMats.get(blockId); }

  setItem(id) {
    if (id === this.itemId) return;
    this.itemId = id;
    if (this.itemMesh) { this.holder.remove(this.itemMesh); this.itemMesh = null; }
    this.needle = null;
    this.info = {};
    this.equip = 0;
    this.reload = 0;
    const it = id ? ITEMS[id] : null;
    this.kind = !it ? 'hand' : it.kind === 'gun' ? 'gun' : it.kind === 'block' && id !== 'torch' ? 'block' : it.kind === 'tool' && it.tool === 'compass' ? 'compass' : it.kind === 'melee' ? 'knife' : it.kind === 'tool' ? 'tool' : id === 'torch' ? 'torch' : 'small';
    if (!it) return;
    if (this.kind === 'block') {
      const mesh = new THREE.Mesh(blockItemGeometry(), this.blockMats.get(it.block));
      mesh.scale.setScalar(0.22);
      this.itemMesh = mesh;
    } else {
      const m = itemModel(id);
      if (!m) return;
      const mesh = new THREE.Mesh(m.geo, this.mat);
      this.info = m.info || {};
      if (m.needle) {
        this.needle = new THREE.Mesh(m.needle, this.mat);
        this.needle.position.set(0, 0.013, 0);
        mesh.add(this.needle);
      }
      this.itemMesh = mesh;
    }
    this.itemMesh.frustumCulled = false;
    this.holder.add(this.itemMesh);
  }

  // Start a swing (digging or melee). Returns false if one is already going.
  startSwing(kind = 'tool', time = 0.32) {
    if (this.swinging) return false;
    this.swinging = true;
    this.swing = 0;
    this.swingKind = kind;
    this.swingTime = time;
    return true;
  }

  fire(kick = 0.05) {
    this.recoil.v.z += kick * 18;
    this.recoil.v.x += kick * 10 * (1 + Math.random() * 0.4);
    this.recoil.v.y += (Math.random() - 0.5) * kick * 4;
    this.flashTimer = 0.05;
    this.flash.material.rotation = Math.random() * Math.PI;
  }

  startReload(time) { this.reload = 0.0001; this.reloadTime = time; }

  update(dt, ctx) {
    this.time += dt;
    const cam = ctx.camera;
    this.camera.quaternion.copy(cam.quaternion);
    this.camera.position.set(0, 0, 0);
    this.camera.aspect = cam.aspect;
    const baseFov = 56;
    this.camera.fov = THREE.MathUtils.lerp(baseFov, baseFov / (this.info.scope ? 2.2 : 1.25), this.ads);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    this.mat.uniforms.uObjLight.value.copy(ctx.light);
    this.armMat.uniforms.uObjLight.value.copy(ctx.light);
    this.blockMats.setLight(ctx.light);
    if (this.arm.userData.material) this.arm.userData.material.uniforms.uObjLight.value.copy(ctx.light);

    // sway: the item lags behind the view as you turn
    let dyaw = ctx.yaw - this.lastYaw, dpitch = ctx.pitch - this.lastPitch;
    if (dyaw > Math.PI) dyaw -= Math.PI * 2; if (dyaw < -Math.PI) dyaw += Math.PI * 2;
    this.lastYaw = ctx.yaw; this.lastPitch = ctx.pitch;
    this.sway.t.set(THREE.MathUtils.clamp(dyaw * 2.2, -0.08, 0.08), THREE.MathUtils.clamp(-dpitch * 2.2, -0.08, 0.08), 0);
    this.sway.update(dt);
    this.recoil.t.set(0, 0, 0);
    this.recoil.update(dt);

    this.equip = Math.min(1, this.equip + dt * 4.5);
    this.ads += ((ctx.ads ? 1 : 0) - this.ads) * Math.min(1, dt * 12);
    this.sprint += ((ctx.sprinting && !ctx.ads ? 1 : 0) - this.sprint) * Math.min(1, dt * 8);
    if (this.reload > 0) {
      this.reload += dt / this.reloadTime;
      if (this.reload >= 1) this.reload = 0;
    }
    if (this.swinging) {
      this.swing += dt / this.swingTime;
      if (this.swing >= 1) { this.swing = 0; this.swinging = false; }
    }
    this.flashTimer -= dt;
    this.flash.visible = this.flashTimer > 0 && this.kind === 'gun' && !this.hidden;

    // where the hand rests, by kind of item
    const k = this.kind;
    const rest = new THREE.Vector3(), rot = new THREE.Euler();
    if (k === 'gun') {
      rest.set(0.17, -0.17, -0.44);
      rot.set(0.02, 0.05, 0);
    } else if (k === 'tool') {
      // the hand on the handle in sight at the lower right, the head up and forward
      rest.set(0.26, -0.2, -0.52);
      rot.set(-0.3, 0.25, 0.36);
    } else if (k === 'torch') {
      rest.set(0.3, -0.4, -0.55);
      rot.set(-0.3, 0.2, 0.25);
    } else if (k === 'knife') {
      rest.set(0.27, -0.3, -0.42);
      rot.set(-0.35, 0.35, 0.15);
    } else if (k === 'block') {
      rest.set(0.3, -0.3, -0.5);
      rot.set(0.2, 0.7, 0.0);
    } else if (k === 'compass') {
      rest.set(0.18, -0.22, -0.36);
      rot.set(0.75, 0.1, 0);
    } else if (k === 'small') {
      rest.set(0.26, -0.26, -0.44);
      rot.set(0.4, 0.6, 0.2);
    } else {
      rest.set(0.3, -0.36, -0.42);
      rot.set(0.1, 0.25, 0);
    }
    // aim down the sights: bring the sight line to the middle of the screen
    if (k === 'gun' && this.ads > 0.001) {
      const sightY = this.info.sight ? this.info.sight.y : 0.1;
      const aim = new THREE.Vector3(0, -sightY - 0.004, this.info.scope ? -0.2 : -0.27);
      rest.lerp(aim, this.ads);
      rot.x *= 1 - this.ads; rot.y *= 1 - this.ads;
    }
    // walking bob, breathing
    const bob = ctx.bob * (1 - this.ads * 0.85);
    const ph = ctx.bobPhase;
    rest.x += Math.cos(ph) * 0.018 * bob;
    rest.y += -Math.abs(Math.sin(ph)) * 0.022 * bob + Math.sin(this.time * 1.6) * 0.003;
    // sprinting: the item drops and turns away
    rest.x -= this.sprint * 0.04; rest.y -= this.sprint * 0.05;
    rot.x -= this.sprint * 0.35; rot.y += this.sprint * 0.55;
    // sway
    rest.x += this.sway.x.x * (1 - this.ads * 0.7);
    rest.y += this.sway.x.y * (1 - this.ads * 0.7);
    // equipping: rise from below
    const e = ease(this.equip);
    rest.y -= (1 - e) * 0.35;
    rot.x -= (1 - e) * 0.6;
    // recoil
    rest.z += this.recoil.x.z * 0.03;
    rot.x += this.recoil.x.x * 0.05;
    rot.z += this.recoil.x.y * 0.03;
    // reloading: down, tip, and back
    if (this.reload > 0) {
      const r = Math.sin(Math.min(1, this.reload) * Math.PI);
      rest.y -= r * 0.16;
      rot.x -= r * 0.55;
      rot.z += r * 0.5;
      if (this.info.pump) rest.z += Math.sin(this.reload * Math.PI * 6) * 0.01 * r;
    }
    // swinging
    if (this.swinging || this.swing > 0) {
      const s = this.swing;
      if (this.swingKind === 'punch') {
        const p = s < 0.35 ? ease(s / 0.35) : 1 - ease((s - 0.35) / 0.65);
        rest.z -= p * 0.22; rest.x -= p * 0.12; rest.y += p * 0.08;
        rot.x += p * 0.3; rot.y -= p * 0.3;
      } else if (this.swingKind === 'stab') {
        const p = s < 0.3 ? ease(s / 0.3) : 1 - ease((s - 0.3) / 0.7);
        rest.z -= p * 0.25; rest.x -= p * 0.1;
        rot.x += p * 0.5;
      } else if (this.swingKind === 'place') {
        const p = Math.sin(s * Math.PI);
        rest.z -= p * 0.08; rest.y += p * 0.03;
        rot.x -= p * 0.2;
      } else {
        // the dig: lift a little, then strike down toward the crosshair
        const up = s < 0.25 ? ease(s / 0.25) : 0;
        const down = s >= 0.25 && s < 0.55 ? ease((s - 0.25) / 0.3) : s >= 0.55 ? 1 - ease((s - 0.55) / 0.45) : 0;
        rot.x += up * 0.35 - down * 1.15;
        rest.y += up * 0.04 - down * 0.06;
        rest.z -= down * 0.12;
        rest.x -= down * 0.08;
        rot.z -= down * 0.15;
      }
    }
    this.holder.position.copy(rest);
    this.holder.rotation.copy(rot);
    // the item in the hand
    if (this.itemMesh) {
      this.itemMesh.position.set(0, 0, 0);
      if (k === 'block') { this.itemMesh.position.set(0, 0.05, -0.05); }
      // tools a little smaller in the hand, gripped a hand's width up the handle
      this.itemMesh.scale.setScalar(k === 'tool' ? 0.78 : 1);
      if (k === 'tool') { this.itemMesh.position.set(0, -0.1, 0); this.itemMesh.rotation.set(0, Math.PI / 2, 0); }
      else if (k === 'torch') { this.itemMesh.position.set(0, -0.06, 0); this.itemMesh.rotation.set(0, 0, 0); }
      else if (k === 'knife') this.itemMesh.rotation.set(0, 0, 0);
      else this.itemMesh.rotation.set(0, 0, 0);
      this.itemMesh.visible = !this.hidden && (this.ads < 0.9 || !this.info.scope);
    }
    // the arm reaches in from the lower right
    this.arm.visible = !this.hidden && !(this.info.scope && this.ads > 0.9);
    if (this.arm.userData.simple) {
      this.arm.position.set(0.0, -0.02, 0.04);
      this.arm.rotation.set(k === 'gun' ? 0.05 : 0.35, k === 'gun' ? 0.25 : 0.1, 0);
    }
    if (this.needle && ctx.toTower != null) this.needle.rotation.y = ctx.toTower;
    // muzzle flash
    if (this.flash.visible && this.info.muzzle) {
      const mz = this.info.muzzle.clone();
      this.holder.updateMatrix();
      mz.applyMatrix4(this.holder.matrix);
      this.flash.position.copy(mz);
      const s = 0.12 + Math.random() * 0.08;
      this.flash.scale.set(s, s, 1);
    }
  }
}
