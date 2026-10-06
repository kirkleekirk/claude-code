package com.kirkleekirk.heroesendgame.nemesis;

import com.kirkleekirk.heroesendgame.HeroesEndgame;
import com.kirkleekirk.heroesendgame.compat.FsangCompat;
import com.kirkleekirk.heroesendgame.config.EndgameConfig;
import com.kirkleekirk.heroesendgame.entity.EndgameBoss;
import com.kirkleekirk.heroesendgame.util.Messages;
import net.minecraft.ChatFormatting;
import net.minecraft.advancements.Advancement;
import net.minecraft.advancements.AdvancementProgress;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.minecraftforge.registries.ForgeRegistries;

import java.util.Set;
import java.util.UUID;

/**
 * Advancements ("endgame goals") and FSang skill points for beating nemeses.
 */
public final class Rewards {
    /** Advancement granted for every boss kill: heroes_endgame:kills/&lt;entity id&gt;. */
    public static void grantAdvancementsOnly(MinecraftServer server, Set<UUID> participants, EndgameBoss boss) {
        ResourceLocation type = ForgeRegistries.ENTITY_TYPES.getKey(boss.getType());
        if (type == null) {
            return;
        }
        for (UUID id : participants) {
            ServerPlayer player = server.getPlayerList().getPlayer(id);
            if (player != null) {
                award(player, HeroesEndgame.id("kills/" + type.getPath()));
            }
        }
    }

    public static void grantVictory(MinecraftServer server, Set<UUID> participants, Nemesis nemesis, EndgameBoss lastBoss) {
        grantAdvancementsOnly(server, participants, lastBoss);
        for (UUID id : participants) {
            ServerPlayer player = server.getPlayerList().getPlayer(id);
            if (player == null) {
                continue;
            }
            award(player, nemesis.advancement());
            Messages.send(player, "victory", nemesis.color(), nemesis.displayName());
            if (EndgameConfig.SKILL_POINT_REWARDS.get() && nemesis.skillPoints() > 0 && FsangCompat.addSkillPoints(player, nemesis.skillPoints())) {
                Messages.send(player, "skill_points", ChatFormatting.AQUA, nemesis.skillPoints());
            }
            checkEndgame(player);
        }
    }

    /** "Endgame": every major nemesis advancement done. */
    public static void checkEndgame(ServerPlayer player) {
        for (Nemesis nemesis : Nemesis.values()) {
            if (nemesis.isMajor() && !isDone(player, nemesis.advancement())) {
                return;
            }
        }
        award(player, HeroesEndgame.id("endgame"));
    }

    public static boolean isDone(ServerPlayer player, ResourceLocation id) {
        Advancement advancement = player.server.getAdvancements().getAdvancement(id);
        return advancement != null && player.getAdvancements().getOrStartProgress(advancement).isDone();
    }

    /** Completes every criterion of an advancement (our advancements use "impossible" criteria granted from code). */
    public static void award(ServerPlayer player, ResourceLocation id) {
        Advancement advancement = player.server.getAdvancements().getAdvancement(id);
        if (advancement == null) {
            return;
        }
        AdvancementProgress progress = player.getAdvancements().getOrStartProgress(advancement);
        if (progress.isDone()) {
            return;
        }
        for (String criterion : progress.getRemainingCriteria()) {
            player.getAdvancements().award(advancement, criterion);
        }
    }

    private Rewards() {
    }
}
