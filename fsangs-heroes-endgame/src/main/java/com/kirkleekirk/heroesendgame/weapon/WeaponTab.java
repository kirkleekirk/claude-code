package com.kirkleekirk.heroesendgame.weapon;

import com.kirkleekirk.heroesendgame.HeroesEndgame;
import com.kirkleekirk.heroesendgame.power.PowerItems;
import com.kirkleekirk.heroesendgame.weapon.bench.BenchRegistry;
import com.kirkleekirk.heroesendgame.weapon.melee.MeleeItems;
import net.minecraft.core.registries.Registries;
import net.minecraft.network.chat.Component;
import net.minecraft.world.item.CreativeModeTab;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraftforge.registries.DeferredRegister;
import net.minecraftforge.registries.RegistryObject;

import java.util.Collection;

/** "Heroes Endgame: Arsenal" - the bench, every weapon, attachment, ammo type and power item. */
public final class WeaponTab {
    public static final DeferredRegister<CreativeModeTab> TABS = DeferredRegister.create(Registries.CREATIVE_MODE_TAB, HeroesEndgame.MOD_ID);

    public static final RegistryObject<CreativeModeTab> ARSENAL = TABS.register("arsenal", () -> CreativeModeTab.builder()
            .title(Component.translatable("itemGroup.heroes_endgame.arsenal"))
            .icon(() -> WeaponItems.GUNS.isEmpty() ? new ItemStack(Items.IRON_SWORD)
                    : new ItemStack(WeaponItems.GUNS.values().iterator().next().get()))
            .displayItems((params, output) -> {
                accept(output, BenchRegistry.ITEMS.getEntries());
                for (RegistryObject<GunItem> gun : WeaponItems.GUNS.values()) {
                    output.accept(gun.get().creativeStack());
                }
                accept(output, MeleeItems.ITEMS.getEntries());
                for (RegistryObject<AmmoItem> ammo : WeaponItems.AMMO.values()) {
                    output.accept(ammo.get());
                }
                for (RegistryObject<AttachmentItem> attachment : WeaponItems.ATTACHMENTS.values()) {
                    output.accept(attachment.get());
                }
                accept(output, PowerItems.ITEMS.getEntries());
            })
            .build());

    private static void accept(CreativeModeTab.Output output, Collection<RegistryObject<Item>> entries) {
        for (RegistryObject<Item> entry : entries) {
            output.accept(entry.get());
        }
    }

    private WeaponTab() {
    }
}
