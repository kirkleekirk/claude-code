package com.kirkleekirk.heroesendgame.nemesis;

import com.kirkleekirk.heroesendgame.HeroesEndgame;
import com.kirkleekirk.heroesendgame.compat.FsangCompat;
import com.kirkleekirk.heroesendgame.config.EndgameConfig;
import com.kirkleekirk.heroesendgame.entity.EndgameBoss;
import com.kirkleekirk.heroesendgame.entity.mutant.SentinelEntity;
import com.kirkleekirk.heroesendgame.infinity.InfinityCampaign;
import com.kirkleekirk.heroesendgame.power.PowerFamily;
import com.kirkleekirk.heroesendgame.power.PowerProfile;
import com.kirkleekirk.heroesendgame.util.Messages;
import net.minecraft.ChatFormatting;
import net.minecraft.core.particles.BlockParticleOption;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.network.chat.Component;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Blocks;
import org.jetbrains.annotations.Nullable;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Decides when each nemesis comes for each player, brings them in, and resolves the outcome.
 * <p>
 * Every few seconds each online player is profiled ({@link PowerProfile}) and checked against every storyline's
 * trigger. Triggered storylines warn the player, schedule an arrival, and spawn their bosses through
 * {@link NemesisSpawner}. Boss deaths, player deaths, logouts and dimension changes all feed back in here.
 */
public final class NemesisDirector {
    public static final long DAY = 24000L;
    private static final Map<UUID, PowerProfile> PROFILES = new HashMap<>();
    private static int tickCounter;

    // =================================================================================================================
    // Ticking
    // =================================================================================================================

    public static void tick(MinecraftServer server) {
        if (!EndgameConfig.isLoaded()) {
            return;
        }
        tickCounter++;
        if (tickCounter % 20 != 0) {
            return;
        }
        EndgameSavedData saved = EndgameSavedData.get(server);
        long now = server.overworld().getGameTime();
        int interval = EndgameConfig.CHECK_INTERVAL_SECONDS.get();
        boolean evaluate = (tickCounter / 20) % interval == 0;

        for (ServerPlayer player : server.getPlayerList().getPlayers()) {
            PlayerNemesisData data = saved.player(player.getUUID());
            data.lastKnownName = player.getGameProfile().getName();
            monitorActive(server, player, data, now);
            arriveScheduled(server, player, data, now);
            if (evaluate && EndgameConfig.ENABLED.get() && !player.isCreative() && !player.isSpectator()) {
                PowerProfile profile = PowerProfile.of(player);
                PROFILES.put(player.getUUID(), profile);
                evaluate(player, data, profile, now);
            }
        }
        InfinityCampaign.get(server).tick(now);
    }

    @Nullable
    public static PowerProfile cachedProfile(ServerPlayer player) {
        return PROFILES.get(player.getUUID());
    }

    private static void evaluate(ServerPlayer player, PlayerNemesisData data, PowerProfile profile, long now) {
        ServerLevel level = player.serverLevel();

        // ---- The Viltrumite Empire ---------------------------------------------------------------------------------
        if (EndgameConfig.VILTRUMITE_ENABLED.get() && profile.is(PowerFamily.VILTRUMITE) && profile.viltrumiteAge() >= 0) {
            int age = profile.viltrumiteAge();
            if (!anyBusy(data, Nemesis.VILTRUMITE_TRIAL, Nemesis.CONQUEST, Nemesis.THRAGG)) {
                if (!viltrumiteTier(player, data, Nemesis.VILTRUMITE_TRIAL, EndgameConfig.VILTRUMITE_TRIAL_AGE.get(), null, age, now)
                        && !viltrumiteTier(player, data, Nemesis.CONQUEST, EndgameConfig.VILTRUMITE_CONQUEST_AGE.get(), Nemesis.VILTRUMITE_TRIAL, age, now)) {
                    viltrumiteTier(player, data, Nemesis.THRAGG, EndgameConfig.VILTRUMITE_THRAGG_AGE.get(), Nemesis.CONQUEST, age, now);
                }
            }
            data.lastSeenAge = age;
        }

        // ---- Doomsday (Kryptonians) -----------------------------------------------------------------------------
        if (EndgameConfig.DOOMSDAY_ENABLED.get() && profile.is(PowerFamily.KRYPTONIAN)
                && profile.skillLevel() >= EndgameConfig.DOOMSDAY_SKILL_LEVEL.get()) {
            NemesisRecord record = data.get(Nemesis.DOOMSDAY);
            if (record.victories == 0 && !record.isBusy() && now >= record.cooldownUntil) {
                int tremors = record.extra.getInt("Tremors");
                if (now >= record.extra.getLong("NextTremor")) {
                    if (tremors < 2) {
                        tremor(player, tremors);
                        record.extra.putInt("Tremors", tremors + 1);
                        record.extra.putLong("NextTremor", now + DAY / 2);
                        record.status = NemesisRecord.Status.WARNED;
                    } else {
                        record.extra.putInt("Tremors", 0);
                        schedule(player, Nemesis.DOOMSDAY, 200, "doomsday.incoming");
                    }
                }
            }
        }

        // ---- Zoom (speedsters) -------------------------------------------------------------------------------------
        if (EndgameConfig.ZOOM_ENABLED.get() && profile.is(PowerFamily.SPEEDSTER)) {
            NemesisRecord record = data.get(Nemesis.ZOOM);
            int distance = EndgameConfig.ZOOM_SPEED_DISTANCE.get();
            int skill = EndgameConfig.ZOOM_SKILL_LEVEL.get();
            boolean triggered = (distance > 0 && data.speedForceDistance >= distance) || (skill > 0 && profile.skillLevel() >= skill);
            if (triggered && record.victories == 0 && !record.isBusy() && now >= record.cooldownUntil) {
                if (isDark(level)) {
                    schedule(player, Nemesis.ZOOM, 100, "zoom.incoming");
                } else if (onceFlag(data, "zoom_watching")) {
                    Messages.send(player, "zoom.watching", ChatFormatting.BLUE);
                }
            }
        }

        // ---- Sentinels (mutants) -------------------------------------------------------------------------------
        if (EndgameConfig.SENTINELS_ENABLED.get() && profile.is(PowerFamily.MUTANT)
                && profile.skillLevel() >= EndgameConfig.SENTINELS_SKILL_LEVEL.get()) {
            NemesisRecord raids = data.get(Nemesis.SENTINELS);
            NemesisRecord mold = data.get(Nemesis.MASTER_MOLD);
            if (mold.victories == 0 && !raids.isBusy() && !mold.isBusy()) {
                if (data.sentinelsDestroyed >= EndgameConfig.SENTINELS_BEFORE_MASTER_MOLD.get()) {
                    if (now >= mold.cooldownUntil) {
                        schedule(player, Nemesis.MASTER_MOLD, 600, "master_mold.incoming");
                    }
                } else if (now >= raids.cooldownUntil) {
                    long next = raids.extra.getLong("NextRaid");
                    if (next == 0) {
                        // First detection: the first raid comes soon.
                        raids.extra.putLong("NextRaid", now + DAY / 4);
                        Messages.send(player, "sentinels.detected", ChatFormatting.DARK_PURPLE);
                    } else if (now >= next) {
                        schedule(player, Nemesis.SENTINELS, 300, "sentinels.incoming");
                    }
                }
            }
        }

        // ---- Ghost Rider (karma) -------------------------------------------------------------------------------
        if (EndgameConfig.GHOST_RIDER_ENABLED.get() && profile.hasKarma()
                && profile.karma() <= EndgameConfig.GHOST_RIDER_KARMA.get() && !profile.is(PowerFamily.SPIRIT_OF_VENGEANCE)) {
            NemesisRecord record = data.get(Nemesis.GHOST_RIDER);
            if (!record.isBusy() && now >= record.cooldownUntil) {
                if (isDark(level)) {
                    schedule(player, Nemesis.GHOST_RIDER, 160, "ghost_rider.incoming");
                } else if (onceFlag(data, "ghost_rider_watching")) {
                    Messages.send(player, "ghost_rider.watching", ChatFormatting.GOLD);
                }
            }
        }

        // ---- Doctor Doom (rivals) --------------------------------------------------------------------------------
        if (EndgameConfig.DOOM_ENABLED.get()) {
            NemesisRecord bots = data.get(Nemesis.DOOMBOTS);
            NemesisRecord doom = data.get(Nemesis.DOCTOR_DOOM);
            if (!bots.isBusy() && !doom.isBusy()) {
                int skill = EndgameConfig.DOOM_SKILL_LEVEL.get();
                int rivals = EndgameConfig.DOOM_NEMESES_DEFEATED.get();
                boolean rival = (skill > 0 && profile.skillLevel() >= skill) || (rivals > 0 && data.majorVictories() >= rivals);
                boolean impostor = EndgameConfig.DOOM_IMPOSTOR_TRIGGER.get() && FsangCompat.wearsDoomSuit(player);
                if (impostor && now >= bots.extra.getLong("ImpostorCooldown")) {
                    bots.extra.putLong("ImpostorCooldown", now + DAY);
                    schedule(player, Nemesis.DOOMBOTS, 400, "doom.impostor");
                } else if (rival) {
                    if (bots.victories == 0) {
                        if (now >= bots.cooldownUntil) {
                            schedule(player, Nemesis.DOOMBOTS, 600, "doom.doombots_incoming");
                        }
                    } else if (doom.status != NemesisRecord.Status.DEFEATED && now >= doom.cooldownUntil) {
                        schedule(player, Nemesis.DOCTOR_DOOM, 600, doom.victories > 0 ? "doom.returns" : "doom.incoming");
                    }
                }
            }
        }
    }

    private static boolean viltrumiteTier(ServerPlayer player, PlayerNemesisData data, Nemesis tier, int requiredAge,
                                          @Nullable Nemesis prerequisite, int age, long now) {
        NemesisRecord record = data.get(tier);
        if (record.victories > 0) {
            return false;
        }
        if (prerequisite != null && data.get(prerequisite).victories == 0) {
            return true; // stop here: earlier tier not passed yet
        }
        if (now < record.cooldownUntil) {
            return true;
        }
        if (age == requiredAge - 1 && onceFlag(data, "warn_" + tier.id())) {
            Messages.send(player, tier.id() + ".omen", ChatFormatting.RED);
        }
        if (age >= requiredAge) {
            schedule(player, tier, 600 + player.getRandom().nextInt(1200), tier.id() + ".incoming");
        }
        return true;
    }

    private static void tremor(ServerPlayer player, int stage) {
        Messages.send(player, "doomsday.tremor." + stage, ChatFormatting.GRAY);
        player.addEffect(new MobEffectInstance(MobEffects.CONFUSION, 120, 0, false, false));
        ServerLevel level = player.serverLevel();
        level.playSound(null, player.blockPosition(), SoundEvents.WARDEN_EMERGE, net.minecraft.sounds.SoundSource.HOSTILE, 2.0F, 0.5F);
        level.sendParticles(new BlockParticleOption(ParticleTypes.BLOCK, Blocks.STONE.defaultBlockState()),
                player.getX(), player.getY() + 0.1, player.getZ(), 120, 3.0, 0.1, 3.0, 0.1);
    }

    // =================================================================================================================
    // Encounter lifecycle
    // =================================================================================================================

    /**
     * Schedules an arrival {@code delayTicks} from now and warns the player. Returns false if that storyline is
     * already scheduled or active.
     */
    public static boolean schedule(ServerPlayer player, Nemesis nemesis, int delayTicks, @Nullable String warningKey) {
        MinecraftServer server = player.getServer();
        if (server == null) {
            return false;
        }
        NemesisRecord record = EndgameSavedData.get(server).player(player.getUUID()).get(nemesis);
        if (record.isBusy()) {
            return false;
        }
        record.status = NemesisRecord.Status.SCHEDULED;
        record.scheduledAt = server.overworld().getGameTime() + Math.max(0, delayTicks);
        record.encounterId = UUID.randomUUID();
        record.savedHealth = 1.0F;
        record.bosses.clear();
        if (warningKey != null) {
            Messages.send(player, warningKey, nemesis.color());
            player.playNotifySound(SoundEvents.ELDER_GUARDIAN_CURSE, net.minecraft.sounds.SoundSource.HOSTILE, 0.6F, 0.6F);
        }
        return true;
    }

    /** Brings a nemesis in right now (commands, scripted events). */
    public static boolean startNow(ServerPlayer player, Nemesis nemesis) {
        MinecraftServer server = player.getServer();
        if (server == null) {
            return false;
        }
        NemesisRecord record = EndgameSavedData.get(server).player(player.getUUID()).get(nemesis);
        if (record.status == NemesisRecord.Status.ACTIVE) {
            return false;
        }
        record.status = NemesisRecord.Status.SCHEDULED;
        record.encounterId = UUID.randomUUID();
        record.savedHealth = 1.0F;
        record.bosses.clear();
        return arrive(server, player, nemesis, record, server.overworld().getGameTime());
    }

    private static void arriveScheduled(MinecraftServer server, ServerPlayer player, PlayerNemesisData data, long now) {
        if (player.isCreative() || player.isSpectator() || !player.isAlive()) {
            return;
        }
        for (Map.Entry<Nemesis, NemesisRecord> entry : data.records().entrySet()) {
            NemesisRecord record = entry.getValue();
            if (record.status == NemesisRecord.Status.SCHEDULED && now >= record.scheduledAt) {
                if (record.extra.getBoolean("AwaitLogin")) {
                    continue;
                }
                arrive(server, player, entry.getKey(), record, now);
            }
        }
    }

    private static boolean arrive(MinecraftServer server, ServerPlayer player, Nemesis nemesis, NemesisRecord record, long now) {
        List<EndgameBoss> bosses;
        try {
            bosses = NemesisSpawner.spawn(player, nemesis, record);
        } catch (Exception e) {
            HeroesEndgame.LOGGER.error("Failed to spawn nemesis {} for {}", nemesis.id(), player.getGameProfile().getName(), e);
            bosses = List.of();
        }
        if (bosses.isEmpty()) {
            record.scheduledAt = now + 200;
            return false;
        }
        record.status = NemesisRecord.Status.ACTIVE;
        record.bosses.clear();
        for (EndgameBoss boss : bosses) {
            record.bosses.add(boss.getUUID());
        }
        record.lastEncounter = now;
        // Short headline: long names don't fit on screen at the 'auto' GUI scale.
        Messages.title(player, Messages.key("arrival." + nemesis.id() + ".title").copy().withStyle(nemesis.color()),
                Messages.key("arrival." + nemesis.id() + ".subtitle").copy().withStyle(ChatFormatting.GRAY));
        Messages.announce(server, player, Messages.key("arrival." + nemesis.id(), player.getDisplayName()).copy().withStyle(nemesis.color()));
        return true;
    }

    private static void monitorActive(MinecraftServer server, ServerPlayer player, PlayerNemesisData data, long now) {
        for (Map.Entry<Nemesis, NemesisRecord> entry : data.records().entrySet()) {
            NemesisRecord record = entry.getValue();
            if (record.status != NemesisRecord.Status.ACTIVE || now - record.lastEncounter < 100) {
                continue;
            }
            boolean anyAlive = false;
            for (UUID id : record.bosses) {
                Entity entity = findEntity(server, id);
                if (entity instanceof EndgameBoss boss && boss.isAlive()) {
                    anyAlive = true;
                    break;
                }
            }
            if (!anyAlive) {
                // Bosses got unloaded or removed without dying: bring them back shortly.
                record.status = NemesisRecord.Status.SCHEDULED;
                record.scheduledAt = now + 400;
                record.bosses.clear();
            }
        }
    }

    /** False if this boss is a leftover from an old encounter (reloaded chunk etc.) and should vanish. */
    public static boolean isCurrent(EndgameBoss boss) {
        if (boss.getNemesis() == null || boss.getHuntedPlayerId() == null || boss.getEncounterId() == null
                || !(boss.level() instanceof ServerLevel level)) {
            return true;
        }
        NemesisRecord record = EndgameSavedData.get(level.getServer()).player(boss.getHuntedPlayerId()).get(boss.getNemesis());
        return record.status == NemesisRecord.Status.ACTIVE && boss.getEncounterId().equals(record.encounterId)
                && record.bosses.contains(boss.getUUID());
    }

    @Nullable
    public static Entity findEntity(MinecraftServer server, UUID id) {
        for (ServerLevel level : server.getAllLevels()) {
            Entity entity = level.getEntity(id);
            if (entity != null) {
                return entity;
            }
        }
        return null;
    }

    // =================================================================================================================
    // Callbacks
    // =================================================================================================================

    public static void onBossKilled(EndgameBoss boss, DamageSource source) {
        if (!(boss.level() instanceof ServerLevel level) || boss.isMinion()) {
            return;
        }
        MinecraftServer server = level.getServer();
        Set<UUID> participants = boss.getParticipants();
        Nemesis nemesis = boss.getNemesis();
        UUID hunted = boss.getHuntedPlayerId();

        if (boss instanceof SentinelEntity && hunted != null) {
            EndgameSavedData.get(server).player(hunted).sentinelsDestroyed++;
        }
        if (nemesis == null || hunted == null) {
            // Summoned by hand (spawn egg / command): still worth the advancement.
            Rewards.grantAdvancementsOnly(server, participants, boss);
            return;
        }
        PlayerNemesisData data = EndgameSavedData.get(server).player(hunted);
        NemesisRecord record = data.get(nemesis);
        if (boss.getEncounterId() == null || !boss.getEncounterId().equals(record.encounterId)) {
            Rewards.grantAdvancementsOnly(server, participants, boss);
            return;
        }
        record.bosses.remove(boss.getUUID());
        for (UUID other : record.bosses) {
            Entity entity = findEntity(server, other);
            if (entity instanceof EndgameBoss otherBoss && otherBoss.isAlive()) {
                Rewards.grantAdvancementsOnly(server, participants, boss);
                return; // the rest of the encounter is still fighting
            }
        }
        resolveVictory(server, hunted, data, nemesis, record, participants, boss);
    }

    private static void resolveVictory(MinecraftServer server, UUID hunted, PlayerNemesisData data, Nemesis nemesis,
                                       NemesisRecord record, Set<UUID> participants, EndgameBoss lastBoss) {
        long now = server.overworld().getGameTime();
        record.victories++;
        record.bosses.clear();
        record.savedHealth = 1.0F;
        record.lastEncounter = now;
        record.status = NemesisRecord.Status.DEFEATED;
        ServerPlayer player = server.getPlayerList().getPlayer(hunted);

        switch (nemesis) {
            case VILTRUMITE_TRIAL -> data.get(Nemesis.CONQUEST).cooldownUntil = now + EndgameConfig.VILTRUMITE_TIER_COOLDOWN_DAYS.get() * DAY;
            case CONQUEST -> data.get(Nemesis.THRAGG).cooldownUntil = now + EndgameConfig.VILTRUMITE_TIER_COOLDOWN_DAYS.get() * DAY;
            case DOOMBOTS -> data.get(Nemesis.DOCTOR_DOOM).cooldownUntil = now + EndgameConfig.DOOM_DAYS_AFTER_DOOMBOTS.get() * DAY;
            case DOCTOR_DOOM -> {
                int rematch = EndgameConfig.DOOM_REMATCH_DAYS.get();
                if (rematch > 0) {
                    record.status = NemesisRecord.Status.DORMANT;
                    record.cooldownUntil = now + rematch * DAY;
                }
            }
            case SENTINELS -> {
                record.status = NemesisRecord.Status.DORMANT;
                long interval = EndgameConfig.SENTINELS_RAID_INTERVAL_DAYS.get() * DAY;
                record.extra.putLong("NextRaid", now + (long) (interval * (0.75 + Math.random() * 0.5)));
            }
            case MASTER_MOLD -> data.get(Nemesis.SENTINELS).status = NemesisRecord.Status.DEFEATED;
            case GHOST_RIDER -> {
                record.status = NemesisRecord.Status.DORMANT;
                record.cooldownUntil = now + 5 * DAY;
                if (player != null) {
                    FsangCompat.setKarma(player, 0);
                }
            }
            case LOKI, BLACK_ORDER, THANOS -> {
                record.status = NemesisRecord.Status.DORMANT;
                InfinityCampaign.get(server).onVillainDefeated(nemesis, player, lastBoss);
            }
            default -> {
            }
        }
        Rewards.grantVictory(server, participants, nemesis, lastBoss);
    }

    public static void onBossRetreated(EndgameBoss boss) {
        if (!(boss.level() instanceof ServerLevel level) || boss.getNemesis() == null || boss.getHuntedPlayerId() == null) {
            return;
        }
        NemesisRecord record = EndgameSavedData.get(level.getServer()).player(boss.getHuntedPlayerId()).get(boss.getNemesis());
        if (boss.getEncounterId() == null || !boss.getEncounterId().equals(record.encounterId)
                || record.status != NemesisRecord.Status.ACTIVE) {
            return;
        }
        record.savedHealth = Math.min(record.savedHealth, Math.max(0.25F, boss.getHealth() / boss.getMaxHealth()));
        record.bosses.remove(boss.getUUID());
        for (UUID other : record.bosses) {
            Entity entity = findEntity(level.getServer(), other);
            if (entity instanceof EndgameBoss otherBoss && otherBoss.isAlive() && !otherBoss.isRetreating()) {
                return;
            }
        }
        record.bosses.clear();
        record.status = NemesisRecord.Status.SCHEDULED;
        record.scheduledAt = level.getServer().overworld().getGameTime() + 1200;
    }

    /** The hunted player died: their nemeses won this round. Called from LivingDeathEvent (before drops). */
    public static void onPlayerDeath(ServerPlayer player) {
        MinecraftServer server = player.getServer();
        if (server == null) {
            return;
        }
        PlayerNemesisData data = EndgameSavedData.get(server).player(player.getUUID());
        long now = server.overworld().getGameTime();
        for (Map.Entry<Nemesis, NemesisRecord> entry : data.records().entrySet()) {
            Nemesis nemesis = entry.getKey();
            NemesisRecord record = entry.getValue();
            if (record.status != NemesisRecord.Status.ACTIVE) {
                continue;
            }
            for (UUID id : new ArrayList<>(record.bosses)) {
                if (findEntity(server, id) instanceof EndgameBoss boss && boss.isAlive()) {
                    boss.sayRandom("victory", 2);
                    boss.burst(ParticleTypes.REVERSE_PORTAL, 60, 1.0);
                    boss.discard();
                }
            }
            record.bosses.clear();
            record.losses++;
            record.status = NemesisRecord.Status.DORMANT;
            record.savedHealth = 1.0F;
            switch (nemesis) {
                case VILTRUMITE_TRIAL, CONQUEST, THRAGG -> {
                    record.cooldownUntil = now + DAY;
                    data.flags.remove("warn_" + nemesis.id());
                    Messages.send(player, "viltrumite.failed", ChatFormatting.DARK_RED);
                }
                case DOOMBOTS, DOCTOR_DOOM -> record.cooldownUntil = now + 3 * DAY;
                case DOOMSDAY -> record.cooldownUntil = now + 2 * DAY;
                case ZOOM -> {
                    record.cooldownUntil = now + 3 * DAY;
                    data.flags.putLong("SpeedStolenUntil", now + DAY / 2);
                    Messages.send(player, "zoom.stole_speed", ChatFormatting.BLUE);
                }
                case SENTINELS, MASTER_MOLD -> {
                    record.cooldownUntil = now + DAY;
                    data.get(Nemesis.SENTINELS).extra.putLong("NextRaid", now + EndgameConfig.SENTINELS_RAID_INTERVAL_DAYS.get() * DAY);
                }
                case GHOST_RIDER -> {
                    record.cooldownUntil = now + 2 * DAY;
                    int karma = FsangCompat.karma(player);
                    FsangCompat.setKarma(player, karma + Math.abs(EndgameConfig.GHOST_RIDER_KARMA.get()) / 2);
                    Messages.send(player, "ghost_rider.judged", ChatFormatting.GOLD);
                }
                case LOKI, BLACK_ORDER, THANOS -> InfinityCampaign.get(server).onVillainWon(nemesis, player);
                default -> {
                }
            }
        }
    }

    public static void onPlayerLogout(ServerPlayer player) {
        MinecraftServer server = player.getServer();
        if (server == null) {
            return;
        }
        PlayerNemesisData data = EndgameSavedData.get(server).player(player.getUUID());
        for (NemesisRecord record : data.records().values()) {
            if (record.status != NemesisRecord.Status.ACTIVE) {
                continue;
            }
            float health = 1.0F;
            for (UUID id : record.bosses) {
                if (findEntity(server, id) instanceof EndgameBoss boss && boss.isAlive()) {
                    health = Math.min(health, boss.getHealth() / boss.getMaxHealth());
                    boss.discard();
                }
            }
            record.bosses.clear();
            record.savedHealth = Math.max(0.25F, health);
            record.status = NemesisRecord.Status.SCHEDULED;
            record.extra.putBoolean("AwaitLogin", true);
        }
        PROFILES.remove(player.getUUID());
    }

    public static void onPlayerLogin(ServerPlayer player) {
        MinecraftServer server = player.getServer();
        if (server == null) {
            return;
        }
        PlayerNemesisData data = EndgameSavedData.get(server).player(player.getUUID());
        long now = server.overworld().getGameTime();
        boolean pending = false;
        for (NemesisRecord record : data.records().values()) {
            if (record.extra.getBoolean("AwaitLogin")) {
                record.extra.remove("AwaitLogin");
                record.scheduledAt = now + 600;
                pending = true;
            }
        }
        if (pending) {
            Messages.send(player, "still_hunted", ChatFormatting.RED);
        }
        InfinityCampaign.get(server).onPlayerLogin(player);
    }

    /** Bosses can't change dimension, so they leave and arrive again where the player went. */
    public static void onPlayerChangedDimension(ServerPlayer player) {
        MinecraftServer server = player.getServer();
        if (server == null) {
            return;
        }
        PlayerNemesisData data = EndgameSavedData.get(server).player(player.getUUID());
        long now = server.overworld().getGameTime();
        for (NemesisRecord record : data.records().values()) {
            if (record.status != NemesisRecord.Status.ACTIVE) {
                continue;
            }
            float health = 1.0F;
            for (UUID id : record.bosses) {
                if (findEntity(server, id) instanceof EndgameBoss boss && boss.isAlive() && boss.level() != player.level()) {
                    health = Math.min(health, boss.getHealth() / boss.getMaxHealth());
                    boss.burst(ParticleTypes.REVERSE_PORTAL, 40, 1.0);
                    boss.discard();
                }
            }
            record.bosses.clear();
            record.savedHealth = Math.max(0.25F, health);
            record.status = NemesisRecord.Status.SCHEDULED;
            record.scheduledAt = now + 300;
            Messages.send(player, "followed", ChatFormatting.RED);
        }
    }

    // =================================================================================================================
    // Utilities
    // =================================================================================================================

    private static boolean anyBusy(PlayerNemesisData data, Nemesis... nemeses) {
        for (Nemesis nemesis : nemeses) {
            if (data.get(nemesis).isBusy()) {
                return true;
            }
        }
        return false;
    }

    /** True the first time it's called for this key (per player), false afterwards. */
    private static boolean onceFlag(PlayerNemesisData data, String key) {
        if (data.flags.getBoolean(key)) {
            return false;
        }
        data.flags.putBoolean(key, true);
        return true;
    }

    public static boolean isDark(Level level) {
        return level.dimensionType().hasFixedTime() || level.isNight();
    }

    public static Component describe(Nemesis nemesis, NemesisRecord record, long now) {
        String state = switch (record.status) {
            case DORMANT -> record.cooldownUntil > now ? "cooldown" : "dormant";
            case WARNED -> "warned";
            case SCHEDULED -> "scheduled";
            case ACTIVE -> "active";
            case DEFEATED -> "defeated";
        };
        return Component.empty().append(nemesis.displayName()).append(Component.literal(": ").withStyle(ChatFormatting.GRAY))
                .append(Component.translatable("status.heroes_endgame." + state).withStyle(ChatFormatting.WHITE))
                .append(Component.literal("  (" + record.victories + "W / " + record.losses + "L)").withStyle(ChatFormatting.DARK_GRAY));
    }

    private NemesisDirector() {
    }
}
