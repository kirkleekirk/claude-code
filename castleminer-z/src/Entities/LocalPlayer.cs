using Microsoft.Xna.Framework;
using CastleMinerZ.Core;
using CastleMinerZ.Items;
using CastleMinerZ.World;

namespace CastleMinerZ.Entities
{
    /// <summary>
    /// The player: movement, the mining/placing cursor, melee and firearms.
    ///
    /// Everything here runs on the fixed 60 Hz simulation step, so mining rates, fire rates
    /// and fall damage are identical whether the console is holding 30 fps or dipping.
    /// </summary>
    public sealed class LocalPlayer : Entity
    {
        public readonly Inventory Inventory = new Inventory();

        // ---- Mining cursor ----
        public bool HasTarget;
        public int TargetX, TargetY, TargetZ;
        public Vector3 TargetNormal;

        /// <summary>0..1 progress on the block currently being mined.</summary>
        public float MiningProgress;
        private int _miningX, _miningY, _miningZ;
        private bool _mining;

        // ---- Weapon state ----
        private float _attackCooldown;
        private float _reloadTimer;
        public bool IsReloading
        {
            get { return _reloadTimer > 0.0f; }
        }

        /// <summary>Camera kick from firing, decays every frame.</summary>
        public float RecoilPitch;
        public float WeaponBob;
        private float _bobPhase;

        public bool FlashlightOn;

        // ---- Survival state ----
        private float _fallStartY;
        private bool _falling;
        private float _timeSinceDamage;
        private float _regenAccumulator;
        private float _drownTimer;
        private float _burnTimer;
        public float DamageFlash;

        /// <summary>Furthest distance from spawn reached this life. Drives the danger readout.</summary>
        public float FurthestDistance;

        public LocalPlayer()
        {
            Width = Constants.PlayerWidth;
            Height = Constants.PlayerHeight;
            MaxHealth = Constants.PlayerMaxHealth;
            Health = MaxHealth;
            StepHeight = 0.6f;
        }

        public bool IsCrouching;

        public float EyeHeight
        {
            get { return IsCrouching ? Constants.PlayerCrouchEyeHeight : Constants.PlayerEyeHeight; }
        }

        public new Vector3 EyePosition
        {
            get { return new Vector3(Position.X, Position.Y + EyeHeight, Position.Z); }
        }

        public float DistanceFromSpawn
        {
            get { return Biomes.DistanceFromSpawn(Position.X, Position.Z); }
        }

        public DangerTier Tier
        {
            get { return Biomes.TierForDistance(DistanceFromSpawn); }
        }

        public void Respawn(Vector3 position)
        {
            Position = position;
            Velocity = Vector3.Zero;
            Health = MaxHealth;
            Pitch = 0.0f;
            _falling = false;
            _mining = false;
            MiningProgress = 0.0f;
            _burnTimer = 0.0f;
            _drownTimer = 0.0f;
            DamageFlash = 0.0f;
        }

        /// <summary>Physics only. <see cref="Control"/> does the rest.</summary>
        public override void Update(World.World world, float dt)
        {
            IntegrateMotion(world, dt, 1.0f);
        }

        /// <summary>Full per-step update: input, movement, tools, weapons, survival.</summary>
        public void Control(GameSession session, PlayerCommand cmd, float dt)
        {
            World.World world = session.World;

            if (IsDead)
            {
                IntegrateMotion(world, dt, 1.0f);
                return;
            }

            ApplyLook(cmd);
            ApplyMovement(world, cmd, dt);

            float beforeY = Position.Y;
            bool wasOnGround = OnGround;
            IntegrateMotion(world, dt, 1.0f);
            UpdateFallDamage(session, wasOnGround, beforeY);

            UpdateTargeting(world);

            if (_attackCooldown > 0.0f) _attackCooldown -= dt;
            if (_reloadTimer > 0.0f)
            {
                _reloadTimer -= dt;
                if (_reloadTimer <= 0.0f) FinishReload();
            }

            HandleHotbar(cmd);
            HandleUse(session, cmd);
            HandleAttack(session, cmd, dt);

            if (cmd.ReloadPressed) BeginReload();
            if (cmd.FlashlightPressed) FlashlightOn = !FlashlightOn;

            UpdateSurvival(session, dt);

            RecoilPitch *= 1.0f - MathHelper.Clamp(9.0f * dt, 0.0f, 1.0f);
            DamageFlash -= dt * 1.6f;
            if (DamageFlash < 0.0f) DamageFlash = 0.0f;

            float distance = DistanceFromSpawn;
            if (distance > FurthestDistance) FurthestDistance = distance;
        }

        private void ApplyLook(PlayerCommand cmd)
        {
            Yaw -= cmd.Look.X;
            Pitch += cmd.Look.Y;

            // Stopping just short of straight up avoids the singularity in the view matrix.
            const float limit = 1.5533f;
            if (Pitch > limit) Pitch = limit;
            if (Pitch < -limit) Pitch = -limit;

            while (Yaw > MathHelper.Pi) Yaw -= MathHelper.TwoPi;
            while (Yaw < -MathHelper.Pi) Yaw += MathHelper.TwoPi;
        }

        private void ApplyMovement(World.World world, PlayerCommand cmd, float dt)
        {
            IsCrouching = cmd.Crouch && OnGround;

            float speed = Constants.WalkSpeed;
            if (IsCrouching) speed = Constants.CrouchSpeed;
            else if (cmd.Sprint && cmd.Move.Y > 0.1f) speed = Constants.SprintSpeed;
            if (InLiquid) speed = Constants.SwimSpeed;

            Vector3 wish = ForwardFlat * cmd.Move.Y + RightFlat * cmd.Move.X;
            if (wish.LengthSquared() > 1.0f) wish.Normalize();
            wish *= speed;

            // Air control is deliberately weak: committing to a jump should matter when you
            // are running from something.
            float accel = OnGround ? 42.0f : (InLiquid ? 12.0f : 7.0f);
            Velocity.X = MathHelper.Lerp(Velocity.X, wish.X, MathHelper.Clamp(accel * dt, 0.0f, 1.0f));
            Velocity.Z = MathHelper.Lerp(Velocity.Z, wish.Z, MathHelper.Clamp(accel * dt, 0.0f, 1.0f));

            if (cmd.Jump)
            {
                if (InLiquid) Velocity.Y = 4.2f;
                else if (OnGround)
                {
                    Velocity.Y = Constants.JumpVelocity;
                    OnGround = false;
                }
            }

            // Head bob, purely cosmetic, driven by ground speed.
            float planarSpeed = (float)System.Math.Sqrt(Velocity.X * Velocity.X + Velocity.Z * Velocity.Z);
            if (OnGround && planarSpeed > 0.4f)
            {
                _bobPhase += dt * planarSpeed * 1.9f;
                WeaponBob = (float)System.Math.Sin(_bobPhase) * 0.035f * (planarSpeed / Constants.SprintSpeed);
            }
            else
            {
                WeaponBob *= 1.0f - MathHelper.Clamp(6.0f * dt, 0.0f, 1.0f);
            }
        }

        private void UpdateFallDamage(GameSession session, bool wasOnGround, float beforeY)
        {
            if (!OnGround && Velocity.Y < -0.1f && !InLiquid)
            {
                if (!_falling)
                {
                    _falling = true;
                    _fallStartY = beforeY;
                }
            }
            else if (OnGround && _falling)
            {
                _falling = false;
                float drop = _fallStartY - Position.Y;
                if (drop > 3.5f)
                {
                    int damage = (int)((drop - 3.5f) * 6.0f);
                    if (damage > 0)
                    {
                        Damage(damage, Vector3.Zero);
                        session.Audio.Play(SoundId.Hurt, Position);
                    }
                }
            }
            else if (InLiquid)
            {
                _falling = false;
            }
        }

        // ---- Targeting, mining, placing ---------------------------------------

        private void UpdateTargeting(World.World world)
        {
            RayHit hit = VoxelRaycast.Cast(world, EyePosition, Forward, Constants.ReachDistance, false);
            HasTarget = hit.Hit;
            if (!hit.Hit)
            {
                CancelMining();
                return;
            }

            TargetX = hit.X;
            TargetY = hit.Y;
            TargetZ = hit.Z;
            TargetNormal = hit.Normal;

            if (_mining && (hit.X != _miningX || hit.Y != _miningY || hit.Z != _miningZ)) CancelMining();
        }

        private void CancelMining()
        {
            _mining = false;
            MiningProgress = 0.0f;
        }

        private void HandleHotbar(PlayerCommand cmd)
        {
            if (cmd.HotbarSlot >= 0) Inventory.SelectedIndex = cmd.HotbarSlot;
            else if (cmd.HotbarDelta != 0) Inventory.CycleSelection(cmd.HotbarDelta);

            if (cmd.HotbarDelta != 0 || cmd.HotbarSlot >= 0)
            {
                CancelMining();
                _reloadTimer = 0.0f;
            }
        }

        /// <summary>Left trigger: place the held block.</summary>
        private void HandleUse(GameSession session, PlayerCommand cmd)
        {
            if (!cmd.UsePressed || !HasTarget) return;

            ItemStack held = Inventory.Selected;
            if (held.IsEmpty) return;

            ItemDefinition def = held.Definition;
            if (!def.IsPlaceable) return;

            RayHit hit = VoxelRaycast.Cast(session.World, EyePosition, Forward, Constants.ReachDistance, false);
            if (!hit.Hit) return;

            int px = hit.AdjacentX;
            int py = hit.AdjacentY;
            int pz = hit.AdjacentZ;

            byte existing = session.World.GetBlock(px, py, pz);
            if (existing != Block.Air && !BlockRegistry.IsLiquid(existing)) return;

            // Refuse to entomb the player or any enemy standing in the cell.
            BoundingBox blockBox = new BoundingBox(new Vector3(px, py, pz), new Vector3(px + 1, py + 1, pz + 1));
            if (blockBox.Intersects(Bounds)) return;
            if (session.Enemies.AnyInside(blockBox)) return;

            if (session.World.SetBlock(px, py, pz, def.PlacesBlock, true))
            {
                Inventory.ConsumeSelected(1);
                session.Stats.BlocksPlaced++;
                session.Audio.Play(SoundId.Place, new Vector3(px + 0.5f, py + 0.5f, pz + 0.5f));
                session.Network.BroadcastBlockChange(px, py, pz, def.PlacesBlock);
            }
        }

        /// <summary>Right trigger: mine, swing or shoot depending on what is held.</summary>
        private void HandleAttack(GameSession session, PlayerCommand cmd, float dt)
        {
            ItemStack held = Inventory.Selected;
            ItemDefinition def = held.Definition;

            if (def.IsFirearm)
            {
                bool wantsToFire = def.Gun == GunKind.FullAuto || def.Gun == GunKind.Beam
                    ? cmd.Attack
                    : cmd.AttackPressed;

                if (wantsToFire) TryFire(session, def);
                CancelMining();
                return;
            }

            if (cmd.AttackPressed)
            {
                // A swing that connects with an enemy does not also mine the block behind it.
                if (TryMelee(session, def)) return;
            }

            if (cmd.Attack) UpdateMining(session, def, dt);
            else CancelMining();
        }

        private void UpdateMining(GameSession session, ItemDefinition tool, float dt)
        {
            if (!HasTarget) { CancelMining(); return; }

            byte id = session.World.GetBlock(TargetX, TargetY, TargetZ);
            BlockDefinition block = BlockRegistry.Get(id);
            if (id == Block.Air || block.Hardness < 0.0f) { CancelMining(); return; }

            if (!_mining)
            {
                _mining = true;
                _miningX = TargetX;
                _miningY = TargetY;
                _miningZ = TargetZ;
                MiningProgress = 0.0f;
            }

            float speed = 1.0f;
            if (block.Tool != ToolClass.None && tool.Tool == block.Tool) speed = tool.MiningMultiplier;
            else if (block.Tool == ToolClass.None) speed = tool.MiningMultiplier * 0.5f + 0.5f;

            // Mining while swimming or airborne is slower, same as the original.
            if (!OnGround) speed *= 0.35f;
            if (HeadInLiquid) speed *= 0.4f;

            MiningProgress += (speed / block.Hardness) * dt;

            if (MiningProgress >= 1.0f)
            {
                BreakBlock(session, tool, id, block);
                CancelMining();
            }
            else
            {
                session.Particles.SpawnMiningDust(
                    new Vector3(TargetX + 0.5f, TargetY + 0.5f, TargetZ + 0.5f), block, dt);
            }
        }

        private void BreakBlock(GameSession session, ItemDefinition tool, byte id, BlockDefinition block)
        {
            bool canHarvest = tool.Tier >= block.RequiredTier;

            if (!session.World.SetBlock(TargetX, TargetY, TargetZ, Block.Air, true)) return;

            Vector3 centre = new Vector3(TargetX + 0.5f, TargetY + 0.5f, TargetZ + 0.5f);
            session.Particles.SpawnBlockBreak(centre, block);
            session.Audio.Play(SoundId.Break, centre);
            session.Network.BroadcastBlockChange(TargetX, TargetY, TargetZ, Block.Air);
            session.Stats.BlocksMined++;

            if (canHarvest && block.DropsAs != Block.Air)
            {
                session.Drops.Spawn(centre, block.DropsAs, 1);
            }
        }

        private bool TryMelee(GameSession session, ItemDefinition weapon)
        {
            if (_attackCooldown > 0.0f) return false;

            Vector3 origin = EyePosition;
            Vector3 direction = Forward;

            float distance;
            Enemy target = session.Enemies.Raycast(origin, direction, 3.2f, out distance);
            if (target == null) return false;

            _attackCooldown = weapon.AttackInterval;

            Vector3 knockback = direction * 5.5f;
            knockback.Y = 3.0f;
            target.Damage(weapon.MeleeDamage, knockback);
            session.Audio.Play(SoundId.Hit, target.Position);
            session.Particles.SpawnBlood(target.Position + new Vector3(0.0f, 1.0f, 0.0f));

            if (target.IsDead) session.OnEnemyKilled(target);
            return true;
        }

        // ---- Firearms ---------------------------------------------------------

        private void TryFire(GameSession session, ItemDefinition gun)
        {
            if (_attackCooldown > 0.0f || _reloadTimer > 0.0f) return;

            ItemStack held = Inventory.Selected;
            if (held.Data == 0)
            {
                BeginReload();
                return;
            }

            held.Data--;
            Inventory.Selected = held;
            _attackCooldown = gun.FireInterval;
            RecoilPitch += gun.RecoilKick * 0.02f;
            Pitch += gun.RecoilKick * 0.012f;

            session.Audio.Play(GunSound(gun), Position);
            session.Particles.SpawnMuzzleFlash(EyePosition + Forward * 0.6f);

            if (gun.Gun == GunKind.Launcher)
            {
                session.Projectiles.SpawnRocket(EyePosition + Forward * 0.8f, Forward * 34.0f, gun.GunDamage);
                return;
            }

            int pellets = gun.Pellets;
            for (int i = 0; i < pellets; i++)
            {
                Vector3 direction = Forward;
                if (gun.Spread > 0.0f)
                {
                    direction.X += session.NextSpread(gun.Spread);
                    direction.Y += session.NextSpread(gun.Spread);
                    direction.Z += session.NextSpread(gun.Spread);
                    direction.Normalize();
                }
                FireHitscan(session, gun, direction);
            }
        }

        private void FireHitscan(GameSession session, ItemDefinition gun, Vector3 direction)
        {
            Vector3 origin = EyePosition;

            float enemyDistance;
            Enemy target = session.Enemies.Raycast(origin, direction, gun.GunRange, out enemyDistance);

            RayHit blockHit = VoxelRaycast.Cast(session.World, origin, direction, gun.GunRange, false);
            float blockDistance = blockHit.Hit ? blockHit.Distance : float.MaxValue;

            if (target != null && enemyDistance < blockDistance)
            {
                Vector3 knockback = direction * 3.0f;
                target.Damage(gun.GunDamage, knockback);
                session.Particles.SpawnBlood(origin + direction * enemyDistance);
                session.Audio.Play(SoundId.Hit, target.Position);
                if (target.IsDead) session.OnEnemyKilled(target);
                return;
            }

            if (blockHit.Hit)
            {
                Vector3 point = origin + direction * blockHit.Distance;
                session.Particles.SpawnImpact(point, BlockRegistry.Get(blockHit.BlockId));
            }
        }

        private static SoundId GunSound(ItemDefinition gun)
        {
            switch (gun.Gun)
            {
                case GunKind.Shotgun: return SoundId.Shotgun;
                case GunKind.Beam: return SoundId.Laser;
                case GunKind.Launcher: return SoundId.Explosion;
                default: return SoundId.Gunshot;
            }
        }

        public void BeginReload()
        {
            ItemStack held = Inventory.Selected;
            if (held.IsEmpty) return;

            ItemDefinition def = held.Definition;
            if (!def.IsFirearm) return;
            if (held.Data >= def.MagazineSize) return;
            if (!Inventory.Has(def.AmmoItem, 1)) return;

            _reloadTimer = def.ReloadTime;
        }

        private void FinishReload()
        {
            ItemStack held = Inventory.Selected;
            if (held.IsEmpty) return;

            ItemDefinition def = held.Definition;
            if (!def.IsFirearm) return;

            int needed = def.MagazineSize - held.Data;
            int taken = Inventory.Remove(def.AmmoItem, needed);
            held.Data = (ushort)(held.Data + taken);
            Inventory.Selected = held;
        }

        /// <summary>Rounds in the magazine, or -1 when the held item is not a firearm.</summary>
        public int LoadedRounds
        {
            get
            {
                ItemStack held = Inventory.Selected;
                if (held.IsEmpty || !held.Definition.IsFirearm) return -1;
                return held.Data;
            }
        }

        public int ReserveRounds
        {
            get
            {
                ItemStack held = Inventory.Selected;
                if (held.IsEmpty || !held.Definition.IsFirearm) return -1;
                return Inventory.CountOf(held.Definition.AmmoItem);
            }
        }

        // ---- Survival ---------------------------------------------------------

        private void UpdateSurvival(GameSession session, float dt)
        {
            _timeSinceDamage += dt;

            byte feet = BlockAtFeet(session.World);
            if (feet == Block.Lava)
            {
                _burnTimer += dt;
                if (_burnTimer >= 0.5f)
                {
                    _burnTimer = 0.0f;
                    Damage(8, Vector3.Zero);
                    session.Audio.Play(SoundId.Hurt, Position);
                }
            }
            else
            {
                _burnTimer = 0.0f;
            }

            if (HeadInLiquid && feet != Block.Lava)
            {
                _drownTimer += dt;
                if (_drownTimer > 14.0f)
                {
                    _drownTimer = 12.0f;
                    Damage(6, Vector3.Zero);
                }
            }
            else
            {
                _drownTimer = 0.0f;
            }

            // Regeneration is slow and stops the moment anything touches you, so a fight
            // gone wrong still means retreating rather than tanking through it.
            if (_timeSinceDamage > 8.0f && Health < MaxHealth)
            {
                _regenAccumulator += dt;
                while (_regenAccumulator >= 1.2f)
                {
                    _regenAccumulator -= 1.2f;
                    Heal(2);
                }
            }
        }

        public override void Damage(int amount, Vector3 knockback)
        {
            if (IsDead) return;
            base.Damage(amount, knockback);
            _timeSinceDamage = 0.0f;
            _regenAccumulator = 0.0f;
            DamageFlash = 1.0f;
        }
    }
}
