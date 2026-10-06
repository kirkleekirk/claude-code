package com.kirkleekirk.heroesendgame.client;

import com.kirkleekirk.heroesendgame.HeroesEndgame;
import com.kirkleekirk.heroesendgame.client.model.DormammuModel;
import com.kirkleekirk.heroesendgame.client.renderer.DormammuRenderer;
import com.kirkleekirk.heroesendgame.client.renderer.EndgameHumanoidRenderer;
import com.kirkleekirk.heroesendgame.client.renderer.EnergyBoltRenderer;
import com.kirkleekirk.heroesendgame.item.InfinityGauntletItem;
import com.kirkleekirk.heroesendgame.registry.ModEntities;
import com.kirkleekirk.heroesendgame.registry.ModItems;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.item.ItemProperties;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.Mob;
import net.minecraftforge.api.distmarker.Dist;
import net.minecraftforge.client.event.EntityRenderersEvent;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod;
import net.minecraftforge.fml.event.lifecycle.FMLClientSetupEvent;
import org.jetbrains.annotations.Nullable;

@Mod.EventBusSubscriber(modid = HeroesEndgame.MOD_ID, bus = Mod.EventBusSubscriber.Bus.MOD, value = Dist.CLIENT)
public final class ClientSetup {
    private static ResourceLocation tex(String name) {
        return HeroesEndgame.id("textures/entity/" + name + ".png");
    }

    private static <T extends Mob> void humanoid(EntityRenderersEvent.RegisterRenderers event, EntityType<T> type, boolean slim,
                                                 @Nullable String glow, String... textures) {
        ResourceLocation[] locations = new ResourceLocation[textures.length];
        for (int i = 0; i < textures.length; i++) {
            locations[i] = tex(textures[i]);
        }
        ResourceLocation glowTexture = glow == null ? null : tex(glow);
        EntityRendererProvider<T> provider = context -> new EndgameHumanoidRenderer<>(context, slim, glowTexture, locations);
        event.registerEntityRenderer(type, provider);
    }

    @SubscribeEvent
    public static void registerRenderers(EntityRenderersEvent.RegisterRenderers event) {
        humanoid(event, ModEntities.VILTRUMITE_ENFORCER.get(), false, null, "viltrumite_soldier", "viltrumite_scout");
        humanoid(event, ModEntities.CONQUEST.get(), false, null, "conquest");
        humanoid(event, ModEntities.THRAGG.get(), false, null, "thragg");
        humanoid(event, ModEntities.LOKI.get(), false, null, "loki");
        humanoid(event, ModEntities.ILLUSION.get(), false, null, "loki", "zoom");
        humanoid(event, ModEntities.CHITAURI.get(), false, "chitauri_glow", "chitauri");
        humanoid(event, ModEntities.EBONY_MAW.get(), true, null, "ebony_maw");
        humanoid(event, ModEntities.CULL_OBSIDIAN.get(), false, "cull_obsidian_glow", "cull_obsidian");
        humanoid(event, ModEntities.PROXIMA_MIDNIGHT.get(), true, "proxima_midnight_glow", "proxima_midnight");
        humanoid(event, ModEntities.CORVUS_GLAIVE.get(), false, null, "corvus_glaive");
        humanoid(event, ModEntities.THANOS.get(), false, null, "thanos");
        humanoid(event, ModEntities.STONEKEEPER.get(), false, "stonekeeper_glow", "stonekeeper");
        humanoid(event, ModEntities.MINDLESS_ONE.get(), false, "mindless_one_glow", "mindless_one");
        humanoid(event, ModEntities.DOOMBOT.get(), false, "doombot_glow", "doombot");
        humanoid(event, ModEntities.DOCTOR_DOOM.get(), false, "doctor_doom_glow", "doctor_doom");
        humanoid(event, ModEntities.DOOMSDAY.get(), false, "doomsday_glow", "doomsday");
        humanoid(event, ModEntities.ZOOM.get(), false, "zoom_glow", "zoom");
        humanoid(event, ModEntities.SENTINEL.get(), false, "sentinel_glow", "sentinel");
        humanoid(event, ModEntities.MASTER_MOLD.get(), false, "master_mold_glow", "master_mold");
        humanoid(event, ModEntities.GHOST_RIDER.get(), false, "ghost_rider_glow", "ghost_rider");
        event.registerEntityRenderer(ModEntities.DORMAMMU.get(), DormammuRenderer::new);
        event.registerEntityRenderer(ModEntities.ENERGY_BOLT.get(), EnergyBoltRenderer::new);
    }

    @SubscribeEvent
    public static void registerLayers(EntityRenderersEvent.RegisterLayerDefinitions event) {
        event.registerLayerDefinition(DormammuModel.LAYER, DormammuModel::createBodyLayer);
    }

    @SubscribeEvent
    public static void clientSetup(FMLClientSetupEvent event) {
        event.enqueueWork(() -> ItemProperties.register(ModItems.INFINITY_GAUNTLET.get(), HeroesEndgame.id("stones"),
                (stack, level, entity, seed) -> InfinityGauntletItem.stoneCount(stack) / 6.0F));
    }

    private ClientSetup() {
    }
}
