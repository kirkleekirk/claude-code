package com.kirkleekirk.heroesendgame.util;

import net.minecraft.network.chat.Component;
import net.minecraft.tags.DamageTypeTags;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.damagesource.DamageTypes;

/**
 * Coarse kinds of damage that adaptive nemeses (Doomsday, Doctor Doom, Sentinels) learn to resist.
 * Anything not covered by a vanilla tag - which includes most FSang ability damage - counts as "superpowers".
 */
public enum DamageCategory {
    MELEE, PROJECTILE, FIRE, EXPLOSION, LIGHTNING, MAGIC, COLD, POWERS;

    public static DamageCategory of(DamageSource source) {
        if (source.is(DamageTypeTags.IS_LIGHTNING)) {
            return LIGHTNING;
        }
        if (source.is(DamageTypeTags.IS_EXPLOSION)) {
            return EXPLOSION;
        }
        if (source.is(DamageTypeTags.IS_FIRE)) {
            return FIRE;
        }
        if (source.is(DamageTypeTags.IS_FREEZING)) {
            return COLD;
        }
        if (source.is(DamageTypeTags.IS_PROJECTILE)) {
            return PROJECTILE;
        }
        if (source.is(DamageTypes.MAGIC) || source.is(DamageTypes.INDIRECT_MAGIC) || source.is(DamageTypeTags.WITCH_RESISTANT_TO)) {
            return MAGIC;
        }
        if (source.is(DamageTypes.PLAYER_ATTACK) || source.is(DamageTypes.MOB_ATTACK) || source.is(DamageTypes.MOB_ATTACK_NO_AGGRO)) {
            return MELEE;
        }
        return POWERS;
    }

    public String key() {
        return name().toLowerCase(java.util.Locale.ROOT);
    }

    public Component displayName() {
        return Component.translatable("damage_category.heroes_endgame." + key());
    }

    public static DamageCategory byKey(String key) {
        for (DamageCategory category : values()) {
            if (category.key().equals(key)) {
                return category;
            }
        }
        return null;
    }
}
