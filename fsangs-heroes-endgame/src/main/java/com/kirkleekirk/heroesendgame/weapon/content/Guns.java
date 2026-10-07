package com.kirkleekirk.heroesendgame.weapon.content;

/** Every gun, in creative-tab order. Plain Java - no Minecraft classes. */
public final class Guns {
    private Guns() {
    }

    public static void register() {
        GunsSidearms.register();
        GunsAutomatics.register();
        GunsLongGuns.register();
    }
}
