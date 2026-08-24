using Microsoft.Xna.Framework;
using CastleMinerZ.World;

namespace CastleMinerZ.Entities
{
    public enum EnemyKind
    {
        Zombie = 0,
        Runner = 1,
        Skeleton = 2,
        HellSpawn = 3,
        Dragon = 4
    }

    /// <summary>Static per-kind stats. Difficulty comes from which kinds spawn, not from a slider.</summary>
    public sealed class EnemyType
    {
        public EnemyKind Kind;
        public string Name;
        public int MaxHealth;
        public float Speed;
        public int ContactDamage;
        public float AttackInterval;
        public float AttackRange;

        /// <summary>Distance at which the enemy notices the player.</summary>
        public float AggroRange;

        public bool Ranged;
        public bool Flying;

        /// <summary>Catches fire in direct sunlight, like the classic night-time horde.</summary>
        public bool BurnsInSunlight;

        public float Width;
        public float Height;

        /// <summary>Body colour used by the cube renderer.</summary>
        public Color Tint;

        /// <summary>Item dropped on death, or none.</summary>
        public byte DropItem;
        public int DropCount;
        public float DropChance;

        /// <summary>Minimum danger tier at which this kind appears at all.</summary>
        public DangerTier MinTier;

        public int ScoreValue;
    }

    /// <summary>
    /// A hostile creature.
    ///
    /// The AI is deliberately simple -- chase, jump obstacles, swing when close -- because a
    /// horde of thirty of them has to fit inside a 30 Hz frame on a 2005 console alongside
    /// terrain streaming. What makes them dangerous is the numbers and the tier scaling, not
    /// individually clever pathfinding.
    /// </summary>
    public class Enemy : Entity
    {
        public EnemyType Type;

        protected float AttackCooldown;
        protected float RepathTimer;
        protected Vector3 Wander;
        protected float BurnTimer;
        protected float StuckTimer;
        protected float JumpCooldown;

        public float HurtFlash;

        /// <summary>Walk-cycle phase, advanced by ground speed and read by the renderer.</summary>
        public float AnimPhase;

        public void Initialise(EnemyType type, Vector3 position)
        {
            Type = type;
            Position = position;
            Velocity = Vector3.Zero;
            Width = type.Width;
            Height = type.Height;
            MaxHealth = type.MaxHealth;
            Health = type.MaxHealth;
            Removed = false;
            AttackCooldown = 0.0f;
            BurnTimer = 0.0f;
            HurtFlash = 0.0f;
            StepHeight = 1.05f;
            Yaw = 0.0f;
        }

        public override void Update(World.World world, float dt)
        {
            IntegrateMotion(world, dt, 1.0f);
        }

        /// <summary>Full AI step.</summary>
        public virtual void Think(GameSession session, float dt)
        {
            if (IsDead) return;

            LocalPlayer player = session.Player;
            Vector3 toPlayer = player.Position - Position;
            float distanceSquared = toPlayer.LengthSquared();

            HurtFlash -= dt * 3.0f;
            if (HurtFlash < 0.0f) HurtFlash = 0.0f;

            if (AttackCooldown > 0.0f) AttackCooldown -= dt;
            if (JumpCooldown > 0.0f) JumpCooldown -= dt;

            UpdateSunlightBurn(session, dt);

            float aggro = Type.AggroRange;
            bool chasing = distanceSquared < aggro * aggro && !player.IsDead;

            if (chasing) Chase(session, player, toPlayer, distanceSquared, dt);
            else Idle(session, dt);

            IntegrateMotion(session.World, dt, 1.0f);

            float planarSpeed = (float)System.Math.Sqrt(Velocity.X * Velocity.X + Velocity.Z * Velocity.Z);
            AnimPhase += planarSpeed * dt * 2.4f;
        }

        protected virtual void Chase(GameSession session, LocalPlayer player, Vector3 toPlayer, float distanceSquared, float dt)
        {
            Vector3 flat = new Vector3(toPlayer.X, 0.0f, toPlayer.Z);
            float flatDistance = flat.Length();
            if (flatDistance > 0.001f) flat /= flatDistance;

            Yaw = (float)System.Math.Atan2(flat.X, flat.Z);

            if (Type.Ranged)
            {
                RangedBehaviour(session, player, flat, flatDistance, dt);
                return;
            }

            // Close enough to swing.
            if (distanceSquared < Type.AttackRange * Type.AttackRange)
            {
                TryAttack(session, player, flat);
                // Keep pressing forward slightly so a crowd does not stall at arm's length.
                ApplyWalk(flat, Type.Speed * 0.35f, dt);
                return;
            }

            bool blocked = ApplyWalk(flat, Type.Speed, dt);
            if (blocked && OnGround && JumpCooldown <= 0.0f)
            {
                Velocity.Y = Constants.JumpVelocity * 0.92f;
                JumpCooldown = 0.4f;
            }

            // Swim upward rather than drowning in a lake between it and the player.
            if (InLiquid) Velocity.Y = 3.2f;
        }

        protected virtual void RangedBehaviour(GameSession session, LocalPlayer player, Vector3 flat, float flatDistance, float dt)
        {
            const float preferred = 9.0f;

            if (flatDistance > preferred + 2.0f) ApplyWalk(flat, Type.Speed, dt);
            else if (flatDistance < preferred - 3.0f) ApplyWalk(-flat, Type.Speed * 0.8f, dt);
            else ApplyWalk(Vector3.Zero, 0.0f, dt);

            if (AttackCooldown > 0.0f) return;

            Vector3 origin = Position + new Vector3(0.0f, Height * 0.85f, 0.0f);
            Vector3 target = player.Position + new Vector3(0.0f, player.Height * 0.6f, 0.0f);
            Vector3 direction = target - origin;
            float distance = direction.Length();
            if (distance < 0.01f) return;
            direction /= distance;

            // Do not shoot through terrain.
            RayHit hit = VoxelRaycast.Cast(session.World, origin, direction, distance, false);
            if (hit.Hit) return;

            AttackCooldown = Type.AttackInterval;
            session.Projectiles.SpawnBoneShard(origin + direction * 0.6f, direction * 26.0f, Type.ContactDamage);
            session.Audio.Play(SoundId.SkeletonShoot, Position);
        }

        protected void TryAttack(GameSession session, LocalPlayer player, Vector3 direction)
        {
            if (AttackCooldown > 0.0f) return;
            AttackCooldown = Type.AttackInterval;

            Vector3 knockback = direction * 4.5f;
            knockback.Y = 3.5f;
            player.Damage(Type.ContactDamage, knockback);
            session.Audio.Play(SoundId.ZombieAttack, Position);
        }

        /// <summary>Steers toward a direction. Returns true when a wall stopped the move.</summary>
        protected bool ApplyWalk(Vector3 direction, float speed, float dt)
        {
            Vector3 wish = direction * speed;
            float accel = OnGround ? 16.0f : 4.0f;
            Velocity.X = MathHelper.Lerp(Velocity.X, wish.X, MathHelper.Clamp(accel * dt, 0.0f, 1.0f));
            Velocity.Z = MathHelper.Lerp(Velocity.Z, wish.Z, MathHelper.Clamp(accel * dt, 0.0f, 1.0f));

            float planar = System.Math.Abs(Velocity.X) + System.Math.Abs(Velocity.Z);
            if (speed > 0.1f && planar < speed * 0.25f) StuckTimer += dt;
            else StuckTimer = 0.0f;

            return StuckTimer > 0.25f;
        }

        protected virtual void Idle(GameSession session, float dt)
        {
            RepathTimer -= dt;
            if (RepathTimer <= 0.0f)
            {
                RepathTimer = 2.0f + session.NextFloat() * 3.0f;
                float angle = session.NextFloat() * MathHelper.TwoPi;
                Wander = new Vector3((float)System.Math.Sin(angle), 0.0f, (float)System.Math.Cos(angle));
                if (session.NextFloat() < 0.4f) Wander = Vector3.Zero;
            }

            if (Wander != Vector3.Zero) Yaw = (float)System.Math.Atan2(Wander.X, Wander.Z);
            ApplyWalk(Wander, Type.Speed * 0.3f, dt);
        }

        private void UpdateSunlightBurn(GameSession session, float dt)
        {
            if (!Type.BurnsInSunlight || session.World.IsNight) return;

            int x = (int)System.Math.Floor(Position.X);
            int y = (int)System.Math.Floor(Position.Y + Height * 0.5f);
            int z = (int)System.Math.Floor(Position.Z);

            if (session.World.GetSkyLight(x, y, z) < 12) { BurnTimer = 0.0f; return; }

            BurnTimer += dt;
            if (BurnTimer >= 1.0f)
            {
                BurnTimer = 0.0f;
                Damage(6, Vector3.Zero);
                session.Particles.SpawnFire(Position + new Vector3(0.0f, Height * 0.5f, 0.0f));
                if (IsDead) session.OnEnemyKilled(this);
            }
        }

        public override void Damage(int amount, Vector3 knockback)
        {
            base.Damage(amount, knockback);
            HurtFlash = 1.0f;
        }
    }
}
