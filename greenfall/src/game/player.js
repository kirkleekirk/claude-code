// The local player: input → movement, third-person camera, aiming, interactions,
// bricklaying (with a trowel), item use, driving and vaulting through windows.
import * as THREE from 'three';
import { Survivor, MOVE, HOTBAR } from './survivor.js';
import { ITEMS, WEAPONS, THROWABLES, AMMO } from '../data/items.js';
import { gunStats } from '../data/gunmods.js';
import { clamp, lerp, dampAngle, wrapAngle } from '../core/math.js';
import { COL } from '../world/buildings.js';

const _d = new THREE.Vector3();
export class Player extends Survivor {
  constructor(G, opts) {
    super(G, { ...opts, isPlayer: true });
    this.physical = true;
    this.camYaw = 0; this.camPitch = -0.15;
    this.camDist = 3.2; this.shoulder = 0.62;
    this.fov = 72;
    this.recoilP = 0; this.shakeAmt = 0;
    this.mode = 'ground';
    this.buildMode = false; this.buildPiece = 'wall'; this.buildCd = 0; // buildMode = holding a Mason's Trowel
    this.ads = false;
    this.flashlight = false;
    this.aimPoint = new THREE.Vector3();
    this.aimDir = new THREE.Vector3();
    this.interaction = null; this.holdT = 0; this.interT = 0;
    this.stepPhase = 0;
    this.vault = null;
    this.deadT = 0;
    this.spot = new THREE.SpotLight(0xfff4d8, 0, 55, 0.42, 0.45, 1.4);
    this.spot.castShadow = false;
    G.scene.add(this.spot); G.scene.add(this.spot.target);
    this.emote = opts.emote || 'wave';
    this.gliderAuto = 110;
  }
  addRecoil(r) { this.recoilP += r; }
  shake(a) { this.shakeAmt = Math.max(this.shakeAmt, a); }
  inView(x, z) {
    const dx = x - this.G.camera.position.x, dz = z - this.G.camera.position.z;
    const f = (-Math.sin(this.camYaw) * dx - Math.cos(this.camYaw) * dz) / (Math.hypot(dx, dz) || 1);
    return f > 0.45;
  }
  get facingYaw() { return this.camYaw + Math.PI; }

  update(dt) {
    const G = this.G, I = G.input;
    // look
    if (this.mode !== 'dead' || true) {
      const { dx, dy } = I.lookDelta();
      const sensMul = this.ads ? (this.scoped ? (this.gunSt?.zoom ?? 16) / 50 : 0.65) : 1;
      this.camYaw -= dx * sensMul;
      this.camPitch = clamp(this.camPitch - dy * sensMul, -1.35, 1.25);
    }
    this.recoilP *= Math.exp(-dt * 10);
    this.shakeAmt *= Math.exp(-dt * 6);
    if (this.mode === 'plane') this.updatePlane(dt);
    else if (this.mode === 'skydive' || this.mode === 'glide') this.updateAir(dt);
    else if (this.mode === 'vault') this.updateVault(dt);
    else if (this.mode === 'ground') this.updateGround(dt);
    else if (this.mode === 'drive') this.updateDrive(dt);
    else if (this.mode === 'dead') { this.deadT += dt; this.syncModel(dt, 0); }
    else if (this.mode === 'extracted') { /* camera handled by match */ }
    this.updateCamera(dt);
    this.updateFlashlight(dt);
  }

  // ---------------- plane / skydive / glide ----------------
  updatePlane(dt) {
    const pl = this.G.match.plane;
    if (!pl) return;
    this.pos.copy(pl.pos);
    if (this.character) this.character.root.visible = false;
    if ((this.G.input.pressed('jump') || this.forceJump) && pl.canJump) this.jumpFromPlane();
  }
  jumpFromPlane() {
    const pl = this.G.match.plane;
    this.forceJump = false;
    this.mode = 'skydive';
    this.pos.copy(pl.pos).add(new THREE.Vector3(0, -4, 0));
    this.vel.copy(pl.vel).multiplyScalar(0.4);
    if (this.character) this.character.root.visible = true;
    this.character.anim.state = 'skydive';
    this.G.audio?.play('whoosh', null, { vol: 0.6 });
    this.G.onPlayerJumped?.();
  }
  updateAir(dt) {
    const G = this.G, I = G.input;
    const ax = I.moveAxes();
    const fx = -Math.sin(this.camYaw), fz = -Math.cos(this.camYaw);
    const rx = Math.cos(this.camYaw), rz = -Math.sin(this.camYaw);
    let wx = fx * ax.y + rx * ax.x, wz = fz * ax.y + rz * ax.x;
    const ground = G.physics.groundAt(this.pos.x, this.pos.z, this.pos.y + 1, 0.4);
    const h = this.pos.y - ground;
    if (this.mode === 'skydive') {
      const dive = clamp(-this.camPitch, 0, 1.3) * (ax.y > 0 ? 1 : 0.3);
      const term = 32 + dive * 22;
      this.vel.y += (-term - this.vel.y) * Math.min(1, dt * 1.5);
      const hs = 15 + dive * 8;
      this.vel.x += (wx * hs - this.vel.x) * Math.min(1, dt * 1.2);
      this.vel.z += (wz * hs - this.vel.z) * Math.min(1, dt * 1.2);
      if (h < this.gliderAuto || (I.pressed('jump') && h < 900)) { this.mode = 'glide'; this.character.anim.state = 'glide'; G.audio?.play('whoosh', null, { vol: 0.5 }); }
    } else {
      this.vel.y += (-6.5 - this.vel.y) * Math.min(1, dt * 2.5);
      this.vel.x += (wx * 14 - this.vel.x) * Math.min(1, dt * 1.6);
      this.vel.z += (wz * 14 - this.vel.z) * Math.min(1, dt * 1.6);
    }
    this.pos.addScaledVector(this.vel, dt);
    if (Math.hypot(this.vel.x, this.vel.z) > 1) this.yaw = dampAngle(this.yaw, Math.atan2(this.vel.x, this.vel.z), 4, dt);
    // world bounds
    this.pos.x = clamp(this.pos.x, 0, 4800); this.pos.z = clamp(this.pos.z, 0, 3000);
    if (this.mode === 'glide') {
      // collide with roofs etc.
      G.physics.pushOut(this.pos, 0.4, 1.7, 0.3);
      const g = G.physics.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.5, 0.4);
      if (this.pos.y <= g + 0.05) {
        this.pos.y = g; this.vel.set(0, 0, 0);
        this.mode = 'ground'; this.onGround = true;
        this.character.anim.state = 'ground';
        G.audio?.play('land', null, { vol: 0.6 });
        G.onPlayerLanded?.();
      }
    }
    const wl = G.world.waterLevelAt(this.pos.x, this.pos.z);
    if (this.mode === 'glide' && this.pos.y < wl - 0.5) { this.mode = 'ground'; this.character.anim.state = 'ground'; }
    G.audio?.loop('wind_dive', false);
    this.syncModel(dt, 0);
  }

  // ---------------- vaulting ----------------
  tryVault() {
    const G = this.G;
    let best = null, bd = 1.6;
    for (const b of G.inter.nearbyBuildings(this.pos.x, this.pos.z, 4)) {
      if (!b.rt) continue;
      for (const w of b.rt.windows) {
        if (w.boarded) continue;
        const d = Math.hypot(w.x - this.pos.x, w.z - this.pos.z);
        if (d > bd) continue;
        if (w.floorY + w.sill - this.pos.y > 1.3 || w.floorY + w.sill < this.pos.y - 0.6) continue;
        const toW = Math.atan2(w.x - this.pos.x, w.z - this.pos.z);
        if (Math.abs(wrapAngle(toW - this.facingYaw)) > 0.9) continue;
        best = w; bd = d;
      }
    }
    if (!best) return false;
    const side = (this.pos.x - best.x) * best.nx + (this.pos.z - best.z) * best.nz;
    const s = side > 0 ? -1 : 1;
    const to = new THREE.Vector3(best.x + best.nx * s * 0.9, best.floorY + 0.02, best.z + best.nz * s * 0.9);
    to.y = G.physics.groundAt(to.x, to.z, best.floorY + best.sill + 0.5, 0.3);
    this.vault = { from: this.pos.clone(), to, t: 0, peak: best.floorY + best.sill + 0.3 };
    this.mode = 'vault';
    this.character.anim.state = 'vault';
    G.audio?.play('land', null, { vol: 0.3 });
    G.emitNoise(this.pos.x, this.pos.z, 6, this, 'vault');
    return true;
  }
  updateVault(dt) {
    const v = this.vault;
    v.t += dt / 0.55;
    const k = Math.min(1, v.t);
    this.pos.lerpVectors(v.from, v.to, k);
    this.pos.y = lerp(v.from.y, v.to.y, k) + Math.sin(k * Math.PI) * Math.max(0.4, v.peak - Math.max(v.from.y, v.to.y) + 0.4);
    this.character.anim.vaultT = k;
    if (k >= 1) { this.mode = 'ground'; this.character.anim.state = 'ground'; this.vel.set(0, 0, 0); }
    this.syncModel(dt, 2);
  }

  // ---------------- on foot ----------------
  updateGround(dt) {
    const G = this.G, I = G.input;
    if (!this.alive) { this.mode = 'dead'; return; }
    this.updateSurvival(dt);
    G.weapons.updateShooter(this, dt);
    // slot selection
    for (let k = 1; k <= HOTBAR + 1; k++) if (I.pressed('slot' + k)) this.equip(k - 1);
    if (I.mouse.wheel && !G.ui.isOpen()) this.equip(((this.inv.active + Math.sign(I.mouse.wheel)) % (HOTBAR + 1) + HOTBAR + 1) % (HOTBAR + 1));
    const wasBuilding = this.buildMode;
    this.buildMode = this.activeDef()?.type === 'trowel';
    if (wasBuilding && !this.buildMode) G.builds.showGhost(null);
    if (I.pressed('flashlight')) { this.flashlight = !this.flashlight; G.audio?.play('ui_click', null, { vol: 0.4 }); }
    // movement
    const ax = I.moveAxes();
    const fx = -Math.sin(this.camYaw), fz = -Math.cos(this.camYaw);
    const rx = Math.cos(this.camYaw), rz = -Math.sin(this.camYaw);
    let wx = fx * ax.y + rx * ax.x, wz = fz * ax.y + rz * ax.x;
    const wl = Math.hypot(wx, wz);
    if (wl > 1) { wx /= wl; wz /= wl; }
    const moving = wl > 0.1;
    this.crouch = I.down('crouch') && !this.swimming;
    const def = this.activeDef();
    this.ads = I.aim && !this.buildMode && !!def && def.type === 'weapon' && !def.melee && this.ws.reload <= 0 && !this.action;
    const wslot = this.activeWeapon();
    this.gunSt = wslot && !def.melee ? gunStats(wslot) : null;
    this.scoped = this.ads && !!this.gunSt?.scope;
    const wantSprint = I.down('sprint') && moving && ax.y > 0.1 && !this.ads && !this.crouch && this.stamina > 1 && !this.legsHurt && !this.action;
    this.sprinting = wantSprint && this.onGround;
    let speed = this.swimming ? MOVE.swim : this.crouch ? MOVE.crouch : this.sprinting ? MOVE.sprint : this.ads ? MOVE.walk : MOVE.run;
    if (this.action) speed = Math.min(speed, 2.2);
    if (this.legsHurt) speed *= 0.62;
    if (this.thirst <= 0 || this.hunger <= 0) speed *= 0.85;
    speed *= this.mods.get('moveSpeed');
    if (this.gunSt && !this.buildMode) speed *= this.gunSt.move; // heavy barrels, drums and scopes slow you down
    let jump = I.pressed('jump');
    if (jump && this.onGround && this.tryVault()) return;
    if (jump && this.action) jump = false;
    const sp = this.move(dt, moving ? wx : 0, moving ? wz : 0, moving ? speed : 0, jump);
    // facing
    if (moving || this.ads || this.buildMode || I.fire || (this.inv.active > 0 && def && def.type === 'weapon')) this.yaw = dampAngle(this.yaw, this.facingYaw, moving ? 14 : 18, dt);
    // footsteps & noise
    if (this.onGround && sp > 0.5) {
      this.stepPhase += dt * sp * 0.55;
      if (this.stepPhase > 1) {
        this.stepPhase = 0;
        G.audio?.play('footstep', null, { vol: this.crouch ? 0.12 : this.sprinting ? 0.45 : 0.28, surface: this.indoor ? 'wood' : 'dirt' });
        G.emitNoise(this.pos.x, this.pos.z, this.crouch ? 2 : this.sprinting ? 16 : 7, this, 'step');
      }
    }
    // emote
    if (I.pressed('emote') && !moving) { this.character.playEmote(this.emote); }
    this.indoor = G.inter.buildingAt(this.pos.x, this.pos.y + 0.5, this.pos.z);
    // aiming ray
    this.computeAim();
    // actions in progress
    if (this.action) {
      this.action.t += dt;
      if (this.action.kind === 'hold' && !I.down('interact') && !this.action.auto) this.cancelAction();
      else if (this.action && this.action.t >= this.action.dur) { const a = this.action; this.action = null; a.onDone?.(); }
    }
    if (I.pressed('reload')) { if (this.buildMode) { this.buildPiece = this.buildPiece === 'wall' ? 'window' : 'wall'; G.audio?.play('ui_click', null, { vol: 0.4 }); } else G.weapons.startReload(this); }
    if (I.pressed('heal')) this.quickHeal();
    if (I.pressed('eat') && !this.buildMode) this.quickEat();
    if (I.pressed('drop')) this.dropActive();
    this.updateUse(dt);
    // interactions
    this.interT -= dt;
    if (this.interT <= 0) { this.interT = 0.1; this.interaction = this.action ? this.interaction : G.inter.findInteraction(this, this.aimDir); }
    if (this.interaction && !this.action && I.pressed('interact')) this.beginInteract(this.interaction);
    this.syncModel(dt, sp);
  }
  computeAim() {
    const G = this.G;
    const cam = G.camera;
    _d.set(0, 0, -1).applyQuaternion(cam.quaternion);
    this.aimDir.copy(_d);
    const start = cam.position.clone().addScaledVector(_d, this.camDistActual || this.camDist);
    const hit = G.physics.raycast(start.x, start.y, start.z, _d.x, _d.y, _d.z, 1200);
    let t = hit ? hit.t : 1200;
    const eh = G.weapons.rayEntities(start.x, start.y, start.z, _d.x, _d.y, _d.z, t, this);
    if (eh) t = eh.t;
    this.aimPoint.copy(start).addScaledVector(_d, Math.max(t, 1.5));
    this.aimTarget = eh;
  }
  updateUse(dt) {
    const G = this.G, I = G.input;
    if (G.ui.isOpen()) return;
    const slot = this.activeSlot();
    if (this.inv.active === 0) { if (I.fire) G.weapons.punch(this, this.aimPoint); return; }
    if (!slot) return;
    const def = ITEMS[slot.id];
    if (def.type === 'weapon') {
      if (this.sprinting && I.fire) this.sprinting = false;
      if (def.auto ? I.fire : I.firePressed) { this.cancelAction(); G.weapons.fire(this, this.aimPoint, { ads: this.ads }); }
    } else if (def.type === 'throw') {
      if (I.firePressed && this.ws.cd <= 0) {
        G.weapons.throwItem(this, slot.id, this.aimPoint);
        this.ws.cd = 0.8;
        slot.n--;
        if (slot.n <= 0) { this.inv.slots[this.inv.active - 1] = null; this.refreshModel(); }
      }
    } else if (def.type === 'deploy') {
      if (I.firePressed) {
        const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
        const x = this.pos.x + fx * 1.6, z = this.pos.z + fz * 1.6;
        const y = G.physics.groundAt(x, z, this.pos.y + 1);
        if (Math.abs(y - this.pos.y) > 1.2) { G.hud.toast(true, "Can't place here"); return; }
        G.inter.placeCampfire(x, y, z, this);
        slot.n--;
        if (slot.n <= 0) { this.inv.slots[this.inv.active - 1] = null; this.refreshModel(); }
      }
    } else if (def.type === 'heal' || def.type === 'food') {
      if (I.firePressed) this.useItem({ list: this.inv.slots, i: this.inv.active - 1, slot });
    } else if (def.type === 'trowel') {
      this.updateBuild(dt);
    } else if (def.type === 'tool') {
      if (I.firePressed && !this.action) G.rides.useItemOn(this, { list: this.inv.slots, i: this.inv.active - 1, slot });
    }
  }
  quickHeal() {
    const pick = (pred) => this.findItem((s, d) => d && pred(s, d));
    let ref = null;
    if (this.bleed) ref = pick((s) => s.id === 'bandage') || pick((s) => s.id === 'medkit');
    if (!ref && this.fracture) ref = pick((s) => s.id === 'splint') || pick((s) => s.id === 'painkillers');
    if (!ref && this.infection > 0) ref = pick((s) => s.id === 'antibiotics');
    const f = this.hpFrac;
    if (!ref && f < 0.5) ref = pick((s) => s.id === 'medkit') || pick((s) => s.id === 'bandage');
    if (!ref && f < 0.75) ref = pick((s) => s.id === 'bandage') || pick((s) => s.id === 'medkit');
    if (!ref && this.armor < 100) ref = pick((s) => s.id === 'armor');
    if (!ref && f < 1) ref = pick((s) => s.id === 'medkit') || pick((s) => s.id === 'painkillers');
    if (!ref) { this.G.hud.toast(true, 'Nothing useful to heal with'); return; }
    this.useItem(ref);
  }
  quickEat() {
    const thirsty = this.thirst < this.hunger;
    const score = (d) => (thirsty ? (d.water || 0) * 1.2 + (d.food || 0) * 0.3 : (d.food || 0) * 1.2 + (d.water || 0) * 0.3) - (d.sick ? 40 : 0);
    let best = null, bs = 0;
    for (const L of [this.inv.slots, this.inv.pack]) for (let i = 0; i < L.length; i++) {
      const s = L[i];
      if (!s) continue;
      const d = ITEMS[s.id];
      if (d?.type !== 'food') continue;
      const sc = score(d);
      if (sc > bs) { bs = sc; best = { list: L, i, slot: s }; }
    }
    if (!best) { this.G.hud.toast(true, 'No food or water'); return; }
    this.useItem(best);
  }
  dropActive() {
    const slot = this.activeSlot();
    if (!slot) return;
    this.G.inter.dropItem({ ...slot }, this.pos.x, this.pos.y + 0.5, this.pos.z);
    this.inv.slots[this.inv.active - 1] = null;
    this.refreshModel();
  }
  beginInteract(it) {
    const G = this.G;
    if (it.kind === 'item') return this.pickup(it.obj);
    if (it.kind === 'vehicle') { if (G.rides.enter(this, it.obj)) { this.mode = 'drive'; G.builds.showGhost(null); this.interaction = null; } return; }
    if (it.kind === 'door') { G.inter.toggleDoor(it.obj, this); return; }
    if (it.kind === 'bench') { G.ui.openWorkbench(it.obj); return; }
    const done = () => {
      switch (it.kind) {
        case 'board': case 'boarddoor': G.inter.board(it.obj, this); break;
        case 'unboard': G.inter.unboard(it.obj, this); break;
        case 'search': G.inter.searchContainer(it.obj, this); break;
        case 'crate': G.inter.openCrate(it.obj, this); break;
        case 'cook': G.inter.cook(this); break;
        case 'siphon': G.rides.siphon(this, it.obj); break;
        case 'patch': G.rides.patch(this, it.obj); break;
        case 'water': { const left = this.addItem('dirtywater', 1); if (left) G.hud.toast(true, 'Inventory full'); else G.hud.pickup('dirtywater', 1, 0); break; }
        default: break;
      }
      this.interaction = null; this.interT = 0;
    };
    if (it.kind === 'board' || it.kind === 'boarddoor') {
      const cost = it.kind === 'boarddoor' ? 30 : 20;
      if (this.inv.mats.wood < cost) { G.hud.toast(true, `Need ${cost} wood — chop trees with an axe or machete`); return; }
      this.character.playAction('hammer', it.hold);
      G.audio?.play('hammer', null, { vol: 0.6 });
    } else if (it.kind === 'search') this.character.playAction('search', it.hold);
    G.emitNoise(this.pos.x, this.pos.z, it.kind === 'search' ? 5 : 3, this, 'interact');
    let hold = it.hold;
    if (it.kind === 'board' || it.kind === 'boarddoor' || it.kind === 'unboard') hold /= this.mods.get('buildSpeed');
    if (it.kind === 'search' || it.kind === 'crate') hold /= this.mods.get('search');
    this.startAction('hold', hold, done, { label: it.prompt });
  }
  pickup(rec) {
    const G = this.G;
    const def = ITEMS[rec.id];
    if (def?.type === 'blueprint') {
      if (this.mods.has('blueprints')) { G.hud.toast(true, 'Engineers already know every blueprint'); return; }
      if (this.blueprints.has(def.mod)) { G.hud.toast(true, `You already know the ${def.name}`); return; }
      this.addItem(rec.id, 1);
      G.inter.removeWorldItem(rec);
      G.audio?.play('pickup', null, { vol: 0.6 });
      G.hud.announce(`LEARNED: ${def.name.toUpperCase()}`, 'blue');
      G.hud.toast(true, 'Build it at any weapon workbench');
      return;
    }
    let left = this.addItem(rec.id, rec.n, rec.r, rec.mag, rec.mods);
    if (left === rec.n && def && def.type === 'weapon' && this.inv.active > 0) {
      // swap with held item
      const cur = this.activeSlot();
      if (cur) G.inter.dropItem({ ...cur }, this.pos.x, this.pos.y + 0.5, this.pos.z);
      this.inv.slots[this.inv.active - 1] = { id: rec.id, n: 1, r: rec.r, mag: rec.mag ?? def.mag, mods: { ...(rec.mods || {}) } };
      this.refreshModel();
      left = 0;
    }
    if (left === rec.n) { G.hud.toast(true, 'Inventory full — drop something (T) or swap'); return; }
    G.hud.pickup(rec.id, rec.n - left, rec.r);
    G.audio?.play('pickup', null, { vol: 0.6 });
    if (left <= 0) G.inter.removeWorldItem(rec); else { rec.n = left; G.net?.onItemQty(rec); }
    // auto-equip first weapon
    if (def?.type === 'weapon' && this.inv.active === 0) { const idx = this.inv.slots.findIndex((s) => s && s.id === rec.id); if (idx >= 0) this.equip(idx + 1); }
  }

  // ---------------- driving ----------------
  updateDrive(dt) {
    const G = this.G, I = G.input, v = this.vehicle;
    if (!this.alive) { G.rides.exit(this, true); this.mode = 'dead'; return; }
    if (!v) { this.mode = 'ground'; return; }
    this.updateSurvival(dt);
    const ax = I.moveAxes();
    G.rides.drive(this, v, dt, { x: ax.x, y: ax.y, brake: I.down('jump') });
    if (!this.vehicle) return; // thrown off
    const D = v.def;
    const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
    this.pos.set(v.pos.x - fx * (v.type === 'bike' ? 0.15 : -0.3), v.pos.y + D.seatY, v.pos.z - fz * (v.type === 'bike' ? 0.15 : -0.3));
    this.vel.set(fx * v.speed, 0, fz * v.speed);
    this.yaw = v.yaw;
    this.indoor = null;
    if (I.pressed('interact')) { G.rides.exit(this); return; }
    if (I.pressed('flashlight')) this.headlights = !this.headlights;
    if (I.pressed('heal')) { G.audio?.play('horn', v.pos, { vol: 1 }); G.emitNoise(v.pos.x, v.pos.z, 110, this, 'horn'); }
    // camera follows behind unless the player is looking around
    const { dx } = I.lookDelta();
    if (Math.abs(dx) > 0.0005) this.lookT = 1.6; else this.lookT = Math.max(0, (this.lookT || 0) - dt);
    if (this.lookT <= 0 && Math.abs(v.speed) > 2) { this.camYaw = dampAngle(this.camYaw, v.yaw + Math.PI, 3, dt); this.camPitch += (-0.18 - this.camPitch) * Math.min(1, dt * 2); }
    const ch = this.character;
    if (ch) {
      ch.root.visible = v.type === 'bike';
      ch.anim.state = 'ride';
      ch.root.position.set(v.pos.x - fx * 0.2, v.pos.y + 0.32, v.pos.z - fz * 0.2);
      ch.root.rotation.y = v.yaw;
      ch.root.rotation.z = v.lean;
      ch.anim.speed = 0;
      ch.update(dt);
    }
    G.weapons.updateShooter(this, dt);
  }
  // ---------------- bricklaying (Mason's Trowel in hand) ----------------
  updateBuild(dt) {
    const G = this.G, I = G.input;
    const p = G.builds.target(this, this.buildPiece, this.camYaw);
    const ok = G.builds.canPlace(p, this) && this.inv.mats.stone >= G.builds.costFor(this, this.buildPiece);
    G.builds.showGhost(p, ok);
    this.buildCd -= dt;
    if (I.firePressed && this.buildCd <= 0 && !G.ui.isOpen()) {
      if (!ok) { G.hud.toast(true, this.inv.mats.stone < G.builds.costFor(this, this.buildPiece) ? `Need ${G.builds.costFor(this, this.buildPiece)} stone — break rocks with a pickaxe` : "Can't lay a wall here"); return; }
      if (G.builds.place(this, p)) { this.buildCd = 1.2; this.character.playAction('hammer', 1.0); }
    }
  }

  // ---------------- camera ----------------
  updateCamera(dt) {
    const G = this.G, cam = G.camera;
    let target, dist, shoulder, fovT;
    if (this.mode === 'plane' && G.match.plane) {
      target = G.match.plane.pos.clone(); dist = 26; shoulder = 0; fovT = 75;
    } else if (this.mode === 'skydive' || this.mode === 'glide') {
      target = this.pos.clone().add(new THREE.Vector3(0, 1.2, 0)); dist = this.mode === 'glide' ? 6 : 5; shoulder = 0; fovT = this.mode === 'skydive' ? 82 : 76;
    } else if (this.mode === 'dead') {
      target = this.pos.clone().add(new THREE.Vector3(0, 1, 0)); dist = 6 + Math.min(4, this.deadT); shoulder = 0; fovT = 70;
      this.camYaw += dt * 0.15;
    } else if (this.mode === 'drive' && this.vehicle) {
      target = this.vehicle.pos.clone().add(new THREE.Vector3(0, this.vehicle.type === 'bike' ? 1.6 : 2.2, 0)); dist = this.vehicle.def.camDist; shoulder = 0; fovT = (G.settings?.fov ?? 72) + Math.min(10, Math.abs(this.vehicle.speed) * 0.4);
    } else if (this.mode === 'extracted' && this.extractCam) {
      target = this.extractCam.clone(); dist = 14; shoulder = 0; fovT = 70;
    } else {
      const eye = this.crouch ? 1.2 : 1.58;
      target = this.pos.clone().add(new THREE.Vector3(0, eye, 0));
      dist = this.ads ? 1.55 : this.buildMode ? 3.6 : this.camDist;
      shoulder = this.ads ? 0.55 : this.shoulder;
      fovT = this.scoped ? (this.gunSt?.zoom ?? 16) : this.ads ? (this.gunSt?.adsFov ?? 52) : (G.settings?.fov ?? 72);
      if (this.sprinting) fovT += 4;
    }
    this.fov = lerp(this.fov, fovT, Math.min(1, dt * 12));
    if (Math.abs(cam.fov - this.fov) > 0.01) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
    const yaw = this.camYaw, pitch = this.camPitch + this.recoilP;
    const d = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const pivot = target.clone().addScaledVector(right, shoulder);
    if (this.scoped) dist = 0.05;
    // collision
    let actual = dist;
    if (this.mode === 'ground' || this.mode === 'vault' || this.mode === 'dead' || this.mode === 'drive') {
      const hit = G.physics.raycast(pivot.x, pivot.y, pivot.z, -d.x, -d.y, -d.z, dist + 0.3, COL.SOLID);
      if (hit) actual = Math.max(0.3, hit.t - 0.3);
    }
    this.camDistActual = actual;
    cam.position.copy(pivot).addScaledVector(d, -actual);
    const gmin = G.world.heightAt(cam.position.x, cam.position.z) + 0.3;
    if (cam.position.y < gmin) cam.position.y = gmin;
    cam.rotation.order = 'YXZ';
    cam.rotation.set(pitch, yaw, 0);
    // a wall right behind the vehicle: rise up and look down at it instead of sitting in the cab
    if (this.mode === 'drive' && actual < dist - 0.5) {
      const lift = Math.min(6, (dist - actual) * 0.8);
      const up = G.physics.raycast(cam.position.x, cam.position.y, cam.position.z, 0, 1, 0, lift + 0.4, COL.SOLID);
      cam.position.y += up ? Math.max(0, up.t - 0.4) : lift;
      cam.lookAt(target);
    }
    if (this.shakeAmt > 0.001) { cam.position.x += (Math.random() - 0.5) * this.shakeAmt * 0.3; cam.position.y += (Math.random() - 0.5) * this.shakeAmt * 0.3; cam.rotation.z = (Math.random() - 0.5) * this.shakeAmt * 0.05; }
    if (this.character && this.mode !== 'drive') this.character.root.visible = this.mode !== 'plane' && !(this.scoped);
    G.audio?.setListener(cam.position.x, cam.position.y, cam.position.z, yaw);
  }
  updateFlashlight(dt) {
    const on = this.flashlight && this.alive && this.mode !== 'plane';
    const s = this.spot;
    s.intensity = on ? 9 : 0;
    if (on) {
      s.position.set(this.pos.x, this.pos.y + 1.5, this.pos.z);
      s.target.position.copy(this.aimPoint);
      s.target.updateMatrixWorld();
    }
  }
}
