using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;

namespace CastleMinerZ.Graphics
{
    /// <summary>
    /// Sky dome, sun, moon and stars.
    ///
    /// The dome is a small vertex-coloured sphere whose colours are rewritten each frame
    /// from the world clock, drawn centred on the camera with depth writes off. That is far
    /// cheaper than a sky shader and it gives the terrain renderer the one value it needs
    /// back: the horizon colour, which doubles as the fog colour so distant chunks fade into
    /// the sky instead of into an arbitrary grey.
    /// </summary>
    public sealed class SkyRenderer
    {
        private const int Rings = 10;
        private const int Segments = 20;
        private const int StarCount = 220;

        private GraphicsDevice _device;
        private BasicEffect _effect;

        private VertexPositionColor[] _domeVertices;
        private short[] _domeIndices;
        private int _domeTriangles;

        private VertexPositionColor[] _starVertices;
        private short[] _starIndices;

        private Vector3[] _starDirections;

        /// <summary>Fog colour for the terrain pass. Updated every frame by <see cref="Update"/>.</summary>
        public Color HorizonColour { get; private set; }

        public Vector3 SunDirection { get; private set; }

        public void LoadContent(GraphicsDevice device)
        {
            _device = device;
            _effect = new BasicEffect(device);
            _effect.VertexColorEnabled = true;
            _effect.LightingEnabled = false;
            _effect.TextureEnabled = false;

            BuildDome();
            BuildStars();
        }

        private void BuildDome()
        {
            int vertexCount = (Rings + 1) * (Segments + 1);
            _domeVertices = new VertexPositionColor[vertexCount];
            _domeIndices = new short[Rings * Segments * 6];

            for (int ring = 0; ring <= Rings; ring++)
            {
                // -0.35..1 rather than -1..1: only a little of the dome is ever below the
                // horizon, and spending vertices down there is wasted.
                float v = ring / (float)Rings;
                float elevation = MathHelper.Lerp(-0.35f, 1.0f, v);
                float radius = (float)System.Math.Sqrt(System.Math.Max(0.0f, 1.0f - elevation * elevation));

                for (int segment = 0; segment <= Segments; segment++)
                {
                    float angle = segment / (float)Segments * MathHelper.TwoPi;
                    int index = ring * (Segments + 1) + segment;
                    _domeVertices[index] = new VertexPositionColor(
                        new Vector3(
                            (float)System.Math.Cos(angle) * radius,
                            elevation,
                            (float)System.Math.Sin(angle) * radius),
                        Color.White);
                }
            }

            int t = 0;
            for (int ring = 0; ring < Rings; ring++)
            {
                for (int segment = 0; segment < Segments; segment++)
                {
                    int a = ring * (Segments + 1) + segment;
                    int b = a + Segments + 1;

                    _domeIndices[t++] = (short)a;
                    _domeIndices[t++] = (short)(a + 1);
                    _domeIndices[t++] = (short)b;

                    _domeIndices[t++] = (short)(a + 1);
                    _domeIndices[t++] = (short)(b + 1);
                    _domeIndices[t++] = (short)b;
                }
            }
            _domeTriangles = t / 3;
        }

        private void BuildStars()
        {
            _starDirections = new Vector3[StarCount];
            _starVertices = new VertexPositionColor[StarCount * 4];
            _starIndices = new short[StarCount * 6];

            uint rng = 0xA5A5F00Du;
            for (int i = 0; i < StarCount; i++)
            {
                // Rejection-free spherical sampling, upper hemisphere only.
                rng ^= rng << 13; rng ^= rng >> 17; rng ^= rng << 5;
                float u = (rng >> 8) * (1.0f / 16777216.0f);
                rng ^= rng << 13; rng ^= rng >> 17; rng ^= rng << 5;
                float w = (rng >> 8) * (1.0f / 16777216.0f);

                float elevation = 0.05f + u * 0.95f;
                float radius = (float)System.Math.Sqrt(1.0f - elevation * elevation);
                float angle = w * MathHelper.TwoPi;

                _starDirections[i] = new Vector3(
                    (float)System.Math.Cos(angle) * radius,
                    elevation,
                    (float)System.Math.Sin(angle) * radius);

                int v = i * 4;
                int t = i * 6;
                _starIndices[t + 0] = (short)(v + 0);
                _starIndices[t + 1] = (short)(v + 1);
                _starIndices[t + 2] = (short)(v + 2);
                _starIndices[t + 3] = (short)(v + 0);
                _starIndices[t + 4] = (short)(v + 2);
                _starIndices[t + 5] = (short)(v + 3);
            }
        }

        /// <summary>Recolours the dome for the current time of day.</summary>
        public void Update(float timeOfDay)
        {
            float sunAngle = (timeOfDay - 0.25f) * MathHelper.TwoPi;
            Vector3 sun = new Vector3(
                (float)System.Math.Cos(sunAngle),
                (float)System.Math.Sin(sunAngle),
                0.28f);
            sun.Normalize();
            SunDirection = sun;

            float elevation = sun.Y;

            // Day factor ramps across the horizon rather than switching at it, which is what
            // produces a dawn and a dusk rather than a light switch.
            float day = MathHelper.Clamp((elevation + 0.18f) / 0.42f, 0.0f, 1.0f);
            // Twilight peaks when the sun is right at the horizon.
            float twilight = 1.0f - MathHelper.Clamp(System.Math.Abs(elevation) / 0.30f, 0.0f, 1.0f);

            Color nightZenith = new Color(5, 7, 20);
            Color dayZenith = new Color(74, 130, 214);
            Color nightHorizon = new Color(16, 20, 46);
            Color dayHorizon = new Color(168, 202, 238);
            Color duskHorizon = new Color(232, 128, 58);

            Color zenith = Blend(nightZenith, dayZenith, day);
            Color horizon = Blend(nightHorizon, dayHorizon, day);
            horizon = Blend(horizon, duskHorizon, twilight * 0.75f);

            HorizonColour = horizon;

            for (int ring = 0; ring <= Rings; ring++)
            {
                float v = ring / (float)Rings;
                // Squaring biases the gradient toward the horizon, where the eye is.
                float blend = v * v;
                Color colour = Blend(horizon, zenith, blend);

                for (int segment = 0; segment <= Segments; segment++)
                {
                    _domeVertices[ring * (Segments + 1) + segment].Color = colour;
                }
            }

            UpdateStars(1.0f - day);
        }

        private void UpdateStars(float nightFactor)
        {
            byte alpha = (byte)(MathHelper.Clamp(nightFactor * 1.4f - 0.25f, 0.0f, 1.0f) * 255.0f);

            for (int i = 0; i < StarCount; i++)
            {
                Vector3 direction = _starDirections[i];

                // Build a stable pair of tangents for the billboard.
                Vector3 right = Vector3.Cross(direction, Vector3.Up);
                if (right.LengthSquared() < 1e-5f) right = Vector3.Right;
                right.Normalize();
                Vector3 up = Vector3.Cross(right, direction);

                float size = 0.0025f + (i % 5) * 0.0009f;
                Vector3 centre = direction * 0.97f;
                Color colour = new Color((byte)255, (byte)255, (byte)245, alpha);

                int v = i * 4;
                _starVertices[v + 0] = new VertexPositionColor(centre - right * size + up * size, colour);
                _starVertices[v + 1] = new VertexPositionColor(centre + right * size + up * size, colour);
                _starVertices[v + 2] = new VertexPositionColor(centre + right * size - up * size, colour);
                _starVertices[v + 3] = new VertexPositionColor(centre - right * size - up * size, colour);
            }
        }

        private static Color Blend(Color a, Color b, float t)
        {
            t = MathHelper.Clamp(t, 0.0f, 1.0f);
            return new Color(
                (byte)MathHelper.Lerp(a.R, b.R, t),
                (byte)MathHelper.Lerp(a.G, b.G, t),
                (byte)MathHelper.Lerp(a.B, b.B, t));
        }

        public void Draw(Camera camera, float timeOfDay)
        {
            if (_effect == null) return;

            // Scaling the unit dome up and centring it on the camera means the sky never
            // clips the far plane and never moves relative to the player.
            float scale = camera.FarPlane * 0.5f;
            _effect.World = Matrix.CreateScale(scale) * Matrix.CreateTranslation(camera.Position);
            _effect.View = camera.View;
            _effect.Projection = camera.Projection;

            DepthStencilState previousDepth = _device.DepthStencilState;
            _device.DepthStencilState = DepthStencilState.None;
            _device.BlendState = BlendState.Opaque;
            _device.RasterizerState = RasterizerState.CullNone;

            for (int p = 0; p < _effect.CurrentTechnique.Passes.Count; p++)
            {
                _effect.CurrentTechnique.Passes[p].Apply();
                _device.DrawUserIndexedPrimitives(PrimitiveType.TriangleList,
                    _domeVertices, 0, _domeVertices.Length,
                    _domeIndices, 0, _domeTriangles);
            }

            DrawStars(camera, scale);
            DrawCelestialBodies(camera, scale);

            _device.RasterizerState = RasterizerState.CullCounterClockwise;
            _device.DepthStencilState = previousDepth;
        }

        private void DrawStars(Camera camera, float scale)
        {
            if (_starVertices[0].Color.A == 0) return;

            _device.BlendState = BlendState.AlphaBlend;
            for (int p = 0; p < _effect.CurrentTechnique.Passes.Count; p++)
            {
                _effect.CurrentTechnique.Passes[p].Apply();
                _device.DrawUserIndexedPrimitives(PrimitiveType.TriangleList,
                    _starVertices, 0, _starVertices.Length,
                    _starIndices, 0, StarCount * 2);
            }
            _device.BlendState = BlendState.Opaque;
        }

        private readonly VertexPositionColor[] _bodyVertices = new VertexPositionColor[8];
        private readonly short[] _bodyIndices = { 0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7 };

        private void DrawCelestialBodies(Camera camera, float scale)
        {
            BuildBody(0, SunDirection, 0.085f, new Color(255, 246, 214));
            BuildBody(4, -SunDirection, 0.06f, new Color(226, 230, 240));

            _device.BlendState = BlendState.AlphaBlend;
            for (int p = 0; p < _effect.CurrentTechnique.Passes.Count; p++)
            {
                _effect.CurrentTechnique.Passes[p].Apply();
                _device.DrawUserIndexedPrimitives(PrimitiveType.TriangleList,
                    _bodyVertices, 0, 8, _bodyIndices, 0, 4);
            }
            _device.BlendState = BlendState.Opaque;
        }

        private void BuildBody(int offset, Vector3 direction, float size, Color colour)
        {
            Vector3 right = Vector3.Cross(direction, Vector3.Up);
            if (right.LengthSquared() < 1e-5f) right = Vector3.Right;
            right.Normalize();
            Vector3 up = Vector3.Cross(right, direction);

            Vector3 centre = direction * 0.92f;
            _bodyVertices[offset + 0] = new VertexPositionColor(centre - right * size + up * size, colour);
            _bodyVertices[offset + 1] = new VertexPositionColor(centre + right * size + up * size, colour);
            _bodyVertices[offset + 2] = new VertexPositionColor(centre + right * size - up * size, colour);
            _bodyVertices[offset + 3] = new VertexPositionColor(centre - right * size - up * size, colour);
        }
    }
}
