package com.kirkleekirk.heroesendgame.compat;

import com.kirkleekirk.heroesendgame.config.EndgameConfig;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.effect.MobEffect;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraftforge.fml.ModList;
import net.minecraftforge.registries.ForgeRegistries;
import org.jetbrains.annotations.Nullable;

import java.util.Optional;

/**
 * Everything this addon knows about FSang18's Heroes (mod id {@code fsang}). FSang is a Palladium addon pack with
 * KubeJS scripts, so all of this is looked up by id at runtime - there is no compile-time dependency.
 */
public final class FsangCompat {
    public static final String MOD_ID = "fsang";

    // Palladium properties registered by FSang's properties.js
    public static final String PROP_AGE = "fsang_age";
    public static final String PROP_SKILL_LEVEL = "fsang_skill_level";
    public static final String PROP_SKILL_POINTS = "fsang_skill_points";
    public static final String PROP_KARMA = "fsang_karma";

    /** Written to player persistent data by FSang's 'fsang:damage_resistance' ability (fraction of damage removed). */
    public static final String DAMAGE_RESISTANCE_KEY = "fsang:damage_resistance:value";

    private static Boolean loaded;

    public static boolean isLoaded() {
        if (loaded == null) {
            loaded = ModList.get().isLoaded(MOD_ID);
        }
        return loaded;
    }

    /**
     * FSang's power negation effects (power_negation_effects.js). Every FSang power checks the matching effect and
     * switches its abilities off while it is active - so nemeses use them exactly the way canon villains would.
     */
    public enum Dampening {
        /** "Genetic Inhibitor" - mutants, Viltrumites, super soldiers... (Sentinels) */
        GENETIC("genetic_dampening"),
        /** "EMP" - Iron Man suits and other tech (Doom, Sentinels) */
        TECH("tech_dampening"),
        /** "Speed Inhibitor" - speed force users (Zoom stealing your speed) */
        SPEED("speed_dampening"),
        /** "Red Sun" - Kryptonians */
        SOLAR("solar_dampening"),
        /** "Metaphysical" - gods, magic, cosmic and symbiote powers (Dormammu, Thanos' Reality Stone) */
        METAPHYSICAL("metaphysical_dampening"),
        /** "Full Suppression" (Doom's power siphon, Thanos' snap) */
        ALL("all_dampening");

        private final String path;

        Dampening(String path) {
            this.path = path;
        }

        public ResourceLocation id() {
            return new ResourceLocation(MOD_ID, path);
        }
    }

    // ---------------------------------------------------------------------------------------------------------------
    // Properties
    // ---------------------------------------------------------------------------------------------------------------

    /** Viltrumite age (days survived without dying), or -1 if the player has no age. */
    public static int age(Player player) {
        return PalladiumCompat.intProperty(player, PROP_AGE, -1);
    }

    public static int skillLevel(Player player) {
        return Math.max(0, PalladiumCompat.intProperty(player, PROP_SKILL_LEVEL, 0));
    }

    public static boolean hasKarma(Player player) {
        return PalladiumCompat.hasProperty(player, PROP_KARMA);
    }

    public static int karma(Player player) {
        return PalladiumCompat.intProperty(player, PROP_KARMA, 0);
    }

    public static void setKarma(Player player, int karma) {
        PalladiumCompat.setProperty(player, PROP_KARMA, karma);
    }

    public static boolean addSkillPoints(Player player, int points) {
        return PalladiumCompat.addToIntProperty(player, PROP_SKILL_POINTS, points);
    }

    /** FSang's generic damage resistance (0..0.95) currently applied to the player. */
    public static double damageResistance(Player player) {
        double value = player.getPersistentData().getDouble(DAMAGE_RESISTANCE_KEY);
        return Double.isFinite(value) ? Math.max(0, Math.min(0.95, value)) : 0;
    }

    // ---------------------------------------------------------------------------------------------------------------
    // Effects
    // ---------------------------------------------------------------------------------------------------------------

    public static Optional<MobEffect> effect(String path) {
        return Optional.ofNullable(ForgeRegistries.MOB_EFFECTS.getValue(new ResourceLocation(MOD_ID, path)));
    }

    public static boolean hasEffect(LivingEntity entity, String path) {
        return effect(path).map(entity::hasEffect).orElse(false);
    }

    /**
     * Suppresses the target's powers the FSang way. Falls back to vanilla debuffs when FSang isn't installed.
     */
    public static void dampen(LivingEntity target, Dampening type, int ticks) {
        MobEffect effect = ForgeRegistries.MOB_EFFECTS.getValue(type.id());
        if (effect != null) {
            target.addEffect(new MobEffectInstance(effect, ticks, 0, false, true, true));
            return;
        }
        switch (type) {
            case SPEED -> target.addEffect(new MobEffectInstance(MobEffects.MOVEMENT_SLOWDOWN, ticks, 2));
            case SOLAR, GENETIC -> target.addEffect(new MobEffectInstance(MobEffects.WEAKNESS, ticks, 1));
            case TECH -> target.addEffect(new MobEffectInstance(MobEffects.DIG_SLOWDOWN, ticks, 1));
            case METAPHYSICAL -> target.addEffect(new MobEffectInstance(MobEffects.CONFUSION, ticks, 0));
            case ALL -> {
                target.addEffect(new MobEffectInstance(MobEffects.WEAKNESS, ticks, 1));
                target.addEffect(new MobEffectInstance(MobEffects.MOVEMENT_SLOWDOWN, ticks, 1));
            }
        }
    }

    /** FSang's scourge virus (the Coalition of Planets' bio-weapon against Viltrumites). */
    public static boolean hasScourgeVirus(LivingEntity entity) {
        return hasEffect(entity, "scourge_virus");
    }

    /** FSang's "uncontrollable movement" effect - used for mind control. */
    public static boolean applyMindControl(LivingEntity target, int ticks) {
        Optional<MobEffect> effect = effect("uncontrollable_movement");
        effect.ifPresent(e -> target.addEffect(new MobEffectInstance(e, ticks, 0, false, true, true)));
        target.addEffect(new MobEffectInstance(MobEffects.CONFUSION, ticks + 40, 0));
        return effect.isPresent();
    }

    // ---------------------------------------------------------------------------------------------------------------
    // Items
    // ---------------------------------------------------------------------------------------------------------------

    @Nullable
    public static Item item(String path) {
        ResourceLocation id = new ResourceLocation(MOD_ID, path);
        return ForgeRegistries.ITEMS.containsKey(id) ? ForgeRegistries.ITEMS.getValue(id) : null;
    }

    /** Kryptonite weapons, arrows, batarangs and shards. */
    public static boolean isKryptonite(ItemStack stack) {
        if (stack.isEmpty()) {
            return false;
        }
        ResourceLocation id = ForgeRegistries.ITEMS.getKey(stack.getItem());
        return id != null && id.getPath().contains("kryptonite");
    }

    /**
     * Dresses a boss in one of FSang's suit sets (registered by Palladium as fsang:&lt;suit&gt;_helmet etc.).
     * Pieces that don't exist are skipped. Returns true if at least one piece was equipped.
     */
    public static boolean equipSuit(Mob mob, String suit) {
        if (!isLoaded() || !EndgameConfig.USE_FSANG_SUITS.get()) {
            return false;
        }
        boolean any = false;
        any |= equip(mob, EquipmentSlot.HEAD, suit + "_helmet");
        any |= equip(mob, EquipmentSlot.CHEST, suit + "_chestplate");
        any |= equip(mob, EquipmentSlot.LEGS, suit + "_leggings");
        any |= equip(mob, EquipmentSlot.FEET, suit + "_boots");
        return any;
    }

    private static boolean equip(Mob mob, EquipmentSlot slot, String path) {
        Item item = item(path);
        if (item == null) {
            return false;
        }
        mob.setItemSlot(slot, new ItemStack(item));
        mob.setDropChance(slot, 0.0F);
        return true;
    }

    /** True if the player is wearing FSang's Doctor Doom suit (any variant). */
    public static boolean wearsDoomSuit(Player player) {
        ItemStack head = player.getItemBySlot(EquipmentSlot.HEAD);
        ItemStack chest = player.getItemBySlot(EquipmentSlot.CHEST);
        return isDoomPiece(head) && isDoomPiece(chest);
    }

    private static boolean isDoomPiece(ItemStack stack) {
        if (stack.isEmpty()) {
            return false;
        }
        ResourceLocation id = ForgeRegistries.ITEMS.getKey(stack.getItem());
        return id != null && id.getNamespace().equals(MOD_ID) && id.getPath().startsWith("dr_doom");
    }

    private FsangCompat() {
    }
}
