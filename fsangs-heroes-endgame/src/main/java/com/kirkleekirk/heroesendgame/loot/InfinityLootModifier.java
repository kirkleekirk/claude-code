package com.kirkleekirk.heroesendgame.loot;

import com.google.common.base.Suppliers;
import com.kirkleekirk.heroesendgame.config.EndgameConfig;
import com.kirkleekirk.heroesendgame.infinity.InfinityCampaign;
import com.kirkleekirk.heroesendgame.infinity.InfinityStone;
import com.kirkleekirk.heroesendgame.registry.ModItems;
import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import it.unimi.dsi.fastutil.objects.ObjectArrayList;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.storage.loot.LootContext;
import net.minecraft.world.level.storage.loot.predicates.LootItemCondition;
import net.minecraftforge.common.loot.IGlobalLootModifier;
import net.minecraftforge.common.loot.LootModifier;
import net.minecraftforge.fml.ModList;
import org.jetbrains.annotations.NotNull;

import java.util.function.Supplier;

/**
 * Hides an Infinity Stone (or the sealed Eye of Agamotto) in a chest, but only while that stone is still unclaimed.
 * Once a player - or Thanos - has a stone, it never generates again.
 */
public class InfinityLootModifier extends LootModifier {
    public static final Supplier<Codec<InfinityLootModifier>> CODEC = Suppliers.memoize(() -> RecordCodecBuilder.create(inst -> codecStart(inst)
            .and(Codec.STRING.fieldOf("reward").forGetter(m -> m.reward))
            .and(Codec.STRING.fieldOf("chance").forGetter(m -> m.chance))
            .and(Codec.STRING.optionalFieldOf("requires_mod", "").forGetter(m -> m.requiresMod))
            .and(Codec.STRING.optionalFieldOf("forbids_mod", "").forGetter(m -> m.forbidsMod))
            .apply(inst, InfinityLootModifier::new)));

    private final String reward;
    private final String chance;
    private final String requiresMod;
    private final String forbidsMod;

    public InfinityLootModifier(LootItemCondition[] conditions, String reward, String chance, String requiresMod, String forbidsMod) {
        super(conditions);
        this.reward = reward;
        this.chance = chance;
        this.requiresMod = requiresMod;
        this.forbidsMod = forbidsMod;
    }

    @Override
    protected @NotNull ObjectArrayList<ItemStack> doApply(ObjectArrayList<ItemStack> generatedLoot, LootContext context) {
        if (!EndgameConfig.isLoaded() || !EndgameConfig.INFINITY_ENABLED.get()) {
            return generatedLoot;
        }
        if (!requiresMod.isEmpty() && !ModList.get().isLoaded(requiresMod)) {
            return generatedLoot;
        }
        if (!forbidsMod.isEmpty() && ModList.get().isLoaded(forbidsMod)) {
            return generatedLoot;
        }

        boolean eye = reward.equals("sealed_eye_of_agamotto");
        InfinityStone stone = eye ? InfinityStone.TIME : InfinityStone.byName(reward.replace("_stone", ""));
        if (stone == null) {
            return generatedLoot;
        }

        InfinityCampaign campaign = InfinityCampaign.get(context.getLevel().getServer());
        if (!campaign.isUnclaimed(stone) || context.getRandom().nextDouble() >= chanceValue()) {
            return generatedLoot;
        }

        if (eye) {
            generatedLoot.add(new ItemStack(ModItems.SEALED_EYE_OF_AGAMOTTO.get()));
        } else {
            generatedLoot.add(new ItemStack(ModItems.stone(stone)));
            // The stone now exists in the world: it can't be generated a second time.
            campaign.markFound(stone, null);
        }
        return generatedLoot;
    }

    private double chanceValue() {
        return switch (chance) {
            case "space" -> EndgameConfig.INFINITY_SPACE_CHANCE.get();
            case "reality" -> EndgameConfig.INFINITY_REALITY_CHANCE.get();
            case "power_mars" -> EndgameConfig.INFINITY_POWER_CHANCE_MARS.get();
            case "power_ocean" -> EndgameConfig.INFINITY_POWER_CHANCE_OCEAN.get();
            case "eye" -> EndgameConfig.INFINITY_EYE_CHANCE.get();
            default -> 0.0;
        };
    }

    @Override
    public Codec<? extends IGlobalLootModifier> codec() {
        return CODEC.get();
    }
}
