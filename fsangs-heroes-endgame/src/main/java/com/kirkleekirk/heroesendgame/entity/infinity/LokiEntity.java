package com.kirkleekirk.heroesendgame.entity.infinity;

import com.kirkleekirk.heroesendgame.compat.FsangCompat;
import com.kirkleekirk.heroesendgame.entity.BossStats;
import com.kirkleekirk.heroesendgame.entity.EndgameBoss;
import com.kirkleekirk.heroesendgame.entity.IllusionEntity;
import com.kirkleekirk.heroesendgame.entity.ability.BlinkStrikeAbility;
import com.kirkleekirk.heroesendgame.entity.ability.BossAbility;
import com.kirkleekirk.heroesendgame.entity.ability.SummonAbility;
import com.kirkleekirk.heroesendgame.entity.ability.VolleyAbility;
import com.kirkleekirk.heroesendgame.entity.projectile.EnergyBoltEntity;
import com.kirkleekirk.heroesendgame.infinity.InfinityCampaign;
import com.kirkleekirk.heroesendgame.infinity.InfinityState;
import com.kirkleekirk.heroesendgame.infinity.InfinityStone;
import com.kirkleekirk.heroesendgame.nemesis.NemesisDirector;
import com.kirkleekirk.heroesendgame.nemesis.Rewards;
import com.kirkleekirk.heroesendgame.HeroesEndgame;
import com.kirkleekirk.heroesendgame.power.PowerFamily;
import com.kirkleekirk.heroesendgame.power.PowerProfile;
import com.kirkleekirk.heroesendgame.registry.ModDamageTypes;
import com.kirkleekirk.heroesendgame.registry.ModEntities;
import com.kirkleekirk.heroesendgame.registry.ModItems;
import net.minecraft.ChatFormatting;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.BossEvent;
import net.minecraft.world.DifficultyInstance;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.MobSpawnType;
import net.minecraft.world.entity.SpawnGroupData;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.ServerLevelAccessor;
import net.minecraft.nbt.CompoundTag;
import org.jetbrains.annotations.Nullable;

import java.util.List;

/**
 * Act I of the Infinity Saga. Thanos' herald comes for the stone that woke him, at the head of a Chitauri army.
 * Illusions, a mind-controlling scepter (the Mind Stone) and a knife in the back. Hulks deal double damage to him.
 */
public class LokiEntity extends EndgameBoss {
    private static final BossStats STATS = new BossStats(350, 7, 11, 45, 0.08F, 10, 0.32);

    public LokiEntity(EntityType<? extends LokiEntity> type, Level level) {
        super(type, level);
    }

    public static AttributeSupplier.Builder createAttributes() {
        return EndgameBoss.bossAttributes(350, 7, 0.32, 10);
    }

    @Override
    public BossStats stats() {
        return STATS;
    }

    @Override
    protected String dialogueKey() {
        return "loki";
    }

    @Override
    protected BossEvent.BossBarColor bossBarColor() {
        return BossEvent.BossBarColor.GREEN;
    }

    @Override
    protected ChatFormatting nameColor() {
        return ChatFormatting.GREEN;
    }

    @Override
    protected float[] phaseThresholds() {
        return new float[]{0.5F};
    }

    @Override
    protected void onPhaseChange(int phase) {
        say("army");
        SummonAbility army = ability(SummonAbility.class);
        if (army != null && getTarget() != null) {
            startAbility(army, getTarget());
        }
    }

    @Override
    protected void registerAbilities(List<BossAbility> abilities) {
        abilities.add(new IllusionAbility(this));
        abilities.add(new VolleyAbility(this, 140, 2, 12, EnergyBoltEntity.Variant.SCEPTER, 1.0F, 1.1, true, SoundEvents.ILLUSIONER_CAST_SPELL, 3));
        abilities.add(new BlinkStrikeAbility(this, 200, 1.6F, ModDamageTypes.NEMESIS, ParticleTypes.HAPPY_VILLAGER, 6));
        abilities.add(new SummonAbility(this, 700, ModEntities.CHITAURI::get, 4, 6, ParticleTypes.PORTAL, 1));
    }

    /** "Puny god." */
    @Override
    protected float modifyIncomingDamage(DamageSource source, float amount) {
        if (source.getEntity() instanceof ServerPlayer player) {
            PowerProfile profile = NemesisDirector.cachedProfile(player);
            if (profile != null && profile.is(PowerFamily.HULK)) {
                return amount * 2.0F;
            }
        }
        return amount;
    }

    @Override
    protected void onDefeated(DamageSource source) {
        if (source.getEntity() instanceof ServerPlayer player) {
            PowerProfile profile = NemesisDirector.cachedProfile(player);
            if (profile != null && profile.is(PowerFamily.HULK)) {
                say("puny_god");
                Rewards.award(player, HeroesEndgame.id("puny_god"));
                return;
            }
        }
        super.onDefeated(source);
    }

    @Override
    protected void dropCustomDeathLoot(DamageSource source, int looting, boolean recentlyHit) {
        super.dropCustomDeathLoot(source, looting, recentlyHit);
        if (level() instanceof ServerLevel serverLevel) {
            InfinityCampaign campaign = InfinityCampaign.get(serverLevel.getServer());
            if (campaign.owner(InfinityStone.MIND) != InfinityState.Owner.THANOS) {
                // The scepter shatters, leaving the Mind Stone behind.
                spawnAtLocation(new ItemStack(ModItems.stone(InfinityStone.MIND)));
                campaign.markFound(InfinityStone.MIND, null);
            }
        }
    }

    @Override
    public void playArrival() {
        burst(ParticleTypes.PORTAL, 120, 1.5);
        playSound(SoundEvents.END_PORTAL_SPAWN, 1.5F, 1.4F);
        sayRandom("arrival", 2);
    }

    @Override
    public SpawnGroupData finalizeSpawn(ServerLevelAccessor level, DifficultyInstance difficulty, MobSpawnType reason,
                                        @Nullable SpawnGroupData data, @Nullable CompoundTag tag) {
        SpawnGroupData result = super.finalizeSpawn(level, difficulty, reason, data, tag);
        FsangCompat.equipSuit(this, "loki_god_of_stories");
        return result;
    }

    /** Conjures look-alikes and swaps places with one of them. */
    static class IllusionAbility extends BossAbility {
        IllusionAbility(EndgameBoss boss) {
            super(boss);
        }

        @Override
        public int cooldownTicks() {
            return 320;
        }

        @Override
        public boolean tick(LivingEntity target) {
            if (ticks < 15) {
                boss.burst(ParticleTypes.HAPPY_VILLAGER, 6, 1.0);
                return true;
            }
            if (!(boss.level() instanceof ServerLevel level)) {
                return false;
            }
            IllusionEntity swap = null;
            for (int i = 0; i < 3; i++) {
                IllusionEntity illusion = ModEntities.ILLUSION.get().create(level);
                if (illusion == null) {
                    continue;
                }
                double angle = i * (Math.PI * 2 / 3) + boss.getRandom().nextDouble();
                double x = target.getX() + Math.cos(angle) * 5;
                double z = target.getZ() + Math.sin(angle) * 5;
                illusion.moveTo(boss.getX(), boss.getY(), boss.getZ(), boss.getYRot(), 0);
                if (!illusion.randomTeleport(x, target.getY() + 1, z, false)) {
                    continue;
                }
                illusion.setVariant(IllusionEntity.LOKI);
                illusion.markSummoned();
                illusion.setupFor(boss.getHuntedPlayer(), null, boss.getEncounterId(), 1, 1.0F, 0);
                illusion.setTarget(target);
                illusion.copyLook(boss);
                level.addFreshEntity(illusion);
                illusion.burst(ParticleTypes.HAPPY_VILLAGER, 20, 1.0);
                swap = illusion;
            }
            if (swap != null) {
                // Trade places with the last illusion: which one is real?
                double x = boss.getX(), y = boss.getY(), z = boss.getZ();
                boss.teleportTo(swap.getX(), swap.getY(), swap.getZ());
                swap.teleportTo(x, y, z);
            }
            boss.playSound(SoundEvents.ILLUSIONER_MIRROR_MOVE, 2.0F, 1.0F);
            ((LokiEntity) boss).sayRandom("illusion", 2);
            return false;
        }
    }
}
