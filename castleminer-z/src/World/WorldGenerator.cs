namespace CastleMinerZ.World
{
    /// <summary>Per-thread scratch buffers for column generation, so workers never allocate.</summary>
    public sealed class GenScratch
    {
        public readonly int[] Height = new int[Constants.ChunkSize * Constants.ChunkSize];
        public readonly byte[] Biome = new byte[Constants.ChunkSize * Constants.ChunkSize];
    }

    /// <summary>
    /// Deterministic terrain generation for one column at a time.
    ///
    /// Immutable after construction: several worker threads call <see cref="Generate"/>
    /// concurrently on different columns, and the only per-call state lives in the
    /// caller's <see cref="GenScratch"/>.
    ///
    /// Ore availability is gated on distance from spawn as well as depth -- diamond and
    /// dragon stone simply do not exist near the start, so the only way to tier up your
    /// gear is to walk out into the dangerous zones.
    /// </summary>
    public sealed class WorldGenerator
    {
        private readonly int _seed;

        private readonly SimplexNoise _continent;
        private readonly SimplexNoise _hills;
        private readonly SimplexNoise _mountains;
        private readonly SimplexNoise _temperature;
        private readonly SimplexNoise _humidity;
        private readonly SimplexNoise _caveA;
        private readonly SimplexNoise _caveB;
        private readonly SimplexNoise _ore;

        public int Seed
        {
            get { return _seed; }
        }

        public WorldGenerator(int seed)
        {
            _seed = seed;
            _continent = new SimplexNoise(seed + 1);
            _hills = new SimplexNoise(seed + 2);
            _mountains = new SimplexNoise(seed + 3);
            _temperature = new SimplexNoise(seed + 4);
            _humidity = new SimplexNoise(seed + 5);
            _caveA = new SimplexNoise(seed + 6);
            _caveB = new SimplexNoise(seed + 7);
            _ore = new SimplexNoise(seed + 8);
        }

        /// <summary>Surface height at a world position, without generating the column.</summary>
        public int SurfaceHeightAt(int worldX, int worldZ)
        {
            float temperature, humidity;
            BiomeId biome;
            return ComputeHeight(worldX, worldZ, out temperature, out humidity, out biome);
        }

        public BiomeId BiomeAt(int worldX, int worldZ)
        {
            float temperature, humidity;
            BiomeId biome;
            ComputeHeight(worldX, worldZ, out temperature, out humidity, out biome);
            return biome;
        }

        private int ComputeHeight(int worldX, int worldZ, out float temperature, out float humidity, out BiomeId biomeId)
        {
            float fx = worldX;
            float fz = worldZ;

            temperature = _temperature.Fbm(fx, fz, 3, 0.0016f, 2.0f, 0.5f);
            humidity = _humidity.Fbm(fx, fz, 3, 0.0021f, 2.0f, 0.5f);

            // Broad landmass shape, then medium hills, then sharp ridges where the
            // mountain mask is strong. Blending masks rather than summing everything
            // keeps flat areas genuinely flat instead of uniformly bumpy.
            float continent = _continent.Fbm(fx, fz, 4, 0.0009f, 2.0f, 0.5f);
            float hills = _hills.Fbm(fx, fz, 4, 0.0075f, 2.0f, 0.5f);
            float mountainMask = _mountains.Fbm(fx + 4000.0f, fz - 4000.0f, 2, 0.0006f, 2.0f, 0.5f);
            mountainMask = Saturate((mountainMask - 0.15f) * 2.4f);
            float ridges = _mountains.Ridged(fx, fz, 4, 0.0042f, 2.05f, 0.5f);

            float distance = Biomes.DistanceFromSpawn(fx, fz);
            DangerTier tier = Biomes.TierForDistance(distance);

            float heightAboveSea = continent * 16.0f + hills * 9.0f + ridges * 30.0f * mountainMask;
            biomeId = Biomes.Select(temperature, humidity, heightAboveSea, tier);
            BiomeInfo biome = Biomes.Get(biomeId);

            float h = Constants.SeaLevel + heightAboveSea * biome.HeightScale + biome.HeightBias;

            // Flatten a disc around spawn so the player never starts inside a cliff.
            if (distance < 48.0f)
            {
                float blend = Saturate((distance - 16.0f) / 32.0f);
                h = Lerp(Constants.SeaLevel + 3.0f, h, blend);
            }

            int height = (int)h;
            if (height < 4) height = 4;
            if (height > Constants.MaxBlockY - 12) height = Constants.MaxBlockY - 12;
            return height;
        }

        /// <summary>Fills a column with terrain, caves, ore and decoration.</summary>
        public void Generate(ChunkColumn column, GenScratch scratch)
        {
            int originX = column.OriginX;
            int originZ = column.OriginZ;

            // Pass 1: heights and biomes.
            for (int lz = 0; lz < Constants.ChunkSize; lz++)
            {
                for (int lx = 0; lx < Constants.ChunkSize; lx++)
                {
                    float t, hum;
                    BiomeId b;
                    int h = ComputeHeight(originX + lx, originZ + lz, out t, out hum, out b);
                    int i = (lz << Constants.ChunkShift) | lx;
                    scratch.Height[i] = h;
                    scratch.Biome[i] = (byte)b;
                }
            }

            float columnDistance = Biomes.DistanceFromSpawn(originX + 8.0f, originZ + 8.0f);
            DangerTier tier = Biomes.TierForDistance(columnDistance);

            // Pass 2: stone, soil, water, bedrock.
            FastRandom rng = new FastRandom(FastRandom.Hash(column.Cx, column.Cz, _seed));

            for (int lz = 0; lz < Constants.ChunkSize; lz++)
            {
                for (int lx = 0; lx < Constants.ChunkSize; lx++)
                {
                    int i = (lz << Constants.ChunkShift) | lx;
                    int height = scratch.Height[i];
                    BiomeInfo biome = Biomes.Get((BiomeId)scratch.Biome[i]);
                    bool underwater = height < Constants.SeaLevel;

                    for (int y = 0; y <= height; y++)
                    {
                        byte block;
                        if (y == 0)
                        {
                            block = Block.Bedrock;
                        }
                        else if (y <= 2 && rng.Chance(0.6f))
                        {
                            block = Block.Bedrock;
                        }
                        else if (y == height)
                        {
                            // Beaches and lake beds get sand instead of the biome surface.
                            if (underwater) block = Block.Sand;
                            else if (height <= Constants.SeaLevel + 1 && biome.SurfaceBlock == Block.Grass) block = Block.Sand;
                            else block = biome.SurfaceBlock;
                        }
                        else if (y > height - 4)
                        {
                            block = underwater ? Block.Sand : biome.SubSurfaceBlock;
                        }
                        else
                        {
                            block = biome.FillerBlock;
                        }
                        column.SetBlock(lx, y, lz, block);
                    }

                    // Sea and frozen sea.
                    if (underwater)
                    {
                        bool freeze = biome.Id == BiomeId.Snow;
                        for (int y = height + 1; y <= Constants.SeaLevel; y++)
                        {
                            bool surface = y == Constants.SeaLevel;
                            column.SetBlock(lx, y, lz, freeze && surface ? Block.Ice : Block.Water);
                        }
                    }
                }
            }

            CarveCaves(column, scratch);
            PlaceOre(column, scratch, tier);
            FloodDeepLava(column);
            Decorate(column, scratch, ref rng, tier);

            column.ApplyEdits();
            column.RecomputeHeights();

            BiomeInfo centreBiome = Biomes.Get((BiomeId)scratch.Biome[(8 << Constants.ChunkShift) | 8]);
            column.FoliageTint = centreBiome.FoliageTint.ToVector3();
        }

        /// <summary>
        /// Two low-frequency 3D fields intersected near zero, which gives long connected
        /// tunnels rather than the swiss-cheese blobs a single threshold produces.
        /// Carving stops short of the surface so the ground stays watertight.
        /// </summary>
        private void CarveCaves(ChunkColumn column, GenScratch scratch)
        {
            int originX = column.OriginX;
            int originZ = column.OriginZ;

            for (int lz = 0; lz < Constants.ChunkSize; lz++)
            {
                for (int lx = 0; lx < Constants.ChunkSize; lx++)
                {
                    int i = (lz << Constants.ChunkShift) | lx;
                    int ceiling = scratch.Height[i] - 3;
                    if (ceiling > Constants.SeaLevel - 2) ceiling = Constants.SeaLevel - 2;

                    float wx = (originX + lx) * 0.024f;
                    float wz = (originZ + lz) * 0.024f;

                    for (int y = 2; y < ceiling; y++)
                    {
                        float wy = y * 0.048f;
                        float a = _caveA.Noise(wx, wy, wz);
                        if (a > 0.09f || a < -0.09f) continue;
                        float b = _caveB.Noise(wx + 31.7f, wy, wz - 17.3f);
                        if (b > 0.09f || b < -0.09f) continue;

                        byte here = column.GetBlock(lx, y, lz);
                        if (here == Block.Bedrock) continue;
                        column.SetBlock(lx, y, lz, Block.Air);
                    }
                }
            }
        }

        private void PlaceOre(ChunkColumn column, GenScratch scratch, DangerTier tier)
        {
            int originX = column.OriginX;
            int originZ = column.OriginZ;

            for (int lz = 0; lz < Constants.ChunkSize; lz++)
            {
                for (int lx = 0; lx < Constants.ChunkSize; lx++)
                {
                    int i = (lz << Constants.ChunkShift) | lx;
                    int top = scratch.Height[i];
                    if (top > Constants.MaxBlockY) top = Constants.MaxBlockY;

                    float wx = originX + lx;
                    float wz = originZ + lz;

                    for (int y = 1; y <= top; y++)
                    {
                        if (column.GetBlock(lx, y, lz) != Block.Stone) continue;

                        byte ore = Block.Air;

                        if (y < 20 && tier >= DangerTier.Hell &&
                            Blob(wx, y, wz, 611.0f, 0.085f, 0.74f)) ore = Block.DragonStoneOre;
                        else if (y < 18 && tier >= DangerTier.Dangerous &&
                            Blob(wx, y, wz, 401.0f, 0.09f, 0.70f)) ore = Block.DiamondOre;
                        else if (y < 30 && Blob(wx, y, wz, 233.0f, 0.10f, 0.68f)) ore = Block.GoldOre;
                        else if (y < 50 && Blob(wx, y, wz, 127.0f, 0.11f, 0.62f)) ore = Block.IronOre;
                        else if (y < 62 && Blob(wx, y, wz, 59.0f, 0.12f, 0.58f)) ore = Block.CoalOre;

                        if (ore != Block.Air) column.SetBlock(lx, y, lz, ore);
                    }
                }
            }
        }

        private bool Blob(float x, float y, float z, float offset, float frequency, float threshold)
        {
            float n = _ore.Noise((x + offset) * frequency, y * frequency, (z - offset) * frequency);
            return n > threshold;
        }

        /// <summary>Fills cave voids near the bottom of the world with lava.</summary>
        private void FloodDeepLava(ChunkColumn column)
        {
            for (int lz = 0; lz < Constants.ChunkSize; lz++)
            {
                for (int lx = 0; lx < Constants.ChunkSize; lx++)
                {
                    for (int y = 1; y <= 5; y++)
                    {
                        if (column.GetBlock(lx, y, lz) == Block.Air)
                            column.SetBlock(lx, y, lz, Block.Lava);
                    }
                }
            }
        }

        private void Decorate(ChunkColumn column, GenScratch scratch, ref FastRandom rng, DangerTier tier)
        {
            // Trunks are kept away from the column edge so a canopy never needs to write
            // into a neighbour that may not be generated yet. It costs a little placement
            // variety and buys a generator with no cross-column ordering dependency.
            int centreIndex = (8 << Constants.ChunkShift) | 8;
            BiomeInfo centre = Biomes.Get((BiomeId)scratch.Biome[centreIndex]);

            for (int attempt = 0; attempt < centre.TreeAttempts; attempt++)
            {
                if (!rng.Chance(centre.TreeChance)) continue;

                int lx = rng.Next(2, Constants.ChunkSize - 2);
                int lz = rng.Next(2, Constants.ChunkSize - 2);
                int i = (lz << Constants.ChunkShift) | lx;
                int ground = scratch.Height[i];

                if (ground <= Constants.SeaLevel) continue;
                byte surface = column.GetBlock(lx, ground, lz);
                if (surface != Block.Grass && surface != Block.Snow) continue;
                if (ground + 8 >= Constants.MaxBlockY) continue;

                PlaceTree(column, lx, ground + 1, lz, rng.Next(4, 7));
            }

            // Surface lava pools make the scorched lands read as hostile from a distance.
            if (tier >= DangerTier.Hell && rng.Chance(0.35f))
            {
                int lx = rng.Next(3, Constants.ChunkSize - 3);
                int lz = rng.Next(3, Constants.ChunkSize - 3);
                int i = (lz << Constants.ChunkShift) | lx;
                int ground = scratch.Height[i];
                int radius = rng.Next(1, 3);

                for (int dz = -radius; dz <= radius; dz++)
                {
                    for (int dx = -radius; dx <= radius; dx++)
                    {
                        if (dx * dx + dz * dz > radius * radius) continue;
                        int px = lx + dx;
                        int pz = lz + dz;
                        if (px < 0 || px > 15 || pz < 0 || pz > 15) continue;
                        column.SetBlock(px, ground, pz, Block.Lava);
                    }
                }
            }
        }

        private static void PlaceTree(ChunkColumn column, int lx, int baseY, int lz, int trunkHeight)
        {
            int topY = baseY + trunkHeight;

            for (int y = baseY; y < topY; y++)
                column.SetBlock(lx, y, lz, Block.Log);

            for (int dy = -2; dy <= 1; dy++)
            {
                int y = topY + dy;
                if (y < 0 || y > Constants.MaxBlockY) continue;
                int radius = (dy >= 0) ? 1 : 2;

                for (int dz = -radius; dz <= radius; dz++)
                {
                    for (int dx = -radius; dx <= radius; dx++)
                    {
                        // Clip the corners so the canopy is round rather than a cube.
                        if (radius == 2 && dx * dx + dz * dz > 5) continue;
                        if (dx == 0 && dz == 0 && dy < 1) continue;

                        int px = lx + dx;
                        int pz = lz + dz;
                        if (px < 0 || px > 15 || pz < 0 || pz > 15) continue;
                        if (column.GetBlock(px, y, pz) == Block.Air)
                            column.SetBlock(px, y, pz, Block.Leaves);
                    }
                }
            }
        }

        private static float Saturate(float v)
        {
            if (v < 0.0f) return 0.0f;
            if (v > 1.0f) return 1.0f;
            return v;
        }

        private static float Lerp(float a, float b, float t)
        {
            return a + (b - a) * t;
        }
    }
}
