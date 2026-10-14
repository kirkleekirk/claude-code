// The exo suit: this game's own, after Call of Duty: Advanced Warfare's. Worn in the armor slot
// (made with the alien ship's Advanced Chips), it moves you as an exo moves its wearer:
//
//   Boost Jump     jump again in the air, and the thrusters on its back fire you up as high
//                  again (once a jump, falling or rising: it takes a fall's speed off too)
//   Boost Dodge    Shift (L3 on a pad): a burst of thrust the way you're moving (forward when
//                  you aren't), on the ground or in the air. Two charges, each back in a second
//                  and a half.
//   Boost Slam     C or Ctrl (R3) in the air, two metres or more off the ground: straight down,
//                  fast. Where you land the ground shakes and the dead round it are hurt, the
//                  more the higher you came from; the fall does you no harm.
//   Exo Overclock  X (the d-pad's down): half as fast again, for as long as its battery lasts
//                  (five seconds full; it charges again once you're done)
//
// Its legs take a landing of up to 20 m/s (a fall of ten metres) without harm. Like any armor, it
// takes its share of what hurts you, and wears as it does (see Game.armorGuard).
//
// Online, everyone sees it on you, and the flames of your boosts. A slam's landing goes to every
// machine, as an explosion does: each hurts its own dead with it, the kill yours, and with PVP
// on, its own player if they're near.

import * as THREE from 'three';
import { SOLID } from '../world/blocks.js';

// a boost jump: this much up, from no worse than standing still (three metres more)
const BOOST_JUMP = 11;
// a dodge: this fast for a moment, then less to nothing (about three metres); its charges, and
// how long each takes to come back
const DODGE_SPEED = 18, DODGE_HOLD = 0.12, DODGE_FADE = 0.1, DODGE_CHARGES = 2, DODGE_RECHARGE = 1.5;
// a slam: how fast down, how high up it has to start, and how far round its landing it reaches
const SLAM_SPEED = 30, SLAM_MIN = 2, SLAM_R = 4;
// overclock: how much faster; the battery (out of 100) it uses a second, gets back a second, and
// how long after it's done before that starts
const OC_SPEED = 1.5, OC_DRAIN = 20, OC_CHARGE = 12.5, OC_WAIT = 1.5;
// a landing it takes without harm, worn
const FALL_SAFE = 20;
// its boosts, as sent online
export const BOOST = { jump: 0, dash: 1, slam: 2, land: 3 };
const KIND = ['jump', 'dash', 'slam', 'land'];

const _f = new THREE.Vector3(), _v = new THREE.Vector3();

export class Exo {
  constructor(game) {
    this.game = game;
    this.worn = false;
    // the dodge's push, added to the player's own way of going (m/s, level)
    this.push = new THREE.Vector3();
    this.pushDir = new THREE.Vector3();
    this.pushT = Infinity;
    this.charges = DODGE_CHARGES;
    this.chargeT = 0;
    // the boost jump, used since you left the ground; a slam on its way down, and from how high
    this.boosted = false;
    this.slam = false;
    this.slamFrom = 0;
    this.battery = 100;
    this.batteryWait = 0;
    this.overclock = false;
  }

  get speed() { return this.overclock ? OC_SPEED : 1; }
  get slamSpeed() { return SLAM_SPEED; }
  get fallSafe() { return FALL_SAFE; }

  // (a new start: a respawn, a teleport)
  reset() {
    this.push.set(0, 0, 0);
    this.pushT = Infinity;
    this.slam = false;
    this.boosted = false;
    this.overclock = false;
  }

  // Every frame, before the player moves: whether one's worn, and its controls (input: null
  // when the player isn't at them).
  update(dt, input) {
    const g = this.game, p = g.player;
    const worn = g.inventory.armorItem?.armor === 'exo';
    if (worn !== this.worn) {
      this.worn = worn;
      if (!worn) this.reset();
      g.puppet?.setExo?.(worn);
      g.viewModel.setExo?.(worn);
      g.app.touch?.setExo?.(worn);
    }
    p.exo = worn && !p.dead && !p.carried && !p.noclip ? this : null;
    // the dodge's charges and the battery come back whether it's worn or not
    if (this.charges < DODGE_CHARGES && (this.chargeT -= dt) <= 0) {
      this.charges++;
      this.chargeT = this.charges < DODGE_CHARGES ? DODGE_RECHARGE : 0;
    }
    if (this.overclock) {
      this.battery = Math.max(0, this.battery - OC_DRAIN * dt);
      if (this.battery <= 0 || !p.exo) this.setOverclock(false);
    } else if ((this.batteryWait -= dt) <= 0) this.battery = Math.min(100, this.battery + OC_CHARGE * dt);
    // the dodge's push: all of it a moment, then less to nothing
    this.pushT += dt;
    const t = this.pushT, k = t < DODGE_HOLD ? 1 : Math.max(0, 1 - (t - DODGE_HOLD) / DODGE_FADE);
    this.push.copy(this.pushDir).multiplyScalar(DODGE_SPEED * k);
    if (!p.exo) { this.slam = false; this.push.set(0, 0, 0); return; }
    if (p.onGround && !this.slam) this.boosted = false;
    if (!input) return;
    if (input.consume('sprint')) this.dodge(input);
    if (input.consume('crouch')) this.startSlam();
    if (input.consume('ability') || input.consume('down')) this.setOverclock(!this.overclock);
  }

  // ---- the boosts ----

  // jump pressed in the air (from Player.update)
  boostJump(p) {
    if (this.boosted || this.slam) return;
    this.boosted = true;
    p.vel.y = Math.max(p.vel.y, 0) + BOOST_JUMP;
    p.fallStart = null;
    this.fire('jump');
  }

  dodge(input) {
    const p = this.game.player;
    if (this.charges < 1 || this.slam) return;
    // the way you're going, in the world (forward when you aren't)
    let mx = input.move.x, my = input.move.y;
    if (Math.hypot(mx, my) < 0.2) { mx = 0; my = 1; }
    const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
    this.pushDir.set(-sy * my + cy * mx, 0, -cy * my - sy * mx).normalize();
    this.pushT = 0;
    if (this.charges === DODGE_CHARGES) this.chargeT = DODGE_RECHARGE;
    this.charges--;
    // (in the air it holds you up a moment)
    if (!p.onGround) p.vel.y = Math.max(p.vel.y, 0);
    this.fire('dash', this.pushDir);
  }

  startSlam() {
    const g = this.game, p = g.player;
    if (p.onGround || this.slam) return;
    const hit = g.world.raycast(p.pos.x, p.pos.y + 0.05, p.pos.z, 0, -1, 0, 64, (id) => SOLID[id] === 1);
    if (hit && hit.dist < SLAM_MIN) return;
    this.slam = true;
    this.slamFrom = p.pos.y;
    this.pushT = Infinity;
    this.fire('slam');
  }

  // The player's come down (from Player.update): a slam's landing, if it was one (true: no harm
  // from the fall).
  landed(p) {
    if (!this.slam) return false;
    this.slam = false;
    const h = Math.max(0, this.slamFrom - p.pos.y);
    const at = p.pos.clone();
    this.slamHit(at, h, this.game.online?.myId ?? 0);
    this.fire('land', null, at, h);
    return true;
  }

  // A slam came down at `at`, from h metres up (anyone's: by is whose): the dead round it are
  // hurt by it, the more the nearer and the higher it came from; and with PVP on, this player
  // if they're near and it's someone else's.
  slamHit(at, h, by) {
    const g = this.game;
    const power = 2 + 0.6 * Math.min(h, 30);
    for (const e of g.enemies?.list || []) {
      if (e.dead || e.gone) continue;
      const dy = e.pos.y - at.y, d = Math.hypot(e.pos.x - at.x, e.pos.z - at.z);
      if (d >= SLAM_R || dy < -1.5 || dy > 2.5) continue;
      if (e.takeExplosiveDamage(power * (1 - 0.5 * d / SLAM_R))) g.killedBy(e, by, 'exo_suit');
    }
    const p = g.player;
    if (g.online && g.pvp && by !== g.online.myId && !p.dead && p.pos.distanceTo(at) < SLAM_R) p.hurt(0.25 * p.maxHealth, at, 'pvp');
  }

  setOverclock(on) {
    const g = this.game, p = g.player;
    if (on && (!p.exo || this.battery < 10)) { g.audio?.ui?.('deny'); return; }
    if (on === this.overclock) return;
    this.overclock = on;
    if (!on) this.batteryWait = OC_WAIT;
    // (the view's a little wider meanwhile: Game.update)
    g.audio?.play?.('Beep', null, 0.5, { rate: on ? 1.3 : 0.8 });
  }

  // ---- how they look and sound ----

  // A boost of this player's: the flames out of the thrusters, the smoke, the sound; and word of
  // it to everyone else.
  fire(kind, dir = null, at = null, h = 0) {
    const g = this.game, p = g.player;
    const k = BOOST[kind];
    this.effects(k, at ?? p.pos, p.yaw, dir, h, true);
    g.online?.exoBoost(k, at ?? p.pos, dir, h);
  }

  // How a boost looks and sounds, at a player's feet (at), facing yaw: the thrusters' flames
  // (fx: the puppet's suit, if it's in view), fire and smoke from the back, and on a slam's
  // landing a ring of dust, the ground shaking, and the thud of it. mine: this player's.
  effects(k, at, yaw, dir, h, mine, fx = this.game.puppet?.exo) {
    const g = this.game, s = g.sprites, kind = KIND[k];
    if (!kind) return;
    // the thrusters: behind the shoulders, a little down
    const back = _f.set(Math.sin(yaw), 0, Math.cos(yaw));
    const tx = at.x + back.x * 0.22, ty = at.y + 1.05, tz = at.z + back.z * 0.22;
    if (kind !== 'land') {
      fx?.thrust(1);
      const n = kind === 'dash' ? 10 : 14;
      for (let i = 0; i < n; i++) {
        // out of the nozzles: down for a jump or a slam's start, back the other way for a dodge
        const v = kind === 'dash' && dir ? _v.set(-dir.x * 6, -1, -dir.z * 6) : _v.set(back.x * 1.5, kind === 'slam' ? 4 : -7, back.z * 1.5);
        s.emit('flame', tx, ty, tz, { color: i % 3 ? 0xff9a3c : 0xfff0c0, size: 0.16, grow: 1.6, life: 0.22, spread: 1.2, v: v.clone(), drag: 2, alpha: 0.9 });
      }
      for (let i = 0; i < 6; i++) s.emit('smoke', tx, ty - 0.2, tz, { color: 0x8a8580, size: 0.35, grow: 2.2, life: 0.9, spread: 1.4, drag: 1.5, gravity: -0.6, alpha: 0.35 });
      g.audio?.play?.(kind === 'dash' ? 'RocketWhoosh' : 'RPGLaunch', mine ? null : at, kind === 'dash' ? 0.55 : 0.45, { rate: kind === 'dash' ? 1.7 : 1.35 });
      if (mine && kind !== 'slam') g.kickView?.(kind === 'dash' ? 0.6 : 1);
      return;
    }
    // a slam's landing: the dust, a ring of it going out, sparks, and the ground shaking
    const big = Math.min(1, 0.4 + h / 12);
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      s.emit('dust', at.x + Math.cos(a) * 0.5, at.y + 0.1, at.z + Math.sin(a) * 0.5, { color: 0x6a645c, size: 0.18, life: 0.9, v: _v.set(Math.cos(a) * 9 * big, 1.5, Math.sin(a) * 9 * big).clone(), drag: 2.5, gravity: 6, alpha: 0.9 });
    }
    for (let i = 0; i < 10; i++) s.emit('smoke', at.x, at.y + 0.3, at.z, { color: 0x5a5650, size: 0.9, grow: 2.5, life: 1.4, spread: 4 * big, alpha: 0.45 });
    for (let i = 0; i < 12; i++) s.emit('spark', at.x, at.y + 0.2, at.z, { color: 0x9fe8ff, size: 0.08, life: 0.5, spread: 7 });
    g.audio?.play?.('DragonFall', at, 0.7 * big + 0.3);
    const near = at.distanceTo(g.player.pos);
    if (near < 14) g.shake = Math.max(g.shake || 0, (1 - near / 14) * (0.5 + 0.5 * big));
  }

  // what the HUD shows of it
  hud() {
    if (!this.worn) return null;
    return { battery: this.battery / 100, charges: this.charges, of: DODGE_CHARGES, overclock: this.overclock };
  }
}
