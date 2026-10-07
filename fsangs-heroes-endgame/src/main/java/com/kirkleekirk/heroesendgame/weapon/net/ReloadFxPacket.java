package com.kirkleekirk.heroesendgame.weapon.net;

import net.minecraft.network.FriendlyByteBuf;
import net.minecraftforge.api.distmarker.Dist;
import net.minecraftforge.fml.DistExecutor;
import net.minecraftforge.network.NetworkEvent;

import java.util.function.Supplier;

/** A reload started (durationTicks > 0) or was cancelled/finished (durationTicks = 0) for an entity, for animations and third-person poses. shells = per-shell reload. */
public record ReloadFxPacket(int entityId, int durationTicks, boolean empty) {
    public static void encode(ReloadFxPacket msg, FriendlyByteBuf buf) {
        buf.writeVarInt(msg.entityId());
        buf.writeVarInt(msg.durationTicks());
        buf.writeBoolean(msg.empty());
    }

    public static ReloadFxPacket decode(FriendlyByteBuf buf) {
        return new ReloadFxPacket(buf.readVarInt(), buf.readVarInt(), buf.readBoolean());
    }

    public static void handle(ReloadFxPacket msg, Supplier<NetworkEvent.Context> ctx) {
        ctx.get().enqueueWork(() -> DistExecutor.unsafeRunWhenOn(Dist.CLIENT,
                () -> () -> com.kirkleekirk.heroesendgame.weapon.client.ClientWeaponHandler.handleReloadFx(msg)));
        ctx.get().setPacketHandled(true);
    }
}
