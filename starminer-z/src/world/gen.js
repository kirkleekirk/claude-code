// Terrain for one chunk column at a time, laid out the way CastleMiner Z lays out its world:
// biomes come in rings by distance from the start tower, so walking away from it always takes
// you through the same sequence, and the deeper rings are harder to cross.
//
//   Classic         0 –  200   rolling grass hills and trees around the tower
//   Elevated Forest 200 –  950   cliffs, odd caverns, floating islands
//   Desert          950 – 1600   mostly flat sand
//   Mountains      1600 – 2300   huge rock ridges with sandy valleys and snow caps
//   Arctic         2300 – 3000   snow and ice, crevasses
//   Decent         3000 – 3400   the land falls away, pale rock spotted with bloodstone
//   Hell           3400 – 4400   a lava cavern under a black rock plateau
//
// then the rings start over. Shared by the workers and the main thread (no DOM, no three.js).

import { Noise, hash2, hash3, mulberry32, clamp, lerp, smoothstep } from '../core/noise.js';
import { B, CHUNK, HEIGHT, COLUMN_SIZE } from './blocks.js';

export const BIOMES = ['Classic', 'Elevated Forest', 'Desert', 'Mountains', 'Arctic', 'Decent', 'Hell'];
export const BIOME = { CLASSIC: 0, LAGOON: 1, DESERT: 2, MOUNTAIN: 3, ARCTIC: 4, DECENT: 5, HELL: 6 };
const STARTS = [0, 200, 950, 1600, 2300, 3000, 3400, 4400];
export const CYCLE = 4400;
const BLEND = 45; // half-width of the blend between two rings

export const TOWER = { x0: -3, x1: 3, z0: -3, z1: 3, height: 30 };
export const LAVA_LEVEL_HELL = 25;
export const LAVA_LEVEL_DEEP = 6;

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

  // Blend weights of the seven biomes at (x, z), written into this.w. Returns the index of the strongest.
  weights(x, z, out = this.w) {
    const dr = this.ringDistance(x, z);
    const dc = dr < CYCLE ? dr : ((dr - CYCLE) % CYCLE);
    out.fill(0);
    let best = 0, bw = -1;
    for (let i = 0; i < 7; i++) {
      const a = STARTS[i], b = STARTS[i + 1];
      const wIn = i === 0 ? 1 : smoothstep(a - BLEND, a + BLEND, dc);
      const wOut = 1 - smoothstep(b - BLEND, b + BLEND, dc);
      const w = wIn * wOut;
      out[i] += w;
    }
    // the cycle wraps: the end of Hell blends into the next Classic ring
    if (dr >= CYCLE - BLEND) {
      const t = smoothstep(CYCLE - BLEND, CYCLE + BLEND, dc < BLEND ? dc + CYCLE : dc);
      if (dc < BLEND) { out[0] = t; out[6] = 1 - t; for (let i = 1; i < 6; i++) out[i] = 0; }
    }
    let sum = 0;
    for (let i = 0; i < 7; i++) sum += out[i];
    for (let i = 0; i < 7; i++) {
      out[i] /= sum || 1;
      if (out[i] > bw) { bw = out[i]; best = i; }
    }
    return best;
  }

  // The strongest biome at (x, z).
  biomeAt(x, z) {
    return this.weights(x, z, new Float32Array(7));
  }

  // The progress through the Decent ring (0 at its start, 1 at Hell's gate).
  decentProgress(x, z) {
    const dr = this.ringDistance(x, z);
    const dc = dr < CYCLE ? dr : ((dr - CYCLE) % CYCLE);
    return clamp((dc - 3000) / 400, 0, 1);
  }

  // Ground height of each biome on its own.
  biomeHeight(b, x, z) {
    const n = this.nH, d = this.nD;
    switch (b) {
      case 0: { // Classic: rolling hills
        const hills = n.fbm2(x / 120, z / 120, 4);
        const bump = Math.max(0, n.n2(x / 190 + 7.3, z / 190 - 2.1));
        return 64 + 7 * hills + 11 * bump * bump + 2.5 * d.n2(x / 26, z / 26);
      }
      case 1: { // Elevated Forest: taller, terraced hills with cliffs
        const base = 70 + 13 * n.fbm2(x / 95 + 11, z / 95 - 4, 4);
        const step = 5;
        const terr = Math.floor(base / step) * step;
        const frac = (base - terr) / step;
        const cliff = terr + step * smoothstep(0.55, 0.85, frac);
        return lerp(base, cliff, 0.75) + 2 * d.n2(x / 22, z / 22);
      }
      case 2: { // Desert: flat sand with soft dunes
        const dune = 1 - Math.abs(d.n2(x / 46 + 0.3 * n.n2(x / 90, z / 90), z / 120));
        return 62.5 + 2.2 * n.fbm2(x / 80, z / 80, 3) + 2.4 * dune * dune;
      }
      case 3: { // Mountains: ridges
        const r = n.ridged2(x / 230 + 3.1, z / 230 - 8.7, 5);
        return 63 + 56 * Math.pow(r, 1.7) + 5 * n.fbm2(x / 38, z / 38, 2) + 3 * d.n2(x / 15, z / 15);
      }
      case 4: { // Arctic: snowfields with crevasses
        const base = 64 + 7 * n.fbm2(x / 105 - 5, z / 105 + 2, 4) + 3 * d.n2(x / 31, z / 31);
        const crev = Math.pow(n.ridged2(x / 64, z / 64, 2), 4);
        return base - 7 * crev;
      }
      case 5: { // Decent: the land drops toward Hell
        const p = this.decentProgress(x, z);
        return lerp(63, 33, smoothstep(0, 1, p)) + 2.2 * n.fbm2(x / 50, z / 50, 3) + 1.2 * d.n2(x / 9, z / 9);
      }
      case 6: { // Hell: the black plateau over the cavern
        return 84 + 3 * n.fbm2(x / 64, z / 64, 3) + 1.5 * d.n2(x / 17, z / 17);
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

    // 2. caves, overhangs, Hell's cavern, islands (3D noise sampled on a coarse grid)
    this.carve(out, cx, cz, heights, wAll);

    // 3. ores
    this.ores(out, cx, cz);

    // 4. trees
    this.trees(out, cx, cz);

    // 5. the start tower
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
      case 0: case 1: { // grass over dirt
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
      case 3: { // rock with sandy valleys and snow caps
        if (h < 69 + n * 2) {
          for (let y = h - 3; y <= h; y++) set(y, B.SAND);
        } else if (h > 106 + n * 4) {
          set(h, B.SNOW);
          if (h > 112) set(h - 1, B.SNOW);
        } else if (n > 0.55 && h < 90) {
          set(h, B.GRASS); set(h - 1, B.DIRT);
        }
        break;
      }
      case 4: { // snow over frozen dirt; frozen lakes in the hollows
        set(h, B.SNOW);
        set(h - 1, B.SNOW);
        set(h - 2, B.DIRT);
        set(h - 3, B.DIRT);
        const lake = 61;
        if (h < lake) for (let y = h + 1; y <= lake; y++) set(y, B.ICE);
        break;
      }
      case 5: { // the descent: pale sand and rock, spotted with bloodstone
        const s = this.nS.n2(wx / 13, wz / 13);
        if (s > 0.15) { set(h, B.SAND); set(h - 1, B.SAND); }
        const blood = this.nS.n2(wx / 5 + 40, wz / 5 - 13);
        if (blood > 0.62) { set(h, B.BLOODSTONE); if (blood > 0.75) set(h - 1, B.BLOODSTONE); }
        break;
      }
      case 6: { // Hell's roof: black rock streaked with bloodstone
        const s = this.nS.n2(wx / 9 + 7, wz / 9);
        if (s > 0.35) set(h, B.BLOODSTONE);
        break;
      }
    }
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

    for (let z = 0; z < CHUNK; z++) for (let x = 0; x < CHUNK; x++) {
      const col = x | (z << 4);
      const h = heights[z * CHUNK + x];
      const wo = (z * CHUNK + x) * 7;
      const lw = wAll[wo + 1], hw = wAll[wo + 6], aw = wAll[wo + 4];
      const wx = x0 + x, wz = z0 + z;
      const nearTower = Math.abs(wx) < 12 && Math.abs(wz) < 12;

      // Hell's cavern: hollow out between floor and ceiling, lava in the low parts
      let hellFloor = -1, hellCeil = -1;
      if (hw > 0.2) {
        const s = smoothstep(0.2, 0.85, hw);
        const c = this.hellCavern(wx, wz, hw);
        // at the gate the cavern floor meets the descent's floor
        const gateFloor = 33;
        hellFloor = Math.floor(lerp(gateFloor, c.floor, s));
        hellCeil = Math.floor(lerp(gateFloor + 9, c.ceil, Math.pow(s, 0.5)));
        for (let y = hellFloor + 1; y < hellCeil; y++) {
          const id = y <= LAVA_LEVEL_HELL ? B.LAVA : B.AIR;
          out[col | (y << 8)] = id;
        }
        // bloodstone veins in the cavern walls and floor
        for (let y = Math.max(3, hellFloor - 3); y <= hellFloor; y++) if (hash3(wx, y, wz, this.seed + 91) < 0.3) out[col | (y << 8)] = B.BLOODSTONE;
        for (let y = hellCeil; y < hellCeil + 3 && y < HEIGHT; y++) if (hash3(wx, y, wz, this.seed + 92) < 0.18) out[col | (y << 8)] = B.BLOODSTONE;
      }

      for (let y = 3; y < h + 1 && y < HEIGHT - 1; y++) {
        const i = col | (y << 8);
        const id = out[i];
        if (id === B.AIR || id === B.BEDROCK || id === B.LAVA || id === B.ICE) continue;
        if (nearTower && y > h - 12) continue;
        if (hellFloor >= 0 && y > hellFloor - 2 && y < hellCeil + 2) continue;
        const depth = h - y;
        // worm tunnels: where two noise sheets cross
        const a = sample(cave, x, y, z), b = sample(cave2, x, y, z);
        const width = 0.075 + 0.03 * smoothstep(40, 10, y);
        let carved = Math.abs(a) < width && Math.abs(b) < width * 1.25;
        // big caverns, mostly deep
        if (!carved && y < 52 && y > 8) {
          const g = sample(big, x, y, z);
          carved = g > 0.62 + 0.18 * smoothstep(30, 52, y);
        }
        // keep a lid on most tunnels so the surface isn't riddled with holes
        if (carved && depth < 3 && hash2(wx >> 3, wz >> 3, this.seed + 3) < 0.7) carved = false;
        // the Elevated Forest's odd caverns and overhangs
        if (!carved && lw > 0.3 && depth > 1 && depth < 16) {
          const o = sample(over, x, y, z);
          carved = o > 0.5 - 0.1 * lw;
        }
        if (carved) out[i] = y <= LAVA_LEVEL_DEEP ? B.LAVA : B.AIR;
      }

      // floating islands of the Elevated Forest
      if (lw > 0.05) {
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
      void aw;
    }
  }

  ores(out, cx, cz) {
    // vein seeds on an 8-block grid; veins reach up to 3 blocks from their seed, so the
    // cells of neighbouring chunks are visited too
    const x0 = cx * CHUNK, z0 = cz * CHUNK;
    const table = [
      // [block, chance per cell, min y, max y, size]
      [B.COAL_ORE, 0.95, 6, 118, 7],
      [B.COPPER_ORE, 0.6, 6, 84, 6],
      [B.IRON_ORE, 0.5, 4, 64, 5],
      [B.GOLD_ORE, 0.3, 4, 40, 4],
      [B.DIAMOND_ORE, 0.18, 3, 22, 3],
    ];
    for (let gx = Math.floor((x0 - 4) / 8); gx <= Math.floor((x0 + 19) / 8); gx++) {
      for (let gz = Math.floor((z0 - 4) / 8); gz <= Math.floor((z0 + 19) / 8); gz++) {
        for (let gy = 0; gy < HEIGHT / 8; gy++) {
          for (let t = 0; t < table.length; t++) {
            const [id, chance, ymin, ymax, size] = table[t];
            const cy = gy * 8;
            if (cy + 8 < ymin || cy > ymax) continue;
            const h0 = hash3(gx, gy, gz, this.seed + 1000 + t * 31);
            if (h0 > chance * 0.5) continue;
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
        this.weights(tx, tz, w);
        let chance = w[0] * 0.5 + w[1] * 0.72 + w[3] * 0.07 + w[4] * 0.06;
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
    if (b === 0 || b === 1) return true;
    if (b === 4) return true;
    if (b === 3) return base < 90 && base > 70 && this.nS.n2(x / 7, z / 7) > 0.55;
    return false;
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

  // The start tower: a tall pillar of dark stone, lanterns up its faces and a lit crown.
  tower(out, cx, cz) {
    const x0 = cx * CHUNK, z0 = cz * CHUNK;
    const base = this.towerBase();
    const T = TOWER;
    const put = (x, y, z, id) => {
      const lx = x - x0, lz = z - z0;
      if (lx < 0 || lx >= CHUNK || lz < 0 || lz >= CHUNK || y < 1 || y >= HEIGHT) return;
      out[lx | (lz << 4) | (y << 8)] = id;
    };
    const top = base + T.height;
    for (let x = T.x0; x <= T.x1; x++) for (let z = T.z0; z <= T.z1; z++) {
      // foundations down into the ground
      for (let y = base - 6; y <= top; y++) put(x, y, z, B.TOWER_STONE);
      // crenellations
      const edge = x === T.x0 || x === T.x1 || z === T.z0 || z === T.z1;
      if (edge && ((x + z) & 1) === 0) put(x, top + 1, z, B.TOWER_STONE);
    }
    // lanterns: a column up the middle of each face, every 5 blocks, and the crown
    for (let y = base + 4; y < top - 1; y += 5) {
      put(0, y, T.z0, B.LANTERN); put(0, y, T.z1, B.LANTERN);
      put(T.x0, y, 0, B.LANTERN); put(T.x1, y, 0, B.LANTERN);
    }
    put(0, top + 1, 0, B.LANTERN);
    put(0, top + 2, 0, B.LANTERN);
    for (const [x, z] of [[T.x0, T.z0], [T.x1, T.z0], [T.x0, T.z1], [T.x1, T.z1]]) put(x, top + 2, z, B.LANTERN);
    // a ring of lanterns at the foot, so the way home glows at night
    for (const [x, z] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) {
      const g = Math.floor(this.heightAt(x, z));
      put(x, g + 1, z, B.TOWER_STONE);
      put(x, g + 2, z, B.LANTERN);
    }
  }

  // Where a new player stands: just south of the tower, on the ground.
  spawnPoint() {
    const x = 0, z = 9;
    const y = Math.floor(this.heightAt(x, z)) + 1;
    return { x: x + 0.5, y, z: z + 0.5 };
  }
}
