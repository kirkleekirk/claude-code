package com.kirkleekirk.heroesendgame.weapon.net;

import com.kirkleekirk.heroesendgame.weapon.server.GunServer;
import net.minecraft.network.FriendlyByteBuf;
import net.minecraft.server.level.ServerPlayer;
import net.minecraftforge.network.NetworkEvent;

import java.util.function.Supplier;

/** Started/stopped aiming down sights. */
public record AimPacket(boolean aiming) {
    public static void encode(AimPacket msg, FriendlyByteBuf buf) {
        buf.writeBoolean(msg.aiming());
    }

    public static AimPacket decode(FriendlyByteBuf buf) {
        return new AimPacket(buf.readBoolean());
    }

    public static void handle(AimPacket msg, Supplier<NetworkEvent.Context> ctx) {
        ctx.get().enqueueWork(() -> {
            ServerPlayer player = ctx.get().getSender();
            if (player != null) {
                GunServer.handleAim(player, msg);
            }
        });
        ctx.get().setPacketHandled(true);
    }
}
