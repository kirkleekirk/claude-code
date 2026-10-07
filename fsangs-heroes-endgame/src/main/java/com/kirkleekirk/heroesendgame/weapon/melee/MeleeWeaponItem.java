package com.kirkleekirk.heroesendgame.weapon.melee;

import com.kirkleekirk.heroesendgame.weapon.WeaponItem;
import com.kirkleekirk.heroesendgame.weapon.stats.MeleeDefinition;
import com.kirkleekirk.heroesendgame.weapon.stats.WeaponDefinition;
import net.minecraft.world.item.Item;

/** A melee weapon the gunsmith can modify (skeleton - the melee pass fills this in). */
public class MeleeWeaponItem extends Item implements WeaponItem {
    private final MeleeDefinition definition;

    public MeleeWeaponItem(MeleeDefinition definition, Properties properties) {
        super(properties);
        this.definition = definition;
    }

    public MeleeDefinition definition() {
        return definition;
    }

    @Override
    public WeaponDefinition weaponDefinition() {
        return definition;
    }
}
