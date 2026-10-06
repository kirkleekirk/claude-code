package com.kirkleekirk.heroesendgame.entity.ability;

import com.kirkleekirk.heroesendgame.entity.EndgameBoss;
import net.minecraft.resources.ResourceKey;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.damagesource.DamageType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.phys.Vec3;

/**
 * Leaps at the target and slams the ground on landing.
 */
public class LeapSlamAbility extends BossAbility {
    private final int cooldown;
    private final double radius;
    private final float power;
    private final ResourceKey<DamageType> type;
    private boolean airborne;

    public LeapSlamAbility(EndgameBoss boss, int cooldown, double radius, float power, ResourceKey<DamageType> type) {
        super(boss);
        this.cooldown = cooldown;
        this.radius = radius;
        this.power = power;
        this.type = type;
    }

    @Override
    public int cooldownTicks() {
        return cooldown;
    }

    @Override
    public boolean canUse(LivingEntity target) {
        double d = boss.distanceTo(target);
        return boss.onGround() && d > 4 && d < 24;
    }

    @Override
    public int castPose() {
        return EndgameBoss.POSE_SLAM;
    }

    @Override
    public void start(LivingEntity target) {
        airborne = false;
        Vec3 to = target.position().subtract(boss.position());
        double horizontal = Math.sqrt(to.x * to.x + to.z * to.z);
        Vec3 flat = new Vec3(to.x, 0, to.z).normalize().scale(Math.min(2.2, horizontal * 0.11));
        boss.setDeltaMovement(flat.x, 0.9 + Math.min(0.6, horizontal * 0.02), flat.z);
        boss.hasImpulse = true;
        boss.playSound(SoundEvents.RAVAGER_ROAR, 1.5F, 0.8F);
    }

    @Override
    public boolean tick(LivingEntity target) {
        if (ticks > 3 && !boss.onGround()) {
            airborne = true;
        }
        if ((airborne && boss.onGround()) || ticks > 60) {
            boss.shockwave(radius, power, type, 1.4, 0.6);
            boss.playSound(SoundEvents.GENERIC_EXPLODE, 2.0F, 0.6F);
            return false;
        }
        return true;
    }
}
