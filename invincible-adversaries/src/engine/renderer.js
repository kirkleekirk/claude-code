import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

export const QUALITY = {
  low: { pixelRatio: 0.7, shadow: 1024, msaa: 0, bloom: true, particles: 0.55 },
  medium: { pixelRatio: 1, shadow: 2048, msaa: 4, bloom: true, particles: 0.8 },
  high: { pixelRatio: 1.5, shadow: 4096, msaa: 4, bloom: true, particles: 1 },
};

const MAX_WAVES = 8;

const FinalShader = {
  uniforms: {
    tDiffuse: { value: null },
    uRes: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uWaves: { value: Array.from({ length: MAX_WAVES }, () => new THREE.Vector4(0, 0, 0, 0)) },
    uWaveW: { value: new Float32Array(MAX_WAVES) },
    uCA: { value: 0 },
    uRadial: { value: new THREE.Vector3(0.5, 0.5, 0) },
    uSpeedLines: { value: 0 },
    uSpeedColor: { value: new THREE.Color(1, 1, 1) },
    uVignette: { value: 0.32 },
    uSat: { value: 1.18 },
    uContrast: { value: 1.1 },
    uExposure: { value: 0.92 },
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color(1, 1, 1) },
    uDamage: { value: 0 },
    uDesat: { value: 0 },
    uGrain: { value: 0.035 },
    uTint: { value: new THREE.Color(1, 1, 1) },
    uLowHp: { value: 0 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */`
    precision highp float;
    #define MAX_WAVES ${MAX_WAVES}
    uniform sampler2D tDiffuse;
    uniform vec2 uRes;
    uniform float uTime;
    uniform vec4 uWaves[MAX_WAVES];
    uniform float uWaveW[MAX_WAVES];
    uniform float uCA;
    uniform vec3 uRadial;
    uniform float uSpeedLines;
    uniform vec3 uSpeedColor;
    uniform float uVignette, uSat, uContrast, uExposure, uFlash, uDamage, uDesat, uGrain, uLowHp;
    uniform vec3 uFlashColor, uTint;
    varying vec2 vUv;

    vec3 RRTAndODTFit(vec3 v) {
      vec3 a = v * (v + 0.0245786) - 0.000090537;
      vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
      return a / b;
    }
    vec3 aces(vec3 color) {
      const mat3 ACESInputMat = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
      const mat3 ACESOutputMat = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
      color *= uExposure / 0.6;
      color = ACESInputMat * color;
      color = RRTAndODTFit(color);
      color = ACESOutputMat * color;
      return clamp(color, 0.0, 1.0);
    }
    vec3 srgb(vec3 c) {
      return mix(pow(c, vec3(0.41666)) * 1.055 - vec3(0.055), c * 12.92, vec3(lessThanEqual(c, vec3(0.0031308))));
    }
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

    void main() {
      vec2 uv = vUv;
      float aspect = uRes.x / uRes.y;
      vec2 off = vec2(0.0);
      float ringSum = 0.0;
      for (int i = 0; i < MAX_WAVES; i++) {
        vec4 w = uWaves[i];
        if (w.w <= 0.0) continue;
        vec2 d = (uv - w.xy) * vec2(aspect, 1.0);
        float dist = length(d);
        float width = uWaveW[i];
        float ring = smoothstep(w.z - width, w.z, dist) * (1.0 - smoothstep(w.z, w.z + width * 0.6, dist));
        vec2 dir = dist > 1e-4 ? d / dist : vec2(0.0);
        off -= dir / vec2(aspect, 1.0) * ring * w.w;
        ringSum += ring * w.w;
      }
      uv += off;
      // radial (speed) blur toward center
      vec3 col;
      float ca = uCA + ringSum * 0.22;
      vec2 cdir = (uv - 0.5);
      if (uRadial.z > 0.001) {
        vec3 acc = vec3(0.0); float wsum = 0.0;
        for (int i = 0; i < 8; i++) {
          float t = float(i) / 7.0;
          float s = 1.0 - uRadial.z * t * 0.12;
          vec2 suv = uRadial.xy + (uv - uRadial.xy) * s;
          float wgt = 1.0 - t * 0.6;
          acc += texture2D(tDiffuse, suv).rgb * wgt; wsum += wgt;
        }
        col = acc / wsum;
        // keep center sharp
        float cmask = smoothstep(0.05, 0.45, length(cdir * vec2(aspect, 1.0)));
        col = mix(texture2D(tDiffuse, uv).rgb, col, cmask);
      } else {
        col = texture2D(tDiffuse, uv).rgb;
      }
      if (ca > 0.0005) {
        vec2 o = cdir * ca;
        col.r = mix(col.r, texture2D(tDiffuse, uv + o).r, 0.85);
        col.b = mix(col.b, texture2D(tDiffuse, uv - o).b, 0.85);
      }
      // anime speed lines
      if (uSpeedLines > 0.001) {
        vec2 p = (vUv - 0.5) * vec2(aspect, 1.0);
        float ang = atan(p.y, p.x);
        float r = length(p);
        float bucket = floor(ang * 60.0 / 6.28318);
        float rnd = hash(vec2(bucket, floor(uTime * 14.0)));
        float line = smoothstep(0.86, 1.0, rnd) * smoothstep(0.32, 0.75, r);
        float thin = 1.0 - smoothstep(0.0, 0.35, abs(fract(ang * 60.0 / 6.28318) - 0.5) * 2.0);
        col += uSpeedColor * line * thin * uSpeedLines * 1.4;
      }
      col *= uTint;
      // tone map
      col = aces(col);
      // grade
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSat * (1.0 - uDesat));
      col = (col - 0.5) * uContrast + 0.5;
      // flashes
      col = mix(col, uFlashColor, clamp(uFlash, 0.0, 1.0));
      vec2 vc = (vUv - 0.5) * vec2(aspect, 1.0);
      float vig = smoothstep(0.35, 1.05, length(vc));
      col *= 1.0 - vig * uVignette;
      float dmg = clamp(uDamage + uLowHp * (0.55 + 0.45 * sin(uTime * 5.0)), 0.0, 1.0);
      col = mix(col, vec3(0.55, 0.0, 0.02), vig * dmg * 0.6);
      // grain
      col += (hash(vUv * uRes + fract(uTime) * 100.0) - 0.5) * uGrain;
      gl_FragColor = vec4(srgb(clamp(col, 0.0, 1.0)), 1.0);
    }
  `,
};

const SanitizeShader = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0, 0.0, 0.0, 1.0);
      gl_FragColor = clamp(c, vec4(0.0), vec4(48.0));
    }`,
};

export class Renderer {
  constructor(canvas, qualityName = 'medium') {
    this.canvas = canvas;
    this.r = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, preserveDrawingBuffer: !!window.__capture });
    this.r.outputColorSpace = THREE.SRGBColorSpace;
    this.r.toneMapping = THREE.NoToneMapping;
    this.r.shadowMap.enabled = true;
    this.r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.waves = [];
    this.fx = { ca: 0, flash: 0, flashColor: new THREE.Color(1, 1, 1), damage: 0, desat: 0, radial: 0, speedLines: 0, lowHp: 0, tint: new THREE.Color(1, 1, 1) };
    this.setQuality(qualityName);
  }

  setQuality(name) {
    this.qualityName = name;
    this.q = QUALITY[name] || QUALITY.medium;
    this.r.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.q.pixelRatio));
    if (this.composer) this.build(this.scene, this.camera);
  }

  build(scene, camera) {
    this.scene = scene; this.camera = camera;
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    const pr = this.r.getPixelRatio();
    if (this.composer) this.composer.dispose?.();
    const rt = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples: this.q.msaa, depthBuffer: true });
    this.composer = new EffectComposer(this.r, rt);
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);
    this.composer.addPass(new ShaderPass(SanitizeShader));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.7, 0.5, 1.45);
    this.bloom.enabled = this.q.bloom;
    this.composer.addPass(this.bloom);
    this.final = new ShaderPass(FinalShader);
    this.composer.addPass(this.final);
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.r.setSize(w, h, false);
    this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
    if (this.camera) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
    if (this.composer) {
      this.composer.setPixelRatio(this.r.getPixelRatio());
      this.composer.setSize(w, h);
      this.final.uniforms.uRes.value.set(w * this.r.getPixelRatio(), h * this.r.getPixelRatio());
    }
  }

  /** screen-space shockwave from a world point. */
  addWave(worldPos, { strength = 0.04, speed = 1.4, life = 0.6, width = 0.08 } = {}) {
    if (this.waves.length >= MAX_WAVES) this.waves.shift();
    this.waves.push({ p: worldPos.clone(), t: 0, strength, speed, life, width });
  }

  flash(color, amount = 0.6) { this.fx.flashColor.set(color); this.fx.flash = Math.max(this.fx.flash, amount); }

  render(dt, time) {
    const u = this.final.uniforms;
    u.uTime.value = time;
    // waves
    const v = new THREE.Vector3();
    for (let i = 0; i < MAX_WAVES; i++) { u.uWaves.value[i].set(0, 0, 0, 0); }
    this.waves = this.waves.filter((w) => (w.t += dt) < w.life);
    this.waves.forEach((w, i) => {
      v.copy(w.p).project(this.camera);
      const behind = v.z > 1;
      const k = w.t / w.life;
      const dist = this.camera.position.distanceTo(w.p);
      const scale = 6 / Math.max(2, dist);
      u.uWaves.value[i].set(v.x * 0.5 + 0.5, v.y * 0.5 + 0.5, k * w.speed * scale * 0.5, behind ? 0 : w.strength * 0.6 * (1 - k) * (1 - k) * Math.min(1.2, scale));
      u.uWaveW.value[i] = w.width * 0.8 * Math.min(1.2, scale);
    });
    const fx = this.fx;
    u.uCA.value = fx.ca;
    u.uFlash.value = fx.flash;
    u.uFlashColor.value.copy(fx.flashColor);
    u.uDamage.value = fx.damage;
    u.uDesat.value = fx.desat;
    u.uRadial.value.z = fx.radial;
    u.uSpeedLines.value = fx.speedLines;
    u.uLowHp.value = fx.lowHp;
    u.uTint.value.copy(fx.tint);
    // decay transient effects
    fx.flash = Math.max(0, fx.flash - dt * 3.2);
    fx.damage = Math.max(0, fx.damage - dt * 2.2);
    fx.ca = Math.max(0, fx.ca - dt * 0.03 - fx.ca * dt * 3.0);
    this.composer.render(dt);
  }
}
