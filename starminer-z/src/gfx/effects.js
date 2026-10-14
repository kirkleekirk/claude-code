// Small effects in the world: the frame around the block you're pointing at and the cracks
// as you dig it, chunks of block that fly when it breaks, dust, sparks, blood, smoke and
// tracers. Each kind is one draw call.

import * as THREE from 'three';
import { SOLID } from '../world/blocks.js';

// ---- the selection frame and the cracks -------------------------------------------------------

function frameTexture() {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.clearRect(0, 0, S, S);
  // a gilded frame like the original's: bright edge, darker inner bevel
  const w = 11;
  const grad = g.createLinearGradient(0, 0, S, S);
  grad.addColorStop(0, '#fff2c2');
  grad.addColorStop(0.5, '#e8b85a');
  grad.addColorStop(1, '#a8742a');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, w); g.fillRect(0, S - w, S, w); g.fillRect(0, 0, w, S); g.fillRect(S - w, 0, w, S);
  g.fillStyle = 'rgba(60,36,10,0.85)';
  g.fillRect(w, w, S - 2 * w, 2); g.fillRect(w, w, 2, S - 2 * w);
  g.fillStyle = 'rgba(255,240,200,0.7)';
  g.fillRect(w, S - w - 2, S - 2 * w, 2); g.fillRect(S - w - 2, w, 2, S - 2 * w);
  // a faint glow inside
  const ig = g.createRadialGradient(S / 2, S / 2, S * 0.2, S / 2, S / 2, S * 0.7);
  ig.addColorStop(0, 'rgba(255,230,160,0)');
  ig.addColorStop(1, 'rgba(255,230,160,0.18)');
  g.fillStyle = ig;
  g.fillRect(w, w, S - 2 * w, S - 2 * w);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function crackTextures() {
  const S = 64, out = [];
  // one set of crack lines, revealed a little more each stage
  let h = 7;
  const rnd = () => ((h = (h * 16807) % 2147483647) / 2147483647);
  const lines = [];
  for (let i = 0; i < 26; i++) {
    let x = S / 2 + (rnd() - 0.5) * 20, y = S / 2 + (rnd() - 0.5) * 20;
    const a0 = rnd() * Math.PI * 2;
    const seg = [];
    for (let k = 0; k < 6; k++) {
      const a = a0 + (rnd() - 0.5) * 1.2;
      const l = 4 + rnd() * 7;
      const nx = x + Math.cos(a) * l, ny = y + Math.sin(a) * l;
      seg.push([x, y, nx, ny]);
      x = nx; y = ny;
    }
    lines.push(seg);
  }
  for (let st = 0; st < 10; st++) {
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    g.strokeStyle = 'rgba(0,0,0,0.85)';
    g.lineCap = 'round';
    const n = Math.round(((st + 1) / 10) * lines.length);
    for (let i = 0; i < n; i++) {
      g.lineWidth = 1.2 + (i % 3) * 0.5;
      g.beginPath();
      const segs = lines[i].slice(0, 2 + Math.floor((st / 9) * 4));
      for (const [x0, y0, x1, y1] of segs) { g.moveTo(x0, y0); g.lineTo(x1, y1); }
      g.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter;
    out.push(t);
  }
  return out;
}

export class BlockHighlight {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    const fm = new THREE.MeshBasicMaterial({ map: frameTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, color: new THREE.Color(1.6, 1.4, 1.1), toneMapped: false });
    this.frame = new THREE.Mesh(new THREE.PlaneGeometry(1.01, 1.01), fm);
    this.frame.renderOrder = 10;
    this.group.add(this.frame);
    this.cracks = crackTextures();
    this.crackMat = new THREE.MeshBasicMaterial({ map: this.cracks[0], transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, color: 0x000000, toneMapped: false });
    this.crack = new THREE.Mesh(new THREE.BoxGeometry(1.004, 1.004, 1.004), this.crackMat);
    this.crack.renderOrder = 9;
    this.group.add(this.crack);
    this.group.visible = false;
  }

  show(hit, progress) {
    if (!hit) { this.group.visible = false; return; }
    this.group.visible = true;
    const cx = hit.x + 0.5, cy = hit.y + 0.5, cz = hit.z + 0.5;
    this.frame.position.set(cx + hit.nx * 0.505, cy + hit.ny * 0.505, cz + hit.nz * 0.505);
    this.frame.lookAt(cx + hit.nx * 2, cy + hit.ny * 2, cz + hit.nz * 2);
    this.crack.position.set(cx, cy, cz);
    this.crack.visible = progress > 0.02;
    if (this.crack.visible) {
      const st = Math.min(9, Math.floor(progress * 10));
      this.crackMat.map = this.cracks[st];
    }
  }
}

// ---- debris: little cubes of the broken block ------------------------------------------------

export class Debris {
  constructor(scene, world, max = 600) {
    this.world = world;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    mat.onBeforeCompile = (sh) => {
      // lit roughly by the light at the break, shaded by face
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vShade;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvShade = 0.72 + 0.28 * normal.y + 0.12 * normal.x;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vShade;').replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( diffuse * vShade, opacity );');
    };
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.setColorAt(0, new THREE.Color());
    scene.add(this.mesh);
    this.parts = [];
    this.max = max;
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._c = new THREE.Color();
  }

  burst(x, y, z, color, n = 14, light = 1, power = 1) {
    const base = new THREE.Color(color);
    for (let i = 0; i < n && this.parts.length < this.max; i++) {
      const c = base.clone().multiplyScalar((0.75 + Math.random() * 0.4) * light);
      this.parts.push({
        p: new THREE.Vector3(x + (Math.random() - 0.5) * 0.8, y + (Math.random() - 0.5) * 0.8, z + (Math.random() - 0.5) * 0.8),
        v: new THREE.Vector3((Math.random() - 0.5) * 4 * power, Math.random() * 4.5 * power + 1, (Math.random() - 0.5) * 4 * power),
        r: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6),
        s: 0.07 + Math.random() * 0.09,
        life: 0.7 + Math.random() * 0.7,
        c,
      });
    }
  }

  update(dt) {
    const w = this.world;
    let n = 0;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) { this.parts.splice(i, 1); continue; }
      p.v.y -= 22 * dt;
      const nx = p.p.x + p.v.x * dt, ny = p.p.y + p.v.y * dt, nz = p.p.z + p.v.z * dt;
      if (SOLID[w.getBlock(nx, ny, nz)]) {
        if (SOLID[w.getBlock(p.p.x, ny, p.p.z)]) { p.v.y *= -0.35; p.v.x *= 0.6; p.v.z *= 0.6; }
        else { p.v.x *= -0.4; p.v.z *= -0.4; }
      } else p.p.set(nx, ny, nz);
    }
    for (const p of this.parts) {
      const s = p.s * Math.min(1, p.life * 3);
      this._q.setFromEuler(this._e.set(p.r.x + p.life * 5, p.r.y, p.r.z));
      this._m.compose(p.p, this._q, new THREE.Vector3(s, s, s));
      this.mesh.setMatrixAt(n, this._m);
      this.mesh.setColorAt(n, p.c);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

// ---- sprites: dust, smoke, blood, sparks -----------------------------------------------------

const SPRITE_VS = /* glsl */ `
attribute float aSize;
attribute vec4 aColor;
attribute float aKind;
varying vec4 vColor;
varying float vKind;
uniform float uScale;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(0.1, -mv.z);
  vColor = aColor;
  vKind = aKind;
  gl_Position = projectionMatrix * mv;
}`;
const SPRITE_FS = /* glsl */ `
varying vec4 vColor;
varying float vKind;
void main() {
  vec2 q = gl_PointCoord - 0.5;
  float r = length(q) * 2.0;
  float a = vKind > 0.5 ? smoothstep(1.0, 0.0, r) : smoothstep(1.0, 0.6, r) * 0.9;
  if (a <= 0.01) discard;
  gl_FragColor = vec4(vColor.rgb, vColor.a * a);
}`;

export class Sprites {
  constructor(scene, max = 800) {
    this.max = max;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    this.kind = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aKind', new THREE.BufferAttribute(this.kind, 1).setUsage(THREE.DynamicDrawUsage));
    this.uniforms = { uScale: { value: 300 } };
    this.mat = new THREE.ShaderMaterial({ vertexShader: SPRITE_VS, fragmentShader: SPRITE_FS, uniforms: this.uniforms, transparent: true, depthWrite: false });
    this.addMat = this.mat.clone();
    this.addMat.blending = THREE.AdditiveBlending;
    // (a clone gets its own copy of the uniforms: the glowing ones must follow the same scale)
    this.addMat.uniforms = this.uniforms;
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 20;
    scene.add(this.points);
    // additive things (sparks, flame) in their own set
    const g2 = new THREE.BufferGeometry();
    this.pos2 = new Float32Array(max * 3);
    this.col2 = new Float32Array(max * 4);
    this.size2 = new Float32Array(max);
    this.kind2 = new Float32Array(max);
    g2.setAttribute('position', new THREE.BufferAttribute(this.pos2, 3).setUsage(THREE.DynamicDrawUsage));
    g2.setAttribute('aColor', new THREE.BufferAttribute(this.col2, 4).setUsage(THREE.DynamicDrawUsage));
    g2.setAttribute('aSize', new THREE.BufferAttribute(this.size2, 1).setUsage(THREE.DynamicDrawUsage));
    g2.setAttribute('aKind', new THREE.BufferAttribute(this.kind2, 1).setUsage(THREE.DynamicDrawUsage));
    this.glow = new THREE.Points(g2, this.addMat);
    this.glow.frustumCulled = false;
    this.glow.renderOrder = 21;
    scene.add(this.glow);
    this.list = [];
  }

  // kind: 'dust' | 'smoke' | 'blood' | 'spark' | 'flame'
  emit(kind, x, y, z, o = {}) {
    if (this.list.length >= this.max * 2) return;
    const add = kind === 'spark' || kind === 'flame';
    this.list.push({
      kind, add,
      p: new THREE.Vector3(x, y, z),
      v: o.v ? o.v.clone() : new THREE.Vector3((Math.random() - 0.5) * (o.spread ?? 1), (Math.random() - 0.2) * (o.spread ?? 1), (Math.random() - 0.5) * (o.spread ?? 1)),
      life: o.life ?? 1, max: o.life ?? 1,
      size: o.size ?? 0.2,
      grow: o.grow ?? 0,
      c: o.color ? new THREE.Color(o.color) : new THREE.Color(1, 1, 1),
      a: o.alpha ?? 1,
      g: o.gravity ?? 0,
      drag: o.drag ?? 1.5,
    });
  }

  update(dt) {
    let n = 0, m = 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life -= dt;
      if (p.life <= 0) { this.list.splice(i, 1); continue; }
      p.v.y -= p.g * dt;
      p.v.multiplyScalar(Math.max(0, 1 - p.drag * dt));
      p.p.addScaledVector(p.v, dt);
    }
    for (const p of this.list) {
      const t = p.life / p.max;
      const size = (p.size + p.grow * (1 - t)) * 60;
      const alpha = p.a * Math.min(1, t * 3) * (p.kind === 'smoke' ? t : 1);
      if (p.add) {
        if (m >= this.max) continue;
        this.pos2.set([p.p.x, p.p.y, p.p.z], m * 3);
        this.col2.set([p.c.r, p.c.g, p.c.b, alpha], m * 4);
        this.size2[m] = size; this.kind2[m] = 1; m++;
      } else {
        if (n >= this.max) continue;
        this.pos.set([p.p.x, p.p.y, p.p.z], n * 3);
        this.col.set([p.c.r, p.c.g, p.c.b, alpha], n * 4);
        this.size[n] = size; this.kind[n] = 0; n++;
      }
    }
    const g = this.points.geometry, g2 = this.glow.geometry;
    g.setDrawRange(0, n); g2.setDrawRange(0, m);
    for (const k of ['position', 'aColor', 'aSize', 'aKind']) { g.attributes[k].needsUpdate = true; g2.attributes[k].needsUpdate = true; }
  }

  setScale(h, fov) {
    this.uniforms.uScale.value = h / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2)) / 60;
  }
}
