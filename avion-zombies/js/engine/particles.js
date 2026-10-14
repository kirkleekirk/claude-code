import * as THREE from '../../vendor/three.module.min.js';
import { fogGLSL } from '../world/fog.js';
import { rand } from '../util.js';

// CPU-simulated, GPU-billboarded particles. Two pools: additive (sparks, fire, glows)
// and alpha (blood, dust, smoke). One draw call each.

function makeAtlas() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  const h = S / 2;
  // 0: soft round
  let g = ctx.createRadialGradient(h / 2, h / 2, 0, h / 2, h / 2, h / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, h, h);
  // 1: smoke puff (noisy)
  const img = ctx.createImageData(h, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < h; x++) {
      const dx = (x - h / 2) / (h / 2);
      const dy = (y - h / 2) / (h / 2);
      const r = Math.sqrt(dx * dx + dy * dy);
      const n = 0.55 + 0.45 * Math.sin(x * 0.31 + Math.sin(y * 0.17) * 3) * Math.sin(y * 0.23 + Math.sin(x * 0.13) * 2);
      const a = Math.max(0, 1 - r) ** 1.6 * (0.55 + 0.45 * n);
      const o = (y * h + x) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = 255;
      img.data[o + 3] = a * 255;
    }
  }
  ctx.putImageData(img, h, 0);
  // 2: streak / spark
  g = ctx.createLinearGradient(0, h, 0, S);
  ctx.save();
  ctx.translate(h / 2, h + h / 2);
  const g2 = ctx.createRadialGradient(0, 0, 0, 0, 0, h / 2);
  g2.addColorStop(0, 'rgba(255,255,255,1)');
  g2.addColorStop(0.2, 'rgba(255,255,255,0.8)');
  g2.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.scale(0.25, 1);
  ctx.fillStyle = g2;
  ctx.beginPath();
  ctx.arc(0, 0, h / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // 3: blood / debris splat
  ctx.save();
  ctx.translate(h + h / 2, h + h / 2);
  for (let k = 0; k < 14; k++) {
    const a = Math.random() * Math.PI * 2;
    const d = Math.random() * h * 0.3;
    const r = h * (0.06 + Math.random() * 0.12);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(Math.cos(a) * d, Math.sin(a) * d, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const vert = /* glsl */ `
attribute vec3 iPos;
attribute vec4 iColor;
attribute vec4 iMisc; // size, rotation, atlas cell, stretch
attribute vec3 iVel;
varying vec2 vUv;
varying vec4 vColor;
varying vec3 vViewPos;
void main() {
  vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
  float size = iMisc.x;
  float rot = iMisc.y;
  vec2 corner = position.xy;
  vec2 offs;
  if (iMisc.w > 0.0) {
    // stretch along screen-space velocity
    vec3 vv = (modelViewMatrix * vec4(iVel, 0.0)).xyz;
    vec2 d = vv.xy;
    float l = length(d);
    vec2 dir = l > 1e-4 ? d / l : vec2(0.0, 1.0);
    vec2 nrm = vec2(-dir.y, dir.x);
    offs = nrm * corner.x * size + dir * corner.y * (size + l * iMisc.w);
  } else {
    float c = cos(rot), s = sin(rot);
    offs = vec2(c * corner.x - s * corner.y, s * corner.x + c * corner.y) * size;
  }
  mv.xy += offs;
  vViewPos = mv.xyz;
  float cell = iMisc.z;
  vUv = (vec2(mod(cell, 2.0), floor(cell / 2.0)) + (position.xy + 0.5)) * 0.5;
  vUv.y = 1.0 - vUv.y;
  vColor = iColor;
  gl_Position = projectionMatrix * mv;
}
`;

const frag = /* glsl */ `
uniform sampler2D uAtlas;
varying vec2 vUv;
varying vec4 vColor;
varying vec3 vViewPos;
${fogGLSL.pars}
${fogGLSL.func}
uniform float uFogScale;
void main() {
  vec4 t = texture2D(uAtlas, vUv);
  vec4 c = vec4(vColor.rgb, vColor.a * t.a);
  vec3 fc;
  float f = worldFog(vViewPos, fc) * uFogScale;
  #ifdef ADDITIVE
    c.rgb *= (1.0 - f);
    gl_FragColor = vec4(c.rgb * c.a, c.a);
  #else
    c.rgb = mix(c.rgb, fc, f);
    gl_FragColor = c;
  #endif
  if (gl_FragColor.a < 0.003) discard;
}
`;

class Pool {
  constructor(max, additive, atlas, scene) {
    this.max = max;
    this.count = 0;
    const N = max;
    this.px = new Float32Array(N);
    this.py = new Float32Array(N);
    this.pz = new Float32Array(N);
    this.vx = new Float32Array(N);
    this.vy = new Float32Array(N);
    this.vz = new Float32Array(N);
    this.life = new Float32Array(N);
    this.maxLife = new Float32Array(N);
    this.s0 = new Float32Array(N);
    this.s1 = new Float32Array(N);
    this.cr = new Float32Array(N);
    this.cg = new Float32Array(N);
    this.cb = new Float32Array(N);
    this.a0 = new Float32Array(N);
    this.a1 = new Float32Array(N);
    this.grav = new Float32Array(N);
    this.drag = new Float32Array(N);
    this.rot = new Float32Array(N);
    this.rotV = new Float32Array(N);
    this.cell = new Float32Array(N);
    this.stretch = new Float32Array(N);
    this.floorY = new Float32Array(N);

    const geo = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    geo.index = quad.index;
    geo.setAttribute('position', quad.attributes.position);
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aMisc = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aVel = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iPos', this.aPos);
    geo.setAttribute('iColor', this.aColor);
    geo.setAttribute('iMisc', this.aMisc);
    geo.setAttribute('iVel', this.aVel);
    geo.instanceCount = 0;
    const uniforms = { uAtlas: { value: atlas }, uFogScale: { value: 1 }, ...fogGLSL.uniforms() };
    this.material = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms,
      transparent: true,
      depthWrite: false,
      fog: true,
      blending: additive ? THREE.CustomBlending : THREE.NormalBlending,
      defines: additive ? { ADDITIVE: 1 } : {},
    });
    if (additive) {
      this.material.blendSrc = THREE.OneFactor;
      this.material.blendDst = THREE.OneFactor;
      this.material.blendEquation = THREE.AddEquation;
    }
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 20 : 10;
    scene.add(this.mesh);
    this.geo = geo;
  }

  spawn(p) {
    let i = this.count;
    if (i >= this.max) {
      // overwrite the oldest-ish slot
      i = Math.floor(Math.random() * this.max);
    } else this.count++;
    this.px[i] = p.x;
    this.py[i] = p.y;
    this.pz[i] = p.z;
    this.vx[i] = p.vx || 0;
    this.vy[i] = p.vy || 0;
    this.vz[i] = p.vz || 0;
    this.life[i] = 0;
    this.maxLife[i] = p.life || 1;
    this.s0[i] = p.size ?? 0.2;
    this.s1[i] = p.size1 ?? this.s0[i];
    this.cr[i] = p.r ?? 1;
    this.cg[i] = p.g ?? 1;
    this.cb[i] = p.b ?? 1;
    this.a0[i] = p.a ?? 1;
    this.a1[i] = p.a1 ?? 0;
    this.grav[i] = p.gravity ?? 0;
    this.drag[i] = p.drag ?? 0;
    this.rot[i] = p.rot ?? Math.random() * 6.28;
    this.rotV[i] = p.rotV ?? 0;
    this.cell[i] = p.cell ?? 0;
    this.stretch[i] = p.stretch ?? 0;
    this.floorY[i] = p.floor ?? -1e9;
  }

  update(dt) {
    let n = this.count;
    for (let i = 0; i < n; i++) {
      this.life[i] += dt;
      if (this.life[i] >= this.maxLife[i]) {
        n--;
        this._move(n, i);
        i--;
        continue;
      }
      const d = Math.max(0, 1 - this.drag[i] * dt);
      this.vx[i] *= d;
      this.vy[i] = this.vy[i] * d - this.grav[i] * dt;
      this.vz[i] *= d;
      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
      this.pz[i] += this.vz[i] * dt;
      if (this.py[i] < this.floorY[i]) {
        this.py[i] = this.floorY[i];
        this.vy[i] *= -0.25;
        this.vx[i] *= 0.5;
        this.vz[i] *= 0.5;
      }
      this.rot[i] += this.rotV[i] * dt;
    }
    this.count = n;
    const P = this.aPos.array;
    const C = this.aColor.array;
    const Mi = this.aMisc.array;
    const V = this.aVel.array;
    for (let i = 0; i < n; i++) {
      const t = this.life[i] / this.maxLife[i];
      P[i * 3] = this.px[i];
      P[i * 3 + 1] = this.py[i];
      P[i * 3 + 2] = this.pz[i];
      C[i * 4] = this.cr[i];
      C[i * 4 + 1] = this.cg[i];
      C[i * 4 + 2] = this.cb[i];
      // quick fade-in then lerp a0 -> a1
      const fin = Math.min(1, t * 12);
      C[i * 4 + 3] = (this.a0[i] + (this.a1[i] - this.a0[i]) * t) * fin;
      Mi[i * 4] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      Mi[i * 4 + 1] = this.rot[i];
      Mi[i * 4 + 2] = this.cell[i];
      Mi[i * 4 + 3] = this.stretch[i];
      V[i * 3] = this.vx[i];
      V[i * 3 + 1] = this.vy[i];
      V[i * 3 + 2] = this.vz[i];
    }
    this.geo.instanceCount = n;
    if (n > 0) {
      this.aPos.addUpdateRange(0, n * 3);
      this.aColor.addUpdateRange(0, n * 4);
      this.aMisc.addUpdateRange(0, n * 4);
      this.aVel.addUpdateRange(0, n * 3);
      this.aPos.needsUpdate = this.aColor.needsUpdate = this.aMisc.needsUpdate = this.aVel.needsUpdate = true;
    }
  }

  _move(from, to) {
    const arrs = [this.px, this.py, this.pz, this.vx, this.vy, this.vz, this.life, this.maxLife, this.s0, this.s1, this.cr, this.cg, this.cb, this.a0, this.a1, this.grav, this.drag, this.rot, this.rotV, this.cell, this.stretch, this.floorY];
    for (const a of arrs) a[to] = a[from];
  }

  clear() {
    this.count = 0;
    this.geo.instanceCount = 0;
  }
}

export class Particles {
  constructor(scene) {
    this.atlas = makeAtlas();
    this.add = new Pool(2600, true, this.atlas, scene);
    this.alpha = new Pool(2200, false, this.atlas, scene);
  }

  update(dt) {
    this.add.update(dt);
    this.alpha.update(dt);
  }

  clear() {
    this.add.clear();
    this.alpha.clear();
  }

  // ---- effect presets --------------------------------------------------------------------
  blood(x, y, z, dir, amount = 1, floor = -1e9) {
    const n = Math.round(10 * amount);
    for (let i = 0; i < n; i++) {
      const sp = rand(1, 4.5) * amount;
      this.alpha.spawn({
        x, y, z, vx: dir.x * sp * 0.6 + rand(-1.5, 1.5), vy: rand(0, 3) + dir.y, vz: dir.z * sp * 0.6 + rand(-1.5, 1.5),
        life: rand(0.35, 0.8), size: rand(0.04, 0.09), size1: 0.02, r: 0.32, g: 0.02, b: 0.02, a: 0.95, a1: 0.6,
        gravity: 12, drag: 1, cell: 3, floor,
      });
    }
    for (let i = 0; i < Math.ceil(3 * amount); i++) {
      this.alpha.spawn({
        x, y, z, vx: dir.x * 0.8 + rand(-0.4, 0.4), vy: rand(-0.2, 0.5), vz: dir.z * 0.8 + rand(-0.4, 0.4),
        life: rand(0.4, 0.9), size: rand(0.12, 0.2), size1: rand(0.4, 0.7), r: 0.28, g: 0.02, b: 0.02, a: 0.55, a1: 0, drag: 3, cell: 1,
      });
    }
  }

  gib(x, y, z, amount = 1) {
    for (let i = 0; i < 18 * amount; i++) {
      this.alpha.spawn({
        x, y, z, vx: rand(-3.5, 3.5), vy: rand(1, 6), vz: rand(-3.5, 3.5), life: rand(0.6, 1.2), size: rand(0.05, 0.12), size1: 0.04,
        r: 0.35, g: 0.03, b: 0.03, a: 1, a1: 0.7, gravity: 14, drag: 0.5, cell: 3, floor: y - 1.7,
      });
    }
    for (let i = 0; i < 6 * amount; i++) {
      this.alpha.spawn({
        x, y, z, vx: rand(-1, 1), vy: rand(0, 1), vz: rand(-1, 1), life: rand(0.5, 1), size: 0.2, size1: 0.9,
        r: 0.3, g: 0.02, b: 0.02, a: 0.5, a1: 0, drag: 2.5, cell: 1,
      });
    }
  }

  sparks(x, y, z, nx, ny, nz, n = 8, color = [1, 0.75, 0.4]) {
    for (let i = 0; i < n; i++) {
      const sp = rand(3, 9);
      this.add.spawn({
        x, y, z, vx: nx * sp + rand(-3, 3), vy: ny * sp + rand(-1, 4), vz: nz * sp + rand(-3, 3),
        life: rand(0.15, 0.45), size: 0.025, r: color[0] * 4, g: color[1] * 4, b: color[2] * 4, a: 1, a1: 0, gravity: 9, drag: 1.5, cell: 2, stretch: 0.045,
      });
    }
  }

  dust(x, y, z, nx, ny, nz, color = [0.42, 0.36, 0.3], n = 4, scale = 1) {
    for (let i = 0; i < n; i++) {
      this.alpha.spawn({
        x, y, z, vx: nx * rand(0.5, 2) + rand(-0.6, 0.6), vy: ny * rand(0.5, 2) + rand(0, 0.8), vz: nz * rand(0.5, 2) + rand(-0.6, 0.6),
        life: rand(0.5, 1.2), size: 0.1 * scale, size1: rand(0.45, 0.8) * scale, r: color[0], g: color[1], b: color[2], a: 0.6, a1: 0, drag: 2.5, cell: 1, rotV: rand(-1, 1),
      });
    }
    for (let i = 0; i < n * 2; i++) {
      this.alpha.spawn({
        x, y, z, vx: nx * rand(2, 5) + rand(-2, 2), vy: ny * rand(2, 5) + rand(0, 2), vz: nz * rand(2, 5) + rand(-2, 2),
        life: rand(0.3, 0.7), size: 0.03 * scale, size1: 0.02, r: color[0] * 0.6, g: color[1] * 0.6, b: color[2] * 0.6, a: 1, a1: 0.8, gravity: 12, cell: 3,
      });
    }
  }

  tracer(x, y, z, dx, dy, dz, dist, color = [1, 0.8, 0.5]) {
    const speed = 380;
    this.add.spawn({
      x: x + dx * 1.2, y: y + dy * 1.2, z: z + dz * 1.2, vx: dx * speed, vy: dy * speed, vz: dz * speed,
      life: Math.max(0.02, (dist - 1.5) / speed), size: 0.018, r: color[0] * 3, g: color[1] * 3, b: color[2] * 3, a: 0.9, a1: 0.6, cell: 2, stretch: 0.012,
    });
  }

  explosion(x, y, z, scale = 1) {
    for (let i = 0; i < 26 * scale; i++) {
      const a = Math.random() * 6.28;
      const sp = rand(2, 9) * scale;
      this.add.spawn({
        x, y: y + 0.3, z, vx: Math.cos(a) * sp, vy: rand(1, 7) * scale, vz: Math.sin(a) * sp, life: rand(0.25, 0.6),
        size: rand(0.4, 0.9) * scale, size1: rand(1.2, 2.2) * scale, r: 4, g: 1.8, b: 0.5, a: 1, a1: 0, drag: 3, cell: 1, rotV: rand(-2, 2),
      });
    }
    for (let i = 0; i < 20 * scale; i++) {
      const a = Math.random() * 6.28;
      const sp = rand(1, 4) * scale;
      this.alpha.spawn({
        x, y: y + 0.5, z, vx: Math.cos(a) * sp, vy: rand(1, 4), vz: Math.sin(a) * sp, life: rand(1.4, 2.8),
        size: rand(0.6, 1.2) * scale, size1: rand(2.5, 4.5) * scale, r: 0.16, g: 0.15, b: 0.15, a: 0.7, a1: 0, drag: 1.4, cell: 1, rotV: rand(-0.6, 0.6),
      });
    }
    this.sparks(x, y + 0.3, z, 0, 1, 0, 24 * scale);
    this.dust(x, y, z, 0, 1, 0, [0.35, 0.3, 0.25], 6, 2 * scale);
  }

  muzzleSmoke(x, y, z, dx, dy, dz) {
    this.alpha.spawn({
      x, y, z, vx: dx * 1.5 + rand(-0.2, 0.2), vy: 0.4 + dy, vz: dz * 1.5 + rand(-0.2, 0.2), life: rand(0.4, 0.8),
      size: 0.06, size1: rand(0.25, 0.45), r: 0.55, g: 0.53, b: 0.5, a: 0.18, a1: 0, drag: 2.5, cell: 1, rotV: rand(-2, 2),
    });
  }

  electric(x, y, z, n = 6, scale = 1) {
    for (let i = 0; i < n; i++) {
      this.add.spawn({
        x: x + rand(-0.3, 0.3) * scale, y: y + rand(-0.4, 0.4) * scale, z: z + rand(-0.3, 0.3) * scale,
        vx: rand(-4, 4), vy: rand(-4, 4), vz: rand(-4, 4), life: rand(0.05, 0.14), size: 0.02, r: 1.5, g: 2.6, b: 6, a: 1, a1: 0, cell: 2, stretch: 0.03,
      });
    }
  }

  dirtBurst(x, y, z) {
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * 6.28;
      this.alpha.spawn({
        x: x + Math.cos(a) * 0.3, y: y + 0.1, z: z + Math.sin(a) * 0.3, vx: Math.cos(a) * rand(0.5, 2), vy: rand(2, 5), vz: Math.sin(a) * rand(0.5, 2),
        life: rand(0.5, 1.1), size: rand(0.04, 0.1), size1: 0.04, r: 0.2, g: 0.15, b: 0.1, a: 1, a1: 0.8, gravity: 12, cell: 3, floor: y,
      });
    }
    for (let i = 0; i < 5; i++) {
      this.alpha.spawn({
        x, y: y + 0.2, z, vx: rand(-0.6, 0.6), vy: rand(0.3, 1), vz: rand(-0.6, 0.6), life: rand(0.9, 1.6),
        size: 0.3, size1: rand(1.0, 1.6), r: 0.28, g: 0.24, b: 0.2, a: 0.5, a1: 0, drag: 1.2, cell: 1, rotV: rand(-0.5, 0.5),
      });
    }
  }
}
