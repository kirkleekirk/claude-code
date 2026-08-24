using System.Collections.Generic;
using Microsoft.Xna.Framework;
using CastleMinerZ.World;

namespace CastleMinerZ.Entities
{
    public enum ProjectileKind
    {
        /// <summary>Skeleton shot. Hurts the player, stopped by terrain.</summary>
        BoneShard = 0,
        /// <summary>Dragon breath. Small blast, no terrain damage.</summary>
        Fireball = 1,
        /// <summary>Player rocket. Large blast that also digs a crater.</summary>
        Rocket = 2
    }

    /// <summary>
    /// A travelling projectile.
    ///
    /// Movement is a raycast per step rather than a position test, so nothing tunnels
    /// through a wall or past a zombie at 34 m/s.
    /// </summary>
    public struct Projectile
    {
        public bool Alive;
        public ProjectileKind Kind;
        public Vector3 Position;
        public Vector3 Velocity;
        public float Life;
        public int Damage;

        /// <summary>True when the player fired it, which decides who it can hurt.</summary>
        public bool FromPlayer;
    }

    /// <summary>Fixed-capacity projectile pool. Oldest is recycled if the array fills up.</summary>
    public sealed class ProjectileManager
    {
        private const int Capacity = 96;
        private readonly Projectile[] _items = new Projectile[Capacity];
        private int _next;

        public Projectile[] Items
        {
            get { return _items; }
        }

        public void SpawnBoneShard(Vector3 position, Vector3 velocity, int damage)
        {
            Spawn(ProjectileKind.BoneShard, position, velocity, damage, 4.0f, false);
        }

        public void SpawnFireball(Vector3 position, Vector3 velocity, int damage)
        {
            Spawn(ProjectileKind.Fireball, position, velocity, damage, 4.5f, false);
        }

        public void SpawnRocket(Vector3 position, Vector3 velocity, int damage)
        {
            Spawn(ProjectileKind.Rocket, position, velocity, damage, 6.0f, true);
        }

        private void Spawn(ProjectileKind kind, Vector3 position, Vector3 velocity, int damage, float life, bool fromPlayer)
        {
            int slot = -1;
            for (int i = 0; i < Capacity; i++)
            {
                int index = (_next + i) % Capacity;
                if (!_items[index].Alive) { slot = index; break; }
            }
            if (slot < 0) slot = _next;
            _next = (slot + 1) % Capacity;

            _items[slot].Alive = true;
            _items[slot].Kind = kind;
            _items[slot].Position = position;
            _items[slot].Velocity = velocity;
            _items[slot].Life = life;
            _items[slot].Damage = damage;
            _items[slot].FromPlayer = fromPlayer;
        }

        public void Update(GameSession session, float dt)
        {
            for (int i = 0; i < Capacity; i++)
            {
                if (!_items[i].Alive) continue;

                _items[i].Life -= dt;
                if (_items[i].Life <= 0.0f)
                {
                    _items[i].Alive = false;
                    continue;
                }

                float gravity = _items[i].Kind == ProjectileKind.BoneShard ? 9.0f : 1.5f;
                _items[i].Velocity.Y -= gravity * dt;

                Vector3 step = _items[i].Velocity * dt;
                float distance = step.Length();
                if (distance < 1e-5f) continue;

                Vector3 direction = step / distance;
                Vector3 origin = _items[i].Position;

                // Terrain first, then whatever is in the way before that impact point.
                RayHit blockHit = VoxelRaycast.Cast(session.World, origin, direction, distance, false);
                float travel = blockHit.Hit ? blockHit.Distance : distance;

                if (_items[i].FromPlayer)
                {
                    float enemyDistance;
                    Enemy target = session.Enemies.Raycast(origin, direction, travel, out enemyDistance);
                    if (target != null)
                    {
                        Detonate(session, i, origin + direction * enemyDistance);
                        continue;
                    }
                }
                else
                {
                    float? playerHit = session.Player.Bounds.Intersects(new Ray(origin, direction));
                    if (playerHit.HasValue && playerHit.Value <= travel)
                    {
                        Detonate(session, i, origin + direction * playerHit.Value);
                        continue;
                    }
                }

                if (blockHit.Hit)
                {
                    Detonate(session, i, origin + direction * travel);
                    continue;
                }

                _items[i].Position = origin + step;
                if (_items[i].Kind != ProjectileKind.BoneShard)
                {
                    session.Particles.SpawnTrail(_items[i].Position, _items[i].Kind == ProjectileKind.Rocket);
                }
            }
        }

        private void Detonate(GameSession session, int index, Vector3 point)
        {
            Projectile p = _items[index];
            _items[index].Alive = false;

            switch (p.Kind)
            {
                case ProjectileKind.BoneShard:
                    if (!p.FromPlayer) HitPlayer(session, p, point, 0.0f);
                    session.Particles.SpawnImpact(point, BlockRegistry.Get(Block.Stone));
                    break;

                case ProjectileKind.Fireball:
                    session.Particles.SpawnExplosion(point, 1.2f);
                    session.Audio.Play(SoundId.Explosion, point);
                    HitPlayer(session, p, point, 3.0f);
                    break;

                case ProjectileKind.Rocket:
                    session.Particles.SpawnExplosion(point, 3.0f);
                    session.Audio.Play(SoundId.Explosion, point);
                    session.Enemies.DamageInRadius(session, point, 6.0f, p.Damage);
                    session.Explode(point, 3.0f);
                    HitPlayer(session, p, point, 4.5f);
                    break;
            }
        }

        /// <summary>Applies damage to the player, either directly or by blast radius.</summary>
        private static void HitPlayer(GameSession session, Projectile p, Vector3 point, float radius)
        {
            LocalPlayer player = session.Player;
            Vector3 centre = player.Position + new Vector3(0.0f, player.Height * 0.5f, 0.0f);
            Vector3 toPlayer = centre - point;
            float distance = toPlayer.Length();

            int damage;
            if (radius <= 0.0f)
            {
                if (distance > 1.6f) return;
                damage = p.Damage;
            }
            else
            {
                if (distance > radius) return;
                damage = (int)(p.Damage * (1.0f - distance / radius));
            }

            if (damage <= 0) return;

            if (distance > 0.01f) toPlayer /= distance;
            player.Damage(damage, toPlayer * 6.0f);
            session.Audio.Play(SoundId.Hurt, player.Position);
        }

        public void Clear()
        {
            for (int i = 0; i < Capacity; i++) _items[i].Alive = false;
        }
    }
}
