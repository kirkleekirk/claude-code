using Microsoft.Xna.Framework;
using CastleMinerZ.Core;

namespace CastleMinerZ.World
{
    /// <summary>
    /// Growable vertex storage for one section's geometry. Recycled through
    /// <see cref="ChunkWorker"/> so meshing never allocates during play.
    /// </summary>
    public sealed class MeshBuilder
    {
        public VoxelVertex[] Opaque = new VoxelVertex[8192];
        public int OpaqueCount;

        public VoxelVertex[] Alpha = new VoxelVertex[2048];
        public int AlphaCount;

        public void Reset()
        {
            OpaqueCount = 0;
            AlphaCount = 0;
        }

        public void AddOpaque(ref VoxelVertex v)
        {
            if (OpaqueCount == Opaque.Length) Grow(ref Opaque);
            Opaque[OpaqueCount++] = v;
        }

        public void AddAlpha(ref VoxelVertex v)
        {
            if (AlphaCount == Alpha.Length) Grow(ref Alpha);
            Alpha[AlphaCount++] = v;
        }

        private static void Grow(ref VoxelVertex[] array)
        {
            VoxelVertex[] bigger = new VoxelVertex[array.Length * 2];
            System.Array.Copy(array, bigger, array.Length);
            array = bigger;
        }
    }

    /// <summary>
    /// Turns a 16x16x16 voxel section into triangles.
    ///
    /// The section is meshed from an 18-cubed padded snapshot rather than from live world
    /// data. The snapshot is taken on the main thread, so worker threads never race with
    /// block edits or column eviction, and every neighbour lookup inside the inner loop
    /// becomes a flat array index instead of a dictionary probe.
    ///
    /// Positions are emitted in quarter-block units, which still fits in a byte and buys
    /// sub-block geometry for torches and for the slightly sunken surface of water.
    /// </summary>
    public static class ChunkMesher
    {
        /// <summary>Edge length of the padded snapshot: 16 blocks plus one of margin each side.</summary>
        public const int Pad = 18;
        public const int PadArea = Pad * Pad;
        public const int PadVolume = Pad * Pad * Pad;

        /// <summary>Quarter-block units per block. Must match POSITION_SCALE in Voxel.fx.</summary>
        public const int Q = 4;

        private static readonly int[] NormalX = { -1, 1, 0, 0, 0, 0 };
        private static readonly int[] NormalY = { 0, 0, -1, 1, 0, 0 };
        private static readonly int[] NormalZ = { 0, 0, 0, 0, -1, 1 };

        /// <summary>
        /// Corner offsets per face, as 0/1 per axis, wound counter-clockwise seen from
        /// outside the block. Values of 0 map to the box minimum and 1 to the maximum,
        /// which is what lets the same table emit both full cubes and sub-blocks.
        /// </summary>
        private static readonly int[] Corners = new int[6 * 4 * 3]
        {
            // -X
            0,0,0,  0,0,1,  0,1,1,  0,1,0,
            // +X
            1,0,1,  1,0,0,  1,1,0,  1,1,1,
            // -Y
            0,0,0,  1,0,0,  1,0,1,  0,0,1,
            // +Y
            0,1,0,  0,1,1,  1,1,1,  1,1,0,
            // -Z
            1,0,0,  0,0,0,  0,1,0,  1,1,0,
            // +Z
            0,0,1,  1,0,1,  1,1,1,  0,1,1
        };

        private static readonly int[] UVs = new int[6 * 4 * 2]
        {
            0,1, 1,1, 1,0, 0,0,   // -X
            0,1, 1,1, 1,0, 0,0,   // +X
            0,0, 1,0, 1,1, 0,1,   // -Y
            0,0, 0,1, 1,1, 1,0,   // +Y
            0,1, 1,1, 1,0, 0,0,   // -Z
            0,1, 1,1, 1,0, 0,0    // +Z
        };

        /// <summary>Ambient occlusion strengths for the four occlusion counts, brightest first.</summary>
        private static readonly byte[] AoLevels = { 255, 204, 160, 122 };

        public static int PadIndex(int x, int y, int z)
        {
            return (y + 1) * PadArea + (z + 1) * Pad + (x + 1);
        }

        /// <summary>
        /// Copies a section plus a one-block margin out of the world.
        /// Main thread only; this is the hand-off point to the worker threads.
        /// </summary>
        public static void CaptureNeighbourhood(World world, Chunk section, byte[] blocks, byte[] light)
        {
            int baseX = section.Column.OriginX;
            int baseY = section.BaseY;
            int baseZ = section.Column.OriginZ;

            for (int y = -1; y <= Constants.ChunkSize; y++)
            {
                int wy = baseY + y;
                for (int z = -1; z <= Constants.ChunkSize; z++)
                {
                    int wz = baseZ + z;
                    int row = (y + 1) * PadArea + (z + 1) * Pad;

                    for (int x = -1; x <= Constants.ChunkSize; x++)
                    {
                        int wx = baseX + x;
                        int i = row + (x + 1);

                        if (wy < 0 || wy > Constants.MaxBlockY)
                        {
                            blocks[i] = wy < 0 ? Block.Stone : Block.Air;
                            light[i] = wy < 0 ? (byte)0 : Chunk.SkyLightByte;
                            continue;
                        }

                        ChunkColumn column = world.GetColumn(wx >> Constants.ChunkShift, wz >> Constants.ChunkShift);
                        if (column == null || column.State < ColumnState.Generated)
                        {
                            // Treat not-yet-streamed neighbours as solid so we do not emit a
                            // wall of faces that would pop away a moment later.
                            blocks[i] = Block.Stone;
                            light[i] = 0;
                            continue;
                        }

                        Chunk s = column.Sections[wy >> Constants.ChunkShift];
                        int lx = wx & Constants.ChunkMask;
                        int ly = wy & Constants.ChunkMask;
                        int lz = wz & Constants.ChunkMask;
                        blocks[i] = s.GetBlock(lx, ly, lz);
                        light[i] = s.GetLight(lx, ly, lz);
                    }
                }
            }
        }

        /// <summary>Builds geometry from a captured snapshot. Safe to call from a worker thread.</summary>
        public static void Build(byte[] blocks, byte[] light, MeshBuilder builder)
        {
            builder.Reset();

            for (int y = 0; y < Constants.ChunkSize; y++)
            {
                for (int z = 0; z < Constants.ChunkSize; z++)
                {
                    for (int x = 0; x < Constants.ChunkSize; x++)
                    {
                        byte id = blocks[PadIndex(x, y, z)];
                        if (id == Block.Air) continue;

                        BlockDefinition def = BlockRegistry.Get(id);

                        if (id == Block.Torch)
                        {
                            EmitBox(blocks, light, builder, def, x, y, z, 1, 0, 1, 3, 3, 3, true);
                            continue;
                        }

                        if (def.IsLiquid)
                        {
                            // Drop the surface a quarter block when nothing is on top, which
                            // is what makes shorelines read as water rather than as a solid
                            // coloured cube.
                            bool covered = blocks[PadIndex(x, y + 1, z)] == id;
                            int top = covered ? Q : Q - 1;
                            EmitBox(blocks, light, builder, def, x, y, z, 0, 0, 0, Q, top, Q, false);
                            continue;
                        }

                        EmitBox(blocks, light, builder, def, x, y, z, 0, 0, 0, Q, Q, Q, false);
                    }
                }
            }
        }

        /// <summary>
        /// Emits the visible faces of an axis-aligned box occupying part of one block cell.
        /// </summary>
        private static void EmitBox(byte[] blocks, byte[] light, MeshBuilder builder, BlockDefinition def,
            int x, int y, int z, int qx0, int qy0, int qz0, int qx1, int qy1, int qz1, bool allFaces)
        {
            byte selfId = def.Id;
            bool alpha = def.Layer == RenderLayer.Transparent;
            bool emissive = def.LightEmission > 0;
            byte tint = def.Tintable ? (byte)255 : (byte)0;

            for (int face = 0; face < 6; face++)
            {
                int nx = x + NormalX[face];
                int ny = y + NormalY[face];
                int nz = z + NormalZ[face];

                if (!allFaces)
                {
                    byte neighbour = blocks[PadIndex(nx, ny, nz)];
                    if (neighbour == selfId) continue;
                    if (BlockRegistry.Get(neighbour).IsOpaque) continue;
                }

                int tile = def.FaceTiles[face];
                int tileX = tile % BlockRegistry.AtlasTilesPerRow;
                int tileY = tile / BlockRegistry.AtlasTilesPerRow;

                int cornerBase = face * 12;
                int uvBase = face * 8;

                for (int c = 0; c < 4; c++)
                {
                    int ox = Corners[cornerBase + c * 3 + 0];
                    int oy = Corners[cornerBase + c * 3 + 1];
                    int oz = Corners[cornerBase + c * 3 + 2];

                    int px = x * Q + (ox == 0 ? qx0 : qx1);
                    int py = y * Q + (oy == 0 ? qy0 : qy1);
                    int pz = z * Q + (oz == 0 ? qz0 : qz1);

                    byte ao;
                    byte sky;
                    byte block;

                    if (emissive)
                    {
                        // Light emitters shade flat; occluding a torch against itself looks wrong.
                        ao = 255;
                        byte packed = light[PadIndex(x, y, z)];
                        sky = (byte)((packed >> 4) * 17);
                        block = (byte)((packed & 0x0F) * 17);
                    }
                    else
                    {
                        SampleCorner(blocks, light, x, y, z, face, ox, oy, oz, out ao, out sky, out block);
                    }

                    VoxelVertex v = new VoxelVertex(px, py, pz, face,
                        tileX, tileY,
                        UVs[uvBase + c * 2 + 0], UVs[uvBase + c * 2 + 1],
                        new Color(block, sky, tint, ao));

                    if (alpha) builder.AddAlpha(ref v); else builder.AddOpaque(ref v);
                }
            }
        }

        /// <summary>
        /// Classic voxel smooth lighting: for a face corner, look at the three cells that
        /// touch it on the outward side, count how many are opaque for ambient occlusion,
        /// and average the light of the ones that are not.
        /// </summary>
        private static void SampleCorner(byte[] blocks, byte[] light,
            int x, int y, int z, int face, int ox, int oy, int oz,
            out byte ao, out byte sky, out byte block)
        {
            int axis = face >> 1;

            int bx = x + NormalX[face];
            int by = y + NormalY[face];
            int bz = z + NormalZ[face];

            // The two tangent steps, signed by which corner of the face this is.
            int t1x = 0, t1y = 0, t1z = 0;
            int t2x = 0, t2y = 0, t2z = 0;

            if (axis == 0)
            {
                t1y = oy == 0 ? -1 : 1;
                t2z = oz == 0 ? -1 : 1;
            }
            else if (axis == 1)
            {
                t1x = ox == 0 ? -1 : 1;
                t2z = oz == 0 ? -1 : 1;
            }
            else
            {
                t1x = ox == 0 ? -1 : 1;
                t2y = oy == 0 ? -1 : 1;
            }

            int iBase = PadIndex(bx, by, bz);
            int iSide1 = PadIndex(bx + t1x, by + t1y, bz + t1z);
            int iSide2 = PadIndex(bx + t2x, by + t2y, bz + t2z);
            int iCorner = PadIndex(bx + t1x + t2x, by + t1y + t2y, bz + t1z + t2z);

            bool side1 = BlockRegistry.IsOpaque(blocks[iSide1]);
            bool side2 = BlockRegistry.IsOpaque(blocks[iSide2]);
            bool corner = BlockRegistry.IsOpaque(blocks[iCorner]);

            int occlusion;
            if (side1 && side2) occlusion = 3;
            else occlusion = (side1 ? 1 : 0) + (side2 ? 1 : 0) + (corner ? 1 : 0);
            ao = AoLevels[occlusion];

            int skySum = 0;
            int blockSum = 0;
            int count = 0;

            AccumulateLight(blocks, light, iBase, ref skySum, ref blockSum, ref count);
            if (!side1) AccumulateLight(blocks, light, iSide1, ref skySum, ref blockSum, ref count);
            if (!side2) AccumulateLight(blocks, light, iSide2, ref skySum, ref blockSum, ref count);
            if (!(side1 && side2) && !corner) AccumulateLight(blocks, light, iCorner, ref skySum, ref blockSum, ref count);

            if (count == 0)
            {
                byte packed = light[iBase];
                sky = (byte)((packed >> 4) * 17);
                block = (byte)((packed & 0x0F) * 17);
                return;
            }

            // *17 rescales a 0..15 level onto 0..255 exactly.
            sky = (byte)(skySum * 17 / count);
            block = (byte)(blockSum * 17 / count);
        }

        private static void AccumulateLight(byte[] blocks, byte[] light, int index,
            ref int skySum, ref int blockSum, ref int count)
        {
            if (BlockRegistry.IsOpaque(blocks[index])) return;
            byte packed = light[index];
            skySum += packed >> 4;
            blockSum += packed & 0x0F;
            count++;
        }
    }
}
