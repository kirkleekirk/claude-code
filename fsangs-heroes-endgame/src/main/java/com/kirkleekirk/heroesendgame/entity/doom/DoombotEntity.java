package com.kirkleekirk.heroesendgame.entity.doom;

import com.kirkleekirk.heroesendgame.compat.FsangCompat;
import com.kirkleekirk.heroesendgame.entity.BossStats;
import com.kirkleekirk.heroesendgame.entity.EndgameBoss;
import com.kirkleekirk.heroesendgame.entity.ability.BossAbility;
import com.kirkleekirk.heroesendgame.entity.ability.DampenPulseAbility;
import com.kirkleekirk.heroesendgame.entity.ability.VolleyAbility;
import com.kirkleekirk.heroesendgame.entity.projectile.EnergyBoltEntity;
import com.kirkleekirk.heroesendgame.registry.ModDamageTypes;
import net.minecraft.ChatFormatting;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.resources.ResourceKey;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.BossEvent;
import net.minecraft.world.DifficultyInstance;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.damagesource.DamageType;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.MobSpawnType;
import net.minecraft.world.entity.SpawnGroupData;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.ServerLevelAccessor;
import org.jetbrains.annotations.Nullable;

import java.util.List;

/**
 * A robotic double of Victor von Doom. Doom never risks himself first: his Doombots test a rival, and everything
 * they learn about how you fight is reported back to Latveria (see DoctorDoomEntity's "studied" resistance).
 */
public class DoombotEntity extends EndgameBoss {
    private static final BossStats STATS = new BossStats(160, 6, 12, 20, 0.1F, 14, 0.55);

    public DoombotEntity(EntityType<? extends DoombotEntity> type, Level level) {
        super(type, level);
    }

    public static AttributeSupplier.Builder createAttributes() {
        return EndgameBoss.bossAttributes(160, 6, 0.3, 14);
    }

    @Override
    public BossStats stats() {
        return STATS;
    }

    @Override
    protected String dialogueKey() {
        return "doombot";
    }

    @Override
    protected boolean isFlyer() {
        return true;
    }

    @Override
    protected double preferredRange() {
        return 9.0;
    }

    @Override
    protected BossEvent.BossBarColor bossBarColor() {
        return BossEvent.BossBarColor.GREEN;
    }

    @Override
    protected ChatFormatting nameColor() {
        return ChatFormatting.DARK_GREEN;
    }

    @Override
    protected ResourceKey<DamageType> meleeDamageType() {
        return ModDamageTypes.DOOM_TECH;
    }

    @Override
    protected void registerAbilities(List<BossAbility> abilities) {
        abilities.add(new VolleyAbility(this, 60, 3, 5, EnergyBoltEntity.Variant.TECH, 0.8F, 1.6, false, SoundEvents.BLAZE_SHOOT, 0));
        abilities.add(new VolleyAbility(this, 160, 2, 10, EnergyBoltEntity.Variant.POWER, 1.0F, 0.9, true, SoundEvents.FIREWORK_ROCKET_LAUNCH, 4));
        abilities.add(new DampenPulseAbility(this, 300, 7, FsangCompat.Dampening.TECH, 80, ParticleTypes.ELECTRIC_SPARK,
                SoundEvents.BEACON_DEACTIVATE, p -> true, "emp"));
    }

    @Override
    protected void onDefeated(DamageSource source) {
        sayRandom("destroyed", 2);
        // Self-destruct: loud, bright, harmless to the terrain.
        level().explode(this, getX(), getY() + 1, getZ(), 2.5F, Level.ExplosionInteraction.NONE);
    }

    @Override
    public void playArrival() {
        setFlying(true);
        burst(ParticleTypes.FLAME, 30, 0.6);
        playSound(SoundEvents.FIREWORK_ROCKET_LAUNCH, 2.0F, 0.5F);
        sayRandom("arrival", 2);
    }

    @Override
    public SpawnGroupData finalizeSpawn(ServerLevelAccessor level, DifficultyInstance difficulty, MobSpawnType reason,
                                        @Nullable SpawnGroupData data, @Nullable CompoundTag tag) {
        SpawnGroupData result = super.finalizeSpawn(level, difficulty, reason, data, tag);
        FsangCompat.equipSuit(this, "dr_doom");
        return result;
    }

    @Override
    protected void customServerAiStep() {
        super.customServerAiStep();
        if (isFlying() && tickCount % 3 == 0 && level() instanceof net.minecraft.server.level.ServerLevel serverLevel) {
            serverLevel.sendParticles(ParticleTypes.SMALL_FLAME, getX(), getY(), getZ(), 2, 0.15, 0.05, 0.15, 0.0);
        }
    }
}
