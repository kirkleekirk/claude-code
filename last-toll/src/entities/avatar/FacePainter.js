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
//   nose:  'soft' | 'wide' | 'none'  (a shadow under the modelled nose; nothing is painted on it)
//   lashes: true for a couple of lashes at the outer corners
//   skin:  the skin colour (set by the model), for folds and shading in the skin's own shade
//   buzz:  a hair colour: a buzz cut painted on the scalp (set by the model for buzz cuts)
//   marks: 'freckles' | 'stubble' | 'beard' | 'moustache' | 'scar' | 'blush' | 'bags' | 'wrinkles' | 'blood' | 'veins' | 'rot'

const S = 512; // the head texture: about a texel per millimetre across the face

// The front canvas: across, the angle round the head's vertical axis, laid out as arc
// length on a nominal head radius so shapes keep their proportions; down, the height in
// the bind pose. Units are the rig's (the model is scaled ~1.2 in the world).
const R0 = 0.13; // nominal radius at the eyes
const ANG = Math.PI; // all the way round: the face, and a buzz cut's scalp
const Y_TOP = 1.52, Y_BOT = 1.1;
const PPM = 2000; // canvas pixels per unit
const FW = Math.round(2 * ANG * R0 * PPM), FH = Math.round((Y_TOP - Y_BOT) * PPM);

// Where the features sit, in (arc across, height). Taken from the rig itself: the pack's
// FBX heads carry UV layers that place the avatar's own eye, brow and mouth textures,
// and projected through those layers they land on these spots. Our features are our own
// drawings, sized and centred on the same spots.
export const FACES = {
  m: {
    noseTip: 1.237,
    eyeX: 0.055, eyeY: 1.2965, eyeW: 0.029, // half-width of an eye
    eyeTilt: 0.1, // outer corners up
    browX: 0.058, browY: 1.3255, browW: 0.042,
    underNose: 1.226,
    lipTop: 1.197, mouthY: 1.192, lipBot: 1.1845, mouthW: 0.041,
    chin: 1.14,
  },
  f: {
    noseTip: 1.237,
    eyeX: 0.057, eyeY: 1.2905, eyeW: 0.031,
    eyeTilt: 0.12,
    browX: 0.057, browY: 1.3235, browW: 0.04,
    underNose: 1.226,
    lipTop: 1.2015, mouthY: 1.192, lipBot: 1.1805, mouthW: 0.047,
    chin: 1.14,
  },
};
let FACE = FACES.m; // the layout being painted

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
  t = wrapFront(paintFront(face, talk, sex), sex, !!face.buzz);
  cache.set(key, t);
  return t;
}

// The face painted flat on the front-of-the-head canvas (reused between calls).
export function paintFront(face, talk = false, sex = 'm') {
  if (!front) {
    front = document.createElement('canvas');
    front.width = FW; front.height = FH;
  }
  const g = front.getContext('2d', { willReadFrequently: true });
  g.clearRect(0, 0, FW, FH);
  paint(g, face, talk, sex);
  return front;
}

// A front-of-the-head canvas (FW x FH, see FACE_SPACE) wrapped onto a head texture.
// wide: read all the way round the head (a buzz cut); otherwise only the face is read.
export function wrapFront(canvas, sex = 'm', wide = true) {
  const rx0 = wide ? 0 : Math.max(0, Math.floor(px(-0.17))), rx1 = wide ? FW : Math.min(FW, Math.ceil(px(0.17)));
  const RW = rx1 - rx0;
  const src = canvas.getContext('2d', { willReadFrequently: true }).getImageData(rx0, 0, RW, FH).data;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const out = c.getContext('2d');
  const img = out.createImageData(S, S);
  const dst = img.data;
  const lut = lutFor(sex);
  for (let n = 0; n < S * S; n++) {
    const x = lut[n * 2] - rx0, y = lut[n * 2 + 1];
    if (x < 0 || x > RW) continue;
    // bilinear, skipping texels with nothing painted under them (most of the head)
    const x0 = Math.min(RW - 2, Math.max(0, Math.floor(x - 0.5))), y0 = Math.min(FH - 2, Math.max(0, Math.floor(y - 0.5)));
    const i00 = (y0 * RW + x0) * 4, i10 = i00 + 4, i01 = i00 + RW * 4, i11 = i01 + 4;
    if (!(src[i00 + 3] | src[i10 + 3] | src[i01 + 3] | src[i11 + 3])) continue;
    const fx = Math.min(1, Math.max(0, x - 0.5 - x0)), fy = Math.min(1, Math.max(0, y - 0.5 - y0));
    const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
    for (let ch = 0; ch < 4; ch++) dst[n * 4 + ch] = src[i00 + ch] * w00 + src[i10 + ch] * w10 + src[i01 + ch] * w01 + src[i11 + ch] * w11;
  }
  out.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = false;
  t.anisotropy = 4;
  return t;
}

// ---- painting on the front canvas ---------------------------------------------------------

function paint(g, f, talk, sex) {
  FACE = FACES[sex] || FACES.m;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const marks = f.marks || [];
  if (f.buzz) buzz(g, f.buzz);
  // under everything: shading and skin marks
  if (marks.includes('rot')) blotches(g, 'rgba(60,70,40,0.35)', 14, 1.16, 1.42);
  if (marks.includes('veins')) veins(g);
  if (marks.includes('blush')) for (const s of [-1, 1]) soft(g, s * (FACE.eyeX + 0.006), FACE.eyeY - 0.042, 0.02, 'rgba(210,90,90,0.32)');
  if (marks.includes('bags')) for (const s of [-1, 1]) soft(g, s * FACE.eyeX, FACE.eyeY - 0.022, 0.016, 'rgba(90,55,55,0.16)');
  if (marks.includes('wrinkles')) {
    for (const s of [-1, 1]) {
      for (const k of [-1, 0, 1]) line(g, s * (FACE.eyeX + FACE.eyeW * 1.15), FACE.eyeY + k * 0.006, s * (FACE.eyeX + FACE.eyeW * 1.5), FACE.eyeY + k * 0.011, 'rgba(70,45,35,0.35)', 0.0018);
      curve(g, s * 0.03, FACE.underNose + 0.004, s * (FACE.mouthW + 0.008), FACE.underNose - 0.012, s * (FACE.mouthW + 0.009), FACE.mouthY - 0.004, 'rgba(70,45,35,0.32)', 0.002);
    }
  }
  if (marks.includes('stubble')) stubble(g, 'rgba(40,30,25,0.42)', 1100);
  if (marks.includes('beard')) beard(g, f.beardColor || f.browColor || '#3a2a1e');
  if (marks.includes('freckles')) speckle(g, -0.075, 0.075, FACE.eyeY - 0.055, FACE.eyeY - 0.018, 'rgba(120,70,40,0.55)', 70, 0.0012);
  if (marks.includes('scar')) {
    line(g, 0.078, 1.35, 0.094, 1.268, 'rgba(120,50,50,0.8)', 0.0032);
    for (let i = 0; i < 4; i++) { const t = (i + 0.5) / 4; const x = 0.078 + 0.016 * t, y = 1.35 - 0.082 * t; line(g, x - 0.005, y - 0.002, x + 0.005, y + 0.002, 'rgba(120,50,50,0.7)', 0.0016); }
  }
  // the nose is modelled: only a soft shadow under its tip, and nostrils if asked for
  const nose = f.nose || 'soft';
  if (nose !== 'none') {
    soft(g, 0, 1.2165, 0.009, 'rgba(90,50,40,0.14)');
    if (nose === 'wide') for (const s of [-1, 1]) soft(g, s * 0.011, FACE.underNose + 0.002, 0.004, 'rgba(70,35,30,0.5)');
  }
  // eyes and brows, mirrored
  for (const s of [-1, 1]) {
    eye(g, s, f);
    brow(g, s, f.brows || 'soft', f.browColor || '#3a2a1e');
  }
  mouth(g, talk ? 'open' : f.mouth || 'flat', f, sex);
  if (marks.includes('moustache')) moustache(g, f.beardColor || f.browColor || '#3a2a1e');
  if (marks.includes('blood')) {
    // round the mouth and down the chin, where it fed
    soft(g, 0, FACE.mouthY - 0.006, FACE.mouthW + 0.006, 'rgba(100,12,10,0.42)');
    const R = rnd(29);
    for (let i = 0; i < 4; i++) soft(g, (R() - 0.5) * FACE.mouthW * 1.6, FACE.mouthY - 0.012 - R() * 0.03, 0.006 + R() * 0.006, 'rgba(95,8,8,0.55)');
    line(g, -0.02, FACE.mouthY - 0.004, -0.026, 1.15, 'rgba(110,10,10,0.8)', 0.004);
    line(g, 0.03, FACE.mouthY - 0.003, 0.034, 1.158, 'rgba(110,10,10,0.8)', 0.0034);
  }
}

// One eye. side: -1 on the model's right (canvas left), +1 on its left.
// The eye is the space between an upper and a lower lid curve; the white, the iris and
// the pupil are clipped to it, so nothing ever shows above the lid line drawn on top.
// The upper lid always rests on the top of the iris: white showing above it reads as
// a startled stare.
const EYES = {
  // half-width, how far the upper lid rises and the lower lid drops (in half-widths)
  round: [1, 0.56, 0.42], almond: [1.06, 0.5, 0.33], sleepy: [1, 0.36, 0.33],
  wide: [1.04, 0.64, 0.46], narrow: [1.08, 0.3, 0.22], hooded: [1.02, 0.44, 0.34],
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
  // looking straight out, a little low, its top tucked under the upper lid
  const iy = R * 0.1, ir = R * Math.min(0.66, Math.max(0.5, up + 0.07));
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
  const thick = { soft: 0.0074, straight: 0.008, arched: 0.007, thick: 0.0108, heavy: 0.0126, worried: 0.0078, angry: 0.0096 }[style] || 0.0078;
  const inner = side * (FACE.browX - FACE.browW * 0.95), outer = side * (FACE.browX + FACE.browW * 0.95), mid = side * FACE.browX;
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

// The mouth, in the style of the avatars: an upper lip with a slight bow and a fuller
// lower lip, in a lip tone taken from the skin (rosier on women, grey on the dead),
// parted by a dark line that thins toward the corners. Smiles tuck up at the corners.
const MOUTHS = {
  // corner lift on the model's right and left (up is +), and width as a share of mouthW
  smile: [0.0042, 0.0042, 1],
  flat: [0.0006, 0.0006, 0.9],
  smirk: [0.0002, 0.0048, 0.95],
  frown: [-0.003, -0.003, 0.9],
  grin: [0.0055, 0.0055, 1.04],
};
function lipTone(f, sex, k = 0) {
  if (f.lips) return f.lips;
  const skin = f.skin || '#d9a582';
  if (f.dead) return mix(skin, '#4a3444', 0.45, 1, k);
  return sex === 'f' ? mix(skin, '#a83e50', 0.55, 1, k - 0.04) : mix(skin, '#8a4640', 0.34, 1, k - 0.06);
}
function mouth(g, style, f, sex) {
  const y0 = FACE.mouthY;
  const fem = sex === 'f';
  // lip heights at the middle: upper, lower
  const ut = FACE.lipTop - y0, lt = y0 - FACE.lipBot;
  if (style === 'snarl' || style === 'slack') return deadMouth(g, style, f);
  const shape = MOUTHS[style] || (style === 'open' ? [0.0015, 0.0015, 0.86] : MOUTHS.flat);
  const w = FACE.mouthW * shape[2];
  // the parting line: y at x
  const at = (x) => y0 + (x < 0 ? shape[0] : shape[1]) * (x / w) * (x / w);
  const upper = (u) => (1 - u * u) * (0.8 + 0.2 * smoothstep(0.04, 0.3, u)); // a slight bow
  const lower = (u) => Math.pow(1 - u * u, 0.7);
  // an opening between the lips (talking, grinning): how far the lower lip drops
  const gap = style === 'open' ? 0.0115 : style === 'grin' ? 0.0095 : 0;
  const low = (x) => at(x) - gap * Math.pow(Math.max(0, 1 - (x / w) * (x / w)), 0.8);
  const N = 24;
  const xs = Array.from({ length: N + 1 }, (_, i) => -w + (2 * w * i) / N);
  const path = (top, bot) => {
    g.beginPath();
    xs.forEach((x, i) => (i ? g.lineTo : g.moveTo).call(g, px(x), py(top(x))));
    for (let i = N; i >= 0; i--) g.lineTo(px(xs[i]), py(bot(xs[i])));
    g.closePath();
  };
  // a little shade under the lower lip gives it some fullness
  soft(g, 0, low(0) - lt - 0.003, 0.011, 'rgba(60,30,25,0.1)');
  g.save();
  g.filter = `blur(${L(0.0004).toFixed(2)}px)`;
  // lips
  path((x) => at(x) + ut * upper(Math.abs(x) / w), at);
  g.fillStyle = lipTone(f, sex, -0.14); g.globalAlpha = fem ? 0.95 : 0.8; g.fill();
  path(low, (x) => low(x) - lt * lower(Math.abs(x) / w));
  g.fillStyle = lipTone(f, sex); g.globalAlpha = fem ? 0.9 : 0.7; g.fill();
  g.globalAlpha = 1;
  g.restore();
  // a soft sheen on the lower lip
  soft(g, 0, low(0) - lt * 0.45, lt * 0.8, fem ? 'rgba(255,235,230,0.22)' : 'rgba(255,235,225,0.1)');
  if (gap) {
    // the opening: dark, upper teeth, and a tongue when talking
    path(at, low);
    g.fillStyle = '#2a0e10'; g.fill();
    g.save(); g.clip();
    path(at, (x) => at(x) - 0.0042 * Math.sqrt(Math.max(0, 1 - (x / w) * (x / w))));
    g.fillStyle = '#f0ece2'; g.fill();
    if (style === 'open') { g.fillStyle = '#9a4448'; g.beginPath(); g.ellipse(px(0), py(low(0) + 0.0012), L(w * 0.42), L(0.0034), 0, 0, Math.PI * 2); g.fill(); }
    g.restore();
  }
  // the parting line, thinning toward the corners
  const t = 0.0013;
  path((x) => at(x) + t * (1 - 0.6 * (x / w) * (x / w)), (x) => at(x) - t * (1 - 0.6 * (x / w) * (x / w)));
  g.fillStyle = gap ? 'rgba(40,14,14,0.9)' : 'rgba(50,22,20,0.88)'; g.fill();
  if (gap) {
    path(low, (x) => low(x) - 0.0008 * (1 - (x / w) * (x / w)));
    g.fillStyle = 'rgba(40,14,14,0.7)'; g.fill();
  }
  // corners: a short tuck, up for a smile, down for a frown
  for (const sgn of [-1, 1]) {
    const lift = sgn < 0 ? shape[0] : shape[1];
    const cx = sgn * w, cy = at(cx);
    const dy = lift > 0.002 ? 0.0028 : lift < -0.001 ? -0.0022 : 0.0008;
    curve(g, cx - sgn * 0.003, at(cx - sgn * 0.003), cx, cy, cx + sgn * 0.0022, cy + dy, 'rgba(50,22,20,0.75)', 0.0011);
  }
}

// The dead: a gaping, ragged hole, lips drawn back and grey.
function deadMouth(g, style, f) {
  const x = px(0), y = py(FACE.mouthY);
  const w = L(FACE.mouthW);
  const h = L(style === 'snarl' ? 0.016 : 0.012);
  g.beginPath();
  g.moveTo(x - w * 0.8, y - L(0.004));
  for (let i = 0; i <= 6; i++) g.lineTo(x - w * 0.8 + (i / 6) * w * 1.6, y - L(0.004) + (i % 2 ? -L(0.002) : L(0.001)));
  g.quadraticCurveTo(x + w * 0.3, y + h, x - w * 0.8, y - L(0.004));
  g.strokeStyle = lipTone(f, 'm', -0.1); g.lineWidth = L(0.005); g.stroke();
  g.fillStyle = '#1a0606'; g.fill();
  g.strokeStyle = '#4a1010'; g.lineWidth = L(0.0022); g.stroke();
  g.save(); g.clip(); g.fillStyle = '#c8c0a0';
  for (let i = 0; i < 6; i++) g.fillRect(x - w * 0.7 + i * w * 0.25, y - L(0.004), w * 0.14, L(0.004) + (i % 3) * L(0.0012));
  g.restore();
}

// A beard: over the jaw and chin, up the cheeks, clear of the mouth.
function beard(g, color) {
  const hx = FACE.mouthW + 0.012; // the bare skin round the mouth
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(px(-0.1), py(1.245));
  g.quadraticCurveTo(px(-0.1), py(1.14), px(0), py(1.128));
  g.quadraticCurveTo(px(0.1), py(1.14), px(0.1), py(1.245));
  g.quadraticCurveTo(px(0.075), py(1.232), px(hx), py(FACE.underNose));
  // round the mouth
  g.lineTo(px(hx), py(FACE.lipBot - 0.002)); g.quadraticCurveTo(px(0), py(FACE.lipBot - 0.018), px(-hx), py(FACE.lipBot - 0.002)); g.lineTo(px(-hx), py(FACE.underNose));
  g.quadraticCurveTo(px(-0.075), py(1.232), px(-0.1), py(1.245));
  g.fill();
  speckle(g, -0.1, 0.1, 1.13, 1.245, shade(color, 0.25) + '66', 380, 0.0011, true);
  moustache(g, color);
}

function moustache(g, color) {
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(px(0), py(FACE.underNose - 0.001));
  const w = FACE.mouthW;
  g.quadraticCurveTo(px(w * 0.85), py(FACE.underNose), px(w + 0.009), py(FACE.mouthY - 0.004));
  g.quadraticCurveTo(px(w * 0.7), py(FACE.lipTop + 0.001), px(0), py(FACE.lipTop + 0.002));
  g.quadraticCurveTo(px(-w * 0.7), py(FACE.lipTop + 0.001), px(-w - 0.009), py(FACE.mouthY - 0.004));
  g.quadraticCurveTo(px(-w * 0.85), py(FACE.underNose), px(0), py(FACE.underNose - 0.001));
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
const smoothstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// two '#rrggbb' colours mixed (t of the way to b), lightened or darkened by k, as css
function mix(a, b, t, alpha = 1, k = 0) {
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const A = rgb(a), B = rgb(b);
  const c = A.map((v, i) => Math.max(0, Math.min(255, Math.round((v + (B[i] - v) * t) * (1 + k)))));
  return `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;
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
