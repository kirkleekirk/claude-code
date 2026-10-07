package com.kirkleekirk.heroesendgame.registry;

import com.kirkleekirk.heroesendgame.HeroesEndgame;
import com.kirkleekirk.heroesendgame.loot.InfinityLootModifier;
import com.mojang.serialization.Codec;
import net.minecraftforge.common.loot.IGlobalLootModifier;
import net.minecraftforge.registries.DeferredRegister;
import net.minecraftforge.registries.ForgeRegistries;
import net.minecraftforge.registries.RegistryObject;

public final class ModLootModifiers {
    public static final DeferredRegister<Codec<? extends IGlobalLootModifier>> SERIALIZERS =
            DeferredRegister.create(ForgeRegistries.Keys.GLOBAL_LOOT_MODIFIER_SERIALIZERS, HeroesEndgame.MOD_ID);

    public static final RegistryObject<Codec<InfinityLootModifier>> INFINITY_LOOT = SERIALIZERS.register("infinity_loot", InfinityLootModifier.CODEC);

    private ModLootModifiers() {
    }
}
