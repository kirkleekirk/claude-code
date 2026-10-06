package com.kirkleekirk.heroesendgame.entity.ability;

import com.kirkleekirk.heroesendgame.entity.EndgameBoss;
import net.minecraft.core.particles.ParticleOptions;
import net.minecraft.resources.ResourceKey;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.damagesource.DamageType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.phys.Vec3;

/**
 * Vanishes and reappears behind the target for a heavy strike.
 */
public class BlinkStrikeAbility extends BossAbility {
    private final int cooldown;
    private final float power;
    private final ResourceKey<DamageType> type;
    private final ParticleOptions particle;
    private final int delay;

    public BlinkStrikeAbility(EndgameBoss boss, int cooldown, float power, ResourceKey<DamageType> type, ParticleOptions particle, int delay) {
        super(boss);
        this.cooldown = cooldown;
        this.power = power;
        this.type = type;
        this.particle = particle;
        this.delay = delay;
    }

    @Override
    public int cooldownTicks() {
        return cooldown;
    }

    @Override
    public boolean canUse(LivingEntity target) {
        return boss.distanceTo(target) < 32;
    }

    @Override
    public int castPose() {
        return EndgameBoss.POSE_CHARGE;
    }

    @Override
    public void start(LivingEntity target) {
        boss.burst(particle, 30, 1.0);
        Vec3 behind = target.position().subtract(target.getLookAngle().multiply(1, 0, 1).normalize().scale(1.6));
        if (boss.randomTeleport(behind.x, target.getY(), behind.z, false)) {
            boss.burst(particle, 30, 1.0);
            boss.playSound(SoundEvents.ENDERMAN_TELEPORT, 1.0F, 1.4F);
        }
        boss.getLookControl().setLookAt(target);
    }

    @Override
    public boolean tick(LivingEntity target) {
        boss.getLookControl().setLookAt(target, 90, 90);
        if (ticks >= delay) {
            if (boss.distanceToSqr(target) <= boss.meleeReachSqr(target) + 4) {
                boss.swing(InteractionHand.MAIN_HAND);
                boss.strike(target, power, type);
            }
            return false;
        }
        return true;
    }
}
