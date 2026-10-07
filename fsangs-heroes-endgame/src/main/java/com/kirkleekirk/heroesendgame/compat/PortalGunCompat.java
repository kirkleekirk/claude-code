package com.kirkleekirk.heroesendgame.compat;

import com.kirkleekirk.heroesendgame.HeroesEndgame;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.tags.ItemTags;
import net.minecraft.tags.TagKey;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraftforge.fml.ModList;

import java.lang.reflect.Method;

/**
 * Integration with "Rick's Portal Gun [Forge/NeoForge]" by JamesLeDolphin
 * (mod id {@code ricksportalgun}, https://modrinth.com/mod/ricks-portal-gun,
 * source: https://github.com/JamesLeDolphin/ricks-portal-gun-multiloader), written against 1.4.10 for 1.20.1.
 * <ul>
 *     <li>Nemeses jam portal guns while they hunt you (no portal-hopping out of a boss fight).</li>
 *     <li>The Tesseract (Space Stone) refuels a portal gun held in the main hand while the stone is in the off hand.</li>
 * </ul>
 * Uses the mod's item tag, its {@code Fuel} NBT key and (reflectively) PortalGunItem#getMaxFuel, so there is no
 * compile-time dependency and nothing breaks if the mod changes.
 */
public final class PortalGunCompat {
    public static final String MOD_ID = "ricksportalgun";
    public static final TagKey<Item> PORTAL_GUNS = ItemTags.create(new ResourceLocation(MOD_ID, "portal_guns"));
    private static final String TAG_FUEL = "Fuel";
    private static final int DEFAULT_MAX_FUEL = 64;

    private static Boolean loaded;
    private static Method getMaxFuel;
    private static boolean reflectionFailed;

    public static boolean isLoaded() {
        if (loaded == null) {
            loaded = ModList.get().isLoaded(MOD_ID);
        }
        return loaded;
    }

    public static boolean isPortalGun(ItemStack stack) {
        return isLoaded() && !stack.isEmpty() && stack.is(PORTAL_GUNS);
    }

    /** Adds fuel to a portal gun, never above its max. Returns true if anything changed. */
    public static boolean refuel(ItemStack gun, int amount) {
        if (!isPortalGun(gun)) {
            return false;
        }
        int max = maxFuel(gun);
        // A gun without a Fuel tag is treated as full by the portal gun mod.
        if (!gun.hasTag() || !gun.getTag().contains(TAG_FUEL)) {
            return false;
        }
        int fuel = gun.getTag().getInt(TAG_FUEL);
        if (fuel >= max) {
            return false;
        }
        gun.getTag().putInt(TAG_FUEL, Math.min(max, fuel + amount));
        return true;
    }

    private static int maxFuel(ItemStack gun) {
        if (!reflectionFailed) {
            try {
                if (getMaxFuel == null) {
                    Class<?> itemClass = Class.forName("com.jdolphin.ricksportalgun.common.item.PortalGunItem");
                    getMaxFuel = itemClass.getMethod("getMaxFuel", ItemStack.class);
                }
                return (int) getMaxFuel.invoke(null, gun);
            } catch (Throwable t) {
                reflectionFailed = true;
                HeroesEndgame.LOGGER.debug("Couldn't read Rick's Portal Gun max fuel, assuming {}", DEFAULT_MAX_FUEL, t);
            }
        }
        return DEFAULT_MAX_FUEL;
    }

    private PortalGunCompat() {
    }
}
