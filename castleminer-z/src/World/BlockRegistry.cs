using CastleMinerZ.Assets;

namespace CastleMinerZ.World
{
    /// <summary>
    /// The one table of block definitions, built once at startup.
    ///
    /// Lookup is a raw array index by block id -- <see cref="Get"/> is on the hot path
    /// of the mesher and the lighting flood fill, so it must not do anything cleverer
    /// than that.
    /// </summary>
    public static class BlockRegistry
    {
        private static readonly BlockDefinition[] Defs = new BlockDefinition[256];
        private static bool _initialised;

        /// <summary>Atlas is 16x16 tiles of 16x16 texels, as laid out by the generator.</summary>
        public const int AtlasTilesPerRow = TextureFactory.TilesPerRow;
        public const float AtlasTileSize = 1.0f / AtlasTilesPerRow;

        // Atlas tile indices. The generator that draws the atlas is the single definition;
        // these aliases exist only so the table below reads well.
        private const byte TStone = (byte)TextureFactory.TStone;
        private const byte TDirt = (byte)TextureFactory.TDirt;
        private const byte TGrassTop = (byte)TextureFactory.TGrassTop;
        private const byte TGrassSide = (byte)TextureFactory.TGrassSide;
        private const byte TCobble = (byte)TextureFactory.TCobble;
        private const byte TSand = (byte)TextureFactory.TSand;
        private const byte TSandstoneTop = (byte)TextureFactory.TSandstoneTop;
        private const byte TSandstoneSide = (byte)TextureFactory.TSandstoneSide;
        private const byte TGravel = (byte)TextureFactory.TGravel;
        private const byte TSnow = (byte)TextureFactory.TSnow;
        private const byte TIce = (byte)TextureFactory.TIce;
        private const byte TLogTop = (byte)TextureFactory.TLogTop;
        private const byte TLogSide = (byte)TextureFactory.TLogSide;
        private const byte TPlanks = (byte)TextureFactory.TPlanks;
        private const byte TLeaves = (byte)TextureFactory.TLeaves;
        private const byte TWater = (byte)TextureFactory.TWater;
        private const byte TLava = (byte)TextureFactory.TLava;
        private const byte TBedrock = (byte)TextureFactory.TBedrock;
        private const byte TCoalOre = (byte)TextureFactory.TCoalOre;
        private const byte TIronOre = (byte)TextureFactory.TIronOre;
        private const byte TGoldOre = (byte)TextureFactory.TGoldOre;
        private const byte TDiamondOre = (byte)TextureFactory.TDiamondOre;
        private const byte TDragonOre = (byte)TextureFactory.TDragonOre;
        private const byte TTorch = (byte)TextureFactory.TTorch;
        private const byte TGlass = (byte)TextureFactory.TGlass;
        private const byte TStoneBrick = (byte)TextureFactory.TStoneBrick;
        private const byte TObsidian = (byte)TextureFactory.TObsidian;
        private const byte THellStone = (byte)TextureFactory.THellStone;
        private const byte TExplosiveTop = (byte)TextureFactory.TExplosiveTop;
        private const byte TExplosiveSide = (byte)TextureFactory.TExplosiveSide;

        public static void Initialise()
        {
            if (_initialised) return;
            _initialised = true;

            BlockDefinition air = Define(Block.Air, "Air", 0);
            air.IsSolid = false;
            air.IsOpaque = false;
            air.Layer = RenderLayer.Transparent;
            air.LightAttenuation = 1;
            air.Hardness = 0.0f;

            BlockDefinition stone = Define(Block.Stone, "Stone", TStone);
            stone.Hardness = 3.0f;
            stone.Tool = ToolClass.Pickaxe;
            stone.RequiredTier = 1;
            stone.DropsAs = Block.Cobblestone;

            BlockDefinition grass = Define(Block.Grass, "Grass", TGrassSide);
            grass.FaceTiles[Face.PosY] = TGrassTop;
            grass.FaceTiles[Face.NegY] = TDirt;
            grass.Hardness = 0.9f;
            grass.Tool = ToolClass.Shovel;
            grass.DropsAs = Block.Dirt;
            // Not tinted: the side texture is part dirt, and multiplying the whole tile by a
            // foliage colour would turn the soil green. Leaves, which are a single material,
            // are tinted instead.

            BlockDefinition dirt = Define(Block.Dirt, "Dirt", TDirt);
            dirt.Hardness = 0.8f;
            dirt.Tool = ToolClass.Shovel;

            BlockDefinition cobble = Define(Block.Cobblestone, "Cobblestone", TCobble);
            cobble.Hardness = 3.2f;
            cobble.Tool = ToolClass.Pickaxe;
            cobble.RequiredTier = 1;

            BlockDefinition sand = Define(Block.Sand, "Sand", TSand);
            sand.Hardness = 0.7f;
            sand.Tool = ToolClass.Shovel;

            BlockDefinition sandstone = Define(Block.Sandstone, "Sandstone", TSandstoneSide);
            sandstone.FaceTiles[Face.PosY] = TSandstoneTop;
            sandstone.FaceTiles[Face.NegY] = TSandstoneTop;
            sandstone.Hardness = 2.4f;
            sandstone.Tool = ToolClass.Pickaxe;
            sandstone.RequiredTier = 1;

            BlockDefinition gravel = Define(Block.Gravel, "Gravel", TGravel);
            gravel.Hardness = 0.9f;
            gravel.Tool = ToolClass.Shovel;

            BlockDefinition snow = Define(Block.Snow, "Snow", TSnow);
            snow.Hardness = 0.5f;
            snow.Tool = ToolClass.Shovel;

            BlockDefinition ice = Define(Block.Ice, "Ice", TIce);
            ice.Hardness = 0.8f;
            ice.IsOpaque = false;
            ice.Layer = RenderLayer.Transparent;
            ice.LightAttenuation = 3;
            ice.Tool = ToolClass.Pickaxe;

            BlockDefinition log = Define(Block.Log, "Wood Log", TLogSide);
            log.FaceTiles[Face.PosY] = TLogTop;
            log.FaceTiles[Face.NegY] = TLogTop;
            log.Hardness = 2.0f;
            log.Tool = ToolClass.Axe;

            BlockDefinition planks = Define(Block.Planks, "Planks", TPlanks);
            planks.Hardness = 1.8f;
            planks.Tool = ToolClass.Axe;

            BlockDefinition leaves = Define(Block.Leaves, "Leaves", TLeaves);
            leaves.Hardness = 0.3f;
            leaves.IsOpaque = false;
            leaves.Layer = RenderLayer.Cutout;
            leaves.LightAttenuation = 2;
            leaves.Tintable = true;
            leaves.DropsAs = Block.Air;

            BlockDefinition water = Define(Block.Water, "Water", TWater);
            water.IsSolid = false;
            water.IsOpaque = false;
            water.IsLiquid = true;
            water.Layer = RenderLayer.Transparent;
            water.LightAttenuation = 2;
            water.Hardness = -1.0f;
            water.DropsAs = Block.Air;

            BlockDefinition lava = Define(Block.Lava, "Lava", TLava);
            lava.IsSolid = false;
            lava.IsOpaque = false;
            lava.IsLiquid = true;
            lava.Layer = RenderLayer.Transparent;
            lava.LightEmission = 15;
            lava.LightAttenuation = 2;
            lava.Hardness = -1.0f;
            lava.DropsAs = Block.Air;

            BlockDefinition bedrock = Define(Block.Bedrock, "Bedrock", TBedrock);
            bedrock.Hardness = -1.0f;

            BlockDefinition coal = Define(Block.CoalOre, "Coal Ore", TCoalOre);
            coal.Hardness = 4.0f;
            coal.Tool = ToolClass.Pickaxe;
            coal.RequiredTier = 1;

            BlockDefinition iron = Define(Block.IronOre, "Iron Ore", TIronOre);
            iron.Hardness = 5.0f;
            iron.Tool = ToolClass.Pickaxe;
            iron.RequiredTier = 2;

            BlockDefinition gold = Define(Block.GoldOre, "Gold Ore", TGoldOre);
            gold.Hardness = 5.5f;
            gold.Tool = ToolClass.Pickaxe;
            gold.RequiredTier = 3;

            BlockDefinition diamond = Define(Block.DiamondOre, "Diamond Ore", TDiamondOre);
            diamond.Hardness = 7.0f;
            diamond.Tool = ToolClass.Pickaxe;
            diamond.RequiredTier = 3;

            BlockDefinition dragon = Define(Block.DragonStoneOre, "Dragon Stone Ore", TDragonOre);
            dragon.Hardness = 12.0f;
            dragon.Tool = ToolClass.Pickaxe;
            dragon.RequiredTier = 4;
            dragon.LightEmission = 4;

            BlockDefinition torch = Define(Block.Torch, "Torch", TTorch);
            torch.IsSolid = false;
            torch.IsOpaque = false;
            torch.Layer = RenderLayer.Cutout;
            torch.LightEmission = 14;
            torch.LightAttenuation = 1;
            torch.Hardness = 0.1f;

            BlockDefinition glass = Define(Block.Glass, "Glass", TGlass);
            glass.IsOpaque = false;
            glass.Layer = RenderLayer.Transparent;
            glass.LightAttenuation = 1;
            glass.Hardness = 0.6f;
            glass.DropsAs = Block.Air;

            BlockDefinition brick = Define(Block.StoneBrick, "Stone Brick", TStoneBrick);
            brick.Hardness = 3.5f;
            brick.Tool = ToolClass.Pickaxe;
            brick.RequiredTier = 1;

            BlockDefinition obsidian = Define(Block.Obsidian, "Obsidian", TObsidian);
            obsidian.Hardness = 25.0f;
            obsidian.Tool = ToolClass.Pickaxe;
            obsidian.RequiredTier = 4;

            BlockDefinition hell = Define(Block.HellStone, "Hell Stone", THellStone);
            hell.Hardness = 2.6f;
            hell.Tool = ToolClass.Pickaxe;
            hell.RequiredTier = 1;
            hell.LightEmission = 3;

            BlockDefinition tnt = Define(Block.Explosive, "Explosive", TExplosiveSide);
            tnt.FaceTiles[Face.PosY] = TExplosiveTop;
            tnt.FaceTiles[Face.NegY] = TExplosiveTop;
            tnt.Hardness = 0.4f;

            // Anything left undefined resolves to air rather than crashing on a bad save.
            for (int i = 0; i < Defs.Length; i++)
            {
                if (Defs[i] == null) Defs[i] = Defs[Block.Air];
            }
        }

        private static BlockDefinition Define(byte id, string name, byte tile)
        {
            BlockDefinition d = new BlockDefinition(id, name);
            for (int i = 0; i < Face.Count; i++) d.FaceTiles[i] = tile;
            Defs[id] = d;
            return d;
        }

        public static BlockDefinition Get(byte id)
        {
            return Defs[id];
        }

        public static bool IsSolid(byte id)
        {
            return Defs[id].IsSolid;
        }

        public static bool IsOpaque(byte id)
        {
            return Defs[id].IsOpaque;
        }

        public static bool IsLiquid(byte id)
        {
            return Defs[id].IsLiquid;
        }

        public static string NameOf(byte id)
        {
            return Defs[id].Name;
        }
    }
}
