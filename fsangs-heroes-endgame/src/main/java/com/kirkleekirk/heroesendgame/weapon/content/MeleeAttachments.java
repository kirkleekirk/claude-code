package com.kirkleekirk.heroesendgame.weapon.content;

import com.kirkleekirk.heroesendgame.weapon.stats.AttachmentDefinition;
import com.kirkleekirk.heroesendgame.weapon.stats.AttachmentSlot;
import com.kirkleekirk.heroesendgame.weapon.stats.Stat;
import com.kirkleekirk.heroesendgame.weapon.stats.WeaponCatalog;
import com.kirkleekirk.heroesendgame.weapon.stats.WeaponClass;

/** Melee weapon modifications (edge, coating, grip, charm). Plain Java - no Minecraft classes. */
public final class MeleeAttachments {
    private MeleeAttachments() {
    }

    public static void register() {
        // Example entry (the melee pass replaces/extends this list).
        WeaponCatalog.attachment(AttachmentDefinition.builder("honed_edge", AttachmentSlot.EDGE)
                .pct(Stat.MELEE_DAMAGE, 15).pct(Stat.ATTACK_SPEED, -5).classes(WeaponClass.MELEE).rarity(1).build());
    }
}
