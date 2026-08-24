using System.Collections.Generic;
using System.IO;
using Microsoft.Xna.Framework;
#if XBOX360
using Microsoft.Xna.Framework.GamerServices;
using Microsoft.Xna.Framework.Storage;
#endif
using CastleMinerZ.Items;
using CastleMinerZ.World;

namespace CastleMinerZ.Save
{
    /// <summary>
    /// Reads and writes the save file.
    ///
    /// The file stores the world seed and the list of blocks the player has changed --
    /// never the generated terrain. A world the player has walked twenty kilometres across
    /// is still a few hundred kilobytes, because everything they did not touch is
    /// reproducible from the seed. On a platform where a save slot is measured in blocks of
    /// 8 KB, that is the difference between shipping and not.
    ///
    /// On Xbox the file lives in a StorageContainer obtained through the guide's device
    /// selector; everywhere else it is a plain file next to the executable.
    /// </summary>
    public sealed class SaveManager
    {
        private const int Magic = 0x435A5631;   // 'CZV1'
        private const int Version = 1;
        private const string FileName = "world.sav";
        private const string ContainerName = "CastleMinerZ";

        public bool IsReady { get; private set; }
        public string LastError { get; private set; }

#if XBOX360
        private StorageDevice _device;
        private IAsyncResult _pendingSelector;
        private bool _selectorRequested;
#endif

        /// <summary>
        /// Must be pumped every frame. On Xbox this drives the asynchronous device
        /// selector, which cannot be waited on from the main thread.
        /// </summary>
        public void Update()
        {
#if XBOX360
            if (_pendingSelector != null && _pendingSelector.IsCompleted)
            {
                _device = StorageDevice.EndShowSelector(_pendingSelector);
                _pendingSelector = null;
                IsReady = _device != null && _device.IsConnected;
            }
#else
            IsReady = true;
#endif
        }

        /// <summary>
        /// Asks the player which storage device to use. Required before any save on Xbox,
        /// and it has to wait until the guide is not already showing something.
        /// </summary>
        public void RequestStorageDevice()
        {
#if XBOX360
            if (_selectorRequested || _pendingSelector != null) return;
            if (Guide.IsVisible) return;

            _selectorRequested = true;
            _pendingSelector = StorageDevice.BeginShowSelector(PlayerIndex.One, null, null);
#else
            IsReady = true;
#endif
        }

        public bool SaveExists()
        {
#if XBOX360
            if (_device == null || !_device.IsConnected) return false;

            StorageContainer container = OpenContainer();
            if (container == null) return false;
            try
            {
                return container.FileExists(FileName);
            }
            finally
            {
                container.Dispose();
            }
#else
            return File.Exists(DesktopPath);
#endif
        }

        public bool Save(GameSession session)
        {
            LastError = null;
            try
            {
                Stream stream = OpenWrite();
                if (stream == null) return false;

                try
                {
                    BinaryWriter writer = new BinaryWriter(stream);
                    WriteSave(writer, session);
                    writer.Flush();
                }
                finally
                {
                    stream.Dispose();
                    CloseContainer();
                }
                return true;
            }
            catch (IOException e)
            {
                LastError = e.Message;
                return false;
            }
        }

        public bool Load(GameSession session)
        {
            LastError = null;
            try
            {
                Stream stream = OpenRead();
                if (stream == null) return false;

                try
                {
                    BinaryReader reader = new BinaryReader(stream);
                    return ReadSave(reader, session);
                }
                finally
                {
                    stream.Dispose();
                    CloseContainer();
                }
            }
            catch (EndOfStreamException e)
            {
                // A truncated save is worth naming specifically: it usually means the
                // storage device was pulled mid-write.
                LastError = "Save file is truncated: " + e.Message;
                return false;
            }
            catch (IOException e)
            {
                LastError = e.Message;
                return false;
            }
        }

        /// <summary>Reads just the seed, so the menu can show what a saved world is without loading it.</summary>
        public bool PeekSeed(out int seed)
        {
            seed = 0;
            try
            {
                Stream stream = OpenRead();
                if (stream == null) return false;

                try
                {
                    BinaryReader reader = new BinaryReader(stream);
                    if (reader.ReadInt32() != Magic) return false;
                    reader.ReadInt32();
                    seed = reader.ReadInt32();
                    return true;
                }
                finally
                {
                    stream.Dispose();
                    CloseContainer();
                }
            }
            catch (IOException)
            {
                return false;
            }
        }

        // ---- Format -----------------------------------------------------------

        private static void WriteSave(BinaryWriter writer, GameSession session)
        {
            writer.Write(Magic);
            writer.Write(Version);
            writer.Write(session.World.Seed);
            writer.Write(session.World.TimeOfDay);

            // Player
            LocalPlayerState(writer, session);

            // Stats
            writer.Write(session.Stats.BlocksMined);
            writer.Write(session.Stats.BlocksPlaced);
            writer.Write(session.Stats.Kills);
            writer.Write(session.Stats.DragonsSlain);
            writer.Write(session.Stats.Deaths);
            writer.Write(session.Stats.Score);
            writer.Write(session.Stats.TimePlayed);
            writer.Write(session.Stats.FurthestDistance);

            // Terrain edits
            Dictionary<long, Dictionary<int, byte>> edits = session.World.Edits;

            int columnCount = 0;
            foreach (KeyValuePair<long, Dictionary<int, byte>> entry in edits)
            {
                if (entry.Value != null && entry.Value.Count > 0) columnCount++;
            }
            writer.Write(columnCount);

            foreach (KeyValuePair<long, Dictionary<int, byte>> entry in edits)
            {
                if (entry.Value == null || entry.Value.Count == 0) continue;

                writer.Write(entry.Key);
                writer.Write(entry.Value.Count);

                foreach (KeyValuePair<int, byte> edit in entry.Value)
                {
                    // Local index fits in 16 bits: y is 0..127, z and x are 0..15.
                    writer.Write((ushort)edit.Key);
                    writer.Write(edit.Value);
                }
            }
        }

        private static void LocalPlayerState(BinaryWriter writer, GameSession session)
        {
            Entities.LocalPlayer player = session.Player;

            writer.Write(player.Position.X);
            writer.Write(player.Position.Y);
            writer.Write(player.Position.Z);
            writer.Write(player.Yaw);
            writer.Write(player.Pitch);
            writer.Write(player.Health);
            writer.Write(player.FurthestDistance);

            writer.Write((byte)Inventory.TotalSlots);
            for (int i = 0; i < Inventory.TotalSlots; i++)
            {
                ItemStack stack = player.Inventory[i];
                writer.Write(stack.Id);
                writer.Write(stack.Count);
                writer.Write(stack.Data);
            }
            writer.Write((byte)player.Inventory.SelectedIndex);
        }

        private static bool ReadSave(BinaryReader reader, GameSession session)
        {
            if (reader.ReadInt32() != Magic) return false;

            int version = reader.ReadInt32();
            if (version != Version) return false;

            // The caller is responsible for having built the session with this seed; it is
            // read again here so a mismatch can be detected rather than silently generating
            // a different world under the player's buildings.
            int seed = reader.ReadInt32();
            if (seed != session.World.Seed) return false;

            session.World.TimeOfDay = reader.ReadSingle();

            Entities.LocalPlayer player = session.Player;
            float x = reader.ReadSingle();
            float y = reader.ReadSingle();
            float z = reader.ReadSingle();
            player.Position = new Vector3(x, y, z);
            player.Yaw = reader.ReadSingle();
            player.Pitch = reader.ReadSingle();
            player.Health = reader.ReadInt32();
            player.FurthestDistance = reader.ReadSingle();

            int slots = reader.ReadByte();
            player.Inventory.Clear();
            for (int i = 0; i < slots; i++)
            {
                byte id = reader.ReadByte();
                byte count = reader.ReadByte();
                ushort data = reader.ReadUInt16();
                if (i < Inventory.TotalSlots) player.Inventory[i] = new ItemStack(id, count, data);
            }
            player.Inventory.SelectedIndex = reader.ReadByte();

            session.Stats.BlocksMined = reader.ReadInt32();
            session.Stats.BlocksPlaced = reader.ReadInt32();
            session.Stats.Kills = reader.ReadInt32();
            session.Stats.DragonsSlain = reader.ReadInt32();
            session.Stats.Deaths = reader.ReadInt32();
            session.Stats.Score = reader.ReadInt64();
            session.Stats.TimePlayed = reader.ReadSingle();
            session.Stats.FurthestDistance = reader.ReadSingle();

            int columnCount = reader.ReadInt32();
            Dictionary<long, Dictionary<int, byte>> edits =
                new Dictionary<long, Dictionary<int, byte>>(columnCount);

            for (int c = 0; c < columnCount; c++)
            {
                long key = reader.ReadInt64();
                int count = reader.ReadInt32();

                Dictionary<int, byte> columnEdits = new Dictionary<int, byte>(count);
                for (int e = 0; e < count; e++)
                {
                    ushort local = reader.ReadUInt16();
                    byte block = reader.ReadByte();
                    columnEdits[local] = block;
                }
                edits[key] = columnEdits;
            }

            session.World.RestoreEdits(edits);
            return true;
        }

        // ---- Platform storage -------------------------------------------------

#if XBOX360
        private StorageContainer _openContainer;

        private StorageContainer OpenContainer()
        {
            if (_device == null || !_device.IsConnected) return null;

            IAsyncResult result = _device.BeginOpenContainer(ContainerName, null, null);
            result.AsyncWaitHandle.WaitOne();
            _openContainer = _device.EndOpenContainer(result);
            result.AsyncWaitHandle.Close();
            return _openContainer;
        }

        private Stream OpenWrite()
        {
            StorageContainer container = OpenContainer();
            if (container == null) return null;
            return container.CreateFile(FileName);
        }

        private Stream OpenRead()
        {
            StorageContainer container = OpenContainer();
            if (container == null) return null;
            if (!container.FileExists(FileName))
            {
                container.Dispose();
                _openContainer = null;
                return null;
            }
            return container.OpenFile(FileName, FileMode.Open, FileAccess.Read);
        }

        private void CloseContainer()
        {
            if (_openContainer != null)
            {
                _openContainer.Dispose();
                _openContainer = null;
            }
        }
#else
        private static string DesktopPath
        {
            get { return Path.Combine(System.AppDomain.CurrentDomain.BaseDirectory, FileName); }
        }

        private static Stream OpenWrite()
        {
            return new FileStream(DesktopPath, FileMode.Create, FileAccess.Write);
        }

        private static Stream OpenRead()
        {
            if (!File.Exists(DesktopPath)) return null;
            return new FileStream(DesktopPath, FileMode.Open, FileAccess.Read);
        }

        private static void CloseContainer() { }
#endif
    }
}
