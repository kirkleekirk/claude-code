using Microsoft.Xna.Framework;

namespace CastleMinerZ.World
{
    public enum BiomeId
    {
        Plains = 0,
        Forest = 1,
        Desert = 2,
        Snow = 3,
        Mountains = 4,
        Volcanic = 5
    }

    /// <summary>
    /// How hostile the world is at a given point.
    ///
    /// This is the spine of the whole game: in CastleMiner Z the map is flat and endless,
    /// and the only progression is how far you are willing to walk from spawn. Everything
    /// that scales -- enemy types, enemy health, spawn rates, which ores exist -- reads
    /// its tier from here rather than from a stored difficulty setting.
    /// </summary>
    public enum DangerTier
    {
        Safe = 0,
        Dangerous = 1,
        Nightmare = 2,
        Hell = 3,
        DragonLands = 4
    }

    /// <summary>Static per-biome parameters.</summary>
    public sealed class BiomeInfo
    {
        public BiomeId Id;
        public string Name;
        public byte SurfaceBlock;
        public byte SubSurfaceBlock;
        public byte FillerBlock;

        /// <summary>Trees attempted per column.</summary>
        public int TreeAttempts;
        public float TreeChance;

        /// <summary>Multiplies the terrain height variation.</summary>
        public float HeightScale;

        /// <summary>Added to the base terrain height.</summary>
        public float HeightBias;

        /// <summary>Vertex tint for grass and leaves.</summary>
        public Color FoliageTint;

        public BiomeInfo(BiomeId id, string name)
        {
            Id = id;
            Name = name;
            SurfaceBlock = Block.Grass;
            SubSurfaceBlock = Block.Dirt;
            FillerBlock = Block.Stone;
            HeightScale = 1.0f;
            FoliageTint = Color.White;
        }
    }

    public static class Biomes
    {
        private static readonly BiomeInfo[] All = new BiomeInfo[6];
        private static bool _init;

        public static void Initialise()
        {
            if (_init) return;
            _init = true;

            BiomeInfo plains = new BiomeInfo(BiomeId.Plains, "Plains");
            plains.TreeAttempts = 2;
            plains.TreeChance = 0.25f;
            plains.HeightScale = 0.55f;
            plains.FoliageTint = new Color(150, 200, 92);
            All[0] = plains;

            BiomeInfo forest = new BiomeInfo(BiomeId.Forest, "Forest");
            forest.TreeAttempts = 10;
            forest.TreeChance = 0.62f;
            forest.HeightScale = 0.85f;
            forest.FoliageTint = new Color(106, 170, 74);
            All[1] = forest;

            BiomeInfo desert = new BiomeInfo(BiomeId.Desert, "Desert");
            desert.SurfaceBlock = Block.Sand;
            desert.SubSurfaceBlock = Block.Sand;
            desert.FillerBlock = Block.Sandstone;
            desert.TreeAttempts = 0;
            desert.HeightScale = 0.7f;
            desert.HeightBias = -1.0f;
            desert.FoliageTint = new Color(190, 180, 100);
            All[2] = desert;

            BiomeInfo snow = new BiomeInfo(BiomeId.Snow, "Frozen Wastes");
            snow.SurfaceBlock = Block.Snow;
            snow.SubSurfaceBlock = Block.Dirt;
            snow.TreeAttempts = 4;
            snow.TreeChance = 0.3f;
            snow.HeightScale = 0.9f;
            snow.FoliageTint = new Color(128, 168, 148);
            All[3] = snow;

            BiomeInfo mountains = new BiomeInfo(BiomeId.Mountains, "Mountains");
            mountains.SurfaceBlock = Block.Grass;
            mountains.SubSurfaceBlock = Block.Dirt;
            mountains.TreeAttempts = 3;
            mountains.TreeChance = 0.28f;
            mountains.HeightScale = 2.6f;
            mountains.HeightBias = 10.0f;
            mountains.FoliageTint = new Color(120, 160, 90);
            All[4] = mountains;

            BiomeInfo volcanic = new BiomeInfo(BiomeId.Volcanic, "Scorched Lands");
            volcanic.SurfaceBlock = Block.HellStone;
            volcanic.SubSurfaceBlock = Block.HellStone;
            volcanic.FillerBlock = Block.Stone;
            volcanic.TreeAttempts = 0;
            volcanic.HeightScale = 1.5f;
            volcanic.HeightBias = 2.0f;
            volcanic.FoliageTint = new Color(150, 80, 60);
            All[5] = volcanic;
        }

        public static BiomeInfo Get(BiomeId id)
        {
            return All[(int)id];
        }

        /// <summary>Straight-line distance from world origin, which is always the spawn point.</summary>
        public static float DistanceFromSpawn(float x, float z)
        {
            return (float)System.Math.Sqrt(x * x + z * z);
        }

        public static DangerTier TierForDistance(float distance)
        {
            if (distance >= Constants.DragonZoneDistance) return DangerTier.DragonLands;
            if (distance >= Constants.HellZoneDistance) return DangerTier.Hell;
            if (distance >= Constants.NightmareZoneDistance) return DangerTier.Nightmare;
            if (distance >= Constants.DangerZoneDistance) return DangerTier.Dangerous;
            return DangerTier.Safe;
        }

        public static string TierName(DangerTier tier)
        {
            switch (tier)
            {
                case DangerTier.Dangerous: return "DANGEROUS";
                case DangerTier.Nightmare: return "NIGHTMARE";
                case DangerTier.Hell: return "HELL";
                case DangerTier.DragonLands: return "DRAGON LANDS";
                default: return "SAFE";
            }
        }

        /// <summary>Colour used for the danger readout on the HUD.</summary>
        public static Color TierColour(DangerTier tier)
        {
            switch (tier)
            {
                case DangerTier.Dangerous: return new Color(230, 200, 60);
                case DangerTier.Nightmare: return new Color(235, 130, 40);
                case DangerTier.Hell: return new Color(220, 60, 45);
                case DangerTier.DragonLands: return new Color(190, 70, 220);
                default: return new Color(120, 220, 120);
            }
        }

        /// <summary>
        /// Picks a biome from climate noise, with one override: deep in the hell zone the
        /// surface turns volcanic regardless of climate, so the transition is legible to
        /// the player as "you have gone too far".
        /// </summary>
        public static BiomeId Select(float temperature, float humidity, float heightAboveSea, DangerTier tier)
        {
            if (tier >= DangerTier.Hell) return BiomeId.Volcanic;
            if (heightAboveSea > 26.0f) return BiomeId.Mountains;
            if (temperature < -0.35f) return BiomeId.Snow;
            if (temperature > 0.35f && humidity < 0.0f) return BiomeId.Desert;
            if (humidity > 0.05f) return BiomeId.Forest;
            return BiomeId.Plains;
        }
    }
}
