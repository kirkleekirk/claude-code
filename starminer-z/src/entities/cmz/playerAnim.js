// The original's Player.UpdateAnimation: which clip each layer of the player's avatar plays,
// from what the player is doing. First person (the original's FPSMode) keeps the legs standing,
// the torso level and the head still; the view comes from the avatar's eyes.

import { CmzAnimator, MODES } from './avatarAnim.js';

// the shoulder states, as the original numbers them
const DOWN = 0, RAISING = 1, LOWERING = 2, UP = 3, RELOADING = 4;

export class CmzPlayerAnimation {
  constructor(lib, bones, rootBind, firstPerson) {
    this.anim = new CmzAnimator(lib, bones, rootBind);
    this.fps = firstPerson;
    this.state = DOWN;
    this.using = false;
    this.mode = MODES.fist;
    // Player.SetupAnimation
    const A = this.anim;
    A.play('Stand', 0);
    this.tilt = A.play('Tilt', 1);
    if (this.tilt) this.tilt.playing = false;
    A.play('GenericIdle', 2);
    const head = A.play('IdleHead', 4);
    if (head) head.pingPong = true;
  }

  // what's in hand: a key of MODES
  setMode(name) { this.mode = MODES[name] || MODES.generic; }

  // How far up at the shoulder a gun is, 0..1, and the avatar camera's field of view for it
  // (the original's 90 degrees, 45 at the shoulder, between them as the clip raises it).
  get raised() {
    const p = this.anim.at(2)?.progress ?? 1;
    return this.state === UP ? 1 : this.state === RAISING ? p : this.state === LOWERING ? 1 - p : 0;
  }

  // s: { use: a swing or a shot starts this frame, shoulder: held up to aim, reload: reloading,
  //      reloadTime, move: 0..1 how hard it's walking, back: walking backwards, pitch: radians,
  //      up positive, dead, grenade: a grenade clip to start ('cook', 'throw', 'reset'),
  //      holdUse: a grenade's in progress (its clip stays when it's played through) }
  update(dt, s) {
    const A = this.anim, M = this.mode;
    const sh = s.shoulder;
    const use = sh && M.sUse ? M.sUse : M.use, idle = sh && M.sIdle ? M.sIdle : M.idle, walk = sh && M.sWalk ? M.sWalk : M.walk;
    // dying
    if (s.dead) { if (!A.at(5)) A.play('Die', 5, 0.25); } else if (A.at(5)) A.clear(5, 0.25);
    // a grenade's: the pin out (blending in), the throw, the hand back (Player.UpdateAnimation)
    if (s.grenade) {
      A.play({ cook: 'Grenade_Cook', throw: 'Grenade_Throw', reset: 'Grenade_Reset' }[s.grenade], 3, s.grenade === 'cook' ? 0.25 : 0);
      this.using = true;
    } else if (s.use) {
      // a swing or a shot: its clip from the start, once
      A.play(use, 3, 0);
      this.using = true;
    } else if (A.at(3)) {
      const t = A.at(3);
      t.looping = false;
      // (a grenade's cook holds at its end until it's thrown)
      if (t.finished && !s.holdUse) { A.clear(3, 0.25); this.using = false; }
    }
    // reloading and raising to the shoulder
    if (this.state === RELOADING && A.at(2)?.finished) this.state = DOWN;
    if (s.reload) {
      if (this.state === UP && !this.using) {
        this.state = LOWERING;
        const t = A.play(M.shoulder, 2, 0.25);
        if (t) t.reversed = true;
      } else if (this.state === DOWN && !this.using && M.reload) {
        this.state = RELOADING;
        const t = A.play(M.reload, 2, 0.25);
        if (t && s.reloadTime) t.speed = t.duration / s.reloadTime;
      }
    } else if (this.state === RELOADING) this.state = DOWN;
    if (sh && M.shoulder && this.state === DOWN) { this.state = RAISING; A.play(M.shoulder, 2, 0); }
    if (!sh && M.shoulder && this.state === UP) {
      this.state = LOWERING;
      const t = A.play(M.shoulder, 2, 0);
      if (t) t.reversed = true;
    }
    if (!sh && !M.shoulder && this.state === UP) this.state = DOWN;
    if (this.state === RAISING && A.at(2)?.finished) this.state = UP;
    if (this.state === LOWERING && A.at(2)?.finished) this.state = DOWN;
    // standing or walking with it
    const moving = s.move >= 0.1;
    if (!s.reload && (this.state === DOWN || this.state === UP)) {
      if (moving) {
        if (A.at(2)?.name !== walk) A.play(walk, 2, sh ? 0 : 0.25);
        if (A.at(2)?.name === walk) A.at(2).speed = Math.min(1, s.move);
      } else if (A.at(2)?.name !== idle) A.play(idle, 2, sh ? 0.1 : 0.25);
    }
    // the legs: in first person they stand; otherwise they walk, or run once the stick is
    // most of the way over (a key always is)
    if (this.fps) {
      if (A.at(0)?.name !== 'Stand') A.play('Stand', 0, 0);
    } else if (!moving) {
      if (A.at(0)?.name !== 'Stand') A.play('Stand', 0, 0.25);
    } else {
      const run = s.move >= 0.8;
      const name = run ? 'Run' : 'Walk';
      if (A.at(0)?.name !== name) A.play(name, 0, 0.25);
      const t = A.at(0);
      if (t) { t.speed = run ? 0.8 + (s.move - 0.8) : (s.move - 0.1) / 0.4; t.reversed = !!s.back; }
    }
    // the torso leans with the view (level in first person), and the head looks about
    if (this.tilt) {
      A.replay(this.tilt, 1, 0);
      this.tilt.progress = this.fps ? 0.5 : Math.max(0, Math.min(1, (s.pitch * 180 / Math.PI + 90) / 180));
    }
    if (this.fps && A.at(4)) A.clear(4, 0);
    A.update(dt);
  }
}
