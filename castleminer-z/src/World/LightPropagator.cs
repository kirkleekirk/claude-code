using System.Collections.Generic;

namespace CastleMinerZ.World
{
    /// <summary>
    /// Flood-fill lighting for sky light and block light.
    ///
    /// Two independent 4-bit channels per voxel. Sky light is seeded by a top-down pass
    /// per column and then spread sideways so overhangs and cave mouths fall off smoothly;
    /// block light is seeded from emitters like torches and lava. The mesher bakes both
    /// levels into vertex colours and the shader scales the sky channel by the current sun
    /// intensity, so a full day/night cycle costs no re-meshing at all.
    ///
    /// Main thread only -- it walks across column boundaries, and the workers are reading
    /// the same arrays.
    /// </summary>
    public sealed class LightPropagator
    {
        private struct Node
        {
            public int X;
            public int Y;
            public int Z;
            public byte Level;

            public Node(int x, int y, int z, byte level)
            {
                X = x;
                Y = y;
                Z = z;
                Level = level;
            }
        }

        private readonly World _world;
        private readonly Queue<Node> _add = new Queue<Node>(4096);
        private readonly Queue<Node> _remove = new Queue<Node>(1024);

        private static readonly int[] OffsetX = { -1, 1, 0, 0, 0, 0 };
        private static readonly int[] OffsetY = { 0, 0, -1, 1, 0, 0 };
        private static readonly int[] OffsetZ = { 0, 0, 0, 0, -1, 1 };

        public LightPropagator(World world)
        {
            _world = world;
        }

        /// <summary>
        /// Initial lighting for a newly generated column: a vertical sunlight pass, then a
        /// spread from anything that borders a darker cell, then block-light emitters.
        /// </summary>
        public void LightColumn(ChunkColumn column)
        {
            int originX = column.OriginX;
            int originZ = column.OriginZ;

            // Sunlight straight down. Fully transparent blocks cost nothing, water and
            // leaves attenuate, opaque blocks stop it dead.
            for (int lz = 0; lz < Constants.ChunkSize; lz++)
            {
                for (int lx = 0; lx < Constants.ChunkSize; lx++)
                {
                    int level = Constants.MaxLight;
                    for (int y = Constants.MaxBlockY; y >= 0; y--)
                    {
                        byte id = column.GetBlock(lx, y, lz);
                        BlockDefinition def = BlockRegistry.Get(id);

                        if (def.IsOpaque)
                        {
                            level = 0;
                        }
                        else
                        {
                            int loss = def.LightAttenuation - 1;
                            if (loss > 0) level -= loss;
                            if (level < 0) level = 0;
                        }

                        // A section with no light array means "unallocated, and therefore
                        // pure sky". That shortcut is only true above the terrain, so the
                        // write is skipped only while the level is still a full 15 -- which
                        // is exactly the stretch above the first block that blocks or
                        // attenuates light. Everything from there down is written, and
                        // allocating the array fills it with full sky first, so the cells
                        // above in the same section stay correct.
                        Chunk section = column.Sections[y >> Constants.ChunkShift];
                        if (level != Constants.MaxLight || section.Light != null)
                        {
                            section.SetSkyLight(lx, y & Constants.ChunkMask, lz, level);
                        }

                        if (level > 0) _add.Enqueue(new Node(originX + lx, y, originZ + lz, (byte)level));
                    }
                }
            }

            SpreadSky();

            // Block-light emitters.
            for (int lz = 0; lz < Constants.ChunkSize; lz++)
            {
                for (int lx = 0; lx < Constants.ChunkSize; lx++)
                {
                    for (int y = 0; y <= Constants.MaxBlockY; y++)
                    {
                        byte id = column.GetBlock(lx, y, lz);
                        if (id == Block.Air) continue;
                        byte emission = BlockRegistry.Get(id).LightEmission;
                        if (emission == 0) continue;

                        column.Sections[y >> Constants.ChunkShift]
                            .SetBlockLight(lx, y & Constants.ChunkMask, lz, emission);
                        _add.Enqueue(new Node(originX + lx, y, originZ + lz, emission));
                    }
                }
            }

            SpreadBlock();
        }

        /// <summary>Re-lights the neighbourhood of a single edited block.</summary>
        public void OnBlockChanged(int x, int y, int z, byte oldId, byte newId)
        {
            BlockDefinition oldDef = BlockRegistry.Get(oldId);
            BlockDefinition newDef = BlockRegistry.Get(newId);

            // --- Block light ---
            if (oldDef.LightEmission > 0)
            {
                byte level = _world.GetBlockLight(x, y, z);
                _world.SetBlockLight(x, y, z, 0);
                _remove.Enqueue(new Node(x, y, z, level));
                UnspreadBlock();
            }

            if (newDef.IsOpaque && !oldDef.IsOpaque)
            {
                byte level = _world.GetBlockLight(x, y, z);
                if (level > 0)
                {
                    _world.SetBlockLight(x, y, z, 0);
                    _remove.Enqueue(new Node(x, y, z, level));
                    UnspreadBlock();
                }
            }

            if (newDef.LightEmission > 0)
            {
                _world.SetBlockLight(x, y, z, newDef.LightEmission);
                _add.Enqueue(new Node(x, y, z, newDef.LightEmission));
            }
            else if (!newDef.IsOpaque)
            {
                // Opening a hole: pull light in from whatever is already lit around it.
                for (int f = 0; f < 6; f++)
                {
                    int nx = x + OffsetX[f];
                    int ny = y + OffsetY[f];
                    int nz = z + OffsetZ[f];
                    byte nl = _world.GetBlockLight(nx, ny, nz);
                    if (nl > 1) _add.Enqueue(new Node(nx, ny, nz, nl));
                }
            }
            SpreadBlock();

            // --- Sky light ---
            RelightSkyColumn(x, z);
        }

        /// <summary>
        /// Recomputes the vertical sunlight strip at one x/z and queues the differences.
        /// Cells that got darker seed a removal pass, cells that got brighter seed a spread.
        /// </summary>
        private void RelightSkyColumn(int x, int z)
        {
            ChunkColumn column = _world.GetColumnAtWorld(x, z);
            if (column == null) return;

            int lx = x & Constants.ChunkMask;
            int lz = z & Constants.ChunkMask;

            int level = Constants.MaxLight;
            for (int y = Constants.MaxBlockY; y >= 0; y--)
            {
                byte id = column.GetBlock(lx, y, lz);
                BlockDefinition def = BlockRegistry.Get(id);

                if (def.IsOpaque)
                {
                    level = 0;
                }
                else
                {
                    int loss = def.LightAttenuation - 1;
                    if (loss > 0) level -= loss;
                    if (level < 0) level = 0;
                }

                Chunk section = column.Sections[y >> Constants.ChunkShift];
                int ly = y & Constants.ChunkMask;
                int existing = section.GetSkyLight(lx, ly, lz);

                if (existing > level)
                {
                    section.SetSkyLight(lx, ly, lz, 0);
                    _remove.Enqueue(new Node(x, y, z, (byte)existing));
                }
                else if (level > existing)
                {
                    section.SetSkyLight(lx, ly, lz, level);
                }

                if (level > 0) _add.Enqueue(new Node(x, y, z, (byte)level));
            }

            UnspreadSky();
            SpreadSky();
        }

        // ---- Flood fill ---------------------------------------------------------

        private void SpreadBlock()
        {
            while (_add.Count > 0)
            {
                Node n = _add.Dequeue();
                if (n.Level <= 1) continue;

                for (int f = 0; f < 6; f++)
                {
                    int nx = n.X + OffsetX[f];
                    int ny = n.Y + OffsetY[f];
                    int nz = n.Z + OffsetZ[f];
                    if (ny < 0 || ny > Constants.MaxBlockY) continue;

                    BlockDefinition def = BlockRegistry.Get(_world.GetBlock(nx, ny, nz));
                    if (def.IsOpaque) continue;

                    int target = n.Level - (def.LightAttenuation < 1 ? 1 : def.LightAttenuation);
                    if (target <= 0) continue;
                    if (_world.GetBlockLight(nx, ny, nz) >= target) continue;

                    _world.SetBlockLight(nx, ny, nz, target);
                    _world.MarkSectionDirty(nx, ny, nz);
                    _add.Enqueue(new Node(nx, ny, nz, (byte)target));
                }
            }
        }

        private void UnspreadBlock()
        {
            while (_remove.Count > 0)
            {
                Node n = _remove.Dequeue();

                for (int f = 0; f < 6; f++)
                {
                    int nx = n.X + OffsetX[f];
                    int ny = n.Y + OffsetY[f];
                    int nz = n.Z + OffsetZ[f];
                    if (ny < 0 || ny > Constants.MaxBlockY) continue;

                    byte nl = _world.GetBlockLight(nx, ny, nz);
                    if (nl == 0) continue;

                    if (nl < n.Level)
                    {
                        _world.SetBlockLight(nx, ny, nz, 0);
                        _world.MarkSectionDirty(nx, ny, nz);
                        _remove.Enqueue(new Node(nx, ny, nz, nl));
                    }
                    else
                    {
                        // This neighbour is lit by something else; it becomes a new source.
                        _add.Enqueue(new Node(nx, ny, nz, nl));
                    }
                }
            }
        }

        private void SpreadSky()
        {
            while (_add.Count > 0)
            {
                Node n = _add.Dequeue();
                if (n.Level <= 1) continue;

                for (int f = 0; f < 6; f++)
                {
                    int nx = n.X + OffsetX[f];
                    int ny = n.Y + OffsetY[f];
                    int nz = n.Z + OffsetZ[f];
                    if (ny < 0 || ny > Constants.MaxBlockY) continue;

                    BlockDefinition def = BlockRegistry.Get(_world.GetBlockForMesh(nx, ny, nz));
                    if (def.IsOpaque) continue;

                    // Sunlight falls straight down at full strength; every other direction
                    // costs at least one level. That is what makes a vertical shaft stay
                    // bright all the way to the bottom.
                    int cost = def.LightAttenuation < 1 ? 1 : def.LightAttenuation;
                    int target;
                    if (f == 2 && n.Level == Constants.MaxLight && def.LightAttenuation <= 1)
                        target = Constants.MaxLight;
                    else
                        target = n.Level - cost;

                    if (target <= 0) continue;
                    if (_world.GetSkyLight(nx, ny, nz) >= target) continue;

                    _world.SetSkyLight(nx, ny, nz, target);
                    _world.MarkSectionDirty(nx, ny, nz);
                    _add.Enqueue(new Node(nx, ny, nz, (byte)target));
                }
            }
        }

        private void UnspreadSky()
        {
            while (_remove.Count > 0)
            {
                Node n = _remove.Dequeue();

                for (int f = 0; f < 6; f++)
                {
                    int nx = n.X + OffsetX[f];
                    int ny = n.Y + OffsetY[f];
                    int nz = n.Z + OffsetZ[f];
                    if (ny < 0 || ny > Constants.MaxBlockY) continue;

                    byte nl = _world.GetSkyLight(nx, ny, nz);
                    if (nl == 0) continue;

                    if (nl < n.Level || (f == 2 && nl == Constants.MaxLight && n.Level == Constants.MaxLight))
                    {
                        _world.SetSkyLight(nx, ny, nz, 0);
                        _world.MarkSectionDirty(nx, ny, nz);
                        _remove.Enqueue(new Node(nx, ny, nz, nl));
                    }
                    else
                    {
                        _add.Enqueue(new Node(nx, ny, nz, nl));
                    }
                }
            }
        }
    }
}
