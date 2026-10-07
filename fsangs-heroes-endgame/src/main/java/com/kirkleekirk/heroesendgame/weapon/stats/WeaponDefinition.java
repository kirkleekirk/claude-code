package com.kirkleekirk.heroesendgame.weapon.stats;

import java.util.Set;

/** What guns and melee weapons have in common for the gunsmith. */
public interface WeaponDefinition {
    /** Registry path of the item, e.g. "stg44". */
    String id();

    WeaponClass weaponClass();

    WeaponStats base();

    /** Gunsmith slots this weapon accepts. */
    Set<AttachmentSlot> slots();

    /** Attachment ids this weapon refuses even though slot and class match. */
    Set<String> excluded();

    /** Lang key suffix of the character it belongs to (item.heroes_endgame.&lt;id&gt;.character), or "" */
    String character();
}
