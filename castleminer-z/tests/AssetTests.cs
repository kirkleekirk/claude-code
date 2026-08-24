using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using Microsoft.Xna.Framework;
using CastleMinerZ.Assets;
using CastleMinerZ.Items;
using CastleMinerZ.World;

namespace CastleMinerZ.Tests
{
    /// <summary>
    /// Checks the couplings between code and generated content that nothing else can
    /// catch.
    ///
    /// Two constants in Voxel.fx have to agree with two constants in the C#, and every
    /// tile index in the block and item registries has to point at a tile the atlas
    /// generator actually draws. None of that is a compile error if it drifts; the
    /// symptom is a block quietly wearing the wrong texture, or geometry rendering at
    /// four times its intended size.
    /// </summary>
    public static class AssetTests
    {
        public static void Run()
        {
            Harness.Suite("Content coupling");

            string root = FindRepositoryRoot();
            if (root == null)
            {
                Harness.Check(false, "found the repository root");
                return;
            }

            CheckAtlasTiles();
            CheckShaderConstants(Path.Combine(root, "content", "Shaders", "Voxel.fx"));
            CheckAssetsExist(root);
            CheckGlyphTable();
        }

        private static void CheckAtlasTiles()
        {
            Harness.CheckEqual(TextureFactory.TilesPerRow, BlockRegistry.AtlasTilesPerRow,
                "block atlas grid matches the generator");
            Harness.CheckEqual(TextureFactory.TilesPerRow, ItemRegistry.IconAtlasTilesPerRow,
                "icon atlas grid matches the generator");

            // Every face of every block must land on a tile the generator actually draws.
            string missingBlock = null;
            for (byte id = 1; id < Block.Count && missingBlock == null; id++)
            {
                BlockDefinition block = BlockRegistry.Get(id);
                for (int face = 0; face < Face.Count; face++)
                {
                    if (!TextureFactory.IsBlockTileDrawn(block.FaceTiles[face]))
                    {
                        missingBlock = block.Name + " face " + face + " -> tile " + block.FaceTiles[face];
                        break;
                    }
                }
            }
            Harness.Check(missingBlock == null,
                "every block face points at a drawn atlas tile"
                + (missingBlock == null ? "" : " (" + missingBlock + ")"));

            string missingItem = null;
            for (int id = 1; id < 256 && missingItem == null; id++)
            {
                if (!ItemRegistry.Exists((byte)id)) continue;
                if (Item.IsBlock((byte)id)) continue;   // blocks draw from the terrain atlas

                ItemDefinition item = ItemRegistry.Get((byte)id);
                if (!TextureFactory.IsItemTileDrawn(item.IconTile))
                {
                    missingItem = item.Name + " -> icon " + item.IconTile;
                }
            }
            Harness.Check(missingItem == null,
                "every item icon points at a drawn atlas tile"
                + (missingItem == null ? "" : " (" + missingItem + ")"));

            // Two items sharing an icon means one of them was assigned wrong.
            Dictionary<int, string> seen = new Dictionary<int, string>();
            string duplicate = null;
            for (int id = 1; id < 256 && duplicate == null; id++)
            {
                if (!ItemRegistry.Exists((byte)id)) continue;
                if (Item.IsBlock((byte)id)) continue;

                ItemDefinition item = ItemRegistry.Get((byte)id);
                if (seen.ContainsKey(item.IconTile))
                {
                    duplicate = item.Name + " and " + seen[item.IconTile] + " share icon " + item.IconTile;
                }
                else
                {
                    seen[item.IconTile] = item.Name;
                }
            }
            Harness.Check(duplicate == null,
                "no two items share an icon" + (duplicate == null ? "" : " (" + duplicate + ")"));
        }

        private static void CheckShaderConstants(string path)
        {
            if (!File.Exists(path))
            {
                Harness.Check(false, "Voxel.fx exists");
                return;
            }

            string source = File.ReadAllText(path);

            float positionScale = ReadDefine(source, "POSITION_SCALE");
            float tileSize = ReadDefine(source, "TILE_SIZE");

            // The mesher emits positions in quarter-block units; the shader scales them
            // back up. If these disagree the whole world renders at the wrong size.
            Harness.CheckNear(1.0f / ChunkMesher.Q, positionScale, 0.0001f,
                "Voxel.fx POSITION_SCALE matches ChunkMesher.Q");

            Harness.CheckNear(1.0f / BlockRegistry.AtlasTilesPerRow, tileSize, 0.0001f,
                "Voxel.fx TILE_SIZE matches the atlas grid");

            Harness.Check(source.Contains("vs_3_0") && source.Contains("ps_3_0"),
                "Voxel.fx targets shader model 3, as the HiDef profile requires");
            Harness.Check(source.Contains("technique Terrain") && source.Contains("technique Water"),
                "Voxel.fx defines both techniques the renderer asks for");
        }

        private static void CheckAssetsExist(string root)
        {
            // The game has almost no asset files left: everything but the shader and the
            // console's title thumbnail is generated in code.
            string[] required =
            {
                "content/Shaders/Voxel.fx",
                "content/CastleMinerZContent.contentproj",
                "CastleMinerZ.Xbox360/GameThumbnail.png",
            };

            string missing = null;
            for (int i = 0; i < required.Length && missing == null; i++)
            {
                if (!File.Exists(Path.Combine(root, required[i].Replace('/', Path.DirectorySeparatorChar))))
                    missing = required[i];
            }
            Harness.Check(missing == null,
                "every asset file the build references exists"
                + (missing == null ? "" : " (" + missing + " is missing)"));

            Harness.CheckEqual(14, (int)SoundId.Count,
                "the SoundId enum matches the number of synthesised effects");
        }

        /// <summary>
        /// The font is data, and data can be mistyped. A glyph with a short row would throw
        /// while rasterising, on a machine that may not have a console attached.
        /// </summary>
        private static void CheckGlyphTable()
        {
            PixelFont font = new PixelFont();
            Vector2 size = font.Measure("ABC", 2);

            Harness.CheckNear(PixelFont.Advance * 3 * 2, size.X, 0.01f, "text width scales with the glyph advance");
            Harness.CheckNear(PixelFont.LineHeight * 2, size.Y, 0.01f, "single-line text is one line high");

            Vector2 twoLines = font.Measure("AB\nCDE", 1);
            Harness.CheckNear(PixelFont.Advance * 3, twoLines.X, 0.01f, "multi-line width is the longest line");
            Harness.CheckNear(PixelFont.LineHeight * 2, twoLines.Y, 0.01f, "multi-line height counts the lines");
            Harness.CheckNear(0.0f, font.Measure(null, 2).X, 0.01f, "null text measures as empty");
        }

        // ---- Helpers ----------------------------------------------------------

        private static Dictionary<string, string> ReadKeyValues(string path)
        {
            Dictionary<string, string> values = new Dictionary<string, string>();
            string[] lines = File.ReadAllLines(path);

            for (int i = 0; i < lines.Length; i++)
            {
                string line = lines[i].Trim();
                if (line.Length == 0 || line[0] == '#') continue;

                int split = line.IndexOf('=');
                if (split <= 0) continue;
                values[line.Substring(0, split)] = line.Substring(split + 1);
            }
            return values;
        }

        private static List<int> ParseList(string csv)
        {
            List<int> values = new List<int>();
            string[] parts = csv.Split(',');
            for (int i = 0; i < parts.Length; i++)
            {
                string part = parts[i].Trim();
                if (part.Length == 0) continue;
                values.Add(int.Parse(part, CultureInfo.InvariantCulture));
            }
            return values;
        }

        /// <summary>Reads a numeric <c>#define</c> out of HLSL source.</summary>
        private static float ReadDefine(string source, string name)
        {
            int at = source.IndexOf("#define " + name);
            if (at < 0) return float.NaN;

            int start = at + 8 + name.Length;
            int end = source.IndexOfAny(new char[] { '\r', '\n', '/' }, start);
            if (end < 0) end = source.Length;

            string value = source.Substring(start, end - start).Trim();
            float parsed;
            if (!float.TryParse(value, NumberStyles.Float, CultureInfo.InvariantCulture, out parsed)) return float.NaN;
            return parsed;
        }

        /// <summary>Walks up from the test binary until the repository layout is recognised.</summary>
        private static string FindRepositoryRoot()
        {
            DirectoryInfo directory = new DirectoryInfo(AppDomain.CurrentDomain.BaseDirectory);
            for (int depth = 0; depth < 10 && directory != null; depth++)
            {
                if (File.Exists(Path.Combine(directory.FullName, "CastleMinerZ.sln"))) return directory.FullName;
                directory = directory.Parent;
            }
            return null;
        }
    }
}
