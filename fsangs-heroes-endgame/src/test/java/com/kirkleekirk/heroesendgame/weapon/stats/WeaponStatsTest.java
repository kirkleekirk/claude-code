package com.kirkleekirk.heroesendgame.weapon.stats;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

class WeaponStatsTest {
    @Test
    void percentagesStackAdditivelyLikeTheGunsmith() {
        WeaponStats base = WeaponStats.builder().set(Stat.RANGE, 40).build();
        WeaponStats result = base.apply(List.of(StatModifier.percent(Stat.RANGE, 20), StatModifier.percent(Stat.RANGE, -10)));
        assertEquals(44.0, result.get(Stat.RANGE), 1e-9);
    }

    @Test
    void addIsAppliedBeforePercentAndSetWins() {
        WeaponStats base = WeaponStats.builder().set(Stat.MAG_SIZE, 30).set(Stat.DAMAGE, 5).build();
        WeaponStats result = base.apply(List.of(StatModifier.add(Stat.MAG_SIZE, 10), StatModifier.percent(Stat.MAG_SIZE, 50),
                StatModifier.set(Stat.DAMAGE, 9)));
        assertEquals(60.0, result.get(Stat.MAG_SIZE), 1e-9);
        assertEquals(9.0, result.get(Stat.DAMAGE), 1e-9);
    }

    @Test
    void valuesAreClamped() {
        WeaponStats base = WeaponStats.builder().set(Stat.MOBILITY, 1.0).build();
        assertEquals(0.3, base.apply(List.of(StatModifier.percent(Stat.MOBILITY, -500))).get(Stat.MOBILITY), 1e-9);
    }
}
