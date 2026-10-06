package com.kirkleekirk.heroesendgame.power;

import com.kirkleekirk.heroesendgame.compat.FsangCompat;
import com.kirkleekirk.heroesendgame.config.EndgameConfig;
import com.kirkleekirk.heroesendgame.entity.BossStats;
import net.minecraft.world.damagesource.CombatRules;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.enchantment.EnchantmentHelper;
import org.jetbrains.annotations.Nullable;

/**
 * The heart of "your powers grow - so do your enemies".
 * <p>
 * Instead of fixed numbers, every nemesis hit is solved backwards from the target: "this attack should take 1/N of
 * your health", accounting for armor, toughness, protection enchantments and FSang's damage resistance abilities.
 * Health is sized from the damage the hunted player can deal, so fights last roughly as long no matter how far the
 * player's powers have scaled.
 */
public final class PowerScaling {
    /** Vanilla caps generic.max_health at 1024; anything above that is handled with a damage divisor. */
    public static final double ATTRIBUTE_HEALTH_CAP = 1024.0;

    /**
     * Pre-mitigation damage that makes {@code source} take about {@code 1 / hitsToKill} of the target's max health
     * (before the config damage multiplier). Non-players just get {@code floor}.
     */
    public static float hitDamage(LivingEntity target, DamageSource source, float hitsToKill, float floor) {
        if (!(target instanceof Player player)) {
            return floor;
        }
        float maxHealth = player.getMaxHealth();
        double resistance = FsangCompat.damageResistance(player);
        double pierce = EndgameConfig.DURABILITY_PIERCE.get();
        double effectiveResistance = resistance * (1.0 - pierce);

        float desiredFinal = (float) (maxHealth / Math.max(0.5F, hitsToKill) * (1.0 - effectiveResistance));

        // Protection enchantments (applied after armor)
        int protection = EnchantmentHelper.getDamageProtection(player.getArmorSlots(), source);
        float enchantFactor = CombatRules.getDamageAfterMagicAbsorb(1.0F, protection);
        float beforeEnchants = desiredFinal / Math.max(0.2F, enchantFactor);

        // Armor (the reduction shrinks as damage grows, so iterate)
        float armor = player.getArmorValue();
        float toughness = (float) player.getAttributeValue(Attributes.ARMOR_TOUGHNESS);
        float damage = beforeEnchants;
        for (int i = 0; i < 12; i++) {
            float factor = CombatRules.getDamageAfterAbsorb(damage, armor, toughness) / Math.max(0.0001F, damage);
            damage = beforeEnchants / Math.max(0.2F, factor);
        }

        // FSang's damage_resistance runs in LivingHurtEvent, before armor
        damage = (float) (damage / Math.max(0.05, 1.0 - resistance));

        return Math.min(Math.max(damage, floor), maxHealth * 6.0F);
    }

    /** Health a boss should have against this player (and its allies). */
    public static double bossHealth(@Nullable PowerProfile profile, BossStats stats, int players) {
        double dps = profile == null ? 6.0 : profile.estimatedDps();
        double health = Math.max(stats.baseHealth(), dps * stats.fightSeconds());
        health *= 1.0 + Math.max(0, players - 1) * EndgameConfig.MULTIPLAYER_HEALTH_BONUS.get();
        health *= EndgameConfig.HEALTH_MULTIPLIER.get();
        return Math.max(10.0, health);
    }

    private PowerScaling() {
    }
}
