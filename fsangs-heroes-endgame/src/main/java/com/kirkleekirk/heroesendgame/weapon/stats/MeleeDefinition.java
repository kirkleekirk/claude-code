package com.kirkleekirk.heroesendgame.weapon.stats;

import java.util.EnumSet;
import java.util.List;
import java.util.Set;

/**
 * A melee weapon. Stats used: MELEE_DAMAGE (added to the hand's 1), ATTACK_SPEED, REACH, MOBILITY, plus DAMAGE as the
 * thrown damage for THROWABLE weapons.
 */
public record MeleeDefinition(String id, WeaponStats base, Set<MeleeTrait> meleeTraits, Set<String> excluded,
                              String character) implements WeaponDefinition {
    public static final Set<AttachmentSlot> MELEE_SLOTS = EnumSet.of(AttachmentSlot.EDGE, AttachmentSlot.COATING,
            AttachmentSlot.GRIP, AttachmentSlot.CHARM);

    public static MeleeDefinition of(String id, String character, WeaponStats base, MeleeTrait... traits) {
        return new MeleeDefinition(id, base, traits.length == 0 ? Set.of() : EnumSet.copyOf(List.of(traits)), Set.of(), character);
    }

    @Override
    public WeaponClass weaponClass() {
        return WeaponClass.MELEE;
    }

    @Override
    public Set<AttachmentSlot> slots() {
        return MELEE_SLOTS;
    }
}
