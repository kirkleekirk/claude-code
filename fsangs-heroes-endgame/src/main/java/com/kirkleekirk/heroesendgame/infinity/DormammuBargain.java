package com.kirkleekirk.heroesendgame.infinity;

import com.kirkleekirk.heroesendgame.HeroesEndgame;
import com.kirkleekirk.heroesendgame.entity.infinity.DormammuEntity;
import com.kirkleekirk.heroesendgame.nemesis.Rewards;
import com.kirkleekirk.heroesendgame.registry.ModEntities;
import com.kirkleekirk.heroesendgame.registry.ModItems;
import com.kirkleekirk.heroesendgame.util.Messages;
import net.minecraft.ChatFormatting;
import net.minecraft.core.particles.DustParticleOptions;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.effect.MobEffectCategory;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.entity.MobSpawnType;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;
import org.joml.Vector3f;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * "Dormammu, I've come to bargain."
 * <p>
 * Opening the sealed Eye of Agamotto in the Nether tears a way into the Dark Dimension. While Dormammu lives, the
 * sorcerer who summoned him cannot die: every killing blow loops time back to the moment the bargain began.
 * Each loop costs Dormammu; eventually he gives up the Time Stone just to be rid of you.
 */
public final class DormammuBargain {
    public static boolean summon(ServerPlayer player) {
        ServerLevel level = player.serverLevel();
        InfinityCampaign campaign = InfinityCampaign.get(player.server);
        InfinityState.Owner owner = campaign.owner(InfinityStone.TIME);
        if (owner == InfinityState.Owner.THANOS) {
            Messages.send(player, "eye.taken", ChatFormatting.DARK_PURPLE);
            return false;
        }
        if (owner == InfinityState.Owner.FOUND) {
            Messages.send(player, "eye.empty", ChatFormatting.GRAY);
            return false;
        }
        if (level.dimension() != Level.NETHER) {
            Messages.send(player, "eye.wrong_place", ChatFormatting.GOLD);
            return false;
        }
        if (find(player) != null) {
            Messages.send(player, "eye.already", ChatFormatting.GOLD);
            return false;
        }
        DormammuEntity dormammu = ModEntities.DORMAMMU.get().create(level);
        if (dormammu == null) {
            return false;
        }
        Vec3 look = player.getLookAngle().multiply(1, 0, 1).normalize();
        Vec3 home = player.position().add(look.scale(16)).add(0, 5, 0);
        dormammu.moveTo(home.x, home.y, home.z, player.getYRot() + 180, 0);
        dormammu.finalizeSpawn(level, level.getCurrentDifficultyAt(dormammu.blockPosition()), MobSpawnType.EVENT, null, null);
        dormammu.setupFor(player, null, UUID.randomUUID(), 1, 1.0F, 0);
        dormammu.beginBargain(player, home);
        level.addFreshEntity(dormammu);
        dormammu.playArrival();
        player.sendSystemMessage(Component.literal("<").append(player.getDisplayName()).append("> ")
                .append(Component.translatable("boss.heroes_endgame.dormammu.bargain")).withStyle(ChatFormatting.AQUA));
        return true;
    }

    /** The Dormammu currently bargaining with this player, if any. */
    @Nullable
    public static DormammuEntity find(ServerPlayer player) {
        for (DormammuEntity dormammu : player.serverLevel().getEntitiesOfClass(DormammuEntity.class, player.getBoundingBox().inflate(160))) {
            if (player.getUUID().equals(dormammu.getBargainer()) && dormammu.isAlive()) {
                return dormammu;
            }
        }
        return null;
    }

    /**
     * Called when the player would die. Returns true if time looped instead (cancel the death).
     */
    public static boolean onPlayerDeath(ServerPlayer player) {
        DormammuEntity dormammu = find(player);
        if (dormammu == null) {
            return false;
        }
        ServerLevel level = player.serverLevel();
        DustParticleOptions green = new DustParticleOptions(new Vector3f(0.1F, 0.85F, 0.3F), 1.8F);
        level.sendParticles(green, player.getX(), player.getY() + 1, player.getZ(), 60, 0.6, 1.0, 0.6, 0.0);

        // Back to the start of the loop.
        Vec3 anchor = dormammu.getAnchor();
        player.setHealth(player.getMaxHealth());
        player.getFoodData().setFoodLevel(20);
        player.clearFire();
        List<MobEffectInstance> harmful = new ArrayList<>();
        for (MobEffectInstance effect : player.getActiveEffects()) {
            if (effect.getEffect().getCategory() == MobEffectCategory.HARMFUL) {
                harmful.add(effect);
            }
        }
        harmful.forEach(effect -> player.removeEffect(effect.getEffect()));
        player.teleportTo(anchor.x, anchor.y, anchor.z);
        player.fallDistance = 0;
        player.invulnerableTime = 40;
        level.sendParticles(green, anchor.x, anchor.y + 1, anchor.z, 60, 0.6, 1.0, 0.6, 0.0);
        level.playSound(null, player.blockPosition(), SoundEvents.BEACON_DEACTIVATE, SoundSource.PLAYERS, 2.0F, 1.5F);
        player.sendSystemMessage(Component.literal("<").append(player.getDisplayName()).append("> ")
                .append(Component.translatable("boss.heroes_endgame.dormammu.bargain")).withStyle(ChatFormatting.AQUA));
        Messages.title(player, Component.translatable("message.heroes_endgame.dormammu.loop_title").withStyle(ChatFormatting.GREEN),
                Component.translatable("message.heroes_endgame.dormammu.loop_subtitle", dormammu.getLoops() + 1).withStyle(ChatFormatting.GRAY));

        if (dormammu.onLoop()) {
            end(dormammu, true);
        }
        return true;
    }

    /** Ends the bargain. {@code yielded}: Dormammu gives up the Time Stone. */
    public static void end(DormammuEntity dormammu, boolean yielded) {
        if (!(dormammu.level() instanceof ServerLevel level)) {
            return;
        }
        UUID bargainer = dormammu.getBargainer();
        ServerPlayer player = bargainer == null ? null : level.getServer().getPlayerList().getPlayer(bargainer);
        if (yielded && player != null) {
            InfinityCampaign campaign = InfinityCampaign.get(level.getServer());
            if (campaign.isUnclaimed(InfinityStone.TIME)) {
                consumeEye(player);
                ItemStack stone = new ItemStack(ModItems.stone(InfinityStone.TIME));
                if (!player.getInventory().add(stone)) {
                    player.drop(stone, false);
                }
                campaign.markFound(InfinityStone.TIME, player);
                Messages.title(player, InfinityStone.TIME.displayName(),
                        Component.translatable("message.heroes_endgame.dormammu.won_subtitle").withStyle(ChatFormatting.GRAY));
            }
            Rewards.award(player, HeroesEndgame.id("nemesis/dormammu"));
            Rewards.checkEndgame(player);
        }
        dormammu.burst(net.minecraft.core.particles.ParticleTypes.REVERSE_PORTAL, 200, 1.5);
        level.playSound(null, dormammu.blockPosition(), SoundEvents.WITHER_DEATH, SoundSource.HOSTILE, 2.0F, 0.5F);
        dormammu.discard();
    }

    private static void consumeEye(ServerPlayer player) {
        Inventory inventory = player.getInventory();
        for (int i = 0; i < inventory.getContainerSize(); i++) {
            ItemStack stack = inventory.getItem(i);
            if (stack.is(ModItems.SEALED_EYE_OF_AGAMOTTO.get())) {
                stack.shrink(1);
                return;
            }
        }
    }

    private DormammuBargain() {
    }
}
