// Turkey Creek: a narrow ribbon of moving water along the bottom of its
// valley, shaded like the river (watershade.js) and sharing its uniforms.
// It runs south and only ever runs downhill; where a road crosses it goes
// under through a culvert.
import * as THREE from 'three';
import { T, creekX, CREEK } from './terrain.js';
import { WATER_PARS } from './watershade.js';

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
${WATER_PARS}
varying vec3 vW; varying float vDepth; varying float vEdge;
void main() {
  vec3 toEye = cameraPosition - vW;
  float dist = length(toEye), fres;
  // quick, shallow and small: finer ripples moving faster, the bed showing through
  vec3 col = hfWater(vW, toEye / dist, dist, vDepth, vec3(0.0, 1.0, 0.95), 3.2, vec3(0.3, 0.25, 0.15), vec3(0.06, 0.065, 0.04), 0.55, fres);
  float nz = texture2D(uWaveTex, vW.xz * 0.35 - vec2(0.0, uTime * 0.25)).b;
  // a little froth where it's shallow and quick
  col = mix(col, vec3(0.75, 0.73, 0.66) * (uAmb * 2.2 + uSunCol * max(uSunDir.y, 0.0) * 0.3), (1.0 - smoothstep(0.0, 0.16, vDepth)) * 0.4 * nz);
  // darker, glossier mid-channel where the current runs
  col *= mix(1.0, 0.86, smoothstep(0.4, 1.0, vEdge));
  // a soft, uneven shoreline
  float shore = smoothstep(0.0, 0.5, vEdge + (nz - 0.5) * 0.4);
  gl_FragColor = vec4(col, max(mix(0.5, 0.94, smoothstep(0.0, 0.3, vDepth)), fres) * shore);
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
  // riverUniforms: the river's live uniforms (time, light, sky), shared
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
    const mat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms: riverUniforms, transparent: true, fog: true, depthWrite: false });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.renderOrder = 1;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }
}
