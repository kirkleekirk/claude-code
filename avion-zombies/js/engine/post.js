import * as THREE from '../../vendor/three.module.min.js';

// HDR pipeline: scene -> half-float target -> bloom chain + sun shafts -> composite
// (ACES, Ghosts-style split-tone grade, vignette, grain, damage/EMP overlays) -> screen.

const fsVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const brightFrag = /* glsl */ `
uniform sampler2D tSrc;
uniform float uThreshold;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tSrc, vUv).rgb;
  float l = max(max(c.r, c.g), c.b);
  float k = smoothstep(uThreshold, uThreshold * 2.2, l);
  gl_FragColor = vec4(min(c * k, vec3(40.0)), 1.0);
}
`;

const downFrag = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec2 t = uTexel;
  vec3 c = texture2D(tSrc, vUv).rgb * 0.25;
  c += texture2D(tSrc, vUv + vec2(-t.x, -t.y)).rgb * 0.1875;
  c += texture2D(tSrc, vUv + vec2(t.x, -t.y)).rgb * 0.1875;
  c += texture2D(tSrc, vUv + vec2(-t.x, t.y)).rgb * 0.1875;
  c += texture2D(tSrc, vUv + vec2(t.x, t.y)).rgb * 0.1875;
  gl_FragColor = vec4(c, 1.0);
}
`;

const upFrag = /* glsl */ `
uniform sampler2D tSrc;
uniform sampler2D tBase;
uniform vec2 uTexel;
uniform float uWeight;
varying vec2 vUv;
void main() {
  vec2 t = uTexel;
  vec3 c = texture2D(tSrc, vUv + vec2(-t.x, 0.0)).rgb + texture2D(tSrc, vUv + vec2(t.x, 0.0)).rgb
         + texture2D(tSrc, vUv + vec2(0.0, -t.y)).rgb + texture2D(tSrc, vUv + vec2(0.0, t.y)).rgb;
  c = c * 0.25;
  gl_FragColor = vec4(texture2D(tBase, vUv).rgb + c * uWeight, 1.0);
}
`;

const shaftFrag = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uSun;
uniform float uStrength;
uniform float uAspect;
varying vec2 vUv;
void main() {
  vec2 d = (uSun - vUv) / 40.0;
  vec2 uv = vUv;
  vec3 acc = vec3(0.0);
  float w = 1.0;
  for (int i = 0; i < 40; i++) {
    // only light near the sun itself feeds the shafts (not lamps or muzzle flashes)
    vec2 q = (uv - uSun) * vec2(uAspect, 1.0);
    float m = smoothstep(0.32, 0.02, length(q));
    acc += texture2D(tSrc, uv).rgb * w * m;
    w *= 0.955;
    uv += d;
  }
  gl_FragColor = vec4(acc * uStrength / 40.0, 1.0);
}
`;

const compFrag = /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform sampler2D tShaft;
uniform float uExposure;
uniform float uBloom;
uniform float uShaft;
uniform float uTime;
uniform float uGrain;
uniform float uVignette;
uniform float uDamage;
uniform float uLowHealth;
uniform float uEmp;
uniform float uDowned;
uniform float uFlash;
uniform vec3 uFlashColor;
uniform float uPostOn;
uniform vec2 uRes;
varying vec2 vUv;

vec3 aces(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec3 toSRGB(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

void main() {
  vec2 uv = vUv;
  // EMP glitch: horizontal tearing
  if (uEmp > 0.0) {
    float band = step(0.93, hash(vec2(floor(uv.y * 40.0), floor(uTime * 18.0))));
    uv.x += (hash(vec2(uTime, uv.y)) - 0.5) * 0.04 * uEmp * band;
  }
  vec2 cc = uv - 0.5;
  float r2 = dot(cc, cc);
  // subtle lateral chromatic aberration toward the edges
  float ca = (0.0012 + uDamage * 0.004 + uEmp * 0.006) * r2 * 4.0;
  vec3 col;
  col.r = texture2D(tScene, uv + cc * ca).r;
  col.g = texture2D(tScene, uv).g;
  col.b = texture2D(tScene, uv - cc * ca).b;
  if (uPostOn > 0.5) {
    col += texture2D(tBloom, uv).rgb * uBloom;
    col += texture2D(tShaft, uv).rgb * uShaft;
  }
  col *= uExposure;
  col = aces(col);
  // grade: lifted, teal-violet shadows, warm peach highlights (Ghosts dusk)
  float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
  vec3 shadowTint = vec3(0.86, 0.92, 1.08);
  vec3 highTint = vec3(1.06, 0.99, 0.92);
  col *= mix(shadowTint, highTint, smoothstep(0.08, 0.7, luma));
  col = mix(vec3(luma), col, 0.9 - uLowHealth * 0.6 - uDowned * 0.5);
  col = (col - 0.5) * 1.06 + 0.5;
  col = max(col, 0.0) * 0.97 + 0.015;
  // vignette
  float vig = smoothstep(0.85, 0.25, length(cc * vec2(1.0, 0.85)));
  col *= mix(1.0, vig, uVignette);
  // damage / low-health red edge
  float edge = smoothstep(0.18, 0.75, length(cc));
  col = mix(col, vec3(0.45, 0.02, 0.02), edge * clamp(uDamage * 0.7 + uLowHealth * 0.45 + uDowned * 0.5, 0.0, 0.85));
  // EMP: blue scanlines
  if (uEmp > 0.0) {
    float scan = 0.5 + 0.5 * sin(uv.y * uRes.y * 1.4 + uTime * 30.0);
    col = mix(col, col * vec3(0.7, 0.9, 1.3) * (0.8 + 0.2 * scan), uEmp * 0.6);
  }
  // flash (power-up pickup, nuke)
  col = mix(col, uFlashColor, uFlash);
  // film grain
  float g = hash(uv * uRes + fract(uTime * 7.13) * 100.0) - 0.5;
  col += g * uGrain * (1.0 - luma * 0.5);
  gl_FragColor = vec4(toSRGB(clamp(col, 0.0, 1.0)), 1.0);
}
`;

function rt(w, h, type = THREE.HalfFloatType, samples = 0) {
  return new THREE.WebGLRenderTarget(w, h, {
    type, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    depthBuffer: true, samples, colorSpace: THREE.LinearSRGBColorSpace,
  });
}

export class PostFX {
  constructor(renderer) {
    this.renderer = renderer;
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.qScene = new THREE.Scene();
    this.qScene.add(this.quad);
    this.qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const mk = (frag, uniforms) => new THREE.ShaderMaterial({ vertexShader: fsVert, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
    this.mBright = mk(brightFrag, { tSrc: { value: null }, uThreshold: { value: 1.6 } });
    this.mDown = mk(downFrag, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.mUp = mk(upFrag, { tSrc: { value: null }, tBase: { value: null }, uTexel: { value: new THREE.Vector2() }, uWeight: { value: 1 } });
    this.mShaft = mk(shaftFrag, { tSrc: { value: null }, uSun: { value: new THREE.Vector2(0.5, 0.5) }, uStrength: { value: 1 }, uAspect: { value: 1 } });
    this.mComp = mk(compFrag, {
      tScene: { value: null }, tBloom: { value: null }, tShaft: { value: null },
      uExposure: { value: 1 }, uBloom: { value: 0.65 }, uShaft: { value: 0.0 }, uTime: { value: 0 }, uGrain: { value: 0.022 },
      uVignette: { value: 0.55 }, uDamage: { value: 0 }, uLowHealth: { value: 0 }, uEmp: { value: 0 }, uDowned: { value: 0 },
      uFlash: { value: 0 }, uFlashColor: { value: new THREE.Color(1, 1, 1) }, uPostOn: { value: 1 }, uRes: { value: new THREE.Vector2(1, 1) },
    });
    this.u = this.mComp.uniforms;
    this.bloomOn = true;
    this.shaftOn = true;
    this.msaa = 4;
    this.scale = 1;
    this.targets = null;
    this.sunScreen = new THREE.Vector2();
    this.sunVisible = 0;
  }

  configure({ bloom, godrays, msaa }) {
    this.bloomOn = bloom;
    this.shaftOn = godrays;
    if (this.msaa !== msaa) {
      this.msaa = msaa;
      this.dispose();
    }
    this.u.uPostOn.value = bloom || godrays ? 1 : 0;
  }

  dispose() {
    if (!this.targets) return;
    for (const t of Object.values(this.targets).flat()) t.dispose();
    this.targets = null;
  }

  _ensure(w, h) {
    if (this.targets && this.targets.w === w && this.targets.h === h) return;
    this.dispose();
    const levels = [];
    let lw = Math.max(1, w >> 1);
    let lh = Math.max(1, h >> 1);
    for (let i = 0; i < 5; i++) {
      levels.push(rt(lw, lh));
      lw = Math.max(1, lw >> 1);
      lh = Math.max(1, lh >> 1);
    }
    const ups = levels.slice(0, 4).map((l) => rt(l.width, l.height));
    this.targets = {
      w, h, scene: rt(w, h, THREE.HalfFloatType, this.msaa), levels, ups,
      shaft: rt(Math.max(1, w >> 2), Math.max(1, h >> 2)),
    };
    this.u.uRes.value.set(w, h);
  }

  _pass(mat, target) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.qScene, this.qCam);
  }

  // Render scene (+ optional overlay scene, e.g. the first-person weapon) through the chain.
  render(scene, camera, overlay, overlayCam, time) {
    const r = this.renderer;
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    const w = Math.max(2, Math.floor(size.x * this.scale));
    const h = Math.max(2, Math.floor(size.y * this.scale));
    this._ensure(w, h);
    const T = this.targets;
    const autoClear = r.autoClear;
    r.autoClear = false;
    r.setRenderTarget(T.scene);
    r.clear(true, true, true);
    r.render(scene, camera);
    if (overlay) {
      r.clearDepth();
      r.render(overlay, overlayCam);
    }
    r.autoClear = autoClear;
    if (this.bloomOn) {
      this.mBright.uniforms.tSrc.value = T.scene.texture;
      this._pass(this.mBright, T.levels[0]);
      for (let i = 1; i < T.levels.length; i++) {
        this.mDown.uniforms.tSrc.value = T.levels[i - 1].texture;
        this.mDown.uniforms.uTexel.value.set(1 / T.levels[i - 1].width, 1 / T.levels[i - 1].height);
        this._pass(this.mDown, T.levels[i]);
      }
      let src = T.levels[T.levels.length - 1];
      for (let i = T.levels.length - 2; i >= 0; i--) {
        this.mUp.uniforms.tSrc.value = src.texture;
        this.mUp.uniforms.tBase.value = T.levels[i].texture;
        this.mUp.uniforms.uTexel.value.set(1 / src.width, 1 / src.height);
        this.mUp.uniforms.uWeight.value = 0.85;
        this._pass(this.mUp, T.ups[i]);
        src = T.ups[i];
      }
      this.u.tBloom.value = T.ups[0].texture;
    } else {
      this.u.tBloom.value = T.scene.texture;
      this.u.uBloom.value = 0;
    }
    if (this.shaftOn && this.sunVisible > 0.01 && this.bloomOn) {
      this.mShaft.uniforms.tSrc.value = T.levels[1].texture;
      this.mShaft.uniforms.uSun.value.copy(this.sunScreen);
      this.mShaft.uniforms.uStrength.value = 1.0;
      this.mShaft.uniforms.uAspect.value = w / h;
      this._pass(this.mShaft, T.shaft);
      this.u.tShaft.value = T.shaft.texture;
      this.u.uShaft.value = 0.55 * this.sunVisible;
    } else {
      this.u.tShaft.value = T.scene.texture;
      this.u.uShaft.value = 0;
    }
    this.u.tScene.value = T.scene.texture;
    this.u.uTime.value = time;
    if (this.bloomOn) this.u.uBloom.value = this.bloomStrength ?? 0.6;
    this._pass(this.mComp, null);
  }

  // Track where the sun is on screen for the shaft pass.
  updateSun(camera, sunDir) {
    const p = new THREE.Vector3().copy(camera.position).addScaledVector(sunDir, 500);
    p.project(camera);
    const facing = new THREE.Vector3();
    camera.getWorldDirection(facing);
    const dot = facing.dot(sunDir);
    this.sunScreen.set(p.x * 0.5 + 0.5, p.y * 0.5 + 0.5);
    const onScreen = Math.abs(p.x) < 1.6 && Math.abs(p.y) < 1.6;
    this.sunVisible = onScreen && dot > 0 ? Math.min(1, dot * 1.6) * Math.max(0, Math.min(1, (sunDir.y + 0.06) * 8)) : 0;
  }
}
