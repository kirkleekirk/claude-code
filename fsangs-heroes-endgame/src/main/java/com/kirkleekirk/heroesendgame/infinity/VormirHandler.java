package com.kirkleekirk.heroesendgame.infinity;

import com.kirkleekirk.heroesendgame.HeroesEndgame;
import com.kirkleekirk.heroesendgame.compat.AdAstraCompat;
import com.kirkleekirk.heroesendgame.config.EndgameConfig;
import com.kirkleekirk.heroesendgame.entity.infinity.StonekeeperEntity;
import com.kirkleekirk.heroesendgame.nemesis.Rewards;
import com.kirkleekirk.heroesendgame.registry.ModEntities;
import com.kirkleekirk.heroesendgame.registry.ModItems;
import com.kirkleekirk.heroesendgame.util.Messages;
import net.minecraft.ChatFormatting;
import net.minecraft.core.particles.DustParticleOptions;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.core.registries.Registries;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceKey;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.tags.BiomeTags;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.OwnableEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;
import org.joml.Vector3f;

import java.util.List;
import java.util.UUID;

/**
 * Vormir and the Soul Stone. "A soul for a soul."
 * <p>
 * Vormir is Ad Astra's Glacio (the frozen world around Proxima Centauri) by default - configurable. Without Ad Astra
 * it's the highest mountain peaks of the overworld, at night. Stand there while the Soul Stone is unclaimed and the
 * Stonekeeper appears. The stone demands the death of something you love: one of your own tamed animals, or a
 * fellow player who dies at your side.
 */
public final class VormirHandler {
    /** Every 2 seconds per player. */
    public static void check(ServerPlayer player) {
        if (!EndgameConfig.isLoaded() || !EndgameConfig.INFINITY_ENABLED.get() || player.isSpectator()) {
            return;
        }
        if (!isOnVormir(player)) {
            return;
        }
        InfinityCampaign campaign = InfinityCampaign.get(player.server);
        if (!campaign.isUnclaimed(InfinityStone.SOUL)) {
            return;
        }
        ServerLevel level = player.serverLevel();
        List<StonekeeperEntity> keepers = level.getEntitiesOfClass(StonekeeperEntity.class, player.getBoundingBox().inflate(48));
        if (!keepers.isEmpty()) {
            return;
        }
        StonekeeperEntity keeper = ModEntities.STONEKEEPER.get().create(level);
        if (keeper == null) {
            return;
        }
        Vec3 look = player.getLookAngle().multiply(1, 0, 1).normalize();
        Vec3 pos = player.position().add(look.scale(5)).add(0, 1.0, 0);
        keeper.moveTo(pos.x, pos.y, pos.z, player.getYRot() + 180, 0);
        keeper.greet(player);
        level.addFreshEntity(keeper);
        level.sendParticles(ParticleTypes.LARGE_SMOKE, pos.x, pos.y + 1, pos.z, 40, 0.4, 0.8, 0.4, 0.02);
        level.playSound(null, keeper.blockPosition(), SoundEvents.SOUL_ESCAPE, SoundSource.HOSTILE, 2.0F, 0.5F);
    }

    public static boolean isOnVormir(ServerPlayer player) {
        Level level = player.level();
        ResourceKey<Level> configured = ResourceKey.create(Registries.DIMENSION, new ResourceLocation(EndgameConfig.INFINITY_VORMIR_DIMENSION.get()));
        boolean vormirExists = player.server.getLevel(configured) != null;
        if (vormirExists) {
            return level.dimension() == configured && player.getY() >= EndgameConfig.INFINITY_VORMIR_MIN_Y.get();
        }
        // Fallback: the top of the world's highest mountains, at night.
        return level.dimension() == Level.OVERWORLD && player.getY() >= EndgameConfig.INFINITY_VORMIR_FALLBACK_MIN_Y.get()
                && level.isNight() && level.getBiome(player.blockPosition()).is(BiomeTags.IS_MOUNTAIN);
    }

    /** A creature died. If it was loved and the Stonekeeper is watching, the Soul Stone answers. */
    public static void onDeath(LivingEntity victim) {
        if (!(victim.level() instanceof ServerLevel level)) {
            return;
        }
        InfinityCampaign campaign = InfinityCampaign.get(level.getServer());
        if (!campaign.isUnclaimed(InfinityStone.SOUL)) {
            return;
        }
        List<StonekeeperEntity> keepers = level.getEntitiesOfClass(StonekeeperEntity.class, victim.getBoundingBox().inflate(48));
        if (keepers.isEmpty()) {
            return;
        }
        StonekeeperEntity keeper = keepers.get(0);
        ServerPlayer claimant = null;
        if (victim instanceof OwnableEntity ownable && ownable.getOwnerUUID() != null) {
            ServerPlayer owner = level.getServer().getPlayerList().getPlayer(ownable.getOwnerUUID());
            if (owner != null && owner.level() == level && owner.distanceToSqr(keeper) < 48 * 48) {
                claimant = owner;
            }
        } else if (victim instanceof ServerPlayer fallen) {
            claimant = nearestOtherPlayer(level, fallen, keeper);
        }
        if (claimant == null) {
            return;
        }
        grant(level, claimant, keeper, victim);
    }

    @Nullable
    private static ServerPlayer nearestOtherPlayer(ServerLevel level, ServerPlayer fallen, StonekeeperEntity keeper) {
        ServerPlayer best = null;
        double bestDistance = 48 * 48;
        for (ServerPlayer player : level.players()) {
            if (player == fallen || player.isSpectator() || !player.isAlive()) {
                continue;
            }
            double d = player.distanceToSqr(keeper);
            if (d < bestDistance) {
                bestDistance = d;
                best = player;
            }
        }
        return best;
    }

    private static void grant(ServerLevel level, ServerPlayer claimant, StonekeeperEntity keeper, LivingEntity sacrifice) {
        InfinityCampaign campaign = InfinityCampaign.get(level.getServer());
        keeper.speak(level, "accepted", sacrifice.getDisplayName());
        ItemStack stone = new ItemStack(ModItems.stone(InfinityStone.SOUL));
        if (!claimant.getInventory().add(stone)) {
            claimant.drop(stone, false);
        }
        campaign.markFound(InfinityStone.SOUL, claimant);
        // Thanos woke up in water, holding the stone. Gamora's fate stays with you.
        claimant.addEffect(new MobEffectInstance(MobEffects.WATER_BREATHING, 1200, 0));
        claimant.addEffect(new MobEffectInstance(MobEffects.CONFUSION, 100, 0));
        int c = InfinityStone.SOUL.color();
        level.sendParticles(new DustParticleOptions(new Vector3f(((c >> 16) & 255) / 255F, ((c >> 8) & 255) / 255F, (c & 255) / 255F), 2.0F),
                claimant.getX(), claimant.getY() + 1, claimant.getZ(), 80, 0.6, 1.0, 0.6, 0.0);
        level.playSound(null, claimant.blockPosition(), SoundEvents.TOTEM_USE, SoundSource.PLAYERS, 1.0F, 0.6F);
        Messages.title(claimant, InfinityStone.SOUL.displayName(), Component.translatable("message.heroes_endgame.vormir.subtitle").withStyle(ChatFormatting.GRAY));
        Rewards.award(claimant, HeroesEndgame.id("soul_for_a_soul"));
        level.sendParticles(ParticleTypes.LARGE_SMOKE, keeper.getX(), keeper.getY() + 1, keeper.getZ(), 40, 0.4, 0.8, 0.4, 0.02);
        keeper.discard();
    }

    /** Debug helper used by /endgame infinity vormir. */
    public static boolean isVormirDimensionAvailable(net.minecraft.server.MinecraftServer server) {
        ResourceKey<Level> configured = ResourceKey.create(Registries.DIMENSION, new ResourceLocation(EndgameConfig.INFINITY_VORMIR_DIMENSION.get()));
        return server.getLevel(configured) != null || AdAstraCompat.isLoaded();
    }

    @Nullable
    public static UUID visitorOf(StonekeeperEntity keeper) {
        return keeper.getVisitor();
    }

    private VormirHandler() {
    }
}
