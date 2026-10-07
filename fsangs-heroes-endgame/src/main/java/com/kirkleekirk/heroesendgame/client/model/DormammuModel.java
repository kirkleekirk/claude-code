package com.kirkleekirk.heroesendgame.client.model;

import com.kirkleekirk.heroesendgame.HeroesEndgame;
import com.kirkleekirk.heroesendgame.entity.infinity.DormammuEntity;
import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import net.minecraft.client.model.EntityModel;
import net.minecraft.client.model.geom.ModelLayerLocation;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.model.geom.PartPose;
import net.minecraft.client.model.geom.builders.CubeListBuilder;
import net.minecraft.client.model.geom.builders.LayerDefinition;
import net.minecraft.client.model.geom.builders.MeshDefinition;
import net.minecraft.client.model.geom.builders.PartDefinition;
import net.minecraft.util.Mth;

/**
 * Dormammu as he appears to Doctor Strange: a colossal burning face filling the sky of the Dark Dimension.
 * A head cube with a flaming crown; scaled up by the renderer.
 */
public class DormammuModel extends EntityModel<DormammuEntity> {
    public static final ModelLayerLocation LAYER = new ModelLayerLocation(HeroesEndgame.id("dormammu"), "main");
    private final ModelPart head;
    private final ModelPart crown;

    public DormammuModel(ModelPart root) {
        this.head = root.getChild("head");
        this.crown = head.getChild("crown");
    }

    public static LayerDefinition createBodyLayer() {
        MeshDefinition mesh = new MeshDefinition();
        PartDefinition root = mesh.getRoot();
        PartDefinition head = root.addOrReplaceChild("head",
                CubeListBuilder.create().texOffs(0, 0).addBox(-8.0F, -16.0F, -8.0F, 16.0F, 16.0F, 16.0F),
                PartPose.offset(0.0F, 24.0F, 0.0F));
        head.addOrReplaceChild("crown",
                CubeListBuilder.create().texOffs(0, 32).addBox(-9.0F, -8.0F, -9.0F, 18.0F, 8.0F, 18.0F),
                PartPose.offset(0.0F, -14.0F, 0.0F));
        return LayerDefinition.create(mesh, 128, 64);
    }

    @Override
    public void setupAnim(DormammuEntity entity, float limbSwing, float limbSwingAmount, float ageInTicks, float netHeadYaw, float headPitch) {
        head.yRot = netHeadYaw * Mth.DEG_TO_RAD;
        head.xRot = headPitch * Mth.DEG_TO_RAD * 0.5F;
        crown.yRot = ageInTicks * 0.02F;
        crown.y = -14.0F + Mth.sin(ageInTicks * 0.15F) * 0.6F;
    }

    @Override
    public void renderToBuffer(PoseStack poseStack, VertexConsumer buffer, int light, int overlay, float red, float green, float blue, float alpha) {
        head.render(poseStack, buffer, light, overlay, red, green, blue, alpha);
    }
}
