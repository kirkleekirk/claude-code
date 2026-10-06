package com.kirkleekirk.heroesendgame.entity.karma;

import com.kirkleekirk.heroesendgame.compat.FsangCompat;
import com.kirkleekirk.heroesendgame.config.EndgameConfig;
import com.kirkleekirk.heroesendgame.entity.BossStats;
import com.kirkleekirk.heroesendgame.entity.EndgameBoss;
import com.kirkleekirk.heroesendgame.entity.ability.BeamAbility;
import com.kirkleekirk.heroesendgame.entity.ability.BossAbility;
import com.kirkleekirk.heroesendgame.entity.ability.LeapSlamAbility;
import com.kirkleekirk.heroesendgame.entity.ability.PullAbility;
import com.kirkleekirk.heroesendgame.registry.ModDamageTypes;
import com.kirkleekirk.heroesendgame.registry.ModEffects;
import net.minecraft.ChatFormatting;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.util.Mth;
import net.minecraft.world.BossEvent;
import net.minecraft.world.DifficultyInstance;
import net.minecraft.world.damagesource.DamageType;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.MobSpawnType;
import net.minecraft.world.entity.SpawnGroupData;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.ServerLevelAccessor;
import org.jetbrains.annotations.Nullable;

import java.util.List;

/**
 * The Spirit of Vengeance. Comes at night for players whose FSang karma has sunk too low (killing villagers, golems
 * and other players). The Penance Stare burns harder the more innocent blood is on your hands. If your karma
 * recovers while he hunts you, he leaves.
 */
public class GhostRiderEntity extends EndgameBoss {
    private static final BossStats STATS = new BossStats(450, 10, 9, 50, 0.08F, 14, 0.36);

    public GhostRiderEntity(EntityType<? extends GhostRiderEntity> type, Level level) {
        super(type, level);
    }

    public static AttributeSupplier.Builder createAttributes() {
        return EndgameBoss.bossAttributes(450, 10, 0.36, 14);
    }

    @Override
    public BossStats stats() {
        return STATS;
    }

    @Override
    protected String dialogueKey() {
        return "ghost_rider";
    }

    @Override
    protected BossEvent.BossBarColor bossBarColor() {
        return BossEvent.BossBarColor.YELLOW;
    }

    @Override
    protected ChatFormatting nameColor() {
        return ChatFormatting.GOLD;
    }

    @Override
    protected double chaseSpeed() {
        return 1.25;
    }

    @Override
    protected ResourceKey<DamageType> meleeDamageType() {
        return ModDamageTypes.HELLFIRE;
    }

    @Override
    protected void onMeleeHit(LivingEntity target) {
        target.addEffect(new MobEffectInstance(ModEffects.HELLFIRE.get(), 80, 0));
    }

    @Override
    protected void registerAbilities(List<BossAbility> abilities) {
        abilities.add(new PullAbility(this, 160, 4, 22, 1.1F, ModDamageTypes.HELLFIRE, ParticleTypes.SOUL_FIRE_FLAME, SoundEvents.CHAIN_PLACE));
        abilities.add(new PenanceStareAbility(this));
        abilities.add(new BeamAbility(this, 200, 10, 30, 10, 0.4F, ModDamageTypes.HELLFIRE, ParticleTypes.SOUL_FIRE_FLAME, SoundEvents.BLAZE_SHOOT)
                .onHit(victim -> victim.addEffect(new MobEffectInstance(ModEffects.HELLFIRE.get(), 100, 0))));
        abilities.add(new LeapSlamAbility(this, 240, 4.5, 1.2F, ModDamageTypes.HELLFIRE));
    }

    @Override
    protected void customServerAiStep() {
        super.customServerAiStep();
        if (level() instanceof ServerLevel level && tickCount % 2 == 0) {
            level.sendParticles(ParticleTypes.SOUL_FIRE_FLAME, getX(), getEyeY() + 0.1, getZ(), 3, 0.15, 0.15, 0.15, 0.01);
        }
        // Redemption: if the hunted player's karma recovers, the Spirit has no business with them.
        if (tickCount % 40 == 0) {
            ServerPlayer hunted = getHuntedPlayer();
            if (hunted != null && FsangCompat.hasKarma(hunted) && FsangCompat.karma(hunted) > EndgameConfig.GHOST_RIDER_KARMA.get()) {
                say("innocent");
                retreat(false);
            }
        }
    }

    @Override
    public void playArrival() {
        burst(ParticleTypes.SOUL_FIRE_FLAME, 120, 1.2);
        burst(ParticleTypes.LAVA, 20, 0.8);
        playSound(SoundEvents.BLAZE_SHOOT, 2.0F, 0.4F);
        playSound(SoundEvents.SKELETON_HORSE_AMBIENT, 2.0F, 0.5F);
        sayRandom("arrival", 2);
    }

    @Override
    public SpawnGroupData finalizeSpawn(ServerLevelAccessor level, DifficultyInstance difficulty, MobSpawnType reason,
                                        @Nullable SpawnGroupData data, @Nullable CompoundTag tag) {
        SpawnGroupData result = super.finalizeSpawn(level, difficulty, reason, data, tag);
        FsangCompat.equipSuit(this, "ghost_rider_robbie");
        return result;
    }

    /** "Look into my eyes." The more innocents you killed, the more it burns. */
    static class PenanceStareAbility extends BossAbility {
        PenanceStareAbility(EndgameBoss boss) {
            super(boss);
        }

        @Override
        public int cooldownTicks() {
            return 300;
        }

        @Override
        public int weight() {
            return 14;
        }

        @Override
        public boolean canUse(LivingEntity target) {
            return target instanceof Player && boss.distanceTo(target) < 10 && boss.hasLineOfSight(target);
        }

        @Override
        public int castPose() {
            return POSE_BEAM;
        }

        @Override
        public void start(LivingEntity target) {
            ((GhostRiderEntity) boss).say("penance");
            boss.playSound(SoundEvents.SOUL_ESCAPE, 2.0F, 0.5F);
        }

        @Override
        public boolean tick(LivingEntity target) {
            if (!boss.hasLineOfSight(target) || boss.distanceTo(target) > 14) {
                return false;
            }
            boss.getLookControl().setLookAt(target, 180, 180);
            target.addEffect(new MobEffectInstance(MobEffects.MOVEMENT_SLOWDOWN, 10, 5, false, false));
            target.addEffect(new MobEffectInstance(MobEffects.DARKNESS, 40, 0, false, false));
            if (boss.level() instanceof ServerLevel level) {
                level.sendParticles(ParticleTypes.SOUL_FIRE_FLAME, target.getX(), target.getEyeY(), target.getZ(), 4, 0.2, 0.2, 0.2, 0.01);
            }
            if (ticks % 10 == 9 && target instanceof Player player) {
                int karma = FsangCompat.karma(player);
                float sins = Mth.clamp(Math.abs(Math.min(karma, 0)) / 400.0F, 0.3F, 1.6F);
                boss.strike(target, sins * 0.5F, ModDamageTypes.PENANCE);
            }
            return ticks < 60;
        }
    }
}
