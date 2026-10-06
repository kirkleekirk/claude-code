package com.kirkleekirk.heroesendgame.registry;

import com.kirkleekirk.heroesendgame.HeroesEndgame;
import com.kirkleekirk.heroesendgame.entity.IllusionEntity;
import com.kirkleekirk.heroesendgame.entity.doom.DoctorDoomEntity;
import com.kirkleekirk.heroesendgame.entity.doom.DoombotEntity;
import com.kirkleekirk.heroesendgame.entity.infinity.ChitauriEntity;
import com.kirkleekirk.heroesendgame.entity.infinity.CorvusGlaiveEntity;
import com.kirkleekirk.heroesendgame.entity.infinity.CullObsidianEntity;
import com.kirkleekirk.heroesendgame.entity.infinity.DormammuEntity;
import com.kirkleekirk.heroesendgame.entity.infinity.EbonyMawEntity;
import com.kirkleekirk.heroesendgame.entity.infinity.LokiEntity;
import com.kirkleekirk.heroesendgame.entity.infinity.MindlessOneEntity;
import com.kirkleekirk.heroesendgame.entity.infinity.ProximaMidnightEntity;
import com.kirkleekirk.heroesendgame.entity.infinity.StonekeeperEntity;
import com.kirkleekirk.heroesendgame.entity.infinity.ThanosEntity;
import com.kirkleekirk.heroesendgame.entity.karma.GhostRiderEntity;
import com.kirkleekirk.heroesendgame.entity.kryptonian.DoomsdayEntity;
import com.kirkleekirk.heroesendgame.entity.mutant.MasterMoldEntity;
import com.kirkleekirk.heroesendgame.entity.mutant.SentinelEntity;
import com.kirkleekirk.heroesendgame.entity.projectile.EnergyBoltEntity;
import com.kirkleekirk.heroesendgame.entity.speedster.ZoomEntity;
import com.kirkleekirk.heroesendgame.entity.viltrumite.ConquestEntity;
import com.kirkleekirk.heroesendgame.entity.viltrumite.ThraggEntity;
import com.kirkleekirk.heroesendgame.entity.viltrumite.ViltrumiteEnforcerEntity;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.MobCategory;
import net.minecraftforge.event.entity.EntityAttributeCreationEvent;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod;
import net.minecraftforge.registries.DeferredRegister;
import net.minecraftforge.registries.ForgeRegistries;
import net.minecraftforge.registries.RegistryObject;

@Mod.EventBusSubscriber(modid = HeroesEndgame.MOD_ID, bus = Mod.EventBusSubscriber.Bus.MOD)
public final class ModEntities {
    public static final DeferredRegister<EntityType<?>> ENTITY_TYPES = DeferredRegister.create(ForgeRegistries.ENTITY_TYPES, HeroesEndgame.MOD_ID);

    // --- The Viltrumite Empire -------------------------------------------------------------------------------------
    public static final RegistryObject<EntityType<ViltrumiteEnforcerEntity>> VILTRUMITE_ENFORCER = boss("viltrumite_enforcer",
            EntityType.Builder.of(ViltrumiteEnforcerEntity::new, MobCategory.MONSTER).sized(0.6F, 1.95F));
    public static final RegistryObject<EntityType<ConquestEntity>> CONQUEST = boss("conquest",
            EntityType.Builder.of(ConquestEntity::new, MobCategory.MONSTER).sized(0.66F, 2.1F));
    public static final RegistryObject<EntityType<ThraggEntity>> THRAGG = boss("thragg",
            EntityType.Builder.of(ThraggEntity::new, MobCategory.MONSTER).sized(0.66F, 2.1F));

    // --- The Infinity Saga -----------------------------------------------------------------------------------------
    public static final RegistryObject<EntityType<LokiEntity>> LOKI = boss("loki",
            EntityType.Builder.of(LokiEntity::new, MobCategory.MONSTER).sized(0.6F, 1.95F));
    /** Loki's illusions and Zoom's time remnants. */
    public static final RegistryObject<EntityType<IllusionEntity>> ILLUSION = boss("illusion",
            EntityType.Builder.of(IllusionEntity::new, MobCategory.MONSTER).sized(0.6F, 1.95F));
    public static final RegistryObject<EntityType<ChitauriEntity>> CHITAURI = boss("chitauri",
            EntityType.Builder.of(ChitauriEntity::new, MobCategory.MONSTER).sized(0.6F, 1.95F));
    public static final RegistryObject<EntityType<EbonyMawEntity>> EBONY_MAW = boss("ebony_maw",
            EntityType.Builder.of(EbonyMawEntity::new, MobCategory.MONSTER).sized(0.6F, 2.05F));
    public static final RegistryObject<EntityType<CullObsidianEntity>> CULL_OBSIDIAN = boss("cull_obsidian",
            EntityType.Builder.of(CullObsidianEntity::new, MobCategory.MONSTER).sized(1.0F, 2.95F));
    public static final RegistryObject<EntityType<ProximaMidnightEntity>> PROXIMA_MIDNIGHT = boss("proxima_midnight",
            EntityType.Builder.of(ProximaMidnightEntity::new, MobCategory.MONSTER).sized(0.6F, 1.95F));
    public static final RegistryObject<EntityType<CorvusGlaiveEntity>> CORVUS_GLAIVE = boss("corvus_glaive",
            EntityType.Builder.of(CorvusGlaiveEntity::new, MobCategory.MONSTER).sized(0.6F, 2.05F));
    public static final RegistryObject<EntityType<ThanosEntity>> THANOS = boss("thanos",
            EntityType.Builder.of(ThanosEntity::new, MobCategory.MONSTER).sized(0.9F, 2.75F));
    public static final RegistryObject<EntityType<StonekeeperEntity>> STONEKEEPER = boss("stonekeeper",
            EntityType.Builder.of(StonekeeperEntity::new, MobCategory.MISC).sized(0.6F, 1.95F));
    public static final RegistryObject<EntityType<DormammuEntity>> DORMAMMU = boss("dormammu",
            EntityType.Builder.of(DormammuEntity::new, MobCategory.MONSTER).sized(4.0F, 4.0F).clientTrackingRange(12));
    public static final RegistryObject<EntityType<MindlessOneEntity>> MINDLESS_ONE = boss("mindless_one",
            EntityType.Builder.of(MindlessOneEntity::new, MobCategory.MONSTER).sized(0.8F, 2.45F));

    // --- Doctor Doom -----------------------------------------------------------------------------------------------
    public static final RegistryObject<EntityType<DoombotEntity>> DOOMBOT = boss("doombot",
            EntityType.Builder.of(DoombotEntity::new, MobCategory.MONSTER).sized(0.6F, 1.95F));
    public static final RegistryObject<EntityType<DoctorDoomEntity>> DOCTOR_DOOM = boss("doctor_doom",
            EntityType.Builder.of(DoctorDoomEntity::new, MobCategory.MONSTER).sized(0.6F, 1.95F));

    // --- Kryptonian / Speedster / Mutant / Karma nemeses --------------------------------------------------------------
    public static final RegistryObject<EntityType<DoomsdayEntity>> DOOMSDAY = boss("doomsday",
            EntityType.Builder.of(DoomsdayEntity::new, MobCategory.MONSTER).sized(1.0F, 2.95F));
    public static final RegistryObject<EntityType<ZoomEntity>> ZOOM = boss("zoom",
            EntityType.Builder.of(ZoomEntity::new, MobCategory.MONSTER).sized(0.6F, 1.95F));
    public static final RegistryObject<EntityType<SentinelEntity>> SENTINEL = boss("sentinel",
            EntityType.Builder.of(SentinelEntity::new, MobCategory.MONSTER).sized(1.5F, 4.9F).clientTrackingRange(12));
    public static final RegistryObject<EntityType<MasterMoldEntity>> MASTER_MOLD = boss("master_mold",
            EntityType.Builder.of(MasterMoldEntity::new, MobCategory.MONSTER).sized(3.0F, 9.75F).clientTrackingRange(16));
    public static final RegistryObject<EntityType<GhostRiderEntity>> GHOST_RIDER = boss("ghost_rider",
            EntityType.Builder.of(GhostRiderEntity::new, MobCategory.MONSTER).sized(0.6F, 1.95F));

    // --- Projectiles ----------------------------------------------------------------------------------------------
    public static final RegistryObject<EntityType<EnergyBoltEntity>> ENERGY_BOLT = ENTITY_TYPES.register("energy_bolt",
            () -> EntityType.Builder.<EnergyBoltEntity>of(EnergyBoltEntity::new, MobCategory.MISC)
                    .sized(0.4F, 0.4F).clientTrackingRange(8).updateInterval(1).fireImmune()
                    .build(HeroesEndgame.id("energy_bolt").toString()));

    private static <T extends Entity> RegistryObject<EntityType<T>> boss(String name, EntityType.Builder<T> builder) {
        return ENTITY_TYPES.register(name, () -> builder.fireImmune().clientTrackingRange(10).build(HeroesEndgame.id(name).toString()));
    }

    @SubscribeEvent
    public static void onAttributes(EntityAttributeCreationEvent event) {
        event.put(VILTRUMITE_ENFORCER.get(), ViltrumiteEnforcerEntity.createAttributes().build());
        event.put(CONQUEST.get(), ConquestEntity.createAttributes().build());
        event.put(THRAGG.get(), ThraggEntity.createAttributes().build());
        event.put(LOKI.get(), LokiEntity.createAttributes().build());
        event.put(ILLUSION.get(), IllusionEntity.createAttributes().build());
        event.put(CHITAURI.get(), ChitauriEntity.createAttributes().build());
        event.put(EBONY_MAW.get(), EbonyMawEntity.createAttributes().build());
        event.put(CULL_OBSIDIAN.get(), CullObsidianEntity.createAttributes().build());
        event.put(PROXIMA_MIDNIGHT.get(), ProximaMidnightEntity.createAttributes().build());
        event.put(CORVUS_GLAIVE.get(), CorvusGlaiveEntity.createAttributes().build());
        event.put(THANOS.get(), ThanosEntity.createAttributes().build());
        event.put(STONEKEEPER.get(), StonekeeperEntity.createAttributes().build());
        event.put(DORMAMMU.get(), DormammuEntity.createAttributes().build());
        event.put(MINDLESS_ONE.get(), MindlessOneEntity.createAttributes().build());
        event.put(DOOMBOT.get(), DoombotEntity.createAttributes().build());
        event.put(DOCTOR_DOOM.get(), DoctorDoomEntity.createAttributes().build());
        event.put(DOOMSDAY.get(), DoomsdayEntity.createAttributes().build());
        event.put(ZOOM.get(), ZoomEntity.createAttributes().build());
        event.put(SENTINEL.get(), SentinelEntity.createAttributes().build());
        event.put(MASTER_MOLD.get(), MasterMoldEntity.createAttributes().build());
        event.put(GHOST_RIDER.get(), GhostRiderEntity.createAttributes().build());
    }

    private ModEntities() {
    }
}
