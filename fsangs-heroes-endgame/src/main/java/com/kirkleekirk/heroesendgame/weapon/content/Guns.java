package com.kirkleekirk.heroesendgame.weapon.content;

import com.kirkleekirk.heroesendgame.weapon.stats.AmmoType;
import com.kirkleekirk.heroesendgame.weapon.stats.AttachmentSlot;
import com.kirkleekirk.heroesendgame.weapon.stats.FireMode;
import com.kirkleekirk.heroesendgame.weapon.stats.GunDefinition;
import com.kirkleekirk.heroesendgame.weapon.stats.Stat;
import com.kirkleekirk.heroesendgame.weapon.stats.WeaponCatalog;
import com.kirkleekirk.heroesendgame.weapon.stats.WeaponClass;

/** Every gun. Plain Java - no Minecraft classes. */
public final class Guns {
    private Guns() {
    }

    public static void register() {
        // Example entry (the content pass replaces/extends this list).
        WeaponCatalog.gun(GunDefinition.builder("stg44", WeaponClass.ASSAULT_RIFLE)
                .modes(FireMode.AUTO, FireMode.SEMI).ammo(AmmoType.RIFLE).sound("rifle")
                .stat(Stat.DAMAGE, 5.0).stat(Stat.HEADSHOT_MULTIPLIER, 1.5).stat(Stat.FIRE_RATE, 600).stat(Stat.MAG_SIZE, 30)
                .stat(Stat.RELOAD_TIME, 46).stat(Stat.RANGE, 40).stat(Stat.MAX_RANGE, 120).stat(Stat.MIN_DAMAGE_RATIO, 0.6)
                .stat(Stat.HIP_SPREAD, 5.0).stat(Stat.ADS_SPREAD, 0.6).stat(Stat.MOVE_SPREAD, 2.0)
                .stat(Stat.RECOIL_VERTICAL, 1.1).stat(Stat.RECOIL_HORIZONTAL, 0.6).stat(Stat.ADS_TIME, 6)
                .stat(Stat.SPRINT_TO_FIRE, 5).stat(Stat.MOBILITY, 0.95).stat(Stat.ADS_MOBILITY, 0.7).stat(Stat.ZOOM, 1.25)
                .stat(Stat.MELEE_DAMAGE, 5).stat(Stat.EQUIP_TIME, 10)
                .muzzle(8, 9.5, -14).socket(AttachmentSlot.OPTIC, 8, 11, 2).socket(AttachmentSlot.UNDERBARREL, 8, 7.5, -6)
                .socket(AttachmentSlot.MAGAZINE, 8, 7, 0).socket(AttachmentSlot.STOCK, 8, 9, 8).socket(AttachmentSlot.BARREL, 8, 9.5, -8)
                .sightLine(8, 11, 0)
                .build());
    }
}
