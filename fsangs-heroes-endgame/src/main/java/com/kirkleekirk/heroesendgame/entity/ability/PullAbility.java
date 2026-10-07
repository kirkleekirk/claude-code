package com.kirkleekirk.heroesendgame.entity.ability;

import com.kirkleekirk.heroesendgame.entity.EndgameBoss;
import net.minecraft.core.particles.ParticleOptions;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.world.damagesource.DamageType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.phys.Vec3;

/**
 * Yanks the target in (telekinesis, chain whips, tractor beams), then hits it when it arrives.
 */
public class PullAbility extends BossAbility {
    private final int cooldown;
    private final double minRange;
    private final double maxRange;
    private final float power;
    private final ResourceKey<DamageType> type;
    private final ParticleOptions particle;
    private final SoundEvent sound;

    public PullAbility(EndgameBoss boss, int cooldown, double minRange, double maxRange, float power, ResourceKey<DamageType> type,
                       ParticleOptions particle, SoundEvent sound) {
        super(boss);
        this.cooldown = cooldown;
        this.minRange = minRange;
        this.maxRange = maxRange;
        this.power = power;
        this.type = type;
        this.particle = particle;
        this.sound = sound;
    }

    @Override
    public int cooldownTicks() {
        return cooldown;
    }

    @Override
    public boolean canUse(LivingEntity target) {
        double d = boss.distanceTo(target);
        return d >= minRange && d <= maxRange && boss.hasLineOfSight(target);
    }

    @Override
    public int castPose() {
        return EndgameBoss.POSE_CAST;
    }

    @Override
    public void start(LivingEntity target) {
        boss.playSound(sound, 1.5F, 0.8F);
    }

    @Override
    public boolean tick(LivingEntity target) {
        boss.getLookControl().setLookAt(target, 90, 90);
        if (boss.level() instanceof ServerLevel level) {
            Vec3 from = boss.getEyePosition();
            Vec3 to = target.getBoundingBox().getCenter();
            Vec3 step = to.subtract(from);
            for (int i = 1; i < 12; i++) {
                Vec3 p = from.add(step.scale(i / 12.0));
                level.sendParticles(particle, p.x, p.y, p.z, 1, 0, 0, 0, 0);
            }
        }
        if (ticks < 6) {
            return true;
        }
        Vec3 pull = boss.position().subtract(target.position());
        double distance = pull.length();
        if (distance < 2.5 || ticks > 30) {
            boss.strike(target, power, type);
            return false;
        }
        EndgameBoss.launch(target, pull.normalize().scale(Math.min(1.6, 0.4 + distance * 0.08)).add(0, 0.12, 0));
        return true;
    }
}
