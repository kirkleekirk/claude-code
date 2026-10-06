package com.kirkleekirk.heroesendgame.power;

import com.kirkleekirk.heroesendgame.compat.FsangCompat;
import com.kirkleekirk.heroesendgame.compat.PalladiumCompat;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.player.Player;

import java.util.EnumSet;
import java.util.Set;

/**
 * A snapshot of how strong a player currently is: which FSang powers they have and what those powers did to their
 * actual combat stats. Nemeses scale to this, so the stronger your powers get, the harder they hit back.
 */
public record PowerProfile(Set<ResourceLocation> powers, Set<PowerFamily> families, int skillLevel, int viltrumiteAge,
                           int karma, boolean hasKarma, float maxHealth, float armor, float toughness,
                           float attackDamage, float attackSpeed, double fsangResistance) {

    public static PowerProfile of(Player player) {
        Set<ResourceLocation> powers = PalladiumCompat.powerIds(player);
        EnumSet<PowerFamily> families = EnumSet.noneOf(PowerFamily.class);
        for (ResourceLocation power : powers) {
            for (PowerFamily family : PowerFamily.values()) {
                if (family.matches(power)) {
                    families.add(family);
                }
            }
        }
        return new PowerProfile(powers, families,
                FsangCompat.skillLevel(player),
                FsangCompat.age(player),
                FsangCompat.karma(player),
                FsangCompat.hasKarma(player),
                player.getMaxHealth(),
                (float) player.getAttributeValue(Attributes.ARMOR),
                (float) player.getAttributeValue(Attributes.ARMOR_TOUGHNESS),
                (float) player.getAttributeValue(Attributes.ATTACK_DAMAGE),
                (float) player.getAttributeValue(Attributes.ATTACK_SPEED),
                FsangCompat.damageResistance(player));
    }

    public boolean is(PowerFamily family) {
        return families.contains(family);
    }

    /**
     * Rough damage per second this player can put out. Melee is capped by the 10 tick hurt cooldown; FSang
     * abilities are approximated through the skill level, which grows as the player uses their powers.
     */
    public double estimatedDps() {
        double melee = attackDamage * Math.min(Math.max(attackSpeed, 0.5), 2.0) * 0.6;
        double abilities = 0.8 * skillLevel + 0.6 * powers.size();
        return Math.max(4.0, melee + abilities);
    }
}
