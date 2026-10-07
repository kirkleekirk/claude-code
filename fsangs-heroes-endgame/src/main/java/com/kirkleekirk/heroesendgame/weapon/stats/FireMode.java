package com.kirkleekirk.heroesendgame.weapon.stats;

/**
 * How the trigger behaves. BOLT and PUMP fire one round per click and then cycle (the fire rate is the cycle time);
 * BREAK is a break-action (double barrel) that fires each barrel per click.
 */
public enum FireMode {
    SEMI, AUTO, BURST, BOLT, PUMP, BREAK, SINGLE;

    /** Holding the trigger keeps firing. */
    public boolean isAutomatic() {
        return this == AUTO;
    }

    public String key() {
        return name().toLowerCase(java.util.Locale.ROOT);
    }
}
