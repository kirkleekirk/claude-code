using System.Collections.Generic;
using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;
using CastleMinerZ.Core;
using CastleMinerZ.World;

namespace CastleMinerZ.Graphics
{
    /// <summary>
    /// Draws the voxel world.
    ///
    /// Two passes: opaque terrain front to back so the hierarchical z-buffer rejects most
    /// of the hidden geometry before it is shaded, then water and glass back to front with
    /// blending on. Every section shares one static index buffer -- the quad index pattern
    /// is identical for all of them, and giving each chunk its own would cost tens of
    /// megabytes for nothing.
    /// </summary>
    public sealed class WorldRenderer
    {
        /// <summary>Worst case quads in one section: every block showing all six faces.</summary>
        private const int MaxQuadsPerSection = Constants.BlocksPerSection * 6;

        private GraphicsDevice _device;
        private Effect _effect;
        private Texture2D _atlas;
        private IndexBuffer _sharedIndices;

        private EffectParameter _pViewProjection;
        private EffectParameter _pChunkOrigin;
        private EffectParameter _pFogColour;
        private EffectParameter _pFogRange;
        private EffectParameter _pSunIntensity;
        private EffectParameter _pFoliageTint;
        private EffectParameter _pCameraPosition;
        private EffectParameter _pFlashlight;
        private EffectParameter _pFlashlightDirection;
        private EffectParameter _pAtlas;
        private EffectParameter _pWaterTime;

        private readonly List<Chunk> _visibleOpaque = new List<Chunk>(512);
        private readonly List<Chunk> _visibleAlpha = new List<Chunk>(128);

        /// <summary>Distance bands for the ordering pass, one per chunk of distance.</summary>
        private const int BandCount = 40;
        private readonly int[] _bandCounts = new int[BandCount];
        private Chunk[] _sortScratch;
        private int[] _sortBands;

        public int DrawnSections;
        public int DrawnTriangles;

        public void LoadContent(GraphicsDevice device, Effect voxelEffect, Texture2D atlas)
        {
            _device = device;
            _effect = voxelEffect;
            _atlas = atlas;

            _pViewProjection = _effect.Parameters["ViewProjection"];
            _pChunkOrigin = _effect.Parameters["ChunkOrigin"];
            _pFogColour = _effect.Parameters["FogColour"];
            _pFogRange = _effect.Parameters["FogRange"];
            _pSunIntensity = _effect.Parameters["SunIntensity"];
            _pFoliageTint = _effect.Parameters["FoliageTint"];
            _pCameraPosition = _effect.Parameters["CameraPosition"];
            _pFlashlight = _effect.Parameters["FlashlightStrength"];
            _pFlashlightDirection = _effect.Parameters["FlashlightDirection"];
            _pAtlas = _effect.Parameters["AtlasTexture"];
            _pWaterTime = _effect.Parameters["WaterTime"];

            BuildSharedIndexBuffer();
        }

        /// <summary>
        /// One index buffer of quad triangles, reused by every chunk. Sections index into
        /// their own vertex buffer, so the pattern 0,1,2, 0,2,3 repeated is all any of them
        /// ever needs.
        /// </summary>
        private void BuildSharedIndexBuffer()
        {
            int quads = MaxQuadsPerSection;
            int[] indices = new int[quads * 6];

            for (int q = 0; q < quads; q++)
            {
                int v = q * 4;
                int i = q * 6;
                indices[i + 0] = v + 0;
                indices[i + 1] = v + 1;
                indices[i + 2] = v + 2;
                indices[i + 3] = v + 0;
                indices[i + 4] = v + 2;
                indices[i + 5] = v + 3;
            }

            _sharedIndices = new IndexBuffer(_device, IndexElementSize.ThirtyTwoBits, indices.Length, BufferUsage.WriteOnly);
            _sharedIndices.SetData(indices);
        }

        /// <summary><paramref name="animationTime"/> drives the water UV scroll.</summary>
        public void Draw(World.World world, Camera camera, Color fogColour, bool flashlightOn, float animationTime)
        {
            DrawnSections = 0;
            DrawnTriangles = 0;
            if (_effect == null) return;

            CollectVisible(world, camera);

            _device.Indices = _sharedIndices;
            _device.SamplerStates[0] = AtlasSampler;

            _pViewProjection.SetValue(camera.ViewProjection);
            _pFogColour.SetValue(fogColour.ToVector3());
            _pFogRange.SetValue(ComputeFogRange(world));
            _pSunIntensity.SetValue(world.SunIntensity);
            _pCameraPosition.SetValue(camera.Position);
            _pFlashlight.SetValue(flashlightOn ? 1.0f : 0.0f);
            _pFlashlightDirection.SetValue(camera.Forward);
            if (_pAtlas != null) _pAtlas.SetValue(_atlas);
            if (_pWaterTime != null) _pWaterTime.SetValue(animationTime);

            // ---- Opaque, nearest first ----
            _device.BlendState = BlendState.Opaque;
            _device.DepthStencilState = DepthStencilState.Default;
            _device.RasterizerState = RasterizerState.CullCounterClockwise;

            _effect.CurrentTechnique = _effect.Techniques["Terrain"];
            OrderByDistance(_visibleOpaque, camera.Position, true);
            for (int i = 0; i < _visibleOpaque.Count; i++) DrawSection(_visibleOpaque[i], false);

            // ---- Water and glass, furthest first, no depth write ----
            _device.BlendState = BlendState.AlphaBlend;
            _device.DepthStencilState = DepthStencilState.DepthRead;

            _effect.CurrentTechnique = _effect.Techniques["Water"];
            OrderByDistance(_visibleAlpha, camera.Position, false);
            for (int i = 0; i < _visibleAlpha.Count; i++) DrawSection(_visibleAlpha[i], true);

            _device.DepthStencilState = DepthStencilState.Default;
            _device.BlendState = BlendState.Opaque;
        }

        /// <summary>
        /// Fog has to saturate before the streaming edge, or the player watches chunks
        /// appear. Both ends track the configured view radius rather than the compile-time
        /// default, so raising view distance in the options actually shows more world
        /// instead of just rendering more fog.
        /// </summary>
        private static Vector2 ComputeFogRange(World.World world)
        {
            float start = (world.ViewRadius - 2.0f) * Constants.ChunkSize;
            float end = (world.ViewRadius - 0.35f) * Constants.ChunkSize;
            if (start < Constants.ChunkSize) start = Constants.ChunkSize;
            return new Vector2(start, end);
        }

        private void CollectVisible(World.World world, Camera camera)
        {
            _visibleOpaque.Clear();
            _visibleAlpha.Clear();

            List<ChunkColumn> columns = world.Columns;
            for (int c = 0; c < columns.Count; c++)
            {
                ChunkColumn column = columns[c];
                if (column.State < ColumnState.Generated) continue;

                for (int s = 0; s < column.Sections.Length; s++)
                {
                    Chunk section = column.Sections[s];
                    if (section.OpaqueVertices == null && section.AlphaVertices == null) continue;
                    if (!camera.IsVisible(ref section.Bounds)) continue;

                    if (section.OpaqueVertices != null && section.OpaqueQuadCount > 0) _visibleOpaque.Add(section);
                    if (section.AlphaVertices != null && section.AlphaQuadCount > 0) _visibleAlpha.Add(section);
                }
            }
        }

        private void DrawSection(Chunk section, bool alpha)
        {
            VertexBuffer buffer = alpha ? section.AlphaVertices : section.OpaqueVertices;
            int quads = alpha ? section.AlphaQuadCount : section.OpaqueQuadCount;
            if (buffer == null || quads == 0) return;
            if (quads > MaxQuadsPerSection) quads = MaxQuadsPerSection;

            _pChunkOrigin.SetValue(section.Bounds.Min);
            _pFoliageTint.SetValue(section.Column.FoliageTint);

            _device.SetVertexBuffer(buffer);

            EffectPassCollection passes = _effect.CurrentTechnique.Passes;
            for (int p = 0; p < passes.Count; p++)
            {
                passes[p].Apply();
                // The six-argument overload is XNA 4.0's only signature. MonoGame marks it
                // obsolete in favour of a four-argument form that XNA does not have, and the
                // Xbox 360 build is the one that ships, so the XNA call stays.
#pragma warning disable 618
                _device.DrawIndexedPrimitives(PrimitiveType.TriangleList, 0, 0, quads * 4, 0, quads * 2);
#pragma warning restore 618
            }

            DrawnSections++;
            DrawnTriangles += quads * 2;
        }

        /// <summary>
        /// Orders sections by distance with a counting sort into fixed distance bands.
        ///
        /// A comparison sort is the wrong tool here. The visible list is rebuilt every
        /// frame in column-table order, which bears no relation to distance, so an
        /// insertion sort would hit its worst case every single frame -- around half a
        /// million distance evaluations at a full view radius. Counting sort is one pass
        /// to bucket and one pass to place, and the ordering it produces is exact to
        /// within one chunk, which is all either consumer needs: the opaque pass wants
        /// front-to-back for early-z rejection, and the transparent pass wants
        /// back-to-front, neither of which is sensitive to ties inside a band.
        /// </summary>
        private void OrderByDistance(List<Chunk> sections, Vector3 viewer, bool nearestFirst)
        {
            int count = sections.Count;
            if (count < 2) return;

            if (_sortScratch == null || _sortScratch.Length < count)
            {
                _sortScratch = new Chunk[count < 512 ? 512 : count * 2];
                _sortBands = new int[count < 512 ? 512 : count * 2];
            }

            for (int b = 0; b < BandCount; b++) _bandCounts[b] = 0;

            for (int i = 0; i < count; i++)
            {
                int band = BandFor(sections[i], viewer);
                if (!nearestFirst) band = BandCount - 1 - band;
                _sortBands[i] = band;
                _bandCounts[band]++;
            }

            // Prefix sums turn the histogram into the first output slot for each band.
            int running = 0;
            for (int b = 0; b < BandCount; b++)
            {
                int n = _bandCounts[b];
                _bandCounts[b] = running;
                running += n;
            }

            for (int i = 0; i < count; i++)
            {
                _sortScratch[_bandCounts[_sortBands[i]]++] = sections[i];
            }

            for (int i = 0; i < count; i++) sections[i] = _sortScratch[i];
        }

        /// <summary>One band per chunk of distance, saturating at the far end.</summary>
        private static int BandFor(Chunk section, Vector3 viewer)
        {
            Vector3 centre = (section.Bounds.Min + section.Bounds.Max) * 0.5f;
            float dx = centre.X - viewer.X;
            float dy = centre.Y - viewer.Y;
            float dz = centre.Z - viewer.Z;
            float distanceSquared = dx * dx + dy * dy + dz * dz;

            int band = (int)(System.Math.Sqrt(distanceSquared) * (1.0f / Constants.ChunkSize));
            if (band < 0) band = 0;
            if (band >= BandCount) band = BandCount - 1;
            return band;
        }

        /// <summary>
        /// Point sampling with anisotropy off. The atlas has no gutters, so any filtering
        /// wider than a texel bleeds neighbouring tiles into each other along block edges.
        /// </summary>
        private static readonly SamplerState AtlasSampler = new SamplerState();

        static WorldRenderer()
        {
            AtlasSampler.Filter = TextureFilter.Point;
            AtlasSampler.AddressU = TextureAddressMode.Clamp;
            AtlasSampler.AddressV = TextureAddressMode.Clamp;
            AtlasSampler.MaxMipLevel = 0;
        }

        public void Dispose()
        {
            if (_sharedIndices != null)
            {
                _sharedIndices.Dispose();
                _sharedIndices = null;
            }
        }
    }
}
