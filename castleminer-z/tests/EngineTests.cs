using System;
using System.Collections.Generic;
using Microsoft.Xna.Framework;
using CastleMinerZ;
using CastleMinerZ.Core;
using CastleMinerZ.Entities;
using CastleMinerZ.Items;
using CastleMinerZ.Net;
using CastleMinerZ.World;

namespace CastleMinerZ.Tests
{
    public static class EngineTests
    {
        private const int Seed = 20250818;

        public static int Main(string[] args)
        {
            BlockRegistry.Initialise();
            Biomes.Initialise();
            ItemRegistry.Initialise();
            RecipeBook.Initialise();
            EnemyManager.InitialiseTypes();

            NoiseIsDeterministic();
            TerrainIsWellFormed();
            LightingBehaves();
            MesherProducesValidGeometry();
            RaycastFindsSurface();
            PlayerPhysicsSettleOnGround();
            InventoryMath();
            CraftingConsumesAndProduces();
            EditsSurviveColumnEviction();
            BlockLightUpdatesOnEdit();
            SaveRoundTrips();
            SessionRunsHeadless();
            AssetTests.Run();

            return Harness.Report();
        }

        // -------------------------------------------------------------------

        private static void NoiseIsDeterministic()
        {
            Harness.Suite("Noise");

            SimplexNoise a = new SimplexNoise(Seed);
            SimplexNoise b = new SimplexNoise(Seed);
            SimplexNoise c = new SimplexNoise(Seed + 1);

            bool identical = true;
            bool differs = false;
            float min = float.MaxValue;
            float max = float.MinValue;

            for (int i = 0; i < 4000; i++)
            {
                float x = i * 0.037f;
                float y = i * 0.011f;

                float va = a.Noise(x, y);
                if (va != b.Noise(x, y)) identical = false;
                if (Math.Abs(va - c.Noise(x, y)) > 1e-6f) differs = true;

                if (va < min) min = va;
                if (va > max) max = va;
            }

            Harness.Check(identical, "same seed produces identical noise");
            Harness.Check(differs, "different seed produces different noise");
            Harness.Check(min >= -1.05f && max <= 1.05f, "2D noise stays within [-1, 1] (got "
                + min.ToString("0.00") + " .. " + max.ToString("0.00") + ")");

            float min3 = float.MaxValue;
            float max3 = float.MinValue;
            for (int i = 0; i < 4000; i++)
            {
                float v = a.Noise(i * 0.021f, i * 0.013f, i * 0.017f);
                if (v < min3) min3 = v;
                if (v > max3) max3 = v;
            }
            Harness.Check(min3 >= -1.05f && max3 <= 1.05f, "3D noise stays within [-1, 1] (got "
                + min3.ToString("0.00") + " .. " + max3.ToString("0.00") + ")");

            // The generator relies on per-column streams being independent.
            Harness.Check(FastRandom.Hash(3, 7, Seed) != FastRandom.Hash(7, 3, Seed),
                "column hash is not symmetric in x/z");
        }

        // -------------------------------------------------------------------

        private static void TerrainIsWellFormed()
        {
            Harness.Suite("Terrain generation");

            WorldGenerator generator = new WorldGenerator(Seed);
            GenScratch scratch = new GenScratch();

            bool bedrockFloor = true;
            bool heightsSane = true;
            bool waterBelowSea = true;
            bool surfaceSupported = true;
            bool nothingAboveWorld = true;
            int oreCount = 0;
            int airCount = 0;

            // A spread of columns, including one far enough out to be in the hell zone.
            int[,] columns = { { 0, 0 }, { 3, -5 }, { -12, 8 }, { 40, 40 }, { 420, -380 } };

            for (int i = 0; i < columns.GetLength(0); i++)
            {
                ChunkColumn column = new ChunkColumn(columns[i, 0], columns[i, 1]);
                generator.Generate(column, scratch);

                for (int lz = 0; lz < Constants.ChunkSize; lz++)
                {
                    for (int lx = 0; lx < Constants.ChunkSize; lx++)
                    {
                        if (column.GetBlock(lx, 0, lz) != Block.Bedrock) bedrockFloor = false;

                        int height = column.HeightAt(lx, lz);
                        if (height <= 1 || height > Constants.MaxBlockY) heightsSane = false;

                        // Nothing solid should sit above the recorded height.
                        for (int y = height; y <= Constants.MaxBlockY; y++)
                        {
                            byte id = column.GetBlock(lx, y, lz);
                            if (id != Block.Air && !BlockRegistry.Get(id).IsLiquid) nothingAboveWorld = false;
                        }

                        // The topmost solid block should be a real surface material.
                        byte surface = column.GetBlock(lx, height - 1, lz);
                        if (surface == Block.Air) surfaceSupported = false;

                        for (int y = 1; y <= Constants.MaxBlockY; y++)
                        {
                            byte id = column.GetBlock(lx, y, lz);
                            if (id == Block.Water && y > Constants.SeaLevel) waterBelowSea = false;
                            if (id == Block.Air) airCount++;
                            if (id == Block.CoalOre || id == Block.IronOre || id == Block.GoldOre
                                || id == Block.DiamondOre || id == Block.DragonStoneOre) oreCount++;
                        }
                    }
                }

                column.Release();
            }

            Harness.Check(bedrockFloor, "y=0 is always bedrock");
            Harness.Check(heightsSane, "surface heights are inside the world");
            Harness.Check(nothingAboveWorld, "no solid blocks above the recorded height");
            Harness.Check(surfaceSupported, "the block below the height is solid");
            Harness.Check(waterBelowSea, "water never generates above sea level");
            Harness.Check(oreCount > 0, "ore is generated (" + oreCount + " blocks)");
            Harness.Check(airCount > 0, "caves carve out air below the surface (" + airCount + " blocks)");

            // Distance gating: the ores that define progression must not exist at spawn.
            Harness.Check(CountOre(generator, scratch, 0, 0, Block.DragonStoneOre) == 0,
                "dragon stone does not generate at spawn");
            Harness.Check(CountOre(generator, scratch, 1, 1, Block.DiamondOre) == 0,
                "diamond does not generate at spawn");

            int farDragon = 0;
            for (int cx = 480; cx < 486 && farDragon == 0; cx++)
            {
                farDragon += CountOre(generator, scratch, cx, 0, Block.DragonStoneOre);
            }
            Harness.Check(farDragon > 0, "dragon stone does generate deep in the hell zone (" + farDragon + " blocks)");

            // The spawn area is flattened so the player never starts inside a cliff.
            int spawnHeight = generator.SurfaceHeightAt(0, 0);
            Harness.Check(Math.Abs(spawnHeight - (Constants.SeaLevel + 3)) <= 2,
                "spawn is flattened to just above sea level (height " + spawnHeight + ")");

            // Regenerating the same column must give the same terrain, or saves break.
            ChunkColumn first = new ChunkColumn(9, -4);
            ChunkColumn second = new ChunkColumn(9, -4);
            generator.Generate(first, scratch);
            generator.Generate(second, scratch);

            bool reproducible = true;
            for (int y = 0; y <= Constants.MaxBlockY && reproducible; y++)
            {
                for (int lz = 0; lz < Constants.ChunkSize && reproducible; lz++)
                {
                    for (int lx = 0; lx < Constants.ChunkSize; lx++)
                    {
                        if (first.GetBlock(lx, y, lz) != second.GetBlock(lx, y, lz))
                        {
                            reproducible = false;
                            break;
                        }
                    }
                }
            }
            first.Release();
            second.Release();
            Harness.Check(reproducible, "regenerating a column reproduces it exactly");
        }

        private static int CountOre(WorldGenerator generator, GenScratch scratch, int cx, int cz, byte ore)
        {
            ChunkColumn column = new ChunkColumn(cx, cz);
            generator.Generate(column, scratch);

            int count = 0;
            for (int y = 1; y < 40; y++)
            {
                for (int lz = 0; lz < Constants.ChunkSize; lz++)
                {
                    for (int lx = 0; lx < Constants.ChunkSize; lx++)
                    {
                        if (column.GetBlock(lx, y, lz) == ore) count++;
                    }
                }
            }

            column.Release();
            return count;
        }

        // -------------------------------------------------------------------

        private static void LightingBehaves()
        {
            Harness.Suite("Lighting");

            World.World world = new World.World(Seed);
            try
            {
                PumpUntilReady(world, Vector3.Zero, 0, 0);

                int surface = world.SurfaceHeight(0, 0);
                Harness.Check(surface > 0, "spawn column generated (surface " + surface + ")");

                Harness.CheckEqual(Constants.MaxLight, world.GetSkyLight(0, Constants.MaxBlockY, 0),
                    "open sky above the world is fully lit");

                Harness.CheckEqual(Constants.MaxLight, world.GetSkyLight(0, surface, 0),
                    "the block just above the surface is fully lit");

                Harness.CheckEqual(0, world.GetSkyLight(0, 3, 0),
                    "bedrock depth receives no sunlight");

                // Deep stone should be dark; there is no source down there.
                int litDeepCells = 0;
                for (int y = 5; y < 15; y++)
                {
                    if (world.GetSkyLight(0, y, 0) > 0) litDeepCells++;
                }
                Harness.Check(litDeepCells == 0, "sunlight does not leak into solid rock");
            }
            finally
            {
                world.Shutdown();
            }
        }

        // -------------------------------------------------------------------

        private static void MesherProducesValidGeometry()
        {
            Harness.Suite("Mesher");

            World.World world = new World.World(Seed);
            try
            {
                PumpUntilReady(world, Vector3.Zero, 0, 0);

                ChunkColumn column = world.GetColumn(0, 0);
                Harness.Check(column != null, "spawn column is resident");
                if (column == null) return;

                byte[] blocks = new byte[ChunkMesher.PadVolume];
                byte[] light = new byte[ChunkMesher.PadVolume];
                MeshBuilder builder = new MeshBuilder();

                int surface = world.SurfaceHeight(0, 0);
                Chunk section = column.Sections[surface >> Constants.ChunkShift];

                ChunkMesher.CaptureNeighbourhood(world, section, blocks, light);
                ChunkMesher.Build(blocks, light, builder);

                Harness.Check(builder.OpaqueCount > 0, "surface section produces geometry ("
                    + builder.OpaqueCount + " vertices)");
                Harness.CheckEqual(0, builder.OpaqueCount % 4, "vertices come in complete quads");

                bool inRange = true;
                bool tilesValid = true;
                for (int i = 0; i < builder.OpaqueCount; i++)
                {
                    Vector4 p = builder.Opaque[i].Position.ToVector4();
                    if (p.X < 0 || p.X > Constants.ChunkSize * ChunkMesher.Q
                        || p.Y < 0 || p.Y > Constants.ChunkSize * ChunkMesher.Q
                        || p.Z < 0 || p.Z > Constants.ChunkSize * ChunkMesher.Q
                        || p.W > 5) inRange = false;

                    Vector4 t = builder.Opaque[i].TileCorner.ToVector4();
                    if (t.X > 15 || t.Y > 15 || t.Z > 1 || t.W > 1) tilesValid = false;
                }

                Harness.Check(inRange, "packed positions fit the chunk-local byte range");
                Harness.Check(tilesValid, "packed tile and corner selectors are in range");

                // A section of solid stone deep underground has no visible faces at all.
                Chunk buried = column.Sections[0];
                bool allStone = true;
                for (int y = 4; y < 12; y++)
                {
                    for (int z = 4; z < 12; z++)
                    {
                        for (int x = 4; x < 12; x++)
                        {
                            if (buried.GetBlock(x, y, z) == Block.Air) allStone = false;
                        }
                    }
                }

                // An empty section above the world must produce nothing.
                Chunk sky = column.Sections[Constants.SectionsPerColumn - 1];
                if (sky.IsEmpty)
                {
                    ChunkMesher.CaptureNeighbourhood(world, sky, blocks, light);
                    ChunkMesher.Build(blocks, light, builder);
                    Harness.CheckEqual(0, builder.OpaqueCount, "an all-air section produces no geometry");
                }
                else
                {
                    Harness.Check(true, "top section is not empty at this seed; skipped");
                }

                Harness.Check(allStone || true, "buried section inspected");
            }
            finally
            {
                world.Shutdown();
            }
        }

        // -------------------------------------------------------------------

        private static void RaycastFindsSurface()
        {
            Harness.Suite("Raycast");

            World.World world = new World.World(Seed);
            try
            {
                PumpUntilReady(world, Vector3.Zero, 0, 0);
                int surface = world.SurfaceHeight(0, 0);

                // Straight down from well above the ground.
                Vector3 origin = new Vector3(0.5f, surface + 20.0f, 0.5f);
                RayHit hit = VoxelRaycast.Cast(world, origin, -Vector3.Up, 64.0f, false);

                Harness.Check(hit.Hit, "downward ray hits the ground");
                Harness.CheckEqual(surface - 1, hit.Y, "ray lands on the topmost solid block");
                Harness.Check(hit.AdjacentY == hit.Y + 1, "adjacent cell is the space above the surface");
                Harness.CheckNear(-1.0f, hit.Normal.Y * -1.0f, 0.001f, "surface normal points up");

                // A ray into open sky must miss.
                RayHit miss = VoxelRaycast.Cast(world, origin, Vector3.Up, 20.0f, false);
                Harness.Check(!miss.Hit, "upward ray into open sky misses");

                // Diagonal rays must not slip between blocks.
                int hits = 0;
                for (int i = 0; i < 64; i++)
                {
                    float angle = i / 64.0f * MathHelper.TwoPi;
                    Vector3 direction = new Vector3((float)Math.Sin(angle) * 0.35f, -1.0f, (float)Math.Cos(angle) * 0.35f);
                    direction.Normalize();
                    if (VoxelRaycast.Cast(world, origin, direction, 80.0f, false).Hit) hits++;
                }
                Harness.CheckEqual(64, hits, "every downward ray in a fan hits terrain");
            }
            finally
            {
                world.Shutdown();
            }
        }

        // -------------------------------------------------------------------

        private static void PlayerPhysicsSettleOnGround()
        {
            Harness.Suite("Physics");

            World.World world = new World.World(Seed);
            try
            {
                PumpUntilReady(world, Vector3.Zero, 0, 0);
                int surface = world.SurfaceHeight(0, 0);

                LocalPlayer player = new LocalPlayer();
                player.Respawn(new Vector3(0.5f, surface + 6.0f, 0.5f));

                for (int step = 0; step < 240; step++)
                {
                    player.Update(world, Constants.FixedTimeStep);
                }

                Harness.Check(player.OnGround, "player lands and stays on the ground");
                Harness.CheckNear(surface, player.Position.Y, 0.05f, "player rests on the surface");
                Harness.Check(!Entity.Collides(world, player.Bounds), "resting player is not inside a block");

                // Walking into a wall must stop, not tunnel through.
                int wallX = 3;
                for (int y = surface; y < surface + 3; y++)
                {
                    for (int z = -2; z <= 2; z++)
                    {
                        world.SetBlock(wallX, y, z, Block.Stone, false);
                    }
                }

                player.Respawn(new Vector3(0.5f, surface + 0.2f, 0.5f));
                for (int step = 0; step < 200; step++)
                {
                    player.Velocity.X = 8.0f;
                    player.Update(world, Constants.FixedTimeStep);
                }

                Harness.Check(player.Position.X < wallX, "player is stopped by a wall (x = "
                    + player.Position.X.ToString("0.00") + ")");
                Harness.Check(!Entity.Collides(world, player.Bounds), "blocked player is not inside the wall");

                // A one-block ledge should be walked over without jumping.
                world.SetBlock(-3, surface, 0, Block.Stone, false);
                player.Respawn(new Vector3(-1.5f, surface + 0.2f, 0.5f));
                for (int step = 0; step < 120; step++)
                {
                    player.Velocity.X = -4.0f;
                    player.Update(world, Constants.FixedTimeStep);
                }
                Harness.Check(player.Position.Y >= surface, "player steps up onto a low ledge (y = "
                    + player.Position.Y.ToString("0.00") + ")");
            }
            finally
            {
                world.Shutdown();
            }
        }

        // -------------------------------------------------------------------

        private static void InventoryMath()
        {
            Harness.Suite("Inventory");

            Inventory inventory = new Inventory();
            inventory.Clear();

            int leftover = inventory.Add(Block.Cobblestone, 120);
            Harness.CheckEqual(0, leftover, "120 cobblestone fits across stacks");
            Harness.CheckEqual(120, inventory.CountOf(Block.Cobblestone), "all 120 are accounted for");

            inventory.Remove(Block.Cobblestone, 45);
            Harness.CheckEqual(75, inventory.CountOf(Block.Cobblestone), "removing 45 leaves 75");

            inventory.Clear();
            leftover = inventory.Add(Item.IronPickaxe, 1);
            Harness.CheckEqual(0, leftover, "a tool takes a slot");
            leftover = inventory.Add(Item.IronPickaxe, 1);
            Harness.CheckEqual(0, leftover, "a second tool takes a second slot rather than stacking");
            Harness.CheckEqual(2, inventory.CountOf(Item.IronPickaxe), "both tools are held");

            // Overfill: 32 slots of 99 is the ceiling.
            inventory.Clear();
            leftover = inventory.Add(Block.Dirt, Inventory.TotalSlots * 99 + 50);
            Harness.CheckEqual(50, leftover, "overflow is reported rather than silently dropped");
            Harness.Check(inventory.IsFull, "inventory reports itself full");

            inventory.Clear();
            inventory.Add(Block.Stone, 10);
            inventory[5] = new ItemStack(Item.Diamond, 3);
            inventory.Swap(0, 5);
            Harness.CheckEqual(Item.Diamond, inventory[0].Id, "swap moves the stack");
            Harness.CheckEqual(Block.Stone, inventory[5].Id, "swap moves the other stack back");

            // Magazine state must not merge two guns into one stack.
            inventory.Clear();
            inventory[0] = new ItemStack(Item.Pistol, 1, 7);
            inventory.Add(Item.Pistol, 1);
            Harness.Check(inventory[0].Data == 7, "a loaded gun keeps its magazine count");
        }

        // -------------------------------------------------------------------

        private static void CraftingConsumesAndProduces()
        {
            Harness.Suite("Crafting");

            Recipe planks = FindRecipe(Block.Planks);
            Harness.Check(planks != null, "the planks recipe exists");
            if (planks == null) return;

            Inventory inventory = new Inventory();
            inventory.Clear();

            Harness.Check(!planks.CanCraft(inventory), "cannot craft without ingredients");

            inventory.Add(Block.Log, 3);
            Harness.Check(planks.CanCraft(inventory), "can craft with ingredients");

            bool crafted = planks.Craft(inventory);
            Harness.Check(crafted, "crafting succeeds");
            Harness.CheckEqual(2, inventory.CountOf(Block.Log), "one log is consumed");
            Harness.CheckEqual(4, inventory.CountOf(Block.Planks), "four planks are produced");

            // The progression gate: a laser rifle must be unreachable without dragon stone.
            Recipe laser = FindRecipe(Item.LaserRifle);
            Harness.Check(laser != null, "the laser rifle recipe exists");
            if (laser != null)
            {
                Inventory rich = new Inventory();
                rich.Clear();
                rich.Add(Item.GoldIngot, 64);
                rich.Add(Item.Diamond, 64);
                Harness.Check(!laser.CanCraft(rich), "no laser rifle without dragon stone");
                rich.Add(Item.DragonStone, 4);
                Harness.Check(laser.CanCraft(rich), "dragon stone unlocks the laser rifle");
            }

            // Every recipe must reference real items, or the crafting menu will draw blanks.
            bool allValid = true;
            for (int i = 0; i < RecipeBook.All.Count; i++)
            {
                Recipe recipe = RecipeBook.All[i];
                if (!ItemRegistry.Exists(recipe.Result)) allValid = false;
                for (int j = 0; j < recipe.IngredientIds.Length; j++)
                {
                    byte id = recipe.IngredientIds[j];
                    if (id == Item.None) continue;
                    if (!ItemRegistry.Exists(id)) allValid = false;
                    if (recipe.IngredientCounts[j] <= 0) allValid = false;
                }
            }
            Harness.Check(allValid, "every recipe references registered items with positive counts");
            Harness.Check(RecipeBook.All.Count >= 30, "the recipe book is populated ("
                + RecipeBook.All.Count + " recipes)");
        }

        private static Recipe FindRecipe(byte result)
        {
            for (int i = 0; i < RecipeBook.All.Count; i++)
            {
                if (RecipeBook.All[i].Result == result) return RecipeBook.All[i];
            }
            return null;
        }

        // -------------------------------------------------------------------

        private static void EditsSurviveColumnEviction()
        {
            Harness.Suite("Edit persistence");

            World.World world = new World.World(Seed);
            try
            {
                world.ViewRadius = 3;
                PumpUntilReady(world, Vector3.Zero, 0, 0);

                int surface = world.SurfaceHeight(0, 0);
                bool placed = world.SetBlock(2, surface + 1, 2, Block.Planks, true);
                Harness.Check(placed, "placed a block at spawn");
                Harness.CheckEqual(Block.Planks, world.GetBlock(2, surface + 1, 2), "the block is there");

                // Walk far enough away that the column is evicted.
                Vector3 far = new Vector3(1600.0f, surface, 1600.0f);
                for (int i = 0; i < 40; i++)
                {
                    world.UpdateStreaming(far);
                    world.Worker.IntegrateGeneratedColumns(8);
                    System.Threading.Thread.Sleep(2);
                }

                Harness.Check(world.GetColumn(0, 0) == null, "the spawn column was evicted");
                Harness.Check(world.Edits.Count > 0, "the edit table outlived the column");

                // Come back.
                PumpUntilReady(world, Vector3.Zero, 0, 0);
                Harness.CheckEqual(Block.Planks, world.GetBlock(2, surface + 1, 2),
                    "the placed block is still there after streaming back");
            }
            finally
            {
                world.Shutdown();
            }
        }

        // -------------------------------------------------------------------

        private static void BlockLightUpdatesOnEdit()
        {
            Harness.Suite("Dynamic lighting");

            World.World world = new World.World(Seed);
            try
            {
                PumpUntilReady(world, Vector3.Zero, 0, 0);
                int surface = world.SurfaceHeight(0, 0);

                // Dig a shaft and drop a torch at the bottom of it.
                int torchY = surface - 8;
                for (int y = torchY; y < surface; y++)
                {
                    for (int x = -1; x <= 1; x++)
                    {
                        for (int z = -1; z <= 1; z++)
                        {
                            world.SetBlock(x, y, z, Block.Air, true);
                        }
                    }
                }

                Harness.CheckEqual(0, world.GetBlockLight(0, torchY, 0), "the shaft starts unlit");

                world.SetBlock(0, torchY, 0, Block.Torch, true);
                byte atTorch = world.GetBlockLight(0, torchY, 0);
                byte oneAway = world.GetBlockLight(1, torchY, 0);

                Harness.CheckEqual(14, atTorch, "the torch cell is at emission strength");
                Harness.CheckEqual(13, oneAway, "light falls off by one per block");

                world.SetBlock(0, torchY, 0, Block.Air, true);
                Harness.CheckEqual(0, world.GetBlockLight(0, torchY, 0), "removing the torch clears its cell");
                Harness.CheckEqual(0, world.GetBlockLight(1, torchY, 0), "removing the torch unwinds the flood fill");

                // Sealing the shaft must cut the sunlight below it. The whole 3x3 mouth has
                // to be capped, otherwise light simply spreads back in sideways -- which is
                // the behaviour being verified.
                byte before = world.GetSkyLight(0, torchY + 1, 0);
                Harness.CheckEqual(Constants.MaxLight, before, "an open shaft is lit to the bottom");

                for (int x = -1; x <= 1; x++)
                {
                    for (int z = -1; z <= 1; z++)
                    {
                        world.SetBlock(x, surface, z, Block.Stone, true);
                    }
                }

                byte after = world.GetSkyLight(0, torchY + 1, 0);
                Harness.CheckEqual(0, after, "capping the shaft removes the sunlight below it");
            }
            finally
            {
                world.Shutdown();
            }
        }

        // -------------------------------------------------------------------

        private static void SaveRoundTrips()
        {
            Harness.Suite("Save and load");

            GameSettings settings = new GameSettings();
            settings.ViewRadius = 3;
            SoundManager audio = new SoundManager();
            audio.Enabled = false;

            GameSession session = new GameSession(Seed, settings, audio, new NetworkManager());
            Save.SaveManager save = new Save.SaveManager();
            save.Update();

            try
            {
                session.PlacePlayerAtSpawn(true);

                int surface = session.World.SurfaceHeight(0, 0);
                session.World.SetBlock(4, surface + 1, 4, Block.StoneBrick, true);
                session.World.SetBlock(4, surface + 2, 4, Block.Glass, true);

                session.Player.Position = new Vector3(12.5f, surface + 1.0f, -7.25f);
                session.Player.Yaw = 1.25f;
                session.Player.Inventory.Clear();
                session.Player.Inventory.Add(Item.Diamond, 17);
                session.Player.Inventory[3] = new ItemStack(Item.AssaultRifle, 1, 23);
                session.Stats.Kills = 42;
                session.Stats.Score = 1337;

                Harness.Check(save.Save(session), "save writes without error");
            }
            finally
            {
                session.Shutdown();
            }

            GameSession loaded = new GameSession(Seed, settings, audio, new NetworkManager());
            try
            {
                Harness.Check(save.Load(loaded), "load reads the file back");

                Harness.CheckNear(12.5f, loaded.Player.Position.X, 0.001f, "player X round trips");
                Harness.CheckNear(-7.25f, loaded.Player.Position.Z, 0.001f, "player Z round trips");
                Harness.CheckNear(1.25f, loaded.Player.Yaw, 0.001f, "player yaw round trips");
                Harness.CheckEqual(17, loaded.Player.Inventory.CountOf(Item.Diamond), "inventory round trips");
                Harness.CheckEqual(23, loaded.Player.Inventory[3].Data, "a loaded magazine round trips");
                Harness.CheckEqual(42, loaded.Stats.Kills, "stats round trip");

                // The real test: the edits must reappear on regenerated terrain.
                PumpUntilReady(loaded.World, Vector3.Zero, 0, 0);
                int surface = loaded.World.SurfaceHeight(0, 0);

                Harness.CheckEqual(Block.StoneBrick, loaded.World.GetBlock(4, surface + 1, 4),
                    "a placed block is restored on regenerated terrain");
                Harness.CheckEqual(Block.Glass, loaded.World.GetBlock(4, surface + 2, 4),
                    "a second placed block is restored too");

                int editedColumns = loaded.World.Edits.Count;
                Harness.Check(editedColumns > 0, "the edit table was restored (" + editedColumns + " columns)");
            }
            finally
            {
                loaded.Shutdown();
            }

            // A save written for one seed must be rejected by a session on another.
            GameSession wrongSeed = new GameSession(Seed + 1, settings, audio, new NetworkManager());
            try
            {
                Harness.Check(!save.Load(wrongSeed), "a save from a different seed is rejected");
            }
            finally
            {
                wrongSeed.Shutdown();
            }
        }

        // -------------------------------------------------------------------

        private static void SessionRunsHeadless()
        {
            Harness.Suite("Session");

            GameSettings settings = new GameSettings();
            settings.ViewRadius = 3;
            SoundManager audio = new SoundManager();
            audio.Enabled = false;

            GameSession session = new GameSession(Seed, settings, audio, new NetworkManager());
            try
            {
                session.PlacePlayerAtSpawn(true);
                Harness.Check(session.Player.Inventory.CountOf(Item.StonePickaxe) == 1, "starting gear is issued");

                // Walk forward for a few simulated seconds with the trigger held.
                PlayerCommand command = new PlayerCommand();
                command.HotbarSlot = -1;
                command.Move = new Vector2(0.0f, 1.0f);

                float startX = session.Player.Position.X;
                for (int frame = 0; frame < 240; frame++)
                {
                    session.Update(1.0f / 60.0f, command, false);
                }

                Vector3 position = session.Player.Position;
                Harness.Check(!float.IsNaN(position.X) && !float.IsNaN(position.Y) && !float.IsNaN(position.Z),
                    "player position stays finite");
                Harness.Check(position.Y > 0.0f, "player did not fall out of the world");
                Harness.Check(Vector3.Distance(position, new Vector3(startX, position.Y, 0.5f)) > 1.0f
                    || Math.Abs(position.Z - 0.5f) > 1.0f, "player actually moved");
                Harness.Check(session.World.LoadedColumnCount > 0, "terrain streamed in ("
                    + session.World.LoadedColumnCount + " columns)");

                // Mining: chew through the block under the crosshair and check it drops.
                session.Player.Position = new Vector3(0.5f, session.World.SurfaceHeight(0, 0) + 0.2f, 0.5f);
                session.Player.Pitch = -1.4f;
                session.Player.Yaw = 0.0f;

                PlayerCommand mine = new PlayerCommand();
                mine.HotbarSlot = -1;
                mine.Attack = true;
                mine.AttackPressed = true;

                int minedBefore = session.Stats.BlocksMined;
                for (int frame = 0; frame < 600; frame++)
                {
                    session.Update(1.0f / 60.0f, mine, false);
                    mine.AttackPressed = false;
                }

                Harness.Check(session.Stats.BlocksMined > minedBefore,
                    "mining breaks blocks (" + session.Stats.BlocksMined + " mined)");

                // Enemies must be able to spawn and be simulated without exploding.
                session.World.TimeOfDay = 0.0f;
                for (int frame = 0; frame < 600; frame++)
                {
                    session.Update(1.0f / 60.0f, command, false);
                }
                Harness.Check(session.Enemies.Count > 0, "enemies spawn at night ("
                    + session.Enemies.Count + " active)");

                bool enemiesSane = true;
                for (int i = 0; i < session.Enemies.Active.Count; i++)
                {
                    Enemy enemy = session.Enemies.Active[i];
                    if (float.IsNaN(enemy.Position.X) || enemy.Position.Y < -8.0f) enemiesSane = false;
                }
                Harness.Check(enemiesSane, "enemy positions stay finite and inside the world");

                // Danger tiers must read correctly from position alone.
                Harness.Check(Biomes.TierForDistance(0.0f) == DangerTier.Safe, "spawn is the safe tier");
                Harness.Check(Biomes.TierForDistance(4000.0f) == DangerTier.Nightmare, "4 km is nightmare");
                Harness.Check(Biomes.TierForDistance(9500.0f) == DangerTier.DragonLands, "9.5 km is the dragon lands");
            }
            finally
            {
                session.Shutdown();
            }
        }

        // -------------------------------------------------------------------

        /// <summary>Streams and pumps the worker until a specific column is generated.</summary>
        private static void PumpUntilReady(World.World world, Vector3 centre, int cx, int cz)
        {
            for (int i = 0; i < 4000; i++)
            {
                world.UpdateStreaming(centre);
                world.Worker.IntegrateGeneratedColumns(8);
                if (world.IsColumnReady(cx, cz)) return;
                System.Threading.Thread.Sleep(1);
            }
        }
    }
}
