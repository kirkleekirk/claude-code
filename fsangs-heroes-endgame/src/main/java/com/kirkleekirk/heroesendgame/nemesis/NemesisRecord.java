package com.kirkleekirk.heroesendgame.nemesis;

import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.ListTag;
import net.minecraft.nbt.NbtUtils;
import net.minecraft.nbt.Tag;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * State of one nemesis storyline for one player.
 */
public final class NemesisRecord {
    public enum Status {
        /** Not triggered (or eligible again). */
        DORMANT,
        /** The player has been warned that something is coming. */
        WARNED,
        /** Arrival is scheduled for {@link #scheduledAt}. */
        SCHEDULED,
        /** The boss(es) are in the world hunting the player. */
        ACTIVE,
        /** Beaten for good (or until a rematch timer puts it back to DORMANT). */
        DEFEATED
    }

    public Status status = Status.DORMANT;
    /** Game time of arrival while SCHEDULED. */
    public long scheduledAt;
    /** Game time before which the storyline can't trigger again. */
    public long cooldownUntil;
    public int victories;
    public int losses;
    /** Health fraction the bosses had when the encounter was interrupted (logout, dimension change). */
    public float savedHealth = 1.0F;
    public UUID encounterId = UUID.randomUUID();
    public final List<UUID> bosses = new ArrayList<>();
    public long lastEncounter;
    /** Storyline specific data. */
    public CompoundTag extra = new CompoundTag();

    public boolean isBusy() {
        return status == Status.SCHEDULED || status == Status.ACTIVE;
    }

    public CompoundTag save() {
        CompoundTag tag = new CompoundTag();
        tag.putString("Status", status.name());
        tag.putLong("ScheduledAt", scheduledAt);
        tag.putLong("CooldownUntil", cooldownUntil);
        tag.putInt("Victories", victories);
        tag.putInt("Losses", losses);
        tag.putFloat("SavedHealth", savedHealth);
        tag.putUUID("EncounterId", encounterId);
        ListTag list = new ListTag();
        for (UUID boss : bosses) {
            list.add(NbtUtils.createUUID(boss));
        }
        tag.put("Bosses", list);
        tag.putLong("LastEncounter", lastEncounter);
        tag.put("Extra", extra);
        return tag;
    }

    public static NemesisRecord load(CompoundTag tag) {
        NemesisRecord record = new NemesisRecord();
        try {
            record.status = Status.valueOf(tag.getString("Status"));
        } catch (IllegalArgumentException e) {
            record.status = Status.DORMANT;
        }
        record.scheduledAt = tag.getLong("ScheduledAt");
        record.cooldownUntil = tag.getLong("CooldownUntil");
        record.victories = tag.getInt("Victories");
        record.losses = tag.getInt("Losses");
        record.savedHealth = tag.contains("SavedHealth") ? tag.getFloat("SavedHealth") : 1.0F;
        if (tag.hasUUID("EncounterId")) {
            record.encounterId = tag.getUUID("EncounterId");
        }
        for (Tag uuid : tag.getList("Bosses", Tag.TAG_INT_ARRAY)) {
            record.bosses.add(NbtUtils.loadUUID(uuid));
        }
        record.lastEncounter = tag.getLong("LastEncounter");
        record.extra = tag.getCompound("Extra");
        return record;
    }
}
