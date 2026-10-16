import * as THREE from '../../vendor/three.module.min.js';
import { powerupIcon, iconCanvas } from '../ui/icons.js';
import { audio } from '../engine/audio.js';
import { rand, pick } from '../util.js';

// Floating power-up drops: Max Ammo, Insta-Kill, Double Points, Nuke, Exo Surge.
export const POWERUPS = {
  ammo: { name: 'MAX AMMO', say: 'Max ammo', timed: false },
  insta: { name: 'INSTA-KILL', say: 'Insta kill', timed: true },
  double: { name: 'DOUBLE POINTS', say: 'Double points', timed: true },
  nuke: { name: 'KABOOM', say: 'Kaboom', timed: false },
  surge: { name: 'EXO SURGE', say: 'Exo surge', timed: true },
};
const DURATION = 30;

export class Powerups {
  constructor(game) {
    this.game = game;
    this.items = [];
    this.timers = {};
    this.dropsThisRound = 0;
    this.killsSinceDrop = 0;
    this.textures = {};
    for (const id of Object.keys(POWERUPS)) {
      const c = iconCanvas((ctx, s) => powerupIcon(ctx, s, id, '#b8ffd9'), 256);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      this.textures[id] = t;
    }
    const gc = iconCanvas((ctx, s) => {
      const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      g.addColorStop(0, 'rgba(120,255,190,0.9)');
      g.addColorStop(0.4, 'rgba(60,220,150,0.35)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
    }, 128);
    this.glowTex = new THREE.CanvasTexture(gc);
  }

  reset() {
    for (const it of this.items) this._remove(it);
    this.items = [];
    this.timers = {};
    this.dropsThisRound = 0;
    this.killsSinceDrop = 0;
  }

  active(id) {
    return (this.timers[id] || 0) > 0;
  }

  maybeDrop(pos) {
    this.killsSinceDrop++;
    if (this.dropsThisRound >= 4) return;
    const p = 0.022 + Math.max(0, this.killsSinceDrop - 25) * 0.004;
    if (Math.random() > p) return;
    const ids = Object.keys(POWERUPS).filter((id) => !(id === 'nuke' && this.game.director.round < 2));
    this.spawn(pick(ids), pos.clone().setY(pos.y + 1.0));
  }

  spawn(id, pos) {
    const group = new THREE.Group();
    group.position.copy(pos);
    const icon = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 0.7),
      new THREE.MeshBasicMaterial({ map: this.textures[id], transparent: true, side: THREE.DoubleSide, depthWrite: false, color: new THREE.Color(2.2, 2.2, 2.2) }),
    );
    group.add(icon);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: new THREE.Color(1.6, 2.4, 2.0), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    glow.scale.setScalar(1.9);
    group.add(glow);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.02, 6, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 3, 2) }));
    group.add(ring);
    this.game.scene.add(group);
    const it = { id, group, icon, ring, t: 0, base: pos.clone() };
    it.loop = audio.play3D('powerup_loop', pos, { loop: true, volume: 0.6, refDistance: 3 });
    audio.play3D('powerup_spawn', pos, { volume: 0.8, refDistance: 5 });
    this.items.push(it);
    this.dropsThisRound++;
    this.killsSinceDrop = 0;
    return it;
  }

  _remove(it) {
    this.game.scene.remove(it.group);
    if (it.loop) it.loop.stop(0.2);
  }

  update(dt) {
    const game = this.game;
    const p = game.player;
    for (const k of Object.keys(this.timers)) {
      if (this.timers[k] > 0) {
        this.timers[k] -= dt;
        if (this.timers[k] <= 0) {
          this.timers[k] = 0;
          if (k === 'surge') p.exo.surge = false;
        }
      }
    }
    if (this.timers.surge > 0) p.exo.charges = 2;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      it.group.position.y = it.base.y + Math.sin(it.t * 2.2) * 0.12;
      it.icon.rotation.y += dt * 1.6;
      it.ring.rotation.x = Math.PI / 2 + Math.sin(it.t) * 0.3;
      it.ring.rotation.z += dt;
      const blink = it.t > 20 ? (Math.sin(it.t * (it.t > 25 ? 26 : 12)) > 0 ? 1 : 0.15) : 1;
      it.group.visible = blink > 0.5;
      const d = Math.hypot(p.ch.x - it.base.x, p.ch.z - it.base.z);
      if (d < 1.7 && Math.abs(p.ch.y + 1 - it.base.y) < 2.2 && !p.downed) {
        this.collect(it.id);
        this._remove(it);
        this.items.splice(i, 1);
        continue;
      }
      if (it.t > 29) {
        this._remove(it);
        this.items.splice(i, 1);
      }
    }
  }

  collect(id) {
    const game = this.game;
    const def = POWERUPS[id];
    audio.play('powerup_grab', { bus: 'ui', volume: 0.9 });
    audio.announce(def.say);
    game.hud.powerupBanner(def.name);
    game.flash(0.35, id === 'nuke' ? 0xffffff : 0xb8ffd9);
    if (def.timed) this.timers[id] = DURATION;
    if (id === 'ammo') {
      game.weapons.maxAmmo();
      audio.play('ammo_pickup', { volume: 0.9 });
    } else if (id === 'nuke') {
      game.nuke();
    } else if (id === 'surge') {
      game.player.exo.surge = true;
      game.player.exo.emp = 0;
    }
  }

  timerList() {
    return Object.keys(this.timers).filter((k) => this.timers[k] > 0).map((k) => ({ id: k, t: this.timers[k] }));
  }
}
