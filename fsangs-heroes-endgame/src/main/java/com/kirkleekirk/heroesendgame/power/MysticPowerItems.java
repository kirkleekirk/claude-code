package com.kirkleekirk.heroesendgame.power;

import com.kirkleekirk.heroesendgame.HeroesEndgame;
import net.minecraft.world.item.Item;
import net.minecraftforge.registries.DeferredRegister;
import net.minecraftforge.registries.ForgeRegistries;

/** Items for the mystic power group (skeleton - the mystic powers pass fills this in). */
public final class MysticPowerItems {
    public static final DeferredRegister<Item> ITEMS = DeferredRegister.create(ForgeRegistries.ITEMS, HeroesEndgame.MOD_ID);

    private MysticPowerItems() {
    }
}
