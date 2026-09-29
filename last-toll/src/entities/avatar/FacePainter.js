import * as THREE from 'three';
import { avatarAssets } from './AvatarAssets.js';

// Faces for the avatar heads: our own eyes, brows, mouths and marks.
//
// A face is drawn flat on a "front of the head" canvas whose coordinates are real
// places on the head (see FACE_SPACE), then wrapped onto the head's texture through a
// lookup built from the head mesh itself: every texel of the texture knows where on
// the head it lands. So a mouth drawn under the nose ends up under the modelled nose,
// whatever the UV layout does there. Everything off the face is transparent, and the
// head's skin colour shows through.
//
// face: { eyes, iris, brows, browColor, mouth, lips, nose, marks: [...], dead }
//   eyes:  'round' | 'almond' | 'sleepy' | 'wide' | 'narrow' | 'hooded'
//   brows: 'soft' | 'straight' | 'arched' | 'thick' | 'heavy' | 'worried' | 'angry' | 'none'
//   mouth: 'smile' | 'flat' | 'smirk' | 'frown' | 'grin' | 'open' | 'snarl' | 'slack'
//   nose:  'soft' | 'wide' | 'none'  (the nose is modelled; 'wide' adds nostril shading)
//   lashes: true for a couple of lashes at the outer corners
//   skin:  the skin colour (set by the model), for folds and shading in the skin's own shade
//   buzz:  a hair colour: a buzz cut painted on the scalp (set by the model for buzz cuts)
//   marks: 'freckles' | 'stubble' | 'beard' | 'moustache' | 'scar' | 'blush' | 'bags' | 'wrinkles' | 'blood' | 'veins' | 'rot'

const S = 256; // the head texture

// The front canvas: across, the angle round the head's vertical axis, laid out as arc
// length on a nominal head radius so shapes keep their proportions; down, the height in
// the bind pose. Units are the rig's (the model is scaled ~1.2 in the world).
const R0 = 0.13; // nominal radius at the eyes
const ANG = Math.PI; // all the way round: the face, and a buzz cut's scalp
const Y_TOP = 1.52, Y_BOT = 1.1;
const PPM = 1400; // canvas pixels per unit
const FW = Math.round(2 * ANG * R0 * PPM), FH = Math.round((Y_TOP - Y_BOT) * PPM);

// Where the features sit, in (arc across, height), measured on the head mesh against
// the proportions of Xbox-style avatar faces: the eyes a little below the middle of the
// head and set wide, the mouth tucked just under the nose, well clear of the chin.
export const FACE = {
  noseTip: 1.237,
  eyeX: 0.069, eyeY: 1.303, eyeW: 0.03, // half-width of an eye
  eyeTilt: 0.12, // outer corners up
  browY: 1.343, browW: 0.042,
  underNose: 1.228,
  lipTop: 1.2205, mouthY: 1.2095, lipBot: 1.1945, mouthW: 0.046,
  chin: 1.14,
};

// canvas pixel from (arc across, height)
const px = (s) => FW / 2 + s * PPM;
const py = (y) => (Y_TOP - y) * PPM;
const L = (m) => m * PPM; // a length

// ---- where each texel of the head texture lands on the face canvas ----------------------

const luts = {};
function lutFor(sex) {
  if (luts[sex]) return luts[sex];
  const part = avatarAssets().parts[`${sex}_head`];
  const lut = new Float32Array(S * S * 2).fill(-1);
  const { pos, uv } = part;
  const index = part.index || Uint32Array.from({ length: part.count }, (_, i) => i);
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t], b = index[t + 1], c = index[t + 2];
    const ax = uv[a * 2] * S, ay = uv[a * 2 + 1] * S, bx = uv[b * 2] * S, by = uv[b * 2 + 1] * S, cx = uv[c * 2] * S, cy = uv[c * 2 + 1] * S;
    const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(d) < 1e-9) continue;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(S - 1, Math.ceil(Math.max(ax, bx, cx)));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), y1 = Math.min(S - 1, Math.ceil(Math.max(ay, by, cy)));
    for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) {
      const u = i + 0.5, v = j + 0.5;
      const l1 = ((by - cy) * (u - cx) + (cx - bx) * (v - cy)) / d;
      const l2 = ((cy - ay) * (u - cx) + (ax - cx) * (v - cy)) / d;
      const l3 = 1 - l1 - l2;
      if (l1 < -1e-4 || l2 < -1e-4 || l3 < -1e-4) continue;
      const X = l1 * pos[a * 3] + l2 * pos[b * 3] + l3 * pos[c * 3];
      const Y = l1 * pos[a * 3 + 1] + l2 * pos[b * 3 + 1] + l3 * pos[c * 3 + 1];
      const Z = l1 * pos[a * 3 + 2] + l2 * pos[b * 3 + 2] + l3 * pos[c * 3 + 2];
      const ang = Math.atan2(X, Z);
      if (Y < Y_BOT || Y > Y_TOP) continue;
      // the ears stick out over the scalp behind them: leave them bare
      if (Math.abs(X) > 0.126 && Y > 1.19 && Y < 1.37) continue;
      const k = (j * S + i) * 2;
      lut[k] = px(ang * R0);
      lut[k + 1] = py(Y);
    }
  }
  // grow the painted area a couple of texels past each UV island's edge, so filtering on
  // the GPU never mixes in an empty texel along a seam
  for (let pass = 0; pass < 2; pass++) {
    const src = lut.slice();
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const k = (j * S + i) * 2;
      if (src[k] >= 0) continue;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= S || jj >= S) continue;
        const q = (jj * S + ii) * 2;
        if (src[q] >= 0) { lut[k] = src[q]; lut[k + 1] = src[q + 1]; break; }
      }
    }
  }
  luts[sex] = lut;
  return lut;
}

// ---- the texture ------------------------------------------------------------------------

const cache = new Map();
let front = null;

export function faceTexture(face, talk = false, sex = 'm') {
  const key = `${sex}|${JSON.stringify(face)}${talk ? '|t' : ''}`;
  let t = cache.get(key);
  if (t) return t;
  if (!front) {
    front = document.createElement('canvas');
    front.width = FW; front.height = FH;
  }
  const g = front.getContext('2d', { willReadFrequently: true });
  g.clearRect(0, 0, FW, FH);
  paint(g, face, talk);
  const src = g.getImageData(0, 0, FW, FH).data;
  // wrap the front canvas onto the head's texture
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const out = c.getContext('2d');
  const img = out.createImageData(S, S);
  const lut = lutFor(sex);
  for (let n = 0; n < S * S; n++) {
    const x = lut[n * 2], y = lut[n * 2 + 1];
    if (x < 0) continue;
    // bilinear
    const x0 = Math.min(FW - 2, Math.max(0, Math.floor(x - 0.5))), y0 = Math.min(FH - 2, Math.max(0, Math.floor(y - 0.5)));
    const fx = Math.min(1, Math.max(0, x - 0.5 - x0)), fy = Math.min(1, Math.max(0, y - 0.5 - y0));
    const i00 = (y0 * FW + x0) * 4, i10 = i00 + 4, i01 = i00 + FW * 4, i11 = i01 + 4;
    for (let ch = 0; ch < 4; ch++) {
      const v = (src[i00 + ch] * (1 - fx) + src[i10 + ch] * fx) * (1 - fy) + (src[i01 + ch] * (1 - fx) + src[i11 + ch] * fx) * fy;
      img.data[n * 4 + ch] = v;
    }
  }
  out.putImageData(img, 0, 0);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = false;
  t.anisotropy = 4;
  cache.set(key, t);
  return t;
}

// ---- painting on the front canvas ---------------------------------------------------------

function paint(g, f, talk) {
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const marks = f.marks || [];
  if (f.buzz) buzz(g, f.buzz);
  // under everything: shading and skin marks
  if (marks.includes('rot')) blotches(g, 'rgba(60,70,40,0.35)', 14, 1.16, 1.42);
  if (marks.includes('veins')) veins(g);
  if (marks.includes('blush')) for (const s of [-1, 1]) soft(g, s * 0.066, 1.258, 0.022, 'rgba(210,90,90,0.32)');
  if (marks.includes('bags')) for (const s of [-1, 1]) soft(g, s * FACE.eyeX, FACE.eyeY - 0.022, 0.016, 'rgba(90,55,55,0.16)');
  if (marks.includes('wrinkles')) {
    for (const s of [-1, 1]) {
      for (const k of [-1, 0, 1]) line(g, s * (FACE.eyeX + FACE.eyeW * 1.15), FACE.eyeY + k * 0.006, s * (FACE.eyeX + FACE.eyeW * 1.5), FACE.eyeY + k * 0.011, 'rgba(70,45,35,0.35)', 0.0018);
      curve(g, s * 0.03, FACE.underNose + 0.004, s * 0.05, 1.218, s * 0.052, 1.197, 'rgba(70,45,35,0.32)', 0.002);
    }
  }
  if (marks.includes('stubble')) stubble(g, 'rgba(40,30,25,0.42)', 1100);
  if (marks.includes('beard')) beard(g, f.beardColor || f.browColor || '#3a2a1e');
  if (marks.includes('freckles')) speckle(g, -0.075, 0.075, 1.245, 1.29, 'rgba(120,70,40,0.55)', 70, 0.0012);
  if (marks.includes('scar')) {
    line(g, 0.078, 1.35, 0.094, 1.268, 'rgba(120,50,50,0.8)', 0.0032);
    for (let i = 0; i < 4; i++) { const t = (i + 0.5) / 4; const x = 0.078 + 0.016 * t, y = 1.35 - 0.082 * t; line(g, x - 0.005, y - 0.002, x + 0.005, y + 0.002, 'rgba(120,50,50,0.7)', 0.0016); }
  }
  // the nose is modelled and casts its own shade: nostrils only if asked for
  if (f.nose === 'wide') for (const s of [-1, 1]) soft(g, s * 0.011, FACE.underNose + 0.002, 0.0035, 'rgba(70,35,30,0.35)');
  // eyes and brows, mirrored
  for (const s of [-1, 1]) {
    eye(g, s, f);
    brow(g, s, f.brows || 'soft', f.browColor || '#3a2a1e');
  }
  mouth(g, talk ? 'open' : f.mouth || 'flat', f);
  if (marks.includes('moustache')) moustache(g, f.beardColor || f.browColor || '#3a2a1e');
  if (marks.includes('blood')) {
    blotches(g, 'rgba(110,10,10,0.7)', 5, 1.16, 1.24);
    line(g, -0.02, 1.2, -0.026, 1.155, 'rgba(110,10,10,0.8)', 0.004);
    line(g, 0.03, 1.2, 0.034, 1.165, 'rgba(110,10,10,0.8)', 0.0034);
  }
}

// One eye. side: -1 on the model's right (canvas left), +1 on its left.
// The eye is the space between an upper and a lower lid curve; the white, the iris and
// the pupil are clipped to it, so nothing ever shows above the lid line drawn on top.
const EYES = {
  // half-width, how far the upper lid rises and the lower lid drops (in half-widths)
  round: [1, 0.78, 0.5], almond: [1.06, 0.62, 0.36], sleepy: [1, 0.42, 0.38],
  wide: [1.02, 0.9, 0.58], narrow: [1.08, 0.34, 0.22], hooded: [1.02, 0.5, 0.38],
};
function eye(g, side, f) {
  const shape = EYES[f.eyes] ? f.eyes : 'round';
  const [w, up, lo] = EYES[shape];
  const R = L(FACE.eyeW), rx = R * w;
  const x0 = -side * rx, x1 = side * rx; // inner and outer corners
  const y0 = R * 0.04, y1 = -R * 0.06; // the outer corner sits a touch higher
  // a quadratic's middle is half way to its control point: aim the lids' peaks
  const cUp = [side * rx * 0.12, 2 * -R * up - (y0 + y1) / 2];
  const cLo = [side * rx * 0.08, 2 * R * lo - (y0 + y1) / 2];
  const upper = (ctx) => { ctx.moveTo(x0, y0); ctx.quadraticCurveTo(cUp[0], cUp[1], x1, y1); };
  const skinDark = shade(f.skin || '#b88a68', -0.3);
  g.save();
  g.translate(px(side * FACE.eyeX), py(FACE.eyeY));
  g.rotate(-side * FACE.eyeTilt);
  if (f.dead) {
    // dark, sunken sockets
    g.beginPath(); g.ellipse(0, R * 0.05, rx * 1.3, R * (up + lo) * 1.1, 0, 0, Math.PI * 2); g.fillStyle = 'rgba(40,20,25,0.5)'; g.fill();
  }
  // the eye itself
  g.beginPath();
  upper(g);
  g.quadraticCurveTo(cLo[0], cLo[1], x0, y0);
  g.closePath();
  g.fillStyle = f.dead ? '#cfd3b8' : '#f7f4ee';
  g.fill();
  g.save();
  g.clip();
  const ir = R * 0.6, iy = R * 0.06; // looking straight out, the lid over the top of it
  if (!f.dead) {
    g.beginPath(); g.arc(0, iy, ir, 0, Math.PI * 2); g.fillStyle = f.iris || '#4a3526'; g.fill();
    g.beginPath(); g.arc(0, iy, ir, 0, Math.PI * 2); g.lineWidth = ir * 0.16; g.strokeStyle = shade(f.iris || '#4a3526', -0.45); g.stroke();
    g.beginPath(); g.arc(0, iy, ir * 0.46, 0, Math.PI * 2); g.fillStyle = '#0c0a0a'; g.fill();
    g.beginPath(); g.arc(-ir * 0.32, iy - ir * 0.36, ir * 0.2, 0, Math.PI * 2); g.fillStyle = 'rgba(255,255,255,0.92)'; g.fill();
  } else {
    // milky, sightless
    g.beginPath(); g.arc(0, iy, ir * 0.95, 0, Math.PI * 2); g.fillStyle = 'rgba(205,208,190,0.95)'; g.fill();
    g.beginPath(); g.arc(0, iy, ir * 0.36, 0, Math.PI * 2); g.fillStyle = 'rgba(170,175,160,0.9)'; g.fill();
  }
  // the lid's shadow on the eyeball
  g.beginPath(); upper(g); g.lineWidth = R * 0.34; g.strokeStyle = 'rgba(60,40,30,0.18)'; g.stroke();
  g.restore();
  // a fold above hooded and sleepy eyes, in the skin's own shade
  if (shape === 'hooded' || shape === 'sleepy') {
    g.beginPath();
    g.moveTo(x0 * 1.02, y0 - R * 0.12);
    g.quadraticCurveTo(cUp[0], cUp[1] - R * 0.45, x1 * 1.04, y1 - R * 0.14);
    g.lineWidth = L(0.0024); g.strokeStyle = skinDark; g.stroke();
  }
  // the upper lid: a heavy dark line, flicked out at the outer corner
  const ink = f.dead ? '#3a1818' : '#1a120e';
  g.beginPath(); upper(g);
  g.lineWidth = L(0.0044); g.strokeStyle = ink; g.stroke();
  g.beginPath();
  g.moveTo(x1 - side * R * 0.08, y1 - R * 0.02);
  g.lineTo(x1 + side * L(0.0065), y1 - R * 0.32);
  g.lineWidth = L(0.003); g.stroke();
  if (f.lashes) {
    for (const k of [0.55, 0.75]) {
      const t = k, mx = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * cUp[0] + t * t * x1, my = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * cUp[1] + t * t * y1;
      g.beginPath(); g.moveTo(mx, my); g.lineTo(mx + side * L(0.004), my - L(0.005)); g.lineWidth = L(0.0018); g.stroke();
    }
  }
  // the lower lid: a faint line
  g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(cLo[0], cLo[1], x1, y1);
  g.lineWidth = L(0.0015); g.strokeStyle = 'rgba(40,25,20,0.28)'; g.stroke();
  g.restore();
}

function brow(g, side, style, color) {
  if (style === 'none') return;
  const thick = { soft: 0.0042, straight: 0.0048, arched: 0.004, thick: 0.0075, heavy: 0.009, worried: 0.0048, angry: 0.0065 }[style] || 0.0048;
  const inner = side * (FACE.eyeX - FACE.browW * 0.95), outer = side * (FACE.eyeX + FACE.browW * 0.95), mid = side * FACE.eyeX;
  const y = FACE.browY;
  let a, b, c; // heights at inner, middle, outer
  if (style === 'arched') [a, b, c] = [y - 0.003, y + 0.009, y - 0.001];
  else if (style === 'worried') [a, b, c] = [y + 0.005, y + 0.003, y - 0.005];
  else if (style === 'angry' || style === 'heavy') [a, b, c] = [y - 0.006, y + 0.001, y + 0.003];
  else if (style === 'straight') [a, b, c] = [y, y + 0.001, y + 0.001];
  else [a, b, c] = [y - 0.002, y + 0.005, y - 0.001];
  // tapered: thick at the inner end, thin at the tail
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(px(inner), py(a + thick * 0.55));
  g.quadraticCurveTo(px(mid), py(b + thick * 0.6), px(outer), py(c + thick * 0.15));
  g.quadraticCurveTo(px(mid), py(b - thick * 0.6), px(inner), py(a - thick * 0.55));
  g.closePath();
  g.fill();
}

function mouth(g, style, f) {
  const x = px(0), y = py(FACE.mouthY);
  const w = L(FACE.mouthW);
  const lips = f.lips || 'rgba(150,70,70,0.85)';
  const line = L(0.0034);
  g.strokeStyle = '#3a1a18';
  g.lineWidth = line;
  g.beginPath();
  switch (style) {
    case 'smile': g.moveTo(x - w, y - L(0.004)); g.quadraticCurveTo(x, y + L(0.009), x + w, y - L(0.004)); g.stroke(); break;
    case 'smirk': g.moveTo(x - w * 0.8, y + L(0.001)); g.quadraticCurveTo(x, y + L(0.004), x + w, y - L(0.005)); g.stroke(); break;
    case 'frown': g.moveTo(x - w * 0.85, y + L(0.004)); g.quadraticCurveTo(x, y - L(0.005), x + w * 0.85, y + L(0.004)); g.stroke(); break;
    case 'grin': {
      g.moveTo(x - w, y - L(0.005)); g.quadraticCurveTo(x, y + L(0.014), x + w, y - L(0.005)); g.quadraticCurveTo(x, y - L(0.002), x - w, y - L(0.005));
      g.fillStyle = '#2a0f0f'; g.fill(); g.stroke();
      g.save(); g.clip(); g.fillStyle = '#f2eee2'; g.fillRect(x - w, y - L(0.006), w * 2, L(0.006)); g.restore();
      break;
    }
    case 'open': {
      // talking
      g.ellipse(x, y + L(0.001), w * 0.5, L(0.0085), 0, 0, Math.PI * 2);
      g.fillStyle = '#2a0f0f'; g.fill(); g.stroke();
      g.save(); g.clip();
      g.fillStyle = '#f2eee2'; g.fillRect(x - w * 0.5, y - L(0.008), w, L(0.004));
      g.fillStyle = '#9a4040'; g.beginPath(); g.ellipse(x, y + L(0.008), w * 0.32, L(0.004), 0, 0, Math.PI * 2); g.fill();
      g.restore();
      break;
    }
    case 'snarl': case 'slack': {
      // the dead: a gaping, ragged hole
      const h = L(style === 'snarl' ? 0.016 : 0.012);
      g.moveTo(x - w * 0.8, y - L(0.004));
      for (let i = 0; i <= 6; i++) g.lineTo(x - w * 0.8 + (i / 6) * w * 1.6, y - L(0.004) + (i % 2 ? -L(0.002) : L(0.001)));
      g.quadraticCurveTo(x + w * 0.3, y + h, x - w * 0.8, y - L(0.004));
      g.fillStyle = '#1a0606'; g.fill();
      g.strokeStyle = '#4a1010'; g.lineWidth = L(0.0026); g.stroke();
      g.save(); g.clip(); g.fillStyle = '#c8c0a0';
      for (let i = 0; i < 6; i++) g.fillRect(x - w * 0.7 + i * w * 0.25, y - L(0.004), w * 0.14, L(0.004) + (i % 3) * L(0.0012));
      g.restore();
      break;
    }
    default: g.moveTo(x - w * 0.8, y); g.quadraticCurveTo(x, y + L(0.002), x + w * 0.8, y); g.stroke();
  }
  // a hint of lower lip under the closed shapes
  if (['smile', 'flat', 'smirk', 'frown'].includes(style)) {
    g.strokeStyle = lips;
    g.lineWidth = L(0.0026);
    g.beginPath();
    const ly = py(FACE.lipBot + 0.004);
    g.moveTo(x - w * 0.35, ly - L(0.001)); g.quadraticCurveTo(x, ly + L(0.002), x + w * 0.35, ly - L(0.001));
    g.stroke();
  }
}

// A beard: over the jaw and chin, up the cheeks, clear of the mouth.
function beard(g, color) {
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(px(-0.1), py(1.245));
  g.quadraticCurveTo(px(-0.1), py(1.14), px(0), py(1.128));
  g.quadraticCurveTo(px(0.1), py(1.14), px(0.1), py(1.245));
  g.quadraticCurveTo(px(0.075), py(1.232), px(0.056), py(1.229));
  // round the mouth
  g.lineTo(px(0.056), py(1.192)); g.quadraticCurveTo(px(0), py(1.176), px(-0.056), py(1.192)); g.lineTo(px(-0.056), py(1.229));
  g.quadraticCurveTo(px(-0.075), py(1.232), px(-0.1), py(1.245));
  g.fill();
  speckle(g, -0.1, 0.1, 1.13, 1.245, shade(color, 0.25) + '66', 380, 0.0011, true);
  moustache(g, color);
}

function moustache(g, color) {
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(px(0), py(FACE.underNose - 0.001));
  g.quadraticCurveTo(px(0.035), py(FACE.underNose), px(0.05), py(FACE.mouthY - 0.004));
  g.quadraticCurveTo(px(0.03), py(FACE.lipTop + 0.001), px(0), py(FACE.lipTop + 0.002));
  g.quadraticCurveTo(px(-0.03), py(FACE.lipTop + 0.001), px(-0.05), py(FACE.mouthY - 0.004));
  g.quadraticCurveTo(px(-0.035), py(FACE.underNose), px(0), py(FACE.underNose - 0.001));
  g.fill();
}

// A buzz cut: the scalp painted in the hair colour down to a hairline round the head,
// with a soft, stippled edge.
function buzzLine(a) {
  a = Math.abs(a);
  if (a < 0.55) return 1.405;
  if (a < 1.25) return 1.405 - ((a - 0.55) / 0.7) * 0.07;
  if (a < 1.95) return 1.335;
  return 1.335 - ((a - 1.95) / (Math.PI - 1.95)) * 0.13;
}
function buzz(g, color) {
  const edge = (dy) => {
    g.beginPath();
    g.moveTo(0, 0);
    for (let i = 0; i <= 96; i++) { const a = -Math.PI + (i / 96) * Math.PI * 2; g.lineTo(px(a * R0), py(buzzLine(a) + dy)); }
    g.lineTo(FW, 0);
    g.closePath();
  };
  g.fillStyle = color;
  g.globalAlpha = 0.45; edge(-0.004); g.fill();
  g.globalAlpha = 0.92; edge(0.003); g.fill();
  g.globalAlpha = 1;
  // stubble texture over it
  const R = rnd(29);
  g.fillStyle = shade(color, 0.35) + '55';
  for (let i = 0; i < 1600; i++) {
    const a = -Math.PI + R() * Math.PI * 2, y = 1.2 + R() * 0.32;
    if (y < buzzLine(a)) continue;
    g.beginPath(); g.arc(px(a * R0), py(y), L(0.0012), 0, Math.PI * 2); g.fill();
  }
}

// ---- small drawing helpers (model units in, canvas out) -----------------------------------

function line(g, x0, y0, x1, y1, c, w) { g.strokeStyle = c; g.lineWidth = L(w); g.beginPath(); g.moveTo(px(x0), py(y0)); g.lineTo(px(x1), py(y1)); g.stroke(); }
function curve(g, x0, y0, xc, yc, x1, y1, c, w) { g.strokeStyle = c; g.lineWidth = L(w); g.beginPath(); g.moveTo(px(x0), py(y0)); g.quadraticCurveTo(px(xc), py(yc), px(x1), py(y1)); g.stroke(); }
function arc(g, x, y, r, a0, a1, c, w) { g.strokeStyle = c; g.lineWidth = L(w); g.beginPath(); g.arc(px(x), py(y), L(r), a0, a1); g.stroke(); }
function soft(g, x, y, r, c) {
  const gr = g.createRadialGradient(px(x), py(y), 0, px(x), py(y), L(r));
  gr.addColorStop(0, c); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(px(x) - L(r), py(y) - L(r), L(r) * 2, L(r) * 2);
}
function rnd(seed) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }
function speckle(g, x0, x1, y0, y1, c, n, r, jaw = false) {
  g.fillStyle = c;
  const R = rnd(7);
  for (let i = 0; i < n; i++) {
    const x = x0 + R() * (x1 - x0), y = y0 + R() * (y1 - y0);
    if (jaw && !onJaw(x, y)) continue;
    g.beginPath(); g.arc(px(x), py(y), L(r), 0, Math.PI * 2); g.fill();
  }
}
// the stubble line: jaw, chin and upper lip, never the lips or cheekbones
function onJaw(x, y) {
  if (y > FACE.underNose - 0.001) return false;
  const dx = x / 0.1, dy = (y - 1.13) / 0.13;
  if (dx * dx + dy * dy > 1) return false;
  if (Math.abs(x) < FACE.mouthW * 1.05 && y < FACE.lipTop + 0.001 && y > FACE.lipBot - 0.001) return false;
  return true;
}
function stubble(g, c, n) { speckle(g, -0.1, 0.1, 1.12, FACE.underNose, c, n, 0.00085, true); }
function blotches(g, c, n, y0, y1) {
  const R = rnd(13);
  for (let i = 0; i < n; i++) soft(g, (R() - 0.5) * 0.18, y0 + R() * (y1 - y0), 0.012 + R() * 0.022, c);
}
function veins(g) {
  const R = rnd(3);
  g.strokeStyle = 'rgba(60,40,70,0.45)';
  g.lineWidth = L(0.0016);
  for (let k = 0; k < 7; k++) {
    let x = (R() - 0.5) * 0.18, y = 1.16 + R() * 0.24;
    g.beginPath(); g.moveTo(px(x), py(y));
    for (let i = 0; i < 5; i++) { x += (R() - 0.5) * 0.02; y += (R() - 0.6) * 0.02; g.lineTo(px(x), py(y)); }
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
