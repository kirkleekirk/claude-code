// The frame: the scene is drawn into a half-float target (linear light, no limit on how bright
// the sun or lava can be), then bloomed, exposed, tone mapped with ACES, and dithered onto
// the screen, so the sky's long gradients don't band.

import * as THREE from 'three';

export const QUALITY = {
  low: { scale: 0.6, msaa: 0, bloom: false, shadows: 0, distance: 8, maxDpr: 1 },
  medium: { scale: 0.8, msaa: 0, bloom: true, shadows: 0, distance: 12, maxDpr: 1.5 },
  high: { scale: 1, msaa: 4, bloom: true, shadows: 2048, distance: 16, maxDpr: 2 },
  ultra: { scale: 1, msaa: 4, bloom: true, shadows: 4096, distance: 24, maxDpr: 2 },
};

const FS_TRI = (() => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  return g;
})();
const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

const PREFILTER = /* glsl */ `
uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThreshold;
varying vec2 vUv;
vec3 tap(vec2 o) { return texture2D(tSrc, vUv + o * uTexel).rgb; }
void main() {
  // 13-tap downsample, then keep what's brighter than the threshold (soft knee)
  vec3 a = tap(vec2(-2, -2)), b = tap(vec2(0, -2)), c = tap(vec2(2, -2));
  vec3 d = tap(vec2(-1, -1)), e = tap(vec2(1, -1));
  vec3 f = tap(vec2(-2, 0)), g = tap(vec2(0, 0)), h = tap(vec2(2, 0));
  vec3 i = tap(vec2(-1, 1)), j = tap(vec2(1, 1));
  vec3 k = tap(vec2(-2, 2)), l = tap(vec2(0, 2)), m = tap(vec2(2, 2));
  vec3 col = (d + e + i + j) * 0.125 + (a + b + f + g) * 0.03125 + (b + c + g + h) * 0.03125 + (f + g + k + l) * 0.03125 + (g + h + l + m) * 0.03125;
  float br = max(col.r, max(col.g, col.b));
  float knee = uThreshold * 0.5;
  float soft = clamp(br - uThreshold + knee, 0.0, 2.0 * knee);
  soft = soft * soft / (4.0 * knee + 1e-4);
  float w = max(soft, br - uThreshold) / max(br, 1e-4);
  gl_FragColor = vec4(min(col * w, vec3(200.0)), 1.0);
}`;

const DOWN = /* glsl */ `
uniform sampler2D tSrc; uniform vec2 uTexel;
varying vec2 vUv;
vec3 tap(vec2 o) { return texture2D(tSrc, vUv + o * uTexel).rgb; }
void main() {
  vec3 a = tap(vec2(-2, -2)), b = tap(vec2(0, -2)), c = tap(vec2(2, -2));
  vec3 d = tap(vec2(-1, -1)), e = tap(vec2(1, -1));
  vec3 f = tap(vec2(-2, 0)), g = tap(vec2(0, 0)), h = tap(vec2(2, 0));
  vec3 i = tap(vec2(-1, 1)), j = tap(vec2(1, 1));
  vec3 k = tap(vec2(-2, 2)), l = tap(vec2(0, 2)), m = tap(vec2(2, 2));
  vec3 col = (d + e + i + j) * 0.125 + (a + b + f + g) * 0.03125 + (b + c + g + h) * 0.03125 + (f + g + k + l) * 0.03125 + (g + h + l + m) * 0.03125;
  gl_FragColor = vec4(col, 1.0);
}`;

const UP = /* glsl */ `
uniform sampler2D tSrc; uniform sampler2D tPrev; uniform vec2 uTexel; uniform float uRadius;
varying vec2 vUv;
vec3 tap(vec2 o) { return texture2D(tSrc, vUv + o * uTexel * uRadius).rgb; }
void main() {
  vec3 col = tap(vec2(0, 0)) * 4.0 + (tap(vec2(1, 0)) + tap(vec2(-1, 0)) + tap(vec2(0, 1)) + tap(vec2(0, -1))) * 2.0
    + tap(vec2(1, 1)) + tap(vec2(-1, 1)) + tap(vec2(1, -1)) + tap(vec2(-1, -1));
  gl_FragColor = vec4(col / 16.0 + texture2D(tPrev, vUv).rgb, 1.0);
}`;

const COMPOSITE = /* glsl */ `
uniform sampler2D tScene; uniform sampler2D tBloom; uniform float uBloom; uniform float uExposure;
uniform float uTime; uniform vec2 uRes; uniform float uVignette; uniform vec3 uFlash; uniform float uSaturation; uniform float uGloom;
varying vec2 vUv;
// ACES filmic (Stephen Hill's fit)
vec3 RRTAndODTFit(vec3 v) {
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}
vec3 aces(vec3 c) {
  const mat3 inM = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
  const mat3 outM = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
  return clamp(outM * RRTAndODTFit(inM * c), 0.0, 1.0);
}
vec3 toSRGB(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
void main() {
  vec3 col = texture2D(tScene, vUv).rgb;
  col += texture2D(tBloom, vUv).rgb * uBloom;
  col *= uExposure;
  col += uFlash;
  // a touch more colour before the curve flattens it
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = max(mix(vec3(l), col, uSaturation), 0.0);
  col = aces(col);
  // the storm's grade: cold, drained shadows, a dirty warmth in the light, more contrast
  if (uGloom > 0.0) {
    float L = dot(col, vec3(0.2126, 0.7152, 0.0722));
    vec3 split = mix(vec3(0.84, 0.94, 1.04), vec3(1.05, 1.0, 0.88), smoothstep(0.06, 0.55, L));
    vec3 g = mix(vec3(L), col, 0.78) * split;
    // the green goes olive, like the original's grass
    float green = clamp((g.g - max(g.r, g.b)) * 5.0, 0.0, 1.0);
    g = mix(g, vec3(g.g * 0.9, g.g * 0.86, g.b * 0.8), green * 0.55);
    g = mix(g, g * g * (3.0 - 2.0 * g), 0.3);
    col = mix(col, g, uGloom);
  }
  vec2 q = vUv - 0.5;
  col *= 1.0 - dot(q, q) * (uVignette + 0.9 * uGloom);
  col = toSRGB(col);
  // dither away banding
  col += (ign(gl_FragCoord.xy + fract(uTime) * 64.0) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}`;

export class Renderer {
  constructor(canvas, quality = 'high') {
    this.canvas = canvas;
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.gl.autoClear = false;
    this.gl.setClearColor(0x000000, 1);
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.quality = QUALITY[quality] ? quality : 'high';
    this.q = QUALITY[this.quality];
    this.scale = 1; // dynamic resolution
    this.exposure = 1;
    this.bloomStrength = 0.06;
    this.vignette = 0.35;
    this.saturation = 1.08;
    this.flash = new THREE.Vector3();
    this.time = 0;
    this.post = new THREE.Scene();
    this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(FS_TRI, null);
    this.quad.frustumCulled = false;
    this.post.add(this.quad);
    const mk = (fs, u) => new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, uniforms: u, depthTest: false, depthWrite: false });
    this.mPre = mk(PREFILTER, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 1.0 } });
    this.mDown = mk(DOWN, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.mUp = mk(UP, { tSrc: { value: null }, tPrev: { value: null }, uTexel: { value: new THREE.Vector2() }, uRadius: { value: 1 } });
    this.mComp = mk(COMPOSITE, {
      tScene: { value: null }, tBloom: { value: null }, uBloom: { value: this.bloomStrength }, uExposure: { value: 1 },
      uTime: { value: 0 }, uRes: { value: new THREE.Vector2() }, uVignette: { value: this.vignette }, uFlash: { value: this.flash }, uSaturation: { value: this.saturation }, uGloom: { value: 0 },
    });
    this.black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    this.black.needsUpdate = true;
    this.targets = null;
    this.resize();
  }

  setQuality(name) {
    if (!QUALITY[name]) return;
    this.quality = name;
    this.q = QUALITY[name];
    this.resize(true);
  }

  resize(force = false) {
    const dpr = Math.min(window.devicePixelRatio || 1, this.q.maxDpr);
    const w = Math.max(1, Math.floor(this.canvas.clientWidth || window.innerWidth));
    const h = Math.max(1, Math.floor(this.canvas.clientHeight || window.innerHeight));
    const s = this.q.scale * this.scale * dpr;
    const W = Math.max(64, Math.round(w * s)), H = Math.max(64, Math.round(h * s));
    if (!force && this.size && this.size.W === W && this.size.H === H && this.size.cw === w && this.size.ch === h) return;
    this.size = { W, H, cw: w, ch: h };
    this.gl.setPixelRatio(1);
    this.gl.setSize(Math.round(w * dpr * this.q.scale * this.scale), Math.round(h * dpr * this.q.scale * this.scale), false);
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    if (this.targets) for (const t of this.targets.all) t.dispose();
    const hf = THREE.HalfFloatType;
    const scene = new THREE.WebGLRenderTarget(W, H, { type: hf, samples: this.q.msaa, depthBuffer: true, stencilBuffer: false });
    const mips = [];
    let mw = W >> 1, mh = H >> 1;
    for (let i = 0; i < 6 && mw >= 8 && mh >= 8; i++) {
      mips.push(new THREE.WebGLRenderTarget(mw, mh, { type: hf, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }));
      mw >>= 1; mh >>= 1;
    }
    const ups = mips.slice(0, -1).map((m) => new THREE.WebGLRenderTarget(m.width, m.height, { type: hf, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }));
    this.targets = { scene, mips, ups, all: [scene, ...mips, ...ups] };
    this.mComp.uniforms.uRes.value.set(W, H);
  }

  pass(material, target) {
    this.quad.material = material;
    this.gl.setRenderTarget(target);
    this.gl.render(this.post, this.postCam);
  }

  // Draw the world, then the first-person layer on top (cleared depth), then post.
  render(scene, camera, overlay = null, overlayCam = null) {
    const g = this.gl, T = this.targets;
    this.time += 1 / 60;
    g.setRenderTarget(T.scene);
    g.clear(true, true, false);
    g.render(scene, camera);
    if (overlay) {
      g.clearDepth();
      g.render(overlay, overlayCam || camera);
    }
    let bloomTex = this.black;
    if (this.q.bloom && T.mips.length > 1) {
      const m = T.mips;
      this.mPre.uniforms.tSrc.value = T.scene.texture;
      this.mPre.uniforms.uTexel.value.set(1 / T.scene.width, 1 / T.scene.height);
      this.pass(this.mPre, m[0]);
      for (let i = 1; i < m.length; i++) {
        this.mDown.uniforms.tSrc.value = m[i - 1].texture;
        this.mDown.uniforms.uTexel.value.set(1 / m[i - 1].width, 1 / m[i - 1].height);
        this.pass(this.mDown, m[i]);
      }
      // back up, adding each level
      let prev = m[m.length - 1];
      for (let i = m.length - 2; i >= 0; i--) {
        this.mUp.uniforms.tSrc.value = prev.texture;
        this.mUp.uniforms.tPrev.value = m[i].texture;
        this.mUp.uniforms.uTexel.value.set(1 / prev.width, 1 / prev.height);
        this.pass(this.mUp, T.ups[i]);
        prev = T.ups[i];
      }
      bloomTex = prev.texture;
    }
    const c = this.mComp.uniforms;
    c.tScene.value = T.scene.texture;
    c.tBloom.value = bloomTex;
    c.uBloom.value = this.q.bloom ? this.bloomStrength : 0;
    c.uExposure.value = this.exposure;
    c.uTime.value = this.time;
    c.uVignette.value = this.vignette;
    c.uSaturation.value = this.saturation;
    c.uGloom.value = this.gloom || 0;
    this.pass(this.mComp, null);
  }
}
