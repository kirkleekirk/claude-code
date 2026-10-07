package com.kirkleekirk.heroesendgame.entity.infinity;

import com.kirkleekirk.heroesendgame.entity.BossStats;
import com.kirkleekirk.heroesendgame.entity.EndgameBoss;
import com.kirkleekirk.heroesendgame.entity.ability.BossAbility;
import com.kirkleekirk.heroesendgame.entity.ability.PullAbility;
import com.kirkleekirk.heroesendgame.entity.ability.VolleyAbility;
import com.kirkleekirk.heroesendgame.entity.projectile.EnergyBoltEntity;
import com.kirkleekirk.heroesendgame.registry.ModDamageTypes;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.Vec3;

import java.util.List;

/**
 * Ebony Maw, Thanos' herald. Never lets you near him: telekinetic grip, debris storms, and he tears the weapon out
 * of your hand.
 */
public class EbonyMawEntity extends BlackOrderEntity {
    private static final BossStats STATS = new BossStats(380, 7, 11, 45, 0.08F, 8, 0.3);

    public EbonyMawEntity(EntityType<? extends EbonyMawEntity> type, Level level) {
        super(type, level);
    }

    public static AttributeSupplier.Builder createAttributes() {
        return EndgameBoss.bossAttributes(380, 7, 0.3, 8);
    }

    @Override
    public BossStats stats() {
        return STATS;
    }

    @Override
    protected String dialogueKey() {
        return "ebony_maw";
    }

    @Override
    protected void registerAbilities(List<BossAbility> abilities) {
        abilities.add(new VolleyAbility(this, 90, 5, 4, EnergyBoltEntity.Variant.TELEKINETIC, 0.6F, 1.0, true, SoundEvents.SHULKER_SHOOT, 0));
        abilities.add(new PullAbility(this, 160, 4, 20, 1.0F, ModDamageTypes.TELEKINESIS, ParticleTypes.ENCHANT, SoundEvents.EVOKER_CAST_SPELL));
        abilities.add(new HurlAbility(this));
        abilities.add(new DisarmAbility(this));
    }

    @Override
    protected void customServerAiStep() {
        super.customServerAiStep();
        // Keeps his distance: anyone who gets too close is pushed away.
        LivingEntity target = getTarget();
        if (target != null && tickCount % 30 == 0 && distanceTo(target) < 3.0 && !isMovementLocked()) {
            Vec3 push = target.position().subtract(position()).normalize().scale(1.6);
            launch(target, push.add(0, 0.4, 0));
            burst(ParticleTypes.ENCHANT, 20, 1.0);
            playSound(SoundEvents.EVOKER_CAST_SPELL, 1.0F, 1.2F);
        }
    }

    /** Lifts the hero into the air and throws them away. */
    static class HurlAbility extends BossAbility {
        HurlAbility(EndgameBoss boss) {
            super(boss);
        }

        @Override
        public int cooldownTicks() {
            return 220;
        }

        @Override
        public boolean canUse(LivingEntity target) {
            return boss.distanceTo(target) < 16 && boss.hasLineOfSight(target);
        }

        @Override
        public boolean tick(LivingEntity target) {
            boss.getLookControl().setLookAt(target);
            if (ticks < 20) {
                target.addEffect(new MobEffectInstance(MobEffects.LEVITATION, 5, 3, false, false));
                boss.burst(ParticleTypes.ENCHANT, 6, 1.0);
                return true;
            }
            Vec3 away = target.position().subtract(boss.position()).multiply(1, 0, 1).normalize();
            boss.strike(target, 0.9F, ModDamageTypes.TELEKINESIS);
            launch(target, away.scale(2.2).add(0, 0.9, 0));
            boss.playSound(SoundEvents.EVOKER_CAST_SPELL, 2.0F, 0.6F);
            return false;
        }
    }

    /** Tears the weapon out of the hero's hand (into their inventory - nothing is lost). */
    static class DisarmAbility extends BossAbility {
        DisarmAbility(EndgameBoss boss) {
            super(boss);
        }

        @Override
        public int cooldownTicks() {
            return 400;
        }

        @Override
        public int weight() {
            return 5;
        }

        @Override
        public boolean canUse(LivingEntity target) {
            return target instanceof ServerPlayer player && !player.getMainHandItem().isEmpty()
                    && player.getInventory().getFreeSlot() >= 0 && boss.distanceTo(target) < 14;
        }

        @Override
        public boolean tick(LivingEntity target) {
            if (ticks < 12) {
                boss.burst(ParticleTypes.ENCHANT, 5, 1.0);
                return true;
            }
            if (target instanceof ServerPlayer player) {
                Inventory inventory = player.getInventory();
                int free = -1;
                // Prefer a slot outside the hotbar so the weapon really is gone from reach.
                for (int i = Inventory.getSelectionSize(); i < inventory.items.size(); i++) {
                    if (inventory.items.get(i).isEmpty()) {
                        free = i;
                        break;
                    }
                }
                if (free < 0) {
                    free = inventory.getFreeSlot();
                }
                if (free >= 0 && free != inventory.selected) {
                    ItemStack weapon = player.getMainHandItem().copy();
                    inventory.items.set(inventory.selected, ItemStack.EMPTY);
                    inventory.items.set(free, weapon);
                    inventory.setChanged();
                    ((EbonyMawEntity) boss).say("disarm");
                    boss.playSound(SoundEvents.ITEM_BREAK, 1.0F, 0.6F);
                }
            }
            return false;
        }
    }
}
