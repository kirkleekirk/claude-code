package com.kirkleekirk.heroesendgame.weapon;

import com.kirkleekirk.heroesendgame.power.PowerItems;
import com.kirkleekirk.heroesendgame.weapon.bench.BenchRegistry;
import com.kirkleekirk.heroesendgame.weapon.melee.MeleeItems;
import com.kirkleekirk.heroesendgame.weapon.net.WeaponNetwork;
import com.kirkleekirk.heroesendgame.weapon.stats.WeaponCatalog;
import net.minecraftforge.eventbus.api.IEventBus;
import net.minecraftforge.fml.event.lifecycle.FMLCommonSetupEvent;

/** Wires every weapon/bench/power registry onto the mod bus. Called from the mod constructor. */
public final class WeaponRegistry {
    private WeaponRegistry() {
    }

    public static void init(IEventBus modBus) {
        WeaponCatalog.bootstrap();
        WeaponItems.ITEMS.register(modBus);
        WeaponSounds.SOUNDS.register(modBus);
        WeaponEntities.ENTITY_TYPES.register(modBus);
        MeleeItems.ITEMS.register(modBus);
        MeleeItems.ENTITY_TYPES.register(modBus);
        BenchRegistry.BLOCKS.register(modBus);
        BenchRegistry.ITEMS.register(modBus);
        BenchRegistry.MENUS.register(modBus);
        BenchRegistry.RECIPE_TYPES.register(modBus);
        BenchRegistry.RECIPE_SERIALIZERS.register(modBus);
        PowerItems.ITEMS.register(modBus);
        WeaponTab.TABS.register(modBus);
        modBus.addListener((FMLCommonSetupEvent event) -> event.enqueueWork(WeaponNetwork::register));
    }
}
