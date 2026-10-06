package com.kirkleekirk.heroesendgame.entity.doom;

import com.kirkleekirk.heroesendgame.compat.FsangCompat;
import com.kirkleekirk.heroesendgame.entity.BossStats;
import com.kirkleekirk.heroesendgame.entity.EndgameBoss;
import com.kirkleekirk.heroesendgame.entity.ability.BeamAbility;
import com.kirkleekirk.heroesendgame.entity.ability.BossAbility;
import com.kirkleekirk.heroesendgame.entity.ability.DampenPulseAbility;
import com.kirkleekirk.heroesendgame.entity.ability.LeapSlamAbility;
import com.kirkleekirk.heroesendgame.entity.ability.SummonAbility;
import com.kirkleekirk.heroesendgame.entity.ability.VolleyAbility;
import com.kirkleekirk.heroesendgame.entity.projectile.EnergyBoltEntity;
import com.kirkleekirk.heroesendgame.nemesis.EndgameSavedData;
import com.kirkleekirk.heroesendgame.nemesis.Nemesis;
import com.kirkleekirk.heroesendgame.registry.ModDamageTypes;
import com.kirkleekirk.heroesendgame.registry.ModEntities;
import com.kirkleekirk.heroesendgame.util.DamageCategory;
import net.minecraft.ChatFormatting;
import net.minecraft.core.particles.DustParticleOptions;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.tags.DamageTypeTags;
import net.minecraft.world.BossEvent;
import net.minecraft.world.DifficultyInstance;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.damagesource.DamageType;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.MobSpawnType;
import net.minecraft.world.entity.SpawnGroupData;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.ServerLevelAccessor;
import org.jetbrains.annotations.Nullable;
import org.joml.Vector3f;

import java.util.List;
import java.util.UUID;

/**
 * Victor von Doom, monarch of Latveria, master of science and sorcery.
 * <ul>
 *     <li>Force field: soaks damage until broken, recharges if left alone. Lightning overloads it.</li>
 *     <li>Studied: resists whatever kind of damage you used most on his Doombots.</li>
 *     <li>EMP (FSang tech dampening), mystic bolts, demons, electric gauntlets.</li>
 *     <li>Power siphon: a long channel - interrupt it or he steals your powers (FSang full suppression) and grows stronger.</li>
 *     <li>Below a third of his health he becomes God Emperor Doom.</li>
 * </ul>
 */
public class DoctorDoomEntity extends EndgameBoss {
    private static final BossStats STATS = new BossStats(950, 13, 7, 100, 0.05F, 22, 0.3);
    private float shield;
    private int shieldRecharge;
    @Nullable
    private DamageCategory studied;
    private int empowered;

    public DoctorDoomEntity(EntityType<? extends DoctorDoomEntity> type, Level level) {
        super(type, level);
    }

    public static AttributeSupplier.Builder createAttributes() {
        return EndgameBoss.bossAttributes(950, 13, 0.3, 22);
    }

    @Override
    public BossStats stats() {
        return STATS;
    }

    @Override
    protected String dialogueKey() {
        return "doom";
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
    protected boolean darkenSky() {
        return true;
    }

    @Override
    protected double preferredRange() {
        return 7.0;
    }

    @Override
    protected ResourceKey<DamageType> meleeDamageType() {
        return ModDamageTypes.DOOM_TECH;
    }

    @Override
    protected float damageMultiplier() {
        return 1.0F + (getPhase() >= 2 ? 0.2F : 0.0F) + (empowered > 0 ? 0.3F : 0.0F);
    }

    @Override
    public void setupFor(@Nullable ServerPlayer target, @Nullable Nemesis nemesis, @Nullable UUID encounterId, int players,
                         float healthFraction, int encounterLevel) {
        super.setupFor(target, nemesis, encounterId, players, healthFraction, encounterLevel);
        shield = maxShield();
        if (target != null) {
            String favourite = EndgameSavedData.get(target.server).player(target.getUUID()).favouriteDamageCategory();
            studied = favourite == null ? null : DamageCategory.byKey(favourite);
        }
    }

    private float maxShield() {
        return (float) effectiveMaxHealth() * 0.25F;
    }

    @Override
    protected float[] phaseThresholds() {
        return new float[]{0.66F, 0.33F};
    }

    @Override
    protected void onPhaseChange(int phase) {
        if (phase == 1) {
            say("phase_sorcery");
        } else {
            say("phase_god");
            playSound(SoundEvents.WITHER_SPAWN, 2.0F, 1.2F);
            burst(ParticleTypes.TOTEM_OF_UNDYING, 80, 1.5);
            FsangCompat.equipSuit(this, "dr_doom_god");
            shield = maxShield();
        }
    }

    @Override
    protected void registerAbilities(List<BossAbility> abilities) {
        DustParticleOptions green = new DustParticleOptions(new Vector3f(0.2F, 1.0F, 0.4F), 1.4F);
        abilities.add(new VolleyAbility(this, 80, 3, 6, EnergyBoltEntity.Variant.MYSTIC, 0.9F, 0.9, true, SoundEvents.EVOKER_CAST_SPELL, 0));
        abilities.add(new VolleyAbility(this, 70, 4, 3, EnergyBoltEntity.Variant.TECH, 0.7F, 1.8, false, SoundEvents.BLAZE_SHOOT, 3));
        abilities.add(new BeamAbility(this, 180, 10, 30, 11, 0.35F, ModDamageTypes.DOOM_TECH, ParticleTypes.ELECTRIC_SPARK, SoundEvents.BEACON_AMBIENT));
        abilities.add(new DampenPulseAbility(this, 320, 11, FsangCompat.Dampening.TECH, 140, ParticleTypes.ELECTRIC_SPARK,
                SoundEvents.BEACON_DEACTIVATE, p -> true, "emp"));
        abilities.add(new SummonAbility(this, 500, ModEntities.MINDLESS_ONE::get, 2, 2, green, 1));
        abilities.add(new LeapSlamAbility(this, 260, 5.0, 1.2F, ModDamageTypes.DOOM_TECH));
        abilities.add(new SiphonAbility(this));
    }

    // ---------------------------------------------------------------------------------------------------------------
    // Force field and adaptation
    // ---------------------------------------------------------------------------------------------------------------

    @Override
    protected float modifyIncomingDamage(DamageSource source, float amount) {
        DamageCategory category = DamageCategory.of(source);
        if (studied != null && category == studied) {
            amount *= 0.5F;
            if (random.nextInt(6) == 0) {
                say("studied_hit");
            }
        }
        SiphonAbility siphon = ability(SiphonAbility.class);
        if (siphon != null && getActiveAbility() == siphon) {
            siphon.interruptDamage += amount;
        }
        shieldRecharge = 120;
        if (shield > 0) {
            float toShield = source.is(DamageTypeTags.IS_LIGHTNING) ? amount * 3.0F : amount;
            shield -= toShield;
            if (level() instanceof ServerLevel serverLevel) {
                serverLevel.sendParticles(ParticleTypes.END_ROD, getX(), getY() + 1, getZ(), 8, 0.6, 0.9, 0.6, 0.05);
            }
            if (shield <= 0) {
                shield = 0;
                say("shield_down");
                playSound(SoundEvents.GLASS_BREAK, 2.0F, 0.6F);
            } else {
                playSound(SoundEvents.SHIELD_BLOCK, 1.0F, 1.4F);
            }
            return 0.0F;
        }
        return amount;
    }

    @Override
    protected void customServerAiStep() {
        super.customServerAiStep();
        if (empowered > 0) {
            empowered--;
            if (empowered % 5 == 0) {
                burst(ParticleTypes.ENCHANT, 6, 1.0);
            }
        }
        if (shieldRecharge > 0) {
            shieldRecharge--;
        } else if (shield < maxShield()) {
            shield = Math.min(maxShield(), shield + maxShield() * 0.02F);
            if (shield >= maxShield()) {
                say("shield_up");
            }
        }
    }

    @Override
    protected Component bossBarName() {
        Component name = getDisplayName();
        if (shield > 0) {
            name = name.copy().append(Component.literal(" [")
                    .append(Component.translatable("boss.heroes_endgame.doom.force_field", Math.round(100 * shield / Math.max(1, maxShield()))))
                    .append("]").withStyle(ChatFormatting.AQUA));
        }
        return name;
    }

    @Override
    public void playArrival() {
        burst(ParticleTypes.ENCHANT, 120, 1.5);
        burst(ParticleTypes.END_ROD, 40, 1.0);
        playSound(SoundEvents.BEACON_ACTIVATE, 2.0F, 0.6F);
        sayRandom("arrival", 2);
        if (studied != null) {
            say("studied", studied.displayName());
        }
    }

    @Override
    protected void onDefeated(DamageSource source) {
        say("defeat");
        burst(ParticleTypes.END_ROD, 60, 1.0);
    }

    @Override
    public SpawnGroupData finalizeSpawn(ServerLevelAccessor level, DifficultyInstance difficulty, MobSpawnType reason,
                                        @Nullable SpawnGroupData data, @Nullable CompoundTag tag) {
        SpawnGroupData result = super.finalizeSpawn(level, difficulty, reason, data, tag);
        FsangCompat.equipSuit(this, "dr_doom");
        shield = maxShield();
        return result;
    }

    @Override
    public void addAdditionalSaveData(CompoundTag tag) {
        super.addAdditionalSaveData(tag);
        tag.putFloat("Shield", shield);
        if (studied != null) {
            tag.putString("Studied", studied.key());
        }
    }

    @Override
    public void readAdditionalSaveData(CompoundTag tag) {
        super.readAdditionalSaveData(tag);
        shield = tag.getFloat("Shield");
        studied = tag.contains("Studied") ? DamageCategory.byKey(tag.getString("Studied")) : null;
    }

    /**
     * Doom stole the Power Cosmic from the Silver Surfer and the power of the Beyonders. He tries the same with you.
     */
    static class SiphonAbility extends BossAbility {
        float interruptDamage;

        SiphonAbility(EndgameBoss boss) {
            super(boss);
        }

        @Override
        public int cooldownTicks() {
            return 500;
        }

        @Override
        public int weight() {
            return 14;
        }

        @Override
        public boolean canUse(LivingEntity target) {
            return boss.getPhase() >= 1 && boss.distanceTo(target) < 20 && boss.hasLineOfSight(target);
        }

        @Override
        public int castPose() {
            return POSE_BEAM;
        }

        @Override
        public void start(LivingEntity target) {
            interruptDamage = 0;
            ((DoctorDoomEntity) boss).say("siphon_start");
            boss.playSound(SoundEvents.BEACON_POWER_SELECT, 2.0F, 0.5F);
        }

        @Override
        public boolean tick(LivingEntity target) {
            DoctorDoomEntity doom = (DoctorDoomEntity) boss;
            boss.getLookControl().setLookAt(target, 90, 90);
            if (boss.level() instanceof ServerLevel level) {
                var from = boss.getEyePosition();
                var to = target.getBoundingBox().getCenter();
                for (int i = 0; i < 16; i++) {
                    var p = from.lerp(to, i / 16.0);
                    level.sendParticles(ParticleTypes.ENCHANT, p.x, p.y, p.z, 1, 0.05, 0.05, 0.05, 0.0);
                }
            }
            if (interruptDamage >= boss.effectiveMaxHealth() * 0.04) {
                doom.say("siphon_interrupted");
                boss.playSound(SoundEvents.ITEM_BREAK, 2.0F, 0.6F);
                return false;
            }
            if (ticks >= 70) {
                FsangCompat.dampen(target, FsangCompat.Dampening.ALL, 200);
                boss.heal(boss.getMaxHealth() * 0.2F);
                doom.empowered = 400;
                doom.say("siphon_success");
                boss.playSound(SoundEvents.WITHER_AMBIENT, 2.0F, 0.6F);
                return false;
            }
            return true;
        }
    }
}
