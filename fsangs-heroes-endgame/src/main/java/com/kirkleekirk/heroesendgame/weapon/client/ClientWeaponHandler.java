package com.kirkleekirk.heroesendgame.weapon.client;

import com.kirkleekirk.heroesendgame.weapon.net.HitMarkerPacket;
import com.kirkleekirk.heroesendgame.weapon.net.ReloadFxPacket;
import com.kirkleekirk.heroesendgame.weapon.net.RemoteAimPacket;
import com.kirkleekirk.heroesendgame.weapon.net.ShotFxPacket;

/**
 * Client side of server -> client weapon packets. Only ever loaded on the client (packets use DistExecutor).
 * Skeleton - the gun engine (client) fills it in.
 */
public final class ClientWeaponHandler {
    private ClientWeaponHandler() {
    }

    public static void handleShotFx(ShotFxPacket msg) {
    }

    public static void handleHitMarker(HitMarkerPacket msg) {
    }

    public static void handleReloadFx(ReloadFxPacket msg) {
    }

    public static void handleRemoteAim(RemoteAimPacket msg) {
    }
}
