package com.kirkleekirk.heroesendgame.entity.infinity;

import com.kirkleekirk.heroesendgame.entity.BossStats;
import com.kirkleekirk.heroesendgame.entity.EndgameBoss;
import com.kirkleekirk.heroesendgame.entity.ability.BlinkStrikeAbility;
import com.kirkleekirk.heroesendgame.entity.ability.BossAbility;
import com.kirkleekirk.heroesendgame.entity.ability.ShockwaveAbility;
import com.kirkleekirk.heroesendgame.registry.ModDamageTypes;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.level.Level;

import java.util.List;

/**
 * Corvus Glaive. As long as his glaive is whole it keeps knitting him back together - only a heavy burst of damage
 * cracks it and stops the regeneration for a while.
 */
public class CorvusGlaiveEntity extends BlackOrderEntity {
    private static final BossStats STATS = new BossStats(450, 10, 9, 45, 0.08F, 12, 0.34);
    private final float[] recentDamage = new float[5];
    private int crackedTicks;

    public CorvusGlaiveEntity(EntityType<? extends CorvusGlaiveEntity> type, Level level) {
        super(type, level);
    }

    public static AttributeSupplier.Builder createAttributes() {
        return EndgameBoss.bossAttributes(450, 10, 0.34, 12);
    }

    @Override
    public BossStats stats() {
        return STATS;
    }

    @Override
    protected String dialogueKey() {
        return "corvus_glaive";
    }

    @Override
    protected void registerAbilities(List<BossAbility> abilities) {
        abilities.add(new BlinkStrikeAbility(this, 140, 1.5F, ModDamageTypes.NEMESIS, ParticleTypes.SQUID_INK, 5));
        abilities.add(new ShockwaveAbility(this, 120, 10, 4.5, 1.1F, ModDamageTypes.NEMESIS, 1.0, 0.3,
                ParticleTypes.SWEEP_ATTACK, SoundEvents.PLAYER_ATTACK_SWEEP, POSE_SLAM));
    }

    @Override
    protected float modifyIncomingDamage(DamageSource source, float amount) {
        recentDamage[(tickCount / 20) % recentDamage.length] += amount;
        return crackedTicks > 0 ? amount * 1.25F : amount;
    }

    @Override
    protected void customServerAiStep() {
        super.customServerAiStep();
        if (crackedTicks > 0) {
            crackedTicks--;
            if (crackedTicks % 10 == 0) {
                burst(ParticleTypes.SMOKE, 4, 0.4);
            }
        }
        if (tickCount % 20 == 0) {
            float total = 0;
            for (float damage : recentDamage) {
                total += damage;
            }
            if (crackedTicks <= 0 && total >= effectiveMaxHealth() * 0.15F) {
                crackedTicks = 300;
                say("glaive_cracked");
                playSound(SoundEvents.ITEM_BREAK, 2.0F, 0.5F);
            }
            recentDamage[((tickCount / 20) + 1) % recentDamage.length] = 0;
            if (crackedTicks <= 0 && getHealth() < getMaxHealth()) {
                heal(getMaxHealth() * 0.01F);
            }
        }
    }

    @Override
    public void addAdditionalSaveData(CompoundTag tag) {
        super.addAdditionalSaveData(tag);
        tag.putInt("Cracked", crackedTicks);
    }

    @Override
    public void readAdditionalSaveData(CompoundTag tag) {
        super.readAdditionalSaveData(tag);
        crackedTicks = tag.getInt("Cracked");
    }
}
