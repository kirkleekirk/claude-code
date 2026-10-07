package com.kirkleekirk.heroesendgame.gametest;

import com.kirkleekirk.heroesendgame.HeroesEndgame;
import com.kirkleekirk.heroesendgame.weapon.GunData;
import com.kirkleekirk.heroesendgame.weapon.WeaponItems;
import com.kirkleekirk.heroesendgame.weapon.melee.MeleeItems;
import com.kirkleekirk.heroesendgame.weapon.stats.AttachmentDefinition;
import com.kirkleekirk.heroesendgame.weapon.stats.ComputedWeapon;
import com.kirkleekirk.heroesendgame.weapon.stats.GunDefinition;
import com.kirkleekirk.heroesendgame.weapon.stats.MeleeDefinition;
import com.kirkleekirk.heroesendgame.weapon.stats.WeaponCalc;
import com.kirkleekirk.heroesendgame.weapon.stats.WeaponCatalog;
import net.minecraft.gametest.framework.GameTest;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.world.item.ItemStack;
import net.minecraftforge.gametest.GameTestHolder;
import net.minecraftforge.gametest.PrefixGameTestTemplate;
import net.minecraftforge.registries.ForgeRegistries;

/**
 * In-game checks of the weapon catalog: every definition became an item, and the gunsmith maths applied to real
 * item stacks. Run with ./gradlew runGameTestServer (only registered when game tests are enabled).
 */
@GameTestHolder(HeroesEndgame.MOD_ID)
@PrefixGameTestTemplate(false)
public final class CatalogGameTests {
    private CatalogGameTests() {
    }

    @GameTest(template = "empty")
    public static void everyCatalogEntryIsAnItem(GameTestHelper helper) {
        for (GunDefinition gun : WeaponCatalog.guns()) {
            helper.assertTrue(ForgeRegistries.ITEMS.containsKey(HeroesEndgame.id(gun.id())), "gun not registered: " + gun.id());
            helper.assertTrue(WeaponItems.GUNS.get(gun.id()).get().definition() == gun, "gun item lost its definition: " + gun.id());
        }
        for (MeleeDefinition melee : WeaponCatalog.melee()) {
            helper.assertTrue(MeleeItems.MELEE.containsKey(melee.id()), "melee weapon not registered: " + melee.id());
        }
        for (AttachmentDefinition attachment : WeaponCatalog.attachments()) {
            helper.assertTrue(ForgeRegistries.ITEMS.containsKey(HeroesEndgame.id(attachment.id())), "attachment not registered: " + attachment.id());
        }
        helper.succeed();
    }

    @GameTest(template = "empty")
    public static void attachmentsChangeStatsOnTheStack(GameTestHelper helper) {
        int checked = 0;
        for (GunDefinition gun : WeaponCatalog.guns()) {
            ItemStack stack = new ItemStack(WeaponItems.GUNS.get(gun.id()).get());
            ComputedWeapon before = GunData.computed(stack);
            helper.assertTrue(before != null, "no stats for " + gun.id());
            for (AttachmentDefinition attachment : WeaponCatalog.attachments()) {
                if (attachment.modifiers().isEmpty() || !WeaponCalc.check(gun, GunData.attachments(stack), attachment).ok()) {
                    continue;
                }
                GunData.setAttachment(stack, attachment.slot(), attachment.id());
                helper.assertTrue(GunData.attachment(stack, attachment.slot()) == attachment, "attachment did not stick: " + attachment.id());
                ComputedWeapon after = GunData.computed(stack);
                helper.assertTrue(after != null && !after.stats().equals(before.stats()),
                        attachment.id() + " did not change the stats of " + gun.id());
                GunData.setAttachment(stack, attachment.slot(), null);
                helper.assertTrue(GunData.computed(stack).stats().equals(before.stats()), "detaching " + attachment.id() + " did not restore " + gun.id());
                checked++;
                break;
            }
        }
        helper.assertTrue(checked > 0, "no gun accepted any attachment");
        helper.succeed();
    }
}
