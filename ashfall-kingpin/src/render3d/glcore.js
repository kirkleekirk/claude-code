// WebGL2 backend: shaders, primitive meshes, instance batches, render targets. No libraries.
// Everything solid is an instanced primitive (cube, gable prism along X or Z, 8-sided cylinder)
// with a 3x4 transform, a palette colour and a procedural material pattern evaluated in the
// fragment shader. The ground is the baked terrain chunks as textured quads.

export const PRIM = { CUBE: 0, PRISM_X: 1, PRISM_Z: 2, CYL: 3 };
export const PAT = { GRAIN: 0, PLANK: 1, CORR: 2, BRICK: 3, SHINGLE: 4, CONCRETE: 5, STRIPE: 6, ROCK: 7, WINDOW: 8, FLAT: 9, SOIL: 10 };
export const INST_FLOATS = 20;
export const MAX_LIGHTS = 16;

const COMMON = `
precision highp float;
precision highp sampler2DShadow;
uniform vec3 uSunDir, uSunCol, uAmbSky, uAmbGnd, uFogCol, uEye;
uniform vec2 uFog;
uniform vec4 uLP[${MAX_LIGHTS}];
uniform vec4 uLC[${MAX_LIGHTS}];
uniform int uLN;
uniform sampler2DShadow uShadow;
uniform vec2 uShadowP;
uniform float uNight;
const float BAYER[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
float bayer(vec2 p){ ivec2 i = ivec2(mod(floor(p), 4.0)); return (BAYER[i.x + i.y * 4] + 0.5) / 16.0; }
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float shadowAt(vec4 lp, float ndl){
  if (uShadowP.x < 0.5) return 1.0;
  vec3 sc = lp.xyz / lp.w * 0.5 + 0.5;
  if (sc.x <= 0.0 || sc.x >= 1.0 || sc.y <= 0.0 || sc.y >= 1.0 || sc.z >= 1.0) return 1.0;
  float bias = 0.0012 + 0.0035 * (1.0 - ndl);
  float t = uShadowP.y * 0.6, s = 0.0;
  s += texture(uShadow, vec3(sc.xy + vec2(-t, -t), sc.z - bias));
  s += texture(uShadow, vec3(sc.xy + vec2( t, -t), sc.z - bias));
  s += texture(uShadow, vec3(sc.xy + vec2(-t,  t), sc.z - bias));
  s += texture(uShadow, vec3(sc.xy + vec2( t,  t), sc.z - bias));
  return s * 0.25;
}
vec3 shade(vec3 albedo, vec3 n, vec3 wp, vec4 lp, float em){
  float ndl = max(dot(n, uSunDir), 0.0);
  float sh = ndl > 0.0 ? shadowAt(lp, ndl) : 1.0;
  vec3 l = mix(uAmbGnd, uAmbSky, n.y * 0.5 + 0.5) + uSunCol * ndl * sh;
  for (int i = 0; i < ${MAX_LIGHTS}; i++) {
    if (i >= uLN) break;
    vec3 d = uLP[i].xyz - wp;
    float dist = length(d);
    float att = max(0.0, 1.0 - dist / uLP[i].w);
    l += uLC[i].rgb * att * att * (0.35 + 0.65 * max(dot(n, d / max(dist, 0.01)), 0.0));
  }
  vec3 c = albedo * l;
  c = mix(c, albedo * 1.2 + 0.04, clamp(em, 0.0, 1.0));
  float f = clamp((length(wp - uEye) - uFog.x) / (uFog.y - uFog.x), 0.0, 1.0);
  return mix(c, uFogCol, f * f);
}`;

const INST_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNor;
layout(location=2) in vec4 iM0;
layout(location=3) in vec4 iM1;
layout(location=4) in vec4 iM2;
layout(location=5) in vec4 iCol;
layout(location=6) in vec4 iPar;
uniform mat4 uVP, uLVP;
uniform vec4 uHideA, uHideB;
out vec3 vW; out vec3 vN; out vec4 vCol; out vec3 vPar; out vec4 vLP;
void main(){
  vec4 p = vec4(aPos, 1.0);
  vec3 w = vec3(dot(iM0, p), dot(iM1, p), dot(iM2, p));
  vec3 c0 = vec3(iM0.x, iM1.x, iM2.x), c1 = vec3(iM0.y, iM1.y, iM2.y), c2 = vec3(iM0.z, iM1.z, iM2.z);
  vec3 ln = aNor / max(vec3(dot(c0, c0), dot(c1, c1), dot(c2, c2)), vec3(1e-6));
  float alpha = iCol.a;
  float bid = floor(iPar.z / 4.0 + 0.01), kind = iPar.z - bid * 4.0;
  if (bid > 0.5) {
    vec4 h = abs(bid - uHideA.x) < 0.5 ? uHideA : (abs(bid - uHideB.x) < 0.5 ? uHideB : vec4(0.0));
    if (h.x > 0.5) { if (kind > 1.5) alpha *= h.y; else w.y = min(w.y, mix(h.z, 48.0, h.y)); }
  }
  vW = w; vN = c0 * ln.x + c1 * ln.y + c2 * ln.z; vCol = vec4(iCol.rgb, alpha); vPar = iPar.xyw; vLP = uLVP * vec4(w, 1.0);
  gl_Position = uVP * vec4(w, 1.0);
}`;

const INST_FS = `#version 300 es
${COMMON}
in vec3 vW; in vec3 vN; in vec4 vCol; in vec3 vPar; in vec4 vLP;
uniform vec4 uSil;
out vec4 o;
vec3 pattern(vec3 base, float pat, vec3 wp, vec3 n, float flag){
  vec2 uv = abs(n.y) > 0.6 ? wp.xz : (abs(n.x) > 0.6 ? wp.zy : wp.xy);
  if (flag > 0.5 && abs(n.y) > 0.6) uv = uv.yx;
  vec2 c = floor(uv);
  float k = 1.0 + (hash(c) - 0.5) * 0.09;
  if (pat < 0.5) return base * k;
  if (pat < 1.5) { float m = mod(c.x, 4.0); k *= m < 1.0 ? 0.76 : 1.0 + (hash(vec2(floor(c.x / 4.0), 3.0)) - 0.5) * 0.14; }
  else if (pat < 2.5) { float m = mod(c.x, 3.0); k *= m < 1.0 ? 0.82 : (m < 2.0 ? 1.0 : 1.09); if (hash(floor(uv / 5.0)) > 0.93) k *= 0.8; }
  else if (pat < 3.5) { float row = floor(c.y / 4.0); float bx = c.x + mod(row, 2.0) * 4.0; if (mod(c.y, 4.0) < 1.0 || mod(bx, 8.0) < 1.0) k *= 0.74; else k *= 1.0 + (hash(vec2(floor(bx / 8.0), row)) - 0.5) * 0.16; }
  else if (pat < 4.5) { float row = floor(c.y / 5.0); if (mod(c.y, 5.0) < 1.0) k *= 0.7; else if (mod(c.x + row * 3.0, 6.0) < 1.0) k *= 0.84; else k *= 1.0 + (hash(vec2(floor((c.x + row * 3.0) / 6.0), row)) - 0.5) * 0.12; }
  else if (pat < 5.5) { if (mod(c.x, 16.0) < 1.0 || mod(c.y, 16.0) < 1.0) k *= 0.84; }
  else if (pat < 6.5) { if (mod(floor(c.x / 3.0), 2.0) < 1.0) return mix(base, vec3(0.93, 0.89, 0.80), 0.82) * k; }
  else if (pat < 7.5) { k *= 0.86 + 0.26 * hash(floor(uv / 3.0)); }
  else if (pat < 9.5) { return base; }
  else { float m = mod(c.y, 6.0); k *= m < 2.0 ? 0.72 : 1.0; }
  return base * k;
}
void main(){
  if (vCol.a < 0.999 && vCol.a <= bayer(gl_FragCoord.xy)) discard;
  if (uSil.a > 0.5) { if (bayer(gl_FragCoord.xy) > 0.55) discard; o = vec4(uSil.rgb, 1.0); return; }
  vec3 n = normalize(vN);
  float em = vPar.y >= 0.0 ? vPar.y : -vPar.y * uNight;
  float pat = floor(vPar.x + 0.5);
  vec3 base = vCol.rgb;
  if (pat == 8.0) { base = mix(base, vec3(1.0, 0.76, 0.40), uNight * vPar.z); em = max(em, uNight * vPar.z); }
  else base = pattern(base, pat, vW, n, vPar.z);
  o = vec4(shade(base, n, vW, vLP, em), 1.0);
}`;

const DEPTH_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=2) in vec4 iM0;
layout(location=3) in vec4 iM1;
layout(location=4) in vec4 iM2;
layout(location=5) in vec4 iCol;
layout(location=6) in vec4 iPar;
uniform mat4 uLVP;
uniform vec4 uHideA, uHideB;
void main(){
  vec4 p = vec4(aPos, 1.0);
  vec3 w = vec3(dot(iM0, p), dot(iM1, p), dot(iM2, p));
  float alpha = iCol.a;
  float bid = floor(iPar.z / 4.0 + 0.01), kind = iPar.z - bid * 4.0;
  if (bid > 0.5) {
    vec4 h = abs(bid - uHideA.x) < 0.5 ? uHideA : (abs(bid - uHideB.x) < 0.5 ? uHideB : vec4(0.0));
    if (h.x > 0.5) { if (kind > 1.5) alpha *= h.y; else w.y = min(w.y, mix(h.z, 48.0, h.y)); }
  }
  gl_Position = alpha < 0.5 ? vec4(2.0, 2.0, 2.0, 1.0) : uLVP * vec4(w, 1.0);
}`;
const DEPTH_FS = `#version 300 es
precision highp float;
void main(){}`;

const GROUND_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aUV;
uniform mat4 uVP, uLVP;
out vec3 vW; out vec2 vUV; out vec4 vLP;
void main(){ vW = aPos; vUV = aUV; vLP = uLVP * vec4(aPos, 1.0); gl_Position = uVP * vec4(aPos, 1.0); }`;
const GROUND_FS = `#version 300 es
${COMMON}
in vec3 vW; in vec2 vUV; in vec4 vLP;
uniform sampler2D uTex;
out vec4 o;
void main(){ vec3 t = texture(uTex, vUV).rgb; o = vec4(shade(t, vec3(0.0, 1.0, 0.0), vW, vLP, 0.0), 1.0); }`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(s));
  return s;
}

function program(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p));
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); const name = info.name.replace(/\[0\]$/, ''); u[name] = gl.getUniformLocation(p, name); }
  return { p, u };
}

// ---------- primitive meshes (unit volume [0,1]^3, CCW outward) ----------
function buildPrimitives() {
  const v = [];
  const ranges = [];
  const tri = (a, b, c, n) => { for (const p of [a, b, c]) v.push(p[0], p[1], p[2], n[0], n[1], n[2]); };
  const quad = (a, b, c, d, n) => { tri(a, b, c, n); tri(a, c, d, n); };
  let start = 0;
  const end = () => { ranges.push([start, v.length / 6 - start]); start = v.length / 6; };
  // Cube.
  quad([0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]);
  quad([1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, -1]);
  quad([1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 0]);
  quad([0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0], [-1, 0, 0]);
  quad([0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0], [0, 1, 0]);
  quad([0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1], [0, -1, 0]);
  end();
  // Gable prism, ridge along X at z = 0.5.
  quad([0, 0, 0], [0, 1, 0.5], [1, 1, 0.5], [1, 0, 0], [0, 0.5, -1]);
  quad([0, 0, 1], [1, 0, 1], [1, 1, 0.5], [0, 1, 0.5], [0, 0.5, 1]);
  tri([0, 0, 0], [0, 0, 1], [0, 1, 0.5], [-1, 0, 0]);
  tri([1, 0, 0], [1, 1, 0.5], [1, 0, 1], [1, 0, 0]);
  quad([0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1], [0, -1, 0]);
  end();
  // Gable prism, ridge along Z at x = 0.5.
  quad([0, 0, 0], [0, 0, 1], [0.5, 1, 1], [0.5, 1, 0], [-1, 0.5, 0]);
  quad([1, 0, 0], [0.5, 1, 0], [0.5, 1, 1], [1, 0, 1], [1, 0.5, 0]);
  tri([0, 0, 0], [0.5, 1, 0], [1, 0, 0], [0, 0, -1]);
  tri([0, 0, 1], [1, 0, 1], [0.5, 1, 1], [0, 0, 1]);
  quad([0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1], [0, -1, 0]);
  end();
  // Cylinder (8 sides, smooth side normals), axis Y.
  const N = 8;
  const P = (i, y) => { const a = (i / N) * Math.PI * 2; return [0.5 + 0.5 * Math.cos(a), y, 0.5 + 0.5 * Math.sin(a)]; };
  const NR = (i) => { const a = (i / N) * Math.PI * 2; return [Math.cos(a), 0, Math.sin(a)]; };
  for (let i = 0; i < N; i++) {
    const a = [P(i, 0), NR(i)], b = [P(i + 1, 0), NR(i + 1)], c = [P(i + 1, 1), NR(i + 1)], d = [P(i, 1), NR(i)];
    for (const q of [a, d, c, a, c, b]) v.push(q[0][0], q[0][1], q[0][2], q[1][0], q[1][1], q[1][2]);
    tri([0.5, 1, 0.5], P(i + 1, 1), P(i, 1), [0, 1, 0]);
    tri([0.5, 0, 0.5], P(i, 0), P(i + 1, 0), [0, -1, 0]);
  }
  end();
  return { data: new Float32Array(v), ranges };
}

// ---------- instance batch ----------
export class Batch {
  constructor(cap = 512) { this.d = [0, 1, 2, 3].map(() => new Float32Array(cap * INST_FLOATS)); this.n = [0, 0, 0, 0]; this.buf = null; }
  reset() { this.n[0] = this.n[1] = this.n[2] = this.n[3] = 0; }
  get count() { return this.n[0] + this.n[1] + this.n[2] + this.n[3]; }
  // Affine M (3x4) applied to a local box with min corner (x, y, z) and size (w, h, d).
  add(type, M, x, y, z, w, h, d, col, pat = 0, em = 0, alpha = 1, tag = 0, flag = 0) {
    let a = this.d[type];
    const i = this.n[type] * INST_FLOATS;
    if (i + INST_FLOATS > a.length) { const g = new Float32Array(a.length * 2); g.set(a); a = this.d[type] = g; }
    a[i] = M[0] * w; a[i + 1] = M[1] * h; a[i + 2] = M[2] * d; a[i + 3] = M[0] * x + M[1] * y + M[2] * z + M[3];
    a[i + 4] = M[4] * w; a[i + 5] = M[5] * h; a[i + 6] = M[6] * d; a[i + 7] = M[4] * x + M[5] * y + M[6] * z + M[7];
    a[i + 8] = M[8] * w; a[i + 9] = M[9] * h; a[i + 10] = M[10] * d; a[i + 11] = M[8] * x + M[9] * y + M[10] * z + M[11];
    a[i + 12] = col[0]; a[i + 13] = col[1]; a[i + 14] = col[2]; a[i + 15] = alpha;
    a[i + 16] = pat; a[i + 17] = em; a[i + 18] = tag; a[i + 19] = flag;
    this.n[type]++;
  }
}

export class GLCore {
  constructor(canvas) {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: true, stencil: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 not available');
    this.gl = gl;
    this.canvas = canvas;
    this.inst = program(gl, INST_VS, INST_FS);
    this.depth = program(gl, DEPTH_VS, DEPTH_FS);
    this.ground = program(gl, GROUND_VS, GROUND_FS);
    const prim = buildPrimitives();
    this.prim = prim.ranges;
    this.primBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.primBuf);
    gl.bufferData(gl.ARRAY_BUFFER, prim.data, gl.STATIC_DRAW);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
    for (let k = 2; k <= 6; k++) { gl.enableVertexAttribArray(k); gl.vertexAttribDivisor(k, 1); }
    gl.bindVertexArray(null);
    this.groundVao = gl.createVertexArray();
    this.target = null;
    this.shadow = this.makeShadow(1536);
    this.aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
  }

  makeShadow(size) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, size, size, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, tex, 0);
    gl.drawBuffers([gl.NONE]);
    gl.readBuffer(gl.NONE);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, fbo, size, ok };
  }

  // Low-resolution colour target for the chunky "pixel 3D" look (blitted with NEAREST).
  ensureTarget(w, h) {
    const gl = this.gl;
    if (this.target && this.target.w === w && this.target.h === h) return this.target;
    if (this.target) { gl.deleteTexture(this.target.tex); gl.deleteRenderbuffer(this.target.rb); gl.deleteFramebuffer(this.target.fbo); }
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    const rb = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.target = { tex, rb, fbo, w, h };
    return this.target;
  }

  texture(source, tex = null) {
    const gl = this.gl;
    const t = tex || gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (this.aniso) gl.texParameterf(gl.TEXTURE_2D, this.aniso.TEXTURE_MAX_ANISOTROPY_EXT, 4);
    return t;
  }

  staticBatch(batch) {
    const gl = this.gl;
    batch.buf = [0, 1, 2, 3].map((t) => {
      if (!batch.n[t]) return null;
      const b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, batch.d[t].subarray(0, batch.n[t] * INST_FLOATS), gl.STATIC_DRAW);
      return b;
    });
    batch.d = null;
    return batch;
  }

  uploadDynamic(batch) {
    const gl = this.gl;
    if (!batch.buf) batch.buf = [0, 1, 2, 3].map(() => gl.createBuffer());
    for (let t = 0; t < 4; t++) {
      if (!batch.n[t]) continue;
      gl.bindBuffer(gl.ARRAY_BUFFER, batch.buf[t]);
      gl.bufferData(gl.ARRAY_BUFFER, batch.d[t].subarray(0, batch.n[t] * INST_FLOATS), gl.DYNAMIC_DRAW);
    }
  }

  // Assumes this.vao is bound and an instanced program is in use.
  drawBatch(batch) {
    const gl = this.gl;
    if (!batch.buf) return;
    for (let t = 0; t < 4; t++) {
      if (!batch.n[t] || !batch.buf[t]) continue;
      gl.bindBuffer(gl.ARRAY_BUFFER, batch.buf[t]);
      for (let k = 0; k < 5; k++) gl.vertexAttribPointer(2 + k, 4, gl.FLOAT, false, INST_FLOATS * 4, k * 16);
      gl.drawArraysInstanced(gl.TRIANGLES, this.prim[t][0], this.prim[t][1], batch.n[t]);
    }
  }

  setLighting(prog, L) {
    const gl = this.gl, u = prog.u;
    gl.uniform3fv(u.uSunDir, L.sunDir); gl.uniform3fv(u.uSunCol, L.sunCol);
    gl.uniform3fv(u.uAmbSky, L.ambSky); gl.uniform3fv(u.uAmbGnd, L.ambGnd);
    gl.uniform3fv(u.uFogCol, L.fog); gl.uniform3fv(u.uEye, L.eye); gl.uniform2fv(u.uFog, L.fogRange);
    gl.uniform4fv(u.uLP, L.lp); gl.uniform4fv(u.uLC, L.lc); gl.uniform1i(u.uLN, L.ln);
    gl.uniform2f(u.uShadowP, L.shadows ? 1 : 0, 1 / this.shadow.size);
    gl.uniform1f(u.uNight, L.night);
    gl.uniform1i(u.uShadow, 1);
  }
}
