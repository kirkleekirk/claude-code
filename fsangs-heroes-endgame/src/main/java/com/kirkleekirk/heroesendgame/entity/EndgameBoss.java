package com.kirkleekirk.heroesendgame.entity;

import com.kirkleekirk.heroesendgame.config.EndgameConfig;
import com.kirkleekirk.heroesendgame.entity.ability.BossAbility;
import com.kirkleekirk.heroesendgame.entity.projectile.EnergyBoltEntity;
import com.kirkleekirk.heroesendgame.nemesis.Nemesis;
import com.kirkleekirk.heroesendgame.nemesis.NemesisDirector;
import com.kirkleekirk.heroesendgame.power.PowerProfile;
import com.kirkleekirk.heroesendgame.power.PowerScaling;
import com.kirkleekirk.heroesendgame.registry.ModDamageTypes;
import net.minecraft.ChatFormatting;
import net.minecraft.core.BlockPos;
import net.minecraft.core.particles.ParticleOptions;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.MutableComponent;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.level.ServerBossEvent;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.tags.BlockTags;
import net.minecraft.tags.DamageTypeTags;
import net.minecraft.util.Mth;
import net.minecraft.world.BossEvent;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.damagesource.DamageType;
import net.minecraft.world.damagesource.DamageTypes;
import net.minecraft.world.effect.MobEffect;
import net.minecraft.world.effect.MobEffectCategory;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.ai.attributes.AttributeInstance;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.ai.goal.FloatGoal;
import net.minecraft.world.entity.ai.goal.Goal;
import net.minecraft.world.entity.ai.goal.LookAtPlayerGoal;
import net.minecraft.world.entity.ai.goal.RandomLookAroundGoal;
import net.minecraft.world.entity.ai.goal.WaterAvoidingRandomStrollGoal;
import net.minecraft.world.entity.ai.goal.target.HurtByTargetGoal;
import net.minecraft.world.entity.ai.goal.target.NearestAttackableTargetGoal;
import net.minecraft.world.entity.monster.Monster;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;
import net.minecraftforge.event.ForgeEventFactory;
import org.jetbrains.annotations.Nullable;

import java.util.ArrayList;
import java.util.Collections;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Base class of every nemesis and minion in this mod.
 * <p>
 * Handles everything the bosses share: scaling to the hunted player, the boss bar, special attack scheduling, the
 * per-hit damage cap, crowd-control immunity, anti-cheese (teleporting after players that run, smashing through
 * walls), dialogue, and reporting victories/defeats to the {@link NemesisDirector}.
 */
public abstract class EndgameBoss extends Monster {
    public static final int POSE_NONE = 0;
    public static final int POSE_CAST = 1;
    public static final int POSE_CHARGE = 2;
    public static final int POSE_SLAM = 3;
    public static final int POSE_BEAM = 4;
    public static final int POSE_FLY = 5;
    public static final int POSE_SNAP = 6;
    public static final int POSE_GRAB = 7;

    private static final EntityDataAccessor<Integer> DATA_PHASE = SynchedEntityData.defineId(EndgameBoss.class, EntityDataSerializers.INT);
    private static final EntityDataAccessor<Integer> DATA_CAST_POSE = SynchedEntityData.defineId(EndgameBoss.class, EntityDataSerializers.INT);
    private static final EntityDataAccessor<Boolean> DATA_FLYING = SynchedEntityData.defineId(EndgameBoss.class, EntityDataSerializers.BOOLEAN);
    private static final EntityDataAccessor<Integer> DATA_VARIANT = SynchedEntityData.defineId(EndgameBoss.class, EntityDataSerializers.INT);

    protected final ServerBossEvent bossEvent;

    @Nullable
    private UUID huntedPlayer;
    @Nullable
    private Nemesis nemesis;
    @Nullable
    private UUID encounterId;
    private int encounterLevel;
    private boolean scaled;
    private float healthDivisor = 1.0F;
    private final Map<UUID, Float> participants = new HashMap<>();

    private List<BossAbility> abilities;
    @Nullable
    private BossAbility activeAbility;
    private int abilityGlobalCooldown = 50;
    private int meleeCooldown;
    private int noTargetTicks;
    private int stuckTicks;
    private Vec3 lastProgressPos = Vec3.ZERO;
    private boolean defeated;
    private boolean retreating;
    private boolean summoned;

    protected EndgameBoss(EntityType<? extends EndgameBoss> type, Level level) {
        super(type, level);
        this.bossEvent = new ServerBossEvent(Component.empty(), bossBarColor(), BossEvent.BossBarOverlay.NOTCHED_10);
        this.bossEvent.setDarkenScreen(darkenSky());
        this.bossEvent.setCreateWorldFog(darkenSky());
        this.xpReward = isMinion() ? 10 : 250;
        this.setPersistenceRequired();
        this.setMaxUpStep(1.1F);
    }

    public static AttributeSupplier.Builder bossAttributes(double health, double damage, double speed, double armor) {
        return Monster.createMonsterAttributes()
                .add(Attributes.MAX_HEALTH, health)
                .add(Attributes.ATTACK_DAMAGE, damage)
                .add(Attributes.MOVEMENT_SPEED, speed)
                .add(Attributes.ARMOR, armor)
                .add(Attributes.ARMOR_TOUGHNESS, 4.0)
                .add(Attributes.KNOCKBACK_RESISTANCE, 0.9)
                .add(Attributes.FOLLOW_RANGE, 96.0)
                .add(Attributes.ATTACK_KNOCKBACK, 1.0)
                .add(Attributes.FLYING_SPEED, 0.6);
    }

    // =================================================================================================================
    // Definition hooks
    // =================================================================================================================

    /** Tuning numbers (see {@link BossStats}). */
    public abstract BossStats stats();

    /** Special attacks, created once on the server. */
    protected abstract void registerAbilities(List<BossAbility> abilities);

    /** Key used for dialogue lines: boss.heroes_endgame.&lt;key&gt;.&lt;line&gt; */
    protected abstract String dialogueKey();

    protected BossEvent.BossBarColor bossBarColor() {
        return BossEvent.BossBarColor.RED;
    }

    protected boolean darkenSky() {
        return false;
    }

    /** Minions don't get boss bars or count as nemeses. Anything summoned by another boss is a minion. */
    public boolean isMinion() {
        return summoned;
    }

    /** Marks this entity as summoned by another boss (call before adding it to the level). */
    public void markSummoned() {
        this.summoned = true;
        this.xpReward = 10;
    }

    protected ChatFormatting nameColor() {
        return ChatFormatting.DARK_RED;
    }

    /** Health fractions at which the boss enters its next phase (e.g. {0.5f} = phase 1 below half health). */
    protected float[] phaseThresholds() {
        return new float[0];
    }

    protected void onPhaseChange(int phase) {
    }

    protected boolean isFlyer() {
        return false;
    }

    /** Base flight speed in blocks/tick. */
    protected double flightSpeed() {
        return stats().speed();
    }

    protected double chaseSpeed() {
        return 1.0;
    }

    /** Ranged bosses keep this distance from their target instead of closing to melee (0 = melee fighter). */
    protected double preferredRange() {
        return 0.0;
    }

    protected int meleeInterval() {
        return 20;
    }

    protected float meleePower() {
        return 1.0F;
    }

    protected ResourceKey<DamageType> meleeDamageType() {
        return ModDamageTypes.NEMESIS;
    }

    protected double meleeKnockback() {
        return 0.6;
    }

    /** Called after a successful melee hit. */
    protected void onMeleeHit(LivingEntity target) {
    }

    /** Effects this boss is canonically weak to (they get through its crowd-control immunity). */
    protected boolean isWeakTo(MobEffect effect) {
        return false;
    }

    /** Adjust incoming damage before the health divisor and damage cap. Return 0 to negate. */
    protected float modifyIncomingDamage(DamageSource source, float amount) {
        return amount;
    }

    /** Return true to cancel this death (resurrections, time loops...). Health must be restored by the override. */
    protected boolean preventDeath(DamageSource source) {
        return false;
    }

    protected void onDefeated(DamageSource source) {
        sayRandom("defeat", 1);
    }

    /** Entrance effects when the director brings this boss in. */
    public void playArrival() {
        burst(ParticleTypes.REVERSE_PORTAL, 80, 1.0);
        playSound(SoundEvents.ENDERMAN_TELEPORT, 2.0F, 0.6F);
    }

    /** Can be teleported after a player who runs away. */
    protected boolean canLeashTeleport() {
        return true;
    }

    /** Extra damage multiplier from phases, rage, buffs... */
    protected float damageMultiplier() {
        return 1.0F;
    }

    public float renderScale() {
        return 1.0F;
    }

    // =================================================================================================================
    // Setup and scaling
    // =================================================================================================================

    /**
     * Called by the director (or on the first tick for spawn eggs) to size this boss against the player it hunts.
     */
    public void setupFor(@Nullable ServerPlayer target, @Nullable Nemesis nemesis, @Nullable UUID encounterId,
                         int players, float healthFraction, int encounterLevel) {
        this.nemesis = nemesis;
        this.encounterId = encounterId;
        this.encounterLevel = Math.max(0, encounterLevel);
        if (target != null) {
            this.huntedPlayer = target.getUUID();
            this.setTarget(target);
        }
        applyScaling(target, players);
        this.setHealth(Math.max(1.0F, getMaxHealth() * Mth.clamp(healthFraction, 0.05F, 1.0F)));
    }

    private void applyScaling(@Nullable ServerPlayer target, int players) {
        this.scaled = true;
        BossStats stats = stats();
        PowerProfile profile = target == null ? null : PowerProfile.of(target);
        double health = PowerScaling.bossHealth(profile, stats, Math.max(1, players)) * (1.0 + 0.15 * encounterLevel);
        double attributeHealth = Math.min(health, PowerScaling.ATTRIBUTE_HEALTH_CAP);
        this.healthDivisor = (float) Math.max(1.0, health / attributeHealth);
        AttributeInstance maxHealth = getAttribute(Attributes.MAX_HEALTH);
        if (maxHealth != null) {
            maxHealth.setBaseValue(attributeHealth);
        }
        AttributeInstance armor = getAttribute(Attributes.ARMOR);
        if (armor != null) {
            armor.setBaseValue(stats.armor());
        }
        if (!isFlyer()) {
            AttributeInstance speed = getAttribute(Attributes.MOVEMENT_SPEED);
            if (speed != null) {
                speed.setBaseValue(stats.speed());
            }
        }
        setHealth(getMaxHealth());
    }

    /** Multiplies max health (keeping the current health fraction), e.g. for every Infinity Stone Thanos holds. */
    public void boostHealth(double multiplier) {
        float fraction = getHealth() / getMaxHealth();
        double target = effectiveMaxHealth() * multiplier;
        double attributeHealth = Math.min(target, PowerScaling.ATTRIBUTE_HEALTH_CAP);
        this.healthDivisor = (float) Math.max(1.0, target / attributeHealth);
        AttributeInstance maxHealth = getAttribute(Attributes.MAX_HEALTH);
        if (maxHealth != null) {
            maxHealth.setBaseValue(attributeHealth);
        }
        setHealth(getMaxHealth() * fraction);
    }

    /** Effective health including the divisor used above the vanilla 1024 cap. */
    public double effectiveHealth() {
        return getHealth() * healthDivisor;
    }

    public double effectiveMaxHealth() {
        return getMaxHealth() * healthDivisor;
    }

    @Nullable
    public UUID getHuntedPlayerId() {
        return huntedPlayer;
    }

    @Nullable
    public ServerPlayer getHuntedPlayer() {
        if (huntedPlayer == null || !(level() instanceof ServerLevel serverLevel)) {
            return null;
        }
        return serverLevel.getServer().getPlayerList().getPlayer(huntedPlayer);
    }

    @Nullable
    public Nemesis getNemesis() {
        return nemesis;
    }

    @Nullable
    public UUID getEncounterId() {
        return encounterId;
    }

    public int getEncounterLevel() {
        return encounterLevel;
    }

    public Set<UUID> getParticipants() {
        Set<UUID> result = new HashSet<>(participants.keySet());
        if (level() instanceof ServerLevel serverLevel) {
            for (ServerPlayer player : serverLevel.players()) {
                if (player.distanceToSqr(this) < 64 * 64 && !player.isSpectator()) {
                    result.add(player.getUUID());
                }
            }
        }
        if (huntedPlayer != null) {
            result.add(huntedPlayer);
        }
        return result;
    }

    // =================================================================================================================
    // Synced state
    // =================================================================================================================

    @Override
    protected void defineSynchedData() {
        super.defineSynchedData();
        this.entityData.define(DATA_PHASE, 0);
        this.entityData.define(DATA_CAST_POSE, POSE_NONE);
        this.entityData.define(DATA_FLYING, false);
        this.entityData.define(DATA_VARIANT, 0);
    }

    public int getPhase() {
        return entityData.get(DATA_PHASE);
    }

    public int getCastPose() {
        return entityData.get(DATA_CAST_POSE);
    }

    public void setCastPose(int pose) {
        entityData.set(DATA_CAST_POSE, pose);
    }

    public boolean isFlying() {
        return entityData.get(DATA_FLYING);
    }

    protected void setFlying(boolean flying) {
        if (flying != isFlying()) {
            entityData.set(DATA_FLYING, flying);
        }
        setNoGravity(flying);
    }

    public int getVariant() {
        return entityData.get(DATA_VARIANT);
    }

    public void setVariant(int variant) {
        entityData.set(DATA_VARIANT, variant);
    }

    public boolean isMovementLocked() {
        return activeAbility != null && activeAbility.locksMovement();
    }

    @Nullable
    public BossAbility getActiveAbility() {
        return activeAbility;
    }

    // =================================================================================================================
    // AI
    // =================================================================================================================

    @Override
    protected void registerGoals() {
        this.goalSelector.addGoal(0, new FloatGoal(this));
        this.goalSelector.addGoal(2, new ChaseGoal(this));
        this.goalSelector.addGoal(2, new FlightGoal(this));
        this.goalSelector.addGoal(7, new WaterAvoidingRandomStrollGoal(this, 0.8));
        this.goalSelector.addGoal(8, new LookAtPlayerGoal(this, Player.class, 24.0F));
        this.goalSelector.addGoal(9, new RandomLookAroundGoal(this));
        this.targetSelector.addGoal(1, new HurtByTargetGoal(this, EndgameBoss.class));
        this.targetSelector.addGoal(2, new NearestAttackableTargetGoal<>(this, Player.class, 10, true, false, null));
    }

    @Override
    protected void customServerAiStep() {
        super.customServerAiStep();
        ServerLevel level = (ServerLevel) level();

        if (!scaled) {
            Player nearest = level.getNearestPlayer(this, 64);
            setupFor(nearest instanceof ServerPlayer sp ? sp : null, null, null, 1, 1.0F, 0);
        }
        if (abilities == null) {
            abilities = new ArrayList<>();
            registerAbilities(abilities);
            for (BossAbility ability : abilities) {
                ability.setCooldown(ability.cooldownTicks() / 2 + random.nextInt(40));
            }
        }

        updateTarget();
        updatePhase();
        tickAbilities();
        if (meleeCooldown > 0) {
            meleeCooldown--;
        }
        if (tickCount % 20 == 0) {
            antiCheese();
        }
        // Leftovers from an encounter that already ended (e.g. a chunk that was unloaded mid-fight) quietly leave.
        if (tickCount > 40 && tickCount % 100 == 0 && !isMinion() && !NemesisDirector.isCurrent(this)) {
            discard();
            return;
        }

        if (!isMinion()) {
            bossEvent.setName(getDisplayName());
            bossEvent.setProgress(getHealth() / getMaxHealth());
        }
    }

    private void updateTarget() {
        LivingEntity target = getTarget();
        ServerPlayer hunted = getHuntedPlayer();
        if (hunted != null && hunted.isAlive() && !hunted.isSpectator() && !hunted.isCreative()
                && hunted.level() == level() && hunted.distanceToSqr(this) < 96 * 96) {
            // Focus the hunted player unless someone else is actively fighting us up close.
            if (target == null || !target.isAlive() || (!(target instanceof Player) && random.nextInt(40) == 0)) {
                setTarget(hunted);
            }
        }
        target = getTarget();
        if (target != null && (!target.isAlive() || (target instanceof Player p && (p.isCreative() || p.isSpectator())))) {
            setTarget(null);
            target = null;
        }

        if (target == null) {
            noTargetTicks++;
            if (isFlying() && noTargetTicks > 40) {
                setFlying(false);
            }
            // Nobody to fight for 45 seconds: the nemesis leaves and comes back another time.
            if (!isMinion() && huntedPlayer != null && noTargetTicks > 900) {
                retreat(true);
            } else if (isMinion() && noTargetTicks > 1200) {
                discard();
            }
        } else {
            noTargetTicks = 0;
        }
    }

    private void updatePhase() {
        float[] thresholds = phaseThresholds();
        if (thresholds.length == 0) {
            return;
        }
        float fraction = getHealth() / getMaxHealth();
        int phase = 0;
        for (float threshold : thresholds) {
            if (fraction <= threshold) {
                phase++;
            }
        }
        if (phase > getPhase()) {
            entityData.set(DATA_PHASE, phase);
            onPhaseChange(phase);
        }
    }

    private void tickAbilities() {
        for (BossAbility ability : abilities) {
            ability.tickCooldown();
        }
        LivingEntity target = getTarget();
        if (activeAbility != null) {
            if (target == null || !target.isAlive() || !activeAbility.update(target)) {
                activeAbility.finish();
                activeAbility = null;
                setCastPose(POSE_NONE);
                abilityGlobalCooldown = 25 + random.nextInt(30);
            }
            return;
        }
        if (target == null || --abilityGlobalCooldown > 0) {
            return;
        }
        int total = 0;
        List<BossAbility> ready = new ArrayList<>();
        for (BossAbility ability : abilities) {
            if (ability.isReady() && ability.canUse(target)) {
                ready.add(ability);
                total += ability.weight();
            }
        }
        if (ready.isEmpty() || total <= 0) {
            abilityGlobalCooldown = 10;
            return;
        }
        int roll = random.nextInt(total);
        for (BossAbility ability : ready) {
            roll -= ability.weight();
            if (roll < 0) {
                startAbility(ability, target);
                return;
            }
        }
    }

    /** Starts an ability immediately (used for scripted moments like phase changes). */
    public void startAbility(BossAbility ability, LivingEntity target) {
        if (activeAbility != null) {
            activeAbility.finish();
        }
        activeAbility = ability;
        setCastPose(ability.castPose());
        if (ability.locksMovement()) {
            getNavigation().stop();
        }
        ability.begin(target);
    }

    public void interruptAbility() {
        if (activeAbility != null) {
            activeAbility.finish();
            activeAbility = null;
            setCastPose(POSE_NONE);
        }
    }

    @Nullable
    public <T extends BossAbility> T ability(Class<T> type) {
        if (abilities == null) {
            return null;
        }
        for (BossAbility ability : abilities) {
            if (type.isInstance(ability)) {
                return type.cast(ability);
            }
        }
        return null;
    }

    public List<BossAbility> abilities() {
        return abilities == null ? Collections.emptyList() : abilities;
    }

    // =================================================================================================================
    // Combat
    // =================================================================================================================

    public double meleeReachSqr(LivingEntity target) {
        double reach = getBbWidth() * 1.6 + target.getBbWidth() * 0.5 + 1.2;
        return reach * reach;
    }

    public void tryMelee(LivingEntity target) {
        if (meleeCooldown <= 0 && hasLineOfSight(target)) {
            meleeCooldown = meleeInterval();
            swing(InteractionHand.MAIN_HAND);
            doHurtTarget(target);
        }
    }

    @Override
    public boolean doHurtTarget(Entity entity) {
        if (!(entity instanceof LivingEntity target)) {
            return super.doHurtTarget(entity);
        }
        boolean hit = strike(target, meleePower(), meleeDamageType());
        if (hit) {
            double kb = meleeKnockback();
            if (kb > 0) {
                target.knockback(kb, Mth.sin(getYRot() * Mth.DEG_TO_RAD), -Mth.cos(getYRot() * Mth.DEG_TO_RAD));
            }
            setLastHurtMob(target);
            onMeleeHit(target);
        }
        return hit;
    }

    /**
     * Hurts the target with damage solved against its own durability. {@code power} 1 = a normal hit,
     * 2 = twice as much of the target's health, and so on.
     */
    public boolean strike(LivingEntity target, float power, ResourceKey<DamageType> type) {
        return strike(target, power, type, this);
    }

    public boolean strike(LivingEntity target, float power, ResourceKey<DamageType> type, Entity directSource) {
        if (target == this || target instanceof EndgameBoss) {
            return false;
        }
        DamageSource source = ModDamageTypes.source(level(), type, directSource, this);
        return target.hurt(source, computeDamage(target, source, power));
    }

    public float computeDamage(LivingEntity target, DamageSource source, float power) {
        BossStats stats = stats();
        float scale = power * (1.0F + 0.15F * encounterLevel) * damageMultiplier();
        float floor = (float) stats.baseDamage() * scale;
        float damage = PowerScaling.hitDamage(target, source, stats.hitsToKill() / Math.max(0.05F, scale), floor);
        return damage * EndgameConfig.DAMAGE_MULTIPLIER.get().floatValue();
    }

    @Override
    public boolean hurt(DamageSource source, float amount) {
        if (level().isClientSide || isInvulnerableTo(source)) {
            return false;
        }
        Entity attacker = source.getEntity();
        if (attacker instanceof EndgameBoss) {
            return false;
        }
        if (!source.is(DamageTypeTags.BYPASSES_INVULNERABILITY)) {
            amount = modifyIncomingDamage(source, amount);
            if (amount <= 0.0F) {
                return false;
            }
            amount /= healthDivisor;
            if (EndgameConfig.PER_HIT_DAMAGE_CAP.get()) {
                amount = Math.min(amount, getMaxHealth() * stats().damageCap());
            }
        }
        if (attacker instanceof ServerPlayer player) {
            participants.merge(player.getUUID(), amount, Float::sum);
            if (getTarget() == null) {
                setTarget(player);
            }
        }
        return super.hurt(source, amount);
    }

    @Override
    public boolean isInvulnerableTo(DamageSource source) {
        return source.is(DamageTypes.IN_WALL) || source.is(DamageTypes.FALL) || source.is(DamageTypes.DROWN)
                || source.is(DamageTypes.CRAMMING) || source.is(DamageTypes.FLY_INTO_WALL) || source.is(DamageTypes.CACTUS)
                || source.is(DamageTypes.SWEET_BERRY_BUSH) || source.is(DamageTypes.FREEZE) || source.is(DamageTypes.STALAGMITE)
                || source.is(DamageTypes.FALLING_STALACTITE) || source.is(DamageTypes.FELL_OUT_OF_WORLD)
                || super.isInvulnerableTo(source);
    }

    @Override
    public boolean canBeAffected(MobEffectInstance instance) {
        MobEffect effect = instance.getEffect();
        if (effect == MobEffects.GLOWING || isWeakTo(effect) || effect.getCategory() == MobEffectCategory.BENEFICIAL) {
            return super.canBeAffected(instance);
        }
        // Nemeses shrug off stuns, slows, freezes, telekinetic holds and the like.
        return false;
    }

    @Override
    public void die(DamageSource source) {
        if (!level().isClientSide && !defeated && preventDeath(source)) {
            return;
        }
        super.die(source);
        if (!level().isClientSide && this.dead && !defeated) {
            defeated = true;
            interruptAbility();
            onDefeated(source);
            NemesisDirector.onBossKilled(this, source);
        }
    }

    /** Leaves the fight (target gone, player died...). The director re-schedules the encounter if needed. */
    public void retreat(boolean announce) {
        if (retreating || !(level() instanceof ServerLevel)) {
            return;
        }
        retreating = true;
        if (announce && !isMinion()) {
            sayRandom("retreat", 1);
        }
        burst(ParticleTypes.REVERSE_PORTAL, 60, 1.0);
        playSound(SoundEvents.ENDERMAN_TELEPORT, 1.5F, 0.5F);
        if (!isMinion()) {
            NemesisDirector.onBossRetreated(this);
        }
        discard();
    }

    public boolean isRetreating() {
        return retreating;
    }

    // =================================================================================================================
    // Anti-cheese
    // =================================================================================================================

    private void antiCheese() {
        LivingEntity target = getTarget();
        // Void safety
        if (getY() < level().getMinBuildHeight() + 2) {
            if (target != null) {
                teleportNear(target, 3, 8);
            } else {
                BlockPos top = level().getHeightmapPos(Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, blockPosition());
                teleportTo(top.getX() + 0.5, Math.max(top.getY(), level().getMinBuildHeight() + 5) + 1, top.getZ() + 0.5);
            }
            setDeltaMovement(Vec3.ZERO);
            return;
        }
        if (target == null || isMovementLocked()) {
            lastProgressPos = position();
            stuckTicks = 0;
            return;
        }
        double distance = distanceTo(target);
        boolean progressing = position().distanceToSqr(lastProgressPos) > 1.0;
        lastProgressPos = position();
        if (distance > 4 && !progressing) {
            stuckTicks += 20;
            if (stuckTicks >= 40) {
                smashObstacles(target);
            }
        } else {
            stuckTicks = 0;
        }

        if (canLeashTeleport() && target.level() == level()
                && (distance > EndgameConfig.LEASH_DISTANCE.get() || stuckTicks >= 160)) {
            teleportNear(target, 3, 8);
            stuckTicks = 0;
        }
    }

    /** Breaks soft blocks around the boss in the direction of its target. */
    protected void smashObstacles(LivingEntity target) {
        if (!EndgameConfig.BLOCK_BREAKING.get() || !ForgeEventFactory.getMobGriefingEvent(level(), this)) {
            return;
        }
        Vec3 dir = target.position().subtract(position()).normalize();
        AABB box = getBoundingBox().move(dir.x * 0.8, 0.0, dir.z * 0.8).inflate(0.2, 0.0, 0.2);
        if (target.getY() > getY() + 1.5) {
            box = box.expandTowards(0, 1.5, 0);
        } else if (target.getY() < getY() - 1.5) {
            box = box.expandTowards(0, -1.0, 0);
        }
        int broken = 0;
        for (BlockPos pos : BlockPos.betweenClosed(Mth.floor(box.minX), Mth.floor(box.minY), Mth.floor(box.minZ),
                Mth.floor(box.maxX), Mth.floor(box.maxY), Mth.floor(box.maxZ))) {
            if (broken >= 8) {
                break;
            }
            BlockState state = level().getBlockState(pos);
            if (canSmash(state, pos)) {
                level().destroyBlock(pos, true, this);
                broken++;
            }
        }
    }

    protected boolean canSmash(BlockState state, BlockPos pos) {
        if (state.isAir() || !state.getFluidState().isEmpty() || state.hasBlockEntity()) {
            return false;
        }
        float hardness = state.getDestroySpeed(level(), pos);
        return hardness >= 0 && hardness < 30 && !state.is(BlockTags.WITHER_IMMUNE) && !state.is(BlockTags.DRAGON_IMMUNE)
                && net.minecraftforge.common.ForgeHooks.canEntityDestroy(level(), pos, this);
    }

    /** Teleports to a safe spot near the target. */
    public boolean teleportNear(LivingEntity target, double minDistance, double maxDistance) {
        for (int attempt = 0; attempt < 24; attempt++) {
            double angle = random.nextDouble() * Math.PI * 2;
            double dist = minDistance + random.nextDouble() * (maxDistance - minDistance);
            double x = target.getX() + Math.cos(angle) * dist;
            double z = target.getZ() + Math.sin(angle) * dist;
            double y = target.getY() + random.nextInt(5) - 2;
            Vec3 from = position();
            if (isFlying()) {
                if (level().noCollision(this, getBoundingBox().move(x - getX(), y + 2 - getY(), z - getZ()))) {
                    teleportTo(x, y + 2, z);
                    teleportEffects(from);
                    return true;
                }
            } else if (randomTeleport(x, y, z, false)) {
                teleportEffects(from);
                return true;
            }
        }
        return false;
    }

    private void teleportEffects(Vec3 from) {
        if (level() instanceof ServerLevel serverLevel) {
            serverLevel.sendParticles(ParticleTypes.REVERSE_PORTAL, from.x, from.y + getBbHeight() / 2, from.z, 30, 0.4, 0.8, 0.4, 0.05);
            serverLevel.sendParticles(ParticleTypes.REVERSE_PORTAL, getX(), getY() + getBbHeight() / 2, getZ(), 30, 0.4, 0.8, 0.4, 0.05);
        }
        playSound(SoundEvents.ENDERMAN_TELEPORT, 1.0F, 0.8F);
    }

    // =================================================================================================================
    // Flight
    // =================================================================================================================

    /** Accelerates towards {@code destination}; {@code agility} 0..1 is how quickly the course changes. */
    public void flyTowards(Vec3 destination, double speed, double agility) {
        setFlying(true);
        Vec3 delta = destination.subtract(position());
        double distance = delta.length();
        Vec3 desired = distance < 0.05 ? Vec3.ZERO : delta.scale(Math.min(speed, distance) / distance);
        setDeltaMovement(getDeltaMovement().lerp(desired, Mth.clamp(agility, 0.0, 1.0)));
        if (horizontalCollision && getTarget() != null && EndgameConfig.BLOCK_BREAKING.get()) {
            smashObstacles(getTarget());
        }
        if (desired.lengthSqr() > 0.01) {
            float yaw = (float) (Mth.atan2(desired.z, desired.x) * Mth.RAD_TO_DEG) - 90.0F;
            setYRot(Mth.approachDegrees(getYRot(), yaw, 20.0F));
            yBodyRot = getYRot();
        }
    }

    // =================================================================================================================
    // Helpers for abilities
    // =================================================================================================================

    public List<LivingEntity> enemiesInRange(double radius) {
        return level().getEntitiesOfClass(LivingEntity.class, getBoundingBox().inflate(radius),
                e -> e != this && e.isAlive() && !(e instanceof EndgameBoss) && !(e instanceof Player p && (p.isCreative() || p.isSpectator()))
                        && e.distanceToSqr(this) <= radius * radius && (e instanceof Player || e instanceof net.minecraft.world.entity.Mob mob && mob.getTarget() == this || e == getTarget()));
    }

    public List<ServerPlayer> playersInRange(double radius) {
        List<ServerPlayer> result = new ArrayList<>();
        if (level() instanceof ServerLevel serverLevel) {
            for (ServerPlayer player : serverLevel.players()) {
                if (!player.isSpectator() && !player.isCreative() && player.distanceToSqr(this) <= radius * radius) {
                    result.add(player);
                }
            }
        }
        return result;
    }

    /** Area attack: damages and knocks back every enemy within the radius. */
    public void shockwave(double radius, float power, ResourceKey<DamageType> type, double knockback, double lift) {
        for (LivingEntity victim : enemiesInRange(radius)) {
            if (strike(victim, power, type)) {
                Vec3 push = victim.position().subtract(position()).multiply(1, 0, 1).normalize().scale(knockback);
                victim.setDeltaMovement(victim.getDeltaMovement().add(push.x, lift, push.z));
                victim.hurtMarked = true;
            }
        }
        if (level() instanceof ServerLevel serverLevel) {
            for (int i = 0; i < 32; i++) {
                double angle = i / 32.0 * Math.PI * 2;
                serverLevel.sendParticles(ParticleTypes.CLOUD, getX() + Math.cos(angle) * radius * 0.6, getY() + 0.2,
                        getZ() + Math.sin(angle) * radius * 0.6, 1, 0, 0, 0, 0.05);
            }
            serverLevel.sendParticles(ParticleTypes.EXPLOSION, getX(), getY() + 0.5, getZ(), 3, radius * 0.2, 0.2, radius * 0.2, 0);
        }
    }

    public EnergyBoltEntity shootBolt(LivingEntity target, EnergyBoltEntity.Variant variant, float power, double speed, boolean homing) {
        EnergyBoltEntity bolt = new EnergyBoltEntity(level(), this, variant, power);
        Vec3 from = getEyePosition().add(getLookAngle().scale(getBbWidth()));
        bolt.setPos(from.x, from.y - 0.2, from.z);
        Vec3 aim = target.getEyePosition().subtract(0, target.getBbHeight() * 0.25, 0).subtract(bolt.position()).normalize();
        bolt.setDeltaMovement(aim.scale(speed));
        if (homing) {
            bolt.setHomingTarget(target);
        }
        level().addFreshEntity(bolt);
        return bolt;
    }

    /** Instant beam from the eyes towards a point: hits the first enemy on the line. */
    @Nullable
    public LivingEntity fireBeam(Vec3 toward, double range, float power, ResourceKey<DamageType> type, ParticleOptions particle) {
        Vec3 from = getEyePosition();
        Vec3 dir = toward.subtract(from).normalize();
        LivingEntity hit = null;
        double hitDistance = range;
        for (LivingEntity candidate : level().getEntitiesOfClass(LivingEntity.class, getBoundingBox().inflate(range),
                e -> e != this && !(e instanceof EndgameBoss) && e.isAlive())) {
            AABB box = candidate.getBoundingBox().inflate(0.4);
            var clip = box.clip(from, from.add(dir.scale(range)));
            if (clip.isPresent()) {
                double d = clip.get().distanceTo(from);
                if (d < hitDistance) {
                    hitDistance = d;
                    hit = candidate;
                }
            }
        }
        // Stop at blocks
        var blockHit = level().clip(new net.minecraft.world.level.ClipContext(from, from.add(dir.scale(hitDistance)),
                net.minecraft.world.level.ClipContext.Block.COLLIDER, net.minecraft.world.level.ClipContext.Fluid.NONE, this));
        if (blockHit.getType() != net.minecraft.world.phys.HitResult.Type.MISS) {
            double blockDistance = blockHit.getLocation().distanceTo(from);
            if (blockDistance < hitDistance - 0.5) {
                hitDistance = blockDistance;
                hit = null;
            }
        }
        if (level() instanceof ServerLevel serverLevel) {
            for (double d = 0.5; d < hitDistance; d += 0.5) {
                Vec3 p = from.add(dir.scale(d));
                serverLevel.sendParticles(particle, p.x, p.y, p.z, 1, 0.02, 0.02, 0.02, 0.0);
            }
        }
        if (hit != null) {
            strike(hit, power, type);
        }
        return hit;
    }

    public void burst(ParticleOptions particle, int count, double spread) {
        if (level() instanceof ServerLevel serverLevel) {
            serverLevel.sendParticles(particle, getX(), getY() + getBbHeight() * 0.5, getZ(), count,
                    getBbWidth() * spread, getBbHeight() * 0.4 * spread, getBbWidth() * spread, 0.05);
        }
    }

    public void playSound(SoundEvent sound, float volume, float pitch) {
        level().playSound(null, getX(), getY(), getZ(), sound, SoundSource.HOSTILE, volume, pitch);
    }

    /** Throws an entity with the given velocity, bypassing its knockback resistance. */
    public static void launch(LivingEntity entity, Vec3 velocity) {
        entity.setDeltaMovement(velocity);
        entity.hasImpulse = true;
        entity.hurtMarked = true;
        if (entity instanceof ServerPlayer player) {
            player.connection.send(new net.minecraft.network.protocol.game.ClientboundSetEntityMotionPacket(player));
        }
    }

    // =================================================================================================================
    // Dialogue
    // =================================================================================================================

    public void say(String line, Object... args) {
        if (!(level() instanceof ServerLevel serverLevel)) {
            return;
        }
        MutableComponent message = Component.literal("<").append(getDisplayName()).append("> ").withStyle(nameColor())
                .append(Component.translatable("boss.heroes_endgame." + dialogueKey() + "." + line, args).withStyle(ChatFormatting.WHITE));
        for (ServerPlayer player : serverLevel.players()) {
            if (player.distanceToSqr(this) < 96 * 96) {
                player.sendSystemMessage(message);
            }
        }
    }

    /** Says one of {@code variants} lines: key.0, key.1... (or just key when variants is 1). */
    public void sayRandom(String line, int variants) {
        say(variants <= 1 ? line : line + "." + random.nextInt(variants));
    }

    // =================================================================================================================
    // Vanilla overrides
    // =================================================================================================================

    @Override
    public void startSeenByPlayer(ServerPlayer player) {
        super.startSeenByPlayer(player);
        if (!isMinion()) {
            bossEvent.addPlayer(player);
        }
    }

    @Override
    public void stopSeenByPlayer(ServerPlayer player) {
        super.stopSeenByPlayer(player);
        bossEvent.removePlayer(player);
    }

    @Override
    public void checkDespawn() {
        // Nemeses never despawn on their own; they retreat when their target is gone.
    }

    @Override
    public boolean removeWhenFarAway(double distance) {
        return false;
    }

    @Override
    public boolean requiresCustomPersistence() {
        return true;
    }

    @Override
    public boolean canChangeDimensions() {
        return false;
    }

    @Override
    public boolean causeFallDamage(float distance, float multiplier, DamageSource source) {
        return false;
    }

    @Override
    public boolean isPushedByFluid() {
        return false;
    }

    @Override
    protected boolean shouldDespawnInPeaceful() {
        return false;
    }

    @Override
    public boolean canBeLeashed(Player player) {
        return false;
    }

    @Override
    protected void tickDeath() {
        super.tickDeath();
        if (deathTime == 1 && level() instanceof ServerLevel serverLevel && !isMinion()) {
            serverLevel.sendParticles(ParticleTypes.EXPLOSION_EMITTER, getX(), getY() + getBbHeight() / 2, getZ(), 1, 0, 0, 0, 0);
        }
    }

    @Override
    public void addAdditionalSaveData(CompoundTag tag) {
        super.addAdditionalSaveData(tag);
        if (huntedPlayer != null) {
            tag.putUUID("HuntedPlayer", huntedPlayer);
        }
        if (nemesis != null) {
            tag.putString("Nemesis", nemesis.id());
        }
        if (encounterId != null) {
            tag.putUUID("EncounterId", encounterId);
        }
        tag.putInt("EncounterLevel", encounterLevel);
        tag.putBoolean("Scaled", scaled);
        tag.putFloat("HealthDivisor", healthDivisor);
        tag.putInt("Phase", getPhase());
        tag.putInt("Variant", getVariant());
        tag.putBoolean("Flying", isFlying());
        tag.putBoolean("Summoned", summoned);
    }

    @Override
    public void readAdditionalSaveData(CompoundTag tag) {
        super.readAdditionalSaveData(tag);
        huntedPlayer = tag.hasUUID("HuntedPlayer") ? tag.getUUID("HuntedPlayer") : null;
        nemesis = tag.contains("Nemesis") ? Nemesis.byId(tag.getString("Nemesis")) : null;
        encounterId = tag.hasUUID("EncounterId") ? tag.getUUID("EncounterId") : null;
        encounterLevel = tag.getInt("EncounterLevel");
        scaled = tag.getBoolean("Scaled");
        healthDivisor = Math.max(1.0F, tag.getFloat("HealthDivisor"));
        entityData.set(DATA_PHASE, tag.getInt("Phase"));
        setVariant(tag.getInt("Variant"));
        setFlying(tag.getBoolean("Flying"));
        summoned = tag.getBoolean("Summoned");
    }

    // =================================================================================================================
    // Goals
    // =================================================================================================================

    /** Ground chase + melee. */
    static class ChaseGoal extends Goal {
        private final EndgameBoss boss;
        private int repath;

        ChaseGoal(EndgameBoss boss) {
            this.boss = boss;
            setFlags(EnumSet.of(Flag.MOVE, Flag.LOOK));
        }

        @Override
        public boolean canUse() {
            LivingEntity target = boss.getTarget();
            return target != null && target.isAlive() && !boss.isFlyer() && !boss.isMovementLocked();
        }

        @Override
        public void stop() {
            boss.getNavigation().stop();
        }

        @Override
        public boolean requiresUpdateEveryTick() {
            return true;
        }

        @Override
        public void tick() {
            LivingEntity target = boss.getTarget();
            if (target == null) {
                return;
            }
            boss.getLookControl().setLookAt(target, 30.0F, 30.0F);
            double distance = boss.distanceToSqr(target);
            double reach = boss.meleeReachSqr(target);
            double range = boss.preferredRange();
            if (--repath <= 0) {
                repath = 4 + boss.getRandom().nextInt(6);
                if (range > 0 && boss.hasLineOfSight(target)) {
                    double d = Math.sqrt(distance);
                    if (d < range * 0.6) {
                        // Too close: back off.
                        Vec3 away = boss.position().add(boss.position().subtract(target.position()).normalize().scale(range * 0.6));
                        boss.getNavigation().moveTo(away.x, away.y, away.z, boss.chaseSpeed());
                    } else if (d > range * 1.3) {
                        boss.getNavigation().moveTo(target, boss.chaseSpeed());
                    } else {
                        boss.getNavigation().stop();
                    }
                } else if (distance > reach * 0.7) {
                    boss.getNavigation().moveTo(target, boss.chaseSpeed());
                } else {
                    boss.getNavigation().stop();
                }
            }
            if (distance <= reach) {
                boss.tryMelee(target);
            }
        }
    }

    /** Free flight for flyers: close the distance fast, circle at melee range, strike. */
    static class FlightGoal extends Goal {
        private final EndgameBoss boss;
        private double orbit;

        FlightGoal(EndgameBoss boss) {
            this.boss = boss;
            setFlags(EnumSet.of(Flag.MOVE, Flag.LOOK));
        }

        @Override
        public boolean canUse() {
            LivingEntity target = boss.getTarget();
            return target != null && target.isAlive() && boss.isFlyer() && !boss.isMovementLocked();
        }

        @Override
        public boolean requiresUpdateEveryTick() {
            return true;
        }

        @Override
        public void tick() {
            LivingEntity target = boss.getTarget();
            if (target == null) {
                return;
            }
            boss.getLookControl().setLookAt(target, 40.0F, 40.0F);
            double distance = boss.distanceTo(target);
            Vec3 aim = target.position().add(0, target.getBbHeight() * 0.5 - boss.getBbHeight() * 0.4, 0);
            double speed = boss.flightSpeed();
            double range = boss.preferredRange();
            if (range > 0) {
                // Hover at range, circling the target.
                orbit += 0.04;
                Vec3 ring = new Vec3(Math.cos(orbit) * range, 3.0 + Math.sin(orbit * 2.0), Math.sin(orbit) * range);
                boss.flyTowards(target.position().add(ring), speed, 0.2);
                boss.setCastPose(POSE_NONE);
                if (boss.distanceToSqr(target) <= boss.meleeReachSqr(target)) {
                    boss.tryMelee(target);
                }
                return;
            }
            if (distance > 3.0) {
                boss.flyTowards(aim, speed * (distance > 16 ? 1.6 : 1.0), 0.3);
            } else {
                orbit += 0.15;
                Vec3 offset = new Vec3(Math.cos(orbit) * 1.6, 0.2, Math.sin(orbit) * 1.6);
                boss.flyTowards(aim.add(offset), speed * 0.5, 0.25);
            }
            boss.setCastPose(distance > 8 ? POSE_FLY : POSE_NONE);
            if (boss.distanceToSqr(target) <= boss.meleeReachSqr(target) + 1.0) {
                boss.tryMelee(target);
            }
        }

        @Override
        public void stop() {
            boss.setCastPose(POSE_NONE);
        }
    }
}
