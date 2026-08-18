using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
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

            CheckAtlasManifest(Path.Combine(root, "content", "Textures", "atlas.manifest"));
            CheckShaderConstants(Path.Combine(root, "content", "Shaders", "Voxel.fx"));
            CheckAssetsExist(root);
        }

        private static void CheckAtlasManifest(string path)
        {
            if (!File.Exists(path))
            {
                Harness.Check(false, "atlas.manifest exists (run tools/make_atlas.py)");
                return;
            }

            Dictionary<string, string> values = ReadKeyValues(path);

            int tilesPerRow = int.Parse(values["tiles_per_row"], CultureInfo.InvariantCulture);
            Harness.CheckEqual(BlockRegistry.AtlasTilesPerRow, tilesPerRow,
                "block atlas tiles-per-row matches the generator");
            Harness.CheckEqual(ItemRegistry.IconAtlasTilesPerRow, tilesPerRow,
                "icon atlas tiles-per-row matches the generator");

            List<int> blockTiles = ParseList(values["blocks"]);
            List<int> itemTiles = ParseList(values["items"]);

            // Every face of every block must land on a tile the generator drew.
            string missingBlock = null;
            for (byte id = 1; id < Block.Count && missingBlock == null; id++)
            {
                BlockDefinition block = BlockRegistry.Get(id);
                for (int face = 0; face < Face.Count; face++)
                {
                    if (!blockTiles.Contains(block.FaceTiles[face]))
                    {
                        missingBlock = block.Name + " face " + face + " -> tile " + block.FaceTiles[face];
                        break;
                    }
                }
            }
            Harness.Check(missingBlock == null,
                "every block face points at a drawn atlas tile"
                + (missingBlock == null ? "" : " (" + missingBlock + " is missing)"));

            string missingItem = null;
            for (int id = 1; id < 256 && missingItem == null; id++)
            {
                if (!ItemRegistry.Exists((byte)id)) continue;
                if (Item.IsBlock((byte)id)) continue;   // blocks draw from the terrain atlas

                ItemDefinition item = ItemRegistry.Get((byte)id);
                if (!itemTiles.Contains(item.IconTile))
                {
                    missingItem = item.Name + " -> icon " + item.IconTile;
                }
            }
            Harness.Check(missingItem == null,
                "every item icon points at a drawn atlas tile"
                + (missingItem == null ? "" : " (" + missingItem + " is missing)"));

            // Two different tools sharing an icon means one of them was assigned wrong.
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
            string[] required =
            {
                "content/Textures/blocks.png",
                "content/Textures/items.png",
                "content/Textures/particle.png",
                "content/Shaders/Voxel.fx",
                "content/Fonts/Hud.spritefont",
                "content/Fonts/Title.spritefont",
                "CastleMinerZ.Xbox360/GameThumbnail.png",
            };

            string missing = null;
            for (int i = 0; i < required.Length && missing == null; i++)
            {
                if (!File.Exists(Path.Combine(root, required[i].Replace('/', Path.DirectorySeparatorChar))))
                    missing = required[i];
            }
            Harness.Check(missing == null,
                "every asset the content project references exists"
                + (missing == null ? "" : " (" + missing + " is missing)"));

            // The sound manager names its assets by path; all fourteen must be present or
            // the corresponding effect silently plays nothing.
            string[] sounds =
            {
                "break", "place", "hit", "hurt", "gunshot", "shotgun", "laser",
                "explosion", "pickup", "zombie", "skeleton", "dragon",
                "menu_move", "menu_select"
            };

            int found = 0;
            for (int i = 0; i < sounds.Length; i++)
            {
                if (File.Exists(Path.Combine(root, "content", "Audio", sounds[i] + ".wav"))) found++;
            }
            Harness.CheckEqual(sounds.Length, found, "every sound effect exists");
            Harness.CheckEqual(sounds.Length, (int)SoundId.Count,
                "the SoundId enum and the generated sound set are the same size");
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
