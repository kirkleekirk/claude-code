// What's in the air, by the original's rules: bullets (its TracerManager's tracers: a streak
// that flies at the gun's speed and falls at 10 m/s/s, hitting whatever its streak touches
// first), laser bolts (BlasterShot: 200 m/s, three seconds, glancing off bedrock, bloodstone and
// diamond walls up to three times, and knocking out the block they stop in), grenades
// (GrenadeProjectile: thrown at 15 m/s, bouncing as each block lets them) and rockets
// (RocketEntity: a pop out of the tube, then up to speed; the guided one turns after its dragon).
//
// Each machine flies everyone's shots, for the look of them; only the one who fired one hurts
// anything with it.

import * as THREE from 'three';
import { B, SOLID } from '../world/blocks.js';
import { ITEMS, weaponDamage } from '../items/items.js';
import { BOUNCES_LASERS, BOUNCE } from '../entities/cmz/types.js';
import { EXPLOSIVE } from './explosives.js';
import { itemModel } from '../items/models.js';

const BULLET_GRAVITY = 10;
const BOLT_SPEED = 200, BOLT_LIFE = 3, BOLT_BOUNCES = 3;
const GRENADE_SPEED = 15, GRENADE_GRAVITY = 9.8, GRENADE_R = 0.1;
// a rocket: how long it hangs before it fires, the pop out of the tube, its life
const ROCKET_FUSE = 0.25, ROCKET_POP = 3.5, ROCKET_LIFE = 10;
const _v = new THREE.Vector3(), _d = new THREE.Vector3(), _c = new THREE.Color();
const solid = (id) => SOLID[id] === 1 || id === B.LEAVES || id === B.GLASS;

// CMZColors for a tracer, by what the gun's made of (lasers have their own)
const TRACER = { iron: 0x808080, gold: 0xffd700, diamond: 0x00ffff, bloodstone: 0x8b0000, copper: 0xb87333 };
const tracerColor = (it) => (it?.laser ? it.color : TRACER[it?.mat] ?? 0xffffff);

export class Projectiles {
  constructor(game) {
    this.game = game;
    this.bullets = [];
    this.bolts = [];
    this.grenades = [];
    this.rockets = [];
    // the streaks, drawn as one set of lines
    const max = 256;
    this.max = max;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 6);
    this.col = new Float32Array(max * 8);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    const m = new THREE.ShaderMaterial({
      vertexShader: 'attribute vec4 aColor; varying vec4 vC; void main(){ vC = aColor; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying vec4 vC; void main(){ gl_FragColor = vec4(vC.rgb * vC.a * 3.0, vC.a); }',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.lines = new THREE.LineSegments(g, m);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 19;
    game.scene.add(this.lines);
    // a laser bolt: a long glowing rod (the original's Tracer_Bolt, 1.5 x 1.5 x 8 of it)
    this.boltGeo = new THREE.CylinderGeometry(0.035, 0.035, 1.2, 6, 1).rotateX(Math.PI / 2).translate(0, 0, 0.6);
    this.boltMats = new Map();
    this.objMat = game.propMat;
  }

  dispose() {
    this.lines.removeFromParent();
    this.lines.geometry.dispose();
    this.lines.material.dispose();
    for (const b of this.bolts) b.mesh.removeFromParent();
    for (const g of this.grenades) g.mesh.removeFromParent();
    for (const r of this.rockets) r.mesh.removeFromParent();
    this.boltGeo.dispose();
    for (const m of this.boltMats.values()) m.dispose();
  }

  boltMat(color) {
    let m = this.boltMats.get(color);
    if (!m) {
      m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.2), transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
      this.boltMats.set(color, m);
    }
    return m;
  }

  // ---- shots -----------------------------------------------------------------------------------

  // A bullet from the eye (TracerManager.AddTracer): its streak starts half a metre out.
  bullet(from, dir, it, mine) {
    if (this.bullets.length >= this.max) this.bullets.shift();
    const head = from.clone().addScaledVector(dir, 0.5);
    const v = dir.clone().multiplyScalar(it.velocity || 100);
    this.bullets.push({ head, tail: head.clone(), hv: v, tv: v.clone(), left: it.flightTime || 2, tailAt: (it.flightTime || 2) - 0.2, it, mine, done: false, color: tracerColor(it) });
  }

  // A laser bolt from the gun's tip (BlasterShot.Create).
  bolt(from, dir, it, mine) {
    const mesh = new THREE.Mesh(this.boltGeo, this.boltMat(it.color ?? 0xff0000));
    mesh.position.copy(from);
    mesh.lookAt(_v.copy(from).sub(dir));
    mesh.renderOrder = 19;
    this.game.scene.add(mesh);
    this.bolts.push({ mesh, pos: from.clone(), last: from.clone(), v: dir.clone().multiplyScalar(BOLT_SPEED), life: BOLT_LIFE, bounces: BOLT_BOUNCES, it, mine, skip: false });
  }

  // A grenade from the hand (GrenadeProjectile.Create): fuse, the seconds it has left.
  grenade(pos, dir, fuse, mine) {
    const m = itemModel('grenade');
    const mesh = m ? new THREE.Mesh(m.geo, this.objMat) : new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), this.objMat);
    mesh.position.copy(pos);
    mesh.scale.setScalar(1.4);
    this.game.scene.add(mesh);
    const right = new THREE.Vector3(0, 1, 0).cross(dir).normalize();
    this.grenades.push({ mesh, pos: pos.clone(), last: pos.clone(), v: dir.clone().multiplyScalar(GRENADE_SPEED), axis: right.lengthSq() > 0 ? right : new THREE.Vector3(1, 0, 0), spin: 6, left: fuse, stopped: false, mine, gone: false });
  }

  // A rocket out of its launcher (RocketEntity): dir, the way the view points.
  rocket(from, dir, it, mine) {
    const m = itemModel('rockets');
    const mesh = new THREE.Mesh(m ? m.geo : new THREE.CylinderGeometry(0.03, 0.03, 0.3), this.objMat);
    mesh.scale.setScalar(1.6);
    this.game.scene.add(mesh);
    const start = from.clone().add(dir);
    // the pop: forward and well up, at 3.5 m/s, falling
    const up = new THREE.Vector3(0, 1, 0);
    const side = new THREE.Vector3().crossVectors(dir, up);
    const camUp = side.lengthSq() > 1e-6 ? new THREE.Vector3().crossVectors(side.normalize(), dir).normalize() : up;
    const pop = dir.clone().lerp(camUp, 0.75).normalize().multiplyScalar(ROCKET_POP);
    const guided = !!it.guided;
    this.rockets.push({
      mesh, start, dir: dir.clone(), pop, t: -ROCKET_FUSE, guidedAt: start.clone(), it, mine, guided,
      max: guided ? 50 : 25, fullGuide: guided ? 2.5 : 1, fullSpeed: 1, pos: start.clone(), last: start.clone(), whoosh: this.game.audio?.play?.('RocketWhoosh', start),
    });
    mesh.position.copy(start);
  }

  // ---- the frame -------------------------------------------------------------------------------

  update(dt) {
    this.updateBullets(dt);
    this.updateBolts(dt);
    this.updateGrenades(dt);
    this.updateRockets(dt);
  }

  // The first thing along a to b: a block (with its hit), or one of the dead (theirs too).
  probe(a, b, enemies = true) {
    const w = this.game.world;
    _d.subVectors(b, a);
    const len = _d.length();
    if (len < 1e-6) return null;
    _d.divideScalar(len);
    const blk = w.raycast(a.x, a.y, a.z, _d.x, _d.y, _d.z, len, solid);
    const bd = blk ? blk.dist : len;
    const en = enemies ? this.game.enemies?.raycast(a, _d, bd, bd, true) : null;
    if (en) return { enemy: en.enemy, dist: en.dist, y: en.y, at: a.clone().addScaledVector(_d, en.dist), dir: _d.clone() };
    if (blk) return { block: blk, dist: blk.dist, at: a.clone().addScaledVector(_d, blk.dist), dir: _d.clone() };
    return null;
  }

  updateBullets(dt) {
    const g = this.game;
    let n = 0;
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const t = this.bullets[i];
      if (t.done) { this.bullets.splice(i, 1); continue; }
      t.left -= dt;
      if (t.left < 0) t.done = true;
      t.head.addScaledVector(t.hv, dt);
      t.hv.y -= BULLET_GRAVITY * dt;
      if (t.left < t.tailAt - 0.2) { t.tail.addScaledVector(t.tv, dt); t.tv.y -= BULLET_GRAVITY * dt; }
      const hit = this.probe(t.tail, t.head);
      if (hit) {
        t.head.copy(hit.at);
        t.done = true;
        g.shotHit(hit, t.it, t.mine);
      }
      if (!g.world.isLoaded(t.head.x, t.head.z) || t.head.y < 0) t.done = true;
    }
    // the streaks: bright at the head, nothing at the tail
    for (const t of this.bullets) {
      if (n >= this.max) break;
      this.pos.set([t.tail.x, t.tail.y, t.tail.z, t.head.x, t.head.y, t.head.z], n * 6);
      _c.set(t.color);
      this.col.set([_c.r, _c.g, _c.b, 0, _c.r, _c.g, _c.b, 0.9], n * 8);
      n++;
    }
    const geo = this.lines.geometry;
    geo.setDrawRange(0, n * 2);
    geo.attributes.position.needsUpdate = true;
    geo.attributes.aColor.needsUpdate = true;
  }

  updateBolts(dt) {
    const g = this.game, w = g.world;
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.life -= dt;
      let done = b.life <= 0;
      if (!done) {
        b.last.copy(b.pos);
        b.pos.addScaledVector(b.v, dt);
        const hit = b.skip ? null : this.probe(b.last, b.pos);
        b.skip = false;
        if (hit) {
          b.pos.copy(hit.at);
          if (hit.enemy) { g.shotHit(hit, b.it, b.mine); done = true; }
          else {
            const id = hit.block.id;
            g.boltSplash?.(hit.at, b.it);
            if (BOUNCES_LASERS[id] && b.bounces > 0) {
              // off it, as off a mirror
              b.bounces--;
              const n = _v.set(hit.block.nx, hit.block.ny, hit.block.nz);
              b.v.reflect(n);
              b.pos.addScaledVector(n, 0.01);
              b.skip = true;
            } else {
              done = true;
              // the block it stops in goes, if it can be dug (on the machine of whoever fired it)
              if (b.mine) g.explosives.blast(new THREE.Vector3(hit.block.x + 0.5, hit.block.y + 0.5, hit.block.z + 0.5), EXPLOSIVE.LASER, b.it.id, true);
            }
          }
        }
        if (!w.isLoaded(b.pos.x, b.pos.z)) done = true;
      }
      if (done) { b.mesh.removeFromParent(); this.bolts.splice(i, 1); continue; }
      b.mesh.position.copy(b.pos);
      b.mesh.lookAt(_v.copy(b.pos).sub(b.v));
    }
  }

  updateGrenades(dt) {
    const g = this.game, w = g.world;
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const n = this.grenades[i];
      // stopped on something that's since gone: it falls again
      if (n.stopped && !SOLID[w.getBlock(n.pos.x, n.pos.y - 0.5, n.pos.z)]) n.stopped = false;
      if (!n.stopped) {
        if (n.spin) n.mesh.rotateOnWorldAxis(n.axis, n.spin * dt);
        n.v.y -= GRENADE_GRAVITY * dt;
        n.last.copy(n.pos);
        this.moveGrenade(n, _v.copy(n.pos).addScaledVector(n.v, dt));
      }
      n.left -= dt;
      if (n.left < 0) {
        n.mesh.removeFromParent();
        this.grenades.splice(i, 1);
        if (n.mine) g.explosives.blast(n.pos.clone(), EXPLOSIVE.GRENADE, 'grenade', true);
        continue;
      }
      n.mesh.position.copy(n.pos);
    }
  }

  // GrenadeProjectile.MoveToNewPosition: up to ten bounces a step, each off the block it meets,
  // keeping as much of its speed as that block lets it; settled on a floor once it's slow.
  moveGrenade(n, to) {
    const g = this.game;
    for (let k = 10; k > 0; k--) {
      const hit = this.probe(n.last, to, true);
      if (!hit) break;
      // (pulled back off the surface by the grenade's own size)
      const at = hit.at.addScaledVector(hit.dir, -GRENADE_R);
      if (k === 1) { to.copy(at); n.stopped = true; n.v.set(0, 0, 0); n.spin = 0; break; }
      let r = 0.1, normal;
      if (hit.enemy) normal = hit.dir.clone().negate();
      else {
        normal = new THREE.Vector3(hit.block.nx, hit.block.ny, hit.block.nz);
        if (n.v.lengthSq() > 0.01) g.audio?.play?.('BulletHitDirt', at);
        r = BOUNCE[hit.block.id];
      }
      n.v.copy(reflect(n.v, normal, r));
      if (normal.y >= 0.75 && n.v.lengthSq() < 1) { to.copy(at); n.stopped = true; n.v.set(0, 0, 0); n.spin = 0; break; }
      n.last.copy(at);
      to.copy(reflect(to.clone().sub(at), normal, r).add(at));
      const along = n.v.clone().addScaledVector(normal, -n.v.dot(normal));
      const axis = new THREE.Vector3().crossVectors(normal, along);
      if (axis.lengthSq() > 0) { n.axis.copy(axis.normalize()); n.spin = along.length() / GRENADE_R; } else n.spin = 0;
    }
    n.pos.copy(to);
  }

  updateRockets(dt) {
    const g = this.game;
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      r.t += dt;
      // the pop out of the tube: a short fall from where it came out
      let at = null, speed = 0, face = r.dir;
      const lob = r.t < r.fullGuide ? r.start.clone().addScaledVector(r.pop, r.t + ROCKET_FUSE).add(_v.set(0, -4.9 * (r.t + ROCKET_FUSE) ** 2, 0)) : null;
      if (r.t >= 0) {
        // where it's going: the way it was fired, or (guided) after the dragon, turning to it
        // over its first seconds
        let to = r.dir;
        if (r.guided) {
          const d = g.enemies?.dragonPosition?.();
          const aim = d ? d.clone().sub(r.pos).normalize() : r.dir;
          const f = Math.min(1, r.t / r.fullGuide);
          to = r.dir.clone().lerp(aim, f).normalize();
          face = r.dir.clone().lerp(aim, Math.sqrt(f)).normalize();
        }
        if (r.t < r.fullSpeed) {
          const k = Math.sqrt(r.t / r.fullSpeed);
          speed = k * r.max;
          r.guidedAt.addScaledVector(to, speed * dt);
          at = lob.clone().lerp(r.guidedAt, k);
        } else {
          speed = r.max;
          r.guidedAt.addScaledVector(to, speed * dt);
          at = r.guidedAt.clone();
        }
      } else at = lob;
      r.last.copy(r.pos);
      r.pos.copy(at);
      r.mesh.position.copy(at);
      r.mesh.lookAt(_v.copy(at).add(face));
      r.mesh.rotateX(Math.PI / 2);
      if (r.whoosh) g.audio?.move?.(r.whoosh, at);
      if (r.t >= 0) for (let k = 0; k < 2; k++) g.sprites.emit(k ? 'smoke' : 'flame', at.x - face.x * 0.3, at.y - face.y * 0.3, at.z - face.z * 0.3, k
        ? { color: 0x8a8580, size: 0.25, grow: 0.9, life: 1.2, spread: 0.4, alpha: 0.4 }
        : { color: 0xffa040, size: 0.2, life: 0.12, spread: 0.3 });
      let boom = null, done = false;
      if (r.t > ROCKET_LIFE) { done = true; boom = at; } else {
        const hit = this.probe(r.last, r.pos);
        if (hit) { done = true; boom = hit.at; }
      }
      if (!g.world.isLoaded(at.x, at.z)) done = true;
      if (done) {
        r.mesh.removeFromParent();
        if (r.whoosh) g.audio?.stop?.(r.whoosh);
        this.rockets.splice(i, 1);
        if (boom && r.mine) g.explosives.blast(boom.clone(), EXPLOSIVE.ROCKET, r.it.id, true);
      }
    }
  }
}

// GrenadeProjectile.ReflectVectorWithRestitution: off a surface, its push back cut to r, and its
// slide along a floor cut by as much (walls let it slide on)
function reflect(v, n, r) {
  const into = n.clone().multiplyScalar(-v.dot(n));
  const along = v.clone().add(into);
  return into.multiplyScalar(r).add(along.multiplyScalar(THREE.MathUtils.lerp(1, r, Math.max(n.y, 0))));
}
