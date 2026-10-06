package com.kirkleekirk.heroesendgame.util;

import com.kirkleekirk.heroesendgame.config.EndgameConfig;
import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;
import net.minecraft.network.protocol.game.ClientboundSetSubtitleTextPacket;
import net.minecraft.network.protocol.game.ClientboundSetTitleTextPacket;
import net.minecraft.network.protocol.game.ClientboundSetTitlesAnimationPacket;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundSource;
import org.jetbrains.annotations.Nullable;

/**
 * Chat, title and announcement helpers. All text is translatable (assets/heroes_endgame/lang).
 */
public final class Messages {
    public static Component key(String key, Object... args) {
        return Component.translatable("message.heroes_endgame." + key, args);
    }

    public static void send(ServerPlayer player, String key, ChatFormatting color, Object... args) {
        player.sendSystemMessage(key(key, args).copy().withStyle(color));
    }

    /** A big centred title + subtitle. */
    public static void title(ServerPlayer player, Component title, @Nullable Component subtitle) {
        player.connection.send(new ClientboundSetTitlesAnimationPacket(10, 70, 20));
        player.connection.send(new ClientboundSetTitleTextPacket(title));
        if (subtitle != null) {
            player.connection.send(new ClientboundSetSubtitleTextPacket(subtitle));
        }
    }

    /**
     * Server-wide announcement (or only to {@code focus} if global announcements are disabled).
     */
    public static void announce(MinecraftServer server, @Nullable ServerPlayer focus, Component message) {
        if (EndgameConfig.GLOBAL_ANNOUNCEMENTS.get()) {
            for (ServerPlayer player : server.getPlayerList().getPlayers()) {
                player.sendSystemMessage(message);
            }
        } else if (focus != null) {
            focus.sendSystemMessage(message);
        }
    }

    public static void announceAll(MinecraftServer server, Component message) {
        for (ServerPlayer player : server.getPlayerList().getPlayers()) {
            player.sendSystemMessage(message);
        }
    }

    public static void sound(ServerPlayer player, SoundEvent sound, float volume, float pitch) {
        player.playNotifySound(sound, SoundSource.HOSTILE, volume, pitch);
    }

    private Messages() {
    }
}
