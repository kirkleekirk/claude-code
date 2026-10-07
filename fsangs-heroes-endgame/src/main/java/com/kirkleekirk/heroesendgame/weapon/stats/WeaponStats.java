package com.kirkleekirk.heroesendgame.weapon.stats;

import java.util.Collection;
import java.util.EnumMap;
import java.util.Map;

/** An immutable set of stat values. Missing stats read as 0. */
public final class WeaponStats {
    private final EnumMap<Stat, Double> values;

    private WeaponStats(EnumMap<Stat, Double> values) {
        this.values = values;
    }

    public static Builder builder() {
        return new Builder();
    }

    public double get(Stat stat) {
        Double value = values.get(stat);
        return value == null ? 0.0 : value;
    }

    public int getInt(Stat stat) {
        return (int) Math.round(get(stat));
    }

    public boolean has(Stat stat) {
        return values.containsKey(stat);
    }

    public WeaponStats with(Stat stat, double value) {
        EnumMap<Stat, Double> copy = new EnumMap<>(values);
        copy.put(stat, stat.clamp(value));
        return new WeaponStats(copy);
    }

    public Map<Stat, Double> asMap() {
        return java.util.Collections.unmodifiableMap(values);
    }

    /** Applies modifiers the gunsmith way (see {@link StatModifier}) and clamps every stat. */
    public WeaponStats apply(Collection<StatModifier> modifiers) {
        EnumMap<Stat, Double> add = new EnumMap<>(Stat.class);
        EnumMap<Stat, Double> percent = new EnumMap<>(Stat.class);
        EnumMap<Stat, Double> set = new EnumMap<>(Stat.class);
        for (StatModifier modifier : modifiers) {
            switch (modifier.op()) {
                case ADD -> add.merge(modifier.stat(), modifier.amount(), Double::sum);
                case PERCENT -> percent.merge(modifier.stat(), modifier.amount(), Double::sum);
                case SET -> set.put(modifier.stat(), modifier.amount());
            }
        }
        EnumMap<Stat, Double> result = new EnumMap<>(values);
        for (Stat stat : Stat.values()) {
            if (!values.containsKey(stat) && !add.containsKey(stat) && !set.containsKey(stat)) {
                continue;
            }
            double value = (get(stat) + add.getOrDefault(stat, 0.0)) * (1.0 + percent.getOrDefault(stat, 0.0) / 100.0);
            if (set.containsKey(stat)) {
                value = set.get(stat);
            }
            result.put(stat, stat.clamp(value));
        }
        return new WeaponStats(result);
    }

    @Override
    public boolean equals(Object o) {
        return o instanceof WeaponStats other && other.values.equals(values);
    }

    @Override
    public int hashCode() {
        return values.hashCode();
    }

    @Override
    public String toString() {
        return "WeaponStats" + values;
    }

    public static final class Builder {
        private final EnumMap<Stat, Double> values = new EnumMap<>(Stat.class);

        public Builder set(Stat stat, double value) {
            values.put(stat, stat.clamp(value));
            return this;
        }

        public WeaponStats build() {
            return new WeaponStats(new EnumMap<>(values));
        }
    }
}
