import * as THREE from 'three';
import { buildSuit, animateSuit } from './suit.js';
import { addLight } from '../gfx/globals.js';
import { SUITS } from '../game/data.js';

const TAU = Math.PI * 2;
const damp = (c, t, r, dt) => c + (t - c) * (1 - Math.exp(-r * dt));
function angDiff(a, b) { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; }
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _o = new THREE.Vector3(), _d = new THREE.Vector3(), _c = new THREE.Vector3(), _near = [];

export class Player {
  constructor(game) {
    this.game = game;
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.yaw = 0; this.camYaw = 0; this.camPitch = -0.08; this.camDist = 5.4; this.camCur = 5.4;
    this.radius = 0.38; this.height = 1.8;
    this.onGround = true; this.dead = false; this.swimming = false;
    this.hp = 100; this.energy = 100; this.o2 = 100;
    this.jumps = 0; this.airT = 0; this.fireCool = 0; this.arcCool = 0; this.shieldT = 0; this.shieldCool = 0;
    this.dashCool = 0; this.dashT = 0; this.dashDir = new THREE.Vector3();
    this.buffs = { regen: 0, quick: 0, iron: 0 };
    this.hurtT = 0; this.invuln = 0; this.thrust = 0; this.stepT = 0; this.o2Warn = 0;
    this.aimPoint = new THREE.Vector3(); this.aimDir = new THREE.Vector3(0, 0, -1);
    this.targetCreature = null; this.targetNode = null; this.prompt = null; this.mining = false; this.firing = false;
    this.group = new THREE.Group();
    this.bubble = new THREE.Mesh(new THREE.SphereGeometry(1.25, 24, 16), new THREE.ShaderMaterial({
      vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float uA; uniform float uT; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.2); float h = 0.5 + 0.5 * sin(vN.y * 26.0 + uT * 6.0); gl_FragColor = vec4(vec3(0.35, 0.75, 1.0) * (f * 2.4 + h * 0.12) * uA, 1.0); }`,
      uniforms: { uA: { value: 0 }, uT: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    this.bubble.visible = false;
    this.bubble.position.y = 1.0;
    this.group.add(this.bubble);
    this.rig = null;
    this.rebuild();
  }

  get stats() { return SUITS[this.game.state.suit]; }

  rebuild() {
    const s = this.game.state;
    if (this.rig) { this.group.remove(this.rig.root); this.group.parent && this.group.parent.remove(this.rig.blob); }
    this.rig = buildSuit(s.suit, { gauntlet: s.unlocks.gauntlet, boots: s.unlocks.boots });
    this.group.add(this.rig.root);
    if (this.group.parent) this.group.parent.add(this.rig.blob);
  }

  attach(scene) { scene.add(this.group); scene.add(this.rig.blob); }

  place(pos, camYaw) {
    this.pos.copy(pos); this.vel.set(0, 0, 0);
    this.camYaw = camYaw; this.yaw = camYaw + Math.PI; this.camPitch = -0.06;
    this.onGround = true; this.camCur = this.camDist;
  }

  fullRestore() { const S = this.stats; this.hp = S.hp; this.energy = S.energy; this.o2 = S.o2; }

  damage(n, from, raw = false) {
    if (this.dead || this.invuln > 0) return;
    const g = this.game;
    if (this.shieldT > 0 && !raw) {
      g.particles.burst(_v.copy(this.pos).setY(this.pos.y + 1), 10, 5, 0.3, 0.7, 0.4, 0.8, 1, { gravity: 0 });
      g.audio.play('block', 0.6);
      return;
    }
    if (!raw) n *= (1 - this.stats.armor) * (this.buffs.iron > 0 ? 0.5 : 1);
    this.hp -= n; this.hurtT = 1; this.invuln = 0.25;
    g.ui.hurt(n);
    g.shake(Math.min(0.6, 0.15 + n * 0.012));
    g.audio.play('hurt');
    if (this.hp <= 0) { this.hp = 0; this.dead = true; g.onPlayerDeath(); }
  }

  knock(x, y, z) { this.vel.x += x; this.vel.y = Math.max(this.vel.y, y); this.vel.z += z; this.onGround = false; }

  useItem(id) {
    const g = this.game, s = g.state, S = this.stats;
    if (!(s.inv[id] > 0)) return false;
    if (id === 'oxycell') { if (this.o2 >= S.o2 - 1) { g.ui.toast('Air tank is full'); return false; } this.o2 = Math.min(S.o2, this.o2 + 60); }
    else if (id === 'serumRegen') { if (this.hp >= S.hp - 1 && this.buffs.regen <= 0) { g.ui.toast('Health is full'); return false; } this.buffs.regen = 6; }
    else if (id === 'serumQuick') this.buffs.quick = 45;
    else if (id === 'serumIron') this.buffs.iron = 45;
    else return false;
    s.inv[id]--;
    g.audio.play('use');
    g.particles.burst(_v.copy(this.pos).setY(this.pos.y + 1.2), 16, 3, 0.7, 0.8, 0.5, 1, 0.7, { gravity: -2 });
    g.ui.dirty = true;
    return true;
  }

  // Resolve what the crosshair is on: creature (with aim assist), node, or terrain.
  _aim(camera) {
    const g = this.game, w = g.world;
    const o = _o.copy(camera.position), d = _d.set(-Math.sin(this.camYaw) * Math.cos(this.camPitch), Math.sin(this.camPitch), -Math.cos(this.camYaw) * Math.cos(this.camPitch));
    this.aimDir.copy(d);
    const assist = g.input.isTouch ? 0.16 : 0.06;
    let best = null, bestScore = 1e9, bestT = 0;
    for (const c of g.creatures) {
      if (c.dead) continue;
      const cc = c.center(_c);
      const ox = cc.x - o.x, oy = cc.y - o.y, oz = cc.z - o.z;
      const t = ox * d.x + oy * d.y + oz * d.z;
      if (t < this.camCur * 0.8 || t > 75) continue;
      const px = ox - d.x * t, py = oy - d.y * t, pz = oz - d.z * t;
      const miss = Math.sqrt(px * px + py * py + pz * pz) - c.radius;
      if (miss > assist * t) continue;
      const score = Math.max(0, miss) / t + t * 0.0006;
      if (score < bestScore) { bestScore = score; best = c; bestT = t; }
    }
    this.targetCreature = best;
    let node = null;
    if (w.nodes) {
      node = w.nodes.pick(o, d, this.camCur + 9, g.input.isTouch ? 0.9 : 0.4);
      if (node && Math.hypot(node.x - this.pos.x, node.z - this.pos.z) > 8.5) node = null;
    }
    this.targetNode = best && bestT < this.camCur + 6 ? null : node;
    if (best && !this.targetNode) best.center(this.aimPoint);
    else if (this.targetNode) w.nodes.center(this.targetNode, this.aimPoint);
    else {
      let t = w.terrain ? w.terrain.raycast(o, d, 90) : -1;
      if (t < 0) {
        t = 60;
        for (let s = 4; s < 60; s += 1.5) { if (w.solidAt(o.x + d.x * s, o.y + d.y * s, o.z + d.z * s)) { t = s; break; } }
      }
      this.aimPoint.copy(o).addScaledVector(d, Math.max(t, this.camCur + 2));
    }
  }

  update(dt, camera) {
    const g = this.game, inp = g.input, w = g.world, s = g.state, S = this.stats;
    const grav = w.gravity;
    // --- look
    const sens = 0.0023 * inp.sens;
    this.camYaw -= inp.look.x * sens;
    this.camPitch -= inp.look.y * sens * (inp.invertY ? -1 : 1);
    this.camPitch = Math.max(-1.15, Math.min(1.2, this.camPitch));
    if (inp.wheel) this.camDist = Math.max(3.2, Math.min(9, this.camDist + inp.wheel * 0.6));

    this.fireCool -= dt; this.arcCool -= dt; this.shieldCool -= dt; this.dashCool -= dt; this.invuln -= dt;
    this.hurtT = Math.max(0, this.hurtT - dt);
    for (const k in this.buffs) if (this.buffs[k] > 0) this.buffs[k] -= dt;
    if (this.buffs.regen > 0) this.hp = Math.min(S.hp, this.hp + (70 / 6) * dt);

    if (this.dead) {
      this.vel.x *= 0.9; this.vel.z *= 0.9;
      this._camera(dt, camera);
      return;
    }

    // --- movement intent
    const fx = -Math.sin(this.camYaw), fz = -Math.cos(this.camYaw), rx = Math.cos(this.camYaw), rz = -Math.sin(this.camYaw);
    let wx = fx * inp.move.y + rx * inp.move.x, wz = fz * inp.move.y + rz * inp.move.x;
    const wl = Math.hypot(wx, wz);
    const moving = wl > 0.08;
    const sprint = inp.held.sprint && moving && !this.swimming;
    let maxSpeed = (sprint ? 8.8 : 5.5) * (this.buffs.quick > 0 ? 1.35 : 1);
    if (this.swimming) maxSpeed *= 0.55;
    if (!this.onGround && this.thrust > 0.1) maxSpeed = Math.max(maxSpeed, 11);
    const accel = this.onGround ? 60 : this.thrust > 0.1 ? 26 : 12;
    const tvx = moving ? (wx / Math.max(wl, 1)) * maxSpeed * Math.min(1, wl) : 0, tvz = moving ? (wz / Math.max(wl, 1)) * maxSpeed * Math.min(1, wl) : 0;
    const k = Math.min(1, accel * dt / Math.max(maxSpeed, 1));
    if (this.onGround || moving) { this.vel.x += (tvx - this.vel.x) * k; this.vel.z += (tvz - this.vel.z) * k; }
    else { this.vel.x *= 1 - 0.4 * dt; this.vel.z *= 1 - 0.4 * dt; }

    // --- jump / double jump / thrusters / dash
    const jumpPressed = inp.consume('jump');
    const jumpHeld = inp.held.jump || inp.held.jumpKey;
    const jv = Math.sqrt(2 * grav * (grav < 12 ? 2.3 : 1.55));
    if (jumpPressed) {
      if (this.onGround || this.swimming) { this.vel.y = jv; this.onGround = false; this.jumps = 1; this.airT = 0; g.audio.play('jump', 0.5); }
      else if (s.unlocks.boots && this.jumps < 2) {
        this.vel.y = jv * 1.08; this.jumps = 2;
        g.particles.burst(this.pos, 18, 4, 0.4, 0.8, 0.5, 0.9, 1, { gravity: 0, vy: -3 });
        g.audio.play('boost', 0.6);
      }
    }
    this.thrust = damp(this.thrust, 0, 10, dt);
    if (s.suit >= 3 && !this.onGround && jumpHeld && this.airT > 0.2 && this.energy > 1) {
      if (this.vel.y < 7.5) this.vel.y += (grav + 17) * dt;
      this.energy -= 11 * dt;
      this.thrust = damp(this.thrust, 1, 30, dt);
      if (Math.random() < dt * 60) g.particles.emit(this.pos.x + (Math.random() - 0.5) * 0.3, this.pos.y + 0.9, this.pos.z + (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 1.5, -7, (Math.random() - 0.5) * 1.5, 0.35, 0.8, 0.5, 1, 0.9, 0, 2);
      g.audio.loop('thrust', 0.35);
    } else g.audio.loop('thrust', 0);
    if (inp.consume('dash')) {
      if (!s.unlocks.dash) { if (!g.input.isTouch) g.ui.hint('dash', 'Phase Dash is not built yet'); }
      else if (this.dashCool <= 0 && this.energy >= 18) {
        this.dashT = 0.16; this.dashCool = 2.0; this.invuln = 0.32; this.energy -= 18;
        if (moving) this.dashDir.set(wx / wl, 0, wz / wl); else this.dashDir.set(fx, 0, fz);
        g.audio.play('dash');
        g.particles.burst(_v.copy(this.pos).setY(this.pos.y + 1), 26, 3, 0.5, 1.0, 0.7, 0.5, 1, { gravity: 0 });
      }
    }
    if (this.dashT > 0) {
      this.dashT -= dt;
      this.vel.x = this.dashDir.x * 56; this.vel.z = this.dashDir.z * 56; this.vel.y = 0;
      g.particles.emit(this.pos.x, this.pos.y + 0.5 + Math.random() * 1.2, this.pos.z, 0, 0, 0, 0.3, 1.0, 0.7, 0.5, 1, 0, 0);
      if (this.dashT <= 0) { this.vel.x *= 0.15; this.vel.z *= 0.15; }
    } else if (!this.onGround) this.vel.y -= grav * dt;

    // --- horizontal move with slope limit and wall collision
    const prevY = this.pos.y;
    const steps = Math.max(1, Math.ceil((Math.hypot(this.vel.x, this.vel.z) * dt) / 0.35));
    const sdt = dt / steps;
    for (let i = 0; i < steps; i++) {
      const dx = this.vel.x * sdt, dz = this.vel.z * sdt;
      const dl = Math.hypot(dx, dz);
      if (dl > 1e-5) {
        const tooSteep = (nx, nz) => this.onGround && w.groundAt(nx, nz, this.pos.y) - this.pos.y > dl * 1.3 + 0.03 && w.groundAt(nx, nz, this.pos.y) - this.pos.y < 3;
        if (!tooSteep(this.pos.x + dx, this.pos.z + dz)) { this.pos.x += dx; this.pos.z += dz; }
        else if (!tooSteep(this.pos.x + dx, this.pos.z)) this.pos.x += dx;
        else if (!tooSteep(this.pos.x, this.pos.z + dz)) this.pos.z += dz;
      }
      w.resolve(this.pos, this.radius, this.pos.y, this.pos.y + this.height);
    }
    // --- vertical
    this.pos.y += this.vel.y * dt;
    let gy = w.groundAt(this.pos.x, this.pos.z, Math.max(prevY, this.pos.y));
    this.swimming = false;
    if (w.sea > -1e8 && gy < w.sea - 1.2) {
      if (w.def.lava) {
        if (this.pos.y < w.sea + 0.3) { this.damage(22, null, true); this.vel.y = 9; this.pos.y = w.sea + 0.35; g.ui.hint('lava', 'Molten slag. Stay out of it'); }
      } else { gy = w.sea - 1.2; if (this.pos.y <= gy + 0.05) this.swimming = true; }
    }
    const wasGround = this.onGround;
    if (this.pos.y <= gy) {
      if (this.vel.y < -27 && !s.unlocks.boots && !this.swimming) this.damage((-this.vel.y - 27) * 3, null, true);
      if (!wasGround && this.vel.y < -6) { g.audio.play('land', 0.4); g.particles.burst(this.pos, 8, 2, 0.4, 0.8, 0.5, 0.45, 0.5, { gravity: 2 }); }
      this.pos.y = gy; this.vel.y = 0; this.onGround = true; this.jumps = 0;
    } else if (wasGround && this.vel.y <= 0 && this.pos.y - gy < 0.6 && this.dashT <= 0) { this.pos.y = gy; this.vel.y = 0; }
    else this.onGround = false;
    this.airT = this.onGround ? 0 : this.airT + dt;
    if (w.type === 'vault' && this.pos.y > 7.4) { this.pos.y = 7.4; if (this.vel.y > 0) this.vel.y = 0; }
    // slide off slopes that are too steep to stand on
    if (this.onGround && w.terrain && this.pos.y - w.terrain.heightAt(this.pos.x, this.pos.z) < 0.05) {
      w.terrain.normalAt(this.pos.x, this.pos.z, _v);
      if (_v.y < 0.62) { this.vel.x += _v.x * 26 * dt; this.vel.z += _v.z * 26 * dt; }
    }

    // --- vitals
    const camp = w.safeAt(this.pos.x, this.pos.z);
    if (this.thrust < 0.1 && this.shieldT <= 0) this.energy = Math.min(S.energy, this.energy + S.regen * dt);
    let drain = w.type === 'vault' ? 0.2 : w.def.kind === 'korr' ? 0.55 : s.unlocks.symbiote ? 0 : s.stations.still ? 0.36 : 0.25;
    if (camp && (s.stations.still || w.def.kind === 'korr')) { this.o2 = Math.min(S.o2, this.o2 + 30 * dt); drain = 0; }
    else if (camp) { this.o2 = Math.min(S.o2, this.o2 + 1.5 * dt); drain = 0; }
    this.o2 = Math.max(0, this.o2 - drain * dt);
    if (this.o2 <= 0) {
      this.hp -= 5 * dt;
      this.o2Warn -= dt;
      if (this.o2Warn <= 0) { this.o2Warn = 4; g.ui.toast('No air. Get to camp or use an Oxy-Cell', 'bad'); g.audio.play('warn'); }
      if (this.hp <= 0) { this.hp = 0; this.dead = true; g.onPlayerDeath(); }
    } else if (this.o2 < S.o2 * 0.2) { this.o2Warn -= dt; if (this.o2Warn <= 0) { this.o2Warn = 14; g.ui.toast('Air below 20%', 'warn'); g.audio.play('warn', 0.5); } }
    if (camp && this.hp < S.hp && this.hurtT <= 0) this.hp = Math.min(S.hp, this.hp + 4 * dt);

    this._camera(dt, camera);
    this._aim(camera);

    // --- consumables
    const quick = ['serumRegen', 'serumQuick', 'serumIron', 'oxycell'];
    for (let i = 0; i < 4; i++) if (inp.consume('use' + (i + 1))) this.useItem(quick[i]);

    // --- interact
    this.prompt = null;
    let bestD = 1e9;
    for (const it of w.interactables) {
      const d = Math.hypot(it.pos.x - this.pos.x, it.pos.z - this.pos.z);
      if (d > it.r || Math.abs(it.pos.y - 1.2 - this.pos.y) > 3.5) continue;
      const label = it.label();
      if (!label) continue;
      if (d < bestD) { bestD = d; this.prompt = { label, it }; }
    }
    if (w.nodes) {
      const near = w.nodes.near(this.pos.x, this.pos.z, 2.7, _near);
      for (const nd of near) {
        if (!nd.T.hand) continue;
        const d = Math.hypot(nd.x - this.pos.x, nd.z - this.pos.z);
        if (d < bestD && Math.abs(nd.y - this.pos.y) < 2.5) { bestD = d; this.prompt = { label: nd.T.hand + ' ' + nd.T.label, it: { act: () => w.nodes.mine(nd, 9999) } }; }
      }
    }
    if (inp.consume('interact') && this.prompt) { g.audio.play('ui'); this.prompt.it.act(); }

    // --- weapons
    this.firing = false; this.mining = false;
    const wantFire = inp.held.fire;
    if (wantFire && !s.unlocks.gauntlet) g.ui.hint('nogauntlet', 'No tools yet. Open Craft and assemble the Pulse Gauntlet');
    if (wantFire && s.unlocks.gauntlet) {
      this.firing = true;
      const mz = this.rig.muzzle;
      if (this.targetNode) {
        this.mining = true;
        const power = s.unlocks.gauntlet2 ? 30 : 14;
        const c = w.nodes.center(this.targetNode, _c);
        const hitP = _v2.copy(c).add(_v.set((Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3));
        g.combat.segment(mz, hitP, 0.045, [0.4, 1, 0.95], 0.05);
        if (Math.random() < dt * 40) g.particles.emit(hitP.x, hitP.y, hitP.z, (Math.random() - 0.5) * 5, Math.random() * 4, (Math.random() - 0.5) * 5, 0.4, 0.5, 0.6, 1, 0.9, 9, 1);
        addLight(hitP.x, hitP.y, hitP.z, 5, 0.3, 0.9, 0.8);
        g.audio.loop('beam', 0.3);
        w.nodes.mine(this.targetNode, power * dt);
      } else {
        g.audio.loop('beam', 0);
        if (this.fireCool <= 0) {
          this.fireCool = 0.16;
          const dir = _v.copy(this.aimPoint).sub(mz).normalize();
          // never fire backwards through the body when aiming at something very close
          if (dir.dot(this.aimDir) < 0.2) dir.copy(this.aimDir);
          g.combat.playerBolt(mz, dir, s.unlocks.gauntlet2 ? 23 : 14, s.unlocks.gauntlet2 ? [0.6, 0.75, 1] : [0.4, 1, 0.9]);
          this.rig.kick = 1;
          g.audio.play('shot', 0.45);
          addLight(mz.x, mz.y, mz.z, 6, 0.4, 0.9, 0.8, 1);
        }
      }
    } else g.audio.loop('beam', 0);

    if (inp.consume('arc')) {
      if (!s.unlocks.arc) { if (!g.input.isTouch) g.ui.hint('arc', 'Arc Caster is not built yet'); }
      else if (this.arcCool <= 0 && this.energy >= 25) this._castArc();
    }
    if (inp.consume('shield')) {
      if (!s.unlocks.aegis) { if (!g.input.isTouch) g.ui.hint('aegis', 'Aegis Barrier is not built yet'); }
      else if (this.shieldCool <= 0 && this.energy >= 20) { this.shieldT = 4; this.shieldCool = 10; this.energy -= 20; g.audio.play('shield'); }
    }
    if (this.shieldT > 0) this.shieldT -= dt;
    this.bubble.visible = this.shieldT > 0;
    if (this.bubble.visible) { this.bubble.material.uniforms.uA.value = Math.min(1, this.shieldT * 2); this.bubble.material.uniforms.uT.value += dt; }

    // --- model
    const speed = Math.hypot(this.vel.x, this.vel.z);
    const aiming = this.firing || this.arcCool > 3.1;
    let face = this.yaw;
    if (aiming) face = Math.atan2(this.aimPoint.x - this.pos.x, this.aimPoint.z - this.pos.z);
    else if (speed > 0.6) face = Math.atan2(this.vel.x, this.vel.z);
    this.yaw += angDiff(this.yaw, face) * Math.min(1, dt * (aiming ? 22 : 11));
    this.group.position.copy(this.pos);
    if (this.swimming) this.group.position.y += Math.sin(g.time * 2) * 0.05;
    this.rig.root.rotation.y = this.yaw;
    const pitchToAim = Math.atan2(this.aimPoint.y - (this.pos.y + 1.5), Math.hypot(this.aimPoint.x - this.pos.x, this.aimPoint.z - this.pos.z));
    animateSuit(this.rig, { speed, onGround: this.onGround || this.swimming, vy: this.vel.y, aiming, aimPitch: -pitchToAim, hover: this.thrust > 0.3, thrust: this.thrust, time: g.time, sprint }, dt);
    this.rig.root.rotation.x = this.dashT > 0 ? 0.5 : 0;
    this.rig.mat.uniforms.uFlash.value = this.hurtT > 0.75 ? 0.5 : 0;
    const gyB = w.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.1);
    this.rig.blob.position.set(this.pos.x, gyB + 0.04, this.pos.z);
    this.rig.blob.material.uniforms.uA.value = 0.6 * Math.max(0, 1 - (this.pos.y - gyB) / 6);
    this.rig.blob.visible = !this.swimming;
    if (this.onGround && speed > 1) {
      this.stepT -= dt * speed;
      if (this.stepT <= 0) { this.stepT = 2.3; g.audio.play('step', 0.22); }
    }
    const gl = this.rig.tier;
    const vl = w.type === 'vault' ? 2.2 : 1;
    addLight(this.pos.x, this.pos.y + 1.5, this.pos.z, w.type === 'vault' ? 13 : 7.5, (gl === 1 ? 0.5 : 0.3) * vl, 0.42 * vl, (gl === 1 ? 0.3 : 0.5) * vl, 2);
  }

  _castArc() {
    const g = this.game;
    const hits = [];
    let from = this.targetCreature;
    if (!from) {
      let best = 1e9;
      for (const c of g.creatures) {
        if (c.dead) continue;
        const cc = c.center(_c);
        const d = cc.distanceTo(this.pos);
        if (d > 26) continue;
        _v.copy(cc).sub(this.pos).normalize();
        if (_v.x * this.aimDir.x + _v.z * this.aimDir.z < 0.55) continue;
        if (d < best) { best = d; from = c; }
      }
    }
    if (!from) { g.audio.play('ui'); g.ui.hint('arcmiss', 'No target in range'); return; }
    hits.push(from);
    while (hits.length < 4) {
      const last = hits[hits.length - 1].center(new THREE.Vector3());
      let nx = null, best = 10;
      for (const c of g.creatures) {
        if (c.dead || hits.includes(c)) continue;
        const d = c.center(_c).distanceTo(last);
        if (d < best) { best = d; nx = c; }
      }
      if (!nx) break;
      hits.push(nx);
    }
    this.arcCool = 3.5; this.energy -= 25;
    let prev = this.rig.muzzle.clone(), dmg = 62;
    for (const c of hits) {
      const p = c.center(new THREE.Vector3());
      g.combat.arc(prev, p, [0.55, 0.75, 1.0]);
      g.combat.arc(prev, p, [0.9, 0.95, 1.0], 0.14);
      c.damage(dmg, prev);
      g.ui.floatText(p, Math.round(dmg), '#9fc4ff');
      g.particles.burst(p, 14, 6, 0.4, 0.8, 0.6, 0.8, 1, { gravity: 0 });
      addLight(p.x, p.y, p.z, 9, 0.6, 0.8, 1.4, 1);
      prev = p; dmg *= 0.8;
    }
    g.audio.play('arc');
    g.shake(0.2);
  }

  _camera(dt, camera) {
    const g = this.game, w = g.world;
    const cy = this.camYaw, cp = this.camPitch;
    const fx = -Math.sin(cy) * Math.cos(cp), fy = Math.sin(cp), fz = -Math.cos(cy) * Math.cos(cp);
    const rx = Math.cos(cy), rz = -Math.sin(cy);
    const narrow = g.gfx.aspect < 1;
    const want = this.camDist * (narrow ? 1.15 : 1);
    const sh = (narrow ? 0.38 : 0.7) * Math.min(1, this.camCur / 4);
    const tx = this.pos.x + rx * sh, ty = this.pos.y + 1.62, tz = this.pos.z + rz * sh;
    let hit = want;
    for (let i = 1; i <= 12; i++) {
      const t = (i / 12) * want;
      const px = tx - fx * t, py = ty - fy * t, pz = tz - fz * t;
      if (w.solidAt(px, py - 0.15, pz)) { hit = Math.max(1.5, t - 0.45); break; }
    }
    this.camCur = hit < this.camCur ? hit : damp(this.camCur, hit, 5, dt);
    const d = this.camCur;
    const lift = Math.max(0, want - d) * 0.22;
    camera.position.set(tx - fx * d, ty - fy * d + lift, tz - fz * d);
    this.group.visible = d > 1.05 || this.dead;
    const gy = w.groundAt(camera.position.x, camera.position.z, camera.position.y + 2) + 0.3;
    if (camera.position.y < gy && camera.position.y > gy - 6) camera.position.y = gy;
    if (w.sea > -1e8 && !w.def.lava && camera.position.y < w.sea + 0.25) camera.position.y = w.sea + 0.25;
    if (g.shakeAmt > 0.001) {
      camera.position.x += (Math.random() - 0.5) * g.shakeAmt * 0.5;
      camera.position.y += (Math.random() - 0.5) * g.shakeAmt * 0.5;
    }
    camera.rotation.order = 'YXZ';
    camera.rotation.set(cp, cy, 0);
    const sp = Math.hypot(this.vel.x, this.vel.z);
    const base = narrow ? Math.min(88, (2 * Math.atan(Math.tan((58 * Math.PI) / 360) / Math.max(g.gfx.aspect, 0.4)) * 180) / Math.PI) : 62;
    const fov = base + Math.min(8, Math.max(0, sp - 6) * 1.6) + (this.dashT > 0 ? 9 : 0);
    camera.fov = damp(camera.fov, fov, 8, dt);
  }
}
