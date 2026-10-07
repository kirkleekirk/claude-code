package com.kirkleekirk.heroesendgame.weapon;

import com.kirkleekirk.heroesendgame.weapon.stats.GunDefinition;
import com.kirkleekirk.heroesendgame.weapon.stats.WeaponDefinition;
import net.minecraft.world.item.Item;
import net.minecraftforge.client.extensions.common.IClientItemExtensions;

import java.util.function.Consumer;

/** A gun. Behaviour lives in the weapon server/client packages (skeleton - the gun engine fills this in). */
public class GunItem extends Item implements WeaponItem {
    private final GunDefinition definition;

    public GunItem(GunDefinition definition, Properties properties) {
        super(properties);
        this.definition = definition;
    }

    public GunDefinition definition() {
        return definition;
    }

    @Override
    public WeaponDefinition weaponDefinition() {
        return definition;
    }

    /** Client rendering (BEWLR, arm poses) - only ever called on the client. */
    @Override
    public void initializeClient(Consumer<IClientItemExtensions> consumer) {
        consumer.accept(com.kirkleekirk.heroesendgame.weapon.client.GunClientExtensions.INSTANCE);
    }

    /** The stack shown in the creative tab / given by the bench (the gun engine fills the magazine). */
    public net.minecraft.world.item.ItemStack creativeStack() {
        return new net.minecraft.world.item.ItemStack(this);
    }
}
