package com.kirkleekirk.heroesendgame.entity.ability;

import com.kirkleekirk.heroesendgame.entity.EndgameBoss;
import com.kirkleekirk.heroesendgame.entity.projectile.EnergyBoltEntity;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.world.entity.LivingEntity;

/**
 * Fires a burst of energy bolts.
 */
public class VolleyAbility extends BossAbility {
    private final int cooldown;
    private final int shots;
    private final int interval;
    private final EnergyBoltEntity.Variant variant;
    private final float power;
    private final double speed;
    private final boolean homing;
    private final SoundEvent sound;
    private final double minRange;
    private int fired;

    public VolleyAbility(EndgameBoss boss, int cooldown, int shots, int interval, EnergyBoltEntity.Variant variant, float power,
                         double speed, boolean homing, SoundEvent sound, double minRange) {
        super(boss);
        this.cooldown = cooldown;
        this.shots = shots;
        this.interval = interval;
        this.variant = variant;
        this.power = power;
        this.speed = speed;
        this.homing = homing;
        this.sound = sound;
        this.minRange = minRange;
    }

    @Override
    public int cooldownTicks() {
        return cooldown;
    }

    @Override
    public boolean canUse(LivingEntity target) {
        return boss.distanceTo(target) >= minRange && boss.hasLineOfSight(target);
    }

    @Override
    public boolean locksMovement() {
        return false;
    }

    @Override
    public void start(LivingEntity target) {
        fired = 0;
    }

    @Override
    public boolean tick(LivingEntity target) {
        boss.getLookControl().setLookAt(target, 60, 60);
        if (ticks % interval == 0) {
            boss.shootBolt(target, variant, power, speed, homing);
            boss.playSound(sound, 1.2F, 1.0F + boss.getRandom().nextFloat() * 0.3F);
            fired++;
        }
        return fired < shots;
    }
}
