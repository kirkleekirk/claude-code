// Terrain for one chunk column at a time, laid out the way CastleMiner Z lays out its world:
// zones in rings by distance from the start tower, always in the same order, each harder to
// cross than the last. There's no water anywhere (the riverbeds are dry), and under all of it,
// about forty blocks down, a bloodstone roof over the Underworld.
//
//   Spawn               0 –   25   the bedrock tower, lantern-tipped
//   The Hills          25 –  200   steep green hills and tall stone ones, trees, sandy hollows
//   Floating Islands  200 –  950   islands in the sky, cliffs, overhangs, dry riverbeds
//   The Desert        950 – 1600   mostly flat sand and dunes; no caves
//   The Mountains    1600 – 2300   very steep peaks and passes, snow on the tops
//   The Snowfields   2300 – 3000   flat snow, frozen lakes, dips and holes
//   World's Edge     3000 – 3400   ore everywhere; the land sinks, with pits into the Underworld
//   Hell on Earth    3400 – 5000   bloodstone and lava lakes under a black sky
//
// Between 300 and 3600 out, the original's crash sites: here and there a crater, an asteroid of
// space rock in it, Space Goo glowing in the rock, and the ground hollowed out under it.
//
// Past Hell a new world begins: the zones again in reverse, back to the Hills at about 9100,
// and round again. Shared by the workers and the main thread (no DOM, no three.js).

import { Noise, Perlin, hash2, hash3, mulberry32, clamp, lerp, smoothstep } from '../core/noise.js';
import { B, CHUNK, HEIGHT, COLUMN_SIZE } from './blocks.js';

export const BIOMES = ['The Hills', 'Floating Islands', 'The Desert', 'The Mountains', 'The Snowfields', "World's Edge", 'Hell on Earth'];
export const BIOME = { HILLS: 0, ISLANDS: 1, DESERT: 2, MOUNTAIN: 3, SNOW: 4, EDGE: 5, HELL: 6 };
// the stretches along the way out and back: [where it starts, zone, which way through it]
const SEG = [
  [0, 0, 1], [200, 1, 1], [950, 2, 1], [1600, 3, 1], [2300, 4, 1], [3000, 5, 1], [3400, 6, 1],
  [5000, 5, -1], [5400, 4, -1], [6500, 3, -1], [7000, 2, -1], [7800, 1, -1], [8600, 0, -1],
];
export const CYCLE = 9100;
const BLEND = 45; // half-width of the blend between two zones

// the tower: bedrock, stepping in from 9 to 7 to 5 blocks across, lanterns at the top
export const TOWER = { tiers: [[4, 12], [3, 24], [2, 34]], height: 34 };
const SPAWN_Z = 30;
export const LAVA_LEVEL_HELL = 27;
export const LAVA_LEVEL_DEEP = 6;
// the Underworld: a bloodstone roof about forty blocks under the ground, a cavern below it
export const UNDER = { floor: 7, ceil: 20, roof: 25 };

export class WorldGen {
  constructor(seed = 1337) {
    this.seed = seed | 0;
    const s = this.seed;
    this.nH = new Noise(s + 1);
    this.nD = new Noise(s + 2);
    this.nB = new Noise(s + 3);
    this.nC1 = new Noise(s + 4);
    this.nC2 = new Noise(s + 5);
    this.nC3 = new Noise(s + 6);
    this.nI = new Noise(s + 7);
    this.nO = new Noise(s + 8);
    this.nS = new Noise(s + 9);
    this.nHell = new Noise(s + 10);
    this.nCrash = new Perlin(s + 11);
    this.w = new Float32Array(7);
    this.spawnY = null;
  }

  // Distance used for the rings: true distance from the tower, nudged by noise so the
  // borders wander instead of being perfect circles.
  ringDistance(x, z) {
    const d = Math.sqrt(x * x + z * z);
    if (d < 150) return d;
    return d + 38 * this.nB.n2(x / 310, z / 310) * smoothstep(150, 260, d);
  }

  // Which stretch of the way a distance falls in: { i, d } (d within the cycle).
  segment(dr) {
    const d = ((dr % CYCLE) + CYCLE) % CYCLE;
    let i = SEG.length - 1;
    while (i > 0 && SEG[i][0] > d) i--;
    return { i, d };
  }

  // Blend weights of the seven zones at (x, z), written into this.w. Returns the index of the strongest.
  weights(x, z, out = this.w) {
    const { i, d } = this.segment(this.ringDistance(x, z));
    out.fill(0);
    const a = SEG[i][0], b = i + 1 < SEG.length ? SEG[i + 1][0] : CYCLE;
    const zone = SEG[i][1];
    const prev = i > 0 ? SEG[i - 1][1] : SEG[SEG.length - 1][1];
    const next = i + 1 < SEG.length ? SEG[i + 1][1] : SEG[0][1];
    let w = 1;
    if (d - a < BLEND && a > 0) { const t = smoothstep(a - BLEND, a + BLEND, d); w = t; out[prev] += 1 - t; }
    if (b - d < BLEND) { const t = smoothstep(b - BLEND, b + BLEND, d); w = Math.min(w, 1 - t); out[next] += t; }
    out[zone] += w;
    let sum = 0, best = 0, bw = -1;
    for (let k = 0; k < 7; k++) sum += out[k];
    for (let k = 0; k < 7; k++) {
      out[k] /= sum || 1;
      if (out[k] > bw) { bw = out[k]; best = k; }
    }
    return best;
  }

  // The strongest zone at (x, z).
  biomeAt(x, z) {
    return this.weights(x, z, new Float32Array(7));
  }

  // How far down World's Edge has sunk at (x, z): 0 where it starts, 1 at Hell's gate.
  decentProgress(x, z) {
    const { i, d } = this.segment(this.ringDistance(x, z));
    const [a, zone, dir] = SEG[i];
    if (zone === 6) return 1;
    if (zone !== 5) return 0;
    const t = clamp((d - a) / 400, 0, 1);
    return dir > 0 ? t : 1 - t;
  }

  // How far out a place counts as, the way out: on the way back, where it would be on the way
  // out through the same zone (the original's world mirrors itself the same way).
  outward(x, z) {
    const { i, d } = this.segment(this.ringDistance(x, z));
    const [a, zone, dir] = SEG[i];
    if (dir > 0) return d;
    const b = i + 1 < SEG.length ? SEG[i + 1][0] : CYCLE;
    const k = SEG.findIndex((g) => g[1] === zone && g[2] > 0);
    const s0 = SEG[k][0], s1 = SEG[k + 1][0];
    return s1 - ((d - a) / (b - a)) * (s1 - s0);
  }

  // A crash site's column, by the original's CrashSiteDepositer: null, or how deep its crater
  // goes under the ground plane (66), how far its asteroid reaches either side of that, and how
  // much of the rock is Space Goo (further out, more).
  crater(x, z) {
    const d = this.outward(x, z);
    if (d <= 300 || d >= 3600) return null;
    const v = this.nCrash.n2(0.004688 * x, 0.004688 * z);
    if (v <= 0.5) return null;
    const depth = Math.trunc((v - 0.5) * 7 * 20);
    const rock = v > 0.55 ? Math.min(depth, Math.trunc((v - 0.55) * 10 * 20)) : 0;
    return { depth, rock, goo: Math.trunc(clamp(d / 3600, 0, 1) * 10) };
  }

  // How dark the sky is kept here: the endless night of the deep Edge and of Hell on Earth.
  endlessNight(x, z) {
    const w = this.w;
    this.weights(x, z, w);
    return clamp(w[6] + w[5] * smoothstep(0.45, 0.95, this.decentProgress(x, z)), 0, 1);
  }

  // Ground height of each biome on its own.
  biomeHeight(b, x, z) {
    const n = this.nH, d = this.nD;
    switch (b) {
      case 0: { // The Hills: steep green hills, and taller stone ones
        const hills = n.fbm2(x / 105, z / 105, 4);
        const bump = Math.max(0, n.n2(x / 150 + 7.3, z / 150 - 2.1));
        const knob = Math.max(0, n.n2(x / 58 - 3.3, z / 58 + 9.1));
        return 64 + 9 * hills + 18 * bump * bump + 14 * knob * knob * knob + 2.5 * d.n2(x / 24, z / 24);
      }
      case 1: { // Floating Islands: taller, terraced land with cliffs, and dry riverbeds through it
        const base = 70 + 14 * n.fbm2(x / 95 + 11, z / 95 - 4, 4);
        const step = 5;
        const terr = Math.floor(base / step) * step;
        const frac = (base - terr) / step;
        const cliff = terr + step * smoothstep(0.55, 0.85, frac);
        const river = 1 - smoothstep(0.015, 0.075, Math.abs(this.nO.n2(x / 290, z / 290) + 0.15 * d.n2(x / 70, z / 70)));
        return lerp(base, cliff, 0.75) + 2 * d.n2(x / 22, z / 22) - 11 * river;
      }
      case 2: { // Desert: flat sand with soft dunes
        const dune = 1 - Math.abs(d.n2(x / 46 + 0.3 * n.n2(x / 90, z / 90), z / 120));
        return 62.5 + 2.2 * n.fbm2(x / 80, z / 80, 3) + 2.4 * dune * dune;
      }
      case 3: { // The Mountains: very steep peaks, passes between them
        const r = n.ridged2(x / 210 + 3.1, z / 210 - 8.7, 5);
        const peak = 63 + 64 * Math.pow(r, 2.1) + 5 * n.fbm2(x / 38, z / 38, 2);
        // cliffs: the slopes break into steps
        const st = 6, t = Math.floor(peak / st) * st;
        return lerp(peak, t + st * smoothstep(0.35, 0.7, (peak - t) / st), 0.55) + 2.5 * d.n2(x / 15, z / 15);
      }
      case 4: { // The Snowfields: mostly flat, with dips where the frozen lakes lie
        const base = 64 + 3.5 * n.fbm2(x / 120 - 5, z / 120 + 2, 4) + 1.5 * d.n2(x / 31, z / 31);
        const dip = Math.max(0, n.n2(x / 85 + 4.4, z / 85 - 1.7));
        return base - 9 * dip * dip;
      }
      case 5: { // World's Edge: the land sinks away toward Hell
        const p = this.decentProgress(x, z);
        return lerp(63, 31, smoothstep(0, 1, p)) + 2.6 * n.fbm2(x / 50, z / 50, 3) + 1.4 * d.n2(x / 9, z / 9);
      }
      case 6: { // Hell on Earth: low bloodstone ground, lava lying in the hollows, rock spires
        const spire = Math.max(0, this.nHell.n2(x / 21, z / 21) - 0.45);
        return 31 + 3.5 * n.fbm2(x / 64, z / 64, 3) + 1.5 * d.n2(x / 17, z / 17) - 4 * Math.max(0, this.nHell.n2(x / 70 + 3, z / 70)) + 60 * spire * spire;
      }
    }
    return 64;
  }

  // Blended ground height (float) and the strongest biome, for a column.
  heightAt(x, z) {
    const w = this.w;
    this.weights(x, z, w);
    let h = 0;
    for (let i = 0; i < 7; i++) if (w[i] > 0.001) h += w[i] * this.biomeHeight(i, x, z);
    // the ground around the tower is levelled
    const r = Math.max(Math.abs(x), Math.abs(z));
    if (r < 14) {
      const t = smoothstep(14, 7, r);
      h = lerp(h, this.towerBase(), t);
    }
    return h;
  }

  towerBase() {
    if (this.spawnY == null) {
      const w = new Float32Array(7);
      this.weights(0, 0, w);
      this.spawnY = Math.round(this.biomeHeight(0, 0, 0));
    }
    return this.spawnY;
  }

  // Hell's cavern at (x, z): floor and ceiling heights, scaled by how far into Hell we are.
  hellCavern(x, z, hw) {
    const n = this.nHell;
    const floor = 21 + 5 * n.fbm2(x / 52, z / 52, 3) + 9 * Math.pow(n.ridged2(x / 85, z / 85, 3), 2.2);
    const st = Math.max(0, n.n2(x / 9, z / 9));
    const ceil = 64 + 7 * n.fbm2(x / 70 + 9, z / 70, 3) - 12 * st * st * st;
    return { floor, ceil };
  }

  // Floating islands of the Elevated Forest: top and bottom heights, or null.
  island(x, z, lw) {
    if (lw < 0.05) return null;
    const n = this.nI;
    let best = null;
    // two layers of islands
    for (let layer = 0; layer < 2; layer++) {
      const ox = layer * 173.1, oz = layer * -91.7;
      const sc = layer === 0 ? 60 : 38;
      const f = n.n2((x + ox) / sc, (z + oz) / sc) * 0.75 + n.n2((x + ox) / (sc * 0.4), (z + oz) / (sc * 0.4)) * 0.25;
      const thr = lerp(0.95, layer === 0 ? 0.42 : 0.5, smoothstep(0.05, 0.6, lw));
      if (f <= thr) continue;
      const k = f - thr;
      const top = (layer === 0 ? 99 : 86) + 5 * n.n2((x - ox) / 90, (z + oz) / 90);
      const flat = Math.min(1, k * 14);
      const topY = Math.floor(top + flat * 1.5);
      const depth = 3 + k * (layer === 0 ? 58 : 40) + 2.5 * this.nD.n2(x / 5, z / 5);
      const botY = Math.floor(topY - depth * flat);
      if (topY - botY < 2) continue;
      if (!best || topY > best.top) best = { top: topY, bottom: botY };
    }
    return best;
  }

  // ---- the column ---------------------------------------------------------------------------

  generateColumn(cx, cz) {
    const out = new Uint8Array(COLUMN_SIZE);
    const x0 = cx * CHUNK, z0 = cz * CHUNK;
    const heights = new Int16Array(CHUNK * CHUNK);
    const biomeOf = new Uint8Array(CHUNK * CHUNK);
    const wAll = new Float32Array(CHUNK * CHUNK * 7);
    const w = new Float32Array(7);
    const rand = mulberry32((cx * 73856093) ^ (cz * 19349663) ^ this.seed);

    // 1. ground: heights, surface layers
    for (let z = 0; z < CHUNK; z++) for (let x = 0; x < CHUNK; x++) {
      const wx = x0 + x, wz = z0 + z;
      const h = this.heightAt(wx, wz);
      w.set(this.w);
      wAll.set(w, (z * CHUNK + x) * 7);
      const hi = clamp(Math.floor(h), 4, HEIGHT - 3);
      heights[z * CHUNK + x] = hi;
      // dithered biome choice across borders, so the surface blocks mix like the original
      let r = hash2(wx, wz, this.seed + 77), acc = 0, pick = 0;
      for (let i = 0; i < 7; i++) { acc += w[i]; if (r <= acc) { pick = i; break; } pick = i; }
      biomeOf[z * CHUNK + x] = pick;
      this.fillGround(out, x, z, wx, wz, hi, pick, w, rand);
    }

    // 2. the crash sites (before the caves, as the original builds them: its caves go through
    // the asteroids too)
    this.crashSites(out, cx, cz);

    // 3. caves, overhangs, Hell's cavern, islands (3D noise sampled on a coarse grid)
    this.carve(out, cx, cz, heights, wAll);

    // 4. ores
    this.ores(out, cx, cz);

    // 5. trees
    this.trees(out, cx, cz);

    // 6. the start tower
    if (Math.abs(x0 + 8) < 40 && Math.abs(z0 + 8) < 40) this.tower(out, cx, cz);

    return out;
  }

  fillGround(out, x, z, wx, wz, h, b, w, rand) {
    const col = x | (z << 4);
    const set = (y, id) => { out[col | (y << 8)] = id; };
    // bedrock
    set(0, B.BEDROCK);
    const br = hash2(wx, wz, this.seed + 5);
    if (br < 0.6) set(1, B.BEDROCK);
    if (br < 0.25) set(2, B.BEDROCK);
    for (let y = 1; y <= h; y++) if (out[col | (y << 8)] === 0) set(y, B.ROCK);
    const n = this.nS.n2(wx / 7, wz / 7);
    switch (b) {
      case 0: { // grass over dirt; the tall hills bare stone; sand lying in the hollows
        const stone = Math.max(0, this.nH.n2(wx / 58 - 3.3, wz / 58 + 9.1));
        if (stone > 0.62 + n * 0.06 && h > 70) break;
        if (h < 61 + n) {
          for (let y = h - 3; y <= h; y++) set(y, B.SAND);
          break;
        }
        const dirt = 3 + Math.floor((n + 1) * 1.2);
        for (let y = h - dirt; y < h; y++) set(y, B.DIRT);
        set(h, B.GRASS);
        break;
      }
      case 1: { // grass over dirt; the dry riverbeds sand and gravelly rock
        const river = 1 - smoothstep(0.015, 0.075, Math.abs(this.nO.n2(wx / 290, wz / 290) + 0.15 * this.nD.n2(wx / 70, wz / 70)));
        if (river > 0.35) {
          for (let y = h - 2; y <= h; y++) set(y, n > 0.3 ? B.ROCK : B.SAND);
          break;
        }
        const dirt = 3 + Math.floor((n + 1) * 1.2);
        for (let y = h - dirt; y < h; y++) set(y, B.DIRT);
        set(h, B.GRASS);
        break;
      }
      case 2: { // sand
        const sand = 5 + Math.floor((n + 1) * 1.5);
        for (let y = h - sand; y <= h; y++) set(y, B.SAND);
        break;
      }
      case 3: { // rock, sand in the passes, snow on the peaks
        if (h < 69 + n * 2) {
          for (let y = h - 3; y <= h; y++) set(y, B.SAND);
        } else if (h > 100 + n * 4) {
          set(h, B.SNOW);
          if (h > 106) set(h - 1, B.SNOW);
        }
        break;
      }
      case 4: { // snow over frozen dirt; frozen lakes in the dips
        set(h, B.SNOW);
        set(h - 1, B.SNOW);
        set(h - 2, B.DIRT);
        set(h - 3, B.DIRT);
        const lake = 60;
        if (h < lake) for (let y = h + 1; y <= lake; y++) set(y, B.ICE);
        break;
      }
      case 5: { // World's Edge: bare rock in broad sheets of pale sand, bloodstone showing through deeper in
        const s = this.nS.n2(wx / 46, wz / 46) + 0.25 * n;
        if (s > 0.05) { set(h, B.SAND); set(h - 1, B.SAND); }
        const blood = this.nS.n2(wx / 17 + 40, wz / 17 - 13) - 0.45 * (1 - this.decentProgress(wx, wz));
        if (blood > 0.5) { set(h, B.BLOODSTONE); set(h - 1, B.BLOODSTONE); }
        break;
      }
      case 6: { // Hell on Earth: bloodstone, lava lying in the low ground
        for (let y = h - 4; y <= h; y++) set(y, B.BLOODSTONE);
        if (h < LAVA_LEVEL_HELL) for (let y = h + 1; y <= LAVA_LEVEL_HELL; y++) set(y, B.LAVA);
        break;
      }
    }
  }

  // The Underworld at (x, z): the cavern's floor and ceiling, and its bloodstone roof.
  underworld(x, z) {
    const n = this.nHell;
    const floor = UNDER.floor + 2.5 * n.n2(x / 40, z / 40);
    const pit = Math.max(0, n.n2(x / 34 + 11, z / 34 - 7));
    const ceil = UNDER.ceil + 3 * n.fbm2(x / 52 + 5, z / 52, 3);
    // pillars of bloodstone hold the roof up
    const pillar = n.n2(x / 11 - 4, z / 11 + 2) > 0.6;
    return { floor: Math.floor(floor - 4 * pit), ceil: Math.floor(ceil), roof: Math.floor(UNDER.roof + 2 * n.n2(x / 30, z / 30)), pillar };
  }

  carve(out, cx, cz, heights, wAll) {
    const x0 = cx * CHUNK, z0 = cz * CHUNK;
    // coarse grid: every 4 blocks across, every 4 up
    const GX = 5, GY = HEIGHT / 4 + 1;
    const cave = new Float32Array(GX * GX * GY);
    const cave2 = new Float32Array(GX * GX * GY);
    const big = new Float32Array(GX * GX * GY);
    const over = new Float32Array(GX * GX * GY);
    for (let gz = 0; gz < GX; gz++) for (let gx = 0; gx < GX; gx++) for (let gy = 0; gy < GY; gy++) {
      const wx = x0 + gx * 4, wy = gy * 4, wz = z0 + gz * 4;
      const i = (gy * GX + gz) * GX + gx;
      cave[i] = this.nC1.n3(wx / 46, wy / 26, wz / 46);
      cave2[i] = this.nC2.n3(wx / 46, wy / 26, wz / 46);
      big[i] = this.nC3.n3(wx / 72, wy / 34, wz / 72) + 0.35 * this.nC3.n3(wx / 24, wy / 16, wz / 24);
      over[i] = this.nC3.n3(wx / 28 + 50, wy / 17, wz / 28 - 20);
    }
    const sample = (arr, x, y, z) => {
      const fx = x / 4, fy = y / 4, fz = z / 4;
      const ix = Math.min(GX - 2, fx | 0), iy = Math.min(GY - 2, fy | 0), iz = Math.min(GX - 2, fz | 0);
      const tx = fx - ix, ty = fy - iy, tz = fz - iz;
      const i000 = (iy * GX + iz) * GX + ix;
      const i100 = i000 + 1, i010 = i000 + GX * GX, i110 = i010 + 1;
      const i001 = i000 + GX, i101 = i001 + 1, i011 = i010 + GX, i111 = i011 + 1;
      const a = lerp(lerp(arr[i000], arr[i100], tx), lerp(arr[i001], arr[i101], tx), tz);
      const b = lerp(lerp(arr[i010], arr[i110], tx), lerp(arr[i011], arr[i111], tx), tz);
      return lerp(a, b, ty);
    };
    // World's Edge has pits that drop into the Underworld; the Snowfields, holes
    const pits = [];
    for (let gx = Math.floor((x0 - 8) / 24); gx <= Math.floor((x0 + 24) / 24); gx++) {
      for (let gz = Math.floor((z0 - 8) / 24); gz <= Math.floor((z0 + 24) / 24); gz++) {
        const h0 = hash2(gx, gz, this.seed + 700);
        const px = gx * 24 + 4 + Math.floor(hash2(gx, gz, this.seed + 701) * 16), pz = gz * 24 + 4 + Math.floor(hash2(gx, gz, this.seed + 702) * 16);
        const b = this.biomeAt(px, pz);
        if (b === 5 && h0 < 0.42) pits.push([px, pz, 2.5 + hash2(gx, gz, this.seed + 703) * 3.5, 0]);
        else if (b === 4 && h0 < 0.18) pits.push([px, pz, 1.2 + hash2(gx, gz, this.seed + 704) * 1.4, 12 + Math.floor(h0 * 60)]);
      }
    }

    for (let z = 0; z < CHUNK; z++) for (let x = 0; x < CHUNK; x++) {
      const col = x | (z << 4);
      const h = heights[z * CHUNK + x];
      const wo = (z * CHUNK + x) * 7;
      const lw = wAll[wo + 1], dw = wAll[wo + 2], hw = wAll[wo + 6];
      const wx = x0 + x, wz = z0 + z;
      const nearTower = Math.abs(wx) < 12 && Math.abs(wz) < 12;

      // the Underworld, under everything: a bloodstone roof, a cavern, lava pits in its floor
      const U = this.underworld(wx, wz);
      const top = Math.min(U.roof + 3, h - 6);
      for (let y = 3; y <= top; y++) {
        const i = col | (y << 8);
        if (out[i] === B.BEDROCK) continue;
        if (y > U.ceil) { out[i] = hash3(wx, y, wz, this.seed + 92) < 0.82 ? B.BLOODSTONE : B.ROCK; continue; }
        if (y <= U.floor || U.pillar) { out[i] = hash3(wx, y, wz, this.seed + 91) < 0.75 ? B.BLOODSTONE : B.ROCK; continue; }
        out[i] = y <= LAVA_LEVEL_DEEP ? B.LAVA : B.AIR;
      }

      // pits and holes
      for (const [px, pz, r, deep] of pits) {
        const dx = wx - px, dz = wz - pz;
        const rr = r + 0.8 * this.nD.n2(wx / 3, wz / 3);
        if (dx * dx + dz * dz > rr * rr) continue;
        const bottom = deep ? Math.max(U.roof + 4, h - deep) : U.ceil - 1;
        for (let y = bottom; y <= h; y++) {
          const i = col | (y << 8);
          if (out[i] !== B.BEDROCK) out[i] = B.AIR;
        }
      }

      for (let y = top + 1; y < h + 1 && y < HEIGHT - 1; y++) {
        const i = col | (y << 8);
        const id = out[i];
        if (id === B.AIR || id === B.BEDROCK || id === B.LAVA || id === B.ICE) continue;
        if (nearTower && y > h - 12) continue;
        const depth = h - y;
        // no caves under the desert
        if (dw > 0.5 && depth < 34) continue;
        // worm tunnels: where two noise sheets cross
        const a = sample(cave, x, y, z), b = sample(cave2, x, y, z);
        const width = 0.075 + 0.03 * smoothstep(40, 10, y);
        let carved = Math.abs(a) < width && Math.abs(b) < width * 1.25;
        // big caverns, mostly deep
        if (!carved && y < 52 && y > U.roof + 4) {
          const g = sample(big, x, y, z);
          carved = g > 0.62 + 0.18 * smoothstep(30, 52, y);
        }
        // keep a lid on most tunnels so the surface isn't riddled with holes
        if (carved && depth < 3 && hash2(wx >> 3, wz >> 3, this.seed + 3) < 0.7) carved = false;
        // the Floating Islands' odd caverns and overhangs
        if (!carved && lw > 0.3 && depth > 1 && depth < 16) {
          const o = sample(over, x, y, z);
          carved = o > 0.5 - 0.1 * lw;
        }
        if (carved) out[i] = B.AIR;
      }

      // the floating islands (none over a crater: what came down took them)
      if (lw > 0.05 && !this.crater(wx, wz)) {
        const isl = this.island(wx, wz, lw);
        if (isl) {
          for (let y = Math.max(isl.bottom, h + 6); y <= isl.top && y < HEIGHT - 1; y++) {
            let id = B.ROCK;
            if (y === isl.top) id = B.GRASS;
            else if (y >= isl.top - 2) id = B.DIRT;
            out[col | (y << 8)] = id;
          }
        }
      }
      void hw;
    }
  }

  // Each crater column, from y = 20 up (the original's local heights are ours): under the
  // asteroid, ten blocks clear of it, everything goes but bloodstone (and what sits on it); the
  // asteroid is space rock; above it, nothing, to the sky. With no asteroid (a crater's rim), a
  // ten-block crust is left over the hollow. Deep in the rock, here and there, Space Goo.
  crashSites(out, cx, cz) {
    const x0 = cx * CHUNK, z0 = cz * CHUNK;
    for (let z = 0; z < CHUNK; z++) for (let x = 0; x < CHUNK; x++) {
      const wx = x0 + x, wz = z0 + z;
      const c = this.crater(wx, wz);
      if (!c) continue;
      const col = x | (z << 4);
      const top = 66 - c.depth + c.rock, bottom = 66 - c.depth - c.rock - 10;
      for (let y = 20; y < 126; y++) {
        const i = col | (y << 8);
        if (y < bottom) {
          if (out[i] !== B.BLOODSTONE && out[col | ((y - 1) << 8)] !== B.BLOODSTONE) out[i] = B.AIR;
        } else if (c.rock > 0 && y < top) out[i] = B.SPACE_ROCK;
        else if (y >= top) out[i] = B.AIR;
        if (out[i] === B.SPACE_ROCK && y < top - 3) {
          // (the original's IntNoise, at half and full resolution, offset by 777)
          const ox = wx + 777, oy = y - 64 + 777, oz = wz + 777;
          const coarse = Math.floor(hash3(Math.trunc(ox / 2), Math.trunc(oy / 2), Math.trunc(oz / 2), this.seed + 1200) * 256);
          const fine = Math.floor(hash3(ox, oy, oz, this.seed + 1201) * 256);
          if (coarse + Math.trunc((fine - 128) / 8) > 265 - c.goo) out[i] = B.SLIME;
        }
      }
    }
  }

  ores(out, cx, cz) {
    // vein seeds on an 8-block grid; veins reach up to 3 blocks from their seed, so the
    // cells of neighbouring chunks are visited too. Further out, rare ores are commoner and
    // veins bigger; World's Edge is full of everything, diamonds included.
    const x0 = cx * CHUNK, z0 = cz * CHUNK;
    const w = new Float32Array(7);
    this.weights(x0 + 8, z0 + 8, w);
    const far = clamp(this.ringDistance(x0 + 8, z0 + 8) / 3000, 0, 1);
    const edge = w[5];
    const rich = 1 + far * 0.6 + edge * 2.2;
    const deep = UNDER.roof + 3;
    const table = [
      // [block, chance per cell, min y, max y, size]
      [B.COAL_ORE, 0.95, deep, 118, 7],
      [B.COPPER_ORE, 0.6, deep, 84, 6],
      [B.IRON_ORE, 0.5, deep, 64, 5 + Math.round(far * 2 + edge * 3)],
      [B.GOLD_ORE, 0.3 * (1 + far), deep, 46 + edge * 20, 4 + Math.round(far * 2 + edge * 3)],
      [B.DIAMOND_ORE, 0.16 * (1 + far * 1.5 + edge * 2), deep, 36 + edge * 26, 3 + Math.round(edge * 3)],
    ];
    for (let gx = Math.floor((x0 - 4) / 8); gx <= Math.floor((x0 + 19) / 8); gx++) {
      for (let gz = Math.floor((z0 - 4) / 8); gz <= Math.floor((z0 + 19) / 8); gz++) {
        for (let gy = 0; gy < HEIGHT / 8; gy++) {
          for (let t = 0; t < table.length; t++) {
            const [id, chance, ymin, ymax, size] = table[t];
            const cy = gy * 8;
            if (cy + 8 < ymin || cy > ymax) continue;
            const h0 = hash3(gx, gy, gz, this.seed + 1000 + t * 31);
            if (h0 > Math.min(0.95, chance * 0.5 * rich)) continue;
            const r = mulberry32(Math.floor(h0 * 1e9) ^ (t * 7919));
            let px = gx * 8 + Math.floor(r() * 8), py = cy + Math.floor(r() * 8), pz = gz * 8 + Math.floor(r() * 8);
            if (py < ymin || py > ymax) continue;
            const n = 2 + Math.floor(r() * size);
            for (let k = 0; k < n; k++) {
              const lx = px - x0, lz = pz - z0;
              if (lx >= 0 && lx < CHUNK && lz >= 0 && lz < CHUNK && py > 0 && py < HEIGHT) {
                const i = lx | (lz << 4) | (py << 8);
                if (out[i] === B.ROCK) out[i] = id;
              }
              const dir = Math.floor(r() * 6);
              if (dir === 0) px++; else if (dir === 1) px--; else if (dir === 2) py++; else if (dir === 3) py--; else if (dir === 4) pz++; else pz--;
            }
          }
        }
      }
    }
  }

  // Trees on a jittered 7-block grid. A tree's leaves reach 4 blocks out, so cells of the
  // neighbouring chunks are visited and only the blocks inside this column are written.
  trees(out, cx, cz) {
    const x0 = cx * CHUNK, z0 = cz * CHUNK;
    const G = 7;
    const w = new Float32Array(7);
    for (let gx = Math.floor((x0 - 5) / G); gx <= Math.floor((x0 + 20) / G); gx++) {
      for (let gz = Math.floor((z0 - 5) / G); gz <= Math.floor((z0 + 20) / G); gz++) {
        const h0 = hash2(gx, gz, this.seed + 500);
        const tx = gx * G + Math.floor(hash2(gx, gz, this.seed + 501) * (G - 1));
        const tz = gz * G + Math.floor(hash2(gx, gz, this.seed + 502) * (G - 1));
        if (tx * tx + tz * tz < 20 * 20) continue; // the clearing round the tower
        if (tx * tx + (tz - SPAWN_Z) * (tz - SPAWN_Z) < 6 * 6) continue; // and where you start
        if (this.crater(tx, tz)) continue; // nor in a crater
        this.weights(tx, tz, w);
        let chance = w[0] * 0.5 + w[1] * 0.6;
        // thinner in places so forests have glades
        chance *= 0.55 + 0.45 * this.nS.n2(tx / 70, tz / 70) + 0.25;
        if (h0 > chance) continue;
        const pick = hash2(gx, gz, this.seed + 503);
        // stand it on the ground, or on a floating island above
        let base = Math.floor(this.heightAt(tx, tz));
        if (w[1] > 0.3) {
          const isl = this.island(tx, tz, w[1]);
          if (isl && pick < 0.6) base = isl.top;
        }
        // only on grass: rings without grass get none
        const surf = this.surfaceKind(tx, tz, base);
        if (!surf) continue;
        const arctic = w[4] > 0.5;
        if (arctic && base < 62) continue;
        this.tree(out, x0, z0, tx, base + 1, tz, mulberry32(Math.floor(h0 * 4294967296) ^ 0x9e37), arctic, pick);
      }
    }
  }

  // Is the ground at (x, base) something a tree grows from? (Grass in the green rings, snow in the Arctic.)
  surfaceKind(x, z, base) {
    const w = this.w;
    const b = this.weights(x, z, w);
    if (b !== 0 && b !== 1) return false;
    // not on the bare stone hills, the sandy hollows or the riverbeds
    if (b === 0 && (base < 62 || (Math.max(0, this.nH.n2(x / 58 - 3.3, z / 58 + 9.1)) > 0.62 && base > 70))) return false;
    if (b === 1 && 1 - smoothstep(0.015, 0.075, Math.abs(this.nO.n2(x / 290, z / 290) + 0.15 * this.nD.n2(x / 70, z / 70))) > 0.35) return false;
    return true;
  }

  tree(out, x0, z0, tx, ty, tz, r, arctic, pick) {
    const put = (x, y, z, id, force) => {
      const lx = x - x0, lz = z - z0;
      if (lx < 0 || lx >= CHUNK || lz < 0 || lz >= CHUNK || y < 1 || y >= HEIGHT) return;
      const i = lx | (lz << 4) | (y << 8);
      if (force || out[i] === B.AIR) out[i] = id;
    };
    const big = pick < 0.12 && !arctic;
    const trunk = big ? 9 + Math.floor(r() * 5) : 5 + Math.floor(r() * 4);
    if (ty + trunk + 5 >= HEIGHT) return;
    // the trunk (2x2 for the big ones)
    for (let y = 0; y < trunk; y++) {
      put(tx, ty + y, tz, B.LOG, true);
      if (big) { put(tx + 1, ty + y, tz, B.LOG, true); put(tx, ty + y, tz + 1, B.LOG, true); put(tx + 1, ty + y, tz + 1, B.LOG, true); }
    }
    // a few branches on the big ones
    const top = ty + trunk;
    const blobs = [];
    const cxo = big ? 0.5 : 0, czo = big ? 0.5 : 0;
    blobs.push([tx + cxo, top - 0.5, tz + czo, big ? 4.2 : arctic ? 2.2 : 2.8 + r() * 0.6]);
    const extra = big ? 4 : arctic ? 1 : 1 + Math.floor(r() * 2);
    for (let k = 0; k < extra; k++) {
      const a = r() * Math.PI * 2, d = big ? 2.5 + r() * 1.5 : 1.2 + r() * 1.2;
      blobs.push([tx + cxo + Math.cos(a) * d, top - 1.5 - r() * (big ? 3 : 1.5), tz + czo + Math.sin(a) * d, big ? 2.8 + r() : 1.9 + r() * 0.7]);
      if (big) {
        // a branch out to the blob
        const bx = Math.round(tx + Math.cos(a) * d * 0.8), bz = Math.round(tz + Math.sin(a) * d * 0.8);
        put(bx, Math.round(top - 2 - r() * 2), bz, B.LOG, true);
      }
    }
    for (const [bx, by, bz, br] of blobs) {
      const R = Math.ceil(br);
      for (let dx = -R; dx <= R; dx++) for (let dy = -R; dy <= R; dy++) for (let dz = -R; dz <= R; dz++) {
        const x = Math.round(bx + dx), y = Math.round(by + dy), z = Math.round(bz + dz);
        const ex = x - bx, ey = (y - by) * 1.25, ez = z - bz;
        const d2 = ex * ex + ey * ey + ez * ez;
        if (d2 > br * br) continue;
        // ragged edges
        if (d2 > (br - 1) * (br - 1) && hash3(x, y, z, this.seed + 600) < 0.35) continue;
        put(x, y, z, B.LEAVES, false);
      }
    }
  }

  // The start tower: bedrock, unbreakable, stepping in from 9 blocks across to 7 to 5 as it
  // rises, and tipped with lanterns, so the way home shows from far off.
  tower(out, cx, cz) {
    const x0 = cx * CHUNK, z0 = cz * CHUNK;
    const base = this.towerBase();
    const put = (x, y, z, id) => {
      const lx = x - x0, lz = z - z0;
      if (lx < 0 || lx >= CHUNK || lz < 0 || lz >= CHUNK || y < 1 || y >= HEIGHT) return;
      out[lx | (lz << 4) | (y << 8)] = id;
    };
    let y0 = base - 6;
    for (const [r, h] of TOWER.tiers) {
      for (let y = y0; y <= base + h; y++) for (let x = -r; x <= r; x++) for (let z = -r; z <= r; z++) put(x, y, z, B.BEDROCK);
      y0 = base + h + 1;
    }
    // the lantern tip: a lantern on each corner of the top and a stack in the middle (the
    // original's FixedLanterns, that no one can dig out)
    const top = base + TOWER.height;
    const r = TOWER.tiers[TOWER.tiers.length - 1][0];
    for (const [x, z] of [[-r, -r], [r, -r], [-r, r], [r, r]]) put(x, top + 1, z, B.FIXED_LANTERN);
    put(0, top + 1, 0, B.FIXED_LANTERN);
    put(0, top + 2, 0, B.FIXED_LANTERN);
    put(0, top + 3, 0, B.FIXED_LANTERN);
    // and one on each ledge where the tower steps in
    for (const [tr, th] of TOWER.tiers.slice(0, -1)) for (const [x, z] of [[-tr, -tr], [tr, -tr], [-tr, tr], [tr, tr]]) put(x, base + th + 1, z, B.FIXED_LANTERN);
  }

  // Where a new player stands: south of the tower, about thirty meters out, on the ground.
  spawnPoint() {
    const x = 0, z = SPAWN_Z;
    const y = Math.floor(this.heightAt(x, z)) + 1;
    return { x: x + 0.5, y, z: z + 0.5 };
  }
}
