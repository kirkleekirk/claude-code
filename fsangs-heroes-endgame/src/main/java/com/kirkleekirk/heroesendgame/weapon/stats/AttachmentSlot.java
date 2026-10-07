package com.kirkleekirk.heroesendgame.weapon.stats;

/**
 * Gunsmith slots. The first ten are the Call of Duty: Vanguard categories (guns); the last four are for melee weapons.
 */
public enum AttachmentSlot {
    MUZZLE(false), BARREL(false), OPTIC(false), STOCK(false), UNDERBARREL(false), MAGAZINE(false), AMMO_TYPE(false),
    REAR_GRIP(false), PROFICIENCY(false), KIT(false),
    EDGE(true), COATING(true), GRIP(true), CHARM(true);

    private final boolean melee;

    AttachmentSlot(boolean melee) {
        this.melee = melee;
    }

    public boolean isMelee() {
        return melee;
    }

    public String key() {
        return name().toLowerCase(java.util.Locale.ROOT);
    }

    public static AttachmentSlot byKey(String key) {
        for (AttachmentSlot slot : values()) {
            if (slot.key().equals(key)) {
                return slot;
            }
        }
        return null;
    }
}
