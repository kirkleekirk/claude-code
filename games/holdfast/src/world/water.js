// The river: a large animated plane with sky reflection (fresnel), sun glint,
// muddy depth colour and soft shorelines from a baked depth texture.
import * as THREE from 'three';
import { T } from './terrain.js';

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
uniform float uTime; uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uHorizon; uniform vec3 uZenith;
uniform vec3 uDeep; uniform vec3 uShallow; uniform sampler2D uDepth; uniform float uRain; uniform float uLight;
varying vec3 vW; varying vec2 vDepthUv;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y); }
float waves(vec2 p) {
  float t = uTime;
  vec2 flow = vec2(0.0, t * 0.35); // river flows south (+z)
  float s = 0.0;
  s += n(p * 0.08 + flow * 0.08) * 0.5;
  s += n(p * 0.23 + vec2(t * 0.05, t * 0.21)) * 0.25;
  s += n(p * 0.71 - vec2(t * 0.13, -t * 0.4)) * 0.15;
  s += n(p * 1.6 + vec2(t * 0.3, t * 0.8)) * 0.04 * (1.0 + uRain * 3.0);
  return s;
}
void main() {
  vec2 p = vW.xz;
  float e = 0.25;
  float hc = waves(p);
  float dist = length(cameraPosition - vW);
  float bump = 1.4 / (1.0 + dist * 0.01);
  vec3 N = normalize(vec3((waves(p - vec2(e, 0.0)) - waves(p + vec2(e, 0.0))) * bump, 1.0, (waves(p - vec2(0.0, e)) - waves(p + vec2(0.0, e))) * bump));
  vec3 V = normalize(cameraPosition - vW);
  float fres = 0.04 + 0.96 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  vec3 R = reflect(-V, N);
  vec3 sky = mix(uHorizon, uZenith, pow(clamp(R.y, 0.0, 1.0), 0.5));
  float depth = texture2D(uDepth, vDepthUv).r * 8.0;
  vec3 body = mix(uShallow, uDeep, smoothstep(0.0, 4.0, depth)) * (0.35 + 0.65 * uLight);
  vec3 col = mix(body, sky * 0.85, clamp(fres * 0.75, 0.0, 1.0));
  vec3 H = normalize(uSunDir + V);
  float spec = pow(max(dot(N, H), 0.0), 220.0) * 4.0 * uLight;
  col += uSunCol * spec;
  // shoreline foam & fade
  float shore = 1.0 - smoothstep(0.0, 0.6, depth);
  col = mix(col, vec3(0.75, 0.72, 0.62) * (0.3 + 0.7 * uLight), shore * 0.25 * (0.5 + 0.5 * n(p * 3.0 + uTime)));
  float alpha = mix(0.55, 0.96, smoothstep(0.0, 1.6, depth));
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export class Water {
  constructor(scene, terrain) {
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
    this.uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(1, 1, 1) },
      uHorizon: { value: new THREE.Color() }, uZenith: { value: new THREE.Color() },
      uDeep: { value: new THREE.Color('#4a4630') }, uShallow: { value: new THREE.Color('#7a6a48') },
      uDepth: { value: tex }, uDepthRect: { value: new THREE.Vector4(rx0, rz0, rx1 - rx0, rz1 - rz0) },
      uRain: { value: 0 }, uLight: { value: 1 },
    }]);
    this.uniforms.uDepth.value = tex;
    const mat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms: this.uniforms, transparent: true, fog: true, depthWrite: false });
    const geo = new THREE.PlaneGeometry(rx1 - rx0, rz1 - rz0, 1, 1);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.set((rx0 + rx1) / 2, T.water, (rz0 + rz1) / 2);
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
  }
  update(dt, sky) {
    const u = this.uniforms;
    u.uTime.value += dt;
    u.uSunDir.value.copy(sky.sunDir);
    u.uSunCol.value.copy(sky.colors.sun).multiplyScalar(sky.sunElev > 0 ? 1 - sky.w.cover * 0.8 : 0);
    u.uHorizon.value.copy(sky.colors.horizon);
    u.uZenith.value.copy(sky.colors.zenith);
    u.uRain.value = sky.w.rain;
    u.uLight.value = Math.max(0.08, Math.min(1, (sky.sunElev + 8) / 20)) * sky.w.light;
  }
}
