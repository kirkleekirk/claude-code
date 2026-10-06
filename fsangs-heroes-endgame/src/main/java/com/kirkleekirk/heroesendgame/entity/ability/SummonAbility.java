package com.kirkleekirk.heroesendgame.entity.ability;

import com.kirkleekirk.heroesendgame.entity.EndgameBoss;
import net.minecraft.core.particles.ParticleOptions;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.MobSpawnType;

import java.util.function.Supplier;

/**
 * Calls in minions (Chitauri, Mindless Ones, Sentinels...), never more than {@code maxAlive} at once.
 */
public class SummonAbility extends BossAbility {
    private final int cooldown;
    private final Supplier<? extends EntityType<? extends EndgameBoss>> type;
    private final int count;
    private final int maxAlive;
    private final ParticleOptions particle;
    private final int minPhase;

    public SummonAbility(EndgameBoss boss, int cooldown, Supplier<? extends EntityType<? extends EndgameBoss>> type, int count,
                         int maxAlive, ParticleOptions particle, int minPhase) {
        super(boss);
        this.cooldown = cooldown;
        this.type = type;
        this.count = count;
        this.maxAlive = maxAlive;
        this.particle = particle;
        this.minPhase = minPhase;
    }

    @Override
    public int cooldownTicks() {
        return cooldown;
    }

    @Override
    public int weight() {
        return 6;
    }

    @Override
    public boolean canUse(LivingEntity target) {
        return boss.getPhase() >= minPhase && alive() < maxAlive;
    }

    private int alive() {
        return boss.level().getEntities(type.get(), boss.getBoundingBox().inflate(48), e -> e.isAlive()).size();
    }

    @Override
    public boolean tick(LivingEntity target) {
        if (ticks < 20) {
            boss.burst(particle, 8, 1.2);
            return true;
        }
        if (!(boss.level() instanceof ServerLevel level)) {
            return false;
        }
        int toSpawn = Math.min(count, maxAlive - alive());
        for (int i = 0; i < toSpawn; i++) {
            EndgameBoss minion = type.get().create(level);
            if (minion == null) {
                continue;
            }
            double angle = boss.getRandom().nextDouble() * Math.PI * 2;
            double x = boss.getX() + Math.cos(angle) * 3;
            double z = boss.getZ() + Math.sin(angle) * 3;
            minion.moveTo(x, boss.getY(), z, boss.getYRot(), 0);
            if (!minion.randomTeleport(x, boss.getY() + 2, z, false)) {
                minion.moveTo(boss.getX(), boss.getY(), boss.getZ(), boss.getYRot(), 0);
            }
            minion.markSummoned();
            minion.finalizeSpawn(level, level.getCurrentDifficultyAt(minion.blockPosition()), MobSpawnType.MOB_SUMMONED, null, null);
            minion.setupFor(boss.getHuntedPlayer(), null, boss.getEncounterId(), 1, 1.0F, boss.getEncounterLevel());
            minion.setTarget(target);
            level.addFreshEntity(minion);
            minion.playArrival();
        }
        boss.playSound(SoundEvents.EVOKER_PREPARE_SUMMON, 2.0F, 0.7F);
        return false;
    }
}
