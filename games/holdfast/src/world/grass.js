// Grass as real blades. Clumps of tapered blades are drawn in rings around
// the camera (fine and dense close by, coarser further out) and placed
// entirely on the GPU: each drawn clump works out which patch of ground it
// stands on, reads there how much grows and how dry it is, finds the terrain
// height, and bends with the wind, with feet and with wheels. Nothing is
// rebuilt as you move; the rings simply wrap around you.
import * as THREE from 'three';
import { mulberry32 } from '../util.js';
import { globalUniforms } from '../gfx/globals.js';
import { carFlat } from './vegetation.js';

// rings per graphics setting: cell size (m), cells across, blades per clump,
// segments per blade, nominal height (m), clump scale
const LAYERS = {
  low: [
    { cell: 0.5, n: 48, blades: 4, seg: 2, h: 0.36, scale: 1.4 },
    { cell: 1.3, n: 44, blades: 4, seg: 1, h: 0.4, scale: 3.1 },
  ],
  medium: [
    { cell: 0.38, n: 68, blades: 5, seg: 2, h: 0.36, scale: 1.2 },
    { cell: 0.95, n: 68, blades: 4, seg: 2, h: 0.4, scale: 2.5 },
  ],
  high: [
    { cell: 0.3, n: 88, blades: 7, seg: 3, h: 0.36, scale: 1.1 },
    { cell: 0.78, n: 84, blades: 5, seg: 2, h: 0.4, scale: 2.2 },
    { cell: 2.2, n: 76, blades: 4, seg: 1, h: 0.44, scale: 4.9 },
  ],
  ultra: [
    { cell: 0.26, n: 112, blades: 7, seg: 3, h: 0.36, scale: 1.0 },
    { cell: 0.66, n: 112, blades: 5, seg: 2, h: 0.4, scale: 1.9 },
    { cell: 1.9, n: 104, blades: 4, seg: 1, h: 0.44, scale: 4.4 },
  ],
};
const PUSH = 8;

// one clump: blades fanned around a centre, leaning outward
function clumpGeometry(blades, seg, seed, flower) {
  const rng = mulberry32(seed);
  const pos = [], aB = [], aF = [], idx = [];
  for (let b = 0; b < blades; b++) {
    const a = (b / blades) * Math.PI * 2 + rng() * 1.2, r = b === 0 ? 0.02 : 0.05 + rng() * 0.13;
    const ox = Math.cos(a) * r, oz = Math.sin(a) * r;
    const f = rng() * Math.PI, w = 0.016 + rng() * 0.012;
    const wx = Math.cos(f) * w, wz = Math.sin(f) * w;
    const la = a + (rng() - 0.5) * 1.0, lean = b === 0 ? 0.06 + rng() * 0.1 : 0.2 + rng() * 0.32;
    const hf = b === 0 ? 1 : 0.6 + rng() * 0.36, ph = rng();
    const base = pos.length / 3;
    for (let l = 0; l < seg; l++) {
      const t = l / seg, k = 1 - Math.pow(t, 1.5) * 0.72;
      pos.push(ox - wx * k, t * hf, oz - wz * k, ox + wx * k, t * hf, oz + wz * k);
      for (let q = 0; q < 2; q++) { aB.push(Math.cos(la), Math.sin(la), lean, ph); aF.push(0); }
    }
    pos.push(ox, hf, oz); aB.push(Math.cos(la), Math.sin(la), lean, ph); aF.push(0);
    for (let l = 0; l < seg - 1; l++) { const p = base + l * 2; idx.push(p, p + 1, p + 2, p + 1, p + 3, p + 2); }
    const p = base + (seg - 1) * 2;
    idx.push(p, p + 1, p + 2);
  }
  if (flower) {
    // a small six-petalled flower above the tallest blade (shown on a few clumps only)
    const base = pos.length / 3, y = 1.05, s = 0.042;
    pos.push(0, y, 0); aB.push(0, 0, 0.08, 0.3); aF.push(2);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      for (const d of [-0.3, 0.3]) { pos.push(Math.cos(a + d) * s, y + 0.014, Math.sin(a + d) * s); aB.push(0, 0, 0.08, 0.3); aF.push(1); }
      idx.push(base, base + 1 + k * 2, base + 2 + k * 2);
    }
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aB', new THREE.Float32BufferAttribute(aB, 4));
  g.setAttribute('aF', new THREE.Float32BufferAttribute(aF, 1));
  g.setIndex(idx);
  return g;
}

const VERT_PARS = /* glsl */`
attribute vec4 aB;
attribute float aF;
uniform vec4 uGrid;   // cells across, cell size, seed, flowers
uniform vec3 uCam;
uniform vec4 uFade;   // fades out between x and y; fades in between z and w (outer rings leave room for the inner ones)
uniform vec4 uShape;  // nominal height, clump scale, time, lawn height
uniform vec3 uWind;   // direction xz, strength
uniform vec3 uSunH;   // the light's direction along the ground (blades catch a low sun on their sides)
uniform sampler2D uGround; uniform vec4 uRect;
uniform sampler2D uHeight; uniform vec4 uHGrid; uniform vec2 uHN;
uniform sampler2D hfNoise;
uniform vec4 uPush[ ${PUSH} ];
uniform vec4 uCarA[ 4 ]; uniform vec4 uCarB[ 4 ];
uniform vec3 uLushA; uniform vec3 uLushB; uniform vec3 uDryA; uniform vec3 uDryB;
varying vec3 vGrass;
varying float vT;
vec2 hfHash2( vec2 p ) { vec3 p3 = fract( vec3( p.xyx ) * vec3( 0.1031, 0.1030, 0.0973 ) ); p3 += dot( p3, p3.yzx + 33.33 ); return fract( ( p3.xx + p3.yz ) * p3.zy ); }
float hfTh( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float hfTn( vec2 p ) { vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
	return mix( mix( hfTh( i ), hfTh( i + vec2( 1.0, 0.0 ) ), f.x ), mix( hfTh( i + vec2( 0.0, 1.0 ) ), hfTh( i + vec2( 1.0, 1.0 ) ), f.x ), f.y ); }
float hfGround( vec2 p ) { return texture2D( uHeight, ( ( p - uHGrid.xy ) / uHGrid.z + 0.5 ) / uHN ).r; }
`;
const VERT_MAIN = /* glsl */`
// which patch of ground this clump stands on: a grid that wraps around the camera
float hfI = float( gl_InstanceID );
vec2 hfSlot = vec2( mod( hfI, uGrid.x ), floor( hfI / uGrid.x ) );
vec2 hfCamCell = floor( uCam.xz / uGrid.y );
vec2 hfCell = hfCamCell + mod( hfSlot - hfCamCell + uGrid.x * 0.5, uGrid.x ) - uGrid.x * 0.5;
vec2 hfH = hfHash2( hfCell + uGrid.z );
vec2 hfRoot = ( hfCell + 0.1 + 0.8 * hfH ) * uGrid.y;
vec4 hfG = texture2D( uGround, ( hfRoot - uRect.xy ) / uRect.zw );
float hfDist = distance( hfRoot, uCam.xz );
float hfFade = ( 1.0 - smoothstep( uFade.x, uFade.y, hfDist ) ) * smoothstep( uFade.z, uFade.w, hfDist );
// sparse ground loses clumps rather than shrinking them all
float hfShow = step( hfH.x * 0.9, hfG.r - 0.06 ) * step( 0.01, hfFade );
float hfDry = hfG.g;
float hfTall = mix( uShape.x * mix( 0.7, 1.3, hfH.y ) * mix( 1.0, 1.6, hfDry ) * mix( 0.6, 1.0, hfG.r ), uShape.w * mix( 0.8, 1.15, hfH.y ), hfG.a ) * mix( 0.3, 1.0, hfFade );
float hfGy = hfGround( hfRoot );
vec3 hfN = normalize( vec3( hfGy - hfGround( hfRoot + vec2( 2.0, 0.0 ) ), 2.0, hfGy - hfGround( hfRoot + vec2( 0.0, 2.0 ) ) ) );
float hfA = hfH.y * 6.2831853 + hfH.x * 40.0, hfC = cos( hfA ), hfS = sin( hfA );
float hfT = position.y;
vec2 hfOff = vec2( hfC * position.x - hfS * position.z, hfS * position.x + hfC * position.z ) * uShape.y * mix( 1.0, 0.7, hfG.a );
vec2 hfLean = vec2( hfC * aB.x - hfS * aB.y, hfS * aB.x + hfC * aB.y ) * aB.z;
// wind: slow gusts rolling across the field, and each blade's own shiver
float hfGust = texture2D( hfNoise, hfRoot * 0.013 - uWind.xy * uShape.z * 0.02 ).r;
float hfSway = sin( uShape.z * ( 1.4 + hfH.x * 0.8 ) + hfRoot.x * 0.4 + hfRoot.y * 0.27 + aB.w * 6.2831853 );
vec2 hfBend = hfLean + uWind.xy * ( ( 0.05 + hfGust * hfGust * 0.55 ) * uWind.z ) + vec2( hfSway, hfSway * 0.7 ) * 0.03 * ( 0.4 + uWind.z );
// feet part it; wheels flatten it
float hfPress = 0.0;
for ( int i = 0; i < ${PUSH}; i ++ ) {
	vec2 dp = hfRoot - uPush[ i ].xy;
	float dl = length( dp ), k = ( 1.0 - smoothstep( uPush[ i ].z * 0.3, uPush[ i ].z, dl ) ) * uPush[ i ].w;
	hfBend += dp / max( dl, 0.05 ) * k * 0.6;
	hfPress = max( hfPress, k * 0.55 );
}
for ( int i = 0; i < 4; i ++ ) {
	vec2 dc = hfRoot - uCarA[ i ].xy;
	vec2 q = abs( vec2( dc.x * uCarA[ i ].z - dc.y * uCarA[ i ].w, dc.x * uCarA[ i ].w + dc.y * uCarA[ i ].z ) ) - uCarB[ i ].yx;
	float k = 1.0 - smoothstep( - 0.2, 0.5, max( q.x, q.y ) );
	hfBend += normalize( dc + 1e-4 ) * k * 0.5;
	hfPress = max( hfPress, k * 0.92 );
}
float hfT2 = hfT * hfT;
vec3 hfPos = vec3( hfRoot.x + hfOff.x + hfBend.x * hfT2 * hfTall, hfGy - 0.04 + hfT * hfTall * ( 1.0 - hfPress ), hfRoot.y + hfOff.y + hfBend.y * hfT2 * hfTall );
// colour: green to straw by how dry the ground is, with the same broad light
// and dark patches as the ground itself; darker toward the root, paler at the tip
float hfPatch = texture2D( hfNoise, hfRoot * 0.0041 ).a;
float hfMacro = 0.82 + 0.36 * hfTn( hfRoot * 0.02 ) + 0.12 * ( hfTn( hfRoot * 0.11 ) - 0.5 );
vec3 hfCol = mix( mix( uLushA, uLushB, hfH.x ), mix( uDryA, uDryB, hfH.y ), clamp( hfDry + ( hfPatch - 0.5 ) * 0.3 * hfDry * ( 1.0 - hfDry ) * 4.0, 0.0, 1.0 ) ) * hfMacro;
vGrass = hfCol * mix( 0.5, 1.14, smoothstep( 0.0, 0.9, hfT ) );
vT = hfT;
if ( aF > 0.5 ) {
	// flowers on a few clumps where the ground map says they grow
	float fl = step( 0.84, hfH.y ) * step( 0.25, hfG.b ) * ( 1.0 - hfG.a ) * ( 1.0 - hfDry ) * uGrid.w;
	hfShow *= fl;
	float pick = fract( hfH.x * 7.3 );
	vGrass = aF > 1.5 ? ( pick < 0.4 ? vec3( 0.9, 0.66, 0.1 ) : pick < 0.75 ? vec3( 0.36, 0.2, 0.05 ) : vec3( 0.9, 0.8, 0.3 ) ) : ( pick < 0.4 ? vec3( 0.92, 0.9, 0.8 ) : pick < 0.75 ? vec3( 0.88, 0.64, 0.08 ) : vec3( 0.46, 0.34, 0.74 ) );
	vT = 1.0;
}
if ( hfShow < 0.5 ) hfPos = vec3( hfRoot.x, - 500.0, hfRoot.y );
vec3 objectNormal = normalize( hfN + vec3( hfBend.x, 0.0, hfBend.y ) * 0.35 * hfT + uSunH * 0.38 );
`;

export class Grass {
  // ground: a GroundMap (what grows where, and the terrain heights)
  constructor(scene, quality, ground) {
    this.scene = scene;
    this.ground = ground;
    this.meshes = [];
    this.push = Array.from({ length: PUSH }, () => new THREE.Vector4(1e6, 1e6, 1, 0));
    this.time = 0;
    this.wind = new THREE.Vector3(0.8, 0.6, 0.3);
    this.sunH = new THREE.Vector3(0, 0, 0);
    this.configure(quality);
  }
  configure(quality) {
    for (const m of this.meshes) { this.scene.remove(m); m.geometry.dispose(); m.material.dispose(); }
    this.meshes = [];
    const layers = LAYERS[quality.level] || LAYERS.high, G = this.ground, U = globalUniforms();
    const last = layers[layers.length - 1];
    this.reach = (last.cell * last.n) / 2; // how far out blades are drawn
    layers.forEach((L, i) => {
      const R = (L.cell * L.n) / 2, prev = i ? (layers[i - 1].cell * layers[i - 1].n) / 2 : 0;
      const geo = clumpGeometry(L.blades, L.seg, 17 + i * 31, i === 0);
      geo.instanceCount = L.n * L.n;
      const mat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
      const uniforms = {
        uGrid: { value: new THREE.Vector4(L.n, L.cell, i * 57.3, 1) }, uCam: { value: new THREE.Vector3() },
        uFade: { value: new THREE.Vector4(R * 0.72, R * 0.98, prev * 0.55, prev * 0.9) },
        uShape: { value: new THREE.Vector4(L.h, L.scale, 0, 0.085) }, uWind: { value: this.wind }, uSunH: { value: this.sunH },
        uGround: { value: G.tex }, uRect: { value: G.rect }, uHeight: { value: G.heightTex }, uHGrid: { value: G.grid }, uHN: { value: G.gridN },
        hfNoise: U.hfNoise, uPush: { value: this.push }, uCarA: carFlat.uCarA, uCarB: carFlat.uCarB,
        uLushA: { value: new THREE.Color(0.078, 0.162, 0.027) }, uLushB: { value: new THREE.Color(0.118, 0.212, 0.036) },
        uDryA: { value: new THREE.Color(0.42, 0.33, 0.125) }, uDryB: { value: new THREE.Color(0.34, 0.3, 0.105) },
      };
      mat.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, uniforms);
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\n' + VERT_PARS)
          .replace('#include <beginnormal_vertex>', VERT_MAIN)
          .replace('#include <begin_vertex>', 'vec3 transformed = hfPos;');
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vGrass;\nvarying float vT;')
          .replace('#include <color_fragment>', 'diffuseColor.rgb *= vGrass;')
          // blades are lit like the ground they stand on, whichever side faces you
          .replace('#include <normal_fragment_begin>', 'vec3 normal = normalize( vNormal );\nvec3 nonPerturbedNormal = normal;')
          // with the sun behind them the tips glow
          .replace('#include <lights_fragment_begin>', `#include <lights_fragment_begin>
#if NUM_DIR_LIGHTS > 0
	reflectedLight.directDiffuse += directLight.color * diffuseColor.rgb * ( pow( max( dot( geometryViewDir, - directionalLights[ 0 ].direction ), 0.0 ), 3.0 ) * 0.5 + 0.02 ) * smoothstep( 0.15, 1.0, vT );
#endif`);
      };
      mat.customProgramCacheKey = () => 'holdfast-grass';
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      mesh.name = 'grass' + i;
      mesh.userData.u = uniforms;
      this.scene.add(mesh);
      this.meshes.push(mesh);
    });
  }
  // people (and the dead) walking through: up to eight [x, z, radius, strength]
  setPushers(list) {
    for (let i = 0; i < PUSH; i++) {
      const p = list[i];
      if (p) this.push[i].set(p[0], p[1], p[2] || 0.7, p[3] ?? 1); else this.push[i].set(1e6, 1e6, 1, 0);
    }
  }
  update(camPos, dt = 0, wind = 0.3, lightDir = null) {
    this.time += dt;
    if (lightDir) this.sunH.set(lightDir.x, 0, lightDir.z);
    this.wind.z += (wind - this.wind.z) * Math.min(1, dt * 0.5 + (dt === 0 ? 1 : 0));
    for (const m of this.meshes) {
      const u = m.userData.u;
      u.uCam.value.copy(camPos);
      u.uShape.value.z = this.time;
    }
  }
}
