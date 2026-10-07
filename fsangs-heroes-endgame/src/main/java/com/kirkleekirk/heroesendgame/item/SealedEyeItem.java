package com.kirkleekirk.heroesendgame.item;

import com.kirkleekirk.heroesendgame.infinity.DormammuBargain;
import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResultHolder;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.TooltipFlag;
import net.minecraft.world.level.Level;
import org.jetbrains.annotations.Nullable;

import java.util.List;

/**
 * The Eye of Agamotto, found in a Stronghold library (Kamar-Taj's library) with the Time Stone sealed inside.
 * Opening it in the Nether calls Dormammu - and starts the bargain.
 */
public class SealedEyeItem extends Item {
    public SealedEyeItem(Properties properties) {
        super(properties);
    }

    @Override
    public InteractionResultHolder<ItemStack> use(Level level, Player player, InteractionHand hand) {
        ItemStack stack = player.getItemInHand(hand);
        if (!level.isClientSide && player instanceof ServerPlayer serverPlayer) {
            if (DormammuBargain.summon(serverPlayer)) {
                player.getCooldowns().addCooldown(this, 200);
            }
        }
        return InteractionResultHolder.sidedSuccess(stack, level.isClientSide);
    }

    @Override
    public boolean isFoil(ItemStack stack) {
        return true;
    }

    @Override
    public void appendHoverText(ItemStack stack, @Nullable Level level, List<Component> tooltip, TooltipFlag flag) {
        tooltip.add(Component.translatable("item.heroes_endgame.sealed_eye_of_agamotto.lore").withStyle(ChatFormatting.GRAY, ChatFormatting.ITALIC));
        tooltip.add(Component.translatable("item.heroes_endgame.sealed_eye_of_agamotto.hint").withStyle(ChatFormatting.GOLD));
    }
}
