// A survivor controlled by the network: another player, or (on a joining player's machine) an
// AI survivor simulated by the host. It moves by interpolating snapshots and owns no logic of
// its own. Damage dealt to it here is reported to whoever is in charge of it.
import * as THREE from 'three';
import { Survivor } from '../game/survivor.js';
import { lerp, dampAngle } from '../core/math.js';

const F = { crouch: 1, sprint: 2, ads: 4, ground: 8, dead: 16, extracted: 32, swim: 64 };
export const FLAGS = F;

export class Puppet extends Survivor {
  constructor(G, info) {
    super(G, { name: info.name, outfit: info.outfit, cosmetics: info.cosmetics || {}, classId: info.cls, team: 50000 + (info.id | 0) });
    this.netId = info.id;
    this.kind = info.kind || 'h'; // 'h' human, 'b' AI survivor
    this.physical = true;
    this.isPuppet = true;
    this.target = new THREE.Vector3();
    this.tYaw = 0;
    this.lastSeen = G.time || 0;
    this.weaponKey = '';
    this.anim = 'ground';
    this.vehId = null;
    if (this.character) G.scene.add(this.character.root);
  }
  // apply one network state snapshot
  apply(s, t) {
    const [x, y, z] = s.p;
    if (!this.seen) { this.pos.set(x, y, z); this.seen = true; }
    this.target.set(x, y, z);
    this.tYaw = s.y;
    this.vel.set(s.v ? s.v[0] : 0, 0, s.v ? s.v[1] : 0);
    const f = s.f | 0;
    this.crouch = !!(f & F.crouch); this.sprinting = !!(f & F.sprint); this.onGround = !!(f & F.ground);
    this.lookPitch = s.ap || 0;
    this.health = s.h ?? this.health; this.armor = s.ar ?? this.armor;
    this.lastSeen = t;
    // weapon in hand (model, rarity, mods)
    const wk = `${s.w || ''}|${s.wr | 0}|${s.wm || ''}`;
    if (wk !== this.weaponKey && this.character) {
      this.weaponKey = wk;
      const mods = {}; if (s.wm) for (const kv of s.wm.split(',')) { const [k, v] = kv.split(':'); if (v) mods[k] = v; }
      this.character.setWeapon(s.w || 'none', s.wr | 0, this.cosmetics.wrap || null, mods);
    }
    this.anim = s.a || 'ground';
    if (f & F.extracted && !this.extracted) { this.extracted = true; if (this.character) this.character.root.visible = false; }
    if (f & F.dead && this.alive) { this.health = 0; this.die(null, { type: 'net' }); }
    // a vehicle this player is driving
    if (s.veh) this.G.net?.applyVehicle(this, s.veh); else if (this.vehId != null) this.G.net?.releaseVehicle(this);
  }
  update(dt) {
    if (!this.alive) { this.syncModel(dt, 0); return; }
    const d = this.pos.distanceTo(this.target);
    if (d > 12) this.pos.copy(this.target); // teleport (spawn, vehicle, lag spike)
    else this.pos.lerp(this.target, Math.min(1, dt * 12));
    this.yaw = dampAngle(this.yaw, this.tYaw, 14, dt);
    const ch = this.character;
    if (ch) {
      ch.root.visible = !this.extracted;
      ch.anim.state = this.anim === 'ride' ? 'ride' : this.anim === 'swim' ? 'swim' : 'ground';
    }
    this.syncModel(dt, Math.hypot(this.vel.x, this.vel.z));
  }
  // damage dealt on this machine goes to the machine in charge of this survivor
  takeDamage(amount, src = null, opts = {}) {
    if (!this.alive || this.extracted || amount <= 0) return 0;
    this.G.net?.reportHit(this, amount, src, opts);
    this.character?.playAction('hit', 0.25);
    return amount;
  }
  breakLeg() { /* the owner decides */ }
}
