package com.kirkleekirk.heroesendgame.weapon.net;

import net.minecraft.network.FriendlyByteBuf;
import net.minecraftforge.api.distmarker.Dist;
import net.minecraftforge.fml.DistExecutor;
import net.minecraftforge.network.NetworkEvent;

import java.util.function.Supplier;

/** Another player started/stopped aiming (third-person arm pose). */
public record RemoteAimPacket(int entityId, boolean aiming) {
    public static void encode(RemoteAimPacket msg, FriendlyByteBuf buf) {
        buf.writeVarInt(msg.entityId());
        buf.writeBoolean(msg.aiming());
    }

    public static RemoteAimPacket decode(FriendlyByteBuf buf) {
        return new RemoteAimPacket(buf.readVarInt(), buf.readBoolean());
    }

    public static void handle(RemoteAimPacket msg, Supplier<NetworkEvent.Context> ctx) {
        ctx.get().enqueueWork(() -> DistExecutor.unsafeRunWhenOn(Dist.CLIENT,
                () -> () -> com.kirkleekirk.heroesendgame.weapon.client.ClientWeaponHandler.handleRemoteAim(msg)));
        ctx.get().setPacketHandled(true);
    }
}
