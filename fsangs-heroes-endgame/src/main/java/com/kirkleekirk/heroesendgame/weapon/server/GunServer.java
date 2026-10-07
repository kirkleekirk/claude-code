package com.kirkleekirk.heroesendgame.weapon.server;

import com.kirkleekirk.heroesendgame.weapon.net.AimPacket;
import com.kirkleekirk.heroesendgame.weapon.net.AltFirePacket;
import com.kirkleekirk.heroesendgame.weapon.net.FireModePacket;
import com.kirkleekirk.heroesendgame.weapon.net.FirePacket;
import com.kirkleekirk.heroesendgame.weapon.net.MeleeBashPacket;
import com.kirkleekirk.heroesendgame.weapon.net.ReloadPacket;
import net.minecraft.server.level.ServerPlayer;

/** Server side of the guns: every client -> server weapon packet lands here (skeleton - the gun engine fills it in). */
public final class GunServer {
    private GunServer() {
    }

    public static void handleFire(ServerPlayer player, FirePacket msg) {
    }

    public static void handleAltFire(ServerPlayer player, AltFirePacket msg) {
    }

    public static void handleReload(ServerPlayer player, ReloadPacket msg) {
    }

    public static void handleFireMode(ServerPlayer player, FireModePacket msg) {
    }

    public static void handleAim(ServerPlayer player, AimPacket msg) {
    }

    public static void handleMeleeBash(ServerPlayer player, MeleeBashPacket msg) {
    }
}
