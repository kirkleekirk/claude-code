package com.kirkleekirk.heroesendgame.entity;

import com.kirkleekirk.heroesendgame.entity.ability.BossAbility;
import net.minecraft.core.particles.ParticleOptions;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.network.chat.Component;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.level.Level;

import java.util.List;

/**
 * A decoy that looks exactly like the boss that made it: Loki's illusions (variant 0) or one of Zoom's time
 * remnants (variant 1). Hits like a wet noodle and pops on the first hit.
 */
public class IllusionEntity extends EndgameBoss {
    public static final int LOKI = 0;
    public static final int ZOOM = 1;
    private static final BossStats STATS = new BossStats(1, 2, 40, 1, 1.0F, 0, 0.3);

    public IllusionEntity(EntityType<? extends IllusionEntity> type, Level level) {
        super(type, level);
        this.xpReward = 0;
    }

    public static AttributeSupplier.Builder createAttributes() {
        return EndgameBoss.bossAttributes(1, 2, 0.3, 0);
    }

    @Override
    public BossStats stats() {
        return STATS;
    }

    @Override
    protected String dialogueKey() {
        return getVariant() == ZOOM ? "zoom" : "loki";
    }

    @Override
    public boolean isMinion() {
        return true;
    }

    @Override
    protected boolean canLeashTeleport() {
        return false;
    }

    @Override
    protected double chaseSpeed() {
        return getVariant() == ZOOM ? 1.6 : 1.0;
    }

    @Override
    protected void registerAbilities(List<BossAbility> abilities) {
    }

    @Override
    protected Component getTypeName() {
        return Component.translatable(getVariant() == ZOOM ? "entity.heroes_endgame.zoom" : "entity.heroes_endgame.loki");
    }

    private ParticleOptions popParticle() {
        return getVariant() == ZOOM ? ParticleTypes.ELECTRIC_SPARK : ParticleTypes.HAPPY_VILLAGER;
    }

    /** Copies the original's outfit so the decoy is indistinguishable. */
    public void copyLook(EndgameBoss original) {
        for (EquipmentSlot slot : EquipmentSlot.values()) {
            setItemSlot(slot, original.getItemBySlot(slot).copy());
            setDropChance(slot, 0.0F);
        }
    }

    @Override
    public boolean hurt(DamageSource source, float amount) {
        if (level().isClientSide || isInvulnerableTo(source) || source.getEntity() instanceof EndgameBoss) {
            return false;
        }
        burst(popParticle(), 30, 1.0);
        playSound(SoundEvents.ILLUSIONER_MIRROR_MOVE, 1.0F, 1.6F);
        discard();
        return true;
    }

    @Override
    protected void customServerAiStep() {
        super.customServerAiStep();
        if (tickCount > 400) {
            burst(popParticle(), 20, 1.0);
            discard();
        }
    }
}
