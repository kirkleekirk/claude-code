package com.kirkleekirk.heroesendgame.client.renderer;

import com.kirkleekirk.heroesendgame.HeroesEndgame;
import com.kirkleekirk.heroesendgame.entity.projectile.EnergyBoltEntity;
import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import com.mojang.math.Axis;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.RenderType;
import net.minecraft.client.renderer.entity.EntityRenderer;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.core.BlockPos;
import net.minecraft.resources.ResourceLocation;
import org.joml.Matrix3f;
import org.joml.Matrix4f;

/**
 * A glowing, colour-tinted orb that always faces the camera.
 */
public class EnergyBoltRenderer extends EntityRenderer<EnergyBoltEntity> {
    private static final ResourceLocation TEXTURE = HeroesEndgame.id("textures/entity/energy_bolt.png");
    private static final RenderType RENDER_TYPE = RenderType.entityTranslucentEmissive(TEXTURE);

    public EnergyBoltRenderer(EntityRendererProvider.Context context) {
        super(context);
    }

    @Override
    protected int getBlockLightLevel(EnergyBoltEntity entity, BlockPos pos) {
        return 15;
    }

    @Override
    public void render(EnergyBoltEntity entity, float yaw, float partialTicks, PoseStack poseStack, MultiBufferSource buffer, int light) {
        poseStack.pushPose();
        float pulse = 0.75F + 0.1F * (float) Math.sin((entity.tickCount + partialTicks) * 0.8F);
        poseStack.translate(0.0F, 0.2F, 0.0F);
        poseStack.scale(pulse, pulse, pulse);
        poseStack.mulPose(this.entityRenderDispatcher.cameraOrientation());
        poseStack.mulPose(Axis.YP.rotationDegrees(180.0F));
        PoseStack.Pose pose = poseStack.last();
        Matrix4f matrix = pose.pose();
        Matrix3f normal = pose.normal();
        VertexConsumer consumer = buffer.getBuffer(RENDER_TYPE);
        int color = entity.getVariant().color();
        int r = (color >> 16) & 255;
        int g = (color >> 8) & 255;
        int b = color & 255;
        vertex(consumer, matrix, normal, 0.0F, 0, 0, 1, r, g, b);
        vertex(consumer, matrix, normal, 1.0F, 0, 1, 1, r, g, b);
        vertex(consumer, matrix, normal, 1.0F, 1, 1, 0, r, g, b);
        vertex(consumer, matrix, normal, 0.0F, 1, 0, 0, r, g, b);
        poseStack.popPose();
        super.render(entity, yaw, partialTicks, poseStack, buffer, light);
    }

    private static void vertex(VertexConsumer consumer, Matrix4f matrix, Matrix3f normal, float x, int y, int u, int v, int r, int g, int b) {
        consumer.vertex(matrix, x - 0.5F, (float) y - 0.5F, 0.0F)
                .color(r, g, b, 230)
                .uv((float) u, (float) v)
                .overlayCoords(OverlayTexture.NO_OVERLAY)
                .uv2(0xF000F0)
                .normal(normal, 0.0F, 1.0F, 0.0F)
                .endVertex();
    }

    @Override
    public ResourceLocation getTextureLocation(EnergyBoltEntity entity) {
        return TEXTURE;
    }
}
