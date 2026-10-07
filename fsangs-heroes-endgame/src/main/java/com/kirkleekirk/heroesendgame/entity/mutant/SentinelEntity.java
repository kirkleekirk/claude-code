package com.kirkleekirk.heroesendgame.entity.mutant;

import com.kirkleekirk.heroesendgame.compat.FsangCompat;
import com.kirkleekirk.heroesendgame.entity.BossStats;
import com.kirkleekirk.heroesendgame.entity.EndgameBoss;
import com.kirkleekirk.heroesendgame.entity.ability.BeamAbility;
import com.kirkleekirk.heroesendgame.entity.ability.BossAbility;
import com.kirkleekirk.heroesendgame.entity.ability.DampenPulseAbility;
import com.kirkleekirk.heroesendgame.entity.ability.GrabSlamAbility;
import com.kirkleekirk.heroesendgame.entity.ability.VolleyAbility;
import com.kirkleekirk.heroesendgame.entity.projectile.EnergyBoltEntity;
import com.kirkleekirk.heroesendgame.nemesis.NemesisDirector;
import com.kirkleekirk.heroesendgame.power.PowerFamily;
import com.kirkleekirk.heroesendgame.power.PowerProfile;
import com.kirkleekirk.heroesendgame.registry.ModDamageTypes;
import com.kirkleekirk.heroesendgame.util.DamageCategory;
import net.minecraft.ChatFormatting;
import net.minecraft.core.particles.DustParticleOptions;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.BossEvent;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.damagesource.DamageType;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.level.Level;
import org.jetbrains.annotations.Nullable;
import org.joml.Vector3f;

import java.util.EnumSet;
import java.util.List;
import java.util.Set;

/**
 * Bolivar Trask's mutant hunters. They hover out of reach, scan for the X-Gene, shut it down with an inhibitor
 * field (FSang's genetic dampening), and their plating adapts if you keep hitting them the same way.
 */
public class SentinelEntity extends EndgameBoss {
    private static final BossStats STATS = new BossStats(520, 11, 9, 50, 0.07F, 18, 0.45);
    protected static final DustParticleOptions RED = new DustParticleOptions(new Vector3f(1.0F, 0.2F, 0.3F), 1.5F);
    @Nullable
    private DamageCategory lastCategory;
    private int streak;
    private final Set<DamageCategory> adapted = EnumSet.noneOf(DamageCategory.class);

    public SentinelEntity(EntityType<? extends SentinelEntity> type, Level level) {
        super(type, level);
    }

    public static AttributeSupplier.Builder createAttributes() {
        return EndgameBoss.bossAttributes(520, 11, 0.25, 18);
    }

    @Override
    public BossStats stats() {
        return STATS;
    }

    @Override
    protected String dialogueKey() {
        return "sentinel";
    }

    @Override
    protected boolean isFlyer() {
        return true;
    }

    @Override
    protected double preferredRange() {
        return 10.0;
    }

    @Override
    public float renderScale() {
        return 2.5F;
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
    protected ResourceKey<DamageType> meleeDamageType() {
        return ModDamageTypes.SENTINEL;
    }

    protected static boolean isMutant(ServerPlayer player) {
        PowerProfile profile = NemesisDirector.cachedProfile(player);
        return profile != null && profile.is(PowerFamily.MUTANT);
    }

    @Override
    protected void registerAbilities(List<BossAbility> abilities) {
        abilities.add(new BeamAbility(this, 160, 20, 40, 28, 0.45F, ModDamageTypes.SENTINEL, RED, SoundEvents.GUARDIAN_ATTACK)
                .onHit(victim -> {
                    if (victim instanceof ServerPlayer player && isMutant(player)) {
                        FsangCompat.dampen(player, FsangCompat.Dampening.GENETIC, 60);
                    }
                }));
        abilities.add(new VolleyAbility(this, 70, 2, 8, EnergyBoltEntity.Variant.SENTINEL, 0.9F, 1.4, false, SoundEvents.BLAZE_SHOOT, 0));
        abilities.add(new DampenPulseAbility(this, 360, 14, FsangCompat.Dampening.GENETIC, 160, RED, SoundEvents.BEACON_DEACTIVATE,
                SentinelEntity::isMutant, "inhibitor"));
        abilities.add(new GrabSlamAbility(this, 300, 1.4F, ModDamageTypes.SENTINEL, 20));
    }

    /** Adaptive plating: the same kind of attack three times in a row stops working as well. */
    @Override
    protected float modifyIncomingDamage(DamageSource source, float amount) {
        DamageCategory category = DamageCategory.of(source);
        if (category == lastCategory) {
            streak++;
        } else {
            streak = 0;
            lastCategory = category;
        }
        if (streak >= 3 && adapted.add(category)) {
            say("adapted", category.displayName());
            burst(ParticleTypes.ENCHANTED_HIT, 20, 1.0);
        }
        return adapted.contains(category) ? amount * 0.5F : amount;
    }

    @Override
    protected void customServerAiStep() {
        super.customServerAiStep();
        // Mutants get scanned first.
        if (tickCount % 40 == 0 && level() instanceof ServerLevel level) {
            LivingEntity target = getTarget();
            if (!(target instanceof ServerPlayer current && isMutant(current))) {
                for (ServerPlayer player : playersInRange(48)) {
                    if (isMutant(player)) {
                        setTarget(player);
                        break;
                    }
                }
            }
            level.sendParticles(RED, getX(), getEyeY(), getZ(), 2, 0.2, 0.1, 0.2, 0.0);
        }
    }

    @Override
    public void playArrival() {
        setFlying(true);
        burst(ParticleTypes.FLAME, 40, 0.8);
        playSound(SoundEvents.FIREWORK_ROCKET_LARGE_BLAST_FAR, 3.0F, 0.4F);
        say("arrival");
    }
}
