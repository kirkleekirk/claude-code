// The river: a wide sheet of slow brown water with soft shorelines from a
// baked depth texture. How it is shaded lives in watershade.js.
import * as THREE from 'three';
import { T } from './terrain.js';
import { WATER_PARS, waterUniforms, updateWater } from './watershade.js';

const VS = `
#include <fog_pars_vertex>
varying vec3 vW;
varying vec2 vDepthUv;
uniform vec4 uDepthRect;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  vDepthUv = (wp.xz - uDepthRect.xy) / uDepthRect.zw;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const FS = `
#include <common>
#include <fog_pars_fragment>
${WATER_PARS}
uniform sampler2D uDepth;
varying vec3 vW; varying vec2 vDepthUv;
void main() {
  vec3 toEye = cameraPosition - vW;
  float dist = length(toEye), fres;
  float depth = texture2D(uDepth, vDepthUv).r * 8.0;
  // it runs south, slowly
  vec3 col = hfWater(vW, toEye / dist, dist, depth, vec3(0.0, 1.0, 0.4), 1.0, vec3(0.3, 0.25, 0.15), vec3(0.05, 0.065, 0.042), 3.4, fres);
  // the edge laps at the bank
  float nz = texture2D(uWaveTex, vW.xz * 0.11 + vec2(uTime * 0.02, - uTime * 0.013)).b;
  float lap = 0.2 + 0.12 * sin(uTime * 0.9 + vW.z * 0.31 + nz * 6.0);
  float foam = (1.0 - smoothstep(0.0, lap, depth)) * (0.35 + 0.65 * nz);
  col = mix(col, vec3(0.8, 0.78, 0.7) * (uAmb * 2.2 + uSunCol * max(uSunDir.y, 0.0) * 0.3), foam * 0.55);
  gl_FragColor = vec4(col, max(mix(0.42, 0.985, smoothstep(0.0, 1.5, depth)), fres));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export class Water {
  // sky: the Sky (its light and clouds); ground: the world's ground map (the banks to mirror)
  constructor(scene, terrain, sky, ground) {
    // depth texture over the river region
    const rx0 = 150, rx1 = T.x1, rz0 = T.z0, rz1 = T.z1;
    const W = Math.round((rx1 - rx0) / 2), H = Math.round((rz1 - rz0) / 2);
    const data = new Uint8Array(W * H * 4);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const x = rx0 + (i + 0.5) * ((rx1 - rx0) / W), z = rz0 + (j + 0.5) * ((rz1 - rz0) / H);
      const d = Math.max(0, T.water - terrain.height(x, z));
      const v = Math.min(255, Math.round((d / 8) * 255));
      const k = (j * W + i) * 4;
      data[k] = v; data[k + 1] = v; data[k + 2] = v; data[k + 3] = 255;
    }
    const tex = new THREE.DataTexture(data, W, H);
    tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    this.uniforms = waterUniforms(sky, ground);
    this.uniforms.uDepth = { value: tex };
    this.uniforms.uDepthRect = { value: new THREE.Vector4(rx0, rz0, rx1 - rx0, rz1 - rz0) };
    const mat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms: this.uniforms, transparent: true, fog: true, depthWrite: false });
    const geo = new THREE.PlaneGeometry(rx1 - rx0, rz1 - rz0, 1, 1);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.set((rx0 + rx1) / 2, T.water, (rz0 + rz1) / 2);
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
  }
  update(dt, sky) { updateWater(this.uniforms, dt, sky); }
}
