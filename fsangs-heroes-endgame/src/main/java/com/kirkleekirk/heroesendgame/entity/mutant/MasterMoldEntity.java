package com.kirkleekirk.heroesendgame.entity.mutant;

import com.kirkleekirk.heroesendgame.compat.FsangCompat;
import com.kirkleekirk.heroesendgame.entity.BossStats;
import com.kirkleekirk.heroesendgame.entity.EndgameBoss;
import com.kirkleekirk.heroesendgame.entity.ability.BeamAbility;
import com.kirkleekirk.heroesendgame.entity.ability.BossAbility;
import com.kirkleekirk.heroesendgame.entity.ability.DampenPulseAbility;
import com.kirkleekirk.heroesendgame.entity.ability.ShockwaveAbility;
import com.kirkleekirk.heroesendgame.entity.ability.SummonAbility;
import com.kirkleekirk.heroesendgame.entity.ability.VolleyAbility;
import com.kirkleekirk.heroesendgame.entity.projectile.EnergyBoltEntity;
import com.kirkleekirk.heroesendgame.registry.ModDamageTypes;
import com.kirkleekirk.heroesendgame.registry.ModEntities;
import net.minecraft.ChatFormatting;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.resources.ResourceKey;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.BossEvent;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.damagesource.DamageType;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.level.Level;

import java.util.List;

/**
 * Master Mold, the Sentinel factory. Slow and colossal; it keeps building Sentinels while it fights.
 * Its head is the weak point - hits that land up there (projectiles, or attackers flying at head height) deal
 * double damage.
 */
public class MasterMoldEntity extends EndgameBoss {
    private static final BossStats STATS = new BossStats(1600, 16, 7, 120, 0.04F, 25, 0.18);

    public MasterMoldEntity(EntityType<? extends MasterMoldEntity> type, Level level) {
        super(type, level);
        this.setMaxUpStep(3.0F);
    }

    public static AttributeSupplier.Builder createAttributes() {
        return EndgameBoss.bossAttributes(1600, 16, 0.18, 25);
    }

    @Override
    public BossStats stats() {
        return STATS;
    }

    @Override
    protected String dialogueKey() {
        return "master_mold";
    }

    @Override
    public float renderScale() {
        return 5.0F;
    }

    @Override
    protected BossEvent.BossBarColor bossBarColor() {
        return BossEvent.BossBarColor.PURPLE;
    }

    @Override
    protected ChatFormatting nameColor() {
        return ChatFormatting.DARK_PURPLE;
    }

    @Override
    protected boolean darkenSky() {
        return true;
    }

    @Override
    protected ResourceKey<DamageType> meleeDamageType() {
        return ModDamageTypes.SENTINEL;
    }

    @Override
    protected double meleeKnockback() {
        return 2.0;
    }

    @Override
    protected int meleeInterval() {
        return 30;
    }

    @Override
    protected float meleePower() {
        return 1.5F;
    }

    @Override
    protected void registerAbilities(List<BossAbility> abilities) {
        abilities.add(new SummonAbility(this, 500, ModEntities.SENTINEL::get, 1, 2, SentinelEntity.RED, 0));
        abilities.add(new BeamAbility(this, 180, 25, 50, 40, 0.6F, ModDamageTypes.SENTINEL, SentinelEntity.RED, SoundEvents.GUARDIAN_ATTACK));
        abilities.add(new VolleyAbility(this, 200, 6, 5, EnergyBoltEntity.Variant.POWER, 0.8F, 0.9, true, SoundEvents.FIREWORK_ROCKET_LAUNCH, 0));
        abilities.add(new ShockwaveAbility(this, 160, 20, 9.0, 1.4F, ModDamageTypes.SENTINEL, 2.0, 0.8,
                ParticleTypes.CLOUD, SoundEvents.GENERIC_EXPLODE, POSE_SLAM));
        abilities.add(new DampenPulseAbility(this, 400, 22, FsangCompat.Dampening.GENETIC, 200, SentinelEntity.RED,
                SoundEvents.BEACON_DEACTIVATE, SentinelEntity::isMutant, "inhibitor"));
    }

    @Override
    protected float modifyIncomingDamage(DamageSource source, float amount) {
        Entity direct = source.getDirectEntity();
        double headY = getY() + getBbHeight() * 0.72;
        if (direct != null && direct.getY() + direct.getBbHeight() * 0.5 >= headY) {
            burst(ParticleTypes.ELECTRIC_SPARK, 10, 0.4);
            return amount * 2.0F;
        }
        return amount;
    }

    @Override
    public void playArrival() {
        burst(ParticleTypes.CAMPFIRE_COSY_SMOKE, 80, 1.0);
        playSound(SoundEvents.IRON_GOLEM_REPAIR, 4.0F, 0.3F);
        playSound(SoundEvents.WARDEN_EMERGE, 4.0F, 0.5F);
        say("arrival");
    }
}
