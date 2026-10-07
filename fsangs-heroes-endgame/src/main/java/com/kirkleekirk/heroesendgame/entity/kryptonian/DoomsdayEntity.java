package com.kirkleekirk.heroesendgame.entity.kryptonian;

import com.kirkleekirk.heroesendgame.compat.FsangCompat;
import com.kirkleekirk.heroesendgame.config.EndgameConfig;
import com.kirkleekirk.heroesendgame.entity.BossStats;
import com.kirkleekirk.heroesendgame.entity.EndgameBoss;
import com.kirkleekirk.heroesendgame.entity.ability.BossAbility;
import com.kirkleekirk.heroesendgame.entity.ability.ChargeAbility;
import com.kirkleekirk.heroesendgame.entity.ability.LeapSlamAbility;
import com.kirkleekirk.heroesendgame.entity.ability.ShockwaveAbility;
import com.kirkleekirk.heroesendgame.entity.ability.VolleyAbility;
import com.kirkleekirk.heroesendgame.entity.projectile.EnergyBoltEntity;
import com.kirkleekirk.heroesendgame.registry.ModDamageTypes;
import com.kirkleekirk.heroesendgame.util.DamageCategory;
import net.minecraft.ChatFormatting;
import net.minecraft.core.particles.BlockParticleOption;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.resources.ResourceKey;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.BossEvent;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.damagesource.DamageType;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LightningBolt;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Blocks;
import net.minecraftforge.registries.ForgeRegistries;

import java.util.EnumMap;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Doomsday - the creature that killed Superman, created on prehistoric Krypton by being killed and cloned over and
 * over until it could not die.
 * <ul>
 *     <li>Reactive evolution: every hit of a kind of damage makes him more resistant to that kind. Mix it up.</li>
 *     <li>He comes back from death once (configurable), stronger and immune to whatever killed him.</li>
 *     <li>Bone spikes punish punching him.</li>
 *     <li>Kryptonite (FSang's kryptonite weapons) bypasses his adaptation - like the spear in Batman v Superman.</li>
 * </ul>
 */
public class DoomsdayEntity extends EndgameBoss {
    private static final BossStats STATS = new BossStats(1100, 15, 7, 100, 0.05F, 24, 0.32);
    private final Map<DamageCategory, Float> adaptation = new EnumMap<>(DamageCategory.class);
    private final Set<DamageCategory> immunities = EnumSet.noneOf(DamageCategory.class);
    private int resurrections;
    private float rage;

    public DoomsdayEntity(EntityType<? extends DoomsdayEntity> type, Level level) {
        super(type, level);
        this.resurrections = -1;
    }

    public static AttributeSupplier.Builder createAttributes() {
        return EndgameBoss.bossAttributes(1100, 15, 0.32, 24).add(Attributes.KNOCKBACK_RESISTANCE, 1.0);
    }

    @Override
    public BossStats stats() {
        return STATS;
    }

    @Override
    protected String dialogueKey() {
        return "doomsday";
    }

    @Override
    protected BossEvent.BossBarColor bossBarColor() {
        return BossEvent.BossBarColor.WHITE;
    }

    @Override
    protected ChatFormatting nameColor() {
        return ChatFormatting.GRAY;
    }

    @Override
    protected boolean darkenSky() {
        return true;
    }

    @Override
    public float renderScale() {
        return 1.5F;
    }

    @Override
    protected ResourceKey<DamageType> meleeDamageType() {
        return ModDamageTypes.DOOMSDAY;
    }

    @Override
    protected double meleeKnockback() {
        return 1.8;
    }

    @Override
    protected float meleePower() {
        return 1.3F;
    }

    @Override
    protected float damageMultiplier() {
        return 1.0F + rage;
    }

    @Override
    protected void registerAbilities(List<BossAbility> abilities) {
        abilities.add(new LeapSlamAbility(this, 180, 6.0, 1.6F, ModDamageTypes.DOOMSDAY));
        abilities.add(new ChargeAbility(this, 200, 1.0, 1.7F, ModDamageTypes.DOOMSDAY, 12));
        abilities.add(new ShockwaveAbility(this, 160, 14, 7.0, 1.3F, ModDamageTypes.DOOMSDAY, 1.8, 0.7,
                ParticleTypes.CRIT, SoundEvents.GENERIC_EXPLODE, POSE_SLAM));
        abilities.add(new VolleyAbility(this, 220, 2, 15, EnergyBoltEntity.Variant.TELEKINETIC, 1.4F, 1.2, false, SoundEvents.RAVAGER_ATTACK, 6));
    }

    private boolean isKryptonite(DamageSource source) {
        Entity attacker = source.getEntity();
        if (attacker instanceof LivingEntity living && (FsangCompat.isKryptonite(living.getMainHandItem()) || FsangCompat.isKryptonite(living.getOffhandItem()))) {
            return true;
        }
        Entity direct = source.getDirectEntity();
        if (direct != null) {
            ResourceLocation type = ForgeRegistries.ENTITY_TYPES.getKey(direct.getType());
            return type != null && type.getPath().contains("kryptonite");
        }
        return false;
    }

    @Override
    protected float modifyIncomingDamage(DamageSource source, float amount) {
        DamageCategory category = DamageCategory.of(source);
        if (isKryptonite(source)) {
            if (random.nextInt(4) == 0) {
                say("kryptonite");
            }
            return amount * 1.5F;
        }
        if (immunities.contains(category)) {
            if (random.nextInt(5) == 0) {
                say("immune", category.displayName());
            }
            burst(ParticleTypes.CRIT, 6, 0.6);
            return 0.0F;
        }
        float resistance = adaptation.getOrDefault(category, 0.0F);
        float max = EndgameConfig.DOOMSDAY_MAX_ADAPTATION.get().floatValue();
        float next = Math.min(max, resistance + EndgameConfig.DOOMSDAY_ADAPTATION_PER_HIT.get().floatValue());
        adaptation.put(category, next);
        if ((int) (resistance * 4) < (int) (next * 4)) {
            say("adapt", category.displayName(), Math.round(next * 100));
            burst(ParticleTypes.CRIT, 20, 1.0);
        }
        // Bone spikes
        if (category == DamageCategory.MELEE && source.getEntity() instanceof LivingEntity attacker && attacker.distanceToSqr(this) < 16) {
            strike(attacker, 0.2F, ModDamageTypes.DOOMSDAY);
        }
        return amount * (1.0F - resistance);
    }

    @Override
    protected boolean preventDeath(DamageSource source) {
        if (resurrections < 0) {
            resurrections = EndgameConfig.DOOMSDAY_RESURRECTIONS.get();
        }
        if (resurrections <= 0) {
            return false;
        }
        resurrections--;
        DamageCategory killer = DamageCategory.of(source);
        if (!isKryptonite(source)) {
            immunities.add(killer);
        }
        rage += 0.3F;
        setHealth(getMaxHealth());
        interruptAbility();
        if (level() instanceof ServerLevel serverLevel) {
            LightningBolt bolt = EntityType.LIGHTNING_BOLT.create(serverLevel);
            if (bolt != null) {
                bolt.moveTo(getX(), getY(), getZ());
                bolt.setVisualOnly(true);
                serverLevel.addFreshEntity(bolt);
            }
            serverLevel.sendParticles(ParticleTypes.EXPLOSION_EMITTER, getX(), getY() + 1, getZ(), 2, 0.5, 0.5, 0.5, 0);
        }
        playSound(SoundEvents.WARDEN_ROAR, 4.0F, 0.5F);
        say("resurrect", killer.displayName());
        return true;
    }

    @Override
    public void playArrival() {
        if (level() instanceof ServerLevel serverLevel) {
            serverLevel.sendParticles(new BlockParticleOption(ParticleTypes.BLOCK, Blocks.STONE.defaultBlockState()),
                    getX(), getY() + 0.5, getZ(), 200, 1.5, 1.0, 1.5, 0.3);
            serverLevel.sendParticles(ParticleTypes.EXPLOSION_EMITTER, getX(), getY(), getZ(), 1, 0, 0, 0, 0);
        }
        playSound(SoundEvents.GENERIC_EXPLODE, 3.0F, 0.5F);
        playSound(SoundEvents.WARDEN_ROAR, 4.0F, 0.6F);
        say("arrival");
    }

    @Override
    public void addAdditionalSaveData(CompoundTag tag) {
        super.addAdditionalSaveData(tag);
        CompoundTag adapt = new CompoundTag();
        adaptation.forEach((category, value) -> adapt.putFloat(category.key(), value));
        tag.put("Adaptation", adapt);
        StringBuilder immune = new StringBuilder();
        for (DamageCategory category : immunities) {
            immune.append(category.key()).append(',');
        }
        tag.putString("Immunities", immune.toString());
        tag.putInt("Resurrections", resurrections);
        tag.putFloat("Rage", rage);
    }

    @Override
    public void readAdditionalSaveData(CompoundTag tag) {
        super.readAdditionalSaveData(tag);
        CompoundTag adapt = tag.getCompound("Adaptation");
        for (String key : adapt.getAllKeys()) {
            DamageCategory category = DamageCategory.byKey(key);
            if (category != null) {
                adaptation.put(category, adapt.getFloat(key));
            }
        }
        for (String key : tag.getString("Immunities").split(",")) {
            DamageCategory category = DamageCategory.byKey(key);
            if (category != null) {
                immunities.add(category);
            }
        }
        resurrections = tag.contains("Resurrections") ? tag.getInt("Resurrections") : -1;
        rage = tag.getFloat("Rage");
    }
}
