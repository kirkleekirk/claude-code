package com.kirkleekirk.heroesendgame.power;

import com.kirkleekirk.heroesendgame.config.EndgameConfig;
import net.minecraft.resources.ResourceLocation;

import java.util.List;
import java.util.function.Supplier;

/**
 * Groups of FSang18's Heroes powers that share a nemesis. The power ids come from the server config so packs can
 * add their own powers (a trailing * matches any suffix, e.g. "fsang:viltrumite*").
 */
public enum PowerFamily {
    VILTRUMITE(EndgameConfig.VILTRUMITE_POWERS::get),
    KRYPTONIAN(EndgameConfig.KRYPTONIAN_POWERS::get),
    SPEEDSTER(EndgameConfig.SPEEDSTER_POWERS::get),
    MUTANT(EndgameConfig.MUTANT_POWERS::get),
    SPIRIT_OF_VENGEANCE(EndgameConfig.SPIRIT_OF_VENGEANCE_POWERS::get),
    HULK(EndgameConfig.HULK_POWERS::get);

    private final Supplier<List<? extends String>> patterns;

    PowerFamily(Supplier<List<? extends String>> patterns) {
        this.patterns = patterns;
    }

    public boolean matches(ResourceLocation powerId) {
        String id = powerId.toString();
        for (String pattern : patterns.get()) {
            if (pattern.endsWith("*") ? id.startsWith(pattern.substring(0, pattern.length() - 1)) : id.equals(pattern)) {
                return true;
            }
        }
        return false;
    }
}
