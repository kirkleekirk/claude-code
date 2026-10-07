package com.kirkleekirk.heroesendgame.weapon.melee;

import com.kirkleekirk.heroesendgame.HeroesEndgame;
import com.kirkleekirk.heroesendgame.weapon.stats.MeleeDefinition;
import com.kirkleekirk.heroesendgame.weapon.stats.WeaponCatalog;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.Rarity;
import net.minecraftforge.registries.DeferredRegister;
import net.minecraftforge.registries.ForgeRegistries;
import net.minecraftforge.registries.RegistryObject;

import java.util.LinkedHashMap;
import java.util.Map;

/** Melee weapons and their thrown-weapon entity. */
public final class MeleeItems {
    public static final DeferredRegister<Item> ITEMS = DeferredRegister.create(ForgeRegistries.ITEMS, HeroesEndgame.MOD_ID);
    public static final DeferredRegister<EntityType<?>> ENTITY_TYPES = DeferredRegister.create(ForgeRegistries.ENTITY_TYPES, HeroesEndgame.MOD_ID);

    public static final Map<String, RegistryObject<MeleeWeaponItem>> MELEE = new LinkedHashMap<>();

    static {
        for (MeleeDefinition melee : WeaponCatalog.melee()) {
            MELEE.put(melee.id(), ITEMS.register(melee.id(), () -> new MeleeWeaponItem(melee, new Item.Properties().stacksTo(1).rarity(Rarity.UNCOMMON))));
        }
    }

    private MeleeItems() {
    }
}
