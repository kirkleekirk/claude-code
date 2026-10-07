package com.kirkleekirk.heroesendgame.weapon;

import com.kirkleekirk.heroesendgame.weapon.stats.AttachmentDefinition;
import com.kirkleekirk.heroesendgame.weapon.stats.AttachmentSlot;
import com.kirkleekirk.heroesendgame.weapon.stats.ComputedWeapon;
import com.kirkleekirk.heroesendgame.weapon.stats.FireMode;
import com.kirkleekirk.heroesendgame.weapon.stats.GunDefinition;
import com.kirkleekirk.heroesendgame.weapon.stats.MeleeDefinition;
import com.kirkleekirk.heroesendgame.weapon.stats.WeaponCalc;
import com.kirkleekirk.heroesendgame.weapon.stats.WeaponCatalog;
import com.kirkleekirk.heroesendgame.weapon.stats.WeaponDefinition;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.world.item.ItemStack;
import org.jetbrains.annotations.Nullable;

import java.util.Collections;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

/**
 * Weapon state stored on the item stack, under the "Weapon" tag:
 * <pre>
 * Weapon: { Ammo: int, Mode: int (index into the computed fire modes), Ugl: int (underbarrel rounds),
 *           Attachments: { &lt;slot key&gt;: "&lt;attachment id&gt;", ... } }
 * </pre>
 * All gunsmith code goes through here so the format lives in one place.
 */
public final class GunData {
    public static final String ROOT = "Weapon";
    public static final String AMMO = "Ammo";
    public static final String MODE = "Mode";
    public static final String UGL = "Ugl";
    public static final String ATTACHMENTS = "Attachments";

    private GunData() {
    }

    @Nullable
    public static WeaponDefinition definition(ItemStack stack) {
        return stack.getItem() instanceof WeaponItem item ? item.weaponDefinition() : null;
    }

    @Nullable
    public static GunDefinition gun(ItemStack stack) {
        return definition(stack) instanceof GunDefinition gun ? gun : null;
    }

    public static boolean isGun(ItemStack stack) {
        return gun(stack) != null;
    }

    private static CompoundTag root(ItemStack stack) {
        return stack.getOrCreateTagElement(ROOT);
    }

    @Nullable
    private static CompoundTag rootOrNull(ItemStack stack) {
        return stack.getTagElement(ROOT);
    }

    public static int ammo(ItemStack stack) {
        CompoundTag tag = rootOrNull(stack);
        return tag == null ? 0 : tag.getInt(AMMO);
    }

    public static void setAmmo(ItemStack stack, int ammo) {
        root(stack).putInt(AMMO, Math.max(0, ammo));
    }

    public static int underbarrelAmmo(ItemStack stack) {
        CompoundTag tag = rootOrNull(stack);
        return tag == null ? 0 : tag.getInt(UGL);
    }

    public static void setUnderbarrelAmmo(ItemStack stack, int ammo) {
        root(stack).putInt(UGL, Math.max(0, ammo));
    }

    public static int modeIndex(ItemStack stack) {
        CompoundTag tag = rootOrNull(stack);
        return tag == null ? 0 : tag.getInt(MODE);
    }

    public static void setModeIndex(ItemStack stack, int index) {
        root(stack).putInt(MODE, index);
    }

    /** Current fire mode (falls back to the first available mode). */
    public static FireMode fireMode(ItemStack stack) {
        ComputedWeapon computed = computed(stack);
        if (computed == null || computed.fireModes().isEmpty()) {
            return FireMode.SEMI;
        }
        List<FireMode> modes = computed.fireModes();
        int index = modeIndex(stack);
        return modes.get(index >= 0 && index < modes.size() ? index : 0);
    }

    /** Attached attachments by slot (unknown ids are skipped). */
    public static Map<AttachmentSlot, AttachmentDefinition> attachments(ItemStack stack) {
        CompoundTag tag = rootOrNull(stack);
        if (tag == null || !tag.contains(ATTACHMENTS)) {
            return Collections.emptyMap();
        }
        CompoundTag attachments = tag.getCompound(ATTACHMENTS);
        Map<AttachmentSlot, AttachmentDefinition> result = new EnumMap<>(AttachmentSlot.class);
        for (String key : attachments.getAllKeys()) {
            AttachmentSlot slot = AttachmentSlot.byKey(key);
            AttachmentDefinition attachment = WeaponCatalog.attachment(attachments.getString(key));
            if (slot != null && attachment != null && attachment.slot() == slot) {
                result.put(slot, attachment);
            }
        }
        return result;
    }

    @Nullable
    public static AttachmentDefinition attachment(ItemStack stack, AttachmentSlot slot) {
        return attachments(stack).get(slot);
    }

    /** Sets (or with null clears) a slot. No validation - callers use {@link WeaponCalc#check} first. */
    public static void setAttachment(ItemStack stack, AttachmentSlot slot, @Nullable String attachmentId) {
        CompoundTag attachments = root(stack).getCompound(ATTACHMENTS);
        if (attachmentId == null) {
            attachments.remove(slot.key());
        } else {
            attachments.putString(slot.key(), attachmentId);
        }
        root(stack).put(ATTACHMENTS, attachments);
        // Fire-mode conversions may change the list: start again from the first mode.
        setModeIndex(stack, 0);
    }

    /** Stats after attachments, or null if the stack is not a weapon. */
    @Nullable
    public static ComputedWeapon computed(ItemStack stack) {
        WeaponDefinition definition = definition(stack);
        if (definition instanceof GunDefinition gun) {
            return WeaponCalc.compute(gun, attachments(stack));
        }
        if (definition instanceof MeleeDefinition melee) {
            return WeaponCalc.compute(melee, attachments(stack));
        }
        return null;
    }
}
