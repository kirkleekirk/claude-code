/* ART */
// 2D cartoon art for the menus: character portraits (Finn, Jake, BMO...) and landscape icons.
// Card art comes from the 3D models (Scene.cardArtURL).
var Art = (function () {
'use strict';

// ------------------------------------------------------------------ LANDSCAPE ICONS (vector, for felt + UI)
function landIcon(x, type, cx, cy, r, color, alpha) {
  x.save(); x.translate(cx, cy); x.scale(r / 10, r / 10);
  x.globalAlpha = alpha == null ? 1 : alpha;
  x.fillStyle = color; x.strokeStyle = color; x.lineWidth = 1.8; x.lineCap = 'round'; x.lineJoin = 'round';
  x.beginPath();
  if (type === 'corn') { x.ellipse(0, 1, 3.6, 7.5, 0, 0, 7); x.fill(); x.beginPath(); x.moveTo(-1, 8); x.quadraticCurveTo(-8, 4, -7, -3); x.moveTo(1, 8); x.quadraticCurveTo(8, 4, 7, -3); x.stroke(); }
  else if (type === 'blue') { x.moveTo(-8, 7); x.quadraticCurveTo(-6, -2, -2, -8); x.moveTo(-2, 8); x.quadraticCurveTo(0, 0, 1, -9); x.moveTo(4, 8); x.quadraticCurveTo(6, 0, 9, -5); x.stroke(); }
  else if (type === 'swamp') { x.arc(-3, 3, 4.5, 0, 7); x.moveTo(7.5, -3); x.arc(4.5, -3, 3, 0, 7); x.moveTo(4, -8); x.arc(2.5, -8.5, 1.6, 0, 7); x.stroke(); }
  else if (type === 'ice') { for (let i = 0; i < 3; i++) { const a = i * Math.PI / 3; x.moveTo(Math.cos(a) * 9, Math.sin(a) * 9); x.lineTo(-Math.cos(a) * 9, -Math.sin(a) * 9); } x.stroke(); x.beginPath(); x.arc(0, 0, 2.2, 0, 7); x.fill(); }
  else if (type === 'nice') { x.moveTo(0, 8); x.bezierCurveTo(-11, 0, -7, -9, 0, -4); x.bezierCurveTo(7, -9, 11, 0, 0, 8); x.fill(); }
  else if (type === 'lava') { x.moveTo(-6, 8); x.quadraticCurveTo(-9, -1, -2, -4); x.quadraticCurveTo(-3, -8, 1, -10); x.quadraticCurveTo(2, -4, 5, -5); x.quadraticCurveTo(9, 1, 6, 8); x.closePath(); x.fill(); }
  else { x.lineWidth = 2.4; x.arc(0, 6, 9, Math.PI, 0); x.stroke(); x.beginPath(); x.arc(0, 6, 4.5, Math.PI, 0); x.stroke(); }
  x.restore();
}

// ------------------------------------------------------------------ PORTRAITS (full colour)
const P = {};
function circ(x, cx, cy, r, f, s, lw) { x.beginPath(); x.arc(cx, cy, r, 0, 7); if (f) { x.fillStyle = f; x.fill(); } if (s) { x.strokeStyle = s; x.lineWidth = lw || 2; x.stroke(); } }
function ell(x, cx, cy, rx, ry, f, rot) { x.beginPath(); x.ellipse(cx, cy, rx, ry, rot || 0, 0, 7); x.fillStyle = f; x.fill(); }
function pth(x, d, f, s, lw) { const p = new Path2D(d); if (f) { x.fillStyle = f; x.fill(p); } if (s) { x.strokeStyle = s; x.lineWidth = lw || 2; x.stroke(p); } }
function eyes(x, y, gap, r, c) { circ(x, 50 - gap, y, r, c || '#111'); circ(x, 50 + gap, y, r, c || '#111'); }
const INK = '#1b1424';
P.finn = x => {
  pth(x, 'M14 100 Q14 70 50 66 Q86 70 86 100 Z', '#35a6e8', INK, 2.5);
  pth(x, 'M20 64 Q16 22 50 18 Q84 22 80 64 Q80 82 50 84 Q20 82 20 64 Z', '#f7f4ee', INK, 2.5);
  pth(x, 'M24 30 L22 8 L36 22 Z', '#f7f4ee', INK, 2.5); pth(x, 'M76 30 L78 8 L64 22 Z', '#f7f4ee', INK, 2.5);
  pth(x, 'M30 40 Q30 34 50 34 Q70 34 70 40 L70 64 Q70 76 50 76 Q30 76 30 64 Z', '#ffd9b8', INK, 2);
  eyes(x, 52, 8, 2.8); pth(x, 'M38 62 Q50 72 62 62 Q50 66 38 62 Z', '#fff', INK, 1.6);
};
P.fionna = x => {
  pth(x, 'M14 100 Q14 70 50 66 Q86 70 86 100 Z', '#5b9be8', INK, 2.5);
  pth(x, 'M20 64 Q16 22 50 18 Q84 22 80 64 Q80 82 50 84 Q20 82 20 64 Z', '#f7f4ee', INK, 2.5);
  pth(x, 'M26 28 Q18 2 32 4 Q38 16 36 24 Z', '#f7f4ee', INK, 2.5); pth(x, 'M74 28 Q82 2 68 4 Q62 16 64 24 Z', '#f7f4ee', INK, 2.5);
  pth(x, 'M30 40 Q30 34 50 34 Q70 34 70 40 L70 64 Q70 76 50 76 Q30 76 30 64 Z', '#ffd9b8', INK, 2);
  pth(x, 'M30 40 Q40 46 46 36 Q54 44 70 40 L70 34 L30 34 Z', '#ffe25c', INK, 1.5);
  eyes(x, 54, 8, 2.8); pth(x, 'M40 64 Q50 70 60 64', null, INK, 2);
};
P.jake = x => {
  pth(x, 'M10 100 Q12 64 50 60 Q88 64 90 100 Z', '#f6b532', INK, 2.5);
  pth(x, 'M16 52 Q14 16 50 14 Q86 16 84 52 Q84 70 50 72 Q16 70 16 52 Z', '#f6b532', INK, 2.5);
  pth(x, 'M18 34 Q4 40 10 62 Q20 56 22 44 Z', '#dd9320', INK, 2); pth(x, 'M82 34 Q96 40 90 62 Q80 56 78 44 Z', '#dd9320', INK, 2);
  ell(x, 50, 56, 18, 12, '#f8c860'); circ(x, 50, 47, 5, INK);
  circ(x, 36, 38, 7, '#fff', INK, 2); circ(x, 64, 38, 7, '#fff', INK, 2); circ(x, 37, 39, 3, INK); circ(x, 63, 39, 3, INK);
  pth(x, 'M38 60 Q50 70 62 60', null, INK, 2.2);
};
P.marceline = x => {
  pth(x, 'M8 100 Q4 30 50 10 Q96 30 92 100 Z', '#1d1a2b', INK, 2);
  pth(x, 'M14 100 Q16 74 50 70 Q84 74 86 100 Z', '#7a2236', INK, 2);
  pth(x, 'M28 50 Q28 26 50 24 Q72 26 72 50 Q72 72 50 74 Q28 72 28 50 Z', '#b6c0d0', INK, 2);
  pth(x, 'M28 40 Q40 26 64 30 Q56 22 44 22 Q30 26 28 40 Z', '#1d1a2b');
  eyes(x, 50, 9, 2.6); pth(x, 'M42 62 Q50 66 58 62', null, INK, 2); pth(x, 'M44 62 L45 67 L46 62 Z M54 62 L55 67 L56 62 Z', '#fff', INK, 1);
};
P.iceking = x => {
  pth(x, 'M10 100 Q14 70 50 66 Q86 70 90 100 Z', '#2f4fbf', INK, 2.5);
  pth(x, 'M26 46 Q24 22 50 20 Q76 22 74 46 Q74 60 50 62 Q26 60 26 46 Z', '#7fb5ff', INK, 2);
  pth(x, 'M24 50 Q18 96 50 100 Q82 96 76 50 Q64 62 50 58 Q36 62 24 50 Z', '#f6f8ff', INK, 2);
  pth(x, 'M42 44 Q38 58 46 60 Q54 58 52 44 Z', '#a9cbff', INK, 1.8);
  eyes(x, 40, 9, 2.4); pth(x, 'M36 34 L46 36 M54 36 L64 34', null, '#fff', 3);
  pth(x, 'M26 26 L28 6 L38 18 L50 0 L62 18 L72 6 L74 26 Z', '#f7d038', INK, 2); circ(x, 50, 16, 3.4, '#e33'); circ(x, 36, 20, 2.6, '#e33'); circ(x, 64, 20, 2.6, '#e33');
};
P.pb = x => {
  pth(x, 'M10 100 Q4 30 50 14 Q96 30 90 100 Q72 86 50 90 Q28 86 10 100 Z', '#ff79c6', INK, 2.5);
  pth(x, 'M28 52 Q28 30 50 28 Q72 30 72 52 Q72 74 50 76 Q28 74 28 52 Z', '#ffc4e1', INK, 2);
  pth(x, 'M28 44 Q34 26 50 28 Q66 26 72 44 Q62 34 50 36 Q38 34 28 44 Z', '#ff79c6');
  eyes(x, 52, 8, 2.6); pth(x, 'M43 64 Q50 69 57 64', null, INK, 2);
  pth(x, 'M38 26 L40 12 L45 19 L50 8 L55 19 L60 12 L62 26 Z', '#f7d038', INK, 2); circ(x, 50, 19, 2.6, '#3ac0ff');
};
P.fp = x => {
  pth(x, 'M14 100 Q12 40 30 24 Q34 4 44 18 Q50 0 56 18 Q66 4 70 24 Q88 40 86 100 Z', '#ff7a2b', '#ffd23f', 2.5);
  pth(x, 'M28 56 Q28 32 50 30 Q72 32 72 56 Q72 78 50 80 Q28 78 28 56 Z', '#ffa040', INK, 2);
  pth(x, 'M50 34 L54 40 L50 46 L46 40 Z', '#2ad16b', INK, 1.4);
  eyes(x, 56, 8, 2.6); pth(x, 'M43 68 Q50 72 57 68', null, INK, 2);
};
P.bmo = x => {
  pth(x, 'M18 12 L82 12 Q88 12 88 18 L88 94 Q88 98 84 98 L16 98 Q12 98 12 94 L12 18 Q12 12 18 12 Z', '#5fc9b0', INK, 2.5);
  pth(x, 'M22 20 L78 20 L78 58 L22 58 Z', '#b8f2d8', INK, 2);
  eyes(x, 36, 10, 2.6); pth(x, 'M40 46 Q50 54 60 46', null, INK, 2.2);
  pth(x, 'M26 72 L36 72 M31 67 L31 77', null, '#ffe14f', 4); circ(x, 66, 72, 4, '#3a7bf0'); circ(x, 74, 80, 4, '#e8434f'); pth(x, 'M44 88 L56 88', null, INK, 3);
};
P.treetrunks = x => {
  pth(x, 'M14 100 Q14 66 50 62 Q86 66 86 100 Z', '#7bd36a', INK, 2.5);
  ell(x, 22, 42, 14, 20, '#86dc74'); ell(x, 78, 42, 14, 20, '#86dc74');
  pth(x, 'M26 46 Q24 18 50 16 Q76 18 74 46 Q74 66 50 68 Q26 66 26 46 Z', '#94e682', INK, 2);
  pth(x, 'M44 52 Q42 76 52 88 Q58 84 52 74 Q54 62 56 52 Z', '#94e682', INK, 2);
  eyes(x, 40, 9, 2.4); circ(x, 32, 54, 4, '#f6a2b0');
};
P.cinnamonbun = x => {
  circ(x, 50, 54, 40, '#e0a15c', INK, 2.5);
  pth(x, 'M50 54 Q60 50 58 62 Q48 72 38 60 Q36 44 54 40 Q74 40 76 60 Q74 84 50 86', null, '#9b5a24', 4);
  pth(x, 'M16 40 Q30 14 50 16 Q70 14 84 40 Q74 32 66 42 Q60 30 50 40 Q42 30 34 42 Q26 32 16 40 Z', '#fff7ea', INK, 2);
  circ(x, 40, 50, 4.5, '#fff', INK, 1.5); circ(x, 62, 50, 4.5, '#fff', INK, 1.5); circ(x, 41, 51, 2, INK); circ(x, 61, 51, 2, INK);
};
P.gunter = x => {
  ell(x, 50, 58, 34, 40, '#1f2433'); ell(x, 50, 66, 22, 30, '#f4f6fb');
  circ(x, 40, 42, 6, '#fff'); circ(x, 60, 42, 6, '#fff'); circ(x, 41, 43, 2.8, INK); circ(x, 59, 43, 2.8, INK);
  pth(x, 'M42 50 L58 50 L50 62 Z', '#ffb02e', INK, 1.5);
};
P.lemongrab = x => {
  pth(x, 'M16 100 Q16 72 50 68 Q84 72 84 100 Z', '#2b2b60', INK, 2.5);
  pth(x, 'M50 4 Q74 16 76 44 Q76 66 50 70 Q24 66 24 44 Q26 16 50 4 Z', '#f5e44b', INK, 2.5);
  circ(x, 40, 38, 3, INK); circ(x, 60, 38, 3, INK); pth(x, 'M34 32 L46 36 M66 32 L54 36', null, INK, 3);
  pth(x, 'M36 54 Q50 46 64 54 Q50 62 36 54 Z', '#7b2020', INK, 2);
};
P.lsp = x => {
  pth(x, 'M14 70 Q2 54 16 40 Q10 20 32 18 Q40 4 58 12 Q78 6 84 24 Q100 32 90 52 Q100 70 82 78 Q76 96 54 90 Q36 100 24 86 Q6 86 14 70 Z', '#b07ee8', INK, 2.5);
  circ(x, 38, 46, 3, INK); circ(x, 62, 46, 3, INK); pth(x, 'M40 62 Q50 56 60 62', null, INK, 2.2);
  pth(x, 'M50 18 L53 26 L61 26 L55 31 L57 39 L50 34 L43 39 L45 31 L39 26 L47 26 Z', '#ffe25c', INK, 1.4);
};
function portrait(id, size) {
  const c = document.createElement('canvas'); c.width = size; c.height = size;
  const x = c.getContext('2d'); x.scale(size / 100, size / 100);
  (P[id] || P.finn)(x);
  return c;
}
const pCache = {};
function portraitURL(id, size) { const k = id + size; if (!pCache[k]) pCache[k] = portrait(id, size).toDataURL(); return pCache[k]; }

return { landIcon, portrait, portraitURL, P };
})();
/* END ART */
