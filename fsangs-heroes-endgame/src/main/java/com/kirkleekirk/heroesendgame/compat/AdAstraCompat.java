package com.kirkleekirk.heroesendgame.compat;

import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.level.Level;
import net.minecraftforge.fml.ModList;

/**
 * Ad Astra (mod id {@code ad_astra}) integration. Everything is id based:
 * <ul>
 *     <li>Glacio (Proxima Centauri) plays Vormir, where the Soul Stone waits.</li>
 *     <li>The Mars Temple chest plays the temple on Morag that hides the Power Stone.</li>
 *     <li>Space-faring nemeses are added to Ad Astra's survival tags (data/ad_astra/tags/entity_types) so they can
 *     follow you onto other planets and into orbit.</li>
 * </ul>
 */
public final class AdAstraCompat {
    public static final String MOD_ID = "ad_astra";

    public static final ResourceKey<Level> MOON = dim("moon");
    public static final ResourceKey<Level> MARS = dim("mars");
    public static final ResourceKey<Level> VENUS = dim("venus");
    public static final ResourceKey<Level> MERCURY = dim("mercury");
    public static final ResourceKey<Level> GLACIO = dim("glacio");

    private static Boolean loaded;

    public static boolean isLoaded() {
        if (loaded == null) {
            loaded = ModList.get().isLoaded(MOD_ID);
        }
        return loaded;
    }

    /** True for any Ad Astra planet or orbit dimension. */
    public static boolean isSpaceDimension(ResourceKey<Level> dimension) {
        return dimension.location().getNamespace().equals(MOD_ID);
    }

    private static ResourceKey<Level> dim(String name) {
        return ResourceKey.create(Registries.DIMENSION, new ResourceLocation(MOD_ID, name));
    }

    private AdAstraCompat() {
    }
}
