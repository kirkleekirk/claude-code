package com.kirkleekirk.heroesendgame.entity.viltrumite;

import com.kirkleekirk.heroesendgame.entity.BossStats;
import com.kirkleekirk.heroesendgame.entity.EndgameBoss;
import com.kirkleekirk.heroesendgame.entity.ability.BossAbility;
import com.kirkleekirk.heroesendgame.entity.ability.SummonAbility;
import com.kirkleekirk.heroesendgame.registry.ModDamageTypes;
import com.kirkleekirk.heroesendgame.registry.ModEntities;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.BossEvent;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.Vec3;

import java.util.List;

/**
 * Grand Regent Thragg, bred to be the perfect Viltrumite warrior. He reads your attacks: every so often he takes a
 * stance and counters the next blow, and when the fight turns he calls the Empire to purge you.
 */
public class ThraggEntity extends AbstractViltrumiteEntity {
    private static final BossStats STATS = new BossStats(900, 14, 7, 90, 0.05F, 18, 1.05);
    private int counterStance;
    private int counterCooldown = 160;

    public ThraggEntity(EntityType<? extends ThraggEntity> type, Level level) {
        super(type, level);
    }

    public static AttributeSupplier.Builder createAttributes() {
        return EndgameBoss.bossAttributes(900, 14, 0.34, 18);
    }

    @Override
    public BossStats stats() {
        return STATS;
    }

    @Override
    protected String suit() {
        return "viltrumite3";
    }

    @Override
    protected String dialogueKey() {
        return "thragg";
    }

    @Override
    protected BossEvent.BossBarColor bossBarColor() {
        return BossEvent.BossBarColor.WHITE;
    }

    @Override
    protected boolean darkenSky() {
        return true;
    }

    @Override
    public float renderScale() {
        return 1.1F;
    }

    @Override
    protected float[] phaseThresholds() {
        return new float[]{0.5F, 0.25F};
    }

    @Override
    protected void onPhaseChange(int phase) {
        if (phase == 1) {
            say("purge");
            SummonAbility purge = ability(SummonAbility.class);
            if (purge != null && getTarget() != null) {
                startAbility(purge, getTarget());
            }
        } else {
            say("blitz");
        }
    }

    @Override
    protected double flightSpeed() {
        return super.flightSpeed() * (getPhase() >= 2 ? 1.35 : 1.0);
    }

    @Override
    protected void registerAbilities(List<BossAbility> abilities) {
        super.registerAbilities(abilities);
        abilities.add(new SummonAbility(this, 900, ModEntities.VILTRUMITE_ENFORCER::get, 2, 2, ParticleTypes.CLOUD, 1));
    }

    @Override
    protected void customServerAiStep() {
        super.customServerAiStep();
        if (counterStance > 0) {
            counterStance--;
            if (counterStance % 4 == 0) {
                burst(ParticleTypes.ENCHANTED_HIT, 4, 0.6);
            }
        } else if (--counterCooldown <= 0 && getTarget() != null && distanceTo(getTarget()) < 6) {
            counterStance = 30;
            counterCooldown = 140 + random.nextInt(80);
            setCastPose(POSE_CAST);
        }
    }

    /** The perfect warrior: a blow that lands during his stance is turned against the attacker. */
    @Override
    protected float modifyIncomingDamage(DamageSource source, float amount) {
        if (counterStance > 0 && source.getDirectEntity() instanceof LivingEntity attacker && attacker == source.getEntity()
                && attacker.distanceToSqr(this) < 25) {
            counterStance = 0;
            setCastPose(POSE_NONE);
            swing(InteractionHand.MAIN_HAND);
            strike(attacker, 1.5F, ModDamageTypes.VILTRUMITE);
            Vec3 push = attacker.position().subtract(position()).normalize().scale(2.0);
            launch(attacker, push.add(0, 0.5, 0));
            playSound(SoundEvents.SHIELD_BLOCK, 2.0F, 0.6F);
            if (attacker instanceof Player) {
                say("counter");
            }
            return 0.0F;
        }
        return super.modifyIncomingDamage(source, amount);
    }

    @Override
    public void addAdditionalSaveData(CompoundTag tag) {
        super.addAdditionalSaveData(tag);
        tag.putInt("CounterCooldown", counterCooldown);
    }

    @Override
    public void readAdditionalSaveData(CompoundTag tag) {
        super.readAdditionalSaveData(tag);
        counterCooldown = tag.getInt("CounterCooldown");
    }
}
