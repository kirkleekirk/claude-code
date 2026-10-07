package com.kirkleekirk.heroesendgame.weapon.stats;

import com.kirkleekirk.heroesendgame.weapon.content.Attachments;
import com.kirkleekirk.heroesendgame.weapon.content.Guns;
import com.kirkleekirk.heroesendgame.weapon.content.MeleeAttachments;
import com.kirkleekirk.heroesendgame.weapon.content.MeleeWeapons;

import java.util.Collection;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Every gun, melee weapon and attachment, in registration order. Filled once by the content classes in
 * {@code weapon.content} (plain Java). Item registration iterates these maps, so ids here become item ids.
 */
public final class WeaponCatalog {
    private static final Map<String, GunDefinition> GUNS = new LinkedHashMap<>();
    private static final Map<String, MeleeDefinition> MELEE = new LinkedHashMap<>();
    private static final Map<String, AttachmentDefinition> ATTACHMENTS = new LinkedHashMap<>();
    private static boolean bootstrapped;

    private WeaponCatalog() {
    }

    public static synchronized void bootstrap() {
        if (bootstrapped) {
            return;
        }
        bootstrapped = true;
        Guns.register();
        MeleeWeapons.register();
        Attachments.register();
        MeleeAttachments.register();
    }

    public static void gun(GunDefinition gun) {
        put(GUNS, gun.id(), gun);
    }

    public static void melee(MeleeDefinition melee) {
        put(MELEE, melee.id(), melee);
    }

    public static void attachment(AttachmentDefinition attachment) {
        put(ATTACHMENTS, attachment.id(), attachment);
    }

    private static <T> void put(Map<String, T> map, String id, T value) {
        if (GUNS.containsKey(id) || MELEE.containsKey(id) || ATTACHMENTS.containsKey(id)) {
            throw new IllegalStateException("Duplicate weapon catalog id: " + id);
        }
        map.put(id, value);
    }

    public static Collection<GunDefinition> guns() {
        bootstrap();
        return Collections.unmodifiableCollection(GUNS.values());
    }

    public static Collection<MeleeDefinition> melee() {
        bootstrap();
        return Collections.unmodifiableCollection(MELEE.values());
    }

    public static Collection<AttachmentDefinition> attachments() {
        bootstrap();
        return Collections.unmodifiableCollection(ATTACHMENTS.values());
    }

    public static GunDefinition gun(String id) {
        bootstrap();
        return GUNS.get(id);
    }

    public static MeleeDefinition meleeWeapon(String id) {
        bootstrap();
        return MELEE.get(id);
    }

    public static AttachmentDefinition attachment(String id) {
        bootstrap();
        return ATTACHMENTS.get(id);
    }

    /** Gun or melee weapon with this id, or null. */
    public static WeaponDefinition weapon(String id) {
        bootstrap();
        WeaponDefinition gun = GUNS.get(id);
        return gun != null ? gun : MELEE.get(id);
    }
}
