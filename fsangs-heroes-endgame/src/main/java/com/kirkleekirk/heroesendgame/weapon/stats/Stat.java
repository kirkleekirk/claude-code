package com.kirkleekirk.heroesendgame.weapon.stats;

/**
 * Every tunable number of a weapon. Units are noted per stat. {@code higherIsBetter} drives the green/red colouring in
 * the gunsmith; {@code min}/{@code max} clamp the final value after attachments.
 */
public enum Stat {
    /** Damage per bullet (per pellet for shotguns), in half-hearts. */
    DAMAGE(true, 0.0, 1000.0),
    /** Projectiles per shot (shotguns > 1). */
    PELLETS(true, 1.0, 32.0),
    /** Damage multiplier for headshots. */
    HEADSHOT_MULTIPLIER(true, 1.0, 5.0),
    /** Rounds per minute (for BOLT/PUMP: cycles per minute). */
    FIRE_RATE(true, 10.0, 2400.0),
    /** Rounds per burst for BURST mode. */
    BURST_COUNT(true, 1.0, 10.0),
    /** Magazine capacity in rounds. */
    MAG_SIZE(true, 1.0, 500.0),
    /** Reload duration in ticks. */
    RELOAD_TIME(false, 4.0, 400.0),
    /** Full-damage range in blocks. */
    RANGE(true, 1.0, 512.0),
    /** Bullets stop after this many blocks. */
    MAX_RANGE(true, 4.0, 1024.0),
    /** Fraction of damage left at and beyond MAX_RANGE (damage falls off linearly from RANGE). */
    MIN_DAMAGE_RATIO(true, 0.0, 1.0),
    /** How many entities a bullet passes through (0 = stops at the first). */
    PENETRATION(true, 0.0, 10.0),
    /** Hip-fire cone, degrees. */
    HIP_SPREAD(false, 0.0, 45.0),
    /** Aimed-down-sights cone, degrees. */
    ADS_SPREAD(false, 0.0, 45.0),
    /** Extra cone while moving, degrees. */
    MOVE_SPREAD(false, 0.0, 45.0),
    /** Camera kick per shot, degrees (up). */
    RECOIL_VERTICAL(false, 0.0, 30.0),
    /** Max random camera kick per shot, degrees (sideways). */
    RECOIL_HORIZONTAL(false, 0.0, 30.0),
    /** Time to aim down sights, ticks. */
    ADS_TIME(false, 1.0, 60.0),
    /** Delay after sprinting before you can fire, ticks. */
    SPRINT_TO_FIRE(false, 0.0, 40.0),
    /** Movement speed multiplier while holding the weapon (1 = normal). */
    MOBILITY(true, 0.3, 1.5),
    /** Extra movement multiplier while aiming. */
    ADS_MOBILITY(true, 0.1, 1.5),
    /** Field-of-view zoom while aiming (1 = none, 4 = 4x). */
    ZOOM(true, 1.0, 16.0),
    /** Fraction of aim punch (flinch) ignored when hit. */
    FLINCH_RESIST(true, 0.0, 1.0),
    /** Damage of a melee bash with this weapon (guns) or of a swing (melee weapons). */
    MELEE_DAMAGE(true, 0.0, 1000.0),
    /** Swing speed for melee weapons (attacks per second, vanilla sword = 1.6). */
    ATTACK_SPEED(true, 0.2, 8.0),
    /** Extra reach for melee weapons, blocks. */
    REACH(true, -2.0, 4.0),
    /** Time to switch to this weapon, ticks. */
    EQUIP_TIME(false, 1.0, 60.0);

    private final boolean higherIsBetter;
    private final double min;
    private final double max;

    Stat(boolean higherIsBetter, double min, double max) {
        this.higherIsBetter = higherIsBetter;
        this.min = min;
        this.max = max;
    }

    public boolean higherIsBetter() {
        return higherIsBetter;
    }

    public double clamp(double value) {
        return Math.max(min, Math.min(max, value));
    }

    public String key() {
        return name().toLowerCase(java.util.Locale.ROOT);
    }
}
