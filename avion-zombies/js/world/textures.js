import * as THREE from '../../vendor/three.module.min.js';
import { makeRng, clamp } from '../util.js';

// Procedural, seamlessly tiling canvas textures for the facility and the forest floor.

export function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// Periodic value-noise fBm in [0,1] -> tiles seamlessly.
export function tileNoise(w, h, period, octaves, seed, gain = 0.5) {
  const rng = makeRng(seed);
  const out = new Float32Array(w * h);
  let amp = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    const px = period * (1 << o);
    const py = Math.max(1, Math.round(px * (h / w)));
    const lat = new Float32Array(px * py);
    for (let i = 0; i < lat.length; i++) lat[i] = rng();
    for (let y = 0; y < h; y++) {
      const v = (y / h) * py;
      const y0 = Math.floor(v);
      const fy = v - y0;
      const sy = fy * fy * (3 - 2 * fy);
      const r0 = (y0 % py) * px;
      const r1 = ((y0 + 1) % py) * px;
      for (let x = 0; x < w; x++) {
        const u = (x / w) * px;
        const x0 = Math.floor(u);
        const fx = u - x0;
        const sx = fx * fx * (3 - 2 * fx);
        const c0 = x0 % px;
        const c1 = (x0 + 1) % px;
        const a = lat[r0 + c0] + (lat[r0 + c1] - lat[r0 + c0]) * sx;
        const b = lat[r1 + c0] + (lat[r1 + c1] - lat[r1 + c0]) * sx;
        out[y * w + x] += amp * (a + (b - a) * sy);
      }
    }
    norm += amp;
    amp *= gain;
  }
  for (let i = 0; i < out.length; i++) out[i] /= norm;
  return out;
}

export function toTexture(c, { srgb = true, repeat = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}

export function normalFromHeight(height, w, h, strength = 2) {
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const l = height[y * w + ((x - 1 + w) % w)];
      const r = height[y * w + ((x + 1) % w)];
      const u = height[((y - 1 + h) % h) * w + x];
      const d = height[((y + 1) % h) * w + x];
      let nx = (l - r) * strength;
      let ny = (u - d) * strength;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len;
      ny /= len;
      nz /= len;
      const o = (y * w + x) * 4;
      img.data[o] = (nx * 0.5 + 0.5) * 255;
      img.data[o + 1] = (ny * 0.5 + 0.5) * 255;
      img.data[o + 2] = (nz * 0.5 + 0.5) * 255;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(c, { srgb: false });
}

export function paint(w, h, fn) {
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const col = fn(x, y, y * w + x);
      img.data[o] = clamp(col[0], 0, 255);
      img.data[o + 1] = clamp(col[1], 0, 255);
      img.data[o + 2] = clamp(col[2], 0, 255);
      img.data[o + 3] = col.length > 3 ? clamp(col[3], 0, 255) : 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

const mix = (a, b, t) => a + (b - a) * t;

export function buildTextures() {
  const T = {};
  const S = 512;

  // ---- forest floor: dark loam, moss, needle litter --------------------------------------
  {
    const n1 = tileNoise(S, S, 4, 5, 11);
    const n2 = tileNoise(S, S, 16, 3, 12);
    const n3 = tileNoise(S, S, 64, 2, 13);
    const height = new Float32Array(S * S);
    const c = paint(S, S, (x, y, i) => {
      const moss = clamp((n1[i] - 0.45) * 3, 0, 1);
      const grit = n3[i];
      const r = mix(82, 70, moss) * (0.75 + grit * 0.5) * (0.85 + n2[i] * 0.3);
      const g = mix(64, 86, moss) * (0.75 + grit * 0.5) * (0.85 + n2[i] * 0.3);
      const b = mix(48, 46, moss) * (0.75 + grit * 0.5);
      height[i] = n2[i] * 0.6 + grit * 0.4;
      return [r, g, b];
    });
    // needle litter strokes
    const ctx = c.getContext('2d');
    const rng = makeRng(77);
    for (let k = 0; k < 2600; k++) {
      const x = rng() * S;
      const y = rng() * S;
      const a = rng() * Math.PI;
      const l = 3 + rng() * 7;
      const shade = 60 + rng() * 70;
      ctx.strokeStyle = `rgba(${shade + 30},${shade * 0.7},${shade * 0.4},${0.25 + rng() * 0.35})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      for (const ox of [-S, 0, S]) {
        for (const oy of [-S, 0, S]) {
          ctx.moveTo(x + ox, y + oy);
          ctx.lineTo(x + ox + Math.cos(a) * l, y + oy + Math.sin(a) * l);
        }
      }
      ctx.stroke();
    }
    T.ground = toTexture(c);
    T.groundNormal = normalFromHeight(height, S, S, 3);
  }

  // ---- gravel / logging road --------------------------------------------------------------
  {
    const n1 = tileNoise(S, S, 48, 3, 21);
    const n2 = tileNoise(S, S, 8, 3, 22);
    const height = new Float32Array(S * S);
    const c = paint(S, S, (x, y, i) => {
      const stone = n1[i] > 0.55 ? (n1[i] - 0.55) * 2.2 : 0;
      const v = 70 + n2[i] * 40 + stone * 70;
      height[i] = n1[i];
      return [v * 0.95, v * 0.9, v * 0.82];
    });
    T.gravel = toTexture(c);
    T.gravelNormal = normalFromHeight(height, S, S, 4);
  }

  // ---- concrete: board-formed panels, tie holes, rain streaks ----------------------------
  {
    const n1 = tileNoise(S, S, 8, 5, 31);
    const n2 = tileNoise(S, S, 64, 2, 32);
    const streak = tileNoise(S, S, 32, 3, 33);
    const height = new Float32Array(S * S);
    const c = paint(S, S, (x, y, i) => {
      const panelEdge = (x % 256 < 3 || y % 128 < 2) ? 0.55 : 1;
      const tie = (((x % 128) - 64) ** 2 + ((y % 128) - 64) ** 2) < 16 ? 0.45 : 1;
      const rain = clamp(streak[(i % S) + Math.floor(y / 4) * 0] * 1.2 - 0.3, 0, 1) * (y / S);
      let v = (118 + n1[i] * 50 + n2[i] * 20) * panelEdge * tie * (1 - rain * 0.35);
      height[i] = n1[i] * 0.5 + n2[i] * 0.5 - (panelEdge < 1 ? 0.4 : 0) - (tie < 1 ? 0.5 : 0);
      return [v * 0.97, v, v * 1.02];
    });
    T.concrete = toTexture(c);
    T.concreteNormal = normalFromHeight(height, S, S, 2.5);
  }

  // ---- corrugated metal (hangar, sheds) ---------------------------------------------------
  {
    const n1 = tileNoise(S, S, 4, 4, 41);
    const rust = tileNoise(S, S, 16, 4, 42);
    const height = new Float32Array(S * S);
    const c = paint(S, S, (x, y, i) => {
      const rib = Math.sin((x / S) * Math.PI * 2 * 24);
      const shade = 0.78 + rib * 0.16;
      // rust weeps down in streaks (noise stretched vertically) and gathers near the bottom
      const streak = clamp((rust[Math.floor(y * 0.12) * S + x] - 0.56) * 3, 0, 1);
      const blotch = clamp((rust[i] - 0.68) * 3, 0, 1);
      const rr = Math.max(streak * 0.55, blotch) * clamp(y / S + 0.25, 0.25, 1);
      height[i] = rib * 0.5 + 0.5;
      const base = [128, 138, 134];
      return [
        mix(base[0], 124, rr) * shade * (0.85 + n1[i] * 0.3),
        mix(base[1], 98, rr) * shade * (0.85 + n1[i] * 0.3),
        mix(base[2], 78, rr) * shade * (0.85 + n1[i] * 0.3),
      ];
    });
    T.corrugated = toTexture(c);
    T.corrugatedNormal = normalFromHeight(height, S, S, 1.6);
  }

  // ---- painted steel panels (Avion slate) -------------------------------------------------
  {
    const n1 = tileNoise(S, S, 8, 4, 51);
    const wear = tileNoise(S, S, 32, 3, 52);
    const height = new Float32Array(S * S);
    const c = paint(S, S, (x, y, i) => {
      const seam = (x % 128 < 2 || y % 256 < 2) ? 0.5 : 1;
      const rivet = ((x % 128) - 8) ** 2 + ((y % 32) - 16) ** 2 < 5 || ((x % 128) - 120) ** 2 + ((y % 32) - 16) ** 2 < 5;
      const scratched = wear[i] > 0.66 ? 1.12 : 1;
      height[i] = (seam < 1 ? -0.5 : 0) + (rivet ? 0.8 : 0) + n1[i] * 0.2;
      const v = (0.8 + n1[i] * 0.3) * seam * scratched * (rivet ? 1.3 : 1);
      return [118 * v, 126 * v, 134 * v];
    });
    T.steel = toTexture(c);
    T.steelNormal = normalFromHeight(height, S, S, 2);
  }

  // ---- bark ------------------------------------------------------------------------------
  {
    const W = 256;
    const H = 512;
    const n1 = tileNoise(W, H, 16, 4, 61);
    const n2 = tileNoise(W, H, 4, 3, 62);
    const height = new Float32Array(W * H);
    const c = paint(W, H, (x, y, i) => {
      const ridge = Math.abs(Math.sin((x / W) * Math.PI * 9 + n2[i] * 6));
      const v = 0.55 + ridge * 0.45 * n1[i] + n1[i] * 0.3;
      height[i] = ridge * 0.7 + n1[i] * 0.3;
      return [70 * v, 52 * v, 40 * v];
    });
    T.bark = toTexture(c);
    T.barkNormal = normalFromHeight(height, W, H, 3);
  }

  // ---- rock with lichen ------------------------------------------------------------------
  {
    const n1 = tileNoise(S, S, 6, 5, 71);
    const n2 = tileNoise(S, S, 24, 3, 72);
    const height = new Float32Array(S * S);
    const c = paint(S, S, (x, y, i) => {
      const lichen = clamp((n2[i] - 0.6) * 4, 0, 1);
      const v = 70 + n1[i] * 70;
      height[i] = n1[i];
      return [mix(v, 96, lichen), mix(v, 106, lichen), mix(v * 1.04, 70, lichen)];
    });
    T.rock = toTexture(c);
    T.rockNormal = normalFromHeight(height, S, S, 3);
  }

  // ---- weathered planks (ranger shed, crates) ---------------------------------------------
  {
    const W = 256;
    const n1 = tileNoise(W, W, 2, 5, 81);
    const n2 = tileNoise(W, W, 32, 2, 82);
    const c = paint(W, W, (x, y, i) => {
      const plank = Math.floor(y / 32);
      const gap = y % 32 < 2 ? 0.35 : 1;
      const grain = 0.75 + Math.sin(x * 0.08 + n1[i] * 9 + plank * 3) * 0.08 + n2[i] * 0.25;
      const tint = 0.9 + ((plank * 37) % 7) * 0.025;
      return [92 * grain * gap * tint, 70 * grain * gap * tint, 52 * grain * gap * tint];
    });
    T.planks = toTexture(c);
  }

  // ---- asphalt ---------------------------------------------------------------------------
  {
    const n1 = tileNoise(S, S, 64, 2, 91);
    const n2 = tileNoise(S, S, 8, 4, 92);
    const c = paint(S, S, (x, y, i) => {
      const v = 40 + n1[i] * 26 + n2[i] * 16;
      return [v, v, v * 1.03];
    });
    T.asphalt = toTexture(c);
  }

  // ---- hazard stripes --------------------------------------------------------------------
  {
    const W = 256;
    const n = tileNoise(W, 64, 8, 3, 95);
    const c = paint(W, 64, (x, y, i) => {
      const s = Math.floor((x + y) / 32) % 2 === 0;
      const dirt = 0.75 + n[i] * 0.35;
      return s ? [215 * dirt, 165 * dirt, 40 * dirt] : [26 * dirt, 26 * dirt, 24 * dirt];
    });
    T.hazard = toTexture(c);
  }

  // ---- chain-link fence (alpha) ----------------------------------------------------------
  {
    const W = 128;
    const c = canvas(W, W);
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, W, W);
    ctx.strokeStyle = 'rgba(150,158,160,1)';
    ctx.lineWidth = 2.2;
    for (let k = -W; k < W * 2; k += 16) {
      ctx.beginPath();
      ctx.moveTo(k, 0);
      ctx.lineTo(k + W, W);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(k + W, 0);
      ctx.lineTo(k, W);
      ctx.stroke();
    }
    T.chainlink = toTexture(c);
  }

  // ---- sprites ---------------------------------------------------------------------------
  {
    const W = 128;
    const c = canvas(W, W);
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(W / 2, W / 2, 0, W / 2, W / 2, W / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.12)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, W);
    T.glow = toTexture(c, { repeat: false });
  }
  {
    const W = 128;
    const n = tileNoise(W, W, 4, 4, 101);
    const c = paint(W, W, (x, y, i) => {
      const dx = (x - W / 2) / (W / 2);
      const dy = (y - W / 2) / (W / 2);
      const r = Math.sqrt(dx * dx + dy * dy);
      const a = clamp(1 - r, 0, 1) ** 1.5 * (0.45 + n[i] * 0.9);
      return [255, 255, 255, a * 255];
    });
    T.smoke = toTexture(c, { repeat: false });
  }
  {
    const W = 64;
    const c = paint(W, W, (x, y) => {
      const dx = (x - W / 2) / (W / 2);
      const dy = (y - W / 2) / (W / 2);
      const a = clamp(1 - Math.sqrt(dx * dx * 0.15 + dy * dy * 3), 0, 1);
      return [255, 255, 255, a * 255];
    });
    T.streak = toTexture(c, { repeat: false });
  }
  {
    const W = 128;
    const rng = makeRng(5);
    const c = canvas(W, W);
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.clearRect(0, 0, W, W);
    for (let k = 0; k < 26; k++) {
      const r = 4 + rng() * 18;
      const a = rng() * Math.PI * 2;
      const d = rng() * 34;
      ctx.fillStyle = `rgba(90,6,6,${0.6 + rng() * 0.4})`;
      ctx.beginPath();
      ctx.arc(W / 2 + Math.cos(a) * d, W / 2 + Math.sin(a) * d, r * (k < 4 ? 1.6 : 0.6), 0, Math.PI * 2);
      ctx.fill();
    }
    T.blood = toTexture(c, { repeat: false });
  }

  return T;
}

// Text signage with a worn print look.
export function makeSign(lines, { w = 512, h = 256, bg = '#1d2226', fg = '#e8e4d8', accent = '#d9a441', stripe = true, font = 'Barlow Condensed' } = {}) {
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  if (stripe) {
    for (let x = -h; x < w + h; x += 36) {
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.moveTo(x, h - 26);
      ctx.lineTo(x + 18, h - 26);
      ctx.lineTo(x + 18 + 26, h);
      ctx.lineTo(x + 26, h);
      ctx.fill();
    }
  }
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const sizes = lines.map((l) => l.size || 64);
  const total = sizes.reduce((a, b) => a + b * 1.1, 0);
  let y = (h - (stripe ? 26 : 0)) / 2 - total / 2;
  lines.forEach((l, i) => {
    ctx.font = `${l.weight || 700} ${sizes[i]}px "${font}", "Arial Narrow", Arial, sans-serif`;
    ctx.fillStyle = l.color || fg;
    y += sizes[i] * 0.55;
    ctx.fillText(l.text, w / 2, y, w - 30);
    y += sizes[i] * 0.55;
  });
  // grime
  const rng = makeRng(lines[0].text.length * 31 + w);
  for (let k = 0; k < 120; k++) {
    ctx.fillStyle = `rgba(0,0,0,${rng() * 0.18})`;
    ctx.fillRect(rng() * w, rng() * h, 2 + rng() * 20, 1 + rng() * 6);
  }
  return toTexture(c, { repeat: false });
}

// The Avion insignia: a stooping falcon reduced to a chevron.
export function drawAvionEmblem(ctx, cx, cy, s, color) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -48);
  ctx.lineTo(14, -14);
  ctx.lineTo(60, -26);
  ctx.lineTo(22, 6);
  ctx.lineTo(0, 46);
  ctx.lineTo(-22, 6);
  ctx.lineTo(-60, -26);
  ctx.lineTo(-14, -14);
  ctx.closePath();
  ctx.fill();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.moveTo(0, -18);
  ctx.lineTo(8, 2);
  ctx.lineTo(0, 18);
  ctx.lineTo(-8, 2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function makeEmblemTexture(color = '#e8e4d8', bg = null, size = 256) {
  const c = canvas(size, size);
  const ctx = c.getContext('2d');
  if (bg) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, size, size);
  }
  drawAvionEmblem(ctx, size / 2, size / 2, size / 140, color);
  return toTexture(c, { repeat: false });
}

// Icon canvas for perk screens / power-ups / HUD-in-world.
export function makeIconTexture(draw, size = 256) {
  const c = canvas(size, size);
  const ctx = c.getContext('2d');
  draw(ctx, size);
  return toTexture(c, { repeat: false });
}
