package com.kirkleekirk.heroesendgame.weapon.stats;

import java.util.List;
import java.util.Set;

/** A weapon after its attachments: what the game actually uses. */
public record ComputedWeapon(WeaponStats stats, List<FireMode> fireModes, Set<Trait> traits, AmmoEffect ammoEffect) {
    public boolean has(Trait trait) {
        return traits.contains(trait);
    }

    public double get(Stat stat) {
        return stats.get(stat);
    }

    /** Ticks between shots (at least 1). */
    public int ticksPerShot() {
        double rpm = stats.get(Stat.FIRE_RATE);
        return Math.max(1, (int) Math.round(1200.0 / Math.max(1.0, rpm)));
    }

    /**
     * Ticks between trigger pulls/rounds as the server enforces them: {@link #ticksPerShot()}, halved for AKIMBO
     * (the two guns alternate). Within a BURST, rounds are {@link #BURST_GAP} ticks apart and a new burst may start
     * {@code ticksPerShot() * BURST_COUNT} ticks after the previous burst started.
     */
    public int effectiveTicksPerShot() {
        int ticks = ticksPerShot();
        return has(Trait.AKIMBO) ? Math.max(1, ticks / 2) : ticks;
    }

    /** Ticks between rounds inside a burst. */
    public static final int BURST_GAP = 2;

    /** Damage of one bullet/pellet after falloff at the given distance. */
    public double damageAt(double distance) {
        double damage = stats.get(Stat.DAMAGE);
        double range = stats.get(Stat.RANGE);
        double maxRange = Math.max(range + 0.001, stats.get(Stat.MAX_RANGE));
        if (distance <= range) {
            return damage;
        }
        double t = Math.min(1.0, (distance - range) / (maxRange - range));
        double floor = stats.get(Stat.MIN_DAMAGE_RATIO);
        return damage * (1.0 - t * (1.0 - floor));
    }
}
