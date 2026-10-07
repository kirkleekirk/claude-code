package com.kirkleekirk.heroesendgame.weapon;

import com.kirkleekirk.heroesendgame.HeroesEndgame;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundEvents;
import net.minecraftforge.registries.DeferredRegister;
import net.minecraftforge.registries.ForgeRegistries;
import net.minecraftforge.registries.RegistryObject;

import java.util.HashMap;
import java.util.Map;

/**
 * Weapon sounds. Sound sets (gun families): pistol, magnum, smg, rifle, lmg, shotgun, sniper, launcher, minigun,
 * icer. Gun events: fire, fire_suppressed, reload, reload_empty, dry, mech (bolt/pump cycle). Event ids are
 * heroes_endgame:gun.&lt;set&gt;.&lt;event&gt;, ui.&lt;name&gt; (hitmarker, headshot, kill), melee.&lt;name&gt; (swing,
 * hit, throw), bench.&lt;name&gt; (craft, attach, detach).
 * <p>
 * The getters never return null: if a sound isn't registered they fall back to a vanilla sound, so code can always
 * call them. (Skeleton - the sound pass registers the real sounds via {@link #register(String)}.)
 */
public final class WeaponSounds {
    public static final DeferredRegister<SoundEvent> SOUNDS = DeferredRegister.create(ForgeRegistries.SOUND_EVENTS, HeroesEndgame.MOD_ID);
    private static final Map<String, RegistryObject<SoundEvent>> BY_NAME = new HashMap<>();

    private WeaponSounds() {
    }

    /** Registers heroes_endgame:&lt;name&gt; (call from a static initialiser before registry events). */
    public static RegistryObject<SoundEvent> register(String name) {
        RegistryObject<SoundEvent> sound = SOUNDS.register(name, () -> SoundEvent.createVariableRangeEvent(HeroesEndgame.id(name)));
        BY_NAME.put(name, sound);
        return sound;
    }

    private static SoundEvent get(String name, SoundEvent fallback) {
        RegistryObject<SoundEvent> sound = BY_NAME.get(name);
        return sound != null && sound.isPresent() ? sound.get() : fallback;
    }

    public static SoundEvent gun(String soundSet, String event) {
        SoundEvent fallback = switch (event) {
            case "fire" -> SoundEvents.GENERIC_EXPLODE;
            case "fire_suppressed" -> SoundEvents.ARROW_SHOOT;
            case "reload", "reload_empty" -> SoundEvents.CROSSBOW_LOADING_MIDDLE;
            case "dry" -> SoundEvents.DISPENSER_FAIL;
            default -> SoundEvents.CROSSBOW_LOADING_END;
        };
        return get("gun." + soundSet + "." + event, fallback);
    }

    public static SoundEvent ui(String name) {
        return get("ui." + name, SoundEvents.EXPERIENCE_ORB_PICKUP);
    }

    public static SoundEvent melee(String name) {
        return get("melee." + name, SoundEvents.PLAYER_ATTACK_SWEEP);
    }

    public static SoundEvent bench(String name) {
        return get("bench." + name, SoundEvents.SMITHING_TABLE_USE);
    }
}
