package com.kirkleekirk.heroesendgame.client.model;

import com.kirkleekirk.heroesendgame.entity.EndgameBoss;
import net.minecraft.client.model.PlayerModel;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.LivingEntity;

/**
 * Player-shaped model whose arms follow the boss' current special attack (spellcasting, beams, slams, grabs,
 * Superman-style flight, the snap...).
 */
public class BossModel<T extends LivingEntity> extends PlayerModel<T> {
    public BossModel(ModelPart root, boolean slim) {
        super(root, slim);
    }

    @Override
    public void setupAnim(T entity, float limbSwing, float limbSwingAmount, float ageInTicks, float netHeadYaw, float headPitch) {
        super.setupAnim(entity, limbSwing, limbSwingAmount, ageInTicks, netHeadYaw, headPitch);
        if (!(entity instanceof EndgameBoss boss)) {
            return;
        }
        float wobble = Mth.sin(ageInTicks * 0.3F) * 0.08F;
        switch (boss.getCastPose()) {
            case EndgameBoss.POSE_CAST -> {
                rightArm.xRot = -2.3F + wobble;
                leftArm.xRot = -2.3F - wobble;
                rightArm.zRot = 0.5F;
                leftArm.zRot = -0.5F;
            }
            case EndgameBoss.POSE_BEAM -> {
                rightArm.xRot = -Mth.HALF_PI + head.xRot;
                rightArm.yRot = head.yRot;
                leftArm.xRot = -Mth.HALF_PI + head.xRot;
                leftArm.yRot = head.yRot + 0.3F;
            }
            case EndgameBoss.POSE_CHARGE -> {
                rightArm.xRot = 0.9F;
                leftArm.xRot = 0.9F;
                body.xRot = 0.35F;
            }
            case EndgameBoss.POSE_SLAM -> {
                rightArm.xRot = -2.9F;
                leftArm.xRot = -2.9F;
                rightArm.zRot = -0.1F;
                leftArm.zRot = 0.1F;
            }
            case EndgameBoss.POSE_SNAP -> {
                rightArm.xRot = -2.6F;
                rightArm.zRot = -0.3F + wobble;
            }
            case EndgameBoss.POSE_GRAB -> {
                rightArm.xRot = -1.45F;
                leftArm.xRot = -1.45F;
                rightArm.yRot = -0.25F;
                leftArm.yRot = 0.25F;
            }
            case EndgameBoss.POSE_FLY -> {
                // One fist forward, the other at the side - the classic flying pose (body is tilted by the renderer).
                rightArm.xRot = -3.0F;
                rightArm.yRot = 0.0F;
                leftArm.xRot = 0.1F;
                rightLeg.xRot = 0.05F;
                leftLeg.xRot = -0.05F;
                head.xRot = -1.2F;
            }
            default -> {
                return;
            }
        }
        rightSleeve.copyFrom(rightArm);
        leftSleeve.copyFrom(leftArm);
        jacket.copyFrom(body);
        rightPants.copyFrom(rightLeg);
        leftPants.copyFrom(leftLeg);
        hat.copyFrom(head);
    }
}
