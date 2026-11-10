import * as THREE from 'three';
import { FS_VERT } from './shaderlib.js';
import { G } from './globals.js';

export const QUALITY = {
  low: { name: 'Low', maxDpr: 1.0, scale: 0.8, minScale: 0.5, msaa: 0, bloomMips: 4, reflect: 0, rays: false, shadowSize: 512, flora: 0.45, drawDist: 0.7 },
  medium: { name: 'Medium', maxDpr: 1.5, scale: 0.9, minScale: 0.55, msaa: 2, bloomMips: 5, reflect: 0.4, rays: true, shadowSize: 1024, flora: 0.75, drawDist: 0.85 },
  high: { name: 'High', maxDpr: 2.0, scale: 1.0, minScale: 0.6, msaa: 4, bloomMips: 6, reflect: 0.5, rays: true, shadowSize: 1024, flora: 1.0, drawDist: 1.0 },
};

const tri = new THREE.BufferGeometry();
tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
tri.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));

function passMaterial(frag, uniforms, defines) {
  return new THREE.ShaderMaterial({
    vertexShader: FS_VERT, fragmentShader: frag, uniforms, defines: defines || {},
    depthTest: false, depthWrite: false, toneMapped: false,
  });
}

const PREFILTER = /* glsl */`
uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThreshold; uniform float uKnee;
varying vec2 vUv;
vec3 s(vec2 o){ return min(texture2D(tSrc, vUv + o * uTexel).rgb, vec3(48.0)); }
float lum(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
void main(){
  vec3 a = s(vec2(-1.0, -1.0)), b = s(vec2(1.0, -1.0)), c = s(vec2(-1.0, 1.0)), d = s(vec2(1.0, 1.0));
  float wa = 1.0 / (1.0 + lum(a)), wb = 1.0 / (1.0 + lum(b)), wc = 1.0 / (1.0 + lum(c)), wd = 1.0 / (1.0 + lum(d));
  vec3 col = (a * wa + b * wb + c * wc + d * wd) / (wa + wb + wc + wd);
  float br = max(col.r, max(col.g, col.b));
  float soft = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee);
  soft = soft * soft / (4.0 * uKnee + 1e-4);
  float contrib = max(soft, br - uThreshold) / max(br, 1e-4);
  gl_FragColor = vec4(col * contrib, 1.0);
}`;

const DOWN = /* glsl */`
uniform sampler2D tSrc; uniform vec2 uTexel;
varying vec2 vUv;
vec3 s(float x, float y){ return texture2D(tSrc, vUv + vec2(x, y) * uTexel).rgb; }
void main(){
  vec3 A = s(-2.,-2.), B = s(0.,-2.), C = s(2.,-2.), D = s(-2.,0.), E = s(0.,0.), F = s(2.,0.);
  vec3 Gg = s(-2.,2.), H = s(0.,2.), I = s(2.,2.), J = s(-1.,-1.), K = s(1.,-1.), L = s(-1.,1.), M = s(1.,1.);
  vec3 col = E * 0.125 + (A + C + Gg + I) * 0.03125 + (B + D + F + H) * 0.0625 + (J + K + L + M) * 0.125;
  gl_FragColor = vec4(col, 1.0);
}`;

const UP = /* glsl */`
uniform sampler2D tLow; uniform sampler2D tHigh; uniform vec2 uTexel; uniform float uMix;
varying vec2 vUv;
vec3 s(float x, float y){ return texture2D(tLow, vUv + vec2(x, y) * uTexel).rgb; }
void main(){
  vec3 t = s(0.,0.) * 4.0 + (s(-1.,0.) + s(1.,0.) + s(0.,-1.) + s(0.,1.)) * 2.0 + s(-1.,-1.) + s(1.,-1.) + s(-1.,1.) + s(1.,1.);
  t *= 1.0 / 16.0;
  gl_FragColor = vec4(texture2D(tHigh, vUv).rgb + t * uMix, 1.0);
}`;

const RAYS = /* glsl */`
uniform sampler2D tSrc; uniform vec2 uSunUv; uniform float uStrength; uniform float uAspect;
varying vec2 vUv;
void main(){
  vec2 delta = uSunUv - vUv;
  vec2 stepv = delta / 28.0;
  vec2 p = vUv + stepv * 0.5;
  vec3 acc = vec3(0.0); float w = 1.0;
  for (int i = 0; i < 28; i++){
    acc += texture2D(tSrc, clamp(p, 0.001, 0.999)).rgb * w;
    w *= 0.955; p += stepv;
  }
  float d = length(delta * vec2(uAspect, 1.0));
  float fall = 1.0 / (1.0 + d * d * 2.5);
  gl_FragColor = vec4(acc * (uStrength * fall / 28.0), 1.0);
}`;

const FINAL = /* glsl */`
uniform sampler2D tScene; uniform sampler2D tBloom; uniform sampler2D tRays;
uniform float uBloom; uniform float uExposure; uniform float uVignette; uniform float uGrain;
uniform float uSat; uniform float uContrast; uniform vec3 uTint; uniform float uTimeF;
uniform vec4 uFade; uniform float uRaysOn; uniform float uDamage; uniform float uWarp;
varying vec2 vUv;
vec3 aces(vec3 x){
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}
float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main(){
  vec2 uv = vUv;
  vec2 cc = uv - 0.5;
  float r2 = dot(cc, cc);
  uv += cc * r2 * uWarp;
  vec2 ca = cc * (r2 * 0.012 + uDamage * 0.01 + uWarp * 0.05);
  vec3 col;
  col.r = texture2D(tScene, uv + ca).r;
  col.g = texture2D(tScene, uv).g;
  col.b = texture2D(tScene, uv - ca).b;
  vec3 bl = texture2D(tBloom, uv).rgb;
  col += bl * uBloom;
  col += texture2D(tRays, uv).rgb * uRaysOn;
  col *= uExposure;
  col = aces(col * 0.82);
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, uSat);
  col = (col - 0.5) * uContrast + 0.5;
  col *= uTint;
  float vg = smoothstep(0.12, 0.62, r2);
  col *= 1.0 - uVignette * vg;
  col = mix(col, vec3(0.75, 0.04, 0.03), uDamage * vg * 0.85);
  col = pow(max(col, 0.0), vec3(1.0 / 2.2));
  col += (hash(gl_FragCoord.xy + fract(uTimeF) * 61.0) - 0.5) * uGrain;
  col = mix(col, uFade.rgb, uFade.a);
  gl_FragColor = vec4(col, 1.0);
}`;

export class Gfx {
  constructor(canvas, qualityKey = 'high') {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: false, alpha: false, stencil: false, depth: false,
      powerPreference: 'high-performance',
    });
    this.renderer.autoClear = true;
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.info.autoReset = false;
    const gl = this.renderer.getContext();
    this.floatOK = !!(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'));
    this.rtType = this.floatOK ? THREE.HalfFloatType : THREE.UnsignedByteType;
    this.maxAniso = this.renderer.capabilities.getMaxAnisotropy();

    this.passScene = new THREE.Scene();
    this.passCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.passMesh = new THREE.Mesh(tri, null);
    this.passMesh.frustumCulled = false;
    this.passScene.add(this.passMesh);

    this.mPre = passMaterial(PREFILTER, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 1.0 }, uKnee: { value: 0.6 } });
    this.mDown = passMaterial(DOWN, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.mUp = passMaterial(UP, { tLow: { value: null }, tHigh: { value: null }, uTexel: { value: new THREE.Vector2() }, uMix: { value: 1.0 } });
    this.mRays = passMaterial(RAYS, { tSrc: { value: null }, uSunUv: { value: new THREE.Vector2(0.5, 0.5) }, uStrength: { value: 0 }, uAspect: { value: 1 } });
    this.mFinal = passMaterial(FINAL, {
      tScene: { value: null }, tBloom: { value: null }, tRays: { value: null },
      uBloom: { value: 0.09 }, uExposure: { value: 1.0 }, uVignette: { value: 0.34 }, uGrain: { value: 0.014 },
      uSat: { value: 1.1 }, uContrast: { value: 1.08 }, uTint: { value: new THREE.Color(1, 1, 1) }, uTimeF: { value: 0 },
      uFade: { value: new THREE.Vector4(0, 0, 0, 0) }, uRaysOn: { value: 0 }, uDamage: { value: 0 }, uWarp: { value: 0 },
    });

    this.reflCam = new THREE.PerspectiveCamera();
    this.reflCam.layers.set(1);
    this.reflMatrix = new THREE.Matrix4();
    this.uReflTex = { value: null };
    this.uReflMatrix = { value: this.reflMatrix };
    this.uReflOn = { value: 0 };

    this.frame = 0;
    this.scale = 1;
    this.dtAvg = 1 / 60;
    this.adjustTimer = 0;
    this.dynamicRes = true;
    this.setQuality(qualityKey);
  }

  setQuality(key) {
    this.qualityKey = key;
    this.q = QUALITY[key] || QUALITY.high;
    this.scale = this.q.scale;
    this.resize(true);
  }

  resize(force) {
    const w = Math.max(2, this.canvas.clientWidth | 0), h = Math.max(2, this.canvas.clientHeight | 0);
    const dpr = Math.min(window.devicePixelRatio || 1, this.q.maxDpr) * this.scale;
    const pw = Math.max(64, Math.round(w * dpr)), ph = Math.max(64, Math.round(h * dpr));
    if (!force && pw === this.pw && ph === this.ph) return;
    this.cssW = w; this.cssH = h; this.pw = pw; this.ph = ph;
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(pw, ph, false);
    this.aspect = w / h;
    this._alloc();
  }

  _rt(w, h, opts = {}) {
    const rt = new THREE.WebGLRenderTarget(Math.max(2, w | 0), Math.max(2, h | 0), {
      type: this.rtType, format: THREE.RGBAFormat, depthBuffer: !!opts.depth, stencilBuffer: false,
      samples: opts.samples || 0, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    });
    rt.texture.generateMipmaps = false;
    rt.texture.wrapS = rt.texture.wrapT = THREE.ClampToEdgeWrapping;
    return rt;
  }

  _alloc() {
    const dispose = (r) => r && r.dispose();
    dispose(this.sceneRT); dispose(this.raysRT); dispose(this.reflRT);
    (this.down || []).forEach(dispose); (this.up || []).forEach(dispose);
    const { pw, ph } = this;
    this.sceneRT = this._rt(pw, ph, { depth: true, samples: this.q.msaa });
    this.down = []; this.up = [];
    let w = pw >> 1, h = ph >> 1;
    for (let i = 0; i < this.q.bloomMips && w >= 4 && h >= 4; i++) {
      this.down.push(this._rt(w, h));
      this.up.push(this._rt(w, h));
      w >>= 1; h >>= 1;
    }
    this.raysRT = this._rt(pw >> 2, ph >> 2);
    if (this.q.reflect > 0) {
      this.reflRT = this._rt(pw * this.q.reflect, ph * this.q.reflect, { depth: true });
      this.uReflTex.value = this.reflRT.texture;
    } else {
      this.reflRT = null;
      this.uReflTex.value = null;
    }
  }

  _pass(mat, target) {
    this.passMesh.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.passScene, this.passCam);
  }

  // Mirror the camera across the water plane and render reflectable layers.
  renderReflection(scene, camera, seaY) {
    if (!this.reflRT || camera.position.y <= seaY + 0.05) { this.uReflOn.value = 0; return; }
    const v = this.reflCam;
    const cp = camera.getWorldPosition(new THREE.Vector3());
    const rot = new THREE.Matrix4().extractRotation(camera.matrixWorld);
    const look = new THREE.Vector3(0, 0, -1).applyMatrix4(rot).add(cp);
    v.position.set(cp.x, 2 * seaY - cp.y, cp.z);
    const tgt = new THREE.Vector3(look.x, 2 * seaY - look.y, look.z);
    const up = new THREE.Vector3(0, 1, 0).applyMatrix4(rot);
    up.y = -up.y;
    v.up.copy(up);
    v.lookAt(tgt);
    v.near = camera.near; v.far = camera.far;
    v.updateMatrixWorld();
    v.projectionMatrix.copy(camera.projectionMatrix);
    v.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
    this.reflMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.reflMatrix.multiply(v.projectionMatrix);
    this.reflMatrix.multiply(v.matrixWorldInverse);
    G.uClipY.value = seaY - 0.15;
    this.renderer.setRenderTarget(this.reflRT);
    this.renderer.clear();
    this.renderer.render(scene, v);
    G.uClipY.value = -1e5;
    this.uReflOn.value = 1;
  }

  render(scene, camera, opts = {}) {
    const r = this.renderer;
    r.info.reset();
    this.frame++;
    if (opts.seaY !== undefined && this.q.reflect > 0) this.renderReflection(scene, camera, opts.seaY);
    else this.uReflOn.value = 0;

    r.setRenderTarget(this.sceneRT);
    r.clear();
    r.render(scene, camera);

    // Bloom chain
    const n = this.down.length;
    this.mPre.uniforms.tSrc.value = this.sceneRT.texture;
    this.mPre.uniforms.uTexel.value.set(1 / this.pw, 1 / this.ph);
    this._pass(this.mPre, this.down[0]);
    for (let i = 1; i < n; i++) {
      const src = this.down[i - 1];
      this.mDown.uniforms.tSrc.value = src.texture;
      this.mDown.uniforms.uTexel.value.set(1 / src.width, 1 / src.height);
      this._pass(this.mDown, this.down[i]);
    }
    let low = this.down[n - 1];
    for (let i = n - 2; i >= 0; i--) {
      this.mUp.uniforms.tLow.value = low.texture;
      this.mUp.uniforms.tHigh.value = this.down[i].texture;
      this.mUp.uniforms.uTexel.value.set(1 / low.width, 1 / low.height);
      this.mUp.uniforms.uMix.value = 0.85;
      this._pass(this.mUp, this.up[i]);
      low = this.up[i];
    }

    // Light shafts from the sun, marched over the bright-pass image.
    let raysOn = 0;
    if (this.q.rays && opts.sunDir && (opts.rayStrength || 0) > 0.01) {
      const sp = opts.sunDir.clone().multiplyScalar(1000).add(camera.position).project(camera);
      const fwd = camera.getWorldDirection(new THREE.Vector3());
      const facing = fwd.dot(opts.sunDir);
      if (facing > 0.15 && sp.z < 1) {
        const fade = Math.min(1, (facing - 0.15) * 2.5);
        this.mRays.uniforms.tSrc.value = this.down[Math.min(1, n - 1)].texture;
        this.mRays.uniforms.uSunUv.value.set(sp.x * 0.5 + 0.5, sp.y * 0.5 + 0.5);
        this.mRays.uniforms.uStrength.value = opts.rayStrength * fade;
        this.mRays.uniforms.uAspect.value = this.aspect;
        this._pass(this.mRays, this.raysRT);
        raysOn = 1;
      }
    }

    const fu = this.mFinal.uniforms;
    fu.tScene.value = this.sceneRT.texture;
    fu.tBloom.value = low.texture;
    fu.tRays.value = this.raysRT.texture;
    fu.uRaysOn.value = raysOn;
    fu.uTimeF.value = G.uTime.value;
    this._pass(this.mFinal, null);
  }

  // Keep frame time in budget by nudging internal resolution.
  adapt(dt) {
    if (!this.dynamicRes) return;
    this.dtAvg += (Math.min(dt, 0.1) - this.dtAvg) * 0.05;
    this.adjustTimer += dt;
    if (this.adjustTimer < 1.2) return;
    this.adjustTimer = 0;
    const fps = 1 / this.dtAvg;
    let s = this.scale;
    if (fps < 38) s -= 0.08; else if (fps < 48) s -= 0.04; else if (fps > 57) s += 0.03;
    s = Math.max(this.q.minScale, Math.min(this.q.scale, s));
    if (Math.abs(s - this.scale) > 0.005) { this.scale = s; this.resize(true); }
  }
}
