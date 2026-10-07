package com.kirkleekirk.heroesendgame.nemesis;

import net.minecraft.nbt.CompoundTag;

import java.util.EnumMap;
import java.util.HashMap;
import java.util.Map;

/**
 * Everything the director remembers about one player. Stored in world saved data, so it survives death.
 */
public final class PlayerNemesisData {
    private final Map<Nemesis, NemesisRecord> records = new EnumMap<>(Nemesis.class);

    /** Blocks covered at super speed (Zoom's trigger). */
    public double speedForceDistance;
    /** Sentinels destroyed by this mutant (Master Mold's trigger). */
    public int sentinelsDestroyed;
    /** Damage this player dealt to Doombots by damage category: Doom studies his rivals before facing them. */
    public final Map<String, Float> doomStudy = new HashMap<>();
    /** Last Viltrumite age seen, used for "you have grown older" style warnings. */
    public int lastSeenAge = -1;
    /** Warning flags that should only fire once per threshold. */
    public CompoundTag flags = new CompoundTag();
    public String lastKnownName = "";

    public NemesisRecord get(Nemesis nemesis) {
        return records.computeIfAbsent(nemesis, n -> new NemesisRecord());
    }

    public Map<Nemesis, NemesisRecord> records() {
        return records;
    }

    /** Number of different major nemeses this player has beaten. */
    public int majorVictories() {
        int count = 0;
        for (Map.Entry<Nemesis, NemesisRecord> entry : records.entrySet()) {
            if (entry.getKey().isMajor() && entry.getValue().victories > 0
                    && entry.getKey() != Nemesis.DOCTOR_DOOM) {
                count++;
            }
        }
        return count;
    }

    /** The damage category this player relies on most (for Doom's adaptation), or null. */
    public String favouriteDamageCategory() {
        String best = null;
        float bestAmount = 0;
        for (Map.Entry<String, Float> entry : doomStudy.entrySet()) {
            if (entry.getValue() > bestAmount) {
                bestAmount = entry.getValue();
                best = entry.getKey();
            }
        }
        return best;
    }

    public CompoundTag save() {
        CompoundTag tag = new CompoundTag();
        CompoundTag recordsTag = new CompoundTag();
        records.forEach((nemesis, record) -> recordsTag.put(nemesis.id(), record.save()));
        tag.put("Records", recordsTag);
        tag.putDouble("SpeedForceDistance", speedForceDistance);
        tag.putInt("SentinelsDestroyed", sentinelsDestroyed);
        CompoundTag study = new CompoundTag();
        doomStudy.forEach(study::putFloat);
        tag.put("DoomStudy", study);
        tag.putInt("LastSeenAge", lastSeenAge);
        tag.put("Flags", flags);
        tag.putString("Name", lastKnownName);
        return tag;
    }

    public static PlayerNemesisData load(CompoundTag tag) {
        PlayerNemesisData data = new PlayerNemesisData();
        CompoundTag recordsTag = tag.getCompound("Records");
        for (String key : recordsTag.getAllKeys()) {
            Nemesis nemesis = Nemesis.byId(key);
            if (nemesis != null) {
                data.records.put(nemesis, NemesisRecord.load(recordsTag.getCompound(key)));
            }
        }
        data.speedForceDistance = tag.getDouble("SpeedForceDistance");
        data.sentinelsDestroyed = tag.getInt("SentinelsDestroyed");
        CompoundTag study = tag.getCompound("DoomStudy");
        for (String key : study.getAllKeys()) {
            data.doomStudy.put(key, study.getFloat(key));
        }
        data.lastSeenAge = tag.contains("LastSeenAge") ? tag.getInt("LastSeenAge") : -1;
        data.flags = tag.getCompound("Flags");
        data.lastKnownName = tag.getString("Name");
        return data;
    }
}
