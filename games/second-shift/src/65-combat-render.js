/* =====================================================================
   65-combat-render: canvas board, effects, event playback
   ===================================================================== */

const CB = {
  B: null, call: null, ids: [], cv: null, ctx: null, W: 0, H: 0, dpr: 1, tw: 60, th: 40, ox: 0, oy: 0, raf: 0, last: 0, t: 0,
  fx: [], texts: [], bursts: [], tweens: [], shake: 0, freeze: 0, flashA: 0, bg: null, bgKey: '', hzVis: [], obsVis: [],
  mode: 'idle', cur: null, moved: false, acted: false, reach: null, aim: null, aimAb: null, hover: null, prev: null, busy: false,
  overlay: [], endTurn: null, threat: null, tutorial: false, speed: 1, telegraph: null, dim: 0,
};
const cbMs = n => n / (Settings.combatSpeed || 1);
const cbWait = n => new Promise(r => setTimeout(r, cbMs(n)));

function cbLayout() {
  const cv = CB.cv; if (!cv) return;
  const r = cv.getBoundingClientRect(); const dpr = Math.min(2, window.devicePixelRatio || 1);
  CB.dpr = dpr; CB.W = r.width; CB.H = r.height;
  cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
  const narrow = r.width < 700;
  const topPad = narrow ? 92 : 104, botPad = narrow ? 168 : 150;
  const availW = r.width - (narrow ? 8 : 40), availH = r.height - topPad - botPad;
  const extra = 0;
  let tw = Math.min(availW / BW, (availH - extra) / (BH * 0.66 + 0.9));
  tw = clamp(tw, 36, 150);
  CB.tw = tw; CB.th = tw * 0.66;
  CB.ox = (r.width - tw * BW) / 2;
  CB.oy = topPad + CB.th * 1.15 + Math.max(0, (availH - CB.th * (BH + 1.15)) / 2);
  CB.bg = null;
}
const cbCell = (x, y) => ({ x: CB.ox + x * CB.tw, y: CB.oy + y * CB.th, w: CB.tw, h: CB.th });
const cbCenter = (x, y) => ({ x: CB.ox + (x + 0.5) * CB.tw, y: CB.oy + (y + 0.5) * CB.th });
const cbFoot = (x, y) => ({ x: CB.ox + (x + 0.5) * CB.tw, y: CB.oy + (y + 0.86) * CB.th });
function cbTileAt(px, py) {
  const x = Math.floor((px - CB.ox) / CB.tw), y = Math.floor((py - CB.oy) / CB.th);
  return inB(x, y) ? { x, y } : null;
}
const spriteH = () => CB.th * 2.1;

/* ---------- visual world state ---------- */
function cbInitVis() {
  const B = CB.B;
  CB.hzVis = B.hz.map(z => ({ x: z.x, y: z.y, type: z.type, born: -1 }));
  CB.obsVis = B.obs.map(o => ({ id: o.id, x: o.x, y: o.y, type: o.type, hp: o.hp, maxHp: o.maxHp, shake: 0, appear: 1 }));
  B.units.forEach(u => { u.vis = { x: u.x, y: u.y, hp: u.hp, shield: u.shield, hype: u.hype, alpha: 1, pose: 'idle', pa: 0, flash: 0, ox: 0, oy: 0, lift: 0, face: u.team === 'hero' ? 1 : -1, hurtT: 0 }; });
  CB.fx.length = 0; CB.texts.length = 0; CB.bursts.length = 0; CB.tweens.length = 0;
}
function cbSyncVis() {
  const B = CB.B;
  B.units.forEach(u => { const v = u.vis; if (!v) return; v.x = u.x; v.y = u.y; v.hp = u.hp; v.shield = u.shield; v.hype = u.hype; v.ox = 0; v.oy = 0; v.lift = 0; if (u.alive) { v.alpha = 1; if (v.pose !== 'idle') { v.pose = 'idle'; } } else v.alpha = 0; });
}
function cbTween(dur, fn, done) { CB.tweens.push({ t0: CB.t, dur: dur / 1000 / (Settings.combatSpeed || 1), fn, done }); }
function cbTweenP(dur, fn) { return new Promise(res => cbTween(dur, fn, res)); }

/* ---------- effects ---------- */
function cbPart(o) { CB.fx.push(Object.assign({ life: 0.6, max: 0.6, vx: 0, vy: 0, g: 0, size: 4, color: '#fff', kind: 'dot', rot: 0, vr: 0 }, o, { max: o.life || 0.6 })); }
function cbSparks(x, y, n, colors, spd, life) {
  for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, s = (0.3 + Math.random()) * (spd || 220); cbPart({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, g: 420, size: 2 + Math.random() * 3.5, color: colors[i % colors.length], life: (life || 0.5) * (0.6 + Math.random() * 0.7), kind: 'dot' }); }
}
function cbSmoke(x, y, n, col) { for (let i = 0; i < n; i++) cbPart({ x: x + (Math.random() - 0.5) * 24, y: y + (Math.random() - 0.5) * 10, vx: (Math.random() - 0.5) * 40, vy: -20 - Math.random() * 40, size: 8 + Math.random() * 12, color: col || 'rgba(200,200,220,.55)', life: 0.6 + Math.random() * 0.4, kind: 'smoke' }); }
function cbStars(x, y, n, col) { for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, s = 120 + Math.random() * 180; cbPart({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: 100, size: 7 + Math.random() * 8, color: col || '#ffd23f', life: 0.45, kind: 'star', rot: Math.random() * 6, vr: (Math.random() - 0.5) * 10 }); } }
function cbRing(x, y, col, r1, life) { cbPart({ x, y, size: r1 || 90, color: col, life: life || 0.4, kind: 'ring' }); }
function cbText(x, y, str, color, size, opts) { CB.texts.push(Object.assign({ x, y, str, color: color || '#fff', size: size || 22, life: 1.0, max: 1.0, vy: -46 }, opts || {})); }
const ONOMA = { hit: ['POW!', 'BAM!', 'WHAM!', 'THWACK!', 'BONK!', 'SMACK!'], zap: ['ZZZAP!', 'BZZT!'], fire: ['FWOOSH!', 'SIZZLE!'], boom: ['BOOM!', 'KA-BOOM!'], slam: ['SLAM!', 'CRUNCH!'], crit: ['CRITICAL!', 'KAPOW!'], toxic: ['SPLORCH!'], burn: ['SIZZLE!'] };
function cbBurst(x, y, str, color, scale) { CB.bursts.push({ x, y, str, color: color || '#ffd23f', life: 0.75, max: 0.75, rot: (Math.random() - 0.5) * 0.5, scale: scale || 1 }); }
function cbShake(m) { if (!Settings.shake || prefersReducedMotion()) return; CB.shake = Math.max(CB.shake, m); }
function cbFreeze(sec) { CB.freeze = Math.max(CB.freeze, sec); }

/* ---------- main frame ---------- */
function cbFrame(ts) {
  CB.raf = requestAnimationFrame(cbFrame);
  if (G.mode !== 'combat' || !CB.B) return;
  let dt = Math.min(0.05, (ts - (CB.last || ts)) / 1000); CB.last = ts;
  if (CB.freeze > 0) { CB.freeze -= dt; dt = 0; }
  CB.t += dt;
  // tweens
  for (let i = CB.tweens.length - 1; i >= 0; i--) { const tw = CB.tweens[i], k = clamp((CB.t - tw.t0) / tw.dur, 0, 1); tw.fn(k); if (k >= 1) { CB.tweens.splice(i, 1); if (tw.done) tw.done(); } }
  // unit anim decay
  CB.B.units.forEach(u => { const v = u.vis; if (!v) return; if (v.flash > 0) v.flash = Math.max(0, v.flash - dt * 4.5); if (v.pose === 'hurt') { v.pa += dt * 3.2; if (v.pa >= 1) { v.pose = 'idle'; v.pa = 0; } } });
  // particles
  for (let i = CB.fx.length - 1; i >= 0; i--) { const p = CB.fx[i]; p.life -= dt; if (p.life <= 0) { CB.fx.splice(i, 1); continue; } p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; }
  for (let i = CB.texts.length - 1; i >= 0; i--) { const q = CB.texts[i]; q.life -= dt; if (q.life <= 0) { CB.texts.splice(i, 1); continue; } q.y += q.vy * dt; q.vy *= 0.96; }
  for (let i = CB.bursts.length - 1; i >= 0; i--) { const q = CB.bursts[i]; q.life -= dt; if (q.life <= 0) CB.bursts.splice(i, 1); }
  if (CB.shake > 0) CB.shake = Math.max(0, CB.shake - dt * 30);
  if (CB.flashA > 0) CB.flashA = Math.max(0, CB.flashA - dt * 3);
  cbDraw();
}

function cbBg() {
  const key = CB.W + 'x' + CB.H + CB.B.arena.theme;
  if (CB.bg && CB.bgKey === key) return CB.bg;
  const c = document.createElement('canvas'); c.width = Math.round(CB.W * CB.dpr); c.height = Math.round(CB.H * CB.dpr);
  const g = c.getContext('2d'); g.scale(CB.dpr, CB.dpr);
  paintArenaBg(g, CB.W, CB.H, CB.B.arena.theme, hashStr(CB.B.arena.theme));
  CB.bg = c; CB.bgKey = key; return c;
}

function cbDraw() {
  const c = CB.ctx, B = CB.B, th = THEMES[B.arena.theme] || THEMES.street;
  c.setTransform(CB.dpr, 0, 0, CB.dpr, 0, 0);
  c.clearRect(0, 0, CB.W, CB.H);
  c.drawImage(cbBg(), 0, 0, CB.W, CB.H);
  c.save();
  if (CB.shake > 0) c.translate((Math.random() - 0.5) * CB.shake, (Math.random() - 0.5) * CB.shake);
  // ---- board (cached layer)
  c.drawImage(cbBoardLayer(th), 0, 0, CB.W, CB.H);
  // hazards
  CB.hzVis.forEach(z => cbDrawHazard(c, z));
  // overlays
  cbDrawOverlay(c);
  // ---- props + units (depth sorted)
  const items = [];
  CB.obsVis.forEach(o => items.push({ y: o.y, d: () => { const f = cbFoot(o.x, o.y); drawProp(c, o.type, f.x + (o.shake > 0 ? (Math.random() - 0.5) * 4 : 0), f.y - CB.th * 0.12, CB.th * 1.25 * (0.4 + 0.6 * o.appear), CB.t, o.hp < o.maxHp ? o.hp / o.maxHp : null); if (o.shake > 0) o.shake -= 0.05; } }));
  CB.B.units.forEach(u => { const v = u.vis; if (!v || v.alpha < 0.01) return; items.push({ y: v.y + 0.02, d: () => cbDrawUnit(c, u) }); });
  items.sort((a, b) => a.y - b.y).forEach(i => i.d());
  // unit overlays (bars, status)
  CB.B.units.forEach(u => { if (u.vis && u.vis.alpha > 0.05) cbDrawUnitHud(c, u); });
  // aim/preview markers above everything
  cbDrawPreview(c);
  // fx
  CB.fx.forEach(p => cbDrawPart(c, p));
  CB.bursts.forEach(b => cbDrawBurst(c, b));
  CB.texts.forEach(q => cbDrawText(c, q));
  c.restore();
  if (CB.flashA > 0) { c.fillStyle = 'rgba(255,255,255,' + CB.flashA * 0.6 + ')'; c.fillRect(0, 0, CB.W, CB.H); }
}

function cbBoardLayer(th) {
  const key = CB.W + 'x' + CB.H + ':' + CB.tw + ':' + CB.ox + ':' + CB.oy + ':' + CB.B.arena.theme;
  if (CB.boardLayer && CB.boardKey === key) return CB.boardLayer;
  const cv = document.createElement('canvas'); cv.width = Math.round(CB.W * CB.dpr); cv.height = Math.round(CB.H * CB.dpr);
  const c = cv.getContext('2d'); c.scale(CB.dpr, CB.dpr);
  const slab = CB.th * 0.16;
  c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); rrect(c, CB.ox - 6, CB.oy - 4, CB.tw * BW + 12, CB.th * BH + slab + 10, 10); c.fill();
  for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) {
    const r = cbCell(x, y), alt = (x + y) % 2;
    c.fillStyle = alt ? th.tile : th.tile2; c.fillRect(r.x, r.y, r.w, r.h);
    const g = c.createLinearGradient(0, r.y, 0, r.y + r.h); g.addColorStop(0, 'rgba(255,255,255,.07)'); g.addColorStop(1, 'rgba(0,0,0,.12)'); c.fillStyle = g; c.fillRect(r.x, r.y, r.w, r.h);
    c.fillStyle = 'rgba(0,0,0,.28)'; c.fillRect(r.x, r.y + r.h - 2, r.w, 2 + (y === BH - 1 ? slab : 0));
    c.strokeStyle = 'rgba(255,255,255,.11)'; c.lineWidth = 1; c.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
  }
  CB.boardLayer = cv; CB.boardKey = key; return cv;
}
function cbDrawHazard(c, z) {
  const r = cbCell(z.x, z.y), t = CB.t, cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  c.save(); c.beginPath(); c.rect(r.x + 1, r.y + 1, r.w - 2, r.h - 2); c.clip();
  if (z.type === 'fire') {
    const g = c.createRadialGradient(cx, cy, 2, cx, cy, r.w * 0.6); g.addColorStop(0, 'rgba(255,200,60,.55)'); g.addColorStop(1, 'rgba(255,60,20,.2)'); c.fillStyle = g; c.fillRect(r.x, r.y, r.w, r.h);
    for (let i = 0; i < 4; i++) { const k = (t * 1.3 + i * 0.25) % 1, fx = cx + Math.sin(i * 2.3 + t * 3) * r.w * 0.28, fh = r.h * (0.55 + 0.25 * Math.sin(t * 7 + i)); c.fillStyle = i % 2 ? '#ff7a1a' : '#ffc53d'; c.beginPath(); c.moveTo(fx - r.w * 0.09, cy + r.h * 0.3); c.quadraticCurveTo(fx, cy + r.h * 0.3 - fh * (1 - k * 0.3), fx + r.w * 0.09, cy + r.h * 0.3); c.fill(); }
  } else if (z.type === 'ice') {
    c.fillStyle = 'rgba(170,235,255,.5)'; c.fillRect(r.x, r.y, r.w, r.h); c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 2; c.beginPath(); c.moveTo(r.x + r.w * 0.15, r.y + r.h * 0.7); c.lineTo(r.x + r.w * 0.5, r.y + r.h * 0.25); c.moveTo(r.x + r.w * 0.55, r.y + r.h * 0.85); c.lineTo(r.x + r.w * 0.85, r.y + r.h * 0.45); c.stroke();
    c.fillStyle = 'rgba(255,255,255,' + (0.25 + 0.2 * Math.sin(t * 3 + z.x)) + ')'; c.fillRect(r.x + r.w * 0.1, r.y + r.h * 0.1, r.w * 0.3, r.h * 0.12);
  } else if (z.type === 'electric') {
    c.fillStyle = 'rgba(125,249,255,.18)'; c.fillRect(r.x, r.y, r.w, r.h); c.strokeStyle = (Math.sin(t * 22 + z.x * 3) > 0 ? '#fff6a0' : '#7df9ff'); c.lineWidth = 2.2; c.beginPath(); let px = r.x + 4, py = r.y + r.h * 0.5; c.moveTo(px, py); for (let i = 1; i <= 5; i++) { px = r.x + 4 + (r.w - 8) * i / 5; py = r.y + r.h * (0.25 + Math.abs(Math.sin(t * 17 + i + z.y)) * 0.5); c.lineTo(px, py); } c.stroke();
  } else if (z.type === 'toxic') {
    const g = c.createRadialGradient(cx, cy, 2, cx, cy, r.w * 0.6); g.addColorStop(0, 'rgba(150,255,90,.5)'); g.addColorStop(1, 'rgba(60,160,40,.25)'); c.fillStyle = g; c.fillRect(r.x, r.y, r.w, r.h);
    for (let i = 0; i < 3; i++) { const k = (t * 0.7 + i / 3) % 1; c.strokeStyle = 'rgba(210,255,150,' + (1 - k) * 0.8 + ')'; c.lineWidth = 1.5; c.beginPath(); c.arc(cx + Math.sin(i * 4 + z.x) * r.w * 0.25, cy + r.h * 0.15 - k * r.h * 0.4, 3 + k * 3, 0, 7); c.stroke(); }
  } else if (z.type === 'bomb') {
    c.fillStyle = 'rgba(255,120,60,.18)'; c.fillRect(r.x, r.y, r.w, r.h);
    c.fillStyle = '#23242e'; c.beginPath(); c.arc(cx, cy + r.h * 0.05, r.w * 0.2, 0, 7); c.fill(); c.strokeStyle = INK; c.lineWidth = 2; c.stroke();
    c.fillStyle = Math.sin(t * 10) > 0 ? '#ff5a2a' : '#ffd23f'; c.beginPath(); c.arc(cx + r.w * 0.14, cy - r.h * 0.2, 3, 0, 7); c.fill();
  }
  c.restore();
}

function cbDrawOverlay(c) {
  const t = CB.t; const pulse = 0.5 + 0.5 * Math.sin(t * 5);
  CB.overlay.forEach(o => {
    const r = cbCell(o.x, o.y); let fill = null, stroke = null, a = 0.28;
    switch (o.k) {
      case 'move': fill = 'rgba(61,224,255,' + (0.2 + pulse * 0.08) + ')'; stroke = 'rgba(61,224,255,.8)'; break;
      case 'range': fill = 'rgba(255,170,60,.13)'; stroke = 'rgba(255,170,60,.35)'; break;
      case 'legal': fill = 'rgba(255,110,60,' + (0.24 + pulse * 0.1) + ')'; stroke = 'rgba(255,140,80,.9)'; break;
      case 'legalAlly': fill = 'rgba(94,224,138,' + (0.22 + pulse * 0.1) + ')'; stroke = 'rgba(94,224,138,.9)'; break;
      case 'areaFoe': fill = 'rgba(255,70,70,' + (0.4 + pulse * 0.12) + ')'; stroke = '#ff6a6a'; break;
      case 'areaAlly': fill = 'rgba(94,224,138,.4)'; stroke = '#5ee08a'; break;
      case 'areaMixed': fill = 'rgba(255,200,60,.38)'; stroke = '#ffc53d'; break;
      case 'threat': fill = 'rgba(255,60,60,.12)'; stroke = 'rgba(255,60,60,.3)'; break;
      case 'tele': fill = 'rgba(255,50,50,' + (0.3 + pulse * 0.25) + ')'; stroke = '#ff4040'; break;
      case 'path': fill = 'rgba(255,255,255,.22)'; stroke = '#fff'; break;
      case 'cur': fill = 'rgba(255,197,61,.18)'; stroke = '#ffc53d'; break;
      default: break;
    }
    if (fill) { c.fillStyle = fill; c.fillRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = o.k === 'areaFoe' || o.k === 'tele' ? 2.5 : 1.6; c.strokeRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4); }
  });
  if (CB.hover && CB.mode !== 'busy') { const r = cbCell(CB.hover.x, CB.hover.y); c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 2; c.strokeRect(r.x + 1.5, r.y + 1.5, r.w - 3, r.h - 3); }
}

function cbDrawUnit(c, u) {
  const v = u.vis, f = cbFoot(v.x, v.y);
  const frozen = u.st.frozen;
  const s = spriteH();
  let alpha = v.alpha * (u.alive || v.alpha > 0 ? 1 : 0);
  drawFigure(c, u.look, { x: f.x + v.ox, y: f.y + v.oy - v.lift * CB.th, s, size: u.size, face: v.face, t: CB.t * 1 + u.uid * 0.7, pose: v.pose, pa: v.pa, flash: v.flash, alpha, expr: v.pose === 'hurt' ? 'shout' : (v.pose === 'attack' || v.pose === 'cast') ? 'grin' : 'neutral' });
  if (frozen) { c.save(); c.globalAlpha = 0.5; c.fillStyle = '#bfefff'; c.beginPath(); rrect(c, f.x - CB.tw * 0.28, f.y - s * 0.85 * u.size, CB.tw * 0.56, s * 0.88 * u.size, 10); c.fill(); c.restore(); }
  if (u.st.rally > 0) { c.save(); c.strokeStyle = 'rgba(255,200,60,.8)'; c.lineWidth = 2; c.beginPath(); c.ellipse(f.x, f.y - 2, CB.tw * 0.32, CB.th * 0.12, 0, 0, 7); c.stroke(); c.restore(); }
  if (CB.cur === u && u.alive) { c.save(); c.strokeStyle = u.team === 'hero' ? '#ffc53d' : '#ff5a5a'; c.lineWidth = 3; c.setLineDash([6, 4]); c.lineDashOffset = -CB.t * 20; c.beginPath(); c.ellipse(f.x, f.y - 1, CB.tw * 0.34, CB.th * 0.15, 0, 0, 7); c.stroke(); c.restore(); }
}
function cbDrawUnitHud(c, u) {
  const v = u.vis, f = cbFoot(v.x, v.y), s = spriteH() * u.size;
  const w = Math.max(34, CB.tw * 0.62), x = f.x - w / 2 + v.ox, y = f.y - s * 0.98 - 8 + v.oy - v.lift * CB.th + (u.look.kind === 'drone' ? s * 0.25 : 0) + (u.look.kind === 'gator' ? s * 0.5 : 0);
  const hpf = clamp(v.hp / u.maxHp, 0, 1);
  c.save();
  c.fillStyle = 'rgba(8,10,26,.85)'; c.beginPath(); rrect(c, x - 2, y - 2, w + 4, 9, 4); c.fill();
  c.fillStyle = u.team === 'hero' ? (hpf > 0.5 ? '#5ee08a' : hpf > 0.25 ? '#ffc53d' : '#ff5252') : (hpf > 0.5 ? '#ff6b6b' : hpf > 0.25 ? '#ff9a3d' : '#ffd23f');
  c.beginPath(); rrect(c, x, y, w * hpf, 5, 2.5); c.fill();
  if (v.shield > 0) { c.fillStyle = '#7ee8ff'; c.fillRect(x, y - 3, w * clamp(v.shield / u.maxHp, 0, 1), 2); }
  if (u.team === 'hero') { c.fillStyle = 'rgba(8,10,26,.85)'; c.fillRect(x - 2, y + 7, w + 4, 5); c.fillStyle = v.hype >= 100 ? (Math.sin(CB.t * 10) > 0 ? '#fff' : '#ffc53d') : '#e8a63a'; c.fillRect(x, y + 8, w * clamp(v.hype / 100, 0, 1), 3); }
  // status chips
  const chips = []; if (u.st.burn) chips.push(['BRN', '#ff7a2a']); if (u.st.mark > 0) chips.push(['MRK', '#ff4d8d']); if (u.st.frozen) chips.push(['FRZ', '#7ee8ff']); if (u.st.rally > 0) chips.push(['RLY', '#ffc53d']); if (u.shield > 0) chips.push(['SHD', '#7ee8ff']);
  if (chips.length) { c.font = '700 9px "Barlow Condensed", sans-serif'; c.textAlign = 'center'; chips.forEach(([txt, col], i) => { const cx = x + w / 2 + (i - (chips.length - 1) / 2) * 24, cy = y - 8; c.fillStyle = col; c.beginPath(); rrect(c, cx - 10, cy - 6, 20, 11, 3); c.fill(); c.fillStyle = '#0b0d1c'; c.fillText(txt, cx, cy + 3); }); }
  if (CB.cur === u && u.alive) { const bob = Math.sin(CB.t * 6) * 3; c.fillStyle = u.team === 'hero' ? '#ffc53d' : '#ff5a5a'; c.strokeStyle = INK; c.lineWidth = 2; c.beginPath(); c.moveTo(f.x - 8, y - 26 + bob); c.lineTo(f.x + 8, y - 26 + bob); c.lineTo(f.x, y - 15 + bob); c.closePath(); c.fill(); c.stroke(); }
  c.restore();
}

/* preview markers: damage numbers, push arrows */
function cbDrawPreview(c) {
  const p = CB.prev; if (!p) return;
  c.save(); c.textAlign = 'center';
  p.tiles.forEach(tl => { const r = cbCell(tl.x, tl.y); c.strokeStyle = p.color; c.lineWidth = 2.5; c.setLineDash([5, 3]); c.lineDashOffset = -CB.t * 18; c.strokeRect(r.x + 3, r.y + 3, r.w - 6, r.h - 6); c.setLineDash([]); });
  p.units.forEach(pu => {
    const u = unitById(CB.B, pu.uid); if (!u || !u.vis) return; const f = cbFoot(u.vis.x, u.vis.y), s = spriteH() * u.size;
    const y = f.y - s * 1.02 - 24 - (u.look.kind === 'gator' ? -s * 0.5 : 0);
    let txt = '', col = '#fff', big = 17;
    if (pu.dmg) { txt = '-' + pu.dmg; col = pu.ally ? '#ff9a9a' : '#fff'; }
    if (pu.heal) { txt = '+' + pu.heal; col = '#8dffb2'; }
    if (pu.kill) txt = '☠ ' + txt;
    if (!txt && pu.note) { txt = pu.note; big = 13; col = '#ffd23f'; }
    if (txt) { c.font = '800 ' + big + 'px "Barlow Condensed", Impact, sans-serif'; c.lineWidth = 4; c.strokeStyle = pu.ally ? '#6a1020' : (pu.heal ? '#0b4a2a' : '#7a1020'); c.strokeText(txt, f.x, y); c.fillStyle = col; c.fillText(txt, f.x, y); }
    if (pu.flank) { c.font = '800 12px "Barlow Condensed", sans-serif'; c.fillStyle = '#ffc53d'; c.strokeStyle = INK; c.lineWidth = 3; c.strokeText('FLANK +40%', f.x, y - 17); c.fillText('FLANK +40%', f.x, y - 17); }
    if (pu.to) { const a = cbCenter(u.vis.x, u.vis.y), b = cbCenter(pu.to.x, pu.to.y); c.strokeStyle = '#ffc53d'; c.lineWidth = 3; c.setLineDash([6, 4]); c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke(); c.setLineDash([]); const ang = Math.atan2(b.y - a.y, b.x - a.x); c.fillStyle = '#ffc53d'; c.beginPath(); c.moveTo(b.x, b.y); c.lineTo(b.x - Math.cos(ang - 0.45) * 12, b.y - Math.sin(ang - 0.45) * 12); c.lineTo(b.x - Math.cos(ang + 0.45) * 12, b.y - Math.sin(ang + 0.45) * 12); c.closePath(); c.fill(); }
  });
  if (p.path) { c.strokeStyle = '#fff'; c.lineWidth = 3; c.setLineDash([4, 5]); c.beginPath(); p.path.forEach((q, i) => { const k = cbCenter(q.x, q.y); i ? c.lineTo(k.x, k.y) : c.moveTo(k.x, k.y); }); c.stroke(); c.setLineDash([]); }
  c.restore();
}

function cbDrawPart(c, p) {
  const k = clamp(p.life / p.max, 0, 1);
  c.save(); c.globalAlpha = p.kind === 'smoke' ? k * 0.55 : Math.min(1, k * 1.6);
  if (p.kind === 'dot') { c.fillStyle = p.color; c.beginPath(); c.arc(p.x, p.y, p.size * (0.4 + k * 0.6), 0, 7); c.fill(); }
  else if (p.kind === 'smoke') { c.fillStyle = p.color; c.beginPath(); c.arc(p.x, p.y, p.size * (1.6 - k * 0.6), 0, 7); c.fill(); }
  else if (p.kind === 'star') { c.translate(p.x, p.y); c.rotate(p.rot); c.fillStyle = p.color; c.strokeStyle = INK; c.lineWidth = 1.5; c.beginPath(); for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5, r = (i % 2 ? 0.45 : 1) * p.size * (0.5 + k * 0.5); c.lineTo(Math.cos(a) * r, Math.sin(a) * r); } c.closePath(); c.fill(); c.stroke(); }
  else if (p.kind === 'ring') { c.strokeStyle = p.color; c.lineWidth = 5 * k + 1; c.beginPath(); c.arc(p.x, p.y, p.size * (1 - k) + 6, 0, 7); c.stroke(); }
  else if (p.kind === 'fire') { c.fillStyle = p.color; c.beginPath(); c.arc(p.x, p.y, p.size * k + 2, 0, 7); c.fill(); }
  else if (p.kind === 'bolt') { c.strokeStyle = p.color; c.lineWidth = p.size; c.lineCap = 'round'; c.beginPath(); p.pts.forEach((q, i) => { i ? c.lineTo(q.x + (Math.random() - 0.5) * 6, q.y + (Math.random() - 0.5) * 6) : c.moveTo(q.x, q.y); }); c.stroke(); c.strokeStyle = '#fff'; c.lineWidth = p.size * 0.4; c.stroke(); }
  else if (p.kind === 'orb') { const pr = 1 - k; const px = lerp(p.x, p.x2, pr), py = lerp(p.y, p.y2, pr) - Math.sin(pr * Math.PI) * (p.arc || 0); c.fillStyle = p.color; c.shadowColor = p.color; c.shadowBlur = 14; c.beginPath(); c.arc(px, py, p.size, 0, 7); c.fill(); c.fillStyle = '#fff'; c.beginPath(); c.arc(px, py, p.size * 0.45, 0, 7); c.fill(); if (Math.random() < 0.6) cbPart({ x: px, y: py, vx: (Math.random() - 0.5) * 30, vy: (Math.random() - 0.5) * 30, size: p.size * 0.6, color: p.color, life: 0.25, kind: 'dot' }); }
  c.restore();
}
function cbDrawBurst(c, b) {
  const k = clamp(b.life / b.max, 0, 1), pr = 1 - k, sc = (pr < 0.2 ? ease.back(pr / 0.2) : 1) * b.scale * (k < 0.25 ? k / 0.25 : 1);
  c.save(); c.translate(b.x, b.y); c.rotate(b.rot); c.scale(sc, sc);
  const base = Math.max(34, CB.tw * 0.62);
  c.fillStyle = '#ffd23f'; c.strokeStyle = INK; c.lineWidth = 4; c.beginPath();
  for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8, r = (i % 2 ? 0.7 : 1.25) * base * (0.9 + 0.1 * Math.sin(i * 3.1)); c.lineTo(Math.cos(a) * r * 1.35, Math.sin(a) * r * 0.9); }
  c.closePath(); c.fill(); c.stroke();
  c.font = '900 ' + Math.round(base * 0.52) + 'px Bangers, Impact, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 7; c.strokeStyle = INK; c.strokeText(b.str, 0, 2); c.fillStyle = b.color === '#ffd23f' ? '#e8262d' : b.color; c.fillText(b.str, 0, 2);
  c.restore();
}
function cbDrawText(c, q) {
  const k = clamp(q.life / q.max, 0, 1), pop = k > 0.85 ? 1 + (k - 0.85) * 4 : 1;
  c.save(); c.globalAlpha = Math.min(1, k * 2.2); c.font = '800 ' + Math.round(q.size * pop) + 'px "Barlow Condensed", Impact, sans-serif'; c.textAlign = 'center'; c.lineWidth = 5; c.strokeStyle = q.stroke || INK; c.lineJoin = 'round';
  c.strokeText(q.str, q.x, q.y); c.fillStyle = q.color; c.fillText(q.str, q.x, q.y); c.restore();
}

/* =====================================================================
   EVENT PLAYBACK
   ===================================================================== */
const unitOf = uid => unitById(CB.B, uid);
function cbHead(u) { const f = cbFoot(u.vis.x, u.vis.y); return { x: f.x + u.vis.ox, y: f.y - spriteH() * u.size * 0.8 - u.vis.lift * CB.th }; }
function cbBody(u) { const f = cbFoot(u.vis.x, u.vis.y); return { x: f.x + u.vis.ox, y: f.y - spriteH() * u.size * 0.45 }; }
function cbFace(u, tx) { if (tx > u.vis.x + 0.01) u.vis.face = 1; else if (tx < u.vis.x - 0.01) u.vis.face = -1; }
const ABCOL = { anvil: '#ffd23f', skylark: '#7ee8ff', fuse: '#7df9ff', velvet: '#ff4dd2', bulwark: '#8dffb2', cinder: '#ff7a2a', hush: '#b69cff', boomer: '#ff9a3d', slush: '#bff0ff' };

async function cbPlay(evs) {
  const beats = new Map();
  evs.forEach(e => { if (!beats.has(e.b)) beats.set(e.b, []); beats.get(e.b).push(e); });
  const keys = Array.from(beats.keys()).sort((a, b) => a - b);
  for (const k of keys) {
    const list = beats.get(k);
    const ps = list.map(cbApply);
    await Promise.all(ps.map(p => (typeof p === 'number' ? cbWait(p) : p)));
  }
  cbSyncVis();
}
function cbApply(e) {
  const B = CB.B, u = e.u != null ? unitOf(e.u) : null;
  switch (e.t) {
    case 'cast': return cbCast(e, u);
    case 'hit': return cbHit(e, u);
    case 'heal': { if (!u) return 0; const p = cbHead(u); cbTween(300, k => { u.vis.hp = lerp(u.vis.hp, e.hp, k); }); cbText(p.x, p.y - 8, '+' + e.amt, '#8dffb2', 26, { stroke: '#0b4a2a' }); for (let i = 0; i < 8; i++) cbPart({ x: p.x + (Math.random() - 0.5) * 40, y: p.y + 30 + Math.random() * 40, vy: -60 - Math.random() * 40, size: 3 + Math.random() * 3, color: '#8dffb2', life: 0.7, kind: 'star', vr: 4 }); sfx('heal'); return 360; }
    case 'fx': return cbFxEvt(e, u);
    case 'die': {
      if (!u) return 0; const p = cbBody(u); sfx('ko'); cbStars(p.x, p.y, 8, '#fff'); cbSmoke(p.x, p.y + 20, 6);
      u.vis.pose = 'down'; if (u.team === 'hero') cbText(p.x, p.y - 40, 'K.O.!', '#ff6a6a', 30);
      cbTween(480, k => { u.vis.alpha = 1 - k; u.vis.oy = k * 14; u.vis.hp = 0; }); return 520;
    }
    case 'push': {
      if (!u) return 0; const path = e.path, per = e.pull ? 90 : 105; sfx('whoosh');
      cbTween(per * (path.length - 1), k => { const f = k * (path.length - 1), i = Math.min(path.length - 2, Math.floor(f)), r = f - i; u.vis.x = lerp(path[i].x, path[i + 1].x, r); u.vis.y = lerp(path[i].y, path[i + 1].y, r); if (Math.random() < 0.5) { const q = cbFoot(u.vis.x, u.vis.y); cbPart({ x: q.x, y: q.y - 4, vx: (Math.random() - 0.5) * 40, vy: -10, size: 5, color: 'rgba(210,210,230,.6)', life: 0.35, kind: 'smoke' }); } });
      return per * (path.length - 1) + 40;
    }
    case 'slam': { const p = cbCenter(e.x, e.y); cbBurst(p.x, p.y - 20, R.pick(ONOMA.slam), '#ffd23f', 1.0); cbShake(9); cbFreeze(0.07); sfx('slam'); cbStars(p.x, p.y, 8); return 300; }
    case 'boom': {
      const p = cbCenter(e.x, e.y), rad = e.r * CB.tw * 1.1 + CB.tw * 0.3; sfx(e.small ? 'hit' : 'boom'); cbShake(e.small ? 5 : 13); if (!e.small) CB.flashA = 0.35;
      for (let i = 0; i < (e.small ? 10 : 26); i++) { const a = Math.random() * 6.28, s = 60 + Math.random() * 260; cbPart({ x: p.x, y: p.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, g: 200, size: 10 + Math.random() * 14, color: ['#ffd23f', '#ff7a1a', '#ff3d2a'][i % 3], life: 0.55, kind: 'fire' }); }
      cbRing(p.x, p.y, '#ffd23f', rad, 0.5); cbSmoke(p.x, p.y, 8, 'rgba(60,50,60,.7)');
      if (!e.small) cbBurst(p.x, p.y - 24, R.pick(ONOMA.boom), '#ffd23f', 1.3);
      return e.small ? 240 : 440;
    }
    case 'chain': { const a = unitOf(e.from), b = unitOf(e.to); if (!a || !b) return 0; const pa = cbBody(a), pb = cbBody(b); sfx('zap'); cbPart({ kind: 'bolt', pts: [pa, { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 - 10 }, pb], size: 5, color: '#7df9ff', life: 0.25 }); return 150; }
    case 'move': return cbMoveEvt(e, u);
    case 'dash': {
      if (!u) return 0; const path = e.path; sfx('whoosh'); cbFace(u, path[path.length - 1].x); u.vis.pose = 'walk';
      return new Promise(res => cbTween(75 * (path.length - 1), k => { const f = k * (path.length - 1), i = Math.min(path.length - 2, Math.floor(f)), r = f - i; u.vis.x = lerp(path[i].x, path[i + 1].x, r); u.vis.y = lerp(path[i].y, path[i + 1].y, r); u.vis.pa = k * 3; const q = cbBody(u); cbPart({ x: q.x, y: q.y, vx: 0, vy: 0, size: 14, color: ABCOL[u.id] ? ABCOL[u.id] + '99' : 'rgba(255,255,255,.4)', life: 0.25, kind: 'smoke' }); }, () => { u.vis.pose = 'idle'; res(); }));
    }
    case 'blink': {
      if (!u) return 0; sfx('teleport'); const a = cbBody(u); cbSmoke(a.x, a.y, 8, 'rgba(120,80,160,.6)'); cbStars(a.x, a.y, 4, '#ff4dd2');
      return new Promise(res => { cbTween(160, k => { u.vis.alpha = 1 - k; }, () => { u.vis.x = e.to.x; u.vis.y = e.to.y; const b = cbBody(u); cbSmoke(b.x, b.y, 8, 'rgba(120,80,160,.6)'); cbTween(160, k => { u.vis.alpha = k; }, res); }); });
    }
    case 'swap': { const a = unitOf(e.ua), b = unitOf(e.ub); if (!a || !b) return 0; sfx('teleport'); return new Promise(res => cbTween(320, k => { const arc = Math.sin(k * Math.PI) * 0.6; a.vis.x = lerp(e.pa.x, e.pb.x, k); a.vis.y = lerp(e.pa.y, e.pb.y, k); a.vis.lift = arc; b.vis.x = lerp(e.pb.x, e.pa.x, k); b.vis.y = lerp(e.pb.y, e.pa.y, k); b.vis.lift = Math.sin(k * Math.PI) * 0.3; }, () => { a.vis.lift = 0; b.vis.lift = 0; res(); })); }
    case 'hz': {
      CB.hzVis = CB.hzVis.filter(z => !(z.x === e.x && z.y === e.y && z.type !== 'bomb' && e.type !== 'bomb')); CB.hzVis.push({ x: e.x, y: e.y, type: e.type, born: CB.t });
      const p = cbCenter(e.x, e.y); if (e.type === 'fire') { sfx('fire'); cbSparks(p.x, p.y, 8, ['#ffd23f', '#ff7a1a'], 160, 0.5); } else if (e.type === 'ice') { sfx('ice'); cbSparks(p.x, p.y, 8, ['#fff', '#bff0ff'], 160, 0.5); } else if (e.type === 'electric') cbSparks(p.x, p.y, 8, ['#7df9ff', '#fff6a0'], 200, 0.4);
      return 120;
    }
    case 'hzEnd': { const i = CB.hzVis.findIndex(z => z.x === e.x && z.y === e.y && z.type === e.type); if (i >= 0) CB.hzVis.splice(i, 1); return 0; }
    case 'obsAdd': { CB.obsVis.push({ id: e.o, x: e.x, y: e.y, type: e.type, hp: B.obs.find(o => o.id === e.o).hp, maxHp: 8, shake: 0, appear: 0 }); const o = CB.obsVis[CB.obsVis.length - 1]; cbTween(250, k => { o.appear = ease.back(k); }); const p = cbCenter(e.x, e.y); cbSmoke(p.x, p.y, 4); return 260; }
    case 'obsHit': { const o = CB.obsVis.find(x => x.id === e.o); if (o) { o.hp = e.hp; o.shake = 1; const p = cbCenter(o.x, o.y); cbSparks(p.x, p.y, 4, ['#d9b070', '#fff'], 160, 0.4); } return 0; }
    case 'obsDie': { const i = CB.obsVis.findIndex(x => x.id === e.o); if (i >= 0) CB.obsVis.splice(i, 1); const p = cbCenter(e.x, e.y); cbSparks(p.x, p.y, 12, e.type === 'car' ? ['#c9453c', '#aaa'] : ['#b88950', '#8a6030'], 260, 0.7); cbSmoke(p.x, p.y, 4); sfx('hit'); return 80; }
    case 'spawn': { if (!u) return 0; const p = cbBody(u); sfx('teleport'); cbSmoke(p.x, p.y, 8); cbTween(360, k => { u.vis.alpha = k; u.vis.lift = (1 - k) * 0.6; }); return 400; }
    case 'skip': { if (!u) return 0; const p = cbHead(u); cbText(p.x, p.y, 'FROZEN SOLID!', '#bff0ff', 24); sfx('ice'); return 500; }
    case 'radio': { cbBanner(e.kind === 'medevac' ? 'MEDEVAC INBOUND' : e.kind === 'pep' ? 'PEP TALK' : 'ROADBLOCK!', 900); sfx('radio'); return 600; }
    default: return 0;
  }
}
function cbMoveEvt(e, u) {
  if (!u) return 0; const path = e.path; if (path.length < 2) return 0;
  const per = 130; sfx('hop'); cbFace(u, path[path.length - 1].x); u.vis.pose = 'walk';
  return new Promise(res => cbTween(per * (path.length - 1), k => {
    const f = k * (path.length - 1), i = Math.min(path.length - 2, Math.floor(f)), r = f - i;
    u.vis.x = lerp(path[i].x, path[i + 1].x, r); u.vis.y = lerp(path[i].y, path[i + 1].y, r); u.vis.pa = f / 2;
    if (path[i + 1].x !== path[i].x) u.vis.face = path[i + 1].x > path[i].x ? 1 : -1;
  }, () => { u.vis.pose = 'idle'; u.vis.pa = 0; res(); }));
}
function cbCast(e, u) {
  if (!u) return 0; const tgt = e.tgt; if (tgt) cbFace(u, tgt.x);
  const hero = u.team === 'hero', col = (hero && ABCOL[u.id]) || '#ff8a5a';
  const ab = u.kit.find(a => a.id === e.ab) || {};
  const doCast = () => {
    u.vis.pose = (ab.tgt === 'self' || ab.tgt === 'ally' || ab.tgt === 'none' || ab.tgt === 'row' || ab.ult) ? 'cast' : 'attack'; u.vis.pa = 0;
    cbTween(280, k => { u.vis.pa = k; }, () => { if (u.vis.pose === 'attack' || u.vis.pose === 'cast') { u.vis.pose = 'idle'; u.vis.pa = 0; } });
    const from = cbBody(u); let dur = 300;
    if (e.tgt && e.proj && tgt) {
      const to = cbCenter(tgt.x, tgt.y); to.y -= CB.th * 0.3; const lob = ab.tgt === 'tile';
      cbPart({ kind: 'orb', x: from.x + u.vis.face * 20, y: from.y, x2: to.x, y2: to.y, size: 7, color: col, life: 0.26, arc: lob ? 50 : 0 }); sfx(ab.tgt === 'tile' && ab.area !== 'one' ? 'whoosh' : (ab.id === 'zap' ? 'zap' : 'shoot')); dur = 300;
    } else if (ab.tgt === 'self' && ab.dmg) { cbRing(from.x, from.y + 20, col, CB.tw * ((ab.ar || 1) + 0.6), 0.45); sfx('whoosh'); cbShake(3); }
    else if (ab.tgt === 'ally' || ab.heal || ab.fx && ab.side === 'ally') { cbRing(from.x, from.y, '#8dffb2', 70, 0.4); sfx('shield'); }
    else if (ab.tgt === 'row') { sfx('zap'); const y = e.tgt.y; for (let x = 0; x < BW; x++) { const p = cbCenter(x, y); cbPart({ kind: 'bolt', pts: [{ x: p.x - CB.tw * 0.5, y: p.y - 30 }, { x: p.x, y: p.y }, { x: p.x + CB.tw * 0.5, y: p.y - 30 }], size: 4, color: '#7df9ff', life: 0.35 }); } cbShake(5); }
    else if (ab.tgt === 'adj' || ab.tgt === 'cone') { sfx('whoosh'); }
    if (ab.hz === 'fire' || ab.id === 'bolt') sfx('fire');
    return dur;
  };
  if (e.ult) {
    const info = { hero: u, ab };
    return cbCutin(u, ab).then(() => { cbShake(4); sfx('ult'); CB.flashA = 0.5; return cbWait(doCast()); });
  }
  if (u.team === 'foe' && ab.name) { const p = cbHead(u); cbText(p.x, p.y - 16, ab.name, '#ffd0d0', 18, { life: 0.9, max: 0.9 }); }
  return doCast();
}
function cbHit(e, u) {
  if (!u) return 0; const p = cbBody(u), head = cbHead(u);
  const isDot = e.kind === 'burn' || e.kind === 'toxic' || e.kind === 'fire' || e.kind === 'zap';
  cbTween(260, k => { u.vis.hp = lerp(u.vis.hp, e.hp, Math.min(1, k * 1.6)); }); u.vis.shield = e.shield;
  u.vis.flash = 1; u.vis.pose = 'hurt'; u.vis.pa = 0; if (u.team === 'hero') u.vis.hype = u.hype;
  const big = e.dmg >= 14 || e.crit;
  const col = u.team === 'hero' ? '#ff9a9a' : '#fff';
  cbText(head.x + (Math.random() - 0.5) * 14, head.y - 6, (e.crit ? 'CRIT ' : '') + '-' + e.dmg, e.crit ? '#ffd23f' : col, e.crit ? 34 : big ? 28 : 22, { stroke: e.crit ? '#7a3a00' : '#7a1020' });
  if (e.absorbed) cbText(head.x + 22, head.y + 10, '(' + e.absorbed + ' blocked)', '#7ee8ff', 14);
  if (e.flank) cbText(head.x, head.y - 30, 'FLANK!', '#ffc53d', 20);
  cbSparks(p.x, p.y, e.crit ? 14 : 8, e.kind === 'fire' || e.kind === 'burn' ? ['#ffd23f', '#ff7a1a'] : ['#fff', '#ffd23f', '#ff8a5a'], e.crit ? 340 : 240, 0.45);
  if (!isDot && e.kind !== 'slam' && e.kind !== 'boom') { if (big) cbBurst(p.x, p.y - 18, e.crit ? R.pick(ONOMA.crit) : R.pick(ONOMA.hit), '#ffd23f', e.crit ? 1.25 : 1); cbShake(e.crit ? 8 : big ? 5 : 2); }
  if (e.crit) cbFreeze(0.08);
  sfx(e.crit ? 'crit' : e.kind === 'zap' ? 'zap' : e.kind === 'fire' || e.kind === 'burn' ? 'fire' : 'hit');
  return 340;
}
function cbFxEvt(e, u) {
  if (!u) return 0; const p = cbHead(u); const map = { burn: ['BURNING!', '#ff7a2a'], delay: ['DELAYED!', '#ffd23f'], haste: ['HASTE!', '#7ee8ff'], mark: ['MARKED!', '#ff4d8d'], rally: ['RALLIED!', '#ffc53d'], shield: ['SHIELDED', '#7ee8ff'], freeze: ['FROZEN!', '#bff0ff'], cdr: ['COOLDOWNS!', '#a98bff'], hype: ['+HYPE', '#ffc53d'], cleanse: ['CLEANSED', '#8dffb2'], extra: ['EXTRA TURN!', '#ffc53d'] };
  const m = map[e.k]; if (!m) return 0;
  cbText(p.x, p.y - 14, m[0], m[1], 17, { life: 0.9, max: 0.9 });
  if (e.k === 'shield') { sfx('shield'); const q = cbBody(u); cbRing(q.x, q.y, '#7ee8ff', 50, 0.4); u.vis.shield = e.shield; }
  if (e.k === 'freeze') { sfx('ice'); const q = cbBody(u); cbSparks(q.x, q.y, 10, ['#fff', '#bff0ff'], 180, 0.5); }
  if (e.k === 'burn') sfx('fire');
  return e.k === 'extra' ? 400 : 160;
}

/* ---------- overlays DOM: banner + cut-in ---------- */
function cbBanner(text, ms, cls) {
  const el = $('#cb-banner'); if (!el) return;
  el.className = 'cb-banner ' + (cls || ''); el.textContent = text; void el.offsetWidth; el.classList.add('show');
  clearTimeout(cbBanner.t); cbBanner.t = setTimeout(() => el.classList.remove('show'), ms || 1000);
}
function cbCutin(u, ab) {
  return new Promise(res => {
    const root = $('#cb-cutin'); root.innerHTML = '';
    const col = u.look.accent || '#ffc53d';
    const img = portraitImg(u.look, 300, 360, 'shout', 'ci-img');
    root.append(h('div.ci-band', { style: { '--c': col } }), h('div.ci-who', img, h('div.ci-txt', h('small', u.name), h('b', ab.name), h('em', 'ULTIMATE'))));
    root.className = 'cb-cutin show'; sfx('ult');
    CB.dim = 1;
    setTimeout(() => { root.className = 'cb-cutin'; CB.dim = 0; res(); }, cbMs(prefersReducedMotion() ? 400 : 1000));
  });
}
