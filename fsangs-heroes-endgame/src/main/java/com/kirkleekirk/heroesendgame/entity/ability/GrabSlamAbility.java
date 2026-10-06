package com.kirkleekirk.heroesendgame.entity.ability;

import com.kirkleekirk.heroesendgame.entity.EndgameBoss;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.resources.ResourceKey;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.damagesource.DamageType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.phys.Vec3;

/**
 * The Viltrumite signature: grab the target, carry it up into the sky and hurl it back into the ground.
 * Hitting the grabber hard enough while being carried breaks the hold.
 */
public class GrabSlamAbility extends BossAbility {
    private final int cooldown;
    private final float power;
    private final ResourceKey<DamageType> type;
    private final int carryTicks;
    private float healthAtGrab;
    private boolean released;

    public GrabSlamAbility(EndgameBoss boss, int cooldown, float power, ResourceKey<DamageType> type, int carryTicks) {
        super(boss);
        this.cooldown = cooldown;
        this.power = power;
        this.type = type;
        this.carryTicks = carryTicks;
    }

    @Override
    public int cooldownTicks() {
        return cooldown;
    }

    @Override
    public boolean canUse(LivingEntity target) {
        return boss.distanceTo(target) < 4.0 && !target.isPassenger();
    }

    @Override
    public int castPose() {
        return EndgameBoss.POSE_GRAB;
    }

    @Override
    public void start(LivingEntity target) {
        healthAtGrab = boss.getHealth();
        released = false;
        boss.playSound(SoundEvents.PLAYER_ATTACK_KNOCKBACK, 1.5F, 0.6F);
    }

    @Override
    public boolean tick(LivingEntity target) {
        if (released) {
            return false;
        }
        if (boss.getHealth() < healthAtGrab - boss.getMaxHealth() * 0.05F) {
            // The hero fought free.
            released = true;
            boss.say("grab_broken");
            EndgameBoss.launch(target, target.getDeltaMovement().add(0, 0.3, 0));
            return false;
        }
        Vec3 hold = boss.position().add(boss.getLookAngle().multiply(1, 0, 1).normalize().scale(1.1)).add(0, 0.4, 0);
        if (ticks < carryTicks) {
            boss.flyTowards(boss.position().add(0, 6, 0), 0.75, 0.6);
            Vec3 toHold = hold.subtract(target.position());
            EndgameBoss.launch(target, toHold.scale(0.8).add(boss.getDeltaMovement()));
            target.fallDistance = 0;
            if (ticks % 4 == 0) {
                boss.burst(ParticleTypes.CLOUD, 4, 0.6);
            }
            return !(boss.verticalCollision && ticks > 5);
        }
        // Slam
        boss.strike(target, power, type);
        EndgameBoss.launch(target, new Vec3(0, -3.2, 0));
        target.fallDistance = 18;
        boss.playSound(SoundEvents.GENERIC_EXPLODE, 2.0F, 0.5F);
        return false;
    }
}
