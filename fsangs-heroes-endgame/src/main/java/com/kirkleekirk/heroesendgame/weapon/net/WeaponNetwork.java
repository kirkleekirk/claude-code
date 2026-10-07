package com.kirkleekirk.heroesendgame.weapon.net;

import com.kirkleekirk.heroesendgame.HeroesEndgame;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.Entity;
import net.minecraftforge.network.NetworkDirection;
import net.minecraftforge.network.NetworkRegistry;
import net.minecraftforge.network.PacketDistributor;
import net.minecraftforge.network.simple.SimpleChannel;

import java.util.Optional;

/**
 * The weapon channel. Packet classes live in this package; each one delegates to
 * {@link com.kirkleekirk.heroesendgame.weapon.server.GunServer} (client -> server) or, on the client only,
 * {@link com.kirkleekirk.heroesendgame.weapon.client.ClientWeaponHandler} (server -> client).
 */
public final class WeaponNetwork {
    private static final String VERSION = "1";
    public static final SimpleChannel CHANNEL = NetworkRegistry.newSimpleChannel(HeroesEndgame.id("weapons"),
            () -> VERSION, VERSION::equals, VERSION::equals);
    private static boolean registered;

    private WeaponNetwork() {
    }

    public static void register() {
        if (registered) {
            return;
        }
        registered = true;
        int id = 0;
        // client -> server
        CHANNEL.registerMessage(id++, FirePacket.class, FirePacket::encode, FirePacket::decode, FirePacket::handle, Optional.of(NetworkDirection.PLAY_TO_SERVER));
        CHANNEL.registerMessage(id++, AltFirePacket.class, AltFirePacket::encode, AltFirePacket::decode, AltFirePacket::handle, Optional.of(NetworkDirection.PLAY_TO_SERVER));
        CHANNEL.registerMessage(id++, ReloadPacket.class, ReloadPacket::encode, ReloadPacket::decode, ReloadPacket::handle, Optional.of(NetworkDirection.PLAY_TO_SERVER));
        CHANNEL.registerMessage(id++, FireModePacket.class, FireModePacket::encode, FireModePacket::decode, FireModePacket::handle, Optional.of(NetworkDirection.PLAY_TO_SERVER));
        CHANNEL.registerMessage(id++, AimPacket.class, AimPacket::encode, AimPacket::decode, AimPacket::handle, Optional.of(NetworkDirection.PLAY_TO_SERVER));
        CHANNEL.registerMessage(id++, MeleeBashPacket.class, MeleeBashPacket::encode, MeleeBashPacket::decode, MeleeBashPacket::handle, Optional.of(NetworkDirection.PLAY_TO_SERVER));
        // server -> client
        CHANNEL.registerMessage(id++, ShotFxPacket.class, ShotFxPacket::encode, ShotFxPacket::decode, ShotFxPacket::handle, Optional.of(NetworkDirection.PLAY_TO_CLIENT));
        CHANNEL.registerMessage(id++, HitMarkerPacket.class, HitMarkerPacket::encode, HitMarkerPacket::decode, HitMarkerPacket::handle, Optional.of(NetworkDirection.PLAY_TO_CLIENT));
        CHANNEL.registerMessage(id++, ReloadFxPacket.class, ReloadFxPacket::encode, ReloadFxPacket::decode, ReloadFxPacket::handle, Optional.of(NetworkDirection.PLAY_TO_CLIENT));
        CHANNEL.registerMessage(id++, RemoteAimPacket.class, RemoteAimPacket::encode, RemoteAimPacket::decode, RemoteAimPacket::handle, Optional.of(NetworkDirection.PLAY_TO_CLIENT));
    }

    public static void toServer(Object packet) {
        CHANNEL.sendToServer(packet);
    }

    public static void toPlayer(ServerPlayer player, Object packet) {
        CHANNEL.send(PacketDistributor.PLAYER.with(() -> player), packet);
    }

    /** Everyone tracking the entity (not the entity itself). */
    public static void toTracking(Entity entity, Object packet) {
        CHANNEL.send(PacketDistributor.TRACKING_ENTITY.with(() -> entity), packet);
    }

    /** Everyone tracking the entity and, if it is a player, the player too. */
    public static void toTrackingAndSelf(Entity entity, Object packet) {
        CHANNEL.send(PacketDistributor.TRACKING_ENTITY_AND_SELF.with(() -> entity), packet);
    }
}
