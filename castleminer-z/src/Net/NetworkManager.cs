using System.Collections.Generic;
using Microsoft.Xna.Framework;
#if XNA_NET
using Microsoft.Xna.Framework.Net;
using Microsoft.Xna.Framework.GamerServices;
#endif

namespace CastleMinerZ.Net
{
    /// <summary>Message ids on the wire. One byte, first thing in every packet.</summary>
    public enum PacketType : byte
    {
        PlayerState = 1,
        BlockChange = 2,
        EnemySnapshot = 3,
        EnemyRemoved = 4,
        PlayerDamaged = 5,
        WorldInfo = 6
    }

    /// <summary>A remote player, as far as this machine is concerned.</summary>
    public sealed class RemotePlayer
    {
        public string Name;
        public Vector3 Position;
        public Vector3 PreviousPosition;

        /// <summary>Target the local machine interpolates toward, to hide packet jitter.</summary>
        public Vector3 TargetPosition;

        public float Yaw;
        public int Health;
        public byte HeldItem;
        public bool Active;
    }

    /// <summary>
    /// Four-player co-op over Xbox LIVE, host authoritative.
    ///
    /// The host owns enemy spawning, enemy positions and damage resolution; clients own
    /// their own movement and send block edits, which the host echoes to everyone. That
    /// split matters on a voxel game: terrain edits are small and rare enough to broadcast
    /// reliably, while enemy positions are large and constant and go out unreliably at a
    /// fixed tick, letting the client interpolate.
    ///
    /// The whole networking layer lives behind XNA_NET. MonoGame has no
    /// Microsoft.Xna.Framework.Net, so the desktop build compiles against the stubs at the
    /// bottom of this file and runs single-player.
    /// </summary>
    public sealed class NetworkManager
    {
        public const int MaxPlayers = 4;

        /// <summary>Enemy snapshots go out at 10 Hz; anything faster saturates the session.</summary>
        private const float SnapshotInterval = 0.1f;

        /// <summary>Player transforms go out at 20 Hz.</summary>
        private const float StateInterval = 0.05f;

        private readonly RemotePlayer[] _remotes = new RemotePlayer[MaxPlayers];
        private readonly List<PendingBlockChange> _outgoingBlocks = new List<PendingBlockChange>(64);

        private float _snapshotTimer;
        private float _stateTimer;

        private struct PendingBlockChange
        {
            public int X, Y, Z;
            public byte Id;
        }

        public NetworkManager()
        {
            for (int i = 0; i < MaxPlayers; i++) _remotes[i] = new RemotePlayer();
        }

        public RemotePlayer[] Remotes
        {
            get { return _remotes; }
        }

        public bool IsActive
        {
            get { return SessionActive; }
        }

        /// <summary>True in single player, and true on the host. Decides who simulates enemies.</summary>
        public bool IsAuthority
        {
            get { return !SessionActive || SessionIsHost; }
        }

        /// <summary>Queues a terrain edit for the next outgoing batch.</summary>
        public void BroadcastBlockChange(int x, int y, int z, byte id)
        {
            if (!SessionActive) return;

            PendingBlockChange change;
            change.X = x;
            change.Y = y;
            change.Z = z;
            change.Id = id;
            _outgoingBlocks.Add(change);
        }

        public void Update(GameSession session, float dt)
        {
            if (!SessionActive)
            {
                _outgoingBlocks.Clear();
                return;
            }

            _stateTimer -= dt;
            _snapshotTimer -= dt;

            ReceiveAll(session);

            if (_stateTimer <= 0.0f)
            {
                _stateTimer = StateInterval;
                SendLocalPlayerState(session);
            }

            if (_outgoingBlocks.Count > 0)
            {
                SendBlockChanges(session);
                _outgoingBlocks.Clear();
            }

            if (SessionIsHost && _snapshotTimer <= 0.0f)
            {
                _snapshotTimer = SnapshotInterval;
                SendEnemySnapshot(session);
            }

            InterpolateRemotes(dt);
            PumpSession();
        }

        /// <summary>Smooths remote players toward their last received position.</summary>
        private void InterpolateRemotes(float dt)
        {
            float blend = MathHelper.Clamp(dt * 12.0f, 0.0f, 1.0f);
            for (int i = 0; i < MaxPlayers; i++)
            {
                if (!_remotes[i].Active) continue;
                _remotes[i].PreviousPosition = _remotes[i].Position;
                _remotes[i].Position = Vector3.Lerp(_remotes[i].Position, _remotes[i].TargetPosition, blend);
            }
        }

#if XNA_NET
        private NetworkSession _session;
        private PacketWriter _writer = new PacketWriter(1024);
        private PacketReader _reader = new PacketReader(1024);

        private bool SessionActive
        {
            get { return _session != null && _session.SessionState != NetworkSessionState.Ended; }
        }

        private bool SessionIsHost
        {
            get { return _session != null && _session.IsHost; }
        }

        public NetworkSession Session
        {
            get { return _session; }
        }

        /// <summary>Creates a LIVE session. The caller must have a signed-in gamer first.</summary>
        public void HostSession(int worldSeed)
        {
            LeaveSession();
            _session = NetworkSession.Create(NetworkSessionType.PlayerMatch, MaxPlayers, MaxPlayers);
            _session.AllowHostMigration = false;
            _session.AllowJoinInProgress = true;
            _session.GamerJoined += OnGamerJoined;
            _session.GamerLeft += OnGamerLeft;

            _session.SessionProperties[0] = worldSeed;
            _session.StartGame();
        }

        public AvailableNetworkSessionCollection FindSessions()
        {
            return NetworkSession.Find(NetworkSessionType.PlayerMatch, MaxPlayers, null);
        }

        public void JoinSession(AvailableNetworkSession available)
        {
            LeaveSession();
            _session = NetworkSession.Join(available);
            _session.GamerJoined += OnGamerJoined;
            _session.GamerLeft += OnGamerLeft;
        }

        public void LeaveSession()
        {
            if (_session == null) return;
            _session.Dispose();
            _session = null;

            for (int i = 0; i < MaxPlayers; i++) _remotes[i].Active = false;
        }

        private void OnGamerJoined(object sender, GamerJoinedEventArgs e)
        {
            int slot = SlotFor(e.Gamer);
            if (slot < 0) return;
            _remotes[slot].Active = !e.Gamer.IsLocal;
            _remotes[slot].Name = e.Gamer.Gamertag;
            _remotes[slot].Health = Constants.PlayerMaxHealth;
        }

        private void OnGamerLeft(object sender, GamerLeftEventArgs e)
        {
            int slot = SlotFor(e.Gamer);
            if (slot >= 0) _remotes[slot].Active = false;
        }

        private int SlotFor(NetworkGamer gamer)
        {
            for (int i = 0; i < _session.AllGamers.Count && i < MaxPlayers; i++)
            {
                if (_session.AllGamers[i] == gamer) return i;
            }
            return -1;
        }

        private LocalNetworkGamer LocalGamer
        {
            get { return _session.LocalGamers.Count > 0 ? _session.LocalGamers[0] : null; }
        }

        private void SendLocalPlayerState(GameSession session)
        {
            LocalNetworkGamer local = LocalGamer;
            if (local == null) return;

            _writer.Write((byte)PacketType.PlayerState);
            _writer.Write(session.Player.Position);
            _writer.Write(session.Player.Yaw);
            _writer.Write((short)session.Player.Health);
            _writer.Write(session.Player.Inventory.Selected.Id);
            local.SendData(_writer, SendDataOptions.InOrder);
        }

        private void SendBlockChanges(GameSession session)
        {
            LocalNetworkGamer local = LocalGamer;
            if (local == null) return;

            _writer.Write((byte)PacketType.BlockChange);
            _writer.Write((short)_outgoingBlocks.Count);
            for (int i = 0; i < _outgoingBlocks.Count; i++)
            {
                _writer.Write(_outgoingBlocks[i].X);
                _writer.Write((short)_outgoingBlocks[i].Y);
                _writer.Write(_outgoingBlocks[i].Z);
                _writer.Write(_outgoingBlocks[i].Id);
            }
            // Terrain edits must never be dropped: a missed one desynchronises the world.
            local.SendData(_writer, SendDataOptions.ReliableInOrder);
        }

        private void SendEnemySnapshot(GameSession session)
        {
            LocalNetworkGamer local = LocalGamer;
            if (local == null) return;

            List<Entities.Enemy> enemies = session.Enemies.Active;
            int count = enemies.Count;
            if (count > 48) count = 48;

            _writer.Write((byte)PacketType.EnemySnapshot);
            _writer.Write((short)count);
            for (int i = 0; i < count; i++)
            {
                Entities.Enemy enemy = enemies[i];
                _writer.Write((byte)enemy.Type.Kind);
                _writer.Write(enemy.Position);
                _writer.Write(enemy.Yaw);
                _writer.Write((short)enemy.Health);
            }
            // Positions are superseded every tick, so dropping one costs nothing.
            local.SendData(_writer, SendDataOptions.None);
        }

        private void ReceiveAll(GameSession session)
        {
            LocalNetworkGamer local = LocalGamer;
            if (local == null) return;

            while (local.IsDataAvailable)
            {
                NetworkGamer sender;
                local.ReceiveData(_reader, out sender);
                if (sender.IsLocal) continue;

                PacketType type = (PacketType)_reader.ReadByte();
                switch (type)
                {
                    case PacketType.PlayerState:
                        ReadPlayerState(sender);
                        break;

                    case PacketType.BlockChange:
                        ReadBlockChanges(session);
                        break;

                    case PacketType.EnemySnapshot:
                        ReadEnemySnapshot(session);
                        break;
                }
            }
        }

        private void ReadPlayerState(NetworkGamer sender)
        {
            Vector3 position = _reader.ReadVector3();
            float yaw = _reader.ReadSingle();
            short health = _reader.ReadInt16();
            byte held = _reader.ReadByte();

            int slot = SlotFor(sender);
            if (slot < 0) return;

            _remotes[slot].Active = true;
            _remotes[slot].Name = sender.Gamertag;
            _remotes[slot].TargetPosition = position;
            _remotes[slot].Yaw = yaw;
            _remotes[slot].Health = health;
            _remotes[slot].HeldItem = held;
        }

        private void ReadBlockChanges(GameSession session)
        {
            short count = _reader.ReadInt16();
            for (int i = 0; i < count; i++)
            {
                int x = _reader.ReadInt32();
                short y = _reader.ReadInt16();
                int z = _reader.ReadInt32();
                byte id = _reader.ReadByte();

                // recordEdit is true so remote edits also persist into this machine's save.
                session.World.SetBlock(x, y, z, id, true);
            }
        }

        private void ReadEnemySnapshot(GameSession session)
        {
            // Clients mirror the host's list wholesale: their local spawner is disabled, so
            // the snapshot is the only source of truth for what exists.
            short count = _reader.ReadInt16();
            session.Enemies.Clear();

            for (int i = 0; i < count; i++)
            {
                Entities.EnemyKind kind = (Entities.EnemyKind)_reader.ReadByte();
                Vector3 position = _reader.ReadVector3();
                float yaw = _reader.ReadSingle();
                short health = _reader.ReadInt16();

                Entities.Enemy enemy = session.Enemies.Spawn(kind, position);
                enemy.Yaw = yaw;
                enemy.Health = health;
            }
        }

        private void PumpSession()
        {
            if (_session != null) _session.Update();
        }
#else
        // ---- Single-player stubs (MonoGame / desktop build) -------------------

        // Properties rather than consts so the shared code above does not compile down to
        // unreachable branches in this configuration.
        private bool SessionActive
        {
            get { return false; }
        }

        private bool SessionIsHost
        {
            get { return true; }
        }

        public void HostSession(int worldSeed) { }
        public void JoinSession(object available) { }
        public void LeaveSession() { }

        private void SendLocalPlayerState(GameSession session) { }
        private void SendBlockChanges(GameSession session) { }
        private void SendEnemySnapshot(GameSession session) { }
        private void ReceiveAll(GameSession session) { }
        private void PumpSession() { }
#endif
    }
}
