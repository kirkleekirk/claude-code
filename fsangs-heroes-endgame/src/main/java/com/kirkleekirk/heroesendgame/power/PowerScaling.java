package com.kirkleekirk.heroesendgame.power;

import com.kirkleekirk.heroesendgame.compat.FsangCompat;
import com.kirkleekirk.heroesendgame.config.EndgameConfig;
import com.kirkleekirk.heroesendgame.entity.BossStats;
import net.minecraft.tags.DamageTypeTags;
import net.minecraft.util.Mth;
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
     * <p>
     * The player's damage reduction (armor, Protection, FSang's damage_resistance) is mostly pierced so durable heroes
     * still feel every hit, but {@code 1 - durabilityPierce} of it still counts, so defence is never worthless. The
     * floor makes weak, unarmored targets take up to twice the tuned damage, never more.
     */
    public static float hitDamage(LivingEntity target, DamageSource source, float hitsToKill, float floor) {
        if (!(target instanceof Player player)) {
            return floor;
        }
        float maxHealth = player.getMaxHealth();
        float tuned = maxHealth / Math.max(0.5F, hitsToKill);
        double mitigation = 1.0 - tuned / Math.max(0.0001F, rawFor(player, source, tuned));
        double kept = Mth.clamp(mitigation, 0.0, 1.0) * (1.0 - EndgameConfig.DURABILITY_PIERCE.get());
        float damage = rawFor(player, source, (float) (tuned * (1.0 - kept)));
        damage = Math.max(damage, Math.min(floor, damage * 2.0F));
        return Math.min(damage, maxHealth * 6.0F);
    }

    /** Raw damage that is left at {@code finalDamage} after FSang's resistance, armor and Protection. */
    private static float rawFor(Player player, DamageSource source, float finalDamage) {
        float damage = finalDamage;
        if (!source.is(DamageTypeTags.BYPASSES_ENCHANTMENTS)) {
            int protection = EnchantmentHelper.getDamageProtection(player.getArmorSlots(), source);
            damage /= Math.max(0.2F, CombatRules.getDamageAfterMagicAbsorb(1.0F, protection));
        }
        if (!source.is(DamageTypeTags.BYPASSES_ARMOR)) {
            // The armor reduction shrinks as damage grows, so iterate.
            float armor = player.getArmorValue();
            float toughness = (float) player.getAttributeValue(Attributes.ARMOR_TOUGHNESS);
            float target = damage;
            for (int i = 0; i < 12; i++) {
                float factor = CombatRules.getDamageAfterAbsorb(damage, armor, toughness) / Math.max(0.0001F, damage);
                damage = target / Math.max(0.2F, factor);
            }
        }
        // FSang's damage_resistance runs in LivingHurtEvent, before armor
        return (float) (damage / Math.max(0.05, 1.0 - FsangCompat.damageResistance(player)));
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
