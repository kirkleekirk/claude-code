using System.Collections.Generic;
using Microsoft.Xna.Framework;
using CastleMinerZ.Items;
using CastleMinerZ.World;

namespace CastleMinerZ.Entities
{
    /// <summary>
    /// Spawns, updates and recycles every hostile in the world.
    ///
    /// Which creatures exist at all is decided by how far the player has walked from spawn.
    /// Near the origin it is a handful of slow zombies at night; past six kilometres the
    /// same code is running hell spawn and dragons off the same table. That single rule is
    /// the whole difficulty curve.
    /// </summary>
    public sealed class EnemyManager
    {
        /// <summary>Enemies never spawn closer than this, so nothing appears in your face.</summary>
        private const float MinSpawnDistance = 18.0f;
        private const float MaxSpawnDistance = 42.0f;
        private const float DespawnDistance = 82.0f;

        private static readonly EnemyType[] Types = new EnemyType[5];
        private static bool _typesReady;

        private readonly List<Enemy> _active = new List<Enemy>(64);
        private readonly Stack<Enemy> _pool = new Stack<Enemy>(64);
        private readonly Stack<Dragon> _dragonPool = new Stack<Dragon>(4);

        private float _spawnTimer;
        private int _dragonCount;

        public List<Enemy> Active
        {
            get { return _active; }
        }

        public int Count
        {
            get { return _active.Count; }
        }

        public static void InitialiseTypes()
        {
            if (_typesReady) return;
            _typesReady = true;

            EnemyType zombie = new EnemyType();
            zombie.Kind = EnemyKind.Zombie;
            zombie.Name = "Zombie";
            zombie.MaxHealth = 40;
            zombie.Speed = 2.5f;
            zombie.ContactDamage = 9;
            zombie.AttackInterval = 1.1f;
            zombie.AttackRange = 1.6f;
            zombie.AggroRange = 26.0f;
            zombie.BurnsInSunlight = true;
            zombie.Width = 0.6f;
            zombie.Height = 1.85f;
            zombie.Tint = new Color(86, 132, 74);
            zombie.MinTier = DangerTier.Safe;
            zombie.ScoreValue = 10;
            Types[0] = zombie;

            EnemyType runner = new EnemyType();
            runner.Kind = EnemyKind.Runner;
            runner.Name = "Runner";
            runner.MaxHealth = 34;
            runner.Speed = 5.4f;
            runner.ContactDamage = 12;
            runner.AttackInterval = 0.75f;
            runner.AttackRange = 1.6f;
            runner.AggroRange = 34.0f;
            runner.BurnsInSunlight = true;
            runner.Width = 0.55f;
            runner.Height = 1.75f;
            runner.Tint = new Color(150, 78, 62);
            runner.MinTier = DangerTier.Dangerous;
            runner.ScoreValue = 25;
            Types[1] = runner;

            EnemyType skeleton = new EnemyType();
            skeleton.Kind = EnemyKind.Skeleton;
            skeleton.Name = "Skeleton";
            skeleton.MaxHealth = 30;
            skeleton.Speed = 3.1f;
            skeleton.ContactDamage = 11;
            skeleton.AttackInterval = 1.5f;
            skeleton.AttackRange = 16.0f;
            skeleton.AggroRange = 32.0f;
            skeleton.Ranged = true;
            skeleton.BurnsInSunlight = true;
            skeleton.Width = 0.6f;
            skeleton.Height = 1.85f;
            skeleton.Tint = new Color(206, 206, 196);
            skeleton.MinTier = DangerTier.Nightmare;
            skeleton.ScoreValue = 40;
            Types[2] = skeleton;

            EnemyType hell = new EnemyType();
            hell.Kind = EnemyKind.HellSpawn;
            hell.Name = "Hell Spawn";
            hell.MaxHealth = 110;
            hell.Speed = 3.6f;
            hell.ContactDamage = 20;
            hell.AttackInterval = 0.9f;
            hell.AttackRange = 1.8f;
            hell.AggroRange = 38.0f;
            hell.Width = 0.7f;
            hell.Height = 2.1f;
            hell.Tint = new Color(196, 62, 40);
            hell.MinTier = DangerTier.Hell;
            hell.DropItem = Item.Coal;
            hell.DropCount = 2;
            hell.DropChance = 0.5f;
            hell.ScoreValue = 80;
            Types[3] = hell;

            EnemyType dragon = new EnemyType();
            dragon.Kind = EnemyKind.Dragon;
            dragon.Name = "Dragon";
            dragon.MaxHealth = 650;
            dragon.Speed = 13.0f;
            dragon.ContactDamage = 22;
            dragon.AttackInterval = 1.4f;
            dragon.AttackRange = 3.5f;
            dragon.AggroRange = 90.0f;
            dragon.Flying = true;
            dragon.Width = 2.4f;
            dragon.Height = 2.0f;
            dragon.Tint = new Color(126, 60, 168);
            dragon.MinTier = DangerTier.DragonLands;
            dragon.DropItem = Item.DragonStone;
            dragon.DropCount = 6;
            dragon.DropChance = 1.0f;
            dragon.ScoreValue = 500;
            Types[4] = dragon;
        }

        public static EnemyType TypeOf(EnemyKind kind)
        {
            return Types[(int)kind];
        }

        public void Update(GameSession session, float dt)
        {
            // In co-op the host is the only machine that spawns, moves or kills anything.
            // Clients rebuild this list wholesale from the host's snapshots, so running a
            // second simulation here would only fight the network for control of it.
            if (!session.Network.IsAuthority) return;

            LocalPlayer player = session.Player;

            for (int i = _active.Count - 1; i >= 0; i--)
            {
                Enemy enemy = _active[i];

                if (enemy.IsDead || enemy.Removed)
                {
                    Retire(i, enemy);
                    continue;
                }

                float dx = enemy.Position.X - player.Position.X;
                float dz = enemy.Position.Z - player.Position.Z;
                if (dx * dx + dz * dz > DespawnDistance * DespawnDistance)
                {
                    Retire(i, enemy);
                    continue;
                }

                // Nothing survives falling out of the world.
                if (enemy.Position.Y < -4.0f)
                {
                    Retire(i, enemy);
                    continue;
                }

                enemy.Think(session, dt);
            }

            UpdateSpawning(session, dt);
        }

        private void Retire(int index, Enemy enemy)
        {
            _active.RemoveAt(index);

            Dragon dragon = enemy as Dragon;
            if (dragon != null)
            {
                _dragonCount--;
                _dragonPool.Push(dragon);
            }
            else
            {
                _pool.Push(enemy);
            }
        }

        // ---- Spawning ---------------------------------------------------------

        private void UpdateSpawning(GameSession session, float dt)
        {
            _spawnTimer -= dt;
            if (_spawnTimer > 0.0f) return;

            LocalPlayer player = session.Player;
            DangerTier tier = player.Tier;
            bool night = session.World.IsNight;

            _spawnTimer = night ? 0.9f : 2.4f;

            int budget = PopulationBudget(tier, night);
            if (_active.Count >= budget) return;

            // A couple of attempts per tick keeps the horde building up quickly at dusk
            // without ever spiking the frame.
            for (int attempt = 0; attempt < 3 && _active.Count < budget; attempt++)
            {
                TrySpawnOne(session, tier, night);
            }

            TrySpawnDragon(session, tier);
        }

        private static int PopulationBudget(DangerTier tier, bool night)
        {
            int budget;
            switch (tier)
            {
                case DangerTier.Dangerous: budget = 16; break;
                case DangerTier.Nightmare: budget = 22; break;
                case DangerTier.Hell: budget = 28; break;
                case DangerTier.DragonLands: budget = 32; break;
                default: budget = 10; break;
            }
            return night ? budget : budget / 3;
        }

        private void TrySpawnOne(GameSession session, DangerTier tier, bool night)
        {
            Vector3 origin = session.Player.Position;

            float angle = session.NextFloat() * MathHelper.TwoPi;
            float radius = MinSpawnDistance + session.NextFloat() * (MaxSpawnDistance - MinSpawnDistance);
            int x = (int)(origin.X + (float)System.Math.Sin(angle) * radius);
            int z = (int)(origin.Z + (float)System.Math.Cos(angle) * radius);

            int surface = session.World.SurfaceHeight(x, z);
            if (surface <= 0 || surface >= Constants.MaxBlockY - 2) return;

            // Underground pockets spawn during the day too, which is what makes deep mining
            // its own kind of dangerous.
            int y = surface;
            byte ground = session.World.GetBlock(x, y - 1, z);
            if (ground == Block.Water || ground == Block.Lava || ground == Block.Air) return;

            byte skyLight = session.World.GetSkyLight(x, y, z);
            byte blockLight = session.World.GetBlockLight(x, y, z);
            if (blockLight > 7) return;
            if (!night && skyLight > 8) return;

            EnemyKind kind = PickKind(session, tier);
            EnemyType type = Types[(int)kind];
            if (type.Flying) return;

            Vector3 position = new Vector3(x + 0.5f, y, z + 0.5f);
            Enemy enemy = Rent();
            enemy.Initialise(type, position);

            if (Entity.Collides(session.World, enemy.Bounds))
            {
                _pool.Push(enemy);
                return;
            }

            _active.Add(enemy);
        }

        private void TrySpawnDragon(GameSession session, DangerTier tier)
        {
            if (tier < DangerTier.DragonLands) return;
            if (_dragonCount >= 2) return;
            if (session.NextFloat() > 0.06f) return;

            Vector3 origin = session.Player.Position;
            float angle = session.NextFloat() * MathHelper.TwoPi;
            Vector3 position = origin + new Vector3(
                (float)System.Math.Sin(angle) * 48.0f,
                26.0f,
                (float)System.Math.Cos(angle) * 48.0f);

            if (position.Y > Constants.MaxBlockY - 4) position.Y = Constants.MaxBlockY - 4;

            Dragon dragon = _dragonPool.Count > 0 ? _dragonPool.Pop() : new Dragon();
            dragon.Initialise(Types[(int)EnemyKind.Dragon], position);
            dragon.ResetFlight(angle);
            _active.Add(dragon);
            _dragonCount++;

            session.Audio.Play(SoundId.DragonRoar, position);
            session.ShowBanner("A DRAGON APPROACHES");
        }

        private static EnemyKind PickKind(GameSession session, DangerTier tier)
        {
            float roll = session.NextFloat();
            switch (tier)
            {
                case DangerTier.Dangerous:
                    return roll < 0.65f ? EnemyKind.Zombie : EnemyKind.Runner;

                case DangerTier.Nightmare:
                    if (roll < 0.4f) return EnemyKind.Zombie;
                    if (roll < 0.75f) return EnemyKind.Runner;
                    return EnemyKind.Skeleton;

                case DangerTier.Hell:
                    if (roll < 0.3f) return EnemyKind.Runner;
                    if (roll < 0.6f) return EnemyKind.Skeleton;
                    return EnemyKind.HellSpawn;

                case DangerTier.DragonLands:
                    if (roll < 0.25f) return EnemyKind.Skeleton;
                    return EnemyKind.HellSpawn;

                default:
                    return EnemyKind.Zombie;
            }
        }

        private Enemy Rent()
        {
            return _pool.Count > 0 ? _pool.Pop() : new Enemy();
        }

        /// <summary>Directly places an enemy. Used by the network layer and by debug commands.</summary>
        public Enemy Spawn(EnemyKind kind, Vector3 position)
        {
            EnemyType type = Types[(int)kind];
            Enemy enemy;

            if (type.Flying)
            {
                Dragon dragon = _dragonPool.Count > 0 ? _dragonPool.Pop() : new Dragon();
                dragon.ResetFlight(0.0f);
                _dragonCount++;
                enemy = dragon;
            }
            else
            {
                enemy = Rent();
            }

            enemy.Initialise(type, position);
            _active.Add(enemy);
            return enemy;
        }

        // ---- Queries ----------------------------------------------------------

        /// <summary>Nearest enemy along a ray, for hitscan weapons and melee swings.</summary>
        public Enemy Raycast(Vector3 origin, Vector3 direction, float maxDistance, out float distance)
        {
            Ray ray = new Ray(origin, Vector3.Normalize(direction));
            Enemy best = null;
            float bestDistance = maxDistance;

            for (int i = 0; i < _active.Count; i++)
            {
                Enemy enemy = _active[i];
                if (enemy.IsDead) continue;

                float? hit = enemy.Bounds.Intersects(ray);
                if (!hit.HasValue) continue;
                if (hit.Value >= bestDistance) continue;

                bestDistance = hit.Value;
                best = enemy;
            }

            distance = bestDistance;
            return best;
        }

        public bool AnyInside(BoundingBox box)
        {
            for (int i = 0; i < _active.Count; i++)
            {
                if (_active[i].Bounds.Intersects(box)) return true;
            }
            return false;
        }

        /// <summary>Applies splash damage. Returns the number of enemies killed.</summary>
        public int DamageInRadius(GameSession session, Vector3 centre, float radius, int damage)
        {
            int killed = 0;
            float radiusSquared = radius * radius;

            for (int i = 0; i < _active.Count; i++)
            {
                Enemy enemy = _active[i];
                if (enemy.IsDead) continue;

                Vector3 toEnemy = (enemy.Position + new Vector3(0.0f, enemy.Height * 0.5f, 0.0f)) - centre;
                float distanceSquared = toEnemy.LengthSquared();
                if (distanceSquared > radiusSquared) continue;

                float falloff = 1.0f - (float)System.Math.Sqrt(distanceSquared) / radius;
                int applied = (int)(damage * falloff);
                if (applied <= 0) continue;

                if (distanceSquared > 0.01f) toEnemy.Normalize();
                enemy.Damage(applied, toEnemy * 9.0f + new Vector3(0.0f, 4.0f, 0.0f));

                if (enemy.IsDead)
                {
                    session.OnEnemyKilled(enemy);
                    killed++;
                }
            }

            return killed;
        }

        public void Clear()
        {
            for (int i = 0; i < _active.Count; i++)
            {
                Enemy enemy = _active[i];
                Dragon dragon = enemy as Dragon;
                if (dragon != null) _dragonPool.Push(dragon);
                else _pool.Push(enemy);
            }
            _active.Clear();
            _dragonCount = 0;
        }
    }
}
