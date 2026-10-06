package com.kirkleekirk.heroesendgame.entity.infinity;

import com.kirkleekirk.heroesendgame.entity.EndgameBoss;
import net.minecraft.ChatFormatting;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.BossEvent;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.level.Level;

/**
 * The Children of Thanos. They raid in pairs - Ebony Maw with Cull Obsidian, Proxima Midnight with Corvus Glaive -
 * to take Infinity Stones from whoever carries them.
 */
public abstract class BlackOrderEntity extends EndgameBoss {
    protected BlackOrderEntity(EntityType<? extends BlackOrderEntity> type, Level level) {
        super(type, level);
    }

    @Override
    protected BossEvent.BossBarColor bossBarColor() {
        return BossEvent.BossBarColor.PURPLE;
    }

    @Override
    protected ChatFormatting nameColor() {
        return ChatFormatting.DARK_PURPLE;
    }

    @Override
    public void playArrival() {
        burst(ParticleTypes.PORTAL, 100, 1.4);
        burst(ParticleTypes.REVERSE_PORTAL, 60, 1.0);
        playSound(SoundEvents.END_PORTAL_SPAWN, 1.2F, 0.7F);
        sayRandom("arrival", 2);
    }
}
