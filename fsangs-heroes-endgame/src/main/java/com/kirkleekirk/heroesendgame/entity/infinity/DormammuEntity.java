package com.kirkleekirk.heroesendgame.entity.infinity;

import com.kirkleekirk.heroesendgame.config.EndgameConfig;
import com.kirkleekirk.heroesendgame.entity.BossStats;
import com.kirkleekirk.heroesendgame.entity.EndgameBoss;
import com.kirkleekirk.heroesendgame.entity.ability.BossAbility;
import com.kirkleekirk.heroesendgame.entity.ability.PullAbility;
import com.kirkleekirk.heroesendgame.entity.ability.SummonAbility;
import com.kirkleekirk.heroesendgame.entity.ability.VolleyAbility;
import com.kirkleekirk.heroesendgame.entity.projectile.EnergyBoltEntity;
import com.kirkleekirk.heroesendgame.infinity.DormammuBargain;
import com.kirkleekirk.heroesendgame.registry.ModDamageTypes;
import com.kirkleekirk.heroesendgame.registry.ModEntities;
import net.minecraft.ChatFormatting;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.BossEvent;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.entity.ai.goal.target.NearestAttackableTargetGoal;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Dormammu, lord of the Dark Dimension, summoned by opening the sealed Eye of Agamotto in the Nether.
 * <p>
 * He can't be beaten - only bargained with. Every time he kills the sorcerer who summoned him, the Time Stone
 * loops time back to the start of the fight (see {@link DormammuBargain}). Each loop wears him down; after enough
 * of them he gives up the Time Stone just to make it stop.
 */
public class DormammuEntity extends EndgameBoss {
    private static final BossStats STATS = new BossStats(1500, 14, 6, 120, 0.05F, 10, 0.0);

    @Nullable
    private UUID bargainer;
    private Vec3 anchor = Vec3.ZERO;
    private Vec3 home = Vec3.ZERO;
    private int loops;

    public DormammuEntity(EntityType<? extends DormammuEntity> type, Level level) {
        super(type, level);
        setNoGravity(true);
    }

    public static AttributeSupplier.Builder createAttributes() {
        return EndgameBoss.bossAttributes(1500, 14, 0.0, 10);
    }

    @Override
    public BossStats stats() {
        return STATS;
    }

    @Override
    protected String dialogueKey() {
        return "dormammu";
    }

    @Override
    protected BossEvent.BossBarColor bossBarColor() {
        return BossEvent.BossBarColor.YELLOW;
    }

    @Override
    protected ChatFormatting nameColor() {
        return ChatFormatting.GOLD;
    }

    @Override
    protected boolean darkenSky() {
        return true;
    }

    @Override
    protected boolean canLeashTeleport() {
        return false;
    }

    @Override
    protected void registerGoals() {
        this.targetSelector.addGoal(1, new NearestAttackableTargetGoal<>(this, Player.class, 10, false, false, null));
    }

    @Override
    protected void registerAbilities(List<BossAbility> abilities) {
        abilities.add(new VolleyAbility(this, 90, 4, 6, EnergyBoltEntity.Variant.DARK, 0.9F, 0.9, true, SoundEvents.WITHER_SHOOT, 0));
        abilities.add(new PullAbility(this, 220, 6, 40, 1.4F, ModDamageTypes.DARK_DIMENSION, ParticleTypes.REVERSE_PORTAL, SoundEvents.WARDEN_SONIC_CHARGE));
        abilities.add(new FirePillarAbility(this));
        abilities.add(new SummonAbility(this, 400, ModEntities.MINDLESS_ONE::get, 2, 3, ParticleTypes.FLAME, 0));
    }

    public void beginBargain(ServerPlayer player, Vec3 home) {
        this.bargainer = player.getUUID();
        this.anchor = player.position();
        this.home = home;
        this.loops = 0;
        setTarget(player);
    }

    @Nullable
    public UUID getBargainer() {
        return bargainer;
    }

    public Vec3 getAnchor() {
        return anchor;
    }

    public int getLoops() {
        return loops;
    }

    /** Called by {@link DormammuBargain} each time time loops. Returns true if Dormammu gives in. */
    public boolean onLoop() {
        loops++;
        // Every loop costs him: he never recovers what the loop took.
        setHealth(Math.max(1.0F, getHealth() - getMaxHealth() * 0.15F));
        if (loops >= EndgameConfig.INFINITY_DORMAMMU_LOOPS.get()) {
            say("yield");
            return true;
        }
        say(loops == 1 ? "loop_first" : loops == 2 ? "loop_second" : "loop_more");
        playSound(SoundEvents.WARDEN_ROAR, 3.0F, 0.4F);
        return false;
    }

    @Override
    protected void customServerAiStep() {
        super.customServerAiStep();
        setDeltaMovement(Vec3.ZERO);
        if (!home.equals(Vec3.ZERO) && position().distanceToSqr(home) > 1.0) {
            teleportTo(home.x, home.y, home.z);
        }
        LivingEntity target = getTarget();
        if (target != null) {
            getLookControl().setLookAt(target, 10, 10);
            double dx = target.getX() - getX();
            double dz = target.getZ() - getZ();
            setYRot((float) (Math.atan2(dz, dx) * 180 / Math.PI) - 90);
            yBodyRot = getYRot();
            yHeadRot = getYRot();
        }
        if (level() instanceof ServerLevel level && tickCount % 2 == 0) {
            level.sendParticles(ParticleTypes.FLAME, getX(), getY() + getBbHeight(), getZ(), 6, getBbWidth() * 0.4, 0.4, getBbWidth() * 0.4, 0.02);
            level.sendParticles(ParticleTypes.SOUL_FIRE_FLAME, getX(), getY() + getBbHeight() * 0.9, getZ(), 2, getBbWidth() * 0.5, 0.2, getBbWidth() * 0.5, 0.01);
        }
        // The summoner left: the rift closes.
        if (tickCount % 40 == 0 && bargainer != null && level() instanceof ServerLevel level) {
            ServerPlayer player = level.getServer().getPlayerList().getPlayer(bargainer);
            if (player == null || player.level() != level || player.distanceToSqr(this) > 96 * 96) {
                say("abandoned");
                DormammuBargain.end(this, false);
            }
        }
    }

    @Override
    protected boolean preventDeath(DamageSource source) {
        // Dormammu can't die in his own dimension's light; he yields instead.
        setHealth(1.0F);
        say("yield");
        DormammuBargain.end(this, true);
        return true;
    }

    @Override
    public boolean isPushable() {
        return false;
    }

    @Override
    public void playArrival() {
        burst(ParticleTypes.FLAME, 200, 1.5);
        burst(ParticleTypes.REVERSE_PORTAL, 150, 1.5);
        playSound(SoundEvents.WITHER_SPAWN, 3.0F, 0.4F);
        say("arrival");
    }

    @Override
    public void addAdditionalSaveData(CompoundTag tag) {
        super.addAdditionalSaveData(tag);
        if (bargainer != null) {
            tag.putUUID("Bargainer", bargainer);
        }
        tag.putDouble("AnchorX", anchor.x);
        tag.putDouble("AnchorY", anchor.y);
        tag.putDouble("AnchorZ", anchor.z);
        tag.putDouble("HomeX", home.x);
        tag.putDouble("HomeY", home.y);
        tag.putDouble("HomeZ", home.z);
        tag.putInt("Loops", loops);
    }

    @Override
    public void readAdditionalSaveData(CompoundTag tag) {
        super.readAdditionalSaveData(tag);
        bargainer = tag.hasUUID("Bargainer") ? tag.getUUID("Bargainer") : null;
        anchor = new Vec3(tag.getDouble("AnchorX"), tag.getDouble("AnchorY"), tag.getDouble("AnchorZ"));
        home = new Vec3(tag.getDouble("HomeX"), tag.getDouble("HomeY"), tag.getDouble("HomeZ"));
        loops = tag.getInt("Loops");
    }

    /** Marks spots on the ground that erupt in dark fire a moment later. Keep moving. */
    static class FirePillarAbility extends BossAbility {
        private final List<Vec3> spots = new ArrayList<>();

        FirePillarAbility(EndgameBoss boss) {
            super(boss);
        }

        @Override
        public int cooldownTicks() {
            return 140;
        }

        @Override
        public void start(LivingEntity target) {
            spots.clear();
            spots.add(target.position());
            for (int i = 0; i < 3; i++) {
                spots.add(target.position().add((boss.getRandom().nextDouble() - 0.5) * 8, 0, (boss.getRandom().nextDouble() - 0.5) * 8));
            }
        }

        @Override
        public boolean tick(LivingEntity target) {
            if (!(boss.level() instanceof ServerLevel level)) {
                return false;
            }
            if (ticks < 30) {
                for (Vec3 spot : spots) {
                    level.sendParticles(ParticleTypes.SMALL_FLAME, spot.x, spot.y + 0.1, spot.z, 4, 1.0, 0.02, 1.0, 0.0);
                }
                return true;
            }
            for (Vec3 spot : spots) {
                level.sendParticles(ParticleTypes.FLAME, spot.x, spot.y + 1.5, spot.z, 60, 0.6, 1.5, 0.6, 0.05);
                level.sendParticles(ParticleTypes.SOUL_FIRE_FLAME, spot.x, spot.y + 1.5, spot.z, 30, 0.4, 1.5, 0.4, 0.05);
                for (LivingEntity victim : boss.enemiesInRange(64)) {
                    if (victim.position().distanceToSqr(spot) < 2.5 * 2.5) {
                        boss.strike(victim, 1.4F, ModDamageTypes.DARK_DIMENSION);
                        victim.setSecondsOnFire(4);
                    }
                }
            }
            boss.playSound(SoundEvents.BLAZE_SHOOT, 2.0F, 0.5F);
            return false;
        }
    }
}
