/* =====================================================================
   20-art: icons, procedural character renderer, portraits, props, map
   ===================================================================== */

/* ---------- icons (24x24) ---------- */
const ICON_PATHS = {
  combat: '<path d="M12 1.5l2.4 6 6.1-2.4-2.4 6.1 6 2.4-6.2 1.9 1.7 6.3-5.6-3.6-5.6 3.6 1.7-6.3L1.5 13.6l6-2.4-2.4-6.1 6.1 2.4z"/>',
  vigor: '<path d="M12 2l8.5 3v6.2c0 5.2-3.5 9.2-8.5 10.8-5-1.6-8.5-5.6-8.5-10.8V5z"/>',
  mobility: '<path d="M3 5l8 7-8 7M12 5l8 7-8 7" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>',
  charisma: '<path d="M4 3.5h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-6.5L8 21v-4.5H4a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2z"/>',
  intellect: '<path d="M12 2a7 7 0 0 0-4 12.8V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.2A7 7 0 0 0 12 2z"/><rect x="8.8" y="19.4" width="6.4" height="2.6" rx="1.2"/>',
  flight: '<path d="M2.5 11.2L21.5 3l-5.6 18-3.4-7.6z"/>',
  brute: '<path d="M1.5 9h3v6h-3zM19.5 9h3v6h-3zM4.5 7h3.5v10H4.5zM16 7h3.5v10H16zM8 11h8v2H8z"/>',
  tech: '<rect x="6.5" y="6.5" width="11" height="11" rx="2"/><path d="M9.5 2.5v4M14.5 2.5v4M9.5 17.5v4M14.5 17.5v4M2.5 9.5h4M2.5 14.5h4M17.5 9.5h4M17.5 14.5h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  stealth: '<path d="M20 14.6A8.6 8.6 0 1 1 9.4 4a7.1 7.1 0 0 0 10.6 10.6z"/>',
  elemental: '<path d="M12.5 1.8c.8 4.2 6.2 6.1 6.2 12a6.7 6.7 0 0 1-13.4 0c0-3.2 1.8-4.7 3.2-6.7.7 1.9 1.7 2.5 2.6 1.9 1.5-1 1-4.4 1.4-7.2z"/>',
  psychic: '<circle cx="12" cy="12" r="3.3"/><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  medic: '<path d="M9 2.5h6v6.5h6.5v6H15v6.5H9V15H2.5V9H9z"/>',
  charm: '<path d="M12 1.5l2.5 8 8 2.5-8 2.5-2.5 8-2.5-8-8-2.5 8-2.5z"/>',
  rescue: '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="3.4"/><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="3.4"/>',
  crime: '<path d="M12 2.5l8 3.5v5.5c0 4.7-3.2 8.3-8 10-4.8-1.7-8-5.3-8-10V6z"/><path d="M8.5 11.5l2.5 2.5 4.5-5" fill="none" stroke="#0c0e1d" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  disaster: '<path d="M12 2.5l10 18H2z"/><path d="M12 9v5.5M12 16.8v1.5" stroke="#0c0e1d" stroke-width="2.4" stroke-linecap="round"/>',
  social: '<path d="M4 3.5h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-6.5L8 21v-4.5H4a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2z"/>',
  chase: '<path d="M3 5l8 7-8 7M12 5l8 7-8 7" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>',
  fight: '<path d="M12 1.5l2.4 6 6.1-2.4-2.4 6.1 6 2.4-6.2 1.9 1.7 6.3-5.6-3.6-5.6 3.6 1.7-6.3L1.5 13.6l6-2.4-2.4-6.1 6.1 2.4z"/>',
  radio: '<rect x="3" y="8" width="18" height="12" rx="2.4"/><path d="M7 8l9-5.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="9" cy="14" r="2.6" fill="#0c0e1d"/><path d="M14.5 12.2h4M14.5 15.8h4" stroke="#0c0e1d" stroke-width="1.8" stroke-linecap="round"/>',
  cross: '<path d="M9 2.5h6v6.5h6.5v6H15v6.5H9V15H2.5V9H9z"/>',
  dumbbell: '<path d="M1.5 9h3v6h-3zM19.5 9h3v6h-3zM4.5 7h3.5v10H4.5zM16 7h3.5v10H16zM8 11h8v2H8z"/>',
  coffee: '<path d="M3.5 8h13v7a5 5 0 0 1-5 5h-3a5 5 0 0 1-5-5z"/><path d="M16.5 10h2.2a2.3 2.3 0 0 1 0 4.6h-2.2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 2.5c-1 1.3 1 2 0 3.5M12 2.5c-1 1.3 1 2 0 3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  car: '<path d="M2.5 14l2-5.5A2.5 2.5 0 0 1 6.9 7h10.2a2.5 2.5 0 0 1 2.4 1.5l2 5.5v4.5h-3v-2H5.5v2h-3z"/><circle cx="7" cy="15" r="1.7" fill="#0c0e1d"/><circle cx="17" cy="15" r="1.7" fill="#0c0e1d"/>',
  clock: '<circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M12 6.5V12l4 2.4" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>',
  coin: '<circle cx="12" cy="12" r="9.5"/><path d="M12 6v12M9 9.2c0-1.4 1.4-2 3-2s3 .7 3 2.2c0 3-6 1.6-6 4.6 0 1.4 1.4 2.2 3 2.2s3-.8 3-2.2" fill="none" stroke="#0c0e1d" stroke-width="1.9" stroke-linecap="round"/>',
  star: '<path d="M12 2l2.9 6.4 7 .7-5.3 4.7 1.6 6.9L12 17l-6.2 3.7 1.6-6.9L2.1 9.1l7-.7z"/>',
  starO: '<path d="M12 3.2l2.5 5.6 6.1.6-4.6 4.1 1.4 6L12 16.5l-5.4 3 1.4-6-4.6-4.1 6.1-.6z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  lock: '<rect x="4.5" y="10.5" width="15" height="11" rx="2.2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2.4"/>',
  check: '<path d="M4 12.5l5 5 11-12" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>',
  x: '<path d="M5 5l14 14M19 5L5 19" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/>',
  pause: '<rect x="5.5" y="4" width="4.5" height="16" rx="1"/><rect x="14" y="4" width="4.5" height="16" rx="1"/>',
  play: '<path d="M6 3.5v17l14-8.5z"/>',
  fast: '<path d="M3 4v16l9-8zM12 4v16l9-8z"/>',
  fast3: '<path d="M2 4v16l7-8zM9 4v16l7-8zM16 4v16l6-8z"/>',
  gear: '<path d="M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6zM10.3 2h3.4l.6 2.6 1.9.8 2.3-1.4 2.4 2.4-1.4 2.3.8 1.9L22 11v3.4l-2.6.6-.8 1.9 1.4 2.3-2.4 2.4-2.3-1.4-1.9.8-.6 2.6h-3.4l-.6-2.6-1.9-.8-2.3 1.4-2.4-2.4 1.4-2.3-.8-1.9L2 14.4V11l2.6-.6.8-1.9L4 6.2l2.4-2.4 2.3 1.4 1.9-.8z" fill-rule="evenodd"/>',
  help: '<circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M9.2 9.3a2.9 2.9 0 1 1 4.3 2.5c-1 .6-1.5 1.1-1.5 2.4M12 17.2v.6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  arrow: '<path d="M4 12h15M13 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>',
  pin: '<path d="M12 22s7-6.8 7-12.2A7 7 0 0 0 5 9.8C5 15.2 12 22 12 22z"/><circle cx="12" cy="9.8" r="2.6" fill="#0c0e1d"/>',
  bolt: '<path d="M13.5 1.5L4 13.5h6.5l-1.5 9 9.5-12.5H12z"/>',
  heart: '<path d="M12 21s-9-5.8-9-12a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 6.2-9 12-9 12z"/>',
  skull: '<path d="M12 2a8.5 8.5 0 0 0-5.5 15v3.5h3V19h1v1.5h3V19h1v1.5h3V17A8.5 8.5 0 0 0 12 2z"/><circle cx="8.8" cy="11.5" r="2.2" fill="#0c0e1d"/><circle cx="15.2" cy="11.5" r="2.2" fill="#0c0e1d"/>',
  flag: '<path d="M5 2.5v19M5 4h13l-2.5 4.2L18 12.5H5" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  swap: '<path d="M4 8h14M14 4l4 4-4 4M20 16H6M10 12l-4 4 4 4" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
  sword: '<path d="M4 20l9-9M13 11l7-7v5l-7 7zM6 15l3 3M3.5 20.5l2-2" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
  mic: '<rect x="8.5" y="2.5" width="7" height="12" rx="3.5"/><path d="M5 11.5a7 7 0 0 0 14 0M12 18.5V22" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/>',
  users: '<circle cx="9" cy="8" r="3.6"/><path d="M2 21a7 7 0 0 1 14 0z"/><circle cx="17.5" cy="9" r="2.8"/><path d="M16.5 14.2A6 6 0 0 1 22 21h-4.2" opacity=".8"/>',
  map: '<path d="M2.5 5.5l6-2.5 7 2.5 6-2.5v15l-6 2.5-7-2.5-6 2.5zM8.5 3v15M15.5 5.5v15" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/><circle cx="3.5" cy="6" r="1.6"/><circle cx="3.5" cy="12" r="1.6"/><circle cx="3.5" cy="18" r="1.6"/>',
  eject: '<path d="M12 4l9 10H3zM4 17.5h16v3H4z"/>',
  turn: '<path d="M20 12a8 8 0 1 1-2.4-5.7M20 3.5v5h-5" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>',
  shield2: '<path d="M12 2l8.5 3v6.2c0 5.2-3.5 9.2-8.5 10.8-5-1.6-8.5-5.6-8.5-10.8V5z"/>',
  boot: '<path d="M7 3h6v8l6 3.5V19H5V3z"/>',
};
function icon(name, size) {
  const s = document.createElement('span'); s.className = 'ico ico-' + name;
  s.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">' + (ICON_PATHS[name] || '') + '</svg>';
  if (size) { s.style.width = s.style.height = size + 'px'; }
  return s;
}
const iconHTML = (name, size) => '<span class="ico ico-' + name + '"' + (size ? ' style="width:' + size + 'px;height:' + size + 'px"' : '') + '><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">' + (ICON_PATHS[name] || '') + '</svg></span>';

/* =====================================================================
   FIGURE RENDERER — unit height = 1.0, feet at (0,0), head near y = -0.8
   ===================================================================== */
const INK = '#0b0d1c';
let _face = 1;
function rrect(c, x, y, w, h, r) {
  r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
  c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
  c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
}
function shadeFill(c, x, y, w, h) {
  c.save(); c.clip();
  c.fillStyle = 'rgba(8,10,34,.27)';
  if (_face > 0) c.fillRect(x + w * 0.62, y - 1, w, h + 2); else c.fillRect(x - w, y - 1, w * 1.38, h + 2);
  c.fillStyle = 'rgba(255,255,255,.15)';
  if (_face > 0) c.fillRect(x, y, w * 0.18, h); else c.fillRect(x + w * 0.82, y, w * 0.18, h);
  c.restore();
}
function blob(c, x, y, w, h, r, fill, noShade) {
  c.beginPath(); rrect(c, x, y, w, h, r); c.fillStyle = fill; c.fill();
  if (!noShade) { c.beginPath(); rrect(c, x, y, w, h, r); shadeFill(c, x, y, w, h); }
  c.beginPath(); rrect(c, x, y, w, h, r); c.stroke();
}
function circ(c, x, y, r, fill, stroke = true) {
  c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fillStyle = fill; c.fill(); if (stroke) c.stroke();
}
function poly(c, pts, fill, stroke = true, close = true) {
  c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); if (close) c.closePath();
  if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) c.stroke();
}
function limb(c, sx, sy, ang, len, wid, fill, hand, handR) {
  c.save(); c.translate(sx, sy); c.rotate(-ang);   // local space: +angle swings the arm forward
  blob(c, -wid / 2, -wid * 0.3, wid, len + wid * 0.3, wid / 2, fill);
  if (hand) circ(c, 0, len + wid * 0.1, handR || wid * 0.62, hand);
  c.restore();
}
const BUILD = {
  slim: { tw: 0.22, lw: 0.075, aw: 0.058, hr: 0.122 }, normal: { tw: 0.27, lw: 0.092, aw: 0.07, hr: 0.126 },
  bulky: { tw: 0.35, lw: 0.12, aw: 0.092, hr: 0.13 }, huge: { tw: 0.43, lw: 0.145, aw: 0.115, hr: 0.135 },
};
function shade(hex, amt) {   // lighten (+) / darken (-)
  const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const f = v => clamp(Math.round(v + (amt > 0 ? (255 - v) * amt : v * amt)), 0, 255);
  return '#' + [f(r), f(g), f(b)].map(v => v.toString(16).padStart(2, '0')).join('');
}

function drawHair(c, st, col, cx, cy, r, suit) {
  c.fillStyle = col;
  switch (st) {
    case 'short': c.beginPath(); c.arc(cx, cy, r * 1.06, Math.PI * 1.02, Math.PI * 1.98); c.lineTo(cx + r * 0.95, cy - r * 0.2); c.quadraticCurveTo(cx, cy - r * 0.55, cx - r * 0.95, cy - r * 0.2); c.closePath(); c.fill(); c.stroke(); break;
    case 'slick': c.beginPath(); c.arc(cx, cy, r * 1.08, Math.PI * 1.0, Math.PI * 2.0); c.quadraticCurveTo(cx + r * 0.2, cy - r * 0.5, cx - r * 0.95, cy - r * 0.15); c.closePath(); c.fill(); c.stroke(); break;
    case 'puffs': drawHair(c, 'short', col, cx, cy, r, suit); circ(c, cx - r * 0.95, cy - r * 0.78, r * 0.55, col); circ(c, cx + r * 0.95, cy - r * 0.78, r * 0.55, col); break;
    case 'messy': { const pts = [[cx - r, cy - r * 0.1], [cx - r * 1.05, cy - r * 0.9], [cx - r * 0.5, cy - r * 0.55], [cx - r * 0.35, cy - r * 1.4], [cx + r * 0.05, cy - r * 0.8], [cx + r * 0.45, cy - r * 1.35], [cx + r * 0.6, cy - r * 0.6], [cx + r * 1.1, cy - r * 0.95], [cx + r, cy - r * 0.05], [cx, cy - r * 0.35]]; poly(c, pts, col); break; }
    case 'bob': c.beginPath(); rrect(c, cx - r * 1.12, cy - r * 1.05, r * 2.24, r * 2.15, r * 0.9); c.fillStyle = col; c.fill(); c.stroke(); break;
    case 'afro': circ(c, cx, cy - r * 0.2, r * 1.5, col); break;
    case 'flame': { const pts = [[cx - r * 1.0, cy], [cx - r * 1.1, cy - r * 1.2], [cx - r * 0.6, cy - r * 0.5], [cx - r * 0.45, cy - r * 1.9], [cx - r * 0.05, cy - r * 0.8], [cx + r * 0.3, cy - r * 2.1], [cx + r * 0.55, cy - r * 0.7], [cx + r * 1.1, cy - r * 1.3], [cx + r * 1.0, cy - r * 0.05], [cx, cy - r * 0.3]]; poly(c, pts, col); break; }
    case 'wild': { const pts = []; for (let i = 0; i <= 12; i++) { const a = Math.PI + (i / 12) * Math.PI, rr = r * (i % 2 ? 1.15 : 1.75); pts.push([cx + Math.cos(a) * rr, cy - r * 0.1 + Math.sin(a) * rr]); } pts.push([cx + r, cy], [cx - r, cy]); poly(c, pts, col); break; }
    case 'mohawk': poly(c, [[cx - r * 0.25, cy - r * 0.8], [cx - r * 0.05, cy - r * 1.7], [cx + r * 0.18, cy - r * 1.2], [cx + r * 0.4, cy - r * 1.65], [cx + r * 0.5, cy - r * 0.8]], col); break;
    case 'bun': drawHair(c, 'short', col, cx, cy, r, suit); circ(c, cx - r * 0.1, cy - r * 1.3, r * 0.45, col); break;
    case 'hood': c.beginPath(); c.arc(cx, cy + r * 0.05, r * 1.35, Math.PI * 0.85, Math.PI * 2.15); c.lineTo(cx + r * 1.2, cy + r * 1.0); c.lineTo(cx - r * 1.2, cy + r * 1.0); c.closePath(); c.fillStyle = col; c.fill(); c.stroke(); break;
    case 'cap': c.beginPath(); c.arc(cx, cy - r * 0.1, r * 1.1, Math.PI, Math.PI * 2); c.closePath(); c.fillStyle = col; c.fill(); c.stroke(); poly(c, [[cx + r * 0.4, cy - r * 0.2], [cx + r * 1.5, cy - r * 0.12], [cx + r * 1.4, cy + r * 0.12], [cx + r * 0.4, cy + r * 0.0]], shade(col, -0.18)); break;
    default: break;
  }
}

function drawFace(c, cx, cy, r, expr, small) {
  const ex = r * 0.38, ey = cy + r * 0.02, er = r * 0.17;
  c.save(); c.lineWidth = Math.max(c.lineWidth * 0.7, 0.012);
  const eye = (x, sq) => {
    c.beginPath(); c.ellipse(x, ey, er, er * (sq ? 0.55 : 1.15), 0, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill(); c.stroke();
    c.beginPath(); c.arc(x + er * 0.32, ey + er * 0.05, er * 0.5, 0, Math.PI * 2); c.fillStyle = INK; c.fill();
  };
  const sq = expr === 'smug' || expr === 'bored';
  eye(cx - ex, sq); eye(cx + ex, expr === 'wink');
  c.strokeStyle = INK; c.lineWidth = Math.max(c.lineWidth, 0.014); c.lineCap = 'round';
  if (!small) {
    const my = cy + r * 0.55;
    c.beginPath();
    if (expr === 'grin') { c.moveTo(cx - r * 0.38, my - r * 0.06); c.quadraticCurveTo(cx, my + r * 0.4, cx + r * 0.38, my - r * 0.06); c.closePath(); c.fillStyle = '#fff'; c.fill(); c.stroke(); }
    else if (expr === 'shout') { c.ellipse(cx + r * 0.05, my + r * 0.05, r * 0.28, r * 0.32, 0, 0, Math.PI * 2); c.fillStyle = '#5a1020'; c.fill(); c.stroke(); }
    else if (expr === 'worry') { c.moveTo(cx - r * 0.3, my + r * 0.1); c.quadraticCurveTo(cx, my - r * 0.15, cx + r * 0.3, my + r * 0.1); c.stroke(); c.beginPath(); c.moveTo(cx - ex - er * 1.3, ey - er * 1.9); c.lineTo(cx - ex + er * 1.3, ey - er * 2.7); c.moveTo(cx + ex + er * 1.3, ey - er * 1.9); c.lineTo(cx + ex - er * 1.3, ey - er * 2.7); c.stroke(); }
    else if (expr === 'smug') { c.moveTo(cx - r * 0.25, my); c.quadraticCurveTo(cx + r * 0.1, my + r * 0.2, cx + r * 0.38, my - r * 0.12); c.stroke(); c.beginPath(); c.moveTo(cx + ex - er * 1.2, ey - er * 2.2); c.lineTo(cx + ex + er * 1.2, ey - er * 2.6); c.stroke(); }
    else if (expr === 'angry') { c.moveTo(cx - r * 0.3, my + r * 0.08); c.lineTo(cx + r * 0.3, my + r * 0.08); c.stroke(); c.beginPath(); c.moveTo(cx - ex - er * 1.4, ey - er * 2.7); c.lineTo(cx - ex + er * 1.2, ey - er * 1.7); c.moveTo(cx + ex + er * 1.4, ey - er * 2.7); c.lineTo(cx + ex - er * 1.2, ey - er * 1.7); c.stroke(); }
    else { c.moveTo(cx - r * 0.22, my); c.quadraticCurveTo(cx, my + r * 0.13, cx + r * 0.22, my); c.stroke(); }
  }
  c.restore();
}

function drawHeadgear(c, look, cx, cy, r, pass) {
  const m = look.mask || { t: 'none' };
  const col = m.c || '#111';
  if (pass === 'under') {
    if (m.t === 'balaclava') { circ(c, cx, cy, r * 1.04, col); }
    return;
  }
  switch (m.t) {
    case 'domino': c.beginPath(); rrect(c, cx - r * 1.02, cy - r * 0.32, r * 2.04, r * 0.6, r * 0.28); c.fillStyle = col; c.fill(); c.stroke(); break;
    case 'goggles': c.beginPath(); c.moveTo(cx - r * 1.05, cy - r * 0.05); c.lineTo(cx + r * 1.05, cy - r * 0.05); c.lineWidth = c.lineWidth * 1.6; c.strokeStyle = INK; c.stroke(); c.lineWidth /= 1.6; [-1, 1].forEach(s => { circ(c, cx + s * r * 0.42, cy, r * 0.34, col); circ(c, cx + s * r * 0.42, cy, r * 0.2, '#bdeaff'); }); break;
    case 'catcowl': c.beginPath(); c.arc(cx, cy - r * 0.05, r * 1.06, Math.PI * 0.98, Math.PI * 2.02); c.lineTo(cx + r * 1.0, cy + r * 0.12); c.quadraticCurveTo(cx, cy - r * 0.15, cx - r * 1.0, cy + r * 0.12); c.closePath(); c.fillStyle = col; c.fill(); c.stroke(); poly(c, [[cx - r * 0.95, cy - r * 0.5], [cx - r * 0.85, cy - r * 1.55], [cx - r * 0.2, cy - r * 0.95]], col); poly(c, [[cx + r * 0.95, cy - r * 0.5], [cx + r * 0.85, cy - r * 1.55], [cx + r * 0.2, cy - r * 0.95]], col); break;
    case 'visor': c.beginPath(); rrect(c, cx - r * 1.04, cy - r * 0.26, r * 2.08, r * 0.52, r * 0.2); c.fillStyle = col; c.fill(); c.stroke(); c.fillStyle = 'rgba(255,255,255,.45)'; c.fillRect(cx - r * 0.7, cy - r * 0.15, r * 0.9, r * 0.1); break;
    case 'sunglasses': [-1, 1].forEach(s => { c.beginPath(); rrect(c, cx + s * r * 0.44 - r * 0.38, cy - r * 0.22, r * 0.76, r * 0.5, r * 0.18); c.fillStyle = col; c.fill(); c.stroke(); }); c.beginPath(); c.moveTo(cx - r * 0.1, cy - r * 0.05); c.lineTo(cx + r * 0.1, cy - r * 0.05); c.stroke(); break;
    case 'balaclava': c.beginPath(); rrect(c, cx - r * 0.82, cy - r * 0.2, r * 1.64, r * 0.4, r * 0.18); c.fillStyle = '#f0d4b8'; c.fill(); break;
    case 'bird': circ(c, cx, cy + r * 0.05, r * 1.04, col); poly(c, [[cx + r * 0.5, cy + r * 0.05], [cx + r * 1.6, cy + r * 0.35], [cx + r * 0.45, cy + r * 0.6]], '#ffb347'); [-1, 1].forEach(s => circ(c, cx + s * r * 0.34, cy - r * 0.1, r * 0.2, '#fff')); [-1, 1].forEach(s => circ(c, cx + s * r * 0.34 + r * 0.05, cy - r * 0.08, r * 0.09, INK, false)); break;
    case 'helmet': c.beginPath(); c.arc(cx, cy - r * 0.05, r * 1.12, Math.PI, Math.PI * 2); c.closePath(); c.fillStyle = col; c.fill(); c.stroke(); break;
    default: break;
  }
}

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
  c.lineJoin = 'round'; c.lineCap = 'round'; c.strokeStyle = INK;
  c.lineWidth = Math.max(0.024, 1.7 / (o.s * o.size));
  if (o.shadow) { c.save(); c.fillStyle = 'rgba(0,0,0,.34)'; c.beginPath(); c.ellipse(0, 0.005, kind === 'gator' ? 0.34 : kind === 'mech' ? 0.3 : 0.2, 0.05, 0, 0, Math.PI * 2); c.fill(); c.restore(); }
  if (kind === 'drone') drawDrone(c, look, o);
  else if (kind === 'gator') drawGator(c, look, o);
  else if (kind === 'mech') drawMech(c, look, o);
  else drawHuman(c, look, o);
  c.restore();
}

function drawHuman(c, look, o) {
  const b = BUILD[look.build] || BUILD.normal, t = o.t, pa = o.pa, pose = o.pose;
  const sinp = Math.sin(pa * Math.PI);
  let bob = Math.sin(t * 2.4) * 0.007, lean = 0, lift = 0, armF = 0.1 + Math.sin(t * 2) * 0.05, armB = -0.08 - Math.sin(t * 2) * 0.05, legF = 0, legB = 0, rot = 0, fx = 0;
  if (pose === 'attack') { lean = sinp * 0.1; armF = lerp(0.2, 1.75, sinp); armB = -0.4 * sinp; fx = sinp * 0.1; }
  else if (pose === 'cast') { lift = sinp * 0.035; armF = lerp(0.2, 2.5, sinp); armB = lerp(-0.1, 2.3, sinp); }
  else if (pose === 'walk') { legF = Math.sin(pa * Math.PI * 4) * 0.45; legB = -legF; armF = -legF * 0.8; armB = legF * 0.8; bob = Math.abs(Math.sin(pa * Math.PI * 4)) * 0.025; lift = -bob; }
  else if (pose === 'hurt') { fx = -Math.sin(pa * Math.PI * 6) * 0.03 - 0.03; lean = -0.1; armF = 0.8; armB = 0.6; }
  else if (pose === 'cheer') { armF = 2.7 + Math.sin(t * 9) * 0.2; armB = 2.7 - Math.sin(t * 9) * 0.2; bob = Math.abs(Math.sin(t * 7)) * 0.04; }
  else if (pose === 'jump') { lift = sinp * 0.28; legF = 0.5; legB = -0.3; armF = 1.2; armB = 1.0; }
  else if (pose === 'down') { rot = -1.35; }
  c.translate(fx, -lift - bob);
  if (rot) { c.rotate(rot); c.translate(0.1, 0); }
  c.rotate(lean * 0.6);

  const hipY = -0.34, shY = -0.66, tw = b.tw, hr = b.hr, hy = -0.795, headCx = lean * 0.05;
  const suit = look.suit, suit2 = look.suit2 || shade(look.suit, -0.35), accent = look.accent || '#fff';
  const skin = look.skin, hasLab = (look.extras || []).includes('labcoat');
  const skinD = shade(skin, -0.1);
  // cape back
  if (look.cape) {
    const sway = Math.sin(t * 2.2) * 0.02 + (pose === 'walk' ? -0.05 : 0);
    c.beginPath(); c.moveTo(-tw * 0.5, shY); c.lineTo(tw * 0.5, shY); c.quadraticCurveTo(-tw * 0.9 - 0.05 + sway, -0.3, -tw * 0.95 - 0.1 + sway * 2, -0.12); c.lineTo(-tw * 0.1 + sway * 2, -0.05); c.quadraticCurveTo(-tw * 0.3, -0.3, -tw * 0.5, shY); c.closePath();
    c.fillStyle = shade(look.cape, -0.2); c.fill(); c.stroke();
  }
  if ((look.extras || []).includes('pack')) blob(c, -tw * 0.95, shY + 0.03, tw * 0.5, 0.26, 0.03, '#59471f');
  // back arm
  limb(c, -tw * 0.5, shY + 0.03, armB, 0.26, b.aw, suit2, (look.extras || []).includes('gauntlets') ? accent : skin, (look.extras || []).includes('gauntlets') ? b.aw * 0.85 : b.aw * 0.62);
  // legs
  const lw = b.lw, ls = tw * 0.22;
  [[-1, legB], [1, legF]].forEach(([s, a]) => {
    c.save(); c.translate(s * ls, hipY); c.rotate(-a);
    blob(c, -lw / 2, -0.01, lw, 0.37, lw * 0.4, s > 0 ? suit2 : shade(suit2, -0.12));
    blob(c, -lw / 2 - 0.008, 0.28, lw + 0.03, 0.095, 0.03, shade(suit2, -0.45), true);
    c.restore();
  });
  // torso
  blob(c, -tw / 2, shY, tw, 0.33, tw * 0.22, suit);
  // torso detail: belt + trim
  c.save(); c.beginPath(); rrect(c, -tw / 2, shY, tw, 0.33, tw * 0.22); c.clip();
  c.fillStyle = suit2; c.fillRect(-tw / 2, hipY - 0.045, tw, 0.05);
  c.fillStyle = accent; c.fillRect(-0.025, hipY - 0.045, 0.05, 0.05);
  c.fillStyle = suit2; c.fillRect(-tw / 2, shY, tw, 0.035);
  c.restore();
  c.beginPath(); rrect(c, -tw / 2, shY, tw, 0.33, tw * 0.22); c.stroke();
  if (hasLab) { c.beginPath(); c.moveTo(-tw * 0.55, shY + 0.03); c.lineTo(-tw * 0.55, -0.1); c.lineTo(-0.045, -0.1); c.lineTo(-0.02, shY + 0.03); c.closePath(); c.fillStyle = '#f2f4ff'; c.fill(); c.stroke(); c.beginPath(); c.moveTo(tw * 0.55, shY + 0.03); c.lineTo(tw * 0.55, -0.1); c.lineTo(0.045, -0.1); c.lineTo(0.02, shY + 0.03); c.closePath(); c.fillStyle = '#e4e8fa'; c.fill(); c.stroke(); }
  if ((look.extras || []).includes('bandolier')) { c.save(); c.beginPath(); c.moveTo(-tw * 0.5, shY + 0.02); c.lineTo(-tw * 0.22, shY + 0.02); c.lineTo(tw * 0.5, hipY - 0.03); c.lineTo(tw * 0.22, hipY - 0.03); c.closePath(); c.fillStyle = '#5a3f1a'; c.fill(); c.stroke(); for (let i = 0; i < 4; i++) circ(c, -tw * 0.18 + i * tw * 0.17, shY + 0.07 + i * 0.045, 0.017, '#ff7a3a'); c.restore(); }
  // emblem
  if (look.emblem && !hasLab) drawEmblem(c, look.emblem, 0, shY + 0.14, 0.055, accent);
  if (look.emblem && hasLab) drawEmblem(c, look.emblem, 0, shY + 0.14, 0.04, accent);
  // scarf
  if ((look.extras || []).includes('scarf')) { blob(c, -tw * 0.42, shY - 0.025, tw * 0.84, 0.05, 0.02, accent, true); poly(c, [[-tw * 0.2, shY + 0.02], [-tw * 0.55 - Math.sin(t * 3) * 0.04, shY + 0.15], [-tw * 0.5, shY + 0.19], [-tw * 0.1, shY + 0.04]], accent); }
  if ((look.extras || []).includes('speaker')) blob(c, -tw * 0.98, shY - 0.02, 0.12, 0.09, 0.02, '#222');
  // neck + head
  blob(c, -0.03 + headCx, shY - 0.05, 0.06, 0.07, 0.02, skinD, true);
  drawHeadgear(c, look, headCx, hy, hr, 'under');
  // hair back layer (bob/afro/hood) then head
  const hs = look.hair ? look.hair.s : 'bald', hc = look.hair ? look.hair.c : '#222';
  if (hs === 'afro' || hs === 'bob' || hs === 'hood') drawHair(c, hs, hs === 'hood' ? suit2 : hc, headCx, hy, hr, suit);
  if (look.mask && look.mask.t === 'balaclava') { /* head covered */ } else {
    c.beginPath(); c.ellipse(headCx, hy, hr * 0.96, hr * 1.04, 0, 0, Math.PI * 2); c.fillStyle = skin; c.fill(); shadeFill(c, headCx - hr, hy - hr, hr * 2, hr * 2); c.beginPath(); c.ellipse(headCx, hy, hr * 0.96, hr * 1.04, 0, 0, Math.PI * 2); c.stroke();
  }
  // ear
  if (!(look.mask && (look.mask.t === 'balaclava' || look.mask.t === 'bird'))) circ(c, headCx - hr * 0.92, hy + hr * 0.1, hr * 0.2, skinD);
  if (look.mask && look.mask.t === 'balaclava') { drawHeadgear(c, look, headCx, hy, hr, 'over'); drawFaceEyesOnly(c, headCx, hy, hr); }
  else { drawFace(c, headCx, hy, hr, o.expr, o.s * o.size < 55); drawHeadgear(c, look, headCx, hy, hr, 'over'); }
  if (hs !== 'afro' && hs !== 'bob' && hs !== 'hood') drawHair(c, hs, hc, headCx, hy, hr, suit);
  else if (hs === 'afro') drawHair(c, 'short', hc, headCx, hy, hr, suit);
  else if (hs === 'bob') { c.fillStyle = hc; c.beginPath(); c.arc(headCx, hy - hr * 0.05, hr * 1.08, Math.PI * 1.0, Math.PI * 2.0); c.lineTo(headCx + hr * 0.9, hy + hr * 0.1); c.quadraticCurveTo(headCx, hy - hr * 0.5, headCx - hr * 0.9, hy + hr * 0.1); c.closePath(); c.fill(); c.stroke(); }
  const ex = look.extras || [];
  if (ex.includes('mustache')) { c.beginPath(); c.moveTo(headCx - hr * 0.55, hy + hr * 0.4); c.quadraticCurveTo(headCx, hy + hr * 0.2, headCx + hr * 0.55, hy + hr * 0.4); c.quadraticCurveTo(headCx, hy + hr * 0.55, headCx - hr * 0.55, hy + hr * 0.4); c.fillStyle = shade(hc === '#222' ? '#333' : hc, -0.2); c.fill(); c.stroke(); }
  if (ex.includes('glasses')) { c.save(); c.lineWidth *= 0.9; [-1, 1].forEach(s => { c.beginPath(); rrect(c, headCx + s * hr * 0.4 - hr * 0.3, hy - hr * 0.2, hr * 0.6, hr * 0.42, hr * 0.12); c.fillStyle = 'rgba(190,230,255,.25)'; c.fill(); c.stroke(); }); c.beginPath(); c.moveTo(headCx - hr * 0.1, hy - hr * 0.02); c.lineTo(headCx + hr * 0.1, hy - hr * 0.02); c.stroke(); c.restore(); }
  if (ex.includes('hardhat')) { c.beginPath(); c.arc(headCx, hy - hr * 0.1, hr * 1.12, Math.PI, Math.PI * 2); c.closePath(); c.fillStyle = '#ffd23f'; c.fill(); shadeFill(c, headCx - hr * 1.1, hy - hr * 1.2, hr * 2.2, hr * 1.1); c.beginPath(); c.arc(headCx, hy - hr * 0.1, hr * 1.12, Math.PI, Math.PI * 2); c.closePath(); c.stroke(); blob(c, headCx - hr * 1.22, hy - hr * 0.16, hr * 2.44, hr * 0.2, hr * 0.1, '#e0b020'); blob(c, headCx - hr * 0.12, hy - hr * 1.2, hr * 0.24, hr * 0.5, hr * 0.06, '#f0c230', true); }
  if (ex.includes('crown')) poly(c, [[headCx - hr * 0.9, hy - hr * 0.85], [headCx - hr * 0.8, hy - hr * 1.7], [headCx - hr * 0.35, hy - hr * 1.15], [headCx, hy - hr * 1.9], [headCx + hr * 0.35, hy - hr * 1.15], [headCx + hr * 0.8, hy - hr * 1.7], [headCx + hr * 0.9, hy - hr * 0.85]], accent);
  if (ex.includes('headset')) { c.beginPath(); c.arc(headCx, hy - hr * 0.1, hr * 1.1, Math.PI * 1.05, Math.PI * 1.95); c.lineWidth *= 2.2; c.stroke(); c.lineWidth /= 2.2; circ(c, headCx - hr * 1.0, hy + hr * 0.1, hr * 0.3, '#333'); c.beginPath(); c.moveTo(headCx - hr * 1.0, hy + hr * 0.35); c.quadraticCurveTo(headCx - hr * 0.6, hy + hr * 0.95, headCx - hr * 0.1, hy + hr * 0.75); c.stroke(); circ(c, headCx - hr * 0.1, hy + hr * 0.75, hr * 0.1, '#333'); }
  // front arm (drawn last to overlap body)
  const gaunt = ex.includes('gauntlets');
  const fh = gaunt ? accent : skin;
  limb(c, tw * 0.5, shY + 0.03, armF, 0.26, b.aw, suit, fh, gaunt ? b.aw * 0.85 : b.aw * 0.62);
  // held props at the front hand
  const hx = tw * 0.5 + Math.sin(armF) * 0.27, hy2 = shY + 0.03 + Math.cos(armF) * 0.27;
  if (ex.includes('bat')) { c.save(); c.translate(hx, hy2); c.rotate(-armF * 0.8 - 0.4); blob(c, -0.02, -0.28, 0.04, 0.34, 0.02, '#c98a4a'); c.restore(); }
  if (ex.includes('gun')) { blob(c, hx - 0.02, hy2 - 0.04, 0.17, 0.05, 0.015, '#2a2d38'); }
  if (ex.includes('cone')) { poly(c, [[hx - 0.04, hy2 - 0.02], [hx + 0.04, hy2 - 0.02], [hx, hy2 + 0.13]], '#e8b46a'); circ(c, hx, hy2 - 0.05, 0.05, '#ff8ad8'); circ(c, hx, hy2 - 0.1, 0.035, '#7ee8ff'); }
  if (ex.includes('shield')) { c.save(); c.globalAlpha *= 0.85; c.beginPath(); c.ellipse(hx + 0.09, hy2 - 0.04, 0.09, 0.17, 0, 0, Math.PI * 2); c.fillStyle = 'rgba(120,255,220,.55)'; c.fill(); c.stroke(); c.restore(); }
}
function drawFaceEyesOnly(c, cx, cy, r) {
  [-1, 1].forEach(s => { c.beginPath(); c.ellipse(cx + s * r * 0.38, cy, r * 0.16, r * 0.14, 0, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill(); circ(c, cx + s * r * 0.38 + r * 0.05, cy, r * 0.08, INK, false); });
}
function drawEmblem(c, kind, x, y, s, col) {
  c.save(); c.translate(x, y); c.fillStyle = col; c.lineWidth *= 0.8;
  switch (kind) {
    case 'bolt': poly(c, [[s * 0.3, -s], [-s * 0.7, s * 0.15], [-s * 0.05, s * 0.15], [-s * 0.3, s], [s * 0.7, -s * 0.25], [s * 0.05, -s * 0.25]], col); break;
    case 'star': { const p = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? s * 0.45 : s; p.push([Math.cos(a) * r, Math.sin(a) * r]); } poly(c, p, col); break; }
    case 'wing': poly(c, [[-s, s * 0.5], [-s * 0.1, -s * 0.8], [0, -s * 0.2], [s * 0.1, -s * 0.8], [s, s * 0.5], [0, s * 0.1]], col); break;
    case 'anvil': poly(c, [[-s, -s * 0.5], [s, -s * 0.5], [s * 0.5, 0], [s * 0.5, s * 0.5], [s * 0.9, s * 0.8], [-s * 0.9, s * 0.8], [-s * 0.5, s * 0.5], [-s * 0.5, 0]], col); break;
    case 'diamond': poly(c, [[0, -s], [s * 0.8, 0], [0, s], [-s * 0.8, 0]], col); break;
    case 'cross': poly(c, [[-s * 0.3, -s], [s * 0.3, -s], [s * 0.3, -s * 0.3], [s, -s * 0.3], [s, s * 0.3], [s * 0.3, s * 0.3], [s * 0.3, s], [-s * 0.3, s], [-s * 0.3, s * 0.3], [-s, s * 0.3], [-s, -s * 0.3], [-s * 0.3, -s * 0.3]], col); break;
    case 'flame': c.beginPath(); c.moveTo(0, -s); c.quadraticCurveTo(s * 0.9, -s * 0.1, s * 0.5, s * 0.6); c.quadraticCurveTo(0, s * 1.1, -s * 0.5, s * 0.6); c.quadraticCurveTo(-s * 0.9, 0, -s * 0.1, -s * 0.4); c.closePath(); c.fill(); c.stroke(); break;
    case 'eye': c.beginPath(); c.ellipse(0, 0, s, s * 0.55, 0, 0, Math.PI * 2); c.fill(); c.stroke(); circ(c, 0, 0, s * 0.3, INK, false); break;
    case 'bomb': circ(c, 0, s * 0.2, s * 0.7, col); c.beginPath(); c.moveTo(s * 0.3, -s * 0.4); c.quadraticCurveTo(s * 0.8, -s * 0.9, s * 0.9, -s * 0.5); c.stroke(); circ(c, s * 0.9, -s * 0.55, s * 0.18, '#ff5a2a', false); break;
    case 'cone': poly(c, [[-s * 0.6, -s * 0.3], [s * 0.6, -s * 0.3], [0, s]], col); circ(c, 0, -s * 0.5, s * 0.5, col); break;
    case 'badge': c.beginPath(); c.moveTo(0, -s); c.lineTo(s * 0.85, -s * 0.5); c.lineTo(s * 0.7, s * 0.4); c.lineTo(0, s); c.lineTo(-s * 0.7, s * 0.4); c.lineTo(-s * 0.85, -s * 0.5); c.closePath(); c.fill(); c.stroke(); break;
    default: break;
  }
  c.restore();
}

function drawDrone(c, look, o) {
  const t = o.t, hov = -0.45 + Math.sin(t * 3.1) * 0.03, col = look.suit || '#8a95b8', acc = look.accent || '#ff4d4d';
  if (o.pose === 'attack') c.translate(Math.sin(o.pa * Math.PI) * 0.1, 0);
  if (o.pose === 'hurt') c.translate(-Math.sin(o.pa * Math.PI * 6) * 0.03, 0);
  c.save(); c.translate(0, hov);
  circ(c, 0, 0, 0.17, col); c.beginPath(); c.arc(0, 0, 0.17, 0, Math.PI * 2); shadeFill(c, -0.17, -0.17, 0.34, 0.34);
  c.beginPath(); c.arc(0, 0, 0.17, 0, Math.PI * 2); c.stroke();
  circ(c, 0.03, -0.01, 0.075, '#1b1f33'); circ(c, 0.05, -0.01, 0.04, acc, false);
  c.beginPath(); c.moveTo(0, -0.17); c.lineTo(0, -0.27); c.stroke(); circ(c, 0, -0.28, 0.025, acc);
  [-1, 1].forEach(s => { c.save(); c.translate(s * 0.2, -0.1); const w = Math.sin(t * 40 + s) * 0.04 + 0.12; c.beginPath(); c.ellipse(0, -0.02, w, 0.018, 0, 0, Math.PI * 2); c.fillStyle = 'rgba(210,225,255,.75)'; c.fill(); c.stroke(); c.beginPath(); c.moveTo(0, 0); c.lineTo(-s * 0.05, 0.08); c.stroke(); c.restore(); });
  c.restore();
}
function drawGator(c, look, o) {
  const col = look.suit || '#4c9a46', belly = look.accent || '#e8e0a0', k = look.small ? 0.62 : 1;
  c.scale(k, k); const pa = o.pa, sw = Math.sin(o.t * 2) * 0.02;
  const lunge = o.pose === 'attack' ? Math.sin(pa * Math.PI) * 0.14 : 0;
  c.translate(lunge, o.pose === 'hurt' ? Math.sin(pa * 40) * 0.01 : 0);
  // tail
  c.beginPath(); c.moveTo(-0.2, -0.18); c.quadraticCurveTo(-0.45, -0.22 + sw * 3, -0.62, -0.08 + sw * 5); c.quadraticCurveTo(-0.45, -0.1, -0.2, -0.06); c.closePath(); c.fillStyle = col; c.fill(); c.stroke();
  // legs
  [[-0.12, 0], [0.16, 0]].forEach(([x]) => blob(c, x - 0.04, -0.12, 0.08, 0.12, 0.03, shade(col, -0.2)));
  // body
  c.beginPath(); c.ellipse(0, -0.2, 0.3, 0.14, 0, 0, Math.PI * 2); c.fillStyle = col; c.fill(); shadeFill(c, -0.3, -0.34, 0.6, 0.28); c.beginPath(); c.ellipse(0, -0.2, 0.3, 0.14, 0, 0, Math.PI * 2); c.stroke();
  c.beginPath(); c.ellipse(0.02, -0.12, 0.2, 0.05, 0, 0, Math.PI * 2); c.fillStyle = belly; c.fill();
  for (let i = -2; i <= 2; i++) poly(c, [[i * 0.1 - 0.03, -0.31], [i * 0.1, -0.38], [i * 0.1 + 0.03, -0.31]], shade(col, -0.25));
  // head + jaw
  const jaw = o.pose === 'attack' ? Math.sin(pa * Math.PI) * 0.09 : 0.015 + Math.abs(Math.sin(o.t * 1.5)) * 0.01;
  poly(c, [[0.22, -0.31], [0.55, -0.26], [0.55, -0.2], [0.22, -0.16]], col);
  poly(c, [[0.22, -0.16 + jaw], [0.55, -0.2 + jaw], [0.53, -0.13 + jaw], [0.24, -0.09 + jaw]], shade(col, -0.1));
  for (let i = 0; i < 4; i++) poly(c, [[0.3 + i * 0.06, -0.2], [0.33 + i * 0.06, -0.14 + jaw * 0.5], [0.36 + i * 0.06, -0.2]], '#fff', false);
  circ(c, 0.3, -0.31, 0.04, '#ffe27a'); circ(c, 0.315, -0.31, 0.018, INK, false);
}
function drawMech(c, look, o) {
  const col = look.suit || '#c4492b', acc = look.accent || '#ffd23f', pa = o.pa, t = o.t;
  const lunge = o.pose === 'attack' ? Math.sin(pa * Math.PI) * 0.1 : 0;
  c.translate(lunge + (o.pose === 'hurt' ? Math.sin(pa * 30) * 0.02 : 0), -Math.abs(Math.sin(t * 1.6)) * 0.01);
  blob(c, -0.2, -0.3, 0.14, 0.3, 0.03, shade(col, -0.35)); blob(c, 0.06, -0.3, 0.14, 0.3, 0.03, shade(col, -0.25));
  blob(c, -0.25, -0.38, 0.5, 0.1, 0.03, '#444a5e');
  blob(c, -0.3, -0.82, 0.6, 0.46, 0.06, col);
  blob(c, -0.18, -0.74, 0.36, 0.2, 0.05, '#1c2a44'); circ(c, 0.05, -0.64, 0.05, acc, false);
  const fa = o.pose === 'attack' ? 1.5 : 0.2 + Math.sin(t * 2) * 0.05;
  limb(c, 0.3, -0.76, fa, 0.34, 0.15, shade(col, -0.1), '#9aa3bb', 0.12); limb(c, -0.3, -0.76, -0.2, 0.34, 0.15, shade(col, -0.3), '#7c859c', 0.12);
  blob(c, -0.14, -0.96, 0.28, 0.16, 0.06, shade(col, 0.12)); circ(c, 0.04, -0.89, 0.04, '#ff4d4d', false);
  c.beginPath(); c.moveTo(-0.1, -0.96); c.lineTo(-0.1, -1.06); c.stroke(); circ(c, -0.1, -1.08, 0.025, acc);
  poly(c, [[-0.3, -0.5], [-0.1, -0.5], [-0.2, -0.4]], acc, false);
}

/* ---------- portraits (cached data URLs) ---------- */
const _portCache = new Map();
function portraitURL(look, w, h, expr, opt) {
  opt = opt || {};
  const key = JSON.stringify([look, w, h, expr || 'neutral', opt.bg || '', opt.pose || '']);
  if (_portCache.has(key)) return _portCache.get(key);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cv = document.createElement('canvas'); cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  const c = cv.getContext('2d'); c.scale(dpr, dpr);
  const acc = look.accent || '#ffc53d', base = opt.bg || shade(look.suit, -0.55);
  const g = c.createLinearGradient(0, 0, w, h); g.addColorStop(0, shade(acc, -0.35)); g.addColorStop(0.55, base); g.addColorStop(1, shade(base, -0.4));
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  c.save(); c.globalAlpha = 0.16; c.fillStyle = '#fff';
  for (let y = 0; y < h; y += 7) for (let x = (y / 7 % 2) * 3.5; x < w; x += 7) { c.beginPath(); c.arc(x, y, 1.2 + (y / h) * 0.9, 0, 7); c.fill(); }
  c.restore();
  c.save(); c.globalAlpha = 0.28; c.fillStyle = acc; c.beginPath(); c.moveTo(w * 0.55, 0); c.lineTo(w, 0); c.lineTo(w, h * 0.7); c.closePath(); c.fill(); c.restore();
  const kind = look.kind || 'human';
  if (kind === 'drone') { const s = w * 2.3; drawFigure(c, look, { x: w * 0.5, y: h * 0.54 + 0.45 * s, s, shadow: false, t: 0, face: 1 }); }
  else if (kind === 'gator') { const s = w * 1.5 / (look.small ? 0.62 : 1); drawFigure(c, look, { x: w * 0.5 + 0.03 * s, y: h * 0.5 + 0.2 * s, s, shadow: false, t: 0, face: 1 }); }
  else if (kind === 'mech') { const s = h * 0.9; drawFigure(c, look, { x: w * 0.5, y: h * 0.97, s, shadow: false, t: 0, face: 1 }); }
  else { const s = Math.min(h * 2.15, w * 2.3); drawFigure(c, look, { x: w * 0.5, y: h * 0.4 + 0.8 * s, s, shadow: false, expr: expr || 'neutral', t: 0, pose: opt.pose || 'idle', face: 1 }); }
  const url = cv.toDataURL('image/png'); _portCache.set(key, url); return url;
}
function portraitImg(look, w, h, expr, cls, opt) {
  const im = new Image(); im.src = portraitURL(look, w, h, expr, opt); im.width = w; im.height = h; im.className = 'portrait ' + (cls || ''); im.alt = ''; im.draggable = false; return im;
}
const heroPortrait = (id, w = 64, h = 64, expr) => portraitImg(HEROES[id].look, w, h, expr, 'p-' + id);
const npcPortrait = (id, w = 120, h = 120, expr) => portraitImg((NPC[id] || HEROES[id]).look || HEROES[id].look, w, h, expr, 'p-' + id);
function lookOf(id) { return (HEROES[id] && HEROES[id].look) || (NPC[id] && NPC[id].look) || (ENEMIES[id] && ENEMIES[id].look); }

/* ---------- props for the arena ---------- */
function drawProp(c, type, x, y, s, t, hpf) {
  c.save(); c.translate(x, y); c.scale(s, s); c.lineJoin = 'round'; c.lineCap = 'round'; c.strokeStyle = INK; c.lineWidth = Math.max(0.03, 1.7 / s);
  _face = 1;
  c.fillStyle = 'rgba(0,0,0,.3)'; c.beginPath(); c.ellipse(0, 0.01, 0.34, 0.07, 0, 0, Math.PI * 2); c.fill();
  switch (type) {
    case 'car': blob(c, -0.46, -0.34, 0.92, 0.24, 0.06, '#c9453c'); blob(c, -0.26, -0.5, 0.52, 0.2, 0.07, '#d95b52'); blob(c, -0.2, -0.46, 0.18, 0.12, 0.03, '#a9d6f2', true); blob(c, 0.02, -0.46, 0.18, 0.12, 0.03, '#a9d6f2', true); circ(c, -0.27, -0.1, 0.09, '#222'); circ(c, 0.27, -0.1, 0.09, '#222'); circ(c, -0.27, -0.1, 0.035, '#999', false); circ(c, 0.27, -0.1, 0.035, '#999', false); break;
    case 'crate': blob(c, -0.3, -0.5, 0.6, 0.5, 0.04, '#b88950'); c.beginPath(); c.moveTo(-0.3, -0.5); c.lineTo(0.3, 0); c.moveTo(0.3, -0.5); c.lineTo(-0.3, 0); c.stroke(); c.strokeStyle = 'rgba(70,40,10,.5)'; c.beginPath(); c.moveTo(-0.3, -0.25); c.lineTo(0.3, -0.25); c.stroke(); break;
    case 'barrel': blob(c, -0.19, -0.5, 0.38, 0.5, 0.1, '#d83a2e'); c.fillStyle = '#ffd23f'; c.fillRect(-0.19, -0.33, 0.38, 0.09); c.fillRect(-0.19, -0.14, 0.38, 0.09); c.beginPath(); rrect(c, -0.19, -0.5, 0.38, 0.5, 0.1); c.stroke(); poly(c, [[0, -0.26], [-0.05, -0.2], [0.05, -0.2]], INK, false); c.fillStyle = INK; c.font = '0.12px sans-serif'; if (Math.sin(t * 6) > 0.4) { c.fillStyle = 'rgba(255,230,120,.35)'; c.beginPath(); c.arc(0, -0.25, 0.3, 0, 7); c.fill(); } break;
    case 'pillar': blob(c, -0.2, -0.78, 0.4, 0.78, 0.04, '#8f97ad'); blob(c, -0.26, -0.84, 0.52, 0.1, 0.03, '#a8b0c6'); blob(c, -0.26, -0.08, 0.52, 0.1, 0.03, '#a8b0c6'); break;
    case 'planter': blob(c, -0.3, -0.26, 0.6, 0.26, 0.05, '#7a5a3a'); circ(c, -0.12, -0.34, 0.15, '#3f9a4a'); circ(c, 0.12, -0.36, 0.17, '#4cb056'); break;
    default: break;
  }
  if (hpf != null && hpf < 1 && type !== 'pillar') { c.fillStyle = 'rgba(0,0,0,.5)'; c.fillRect(-0.2, 0.06, 0.4, 0.05); c.fillStyle = '#ffd23f'; c.fillRect(-0.2, 0.06, 0.4 * hpf, 0.05); }
  c.restore();
}

/* ---------- arena background ---------- */
const THEMES = {
  street: { sky: ['#ff9a5a', '#7a4a8a', '#1d1f4a'], ground: '#2a2f45', tile: '#3a4160', tile2: '#343a58', line: '#7f8ab8', sun: '#ffd37a', win: '#ffd37a' },
  dock: { sky: ['#ffb36b', '#d96a6a', '#2a2155'], ground: '#243049', tile: '#35476b', tile2: '#2f4062', line: '#8fb2e8', sun: '#ffd0a0', win: '#ffe3a0' },
  park: { sky: ['#3a6aa8', '#2e4a8a', '#16204a'], ground: '#1f3b36', tile: '#2f5a4a', tile2: '#2a5244', line: '#8fe0b0', sun: '#cfe8ff', win: '#bfe4ff' },
  roof: { sky: ['#101a40', '#2a2a6a', '#51306a'], ground: '#22263e', tile: '#363d62', tile2: '#2f365a', line: '#8f9be8', sun: '#e8d8ff', win: '#ffe27a' },
  foundry: { sky: ['#6a2a2a', '#3a1d2a', '#1a1220'], ground: '#2c2430', tile: '#443a4c', tile2: '#3b3244', line: '#e8a07a', sun: '#ff8a4a', win: '#ff9a4a' },
  finale: { sky: ['#0c1030', '#1a1a5a', '#2a1a6a'], ground: '#171a38', tile: '#262c5a', tile2: '#20254f', line: '#7df9ff', sun: '#7df9ff', win: '#7df9ff' },
};
function paintArenaBg(c, W, H, themeName, seed) {
  const th = THEMES[themeName] || THEMES.street, rng = makeRng(seed || 7);
  const g = c.createLinearGradient(0, 0, 0, H * 0.62); g.addColorStop(0, th.sky[2]); g.addColorStop(0.55, th.sky[1]); g.addColorStop(1, th.sky[0]);
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  // sun / moon
  const sg = c.createRadialGradient(W * 0.78, H * 0.3, 0, W * 0.78, H * 0.3, H * 0.28); sg.addColorStop(0, th.sun); sg.addColorStop(0.18, th.sun); sg.addColorStop(0.19, 'rgba(255,255,255,.18)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
  c.globalAlpha = 0.85; c.fillStyle = sg; c.beginPath(); c.arc(W * 0.78, H * 0.3, H * 0.28, 0, 7); c.fill(); c.globalAlpha = 1;
  // stars
  if (themeName === 'roof' || themeName === 'finale' || themeName === 'park') { c.fillStyle = 'rgba(255,255,255,.8)'; for (let i = 0; i < 60; i++) { c.fillRect(rng() * W, rng() * H * 0.4, 1.5, 1.5); } }
  // skyline layers
  for (let layer = 0; layer < 3; layer++) {
    const base = H * (0.52 + layer * 0.035), colr = layer === 0 ? 'rgba(20,18,50,.55)' : layer === 1 ? 'rgba(14,12,40,.75)' : 'rgba(8,8,26,.92)';
    let x = -20; c.fillStyle = colr;
    while (x < W + 20) {
      const bw = 40 + rng() * 70, bh = H * (0.12 + rng() * 0.25) * (1 - layer * 0.18);
      c.fillRect(x, base - bh, bw, bh + H * 0.2);
      if (layer === 2) { c.fillStyle = th.win; for (let wy = base - bh + 10; wy < base - 8; wy += 15) for (let wx = x + 6; wx < x + bw - 8; wx += 12) { if (rng() > 0.62) { c.globalAlpha = 0.55 + rng() * 0.4; c.fillRect(wx, wy, 5, 7); } } c.globalAlpha = 1; c.fillStyle = colr; }
      x += bw + rng() * 6;
    }
  }
  if (themeName === 'dock') { c.fillStyle = 'rgba(30,60,110,.65)'; c.fillRect(0, H * 0.5, W, H * 0.1); c.strokeStyle = 'rgba(255,255,255,.12)'; for (let i = 0; i < 12; i++) { c.beginPath(); c.moveTo(rng() * W, H * 0.5 + rng() * H * 0.1); c.lineTo(rng() * 60 + 40 + rng() * W, H * 0.5 + rng() * H * 0.1); c.stroke(); } }
  if (themeName === 'foundry') { c.fillStyle = 'rgba(10,6,12,.9)'; [W * 0.15, W * 0.4, W * 0.86].forEach(x => { c.fillRect(x, H * 0.16, 26, H * 0.4); c.fillStyle = 'rgba(255,120,60,.18)'; c.beginPath(); c.arc(x + 13, H * 0.14, 40, 0, 7); c.fill(); c.fillStyle = 'rgba(10,6,12,.9)'; }); }
  // ground
  const gg = c.createLinearGradient(0, H * 0.55, 0, H); gg.addColorStop(0, th.ground); gg.addColorStop(1, shade(th.ground, -0.45));
  c.fillStyle = gg; c.fillRect(0, H * 0.58, W, H * 0.42);
  c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(0, H * 0.58, W, 4);
  // vignette
  const vg = c.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.95); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,10,.55)');
  c.fillStyle = vg; c.fillRect(0, 0, W, H);
}

/* ---------- city map ---------- */
function paintCityMap(c, W, H) {
  const rng = makeRng(42);
  c.fillStyle = '#0e2132'; c.fillRect(0, 0, W, H);
  // river sweeping across bottom-left
  c.save(); c.lineCap = 'round';
  c.strokeStyle = '#0a4a6e'; c.lineWidth = Math.min(W, H) * 0.09; c.beginPath(); c.moveTo(-W * 0.05, H * 0.55); c.bezierCurveTo(W * 0.18, H * 0.58, W * 0.2, H * 0.92, W * 0.4, H * 1.05); c.stroke();
  c.strokeStyle = '#0d5f8c'; c.lineWidth = Math.min(W, H) * 0.055; c.stroke(); c.restore();
  // blocks
  const cols = 14, rows = 10, bw = W / cols, bh = H / rows;
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const x = i * bw, y = j * bh, cx = (x + bw / 2) / W, cy = (y + bh / 2) / H;
    // skip river area approx
    const rx = cx * 3.2, ry = 0.55 + 0.3 * Math.sin(cx * 3.1) + cx * 0.3; if (Math.abs(cy - Math.min(1.1, ry)) < 0.07 && cx < 0.42) continue;
    const park = Math.hypot(cx - 0.58, cy - 0.8) < 0.13;
    c.fillStyle = park ? '#14503a' : (rng() > 0.5 ? '#14354d' : '#173d58');
    c.beginPath(); rrect(c, x + 4, y + 4, bw - 8, bh - 8, 5); c.fill();
    if (park && rng() > 0.4) { c.fillStyle = '#1d7a52'; c.beginPath(); c.arc(x + 10 + rng() * (bw - 20), y + 10 + rng() * (bh - 20), 5 + rng() * 4, 0, 7); c.fill(); }
    if (!park && rng() > 0.55) { c.fillStyle = 'rgba(255,200,90,.16)'; c.fillRect(x + 10 + rng() * (bw - 30), y + 10 + rng() * (bh - 30), 6, 6); }
  }
  // avenues
  c.strokeStyle = 'rgba(80,170,220,.22)'; c.lineWidth = 3; c.beginPath(); c.moveTo(0, H * 0.5); c.lineTo(W, H * 0.46); c.moveTo(W * 0.5, 0); c.lineTo(W * 0.52, H); c.moveTo(W * 0.1, 0); c.lineTo(W * 0.9, H); c.stroke();
  // coordinate ticks
  c.strokeStyle = 'rgba(120,200,255,.1)'; c.lineWidth = 1; for (let i = 1; i < 10; i++) { c.beginPath(); c.moveTo(W * i / 10, 0); c.lineTo(W * i / 10, H); c.moveTo(0, H * i / 10); c.lineTo(W, H * i / 10); c.stroke(); }
  // district labels
  c.fillStyle = 'rgba(190,225,255,.5)'; c.font = '700 ' + Math.max(11, Math.round(W * 0.016)) + 'px "Barlow Condensed", "Arial Narrow", sans-serif'; c.textAlign = 'center';
  Object.values(DISTRICTS).forEach(d => { const t = d.name.toUpperCase().split('').join(' '); c.fillText(t, d.x * W, d.y * H - H * 0.095); });
  // vignette
  const vg = c.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.85); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(2,8,16,.7)'); c.fillStyle = vg; c.fillRect(0, 0, W, H);
}
