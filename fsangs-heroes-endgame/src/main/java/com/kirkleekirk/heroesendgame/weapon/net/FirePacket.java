package com.kirkleekirk.heroesendgame.weapon.net;

import com.kirkleekirk.heroesendgame.weapon.server.GunServer;
import net.minecraft.network.FriendlyByteBuf;
import net.minecraft.server.level.ServerPlayer;
import net.minecraftforge.network.NetworkEvent;

import java.util.function.Supplier;

/** Client pulled the trigger for one round (or one round of a burst). xRot/yRot = where the client was aiming; offhand = which akimbo gun fired; seed makes the spread pattern reproducible. */
public record FirePacket(float xRot, float yRot, boolean aiming, boolean offhand, int seed) {
    public static void encode(FirePacket msg, FriendlyByteBuf buf) {
        buf.writeFloat(msg.xRot());
        buf.writeFloat(msg.yRot());
        buf.writeBoolean(msg.aiming());
        buf.writeBoolean(msg.offhand());
        buf.writeVarInt(msg.seed());
    }

    public static FirePacket decode(FriendlyByteBuf buf) {
        return new FirePacket(buf.readFloat(), buf.readFloat(), buf.readBoolean(), buf.readBoolean(), buf.readVarInt());
    }

    public static void handle(FirePacket msg, Supplier<NetworkEvent.Context> ctx) {
        ctx.get().enqueueWork(() -> {
            ServerPlayer player = ctx.get().getSender();
            if (player != null) {
                GunServer.handleFire(player, msg);
            }
        });
        ctx.get().setPacketHandled(true);
    }
}
