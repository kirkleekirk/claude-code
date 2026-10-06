package com.kirkleekirk.heroesendgame.client.renderer;

import com.kirkleekirk.heroesendgame.client.model.BossModel;
import com.kirkleekirk.heroesendgame.entity.EndgameBoss;
import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.math.Axis;
import net.minecraft.client.model.HumanoidArmorModel;
import net.minecraft.client.model.geom.ModelLayers;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.RenderType;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.HumanoidMobRenderer;
import net.minecraft.client.renderer.entity.RenderLayerParent;
import net.minecraft.client.renderer.entity.layers.EyesLayer;
import net.minecraft.client.renderer.entity.layers.HumanoidArmorLayer;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.entity.Mob;
import org.jetbrains.annotations.Nullable;

/**
 * Renders every human-shaped nemesis with a player model and its own 64x64 skin. FSang18's Heroes suits worn by
 * the boss render on top through Palladium's armor layer.
 */
public class EndgameHumanoidRenderer<T extends Mob> extends HumanoidMobRenderer<T, BossModel<T>> {
    private final ResourceLocation[] textures;

    public EndgameHumanoidRenderer(EntityRendererProvider.Context context, boolean slim, @Nullable ResourceLocation glow, ResourceLocation... textures) {
        super(context, new BossModel<>(context.bakeLayer(slim ? ModelLayers.PLAYER_SLIM : ModelLayers.PLAYER), slim), 0.6F);
        this.textures = textures;
        this.addLayer(new HumanoidArmorLayer<>(this,
                new HumanoidArmorModel<>(context.bakeLayer(slim ? ModelLayers.PLAYER_SLIM_INNER_ARMOR : ModelLayers.PLAYER_INNER_ARMOR)),
                new HumanoidArmorModel<>(context.bakeLayer(slim ? ModelLayers.PLAYER_SLIM_OUTER_ARMOR : ModelLayers.PLAYER_OUTER_ARMOR)),
                context.getModelManager()));
        if (glow != null) {
            this.addLayer(new GlowLayer<>(this, RenderType.eyes(glow)));
        }
    }

    @Override
    public ResourceLocation getTextureLocation(T entity) {
        int variant = entity instanceof EndgameBoss boss ? boss.getVariant() : 0;
        return textures[Math.max(0, Math.min(variant, textures.length - 1))];
    }

    @Override
    protected void scale(T entity, PoseStack poseStack, float partialTick) {
        float scale = entity instanceof EndgameBoss boss ? boss.renderScale() : 1.0F;
        poseStack.scale(scale * 0.9375F, scale * 0.9375F, scale * 0.9375F);
    }

    @Override
    protected void setupRotations(T entity, PoseStack poseStack, float ageInTicks, float rotationYaw, float partialTicks) {
        super.setupRotations(entity, poseStack, ageInTicks, rotationYaw, partialTicks);
        if (entity instanceof EndgameBoss boss && boss.isFlying() && boss.getCastPose() == EndgameBoss.POSE_FLY) {
            // Superman pose: body horizontal along the direction of flight.
            float pitch = entity.getViewXRot(partialTicks);
            poseStack.translate(0.0F, 1.0F, 0.0F);
            poseStack.mulPose(Axis.XP.rotationDegrees(-90.0F - pitch * 0.5F));
            poseStack.translate(0.0F, -1.0F, 0.0F);
        }
    }

    @Override
    public void render(T entity, float yaw, float partialTicks, PoseStack poseStack, MultiBufferSource buffer, int light) {
        super.render(entity, yaw, partialTicks, poseStack, buffer, light);
    }

    /** Full-bright overlay (eyes, energy, flames). */
    static class GlowLayer<T extends Mob> extends EyesLayer<T, BossModel<T>> {
        private final RenderType type;

        GlowLayer(RenderLayerParent<T, BossModel<T>> parent, RenderType type) {
            super(parent);
            this.type = type;
        }

        @Override
        public RenderType renderType() {
            return type;
        }
    }
}
