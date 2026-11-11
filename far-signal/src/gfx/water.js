import * as THREE from 'three';
import { COMMON } from './shaderlib.js';
import { commonUniforms } from './globals.js';

const WATER_VERT = /* glsl */`
varying vec3 vWp;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWp = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const WATER_FRAG = /* glsl */`
${COMMON}
uniform sampler2D uHeightTex; uniform sampler2D uSplatTex; uniform sampler2D uReflTex;
uniform mat4 uReflMatrix; uniform float uReflOn;
uniform vec3 uShallow; uniform vec3 uDeep; uniform vec3 uGlow; uniform float uGlowI; uniform float uLava;
varying vec3 vWp;
void main(){
  vec3 wp = vWp;
  vec2 uv = wp.xz * uWorld.y + 0.5;
  float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  float terrH = mix(-40.0, texture2D(uHeightTex, uv).r, inside);
  float depth = max(uWorld.z - terrH, 0.0);
  vec4 sp = texture2D(uSplatTex, uv) * inside;
  vec3 Vv = cameraPosition - wp; float dist = length(Vv); vec3 V = Vv / dist;
  float t = uTime;
  vec2 p = wp.xz;
  vec3 col; float alpha;
  if (uLava > 0.5){
    vec4 a = texture2D(uNoise, p * 0.021 + t * vec2(0.004, 0.002));
    vec4 b = texture2D(uNoise, p * 0.083 - t * vec2(0.006, 0.004) + a.rg * 0.08);
    float crust = smoothstep(0.02, 0.2, b.a) * smoothstep(0.3, 0.62, a.r * 0.6 + b.g * 0.4);
    vec3 hot = mix(vec3(1.0, 0.25, 0.02), vec3(1.0, 0.75, 0.2), smoothstep(0.4, 0.9, b.r)) * (2.2 + 1.2 * sin(t * 0.7 + a.g * 9.0));
    col = mix(hot, vec3(0.03, 0.015, 0.012), crust * 0.92);
    col += vec3(1.0, 0.3, 0.05) * smoothstep(1.2, 0.0, depth) * 1.5;
    alpha = 1.0;
    col = applyFog(col, wp);
    gl_FragColor = vec4(col, alpha);
    return;
  }
  vec4 sw = texture2D(uNoise, p * 0.0031 + t * vec2(0.0016, 0.0011));
  vec4 a = texture2D(uNoise, p * 0.018 + t * vec2(0.006, 0.004));
  vec4 b = texture2D(uNoise, p * 0.057 - t * vec2(0.008, 0.011));
  vec4 c = texture2D(uNoise, p * 0.19 + t * vec2(0.021, -0.015));
  float fa = 1.0 - smoothstep(500.0, 2200.0, dist);
  float fb = 1.0 - smoothstep(180.0, 800.0, dist);
  float fc = 1.0 - smoothstep(40.0, 240.0, dist);
  vec2 slope = (sw.rg - 0.5) * 0.55 + (a.rg - 0.5) * 0.9 * fa + (b.rg - 0.5) * 0.6 * fb + (c.rg - 0.5) * 0.45 * fc;
  float calm = mix(0.3, 1.0, smoothstep(0.4, 7.0, depth));
  vec3 N = normalize(vec3(-slope.x * 0.55 * calm, 1.0, -slope.y * 0.55 * calm));
  float ndv = max(dot(N, V), 0.0);
  float fres = 0.03 + 0.97 * pow(1.0 - ndv, 5.0);
  vec3 R = reflect(-V, N); R.y = abs(R.y) + 0.02; R = normalize(R);
  vec3 refl = skyGradient(R);
  if (uReflOn > 0.5){
    vec4 rc = uReflMatrix * vec4(wp + vec3(N.x, 0.0, N.z) * (3.0 + dist * 0.07), 1.0);
    vec2 ruv = rc.xy / rc.w;
    refl = texture2D(uReflTex, clamp(ruv, 0.002, 0.998)).rgb;
  }
  float sh = keyShadow(wp + vec3(0.0, 0.5, 0.0));
  vec3 light = uSunColor * max(uSunDir.y, 0.0) * sh * 0.55 + hemiAmbient(vec3(0.0, 1.0, 0.0));
  vec3 body = mix(uShallow, uDeep, 1.0 - exp(-depth * 0.2)) * light;
  body += uGlow * uGlowI * sp.r * exp(-depth * 0.1) * (0.55 + 0.45 * b.b);
  col = mix(body, refl, fres);
  vec3 H = normalize(V + uSunDir);
  float spec = pow(max(dot(N, H), 0.0), 420.0);
  col += uSunColor * spec * 7.0 * sh;
  float shoreline = smoothstep(1.0, 0.0, depth);
  float waveBand = sin(depth * 5.5 - t * 1.5 + a.r * 6.0) * 0.5 + 0.5;
  float foam = shoreline * smoothstep(0.45, 0.85, mix(0.5, c.b, fc) * 0.55 + waveBand * 0.55) + smoothstep(0.16, 0.0, depth);
  foam = clamp(foam, 0.0, 1.0) * inside;
  vec3 foamCol = light * 0.85 + uGlow * uGlowI * sp.r * 0.6;
  col = mix(col, foamCol, foam * 0.7);
  alpha = clamp(1.0 - exp(-depth * 0.8) + fres, 0.0, 1.0);
  alpha = max(alpha, foam * 0.8);
  col = applyFog(col, wp);
  gl_FragColor = vec4(col, alpha);
}`;

export class Water {
  constructor(gfx) {
    this.uniforms = commonUniforms({
      uHeightTex: { value: null }, uSplatTex: { value: null },
      uReflTex: gfx.uReflTex, uReflMatrix: gfx.uReflMatrix, uReflOn: gfx.uReflOn,
      uShallow: { value: new THREE.Color() }, uDeep: { value: new THREE.Color() },
      uGlow: { value: new THREE.Color() }, uGlowI: { value: 0 }, uLava: { value: 0 },
    });
    this.material = new THREE.ShaderMaterial({
      vertexShader: WATER_VERT, fragmentShader: WATER_FRAG, uniforms: this.uniforms,
      transparent: true, depthWrite: false,
    });
    const geo = new THREE.PlaneGeometry(1, 1, 1, 1);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.scale.set(24000, 1, 24000);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
  }

  setWorld(terrain, def) {
    const u = this.uniforms;
    u.uHeightTex.value = terrain.heightTex;
    u.uSplatTex.value = terrain.splatTex;
    u.uShallow.value.set(def.water.shallow);
    u.uDeep.value.set(def.water.deep);
    u.uGlow.value.set(def.water.glow);
    u.uGlowI.value = def.water.glowI;
    u.uLava.value = def.lava ? 1 : 0;
    this.mesh.position.y = def.sea;
    this.mesh.visible = !!def.hasWater;
    this.material.transparent = !def.lava;
    this.material.needsUpdate = true;
  }

  follow(camera) {
    this.mesh.position.x = camera.position.x;
    this.mesh.position.z = camera.position.z;
  }
}
