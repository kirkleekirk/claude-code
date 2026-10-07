package com.kirkleekirk.heroesendgame.compat;

import com.kirkleekirk.heroesendgame.HeroesEndgame;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraftforge.fml.ModList;
import net.threetag.palladium.power.PowerManager;
import net.threetag.palladium.util.property.EntityPropertyHandler;
import net.threetag.palladium.util.property.PalladiumProperty;

import java.util.Collections;
import java.util.HashSet;
import java.util.Optional;
import java.util.Set;

/**
 * Thin, defensive bridge to Palladium (the superpower framework FSang18's Heroes runs on).
 * <p>
 * Everything Palladium-specific lives in {@link Impl}, which is only class-loaded after we checked that Palladium is
 * installed, so this mod still loads (with power-based triggers disabled) without it.
 */
public final class PalladiumCompat {
    private static Boolean loaded;
    private static boolean warned;

    public static boolean isLoaded() {
        if (loaded == null) {
            loaded = ModList.get().isLoaded("palladium");
        }
        return loaded;
    }

    /** Ids of every power currently active on the entity (superpowers, suit sets, items...). */
    public static Set<ResourceLocation> powerIds(LivingEntity entity) {
        if (!isLoaded()) {
            return Collections.emptySet();
        }
        try {
            return Impl.powerIds(entity);
        } catch (Throwable t) {
            warn(t);
            return Collections.emptySet();
        }
    }

    public static Optional<Object> property(Entity entity, String key) {
        if (!isLoaded()) {
            return Optional.empty();
        }
        try {
            return Optional.ofNullable(Impl.property(entity, key));
        } catch (Throwable t) {
            warn(t);
            return Optional.empty();
        }
    }

    public static int intProperty(Entity entity, String key, int fallback) {
        return property(entity, key).map(v -> v instanceof Number n ? n.intValue() : fallback).orElse(fallback);
    }

    public static boolean hasProperty(Entity entity, String key) {
        return property(entity, key).isPresent();
    }

    /** Sets a (KubeJS- or addon-registered) Palladium property. Returns false if it doesn't exist on the entity. */
    public static boolean setProperty(Entity entity, String key, Object value) {
        if (!isLoaded()) {
            return false;
        }
        try {
            return Impl.setProperty(entity, key, value);
        } catch (Throwable t) {
            warn(t);
            return false;
        }
    }

    public static boolean addToIntProperty(Entity entity, String key, int delta) {
        Optional<Object> current = property(entity, key);
        if (current.isEmpty() || !(current.get() instanceof Number n)) {
            return false;
        }
        return setProperty(entity, key, n.intValue() + delta);
    }

    private static void warn(Throwable t) {
        if (!warned) {
            warned = true;
            HeroesEndgame.LOGGER.warn("Palladium integration failed - power based nemesis triggers may not work. This is probably an incompatible Palladium version.", t);
        }
    }

    private static final class Impl {
        static Set<ResourceLocation> powerIds(LivingEntity entity) {
            return PowerManager.getPowerHandler(entity)
                    .map(handler -> (Set<ResourceLocation>) new HashSet<>(handler.getPowerHolders().keySet()))
                    .orElse(Collections.emptySet());
        }

        static Object property(Entity entity, String key) {
            Optional<EntityPropertyHandler> handler = EntityPropertyHandler.getHandler(entity);
            if (handler.isEmpty()) {
                return null;
            }
            PalladiumProperty<?> property = handler.get().getPropertyByName(key);
            return property == null ? null : handler.get().get(property);
        }

        static boolean setProperty(Entity entity, String key, Object value) {
            Optional<EntityPropertyHandler> handler = EntityPropertyHandler.getHandler(entity);
            if (handler.isEmpty()) {
                return false;
            }
            PalladiumProperty<?> property = handler.get().getPropertyByName(key);
            if (property == null) {
                return false;
            }
            Object current = handler.get().get(property);
            // Keep the property's own number type (KubeJS 'integer' properties are Integers).
            if (current instanceof Integer && value instanceof Number n) {
                value = n.intValue();
            } else if (current instanceof Float && value instanceof Number n) {
                value = n.floatValue();
            } else if (current instanceof Double && value instanceof Number n) {
                value = n.doubleValue();
            }
            handler.get().setRaw(property, value);
            return true;
        }
    }

    private PalladiumCompat() {
    }
}
