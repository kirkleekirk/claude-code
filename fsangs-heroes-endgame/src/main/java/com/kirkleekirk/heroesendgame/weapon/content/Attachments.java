package com.kirkleekirk.heroesendgame.weapon.content;

import com.kirkleekirk.heroesendgame.weapon.stats.AttachmentDefinition;
import com.kirkleekirk.heroesendgame.weapon.stats.AttachmentSlot;
import com.kirkleekirk.heroesendgame.weapon.stats.AttachmentVisual;
import com.kirkleekirk.heroesendgame.weapon.stats.Stat;
import com.kirkleekirk.heroesendgame.weapon.stats.Trait;
import com.kirkleekirk.heroesendgame.weapon.stats.WeaponCatalog;
import com.kirkleekirk.heroesendgame.weapon.stats.WeaponClass;

/** Every gun attachment (Call of Duty: Vanguard style gunsmith). Plain Java - no Minecraft classes. */
public final class Attachments {
    private Attachments() {
    }

    public static void register() {
        // Example entry (the content pass replaces/extends this list).
        WeaponCatalog.attachment(AttachmentDefinition.builder("suppressor", AttachmentSlot.MUZZLE)
                .pct(Stat.RANGE, -10).pct(Stat.RECOIL_VERTICAL, -5).pct(Stat.ADS_TIME, 5).traits(Trait.SUPPRESSED)
                .classes(WeaponClass.PISTOL, WeaponClass.SMG, WeaponClass.ASSAULT_RIFLE, WeaponClass.LMG, WeaponClass.MARKSMAN, WeaponClass.SNIPER)
                .rarity(1).visual(AttachmentVisual.model("attachment/suppressor")).build());
    }
}
