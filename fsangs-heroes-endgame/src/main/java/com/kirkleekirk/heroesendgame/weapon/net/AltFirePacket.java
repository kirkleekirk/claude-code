package com.kirkleekirk.heroesendgame.weapon.net;

import com.kirkleekirk.heroesendgame.weapon.server.GunServer;
import net.minecraft.network.FriendlyByteBuf;
import net.minecraft.server.level.ServerPlayer;
import net.minecraftforge.network.NetworkEvent;

import java.util.function.Supplier;

/** Alternate fire (G): underbarrel grenade launcher / shotgun. */
public record AltFirePacket(float xRot, float yRot) {
    public static void encode(AltFirePacket msg, FriendlyByteBuf buf) {
        buf.writeFloat(msg.xRot());
        buf.writeFloat(msg.yRot());
    }

    public static AltFirePacket decode(FriendlyByteBuf buf) {
        return new AltFirePacket(buf.readFloat(), buf.readFloat());
    }

    public static void handle(AltFirePacket msg, Supplier<NetworkEvent.Context> ctx) {
        ctx.get().enqueueWork(() -> {
            ServerPlayer player = ctx.get().getSender();
            if (player != null) {
                GunServer.handleAltFire(player, msg);
            }
        });
        ctx.get().setPacketHandled(true);
    }
}
