package com.kirkleekirk.heroesendgame.client.renderer;

import com.kirkleekirk.heroesendgame.HeroesEndgame;
import com.kirkleekirk.heroesendgame.client.model.DormammuModel;
import com.kirkleekirk.heroesendgame.entity.infinity.DormammuEntity;
import com.mojang.blaze3d.vertex.PoseStack;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.MobRenderer;
import net.minecraft.core.BlockPos;
import net.minecraft.resources.ResourceLocation;

/**
 * Dormammu's burning head, four blocks tall and glowing in the dark.
 */
public class DormammuRenderer extends MobRenderer<DormammuEntity, DormammuModel> {
    private static final ResourceLocation TEXTURE = HeroesEndgame.id("textures/entity/dormammu.png");

    public DormammuRenderer(EntityRendererProvider.Context context) {
        super(context, new DormammuModel(context.bakeLayer(DormammuModel.LAYER)), 2.0F);
    }

    @Override
    public ResourceLocation getTextureLocation(DormammuEntity entity) {
        return TEXTURE;
    }

    @Override
    protected void scale(DormammuEntity entity, PoseStack poseStack, float partialTick) {
        poseStack.scale(4.0F, 4.0F, 4.0F);
    }

    @Override
    protected int getBlockLightLevel(DormammuEntity entity, BlockPos pos) {
        return 15;
    }
}
