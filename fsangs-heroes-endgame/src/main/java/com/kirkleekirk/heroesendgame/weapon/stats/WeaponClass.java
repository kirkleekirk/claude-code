package com.kirkleekirk.heroesendgame.weapon.stats;

/**
 * Weapon classes, Call of Duty style. Attachments declare which classes they fit.
 * <p>
 * Everything in this package is plain Java (no Minecraft classes) so it can be unit tested.
 */
public enum WeaponClass {
    PISTOL, SMG, ASSAULT_RIFLE, LMG, SHOTGUN, MARKSMAN, SNIPER, LAUNCHER, MELEE;

    public boolean isGun() {
        return this != MELEE;
    }

    public String key() {
        return name().toLowerCase(java.util.Locale.ROOT);
    }
}
