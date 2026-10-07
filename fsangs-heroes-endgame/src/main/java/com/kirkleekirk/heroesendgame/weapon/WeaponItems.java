package com.kirkleekirk.heroesendgame.weapon;

import com.kirkleekirk.heroesendgame.HeroesEndgame;
import com.kirkleekirk.heroesendgame.weapon.stats.AmmoType;
import com.kirkleekirk.heroesendgame.weapon.stats.AttachmentDefinition;
import com.kirkleekirk.heroesendgame.weapon.stats.GunDefinition;
import com.kirkleekirk.heroesendgame.weapon.stats.WeaponCatalog;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.Rarity;
import net.minecraftforge.registries.DeferredRegister;
import net.minecraftforge.registries.ForgeRegistries;
import net.minecraftforge.registries.RegistryObject;

import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.Map;

/** Guns, attachments and ammo - one item per catalog entry, registered in catalog order. */
public final class WeaponItems {
    public static final DeferredRegister<Item> ITEMS = DeferredRegister.create(ForgeRegistries.ITEMS, HeroesEndgame.MOD_ID);

    public static final Map<String, RegistryObject<GunItem>> GUNS = new LinkedHashMap<>();
    public static final Map<String, RegistryObject<AttachmentItem>> ATTACHMENTS = new LinkedHashMap<>();
    public static final Map<AmmoType, RegistryObject<AmmoItem>> AMMO = new EnumMap<>(AmmoType.class);

    static {
        for (GunDefinition gun : WeaponCatalog.guns()) {
            GUNS.put(gun.id(), ITEMS.register(gun.id(), () -> new GunItem(gun, new Item.Properties().stacksTo(1).rarity(Rarity.UNCOMMON))));
        }
        for (AttachmentDefinition attachment : WeaponCatalog.attachments()) {
            Rarity rarity = switch (attachment.rarity()) {
                case 0 -> Rarity.COMMON;
                case 1 -> Rarity.UNCOMMON;
                case 2 -> Rarity.RARE;
                default -> Rarity.EPIC;
            };
            ATTACHMENTS.put(attachment.id(), ITEMS.register(attachment.id(),
                    () -> new AttachmentItem(attachment, new Item.Properties().stacksTo(16).rarity(rarity))));
        }
        for (AmmoType type : AmmoType.values()) {
            AMMO.put(type, ITEMS.register(type.itemName(), () -> new AmmoItem(type, new Item.Properties().stacksTo(64))));
        }
    }

    private WeaponItems() {
    }
}
