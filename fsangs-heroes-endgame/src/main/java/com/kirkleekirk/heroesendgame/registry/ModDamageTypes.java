package com.kirkleekirk.heroesendgame.registry;

import com.kirkleekirk.heroesendgame.HeroesEndgame;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.damagesource.DamageType;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.level.Level;
import org.jetbrains.annotations.Nullable;

/**
 * Data-driven damage types (see data/heroes_endgame/damage_type). Nemesis attacks use their own damage types, so
 * FSang's per-damage-type "damage_divider" abilities (tuned against vanilla mobs) don't make you immune to them.
 */
public final class ModDamageTypes {
    public static final ResourceKey<DamageType> NEMESIS = key("nemesis");
    public static final ResourceKey<DamageType> VILTRUMITE = key("viltrumite");
    public static final ResourceKey<DamageType> INFINITY = key("infinity");
    public static final ResourceKey<DamageType> POWER_STONE = key("power_stone");
    public static final ResourceKey<DamageType> DOOM_SORCERY = key("doom_sorcery");
    public static final ResourceKey<DamageType> DOOM_TECH = key("doom_tech");
    public static final ResourceKey<DamageType> DOOMSDAY = key("doomsday");
    public static final ResourceKey<DamageType> SPEED_FORCE = key("speed_force");
    public static final ResourceKey<DamageType> SENTINEL = key("sentinel");
    public static final ResourceKey<DamageType> PENANCE = key("penance");
    public static final ResourceKey<DamageType> HELLFIRE = key("hellfire");
    public static final ResourceKey<DamageType> SNAP = key("snap");
    public static final ResourceKey<DamageType> DARK_DIMENSION = key("dark_dimension");
    public static final ResourceKey<DamageType> TELEKINESIS = key("telekinesis");

    private static ResourceKey<DamageType> key(String name) {
        return ResourceKey.create(Registries.DAMAGE_TYPE, HeroesEndgame.id(name));
    }

    public static DamageSource source(Level level, ResourceKey<DamageType> type, @Nullable Entity direct, @Nullable Entity causing) {
        return new DamageSource(level.registryAccess().registryOrThrow(Registries.DAMAGE_TYPE).getHolderOrThrow(type), direct, causing);
    }

    public static DamageSource source(Level level, ResourceKey<DamageType> type, @Nullable Entity causing) {
        return source(level, type, causing, causing);
    }

    public static DamageSource source(Level level, ResourceKey<DamageType> type) {
        return source(level, type, null, null);
    }

    private ModDamageTypes() {
    }
}
