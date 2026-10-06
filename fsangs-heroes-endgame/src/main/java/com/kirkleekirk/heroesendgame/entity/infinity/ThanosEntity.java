package com.kirkleekirk.heroesendgame.entity.infinity;

import com.kirkleekirk.heroesendgame.compat.FsangCompat;
import com.kirkleekirk.heroesendgame.entity.BossStats;
import com.kirkleekirk.heroesendgame.entity.EndgameBoss;
import com.kirkleekirk.heroesendgame.entity.ability.BeamAbility;
import com.kirkleekirk.heroesendgame.entity.ability.BlinkStrikeAbility;
import com.kirkleekirk.heroesendgame.entity.ability.BossAbility;
import com.kirkleekirk.heroesendgame.entity.ability.ChargeAbility;
import com.kirkleekirk.heroesendgame.entity.ability.ConditionalAbility;
import com.kirkleekirk.heroesendgame.entity.ability.DampenPulseAbility;
import com.kirkleekirk.heroesendgame.entity.ability.LeapSlamAbility;
import com.kirkleekirk.heroesendgame.entity.ability.ShockwaveAbility;
import com.kirkleekirk.heroesendgame.entity.projectile.EnergyBoltEntity;
import com.kirkleekirk.heroesendgame.infinity.InfinityCampaign;
import com.kirkleekirk.heroesendgame.infinity.InfinityState;
import com.kirkleekirk.heroesendgame.infinity.InfinityStone;
import com.kirkleekirk.heroesendgame.item.InfinityGauntletItem;
import com.kirkleekirk.heroesendgame.registry.ModDamageTypes;
import com.kirkleekirk.heroesendgame.registry.ModItems;
import com.kirkleekirk.heroesendgame.util.Messages;
import net.minecraft.ChatFormatting;
import net.minecraft.core.particles.DustParticleOptions;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.chat.Component;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.BossEvent;
import net.minecraft.world.DifficultyInstance;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.MobSpawnType;
import net.minecraft.world.entity.SpawnGroupData;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.entity.monster.Enemy;
import net.minecraft.world.entity.projectile.Projectile;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.ServerLevelAccessor;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;
import org.joml.Vector3f;

import java.util.EnumSet;
import java.util.List;
import java.util.Set;

/**
 * The Mad Titan. His abilities depend on which Infinity Stones he has collected by the time he comes for you:
 * Power (beam, shockwave), Space (portals, moon shower), Reality (projectiles turn to bubbles, power suppression),
 * Soul (life drain), Time (rewinds his own wounds once), Mind (mind control) - and with all six, the Snap.
 */
public class ThanosEntity extends EndgameBoss implements InfinityVillain {
    private static final EntityDataAccessor<Integer> DATA_STONES = SynchedEntityData.defineId(ThanosEntity.class, EntityDataSerializers.INT);
    private static final BossStats STATS = new BossStats(1200, 16, 6, 110, 0.045F, 20, 0.3);

    private boolean timeRewindUsed;
    private int rewindTicks;
    private boolean snapUsed;
    private int snapChannel = -1;
    private float snapDamage;
    private int stunned;

    public ThanosEntity(EntityType<? extends ThanosEntity> type, Level level) {
        super(type, level);
    }

    public static AttributeSupplier.Builder createAttributes() {
        return EndgameBoss.bossAttributes(1200, 16, 0.3, 20);
    }

    @Override
    protected void defineSynchedData() {
        super.defineSynchedData();
        this.entityData.define(DATA_STONES, 0);
    }

    @Override
    public BossStats stats() {
        return STATS;
    }

    @Override
    protected String dialogueKey() {
        return "thanos";
    }

    @Override
    protected BossEvent.BossBarColor bossBarColor() {
        return BossEvent.BossBarColor.PURPLE;
    }

    @Override
    protected ChatFormatting nameColor() {
        return ChatFormatting.LIGHT_PURPLE;
    }

    @Override
    protected boolean darkenSky() {
        return true;
    }

    @Override
    public float renderScale() {
        return 1.4F;
    }

    @Override
    protected float meleePower() {
        return 1.2F;
    }

    @Override
    protected double meleeKnockback() {
        return 1.5;
    }

    @Override
    protected int meleeInterval() {
        return 22;
    }

    // ---------------------------------------------------------------------------------------------------------------
    // Stones
    // ---------------------------------------------------------------------------------------------------------------

    public Set<InfinityStone> getStones() {
        EnumSet<InfinityStone> stones = EnumSet.noneOf(InfinityStone.class);
        int mask = entityData.get(DATA_STONES);
        for (InfinityStone stone : InfinityStone.values()) {
            if ((mask & (1 << stone.ordinal())) != 0) {
                stones.add(stone);
            }
        }
        return stones;
    }

    public boolean has(InfinityStone stone) {
        return (entityData.get(DATA_STONES) & (1 << stone.ordinal())) != 0;
    }

    public void setStones(Set<InfinityStone> stones) {
        int mask = 0;
        for (InfinityStone stone : stones) {
            mask |= 1 << stone.ordinal();
        }
        entityData.set(DATA_STONES, mask);
        ItemStack gauntlet = new ItemStack(ModItems.INFINITY_GAUNTLET.get());
        for (InfinityStone stone : stones) {
            InfinityGauntletItem.insertStone(gauntlet, stone);
        }
        setItemSlot(EquipmentSlot.MAINHAND, gauntlet);
        setDropChance(EquipmentSlot.MAINHAND, 0.0F);
    }

    @Override
    public void loadStones(InfinityCampaign campaign) {
        EnumSet<InfinityStone> stones = EnumSet.noneOf(InfinityStone.class);
        for (InfinityStone stone : InfinityStone.values()) {
            if (campaign.owner(stone) == InfinityState.Owner.THANOS) {
                stones.add(stone);
            }
        }
        setStones(stones);
        // Every stone makes him tougher.
        boostHealth(1.0 + 0.1 * stones.size());
    }

    @Override
    protected float damageMultiplier() {
        return 1.0F + 0.08F * getStones().size() + (getPhase() >= 2 ? 0.15F : 0.0F);
    }

    // ---------------------------------------------------------------------------------------------------------------
    // Abilities
    // ---------------------------------------------------------------------------------------------------------------

    @Override
    protected void registerAbilities(List<BossAbility> abilities) {
        abilities.add(new LeapSlamAbility(this, 200, 6.0, 1.5F, ModDamageTypes.NEMESIS));
        abilities.add(new ChargeAbility(this, 220, 0.85, 1.6F, ModDamageTypes.NEMESIS, 16));
        abilities.add(new ShockwaveAbility(this, 160, 16, 6.0, 1.1F, ModDamageTypes.NEMESIS, 1.6, 0.5,
                ParticleTypes.CRIT, SoundEvents.ANVIL_LAND, POSE_SLAM));

        DustParticleOptions purple = new DustParticleOptions(new Vector3f(0.6F, 0.15F, 0.9F), 1.6F);
        DustParticleOptions orange = new DustParticleOptions(new Vector3f(1.0F, 0.55F, 0.1F), 1.6F);

        abilities.add(gated(new BeamAbility(this, 240, 20, 50, 26, 0.45F, ModDamageTypes.INFINITY, purple, SoundEvents.BEACON_AMBIENT), InfinityStone.POWER));
        abilities.add(gated(new ShockwaveAbility(this, 300, 24, 9.0, 1.6F, ModDamageTypes.INFINITY, 2.6, 0.8,
                purple, SoundEvents.GENERIC_EXPLODE, POSE_SLAM), InfinityStone.POWER));
        abilities.add(gated(new BlinkStrikeAbility(this, 180, 1.8F, ModDamageTypes.INFINITY, ParticleTypes.PORTAL, 6), InfinityStone.SPACE));
        abilities.add(gated(new MoonShowerAbility(this), InfinityStone.SPACE));
        abilities.add(gated(new DampenPulseAbility(this, 360, 12, FsangCompat.Dampening.METAPHYSICAL, 140,
                new DustParticleOptions(new Vector3f(0.85F, 0.1F, 0.15F), 1.4F), SoundEvents.ILLUSIONER_PREPARE_BLINDNESS, p -> true, "reality"), InfinityStone.REALITY));
        abilities.add(gated(new BeamAbility(this, 320, 15, 40, 20, 0.35F, ModDamageTypes.INFINITY, orange, SoundEvents.SOUL_ESCAPE)
                .onHit(victim -> heal(getMaxHealth() * 0.025F)), InfinityStone.SOUL));
        abilities.add(gated(new MindControlAbility(this), InfinityStone.MIND));
    }

    private BossAbility gated(BossAbility ability, InfinityStone stone) {
        return new ConditionalAbility(this, ability, () -> has(stone));
    }

    @Override
    public boolean isMovementLocked() {
        return snapChannel >= 0 || stunned > 0 || super.isMovementLocked();
    }

    @Override
    protected float[] phaseThresholds() {
        return new float[]{0.6F, 0.3F};
    }

    @Override
    protected void onPhaseChange(int phase) {
        say(phase == 1 ? "phase_dread" : "phase_inevitable");
        playSound(SoundEvents.WITHER_SPAWN, 2.0F, 0.5F);
    }

    @Override
    protected void customServerAiStep() {
        super.customServerAiStep();
        if (stunned > 0) {
            stunned--;
        }
        float fraction = getHealth() / getMaxHealth();

        // Reality: projectiles turn into bubbles before they reach him.
        if (has(InfinityStone.REALITY) && tickCount % 4 == 0) {
            for (Projectile projectile : level().getEntitiesOfClass(Projectile.class, getBoundingBox().inflate(7),
                    p -> !(p.getOwner() instanceof EndgameBoss) && !(p instanceof EnergyBoltEntity bolt && bolt.getOwner() == this))) {
                if (level() instanceof ServerLevel serverLevel) {
                    serverLevel.sendParticles(ParticleTypes.BUBBLE_POP, projectile.getX(), projectile.getY(), projectile.getZ(), 10, 0.2, 0.2, 0.2, 0.05);
                }
                projectile.discard();
            }
        }

        // Time: once per fight he simply reverses his wounds.
        if (has(InfinityStone.TIME) && !timeRewindUsed && fraction <= 0.3F) {
            timeRewindUsed = true;
            rewindTicks = 40;
            say("time");
            playSound(SoundEvents.BEACON_DEACTIVATE, 2.0F, 0.5F);
        }
        if (rewindTicks > 0) {
            rewindTicks--;
            heal(getMaxHealth() * 0.00875F);
            burst(new DustParticleOptions(new Vector3f(0.1F, 0.8F, 0.3F), 1.5F), 6, 1.0);
        }

        // Six stones: the snap.
        if (getStones().size() == 6 && !snapUsed && snapChannel < 0 && fraction <= 0.2F && getTarget() != null) {
            snapChannel = 80;
            snapDamage = 0;
            interruptAbility();
            setCastPose(POSE_SNAP);
            say("snap_channel");
            playSound(SoundEvents.BEACON_POWER_SELECT, 3.0F, 0.5F);
        }
        if (snapChannel >= 0) {
            tickSnap();
        }
    }

    private void tickSnap() {
        if (level() instanceof ServerLevel serverLevel) {
            for (InfinityStone stone : InfinityStone.values()) {
                int c = stone.color();
                double angle = (tickCount * 0.3) + stone.ordinal() * Math.PI / 3;
                serverLevel.sendParticles(new DustParticleOptions(new Vector3f(((c >> 16) & 255) / 255F, ((c >> 8) & 255) / 255F, (c & 255) / 255F), 1.5F),
                        getX() + Math.cos(angle) * 1.2, getY() + 2.4, getZ() + Math.sin(angle) * 1.2, 1, 0, 0, 0, 0);
            }
        }
        if (snapDamage >= effectiveMaxHealth() * 0.06F) {
            // Someone fought him off the gauntlet in time.
            snapChannel = -1;
            snapUsed = true;
            stunned = 60;
            setCastPose(POSE_NONE);
            say("snap_fail");
            playSound(SoundEvents.ITEM_BREAK, 2.0F, 0.4F);
            return;
        }
        if (--snapChannel <= 0) {
            snapChannel = -1;
            snapUsed = true;
            setCastPose(POSE_NONE);
            say("snap");
            playSound(SoundEvents.LIGHTNING_BOLT_THUNDER, 4.0F, 0.5F);
            for (ServerPlayer player : playersInRange(40)) {
                strike(player, 4.0F, ModDamageTypes.SNAP);
                FsangCompat.dampen(player, FsangCompat.Dampening.ALL, 200);
                Messages.title(player, Component.translatable("message.heroes_endgame.snap.title").withStyle(ChatFormatting.LIGHT_PURPLE),
                        Component.translatable("message.heroes_endgame.snap.subtitle").withStyle(ChatFormatting.GRAY));
            }
        }
    }

    @Override
    protected float modifyIncomingDamage(DamageSource source, float amount) {
        if (snapChannel >= 0) {
            snapDamage += amount;
        }
        return amount;
    }

    @Override
    protected void dropCustomDeathLoot(DamageSource source, int looting, boolean recentlyHit) {
        super.dropCustomDeathLoot(source, looting, recentlyHit);
        // "I used the stones to destroy the stones" - not this time. The gauntlet falls with every stone in it.
        Set<InfinityStone> stones = getStones();
        if (getNemesis() != null && level() instanceof ServerLevel serverLevel) {
            InfinityCampaign campaign = InfinityCampaign.get(serverLevel.getServer());
            for (InfinityStone stone : stones) {
                campaign.markFound(stone, null);
            }
        }
        ItemStack gauntlet = new ItemStack(ModItems.INFINITY_GAUNTLET.get());
        for (InfinityStone stone : stones) {
            InfinityGauntletItem.insertStone(gauntlet, stone);
        }
        spawnAtLocation(gauntlet);
    }

    @Override
    public void playArrival() {
        burst(ParticleTypes.PORTAL, 200, 2.0);
        burst(ParticleTypes.REVERSE_PORTAL, 100, 1.5);
        playSound(SoundEvents.END_PORTAL_SPAWN, 3.0F, 0.5F);
        playSound(SoundEvents.WITHER_SPAWN, 2.0F, 0.6F);
        sayRandom("arrival", 3);
    }

    @Override
    public SpawnGroupData finalizeSpawn(ServerLevelAccessor level, DifficultyInstance difficulty, MobSpawnType reason,
                                        @Nullable SpawnGroupData data, @Nullable CompoundTag tag) {
        SpawnGroupData result = super.finalizeSpawn(level, difficulty, reason, data, tag);
        FsangCompat.equipSuit(this, "thanos_mcu");
        if (getMainHandItem().isEmpty()) {
            setStones(EnumSet.noneOf(InfinityStone.class));
        }
        return result;
    }

    @Override
    public void addAdditionalSaveData(CompoundTag tag) {
        super.addAdditionalSaveData(tag);
        tag.putInt("Stones", entityData.get(DATA_STONES));
        tag.putBoolean("TimeRewindUsed", timeRewindUsed);
        tag.putBoolean("SnapUsed", snapUsed);
    }

    @Override
    public void readAdditionalSaveData(CompoundTag tag) {
        super.readAdditionalSaveData(tag);
        entityData.set(DATA_STONES, tag.getInt("Stones"));
        timeRewindUsed = tag.getBoolean("TimeRewindUsed");
        snapUsed = tag.getBoolean("SnapUsed");
    }

    // ---------------------------------------------------------------------------------------------------------------

    /** Space Stone: pulls a moon's worth of debris down on the battlefield. */
    static class MoonShowerAbility extends BossAbility {
        MoonShowerAbility(EndgameBoss boss) {
            super(boss);
        }

        @Override
        public int cooldownTicks() {
            return 360;
        }

        @Override
        public boolean locksMovement() {
            return false;
        }

        @Override
        public void start(LivingEntity target) {
            ((ThanosEntity) boss).say("moon");
        }

        @Override
        public boolean tick(LivingEntity target) {
            if (ticks % 4 == 0) {
                EnergyBoltEntity rock = new EnergyBoltEntity(boss.level(), boss, EnergyBoltEntity.Variant.POWER, 0.8F);
                double x = target.getX() + (boss.getRandom().nextDouble() - 0.5) * 9;
                double z = target.getZ() + (boss.getRandom().nextDouble() - 0.5) * 9;
                rock.setPos(x, target.getY() + 18, z);
                rock.setDeltaMovement(0, -1.3, 0);
                boss.level().addFreshEntity(rock);
            }
            return ticks < 48;
        }
    }

    /** Mind Stone: heroes lose control of their bodies; monsters nearby turn on them. */
    static class MindControlAbility extends BossAbility {
        MindControlAbility(EndgameBoss boss) {
            super(boss);
        }

        @Override
        public int cooldownTicks() {
            return 400;
        }

        @Override
        public boolean canUse(LivingEntity target) {
            return boss.distanceTo(target) < 14;
        }

        @Override
        public boolean tick(LivingEntity target) {
            if (ticks < 20) {
                boss.burst(new DustParticleOptions(new Vector3f(1.0F, 0.85F, 0.1F), 1.4F), 6, 1.0);
                return true;
            }
            for (ServerPlayer player : boss.playersInRange(14)) {
                FsangCompat.applyMindControl(player, 60);
                player.addEffect(new MobEffectInstance(MobEffects.MOVEMENT_SLOWDOWN, 60, 1));
                for (Mob mob : boss.level().getEntitiesOfClass(Mob.class, player.getBoundingBox().inflate(16),
                        m -> m instanceof Enemy && !(m instanceof EndgameBoss))) {
                    mob.setTarget(player);
                }
            }
            ((ThanosEntity) boss).say("mind");
            boss.playSound(SoundEvents.EVOKER_PREPARE_WOLOLO, 2.0F, 0.5F);
            return false;
        }
    }
}
