// Small things in the air: flames, embers, smoke, dust, sparks, blood,
// falling leaves, fireflies. A fixed pool is moved on the CPU (a couple of
// thousand at most) and drawn as two batches of camera-facing sprites: one
// that adds its light to the scene (fire, sparks) and one that covers what
// is behind it (smoke, dust, leaves).
import * as THREE from 'three';
import { globalUniforms, skyAndEffects } from './globals.js';

const SHAPE = { puff: 0, flame: 1, spark: 2, leaf: 3, drop: 4 };
// life and size are [from, to] (seconds; metres across at birth and at death)
const KIND = {
  flame: { add: 1, shape: SHAPE.flame, life: [0.32, 0.62], size: [0.36, 0.1], vel: [0, 1.45, 0], spread: 0.11, kick: 0.22, color: [1.0, 0.36, 0.07], bright: 3.4, grav: -1.2, drag: 0.6, wind: 0.25 },
  ember: { add: 1, shape: SHAPE.spark, life: [0.9, 2.2], size: [0.034, 0.014], vel: [0, 1.7, 0], spread: 0.14, kick: 0.6, color: [1.0, 0.42, 0.1], bright: 7, grav: -0.5, drag: 0.5, wind: 1 },
  smoke: { shape: SHAPE.puff, life: [2.6, 4.6], size: [0.28, 1.7], vel: [0, 0.95, 0], spread: 0.1, kick: 0.14, color: [0.3, 0.29, 0.28], alpha: 0.26, grav: -0.2, drag: 0.35, wind: 1.1 },
  dust: { shape: SHAPE.puff, life: [0.7, 1.5], size: [0.3, 1.25], vel: [0, 0.35, 0], spread: 0.25, kick: 0.5, color: [0.5, 0.43, 0.33], alpha: 0.3, grav: 0, drag: 1.7, wind: 0.6 },
  exhaust: { shape: SHAPE.puff, life: [0.5, 0.9], size: [0.1, 0.5], vel: [0, 0.25, 0], spread: 0.03, kick: 0.15, color: [0.34, 0.34, 0.36], alpha: 0.2, grav: -0.3, drag: 1.2, wind: 0.6 },
  blood: { shape: SHAPE.drop, life: [0.3, 0.65], size: [0.055, 0.03], vel: [0, 1.2, 0], spread: 0.06, kick: 2.1, color: [0.3, 0.015, 0.015], alpha: 0.95, grav: 9, drag: 0.4, wind: 0 },
  muzzle: { add: 1, shape: SHAPE.spark, life: [0.045, 0.07], size: [0.34, 0.5], vel: [0, 0, 0], spread: 0.02, kick: 0, color: [1.0, 0.72, 0.36], bright: 11, grav: 0, drag: 0, wind: 0 },
  gunsmoke: { shape: SHAPE.puff, life: [0.5, 1.1], size: [0.09, 0.5], vel: [0, 0.3, 0], spread: 0.03, kick: 0.25, color: [0.6, 0.6, 0.6], alpha: 0.2, grav: -0.2, drag: 1.5, wind: 0.8 },
  spark: { add: 1, shape: SHAPE.spark, life: [0.14, 0.36], size: [0.03, 0.01], vel: [0, 1, 0], spread: 0.02, kick: 3.2, color: [1.0, 0.7, 0.35], bright: 9, grav: 7, drag: 0.4, wind: 0 },
  chip: { shape: SHAPE.puff, life: [0.3, 0.6], size: [0.12, 0.42], vel: [0, 0.5, 0], spread: 0.04, kick: 0.6, color: [0.55, 0.5, 0.44], alpha: 0.32, grav: 0.5, drag: 2, wind: 0.4 },
  leaf: { shape: SHAPE.leaf, life: [5, 8.5], size: [0.13, 0.13], vel: [0, -0.5, 0], spread: 1.2, kick: 0.25, color: [0.7, 0.4, 0.1], alpha: 1, grav: 0.25, drag: 0.55, wind: 1.6, spin: 2.6, lit: 1 },
  firefly: { add: 1, shape: SHAPE.spark, life: [3.5, 7], size: [0.06, 0.06], vel: [0, 0, 0], spread: 0.3, kick: 0.2, color: [0.62, 1.0, 0.22], bright: 3.2, grav: 0, drag: 0.8, wind: 0.1, wander: 0.9, pulse: 1 },
};

const VERT = /* glsl */`
attribute vec4 iPos;  // where, and how big
attribute vec4 iCol;  // colour (scene light), opacity
attribute vec4 iMisc; // shape, turn, age 0..1, a random number
varying vec2 vUv; varying vec4 vCol; varying vec4 vMisc;
#include <fog_pars_vertex>
void main() {
	vec4 mvPosition = viewMatrix * vec4( iPos.xyz, 1.0 );
	float c = cos( iMisc.y ), s = sin( iMisc.y );
	vec2 q = position.xy * iPos.w;
	// a leaf turns over as it falls
	if ( iMisc.x > 2.5 && iMisc.x < 3.5 ) q.x *= cos( iMisc.y * 1.7 + iMisc.w * 6.0 );
	mvPosition.xy += vec2( q.x * c - q.y * s, q.x * s + q.y * c );
	gl_Position = projectionMatrix * mvPosition;
	vUv = position.xy * 2.0; vCol = iCol; vMisc = iMisc;
	#include <fog_vertex>
}`;
const FRAG = /* glsl */`
uniform sampler2D hfNoise;
uniform vec3 uLight; // what falls on smoke and dust (the lit batch only)
varying vec2 vUv; varying vec4 vCol; varying vec4 vMisc;
#include <common>
#include <fog_pars_fragment>
void main() {
	float r = length( vUv ), shape = vMisc.x, a;
	vec3 col = vCol.rgb;
	if ( shape < 0.5 ) {
		// a puff: soft, and ragged like a cloud
		float n = texture2D( hfNoise, vUv * 0.21 + vMisc.w * 7.0 ).r;
		a = smoothstep( 1.0, 0.25, r + ( n - 0.5 ) * 0.7 );
		col *= 0.8 + 0.4 * n;
	} else if ( shape < 1.5 ) {
		// a tongue of flame: wide at the foot, drawn to a point, hottest in the middle
		vec2 p = vec2( vUv.x * ( 1.25 + vUv.y * 0.55 ), vUv.y );
		float n = texture2D( hfNoise, vUv * 0.16 + vec2( vMisc.w * 5.0, - vMisc.z * 0.5 ) ).g;
		float d = length( p ) + ( n - 0.5 ) * 0.5;
		a = smoothstep( 1.0, 0.3, d );
		col = mix( vec3( vCol.r * 1.25, vCol.r * 1.05, vCol.r * 0.5 ), col, smoothstep( 0.0, 0.62, d ) );
	} else if ( shape < 2.5 ) {
		// a spark: a hard bright point with a little glow round it
		a = smoothstep( 1.0, 0.0, r ); a = a * a * ( 0.4 + 2.0 * smoothstep( 0.45, 0.0, r ) );
	} else if ( shape < 3.5 ) {
		// a leaf
		float d = abs( vUv.y ) * 1.9 + vUv.x * vUv.x * 1.05;
		if ( d > 1.0 ) discard;
		a = 1.0;
		col *= 0.72 + 0.28 * ( 1.0 - d );
	} else {
		// a drop
		a = smoothstep( 1.0, 0.55, r );
	}
	#ifdef HF_LIT
		col *= uLight;
	#endif
	gl_FragColor = vec4( col, a * vCol.a );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
}`;

class Batch {
  constructor(scene, max, add, uniforms) {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.pos = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
    this.col = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
    this.misc = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
    for (const a of [this.pos, this.col, this.misc]) a.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iPos', this.pos); g.setAttribute('iCol', this.col); g.setAttribute('iMisc', this.misc);
    g.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, uniforms, transparent: true, depthWrite: false, fog: !add,
      blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, defines: add ? {} : { HF_LIT: 1 },
    });
    this.mesh = skyAndEffects(new THREE.Mesh(g, mat));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = add ? 6 : 5;
    this.mesh.name = add ? 'particlesAdd' : 'particles';
    this.geo = g;
    this.n = 0;
    scene.add(this.mesh);
  }
  put(x, y, z, size, r, g, b, a, shape, turn, age, seed) {
    const k = this.n++ * 4, P = this.pos.array, C = this.col.array, M = this.misc.array;
    P[k] = x; P[k + 1] = y; P[k + 2] = z; P[k + 3] = size;
    C[k] = r; C[k + 1] = g; C[k + 2] = b; C[k + 3] = a;
    M[k] = shape; M[k + 1] = turn; M[k + 2] = age; M[k + 3] = seed;
  }
  flush() {
    this.geo.instanceCount = this.n;
    this.mesh.visible = this.n > 0;
    if (this.n) {
      for (const a of [this.pos, this.col, this.misc]) { a.clearUpdateRanges(); a.addUpdateRange(0, this.n * 4); a.needsUpdate = true; }
    }
    this.n = 0;
  }
}

export class Particles {
  constructor(scene, quality) {
    const max = this.max = Math.round(2200 * (quality.particles || 1));
    this.rate = quality.particles || 1; // how much of what is asked for gets made
    this.kind = new Array(max).fill(null);
    this.x = new Float32Array(max * 3); this.v = new Float32Array(max * 3);
    this.life = new Float32Array(max); this.span = new Float32Array(max);
    this.s0 = new Float32Array(max); this.s1 = new Float32Array(max);
    this.c = new Float32Array(max * 4); this.turn = new Float32Array(max); this.seed = new Float32Array(max);
    this.next = 0; this.alive = 0;
    const F = THREE.UniformsUtils.clone(THREE.UniformsLib.fog), G = globalUniforms();
    this.light = new THREE.Color(1, 1, 1);
    const uniforms = { ...F, hfSunDir: G.hfSunDir, hfFogCol: G.hfFogCol, hfSunGlow: G.hfSunGlow, hfFogA: G.hfFogA, hfFogB: G.hfFogB, hfNoise: G.hfNoise, uLight: { value: this.light } };
    this.add = new Batch(scene, max, true, uniforms);
    this.lit = new Batch(scene, max, false, uniforms);
    this.wind = new THREE.Vector3();
    this.frac = 0;
  }
  // one particle of a kind at a place. o: { vel: [x,y,z] added, color: [r,g,b], size: scale, life: scale, spread: scale }
  emit(name, x, y, z, o) {
    const K = KIND[name];
    if (!K) return -1;
    // find a free slot (or take over the oldest we meet)
    let i = -1;
    for (let t = 0; t < 24; t++) { const j = (this.next + t) % this.max; if (this.life[j] <= 0) { i = j; break; } }
    if (i < 0) i = this.next;
    this.next = (i + 1) % this.max;
    const R = Math.random, sp = K.spread * ((o && o.spread) || 1), kick = K.kick;
    this.kind[i] = K;
    this.x[i * 3] = x + (R() - 0.5) * 2 * sp; this.x[i * 3 + 1] = y + (R() - 0.5) * sp; this.x[i * 3 + 2] = z + (R() - 0.5) * 2 * sp;
    const ov = o && o.vel;
    this.v[i * 3] = K.vel[0] + (R() - 0.5) * 2 * kick + (ov ? ov[0] : 0);
    this.v[i * 3 + 1] = K.vel[1] * (0.8 + R() * 0.4) + (R() - 0.5) * kick + (ov ? ov[1] : 0);
    this.v[i * 3 + 2] = K.vel[2] + (R() - 0.5) * 2 * kick + (ov ? ov[2] : 0);
    this.span[i] = this.life[i] = (K.life[0] + R() * (K.life[1] - K.life[0])) * ((o && o.life) || 1);
    const sz = ((o && o.size) || 1) * (0.8 + R() * 0.4);
    this.s0[i] = K.size[0] * sz; this.s1[i] = K.size[1] * sz;
    const col = (o && o.color) || K.color, b = (K.bright || 1) * (0.85 + R() * 0.3);
    this.c[i * 4] = col[0] * b; this.c[i * 4 + 1] = col[1] * b; this.c[i * 4 + 2] = col[2] * b; this.c[i * 4 + 3] = K.alpha === undefined ? 1 : K.alpha;
    this.turn[i] = R() * 6.283; this.seed[i] = R();
    return i;
  }
  // several at once, or a steady rate (per second) scaled by the graphics setting
  burst(name, n, x, y, z, o) { n = Math.max(1, Math.round(n * (0.5 + 0.5 * this.rate))); for (let i = 0; i < n; i++) this.emit(name, x, y, z, o); }
  flow(name, perSecond, dt, x, y, z, o) {
    let n = perSecond * dt * this.rate;
    n = Math.floor(n) + (Math.random() < n - Math.floor(n) ? 1 : 0);
    for (let i = 0; i < n; i++) this.emit(name, x, y, z, o);
  }
  // wind: metres a second along the ground; light: what falls on smoke and leaves
  update(dt, wind, light) {
    if (wind) this.wind.copy(wind);
    if (light) this.light.copy(light);
    const W = this.wind, X = this.x, V = this.v;
    let alive = 0;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      const K = this.kind[i];
      this.life[i] -= dt;
      if (this.life[i] <= 0) continue;
      alive++;
      const k = i * 3, drag = Math.min(1, K.drag * dt);
      V[k] += (W.x * K.wind - V[k]) * drag; V[k + 2] += (W.z * K.wind - V[k + 2]) * drag;
      V[k + 1] += (-K.grav - V[k + 1] * K.drag * 0.5) * dt;
      if (K.wander) { V[k] += (Math.random() - 0.5) * K.wander * dt * 6; V[k + 1] += (Math.random() - 0.5) * K.wander * dt * 3; V[k + 2] += (Math.random() - 0.5) * K.wander * dt * 6; }
      X[k] += V[k] * dt; X[k + 1] += V[k + 1] * dt; X[k + 2] += V[k + 2] * dt;
      const age = 1 - this.life[i] / this.span[i];
      if (K.spin) this.turn[i] += K.spin * dt * (this.seed[i] > 0.5 ? 1 : -1);
      // in quickly, out slowly
      let a = Math.min(1, age * 9) * Math.min(1, (1 - age) * 2.4);
      if (K.pulse) a *= 0.25 + 0.75 * Math.max(0, Math.sin(age * this.span[i] * 2.4 + this.seed[i] * 20));
      const size = this.s0[i] + (this.s1[i] - this.s0[i]) * age, c = this.c, q = i * 4;
      const B = K.add ? this.add : this.lit;
      if (K.add) B.put(X[k], X[k + 1], X[k + 2], size, c[q] * a, c[q + 1] * a, c[q + 2] * a, 1, K.shape, this.turn[i], age, this.seed[i]);
      else B.put(X[k], X[k + 1], X[k + 2], size, c[q], c[q + 1], c[q + 2], c[q + 3] * a, K.shape, this.turn[i], age, this.seed[i]);
    }
    this.alive = alive;
    this.add.flush(); this.lit.flush();
  }
}
