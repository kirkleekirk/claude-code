// Turkey Creek: a narrow ribbon of moving water along the bottom of its
// valley, shaded like the river (sky reflection, sun glint, muddy depth)
// and sharing its time, sun and sky. It runs south and only ever runs
// downhill; where a road crosses it goes under through a culvert.
import * as THREE from 'three';
import { T, creekX, CREEK } from './terrain.js';

const VS = `
#include <fog_pars_vertex>
attribute float aDepth;
attribute float aEdge;
varying vec3 vW;
varying float vDepth;
varying float vEdge;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  vDepth = aDepth;
  vEdge = aEdge;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const FS = `
#include <common>
#include <fog_pars_fragment>
uniform float uTime; uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uHorizon; uniform vec3 uZenith; uniform float uRain; uniform float uLight;
varying vec3 vW; varying float vDepth; varying float vEdge;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y); }
float waves(vec2 p) {
  float t = uTime;
  float s = n(p * 0.45 + vec2(0.0, t * 0.55)) * 0.5;
  s += n(p * 1.3 + vec2(t * 0.1, t * 0.9)) * 0.25;
  s += n(p * 3.1 + vec2(-t * 0.2, t * 1.6)) * 0.1 * (1.0 + uRain * 3.0);
  return s;
}
void main() {
  vec2 p = vW.xz;
  float e = 0.15;
  float bump = 1.6 / (1.0 + length(cameraPosition - vW) * 0.02);
  vec3 N = normalize(vec3((waves(p - vec2(e, 0.0)) - waves(p + vec2(e, 0.0))) * bump, 1.0, (waves(p - vec2(0.0, e)) - waves(p + vec2(0.0, e))) * bump));
  vec3 V = normalize(cameraPosition - vW);
  float fres = 0.04 + 0.96 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  vec3 R = reflect(-V, N);
  vec3 sky = mix(uHorizon, uZenith, pow(clamp(R.y, 0.0, 1.0), 0.5));
  // muddy creek water: olive-brown, darker where deeper, a soft sky sheen
  vec3 body = mix(vec3(0.20, 0.19, 0.12), vec3(0.075, 0.085, 0.055), smoothstep(0.0, 0.5, vDepth)) * (0.3 + 0.7 * uLight);
  vec3 col = mix(body, sky * 0.55, clamp(fres * 0.42, 0.0, 0.4));
  vec3 H = normalize(uSunDir + V);
  col += uSunCol * pow(max(dot(N, H), 0.0), 260.0) * 3.0 * uLight;
  // a little froth where it's shallow and quick
  col = mix(col, vec3(0.62, 0.6, 0.52) * (0.3 + 0.7 * uLight), (1.0 - smoothstep(0.0, 0.2, vDepth)) * 0.18 * n(p * 4.0 + vec2(0.0, uTime * 2.0)));
  // a soft, uneven shoreline
  float shore = smoothstep(0.0, 0.5, vEdge + (n(p * 0.6) - 0.5) * 0.35 + (n(p * 2.3) - 0.5) * 0.12);
  // darker, glossier mid-channel where the current runs
  col *= mix(1.0, 0.82, smoothstep(0.4, 1.0, vEdge));
  gl_FragColor = vec4(col, mix(0.7, 0.97, smoothstep(0.0, 0.3, vDepth)) * shore);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

// the ground as it was shaped, before roads and pads were stamped on it
function baseAt(tr, x, z) {
  const fx = (x - T.x0) / T.res, fz = (z - T.z0) / T.res;
  const i = Math.max(0, Math.min(T.nx - 2, Math.floor(fx))), j = Math.max(0, Math.min(T.nz - 2, Math.floor(fz)));
  const u = Math.min(1, Math.max(0, fx - i)), v = Math.min(1, Math.max(0, fz - j)), B = tr.base;
  const a = B[j * T.nx + i], b = B[j * T.nx + i + 1], c = B[(j + 1) * T.nx + i], d = B[(j + 1) * T.nx + i + 1];
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

export class Creek {
  // riverUniforms: the river's live uniforms (time, sun, sky), shared
  constructor(scene, world, riverUniforms) {
    const tr = world.terrain, step = 2, half = CREEK.chanHalf + 0.6;
    const across = [-1, -0.5, 0, 0.5, 1];
    // the water level: a little over the channel bed, smoothed so it runs
    // in long gentle slopes with the valley floor
    // (the natural bed, before any road fill went over it)
    const zs = [], bed = [];
    for (let z = T.z0 + 6; z <= T.z1 - 6; z += step) { zs.push(z); bed.push(baseAt(tr, creekX(z), z)); }
    const lv = bed.map((_, i) => {
      let s = 0, n = 0;
      for (let k = -4; k <= 4; k++) { const b = bed[Math.max(0, Math.min(bed.length - 1, i + k))]; s += b; n++; }
      return Math.max(s / n, bed[i]) + 0.42;
    });
    // under each road, the creek runs through a culvert
    const culverts = (world.culverts || []).map((c) => ({ z: c.z, r: (world.roads.find((r) => r.name === c.road) || { width: 6 }).width / 2 + 2.3 }));
    const dry = (z) => culverts.some((c) => Math.abs(z - c.z) < c.r);
    const pos = [], depth = [], edge = [], idx = [];
    let prevRow = -1;
    for (let i = 0; i < zs.length; i++) {
      const z = zs[i];
      if (dry(z)) { prevRow = -1; continue; }
      const x = creekX(z), dx = (creekX(z + 0.5) - creekX(z - 0.5));
      const L = Math.hypot(dx, 1), nx = 1 / L, nz = -dx / L;
      const row = pos.length / 3;
      for (const a of across) {
        const px = x + nx * a * half, pz = z + nz * a * half;
        pos.push(px, lv[i], pz);
        depth.push(Math.max(0, lv[i] - tr.height(px, pz)));
        edge.push(1 - Math.abs(a));
      }
      if (prevRow >= 0) for (let k = 0; k < across.length - 1; k++) {
        const a = prevRow + k, b = prevRow + k + 1, c = row + k, d = row + k + 1;
        idx.push(a, c, b, b, c, d);
      }
      prevRow = row;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aDepth', new THREE.Float32BufferAttribute(depth, 1));
    geo.setAttribute('aEdge', new THREE.Float32BufferAttribute(edge, 1));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    const u = riverUniforms;
    const uniforms = { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uTime: u.uTime, uSunDir: u.uSunDir, uSunCol: u.uSunCol, uHorizon: u.uHorizon, uZenith: u.uZenith, uRain: u.uRain, uLight: u.uLight };
    const mat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms, transparent: true, fog: true, depthWrite: false });
    // fog colour follows the scene's: share the river's fog uniforms too
    for (const k of Object.keys(THREE.UniformsLib.fog)) if (u[k]) uniforms[k] = u[k];
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.renderOrder = 1;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }
}
