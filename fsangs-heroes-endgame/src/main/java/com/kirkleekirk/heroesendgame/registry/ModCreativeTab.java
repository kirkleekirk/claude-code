package com.kirkleekirk.heroesendgame.registry;

import com.kirkleekirk.heroesendgame.HeroesEndgame;
import com.kirkleekirk.heroesendgame.infinity.InfinityStone;
import com.kirkleekirk.heroesendgame.item.InfinityGauntletItem;
import net.minecraft.core.registries.Registries;
import net.minecraft.network.chat.Component;
import net.minecraft.world.item.CreativeModeTab;
import net.minecraft.world.item.ItemStack;
import net.minecraftforge.registries.DeferredRegister;
import net.minecraftforge.registries.RegistryObject;

public final class ModCreativeTab {
    public static final DeferredRegister<CreativeModeTab> TABS = DeferredRegister.create(Registries.CREATIVE_MODE_TAB, HeroesEndgame.MOD_ID);

    public static final RegistryObject<CreativeModeTab> MAIN = TABS.register("main", () -> CreativeModeTab.builder()
            .title(Component.translatable("itemGroup.heroes_endgame"))
            .icon(() -> new ItemStack(ModItems.INFINITY_GAUNTLET.get()))
            .displayItems((params, output) -> {
                ModItems.TAB_ORDER.forEach(item -> output.accept(item.get()));
                // A complete gauntlet for creative players.
                ItemStack full = new ItemStack(ModItems.INFINITY_GAUNTLET.get());
                for (InfinityStone stone : InfinityStone.values()) {
                    InfinityGauntletItem.insertStone(full, stone);
                }
                output.accept(full);
            })
            .build());

    private ModCreativeTab() {
    }
}
