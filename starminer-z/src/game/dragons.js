// The dragons, from the original's later updates (its DragonType, DragonEntity and states,
// DragonClientEntity, FireballEntity and EnemyManager's dragon code, read from the game). One at
// a time, in the sky over the world:
//
//   which      Fire, Forest, Sand, Ice and Undead: 20, 100, 300, 600 and 1000 of health, their
//              fireballs faster each time and fewer blocks able to stand up to them (the Ice
//              Dragon's iceballs turn what they hit to ice)
//   when       the first time you're 100, 500, 1000, 2600 and 4000 m out from the start, one of
//              each in turn (past 3600 m, always the Undead); and stay in one place (a kilometre
//              square) for half an hour or so and one comes for you there, then the next kind in
//              turn the longer you stay
//   how        it comes in from 750 m off, 120 m up, and flies on over; if it sees you (out under
//              the sky, within 300 m, ahead of it) it screams and comes for you: strafing past
//              with a fireball every two seconds from 200 m in, or stopping 50 m off to hover and
//              spit four to seven; then it circles off and comes round again. Gunfire draws it
//              before it's seen anyone, and hitting it makes it angry. Too far from everyone
//              (over 937 m), or past the end of its run with no one seen, it's gone.
//   death      it drops out of the sky and lies there a few seconds, and what it leaves is
//              explosive powder, and copper, iron, gold, diamonds or bloodstone (better further out)
//
// One machine flies it (the brain: the one it came for; it goes to whoever it's chasing if that's
// far from there), telling everyone where it is every fifth of a second, and every machine shows
// it smoothly between (the client: the original's waypoints). Every machine flies every shot, so
// each takes its hits off; whichever sees it die says so, and the loot is the killer's.

import * as THREE from 'three';
import { B, SOLID, HEIGHT, isDoor, DOOR } from '../world/blocks.js';
import { randomFloat, randomInt } from '../entities/cmz/types.js';
import { weaponDamage } from '../items/items.js';
import { makeDragonModel, CLIP_LEN } from '../entities/dragon.js';

// the original's y = 0 is our y = 64
const GROUND = 64;
// DragonType's numbers, the same for all five
const SPEED = 20, MAX_ACCEL = 10, YAW_RATE = 0.35, ROLL_RATE = 1, MAX_ROLL = 1, PITCH_RATE = 0.2, MAX_PITCH = 0.4;
const SLOW_VIEW = 2, FAST_VIEW = 1, MAX_VIEW = 300, MAX_ATTACK = 200, MIN_ATTACK = 50, BREAK_OFF = 40;
const HOVER_DISTANCE = 50, LOITER_DISTANCE = 200, SPAWN_DISTANCE = 750;
const CRUISE = GROUND + 120, LOITER_ALT = GROUND + 90, HUNT_ALT = GROUND + 70;
const STRAFE_RATE = 2, HOVER_RATE = 1, MIN_LOITER = 2, MAX_LOITER = 6, MIN_HOVER_SHOTS = 4, MAX_HOVER_SHOTS = 8;
const HOVER_CHANCE = 0.5, CHANCES = 5, HEARING = 5, FIREBALL_DAMAGE = 0.4;
// where the dragons come as you go further out (EnemyManager.dragonDistances)
const DISTANCES = [100, 500, 1000, 2600, 4000];
// the timed ones: minutes in one place before the next, by which comes next (RecalculateDragonBox)
const BOX_MINUTES = [32, 48, 64, 80, 80, 80];
// Dragon Endurance: each one tougher by 100 (15 less for each killed), 10 to 30 seconds apart
const ENDURANCE_HEALTH = 25, ENDURANCE_STEP = 100, ENDURANCE_KILLED = -15;
// a rocket that hits one (Explosive.HandleDetonateRocketMessage)
export const ROCKET_DRAGON_DAMAGE = 200;

export const DRAGON_TYPES = [
  { id: 0, name: 'Fire Dragon', key: 'fire', skin: 0, health: 20, fireball: 30, ice: false, loiters: 3 },
  { id: 1, name: 'Forest Dragon', key: 'forest', skin: 1, health: 100, fireball: 40, ice: false, loiters: 3 },
  { id: 2, name: 'Sand Dragon', key: 'sand', skin: 3, health: 300, fireball: 40, ice: false, loiters: 3 },
  { id: 3, name: 'Ice Dragon', key: 'ice', skin: 2, health: 600, fireball: 60, ice: true, loiters: 3 },
  { id: 4, name: 'Undead Dragon', key: 'undead', skin: 4, health: 1000, fireball: 60, ice: false, loiters: 100 },
];

// What each one's fireballs can't break (DragonType.BreakLookup), which also takes all of a
// blast through it. Lava stays, and our start tower, as for every other explosion here.
const NEVER = [B.AIR, B.FIXED_LANTERN, B.BEDROCK, B.BLOODSTONE, B.SPACE_ROCK, B.SPACE_ROCK_BUILT, B.SLIME, B.TOWER_STONE, B.LAVA];
const WALLS = [B.IRON_WALL, B.COPPER_WALL, B.GOLD_WALL, B.DIAMOND_WALL];
const STANDS = [
  [B.ROCK, B.LANTERN, B.GOLD_ORE, B.IRON_ORE, B.COPPER_ORE, B.COAL_ORE, B.DIAMOND_ORE, ...WALLS],
  [B.LANTERN, ...WALLS],
  [B.LANTERN, B.IRON_WALL, B.GOLD_WALL, B.DIAMOND_WALL],
  [B.GOLD_WALL, B.DIAMOND_WALL],
  [B.DIAMOND_WALL],
];
export const UNBROKEN = STANDS.map((s) => {
  const t = new Uint8Array(256);
  for (const id of [...NEVER, ...s]) t[id] = 1;
  return t;
});

// the host's clips (DragonEntity.AnimNames): gliding, flapping, the animated attack, hovering
const ANIMS = ['flying_idle', 'fly_forward', 'gethit', 'Idle'];
// how it dies (DeathAnimationPackages[0]): the clip, when its body starts coming up to where it
// flew, when the clip stops to fall, how long it lies, and where its body lies from that point
const DEATH = { name: 'death_air_1', begin: 1.0, pause: 1.366667, wait: 5, box: new THREE.Vector3(0, 0, 7) };
// where shots hit it (its head and body, in its own space: forward -z), and its body when dead
const HEAD_BOX = new THREE.Box3(new THREE.Vector3(-1.5, 0, -9.625), new THREE.Vector3(1.5, 2.5, -4.125));
const BODY_BOX = new THREE.Box3(new THREE.Vector3(-1.75, -1.05, -4.2), new THREE.Vector3(1.75, 2.45, 4.8));
const DEAD_HALF = 2.5, DEAD_HEIGHT = 10;
// a fireball's size (its FireballAABB), and how loud a dragon is
const FIREBALL_R = 0.57;
const LOUD = { hear: 700, ref: 45 };

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const _h = new THREE.Vector3(), _p = new THREE.Vector3(), _f = new THREE.Vector3(), _l = new THREE.Vector3();
const _e = new THREE.Euler(), _m = new THREE.Matrix4(), _r = new THREE.Matrix4();

// MathHelper.WrapAngle: to (-pi, pi]
function wrapAngle(a) {
  a -= TAU * Math.round(a / TAU);
  if (a <= -Math.PI) a += TAU; else if (a > Math.PI) a -= TAU;
  return a;
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
// MathTools.MoveTowardTarget: a step of the gap (no more than rate) times dt
function toward(a, b, rate, dt) {
  if (a === b) return a;
  let d = b - a;
  const ad = Math.abs(d);
  if (ad > rate) d *= rate / ad;
  const v = a + d * dt;
  return Math.abs(v - b) < 0.01 ? b : v;
}
function towardAngle(a, b, rate, dt) {
  if (a === b) return a;
  let d = wrapAngle(b - a);
  const ad = Math.abs(d);
  if (ad > rate) d *= rate / ad;
  const v = wrapAngle(a + d * dt);
  return Math.abs(v - b) < 0.01 ? b : v;
}
// DragonBaseState.GetHeading and MakeYawVector
const headingOf = (v, dflt) => (v.x !== 0 || v.z !== 0 ? Math.atan2(-v.x, -v.z) : dflt);
const yawVector = (yaw, out) => out.set(-Math.sin(yaw), 0, -Math.cos(yaw));
const sees = (id) => SOLID[id] === 1 || id === B.LEAVES || id === B.GLASS;

// ---- the brain: the one machine that flies it --------------------------------------------------

class Brain {
  constructor(mgr, type, forBiome, mig = null) {
    this.mgr = mgr;
    this.game = mgr.game;
    this.type = type;
    this.T = DRAGON_TYPES[type];
    this.forBiome = forBiome;
    this.pos = new THREE.Vector3();
    this.q = new THREE.Quaternion();
    this.fwd = new THREE.Vector3(0, 0, -1);
    this.toTarget = new THREE.Vector3();
    this.yaw = 0; this.targetYaw = 0; this.pitch = 0; this.targetPitch = 0; this.roll = 0; this.targetRoll = 0;
    this.velocity = SPEED; this.targetVelocity = SPEED; this.targetAltitude = CRUISE; this.defaultHeading = 0;
    this.target = null;
    this.travelTarget = new THREE.Vector3();
    this.shootTarget = new THREE.Vector3();
    this.shotPending = false;
    this.chances = CHANCES;
    this.heardT = 0; this.viewT = 0; this.shotT = 0; this.shotsLeft = 0;
    this.loitersLeft = 0; this.loiterT = 0; this.firstDefault = true;
    this.flapDebt = 0; this.updatesSent = 0; this.flapChange = 0; this.animChange = 0;
    this.anim = 1; this.nextAnim = 1; this.clipT = 0;
    this.nextSound = 0; this.cryT = 5;
    this.time = 0; this.nextUpdate = -1;
    this.gunshots = [];
    this.removed = false; this.migrate = false; this.migrateTo = null;
    this.state = null;
    if (mig) this.fromMigration(mig); else this.spawnState();
  }

  change(name) {
    this.state?.exit?.(this);
    this.state = STATES[name];
    this.stateName = name;
    this.state.enter?.(this);
  }

  setAnim(a) { this.anim = a; this.nextAnim = a; this.clipT = 0; }

  orient() {
    this.q.setFromEuler(_e.set(this.pitch, this.yaw, this.roll, 'YXZ'));
    this.fwd.set(0, 0, -1).applyQuaternion(this.q);
  }

  // InitSpawnState: 750 m off from the player it came for, at cruising height, heading their way
  spawnState() {
    const me = this.game.player.pos, h = randomFloat(-Math.PI / 2, Math.PI / 2);
    this.pos.copy(me).addScaledVector(yawVector(h, _a), -SPAWN_DISTANCE);
    this.pos.y = CRUISE;
    this.targetAltitude = CRUISE;
    this.defaultHeading = h;
    this.yaw = this.targetYaw = h;
    this.pitch = this.targetPitch = 0;
    this.setAnim(1);
    this.velocity = this.targetVelocity = SPEED;
    this.target = null;
    this.orient();
    this.change('default');
  }

  // InitAfterHostChange: carrying on from where another machine had it, after this player
  fromMigration(m) {
    this.time = m.time;
    this.pos.fromArray(m.pos);
    this.yaw = m.yaw; this.targetYaw = m.targetYaw;
    this.roll = m.roll; this.targetRoll = m.targetRoll;
    this.pitch = m.pitch; this.targetPitch = m.targetPitch;
    this.velocity = m.velocity; this.targetVelocity = m.targetVelocity;
    this.defaultHeading = m.defaultHeading;
    this.nextUpdate = m.nextUpdate;
    this.mgr.fireballCount = m.fireballs | 0;
    this.target = this.mgr.localTarget();
    this.travelTarget.fromArray(m.target);
    this.firstDefault = false;
    this.chances = 0;
    this.loitersLeft = 0;
    this.setAnim(0);
    this.flapDebt = 0;
    this.orient();
    this.change(this.nextAttack());
  }

  // DoMigration's info
  migration() {
    return {
      type: this.type, forBiome: this.forBiome, time: this.time + 0.4, nextUpdate: this.nextUpdate + 0.4,
      pos: this.pos.toArray(), yaw: this.yaw, targetYaw: this.targetYaw, roll: this.roll, targetRoll: this.targetRoll,
      pitch: this.pitch, targetPitch: this.targetPitch, velocity: this.velocity, targetVelocity: this.targetVelocity,
      defaultHeading: this.defaultHeading, fireballs: this.mgr.fireballCount, target: this.travelTarget.toArray(),
    };
  }

  // ---- what it sees and hears (DragonBaseState) ----

  canSee(p) {
    const head = _h.copy(this.pos).addScaledVector(this.fwd, 7);
    return !this.mgr.blocked(head, p);
  }

  viewCheck(dt, interval) {
    this.viewT -= dt;
    if (this.viewT > 0) return false;
    this.viewT += randomFloat(interval * 0.75, interval * 1.25);
    return true;
  }

  // FindBestTarget: the nearest, best lit player it can see ahead of it; and if there's no one
  // anywhere near, it's done
  findBestTarget(maxDist) {
    const w = this.game.world;
    const head = _h.copy(this.pos).addScaledVector(this.fwd, 7);
    const m2 = maxDist * maxDist, far2 = (SPAWN_DISTANCE * 1.25) ** 2;
    let best = Infinity, none = true, out = null;
    for (const P of this.mgr.players()) {
      if (P.obj.dead) continue;
      const at = _p.copy(P.obj.pos);
      at.y += 1.5;
      const d2 = at.distanceToSquared(head);
      if (d2 < m2 && d2 > 0.001) {
        none = false;
        if (!w.isLoaded(at.x, at.z)) continue;
        const light = w.lightAt(at.x, at.y, at.z).sky / 15;
        if (light <= 0) continue;
        const score = d2 / (light * light);
        if (score >= best) continue;
        _d.subVectors(at, head).normalize();
        if (_d.dot(this.fwd) <= 0.17) continue;
        if (this.mgr.blocked(head, at)) continue;
        out = P;
        best = score;
      } else if (d2 < far2) none = false;
    }
    if (none) { this.removed = true; this.mgr.removeDragon(); }
    return out;
  }

  // SearchForNewTarget: a look round now and then; and until it's angry, a gunshot heard
  search(dt) {
    if (this.viewCheck(dt, SLOW_VIEW)) {
      const P = this.findBestTarget(MAX_VIEW);
      if (this.removed) return false;
      if (P) {
        this.target = P;
        this.travelTarget.copy(P.obj.pos);
        if (this.chances) this.nextSound = 1;
        this.chances = 0;
        this.heardT = 0;
        // after someone far from here: the one it's after flies it from now on
        if (!P.local && this.travelTarget.distanceToSquared(this.game.player.pos) > 22500) { this.migrateTo = P; this.migrate = true; }
        return true;
      }
    }
    if (this.chances) {
      this.heardT -= dt;
      if (this.heardT <= 0) {
        const lim = MAX_VIEW * MAX_VIEW * 2.25, ref = this.chances === CHANCES ? this.pos : this.travelTarget;
        let best = Infinity, at = null;
        for (const s of this.gunshots) {
          const d2 = ref.distanceToSquared(s);
          if (d2 < lim && d2 < best && this.game.world.isLoaded(s.x, s.z)) { best = d2; at = s; }
        }
        if (at) {
          this.chances--;
          if (!this.chances) this.nextSound = 1;
          this.travelTarget.copy(at);
          this.target = null;
          this.heardT = HEARING;
          return true;
        }
      }
    }
    return false;
  }

  // SteerTowardTarget: after the target where it can see it, else where it last was; returns
  // how far off that is, flat
  steer() {
    if (this.target) {
      _p.copy(this.target.obj.pos);
      _p.y += 1.5;
      if (this.canSee(_p)) this.travelTarget.copy(this.target.obj.pos);
    }
    const v = this.toTarget.subVectors(this.travelTarget, this.pos);
    v.y = 0;
    const d = v.length();
    if (d > 10) this.targetYaw = wrapAngle(headingOf(v, this.targetYaw));
    return d;
  }

  nextAttack() { return !this.chances && HOVER_CHANCE > Math.random() ? 'hoverAttack' : 'strafe'; }

  // ---- the frame (DragonEntity.Update) ----

  update(dt) {
    if (this.migrate) {
      if (this.target) this.migrateTo = this.target;
      if (this.migrateTo && this.mgr.valid(this.migrateTo)) { this.mgr.migrate(this, this.migrateTo); return; }
      this.migrateTo = null;
      this.migrate = false;
    }
    this.time += dt;
    this.state.update(this, dt);
    if (this.removed || this.mgr.brain !== this) return;
    // a scream every 6 to 13 seconds
    this.cryT -= dt;
    if (!this.nextSound && this.cryT <= 0) { this.nextSound = 1; this.cryT = randomInt(6, 14); }
    // banking into its turns, and climbing or diving to its height
    const dyaw = wrapAngle(this.targetYaw - this.yaw);
    this.targetRoll = this.anim === 3 ? 0 : clamp(dyaw, -MAX_ROLL, MAX_ROLL);
    const y = this.pos.y;
    if (y > this.targetAltitude - 2 && y < this.targetAltitude + 2) this.targetPitch = 0;
    else { const dy = this.targetAltitude - y; this.targetPitch = Math.sign(dy) * Math.min((dy * dy) / 30, MAX_PITCH); }
    const was = this.yaw;
    this.yaw = towardAngle(this.yaw, this.targetYaw, YAW_RATE, dt);
    this.velocity = toward(this.velocity, this.targetVelocity, MAX_ACCEL, dt);
    this.roll = toward(this.roll, this.targetRoll, ROLL_RATE, dt);
    this.pitch = toward(this.pitch, this.targetPitch, PITCH_RATE, dt);
    // the wings: it flaps a while and glides a while, by how hard it's working (a change once
    // the last has gone out)
    if (this.animChange >= this.flapChange && this.updatesSent > this.animChange) {
      this.flapDebt += this.pitch * dt * (this.pitch > 0 ? 2 : 0.5);
      this.flapDebt += Math.abs(wrapAngle(was - this.yaw)) * 1.5;
      if (Math.abs(this.pitch) < 0.01) this.flapDebt += 0.2 * dt;
      if (this.anim) {
        this.flapDebt -= 0.5 * dt;
        if (this.flapDebt < -1 && this.nextAnim === 1) { this.nextAnim = 0; this.flapChange = this.updatesSent; }
      } else if (!this.nextAnim && this.flapDebt > 1) { this.nextAnim = 1; this.flapChange = this.updatesSent; }
      this.flapDebt = clamp(this.flapDebt, -1, 1);
    }
    this.orient();
    this.pos.addScaledVector(this.fwd, this.velocity * dt);
    this.clipT += dt;
    if (this.clipT >= CLIP_LEN[ANIMS[this.anim]]) { this.setAnim(this.nextAnim); this.animChange = this.updatesSent; }
    if (this.time > this.nextUpdate) {
      this.sendUpdate();
      this.nextUpdate = this.time + 0.2;
    }
    this.gunshots.length = 0;
  }

  // SendRegularUpdate: where it is, and a fireball if one's due
  sendUpdate() {
    const wp = this.waypoint(this.anim);
    if (this.anim !== 2 && this.shotPending) {
      wp.action = 2;
      wp.at = this.shootTarget.toArray();
      wp.index = this.mgr.nextFireballIndex();
      this.shotPending = false;
    }
    this.mgr.sendWaypoint(wp);
    this.updatesSent++;
  }

  waypoint(anim) {
    const wp = { pos: this.pos.toArray(), vel: _a.copy(this.fwd).multiplyScalar(this.velocity).toArray(), t: this.time, anim, roll: this.targetRoll, sound: this.nextSound, action: 0, at: null, index: 0 };
    this.nextSound = 0;
    return wp;
  }
}

// What it's doing (the original's DragonStates).
function loiterSide(sign) {
  return {
    enter(d) {
      d.loiterT = lerp(MIN_LOITER, MAX_LOITER, Math.random());
      if (d.chances) d.loiterT *= 1.5;
    },
    update(d, dt) {
      if (!d.target && d.search(dt)) { d.change(d.nextAttack()); d.state.update(d, dt); return; }
      const v = _l.subVectors(d.pos, d.travelTarget);
      v.y = 0;
      d.loiterT -= dt;
      if (d.loiterT < 0) { d.change(d.nextAttack()); d.state.update(d, dt); return; }
      // round it, drawn back to 200 m off
      const len = v.length();
      let h = headingOf(v, 0) + sign * (Math.PI / 2);
      if (len > LOITER_DISTANCE) h += sign * Math.min(1.5, (len - LOITER_DISTANCE) / 30);
      else h -= sign * Math.min(1.5, (LOITER_DISTANCE - len) / 20);
      d.targetYaw = wrapAngle(h);
    },
  };
}

const STATES = {
  // on its way over, looking
  default: {
    enter(d) {
      d.viewT = SLOW_VIEW;
      d.targetVelocity = SPEED;
      const far = SPAWN_DISTANCE * (d.firstDefault ? 2 : 1);
      d.firstDefault = false;
      d.target = null;
      d.travelTarget.copy(d.pos).addScaledVector(yawVector(d.defaultHeading, _a), far);
      d.targetYaw = d.defaultHeading;
      d.targetAltitude = CRUISE;
      d.loitersLeft = 3;
      d.chances = CHANCES;
    },
    update(d, dt) {
      if (d.removed) return;
      if (d.search(dt)) { d.change(d.nextAttack()); d.state.update(d, dt); return; }
      if (d.removed) return;
      if (d.steer() < 10) { d.removed = true; d.mgr.removeDragon(); }
    },
  },
  // a pass at it, fireballs as it comes
  strafe: {
    enter(d) { d.viewT = FAST_VIEW; d.targetAltitude = HUNT_ALT; d.shotT = STRAFE_RATE; d.targetVelocity = SPEED; },
    update(d, dt) {
      if (d.target && !d.mgr.valid(d.target)) { d.target = null; d.migrate = false; d.migrateTo = null; }
      if (!d.target) d.search(dt);
      if (d.removed) return;
      const dist = d.steer();
      if (dist < BREAK_OFF) { d.change('loiter'); return; }
      if (dist <= MIN_ATTACK || dist >= MAX_ATTACK) return;
      const f = _f.copy(d.fwd);
      f.y = 0;
      f.normalize();
      if (d.toTarget.dot(f) / dist <= 0.95) return;
      d.shootTarget.copy(d.travelTarget);
      if (d.shotPending) return;
      d.shotT -= dt;
      if (d.shotT >= 0) return;
      d.shotT += STRAFE_RATE;
      if (!d.chances) d.shotPending = true;
    },
  },
  // past it: on till it's well past, then round
  loiter: {
    enter(d) {
      if (!d.target) {
        d.loitersLeft--;
        if (!d.loitersLeft) d.change('default');
      } else {
        d.target = null;
        d.loitersLeft = d.T.loiters;
      }
      // (the original sets these after changing its mind above too)
      d.targetAltitude = LOITER_ALT;
      d.targetVelocity = SPEED;
    },
    update(d, dt) {
      const v = _l.copy(d.pos);
      v.y = d.targetAltitude;
      v.sub(d.travelTarget);
      v.y = 0;
      const f = _f.copy(d.fwd);
      f.y = 0;
      if (f.dot(v) < 0) return;
      if (!d.target && d.search(dt)) {
        if (d.target) { d.change(d.nextAttack()); d.state.update(d, dt); }
        return;
      }
      if (v.length() > BREAK_OFF) d.change(Math.random() < 0.5 ? 'loiterLeft' : 'loiterRight');
    },
  },
  loiterLeft: loiterSide(1),
  loiterRight: loiterSide(-1),
  // in to hover over it
  hoverAttack: {
    enter(d) { d.viewT = FAST_VIEW; d.targetAltitude = HUNT_ALT; d.targetVelocity = SPEED; },
    update(d, dt) {
      if (d.target && !d.mgr.valid(d.target)) { d.target = null; d.migrateTo = null; d.migrate = false; }
      if (!d.target) d.search(dt);
      if (d.removed) return;
      if (d.steer() < HOVER_DISTANCE) d.change('hover');
    },
  },
  // hanging there, a fireball a second, four to seven of them
  hover: {
    enter(d) {
      d.shotsLeft = randomInt(MIN_HOVER_SHOTS, MAX_HOVER_SHOTS);
      d.shotT = HOVER_RATE + HOVER_RATE * Math.random();
      d.targetVelocity = 0.25;
      d.nextAnim = 3;
    },
    exit(d) { d.targetVelocity = SPEED; d.nextAnim = 1; },
    update(d, dt) {
      if (d.target && !d.mgr.valid(d.target)) d.target = null;
      if (d.viewCheck(dt, FAST_VIEW) && d.target) {
        _p.copy(d.target.obj.pos);
        _p.y += 1.5;
        if (d.canSee(_p)) d.travelTarget.copy(d.target.obj.pos);
      }
      d.targetAltitude = HUNT_ALT;
      d.targetYaw = wrapAngle(headingOf(_l.subVectors(d.travelTarget, d.pos), d.targetYaw));
      d.shootTarget.copy(d.travelTarget);
      if (d.shotPending) return;
      d.shotT -= dt;
      if (d.shotT >= 0) return;
      if (!d.shotsLeft) { d.change('loiter'); d.state.update(d, dt); return; }
      d.shotT += HOVER_RATE;
      d.shotPending = true;
      d.shotsLeft--;
    },
  },
};

// ---- the client: the dragon as every machine shows it -------------------------------------------

// BaseDragonWaypoint: on a Hermite curve between two, or on from the last
function between(t, a, b, pos, vel) {
  const span = b.t - a.t;
  if (span === 0 || t >= b.t) return ahead(t, b, pos, vel);
  if (t <= a.t) return ahead(t, a, pos, vel);
  const s = (t - a.t) / span, s2 = s * s, s3 = s2 * s;
  const h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
  const d00 = 6 * s2 - 6 * s, d10 = 3 * s2 - 4 * s + 1, d01 = -6 * s2 + 6 * s, d11 = 3 * s2 - 2 * s;
  for (let i = 0; i < 3; i++) {
    const p0 = a.pos[i], p1 = b.pos[i], m0 = a.vel[i] * span, m1 = b.vel[i] * span;
    pos.setComponent(i, p0 * h00 + m0 * h10 + p1 * h01 + m1 * h11);
    vel.setComponent(i, (p0 * d00 + m0 * d10 + p1 * d01 + m1 * d11) / span);
  }
}
function ahead(t, w, pos, vel) {
  const k = t - w.t;
  pos.set(w.pos[0] + w.vel[0] * k, w.pos[1] + w.vel[1] * k, w.pos[2] + w.vel[2] * k);
  vel.fromArray(w.vel);
}

// distance along a ray (in a box's own space) to the box, or null
function rayBox(o, d, max, b) {
  let t0 = 0, t1 = max;
  for (const ax of ['x', 'y', 'z']) {
    const oa = o[ax], da = d[ax], lo = b.min[ax], hi = b.max[ax];
    if (Math.abs(da) < 1e-9) { if (oa < lo || oa > hi) return null; continue; }
    let a = (lo - oa) / da, c = (hi - oa) / da;
    if (a > c) { const s = a; a = c; c = s; }
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, c);
    if (t0 > t1) return null;
  }
  return t0;
}

class Client {
  constructor(mgr, type, forBiome, health = -1) {
    this.mgr = mgr;
    this.game = mgr.game;
    this.type = type;
    this.forBiome = forBiome;
    this.T = DRAGON_TYPES[type];
    this.health = health === -1 || !Number.isFinite(health) ? this.T.health : health;
    this.death = 0;
    this.deathT = 0;
    this.waypoints = [];
    this.fireballIds = [];
    this.flapT = 1;
    this.interpT = 0;
    this.got = false;
    this.timeout = 0;
    this.waiting = false;
    this.spawnPickups = false;
    this.roll = 0;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.dir = new THREE.Vector3(0, 0, -1);
    this.onGround = false;
    this.anim = 0;
    this.nextAnim = 0;
    this.shootAt = new THREE.Vector3();
    this.matrix = new THREE.Matrix4();
    this.inverse = new THREE.Matrix4();
    this.root = new THREE.Group();
    this.root.visible = false;
    this.model = makeDragonModel(this.game.app, this.T);
    this.root.add(this.model.part);
    this.game.scene.add(this.root);
  }

  get dead() { return this.death !== 0; }

  dispose() {
    this.model.dispose();
    this.root.removeFromParent();
  }

  setAnim(a) {
    this.anim = a;
    this.nextAnim = a;
    this.model.play(ANIMS[a], 0.5);
  }

  // (DragonClientEntity.ClipFinished: within half a second of its end)
  get clipFinished() { return this.model.duration() - this.model.time() < 0.5; }

  // AddActionWaypoint: in order of the brain's time (one older than the two in hand is no use);
  // after a gap, on from where it's got to
  addWaypoint(wp) {
    this.timeout = 0;
    const W = this.waypoints;
    for (let i = 0; i < W.length; i++) {
      if (W[i].t <= wp.t) continue;
      if (i >= 2) W.splice(i, 0, wp);
      return;
    }
    if (W.length && this.interpT > W[W.length - 1].t) {
      W.length = 0;
      W.push({ pos: this.pos.toArray(), vel: this.vel.toArray(), t: this.interpT, anim: this.anim, roll: 0, sound: 0, action: 0, at: null, index: 0 });
    }
    W.push(wp);
  }

  // where it's got to, and which way it faces: along its flight, banked
  place(pos) {
    this.pos.copy(pos);
    if (this.vel.lengthSq() > 1e-8) this.dir.copy(this.vel).normalize();
    const right = _b.crossVectors(this.dir, UP);
    if (right.lengthSq() < 1e-8) right.set(1, 0, 0);
    right.normalize();
    const up = _c.crossVectors(right, this.dir);
    this.matrix.makeBasis(right, up, _d.copy(this.dir).negate()).multiply(_r.makeRotationZ(this.roll)).setPosition(pos);
    this.matrix.decompose(this.root.position, this.root.quaternion, this.root.scale);
    this.inverse.copy(this.matrix).invert();
  }

  // dead: where it is, turned only by its heading
  placeDead() {
    this.matrix.compose(this.pos, this.root.quaternion, this.root.scale.set(1, 1, 1));
    this.root.position.copy(this.pos);
    this.inverse.copy(this.matrix).invert();
  }

  light() {
    const w = this.game.world, p = this.pos;
    if (p.y >= HEIGHT || !w.isLoaded(p.x, p.z)) { this.model.setLight(1, 0); return; }
    const L = w.lightAt(p.x, p.y + 1, p.z);
    this.model.setLight(L.sky / 15, L.block / 15);
  }

  update(dt) {
    if (this.dead) { this.updateDead(dt); return; }
    this.timeout += dt;
    if (this.timeout > 10) { this.timeout = -3600; this.mgr.removeDragon(); return; }
    const W = this.waypoints;
    if (W.length < 3 && !this.got) return;
    this.got = true;
    this.root.visible = true;
    if (this.interpT === 0) { this.setAnim(0); this.interpT = W[0].t; }
    else if (W[W.length - 1].t - this.interpT < 0.1) this.interpT += dt * 0.8;
    else this.interpT += dt;
    while (W.length > 1 && this.interpT >= W[1].t) {
      W.shift();
      this.process(W[0]);
      if (this.mgr.client !== this) return;
    }
    this.nextAnim = W[0].anim;
    if (W.length >= 2) between(this.interpT, W[0], W[1], _a, this.vel); else ahead(this.interpT, W[0], _a, this.vel);
    this.roll = toward(this.roll, W[0].roll, ROLL_RATE, dt);
    this.place(_a);
    this.model.update(dt);
    this.light();
    if (this.waiting) {
      if (this.anim !== 2) this.waiting = false;
      else if (this.model.time() > 1.1333) { this.shoot(this.shootAt); this.waiting = false; }
    }
    if (this.clipFinished) this.setAnim(this.nextAnim);
    this.flapT -= dt;
    if (this.flapT <= 0 && this.anim) { this.mgr.sound('WingFlap', this.pos); this.flapT = 1; }
  }

  // a waypoint come due: its fireball, its scream
  process(wp) {
    if (wp.action === 1) {
      this.shootAt.fromArray(wp.at);
      this.waiting = true;
      this.setAnim(2);
      this.fireballIds.push(wp.index);
    } else if (wp.action === 2) {
      this.fireballIds.push(wp.index);
      this.shoot(_p.fromArray(wp.at));
    }
    if (wp.sound === 1) this.mgr.sound('DragonScream', this.pos);
  }

  // ShootFireball: from its mouth, at what it was aimed at
  shoot(at) {
    this.root.updateMatrixWorld(true);
    const from = this.model.mouth(new THREE.Vector3());
    this.mgr.fireballs.push(new Fireball(this.mgr, from, at.clone(), this.fireballIds.shift() ?? 0, this.type, !!this.mgr.brain));
  }

  // ---- hits ----

  // the first of its head and body along a ray: { dist, head } or null
  raycast(o, d, max) {
    if (!this.got) return null;
    const lo = _a.copy(o).applyMatrix4(this.inverse), ld = _b.copy(d).transformDirection(this.inverse);
    let best = null;
    const th = rayBox(lo, ld, max, HEAD_BOX), tb = rayBox(lo, ld, max, BODY_BOX);
    if (th != null) best = { dist: th, head: true };
    if (tb != null && (!best || tb < best.dist)) best = { dist: tb, head: false };
    return best;
  }

  // IsHeadshot: ahead of its body
  isHeadshot(at) { return _a.copy(at).applyMatrix4(this.inverse).z < BODY_BOX.min.z; }

  // a bullet or a laser bolt (anyone's: every machine flies every shot)
  takeDamage(it, shooter) {
    if (this.dead) return;
    this.health -= weaponDamage(it).dmg;
    this.mgr.hasBeenHit();
    if (this.health <= 0) this.mgr.killDragon(this.pos, shooter, it?.id ?? null);
  }

  // a rocket: two and a half times as much anywhere but its head
  takeExplosiveDamage(at, dmg, shooter, item) {
    if (this.dead) return;
    this.health -= dmg * (this.isHeadshot(at) ? 1 : 2.5);
    this.mgr.hasBeenHit();
    if (this.health > 0) return;
    const g = this.game;
    if (item === 'rocket_launcher_guided' && g.mode === 'endurance' && shooter === this.mgr.myId) g.stats.dragonsKilledWithGuidedMissile = (g.stats.dragonsKilledWithGuidedMissile || 0) + 1;
    this.mgr.killDragon(this.pos, shooter, item);
  }

  // ---- death (Kill, UpdateWhileDead) ----

  kill(spawnPickups) {
    if (this.dead) return;
    this.spawnPickups = spawnPickups;
    this.model.play(DEATH.name, 0.25);
    this.death = 1;
    this.deathT = DEATH.pause;
    // level, facing where it was heading
    const f = _a.set(0, 0, -1).applyQuaternion(this.root.quaternion);
    this.root.quaternion.setFromAxisAngle(UP, headingOf(f, 0));
    this.placeDead();
    this.mgr.burst(this.pos, this.T.ice, 2.4);
  }

  updateDead(dt) {
    if (this.death < 3) {
      this.vel.y -= 10 * dt;
      if (this.death === 2) {
        this.fall(dt);
        if (this.onGround) {
          if (!this.clipFinished && this.model.paused) { this.mgr.sound('DragonFall', this.pos); this.model.resume(); }
          const k = Math.pow(0.7, dt * 60);
          this.vel.x *= k;
          this.vel.z *= k;
          if (this.vel.lengthSq() < 0.5) { this.death = 3; this.deathT = DEATH.wait; }
        }
      } else this.pos.addScaledVector(this.vel, dt);
    }
    if (this.death === 1) {
      // its body comes up to where it flew as the clip takes it down; then it falls
      const t = this.model.time(), k = clamp((t - DEATH.begin) / (DEATH.pause - DEATH.begin), 0, 1);
      this.model.rise(lerp(-11.75, 0, k));
      if (t >= DEATH.pause) { this.model.pause(); this.death = 2; }
      if (Math.random() < dt * 8) this.mgr.burst(this.pos, this.T.ice, 0.6);
    } else if (this.death === 3 && this.clipFinished) this.deathT -= dt;
    this.model.update(dt);
    this.placeDead();
    this.light();
    if (this.death === 3 && this.deathT < 0) {
      if (this.spawnPickups) this.mgr.spawnPickups(_c.copy(DEATH.box).applyQuaternion(this.root.quaternion).add(this.pos));
      this.mgr.removeDragonEntity();
    }
  }

  // MoveDragonWithCollision: its body (a box 5 m across and 10 high, 7 m behind the point it
  // flew by) falls till it lands; tree trunks don't stop it
  fall(dt) {
    const off = _b.copy(DEATH.box).applyQuaternion(this.root.quaternion);
    const c = _c.copy(this.pos).add(off);
    this.onGround = false;
    for (const ax of ['y', 'x', 'z']) {
      const step = this.vel[ax] * dt;
      if (!step) continue;
      c[ax] += step;
      if (!this.bodyHits(c)) continue;
      if (ax === 'y' && step < 0) {
        // up out of it, onto the top of what it came down on
        let n = 0;
        c.y = Math.floor(c.y) + 1;
        while (this.bodyHits(c) && n++ < 12) c.y += 1;
        this.onGround = true;
      } else c[ax] -= step;
      this.vel[ax] = 0;
    }
    if (c.y < 0) { c.y = 0; this.vel.y = 0; this.onGround = true; }
    this.pos.copy(c).sub(off);
  }

  bodyHits(c) {
    const w = this.game.world;
    const x0 = Math.floor(c.x - DEAD_HALF), x1 = Math.floor(c.x + DEAD_HALF), z0 = Math.floor(c.z - DEAD_HALF), z1 = Math.floor(c.z + DEAD_HALF);
    const y0 = Math.max(0, Math.floor(c.y)), y1 = Math.min(HEIGHT - 1, Math.floor(c.y + DEAD_HEIGHT));
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const id = w.getBlock(x, y, z);
      if (SOLID[id] === 1 && id !== B.LOG) return true;
    }
    return false;
  }
}

// ---- fireballs ------------------------------------------------------------------------------

// FireballEntity: straight at what it was aimed at, at its dragon's speed, till it meets this
// player or a block. Every machine flies it; only the brain's does anything to the blocks.
class Fireball {
  constructor(mgr, from, to, index, type, local) {
    this.mgr = mgr;
    this.game = mgr.game;
    this.T = DRAGON_TYPES[type];
    this.type = type;
    this.index = index;
    this.local = local;
    this.pos = from.clone();
    const d = to.sub(from);
    const len = d.length();
    this.vel = len > 1e-6 ? d.multiplyScalar(this.T.fireball / len) : new THREE.Vector3(0, -this.T.fireball, 0);
    this.mesh = mgr.fireballMesh(this.T.ice);
    this.mesh.position.copy(this.pos);
    this.game.scene.add(this.mesh);
    this.cue = this.game.audio?.play?.(this.T.ice ? 'Iceball' : 'Fireball', this.pos, 1, LOUD) ?? null;
    this.wasIn = false;
    this.done = false;
    this.spin = Math.random() * TAU;
  }

  remove() {
    this.done = true;
    this.mesh.removeFromParent();
    this.game.audio?.stop?.(this.cue);
    const L = this.mgr.fireballs, i = L.indexOf(this);
    if (i >= 0) L.splice(i, 1);
  }

  update(dt) {
    if (this.done) return;
    const g = this.game, w = g.world;
    const to = _a.copy(this.pos).addScaledVector(this.vel, dt);
    if (to.y < -2) { this.remove(); return; }
    const inside = to.y < HEIGHT && w.isLoaded(to.x, to.z);
    if (inside) {
      this.wasIn = true;
      const hit = this.sweep(this.pos, to);
      if (hit) {
        this.detonate(hit);
        if (this.local) this.mgr.detonateFireball(hit, this.index, this.type);
        return;
      }
    } else if (this.wasIn) { this.remove(); return; }
    this.pos.copy(to);
    this.mesh.position.copy(to);
    this.spin += dt * 3;
    this.mesh.rotation.set(0, this.spin, 0);
    g.audio?.move?.(this.cue, to);
    // its trail
    const s = g.sprites, ice = this.T.ice;
    s.emit('flame', to.x, to.y, to.z, { color: ice ? 0xbfe8ff : 0xffb040, size: 1.0, grow: 0.4, life: 0.12, spread: 0.2, alpha: 0.9 });
    if (Math.random() < dt * 40) s.emit(ice ? 'flame' : 'smoke', to.x, to.y, to.z, ice
      ? { color: 0xe8f6ff, size: 0.5, grow: 0.8, life: 0.6, spread: 0.6, alpha: 0.35 }
      : { color: 0x3a3430, size: 0.6, grow: 1.2, life: 1.0, spread: 0.6, gravity: -0.5, alpha: 0.5 });
  }

  // The first place along a to b where it meets this player or a block, in quarter-metre steps:
  // where its centre is then (just short of a block it'd go into), or null.
  sweep(a, b) {
    const g = this.game, p = g.player, w = g.world;
    const len = a.distanceTo(b), n = Math.max(1, Math.ceil(len / 0.25)), r = FIREBALL_R;
    const prev = _c.copy(a), at = _d;
    for (let i = 1; i <= n; i++) {
      at.lerpVectors(a, b, i / n);
      if (!p.dead && at.x + r > p.pos.x - 0.35 && at.x - r < p.pos.x + 0.35 && at.z + r > p.pos.z - 0.35 && at.z - r < p.pos.z + 0.35
        && at.y + r > p.pos.y && at.y - r < p.pos.y + p.height) return at.clone();
      const x0 = Math.floor(at.x - r), x1 = Math.floor(at.x + r), y0 = Math.floor(at.y - r), y1 = Math.floor(at.y + r), z0 = Math.floor(at.z - r), z1 = Math.floor(at.z + r);
      for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
        if (sees(w.getBlock(x, y, z))) return prev.clone();
      }
      prev.copy(at);
    }
    return null;
  }

  // Detonate: the look and sound of it going off
  detonate(at) {
    if (this.done) return;
    this.remove();
    this.mgr.sound(this.T.ice ? 'Freeze' : 'Explosion', at);
    this.mgr.blastEffects(at, this.T.ice);
  }
}

// ---- the dragons, in all (the original's EnemyManager's part) -----------------------------------

export class Dragons {
  constructor(game, welcome = null) {
    this.game = game;
    this.brain = null;
    this.client = null;
    this.fireballs = [];
    this.pending = false;
    this.t = 0;
    this.fireballCount = 0;
    // the ones that come as you go further out (the host's)
    this.distIndex = 0;
    // the ones that come for staying put: where, when the next can, which
    this.initBox = true;
    this.box = null;
    this.nextSpawnT = Infinity;
    this.nextAllowed = Infinity;
    this.nextTimedType = 0;
    // Dragon Endurance
    this.enduranceT = 0;
    this.enduranceType = 0;
    this.enduranceHealth = ENDURANCE_HEALTH;
    // the guided launcher's lock (RocketLauncherGuidedInventoryItemClass.CheckIfLocked)
    this.lock = { t: 0, locked: false, rect: null, beep: 0, tone: null };
    this.fireMats = null;
    // joining a game with a dragon up (ExistingDragonMessage)
    const d = welcome?.dragon;
    if (d && DRAGON_TYPES[d.k]) this.handleSpawn(-1, d.k, !!d.b, Number.isFinite(d.h) ? d.h : -1);
  }

  get myId() { return this.game.online?.myId ?? 0; }

  dispose() {
    this.client?.dispose();
    this.client = null;
    this.brain = null;
    for (const f of [...this.fireballs]) f.remove();
    this.game.audio?.stop?.(this.lock.tone);
    for (const m of Object.values(this.fireMats || {})) m.dispose();
    this.fireGeo?.dispose();
  }

  // ---- for the rest of the game ----

  // EnemyManager.DragonPosition: where the dragon is (alive: only while it's alive), or null
  position(alive = false) {
    const c = this.client;
    if (!c || !c.got || (alive && c.dead)) return null;
    return c.pos;
  }

  get active() { return !!this.client; }

  // a shot's first touch of it along a ray: { dist, head } or null
  raycast(o, d, max) {
    const c = this.client;
    if (!c || c.dead) return null;
    const dx = c.pos.x - o.x, dz = c.pos.z - o.z;
    if (dx * dx + dz * dz > (max + 25) * (max + 25)) return null;
    return c.raycast(o, d, max);
  }

  // a bullet or a bolt in it (on every machine, from whoever fired it)
  shot(at, it, shooter) {
    const c = this.client;
    if (!c || c.dead) return;
    c.takeDamage(it, shooter);
    // the flash where it went in (TracerManager's dragon flash)
    const s = this.game.sprites;
    s.emit('flame', at.x, at.y, at.z, { color: 0xffd090, size: 0.9, grow: 0.6, life: 0.12, spread: 0, alpha: 0.9 });
    for (let i = 0; i < 4; i++) s.emit('spark', at.x, at.y, at.z, { color: 0xffb060, size: 0.08, life: 0.25, spread: 6 });
  }

  // a rocket in it (everyone's machine hears of it)
  explosiveHit(at, dmg, shooter, item) { this.client?.takeExplosiveDamage(at, dmg, shooter, item); }

  // RegisterGunShot: a bullet fired, anyone's, where it was fired from
  gunshot(at) { if (this.brain) this.brain.gunshots.push(at.clone()); }

  // a teleport (TeleportToLocation's ResetFarthestDistance): the dragons further out than you
  // are now come again as you go out again
  resetDistance() {
    const p = this.game.player.pos, d = Math.hypot(p.x, p.z);
    this.distIndex = Math.min(this.distIndex, DISTANCES.length);
    while (this.distIndex > 0 && d <= DISTANCES[this.distIndex - 1]) this.distIndex--;
  }

  // ---- who's about ----

  // everyone it might go for: this player and the others online
  *players() {
    yield this.localTarget();
    const o = this.game.online;
    if (o) for (const P of o.players.values()) yield { id: P.id, obj: P, local: false };
  }

  localTarget() { return { id: this.myId, obj: this.game.player, local: true }; }

  valid(P) {
    if (!P || P.obj.dead) return false;
    if (P.local) return true;
    return this.game.online?.players.get(P.id) === P.obj;
  }

  // is there a block between a and b (the original's terrain trace)
  blocked(a, b) {
    const d = _f.subVectors(b, a), len = d.length();
    if (len < 1e-6) return false;
    d.divideScalar(len);
    return !!this.game.world.raycast(a.x, a.y, a.z, d.x, d.y, d.z, len, sees);
  }

  // Endurance or Dragon Endurance, or a hard game: their fireballs break blocks
  get breaksBlocks() {
    const g = this.game;
    return g.mode === 'endurance' || g.mode === 'dragon' || g.difficulty === 'hard' || g.difficulty === 'hardcore';
  }

  sound(name, at) { return this.game.audio?.play?.(name, at, 1, LOUD) ?? null; }

  // ---- every frame (EnemyManager.OnUpdate's part) ----

  update(dt, live) {
    if (!live) return;
    const g = this.game, o = g.online, host = !o || o.host;
    this.t += dt;
    if (this.pending && !this.client && this.t > (this.pendingT ?? Infinity)) this.pending = false;
    if (!g.attract && g.difficulty !== 'noenemies' && !g.player.dead && g.ready) {
      if (g.mode === 'dragon') {
        // Dragon Endurance: one after another, each tougher
        if (host && !this.pending && !this.client && this.t > this.enduranceT) {
          this.pending = true;
          this.startDragon(this.myId, this.enduranceType, false, this.enduranceHealth);
          this.enduranceHealth += ENDURANCE_STEP;
          this.enduranceType = (this.enduranceType + 1) % 5;
        }
      } else {
        const p = g.player.pos, flat = Math.hypot(p.x, p.z);
        if (host && this.distIndex < DISTANCES.length && flat > DISTANCES[this.distIndex]) { this.ask(true, this.distIndex); this.distIndex++; }
        this.checkBox();
      }
    }
    this.brain?.update(dt);
    this.client?.update(dt);
    for (const f of [...this.fireballs]) f.update(dt);
  }

  // AskForDragon: unless one's about, or the last went too lately
  ask(forBiome, type) {
    if (this.t < this.nextAllowed || this.brain || this.client) return;
    const p = this.game.player.pos;
    if (p.x * p.x + p.z * p.z > 3600 * 3600) type = 4;
    if (type === 5) return;
    this.spawnDragon(type, forBiome);
  }

  // CheckDragonBox: out of the square you were in, it all starts again round where you are; in
  // it long enough, a dragon, and the next kind each minute it can't come
  checkBox() {
    const p = this.game.player.pos, b = this.box;
    if (this.initBox || !b || p.x < b.x0 || p.x > b.x1 || p.z < b.z0 || p.z > b.z1) {
      this.nextTimedType = 0;
      this.recalcBox();
      if (this.initBox) this.nextAllowed = this.t + 5;
      this.initBox = false;
      return;
    }
    if (this.t <= this.nextSpawnT) return;
    this.nextSpawnT += 60;
    if (this.nextTimedType < 5 || p.x * p.x + p.z * p.z > 3600 * 3600) {
      // (the next kind on before asking: the original hears it's started only later)
      const type = this.nextTimedType;
      this.nextTimedType = Math.min(type + 1, 5);
      this.ask(false, type);
    }
  }

  recalcBox() {
    const p = this.game.player.pos;
    this.box = { x0: p.x - 500, x1: p.x + 500, z0: p.z - 500, z1: p.z + 500 };
    const mins = BOX_MINUTES[this.nextTimedType] ?? 16;
    this.nextSpawnT = this.t + 60 * (mins + 16 * randomFloat(-0.25, 0.25));
  }

  setTimedType(type) { if (type !== 5) this.nextTimedType = type + 1; }

  // SpawnDragon: the host starts it; anyone else asks the host
  spawnDragon(type, forBiome) {
    if (this.pending || this.client) return;
    this.pending = true;
    // (asked, and the host never said: ask again before long)
    this.pendingT = this.t + 15;
    const o = this.game.online;
    if (!o || o.host) this.startDragon(this.myId, type, forBiome, -1);
    else o.dragonRequest(type, forBiome);
  }

  // the host: a dragon, flown by spawner
  startDragon(spawner, type, forBiome, health) {
    this.game.online?.dragonSpawn(spawner, type, forBiome, health);
    this.handleSpawn(spawner, type, forBiome, health);
  }

  // the host, asked by someone (RequestDragonMessage)
  handleRequest(from, type, forBiome) {
    if (this.pending || this.client || !DRAGON_TYPES[type]) return;
    this.pending = true;
    this.startDragon(from, type, forBiome, -1);
  }

  // SpawnDragonMessage: the one it came for flies it; everyone shows it
  handleSpawn(spawner, type, forBiome, health) {
    this.pending = false;
    if (spawner === this.myId) this.brain = new Brain(this, type, forBiome);
    this.client?.dispose();
    this.client = new Client(this, type, forBiome, health);
    if (!forBiome) this.setTimedType(type);
    this.recalcBox();
  }

  // what someone joining needs to know (ExistingDragonMessage)
  welcomeInfo() {
    const c = this.client;
    return c && !c.dead ? { k: c.type, b: c.forBiome ? 1 : 0, h: c.health } : null;
  }

  sendWaypoint(wp) {
    this.game.online?.dragonWaypoint(wp);
    this.client?.addWaypoint(wp);
  }

  receiveWaypoint(wp) { this.client?.addWaypoint(wp); }

  // (GetNextFireballIndex) numbered by who threw it, so they don't clash
  nextFireballIndex() { return (this.myId << 23) | (++this.fireballCount & 0x7fffff); }

  // to the machine of the one it's after (MigrateDragon)
  migrate(brain, to) {
    if (this.game.online) this.game.online.dragonMigrate(to.id, brain.migration());
    this.brain = null;
  }

  handleMigrate(info) {
    if (!this.client || !info || !DRAGON_TYPES[info.type]) return;
    this.brain = new Brain(this, info.type, !!info.forBiome, info);
  }

  // DragonHasBeenHit: angry now
  hasBeenHit() { if (this.brain) this.brain.chances = 0; }

  // RemoveDragon: gone, everywhere
  removeDragon() {
    this.game.online?.dragonRemove();
    this.removeDragonEntity();
  }

  // RemoveDragonEntity: and the next can't come for a while
  removeDragonEntity() {
    this.brain = null;
    this.pending = false;
    if (!this.client) return;
    const g = this.game, o = g.online;
    if (g.mode === 'dragon') { if (!o || o.host) this.enduranceT = this.t + randomFloat(10, 30); } else {
      this.nextAllowed = this.t + 8;
      this.recalcBox();
    }
    this.client.dispose();
    this.client = null;
  }

  // KillDragonMessage, from whichever machine saw it die
  killDragon(at, killer, weapon) {
    this.game.online?.dragonKill(at, killer, weapon);
    this.handleKill(killer, weapon);
  }

  // HandleKillDragonMessage: it falls, everywhere; the killer gets what it leaves
  handleKill(killer) {
    const g = this.game, o = g.online, c = this.client;
    this.brain = null;
    if (!c || c.dead) return;
    if (g.mode === 'endurance') { const k = `${c.T.key}DragonKills`; g.stats[k] = (g.stats[k] || 0) + 1; }
    else if (g.mode === 'dragon' && (!o || o.host)) this.enduranceHealth += ENDURANCE_KILLED;
    if (killer === this.myId) {
      if (o) {
        const line = `${o.myName} Has Killed The ${c.T.name}`;
        o.say(line);
        g.hud.message(line);
      }
      if (g.mode === 'endurance') g.stats.kills++;
      c.kill(true);
    } else c.kill(false);
  }

  // SpawnDragonPickups: two to seven of the ingots and gems (better further out), and two to
  // fourteen of explosive powder, thrown up from where it lies
  spawnPickups(at) {
    const g = this.game;
    const far = clamp(Math.hypot(at.x, at.y - GROUND, at.z) / 5000, 0, 1), k = Math.floor(far * 5);
    const n = randomInt(1, 4) + randomInt(1, 5), powder = randomInt(1, 3 + k) + randomInt(1, 3 + k);
    const up = () => new THREE.Vector3((Math.random() - 0.5) * 1.2, 3, (Math.random() - 0.5) * 1.2);
    for (let i = 0; i < powder; i++) g.drops.spawn('explosive_powder', 1, at.x, at.y + 1, at.z, up());
    for (let i = 0; i < n; i++) {
      const r = randomFloat(far, 1);
      const id = r < 0.5 ? 'copper' : r < 0.6 ? 'iron' : r < 0.8 ? 'gold' : r < 0.9 ? 'diamond' : 'bloodstone';
      g.drops.spawn(id, 1, at.x, at.y + 1, at.z, up());
    }
  }

  // ---- fireballs going off (EnemyManager.DetonateFireball, HandleDetonateFireballMessage) ----

  // the brain's own fireball, gone off: what it breaks (or freezes), and everyone told
  detonateFireball(at, index, type) {
    if (this.breaksBlocks) this.fireballBlocks(at, type);
    this.game.online?.dragonFireball(at, index, type);
    this.handleFireball(at, index, type);
  }

  // everyone's share: that fireball (if it's still flying here) goes off where it went off
  // there, and this player within 5 m of it is hurt (less the further off, and the more there is
  // in the way)
  handleFireball(at, index, type) {
    const f = this.fireballs.find((x) => x.index === index);
    if (f) f.detonate(at);
    const p = this.game.player;
    if (p.dead) return;
    const c = _a.set(p.pos.x, p.pos.y + 1, p.pos.z), d2 = c.distanceToSquared(at);
    if (d2 >= 25) return;
    const d = Math.max(Math.sqrt(d2) - 1, 0);
    const k = Math.min(this.game.explosives.through(at, c, UNBROKEN[type]) * (1 - d / 5), 1) * FIREBALL_DAMAGE;
    if (k > 0) p.hurt(k * p.maxHealth, at, 'fireball');
  }

  // Within 3 m of it, what its dragon can break goes (a door whole), what hangs on it falls (not
  // for ice), and a crate spills; an iceball turns it all to ice.
  fireballBlocks(at, type) {
    const g = this.game, w = g.world, T = DRAGON_TYPES[type], spare = UNBROKEN[type], fire = !T.ice;
    const cx = Math.floor(at.x) + 0.5, cy = Math.floor(at.y) + 0.5, cz = Math.floor(at.z) + 0.5;
    const hit = new Map(), hangers = new Map(), key = (x, y, z) => `${x},${y},${z}`;
    for (let dx = -3; dx <= 3; dx++) for (let dy = -3; dy <= 3; dy++) for (let dz = -3; dz <= 3; dz++) {
      const px = cx + dx, py = cy + dy, pz = cz + dz;
      if ((px - at.x) ** 2 + (py - at.y) ** 2 + (pz - at.z) ** 2 > 9) continue;
      const x = Math.floor(px), y = Math.floor(py), z = Math.floor(pz);
      if (y < 0 || y >= HEIGHT || !w.isLoaded(x, z)) continue;
      const id = w.getBlock(x, y, z);
      if (spare[id] || (isDoor(id) && DOOR(id).upper)) continue;
      hit.set(key(x, y, z), [x, y, z]);
      if (fire) g.explosives.hangersOf(x, y, z, hangers);
      if (isDoor(id)) {
        hit.set(key(x, y + 1, z), [x, y + 1, z]);
        if (fire) g.explosives.hangersOf(x, y + 1, z, hangers);
      }
    }
    for (const [k, [x, y, z, id]] of hangers) {
      if (hit.has(k)) continue;
      g.drops.spawn(isDoor(id) ? 'door' : 'torch', 1, x + 0.5, y + 0.5, z + 0.5);
      hit.set(k, [x, y, z]);
      if (isDoor(id) && !DOOR(id).upper) hit.set(key(x, y + 1, z), [x, y + 1, z]);
    }
    for (const [x, y, z] of hit.values()) if (w.getBlock(x, y, z) === B.CRATE) g.crates?.spill(x, y, z);
    const to = T.ice ? B.ICE : B.AIR;
    g.editKind = 2;
    try {
      for (const [x, y, z] of hit.values()) if (w.getBlock(x, y, z) !== to) w.setBlock(x, y, z, to);
    } finally { g.editKind = 0; }
  }

  // ---- the look of it ----

  fireballMesh(ice) {
    if (!this.fireMats) {
      this.fireGeo = new THREE.IcosahedronGeometry(FIREBALL_R, 1);
      const m = (c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
      this.fireMats = { fire: m(new THREE.Color(0xff9a30).multiplyScalar(1.6)), ice: m(new THREE.Color(0xcfeeff).multiplyScalar(1.3)) };
    }
    const mesh = new THREE.Mesh(this.fireGeo, this.fireMats[ice ? 'ice' : 'fire']);
    mesh.renderOrder = 19;
    return mesh;
  }

  // a flash, a puff of fire (or frost) and of smoke, and rock (or snow) flying
  blastEffects(c, ice) {
    const s = this.game.sprites;
    s.emit('flame', c.x, c.y, c.z, { color: ice ? 0xe8f8ff : 0xfff2c8, size: 2.6, grow: 2.2, life: 0.18, spread: 0, alpha: 0.85 });
    for (let i = 0; i < 18; i++) s.emit('flame', c.x, c.y, c.z, { color: ice ? (i % 3 ? 0x9fd8ff : 0xffffff) : (i % 3 ? 0xff8a2a : 0xffc65a), size: 0.7, grow: 1.4, life: 0.45 + Math.random() * 0.3, spread: 8, drag: 3, alpha: 0.75 });
    for (let i = 0; i < 14; i++) s.emit('smoke', c.x, c.y + 0.3, c.z, { color: ice ? 0xdfe8ee : 0x4a4744, size: 1.1, grow: 2.6, life: 1.6 + Math.random() * 1.2, spread: 4.5, drag: 1.8, gravity: -0.8, alpha: ice ? 0.4 : 0.55 });
    for (let i = 0; i < 24; i++) s.emit('dust', c.x, c.y, c.z, { color: ice ? 0xf4fbff : 0x6a645c, size: 0.13, life: 1.2, spread: 12, gravity: 14, drag: 0.4, alpha: 0.95 });
    this.game.lightFlash?.(c, ice ? 0.2 : 0.4);
  }

  // dying: fire (or frost) and smoke off it
  burst(at, ice, k) {
    const s = this.game.sprites, n = Math.ceil(6 * k);
    for (let i = 0; i < n; i++) s.emit('flame', at.x, at.y + 1, at.z, { color: ice ? 0xbfe8ff : 0xff8a2a, size: 1.4 * k, grow: 2, life: 0.6, spread: 6 * k, drag: 2, alpha: 0.75 });
    for (let i = 0; i < n; i++) s.emit('smoke', at.x, at.y + 1, at.z, { color: ice ? 0xdfe8ee : 0x3a3633, size: 1.6 * k, grow: 3, life: 2, spread: 4 * k, drag: 1.5, gravity: -0.6, alpha: 0.5 });
  }

  // ---- the guided launcher's lock (CheckIfLocked) ----

  // Every frame it's in hand: at the shoulder, with the dragon within 250 m and near enough the
  // middle of the view, and nothing but it in the way, it locks on, slower the further off and
  // the further from the middle, beeping faster as it gets there, and a steady tone once it has.
  checkLock(dt, ads, eye, fwd, cam) {
    const L = this.lock, a = this.game.audio, d = this.position();
    if (ads && d) {
      const to = _a.subVectors(d, eye), len = to.length();
      const ang = len > 1e-6 ? fwd.angleTo(to) : 0, lim = 0.3 * THREE.MathUtils.degToRad(cam.fov);
      if (len < 250 && ang < lim) {
        const hit = this.game.projectiles.probe(eye, d);
        if (!hit || hit.dragon) {
          // the box round it, on the original's 1280 x 720 screen
          const s = _b.copy(d).project(cam);
          const size = Math.floor(35 + 215 * (1 - len / 250));
          L.rect = { x: (s.x + 1) / 2, y: (1 - s.y) / 2, size };
          L.t += dt;
          const need = 1.5 + 4 * (len / 250) + 4 * (ang / lim);
          if (need <= L.t) {
            L.locked = true;
            if (!L.tone?.playing) L.tone = a?.play?.('SolidTone') ?? null;
            return;
          }
          if (L.tone?.playing) a?.stop?.(L.tone);
          L.tone = null;
          L.locked = false;
          L.beep += dt;
          if (L.beep >= 0.156 + 0.844 * ((need - L.t) / 9.5)) { a?.play?.('Beep'); L.beep = 0; }
          return;
        }
      }
    }
    this.resetLock();
  }

  resetLock() {
    const L = this.lock;
    L.locked = false;
    L.t = 0;
    L.rect = null;
    if (L.tone?.playing) this.game.audio?.stop?.(L.tone);
    L.tone = null;
  }
}
