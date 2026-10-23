import * as THREE from 'three';
import { SPAWNS } from '../world/city/layout.js';
import { pathAt } from '../world/city/route.js';
import { ARENA, terrainY } from '../world/arena.js';
import { clamp } from '../engine/math.js';

// Payload: the attackers escort a GDA transport along the route; it moves while attackers stand
// near it and no defender does, faster with more of them, and rolls back when left alone.
// Checkpoints add time and move both teams' spawns up; when the clock runs out with attackers
// still on it, overtime holds until they all step off.
export const PAYLOAD = {
  radius: 7.5, height: 6,
  speeds: [0, 2.4, 2.75, 3.1], // m/s for 0, 1, 2, 3+ attackers on it
  rollbackDelay: 12, rollback: 0.7,
  setup: 20,
  time: [160, 180, 170], // to A, then added on A, then on B
  overtimeGrace: 3,
  respawn: { attack: 7, defend: 8.5 }, // the attackers' walk back is the longer one
  spawnDamage: 140, spawnHeal: 180, // per second, to enemies / allies inside a spawn room
};
const _v = new THREE.Vector3(), _w = new THREE.Vector3();

// ---------------------------------------------------------------- the transport
function gdaDecal() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#1d2430'; g.fillRect(0, 0, 256, 128);
  g.fillStyle = '#e8e4d8'; g.font = 'bold 72px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('GDA', 128, 54);
  g.font = 'bold 15px Arial, sans-serif'; g.fillText('GLOBAL DEFENSE AGENCY', 128, 104);
  g.strokeStyle = '#e3b11e'; g.lineWidth = 5; g.strokeRect(6, 6, 244, 116);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function hazardTex() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = '#e3b11e'; g.fillRect(0, 0, 128, 32);
  g.fillStyle = '#141414';
  for (let x = -32; x < 160; x += 32) { g.beginPath(); g.moveTo(x, 32); g.lineTo(x + 16, 32); g.lineTo(x + 32, 0); g.lineTo(x + 16, 0); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping;
  return t;
}
/** an extruded profile ([u, v] in the plane given by axes) as a BufferGeometry */
function prism(pts, depth, plane) {
  const shape = new THREE.Shape(pts.map(([u, v]) => new THREE.Vector2(u, v)));
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  g.translate(0, 0, -depth / 2);
  if (plane === 'zy') g.rotateY(-Math.PI / 2); // profile drawn in (z, y), extruded along x
  return g;
}

export class PayloadCart {
  constructor(scene) {
    const g = this.root = new THREE.Group();
    g.name = 'payload';
    const body = new THREE.MeshStandardMaterial({ color: 0x1f2733, roughness: 0.42, metalness: 0.55 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x121417, roughness: 0.6, metalness: 0.5 });
    const steel = new THREE.MeshStandardMaterial({ color: 0x8e979f, roughness: 0.3, metalness: 0.85 });
    const rubber = new THREE.MeshStandardMaterial({ color: 0x0f0f10, roughness: 0.9 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x0b1216, roughness: 0.12, metalness: 0.3 });
    const hazard = new THREE.MeshStandardMaterial({ map: hazardTex(), roughness: 0.6 });
    const decal = new THREE.MeshStandardMaterial({ map: gdaDecal(), roughness: 0.5, metalness: 0.3 });
    this.coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 3.4, 4.2) });
    this.lightMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.5, 2.5, 2.5) });
    const add = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
    // chassis and armoured hull (+z is forward)
    add(new THREE.BoxGeometry(2.3, 0.5, 6.9), dark, 0, 0.72, 0);
    add(prism([[-1.36, 0], [1.36, 0], [1.48, 0.45], [1.22, 0.92], [-1.22, 0.92], [-1.48, 0.45]], 5.3, 'xy'), body, 0, 0.98, -0.75);
    // the cab: a sloped armoured front, slit windows
    add(prism([[1.9, 0], [3.45, 0], [3.52, 0.62], [3.05, 1.62], [1.9, 1.78]], 2.56, 'zy'), body, 0, 0.98, 0);
    const ws = add(new THREE.PlaneGeometry(2.1, 0.5), glass, 0, 2.1, 3.31); ws.rotation.x = -0.44;
    for (const s of [-1, 1]) { const w = add(new THREE.PlaneGeometry(0.9, 0.42), glass, s * 1.285, 2.25, 2.55); w.rotation.y = s * Math.PI / 2; }
    for (const s of [-1, 1]) { const d = add(new THREE.PlaneGeometry(1.15, 0.58), decal, s * 1.29, 1.55, 2.6); d.rotation.y = s * Math.PI / 2; }
    // bumpers with hazard stripes, a ram plate up front
    for (const z of [-3.5, 3.55]) { const b = add(new THREE.BoxGeometry(2.7, 0.42, 0.3), hazard, 0, 0.85, z); b.castShadow = true; }
    add(new THREE.BoxGeometry(2.2, 0.7, 0.12), dark, 0, 1.25, 3.62).rotation.x = 0.25;
    // six wheels
    const wg = new THREE.CylinderGeometry(0.56, 0.56, 0.42, 18); wg.rotateZ(Math.PI / 2);
    const rg = new THREE.CylinderGeometry(0.3, 0.3, 0.44, 12); rg.rotateZ(Math.PI / 2);
    this.wheels = [];
    for (const z of [-2.45, -1.0, 2.45]) for (const s of [-1, 1]) { const w = add(wg, rubber, s * 1.25, 0.56, z); w.add(new THREE.Mesh(rg, steel)); this.wheels.push(w); }
    // the containment pod on the bed: a steel cylinder, windows onto the glowing core, two spinning rings
    const pod = new THREE.Group(); pod.position.set(0, 2.82, -0.95); g.add(pod);
    const cyl = (r0, r1, len, mat) => { const c = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, len, 24, 1, false), mat); c.rotation.x = Math.PI / 2; c.castShadow = c.receiveShadow = true; pod.add(c); return c; };
    const shell = cyl(0.98, 0.98, 3.4, steel); shell.material = steel;
    // window bands onto the core, glowing through the shell
    const sg = new THREE.BoxGeometry(0.3, 0.05, 2.7);
    for (const a of [Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75]) {
      const strip = new THREE.Mesh(sg, this.coreMat);
      strip.position.set(Math.sin(a) * 0.99, Math.cos(a) * 0.99, 0); strip.rotation.z = -a;
      pod.add(strip);
    }
    for (const z of [-1.75, 1.75]) cyl(1.06, 1.06, 0.18, dark).position.z = z;
    this.rings = [];
    for (const z of [-0.85, 0.85]) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(1.22, 0.07, 8, 40), steel); r.position.z = z; pod.add(r); this.rings.push(r);
    }
    // cradles under the pod
    for (const z of [-2.1, 0.2]) add(new THREE.BoxGeometry(2.0, 0.45, 0.5), dark, 0, 2.05, z);
    // light bar on the cab roof (it shows who has the payload)
    add(new THREE.BoxGeometry(1.8, 0.16, 0.3), this.lightMat, 0, 2.86, 2.25);
    // the push radius on the ground: a ribbon following the terrain
    const N = 72;
    this.ringGeo = new THREE.BufferGeometry();
    this.ringPos = new Float32Array((N + 1) * 2 * 3);
    this.ringGeo.setAttribute('position', new THREE.BufferAttribute(this.ringPos, 3));
    const idx = [];
    for (let i = 0; i < N; i++) { const a = i * 2, b = a + 1, c = a + 2, d = a + 3; idx.push(a, c, b, b, c, d); }
    this.ringGeo.setIndex(idx);
    this.ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1), transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.ring = new THREE.Mesh(this.ringGeo, this.ringMat); this.ring.frustumCulled = false; this.ring.renderOrder = 8;
    this.ringN = N;
    scene.add(g, this.ring);
    this.scene = scene;
    this.boxes = [0, 1, 2].map(() => ({ type: 'box', min: new THREE.Vector3(), max: new THREE.Vector3(), payload: true }));
    this.t = 0;
  }
  /** put it at (x, y, z), heading yaw, nose pitched by pitch; refresh the colliders */
  place(x, y, z, yaw, pitch, roll = 0) {
    const g = this.root;
    g.position.set(x, y, z);
    g.rotation.set(0, 0, 0); g.rotateY(yaw); g.rotateX(-pitch); g.rotateZ(roll);
    g.updateMatrixWorld(true);
    const segs = [[-3.55, -1.2, 3.85], [-1.2, 1.1, 3.85], [1.1, 3.65, 2.8]];
    const c = new THREE.Vector3();
    segs.forEach(([z0, z1, h], i) => {
      const b = this.boxes[i];
      b.min.set(Infinity, Infinity, Infinity); b.max.set(-Infinity, -Infinity, -Infinity);
      for (const xx of [-1.4, 1.4]) for (const zz of [z0, z1]) for (const yy of [0.3, h]) {
        c.set(xx, yy, zz).applyMatrix4(g.matrixWorld);
        b.min.min(c); b.max.max(c);
      }
    });
  }
  update(dt, speed, color, ringK) {
    this.t += dt;
    for (const r of this.rings) r.rotation.z += dt * (0.8 + speed * 0.9) * (r === this.rings[0] ? 1 : -1.3);
    for (const w of this.wheels) w.rotation.x += dt * speed / 0.56;
    const pulse = 0.8 + 0.2 * Math.sin(this.t * 3) + speed * 0.15;
    this.coreMat.color.setRGB(1.4 * pulse, 3.0 * pulse, 3.8 * pulse);
    this.lightMat.color.copy(color).multiplyScalar(2.2 + 0.8 * Math.sin(this.t * 6));
    // the ring ribbon round the cart, on the ground
    const p = this.root.position, R = PAYLOAD.radius, N = this.ringN;
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2, cx = Math.cos(a), cz = Math.sin(a);
      for (const [k, r] of [[0, R - 0.16], [1, R + 0.16]]) {
        const x = p.x + cx * r, z = p.z + cz * r;
        const o = (i * 2 + k) * 3;
        this.ringPos[o] = x; this.ringPos[o + 1] = terrainY(x, z) + 0.07; this.ringPos[o + 2] = z;
      }
    }
    this.ringGeo.attributes.position.needsUpdate = true;
    this.ringMat.color.copy(color).multiplyScalar(ringK);
  }
  dispose() {
    this.scene.remove(this.root, this.ring);
    this.root.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    this.ringGeo.dispose();
  }
}

// ---------------------------------------------------------------- spawn doors
/** a hard-light wall across a spawn room's open side while setup holds the attackers in */
function spawnDoor({ room, door }, color) {
  const [x0, z0, x1, z1] = room;
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { uT: { value: 0 }, uC: { value: new THREE.Color(color) } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uT; uniform vec3 uC; varying vec2 vUv;
      void main() {
        float hex = abs(fract(vUv.x * 18.0 + floor(vUv.y * 8.0) * 0.5) - 0.5) + abs(fract(vUv.y * 8.0) - 0.5);
        float lines = smoothstep(0.42, 0.5, hex) * 0.5 + smoothstep(0.97, 1.0, fract(vUv.y * 2.0 - uT * 0.4)) * 0.6;
        float edge = smoothstep(0.04, 0.0, min(vUv.y, 1.0 - vUv.y)) * 0.8;
        float a = (0.12 + lines + edge) * (0.75 + 0.25 * sin(uT * 3.0));
        gl_FragColor = vec4(uC * a * 1.6, a);
      }`,
  });
  const best = { z0: [x0, z0, x1, z0], z1: [x0, z1, x1, z1], x0: [x0, z0, x0, z1], x1: [x1, z0, x1, z1] }[door];
  const len = Math.hypot(best[2] - best[0], best[3] - best[1]), H = 9;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(len, H), mat);
  m.position.set((best[0] + best[2]) / 2, H / 2, (best[1] + best[3]) / 2);
  m.rotation.y = best[1] === best[3] ? 0 : Math.PI / 2;
  m.renderOrder = 9;
  // and a wall nobody passes until setup ends (a box half a metre thick on the door's line)
  const t = 0.3, along = best[1] === best[3];
  m.userData.box = { type: 'box', min: new THREE.Vector3(Math.min(best[0], best[2]) - (along ? 0 : t), 0, Math.min(best[1], best[3]) - (along ? t : 0)), max: new THREE.Vector3(Math.max(best[0], best[2]) + (along ? 0 : t), 60, Math.max(best[1], best[3]) + (along ? t : 0)) };
  return m;
}

// ---------------------------------------------------------------- the mode
export class PayloadMode {
  constructor(game, map, { attackers = 0 } = {}) {
    this.g = game; this.w = game.world; this.map = map;
    this.att = attackers; this.dfn = 1 - attackers;
    this.path = map.path;
    this.cart = new PayloadCart(game.scene);
    this.s = 0; this.phase = 0; this.floorS = 0;
    this.state = 'setup'; this.clock = PAYLOAD.setup; this.timeLeft = PAYLOAD.time[0];
    this.sinceAttack = 0; this.overT = 0;
    this.speed = 0; this.att_n = 0; this.def_n = 0;
    this.result = null;
    const rt = [0, 0]; rt[this.att] = PAYLOAD.respawn.attack; rt[this.dfn] = PAYLOAD.respawn.defend;
    this.w.respawnTime = rt;
    this.events = [];
    this.applySpawns();
    this.doors = [spawnDoor(SPAWNS.attack[0], this.att === 0 ? 0x4fb4ff : 0xff3b4a)];
    for (const d of this.doors) game.scene.add(d);
    this.w.dynamic = [...this.cart.boxes, ...this.doors.map((d) => d.userData.box)];
    this.placeCart(0);
    this.w.mode = this;
  }
  get attackers() { return this.att; }
  /** which team's spawn rooms are where, this phase */
  rooms() { const p = Math.min(2, this.phase); return [SPAWNS[this.att === 0 ? 'attack' : 'defend'][p], SPAWNS[this.att === 0 ? 'defend' : 'attack'][p]]; }
  applySpawns() {
    const p = Math.min(2, this.phase);
    const at = SPAWNS.attack[p], df = SPAWNS.defend[p];
    const sp = [null, null], spread = [0, 0];
    sp[this.att] = new THREE.Vector3(at.at[0], 0, at.at[1]); spread[this.att] = at.spread;
    sp[this.dfn] = new THREE.Vector3(df.at[0], 0, df.at[1]); spread[this.dfn] = df.spread;
    ARENA.spawns = sp; ARENA.spawnSpreads = spread;
  }
  /** where the cart is: position, heading and the slope under it */
  placeCart(s) {
    const P = this.path;
    const c = pathAt(P, s), f = pathAt(P, s + 2.4), r = pathAt(P, s - 2.4);
    const yf = terrainY(f.x, f.z), yr = terrainY(r.x, r.z);
    const yaw = Math.atan2(f.x - r.x, f.z - r.z);
    const pitch = Math.atan2(yf - yr, Math.hypot(f.x - r.x, f.z - r.z));
    const y = (terrainY(c.x, c.z) + yf + yr) / 3;
    this.pos = this.pos || new THREE.Vector3();
    this.pos.set(c.x, y, c.z);
    this.yaw = yaw;
    this.cart.place(c.x, y, c.z, yaw, pitch);
  }
  near(h) {
    if (h.dead || !h.targetable) return false;
    const dx = h.pos.x - this.pos.x, dz = h.pos.z - this.pos.z;
    return dx * dx + dz * dz < PAYLOAD.radius * PAYLOAD.radius && Math.abs(h.pos.y - this.pos.y) < PAYLOAD.height;
  }
  emit(type, o = {}) { this.events.push({ type, ...o }); this.w.emit('payload', { type, ...o }); }

  update(dt) {
    if (this.state === 'over') { this.cart.update(dt, 0, new THREE.Color(0.6, 0.6, 0.6), 0.4); return; }
    const w = this.w, heroes = w.heroes;
    let na = 0, nd = 0;
    for (const h of heroes) if (this.near(h)) { if (h.team === this.att) na++; else nd++; }
    this.att_n = na; this.def_n = nd;
    for (const d of this.doors) d.material.uniforms.uT.value += dt;
    // spawn rooms: enemies inside burn, allies heal; attackers held in during setup
    const rooms = this.rooms();
    for (const h of heroes) {
      if (h.dead) continue;
      for (const t of [0, 1]) {
        const r = rooms[t].room;
        if (h.pos.x < r[0] || h.pos.x > r[2] || h.pos.z < r[1] || h.pos.z > r[3]) continue;
        if (h.team === t) { if (h.hp < h.maxHp) w.heal(null, h, PAYLOAD.spawnHeal * dt, { silent: true }); }
        else w.damage(null, h, PAYLOAD.spawnDamage * dt, { type: 'dot', noFlinch: true, silent: true });
      }
      if (this.state === 'setup' && h.team === this.att) {
        const r = rooms[this.att].room;
        h.pos.x = clamp(h.pos.x, r[0] + 0.6, r[2] - 0.6); h.pos.z = clamp(h.pos.z, r[1] + 0.6, r[3] - 0.6);
      }
    }
    let speed = 0;
    if (this.state === 'setup') {
      this.clock -= dt;
      if (this.clock <= 0) {
        this.state = 'live';
        for (const d of this.doors) this.g.scene.remove(d);
        this.doors = [];
        this.w.dynamic = this.cart.boxes;
        this.emit('start');
      }
    } else {
      // moving, stopped, contested, rolling back
      if (na > 0 && nd === 0) { speed = PAYLOAD.speeds[Math.min(3, na)]; this.sinceAttack = 0; }
      else { if (na > 0) this.sinceAttack = 0; else this.sinceAttack += dt; }
      if (speed === 0 && this.sinceAttack > PAYLOAD.rollbackDelay && this.s > this.floorS) speed = -PAYLOAD.rollback;
      const before = this.s;
      this.s = clamp(this.s + speed * dt, this.floorS, this.path.len);
      if (this.s !== before) this.carryRiders(before);
      // checkpoints
      const cp = this.path.cps[this.phase];
      if (this.s >= cp - 0.01) {
        this.s = cp; this.floorS = cp;
        this.phase++;
        if (this.phase >= this.path.cps.length) { this.finish(this.att, 'delivered'); speed = 0; }
        else {
          this.timeLeft += PAYLOAD.time[this.phase];
          if (this.state === 'overtime') this.state = 'live';
          this.applySpawns();
          this.emit('checkpoint', { index: this.phase - 1, add: PAYLOAD.time[this.phase] });
        }
      }
      if (this.state === 'live') {
        this.timeLeft -= dt;
        if (this.timeLeft <= 0) { this.timeLeft = 0; if (na > 0) { this.state = 'overtime'; this.overT = PAYLOAD.overtimeGrace; this.emit('overtime'); } else this.finish(this.dfn, 'time'); }
      } else if (this.state === 'overtime') {
        if (na > 0) this.overT = PAYLOAD.overtimeGrace; else this.overT -= dt;
        if (this.overT <= 0) this.finish(this.dfn, 'time');
      }
      // status changes worth an announcement
      const st = speed > 0 ? 'moving' : speed < 0 ? 'rollback' : (na > 0 && nd > 0 ? 'contested' : 'stopped');
      if (st !== this.status && this.state !== 'over') { this.emit('status', { status: st, prev: this.status }); this.status = st; }
    }
    this.speed = speed;
    this.placeCart(this.s);
    const col = speed > 0 ? (this.att === 0 ? new THREE.Color(0.31, 0.7, 1) : new THREE.Color(1, 0.23, 0.29)) : speed < 0 ? new THREE.Color(1, 0.55, 0.15) : (na > 0 && nd > 0 ? new THREE.Color(1, 0.75, 0.2) : new THREE.Color(0.85, 0.85, 0.85));
    this.color = col;
    this.cart.update(dt, Math.abs(speed), col, speed !== 0 ? 1 : 0.55);
  }
  /** heroes standing on the cart ride with it */
  carryRiders(before) {
    const oldPos = this.pos.clone();
    const boxes = this.cart.boxes.map((b) => ({ min: b.min.clone(), max: b.max.clone() }));
    this.placeCart(this.s);
    _v.subVectors(this.pos, oldPos);
    for (const h of this.w.heroes) {
      if (h.dead || h.mode === 'fly' || !h.grounded) continue;
      if (boxes.some((b) => h.pos.x > b.min.x && h.pos.x < b.max.x && h.pos.z > b.min.z && h.pos.z < b.max.z && Math.abs(h.pos.y - b.max.y) < 0.2)) h.pos.add(_v);
    }
    void before;
  }
  finish(winner, why) {
    if (this.state === 'over') return;
    this.state = 'over'; this.result = { winner, why };
    this.emit('end', { winner, why });
  }
  /**
   * What a bot on team should go for: attackers the cart itself; defenders a line held a little
   * ahead of it (toward the next checkpoint), from where they meet whoever is pushing.
   */
  objective(team) {
    if (this.state === 'over') return null;
    if (this.state === 'setup' && team === this.att) return null;
    if (team === this.att) return { pos: this.pos, radius: PAYLOAD.radius * 0.6, attack: true };
    // once it's rolling, go and stop it; otherwise hold the line just ahead
    if (this.state !== 'setup' && (this.speed > 0 || this.state === 'overtime')) return { pos: this.pos, radius: PAYLOAD.radius * 0.7, attack: false, cart: this.pos };
    const next = this.path.cps[Math.min(this.phase, this.path.cps.length - 1)];
    const d = Math.min(this.s + 11, next + 4);
    const p = pathAt(this.path, d);
    this._hold = this._hold || new THREE.Vector3();
    this._hold.set(p.x, terrainY(p.x, p.z), p.z);
    return { pos: this._hold, radius: 10, attack: false, cart: this.pos };
  }
  /** the box of team's enemies' spawn room this phase (where team takes damage) */
  enemyRoom(team) { return this.rooms()[1 - team].room; }
  /** progress 0..1 along the whole route */
  get progress() { return this.s / this.path.len; }
  dispose() {
    this.cart.dispose();
    for (const d of this.doors) this.g.scene.remove(d);
    this.w.dynamic = [];
    this.w.mode = null;
    this.w.respawnTime = null;
  }
}
