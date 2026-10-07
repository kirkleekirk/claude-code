package com.kirkleekirk.heroesendgame.weapon;

import com.kirkleekirk.heroesendgame.weapon.stats.AmmoType;
import net.minecraft.world.item.Item;

/** Loose rounds of one ammo family (one item = one round). */
public class AmmoItem extends Item {
    private final AmmoType type;

    public AmmoItem(AmmoType type, Properties properties) {
        super(properties);
        this.type = type;
    }

    public AmmoType type() {
        return type;
    }
}
