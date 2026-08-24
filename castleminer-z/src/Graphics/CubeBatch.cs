using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;

namespace CastleMinerZ.Graphics
{
    /// <summary>
    /// Accumulates axis-aligned and yaw-rotated boxes and draws them in one call.
    ///
    /// Every creature, dropped item and remote player in the game is built from boxes, so
    /// they all go through here. Batching matters more than geometry count on the 360: a
    /// horde of thirty zombies is about a thousand quads, which is nothing, but thirty
    /// separate draw calls with state changes between them is not.
    /// </summary>
    public sealed class CubeBatch
    {
        private const int MaxQuads = 3072;

        private readonly VertexPositionColorTexture[] _vertices = new VertexPositionColorTexture[MaxQuads * 4];
        private readonly short[] _indices = new short[MaxQuads * 6];
        private int _quadCount;

        private GraphicsDevice _device;
        private BasicEffect _effect;

        /// <summary>Per-face shading, matching the terrain shader so entities sit in the same light.</summary>
        private static readonly float[] FaceShade = { 0.72f, 0.72f, 0.52f, 1.0f, 0.86f, 0.86f };

        // Unit-cube corners per face, wound counter-clockwise from outside.
        private static readonly float[] Corners =
        {
            0,0,0,  0,0,1,  0,1,1,  0,1,0,   // -X
            1,0,1,  1,0,0,  1,1,0,  1,1,1,   // +X
            0,0,0,  1,0,0,  1,0,1,  0,0,1,   // -Y
            0,1,0,  0,1,1,  1,1,1,  1,1,0,   // +Y
            1,0,0,  0,0,0,  0,1,0,  1,1,0,   // -Z
            0,0,1,  1,0,1,  1,1,1,  0,1,1    // +Z
        };

        private static readonly float[] FaceUV =
        {
            0,1, 1,1, 1,0, 0,0,
            0,1, 1,1, 1,0, 0,0,
            0,0, 1,0, 1,1, 0,1,
            0,0, 0,1, 1,1, 1,0,
            0,1, 1,1, 1,0, 0,0,
            0,1, 1,1, 1,0, 0,0
        };

        public CubeBatch()
        {
            // 0,2,1 / 0,3,2 rather than 0,1,2 / 0,2,3: the corner table below is authored
            // counter-clockwise from outside, which is back-facing under the default cull
            // mode. Reversing the triangles here keeps the table readable. Same reasoning as
            // WorldRenderer.BuildSharedIndexBuffer.
            for (int q = 0; q < MaxQuads; q++)
            {
                int v = q * 4;
                int i = q * 6;
                _indices[i + 0] = (short)(v + 0);
                _indices[i + 1] = (short)(v + 2);
                _indices[i + 2] = (short)(v + 1);
                _indices[i + 3] = (short)(v + 0);
                _indices[i + 4] = (short)(v + 3);
                _indices[i + 5] = (short)(v + 2);
            }
        }

        public void LoadContent(GraphicsDevice device)
        {
            _device = device;
            _effect = new BasicEffect(device);
            _effect.VertexColorEnabled = true;
            _effect.LightingEnabled = false;
            _effect.TextureEnabled = false;
        }

        public void Begin()
        {
            _quadCount = 0;
        }

        /// <summary>
        /// Adds a box centred on <paramref name="centre"/> in XZ and rising from its base,
        /// rotated about Y by <paramref name="yaw"/>.
        /// </summary>
        public void AddBox(Vector3 centre, Vector3 size, float yaw, Color colour, float brightness)
        {
            if (_quadCount + 6 > MaxQuads) return;

            float sin = (float)System.Math.Sin(yaw);
            float cos = (float)System.Math.Cos(yaw);

            for (int face = 0; face < 6; face++)
            {
                float shade = FaceShade[face] * brightness;
                Color faceColour = new Color(
                    (byte)(colour.R * shade),
                    (byte)(colour.G * shade),
                    (byte)(colour.B * shade),
                    colour.A);

                int cornerBase = face * 12;
                int uvBase = face * 8;
                int v = _quadCount * 4;

                for (int c = 0; c < 4; c++)
                {
                    // Corner offsets are 0/1; map onto the box extents, then rotate.
                    float lx = (Corners[cornerBase + c * 3 + 0] - 0.5f) * size.X;
                    float ly = Corners[cornerBase + c * 3 + 1] * size.Y;
                    float lz = (Corners[cornerBase + c * 3 + 2] - 0.5f) * size.Z;

                    Vector3 position = new Vector3(
                        centre.X + lx * cos + lz * sin,
                        centre.Y + ly,
                        centre.Z - lx * sin + lz * cos);

                    _vertices[v + c] = new VertexPositionColorTexture(position, faceColour,
                        new Vector2(FaceUV[uvBase + c * 2 + 0], FaceUV[uvBase + c * 2 + 1]));
                }

                _quadCount++;
            }
        }

        /// <summary>Adds a box whose faces all sample one atlas tile.</summary>
        public void AddTexturedBox(Vector3 centre, Vector3 size, float yaw, Color colour, float brightness,
            int tileIndex, int tilesPerRow)
        {
            if (_quadCount + 6 > MaxQuads) return;

            int start = _quadCount;
            AddBox(centre, size, yaw, colour, brightness);

            float tileSize = 1.0f / tilesPerRow;
            float inset = tileSize * 0.02f;
            float u0 = (tileIndex % tilesPerRow) * tileSize + inset;
            float v0 = (tileIndex / tilesPerRow) * tileSize + inset;
            float span = tileSize - inset * 2.0f;

            for (int q = start; q < _quadCount; q++)
            {
                for (int c = 0; c < 4; c++)
                {
                    int index = q * 4 + c;
                    Vector2 uv = _vertices[index].TextureCoordinate;
                    _vertices[index].TextureCoordinate = new Vector2(u0 + uv.X * span, v0 + uv.Y * span);
                }
            }
        }

        public void End(Matrix view, Matrix projection, Texture2D texture)
        {
            if (_effect == null || _quadCount == 0) return;

            _effect.View = view;
            _effect.Projection = projection;
            _effect.World = Matrix.Identity;
            _effect.TextureEnabled = texture != null;
            _effect.Texture = texture;

            _device.BlendState = BlendState.AlphaBlend;
            _device.DepthStencilState = DepthStencilState.Default;
            _device.RasterizerState = RasterizerState.CullCounterClockwise;
            if (texture != null) _device.SamplerStates[0] = SamplerState.PointClamp;

            for (int p = 0; p < _effect.CurrentTechnique.Passes.Count; p++)
            {
                _effect.CurrentTechnique.Passes[p].Apply();
                _device.DrawUserIndexedPrimitives(PrimitiveType.TriangleList,
                    _vertices, 0, _quadCount * 4,
                    _indices, 0, _quadCount * 2);
            }

            _device.BlendState = BlendState.Opaque;
            _quadCount = 0;
        }
    }
}
