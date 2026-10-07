package com.kirkleekirk.heroesendgame.entity.projectile;

import com.kirkleekirk.heroesendgame.compat.FsangCompat;
import com.kirkleekirk.heroesendgame.entity.EndgameBoss;
import com.kirkleekirk.heroesendgame.registry.ModDamageTypes;
import com.kirkleekirk.heroesendgame.registry.ModEffects;
import com.kirkleekirk.heroesendgame.registry.ModEntities;
import net.minecraft.core.particles.DustParticleOptions;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.damagesource.DamageType;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.entity.projectile.Projectile;
import net.minecraft.world.entity.projectile.ProjectileUtil;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.EntityHitResult;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;
import net.minecraftforge.event.ForgeEventFactory;
import org.jetbrains.annotations.Nullable;
import org.joml.Vector3f;

import java.util.UUID;

/**
 * Every ranged nemesis attack: Doom's mystic bolts, Chitauri rifles, Sentinel palm blasts, Proxima's spear,
 * Loki's scepter, Ghost Rider's hellfire... Damage is solved by the shooter ({@link EndgameBoss#strike}).
 */
public class EnergyBoltEntity extends Projectile {
    private static final EntityDataAccessor<Integer> DATA_VARIANT = SynchedEntityData.defineId(EnergyBoltEntity.class, EntityDataSerializers.INT);

    public enum Variant {
        MYSTIC(0x39FF6A, ModDamageTypes.DOOM_SORCERY),
        TECH(0xFFF2A8, ModDamageTypes.DOOM_TECH),
        CHITAURI(0x3FA9FF, ModDamageTypes.NEMESIS),
        POWER(0xA020F0, ModDamageTypes.INFINITY),
        SENTINEL(0xFF3355, ModDamageTypes.SENTINEL),
        SPEAR(0x66CCFF, ModDamageTypes.NEMESIS),
        HELLFIRE(0xFF6A00, ModDamageTypes.HELLFIRE),
        TELEKINETIC(0xBBBBBB, ModDamageTypes.TELEKINESIS),
        DARK(0x7A1FC2, ModDamageTypes.DARK_DIMENSION),
        SCEPTER(0xFFD21F, ModDamageTypes.INFINITY),
        SPEED(0x2F7FFF, ModDamageTypes.SPEED_FORCE);

        private final int color;
        private final ResourceKey<DamageType> damageType;

        Variant(int color, ResourceKey<DamageType> damageType) {
            this.color = color;
            this.damageType = damageType;
        }

        public int color() {
            return color;
        }

        public ResourceKey<DamageType> damageType() {
            return damageType;
        }

        public static Variant byId(int id) {
            Variant[] values = values();
            return id >= 0 && id < values.length ? values[id] : MYSTIC;
        }
    }

    private float power = 1.0F;
    private int life;
    @Nullable
    private UUID homingTarget;
    private double homingStrength = 0.08;

    public EnergyBoltEntity(EntityType<? extends EnergyBoltEntity> type, Level level) {
        super(type, level);
        setNoGravity(true);
    }

    public EnergyBoltEntity(Level level, LivingEntity owner, Variant variant, float power) {
        this(ModEntities.ENERGY_BOLT.get(), level);
        setOwner(owner);
        setVariant(variant);
        this.power = power;
    }

    @Override
    protected void defineSynchedData() {
        this.entityData.define(DATA_VARIANT, 0);
    }

    public Variant getVariant() {
        return Variant.byId(entityData.get(DATA_VARIANT));
    }

    public void setVariant(Variant variant) {
        entityData.set(DATA_VARIANT, variant.ordinal());
    }

    public void setHomingTarget(Entity target) {
        this.homingTarget = target.getUUID();
    }

    public void setHomingStrength(double strength) {
        this.homingStrength = strength;
    }

    @Override
    public void tick() {
        super.tick();
        Vec3 motion = getDeltaMovement();
        if (!level().isClientSide) {
            if (++life > 140) {
                discard();
                return;
            }
            if (homingTarget != null && level() instanceof ServerLevel serverLevel) {
                Entity target = serverLevel.getEntity(homingTarget);
                if (target != null && target.isAlive()) {
                    Vec3 to = target.getBoundingBox().getCenter().subtract(position()).normalize();
                    double speed = motion.length();
                    motion = motion.normalize().lerp(to, homingStrength).normalize().scale(speed);
                    setDeltaMovement(motion);
                }
            }
        }

        HitResult hit = ProjectileUtil.getHitResultOnMoveVector(this, this::canHitEntity);
        if (hit.getType() != HitResult.Type.MISS && !ForgeEventFactory.onProjectileImpact(this, hit)) {
            onHit(hit);
        }
        if (isRemoved()) {
            return;
        }
        setPos(getX() + motion.x, getY() + motion.y, getZ() + motion.z);
        ProjectileUtil.rotateTowardsMovement(this, 0.5F);

        if (level().isClientSide) {
            int color = getVariant().color();
            Vector3f rgb = new Vector3f(((color >> 16) & 0xFF) / 255.0F, ((color >> 8) & 0xFF) / 255.0F, (color & 0xFF) / 255.0F);
            for (int i = 0; i < 2; i++) {
                level().addParticle(new DustParticleOptions(rgb, 1.4F), getX() - motion.x * i * 0.5, getY() + 0.2 - motion.y * i * 0.5,
                        getZ() - motion.z * i * 0.5, 0, 0, 0);
            }
            if (getVariant() == Variant.HELLFIRE) {
                level().addParticle(ParticleTypes.SOUL_FIRE_FLAME, getX(), getY() + 0.2, getZ(), 0, 0.02, 0);
            } else if (getVariant() == Variant.SPEED || getVariant() == Variant.TECH) {
                level().addParticle(ParticleTypes.ELECTRIC_SPARK, getX(), getY() + 0.2, getZ(), 0, 0, 0);
            }
        }
    }

    @Override
    protected boolean canHitEntity(Entity entity) {
        return super.canHitEntity(entity) && !(entity instanceof EndgameBoss) && !(entity instanceof EnergyBoltEntity);
    }

    @Override
    protected void onHitEntity(EntityHitResult result) {
        super.onHitEntity(result);
        if (level().isClientSide || !(result.getEntity() instanceof LivingEntity target)) {
            return;
        }
        Entity owner = getOwner();
        boolean hurt;
        if (owner instanceof EndgameBoss boss) {
            hurt = boss.strike(target, power, getVariant().damageType(), this);
        } else {
            hurt = target.hurt(ModDamageTypes.source(level(), getVariant().damageType(), this, owner), 6.0F * power);
        }
        if (hurt) {
            applyEffect(target, owner);
        }
        impact();
    }

    @Override
    protected void onHitBlock(BlockHitResult result) {
        super.onHitBlock(result);
        if (!level().isClientSide) {
            impact();
        }
    }

    private void impact() {
        if (level() instanceof ServerLevel serverLevel) {
            int color = getVariant().color();
            Vector3f rgb = new Vector3f(((color >> 16) & 0xFF) / 255.0F, ((color >> 8) & 0xFF) / 255.0F, (color & 0xFF) / 255.0F);
            serverLevel.sendParticles(new DustParticleOptions(rgb, 2.0F), getX(), getY(), getZ(), 12, 0.3, 0.3, 0.3, 0.1);
            if (getVariant() == Variant.POWER) {
                serverLevel.sendParticles(ParticleTypes.EXPLOSION, getX(), getY(), getZ(), 1, 0, 0, 0, 0);
            }
        }
        discard();
    }

    private void applyEffect(LivingEntity target, @Nullable Entity owner) {
        switch (getVariant()) {
            case SCEPTER -> {
                if (target instanceof Player) {
                    FsangCompat.applyMindControl(target, 60);
                } else if (target instanceof Mob mob && owner instanceof EndgameBoss boss && boss.getTarget() != null) {
                    // Loki's thralls turn on the heroes.
                    mob.setTarget(boss.getTarget());
                }
            }
            case HELLFIRE -> target.addEffect(new MobEffectInstance(ModEffects.HELLFIRE.get(), 100, 0));
            case SENTINEL -> FsangCompat.dampen(target, FsangCompat.Dampening.GENETIC, 100);
            case TECH -> {
                if (random.nextFloat() < 0.25F) {
                    FsangCompat.dampen(target, FsangCompat.Dampening.TECH, 60);
                }
            }
            case SPEAR -> target.addEffect(new MobEffectInstance(MobEffects.WEAKNESS, 80, 0));
            case DARK -> target.addEffect(new MobEffectInstance(MobEffects.WITHER, 60, 1));
            case POWER -> {
                Vec3 push = getDeltaMovement().normalize().scale(1.6);
                EndgameBoss.launch(target, target.getDeltaMovement().add(push.x, 0.5, push.z));
            }
            case TELEKINETIC -> target.addEffect(new MobEffectInstance(MobEffects.LEVITATION, 20, 1));
            case SPEED -> FsangCompat.dampen(target, FsangCompat.Dampening.SPEED, 40);
            case MYSTIC -> target.addEffect(new MobEffectInstance(MobEffects.MOVEMENT_SLOWDOWN, 40, 1));
            default -> {
            }
        }
    }

    @Override
    public boolean isPickable() {
        return false;
    }

    @Override
    public boolean hurt(net.minecraft.world.damagesource.DamageSource source, float amount) {
        return false;
    }

    @Override
    protected void addAdditionalSaveData(CompoundTag tag) {
        super.addAdditionalSaveData(tag);
        tag.putInt("Variant", getVariant().ordinal());
        tag.putFloat("Power", power);
        tag.putInt("Life", life);
    }

    @Override
    protected void readAdditionalSaveData(CompoundTag tag) {
        super.readAdditionalSaveData(tag);
        setVariant(Variant.byId(tag.getInt("Variant")));
        power = tag.getFloat("Power");
        life = tag.getInt("Life");
    }
}
