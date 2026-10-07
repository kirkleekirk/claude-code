package com.kirkleekirk.heroesendgame.item;

import com.kirkleekirk.heroesendgame.nemesis.EndgameStatus;
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
 * Uatu the Watcher sees everything and interferes with nothing - except to leave you this log of what is coming
 * for you. Shows your nemeses, their triggers and the state of the Infinity Saga.
 */
public class WatcherLogItem extends Item {
    public WatcherLogItem(Properties properties) {
        super(properties);
    }

    @Override
    public InteractionResultHolder<ItemStack> use(Level level, Player player, InteractionHand hand) {
        ItemStack stack = player.getItemInHand(hand);
        if (!level.isClientSide && player instanceof ServerPlayer serverPlayer) {
            for (Component line : EndgameStatus.describe(serverPlayer, serverPlayer)) {
                serverPlayer.sendSystemMessage(line);
            }
        }
        return InteractionResultHolder.sidedSuccess(stack, level.isClientSide);
    }

    @Override
    public void appendHoverText(ItemStack stack, @Nullable Level level, List<Component> tooltip, TooltipFlag flag) {
        tooltip.add(Component.translatable("item.heroes_endgame.watcher_log.lore").withStyle(ChatFormatting.GRAY, ChatFormatting.ITALIC));
    }
}
