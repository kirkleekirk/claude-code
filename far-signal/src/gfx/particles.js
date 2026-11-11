import * as THREE from 'three';

const VERT = /* glsl */`
attribute vec4 aColor; attribute float aSize;
uniform float uScale;
varying vec4 vColor;
void main(){
  vColor = aColor;
  vec4 mv = viewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(aSize * uScale / max(-mv.z, 0.1), 0.0, 220.0);
}`;
const FRAG = /* glsl */`
varying vec4 vColor;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float d = dot(c, c) * 4.0;
  float a = max(1.0 - d, 0.0);
  a = a * a * vColor.a;
  gl_FragColor = vec4(vColor.rgb * a, a);
}`;

// CPU-simulated additive point sprites: sparks, thruster flame, spores, pickups.
export class Particles {
  constructor(max = 1600) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.base = new Float32Array(max * 5);   // r,g,b,size,grow
    this.phys = new Float32Array(max * 2);   // gravity, drag
    this.next = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.uniforms = { uScale: { value: 600 } };
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms,
      transparent: true, depthWrite: false, blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 20;
    this.geo = g;
  }

  emit(x, y, z, vx, vy, vz, life, size, r, g, b, gravity = 0, drag = 0, grow = 0) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = life; this.maxLife[i] = life;
    const o = i * 5;
    this.base[o] = r; this.base[o + 1] = g; this.base[o + 2] = b; this.base[o + 3] = size; this.base[o + 4] = grow;
    this.phys[i * 2] = gravity; this.phys[i * 2 + 1] = drag;
  }

  burst(p, count, speed, life, size, r, g, b, o = {}) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * 6.283, u = Math.random() * 2 - 1, s = Math.sqrt(1 - u * u);
      const sp = speed * (0.35 + Math.random() * 0.65);
      this.emit(p.x, p.y, p.z, Math.cos(a) * s * sp + (o.vx || 0), u * sp + (o.vy || 0), Math.sin(a) * s * sp + (o.vz || 0),
        life * (0.5 + Math.random() * 0.5), size * (0.6 + Math.random() * 0.8), r, g, b, o.gravity ?? 6, o.drag ?? 1.5, o.grow ?? 0);
    }
  }

  update(dt, viewportH, fovDeg) {
    this.uniforms.uScale.value = viewportH * 0.5 / Math.tan((fovDeg * Math.PI) / 360);
    const { pos, vel, life, maxLife, base, phys, col, size } = this;
    for (let i = 0; i < this.max; i++) {
      if (life[i] <= 0) { if (size[i] !== 0) { size[i] = 0; col[i * 4 + 3] = 0; } continue; }
      life[i] -= dt;
      const k = Math.max(life[i] / maxLife[i], 0);
      const d = Math.max(0, 1 - phys[i * 2 + 1] * dt);
      vel[i * 3] *= d; vel[i * 3 + 1] = vel[i * 3 + 1] * d - phys[i * 2] * dt; vel[i * 3 + 2] *= d;
      pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      const o = i * 5;
      const fadeIn = Math.min(1, (1 - k) * 8);
      col[i * 4] = base[o]; col[i * 4 + 1] = base[o + 1]; col[i * 4 + 2] = base[o + 2]; col[i * 4 + 3] = k * fadeIn;
      size[i] = base[o + 3] * (1 + base[o + 4] * (1 - k));
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
  }

  clear() { this.life.fill(0); }
}
