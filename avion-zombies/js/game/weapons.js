import * as THREE from '../../vendor/three.module.min.js';
import { WEAPONS, weaponStats } from './weapons_data.js';
import { clamp, lerp, rand, smoothstep, DEG } from '../util.js';
import { audio } from '../engine/audio.js';
import { settings } from '../settings.js';

// Inventory, firing, reloading, ADS, melee and throwables.
const MAX_WEAPONS = 2;

export class WeaponSystem {
  constructor(game) {
    this.game = game;
    this.tmpDir = new THREE.Vector3();
    this.tmpRight = new THREE.Vector3();
    this.tmpUp = new THREE.Vector3();
    this.origin = new THREE.Vector3();
    this.reset();
  }

  reset() {
    this.inv = [];
    this.index = 0;
    this.ads = 0;
    this.adsToggle = false;
    this.fireT = 0;
    this.bloom = 0;
    this.reloading = null;
    this.switchT = 0;
    this.switchPhase = null;
    this.pendingIndex = -1;
    this.meleeT = 0;
    this.throwT = 0;
    this.sprintOut = 0;
    this.triggerHeld = false;
    this.tailPending = null;
    this.cycleT = -1;
    this.frags = 2;
    this.lures = 0;
    this.lastStandBackup = null;
    this.give('merlin', 0, true);
  }

  get cur() {
    return this.inv[this.index];
  }

  currentZoom() {
    const c = this.cur;
    return c ? c.stats.zoom : 1;
  }

  moveMul() {
    const c = this.cur;
    return c ? c.stats.moveMul : 1;
  }

  blocksSprint() {
    return this.meleeT > 0.2 || this.throwT > 0;
  }

  has(id) {
    return this.inv.find((w) => w.id === id);
  }

  makeEntry(id, level) {
    const stats = weaponStats(id, level);
    return { id, level, stats, mag: stats.mag, reserve: stats.reserve };
  }

  // Wall-buy / printer / upgrade station entry point.
  give(id, level = 0, silent = false) {
    if (id === 'lure') {
      this.lures = 3;
      if (!silent) audio.play('mag_pouch', { volume: 0.7 });
      return;
    }
    const owned = this.inv.findIndex((w) => w.id === id);
    const entry = this.makeEntry(id, level);
    if (owned >= 0) {
      this.inv[owned] = entry;
      this.switchTo(owned, true);
    } else if (this.inv.length < MAX_WEAPONS) {
      this.inv.push(entry);
      this.switchTo(this.inv.length - 1, true);
    } else {
      this.inv[this.index] = entry;
      this.switchTo(this.index, true);
    }
    if (!silent) audio.play('ar_charge', { volume: 0.55 });
  }

  refillAmmo(id) {
    const w = id ? this.has(id) : null;
    const list = w ? [w] : this.inv;
    for (const e of list) e.reserve = e.stats.reserve;
  }

  maxAmmo() {
    for (const e of this.inv) {
      e.reserve = e.stats.reserve;
    }
    this.frags = Math.max(this.frags, 4);
  }

  ammoFull(id) {
    const w = this.has(id);
    return w && w.reserve >= w.stats.reserve;
  }

  switchTo(i, immediate = false) {
    if (i < 0 || i >= this.inv.length) return;
    this.cancelReload();
    this.pendingIndex = i;
    this.switchPhase = immediate && !this.game.viewmodel.gun ? 'raise' : 'lower';
    this.switchT = 0;
    if (this.switchPhase === 'raise') this._applyIndex();
  }

  _applyIndex() {
    this.index = this.pendingIndex;
    this.pendingIndex = -1;
    const c = this.cur;
    this.game.viewmodel.setWeapon(c.stats);
    this.fireT = Math.max(this.fireT, 0.1);
    audio.play(c.stats.cls === 'PISTOL' || c.stats.cls === 'REVOLVER' ? 'pistol_check' : 'mag_pouch2', { volume: 0.5 });
    this.game.hud && this.game.hud.weaponChanged(c);
  }

  cycle(dir = 1) {
    if (this.inv.length < 2 || this.game.player.downed) return;
    this.switchTo((this.index + dir + this.inv.length) % this.inv.length);
  }

  cancelReload() {
    if (this.reloading) {
      this.reloading = null;
      this.game.viewmodel.cancelAction();
    }
  }

  startReload() {
    const c = this.cur;
    if (!c || this.reloading || this.switchPhase || this.meleeT > 0) return;
    if (c.mag >= c.stats.mag || c.reserve <= 0) return;
    const speed = this.game.player.perks.has('reload') ? 0.5 : 1;
    const s = c.stats;
    const empty = c.mag === 0;
    if (s.reloadStyle === 'shell') {
      this.reloading = { style: 'shell', t: 0, next: s.reload * speed * 0.6, per: s.reload * speed, empty, seq: [], ending: false };
      this.game.viewmodel.play('shell', s.reload * speed);
      return;
    }
    const dur = (empty ? s.reloadEmpty : s.reload) * speed;
    const seq = s.reloadSeq.filter((e) => e[2] !== 'empty' || empty).map((e) => ({ t: e[0] * speed, name: e[1], done: false }));
    this.reloading = { style: s.reloadStyle || 'mag', t: 0, dur, empty, seq };
    this.game.viewmodel.play(s.reloadStyle === 'revolver' ? 'revolver' : 'reload', dur, { empty });
  }

  _updateReload(dt) {
    const r = this.reloading;
    const c = this.cur;
    if (!r || !c) return;
    r.t += dt;
    for (const e of r.seq) {
      if (!e.done && r.t >= e.t) {
        e.done = true;
        audio.play(e.name, { volume: 0.75, rateVar: 0.03 });
      }
    }
    if (r.style === 'shell') {
      if (r.ending) {
        if (r.t >= r.endAt) this.reloading = null;
        return;
      }
      if (r.t >= r.next) {
        if (c.mag < c.stats.mag && c.reserve > 0) {
          c.mag++;
          c.reserve--;
          audio.play(c.stats.reloadSeq[0][1], { volume: 0.75, rateVar: 0.05 });
          r.next = r.t + r.per;
          this.game.viewmodel.play('shell', r.per);
        }
        if (c.mag >= c.stats.mag || c.reserve <= 0) this._endShellReload();
      }
      return;
    }
    if (r.t >= r.dur) {
      const need = c.stats.mag - c.mag;
      const take = Math.min(need, c.reserve);
      c.mag += take;
      c.reserve -= take;
      this.reloading = null;
    }
  }

  _endShellReload() {
    const r = this.reloading;
    const c = this.cur;
    if (!r || r.ending) return;
    r.ending = true;
    const endSeq = c.stats.reloadEndSeq || [];
    r.seq = endSeq.map((e) => ({ t: r.t + e[0], name: e[1], done: false }));
    r.endAt = r.t + 0.45;
    if (r.empty || c.stats.mode === 'pump' || c.stats.mode === 'lever') this.game.viewmodel.play('cycle', 0.45);
  }

  // Aim assist for pads/touch: slow down over targets and gently pull on ADS.
  aimAssist(input) {
    if (!settings.get('aimAssist') || input.lastDevice === 'kbm') return null;
    const cam = this.game.camera;
    const target = this.game.zombies.bestAimTarget(cam, 8 * DEG, 45);
    if (!target) return { slow: 1, dx: 0, dy: 0 };
    const slow = 0.55;
    let dx = 0;
    let dy = 0;
    if (this.ads > 0.2 && this.ads < 0.98) {
      dx = -target.yawErr * 0.18;
      dy = target.pitchErr * 0.18;
    } else if (input.moveMag > 0.1) {
      dx = -target.yawErr * 0.035;
    }
    return { slow, dx, dy };
  }

  update(dt, input) {
    const game = this.game;
    const player = game.player;
    const c = this.cur;
    if (!c) {
      // empty-handed: you can still knife and throw
      if (this.meleeT > 0) this.meleeT -= dt;
      if (this.throwT > 0) {
        const before = this.throwT;
        this.throwT -= dt;
        if (before > 0.28 && this.throwT <= 0.28) this._release();
      }
      this.ads = 0;
      if (input.pressed.melee && this.meleeT <= 0) this.melee();
      if (input.pressed.lethal && this.frags > 0 && this.throwT <= 0) this._startThrow('frag');
      return;
    }
    const s = c.stats;
    if (this.fireT > 0) this.fireT -= dt;
    if (this.meleeT > 0) this.meleeT -= dt;
    this.bloom = Math.max(0, this.bloom - dt * 6);

    // switching
    if (this.switchPhase) {
      this.switchT += dt;
      if (this.switchPhase === 'lower') {
        game.viewmodel.lower = clamp(this.switchT / 0.2, 0, 1);
        if (this.switchT >= 0.2) {
          this._applyIndex();
          this.switchPhase = 'raise';
          this.switchT = 0;
        }
      } else {
        game.viewmodel.lower = 1 - clamp(this.switchT / 0.28, 0, 1);
        if (this.switchT >= 0.28) {
          this.switchPhase = null;
          game.viewmodel.lower = 0;
        }
      }
    }

    // ADS
    const wantAds = (input.lastDevice === 'touch' ? this.adsToggle : input.held.ads) && !player.sprinting && !this.switchPhase && this.meleeT <= 0 && !player.dead;
    if (input.lastDevice === 'touch' && input.pressed.ads) this.adsToggle = !this.adsToggle;
    const adsSpeed = 1 / (s.adsTime * (player.perks.has('stabilizer') ? 0.7 : 1));
    this.ads = clamp(this.ads + (wantAds ? 1 : -1) * adsSpeed * dt, 0, 1);
    if (s.scope) {
      const scoped = this.ads > 0.92;
      if (scoped !== this._scoped) {
        this._scoped = scoped;
        game.hud.setScope(scoped, s.scope);
      }
    }

    if (player.sprinting) this.sprintOut = 0.18;
    else if (this.sprintOut > 0) this.sprintOut -= dt;

    // throwables
    if (this.throwT > 0) {
      const before = this.throwT;
      this.throwT -= dt;
      if (before > 0.28 && this.throwT <= 0.28) this._release();
    }
    if (!player.downed && !this.switchPhase && this.throwT <= 0 && this.meleeT <= 0) {
      if (input.pressed.lethal && this.frags > 0) this._startThrow('frag');
      else if (input.pressed.tactical && this.lures > 0) this._startThrow('lure');
    }

    // melee
    if (input.pressed.melee && this.meleeT <= 0 && !this.switchPhase && this.throwT <= 0 && !player.downed) this.melee();

    // weapon switch
    if (!player.downed) {
      if (input.pressed.swap) this.cycle(input.wheelDir || 1);
      if (input.pressed.weapon1 && this.index !== 0) this.switchTo(0);
      if (input.pressed.weapon2 && this.inv.length > 1 && this.index !== 1) this.switchTo(1);
    }

    // reload
    if (input.pressed.reload && !game.interact.current) this.startReload();
    this._updateReload(dt);

    // pump / bolt / lever cycling after a shot
    if (this.cycleT > 0) {
      this.cycleT -= dt;
      if (this.cycleT <= 0) {
        if (s.sound.cycle) audio.play(s.sound.cycle, { volume: 0.75, rateVar: 0.04 });
        game.viewmodel.play('cycle', Math.max(0.2, 60 / s.rpm - s.sound.cycleAt));
      }
    }

    // fire
    // a click that starts and ends between two frames still counts as one pull
    const wantFire = (input.held.fire || input.pressed.fire) && !player.dead;
    const edge = input.pressed.fire;
    if (wantFire && this.reloading && this.reloading.style === 'shell' && c.mag > 0 && !this.reloading.ending) this._endShellReload();
    const canFire = !this.switchPhase && !this.reloading && this.meleeT <= 0 && this.throwT <= 0 && this.sprintOut <= 0 && game.viewmodel.lower < 0.1;
    const auto = s.mode === 'auto';
    if (canFire && wantFire && (auto || edge) && this.fireT <= 0) {
      if (c.mag > 0) this.fire();
      else if (edge) {
        audio.play('dryfire', { volume: 0.6 });
        this.fireT = 0.25;
        if (c.reserve > 0) this.startReload();
      }
    }
    // gun tail when the trigger is released on automatics
    if (this.triggerHeld && !wantFire) {
      this.triggerHeld = false;
      if (s.sound.tail) audio.play(s.sound.tail, { volume: s.sound.vol * 0.8, rateVar: 0.03 });
    }
    // auto-reload when empty
    if (c.mag === 0 && c.reserve > 0 && !this.reloading && this.fireT <= 0 && !wantFire && !this.switchPhase) this.startReload();
  }

  fire() {
    const game = this.game;
    const player = game.player;
    const c = this.cur;
    const s = c.stats;
    c.mag--;
    this.fireT = 60 / s.rpm;
    const cam = game.camera;
    const stab = player.perks.has('stabilizer') ? 0.55 : 1;
    // spread
    const moving = Math.min(1, player.speed / 5);
    const airborne = player.ch.grounded ? 0 : 1;
    let spread = lerp(s.spreadHip, s.spreadAds, this.ads) * (1 + moving * 0.6 * (1 - this.ads * 0.7) + airborne * 1.2) + this.bloom * (1 - this.ads * 0.6);
    spread *= stab;
    if (player.downed) spread *= 1.4;
    cam.getWorldDirection(this.tmpDir);
    this.tmpRight.set(1, 0, 0).applyQuaternion(cam.quaternion);
    this.tmpUp.set(0, 1, 0).applyQuaternion(cam.quaternion);
    const origin = this.origin.copy(cam.position);
    // muzzle (approximate in world space) for tracers/light
    const muzzle = cam.position.clone().addScaledVector(this.tmpDir, 0.7).addScaledVector(this.tmpRight, 0.12 * (1 - this.ads)).addScaledVector(this.tmpUp, -0.09 * (1 - this.ads) - 0.03);
    if (s.mode === 'beam') this._beam(origin, this.tmpDir, s, muzzle);
    else {
      const pellets = s.pellets || 1;
      for (let p = 0; p < pellets; p++) {
        const sp = (pellets > 1 ? s.pelletSpread * (1 - this.ads * 0.25) : spread) * DEG;
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * Math.tan(sp);
        const dir = this.tmpDir.clone().addScaledVector(this.tmpRight, Math.cos(a) * r).addScaledVector(this.tmpUp, Math.sin(a) * r).normalize();
        this._shoot(origin, dir, s, muzzle, p === 0 || Math.random() < 0.35);
      }
    }
    // recoil
    const recoil = s.recoil * stab * (1 - this.ads * 0.25);
    player.kickRecoil(recoil * rand(0.75, 1.1), (Math.random() - 0.45) * recoil * 0.55);
    this.bloom = Math.min(6, this.bloom + s.recoil * 0.35);
    game.viewmodel.onFire(Math.min(2.2, 0.35 + s.recoil * 0.3), c.level > 0);
    game.world.muzzleFlash(muzzle, s.cls === 'PISTOL' ? 0.6 : 1);
    if (Math.random() < 0.6) game.particles.muzzleSmoke(muzzle.x, muzzle.y, muzzle.z, this.tmpDir.x, this.tmpDir.y, this.tmpDir.z);
    // sound
    audio.play(s.sound.fire, { volume: s.sound.vol, rate: s.sound.rate, rateVar: 0.035 });
    if (c.level > 0) audio.play('upgrade_layer', { volume: 0.35, rateVar: 0.1 });
    if (s.mode === 'auto') this.triggerHeld = true;
    if ((s.mode === 'pump' || s.mode === 'bolt' || s.mode === 'lever') && c.mag > 0) this.cycleT = s.sound.cycleAt;
    game.noise(player.pos, 40);
  }

  _shoot(origin, dir, s, muzzle, tracer) {
    const game = this.game;
    const maxDist = 180;
    const wh = game.world.physics.raycast(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, maxDist, { bullets: true });
    const limit = wh ? wh.dist : maxDist;
    const hits = game.zombies.raycast(origin, dir, limit);
    let pen = s.pen;
    let dmgMul = 1;
    let end = limit;
    let firstPoint = null;
    for (const h of hits) {
      if (pen <= 0) break;
      const [f0, f1, fmin] = s.range;
      const fall = lerp(1, fmin, smoothstep(f0, f1, h.dist));
      let dmg = s.damage * fall * dmgMul;
      if (h.part === 'head') dmg *= s.headMult * (this.game.player.perks.has('stabilizer') ? 1.25 : 1);
      else if (h.part === 'limb') dmg *= 0.8;
      game.zombies.damage(h.zombie, dmg, { part: h.part, dir, point: h.point, weapon: s, source: 'bullet' });
      if (!firstPoint) firstPoint = h.point;
      pen--;
      dmgMul *= 0.7;
      end = h.dist;
    }
    if (pen > 0 || !hits.length) {
      end = limit;
      if (wh) {
        this._impact(wh, dir);
        if (!firstPoint) firstPoint = new THREE.Vector3(wh.x, wh.y, wh.z);
      }
    }
    if (s.explosive && firstPoint) game.explode(firstPoint, s.explosive, s.damage * 0.7, { small: true, noSelf: true });
    if (tracer) game.particles.tracer(muzzle.x, muzzle.y, muzzle.z, dir.x, dir.y, dir.z, Math.max(2, end - 0.7), this.cur.level ? [1, 0.45, 0.85] : [1, 0.8, 0.5]);
  }

  _impact(hit, dir) {
    const P = this.game.particles;
    const m = hit.material;
    if (m === 'metal') {
      P.sparks(hit.x, hit.y, hit.z, hit.nx, hit.ny, hit.nz, 7);
      if (Math.random() < 0.5) audio.play3D('impact_metal', new THREE.Vector3(hit.x, hit.y, hit.z), { volume: 0.35, refDistance: 2 });
    } else if (m === 'wood') {
      P.dust(hit.x, hit.y, hit.z, hit.nx, hit.ny, hit.nz, [0.38, 0.28, 0.18], 2);
      if (Math.random() < 0.4) audio.play3D('impact_wood', new THREE.Vector3(hit.x, hit.y, hit.z), { volume: 0.35, refDistance: 2 });
    } else if (m === 'dirt') {
      P.dust(hit.x, hit.y, hit.z, hit.nx, hit.ny, hit.nz, [0.28, 0.23, 0.17], 3);
      if (Math.random() < 0.3) audio.play3D('impact_dirt', new THREE.Vector3(hit.x, hit.y, hit.z), { volume: 0.3, refDistance: 2 });
    } else {
      P.dust(hit.x, hit.y, hit.z, hit.nx, hit.ny, hit.nz, [0.5, 0.49, 0.47], 2);
      P.sparks(hit.x, hit.y, hit.z, hit.nx, hit.ny, hit.nz, 2);
    }
  }

  _beam(origin, dir, s, muzzle) {
    const game = this.game;
    const range = s.beamRange || 14;
    const ang = (s.beamAngle || 26) * DEG;
    const victims = game.zombies.inCone(origin, dir, range, ang);
    for (const z of victims) {
      game.zombies.damage(z, s.damage * (z.type === 'bloater' ? 2 : 1), { part: 'torso', dir, point: z.root.position, weapon: s, source: 'microwave' });
    }
    // shimmering cone
    const P = game.particles;
    for (let i = 0; i < 40; i++) {
      const d = rand(0.5, range);
      const r = Math.tan(ang) * d * Math.sqrt(Math.random());
      const a = Math.random() * Math.PI * 2;
      const p = muzzle.clone().addScaledVector(dir, d).addScaledVector(this.tmpRight, Math.cos(a) * r).addScaledVector(this.tmpUp, Math.sin(a) * r);
      P.add.spawn({ x: p.x, y: p.y, z: p.z, vx: dir.x * 4, vy: dir.y * 4 + 0.5, vz: dir.z * 4, life: rand(0.15, 0.35), size: rand(0.05, 0.16), r: 3, g: 1.2, b: 2.2, a: 0.6, a1: 0, cell: 0 });
    }
    game.post && (game.post.u.uEmp.value = Math.max(game.post.u.uEmp.value, 0.25));
    game.player.addShake(0.15, 0.2);
  }

  melee() {
    const game = this.game;
    const player = game.player;
    this.cancelReload();
    this.meleeT = 0.55;
    game.viewmodel.play('melee', 0.45);
    audio.play('melee_swing', { volume: 0.7, rateVar: 0.08 });
    const target = game.zombies.meleeTarget(player.eye, player.forward, 2.4);
    if (target) {
      // lunge toward the target
      const dx = target.root.position.x - player.ch.x;
      const dz = target.root.position.z - player.ch.z;
      const d = Math.hypot(dx, dz) || 1;
      if (d > 1.0) {
        player.ch.vx = (dx / d) * 7;
        player.ch.vz = (dz / d) * 7;
      }
      setTimeout(() => {
        if (!target.alive) return;
        const exo = player.exo.has;
        const dmg = exo ? 240 : 150;
        game.zombies.damage(target, dmg, { part: 'torso', dir: player.forward.clone(), point: target.chestPos(), weapon: null, source: 'melee', knock: exo ? 4 : 2 });
        audio.play('melee_hit', { volume: 0.9, rateVar: 0.08 });
        player.addShake(0.12, 0.15);
      }, 120);
    }
  }

  _startThrow(kind) {
    this.cancelReload();
    this.throwKind = kind;
    this.throwT = 0.55;
    this.game.viewmodel.play('throw', 0.55);
    audio.play('grenade_pin', { volume: 0.6 });
  }

  _release() {
    const game = this.game;
    const cam = game.camera;
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    const pos = cam.position.clone().addScaledVector(dir, 0.5);
    pos.y -= 0.1;
    const vel = dir.clone().multiplyScalar(17).add(new THREE.Vector3(0, 3.5, 0));
    vel.x += game.player.ch.vx * 0.6;
    vel.z += game.player.ch.vz * 0.6;
    if (this.throwKind === 'frag') {
      if (this.frags <= 0) return;
      this.frags--;
    } else {
      if (this.lures <= 0) return;
      this.lures--;
    }
    game.grenades.throw(this.throwKind, pos, vel);
    audio.play('melee_swing', { volume: 0.5, rate: 0.8 });
  }

  enterLastStand() {
    this.cancelReload();
    const pistol = this.inv.find((w) => WEAPONS[w.id].cls === 'PISTOL' || WEAPONS[w.id].cls === 'REVOLVER');
    this.lastStandBackup = { index: this.index };
    if (pistol) {
      this.switchTo(this.inv.indexOf(pistol));
      pistol.mag = pistol.stats.mag;
      pistol.reserve = Math.max(pistol.reserve, pistol.stats.mag * 3);
    } else {
      const temp = this.makeEntry('merlin', 0);
      temp.temp = true;
      this.inv.push(temp);
      this.switchTo(this.inv.length - 1);
    }
  }

  exitLastStand() {
    const tempIdx = this.inv.findIndex((w) => w.temp);
    if (tempIdx >= 0) this.inv.splice(tempIdx, 1);
    const b = this.lastStandBackup;
    this.lastStandBackup = null;
    this.switchTo(b && b.index < this.inv.length ? b.index : 0);
  }
}
