package com.kirkleekirk.heroesendgame.infinity;

import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.ListTag;
import net.minecraft.nbt.Tag;
import org.jetbrains.annotations.Nullable;

import java.util.EnumMap;
import java.util.Map;
import java.util.UUID;

/**
 * Saved state of the world-wide Infinity Saga.
 */
public final class InfinityState {
    public enum Stage {
        /** Thanos is unaware of this world. */
        DORMANT,
        /** Act I: Loki leads the Chitauri to take the stone that woke Thanos. */
        HERALD,
        /** Act II: the infinity clock - Thanos claims a stone or sends the Black Order every few days. */
        CLOCK,
        /** Act III: "Fine. I'll do it myself." */
        THANOS,
        /** Thanos completed the Gauntlet and snapped. He must be defeated to bring everyone back. */
        SNAPPED,
        /** Thanos was defeated. The stones belong to the heroes now. */
        ENDED
    }

    public enum Owner {
        UNCLAIMED, FOUND, THANOS
    }

    public Stage stage = Stage.DORMANT;
    public final Map<InfinityStone, Owner> owners = new EnumMap<>(InfinityStone.class);
    public long startedAt;
    public long nextClockAt;
    public int blackOrderRaids;
    public int thanosDefeats;
    public boolean snapActive;
    /** Creatures turned to dust by Thanos' snap, kept so they can be brought back ({Dim, Entity}). */
    public final ListTag dusted = new ListTag();
    public static final int MAX_DUSTED = 1000;
    @Nullable
    public UUID heraldTarget;

    public InfinityState() {
        for (InfinityStone stone : InfinityStone.values()) {
            owners.put(stone, Owner.UNCLAIMED);
        }
    }

    public int count(Owner owner) {
        int count = 0;
        for (Owner value : owners.values()) {
            if (value == owner) {
                count++;
            }
        }
        return count;
    }

    public CompoundTag save() {
        CompoundTag tag = new CompoundTag();
        tag.putString("Stage", stage.name());
        CompoundTag ownersTag = new CompoundTag();
        owners.forEach((stone, owner) -> ownersTag.putString(stone.getSerializedName(), owner.name()));
        tag.put("Owners", ownersTag);
        tag.putLong("StartedAt", startedAt);
        tag.putLong("NextClockAt", nextClockAt);
        tag.putInt("BlackOrderRaids", blackOrderRaids);
        tag.putInt("ThanosDefeats", thanosDefeats);
        tag.putBoolean("SnapActive", snapActive);
        tag.put("Dusted", dusted.copy());
        if (heraldTarget != null) {
            tag.putUUID("HeraldTarget", heraldTarget);
        }
        return tag;
    }

    public static InfinityState load(CompoundTag tag) {
        InfinityState state = new InfinityState();
        try {
            state.stage = tag.contains("Stage") ? Stage.valueOf(tag.getString("Stage")) : Stage.DORMANT;
        } catch (IllegalArgumentException e) {
            state.stage = Stage.DORMANT;
        }
        CompoundTag ownersTag = tag.getCompound("Owners");
        for (InfinityStone stone : InfinityStone.values()) {
            try {
                if (ownersTag.contains(stone.getSerializedName())) {
                    state.owners.put(stone, Owner.valueOf(ownersTag.getString(stone.getSerializedName())));
                }
            } catch (IllegalArgumentException ignored) {
                // keep default
            }
        }
        state.startedAt = tag.getLong("StartedAt");
        state.nextClockAt = tag.getLong("NextClockAt");
        state.blackOrderRaids = tag.getInt("BlackOrderRaids");
        state.thanosDefeats = tag.getInt("ThanosDefeats");
        state.snapActive = tag.getBoolean("SnapActive");
        state.dusted.addAll(tag.getList("Dusted", Tag.TAG_COMPOUND));
        state.heraldTarget = tag.hasUUID("HeraldTarget") ? tag.getUUID("HeraldTarget") : null;
        return state;
    }
}
