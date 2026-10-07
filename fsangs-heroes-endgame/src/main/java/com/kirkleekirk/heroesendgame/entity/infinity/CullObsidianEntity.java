package com.kirkleekirk.heroesendgame.entity.infinity;

import com.kirkleekirk.heroesendgame.entity.BossStats;
import com.kirkleekirk.heroesendgame.entity.EndgameBoss;
import com.kirkleekirk.heroesendgame.entity.ability.BossAbility;
import com.kirkleekirk.heroesendgame.entity.ability.ChargeAbility;
import com.kirkleekirk.heroesendgame.entity.ability.PullAbility;
import com.kirkleekirk.heroesendgame.entity.ability.ShockwaveAbility;
import com.kirkleekirk.heroesendgame.registry.ModDamageTypes;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.Vec3;

import java.util.List;

/**
 * Cull Obsidian, the Black Order's brute: hammer, chain and a shield arm that blocks attacks from the front.
 * Go around him.
 */
public class CullObsidianEntity extends BlackOrderEntity {
    private static final BossStats STATS = new BossStats(700, 12, 8, 55, 0.07F, 20, 0.27);

    public CullObsidianEntity(EntityType<? extends CullObsidianEntity> type, Level level) {
        super(type, level);
    }

    public static AttributeSupplier.Builder createAttributes() {
        return EndgameBoss.bossAttributes(700, 12, 0.27, 20);
    }

    @Override
    public BossStats stats() {
        return STATS;
    }

    @Override
    protected String dialogueKey() {
        return "cull_obsidian";
    }

    @Override
    public float renderScale() {
        return 1.5F;
    }

    @Override
    protected double meleeKnockback() {
        return 1.4;
    }

    @Override
    protected int meleeInterval() {
        return 26;
    }

    @Override
    protected float meleePower() {
        return 1.4F;
    }

    @Override
    protected void registerAbilities(List<BossAbility> abilities) {
        abilities.add(new ShockwaveAbility(this, 160, 22, 6.0, 1.2F, ModDamageTypes.NEMESIS, 1.6, 0.6,
                ParticleTypes.CRIT, SoundEvents.ANVIL_LAND, POSE_SLAM));
        abilities.add(new ChargeAbility(this, 200, 0.9, 1.4F, ModDamageTypes.NEMESIS, 15));
        abilities.add(new PullAbility(this, 240, 5, 18, 1.0F, ModDamageTypes.NEMESIS, ParticleTypes.CRIT, SoundEvents.CHAIN_PLACE));
    }

    /** The shield arm: frontal hits are mostly blocked. */
    @Override
    protected float modifyIncomingDamage(DamageSource source, float amount) {
        Entity direct = source.getDirectEntity();
        if (direct != null && !isMovementLocked()) {
            Vec3 toAttacker = direct.position().subtract(position()).multiply(1, 0, 1).normalize();
            Vec3 facing = Vec3.directionFromRotation(0, getYRot());
            if (toAttacker.dot(facing) > 0.5) {
                playSound(SoundEvents.SHIELD_BLOCK, 1.0F, 0.6F);
                return amount * 0.35F;
            }
        }
        return amount;
    }
}
