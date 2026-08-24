using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;
using CastleMinerZ.World;

namespace CastleMinerZ.Graphics
{
    /// <summary>
    /// Billboarded particles for mining dust, blood, muzzle flash, fire and explosions.
    ///
    /// Fixed capacity, one array, one draw call. The whole system is deliberately a single
    /// <see cref="DrawUserIndexedPrimitives"/> of camera-facing quads: on the 360 the cost
    /// of particles is almost entirely draw-call overhead, not fill rate, at these sizes.
    /// </summary>
    public sealed class ParticleSystem
    {
        private struct Particle
        {
            public bool Alive;
            public Vector3 Position;
            public Vector3 Velocity;
            public Color Colour;
            public float Size;
            public float Life;
            public float MaxLife;
            public float Gravity;
            public bool Collides;
        }

        public const int Capacity = 384;

        private readonly Particle[] _particles = new Particle[Capacity];
        private readonly VertexPositionColorTexture[] _vertices = new VertexPositionColorTexture[Capacity * 4];
        private readonly short[] _indices = new short[Capacity * 6];

        private int _next;
        private uint _rng = 0x12345678u;

        private Texture2D _texture;
        private BasicEffect _effect;

        /// <summary>Throttles continuous emitters like mining dust.</summary>
        private float _dustAccumulator;

        public int LiveCount;

        public ParticleSystem()
        {
            for (int i = 0; i < Capacity; i++)
            {
                int v = i * 4;
                int t = i * 6;
                _indices[t + 0] = (short)(v + 0);
                _indices[t + 1] = (short)(v + 1);
                _indices[t + 2] = (short)(v + 2);
                _indices[t + 3] = (short)(v + 0);
                _indices[t + 4] = (short)(v + 2);
                _indices[t + 5] = (short)(v + 3);
            }
        }

        public void LoadContent(GraphicsDevice device, Texture2D particleTexture)
        {
            _texture = particleTexture;
            _effect = new BasicEffect(device);
            _effect.TextureEnabled = true;
            _effect.VertexColorEnabled = true;
            _effect.LightingEnabled = false;
            _effect.Texture = particleTexture;
        }

        private float NextFloat()
        {
            _rng ^= _rng << 13;
            _rng ^= _rng >> 17;
            _rng ^= _rng << 5;
            return (_rng >> 8) * (1.0f / 16777216.0f);
        }

        private float Symmetric()
        {
            return NextFloat() * 2.0f - 1.0f;
        }

        private int Allocate()
        {
            for (int i = 0; i < Capacity; i++)
            {
                int index = (_next + i) % Capacity;
                if (!_particles[index].Alive)
                {
                    _next = (index + 1) % Capacity;
                    return index;
                }
            }
            // Full: steal the next slot so recent effects always show.
            int fallback = _next;
            _next = (_next + 1) % Capacity;
            return fallback;
        }

        private void Emit(Vector3 position, Vector3 velocity, Color colour, float size, float life, float gravity, bool collides)
        {
            int i = Allocate();
            _particles[i].Alive = true;
            _particles[i].Position = position;
            _particles[i].Velocity = velocity;
            _particles[i].Colour = colour;
            _particles[i].Size = size;
            _particles[i].Life = life;
            _particles[i].MaxLife = life;
            _particles[i].Gravity = gravity;
            _particles[i].Collides = collides;
        }

        // ---- Emitters ---------------------------------------------------------

        /// <summary>Continuous dust while a block is being mined. Rate limited internally.</summary>
        public void SpawnMiningDust(Vector3 centre, BlockDefinition block, float dt)
        {
            _dustAccumulator += dt;
            if (_dustAccumulator < 0.05f) return;
            _dustAccumulator = 0.0f;

            Color colour = BlockColour(block);
            Emit(centre + new Vector3(Symmetric() * 0.4f, Symmetric() * 0.4f, Symmetric() * 0.4f),
                new Vector3(Symmetric() * 1.2f, 1.5f + NextFloat(), Symmetric() * 1.2f),
                colour, 0.09f, 0.5f, 9.0f, false);
        }

        public void SpawnBlockBreak(Vector3 centre, BlockDefinition block)
        {
            Color colour = BlockColour(block);
            for (int i = 0; i < 14; i++)
            {
                Emit(centre + new Vector3(Symmetric() * 0.45f, Symmetric() * 0.45f, Symmetric() * 0.45f),
                    new Vector3(Symmetric() * 3.0f, 2.0f + NextFloat() * 3.0f, Symmetric() * 3.0f),
                    colour, 0.11f, 0.75f + NextFloat() * 0.4f, 14.0f, true);
            }
        }

        public void SpawnImpact(Vector3 point, BlockDefinition block)
        {
            Color colour = BlockColour(block);
            for (int i = 0; i < 6; i++)
            {
                Emit(point,
                    new Vector3(Symmetric() * 2.5f, NextFloat() * 2.5f, Symmetric() * 2.5f),
                    colour, 0.07f, 0.35f, 12.0f, false);
            }
        }

        public void SpawnBlood(Vector3 point)
        {
            for (int i = 0; i < 10; i++)
            {
                Emit(point + new Vector3(Symmetric() * 0.2f, Symmetric() * 0.2f, Symmetric() * 0.2f),
                    new Vector3(Symmetric() * 2.2f, NextFloat() * 2.2f, Symmetric() * 2.2f),
                    new Color(140, 20, 20), 0.1f, 0.55f, 13.0f, false);
            }
        }

        public void SpawnMuzzleFlash(Vector3 point)
        {
            Emit(point, Vector3.Zero, new Color(255, 226, 140), 0.42f, 0.06f, 0.0f, false);
            for (int i = 0; i < 4; i++)
            {
                Emit(point,
                    new Vector3(Symmetric() * 1.5f, Symmetric() * 1.5f, Symmetric() * 1.5f),
                    new Color(180, 180, 180, 160), 0.1f, 0.3f, -1.0f, false);
            }
        }

        public void SpawnFire(Vector3 point)
        {
            for (int i = 0; i < 4; i++)
            {
                Emit(point + new Vector3(Symmetric() * 0.3f, NextFloat() * 0.6f, Symmetric() * 0.3f),
                    new Vector3(Symmetric() * 0.4f, 1.6f + NextFloat(), Symmetric() * 0.4f),
                    new Color(255, 150, 40), 0.22f, 0.5f, -2.0f, false);
            }
        }

        public void SpawnTrail(Vector3 point, bool smoke)
        {
            if (smoke)
            {
                Emit(point, new Vector3(Symmetric() * 0.3f, 0.4f, Symmetric() * 0.3f),
                    new Color(120, 120, 120, 170), 0.24f, 0.6f, -0.6f, false);
            }
            else
            {
                Emit(point, Vector3.Zero, new Color(255, 140, 40), 0.28f, 0.25f, 0.0f, false);
            }
        }

        public void SpawnExplosion(Vector3 centre, float scale)
        {
            int count = (int)(26 * scale);
            if (count > 90) count = 90;

            for (int i = 0; i < count; i++)
            {
                float speed = (3.0f + NextFloat() * 7.0f) * scale;
                Vector3 direction = new Vector3(Symmetric(), Symmetric(), Symmetric());
                if (direction.LengthSquared() < 0.001f) direction = Vector3.Up;
                direction.Normalize();

                Color colour = NextFloat() < 0.55f
                    ? new Color(255, 180, 60)
                    : new Color(90, 90, 90, 200);

                Emit(centre, direction * speed, colour,
                    0.3f * scale, 0.5f + NextFloat() * 0.6f, 5.0f, false);
            }
        }

        private static Color BlockColour(BlockDefinition block)
        {
            // Approximate the block's average texture colour; good enough for 8-pixel
            // particles and avoids reading back from the atlas.
            switch (block.Id)
            {
                case Block.Grass: return new Color(96, 150, 68);
                case Block.Dirt: return new Color(134, 96, 67);
                case Block.Sand: return new Color(219, 207, 160);
                case Block.Snow: return new Color(236, 240, 244);
                case Block.Log: return new Color(120, 92, 56);
                case Block.Planks: return new Color(168, 133, 84);
                case Block.Leaves: return new Color(90, 140, 62);
                case Block.CoalOre: return new Color(60, 60, 60);
                case Block.IronOre: return new Color(180, 146, 120);
                case Block.GoldOre: return new Color(226, 195, 84);
                case Block.DiamondOre: return new Color(120, 220, 220);
                case Block.DragonStoneOre: return new Color(190, 90, 220);
                case Block.HellStone: return new Color(150, 60, 46);
                case Block.Lava: return new Color(240, 120, 30);
                case Block.Water: return new Color(70, 120, 200);
                default: return new Color(128, 128, 128);
            }
        }

        // ---- Simulation -------------------------------------------------------

        public void Update(World.World world, float dt)
        {
            LiveCount = 0;

            for (int i = 0; i < Capacity; i++)
            {
                if (!_particles[i].Alive) continue;

                _particles[i].Life -= dt;
                if (_particles[i].Life <= 0.0f)
                {
                    _particles[i].Alive = false;
                    continue;
                }

                _particles[i].Velocity.Y -= _particles[i].Gravity * dt;
                Vector3 next = _particles[i].Position + _particles[i].Velocity * dt;

                if (_particles[i].Collides)
                {
                    int bx = (int)System.Math.Floor(next.X);
                    int by = (int)System.Math.Floor(next.Y);
                    int bz = (int)System.Math.Floor(next.Z);
                    if (world.IsSolid(bx, by, bz))
                    {
                        // Settle on the surface and stop, rather than sinking into it.
                        _particles[i].Velocity = Vector3.Zero;
                        _particles[i].Gravity = 0.0f;
                        _particles[i].Collides = false;
                        next = _particles[i].Position;
                    }
                }

                _particles[i].Position = next;
                LiveCount++;
            }
        }

        public void Draw(GraphicsDevice device, Matrix view, Matrix projection, Vector3 cameraRight, Vector3 cameraUp)
        {
            if (_effect == null || _texture == null || LiveCount == 0) return;

            int quads = 0;
            for (int i = 0; i < Capacity; i++)
            {
                if (!_particles[i].Alive) continue;

                float fade = _particles[i].Life / _particles[i].MaxLife;
                if (fade > 1.0f) fade = 1.0f;

                Color colour = _particles[i].Colour;
                colour.A = (byte)(colour.A * fade);

                float half = _particles[i].Size * 0.5f;
                Vector3 right = cameraRight * half;
                Vector3 up = cameraUp * half;
                Vector3 centre = _particles[i].Position;

                int v = quads * 4;
                _vertices[v + 0] = new VertexPositionColorTexture(centre - right + up, colour, new Vector2(0, 0));
                _vertices[v + 1] = new VertexPositionColorTexture(centre + right + up, colour, new Vector2(1, 0));
                _vertices[v + 2] = new VertexPositionColorTexture(centre + right - up, colour, new Vector2(1, 1));
                _vertices[v + 3] = new VertexPositionColorTexture(centre - right - up, colour, new Vector2(0, 1));
                quads++;
            }

            if (quads == 0) return;

            _effect.View = view;
            _effect.Projection = projection;
            _effect.World = Matrix.Identity;

            BlendState previousBlend = device.BlendState;
            DepthStencilState previousDepth = device.DepthStencilState;

            RasterizerState previousRasterizer = device.RasterizerState;
            device.BlendState = BlendState.NonPremultiplied;
            device.DepthStencilState = DepthStencilState.DepthRead;
            device.RasterizerState = RasterizerState.CullNone;

            for (int p = 0; p < _effect.CurrentTechnique.Passes.Count; p++)
            {
                _effect.CurrentTechnique.Passes[p].Apply();
                device.DrawUserIndexedPrimitives(PrimitiveType.TriangleList,
                    _vertices, 0, quads * 4,
                    _indices, 0, quads * 2);
            }

            device.BlendState = previousBlend;
            device.DepthStencilState = previousDepth;
            device.RasterizerState = previousRasterizer;
        }

        public void Clear()
        {
            for (int i = 0; i < Capacity; i++) _particles[i].Alive = false;
            LiveCount = 0;
        }
    }
}
