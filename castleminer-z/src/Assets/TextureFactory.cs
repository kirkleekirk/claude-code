using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;

namespace CastleMinerZ.Assets
{
    /// <summary>
    /// Builds the block atlas, the item icon atlas and the particle sprite in code.
    ///
    /// Generating the art at startup rather than shipping PNGs through the content
    /// pipeline means the game has no texture assets to build, no atlas/registry index to
    /// keep in step by hand, and no content project at all on platforms that can render
    /// without a custom shader. A 256x256 atlas is a few hundred thousand operations --
    /// far below the cost of a single frame of terrain meshing.
    ///
    /// Colours are premultiplied on the way out, matching what the XNA texture processor
    /// would have produced, so everything can be drawn with BlendState.AlphaBlend. The
    /// particle sprite is the one exception and is documented where it is built.
    /// </summary>
    public static class TextureFactory
    {
        public const int TileSize = 16;
        public const int TilesPerRow = 16;
        public const int AtlasSize = TileSize * TilesPerRow;

        // Block atlas tile indices. These are the definition -- BlockRegistry's constants
        // mirror them, and a test checks the two agree.
        public const int TStone = 0;
        public const int TDirt = 1;
        public const int TGrassTop = 2;
        public const int TGrassSide = 3;
        public const int TCobble = 4;
        public const int TSand = 5;
        public const int TSandstoneTop = 6;
        public const int TSandstoneSide = 7;
        public const int TGravel = 8;
        public const int TSnow = 9;
        public const int TIce = 10;
        public const int TLogTop = 11;
        public const int TLogSide = 12;
        public const int TPlanks = 13;
        public const int TLeaves = 14;
        public const int TWater = 15;
        public const int TLava = 16;
        public const int TBedrock = 17;
        public const int TCoalOre = 18;
        public const int TIronOre = 19;
        public const int TGoldOre = 20;
        public const int TDiamondOre = 21;
        public const int TDragonOre = 22;
        public const int TTorch = 23;
        public const int TGlass = 24;
        public const int TStoneBrick = 25;
        public const int TObsidian = 26;
        public const int THellStone = 27;
        public const int TExplosiveTop = 28;
        public const int TExplosiveSide = 29;

        /// <summary>Highest block tile drawn. Used by the test that checks registry indices.</summary>
        public const int LastBlockTile = TExplosiveSide;

        /// <summary>True when the block atlas actually has art at this tile index.</summary>
        public static bool IsBlockTileDrawn(int tile)
        {
            return tile >= 0 && tile <= LastBlockTile;
        }

        /// <summary>
        /// True when the icon atlas has art at this tile index. Tiles 14 and 15 are a
        /// deliberate gap: materials and ammunition end at 13, and tools start on the next
        /// row at 16 so each tier group lines up in the atlas.
        /// </summary>
        public static bool IsItemTileDrawn(int tile)
        {
            if (tile >= 0 && tile <= 13) return true;
            return tile >= 16 && tile <= LastItemTile;
        }

        // ---- Block atlas ------------------------------------------------------

        public static Texture2D CreateBlockAtlas(GraphicsDevice device)
        {
            Painter p = new Painter(AtlasSize, AtlasSize);
            Rng rng = new Rng(1337);

            p.NoiseTile(TStone, 128, 128, 132, 12, ref rng);
            p.NoiseTile(TDirt, 134, 96, 67, 14, ref rng);
            p.NoiseTile(TGrassTop, 99, 152, 70, 16, ref rng);

            // Grass side: dirt with a ragged green lip along the top.
            p.NoiseTile(TGrassSide, 134, 96, 67, 14, ref rng);
            for (int y = 0; y < 4; y++)
            {
                for (int x = 0; x < TileSize; x++)
                {
                    if (y == 3 && rng.NextFloat() < 0.45f) continue;
                    float n = rng.Between(-16.0f, 16.0f);
                    p.SetTile(TGrassSide, x, y, 99 + n, 152 + n, 70 + n, 255);
                }
            }

            p.NoiseTile(TCobble, 110, 110, 114, 10, ref rng);
            p.Blobs(TCobble, 140, 140, 146, 7, 3.2f, 18.0f, ref rng);
            p.Blobs(TCobble, 86, 86, 90, 5, 2.4f, 18.0f, ref rng);

            p.NoiseTile(TSand, 219, 207, 160, 10, ref rng);
            p.NoiseTile(TSandstoneTop, 214, 200, 152, 8, ref rng);

            p.NoiseTile(TSandstoneSide, 214, 200, 152, 6, ref rng);
            for (int band = 0; band < 4; band++)
            {
                int y = band < 2 ? 3 + band : 8 + band;
                for (int x = 0; x < TileSize; x++) p.SetTile(TSandstoneSide, x, y, 190, 176, 130, 255);
            }

            p.NoiseTile(TGravel, 126, 122, 120, 16, ref rng);
            p.Blobs(TGravel, 98, 94, 92, 8, 2.0f, 18.0f, ref rng);

            p.NoiseTile(TSnow, 238, 242, 246, 8, ref rng);
            p.NoiseTile(TIce, 150, 196, 232, 10, ref rng, 190);

            // Log end grain: concentric rings.
            p.NoiseTile(TLogTop, 160, 126, 80, 8, ref rng);
            for (int y = 0; y < TileSize; y++)
            {
                for (int x = 0; x < TileSize; x++)
                {
                    float dx = x - 7.5f;
                    float dy = y - 7.5f;
                    int ring = (int)System.Math.Sqrt(dx * dx + dy * dy);
                    if ((ring & 1) == 0) p.SetTile(TLogTop, x, y, 128, 98, 60, 255);
                }
            }

            p.NoiseTile(TLogSide, 108, 82, 50, 10, ref rng);
            for (int x = 0; x < TileSize; x += 3)
            {
                for (int y = 0; y < TileSize; y++)
                {
                    float n = rng.Between(-8.0f, 8.0f);
                    p.SetTile(TLogSide, x, y, 86 + n, 64 + n, 38 + n, 255);
                }
            }

            p.NoiseTile(TPlanks, 172, 136, 86, 10, ref rng);
            for (int band = 0; band < 4; band++)
            {
                int y = band * 5;
                if (y >= TileSize) y = TileSize - 1;
                for (int x = 0; x < TileSize; x++) p.SetTile(TPlanks, x, y, 132, 100, 60, 255);
            }

            // Leaves: greyscale with holes, tinted per biome in the renderer and alpha tested.
            for (int y = 0; y < TileSize; y++)
            {
                for (int x = 0; x < TileSize; x++)
                {
                    if (rng.NextFloat() < 0.16f)
                    {
                        p.SetTile(TLeaves, x, y, 0, 0, 0, 0);
                    }
                    else
                    {
                        float v = rng.Between(150.0f, 225.0f);
                        p.SetTile(TLeaves, x, y, v, v, v * 0.94f, 255);
                    }
                }
            }

            for (int y = 0; y < TileSize; y++)
            {
                for (int x = 0; x < TileSize; x++)
                {
                    float n = rng.Between(-12.0f, 12.0f);
                    p.SetTile(TWater, x, y, 58 + n, 108 + n, 190 + n, 165);
                }
            }

            p.NoiseTile(TLava, 208, 78, 20, 26, ref rng);
            p.Blobs(TLava, 250, 176, 48, 6, 3.0f, 24.0f, ref rng);

            p.NoiseTile(TBedrock, 62, 62, 66, 18, ref rng);
            p.Blobs(TBedrock, 34, 34, 38, 8, 2.6f, 18.0f, ref rng);

            OreTile(p, TCoalOre, 34, 34, 36, ref rng);
            OreTile(p, TIronOre, 196, 156, 118, ref rng);
            OreTile(p, TGoldOre, 232, 198, 76, ref rng);
            OreTile(p, TDiamondOre, 108, 224, 224, ref rng);
            OreTile(p, TDragonOre, 196, 92, 226, ref rng);

            // Torch: mostly empty, so it reads as a thin post once alpha tested.
            p.ClearTile(TTorch);
            for (int y = 6; y < TileSize; y++)
            {
                for (int x = 7; x < 10; x++)
                {
                    float n = rng.Between(-10.0f, 10.0f);
                    p.SetTile(TTorch, x, y, 122 + n, 88 + n, 52 + n, 255);
                }
            }
            for (int y = 2; y < 7; y++)
            {
                for (int x = 6; x < 11; x++)
                {
                    if ((x == 6 || x == 10) && y < 4) continue;
                    p.SetTile(TTorch, x, y, 252, rng.Between(170.0f, 220.0f), 60, 255);
                }
            }

            // Glass: near-invisible centre, defined edges, one highlight streak.
            for (int y = 0; y < TileSize; y++)
            {
                for (int x = 0; x < TileSize; x++)
                {
                    bool edge = x == 0 || y == 0 || x == TileSize - 1 || y == TileSize - 1;
                    if (edge) p.SetTile(TGlass, x, y, 210, 226, 236, 190);
                    else p.SetTile(TGlass, x, y, 200, 220, 232, 46);
                }
            }
            for (int i = 3; i < 9; i++) p.SetTile(TGlass, i, i - 1, 240, 248, 252, 150);

            p.NoiseTile(TStoneBrick, 138, 138, 142, 8, ref rng);
            for (int x = 0; x < TileSize; x++)
            {
                p.SetTile(TStoneBrick, x, 0, 96, 96, 100, 255);
                p.SetTile(TStoneBrick, x, 8, 96, 96, 100, 255);
            }
            for (int y = 1; y < 8; y++) p.SetTile(TStoneBrick, 8, y, 96, 96, 100, 255);
            for (int y = 9; y < TileSize; y++) p.SetTile(TStoneBrick, 0, y, 96, 96, 100, 255);

            p.NoiseTile(TObsidian, 32, 24, 48, 12, ref rng);
            p.Blobs(TObsidian, 58, 42, 84, 4, 2.0f, 18.0f, ref rng);

            p.NoiseTile(THellStone, 120, 44, 36, 18, ref rng);
            p.Blobs(THellStone, 166, 66, 44, 6, 2.6f, 18.0f, ref rng);

            p.NoiseTile(TExplosiveTop, 152, 60, 48, 8, ref rng);
            p.FillTileRect(TExplosiveTop, 6, 6, 4, 4, 40, 40, 44, 255);

            p.NoiseTile(TExplosiveSide, 152, 60, 48, 8, ref rng);
            p.FillTileRect(TExplosiveSide, 0, 5, TileSize, 6, 232, 226, 214, 255);
            for (int x = 0; x < TileSize; x++)
            {
                p.SetTile(TExplosiveSide, x, 5, 60, 60, 64, 255);
                p.SetTile(TExplosiveSide, x, 10, 60, 60, 64, 255);
            }

            return p.ToTexture(device, true);
        }

        private static void OreTile(Painter p, int tile, int r, int g, int b, ref Rng rng)
        {
            p.NoiseTile(tile, 128, 128, 132, 12, ref rng);
            p.Blobs(tile, r, g, b, 5, 2.4f, 14.0f, ref rng);
        }

        // ---- Item icon atlas --------------------------------------------------

        /// <summary>Highest item icon drawn. Used by the registry consistency test.</summary>
        public const int LastItemTile = 37;

        public static Texture2D CreateItemAtlas(GraphicsDevice device)
        {
            Painter p = new Painter(AtlasSize, AtlasSize);
            Rng rng = new Rng(0xBEEF);

            for (int tile = 0; tile <= LastItemTile; tile++) p.ClearTile(tile);

            // 0 stick
            for (int i = 0; i < 10; i++)
            {
                p.SetTile(0, 5 + i / 3, 13 - i, 132, 96, 56, 255);
                p.SetTile(0, 6 + i / 3, 13 - i, 110, 78, 46, 255);
            }

            Nugget(p, 1, 40, 40, 44, ref rng);        // coal
            Nugget(p, 2, 214, 214, 220, ref rng);     // iron ingot
            Nugget(p, 3, 236, 200, 76, ref rng);      // gold ingot
            Nugget(p, 4, 112, 226, 226, ref rng);     // diamond
            Nugget(p, 5, 198, 96, 228, ref rng);      // dragon stone
            Nugget(p, 6, 88, 84, 92, ref rng);        // gunpowder

            // 7 casing
            p.FillTileRect(7, 6, 4, 4, 8, 208, 168, 72, 255);
            p.FillTileRect(7, 6, 12, 4, 2, 170, 134, 56, 255);

            Ammo(p, 8, 208, 168, 72, 3, 7);           // pistol rounds
            Ammo(p, 9, 198, 62, 52, 4, 8);            // shotgun shells
            Ammo(p, 10, 176, 150, 68, 3, 9);          // rifle rounds
            Ammo(p, 11, 150, 170, 190, 3, 10);        // sniper rounds
            Ammo(p, 12, 120, 120, 128, 6, 12);        // rocket
            Ammo(p, 13, 120, 226, 226, 5, 9);         // laser cell

            // Tool tiers, in the same order as ItemRegistry: stone, iron, diamond, dragon.
            int[,] tiers =
            {
                { 128, 128, 132 },
                { 206, 206, 212 },
                { 108, 224, 224 },
                { 196, 92, 226 }
            };

            for (int t = 0; t < 4; t++) Pickaxe(p, 16 + t, tiers[t, 0], tiers[t, 1], tiers[t, 2]);
            for (int t = 0; t < 4; t++) Axe(p, 20 + t, tiers[t, 0], tiers[t, 1], tiers[t, 2]);
            for (int t = 0; t < 4; t++) Shovel(p, 24 + t, tiers[t, 0], tiers[t, 1], tiers[t, 2]);
            for (int t = 0; t < 4; t++) Sword(p, 28 + t, tiers[t, 0], tiers[t, 1], tiers[t, 2]);

            Gun(p, 32, 56, 56, 62, 3, false);         // pistol
            Gun(p, 33, 92, 62, 40, 5, true);          // shotgun
            Gun(p, 34, 48, 52, 48, 5, true);          // assault rifle
            Gun(p, 35, 40, 44, 52, 6, true);          // sniper
            Gun(p, 36, 72, 72, 76, 6, true);          // launcher
            Gun(p, 37, 132, 78, 168, 5, true);        // laser

            return p.ToTexture(device, true);
        }

        private static void Nugget(Painter p, int tile, int r, int g, int b, ref Rng rng)
        {
            for (int y = 4; y < 12; y++)
            {
                for (int x = 4; x < 12; x++)
                {
                    float dx = x - 7.5f;
                    float dy = y - 7.5f;
                    if (dx * dx + dy * dy > 15.0f) continue;
                    float n = rng.Between(-18.0f, 18.0f);
                    p.SetTile(tile, x, y, r + n, g + n, b + n, 255);
                }
            }
        }

        private static void Ammo(Painter p, int tile, int r, int g, int b, int width, int height)
        {
            int x0 = 8 - width / 2;
            int y0 = 14 - height;
            p.FillTileRect(tile, x0, y0, width, height, r, g, b, 255);
            p.FillTileRect(tile, x0, y0, width, 2,
                r + 40 > 255 ? 255 : r + 40,
                g + 40 > 255 ? 255 : g + 40,
                b + 40 > 255 ? 255 : b + 40, 255);
        }

        private static void Handle(Painter p, int tile)
        {
            for (int i = 0; i < 9; i++)
            {
                p.SetTile(tile, 4 + i / 2, 14 - i, 128, 92, 54, 255);
                p.SetTile(tile, 5 + i / 2, 14 - i, 108, 76, 44, 255);
            }
        }

        private static void Pickaxe(Painter p, int tile, int r, int g, int b)
        {
            Handle(p, tile);
            for (int x = 2; x < 14; x++)
            {
                int y = 4 + System.Math.Abs(x - 8) / 3;
                p.SetTile(tile, x, y, r, g, b, 255);
                p.SetTile(tile, x, y + 1, r - 24, g - 24, b - 24, 255);
            }
        }

        private static void Axe(Painter p, int tile, int r, int g, int b)
        {
            Handle(p, tile);
            for (int y = 2; y < 9; y++)
            {
                int width = 5 - System.Math.Abs(y - 5) / 2;
                for (int x = 8; x < 8 + width; x++) p.SetTile(tile, x, y, r, g, b, 255);
            }
        }

        private static void Shovel(Painter p, int tile, int r, int g, int b)
        {
            Handle(p, tile);
            p.FillTileRect(tile, 7, 2, 5, 5, r, g, b, 255);
        }

        private static void Sword(Painter p, int tile, int r, int g, int b)
        {
            for (int i = 0; i < 9; i++)
            {
                p.SetTile(tile, 4 + i, 11 - i, r, g, b, 255);
                p.SetTile(tile, 5 + i, 11 - i, r - 30, g - 30, b - 30, 255);
            }
            for (int x = 2; x < 7; x++) p.SetTile(tile, x, 12, 120, 88, 52, 255);
            p.SetTile(tile, 3, 13, 96, 70, 42, 255);
            p.SetTile(tile, 4, 14, 96, 70, 42, 255);
        }

        private static void Gun(Painter p, int tile, int r, int g, int b, int barrelLength, bool stock)
        {
            p.FillTileRect(tile, 2, 6, 9, 4, r, g, b, 255);
            p.FillTileRect(tile, 10, 7, barrelLength, 2, 48, 48, 52, 255);
            p.FillTileRect(tile, 3, 10, 3, 4, 96, 70, 42, 255);
            if (stock) p.FillTileRect(tile, 0, 7, 3, 3, 96, 70, 42, 255);
        }

        // ---- Particle ---------------------------------------------------------

        /// <summary>
        /// Soft round dot. Left with straight (non-premultiplied) alpha, because the
        /// particle system draws it with BlendState.NonPremultiplied.
        /// </summary>
        public static Texture2D CreateParticle(GraphicsDevice device)
        {
            const int size = 16;
            Painter p = new Painter(size, size);

            for (int y = 0; y < size; y++)
            {
                for (int x = 0; x < size; x++)
                {
                    float dx = (x - 7.5f) / 7.5f;
                    float dy = (y - 7.5f) / 7.5f;
                    float d = (float)System.Math.Sqrt(dx * dx + dy * dy);
                    float a = 1.0f - d;
                    if (a < 0.0f) a = 0.0f;
                    a *= a;
                    p.Set(x, y, 255, 255, 255, a * 255.0f);
                }
            }

            return p.ToTexture(device, false);
        }

        // ---- Title thumbnail --------------------------------------------------

        /// <summary>
        /// 64x64 title thumbnail. Xbox Live Indie Games titles are required to ship one;
        /// it is written out by the --dump-assets switch rather than drawn at runtime.
        /// </summary>
        public static Texture2D CreateThumbnail(GraphicsDevice device)
        {
            const int size = 64;
            Painter p = new Painter(size, size);
            Rng rng = new Rng(0xC0FFEE);

            for (int y = 0; y < size; y++)
            {
                float t = y / (float)size;
                for (int x = 0; x < size; x++) p.Set(x, y, 10 + 40 * t, 12 + 34 * t, 34 + 58 * t, 255);
            }

            for (int y = 6; y < 16; y++)
            {
                for (int x = 44; x < 54; x++)
                {
                    int dx = x - 49;
                    int dy = y - 11;
                    if (dx * dx + dy * dy <= 22) p.Set(x, y, 228, 232, 240, 255);
                }
            }

            int[] heights = { 38, 38, 37, 36, 36, 35, 35, 36, 37, 39, 40, 40, 39, 38, 38, 37 };
            for (int column = 0; column < 16; column++)
            {
                int top = heights[column];
                for (int y = top; y < size; y++)
                {
                    for (int x = column * 4; x < column * 4 + 4; x++)
                    {
                        float n = rng.Between(-10.0f, 10.0f);
                        if (y == top) p.Set(x, y, 82 + n, 128 + n, 60 + n, 255);
                        else if (y < top + 4) p.Set(x, y, 108 + n, 78 + n, 52 + n, 255);
                        else p.Set(x, y, 96 + n, 96 + n, 100 + n, 255);
                    }
                }
            }

            // A seam of each headline ore, in tier order.
            DrawSeam(p, 10, 52, 108, 224, 224);
            DrawSeam(p, 34, 56, 232, 198, 76);
            DrawSeam(p, 52, 50, 198, 96, 228);

            return p.ToTexture(device, false);
        }

        private static void DrawSeam(Painter p, int x0, int y0, int r, int g, int b)
        {
            for (int y = y0; y < y0 + 3; y++)
            {
                for (int x = x0; x < x0 + 3; x++) p.Set(x, y, r, g, b, 255);
            }
        }

        // ---- Painting primitives ----------------------------------------------

        /// <summary>Deterministic xorshift, so the art is identical on every run and platform.</summary>
        public struct Rng
        {
            private uint _state;

            public Rng(uint seed)
            {
                _state = seed == 0 ? 0x9E3779B9u : seed;
            }

            public uint Next()
            {
                _state ^= _state << 13;
                _state ^= _state >> 17;
                _state ^= _state << 5;
                return _state;
            }

            public float NextFloat()
            {
                return (Next() >> 8) * (1.0f / 16777216.0f);
            }

            public float Between(float low, float high)
            {
                return low + (high - low) * NextFloat();
            }
        }

        private sealed class Painter
        {
            private readonly int _width;
            private readonly int _height;
            private readonly Color[] _pixels;

            public Painter(int width, int height)
            {
                _width = width;
                _height = height;
                _pixels = new Color[width * height];
            }

            public void Set(int x, int y, float r, float g, float b, float a)
            {
                if (x < 0 || y < 0 || x >= _width || y >= _height) return;
                _pixels[y * _width + x] = new Color(Clamp(r), Clamp(g), Clamp(b), Clamp(a));
            }

            private static byte Clamp(float v)
            {
                if (v <= 0.0f) return 0;
                if (v >= 255.0f) return 255;
                return (byte)v;
            }

            public void SetTile(int tile, int x, int y, float r, float g, float b, float a)
            {
                Set((tile % TilesPerRow) * TileSize + x, (tile / TilesPerRow) * TileSize + y, r, g, b, a);
            }

            public void ClearTile(int tile)
            {
                for (int y = 0; y < TileSize; y++)
                {
                    for (int x = 0; x < TileSize; x++) SetTile(tile, x, y, 0, 0, 0, 0);
                }
            }

            public void FillTileRect(int tile, int x0, int y0, int width, int height, float r, float g, float b, float a)
            {
                for (int y = y0; y < y0 + height; y++)
                {
                    for (int x = x0; x < x0 + width; x++) SetTile(tile, x, y, r, g, b, a);
                }
            }

            public void NoiseTile(int tile, float r, float g, float b, float spread, ref Rng rng)
            {
                NoiseTile(tile, r, g, b, spread, ref rng, 255);
            }

            public void NoiseTile(int tile, float r, float g, float b, float spread, ref Rng rng, float alpha)
            {
                for (int y = 0; y < TileSize; y++)
                {
                    for (int x = 0; x < TileSize; x++)
                    {
                        float n = rng.Between(-spread, spread);
                        SetTile(tile, x, y, r + n, g + n, b + n, alpha);
                    }
                }
            }

            public void Blobs(int tile, float r, float g, float b, int count, float radius, float jitter, ref Rng rng)
            {
                for (int i = 0; i < count; i++)
                {
                    int cx = (int)rng.Between(1.0f, TileSize - 1);
                    int cy = (int)rng.Between(1.0f, TileSize - 1);
                    float rad = rng.Between(radius * 0.6f, radius);

                    for (int y = 0; y < TileSize; y++)
                    {
                        for (int x = 0; x < TileSize; x++)
                        {
                            int dx = x - cx;
                            int dy = y - cy;
                            if (dx * dx + dy * dy > rad * rad) continue;
                            float n = rng.Between(-jitter, jitter);
                            SetTile(tile, x, y, r + n, g + n, b + n, 255);
                        }
                    }
                }
            }

            /// <summary>
            /// Uploads to the GPU. <paramref name="premultiply"/> matches what the XNA
            /// texture processor does by default, so the result can be drawn with
            /// BlendState.AlphaBlend.
            /// </summary>
            public Texture2D ToTexture(GraphicsDevice device, bool premultiply)
            {
                if (premultiply)
                {
                    for (int i = 0; i < _pixels.Length; i++)
                    {
                        Color c = _pixels[i];
                        if (c.A == 255) continue;
                        _pixels[i] = new Color(
                            (byte)(c.R * c.A / 255),
                            (byte)(c.G * c.A / 255),
                            (byte)(c.B * c.A / 255),
                            c.A);
                    }
                }

                Texture2D texture = new Texture2D(device, _width, _height);
                texture.SetData(_pixels);
                return texture;
            }
        }
    }
}
