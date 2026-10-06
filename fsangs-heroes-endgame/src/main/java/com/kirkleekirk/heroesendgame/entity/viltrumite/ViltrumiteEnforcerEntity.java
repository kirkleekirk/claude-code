package com.kirkleekirk.heroesendgame.entity.viltrumite;

import com.kirkleekirk.heroesendgame.entity.BossStats;
import com.kirkleekirk.heroesendgame.entity.EndgameBoss;
import net.minecraft.network.chat.Component;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.level.Level;

/**
 * The coming-of-age trial: two Empire enforcers sent to see whether a young Viltrumite is strong enough to live.
 * The weak are purged. Variant 0 wears FSang's Viltrumite Soldier uniform, variant 1 the Scout uniform.
 */
public class ViltrumiteEnforcerEntity extends AbstractViltrumiteEntity {
    private static final BossStats STATS = new BossStats(220, 8, 10, 35, 0.08F, 12, 0.85);

    public ViltrumiteEnforcerEntity(EntityType<? extends ViltrumiteEnforcerEntity> type, Level level) {
        super(type, level);
    }

    public static AttributeSupplier.Builder createAttributes() {
        return EndgameBoss.bossAttributes(220, 8, 0.32, 12);
    }

    @Override
    public BossStats stats() {
        return STATS;
    }

    @Override
    protected String suit() {
        return getVariant() == 1 ? "viltrumite4" : "viltrumite";
    }

    @Override
    protected Component getTypeName() {
        return Component.translatable("entity.heroes_endgame.viltrumite_enforcer." + (getVariant() == 1 ? "scout" : "soldier"));
    }

    @Override
    protected void sayArrival() {
        // The pair always arrives together: one line each.
        say("arrival." + (getVariant() & 1));
    }
}
