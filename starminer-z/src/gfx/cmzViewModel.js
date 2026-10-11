// What you see of yourself in first person, the way CastleMiner Z draws it (with its clips and
// models ripped from your copy of the game): your own avatar, its head away, seen from its own
// eyes and posed by the original's clips for whatever is in hand, which sits in the right hand's
// prop bone. Drawn over the world with a camera of its own, as the original drew its _fpsScene
// with the avatar's GunEyePointCamera: 90 degrees, 45 at the shoulder, and drifting a little
// against the way you turn.
//
// It takes the place of ViewModel (./viewModel.js) and keeps its interface.

import * as THREE from 'three';
import { AvatarModel, bindPosition } from '../entities/avatar/model.js';
import { CmzPlayerAnimation } from '../entities/cmz/playerAnim.js';
import { HeldItems } from '../entities/cmz/held.js';
import { itemModel } from '../items/models.js';
import { ITEMS } from '../items/items.js';

const FOV = 90, FOV_UP = 45;
// the eye: above the head bone, looking out of the face (Avatar.SetEyePoint for an
// average-height avatar)
const EYE = new THREE.Matrix4().makeTranslation(0, 0.045, 0).multiply(new THREE.Matrix4().makeRotationY(Math.PI));
const SHIFT = 0.04; // how far the camera drifts with the aim (InGameHUD.maxGunCameraShift)

const _m = new THREE.Matrix4(), _h = new THREE.Matrix4(), _p = new THREE.Vector3(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();

export class CmzViewModel {
  constructor(skyUniforms, terrainUniforms, clips, items) {
    this.sky = skyUniforms;
    this.terrain = terrainUniforms;
    this.lib = clips;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.01, 20);
    this.scene.add(this.camera);
    // the avatar, placed so its eyes are where the camera is
    this.holder = new THREE.Group();
    this.holder.matrixAutoUpdate = false;
    this.camera.add(this.holder);
    this.held = new HeldItems(items, skyUniforms, terrainUniforms, { noFog: true, noShadow: true });
    this.flash = this.makeFlash();
    this.scene.add(this.flash);
    this.flashTimer = 0;
    this.itemId = undefined;
    this.item = null;
    this.info = {};
    this.swing = 0;
    this.swinging = false;
    this.reload = 0;
    this.reloadTime = 1;
    this.ads = 0;
    this.hidden = false;
    this.aim = new THREE.Vector2();
    this.lastYaw = null;
    this.lastPitch = 0;
    this.useNow = false;
    this.grenadeStage = null;
    this.model = null;
    this.setLook({});
  }

  // The avatar to see the arms of: the player's own look.
  setLook(look) {
    if (this.model) { this.model.dispose(); this.model.material.dispose(); this.model.root.removeFromParent(); }
    const m = new AvatarModel(look || {}, this.sky, this.terrain);
    m.root.scale.setScalar(1);
    m.material.uniforms.uShadowOn = { value: 0 };
    m.mesh.frustumCulled = false;
    this.holder.add(m.root);
    this.model = m;
    this.headBone = m.byName.HEAD__Skeleton;
    this.prop = m.byName.RT_PROP__Skeleton;
    this.anim = new CmzPlayerAnimation(this.lib, this.lib.bonesOf(m.byName), bindPosition('BASE__Skeleton'), true);
    const id = this.itemId;
    this.itemId = undefined;
    this.setItem(id ?? null);
  }

  setArmColors() {}

  dispose() {
    this.model.dispose();
    this.model.material.dispose();
    for (const m of this.held.mats.values()) m.dispose();
    this.held.plain.dispose();
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
    const tex = new THREE.CanvasTexture(c);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, transparent: true, color: new THREE.Color(6, 4.2, 2.4) }));
    s.visible = false;
    return s;
  }

  // Player.PutItemInHand: the right hand's prop bone takes the new thing; the clips follow
  setItem(id) {
    if (id === this.itemId) return;
    this.itemId = id;
    if (this.item) this.item.obj.removeFromParent();
    this.item = this.held.make(id);
    this.prop.add(this.item.obj);
    this.anim.setMode(this.item.spec.mode);
    // what the game asks of a gun (its scope, and so on)
    const it = id ? ITEMS[id] : null;
    // (only the guns the original calls Scoped look through a scope at the shoulder)
    this.info = it && it.kind === 'gun' ? { ...(itemModel(id)?.info || {}), scope: !!it.scoped } : {};
    this.swing = 0; this.swinging = false;
    this.reload = 0;
  }

  // A swing (digging, a punch, a stab, putting a block down): the item's use clip from the
  // start. Returns false while one is still going.
  startSwing(kind = 'tool', time = 0.32) {
    if (this.swinging) return false;
    this.swinging = true;
    this.swing = 0;
    this.swingTime = time;
    this.useNow = true;
    return true;
  }

  // a shot: the gun's firing clip, and its flash
  fire() {
    this.useNow = true;
    this.flashTimer = 0.05;
    this.flash.material.rotation = Math.random() * Math.PI;
  }

  startReload(time) { this.reload = 0.0001; this.reloadTime = time; }

  // a rocket launcher fired: its rocket's gone from the barrel
  spend() { const r = this.item?.obj.getObjectByName('LoadedRocket'); if (r) r.visible = false; }

  // a grenade's clips on the use layer: 'cook' (the pin out), 'throw', 'reset' (the hand back)
  grenade(stage) { this.grenadeStage = stage; this.useNow = stage === 'throw'; }

  blockMaterial(id) { return this.held.blockMats.get(id); }

  update(dt, ctx) {
    const cam = ctx.camera;
    this.camera.quaternion.copy(cam.quaternion);
    this.camera.position.set(0, 0, 0);
    this.camera.aspect = cam.aspect;
    if (this.swinging) { this.swing += dt / this.swingTime; if (this.swing >= 1) { this.swing = 0; this.swinging = false; } }
    if (this.reload > 0) { this.reload += dt / this.reloadTime; if (this.reload >= 1) this.reload = 0; }
    // the clips
    const it = this.itemId ? ITEMS[this.itemId] : null;
    const gun = it && it.kind === 'gun';
    this.anim.update(dt, {
      use: this.useNow && !this.grenadeStage, shoulder: gun && !!ctx.ads, reload: gun && this.reload > 0, reloadTime: this.reloadTime,
      move: ctx.move ?? 0, back: false, pitch: 0, dead: false, grenade: this.grenadeStage, holdUse: !!ctx.grenade,
    });
    this.useNow = false;
    this.grenadeStage = null;
    this.ads = this.anim.raised;
    this.headBone.scale.setScalar(0.001);
    // the compass (or a locator) turns to point the way, the clock round with the day (its
    // ClockEntity: about its own downward axis, once a day)
    const turn = this.item?.turn;
    if (turn) {
      if (this.item.spec.turn === 'clock') turn.rotation.y = -Math.PI * 2 * (ctx.time ?? 0);
      else if (ctx.toTower != null) turn.rotation.y = ctx.toTower;
    }
    // the camera drifts against the turn of the view (the original's aim stick, here how fast
    // the view turns), half as far at the shoulder
    if (this.lastYaw == null) { this.lastYaw = ctx.yaw; this.lastPitch = ctx.pitch; }
    let dy = ctx.yaw - this.lastYaw;
    if (dy > Math.PI) dy -= Math.PI * 2; if (dy < -Math.PI) dy += Math.PI * 2;
    const dp = ctx.pitch - this.lastPitch;
    this.lastYaw = ctx.yaw; this.lastPitch = ctx.pitch;
    const rate = Math.max(dt, 1 / 240);
    const ax = THREE.MathUtils.clamp(-dy / rate / 3.2, -1, 1), ay = THREE.MathUtils.clamp(dp / rate / 2.4, -1, 1);
    const reach = SHIFT * (ctx.ads ? 0.5 : 1);
    this.aim.x += (ax * reach - this.aim.x) * Math.min(1, 5 * dt);
    this.aim.y += (ay * reach - this.aim.y) * Math.min(1, 5 * dt);
    // the eye, from the head bone as it is now, square and unscaled
    this.holder.updateWorldMatrix(true, false);
    this.model.root.updateMatrixWorld(true);
    _h.copy(this.holder.matrixWorld).invert().multiply(this.headBone.matrixWorld);
    _h.extractBasis(_x, _y, _z);
    _p.setFromMatrixPosition(_h);
    _m.makeBasis(_x.normalize(), _y.normalize(), _z.normalize()).setPosition(_p);
    _m.multiply(EYE).multiply(_h.makeTranslation(this.aim.x, this.aim.y, 0));
    this.holder.matrix.copy(_m).invert();
    this.holder.matrixWorldNeedsUpdate = true;
    // the camera's lens: 90 degrees, 45 at the shoulder
    this.camera.fov = THREE.MathUtils.lerp(FOV, FOV_UP, this.ads);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    // light where the player stands
    this.model.setLight(ctx.light.x, ctx.light.y);
    this.held.setLight(ctx.light);
    this.holder.visible = !this.hidden && !(this.info.scope && this.ads > 0.9);
    // the muzzle flash, at the barrel's tip
    this.flashTimer -= dt;
    this.flash.visible = this.flashTimer > 0 && !!this.item?.muzzle && !this.hidden;
    if (this.flash.visible) {
      this.item.muzzle.getWorldPosition(this.flash.position);
      const s = 0.1 + Math.random() * 0.06;
      this.flash.scale.set(s, s, 1);
    }
  }
}
