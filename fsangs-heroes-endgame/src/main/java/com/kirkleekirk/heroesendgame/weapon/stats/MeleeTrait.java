package com.kirkleekirk.heroesendgame.weapon.stats;

/** Special behaviour of melee weapons. */
public enum MeleeTrait {
    /** Wielded in pairs: the off hand strikes too (Deadpool's katanas, Elektra's sai, escrima sticks). */
    DUAL_WIELD,
    /** Can be thrown (use): becomes a projectile. */
    THROWABLE,
    /** Comes back after being thrown. */
    RETURNS,
    /** Hold use to block / parry. */
    BLOCKING,
    /** Sweeping attacks hit everything in front. */
    SWEEPING,
    /** Long two-handed weapon (staff): extra knockback. */
    STAFF;

    public String key() {
        return name().toLowerCase(java.util.Locale.ROOT);
    }
}
