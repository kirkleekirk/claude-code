using System.Collections.Generic;
using System.Threading;
using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;
using CastleMinerZ.Core;

namespace CastleMinerZ.World
{
    /// <summary>One section queued for meshing, together with the snapshot it will be built from.</summary>
    public sealed class MeshJob
    {
        public Chunk Section;
        public int Version;
        public byte[] Blocks;
        public byte[] Light;
        public MeshBuilder Builder;
    }

    /// <summary>
    /// Background terrain generation and mesh building.
    ///
    /// On the Xbox 360 the six hardware threads are not interchangeable: thread 0 runs the
    /// game and thread 2 is reserved by the framework, so workers are pinned to 3 and 4.
    /// Leaving them unpinned lets the scheduler put them on the same core as the render
    /// thread, which shows up immediately as dropped frames while terrain streams in.
    ///
    /// The split of work is deliberate: generation is pure computation and runs entirely on
    /// the worker; meshing runs on the worker but from a snapshot the main thread captured,
    /// so no worker ever reads world state that another thread might be editing.
    /// </summary>
    public sealed class ChunkWorker
    {
        private const int MaxQueuedGeneration = 24;
        private const int MaxQueuedMesh = 48;

        private readonly World _world;
        private readonly WorldGenerator _generator;

        private readonly Queue<ChunkColumn> _generateQueue = new Queue<ChunkColumn>(MaxQueuedGeneration);
        private readonly Queue<ChunkColumn> _generatedQueue = new Queue<ChunkColumn>(MaxQueuedGeneration);
        private readonly Queue<MeshJob> _meshQueue = new Queue<MeshJob>(MaxQueuedMesh);
        private readonly Queue<MeshJob> _meshedQueue = new Queue<MeshJob>(MaxQueuedMesh);
        private readonly Stack<MeshJob> _jobPool = new Stack<MeshJob>(MaxQueuedMesh);

        private readonly object _sync = new object();
        private readonly Thread[] _threads;
        private volatile bool _running = true;

        private readonly List<Chunk> _dirtyScratch = new List<Chunk>(256);

        /// <summary>Sections meshed since startup. Shown on the debug overlay.</summary>
        public int SectionsMeshed;
        public int ColumnsGenerated;

#if XBOX360
        // Hardware threads 0 (main) and 2 (framework) are off limits.
        private static readonly int[] Affinity = { 3, 4, 5 };
#endif

        /// <summary>
        /// Mesh jobs submitted per frame. The MonoGame path re-meshes the world as the sun
        /// moves, so it gets a much larger budget -- a desktop has the cores to spare and a
        /// slow sweep would show as chunks visibly changing brightness one at a time.
        /// </summary>
#if MONOGAME
        public const int MeshJobsPerFrame = 48;
#else
        public const int MeshJobsPerFrame = 6;
#endif

        public ChunkWorker(World world, WorldGenerator generator)
        {
            _world = world;
            _generator = generator;

            int threadCount = WorkerThreadCount();
            _threads = new Thread[threadCount];
            for (int i = 0; i < threadCount; i++)
            {
                Thread t = new Thread(WorkerLoop);
                t.IsBackground = true;
                t.Name = "ChunkWorker" + i;
#if !XBOX360
                t.Priority = ThreadPriority.BelowNormal;
#endif
                _threads[i] = t;
                t.Start(i);
            }
        }

        private static int WorkerThreadCount()
        {
#if XBOX360
            return 2;
#else
            int n = System.Environment.ProcessorCount - 1;
            if (n < 1) n = 1;
            if (n > 4) n = 4;
            return n;
#endif
        }

        public bool HasGenerationCapacity
        {
            get
            {
                lock (_sync) { return _generateQueue.Count < MaxQueuedGeneration; }
            }
        }

        public int PendingGeneration
        {
            get { lock (_sync) { return _generateQueue.Count; } }
        }

        public int PendingMesh
        {
            get { lock (_sync) { return _meshQueue.Count; } }
        }

        public void EnqueueGeneration(ChunkColumn column)
        {
            lock (_sync)
            {
                _generateQueue.Enqueue(column);
                Monitor.PulseAll(_sync);
            }
        }

        // ---- Worker side ------------------------------------------------------

        private void WorkerLoop(object index)
        {
#if XBOX360
            int slot = (int)index % Affinity.Length;
            Thread.CurrentThread.SetProcessorAffinity(new int[] { Affinity[slot] });
#endif
            GenScratch scratch = new GenScratch();

            while (_running)
            {
                ChunkColumn column = null;
                MeshJob job = null;

                lock (_sync)
                {
                    while (_running && _generateQueue.Count == 0 && _meshQueue.Count == 0)
                        Monitor.Wait(_sync);

                    if (!_running) return;

                    // Meshing first: a column that is generated but unmeshed is an invisible
                    // hole in the world, so finishing geometry beats starting new terrain.
                    if (_meshQueue.Count > 0) job = _meshQueue.Dequeue();
                    else if (_generateQueue.Count > 0) column = _generateQueue.Dequeue();
                }

                if (job != null)
                {
                    ChunkMesher.Build(job.Blocks, job.Light, job.Builder);
                    lock (_sync) { _meshedQueue.Enqueue(job); }
                }
                else if (column != null)
                {
                    if (column.State == ColumnState.Unloading) continue;
                    column.State = ColumnState.Generating;
                    _generator.Generate(column, scratch);
                    lock (_sync) { _generatedQueue.Enqueue(column); }
                }
            }
        }

        // ---- Main thread side -------------------------------------------------

        /// <summary>
        /// Brings finished terrain into the world. Lighting a column is not cheap, so only a
        /// couple are integrated per frame -- the rest wait one more frame rather than
        /// spiking the frame time.
        /// </summary>
        public void IntegrateGeneratedColumns(int maxPerFrame)
        {
            for (int i = 0; i < maxPerFrame; i++)
            {
                ChunkColumn column;
                lock (_sync)
                {
                    if (_generatedQueue.Count == 0) return;
                    column = _generatedQueue.Dequeue();
                }

                if (column.State == ColumnState.Unloading) continue;
                _world.IntegrateGeneratedColumn(column);
                ColumnsGenerated++;
            }
        }

        /// <summary>
        /// Finds dirty sections near the viewer, snapshots them and hands them to the workers.
        /// Nearest first, so the geometry the player is standing in front of resolves first.
        /// </summary>
        public void SubmitDirtySections(Vector3 viewer, int maxPerFrame)
        {
            int queued;
            lock (_sync) { queued = _meshQueue.Count; }
            int budget = MaxQueuedMesh - queued;
            if (budget <= 0) return;
            if (budget > maxPerFrame) budget = maxPerFrame;

            _dirtyScratch.Clear();
            List<ChunkColumn> columns = _world.Columns;

            for (int i = 0; i < columns.Count; i++)
            {
                ChunkColumn column = columns[i];
                if (column.State < ColumnState.Generated) continue;

                for (int s = 0; s < column.Sections.Length; s++)
                {
                    Chunk section = column.Sections[s];
                    if (!section.MeshDirty || section.MeshQueued) continue;
                    if (section.IsEmpty && section.OpaqueVertices == null && section.AlphaVertices == null)
                    {
                        // Nothing to build and nothing to clear.
                        section.MeshDirty = false;
                        continue;
                    }
                    _dirtyScratch.Add(section);
                }
            }

            if (_dirtyScratch.Count == 0) return;

            int take = _dirtyScratch.Count < budget ? _dirtyScratch.Count : budget;
            SelectNearest(_dirtyScratch, viewer, take);

            for (int i = 0; i < take; i++)
            {
                Chunk section = _dirtyScratch[i];
                MeshJob job = RentJob();
                job.Section = section;
                job.Version = section.Version;

                ChunkMesher.CaptureNeighbourhood(_world, section, job.Blocks, job.Light);

                section.MeshDirty = false;
                section.MeshQueued = true;

                lock (_sync)
                {
                    _meshQueue.Enqueue(job);
                    Monitor.PulseAll(_sync);
                }
            }
        }

        /// <summary>
        /// Moves the <paramref name="count"/> nearest sections to the front of the list.
        ///
        /// Only a handful are submitted per frame, but at world load the candidate list is
        /// every dirty section in the view radius -- well over a thousand. Sorting all of
        /// them to use six would be quadratic work thrown away; a partial selection is
        /// O(n * count), which for count = 6 is linear in practice.
        /// </summary>
        private static void SelectNearest(List<Chunk> sections, Vector3 viewer, int count)
        {
            for (int i = 0; i < count; i++)
            {
                int best = i;
                float bestDistance = DistanceSquared(sections[i], viewer);

                for (int j = i + 1; j < sections.Count; j++)
                {
                    float distance = DistanceSquared(sections[j], viewer);
                    if (distance >= bestDistance) continue;
                    best = j;
                    bestDistance = distance;
                }

                if (best == i) continue;
                Chunk swap = sections[i];
                sections[i] = sections[best];
                sections[best] = swap;
            }
        }

        private static float DistanceSquared(Chunk section, Vector3 viewer)
        {
            Vector3 centre = (section.Bounds.Min + section.Bounds.Max) * 0.5f;
            float dx = centre.X - viewer.X;
            float dy = centre.Y - viewer.Y;
            float dz = centre.Z - viewer.Z;
            return dx * dx + dy * dy + dz * dz;
        }

        /// <summary>Uploads finished geometry to the GPU. Must run on the thread that owns the device.</summary>
        public void UploadFinishedMeshes(GraphicsDevice device, int maxPerFrame)
        {
            for (int i = 0; i < maxPerFrame; i++)
            {
                MeshJob job;
                lock (_sync)
                {
                    if (_meshedQueue.Count == 0) return;
                    job = _meshedQueue.Dequeue();
                }

                Chunk section = job.Section;
                section.MeshQueued = false;

                bool stale = section.Version != job.Version;
                bool dead = section.Column.State == ColumnState.Unloading;

                if (!dead)
                {
                    Upload(device, section, job.Builder);
                    SectionsMeshed++;
                    if (stale) section.MeshDirty = true;
                }

                ReturnJob(job);
            }
        }

        private void Upload(GraphicsDevice device, Chunk section, MeshBuilder builder)
        {
#if MONOGAME
            float sun = _world.SunIntensity;
            section.OpaqueVertices = UploadExpanded(device, section, section.OpaqueVertices, builder.Opaque, builder.OpaqueCount, sun);
            section.AlphaVertices = UploadExpanded(device, section, section.AlphaVertices, builder.Alpha, builder.AlphaCount, sun);
#else
            section.OpaqueVertices = UploadBuffer(device, section.OpaqueVertices, builder.Opaque, builder.OpaqueCount);
            section.AlphaVertices = UploadBuffer(device, section.AlphaVertices, builder.Alpha, builder.AlphaCount);
#endif
            section.OpaqueQuadCount = builder.OpaqueCount / 4;
            section.AlphaQuadCount = builder.AlphaCount / 4;
        }

#if MONOGAME
        /// <summary>Scratch for vertex expansion. Reused; only the main thread touches it.</summary>
        private VertexPositionColorTexture[] _expanded = new VertexPositionColorTexture[8192];

        /// <summary>
        /// Diagnostic: ignore baked lighting and draw everything at full brightness. Makes
        /// it possible to tell a geometry problem from a lighting one in a screenshot.
        /// </summary>
        public static bool FullBright;

        /// <summary>Warm tint for torch and lava light. Mirrors TorchColour in Voxel.fx.</summary>
        private static readonly Vector3 TorchColour = new Vector3(1.0f, 0.76f, 0.48f);

        /// <summary>Flat per-face shading, indexed by face. Mirrors FaceShade in Voxel.fx.</summary>
        private static readonly float[] FaceShade = { 0.72f, 0.72f, 0.52f, 1.0f, 0.86f, 0.86f };

        /// <summary>
        /// Expands packed voxel vertices into a format the framework's built-in effects can
        /// draw: world-space positions, real UVs, and lighting folded into the vertex
        /// colour. This is the work Voxel.fx does on the GPU in the XNA build, done on the
        /// CPU instead because MonoGame cannot compile that shader without extra tooling.
        ///
        /// The cost is that sun intensity is baked in, so the world has to be re-meshed as
        /// the day advances -- see World.RebakeLightingIfSunMoved.
        /// </summary>
        private VertexBuffer UploadExpanded(GraphicsDevice device, Chunk section, VertexBuffer existing,
            VoxelVertex[] packed, int count, float sunIntensity)
        {
            if (count == 0)
            {
                if (existing != null) existing.Dispose();
                return null;
            }

            if (_expanded.Length < count) _expanded = new VertexPositionColorTexture[count * 2];

            Vector3 origin = section.Bounds.Min;
            Vector3 foliage = section.Column.FoliageTint;
            const float tileSize = 1.0f / BlockRegistry.AtlasTilesPerRow;
            const float inset = 0.5f / (BlockRegistry.AtlasTilesPerRow * 16.0f);

            for (int i = 0; i < count; i++)
            {
                Vector4 position = packed[i].Position.ToVector4();
                Vector4 tile = packed[i].TileCorner.ToVector4();
                Color light = packed[i].Light;

                _expanded[i].Position = new Vector3(
                    origin.X + position.X * (1.0f / ChunkMesher.Q),
                    origin.Y + position.Y * (1.0f / ChunkMesher.Q),
                    origin.Z + position.Z * (1.0f / ChunkMesher.Q));

                // Pull each corner half a texel toward the middle of its tile, exactly as
                // the shader does, so neighbouring tiles cannot bleed in.
                float u = (tile.X + tile.Z) * tileSize + (0.5f - tile.Z) * (2.0f * inset);
                float v = (tile.Y + tile.W) * tileSize + (0.5f - tile.W) * (2.0f * inset);
                _expanded[i].TextureCoordinate = new Vector2(u, v);

                float blockLight = light.R / 255.0f;
                float skyLight = light.G / 255.0f * sunIntensity;
                float tintAmount = light.B / 255.0f;
                float ao = light.A / 255.0f;

                float shade = ao * FaceShade[(int)position.W];

                float r = Saturate(skyLight + TorchColour.X * blockLight);
                float g = Saturate(skyLight + TorchColour.Y * blockLight);
                float b = Saturate(skyLight + TorchColour.Z * blockLight);

                if (r < 0.05f) r = 0.05f;
                if (g < 0.05f) g = 0.05f;
                if (b < 0.05f) b = 0.05f;

                r *= shade;
                g *= shade;
                b *= shade;

                // Foliage tint multiplies the texture in the shader; folding it into the
                // vertex colour gives the same result, because the fixed-function path also
                // multiplies texture by vertex colour.
                if (tintAmount > 0.0f)
                {
                    r *= 1.0f + (foliage.X - 1.0f) * tintAmount;
                    g *= 1.0f + (foliage.Y - 1.0f) * tintAmount;
                    b *= 1.0f + (foliage.Z - 1.0f) * tintAmount;
                }

                // Alpha stays opaque so the texture's own alpha drives both the cutout test
                // and the water blend.
                _expanded[i].Color = FullBright ? Color.White : new Color(r, g, b, 1.0f);
            }

            VertexBuffer buffer = existing;
            if (buffer == null || buffer.VertexCount < count || buffer.VertexCount > count * 2 + 256)
            {
                if (buffer != null) buffer.Dispose();
                buffer = new VertexBuffer(device, VertexPositionColorTexture.VertexDeclaration, count, BufferUsage.WriteOnly);
            }

            buffer.SetData(_expanded, 0, count);
            return buffer;
        }

        private static float Saturate(float v)
        {
            if (v < 0.0f) return 0.0f;
            if (v > 1.0f) return 1.0f;
            return v;
        }
#endif

        /// <summary>
        /// Reuses the existing buffer when it is a reasonable fit. Constantly creating and
        /// disposing vertex buffers fragments video memory on the 360 far faster than it
        /// does on a PC.
        /// </summary>
        private static VertexBuffer UploadBuffer(GraphicsDevice device, VertexBuffer existing, VoxelVertex[] data, int count)
        {
            if (count == 0)
            {
                if (existing != null) existing.Dispose();
                return null;
            }

            VertexBuffer buffer = existing;
            if (buffer == null || buffer.VertexCount < count || buffer.VertexCount > count * 2 + 256)
            {
                if (buffer != null) buffer.Dispose();
                buffer = new VertexBuffer(device, VoxelVertex.Declaration, count, BufferUsage.WriteOnly);
            }

            buffer.SetData(data, 0, count);
            return buffer;
        }

        private MeshJob RentJob()
        {
            lock (_sync)
            {
                if (_jobPool.Count > 0) return _jobPool.Pop();
            }

            MeshJob job = new MeshJob();
            job.Blocks = Pools.MeshScratch.Rent();
            job.Light = Pools.MeshScratch.Rent();
            job.Builder = new MeshBuilder();
            return job;
        }

        private void ReturnJob(MeshJob job)
        {
            job.Section = null;
            job.Builder.Reset();
            lock (_sync) { _jobPool.Push(job); }
        }

        /// <summary>Throws away queued work without waiting for it. Used when changing worlds.</summary>
        public void DrainQueues()
        {
            lock (_sync)
            {
                _generateQueue.Clear();
                _generatedQueue.Clear();
                _meshQueue.Clear();
                while (_meshedQueue.Count > 0) _jobPool.Push(_meshedQueue.Dequeue());
            }
        }

        public void Shutdown()
        {
            _running = false;
            lock (_sync) { Monitor.PulseAll(_sync); }

            for (int i = 0; i < _threads.Length; i++)
            {
                if (_threads[i] != null) _threads[i].Join(500);
            }
        }
    }
}
