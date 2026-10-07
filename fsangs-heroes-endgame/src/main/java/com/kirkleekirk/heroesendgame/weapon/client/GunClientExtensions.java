package com.kirkleekirk.heroesendgame.weapon.client;

import net.minecraftforge.client.extensions.common.IClientItemExtensions;

/** Client extensions shared by every gun: custom renderer, arm poses (skeleton - the gun engine fills it in). */
public final class GunClientExtensions implements IClientItemExtensions {
    public static final GunClientExtensions INSTANCE = new GunClientExtensions();

    private GunClientExtensions() {
    }
}
