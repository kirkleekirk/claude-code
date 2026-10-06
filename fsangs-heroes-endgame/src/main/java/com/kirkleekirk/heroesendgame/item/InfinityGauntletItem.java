package com.kirkleekirk.heroesendgame.item;

import com.kirkleekirk.heroesendgame.infinity.InfinityCampaign;
import com.kirkleekirk.heroesendgame.infinity.InfinityStone;
import com.kirkleekirk.heroesendgame.infinity.StonePowers;
import net.minecraft.ChatFormatting;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResultHolder;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.TooltipFlag;
import net.minecraft.world.item.UseAnim;
import net.minecraft.world.level.Level;
import org.jetbrains.annotations.Nullable;

import java.util.EnumSet;
import java.util.List;
import java.util.Set;

/**
 * The Infinity Gauntlet, forged from Uru by Eitri (FSang's Uru ingots when installed).
 * <ul>
 *     <li>Hold it in your main hand and a stone in your off hand, then use it: the stone locks in.</li>
 *     <li>Sneak + use cycles through the powers of the stones it holds.</li>
 *     <li>Use triggers the selected power. With all six, "Snap" appears: hold use to snap your fingers.</li>
 * </ul>
 * The gauntlet shields its wearer from the Power Stone, but the snap itself costs most of your health
 * (it kills anyone with less than 40 max health) and burns the gauntlet out for three days.
 */
public class InfinityGauntletItem extends Item {
    public static final String TAG_STONES = "Stones";
    public static final String TAG_SELECTED = "Selected";
    public static final String TAG_BURNT = "BurntUntil";
    public static final String TAG_CLAIMED = "ClaimedStones";
    /** Selected index meaning "snap" (only offered with all six stones). */
    public static final int SNAP = 6;
    private static final int SNAP_TICKS = 40;

    public InfinityGauntletItem(Properties properties) {
        super(properties);
    }

    // ---------------------------------------------------------------------------------------------------------------
    // Stone storage
    // ---------------------------------------------------------------------------------------------------------------

    public static int mask(ItemStack stack) {
        return stack.hasTag() ? stack.getTag().getInt(TAG_STONES) : 0;
    }

    public static boolean hasStone(ItemStack stack, InfinityStone stone) {
        return (mask(stack) & (1 << stone.ordinal())) != 0;
    }

    public static Set<InfinityStone> getStones(ItemStack stack) {
        EnumSet<InfinityStone> stones = EnumSet.noneOf(InfinityStone.class);
        for (InfinityStone stone : InfinityStone.values()) {
            if (hasStone(stack, stone)) {
                stones.add(stone);
            }
        }
        return stones;
    }

    public static int stoneCount(ItemStack stack) {
        return Integer.bitCount(mask(stack));
    }

    public static void insertStone(ItemStack stack, InfinityStone stone) {
        CompoundTag tag = stack.getOrCreateTag();
        tag.putInt(TAG_STONES, tag.getInt(TAG_STONES) | (1 << stone.ordinal()));
        if (!tag.contains(TAG_SELECTED)) {
            tag.putInt(TAG_SELECTED, stone.ordinal());
        }
    }

    public static int selected(ItemStack stack) {
        int selected = stack.hasTag() ? stack.getTag().getInt(TAG_SELECTED) : 0;
        if (selected == SNAP) {
            return stoneCount(stack) == 6 ? SNAP : firstStone(stack);
        }
        return hasStone(stack, InfinityStone.values()[Math.min(selected, 5)]) ? selected : firstStone(stack);
    }

    private static int firstStone(ItemStack stack) {
        for (InfinityStone stone : InfinityStone.values()) {
            if (hasStone(stack, stone)) {
                return stone.ordinal();
            }
        }
        return -1;
    }

    public static boolean isBurnt(ItemStack stack, Level level) {
        return stack.hasTag() && stack.getTag().getLong(TAG_BURNT) > level.getGameTime();
    }

    public static void burnOut(ItemStack stack, Level level, long ticks) {
        stack.getOrCreateTag().putLong(TAG_BURNT, level.getGameTime() + ticks);
    }

    // ---------------------------------------------------------------------------------------------------------------
    // Use
    // ---------------------------------------------------------------------------------------------------------------

    @Override
    public InteractionResultHolder<ItemStack> use(Level level, Player player, InteractionHand hand) {
        ItemStack gauntlet = player.getItemInHand(hand);
        ItemStack other = player.getItemInHand(hand == InteractionHand.MAIN_HAND ? InteractionHand.OFF_HAND : InteractionHand.MAIN_HAND);

        // Socket a stone
        if (other.getItem() instanceof InfinityStoneItem stoneItem && !hasStone(gauntlet, stoneItem.stone())) {
            if (!level.isClientSide) {
                insertStone(gauntlet, stoneItem.stone());
                gauntlet.getOrCreateTag().putInt(TAG_SELECTED, stoneItem.stone().ordinal());
                other.shrink(1);
                level.playSound(null, player.blockPosition(), SoundEvents.ANVIL_USE, SoundSource.PLAYERS, 1.0F, 1.6F);
                player.displayClientMessage(Component.translatable("item.heroes_endgame.infinity_gauntlet.socketed",
                        stoneItem.stone().displayName()), true);
                if (player instanceof ServerPlayer serverPlayer) {
                    StonePowers.onGauntletChanged(serverPlayer, gauntlet);
                }
            }
            return InteractionResultHolder.sidedSuccess(gauntlet, level.isClientSide);
        }

        if (stoneCount(gauntlet) == 0) {
            if (!level.isClientSide) {
                player.displayClientMessage(Component.translatable("item.heroes_endgame.infinity_gauntlet.empty").withStyle(ChatFormatting.GRAY), true);
            }
            return InteractionResultHolder.pass(gauntlet);
        }

        // Cycle powers
        if (player.isShiftKeyDown()) {
            if (!level.isClientSide) {
                cycle(gauntlet);
                int selected = selected(gauntlet);
                player.displayClientMessage(Component.translatable("item.heroes_endgame.infinity_gauntlet.selected", powerName(selected)), true);
                level.playSound(null, player.blockPosition(), SoundEvents.AMETHYST_BLOCK_CHIME, SoundSource.PLAYERS, 1.0F, 1.2F);
            }
            return InteractionResultHolder.sidedSuccess(gauntlet, level.isClientSide);
        }

        if (isBurnt(gauntlet, level)) {
            if (!level.isClientSide) {
                player.displayClientMessage(Component.translatable("item.heroes_endgame.infinity_gauntlet.burnt").withStyle(ChatFormatting.DARK_RED), true);
            }
            return InteractionResultHolder.fail(gauntlet);
        }

        int selected = selected(gauntlet);
        if (selected == SNAP) {
            player.startUsingItem(hand);
            return InteractionResultHolder.consume(gauntlet);
        }
        if (!level.isClientSide && player instanceof ServerPlayer serverPlayer && selected >= 0) {
            InfinityStone stone = InfinityStone.values()[selected];
            int cooldown = StonePowers.activate(serverPlayer, stone, gauntlet);
            if (cooldown > 0) {
                player.getCooldowns().addCooldown(this, cooldown);
            }
        }
        return InteractionResultHolder.sidedSuccess(gauntlet, level.isClientSide);
    }

    private static void cycle(ItemStack gauntlet) {
        int current = selected(gauntlet);
        int next = current;
        for (int i = 1; i <= 7; i++) {
            int candidate = (current + i) % 7;
            if (candidate == SNAP ? stoneCount(gauntlet) == 6 : hasStone(gauntlet, InfinityStone.values()[candidate])) {
                next = candidate;
                break;
            }
        }
        gauntlet.getOrCreateTag().putInt(TAG_SELECTED, next);
    }

    public static Component powerName(int selected) {
        if (selected == SNAP) {
            return Component.translatable("item.heroes_endgame.infinity_gauntlet.power.snap").withStyle(ChatFormatting.LIGHT_PURPLE, ChatFormatting.BOLD);
        }
        if (selected < 0) {
            return Component.literal("-");
        }
        InfinityStone stone = InfinityStone.values()[selected];
        return Component.translatable("item.heroes_endgame.infinity_gauntlet.power." + stone.getSerializedName()).withStyle(stone.formatting());
    }

    @Override
    public int getUseDuration(ItemStack stack) {
        return 72000;
    }

    @Override
    public UseAnim getUseAnimation(ItemStack stack) {
        return UseAnim.BOW;
    }

    @Override
    public void onUseTick(Level level, LivingEntity entity, ItemStack stack, int remaining) {
        int used = getUseDuration(stack) - remaining;
        if (level.isClientSide || !(entity instanceof ServerPlayer player)) {
            return;
        }
        if (used % 10 == 0) {
            level.playSound(null, player.blockPosition(), SoundEvents.BEACON_AMBIENT, SoundSource.PLAYERS, 1.5F, 0.6F + used * 0.02F);
        }
        if (used >= SNAP_TICKS) {
            player.stopUsingItem();
            StonePowers.snap(player, stack);
        }
    }

    // ---------------------------------------------------------------------------------------------------------------
    // Passive, tooltip, indestructibility
    // ---------------------------------------------------------------------------------------------------------------

    @Override
    public void inventoryTick(ItemStack stack, Level level, Entity entity, int slot, boolean selected) {
        if (level.isClientSide || !(entity instanceof ServerPlayer player)) {
            return;
        }
        CompoundTag tag = stack.getOrCreateTag();
        int claimed = tag.getInt(TAG_CLAIMED);
        int mask = mask(stack);
        if ((claimed & mask) != mask) {
            for (InfinityStone stone : getStones(stack)) {
                if ((claimed & (1 << stone.ordinal())) == 0) {
                    InfinityCampaign.get(player.server).onStoneHeld(player, stone);
                }
            }
            tag.putInt(TAG_CLAIMED, claimed | mask);
            StonePowers.onGauntletChanged(player, stack);
        }
        boolean held = selected || player.getOffhandItem() == stack;
        if (held && level.getGameTime() % 20 == 0 && !isBurnt(stack, level)) {
            for (InfinityStone stone : getStones(stack)) {
                StonePowers.passive(player, stone, true);
            }
        }
    }

    @Override
    public boolean isFoil(ItemStack stack) {
        return stoneCount(stack) > 0;
    }

    @Override
    public void appendHoverText(ItemStack stack, @Nullable Level level, List<Component> tooltip, TooltipFlag flag) {
        Set<InfinityStone> stones = getStones(stack);
        if (stones.isEmpty()) {
            tooltip.add(Component.translatable("item.heroes_endgame.infinity_gauntlet.lore").withStyle(ChatFormatting.GRAY, ChatFormatting.ITALIC));
        } else {
            for (InfinityStone stone : stones) {
                tooltip.add(Component.literal(" ◆ ").withStyle(stone.formatting()).append(stone.displayName()));
            }
            tooltip.add(Component.translatable("item.heroes_endgame.infinity_gauntlet.selected", powerName(selected(stack))).withStyle(ChatFormatting.GRAY));
        }
        if (level != null && isBurnt(stack, level)) {
            tooltip.add(Component.translatable("item.heroes_endgame.infinity_gauntlet.burnt").withStyle(ChatFormatting.DARK_RED));
        }
        tooltip.add(Component.translatable("item.heroes_endgame.infinity_gauntlet.help").withStyle(ChatFormatting.DARK_GRAY));
    }

    @Override
    public boolean canBeHurtBy(DamageSource source) {
        return false;
    }

    @Override
    public int getEntityLifespan(ItemStack stack, Level level) {
        return stoneCount(stack) > 0 ? Integer.MAX_VALUE : super.getEntityLifespan(stack, level);
    }

    @Override
    public boolean onEntityItemUpdate(ItemStack stack, ItemEntity entity) {
        if (stoneCount(stack) > 0) {
            InfinityStoneItem.rescueFromVoid(entity);
        }
        return false;
    }
}
