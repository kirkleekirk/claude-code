namespace CastleMinerZ.World
{
    /// <summary>
    /// Block ids. Stored as raw bytes in chunk arrays, so these are consts rather than
    /// an enum -- it keeps the voxel arrays as <c>byte[]</c> with no casting in the
    /// inner loops of the mesher.
    /// </summary>
    public static class Block
    {
        public const byte Air = 0;
        public const byte Stone = 1;
        public const byte Grass = 2;
        public const byte Dirt = 3;
        public const byte Cobblestone = 4;
        public const byte Sand = 5;
        public const byte Sandstone = 6;
        public const byte Gravel = 7;
        public const byte Snow = 8;
        public const byte Ice = 9;
        public const byte Log = 10;
        public const byte Planks = 11;
        public const byte Leaves = 12;
        public const byte Water = 13;
        public const byte Lava = 14;
        public const byte Bedrock = 15;
        public const byte CoalOre = 16;
        public const byte IronOre = 17;
        public const byte GoldOre = 18;
        public const byte DiamondOre = 19;
        public const byte DragonStoneOre = 20;
        public const byte Torch = 21;
        public const byte Glass = 22;
        public const byte StoneBrick = 23;
        public const byte Obsidian = 24;
        public const byte HellStone = 25;
        public const byte Explosive = 26;

        public const int Count = 27;
    }

    /// <summary>Which pass a block's geometry belongs to.</summary>
    public enum RenderLayer
    {
        /// <summary>Fully opaque, alpha ignored, written to depth.</summary>
        Opaque = 0,
        /// <summary>Alpha-tested (leaves, torches). Same pass as opaque, clip in the shader.</summary>
        Cutout = 1,
        /// <summary>Alpha blended and depth-sorted (water, glass, ice).</summary>
        Transparent = 2
    }

    /// <summary>Tool family required to get a drop out of a block.</summary>
    public enum ToolClass
    {
        None = 0,
        Pickaxe = 1,
        Axe = 2,
        Shovel = 3
    }

    /// <summary>
    /// Static description of one block type. One instance per id, created once at
    /// startup and never mutated -- nothing here allocates during play.
    /// </summary>
    public sealed class BlockDefinition
    {
        public byte Id;
        public string Name;

        /// <summary>Atlas tile index for each of the 6 faces, indexed by <see cref="Face"/>.</summary>
        public byte[] FaceTiles;

        /// <summary>Blocks player movement.</summary>
        public bool IsSolid;

        /// <summary>Stops light completely. Water and glass are solid-ish but not opaque.</summary>
        public bool IsOpaque;

        /// <summary>Light this block emits, 0..15.</summary>
        public byte LightEmission;

        /// <summary>How much light passes through, subtracted per block travelled (1 for air).</summary>
        public byte LightAttenuation;

        public RenderLayer Layer;
        public bool IsLiquid;

        /// <summary>Seconds of mining with a bare hand. Negative means unbreakable.</summary>
        public float Hardness;

        public ToolClass Tool;

        /// <summary>Minimum tool tier that yields a drop (see ItemRegistry tiers).</summary>
        public int RequiredTier;

        /// <summary>Block id this drops as an item; usually itself.</summary>
        public byte DropsAs;

        /// <summary>Tint applied to the texture, used for grass and leaves per-biome.</summary>
        public bool Tintable;

        public BlockDefinition(byte id, string name)
        {
            Id = id;
            Name = name;
            FaceTiles = new byte[6];
            IsSolid = true;
            IsOpaque = true;
            Layer = RenderLayer.Opaque;
            LightAttenuation = 15;
            Hardness = 1.0f;
            Tool = ToolClass.None;
            RequiredTier = 0;
            DropsAs = id;
        }

        /// <summary>True when a neighbouring face should be drawn against this block.</summary>
        public bool IsSeeThrough
        {
            get { return !IsOpaque; }
        }
    }

    /// <summary>Face indices. The order matches the normal/offset tables in the mesher.</summary>
    public static class Face
    {
        public const int NegX = 0;
        public const int PosX = 1;
        public const int NegY = 2;
        public const int PosY = 3;
        public const int NegZ = 4;
        public const int PosZ = 5;
        public const int Count = 6;
    }
}
