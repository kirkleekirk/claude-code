package com.kirkleekirk.heroesendgame.entity.infinity;

import com.kirkleekirk.heroesendgame.entity.BossStats;
import com.kirkleekirk.heroesendgame.entity.EndgameBoss;
import com.kirkleekirk.heroesendgame.entity.ability.BossAbility;
import com.kirkleekirk.heroesendgame.entity.ability.LeapSlamAbility;
import com.kirkleekirk.heroesendgame.entity.ability.VolleyAbility;
import com.kirkleekirk.heroesendgame.entity.projectile.EnergyBoltEntity;
import com.kirkleekirk.heroesendgame.registry.ModDamageTypes;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.level.Level;

import java.util.List;

/**
 * Proxima Midnight: fastest of the Black Order. Throws her spear with deadly accuracy and leaps on anyone who
 * tries to keep their distance.
 */
public class ProximaMidnightEntity extends BlackOrderEntity {
    private static final BossStats STATS = new BossStats(420, 9, 10, 45, 0.08F, 10, 0.38);

    public ProximaMidnightEntity(EntityType<? extends ProximaMidnightEntity> type, Level level) {
        super(type, level);
    }

    public static AttributeSupplier.Builder createAttributes() {
        return EndgameBoss.bossAttributes(420, 9, 0.38, 10);
    }

    @Override
    public BossStats stats() {
        return STATS;
    }

    @Override
    protected String dialogueKey() {
        return "proxima_midnight";
    }

    @Override
    protected double chaseSpeed() {
        return 1.2;
    }

    @Override
    protected int meleeInterval() {
        return 14;
    }

    @Override
    protected void registerAbilities(List<BossAbility> abilities) {
        abilities.add(new VolleyAbility(this, 100, 1, 1, EnergyBoltEntity.Variant.SPEAR, 1.6F, 2.2, false, SoundEvents.TRIDENT_THROW, 5));
        abilities.add(new VolleyAbility(this, 240, 3, 5, EnergyBoltEntity.Variant.SPEAR, 0.9F, 1.8, true, SoundEvents.TRIDENT_THROW, 3));
        abilities.add(new LeapSlamAbility(this, 180, 4.0, 1.3F, ModDamageTypes.NEMESIS));
    }
}
