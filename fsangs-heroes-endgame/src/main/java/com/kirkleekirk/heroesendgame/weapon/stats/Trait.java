package com.kirkleekirk.heroesendgame.weapon.stats;

/**
 * Behaviours that need code, not just numbers. Attachments grant traits; weapon definitions can have built-in ones.
 */
public enum Trait {
    /** A second copy of the gun in the off hand: double fire rate (alternating), hip fire only. */
    AKIMBO,
    /** Crouching = mounted: much less recoil. */
    BIPOD,
    /** Alternate fire (G) launches 40mm grenades from the underbarrel. */
    UNDERBARREL_LAUNCHER,
    /** Alternate fire (G) fires an underbarrel shotgun. */
    UNDERBARREL_SHOTGUN,
    /** Melee bash (V) stabs with a bayonet: big damage, longer reach. */
    BAYONET,
    /** Melee bash (V) is quicker. */
    FAST_MELEE,
    /** Visible laser; tighter hip fire. */
    LASER,
    /** Thermal optic: living things glow while aiming. */
    THERMAL,
    /** High-power scope: full-screen scope overlay while aiming, glint. */
    SCOPE,
    /** No muzzle flash, quiet shots, no tracer. */
    SUPPRESSED,
    /** Visible bullet tracers. */
    TRACERS,
    /** Belt-fed: the magazine is a belt - huge capacity, long reload. */
    BELT_FED,
    /** Spawn with an extra magazine's worth when crafted / reloads are free for the first magazine. */
    FULLY_LOADED,
    /** Reload continues while sprinting. */
    SLEIGHT_OF_HAND,
    /** Bolt/pump actions cycle faster when aiming (Vanguard "Quick"). */
    QUICK,
    /** Shotgun loads shell by shell (reload can be interrupted to fire). */
    SHELL_RELOAD,
    /** Minigun-style spin-up before firing. */
    SPIN_UP,
    /** Launcher projectile instead of a hitscan bullet. */
    PROJECTILE;

    public String key() {
        return name().toLowerCase(java.util.Locale.ROOT);
    }
}
