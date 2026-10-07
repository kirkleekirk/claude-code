package com.kirkleekirk.heroesendgame.weapon.net;

import com.kirkleekirk.heroesendgame.weapon.server.GunServer;
import net.minecraft.network.FriendlyByteBuf;
import net.minecraft.server.level.ServerPlayer;
import net.minecraftforge.network.NetworkEvent;

import java.util.function.Supplier;

/** Reload key (R). */
public record ReloadPacket() {
    public static void encode(ReloadPacket msg, FriendlyByteBuf buf) {

    }

    public static ReloadPacket decode(FriendlyByteBuf buf) {
        return new ReloadPacket();
    }

    public static void handle(ReloadPacket msg, Supplier<NetworkEvent.Context> ctx) {
        ctx.get().enqueueWork(() -> {
            ServerPlayer player = ctx.get().getSender();
            if (player != null) {
                GunServer.handleReload(player, msg);
            }
        });
        ctx.get().setPacketHandled(true);
    }
}
