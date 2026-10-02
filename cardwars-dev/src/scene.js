/* SCENE */
// The 3D table: Finn and Jake's treehouse table with the holographic Card Wars board on top. Small creature
// holograms stand on big landscape tiles in front of big building holograms; the physical cards lie on the
// table edge and turn sideways (left = flooped, right = activated). WebGL for the world, a 2D canvas overlay
// for crisp numbers and labels. Engine state is synced in; the UI director calls the fx functions.
var Scene = (function () {
'use strict';
const M4 = GL3.M4, rgb = GL3.hexRGB, mix = GL3.mixRGB;

// ------------------------------------------------------------------ layout (world units, y up, P0 at +z)
// A huge battlefield: the troops keep their size, while the arena (and the room, table, props, cards and
// opponent around it) is built big, so attackers have a long march and you scroll and zoom to see it all.
const WK = 4.0;                                   // scale of the room, the table, the props, the cards and the opponent
const LS = 10.8, BW = LS * 2, BD = 18, TOP = 0.5;  // lane spacing, half width/depth of the arena, its top height
const LANE_X = l => (l - 1.5) * LS;
const SPOT = { c: 6.0, b: 13.2 };                 // creature / building spot distance from the center line
const OFF = { c: 1.5, b: 2.2 };                   // sideways offsets so a creature never hides behind its building
const BSIZE = 2.0;                                // buildings tower over the troops
const FXK = LS / 6.4;                             // board-wide spell effects grow with the arena
const CARD_W = 0.78 * WK, CARD_H = 1.09 * WK, CARD_DX = 0.52 * WK, CARD_Z = BD + 0.6 + CARD_H / 2;
const LANDCARD_Z = CARD_Z + CARD_H + 0.5;         // where the land cards lie until "floop your land cards"
const TABLE_W = 2 * BW + 7 * WK, TABLE_D = 2 * (LANDCARD_Z + CARD_H / 2 + 1.2), OPP_Z = TABLE_D / 2 + WK;
const RUN = 10, WALK = 7;                         // troop speeds in world units per second
const TEAMHEX = ['#3d8dff', '#ff9a2a'];
const TEAM = TEAMHEX.map(rgb);
const LANDC = { blue: '#5a8fd0', corn: '#d8c040', swamp: '#9a6ad0', ice: '#9ae0ff', nice: '#ff9ad0', lava: '#ff6a3a', rainbow: '#ffffff' };
const SIZE = { c: 1.0, b: 1.0 };
const sideZ = s => (s === 0 ? 1 : -1);

let ctx = null, gl = null, canvas = null, ov = null, oc = null;
let W = 1, H = 1, DPR = 1, quality = 1;
let progs = {}, statics = [], tiles = [], decor = [], ents = new Map(), cards = new Map(), landCards = [];
let texCache = {}, faceTex = new Map(), artCache = new Map(), artQueue = [], artListeners = [];
let st = null, viewer = 0, mode = 'match', insets = { top: 0, bottom: 0, left: 0, right: 0 };
let time = 0, reduceMotion = false, cbIcons = true, opponent = 'jake', oppEnt = null, kingdomShown = true;
let hl = [], sel = null, hoverPt = null, preview = null, dragGhost = null, arrows = [];
let particles = null, pCount = 0, ribbons = [], texts = [], flashes = [], bigs = [], shakeT = 0, shakeA = 0, hitstopT = 0;
let ptBuf = null, rbBuf = null, ptData = new Float32Array(8 * 3000), rbData = new Float32Array(7 * 6 * 1200);
const VP = M4.create(), IVP = M4.create(), PROJ = M4.create(), VIEW = M4.create(), TMP = M4.create(), MOD = M4.create();
const BONES = new Float32Array(16 * 8);
const cam = { yaw: 0, pitch: 0.95, dist: 14, tx: 0, ty: 0, tz: 0.4, fov: 0.72, eye: [0, 10, 10] };
const camGoal = { yaw: 0, pitch: 0.95, dist: 14, tx: 0, ty: 0, tz: 0.4 };
const user = { zoom: 1, yaw: 0, pitch: 0, px: 0, pz: 0 };
let camView = 'home', framePts = null, WPP = 0.02;   // 'home' (your side) | 'overview' | 'frame'; world units per pixel
let introT = -1, introCb = null, lost = false, ready = false, setupMode = false, artVersion = 0;
const stats = { draws: 0, tris: 0, ms: 0 };   // per-frame counters (perf checks)

// ------------------------------------------------------------------ shaders
const VS_MESH = `
attribute vec3 aPos; attribute vec3 aNrm; attribute vec3 aCol; attribute vec3 aOut; attribute vec2 aX;
uniform mat4 uVP; uniform mat4 uM; uniform mat4 uB[8];
uniform float uOutline; uniform float uTime; uniform float uSway;
varying vec3 vCol; varying vec3 vN; varying vec3 vW; varying float vG; varying float vY;
void main() {
  mat4 Bm = uB[int(aX.x + 0.5)];
  vec4 lp = Bm * vec4(aPos, 1.0);
  vY = aPos.y;
  vec4 wp = uM * lp;
  vec3 n = normalize((uM * (Bm * vec4(aNrm, 0.0))).xyz);
  if (uSway > 0.0) { float h = max(aPos.y, 0.0); wp.x += sin(uTime * 1.7 + wp.x * 1.3 + wp.z * 0.9) * uSway * h; wp.z += cos(uTime * 1.3 + wp.x * 0.7) * uSway * 0.6 * h; }
  if (uOutline > 0.0) { vec3 on = normalize((uM * (Bm * vec4(aOut, 0.0))).xyz); wp.xyz += on * uOutline; }
  vCol = aCol; vN = n; vW = wp.xyz; vG = aX.y;
  gl_Position = uVP * wp;
}`;
const FS_MESH = `
precision mediump float;
uniform float uIsOut; uniform float uHolo; uniform float uAlpha; uniform float uFT; uniform float uFlash;
uniform vec3 uOutCol; uniform vec3 uLight; uniform vec3 uCam; uniform vec4 uTint; uniform vec3 uRev; uniform vec3 uGlowCol;
varying vec3 vCol; varying vec3 vN; varying vec3 vW; varying float vG; varying float vY;
void main() {
  if (uRev.z > 0.5 && vY > uRev.x) discard;
  if (uIsOut > 0.5) {
    vec3 oc = uOutCol;
    if (uHolo > 0.5) oc *= 0.88 + 0.12 * sin(uFT * 5.0 + vW.y * 9.0);
    gl_FragColor = vec4(mix(oc, vec3(1.0), uFlash), uAlpha);
    return;
  }
  vec3 n = normalize(vN);
  vec3 c = vCol;
  float lum = dot(c, vec3(0.3, 0.55, 0.15));
  if (uTint.a > 0.0) c = mix(c, uTint.rgb * (0.32 + 0.95 * lum), uTint.a);
  if (vG < 0.5) {
    float d = dot(n, uLight);
    c *= d > 0.3 ? 1.0 : (d > -0.25 ? 0.8 : 0.66);
  } else if (uHolo > 0.5) {
    c = mix(c, uGlowCol, 0.35) * 1.15;
  }
  if (uHolo > 0.5) {
    vec3 v = normalize(uCam - vW);
    float rim = pow(1.0 - max(dot(n, v), 0.0), 2.2);
    c += uOutCol * rim * 0.5;
    c *= 0.93 + 0.07 * sin(vW.y * 70.0 - uFT * 5.0);
    if (uRev.z > 0.5) { float b = 1.0 - clamp((uRev.x - vY) / max(uRev.y, 0.001), 0.0, 1.0); c += uGlowCol * b * 1.5; }
  }
  c = mix(c, vec3(1.0), uFlash);
  gl_FragColor = vec4(c, uAlpha);
}`;
const VS_TEX = `
attribute vec3 aPos; attribute vec2 aUV; attribute float aS;
uniform mat4 uVP; uniform mat4 uM; varying vec2 vUV; varying float vS;
void main() { vUV = aUV; vS = aS; gl_Position = uVP * uM * vec4(aPos, 1.0); }`;
const FS_TEX = `
precision mediump float;
uniform sampler2D uTex; uniform vec4 uMul; uniform vec3 uAdd;
varying vec2 vUV; varying float vS;
void main() { vec4 t = texture2D(uTex, vUV); if (t.a < 0.02) discard; gl_FragColor = vec4(t.rgb * uMul.rgb * vS + uAdd * t.a, t.a * uMul.a); }`;
const VS_PT = `
attribute vec3 aPos; attribute vec4 aCol; attribute float aSize;
uniform mat4 uVP; uniform float uScale; varying vec4 vCol;
void main() { vec4 p = uVP * vec4(aPos, 1.0); gl_Position = p; gl_PointSize = clamp(aSize * uScale / p.w, 1.0, 64.0); vCol = aCol; }`;
const FS_PT = `precision mediump float; varying vec4 vCol; void main() { gl_FragColor = vCol; }`;
const VS_RB = `
attribute vec3 aPos; attribute vec4 aCol;
uniform mat4 uVP; varying vec4 vCol;
void main() { vCol = aCol; gl_Position = uVP * vec4(aPos, 1.0); }`;

const MESH_ATTR = [{ name: 'aPos', size: 3 }, { name: 'aNrm', size: 3 }, { name: 'aCol', size: 3 }, { name: 'aOut', size: 3 }, { name: 'aX', size: 2 }];
const TEX_ATTR = [{ name: 'aPos', size: 3 }, { name: 'aUV', size: 2 }, { name: 'aS', size: 1 }];
const PT_ATTR = [{ name: 'aPos', size: 3 }, { name: 'aCol', size: 4 }, { name: 'aSize', size: 1 }];
const RB_ATTR = [{ name: 'aPos', size: 3 }, { name: 'aCol', size: 4 }];

// ------------------------------------------------------------------ init
function init(cv, overlayCanvas) {
  canvas = cv; ov = overlayCanvas; oc = ov.getContext('2d');
  ctx = GL3.createContext(cv);
  if (!ctx) return false;
  gl = ctx.gl;
  progs.mesh = GL3.program(ctx, 'mesh', VS_MESH, FS_MESH, MESH_ATTR);
  progs.tex = GL3.program(ctx, 'tex', VS_TEX, FS_TEX, TEX_ATTR);
  progs.pt = GL3.program(ctx, 'pt', VS_PT, FS_PT, PT_ATTR);
  progs.rb = GL3.program(ctx, 'rb', VS_RB, FS_PT, RB_ATTR);
  ptBuf = GL3.buffer(ctx, new Float32Array(8 * 64), true);
  rbBuf = GL3.buffer(ctx, new Float32Array(7 * 64), true);
  particles = [];
  for (let i = 0; i < 16; i++) M4.identity(BONES.subarray(i % 8 * 16, i % 8 * 16 + 16));
  buildStatic();
  cv.addEventListener('webglcontextlost', e => { e.preventDefault(); ctx.lost = true; lost = true; }, false);
  cv.addEventListener('webglcontextrestored', () => { GL3.restore(ctx); GL3.resetBindings(); lost = false; faceTex.forEach(t => (t.dirty = true)); }, false);
  ready = true;
  return true;
}

// ------------------------------------------------------------------ canvas textures
function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function rnd(seed) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function floorTex() {
  const c = mkCanvas(512, 512), g = c.getContext('2d');
  g.fillStyle = '#d6d79a'; g.fillRect(0, 0, 512, 512);
  const r = rnd(7);
  for (let i = 0; i < 8; i++) {
    const y = i * 64;
    g.fillStyle = i % 2 ? '#cfd193' : '#dadc9f'; g.fillRect(0, y, 512, 64);
    g.strokeStyle = '#8c8f55'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, y + 1); g.lineTo(512, y + 1); g.stroke();
    let x = (r() * 300) | 0;
    while (x < 512) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 64); g.stroke(); x += 180 + ((r() * 200) | 0); }
    g.strokeStyle = 'rgba(120,124,70,0.35)'; g.lineWidth = 1.5;
    for (let k = 0; k < 3; k++) { const yy = y + 12 + r() * 40; g.beginPath(); g.moveTo(r() * 200, yy); g.bezierCurveTo(200, yy + 6, 330, yy - 6, 512, yy + r() * 6); g.stroke(); }
  }
  return c;
}
function wallTex() {
  const c = mkCanvas(256, 256), g = c.getContext('2d');
  g.fillStyle = '#b8a26a'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#ad9760' : '#c2ac74'; g.fillRect(i * 32, 0, 32, 256); g.strokeStyle = '#6e5a32'; g.lineWidth = 3; g.beginPath(); g.moveTo(i * 32 + 1, 0); g.lineTo(i * 32 + 1, 256); g.stroke(); }
  return c;
}
// Land tile textures: the board is a printed mat, flat cartoon colors with hand-drawn strokes.
const LAND_TEX = {
  blue: ['#6d95c4', '#5a83b4', '#8ab0dc'], corn: ['#a8a24a', '#948e3c', '#c2bb5e'], swamp: ['#7b5a3e', '#664a30', '#94704e'],
  ice: ['#b6e2f2', '#9dd2e8', '#d8f4ff'], nice: ['#f0a6c8', '#e090b8', '#ffc4de'], lava: ['#7c3020', '#62261a', '#a04428'],
  down: ['#5e5446', '#4e4538', '#706452'], scorch: ['#2e2622', '#241e1a', '#3a2f28'], mat: ['#465061', '#3d4656', '#525d70']
};
function landTex(type) {
  if (texCache['land:' + type]) return texCache['land:' + type];
  const c = mkCanvas(256, 256), g = c.getContext('2d'), P = LAND_TEX[type] || LAND_TEX.down, r = rnd(type.length * 97 + 3);
  g.fillStyle = P[0]; g.fillRect(0, 0, 256, 256);
  g.lineCap = 'round';
  for (let i = 0; i < 26; i++) {
    g.strokeStyle = i % 3 ? P[1] : P[2]; g.lineWidth = 2 + r() * 2;
    const x = r() * 256, y = r() * 256, l = 20 + r() * 40;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + l / 2, y - 6 + r() * 12, x + l, y + r() * 6 - 3); g.stroke();
  }
  if (type === 'corn') { g.strokeStyle = P[1]; g.lineWidth = 3; for (let y = 16; y < 256; y += 32) { g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(80, y + 6, 170, y - 6, 256, y); g.stroke(); } }
  if (type === 'swamp') { for (let i = 0; i < 5; i++) { g.fillStyle = 'rgba(40,24,40,0.45)'; g.beginPath(); g.ellipse(r() * 256, r() * 256, 14 + r() * 18, 7 + r() * 8, 0, 0, 6.3); g.fill(); } }
  if (type === 'ice') { g.strokeStyle = '#ffffff'; g.lineWidth = 1.5; for (let i = 0; i < 6; i++) { let x = r() * 256, y = r() * 256; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += r() * 40 - 20; y += r() * 40 - 20; g.lineTo(x, y); } g.stroke(); } }
  if (type === 'nice') { for (let i = 0; i < 30; i++) { g.fillStyle = ['#ffffff', '#ff6aa8', '#8ae07a', '#ffe06a'][i % 4]; g.beginPath(); g.arc(r() * 256, r() * 256, 2 + r() * 2.5, 0, 6.3); g.fill(); } }
  if (type === 'lava') { g.strokeStyle = '#ff8a2a'; g.lineWidth = 2.5; for (let i = 0; i < 7; i++) { let x = r() * 256, y = r() * 256; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 3; k++) { x += r() * 50 - 25; y += r() * 50 - 25; g.lineTo(x, y); } g.stroke(); } }
  if (type === 'mat') { g.fillStyle = 'rgba(255,255,255,0.06)'; for (let y = 8; y < 256; y += 22) for (let x = (y / 22 % 2) * 11 + 6; x < 256; x += 22) { g.beginPath(); g.arc(x, y, 2.2, 0, 6.3); g.fill(); } }
  if (type === 'down') { g.strokeStyle = 'rgba(30,24,16,0.5)'; g.lineWidth = 2; for (let i = 0; i < 18; i++) { const x = r() * 256, y = r() * 256; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 8, y + 3); g.stroke(); } }
  if (type === 'scorch') { for (let i = 0; i < 24; i++) { g.fillStyle = 'rgba(255,' + (90 + (r() * 80 | 0)) + ',30,' + (0.3 + r() * 0.5) + ')'; g.beginPath(); g.arc(r() * 256, r() * 256, 1 + r() * 2, 0, 6.3); g.fill(); } }
  const t = GL3.texture(ctx, c, { repeat: true });
  texCache['land:' + type] = t;
  return t;
}
function labelTex(key, w, h, draw) {
  if (texCache[key]) return texCache[key];
  const c = mkCanvas(w, h), g = c.getContext('2d');
  draw(g, w, h);
  return (texCache[key] = GL3.texture(ctx, c, {}));
}
// The red Card Wars card back: white border, flames, "CW".
function cardBackCanvas(w, h) {
  const c = mkCanvas(w, h), g = c.getContext('2d');
  g.fillStyle = '#ffffff'; roundRect(g, 0, 0, w, h, w * 0.06); g.fill();
  g.fillStyle = '#c4161c'; roundRect(g, w * 0.05, w * 0.05, w * 0.9, h - w * 0.1, w * 0.04); g.fill();
  g.save(); g.beginPath(); roundRect(g, w * 0.05, w * 0.05, w * 0.9, h - w * 0.1, w * 0.04); g.clip();
  for (let i = 0; i < 9; i++) { g.fillStyle = i % 2 ? '#ff7a1a' : '#ffb02a'; const x = w * (0.05 + i * 0.11); g.beginPath(); g.moveTo(x - w * 0.08, h); g.quadraticCurveTo(x - w * 0.02, h * 0.62, x + w * 0.02, h * (0.48 + (i % 3) * 0.06)); g.quadraticCurveTo(x + w * 0.04, h * 0.7, x + w * 0.1, h); g.fill(); }
  g.restore();
  g.font = 'bold ' + Math.round(w * 0.36) + 'px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = w * 0.03; g.strokeStyle = '#5a0606'; g.strokeText('CW', w / 2, h * 0.42);
  g.fillStyle = '#ffe14a'; g.fillText('CW', w / 2, h * 0.42);
  return c;
}
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

// ------------------------------------------------------------------ static scene
function meshFrom(builder) { const m = builder.finish(); return { buf: GL3.buffer(ctx, m.data), count: m.count }; }
function texMesh(verts) { return { buf: GL3.buffer(ctx, new Float32Array(verts)), count: verts.length / 6 }; }
function texQuad(x0, y0, z0, ax, ay, az, bx, by, bz, u0, v0, u1, v1, shade) {
  // corner (x0,y0,z0), edge a (u direction), edge b (v direction)
  const s = shade == null ? 1 : shade;
  const p = (i, j) => [x0 + ax * i + bx * j, y0 + ay * i + by * j, z0 + az * i + bz * j, u0 + (u1 - u0) * i, v0 + (v1 - v0) * j, s];
  const a = p(0, 0), b = p(1, 0), c = p(1, 1), d = p(0, 1);
  return [].concat(a, b, c, a, c, d);
}
function buildStatic() {
  statics = [];
  // floor and back wall (textured)
  const FY = -6.2 * WK, FR = 40 * WK;
  const fl = texMesh(texQuad(-FR, FY, FR, FR * 2, 0, 0, 0, 0, -FR * 2, 0, 0, 10, 10, 1));
  statics.push({ kind: 'tex', mesh: fl, tex: GL3.texture(ctx, floorTex, { repeat: true }), mul: [1, 1, 1, 1] });
  const wv = [];
  const WR = 22 * WK, segs = 16;
  for (let i = 0; i < segs; i++) {
    const a0 = Math.PI * (0.15 + 0.7 * i / segs), a1 = Math.PI * (0.15 + 0.7 * (i + 1) / segs);
    const x0 = Math.cos(a0) * WR, z0 = -Math.sin(a0) * WR + 6 * WK, x1 = Math.cos(a1) * WR, z1 = -Math.sin(a1) * WR + 6 * WK;
    wv.push(...texQuad(x0, FY, z0, x1 - x0, 0, z1 - z0, 0, 24 * WK, 0, i, 0, i + 1, 3, 0.9));
  }
  statics.push({ kind: 'tex', mesh: texMesh(wv), tex: GL3.texture(ctx, wallTex, { repeat: true }), mul: [1, 1, 1, 1] });
  // table: dark green top with a lighter rim, grey folding legs
  const t = new Models.Builder();
  const tw = TABLE_W / 2, td = TABLE_D / 2;
  const K = WK;
  t.c('#2f6e33').at(0, -0.14 * K, 0, q => q.box(TABLE_W, 0.28 * K, TABLE_D));
  t.c('#4f9a4c').at(0, -0.02 * K, td - 0.02 * K, q => q.box(TABLE_W, 0.06 * K, 0.08 * K)).at(0, -0.02 * K, -td + 0.02 * K, q => q.box(TABLE_W, 0.06 * K, 0.08 * K)).at(tw - 0.02 * K, -0.02 * K, 0, q => q.box(0.08 * K, 0.06 * K, TABLE_D)).at(-tw + 0.02 * K, -0.02 * K, 0, q => q.box(0.08 * K, 0.06 * K, TABLE_D));
  t.c('#8f989c');
  for (const [x, z] of [[-tw + 0.9 * K, td - 0.8 * K], [tw - 0.9 * K, td - 0.8 * K], [-tw + 0.9 * K, -td + 0.8 * K], [tw - 0.9 * K, -td + 0.8 * K]]) t.at(x, -3.2 * K, z, q => q.cyl(0.12 * K, 0.12 * K, 6.0 * K, 8));
  t.at(-tw + 0.9 * K, -2.6 * K, 0, q => q.box(0.1 * K, 0.1 * K, TABLE_D - 1.6 * K)).at(tw - 0.9 * K, -2.6 * K, 0, q => q.box(0.1 * K, 0.1 * K, TABLE_D - 1.6 * K));
  statics.push({ kind: 'mesh', mesh: meshFrom(t), outline: 0.035 * K, outCol: [0.08, 0.12, 0.08] });
  // board slab
  const s = new Models.Builder();
  s.c('#3c4552').at(0, TOP / 2 - 0.01, 0, q => q.box(BW * 2 + 0.8, TOP, BD * 2 + 0.8));
  s.c('#5b6676').at(0, TOP - 0.005, 0, q => q.box(BW * 2 + 0.6, 0.01, 0.16));
  statics.push({ kind: 'mesh', mesh: meshFrom(s), outline: 0.03 * WK, outCol: [0.05, 0.06, 0.08] });
  // props, as in the episode: Total Soda, COOL GUY cup, DWEEB mug, Crunch chips, the card box, a sandwich plate
  const xe = d => BW + d * WK;   // just off the arena's side edge
  const zb = z => z * BD / 15;
  const props = [['soda', -xe(1.9), zb(-5.0), 0.9, 0.3], ['coolcup', -xe(1.4), zb(-10.0), 0.85, 0], ['dweeb', xe(1.9), zb(-9.0), 0.9, 2.6], ['chips', -xe(2.2), zb(10.0), 1.2, 0.6], ['cardbox', -xe(2.0), zb(2.6), 1.15, 0.2], ['plate', xe(2.2), zb(1.8), 1.2, 0.4]];
  const P = id => props.find(x => x[0] === id);
  for (const [id, x, z, s2, ry] of props) {
    const m = Models.build(id);
    statics.push({ kind: 'mesh', mesh: { buf: GL3.buffer(ctx, m.data), count: m.count }, outline: 0.03 * WK, outCol: [0.1, 0.08, 0.06], m: M4.trs(M4.create(), x, 0, z, ry, 0, 0, s2 * WK, s2 * WK, s2 * WK) });
  }
  // prop labels (TOTAL SODA, COOL GUY, DWEEB, CRUNCH)
  const lab = (key, txt, col, bg, w, h, fs) => labelTex(key, w, h, (g, ww, hh) => { if (bg) { g.fillStyle = bg; g.fillRect(0, 0, ww, hh); } g.font = 'bold ' + fs + 'px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = col; txt.split('\n').forEach((t2, i, a) => g.fillText(t2, ww / 2, hh / 2 + (i - (a.length - 1) / 2) * fs * 1.05)); });
  statics.push({ kind: 'tex', mesh: texMesh(curvedLabel(P('soda')[1], P('soda')[2], 0.9 * WK, 0.3, 0.33, 0.42, 0.95)), tex: lab('l:soda', 'TOTAL\nSODA', '#2a7a1a', '#ffffff', 128, 96, 34), mul: [1, 1, 1, 1] });
  statics.push({ kind: 'tex', mesh: texMesh(curvedLabel(P('coolcup')[1], P('coolcup')[2], 0.85 * WK, 0, 0.27, 0.42, 0.75)), tex: lab('l:cool', 'COOL\nGUY', '#1a1a1a', null, 128, 96, 34), mul: [1, 1, 1, 1] });
  statics.push({ kind: 'tex', mesh: texMesh(curvedLabel(P('dweeb')[1], P('dweeb')[2], 0.9 * WK, 2.6 + Math.PI, 0.33, 0.28, 0.6)), tex: lab('l:dweeb', 'DWEEB', '#1a1a1a', null, 160, 64, 40), mul: [1, 1, 1, 1] });
  statics.push({ kind: 'tex', mesh: texMesh(texQuad(P('chips')[1] - 0.42 * WK, 0.18 * WK, P('chips')[2] + 0.18 * WK, 0.84 * WK, 0, 0.0, 0, 0.18 * WK, 0.2 * WK, 0, 1, 1, 0, 1)), tex: lab('l:chips', 'CRUNCH', '#ffe14a', null, 160, 48, 36), mul: [1, 1, 1, 1] });
  buildTiles();
}
// A label wrapped around a cylinder (bottle/cup) facing the camera side.
function curvedLabel(x, z, s, ry, r, y0, hgt) {
  const v = [], n = 6, arc = 1.6;
  for (let i = 0; i < n; i++) {
    const a0 = -arc / 2 + arc * i / n + ry, a1 = -arc / 2 + arc * (i + 1) / n + ry;
    const p = a => [x + Math.sin(a) * r * s * 1.02, z + Math.cos(a) * r * s * 1.02];
    const A = p(a0), Bq = p(a1);
    v.push(...texQuad(A[0], y0 * s, A[1], Bq[0] - A[0], 0, Bq[1] - A[1], 0, hgt * s * 0.5, 0, i / n, 1, (i + 1) / n, 0, 1));
  }
  return v;
}

// ------------------------------------------------------------------ board tiles & landscape holograms
function waveX(l, z) { return (l - 2) * LS + Math.sin(z * 1.6 + l * 1.7) * 0.08; }   // wavy boundary between lane l-1 and l
function buildTiles() {
  tiles = [];
  for (let side = 0; side < 2; side++) for (let lane = 0; lane < 4; lane++) {
    const v = [], zs = side === 0 ? [0.04, BD] : [-BD, -0.04];
    const NZ = 8;
    for (let k = 0; k < NZ; k++) {
      const z0 = zs[0] + (zs[1] - zs[0]) * k / NZ, z1 = zs[0] + (zs[1] - zs[0]) * (k + 1) / NZ;
      const xl0 = lane === 0 ? -BW : waveX(lane, z0) + 0.03, xl1 = lane === 0 ? -BW : waveX(lane, z1) + 0.03;
      const xr0 = lane === 3 ? BW : waveX(lane + 1, z0) - 0.03, xr1 = lane === 3 ? BW : waveX(lane + 1, z1) - 0.03;
      const y = TOP + 0.012;
      const uv = (x, z) => [x / (2.4 * WK), z / (2.4 * WK)];
      const A = [xl0, y, z0, ...uv(xl0, z0), 1], Bq = [xr0, y, z0, ...uv(xr0, z0), 1], C = [xr1, y, z1, ...uv(xr1, z1), 1], D = [xl1, y, z1, ...uv(xl1, z1), 1];
      v.push(...A, ...Bq, ...C, ...A, ...C, ...D);
    }
    tiles.push({ side, lane, mesh: texMesh(v), type: null, down: null, decor: null, decorS: 1, decorGoal: 1, glow: 0 });
  }
}
function tileOf(side, lane) { return tiles[side * 4 + lane]; }
function decorMesh(type, side, lane) {
  const b = new Models.Builder(), r = rnd(side * 31 + lane * 7 + type.length * 13 + 1);
  const cz = sideZ(side) * (BD / 2);
  const sz = sideZ(side);
  const exC = [sz * OFF.c, sz * SPOT.c - cz], exB = [-sz * OFF.b, sz * SPOT.b - cz];
  const spots = [];
  const N = { corn: 220, blue: 240, swamp: 104, ice: 104, nice: 104, lava: 86 }[type] || 130;
  const DK = 2.2;   // terrain props are big next to the troops: corn stalks, grass tufts, ice spikes, candy, rocks
  for (let i = 0, tries = 0; i < N && tries < 4800; tries++) {
    const x = (r() - 0.5) * (LS - 0.6), z = (r() - 0.5) * (BD - 0.6);
    if (Math.hypot(x - exC[0], z - exC[1]) < 1.8 || Math.hypot(x - exB[0], z - exB[1]) < 3.4) continue;
    spots.push([x, z]); i++;
  }
  b.g(1);
  for (const [x, z] of spots) {
    const h = 0.12 + r() * 0.14, ry = r() * 360;
    b.push().T(x, 0, z).R(0, ry, 0).S(DK);
    if (type === 'corn') {
      b.c('#e8d23a').at(0, h / 2, 0, q => q.cyl(0.01, 0.014, h, 4, { capTop: false, capBot: false }));
      b.c('#d8e04a'); for (let k = 0; k < 3; k++) b.push().T(0, h * (0.35 + k * 0.2), 0).R(0, k * 120, -55 - k * 8).box(0.012, 0.11, 0.03).pop();
      b.c('#ffe85a').at(0.025, h * 0.72, 0, q => q.ell(0.018, 0.04, 0.018, 4, 3));
    } else if (type === 'blue') {
      b.c(r() < 0.5 ? '#5ab0ff' : '#3a8ae8'); for (let k = 0; k < 4; k++) b.push().R((r() - 0.5) * 30, k * 90, (r() - 0.5) * 30).T(0, h * 0.4, 0).cone(0.014, h * 0.9, 3).pop();
    } else if (type === 'swamp') {
      const k = r();
      if (k < 0.3) b.c('#5a3a2a').g(0).tube([[0, 0, 0], [0.02, 0.12, 0.01], [0.06, 0.2, 0.0], [0.03, 0.26, 0.03]], 0.012, 4).g(1);
      else if (k < 0.5) b.c('#2a1a2a').g(0).at(0, 0.004, 0, q => q.ell(0.14, 0.008, 0.08, 8, 2)).g(1);
      else b.c(r() < 0.5 ? '#e07aff' : '#7ae0c0').at(0, 0.18 + r() * 0.25, 0, q => q.sph(0.016, 4, 3));
    } else if (type === 'ice') {
      b.c(r() < 0.5 ? '#bff4ff' : '#7ad8ff').push().R((r() - 0.5) * 30, 0, (r() - 0.5) * 30).T(0, h * 0.5, 0).cyl(0.025, 0.04, h * 1.2, 6).T(0, h * 0.6, 0).cone(0.025, 0.05, 6).pop();
    } else if (type === 'nice') {
      if (r() < 0.5) { b.c('#ffffff').at(0, 0.08, 0, q => q.cyl(0.006, 0.006, 0.16, 3)); b.c(['#ff5aa0', '#7ae06a', '#ffd84a'][(r() * 3) | 0]).at(0, 0.17, 0, q => q.R(90, 0, 0).cyl(0.045, 0.045, 0.012, 8)); }
      else b.c(['#ff5aa0', '#7ae06a', '#7ab8ff'][(r() * 3) | 0]).at(0, 0, 0, q => q.lathe([[0.05, 0], [0.04, 0.04], [0, 0.06]], 6));
    } else if (type === 'lava') {
      if (r() < 0.5) b.c('#3a1a12').g(0).at(0, 0.02, 0, q => q.ell(0.07, 0.04, 0.06, 5, 3)).g(1);
      else { b.c('#ff6a1a').at(0, 0, 0, q => q.lathe([[0.03, 0], [0.025, 0.06], [0, 0.14]], 5)); b.c('#ffd84a').at(0, 0, 0.005, q => q.lathe([[0.016, 0], [0.012, 0.04], [0, 0.08]], 4)); }
    }
    b.pop();
  }
  const m = b.finish();
  return { buf: GL3.buffer(ctx, m.data), count: m.count };
}
function syncTiles(s) {
  for (const t of tiles) {
    const L = s ? s.players[t.side].lanes[t.lane].land : { type: 'blue', down: false };
    const key = L.down ? (L.scorch ? 'scorch' : 'down') : L.type;
    if (t.type !== key) {
      const prev = t.type;
      t.type = key; t.down = !!L.down;
      if (!L.down) {
        if (t.decor) GL3.freeBuffer(ctx, t.decor.buf);
        t.decor = decorMesh(L.type, t.side, t.lane);
        t.decorS = prev ? 0 : t.decorS; t.decorGoal = 1;
      } else t.decorGoal = 0;
    }
  }
}

// ------------------------------------------------------------------ positions
function spotPos(side, lane, slot) { const s = sideZ(side); return slot === 'b' ? [LANE_X(lane) - s * OFF.b, TOP, s * SPOT.b] : [LANE_X(lane) + s * OFF.c, TOP, s * SPOT.c]; }
function cardPos(side, lane, slot) { const s = sideZ(side); return [LANE_X(lane) + s * (slot === 'b' ? -CARD_DX : CARD_DX), 0.012, s * CARD_Z]; }
function deckPos(side, which) { const s = sideZ(side); return which === 'discard' ? [s * (BW + 2.33 * WK), 0.01, s * (CARD_Z - 1.08 * WK)] : [s * (BW + 1.33 * WK), 0.01, s * CARD_Z]; }
function baseYaw(side, face) {
  // a diorama: everyone is turned three-quarters toward the camera; animals show their profile
  const near = side === viewer;
  let y = near ? (face === 'side' ? 1.25 : 0.62) : (face === 'side' ? -1.05 : -0.32);
  return y + (viewer === 1 ? Math.PI : 0);
}

// ------------------------------------------------------------------ entities (holograms)
function entKey(kind, uid) { return kind + uid; }
function makeEnt(kind, side, lane, uid, id, how) {
  const cd = (typeof Engine !== 'undefined' && Engine.CARDS[id]) || { art: id };
  const art = cd.art || id;
  const model = Models.build(art);
  const tag = Models.tag(art);
  const want = kind === 'b' ? (tag.h || 1.4) * BSIZE : (tag.h || 0.6) * 1.45;
  const sc = want / Math.max(0.2, model.h);
  const p = spotPos(side, lane, kind);
  const e = { key: entKey(kind, uid), kind, side, lane, uid, id, art, model, tag, scale: sc, pos: p.slice(), goal: p.slice(),
    yaw: baseYaw(side, tag.face), yawGoal: baseYaw(side, tag.face), buf: null, rev: how === 'instant' ? 1 : 0, revSp: how === 'build' ? 0.8 : 1.4,
    alpha: 1, flash: 0, walk: 0, walking: 0, lunge: 0, lungeDir: [0, 0, 0], hop: 0, dying: 0, dead: false, hidden: false,
    pose: 0, poseGoal: 0, glow: 0, inside: 0, insideGoal: 0, nap: false, fl: false, act: false, frozen: false, collapsed: false, bob: Math.random() * 6 };
  e.buf = GL3.buffer(ctx, model.data);
  e.count = model.count;
  return e;
}
function dropEnt(e) { if (e.buf) GL3.freeBuffer(ctx, e.buf); e.buf = null; }

// Sync holograms and table cards with an engine state (snapshot).
function setState(s, opts) {
  st = s;
  syncTiles(s);
  if (!s) { ents.forEach(dropEnt); ents.clear(); cards.clear(); return; }
  const seen = new Set();
  for (let side = 0; side < 2; side++) for (let lane = 0; lane < 4; lane++) {
    const L = s.players[side].lanes[lane];
    for (const kind of ['c', 'b']) {
      const x = kind === 'c' ? L.creature : L.building;
      if (!x) continue;
      if (s.phase === 'setup' && !x.kingdom && side !== viewer && !(opts && opts.reveal)) continue;   // enemy kingdom still hidden
      const key = entKey(kind, x.uid);
      seen.add(key);
      let e = ents.get(key);
      const id = x.hidden ? (side === viewer ? x.id : '?trap') : x.id;
      if (!e || e.id !== id) {
        if (e) dropEnt(e);
        e = makeEnt(kind, side, lane, x.uid, id === '?trap' ? 'trap' : id, (opts && opts.instant) || kingdomShown === false ? 'instant' : (kind === 'b' ? 'build' : 'summon'));
        if (opts && opts.instant) e.rev = 1;
        ents.set(key, e);
      }
      if (e.side !== side || e.lane !== lane) {
        const from = e.pos.slice();
        e.speed = e.side !== side ? RUN : WALK;   // switching sides is a long run across the field
        e.side = side; e.lane = lane; e.goal = spotPos(side, lane, kind); e.walking = 1; e.path = null; e.strikeDir = null;
        e.yawGoal = Math.atan2(e.goal[0] - from[0], e.goal[2] - from[2]);
      }
      if (kind === 'c') {
        const stats = Engine.cStats(s, side, lane);
        e.stats = stats; e.c = x;
        e.fl = !!x.fl; e.act = !!x.act; e.frozen = !!x.frozen; e.nap = !!x.nap;
        e.insideGoal = x.inside ? 1 : 0;
        e.collapsed = Engine.CARDS[x.id] && Engine.CARDS[x.id].kw.cornPower && stats.atk <= 0;
        e.poseGoal = e.collapsed ? 1 : 0;
      } else { e.b = x; e.hp = Engine.bDef(x) - x.dmg; e.max = Engine.bDef(x); }
      // its physical card on the table
      let cdc = cards.get(key);
      if (!cdc) { cdc = { key, id, side, lane, slot: kind, pos: cardPos(side, lane, kind), rot: 0, rotGoal: 0, lift: 0, faceUp: !x.hidden || side === viewer, flip: 0 }; cards.set(key, cdc); }
      cdc.id = id; cdc.side = side; cdc.lane = lane; cdc.goalPos = cardPos(side, lane, kind);
      cdc.faceUp = !x.hidden || side === viewer;
      cdc.rotGoal = kind === 'c' ? (x.act ? -Math.PI / 2 : x.fl ? Math.PI / 2 : 0) : (x.fl ? Math.PI / 2 : 0);
    }
  }
  ents.forEach((e, k) => { if (!seen.has(k) && !e.dying) { e.dying = 0.001; e.quiet = true; } });
  cards.forEach((c, k) => { if (!seen.has(k)) cards.delete(k); });
}

// ------------------------------------------------------------------ camera
function setInsets(i) { insets = Object.assign({ top: 0, bottom: 0, left: 0, right: 0 }, i); fitCamera(); }
function resize(w, h, dpr) {
  W = w; H = h; DPR = Math.min(dpr || 1, 2) * quality;
  canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  ov.width = Math.round(W * Math.min(dpr || 1, 2)); ov.height = Math.round(H * Math.min(dpr || 1, 2));
  ov.style.width = W + 'px'; ov.style.height = H + 'px';
  fitCamera();
}
function setQuality(q) { quality = q; resize(W, H, window.devicePixelRatio || 1); }
function camMatrices(c, aspect, out) {
  const cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
  const eye = [c.tx + Math.sin(c.yaw) * cp * c.dist, c.ty + sp * c.dist, c.tz + Math.cos(c.yaw) * cp * c.dist];
  M4.perspective(PROJ, c.fov, aspect, Math.max(0.4, Math.min(6, c.dist * 0.04)), c.dist + 80 * WK);   // near plane follows the distance (depth precision)
  M4.lookAt(VIEW, eye, [c.tx, c.ty, c.tz], [0, 1, 0]);
  M4.mul(out, PROJ, VIEW);
  return eye;
}
// Camera views: 'home' frames your side of the arena (close enough that troops are readable - scroll for the
// rest), 'overview' frames the whole battlefield, 'frame' frames whatever the UI needs (e.g. every valid
// target). The user's scroll / zoom / orbit offsets ride on top of the view.
function viewPts(v) {
  const sz = sideZ(viewer), view = v || camView;
  if (mode === 'home') return [[-TABLE_W / 2, 0, TABLE_D / 2], [TABLE_W / 2, 0, TABLE_D / 2], [-TABLE_W / 2, 0, -TABLE_D / 2], [TABLE_W / 2, 0, -TABLE_D / 2], [0, 3.6 * WK, -OPP_Z - 0.3 * WK]];
  if (view === 'frame' && framePts) return framePts;
  const cards = [[-BW + 1.5, 0, sz * (CARD_Z + CARD_H * 0.25)], [BW - 1.5, 0, sz * (CARD_Z + CARD_H * 0.25)]];
  if (view === 'home') return [[-BW - 0.3, TOP, sz * (BD + 0.3)], [BW + 0.3, TOP, sz * (BD + 0.3)], [-BW - 0.3, TOP, -sz * (SPOT.c + 1.0)], [BW + 0.3, TOP, -sz * (SPOT.c + 1.0)]].concat(cards);
  return [[-BW - 0.3, TOP, BD + 0.3], [BW + 0.3, TOP, BD + 0.3], [-BW - 0.3, TOP, -BD - 0.3], [BW + 0.3, TOP, -BD - 0.3],
    [-BW + 2, TOP + 1.4 * BSIZE + 0.6, -sz * SPOT.b], [BW - 2, TOP + 1.4 * BSIZE + 0.6, -sz * SPOT.b]].concat(cards);
}
function fitCamera() {
  if (!W || !H) return;
  // a framed view only ever pulls back: it never zooms in past your home view
  const minDist = mode !== 'home' && camView === 'frame' ? solveCam(viewPts('home'), true, 0).dist : 0;
  const c = solveCam(viewPts(), mode !== 'home' && camView === 'home', minDist);
  camGoal.yaw = c.yaw; camGoal.pitch = c.pitch; camGoal.dist = c.dist; camGoal.tx = c.tx; camGoal.ty = c.ty; camGoal.tz = c.tz; cam.fov = c.fov;
  if (!cam.init) { Object.assign(cam, camGoal); cam.init = true; }
  clampPan(user.px, user.pz);
}
function solveCam(pts, troopClamp, minDist) {
  const aspect = W / H;
  const vt = insets.top / H, vb = insets.bottom / H, vl = insets.left / W, vr = insets.right / W;
  // the free area's shape decides the tilt: tall phone screens look down steeply so the arena fills the height,
  // wide desktop screens look across the field so it fills the width
  const fa = (W * (1 - vl - vr)) / Math.max(1, H * (1 - vt - vb));
  const tall = fa < 0.9;
  const pitch = mode === 'home' ? 0.62 : Math.max(0.8, Math.min(1.25, 1.42 - 0.22 * fa));
  const yaw = viewer === 1 ? Math.PI : 0;
  const c = { yaw, pitch, tx: 0, ty: 0, tz: 0, dist: 14, fov: tall ? 0.82 : 0.66 };
  const m = M4.create();
  const fits = () => {
    camMatrices(c, aspect, m);
    for (const p of pts) {
      const q = M4.apply(m, p[0], p[1], p[2]); if (q[3] <= 0) return false;
      const sx = (q[0] / q[3] + 1) / 2, sy = (1 - q[1] / q[3]) / 2;
      if (sx < vl + 0.01 || sx > 1 - vr - 0.01 || sy < vt + 0.005 || sy > 1 - vb - 0.005) return false;
    }
    return true;
  };
  const search = (lo, hi, it) => { for (let i = 0; i < it; i++) { c.dist = (lo + hi) / 2; if (fits()) hi = c.dist; else lo = c.dist; } c.dist = hi; };
  // center the points' screen box in the free area
  const center = () => {
    for (let k = 0; k < 6; k++) {
      camMatrices(c, aspect, m);
      let minY = 1, maxY = 0, minX = 1, maxX = 0;
      for (const p of pts) { const q = M4.apply(m, p[0], p[1], p[2]); const sx = (q[0] / q[3] + 1) / 2, sy = (1 - q[1] / q[3]) / 2; minY = Math.min(minY, sy); maxY = Math.max(maxY, sy); minX = Math.min(minX, sx); maxX = Math.max(maxX, sx); }
      const s0 = viewer === 1 ? -1 : 1;
      c.tz += ((minY + maxY) / 2 - (vt + (1 - vt - vb) / 2)) * c.dist * 0.9 * s0;
      c.tx += ((minX + maxX) / 2 - (vl + (1 - vl - vr) / 2)) * c.dist * 0.9 * aspect * s0;
    }
  };
  // center the target on the target points first (a far view), then binary search the distance and re-center
  let cx = 0, cz = 0; for (const p of pts) { cx += p[0]; cz += p[2]; } c.tx = cx / pts.length; c.tz = cz / pts.length;
  search(2, 120 * WK, 32);
  for (let pass = 0; pass < 3; pass++) { center(); search(2, c.dist * 1.6, 24); }
  // your side: never start so far out that the troops are specks - you scroll and zoom to see the rest
  if (troopClamp) {
    const band = H * (1 - vt - vb);
    const minTroopPx = Math.max(22, Math.min(30, band * 0.045));
    const wpp = 2 * c.dist * Math.tan(c.fov / 2) / H, troopPx = 1.3 / wpp;
    if (troopPx < minTroopPx) { c.dist *= troopPx / minTroopPx; center(); }
  }
  if (c.dist < minDist) { c.dist = minDist; center(); }
  return c;
}
function setViewer(v) { viewer = v; fitCamera(); }
function setMode(m) { mode = m; fitCamera(); }
function zoomBy(f) { user.zoom = Math.max(0.28, Math.min(2.8, user.zoom * f)); }
function orbitBy(dx, dy) { user.yaw = Math.max(-0.9, Math.min(0.9, user.yaw + dx)); user.pitch = Math.max(-0.45, Math.min(0.42, user.pitch + dy)); }
function panBy(dx, dz) { clampPan(user.px + dx, user.pz + dz); }
// keep the camera target over the arena
function clampPan(px, pz) {
  const gx = Math.max(-BW - 1, Math.min(BW + 1, camGoal.tx + px)), gz = Math.max(-BD - 3, Math.min(BD + 3, camGoal.tz + pz));
  user.px = gx - camGoal.tx; user.pz = gz - camGoal.tz;
}
// Scroll by dragging: the ground under the finger follows the finger.
function panPixels(dx, dy) {
  const k = 2 * cam.dist * Math.tan(cam.fov / 2) / Math.max(1, H);
  const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), sp = Math.max(0.35, Math.sin(cam.pitch));
  panBy(-cy * dx * k - sy * dy * k / sp, sy * dx * k - cy * dy * k / sp);
}
function resetView() { user.zoom = 1; user.yaw = 0; user.pitch = 0; user.px = 0; user.pz = 0; }
function setView(v) { camView = v || 'home'; framePts = null; resetView(); fitCamera(); }
function toggleView() { setView(camView === 'overview' ? 'home' : 'overview'); }
// Make sure these spots are on screen. If any isn't, pull the camera back to show them all; returns true if it moved.
function frameSpots(list) {
  if (!list || !list.length || mode === 'home' || !W) return false;
  const pts = list.map(h => (h.slot === 'land' ? [LANE_X(h.lane), TOP, sideZ(h.side) * BD / 2] : spotPos(h.side, h.lane, h.slot || 'c')));
  const onScreen = p => { const q = project([p[0], p[1] + 0.8, p[2]]); return q.x > insets.left + 24 && q.x < W - insets.right - 24 && q.y > insets.top + 24 && q.y < H - insets.bottom - 24; };
  if (pts.every(onScreen)) return false;
  const fp = [];
  for (const p of pts) fp.push([p[0] - 2.6, TOP, p[2] - 2.6], [p[0] + 2.6, TOP, p[2] + 2.6], [p[0], TOP + 1.4 * BSIZE, p[2]]);
  camView = 'frame'; framePts = fp; resetView(); fitCamera();
  return true;
}

// Project a world point to CSS pixels.
function project(p) {
  const q = M4.apply(VP, p[0], p[1], p[2]);
  if (q[3] <= 0.01) return { x: -999, y: -999, z: 1e9 };
  return { x: (q[0] / q[3] + 1) / 2 * W, y: (1 - q[1] / q[3]) / 2 * H, z: q[3] };
}
function ray(x, y) {
  const nx = x / W * 2 - 1, ny = 1 - y / H * 2;
  M4.invert(IVP, VP);
  const a = M4.apply(IVP, nx, ny, -1), b = M4.apply(IVP, nx, ny, 1);
  const o = [a[0] / a[3], a[1] / a[3], a[2] / a[3]], f = [b[0] / b[3], b[1] / b[3], b[2] / b[3]];
  const d = [f[0] - o[0], f[1] - o[1], f[2] - o[2]];
  return { o, d };
}
function onPlane(x, y, py) {
  const r = ray(x, y); if (Math.abs(r.d[1]) < 1e-6) return null;
  const t = (py - r.o[1]) / r.d[1]; if (t < 0) return null;
  return [r.o[0] + r.d[0] * t, py, r.o[2] + r.d[2] * t];
}
// Board point under the pointer: {side, lane, slot} or null.
function boardPoint(x, y) {
  const p = onPlane(x, y, TOP); if (!p) return null;
  if (Math.abs(p[0]) > BW + 0.2 || Math.abs(p[2]) > BD + 0.35) return null;
  const side = p[2] >= 0 ? 0 : 1, lane = Math.max(0, Math.min(3, Math.floor((p[0] + BW) / LS)));
  const d = Math.abs(p[2]);
  return { side, lane, slot: d > (SPOT.c + SPOT.b) / 2 ? 'b' : 'c', p };
}
// What is under the pointer: hologram, table card, or board tile.
function pick(x, y) {
  let best = null, bd = 1e9;
  ents.forEach(e => {
    if (e.dying || e.hidden) return;
    const h = e.model.h * e.scale;
    const a = project([e.pos[0], e.pos[1], e.pos[2]]), b = project([e.pos[0], e.pos[1] + h, e.pos[2]]);
    const r = Math.max(18, Math.abs(a.y - b.y) * (e.kind === 'b' ? 0.5 : 0.62));
    const cx = a.x, cy = (a.y + b.y) / 2;
    const dx = (x - cx) / r, dy = (y - cy) / (Math.abs(a.y - b.y) / 2 + 12);
    const d = dx * dx + dy * dy;
    if (d < 1 && a.z < bd + (e.kind === 'c' ? 2 : 0)) { bd = a.z - (e.kind === 'c' ? 2 : 0); best = { kind: e.kind === 'c' ? 'creature' : 'building', side: e.side, lane: e.lane, slot: e.kind, uid: e.uid }; }
  });
  if (best) return best;
  const tp = onPlane(x, y, 0.02);
  if (tp) {
    for (const c of cards.values()) {
      const dx = tp[0] - c.pos[0], dz = tp[2] - c.pos[2];
      const r = Math.abs(Math.sin(c.rot)) > 0.5;
      const hw = (r ? CARD_H : CARD_W) / 2, hd = (r ? CARD_W : CARD_H) / 2;
      if (Math.abs(dx) < hw && Math.abs(dz) < hd) return { kind: c.slot === 'c' ? 'creature' : 'building', side: c.side, lane: c.lane, slot: c.slot, card: 1 };
    }
    for (const side of [0, 1]) for (const which of ['deck', 'discard']) { const d = deckPos(side, which); if (Math.abs(tp[0] - d[0]) < 0.6 * WK && Math.abs(tp[2] - d[2]) < 0.75 * WK) return { kind: which, side }; }
  }
  const bp = boardPoint(x, y);
  if (bp) return { kind: 'tile', side: bp.side, lane: bp.lane, slot: bp.slot };
  return null;
}
function screenPos(side, lane, slot, up) {
  const p = spotPos(side, lane, slot || 'c');
  const e = findEnt(side, lane, slot || 'c');
  const h = e ? e.model.h * e.scale : 0.5;
  return project([p[0], p[1] + h * (up == null ? 1 : up), p[2]]);
}
function headPos(side, lane, slot) { const s = screenPos(side, lane, slot, 1.05); return { x: s.x, y: s.y }; }
function findEnt(side, lane, kind) { for (const e of ents.values()) if (!e.dying && e.side === side && e.lane === lane && e.kind === kind) return e; return null; }
function entByUid(uid, kind) { return ents.get(entKey(kind || 'c', uid)); }

// ------------------------------------------------------------------ effects API (called by the UI director)
const fx = {
  summon(side, lane, uid) { const e = entByUid(uid, 'c'); if (e) { e.rev = 0; e.revSp = 1.6; spark(e.pos, TEAM[side], 26, 0.6); } },
  build(side, lane, uid) { const e = entByUid(uid, 'b'); if (e) { e.rev = 0; e.revSp = 0.9; ring(e.pos, TEAM[side], 2.3); } },
  // Melee attackers march across the battlefield, strike, and march back; shooters fire across it.
  attack(side, lane, toSide, toLane, slot, kind) {
    const e = findEnt(side, lane, 'c'); if (!e) return;
    const t = spotPos(toSide, toLane, slot || 'c');
    const d = [t[0] - e.pos[0], 0, t[2] - e.pos[2]], L = Math.hypot(d[0], d[2]) || 1;
    e.yawGoal = Math.atan2(d[0], d[2]);
    if (kind === 'ranged' || kind === 'flying') { projectile(e, t, kind === 'flying' ? TEAM[side] : [1, 0.9, 0.5]); e.hop = 1; }
    else {
      const k = Math.max(0, L - strikeGap(slot)) / L;
      e.path = [[e.pos[0] + d[0] * k, TOP, e.pos[2] + d[2] * k]]; e.speed = RUN; e.walking = 1; e.pathFx = null;
      e.strikeDir = [d[0] / L, 0, d[2] / L];
    }
    e.backYaw = baseYaw(e.side, e.tag.face);
  },
  hit(side, lane, slot, n, kind) {
    const e = findEnt(side, lane, slot || 'c'); if (!e) return;
    e.flash = 1; e.shakeT = 0.35;
    spark([e.pos[0], e.pos[1] + e.model.h * e.scale * 0.5, e.pos[2]], kind === 'storm' ? [1, 0.25, 0.55] : kind === 'burn' ? [1, 0.5, 0.1] : [1, 1, 1], 10 + Math.min(20, n * 3), 0.5);
  },
  heal(side, lane) { const e = findEnt(side, lane, 'c'); if (e) spark([e.pos[0], e.pos[1] + 0.3, e.pos[2]], [0.4, 1, 0.5], 14, 0.4, -1); },
  death(side, lane, uid, kind) {
    const e = entByUid(uid, kind || 'c') || findEnt(side, lane, kind || 'c'); if (!e) return;
    e.dying = 0.001; e.quiet = false;
    const col = e.kind === 'b' ? TEAM[e.side] : mix(rgb(e.model.colorHint || '#ffffff'), TEAM[e.side], 0.4);
    pixelBurst(e, col);
  },
  move(uid) { const e = entByUid(uid, 'c'); if (e) e.walking = 1; },
  land(side, lane, cause) {
    const t = tileOf(side, lane); if (!t) return;
    const c = [LANE_X(lane), TOP, sideZ(side) * BD / 2];
    const around = (col, n2, sp) => { for (let k = 0; k < 8; k++) spark([c[0] + (Math.random() - 0.5) * LS * 0.75, TOP + 0.1, c[2] + (Math.random() - 0.5) * BD * 0.75], col, n2, sp, 0.5); };
    if (cause === 'eat') around([1, 0.9, 0.3], 10, 1.0);
    else if (cause === 'lava') around([1, 0.45, 0.1], 14, 1.2);
    else if (cause === 'reclaim' || cause === 'convert') { ring(c, rgb(LANDC[t.type] || '#ffffff'), 5.0); }
    t.glow = 1;
  },
  floopCard(side, lane, slot) { const c = [...cards.values()].find(x => x.side === side && x.lane === lane && x.slot === slot); if (c) c.lift = 1; const e = findEnt(side, lane, slot); if (e) { e.glow = 1; ring(e.pos, [1, 1, 1], 0.7); } },
  beam(from, to, color, kind) { ribbons.push({ kind: kind || 'beam', a: from, b: to, col: color, t: 0, life: kind === 'bolt' ? 0.9 : 0.6 }); },
  zap(fromSide, fromLane, fromSlot, toSide, toLane, toSlot, kind) {
    const a = spotPos(fromSide, fromLane, fromSlot || 'c'), b = spotPos(toSide, toLane, toSlot || 'c');
    const ea = findEnt(fromSide, fromLane, fromSlot || 'c'), eb = findEnt(toSide, toLane, toSlot || 'c');
    a[1] += ea ? ea.model.h * ea.scale * 0.7 : 0.5; b[1] += eb ? eb.model.h * eb.scale * 0.5 : 0.4;
    const col = kind === 'ice' ? [0.6, 0.95, 1] : kind === 'fire' || kind === 'cannon' ? [1, 0.5, 0.1] : kind === 'arrow' ? [1, 0.9, 0.3] : kind === 'science' ? [0.5, 1, 0.6] : kind === 'raze' ? [0.5, 0.8, 1] : [1, 1, 1];
    if (kind === 'arrow' || kind === 'cannon' || kind === 'fire') projectileP(a, b, col);
    else ribbons.push({ kind: 'bolt', a, b, col, t: 0, life: 0.6 });
  },
  steal(fromSide, lane, toSide, toLane, uid, kind) {
    const e = entByUid(uid, 'c');
    const a = spotPos(fromSide, lane, 'c'), b = spotPos(toSide, toLane, 'c');
    a[1] += 0.6; b[1] += 0.6;
    ribbons.push({ kind: kind === 'spirit' ? 'bolt' : 'souls', a: kind === 'spirit' ? spotPos(toSide, lane, 'b').map((v, i) => i === 1 ? v + 1.1 * BSIZE : v) : a, b: kind === 'spirit' ? a : b, col: kind === 'spirit' ? [0.6, 0.9, 1] : [1, 0.35, 0.3], t: 0, life: 1.0 });
    if (e) { e.flash = 1; e.glow = 1; }
  },
  storm() { bigFx('bloodstorm', [0, TOP + 6.5 * FXK, 0], 7 * FXK, [1, 0.3, 0.6]); },
  nightmares() { bigFx('nightmares', [0, TOP + 4 * FXK, 0], 6 * FXK, [0.6, 0.3, 1]); },
  volcano(side, lane) { const p = spotPos(side, lane, 'b'); bigFx('volcano', [p[0], TOP, p[2]], 3.5 * BSIZE, [1, 0.45, 0.1], { rise: 1, erupt: 1 }); shake(1.2); flash([1, 0.5, 0.15], 0.5); },
  coldNose() { bigFx('freeze', [0, TOP + 5 * FXK, 0], 5 * FXK, [0.7, 0.95, 1]); flash([0.7, 0.9, 1], 0.4); },
  silo(side, lane) { const p = spotPos(side, lane, 'b'), e = findEnt(side, lane, 'b'); p[1] += e ? e.model.h * e.scale : 1.4 * BSIZE; const to = [0, 1.4 * WK, sideZ(1 - side) * (OPP_Z - WK)]; ribbons.push({ kind: 'laser', a: p, b: to, col: [1, 0.9, 0.3], t: 0, life: 1.2 }); },
  scare(side, lane) { const e = findEnt(side, lane, 'c'); if (e) { e.flash = 1; spark([e.pos[0], e.pos[1] + 0.5, e.pos[2]], [0.7, 0.3, 1], 30, 0.7); } },
  study(side, lane) { const e = findEnt(side, lane, 'c'); if (e) { e.insideGoal = 1; ring(spotPos(side, lane, 'b'), [0.5, 0.8, 1], 2.0); } },
  ring(side, lane, slot, col) { ring(spotPos(side, lane, slot || 'c'), col || [1, 1, 1], slot === 'b' ? 2.3 : 1.1); },
  text(side, lane, slot, txt, col, big) {
    const e = findEnt(side, lane, slot || 'c');
    const p = e ? e.pos.slice() : spotPos(side, lane, slot || 'c');   // follows a troop that is out on the field
    p[1] += e ? e.model.h * e.scale + 0.25 : 0.8;
    texts.push({ p, txt, col: col || '#ffffff', t: 0, life: big ? 1.6 : 1.1, big: !!big });
  },
  say(side, lane, slot, txt) {
    const e = findEnt(side, lane, slot || 'c');
    const p = e ? e.pos.slice() : spotPos(side, lane, slot || 'c');
    p[1] += e ? e.model.h * e.scale + 0.4 : 1.0;
    texts.push({ p, txt, col: '#1a1a1a', t: 0, life: 2.6, bubble: true });
  },
  shake(a) { shake(a); },
  flash(col, a) { flash(col, a); },
  hitstop(ms) { hitstopT = Math.max(hitstopT, (ms || 60) / 1000); },
  intro(cb) {
    // "Floop your land cards!": the land cards flip, the landscapes appear, then every hologram materializes
    introT = 0; introCb = cb || null;
    for (const t of tiles) t.decorS = 0;
    ents.forEach(e => { e.rev = 0; e.delay = 0.75 + e.lane * 0.12 + e.side * 0.3 + (e.kind === 'c' ? 0.45 : 0); e.revSp = e.kind === 'b' ? 0.9 : 1.4; });
  },
  // The Pig runs over to the enemy Cornfields, eats them, and trots back.
  visit(uid, toSide) {
    const e = entByUid(uid, 'c'); if (!e || !st) return;
    const lanes = [];
    for (let l = 0; l < 4; l++) { const L = st.players[toSide].lanes[l].land; if (!L.down && L.type === 'corn') lanes.push(l); }
    if (!lanes.length) lanes.push(e.lane);
    lanes.sort((a, b) => (e.lane <= 1.5 ? a - b : b - a));
    e.path = lanes.map(l => [LANE_X(l), TOP, sideZ(toSide) * BD * 0.55]);
    e.walking = 1; e.speed = 18; e.pathFx = 'eat'; e.strikeDir = null;
  },
  pulseTile(side, lane) { const t = tileOf(side, lane); if (t) t.glow = 1; }
};
function shake(a) { if (reduceMotion) a *= 0.3; shakeA = Math.max(shakeA, a * 0.12); shakeT = 0.4; }
function flash(col, a) { flashes.push({ col, a: a || 0.4, t: 0, life: 0.45 }); }
function ring(p, col, r) { ribbons.push({ kind: 'ring', a: [p[0], TOP + 0.03, p[2]], r: r || 0.8, col, t: 0, life: 0.7 }); }
function bigFx(id, p, s, col, o) { bigs.push(Object.assign({ id, model: Models.build(id), buf: null, p, s, col, t: 0, life: id === 'volcano' ? 3.0 : 2.4 }, o || {})); }
function projectile(e, t, col) {
  const a = [e.pos[0], e.pos[1] + e.model.h * e.scale * 0.7, e.pos[2]], b = [t[0], t[1] + 0.6, t[2]];
  projectileP(a, b, col);
}
function projectileP(a, b, col, life) { const L = Math.hypot(b[0] - a[0], b[2] - a[2]); ribbons.push({ kind: 'shot', a, b, col, t: 0, life: life || shotTime(L), arc: Math.max(0.6, L * 0.12) }); }
const shotTime = L => Math.max(0.35, L / 26);
const strikeGap = slot => (slot === 'b' ? 0.8 + 0.85 * BSIZE : 0.95);
// How long (ms) an attack takes to land: the march across the field, or the shot's flight.
function attackTime(side, lane, toSide, toLane, slot, kind) {
  const e = findEnt(side, lane, 'c'); if (!e) return 300;
  const t = spotPos(toSide, toLane, slot || 'c');
  const L = Math.hypot(t[0] - e.pos[0], t[2] - e.pos[2]);
  if (kind === 'ranged' || kind === 'flying') return 150 + 1000 * shotTime(L);
  return 140 + 1000 * Math.max(0, L - strikeGap(slot)) / RUN;
}

// ------------------------------------------------------------------ particles
function addP(x, y, z, vx, vy, vz, col, size, life, grav) {
  if (particles.length > 2600) particles.shift();
  particles.push({ x, y, z, vx, vy, vz, r: col[0], g: col[1], b: col[2], s: size, life, t: 0, grav: grav == null ? 1 : grav });
}
function spark(p, col, n, sp, grav) {
  if (reduceMotion) n = Math.ceil(n / 3);
  for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, u = Math.random() * 2 - 1, v = (sp || 0.6) * (0.4 + Math.random()); addP(p[0], p[1], p[2], Math.cos(a) * Math.sqrt(1 - u * u) * v * 2, Math.abs(u) * v * 2.4 + 0.4, Math.sin(a) * Math.sqrt(1 - u * u) * v * 2, col, 5 + Math.random() * 5, 0.5 + Math.random() * 0.4, grav == null ? 1 : grav); }
}
// "Deaths break into pixel sparks": sample the model's own vertices so the burst keeps its colors.
function pixelBurst(e, col) {
  const d = e.model.data, step = Math.max(1, Math.floor(e.model.count / (reduceMotion ? 40 : 140))) * Models.STRIDE;
  const s = e.scale, cy = Math.cos(e.yaw), sy = Math.sin(e.yaw);
  for (let i = 0; i < d.length; i += step) {
    const lx = d[i] * s, ly = d[i + 1] * s, lz = d[i + 2] * s;
    const x = e.pos[0] + lx * cy + lz * sy, z = e.pos[2] - lx * sy + lz * cy, y = e.pos[1] + ly;
    const c = mix([d[i + 6], d[i + 7], d[i + 8]], col, 0.45);
    addP(x, y, z, (Math.random() - 0.5) * 2.4, Math.random() * 2.6, (Math.random() - 0.5) * 2.4, [c[0] * 1.3, c[1] * 1.3, c[2] * 1.3], 7 + Math.random() * 6, 0.7 + Math.random() * 0.5, 1);
  }
}

// ------------------------------------------------------------------ highlights, selection, previews
function setHighlights(list) { hl = list || []; }
function setSelection(s) { sel = s; }
function setArrows(list) { arrows = list || []; }
function setPreview(p) { preview = p; }
function setHover(h) { hoverPt = h; }
function setGhost(g) { dragGhost = g; }

// ------------------------------------------------------------------ frame
let lastT = 0;
function frame(t, dt) {
  if (!ready || lost) return;
  const t0 = performance.now();
  stats.draws = 0; stats.tris = 0;
  time = t / 1000;
  if (hitstopT > 0) { hitstopT -= dt; dt = dt * 0.15; }
  update(dt);
  render();
  drawOverlay(dt);
  pumpArt();
  stats.ms = performance.now() - t0;
}
function approach(a, b, k, dt) { return a + (b - a) * (1 - Math.exp(-k * dt)); }
function angApproach(a, b, k, dt) { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * (1 - Math.exp(-k * dt)); }
function update(dt) {
  // camera
  const gy = camGoal.yaw + user.yaw, gp = Math.max(0.35, Math.min(1.35, camGoal.pitch + user.pitch)), gd = camGoal.dist * user.zoom;
  cam.yaw = angApproach(cam.yaw, gy, 4, dt); cam.pitch = approach(cam.pitch, gp, 4, dt); cam.dist = approach(cam.dist, gd, 4, dt);
  cam.tx = approach(cam.tx, camGoal.tx + user.px, 4, dt); cam.ty = approach(cam.ty, camGoal.ty, 4, dt); cam.tz = approach(cam.tz, camGoal.tz + user.pz, 4, dt);
  if (mode === 'home') cam.yaw = camGoal.yaw + Math.sin(time * 0.12) * 0.35;
  // tiles
  for (const t of tiles) { t.decorS = approach(t.decorS, t.decorGoal * decorGate(t), 3.5, dt); t.glow = Math.max(0, t.glow - dt * 1.2); }
  // holograms
  ents.forEach((e, k) => {
    if (e.delay > 0) e.delay -= dt;
    else if (e.rev < 1) e.rev = Math.min(1, e.rev + dt * e.revSp * (introT >= 0 ? 0.8 : 1));
    e.flash = Math.max(0, e.flash - dt * 3.5);
    e.glow = Math.max(0, e.glow - dt * 1.5);
    if (e.shakeT > 0) e.shakeT -= dt;
    if (e.path) {
      if (!e.path.length) { e.path = null; e.goal = spotPos(e.side, e.lane, e.kind); }
      else {
        e.goal = e.path[0];
        if (Math.hypot(e.goal[0] - e.pos[0], e.goal[2] - e.pos[2]) < 0.08) {
          if (e.pathFx === 'eat') spark([e.pos[0], TOP + 0.1, e.pos[2]], [1, 0.9, 0.35], 16, 0.5);
          e.path.shift();
          // reached the enemy: strike, hold a moment, then march home
          if (!e.path.length && e.strikeDir) { e.lungeDir = e.strikeDir; e.lungeDist = 0.7; e.lunge = 1; e.strikeDir = null; e.pause = 0.45; e.speed = RUN * 0.8; }
        }
      }
    }
    if (e.pause > 0) e.pause -= dt;
    const dx = e.goal[0] - e.pos[0], dz = e.goal[2] - e.pos[2], d = Math.hypot(dx, dz);
    if (d > 0.01 && !(e.pause > 0)) {
      const v = e.speed || WALK, sp = Math.min(d, dt * v);
      e.pos[0] += dx / d * sp; e.pos[2] += dz / d * sp; e.walk += dt * (v > WALK ? 11 : 6);
      e.yawGoal = Math.atan2(dx, dz);
    } else if (d <= 0.01 && e.walking && !e.path) { e.walking = 0; e.speed = 0; e.pathFx = null; e.yawGoal = baseYaw(e.side, e.tag.face); }
    if (e.lunge > 0) { e.lunge = Math.max(0, e.lunge - dt * 2.4); if (e.lunge === 0) e.yawGoal = baseYaw(e.side, e.tag.face); }
    if (e.hop > 0) e.hop = Math.max(0, e.hop - dt * 3);
    e.yaw = angApproach(e.yaw, e.yawGoal, 7, dt);
    e.pose = approach(e.pose, e.poseGoal, 5, dt);
    e.inside = approach(e.inside, e.insideGoal, 3, dt);
    if (e.dying) {
      e.dying += dt * (e.quiet ? 2.5 : 2.2);
      if (e.dying >= 1) { dropEnt(e); ents.delete(k); }
    }
  });
  cards.forEach(c => {
    c.rot = approach(c.rot, c.rotGoal, 9, dt);
    if (c.goalPos) for (let i = 0; i < 3; i++) c.pos[i] = approach(c.pos[i], c.goalPos[i], 6, dt);
    c.lift = Math.max(0, c.lift - dt * 2);
  });
  // particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]; p.t += dt;
    if (p.t >= p.life) { particles.splice(i, 1); continue; }
    p.vy -= 4.5 * p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    if (p.y < TOP + 0.02 && p.vy < 0) { p.y = TOP + 0.02; p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; }
  }
  for (let i = ribbons.length - 1; i >= 0; i--) { const r = ribbons[i]; r.t += dt; if (r.t >= r.life) { if (r.kind === 'shot') spark(r.b, r.col, 12, 0.5); ribbons.splice(i, 1); } }
  for (let i = texts.length - 1; i >= 0; i--) { texts[i].t += dt; if (texts[i].t >= texts[i].life) texts.splice(i, 1); }
  for (let i = flashes.length - 1; i >= 0; i--) { flashes[i].t += dt; if (flashes[i].t >= flashes[i].life) flashes.splice(i, 1); }
  for (let i = bigs.length - 1; i >= 0; i--) {
    const b = bigs[i]; b.t += dt;
    if (b.id === 'volcano' && b.t > 0.9 && b.t < 2.2 && Math.random() < 0.9) for (let k = 0; k < 8; k++) addP(b.p[0], b.p[1] + 1.6 * b.s * 0.7, b.p[2], (Math.random() - 0.5) * 20, 6 + Math.random() * 9, (Math.random() - 0.5) * 9, [1, 0.3 + Math.random() * 0.4, 0.05], 10 + Math.random() * 8, 1.4, 1);
    if (b.id === 'bloodstorm' && b.t > 0.3) for (let k = 0; k < 14; k++) addP((Math.random() - 0.5) * BW * 1.6, b.p[1], (Math.random() - 0.5) * BD * 1.6, 0, -9, 0, [0.9, 0.08, 0.2], 6, 0.75, 0.3);
    if (b.id === 'freeze' || b.id === 'nightmares') for (let k = 0; k < 9; k++) addP((Math.random() - 0.5) * BW * 1.7, b.p[1] + Math.random() * 3, (Math.random() - 0.5) * BD * 1.7, 0, b.id === 'freeze' ? -1.5 : 0.4, 0, b.col, 6, 1.2, 0.1);
    if (b.t >= b.life) { if (b.buf) GL3.freeBuffer(ctx, b.buf); bigs.splice(i, 1); }
  }
  if (shakeT > 0) shakeT -= dt;
  if (introT >= 0) { introT += dt; if (introT > 2.6) { introT = -1; if (introCb) { const f = introCb; introCb = null; f(); } } }
}

// ------------------------------------------------------------------ render
const LIGHT = (() => { const v = [0.45, 0.8, 0.55]; const l = Math.hypot(...v); return [v[0] / l, v[1] / l, v[2] / l]; })();
function render() {
  const aspect = W / H;
  const c = { yaw: cam.yaw, pitch: cam.pitch, dist: cam.dist, tx: cam.tx, ty: cam.ty, tz: cam.tz, fov: cam.fov };
  if (shakeT > 0) { const k = shakeA * (shakeT / 0.4); c.tx += (Math.random() - 0.5) * k; c.tz += (Math.random() - 0.5) * k; c.ty += (Math.random() - 0.5) * k; }
  cam.eye = camMatrices(c, aspect, VP);
  WPP = 2 * c.dist * Math.tan(c.fov / 2) / Math.max(1, H);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0.78, 0.76, 0.55, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true);
  gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); gl.disable(gl.BLEND);
  GL3.resetBindings();
  // textured statics (floor, wall, labels)
  const pt = progs.tex;
  GL3.use(ctx, pt);
  gl.uniformMatrix4fv(pt.u.uVP, false, VP);
  gl.disable(gl.CULL_FACE);
  for (const s of statics) if (s.kind === 'tex') drawTex(s.mesh, s.tex, s.m || IDENT, s.mul, [0, 0, 0]);
  // mesh statics (table, board slab, props)
  meshBegin(false);
  for (const s of statics) if (s.kind === 'mesh') drawMesh(s.mesh.buf, s.mesh.count, s.m || IDENT, { outline: s.outline, outCol: s.outCol });
  // board tiles
  GL3.use(ctx, pt); gl.uniformMatrix4fv(pt.u.uVP, false, VP); gl.disable(gl.CULL_FACE);
  for (const t of tiles) if (t.type) {
    const g = t.glow * 0.35, rv = tileReveal(t);
    if (rv < 1) drawTex(t.mesh, landTex('mat'), IDENT, [1, 1, 1, 1], [g, g, g]);
    if (rv > 0) {
      if (rv < 1) { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); }
      drawTex(t.mesh, landTex(t.type), IDENT, [1, 1, 1, rv], [g, g, g]);
      if (rv < 1) gl.disable(gl.BLEND);
    }
  }
  drawSpotMarks();
  // physical cards on the table
  drawCards();
  // opponent behind the table
  if (opponent) drawOpponent();
  // holograms: land decor, buildings, creatures, big spell models
  meshBegin(true);
  gl.uniform1f(progs.mesh.u.uSway, 0.12);
  for (const t of tiles) if (t.decor && t.decorS > 0.01 && !setupMode) {
    const cz = sideZ(t.side) * BD / 2;
    M4.trs(MOD, LANE_X(t.lane), TOP, cz, 0, 0, 0, 1, Math.max(0.01, t.decorS), 1);
    drawMesh(t.decor.buf, t.decor.count, MOD, { holo: true, outline: 0, outCol: [1, 1, 1], glowCol: [1, 1, 1], alpha: 1 });
  }
  gl.uniform1f(progs.mesh.u.uSway, 0);
  ents.forEach(e => { if (e.kind === 'b' && entAlpha(e) >= 0.99) drawEnt(e); });
  ents.forEach(e => { if (e.kind === 'c' && entAlpha(e) >= 0.99) drawEnt(e); });
  ents.forEach(e => { if (entAlpha(e) < 0.99) drawEnt(e); });   // see-through ones last (setup ghosts, napping, fading)
  for (const b of bigs) drawBig(b);
  // additive effects
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE); gl.depthMask(false);
  drawRibbons();
  drawParticles();
  gl.depthMask(true); gl.disable(gl.BLEND);
}
const IDENT = M4.create();
function drawTex(mesh, tex, m, mul, add) {
  const p = progs.tex;
  GL3.attribs(ctx, p, mesh.buf);
  gl.uniformMatrix4fv(p.u.uM, false, m);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex.t); gl.uniform1i(p.u.uTex, 0);
  gl.uniform4fv(p.u.uMul, mul); gl.uniform3fv(p.u.uAdd, add || [0, 0, 0]);
  gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
  stats.draws++; stats.tris += mesh.count / 3;
}
function meshBegin(holo) {
  const p = progs.mesh;
  GL3.use(ctx, p);
  gl.uniformMatrix4fv(p.u.uVP, false, VP);
  gl.uniform3fv(p.u.uLight, LIGHT); gl.uniform3fv(p.u.uCam, cam.eye || [0, 10, 10]);
  gl.uniform1f(p.u.uTime, time % 600); gl.uniform1f(p.u.uFT, time % 62.8318); gl.uniform1f(p.u.uSway, 0);
  gl.uniformMatrix4fv(p.u.uB, false, IDBONES);
  gl.enable(gl.CULL_FACE);
}
const IDBONES = (() => { const a = new Float32Array(16 * 8); for (let i = 0; i < 8; i++) a[i * 16] = a[i * 16 + 5] = a[i * 16 + 10] = a[i * 16 + 15] = 1; return a; })();
// One mesh draw: optional inverted-hull outline pass, then the shaded pass.
function drawMesh(buf, count, m, o) {
  const p = progs.mesh, u = p.u;
  GL3.attribs(ctx, p, buf);
  gl.uniformMatrix4fv(u.uM, false, m);
  gl.uniform1f(u.uHolo, o.holo ? 1 : 0);
  gl.uniform1f(u.uAlpha, o.alpha == null ? 1 : o.alpha);
  gl.uniform1f(u.uFlash, o.flash || 0);
  gl.uniform4fv(u.uTint, o.tint || [0, 0, 0, 0]);
  gl.uniform3fv(u.uRev, o.rev || [0, 0, 0]);
  gl.uniform3fv(u.uOutCol, o.outCol || [0, 0, 0]);
  gl.uniform3fv(u.uGlowCol, o.glowCol || o.outCol || [1, 1, 1]);
  if (o.bones) gl.uniformMatrix4fv(u.uB, false, o.bones);
  if (o.outline) {
    gl.cullFace(gl.FRONT); gl.uniform1f(u.uOutline, o.outline); gl.uniform1f(u.uIsOut, 1);
    gl.drawArrays(gl.TRIANGLES, 0, count);
    gl.cullFace(gl.BACK);
  }
  gl.uniform1f(u.uOutline, 0); gl.uniform1f(u.uIsOut, 0);
  gl.drawArrays(gl.TRIANGLES, 0, count);
  stats.draws += o.outline ? 2 : 1; stats.tris += (count / 3) * (o.outline ? 2 : 1);
  if (o.bones) gl.uniformMatrix4fv(u.uB, false, IDBONES);
}
function boneAngles(e) {
  const chans = e.model.chans; if (!chans.length) return null;
  BONES.set(IDBONES);
  const walking = e.walking || e.lunge > 0 ? 1 : 0;
  for (const c of chans) {
    let a = 0;
    const ph = c.ph, amp = c.amp * Math.PI / 180;
    if (c.kind === 'leg') a = walking ? Math.sin(e.walk * 1.6 + ph) * amp : Math.sin(time * 1.6 + ph) * amp * 0.06;
    else if (c.kind === 'arm') a = walking ? Math.sin(e.walk * 1.6 + ph + Math.PI) * amp : Math.sin(time * 1.4 + ph) * amp * 0.25;
    else if (c.kind === 'head') a = Math.sin(time * 1.3 + e.bob + ph) * amp;
    else if (c.kind === 'tail') a = Math.sin(time * 7 + e.bob) * amp;
    else if (c.kind === 'wing') a = Math.sin(time * 9 + e.bob) * amp;
    else if (c.kind === 'sway') a = Math.sin(time * 1.6 + e.bob + ph) * amp;
    else if (c.kind === 'wave') a = (Math.sin(time * 3.2 + e.bob) * 0.5 + 0.5) * amp;
    else if (c.kind === 'spin') a = time * amp * 0.2;
    else if (c.kind === 'bounce') a = Math.sin(time * 6) * amp;
    if (e.lunge > 0 && (c.kind === 'arm' || c.kind === 'wave')) a += Math.sin(e.lunge * Math.PI) * 1.2;
    const rx = c.axis === 'x' ? a : 0, ry = c.axis === 'y' ? a : 0, rz = c.axis === 'z' ? a : 0;
    M4.pivotRot(TMP, c.p[0], c.p[1], c.p[2], rx, ry, rz);
    BONES.set(TMP, c.bone * 16);
  }
  return BONES;
}
function drawEnt(e) {
  if (!e.buf) return;
  const h = e.model.h;
  let x = e.pos[0], y = e.pos[1], z = e.pos[2];
  let s = e.scale;
  if (e.lunge > 0) { const k = Math.sin(e.lunge * Math.PI) * e.lungeDist * (e.lunge > 0.5 ? 1 : 1); x += e.lungeDir[0] * k; z += e.lungeDir[2] * k; y += Math.sin(e.lunge * Math.PI) * 0.15; }
  if (e.hop > 0) y += Math.sin(e.hop * Math.PI) * 0.12;
  if (e.kind === 'c') {
    if (e.tag.float) y += 0.12 + Math.sin(time * 2.2 + e.bob) * 0.05;
    else if (!e.walking && !e.lunge) y += Math.max(0, Math.sin(time * 2.4 + e.bob)) * 0.015;
    if (e.act && !e.lunge && !e.walking) { const f = sideZ(e.side) * -0.6; z += f; }
    if (e.inside > 0.01) { const bp = spotPos(e.side, e.lane, 'b'); x += (bp[0] - x) * e.inside; z += (bp[2] - z) * e.inside; s *= 1 - e.inside * 0.75; }
  }
  if (e.shakeT > 0) { x += Math.sin(time * 70) * 0.04 * e.shakeT; }
  let rx = 0;
  if (e.pose > 0.01) rx = e.pose * 1.45;
  if (e.dying) s *= Math.max(0, 1 - e.dying);
  M4.trs(MOD, x, y + (rx ? 0.05 : 0), z, e.yaw, rx * (e.side === 0 ? 1 : -1) * 0, e.pose * 1.45 * (e.side === 0 ? 1 : -1), s, s, s);
  const team = TEAM[e.side];
  const isB = e.kind === 'b';
  const stolen = !isB && e.c && e.c.owner != null && e.c.owner !== e.side;
  const tint = isB ? [team[0], team[1], team[2], 0.72] : [team[0], team[1], team[2], stolen ? 0.62 : 0.3];
  let outCol = isB ? mix(team, [1, 1, 1], 0.55) : mix(team, [1, 1, 1], 0.6);
  if (e.frozen) { tint[0] = 0.7; tint[1] = 0.95; tint[2] = 1; tint[3] = 0.55; outCol = [0.85, 0.98, 1]; }
  if (e.delay > 0) return;
  const alpha = entAlpha(e);
  const rev = e.rev < 1 ? [e.rev * h * 1.12 - 0.02, 0.18 * h, 1] : [0, 0, 0];
  const glow = e.glow > 0 ? e.glow : 0;
  if (alpha < 0.99) { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); }
  drawMesh(e.buf, e.count, MOD, { holo: true, outline: Math.max(isB ? 0.03 : 0.022, WPP * (isB ? 1.5 : 1.2)) / s, outCol, glowCol: mix(outCol, [1, 1, 1], 0.3), tint, alpha, flash: Math.max(e.flash * 0.75, glow * 0.25), rev, bones: boneAngles(e) });
  if (alpha < 0.99) gl.disable(gl.BLEND);
}
function entAlpha(e) { return setupMode ? 0.5 : e.dying ? Math.max(0, 1 - e.dying) : e.nap ? 0.72 : 1; }
// Setup and the land floop: blank mat (own lands faintly visible) -> landscapes revealed lane by lane.
function revealAt(t) { return t.lane * 0.12 + t.side * 0.3 + 0.25; }
function tileReveal(t) {
  const own = t.side === viewer ? 0.32 : 0;
  if (setupMode) return own;
  if (introT >= 0) return Math.max(own, Math.min(1, Math.max(0, (introT - revealAt(t)) / 0.4)));
  return 1;
}
function decorGate(t) { return setupMode ? 0 : introT >= 0 ? (introT > revealAt(t) + 0.35 ? 1 : 0) : 1; }
function setSetup(on) { setupMode = !!on; if (on) for (const t of tiles) t.decorS = 0; }
function drawBig(b) {
  if (!b.buf) b.buf = GL3.buffer(ctx, b.model.data);
  let y = b.p[1], s = b.s / Math.max(0.3, b.model.h) * 1.4;
  let k = Math.min(1, b.t / 0.6), out = Math.max(0, (b.t - (b.life - 0.6)) / 0.6);
  if (b.rise) y += ((k - 1) * 1.6 - out * 1.8) * b.s / 2.6;
  const sc = s * (b.rise ? 1 : (0.6 + 0.4 * k) * (1 - out * 0.6));
  M4.trs(MOD, b.p[0], y, b.p[2], time * (b.rise ? 0 : 0.4), 0, 0, sc, sc, sc);
  drawMesh(b.buf, b.model.count, MOD, { holo: true, outline: 0.03 / sc, outCol: mix(b.col, [1, 1, 1], 0.4), glowCol: b.col, tint: [b.col[0], b.col[1], b.col[2], 0.25], alpha: 1, rev: b.rise ? [0, 0, 0] : [0, 0, 0] });
}
// Glowing spot marks on the board: valid targets, selection, hover, attack declarations.
function drawSpotMarks() {
  const rings = [];
  for (const h of hl) rings.push({ p: spotPos(h.side, h.lane, h.slot || 'c'), r: h.slot === 'b' ? 2.0 : 1.05, col: h.kind === 'bad' ? [1, 0.3, 0.3] : h.kind === 'tgt' ? [1, 0.45, 0.35] : h.kind === 'atk' ? [1, 0.85, 0.3] : [0.45, 1, 0.55], pulse: 1 });
  if (sel) rings.push({ p: spotPos(sel.side, sel.lane, sel.slot || 'c'), r: sel.slot === 'b' ? 2.15 : 1.15, col: [1, 0.95, 0.4], pulse: 2 });
  if (hoverPt) rings.push({ p: spotPos(hoverPt.side, hoverPt.lane, hoverPt.slot || 'c'), r: hoverPt.slot === 'b' ? 2.08 : 1.1, col: [1, 1, 1], pulse: 0 });
  if (!rings.length) return;
  const verts = [];
  for (const r of rings) {
    const a = 0.55 + 0.35 * (r.pulse ? Math.sin(time * 5 * r.pulse) * 0.5 + 0.5 : 1);
    const n = 32, w = Math.max(0.09, WPP * 3);
    for (let i = 0; i < n; i++) {
      const a0 = i / n * 6.2832, a1 = (i + 1) / n * 6.2832;
      const p = (aa, rr) => [r.p[0] + Math.cos(aa) * rr, TOP + 0.03, r.p[2] + Math.sin(aa) * rr];
      const A = p(a0, r.r), Bq = p(a1, r.r), C = p(a1, r.r + w), D = p(a0, r.r + w);
      for (const q of [A, Bq, C, A, C, D]) verts.push(q[0], q[1], q[2], r.col[0], r.col[1], r.col[2], a);
    }
  }
  drawRb(verts, true);
}
function drawRb(verts, blendNow) {
  if (!verts.length) return;
  const p = progs.rb;
  const arr = new Float32Array(verts);
  GL3.use(ctx, p); GL3.updateBuffer(ctx, rbBuf, arr); GL3.resetBindings(); GL3.use(ctx, p); GL3.attribs(ctx, p, rbBuf);
  gl.uniformMatrix4fv(p.u.uVP, false, VP);
  if (blendNow) { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE); gl.depthMask(false); }
  gl.disable(gl.CULL_FACE);
  gl.drawArrays(gl.TRIANGLES, 0, arr.length / 7);
  if (blendNow) { gl.depthMask(true); gl.disable(gl.BLEND); }
}
function drawRibbons() {
  const v = [];
  const quadTo = (a, b, w, col, al) => {
    const dx = b[0] - a[0], dz = b[2] - a[2], L = Math.hypot(dx, dz) || 1;
    const nx = -dz / L * w, nz = dx / L * w;
    const A = [a[0] + nx, a[1], a[2] + nz], Bq = [a[0] - nx, a[1], a[2] - nz], C = [b[0] - nx, b[1], b[2] - nz], D = [b[0] + nx, b[1], b[2] + nz];
    const vert = (q, aa) => v.push(q[0], q[1], q[2], col[0], col[1], col[2], aa);
    vert(A, al); vert(Bq, al); vert(C, al); vert(A, al); vert(C, al); vert(D, al);
  };
  const vquad = (a, b, w, col, al) => { // vertical ribbon (visible from the side)
    const A = [a[0], a[1] - w, a[2]], Bq = [a[0], a[1] + w, a[2]], C = [b[0], b[1] + w, b[2]], D = [b[0], b[1] - w, b[2]];
    const vert = (q) => v.push(q[0], q[1], q[2], col[0], col[1], col[2], al);
    vert(A); vert(Bq); vert(C); vert(A); vert(C); vert(D);
  };
  for (const r of ribbons) {
    const k = r.t / r.life, al = 1 - k;
    if (r.kind === 'ring') {
      const rr = r.r * (0.3 + k * 1.2), n = 24, rw = Math.max(0.05, WPP * 2);
      for (let i = 0; i < n; i++) { const a0 = i / n * 6.283, a1 = (i + 1) / n * 6.283; quadTo([r.a[0] + Math.cos(a0) * rr, r.a[1], r.a[2] + Math.sin(a0) * rr], [r.a[0] + Math.cos(a1) * rr, r.a[1], r.a[2] + Math.sin(a1) * rr], rw, r.col, al); }
    } else if (r.kind === 'shot') {
      const arc = r.arc || 0.6, sw = Math.max(0.06, WPP * 2.5);
      const p = lerp3(r.a, r.b, Math.min(1, k * 1.1)); p[1] += Math.sin(Math.min(1, k * 1.1) * Math.PI) * arc;
      const q = lerp3(r.a, r.b, Math.max(0, k * 1.1 - 0.12)); q[1] += Math.sin(Math.max(0, k * 1.1 - 0.12) * Math.PI) * arc;
      vquad(q, p, sw, r.col, 1); quadTo(q, p, sw, r.col, 1);
    } else if (r.kind === 'bolt' || r.kind === 'beam' || r.kind === 'laser') {
      const segs = 8; let prev = r.a;
      for (let i = 1; i <= segs; i++) {
        const p = lerp3(r.a, r.b, i / segs);
        if (r.kind === 'bolt' && i < segs) { p[0] += (Math.random() - 0.5) * 0.3; p[1] += (Math.random() - 0.5) * 0.3; p[2] += (Math.random() - 0.5) * 0.3; }
        const bw = Math.max(r.kind === 'laser' ? 0.08 : 0.05, WPP * (r.kind === 'laser' ? 3 : 2));
        vquad(prev, p, bw, r.col, al); quadTo(prev, p, bw, r.col, al);
        prev = p;
      }
    } else if (r.kind === 'souls') {
      const arc = Math.max(1.2, Math.hypot(r.b[0] - r.a[0], r.b[2] - r.a[2]) * 0.15);
      for (let i = 0; i < 3; i++) { const kk = Math.min(1, Math.max(0, k * 1.3 - i * 0.12)); const p = lerp3(r.a, r.b, kk); p[1] += Math.sin(kk * Math.PI) * arc; spark(p, r.col, 1, 0.1, 0); }
    }
  }
  // attack declarations: arcs from attackers to their targets
  for (const a of arrows) {
    const A = spotPos(a.side, a.lane, 'c'), B2 = spotPos(a.toSide, a.toLane, a.toSlot || 'c');
    A[1] += 0.1; B2[1] += 0.1;
    const arcH = Math.max(0.9, Math.hypot(B2[0] - A[0], B2[2] - A[2]) * 0.14), w1 = Math.max(0.035, WPP * 1.6), w2 = Math.max(0.05, WPP * 2.2);
    const n = 20; let prev = A;
    const col = a.col || (a.side === 0 ? [0.5, 0.75, 1] : [1, 0.65, 0.3]);
    for (let i = 1; i <= n; i++) {
      const t2 = i / n; const p = lerp3(A, B2, t2); p[1] += Math.sin(t2 * Math.PI) * arcH;
      const al = 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(time * 6 - t2 * 6));
      vquad(prev, p, w1, col, al); quadTo(prev, p, w2, col, al);
      prev = p;
    }
  }
  if (v.length) drawRb(v, false);
}
function lerp3(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function drawParticles() {
  if (!particles.length) return;
  const n = particles.length;
  if (ptData.length < n * 8) ptData = new Float32Array(n * 8 * 2);
  for (let i = 0; i < n; i++) {
    const p = particles[i], k = 1 - p.t / p.life, o = i * 8;
    ptData[o] = p.x; ptData[o + 1] = p.y; ptData[o + 2] = p.z; ptData[o + 3] = p.r; ptData[o + 4] = p.g; ptData[o + 5] = p.b; ptData[o + 6] = Math.min(1, k * 1.5); ptData[o + 7] = p.s;
  }
  const pr = progs.pt;
  GL3.use(ctx, pr); GL3.updateBuffer(ctx, ptBuf, ptData, n * 8); GL3.resetBindings(); GL3.use(ctx, pr); GL3.attribs(ctx, pr, ptBuf);
  gl.uniformMatrix4fv(pr.u.uVP, false, VP);
  gl.uniform1f(pr.u.uScale, canvas.height / 34);
  gl.drawArrays(gl.POINTS, 0, n);
}

// ------------------------------------------------------------------ table cards
let cardMeshFront = null, cardMeshBack = null, cardEdge = null, backTex = null;
function cardMeshes() {
  if (cardMeshFront) return;
  const w = CARD_W / 2, h = CARD_H / 2, t = 0.008 * WK;
  cardMeshFront = texMesh(texQuad(-w, t, h, 2 * w, 0, 0, 0, 0, -2 * h, 0, 1, 1, 0, 1));
  cardMeshBack = texMesh(texQuad(w, -0.001, h, -2 * w, 0, 0, 0, 0, -2 * h, 0, 1, 1, 0, 1));
  const e = new Models.Builder(); e.c('#f4f4ee').box(CARD_W, t, CARD_H);
  cardEdge = meshFrom(e);
  backTex = GL3.texture(ctx, () => cardBackCanvas(256, 358), {});
}
function faceTexture(id) {
  let t = faceTex.get(id);
  if (t && !t.dirty) return t;
  const art = artCanvas(id);
  const cv = cardFaceCanvas(id, art, 256, 358);
  if (t) GL3.freeTexture(ctx, t.tex);
  t = { tex: GL3.texture(ctx, cv, {}), dirty: !art };
  faceTex.set(id, t);
  return t;
}
function drawCards() {
  cardMeshes();
  // card rows: building and creature cards per lane, plus decks
  const list = [...cards.values()];
  meshBegin(false);
  for (const c of list) {
    const y = c.pos[1] + c.lift * 0.25 * WK;
    const yaw = (c.side === 0 ? 0 : Math.PI) + c.rot;
    M4.trs(MOD, c.pos[0], y, c.pos[2], yaw, 0, 0, 1, 1, 1);
    drawMesh(cardEdge.buf, cardEdge.count, MOD, { outline: 0.012 * WK, outCol: [0.15, 0.15, 0.15] });
  }
  for (const side of [0, 1]) {
    if (!st) continue;
    const P = st.players[side];
    for (const which of ['deck', 'discard']) {
      const n = which === 'deck' ? P.deck.length : P.discard.length; if (!n) continue;
      const d = deckPos(side, which), hgt = Math.min(0.35, n * 0.018) * WK;
      M4.trs(MOD, d[0], hgt / 2, d[2], side === 0 ? 0 : Math.PI, 0, 0, 1, hgt / (0.008 * WK), 1);
      drawMesh(cardEdge.buf, cardEdge.count, MOD, { outline: 0.012 * WK, outCol: [0.15, 0.15, 0.15] });
    }
  }
  const p = progs.tex;
  GL3.use(ctx, p); gl.uniformMatrix4fv(p.u.uVP, false, VP); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
  for (const c of list) {
    const y = c.pos[1] + c.lift * 0.25 * WK;
    const yaw = (c.side === 0 ? 0 : Math.PI) + c.rot;
    M4.trs(MOD, c.pos[0], y + 0.001, c.pos[2], yaw, 0, 0, 1, 1, 1);
    const tex = c.faceUp ? faceTexture(c.id).tex : backTex;
    drawTex(cardMeshFront, tex, MOD, [1, 1, 1, 1], [c.lift * 0.4, c.lift * 0.4, c.lift * 0.3]);
  }
  for (const side of [0, 1]) {
    if (!st) continue;
    const P = st.players[side];
    if (P.deck.length) { const d = deckPos(side, 'deck'), hgt = Math.min(0.35, P.deck.length * 0.018) * WK; M4.trs(MOD, d[0], hgt + 0.002, d[2], side === 0 ? 0 : Math.PI, 0, 0, 1, 1, 1); drawTex(cardMeshFront, backTex, MOD, [1, 1, 1, 1]); }
    if (P.discard.length) { const d = deckPos(side, 'discard'), hgt = Math.min(0.35, P.discard.length * 0.018) * WK; M4.trs(MOD, d[0], hgt + 0.002, d[2], side === 0 ? 0.08 : Math.PI + 0.08, 0, 0, 1, 1, 1); drawTex(cardMeshFront, faceTexture(P.discard[P.discard.length - 1].id).tex, MOD, [1, 1, 1, 1]); }
  }
  // the land cards, flooped at the start ("floop your land cards")
  if (introT >= 0 || setupMode) {
    for (let side = 0; side < 2; side++) for (let l = 0; l < 4; l++) {
      const k = introT >= 0 ? Math.min(1, Math.max(0, (introT - l * 0.12 - side * 0.3) / 0.5)) : 0;
      const x = LANE_X(l), z = sideZ(side) * LANDCARD_Z;
      M4.trs(MOD, x, 0.02 + Math.sin(k * Math.PI) * 0.4 * WK, z, (side === 0 ? 0 : Math.PI) + k * Math.PI / 2, 0, 0, 1, 1, 1);
      const L = st ? st.players[side].lanes[l].land : { type: 'blue' };
      drawTex(cardMeshFront, k > 0.5 ? landCardTex(L.orig || L.type) : backTex, MOD, [1, 1, 1, 1 - Math.max(0, k - 0.8) * 5]);
    }
  }
}
function landCardTex(type) {
  return labelTex('landcard:' + type, 256, 358, (g, w, h) => {
    g.fillStyle = '#ffffff'; roundRect(g, 0, 0, w, h, 14); g.fill();
    g.fillStyle = (LAND_TEX[type] || LAND_TEX.down)[0]; roundRect(g, 12, 12, w - 24, h - 24, 10); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(12, h - 74, w - 24, 52);
    g.fillStyle = '#ffffff'; g.font = 'bold 30px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText((Engine.LANDS[type] || { name: type }).name, w / 2, h - 48);
  });
}

// ------------------------------------------------------------------ the opponent behind the table
function setOpponent(id) {
  if (oppEnt && oppEnt.buf) GL3.freeBuffer(ctx, oppEnt.buf);
  oppEnt = null; opponent = id || null;
  if (!id) return;
  const mid = Models.OPPONENT[id] || 'jake';
  const m = Models.build(mid);
  const tag = Models.tag(mid);
  oppEnt = { model: m, buf: GL3.buffer(ctx, m.data), scale: (tag.h || 2.4) / m.h * 1.55 * WK, hold: tag.hold || [0, 0.55, 0.8], bob: 0, react: 0 };
}
function oppReact(kind) { if (oppEnt) { oppEnt.react = 1; oppEnt.kind = kind; } }
function drawOpponent() {
  if (!oppEnt) return;
  meshBegin(false);
  const s = oppEnt.scale, far = viewer === 0 ? -1 : 1, z = far * OPP_Z;
  oppEnt.react = Math.max(0, oppEnt.react - 1 / 60);
  const hop = oppEnt.kind === 'win' ? Math.abs(Math.sin(time * 9)) * 0.3 * oppEnt.react : oppEnt.react * Math.sin(time * 20) * 0.05;
  const y0 = (-0.75 + Math.sin(time * 1.4) * 0.03 + hop) * WK, yaw = viewer === 0 ? 0 : Math.PI;
  M4.trs(MOD, 0, y0, z, yaw, 0, 0, s, s, s);
  const b = boneAngles({ model: oppEnt.model, walking: 0, lunge: 0, walk: 0, bob: 0 });
  drawMesh(oppEnt.buf, oppEnt.model.count, MOD, { outline: 0.028 * WK / s, outCol: [0.12, 0.08, 0.03], bones: b });
  // the fan of cards they hold up in front of their face (red backs toward us)
  if (st) {
    const n = Math.min(8, st.players[1 - viewer].hand.length);
    if (!n) return;
    cardMeshes();
    const p = progs.tex; GL3.use(ctx, p); gl.uniformMatrix4fv(p.u.uVP, false, VP); gl.disable(gl.CULL_FACE);
    const hx = oppEnt.hold[0] * s, hy = y0 + oppEnt.hold[1] * s, hz = z - far * oppEnt.hold[2] * s;
    for (let i = 0; i < n; i++) {
      const a = (i - (n - 1) / 2) * 0.17;
      M4.trs(MOD, hx + Math.sin(a) * 0.55 * WK, hy + (Math.cos(a) * 0.12 - 0.12) * WK, hz - far * (0.02 * i) * WK, yaw - a * 0.25, Math.PI / 2 - 0.25, -a, 0.95, 0.95, 0.95);
      drawTex(cardMeshFront, backTex, MOD, [1, 1, 1, 1]);
    }
  }
}

// ------------------------------------------------------------------ card art (rendered from the 3D models)
let artTarget = null;
const ART_W = 384, ART_H = 288;
function artCanvas(id) { return artCache.get(id) || (queueArt(id), null); }
function queueArt(id) { if (!artQueue.includes(id) && !artCache.has(id)) artQueue.push(id); }
function onArt(fn) { artListeners.push(fn); }
function pumpArt() {
  if (!artQueue.length || lost) return;
  const t0 = performance.now();
  let n = 0;
  while (artQueue.length && (n === 0 || performance.now() - t0 < 6)) { const id = artQueue.shift(); try { artCache.set(id, renderArt(id)); } catch (e) { artCache.set(id, mkCanvas(4, 4)); } n++; }
  artVersion++;
  for (const id of faceTex.keys()) if (faceTex.get(id).dirty && artCache.has(id)) faceTex.get(id).dirty = true;
  artListeners.forEach(f => { try { f(); } catch (e) { /* ignore */ } });
}
function renderArt(id) {
  const cd = Engine.CARDS[id] || { art: id, land: 'rainbow', type: 'creature' };
  const art = cd.art || id;
  const m = Models.build(art);
  if (!artTarget) artTarget = GL3.target(ctx, ART_W, ART_H);
  gl.bindFramebuffer(gl.FRAMEBUFFER, artTarget.fb);
  gl.viewport(0, 0, ART_W, ART_H);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.disable(gl.BLEND);
  const h = Math.max(0.3, m.h), r = Math.max(0.3, m.r);
  const vp = M4.create(), pr = M4.create(), vw = M4.create();
  const big = Math.max(h, r * 1.6);
  const eye = [big * 1.05, h * 0.9 + big * 0.35, big * 2.3], tgt = [0, h * 0.46, 0];
  M4.perspective(pr, 0.62, ART_W / ART_H, 0.05, 50);
  M4.lookAt(vw, eye, tgt, [0, 1, 0]);
  M4.mul(vp, pr, vw);
  GL3.resetBindings();
  const p = progs.mesh;
  GL3.use(ctx, p);
  gl.uniformMatrix4fv(p.u.uVP, false, vp);
  gl.uniform3fv(p.u.uLight, LIGHT); gl.uniform3fv(p.u.uCam, eye); gl.uniform1f(p.u.uTime, 1.3); gl.uniform1f(p.u.uFT, 1.3); gl.uniform1f(p.u.uSway, 0);
  gl.uniformMatrix4fv(p.u.uB, false, IDBONES);
  const buf = GL3.buffer(ctx, m.data);
  const isB = cd.type === 'building';
  const lc = rgb(LANDC[cd.land] || '#ffffff');
  drawMesh(buf, m.count, IDENT, { holo: true, outline: 0.02 * big, outCol: mix(lc, [1, 1, 1], 0.55), glowCol: mix(lc, [1, 1, 1], 0.5), tint: isB ? [lc[0], lc[1], lc[2], 0.35] : [0, 0, 0, 0], alpha: 1 });
  const px = new Uint8Array(ART_W * ART_H * 4);
  gl.readPixels(0, 0, ART_W, ART_H, gl.RGBA, gl.UNSIGNED_BYTE, px);
  GL3.freeBuffer(ctx, buf);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  GL3.resetBindings();
  // compose: land-colored backdrop + the hologram, flipped right side up
  const c = mkCanvas(ART_W / 2, ART_H / 2), g = c.getContext('2d');
  const tmp = mkCanvas(ART_W, ART_H), tg = tmp.getContext('2d');
  const img = tg.createImageData(ART_W, ART_H);
  for (let y = 0; y < ART_H; y++) img.data.set(px.subarray((ART_H - 1 - y) * ART_W * 4, (ART_H - y) * ART_W * 4), y * ART_W * 4);
  tg.putImageData(img, 0, 0);
  const grd = g.createRadialGradient(c.width / 2, c.height * 0.45, 4, c.width / 2, c.height / 2, c.width * 0.75);
  grd.addColorStop(0, shade(LANDC[cd.land] || '#8888aa', 0.15)); grd.addColorStop(1, shade(LANDC[cd.land] || '#8888aa', -0.62));
  g.fillStyle = grd; g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 1;
  for (let y = 0; y < c.height; y += 4) { g.beginPath(); g.moveTo(0, y); g.lineTo(c.width, y); g.stroke(); }
  g.drawImage(tmp, 0, 0, c.width, c.height);
  return c;
}
function shade(hex, k) { const c = rgb(hex); const f = v => Math.max(0, Math.min(255, Math.round((k >= 0 ? v + (1 - v) * k : v * (1 + k)) * 255))); return 'rgb(' + f(c[0]) + ',' + f(c[1]) + ',' + f(c[2]) + ')'; }
// Data URL of a card's art for the DOM (falls back to a blank while it's being rendered).
const artURLs = new Map();
function cardArtURL(id) {
  if (artURLs.has(id)) return artURLs.get(id);
  const c = artCanvas(id); if (!c) return '';
  const u = c.toDataURL('image/png'); artURLs.set(id, u); return u;
}
// Card face for the table cards (the DOM hand has its own HTML face).
function cardFaceCanvas(id, art, w, h) {
  const cd = Engine.CARDS[id] || Engine.CARDS['?'];
  const c = mkCanvas(w, h), g = c.getContext('2d');
  const lc = LANDC[cd.land] || '#cccccc';
  g.fillStyle = '#ffffff'; roundRect(g, 0, 0, w, h, w * 0.06); g.fill();
  g.fillStyle = shade(lc, -0.25); roundRect(g, w * 0.05, w * 0.05, w * 0.9, h - w * 0.1, w * 0.04); g.fill();
  if (art) g.drawImage(art, w * 0.09, h * 0.15, w * 0.82, w * 0.82 * 0.75);
  else { g.fillStyle = shade(lc, -0.5); g.fillRect(w * 0.09, h * 0.15, w * 0.82, w * 0.62); }
  g.fillStyle = '#ffffff'; g.font = 'bold ' + Math.round(w * 0.085) + 'px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const name = cd.name || '';
  g.fillText(name.length > 18 ? name.slice(0, 17) + '…' : name, w / 2, h * 0.09);
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(w * 0.09, h * 0.73, w * 0.82, h * 0.17);
  g.fillStyle = '#ffffff'; g.font = Math.round(w * 0.055) + 'px sans-serif';
  const typ = (cd.r === 'K' ? 'Landmark' : cd.type ? cd.type[0].toUpperCase() + cd.type.slice(1) : '');
  g.fillText(((Engine.LANDS[cd.land] || {}).name || '') + ' ' + typ, w / 2, h * 0.78);
  if (cd.type === 'creature') { g.font = 'bold ' + Math.round(w * 0.11) + 'px sans-serif'; g.textAlign = 'right'; g.fillText(cd.atk + '/' + cd.def, w * 0.9, h * 0.86); }
  if (cd.type === 'building') { g.font = 'bold ' + Math.round(w * 0.1) + 'px sans-serif'; g.textAlign = 'right'; g.fillText('' + cd.def, w * 0.9, h * 0.86); }
  if (cd.cost != null && cd.r !== 'K') { g.fillStyle = '#ffffff'; g.beginPath(); g.arc(w * 0.13, h * 0.09, w * 0.075, 0, 6.3); g.fill(); g.fillStyle = '#1a1a1a'; g.font = 'bold ' + Math.round(w * 0.09) + 'px sans-serif'; g.textAlign = 'center'; g.fillText('' + cd.cost, w * 0.13, h * 0.095); }
  return c;
}

// ------------------------------------------------------------------ 2D overlay (stats, labels, numbers)
function drawOverlay(dt) {
  const k = ov.width / W;
  oc.setTransform(k, 0, 0, k, 0, 0);
  oc.clearRect(0, 0, W, H);
  if (mode === 'home') return;
  // creature stats (show-style "ATK/DEF" under each hologram) and building toughness
  oc.textAlign = 'center'; oc.textBaseline = 'middle';
  const fs = Math.max(11, Math.min(16, W / 32));
  ents.forEach(e => {
    if (e.dying || e.rev < 0.6) return;
    const base = project([e.pos[0], e.pos[1], e.pos[2] + sideZ(e.side) * (e.kind === 'b' ? 1.5 : 0.5)]);
    if (base.x < -60 || base.x > W + 60 || base.y < -40 || base.y > H + 40) return;
    if (e.kind === 'c' && e.stats) {
      const s = e.stats, cd = Engine.CARDS[e.id] || {};
      const txt = s.atk + '/' + Math.max(0, s.hp);
      const dmg = e.c && e.c.dmg > 0;
      pill(base.x, base.y + fs * 0.4, txt, TEAMHEX[e.side], dmg ? '#ff6a6a' : '#ffffff', fs);
      let ix = base.x + measure(txt, fs) / 2 + fs * 0.7;
      const icons = [];
      if (e.act) icons.push(['⚔', '#ffd24a']);
      if (e.fl) icons.push(['↺', '#8affc8']);
      if (e.frozen) icons.push(['❄', '#9ae8ff']);
      if (e.c && e.c.burn) icons.push(['🔥', '#ff8a3a']);
      if (e.c && e.c.rot) icons.push(['☠', '#b0ff7a']);
      if (e.c && e.c.stuck) icons.push(['⚓', '#d8b08a']);
      if (e.c && e.c.shield) icons.push(['◈' + e.c.shield, '#ffd0f0']);
      if (e.nap) icons.push(['z', '#c8b8ff']);
      if (e.c && e.c.study > 0) icons.push(['📖', '#9ad0ff']);
      if (e.collapsed) icons.push(['✖', '#ff9a6a']);
      for (const [ic, col] of icons) { oc.font = 'bold ' + Math.round(fs * 0.9) + 'px sans-serif'; oc.fillStyle = 'rgba(0,0,0,0.6)'; oc.beginPath(); oc.arc(ix, base.y + fs * 0.4, fs * 0.62, 0, 6.3); oc.fill(); oc.fillStyle = col; oc.fillText(ic, ix, base.y + fs * 0.42); ix += fs * 1.35; }
      if (cbIcons && e.side !== viewer) { oc.fillStyle = TEAMHEX[e.side]; oc.font = 'bold ' + Math.round(fs * 0.7) + 'px sans-serif'; oc.fillText('▲', base.x - measure(txt, fs) / 2 - fs * 0.6, base.y + fs * 0.42); }
      void cd;
    } else if (e.kind === 'b' && e.b) {
      const txt = (e.b.hidden && e.side !== viewer ? '?' : '♜ ' + Math.max(0, e.hp));
      pill(base.x, base.y + fs * 0.4, txt, TEAMHEX[e.side], e.hp < e.max ? '#ffb0a0' : '#ffffff', fs * 0.85);
    }
  });
  // during setup: name your own (still face-down) landscapes, and mark the enemy's as unknown
  if (setupMode && st) for (const t of tiles) {
    const p = project([LANE_X(t.lane), TOP, sideZ(t.side) * (BD - 1.0)]);
    const L = st.players[t.side].lanes[t.lane].land;
    pill(p.x, p.y, t.side === viewer ? (Engine.LANDS[L.type] || { name: L.type }).name : '?', t.side === viewer ? LANDC[L.type] || '#ffffff' : '#7a8496', '#ffffff', fs * 0.8);
  }
  // floating texts and speech bubbles
  for (const t of texts) {
    const p = project([t.p[0], t.p[1] + t.t * (t.bubble ? 0 : 0.6), t.p[2]]);
    const a = Math.min(1, (t.life - t.t) / 0.3);
    oc.globalAlpha = a;
    if (t.bubble) bubble(p.x, p.y, t.txt, fs);
    else { oc.font = 'bold ' + Math.round(fs * (t.big ? 1.8 : 1.35)) + 'px sans-serif'; oc.lineWidth = 4; oc.strokeStyle = 'rgba(0,0,0,0.8)'; oc.strokeText(t.txt, p.x, p.y); oc.fillStyle = t.col; oc.fillText(t.txt, p.x, p.y); }
    oc.globalAlpha = 1;
  }
  // fight preview numbers
  if (preview && preview.length) for (const pv of preview) {
    const p = screenPos(pv.side, pv.lane, pv.slot || 'c', 0.6);
    oc.font = 'bold ' + Math.round(fs * 1.1) + 'px sans-serif';
    oc.lineWidth = 3; oc.strokeStyle = 'rgba(0,0,0,0.85)'; oc.strokeText(pv.txt, p.x, p.y); oc.fillStyle = pv.col || '#ffd24a'; oc.fillText(pv.txt, p.x, p.y);
  }
  if (dragGhost) { oc.globalAlpha = 0.9; oc.fillStyle = dragGhost.ok ? 'rgba(90,255,140,0.25)' : 'rgba(255,90,90,0.18)'; oc.beginPath(); oc.arc(dragGhost.x, dragGhost.y, 34, 0, 6.3); oc.fill(); oc.globalAlpha = 1; }
  for (const f of flashes) { oc.fillStyle = 'rgba(' + Math.round(f.col[0] * 255) + ',' + Math.round(f.col[1] * 255) + ',' + Math.round(f.col[2] * 255) + ',' + (f.a * (1 - f.t / f.life)) + ')'; oc.fillRect(0, 0, W, H); }
}
function measure(t, fs) { oc.font = 'bold ' + Math.round(fs) + 'px sans-serif'; return oc.measureText(t).width; }
function pill(x, y, txt, border, col, fs) {
  oc.font = 'bold ' + Math.round(fs) + 'px sans-serif';
  const w = oc.measureText(txt).width + fs * 0.9, h = fs * 1.35;
  oc.fillStyle = 'rgba(10,14,24,0.82)'; roundRect(oc, x - w / 2, y - h / 2, w, h, h / 2); oc.fill();
  oc.lineWidth = 2; oc.strokeStyle = border; oc.stroke();
  oc.fillStyle = col; oc.fillText(txt, x, y + 1);
}
function bubble(x, y, txt, fs) {
  oc.font = 'bold ' + Math.round(fs * 1.05) + 'px sans-serif';
  const w = Math.min(W * 0.7, oc.measureText(txt).width + fs * 1.4), h = fs * 2;
  const bx = Math.max(6, Math.min(W - w - 6, x - w / 2)), by = Math.max(6, y - h - fs);
  oc.fillStyle = '#ffffff'; roundRect(oc, bx, by, w, h, fs * 0.6); oc.fill();
  oc.beginPath(); oc.moveTo(x - 6, by + h - 1); oc.lineTo(x + 6, by + h - 1); oc.lineTo(x, by + h + fs * 0.6); oc.closePath(); oc.fill();
  oc.lineWidth = 2; oc.strokeStyle = '#1a1a1a'; roundRect(oc, bx, by, w, h, fs * 0.6); oc.stroke();
  oc.fillStyle = '#1a1a1a'; oc.fillText(txt, bx + w / 2, by + h / 2 + 1);
}

// ------------------------------------------------------------------ misc
function clearFx() { particles.length = 0; ribbons.length = 0; texts.length = 0; flashes.length = 0; bigs.forEach(b => b.buf && GL3.freeBuffer(ctx, b.buf)); bigs.length = 0; arrows = []; preview = null; }
function reset() { ents.forEach(dropEnt); ents.clear(); cards.clear(); clearFx(); st = null; setupMode = false; introT = -1; introCb = null; for (const t of tiles) { t.type = null; if (t.decor) GL3.freeBuffer(ctx, t.decor.buf); t.decor = null; } }
function setOptions(o) { if (o.reduceMotion != null) reduceMotion = !!o.reduceMotion; if (o.cbIcons != null) cbIcons = !!o.cbIcons; }
function busy() { let b = false; ents.forEach(e => { if (e.lunge > 0 || e.walking || (e.dying && !e.quiet) || e.rev < 1) b = true; }); return b || ribbons.length > 0 || bigs.length > 0 || introT >= 0; }
function setKingdomShown(v) { kingdomShown = v; }
function landColor(t) { return LANDC[t] || '#ffffff'; }

return {
  init, resize, setQuality, frame, setState, setViewer, setMode, setInsets, setOptions, setOpponent, oppReact, reset, clearFx, busy,
  pick, boardPoint, screenPos, headPos, project, zoomBy, orbitBy, panBy, panPixels, resetView, setView, toggleView, frameSpots, attackTime,
  setHighlights, setSelection, setArrows, setPreview, setHover, setGhost, setKingdomShown, setSetup,
  fx, cardArtURL, artCanvas, queueArt, onArt, landColor, TEAMHEX, LANDC, cardBackCanvas,
  get ready() { return ready; }, get viewer() { return viewer; }, get artVersion() { return artVersion; }, get setupMode() { return setupMode; }, get view() { return camView; }, stats
};
})();
/* END SCENE */
