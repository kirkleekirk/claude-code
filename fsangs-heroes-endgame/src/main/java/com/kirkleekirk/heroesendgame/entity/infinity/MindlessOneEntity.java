package com.kirkleekirk.heroesendgame.entity.infinity;

import com.kirkleekirk.heroesendgame.entity.BossStats;
import com.kirkleekirk.heroesendgame.entity.EndgameBoss;
import com.kirkleekirk.heroesendgame.entity.ability.BeamAbility;
import com.kirkleekirk.heroesendgame.entity.ability.BossAbility;
import com.kirkleekirk.heroesendgame.registry.ModDamageTypes;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.level.Level;

import java.util.List;

/**
 * Dormammu's shock troops: hulking, mindless, with fire pouring out of their heads.
 */
public class MindlessOneEntity extends EndgameBoss {
    private static final BossStats STATS = new BossStats(60, 6, 15, 8, 0.4F, 10, 0.26);

    public MindlessOneEntity(EntityType<? extends MindlessOneEntity> type, Level level) {
        super(type, level);
        this.xpReward = 15;
    }

    public static AttributeSupplier.Builder createAttributes() {
        return EndgameBoss.bossAttributes(60, 6, 0.26, 10);
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
        return "mindless_one";
    }

    @Override
    public float renderScale() {
        return 1.25F;
    }

    @Override
    protected void registerAbilities(List<BossAbility> abilities) {
        abilities.add(new BeamAbility(this, 160, 20, 20, 12, 0.5F, ModDamageTypes.DARK_DIMENSION, ParticleTypes.FLAME, SoundEvents.BLAZE_BURN));
    }

    @Override
    protected void onMeleeHit(LivingEntity target) {
        target.setSecondsOnFire(3);
    }

    @Override
    public void playArrival() {
        burst(ParticleTypes.FLAME, 40, 1.0);
        playSound(SoundEvents.BLAZE_AMBIENT, 1.5F, 0.5F);
    }
}
