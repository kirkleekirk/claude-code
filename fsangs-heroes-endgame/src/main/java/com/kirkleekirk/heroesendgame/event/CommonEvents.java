package com.kirkleekirk.heroesendgame.event;

import com.kirkleekirk.heroesendgame.HeroesEndgame;
import com.kirkleekirk.heroesendgame.command.EndgameCommand;
import com.kirkleekirk.heroesendgame.compat.FsangCompat;
import com.kirkleekirk.heroesendgame.compat.PortalGunCompat;
import com.kirkleekirk.heroesendgame.config.EndgameConfig;
import com.kirkleekirk.heroesendgame.entity.EndgameBoss;
import com.kirkleekirk.heroesendgame.entity.doom.DoombotEntity;
import com.kirkleekirk.heroesendgame.infinity.DormammuBargain;
import com.kirkleekirk.heroesendgame.infinity.InfinityCampaign;
import com.kirkleekirk.heroesendgame.infinity.InfinityStone;
import com.kirkleekirk.heroesendgame.infinity.StonePowers;
import com.kirkleekirk.heroesendgame.infinity.VormirHandler;
import com.kirkleekirk.heroesendgame.item.InfinityGauntletItem;
import com.kirkleekirk.heroesendgame.item.InfinityStoneItem;
import com.kirkleekirk.heroesendgame.nemesis.EndgameSavedData;
import com.kirkleekirk.heroesendgame.nemesis.NemesisDirector;
import com.kirkleekirk.heroesendgame.nemesis.PlayerNemesisData;
import com.kirkleekirk.heroesendgame.power.PowerFamily;
import com.kirkleekirk.heroesendgame.power.PowerProfile;
import com.kirkleekirk.heroesendgame.registry.ModItems;
import com.kirkleekirk.heroesendgame.util.DamageCategory;
import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.Vec3;
import net.minecraftforge.event.RegisterCommandsEvent;
import net.minecraftforge.event.TickEvent;
import net.minecraftforge.event.entity.living.LivingChangeTargetEvent;
import net.minecraftforge.event.entity.living.LivingDeathEvent;
import net.minecraftforge.event.entity.living.LivingHurtEvent;
import net.minecraftforge.event.entity.player.PlayerEvent;
import net.minecraftforge.event.entity.player.PlayerInteractEvent;
import net.minecraftforge.eventbus.api.EventPriority;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

@Mod.EventBusSubscriber(modid = HeroesEndgame.MOD_ID)
public final class CommonEvents {
    private record LastPosition(ResourceKey<Level> dimension, Vec3 pos) {
    }

    private static final Map<UUID, LastPosition> LAST_POSITIONS = new HashMap<>();

    @SubscribeEvent
    public static void onServerTick(TickEvent.ServerTickEvent event) {
        if (event.phase != TickEvent.Phase.END) {
            return;
        }
        NemesisDirector.tick(event.getServer());
        if (event.getServer().getTickCount() % 20 == 0) {
            StonePowers.tickThralls(event.getServer());
        }
    }

    @SubscribeEvent
    public static void onPlayerTick(TickEvent.PlayerTickEvent event) {
        if (event.phase != TickEvent.Phase.END || !(event.player instanceof ServerPlayer player) || !EndgameConfig.isLoaded()) {
            return;
        }
        long time = player.level().getGameTime();
        if (time % 10 == 0) {
            trackSpeedForce(player);
        }
        if (time % 10 == 5 && StonePowers.carriesTimeStone(player)) {
            StonePowers.recordHistory(player);
        }
        if (time % 40 == 0) {
            VormirHandler.check(player);
            PlayerNemesisData data = EndgameSavedData.get(player.server).player(player.getUUID());
            if (data.flags.getLong("SpeedStolenUntil") > player.server.overworld().getGameTime()) {
                FsangCompat.dampen(player, FsangCompat.Dampening.SPEED, 60);
            }
        }
        if (time % 20 == 0 && EndgameConfig.TESSERACT_REFUELS_PORTAL_GUNS.get() && holdsTesseractOffhand(player)) {
            PortalGunCompat.refuel(player.getMainHandItem(), 1);
        }
    }

    /** Zoom's trigger: distance covered at super speed by speed force users. */
    private static void trackSpeedForce(ServerPlayer player) {
        LastPosition last = LAST_POSITIONS.put(player.getUUID(), new LastPosition(player.level().dimension(), player.position()));
        if (last == null || last.dimension() != player.level().dimension() || player.isPassenger() || player.isFallFlying()) {
            return;
        }
        double dx = player.getX() - last.pos().x;
        double dz = player.getZ() - last.pos().z;
        double distance = Math.sqrt(dx * dx + dz * dz);
        // 0.75 blocks per tick = 15 m/s, more than twice sprint speed. Big jumps are teleports, not running.
        if (distance < 7.5 || distance > 120) {
            return;
        }
        PowerProfile profile = NemesisDirector.cachedProfile(player);
        if (profile != null && profile.is(PowerFamily.SPEEDSTER)) {
            EndgameSavedData.get(player.server).player(player.getUUID()).speedForceDistance += distance;
        }
    }

    private static boolean holdsTesseractOffhand(Player player) {
        ItemStack offhand = player.getOffhandItem();
        if (offhand.getItem() instanceof InfinityStoneItem stone && stone.stone() == InfinityStone.SPACE) {
            return true;
        }
        return offhand.is(ModItems.INFINITY_GAUNTLET.get()) && InfinityGauntletItem.hasStone(offhand, InfinityStone.SPACE);
    }

    @SubscribeEvent(priority = EventPriority.HIGH)
    public static void onLivingDeath(LivingDeathEvent event) {
        LivingEntity entity = event.getEntity();
        if (entity.level().isClientSide || !EndgameConfig.isLoaded()) {
            return;
        }
        if (entity instanceof ServerPlayer player) {
            // The Time Stone loop: Dormammu can't let the sorcerer die.
            if (DormammuBargain.onPlayerDeath(player)) {
                event.setCanceled(true);
                return;
            }
            VormirHandler.onDeath(player);
            NemesisDirector.onPlayerDeath(player);
            return;
        }
        VormirHandler.onDeath(entity);
    }

    @SubscribeEvent
    public static void onLivingHurt(LivingHurtEvent event) {
        // Doom studies the way you fight his Doombots.
        if (event.getEntity() instanceof DoombotEntity && event.getSource().getEntity() instanceof ServerPlayer player) {
            DamageCategory category = DamageCategory.of(event.getSource());
            EndgameSavedData.get(player.server).player(player.getUUID()).doomStudy.merge(category.key(), event.getAmount(), Float::sum);
        }
    }

    @SubscribeEvent
    public static void onChangeTarget(LivingChangeTargetEvent event) {
        LivingEntity newTarget = event.getNewTarget();
        if (newTarget != null && StonePowers.isThrallOf(event.getEntity(), newTarget)) {
            event.setCanceled(true);
        }
    }

    // --- Rick's Portal Gun: no escaping a nemesis through a portal -------------------------------------------------

    @SubscribeEvent
    public static void onRightClickItem(PlayerInteractEvent.RightClickItem event) {
        if (jammed(event.getEntity(), event.getItemStack())) {
            event.setCanceled(true);
        }
    }

    @SubscribeEvent
    public static void onRightClickBlock(PlayerInteractEvent.RightClickBlock event) {
        if (jammed(event.getEntity(), event.getItemStack())) {
            event.setCanceled(true);
        }
    }

    private static boolean jammed(Player player, ItemStack stack) {
        if (!PortalGunCompat.isPortalGun(stack) || !EndgameConfig.isLoaded() || !EndgameConfig.JAM_PORTAL_GUNS.get()) {
            return false;
        }
        boolean nemesisNearby = !player.level().getEntitiesOfClass(EndgameBoss.class, player.getBoundingBox().inflate(48),
                boss -> boss.isAlive() && !boss.isMinion()).isEmpty();
        if (nemesisNearby && !player.level().isClientSide) {
            player.displayClientMessage(Component.translatable("message.heroes_endgame.portal_gun_jammed").withStyle(ChatFormatting.RED), true);
        }
        return nemesisNearby;
    }

    // --- Player lifecycle ----------------------------------------------------------------------------------------

    @SubscribeEvent
    public static void onLogin(PlayerEvent.PlayerLoggedInEvent event) {
        if (event.getEntity() instanceof ServerPlayer player && EndgameConfig.isLoaded()) {
            NemesisDirector.onPlayerLogin(player);
        }
    }

    @SubscribeEvent
    public static void onLogout(PlayerEvent.PlayerLoggedOutEvent event) {
        if (event.getEntity() instanceof ServerPlayer player && EndgameConfig.isLoaded()) {
            NemesisDirector.onPlayerLogout(player);
            StonePowers.forget(player);
            LAST_POSITIONS.remove(player.getUUID());
        }
    }

    @SubscribeEvent
    public static void onRespawn(PlayerEvent.PlayerRespawnEvent event) {
        if (event.getEntity() instanceof ServerPlayer player && EndgameConfig.isLoaded()) {
            InfinityCampaign.get(player.server).onPlayerLogin(player);
        }
    }

    @SubscribeEvent
    public static void onChangedDimension(PlayerEvent.PlayerChangedDimensionEvent event) {
        if (event.getEntity() instanceof ServerPlayer player && EndgameConfig.isLoaded()) {
            NemesisDirector.onPlayerChangedDimension(player);
            LAST_POSITIONS.remove(player.getUUID());
        }
    }

    @SubscribeEvent
    public static void onRegisterCommands(RegisterCommandsEvent event) {
        EndgameCommand.register(event.getDispatcher());
    }

    private CommonEvents() {
    }
}
