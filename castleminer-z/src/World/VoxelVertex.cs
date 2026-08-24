using System.Runtime.InteropServices;
using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;
using Microsoft.Xna.Framework.Graphics.PackedVector;

namespace CastleMinerZ.World
{
    /// <summary>
    /// Packed terrain vertex: 12 bytes instead of the 36 a naive
    /// position/normal/uv/colour layout would cost.
    ///
    /// At a full view radius the world is a few million vertices, so the difference is
    /// tens of megabytes of vertex buffer on a console that only has 512 MB in total --
    /// and the 360's vertex fetch is bandwidth bound, so the small format is faster too.
    ///
    /// Positions are chunk-local (0..16), which is why a byte is enough; the shader adds
    /// the chunk origin. UVs are a tile index plus a 0/1 corner, expanded in the shader.
    /// </summary>
    [StructLayout(LayoutKind.Sequential, Pack = 1)]
    public struct VoxelVertex : IVertexType
    {
        /// <summary>xyz = block position within the section (0..16). w = face index, for the shader's normal table.</summary>
        public Byte4 Position;

        /// <summary>x,y = atlas tile column/row. z,w = 0/1 corner selector within the tile.</summary>
        public Byte4 TileCorner;

        /// <summary>rgb = baked light colour (sky + block light), a = ambient occlusion.</summary>
        public Color Light;

        public static readonly VertexDeclaration Declaration = new VertexDeclaration(
            new VertexElement(0, VertexElementFormat.Byte4, VertexElementUsage.Position, 0),
            new VertexElement(4, VertexElementFormat.Byte4, VertexElementUsage.TextureCoordinate, 0),
            new VertexElement(8, VertexElementFormat.Color, VertexElementUsage.Color, 0));

        public const int SizeInBytes = 12;

        VertexDeclaration IVertexType.VertexDeclaration
        {
            get { return Declaration; }
        }

        public VoxelVertex(int x, int y, int z, int face, int tileX, int tileY, int cornerU, int cornerV, Color light)
        {
            Position = new Byte4((float)x, (float)y, (float)z, (float)face);
            TileCorner = new Byte4((float)tileX, (float)tileY, (float)cornerU, (float)cornerV);
            Light = light;
        }
    }
}
