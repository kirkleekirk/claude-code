package com.kirkleekirk.heroesendgame.entity.infinity;

import com.kirkleekirk.heroesendgame.entity.BossStats;
import com.kirkleekirk.heroesendgame.entity.EndgameBoss;
import com.kirkleekirk.heroesendgame.entity.ability.BossAbility;
import com.kirkleekirk.heroesendgame.entity.ability.VolleyAbility;
import com.kirkleekirk.heroesendgame.entity.projectile.EnergyBoltEntity;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.level.Level;

import java.util.List;

/**
 * Chitauri foot soldier with an energy lance. Thanos' cannon fodder.
 */
public class ChitauriEntity extends EndgameBoss {
    private static final BossStats STATS = new BossStats(40, 4, 18, 6, 0.5F, 6, 0.3);

    public ChitauriEntity(EntityType<? extends ChitauriEntity> type, Level level) {
        super(type, level);
        this.xpReward = 12;
    }

    public static AttributeSupplier.Builder createAttributes() {
        return EndgameBoss.bossAttributes(40, 4, 0.3, 6);
    }

    @Override
    public BossStats stats() {
        return STATS;
    }

    @Override
    public boolean isMinion() {
        return true;
    }

    @Override
    protected String dialogueKey() {
        return "chitauri";
    }

    @Override
    protected void registerAbilities(List<BossAbility> abilities) {
        abilities.add(new VolleyAbility(this, 70, 3, 6, EnergyBoltEntity.Variant.CHITAURI, 0.8F, 1.3, false, SoundEvents.BLAZE_SHOOT, 4));
    }

    @Override
    public void playArrival() {
        burst(ParticleTypes.PORTAL, 40, 1.0);
        playSound(SoundEvents.ENDERMAN_TELEPORT, 1.0F, 0.6F);
    }
}
