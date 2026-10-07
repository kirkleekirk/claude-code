package com.kirkleekirk.heroesendgame.effect;

import net.minecraft.world.effect.MobEffect;
import net.minecraft.world.effect.MobEffectCategory;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.item.ItemStack;

import java.util.List;

/**
 * "Unbalanced": everyone feels the half of the universe that is missing. -5% max health and attack damage per level.
 * Can't be cured with milk; it lasts until Thanos is defeated.
 */
public class SnappedEffect extends MobEffect {
    public SnappedEffect() {
        super(MobEffectCategory.HARMFUL, 0x8E5BD9);
        addAttributeModifier(Attributes.MAX_HEALTH, "5b1d0b52-3a7e-4cf2-9a55-0f8c3e6f2a11", -0.05, AttributeModifier.Operation.MULTIPLY_TOTAL);
        addAttributeModifier(Attributes.ATTACK_DAMAGE, "a8a1c4d7-7e2b-4f36-b5d4-2d6f0c1b9e22", -0.05, AttributeModifier.Operation.MULTIPLY_TOTAL);
    }

    @Override
    public List<ItemStack> getCurativeItems() {
        return List.of();
    }
}
