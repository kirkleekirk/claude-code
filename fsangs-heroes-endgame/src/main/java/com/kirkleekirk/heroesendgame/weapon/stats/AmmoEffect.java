package com.kirkleekirk.heroesendgame.weapon.stats;

/**
 * What a round does on hit, chosen with an Ammo Type attachment (one per gun). The superhero rounds hook into
 * FSang18's Heroes' power-dampening effects.
 */
public enum AmmoEffect {
    NONE,
    /** Sets targets on fire. */
    INCENDIARY,
    /** Small blast on impact (no block damage). */
    EXPLOSIVE,
    /** More damage to lightly armoured targets, less penetration. */
    HOLLOW_POINT,
    /** Ignores most armour, pierces an extra target. */
    ARMOR_PIERCING,
    /** No tracer, quiet. */
    SUBSONIC,
    /** Hits slow the target briefly. */
    FRANGIBLE,
    /** Shotgun: incendiary pellets, short range. */
    DRAGONS_BREATH,
    /** Shotgun: one heavy slug instead of pellets. */
    SLUG,
    /** Huge damage to Kryptonians (FSang red-sun dampening on hit). */
    KRYPTONITE,
    /** Infects Viltrumites with the Scourge Virus. */
    SCOURGE,
    /** Mutant inhibitor: FSang genetic dampening. */
    INHIBITOR,
    /** EMP: FSang tech dampening; bonus damage to robots and armour suits. */
    EMP,
    /** Tachyon rounds: FSang speed dampening. */
    TACHYON,
    /** Vibranium-tipped: passes through targets. */
    VIBRANIUM,
    /** Adamantium-core: pierces armour and shields. */
    ADAMANTIUM,
    /** Cryo: slows and freezes. */
    CRYO,
    /** Non-lethal stun (S.H.I.E.L.D. I.C.E.R.). */
    STUN,
    /** Hellfire: burns the guilty. */
    HELLFIRE;

    public String key() {
        return name().toLowerCase(java.util.Locale.ROOT);
    }
}
