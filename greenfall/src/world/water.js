// Stylized water: one ocean plane that follows the camera, plus the lake and farm ponds.
import * as THREE from 'three';
import { GW, GH, WORLD } from './layout.js';
import { NOISE_GLSL } from './sky.js';

export class Water {
  constructor(world) {
    this.world = world;
    this.group = new THREE.Group();
    this.group.name = 'water';
    // depth texture (meters below the local water level, 0..25)
    const data = new Uint8Array(GW * GH);
    for (let gz = 0; gz < GH; gz++) for (let gx = 0; gx < GW; gx++) {
      const i = gz * GW + gx;
      const x = gx * WORLD.CELL, z = gz * WORLD.CELL;
      const lvl = world.waterLevelAt(x, z);
      const d = lvl - world.height[i];
      data[i] = Math.max(0, Math.min(255, (d / 25) * 255));
    }
    const tex = new THREE.DataTexture(data, GW, GH, THREE.RedFormat, THREE.UnsignedByteType);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    this.depthTex = tex;
    this.uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uDepth: { value: tex }, uWorldSize: { value: new THREE.Vector2(WORLD.W, WORLD.H) }, uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color(1, 1, 1) },
      uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
      uShallow: { value: new THREE.Color(0x3cc4b4) }, uDeep: { value: new THREE.Color(0x0d4f86) },
      uWaveAmp: { value: 0.32 }, uFlash: { value: 0 }, uNight: { value: 0 }, uSunVis: { value: 1 },
    }]);
    this.uniforms.uDepth.value = tex;
    this.material = this.makeMaterial(this.uniforms);
    // ocean
    const og = new THREE.PlaneGeometry(14000, 14000, 200, 200);
    og.rotateX(-Math.PI / 2);
    this.ocean = new THREE.Mesh(og, this.material);
    this.ocean.frustumCulled = false;
    this.ocean.renderOrder = 1;
    this.group.add(this.ocean);
    // lake + ponds (small waves)
    const lakeU = { ...this.uniforms, uWaveAmp: { value: 0.04 } };
    this.lakeMaterial = this.makeMaterial(lakeU);
    const lk = world.lake;
    const lg = new THREE.CircleGeometry(1, 64);
    lg.rotateX(-Math.PI / 2);
    const lake = new THREE.Mesh(lg, this.lakeMaterial);
    lake.scale.set(lk.rx * 1.55, 1, lk.rz * 1.55);
    lake.position.set(lk.x, lk.level, lk.z);
    lake.renderOrder = 1;
    this.group.add(lake);
    for (const p of world.ponds) {
      const m = new THREE.Mesh(lg, this.lakeMaterial);
      m.scale.set(p.r * 1.42, 1, p.r * 1.42);
      m.position.set(p.x, p.level, p.z);
      m.renderOrder = 1;
      this.group.add(m);
    }
  }
  makeMaterial(uniforms) {
    return new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      fog: true,
      vertexShader: /* glsl */`
        uniform sampler2D uDepth; uniform vec2 uWorldSize; uniform float uTime; uniform float uWaveAmp;
        varying vec3 vW; varying float vDepth; varying vec3 vN;
        #include <fog_pars_vertex>
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          vec2 duv = w.xz / uWorldSize;
          float depth = texture2D(uDepth, duv).r * 25.0;
          if (duv.x < 0.0 || duv.x > 1.0 || duv.y < 0.0 || duv.y > 1.0) depth = 30.0;
          float amp = uWaveAmp * (0.35 + 0.65 * smoothstep(0.0, 6.0, depth));
          float t = uTime;
          float w1 = sin(w.x * 0.045 + t * 0.9) * cos(w.z * 0.038 - t * 0.7);
          float w2 = sin((w.x + w.z) * 0.11 + t * 1.6) * 0.45;
          float w3 = sin((w.x * 0.7 - w.z) * 0.21 + t * 2.3) * 0.2;
          w.y += (w1 + w2 + w3) * amp;
          float dx = (0.045 * cos(w.x * 0.045 + t * 0.9) * cos(w.z * 0.038 - t * 0.7) + 0.11 * 0.45 * cos((w.x + w.z) * 0.11 + t * 1.6)) * amp;
          float dz = (-0.038 * sin(w.x * 0.045 + t * 0.9) * sin(w.z * 0.038 - t * 0.7) + 0.11 * 0.45 * cos((w.x + w.z) * 0.11 + t * 1.6)) * amp;
          vN = normalize(vec3(-dx * 6.0, 1.0, -dz * 6.0));
          vW = w.xyz;
          vDepth = depth;
          vec4 mvPosition = viewMatrix * w;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uSunDir, uSunColor, uZenith, uHorizon, uShallow, uDeep;
        uniform float uTime, uFlash, uNight, uSunVis;
        uniform sampler2D uDepth; uniform vec2 uWorldSize;
        varying vec3 vW; varying float vDepth; varying vec3 vN;
        #include <fog_pars_fragment>
        ${NOISE_GLSL}
        void main() {
          vec2 duv = vW.xz / uWorldSize;
          float depth = texture2D(uDepth, duv).r * 25.0;
          if (duv.x < 0.0 || duv.x > 1.0 || duv.y < 0.0 || duv.y > 1.0) depth = 30.0;
          vec2 p = vW.xz * 0.18;
          float n1 = vnoise(p + uTime * vec2(0.35, 0.2));
          float n2 = vnoise(p * 2.3 - uTime * vec2(0.25, 0.4));
          vec3 n = normalize(vN + vec3(n1 - 0.5, 0.0, n2 - 0.5) * 0.35);
          vec3 V = normalize(cameraPosition - vW);
          float fres = pow(1.0 - max(dot(n, V), 0.0), 4.0);
          vec3 water = mix(uShallow, uDeep, smoothstep(0.0, 10.0, depth));
          water = mix(water, water * vec3(0.35, 0.6, 0.45), uNight);
          vec3 R = reflect(-V, n);
          vec3 refl = mix(uHorizon, uZenith, clamp(R.y * 1.8, 0.0, 1.0));
          vec3 col = mix(water, refl, 0.12 + fres * 0.6);
          vec3 H = normalize(uSunDir + V);
          col += uSunColor * pow(max(dot(n, H), 0.0), 260.0) * 2.5 * (0.3 + 0.7 * uSunVis);
          col += uSunColor * pow(max(dot(n, H), 0.0), 18.0) * 0.06 * uSunVis;
          float fn = vnoise(vW.xz * 0.45 + uTime * 0.35);
          float foam = smoothstep(1.1, 0.0, depth) * smoothstep(0.3, 0.75, fn + 0.45 - depth * 0.35);
          float band = sin(depth * 2.6 - uTime * 1.4 + fn * 2.0) * 0.5 + 0.5;
          foam += smoothstep(0.86, 1.0, band) * smoothstep(2.8, 0.25, depth) * 0.7;
          foam = clamp(foam, 0.0, 1.0);
          col = mix(col, vec3(0.92, 0.97, 0.95) * (1.0 - uNight * 0.6), foam * 0.85);
          col += vec3(0.4, 0.7, 0.5) * uFlash * 0.3;
          float alpha = mix(0.55, 0.95, smoothstep(0.0, 4.0, depth));
          alpha = max(alpha, foam * 0.9);
          gl_FragColor = vec4(col, alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    });
  }
  update(dt, camera, env) {
    this.uniforms.uTime.value += dt;
    const s = 60;
    this.ocean.position.set(Math.round(camera.position.x / s) * s, 0, Math.round(camera.position.z / s) * s);
    if (env) {
      this.uniforms.uSunDir.value.copy(env.lightDir);
      this.uniforms.uSunColor.value.copy(env.sun).multiplyScalar(Math.min(1.5, env.sunI));
      this.uniforms.uZenith.value.copy(env.zenith);
      this.uniforms.uHorizon.value.copy(env.horizon);
      this.uniforms.uNight.value = env.night;
      this.uniforms.uSunVis.value = env.sunVis;
    }
  }
}
