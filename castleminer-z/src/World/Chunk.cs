using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;
using CastleMinerZ.Core;

namespace CastleMinerZ.World
{
    /// <summary>
    /// One 16x16x16 section of a column.
    ///
    /// Storage is lazy: a section that sits entirely above the column's terrain is left
    /// with null arrays and answers "air, full sunlight" for every query. Roughly half of
    /// a typical column is sky, so this halves the world's memory footprint for free --
    /// which matters a lot more on a 512 MB console than it would on a PC.
    /// </summary>
    public sealed class Chunk
    {
        /// <summary>Light byte for a section that is pure sky: sky level 15, no block light.</summary>
        public const byte SkyLightByte = 0xF0;

        public readonly ChunkColumn Column;
        public readonly int SectionY;

        /// <summary>Block ids, indexed by <see cref="Index"/>. Null means "all air".</summary>
        public byte[] Blocks;

        /// <summary>High nibble sky light, low nibble block light. Null means "full sky".</summary>
        public byte[] Light;

        /// <summary>Count of non-air blocks. Zero sections are skipped by the mesher entirely.</summary>
        public int SolidCount;

        /// <summary>Set when the geometry no longer matches the voxels.</summary>
        public bool MeshDirty;

        /// <summary>True while a worker thread owns this section's mesh job.</summary>
        public bool MeshQueued;

        /// <summary>
        /// Bumped on every edit. A mesh job records the version it started from; if the
        /// version has moved on by the time the job lands, the result is stale and the
        /// section is simply re-queued. That is what lets workers read live voxel data
        /// instead of copying a snapshot for every job.
        /// </summary>
        public int Version;

        // GPU residency. Terrain and water are separate buffers so water can be drawn
        // after everything else, back to front, with blending on.
        public VertexBuffer OpaqueVertices;
        public int OpaqueQuadCount;
        public VertexBuffer AlphaVertices;
        public int AlphaQuadCount;

        public BoundingBox Bounds;

        public Chunk(ChunkColumn column, int sectionY)
        {
            Column = column;
            SectionY = sectionY;

            Vector3 min = new Vector3(
                column.Cx * Constants.ChunkSize,
                sectionY * Constants.ChunkSize,
                column.Cz * Constants.ChunkSize);
            Bounds = new BoundingBox(min, min + new Vector3(Constants.ChunkSize));
        }

        public int BaseY
        {
            get { return SectionY * Constants.ChunkSize; }
        }

        /// <summary>True when there is nothing here to draw.</summary>
        public bool IsEmpty
        {
            get { return Blocks == null || SolidCount == 0; }
        }

        /// <summary>Packs a chunk-local coordinate into an array index. y is the outer axis so vertical scans stride nicely.</summary>
        public static int Index(int x, int y, int z)
        {
            return (y << 8) | (z << 4) | x;
        }

        public byte GetBlock(int x, int y, int z)
        {
            if (Blocks == null) return Block.Air;
            return Blocks[Index(x, y, z)];
        }

        public byte GetLight(int x, int y, int z)
        {
            if (Light == null) return SkyLightByte;
            return Light[Index(x, y, z)];
        }

        public byte GetSkyLight(int x, int y, int z)
        {
            if (Light == null) return Constants.MaxLight;
            return (byte)(Light[Index(x, y, z)] >> 4);
        }

        public byte GetBlockLight(int x, int y, int z)
        {
            if (Light == null) return 0;
            return (byte)(Light[Index(x, y, z)] & 0x0F);
        }

        public void SetSkyLight(int x, int y, int z, int level)
        {
            EnsureLight();
            int i = Index(x, y, z);
            Light[i] = (byte)((Light[i] & 0x0F) | (level << 4));
        }

        public void SetBlockLight(int x, int y, int z, int level)
        {
            EnsureLight();
            int i = Index(x, y, z);
            Light[i] = (byte)((Light[i] & 0xF0) | (level & 0x0F));
        }

        /// <summary>Writes a block and keeps <see cref="SolidCount"/> in step.</summary>
        public void SetBlock(int x, int y, int z, byte id)
        {
            EnsureBlocks();
            int i = Index(x, y, z);
            byte old = Blocks[i];
            if (old == id) return;
            if (old == Block.Air && id != Block.Air) SolidCount++;
            else if (old != Block.Air && id == Block.Air) SolidCount--;
            Blocks[i] = id;
        }

        /// <summary>Materialises the block array for a section that was pure sky.</summary>
        public void EnsureBlocks()
        {
            if (Blocks == null)
            {
                Blocks = Pools.SectionBytes.Rent();
                SolidCount = 0;
            }
        }

        /// <summary>Materialises the light array, seeding it with full sunlight to match the lazy default.</summary>
        public void EnsureLight()
        {
            if (Light == null)
            {
                Light = Pools.SectionBytes.Rent();
                for (int i = 0; i < Light.Length; i++) Light[i] = SkyLightByte;
            }
        }

        /// <summary>Drops GPU buffers. Safe to call repeatedly.</summary>
        public void ReleaseGraphics()
        {
            if (OpaqueVertices != null)
            {
                OpaqueVertices.Dispose();
                OpaqueVertices = null;
            }
            if (AlphaVertices != null)
            {
                AlphaVertices.Dispose();
                AlphaVertices = null;
            }
            OpaqueQuadCount = 0;
            AlphaQuadCount = 0;
        }

        /// <summary>Returns pooled storage and GPU buffers. The section must not be used afterwards.</summary>
        public void Release()
        {
            ReleaseGraphics();
            if (Blocks != null)
            {
                Pools.SectionBytes.Return(Blocks);
                Blocks = null;
            }
            if (Light != null)
            {
                Pools.SectionBytes.Return(Light);
                Light = null;
            }
            SolidCount = 0;
        }
    }
}
