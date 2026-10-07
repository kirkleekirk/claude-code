package com.kirkleekirk.heroesendgame.weapon;

import com.kirkleekirk.heroesendgame.HeroesEndgame;
import net.minecraft.sounds.SoundEvent;
import net.minecraftforge.registries.DeferredRegister;
import net.minecraftforge.registries.ForgeRegistries;

/**
 * Weapon sounds (skeleton - the sound pass registers them). Naming: gun.&lt;soundSet&gt;.&lt;event&gt; with events fire,
 * fire_suppressed, reload, reload_empty, dry, mech (bolt/pump cycle); plus ui.hitmarker, ui.headshot, ui.kill,
 * melee.swing, melee.hit, bench.craft, bench.attach.
 */
public final class WeaponSounds {
    public static final DeferredRegister<SoundEvent> SOUNDS = DeferredRegister.create(ForgeRegistries.SOUND_EVENTS, HeroesEndgame.MOD_ID);

    private WeaponSounds() {
    }
}
