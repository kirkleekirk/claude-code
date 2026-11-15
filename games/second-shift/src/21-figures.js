/* =====================================================================
   21-figures: flat-vector character renderer with heroic proportions.
   Unit height = 1.0, feet at (0,0), front-facing, light from upper-left.
   Style: flat colour blocks + soft two-tone shading + thin tinted edges,
   with costume detail (trim, panels, pads, bracers, boots) layered on top.
   ===================================================================== */
const INK = '#0b0d1c';
const EDGE = 'rgba(8,10,34,.6)';
let _face = 1, _lw = 0.008;

function rrect(c, x, y, w, h, r) {
  r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
  c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
  c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
}
function shade(hex, amt) {   // lighten (+) / darken (-)
  const n = parseInt(hex.slice(1), 16); const r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const f = v => clamp(Math.round(v + (amt > 0 ? (255 - v) * amt : v * amt)), 0, 255);
  return '#' + [f(r), f(g), f(b)].map(v => v.toString(16).padStart(2, '0')).join('');
}
const BODY = {
  slim: { sw: 0.150, ww: 0.085, hw: 0.105, aw: 0.054, lw: 0.068, hr: 0.066 },
  normal: { sw: 0.182, ww: 0.100, hw: 0.122, aw: 0.064, lw: 0.080, hr: 0.068 },
  bulky: { sw: 0.228, ww: 0.126, hw: 0.148, aw: 0.082, lw: 0.097, hr: 0.070 },
  huge: { sw: 0.268, ww: 0.152, hw: 0.172, aw: 0.100, lw: 0.112, hr: 0.072 },
};

/* ---------- path + paint helpers (path first, then paint) ---------- */
function circP(c, x, y, r) { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); return [x - r, y - r, r * 2, r * 2]; }
function ellP(c, x, y, rx, ry, rot) { c.beginPath(); c.ellipse(x, y, rx, ry, rot || 0, 0, Math.PI * 2); return [x - rx, y - ry, rx * 2, ry * 2]; }
function polyP(c, pts) {
  c.beginPath(); let x0 = 9, y0 = 9, x1 = -9, y1 = -9;
  pts.forEach((p, i) => { i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]); x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); });
  c.closePath(); return [x0, y0, x1 - x0, y1 - y0];
}
function taperP(c, x0, y0, x1, y1, w0, w1) {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1e-6, nx = -dy / L, ny = dx / L, th = Math.atan2(ny, nx);
  c.beginPath();
  c.moveTo(x0 + nx * w0 / 2, y0 + ny * w0 / 2); c.lineTo(x1 + nx * w1 / 2, y1 + ny * w1 / 2);
  c.arc(x1, y1, w1 / 2, th, th - Math.PI, true);
  c.lineTo(x0 - nx * w0 / 2, y0 - ny * w0 / 2);
  c.arc(x0, y0, w0 / 2, th + Math.PI, th, true); c.closePath();
  const m = Math.max(w0, w1) / 2;
  return [Math.min(x0, x1) - m, Math.min(y0, y1) - m, Math.abs(dx) + m * 2, Math.abs(dy) + m * 2];
}
/* fill the current path: gradient, two-tone shade (screen-right), rim light (screen-left), thin edge */
function paint(c, fill, box, o) {
  o = o || {}; const [bx, by, bw, bh] = box;
  if (o.flat) c.fillStyle = fill; else { const g = c.createLinearGradient(0, by, 0, by + bh); g.addColorStop(0, shade(fill, 0.13)); g.addColorStop(1, shade(fill, -0.09)); c.fillStyle = g; }
  c.fill();
  if (!o.noShade) {
    c.save(); c.clip();
    c.fillStyle = 'rgba(8,10,44,.24)'; if (_face > 0) c.fillRect(bx + bw * 0.6, by - 0.02, bw, bh + 0.04); else c.fillRect(bx - bw, by - 0.02, bw * 1.4, bh + 0.04);
    c.fillStyle = 'rgba(255,255,255,.14)'; if (_face > 0) c.fillRect(bx, by - 0.02, bw * 0.13, bh + 0.04); else c.fillRect(bx + bw * 0.87, by - 0.02, bw * 0.13, bh + 0.04);
    c.restore();
  }
  if (!o.noEdge) { c.lineWidth = _lw; c.strokeStyle = o.edge || EDGE; c.stroke(); }
}
const line = (c, x0, y0, x1, y1, col, w) => { c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.strokeStyle = col; c.lineWidth = w || _lw; c.stroke(); };

/* ---------- hair / face / masks (relative to head radius r) ---------- */
function hairStrands(c, cx, cy, r, col, n) {
  c.save(); c.strokeStyle = shade(col, 0.28); c.lineWidth = _lw * 0.8; c.globalAlpha = 0.7;
  for (let i = 0; i < (n || 4); i++) { const a = Math.PI * (1.15 + i * 0.2); c.beginPath(); c.moveTo(cx + Math.cos(a) * r * 0.5, cy + Math.sin(a) * r * 0.35 - r * 0.2); c.quadraticCurveTo(cx + Math.cos(a) * r * 0.95, cy + Math.sin(a) * r * 0.8 - r * 0.1, cx + Math.cos(a) * r * 1.05, cy + Math.sin(a) * r * 0.2); c.stroke(); }
  c.restore();
}
function drawHair(c, st, col, cx, cy, r, back) {
  const P = (box, o) => paint(c, col, box, o);
  switch (st) {
    case 'short': { c.beginPath(); c.arc(cx, cy, r * 1.07, Math.PI * 1.02, Math.PI * 1.98); c.quadraticCurveTo(cx + r * 0.2, cy - r * 0.62, cx - r * 0.98, cy - r * 0.2); c.closePath(); P([cx - r, cy - r * 1.1, r * 2, r]); hairStrands(c, cx, cy, r, col); break; }
    case 'slick': { c.beginPath(); c.arc(cx, cy, r * 1.09, Math.PI * 1.0, Math.PI * 2.0); c.quadraticCurveTo(cx + r * 0.25, cy - r * 0.5, cx - r * 0.97, cy - r * 0.12); c.closePath(); P([cx - r, cy - r * 1.1, r * 2, r]); hairStrands(c, cx, cy, r, col, 3); break; }
    case 'puffs': drawHair(c, 'short', col, cx, cy, r); [-1, 1].forEach(s => { P(circP(c, cx + s * r * 0.98, cy - r * 0.8, r * 0.56)); P(circP(c, cx + s * r * 0.98, cy - r * 0.8, r * 0.3), { flat: true, noShade: true, noEdge: true }); }); break;
    case 'messy': { P(polyP(c, [[cx - r, cy - r * 0.1], [cx - r * 1.08, cy - r * 0.95], [cx - r * 0.5, cy - r * 0.6], [cx - r * 0.35, cy - r * 1.45], [cx + r * 0.05, cy - r * 0.85], [cx + r * 0.45, cy - r * 1.4], [cx + r * 0.62, cy - r * 0.65], [cx + r * 1.12, cy - r * 1.0], [cx + r, cy - r * 0.05], [cx, cy - r * 0.38]])); break; }
    case 'bob': { c.beginPath(); rrect(c, cx - r * 1.14, cy - r * 1.05, r * 2.28, r * 2.2, r * 0.9); P([cx - r * 1.14, cy - r * 1.05, r * 2.28, r * 2.2]); break; }
    case 'afro': P(circP(c, cx, cy - r * 0.18, r * 1.55)); P(circP(c, cx - r * 0.5, cy - r * 0.7, r * 0.55), { flat: true, noEdge: true, noShade: true }); break;
    case 'flame': P(polyP(c, [[cx - r * 1.02, cy], [cx - r * 1.12, cy - r * 1.25], [cx - r * 0.6, cy - r * 0.55], [cx - r * 0.45, cy - r * 1.95], [cx - r * 0.05, cy - r * 0.85], [cx + r * 0.3, cy - r * 2.15], [cx + r * 0.55, cy - r * 0.75], [cx + r * 1.12, cy - r * 1.35], [cx + r * 1.02, cy - r * 0.05], [cx, cy - r * 0.3]])); paint(c, '#ffd23f', polyP(c, [[cx - r * 0.25, cy - r * 0.5], [cx - r * 0.1, cy - r * 1.35], [cx + r * 0.1, cy - r * 0.6]]), { flat: true, noShade: true, noEdge: true }); break;
    case 'wild': { const pts = []; for (let i = 0; i <= 12; i++) { const a = Math.PI + (i / 12) * Math.PI, rr = r * (i % 2 ? 1.15 : 1.8); pts.push([cx + Math.cos(a) * rr, cy - r * 0.1 + Math.sin(a) * rr]); } pts.push([cx + r, cy], [cx - r, cy]); P(polyP(c, pts)); break; }
    case 'mohawk': P(polyP(c, [[cx - r * 0.3, cy - r * 0.8], [cx - r * 0.05, cy - r * 1.75], [cx + r * 0.2, cy - r * 1.2], [cx + r * 0.42, cy - r * 1.7], [cx + r * 0.55, cy - r * 0.8]])); break;
    case 'bun': drawHair(c, 'short', col, cx, cy, r); P(circP(c, cx - r * 0.1, cy - r * 1.3, r * 0.46)); break;
    case 'hood': { c.beginPath(); c.arc(cx, cy + r * 0.05, r * 1.38, Math.PI * 0.85, Math.PI * 2.15); c.lineTo(cx + r * 1.25, cy + r * 1.15); c.quadraticCurveTo(cx, cy + r * 0.55, cx - r * 1.25, cy + r * 1.15); c.closePath(); P([cx - r * 1.4, cy - r * 1.4, r * 2.8, r * 2.6]); break; }
    case 'cap': { c.beginPath(); c.arc(cx, cy - r * 0.1, r * 1.12, Math.PI, Math.PI * 2); c.closePath(); P([cx - r * 1.1, cy - r * 1.2, r * 2.2, r * 1.1]); P(polyP(c, [[cx + r * 0.3, cy - r * 0.3], [cx + r * 1.6, cy - r * 0.2], [cx + r * 1.5, cy + r * 0.12], [cx + r * 0.3, cy]]), { flat: true }); break; }
    default: break;
  }
}
function drawFace(c, cx, cy, r, expr, small, look) {
  const ex = r * 0.4, ey = cy + r * 0.05, er = r * 0.19;
  c.save(); c.lineWidth = _lw * 0.85; c.lineCap = 'round'; c.strokeStyle = 'rgba(30,14,10,.8)';
  // nose bridge + jaw shade
  if (!small) { c.beginPath(); c.moveTo(cx + r * 0.05, cy + r * 0.12); c.lineTo(cx - r * 0.02, cy + r * 0.42); c.lineTo(cx + r * 0.14, cy + r * 0.44); c.strokeStyle = 'rgba(60,20,10,.35)'; c.stroke(); c.strokeStyle = 'rgba(30,14,10,.8)'; }
  const eye = (x, sq, wink) => {
    if (wink) { c.beginPath(); c.moveTo(x - er, ey); c.quadraticCurveTo(x, ey - er * 1.2, x + er, ey); c.stroke(); return; }
    ellP(c, x, ey, er * 1.05, er * (sq ? 0.6 : 1.15)); c.fillStyle = '#fff'; c.fill();
    c.beginPath(); c.arc(x + er * 0.3, ey + er * 0.05, er * 0.62, 0, Math.PI * 2); c.fillStyle = look && look.eye ? look.eye : '#2a1a14'; c.fill();
    c.beginPath(); c.arc(x + er * 0.3, ey + er * 0.05, er * 0.3, 0, Math.PI * 2); c.fillStyle = '#0a0606'; c.fill();
    c.beginPath(); c.arc(x + er * 0.55, ey - er * 0.25, er * 0.2, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill();
  };
  const sq = expr === 'smug' || expr === 'bored';
  eye(cx - ex, sq); eye(cx + ex, sq, expr === 'wink');
  // brows
  c.lineWidth = _lw * 1.2; c.strokeStyle = look && look.hair && look.hair.c ? shade(look.hair.c, -0.1) : '#2a1a14';
  const bro = (x, a) => { c.beginPath(); c.moveTo(x - er * 1.3, ey - er * 1.9 + a); c.lineTo(x + er * 1.3, ey - er * 1.9 - a); c.stroke(); };
  if (expr === 'angry') { bro(cx - ex, -er * 0.7); bro(cx + ex, er * 0.7); } else if (expr === 'worry') { bro(cx - ex, er * 0.6); bro(cx + ex, -er * 0.6); } else if (expr === 'smug') { bro(cx - ex, 0); bro(cx + ex, er * 0.8); } else if (!small) { bro(cx - ex, 0); bro(cx + ex, 0); }
  c.strokeStyle = 'rgba(40,14,12,.85)'; c.lineWidth = _lw * 1.05;
  if (!small) {
    const my = cy + r * 0.62;
    c.beginPath();
    if (expr === 'grin') { c.moveTo(cx - r * 0.4, my - r * 0.05); c.quadraticCurveTo(cx, my + r * 0.46, cx + r * 0.4, my - r * 0.05); c.closePath(); c.fillStyle = '#fff7f2'; c.fill(); c.stroke(); c.beginPath(); c.moveTo(cx - r * 0.3, my + r * 0.07); c.lineTo(cx + r * 0.3, my + r * 0.07); c.stroke(); }
    else if (expr === 'shout') { c.ellipse(cx + r * 0.04, my + r * 0.06, r * 0.28, r * 0.34, 0, 0, Math.PI * 2); c.fillStyle = '#5a1020'; c.fill(); c.stroke(); c.beginPath(); c.ellipse(cx + r * 0.04, my + r * 0.2, r * 0.17, r * 0.1, 0, 0, Math.PI * 2); c.fillStyle = '#e8606a'; c.fill(); }
    else if (expr === 'worry') { c.moveTo(cx - r * 0.3, my + r * 0.1); c.quadraticCurveTo(cx, my - r * 0.15, cx + r * 0.3, my + r * 0.1); c.stroke(); }
    else if (expr === 'smug') { c.moveTo(cx - r * 0.25, my); c.quadraticCurveTo(cx + r * 0.1, my + r * 0.2, cx + r * 0.4, my - r * 0.12); c.stroke(); }
    else if (expr === 'angry') { c.moveTo(cx - r * 0.3, my + r * 0.08); c.lineTo(cx + r * 0.3, my + r * 0.08); c.stroke(); }
    else { c.moveTo(cx - r * 0.24, my); c.quadraticCurveTo(cx, my + r * 0.14, cx + r * 0.24, my); c.stroke(); }
  }
  c.restore();
}
function drawHeadgear(c, look, cx, cy, r, pass) {
  const m = look.mask || { t: 'none' }, col = m.c || '#111';
  if (pass === 'under') { if (m.t === 'balaclava') { paint(c, col, circP(c, cx, cy, r * 1.06)); } return; }
  const shine = (x, y, w) => { c.save(); c.globalAlpha = 0.5; c.fillStyle = '#fff'; c.fillRect(x, y, w, r * 0.07); c.restore(); };
  switch (m.t) {
    case 'domino': c.beginPath(); rrect(c, cx - r * 1.04, cy - r * 0.34, r * 2.08, r * 0.62, r * 0.3); paint(c, col, [cx - r, cy - r * 0.34, r * 2, r * 0.62]); [-1, 1].forEach(s => { ellP(c, cx + s * r * 0.4, cy - r * 0.03, r * 0.21, r * 0.17); c.fillStyle = '#fff'; c.fill(); c.beginPath(); c.arc(cx + s * r * 0.4 + r * 0.05, cy - r * 0.03, r * 0.09, 0, 7); c.fillStyle = '#111'; c.fill(); }); break;
    case 'goggles': c.beginPath(); c.moveTo(cx - r * 1.08, cy - r * 0.05); c.lineTo(cx + r * 1.08, cy - r * 0.05); c.strokeStyle = shade(col, -0.4); c.lineWidth = _lw * 4; c.stroke(); [-1, 1].forEach(s => { paint(c, col, circP(c, cx + s * r * 0.44, cy, r * 0.36)); paint(c, '#bdeaff', circP(c, cx + s * r * 0.44, cy, r * 0.23), { noShade: true }); c.save(); c.globalAlpha = 0.7; c.fillStyle = '#fff'; c.beginPath(); c.arc(cx + s * r * 0.44 - r * 0.07, cy - r * 0.08, r * 0.07, 0, 7); c.fill(); c.restore(); }); break;
    case 'catcowl': { c.beginPath(); c.arc(cx, cy - r * 0.05, r * 1.08, Math.PI * 0.98, Math.PI * 2.02); c.lineTo(cx + r * 1.02, cy + r * 0.14); c.quadraticCurveTo(cx, cy - r * 0.16, cx - r * 1.02, cy + r * 0.14); c.closePath(); paint(c, col, [cx - r, cy - r * 1.1, r * 2, r * 1.2]); [-1, 1].forEach(s => { paint(c, col, polyP(c, [[cx + s * r * 0.95, cy - r * 0.5], [cx + s * r * 0.9, cy - r * 1.7], [cx + s * r * 0.2, cy - r * 0.95]])); paint(c, '#ff4d8d', polyP(c, [[cx + s * r * 0.8, cy - r * 0.7], [cx + s * r * 0.78, cy - r * 1.35], [cx + s * r * 0.38, cy - r * 0.95]]), { noShade: true, noEdge: true, flat: true }); }); break; }
    case 'visor': c.beginPath(); rrect(c, cx - r * 1.05, cy - r * 0.28, r * 2.1, r * 0.56, r * 0.22); paint(c, col, [cx - r, cy - r * 0.28, r * 2, r * 0.56]); shine(cx - r * 0.7, cy - r * 0.15, r * 0.9); break;
    case 'sunglasses': [-1, 1].forEach(s => { c.beginPath(); rrect(c, cx + s * r * 0.45 - r * 0.4, cy - r * 0.24, r * 0.8, r * 0.52, r * 0.2); paint(c, col, [cx + s * r * 0.45 - r * 0.4, cy - r * 0.24, r * 0.8, r * 0.52]); }); line(c, cx - r * 0.05, cy - r * 0.06, cx + r * 0.05, cy - r * 0.06, EDGE, _lw * 2); shine(cx - r * 0.8, cy - r * 0.12, r * 0.4); break;
    case 'balaclava': c.beginPath(); rrect(c, cx - r * 0.86, cy - r * 0.22, r * 1.72, r * 0.44, r * 0.2); c.fillStyle = shade(look.skin || '#d9a066', -0.05); c.fill(); [-1, 1].forEach(s => { ellP(c, cx + s * r * 0.4, cy, r * 0.17, r * 0.14); c.fillStyle = '#fff'; c.fill(); c.beginPath(); c.arc(cx + s * r * 0.45, cy, r * 0.08, 0, 7); c.fillStyle = '#111'; c.fill(); }); line(c, cx - r * 0.55, cy - r * 0.26, cx - r * 0.2, cy - r * 0.3, '#111', _lw * 2); line(c, cx + r * 0.2, cy - r * 0.3, cx + r * 0.55, cy - r * 0.26, '#111', _lw * 2); break;
    case 'bird': paint(c, col, circP(c, cx, cy + r * 0.05, r * 1.06)); paint(c, '#ffb347', polyP(c, [[cx + r * 0.5, cy + r * 0.0], [cx + r * 1.7, cy + r * 0.36], [cx + r * 0.45, cy + r * 0.64]])); [-1, 1].forEach(s => { paint(c, '#fff', circP(c, cx + s * r * 0.36, cy - r * 0.12, r * 0.22), { noShade: true }); c.beginPath(); c.arc(cx + s * r * 0.36 + r * 0.06, cy - r * 0.1, r * 0.1, 0, 7); c.fillStyle = '#111'; c.fill(); }); break;
    case 'helmet': c.beginPath(); c.arc(cx, cy - r * 0.05, r * 1.14, Math.PI, Math.PI * 2); c.closePath(); paint(c, col, [cx - r * 1.1, cy - r * 1.2, r * 2.2, r * 1.15]); break;
    default: break;
  }
}
function drawEmblem(c, kind, x, y, s, col, dark) {
  c.save(); c.translate(x, y); c.lineWidth = _lw * 0.9; c.strokeStyle = dark || 'rgba(8,10,34,.7)';
  const F = box => paint(c, col, box, { noShade: true, flat: true });
  switch (kind) {
    case 'bolt': F(polyP(c, [[s * 0.3, -s], [-s * 0.7, s * 0.15], [-s * 0.05, s * 0.15], [-s * 0.3, s], [s * 0.7, -s * 0.25], [s * 0.05, -s * 0.25]])); break;
    case 'star': { const p = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? s * 0.45 : s; p.push([Math.cos(a) * r, Math.sin(a) * r]); } F(polyP(c, p)); break; }
    case 'wing': F(polyP(c, [[-s, s * 0.5], [-s * 0.1, -s * 0.8], [0, -s * 0.2], [s * 0.1, -s * 0.8], [s, s * 0.5], [0, s * 0.1]])); break;
    case 'anvil': F(polyP(c, [[-s, -s * 0.5], [s, -s * 0.5], [s * 0.5, 0], [s * 0.5, s * 0.5], [s * 0.9, s * 0.8], [-s * 0.9, s * 0.8], [-s * 0.5, s * 0.5], [-s * 0.5, 0]])); break;
    case 'diamond': F(polyP(c, [[0, -s], [s * 0.8, 0], [0, s], [-s * 0.8, 0]])); break;
    case 'cross': F(polyP(c, [[-s * 0.3, -s], [s * 0.3, -s], [s * 0.3, -s * 0.3], [s, -s * 0.3], [s, s * 0.3], [s * 0.3, s * 0.3], [s * 0.3, s], [-s * 0.3, s], [-s * 0.3, s * 0.3], [-s, s * 0.3], [-s, -s * 0.3], [-s * 0.3, -s * 0.3]])); break;
    case 'flame': c.beginPath(); c.moveTo(0, -s); c.quadraticCurveTo(s * 0.9, -s * 0.1, s * 0.5, s * 0.6); c.quadraticCurveTo(0, s * 1.1, -s * 0.5, s * 0.6); c.quadraticCurveTo(-s * 0.9, 0, -s * 0.1, -s * 0.4); c.closePath(); paint(c, col, [-s, -s, s * 2, s * 2], { noShade: true, flat: true }); break;
    case 'eye': ellP(c, 0, 0, s, s * 0.55); paint(c, col, [-s, -s * 0.55, s * 2, s * 1.1], { noShade: true, flat: true }); c.beginPath(); c.arc(0, 0, s * 0.3, 0, 7); c.fillStyle = '#0b0d1c'; c.fill(); break;
    case 'bomb': paint(c, col, circP(c, 0, s * 0.2, s * 0.7), { noShade: true, flat: true }); c.beginPath(); c.moveTo(s * 0.3, -s * 0.4); c.quadraticCurveTo(s * 0.8, -s * 0.9, s * 0.9, -s * 0.5); c.stroke(); c.beginPath(); c.arc(s * 0.9, -s * 0.55, s * 0.18, 0, 7); c.fillStyle = '#ff5a2a'; c.fill(); break;
    case 'cone': F(polyP(c, [[-s * 0.6, -s * 0.3], [s * 0.6, -s * 0.3], [0, s]])); paint(c, col, circP(c, 0, -s * 0.5, s * 0.5), { noShade: true, flat: true }); break;
    case 'badge': c.beginPath(); c.moveTo(0, -s); c.lineTo(s * 0.85, -s * 0.5); c.lineTo(s * 0.7, s * 0.4); c.lineTo(0, s); c.lineTo(-s * 0.7, s * 0.4); c.lineTo(-s * 0.85, -s * 0.5); c.closePath(); paint(c, col, [-s, -s, s * 2, s * 2], { noShade: true, flat: true }); break;
    default: break;
  }
  c.restore();
}

/* ---------- main entry ---------- */
function drawFigure(c, look, o) {
  o = Object.assign({ x: 0, y: 0, s: 100, face: 1, t: 0, pose: 'idle', pa: 0, flash: 0, alpha: 1, shadow: true, expr: 'neutral', size: 1, comp: 'source-over' }, o);
  renderFigure(c, look, o);
  if (o.flash > 0.02) renderFigure(c, look, Object.assign({}, o, { shadow: false, alpha: o.alpha * Math.min(1, o.flash) * 0.8, comp: 'lighter' }));
}
function renderFigure(c, look, o) {
  const kind = look.kind || 'human';
  _face = o.face >= 0 ? 1 : -1;
  c.save();
  c.globalAlpha = o.alpha; c.globalCompositeOperation = o.comp;
  c.translate(o.x, o.y); c.scale(_face * o.s * o.size, o.s * o.size);
  c.lineJoin = 'round'; c.lineCap = 'round'; c.strokeStyle = EDGE;
  _lw = Math.max(0.0065, 1.05 / (o.s * o.size)); c.lineWidth = _lw;
  if (o.shadow) {
    const wide = kind === 'gator' ? 0.4 : kind === 'mech' ? 0.34 : 0.24;
    c.save(); const g = c.createRadialGradient(0, 0.004, 0.01, 0, 0.004, wide); g.addColorStop(0, 'rgba(0,0,0,.45)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.translate(0, 0); c.scale(1, 0.2); c.fillStyle = g; c.beginPath(); c.arc(0, 0.004 / 0.2, wide, 0, Math.PI * 2); c.fill(); c.restore();
  }
  if (kind === 'drone') drawDrone(c, look, o); else if (kind === 'gator') drawGator(c, look, o); else if (kind === 'mech') drawMech(c, look, o); else drawHuman(c, look, o);
  c.restore();
}

function drawHuman(c, look, o) {
  const B = BODY[look.build] || BODY.normal, t = o.t, pa = o.pa, pose = o.pose, sp = Math.sin(pa * Math.PI);
  const suit = look.suit, suit2 = look.suit2 || shade(suit, -0.35), acc = look.accent || '#ffffff', skin = look.skin, skinD = shade(skin, -0.16);
  const ex = look.extras || [], lab = ex.includes('labcoat'), gaunt = ex.includes('gauntlets');
  const sleeve = lab ? '#eef1fb' : suit, boots = look.boots || shade(suit2, -0.45), accD = shade(acc, -0.35);
  const sw = B.sw, ww = B.ww, hw = B.hw, shY = -0.795, wY = -0.55, hipY = -0.485;
  /* pose parameters */
  let bob = Math.sin(t * 2.1) * 0.0045, lean = 0, lift = 0, fx = 0, rot = 0, aF = 0.14, aB = -0.14, bF = -0.14, bB = 0.14, legF = 0, legB = 0;
  const breathe = Math.sin(t * 2.1) * 0.003;
  if (pose === 'attack') { lean = sp * 0.08; fx = sp * 0.07; aF = lerp(0.14, 1.5, sp); bF = lerp(-0.14, 0, sp); aB = lerp(-0.14, -0.7, sp); }
  else if (pose === 'cast') { lift = sp * 0.035; aF = lerp(0.14, 2.55, sp); aB = lerp(-0.14, -2.4, sp); bF = 0.1; bB = -0.1; }
  else if (pose === 'walk') { const w = Math.sin(pa * Math.PI * 4); legF = w * 0.42; legB = -w * 0.42; aF = -w * 0.5 + 0.1; aB = -w * 0.5 - 0.1; bob = Math.abs(w) * 0.02; }
  else if (pose === 'hurt') { fx = -Math.sin(pa * Math.PI * 6) * 0.03 - 0.03; lean = -0.12; aF = 0.8; aB = -0.7; }
  else if (pose === 'cheer') { aF = 2.65 + Math.sin(t * 9) * 0.2; aB = -2.65 + Math.sin(t * 9) * 0.2; bob = Math.abs(Math.sin(t * 7)) * 0.04; bF = 0.1; bB = -0.1; }
  else if (pose === 'jump') { lift = sp * 0.28; legF = 0.5; legB = -0.3; aF = 1.2; aB = -1.0; }
  else if (pose === 'down') { rot = -1.35; }
  c.save(); c.translate(fx, -lift - bob); if (rot) { c.rotate(rot); c.translate(0.1, 0); } c.rotate(lean * 0.5);

  /* ---- cape (behind everything) ---- */
  if (look.cape) {
    const sway = Math.sin(t * 2.1) * 0.014 + (pose === 'walk' ? 0.03 : 0) + (pose === 'attack' ? sp * 0.05 : 0), hem = -0.06, cc = look.cape;
    c.beginPath(); c.moveTo(-sw * 0.78, shY - 0.01); c.bezierCurveTo(-sw * 1.55 - sway, -0.64, -sw * 1.6 - sway * 1.5, -0.3, -sw * 1.4 - sway * 2, hem);
    c.lineTo(-sw * 0.9 - sway, hem - 0.035); c.lineTo(-sw * 0.45, hem + 0.012); c.lineTo(0, hem - 0.04); c.lineTo(sw * 0.45, hem + 0.012); c.lineTo(sw * 0.9 + sway, hem - 0.035); c.lineTo(sw * 1.4 + sway * 2, hem);
    c.bezierCurveTo(sw * 1.6 + sway * 1.5, -0.3, sw * 1.55 + sway, -0.64, sw * 0.78, shY - 0.01); c.closePath();
    paint(c, cc, [-sw * 1.6, shY, sw * 3.2, 0.74]);
    c.save(); c.clip(); c.strokeStyle = 'rgba(0,0,0,.2)'; c.lineWidth = _lw * 1.4;
    [-0.5, -0.17, 0.17, 0.5].forEach(k => { c.beginPath(); c.moveTo(k * sw * 1.3, shY + 0.04); c.quadraticCurveTo(k * sw * 2.3 + sway * k, -0.4, k * sw * 2.8 + sway * 2 * k, hem); c.stroke(); });
    c.fillStyle = 'rgba(255,255,255,.07)'; c.fillRect(-sw * 1.7, shY, sw * 0.9, 0.8); c.restore();
  }
  /* ---- legs ---- */
  const leg = (side, ang) => {
    const hx = side * hw * 0.5, hy = hipY + 0.012, Lt = 0.222, Ls = 0.212;
    const kx = hx + Math.sin(ang) * Lt + side * 0.012, ky = hy + Math.cos(ang) * Lt, a2 = ang * 0.35 + (Math.abs(ang) > 0.05 ? -0.15 * Math.sign(ang) * -1 : 0);
    const ax = kx + Math.sin(a2) * Ls + side * 0.006, ay = ky + Math.cos(a2) * Ls;
    paint(c, suit2, taperP(c, hx, hy, kx, ky, B.lw * 1.22, B.lw * 0.9));
    paint(c, shade(suit2, -0.06), taperP(c, kx, ky, ax, ay, B.lw * 0.88, B.lw * 0.66));
    // thigh highlight + knee pad
    c.save(); c.globalAlpha = 0.22; c.fillStyle = '#fff'; c.beginPath(); c.ellipse((hx + kx) / 2 - side * B.lw * 0.2, (hy + ky) / 2, B.lw * 0.13, Lt * 0.3, 0, 0, 7); c.fill(); c.restore();
    paint(c, shade(suit2, -0.12), ellP(c, kx, ky + 0.004, B.lw * 0.42, B.lw * 0.3), { noShade: true });
    // boot: cuff + body + toe cap + laces
    const bw = B.lw * 1.18, top = ay - 0.075, bot = ay + 0.048;
    c.beginPath(); rrect(c, ax - bw / 2 + side * 0.006, top, bw, bot - top, bw * 0.3); paint(c, boots, [ax - bw / 2, top, bw, bot - top]);
    c.beginPath(); rrect(c, ax - bw / 2 - 0.003 + side * 0.006, top - 0.004, bw + 0.006, 0.028, 0.01); paint(c, acc, [ax - bw / 2, top, bw, 0.03], { noShade: true });
    c.beginPath(); ellipse2(c, ax + side * (bw * 0.32), bot - 0.012, bw * 0.56, 0.026); paint(c, shade(boots, 0.1), [ax - bw * 0.2, bot - 0.04, bw * 1.1, 0.05], { noShade: true });
    line(c, ax - 0.012, top + 0.04, ax + 0.012 + side * 0.006, top + 0.04, 'rgba(255,255,255,.35)'); line(c, ax - 0.012, top + 0.055, ax + 0.012 + side * 0.006, top + 0.055, 'rgba(255,255,255,.3)');
  };
  leg(-1, legB); leg(1, legF);

  /* ---- torso ---- */
  const torso = () => { c.beginPath(); c.moveTo(-sw, shY + 0.022); c.quadraticCurveTo(-sw - 0.006, shY - 0.03, -sw * 0.6, shY - 0.034); c.lineTo(-0.05, shY - 0.044); c.lineTo(0.05, shY - 0.044); c.lineTo(sw * 0.6, shY - 0.034); c.quadraticCurveTo(sw + 0.006, shY - 0.03, sw, shY + 0.022); c.lineTo(sw * 0.92, -0.705); c.quadraticCurveTo(ww * 1.35, -0.62, ww, wY); c.lineTo(hw, hipY + 0.012); c.lineTo(-hw, hipY + 0.012); c.lineTo(-ww, wY); c.quadraticCurveTo(-ww * 1.35, -0.62, -sw * 0.92, -0.705); c.closePath(); };
  torso(); paint(c, suit, [-sw, shY - 0.04, sw * 2, 0.36]);
  c.save(); torso(); c.clip();
  // pecs, ribs, centre seam and piping
  c.strokeStyle = 'rgba(0,0,0,.2)'; c.lineWidth = _lw * 1.3;
  [-1, 1].forEach(s => { c.beginPath(); c.arc(s * sw * 0.36, -0.728, sw * 0.36, Math.PI * 0.12, Math.PI * 0.88); c.stroke(); });
  c.strokeStyle = 'rgba(0,0,0,.14)'; c.lineWidth = _lw;
  if (look.build === 'bulky' || look.build === 'huge') [-0.655, -0.62, -0.588].forEach(y => { c.beginPath(); c.moveTo(-ww * 0.7, y); c.lineTo(ww * 0.7, y); c.stroke(); });
  line(c, 0, -0.745, 0, wY, 'rgba(0,0,0,.18)');
  c.globalAlpha = 0.85; [-1, 1].forEach(s => line(c, s * sw * 0.86, -0.725, s * ww * 1.08, wY + 0.01, acc, _lw * 1.6)); c.globalAlpha = 1;
  c.fillStyle = 'rgba(255,255,255,.12)'; c.beginPath(); c.ellipse(-sw * 0.4, -0.74, sw * 0.28, 0.035, 0, 0, 7); c.fill();
  c.restore();
  // collar V-trim
  c.beginPath(); c.moveTo(-0.052, shY - 0.042); c.lineTo(-0.02, shY + 0.012); c.lineTo(0.02, shY + 0.012); c.lineTo(0.052, shY - 0.042); c.strokeStyle = acc; c.lineWidth = _lw * 2.4; c.stroke();
  // belt, buckle, pouches
  c.beginPath(); rrect(c, -ww * 1.08, wY - 0.006, ww * 2.16, 0.032, 0.008); paint(c, accD, [-ww, wY, ww * 2, 0.03], { noShade: true });
  c.beginPath(); rrect(c, -0.018, wY - 0.008, 0.036, 0.036, 0.006); paint(c, shade(acc, 0.1), [-0.018, wY, 0.036, 0.036], { noShade: true });
  [-1, 1].forEach(s => { c.beginPath(); rrect(c, s * ww * 0.78 - 0.014, wY + 0.03, 0.028, 0.034, 0.005); paint(c, shade(suit2, -0.15), [s * ww * 0.78 - 0.014, wY + 0.03, 0.028, 0.034], { noShade: true }); });
  if (look.emblem && !lab) drawEmblem(c, look.emblem, 0, -0.712, B.sw * 0.27, acc, accD);
  if (lab) {
    [-1, 1].forEach(s => { c.beginPath(); c.moveTo(s * sw * 1.02, shY + 0.01); c.lineTo(s * 0.012, shY + 0.02); c.lineTo(s * 0.02, -0.19); c.lineTo(s * hw * 1.45, -0.19); c.lineTo(s * hw * 1.2, hipY - 0.04); c.closePath(); paint(c, s > 0 ? '#dfe4f8' : '#f4f6ff', [Math.min(0, s) * sw * 1.1, shY, sw * 1.1, 0.62]); });
    if (look.emblem) drawEmblem(c, look.emblem, 0, -0.7, B.sw * 0.2, acc, accD);
  }
  if (ex.includes('bandolier')) { c.beginPath(); c.moveTo(-sw * 0.9, shY + 0.01); c.lineTo(-sw * 0.5, shY + 0.01); c.lineTo(sw * 0.9, wY + 0.01); c.lineTo(sw * 0.5, wY + 0.01); c.closePath(); paint(c, '#5a3f1a', [-sw, shY, sw * 2, 0.26], { noShade: true }); for (let i = 0; i < 5; i++) { paint(c, '#ff9a3a', circP(c, -sw * 0.55 + i * sw * 0.3, shY + 0.045 + i * 0.045, 0.014), { noShade: true, flat: true }); } }
  if (ex.includes('scarf')) { c.beginPath(); rrect(c, -sw * 0.5, shY - 0.05, sw, 0.055, 0.02); paint(c, acc, [-sw * 0.5, shY - 0.05, sw, 0.055]); paint(c, acc, polyP(c, [[-sw * 0.2, shY], [-sw * 0.7 - Math.sin(t * 3) * 0.04, shY + 0.13], [-sw * 0.58, shY + 0.17], [-sw * 0.05, shY + 0.03]])); }
  if (ex.includes('speaker')) { c.beginPath(); rrect(c, -sw * 1.2, shY - 0.03, 0.12, 0.1, 0.02); paint(c, '#262633', [-sw * 1.2, shY - 0.03, 0.12, 0.1]); paint(c, '#555', circP(c, -sw * 1.2 + 0.06, shY + 0.02, 0.028), { noShade: true }); }

  /* ---- arms ---- */
  const hands = {};
  const arm = (side, ang, bend) => {
    const sx = side * sw * 0.9, sy = shY + 0.022, La = 0.176, Lf = 0.166, w0 = B.aw * 1.28, w1 = B.aw * 1.0, w2 = B.aw * 0.78;
    const ex_ = sx + Math.sin(ang) * La, ey_ = sy + Math.cos(ang) * La, a2 = ang + bend, wx = ex_ + Math.sin(a2) * Lf, wy = ey_ + Math.cos(a2) * Lf;
    paint(c, sleeve, taperP(c, sx, sy, ex_, ey_, w0, w1));
    c.save(); c.globalAlpha = 0.2; c.fillStyle = '#fff'; c.beginPath(); c.ellipse((sx + ex_) / 2 - side * w0 * 0.12, (sy + ey_) / 2, w0 * 0.12, La * 0.3, ang * -1, 0, 7); c.fill(); c.restore();   // bicep sheen
    paint(c, lab ? skinD : shade(sleeve, -0.04), taperP(c, ex_, ey_, wx, wy, w1, w2));
    // bracer + glove
    const bx = lerp(ex_, wx, 0.55), by = lerp(ey_, wy, 0.55); paint(c, acc, taperP(c, bx, by, wx, wy, w2 * 1.12, w2 * 1.04), { noShade: true });
    paint(c, gaunt ? acc : shade(acc, -0.15), circP(c, wx, wy + 0.004, gaunt ? w2 * 1.2 : w2 * 0.86));
    if (gaunt) { line(c, wx - w2 * 0.6, wy + 0.01, wx + w2 * 0.6, wy + 0.01, 'rgba(0,0,0,.35)'); }
    // shoulder pad
    paint(c, shade(suit, -0.08), ellP(c, sx + side * w0 * 0.08, sy - w0 * 0.12, w0 * 0.66, w0 * 0.5)); c.save(); c.globalAlpha = 0.28; c.fillStyle = '#fff'; c.beginPath(); c.ellipse(sx - side * w0 * 0.1, sy - w0 * 0.3, w0 * 0.28, w0 * 0.12, 0, 0, 7); c.fill(); c.restore();
    return { x: wx, y: wy, ang: a2 };
  };
  hands.b = arm(-1, aB, bB); hands.f = arm(1, aF, bF);

  /* ---- neck + head ---- */
  const hr = B.hr, hcx = 0, hcy = shY - 0.044 - hr * 0.92;
  c.beginPath(); rrect(c, -0.026, shY - 0.06, 0.052, 0.05, 0.012); paint(c, skinD, [-0.026, shY - 0.06, 0.052, 0.05], { noShade: true });
  const hs = look.hair ? look.hair.s : 'bald', hc = look.hair ? look.hair.c : '#222', bala = look.mask && look.mask.t === 'balaclava';
  if (hs === 'afro' || hs === 'bob' || hs === 'hood') drawHair(c, hs, hs === 'hood' ? suit2 : hc, hcx, hcy, hr, true);
  drawHeadgear(c, look, hcx, hcy, hr, 'under');
  if (!bala) {
    [-1, 1].forEach(s => paint(c, skinD, circP(c, s * hr * 0.96, hcy + hr * 0.12, hr * 0.2), { noShade: true }));
    ellP(c, hcx, hcy, hr * 0.97, hr * 1.06); paint(c, skin, [hcx - hr, hcy - hr * 1.06, hr * 2, hr * 2.12]);
    c.save(); ellP(c, hcx, hcy, hr * 0.97, hr * 1.06); c.clip(); c.fillStyle = 'rgba(120,40,20,.14)'; c.beginPath(); c.ellipse(hcx, hcy + hr * 1.0, hr * 0.85, hr * 0.45, 0, 0, 7); c.fill(); c.restore();   // jaw shade
  }
  const small = o.s * o.size < 70;
  if (bala) { drawHeadgear(c, look, hcx, hcy, hr, 'over'); } else { drawFace(c, hcx, hcy, hr, o.expr, small, look); drawHeadgear(c, look, hcx, hcy, hr, 'over'); }
  if (hs !== 'afro' && hs !== 'bob' && hs !== 'hood') drawHair(c, hs, hc, hcx, hcy, hr);
  else if (hs === 'afro') drawHair(c, 'short', hc, hcx, hcy, hr);
  else if (hs === 'bob') { c.beginPath(); c.arc(hcx, hcy - hr * 0.05, hr * 1.1, Math.PI, Math.PI * 2); c.quadraticCurveTo(hcx, hcy - hr * 0.55, hcx - hr * 1.0, hcy + hr * 0.1); c.closePath(); paint(c, hc, [hcx - hr, hcy - hr * 1.1, hr * 2, hr]); }
  if (ex.includes('mustache')) { c.beginPath(); c.moveTo(hcx - hr * 0.58, hcy + hr * 0.42); c.quadraticCurveTo(hcx, hcy + hr * 0.2, hcx + hr * 0.58, hcy + hr * 0.42); c.quadraticCurveTo(hcx, hcy + hr * 0.58, hcx - hr * 0.58, hcy + hr * 0.42); paint(c, shade(hc === '#222' ? '#3a3a3a' : hc, -0.2), [hcx - hr * 0.6, hcy + hr * 0.2, hr * 1.2, hr * 0.4], { noShade: true }); }
  if (ex.includes('glasses')) { [-1, 1].forEach(s => { c.beginPath(); rrect(c, hcx + s * hr * 0.4 - hr * 0.32, hcy - hr * 0.22, hr * 0.64, hr * 0.46, hr * 0.12); c.fillStyle = 'rgba(190,230,255,.22)'; c.fill(); c.lineWidth = _lw * 1.3; c.strokeStyle = '#1b1f33'; c.stroke(); }); line(c, hcx - hr * 0.1, hcy - hr * 0.02, hcx + hr * 0.1, hcy - hr * 0.02, '#1b1f33', _lw * 1.3); }
  if (ex.includes('hardhat')) { c.beginPath(); c.arc(hcx, hcy - hr * 0.12, hr * 1.14, Math.PI, Math.PI * 2); c.closePath(); paint(c, '#ffd23f', [hcx - hr * 1.14, hcy - hr * 1.3, hr * 2.28, hr * 1.2]); c.beginPath(); rrect(c, hcx - hr * 1.26, hcy - hr * 0.2, hr * 2.52, hr * 0.22, hr * 0.1); paint(c, '#e0b020', [hcx - hr * 1.26, hcy - hr * 0.2, hr * 2.52, hr * 0.22]); c.beginPath(); rrect(c, hcx - hr * 0.13, hcy - hr * 1.3, hr * 0.26, hr * 0.55, hr * 0.06); paint(c, '#f0c230', [hcx - hr * 0.13, hcy - hr * 1.3, hr * 0.26, hr * 0.55], { noShade: true }); paint(c, '#2a2a33', polyP(c, [[hcx - hr * 0.2, hcy - hr * 0.55], [hcx + hr * 0.2, hcy - hr * 0.55], [hcx, hcy - hr * 0.35]]), { noShade: true, flat: true }); }
  if (ex.includes('crown')) paint(c, acc, polyP(c, [[hcx - hr * 0.95, hcy - hr * 0.85], [hcx - hr * 0.85, hcy - hr * 1.8], [hcx - hr * 0.35, hcy - hr * 1.2], [hcx, hcy - hr * 2.0], [hcx + hr * 0.35, hcy - hr * 1.2], [hcx + hr * 0.85, hcy - hr * 1.8], [hcx + hr * 0.95, hcy - hr * 0.85]]));
  if (ex.includes('headset')) { c.beginPath(); c.arc(hcx, hcy - hr * 0.1, hr * 1.12, Math.PI * 1.05, Math.PI * 1.95); c.lineWidth = _lw * 3; c.strokeStyle = '#2a2a33'; c.stroke(); paint(c, '#33333f', circP(c, hcx - hr * 1.02, hcy + hr * 0.1, hr * 0.3)); c.beginPath(); c.moveTo(hcx - hr * 1.0, hcy + hr * 0.38); c.quadraticCurveTo(hcx - hr * 0.6, hcy + hr * 1.0, hcx - hr * 0.1, hcy + hr * 0.78); c.lineWidth = _lw * 1.8; c.stroke(); paint(c, '#33333f', circP(c, hcx - hr * 0.1, hcy + hr * 0.78, hr * 0.12), { noShade: true }); }
  /* ---- held props at the front hand ---- */
  const hf = hands.f;
  if (ex.includes('bat')) { c.save(); c.translate(hf.x, hf.y); c.rotate(-0.5 - aF * 0.4); c.beginPath(); rrect(c, -0.018, -0.3, 0.036, 0.34, 0.016); paint(c, '#c98a4a', [-0.018, -0.3, 0.036, 0.34]); line(c, -0.012, -0.26, 0.012, -0.26, 'rgba(0,0,0,.3)'); c.restore(); }
  if (ex.includes('gun')) { c.beginPath(); rrect(c, hf.x - 0.02, hf.y - 0.045, 0.19, 0.05, 0.012); paint(c, '#2a2d38', [hf.x - 0.02, hf.y - 0.045, 0.19, 0.05]); c.beginPath(); rrect(c, hf.x - 0.01, hf.y - 0.005, 0.035, 0.06, 0.008); paint(c, '#1b1d26', [hf.x, hf.y, 0.035, 0.06], { noShade: true }); }
  if (ex.includes('cone')) { paint(c, '#e8b46a', polyP(c, [[hf.x - 0.04, hf.y - 0.02], [hf.x + 0.04, hf.y - 0.02], [hf.x, hf.y + 0.14]])); paint(c, '#ff8ad8', circP(c, hf.x, hf.y - 0.05, 0.052)); paint(c, '#7ee8ff', circP(c, hf.x, hf.y - 0.103, 0.036)); }
  if (ex.includes('shield')) { c.save(); c.globalAlpha *= 0.9; c.beginPath(); c.ellipse(hf.x + 0.085, hf.y - 0.03, 0.085, 0.17, 0, 0, Math.PI * 2); const g = c.createLinearGradient(hf.x, hf.y - 0.2, hf.x + 0.17, hf.y + 0.14); g.addColorStop(0, 'rgba(160,255,230,.75)'); g.addColorStop(1, 'rgba(60,190,170,.55)'); c.fillStyle = g; c.fill(); c.strokeStyle = 'rgba(220,255,245,.9)'; c.lineWidth = _lw * 1.5; c.stroke(); c.restore(); }
  c.restore();
}
function ellipse2(c, x, y, rx, ry) { c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); }

/* ---------- creatures and machines (same flat style) ---------- */
function drawDrone(c, look, o) {
  const t = o.t, hov = -0.45 + Math.sin(t * 3.1) * 0.03, col = look.suit || '#8a95b8', acc = look.accent || '#ff4d4d';
  if (o.pose === 'attack') c.translate(Math.sin(o.pa * Math.PI) * 0.1, 0);
  if (o.pose === 'hurt') c.translate(-Math.sin(o.pa * Math.PI * 6) * 0.03, 0);
  c.save(); c.translate(0, hov);
  // rotor arms
  [-1, 1].forEach(s => { line(c, s * 0.1, -0.1, s * 0.2, -0.16, shade(col, -0.4), _lw * 3); const w = Math.sin(t * 40 + s) * 0.04 + 0.13; c.beginPath(); c.ellipse(s * 0.2, -0.17, w, 0.016, 0, 0, Math.PI * 2); c.fillStyle = 'rgba(210,228,255,.75)'; c.fill(); });
  // body: sphere + belt plate + lens
  const g = c.createRadialGradient(-0.05, -0.06, 0.02, 0, 0, 0.19); g.addColorStop(0, shade(col, 0.3)); g.addColorStop(1, shade(col, -0.25));
  c.beginPath(); c.arc(0, 0, 0.17, 0, Math.PI * 2); c.fillStyle = g; c.fill(); c.lineWidth = _lw; c.strokeStyle = EDGE; c.stroke();
  c.save(); c.beginPath(); c.arc(0, 0, 0.17, 0, Math.PI * 2); c.clip(); c.fillStyle = shade(col, -0.45); c.fillRect(-0.2, 0.05, 0.4, 0.04); c.fillStyle = 'rgba(8,10,44,.22)'; c.fillRect(_face > 0 ? 0.06 : -0.2, -0.2, 0.14, 0.4); c.restore();
  paint(c, '#1b1f33', circP(c, 0.02, -0.015, 0.085), { noShade: true }); paint(c, acc, circP(c, 0.035, -0.015, 0.05), { noShade: true, flat: true }); c.beginPath(); c.arc(0.05, -0.03, 0.014, 0, 7); c.fillStyle = '#fff'; c.fill();
  line(c, 0, -0.17, 0, -0.27, shade(col, -0.4), _lw * 2); paint(c, acc, circP(c, 0, -0.28, 0.025), { noShade: true, flat: true });
  [-1, 1].forEach(s => paint(c, shade(col, -0.3), polyP(c, [[s * 0.07, 0.15], [s * 0.1, 0.24], [s * 0.04, 0.17]]), { noShade: true }));
  c.restore();
}
function drawGator(c, look, o) {
  const col = look.suit || '#4c9a46', belly = look.accent || '#e8e0a0', k = look.small ? 0.62 : 1, pa = o.pa, sw = Math.sin(o.t * 2) * 0.02;
  c.scale(k, k);
  c.translate(o.pose === 'attack' ? Math.sin(pa * Math.PI) * 0.14 : 0, o.pose === 'hurt' ? Math.sin(pa * 40) * 0.01 : 0);
  // tail
  c.beginPath(); c.moveTo(-0.2, -0.2); c.quadraticCurveTo(-0.45, -0.24 + sw * 3, -0.66, -0.07 + sw * 5); c.quadraticCurveTo(-0.45, -0.1, -0.2, -0.06); c.closePath(); paint(c, col, [-0.66, -0.25, 0.46, 0.2]);
  // legs
  [-0.14, 0.17].forEach(x => { c.beginPath(); rrect(c, x - 0.045, -0.13, 0.09, 0.13, 0.035); paint(c, shade(col, -0.18), [x - 0.045, -0.13, 0.09, 0.13]); [-0.02, 0.01, 0.035].forEach(d => line(c, x + d, -0.02, x + d, 0, 'rgba(255,240,200,.6)', _lw * 2)); });
  // body with scute spikes, belly, scale pattern
  ellP(c, 0, -0.2, 0.3, 0.14); paint(c, col, [-0.3, -0.34, 0.6, 0.28]);
  c.save(); ellP(c, 0, -0.2, 0.3, 0.14); c.clip(); c.fillStyle = belly; c.beginPath(); c.ellipse(0.02, -0.1, 0.24, 0.06, 0, 0, 7); c.fill(); c.strokeStyle = 'rgba(0,0,0,.18)'; c.lineWidth = _lw; for (let i = -5; i <= 5; i++) { c.beginPath(); c.arc(i * 0.05, -0.24, 0.026, 0, Math.PI); c.stroke(); c.beginPath(); c.arc(i * 0.05 + 0.025, -0.2, 0.026, 0, Math.PI); c.stroke(); } c.restore();
  for (let i = -2; i <= 2; i++) paint(c, shade(col, -0.28), polyP(c, [[i * 0.1 - 0.035, -0.33], [i * 0.1, -0.4], [i * 0.1 + 0.035, -0.33]]), { noShade: true });
  // head + jaw + teeth
  const jaw = o.pose === 'attack' ? Math.sin(pa * Math.PI) * 0.09 : 0.015 + Math.abs(Math.sin(o.t * 1.5)) * 0.01;
  paint(c, shade(col, -0.1), polyP(c, [[0.22, -0.16 + jaw], [0.57, -0.2 + jaw], [0.55, -0.12 + jaw], [0.24, -0.08 + jaw]]));
  for (let i = 0; i < 5; i++) paint(c, '#fffbe8', polyP(c, [[0.3 + i * 0.055, -0.2 + jaw * 0.4], [0.325 + i * 0.055, -0.14 + jaw * 0.6], [0.35 + i * 0.055, -0.2 + jaw * 0.4]]), { noShade: true, flat: true, noEdge: true });
  paint(c, col, polyP(c, [[0.2, -0.33], [0.58, -0.27], [0.57, -0.19], [0.22, -0.16]]));
  paint(c, '#ffe27a', circP(c, 0.31, -0.32, 0.042), { noShade: true, flat: true }); c.beginPath(); c.ellipse(0.318, -0.32, 0.012, 0.03, 0, 0, 7); c.fillStyle = '#0b0d1c'; c.fill();
  paint(c, shade(col, -0.35), circP(c, 0.55, -0.26, 0.012), { noShade: true, noEdge: true, flat: true });
}
function drawMech(c, look, o) {
  const col = look.suit || '#c4492b', acc = look.accent || '#ffd23f', pa = o.pa, t = o.t;
  c.translate((o.pose === 'attack' ? Math.sin(pa * Math.PI) * 0.1 : 0) + (o.pose === 'hurt' ? Math.sin(pa * 30) * 0.02 : 0), -Math.abs(Math.sin(t * 1.6)) * 0.01);
  const P = (box, f, o2) => paint(c, f, box, o2);
  // legs: pistons + feet
  [-1, 1].forEach(s => { c.beginPath(); rrect(c, s * 0.12 - 0.075, -0.4, 0.15, 0.34, 0.03); P([s * 0.12 - 0.075, -0.4, 0.15, 0.34], shade(col, s < 0 ? -0.35 : -0.22)); line(c, s * 0.12 - 0.05, -0.3, s * 0.12 + 0.05, -0.3, 'rgba(0,0,0,.35)', _lw * 2); c.beginPath(); rrect(c, s * 0.12 - 0.1, -0.07, 0.2, 0.07, 0.025); P([s * 0.12 - 0.1, -0.07, 0.2, 0.07], '#3b4258'); });
  c.beginPath(); rrect(c, -0.26, -0.44, 0.52, 0.09, 0.03); P([-0.26, -0.44, 0.52, 0.09], '#444a5e');
  // torso
  c.beginPath(); rrect(c, -0.31, -0.86, 0.62, 0.48, 0.07); P([-0.31, -0.86, 0.62, 0.48], col);
  c.beginPath(); rrect(c, -0.2, -0.78, 0.4, 0.22, 0.05); P([-0.2, -0.78, 0.4, 0.22], '#1c2a44'); c.save(); c.globalAlpha = 0.35; c.fillStyle = '#7ee8ff'; c.fillRect(-0.17, -0.75, 0.2, 0.05); c.restore();
  paint(c, acc, circP(c, 0.06, -0.67, 0.045), { noShade: true, flat: true });
  [-0.27, 0.27].forEach(x => { c.beginPath(); rrect(c, x - 0.018, -0.84, 0.036, 0.4, 0.01); P([x - 0.018, -0.84, 0.036, 0.4], shade(col, -0.25), { noShade: true }); });
  P(polyP(c, [[-0.3, -0.5], [-0.1, -0.5], [-0.2, -0.4]]), acc, { noShade: true, flat: true });
  for (let i = 0; i < 4; i++) line(c, -0.22 + i * 0.04, -0.44, -0.2 + i * 0.04, -0.4, 'rgba(0,0,0,.35)');
  // arms
  const fa = o.pose === 'attack' ? 1.5 : 0.2 + Math.sin(t * 2) * 0.05;
  const marm = (side, ang) => { const sx = side * 0.32, sy = -0.76, ex = sx + Math.sin(ang) * 0.2, ey = sy + Math.cos(ang) * 0.2, wx = ex + Math.sin(ang) * 0.17, wy = ey + Math.cos(ang) * 0.17; P(taperP(c, sx, sy, ex, ey, 0.13, 0.11), shade(col, side > 0 ? -0.05 : -0.25)); P(taperP(c, ex, ey, wx, wy, 0.11, 0.1), shade(col, -0.12)); P(circP(c, wx, wy + 0.01, 0.1), '#9aa3bb'); P(circP(c, sx, sy, 0.085), shade(col, 0.05)); };
  marm(-1, -0.2); marm(1, fa);
  // head
  c.beginPath(); rrect(c, -0.14, -0.99, 0.28, 0.15, 0.06); P([-0.14, -0.99, 0.28, 0.15], shade(col, 0.12)); paint(c, '#ff4d4d', circP(c, 0.04, -0.915, 0.04), { noShade: true, flat: true }); c.beginPath(); c.arc(0.05, -0.925, 0.012, 0, 7); c.fillStyle = '#fff'; c.fill();
  line(c, -0.1, -0.99, -0.1, -1.08, shade(col, -0.4), _lw * 2); paint(c, acc, circP(c, -0.1, -1.1, 0.026), { noShade: true, flat: true });
}

/* ---------- arena props (flat style) ---------- */
function drawProp(c, type, x, y, s, t, hpf, variant) {
  c.save(); c.translate(x, y); c.scale(s, s); c.lineJoin = 'round'; c.lineCap = 'round'; c.strokeStyle = EDGE; _lw = Math.max(0.012, 1.2 / s); c.lineWidth = _lw; _face = 1;
  const sh = c.createRadialGradient(0, 0.01, 0.02, 0, 0.01, 0.42); sh.addColorStop(0, 'rgba(0,0,0,.4)'); sh.addColorStop(1, 'rgba(0,0,0,0)'); c.save(); c.scale(1, 0.22); c.fillStyle = sh; c.beginPath(); c.arc(0, 0.04, 0.42, 0, 7); c.fill(); c.restore();
  const R = (x0, y0, w, h, r, fill, o) => { c.beginPath(); rrect(c, x0, y0, w, h, r); paint(c, fill, [x0, y0, w, h], o); };
  switch (type) {
    case 'car': { const body = variant || '#c9453c'; R(-0.48, -0.32, 0.96, 0.22, 0.07, body); c.beginPath(); c.moveTo(-0.28, -0.32); c.lineTo(-0.2, -0.5); c.lineTo(0.2, -0.5); c.lineTo(0.3, -0.32); c.closePath(); paint(c, shade(body, 0.08), [-0.3, -0.5, 0.6, 0.18]);
      c.beginPath(); c.moveTo(-0.24, -0.34); c.lineTo(-0.18, -0.46); c.lineTo(-0.01, -0.46); c.lineTo(-0.01, -0.34); c.closePath(); paint(c, '#a9d6f2', [-0.24, -0.46, 0.23, 0.12], { noShade: true }); c.beginPath(); c.moveTo(0.02, -0.34); c.lineTo(0.02, -0.46); c.lineTo(0.17, -0.46); c.lineTo(0.25, -0.34); c.closePath(); paint(c, '#a9d6f2', [0.02, -0.46, 0.23, 0.12], { noShade: true });
      R(0.42, -0.26, 0.07, 0.05, 0.02, '#ffe58a', { noShade: true }); R(-0.5, -0.26, 0.06, 0.05, 0.02, '#ff5a5a', { noShade: true }); line(c, -0.46, -0.2, 0.46, -0.2, 'rgba(0,0,0,.25)');
      [-0.28, 0.28].forEach(wx => { paint(c, '#1b1d26', circP(c, wx, -0.09, 0.095)); paint(c, '#9aa3bb', circP(c, wx, -0.09, 0.045), { noShade: true }); }); break; }
    case 'crate': R(-0.3, -0.52, 0.6, 0.52, 0.03, '#b88950'); c.save(); c.beginPath(); rrect(c, -0.3, -0.52, 0.6, 0.52, 0.03); c.clip(); line(c, -0.3, -0.52, 0.3, 0, 'rgba(90,50,15,.55)', _lw * 2); line(c, 0.3, -0.52, -0.3, 0, 'rgba(90,50,15,.55)', _lw * 2); line(c, -0.3, -0.26, 0.3, -0.26, 'rgba(90,50,15,.45)', _lw * 1.5); c.restore(); R(-0.3, -0.52, 0.6, 0.06, 0.02, '#d9a76a', { noShade: true }); break;
    case 'barrel': { const pulse = 0.5 + 0.5 * Math.sin(t * 6); R(-0.2, -0.52, 0.4, 0.52, 0.1, '#d83a2e'); c.fillStyle = '#ffd23f'; c.save(); c.beginPath(); rrect(c, -0.2, -0.52, 0.4, 0.52, 0.1); c.clip(); c.fillRect(-0.2, -0.36, 0.4, 0.09); c.fillRect(-0.2, -0.16, 0.4, 0.09); c.restore(); paint(c, '#1b1d26', polyP(c, [[0, -0.28], [-0.06, -0.2], [0.06, -0.2]]), { noShade: true, flat: true }); c.save(); c.globalAlpha = 0.18 * pulse; c.fillStyle = '#ffe27a'; c.beginPath(); c.arc(0, -0.26, 0.34, 0, 7); c.fill(); c.restore(); break; }
    case 'pillar': R(-0.2, -0.8, 0.4, 0.8, 0.03, '#8f97ad'); R(-0.27, -0.86, 0.54, 0.1, 0.03, '#aab2c8'); R(-0.27, -0.08, 0.54, 0.1, 0.03, '#aab2c8'); line(c, -0.06, -0.7, -0.06, -0.16, 'rgba(255,255,255,.18)', _lw * 2); break;
    case 'planter': R(-0.3, -0.26, 0.6, 0.26, 0.05, '#7a5a3a'); paint(c, '#3f9a4a', circP(c, -0.12, -0.34, 0.16)); paint(c, '#4cb056', circP(c, 0.12, -0.37, 0.18)); break;
    default: break;
  }
  if (hpf != null && hpf < 1 && type !== 'pillar') { c.fillStyle = 'rgba(0,0,0,.5)'; c.fillRect(-0.2, 0.07, 0.4, 0.05); c.fillStyle = '#ffd23f'; c.fillRect(-0.2, 0.07, 0.4 * hpf, 0.05); }
  c.restore();
}
