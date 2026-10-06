package com.kirkleekirk.heroesendgame.entity.speedster;

import com.kirkleekirk.heroesendgame.compat.FsangCompat;
import com.kirkleekirk.heroesendgame.entity.BossStats;
import com.kirkleekirk.heroesendgame.entity.EndgameBoss;
import com.kirkleekirk.heroesendgame.entity.IllusionEntity;
import com.kirkleekirk.heroesendgame.entity.ability.BossAbility;
import com.kirkleekirk.heroesendgame.nemesis.NemesisDirector;
import com.kirkleekirk.heroesendgame.power.PowerFamily;
import com.kirkleekirk.heroesendgame.power.PowerProfile;
import com.kirkleekirk.heroesendgame.registry.ModDamageTypes;
import com.kirkleekirk.heroesendgame.registry.ModEntities;
import net.minecraft.ChatFormatting;
import net.minecraft.core.particles.DustParticleOptions;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.BossEvent;
import net.minecraft.world.DifficultyInstance;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.damagesource.DamageType;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LightningBolt;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.MobSpawnType;
import net.minecraft.world.entity.SpawnGroupData;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.ServerLevelAccessor;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;
import org.joml.Vector3f;

import java.util.List;

/**
 * Hunter Zolomon - Zoom. A speedster who hunts other speedsters to take their speed.
 * <ul>
 *     <li>Hit and run: he blitzes in, strikes, and is gone again before you can react.</li>
 *     <li>Every hit steals speed (FSang's speed inhibitor) and makes him stronger.</li>
 *     <li>He is a blur: unless you are fast too (a speedster moving at speed) or catch him while he gloats, most of
 *     your damage misses.</li>
 *     <li>Cold slows him down (slowness gets through his immunity).</li>
 *     <li>When beaten, the Time Wraiths drag him away.</li>
 * </ul>
 */
public class ZoomEntity extends EndgameBoss {
    private static final BossStats STATS = new BossStats(500, 9, 10, 55, 0.07F, 12, 0.42);
    private static final DustParticleOptions BLUE = new DustParticleOptions(new Vector3f(0.2F, 0.5F, 1.0F), 1.2F);
    private int stolenSpeed;
    private int gloating;

    public ZoomEntity(EntityType<? extends ZoomEntity> type, Level level) {
        super(type, level);
    }

    public static AttributeSupplier.Builder createAttributes() {
        return EndgameBoss.bossAttributes(500, 9, 0.42, 12);
    }

    @Override
    public BossStats stats() {
        return STATS;
    }

    @Override
    protected String dialogueKey() {
        return "zoom";
    }

    @Override
    protected BossEvent.BossBarColor bossBarColor() {
        return BossEvent.BossBarColor.BLUE;
    }

    @Override
    protected ChatFormatting nameColor() {
        return ChatFormatting.BLUE;
    }

    @Override
    protected double chaseSpeed() {
        return 1.6;
    }

    @Override
    protected int meleeInterval() {
        return 10;
    }

    @Override
    protected ResourceKey<DamageType> meleeDamageType() {
        return ModDamageTypes.SPEED_FORCE;
    }

    @Override
    protected float damageMultiplier() {
        return 1.0F + 0.1F * stolenSpeed;
    }

    @Override
    protected boolean isWeakTo(net.minecraft.world.effect.MobEffect effect) {
        return effect == MobEffects.MOVEMENT_SLOWDOWN;
    }

    @Override
    public boolean isMovementLocked() {
        return gloating > 0 || super.isMovementLocked();
    }

    @Override
    protected float[] phaseThresholds() {
        return new float[]{0.5F};
    }

    @Override
    protected void onPhaseChange(int phase) {
        say("remnants");
        if (level() instanceof ServerLevel level && getTarget() != null) {
            for (int i = 0; i < 2; i++) {
                IllusionEntity remnant = ModEntities.ILLUSION.get().create(level);
                if (remnant == null) {
                    continue;
                }
                remnant.setVariant(IllusionEntity.ZOOM);
                remnant.moveTo(getX(), getY(), getZ(), getYRot(), 0);
                remnant.markSummoned();
                remnant.setupFor(getHuntedPlayer(), null, getEncounterId(), 1, 1.0F, 0);
                remnant.setTarget(getTarget());
                remnant.copyLook(this);
                level.addFreshEntity(remnant);
            }
        }
    }

    @Override
    protected void registerAbilities(List<BossAbility> abilities) {
        abilities.add(new BlitzAbility(this));
        abilities.add(new PhaseStrikeAbility(this));
    }

    /** Most hits slide off a blur - unless you're a speedster at speed, or he stopped to gloat. */
    @Override
    protected float modifyIncomingDamage(DamageSource source, float amount) {
        if (gloating > 0) {
            return amount * 1.25F;
        }
        if (source.getEntity() instanceof ServerPlayer player) {
            PowerProfile profile = NemesisDirector.cachedProfile(player);
            boolean fast = player.getDeltaMovement().horizontalDistance() > 0.25 || player.hasEffect(MobEffects.MOVEMENT_SPEED);
            if (profile != null && profile.is(PowerFamily.SPEEDSTER) && fast) {
                return amount;
            }
        }
        if (hasEffect(MobEffects.MOVEMENT_SLOWDOWN)) {
            return amount;
        }
        if (random.nextFloat() < 0.5F) {
            burst(BLUE, 8, 0.6);
            return 0.0F;
        }
        return amount * 0.6F;
    }

    @Override
    protected void onMeleeHit(LivingEntity target) {
        stealSpeed(target);
    }

    void stealSpeed(LivingEntity target) {
        FsangCompat.dampen(target, FsangCompat.Dampening.SPEED, 100);
        target.addEffect(new MobEffectInstance(MobEffects.MOVEMENT_SLOWDOWN, 60, 1));
        if (stolenSpeed < 5) {
            stolenSpeed++;
            if (stolenSpeed == 5) {
                say("full_speed");
            }
        }
    }

    @Override
    protected void customServerAiStep() {
        super.customServerAiStep();
        if (gloating > 0) {
            gloating--;
        }
        if (level() instanceof ServerLevel level && getDeltaMovement().horizontalDistanceSqr() > 0.04) {
            level.sendParticles(ParticleTypes.ELECTRIC_SPARK, getX(), getY() + 1, getZ(), 3, 0.3, 0.5, 0.3, 0.05);
            level.sendParticles(BLUE, getX(), getY() + 1, getZ(), 2, 0.3, 0.5, 0.3, 0.0);
        }
    }

    @Override
    protected void onDefeated(DamageSource source) {
        // The Time Wraiths come for him.
        say("wraiths");
        if (level() instanceof ServerLevel level) {
            level.sendParticles(ParticleTypes.SOUL, getX(), getY() + 1, getZ(), 80, 0.8, 1.2, 0.8, 0.05);
            level.sendParticles(ParticleTypes.SCULK_SOUL, getX(), getY() + 1, getZ(), 40, 0.8, 1.2, 0.8, 0.05);
        }
        playSound(SoundEvents.WITHER_DEATH, 1.5F, 1.4F);
    }

    @Override
    public void playArrival() {
        if (level() instanceof ServerLevel level) {
            LightningBolt bolt = EntityType.LIGHTNING_BOLT.create(level);
            if (bolt != null) {
                bolt.moveTo(getX(), getY(), getZ());
                bolt.setVisualOnly(true);
                level.addFreshEntity(bolt);
            }
        }
        burst(BLUE, 80, 1.0);
        sayRandom("arrival", 2);
    }

    @Override
    public SpawnGroupData finalizeSpawn(ServerLevelAccessor level, DifficultyInstance difficulty, MobSpawnType reason,
                                        @Nullable SpawnGroupData data, @Nullable CompoundTag tag) {
        SpawnGroupData result = super.finalizeSpawn(level, difficulty, reason, data, tag);
        FsangCompat.equipSuit(this, "zoom_cw");
        return result;
    }

    @Override
    public void addAdditionalSaveData(CompoundTag tag) {
        super.addAdditionalSaveData(tag);
        tag.putInt("StolenSpeed", stolenSpeed);
    }

    @Override
    public void readAdditionalSaveData(CompoundTag tag) {
        super.readAdditionalSaveData(tag);
        stolenSpeed = tag.getInt("StolenSpeed");
    }

    private static void trail(ServerLevel level, Vec3 from, Vec3 to) {
        Vec3 step = to.subtract(from);
        int points = (int) Math.max(4, step.length() * 2);
        for (int i = 0; i <= points; i++) {
            Vec3 p = from.add(step.scale(i / (double) points));
            level.sendParticles(BLUE, p.x, p.y + 1, p.z, 1, 0.1, 0.3, 0.1, 0.0);
            level.sendParticles(ParticleTypes.ELECTRIC_SPARK, p.x, p.y + 1, p.z, 1, 0.1, 0.3, 0.1, 0.0);
        }
    }

    /** In, hit, out - faster than the eye can follow. Then, sometimes, he stops to gloat. */
    static class BlitzAbility extends BossAbility {
        BlitzAbility(EndgameBoss boss) {
            super(boss);
        }

        @Override
        public int cooldownTicks() {
            return 50;
        }

        @Override
        public int weight() {
            return 20;
        }

        @Override
        public boolean canUse(LivingEntity target) {
            return boss.distanceTo(target) < 40;
        }

        @Override
        public int castPose() {
            return POSE_CHARGE;
        }

        @Override
        public boolean tick(LivingEntity target) {
            ZoomEntity zoom = (ZoomEntity) boss;
            if (!(boss.level() instanceof ServerLevel level)) {
                return false;
            }
            if (ticks == 0) {
                Vec3 from = boss.position();
                Vec3 to = target.position().subtract(target.getLookAngle().multiply(1, 0, 1).normalize().scale(1.5));
                if (boss.randomTeleport(to.x, target.getY(), to.z, false)) {
                    trail(level, from, boss.position());
                }
                return true;
            }
            if (ticks == 2) {
                boss.getLookControl().setLookAt(target, 180, 180);
                boss.swing(InteractionHand.MAIN_HAND);
                if (boss.distanceToSqr(target) < boss.meleeReachSqr(target) + 4 && boss.strike(target, 1.0F, ModDamageTypes.SPEED_FORCE)) {
                    zoom.stealSpeed(target);
                }
                boss.playSound(SoundEvents.PLAYER_ATTACK_SWEEP, 1.0F, 1.6F);
                return true;
            }
            if (ticks == 4) {
                Vec3 from = boss.position();
                double angle = boss.getRandom().nextDouble() * Math.PI * 2;
                double distance = 10 + boss.getRandom().nextDouble() * 6;
                if (boss.randomTeleport(target.getX() + Math.cos(angle) * distance, target.getY() + 2, target.getZ() + Math.sin(angle) * distance, false)) {
                    trail(level, from, boss.position());
                }
                if (boss.getRandom().nextInt(4) == 0) {
                    zoom.gloating = 50;
                    zoom.sayRandom("taunt", 3);
                }
                return false;
            }
            return true;
        }
    }

    /** Vibrates his hand through armor. Telegraphed by sparks - move! */
    static class PhaseStrikeAbility extends BossAbility {
        private Vec3 marked = Vec3.ZERO;

        PhaseStrikeAbility(EndgameBoss boss) {
            super(boss);
        }

        @Override
        public int cooldownTicks() {
            return 260;
        }

        @Override
        public boolean canUse(LivingEntity target) {
            return target instanceof Player && boss.distanceTo(target) < 30;
        }

        @Override
        public void start(LivingEntity target) {
            marked = target.position();
            ((ZoomEntity) boss).say("phase");
        }

        @Override
        public boolean tick(LivingEntity target) {
            if (!(boss.level() instanceof ServerLevel level)) {
                return false;
            }
            if (ticks < 25) {
                level.sendParticles(ParticleTypes.ELECTRIC_SPARK, boss.getX(), boss.getY() + 1.2, boss.getZ(), 6, 0.3, 0.3, 0.3, 0.1);
                level.sendParticles(BLUE, marked.x, marked.y + 0.1, marked.z, 6, 0.8, 0.0, 0.8, 0.0);
                return true;
            }
            Vec3 from = boss.position();
            boss.randomTeleport(marked.x, marked.y, marked.z, false);
            trail(level, from, boss.position());
            if (target.position().distanceToSqr(marked) < 2.5 * 2.5) {
                // Phasing straight through armor.
                boss.strike(target, 2.2F, ModDamageTypes.SPEED_FORCE);
                target.addEffect(new MobEffectInstance(MobEffects.WITHER, 60, 1));
            }
            return false;
        }
    }
}
