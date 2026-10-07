package com.kirkleekirk.heroesendgame.infinity;

import com.kirkleekirk.heroesendgame.HeroesEndgame;
import com.kirkleekirk.heroesendgame.config.EndgameConfig;
import com.kirkleekirk.heroesendgame.entity.EndgameBoss;
import com.kirkleekirk.heroesendgame.item.InfinityGauntletItem;
import com.kirkleekirk.heroesendgame.item.InfinityStoneItem;
import com.kirkleekirk.heroesendgame.nemesis.EndgameSavedData;
import com.kirkleekirk.heroesendgame.nemesis.Nemesis;
import com.kirkleekirk.heroesendgame.nemesis.NemesisDirector;
import com.kirkleekirk.heroesendgame.nemesis.Rewards;
import com.kirkleekirk.heroesendgame.registry.ModDamageTypes;
import com.kirkleekirk.heroesendgame.registry.ModEffects;
import com.kirkleekirk.heroesendgame.registry.ModItems;
import com.kirkleekirk.heroesendgame.util.Messages;
import net.minecraft.ChatFormatting;
import net.minecraft.core.BlockPos;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.core.registries.Registries;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.ListTag;
import net.minecraft.nbt.Tag;
import net.minecraft.resources.ResourceKey;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.network.chat.Component;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.OwnableEntity;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import org.jetbrains.annotations.Nullable;

import java.util.ArrayList;
import java.util.List;

/**
 * The world-wide Infinity Saga.
 * <ol>
 *     <li><b>Dormant</b> - Thanos doesn't know about this world. Stones sit where they were hidden.</li>
 *     <li><b>Herald</b> - the first time a player claims a stone, Thanos turns his gaze to the world and sends Loki
 *     with a Chitauri army to take it (Avengers 2012). Loki carries the Mind Stone in his scepter.</li>
 *     <li><b>Clock</b> - every few days Thanos claims another unclaimed stone himself (in Infinity War order) and
 *     sends the Black Order after anyone carrying one. Stones you find first, he can't claim.</li>
 *     <li><b>Thanos</b> - "Fine. I'll do it myself." Once he holds enough stones, or none are left unclaimed, he
 *     comes in person, as strong as the stones he holds.</li>
 *     <li><b>Snapped</b> - if he ever completes the Gauntlet, he snaps: half of all creatures turn to dust and every
 *     player is weakened until Thanos is defeated or a hero snaps with a full Gauntlet of their own.</li>
 *     <li><b>Ended</b> - Thanos is beaten and the stones belong to the heroes.</li>
 * </ol>
 */
public final class InfinityCampaign {
    private static final long DAY = 24000L;
    private final MinecraftServer server;
    private final EndgameSavedData data;
    private final InfinityState state;

    private InfinityCampaign(MinecraftServer server) {
        this.server = server;
        this.data = EndgameSavedData.get(server);
        this.state = data.infinity();
    }

    public static InfinityCampaign get(MinecraftServer server) {
        return new InfinityCampaign(server);
    }

    // =================================================================================================================
    // Queries
    // =================================================================================================================

    public InfinityState.Stage stage() {
        return state.stage;
    }

    public InfinityState.Owner owner(InfinityStone stone) {
        return state.owners.get(stone);
    }

    public boolean isUnclaimed(InfinityStone stone) {
        return owner(stone) == InfinityState.Owner.UNCLAIMED;
    }

    public boolean isSnapActive() {
        return state.snapActive;
    }

    public int blackOrderRaids() {
        return state.blackOrderRaids;
    }

    public int thanosDefeats() {
        return state.thanosDefeats;
    }

    private long now() {
        return server.overworld().getGameTime();
    }

    private boolean enabled() {
        return EndgameConfig.isLoaded() && EndgameConfig.INFINITY_ENABLED.get();
    }

    // =================================================================================================================
    // Stones changing hands
    // =================================================================================================================

    public void markFound(InfinityStone stone, @Nullable ServerPlayer finder) {
        if (state.owners.get(stone) != InfinityState.Owner.FOUND) {
            state.owners.put(stone, InfinityState.Owner.FOUND);
            data.setDirty();
        }
    }

    /** The first time a given stone item is held by a player. */
    public void onStoneHeld(ServerPlayer player, InfinityStone stone) {
        if (state.owners.get(stone) == InfinityState.Owner.UNCLAIMED) {
            markFound(stone, player);
        }
        Rewards.award(player, HeroesEndgame.id("first_stone"));
        if (enabled() && state.stage == InfinityState.Stage.DORMANT) {
            begin(player, stone);
        }
    }

    /** Thanos takes every stone the player carries (loose or in a gauntlet). Returns how many. */
    public int steal(ServerPlayer player) {
        int stolen = 0;
        Inventory inventory = player.getInventory();
        List<ItemStack> stacks = new ArrayList<>(inventory.items);
        stacks.addAll(inventory.offhand);
        for (ItemStack stack : stacks) {
            if (stack.getItem() instanceof InfinityStoneItem stoneItem) {
                state.owners.put(stoneItem.stone(), InfinityState.Owner.THANOS);
                stolen += stack.getCount();
                stack.setCount(0);
            } else if (stack.is(ModItems.INFINITY_GAUNTLET.get()) && InfinityGauntletItem.stoneCount(stack) > 0) {
                for (InfinityStone stone : InfinityGauntletItem.getStones(stack)) {
                    state.owners.put(stone, InfinityState.Owner.THANOS);
                    stolen++;
                }
                stack.getOrCreateTag().putInt(InfinityGauntletItem.TAG_STONES, 0);
                stack.getOrCreateTag().putInt(InfinityGauntletItem.TAG_CLAIMED, 0);
            }
        }
        data.setDirty();
        return stolen;
    }

    // =================================================================================================================
    // Story
    // =================================================================================================================

    public void begin(@Nullable ServerPlayer trigger, @Nullable InfinityStone stone) {
        if (state.stage != InfinityState.Stage.DORMANT) {
            return;
        }
        long now = now();
        state.stage = InfinityState.Stage.HERALD;
        state.startedAt = now;
        state.nextClockAt = now + EndgameConfig.INFINITY_CLOCK_DAYS.get() * DAY;
        state.heraldTarget = trigger == null ? null : trigger.getUUID();
        data.setDirty();
        Component stoneName = stone == null ? Component.translatable("message.heroes_endgame.infinity.a_stone") : stone.displayName();
        Messages.announceAll(server, Component.translatable("message.heroes_endgame.infinity.awakened", stoneName).withStyle(ChatFormatting.LIGHT_PURPLE));
        for (ServerPlayer player : server.getPlayerList().getPlayers()) {
            player.playNotifySound(SoundEvents.WITHER_SPAWN, SoundSource.HOSTILE, 0.6F, 0.5F);
        }
        if (trigger != null) {
            NemesisDirector.schedule(trigger, Nemesis.LOKI, 1200, "infinity.loki_incoming");
        }
    }

    public void tick(long now) {
        if (!state.snapActive && !state.dusted.isEmpty()) {
            restoreDusted();
        }
        if (!enabled()) {
            return;
        }
        switch (state.stage) {
            case DORMANT -> {
                int failsafe = EndgameConfig.INFINITY_FAILSAFE_DAY.get();
                if (failsafe > 0 && server.overworld().getDayTime() / DAY >= failsafe) {
                    ServerPlayer target = randomSurvivalPlayer();
                    if (target != null) {
                        begin(target, null);
                    }
                }
            }
            case HERALD -> {
                // Loki never managed to show up (target never came back): move on.
                if (now - state.startedAt > 3 * DAY && !busy(Nemesis.LOKI)) {
                    state.stage = InfinityState.Stage.CLOCK;
                    data.setDirty();
                }
            }
            case CLOCK -> {
                if (now >= state.nextClockAt) {
                    state.nextClockAt = now + EndgameConfig.INFINITY_CLOCK_DAYS.get() * DAY;
                    data.setDirty();
                    clockTick();
                }
            }
            case THANOS, SNAPPED -> {
                if (now >= state.nextClockAt && !busy(Nemesis.THANOS)) {
                    state.nextClockAt = now + EndgameConfig.INFINITY_CLOCK_DAYS.get() * DAY;
                    data.setDirty();
                    summonThanos();
                }
            }
            case ENDED -> {
            }
        }
    }

    private void clockTick() {
        int held = state.count(InfinityState.Owner.THANOS);
        boolean unclaimedLeft = state.count(InfinityState.Owner.UNCLAIMED) > 0;
        if (held >= EndgameConfig.INFINITY_THANOS_ARRIVAL_STONES.get() || !unclaimedLeft) {
            summonThanos();
            return;
        }
        for (InfinityStone stone : InfinityStone.THANOS_ORDER) {
            if (state.owners.get(stone) == InfinityState.Owner.UNCLAIMED) {
                state.owners.put(stone, InfinityState.Owner.THANOS);
                data.setDirty();
                Messages.announceAll(server, Component.translatable("message.heroes_endgame.infinity.claimed." + stone.getSerializedName())
                        .withStyle(ChatFormatting.DARK_PURPLE));
                break;
            }
        }
        if (EndgameConfig.INFINITY_BLACK_ORDER_RAIDS.get()) {
            ServerPlayer carrier = bestCarrier();
            if (carrier != null) {
                NemesisDirector.schedule(carrier, Nemesis.BLACK_ORDER, 600, "infinity.black_order_incoming");
            }
        }
    }

    private void summonThanos() {
        ServerPlayer target = bestCarrier();
        if (target == null) {
            target = randomSurvivalPlayer();
        }
        if (target == null) {
            state.nextClockAt = now() + 1200;
            return;
        }
        boolean first = state.stage != InfinityState.Stage.THANOS && state.stage != InfinityState.Stage.SNAPPED;
        if (first) {
            state.stage = InfinityState.Stage.THANOS;
            Messages.announceAll(server, Component.translatable("message.heroes_endgame.infinity.thanos_himself").withStyle(ChatFormatting.LIGHT_PURPLE, ChatFormatting.BOLD));
        }
        data.setDirty();
        NemesisDirector.schedule(target, Nemesis.THANOS, 1200, "infinity.thanos_incoming");
    }

    // =================================================================================================================
    // Encounter results (from NemesisDirector)
    // =================================================================================================================

    public void onVillainDefeated(Nemesis nemesis, @Nullable ServerPlayer player, EndgameBoss boss) {
        long now = now();
        switch (nemesis) {
            case LOKI -> {
                if (state.stage == InfinityState.Stage.HERALD) {
                    state.stage = InfinityState.Stage.CLOCK;
                    state.nextClockAt = now + EndgameConfig.INFINITY_CLOCK_DAYS.get() * DAY;
                }
                Messages.announceAll(server, Component.translatable("message.heroes_endgame.infinity.loki_defeated").withStyle(ChatFormatting.GREEN));
            }
            case BLACK_ORDER -> {
                state.blackOrderRaids++;
                Messages.announceAll(server, Component.translatable("message.heroes_endgame.infinity.black_order_defeated").withStyle(ChatFormatting.DARK_PURPLE));
            }
            case THANOS -> {
                state.thanosDefeats++;
                if (state.snapActive) {
                    unsnap(player);
                }
                state.stage = InfinityState.Stage.ENDED;
                Messages.announceAll(server, Component.translatable("message.heroes_endgame.infinity.thanos_defeated").withStyle(ChatFormatting.GOLD, ChatFormatting.BOLD));
            }
            default -> {
            }
        }
        data.setDirty();
    }

    /** The villain killed the player it was hunting: it takes their stones. */
    public void onVillainWon(Nemesis nemesis, ServerPlayer player) {
        int stolen = steal(player);
        if (stolen > 0) {
            Messages.announceAll(server, Component.translatable("message.heroes_endgame.infinity.stones_taken", player.getDisplayName(), stolen)
                    .withStyle(ChatFormatting.DARK_PURPLE));
        }
        if (nemesis == Nemesis.LOKI && state.stage == InfinityState.Stage.HERALD) {
            state.stage = InfinityState.Stage.CLOCK;
            state.nextClockAt = now() + EndgameConfig.INFINITY_CLOCK_DAYS.get() * DAY;
        }
        if (state.count(InfinityState.Owner.THANOS) == 6 && !state.snapActive) {
            snap();
        }
        data.setDirty();
    }

    // =================================================================================================================
    // The Snap
    // =================================================================================================================

    public void snap() {
        long now = now();
        state.nextClockAt = now + EndgameConfig.INFINITY_CLOCK_DAYS.get() * DAY;
        if (!EndgameConfig.INFINITY_SNAP_ENABLED.get()) {
            state.stage = InfinityState.Stage.THANOS;
            data.setDirty();
            return;
        }
        state.snapActive = true;
        state.stage = InfinityState.Stage.SNAPPED;
        data.setDirty();

        for (ServerPlayer player : server.getPlayerList().getPlayers()) {
            Messages.title(player, Component.translatable("message.heroes_endgame.snap.title").withStyle(ChatFormatting.LIGHT_PURPLE),
                    Component.translatable("message.heroes_endgame.snap.world_subtitle").withStyle(ChatFormatting.GRAY));
            player.playNotifySound(SoundEvents.LIGHTNING_BOLT_THUNDER, SoundSource.HOSTILE, 1.0F, 0.5F);
        }
        Messages.announceAll(server, Component.translatable("message.heroes_endgame.snap.announce").withStyle(ChatFormatting.LIGHT_PURPLE));

        double fraction = EndgameConfig.INFINITY_SNAP_DUST_FRACTION.get();
        for (ServerLevel level : server.getAllLevels()) {
            List<LivingEntity> victims = new ArrayList<>();
            for (Entity entity : level.getAllEntities()) {
                if (entity instanceof LivingEntity living && !(entity instanceof Player) && !(entity instanceof EndgameBoss)
                        && living.isAlive() && !living.hasCustomName()
                        && !(entity instanceof OwnableEntity ownable && ownable.getOwnerUUID() != null)
                        && level.random.nextDouble() < fraction) {
                    victims.add(living);
                }
            }
            for (LivingEntity victim : victims) {
                remember(level, victim);
                StonePowers.dust(level, victim);
            }
        }
        for (ServerPlayer player : server.getPlayerList().getPlayers()) {
            applySnapped(player);
            if (EndgameConfig.INFINITY_SNAP_KILLS_PLAYERS.get() && player.getRandom().nextBoolean() && !player.isCreative() && !player.isSpectator()) {
                player.hurt(ModDamageTypes.source(player.level(), ModDamageTypes.SNAP), player.getMaxHealth() * 10.0F);
            }
        }
    }

    /** Keeps a dusted creature so that reversing the snap can bring it back. */
    private void remember(ServerLevel level, LivingEntity victim) {
        if (state.dusted.size() >= InfinityState.MAX_DUSTED) {
            return;
        }
        CompoundTag entity = new CompoundTag();
        if (victim.saveAsPassenger(entity)) {
            entity.remove("Passengers");
            CompoundTag entry = new CompoundTag();
            entry.putString("Dim", level.dimension().location().toString());
            entry.put("Entity", entity);
            state.dusted.add(entry);
        }
    }

    /**
     * After the snap is reversed, the dusted come back - a few at a time, and only once someone is near enough for
     * their chunk to be loaded again.
     */
    private void restoreDusted() {
        int restored = 0;
        for (int i = state.dusted.size() - 1; i >= 0 && restored < 64; i--) {
            CompoundTag entry = state.dusted.getCompound(i);
            ResourceLocation dimension = ResourceLocation.tryParse(entry.getString("Dim"));
            ServerLevel level = dimension == null ? null : server.getLevel(ResourceKey.create(Registries.DIMENSION, dimension));
            CompoundTag entityTag = entry.getCompound("Entity");
            ListTag pos = entityTag.getList("Pos", Tag.TAG_DOUBLE);
            if (level == null || pos.size() < 3) {
                state.dusted.remove(i);
                continue;
            }
            BlockPos blockPos = BlockPos.containing(pos.getDouble(0), pos.getDouble(1), pos.getDouble(2));
            if (!level.isLoaded(blockPos)) {
                continue;
            }
            state.dusted.remove(i);
            restored++;
            Entity entity = EntityType.loadEntityRecursive(entityTag, level, e -> e);
            if (entity != null && level.tryAddFreshEntityWithPassengers(entity)) {
                level.sendParticles(ParticleTypes.END_ROD, entity.getX(), entity.getY() + entity.getBbHeight() / 2, entity.getZ(), 12,
                        entity.getBbWidth() * 0.4, entity.getBbHeight() * 0.4, entity.getBbWidth() * 0.4, 0.02);
            }
        }
        if (restored > 0) {
            data.setDirty();
        }
    }

    /** "Bring them back." */
    public void unsnap(@Nullable ServerPlayer hero) {
        state.snapActive = false;
        if (state.stage == InfinityState.Stage.SNAPPED) {
            // Whoever reversed it holds the stones now (or Thanos is dead): the saga is over.
            state.stage = InfinityState.Stage.ENDED;
        }
        data.setDirty();
        for (ServerPlayer player : server.getPlayerList().getPlayers()) {
            player.removeEffect(ModEffects.SNAPPED.get());
            Messages.title(player, Component.translatable("message.heroes_endgame.snap.reversed_title").withStyle(ChatFormatting.GOLD),
                    Component.translatable("message.heroes_endgame.snap.reversed_subtitle").withStyle(ChatFormatting.GRAY));
        }
        if (hero != null) {
            Rewards.award(hero, HeroesEndgame.id("bring_them_back"));
        }
    }

    public void applySnapped(ServerPlayer player) {
        double penalty = EndgameConfig.INFINITY_SNAP_PENALTY.get();
        int amplifier = (int) Math.round(penalty / 0.05) - 1;
        if (amplifier < 0) {
            return;
        }
        player.addEffect(new MobEffectInstance(ModEffects.SNAPPED.get(), MobEffectInstance.INFINITE_DURATION, amplifier, false, false, true));
    }

    /** Login / respawn: the snap persists across deaths and logouts. */
    public void onPlayerLogin(ServerPlayer player) {
        if (state.snapActive) {
            applySnapped(player);
        } else if (player.hasEffect(ModEffects.SNAPPED.get())) {
            player.removeEffect(ModEffects.SNAPPED.get());
        }
    }

    // =================================================================================================================
    // Helpers
    // =================================================================================================================

    private boolean busy(Nemesis nemesis) {
        for (var entry : data.players().values()) {
            if (entry.records().containsKey(nemesis) && entry.get(nemesis).isBusy()) {
                return true;
            }
        }
        return false;
    }

    /** The online player carrying the most stones (null if nobody carries any). */
    @Nullable
    private ServerPlayer bestCarrier() {
        ServerPlayer best = null;
        int bestCount = 0;
        for (ServerPlayer player : server.getPlayerList().getPlayers()) {
            if (player.isCreative() || player.isSpectator()) {
                continue;
            }
            int count = 0;
            for (ItemStack stack : player.getInventory().items) {
                if (stack.getItem() instanceof InfinityStoneItem) {
                    count += stack.getCount();
                } else if (stack.is(ModItems.INFINITY_GAUNTLET.get())) {
                    count += InfinityGauntletItem.stoneCount(stack);
                }
            }
            for (ItemStack stack : player.getInventory().offhand) {
                if (stack.getItem() instanceof InfinityStoneItem) {
                    count += stack.getCount();
                } else if (stack.is(ModItems.INFINITY_GAUNTLET.get())) {
                    count += InfinityGauntletItem.stoneCount(stack);
                }
            }
            if (count > bestCount) {
                bestCount = count;
                best = player;
            }
        }
        return best;
    }

    @Nullable
    private ServerPlayer randomSurvivalPlayer() {
        List<ServerPlayer> candidates = new ArrayList<>();
        for (ServerPlayer player : server.getPlayerList().getPlayers()) {
            if (!player.isCreative() && !player.isSpectator()) {
                candidates.add(player);
            }
        }
        return candidates.isEmpty() ? null : candidates.get(server.overworld().random.nextInt(candidates.size()));
    }

    /** Lines for /endgame infinity and the Watcher's Log. */
    public List<Component> describe() {
        List<Component> lines = new ArrayList<>();
        lines.add(Component.translatable("message.heroes_endgame.infinity.status.stage",
                Component.translatable("infinity_stage.heroes_endgame." + state.stage.name().toLowerCase(java.util.Locale.ROOT)).withStyle(ChatFormatting.WHITE))
                .withStyle(ChatFormatting.LIGHT_PURPLE));
        for (InfinityStone stone : InfinityStone.values()) {
            InfinityState.Owner owner = state.owners.get(stone);
            lines.add(Component.literal("  ").append(stone.displayName()).append(Component.literal(": ").withStyle(ChatFormatting.GRAY))
                    .append(Component.translatable("infinity_owner.heroes_endgame." + owner.name().toLowerCase(java.util.Locale.ROOT))
                            .withStyle(owner == InfinityState.Owner.THANOS ? ChatFormatting.DARK_PURPLE : ChatFormatting.WHITE)));
        }
        if (state.stage == InfinityState.Stage.CLOCK || state.stage == InfinityState.Stage.THANOS || state.stage == InfinityState.Stage.SNAPPED) {
            long days = Math.max(0, (state.nextClockAt - now()) / DAY);
            lines.add(Component.translatable("message.heroes_endgame.infinity.status.next", days).withStyle(ChatFormatting.GRAY));
        }
        return lines;
    }

    /** Admin: reset the saga to dormant. */
    public void reset() {
        InfinityState fresh = new InfinityState();
        state.stage = fresh.stage;
        state.owners.clear();
        state.owners.putAll(fresh.owners);
        state.startedAt = 0;
        state.nextClockAt = 0;
        state.blackOrderRaids = 0;
        state.thanosDefeats = 0;
        state.heraldTarget = null;
        if (state.snapActive) {
            unsnap(null);
        }
        state.snapActive = false;
        state.stage = InfinityState.Stage.DORMANT;
        data.setDirty();
    }

    /** Admin: force a stone's owner. */
    public void setOwner(InfinityStone stone, InfinityState.Owner owner) {
        state.owners.put(stone, owner);
        data.setDirty();
    }

    /** Admin: skip ahead to the next clock tick. */
    public void forceClock() {
        if (state.stage == InfinityState.Stage.DORMANT) {
            begin(randomSurvivalPlayer(), null);
            return;
        }
        state.nextClockAt = now();
        data.setDirty();
    }
}
