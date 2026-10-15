import * as THREE from '../../vendor/three.module.min.js';
import { buildBody, makeZombieMaterial } from './avatar.js';
import { rbox } from './gunmodels.js';
import { raySphere, rayCapsule } from './zombies.js';
import { std, mergeGeometries } from '../world/materials.js';
import { audio } from '../engine/audio.js';
import { clamp, lerp, rand, chance, smoothstep, damp, dampAngle, wrapAngle } from '../util.js';

// THE NIGHTWARDEN: Subject Zero of the Avion exo program, grown into a prototype night-ops
// frame. While it is dark an umbral shield soaks up nearly every hit. Daylight from the
// Daybreak array burns the shield away and cracks its chest plates open over the core.

const S = 1.95; // body scale: about 3.2 m tall
const NIGHT_TAKE = 0.08; // fraction of damage that gets through the shield
const SUMMON_AT = [0.75, 0.45, 0.2];
const X = new THREE.Vector3(1, 0, 0);
const NX = new THREE.Vector3(-1, 0, 0);
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let GLOW = null;
export function glowSprite(color, size) {
  GLOW = GLOW || glowTexture();
  const m = new THREE.SpriteMaterial({ map: GLOW, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false });
  const s = new THREE.Sprite(m);
  s.scale.setScalar(size);
  return s;
}

const shieldVert = /* glsl */ `
varying vec3 vN;
varying vec3 vV;
varying vec3 vP;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vP = position;
  vN = normalize(mat3(modelMatrix) * normal);
  vV = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const shieldFrag = /* glsl */ `
uniform float uTime;
uniform float uAlpha;
uniform float uHit;
uniform vec3 uColor;
varying vec3 vN;
varying vec3 vV;
varying vec3 vP;
void main() {
  float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 3.2);
  float bands = 0.5 + 0.5 * sin(vP.y * 16.0 - uTime * 2.6 + sin(vP.x * 9.0 + uTime * 1.3) * 1.6);
  float cells = step(0.82, fract(sin(dot(floor(vP.xy * 14.0 + vec2(0.0, uTime * 0.6)), vec2(12.9, 78.2))) * 43758.5));
  float a = (f * 0.75 + bands * 0.025 + cells * 0.04 * f + uHit * (0.12 + f * 0.6)) * uAlpha;
  gl_FragColor = vec4(uColor * (0.3 + f * 1.25 + uHit * 1.2), a);
}
`;

// a vertical wall of energy for the slam shockwave: bright at the ground, fading upward
const waveVert = /* glsl */ `
varying float vY;
void main() {
  vY = position.y;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const waveFrag = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
varying float vY;
void main() {
  float k = 1.0 - clamp(vY, 0.0, 1.0);
  float a = (k * k * 0.85 + smoothstep(0.08, 0.0, vY) * 0.8) * uAlpha;
  gl_FragColor = vec4(uColor * a, a);
}
`;

// ground decal: soft disc with a brighter rim (slam warning, aura)
const decalFrag = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
uniform float uRim;
varying vec2 vUv;
void main() {
  float r = length(vUv - 0.5) * 2.0;
  float a = (smoothstep(1.0, 0.0, r) * 0.45 + smoothstep(0.82, 0.96, r) * smoothstep(1.0, 0.96, r) * uRim) * uAlpha;
  gl_FragColor = vec4(uColor * a, a);
}
`;
const laneFrag = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
uniform float uTime;
varying vec2 vUv;
void main() {
  float edge = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
  float chev = step(0.5, fract(vUv.y * 9.0 - uTime * 3.0 + abs(vUv.x - 0.5) * 1.6));
  float a = edge * (0.35 + 0.45 * chev) * smoothstep(1.0, 0.75, vUv.y) * uAlpha;
  gl_FragColor = vec4(uColor * a, a);
}
`;
const uvVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

function fxMaterial(frag, color, extra = {}) {
  return new THREE.ShaderMaterial({
    vertexShader: frag === waveFrag ? waveVert : uvVert,
    fragmentShader: frag,
    uniforms: { uColor: { value: new THREE.Color(color) }, uAlpha: { value: 0 }, uRim: { value: 1 }, uTime: { value: 0 }, ...extra },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
  });
}

// ---- umbral orbs: slow homing shadow bolts you can shoot down ------------------------------
class Orb {
  constructor(boss) {
    this.boss = boss;
    this.game = boss.game;
    this.alive = false;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.root = new THREE.Group();
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.26, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.05, 0.0, 0.12) }));
    this.shell = new THREE.Mesh(new THREE.IcosahedronGeometry(0.36, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.5, 3.6), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, wireframe: true }));
    this.glow = glowSprite(new THREE.Color(1.4, 0.45, 3.4), 2.2);
    this.root.add(core, this.shell, this.glow);
    this.root.visible = false;
    this.game.scene.add(this.root);
    this.ch = { x: 0, y: 0, z: 0 };
  }

  launch(from, vel, speed) {
    this.alive = true;
    this.pos.copy(from);
    this.vel.copy(vel);
    this.speed = speed;
    this.life = 0;
    this.hp = 160;
    this.root.visible = true;
    this.root.position.copy(from);
  }

  update(dt) {
    if (!this.alive) return;
    const game = this.game;
    const p = game.player;
    this.life += dt;
    // home on the player's chest after a short rise
    if (this.life > 0.45) {
      _v.set(p.ch.x, p.ch.y + 1.2, p.ch.z).sub(this.pos).normalize().multiplyScalar(this.speed);
      const turn = 1 - Math.exp(-1.7 * dt);
      this.vel.lerp(_v, turn);
      this.vel.setLength(lerp(this.vel.length(), this.speed, 1 - Math.exp(-2 * dt)));
    } else this.vel.multiplyScalar(1 - dt * 1.5);
    const step = this.vel.length() * dt;
    const dir = _v2.copy(this.vel).normalize();
    const wh = game.world.physics.raycast(this.pos.x, this.pos.y, this.pos.z, dir.x, dir.y, dir.z, step + 0.25, { bullets: true });
    this.pos.addScaledVector(this.vel, dt);
    this.root.position.copy(this.pos);
    this.shell.rotation.x += dt * 2.3;
    this.shell.rotation.y += dt * 3.1;
    this.glow.scale.setScalar(2.0 + Math.sin(this.life * 18) * 0.25);
    this.ch.x = this.pos.x;
    this.ch.y = this.pos.y;
    this.ch.z = this.pos.z;
    if (Math.random() < 0.7) {
      game.particles.alpha.spawn({ x: this.pos.x, y: this.pos.y, z: this.pos.z, vx: rand(-0.3, 0.3), vy: rand(0, 0.4), vz: rand(-0.3, 0.3), life: rand(0.4, 0.8), size: 0.22, size1: 0.55, r: 0.12, g: 0.05, b: 0.22, a: 0.55, a1: 0, cell: 1, drag: 1 });
    }
    const pd = Math.hypot(p.ch.x - this.pos.x, p.ch.y + 1.1 - this.pos.y, p.ch.z - this.pos.z);
    if (pd < 1.0 && !p.downed) {
      this.pop(false);
      game.hurtPlayer(30, this.pos.x, this.pos.z, true);
      if (p.exo.has) game.empPlayer(2);
      return;
    }
    const ground = game.world.terrain.heightAt(this.pos.x, this.pos.z);
    if (wh || this.pos.y < ground + 0.1 || this.life > 7.5) this.pop(false);
  }

  pop(shot) {
    if (!this.alive) return;
    this.alive = false;
    this.root.visible = false;
    const game = this.game;
    const P = game.particles;
    const { x, y, z } = this.pos;
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      const u = rand(-1, 1);
      const r = Math.sqrt(1 - u * u);
      const sp = rand(3, 8);
      P.add.spawn({ x, y, z, vx: Math.cos(a) * r * sp, vy: u * sp, vz: Math.sin(a) * r * sp, life: rand(0.25, 0.55), size: 0.14, size1: 0.02, r: 1.5, g: 0.5, b: 3.6, a: 1, a1: 0, drag: 3, cell: 0 });
    }
    P.alpha.spawn({ x, y, z, life: 0.9, size: 0.6, size1: 2.4, r: 0.1, g: 0.04, b: 0.2, a: 0.6, a1: 0, cell: 1 });
    audio.play3D('orb_burst', this.pos, { volume: 0.8, refDistance: 5 });
    if (shot) {
      game.addPoints(20);
      game.hud.hitmarker(true, false);
    } else {
      // splash on whatever it hit
      const p = game.player;
      const d = Math.hypot(p.ch.x - x, p.ch.y + 1 - y, p.ch.z - z);
      if (d < 2.6 && d > 1.0) game.hurtPlayer(18 * (1 - d / 2.6) + 6, x, z, true);
    }
  }

  // ---- the same query interface the zombie manager uses for its pool ----
  raycast(o, d, maxDist) {
    const t = raySphere(o, d, this.pos, 0.55);
    if (t < 0 || t > maxDist) return null;
    return { zombie: this, dist: t, part: 'orb', point: o.clone().addScaledVector(d, t) };
  }

  takeDamage(amount) {
    this.hp -= amount;
    if (this.hp <= 0) this.pop(true);
  }

  blast(pos, radius) {
    if (this.pos.distanceTo(pos) < radius + 0.6) this.pop(true);
  }

  inCone(o, d, range, cosA) {
    _v.copy(this.pos).sub(o);
    const dist = _v.length();
    return dist < range + 0.5 && _v.dot(d) / Math.max(0.01, dist) > cosA;
  }

  aimPoint() {
    return this.pos;
  }

  chestPos() {
    return this.pos;
  }
}

// ---- slam shockwave ---------------------------------------------------------------------------
class Wave {
  constructor(game) {
    this.game = game;
    this.alive = false;
    this.mat = fxMaterial(waveFrag, new THREE.Color(1.3, 0.45, 3.2));
    const g = new THREE.CylinderGeometry(1, 1, 1, 72, 1, true);
    g.translate(0, 0.5, 0);
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    game.scene.add(this.mesh);
  }

  start(x, y, z, { speed = 12, maxR = 18, damage = 45, height = 1.05 } = {}) {
    this.alive = true;
    this.x = x;
    this.y = y;
    this.z = z;
    this.r = 1.5;
    this.speed = speed;
    this.maxR = maxR;
    this.damage = damage;
    this.height = height;
    this.hitPlayer = false;
    this.mesh.visible = true;
    this.mesh.position.set(x, y + 0.02, z);
    this.dustT = 0;
  }

  update(dt) {
    if (!this.alive) return;
    const game = this.game;
    const prev = this.r;
    this.r += this.speed * dt;
    const fade = 1 - smoothstep(this.maxR * 0.7, this.maxR, this.r);
    this.mat.uniforms.uAlpha.value = fade;
    this.mat.uniforms.uColor.value.copy(game.boss.glowColor).multiplyScalar(1.1);
    this.mesh.scale.set(this.r, this.height, this.r);
    // dust kicked up along the front
    this.dustT -= dt;
    if (this.dustT <= 0) {
      this.dustT = 0.05;
      for (let i = 0; i < 5; i++) {
        const a = Math.random() * Math.PI * 2;
        const px = this.x + Math.cos(a) * this.r;
        const pz = this.z + Math.sin(a) * this.r;
        game.particles.alpha.spawn({ x: px, y: this.y + 0.2, z: pz, vx: Math.cos(a) * 2, vy: rand(0.5, 1.5), vz: Math.sin(a) * 2, life: rand(0.5, 0.9), size: 0.4, size1: 1.3, r: 0.36, g: 0.32, b: 0.36, a: 0.45, a1: 0, cell: 1, drag: 2 });
      }
    }
    // the front passes the player: jump it or take the hit
    const p = game.player;
    if (!this.hitPlayer && !p.downed) {
      const d = Math.hypot(p.ch.x - this.x, p.ch.z - this.z);
      const lo = Math.min(prev, this.r) - 0.5;
      const hi = Math.max(prev, this.r) + 0.5;
      if (d >= lo && d <= hi && p.ch.y < this.y + this.height * 0.75 && Math.abs(p.ch.y - this.y) < 3 && game.world.physics.visible(this.x, this.y + 0.6, this.z, p.ch.x, p.ch.y + 0.6, p.ch.z)) {
        this.hitPlayer = true;
        game.hurtPlayer(this.damage, this.x, this.z, true);
        const k = 1 / Math.max(0.01, d);
        p.ch.vx += (p.ch.x - this.x) * k * 6;
        p.ch.vz += (p.ch.z - this.z) * k * 6;
        p.ch.vy = Math.max(p.ch.vy, 5);
        p.ch.grounded = false;
        p.addShake(0.4, 0.3);
      }
    }
    if (this.r >= this.maxR) {
      this.alive = false;
      this.mesh.visible = false;
    }
  }
}

// ------------------------------------------------------------------------------------------------
export class Nightwarden {
  constructor(game) {
    this.game = game;
    this.isBoss = true;
    this.alive = false;
    this.state = 'inactive';
    const av = game.avatars;
    const fig = av.figures.find((f) => !f.female) || av.figures[0];
    this.material = makeZombieMaterial(av, { tint: 0x4f5466, eye: 0xa070ff, eyeIntensity: 5 });
    const body = buildBody(fig, this.material);
    this.mesh = body.mesh;
    this.B = body.bones;
    this.boneList = body.list;
    this.root = new THREE.Group();
    this.root.add(this.mesh);
    this.root.scale.setScalar(S);
    this.root.visible = false;
    game.scene.add(this.root);
    this.ch = { x: 0, y: 0, z: 0, r: 0.95, h: 3.1, vx: 0, vy: 0, vz: 0, grounded: true };
    this.hit = {
      head: new THREE.Vector3(), chest: new THREE.Vector3(), hips: new THREE.Vector3(), core: new THREE.Vector3(),
      limbs: Array.from({ length: 8 }, () => [new THREE.Vector3(), new THREE.Vector3()]), frame: -1,
    };
    this.glowColor = new THREE.Color(1.4, 0.5, 3.2);
    this._bulk();
    this._armor();
    this._fx();
    this.orbs = Array.from({ length: 8 }, () => new Orb(this));
    this.waves = [new Wave(game), new Wave(game)];
    this.pose = null;
    this.reset();
  }

  // hulking proportions: broad chest and shoulders, thick legs, small head
  _bulk() {
    const B = this.B;
    B.chest.scale.set(1.32, 1.16, 1.38);
    B.spine.scale.set(1.24, 1.0, 1.3);
    B.hips.scale.set(1.16, 1.0, 1.18);
    B.head.scale.set(0.76, 0.84, 0.74);
    for (const s of ['L', 'R']) {
      B['shoulder' + s].scale.set(1.08, 1.32, 1.3);
      B['elbow' + s].scale.set(1.04, 1.18, 1.18);
      B['hip' + s].scale.set(1.14, 1.04, 1.14);
    }
  }

  _armor() {
    const COL = { plate: new THREE.Color(0x2c2f37), edge: new THREE.Color(0x4b505b), dark: new THREE.Color(0x15161a) };
    this.armorMat = std({ vertexColors: true, metalness: 0.55, roughness: 0.4 });
    this.plateMat = std({ color: 0x2c2f37, metalness: 0.55, roughness: 0.4 });
    this.trimMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 0.5, 3.2) });
    this.visorMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.8, 5) });
    this.coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 0.3, 2.6) });
    const B = this.B;
    // static plates merge into one vertex-coloured mesh per bone (plus one glow-trim mesh),
    // so the whole suit of armour costs a couple of dozen draw calls
    const groups = new Map();
    const one = new THREE.Vector3(1, 1, 1);
    const tinted = (geo, c) => {
      const g = geo.index ? geo.toNonIndexed() : geo.clone();
      const n = g.attributes.position.count;
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      return g;
    };
    const part = (bone, geo, kind, x, y, z, rx = 0, ry = 0, rz = 0) => {
      let g = groups.get(bone);
      if (!g) groups.set(bone, (g = { armor: [], trim: [] }));
      const matrix = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), one);
      if (kind === 'trim') g.trim.push({ geometry: geo, matrix });
      else g.armor.push({ geometry: tinted(geo, COL[kind]), matrix });
    };
    // pieces that move or glow on their own stay separate
    const single = (bone, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, rz);
      m.castShadow = mat === this.plateMat;
      B[bone].add(m);
      return m;
    };
    const cone = (r, h) => new THREE.ConeGeometry(r, h, 6);
    // helmet: rounded shell, glowing visor slit, crest and swept horns
    part('head', rbox(0.29, 0.31, 0.3, 0.07), 'plate', 0, 0.13, 0.0);
    part('head', rbox(0.2, 0.075, 0.1, 0.025), 'edge', 0, 0.02, 0.1);
    this.visor = single('head', new THREE.BoxGeometry(0.2, 0.03, 0.02), this.visorMat, 0, 0.13, 0.152);
    part('head', new THREE.BoxGeometry(0.035, 0.07, 0.25), 'edge', 0, 0.3, -0.01);
    for (const sx of [-1, 1]) part('head', cone(0.024, 0.17), 'dark', sx * 0.115, 0.24, -0.07, -0.9, 0, sx * -0.35);
    this.visorGlow = glowSprite(new THREE.Color(2.2, 0.8, 5), 0.5);
    this.visorGlow.position.set(0, 0.13, 0.17);
    B.head.add(this.visorGlow);
    // chest: split breastplate over the core, gorget, power pack and spines
    this.plates = [];
    for (const sx of [-1, 1]) {
      const pl = single('chest', rbox(0.15, 0.24, 0.07, 0.03), this.plateMat, sx * 0.08, 0.11, 0.115, 0, sx * -0.12, 0);
      pl.userData.home = pl.position.clone();
      pl.userData.sx = sx;
      this.plates.push(pl);
      part('chest', new THREE.BoxGeometry(0.012, 0.18, 0.012), 'trim', sx * 0.15, 0.11, 0.13);
    }
    this.core = single('chest', new THREE.IcosahedronGeometry(0.06, 1), this.coreMat, 0, 0.11, 0.1);
    part('chest', new THREE.TorusGeometry(0.075, 0.014, 6, 18), 'edge', 0, 0.11, 0.105);
    this.coreGlow = glowSprite(new THREE.Color(1.2, 0.3, 2.6), 0.4);
    this.coreGlow.position.set(0, 0.11, 0.16);
    B.chest.add(this.coreGlow);
    part('chest', rbox(0.3, 0.07, 0.24, 0.03), 'edge', 0, 0.245, 0.0);
    part('chest', rbox(0.3, 0.3, 0.13, 0.04), 'plate', 0, 0.1, -0.15);
    // exhaust stacks: markers at their mouths emit the smoke
    this.stacks = [];
    for (const sx of [-1, 1]) {
      part('chest', new THREE.CylinderGeometry(0.028, 0.034, 0.22, 8), 'dark', sx * 0.09, 0.3, -0.19, -0.35, 0, 0);
      const mouth = new THREE.Object3D();
      mouth.position.set(sx * 0.09, 0.3 + Math.cos(0.35) * 0.11, -0.19 - Math.sin(0.35) * 0.11);
      B.chest.add(mouth);
      this.stacks.push(mouth);
      part('chest', new THREE.BoxGeometry(0.012, 0.012, 0.2), 'trim', sx * 0.05, 0.12, -0.218);
    }
    for (let k = 0; k < 4; k++) part('chest', cone(0.02, 0.09), 'dark', 0, 0.02 + k * 0.07, -0.22, -1.3, 0, 0);
    part('spine', rbox(0.25, 0.12, 0.2, 0.03), 'edge', 0, 0.06, 0.03);
    // hips: belt and tassets
    part('hips', rbox(0.34, 0.09, 0.25, 0.03), 'plate', 0, 0.0, 0.0);
    part('hips', rbox(0.14, 0.15, 0.035, 0.015), 'edge', 0, -0.1, 0.125, 0.12, 0, 0);
    for (const sx of [-1, 1]) part('hips', rbox(0.035, 0.16, 0.16, 0.015), 'edge', sx * 0.175, -0.09, 0.0, 0, 0, sx * 0.12);
    // arms: spiked pauldrons, plated upper arms, huge clawed gauntlets; legs: plates and boots
    for (const side of ['L', 'R']) {
      const sx = side === 'L' ? 1 : -1;
      part('shoulder' + side, rbox(0.2, 0.13, 0.23, 0.05), 'plate', sx * 0.05, 0.075, 0, 0, 0, sx * -0.35);
      for (const dz of [-0.055, 0.055]) part('shoulder' + side, cone(0.024, 0.11), 'dark', sx * 0.06, 0.17, dz, 0, 0, sx * -0.4);
      part('shoulder' + side, rbox(0.16, 0.085, 0.1, 0.025), 'edge', sx * 0.17, 0, 0);
      part('elbow' + side, rbox(0.22, 0.12, 0.13, 0.035), 'plate', sx * 0.13, 0, 0);
      part('elbow' + side, new THREE.BoxGeometry(0.16, 0.012, 0.012), 'trim', sx * 0.13, 0.062, 0.03);
      part('elbow' + side, rbox(0.11, 0.11, 0.12, 0.03), 'edge', sx * 0.29, 0, 0);
      for (const dz of [-0.04, 0, 0.04]) part('elbow' + side, cone(0.013, 0.1), 'dark', sx * 0.37, -0.015, dz, 0, 0, sx * -Math.PI / 2);
      part('hip' + side, rbox(0.13, 0.22, 0.14, 0.035), 'plate', 0, -0.16, 0.015);
      part('knee' + side, rbox(0.1, 0.1, 0.075, 0.03), 'edge', 0, 0.0, 0.065);
      part('knee' + side, cone(0.02, 0.08), 'dark', 0, 0.0, 0.11, Math.PI / 2, 0, 0);
      part('knee' + side, rbox(0.1, 0.22, 0.09, 0.03), 'plate', 0, -0.14, 0.04);
      part('ankle' + side, rbox(0.12, 0.09, 0.24, 0.035), 'dark', 0, -0.045, 0.05);
    }
    for (const [bone, g] of groups) {
      if (g.armor.length) {
        const m = new THREE.Mesh(mergeGeometries(g.armor), this.armorMat);
        m.castShadow = true;
        B[bone].add(m);
      }
      if (g.trim.length) B[bone].add(new THREE.Mesh(mergeGeometries(g.trim), this.trimMat));
    }
  }

  _fx() {
    const game = this.game;
    this.shieldMat = new THREE.ShaderMaterial({
      vertexShader: shieldVert,
      fragmentShader: shieldFrag,
      uniforms: { uTime: { value: 0 }, uAlpha: { value: 0 }, uHit: { value: 0 }, uColor: { value: new THREE.Color(0.75, 0.32, 1.8) } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    });
    this.shield = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 24), this.shieldMat);
    this.shield.scale.set(0.82, 1.08, 0.74);
    this.shield.position.set(0, 0.95, 0.02);
    this.shield.renderOrder = 5;
    this.root.add(this.shield);
    // dark pool under its feet; scorched orange in daylight
    this.aura = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), fxMaterial(decalFrag, new THREE.Color(0.9, 0.3, 2.2)));
    this.aura.rotation.x = -Math.PI / 2;
    this.aura.material.uniforms.uRim.value = 0.3;
    game.scene.add(this.aura);
    // attack telegraphs
    this.slamDecal = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), fxMaterial(decalFrag, new THREE.Color(3, 0.5, 1.2)));
    this.slamDecal.rotation.x = -Math.PI / 2;
    game.scene.add(this.slamDecal);
    const lane = new THREE.PlaneGeometry(1, 1);
    lane.translate(0, 0.5, 0);
    lane.rotateX(-Math.PI / 2);
    this.lane = new THREE.Mesh(lane, fxMaterial(laneFrag, new THREE.Color(3, 0.6, 1.0)));
    game.scene.add(this.lane);
    for (const m of [this.aura, this.slamDecal, this.lane]) {
      m.visible = false;
      m.frustumCulled = false;
    }
  }

  reset() {
    this.state = 'inactive';
    this.alive = false;
    this.root.visible = false;
    this.aura.visible = this.slamDecal.visible = this.lane.visible = false;
    for (const o of this.orbs) {
      o.alive = false;
      o.root.visible = false;
    }
    for (const w of this.waves) {
      w.alive = false;
      w.mesh.visible = false;
    }
    this.game.world.auxLight.intensity = 0;
    audio.stopLoop('bossOrbs', 0.2);
    this.exposedK = 0;
    this.shieldK = 1;
    this.hitFlash = 0;
    this.pose = null;
  }

  // ---- lifecycle ------------------------------------------------------------------------------
  // Rises out of the ground at (x, z). Health scales with the round and the player's best gun.
  spawn(x, z) {
    const game = this.game;
    const lvl = Math.max(0, ...game.weapons.inv.map((w) => w.level || 0));
    const base = game.freeRoam ? 70000 : 30000 + 4000 * Math.max(1, game.director.round);
    this.maxHealth = this.health = Math.round((base * (1 + 0.35 * lvl)) / 1000) * 1000;
    const y = game.world.physics.groundHeight(x, z, 0.5, 100);
    Object.assign(this.ch, { x, y, z, vx: 0, vy: 0, vz: 0, grounded: true });
    this.groundY = y;
    const p = game.player.ch;
    this.yaw = Math.atan2(p.x - x, p.z - z);
    this.alive = true;
    this.enraged = false;
    this.summonsLeft = SUMMON_AT.slice();
    this.summonT = 16; // night-time reinforcements, besides the health thresholds
    this.queue = [];
    this.cd = { any: 2.5, swipe: 0, slam: 4, charge: 7, cast: 5 };
    this.flinch = 0;
    this.phase = 0;
    this.stepSide = 0;
    this.stuckT = 0;
    this.farT = 0;
    this.lastPos = new THREE.Vector3(x, y, z);
    this.moveSpeed = 0;
    this.burning = false;
    this.shieldK = 1;
    this.exposedK = 0;
    this.hidden = 0;
    this.deathT = 0;
    this.lastShieldPing = 0;
    this.root.visible = true;
    this.root.position.set(x, y - 3.4, z);
    this.aura.visible = true;
    this.pose = null;
    this.setState('emerge');
    for (const b of this.boneList) b.quaternion.copy(b.userData.bindQ);
    game.particles.dirtBurst(x, y, z);
    audio.play3D('dirt_burst', new THREE.Vector3(x, y, z), { volume: 1.2, refDistance: 8, rate: 0.6 });
    audio.play3D('boss_growl', new THREE.Vector3(x, y + 2, z), { volume: 1, refDistance: 10, maxDistance: 120 });
    game.player.addShake(0.5, 1.5);
  }

  setState(s) {
    this.state = s;
    this.st = 0;
    this.hitDone = false;
  }

  get solid() {
    return this.alive && this.hidden <= 0 && this.state !== 'emerge';
  }

  get exposed() {
    return this.exposedK > 0.5;
  }

  get speedMul() {
    return (this.enraged ? 1.22 : 1) * (this.burning ? 0.62 : 1);
  }

  // ---- update -----------------------------------------------------------------------------------
  update(dt) {
    for (const o of this.orbs) o.update(dt);
    for (const w of this.waves) w.update(dt);
    if (this.orbs.some((o) => o.alive)) {
      const o = this.orbs.find((q) => q.alive);
      const v = audio.loop('bossOrbs', 'orb_loop', { pos: o.pos, volume: 0.5, refDistance: 4 });
      if (v && v.setPosition) v.setPosition(o.pos);
    } else audio.stopLoop('bossOrbs', 0.3);
    if (this.state === 'inactive') return;
    const game = this.game;
    this.st += dt;
    this.t = (this.t || 0) + dt;
    const day = game.world.sky.dayLight;
    const wasBurning = this.burning;
    this.burning = this.alive && day > 0.5;
    this.exposedK = damp(this.exposedK, this.burning ? 1 : 0, 3, dt);
    this.shieldK = damp(this.shieldK, this.burning || !this.alive ? 0 : 1, this.burning ? 6 : 1.6, dt);
    if (this.alive && this.burning && !wasBurning) this.onDaylight();
    if (this.alive && !this.burning && wasBurning) this.onNightfall();
    for (const k of Object.keys(this.cd)) this.cd[k] -= dt * (this.burning ? 0.65 : 1) * (this.enraged ? 1.35 : 1);
    if (this.alive && !this.burning && this.state !== 'emerge') {
      this.summonT -= dt;
      if (this.summonT <= 0) {
        this.summonT = this.enraged ? 24 : 32;
        const minions = game.zombies.pool.filter((z) => z.alive && z.minion).length;
        if (minions < 5 && !this.queue.includes('summon')) this.queue.push('summon');
      }
    }
    if (this.flinch > 0) this.flinch = Math.max(0, this.flinch - dt * 3);
    this.hitFlash = Math.max(0, this.hitFlash - dt * 4);

    if (this.state === 'dying' || this.state === 'dead') this._updateDeath(dt);
    else if (this.alive) this._think(dt);
    this._visuals(dt, day);
    this._animate(dt);
  }

  _player() {
    const p = this.game.player.ch;
    const dx = p.x - this.ch.x;
    const dz = p.z - this.ch.z;
    return { p, dx, dz, dy: p.y - this.ch.y, d: Math.hypot(dx, dz) };
  }

  _think(dt) {
    const game = this.game;
    const ch = this.ch;
    const { dx, dz, dy, d } = this._player();
    const toYaw = Math.atan2(dx, dz);
    const sm = this.speedMul;
    const dur = (x) => x * (this.burning ? 1.15 : 1) * (this.enraged ? 0.88 : 1);
    let move = 0;
    let turn = 3.2;
    switch (this.state) {
      case 'emerge': {
        const k = clamp(this.st / 2.6, 0, 1);
        const e = 1 - Math.pow(1 - k, 2.4);
        this.root.position.set(ch.x, this.groundY - 3.4 * (1 - e), ch.z);
        if (Math.random() < 0.6) game.particles.dirtBurst(ch.x + rand(-1, 1), this.groundY, ch.z + rand(-1, 1));
        if (k >= 1) this.setState('roar');
        return;
      }
      case 'roar': {
        turn = 2;
        if (this.st > 0.5 && !this.hitDone) {
          this.hitDone = true;
          this._roarBlast();
        }
        if (this.st > dur(2.2)) this._chase();
        break;
      }
      case 'chase': {
        // queued set pieces first (summons at health thresholds, the enrage roar)
        if (this.queue.length && this.cd.any <= 0.6) {
          this.setState(this.queue.shift());
          break;
        }
        // lost the player: they are far away or we are stuck. A player perched out of reach
        // gets shadow orbs instead (see below); only a long stand-off up high sends us after them
        const perched = dy > 2.4 && d < 16;
        this.perchT = perched ? (this.perchT || 0) + dt : 0;
        this.farT = d > 30 || this.perchT > 14 ? this.farT + dt : Math.max(0, this.farT - dt * 2);
        this.stuckT += dt;
        if (this.stuckT > 2.5) {
          const moved = Math.hypot(ch.x - this.lastPos.x, ch.z - this.lastPos.z);
          if (moved < 0.6 && d > 5) this.farT += 3;
          this.stuckT = 0;
          this.lastPos.set(ch.x, ch.y, ch.z);
        }
        if (this.farT > 4) {
          this.farT = 0;
          this.perchT = 0;
          this.setState('shadowOut');
          break;
        }
        if (this.cd.any <= 0 && !game.player.downed) {
          const los = d < 30 && game.world.physics.visible(ch.x, ch.y + 2.4, ch.z, game.player.eye.x, game.player.eye.y, game.player.eye.z);
          if (d < 3.6 && this.cd.swipe <= 0 && Math.abs(dy) < 2.2) {
            this.attackArm = chance(0.5) ? 1 : -1;
            this.setState('swipe');
            this.cd.swipe = 1.4;
            this.cd.any = 1.1;
            break;
          }
          if (d < 9 && this.cd.slam <= 0 && (d < 5 || chance(0.5))) {
            this.setState('slam');
            this.cd.slam = 7;
            this.cd.any = 1.4;
            break;
          }
          if (d > 7 && d < 26 && this.cd.charge <= 0 && los && Math.abs(dy) < 2) {
            this.setState('chargeWind');
            this.cd.charge = 9;
            this.cd.any = 1.4;
            break;
          }
          if ((d > 6 || perched) && this.cd.cast <= 0 && los) {
            this.setState('cast');
            this.cd.cast = perched ? 4 : 8;
            this.cd.any = 1.4;
            break;
          }
        }
        move = d > 2.4 ? 2.7 * sm : 0;
        break;
      }
      case 'swipe': {
        turn = this.st < dur(0.5) ? 4.5 : 0.6;
        const hitAt = dur(0.52);
        if (this.st > hitAt && !this.hitDone) {
          this.hitDone = true;
          const f = _v.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
          const fwd = (dx * f.x + dz * f.z) / Math.max(0.01, d);
          const pe = game.player.eye;
          const clear = game.world.physics.visible(ch.x, ch.y + 2, ch.z, pe.x, pe.y - 0.4, pe.z);
          if (d < 3.9 && Math.abs(dy) < 2.4 && (fwd > 0.25 || d < 1.6) && clear) {
            this._hurt(this.burning ? 55 : 70, 10, 4);
            audio.play('melee_hit', { volume: 1, rate: 0.55 });
          }
          audio.play3D('melee_swing', this.chestPos(), { volume: 1, rate: 0.45, refDistance: 6 });
        }
        if (this.st < hitAt) move = 1.4 * sm;
        if (this.st > dur(1.2)) this._chase();
        break;
      }
      case 'slam': {
        const impact = dur(1.05);
        turn = this.st < impact * 0.7 ? 3 : 0;
        if (this.st < 0.05) audio.play3D('boss_growl', this.chestPos(), { volume: 0.9, refDistance: 8, rate: 1.1 });
        if (this.st > impact && !this.hitDone) {
          this.hitDone = true;
          this._slamImpact();
        }
        if (this.enraged && this.st > impact + 0.5 && !this.hitDone2) {
          this.hitDone2 = true;
          this._wave(14, 20);
        }
        if (this.st > dur(2.3)) {
          this.hitDone2 = false;
          this._chase();
        }
        break;
      }
      case 'chargeWind': {
        turn = 5;
        if (this.st < 0.05) audio.play3D('boss_charge', this.chestPos(), { volume: 1, refDistance: 10, maxDistance: 100 });
        if (this.st > dur(0.95)) {
          // lock the lane, aiming a little ahead of a moving player
          const p = game.player.ch;
          const lead = clamp(d / 16, 0, 0.6);
          const tx = p.x + p.vx * lead;
          const tz = p.z + p.vz * lead;
          this.yaw = Math.atan2(tx - ch.x, tz - ch.z);
          this.chargeDist = clamp(Math.hypot(tx - ch.x, tz - ch.z) + 7, 10, 30);
          this.chargeFrom = new THREE.Vector3(ch.x, ch.y, ch.z);
          this.setState('charge');
        }
        break;
      }
      case 'charge': {
        turn = 0;
        const sp = 16 * (this.burning ? 0.75 : 1);
        ch.vx = Math.sin(this.yaw) * sp;
        ch.vz = Math.cos(this.yaw) * sp;
        if (!ch.grounded) ch.vy -= 20 * dt;
        const hitWall = game.world.physics.moveCharacter(ch, dt, 0.6);
        this.moveSpeed = sp;
        if (Math.random() < 0.8) game.particles.dust(ch.x, ch.y + 0.1, ch.z, 0, 1, 0, [0.4, 0.36, 0.34], 2, 1.4);
        const pd = this._player();
        if (!this.hitDone && pd.d < 2.2 && Math.abs(pd.dy) < 2.4) {
          this.hitDone = true;
          // knocked aside and up, away from the lane
          this._hurt(90, 13, 6, true);
        }
        const gone = Math.hypot(ch.x - this.chargeFrom.x, ch.z - this.chargeFrom.z);
        const blocked = hitWall && Math.hypot(ch.vx, ch.vz) < sp * 0.5;
        if (blocked) {
          this._crash();
          break;
        }
        if (gone >= this.chargeDist || this.st > 2.2) this.setState('chargeStop');
        this.root.position.set(ch.x, ch.y, ch.z);
        this._stepFx(dt, sp);
        return;
      }
      case 'chargeStop': {
        turn = 1;
        const k = 1 - clamp(this.st / 0.6, 0, 1);
        move = 0;
        ch.vx *= k;
        ch.vz *= k;
        game.world.physics.moveCharacter(ch, dt, 0.6);
        if (Math.random() < 0.5) game.particles.dust(ch.x, ch.y + 0.1, ch.z, 0, 1, 0, [0.4, 0.36, 0.34], 2, 1.2);
        if (this.st > 0.7) this._chase();
        this.root.position.set(ch.x, ch.y, ch.z);
        return;
      }
      case 'stun': {
        turn = 0;
        if (this.st > 2.4) this._chase();
        break;
      }
      case 'cast': {
        turn = 3.5;
        const rel = dur(0.78);
        if (this.st < 0.05) audio.play3D('boss_growl', this.chestPos(), { volume: 0.8, refDistance: 8, rate: 0.85 });
        if (this.st > rel && !this.hitDone) {
          this.hitDone = true;
          this._castOrbs(this.enraged ? 5 : 3);
        }
        if (this.st > dur(1.6)) this._chase();
        break;
      }
      case 'summon': {
        turn = 1.5;
        if (this.st > 1.1 && !this.hitDone) {
          this.hitDone = true;
          this._summonImpact();
        }
        if (this.st > 2.6) this._chase();
        break;
      }
      case 'stagger': {
        turn = 0.5;
        move = this.st < 0.8 ? -1.2 : 0;
        if (this.st > 2.1) this._chase();
        break;
      }
      case 'shadowOut': {
        turn = 0;
        if (this.st < 0.05) {
          audio.play3D('shield_up', this.chestPos(), { volume: 1, refDistance: 8, rate: 0.7 });
          this._smoke(26);
        }
        if (this.st > 0.7) {
          this.hidden = 1;
          this.root.visible = false;
          this._teleportNearPlayer();
          this.setState('shadowIn');
        }
        break;
      }
      case 'shadowIn': {
        turn = 8;
        if (this.st > 0.45 && !this.root.visible) {
          this.hidden = 0;
          this.root.visible = true;
          this._smoke(30);
          audio.play3D('boss_growl', this.chestPos(), { volume: 1, refDistance: 10 });
          this.game.player.addShake(0.25, 0.4);
        }
        if (this.st > 1.3) this._chase();
        break;
      }
      default:
        break;
    }
    // turn and walk
    this.yaw = dampAngle(this.yaw, toYaw, turn, dt);
    if (move !== 0) {
      const ang = Math.abs(wrapAngle(toYaw - this.yaw));
      const fwdK = move > 0 ? clamp(Math.cos(ang) * 1.3, 0, 1) : 1;
      const tvx = Math.sin(this.yaw) * move * fwdK;
      const tvz = Math.cos(this.yaw) * move * fwdK;
      const k = 1 - Math.exp(-6 * dt);
      ch.vx += (tvx - ch.vx) * k;
      ch.vz += (tvz - ch.vz) * k;
    } else {
      ch.vx *= Math.exp(-10 * dt);
      ch.vz *= Math.exp(-10 * dt);
    }
    if (!ch.grounded) ch.vy -= 20 * dt;
    game.world.physics.moveCharacter(ch, dt, 0.6);
    this.moveSpeed = Math.hypot(ch.vx, ch.vz);
    this.root.position.set(ch.x, ch.y, ch.z);
    this._stepFx(dt, this.moveSpeed);
  }

  _chase() {
    this.setState('chase');
  }

  // heavy footfalls: stomp sounds and a little camera shake when close
  _stepFx(dt, speed) {
    if (speed < 0.3) return;
    const prev = Math.sin(this.phase);
    this.phase += dt * (1.6 + speed * 1.05);
    const now = Math.sin(this.phase);
    if ((prev < 0) !== (now < 0)) {
      const game = this.game;
      const pos = _v.set(this.ch.x, this.ch.y + 0.1, this.ch.z);
      audio.play3D('boss_stomp', pos, { volume: speed > 8 ? 1 : 0.8, refDistance: 6, maxDistance: 80, rateVar: 0.08 });
      const d = Math.hypot(game.player.ch.x - this.ch.x, game.player.ch.z - this.ch.z);
      if (d < 16) game.player.addShake(0.16 * (1 - d / 16), 0.2);
      game.particles.dust(this.ch.x + rand(-0.5, 0.5), this.ch.y + 0.05, this.ch.z + rand(-0.5, 0.5), 0, 1, 0, [0.36, 0.33, 0.32], 2, 1.3);
    }
  }

  // knockback hit on the player: h = horizontal push, up = vertical pop
  _hurt(amount, h, up, sideways = false) {
    const game = this.game;
    const p = game.player;
    if (p.downed) return;
    game.hurtPlayer(amount, this.ch.x, this.ch.z, true);
    let nx = p.ch.x - this.ch.x;
    let nz = p.ch.z - this.ch.z;
    if (sideways) {
      // shove out of the charge lane
      const fx = Math.sin(this.yaw);
      const fz = Math.cos(this.yaw);
      const side = Math.sign(nx * fz - nz * fx) || 1;
      nx = fz * side + fx * 0.6;
      nz = -fx * side + fz * 0.6;
    }
    const l = Math.hypot(nx, nz) || 1;
    p.ch.vx = (nx / l) * h;
    p.ch.vz = (nz / l) * h;
    p.ch.vy = Math.max(p.ch.vy, up);
    p.ch.grounded = false;
    p.addShake(0.55, 0.4);
    game.flash(0.25, 0x7a3aff);
  }

  _roarBlast() {
    const game = this.game;
    audio.play3D('boss_roar', this.chestPos(), { volume: 1.2, refDistance: 14, maxDistance: 160 });
    audio.zombie('taunt', this.chestPos(), { volume: 1, rate: 0.55, force: true, refDistance: 12 });
    game.player.addShake(0.7, 1.2);
    this._smoke(20);
    const { dx, dz, d } = this._player();
    if (d < 7.5 && !game.player.downed) {
      const p = game.player.ch;
      p.vx = (dx / Math.max(0.1, d)) * 9;
      p.vz = (dz / Math.max(0.1, d)) * 9;
      p.vy = Math.max(p.vy, 3);
      p.grounded = false;
    }
  }

  _slamImpact() {
    const game = this.game;
    const ch = this.ch;
    const f = _v.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const ix = ch.x + f.x * 1.6;
    const iz = ch.z + f.z * 1.6;
    audio.play3D('boss_slam', _v2.set(ix, ch.y, iz), { volume: 1.3, refDistance: 12, maxDistance: 140 });
    audio.play3D('shockwave', _v2.set(ix, ch.y, iz), { volume: 0.9, refDistance: 10 });
    game.world.boom(_v2.set(ix, ch.y + 0.5, iz), 0.7);
    game.particles.explosion(ix, ch.y + 0.2, iz, 0.6);
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * Math.PI * 2;
      game.particles.add.spawn({ x: ix + Math.cos(a) * 0.6, y: ch.y + 0.3, z: iz + Math.sin(a) * 0.6, vx: Math.cos(a) * 13, vy: 0.6, vz: Math.sin(a) * 13, life: 0.4, size: 0.35, size1: 0.8, r: this.glowColor.r, g: this.glowColor.g, b: this.glowColor.b, a: 0.9, a1: 0, drag: 4, cell: 0 });
    }
    const p = game.player;
    const d = Math.hypot(p.ch.x - ix, p.ch.z - iz);
    if (d < 4.5 && Math.abs(p.ch.y - ch.y) < 2.5 && game.world.physics.visible(ix, ch.y + 1, iz, p.ch.x, p.ch.y + 1, p.ch.z)) this._hurt(this.burning ? 65 : 80, 9, 7);
    else p.addShake(clamp(1 - d / 30, 0.15, 0.6), 0.6);
    this._wave(12.5, 18, ix, iz);
  }

  _wave(speed, maxR, x = this.ch.x, z = this.ch.z) {
    const w = this.waves.find((q) => !q.alive) || this.waves[0];
    w.start(x, this.ch.y, z, { speed, maxR, damage: this.burning ? 35 : 45 });
  }

  _crash() {
    const game = this.game;
    this.setState('stun');
    this.ch.vx = this.ch.vz = 0;
    audio.play3D('boss_slam', this.chestPos(), { volume: 1, refDistance: 10, rate: 1.3 });
    audio.play3D('impact_metal', this.chestPos(), { volume: 1, refDistance: 6, rate: 0.5 });
    game.particles.sparks(this.ch.x, this.ch.y + 2, this.ch.z, 0, 1, 0, 30);
    game.particles.dust(this.ch.x, this.ch.y + 1.5, this.ch.z, 0, 1, 0, [0.45, 0.42, 0.4], 10, 2.5);
    const d = this._player().d;
    game.player.addShake(clamp(1 - d / 25, 0.1, 0.8), 0.6);
    game.hud.message('', 'The Nightwarden is stunned!', 1.6, 'small');
  }

  _castOrbs(n) {
    const game = this.game;
    const hand = _v.set(0.36, 0, 0).applyMatrix4(this.B.elbowR.matrixWorld);
    audio.play3D('orb_launch', hand, { volume: 1, refDistance: 8 });
    const fwd = _v2.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const right = new THREE.Vector3(fwd.z, 0, -fwd.x);
    for (let i = 0; i < n; i++) {
      const o = this.orbs.find((q) => !q.alive);
      if (!o) break;
      const spread = (i - (n - 1) / 2) / Math.max(1, n - 1);
      const vel = new THREE.Vector3().copy(fwd).multiplyScalar(3).addScaledVector(right, spread * 7).add(new THREE.Vector3(0, 5 + Math.abs(spread) * 2, 0));
      o.launch(hand.clone().add(new THREE.Vector3(0, 0.6, 0)), vel, this.enraged ? 10 : 8.5);
    }
  }

  _summonImpact() {
    const game = this.game;
    const ch = this.ch;
    audio.play3D('boss_slam', this.chestPos(), { volume: 1, refDistance: 10, rate: 0.85 });
    audio.play3D('boss_roar', this.chestPos(), { volume: 0.8, refDistance: 12, rate: 1.15 });
    game.player.addShake(0.5, 0.8);
    this._smoke(24);
    const n = this.enraged ? 8 : 6;
    const nav = game.world.nav;
    const round = Math.max(game.freeRoam ? 6 : game.director.round, 5);
    const health = round <= 9 ? 150 + 100 * (round - 1) : Math.round(950 * Math.pow(1.1, round - 9));
    let made = 0;
    for (let tries = 0; tries < 40 && made < n; tries++) {
      const a = Math.random() * Math.PI * 2;
      const r = rand(3.5, 9);
      const x = ch.x + Math.cos(a) * r;
      const z = ch.z + Math.sin(a) * r;
      const i = nav.idx(x, z);
      if (!nav.walkable(i) || Math.abs(nav.floor[i] - ch.y) > 1.2) continue;
      if (!game.zombies.canSpawn()) break;
      const type = chance(this.enraged ? 0.45 : 0.3) ? 'exo' : 'walker';
      const tier = this.enraged && chance(0.4) ? 'sprint' : 'run';
      const z0 = game.zombies.spawn({ x, z, type: 'ground' }, { type, tier, health, minion: true });
      if (z0) made++;
    }
  }

  _smoke(n) {
    const P = this.game.particles;
    const ch = this.ch;
    for (let i = 0; i < n; i++) {
      P.alpha.spawn({ x: ch.x + rand(-1, 1), y: ch.y + rand(0.2, 3), z: ch.z + rand(-1, 1), vx: rand(-1.5, 1.5), vy: rand(0.3, 1.6), vz: rand(-1.5, 1.5), life: rand(1, 2), size: 0.7, size1: rand(2, 3.2), r: 0.08, g: 0.04, b: 0.14, a: 0.7, a1: 0, cell: 1, drag: 1.2 });
    }
    for (let i = 0; i < n / 2; i++) {
      P.add.spawn({ x: ch.x + rand(-1, 1), y: ch.y + rand(0.3, 3), z: ch.z + rand(-1, 1), vx: rand(-2, 2), vy: rand(0, 2), vz: rand(-2, 2), life: rand(0.4, 0.9), size: 0.1, size1: 0.02, r: 1.4, g: 0.5, b: 3.2, a: 1, a1: 0, cell: 0, drag: 2 });
    }
  }

  // Shadow-step to the far side of wherever the player went (stuck, outrun, perched).
  _teleportNearPlayer() {
    const game = this.game;
    const nav = game.world.nav;
    const p = game.player.ch;
    let best = null;
    for (let i = 0; i < 24 && !best; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = rand(7, 11);
      const x = p.x + Math.cos(a) * r;
      const z = p.z + Math.sin(a) * r;
      const k = nav.idx(x, z);
      if (!nav.walkable(k) || Math.abs(nav.floor[k] - p.y) > 1.5) continue;
      // keep its whole body clear of walls
      if (!nav.clearPath(x - 0.9, z, x + 0.9, z) || !nav.clearPath(x, z - 0.9, x, z + 0.9)) continue;
      if (!game.world.physics.visible(x, nav.floor[k] + 2, z, p.x, p.y + 1.5, p.z)) continue;
      best = { x, z, y: nav.floor[k] };
    }
    if (!best) {
      const m = game.map.DAYBREAK.machine;
      best = { x: m.x - 12, z: m.z, y: game.world.physics.groundHeight(m.x - 12, m.z, 0.5, 100) };
    }
    Object.assign(this.ch, { x: best.x, y: best.y, z: best.z, vx: 0, vy: 0, vz: 0, grounded: true });
    this.yaw = Math.atan2(p.x - best.x, p.z - best.z);
    this.root.position.set(best.x, best.y, best.z);
    this.lastPos.set(best.x, best.y, best.z);
  }

  onDaylight() {
    const game = this.game;
    audio.play3D('shield_break', this.chestPos(), { volume: 1.2, refDistance: 12, maxDistance: 160 });
    audio.play3D('boss_roar', this.chestPos(), { volume: 1, refDistance: 12, rate: 1.25 });
    const P = game.particles;
    const c = this.chestPos();
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * Math.PI * 2;
      const u = rand(-0.6, 1);
      const r = Math.sqrt(1 - u * u);
      P.add.spawn({ x: c.x + Math.cos(a) * r * 1.6, y: c.y + u * 2, z: c.z + Math.sin(a) * r * 1.6, vx: Math.cos(a) * r * rand(4, 9), vy: u * rand(3, 7), vz: Math.sin(a) * r * rand(4, 9), life: rand(0.4, 0.9), size: rand(0.08, 0.2), size1: 0.01, r: 2.2, g: 0.9, b: 4, a: 1, a1: 0, gravity: -6, drag: 1.5, cell: 2, stretch: 0.03 });
    }
    if (!['dying', 'dead', 'emerge', 'shadowOut', 'shadowIn', 'summon'].includes(this.state)) this.setState('stagger');
  }

  onNightfall() {
    audio.play3D('shield_up', this.chestPos(), { volume: 1.1, refDistance: 12 });
    this._smoke(30);
    if (!['dying', 'dead', 'emerge'].includes(this.state) && !this.queue.includes('roar')) this.queue.unshift('roar');
  }

  // ---- damage -------------------------------------------------------------------------------------
  takeDamage(amount, info = {}) {
    if (!this.alive || this.state === 'emerge' || this.hidden > 0) return;
    const game = this.game;
    const src = info.source || 'bullet';
    if (src === 'nuke') amount = this.exposed ? this.maxHealth * 0.03 : 0;
    if (src === 'microwave') amount *= 0.8;
    const part = info.part;
    const shielded = !this.exposed;
    let mul = shielded ? NIGHT_TAKE : 1;
    if (!shielded && part === 'core') mul *= 3;
    else if (!shielded && part === 'visor') mul *= 1.6;
    const dmg = amount * mul;
    if (dmg <= 0) return;
    this.health -= dmg;
    this.flinch = Math.min(1, this.flinch + (shielded ? 0.04 : 0.12));
    const pt = info.point || this.chestPos();
    const P = game.particles;
    if (shielded) {
      this.hitFlash = Math.min(1, this.hitFlash + 0.35);
      if (src === 'bullet' || src === 'melee') {
        P.sparks(pt.x, pt.y, pt.z, -(info.dir ? info.dir.x : 0), 0.3, -(info.dir ? info.dir.z : 0), 4, [0.7, 0.35, 1.6]);
        if (game.time - this.lastShieldPing > 0.07) {
          this.lastShieldPing = game.time;
          audio.play3D('shield_hit', pt, { volume: 0.6, refDistance: 5 });
        }
        game.hud.hitmarker(false, false, 'shield');
      }
    } else {
      if (src === 'bullet' || src === 'melee') {
        P.sparks(pt.x, pt.y, pt.z, -(info.dir ? info.dir.x : 0), 0.4, -(info.dir ? info.dir.z : 0), part === 'core' ? 10 : 5, part === 'core' ? [1, 0.8, 0.4] : [1, 0.55, 0.25]);
        P.blood(pt.x, pt.y, pt.z, info.dir || _v.set(0, 0, 0), 0.8, this.ch.y);
        game.addPoints(10, false);
        game.hud.hitmarker(false, part === 'core', part === 'core' ? 'weak' : '');
        if (part === 'core' && Math.random() < 0.3) audio.play3D('impact_metal', pt, { volume: 0.5, refDistance: 4, rate: 0.7 });
      }
    }
    const frac = this.health / this.maxHealth;
    while (this.summonsLeft.length && frac < this.summonsLeft[0]) {
      this.summonsLeft.shift();
      if (!this.queue.includes('summon')) this.queue.push('summon');
    }
    if (!this.enraged && frac < 0.5) {
      this.enraged = true;
      this.queue.unshift('roar');
      game.hud.message('ENRAGED', 'The Nightwarden is getting desperate', 2.5, 'danger');
    }
    if (this.health <= 0) this.die(info);
  }

  blast(pos, radius, damage, source) {
    const c = this.chestPos();
    const d = Math.max(0, c.distanceTo(pos) - 1.2);
    if (d > radius) return;
    const k = 1 - d / radius;
    this.takeDamage(damage * (0.4 + 0.6 * k), { source, part: 'torso', point: pos.clone() });
  }

  die() {
    const game = this.game;
    this.alive = false;
    this.health = 0;
    this.setState('dying');
    this.deathT = 0;
    this.queue = [];
    for (const o of this.orbs) o.pop(true);
    audio.play3D('boss_death', this.chestPos(), { volume: 1.3, refDistance: 14, maxDistance: 200 });
    game.hud.hitmarker(true, true, 'weak');
    if (game.daybreak) game.daybreak.onBossDying(this);
  }

  _updateDeath(dt) {
    const game = this.game;
    this.deathT += dt;
    const t = this.deathT;
    const P = game.particles;
    const ch = this.ch;
    // light cracks out through the armour
    if (t < 4.3 && Math.random() < 0.8) {
      const bones = [this.B.chest, this.B.spine, this.B.head, this.B.shoulderL, this.B.shoulderR, this.B.hipL, this.B.hipR];
      const b = bones[Math.floor(Math.random() * bones.length)];
      const p = _v.set(rand(-0.1, 0.1), rand(0, 0.2), rand(-0.1, 0.1)).applyMatrix4(b.matrixWorld);
      P.add.spawn({ x: p.x, y: p.y, z: p.z, vx: rand(-1, 1), vy: rand(1, 4), vz: rand(-1, 1), life: rand(0.4, 0.9), size: rand(0.1, 0.25), size1: 0.02, r: 3, g: 2, b: 0.9, a: 1, a1: 0, cell: 0, drag: 1 });
    }
    if (t > 4.3 && this.state === 'dying') {
      this.setState('dead');
      this.root.visible = false;
      this.aura.visible = false;
      const c = _v2.set(ch.x, ch.y + 1.8, ch.z);
      for (let i = 0; i < 4; i++) P.explosion(c.x + rand(-1, 1), c.y + rand(-1, 1), c.z + rand(-1, 1), 1.2);
      for (let i = 0; i < 160; i++) {
        const a = Math.random() * Math.PI * 2;
        const u = rand(-0.3, 1);
        const r = Math.sqrt(1 - u * u);
        const sp = rand(4, 16);
        P.add.spawn({ x: c.x, y: c.y, z: c.z, vx: Math.cos(a) * r * sp, vy: u * sp, vz: Math.sin(a) * r * sp, life: rand(0.6, 1.6), size: rand(0.1, 0.3), size1: 0.02, r: 3, g: 2.2, b: 1, a: 1, a1: 0, gravity: 4, drag: 1.2, cell: 0 });
      }
      for (let i = 0; i < 40; i++) {
        P.alpha.spawn({ x: c.x + rand(-1.5, 1.5), y: c.y + rand(-1.5, 1.5), z: c.z + rand(-1.5, 1.5), vx: rand(-2, 2), vy: rand(0, 3), vz: rand(-2, 2), life: rand(2, 4), size: 1, size1: rand(3, 5), r: 0.16, g: 0.14, b: 0.16, a: 0.6, a1: 0, cell: 1, drag: 0.8 });
      }
      game.world.boom(c, 1.6);
      game.flash(0.8, 0xfff0d0);
      game.player.addShake(1, 1.2);
      audio.play3D('explosion', c, { volume: 1.4, refDistance: 14, maxDistance: 200, rate: 0.7 });
      if (game.daybreak) game.daybreak.onBossDead(this);
    }
    if (this.state === 'dying') this.root.position.set(ch.x, ch.y, ch.z);
  }

  // ---- looks ------------------------------------------------------------------------------------
  _visuals(dt, day) {
    const game = this.game;
    const ex = this.exposedK;
    const dying = this.state === 'dying';
    // night: violet; day: burning orange; death: white-gold
    const night = new THREE.Color(1.4, 0.5, 3.2);
    const burn = new THREE.Color(3.4, 1.4, 0.35);
    this.glowColor.copy(night).lerp(burn, ex);
    if (dying) this.glowColor.lerp(new THREE.Color(4, 3, 1.6), clamp(this.deathT / 3, 0, 1));
    const pulse = 0.85 + 0.15 * Math.sin(this.t * 4);
    this.trimMat.color.copy(this.glowColor).multiplyScalar(pulse * (1 + this.hitFlash * 0.6));
    this.visorMat.color.copy(this.glowColor).multiplyScalar(1.6 * pulse);
    this.visorGlow.material.color.copy(this.glowColor).multiplyScalar(0.8);
    this.material.emissive.copy(this.glowColor).multiplyScalar(0.35);
    this.material.emissiveIntensity = 3 + this.hitFlash * 3 + (dying ? this.deathT * 3 : 0);
    // the core: a dim ember behind the plates at night, a blazing weak point in daylight
    const coreK = 0.25 + ex * 1.0 + (dying ? 1.2 : 0);
    this.coreMat.color.copy(this.glowColor).multiplyScalar(coreK * (0.85 + 0.15 * Math.sin(this.t * 9)));
    this.coreGlow.material.color.copy(this.glowColor).multiplyScalar(coreK * 0.3);
    this.coreGlow.scale.setScalar(0.16 + ex * 0.2);
    for (const pl of this.plates) {
      const sx = pl.userData.sx;
      pl.position.x = pl.userData.home.x + sx * ex * 0.055;
      pl.position.z = pl.userData.home.z - ex * 0.01;
      pl.rotation.y = sx * (-0.12 + ex * 0.55);
    }
    // shield shell
    const sa = this.shieldK * (this.state === 'emerge' ? clamp(this.st / 2.6, 0, 1) : 1) * (this.hidden > 0 ? 0 : 1);
    this.shield.visible = sa > 0.02;
    this.shieldMat.uniforms.uAlpha.value = sa * 0.4;
    this.shieldMat.uniforms.uTime.value = this.t;
    this.shieldMat.uniforms.uHit.value = this.hitFlash;
    // aura under the feet
    this.aura.position.set(this.ch.x, this.groundY !== undefined ? this.ch.y + 0.04 : 0, this.ch.z);
    this.aura.scale.setScalar(5.5);
    this.aura.material.uniforms.uColor.value.copy(this.glowColor).multiplyScalar(0.18);
    this.aura.material.uniforms.uAlpha.value = dying ? 1 - clamp(this.deathT / 4.3, 0, 1) : 0.6;
    // its own light
    const L = game.world.auxLight;
    L.color.copy(this.glowColor).multiplyScalar(1 / Math.max(this.glowColor.r, this.glowColor.g, this.glowColor.b));
    L.intensity = this.root.visible ? (dying ? 50 + this.deathT * 20 : 9 - ex * 3) : 0;
    L.distance = 12;
    L.position.copy(this.chestPos()).add(_v.set(-Math.sin(this.yaw) * 0.8, 1.6, -Math.cos(this.yaw) * 0.8));
    // smoke from the stacks at night, embers and smoke from the whole body by day
    const P = game.particles;
    if (this.root.visible && !dying) {
      for (const st of this.stacks) {
        if (Math.random() > dt * 14) continue;
        const p = _v.set(0, 0, 0).applyMatrix4(st.matrixWorld);
        P.alpha.spawn({ x: p.x, y: p.y, z: p.z, vx: rand(-0.3, 0.3), vy: rand(1, 2), vz: rand(-0.3, 0.3), life: rand(1, 1.8), size: 0.25, size1: 1.1, r: ex > 0.5 ? 0.2 : 0.09, g: ex > 0.5 ? 0.17 : 0.05, b: ex > 0.5 ? 0.15 : 0.15, a: 0.55, a1: 0, cell: 1, drag: 0.6 });
      }
      if (ex > 0.4 && Math.random() < dt * 40) {
        const bones = [this.B.chest, this.B.spine, this.B.head, this.B.shoulderL, this.B.shoulderR, this.B.elbowL, this.B.elbowR, this.B.hipL, this.B.hipR];
        const b = bones[Math.floor(Math.random() * bones.length)];
        const p = _v.set(rand(-0.1, 0.1), rand(0, 0.15), rand(-0.1, 0.1)).applyMatrix4(b.matrixWorld);
        P.add.spawn({ x: p.x, y: p.y, z: p.z, vx: rand(-0.6, 0.6), vy: rand(1, 3), vz: rand(-0.6, 0.6), life: rand(0.5, 1.1), size: rand(0.04, 0.09), size1: 0.01, r: 3, g: 1.3, b: 0.3, a: 1, a1: 0, cell: 0, drag: 0.5 });
        if (Math.random() < 0.4) P.alpha.spawn({ x: p.x, y: p.y, z: p.z, vx: rand(-0.3, 0.3), vy: rand(0.8, 1.6), vz: rand(-0.3, 0.3), life: rand(1, 2), size: 0.3, size1: 1.2, r: 0.18, g: 0.16, b: 0.15, a: 0.4, a1: 0, cell: 1, drag: 0.5 });
      }
    }
    // telegraphs
    const sd = this.slamDecal;
    if (this.state === 'slam' && this.st < 1.1) {
      const k = clamp(this.st / 1.0, 0, 1);
      const f = _v.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      sd.visible = true;
      sd.position.set(this.ch.x + f.x * 1.6, this.ch.y + 0.05, this.ch.z + f.z * 1.6);
      sd.scale.setScalar(9 * (0.6 + 0.4 * k));
      sd.material.uniforms.uAlpha.value = k * (0.75 + 0.25 * Math.sin(this.t * 30));
    } else sd.visible = false;
    const lane = this.lane;
    if (this.state === 'chargeWind') {
      const k = clamp(this.st / 0.9, 0, 1);
      lane.visible = true;
      lane.position.set(this.ch.x, this.ch.y + 0.06, this.ch.z);
      lane.rotation.y = this.yaw;
      lane.scale.set(2.2, 1, 24);
      lane.material.uniforms.uAlpha.value = k;
      lane.material.uniforms.uTime.value = this.t;
    } else lane.visible = false;
    this.root.visible = this.root.visible && this.state !== 'dead';
  }

  // ---- procedural animation --------------------------------------------------------------------
  // Each state sets a target pose; the pose eases toward it so moves blend instead of snapping.
  _targetPose() {
    const T = {
      lean: 0.28, twist: 0, roll: 0, headX: -0.18, headY: 0, crouch: 0, kneel: 0, stride: 0,
      aL: [0.32, -0.88, 0.32], bL: 0.55, aR: [0.32, -0.88, 0.32], bR: 0.55, shake: 0,
    };
    const st = this.st || 0;
    const ease = (x) => x * x * (3 - 2 * x);
    const win = (a, b) => clamp((st - a) / (b - a), 0, 1);
    const sp = this.moveSpeed || 0;
    switch (this.state) {
      case 'emerge': {
        const k = clamp(st / 2.6, 0, 1);
        T.aL = [0.3, 0.75 - k * 0.9, 0.55 + k * 0.2];
        T.aR = [0.3, 0.6 - k * 0.8, 0.6 + k * 0.2];
        T.bL = T.bR = 0.4;
        T.lean = 0.6 - k * 0.3;
        T.crouch = 0.6 * (1 - k);
        T.headX = -0.5 * (1 - k);
        T.shake = 0.08;
        break;
      }
      case 'chase':
      case 'stagger':
      case 'shadowIn': {
        T.stride = clamp(sp / 2.7, 0, 1.3);
        T.lean = 0.3 + T.stride * 0.1;
        T.aL = [0.34, -0.85, 0.3 + Math.sin(this.phase) * 0.35 * T.stride];
        T.aR = [0.34, -0.85, 0.3 - Math.sin(this.phase) * 0.35 * T.stride];
        if (this.state === 'stagger') {
          // shielding its eyes from the light
          T.aL = [0.05, 0.45, 0.9];
          T.aR = [0.0, 0.55, 0.85];
          T.bL = T.bR = 1.7;
          T.lean = 0.5 + Math.sin(st * 9) * 0.06;
          T.headX = 0.35;
          T.crouch = 0.25;
          T.twist = Math.sin(st * 5) * 0.25;
          T.shake = 0.05;
        }
        break;
      }
      case 'roar': {
        const k = ease(win(0.25, 0.55)) * (1 - win(1.8, 2.2));
        T.lean = 0.28 - k * 0.65;
        T.headX = -0.18 - k * 0.6;
        T.aL = [0.95, -0.1 - k * 0.1, 0.35 - k * 0.25];
        T.aR = [0.95, -0.1 - k * 0.1, 0.35 - k * 0.25];
        T.bL = T.bR = 0.25 + (1 - k) * 0.3;
        T.crouch = 0.15 * k;
        T.shake = 0.05 * k;
        break;
      }
      case 'swipe': {
        const L = this.attackArm > 0;
        const w = ease(win(0, 0.45));
        const s = ease(win(0.45, 0.62));
        const r = ease(win(0.75, 1.2));
        const arm = [lerp(lerp(0.32, 0.95, w), -0.55, s), lerp(lerp(-0.88, 0.45, w), -0.15, s), lerp(lerp(0.32, -0.45, w), 0.9, s)];
        const rest = [0.32, -0.88, 0.32];
        const a = arm.map((v, i) => lerp(v, rest[i], r));
        if (L) T.aL = a;
        else T.aR = a;
        const tw = (w * 0.55 - s * 1.0) * (1 - r);
        T.twist = L ? -tw : tw;
        T.lean = 0.3 + s * 0.3 * (1 - r);
        if (L) T.bL = 0.3;
        else T.bR = 0.3;
        break;
      }
      case 'slam': {
        const w = ease(win(0, 0.95));
        const s = ease(win(0.95, 1.1));
        const r = ease(win(1.5, 2.3));
        const up = [0.22, 0.95, 0.15];
        const down = [0.12, -0.6, 0.8];
        const rest = [0.32, -0.88, 0.32];
        const a = up.map((v, i) => lerp(lerp(rest[i], v, w), down[i], s)).map((v, i) => lerp(v, rest[i], r));
        T.aL = a;
        T.aR = a;
        T.bL = T.bR = lerp(0.6, 0.15, w);
        T.lean = lerp(lerp(0.28, -0.3, w), 0.85, s) * (1 - r) + 0.28 * r;
        T.crouch = (s * 0.55 + w * 0.1) * (1 - r);
        T.headX = lerp(-0.4 * w, -0.1, s);
        break;
      }
      case 'chargeWind': {
        const k = ease(win(0, 0.6));
        T.crouch = 0.4 * k;
        T.lean = 0.28 + 0.45 * k;
        T.headX = -0.5 * k;
        T.aL = [0.35, -0.5, -0.65];
        T.aR = [0.35, -0.5, -0.65];
        T.shake = 0.03 * k;
        break;
      }
      case 'charge': {
        T.stride = 1.5;
        T.lean = 0.75;
        T.headX = -0.6;
        T.aL = [0.3, -0.55, -0.2 + Math.sin(this.phase) * 0.6];
        T.aR = [0.3, -0.55, -0.2 - Math.sin(this.phase) * 0.6];
        T.bL = T.bR = 1.1;
        break;
      }
      case 'chargeStop':
      case 'stun': {
        const dazed = this.state === 'stun';
        T.lean = dazed ? 0.65 : 0.5;
        T.crouch = dazed ? 0.3 : 0.15;
        T.headX = dazed ? 0.45 : 0;
        T.headY = dazed ? Math.sin(st * 3) * 0.4 : 0;
        T.aL = [0.25, -0.95, 0.15];
        T.aR = [0.25, -0.95, 0.15];
        T.twist = dazed ? Math.sin(st * 2.2) * 0.2 : 0;
        break;
      }
      case 'cast': {
        const w = ease(win(0, 0.7));
        const s = ease(win(0.7, 0.95));
        const r = ease(win(1.1, 1.6));
        const up = [0.25, 0.95, 0.3];
        const thr = [0.15, 0.25, 1.0];
        const rest = [0.32, -0.88, 0.32];
        T.aR = up.map((v, i) => lerp(lerp(rest[i], v, w), thr[i], s)).map((v, i) => lerp(v, rest[i], r));
        T.aL = [0.75, -0.25, 0.5];
        T.bR = 0.25;
        T.headX = -0.35 * w * (1 - r);
        T.lean = 0.28 - 0.3 * w * (1 - s) + 0.25 * s * (1 - r);
        T.twist = 0.25 * w - 0.4 * s * (1 - r);
        break;
      }
      case 'summon': {
        const kn = ease(win(0, 0.6)) * (1 - ease(win(2.1, 2.6)));
        const w = ease(win(0.5, 0.95));
        const s = ease(win(0.95, 1.1));
        T.kneel = kn;
        T.lean = 0.28 + 0.35 * kn + s * 0.25;
        T.aR = [lerp(0.3, 0.1, s), lerp(lerp(-0.88, 0.8, w), -0.95, s), lerp(0.32, 0.3, s)];
        T.aL = [0.25, -0.6, 0.65];
        T.bR = 0.2;
        T.headX = -0.1;
        break;
      }
      case 'shadowOut': {
        const k = clamp(st / 0.7, 0, 1);
        T.crouch = 0.4 * k;
        T.lean = 0.6;
        T.aL = [0.9, 0.3, 0.2];
        T.aR = [0.9, 0.3, 0.2];
        T.shake = 0.06;
        break;
      }
      case 'dying':
      case 'dead': {
        const t = this.deathT;
        const back = ease(clamp(t / 0.9, 0, 1));
        const knees = ease(clamp((t - 0.8) / 0.9, 0, 1));
        const roar = ease(clamp((t - 1.7) / 0.6, 0, 1)) * (1 - ease(clamp((t - 3.3) / 0.6, 0, 1)));
        const fall = ease(clamp((t - 3.3) / 0.9, 0, 1));
        T.kneel = knees;
        T.lean = 0.28 - back * 0.4 + knees * 0.4 - roar * 0.7 + fall * 0.9;
        T.headX = -0.2 - roar * 0.7 + fall * 0.5;
        T.aL = [0.9, -0.1 + roar * 0.3, 0.3];
        T.aR = [0.9, -0.1 + roar * 0.3, 0.3];
        T.bL = T.bR = 0.3;
        T.shake = 0.04 + roar * 0.06;
        T.fall = fall;
        break;
      }
      default:
        break;
    }
    if (this.flinch > 0) {
      T.lean -= this.flinch * 0.25;
      T.headX -= this.flinch * 0.2;
    }
    return T;
  }

  _animate(dt) {
    const B = this.B;
    const T = this._targetPose();
    if (!this.pose) this.pose = JSON.parse(JSON.stringify(T));
    const P = this.pose;
    const k = 1 - Math.exp(-14 * dt);
    for (const key of Object.keys(T)) {
      if (Array.isArray(T[key])) for (let i = 0; i < 3; i++) P[key][i] += (T[key][i] - P[key][i]) * k;
      else if (key === 'stride' || key === 'kneel' || key === 'fall') P[key] = T[key];
      else P[key] = (P[key] ?? T[key]) + (T[key] - (P[key] ?? T[key])) * k;
    }
    for (const b of this.boneList) b.quaternion.copy(b.userData.bindQ);
    B.hips.position.copy(B.hips.userData.bindP);
    const rot = (bone, x, y = 0, z = 0) => {
      _q.setFromEuler(_e.set(x, y, z, 'YXZ'));
      bone.quaternion.multiply(_q);
    };
    const armDir = (bone, left, d) => {
      _v.set(left ? d[0] : -d[0], d[1], d[2]).normalize();
      _q.setFromUnitVectors(left ? X : NX, _v);
      bone.quaternion.premultiply(_q);
    };
    this.root.rotation.set(0, this.yaw || 0, 0);
    const sh = P.shake ? (Math.random() - 0.5) * P.shake : 0;
    // legs: heavy wide-stance stride, or kneeling
    const ph = this.phase || 0;
    const s = Math.sin(ph);
    const c = Math.cos(ph);
    const amp = 0.5 * Math.min(1.4, P.stride);
    const crouch = P.crouch + 0.06;
    B.hips.position.y -= crouch * 0.24 + Math.abs(c) * 0.05 * Math.min(1, P.stride) + P.kneel * 0.3;
    rot(B.hips, (P.fall || 0) * 1.2, s * 0.1 * Math.min(1, P.stride), s * 0.06 * Math.min(1, P.stride));
    if (P.kneel > 0.01) {
      const kn = P.kneel;
      rot(B.hipL, -1.2 * kn - crouch * 0.6 * (1 - kn), 0, 0.12);
      rot(B.kneeL, 1.45 * kn + crouch * 0.9 * (1 - kn), 0, 0);
      rot(B.hipR, 0.25 * kn - crouch * 0.6 * (1 - kn), 0, -0.12);
      rot(B.kneeR, 1.75 * kn + crouch * 0.9 * (1 - kn), 0, 0);
      rot(B.ankleR, -0.5 * kn, 0, 0);
    } else {
      rot(B.hipL, -s * amp - crouch * 0.6, 0, 0.14);
      rot(B.hipR, s * amp - crouch * 0.6, 0, -0.14);
      rot(B.kneeL, Math.max(0, -c) * amp * 1.4 + crouch * 0.95 + 0.1, 0, 0);
      rot(B.kneeR, Math.max(0, c) * amp * 1.4 + crouch * 0.95 + 0.1, 0, 0);
      rot(B.ankleL, -0.12 * s * Math.min(1, P.stride) - crouch * 0.35, 0, -0.08);
      rot(B.ankleR, 0.12 * s * Math.min(1, P.stride) - crouch * 0.35, 0, 0.08);
    }
    // torso
    rot(B.spine, P.lean * 0.55 + sh, P.twist * 0.5 - s * 0.06 * Math.min(1, P.stride), P.roll);
    rot(B.chest, P.lean * 0.45, P.twist * 0.5 + sh, 0);
    rot(B.head, P.headX + sh, P.headY + Math.sin((this.t || 0) * 0.7) * 0.12, 0);
    // arms
    armDir(B.shoulderL, true, P.aL);
    armDir(B.shoulderR, false, P.aR);
    rot(B.elbowL, 0, -P.bL, 0);
    rot(B.elbowR, 0, P.bR, 0);
  }

  // ---- hit volumes (world space) ---------------------------------------------------------------
  updateHitboxes(frame) {
    if (this.hit.frame === frame) return;
    this.hit.frame = frame;
    this.root.updateMatrixWorld(true);
    const B = this.B;
    const h = this.hit;
    h.head.set(0, 0.12, 0.01).applyMatrix4(B.head.matrixWorld);
    h.chest.set(0, 0.1, 0).applyMatrix4(B.chest.matrixWorld);
    h.core.set(0, 0.11, 0.12).applyMatrix4(B.chest.matrixWorld);
    h.hips.set(0, 0, 0).applyMatrix4(B.hips.matrixWorld);
    const L = h.limbs;
    const at = (bone, out, x = 0, y = 0, z = 0) => out.set(x, y, z).applyMatrix4(bone.matrixWorld);
    at(B.hipL, L[0][0]);
    at(B.kneeL, L[0][1]);
    at(B.kneeL, L[1][0]);
    at(B.ankleL, L[1][1]);
    at(B.hipR, L[2][0]);
    at(B.kneeR, L[2][1]);
    at(B.kneeR, L[3][0]);
    at(B.ankleR, L[3][1]);
    at(B.shoulderL, L[4][0]);
    at(B.elbowL, L[4][1]);
    at(B.elbowL, L[5][0]);
    at(B.elbowL, L[5][1], 0.34, 0, 0);
    at(B.shoulderR, L[6][0]);
    at(B.elbowR, L[6][1]);
    at(B.elbowR, L[7][0]);
    at(B.elbowR, L[7][1], -0.34, 0, 0);
  }

  raycast(o, d, maxDist, frame = -1) {
    if (!this.alive || this.hidden > 0 || (this.state === 'emerge' && this.st < 1.2)) return null;
    const ch = this.ch;
    // cheap reject
    const tx = ch.x - o.x;
    const ty = ch.y + 1.7 - o.y;
    const tz = ch.z - o.z;
    const along = tx * d.x + ty * d.y + tz * d.z;
    if (along < -3 || along > maxDist + 3) return null;
    if (tx * tx + ty * ty + tz * tz - along * along > 9) return null;
    this.updateHitboxes(frame < 0 ? this.game.frame : frame);
    const h = this.hit;
    let best = Infinity;
    let part = null;
    const test = (t, name) => {
      if (t >= 0 && t < best) {
        best = t;
        part = name;
      }
    };
    test(raySphere(o, d, h.head, 0.3), 'visor');
    if (this.exposedK > 0.5) test(raySphere(o, d, h.core, 0.22), 'core');
    // the torso capsule; the core wins ties when exposed (it sits in front of it)
    const tt = rayCapsule(o, d, h.hips, h.chest, 0.5);
    if (tt >= 0 && tt < best - (part === 'core' ? 0.25 : 0)) {
      best = tt;
      part = 'torso';
    }
    for (let i = 0; i < 8; i++) test(rayCapsule(o, d, h.limbs[i][0], h.limbs[i][1], i < 4 ? 0.2 : 0.17), 'torso');
    if (!part || best > maxDist) return null;
    return { zombie: this, dist: best, part, point: o.clone().addScaledVector(d, best) };
  }

  inCone(o, d, range, cosA) {
    const c = this.chestPos();
    _v.copy(c).sub(o);
    const dist = _v.length();
    if (dist > range + 1.5) return false;
    if (_v.dot(d) / Math.max(0.01, dist) < cosA && dist > 2.5) return false;
    return this.game.world.physics.visible(o.x, o.y, o.z, c.x, c.y, c.z);
  }

  aimPoint() {
    if (!this.alive || this.hidden > 0) return null;
    this.updateHitboxes(this.game.frame);
    return this.exposedK > 0.5 ? this.hit.core : this.hit.chest;
  }

  chestPos() {
    if (this.root.visible) {
      this.updateHitboxes(this.game.frame);
      return _v2.copy(this.hit.chest);
    }
    return _v2.set(this.ch.x, this.ch.y + 2, this.ch.z);
  }

  get meleeReach() {
    return 1.2;
  }
}
