package com.kirkleekirk.heroesendgame.weapon;

import com.kirkleekirk.heroesendgame.HeroesEndgame;
import net.minecraft.world.entity.EntityType;
import net.minecraftforge.registries.DeferredRegister;
import net.minecraftforge.registries.ForgeRegistries;

/** Gun projectiles: rockets and 40mm grenades (skeleton - the gun engine fills this in). */
public final class WeaponEntities {
    public static final DeferredRegister<EntityType<?>> ENTITY_TYPES = DeferredRegister.create(ForgeRegistries.ENTITY_TYPES, HeroesEndgame.MOD_ID);

    private WeaponEntities() {
    }
}
