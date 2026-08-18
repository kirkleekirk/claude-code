using System.Collections.Generic;
using Microsoft.Xna.Framework;
using CastleMinerZ.Core;

namespace CastleMinerZ.World
{
    /// <summary>
    /// The voxel world: column storage, streaming around the viewer, block edits and the
    /// day/night clock.
    ///
    /// Threading contract, which everything else depends on:
    ///   * Terrain generation and mesh building run on <see cref="ChunkWorker"/> threads.
    ///   * All lighting and all block edits happen on the main thread only.
    ///   * Mesh jobs work from a snapshot captured on the main thread, so a worker never
    ///     reads a voxel array that is being edited or recycled underneath it.
    /// </summary>
    public sealed class World
    {
        private readonly Dictionary<long, ChunkColumn> _columns = new Dictionary<long, ChunkColumn>(1024);
        private readonly List<ChunkColumn> _columnList = new List<ChunkColumn>(1024);
        private readonly List<ChunkColumn> _pendingRelease = new List<ChunkColumn>(32);

        /// <summary>
        /// Every block the player has changed, keyed by column and then by packed local
        /// index. This outlives the columns themselves, so building something and walking
        /// away from it does not quietly discard it, and it is the only thing the save file
        /// stores about terrain -- generated blocks are reproduced from the seed.
        /// </summary>
        private readonly Dictionary<long, Dictionary<int, byte>> _edits =
            new Dictionary<long, Dictionary<int, byte>>(256);

        private readonly WorldGenerator _generator;
        private readonly LightPropagator _light;
        private readonly ChunkWorker _worker;

        private int _viewRadius = Constants.ViewRadiusColumns;

        /// <summary>0 = midnight, 0.5 = noon.</summary>
        private float _timeOfDay = 0.28f;

        /// <summary>Cached lookup of the last column touched. Block access is extremely coherent.</summary>
        private ChunkColumn _cachedColumn;
        private int _cachedCx = int.MinValue;
        private int _cachedCz = int.MinValue;

        public World(int seed)
        {
            BlockRegistry.Initialise();
            Biomes.Initialise();

            _generator = new WorldGenerator(seed);
            _light = new LightPropagator(this);
            _worker = new ChunkWorker(this, _generator);
        }

        public WorldGenerator Generator
        {
            get { return _generator; }
        }

        public ChunkWorker Worker
        {
            get { return _worker; }
        }

        public int Seed
        {
            get { return _generator.Seed; }
        }

        public int LoadedColumnCount
        {
            get { return _columnList.Count; }
        }

        public List<ChunkColumn> Columns
        {
            get { return _columnList; }
        }

        public int ViewRadius
        {
            get { return _viewRadius; }
            set { _viewRadius = value < 2 ? 2 : value; }
        }

        // ---- Time of day ------------------------------------------------------

        public float TimeOfDay
        {
            get { return _timeOfDay; }
            set { _timeOfDay = value - (float)System.Math.Floor(value); }
        }

        public bool IsNight
        {
            get { return _timeOfDay < 0.22f || _timeOfDay > 0.78f; }
        }

        /// <summary>
        /// Multiplier applied to baked sky light. Because sky level is stored per vertex and
        /// scaled in the shader, the whole world can go dark without re-meshing anything.
        /// </summary>
        public float SunIntensity
        {
            get
            {
                // Smooth ramp: full dark either side of midnight, full bright around noon.
                float t = _timeOfDay;
                float day = 1.0f - (float)System.Math.Cos(t * MathHelper.TwoPi);
                day = day * 0.5f;
                float lit = (day - 0.28f) / 0.5f;
                if (lit < 0.0f) lit = 0.0f;
                if (lit > 1.0f) lit = 1.0f;
                return 0.12f + lit * 0.88f;
            }
        }

        public void AdvanceTime(float seconds)
        {
            _timeOfDay += seconds / Constants.DayLengthSeconds;
            while (_timeOfDay >= 1.0f) _timeOfDay -= 1.0f;
        }

        // ---- Column access ----------------------------------------------------

        public ChunkColumn GetColumn(int cx, int cz)
        {
            if (cx == _cachedCx && cz == _cachedCz) return _cachedColumn;

            ChunkColumn column;
            if (!_columns.TryGetValue(ChunkColumn.Key(cx, cz), out column)) column = null;

            _cachedCx = cx;
            _cachedCz = cz;
            _cachedColumn = column;
            return column;
        }

        public ChunkColumn GetColumnAtWorld(int worldX, int worldZ)
        {
            return GetColumn(worldX >> Constants.ChunkShift, worldZ >> Constants.ChunkShift);
        }

        /// <summary>True once a column has terrain in it; still true while it is being meshed.</summary>
        public bool IsColumnReady(int cx, int cz)
        {
            ChunkColumn c = GetColumn(cx, cz);
            return c != null && c.State >= ColumnState.Generated;
        }

        // ---- Block access -----------------------------------------------------

        /// <summary>
        /// Reads a block. Out-of-world vertically is air above and stone below, so physics
        /// and the mesher treat the world floor as solid without special cases. Unloaded
        /// columns read as stone, which stops the player falling through the edge of the
        /// loaded area while it streams in.
        /// </summary>
        public byte GetBlock(int x, int y, int z)
        {
            if (y < 0) return Block.Stone;
            if (y > Constants.MaxBlockY) return Block.Air;

            ChunkColumn column = GetColumn(x >> Constants.ChunkShift, z >> Constants.ChunkShift);
            if (column == null || column.State < ColumnState.Generated) return Block.Stone;

            return column.GetBlock(x & Constants.ChunkMask, y, z & Constants.ChunkMask);
        }

        /// <summary>Like <see cref="GetBlock"/> but reads unloaded space as air, for the mesher's face test.</summary>
        public byte GetBlockForMesh(int x, int y, int z)
        {
            if (y < 0 || y > Constants.MaxBlockY) return Block.Air;

            ChunkColumn column = GetColumn(x >> Constants.ChunkShift, z >> Constants.ChunkShift);
            if (column == null || column.State < ColumnState.Generated) return Block.Stone;

            return column.GetBlock(x & Constants.ChunkMask, y, z & Constants.ChunkMask);
        }

        public bool IsSolid(int x, int y, int z)
        {
            return BlockRegistry.IsSolid(GetBlock(x, y, z));
        }

        public bool IsLiquidAt(int x, int y, int z)
        {
            return BlockRegistry.IsLiquid(GetBlock(x, y, z));
        }

        public byte GetSkyLight(int x, int y, int z)
        {
            if (y < 0) return 0;
            if (y > Constants.MaxBlockY) return Constants.MaxLight;
            ChunkColumn column = GetColumn(x >> Constants.ChunkShift, z >> Constants.ChunkShift);
            if (column == null) return Constants.MaxLight;
            Chunk s = column.Sections[y >> Constants.ChunkShift];
            return s.GetSkyLight(x & Constants.ChunkMask, y & Constants.ChunkMask, z & Constants.ChunkMask);
        }

        public byte GetBlockLight(int x, int y, int z)
        {
            if (y < 0 || y > Constants.MaxBlockY) return 0;
            ChunkColumn column = GetColumn(x >> Constants.ChunkShift, z >> Constants.ChunkShift);
            if (column == null) return 0;
            Chunk s = column.Sections[y >> Constants.ChunkShift];
            return s.GetBlockLight(x & Constants.ChunkMask, y & Constants.ChunkMask, z & Constants.ChunkMask);
        }

        public void SetSkyLight(int x, int y, int z, int level)
        {
            if (y < 0 || y > Constants.MaxBlockY) return;
            ChunkColumn column = GetColumn(x >> Constants.ChunkShift, z >> Constants.ChunkShift);
            if (column == null) return;
            column.Sections[y >> Constants.ChunkShift]
                .SetSkyLight(x & Constants.ChunkMask, y & Constants.ChunkMask, z & Constants.ChunkMask, level);
        }

        public void SetBlockLight(int x, int y, int z, int level)
        {
            if (y < 0 || y > Constants.MaxBlockY) return;
            ChunkColumn column = GetColumn(x >> Constants.ChunkShift, z >> Constants.ChunkShift);
            if (column == null) return;
            column.Sections[y >> Constants.ChunkShift]
                .SetBlockLight(x & Constants.ChunkMask, y & Constants.ChunkMask, z & Constants.ChunkMask, level);
        }

        /// <summary>Combined 0..1 brightness at a world position, used to shade entities and particles.</summary>
        public float SampleLight(Vector3 position)
        {
            int x = (int)System.Math.Floor(position.X);
            int y = (int)System.Math.Floor(position.Y);
            int z = (int)System.Math.Floor(position.Z);

            float sky = GetSkyLight(x, y, z) / 15.0f * SunIntensity;
            float block = GetBlockLight(x, y, z) / 15.0f;
            float lit = sky > block ? sky : block;
            return 0.15f + lit * 0.85f;
        }

        // ---- Editing ----------------------------------------------------------

        /// <summary>
        /// Places or removes a block, updates lighting and marks affected meshes.
        /// Main thread only.
        /// </summary>
        public bool SetBlock(int x, int y, int z, byte id, bool recordEdit)
        {
            if (y < 0 || y > Constants.MaxBlockY) return false;

            ChunkColumn column = GetColumn(x >> Constants.ChunkShift, z >> Constants.ChunkShift);
            if (column == null || column.State < ColumnState.Generated) return false;

            int lx = x & Constants.ChunkMask;
            int lz = z & Constants.ChunkMask;

            byte old = column.GetBlock(lx, y, lz);
            if (old == id) return false;

            column.SetBlock(lx, y, lz, id);
            column.RefreshHeight(lx, lz);
            if (recordEdit) RecordEdit(column, lx, y, lz, id);

            _light.OnBlockChanged(x, y, z, old, id);
            MarkNeighbourhoodDirty(x, y, z);
            return true;
        }

        /// <summary>
        /// Dirties every section whose geometry could have referenced this block. Ambient
        /// occlusion samples a 3x3x3 neighbourhood, so an edit on a section boundary
        /// changes the shading of the section next door as well.
        /// </summary>
        public void MarkNeighbourhoodDirty(int x, int y, int z)
        {
            for (int dz = -1; dz <= 1; dz++)
            {
                for (int dy = -1; dy <= 1; dy++)
                {
                    for (int dx = -1; dx <= 1; dx++)
                    {
                        MarkSectionDirty(x + dx, y + dy, z + dz);
                    }
                }
            }
        }

        public void MarkSectionDirty(int x, int y, int z)
        {
            if (y < 0 || y > Constants.MaxBlockY) return;
            ChunkColumn column = GetColumn(x >> Constants.ChunkShift, z >> Constants.ChunkShift);
            if (column == null) return;
            Chunk section = column.Sections[y >> Constants.ChunkShift];
            section.MeshDirty = true;
            section.Version++;
        }

        /// <summary>Stores an edit in the world-level table, creating the column's entry on demand.</summary>
        private void RecordEdit(ChunkColumn column, int lx, int y, int lz, byte id)
        {
            if (column.Edits == null)
            {
                long key = column.Key_;
                if (!_edits.TryGetValue(key, out column.Edits))
                {
                    column.Edits = new Dictionary<int, byte>(64);
                    _edits[key] = column.Edits;
                }
            }
            column.Edits[ChunkColumn.EditKey(lx, y, lz)] = id;
        }

        /// <summary>The full edit table, for the save system.</summary>
        public Dictionary<long, Dictionary<int, byte>> Edits
        {
            get { return _edits; }
        }

        /// <summary>Replaces the edit table wholesale. Used when loading a save.</summary>
        public void RestoreEdits(Dictionary<long, Dictionary<int, byte>> edits)
        {
            _edits.Clear();
            foreach (KeyValuePair<long, Dictionary<int, byte>> entry in edits)
            {
                _edits[entry.Key] = entry.Value;
            }
        }

        /// <summary>Highest non-liquid block at this position, or -1 if the column is not loaded.</summary>
        public int SurfaceHeight(int x, int z)
        {
            ChunkColumn column = GetColumn(x >> Constants.ChunkShift, z >> Constants.ChunkShift);
            if (column == null || column.State < ColumnState.Generated) return -1;
            return column.HeightAt(x & Constants.ChunkMask, z & Constants.ChunkMask);
        }

        // ---- Streaming --------------------------------------------------------

        /// <summary>
        /// Requests columns around the viewer and evicts the ones that have fallen outside
        /// the keep radius. Called once per frame from the main thread.
        /// </summary>
        public void UpdateStreaming(Vector3 viewer)
        {
            int centreCx = (int)System.Math.Floor(viewer.X) >> Constants.ChunkShift;
            int centreCz = (int)System.Math.Floor(viewer.Z) >> Constants.ChunkShift;

            // Request in rings so the columns nearest the player generate first.
            for (int ring = 0; ring <= _viewRadius; ring++)
            {
                if (!_worker.HasGenerationCapacity) break;

                for (int dz = -ring; dz <= ring; dz++)
                {
                    for (int dx = -ring; dx <= ring; dx++)
                    {
                        // Only the outer edge of each ring is new.
                        int adx = dx < 0 ? -dx : dx;
                        int adz = dz < 0 ? -dz : dz;
                        if (adx != ring && adz != ring) continue;

                        int cx = centreCx + dx;
                        int cz = centreCz + dz;
                        if (_columns.ContainsKey(ChunkColumn.Key(cx, cz))) continue;
                        if (!_worker.HasGenerationCapacity) break;

                        ChunkColumn column = new ChunkColumn(cx, cz);
                        // Re-attach anything the player previously built here, so the
                        // generator can replay it on top of fresh terrain.
                        _edits.TryGetValue(column.Key_, out column.Edits);
                        column.State = ColumnState.Queued;
                        _columns[column.Key_] = column;
                        _columnList.Add(column);
                        InvalidateColumnCache();
                        _worker.EnqueueGeneration(column);
                    }
                }
            }

            EvictDistantColumns(centreCx, centreCz);
            ReleasePending();
        }

        private void EvictDistantColumns(int centreCx, int centreCz)
        {
            int keep = _viewRadius + 2;

            for (int i = _columnList.Count - 1; i >= 0; i--)
            {
                ChunkColumn column = _columnList[i];
                int dx = column.Cx - centreCx;
                int dz = column.Cz - centreCz;
                if (dx < 0) dx = -dx;
                if (dz < 0) dz = -dz;
                if (dx <= keep && dz <= keep) continue;
                if (column.State == ColumnState.Queued || column.State == ColumnState.Generating) continue;

                _columnList.RemoveAt(i);
                _columns.Remove(column.Key_);
                column.State = ColumnState.Unloading;

                // Free GPU memory immediately; voxel arrays wait until no worker is
                // reading them.
                for (int s = 0; s < column.Sections.Length; s++) column.Sections[s].ReleaseGraphics();
                _pendingRelease.Add(column);
                InvalidateColumnCache();
            }
        }

        /// <summary>
        /// Returns pooled storage for evicted columns. A column whose mesh job is still in
        /// flight waits one more frame: the worker only reads its own snapshot, but the
        /// upload step still needs the section object to be alive.
        /// </summary>
        private void ReleasePending()
        {
            for (int i = _pendingRelease.Count - 1; i >= 0; i--)
            {
                ChunkColumn column = _pendingRelease[i];
                if (HasMeshJobInFlight(column)) continue;
                column.Release();
                _pendingRelease.RemoveAt(i);
            }
        }

        private static bool HasMeshJobInFlight(ChunkColumn column)
        {
            for (int s = 0; s < column.Sections.Length; s++)
            {
                if (column.Sections[s].MeshQueued) return true;
            }
            return false;
        }

        private void InvalidateColumnCache()
        {
            _cachedCx = int.MinValue;
            _cachedCz = int.MinValue;
            _cachedColumn = null;
        }

        /// <summary>
        /// Takes a freshly generated column from the worker and makes it part of the world:
        /// light it, then dirty it and its neighbours so the seams between them re-mesh.
        /// </summary>
        public void IntegrateGeneratedColumn(ChunkColumn column)
        {
            if (column.State == ColumnState.Unloading) return;

            _light.LightColumn(column);
            column.State = ColumnState.Generated;
            column.MarkAllSectionsDirty();

            DirtyNeighbourColumn(column.Cx - 1, column.Cz);
            DirtyNeighbourColumn(column.Cx + 1, column.Cz);
            DirtyNeighbourColumn(column.Cx, column.Cz - 1);
            DirtyNeighbourColumn(column.Cx, column.Cz + 1);
        }

        private void DirtyNeighbourColumn(int cx, int cz)
        {
            ChunkColumn n = GetColumn(cx, cz);
            if (n != null && n.State >= ColumnState.Generated) n.MarkAllSectionsDirty();
        }

        /// <summary>Drops every column but keeps the edit table.</summary>
        public void Clear()
        {
            _worker.DrainQueues();

            for (int i = 0; i < _columnList.Count; i++)
            {
                _columnList[i].State = ColumnState.Unloading;
                _pendingRelease.Add(_columnList[i]);
            }
            _columnList.Clear();
            _columns.Clear();
            InvalidateColumnCache();
            ReleasePending();
        }

        public void Shutdown()
        {
            _worker.Shutdown();
            Clear();
        }
    }
}
