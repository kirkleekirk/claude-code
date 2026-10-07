package com.kirkleekirk.heroesendgame.weapon.net;

import com.kirkleekirk.heroesendgame.weapon.server.GunServer;
import net.minecraft.network.FriendlyByteBuf;
import net.minecraft.server.level.ServerPlayer;
import net.minecraftforge.network.NetworkEvent;

import java.util.function.Supplier;

/** Cycle fire mode (B). */
public record FireModePacket() {
    public static void encode(FireModePacket msg, FriendlyByteBuf buf) {

    }

    public static FireModePacket decode(FriendlyByteBuf buf) {
        return new FireModePacket();
    }

    public static void handle(FireModePacket msg, Supplier<NetworkEvent.Context> ctx) {
        ctx.get().enqueueWork(() -> {
            ServerPlayer player = ctx.get().getSender();
            if (player != null) {
                GunServer.handleFireMode(player, msg);
            }
        });
        ctx.get().setPacketHandled(true);
    }
}
