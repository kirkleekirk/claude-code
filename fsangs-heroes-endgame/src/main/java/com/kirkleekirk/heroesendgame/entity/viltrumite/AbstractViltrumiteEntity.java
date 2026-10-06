package com.kirkleekirk.heroesendgame.entity.viltrumite;

import com.kirkleekirk.heroesendgame.compat.FsangCompat;
import com.kirkleekirk.heroesendgame.entity.EndgameBoss;
import com.kirkleekirk.heroesendgame.entity.ability.BossAbility;
import com.kirkleekirk.heroesendgame.entity.ability.GrabSlamAbility;
import com.kirkleekirk.heroesendgame.entity.ability.ShockwaveAbility;
import com.kirkleekirk.heroesendgame.registry.ModDamageTypes;
import net.minecraft.ChatFormatting;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.resources.ResourceKey;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.BossEvent;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.damagesource.DamageType;
import net.minecraft.world.effect.MobEffect;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.Vec3;
import net.minecraftforge.registries.ForgeRegistries;

import java.util.List;

/**
 * Shared behaviour of the Viltrumite Empire: flight, crushing punches, the grab-and-slam, the thunderclap and
 * dive attacks - and the one thing every Viltrumite fears, FSang's Scourge Virus.
 */
public abstract class AbstractViltrumiteEntity extends EndgameBoss {
    private static final ResourceLocation SCOURGE = new ResourceLocation(FsangCompat.MOD_ID, "scourge_virus");
    private boolean diving;
    private int diveTicks;

    protected AbstractViltrumiteEntity(EntityType<? extends AbstractViltrumiteEntity> type, Level level) {
        super(type, level);
    }

    /** FSang suit set this Viltrumite wears (fsang:&lt;suit&gt;_chestplate...). */
    protected abstract String suit();

    @Override
    protected String dialogueKey() {
        return "viltrumite";
    }

    @Override
    protected boolean isFlyer() {
        return true;
    }

    @Override
    protected BossEvent.BossBarColor bossBarColor() {
        return BossEvent.BossBarColor.RED;
    }

    @Override
    protected ChatFormatting nameColor() {
        return ChatFormatting.RED;
    }

    @Override
    protected ResourceKey<DamageType> meleeDamageType() {
        return ModDamageTypes.VILTRUMITE;
    }

    @Override
    protected double meleeKnockback() {
        return 1.6;
    }

    @Override
    protected int meleeInterval() {
        return 14;
    }

    @Override
    protected double flightSpeed() {
        return super.flightSpeed() * (hasScourge() ? 0.55 : 1.0);
    }

    @Override
    protected float damageMultiplier() {
        return hasScourge() ? 0.5F : 1.0F;
    }

    @Override
    protected boolean isWeakTo(MobEffect effect) {
        return SCOURGE.equals(ForgeRegistries.MOB_EFFECTS.getKey(effect));
    }

    public boolean hasScourge() {
        return FsangCompat.hasScourgeVirus(this);
    }

    @Override
    protected float modifyIncomingDamage(DamageSource source, float amount) {
        return hasScourge() ? amount * 1.5F : amount;
    }

    @Override
    protected void onMeleeHit(LivingEntity target) {
        // Viltrumite punches send people flying.
        Vec3 push = target.position().subtract(position()).normalize().scale(1.2);
        launch(target, target.getDeltaMovement().add(push.x, 0.35, push.z));
    }

    @Override
    protected void registerAbilities(List<BossAbility> abilities) {
        abilities.add(new GrabSlamAbility(this, 240, 1.6F, ModDamageTypes.VILTRUMITE, 26));
        abilities.add(new DiveAbility(this, 160, 1.7F));
        abilities.add(new BarrageAbility(this, 120, 0.35F));
        abilities.add(new ShockwaveAbility(this, 220, 18, 7.0, 0.9F, ModDamageTypes.VILTRUMITE, 2.2, 0.5,
                ParticleTypes.CLOUD, SoundEvents.WARDEN_SONIC_BOOM, POSE_CAST)
                .onRelease(t -> {
                    if (level() instanceof ServerLevel serverLevel) {
                        serverLevel.sendParticles(ParticleTypes.SONIC_BOOM, getX(), getY() + 1.2, getZ(), 1, 0, 0, 0, 0);
                    }
                    for (LivingEntity victim : enemiesInRange(7)) {
                        victim.addEffect(new MobEffectInstance(MobEffects.CONFUSION, 80, 0));
                    }
                }));
    }

    @Override
    public void playArrival() {
        // Plummets out of the sky like a meteor.
        diving = true;
        diveTicks = 0;
        setFlying(true);
        playSound(SoundEvents.FIREWORK_ROCKET_LARGE_BLAST_FAR, 3.0F, 0.5F);
    }

    @Override
    public boolean isMovementLocked() {
        return diving || super.isMovementLocked();
    }

    @Override
    protected void customServerAiStep() {
        super.customServerAiStep();
        if (diving) {
            tickDive();
        }
        if (tickCount % 20 == 0 && getHealth() < getMaxHealth() && !hasScourge()) {
            heal(getMaxHealth() * 0.0025F); // Viltrumite healing factor
        }
        if (hasScourge() && tickCount % 10 == 0 && level() instanceof ServerLevel serverLevel) {
            serverLevel.sendParticles(ParticleTypes.SNEEZE, getX(), getEyeY(), getZ(), 3, 0.2, 0.2, 0.2, 0.01);
        }
    }

    private void tickDive() {
        diveTicks++;
        LivingEntity target = getTarget();
        Vec3 aim = target != null ? target.position().add(0, 1, 0) : position().add(0, -10, 0);
        flyTowards(aim, 2.4, 0.5);
        setCastPose(POSE_FLY);
        if (level() instanceof ServerLevel serverLevel) {
            serverLevel.sendParticles(ParticleTypes.FLAME, getX(), getY() + 1, getZ(), 4, 0.3, 0.5, 0.3, 0.02);
        }
        boolean landed = onGround() || verticalCollision || horizontalCollision
                || (target != null && distanceTo(target) < 3.5) || diveTicks > 80;
        if (landed) {
            diving = false;
            setCastPose(POSE_NONE);
            setDeltaMovement(Vec3.ZERO);
            shockwave(5.0, 0.6F, ModDamageTypes.VILTRUMITE, 1.5, 0.4);
            playSound(SoundEvents.GENERIC_EXPLODE, 3.0F, 0.6F);
            if (level() instanceof ServerLevel serverLevel) {
                serverLevel.sendParticles(ParticleTypes.EXPLOSION_EMITTER, getX(), getY(), getZ(), 1, 0, 0, 0, 0);
            }
            sayRandom("arrival", 2);
        }
    }

    @Override
    public net.minecraft.world.entity.SpawnGroupData finalizeSpawn(net.minecraft.world.level.ServerLevelAccessor level,
                                                                     net.minecraft.world.DifficultyInstance difficulty,
                                                                     net.minecraft.world.entity.MobSpawnType reason,
                                                                     @org.jetbrains.annotations.Nullable net.minecraft.world.entity.SpawnGroupData data,
                                                                     @org.jetbrains.annotations.Nullable net.minecraft.nbt.CompoundTag tag) {
        net.minecraft.world.entity.SpawnGroupData result = super.finalizeSpawn(level, difficulty, reason, data, tag);
        FsangCompat.equipSuit(this, suit());
        return result;
    }

    // =================================================================================================================

    /** Rises, then rockets into the target like a missile. */
    static class DiveAbility extends BossAbility {
        private final float power;
        private Vec3 direction = Vec3.ZERO;
        private boolean connected;

        DiveAbility(EndgameBoss boss, int cooldown, float power) {
            super(boss);
            this.power = power;
            this.cooldown = cooldown;
        }

        private final int cooldown;

        @Override
        public int cooldownTicks() {
            return cooldown;
        }

        @Override
        public boolean canUse(LivingEntity target) {
            double d = boss.distanceTo(target);
            return d > 6 && d < 40;
        }

        @Override
        public int castPose() {
            return POSE_FLY;
        }

        @Override
        public void start(LivingEntity target) {
            connected = false;
        }

        @Override
        public boolean tick(LivingEntity target) {
            if (ticks < 10) {
                boss.flyTowards(boss.position().add(0, 5, 0), 0.8, 0.5);
                direction = target.position().add(0, target.getBbHeight() * 0.5, 0).subtract(boss.position()).normalize();
                return true;
            }
            if (ticks == 10) {
                boss.playSound(SoundEvents.FIREWORK_ROCKET_LAUNCH, 3.0F, 0.6F);
            }
            boss.flyTowards(boss.position().add(direction.scale(5)), 2.6, 0.9);
            if (boss.level() instanceof ServerLevel serverLevel) {
                serverLevel.sendParticles(ParticleTypes.CLOUD, boss.getX(), boss.getY() + 1, boss.getZ(), 2, 0.2, 0.2, 0.2, 0);
            }
            if (!connected && boss.distanceToSqr(target) < boss.meleeReachSqr(target) + 2) {
                connected = true;
                boss.swing(InteractionHand.MAIN_HAND);
                boss.strike(target, power, ModDamageTypes.VILTRUMITE);
                launch(target, direction.scale(2.4).add(0, 0.6, 0));
                boss.playSound(SoundEvents.PLAYER_ATTACK_KNOCKBACK, 2.0F, 0.5F);
                return false;
            }
            return ticks < 34 && !boss.horizontalCollision;
        }
    }

    /** A blur of punches at point blank range. */
    static class BarrageAbility extends BossAbility {
        private final int cooldown;
        private final float power;

        BarrageAbility(EndgameBoss boss, int cooldown, float power) {
            super(boss);
            this.cooldown = cooldown;
            this.power = power;
        }

        @Override
        public int cooldownTicks() {
            return cooldown;
        }

        @Override
        public boolean canUse(LivingEntity target) {
            return boss.distanceToSqr(target) < boss.meleeReachSqr(target);
        }

        @Override
        public int castPose() {
            return POSE_CHARGE;
        }

        @Override
        public boolean tick(LivingEntity target) {
            boss.getLookControl().setLookAt(target, 90, 90);
            if (ticks % 3 == 0) {
                boss.swing(ticks % 6 == 0 ? InteractionHand.MAIN_HAND : InteractionHand.OFF_HAND);
                if (boss.distanceToSqr(target) < boss.meleeReachSqr(target) + 2) {
                    target.invulnerableTime = 0;
                    boss.strike(target, power, ModDamageTypes.VILTRUMITE);
                }
            }
            return ticks < 18;
        }
    }
}
