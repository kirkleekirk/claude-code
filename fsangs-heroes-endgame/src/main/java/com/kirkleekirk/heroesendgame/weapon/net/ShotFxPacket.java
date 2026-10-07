package com.kirkleekirk.heroesendgame.weapon.net;

import net.minecraft.world.phys.Vec3;

import java.util.List;
import net.minecraft.network.FriendlyByteBuf;
import net.minecraftforge.api.distmarker.Dist;
import net.minecraftforge.fml.DistExecutor;
import net.minecraftforge.network.NetworkEvent;

import java.util.function.Supplier;

/** A shot for other players to see: muzzle flash on the shooter's model, tracers from the muzzle to each impact. flags: bit0 suppressed, bit1 tracer, bit2 offhand (akimbo); effect = AmmoEffect ordinal (impact particles). */
public record ShotFxPacket(int shooterId, int flags, int effect, Vec3 from, List<Vec3> impacts) {
    public static void encode(ShotFxPacket msg, FriendlyByteBuf buf) {
        buf.writeVarInt(msg.shooterId());
        buf.writeByte(msg.flags());
        buf.writeByte(msg.effect());
        writeVec(buf, msg.from());
        buf.writeCollection(msg.impacts(), ShotFxPacket::writeVec);
    }

    public static ShotFxPacket decode(FriendlyByteBuf buf) {
        return new ShotFxPacket(buf.readVarInt(), buf.readByte(), buf.readByte(), readVec(buf), buf.readList(ShotFxPacket::readVec));
    }

    public static void handle(ShotFxPacket msg, Supplier<NetworkEvent.Context> ctx) {
        ctx.get().enqueueWork(() -> DistExecutor.unsafeRunWhenOn(Dist.CLIENT,
                () -> () -> com.kirkleekirk.heroesendgame.weapon.client.ClientWeaponHandler.handleShotFx(msg)));
        ctx.get().setPacketHandled(true);
    }

    private static void writeVec(FriendlyByteBuf buf, Vec3 vec) {
        buf.writeDouble(vec.x);
        buf.writeDouble(vec.y);
        buf.writeDouble(vec.z);
    }

    private static Vec3 readVec(FriendlyByteBuf buf) {
        return new Vec3(buf.readDouble(), buf.readDouble(), buf.readDouble());
    }
}
