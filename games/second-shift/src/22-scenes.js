/* =====================================================================
   22-scenes: painted battle locations, flat-vector style.
   paintScene(ctx, W, H, groundTop, id) paints the backdrop above groundTop
   and a perspective floor below it. Scenes are static and cached by the caller.
   ===================================================================== */
const hexRGBA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')'; };
const lgrad = (c, x0, y0, x1, y1, stops) => { const g = c.createLinearGradient(x0, y0, x1, y1); stops.forEach(([o, col]) => g.addColorStop(o, col)); return g; };
function scGlow(c, x, y, r, hex, a) { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, hexRGBA(hex, a)); g.addColorStop(1, hexRGBA(hex, 0)); c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); }
function scSky(c, W, gt, stops) { c.fillStyle = lgrad(c, 0, 0, 0, gt, stops); c.fillRect(0, 0, W, gt + 6); }
function scStars(c, W, h, rng, n) { for (let i = 0; i < n; i++) { c.globalAlpha = 0.3 + rng() * 0.7; c.fillStyle = '#fff'; const r = rng() < 0.1 ? 1.8 : 1; c.fillRect(rng() * W, rng() * h, r, r); } c.globalAlpha = 1; }
function scCloud(c, x, y, w, hex, a) { c.fillStyle = hexRGBA(hex, a); [[0, 0, 0.5, 0.16], [-0.25, 0.05, 0.3, 0.12], [0.28, 0.04, 0.32, 0.12], [0.05, -0.06, 0.3, 0.12]].forEach(([dx, dy, rw, rh]) => { c.beginPath(); c.ellipse(x + dx * w, y + dy * w, rw * w, rh * w, 0, 0, 7); c.fill(); }); }
function scWindows(c, x, y, w, h, cw, ch, gap, rng, litHex, prob, off) {
  const cols = Math.max(1, Math.floor((w - gap) / (cw + gap))), rows = Math.max(1, Math.floor((h - gap) / (ch + gap))), ox = x + (w - cols * (cw + gap) + gap) / 2;
  for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) { const lit = rng() < prob; c.fillStyle = lit ? litHex : off; c.globalAlpha = lit ? 0.75 + rng() * 0.25 : 1; c.fillRect(ox + k * (cw + gap), y + gap + r * (ch + gap), cw, ch); }
  c.globalAlpha = 1;
}
function scBuilding(c, x, base, w, h, col, o) {
  o = o || {}; const g = lgrad(c, 0, base - h, 0, base, [[0, shade(col, 0.1)], [1, shade(col, -0.18)]]);
  c.fillStyle = g; c.fillRect(x, base - h, w, h);
  c.fillStyle = 'rgba(0,0,30,.18)'; c.fillRect(x + w * 0.72, base - h, w * 0.28, h);        // side shade
  c.fillStyle = 'rgba(255,255,255,.07)'; c.fillRect(x, base - h, w * 0.06, h);
  if (o.cornice !== false) { c.fillStyle = shade(col, 0.2); c.fillRect(x - 3, base - h - 5, w + 6, 6); c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(x - 3, base - h + 1, w + 6, 2); }
  if (o.win !== false && o.rng) scWindows(c, x + 4, base - h + 8, w - 8, h - (o.groundH || 0) - 14, o.cw || 11, o.ch || 15, o.gap || 8, o.rng, o.lit || '#ffe3a0', o.prob == null ? 0.35 : o.prob, o.off || shade(col, -0.5));
}
function scLamp(c, x, base, h, hex, u) { c.fillStyle = '#1b2030'; c.fillRect(x - 2 * u, base - h, 4 * u, h); c.fillRect(x - 2 * u, base - h, 18 * u, 3 * u); scGlow(c, x + 15 * u, base - h + 4 * u, 70 * u, hex, 0.55); c.fillStyle = hex; c.beginPath(); c.ellipse(x + 15 * u, base - h + 5 * u, 7 * u, 3.5 * u, 0, 0, 7); c.fill(); c.fillStyle = '#1b2030'; c.fillRect(x - 6 * u, base - 5 * u, 12 * u, 5 * u); }
function scTree(c, x, base, r, hex, trunk) { c.fillStyle = trunk || '#4a3426'; c.fillRect(x - r * 0.07, base - r * 1.1, r * 0.14, r * 1.1); [[0, -1.35, 1], [-0.55, -1.0, 0.7], [0.55, -1.05, 0.72], [0.1, -1.75, 0.65]].forEach(([dx, dy, k], i) => { c.fillStyle = i % 2 ? shade(hex, 0.12) : hex; c.beginPath(); c.arc(x + dx * r, base + dy * r, r * k * 0.78, 0, 7); c.fill(); }); c.fillStyle = 'rgba(0,0,30,.2)'; c.beginPath(); c.arc(x + r * 0.2, base - r * 1.2, r * 0.6, 0, 7); c.fill(); }
function scFloor(c, W, H, gt, stops) { c.fillStyle = lgrad(c, 0, gt, 0, H, stops); c.fillRect(0, gt, W, H - gt); }
function scPersp(c, W, H, gt, n, col, alpha, vpY) { c.save(); c.strokeStyle = col; c.globalAlpha = alpha; c.lineWidth = 1.2; const vx = W / 2, vy = vpY == null ? gt - (H - gt) * 0.5 : vpY; for (let i = -n; i <= n; i++) { const bx = vx + i * (W * 1.4 / n); c.beginPath(); c.moveTo(vx + (bx - vx) * ((gt - vy) / (H - vy)), gt); c.lineTo(bx, H); c.stroke(); } c.restore(); }
function scRows(c, W, H, gt, n, col, alpha, pow) { c.save(); c.strokeStyle = col; c.globalAlpha = alpha; c.lineWidth = 1.2; for (let i = 0; i <= n; i++) { const t = Math.pow(i / n, pow || 1.7), y = gt + (H - gt) * t; c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); } c.restore(); }
function scText(c, txt, x, y, size, col, weight) { c.font = (weight || 800) + ' ' + size + 'px "Barlow Condensed","Arial Narrow",Impact,sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = col; c.fillText(txt, x, y); }
function scVignette(c, W, H, a) { const g = c.createRadialGradient(W / 2, H * 0.55, H * 0.35, W / 2, H * 0.55, H * 0.95); g.addColorStop(0, 'rgba(0,0,12,0)'); g.addColorStop(1, 'rgba(0,0,12,' + (a || 0.5) + ')'); c.fillStyle = g; c.fillRect(0, 0, W, H); }
function scSkyline(c, W, base, hMin, hMax, col, rng, opts) {
  opts = opts || {}; let x = -20;
  while (x < W + 20) { const w = (opts.wMin || 40) + rng() * (opts.wMax || 70), h = hMin + rng() * (hMax - hMin); c.fillStyle = col; c.fillRect(x, base - h, w, h + 4); if (opts.ant && rng() < 0.25) { c.fillRect(x + w * 0.5 - 1, base - h - 18 - rng() * 22, 2, 30); } if (opts.win) { c.fillStyle = opts.win; for (let wy = base - h + 8; wy < base - 8; wy += opts.wy || 13) for (let wx = x + 5; wx < x + w - 6; wx += opts.wx || 11) if (rng() < (opts.prob || 0.25)) { c.globalAlpha = 0.45 + rng() * 0.5; c.fillRect(wx, wy, 4, 6); } c.globalAlpha = 1; } x += w + rng() * 4; }
}

/* ------------------------------------------------------------------ */
function sceneStreet(c, W, H, gt, rng, v) {
  const u = Math.max(0.7, gt / 300), wreck = v === 'wreck';
  scSky(c, W, gt, wreck ? [[0, '#07081e'], [0.5, '#2a1646'], [0.85, '#8a2e4a'], [1, '#ff7a3a']] : [[0, '#2a2a68'], [0.4, '#8a4a8a'], [0.8, '#ff8a6a'], [1, '#ffd08a']]);
  if (wreck) scStars(c, W, gt * 0.5, rng, 70); else scGlow(c, W * 0.78, gt * 0.9, gt * 0.9, '#ffd08a', 0.7);
  for (let i = 0; i < 5; i++) scCloud(c, rng() * W, gt * (0.15 + rng() * 0.4), 120 + rng() * 160, wreck ? '#3a1a4a' : '#ffb08a', wreck ? 0.5 : 0.35);
  scSkyline(c, W, gt * 0.95, gt * 0.35, gt * 0.85, wreck ? '#1a1238' : '#5a3a7a', rng, { wMin: 40, wMax: 60, ant: true, win: wreck ? '#ffb86a' : '#ffd9a0', prob: 0.12 });
  scSkyline(c, W, gt, gt * 0.25, gt * 0.62, wreck ? '#140d2c' : '#47306a', rng, { wMin: 50, wMax: 70 });
  // storefront row
  const pal = wreck ? ['#3a2a44', '#2a3a58', '#4a2a3a', '#2a4048'] : ['#9a4a3a', '#c9a060', '#4a6a8a', '#7a4a6a', '#5a8a7a', '#b0603a'];
  const signs = ['BANK', 'CAFE', 'PHARMACY', 'DELI', 'BOOKS', 'PIZZA', 'MARKET', 'TAILOR'], awn = ['#c93a3a', '#2a7a8a', '#d9a030', '#3a5aa0'];
  let x = -30, i = 0, bank = false;
  while (x < W + 30) {
    const w = (105 + rng() * 80) * u, h = gt * (0.52 + rng() * 0.42), col = pal[i % pal.length], gh = 46 * u;
    scBuilding(c, x, gt, w, h, col, { rng, groundH: gh, cw: 10 * u, ch: 14 * u, gap: 9 * u, prob: wreck ? 0.22 : 0.4, lit: wreck ? '#ffa65a' : '#ffe3a0', off: wreck ? '#0e0a22' : shade(col, -0.45) });
    // storefront
    const sx = x + 6, sw = w - 12; c.fillStyle = shade(col, -0.55); c.fillRect(x, gt - gh, w, gh);
    c.fillStyle = wreck ? '#cc6a2a' : '#ffd98a'; c.globalAlpha = 0.85; c.fillRect(sx, gt - gh + 14 * u, sw * 0.62, gh - 16 * u); c.globalAlpha = 1; c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(sx + sw * 0.66, gt - gh + 14 * u, sw * 0.28, gh - 14 * u);
    const ac = awn[i % awn.length]; for (let k = 0; k < 6; k++) { c.fillStyle = k % 2 ? '#f4f0e6' : ac; c.fillRect(sx + k * sw / 6, gt - gh + 4 * u, sw / 6, 12 * u); }
    c.fillStyle = 'rgba(0,0,0,.3)'; c.fillRect(sx, gt - gh + 16 * u, sw, 3 * u);
    const sg = signs[(i * 3 + 1) % signs.length]; if (v === 'dusk' && !bank && w > 140 * u && x > W * 0.3) { bank = true; scText(c, 'FIRST NATIONAL', x + w / 2, gt - h * 0.55, 15 * u, '#ffe3a0', 800); c.fillStyle = shade(col, 0.25); for (let k = 0; k < 4; k++) c.fillRect(x + 12 * u + k * (w - 24 * u) / 3.6, gt - gh - 36 * u, 6 * u, 36 * u); } else scText(c, sg, x + w / 2, gt - gh - 10 * u, 13 * u, wreck ? '#ffb86a' : '#fff3c8', 800);
    if (wreck && rng() < 0.5) { c.fillStyle = '#070612'; c.fillRect(x + w * (0.2 + rng() * 0.5), gt - h + rng() * h * 0.5, 16 * u, 22 * u); scGlow(c, x + w * rng(), gt - h * (0.2 + rng() * 0.6), 60 * u, '#ff7a2a', 0.5); }
    x += w + 2; i++;
  }
  // sidewalk + road
  const sw2 = (H - gt) * 0.075;
  c.fillStyle = lgrad(c, 0, gt, 0, gt + sw2, [[0, wreck ? '#4a4660' : '#9a98a8'], [1, wreck ? '#35334a' : '#7a788c']]); c.fillRect(0, gt, W, sw2);
  c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(0, gt + sw2 - 2, W, 3); c.fillStyle = wreck ? '#5a5670' : '#b8b6c4'; c.fillRect(0, gt + sw2 - 6, W, 4);
  scFloor(c, W, H, gt + sw2, wreck ? [[0, '#2a2638'], [1, '#12101e']] : [[0, '#33364a'], [1, '#1a1d2c']]);
  c.save(); c.strokeStyle = wreck ? 'rgba(255,200,120,.22)' : 'rgba(255,220,100,.55)'; c.lineWidth = 3; c.setLineDash([36, 28]); const ly = gt + (H - gt) * 0.5; c.beginPath(); c.moveTo(0, ly); c.lineTo(W, ly); c.stroke(); c.setLineDash([]); c.restore();
  c.strokeStyle = 'rgba(255,255,255,.12)'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, H - (H - gt) * 0.06); c.lineTo(W, H - (H - gt) * 0.06); c.stroke();
  for (let k = 0; k < 90; k++) { c.fillStyle = 'rgba(255,255,255,' + (0.02 + rng() * 0.04) + ')'; c.fillRect(rng() * W, gt + sw2 + rng() * (H - gt), 2 + rng() * 6, 1); }
  // street furniture
  [0.1, 0.5, 0.9].forEach(k => scLamp(c, W * k, gt + sw2 * 0.8, 120 * u, wreck ? '#ff9a4a' : '#ffd98a', u));
  [0.3, 0.72].forEach(k => scTree(c, W * k, gt + sw2 * 0.9, 24 * u, wreck ? '#1d4a40' : '#3f9a4a'));
  c.fillStyle = '#c93a3a'; c.fillRect(W * 0.62, gt + sw2 * 0.4, 9 * u, 16 * u); c.fillStyle = '#fff'; c.fillRect(W * 0.62 + 2, gt + sw2 * 0.4 + 2, 5 * u, 3 * u);   // hydrant
  if (v === 'dusk') {   // armored truck parked at the kerb
    const tx = W * 0.8, ty = gt + sw2 * 0.9, tw = 230 * u, th = 100 * u;
    c.fillStyle = 'rgba(0,0,0,.3)'; c.beginPath(); c.ellipse(tx, ty + 4, tw * 0.5, 8 * u, 0, 0, 7); c.fill();
    c.fillStyle = '#5a6a7e'; c.fillRect(tx - tw / 2, ty - th, tw * 0.7, th - 14 * u); c.fillStyle = '#3f4c5e'; c.fillRect(tx - tw / 2, ty - th, tw * 0.7, 10 * u);
    c.fillStyle = '#6f8196'; c.beginPath(); c.moveTo(tx + tw * 0.2, ty - th * 0.78); c.lineTo(tx + tw * 0.42, ty - th * 0.78); c.lineTo(tx + tw * 0.5, ty - th * 0.4); c.lineTo(tx + tw * 0.5, ty - 14 * u); c.lineTo(tx + tw * 0.2, ty - 14 * u); c.closePath(); c.fill();
    c.fillStyle = '#9ad0ee'; c.fillRect(tx + tw * 0.25, ty - th * 0.7, tw * 0.15, th * 0.28); c.fillStyle = '#ffd23f'; scText(c, 'MERIDIAN SECURE', tx - tw * 0.15, ty - th * 0.55, 14 * u, '#ffd23f', 800);
    [tx - tw * 0.3, tx + tw * 0.32].forEach(wx => { c.fillStyle = '#16181f'; c.beginPath(); c.arc(wx, ty - 8 * u, 14 * u, 0, 7); c.fill(); c.fillStyle = '#9aa3bb'; c.beginPath(); c.arc(wx, ty - 8 * u, 6 * u, 0, 7); c.fill(); });
  }
  if (wreck) {   // smoke, searchlights, rubble, cracks
    for (let k = 0; k < 7; k++) { const sx = rng() * W, sy = gt * 0.9; for (let j = 0; j < 7; j++) { c.fillStyle = 'rgba(30,20,40,' + (0.28 - j * 0.03) + ')'; c.beginPath(); c.arc(sx + Math.sin(j) * 18, sy - j * 28 * u, (16 + j * 7) * u, 0, 7); c.fill(); } scGlow(c, sx, sy, 70 * u, '#ff7a2a', 0.45); }
    c.save(); c.globalAlpha = 0.1; c.fillStyle = '#fff'; [[W * 0.1, W * 0.35], [W * 0.9, W * 0.62]].forEach(([bx, tx2]) => { c.beginPath(); c.moveTo(bx - 14, H); c.lineTo(bx + 14, H); c.lineTo(tx2 + 60, 0); c.lineTo(tx2 - 60, 0); c.closePath(); c.fill(); }); c.restore();
    c.strokeStyle = 'rgba(0,0,0,.55)'; c.lineWidth = 3; for (let k = 0; k < 4; k++) { let px = rng() * W, py = gt + sw2 + 20; c.beginPath(); c.moveTo(px, py); for (let j = 0; j < 7; j++) { px += (rng() - 0.3) * 40; py += 22 + rng() * 24; c.lineTo(px, py); } c.stroke(); }
    for (let k = 0; k < 18; k++) { c.fillStyle = shade('#4a4660', -0.2 + rng() * 0.3); const rx = rng() < 0.5 ? rng() * W * 0.18 : W * (0.82 + rng() * 0.18); c.beginPath(); c.ellipse(rx, H - rng() * 40 - 10, (6 + rng() * 16) * u, (3 + rng() * 6) * u, 0, 0, 7); c.fill(); }
  }
}

function sceneDock(c, W, H, gt, rng) {
  const u = Math.max(0.7, gt / 300), hz = gt * 0.62;
  scSky(c, W, hz, [[0, '#1c1b4a'], [0.4, '#8a3a7a'], [0.75, '#ff7a6a'], [1, '#ffcf8a']]);
  scGlow(c, W * 0.6, hz, gt * 0.9, '#ffd08a', 0.8); c.fillStyle = '#ffe9b0'; c.beginPath(); c.arc(W * 0.6, hz - 4, 38 * u, Math.PI, 0); c.fill();
  for (let i = 0; i < 6; i++) scCloud(c, rng() * W, hz * (0.1 + rng() * 0.55), 160 + rng() * 140, '#ff9a8a', 0.4);
  c.fillStyle = '#1b1530'; for (let i = 0; i < 7; i++) { const gx = rng() * W, gy = hz * (0.2 + rng() * 0.4); c.beginPath(); c.moveTo(gx - 9, gy); c.quadraticCurveTo(gx - 4, gy - 8, gx, gy); c.quadraticCurveTo(gx + 4, gy - 8, gx + 9, gy); c.lineWidth = 2; c.strokeStyle = '#1b1530'; c.stroke(); }
  scSkyline(c, W, hz + 2, hz * 0.1, hz * 0.3, '#4a2a6a', rng, { wMin: 24, wMax: 40, win: '#ffd9a0', prob: 0.12 });
  // bridge
  c.strokeStyle = '#3a2a5a'; c.lineWidth = 5 * u; c.beginPath(); c.moveTo(W * 0.05, hz - 12 * u); c.lineTo(W * 0.5, hz - 12 * u); c.stroke(); c.lineWidth = 3 * u; [W * 0.18, W * 0.38].forEach(px => { c.beginPath(); c.moveTo(px, hz); c.lineTo(px, hz - 70 * u); c.stroke(); }); c.lineWidth = 2; c.beginPath(); c.moveTo(W * 0.05, hz - 12 * u); c.quadraticCurveTo(W * 0.18, hz - 70 * u, W * 0.28, hz - 40 * u); c.quadraticCurveTo(W * 0.38, hz - 70 * u, W * 0.5, hz - 12 * u); c.stroke();
  // water
  c.fillStyle = lgrad(c, 0, hz, 0, gt, [[0, '#d98a8a'], [0.25, '#6a4a8a'], [1, '#1a2a5a']]); c.fillRect(0, hz, W, gt - hz + 4);
  for (let i = 0; i < 90; i++) { c.fillStyle = 'rgba(255,225,170,' + (0.1 + rng() * 0.35) + ')'; const wy = hz + rng() * (gt - hz), ww = 6 + rng() * 40 * (1 - Math.abs(0.5 - (wy - hz) / (gt - hz)) * 0.2); c.fillRect(W * 0.6 + (rng() - 0.5) * W * 0.22 * ((wy - hz) / (gt - hz) + 0.3), wy, ww, 2); }
  for (let i = 0; i < 40; i++) { c.fillStyle = 'rgba(255,255,255,.06)'; c.fillRect(rng() * W, hz + rng() * (gt - hz), 10 + rng() * 50, 1.5); }
  // ship
  const sx = W * 0.82, sy = hz + 2; c.fillStyle = '#2a2250'; c.beginPath(); c.moveTo(sx - 110 * u, sy - 14 * u); c.lineTo(sx + 120 * u, sy - 14 * u); c.lineTo(sx + 100 * u, sy); c.lineTo(sx - 95 * u, sy); c.closePath(); c.fill(); ['#7a3a3a', '#2a6a7a', '#8a7a2a', '#3a4a8a'].forEach((cc, k) => { for (let j = 0; j < 4; j++) { c.fillStyle = cc; c.globalAlpha = 0.7; c.fillRect(sx - 90 * u + j * 30 * u, sy - 26 * u - (k % 2) * 8 * u, 26 * u, 12 * u); } }); c.globalAlpha = 1;
  // cranes
  [[W * 0.9, 1.0], [W * 0.1, 0.8]].forEach(([cx, k]) => { const ch = gt * 0.8 * k, cw = 60 * u * k; c.strokeStyle = '#a8402a'; c.lineWidth = 4 * u; c.beginPath(); c.moveTo(cx - cw / 2, gt); c.lineTo(cx - cw * 0.2, gt - ch); c.moveTo(cx + cw / 2, gt); c.lineTo(cx + cw * 0.2, gt - ch); c.stroke(); c.lineWidth = 2 * u; for (let j = 1; j < 6; j++) { const yy = gt - ch * j / 6; c.beginPath(); c.moveTo(cx - cw / 2 + cw * 0.3 * j / 6, yy); c.lineTo(cx + cw / 2 - cw * 0.3 * j / 6, yy + ch / 14); c.stroke(); } c.lineWidth = 6 * u; c.beginPath(); c.moveTo(cx - 140 * u * k, gt - ch); c.lineTo(cx + 60 * u * k, gt - ch); c.stroke(); c.fillStyle = '#e8d8c8'; c.fillRect(cx - cw * 0.2, gt - ch - 8 * u, cw * 0.4, 12 * u); c.fillStyle = '#ff5a3a'; c.fillRect(cx - 120 * u * k, gt - ch + 3, 8 * u, 24 * u); });
  // containers (left) + warehouse (right)
  const cc = ['#c0502a', '#2a7a8a', '#d9a030', '#3a5aa0', '#8a3a3a', '#4a8a5a'];
  const stack = (bx, cols, rows) => { for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) { const col = cc[Math.floor(rng() * cc.length)], cw2 = 78 * u, ch2 = 36 * u, px = bx + k * cw2, py = gt - (r + 1) * ch2; c.fillStyle = col; c.fillRect(px, py, cw2 - 2, ch2 - 2); c.fillStyle = 'rgba(0,0,0,.2)'; for (let j = 1; j < 9; j++) c.fillRect(px + j * cw2 / 9, py + 3, 2, ch2 - 8); c.fillStyle = 'rgba(255,255,255,.18)'; c.fillRect(px, py, cw2 - 2, 4); c.fillStyle = 'rgba(0,0,0,.3)'; c.fillRect(px + cw2 * 0.7, py, cw2 * 0.3 - 2, ch2 - 2); } };
  stack(-10, 3, 3); stack(40 * u, 2, 2);
  const wx = W * 0.62, ww = 250 * u, wh = 100 * u; c.fillStyle = '#5a4a5a'; c.fillRect(wx, gt - wh, ww, wh); c.fillStyle = '#4a3a4a'; c.beginPath(); c.moveTo(wx - 8, gt - wh); c.lineTo(wx + ww / 2, gt - wh - 30 * u); c.lineTo(wx + ww + 8, gt - wh); c.closePath(); c.fill(); for (let j = 0; j < 22; j++) { c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(wx + j * ww / 22, gt - wh, 2, wh); } c.fillStyle = '#2a2030'; c.fillRect(wx + ww * 0.62, gt - wh * 0.7, ww * 0.28, wh * 0.7); scText(c, 'PIER 9', wx + ww * 0.3, gt - wh * 0.55, 28 * u, '#ffd98a', 800); scGlow(c, wx + ww * 0.3, gt - wh * 0.55, 90 * u, '#ffd98a', 0.25);
  [W * 0.38, W * 0.56].forEach(lx => scLamp(c, lx, gt, 110 * u, '#ffd98a', u));
  // pier deck
  scFloor(c, W, H, gt, [[0, '#7a5638'], [0.5, '#5a3e2a'], [1, '#3a281e']]);
  const rows = 12; for (let i = 0; i <= rows; i++) { const t = Math.pow(i / rows, 1.8), y = gt + (H - gt) * t; c.fillStyle = 'rgba(20,10,0,.45)'; c.fillRect(0, y, W, 1 + t * 2); for (let k = 0; k < W; k += 140 + (i % 3) * 40) { c.fillRect(k + ((i * 53) % 90), y, 2 + t, (H - gt) * (Math.pow((i + 1) / rows, 1.8) - t)); } }
  for (let i = 0; i < 70; i++) { c.fillStyle = 'rgba(255,220,170,' + (0.03 + rng() * 0.05) + ')'; c.fillRect(rng() * W, gt + rng() * (H - gt), 30 + rng() * 80, 2); }
  c.fillStyle = 'rgba(0,0,0,.2)'; c.beginPath(); c.ellipse(W * 0.3, gt + (H - gt) * 0.55, 60 * u, 14 * u, 0, 0, 7); c.fill();
  c.fillStyle = '#1b1530'; c.fillRect(0, gt - 4, W, 5); for (let k = 0; k < W; k += 90 * u) { c.fillStyle = '#2a2040'; c.fillRect(k, gt - 14 * u, 6 * u, 16 * u); c.fillStyle = '#c0a070'; c.fillRect(k, gt - 9 * u, 90 * u, 2); }
}

function sceneSewer(c, W, H, gt, rng) {
  const u = Math.max(0.7, gt / 300);
  scSky(c, W, gt * 0.2, [[0, '#1c2650'], [1, '#4a5a7a']]); for (let i = 0; i < 9; i++) scTree(c, rng() * W, gt * 0.2, 26 * u, '#1f4a4a', '#2a3a3a');
  c.fillStyle = '#10181e'; c.fillRect(0, gt * 0.18, W, 5); c.strokeStyle = 'rgba(160,180,190,.35)'; c.lineWidth = 1; for (let x = 0; x < W; x += 12) { c.beginPath(); c.moveTo(x, gt * 0.13); c.lineTo(x + 6, gt * 0.18); c.stroke(); }
  // retaining wall
  c.fillStyle = lgrad(c, 0, gt * 0.2, 0, gt, [[0, '#4a5862'], [1, '#26323c']]); c.fillRect(0, gt * 0.2, W, gt * 0.8 + 2);
  c.fillStyle = 'rgba(255,255,255,.06)'; for (let y = gt * 0.2; y < gt; y += 34 * u) c.fillRect(0, y, W, 2); c.fillStyle = 'rgba(0,0,0,.22)'; for (let x = 0; x < W; x += 120 * u) c.fillRect(x, gt * 0.2, 3, gt * 0.8);
  for (let i = 0; i < 9; i++) { const gx = rng() * W; c.fillStyle = 'rgba(0,0,0,.28)'; c.fillRect(gx, gt * 0.2, 6 + rng() * 14, gt * (0.15 + rng() * 0.45)); }
  const gcols = ['#ff4d8d', '#3de0ff', '#ffc53d', '#a98bff']; c.lineWidth = 8 * u; c.lineCap = 'round'; for (let i = 0; i < 5; i++) { c.strokeStyle = hexRGBA(gcols[i % 4], 0.55); const gx = rng() * W, gy = gt * (0.3 + rng() * 0.4); c.beginPath(); c.moveTo(gx, gy); c.bezierCurveTo(gx + 30 * u, gy - 30 * u, gx + 60 * u, gy + 30 * u, gx + 90 * u, gy - 10 * u); c.stroke(); }
  // pipes
  [0.34, 0.47].forEach((k, i) => { const py = gt * k; c.fillStyle = lgrad(c, 0, py - 8 * u, 0, py + 8 * u, [[0, '#7a8a96'], [1, '#3a4650']]); c.fillRect(0, py - 8 * u, W, 16 * u); c.fillStyle = '#2a343c'; for (let x = 30; x < W; x += 140 * u) c.fillRect(x, py - 10 * u, 8 * u, 20 * u); });
  c.fillStyle = lgrad(c, 0, 0, 40 * u, 0, [[0, '#8a6a4a'], [1, '#4a3a2a']]); c.fillRect(W * 0.08, gt * 0.2, 30 * u, gt * 0.8);
  // tunnel mouth
  const tx = W * 0.5, tw = Math.min(W * 0.36, 460 * u), th = gt * 0.66, tb = gt * 0.96;
  c.fillStyle = '#6a5a4a'; c.beginPath(); c.moveTo(tx - tw / 2 - 16 * u, tb); c.lineTo(tx - tw / 2 - 16 * u, tb - th * 0.6); c.quadraticCurveTo(tx, tb - th * 1.3, tx + tw / 2 + 16 * u, tb - th * 0.6); c.lineTo(tx + tw / 2 + 16 * u, tb); c.closePath(); c.fill();
  for (let k = 0; k < 26; k++) { const a = Math.PI + (k / 25) * Math.PI; c.strokeStyle = 'rgba(0,0,0,.25)'; c.lineWidth = 2; c.beginPath(); c.moveTo(tx + Math.cos(a) * (tw / 2 + 2), tb - th * 0.6 + Math.sin(a) * th * 0.7); c.lineTo(tx + Math.cos(a) * (tw / 2 + 16 * u), tb - th * 0.6 + Math.sin(a) * th * 0.7 * 1.1); c.stroke(); }
  c.fillStyle = lgrad(c, 0, tb - th, 0, tb, [[0, '#04101a'], [1, '#0d3a38']]); c.beginPath(); c.moveTo(tx - tw / 2, tb); c.lineTo(tx - tw / 2, tb - th * 0.6); c.quadraticCurveTo(tx, tb - th * 1.2, tx + tw / 2, tb - th * 0.6); c.lineTo(tx + tw / 2, tb); c.closePath(); c.fill();
  scGlow(c, tx, tb - th * 0.25, tw * 0.5, '#6aff9a', 0.4);
  c.strokeStyle = '#1a2a30'; c.lineWidth = 3; for (let k = -3; k <= 3; k++) { c.beginPath(); c.moveTo(tx + k * tw * 0.12, tb - th * 0.9); c.lineTo(tx + k * tw * 0.12, tb); c.stroke(); } c.beginPath(); c.moveTo(tx - tw / 2, tb - th * 0.5); c.lineTo(tx + tw / 2, tb - th * 0.5); c.stroke();
  c.fillStyle = 'rgba(80,255,140,.5)'; c.fillRect(tx - tw / 2, tb - 12 * u, tw, 12 * u);
  for (let k = 0; k < 12; k++) { c.fillStyle = 'rgba(110,255,170,' + (0.1 + rng() * 0.25) + ')'; c.fillRect(tx - tw / 2 + rng() * tw, tb - 12 * u + rng() * 12 * u, 10 + rng() * 40, 2); }
  for (let k = 0; k < 8; k++) { c.strokeStyle = '#2a5a3a'; c.lineWidth = 3; const vx = tx - tw / 2 + rng() * tw; c.beginPath(); c.moveTo(vx, tb - th * 0.9); c.quadraticCurveTo(vx + 8, tb - th * (0.7 - rng() * 0.2), vx - 4, tb - th * (0.5 - rng() * 0.2)); c.stroke(); }
  // canal and floor
  c.fillStyle = lgrad(c, 0, gt - 18 * u, 0, gt + 6, [[0, '#1a5a4a'], [1, '#0e3a34']]); c.fillRect(0, gt - 18 * u, W, 22 * u); for (let i = 0; i < 40; i++) { c.fillStyle = 'rgba(160,255,200,' + (0.08 + rng() * 0.18) + ')'; c.fillRect(rng() * W, gt - 16 * u + rng() * 16 * u, 10 + rng() * 40, 1.5); }
  scFloor(c, W, H, gt + 4, [[0, '#4a5862'], [1, '#222c36']]);
  scRows(c, W, H, gt + 4, 10, '#0c1218', 0.5, 1.9); scPersp(c, W, H, gt + 4, 9, '#0c1218', 0.4, gt - (H - gt) * 0.6);
  for (let i = 0; i < 5; i++) { const gx = W * (0.08 + i * 0.21 + rng() * 0.05), gy = gt + (H - gt) * (0.25 + rng() * 0.6); c.fillStyle = '#0c1218'; c.fillRect(gx, gy, 54 * u, 18 * u); c.fillStyle = '#26323c'; for (let k = 1; k < 6; k++) c.fillRect(gx + k * 9 * u, gy + 2, 3, 14 * u); }
  for (let i = 0; i < 6; i++) { const px = rng() * W, py = gt + (H - gt) * (0.2 + rng() * 0.7); c.fillStyle = lgrad(c, px - 40, py, px + 40, py, [[0, 'rgba(110,200,170,.18)'], [1, 'rgba(110,200,170,.05)']]); c.beginPath(); c.ellipse(px, py, 40 * u + rng() * 40, 9 * u, 0, 0, 7); c.fill(); }
  for (let i = 0; i < 12; i++) { c.fillStyle = 'rgba(60,120,70,.4)'; c.beginPath(); c.ellipse(rng() * W, gt + (H - gt) * rng(), 14 + rng() * 26, 4 + rng() * 5, 0, 0, 7); c.fill(); }
}

function scenePlaza(c, W, H, gt, rng) {
  const u = Math.max(0.7, gt / 300);
  scSky(c, W, gt, [[0, '#06081e'], [0.5, '#1a1f4a'], [1, '#4a2a5a']]); scStars(c, W, gt * 0.7, rng, 110);
  scGlow(c, W * 0.22, gt * 0.3, 190 * u, '#cfd8ff', 0.28); c.fillStyle = '#e8ecff'; c.beginPath(); c.arc(W * 0.22, gt * 0.3, 44 * u, 0, 7); c.fill(); c.fillStyle = 'rgba(120,130,180,.35)'; [[-12, -8, 9], [10, 6, 12], [-4, 14, 6]].forEach(([dx, dy, r]) => { c.beginPath(); c.arc(W * 0.22 + dx * u, gt * 0.3 + dy * u, r * u, 0, 7); c.fill(); });
  for (let i = 0; i < 4; i++) scCloud(c, rng() * W, gt * (0.15 + rng() * 0.35), 160 + rng() * 140, '#3a3a7a', 0.45);
  scSkyline(c, W, gt, gt * 0.25, gt * 0.5, '#161a3e', rng, { wMin: 40, wMax: 60 });
  const pal = ['#7a3a3a', '#b8934f', '#4a5a78', '#6a3f6a', '#8a5a3a'];
  let x = -30, i = 0;
  while (x < W + 30) {
    const cw = i === 3 ? 200 * u : (100 + rng() * 70) * u, h = gt * (i === 3 ? 0.98 : 0.5 + rng() * 0.34), col = i === 3 ? '#6a6a8a' : pal[i % pal.length];
    scBuilding(c, x, gt, cw, h, col, { cornice: i !== 3, win: false });
    if (i === 3) {   // chapel
      c.fillStyle = shade(col, -0.1); c.beginPath(); c.moveTo(x - 6, gt - h * 0.62); c.lineTo(x + cw / 2, gt - h * 0.9); c.lineTo(x + cw + 6, gt - h * 0.62); c.closePath(); c.fill();
      c.fillStyle = shade(col, 0.05); c.fillRect(x + cw * 0.38, gt - h, cw * 0.24, h * 0.34); c.beginPath(); c.moveTo(x + cw * 0.36, gt - h); c.lineTo(x + cw / 2, gt - h * 1.18); c.lineTo(x + cw * 0.64, gt - h); c.closePath(); c.fill();
      scGlow(c, x + cw / 2, gt - h * 0.5, 80 * u, '#ffb86a', 0.5); c.fillStyle = '#ffcf7a'; c.beginPath(); c.arc(x + cw / 2, gt - h * 0.5, 22 * u, 0, 7); c.fill(); c.strokeStyle = '#6a3a2a'; c.lineWidth = 3; for (let k = 0; k < 4; k++) { c.beginPath(); c.moveTo(x + cw / 2, gt - h * 0.5); c.lineTo(x + cw / 2 + Math.cos(k * Math.PI / 4) * 22 * u, gt - h * 0.5 + Math.sin(k * Math.PI / 4) * 22 * u); c.moveTo(x + cw / 2, gt - h * 0.5); c.lineTo(x + cw / 2 - Math.cos(k * Math.PI / 4) * 22 * u, gt - h * 0.5 - Math.sin(k * Math.PI / 4) * 22 * u); c.stroke(); }
      c.fillStyle = '#1a1020'; c.beginPath(); c.moveTo(x + cw * 0.4, gt); c.lineTo(x + cw * 0.4, gt - 54 * u); c.quadraticCurveTo(x + cw / 2, gt - 84 * u, x + cw * 0.6, gt - 54 * u); c.lineTo(x + cw * 0.6, gt); c.closePath(); c.fill(); scGlow(c, x + cw / 2, gt - 20 * u, 60 * u, '#ffb86a', 0.35);
    } else {
      const rows = Math.max(2, Math.floor(h / (46 * u))), cols = Math.max(2, Math.floor(cw / (34 * u)));
      for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) { const wx = x + 8 * u + k * (cw - 16 * u) / cols + 3 * u, wy = gt - h + 14 * u + r * 44 * u, lit = rng() < 0.45; c.fillStyle = lit ? '#ffcf7a' : '#0e0f26'; c.beginPath(); c.moveTo(wx, wy + 24 * u); c.lineTo(wx, wy + 8 * u); c.quadraticCurveTo(wx + 9 * u, wy - 6 * u, wx + 18 * u, wy + 8 * u); c.lineTo(wx + 18 * u, wy + 24 * u); c.closePath(); c.fill(); if (lit) scGlow(c, wx + 9 * u, wy + 14 * u, 30 * u, '#ffb86a', 0.3); c.fillStyle = '#3a2a2a'; c.fillRect(wx - 3 * u, wy + 24 * u, 24 * u, 3 * u); }
    }
    x += cw + 2; i++;
  }
  // banners + string lights
  [0.17, 0.83].forEach(k => { c.fillStyle = '#6a2a8a'; c.fillRect(W * k - 14 * u, gt - gt * 0.72, 28 * u, 78 * u); c.beginPath(); c.moveTo(W * k - 14 * u, gt - gt * 0.72 + 78 * u); c.lineTo(W * k, gt - gt * 0.72 + 64 * u); c.lineTo(W * k + 14 * u, gt - gt * 0.72 + 78 * u); c.closePath(); c.fill(); c.fillStyle = '#e9e0ff'; c.beginPath(); c.ellipse(W * k, gt - gt * 0.72 + 30 * u, 8 * u, 5 * u, 0, 0, 7); c.fill(); c.beginPath(); c.arc(W * k + 8 * u, gt - gt * 0.72 + 26 * u, 3.5 * u, 0, 7); c.fill(); });
  c.strokeStyle = 'rgba(20,10,30,.8)'; c.lineWidth = 1.5; for (let s = 0; s < 3; s++) { const y0 = gt * (0.35 + s * 0.12), n = 30; c.beginPath(); for (let k = 0; k <= n; k++) { const px = (k / n) * W, py = y0 + Math.sin((k / n) * Math.PI * 4) * 12 * u + 14 * u * Math.sin((k / n) * Math.PI); k ? c.lineTo(px, py) : c.moveTo(px, py); } c.stroke(); for (let k = 0; k <= n; k += 2) { const px = (k / n) * W, py = y0 + Math.sin((k / n) * Math.PI * 4) * 12 * u + 14 * u * Math.sin((k / n) * Math.PI); scGlow(c, px, py + 4, 14 * u, '#ffd98a', 0.6); c.fillStyle = '#fff3c8'; c.beginPath(); c.arc(px, py + 3, 2.2 * u, 0, 7); c.fill(); } }
  // cobblestone floor
  scFloor(c, W, H, gt, [[0, '#4a3f5a'], [1, '#22202e']]);
  const rows = 14; for (let r = 0; r < rows; r++) { const t0 = Math.pow(r / rows, 1.8), t1 = Math.pow((r + 1) / rows, 1.8), y0 = gt + (H - gt) * t0, y1 = gt + (H - gt) * t1, cw = 26 + 70 * t0; for (let k = -(r % 2) * cw / 2; k < W; k += cw) { c.fillStyle = shade('#4a3f5a', (rng() - 0.5) * 0.25 - t0 * 0.3); c.beginPath(); rrect(c, k + 1.5, y0 + 1, cw - 3, y1 - y0 - 2, 5); c.fill(); } }
  c.save(); c.translate(W / 2, gt + (H - gt) * 0.52); c.scale(1, 0.42); c.strokeStyle = 'rgba(190,150,255,.35)'; c.lineWidth = 5; c.beginPath(); c.arc(0, 0, W * 0.3, 0, 7); c.stroke(); c.lineWidth = 2; c.beginPath(); c.arc(0, 0, W * 0.24, 0, 7); c.stroke(); for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6; c.beginPath(); c.moveTo(Math.cos(a) * W * 0.24, Math.sin(a) * W * 0.24); c.lineTo(Math.cos(a) * W * 0.3, Math.sin(a) * W * 0.3); c.stroke(); } c.restore();
  for (let k = 0; k < 14; k++) { const a = k * Math.PI * 2 / 14, px = W / 2 + Math.cos(a) * W * 0.27, py = gt + (H - gt) * 0.52 + Math.sin(a) * W * 0.27 * 0.42; scGlow(c, px, py - 4, 16 * u, '#ffb86a', 0.7); c.fillStyle = '#f4ead0'; c.fillRect(px - 2, py - 7, 4, 8); c.fillStyle = '#ffcf6a'; c.beginPath(); c.ellipse(px, py - 10, 2.5, 4, 0, 0, 7); c.fill(); }
  // pigeon totem + braziers
  const px = W * 0.5, pb = gt + 10 * u; c.fillStyle = '#4a4560'; c.fillRect(px - 26 * u, pb - 30 * u, 52 * u, 30 * u); c.fillStyle = '#5a5578'; c.fillRect(px - 32 * u, pb - 36 * u, 64 * u, 8 * u); scGlow(c, px, pb - 80 * u, 110 * u, '#a98bff', 0.35);
  c.fillStyle = '#9a98b0'; c.beginPath(); c.ellipse(px, pb - 70 * u, 28 * u, 22 * u, -0.2, 0, 7); c.fill(); c.beginPath(); c.arc(px + 22 * u, pb - 94 * u, 11 * u, 0, 7); c.fill(); c.fillStyle = '#ffb347'; c.beginPath(); c.moveTo(px + 31 * u, pb - 95 * u); c.lineTo(px + 44 * u, pb - 91 * u); c.lineTo(px + 31 * u, pb - 88 * u); c.fill(); c.fillStyle = '#7a7890'; c.beginPath(); c.ellipse(px - 6 * u, pb - 66 * u, 20 * u, 11 * u, -0.5, 0, 7); c.fill(); c.fillStyle = '#ff5a5a'; c.beginPath(); c.arc(px + 25 * u, pb - 96 * u, 2.4 * u, 0, 7); c.fill();
  [0.1, 0.9].forEach(k => { const bx = W * k; c.fillStyle = '#1b1722'; c.fillRect(bx - 3 * u, gt - 30 * u, 6 * u, 40 * u); c.beginPath(); c.moveTo(bx - 14 * u, gt - 36 * u); c.lineTo(bx + 14 * u, gt - 36 * u); c.lineTo(bx + 8 * u, gt - 22 * u); c.lineTo(bx - 8 * u, gt - 22 * u); c.closePath(); c.fill(); scGlow(c, bx, gt - 50 * u, 90 * u, '#ff8a3a', 0.6); c.fillStyle = '#ff8a2a'; c.beginPath(); c.moveTo(bx - 9 * u, gt - 36 * u); c.quadraticCurveTo(bx - 4 * u, gt - 62 * u, bx, gt - 74 * u); c.quadraticCurveTo(bx + 5 * u, gt - 58 * u, bx + 9 * u, gt - 36 * u); c.fill(); c.fillStyle = '#ffd23f'; c.beginPath(); c.moveTo(bx - 4 * u, gt - 36 * u); c.quadraticCurveTo(bx, gt - 54 * u, bx + 4 * u, gt - 36 * u); c.fill(); });
}

function sceneRoof(c, W, H, gt, rng, corp) {
  const u = Math.max(0.7, gt / 300);
  scSky(c, W, gt, [[0, '#0c1238'], [0.55, '#2a2a6a'], [1, '#6a3a7a']]); scStars(c, W, gt * 0.55, rng, 90);
  scGlow(c, W * 0.8, gt * 0.28, 170 * u, '#e8d8ff', 0.25); c.fillStyle = '#efe6ff'; c.beginPath(); c.arc(W * 0.8, gt * 0.28, 36 * u, 0, 7); c.fill();
  const base = gt * 0.9;
  scSkyline(c, W, base, gt * 0.35, gt * 0.85, '#1c1c4a', rng, { wMin: 36, wMax: 56, win: '#ffd98a', prob: 0.2, ant: true });
  scSkyline(c, W, base, gt * 0.2, gt * 0.6, '#14143a', rng, { wMin: 44, wMax: 70, win: '#3de0ff', prob: 0.14, wx: 14, wy: 16 });
  [['DROP·IT', 0.2, 0.42, '#ff4d8d'], ['NOODLES', 0.7, 0.5, '#3de0ff'], ['DRONE DELIVERY', 0.46, 0.3, '#ffc53d']].forEach(([t, kx, ky, col]) => { const bx = W * kx, by = gt * ky, bw = 150 * u; c.fillStyle = '#0a0a24'; c.fillRect(bx - bw / 2, by - 16 * u, bw, 32 * u); scGlow(c, bx, by, bw * 0.7, col, 0.35); c.strokeStyle = col; c.lineWidth = 2.5; c.strokeRect(bx - bw / 2 + 3, by - 13 * u, bw - 6, 26 * u); scText(c, t, bx, by, 17 * u, col, 800); });
  [W * 0.12, W * 0.9].forEach(ax => { c.fillStyle = '#0a0a24'; c.fillRect(ax - 1.5, base - gt * 0.7, 3, gt * 0.5); scGlow(c, ax, base - gt * 0.7, 22 * u, '#ff3a3a', 0.9); });
  // parapet + rooftop
  c.fillStyle = lgrad(c, 0, base, 0, gt, [[0, '#2a2e4a'], [1, '#161a30']]); c.fillRect(0, base, W, gt - base + 4); c.fillStyle = '#4a5078'; c.fillRect(0, base, W, 5); c.fillStyle = 'rgba(255,255,255,.12)'; c.fillRect(0, base, W, 2);
  c.strokeStyle = '#6a729a'; c.lineWidth = 2; for (let x = 6; x < W; x += 26 * u) { c.beginPath(); c.moveTo(x, base); c.lineTo(x, base - 22 * u); c.stroke(); } c.beginPath(); c.moveTo(0, base - 22 * u); c.lineTo(W, base - 22 * u); c.stroke();
  // props: HVAC, tank, drone racks, parcels
  const hv = (hx, w, h) => { c.fillStyle = '#6a7290'; c.fillRect(hx, gt - h, w, h); c.fillStyle = '#4a5270'; c.fillRect(hx, gt - h, w, 6 * u); c.fillStyle = '#2a3048'; c.beginPath(); c.arc(hx + w * 0.5, gt - h * 0.55, w * 0.28, 0, 7); c.fill(); for (let k = 0; k < 6; k++) { c.strokeStyle = '#6a7290'; c.lineWidth = 2; c.beginPath(); c.moveTo(hx + w * 0.5, gt - h * 0.55); c.lineTo(hx + w * 0.5 + Math.cos(k * 1.05) * w * 0.26, gt - h * 0.55 + Math.sin(k * 1.05) * w * 0.26); c.stroke(); } for (let j = 0; j < 4; j++) { c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(hx + 6, gt - h * 0.28 + j * 6 * u, w - 12, 2); } for (let j = 0; j < 5; j++) { c.fillStyle = 'rgba(230,236,255,' + (0.18 - j * 0.03) + ')'; c.beginPath(); c.arc(hx + w * 0.7 + Math.sin(j) * 4, gt - h - j * 16 * u, (8 + j * 4) * u, 0, 7); c.fill(); } };
  hv(W * 0.05, 90 * u, 70 * u); hv(W * 0.86, 100 * u, 78 * u);
  if (!corp) {
    c.fillStyle = '#5a4a3a'; c.fillRect(W * 0.2, gt - 74 * u, 56 * u, 50 * u); c.fillStyle = '#3a2f26'; c.beginPath(); c.moveTo(W * 0.2 - 4, gt - 74 * u); c.lineTo(W * 0.2 + 28 * u, gt - 90 * u); c.lineTo(W * 0.2 + 60 * u, gt - 74 * u); c.fill(); c.fillStyle = '#2a2018'; [8, 28, 48].forEach(o => c.fillRect(W * 0.2 + o * u, gt - 26 * u, 4 * u, 26 * u));
    for (let k = 0; k < 3; k++) { c.fillStyle = '#2a2f48'; c.fillRect(W * 0.72 + k * 34 * u, gt - 60 * u, 30 * u, 60 * u); for (let j = 0; j < 3; j++) { c.fillStyle = '#4a5270'; c.fillRect(W * 0.72 + k * 34 * u + 5 * u, gt - 52 * u + j * 18 * u, 20 * u, 10 * u); scGlow(c, W * 0.72 + k * 34 * u + 15 * u, gt - 47 * u + j * 18 * u, 12 * u, '#3de0ff', 0.45); c.fillStyle = '#3de0ff'; c.fillRect(W * 0.72 + k * 34 * u + 22 * u, gt - 52 * u + j * 18 * u, 3 * u, 3 * u); } }
    [[0.34, '#b8864a'], [0.37, '#c9965a'], [0.355, '#a8763a']].forEach(([k, col], j) => { c.fillStyle = col; c.fillRect(W * k, gt - (26 + j * 18) * u, 34 * u, 22 * u); c.fillStyle = 'rgba(0,0,0,.2)'; c.fillRect(W * k + 14 * u, gt - (26 + j * 18) * u, 5 * u, 22 * u); });
  }
  scFloor(c, W, H, gt, [[0, '#2e3250'], [1, '#161a2e']]);
  scRows(c, W, H, gt, 9, '#0a0c1e', 0.55, 1.9); scPersp(c, W, H, gt, 9, '#0a0c1e', 0.4, gt - (H - gt) * 0.8);
  c.save(); c.strokeStyle = 'rgba(255,205,70,.55)'; c.lineWidth = 4; c.setLineDash([22, 16]); c.strokeRect(W * 0.06, gt + (H - gt) * 0.1, W * 0.88, (H - gt) * 0.8); c.setLineDash([]); c.restore();
  c.save(); c.translate(W / 2, gt + (H - gt) * 0.5); c.scale(1, 0.36); c.strokeStyle = 'rgba(255,255,255,.3)'; c.lineWidth = 8; c.beginPath(); c.arc(0, 0, W * 0.2, 0, 7); c.stroke(); c.fillStyle = 'rgba(255,255,255,.12)'; c.font = '800 ' + W * 0.16 + 'px Bangers,Impact,sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('D', 0, 0); c.restore();
  for (let k = 0; k < 60; k++) { c.fillStyle = 'rgba(255,255,255,' + (0.02 + rng() * 0.04) + ')'; c.fillRect(rng() * W, gt + rng() * (H - gt), 10 + rng() * 40, 1); }
}

function sceneCorp(c, W, H, gt, rng) {
  const u = Math.max(0.7, gt / 300);
  scSky(c, W, gt, [[0, '#2f5a98'], [0.55, '#7aa8d8'], [1, '#ffd8b0']]); scGlow(c, W * 0.18, gt * 0.82, gt, '#fff0c8', 0.75);
  for (let i = 0; i < 5; i++) scCloud(c, rng() * W, gt * (0.12 + rng() * 0.4), 150 + rng() * 150, '#ffffff', 0.55);
  // glass towers
  const tower = (x, w, h, tint) => { c.fillStyle = lgrad(c, x, gt - h, x + w, gt, [[0, shade(tint, 0.35)], [0.5, tint], [1, shade(tint, -0.35)]]); c.fillRect(x, gt - h, w, h); c.save(); c.beginPath(); c.rect(x, gt - h, w, h); c.clip(); c.strokeStyle = 'rgba(255,255,255,.14)'; c.lineWidth = 1; for (let y = gt - h; y < gt; y += 14 * u) { c.beginPath(); c.moveTo(x, y); c.lineTo(x + w, y); c.stroke(); } for (let xx = x; xx < x + w; xx += 16 * u) { c.beginPath(); c.moveTo(xx, gt - h); c.lineTo(xx, gt); c.stroke(); } c.fillStyle = 'rgba(255,255,255,.12)'; c.beginPath(); c.moveTo(x + w * 0.15, gt - h); c.lineTo(x + w * 0.45, gt - h); c.lineTo(x + w * 0.1, gt); c.lineTo(x - w * 0.2, gt); c.fill(); c.restore(); c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(x - 2, gt - h - 4, w + 4, 5); };
  const tints = ['#3a7ab0', '#4a8a9a', '#5a7ac0', '#3a6a8a'];
  let x = -20, i = 0; while (x < W + 20) { const w = (70 + rng() * 60) * u; tower(x, w, gt * (0.5 + rng() * 0.45), tints[i % 4]); x += w + 6 * u; i++; }
  // Apex tower
  const ax = W * 0.5, aw = 190 * u, ah = gt * 1.0; tower(ax - aw / 2, aw, ah, '#4a6ab0'); c.fillStyle = '#e8eef8'; c.fillRect(ax - aw / 2, gt - ah, aw, 7 * u);
  scGlow(c, ax, gt - ah * 0.72, 120 * u, '#ffd23f', 0.4); c.fillStyle = '#10204a'; c.beginPath(); c.arc(ax, gt - ah * 0.72, 40 * u, 0, 7); c.fill(); c.fillStyle = '#ffd23f'; c.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, r = (k % 2 ? 0.45 : 1) * 30 * u; k ? c.lineTo(ax + Math.cos(a) * r, gt - ah * 0.72 + Math.sin(a) * r) : c.moveTo(ax + Math.cos(a) * r, gt - ah * 0.72 + Math.sin(a) * r); } c.closePath(); c.fill(); scText(c, 'APEX', ax, gt - ah * 0.72 + 56 * u, 26 * u, '#ffffff', 800);
  c.fillStyle = '#10204a'; c.fillRect(ax - aw / 2, gt - 54 * u, aw, 54 * u); for (let k = 0; k < 5; k++) { c.fillStyle = '#7ad0ff'; c.globalAlpha = 0.45; c.fillRect(ax - aw / 2 + 8 * u + k * (aw - 16 * u) / 5, gt - 46 * u, (aw - 16 * u) / 5 - 4 * u, 40 * u); } c.globalAlpha = 1;
  // banners, spot lights, cameras
  [0.1, 0.26, 0.74, 0.9].forEach(k => { c.fillStyle = '#c9ccd8'; c.fillRect(W * k - 2, gt - 150 * u, 4, 150 * u); c.fillStyle = '#f4f7ff'; c.fillRect(W * k + 2, gt - 148 * u, 38 * u, 100 * u); c.fillStyle = '#1a3a8a'; c.fillRect(W * k + 2, gt - 148 * u, 38 * u, 10 * u); c.fillStyle = '#ffc53d'; c.beginPath(); for (let j = 0; j < 10; j++) { const a = -Math.PI / 2 + j * Math.PI / 5, r = (j % 2 ? 0.45 : 1) * 11 * u; j ? c.lineTo(W * k + 21 * u + Math.cos(a) * r, gt - 98 * u + Math.sin(a) * r) : c.moveTo(W * k + 21 * u + Math.cos(a) * r, gt - 98 * u + Math.sin(a) * r); } c.closePath(); c.fill(); });
  c.save(); c.globalAlpha = 0.1; c.fillStyle = '#fff6d0'; [0.34, 0.66].forEach(k => { c.beginPath(); c.moveTo(W * k - 6, gt - 120 * u); c.lineTo(W * k + 6, gt - 120 * u); c.lineTo(W * k + 70 * u, H); c.lineTo(W * k - 70 * u, H); c.closePath(); c.fill(); }); c.restore();
  [0.17, 0.83].forEach(k => { const cx = W * k, cy = gt + 6 * u; c.strokeStyle = '#2a2e3e'; c.lineWidth = 3; c.beginPath(); c.moveTo(cx, cy - 34 * u); c.lineTo(cx - 14 * u, cy); c.moveTo(cx, cy - 34 * u); c.lineTo(cx + 14 * u, cy); c.moveTo(cx, cy - 34 * u); c.lineTo(cx, cy); c.stroke(); c.fillStyle = '#16181f'; c.fillRect(cx - 18 * u, cy - 58 * u, 36 * u, 26 * u); c.fillStyle = '#e8eef8'; c.fillRect(cx + 4 * u, cy - 54 * u, 12 * u, 8 * u); c.fillStyle = '#c93a3a'; c.beginPath(); c.arc(cx - 10 * u, cy - 50 * u, 3 * u, 0, 7); c.fill(); c.fillStyle = '#1a3a8a'; c.fillRect(cx - 12 * u, cy - 72 * u, 24 * u, 12 * u); scText(c, 'NEWS', cx, cy - 66 * u, 9 * u, '#fff', 800); });
  // floor: polished marble + red carpet
  scFloor(c, W, H, gt, [[0, '#cfd4e0'], [1, '#8a91a8']]); scRows(c, W, H, gt, 11, '#6a728c', 0.5, 1.8); scPersp(c, W, H, gt, 11, '#6a728c', 0.4, gt - (H - gt) * 0.7);
  c.fillStyle = lgrad(c, 0, gt, 0, gt + (H - gt) * 0.5, [[0, 'rgba(255,255,255,.55)'], [1, 'rgba(255,255,255,0)']]); c.fillRect(0, gt, W, (H - gt) * 0.5);
  const cy1 = gt + (H - gt) * 0.04, cy2 = gt + (H - gt) * 0.17; c.fillStyle = '#a82a3a'; c.beginPath(); c.moveTo(W * 0.1, cy1); c.lineTo(W * 0.9, cy1); c.lineTo(W * 0.96, cy2); c.lineTo(W * 0.04, cy2); c.closePath(); c.fill(); c.fillStyle = '#c93a4a'; c.fillRect(W * 0.1, cy1, W * 0.8, 2);
  for (let k = 0; k < 9; k++) { const px = W * (0.08 + k * 0.105); c.fillStyle = '#d9b050'; c.fillRect(px, cy1 - 14 * u, 4 * u, 18 * u); c.beginPath(); c.arc(px + 2 * u, cy1 - 15 * u, 4 * u, 0, 7); c.fill(); if (k < 8) { c.strokeStyle = '#8a1a2a'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(px + 2 * u, cy1 - 10 * u); c.quadraticCurveTo(px + W * 0.052, cy1 - 2 * u, px + W * 0.105 + 2 * u, cy1 - 10 * u); c.stroke(); } }
}

function sceneGrid(c, W, H, gt, rng) {
  const u = Math.max(0.7, gt / 300);
  scSky(c, W, gt, [[0, '#04051a'], [0.5, '#161050'], [1, '#3a1a6a']]);
  for (let i = 0; i < 7; i++) scCloud(c, rng() * W, gt * (0.1 + rng() * 0.5), 200 + rng() * 220, '#2a1a5a', 0.6);
  const bolt = (x0, y0, x1, y1, w) => { c.save(); c.strokeStyle = '#bff8ff'; c.lineWidth = w; c.shadowColor = '#3de0ff'; c.shadowBlur = 22; c.beginPath(); let x = x0, y = y0; c.moveTo(x, y); for (let k = 1; k <= 9; k++) { x = x0 + (x1 - x0) * k / 9 + (rng() - 0.5) * 36 * u; y = y0 + (y1 - y0) * k / 9; c.lineTo(x, y); } c.stroke(); c.restore(); };
  scGlow(c, W * 0.3, gt * 0.2, 240 * u, '#6a8aff', 0.25); bolt(W * 0.3, 0, W * 0.36, gt * 0.78, 2.5); bolt(W * 0.76, 0, W * 0.7, gt * 0.7, 2); bolt(W * 0.52, gt * 0.1, W * 0.5, gt * 0.5, 1.5);
  // cooling towers
  [[W * 0.1, 1.0], [W * 0.92, 0.85]].forEach(([cx, k]) => { const th = gt * 0.8 * k, tw = 130 * u * k; c.fillStyle = lgrad(c, cx - tw, 0, cx + tw, 0, [[0, '#1a1a48'], [1, '#0c0c2e']]); c.beginPath(); c.moveTo(cx - tw * 0.8, gt); c.quadraticCurveTo(cx - tw * 0.4, gt - th * 0.55, cx - tw * 0.55, gt - th); c.lineTo(cx + tw * 0.55, gt - th); c.quadraticCurveTo(cx + tw * 0.4, gt - th * 0.55, cx + tw * 0.8, gt); c.closePath(); c.fill(); for (let j = 0; j < 3; j++) { c.fillStyle = 'rgba(190,200,255,' + (0.15 - j * 0.04) + ')'; c.beginPath(); c.arc(cx + j * 14, gt - th - j * 26 * u, (30 + j * 18) * u, 0, 7); c.fill(); } scGlow(c, cx, gt - th * 0.3, 80 * u, '#3de0ff', 0.25); });
  // pylons + cables
  const pylon = (px, h, k) => { const w = 90 * u * k; c.strokeStyle = '#2a2e6a'; c.lineWidth = 4 * u * k; c.beginPath(); c.moveTo(px - w / 2, gt); c.lineTo(px - w * 0.12, gt - h); c.moveTo(px + w / 2, gt); c.lineTo(px + w * 0.12, gt - h); c.stroke(); c.lineWidth = 2 * u * k; for (let j = 1; j < 8; j++) { const y = gt - h * j / 8, t = j / 8, xl = px - w / 2 + (w / 2 - w * 0.12) * t, xr = px + w / 2 - (w / 2 - w * 0.12) * t; c.beginPath(); c.moveTo(xl, y); c.lineTo(xr, y + h / 16); c.moveTo(xr, y); c.lineTo(xl, y + h / 16); c.stroke(); } c.lineWidth = 5 * u * k; [[0.78, 1.5], [0.58, 1.1]].forEach(([ty, ak]) => { c.beginPath(); c.moveTo(px - w * ak * 0.9, gt - h * ty); c.lineTo(px + w * ak * 0.9, gt - h * ty); c.stroke(); [-1, 1].forEach(s => { scGlow(c, px + s * w * ak * 0.9, gt - h * ty + 4, 18 * u, '#3de0ff', 0.7); }); }); return [px, gt - h * 0.78, w * 1.35]; };
  const p1 = pylon(W * 0.3, gt * 0.9, 1), p2 = pylon(W * 0.68, gt * 0.8, 0.9);
  c.strokeStyle = 'rgba(160,190,255,.35)'; c.lineWidth = 1.5; [[p1, p2], [[-40, p1[1], 0], p1], [p2, [W + 40, p2[1], 0]]].forEach(([a, b]) => { for (let k = -1; k <= 1; k++) { c.beginPath(); c.moveTo(a[0] + k * a[2] * 0.7, a[1]); c.quadraticCurveTo((a[0] + b[0]) / 2, Math.max(a[1], b[1]) + 40 * u, b[0] + k * b[2] * 0.7, b[1]); c.stroke(); } });
  // control building + transformers
  const bx = W * 0.44, bw = 220 * u, bh = 110 * u; c.fillStyle = '#10113a'; c.fillRect(bx, gt - bh, bw, bh); c.fillStyle = '#1a1c5a'; c.fillRect(bx, gt - bh, bw, 8 * u); for (let r = 0; r < 3; r++) for (let k = 0; k < 8; k++) { c.fillStyle = rng() < 0.7 ? '#7df9ff' : '#1a1c5a'; c.globalAlpha = 0.8; c.fillRect(bx + 12 * u + k * 25 * u, gt - bh + 22 * u + r * 24 * u, 15 * u, 12 * u); } c.globalAlpha = 1; scGlow(c, bx + bw / 2, gt - bh * 0.6, 150 * u, '#3de0ff', 0.25); scText(c, 'GRID CENTRAL', bx + bw / 2, gt - bh - 14 * u, 22 * u, '#7df9ff', 800); scGlow(c, bx + bw / 2, gt - bh - 14 * u, 80 * u, '#3de0ff', 0.35);
  [W * 0.05, W * 0.2, W * 0.78, W * 0.86].forEach((tx, k) => { const th = (56 + (k % 2) * 16) * u, tw = 54 * u; c.fillStyle = '#1c1e52'; c.fillRect(tx, gt - th, tw, th); c.fillStyle = '#2a2e7a'; for (let j = 0; j < 7; j++) c.fillRect(tx - 4 * u, gt - th + 6 * u + j * 7 * u, tw + 8 * u, 3 * u); c.fillStyle = '#10113a'; for (let j = 0; j < 3; j++) { c.fillRect(tx + 6 * u + j * 15 * u, gt - th - 14 * u, 8 * u, 14 * u); scGlow(c, tx + 10 * u + j * 15 * u, gt - th - 14 * u, 22 * u, '#3de0ff', 0.65); c.fillStyle = '#bff8ff'; c.fillRect(tx + 8 * u + j * 15 * u, gt - th - 16 * u, 4 * u, 3 * u); c.fillStyle = '#10113a'; } });
  // floor: metal grating + circuits
  scFloor(c, W, H, gt, [[0, '#262a52'], [1, '#0e1030']]); scRows(c, W, H, gt, 12, '#070820', 0.6, 1.8); scPersp(c, W, H, gt, 11, '#070820', 0.5, gt - (H - gt) * 0.7);
  c.save(); c.strokeStyle = '#3de0ff'; c.shadowColor = '#3de0ff'; c.shadowBlur = 10; c.globalAlpha = 0.75; c.lineWidth = 2.5; const cy0 = gt + (H - gt) * 0.5; c.beginPath(); c.moveTo(0, cy0); c.lineTo(W * 0.14, cy0); c.lineTo(W * 0.18, cy0 - (H - gt) * 0.2); c.lineTo(W * 0.3, cy0 - (H - gt) * 0.2); c.moveTo(W, cy0); c.lineTo(W * 0.86, cy0); c.lineTo(W * 0.82, cy0 + (H - gt) * 0.22); c.lineTo(W * 0.7, cy0 + (H - gt) * 0.22); c.moveTo(W * 0.3, H); c.lineTo(W * 0.3, H - (H - gt) * 0.2); c.lineTo(W * 0.4, H - (H - gt) * 0.28); c.stroke(); c.restore();
  const hz = gt + (H - gt) * 0.04; for (let k = 0; k < W; k += 38 * u) { c.fillStyle = (k / (38 * u)) % 2 ? '#ffc53d' : '#1a1a2a'; c.beginPath(); c.moveTo(k, gt); c.lineTo(k + 19 * u, gt); c.lineTo(k + 9 * u, hz + 4); c.lineTo(k - 10 * u, hz + 4); c.fill(); }
  for (let k = 0; k < 8; k++) { c.strokeStyle = 'rgba(125,249,255,.5)'; c.lineWidth = 2; let px = rng() * W, py = gt + (H - gt) * (0.3 + rng() * 0.6); c.beginPath(); c.moveTo(px, py); for (let j = 0; j < 4; j++) { px += (rng() - 0.5) * 50; py += (rng() - 0.5) * 14; c.lineTo(px, py); } c.stroke(); }
}

const SCENES = {
  street: (c, W, H, gt, r) => sceneStreet(c, W, H, gt, r, 'dusk'), wreck: (c, W, H, gt, r) => sceneStreet(c, W, H, gt, r, 'wreck'), dock: sceneDock, sewer: sceneSewer, plaza: scenePlaza,
  roof: (c, W, H, gt, r) => sceneRoof(c, W, H, gt, r, false), corp: sceneCorp, grid: sceneGrid,
};
function paintScene(c, W, H, gt, id, seed) {
  const rng = makeRng(hashStr(id) + (seed || 0)); gt = clamp(gt, H * 0.22, H * 0.62);
  c.save(); c.fillStyle = '#05060f'; c.fillRect(0, 0, W, H);
  (SCENES[id] || SCENES.street)(c, W, H, gt, rng);
  scVignette(c, W, H, 0.45);
  c.restore();
}
