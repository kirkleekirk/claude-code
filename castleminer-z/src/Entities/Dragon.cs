using Microsoft.Xna.Framework;
using CastleMinerZ.World;

namespace CastleMinerZ.Entities
{
    /// <summary>
    /// The dragon: a flying boss that circles, strafes and breathes fire.
    ///
    /// It ignores gravity and terrain collision above ground level so it can never wedge
    /// itself in a canyon and stop being a threat -- it only collides when it dives to
    /// ground level. Killing one is the intended source of dragon stone for players who
    /// would rather fight than mine at 6 km out.
    /// </summary>
    public sealed class Dragon : Enemy
    {
        private enum Phase
        {
            Circle,
            Strafe,
            Dive
        }

        private Phase _phase;
        private float _phaseTimer;
        private float _circleAngle;
        private float _breathCooldown;
        private float _wingPhase;

        /// <summary>Wing flap angle, for the renderer.</summary>
        public float WingAngle
        {
            get { return (float)System.Math.Sin(_wingPhase) * 0.7f; }
        }

        public void ResetFlight(float startAngle)
        {
            _phase = Phase.Circle;
            _phaseTimer = 5.0f;
            _circleAngle = startAngle;
            _breathCooldown = 2.0f;
        }

        public override void Think(GameSession session, float dt)
        {
            if (IsDead) return;

            LocalPlayer player = session.Player;

            HurtFlash -= dt * 3.0f;
            if (HurtFlash < 0.0f) HurtFlash = 0.0f;

            _wingPhase += dt * 4.5f;
            _phaseTimer -= dt;
            if (_breathCooldown > 0.0f) _breathCooldown -= dt;
            if (AttackCooldown > 0.0f) AttackCooldown -= dt;

            if (_phaseTimer <= 0.0f) ChoosePhase(session, player);

            Vector3 target = ChooseTargetPoint(session, player, dt);
            Vector3 toTarget = target - Position;
            float distance = toTarget.Length();
            if (distance > 0.01f) toTarget /= distance;

            // Smooth steering rather than snapping to the target direction, so it reads as
            // something with mass.
            Vector3 desired = toTarget * Type.Speed;
            float steer = MathHelper.Clamp(1.8f * dt, 0.0f, 1.0f);
            Velocity = Vector3.Lerp(Velocity, desired, steer);

            Vector3 flat = new Vector3(Velocity.X, 0.0f, Velocity.Z);
            if (flat.LengthSquared() > 0.05f) Yaw = (float)System.Math.Atan2(flat.X, flat.Z);
            Pitch = -(float)System.Math.Atan2(Velocity.Y, flat.Length());

            MoveDragon(session.World, Velocity * dt);
            TryBreatheFire(session, player);
            TryBite(session, player);
        }

        private void ChoosePhase(GameSession session, LocalPlayer player)
        {
            float roll = session.NextFloat();
            if (roll < 0.45f)
            {
                _phase = Phase.Circle;
                _phaseTimer = 4.0f + session.NextFloat() * 3.0f;
            }
            else if (roll < 0.8f)
            {
                _phase = Phase.Strafe;
                _phaseTimer = 3.0f + session.NextFloat() * 2.0f;
            }
            else
            {
                _phase = Phase.Dive;
                _phaseTimer = 2.5f;
            }
        }

        private Vector3 ChooseTargetPoint(GameSession session, LocalPlayer player, float dt)
        {
            int groundHeight = session.World.SurfaceHeight((int)player.Position.X, (int)player.Position.Z);
            float ground = groundHeight < 0 ? player.Position.Y : groundHeight;

            switch (_phase)
            {
                case Phase.Strafe:
                {
                    // Hold station off to one side at eye level and pour fire in.
                    _circleAngle += dt * 0.5f;
                    float radius = 14.0f;
                    return player.Position + new Vector3(
                        (float)System.Math.Sin(_circleAngle) * radius,
                        6.0f,
                        (float)System.Math.Cos(_circleAngle) * radius);
                }

                case Phase.Dive:
                    return player.Position + new Vector3(0.0f, 1.5f, 0.0f);

                default:
                {
                    _circleAngle += dt * 0.85f;
                    float radius = 22.0f;
                    return new Vector3(
                        player.Position.X + (float)System.Math.Sin(_circleAngle) * radius,
                        ground + 20.0f,
                        player.Position.Z + (float)System.Math.Cos(_circleAngle) * radius);
                }
            }
        }

        /// <summary>
        /// Collides only near the ground. Higher up it passes through terrain, which stops
        /// a boss with no pathfinding from getting stuck on a mountainside.
        /// </summary>
        private void MoveDragon(World.World world, Vector3 delta)
        {
            int surface = world.SurfaceHeight((int)Position.X, (int)Position.Z);
            if (surface >= 0 && Position.Y < surface + 3.0f)
            {
                MoveAndCollide(world, delta);
                if (Position.Y < surface + 1.0f) Position.Y = surface + 1.0f;
            }
            else
            {
                Position += delta;
            }

            if (Position.Y > Constants.MaxBlockY - 2) Position.Y = Constants.MaxBlockY - 2;
        }

        private void TryBreatheFire(GameSession session, LocalPlayer player)
        {
            if (_breathCooldown > 0.0f) return;

            Vector3 origin = Position + Forward * 1.6f;
            Vector3 toPlayer = (player.Position + new Vector3(0.0f, 1.0f, 0.0f)) - origin;
            float distance = toPlayer.Length();
            if (distance > 34.0f || distance < 0.5f) return;
            toPlayer /= distance;

            if (Vector3.Dot(Forward, toPlayer) < 0.55f) return;

            _breathCooldown = 2.6f;
            session.Audio.Play(SoundId.DragonRoar, Position);

            // A short burst of fireballs rather than one, so the player can break line of
            // sight partway through and take less of it.
            for (int i = 0; i < 5; i++)
            {
                Vector3 direction = toPlayer;
                direction.X += session.NextSpread(0.05f);
                direction.Y += session.NextSpread(0.05f);
                direction.Z += session.NextSpread(0.05f);
                direction.Normalize();
                session.Projectiles.SpawnFireball(origin, direction * (18.0f + i * 1.5f), Type.ContactDamage);
            }
        }

        private void TryBite(GameSession session, LocalPlayer player)
        {
            if (AttackCooldown > 0.0f) return;

            Vector3 toPlayer = player.Position - Position;
            if (toPlayer.LengthSquared() > 3.6f * 3.6f) return;

            AttackCooldown = Type.AttackInterval;
            toPlayer.Normalize();
            Vector3 knockback = toPlayer * 11.0f;
            knockback.Y = 7.0f;
            player.Damage(Type.ContactDamage + 8, knockback);
            session.Audio.Play(SoundId.DragonRoar, Position);
        }
    }
}
