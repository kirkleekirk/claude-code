import * as THREE from 'three';
import { ParticleSystem, SHAPE } from '../../vfx/particles.js';
import { SKY } from './sky.js';

// Fires still burning in the wreckage: billowing flames, embers lifting on the heat, a smoke plume
// drifting downwind; their light on the ruins comes from firelight.js. Only fires near the camera
// spawn particles, so the far ones cost nothing.
const WIND = new THREE.Vector3(0.75, 0, -0.55);
const rnd = (a, b) => a + Math.random() * (b - a);

export class FireField {
  constructor(root, list, ground) {
    this.list = list;
    this.add = new ParticleSystem(root, { max: 2200, additive: true, order: 12 });
    this.smoke = new ParticleSystem(root, { max: 1800, additive: false, order: 11 });
    this.add.ground = this.smoke.ground = ground;
    this.acc = list.map(() => ({ f: Math.random(), e: Math.random(), s: Math.random(), g: Math.random() }));
    this._v = new THREE.Vector3();
  }
  update(dt, cam) {
    const c = cam.position;
    this.list.forEach(([x, y, z, k], i) => {
      const d = Math.hypot(x - c.x, y - c.y, z - c.z);
      if (d > 260) return;
      const a = this.acc[i], near = d < 140 ? 1 : 0.4;
      a.f += dt * 28 * k * near; a.e += dt * 7 * k * near; a.s += dt * 3.2 * k; a.g += dt * 3;
      for (; a.f >= 1; a.f--) {
        const r = Math.sqrt(Math.random()) * 0.75 * k, t = Math.random() * 6.283;
        this.add.spawn({
          p: [x + Math.cos(t) * r, y + rnd(-0.1, 0.3) * k, z + Math.sin(t) * r],
          v: [WIND.x * 0.5 + rnd(-0.4, 0.4), rnd(1.6, 3.4) * Math.sqrt(k), WIND.z * 0.5 + rnd(-0.4, 0.4)],
          life: rnd(0.45, 0.95), size: rnd(0.5, 0.9) * k, size1: rnd(1.0, 1.6) * k * (1 - r / (1.2 * k)),
          color: [1.9, 0.72, 0.18, 0.75], color1: [0.85, 0.16, 0.04, 0], shape: SHAPE.SMOKE, drag: 1.2, grav: -2.2 * k, rotV: rnd(-1.5, 1.5), curve: 0.8,
        });
      }
      for (; a.g >= 1; a.g--) this.add.spawn({ p: [x, y + 0.5 * k, z], life: 0.4, size: 2.6 * k, size1: 2.9 * k, color: [1.3, 0.45, 0.1, 0.22], color1: [1.3, 0.45, 0.1, 0], shape: SHAPE.GLOW });
      for (; a.e >= 1; a.e--) {
        this.add.spawn({
          p: [x + rnd(-0.6, 0.6) * k, y + rnd(0.4, 1.4) * k, z + rnd(-0.6, 0.6) * k],
          v: [WIND.x * rnd(0.6, 1.6) + rnd(-1, 1), rnd(2.5, 5.5), WIND.z * rnd(0.6, 1.6) + rnd(-1, 1)],
          life: rnd(1.4, 3), size: rnd(0.035, 0.07), size1: 0.01, color: [3.2, 1.3, 0.35, 1], color1: [1.6, 0.25, 0.05, 0], shape: SHAPE.SPARK, drag: 0.5, grav: -0.6,
        });
      }
      for (; a.s >= 1; a.s--) {
        const dk = rnd(0.09, 0.15);
        this.smoke.spawn({
          p: [x + rnd(-0.5, 0.5) * k, y + 1.3 * k, z + rnd(-0.5, 0.5) * k],
          v: [WIND.x * rnd(0.8, 1.6), rnd(1.4, 2.4) * Math.sqrt(k), WIND.z * rnd(0.8, 1.6)],
          life: rnd(5, 8), size: rnd(0.9, 1.4) * k, size1: rnd(5, 8) * k,
          color: [dk, dk * 0.93, dk * 0.86, 0.6], color1: [SKY.haze.r * 0.5, SKY.haze.g * 0.5, SKY.haze.b * 0.5, 0], shape: SHAPE.SMOKE, drag: 0.22, grav: -0.12, fadeIn: 0.6, rotV: rnd(-0.3, 0.3), curve: 0.7,
        });
      }
    });
    this.add.update(dt);
    this.smoke.update(dt);
  }
}

// ---------------------------------------------------------------- light shafts
const SHAFT_VERT = /* glsl */`
  varying vec3 vWP;
  void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWP = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }
`;
const SHAFT_FRAG = /* glsl */`
  precision highp float;
  varying vec3 vWP;
  uniform mat4 uInv; uniform vec3 uCol; uniform float uTime, uDensity;
  float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float noise(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z); }
  void main() {
    // the view ray through the beam's box (in its own sheared unit-box space): enter, then this back face
    vec3 ro = (uInv * vec4(cameraPosition, 1.0)).xyz, rp = (uInv * vec4(vWP, 1.0)).xyz, rd = rp - ro;
    vec3 inv = 1.0 / (rd + vec3(1e-6));
    vec3 t0 = (vec3(-0.5) - ro) * inv, t1 = (vec3(0.5) - ro) * inv, tmn = min(t0, t1);
    float tn = clamp(max(max(tmn.x, tmn.y), tmn.z), 0.0, 1.0);
    float len = (1.0 - tn) * distance(cameraPosition, vWP);
    vec3 mid = ro + rd * (tn + 1.0) * 0.5;
    float edge = (1.0 - smoothstep(0.28, 0.5, abs(mid.x))) * (1.0 - smoothstep(0.28, 0.5, abs(mid.z)));
    float down = 0.5 - mid.y;
    float dust = 0.7 + 0.45 * noise(vec3(mid.x * 5.0, mid.y * 9.0 + uTime * 0.15, mid.z * 5.0));
    float a = (1.0 - exp(-len * uDensity)) * edge * (1.0 - down * 0.55) * dust;
    gl_FragColor = vec4(uCol * a, 1.0);
  }
`;
/** beams of sun through holes in the roofs: rects { x0, x1, z0, z1, y } down to the floor */
export function makeShafts(list, sunDir, floor = -0.3) {
  const g = new THREE.Group();
  const box = new THREE.BoxGeometry(1, 1, 1);
  const a = new THREE.Vector3(-sunDir.x / sunDir.y, -1, -sunDir.z / sunDir.y);
  for (const s of list) {
    const W = s.x1 - s.x0, D = s.z1 - s.z0, H = s.y - floor;
    const top = new THREE.Vector3((s.x0 + s.x1) / 2, s.y, (s.z0 + s.z1) / 2);
    const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(W, 0, 0), a.clone().multiplyScalar(-H), new THREE.Vector3(0, 0, D));
    m.setPosition(top.clone().addScaledVector(a, H * 0.5));
    const mat = new THREE.ShaderMaterial({
      vertexShader: SHAFT_VERT, fragmentShader: SHAFT_FRAG, side: THREE.BackSide, transparent: true, depthWrite: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
      uniforms: { uInv: { value: m.clone().invert() }, uCol: { value: new THREE.Color(1.0, 0.82, 0.6).multiplyScalar(0.55) }, uTime: { value: 0 }, uDensity: { value: 0.045 } },
    });
    const mesh = new THREE.Mesh(box, mat);
    mesh.matrixAutoUpdate = false; mesh.matrix.copy(m);
    mesh.renderOrder = 9;
    g.add(mesh);
  }
  return g;
}
