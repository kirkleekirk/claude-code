/* RENDER */
// Canvas renderer: tilted tabletop camera, felt landscapes, hologram minis, effects and particles.
var Render = (function () {
'use strict';
const E = Engine;
const TEAM = ['#3fc8ff', '#ff9a2e'];
const TEAM_RGB = [[63, 200, 255], [255, 154, 46]];
const LANDC = { blue: '#4aa8ff', corn: '#ffcf3a', swamp: '#b077f0', ice: '#8fe9ff', nice: '#ff8fd0', lava: '#ff6b3d', rainbow: '#d9cff7' };
const FELT = { blue: '#2d63a8', corn: '#a98a1e', swamp: '#4d3a6c', ice: '#4e9fb8', nice: '#b3507f', lava: '#a8402a' };
const R = {
  cv: null, x: null, W: 0, H: 0, dpr: 1, t: 0,
  mode: 'home', st: null, viewer: 0, colors: TEAM.slice(),
  rect: { x: 0, y: 0, w: 100, h: 100 },
  cam: { tilt: 40 * Math.PI / 180, D: 8, F: 100, cx: 0, cy: 0, zoom: 1, panX: 0, panY: 0 },
  hl: [], preview: null, sel: null, hover: null, ghost: null,
  reduceMotion: false, cbIcons: true, quality: 1,
  heroAnchor: null, onShake: null
};
const S = Math.sin, Cc = Math.cos;
let bg = null, bgKey = '', board = null, boardKey = '', combo = null, comboKey = '';
let shakeT = 0, shakeA = 0, hitStop = 0;

// ------------------------------------------------------------------ setup
R.init = function (canvas) {
  R.cv = canvas; R.x = canvas.getContext('2d');
  R.resize();
};
R.resize = function () {
  const dpr = Math.min(2, window.devicePixelRatio || 1) * (R.quality < 1 ? 0.75 : 1);
  R.dpr = dpr; R.W = window.innerWidth; R.H = window.innerHeight;
  R.cv.width = Math.round(R.W * dpr); R.cv.height = Math.round(R.H * dpr);
  bgKey = ''; boardKey = '';
};
R.setRect = function (r) { R.rect = r; fitCamera(); boardKey = ''; };
R.setState = function (st, viewer) {
  R.st = st; if (viewer != null && viewer !== R.viewer) { R.viewer = viewer; boardKey = ''; }
};
R.resetView = function () { R.cam.zoom = 1; R.cam.panX = 0; R.cam.panY = 0; fitCamera(); boardKey = ''; };

// ------------------------------------------------------------------ camera
const BOARD = { hx: 2.2, hz: 3.05 };
const ROW = { c: 0.98, b: 2.3 };
function laneX(l) { return (R.viewer === 0 ? 1 : -1) * (l - 1.5); }
function sideSign(side) { return side === R.viewer ? -1 : 1; }
function rowZ(side, slot) { return sideSign(side) * (slot === 'b' ? ROW.b : ROW.c); }
function rawProj(x, y, z, F, cx, cy) {
  const c = R.cam, depth = c.D + z * S(c.tilt) - y * Cc(c.tilt);
  const s = F / depth;
  return { x: cx + x * s, y: cy - (y * S(c.tilt) + z * Cc(c.tilt)) * s, s };
}
function fitCamera() {
  const r = R.rect; if (!r.w) return;
  const pts = [];
  for (const x of [-BOARD.hx, BOARD.hx]) for (const z of [-BOARD.hz, BOARD.hz]) pts.push(rawProj(x, 0, z, 1, 0, 0));
  for (const x of [-BOARD.hx, BOARD.hx]) pts.push(rawProj(x, 1.3, ROW.b + 0.1, 1, 0, 0));
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (const p of pts) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
  const F = Math.min(r.w * 0.97 / (maxX - minX), r.h * 0.97 / (maxY - minY));
  const c = R.cam;
  c.baseF = F;
  c.F = F * c.zoom;
  c.cx = r.x + r.w / 2 - ((minX + maxX) / 2) * c.F + c.panX;
  c.cy = r.y + r.h / 2 - ((minY + maxY) / 2) * c.F + c.panY;
}
function P(x, y, z) { const c = R.cam; return rawProj(x, y, z, c.F, c.cx, c.cy); }
R.P = P;
// screen -> ground plane (y = 0)
function unproject(sx, sy) {
  const c = R.cam, k = (c.cy - sy) / c.F;
  const z = k * c.D / (Cc(c.tilt) - k * S(c.tilt));
  const depth = c.D + z * S(c.tilt);
  return { x: (sx - c.cx) * depth / c.F, z };
}
R.unproject = unproject;
R.zoomBy = function (f, ax, ay) {
  const c = R.cam, nz = Math.max(1, Math.min(2.4, c.zoom * f)); if (nz === c.zoom) return;
  const before = { x: ax, y: ay };
  const ratio = nz / c.zoom; c.zoom = nz;
  c.panX = (c.panX + (c.cx - before.x) * (ratio - 1)) ; c.panY = (c.panY + (c.cy - before.y) * (ratio - 1));
  clampPan(); fitCamera(); boardKey = '';
};
R.panBy = function (dx, dy) { if (R.cam.zoom <= 1.001) return; R.cam.panX += dx; R.cam.panY += dy; clampPan(); fitCamera(); boardKey = ''; };
function clampPan() { const c = R.cam, lim = (c.zoom - 1) * Math.max(R.rect.w, R.rect.h) * 0.6; c.panX = Math.max(-lim, Math.min(lim, c.panX)); c.panY = Math.max(-lim, Math.min(lim, c.panY)); if (c.zoom <= 1.001) { c.panX = 0; c.panY = 0; } }

R.slotPos = function (side, lane, slot) { return P(laneX(lane), 0, rowZ(side, slot || 'c')); };
R.headPos = function (side, lane, slot) { const h = slot === 'b' ? 1.2 : 1.22; const p = P(laneX(lane), 0, rowZ(side, slot || 'c')); return { x: p.x, y: p.y - p.s * h * 0.92, s: p.s }; };
R.edgePos = function (side) { return P(0, 0.2, sideSign(side) * (BOARD.hz + 0.15)); };
// hit-test: which cell is under the pointer
R.hit = function (sx, sy) {
  const g = unproject(sx, sy);
  if (Math.abs(g.x) > BOARD.hx + 0.1 || Math.abs(g.z) > BOARD.hz + 0.25) return null;
  let lane = -1, best = 9;
  for (let l = 0; l < 4; l++) { const d = Math.abs(g.x - laneX(l)); if (d < best) { best = d; lane = l; } }
  if (best > 0.62) return null;
  const side = g.z < 0 ? R.viewer : 1 - R.viewer;
  const az = Math.abs(g.z);
  // creatures stand up: a tap a little above the creature's feet still counts
  const slot = az < (ROW.c + ROW.b) / 2 + 0.05 ? 'c' : 'b';
  return { side, lane, slot, gx: g.x, gz: g.z };
};
// a tap on a standing miniature (sprite area) – checked before ground hits
R.hitMini = function (sx, sy) {
  if (!R.st) return null;
  let found = null, bestD = 1e9;
  for (let side = 0; side < 2; side++) for (let l = 0; l < 4; l++) for (const slot of ['c', 'b']) {
    const L = R.st.players[side].lanes[l], obj = slot === 'c' ? L.creature : L.building; if (!obj) continue;
    const p = R.slotPos(side, l, slot), h = (slot === 'b' ? 1.2 : 1.22) * p.s, w = h * 0.7;
    if (sx > p.x - w / 2 && sx < p.x + w / 2 && sy > p.y - h && sy < p.y + 0.12 * p.s) {
      const d = Math.abs(sx - p.x) + Math.abs(sy - (p.y - h / 2)) * 0.5;
      if (d < bestD) { bestD = d; found = { side, lane: l, slot }; }
    }
  }
  return found;
};

// ------------------------------------------------------------------ utils
function rnd(seed) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function rgba(rgb, a) { return 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + a + ')'; }
function hex(h) { return Art.hexToRgb(h); }
function shade(h, t) { const c = hex(h); return t < 0 ? c.map(v => Math.round(v * (1 + t))) : c.map(v => Math.round(v + (255 - v) * t)); }
function polyPath(x, pts) { x.beginPath(); pts.forEach((p, i) => (i ? x.lineTo(p.x, p.y) : x.moveTo(p.x, p.y))); x.closePath(); }
function rr(x, X, Y, w, h, r) { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath(); }
function ease(t) { return t < 0 ? 0 : t > 1 ? 1 : 1 - Math.pow(1 - t, 3); }
function easeIO(t) { t = Math.max(0, Math.min(1, t)); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

// ------------------------------------------------------------------ background: table + props
function drawTable(x, W, H) {
  const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#5a3418'); g.addColorStop(1, '#3a2010');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  const r = rnd(77), plank = Math.max(60, W / 7);
  for (let i = 0; i * plank < W + plank; i++) {
    const px = i * plank;
    x.fillStyle = 'rgba(' + (90 + r() * 30) + ',' + (50 + r() * 20) + ',' + (22 + r() * 10) + ',0.55)'; x.fillRect(px, 0, plank - 2, H);
    x.strokeStyle = 'rgba(30,14,4,0.6)'; x.lineWidth = 2; x.beginPath(); x.moveTo(px, 0); x.lineTo(px, H); x.stroke();
    x.strokeStyle = 'rgba(255,220,170,0.05)'; x.lineWidth = 1;
    for (let k = 0; k < 7; k++) { const gx = px + 6 + r() * (plank - 12); x.beginPath(); x.moveTo(gx, 0); for (let y = 0; y <= H; y += 40) x.lineTo(gx + S(y / 90 + k) * 4, y); x.stroke(); }
    if (r() < 0.6) { const kx = px + plank * (0.2 + r() * 0.6), ky = r() * H; x.strokeStyle = 'rgba(40,18,6,0.45)'; x.beginPath(); x.ellipse(kx, ky, 5 + r() * 6, 12 + r() * 10, 0, 0, 7); x.stroke(); }
  }
}
function drawProps(x, W, H, rect) {
  const u = Math.max(30, Math.min(W, H) / 11);
  // chip bag (top-left)
  x.save(); x.translate(u * 0.9, u * 1.2); x.rotate(-0.35);
  x.fillStyle = '#d7323f'; rr(x, -u * 0.9, -u * 1.1, u * 1.8, u * 2.2, u * 0.25); x.fill();
  x.fillStyle = '#ffd23f'; x.font = '900 ' + Math.round(u * 0.42) + 'px sans-serif'; x.textAlign = 'center'; x.fillText('CHIPS', 0, 0);
  x.fillStyle = 'rgba(255,255,255,.25)'; x.fillRect(-u * 0.8, -u * 1.05, u * 0.25, u * 2.1);
  x.restore();
  for (let i = 0; i < 6; i++) { x.fillStyle = '#f2c35a'; x.beginPath(); x.ellipse(u * (2.1 + i * 0.35), u * (0.6 + (i % 3) * 0.4), u * 0.22, u * 0.14, i, 0, 7); x.fill(); }
  // cups (top-right): DWEEB + COOL GUY
  [['DWEEB', '#7a4a1a', -1.35], ['COOL GUY', '#5b2d0e', 0]].forEach(([lbl, liq, off], i) => {
    const cx = W - u * (1.05 + i * 1.5), cy = u * (1.1 + i * 0.3);
    x.fillStyle = 'rgba(0,0,0,.35)'; x.beginPath(); x.ellipse(cx + u * 0.15, cy + u * 0.2, u * 0.72, u * 0.72, 0, 0, 7); x.fill();
    x.fillStyle = '#e9f2ff'; x.beginPath(); x.arc(cx, cy, u * 0.66, 0, 7); x.fill();
    x.fillStyle = liq; x.beginPath(); x.arc(cx, cy, u * 0.52, 0, 7); x.fill();
    if (i === 0) { x.fillStyle = '#7bd36a'; x.beginPath(); x.arc(cx - u * 0.15, cy + u * 0.1, u * 0.12, 0, 7); x.fill(); x.fillStyle = '#ff4fa0'; x.beginPath(); x.arc(cx + u * 0.18, cy - u * 0.12, u * 0.09, 0, 7); x.fill(); }
    x.fillStyle = '#1b1424'; x.font = '900 ' + Math.round(u * 0.2) + 'px sans-serif'; x.textAlign = 'center'; x.fillText(lbl, cx, cy + u * 0.92);
  });
  // dice (bottom-left)
  [[u * 0.9, H - u * 1.1, 0.3, 5], [u * 1.9, H - u * 0.7, -0.5, 3]].forEach(([dx, dy, rot, n]) => {
    x.save(); x.translate(dx, dy); x.rotate(rot);
    x.fillStyle = '#f4f1ea'; rr(x, -u * 0.36, -u * 0.36, u * 0.72, u * 0.72, u * 0.12); x.fill();
    x.fillStyle = '#c4283a'; const pips = { 3: [[-1, -1], [0, 0], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]] }[n];
    pips.forEach(([a, b]) => { x.beginPath(); x.arc(a * u * 0.18, b * u * 0.18, u * 0.06, 0, 7); x.fill(); });
    x.restore();
  });
  // loose cards + soda bottle (bottom-right)
  [[-0.2, 0], [0.25, u * 0.25]].forEach(([rot, off]) => {
    x.save(); x.translate(W - u * 1.2 - off, H - u * 1.3); x.rotate(rot);
    x.fillStyle = '#2c2150'; rr(x, -u * 0.5, -u * 0.7, u, u * 1.4, u * 0.12); x.fill(); x.strokeStyle = '#8a7bd9'; x.lineWidth = 2; x.stroke();
    x.restore();
  });
  x.save(); x.translate(W - u * 2.6, H - u * 0.9); x.rotate(1.2);
  x.fillStyle = 'rgba(80,200,120,.75)'; rr(x, -u * 0.25, -u * 1.0, u * 0.5, u * 1.6, u * 0.2); x.fill(); x.fillStyle = '#e33'; x.fillRect(-u * 0.25, -u * 0.3, u * 0.5, u * 0.35);
  x.restore();
  // lamp glow vignette
  const v = x.createRadialGradient(W * 0.5, H * 0.38, Math.min(W, H) * 0.15, W * 0.5, H * 0.5, Math.max(W, H) * 0.75);
  v.addColorStop(0, 'rgba(255,190,110,0.10)'); v.addColorStop(0.6, 'rgba(0,0,0,0.05)'); v.addColorStop(1, 'rgba(0,0,0,0.62)');
  x.fillStyle = v; x.fillRect(0, 0, W, H);
}
function ensureBg() {
  const key = R.W + 'x' + R.H + R.mode;
  if (bg && bgKey === key) return;
  bgKey = key;
  bg = bg || document.createElement('canvas');
  bg.width = R.cv.width; bg.height = R.cv.height;
  const x = bg.getContext('2d'); x.setTransform(R.dpr, 0, 0, R.dpr, 0, 0);
  if (R.mode === 'home') drawDen(x, R.W, R.H); else { drawTable(x, R.W, R.H); drawProps(x, R.W, R.H, R.rect); }
}

// ------------------------------------------------------------------ home: wood-paneled den
function drawDen(x, W, H) {
  const wallH = H * 0.5;
  const g = x.createLinearGradient(0, 0, 0, wallH); g.addColorStop(0, '#3b2414'); g.addColorStop(1, '#5c3a20');
  x.fillStyle = g; x.fillRect(0, 0, W, wallH);
  const r = rnd(9), pw = Math.max(46, W / 12);
  for (let i = 0; i * pw < W; i++) {
    x.fillStyle = 'rgba(' + (110 + r() * 30) + ',' + (66 + r() * 20) + ',' + (34 + r() * 12) + ',0.35)'; x.fillRect(i * pw + 2, 0, pw - 4, wallH);
    x.fillStyle = 'rgba(20,8,2,.5)'; x.fillRect(i * pw, 0, 2, wallH);
  }
  // window with night sky
  const wx = W * 0.68, wy = H * 0.08, ww = Math.min(W * 0.22, 180), wh = ww * 0.8;
  x.fillStyle = '#16213f'; x.fillRect(wx, wy, ww, wh);
  for (let i = 0; i < 18; i++) { x.fillStyle = 'rgba(255,255,220,' + (0.4 + r() * 0.6) + ')'; x.fillRect(wx + r() * ww, wy + r() * wh, 1.6, 1.6); }
  x.fillStyle = '#f6efc2'; x.beginPath(); x.arc(wx + ww * 0.75, wy + wh * 0.3, ww * 0.1, 0, 7); x.fill();
  x.strokeStyle = '#2b170b'; x.lineWidth = 6; x.strokeRect(wx, wy, ww, wh); x.lineWidth = 3; x.beginPath(); x.moveTo(wx + ww / 2, wy); x.lineTo(wx + ww / 2, wy + wh); x.moveTo(wx, wy + wh / 2); x.lineTo(wx + ww, wy + wh / 2); x.stroke();
  // shelf
  x.fillStyle = '#2b170b'; x.fillRect(W * 0.05, H * 0.2, W * 0.32, 8);
  ['#e04a4a', '#4aa8ff', '#ffcf3a', '#7bd36a', '#b077f0'].forEach((c, i) => { x.fillStyle = c; x.fillRect(W * 0.07 + i * W * 0.045, H * 0.2 - 34 - (i % 2) * 6, W * 0.035, 34 + (i % 2) * 6); });
  // table
  const tg = x.createLinearGradient(0, wallH, 0, H); tg.addColorStop(0, '#7a4a24'); tg.addColorStop(1, '#3b200f');
  x.fillStyle = tg; x.fillRect(0, wallH, W, H - wallH);
  x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(0, wallH, W, 6);
  for (let i = 0; i < 9; i++) { x.strokeStyle = 'rgba(255,220,170,0.05)'; x.beginPath(); const yy = wallH + 12 + i * (H - wallH) / 9; x.moveTo(0, yy); x.bezierCurveTo(W * 0.3, yy - 6, W * 0.6, yy + 6, W, yy); x.stroke(); }
  const v = x.createRadialGradient(W * 0.5, H * 0.35, Math.min(W, H) * 0.1, W * 0.5, H * 0.5, Math.max(W, H) * 0.8);
  v.addColorStop(0, 'rgba(255,200,120,0.18)'); v.addColorStop(1, 'rgba(0,0,0,0.6)');
  x.fillStyle = v; x.fillRect(0, 0, W, H);
}
function drawHomeLive(x, t) {
  const W = R.W, H = R.H, wallH = H * 0.5, wide = W > H;
  // mini holo board on the table
  const cx = wide ? W * 0.27 : W * 0.5, cy = wide ? H * 0.86 : H * 0.83, bw = Math.min(W * (wide ? 0.3 : 0.7), 340), bh = bw * 0.36;
  x.save();
  x.fillStyle = 'rgba(10,8,24,.75)'; x.beginPath(); x.ellipse(cx, cy, bw / 2, bh / 2, 0, 0, 7); x.fill();
  x.strokeStyle = 'rgba(120,220,255,.5)'; x.lineWidth = 2; x.stroke();
  const ids = ['pig', 'husker', 'iceking', 'lich', 'fp', 'pb'];
  ids.forEach((id, i) => {
    const a = t * 0.25 + i * Math.PI * 2 / ids.length, px = cx + Math.cos(a) * bw * 0.32, py = cy + Math.sin(a) * bh * 0.3;
    const sz = bh * (0.95 + Math.sin(a) * 0.25) * 0.9, sp = holoFor(id, i % 2 ? TEAM[1] : TEAM[0], sz);
    const kk = sz / sp.artH, w = sp.w * kk, h = sp.h * kk, pd = sp.pad * kk;
    x.globalAlpha = 0.5; x.globalCompositeOperation = 'lighter'; x.drawImage(sp.glow, px - w / 2, py - h + pd, w, h); x.globalCompositeOperation = 'source-over'; x.globalAlpha = 0.9;
    x.drawImage(sp.body, px - w / 2, py - h + pd + Math.sin(t * 2 + i) * 2, w, h); x.globalAlpha = 1;
  });
  x.restore();
  // BMO standing on the table
  const bx = wide ? W * 0.07 : W * 0.13, by = wide ? H * 0.97 : H * 0.95, bs = Math.min(W, H) * (wide ? 0.17 : 0.15);
  x.save(); x.translate(bx, by - bs + Math.sin(t * 3) * 2);
  x.drawImage(Art.portrait('bmo', Math.round(bs)), -bs / 2, 0, bs, bs);
  x.fillStyle = '#4aa995'; x.fillRect(-bs * 0.28, bs * 0.95, bs * 0.08, bs * 0.18); x.fillRect(bs * 0.2, bs * 0.95, bs * 0.08, bs * 0.18);
  x.restore();
}

// ------------------------------------------------------------------ board static layer (felt landscapes)
function patchPoly(side, lane) {
  const x0 = laneX(lane), s = sideSign(side), seed = lane * 31 + (side === R.viewer ? 7 : 3);
  const r = rnd(seed * 997 + 13), pts = [];
  const zA = s * 0.26, zB = s * 2.9, hw = 0.47;
  const wob = () => (r() - 0.5) * 0.045;
  const N = 9;
  for (let i = 0; i <= N; i++) pts.push([x0 - hw + (2 * hw * i) / N + wob(), zA + wob()]);
  for (let i = 1; i <= N; i++) pts.push([x0 + hw + wob(), zA + ((zB - zA) * i) / N + wob()]);
  for (let i = 1; i <= N; i++) pts.push([x0 + hw - (2 * hw * i) / N + wob(), zB + wob()]);
  for (let i = 1; i < N; i++) pts.push([x0 - hw + wob(), zB - ((zB - zA) * i) / N + wob()]);
  return pts;
}
let feltPat = null;
function feltPattern(x) {
  if (feltPat) return feltPat;
  const c = document.createElement('canvas'); c.width = 64; c.height = 64; const y = c.getContext('2d'), r = rnd(5);
  for (let i = 0; i < 900; i++) { const v = r(); y.fillStyle = v > 0.5 ? 'rgba(255,255,255,' + (0.03 + r() * 0.05) + ')' : 'rgba(0,0,0,' + (0.04 + r() * 0.08) + ')'; y.fillRect(r() * 64, r() * 64, 1 + r() * 1.5, 1 + r() * 1.5); }
  feltPat = x.createPattern(c, 'repeat');
  return feltPat;
}
function decor(x, type, side, lane, down) {
  const x0 = laneX(lane), s = sideSign(side), r = rnd(lane * 7 + side * 3 + 99);
  const col = down ? 'rgba(60,40,30,.5)' : rgba(shade(LANDC[type], 0.35), 0.55);
  x.strokeStyle = col; x.fillStyle = col; x.lineWidth = Math.max(1, R.cam.F * 0.012);
  const pt = (gx, gz) => P(gx, 0, gz);
  if (down) {
    for (let i = 0; i < 9; i++) { const p = pt(x0 + (r() - 0.5) * 0.8, s * (0.4 + r() * 2.35)); x.beginPath(); x.ellipse(p.x, p.y, p.s * 0.05, p.s * 0.025, 0, 0, 7); x.fill(); }
    return;
  }
  if (type === 'corn') {
    for (let row = 0; row < 4; row++) { const gz = s * (0.5 + row * 0.66); for (let k = -1; k <= 1; k++) { const p = pt(x0 + k * 0.28, gz); x.beginPath(); x.ellipse(p.x, p.y, p.s * 0.035, p.s * 0.07, 0, 0, 7); x.fill(); x.beginPath(); x.moveTo(p.x - p.s * 0.06, p.y + p.s * 0.05); x.quadraticCurveTo(p.x, p.y - p.s * 0.02, p.x + p.s * 0.06, p.y + p.s * 0.05); x.stroke(); } }
  } else if (type === 'blue') {
    for (let i = 0; i < 10; i++) { const p = pt(x0 + (r() - 0.5) * 0.8, s * (0.4 + r() * 2.4)); x.beginPath(); x.moveTo(p.x - p.s * 0.04, p.y); x.quadraticCurveTo(p.x - p.s * 0.03, p.y - p.s * 0.06, p.x - p.s * 0.01, p.y - p.s * 0.08); x.moveTo(p.x + p.s * 0.02, p.y); x.quadraticCurveTo(p.x + p.s * 0.03, p.y - p.s * 0.05, p.x + p.s * 0.06, p.y - p.s * 0.07); x.stroke(); }
    for (let i = 0; i < 2; i++) { const p = pt(x0 + (r() - 0.5) * 0.5, s * (0.6 + r() * 1.9)); x.beginPath(); x.arc(p.x, p.y, p.s * 0.06, Math.PI, Math.PI * 1.8); x.stroke(); }
  } else if (type === 'swamp') {
    for (let i = 0; i < 8; i++) { const p = pt(x0 + (r() - 0.5) * 0.8, s * (0.4 + r() * 2.4)); x.beginPath(); x.ellipse(p.x, p.y, p.s * 0.03 * (1 + r()), p.s * 0.018 * (1 + r()), 0, 0, 7); x.stroke(); }
    for (let i = 0; i < 3; i++) { const p = pt(x0 + (r() - 0.5) * 0.8, s * (0.5 + r() * 2.2)); x.beginPath(); x.moveTo(p.x, p.y); x.lineTo(p.x - p.s * 0.02, p.y - p.s * 0.12); x.moveTo(p.x + p.s * 0.02, p.y); x.lineTo(p.x + p.s * 0.04, p.y - p.s * 0.1); x.stroke(); }
  } else if (type === 'ice') {
    for (let i = 0; i < 6; i++) { const p = pt(x0 + (r() - 0.5) * 0.8, s * (0.4 + r() * 2.4)), q = p.s * 0.05; for (let k = 0; k < 3; k++) { const a = k * Math.PI / 3; x.beginPath(); x.moveTo(p.x - Math.cos(a) * q, p.y - Math.sin(a) * q * 0.6); x.lineTo(p.x + Math.cos(a) * q, p.y + Math.sin(a) * q * 0.6); x.stroke(); } }
    const a = pt(x0 - 0.3, s * 0.6), b = pt(x0 + 0.1, s * 1.3), c = pt(x0 + 0.35, s * 2.0); x.beginPath(); x.moveTo(a.x, a.y); x.lineTo(b.x, b.y); x.lineTo(c.x, c.y); x.stroke();
  } else if (type === 'nice') {
    for (let i = 0; i < 8; i++) { const p = pt(x0 + (r() - 0.5) * 0.8, s * (0.4 + r() * 2.4)), q = p.s * 0.035; x.beginPath(); x.moveTo(p.x, p.y + q); x.bezierCurveTo(p.x - q * 2, p.y - q * 0.2, p.x - q, p.y - q * 1.4, p.x, p.y - q * 0.5); x.bezierCurveTo(p.x + q, p.y - q * 1.4, p.x + q * 2, p.y - q * 0.2, p.x, p.y + q); x.fill(); }
  } else if (type === 'lava') {
    x.strokeStyle = 'rgba(255,190,90,.55)';
    for (let i = 0; i < 4; i++) { let p = pt(x0 + (r() - 0.5) * 0.8, s * (0.4 + r() * 2.2)); x.beginPath(); x.moveTo(p.x, p.y); for (let k = 0; k < 3; k++) { p = pt(x0 + (r() - 0.5) * 0.8, s * (0.4 + r() * 2.35)); x.lineTo(p.x, p.y); } x.stroke(); }
  }
}
function drawBoardLayer() {
  const st = R.st; if (!st) return false;
  const lands = st.players.map(P0 => P0.lanes.map(L => L.land.type + (L.land.down ? 'D' : ''))).join('|');
  const key = lands + R.viewer + R.cam.F.toFixed(2) + R.cam.cx.toFixed(1) + R.cam.cy.toFixed(1) + R.W + R.H + (R.cbIcons ? 1 : 0);
  if (board && boardKey === key) return false;
  boardKey = key;
  board = board || document.createElement('canvas');
  board.width = R.cv.width; board.height = R.cv.height;
  const x = board.getContext('2d'); x.setTransform(R.dpr, 0, 0, R.dpr, 0, 0); x.clearRect(0, 0, R.W, R.H);
  // frame (the Card Wars projector board)
  const c1 = P(-BOARD.hx - 0.08, 0, -BOARD.hz - 0.1), c2 = P(BOARD.hx + 0.08, 0, -BOARD.hz - 0.1), c3 = P(BOARD.hx + 0.08, 0, BOARD.hz + 0.1), c4 = P(-BOARD.hx - 0.08, 0, BOARD.hz + 0.1);
  x.save();
  x.shadowColor = 'rgba(0,0,0,.6)'; x.shadowBlur = 24; x.shadowOffsetY = 10;
  polyPath(x, [c1, c2, c3, c4]); x.fillStyle = '#171225'; x.fill();
  x.restore();
  x.lineWidth = Math.max(2, R.cam.F * 0.02); x.strokeStyle = '#3d3366'; polyPath(x, [c1, c2, c3, c4]); x.stroke();
  const i1 = P(-BOARD.hx, 0, -BOARD.hz), i2 = P(BOARD.hx, 0, -BOARD.hz), i3 = P(BOARD.hx, 0, BOARD.hz), i4 = P(-BOARD.hx, 0, BOARD.hz);
  polyPath(x, [i1, i2, i3, i4]); x.fillStyle = '#0d0a19'; x.fill();
  // felt patches
  for (let side = 0; side < 2; side++) for (let l = 0; l < 4; l++) {
    const L = st.players[side].lanes[l].land;
    const pts = patchPoly(side, l).map(q => P(q[0], 0, q[1]));
    const base = L.down ? '#3a2a22' : FELT[L.type] || '#555';
    polyPath(x, pts);
    const near = P(laneX(l), 0, sideSign(side) * 0.3), far = P(laneX(l), 0, sideSign(side) * 2.85);
    const gr = x.createLinearGradient(near.x, near.y, far.x, far.y);
    gr.addColorStop(0, rgba(shade(base, 0.12), 1)); gr.addColorStop(1, rgba(shade(base, -0.25), 1));
    x.fillStyle = gr; x.fill();
    x.fillStyle = feltPattern(x); x.fill();
    x.save(); polyPath(x, pts); x.clip(); decor(x, L.type, side, l, L.down); x.restore();
    // stitched border
    const ins = patchPoly(side, l).map(q => { const cxp = laneX(l), czp = sideSign(side) * 1.58; return P(cxp + (q[0] - cxp) * 0.93, 0, czp + (q[1] - czp) * 0.97); });
    x.setLineDash([Math.max(3, R.cam.F * 0.03), Math.max(3, R.cam.F * 0.025)]); x.lineWidth = Math.max(1, R.cam.F * 0.008);
    x.strokeStyle = L.down ? 'rgba(200,170,140,.35)' : rgba(shade(LANDC[L.type], 0.55), 0.75); polyPath(x, ins); x.stroke(); x.setLineDash([]);
    // icon + name near the back edge (colour-blind safe)
    const ic = P(laneX(l) - 0.32, 0, sideSign(side) * 2.72);
    if (R.cbIcons || L.down) Art.landIcon(x, L.type, ic.x, ic.y, Math.max(6, ic.s * 0.075), L.down ? 'rgba(220,190,160,.6)' : rgba(shade(LANDC[L.type], 0.6), 0.9));
    if (L.down) { x.strokeStyle = 'rgba(255,120,100,.8)'; x.lineWidth = 2; x.beginPath(); x.moveTo(ic.x - 8, ic.y - 8); x.lineTo(ic.x + 8, ic.y + 8); x.stroke(); }
  }
  // centre line (glowing)
  const m1 = P(-BOARD.hx, 0, 0), m2 = P(BOARD.hx, 0, 0);
  x.save(); x.shadowColor = 'rgba(150,130,255,.9)'; x.shadowBlur = 10;
  x.strokeStyle = 'rgba(170,150,255,.55)'; x.lineWidth = Math.max(2, R.cam.F * 0.015); x.beginPath(); x.moveTo(m1.x, m1.y); x.lineTo(m2.x, m2.y); x.stroke(); x.restore();
  // projector trim + corner emitters (the holo-board device)
  x.save(); x.shadowColor = 'rgba(90,210,255,.9)'; x.shadowBlur = 12; x.strokeStyle = 'rgba(120,220,255,.55)'; x.lineWidth = Math.max(1.5, R.cam.F * 0.01);
  polyPath(x, [i1, i2, i3, i4]); x.stroke(); x.restore();
  for (const c of [c1, c2, c3, c4]) {
    const g = x.createRadialGradient(c.x, c.y, 0, c.x, c.y, Math.max(6, c.s * 0.12));
    g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(0.35, 'rgba(110,220,255,.8)'); g.addColorStop(1, 'rgba(110,220,255,0)');
    x.fillStyle = g; x.beginPath(); x.arc(c.x, c.y, Math.max(6, c.s * 0.12), 0, 7); x.fill();
  }
  // side lights along the centre seam
  for (const sx of [-BOARD.hx - 0.04, BOARD.hx + 0.04]) { const q = P(sx, 0, 0); x.fillStyle = 'rgba(255,207,58,.9)'; x.beginPath(); x.arc(q.x, q.y, Math.max(2.5, q.s * 0.035), 0, 7); x.fill(); }
  // lane separators (function returns true below: layer was rebuilt)
  for (let k = 1; k < 4; k++) { const gx = laneX(0) + (R.viewer === 0 ? 1 : -1) * (k - 0.5); const a = P(gx, 0, -BOARD.hz + 0.1), b = P(gx, 0, BOARD.hz - 0.1); x.strokeStyle = 'rgba(255,255,255,.05)'; x.lineWidth = 1; x.beginPath(); x.moveTo(a.x, a.y); x.lineTo(b.x, b.y); x.stroke(); }
  return true;
}

// ------------------------------------------------------------------ dynamic effects
const fx = { parts: [], texts: [], projs: [], anims: {}, rubble: [], flashes: {}, beams: [] };
R.fx = fx;
R.clearFx = function () { fx.parts.length = 0; fx.texts.length = 0; fx.projs.length = 0; fx.anims = {}; fx.rubble.length = 0; fx.flashes = {}; fx.beams.length = 0; };
function part(o) { if (fx.parts.length > 600) fx.parts.shift(); fx.parts.push(o); }
R.burst = function (sx, sy, color, n, opt) {
  opt = opt || {}; if (R.reduceMotion) n = Math.ceil(n / 3);
  const rgb = typeof color === 'string' ? hex(color) : color;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, sp = (opt.speed || 120) * (0.3 + Math.random());
    part({ x: sx, y: sy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (opt.up || 60), g: opt.g == null ? 260 : opt.g, life: (opt.life || 0.7) * (0.6 + Math.random() * 0.6), t: 0,
      sz: (opt.size || 4) * (0.5 + Math.random()), rgb, sq: opt.square !== false, add: opt.add !== false });
  }
};
R.text = function (sx, sy, str, color, opt) {
  opt = opt || {};
  fx.texts.push({ x: sx, y: sy, str, color: color || '#fff', t: 0, life: opt.life || 1.0, size: opt.size || 22, vy: opt.vy == null ? -40 : opt.vy, delay: opt.delay || 0 });
};
R.projectile = function (from, to, color, dur, opt) {
  fx.projs.push({ from, to, color: hex(color), t: 0, dur: dur || 0.3, arc: (opt && opt.arc) || 0, size: (opt && opt.size) || 7, kind: (opt && opt.kind) || 'orb' });
};
R.shake = function (amp, dur) { if (R.reduceMotion) return; shakeA = Math.max(shakeA, amp); shakeT = Math.max(shakeT, dur || 0.3); };
R.hitstop = function (ms) { if (!R.reduceMotion) hitStop = Math.max(hitStop, ms / 1000); };
R.anim = function (uid, kind, dur, data) { fx.anims[uid + ':' + kind] = Object.assign({ uid, kind, t: 0, dur }, data || {}); };
R.flash = function (uid, color) { fx.flashes[uid] = { t: 0, color: color || '#fff' }; };
R.addRubble = function (side, lane, color) { fx.rubble = fx.rubble.filter(r => !(r.side === side && r.lane === lane)); fx.rubble.push({ side, lane, color, t: 0, seed: Math.random() * 1e6 }); };
R.clearRubble = function (side, lane) { fx.rubble = fx.rubble.filter(r => !(r.side === side && r.lane === lane)); };
R.dying = [];
R.addDying = function (side, lane, id, team, slot) { R.dying.push({ side, lane, id, team, slot: slot || 'c', t: 0 }); };
R.addBeam = function (from, to, color, dur) { fx.beams.push({ from, to, color, t: 0, dur: dur || 0.5 }); };

function animOf(uid, kind) { return fx.anims[uid + ':' + kind]; }
// sprites are baked at a few fixed heights and scaled when drawn (no re-bake while animating/zooming)
const BUCKETS = [40, 56, 72, 96, 128, 168, 220];
function bucket(h) { for (const b of BUCKETS) if (b >= h * R.dpr * 0.9) return b; return BUCKETS[BUCKETS.length - 1]; }
function holoFor(id, color, hpx) { return Art.holo(id, color, bucket(hpx)); }

function stepFx(dt) {
  for (const k in fx.anims) { const a = fx.anims[k]; a.t += dt; if (a.t > a.dur + 0.05) delete fx.anims[k]; }
  for (const k in fx.flashes) { fx.flashes[k].t += dt; if (fx.flashes[k].t > 0.35) delete fx.flashes[k]; }
  for (let i = fx.parts.length - 1; i >= 0; i--) { const p = fx.parts[i]; p.t += dt; if (p.t >= p.life) { fx.parts.splice(i, 1); continue; } p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.985; }
  for (let i = fx.texts.length - 1; i >= 0; i--) { const q = fx.texts[i]; q.t += dt; if (q.t > q.life + q.delay) fx.texts.splice(i, 1); }
  for (let i = fx.projs.length - 1; i >= 0; i--) { const q = fx.projs[i]; q.t += dt; if (q.t > q.dur) fx.projs.splice(i, 1); }
  for (let i = fx.beams.length - 1; i >= 0; i--) { const q = fx.beams[i]; q.t += dt; if (q.t > q.dur) fx.beams.splice(i, 1); }
  for (let i = R.dying.length - 1; i >= 0; i--) { R.dying[i].t += dt; if (R.dying[i].t > 0.5) R.dying.splice(i, 1); }
  for (const r of fx.rubble) r.t += dt;
}

// ------------------------------------------------------------------ drawing pieces
function cardQuad(x, side, lane, slot, faction, rot, alpha, back, hidden) {
  const cx = laneX(lane), cz = rowZ(side, slot) + sideSign(side) * 0.05;
  const hw = 0.3, hh = 0.42;
  const c = Math.cos(rot), s = Math.sin(rot);
  const corners = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([a, b]) => P(cx + a * c - b * s, 0.005, cz + a * s + b * c));
  x.save(); x.globalAlpha = alpha;
  polyPath(x, corners);
  if (back) { x.fillStyle = '#2c2150'; x.fill(); x.strokeStyle = '#8a7bd9'; x.lineWidth = 1.5; x.stroke(); }
  else {
    const fc = hex(LANDC[faction] || '#888');
    x.fillStyle = rgba(fc, 0.95); x.fill();
    const inner = [[-hw * 0.82, -hh * 0.86], [hw * 0.82, -hh * 0.86], [hw * 0.82, hh * 0.86], [-hw * 0.82, hh * 0.86]].map(([a, b]) => P(cx + a * c - b * s, 0.006, cz + a * s + b * c));
    polyPath(x, inner); x.fillStyle = 'rgba(16,12,30,.92)'; x.fill();
  }
  if (hidden) { const p = P(cx, 0.01, cz); x.fillStyle = '#b9adf0'; x.font = '900 ' + Math.max(9, p.s * 0.16) + 'px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('?', p.x, p.y); }
  x.restore();
}
const glowCache = {};
function discSprite(rgb) {
  const k = 'd' + rgb.join(','); if (glowCache[k]) return glowCache[k];
  const c = document.createElement('canvas'); c.width = 128; c.height = 128; const y = c.getContext('2d');
  const g = y.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, rgba(rgb, 0.55)); g.addColorStop(0.7, rgba(rgb, 0.18)); g.addColorStop(1, rgba(rgb, 0));
  y.fillStyle = g; y.fillRect(0, 0, 128, 128);
  y.strokeStyle = rgba(rgb, 0.7); y.lineWidth = 3; y.beginPath(); y.arc(64, 64, 51, 0, 7); y.stroke();
  return (glowCache[k] = c);
}
function beamSprite(rgb) {
  const k = 'b' + rgb.join(','); if (glowCache[k]) return glowCache[k];
  const c = document.createElement('canvas'); c.width = 64; c.height = 128; const y = c.getContext('2d');
  const g = y.createLinearGradient(0, 128, 0, 0); g.addColorStop(0, rgba(rgb, 0.22)); g.addColorStop(1, rgba(rgb, 0));
  y.fillStyle = g; y.beginPath(); y.moveTo(32 - 32 * 0.33, 128); y.lineTo(0, 0); y.lineTo(64, 0); y.lineTo(32 + 32 * 0.33, 128); y.closePath(); y.fill();
  return (glowCache[k] = c);
}
function disc(x, p, rgb, a, r) {
  const rx = p.s * (r || 0.32), ry = rx * 0.42;
  x.globalAlpha = a; x.drawImage(discSprite(rgb), p.x - rx, p.y - ry, rx * 2, ry * 2); x.globalAlpha = 1;
}
function discOld(x, p, rgb, a, r) {
  const rx = p.s * (r || 0.32), ry = rx * 0.42;
  const g = x.createRadialGradient(p.x, p.y, 0, p.x, p.y, rx);
  g.addColorStop(0, rgba(rgb, 0.55 * a)); g.addColorStop(0.7, rgba(rgb, 0.18 * a)); g.addColorStop(1, rgba(rgb, 0));
  x.save(); x.translate(p.x, p.y); x.scale(1, ry / rx); x.translate(-p.x, -p.y);
  x.fillStyle = g; x.beginPath(); x.arc(p.x, p.y, rx, 0, 7); x.fill();
  x.strokeStyle = rgba(rgb, 0.7 * a); x.lineWidth = Math.max(1, p.s * 0.012); x.beginPath(); x.arc(p.x, p.y, rx * 0.8, 0, 7); x.stroke();
  x.restore();
}
function beamCone(x, p, h, w, rgb, a) {
  x.globalAlpha = a; x.drawImage(beamSprite(rgb), p.x - w * 0.55, p.y - h, w * 1.1, h); x.globalAlpha = 1;
}
function beamConeOld(x, p, h, w, rgb, a) {
  const g = x.createLinearGradient(0, p.y, 0, p.y - h);
  g.addColorStop(0, rgba(rgb, 0.22 * a)); g.addColorStop(1, rgba(rgb, 0));
  x.fillStyle = g; x.beginPath(); x.moveTo(p.x - w * 0.18, p.y); x.lineTo(p.x - w * 0.55, p.y - h); x.lineTo(p.x + w * 0.55, p.y - h); x.lineTo(p.x + w * 0.18, p.y); x.closePath(); x.fill();
}
let badgeFont = '';
function badge(x, bx, by, txt, bgA, bgB, sz) {
  const f = '900 ' + Math.round(sz) + 'px system-ui, sans-serif';
  if (badgeFont !== f || x.font !== f) { x.font = f; badgeFont = f; }
  const w = Math.max(sz * 1.25, txt.length * sz * 0.62 + sz * 0.5), h = sz * 1.25;
  rr(x, bx - w / 2, by - h / 2, w, h, h * 0.35); x.fillStyle = bgB; x.fill(); x.lineWidth = Math.max(1.5, sz * 0.12); x.strokeStyle = '#1b1424'; x.stroke();
  rr(x, bx - w / 2 + 1.5, by - h / 2 + 1.5, w - 3, h * 0.45, h * 0.25); x.fillStyle = bgA; x.globalAlpha = 0.55; x.fill(); x.globalAlpha = 1;
  x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(txt, bx, by + sz * 0.05);
}
function statusIcons(x, cx, cy, sz, c) {
  const items = [];
  if (c.shield) items.push(['shield', c.shield]);
  if (c.burn) items.push(['burn', c.burn]);
  if (c.chill) items.push(['chill', c.chill]);
  if (c.frozen) items.push(['frozen', '']);
  if (c.rot) items.push(['rot', '']);
  if (c.stuck) items.push(['stuck', '']);
  if (c.study) items.push(['study', c.study]);
  if (c.ripen) items.push(['ripen', '']);
  const n = items.length; if (!n) return;
  const gap = sz * 1.15; let ix = cx - (n - 1) * gap / 2;
  for (const [k, v] of items) {
    const col = { shield: '#9fd0ff', burn: '#ff7a3d', chill: '#bff3ff', frozen: '#7fe3ff', rot: '#8ae05a', stuck: '#a5754a', study: '#ffe27a', ripen: '#ffd23f' }[k];
    x.fillStyle = 'rgba(14,10,26,.85)'; x.beginPath(); x.arc(ix, cy, sz * 0.55, 0, 7); x.fill();
    x.strokeStyle = col; x.lineWidth = Math.max(1.2, sz * 0.1); x.stroke();
    x.fillStyle = col; x.strokeStyle = col; x.lineWidth = Math.max(1.2, sz * 0.09);
    const q = sz * 0.28;
    x.beginPath();
    if (k === 'shield') { x.moveTo(ix, cy - q * 1.2); x.lineTo(ix + q, cy - q * 0.6); x.lineTo(ix + q * 0.8, cy + q * 0.5); x.lineTo(ix, cy + q * 1.2); x.lineTo(ix - q * 0.8, cy + q * 0.5); x.lineTo(ix - q, cy - q * 0.6); x.closePath(); x.fill(); }
    else if (k === 'burn') { x.moveTo(ix - q, cy + q); x.quadraticCurveTo(ix - q * 1.2, cy - q * 0.2, ix, cy - q * 1.3); x.quadraticCurveTo(ix + q * 1.2, cy - q * 0.2, ix + q, cy + q); x.closePath(); x.fill(); }
    else if (k === 'chill' || k === 'frozen') { for (let i = 0; i < 3; i++) { const a = i * Math.PI / 3; x.moveTo(ix - Math.cos(a) * q * 1.2, cy - Math.sin(a) * q * 1.2); x.lineTo(ix + Math.cos(a) * q * 1.2, cy + Math.sin(a) * q * 1.2); } x.stroke(); }
    else if (k === 'rot') { x.arc(ix, cy - q * 0.2, q * 0.85, 0, 7); x.fill(); x.fillStyle = '#0d0a19'; x.beginPath(); x.arc(ix - q * 0.35, cy - q * 0.3, q * 0.22, 0, 7); x.arc(ix + q * 0.35, cy - q * 0.3, q * 0.22, 0, 7); x.fill(); }
    else if (k === 'stuck') { x.ellipse(ix, cy + q * 0.2, q * 1.1, q * 0.6, 0, 0, 7); x.fill(); }
    else if (k === 'study') { x.rect(ix - q, cy - q * 0.8, q * 2, q * 1.6); x.fill(); }
    else if (k === 'ripen') { x.ellipse(ix, cy, q * 0.55, q * 1.1, 0, 0, 7); x.fill(); }
    if (v !== '' && v != null) { x.fillStyle = '#fff'; x.font = '900 ' + Math.round(sz * 0.62) + 'px system-ui,sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(v), ix + sz * 0.42, cy + sz * 0.38); }
    ix += gap;
  }
}

function drawMini(x, side, lane, slot, obj, t, opts) {
  const st = R.st, team = R.colors[side], rgb = hex(team);
  let base = R.slotPos(side, lane, slot);
  let gx = laneX(lane), gz = rowZ(side, slot), lift = 0, scale = 1, alpha = 1;
  // movement / lunge / spawn animations
  const mv = animOf(obj.uid, 'move');
  if (mv) { const k = easeIO(mv.t / mv.dur); gx = mv.fx + (gx - mv.fx) * k; gz = mv.fz + (gz - mv.fz) * k; lift = Math.sin(k * Math.PI) * 0.25; }
  const lg = animOf(obj.uid, 'lunge');
  if (lg) { const k = lg.t / lg.dur, f = k < 0.55 ? easeIO(k / 0.55) : 1 - easeIO((k - 0.55) / 0.45); gx += (lg.tx - gx) * f * lg.amt; gz += (lg.tz - gz) * f * lg.amt; lift += (lg.fly ? 0.35 : 0.08) * Math.sin(f * Math.PI); }
  const sp = animOf(obj.uid, 'spawn');
  if (sp) { const k = Math.max(0, (sp.t - (sp.delay || 0)) / (sp.dur - (sp.delay || 0))); scale = 0.05 + 0.95 * ease(k); alpha = Math.min(1, k * 2.5); }
  const fl = animOf(obj.uid, 'floopflash');
  const p = P(gx, 0, gz);
  base = p;
  const cd = E.CARDS[obj.id] || E.CARDS['?'];
  const isB = slot === 'b';
  const hidden = isB && obj.hidden;
  const mine = side === R.viewer;
  // card lying on the table (rotates when flooped)
  const flo = animOf(obj.uid, 'flooprot');
  let rot = obj.flooped ? Math.PI / 2 : 0;
  if (flo) { const k = easeIO(flo.t / flo.dur); rot = flo.from + (flo.to - flo.from) * k; }
  const plc = animOf(obj.uid, 'place');
  if (plc) { const k = Math.min(1, plc.t / plc.dur); rot = Math.sin(k * Math.PI) * Math.PI / 2; }
  if (!mv && !lg) cardQuad(x, side, lane, slot, cd.land, rot, 0.95, hidden && !(mine), hidden && !mine);
  if (R.cbIcons && !isB) { const q = P(gx + 0.36, 0.01, gz + sideSign(side) * 0.3), r0 = Math.max(3, q.s * 0.05); x.save(); x.fillStyle = team; x.strokeStyle = '#120a1c'; x.lineWidth = 1.5; x.beginPath(); if (mine) x.arc(q.x, q.y, r0, 0, 7); else { x.moveTo(q.x, q.y - r0 * 1.2); x.lineTo(q.x + r0 * 1.2, q.y); x.lineTo(q.x, q.y + r0 * 1.2); x.lineTo(q.x - r0 * 1.2, q.y); x.closePath(); } x.fill(); x.stroke(); x.restore(); }
  if (hidden && !mine) return;
  const hpx = p.s * (isB ? 1.2 : 1.22) * scale;
  // glow disc + projector beam
  disc(x, p, rgb, alpha, isB ? 0.4 : 0.33);
  if (!R.reduceMotion) beamCone(x, p, hpx * 0.9, hpx * 0.7, rgb, alpha * (hidden ? 0.4 : 1));
  // frozen tint block, shield bubble behind
  const sprite = holoFor(hidden ? 'back' : cd.art, team, hpx);
  const k = hpx / sprite.artH;
  const dw = sprite.w * k, dh = sprite.h * k;
  const dx = p.x - dw / 2, dy = p.y - dh + sprite.pad * k * 1.05 - lift * p.s;
  const flick = R.reduceMotion ? 1 : 0.9 + 0.1 * Math.sin(t * 9 + obj.uid);
  x.save();
  x.globalAlpha = alpha * 0.55 * flick; x.globalCompositeOperation = 'lighter'; x.drawImage(sprite.glow, dx, dy, dw, dh);
  x.globalCompositeOperation = 'source-over';
  x.globalAlpha = alpha * (hidden ? 0.5 : (obj.flooped && !isB ? 0.78 : 0.97));
  // glitch slice now and then
  if (!R.reduceMotion && Math.sin(t * 1.7 + obj.uid * 3.1) > 0.995) { x.drawImage(sprite.body, 0, 0, sprite.w, sprite.h * 0.5, dx + 3, dy, dw, dh * 0.5); x.drawImage(sprite.body, 0, sprite.h * 0.5, sprite.w, sprite.h * 0.5, dx - 2, dy + dh * 0.5, dw, dh * 0.5); }
  else x.drawImage(sprite.body, dx, dy, dw, dh);
  const f = fx.flashes[obj.uid];
  if (f) { x.globalAlpha = (1 - f.t / 0.35) * 0.8; x.globalCompositeOperation = 'lighter'; x.drawImage(sprite.glow, dx, dy, dw, dh); x.drawImage(sprite.glow, dx, dy, dw, dh); x.globalCompositeOperation = 'source-over'; }
  if (fl) { const kk = 1 - fl.t / fl.dur; x.globalAlpha = kk; x.globalCompositeOperation = 'lighter'; x.drawImage(sprite.glow, dx - dw * 0.1, dy - dh * 0.1, dw * 1.2, dh * 1.2); x.globalCompositeOperation = 'source-over'; }
  x.restore();
  if (!isB && obj.frozen) { x.save(); x.globalAlpha = 0.45; x.fillStyle = '#9fefff'; rr(x, p.x - dw * 0.42, p.y - hpx * 1.02, dw * 0.84, hpx * 1.04, 6); x.fill(); x.globalAlpha = 0.9; x.strokeStyle = '#e8fdff'; x.lineWidth = 2; x.stroke(); x.restore(); }
  if (!isB && obj.shield) { x.save(); x.strokeStyle = 'rgba(160,215,255,.8)'; x.lineWidth = Math.max(1.5, p.s * 0.012); x.globalAlpha = 0.6 + 0.3 * Math.sin(t * 4); x.beginPath(); x.ellipse(p.x, p.y - hpx * 0.5, dw * 0.5, hpx * 0.62, 0, 0, 7); x.stroke(); x.restore(); }
  if (sp && sp.t < sp.dur) { const kk = sp.t / sp.dur; x.save(); x.globalAlpha = (1 - kk) * 0.8; x.fillStyle = rgba(rgb, 1); x.fillRect(p.x - dw * 0.45, p.y - hpx * kk * 1.1, dw * 0.9, Math.max(2, p.s * 0.02)); x.restore(); }
  // stats
  const fs = Math.max(11, Math.min(20, p.s * 0.135));
  if (!isB) {
    const s = E.cStats(st, side, lane);
    if (s) {
      const baseAtk = (cd.atk || 0), atkCol = s.atk > baseAtk ? ['#fff3a0', '#e6a000'] : s.atk < baseAtk ? ['#9fd6ff', '#3b78c9'] : ['#ffd27a', '#e57d16'];
      const hpCol = obj.dmg > 0 ? ['#ff8f9a', '#c41f3a'] : (s.def > (cd.def || 1) ? ['#9ff2a7', '#22a346'] : ['#ff9fae', '#d6334f']);
      badge(x, p.x - p.s * 0.2, p.y + p.s * 0.05, String(s.atk), atkCol[0], atkCol[1], fs);
      badge(x, p.x + p.s * 0.2, p.y + p.s * 0.05, String(s.hp), hpCol[0], hpCol[1], fs);
    }
    statusIcons(x, p.x, p.y - hpx * 1.06, fs * 0.95, obj);
    if (obj.flooped) { x.save(); x.font = '900 ' + Math.round(fs * 0.62) + 'px system-ui'; x.textAlign = 'center'; x.fillStyle = rgba(rgb, 0.95); x.fillText(E.napping(st, side, lane) ? 'Zzz' : 'FLOOPED', p.x, p.y + p.s * 0.24); x.restore(); }
    if (opts && opts.idle) { x.save(); x.globalAlpha = 0.6 + 0.4 * Math.sin(t * 5); x.fillStyle = '#fff3a0'; x.beginPath(); x.arc(p.x + dw * 0.38, p.y - hpx * 0.95, Math.max(3, fs * 0.25), 0, 7); x.fill(); x.restore(); }
  } else {
    const rem = E.bDef(obj) - obj.dmg;
    badge(x, p.x + p.s * 0.22, p.y + p.s * 0.06, String(rem), '#b8c7ff', '#5a6fd6', Math.round(fs * 0.9));
    if (hidden) { x.save(); x.font = '900 ' + Math.round(fs * 0.62) + 'px system-ui'; x.textAlign = 'center'; x.fillStyle = '#d9cff7'; x.fillText('TRAP (hidden)', p.x, p.y + p.s * 0.24); x.restore(); }
    if (obj.flooped) { x.save(); x.font = '900 ' + Math.round(fs * 0.6) + 'px system-ui'; x.textAlign = 'center'; x.fillStyle = rgba(rgb, 0.95); x.fillText('FLOOPED', p.x, p.y + p.s * 0.25); x.restore(); }
  }
}

// interaction visuals for buildings (auras, links, control zones, garrisons)
function buildingFx(x, t) {
  const st = R.st;
  for (let side = 0; side < 2; side++) {
    const towers = [], portals = [];
    for (let l = 0; l < 4; l++) {
      const b = st.players[side].lanes[l].building; if (!b || b.hidden) continue;
      const rgb = hex(R.colors[side]), p = R.slotPos(side, l, 'b');
      const id = b.id;
      if (id === 'n_tower') towers.push(l);
      if (id === 'r_portal') portals.push(l);
      if (id === 'c_dome') {
        x.save(); x.globalAlpha = 0.18 + 0.08 * Math.sin(t * 2);
        const a = P(laneX(Math.max(0, l - 1)) - 0.45 * (R.viewer === 0 ? 1 : -1), 0, rowZ(side, 'c')), bb = P(laneX(Math.min(3, l + 1)) + 0.45 * (R.viewer === 0 ? 1 : -1), 0, rowZ(side, 'c'));
        x.strokeStyle = '#ffcf3a'; x.lineWidth = Math.max(3, p.s * 0.05); x.beginPath(); x.moveTo(a.x, a.y); x.lineTo(bb.x, bb.y); x.stroke(); x.restore();
      }
      const c = st.players[side].lanes[l].creature;
      const cp = R.slotPos(side, l, 'c');
      if (c && (id === 'r_treefort' || id === 'b_school' || id === 'b_cave' || id === 'l_forge' || id === 'n_tower')) {
        x.save(); x.globalAlpha = 0.35 + 0.15 * Math.sin(t * 3 + l); x.strokeStyle = { r_treefort: '#8ff09a', b_school: '#ffe27a', b_cave: '#b9adf0', l_forge: '#ff9a4a', n_tower: '#ff9fd0' }[id];
        x.lineWidth = Math.max(1.5, cp.s * 0.02); x.setLineDash([5, 5]); x.lineDashOffset = -t * 20;
        x.beginPath(); x.moveTo(p.x, p.y - p.s * 0.3); x.lineTo(cp.x, cp.y); x.stroke(); x.setLineDash([]); x.restore();
      }
      const op = R.slotPos(1 - side, l, 'c');
      if (id === 'i_castle' || id === 'b_spirit' || id === 'l_cannon') {
        x.save(); x.globalAlpha = 0.18 + 0.1 * Math.sin(t * 2.5 + l); x.strokeStyle = { i_castle: '#bff3ff', b_spirit: '#d9b8ff', l_cannon: '#ff8a4a' }[id];
        x.lineWidth = Math.max(1, p.s * 0.012); x.setLineDash([3, 7]); x.lineDashOffset = -t * 25;
        x.beginPath(); x.moveTo(p.x, p.y - p.s * 0.4); x.lineTo(op.x, op.y - op.s * 0.3); x.stroke(); x.setLineDash([]); x.restore();
      }
      if ((id === 'l_pit' || id === 'l_forge') && Math.random() < 0.06 && !R.reduceMotion) R.burst(p.x + (Math.random() - 0.5) * p.s * 0.4, p.y - p.s * 0.2, '#ff8a3d', 1, { speed: 20, up: 50, g: -30, life: 0.9, size: 3 });
      if (id === 's_crypt' && Math.random() < 0.04 && !R.reduceMotion) R.burst(p.x, p.y - p.s * 0.3, '#8ae05a', 1, { speed: 15, up: 30, g: -20, life: 1.2, size: 3 });
    }
    const link = (arr, col) => {
      for (let i = 0; i < arr.length - 1; i++) {
        const a = R.slotPos(side, arr[i], 'b'), b = R.slotPos(side, arr[i + 1], 'b');
        x.save(); x.strokeStyle = col; x.globalAlpha = 0.55; x.lineWidth = Math.max(2, a.s * 0.025);
        const my = Math.min(a.y, b.y) - a.s * 0.5;
        x.setLineDash([6, 6]); x.lineDashOffset = -t * 30; x.beginPath(); x.moveTo(a.x, a.y - a.s * 0.4); x.quadraticCurveTo((a.x + b.x) / 2, my, b.x, b.y - b.s * 0.4); x.stroke(); x.setLineDash([]); x.restore();
      }
    };
    if (towers.length > 1) link(towers, '#ff9fd0');
    if (portals.length > 1) link(portals, '#c79bff');
  }
}

function drawHighlights(x, t) {
  for (const h of R.hl) {
    const isLand = h.slot === 'land';
    const slot = isLand ? 'c' : h.slot;
    const col = { play: '#7dff9a', move: '#4fb8ff', attack: '#ff5a6a', ability: '#ffd84a', ally: '#7dff9a', info: '#ffffff' }[h.kind] || '#fff';
    const cx = laneX(h.lane), cz = isLand ? sideSign(h.side) * 1.58 : rowZ(h.side, slot);
    const hw = 0.44, hz = isLand ? 1.28 : 0.6;
    const pts = [[-hw, -hz], [hw, -hz], [hw, hz], [-hw, hz]].map(([a, b]) => P(cx + a, 0.01, cz + b));
    const pulse = 0.5 + 0.5 * Math.sin(t * 6);
    x.save(); polyPath(x, pts); x.fillStyle = col; x.globalAlpha = (h.strong ? 0.28 : 0.14) + 0.1 * pulse; x.fill();
    x.globalAlpha = 0.85; x.strokeStyle = col; x.lineWidth = Math.max(2, R.cam.F * 0.012); x.setLineDash(h.strong ? [] : [8, 6]); x.lineDashOffset = -t * 30; x.stroke(); x.restore();
    if (h.label) {
      const p = P(cx, 0.6, cz);
      x.save(); x.font = '900 ' + Math.max(12, Math.round(p.s * 0.15)) + 'px system-ui'; x.textAlign = 'center'; x.lineWidth = 4; x.strokeStyle = '#000'; x.strokeText(h.label, p.x, p.y); x.fillStyle = col; x.fillText(h.label, p.x, p.y); x.restore();
    }
  }
}
function drawPreview(x, t) {
  const pv = R.preview; if (!pv) return;
  for (const item of pv.items) {
    let p;
    if (item.hero) p = R.edgePos(item.side); else p = R.headPos(item.side, item.lane, item.slot || 'c');
    const txt = (item.lethal ? '☠ ' : '') + '-' + item.dmg;
    const sz = Math.max(12, Math.min(19, (p.s || 60) * 0.14));
    x.save(); x.globalAlpha = 0.7 + 0.25 * Math.sin(t * 5);
    badge(x, p.x, p.y - sz * (item.hero ? 0 : 0.8), txt, item.lethal ? '#ff7b7b' : '#ffe08a', item.lethal ? '#b8142c' : '#d48a00', sz);
    x.restore();
  }
  if (pv.arrows) for (const a of pv.arrows) {
    const p1 = R.slotPos(a.side, a.lane, 'c'), p2 = a.hero ? R.edgePos(a.toSide) : R.slotPos(a.toSide, a.toLane, a.toSlot || 'c');
    x.save(); x.strokeStyle = rgba(hex(R.colors[a.side]), 0.5); x.lineWidth = Math.max(2, p1.s * 0.03); x.setLineDash([6, 8]); x.lineDashOffset = -t * 30;
    x.beginPath(); x.moveTo(p1.x, p1.y - p1.s * 0.1); x.lineTo(p2.x, p2.y - (p2.s || 50) * 0.1); x.stroke(); x.restore();
  }
}

function drawRubble(x) {
  for (const r of fx.rubble) {
    const p = R.slotPos(r.side, r.lane, 'b'), rng = rnd(r.seed);
    x.save(); x.globalAlpha = 0.85;
    for (let i = 0; i < 9; i++) { const ox = (rng() - 0.5) * p.s * 0.5, oy = (rng() - 0.5) * p.s * 0.12; x.fillStyle = i % 3 ? '#5b5470' : '#3d3750'; x.beginPath(); x.moveTo(p.x + ox, p.y + oy); x.lineTo(p.x + ox + p.s * 0.07, p.y + oy - p.s * 0.03); x.lineTo(p.x + ox + p.s * 0.05, p.y + oy + p.s * 0.03); x.closePath(); x.fill(); }
    x.restore();
  }
}
function drawDying(x, t) {
  for (const d of R.dying) {
    const k = d.t / 0.5, p = R.slotPos(d.side, d.lane, d.slot);
    const cd = E.CARDS[d.id] || E.CARDS['?'];
    const hpx = p.s * (d.slot === 'b' ? 1.2 : 1.22);
    const sp = holoFor(cd.art, R.colors[d.team != null ? d.team : d.side], hpx);
    const kk = hpx / sp.artH, dw = sp.w * kk, dh = sp.h * kk, dx = p.x - dw / 2, dy = p.y - dh + sp.pad * kk;
    x.save(); x.globalAlpha = Math.max(0, 1 - k);
    const slices = 6;
    for (let i = 0; i < slices; i++) { const off = (Math.random() - 0.5) * 20 * k; x.drawImage(sp.body, 0, (sp.h / slices) * i, sp.w, sp.h / slices, dx + off, dy + (dh / slices) * i, dw, dh / slices); }
    x.restore();
  }
}
function drawParticles(x) {
  for (const p of fx.parts) {
    const a = 1 - p.t / p.life;
    x.globalCompositeOperation = p.add ? 'lighter' : 'source-over';
    x.fillStyle = rgba(p.rgb, a);
    if (p.sq) x.fillRect(p.x - p.sz / 2, p.y - p.sz / 2, p.sz, p.sz); else { x.beginPath(); x.arc(p.x, p.y, p.sz / 2, 0, 7); x.fill(); }
  }
  x.globalCompositeOperation = 'source-over';
}
function drawProjectiles(x) {
  for (const q of fx.projs) {
    const k = easeIO(q.t / q.dur), px = q.from.x + (q.to.x - q.from.x) * k, py = q.from.y + (q.to.y - q.from.y) * k - Math.sin(k * Math.PI) * q.arc;
    x.save(); x.globalCompositeOperation = 'lighter';
    const g = x.createRadialGradient(px, py, 0, px, py, q.size * 2.2); g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(0.4, rgba(q.color, 0.9)); g.addColorStop(1, rgba(q.color, 0));
    x.fillStyle = g; x.beginPath(); x.arc(px, py, q.size * 2.2, 0, 7); x.fill(); x.restore();
    if (Math.random() < 0.6 && !R.reduceMotion) part({ x: px, y: py, vx: 0, vy: 0, g: 0, life: 0.25, t: 0, sz: q.size * 0.7, rgb: q.color, sq: false, add: true });
  }
  for (const b of fx.beams) {
    const k = b.t / b.dur, a = Math.sin(k * Math.PI);
    x.save(); x.globalCompositeOperation = 'lighter'; x.strokeStyle = b.color; x.globalAlpha = a; x.lineWidth = 6 * a + 1;
    x.beginPath(); x.moveTo(b.from.x, b.from.y); x.lineTo(b.to.x, b.to.y); x.stroke(); x.restore();
  }
}
function drawTexts(x) {
  for (const q of fx.texts) {
    const tt = q.t - q.delay; if (tt < 0) continue;
    const k = tt / q.life, a = k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25, sc = tt < 0.12 ? 0.6 + tt / 0.12 * 0.6 : 1.2 - Math.min(0.2, (tt - 0.12));
    x.save(); x.translate(q.x, q.y + q.vy * tt); x.scale(sc, sc); x.globalAlpha = Math.max(0, a);
    x.font = '900 ' + q.size + 'px system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineWidth = Math.max(3, q.size * 0.18); x.strokeStyle = '#120a1c'; x.strokeText(q.str, 0, 0); x.fillStyle = q.color; x.fillText(q.str, 0, 0);
    x.restore();
  }
}

// ------------------------------------------------------------------ frame
R.frame = function (t, dt) {
  R.t = t;
  if (hitStop > 0) { hitStop -= dt; dt = 0; }
  stepFx(dt);
  const x = R.x;
  x.setTransform(1, 0, 0, 1, 0, 0);
  ensureBg();
  if (R.mode === 'home' || !R.st || (R.intro && R.intro.t < 1.6)) x.drawImage(bg, 0, 0);
  x.setTransform(R.dpr, 0, 0, R.dpr, 0, 0);
  if (R.mode === 'home') { if (R.homeLive) drawHomeLive(x, t); drawParticles(x); drawTexts(x); return; }
  if (!R.st) return;
  let sx = 0, sy = 0;
  if (shakeT > 0) { shakeT -= dt; sx = (Math.random() - 0.5) * shakeA * 2; sy = (Math.random() - 0.5) * shakeA * 2; if (shakeT <= 0) shakeA = 0; }
  x.save(); x.translate(sx, sy);
  const changed = drawBoardLayer();
  x.setTransform(1, 0, 0, 1, sx * R.dpr, sy * R.dpr);
  if (!(R.intro && R.intro.t < 1.6)) {
    // one full-screen blit per frame: cached table + board composite
    if (!combo || changed || comboKey !== boardKey + '|' + bgKey) {
      combo = combo || document.createElement('canvas'); combo.width = R.cv.width; combo.height = R.cv.height;
      const c = combo.getContext('2d'); c.drawImage(bg, 0, 0); c.drawImage(board, 0, 0); comboKey = boardKey + '|' + bgKey;
    }
    x.setTransform(1, 0, 0, 1, 0, 0);
    if (sx || sy) { x.fillStyle = '#2a160a'; x.fillRect(0, 0, R.cv.width, R.cv.height); }
    x.drawImage(combo, Math.round(sx * R.dpr), Math.round(sy * R.dpr)); x.setTransform(R.dpr, 0, 0, R.dpr, sx * R.dpr, sy * R.dpr);
  } else if (R.intro && R.intro.t < 1.6) {
    // "Floop your land cards": landscapes flip onto the board one by one
    R.intro.t += dt;
    x.globalAlpha = 0.28; x.drawImage(board, 0, 0); x.globalAlpha = 1;
    x.setTransform(R.dpr, 0, 0, R.dpr, sx * R.dpr, sy * R.dpr);
    x.save(); x.beginPath();
    for (let side = 0; side < 2; side++) for (let l = 0; l < 4; l++) {
      const k = Math.max(0, Math.min(1, (R.intro.t - (l * 0.14 + (side === R.viewer ? 0 : 0.07))) / 0.28));
      if (k <= 0) continue;
      const cxp = laneX(l), czp = sideSign(side) * 1.58, e = ease(k);
      const pts = patchPoly(side, l).map(q => P(cxp + (q[0] - cxp) * e, 0, czp + (q[1] - czp) * (0.3 + 0.7 * e)));
      pts.forEach((p, i) => (i ? x.lineTo(p.x, p.y) : x.moveTo(p.x, p.y))); x.closePath();
      if (!R.intro['p' + side + l]) { R.intro['p' + side + l] = 1; const c = P(cxp, 0, czp); R.burst(c.x, c.y, LANDC[R.st.players[side].lanes[l].land.type], 10, { speed: 90, up: 60 }); if (R.onIntroPop) R.onIntroPop(); }
    }
    x.clip(); x.setTransform(1, 0, 0, 1, sx * R.dpr, sy * R.dpr); x.drawImage(board, 0, 0); x.restore();
  }
  x.setTransform(R.dpr, 0, 0, R.dpr, sx * R.dpr, sy * R.dpr);
  drawRubble(x);
  drawHighlights(x, t);
  buildingFx(x, t);
  // far to near
  const order = [];
  for (let side = 0; side < 2; side++) for (let l = 0; l < 4; l++) for (const slot of ['b', 'c']) order.push({ side, l, slot, z: rowZ(side, slot) });
  order.sort((a, b) => b.z - a.z);
  for (const o of order) {
    const L = R.st.players[o.side].lanes[o.l], obj = o.slot === 'c' ? L.creature : L.building;
    if (!obj) continue;
    const idle = R.idle && o.side === R.viewer && o.slot === 'c' && R.idle.indexOf(o.l) >= 0;
    drawMini(x, o.side, o.l, o.slot, obj, t, { idle });
  }
  drawDying(x, t);
  drawPreview(x, t);
  drawProjectiles(x);
  drawParticles(x);
  drawTexts(x);
  // selection ring
  if (R.sel) { const p = R.slotPos(R.sel.side, R.sel.lane, R.sel.slot); x.save(); x.strokeStyle = '#fff'; x.lineWidth = 2.5; x.globalAlpha = 0.6 + 0.4 * Math.sin(t * 6); x.beginPath(); x.ellipse(p.x, p.y, p.s * 0.38, p.s * 0.16, 0, 0, 7); x.stroke(); x.restore(); }
  // drag ghost miniature
  if (R.ghost) {
    const g = R.ghost, cd = E.CARDS[g.id];
    if (cd && cd.type !== 'spell') {
      const p = g.cell ? R.slotPos(g.cell.side, g.cell.lane, g.cell.slot) : { x: g.x, y: g.y + 30, s: R.cam.F / R.cam.D };
      const hpx = p.s * (cd.type === 'building' ? 1.2 : 1.22), sp = holoFor(cd.art, R.colors[R.viewer], hpx);
      const kk = hpx / sp.artH;
      x.save(); x.globalAlpha = g.cell ? 0.85 : 0.5; x.globalCompositeOperation = 'lighter'; x.drawImage(sp.glow, p.x - sp.w * kk / 2, p.y - sp.h * kk + sp.pad * kk, sp.w * kk, sp.h * kk);
      x.globalCompositeOperation = 'source-over'; x.drawImage(sp.body, p.x - sp.w * kk / 2, p.y - sp.h * kk + sp.pad * kk, sp.w * kk, sp.h * kk); x.restore();
      if (g.cell && cd.type === 'building' && cd.kw.aura) { x.save(); x.globalAlpha = 0.3; x.strokeStyle = '#ffcf3a'; x.lineWidth = 6; const a = R.slotPos(g.cell.side, Math.max(0, g.cell.lane - 1), 'c'), b = R.slotPos(g.cell.side, Math.min(3, g.cell.lane + 1), 'c'); x.beginPath(); x.moveTo(a.x - a.s * 0.4, a.y); x.lineTo(b.x + b.s * 0.4, b.y); x.stroke(); x.restore(); }
    }
  }
  x.restore();
};
R.invalidate = function () { boardKey = ''; bgKey = ''; };
R.TEAM = TEAM; R.LANDC = LANDC; R.laneX = laneX; R.rowZ = rowZ;
return R;
})();
/* END RENDER */
