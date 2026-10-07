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
