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

        private static void Upload(GraphicsDevice device, Chunk section, MeshBuilder builder)
        {
            section.OpaqueVertices = UploadBuffer(device, section.OpaqueVertices, builder.Opaque, builder.OpaqueCount);
            section.OpaqueQuadCount = builder.OpaqueCount / 4;

            section.AlphaVertices = UploadBuffer(device, section.AlphaVertices, builder.Alpha, builder.AlphaCount);
            section.AlphaQuadCount = builder.AlphaCount / 4;
        }

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
