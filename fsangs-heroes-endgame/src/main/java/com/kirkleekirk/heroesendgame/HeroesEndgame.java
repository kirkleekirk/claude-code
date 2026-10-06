package com.kirkleekirk.heroesendgame;

import com.kirkleekirk.heroesendgame.config.EndgameConfig;
import com.kirkleekirk.heroesendgame.registry.ModCreativeTab;
import com.kirkleekirk.heroesendgame.registry.ModEffects;
import com.kirkleekirk.heroesendgame.registry.ModEntities;
import com.kirkleekirk.heroesendgame.registry.ModItems;
import com.kirkleekirk.heroesendgame.registry.ModLootModifiers;
import com.mojang.logging.LogUtils;
import net.minecraft.resources.ResourceLocation;
import net.minecraftforge.eventbus.api.IEventBus;
import net.minecraftforge.fml.ModLoadingContext;
import net.minecraftforge.fml.common.Mod;
import net.minecraftforge.fml.config.ModConfig;
import net.minecraftforge.fml.javafmlmod.FMLJavaModLoadingContext;
import org.slf4j.Logger;

/**
 * Heroes Endgame - an addon for FSang18's Heroes (a Palladium addon pack).
 * <p>
 * Every power family in FSang18's Heroes gets a canon nemesis that only shows up once the player has grown strong
 * enough to deserve it, and every nemesis scales to the player that it is hunting.
 */
@Mod(HeroesEndgame.MOD_ID)
public class HeroesEndgame {
    public static final String MOD_ID = "heroes_endgame";
    public static final Logger LOGGER = LogUtils.getLogger();

    public HeroesEndgame() {
        IEventBus modBus = FMLJavaModLoadingContext.get().getModEventBus();

        ModEntities.ENTITY_TYPES.register(modBus);
        ModItems.ITEMS.register(modBus);
        ModEffects.EFFECTS.register(modBus);
        ModLootModifiers.SERIALIZERS.register(modBus);
        ModCreativeTab.TABS.register(modBus);

        ModLoadingContext.get().registerConfig(ModConfig.Type.SERVER, EndgameConfig.SPEC, MOD_ID + "-server.toml");
    }

    public static ResourceLocation id(String path) {
        return new ResourceLocation(MOD_ID, path);
    }
}
