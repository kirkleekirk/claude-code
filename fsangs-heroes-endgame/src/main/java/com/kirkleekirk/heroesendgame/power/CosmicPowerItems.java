package com.kirkleekirk.heroesendgame.power;

import com.kirkleekirk.heroesendgame.HeroesEndgame;
import net.minecraft.world.item.Item;
import net.minecraftforge.registries.DeferredRegister;
import net.minecraftforge.registries.ForgeRegistries;

/** Items for the cosmic power group (skeleton - the cosmic powers pass fills this in). */
public final class CosmicPowerItems {
    public static final DeferredRegister<Item> ITEMS = DeferredRegister.create(ForgeRegistries.ITEMS, HeroesEndgame.MOD_ID);

    private CosmicPowerItems() {
    }
}
