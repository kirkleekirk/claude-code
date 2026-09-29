import * as THREE from 'three';

// Faces for the avatar heads, painted on a canvas: our own eyes, brows, mouths and
// marks, laid out on the head's face UVs (the middle of the face is u = 0.5).
// Everything off the face is transparent, so the head's skin colour shows through.
//
// face: { eyes, iris, brows, browColor, mouth, lips, nose, marks: [...], dead }
//   eyes:  'round' | 'almond' | 'sleepy' | 'wide' | 'narrow' | 'hooded'
//   brows: 'soft' | 'straight' | 'arched' | 'thick' | 'heavy' | 'worried' | 'none'
//   mouth: 'smile' | 'flat' | 'smirk' | 'frown' | 'grin' | 'open' | 'snarl' | 'slack'
//   marks: 'freckles' | 'stubble' | 'beard' | 'moustache' | 'scar' | 'blush' | 'bags' | 'wrinkles' | 'blood' | 'veins' | 'rot'

const S = 256;
// where things sit on the face (fractions of the texture), tuned against the head mesh
export const FACE = { eyeY: 0.535, eyeDX: 0.105, browY: 0.47, noseY: 0.64, mouthY: 0.74, jawY: 0.86 };

const cache = new Map();

export function faceTexture(face, talk = false) {
  const key = JSON.stringify(face) + (talk ? '|t' : '');
  let t = cache.get(key);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  paint(g, face, talk);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = false;
  t.anisotropy = 4;
  cache.set(key, t);
  return t;
}

const X = (u) => u * S, Y = (v) => v * S;

function paint(g, f, talk) {
  g.clearRect(0, 0, S, S);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const marks = f.marks || [];
  // under everything: shading and skin marks
  if (marks.includes('rot')) blotches(g, 'rgba(60,70,40,0.35)', 14, 0.3, 0.95);
  if (marks.includes('veins')) veins(g);
  if (marks.includes('blush')) for (const s of [-1, 1]) soft(g, 0.5 + s * 0.13, 0.66, 18, 'rgba(210,90,90,0.35)');
  if (marks.includes('bags')) for (const s of [-1, 1]) arc(g, 0.5 + s * FACE.eyeDX, FACE.eyeY + 0.045, 0.04, 0.2, Math.PI - 0.2, 'rgba(80,50,50,0.45)', 2.2);
  if (marks.includes('wrinkles')) for (const s of [-1, 1]) { line(g, 0.5 + s * 0.17, 0.52, 0.5 + s * 0.19, 0.55, 'rgba(70,45,35,0.4)', 1.6); line(g, 0.5 + s * 0.05, 0.69, 0.5 + s * 0.08, 0.76, 'rgba(70,45,35,0.35)', 1.6); }
  if (marks.includes('stubble')) stipple(g, 0.34, 0.66, 0.66, 0.96, 'rgba(40,30,25,0.45)', 900, true);
  if (marks.includes('beard')) beard(g, f.beardColor || f.browColor || '#3a2a1e');
  if (marks.includes('freckles')) stipple(g, 0.36, 0.58, 0.64, 0.7, 'rgba(120,70,40,0.6)', 60, false, 1.6);
  if (marks.includes('scar')) { line(g, 0.62, 0.45, 0.67, 0.62, 'rgba(120,50,50,0.8)', 2.4); for (let i = 0; i < 4; i++) line(g, 0.62 + i * 0.013 - 0.01, 0.48 + i * 0.035, 0.62 + i * 0.013 + 0.012, 0.47 + i * 0.035, 'rgba(120,50,50,0.7)', 1.2); }
  // nose: a soft shadow and two small nostril marks
  const nose = f.nose || 'soft';
  soft(g, 0.5, FACE.noseY - 0.015, 12, 'rgba(90,50,40,0.18)');
  if (nose !== 'none') for (const s of [-1, 1]) dot(g, 0.5 + s * 0.018, FACE.noseY + 0.012, nose === 'wide' ? 2.8 : 2.1, 'rgba(70,35,30,0.55)');
  // eyes and brows, mirrored
  for (const s of [-1, 1]) {
    eye(g, 0.5 + s * FACE.eyeDX, FACE.eyeY, s, f);
    brow(g, 0.5 + s * FACE.eyeDX, FACE.browY, s, f.brows || 'soft', f.browColor || '#3a2a1e');
  }
  mouth(g, 0.5, FACE.mouthY, talk ? 'open' : f.mouth || 'flat', f);
  if (marks.includes('moustache')) moustache(g, f.beardColor || f.browColor || '#3a2a1e');
  if (marks.includes('blood')) { blotches(g, 'rgba(110,10,10,0.75)', 5, 0.7, 0.95); line(g, 0.46, 0.8, 0.44, 0.93, 'rgba(110,10,10,0.8)', 3); line(g, 0.55, 0.8, 0.56, 0.9, 'rgba(110,10,10,0.8)', 2.5); }
}

function eye(g, cx, cy, side, f) {
  const shape = f.eyes || 'round';
  const dims = { round: [0.052, 0.05], almond: [0.058, 0.038], sleepy: [0.055, 0.03], wide: [0.058, 0.058], narrow: [0.06, 0.022], hooded: [0.056, 0.034] }[shape] || [0.052, 0.05];
  const [rx, ry] = [X(dims[0]), Y(dims[1])];
  const x = X(cx), y = Y(cy);
  g.save();
  // the white, tilted a touch up at the outer corner for almond eyes
  g.translate(x, y);
  if (shape === 'almond') g.rotate(side * -0.12);
  g.beginPath();
  g.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  g.fillStyle = f.dead ? '#cfd3b8' : '#f7f4ee';
  g.fill();
  g.clip();
  // iris and pupil: set a little inward, looking at you
  if (!f.dead || f.dead === 'pupils') {
    const ir = Math.min(rx, ry * 1.25) * 0.72;
    g.beginPath(); g.arc(-side * 1.2, ry * 0.08, ir, 0, Math.PI * 2); g.fillStyle = f.iris || '#4a3526'; g.fill();
    g.beginPath(); g.arc(-side * 1.2, ry * 0.08, ir * 0.62, 0, Math.PI * 2); g.fillStyle = shade(f.iris || '#4a3526', -0.35); g.fill();
    g.beginPath(); g.arc(-side * 1.2, ry * 0.08, ir * 0.38, 0, Math.PI * 2); g.fillStyle = '#0c0a0a'; g.fill();
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.fillRect(-side * 1.2 - ir * 0.55, ry * 0.08 - ir * 0.6, ir * 0.42, ir * 0.42);
  } else {
    // milky, sightless
    g.beginPath(); g.arc(0, ry * 0.1, Math.min(rx, ry) * 0.5, 0, Math.PI * 2); g.fillStyle = 'rgba(200,205,190,0.9)'; g.fill();
  }
  // upper lid: a heavy line, lower for sleepy and hooded eyes
  const lid = shape === 'sleepy' ? 0.35 : shape === 'hooded' ? 0.2 : 0;
  if (lid) { g.fillStyle = f.lidColor || 'rgba(0,0,0,0)'; }
  g.restore();
  g.save();
  g.translate(x, y);
  if (shape === 'almond') g.rotate(side * -0.12);
  if (lid) {
    g.beginPath();
    g.ellipse(0, -ry * (1 - lid * 2), rx * 1.05, ry * lid * 2.2, 0, Math.PI, 0);
    g.fillStyle = f.skinDark || 'rgba(120,80,60,0.9)';
    g.fill();
  }
  g.strokeStyle = f.dead ? '#3a1818' : '#1e1410';
  g.lineWidth = f.dead ? 3 : 3.2;
  g.beginPath();
  g.ellipse(0, lid ? -ry * (1 - lid * 2) + ry * lid * 2 * 0.2 : 0, rx * 1.02, ry * (lid ? 0.9 : 1.0), 0, Math.PI * 1.08, Math.PI * 1.92 + (side > 0 ? 0.25 : 0), false);
  g.stroke();
  // outer lash flick
  g.beginPath();
  g.moveTo(side * rx * 0.95, -ry * 0.35);
  g.lineTo(side * (rx + 5), -ry * 0.75);
  g.lineWidth = 2.4;
  g.stroke();
  // lower lid hint
  g.strokeStyle = 'rgba(40,25,20,0.35)';
  g.lineWidth = 1.4;
  g.beginPath();
  g.ellipse(0, 0, rx * 0.9, ry * 1.02, 0, Math.PI * 0.2, Math.PI * 0.8);
  g.stroke();
  if (f.dead) {
    // dark, sunken sockets
    g.globalCompositeOperation = 'destination-over';
    g.beginPath(); g.ellipse(0, 1, rx * 1.55, ry * 1.7, 0, 0, Math.PI * 2); g.fillStyle = 'rgba(40,20,25,0.55)'; g.fill();
    g.globalCompositeOperation = 'source-over';
  }
  g.restore();
}

function brow(g, cx, cy, side, style, color) {
  if (style === 'none') return;
  const x = X(cx), y = Y(cy);
  const w = X(0.075);
  const thick = { soft: 3.5, straight: 4, arched: 3.4, thick: 6.5, heavy: 8, worried: 4, angry: 5.5 }[style] || 4;
  g.strokeStyle = color;
  g.lineWidth = thick;
  g.beginPath();
  const inner = x - side * w * 0.5, outer = x + side * w * 0.55;
  if (style === 'arched') { g.moveTo(inner, y + 2); g.quadraticCurveTo(x + side * w * 0.15, y - 8, outer, y + 3); }
  else if (style === 'worried') { g.moveTo(inner, y - 4); g.quadraticCurveTo(x, y - 3, outer, y + 3); }
  else if (style === 'angry' || style === 'heavy') { g.moveTo(inner, y + 4); g.quadraticCurveTo(x, y - 1, outer, y - 2); }
  else if (style === 'straight') { g.moveTo(inner, y); g.lineTo(outer, y - 1); }
  else { g.moveTo(inner, y + 1); g.quadraticCurveTo(x, y - 5, outer, y + 1); }
  g.stroke();
}

function mouth(g, cx, cy, style, f) {
  const x = X(cx), y = Y(cy);
  const w = X(0.07);
  const lips = f.lips || 'rgba(150,70,70,0.9)';
  g.strokeStyle = '#3a1a18';
  g.lineWidth = 3;
  g.beginPath();
  switch (style) {
    case 'smile': g.moveTo(x - w, y - 2); g.quadraticCurveTo(x, y + 9, x + w, y - 2); g.stroke(); break;
    case 'smirk': g.moveTo(x - w * 0.8, y + 1); g.quadraticCurveTo(x, y + 4, x + w, y - 4); g.stroke(); break;
    case 'frown': g.moveTo(x - w * 0.85, y + 3); g.quadraticCurveTo(x, y - 4, x + w * 0.85, y + 3); g.stroke(); break;
    case 'grin': {
      g.moveTo(x - w, y - 3); g.quadraticCurveTo(x, y + 12, x + w, y - 3); g.closePath();
      g.fillStyle = '#2a0f0f'; g.fill(); g.stroke();
      g.save(); g.clip(); g.fillStyle = '#f2eee2'; g.fillRect(x - w, y - 4, w * 2, 5); g.restore();
      break;
    }
    case 'open': {
      g.ellipse(x, y + 2, w * 0.55, 7, 0, 0, Math.PI * 2);
      g.fillStyle = '#2a0f0f'; g.fill(); g.stroke();
      g.save(); g.clip(); g.fillStyle = '#f2eee2'; g.fillRect(x - w * 0.5, y - 6, w, 4); g.fillStyle = '#9a4040'; g.beginPath(); g.ellipse(x, y + 8, w * 0.35, 4, 0, 0, Math.PI * 2); g.fill(); g.restore();
      break;
    }
    case 'snarl': case 'slack': {
      // the dead: a gaping, ragged hole
      const h = style === 'snarl' ? 13 : 10;
      g.moveTo(x - w * 0.8, y - 3);
      for (let i = 0; i <= 6; i++) g.lineTo(x - w * 0.8 + (i / 6) * w * 1.6, y - 3 + (i % 2 ? -2 : 1));
      g.quadraticCurveTo(x + w * 0.3, y + h, x - w * 0.8, y - 3);
      g.fillStyle = '#1a0606'; g.fill();
      g.strokeStyle = '#4a1010'; g.lineWidth = 2.2; g.stroke();
      g.save(); g.clip(); g.fillStyle = '#c8c0a0';
      for (let i = 0; i < 6; i++) g.fillRect(x - w * 0.7 + i * w * 0.25, y - 3, w * 0.14, 4 + (i % 3));
      g.restore();
      break;
    }
    default: g.moveTo(x - w * 0.8, y); g.quadraticCurveTo(x, y + 2, x + w * 0.8, y); g.stroke();
  }
  // a hint of lower lip under the closed shapes
  if (['smile', 'flat', 'smirk', 'frown'].includes(style)) {
    g.strokeStyle = lips;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(x - w * 0.35, y + 7); g.quadraticCurveTo(x, y + 10, x + w * 0.35, y + 7);
    g.stroke();
  }
}

function beard(g, color) {
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(X(0.33), Y(0.66));
  g.quadraticCurveTo(X(0.34), Y(0.93), X(0.5), Y(0.97));
  g.quadraticCurveTo(X(0.66), Y(0.93), X(0.67), Y(0.66));
  g.quadraticCurveTo(X(0.6), Y(0.7), X(0.58), Y(0.69));
  // leave the mouth clear
  g.lineTo(X(0.58), Y(0.79)); g.quadraticCurveTo(X(0.5), Y(0.83), X(0.42), Y(0.79)); g.lineTo(X(0.42), Y(0.69));
  g.quadraticCurveTo(X(0.4), Y(0.7), X(0.33), Y(0.66));
  g.fill();
  stipple(g, 0.33, 0.64, 0.67, 0.97, shade(color, 0.25) + '66', 300, true);
  moustache(g, color);
}

function moustache(g, color) {
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(X(0.5), Y(0.695));
  g.quadraticCurveTo(X(0.57), Y(0.69), X(0.585), Y(0.745));
  g.quadraticCurveTo(X(0.55), Y(0.72), X(0.5), Y(0.725));
  g.quadraticCurveTo(X(0.45), Y(0.72), X(0.415), Y(0.745));
  g.quadraticCurveTo(X(0.43), Y(0.69), X(0.5), Y(0.695));
  g.fill();
}

// ---- small drawing helpers --------------------------------------------------------

function dot(g, u, v, r, c) { g.fillStyle = c; g.beginPath(); g.arc(X(u), Y(v), r, 0, Math.PI * 2); g.fill(); }
function line(g, u0, v0, u1, v1, c, w) { g.strokeStyle = c; g.lineWidth = w; g.beginPath(); g.moveTo(X(u0), Y(v0)); g.lineTo(X(u1), Y(v1)); g.stroke(); }
function arc(g, u, v, r, a0, a1, c, w) { g.strokeStyle = c; g.lineWidth = w; g.beginPath(); g.arc(X(u), Y(v), X(r), a0, a1); g.stroke(); }
function soft(g, u, v, r, c) {
  const gr = g.createRadialGradient(X(u), Y(v), 0, X(u), Y(v), r);
  gr.addColorStop(0, c); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(X(u) - r, Y(v) - r, r * 2, r * 2);
}
function stipple(g, u0, v0, u1, v1, c, n, jaw = false, r = 0.9) {
  g.fillStyle = c;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) {
    const u = u0 + rnd() * (u1 - u0), v = v0 + rnd() * (v1 - v0);
    // along the jaw only: keep off the cheeks' upper half and out of the mouth
    if (jaw) {
      const dx = (u - 0.5) / 0.17, dy = (v - 0.9) / 0.26;
      if (dx * dx + dy * dy > 1) continue;
      if (Math.abs(u - 0.5) < 0.08 && Math.abs(v - FACE.mouthY) < 0.035) continue;
    }
    g.beginPath(); g.arc(X(u), Y(v), r, 0, Math.PI * 2); g.fill();
  }
}
function blotches(g, c, n, v0, v1) {
  let seed = 13;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) soft(g, 0.32 + rnd() * 0.36, v0 + rnd() * (v1 - v0), 8 + rnd() * 16, c);
}
function veins(g) {
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  g.strokeStyle = 'rgba(60,40,70,0.45)';
  g.lineWidth = 1.3;
  for (let k = 0; k < 7; k++) {
    let u = 0.33 + rnd() * 0.34, v = 0.4 + rnd() * 0.5;
    g.beginPath(); g.moveTo(X(u), Y(v));
    for (let i = 0; i < 5; i++) { u += (rnd() - 0.5) * 0.04; v += (rnd() - 0.4) * 0.04; g.lineTo(X(u), Y(v)); }
    g.stroke();
  }
}
function shade(hex, k) {
  const c = new THREE.Color(hex);
  const hsl = {};
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l * (1 + k))));
  return '#' + c.getHexString();
}
