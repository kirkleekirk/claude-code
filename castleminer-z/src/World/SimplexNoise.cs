namespace CastleMinerZ.World
{
    /// <summary>
    /// Seeded 2D/3D simplex noise.
    ///
    /// Instanced rather than static so the generator can hold several independent
    /// fields (height, temperature, humidity, caves) off one world seed, and so the
    /// worker threads never share mutable state. Every method here is allocation-free;
    /// terrain generation calls them millions of times per column batch.
    /// </summary>
    public sealed class SimplexNoise
    {
        private static readonly int[,] Grad3 =
        {
            {1,1,0}, {-1,1,0}, {1,-1,0}, {-1,-1,0},
            {1,0,1}, {-1,0,1}, {1,0,-1}, {-1,0,-1},
            {0,1,1}, {0,-1,1}, {0,1,-1}, {0,-1,-1}
        };

        private const float F2 = 0.36602540378f;   // 0.5 * (sqrt(3) - 1)
        private const float G2 = 0.21132486540f;   // (3 - sqrt(3)) / 6
        private const float F3 = 0.33333333333f;
        private const float G3 = 0.16666666667f;

        private readonly byte[] _perm = new byte[512];
        private readonly byte[] _permMod12 = new byte[512];

        public SimplexNoise(int seed)
        {
            byte[] p = new byte[256];
            for (int i = 0; i < 256; i++) p[i] = (byte)i;

            // Fisher-Yates with a small xorshift so the same seed always gives the same world.
            uint state = (uint)seed;
            if (state == 0) state = 0x9E3779B9u;
            for (int i = 255; i > 0; i--)
            {
                state ^= state << 13;
                state ^= state >> 17;
                state ^= state << 5;
                int j = (int)(state % (uint)(i + 1));
                byte tmp = p[i];
                p[i] = p[j];
                p[j] = tmp;
            }

            for (int i = 0; i < 512; i++)
            {
                _perm[i] = p[i & 255];
                _permMod12[i] = (byte)(_perm[i] % 12);
            }
        }

        private static int Floor(float x)
        {
            int xi = (int)x;
            return x < xi ? xi - 1 : xi;
        }

        private static float Dot(int g, float x, float y)
        {
            return Grad3[g, 0] * x + Grad3[g, 1] * y;
        }

        private static float Dot(int g, float x, float y, float z)
        {
            return Grad3[g, 0] * x + Grad3[g, 1] * y + Grad3[g, 2] * z;
        }

        /// <summary>2D noise in roughly [-1, 1].</summary>
        public float Noise(float xin, float yin)
        {
            float s = (xin + yin) * F2;
            int i = Floor(xin + s);
            int j = Floor(yin + s);

            float t = (i + j) * G2;
            float x0 = xin - (i - t);
            float y0 = yin - (j - t);

            int i1, j1;
            if (x0 > y0) { i1 = 1; j1 = 0; }
            else { i1 = 0; j1 = 1; }

            float x1 = x0 - i1 + G2;
            float y1 = y0 - j1 + G2;
            float x2 = x0 - 1.0f + 2.0f * G2;
            float y2 = y0 - 1.0f + 2.0f * G2;

            int ii = i & 255;
            int jj = j & 255;
            int gi0 = _permMod12[ii + _perm[jj]];
            int gi1 = _permMod12[ii + i1 + _perm[jj + j1]];
            int gi2 = _permMod12[ii + 1 + _perm[jj + 1]];

            float n0 = 0.0f, n1 = 0.0f, n2 = 0.0f;

            float t0 = 0.5f - x0 * x0 - y0 * y0;
            if (t0 > 0.0f) { t0 *= t0; n0 = t0 * t0 * Dot(gi0, x0, y0); }

            float t1 = 0.5f - x1 * x1 - y1 * y1;
            if (t1 > 0.0f) { t1 *= t1; n1 = t1 * t1 * Dot(gi1, x1, y1); }

            float t2 = 0.5f - x2 * x2 - y2 * y2;
            if (t2 > 0.0f) { t2 *= t2; n2 = t2 * t2 * Dot(gi2, x2, y2); }

            return 70.0f * (n0 + n1 + n2);
        }

        /// <summary>3D noise in roughly [-1, 1]. Used for caves and ore blobs.</summary>
        public float Noise(float xin, float yin, float zin)
        {
            float s = (xin + yin + zin) * F3;
            int i = Floor(xin + s);
            int j = Floor(yin + s);
            int k = Floor(zin + s);

            float t = (i + j + k) * G3;
            float x0 = xin - (i - t);
            float y0 = yin - (j - t);
            float z0 = zin - (k - t);

            int i1, j1, k1, i2, j2, k2;
            if (x0 >= y0)
            {
                if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
                else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
                else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
            }
            else
            {
                if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
                else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
                else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
            }

            float x1 = x0 - i1 + G3;
            float y1 = y0 - j1 + G3;
            float z1 = z0 - k1 + G3;
            float x2 = x0 - i2 + 2.0f * G3;
            float y2 = y0 - j2 + 2.0f * G3;
            float z2 = z0 - k2 + 2.0f * G3;
            float x3 = x0 - 1.0f + 3.0f * G3;
            float y3 = y0 - 1.0f + 3.0f * G3;
            float z3 = z0 - 1.0f + 3.0f * G3;

            int ii = i & 255;
            int jj = j & 255;
            int kk = k & 255;
            int gi0 = _permMod12[ii + _perm[jj + _perm[kk]]];
            int gi1 = _permMod12[ii + i1 + _perm[jj + j1 + _perm[kk + k1]]];
            int gi2 = _permMod12[ii + i2 + _perm[jj + j2 + _perm[kk + k2]]];
            int gi3 = _permMod12[ii + 1 + _perm[jj + 1 + _perm[kk + 1]]];

            float n0 = 0.0f, n1 = 0.0f, n2 = 0.0f, n3 = 0.0f;

            float t0 = 0.6f - x0 * x0 - y0 * y0 - z0 * z0;
            if (t0 > 0.0f) { t0 *= t0; n0 = t0 * t0 * Dot(gi0, x0, y0, z0); }

            float t1 = 0.6f - x1 * x1 - y1 * y1 - z1 * z1;
            if (t1 > 0.0f) { t1 *= t1; n1 = t1 * t1 * Dot(gi1, x1, y1, z1); }

            float t2 = 0.6f - x2 * x2 - y2 * y2 - z2 * z2;
            if (t2 > 0.0f) { t2 *= t2; n2 = t2 * t2 * Dot(gi2, x2, y2, z2); }

            float t3 = 0.6f - x3 * x3 - y3 * y3 - z3 * z3;
            if (t3 > 0.0f) { t3 *= t3; n3 = t3 * t3 * Dot(gi3, x3, y3, z3); }

            return 32.0f * (n0 + n1 + n2 + n3);
        }

        /// <summary>Fractal Brownian motion: octaves of 2D noise at halving amplitude.</summary>
        public float Fbm(float x, float y, int octaves, float frequency, float lacunarity, float gain)
        {
            float sum = 0.0f;
            float amp = 1.0f;
            float norm = 0.0f;
            for (int o = 0; o < octaves; o++)
            {
                sum += Noise(x * frequency, y * frequency) * amp;
                norm += amp;
                amp *= gain;
                frequency *= lacunarity;
            }
            return norm > 0.0f ? sum / norm : 0.0f;
        }

        /// <summary>Ridged fBm, which gives mountains sharp crests instead of rolling humps.</summary>
        public float Ridged(float x, float y, int octaves, float frequency, float lacunarity, float gain)
        {
            float sum = 0.0f;
            float amp = 1.0f;
            float norm = 0.0f;
            for (int o = 0; o < octaves; o++)
            {
                float n = Noise(x * frequency, y * frequency);
                n = 1.0f - (n < 0.0f ? -n : n);
                sum += n * n * amp;
                norm += amp;
                amp *= gain;
                frequency *= lacunarity;
            }
            return norm > 0.0f ? (sum / norm) * 2.0f - 1.0f : 0.0f;
        }
    }

    /// <summary>
    /// Small xorshift PRNG. Deterministic per column so terrain decoration (trees, ore
    /// blobs, spawn points) regenerates identically whichever order columns load in.
    /// </summary>
    public struct FastRandom
    {
        private uint _state;

        public FastRandom(int seed)
        {
            _state = (uint)seed;
            if (_state == 0) _state = 0x6C078965u;
        }

        public uint NextUInt()
        {
            _state ^= _state << 13;
            _state ^= _state >> 17;
            _state ^= _state << 5;
            return _state;
        }

        /// <summary>Non-negative int below <paramref name="max"/>.</summary>
        public int Next(int max)
        {
            if (max <= 0) return 0;
            return (int)(NextUInt() % (uint)max);
        }

        public int Next(int min, int max)
        {
            if (max <= min) return min;
            return min + Next(max - min);
        }

        public float NextFloat()
        {
            return (NextUInt() >> 8) * (1.0f / 16777216.0f);
        }

        public bool Chance(float probability)
        {
            return NextFloat() < probability;
        }

        /// <summary>Mixes coordinates into a seed so per-column streams are independent.</summary>
        public static int Hash(int a, int b, int seed)
        {
            uint h = (uint)seed;
            h ^= (uint)a * 0x9E3779B1u;
            h ^= (uint)b * 0x85EBCA77u;
            h ^= h >> 15;
            h *= 0xC2B2AE3Du;
            h ^= h >> 13;
            return (int)h;
        }
    }
}
