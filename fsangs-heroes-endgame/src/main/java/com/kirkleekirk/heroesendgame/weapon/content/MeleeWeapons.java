package com.kirkleekirk.heroesendgame.weapon.content;

import com.kirkleekirk.heroesendgame.weapon.stats.MeleeDefinition;
import com.kirkleekirk.heroesendgame.weapon.stats.MeleeTrait;
import com.kirkleekirk.heroesendgame.weapon.stats.Stat;
import com.kirkleekirk.heroesendgame.weapon.stats.WeaponCatalog;
import com.kirkleekirk.heroesendgame.weapon.stats.WeaponStats;

/** Every melee weapon. Plain Java - no Minecraft classes. */
public final class MeleeWeapons {
    private MeleeWeapons() {
    }

    public static void register() {
        // Example entry (the melee pass replaces/extends this list).
        WeaponCatalog.melee(MeleeDefinition.of("deadpool_katana", "deadpool",
                WeaponStats.builder().set(Stat.MELEE_DAMAGE, 7).set(Stat.ATTACK_SPEED, 1.8).set(Stat.REACH, 0.5)
                        .set(Stat.MOBILITY, 1.05).build(),
                MeleeTrait.DUAL_WIELD, MeleeTrait.SWEEPING));
    }
}
