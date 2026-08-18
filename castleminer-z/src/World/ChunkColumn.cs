using System.Collections.Generic;
using CastleMinerZ.Core;

namespace CastleMinerZ.World
{
    /// <summary>Where a column is in the load pipeline. Only the main thread advances this.</summary>
    public enum ColumnState
    {
        /// <summary>Allocated but nothing generated yet.</summary>
        Empty = 0,
        /// <summary>Sitting in the worker queue.</summary>
        Queued = 1,
        /// <summary>A worker thread is filling in terrain.</summary>
        Generating = 2,
        /// <summary>Terrain and lighting done; sections still need meshing.</summary>
        Generated = 3,
        /// <summary>Fully meshed and drawable.</summary>
        Ready = 4,
        /// <summary>Scheduled for eviction; ignore it.</summary>
        Unloading = 5
    }

    /// <summary>
    /// A 16x16 column of the world, full height.
    ///
    /// Columns are the unit of streaming and of saving: terrain generation runs per
    /// column (it needs the whole vertical span for caves and ore), and the save file
    /// only stores the blocks the player changed rather than the generated terrain,
    /// which keeps a large explored world down to a few hundred kilobytes.
    /// </summary>
    public sealed class ChunkColumn
    {
        public readonly int Cx;
        public readonly int Cz;
        public readonly Chunk[] Sections;

        public volatile ColumnState State;

        /// <summary>Per-XZ height of the highest non-air block, +1. Used by lighting and spawning.</summary>
        public byte[] Heights;

        /// <summary>Highest value in <see cref="Heights"/>; sections above this stay unallocated.</summary>
        public int MaxHeight;

        /// <summary>
        /// Player edits for this column, keyed by packed local index.
        ///
        /// The dictionary is owned by <see cref="World"/>, not by the column: a column that
        /// streams out of range is thrown away, and a base built at the edge of the view
        /// distance must not go with it. This is only a reference to the shared table.
        /// Null until the player changes something here, so untouched terrain costs nothing.
        /// </summary>
        public Dictionary<int, byte> Edits;

        /// <summary>
        /// Foliage colour for this column, taken from the biome at its centre and applied
        /// per draw call. Grass and leaves ship as grey textures and get tinted here, so one
        /// atlas tile serves every biome.
        /// </summary>
        public Microsoft.Xna.Framework.Vector3 FoliageTint = Microsoft.Xna.Framework.Vector3.One;

        public ChunkColumn(int cx, int cz)
        {
            Cx = cx;
            Cz = cz;
            Sections = new Chunk[Constants.SectionsPerColumn];
            for (int i = 0; i < Sections.Length; i++) Sections[i] = new Chunk(this, i);
            Heights = Pools.ColumnHeights.Rent();
            State = ColumnState.Empty;
        }

        public static long Key(int cx, int cz)
        {
            return ((long)(uint)cx << 32) | (uint)cz;
        }

        public long Key_
        {
            get { return Key(Cx, Cz); }
        }

        public int OriginX
        {
            get { return Cx * Constants.ChunkSize; }
        }

        public int OriginZ
        {
            get { return Cz * Constants.ChunkSize; }
        }

        /// <summary>Section containing world Y, or null if Y is out of the world.</summary>
        public Chunk SectionAt(int worldY)
        {
            if (worldY < 0 || worldY > Constants.MaxBlockY) return null;
            return Sections[worldY >> Constants.ChunkShift];
        }

        /// <summary>Reads a block by column-local x/z (0..15) and world y.</summary>
        public byte GetBlock(int lx, int worldY, int lz)
        {
            if (worldY < 0 || worldY > Constants.MaxBlockY) return Block.Air;
            return Sections[worldY >> Constants.ChunkShift].GetBlock(lx, worldY & Constants.ChunkMask, lz);
        }

        public void SetBlock(int lx, int worldY, int lz, byte id)
        {
            if (worldY < 0 || worldY > Constants.MaxBlockY) return;
            Sections[worldY >> Constants.ChunkShift].SetBlock(lx, worldY & Constants.ChunkMask, lz, id);
        }

        public byte GetLight(int lx, int worldY, int lz)
        {
            if (worldY < 0) return 0;
            if (worldY > Constants.MaxBlockY) return Chunk.SkyLightByte;
            return Sections[worldY >> Constants.ChunkShift].GetLight(lx, worldY & Constants.ChunkMask, lz);
        }

        public int HeightAt(int lx, int lz)
        {
            return Heights[(lz << Constants.ChunkShift) | lx];
        }

        /// <summary>Packs a column-local coordinate into an edit-table key.</summary>
        public static int EditKey(int lx, int worldY, int lz)
        {
            return (worldY << 8) | (lz << 4) | lx;
        }

        /// <summary>Replays stored edits over freshly generated terrain.</summary>
        public void ApplyEdits()
        {
            if (Edits == null) return;
            foreach (KeyValuePair<int, byte> e in Edits)
            {
                int lx = e.Key & 0x0F;
                int lz = (e.Key >> 4) & 0x0F;
                int y = e.Key >> 8;
                if (y < 0 || y > Constants.MaxBlockY) continue;
                SetBlock(lx, y, lz, e.Value);
            }
        }

        /// <summary>Rebuilds the heightmap from the voxel data.</summary>
        public void RecomputeHeights()
        {
            MaxHeight = 0;
            for (int lz = 0; lz < Constants.ChunkSize; lz++)
            {
                for (int lx = 0; lx < Constants.ChunkSize; lx++)
                {
                    int h = 0;
                    for (int y = Constants.MaxBlockY; y >= 0; y--)
                    {
                        byte b = GetBlock(lx, y, lz);
                        if (b != Block.Air && !BlockRegistry.Get(b).IsLiquid)
                        {
                            h = y + 1;
                            break;
                        }
                    }
                    Heights[(lz << Constants.ChunkShift) | lx] = (byte)h;
                    if (h > MaxHeight) MaxHeight = h;
                }
            }
        }

        /// <summary>Updates the heightmap for one column of blocks after an edit.</summary>
        public void RefreshHeight(int lx, int lz)
        {
            int h = 0;
            for (int y = Constants.MaxBlockY; y >= 0; y--)
            {
                byte b = GetBlock(lx, y, lz);
                if (b != Block.Air && !BlockRegistry.Get(b).IsLiquid)
                {
                    h = y + 1;
                    break;
                }
            }
            Heights[(lz << Constants.ChunkShift) | lx] = (byte)h;
            if (h > MaxHeight) MaxHeight = h;
        }

        public void MarkAllSectionsDirty()
        {
            for (int i = 0; i < Sections.Length; i++) Sections[i].MeshDirty = true;
        }

        /// <summary>Returns all pooled storage and GPU buffers held by this column.</summary>
        public void Release()
        {
            for (int i = 0; i < Sections.Length; i++) Sections[i].Release();
            if (Heights != null)
            {
                Pools.ColumnHeights.Return(Heights);
                Heights = null;
            }
            // Deliberately not cleared: the dictionary belongs to the world's edit table.
            Edits = null;
        }
    }
}
