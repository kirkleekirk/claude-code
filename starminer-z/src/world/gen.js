// The world, as the original builds it: CastleMinerZBuilder and its biomes, ported from its code
// (decompiled from its IL) with its own noise (../core/dnanoise.js), so that a seed builds the
// world the original builds from it, block for block. Columns are built one at a time, every
// biome writing into the column in turn; heights are the original's 0-127 from the bottom of the
// world (its y = -64, our 0).
//
// Out from the tower, by straight-line distance (mirrored every 4400: at 4400 the world turns
// back on itself, and at 8800 is where it started):
//
//   Classic       0 -  200   rolling hills of grass, sand where they're low, snow on the tops
//   Lagoon      300 -  900   the same, lower, with islands of rock floating over it
//   Desert     1000 - 1600   sand
//   Mountains  1700 - 2300   steep and high, cut by narrow valleys, snow above 98
//   Arctic     2400 - 3000   flat snow over ice, ice where it's low
//   (descent)  3000 - 3600   the land sinks and breaks up, down to Hell's floor
//   Hell       3600 -        Hell's floor of bloodstone and lava, open to the sky
//
// with 100 between each (both biomes building into the column). Under all of it Hell lies 28 or
// so down: its bloodstone floor and lava, and a cavern up to a bloodstone ceiling. Caves run
// through everything, ores sit in the rock (more and richer further out), and between 300 and
// 3600 the crash sites: craters, an asteroid of space rock in each, Space Goo in the rock. The
// tower at the origin is the original's: round, 125 high, stepping in, its tip lanterns that
// can't be dug out. Shared by the workers and the main thread (no DOM, no three.js).

import { noiseTable, perlin2, perlin3, intNoise2, intNoise3, idiv } from '../core/dnanoise.js';
import { B, CHUNK, HEIGHT, COLUMN_SIZE, SOLID } from './blocks.js';

export const BIOMES = ['Classic', 'Lagoon', 'Desert', 'Mountains', 'Arctic', 'Descent', 'Hell'];
// where each starts (and the one before it ends), out from the tower
const BANDS = [0, 300, 1000, 1700, 2400, 3000, 3600];
// the original's WorldInfo.DefaultStartLocation: by the tower, on the ground
const START = { x: 8, z: -8 };

const f = Math.fround;
const K009 = f(0.009375), K021 = f(0.021875), K006 = f(0.00625), K031 = f(0.03125), K004 = f(0.004688), K043 = f(0.4375);
const lerp = (a, b, t) => f(a + f(f(b - a) * t));
// (C#'s float literals, as the original compares with them)
const F06 = f(0.6), F055 = f(0.55);
// nothing has been put there yet (the original fills a chunk with its type 45 first, and makes
// what's left of it air at the end): caves leave it alone, and trees grow into it
const UNSET = 255;

export class WorldGen {
  constructor(seed = 1337) {
    this.seed = seed | 0;
    // the tables the builder's noises end up sharing (see dnanoise.js)
    this.P = noiseTable(this.seed);
    this.I = noiseTable(1);
    this.spawn = null;
  }

  // CastleMinerZBuilder's distance: straight out from the origin, turning back every 4400
  distance(x, z) {
    let d = f(Math.sqrt(x * x + z * z));
    let n = 0;
    while (d > 4400) { d = f(d - 4400); n++; }
    if (n & 1) d = f(4400 - d);
    return d;
  }

  // the biome a place is in (the further one, in the 100 between two)
  biomeAt(x, z) {
    const d = this.distance(x, z);
    let i = BANDS.length - 1;
    while (i > 0 && d < BANDS[i] - (i < 5 ? 100 : 0)) i--;
    return i;
  }

  // how far into Hell (0 short of the descent, 1 at Hell's floor)
  hellAmount(x, z) {
    return Math.min(1, Math.max(0, (this.distance(x, z) - 3000) / 600));
  }

  // the four octaves every biome's ground starts from
  fbm(x, z, k, off = 0) {
    const kx = f(k * x), kz = f(k * z);
    let s = 0;
    for (let m = 1; m <= 8; m *= 2) s = f(s + f(perlin2(this.P, f(f(kx * m) + off), f(f(kz * m) + off)) / m));
    return s;
  }

  // ---- the column -------------------------------------------------------------------------------

  generateColumn(cx, cz) {
    const out = new Uint8Array(COLUMN_SIZE).fill(UNSET);
    const x0 = cx * CHUNK, z0 = cz * CHUNK;
    for (let lz = 0; lz < CHUNK; lz++) for (let lx = 0; lx < CHUNK; lx++) this.column(out, lx | (lz << 4), x0 + lx, z0 + lz);
    // trees, last, and only where they fit in the chunk
    for (let lz = 3; lz < 13; lz++) for (let lx = 3; lx < 13; lx++) this.tree(out, lx | (lz << 4), x0 + lx, z0 + lz);
    for (let i = 0; i < out.length; i++) if (out[i] === UNSET) out[i] = B.AIR;
    return out;
  }

  // BuildWorldChunk, for one column
  column(out, col, x, z) {
    const d = this.distance(x, z);
    this.n = this.fbm(x, z, K009);
    let hell = 1;
    if (d < 200) this.classic(out, col, x, z, 1);
    else if (d < 300) { const t = f(f(d - 200) / 100); this.classic(out, col, x, z, f(1 - t)); this.lagoon(out, col, x, z, t); }
    else if (d < 900) this.lagoon(out, col, x, z, 1);
    else if (d < 1000) { const t = f(f(d - 900) / 100); this.lagoon(out, col, x, z, f(1 - t)); this.desert(out, col); }
    else if (d < 1600) this.desert(out, col);
    else if (d < 1700) { const t = f(f(d - 1600) / 100); this.desert(out, col); this.mountains(out, col, x, z, t); }
    else if (d < 2300) this.mountains(out, col, x, z, 1);
    else if (d < 2400) { const t = f(f(d - 2300) / 100); this.mountains(out, col, x, z, f(1 - t)); this.arctic(out, col); }
    else if (d < 3000) this.arctic(out, col);
    else if (d < 3600) { const t = f(f(d - 3000) / 600); hell = f(1 - t); this.descent(out, col, x, z, t); }
    const far = Math.min(1, Math.max(0, f(d / 3600)));
    this.hellCeiling(out, col, x, z, hell);
    if (d > 300 && d < 3600) this.crashSite(out, col, x, z, far);
    this.caves(out, col, x, z);
    this.ores(out, col, x, z, far);
    this.hellFloor(out, col, x, z);
    this.bedrock(out, col, x, z);
    this.origin(out, col, x, z);
  }

  // the noise biomes use for their surface layers
  layer(x, z) { return Math.trunc(f(perlin2(this.P, f(x * 0.5), f(z * 0.5)) * 4)); }

  // ClassicBiome: hills; flat at 66, and sand there; dirt, then bare rock, then snow up high
  classic(out, col, x, z, a) {
    const amp = Math.trunc(lerp(0, 32, a)), base = Math.trunc(lerp(32, 86, a));
    let h = base + Math.trunc(f(this.n * amp));
    let sand = false;
    if (h <= 66) { h = 66; sand = true; }
    if (h >= 128) h = 127;
    const top = h - 3, s = h + this.layer(x, z);
    for (let y = 0; y <= h; y++) {
      let id = B.ROCK;
      if (y >= top) {
        if (s > 95) id = s > 98 ? (s > 108 ? B.SNOW : B.ROCK) : B.DIRT;
        else if (sand) id = B.SAND;
        else id = y === h ? B.GRASS : B.DIRT;
      }
      out[col | (y << 8)] = id;
    }
  }

  // LagoonBiome: lower land, and islands of rock in the sky (grass on their tops) where its 3D
  // noise is low enough
  lagoon(out, col, x, z, a) {
    const P = this.P;
    let h = Math.trunc(lerp(44, 76, a)) + Math.trunc(f(this.n * 32));
    let sand = false;
    if (h <= 66) { sand = true; h = 66; }
    const top = h - 3, s = h + this.layer(x, z);
    const hc = Math.min(h, 127);
    // (what's at or under the ground is built over just below, so only what's above it counts)
    const thr = f(-1 + f(f(0.65) * a));
    const px = f(f(x / 32) + 1000), pz = f(f(z / 32) + 1500), px2 = f(px * 2), pz2 = f(pz * 2);
    for (let y = hc + 1; y < 100; y++) {
      const py = f(f(f((y - 64) / 32) * 1.5) + 2000);
      const n = f(perlin3(P, px, py, pz) + f(perlin3(P, px2, f(py * 2), pz2) / 2));
      if (n < thr) out[col | (y << 8)] = B.ROCK;
    }
    for (let y = hc + 1; y < 127; y++) {
      const i = col | (y << 8);
      if (out[i] === B.ROCK && out[i + 256] !== B.ROCK) out[i] = B.GRASS;
    }
    h = hc;
    for (let y = 0; y <= h; y++) {
      let id;
      if (y < top) id = B.ROCK;
      else if (s > 85) id = s > 88 ? B.ROCK : B.DIRT;
      else if (sand) id = B.SAND;
      else id = y === h ? B.GRASS : B.DIRT;
      out[col | (y << 8)] = id;
    }
  }

  // DesertBiome: sand, three deep, over rock, never under 66
  desert(out, col) {
    let h = 66 + Math.trunc(f(this.n * 16));
    if (h <= 66) h = 66;
    for (let y = 0; y <= h; y++) out[col | (y << 8)] = y > h - 3 ? B.SAND : B.ROCK;
  }

  // MountainBiome: steep, with narrow valleys cut along its noise's contours; snow above 98
  // (more or less), and the valley floors (65) snow all through
  mountains(out, col, x, z, a) {
    const P = this.P;
    const amp = Math.trunc(lerp(0, 32, a)), base = Math.trunc(lerp(32, 86, a));
    let h = base + Math.trunc(f(this.fbm(x, z, K021) * amp));
    const vx = f(x * K006), vz = f(z * K006);
    let r = 0;
    for (let m = 1; m <= 32; m *= 2) r = f(r + f(perlin2(P, f(vx * m), f(vz * m)) / m));
    r = f(f(r + 1) / 2);
    let fr = f(r - Math.floor(r));
    fr = f(fr - 0.5);
    r = f(Math.pow(2, f(f(-fr * fr) * 1000)));
    h -= Math.trunc(f(r * amp));
    let low = false;
    if (h <= 65) { h = 65; low = true; }
    h += Math.trunc(f(f(f(perlin2(P, f(vx + 1000), f(vz + 1000)) * a)) * 10));
    let snow = h - 4;
    if (snow < 98) snow = 98;
    snow += this.layer(x, z);
    if (h >= 128) h = 127;
    for (let y = 0; y <= h; y++) out[col | (y << 8)] = low || y >= snow ? B.SNOW : B.ROCK;
  }

  // ArcticBiome: snow over a layer of ice over rock; where it's low (54), ice on top
  arctic(out, col) {
    let h = 64 + Math.trunc(f(this.n * 16));
    let ice = false;
    if (h <= 54) { h = 54; ice = true; }
    for (let y = 0; y <= h; y++) out[col | (y << 8)] = y === h ? (ice ? B.ICE : B.SNOW) : y === h - 1 ? B.ICE : B.ROCK;
  }

  // DecentBiome: the ground sinks from 64 to under the bottom of the world, and its 3D noise
  // takes more and more of it away
  descent(out, col, x, z, a) {
    const P = this.P;
    const h = Math.trunc(lerp(64, -16, a)) + Math.trunc(f(this.n * 16));
    const thr = f(f(a * 2) - 1);
    const px = f(x / 16), pz = f(z / 16), px2 = f(px * 2), pz2 = f(pz * 2);
    // (above the ground it would only take away what isn't there)
    for (let y = 0; y <= h && y < HEIGHT; y++) {
      const py = f((y - 64) / 16);
      const n = f(perlin3(P, px, py, pz) + f(perlin3(P, px2, f(py * 2), pz2) / 2));
      out[col | (y << 8)] = n < thr ? B.AIR : B.ROCK;
    }
  }

  // HellCeilingBiome: Hell's cavern, all the way up to 28 or so, and its bloodstone ceiling;
  // shallower in the descent, where the ground comes down to meet it
  hellCeiling(out, col, x, z, a) {
    const v = Math.trunc(lerp(0, 32, a)) - Math.trunc(f(f(this.fbm(x, z, K031, 1000) + 1) * 4));
    for (let y = 0; y <= v; y++) {
      const i = col | (y << 8);
      if (y < v) out[i] = B.AIR;
      else if (out[i] === B.ROCK) out[i] = B.BLOODSTONE;
    }
  }

  // HellFloorBiome: Hell's floor, bloodstone, about 7 up, and lava (to 4) where it's lower
  hellFloor(out, col, x, z) {
    const v = 4 + Math.trunc(f(this.fbm(x, z, K031, 200) * 10)) + 3;
    for (let y = 0; y < 32; y++) {
      if (y < v) out[col | (y << 8)] = B.BLOODSTONE;
      else if (y <= 4) out[col | (y << 8)] = B.LAVA;
    }
  }

  // CaveBiome: wherever its 3D noise is low, anything but sand
  caves(out, col, x, z) {
    const P = this.P;
    const px = f(x / 16), pz = f(z / 16), px2 = f(px * 2), pz2 = f(pz * 2), thr = f(-0.35);
    for (let y = 0; y < HEIGHT; y++) {
      const i = col | (y << 8), b = out[i];
      if (b === B.AIR || b === UNSET || b === B.SAND) continue;
      const py = f(f((y - 64) / 16) * 1.5);
      const n = f(perlin3(P, px, py, pz) + f(perlin3(P, px2, f(py * 2), pz2) / 2));
      if (n < thr) out[i] = B.AIR;
    }
  }

  // OreDepositer: in the rock, coal and copper, iron and gold, lava and diamonds by its IntNoise,
  // gold under 50, lava and diamonds under 50 and 40, all of them commoner further out
  ores(out, col, x, z, far) {
    const I = this.I, v0 = Math.trunc(f(far * 10));
    const deposit = (ox, oy, oz, k) => intNoise3(I, idiv(ox, k), idiv(oy, k), idiv(oz, k)) + idiv(intNoise3(I, ox, oy, oz) - 128, 8);
    for (let y = 0; y < HEIGHT; y++) {
      const i = col | (y << 8);
      if (out[i] !== B.ROCK) continue;
      const wy = y - 64;
      let v = deposit(x, wy, z, 4);
      if (v > 255 - v0) out[i] = B.COAL_ORE;
      else if (v < v0 - 5) out[i] = B.COPPER_ORE;
      v = deposit(x + 1000, wy + 1000, z + 1000, 3);
      if (v > 264 - v0) out[i] = B.IRON_ORE;
      else if (v < -9 + v0 && y < 50) out[i] = B.GOLD_ORE;
      if (y < 50) {
        v = deposit(x + 777, wy + 777, z + 777, 2);
        if (v > 265 - v0) out[i] = B.LAVA;
        else if (v < -11 + v0 && y < 40) out[i] = B.DIAMOND_ORE;
      }
    }
  }

  // BedrockDepositer: one to three of bedrock at the bottom
  bedrock(out, col, x, z) {
    const n = 1 + idiv(intNoise2(this.I, x, z) * 3, 256);
    for (let y = 0; y < n; y++) out[col | (y << 8)] = B.BEDROCK;
  }

  // OriginBiome: the tower, round, 125 high in the middle and 8 lower for each step out, lit at
  // the top. (Its distance is an int, as the original's is: far enough out, past 46,341, it
  // overflows, the square root of it is no number, and the tower goes up everywhere.)
  origin(out, col, x, z) {
    const d2 = (Math.imul(x, x) + Math.imul(z, z)) | 0;
    if (d2 >= 15625) return;
    const s = Math.sqrt(d2);
    const r = Number.isNaN(s) ? -2147483648 : Math.round(s);
    if (r > 4) return;
    const h = (125 - Math.imul(r, 8)) | 0;
    for (let y = 0; y < h && y < HEIGHT; y++) out[col | (y << 8)] = y === h - 1 && r < 2 ? B.FIXED_LANTERN : B.BEDROCK;
  }

  // CrashSiteDepositer: where its noise is high enough, a crater down from 66; deeper still, an
  // asteroid of space rock either side of its bottom; everything under it gone to 10 short of
  // the rock (but bloodstone and what's on it); Space Goo in the rock, more of it further out
  crater(x, z) {
    const v = perlin2(this.P, f(K004 * x), f(K004 * z));
    if (v <= 0.5) return null;
    const depth = Math.trunc(f(f(f(v - 0.5) * 7) * 20));
    const rock = v > F055 ? Math.min(depth, Math.trunc(f(f(f(v - F055) * 10) * 20))) : 0;
    return { depth, rock };
  }

  crashSite(out, col, x, z, far) {
    const c = this.crater(x, z);
    if (!c) return;
    const I = this.I, goo = Math.trunc(f(far * 10));
    const { depth, rock } = c;
    const under = 66 - depth - rock - 10, top = 66 - depth + rock;
    for (let y = 20; y < 126; y++) {
      const i = col | (y << 8);
      if (y < under) {
        if (out[i] !== B.BLOODSTONE && out[i - 256] !== B.BLOODSTONE) out[i] = B.AIR;
      } else if (rock > 0 && y < top) out[i] = B.SPACE_ROCK;
      else if (y >= top) out[i] = B.AIR;
      if (out[i] === B.SPACE_ROCK && y < top - 3) {
        const ox = x + 777, oy = y - 64 + 777, oz = z + 777;
        const v = intNoise3(I, idiv(ox, 2), idiv(oy, 2), idiv(oz, 2)) + idiv(intNoise3(I, ox, oy, oz) - 128, 8);
        if (v > 265 - goo) out[i] = B.SLIME;
      }
    }
  }

  // TreeDepositer: where its noise is over 0.6, on the highest grass, a trunk of 5 to 8 (shorter
  // if something's in the way), and a ball of leaves round its top, ragged by its 3D noise
  tree(out, col, x, z) {
    const P = this.P;
    const v = perlin2(P, f(x * K043), f(z * K043));
    if (v <= F06) return;
    let y = 124;
    while (y > 0 && out[col | (y << 8)] !== B.GRASS) y--;
    if (y <= 1) return;
    y++;
    let trunk = 5 + Math.trunc(f(9 * f(v - F06)));
    for (let k = 0; k < trunk; k++) {
      const i = col | ((y + k) << 8), b = out[i];
      if (b !== B.AIR && b !== UNSET) { trunk = k; break; }
      out[i] = B.LOG;
    }
    const cy = y + trunk;
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) for (let dy = -3; dy <= 3; dy++) {
      const ly = cy + dy;
      if (ly < 0 || ly >= HEIGHT) continue;
      const i = (col + dx + (dz << 4)) | (ly << 8), b = out[i];
      if (b !== B.AIR && b !== UNSET) continue;
      const n = perlin3(P, f((x + dx) * 0.5), f((ly - 64) * 0.5), f((z + dz) * 0.5));
      const r = f(1 - f(f(Math.sqrt(dx * dx + dy * dy + dz * dz)) / 3));
      if (f(n + r) > 0.25) out[i] = B.LEAVES;
    }
  }

  // ---- where you start ----------------------------------------------------------------------

  // The original's DefaultStartLocation (8, -8), down onto the ground: the first place, from
  // the top, with ground under it and room to stand
  spawnPoint() {
    if (!this.spawn) {
      const cx = Math.floor(START.x / CHUNK), cz = Math.floor(START.z / CHUNK);
      const c = this.generateColumn(cx, cz), col = (START.x & 15) | ((START.z & 15) << 4);
      let y = HEIGHT - 3;
      while (y > 1 && !(SOLID[c[col | ((y - 1) << 8)]] && !SOLID[c[col | (y << 8)]] && !SOLID[c[col | ((y + 1) << 8)]])) y--;
      this.spawn = { x: START.x + 0.5, y, z: START.z + 0.5 };
    }
    return this.spawn;
  }

  // the ground the start stands on (the menus' view of the tower is set from it)
  towerBase() { return this.spawnPoint().y - 1; }
}
