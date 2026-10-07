package com.kirkleekirk.heroesendgame.entity.ability;

import com.kirkleekirk.heroesendgame.compat.FsangCompat;
import com.kirkleekirk.heroesendgame.entity.EndgameBoss;
import net.minecraft.core.particles.ParticleOptions;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.world.entity.LivingEntity;

import java.util.function.Predicate;

/**
 * Switches off nearby heroes' powers using FSang18's Heroes' own power negation effects
 * (EMP, genetic inhibitor, red sun, speed inhibitor, metaphysical suppression).
 */
public class DampenPulseAbility extends BossAbility {
    private final int cooldown;
    private final double radius;
    private final FsangCompat.Dampening dampening;
    private final int duration;
    private final ParticleOptions particle;
    private final SoundEvent sound;
    private final Predicate<ServerPlayer> affects;
    private final String line;

    public DampenPulseAbility(EndgameBoss boss, int cooldown, double radius, FsangCompat.Dampening dampening, int duration,
                              ParticleOptions particle, SoundEvent sound, Predicate<ServerPlayer> affects, String line) {
        super(boss);
        this.cooldown = cooldown;
        this.radius = radius;
        this.dampening = dampening;
        this.duration = duration;
        this.particle = particle;
        this.sound = sound;
        this.affects = affects;
        this.line = line;
    }

    @Override
    public int cooldownTicks() {
        return cooldown;
    }

    @Override
    public int weight() {
        return 7;
    }

    @Override
    public boolean canUse(LivingEntity target) {
        return boss.distanceTo(target) < radius;
    }

    @Override
    public boolean tick(LivingEntity target) {
        if (ticks < 15) {
            boss.burst(particle, 4, 0.6);
            return true;
        }
        if (boss.level() instanceof ServerLevel level) {
            for (int ring = 1; ring <= 4; ring++) {
                double r = radius * ring / 4.0;
                for (int i = 0; i < 24; i++) {
                    double angle = i / 24.0 * Math.PI * 2;
                    level.sendParticles(particle, boss.getX() + Math.cos(angle) * r, boss.getY() + 1, boss.getZ() + Math.sin(angle) * r, 1, 0, 0.2, 0, 0);
                }
            }
        }
        boolean any = false;
        for (ServerPlayer player : boss.playersInRange(radius)) {
            if (affects.test(player)) {
                FsangCompat.dampen(player, dampening, duration);
                any = true;
            }
        }
        if (any && line != null) {
            boss.say(line);
        }
        boss.playSound(sound, 2.0F, 0.8F);
        return false;
    }
}
