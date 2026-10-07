package com.kirkleekirk.heroesendgame.registry;

import com.kirkleekirk.heroesendgame.HeroesEndgame;
import com.kirkleekirk.heroesendgame.infinity.InfinityStone;
import com.kirkleekirk.heroesendgame.item.InfinityGauntletItem;
import com.kirkleekirk.heroesendgame.item.InfinityStoneItem;
import com.kirkleekirk.heroesendgame.item.SealedEyeItem;
import com.kirkleekirk.heroesendgame.item.TrophyItem;
import com.kirkleekirk.heroesendgame.item.Velocity9Item;
import com.kirkleekirk.heroesendgame.item.WatcherLogItem;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.Rarity;
import net.minecraftforge.common.ForgeSpawnEggItem;
import net.minecraftforge.registries.DeferredRegister;
import net.minecraftforge.registries.ForgeRegistries;
import net.minecraftforge.registries.RegistryObject;

import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

public final class ModItems {
    public static final DeferredRegister<Item> ITEMS = DeferredRegister.create(ForgeRegistries.ITEMS, HeroesEndgame.MOD_ID);

    /** Everything that goes in the creative tab, in order. */
    public static final List<RegistryObject<? extends Item>> TAB_ORDER = new ArrayList<>();

    public static final Map<InfinityStone, RegistryObject<InfinityStoneItem>> STONES = new EnumMap<>(InfinityStone.class);

    static {
        for (InfinityStone stone : InfinityStone.values()) {
            STONES.put(stone, register(stone.itemName(), () -> new InfinityStoneItem(stone,
                    new Item.Properties().stacksTo(1).rarity(Rarity.EPIC).fireResistant())));
        }
    }

    public static final RegistryObject<InfinityGauntletItem> INFINITY_GAUNTLET = register("infinity_gauntlet",
            () -> new InfinityGauntletItem(new Item.Properties().stacksTo(1).rarity(Rarity.EPIC).fireResistant()));
    public static final RegistryObject<SealedEyeItem> SEALED_EYE_OF_AGAMOTTO = register("sealed_eye_of_agamotto",
            () -> new SealedEyeItem(new Item.Properties().stacksTo(1).rarity(Rarity.RARE).fireResistant()));
    public static final RegistryObject<WatcherLogItem> WATCHER_LOG = register("watcher_log",
            () -> new WatcherLogItem(new Item.Properties().stacksTo(1).rarity(Rarity.UNCOMMON)));

    // --- Trophies --------------------------------------------------------------------------------------------------
    public static final RegistryObject<TrophyItem> VILTRUMITE_SIGIL = trophy("viltrumite_sigil", Rarity.RARE);
    public static final RegistryObject<TrophyItem> CONQUEST_MEDAL = trophy("conquest_medal", Rarity.EPIC);
    public static final RegistryObject<TrophyItem> REGENT_CREST = trophy("regent_crest", Rarity.EPIC);
    public static final RegistryObject<TrophyItem> BLACK_ORDER_INSIGNIA = trophy("black_order_insignia", Rarity.RARE);
    public static final RegistryObject<TrophyItem> DOOMBOT_CORE = trophy("doombot_core", Rarity.UNCOMMON);
    public static final RegistryObject<TrophyItem> DOOM_MASK = trophy("doom_mask", Rarity.EPIC);
    public static final RegistryObject<TrophyItem> DOOMSDAY_BONE = trophy("doomsday_bone", Rarity.EPIC);
    public static final RegistryObject<TrophyItem> SENTINEL_EYE = trophy("sentinel_eye", Rarity.UNCOMMON);
    public static final RegistryObject<TrophyItem> MASTER_MOLD_CORE = trophy("master_mold_core", Rarity.EPIC);
    public static final RegistryObject<TrophyItem> PENANCE_CHAIN = trophy("penance_chain", Rarity.EPIC);
    public static final RegistryObject<Velocity9Item> VELOCITY_9 = register("velocity_9",
            () -> new Velocity9Item(new Item.Properties().stacksTo(8).rarity(Rarity.RARE)));

    // --- Spawn eggs ------------------------------------------------------------------------------------------------
    static {
        egg("viltrumite_enforcer", ModEntities.VILTRUMITE_ENFORCER, 0x111111, 0xEEEEEE);
        egg("conquest", ModEntities.CONQUEST, 0x4A3B2E, 0xB0B0B0);
        egg("thragg", ModEntities.THRAGG, 0xF0F0F0, 0x8B0000);
        egg("loki", ModEntities.LOKI, 0x1F5E2E, 0xD4AF37);
        egg("chitauri", ModEntities.CHITAURI, 0x5A5E66, 0x2E7DBA);
        egg("ebony_maw", ModEntities.EBONY_MAW, 0x9EA3A8, 0x2B2B2B);
        egg("cull_obsidian", ModEntities.CULL_OBSIDIAN, 0x3B3A36, 0x7A5C3B);
        egg("proxima_midnight", ModEntities.PROXIMA_MIDNIGHT, 0x1C1C3A, 0x4FB3FF);
        egg("corvus_glaive", ModEntities.CORVUS_GLAIVE, 0x2F3B2F, 0x9A9A9A);
        egg("thanos", ModEntities.THANOS, 0x7B4F9D, 0xD4AF37);
        egg("stonekeeper", ModEntities.STONEKEEPER, 0x2B1B1B, 0xB22222);
        egg("dormammu", ModEntities.DORMAMMU, 0x1A0A2E, 0xFF6A00);
        egg("mindless_one", ModEntities.MINDLESS_ONE, 0x5A5048, 0xFF8C1A);
        egg("doombot", ModEntities.DOOMBOT, 0x707070, 0x2E5E2E);
        egg("doctor_doom", ModEntities.DOCTOR_DOOM, 0x3A3F44, 0x1F6B2C);
        egg("doomsday", ModEntities.DOOMSDAY, 0x6E6E6E, 0xE8E2D0);
        egg("zoom", ModEntities.ZOOM, 0x101010, 0x2F7FFF);
        egg("sentinel", ModEntities.SENTINEL, 0x7B3FA0, 0xB03060);
        egg("master_mold", ModEntities.MASTER_MOLD, 0x4B2E66, 0x9B2D5A);
        egg("ghost_rider", ModEntities.GHOST_RIDER, 0x1A1A1A, 0xFF5A00);
    }

    public static InfinityStoneItem stone(InfinityStone stone) {
        return STONES.get(stone).get();
    }

    private static <T extends Item> RegistryObject<T> register(String name, Supplier<T> supplier) {
        RegistryObject<T> object = ITEMS.register(name, supplier);
        TAB_ORDER.add(object);
        return object;
    }

    private static RegistryObject<TrophyItem> trophy(String name, Rarity rarity) {
        return register(name, () -> new TrophyItem(new Item.Properties().stacksTo(16).rarity(rarity).fireResistant()));
    }

    private static void egg(String name, RegistryObject<? extends EntityType<? extends Mob>> type, int primary, int secondary) {
        register(name + "_spawn_egg", () -> new ForgeSpawnEggItem(type, primary, secondary, new Item.Properties()));
    }

    private ModItems() {
    }
}
