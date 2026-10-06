package com.kirkleekirk.heroesendgame.entity.viltrumite;

import com.kirkleekirk.heroesendgame.entity.BossStats;
import com.kirkleekirk.heroesendgame.entity.EndgameBoss;
import com.kirkleekirk.heroesendgame.entity.ability.BossAbility;
import com.kirkleekirk.heroesendgame.registry.ModDamageTypes;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.level.Level;

import java.util.List;

/**
 * Conquest: the scarred veteran the Empire sends when a Viltrumite won't come quietly. He lives for the fight and
 * gets more dangerous the more he bleeds ("battle lust").
 */
public class ConquestEntity extends AbstractViltrumiteEntity {
    private static final BossStats STATS = new BossStats(600, 12, 8, 70, 0.06F, 16, 0.95);

    public ConquestEntity(EntityType<? extends ConquestEntity> type, Level level) {
        super(type, level);
    }

    public static AttributeSupplier.Builder createAttributes() {
        return EndgameBoss.bossAttributes(600, 12, 0.33, 16);
    }

    @Override
    public BossStats stats() {
        return STATS;
    }

    @Override
    protected String suit() {
        return "viltrumite2";
    }

    @Override
    protected String dialogueKey() {
        return "conquest";
    }

    @Override
    public float renderScale() {
        return 1.08F;
    }

    @Override
    protected float[] phaseThresholds() {
        return new float[]{0.5F, 0.2F};
    }

    @Override
    protected void onPhaseChange(int phase) {
        say(phase == 1 ? "phase_bleed" : "phase_last");
        playSound(SoundEvents.RAVAGER_ROAR, 3.0F, 0.6F);
    }

    /** Battle lust: up to +70% damage as his health drops. */
    @Override
    protected float damageMultiplier() {
        return super.damageMultiplier() * (1.0F + 0.7F * (1.0F - getHealth() / getMaxHealth()));
    }

    @Override
    protected int meleeInterval() {
        return getPhase() >= 1 ? 10 : 14;
    }

    @Override
    protected void registerAbilities(List<BossAbility> abilities) {
        super.registerAbilities(abilities);
        abilities.add(new GougeAbility(this));
    }

    /** Conquest fights dirty: a headbutt and a thumb to the eye. */
    static class GougeAbility extends BossAbility {
        GougeAbility(EndgameBoss boss) {
            super(boss);
        }

        @Override
        public int cooldownTicks() {
            return 260;
        }

        @Override
        public boolean canUse(LivingEntity target) {
            return boss.distanceToSqr(target) < boss.meleeReachSqr(target);
        }

        @Override
        public boolean tick(LivingEntity target) {
            if (ticks == 6) {
                boss.swing(InteractionHand.MAIN_HAND);
                if (boss.distanceToSqr(target) < boss.meleeReachSqr(target) + 2 && boss.strike(target, 1.3F, ModDamageTypes.VILTRUMITE)) {
                    target.addEffect(new MobEffectInstance(MobEffects.BLINDNESS, 70, 0));
                    target.addEffect(new MobEffectInstance(MobEffects.MOVEMENT_SLOWDOWN, 40, 3));
                    boss.burst(ParticleTypes.DAMAGE_INDICATOR, 10, 0.5);
                    ((ConquestEntity) boss).say("gouge");
                }
                return false;
            }
            return true;
        }
    }
}
