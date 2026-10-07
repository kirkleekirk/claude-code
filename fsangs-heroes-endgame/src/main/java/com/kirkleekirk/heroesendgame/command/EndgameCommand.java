package com.kirkleekirk.heroesendgame.command;

import com.kirkleekirk.heroesendgame.compat.FsangCompat;
import com.kirkleekirk.heroesendgame.compat.PalladiumCompat;
import com.kirkleekirk.heroesendgame.entity.EndgameBoss;
import com.kirkleekirk.heroesendgame.infinity.InfinityCampaign;
import com.kirkleekirk.heroesendgame.infinity.InfinityState;
import com.kirkleekirk.heroesendgame.infinity.InfinityStone;
import com.kirkleekirk.heroesendgame.nemesis.EndgameSavedData;
import com.kirkleekirk.heroesendgame.nemesis.EndgameStatus;
import com.kirkleekirk.heroesendgame.nemesis.Nemesis;
import com.kirkleekirk.heroesendgame.nemesis.NemesisDirector;
import com.kirkleekirk.heroesendgame.nemesis.NemesisRecord;
import com.kirkleekirk.heroesendgame.nemesis.PlayerNemesisData;
import com.mojang.brigadier.CommandDispatcher;
import com.mojang.brigadier.arguments.IntegerArgumentType;
import com.mojang.brigadier.arguments.StringArgumentType;
import com.mojang.brigadier.context.CommandContext;
import com.mojang.brigadier.exceptions.CommandSyntaxException;
import com.mojang.brigadier.exceptions.SimpleCommandExceptionType;
import com.mojang.brigadier.suggestion.SuggestionProvider;
import net.minecraft.ChatFormatting;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.Commands;
import net.minecraft.commands.SharedSuggestionProvider;
import net.minecraft.commands.arguments.EntityArgument;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.Entity;

import java.util.Arrays;
import java.util.Locale;
import java.util.UUID;

/**
 * /endgame - status for everyone, story controls for operators.
 */
public final class EndgameCommand {
    private static final SimpleCommandExceptionType UNKNOWN_NEMESIS = new SimpleCommandExceptionType(Component.translatable("command.heroes_endgame.unknown_nemesis"));
    private static final SimpleCommandExceptionType UNKNOWN_STONE = new SimpleCommandExceptionType(Component.translatable("command.heroes_endgame.unknown_stone"));

    private static final SuggestionProvider<CommandSourceStack> NEMESES = (context, builder) ->
            SharedSuggestionProvider.suggest(Arrays.stream(Nemesis.values()).filter(n -> n != Nemesis.DORMAMMU).map(Nemesis::id), builder);
    private static final SuggestionProvider<CommandSourceStack> STONES = (context, builder) ->
            SharedSuggestionProvider.suggest(Arrays.stream(InfinityStone.values()).map(InfinityStone::getSerializedName), builder);
    private static final SuggestionProvider<CommandSourceStack> OWNERS = (context, builder) ->
            SharedSuggestionProvider.suggest(Arrays.stream(InfinityState.Owner.values()).map(o -> o.name().toLowerCase(Locale.ROOT)), builder);

    public static void register(CommandDispatcher<CommandSourceStack> dispatcher) {
        dispatcher.register(Commands.literal("endgame")
                .then(Commands.literal("status")
                        .executes(ctx -> status(ctx, ctx.getSource().getPlayerOrException()))
                        .then(Commands.argument("player", EntityArgument.player()).requires(src -> src.hasPermission(2))
                                .executes(ctx -> status(ctx, EntityArgument.getPlayer(ctx, "player")))))
                .then(Commands.literal("summon").requires(src -> src.hasPermission(2))
                        .then(Commands.argument("nemesis", StringArgumentType.word()).suggests(NEMESES)
                                .executes(ctx -> summon(ctx, ctx.getSource().getPlayerOrException()))
                                .then(Commands.argument("player", EntityArgument.player())
                                        .executes(ctx -> summon(ctx, EntityArgument.getPlayer(ctx, "player"))))))
                .then(Commands.literal("schedule").requires(src -> src.hasPermission(2))
                        .then(Commands.argument("nemesis", StringArgumentType.word()).suggests(NEMESES)
                                .then(Commands.argument("player", EntityArgument.player())
                                        .executes(ctx -> schedule(ctx, 30))
                                        .then(Commands.argument("seconds", IntegerArgumentType.integer(0, 86400))
                                                .executes(ctx -> schedule(ctx, IntegerArgumentType.getInteger(ctx, "seconds")))))))
                .then(Commands.literal("reset").requires(src -> src.hasPermission(2))
                        .then(Commands.argument("player", EntityArgument.player())
                                .executes(ctx -> reset(ctx, null))
                                .then(Commands.argument("nemesis", StringArgumentType.word()).suggests(NEMESES)
                                        .executes(ctx -> reset(ctx, nemesis(ctx))))))
                .then(Commands.literal("infinity")
                        .then(Commands.literal("status").executes(EndgameCommand::infinityStatus))
                        .then(Commands.literal("start").requires(src -> src.hasPermission(2))
                                .executes(ctx -> {
                                    InfinityCampaign.get(ctx.getSource().getServer()).begin(ctx.getSource().getPlayer(), null);
                                    return ok(ctx, "infinity.started");
                                }))
                        .then(Commands.literal("advance").requires(src -> src.hasPermission(2))
                                .executes(ctx -> {
                                    InfinityCampaign.get(ctx.getSource().getServer()).forceClock();
                                    return ok(ctx, "infinity.advanced");
                                }))
                        .then(Commands.literal("owner").requires(src -> src.hasPermission(2))
                                .then(Commands.argument("stone", StringArgumentType.word()).suggests(STONES)
                                        .then(Commands.argument("owner", StringArgumentType.word()).suggests(OWNERS)
                                                .executes(EndgameCommand::setOwner))))
                        .then(Commands.literal("snap").requires(src -> src.hasPermission(2))
                                .executes(ctx -> {
                                    InfinityCampaign.get(ctx.getSource().getServer()).snap();
                                    return ok(ctx, "infinity.snapped");
                                }))
                        .then(Commands.literal("unsnap").requires(src -> src.hasPermission(2))
                                .executes(ctx -> {
                                    InfinityCampaign.get(ctx.getSource().getServer()).unsnap(null);
                                    return ok(ctx, "infinity.unsnapped");
                                }))
                        .then(Commands.literal("reset").requires(src -> src.hasPermission(2))
                                .executes(ctx -> {
                                    InfinityCampaign.get(ctx.getSource().getServer()).reset();
                                    return ok(ctx, "infinity.reset");
                                })))
                .then(Commands.literal("debug").requires(src -> src.hasPermission(2))
                        .then(Commands.literal("age").then(Commands.argument("player", EntityArgument.player())
                                .then(Commands.argument("value", IntegerArgumentType.integer(0, 100000))
                                        .executes(ctx -> setProperty(ctx, FsangCompat.PROP_AGE)))))
                        .then(Commands.literal("karma").then(Commands.argument("player", EntityArgument.player())
                                .then(Commands.argument("value", IntegerArgumentType.integer(-1000000, 1000000))
                                        .executes(ctx -> setProperty(ctx, FsangCompat.PROP_KARMA)))))
                        .then(Commands.literal("skill").then(Commands.argument("player", EntityArgument.player())
                                .then(Commands.argument("value", IntegerArgumentType.integer(0, 1000))
                                        .executes(ctx -> setProperty(ctx, FsangCompat.PROP_SKILL_LEVEL)))))
                        .then(Commands.literal("speedforce").then(Commands.argument("player", EntityArgument.player())
                                .then(Commands.argument("value", IntegerArgumentType.integer(0, Integer.MAX_VALUE))
                                        .executes(ctx -> {
                                            ServerPlayer player = EntityArgument.getPlayer(ctx, "player");
                                            data(player).speedForceDistance = IntegerArgumentType.getInteger(ctx, "value");
                                            return ok(ctx, "debug.set");
                                        }))))
                        .then(Commands.literal("sentinels").then(Commands.argument("player", EntityArgument.player())
                                .then(Commands.argument("value", IntegerArgumentType.integer(0, 100000))
                                        .executes(ctx -> {
                                            ServerPlayer player = EntityArgument.getPlayer(ctx, "player");
                                            data(player).sentinelsDestroyed = IntegerArgumentType.getInteger(ctx, "value");
                                            return ok(ctx, "debug.set");
                                        }))))
                        .then(Commands.literal("powers").then(Commands.argument("player", EntityArgument.player())
                                .executes(ctx -> {
                                    ServerPlayer player = EntityArgument.getPlayer(ctx, "player");
                                    ctx.getSource().sendSuccess(() -> Component.literal(String.valueOf(PalladiumCompat.powerIds(player))), false);
                                    return 1;
                                })))
                        .then(Commands.literal("bosses").executes(EndgameCommand::listBosses))
                        .then(Commands.literal("dormammu").then(Commands.argument("player", EntityArgument.player())
                                .executes(ctx -> com.kirkleekirk.heroesendgame.infinity.DormammuBargain.summon(EntityArgument.getPlayer(ctx, "player")) ? 1 : 0)))));
    }

    /** Every nemesis currently in the world, with what it is doing. */
    private static int listBosses(CommandContext<CommandSourceStack> ctx) {
        int count = 0;
        for (net.minecraft.server.level.ServerLevel level : ctx.getSource().getServer().getAllLevels()) {
            for (Entity entity : level.getAllEntities()) {
                if (!(entity instanceof EndgameBoss boss) || !boss.isAlive()) {
                    continue;
                }
                count++;
                String target = boss.getTarget() == null ? "-" : boss.getTarget().getName().getString();
                ServerPlayer hunted = boss.getHuntedPlayer();
                String ability = boss.getActiveAbility() == null ? "-" : boss.getActiveAbility().getClass().getSimpleName();
                String line = String.format(Locale.ROOT, "%s @ %s %.0f %.0f %.0f | hp %.0f/%.0f | phase %d | target %s | hunting %s | nemesis %s | ability %s%s",
                        boss.getName().getString(), level.dimension().location(), boss.getX(), boss.getY(), boss.getZ(),
                        boss.effectiveHealth(), boss.effectiveMaxHealth(), boss.getPhase(), target,
                        hunted == null ? "-" : hunted.getGameProfile().getName(),
                        boss.getNemesis() == null ? "-" : boss.getNemesis().id(), ability, boss.isMinion() ? " (minion)" : "");
                ctx.getSource().sendSuccess(() -> Component.literal(line), false);
            }
        }
        int total = count;
        ctx.getSource().sendSuccess(() -> Component.literal(total + " nemesis entities"), false);
        return count;
    }

    private static Nemesis nemesis(CommandContext<CommandSourceStack> ctx) throws CommandSyntaxException {
        Nemesis nemesis = Nemesis.byId(StringArgumentType.getString(ctx, "nemesis"));
        if (nemesis == null || nemesis == Nemesis.DORMAMMU) {
            throw UNKNOWN_NEMESIS.create();
        }
        return nemesis;
    }

    private static PlayerNemesisData data(ServerPlayer player) {
        return EndgameSavedData.get(player.server).player(player.getUUID());
    }

    private static int ok(CommandContext<CommandSourceStack> ctx, String key, Object... args) {
        ctx.getSource().sendSuccess(() -> Component.translatable("command.heroes_endgame." + key, args).withStyle(ChatFormatting.GREEN), true);
        return 1;
    }

    private static int status(CommandContext<CommandSourceStack> ctx, ServerPlayer subject) throws CommandSyntaxException {
        ServerPlayer viewer = ctx.getSource().getPlayer();
        for (Component line : EndgameStatus.describe(viewer != null ? viewer : subject, subject)) {
            ctx.getSource().sendSuccess(() -> line, false);
        }
        return 1;
    }

    private static int summon(CommandContext<CommandSourceStack> ctx, ServerPlayer player) throws CommandSyntaxException {
        Nemesis nemesis = nemesis(ctx);
        if (!NemesisDirector.startNow(player, nemesis)) {
            ctx.getSource().sendFailure(Component.translatable("command.heroes_endgame.summon_failed", nemesis.displayName()));
            return 0;
        }
        return ok(ctx, "summoned", nemesis.displayName(), player.getDisplayName());
    }

    private static int schedule(CommandContext<CommandSourceStack> ctx, int seconds) throws CommandSyntaxException {
        Nemesis nemesis = nemesis(ctx);
        ServerPlayer player = EntityArgument.getPlayer(ctx, "player");
        if (!NemesisDirector.schedule(player, nemesis, seconds * 20, nemesis.id() + ".incoming")) {
            ctx.getSource().sendFailure(Component.translatable("command.heroes_endgame.summon_failed", nemesis.displayName()));
            return 0;
        }
        return ok(ctx, "scheduled", nemesis.displayName(), player.getDisplayName(), seconds);
    }

    private static int reset(CommandContext<CommandSourceStack> ctx, Nemesis only) throws CommandSyntaxException {
        ServerPlayer player = EntityArgument.getPlayer(ctx, "player");
        PlayerNemesisData data = data(player);
        for (Nemesis nemesis : Nemesis.values()) {
            if (only != null && nemesis != only) {
                continue;
            }
            NemesisRecord record = data.records().get(nemesis);
            if (record == null) {
                continue;
            }
            for (UUID id : record.bosses) {
                Entity entity = NemesisDirector.findEntity(player.server, id);
                if (entity instanceof EndgameBoss boss) {
                    boss.discard();
                }
            }
            data.records().remove(nemesis);
        }
        if (only == null) {
            data.flags = new net.minecraft.nbt.CompoundTag();
            data.doomStudy.clear();
            data.speedForceDistance = 0;
            data.sentinelsDestroyed = 0;
        }
        return ok(ctx, "reset", player.getDisplayName());
    }

    private static int infinityStatus(CommandContext<CommandSourceStack> ctx) {
        for (Component line : InfinityCampaign.get(ctx.getSource().getServer()).describe()) {
            ctx.getSource().sendSuccess(() -> line, false);
        }
        return 1;
    }

    private static int setOwner(CommandContext<CommandSourceStack> ctx) throws CommandSyntaxException {
        InfinityStone stone = InfinityStone.byName(StringArgumentType.getString(ctx, "stone"));
        if (stone == null) {
            throw UNKNOWN_STONE.create();
        }
        InfinityState.Owner owner;
        try {
            owner = InfinityState.Owner.valueOf(StringArgumentType.getString(ctx, "owner").toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw UNKNOWN_STONE.create();
        }
        InfinityCampaign.get(ctx.getSource().getServer()).setOwner(stone, owner);
        return ok(ctx, "infinity.owner_set", stone.displayName(), owner.name().toLowerCase(Locale.ROOT));
    }

    private static int setProperty(CommandContext<CommandSourceStack> ctx, String property) throws CommandSyntaxException {
        ServerPlayer player = EntityArgument.getPlayer(ctx, "player");
        int value = IntegerArgumentType.getInteger(ctx, "value");
        if (!PalladiumCompat.setProperty(player, property, value)) {
            ctx.getSource().sendFailure(Component.translatable("command.heroes_endgame.no_property", property));
            return 0;
        }
        return ok(ctx, "debug.set");
    }

    private EndgameCommand() {
    }
}
