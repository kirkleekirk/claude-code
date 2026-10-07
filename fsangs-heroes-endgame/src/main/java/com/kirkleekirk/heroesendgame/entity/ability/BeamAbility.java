package com.kirkleekirk.heroesendgame.entity.ability;

import com.kirkleekirk.heroesendgame.entity.EndgameBoss;
import net.minecraft.core.particles.ParticleOptions;
import net.minecraft.resources.ResourceKey;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.world.damagesource.DamageType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.phys.Vec3;

import java.util.function.Consumer;

/**
 * A channelled beam that slowly tracks the target (Sentinel eye beams, Thanos' Power Stone, Doom's siphon...).
 * The aim lags behind, so moving sideways dodges it.
 */
public class BeamAbility extends BossAbility {
    private final int cooldown;
    private final int windup;
    private final int duration;
    private final double range;
    private final float powerPerPulse;
    private final ResourceKey<DamageType> type;
    private final ParticleOptions particle;
    private final SoundEvent sound;
    private Consumer<LivingEntity> onHit = e -> {
    };
    private Vec3 aim = Vec3.ZERO;

    public BeamAbility(EndgameBoss boss, int cooldown, int windup, int duration, double range, float powerPerPulse,
                       ResourceKey<DamageType> type, ParticleOptions particle, SoundEvent sound) {
        super(boss);
        this.cooldown = cooldown;
        this.windup = windup;
        this.duration = duration;
        this.range = range;
        this.powerPerPulse = powerPerPulse;
        this.type = type;
        this.particle = particle;
        this.sound = sound;
    }

    public BeamAbility onHit(Consumer<LivingEntity> action) {
        this.onHit = action;
        return this;
    }

    @Override
    public int cooldownTicks() {
        return cooldown;
    }

    @Override
    public boolean canUse(LivingEntity target) {
        return boss.distanceTo(target) < range * 0.9 && boss.hasLineOfSight(target);
    }

    @Override
    public int castPose() {
        return EndgameBoss.POSE_BEAM;
    }

    @Override
    public void start(LivingEntity target) {
        aim = target.getEyePosition();
    }

    @Override
    public boolean tick(LivingEntity target) {
        Vec3 wanted = target.position().add(0, target.getBbHeight() * 0.6, 0);
        aim = aim.lerp(wanted, 0.18);
        boss.getLookControl().setLookAt(aim.x, aim.y, aim.z, 90, 90);
        if (ticks < windup) {
            boss.burst(particle, 3, 0.4);
            return true;
        }
        if (ticks % 5 == 0) {
            LivingEntity victim = boss.fireBeam(aim, range, powerPerPulse, type, particle);
            if (victim != null) {
                onHit.accept(victim);
            }
            if (ticks % 20 == 0) {
                boss.playSound(sound, 1.5F, 1.0F);
            }
        }
        return ticks < windup + duration;
    }
}
