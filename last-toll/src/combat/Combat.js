import * as THREE from 'three';
import { def, makeItem } from '../data/items.js';
import { noise1 } from '../core/rng.js';
import { clamp, damp, rayPointDistance } from '../core/math.js';
import { weaponModel } from '../world/Models.js';

// Combat in the spirit of Saints & Sinners:
//  - Melee power comes from how hard you swing (hold to wind up), scaled by stamina.
//  - Blades must beat the skull to kill; a weak stab glances off.
//  - Blades can lodge in the skull; drag the mouse back to wrench them out.
//  - Grab a walker by the collar with your off hand, then stab up under the jaw.
//  - Guns are loaded by hand, one step at a time. Noise draws the dead.
// Hit resolution works from an origin/direction/power so a VR backend can feed
// real controller motion into the same functions later.

export const SLOTS = ['knife', 'melee', 'sidearm', 'long'];
const ACTION_TIME = { magOut: 0.36, magIn: 0.58, rack: 0.32, clear: 0.5, open: 0.42, load1: 0.3, close: 0.28, pump: 0.4, bolt: 0.5, crank: 1.1, helmet: 0.9 };
const FISTS = { name: 'Fists', kind: 'melee', type: 'blunt', pierce: 0, head: 12, body: 6, reach: 1.2, speed: 0.7, stamina: 6, knock: 0.5, stick: 0 };

const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _r = new THREE.Vector3();
const _u = new THREE.Vector3();
const _t = new THREE.Vector3();
const _q = new THREE.Vector3();

export class Combat {
  constructor(g) {
    this.g = g;
    this.slot = null;
    this.item = null;
    this.d = null;
    this.melee = null;
    this.action = null;
    this.ads = 0;
    this.shotCd = 0;
    this.shoveT = 0;
    this.shoveCd = 0;
    this.grabReach = 0;
    this.held = null;
    this.stuck = null;
    this.holsterT = 0;
    this.pendingSlot = null;
    this.swayX = 0;
    this.swayY = 0;
    this.holdBreath = false;
    this.hint = '';
    this.lookMul = 1;
    this.sprintK = 0;
    this.lookDX = 0;
    this.lookDY = 0;
    this.time = 0;
  }

  get inv() { return this.g.inv; }

  init() {
    const lo = this.inv.loadout;
    const first = ['melee', 'knife', 'sidearm', 'long'].find((s) => lo[s]);
    this.slot = first || 'knife';
    this.item = lo[this.slot] || null;
    this.d = this.item ? def(this.item.id) : null;
    this.g.vm.setWeapon(this.item);
  }

  get isGun() { return this.d && this.d.kind === 'gun'; }
  get busy() { return !!(this.melee || this.action || this.stuck || this.holsterT > 0); }

  // Keep the equipped weapon in sync with the inventory (drops, breaks, pickups).
  refresh() {
    const cur = this.inv.loadout[this.slot] || null;
    if (cur !== this.item) {
      this.item = cur;
      this.d = cur ? def(cur.id) : null;
      this.melee = null;
      this.action = null;
      this.g.vm.setWeapon(cur);
    }
  }

  equipSlot(slot) {
    const lo = this.inv.loadout;
    if (!lo[slot]) {
      this.g.hud.toast(`Nothing on your ${{ knife: 'sheath', melee: 'hip', sidearm: 'holster', long: 'shoulder' }[slot]}`);
      return;
    }
    if (this.slot === slot && this.item === lo[slot]) return;
    if (this.stuck) this.abandonStuck();
    this.melee = null;
    this.action = null;
    this.pendingSlot = slot;
    this.holsterT = 0.001;
  }

  _finishEquip() {
    this.slot = this.pendingSlot;
    this.pendingSlot = null;
    this.item = this.inv.loadout[this.slot] || null;
    this.d = this.item ? def(this.item.id) : null;
    this.g.vm.setWeapon(this.item);
    this.g.audio.mech('holster');
    this.ads = 0;
  }

  cycle(dir) {
    const lo = this.inv.loadout;
    const avail = SLOTS.filter((s) => lo[s]);
    if (avail.length < 2) return;
    let i = avail.indexOf(this.slot);
    i = (i + dir + avail.length) % avail.length;
    this.equipSlot(avail[i]);
  }

  update(dt, input, look) {
    const { player } = this.g;
    this.time += dt;
    this.refresh();
    this.lookMul = 1;
    this.lookDX = look.x;
    this.lookDY = look.y;
    this.shotCd -= dt;
    this.shoveCd -= dt;
    if (this.shoveT > 0) { this.shoveT += dt * 3.2; if (this.shoveT >= 1) this.shoveT = 0; }
    if (this.grabReach > 0) { this.grabReach += dt * 4; if (this.grabReach >= 1) this.grabReach = 0; }
    this.sprintK = damp(this.sprintK, player.sprinting ? 1 : 0, 8, dt);
    this.hint = '';
    if (player.dead) return;

    // weapon selection
    for (let i = 0; i < 4; i++) if (input.wasPressed('Digit' + (i + 1))) this.equipSlot(SLOTS[i]);
    if (input.wheel) this.cycle(input.wheel > 0 ? 1 : -1);
    if (this.holsterT > 0) {
      this.holsterT += dt;
      if (this.holsterT >= 0.2) {
        this.holsterT = 0;
        this._finishEquip();
      }
    }

    // grabbed by the dead: shove to break free
    if (player.grabbed) {
      this.hint = 'Mash V to break free — or put them down';
      if (input.wasPressed('KeyV')) {
        if (player.struggleStep()) {
          this.g.audio.whoosh(1);
          this.g.hud.toast('Broke free');
        }
      }
    }

    if (player.using) {
      this.ads = damp(this.ads, 0, 10, dt);
      return;
    }

    this._updateGrab(dt, input);

    if (this.stuck) {
      this._updateStuck(dt, input, look);
      return;
    }
    if (this.holsterT > 0) return;

    if (!player.grabbed && input.wasPressed('KeyV')) this._shove();

    if (this.isGun) this._updateGun(dt, input);
    else {
      this.ads = damp(this.ads, 0, 10, dt);
      this._updateMelee(dt, input);
    }
    if (this.action) this._updateAction(dt, input);
  }

  // ---- aim helpers ------------------------------------------------------------

  _aim() {
    const cam = this.g.camera;
    cam.getWorldPosition(_o);
    cam.getWorldDirection(_d);
    return { o: _o, d: _d };
  }

  _flatToward(w) {
    const p = this.g.player.pos;
    const dx = w.pos.x - p.x, dz = w.pos.z - p.z;
    const l = Math.hypot(dx, dz) || 1;
    return { x: dx / l, z: dz / l };
  }

  // ---- melee --------------------------------------------------------------------

  _updateMelee(dt, input) {
    const { player, audio } = this.g;
    const d = this.d || FISTS;
    const m = this.melee;
    if (!m) {
      if (input.btnPressed[0]) this.melee = { phase: 'windup', t: 0, charge: 0 };
      return;
    }
    m.t += dt;
    if (m.phase === 'windup') {
      m.charge = clamp(m.t / (0.5 * d.speed), 0, 1);
      if (m.charge >= 1 && !m.fullCue) { m.fullCue = true; }
      if (!input.buttons[0]) {
        const sf = player.staminaFactor;
        let power = (0.62 + 0.43 * m.charge) * sf;
        const cost = d.stamina * (0.7 + 0.6 * m.charge);
        if (player.stamina < cost * 0.5) power *= 0.7;
        if (this.held) power += 0.25;
        player.spendStamina(cost);
        this.melee = { phase: 'strike', t: 0, k: 0, dur: 0.24 * d.speed, power, hit: false, charge: m.charge };
        audio.whoosh(power);
      }
    } else if (m.phase === 'strike') {
      m.k = m.t / m.dur;
      if (!m.hit && m.k >= 0.5) {
        m.hit = true;
        this._resolveMelee(m.power);
        if (!this.melee) return; // stuck or broke
      }
      if (m.k >= 1) this.melee = { phase: 'recover', t: 0, k: 0, dur: 0.22 * d.speed };
    } else if (m.phase === 'recover') {
      m.k = m.t / m.dur;
      if (m.k >= 1) this.melee = null;
    }
  }

  _resolveMelee(power) {
    const { horde, world, audio, fx, player, hud } = this.g;
    const d = this.d || FISTS;
    const { o, d: dir } = this._aim();
    const reach = d.reach + 0.15;
    let hit = null;
    let fromBelow = false;
    if (this.held && !this.held.dead) {
      const w = this.held;
      const hp = w.volumes().head;
      hit = { walker: w, part: 'head', point: hp.clone(), t: hp.distanceTo(o) };
      fromBelow = true;
    } else {
      hit = horde.raycast(o, dir, reach, { pad: 0.07 });
      if (!hit && d.type !== 'stab') {
        const w = horde.nearestInFront(o, dir, reach + 0.15, 0.84);
        if (w) {
          const v = w.volumes();
          const rp = rayPointDistance(o, dir, v.head);
          const part = rp.dist < 0.3 ? 'head' : 'body';
          const pt = part === 'head' ? v.head.clone() : v.neck.clone().lerp(v.hips, 0.4);
          hit = { walker: w, part, point: pt, t: pt.distanceTo(o) };
        }
      }
      // downed walkers: stabbing down at a head on the ground
      if (!hit && dir.y < -0.35) {
        const w = horde.nearestInFront(o, dir, reach + 0.6, 0.7, (x) => x.isDown || x.model.crawler);
        if (w) {
          const hp = w.volumes().head;
          const rp = rayPointDistance(o, dir, hp);
          if (rp.dist < 0.35) hit = { walker: w, part: 'head', point: hp.clone(), t: hp.distanceTo(o) };
        }
      }
    }
    const wall = world.raycast(o.x, o.y, o.z, dir.x, dir.y, dir.z, reach, true);
    if (hit && wall && wall.t < hit.t - 0.1 && !this.held) hit = null;

    this.g.noise(player.pos, 3.5);
    if (hit) {
      const w = hit.walker;
      const f = this._flatToward(w);
      const part = hit.part === 'arm' ? 'body' : hit.part === 'leg' && d.type === 'stab' ? 'body' : hit.part;
      const info = {
        part,
        damage: part === 'head' ? d.head * power : d.body * power,
        kind: d.type,
        power,
        pierce: d.pierce,
        sever: d.sever,
        heavy: d.heavy,
        knock: d.knock,
        dirX: f.x, dirZ: f.z,
        fromBelow,
        point: hit.point,
        weapon: this.item ? this.item.id : 'fists',
      };
      const res = horde.damage(w, info);
      const r = res.result;
      this.g.onAggro?.();
      if (r === 'deflect') { audio.meleeHit('deflect', hit.point, power); hud.toast('The helmet turns the blow — grab and stab under the chin'); }
      else if (r === 'glance') { audio.meleeHit('deflect', hit.point, 0.4); hud.toast('Not enough force — wind up the stab'); }
      else if (r === 'kill' || r === 'decap') audio.meleeHit(d.type === 'stab' ? 'stab' : d.type === 'chop' ? 'slash' : 'crack', hit.point, power);
      else if (r === 'helmetOff') { audio.meleeHit('deflect', hit.point, 1); hud.toast('Helmet knocked loose'); }
      else audio.meleeHit(d.type === 'chop' ? 'slash' : 'thud', hit.point, power);
      if (r === 'kill' || r === 'decap') hud.hit(true);
      else hud.hit(false);
      player.shake = Math.max(player.shake, 0.18 + power * 0.1);
      this._wear(r === 'deflect' ? 2 : 1);
      if ((r === 'kill') && this.item && d.stick > 0 && (d.type === 'stab' || d.type === 'chop') && Math.random() < d.stick) {
        this._enterStuck(w);
      }
    } else if (wall) {
      audio.meleeHit('wall', _t.set(o.x + dir.x * wall.t, o.y + dir.y * wall.t, o.z + dir.z * wall.t), power);
      fx.dust(_t, _q.set(wall.nx, wall.ny, wall.nz), 5);
      player.shake = Math.max(player.shake, 0.2);
      this._wear(1);
    }
  }

  _wear(n) {
    const it = this.item;
    if (!it || it.dur === undefined) return;
    it.dur = Math.max(0, it.dur - n);
    if (it.dur <= 0 && this.d.kind === 'melee') {
      this.g.audio.weaponBreak();
      this.g.hud.toast(`Your ${this.d.name.toLowerCase()} broke`);
      this.inv.loadout[this.slot] = null;
      this.inv.changed();
      this.melee = null;
      this.stuck = null;
      this.refresh();
    }
  }

  // ---- stuck blade ---------------------------------------------------------------

  _enterStuck(w) {
    this.stuck = { walker: w, pull: 0, t: 0, sag: 0 };
    this.melee = null;
    this.g.hud.toast('Stuck in the skull — hold click and drag back to pull it free');
  }

  _updateStuck(dt, input, look) {
    const s = this.stuck;
    const { player, audio, fx } = this.g;
    s.t += dt;
    s.sag = Math.min(1, s.t * 1.4);
    if (input.buttons[0]) s.pull += Math.max(0, look.rawY) * 0.0042;
    if (input.btnPressed[0]) s.pull += 0.28;
    s.pull = Math.max(0, s.pull - dt * 0.15);
    this.lookMul = 0.25;
    this.hint = 'Hold click and drag down (or mash click) to pull it free · 1-4 to let go';
    // the falling body drags your aim down with it
    const hp = s.walker.volumes().head;
    const dy = hp.y - player.eye.y, dh = Math.hypot(hp.x - player.eye.x, hp.z - player.eye.z);
    const want = Math.atan2(dy, dh);
    player.pitch += (want - player.pitch) * Math.min(1, dt * 2.5) * 0.5;
    if (s.pull >= 1) {
      audio.pullOut(hp);
      fx.blood(hp, 12, 1);
      this.stuck = null;
      this.melee = { phase: 'recover', t: 0, k: 0, dur: 0.3 };
      player.shake = Math.max(player.shake, 0.25);
      this._wear(1);
    }
  }

  abandonStuck() {
    const s = this.stuck;
    if (!s) return;
    this.stuck = null;
    const item = this.inv.loadout[this.slot];
    if (!item) return;
    this.inv.loadout[this.slot] = null;
    this.inv.changed();
    const d = def(item.id);
    const mesh = weaponModel(item.id);
    if (d.slot === 'knife') {
      mesh.position.set(0, 0.16, 0.2);
      mesh.rotation.set(0.15, 0, 0);
    } else {
      mesh.rotation.set(-Math.PI / 2, 0, 0);
      mesh.position.set(0, 0.2 + 0.3, 0.55);
    }
    s.walker.model.headGroup.add(mesh);
    const loot = this.g.loot;
    const extra = loot.addExtra({
      label: `Pull out the ${d.name}`,
      radius: 0.4,
      getPos: (v) => s.walker.model.headCenter.getWorldPosition(v),
      onUse: () => {
        const r = this.inv.pickup(item);
        if (!r.ok) { this.g.hud.toast('No room to carry it'); return false; }
        mesh.parent?.remove(mesh);
        loot.removeExtra(extra);
        this.g.audio.pullOut(s.walker.pos);
        return true;
      },
    });
    this.g.hud.toast(`Left the ${d.name.toLowerCase()} in the skull — [E] to retrieve`);
  }

  // ---- off-hand grab ---------------------------------------------------------------

  _updateGrab(dt, input) {
    const { player, horde, audio, hud } = this.g;
    const meleeMode = !this.d || this.d.kind === 'melee';
    const oneHanded = meleeMode || (this.d && this.d.kind === 'gun' && !this.d.twoHanded);
    const held = input.isDown('KeyQ') || (meleeMode && input.buttons[2]);
    const pressed = input.wasPressed('KeyQ') || (meleeMode && input.btnPressed[2]);
    if (!this.held) {
      if (pressed && oneHanded && !this.stuck) {
        this.grabReach = 0.001;
        const { o, d } = this._aim();
        const w = horde.nearestInFront(o, d, 2.0, 0.72, (x) => x.canAct && !x.model.crawler && x.state !== 'held');
        if (w) this._startHold(w);
        else audio.whoosh(0.3);
      } else if (pressed && !oneHanded) hud.toast('Both hands are on the long gun');
      return;
    }
    const w = this.held;
    if (w.dead) { this._dropHold(); return; }
    if (!held || player.stamina <= 0.5) {
      this._releaseHold(player.stamina <= 0.5);
      return;
    }
    // hold them at arm's length
    const f = { x: -Math.sin(player.yaw), z: -Math.cos(player.yaw) };
    const tx = player.pos.x + f.x * 0.95, tz = player.pos.z + f.z * 0.95;
    w.pos.x += (tx - w.pos.x) * Math.min(1, dt * 12);
    w.pos.z += (tz - w.pos.z) * Math.min(1, dt * 12);
    this.g.world.resolveCircle(w.pos, 0.26);
    w.facing = Math.atan2(player.pos.x - w.pos.x, player.pos.z - w.pos.z);
    player.spendStamina((w.riot ? 13 : 9.5) * dt);
    player.speedMul = 0.5;
    if (!this.hint) this.hint = w.helmet ? 'Click: stab under the chin · E: rip off helmet · release Q: shove' : 'Click: stab under the chin · release Q: shove away';
  }

  _startHold(w) {
    const { player, audio } = this.g;
    if (w.state === 'grab') player.releaseGrabber(w);
    w.setState('held');
    w.vel.set(0, 0, 0);
    this.held = w;
    player.heldWalker = w;
    audio.snarl(w.pos);
  }

  _dropHold() {
    this.held = null;
    this.g.player.heldWalker = null;
    this.g.player.speedMul = 1;
  }

  _releaseHold(exhausted) {
    const w = this.held;
    this._dropHold();
    if (!w || w.dead) return;
    if (exhausted) {
      w.setState('lunge');
      w.t = 0.45;
      w.attackCd = 0;
      this.g.hud.toast('Too tired to hold it back');
    } else {
      const f = this._flatToward(w);
      w.setState('chase');
      w.shove(f.x, f.z, 1.05, 0.95);
      this.g.audio.whoosh(0.8);
      this.g.player.spendStamina(6);
    }
  }

  onHeldDied(w) {
    if (this.held === w) this._dropHold();
  }

  ripHelmet() {
    const w = this.held;
    if (!w || !w.helmet || this.action) return false;
    this._startAction('helmet');
    return true;
  }

  // ---- shove ---------------------------------------------------------------------

  _shove() {
    const { player, horde, audio } = this.g;
    if (this.shoveCd > 0 || this.held) return;
    if (player.stamina < 6) { audio.breath(1.3); return; }
    player.spendStamina(14);
    this.shoveT = 0.001;
    this.shoveCd = 0.6;
    audio.whoosh(0.7);
    let any = false;
    const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
    for (const w of horde.walkers) {
      if (w.dead || w.isDown) continue;
      const dx = w.pos.x - player.pos.x, dz = w.pos.z - player.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 1.9) continue;
      if ((dx * fx + dz * fz) / (dist || 1) < 0.4) continue;
      w.shove(dx / dist, dz / dist, 1.0, 1.0);
      any = true;
    }
    if (any) audio.meleeHit('thud', player.pos, 0.5);
  }

  // ---- guns -----------------------------------------------------------------------

  _updateGun(dt, input) {
    const { player, audio } = this.g;
    const d = this.d, it = this.item, g = it.gun;
    const wantAds = input.buttons[2] && !player.sprinting && !this.action && !this.held;
    this.ads = damp(this.ads, wantAds ? 1 : 0, 9, dt);
    this.holdBreath = this.ads > 0.6 && input.isDown('ShiftLeft') && player.stamina > 4;
    if (this.holdBreath) player.spendStamina(16 * dt);
    // weapon sway: breathing, fatigue, motion
    const moving = Math.hypot(player.vel.x, player.vel.z) / 3;
    let amp = 0.0035 + (1 - player.staminaFactor) * 0.012 + moving * 0.004 + (player.stamina < 20 ? 0.004 : 0);
    if (this.holdBreath) amp *= 0.15;
    if (this.ads < 0.5) amp *= 2.2;
    const t = this.time;
    this.swayX = noise1(t * 0.9) * amp + Math.sin(t * 1.3) * amp * 0.4;
    this.swayY = noise1(t * 0.7 + 50) * amp * 0.8 + Math.sin(t * 2.6) * amp * 0.35;

    if (input.btnPressed[0] && this.shotCd <= 0 && !this.action) this._fire();
    if ((input.wasPressed('KeyR') || (input.isDown('KeyR') && !this.action)) && !this.action) {
      const next = this._nextReload(input.wasPressed('KeyR'));
      if (next) this._startAction(next);
    }
    this.hint = this.hint || this._gunHint();
  }

  _gunHint() {
    const d = this.d, g = this.item.gun;
    if (this.item.dur <= 0) return 'Broken — repair it at the workbench';
    if (g.chamber === 'jam') return 'Jammed — R to clear';
    switch (d.action) {
      case 'mag':
        if (!g.magIn) return 'R — insert magazine';
        if (g.chamber !== 'live' && g.loaded > 0) return 'R — rack the slide';
        if (g.chamber !== 'live' && this.inv.count(d.ammo) > 0) return 'R — drop the magazine';
        return '';
      case 'cyl':
        if (g.open) return this.inv.count(d.ammo) > 0 && g.loaded < d.cap ? 'R — load a round · click to close' : 'R — close cylinder';
        if (g.loaded === 0 && this.inv.count(d.ammo) > 0) return 'R — swing out the cylinder';
        return '';
      case 'pump':
        if (g.chamber === 'spent' || (g.chamber === 'empty' && g.loaded > 0)) return 'R — pump';
        if (g.chamber === 'empty' && this.inv.count(d.ammo) > 0) return 'R — load a shell';
        return '';
      case 'bolt':
        if (g.chamber === 'spent' || (g.chamber === 'empty' && g.loaded > 0)) return 'R — work the bolt';
        if (g.chamber === 'empty' && this.inv.count(d.ammo) > 0) return 'R — load a round';
        return '';
      case 'xbow':
        if (g.loaded === 0) return this.inv.count(d.ammo) > 0 ? 'R — crank and load a bolt' : 'No bolts';
        return '';
    }
    return '';
  }

  _nextReload(explicit) {
    const d = this.d, g = this.item.gun, hud = this.g.hud;
    const avail = this.inv.count(d.ammo);
    const ammoName = def(d.ammo).name;
    switch (d.action) {
      case 'mag':
        if (g.chamber === 'jam') return 'clear';
        if (!g.magIn) return 'magIn';
        if (g.chamber !== 'live' && g.loaded > 0) return 'rack';
        if (g.loaded < d.cap && avail > 0) return 'magOut';
        if (explicit && avail === 0 && g.loaded < d.cap) hud.toast(`No ${ammoName} in your pack`);
        return null;
      case 'cyl':
        if (!g.open) {
          if (g.spent > 0 || (g.loaded < d.cap && avail > 0)) return 'open';
          if (explicit && avail === 0 && g.loaded < d.cap) hud.toast(`No ${ammoName} in your pack`);
          return null;
        }
        if (g.loaded < d.cap && avail > 0) return 'load1';
        return 'close';
      case 'pump':
      case 'bolt':
        if (g.chamber === 'spent' || g.chamber === 'jam' || (g.chamber === 'empty' && g.loaded > 0)) return d.action;
        if (g.loaded < d.cap && avail > 0) return 'load1';
        if (explicit && avail === 0 && g.chamber !== 'live') hud.toast(`No ${ammoName} in your pack`);
        return null;
      case 'xbow':
        if (g.loaded === 0 && avail > 0) return 'crank';
        if (explicit && avail === 0) hud.toast('No bolts');
        return null;
    }
    return null;
  }

  _startAction(name) {
    let dur = ACTION_TIME[name] || 0.4;
    if (name === 'load1' && this.d && this.d.action === 'pump') dur = 0.42;
    this.action = { name, t: 0, dur, k: 0 };
    const a = this.g.audio;
    if (name === 'magOut') a.mech('magOut');
    if (name === 'crank') a.mech('crank');
    if (name === 'open') a.mech('cylOpen');
  }

  _updateAction(dt, input) {
    const a = this.action;
    a.t += dt;
    a.k = Math.min(1, a.t / a.dur);
    if (a.k < 1) return;
    this.action = null;
    this._completeAction(a.name);
    // holding R chains the next step
    if (this.isGun && input.isDown('KeyR') && a.name !== 'helmet') {
      const next = this._nextReload(false);
      if (next && !(next === 'close' && a.name === 'close')) this._startAction(next);
    }
  }

  _completeAction(name) {
    const { audio, fx, hud } = this.g;
    if (name === 'helmet') {
      const w = this.held;
      if (w && w.helmet) {
        w.helmet = false;
        w.model.removeHelmet();
        audio.meleeHit('deflect', w.pos, 0.6);
        hud.toast('Helmet off');
      }
      return;
    }
    const d = this.d, it = this.item;
    if (!it || !it.gun) return;
    const g = it.gun;
    switch (name) {
      case 'magOut':
        g.magIn = false;
        break;
      case 'magIn': {
        const got = this.inv.take(d.ammo, d.cap - g.loaded);
        g.loaded += got;
        g.magIn = true;
        audio.mech('magIn');
        break;
      }
      case 'rack':
      case 'clear':
        if (g.loaded > 0 && g.magIn) { g.loaded--; g.chamber = 'live'; } else g.chamber = 'empty';
        audio.mech('rack');
        break;
      case 'open':
        if (g.spent > 0) audio.mech('eject');
        g.spent = 0;
        g.open = true;
        break;
      case 'load1':
        if (this.inv.take(d.ammo, 1)) {
          g.loaded++;
          audio.mech(d.action === 'pump' ? 'shell' : 'round');
        }
        break;
      case 'close':
        g.open = false;
        audio.mech('cylClose');
        break;
      case 'pump':
      case 'bolt': {
        const wasSpent = g.chamber === 'spent' || g.chamber === 'jam';
        if (g.loaded > 0) { g.loaded--; g.chamber = 'live'; } else g.chamber = 'empty';
        audio.mech(name);
        if (wasSpent) this._ejectBrass(d.action === 'pump' ? 0xa02a20 : 0xb08d3a);
        break;
      }
      case 'crank':
        if (this.inv.take(d.ammo, 1)) g.loaded = 1;
        break;
    }
  }

  _ejectBrass() {
    const cam = this.g.camera;
    cam.getWorldPosition(_t);
    cam.getWorldDirection(_d);
    _r.set(-_d.z, 0, _d.x).normalize();
    _t.addScaledVector(_d, 0.4).addScaledVector(_r, 0.12);
    _t.y -= 0.12;
    this.g.fx.brass(_t, _r.clone().multiplyScalar(2 + Math.random()).add(new THREE.Vector3(0, 2, 0)));
  }

  _fire() {
    const { player, audio, fx, hud, vm } = this.g;
    const d = this.d, it = this.item, g = it.gun;
    let ready = false;
    if (d.action === 'mag') ready = g.magIn && g.chamber === 'live';
    else if (d.action === 'pump' || d.action === 'bolt') ready = g.chamber === 'live';
    else if (d.action === 'cyl') {
      if (g.open) { this._startAction('close'); return; }
      ready = g.loaded > 0;
    } else if (d.action === 'xbow') ready = g.loaded > 0;
    if (!ready) {
      audio.dryFire();
      this.shotCd = 0.2;
      const h = this._gunHint();
      if (h) hud.toast(h);
      return;
    }
    // worn guns jam
    const durK = it.dur / d.dur;
    if (d.action !== 'xbow' && d.action !== 'cyl' && (it.dur <= 0 || (durK < 0.35 && Math.random() < (0.35 - durK) * 0.35))) {
      g.chamber = 'jam';
      audio.mech('jam');
      hud.toast(it.dur <= 0 ? 'The action is shot — repair it at the workbench' : 'Jammed! R to clear it');
      this.shotCd = 0.3;
      return;
    }
    // cycle the action
    if (d.action === 'mag') {
      if (g.loaded > 0) { g.loaded--; g.chamber = 'live'; } else g.chamber = 'empty';
      this._ejectBrass();
    } else if (d.action === 'pump' || d.action === 'bolt') g.chamber = 'spent';
    else if (d.action === 'cyl') { g.loaded--; g.spent++; }
    else if (d.action === 'xbow') g.loaded = 0;
    it.dur = Math.max(0, it.dur - 1);
    let suppressed = false;
    if (it.sup) {
      suppressed = true;
      it.sup -= 1;
      if (it.sup <= 0) {
        delete it.sup;
        hud.toast('The suppressor is spent');
        vm.updateSuppressor(it);
      }
    }
    this.shotCd = d.rate;

    // shoot
    const cam = this.g.camera;
    cam.getWorldPosition(_o);
    cam.getWorldDirection(_d);
    _r.set(-_d.z, 0, _d.x).normalize();
    _u.crossVectors(_r, _d).normalize();
    const moving = Math.hypot(player.vel.x, player.vel.z) / 3;
    const base = this.ads > 0.6 ? d.spreadAds : d.spreadHip;
    const spreadDeg = base + moving * (this.ads > 0.6 ? 0.6 : 1.6) + (1 - player.staminaFactor) * 1.2;
    const origin = _o.clone();
    for (let i = 0; i < d.pellets; i++) {
      const dir = _d.clone().addScaledVector(_r, this.swayX).addScaledVector(_u, -this.swayY);
      const s = THREE.MathUtils.degToRad(spreadDeg + (d.pelletSpread || 0)) * Math.sqrt(Math.random());
      const a = Math.random() * Math.PI * 2;
      dir.addScaledVector(_r, Math.cos(a) * s).addScaledVector(_u, Math.sin(a) * s).normalize();
      this._shot(origin, dir, i === 0);
    }

    // feedback
    const recoil = THREE.MathUtils.degToRad(d.recoil) * (this.ads > 0.6 ? 0.75 : 1);
    player.kick.pitch += recoil;
    player.kick.yaw += (Math.random() - 0.5) * recoil * 0.5;
    player.pitch += recoil * 0.35;
    player.shake = Math.max(player.shake, d.recoil / 12);
    vm.kick(d.recoil * 0.35);
    if (d.action === 'xbow') audio.crossbow(origin);
    else {
      audio.gunshot(d.id || it.id, origin, suppressed);
      vm.muzzle(suppressed ? 0.35 : 1);
      fx.muzzleFlash(_t.copy(origin).addScaledVector(_d, 0.8), suppressed ? 0.25 : 1);
    }
    this.g.noise(player.pos, suppressed ? 9 : d.noise, { alarm: !suppressed && d.noise > 40 });
    if (!suppressed && d.action !== 'xbow') this.g.onAggro?.();
  }

  _shot(o, dir, primary) {
    const { world, horde, fx, audio, hud, loot } = this.g;
    const d = this.d;
    const wh = world.raycast(o.x, o.y, o.z, dir.x, dir.y, dir.z, 160, true);
    const maxT = wh ? wh.t : 160;
    const pen = d.penetrate || 1;
    const exclude = new Set();
    let hitAny = false;
    for (let k = 0; k < pen; k++) {
      const h = horde.raycast(o, dir, maxT, { exclude });
      if (!h) break;
      exclude.add(h.walker);
      hitAny = true;
      const w = h.walker;
      const part = h.part === 'arm' ? 'body' : h.part;
      let dmg = part === 'head' ? d.headDmg : part === 'leg' ? d.legDmg : d.bodyDmg;
      if (d.pellets > 1) dmg *= clamp(1.25 - h.t / 16, 0.3, 1);
      const len = Math.hypot(dir.x, dir.z) || 1;
      const res = horde.damage(w, {
        part, damage: dmg, kind: 'bullet', power: 1, pierce: 0, knock: 0.3,
        dirX: dir.x / len, dirZ: dir.z / len, armorPierce: d.armorPierce, point: h.point,
      });
      if (res.result === 'deflect') {
        audio.meleeHit('deflect', h.point, 0.6);
        if (primary) hud.toast('Rounds glance off the riot helmet');
      } else audio.impact(h.point, 'flesh');
      hud.hit(res.result === 'kill' || res.result === 'decap');
      if (d.retrievable) this._lodgeBolt(w, h.point);
      if (res.result === 'deflect') break;
    }
    if (!hitAny && wh) {
      const p = new THREE.Vector3(o.x + dir.x * wh.t, o.y + dir.y * wh.t, o.z + dir.z * wh.t);
      const n = new THREE.Vector3(wh.nx, wh.ny, wh.nz);
      if (d.retrievable) {
        loot.spawnItem(makeItem('bolt', 1), p.clone().addScaledVector(n, 0.05), Math.atan2(dir.x, dir.z));
      } else {
        fx.impact(p, n, 'hard');
        if (primary) audio.impact(p, 'hard');
      }
    }
  }

  _lodgeBolt(w, point) {
    const L = this.g.loot;
    const local = w.root.worldToLocal(point.clone());
    const holder = new THREE.Object3D();
    holder.position.copy(local);
    w.root.add(holder);
    const extra = L.addExtra({
      label: 'Recover crossbow bolt',
      radius: 0.35,
      getPos: (v) => holder.getWorldPosition(v),
      onUse: () => {
        const left = this.inv.add(makeItem('bolt', 1));
        if (left) { this.g.hud.toast('No room for the bolt'); return false; }
        L.removeExtra(extra);
        w.root.remove(holder);
        this.g.audio.pullOut(w.pos);
        return true;
      },
    });
  }

  // ---- state for the view model / HUD ---------------------------------------------------

  vmState() {
    const p = this.g.player;
    const g = this.item && this.item.gun;
    let melee = null;
    if (this.stuck) melee = { phase: 'stuck', pull: this.stuck.pull, sag: this.stuck.sag };
    else if (this.melee) melee = { phase: this.melee.phase, k: this.melee.k || 0, charge: this.melee.charge || 0 };
    return {
      melee,
      ads: this.ads,
      action: this.action ? { name: this.action.name, k: this.action.k } : p.using ? { name: 'use', k: Math.min(1, p.using.t / p.using.dur) } : null,
      holding: !!this.held,
      grabReach: this.grabReach,
      shove: this.shoveT,
      struggle: p.grabbed,
      sprint: this.sprintK,
      bob: p.bob,
      bobAmt: p.bobAmt,
      lookDX: this.lookDX,
      lookDY: this.lookDY,
      swayX: this.isGun ? this.swayX : 0,
      swayY: this.isGun ? this.swayY : 0,
      loaded: g ? g.loaded : 0,
      magIn: g ? g.magIn : true,
      slideBack: !!(g && this.d.action === 'mag' && g.chamber === 'empty'),
      cylOpen: !!(g && g.open),
      flashlight: p.flashlightOn,
      indoors: this.g.world.isIndoors(p.pos.x, p.pos.z),
      holster: this.holsterT > 0 ? this.holsterT / 0.2 : 0,
    };
  }
}
