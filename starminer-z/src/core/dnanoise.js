// The original's own noise, so that a world's seed builds the world the original would build
// from it: .NET's System.Random (which seeds the tables), and DNA.Drawing.Noise's PerlinNoise
// and IntNoise, with the original's single-precision arithmetic (every step rounded to a float,
// as its floats are) and its quirks: PerlinNoise's FastFloor takes 0 and the negative whole
// numbers one too low.
//
// Both noises keep their table in a static field, so every instance shares whichever table was
// made last. CastleMinerZBuilder makes its crash sites' noises last: a PerlinNoise from the
// world's seed, after an IntNoise seeded with 1. So all its Perlin noise comes from the world's
// seed, and all its IntNoise (the ores, the bedrock, the Space Goo) from 1, the same in every
// world.

const MBIG = 2147483647, MSEED = 161803398;
const f = Math.fround;

// System.Random (the reference source's: Knuth's subtractive generator, as .NET has it)
export class NetRandom {
  constructor(seed) {
    seed |= 0;
    const S = new Int32Array(56);
    let mj = MSEED - (seed === -2147483648 ? 2147483647 : Math.abs(seed));
    S[55] = mj;
    let mk = 1;
    for (let i = 1; i < 55; i++) {
      const ii = (21 * i) % 55;
      S[ii] = mk;
      mk = mj - mk;
      if (mk < 0) mk += MBIG;
      mj = S[ii];
    }
    for (let k = 1; k < 5; k++) {
      for (let i = 1; i < 56; i++) {
        let v = S[i] - S[1 + ((i + 30) % 55)];
        if (v < 0) v += MBIG;
        S[i] = v;
      }
    }
    this.S = S;
    this.inext = 0;
    this.inextp = 21;
  }

  internalSample() {
    const S = this.S;
    let a = this.inext + 1, b = this.inextp + 1;
    if (a >= 56) a = 1;
    if (b >= 56) b = 1;
    let r = S[a] - S[b];
    if (r === MBIG) r--;
    if (r < 0) r += MBIG;
    S[a] = r;
    this.inext = a;
    this.inextp = b;
    return r;
  }

  // Next(): 0 to 2147483646
  nextInt() { return this.internalSample(); }

  // NextDouble()
  nextDouble() { return this.internalSample() * (1 / MBIG); }

  // Next(maxValue): (int)(Sample() * maxValue)
  next(max) { return Math.trunc(this.nextDouble() * max); }
}

// A table as both noises' Initalize fills it: each of the first 256 entries one Next(256), the
// same again 256 on, then the first 512 copied after them
export function noiseTable(seed) {
  const r = new NetRandom(seed), P = new Int32Array(1024);
  for (let i = 0; i < 256; i++) P[i] = P[256 + i] = r.next(256);
  for (let i = 0; i < 512; i++) P[512 + i] = P[i];
  return P;
}

// ---- PerlinNoise ------------------------------------------------------------------------------

// its 32 gradient vectors (from the assembly's static data); 2D uses the first 8, 3D the first 16
const G = [
  [0, -1, -1, -1], [-1, 0, -1, -1], [1, 0, -1, -1], [0, 1, -1, -1], [-1, -1, 0, -1], [1, -1, 0, -1], [-1, 1, 0, -1], [1, 1, 0, -1],
  [0, -1, 1, -1], [-1, 0, 1, -1], [1, 0, 1, -1], [0, 1, 1, -1], [1, 1, 0, 1], [-1, 1, 0, 1], [0, -1, -1, 1], [0, -1, 1, 1],
  [-1, -1, -1, 0], [1, -1, -1, 0], [-1, 1, -1, 0], [1, 1, -1, 0], [-1, -1, 1, 0], [1, -1, 1, 0], [-1, 1, 1, 0], [1, 1, 1, 0],
  [-1, 0, -1, 1], [1, 0, -1, 1], [0, 1, -1, 1], [-1, -1, 0, 1], [1, -1, 0, 1], [-1, 0, 1, 1], [1, 0, 1, 1], [0, 1, 1, 1],
];
const GX = Int8Array.from(G, (g) => g[0]), GY = Int8Array.from(G, (g) => g[1]), GZ = Int8Array.from(G, (g) => g[2]);

// FastFloor: (int)a when a > 0, else (int)a - 1 (so 0 gives -1, and -2 gives -3)
const fastFloor = (a) => (a > 0 ? Math.trunc(a) : Math.trunc(a) - 1);
const fade = (t) => f(f(f(t * t) * t) * f(f(t * f(f(t * 6) - 15)) + 10));
const lerp = (t, a, b) => f(a + f(t * f(b - a)));
const grad2 = (h, x, y) => { h &= 7; return f(x * GX[h] + y * GY[h]); };
const grad3 = (h, x, y, z) => { h &= 15; return f(f(x * GX[h] + y * GY[h]) + z * GZ[h]); };

// ComputeNoise(x, y): P is the table; x and y floats
export function perlin2(P, x, y) {
  const X = fastFloor(x), Y = fastFloor(y);
  const xi = X & 255, yi = Y & 255;
  x = f(x - X); y = f(y - Y);
  const u = fade(x), v = fade(y);
  const A = P[xi] + yi, B = P[xi + 1] + yi;
  const x1 = f(x - 1), y1 = f(y - 1);
  const a = lerp(u, grad2(P[A], x, y), grad2(P[B], x1, y));
  const b = lerp(u, grad2(P[A + 1], x, y1), grad2(P[B + 1], x1, y1));
  return lerp(v, a, b);
}

// ComputeNoise(x, y, z), and ComputeNoise(Vector3), which is the same with FastFloor inlined
export function perlin3(P, x, y, z) {
  const X = fastFloor(x), Y = fastFloor(y), Z = fastFloor(z);
  const xi = X & 255, yi = Y & 255, zi = Z & 255;
  x = f(x - X); y = f(y - Y); z = f(z - Z);
  const u = fade(x), v = fade(y), w = fade(z);
  const A = P[xi] + yi, AA = P[A] + zi, AB = P[A + 1] + zi;
  const B = P[xi + 1] + yi, BA = P[B] + zi, BB = P[B + 1] + zi;
  const x1 = f(x - 1), y1 = f(y - 1), z1 = f(z - 1);
  const g000 = grad3(P[AA], x, y, z), g100 = grad3(P[BA], x1, y, z);
  const g010 = grad3(P[AB], x, y1, z), g110 = grad3(P[BB], x1, y1, z);
  const g001 = grad3(P[AA + 1], x, y, z1), g101 = grad3(P[BA + 1], x1, y, z1);
  const g011 = grad3(P[AB + 1], x, y1, z1), g111 = grad3(P[BB + 1], x1, y1, z1);
  const a = lerp(u, g000, g100), b = lerp(u, g010, g110), c = lerp(u, g001, g101), d = lerp(u, g011, g111);
  return lerp(w, lerp(v, a, b), lerp(v, c, d));
}

// ---- IntNoise ---------------------------------------------------------------------------------

// ComputeNoise(x, y, z) and ComputeNoise(x, y): 0 to 255
export const intNoise3 = (P, x, y, z) => P[P[P[x & 255] + (y & 255)] + (z & 255)];
export const intNoise2 = (P, x, y) => P[P[x & 255] + (y & 255)];

// C#'s integer division (towards zero)
export const idiv = (a, b) => Math.trunc(a / b);
