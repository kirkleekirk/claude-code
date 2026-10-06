package com.kirkleekirk.heroesendgame.item;

import com.kirkleekirk.heroesendgame.infinity.InfinityCampaign;
import com.kirkleekirk.heroesendgame.infinity.InfinityStone;
import com.kirkleekirk.heroesendgame.infinity.StonePowers;
import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResultHolder;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.TooltipFlag;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.levelgen.Heightmap;
import org.jetbrains.annotations.Nullable;

import java.util.List;

/**
 * One of the six Infinity Stones. Indestructible: immune to fire, lava, explosions and cactus, never despawns and
 * comes back up if it falls into the void. Holding one grants a small passive; put them in the Infinity Gauntlet
 * for the real thing.
 */
public class InfinityStoneItem extends Item {
    private final InfinityStone stone;

    public InfinityStoneItem(InfinityStone stone, Properties properties) {
        super(properties);
        this.stone = stone;
    }

    public InfinityStone stone() {
        return stone;
    }

    @Override
    public boolean isFoil(ItemStack stack) {
        return true;
    }

    @Override
    public Component getName(ItemStack stack) {
        return stone.displayName();
    }

    @Override
    public void appendHoverText(ItemStack stack, @Nullable Level level, List<Component> tooltip, TooltipFlag flag) {
        tooltip.add(Component.translatable("item.heroes_endgame." + stone.itemName() + ".lore").withStyle(ChatFormatting.GRAY, ChatFormatting.ITALIC));
        tooltip.add(Component.translatable("item.heroes_endgame." + stone.itemName() + ".passive").withStyle(stone.formatting()));
        if (stone == InfinityStone.SPACE) {
            tooltip.add(Component.translatable("item.heroes_endgame.space_stone.active").withStyle(ChatFormatting.BLUE));
        }
        tooltip.add(Component.translatable("item.heroes_endgame.infinity_stone.gauntlet_hint").withStyle(ChatFormatting.DARK_GRAY));
    }

    @Override
    public void inventoryTick(ItemStack stack, Level level, Entity entity, int slot, boolean selected) {
        if (level.isClientSide || !(entity instanceof ServerPlayer player)) {
            return;
        }
        // Creative players (admins, map makers) can carry stones around without waking the Mad Titan.
        if (!player.isCreative() && !stack.getOrCreateTag().getBoolean("Claimed")) {
            stack.getOrCreateTag().putBoolean("Claimed", true);
            InfinityCampaign.get(player.server).onStoneHeld(player, stone);
        }
        boolean held = selected || player.getOffhandItem() == stack;
        if (held && level.getGameTime() % 20 == 0) {
            StonePowers.passive(player, stone, false);
        }
    }

    @Override
    public InteractionResultHolder<ItemStack> use(Level level, Player player, InteractionHand hand) {
        ItemStack stack = player.getItemInHand(hand);
        if (stone != InfinityStone.SPACE) {
            return InteractionResultHolder.pass(stack);
        }
        if (!level.isClientSide && player instanceof ServerPlayer serverPlayer) {
            // The Tesseract alone can still fold space a short way.
            if (StonePowers.teleport(serverPlayer, 24)) {
                player.getCooldowns().addCooldown(this, 60);
            }
        }
        return InteractionResultHolder.sidedSuccess(stack, level.isClientSide);
    }

    @Override
    public boolean canBeHurtBy(DamageSource source) {
        return false;
    }

    @Override
    public int getEntityLifespan(ItemStack stack, Level level) {
        return Integer.MAX_VALUE;
    }

    @Override
    public boolean onEntityItemUpdate(ItemStack stack, ItemEntity entity) {
        rescueFromVoid(entity);
        return false;
    }

    /** Stones can't be destroyed: if one falls out of the world, it surfaces again. */
    static void rescueFromVoid(ItemEntity entity) {
        Level level = entity.level();
        if (!level.isClientSide && entity.getY() < level.getMinBuildHeight() + 1) {
            double x = entity.getX();
            double z = entity.getZ();
            int top = level.getHeight(Heightmap.Types.MOTION_BLOCKING, entity.getBlockX(), entity.getBlockZ());
            if (top <= level.getMinBuildHeight()) {
                // Nothing below (the End's void): bring it back to the centre of the world instead.
                x = 0.5;
                z = 0.5;
                top = Math.max(level.getHeight(Heightmap.Types.MOTION_BLOCKING, 0, 0), level.getSeaLevel());
            }
            entity.setPos(x, top + 1, z);
            entity.setDeltaMovement(0, 0, 0);
            entity.setGlowingTag(true);
        }
    }
}
