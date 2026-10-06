package com.kirkleekirk.heroesendgame.registry;

import com.kirkleekirk.heroesendgame.HeroesEndgame;
import com.kirkleekirk.heroesendgame.effect.HellfireEffect;
import com.kirkleekirk.heroesendgame.effect.SnappedEffect;
import net.minecraft.world.effect.MobEffect;
import net.minecraftforge.registries.DeferredRegister;
import net.minecraftforge.registries.ForgeRegistries;
import net.minecraftforge.registries.RegistryObject;

public final class ModEffects {
    public static final DeferredRegister<MobEffect> EFFECTS = DeferredRegister.create(ForgeRegistries.MOB_EFFECTS, HeroesEndgame.MOD_ID);

    /** Half the universe is gone. Applied to everyone while Thanos' snap is in effect. */
    public static final RegistryObject<SnappedEffect> SNAPPED = EFFECTS.register("snapped", SnappedEffect::new);
    /** Ghost Rider's soul fire. Burns through fire resistance. */
    public static final RegistryObject<HellfireEffect> HELLFIRE = EFFECTS.register("hellfire", HellfireEffect::new);

    private ModEffects() {
    }
}
