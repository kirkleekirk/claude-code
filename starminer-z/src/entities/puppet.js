// An avatar standing in for a player in the world: yours, seen in third person, or a friend's,
// online. With the original's clips (when they've been ripped) it moves as CastleMiner Z's
// avatars do, with what's in hand on the right hand's prop bone; without them it walks, runs
// and stands on the avatar pack's own clips.

import { AvatarModel, bindPosition } from './avatar/model.js';
import { CmzPlayerAnimation } from './cmz/playerAnim.js';
import { HeldItems } from './cmz/held.js';

export class Puppet {
  constructor(app, look) {
    const cmz = app.cmzPlayer;
    this.model = new AvatarModel(look, app.sky.uniforms, app.terrain.uniforms);
    this.root = this.model.root;
    this.anim = null;
    if (cmz) {
      this.anim = new CmzPlayerAnimation(cmz.clips, cmz.clips.bonesOf(this.model.byName), bindPosition('BASE__Skeleton'), false);
      this.held = new HeldItems(cmz.items, app.sky.uniforms, app.terrain.uniforms);
    }
    this.item = null;
  }

  // The gun's barrel tip, if there's a gun in hand (for the flash of a shot).
  get muzzle() { return this.item?.muzzle ?? null; }

  // s: { pos, yaw, pitch, vel, onGround, held: item id or null, use: a swing or a shot starts
  //      now, shoulder: a gun up to aim, reload, reloadTime, dead, light: { sky, block } 0..1,
  //      grenade: a grenade clip starting now, holdUse: a grenade in progress, time: of day }
  update(dt, s) {
    const m = this.model;
    m.root.position.copy(s.pos);
    m.root.rotation.y = s.yaw + Math.PI;
    const sp = Math.hypot(s.vel.x, s.vel.z);
    m.setLight(s.light.sky, s.light.block);
    if (this.anim) {
      if (!this.item || this.item.id !== s.held) {
        this.item?.obj.removeFromParent();
        this.item = { id: s.held, ...this.held.make(s.held) };
        m.byName.RT_PROP__Skeleton.add(this.item.obj);
        this.anim.setMode(this.item.spec.mode);
      }
      const back = s.vel.x * Math.sin(s.yaw) + s.vel.z * Math.cos(s.yaw) > 0.3;
      this.anim.update(dt, {
        use: !!s.use && !s.grenade, shoulder: !!s.shoulder, reload: !!s.reload, reloadTime: s.reloadTime,
        move: Math.min(1, sp / 4.4), back, pitch: s.pitch, dead: !!s.dead, grenade: s.grenade ?? null, holdUse: !!s.holdUse,
      });
      // a clock in hand goes round with the day
      if (this.item.turn && this.item.spec.turn === 'clock' && s.time != null) this.item.turn.rotation.y = -Math.PI * 2 * s.time;
      this.held.setLight(m.material.uniforms.uObjLight.value);
      m.update(dt);
      return;
    }
    if (s.dead) m.play('faint', { fade: 0.2, once: true });
    else if (!s.onGround && Math.abs(s.vel.y) > 2) m.play('jump', { fade: 0.15, once: true });
    else if (sp > 5.2) m.play('run', { fade: 0.2, speed: sp / 6 });
    else if (sp > 0.4) m.play('walk', { fade: 0.2, speed: Math.min(2.4, sp / 1.6) });
    else m.play('idle', { fade: 0.3 });
    m.layer.pitch = s.dead ? 0 : -s.pitch * 0.5;
    m.update(dt);
  }

  dispose() {
    this.item?.obj.removeFromParent();
    this.model.dispose();
    this.model.material.dispose();
    this.root.removeFromParent();
  }
}
