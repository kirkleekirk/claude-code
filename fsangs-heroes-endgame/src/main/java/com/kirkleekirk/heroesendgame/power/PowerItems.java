package com.kirkleekirk.heroesendgame.power;

import com.kirkleekirk.heroesendgame.HeroesEndgame;
import net.minecraft.world.item.Item;
import net.minecraftforge.registries.DeferredRegister;
import net.minecraftforge.registries.ForgeRegistries;

/** Items that grant the new Palladium powers (power rings, lanterns...) - skeleton, the powers pass fills this in. */
public final class PowerItems {
    public static final DeferredRegister<Item> ITEMS = DeferredRegister.create(ForgeRegistries.ITEMS, HeroesEndgame.MOD_ID);

    private PowerItems() {
    }
}
