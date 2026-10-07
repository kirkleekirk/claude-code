package com.kirkleekirk.heroesendgame.weapon;

import com.kirkleekirk.heroesendgame.weapon.stats.AttachmentDefinition;
import net.minecraft.world.item.Item;

/** An attachment you can fit at the weapon bench's gunsmith. */
public class AttachmentItem extends Item {
    private final AttachmentDefinition definition;

    public AttachmentItem(AttachmentDefinition definition, Properties properties) {
        super(properties);
        this.definition = definition;
    }

    public AttachmentDefinition definition() {
        return definition;
    }
}
