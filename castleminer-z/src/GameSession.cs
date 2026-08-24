using Microsoft.Xna.Framework;
using CastleMinerZ.Core;
using CastleMinerZ.Entities;
using CastleMinerZ.Graphics;
using CastleMinerZ.Items;
using CastleMinerZ.Net;
using CastleMinerZ.World;

namespace CastleMinerZ
{
    /// <summary>
    /// One run of the game: the world, the player, everything alive in it, and the fixed
    /// timestep that drives them.
    ///
    /// Simulation is decoupled from rendering. Whatever frame rate the console manages,
    /// gameplay advances in 1/60 second steps, so mining times, fire rates and fall damage
    /// stay identical while the world is streaming and the frame rate is dipping.
    /// </summary>
    public sealed class GameSession
    {
        /// <summary>Short-lived HUD line, e.g. a pickup notice.</summary>
        public struct Notice
        {
            public string Text;
            public float TimeLeft;
        }

        public const int MaxNotices = 4;

        public readonly World.World World;
        public readonly LocalPlayer Player = new LocalPlayer();
        public readonly EnemyManager Enemies = new EnemyManager();
        public readonly ProjectileManager Projectiles = new ProjectileManager();
        public readonly ItemDropManager Drops = new ItemDropManager();
        public readonly ParticleSystem Particles = new ParticleSystem();
        public readonly SoundManager Audio;
        public readonly NetworkManager Network;
        public readonly GameStats Stats = new GameStats();
        public readonly GameSettings Settings;

        private readonly Notice[] _notices = new Notice[MaxNotices];
        private int _noticeCount;

        /// <summary>Large centred message, used for events like a dragon arriving.</summary>
        public string BannerText;
        public float BannerTime;

        private float _accumulator;
        private uint _rng = 0x9E3779B9u;

        /// <summary>Where the player respawns. Always the world origin, as the danger model depends on it.</summary>
        public Vector3 SpawnPoint;

        public float DeathTimer;
        public bool AwaitingRespawn;

        public GameSession(int seed, GameSettings settings, SoundManager audio, NetworkManager network)
        {
            Settings = settings;
            Audio = audio;
            Network = network;

            BlockRegistry.Initialise();
            Biomes.Initialise();
            ItemRegistry.Initialise();
            RecipeBook.Initialise();
            EnemyManager.InitialiseTypes();

            World = new World.World(seed);
            World.ViewRadius = settings.ViewRadius;
            _rng = (uint)(seed * 2654435761u + 1u);
            if (_rng == 0) _rng = 1u;
        }

        public Notice[] Notices
        {
            get { return _notices; }
        }

        public int NoticeCount
        {
            get { return _noticeCount; }
        }

        // ---- Lifecycle --------------------------------------------------------

        /// <summary>
        /// Places the player on the surface at the origin. Terrain has to exist first, so
        /// this waits for the spawn column rather than dropping the player into thin air.
        /// </summary>
        public void PlacePlayerAtSpawn(bool giveStartingGear)
        {
            World.UpdateStreaming(Vector3.Zero);

            int guard = 0;
            while (!World.IsColumnReady(0, 0) && guard < 2000)
            {
                World.Worker.IntegrateGeneratedColumns(8);
                World.UpdateStreaming(Vector3.Zero);
                System.Threading.Thread.Sleep(1);
                guard++;
            }

            int surface = World.SurfaceHeight(0, 0);
            if (surface < 1) surface = Constants.SeaLevel + 4;

            SpawnPoint = new Vector3(0.5f, surface + 0.2f, 0.5f);
            Player.Respawn(SpawnPoint);
            if (giveStartingGear) Player.Inventory.GiveStartingGear();
        }

        public void Respawn()
        {
            AwaitingRespawn = false;
            DeathTimer = 0.0f;

            int surface = World.SurfaceHeight(0, 0);
            if (surface < 1) surface = Constants.SeaLevel + 4;
            SpawnPoint = new Vector3(0.5f, surface + 0.2f, 0.5f);

            Player.Respawn(SpawnPoint);
            Enemies.Clear();
            Projectiles.Clear();
        }

        // ---- Update -----------------------------------------------------------

        /// <summary>
        /// Advances the simulation. <paramref name="paused"/> still streams terrain so a
        /// paused game finishes loading the world around the player.
        /// </summary>
        public void Update(float elapsed, PlayerCommand command, bool paused)
        {
            if (elapsed > 0.25f) elapsed = 0.25f;

            if (!paused)
            {
                _accumulator += elapsed;

                int steps = 0;
                while (_accumulator >= Constants.FixedTimeStep && steps < Constants.MaxCatchUpSteps)
                {
                    Step(command, Constants.FixedTimeStep);
                    _accumulator -= Constants.FixedTimeStep;
                    steps++;

                    // Only the first step of a frame consumes the edge-triggered inputs,
                    // otherwise one trigger pull would fire several times on a slow frame.
                    command = StripEdges(command);
                }

                if (steps == Constants.MaxCatchUpSteps) _accumulator = 0.0f;
            }

#if MONOGAME
            World.RebakeLightingIfSunMoved();
#endif
            World.UpdateStreaming(Player.Position);
            World.Worker.IntegrateGeneratedColumns(2);
            World.Worker.SubmitDirtySections(Player.Position, ChunkWorker.MeshJobsPerFrame);

            UpdateNotices(elapsed);
        }

        private static PlayerCommand StripEdges(PlayerCommand command)
        {
            command.JumpPressed = false;
            command.AttackPressed = false;
            command.UsePressed = false;
            command.ReloadPressed = false;
            command.FlashlightPressed = false;
            command.InventoryPressed = false;
            command.CraftPressed = false;
            command.PausePressed = false;
            command.HotbarDelta = 0;
            command.HotbarSlot = -1;
            return command;
        }

        private void Step(PlayerCommand command, float dt)
        {
            Stats.TimePlayed += dt;
            World.AdvanceTime(dt);

            Player.Control(this, command, dt);

            if (Player.IsDead && !AwaitingRespawn)
            {
                OnPlayerDied();
            }

            Enemies.Update(this, dt);
            Projectiles.Update(this, dt);
            Drops.Update(this, dt);
            Particles.Update(World, dt);
            Network.Update(this, dt);

            if (Player.FurthestDistance > Stats.FurthestDistance)
                Stats.FurthestDistance = Player.FurthestDistance;

            if (AwaitingRespawn) DeathTimer += dt;
        }

        private void OnPlayerDied()
        {
            AwaitingRespawn = true;
            DeathTimer = 0.0f;
            Stats.Deaths++;
            Audio.Play2D(SoundId.Hurt, 1.0f, -0.4f);

            if (!Settings.DropItemsOnDeath) return;

            // Everything you were carrying stays where you fell. Walking 6 km out is only a
            // real decision if losing the trip actually costs something.
            Vector3 grave = Player.Position + new Vector3(0.0f, 0.6f, 0.0f);
            Inventory inventory = Player.Inventory;

            for (int i = 0; i < Inventory.TotalSlots; i++)
            {
                ItemStack stack = inventory[i];
                if (stack.IsEmpty) continue;
                Drops.Spawn(grave, stack.Id, stack.Count);
                inventory[i] = ItemStack.Empty;
            }
        }

        public void OnEnemyKilled(Enemy enemy)
        {
            Stats.Kills++;
            Stats.Score += enemy.Type.ScoreValue;

            if (enemy.Type.Kind == EnemyKind.Dragon)
            {
                Stats.DragonsSlain++;
                ShowBanner("DRAGON SLAIN");
            }

            Vector3 at = enemy.Position + new Vector3(0.0f, enemy.Height * 0.4f, 0.0f);
            Particles.SpawnBlood(at);

            if (enemy.Type.DropItem != Item.None && NextFloat() <= enemy.Type.DropChance)
            {
                Drops.Spawn(at, enemy.Type.DropItem, enemy.Type.DropCount);
            }

            enemy.Removed = true;
        }

        /// <summary>Blows a spherical crater in the terrain and relights the hole.</summary>
        public void Explode(Vector3 centre, float radius)
        {
            int minX = (int)System.Math.Floor(centre.X - radius);
            int maxX = (int)System.Math.Floor(centre.X + radius);
            int minY = (int)System.Math.Floor(centre.Y - radius);
            int maxY = (int)System.Math.Floor(centre.Y + radius);
            int minZ = (int)System.Math.Floor(centre.Z - radius);
            int maxZ = (int)System.Math.Floor(centre.Z + radius);

            float radiusSquared = radius * radius;

            for (int y = minY; y <= maxY; y++)
            {
                if (y < 1 || y > Constants.MaxBlockY) continue;

                for (int z = minZ; z <= maxZ; z++)
                {
                    for (int x = minX; x <= maxX; x++)
                    {
                        float dx = x + 0.5f - centre.X;
                        float dy = y + 0.5f - centre.Y;
                        float dz = z + 0.5f - centre.Z;
                        if (dx * dx + dy * dy + dz * dz > radiusSquared) continue;

                        byte id = World.GetBlock(x, y, z);
                        if (id == Block.Air || id == Block.Bedrock) continue;

                        BlockDefinition def = BlockRegistry.Get(id);
                        if (def.Hardness < 0.0f) continue;
                        // Obsidian and dragon stone shrug off explosives.
                        if (def.Hardness > 20.0f) continue;

                        World.SetBlock(x, y, z, Block.Air, true);
                        Network.BroadcastBlockChange(x, y, z, Block.Air);
                    }
                }
            }

            // A blast this close to the player is worth feeling.
            float distance = Vector3.Distance(centre, Player.Position);
            if (distance < radius * 2.5f) Player.DamageFlash = 0.5f;
        }

        // ---- HUD notices ------------------------------------------------------

        public void ShowBanner(string text)
        {
            BannerText = text;
            BannerTime = 3.0f;
        }

        public void ShowPickup(byte itemId, int count)
        {
            AddNotice("+" + count + " " + ItemRegistry.NameOf(itemId));
        }

        public void AddNotice(string text)
        {
            // Newest at the top; the oldest falls off the end.
            for (int i = MaxNotices - 1; i > 0; i--) _notices[i] = _notices[i - 1];

            _notices[0].Text = text;
            _notices[0].TimeLeft = 3.5f;
            if (_noticeCount < MaxNotices) _noticeCount++;
        }

        private void UpdateNotices(float dt)
        {
            for (int i = 0; i < _noticeCount; i++)
            {
                _notices[i].TimeLeft -= dt;
            }
            while (_noticeCount > 0 && _notices[_noticeCount - 1].TimeLeft <= 0.0f) _noticeCount--;

            if (BannerTime > 0.0f) BannerTime -= dt;
        }

        // ---- Shared randomness ------------------------------------------------

        /// <summary>
        /// Gameplay randomness. Deliberately not <see cref="System.Random"/>: this is called
        /// from spawn checks and weapon spread every frame, and the struct-free xorshift
        /// keeps it off the heap.
        /// </summary>
        public float NextFloat()
        {
            _rng ^= _rng << 13;
            _rng ^= _rng >> 17;
            _rng ^= _rng << 5;
            return (_rng >> 8) * (1.0f / 16777216.0f);
        }

        public float NextSpread(float amount)
        {
            return (NextFloat() * 2.0f - 1.0f) * amount;
        }

        public void Shutdown()
        {
            World.Shutdown();
        }
    }
}
