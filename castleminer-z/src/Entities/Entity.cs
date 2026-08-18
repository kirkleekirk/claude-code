using Microsoft.Xna.Framework;
using CastleMinerZ.World;

namespace CastleMinerZ.Entities
{
    /// <summary>
    /// Anything with a position, an axis-aligned box and health.
    ///
    /// Collision is resolved one axis at a time against the voxel grid, which is what gives
    /// the familiar behaviour of sliding along a wall instead of stopping dead against it.
    /// Long steps are subdivided so a falling entity can never tunnel through a floor.
    /// </summary>
    public abstract class Entity
    {
        public Vector3 Position;
        public Vector3 Velocity;

        /// <summary>Facing, in radians. Yaw 0 looks down +Z.</summary>
        public float Yaw;
        public float Pitch;

        public float Width = 0.6f;
        public float Height = 1.8f;

        public int Health;
        public int MaxHealth = 20;

        public bool OnGround;
        public bool InLiquid;
        public bool HeadInLiquid;
        public bool Removed;

        /// <summary>Maximum ledge height the entity walks up without jumping.</summary>
        public float StepHeight = 0.6f;

        private const float Skin = 0.001f;

        public bool IsDead
        {
            get { return Health <= 0; }
        }

        public Vector3 EyePosition
        {
            get { return new Vector3(Position.X, Position.Y + Height * 0.9f, Position.Z); }
        }

        /// <summary>Unit vector the entity is facing, including pitch.</summary>
        public Vector3 Forward
        {
            get
            {
                float cosPitch = (float)System.Math.Cos(Pitch);
                return new Vector3(
                    (float)System.Math.Sin(Yaw) * cosPitch,
                    (float)System.Math.Sin(Pitch),
                    (float)System.Math.Cos(Yaw) * cosPitch);
            }
        }

        /// <summary>Facing flattened onto the ground plane, for movement.</summary>
        public Vector3 ForwardFlat
        {
            get { return new Vector3((float)System.Math.Sin(Yaw), 0.0f, (float)System.Math.Cos(Yaw)); }
        }

        public Vector3 RightFlat
        {
            get { return new Vector3((float)System.Math.Cos(Yaw), 0.0f, -(float)System.Math.Sin(Yaw)); }
        }

        public BoundingBox Bounds
        {
            get { return BoundsAt(Position); }
        }

        public BoundingBox BoundsAt(Vector3 position)
        {
            float half = Width * 0.5f;
            return new BoundingBox(
                new Vector3(position.X - half, position.Y, position.Z - half),
                new Vector3(position.X + half, position.Y + Height, position.Z + half));
        }

        public virtual void Damage(int amount, Vector3 knockback)
        {
            if (IsDead) return;
            Health -= amount;
            Velocity += knockback;
            if (Health < 0) Health = 0;
        }

        public virtual void Heal(int amount)
        {
            Health += amount;
            if (Health > MaxHealth) Health = MaxHealth;
        }

        /// <summary>
        /// Integrates velocity against the world. Returns true if the entity was blocked
        /// horizontally, which the enemy AI uses to decide when to jump.
        /// </summary>
        public bool MoveAndCollide(World.World world, Vector3 delta)
        {
            // Never step more than half a block at a time; a 16-block fall would otherwise
            // pass straight through a one-block floor.
            float longest = System.Math.Abs(delta.X);
            if (System.Math.Abs(delta.Y) > longest) longest = System.Math.Abs(delta.Y);
            if (System.Math.Abs(delta.Z) > longest) longest = System.Math.Abs(delta.Z);

            int steps = (int)(longest / 0.45f) + 1;
            Vector3 step = delta / steps;

            bool blocked = false;
            for (int i = 0; i < steps; i++)
            {
                if (MoveStep(world, step)) blocked = true;
            }
            return blocked;
        }

        private bool MoveStep(World.World world, Vector3 step)
        {
            bool blockedHorizontally = false;

            // Y first, so the ground flag is right before the horizontal step tries to
            // climb a ledge.
            if (step.Y != 0.0f)
            {
                Position.Y += step.Y;
                if (Collides(world, BoundsAt(Position)))
                {
                    if (step.Y > 0.0f)
                    {
                        Position.Y = (float)System.Math.Floor(Position.Y + Height) - Height - Skin;
                    }
                    else
                    {
                        Position.Y = (float)System.Math.Floor(Position.Y) + 1.0f + Skin;
                        OnGround = true;
                    }
                    Velocity.Y = 0.0f;
                }
                else if (step.Y < 0.0f)
                {
                    OnGround = false;
                }
            }

            if (step.X != 0.0f)
            {
                Position.X += step.X;
                if (Collides(world, BoundsAt(Position)))
                {
                    if (!TryStepUp(world))
                    {
                        float half = Width * 0.5f;
                        if (step.X > 0.0f) Position.X = (float)System.Math.Floor(Position.X + half) - half - Skin;
                        else Position.X = (float)System.Math.Floor(Position.X - half) + 1.0f + half + Skin;
                        Velocity.X = 0.0f;
                        blockedHorizontally = true;
                    }
                }
            }

            if (step.Z != 0.0f)
            {
                Position.Z += step.Z;
                if (Collides(world, BoundsAt(Position)))
                {
                    if (!TryStepUp(world))
                    {
                        float half = Width * 0.5f;
                        if (step.Z > 0.0f) Position.Z = (float)System.Math.Floor(Position.Z + half) - half - Skin;
                        else Position.Z = (float)System.Math.Floor(Position.Z - half) + 1.0f + half + Skin;
                        Velocity.Z = 0.0f;
                        blockedHorizontally = true;
                    }
                }
            }

            return blockedHorizontally;
        }

        /// <summary>
        /// Lifts the entity over a low ledge instead of stopping it. Only while grounded,
        /// so you cannot climb a wall by walking into it in mid-air.
        /// </summary>
        private bool TryStepUp(World.World world)
        {
            if (!OnGround || StepHeight <= 0.0f) return false;

            float baseY = Position.Y;
            float lift = 0.0f;
            while (lift < StepHeight)
            {
                lift += 0.1f;
                Vector3 raised = Position;
                raised.Y = baseY + lift;
                if (!Collides(world, BoundsAt(raised)))
                {
                    Position = raised;
                    return true;
                }
            }
            return false;
        }

        public static bool Collides(World.World world, BoundingBox box)
        {
            int minX = (int)System.Math.Floor(box.Min.X);
            int maxX = (int)System.Math.Floor(box.Max.X - 1e-4f);
            int minY = (int)System.Math.Floor(box.Min.Y);
            int maxY = (int)System.Math.Floor(box.Max.Y - 1e-4f);
            int minZ = (int)System.Math.Floor(box.Min.Z);
            int maxZ = (int)System.Math.Floor(box.Max.Z - 1e-4f);

            for (int y = minY; y <= maxY; y++)
            {
                for (int z = minZ; z <= maxZ; z++)
                {
                    for (int x = minX; x <= maxX; x++)
                    {
                        if (world.IsSolid(x, y, z)) return true;
                    }
                }
            }
            return false;
        }

        /// <summary>Refreshes the liquid flags used for swimming and for lava damage.</summary>
        protected void UpdateLiquidState(World.World world)
        {
            int fx = (int)System.Math.Floor(Position.X);
            int fz = (int)System.Math.Floor(Position.Z);
            int feetY = (int)System.Math.Floor(Position.Y + 0.2f);
            int headY = (int)System.Math.Floor(Position.Y + Height * 0.9f);

            InLiquid = BlockRegistry.IsLiquid(world.GetBlock(fx, feetY, fz));
            HeadInLiquid = BlockRegistry.IsLiquid(world.GetBlock(fx, headY, fz));
        }

        /// <summary>Block the entity is standing in, used for lava and for footstep sounds.</summary>
        public byte BlockAtFeet(World.World world)
        {
            return world.GetBlock(
                (int)System.Math.Floor(Position.X),
                (int)System.Math.Floor(Position.Y + 0.1f),
                (int)System.Math.Floor(Position.Z));
        }

        /// <summary>Applies gravity and drag, then moves. Shared by the player and every enemy.</summary>
        protected void IntegrateMotion(World.World world, float dt, float gravityScale)
        {
            UpdateLiquidState(world);

            float gravity = Constants.Gravity * gravityScale;
            if (InLiquid) gravity *= 0.32f;

            Velocity.Y -= gravity * dt;

            float terminal = InLiquid ? 6.0f : Constants.TerminalVelocity;
            if (Velocity.Y < -terminal) Velocity.Y = -terminal;

            if (InLiquid)
            {
                Velocity.X *= 0.86f;
                Velocity.Z *= 0.86f;
            }

            MoveAndCollide(world, Velocity * dt);
        }

        public abstract void Update(World.World world, float dt);
    }
}
