package com.kirkleekirk.heroesendgame.weapon.net;

import com.kirkleekirk.heroesendgame.weapon.server.GunServer;
import net.minecraft.network.FriendlyByteBuf;
import net.minecraft.server.level.ServerPlayer;
import net.minecraftforge.network.NetworkEvent;

import java.util.function.Supplier;

/** Quick melee with the gun (V): bash, or bayonet stab. */
public record MeleeBashPacket() {
    public static void encode(MeleeBashPacket msg, FriendlyByteBuf buf) {

    }

    public static MeleeBashPacket decode(FriendlyByteBuf buf) {
        return new MeleeBashPacket();
    }

    public static void handle(MeleeBashPacket msg, Supplier<NetworkEvent.Context> ctx) {
        ctx.get().enqueueWork(() -> {
            ServerPlayer player = ctx.get().getSender();
            if (player != null) {
                GunServer.handleMeleeBash(player, msg);
            }
        });
        ctx.get().setPacketHandled(true);
    }
}
