package com.kirkleekirk.heroesendgame.entity.ability;

import com.kirkleekirk.heroesendgame.entity.EndgameBoss;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.resources.ResourceKey;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.damagesource.DamageType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.phys.Vec3;

import java.util.HashSet;
import java.util.Set;

/**
 * A straight-line bull rush that tramples everything in the way.
 */
public class ChargeAbility extends BossAbility {
    private final int cooldown;
    private final double speed;
    private final float power;
    private final ResourceKey<DamageType> type;
    private final int windup;
    private Vec3 direction = Vec3.ZERO;
    private final Set<LivingEntity> hit = new HashSet<>();

    public ChargeAbility(EndgameBoss boss, int cooldown, double speed, float power, ResourceKey<DamageType> type, int windup) {
        super(boss);
        this.cooldown = cooldown;
        this.speed = speed;
        this.power = power;
        this.type = type;
        this.windup = windup;
    }

    @Override
    public int cooldownTicks() {
        return cooldown;
    }

    @Override
    public boolean canUse(LivingEntity target) {
        double d = boss.distanceTo(target);
        return d > 5 && d < 26 && boss.hasLineOfSight(target);
    }

    @Override
    public int castPose() {
        return EndgameBoss.POSE_CHARGE;
    }

    @Override
    public void start(LivingEntity target) {
        hit.clear();
        boss.playSound(SoundEvents.RAVAGER_ROAR, 2.0F, 0.6F);
    }

    @Override
    public boolean tick(LivingEntity target) {
        if (ticks < windup) {
            boss.getLookControl().setLookAt(target, 90, 90);
            direction = target.position().subtract(boss.position()).multiply(1, 0, 1).normalize();
            boss.burst(ParticleTypes.CLOUD, 2, 0.5);
            return true;
        }
        if (ticks > windup + 30) {
            return false;
        }
        boss.setDeltaMovement(direction.x * speed, boss.getDeltaMovement().y, direction.z * speed);
        boss.setYRot((float) (Math.atan2(direction.z, direction.x) * 180 / Math.PI) - 90);
        boss.yBodyRot = boss.getYRot();
        for (LivingEntity victim : boss.enemiesInRange(boss.getBbWidth() + 1.2)) {
            if (hit.add(victim)) {
                boss.strike(victim, power, type);
                EndgameBoss.launch(victim, victim.getDeltaMovement().add(direction.x * 1.8, 0.7, direction.z * 1.8));
            }
        }
        if (boss.horizontalCollision && ticks > windup + 3) {
            boss.playSound(SoundEvents.GENERIC_EXPLODE, 1.5F, 0.8F);
            return false;
        }
        return true;
    }
}
