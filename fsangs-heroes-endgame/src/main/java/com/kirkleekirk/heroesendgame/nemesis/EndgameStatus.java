package com.kirkleekirk.heroesendgame.nemesis;

import com.kirkleekirk.heroesendgame.config.EndgameConfig;
import com.kirkleekirk.heroesendgame.infinity.InfinityCampaign;
import com.kirkleekirk.heroesendgame.power.PowerFamily;
import com.kirkleekirk.heroesendgame.power.PowerProfile;
import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.MutableComponent;
import net.minecraft.server.level.ServerPlayer;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * The "endgame goals" view: what is hunting you, what will wake up next, and how close you are.
 * Shown by the Watcher's Log and /endgame status.
 */
public final class EndgameStatus {
    public static List<Component> describe(ServerPlayer viewer, ServerPlayer subject) {
        List<Component> lines = new ArrayList<>();
        PowerProfile profile = PowerProfile.of(subject);
        PlayerNemesisData data = EndgameSavedData.get(subject.server).player(subject.getUUID());
        long now = subject.server.overworld().getGameTime();

        lines.add(Component.translatable("status.heroes_endgame.header", subject.getDisplayName()).withStyle(ChatFormatting.GOLD, ChatFormatting.BOLD));

        MutableComponent families = Component.empty();
        if (profile.families().isEmpty()) {
            families.append(Component.translatable("status.heroes_endgame.no_family").withStyle(ChatFormatting.GRAY));
        } else {
            boolean first = true;
            for (PowerFamily family : profile.families()) {
                if (!first) {
                    families.append(Component.literal(", ").withStyle(ChatFormatting.GRAY));
                }
                first = false;
                families.append(Component.translatable("power_family.heroes_endgame." + family.name().toLowerCase(Locale.ROOT)).withStyle(ChatFormatting.AQUA));
            }
        }
        lines.add(Component.translatable("status.heroes_endgame.profile", families, profile.skillLevel(), profile.powers().size()).withStyle(ChatFormatting.GRAY));

        // --- Viltrumite
        if (profile.is(PowerFamily.VILTRUMITE)) {
            lines.add(entry(data, Nemesis.VILTRUMITE_TRIAL, now,
                    Component.translatable("status.heroes_endgame.hint.age", profile.viltrumiteAge(), EndgameConfig.VILTRUMITE_TRIAL_AGE.get())));
            lines.add(entry(data, Nemesis.CONQUEST, now,
                    Component.translatable("status.heroes_endgame.hint.age", profile.viltrumiteAge(), EndgameConfig.VILTRUMITE_CONQUEST_AGE.get())));
            lines.add(entry(data, Nemesis.THRAGG, now,
                    Component.translatable("status.heroes_endgame.hint.age", profile.viltrumiteAge(), EndgameConfig.VILTRUMITE_THRAGG_AGE.get())));
        }
        if (profile.is(PowerFamily.KRYPTONIAN)) {
            lines.add(entry(data, Nemesis.DOOMSDAY, now,
                    Component.translatable("status.heroes_endgame.hint.skill", profile.skillLevel(), EndgameConfig.DOOMSDAY_SKILL_LEVEL.get())));
        }
        if (profile.is(PowerFamily.SPEEDSTER)) {
            lines.add(entry(data, Nemesis.ZOOM, now,
                    Component.translatable("status.heroes_endgame.hint.speed", (int) data.speedForceDistance, EndgameConfig.ZOOM_SPEED_DISTANCE.get())));
        }
        if (profile.is(PowerFamily.MUTANT)) {
            lines.add(entry(data, Nemesis.SENTINELS, now,
                    Component.translatable("status.heroes_endgame.hint.skill", profile.skillLevel(), EndgameConfig.SENTINELS_SKILL_LEVEL.get())));
            lines.add(entry(data, Nemesis.MASTER_MOLD, now,
                    Component.translatable("status.heroes_endgame.hint.sentinels", data.sentinelsDestroyed, EndgameConfig.SENTINELS_BEFORE_MASTER_MOLD.get())));
        }
        if (profile.hasKarma()) {
            lines.add(entry(data, Nemesis.GHOST_RIDER, now,
                    Component.translatable("status.heroes_endgame.hint.karma", profile.karma(), EndgameConfig.GHOST_RIDER_KARMA.get())));
        }
        lines.add(entry(data, Nemesis.DOOMBOTS, now, Component.translatable("status.heroes_endgame.hint.doom",
                profile.skillLevel(), EndgameConfig.DOOM_SKILL_LEVEL.get(), data.majorVictories(), EndgameConfig.DOOM_NEMESES_DEFEATED.get())));
        lines.add(entry(data, Nemesis.DOCTOR_DOOM, now, Component.empty()));

        // --- Infinity
        lines.add(Component.translatable("status.heroes_endgame.infinity").withStyle(ChatFormatting.LIGHT_PURPLE, ChatFormatting.BOLD));
        lines.addAll(InfinityCampaign.get(subject.server).describe());
        for (Nemesis nemesis : new Nemesis[]{Nemesis.LOKI, Nemesis.BLACK_ORDER, Nemesis.THANOS, Nemesis.DORMAMMU}) {
            if (data.records().containsKey(nemesis)) {
                lines.add(entry(data, nemesis, now, Component.empty()));
            }
        }
        return lines;
    }

    private static Component entry(PlayerNemesisData data, Nemesis nemesis, long now, Component hint) {
        MutableComponent line = Component.literal(" - ").withStyle(ChatFormatting.DARK_GRAY)
                .append(NemesisDirector.describe(nemesis, data.get(nemesis), now));
        if (!hint.getString().isEmpty()) {
            line.append(Component.literal("  ")).append(hint.copy().withStyle(ChatFormatting.DARK_AQUA));
        }
        return line;
    }

    private EndgameStatus() {
    }
}
