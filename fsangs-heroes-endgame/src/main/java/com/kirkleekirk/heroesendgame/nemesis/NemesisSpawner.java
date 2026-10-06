package com.kirkleekirk.heroesendgame.nemesis;

import com.kirkleekirk.heroesendgame.compat.FsangCompat;
import com.kirkleekirk.heroesendgame.config.EndgameConfig;
import com.kirkleekirk.heroesendgame.entity.EndgameBoss;
import com.kirkleekirk.heroesendgame.entity.infinity.InfinityVillain;
import com.kirkleekirk.heroesendgame.entity.viltrumite.ViltrumiteEnforcerEntity;
import com.kirkleekirk.heroesendgame.infinity.InfinityCampaign;
import com.kirkleekirk.heroesendgame.registry.ModEntities;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.MobSpawnType;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

import java.util.ArrayList;
import java.util.List;

/**
 * Brings nemeses into the world around the player they hunt.
 */
public final class NemesisSpawner {
    public enum Entrance {
        /** Comes down from the sky (flyers dive, the rest drop in). */
        SKY,
        /** Steps out of a portal / teleport on the ground. */
        GROUND,
        /** Bursts out of the earth right next to the player. */
        BURROW
    }

    public static List<EndgameBoss> spawn(ServerPlayer player, Nemesis nemesis, NemesisRecord record) {
        ServerLevel level = player.serverLevel();
        int players = Math.max(1, level.getPlayers(p -> !p.isSpectator() && !p.isCreative() && p.distanceToSqr(player) < 48 * 48).size());
        float health = record.savedHealth;
        int encounterLevel = record.victories;
        List<EndgameBoss> bosses = new ArrayList<>();

        switch (nemesis) {
            case VILTRUMITE_TRIAL -> {
                for (int i = 0; i < 2; i++) {
                    ViltrumiteEnforcerEntity enforcer = create(ModEntities.VILTRUMITE_ENFORCER.get(), level);
                    enforcer.setVariant(i);
                    add(bosses, place(enforcer, player, Entrance.SKY, 14, 24), player, nemesis, record, players, health, encounterLevel);
                }
            }
            case CONQUEST -> add(bosses, place(create(ModEntities.CONQUEST.get(), level), player, Entrance.SKY, 14, 22), player, nemesis, record, players, health, encounterLevel);
            case THRAGG -> add(bosses, place(create(ModEntities.THRAGG.get(), level), player, Entrance.SKY, 14, 22), player, nemesis, record, players, health, encounterLevel);
            case LOKI -> {
                add(bosses, place(create(ModEntities.LOKI.get(), level), player, Entrance.GROUND, 10, 16), player, nemesis, record, players, health, encounterLevel);
                minions(ModEntities.CHITAURI.get(), 3, player, record, Entrance.GROUND);
            }
            case BLACK_ORDER -> {
                boolean first = InfinityCampaign.get(level.getServer()).blackOrderRaids() % 2 == 0;
                EntityType<? extends EndgameBoss> a = first ? ModEntities.EBONY_MAW.get() : ModEntities.PROXIMA_MIDNIGHT.get();
                EntityType<? extends EndgameBoss> b = first ? ModEntities.CULL_OBSIDIAN.get() : ModEntities.CORVUS_GLAIVE.get();
                add(bosses, place(create(a, level), player, Entrance.GROUND, 10, 16), player, nemesis, record, players, health, encounterLevel);
                add(bosses, place(create(b, level), player, Entrance.GROUND, 10, 16), player, nemesis, record, players, health, encounterLevel);
            }
            case THANOS -> {
                add(bosses, place(create(ModEntities.THANOS.get(), level), player, Entrance.GROUND, 12, 18), player, nemesis, record, players, health,
                        InfinityCampaign.get(level.getServer()).thanosDefeats());
                minions(ModEntities.CHITAURI.get(), 2, player, record, Entrance.GROUND);
            }
            case DOOMBOTS -> {
                int count = EndgameConfig.DOOM_DOOMBOT_COUNT.get();
                for (int i = 0; i < count; i++) {
                    add(bosses, place(create(ModEntities.DOOMBOT.get(), level), player, Entrance.SKY, 12, 22), player, nemesis, record, players, health, encounterLevel);
                }
            }
            case DOCTOR_DOOM -> add(bosses, place(create(ModEntities.DOCTOR_DOOM.get(), level), player, Entrance.GROUND, 10, 14), player, nemesis, record, players, health, encounterLevel);
            case DOOMSDAY -> add(bosses, place(create(ModEntities.DOOMSDAY.get(), level), player, Entrance.BURROW, 6, 10), player, nemesis, record, players, health, encounterLevel);
            case ZOOM -> add(bosses, place(create(ModEntities.ZOOM.get(), level), player, Entrance.GROUND, 12, 20), player, nemesis, record, players, health, encounterLevel);
            case SENTINELS -> {
                int count = Mth.clamp(1 + FsangCompat.skillLevel(player) / 20, 1, 3);
                for (int i = 0; i < count; i++) {
                    add(bosses, place(create(ModEntities.SENTINEL.get(), level), player, Entrance.SKY, 14, 26), player, nemesis, record, players, health, encounterLevel);
                }
            }
            case MASTER_MOLD -> add(bosses, place(create(ModEntities.MASTER_MOLD.get(), level), player, Entrance.GROUND, 20, 30), player, nemesis, record, players, health, encounterLevel);
            case GHOST_RIDER -> add(bosses, place(create(ModEntities.GHOST_RIDER.get(), level), player, Entrance.GROUND, 10, 16), player, nemesis, record, players, health, encounterLevel);
            case DORMAMMU -> {
                // Dormammu is summoned through the Eye of Agamotto, never by the director.
            }
        }
        return bosses;
    }

    private static <T extends EndgameBoss> T create(EntityType<T> type, ServerLevel level) {
        T entity = type.create(level);
        if (entity == null) {
            throw new IllegalStateException("Could not create " + type);
        }
        return entity;
    }

    private static void add(List<EndgameBoss> list, @Nullable EndgameBoss boss, ServerPlayer player, Nemesis nemesis,
                            NemesisRecord record, int players, float health, int encounterLevel) {
        if (boss == null) {
            return;
        }
        ServerLevel level = player.serverLevel();
        boss.finalizeSpawn(level, level.getCurrentDifficultyAt(boss.blockPosition()), MobSpawnType.EVENT, null, null);
        boss.setupFor(player, nemesis, record.encounterId, players, health, encounterLevel);
        if (boss instanceof InfinityVillain villain) {
            villain.loadStones(InfinityCampaign.get(level.getServer()));
        }
        level.addFreshEntity(boss);
        boss.playArrival();
        list.add(boss);
    }

    private static void minions(EntityType<? extends EndgameBoss> type, int count, ServerPlayer player, NemesisRecord record, Entrance entrance) {
        ServerLevel level = player.serverLevel();
        for (int i = 0; i < count; i++) {
            EndgameBoss minion = type.create(level);
            if (minion == null || place(minion, player, entrance, 8, 14) == null) {
                continue;
            }
            minion.finalizeSpawn(level, level.getCurrentDifficultyAt(minion.blockPosition()), MobSpawnType.EVENT, null, null);
            minion.setupFor(player, null, record.encounterId, 1, 1.0F, record.victories);
            level.addFreshEntity(minion);
            minion.playArrival();
        }
    }

    /** Positions the boss for its entrance. Returns null if no spot was found. */
    @Nullable
    public static <T extends EndgameBoss> T place(T boss, ServerPlayer player, Entrance entrance, double minDistance, double maxDistance) {
        ServerLevel level = player.serverLevel();
        Vec3 pos = null;
        if (entrance == Entrance.BURROW) {
            minDistance = Math.min(minDistance, 4);
        }
        for (int attempt = 0; attempt < 40 && pos == null; attempt++) {
            double angle = level.random.nextDouble() * Math.PI * 2;
            double distance = minDistance + level.random.nextDouble() * (maxDistance - minDistance);
            int x = Mth.floor(player.getX() + Math.cos(angle) * distance);
            int z = Mth.floor(player.getZ() + Math.sin(angle) * distance);
            if (entrance == Entrance.SKY && level.canSeeSky(player.blockPosition())) {
                int ground = level.getHeight(Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, x, z);
                if (Math.abs(ground - player.getY()) > 24) {
                    continue;
                }
                double y = Math.min(Math.max(ground, player.getY()) + 28 + level.random.nextInt(10), level.getMaxBuildHeight() - 4);
                Vec3 candidate = new Vec3(x + 0.5, y, z + 0.5);
                if (level.noCollision(boss.getType().getAABB(candidate.x, candidate.y, candidate.z))) {
                    pos = candidate;
                }
            } else {
                BlockPos standable = findStandable(level, boss.getType(), x, Mth.floor(player.getY()), z, 6);
                if (standable != null) {
                    pos = Vec3.atBottomCenterOf(standable);
                }
            }
        }
        if (pos == null) {
            // Cramped spaces: appear right next to the player.
            BlockPos standable = findStandable(level, boss.getType(), player.getBlockX(), player.getBlockY(), player.getBlockZ(), 3);
            pos = standable != null ? Vec3.atBottomCenterOf(standable) : player.position();
        }
        float yaw = (float) (Mth.atan2(player.getZ() - pos.z, player.getX() - pos.x) * Mth.RAD_TO_DEG) - 90.0F;
        boss.moveTo(pos.x, pos.y, pos.z, yaw, 0.0F);
        boss.setYHeadRot(yaw);
        boss.setYBodyRot(yaw);
        return boss;
    }

    @Nullable
    public static BlockPos findStandable(ServerLevel level, EntityType<?> type, int x, int y, int z, int range) {
        for (int dy = 0; dy <= range; dy++) {
            for (int sign : new int[]{1, -1}) {
                if (dy == 0 && sign == -1) {
                    continue;
                }
                BlockPos pos = new BlockPos(x, y + dy * sign, z);
                if (!level.isInWorldBounds(pos)) {
                    continue;
                }
                BlockPos below = pos.below();
                if (level.getBlockState(below).isFaceSturdy(level, below, Direction.UP)
                        && level.noCollision(type.getAABB(pos.getX() + 0.5, pos.getY(), pos.getZ() + 0.5))
                        && level.getFluidState(pos).isEmpty()) {
                    return pos;
                }
            }
        }
        return null;
    }

    private NemesisSpawner() {
    }
}
