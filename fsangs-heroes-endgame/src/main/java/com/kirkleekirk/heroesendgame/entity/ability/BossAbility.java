package com.kirkleekirk.heroesendgame.entity.ability;

import com.kirkleekirk.heroesendgame.entity.EndgameBoss;
import net.minecraft.world.entity.LivingEntity;

/**
 * A special attack. The boss picks a ready ability (weighted random) whenever it isn't already using one.
 */
public abstract class BossAbility {
    protected final EndgameBoss boss;
    private int cooldown;
    /** Ticks since {@link #start} was called. */
    protected int ticks;

    protected BossAbility(EndgameBoss boss) {
        this.boss = boss;
    }

    /** Cooldown after the ability finishes. */
    public abstract int cooldownTicks();

    /** Return false when the ability is done. */
    public abstract boolean tick(LivingEntity target);

    public int weight() {
        return 10;
    }

    /** Extra conditions on top of the cooldown (range, phase, line of sight...). */
    public boolean canUse(LivingEntity target) {
        return true;
    }

    public void start(LivingEntity target) {
    }

    public void stop() {
    }

    /** While true the boss doesn't walk/fly or melee on its own. */
    public boolean locksMovement() {
        return true;
    }

    /** Pose id sent to the client while the ability runs (see EndgameBoss#getCastPose). */
    public int castPose() {
        return EndgameBoss.POSE_CAST;
    }

    // --- framework -------------------------------------------------------------------------------------------------

    public final boolean isReady() {
        return cooldown <= 0;
    }

    public final void tickCooldown() {
        if (cooldown > 0) {
            cooldown--;
        }
    }

    public final void setCooldown(int ticks) {
        this.cooldown = ticks;
    }

    public final void begin(LivingEntity target) {
        this.ticks = 0;
        start(target);
    }

    public final boolean update(LivingEntity target) {
        boolean running = tick(target);
        ticks++;
        return running;
    }

    public final void finish() {
        stop();
        cooldown = cooldownTicks();
    }
}
