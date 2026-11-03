// Renderer, scene, lights and the post-processing stack.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';

export const QUALITY = {
  low: { label: 'Low', pixelRatio: 0.75, shadows: 0, post: false, bloom: false, msaa: 0, lambert: true, grass: 0, treeNear: 160, detailDist: 260, maxZombies: 45 },
  medium: { label: 'Medium', pixelRatio: 1, shadows: 1024, post: true, bloom: false, msaa: 0, lambert: false, grass: 0.5, treeNear: 240, detailDist: 340, maxZombies: 70 },
  high: { label: 'High', pixelRatio: 1.25, shadows: 2048, post: true, bloom: true, msaa: 4, lambert: false, grass: 1, treeNear: 320, detailDist: 420, maxZombies: 100 },
  ultra: { label: 'Ultra', pixelRatio: 2, shadows: 4096, post: true, bloom: true, msaa: 4, lambert: false, grass: 1.4, treeNear: 420, detailDist: 520, maxZombies: 140 },
};

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null }, uSat: { value: 1.18 }, uContrast: { value: 1.06 }, uVignette: { value: 0.28 },
    uTint: { value: new THREE.Color(1, 1, 1) }, uTintAmt: { value: 0 }, uDamage: { value: 0 }, uDesat: { value: 0 },
    uTime: { value: 0 }, uHorde: { value: 0 }, uExposure: { value: 1 }, uFade: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uSat, uContrast, uVignette, uTintAmt, uDamage, uDesat, uTime, uHorde, uExposure, uFade;
    uniform vec3 uTint; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb * uExposure;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSat * (1.0 - uDesat * 0.85));
      col = (col - 0.18) * uContrast + 0.18;
      col = mix(col, col * uTint, uTintAmt);
      vec2 q = vUv - 0.5;
      float r = dot(q, q);
      float vig = smoothstep(0.65, 0.12, r * (1.0 + uVignette));
      col *= mix(1.0, vig, uVignette + uHorde * 0.35);
      float pulse = 0.5 + 0.5 * sin(uTime * 2.2);
      col = mix(col, col * vec3(0.7, 1.05, 0.65), uHorde * smoothstep(0.08, 0.4, r) * (0.55 + 0.45 * pulse));
      col = mix(col, vec3(0.6, 0.02, 0.02), uDamage * smoothstep(0.05, 0.45, r));
      col = mix(col, vec3(0.0), uFade);
      gl_FragColor = vec4(max(col, 0.0), c.a);
    }`,
};

export class Graphics {
  constructor(canvas, qualityKey = 'medium') {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.1, 6500);
    this.camera.position.set(0, 50, 0);
    this.scene.fog = new THREE.FogExp2(0xbcd5ee, 0.0012);
    // lights
    this.hemi = new THREE.HemisphereLight(0xbfdcff, 0x5d7040, 0.8);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.5);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.6;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.flashLight = new THREE.HemisphereLight(0xb8ffcc, 0x223322, 0);
    this.scene.add(this.flashLight);
    this.shadowRange = 70;
    this.setQuality(qualityKey);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }
  setQuality(key) {
    this.qualityKey = QUALITY[key] ? key : 'medium';
    const q = (this.q = QUALITY[this.qualityKey]);
    const dpr = Math.min(window.devicePixelRatio || 1, q.pixelRatio);
    this.renderer.setPixelRatio(dpr);
    this.renderer.shadowMap.enabled = q.shadows > 0;
    this.sun.castShadow = q.shadows > 0;
    if (q.shadows > 0) {
      this.sun.shadow.mapSize.set(q.shadows, q.shadows);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
      this.shadowRange = q.shadows >= 4096 ? 110 : q.shadows >= 2048 ? 85 : 60;
      const c = this.sun.shadow.camera;
      c.left = -this.shadowRange; c.right = this.shadowRange; c.top = this.shadowRange; c.bottom = -this.shadowRange;
      c.near = 1; c.far = 800;
      c.updateProjectionMatrix();
    }
    this.buildComposer();
    this.resize();
  }
  buildComposer() {
    if (this.composer) { this.composer.dispose?.(); this.composer = null; }
    const q = this.q;
    this.grade = null;
    if (!q.post) { this.renderer.toneMapping = THREE.ACESFilmicToneMapping; return; }
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(Math.max(1, size.x), Math.max(1, size.y), { type: THREE.HalfFloatType, samples: q.msaa });
    this.composer = new EffectComposer(this.renderer, rt);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);
    if (q.bloom) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.32, 0.5, 0.86);
      this.composer.addPass(this.bloom);
    } else this.bloom = null;
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
    if (!q.msaa) {
      this.fxaa = new ShaderPass(FXAAShader);
      this.composer.addPass(this.fxaa);
    } else this.fxaa = null;
  }
  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.composer) {
      this.composer.setSize(w, h);
      const pr = this.renderer.getPixelRatio();
      if (this.fxaa) this.fxaa.material.uniforms.resolution.value.set(1 / (w * pr), 1 / (h * pr));
    }
  }
  // fallback grade values when no composer (low): we use exposure only
  render() {
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
  updateShadowFocus(focus, lightDir) {
    const r = this.shadowRange;
    // snap to texel grid to avoid shimmering
    const texel = (2 * r) / (this.q.shadows || 1024);
    const fx = Math.round(focus.x / texel) * texel, fz = Math.round(focus.z / texel) * texel;
    this.sun.target.position.set(fx, focus.y, fz);
    this.sun.position.set(fx + lightDir.x * 400, focus.y + lightDir.y * 400, fz + lightDir.z * 400);
    this.sun.target.updateMatrixWorld();
  }
}
