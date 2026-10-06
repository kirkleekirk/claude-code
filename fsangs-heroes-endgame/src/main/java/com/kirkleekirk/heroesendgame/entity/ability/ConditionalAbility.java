package com.kirkleekirk.heroesendgame.entity.ability;

import com.kirkleekirk.heroesendgame.entity.EndgameBoss;
import net.minecraft.world.entity.LivingEntity;

import java.util.function.BooleanSupplier;

/**
 * Only lets the wrapped ability be picked while a condition holds (e.g. "Thanos has the Power Stone").
 */
public class ConditionalAbility extends BossAbility {
    private final BossAbility inner;
    private final BooleanSupplier condition;

    public ConditionalAbility(EndgameBoss boss, BossAbility inner, BooleanSupplier condition) {
        super(boss);
        this.inner = inner;
        this.condition = condition;
    }

    public BossAbility inner() {
        return inner;
    }

    @Override
    public int cooldownTicks() {
        return inner.cooldownTicks();
    }

    @Override
    public int weight() {
        return inner.weight();
    }

    @Override
    public boolean canUse(LivingEntity target) {
        return condition.getAsBoolean() && inner.canUse(target);
    }

    @Override
    public void start(LivingEntity target) {
        inner.begin(target);
    }

    @Override
    public boolean tick(LivingEntity target) {
        return inner.update(target);
    }

    @Override
    public void stop() {
        inner.finish();
    }

    @Override
    public boolean locksMovement() {
        return inner.locksMovement();
    }

    @Override
    public int castPose() {
        return inner.castPose();
    }
}
