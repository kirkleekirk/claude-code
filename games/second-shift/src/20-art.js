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
  else { const tall = h / w > 1.1, s = tall ? h / 0.64 : h / 0.38, top = (tall ? 0.06 : 0.035) * h; drawFigure(c, look, { x: w * 0.5, y: top + 0.99 * s, s, shadow: false, expr: expr || 'neutral', t: 0, pose: opt.pose || 'idle', face: 1 }); }
  const url = cv.toDataURL('image/png'); _portCache.set(key, url); return url;
}
function portraitImg(look, w, h, expr, cls, opt) {
  const im = new Image(); im.src = portraitURL(look, w, h, expr, opt); im.width = w; im.height = h; im.className = 'portrait ' + (cls || ''); im.alt = ''; im.draggable = false; return im;
}
const heroPortrait = (id, w = 64, h = 64, expr) => portraitImg(HEROES[id].look, w, h, expr, 'p-' + id);
const npcPortrait = (id, w = 120, h = 120, expr) => portraitImg((NPC[id] || HEROES[id]).look || HEROES[id].look, w, h, expr, 'p-' + id);
function lookOf(id) { return (HEROES[id] && HEROES[id].look) || (NPC[id] && NPC[id].look) || (ENEMIES[id] && ENEMIES[id].look); }

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
