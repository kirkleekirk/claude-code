/**
 * GLSL for people, spliced into a MaterialKit standard material. The mesh carries regions and
 * bind-pose positions; colours, prints and the face come from per-actor uniforms:
 *
 *   uPal[21]   region colours (linear)          uPrint.x  top print id
 *   uFace[0]   blink, brow lift, brow tilt, eye open
 *   uFace[1]   smile, mouth open, smug, worry
 *   uFace[2]   gaze x, gaze y, eye spread, brow weight
 *   uFace[3]   iris rgb, stubble
 *   uHeadC     head centre (bind space) and radius
 */

export const PEOPLE_VERTEX_PARS = /* glsl */ `
attribute vec4 look;
flat varying float vRegion;
flat varying float vPart;
varying vec4 vLook;
varying vec3 vBind;
varying vec3 vBindN;
`;

export const PEOPLE_VERTEX_MAIN = /* glsl */ `
vRegion = look.x;
vPart = look.w;
vLook = look;
vBind = position;
vBindN = normal;
`;

export const PEOPLE_FRAGMENT_PARS = /* glsl */ `
uniform vec3 uPal[21];
uniform vec4 uFace[4];
uniform vec4 uHeadC;
uniform vec4 uPrint;
uniform vec4 uCloth;
uniform vec4 uCloth2;
flat varying float vRegion;
flat varying float vPart;
varying vec4 vLook;
varying vec3 vBind;
varying vec3 vBindN;
float ppRough;
float ppMetal;
vec3 ppEmit;

float ppAA(float d) {
  float w = max(fwidth(d), 1e-4) * 0.75;
  return 1.0 - smoothstep(-w, w, d);
}
float ppHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
vec2 ppRot(vec2 p, float a) {
  float c = cos(a), s = sin(a);
  return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}
float ppSegment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}
float ppEllipse(vec2 p, vec2 r) {
  return (length(p / r) - 1.0) * min(r.x, r.y);
}

// ── prints (p in metres on one projection plane) ───────────────────────────
float ppLeaf(vec2 q, float a, float len, float wid) {
  vec2 r = ppRot(q, -a);
  r.x -= len * 0.5;
  return ppEllipse(r, vec2(len * 0.5, wid * (0.35 + 0.65 * (1.0 - abs(r.x) / (len * 0.5)))));
}
float ppPrint(vec2 p, float id) {
  if (id < 0.5) return 0.0;
  if (id < 1.5) {
    float s = fract(p.y / 0.07);
    return ppAA(abs(s - 0.5) * 0.07 - 0.016);
  }
  if (id < 2.5) {
    // Palm fronds on a staggered grid.
    vec2 g = p / 0.1;
    g.x += 0.5 * mod(floor(g.y), 2.0);
    vec2 cell = floor(g);
    vec2 q = (fract(g) - 0.5) * 0.1;
    float h = ppHash(cell);
    q = ppRot(q, h * 6.283);
    float d = 1.0;
    for (int k = 0; k < 5; k++) {
      float a = 0.6 + float(k) * 0.48 + h * 0.3;
      d = min(d, ppLeaf(q + vec2(0.0, 0.02), a, 0.042, 0.012));
    }
    d = min(d, ppSegment(q, vec2(0.0, -0.02), vec2(0.004, -0.045)) - 0.0025);
    return ppAA(d);
  }
  if (id < 3.5) {
    // Hibiscus: five round petals and a darker heart (returned as 2).
    vec2 g = p / 0.11;
    g.x += 0.5 * mod(floor(g.y), 2.0);
    vec2 cell = floor(g);
    vec2 q = (fract(g) - 0.5) * 0.11;
    float h = ppHash(cell);
    q = ppRot(q, h * 6.283);
    float r = length(q);
    float a = atan(q.y, q.x);
    float edge = 0.031 * (0.72 + 0.28 * cos(5.0 * a));
    float petals = ppAA(r - edge);
    float heart = ppAA(r - 0.007);
    return petals + heart;
  }
  if (id < 4.5) {
    // Flamingos: body, S-neck, head and a leg.
    vec2 g = p / vec2(0.1, 0.12);
    g.x += 0.5 * mod(floor(g.y), 2.0);
    vec2 cell = floor(g);
    vec2 q = (fract(g) - 0.5) * vec2(0.1, 0.12);
    if (ppHash(cell) > 0.5) q.x = -q.x;
    float d = ppEllipse(q - vec2(0.0, 0.0), vec2(0.018, 0.011));
    d = min(d, abs(length(q - vec2(0.012, 0.018)) - 0.012) - 0.0028 + max(0.0, -(q.x - 0.012)) * 2.0);
    d = min(d, length(q - vec2(0.004, 0.035)) - 0.005);
    d = min(d, ppSegment(q, vec2(0.0, -0.008), vec2(0.002, -0.04)) - 0.0016);
    return ppAA(d);
  }
  if (id < 5.5) {
    vec2 s = abs(fract(p / 0.05) - 0.5) * 0.05;
    float bx = ppAA(s.x - 0.012), by = ppAA(s.y - 0.012);
    return 0.45 * bx + 0.45 * by;
  }
  float v = p.y + abs(fract(p.x / 0.06) - 0.5) * 0.06;
  float s = fract(v / 0.06);
  return ppAA(abs(s - 0.5) * 0.06 - 0.013);
}

float ppBit(float flags, float bit) { return mod(floor(flags / bit + 0.001), 2.0); }

/** Skin showing through the top (necklines, armholes): > 0 inside the opening (metres). */
float ppOpening(vec3 p) {
  float nk = uCloth.x;
  float ax = abs(p.x);
  bool front = p.z < -0.005;
  float crew = p.y - (uCloth.w + (front ? 0.0 : 0.01));
  float d = crew;
  if (abs(nk - 1.0) < 0.5 || abs(nk - 5.0) < 0.5) {
    if (front) d = p.y - ((nk < 1.5 ? 1.375 : 1.39) + ax * 1.7);
  } else if (abs(nk - 3.0) < 0.5) {
    d = front ? p.y - (1.415 + ax * ax * 2.6) : p.y - 1.45;
  } else if (abs(nk - 6.0) < 0.5) {
    d = min(p.y - 1.37, abs(ax - 0.09) - 0.016);
  }
  if (ppBit(uCloth.y, 1.0) > 0.5 && abs(nk - 6.0) > 0.5) d = max(d, min(ax - uCloth2.x, p.y - 1.34));
  return d;
}

// ── the face (q in head units, x = character's right, y up) ────────────────
vec3 ppFace(vec3 skin, vec2 q) {
  vec3 col = skin;
  float blink = uFace[0].x;
  float browLift = uFace[0].y;
  float browTilt = uFace[0].z;
  float eyeOpen = uFace[0].w;
  float smile = uFace[1].x;
  float open = uFace[1].y;
  float smug = uFace[1].z;
  float worry = uFace[1].w;
  vec2 gaze = uFace[2].xy;
  float spread = uFace[2].z;
  float browW = uFace[2].w;
  vec3 iris = uFace[3].rgb;
  float stubble = uFace[3].w;
  vec3 line = vec3(0.09, 0.035, 0.06);
  vec3 hairDark = uPal[8] * 0.55 + vec3(0.01);

  // Cheeks and stubble.
  float cheek = 0.0;
  for (int s = 0; s < 2; s++) {
    float sx = s == 0 ? -1.0 : 1.0;
    cheek += exp(-dot(q - vec2(sx * 0.42, -0.24), q - vec2(sx * 0.42, -0.24)) / 0.012);
  }
  col = mix(col, col * vec3(1.08, 0.86, 0.86), clamp(cheek, 0.0, 1.0) * 0.32);
  if (stubble > 0.0) {
    float jaw = smoothstep(-0.18, -0.42, q.y) * smoothstep(0.75, 0.45, abs(q.x));
    jaw = max(jaw, smoothstep(-0.36, -0.42, q.y) * smoothstep(0.2, 0.0, abs(q.x)));
    float speck = 0.65 + 0.35 * ppHash(floor(q * 180.0));
    col = mix(col, uPal[8] * 0.6, jaw * stubble * 0.5 * speck);
  }

  for (int s = 0; s < 2; s++) {
    float sx = s == 0 ? -1.0 : 1.0;
    vec2 c = vec2(sx * spread, 0.05);
    float h = 0.078 * eyeOpen * (1.0 - blink);
    vec2 e = q - c;
    // Eye white: an almond, flatter on the bottom.
    float d = ppEllipse(vec2(e.x, e.y > 0.0 ? e.y : e.y * 1.25), vec2(0.108, max(h, 0.0015)));
    float white = ppAA(d);
    vec2 ic = c + gaze * vec2(0.035, 0.022);
    float irisD = length(q - ic) - 0.06;
    float pupilD = length(q - ic) - 0.028;
    float glint = ppAA(length(q - ic - vec2(-0.02, 0.024)) - 0.014);
    vec3 eye = vec3(0.98, 0.95, 0.9);
    eye = mix(eye, iris, ppAA(irisD));
    eye = mix(eye, vec3(0.03, 0.02, 0.04), ppAA(pupilD));
    eye = mix(eye, vec3(1.0), glint * 0.9);
    col = mix(col, eye, white);
    // Upper lid line with a little wing; a closed lid is a soft curve.
    float lidY = c.y + h - abs(e.x) * abs(e.x) * 1.4 * (h / 0.078);
    float lid = ppAA(abs(q.y - lidY) - 0.012 - 0.004 * step(0.0, e.x * sx)) * ppAA(abs(e.x) - 0.11 - 0.02 * step(0.0, e.x * sx));
    col = mix(col, line, lid * 0.92);
    // Brow.
    float bx = (q.x - c.x) * sx;
    float by = c.y + 0.155 + browLift * 0.055 - browTilt * (0.07 - bx) * 0.35 + (smug > 0.0 && s == 1 ? smug * 0.035 : 0.0) - bx * bx * 1.6 + 0.015;
    float brow = ppAA(abs(q.y - by) - (0.015 + browW * 0.016) * (1.0 - smoothstep(0.03, 0.12, bx) * 0.45)) * ppAA(abs(bx - 0.005) - 0.105);
    col = mix(col, hairDark, brow * 0.95);
  }

  // Mouth.
  vec2 m = q - vec2(0.0, -0.47);
  float curveY = smile * 3.0 * m.x * m.x - smile * 0.012 + smug * (m.x > 0.0 ? 3.4 * m.x * m.x : -0.8 * m.x * m.x) + worry * 0.012 * sin(m.x * 30.0);
  float width = 0.105 + smile * 0.025;
  float mouthLine = ppAA(abs(m.y - curveY) - 0.0125) * ppAA(abs(m.x) - width);
  float openD = ppEllipse(m - vec2(0.0, curveY - open * 0.03), vec2(width * (0.55 + 0.25 * smile), max(open * 0.045, 0.002)));
  float inner = ppAA(openD) * step(0.02, open);
  vec3 mouth = vec3(0.32, 0.09, 0.14);
  float teeth = ppAA(abs(m.y - (curveY - 0.008)) - 0.009) * step(0.25, smile) * inner;
  col = mix(col, mouth, inner);
  col = mix(col, vec3(0.97, 0.94, 0.88), teeth);
  col = mix(col, line, mouthLine * 0.85);
  float lip = exp(-dot(m - vec2(0.0, -0.035 + curveY * 0.5), m - vec2(0.0, -0.035 + curveY * 0.5)) / 0.0012);
  col = mix(col, col * vec3(1.0, 0.75, 0.78), lip * 0.35 * (1.0 - inner));
  return col;
}
`;

/** Region colour, prints, hair textures and the face; sets ppRough, ppMetal and ppEmit. */
export const PEOPLE_FRAGMENT_COLOR = /* glsl */ `
int rg = int(vRegion + 0.5);
vec3 col = uPal[rg];
int part = int(vPart + 0.5);
ppRough = 0.82;
ppMetal = 0.0;
ppEmit = vec3(0.0);
float tex = vLook.z;
if (rg <= 1) {
  ppRough = 0.58;
  if (rg == 1 && tex < 0.5) {
    vec3 f = (vBind - uHeadC.xyz) / uHeadC.w;
    if (f.z < 0.0) col = mix(col, ppFace(col, f.xy), smoothstep(-0.05, -0.35, f.z));
  }
} else if (rg == 2 || rg == 20) {
  if (rg == 2 && uPrint.x > 0.5) {
    vec3 n = abs(normalize(vBindN));
    vec3 w = pow(n, vec3(4.0));
    w /= (w.x + w.y + w.z);
    float c = ppPrint(vBind.zy, uPrint.x) * w.x + ppPrint(vBind.xy, uPrint.x) * w.z + ppPrint(vBind.xz, uPrint.x) * w.y;
    vec3 accent = uPal[3];
    col = mix(col, accent, clamp(c, 0.0, 1.0));
    if (c > 1.0) col = mix(col, accent * 0.45 + vec3(0.25, 0.2, 0.05), clamp(c - 1.0, 0.0, 1.0));
  }
  ppRough = 0.86;
  if (part == 1) {
    float ax = abs(vBind.x);
    bool front = vBind.z < -0.005;
    if (ppBit(uCloth.y, 2.0) > 0.5 && front) col = mix(col, uPal[20], ppAA(ax - (vBind.y - 1.13) * 0.36) * step(1.13, vBind.y));
    if (uCloth.z > 0.0 && front) col = mix(col, uPal[3], ppAA(ax - 0.008) * smoothstep(uCloth.z - 0.002, uCloth.z + 0.002, vBind.y));
    if (ppBit(uCloth.y, 4.0) > 0.5) col = mix(col, uPal[3], ppAA(abs(vBind.z) - 0.022) * smoothstep(0.11, 0.125, ax) * step(1.0, vBind.y));
    col = mix(col, uPal[0], ppAA(-ppOpening(vBind)));
  } else if (part == 2 && ppBit(uCloth.y, 4.0) > 0.5) {
    col = mix(col, uPal[3], smoothstep(0.86, 0.93, normalize(vBindN).x * sign(vBind.x)));
  }
} else if (rg == 4) {
  if (part == 3 && ppBit(uCloth.y, 4.0) > 0.5) col = mix(col, uPal[5], smoothstep(0.86, 0.93, normalize(vBindN).x * sign(vBind.x)));
} else if (rg == 8 || rg == 9 || rg == 10) {
  float n = texture2D(uNoise, vBind.xz * 3.1 + vBind.y * 1.7).b;
  ppRough = rg == 8 ? 0.48 : 0.8;
  float crown = smoothstep(0.35, 0.95, normalize(vBindN).y);
  col *= 1.0 + (rg == 8 ? 0.28 : 0.1) * crown;
  if (tex < 0.5) {
    col *= 0.9 + 0.2 * n;
  } else if (tex < 1.5) {
    float curl = texture2D(uNoise, vBind.xy * 9.0 + vBind.z * 5.0).b;
    col *= 0.72 + 0.42 * curl;
    ppRough = 0.7;
  } else if (tex < 2.5) {
    col *= 0.7 + 0.3 * smoothstep(-0.3, 0.6, sin(vBind.x * 260.0));
  } else if (tex < 3.5) {
    col *= 0.78 + 0.26 * smoothstep(-0.4, 0.7, sin((vBind.y + sin(vBind.x * 70.0) * 0.012) * 160.0));
  } else if (tex < 4.5) {
    float wv = sin(vBind.x * 420.0 + vBind.z * 60.0) * sin(vBind.z * 420.0 - vBind.x * 60.0);
    col *= 0.86 + 0.18 * wv;
    ppRough = 0.9;
  } else {
    col *= 0.84 + 0.16 * smoothstep(-0.2, 0.5, sin(atan(vBind.z - uHeadC.z, vBind.x) * 46.0));
    ppRough = 0.95;
  }
} else if (rg == 11) {
  ppRough = 0.28;
  ppMetal = 1.0;
} else if (rg == 12) {
  col = mix(col, uPal[12] * 0.25 + vec3(0.25, 0.12, 0.05), smoothstep(0.0, 0.03, vBind.y - uHeadC.y));
  ppRough = 0.06;
} else if (rg == 13 || rg == 16) {
  ppRough = 0.38;
} else if (rg == 17) {
  ppRough = 0.12;
  ppEmit = col * (0.5 + 1.6 * uWeather.z);
} else if (rg == 6 || rg == 14 || rg == 15) {
  ppRough = 0.55;
} else if (rg == 19) {
  ppRough = 0.45;
}
// Shoes: the sole line is cut per pixel so it stays straight on the curved upper.
if (part == 4 && (rg == 6 || rg == 0 || rg == 7)) {
  float sole = ppAA(vBind.y - uCloth2.y);
  col = mix(rg == 7 ? uPal[6] : col, uPal[7], sole);
  ppRough = mix(rg == 0 ? 0.58 : 0.55, 0.8, sole);
}
col *= mix(1.0, vLook.y, 0.85);
diffuseColor.rgb = col;
`;

export const PEOPLE_FRAGMENT_SURFACE = /* glsl */ `
roughnessFactor = ppRough;
metalnessFactor = ppMetal;
`;

export const PEOPLE_FRAGMENT_EMISSIVE = /* glsl */ `
totalEmissiveRadiance += ppEmit;
`;
