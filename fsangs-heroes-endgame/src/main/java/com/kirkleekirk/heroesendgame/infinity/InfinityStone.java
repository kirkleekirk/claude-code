package com.kirkleekirk.heroesendgame.infinity;

import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.MutableComponent;
import org.jetbrains.annotations.Nullable;

/**
 * The six singularities. Colors follow the MCU.
 */
public enum InfinityStone {
    SPACE("space", 0x2F6BFF, ChatFormatting.BLUE),
    MIND("mind", 0xFFD21F, ChatFormatting.YELLOW),
    REALITY("reality", 0xD8172B, ChatFormatting.RED),
    POWER("power", 0x8E2CD9, ChatFormatting.DARK_PURPLE),
    TIME("time", 0x19C24A, ChatFormatting.GREEN),
    SOUL("soul", 0xFF8A1A, ChatFormatting.GOLD);

    /** The order Thanos goes after the stones in Infinity War. */
    public static final InfinityStone[] THANOS_ORDER = {POWER, SPACE, REALITY, SOUL, TIME, MIND};

    private final String name;
    private final int color;
    private final ChatFormatting formatting;

    InfinityStone(String name, int color, ChatFormatting formatting) {
        this.name = name;
        this.color = color;
        this.formatting = formatting;
    }

    public String getSerializedName() {
        return name;
    }

    public String itemName() {
        return name + "_stone";
    }

    public int color() {
        return color;
    }

    public ChatFormatting formatting() {
        return formatting;
    }

    public MutableComponent displayName() {
        return Component.translatable("infinity_stone.heroes_endgame." + name).withStyle(formatting);
    }

    @Nullable
    public static InfinityStone byName(String name) {
        for (InfinityStone stone : values()) {
            if (stone.name.equals(name)) {
                return stone;
            }
        }
        return null;
    }
}
