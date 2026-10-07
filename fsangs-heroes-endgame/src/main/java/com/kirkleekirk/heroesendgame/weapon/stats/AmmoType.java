package com.kirkleekirk.heroesendgame.weapon.stats;

/** Ammunition families. Each one is an item ({@code heroes_endgame:<key>_ammo}); one item = one round. */
public enum AmmoType {
    PISTOL, RIFLE, SHOTGUN, SNIPER, ROCKET, GRENADE;

    public String key() {
        return name().toLowerCase(java.util.Locale.ROOT);
    }

    /** Registry path of the ammo item. */
    public String itemName() {
        return key() + "_ammo";
    }
}
