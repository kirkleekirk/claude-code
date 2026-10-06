package com.kirkleekirk.heroesendgame.infinity;

import com.kirkleekirk.heroesendgame.HeroesEndgame;
import com.kirkleekirk.heroesendgame.config.EndgameConfig;
import com.kirkleekirk.heroesendgame.entity.EndgameBoss;
import com.kirkleekirk.heroesendgame.item.InfinityGauntletItem;
import com.kirkleekirk.heroesendgame.nemesis.Rewards;
import com.kirkleekirk.heroesendgame.registry.ModDamageTypes;
import com.kirkleekirk.heroesendgame.registry.ModItems;
import com.kirkleekirk.heroesendgame.util.Messages;
import net.minecraft.ChatFormatting;
import net.minecraft.core.particles.DustParticleOptions;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.effect.MobEffectCategory;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.monster.Enemy;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.entity.projectile.ProjectileUtil;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.ClipContext;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.EntityHitResult;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;
import org.joml.Vector3f;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * What the stones do in a hero's hands.
 */
public final class StonePowers {
    private static final Map<UUID, ArrayDeque<Snapshot>> HISTORY = new HashMap<>();
    private static final Map<UUID, Thrall> THRALLS = new HashMap<>();

    private record Snapshot(ResourceKey<Level> dimension, Vec3 pos, float yRot, float xRot, float health, int food, long time) {
    }

    private record Thrall(UUID controller, long expires) {
    }

    // =================================================================================================================
    // Passives
    // =================================================================================================================

    public static void passive(ServerPlayer player, InfinityStone stone, boolean inGauntlet) {
        switch (stone) {
            case MIND -> {
                // Every hostile mind nearby lights up.
                for (Mob mob : player.level().getEntitiesOfClass(Mob.class, player.getBoundingBox().inflate(24), m -> m instanceof Enemy)) {
                    mob.addEffect(new MobEffectInstance(MobEffects.GLOWING, 40, 0, true, false));
                }
            }
            case REALITY -> player.addEffect(new MobEffectInstance(MobEffects.DAMAGE_RESISTANCE, 60, 0, true, false, true));
            case POWER -> {
                player.addEffect(new MobEffectInstance(MobEffects.DAMAGE_BOOST, 60, 1, true, false, true));
                if (!inGauntlet && EndgameConfig.INFINITY_POWER_STONE_BURNS.get() && !sharingTheLoad(player)) {
                    player.hurt(ModDamageTypes.source(player.level(), ModDamageTypes.POWER_STONE), Math.max(1.0F, player.getMaxHealth() * 0.03F));
                    player.displayClientMessage(Component.translatable("message.heroes_endgame.power_stone.burn").withStyle(ChatFormatting.DARK_PURPLE), true);
                }
            }
            case TIME -> player.addEffect(new MobEffectInstance(MobEffects.DIG_SPEED, 60, 1, true, false, true));
            case SOUL -> player.addEffect(new MobEffectInstance(MobEffects.REGENERATION, 60, 0, true, false, true));
            case SPACE -> {
                // The Tesseract's power is in portals - see the portal gun integration.
            }
        }
    }

    /** Like the Guardians on Xandar: the Power Stone can be held if someone holds on with you. */
    private static boolean sharingTheLoad(ServerPlayer player) {
        for (Player other : player.level().players()) {
            if (other != player && !other.isSpectator() && other.distanceToSqr(player) < 16) {
                return true;
            }
        }
        return false;
    }

    // =================================================================================================================
    // Gauntlet powers
    // =================================================================================================================

    /** Uses a stone through the gauntlet. Returns the cooldown in ticks (0 if nothing happened). */
    public static int activate(ServerPlayer player, InfinityStone stone, ItemStack gauntlet) {
        ServerLevel level = player.serverLevel();
        return switch (stone) {
            case POWER -> {
                powerBlast(player, level);
                yield 100;
            }
            case SPACE -> teleport(player, 96) ? 40 : 0;
            case REALITY -> {
                int count = 0;
                for (Mob mob : level.getEntitiesOfClass(Mob.class, player.getBoundingBox().inflate(12),
                        m -> m instanceof Enemy && !(m instanceof EndgameBoss) && m.isAlive())) {
                    if (count++ >= 12) {
                        break;
                    }
                    level.sendParticles(ParticleTypes.BUBBLE_POP, mob.getX(), mob.getY() + mob.getBbHeight() / 2, mob.getZ(), 30, 0.4, 0.6, 0.4, 0.05);
                    mob.discard();
                }
                level.playSound(null, player.blockPosition(), SoundEvents.BUBBLE_COLUMN_UPWARDS_INSIDE, SoundSource.PLAYERS, 2.0F, 0.8F);
                player.displayClientMessage(Component.translatable("message.heroes_endgame.reality.used", count), true);
                yield count > 0 ? 400 : 20;
            }
            case SOUL -> {
                LivingEntity target = lookTarget(player, 32);
                if (target == null) {
                    yield 0;
                }
                float damage = Math.max(6.0F, target.getMaxHealth() * 0.15F);
                if (target.hurt(ModDamageTypes.source(level, ModDamageTypes.INFINITY, player), damage)) {
                    player.heal(Math.min(damage, player.getMaxHealth() * 0.3F));
                }
                line(level, player.getEyePosition(), target.getBoundingBox().getCenter(), new DustParticleOptions(new Vector3f(1.0F, 0.55F, 0.1F), 1.4F));
                level.playSound(null, player.blockPosition(), SoundEvents.SOUL_ESCAPE, SoundSource.PLAYERS, 1.5F, 0.7F);
                yield 200;
            }
            case TIME -> rewind(player) ? 600 : 0;
            case MIND -> {
                LivingEntity target = lookTarget(player, 32);
                if (!(target instanceof Mob mob) || target instanceof EndgameBoss) {
                    yield 0;
                }
                THRALLS.put(mob.getUUID(), new Thrall(player.getUUID(), level.getGameTime() + 1200));
                mob.setTarget(null);
                mob.addEffect(new MobEffectInstance(MobEffects.GLOWING, 1200, 0, false, false));
                line(level, player.getEyePosition(), mob.getBoundingBox().getCenter(), new DustParticleOptions(new Vector3f(1.0F, 0.85F, 0.1F), 1.2F));
                player.displayClientMessage(Component.translatable("message.heroes_endgame.mind.controlled", mob.getDisplayName()), true);
                level.playSound(null, player.blockPosition(), SoundEvents.EVOKER_PREPARE_WOLOLO, SoundSource.PLAYERS, 1.5F, 1.2F);
                yield 300;
            }
        };
    }

    private static void powerBlast(ServerPlayer player, ServerLevel level) {
        Vec3 look = player.getLookAngle();
        Vec3 eye = player.getEyePosition();
        DustParticleOptions purple = new DustParticleOptions(new Vector3f(0.6F, 0.15F, 0.9F), 2.0F);
        for (int i = 1; i <= 10; i++) {
            Vec3 p = eye.add(look.scale(i));
            level.sendParticles(purple, p.x, p.y, p.z, 4 + i, i * 0.08, i * 0.08, i * 0.08, 0.0);
        }
        for (LivingEntity victim : level.getEntitiesOfClass(LivingEntity.class, player.getBoundingBox().inflate(11),
                e -> e != player && e.isAlive())) {
            Vec3 to = victim.getBoundingBox().getCenter().subtract(eye);
            if (to.length() > 11 || to.normalize().dot(look) < 0.6) {
                continue;
            }
            if (victim instanceof Player other && !player.canHarmPlayer(other)) {
                continue;
            }
            float damage = 8.0F + victim.getMaxHealth() * 0.1F;
            if (victim.hurt(ModDamageTypes.source(level, ModDamageTypes.INFINITY, player), damage)) {
                Vec3 push = to.normalize().scale(1.8);
                victim.setDeltaMovement(victim.getDeltaMovement().add(push.x, 0.5, push.z));
                victim.hurtMarked = true;
            }
        }
        level.playSound(null, player.blockPosition(), SoundEvents.GENERIC_EXPLODE, SoundSource.PLAYERS, 1.5F, 1.2F);
    }

    /** Folds space to wherever the player is looking. */
    public static boolean teleport(ServerPlayer player, double range) {
        ServerLevel level = player.serverLevel();
        Vec3 eye = player.getEyePosition();
        Vec3 end = eye.add(player.getLookAngle().scale(range));
        BlockHitResult hit = level.clip(new ClipContext(eye, end, ClipContext.Block.COLLIDER, ClipContext.Fluid.NONE, player));
        Vec3 destination = hit.getType() == HitResult.Type.MISS ? end : hit.getLocation().subtract(player.getLookAngle().scale(0.8));
        for (int dy = 0; dy < 4; dy++) {
            Vec3 candidate = destination.add(0, dy, 0);
            AABB box = player.getBoundingBox().move(candidate.subtract(player.position()));
            if (level.noCollision(player, box)) {
                DustParticleOptions blue = new DustParticleOptions(new Vector3f(0.2F, 0.45F, 1.0F), 1.6F);
                level.sendParticles(blue, player.getX(), player.getY() + 1, player.getZ(), 40, 0.4, 0.8, 0.4, 0.0);
                player.teleportTo(candidate.x, candidate.y, candidate.z);
                player.fallDistance = 0;
                level.sendParticles(blue, candidate.x, candidate.y + 1, candidate.z, 40, 0.4, 0.8, 0.4, 0.0);
                level.playSound(null, player.blockPosition(), SoundEvents.ENDERMAN_TELEPORT, SoundSource.PLAYERS, 1.0F, 1.2F);
                return true;
            }
        }
        return false;
    }

    @Nullable
    private static LivingEntity lookTarget(ServerPlayer player, double range) {
        Vec3 eye = player.getEyePosition();
        Vec3 end = eye.add(player.getLookAngle().scale(range));
        AABB box = player.getBoundingBox().expandTowards(player.getLookAngle().scale(range)).inflate(1.0);
        EntityHitResult hit = ProjectileUtil.getEntityHitResult(player, eye, end, box,
                e -> e instanceof LivingEntity && e.isAlive() && e != player && !e.isSpectator(), range * range);
        return hit != null && hit.getEntity() instanceof LivingEntity living ? living : null;
    }

    private static void line(ServerLevel level, Vec3 from, Vec3 to, DustParticleOptions particle) {
        Vec3 step = to.subtract(from);
        for (int i = 0; i <= 20; i++) {
            Vec3 p = from.add(step.scale(i / 20.0));
            level.sendParticles(particle, p.x, p.y, p.z, 1, 0.02, 0.02, 0.02, 0.0);
        }
    }

    // =================================================================================================================
    // Time Stone history
    // =================================================================================================================

    /** Called every 10 ticks for players carrying a gauntlet with the Time Stone. */
    public static void recordHistory(ServerPlayer player) {
        ArrayDeque<Snapshot> history = HISTORY.computeIfAbsent(player.getUUID(), id -> new ArrayDeque<>());
        history.addLast(new Snapshot(player.level().dimension(), player.position(), player.getYRot(), player.getXRot(),
                player.getHealth(), player.getFoodData().getFoodLevel(), player.level().getGameTime()));
        while (history.size() > 14) {
            history.removeFirst();
        }
    }

    private static boolean rewind(ServerPlayer player) {
        ArrayDeque<Snapshot> history = HISTORY.get(player.getUUID());
        if (history == null || history.isEmpty()) {
            return false;
        }
        long now = player.level().getGameTime();
        Snapshot target = null;
        for (Snapshot snapshot : history) {
            if (snapshot.dimension() == player.level().dimension() && now - snapshot.time() >= 90) {
                target = snapshot; // keep the newest one that is at least ~5 seconds old
            }
        }
        if (target == null) {
            target = history.peekFirst();
            if (target.dimension() != player.level().dimension()) {
                return false;
            }
        }
        ServerLevel level = player.serverLevel();
        DustParticleOptions green = new DustParticleOptions(new Vector3f(0.1F, 0.85F, 0.3F), 1.5F);
        level.sendParticles(green, player.getX(), player.getY() + 1, player.getZ(), 50, 0.5, 1.0, 0.5, 0.0);
        player.teleportTo(target.pos().x, target.pos().y, target.pos().z);
        player.setYRot(target.yRot());
        player.setXRot(target.xRot());
        player.setHealth(Math.max(player.getHealth(), target.health()));
        player.getFoodData().setFoodLevel(Math.max(player.getFoodData().getFoodLevel(), target.food()));
        player.fallDistance = 0;
        player.clearFire();
        List<MobEffectInstance> harmful = new ArrayList<>();
        for (MobEffectInstance effect : player.getActiveEffects()) {
            if (effect.getEffect().getCategory() == MobEffectCategory.HARMFUL) {
                harmful.add(effect);
            }
        }
        harmful.forEach(effect -> player.removeEffect(effect.getEffect()));
        level.sendParticles(green, player.getX(), player.getY() + 1, player.getZ(), 50, 0.5, 1.0, 0.5, 0.0);
        level.playSound(null, player.blockPosition(), SoundEvents.BEACON_DEACTIVATE, SoundSource.PLAYERS, 1.5F, 1.5F);
        history.clear();
        return true;
    }

    public static void forget(ServerPlayer player) {
        HISTORY.remove(player.getUUID());
    }

    // =================================================================================================================
    // Mind Stone thralls
    // =================================================================================================================

    public static boolean isThrallOf(Entity mob, Entity possibleController) {
        Thrall thrall = THRALLS.get(mob.getUUID());
        return thrall != null && thrall.controller().equals(possibleController.getUUID());
    }

    @Nullable
    public static UUID controllerOf(Entity mob) {
        Thrall thrall = THRALLS.get(mob.getUUID());
        return thrall == null ? null : thrall.controller();
    }

    /** Every second: thralls attack the nearest monster around their master. */
    public static void tickThralls(MinecraftServer server) {
        if (THRALLS.isEmpty()) {
            return;
        }
        long now = server.overworld().getGameTime();
        Iterator<Map.Entry<UUID, Thrall>> it = THRALLS.entrySet().iterator();
        while (it.hasNext()) {
            Map.Entry<UUID, Thrall> entry = it.next();
            if (entry.getValue().expires() < now) {
                it.remove();
                continue;
            }
            Entity entity = null;
            for (ServerLevel level : server.getAllLevels()) {
                entity = level.getEntity(entry.getKey());
                if (entity != null) {
                    break;
                }
            }
            if (!(entity instanceof Mob mob) || !mob.isAlive()) {
                it.remove();
                continue;
            }
            UUID controller = entry.getValue().controller();
            LivingEntity current = mob.getTarget();
            if (current == null || !current.isAlive() || current.getUUID().equals(controller) || current instanceof Player) {
                Mob prey = null;
                double best = Double.MAX_VALUE;
                for (Mob candidate : mob.level().getEntitiesOfClass(Mob.class, mob.getBoundingBox().inflate(16),
                        m -> m != mob && m instanceof Enemy && m.isAlive() && !THRALLS.containsKey(m.getUUID()))) {
                    double d = candidate.distanceToSqr(mob);
                    if (d < best) {
                        best = d;
                        prey = candidate;
                    }
                }
                mob.setTarget(prey);
            }
        }
    }

    // =================================================================================================================
    // The Snap
    // =================================================================================================================

    public static void onGauntletChanged(ServerPlayer player, ItemStack gauntlet) {
        if (InfinityGauntletItem.stoneCount(gauntlet) == 6) {
            Rewards.award(player, HeroesEndgame.id("perfectly_balanced"));
        }
    }

    public static void snap(ServerPlayer player, ItemStack gauntlet) {
        if (InfinityGauntletItem.stoneCount(gauntlet) < 6 || InfinityGauntletItem.isBurnt(gauntlet, player.level())) {
            return;
        }
        ServerLevel level = player.serverLevel();
        MinecraftServer server = player.server;
        InfinityCampaign campaign = InfinityCampaign.get(server);

        level.playSound(null, player.blockPosition(), SoundEvents.LIGHTNING_BOLT_THUNDER, SoundSource.PLAYERS, 3.0F, 0.6F);
        for (InfinityStone stone : InfinityStone.values()) {
            int c = stone.color();
            level.sendParticles(new DustParticleOptions(new Vector3f(((c >> 16) & 255) / 255F, ((c >> 8) & 255) / 255F, (c & 255) / 255F), 2.0F),
                    player.getX(), player.getY() + 1.5, player.getZ(), 40, 1.5, 1.5, 1.5, 0.1);
        }

        if (campaign.isSnapActive()) {
            // "Bring them back."
            campaign.unsnap(player);
            Messages.announceAll(server, Component.translatable("message.heroes_endgame.snap.reversed_by", player.getDisplayName()).withStyle(ChatFormatting.GOLD));
        } else {
            int dusted = 0;
            for (Mob mob : level.getEntitiesOfClass(Mob.class, player.getBoundingBox().inflate(128),
                    m -> m instanceof Enemy && !(m instanceof EndgameBoss) && m.isAlive())) {
                dust(level, mob);
                dusted++;
            }
            for (EndgameBoss boss : level.getEntitiesOfClass(EndgameBoss.class, player.getBoundingBox().inflate(128), EndgameBoss::isAlive)) {
                boss.hurt(ModDamageTypes.source(level, ModDamageTypes.INFINITY, player), boss.getMaxHealth());
            }
            Messages.title(player, Component.translatable("message.heroes_endgame.snap.title").withStyle(ChatFormatting.LIGHT_PURPLE),
                    Component.translatable("message.heroes_endgame.snap.player_subtitle", dusted).withStyle(ChatFormatting.GRAY));
        }
        Rewards.award(player, HeroesEndgame.id("snap"));

        // The price. Tony Stark didn't survive it; a Hulk barely did.
        float max = player.getMaxHealth();
        if (max < 40.0F) {
            player.sendSystemMessage(Component.translatable("message.heroes_endgame.snap.too_weak").withStyle(ChatFormatting.DARK_RED));
            player.hurt(ModDamageTypes.source(level, ModDamageTypes.SNAP), max * 10.0F);
        } else {
            player.hurt(ModDamageTypes.source(level, ModDamageTypes.SNAP), max * 0.8F);
            player.addEffect(new MobEffectInstance(MobEffects.WITHER, 600, 1));
            player.addEffect(new MobEffectInstance(MobEffects.WEAKNESS, 2400, 1));
        }
        InfinityGauntletItem.burnOut(gauntlet, level, 3 * 24000L);
    }

    /** Turns a creature to dust (no drops). */
    public static void dust(ServerLevel level, LivingEntity entity) {
        level.sendParticles(ParticleTypes.ASH, entity.getX(), entity.getY() + entity.getBbHeight() / 2, entity.getZ(), 40,
                entity.getBbWidth() * 0.5, entity.getBbHeight() * 0.4, entity.getBbWidth() * 0.5, 0.02);
        level.sendParticles(ParticleTypes.WHITE_ASH, entity.getX(), entity.getY() + entity.getBbHeight() / 2, entity.getZ(), 20,
                entity.getBbWidth() * 0.5, entity.getBbHeight() * 0.4, entity.getBbWidth() * 0.5, 0.02);
        entity.discard();
    }

    /** True if the player carries a gauntlet with the Time Stone anywhere in their inventory. */
    public static boolean carriesTimeStone(Player player) {
        for (ItemStack stack : player.getInventory().items) {
            if (stack.is(ModItems.INFINITY_GAUNTLET.get()) && InfinityGauntletItem.hasStone(stack, InfinityStone.TIME)) {
                return true;
            }
        }
        ItemStack off = player.getOffhandItem();
        return off.is(ModItems.INFINITY_GAUNTLET.get()) && InfinityGauntletItem.hasStone(off, InfinityStone.TIME);
    }

    private StonePowers() {
    }
}
