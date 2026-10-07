package com.kirkleekirk.heroesendgame.weapon.stats;

/** Why an attachment can or can't go on a weapon (lang key: gunsmith.heroes_endgame.compat.&lt;key&gt;). */
public enum Compatibility {
    OK, NO_SLOT, WRONG_CLASS, EXCLUDED, BLOCKED;

    public boolean ok() {
        return this == OK;
    }

    public String key() {
        return name().toLowerCase(java.util.Locale.ROOT);
    }
}
