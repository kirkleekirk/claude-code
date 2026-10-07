package com.kirkleekirk.heroesendgame.weapon.net;

import net.minecraft.network.FriendlyByteBuf;
import net.minecraftforge.api.distmarker.Dist;
import net.minecraftforge.fml.DistExecutor;
import net.minecraftforge.network.NetworkEvent;

import java.util.function.Supplier;

/** Tells the shooter they hit something: kind 0 hit, 1 headshot, 2 kill, 3 blocked/armoured. */
public record HitMarkerPacket(int kind) {
    public static void encode(HitMarkerPacket msg, FriendlyByteBuf buf) {
        buf.writeByte(msg.kind());
    }

    public static HitMarkerPacket decode(FriendlyByteBuf buf) {
        return new HitMarkerPacket(buf.readByte());
    }

    public static void handle(HitMarkerPacket msg, Supplier<NetworkEvent.Context> ctx) {
        ctx.get().enqueueWork(() -> DistExecutor.unsafeRunWhenOn(Dist.CLIENT,
                () -> () -> com.kirkleekirk.heroesendgame.weapon.client.ClientWeaponHandler.handleHitMarker(msg)));
        ctx.get().setPacketHandled(true);
    }
}
