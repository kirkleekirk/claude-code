package com.kirkleekirk.heroesendgame.weapon.stats;

/**
 * One change an attachment makes. Like the Call of Duty gunsmith, percentages from every attachment are added
 * together and applied to the weapon's base value: (base + sum(ADD)) * (1 + sum(PERCENT)/100). SET wins over both
 * (the last SET applied is kept).
 */
public record StatModifier(Stat stat, Op op, double amount) {
    public enum Op {
        ADD, PERCENT, SET
    }

    public static StatModifier add(Stat stat, double amount) {
        return new StatModifier(stat, Op.ADD, amount);
    }

    /** {@code percent(Stat.RANGE, 15)} = +15% range. */
    public static StatModifier percent(Stat stat, double percent) {
        return new StatModifier(stat, Op.PERCENT, percent);
    }

    public static StatModifier set(Stat stat, double value) {
        return new StatModifier(stat, Op.SET, value);
    }
}
