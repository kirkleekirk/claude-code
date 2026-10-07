package com.kirkleekirk.heroesendgame.entity.ability;

import com.kirkleekirk.heroesendgame.entity.EndgameBoss;
import net.minecraft.core.particles.ParticleOptions;
import net.minecraft.resources.ResourceKey;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.world.damagesource.DamageType;
import net.minecraft.world.entity.LivingEntity;

import java.util.function.Consumer;

/**
 * Winds up, then releases an area blast (Viltrumite thunderclap, hammer slam, stomp...).
 */
public class ShockwaveAbility extends BossAbility {
    private final int cooldown;
    private final int windup;
    private final double radius;
    private final float power;
    private final ResourceKey<DamageType> type;
    private final double knockback;
    private final double lift;
    private final ParticleOptions windupParticle;
    private final SoundEvent sound;
    private final int pose;
    private Consumer<LivingEntity> onRelease = t -> {
    };

    public ShockwaveAbility(EndgameBoss boss, int cooldown, int windup, double radius, float power, ResourceKey<DamageType> type,
                            double knockback, double lift, ParticleOptions windupParticle, SoundEvent sound, int pose) {
        super(boss);
        this.cooldown = cooldown;
        this.windup = windup;
        this.radius = radius;
        this.power = power;
        this.type = type;
        this.knockback = knockback;
        this.lift = lift;
        this.windupParticle = windupParticle;
        this.sound = sound;
        this.pose = pose;
    }

    public ShockwaveAbility onRelease(Consumer<LivingEntity> action) {
        this.onRelease = action;
        return this;
    }

    @Override
    public int cooldownTicks() {
        return cooldown;
    }

    @Override
    public boolean canUse(LivingEntity target) {
        return boss.distanceTo(target) < radius * 0.85;
    }

    @Override
    public int castPose() {
        return pose;
    }

    @Override
    public boolean tick(LivingEntity target) {
        boss.getLookControl().setLookAt(target);
        if (ticks < windup) {
            if (ticks % 2 == 0) {
                boss.burst(windupParticle, 6, 0.8);
            }
            return true;
        }
        boss.shockwave(radius, power, type, knockback, lift);
        boss.playSound(sound, 2.5F, 0.7F);
        onRelease.accept(target);
        return false;
    }
}
