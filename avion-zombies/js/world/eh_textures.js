import * as THREE from '../../vendor/three.module.min.js';
import { tileNoise, toTexture, normalFromHeight, paint, canvas } from './textures.js';
import { std, basic } from './materials.js';
import { markOpenAir } from './fog.js';
import { makeRng, clamp } from '../util.js';

// Textures and materials for Ember Hollow's 1930s lodge, the plaza, the tour and the reactor.
// Built once and kept (shared) across map switches.

const mix = (a, b, t) => a + (b - a) * t;

// jittered-grid cells: returns per-pixel nearest cell id and edge distance (tileable)
function cells(S, n, seed, aspect = 1) {
  let st = seed;
  const r = () => ((st = (st * 16807) % 2147483647) / 2147483647);
  const ny = Math.max(1, Math.round(n * aspect));
  const pts = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < n; i++) pts.push([(i + 0.15 + r() * 0.7) / n, (j + 0.15 + r() * 0.7) / ny, r()]);
  const id = new Float32Array(S * S);
  const edge = new Float32Array(S * S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S;
      const v = y / S;
      const ci = Math.floor(u * n);
      const cj = Math.floor(v * ny);
      let d1 = 9;
      let d2 = 9;
      let best = 0;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const a = (ci + di + n) % n;
          const b = (cj + dj + ny) % ny;
          const p = pts[b * n + a];
          let dx = Math.abs(p[0] - u);
          let dy = Math.abs(p[1] - v);
          dx = Math.min(dx, 1 - dx) * n;
          dy = Math.min(dy, 1 - dy) * ny;
          const d = Math.hypot(dx, dy);
          if (d < d1) {
            d2 = d1;
            d1 = d;
            best = p[2];
          } else if (d < d2) d2 = d;
        }
      }
      id[y * S + x] = best;
      edge[y * S + x] = d2 - d1;
    }
  }
  return { id, edge };
}

let CACHE = null;
export function ehTextures() {
  if (CACHE) return CACHE;
  const T = {};
  const S = 512;
  // ---- river-rock masonry (lodge foundation, portal, plaza walls) ----
  {
    const { id, edge } = cells(S, 7, 3301, 1.1);
    const n1 = tileNoise(S, S, 32, 3, 3302);
    const n2 = tileNoise(S, S, 8, 3, 3303);
    const h = new Float32Array(S * S);
    const c = paint(S, S, (x, y, i) => {
      const e = edge[i];
      const mortar = e < 0.09;
      const round = clamp(e / 0.35, 0, 1);
      h[i] = mortar ? 0 : Math.sqrt(round) * 0.8 + n1[i] * 0.2;
      if (mortar) {
        const m = 128 + n1[i] * 30;
        return [m, m * 0.97, m * 0.9];
      }
      const tone = id[i];
      const base = tone < 0.33 ? [118, 112, 104] : tone < 0.66 ? [96, 92, 90] : [132, 118, 98];
      const sh = (0.7 + 0.35 * Math.sqrt(round)) * (0.85 + n2[i] * 0.3);
      return [base[0] * sh, base[1] * sh, base[2] * sh];
    });
    T.stone = toTexture(c);
    T.stoneNormal = normalFromHeight(h, S, S, 4);
  }
  // ---- log siding with light chinking ----
  {
    const n1 = tileNoise(S, S, 4, 4, 3311);
    const grain = tileNoise(S, S, 64, 2, 3312);
    const h = new Float32Array(S * S);
    const logs = 4;
    const c = paint(S, S, (x, y, i) => {
      const v = ((y / S) * logs) % 1;
      const chink = v < 0.08;
      const round = Math.sin(clamp((v - 0.08) / 0.92, 0, 1) * Math.PI);
      h[i] = chink ? 0.1 : 0.2 + round * 0.8;
      if (chink) return [176, 168, 150];
      const g = 0.75 + grain[(y * S + ((x * 3) % S)) % (S * S)] * 0.3;
      const sh = (0.62 + 0.38 * round) * g * (0.85 + n1[i] * 0.3);
      return [92 * sh, 62 * sh, 40 * sh];
    });
    T.logs = toTexture(c);
    T.logsNormal = normalFromHeight(h, S, S, 3);
  }
  // ---- cedar shakes ----
  {
    const rng = makeRng(3321);
    const n1 = tileNoise(S, S, 16, 3, 3322);
    const h = new Float32Array(S * S);
    const rows = 8;
    const offs = [];
    for (let r = 0; r < rows; r++) {
      const cuts = [0];
      let x = 0;
      while (x < 1) {
        x += 0.06 + rng() * 0.1;
        cuts.push(Math.min(1, x));
      }
      offs.push(cuts.map((v) => [v, rng()]));
    }
    const c = paint(S, S, (x, y, i) => {
      const v = (y / S) * rows;
      const row = Math.floor(v);
      const fy = v - row;
      const u = x / S;
      const cuts = offs[row];
      let k = 0;
      while (k < cuts.length - 1 && cuts[k + 1][0] < u) k++;
      const edgeX = Math.min(u - cuts[k][0], (cuts[k + 1] ? cuts[k + 1][0] : 1) - u) * S;
      const gap = edgeX < 1.5;
      const tone = cuts[k][1];
      h[i] = gap ? 0 : fy * 0.8 + n1[i] * 0.2;
      const sh = gap ? 0.35 : (0.55 + fy * 0.5) * (0.8 + n1[i] * 0.4);
      const base = [mix(88, 112, tone), mix(78, 92, tone), mix(70, 76, tone)];
      return [base[0] * sh, base[1] * sh, base[2] * sh];
    });
    T.shakes = toTexture(c);
    T.shakesNormal = normalFromHeight(h, S, S, 3);
  }
  // ---- flagstone paving ----
  {
    const { id, edge } = cells(S, 5, 3331, 1);
    const n1 = tileNoise(S, S, 16, 4, 3332);
    const n2 = tileNoise(S, S, 64, 2, 3333);
    const h = new Float32Array(S * S);
    const c = paint(S, S, (x, y, i) => {
      const joint = edge[i] < 0.06;
      h[i] = joint ? 0 : 0.6 + n1[i] * 0.3 + n2[i] * 0.1;
      if (joint) return [70, 66, 58];
      const t = id[i];
      const base = t < 0.4 ? [150, 140, 122] : t < 0.75 ? [128, 124, 116] : [160, 132, 104];
      const sh = 0.78 + n1[i] * 0.3 + n2[i] * 0.12;
      return [base[0] * sh, base[1] * sh, base[2] * sh];
    });
    T.flag = toTexture(c);
    T.flagNormal = normalFromHeight(h, S, S, 3);
  }
  // ---- varnished floorboards ----
  {
    const W = 256;
    const n1 = tileNoise(W, W, 2, 4, 3341);
    const grain = tileNoise(W, W, 48, 2, 3342);
    const c = paint(W, W, (x, y, i) => {
      const board = Math.floor((x / W) * 8);
      const seam = x % 32 < 1 || ((y + board * 57) % 256) < 1;
      const tone = 0.8 + 0.25 * Math.sin(board * 12.9);
      const g = 0.82 + grain[i] * 0.3;
      const v = seam ? 0.45 : tone * g * (0.9 + n1[i] * 0.2);
      return [128 * v, 86 * v, 52 * v];
    });
    T.floor = toTexture(c);
  }
  // ---- painted parking lines on asphalt are geometry; a souvenir shelf strip is a canvas ----
  for (const t of Object.values(T)) t.userData.shared = true;
  CACHE = T;
  return T;
}

let MATS = null;
// Extra materials (added to the shared set the first time they're asked for).
export function ehMaterials(M) {
  if (MATS) return MATS;
  const T = ehTextures();
  const rep = (tex, x, y = x) => {
    const t = tex.clone();
    t.repeat.set(x, y);
    t.needsUpdate = true;
    t.userData.shared = true;
    return t;
  };
  const X = {};
  X.stone = std({ map: rep(T.stone, 1), normalMap: rep(T.stoneNormal, 1), roughness: 0.92, color: 0xd8d2c8 });
  X.logs = std({ map: rep(T.logs, 1), normalMap: rep(T.logsNormal, 1), roughness: 0.85, color: 0xd0c4b8 });
  X.shakes = std({ map: rep(T.shakes, 1), normalMap: rep(T.shakesNormal, 1), roughness: 0.9, color: 0xc8c0b8 });
  X.flag = std({ map: rep(T.flag, 1), normalMap: rep(T.flagNormal, 1), roughness: 0.9, color: 0xdad6cc });
  X.floor = std({ map: rep(T.floor, 1), roughness: 0.45, color: 0xd8ccc0 });
  X.planksDark = std({ map: M.planks.map, roughness: 0.6, color: 0x7a5a42 });
  // outside faces of buildings: lit by the open sky whatever the indoor mask says
  X.logsOut = markOpenAir(std({ map: rep(T.logs, 1), normalMap: rep(T.logsNormal, 1), roughness: 0.85, color: 0xd0c4b8 }));
  X.stoneOut = markOpenAir(std({ map: rep(T.stone, 1), normalMap: rep(T.stoneNormal, 1), roughness: 0.92, color: 0xd8d2c8 }));
  X.trimOut = markOpenAir(std({ color: 0x3e5a3a, roughness: 0.55 }));
  X.planksOut = markOpenAir(std({ map: M.planks.map, roughness: 0.6, color: 0x7a5a42 }));
  markOpenAir(X.shakes);
  // peeled log posts and beams (the log-wall texture has chinking bands)
  X.peeledOut = markOpenAir(std({ color: 0x86603f, roughness: 0.72 }));
  X.peeled = std({ color: 0x86603f, roughness: 0.72 });
  // knotty pine boards for partitions and ceilings
  X.pine = std({ map: M.planks.map, roughness: 0.55, color: 0xc89a66 });
  X.lensWhite = basic({ color: new THREE.Color(1.6, 1.55, 1.4) });
  X.lensRed = std({ color: 0x7a1010, roughness: 0.25, emissive: 0x300000 });
  X.lensAmber = std({ color: 0xc87010, roughness: 0.25, emissive: 0x301800 });
  X.rope = std({ color: 0x8a1c1c, roughness: 0.8 });
  X.felt = std({ color: 0x2e4a36, roughness: 1 });
  // the Kestrel: Avion grey outside (open-air lit), a dark cabin inside
  X.hullOut = markOpenAir(std({ color: 0xa4a9ad, roughness: 0.45, metalness: 0.35 }));
  X.darkOut = markOpenAir(std({ color: 0x3b4045, roughness: 0.5, metalness: 0.4 }));
  X.glassOut = markOpenAir(std({ color: 0x141b20, roughness: 0.06, metalness: 0.85 }));
  X.hullIn = std({ color: 0x4d544f, roughness: 0.8, side: THREE.BackSide });
  X.cabin = std({ color: 0x4d544f, roughness: 0.8 });
  // plain stand-ins for the vertex-coloured rock materials, for geometry without colours
  X.dirt = std({ color: 0x4a3c30, roughness: 1 });
  X.modelRock = std({ color: 0x8a7c6a, roughness: 0.9 });
  X.modelForest = std({ color: 0x4a5a3c, roughness: 0.85 });
  X.amethyst = std({ color: 0x8a68c8, roughness: 0.25, metalness: 0.1 });
  X.trim = std({ color: 0x3e5a3a, roughness: 0.55 }); // NPS green window trim
  X.brass = std({ color: 0xb08a48, roughness: 0.32, metalness: 0.85 });
  X.chrome = std({ color: 0xd4d8dc, roughness: 0.18, metalness: 0.95 });
  X.paintRed = std({ color: 0x8a2a24, roughness: 0.42, metalness: 0.35 });
  X.paintBlue = std({ color: 0x2f4e70, roughness: 0.42, metalness: 0.35 });
  X.paintWhite = std({ color: 0xd8d6d0, roughness: 0.45, metalness: 0.3 });
  X.paintGreen = std({ color: 0x3f5a46, roughness: 0.45, metalness: 0.3 });
  X.paintTan = std({ color: 0xb4a07c, roughness: 0.5, metalness: 0.25 });
  X.paintYellow = std({ color: 0xc89a2c, roughness: 0.5, metalness: 0.2 });
  X.tire = std({ color: 0x141516, roughness: 0.92 });
  X.window = std({ color: 0x2a3438, roughness: 0.08, metalness: 0.6, transparent: true, opacity: 0.55, depthWrite: false });
  X.lineWhite = std({ color: 0xd8d4c8, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  X.lineYellow = std({ color: 0xd8b03a, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  X.calcite = std({ vertexColors: true, roughness: 0.38, metalness: 0 });
  X.calciteDry = std({ vertexColors: true, roughness: 0.75, metalness: 0 });
  X.calciteDouble = std({ vertexColors: true, roughness: 0.4, metalness: 0, side: THREE.DoubleSide });
  X.lake = std({ color: 0x04080a, roughness: 0.03, metalness: 0.3 });
  // selenite: milky and faceted, with a faint cold glow that keeps it readable in the dark
  X.crystal = std({ vertexColors: true, color: 0xfaf6ee, roughness: 0.12, metalness: 0, transparent: true, opacity: 0.7, emissive: 0x9aa6ac, emissiveIntensity: 0.12, depthWrite: false, side: THREE.DoubleSide, flatShading: true });
  X.water = std({ color: 0x0c1418, roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.88, depthWrite: false });
  X.hotWater = std({ color: 0x1d7c84, roughness: 0.05, metalness: 0.0, transparent: true, opacity: 0.78, emissive: 0x0c3a3e, emissiveIntensity: 0.5, depthWrite: false });
  X.lava = basic({ color: new THREE.Color(4.2, 1.1, 0.25) });
  X.lavaCrust = std({ color: 0x2a1a14, roughness: 0.95, emissive: 0xff4a12, emissiveIntensity: 0.25 });
  X.grate = std({ color: 0x5a5f64, roughness: 0.5, metalness: 0.7, transparent: true, opacity: 0.92 });
  X.yellowDuct = std({ color: 0xc8a020, roughness: 0.7, metalness: 0.0 });
  X.cable = std({ color: 0x1a1c1e, roughness: 0.6 });
  X.plush = std({ color: 0x2a2428, roughness: 1 });
  for (const m of Object.values(X)) {
    m.userData.shared = true;
    for (const k of ['map', 'normalMap']) if (m[k]) m[k].userData.shared = true;
  }
  MATS = X;
  return X;
}

// A shelf-strip texture of souvenirs (geodes, mugs, plush bats, tees) for gift-shop shelving.
export function souvenirTexture(seed) {
  const c = canvas(512, 128);
  const ctx = c.getContext('2d');
  const rng = makeRng(seed);
  ctx.fillStyle = '#5a4030';
  ctx.fillRect(0, 0, 512, 128);
  let x = 6;
  while (x < 500) {
    const kind = rng();
    const w = 18 + rng() * 34;
    if (kind < 0.3) {
      // geode halves: crystal-lined
      ctx.fillStyle = '#4a3f3a';
      ctx.beginPath();
      ctx.ellipse(x + w / 2, 100, w / 2, w * 0.42, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = rng() < 0.5 ? '#8a68c8' : '#d8d0c8';
      ctx.beginPath();
      ctx.ellipse(x + w / 2, 100, w * 0.36, w * 0.3, 0, Math.PI, 0);
      ctx.fill();
    } else if (kind < 0.5) {
      // mugs
      ctx.fillStyle = ['#d8d2c4', '#2f4e70', '#8a2a24'][Math.floor(rng() * 3)];
      ctx.fillRect(x, 70, w * 0.7, 34);
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(x + w * 0.75, 86, 8, -1.2, 1.2);
      ctx.stroke();
    } else if (kind < 0.7) {
      // plush bats
      ctx.fillStyle = '#2a2428';
      ctx.beginPath();
      ctx.ellipse(x + w / 2, 88, w * 0.18, 14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x + w / 2, 84);
      ctx.lineTo(x, 74);
      ctx.lineTo(x + w * 0.2, 92);
      ctx.lineTo(x + w / 2, 90);
      ctx.lineTo(x + w * 0.8, 92);
      ctx.lineTo(x + w, 74);
      ctx.closePath();
      ctx.fill();
    } else {
      // folded tees
      ctx.fillStyle = ['#3f5a46', '#c89a2c', '#2f4e70', '#9a3a2a', '#d8d2c4'][Math.floor(rng() * 5)];
      for (let k = 0; k < 4; k++) ctx.fillRect(x, 104 - k * 9, w, 8);
    }
    x += w + 6 + rng() * 6;
  }
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, 118, 512, 10);
  const t = toTexture(c);
  t.wrapS = THREE.ClampToEdgeWrapping;
  return t;
}
