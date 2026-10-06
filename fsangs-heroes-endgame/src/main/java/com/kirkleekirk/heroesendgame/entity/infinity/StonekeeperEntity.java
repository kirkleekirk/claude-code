package com.kirkleekirk.heroesendgame.entity.infinity;

import net.minecraft.ChatFormatting;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.MutableComponent;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.PathfinderMob;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.ai.goal.LookAtPlayerGoal;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.Level;
import org.jetbrains.annotations.Nullable;

import java.util.UUID;

/**
 * The Red Skull, bound to Vormir as the guide to the Soul Stone. He cannot be harmed and cannot leave; he only
 * explains the price: a soul for a soul. See {@link com.kirkleekirk.heroesendgame.infinity.VormirHandler}.
 */
public class StonekeeperEntity extends PathfinderMob {
    @Nullable
    private UUID visitor;
    private int lonelyTicks;
    private int speech;

    public StonekeeperEntity(EntityType<? extends StonekeeperEntity> type, Level level) {
        super(type, level);
        setNoGravity(true);
        setInvulnerable(true);
        setPersistenceRequired();
    }

    public static AttributeSupplier.Builder createAttributes() {
        return PathfinderMob.createMobAttributes().add(Attributes.MAX_HEALTH, 100).add(Attributes.MOVEMENT_SPEED, 0.0);
    }

    @Override
    protected void registerGoals() {
        this.goalSelector.addGoal(1, new LookAtPlayerGoal(this, Player.class, 32.0F, 1.0F));
    }

    public void greet(ServerPlayer player) {
        this.visitor = player.getUUID();
        this.speech = 0;
    }

    @Nullable
    public UUID getVisitor() {
        return visitor;
    }

    @Override
    public void tick() {
        super.tick();
        setDeltaMovement(getDeltaMovement().multiply(0, 0, 0).add(0, Math.sin(tickCount * 0.05) * 0.01, 0));
        if (!(level() instanceof ServerLevel level)) {
            if (tickCount % 3 == 0) {
                level().addParticle(ParticleTypes.SMOKE, getRandomX(0.6), getY() + random.nextDouble() * 0.6, getRandomZ(0.6), 0, -0.02, 0);
            }
            return;
        }
        Player nearest = level.getNearestPlayer(this, 32);
        if (nearest == null) {
            if (++lonelyTicks > 1200) {
                level.sendParticles(ParticleTypes.LARGE_SMOKE, getX(), getY() + 1, getZ(), 30, 0.4, 0.8, 0.4, 0.02);
                discard();
            }
            return;
        }
        lonelyTicks = 0;
        if (visitor != null && tickCount % 20 == 0 && speech < 5) {
            int[] at = {1, 4, 8, 12, 16};
            if (tickCount / 20 >= at[speech]) {
                ServerPlayer player = level.getServer().getPlayerList().getPlayer(visitor);
                speak(level, "line" + speech, player != null ? player.getDisplayName() : Component.literal("traveller"));
                speech++;
            }
        }
    }

    public void speak(ServerLevel level, String line, Object... args) {
        MutableComponent message = Component.literal("<").append(getDisplayName()).append("> ").withStyle(ChatFormatting.DARK_RED)
                .append(Component.translatable("boss.heroes_endgame.stonekeeper." + line, args).withStyle(ChatFormatting.GRAY, ChatFormatting.ITALIC));
        for (ServerPlayer player : level.players()) {
            if (player.distanceToSqr(this) < 48 * 48) {
                player.sendSystemMessage(message);
            }
        }
    }

    @Override
    public boolean hurt(DamageSource source, float amount) {
        return source.is(net.minecraft.tags.DamageTypeTags.BYPASSES_INVULNERABILITY) && super.hurt(source, amount);
    }

    @Override
    public boolean isPushable() {
        return false;
    }

    @Override
    protected void doPush(net.minecraft.world.entity.Entity entity) {
    }

    @Override
    public boolean removeWhenFarAway(double distance) {
        return false;
    }

    @Override
    public boolean canChangeDimensions() {
        return false;
    }

    @Override
    public void addAdditionalSaveData(CompoundTag tag) {
        super.addAdditionalSaveData(tag);
        if (visitor != null) {
            tag.putUUID("Visitor", visitor);
        }
        tag.putInt("Speech", speech);
    }

    @Override
    public void readAdditionalSaveData(CompoundTag tag) {
        super.readAdditionalSaveData(tag);
        visitor = tag.hasUUID("Visitor") ? tag.getUUID("Visitor") : null;
        speech = tag.getInt("Speech");
    }
}
