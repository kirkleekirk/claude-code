package com.kirkleekirk.heroesendgame.effect;

import com.kirkleekirk.heroesendgame.registry.ModDamageTypes;
import net.minecraft.world.effect.MobEffect;
import net.minecraft.world.effect.MobEffectCategory;
import net.minecraft.world.entity.LivingEntity;

/**
 * The Spirit of Vengeance's soul fire. It burns the soul, not the body, so fire resistance doesn't help.
 */
public class HellfireEffect extends MobEffect {
    public HellfireEffect() {
        super(MobEffectCategory.HARMFUL, 0xFF6A00);
    }

    @Override
    public void applyEffectTick(LivingEntity entity, int amplifier) {
        if (!entity.level().isClientSide) {
            // Scales with the victim: 2% of max health per second, so it matters no matter how tough you are.
            float damage = Math.max(1.0F, entity.getMaxHealth() * 0.02F) * (1 + amplifier);
            entity.invulnerableTime = 0;
            entity.hurt(ModDamageTypes.source(entity.level(), ModDamageTypes.HELLFIRE), damage);
            entity.setRemainingFireTicks(Math.max(entity.getRemainingFireTicks(), 20));
        }
    }

    @Override
    public boolean isDurationEffectTick(int duration, int amplifier) {
        return duration % 20 == 0;
    }
}
