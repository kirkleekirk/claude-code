using System.Collections.Generic;

namespace CastleMinerZ.Core
{
    /// <summary>
    /// Fixed-length array pool.
    ///
    /// The Xbox 360 CLR uses a non-generational, non-compacting-by-default collector that
    /// runs a full collection roughly every megabyte allocated. Streaming chunks in and out
    /// churns through 4 KB arrays fast enough to cause a visible hitch every couple of
    /// seconds, so every voxel/light array in the game comes from here and goes back when
    /// its column is evicted.
    /// </summary>
    public sealed class ArrayPool<T>
    {
        private readonly Stack<T[]> _free;
        private readonly int _length;
        private readonly int _cap;
        private readonly object _sync = new object();

        private int _liveCount;

        public ArrayPool(int arrayLength, int prewarm, int cap)
        {
            _length = arrayLength;
            _cap = cap;
            _free = new Stack<T[]>(prewarm);
            for (int i = 0; i < prewarm; i++) _free.Push(new T[arrayLength]);
        }

        /// <summary>Arrays currently checked out. Useful for spotting leaks in the debug overlay.</summary>
        public int LiveCount
        {
            get { lock (_sync) { return _liveCount; } }
        }

        public int FreeCount
        {
            get { lock (_sync) { return _free.Count; } }
        }

        public T[] Rent()
        {
            lock (_sync)
            {
                _liveCount++;
                if (_free.Count > 0) return _free.Pop();
            }
            return new T[_length];
        }

        /// <summary>Returns an array, zeroing it so callers always get clean storage.</summary>
        public void Return(T[] array)
        {
            if (array == null || array.Length != _length) return;
            System.Array.Clear(array, 0, array.Length);
            lock (_sync)
            {
                _liveCount--;
                if (_free.Count < _cap) _free.Push(array);
            }
        }
    }

    /// <summary>Shared pools. Sized for the worst case of a full view radius being rebuilt.</summary>
    public static class Pools
    {
        /// <summary>Block id storage, one per chunk section.</summary>
        public static readonly ArrayPool<byte> SectionBytes =
            new ArrayPool<byte>(Constants.BlocksPerSection, 96, 1400);

        /// <summary>Per-column heightmap.</summary>
        public static readonly ArrayPool<byte> ColumnHeights =
            new ArrayPool<byte>(Constants.ChunkSize * Constants.ChunkSize, 32, 220);

        /// <summary>
        /// 18^3 padded neighbourhood snapshots handed to the mesher thread, so it never
        /// touches live world state while the main thread is editing it.
        /// </summary>
        public static readonly ArrayPool<byte> MeshScratch =
            new ArrayPool<byte>(18 * 18 * 18, 6, 12);
    }
}
