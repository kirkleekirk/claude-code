// World generator and mesher checks that run in Node: the original's noise and world builder
// (against what its code does), timings, the lighting and meshes, and a top-down map of the
// world round the start written to tools/out/rings.png.
//
//   node tools/test-world.mjs

import { WorldGen, BIOMES } from '../src/world/gen.js';
import { OldWorldGen } from '../src/world/genOld.js';
import { NetRandom } from '../src/core/dnanoise.js';
import { Mesher } from '../src/world/mesher.js';
import { B, HEIGHT, OPAQUE, SOLID, RENDER } from '../src/world/blocks.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'out');
mkdirSync(out, { recursive: true });

let failures = 0;
const check = (ok, msg) => { if (!ok) { failures++; console.log('FAIL', msg); } else console.log('ok  ', msg); };

// ---- .NET's System.Random, which seeds the original's noise: its first numbers, as .NET gives them
{
  const first = (s) => { const r = new NetRandom(s); return [0, 1, 2].map(() => r.nextInt()).join(','); };
  check(first(0) === '1559595546,1755192844,1649316166' && first(1) === '534011718,237820880,1002897798' && first(42) === '1434747710,302596119,269548474', `System.Random as .NET has it (seed 1: ${first(1)})`);
}

const gen = new WorldGen(1337);
const cols = new Map();
const key = (x, z) => `${x},${z}`;
const column = (cx, cz) => { let c = cols.get(key(cx, cz)); if (!c) { c = gen.generateColumn(cx, cz); cols.set(key(cx, cz), c); } return c; };
const at = (x, y, z) => column(Math.floor(x / 16), Math.floor(z / 16))[(x & 15) | ((z & 15) << 4) | (y << 8)];
const top = (x, z) => { let y = HEIGHT - 1; while (y > 0 && at(x, y, z) === B.AIR) y--; return y; };

// ---- generation timing ----
let t0 = performance.now();
for (let cz = -3; cz <= 3; cz++) for (let cx = -3; cx <= 3; cx++) column(cx, cz);
const genMs = (performance.now() - t0) / 49;
console.log(`generate: ${genMs.toFixed(1)} ms per column`);
check(genMs < 60, 'column generation under 60 ms');

// ---- the tower (OriginBiome): round, 125 high in the middle, 8 lower each step out, its tip lanterns
check(at(0, 124, 0) === B.FIXED_LANTERN && at(0, 123, 0) === B.BEDROCK && at(0, 125, 0) === B.AIR, 'the tower: 125 high, a lantern at the top');
check(at(1, 116, 0) === B.FIXED_LANTERN && at(2, 108, 0) === B.BEDROCK && at(2, 109, 0) === B.AIR && at(4, 92, 0) === B.BEDROCK && at(3, 0, 3) === B.BEDROCK, 'stepping in: 117, 109 ... 93 out to 4');
check(at(5, 92, 0) !== B.BEDROCK || at(5, 93, 0) === B.AIR, 'nothing of it past 4 out');

// ---- where you start: the original's (8, -8), on the ground, room to stand
const sp = gen.spawnPoint();
check(sp.x === 8.5 && sp.z === -7.5, `start by the tower, at (8, -8) (${sp.x}, ${sp.z})`);
check(SOLID[at(8, sp.y - 1, -8)] === 1 && at(8, sp.y, -8) !== undefined && !SOLID[at(8, sp.y, -8)] && !SOLID[at(8, sp.y + 1, -8)], `standing on the ground there (y=${sp.y})`);

// ---- the rings, out and back (mirrored every 4400)
{
  const order = [];
  for (let d = 0; d < 8800; d += 25) {
    const name = BIOMES[gen.biomeAt(d * 0.6, d * 0.8)];
    if (order[order.length - 1] !== name) order.push(name);
  }
  console.log('zones walking out:', order.join(' > '));
  check(order.slice(0, 7).join() === BIOMES.join(), "zones in the original's order");
  check(order.slice(6, 13).join() === BIOMES.slice().reverse().join(), 'then back again in reverse, past 4400');
  check(Math.abs(gen.distance(4500, 0) - 4300) < 0.01 && Math.abs(gen.distance(8900, 0) - 100) < 0.01, 'the world turns back on itself at 4400');
}

// ---- the surface of each, as their biomes build it
{
  const surface = (d) => {
    const seen = {};
    for (let k = 0; k < 40; k++) {
      const a = k * 0.157, x = Math.round(Math.cos(a) * d), z = Math.round(Math.sin(a) * d);
      const id = at(x, top(x, z), z);
      seen[id] = (seen[id] || 0) + 1;
    }
    return seen;
  };
  const most = (s) => +Object.entries(s).sort((p, q) => q[1] - p[1])[0][0];
  const desert = surface(1300), arctic = surface(2700), hell = surface(4000);
  check(most(desert) === B.SAND, `the Desert is sand (${JSON.stringify(desert)})`);
  check(most(arctic) === B.SNOW || most(arctic) === B.ICE, `the Arctic is snow and ice (${JSON.stringify(arctic)})`);
  const hellTops = [0, 1, 2, 3].map((k) => top(Math.round(4000 * Math.cos(k)), Math.round(4000 * Math.sin(k))));
  check((hell[B.BLOODSTONE] || 0) + (hell[B.LAVA] || 0) >= 30 && hellTops.every((y) => y < 20), `Hell: its bloodstone floor and lava, open to the sky (tops ${hellTops.join(', ')})`);
}

// ---- Hell's cavern under everything: a bloodstone floor at 7 or so, open to 28 or so, then rock
{
  let open = 0, floor = 0, n = 0;
  for (let x = 30; x < 60; x += 3) for (let z = 30; z < 60; z += 3) {
    n++;
    if (at(x, 15, z) === B.AIR && at(x, 20, z) === B.AIR) open++;
    if (at(x, 3, z) === B.BLOODSTONE || at(x, 3, z) === B.LAVA || at(x, 3, z) === B.BEDROCK) floor++;
  }
  check(open >= n * 0.9 && floor >= n * 0.9, `Hell's cavern under the start (${open} of ${n} open at 15-20, floor under ${floor})`);
}

// ---- trees only on grass; crash sites only between 300 and 3600; ore richer further out
{
  let logs = 0, bad = 0;
  for (let cz = -3; cz <= 3; cz++) for (let cx = -3; cx <= 3; cx++) {
    const c = column(cx, cz);
    for (let i = 0; i < c.length; i++) if (c[i] === B.LOG && (i >> 8) > 0 && c[i - 256] !== B.LOG) { logs++; if (c[i - 256] !== B.GRASS) bad++; }
  }
  check(logs > 10 && bad === 0, `trees grow from grass (${logs} trunks, ${bad} not on grass)`);
  let near = 0, mid = 0;
  for (let a = 0; a < 6.28; a += 0.05) {
    for (let d = 40; d < 300; d += 20) if (gen.crater(d * Math.cos(a), d * Math.sin(a))) near++;
    for (let d = 300; d < 3600; d += 20) if (gen.crater(d * Math.cos(a), d * Math.sin(a))) mid++;
  }
  check(mid > 0, `crash sites out between 300 and 3600 (${mid} samples in craters)`);
  const ores = (cx, cz) => {
    const c = gen.generateColumn(cx, cz);
    let n = 0;
    for (let i = 0; i < c.length; i++) if (c[i] >= B.COAL_ORE && c[i] <= B.DIAMOND_ORE) n++;
    return n;
  };
  let o1 = 0, o2 = 0;
  for (let k = 0; k < 4; k++) { o1 += ores(10 + k, 3); o2 += ores(170 + k, 50); }
  check(o2 > o1, `more ore further out (${o1} near the start, ${o2} at 2900)`);
}

// ---- meshing ----
const mesher = new Mesher();
let quads = 0, ms = 0, n = 0;
// which air each column found unlit (no daylight, no torch or lantern light): its own and the
// cells just round it (x and z -1 to 16), to see that neighbours agree where they meet
const unlitSeen = new Map();
let ranges = true, seams = 0, dark = 0, lit = 0;
for (let cz = -2; cz <= 2; cz++) for (let cx = -2; cx <= 2; cx++) {
  const nine = [];
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) nine.push(column(cx + dx, cz + dz));
  const t = performance.now();
  const r = mesher.build(nine, cx, cz);
  ms += performance.now() - t; n++;
  quads += (r.opaque.count + r.cutout.count) / 4;
  for (const g of [r.opaque, r.cutout]) {
    if (!(g.seam <= g.lit && g.lit <= g.index.length && g.seam % 6 === 0 && g.lit % 6 === 0)) ranges = false;
    seams += g.seam / 6; lit += (g.lit - g.seam) / 6; dark += (g.index.length - g.lit) / 6;
  }
  const seen = new Uint8Array(18 * 18 * HEIGHT);
  for (let y = 0; y < HEIGHT; y++) for (let z = -1; z <= 16; z++) for (let x = -1; x <= 16; x++) {
    const i = y * 48 * 48 + (z + 16) * 48 + x + 16;
    seen[(x + 1) + (z + 1) * 18 + y * 324] = mesher.unlit(i) ? 1 : 0;
  }
  unlitSeen.set(`${cx},${cz}`, seen);
  if (cx === 1 && cz === 1) {
    // light: open sky is fully lit, deep rock is dark
    const h = r.heights[0];
    check(h > 40, `heightmap reads ground (${h})`);
    check((r.light[(h + 2) << 8] >> 4) === 15, 'sky light 15 above the ground');
    check(r.opaque.index.length === (r.opaque.count / 4) * 6, 'index count matches quads');
  }
}
console.log(`mesh: ${(ms / n).toFixed(1)} ms per column, ${(quads / n).toFixed(0)} quads per column`);
check(ms / n < 80, 'meshing under 80 ms per column');

// ---- what's drawn from the light: seams, then lit faces, then the faces that look into unlit air
check(ranges, 'each mesh in three parts: seams, lit, unlit');
check(seams > 0 && dark > (lit + dark) * 0.4, `half the faces or so look into unlit air, closed off by a few seams (${Math.round(seams / n)} seams, ${Math.round(lit / n)} lit, ${Math.round(dark / n)} unlit a column)`);
{
  // neighbours must agree on the air between them, or a view could pass where neither drew a seam
  let differ = 0, cells = 0;
  const at = (seen, x, y, z) => seen[(x + 1) + (z + 1) * 18 + y * 324];
  for (const [k, seen] of unlitSeen) {
    const [cx, cz] = k.split(',').map(Number);
    const E = unlitSeen.get(`${cx + 1},${cz}`), S = unlitSeen.get(`${cx},${cz + 1}`);
    for (let y = 0; y < HEIGHT; y++) for (let t = 0; t < 16; t++) {
      if (E) { cells += 2; differ += (at(seen, 16, y, t) !== at(E, 0, y, t)) + (at(E, -1, y, t) !== at(seen, 15, y, t)); }
      if (S) { cells += 2; differ += (at(seen, t, y, 16) !== at(S, t, y, 0)) + (at(S, t, y, -1) !== at(seen, t, y, 15)); }
    }
  }
  check(differ === 0, `neighbouring columns agree on which air is unlit (${differ} of ${cells} cells differ)`);
}
{
  // a sealed room (in rock up to the top of the world, whose roof is the one lit face): unlit,
  // so its faces come last, and it needs no seams; with a torch in it, lit; opened to the sky,
  // seams where the daylight stops
  const solid = new Uint8Array(16 * 16 * HEIGHT).fill(B.ROCK);
  const room = (torch, open) => {
    const c = solid.slice();
    if (!open) for (let y = 40; y < 44; y++) for (let z = 5; z < 12; z++) for (let x = 5; x < 12; x++) c[x | (z << 4) | (y << 8)] = B.AIR;
    if (torch) c[8 | (8 << 4) | (40 << 8)] = B.TORCH;
    // a shaft down from the sky, then a long way along a passage
    if (open) {
      for (let y = 41; y < HEIGHT; y++) c[2 | (2 << 4) | (y << 8)] = B.AIR;
      for (let x = 2; x < 14; x++) for (let z = 2; z < 14; z++) if (x === 2 || z === 13) c[x | (z << 4) | (41 << 8)] = B.AIR;
    }
    const g = mesher.build([solid, solid, solid, solid, c, solid, solid, solid, solid]).opaque;
    return { seams: g.seam / 6, lit: (g.lit - g.seam) / 6, dark: (g.index.length - g.lit) / 6 };
  };
  const a = room(false, false), b = room(true, false), c = room(false, true);
  check(a.seams === 0 && a.lit === 1 && a.dark > 0, `a sealed room is unlit, with no seams (${JSON.stringify(a)})`);
  check(b.seams === 0 && b.dark === 0 && b.lit > 1, `with a torch in it, lit (${JSON.stringify(b)})`);
  check(c.seams > 0 && c.lit > 0 && c.dark > 0, `opened to the sky by a shaft and a passage: lit near it, seams where it stops (${JSON.stringify(c)})`);
}

// ---- the worlds made before the original's builder keep their land ----
{
  const old = new OldWorldGen(1337), sp = old.spawnPoint();
  check(sp.x === 0.5 && sp.z === 30.5 && sp.y > 60, `the old builder still builds its land (its start 30 m out: ${JSON.stringify(sp)})`);
  const m = new Mesher();
  m.culls = false;
  const nine = [];
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) nine.push(old.generateColumn(dx, 2 + dz));
  const g = m.build(nine, 0, 2).opaque;
  check(g.seam === 0 && g.lit === g.index.length && g.index.length > 0, "and nothing of that is left undrawn (it isn't the original's land, which the rule for what's hidden is made for)");
}

// ---- lighting near a lantern in a sealed box ----
{
  const solid = new Uint8Array(16 * 16 * HEIGHT).fill(B.ROCK);
  const box = solid.slice();
  for (let y = 40; y < 46; y++) for (let z = 4; z < 12; z++) for (let x = 4; x < 12; x++) box[x | (z << 4) | (y << 8)] = B.AIR;
  box[8 | (8 << 4) | (40 << 8)] = B.LANTERN;
  const nine = [solid, solid, solid, solid, box, solid, solid, solid, solid];
  const r = mesher.build(nine);
  const L = (x, y, z) => r.light[x | (z << 4) | (y << 8)];
  check((L(8, 41, 8) & 15) === 14, `lantern lights the cell above it (${L(8, 41, 8) & 15})`);
  check((L(8, 43, 8) >> 4) === 0, 'no sky light in a sealed box');
  check((L(4, 41, 4) & 15) === 14 - 8, `light falls off with distance (${L(4, 41, 4) & 15})`);
}

// top-down map round the start: the top block, shaded by its height
{
  const S = 384;
  const px = new Uint8Array(S * S * 3);
  const colour = {
    [B.GRASS]: [86, 140, 50], [B.SAND]: [214, 196, 140], [B.ROCK]: [120, 116, 108], [B.SNOW]: [236, 240, 246], [B.ICE]: [160, 200, 230],
    [B.BLOODSTONE]: [140, 20, 20], [B.DIRT]: [110, 80, 50], [B.LEAVES]: [40, 110, 30], [B.LOG]: [95, 70, 40], [B.BEDROCK]: [40, 40, 45], [B.FIXED_LANTERN]: [255, 255, 160],
  };
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const x = i - S / 2, z = j - S / 2, y = top(x, z);
    const c = colour[at(x, y, z)] || [255, 0, 255], k = 0.45 + (y - 40) / 100;
    const o = (j * S + i) * 3;
    for (let q = 0; q < 3; q++) px[o + q] = Math.max(0, Math.min(255, c[q] * k));
  }
  writeFileSync(join(out, 'rings.png'), png(S, S, px));
  console.log('wrote tools/out/rings.png');
}

void OPAQUE;
console.log(failures ? `${failures} check(s) failed` : 'all checks passed');
process.exit(failures ? 1 : 0);

function png(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; Buffer.from(rgb.buffer, y * w * 3, w * 3).copy(raw, y * (w * 3 + 1) + 1); }
  const crc = (buf) => { let c = ~0; for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
