package com.kirkleekirk.heroesendgame.nemesis;

import com.kirkleekirk.heroesendgame.infinity.InfinityState;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.server.MinecraftServer;
import net.minecraft.world.level.saveddata.SavedData;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * World-wide save file (data/heroes_endgame.dat in the overworld folder).
 */
public final class EndgameSavedData extends SavedData {
    private static final String NAME = "heroes_endgame";

    private final Map<UUID, PlayerNemesisData> players = new HashMap<>();
    private InfinityState infinity = new InfinityState();

    public static EndgameSavedData get(MinecraftServer server) {
        return server.overworld().getDataStorage().computeIfAbsent(EndgameSavedData::load, EndgameSavedData::new, NAME);
    }

    public PlayerNemesisData player(UUID id) {
        setDirty();
        return players.computeIfAbsent(id, uuid -> new PlayerNemesisData());
    }

    public Map<UUID, PlayerNemesisData> players() {
        return players;
    }

    public InfinityState infinity() {
        setDirty();
        return infinity;
    }

    @Override
    public CompoundTag save(CompoundTag tag) {
        CompoundTag playersTag = new CompoundTag();
        players.forEach((uuid, data) -> playersTag.put(uuid.toString(), data.save()));
        tag.put("Players", playersTag);
        tag.put("Infinity", infinity.save());
        return tag;
    }

    public static EndgameSavedData load(CompoundTag tag) {
        EndgameSavedData data = new EndgameSavedData();
        CompoundTag playersTag = tag.getCompound("Players");
        for (String key : playersTag.getAllKeys()) {
            try {
                data.players.put(UUID.fromString(key), PlayerNemesisData.load(playersTag.getCompound(key)));
            } catch (IllegalArgumentException ignored) {
                // corrupt key
            }
        }
        data.infinity = InfinityState.load(tag.getCompound("Infinity"));
        return data;
    }
}
