package com.kirkleekirk.heroesendgame.nemesis;

import com.kirkleekirk.heroesendgame.HeroesEndgame;
import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceLocation;
import org.jetbrains.annotations.Nullable;

/**
 * Every storyline a player can be pulled into.
 */
public enum Nemesis {
    // The Viltrumite Empire (fsang_age)
    VILTRUMITE_TRIAL("viltrumite_trial", 2, ChatFormatting.RED, true),
    CONQUEST("conquest", 3, ChatFormatting.RED, true),
    THRAGG("thragg", 5, ChatFormatting.DARK_RED, true),
    // The Infinity Saga (world campaign)
    LOKI("loki", 2, ChatFormatting.GREEN, true),
    BLACK_ORDER("black_order", 2, ChatFormatting.DARK_PURPLE, true),
    THANOS("thanos", 6, ChatFormatting.LIGHT_PURPLE, true),
    DORMAMMU("dormammu", 3, ChatFormatting.GOLD, true),
    // Doctor Doom
    DOOMBOTS("doombots", 1, ChatFormatting.DARK_GREEN, false),
    DOCTOR_DOOM("doctor_doom", 5, ChatFormatting.DARK_GREEN, true),
    // Power-family nemeses
    DOOMSDAY("doomsday", 4, ChatFormatting.GRAY, true),
    ZOOM("zoom", 3, ChatFormatting.BLUE, true),
    SENTINELS("sentinels", 1, ChatFormatting.DARK_PURPLE, false),
    MASTER_MOLD("master_mold", 4, ChatFormatting.DARK_PURPLE, true),
    GHOST_RIDER("ghost_rider", 2, ChatFormatting.GOLD, true);

    private final String id;
    private final int skillPoints;
    private final ChatFormatting color;
    private final boolean major;

    Nemesis(String id, int skillPoints, ChatFormatting color, boolean major) {
        this.id = id;
        this.skillPoints = skillPoints;
        this.color = color;
        this.major = major;
    }

    public String id() {
        return id;
    }

    /** FSang skill points granted to everyone who took part in a victory. */
    public int skillPoints() {
        return skillPoints;
    }

    public ChatFormatting color() {
        return color;
    }

    /** Major nemeses count towards Doctor Doom's "rival" trigger and the "Endgame" advancement. */
    public boolean isMajor() {
        return major;
    }

    public Component displayName() {
        return Component.translatable("nemesis.heroes_endgame." + id).withStyle(color);
    }

    public ResourceLocation advancement() {
        return HeroesEndgame.id("nemesis/" + id);
    }

    @Nullable
    public static Nemesis byId(String id) {
        for (Nemesis nemesis : values()) {
            if (nemesis.id.equals(id)) {
                return nemesis;
            }
        }
        return null;
    }
}
