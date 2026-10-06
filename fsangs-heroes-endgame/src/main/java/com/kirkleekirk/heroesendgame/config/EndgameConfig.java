package com.kirkleekirk.heroesendgame.config;

import net.minecraftforge.common.ForgeConfigSpec;

import java.util.List;

/**
 * Server config (per world, in {@code serverconfig/heroes_endgame-server.toml}).
 */
public final class EndgameConfig {
    public static final ForgeConfigSpec SPEC;

    // general
    public static final ForgeConfigSpec.BooleanValue ENABLED;
    public static final ForgeConfigSpec.IntValue CHECK_INTERVAL_SECONDS;
    public static final ForgeConfigSpec.DoubleValue HEALTH_MULTIPLIER;
    public static final ForgeConfigSpec.DoubleValue DAMAGE_MULTIPLIER;
    public static final ForgeConfigSpec.DoubleValue MULTIPLAYER_HEALTH_BONUS;
    public static final ForgeConfigSpec.BooleanValue PER_HIT_DAMAGE_CAP;
    public static final ForgeConfigSpec.BooleanValue BLOCK_BREAKING;
    public static final ForgeConfigSpec.BooleanValue GLOBAL_ANNOUNCEMENTS;
    public static final ForgeConfigSpec.BooleanValue SKILL_POINT_REWARDS;
    public static final ForgeConfigSpec.DoubleValue DURABILITY_PIERCE;
    public static final ForgeConfigSpec.IntValue LEASH_DISTANCE;

    // viltrumite
    public static final ForgeConfigSpec.BooleanValue VILTRUMITE_ENABLED;
    public static final ForgeConfigSpec.IntValue VILTRUMITE_TRIAL_AGE;
    public static final ForgeConfigSpec.IntValue VILTRUMITE_CONQUEST_AGE;
    public static final ForgeConfigSpec.IntValue VILTRUMITE_THRAGG_AGE;
    public static final ForgeConfigSpec.IntValue VILTRUMITE_TIER_COOLDOWN_DAYS;
    public static final ForgeConfigSpec.ConfigValue<List<? extends String>> VILTRUMITE_POWERS;

    // infinity
    public static final ForgeConfigSpec.BooleanValue INFINITY_ENABLED;
    public static final ForgeConfigSpec.IntValue INFINITY_FAILSAFE_DAY;
    public static final ForgeConfigSpec.IntValue INFINITY_CLOCK_DAYS;
    public static final ForgeConfigSpec.IntValue INFINITY_THANOS_ARRIVAL_STONES;
    public static final ForgeConfigSpec.BooleanValue INFINITY_BLACK_ORDER_RAIDS;
    public static final ForgeConfigSpec.BooleanValue INFINITY_SNAP_ENABLED;
    public static final ForgeConfigSpec.DoubleValue INFINITY_SNAP_DUST_FRACTION;
    public static final ForgeConfigSpec.DoubleValue INFINITY_SNAP_PENALTY;
    public static final ForgeConfigSpec.BooleanValue INFINITY_SNAP_KILLS_PLAYERS;
    public static final ForgeConfigSpec.BooleanValue INFINITY_POWER_STONE_BURNS;
    public static final ForgeConfigSpec.DoubleValue INFINITY_SPACE_CHANCE;
    public static final ForgeConfigSpec.DoubleValue INFINITY_REALITY_CHANCE;
    public static final ForgeConfigSpec.DoubleValue INFINITY_POWER_CHANCE_MARS;
    public static final ForgeConfigSpec.DoubleValue INFINITY_POWER_CHANCE_OCEAN;
    public static final ForgeConfigSpec.DoubleValue INFINITY_EYE_CHANCE;
    public static final ForgeConfigSpec.ConfigValue<String> INFINITY_VORMIR_DIMENSION;
    public static final ForgeConfigSpec.IntValue INFINITY_VORMIR_MIN_Y;
    public static final ForgeConfigSpec.IntValue INFINITY_VORMIR_FALLBACK_MIN_Y;
    public static final ForgeConfigSpec.IntValue INFINITY_DORMAMMU_LOOPS;

    // doom
    public static final ForgeConfigSpec.BooleanValue DOOM_ENABLED;
    public static final ForgeConfigSpec.IntValue DOOM_SKILL_LEVEL;
    public static final ForgeConfigSpec.IntValue DOOM_NEMESES_DEFEATED;
    public static final ForgeConfigSpec.BooleanValue DOOM_IMPOSTOR_TRIGGER;
    public static final ForgeConfigSpec.IntValue DOOM_DAYS_AFTER_DOOMBOTS;
    public static final ForgeConfigSpec.IntValue DOOM_REMATCH_DAYS;
    public static final ForgeConfigSpec.IntValue DOOM_DOOMBOT_COUNT;

    // doomsday
    public static final ForgeConfigSpec.BooleanValue DOOMSDAY_ENABLED;
    public static final ForgeConfigSpec.IntValue DOOMSDAY_SKILL_LEVEL;
    public static final ForgeConfigSpec.IntValue DOOMSDAY_RESURRECTIONS;
    public static final ForgeConfigSpec.DoubleValue DOOMSDAY_MAX_ADAPTATION;
    public static final ForgeConfigSpec.DoubleValue DOOMSDAY_ADAPTATION_PER_HIT;
    public static final ForgeConfigSpec.ConfigValue<List<? extends String>> KRYPTONIAN_POWERS;

    // zoom
    public static final ForgeConfigSpec.BooleanValue ZOOM_ENABLED;
    public static final ForgeConfigSpec.IntValue ZOOM_SPEED_DISTANCE;
    public static final ForgeConfigSpec.IntValue ZOOM_SKILL_LEVEL;
    public static final ForgeConfigSpec.ConfigValue<List<? extends String>> SPEEDSTER_POWERS;

    // sentinels
    public static final ForgeConfigSpec.BooleanValue SENTINELS_ENABLED;
    public static final ForgeConfigSpec.IntValue SENTINELS_SKILL_LEVEL;
    public static final ForgeConfigSpec.IntValue SENTINELS_RAID_INTERVAL_DAYS;
    public static final ForgeConfigSpec.IntValue SENTINELS_BEFORE_MASTER_MOLD;
    public static final ForgeConfigSpec.ConfigValue<List<? extends String>> MUTANT_POWERS;

    // ghost rider
    public static final ForgeConfigSpec.BooleanValue GHOST_RIDER_ENABLED;
    public static final ForgeConfigSpec.IntValue GHOST_RIDER_KARMA;
    public static final ForgeConfigSpec.ConfigValue<List<? extends String>> SPIRIT_OF_VENGEANCE_POWERS;

    // compat
    public static final ForgeConfigSpec.BooleanValue USE_FSANG_SUITS;
    public static final ForgeConfigSpec.BooleanValue JAM_PORTAL_GUNS;
    public static final ForgeConfigSpec.BooleanValue TESSERACT_REFUELS_PORTAL_GUNS;
    public static final ForgeConfigSpec.ConfigValue<List<? extends String>> HULK_POWERS;

    static {
        ForgeConfigSpec.Builder b = new ForgeConfigSpec.Builder();

        b.comment("General nemesis settings").push("general");
        ENABLED = b.comment("Master switch. When false no nemesis will ever be triggered automatically (commands still work).")
                .define("enabled", true);
        CHECK_INTERVAL_SECONDS = b.comment("How often (seconds) each online player is evaluated for nemesis triggers.")
                .defineInRange("checkIntervalSeconds", 5, 1, 120);
        HEALTH_MULTIPLIER = b.comment("Multiplier applied to every nemesis' scaled health.")
                .defineInRange("bossHealthMultiplier", 1.0, 0.05, 50.0);
        DAMAGE_MULTIPLIER = b.comment("Multiplier applied to every nemesis' scaled damage.")
                .defineInRange("bossDamageMultiplier", 1.0, 0.05, 50.0);
        MULTIPLAYER_HEALTH_BONUS = b.comment("Extra health fraction per additional player fighting the same nemesis.")
                .defineInRange("multiplayerHealthBonus", 0.5, 0.0, 10.0);
        PER_HIT_DAMAGE_CAP = b.comment("Bosses can only lose a limited fraction of their health per hit, so late-game one-shot powers can't trivialise them.")
                .define("perHitDamageCap", true);
        BLOCK_BREAKING = b.comment("Bosses smash through soft blocks when they get stuck (still requires the mobGriefing gamerule). Never breaks block entities or blast-proof blocks.")
                .define("bossBlockBreaking", true);
        GLOBAL_ANNOUNCEMENTS = b.comment("Announce nemesis arrivals and Infinity Saga events to every player on the server.")
                .define("globalAnnouncements", true);
        SKILL_POINT_REWARDS = b.comment("Defeating a nemesis grants FSang18's Heroes skill points (fsang_skill_points).")
                .define("skillPointRewards", true);
        DURABILITY_PIERCE = b.comment("How much of FSang's generic 'damage_resistance' ability the nemesis attacks pierce (0 = none, 1 = all).",
                        "Nemesis hits are tuned to take a fixed share of your health no matter how durable your powers make you.")
                .defineInRange("durabilityPierce", 0.75, 0.0, 1.0);
        LEASH_DISTANCE = b.comment("If the hunted player gets further than this from a ground nemesis it will teleport after them.")
                .defineInRange("leashDistance", 48, 16, 256);
        b.pop();

        b.comment("The Viltrumite Empire. Uses FSang's 'fsang_age' property (+1 every day survived, reset on death).").push("viltrumite");
        VILTRUMITE_ENABLED = b.define("enabled", true);
        VILTRUMITE_TRIAL_AGE = b.comment("Age at which two Viltrumite enforcers come to test you (the coming-of-age trial).")
                .defineInRange("trialAge", 18, 1, 10000);
        VILTRUMITE_CONQUEST_AGE = b.comment("Age at which Conquest is sent to bring you in (after the trial is passed).")
                .defineInRange("conquestAge", 50, 1, 10000);
        VILTRUMITE_THRAGG_AGE = b.comment("Age at which Grand Regent Thragg comes himself (after Conquest is defeated).")
                .defineInRange("thraggAge", 100, 1, 10000);
        VILTRUMITE_TIER_COOLDOWN_DAYS = b.comment("Minimum in-game days between two Viltrumite encounters.")
                .defineInRange("tierCooldownDays", 3, 0, 1000);
        VILTRUMITE_POWERS = b.comment("Palladium power ids that count as Viltrumite. A trailing * matches any suffix.")
                .defineListAllowEmpty(List.of("powers"), () -> List.of("fsang:viltrumite*"), o -> o instanceof String);
        b.pop();

        b.comment("The Infinity Saga. The Mad Titan wakes up when the first Infinity Stone is claimed by a player.").push("infinity");
        INFINITY_ENABLED = b.define("enabled", true);
        INFINITY_FAILSAFE_DAY = b.comment("If > 0, Thanos also wakes up on this world day even if nobody has found a stone yet. 0 = only stones wake him.")
                .defineInRange("failsafeStartDay", 0, 0, 100000);
        INFINITY_CLOCK_DAYS = b.comment("Every this many in-game days Thanos claims another unclaimed stone or sends the Black Order after one.")
                .defineInRange("clockIntervalDays", 7, 1, 1000);
        INFINITY_THANOS_ARRIVAL_STONES = b.comment("Thanos comes personally once he holds this many stones (or no unclaimed stones are left).")
                .defineInRange("thanosArrivalStones", 3, 0, 6);
        INFINITY_BLACK_ORDER_RAIDS = b.comment("The Black Order hunts players who carry Infinity Stones.")
                .define("blackOrderRaids", true);
        INFINITY_SNAP_ENABLED = b.comment("If Thanos completes the Gauntlet he snaps. Undone when Thanos is defeated or a player snaps with a full Gauntlet.")
                .define("snapEnabled", true);
        INFINITY_SNAP_DUST_FRACTION = b.comment("Fraction of loaded non-player creatures that turn to dust when Thanos snaps.")
                .defineInRange("snapDustFraction", 0.5, 0.0, 1.0);
        INFINITY_SNAP_PENALTY = b.comment("Max health and attack damage penalty every player suffers while the snap is in effect.")
                .defineInRange("snapPenalty", 0.2, 0.0, 0.9);
        INFINITY_SNAP_KILLS_PLAYERS = b.comment("If true, each online player has a 50% chance to be dusted when Thanos snaps (they respawn normally).")
                .define("snapKillsPlayers", false);
        INFINITY_POWER_STONE_BURNS = b.comment("Holding the bare Power Stone burns you unless another player is within 4 blocks (sharing the load, like the Guardians).")
                .define("powerStoneBurns", true);
        INFINITY_SPACE_CHANCE = b.comment("Chance for the Tesseract (Space Stone) in an End City treasure chest while it is unclaimed.")
                .defineInRange("spaceStoneChance", 0.25, 0.0, 1.0);
        INFINITY_REALITY_CHANCE = b.comment("Chance for the Aether (Reality Stone) in an Ancient City chest while it is unclaimed.")
                .defineInRange("realityStoneChance", 0.15, 0.0, 1.0);
        INFINITY_POWER_CHANCE_MARS = b.comment("Chance for the Orb (Power Stone) in Ad Astra's Mars Temple chest (Morag) while it is unclaimed.")
                .defineInRange("powerStoneChanceMars", 0.5, 0.0, 1.0);
        INFINITY_POWER_CHANCE_OCEAN = b.comment("Without Ad Astra: chance for the Power Stone in large ocean ruin chests.")
                .defineInRange("powerStoneChanceOceanRuins", 0.15, 0.0, 1.0);
        INFINITY_EYE_CHANCE = b.comment("Chance for the sealed Eye of Agamotto in a Stronghold library chest while the Time Stone is unclaimed.")
                .defineInRange("eyeOfAgamottoChance", 0.35, 0.0, 1.0);
        INFINITY_VORMIR_DIMENSION = b.comment("Dimension that plays Vormir. Ad Astra's Glacio (Proxima Centauri) by default. If that dimension doesn't exist, high overworld peaks are used.")
                .define("vormirDimension", "ad_astra:glacio");
        INFINITY_VORMIR_MIN_Y = b.comment("Minimum Y on the Vormir dimension for the Stonekeeper to appear.")
                .defineInRange("vormirMinY", 70, -64, 320);
        INFINITY_VORMIR_FALLBACK_MIN_Y = b.comment("Fallback Vormir: minimum Y in the overworld (mountain peaks, at night).")
                .defineInRange("vormirFallbackMinY", 175, -64, 320);
        INFINITY_DORMAMMU_LOOPS = b.comment("Number of time loops after which Dormammu accepts the bargain and releases the Time Stone.")
                .defineInRange("dormammuLoopsToYield", 5, 1, 100);
        b.pop();

        b.comment("Doctor Doom. Doom does not tolerate rivals.").push("doom");
        DOOM_ENABLED = b.define("enabled", true);
        DOOM_SKILL_LEVEL = b.comment("FSang skill level that draws Doom's attention (0 disables this trigger).")
                .defineInRange("skillLevelTrigger", 30, 0, 1000);
        DOOM_NEMESES_DEFEATED = b.comment("Defeating this many different nemeses draws Doom's attention (0 disables this trigger).")
                .defineInRange("nemesesDefeatedTrigger", 3, 0, 100);
        DOOM_IMPOSTOR_TRIGGER = b.comment("Wearing FSang's Doctor Doom suit draws Doom's attention ('An impostor wears the mask of Doom!').")
                .define("impostorTrigger", true);
        DOOM_DAYS_AFTER_DOOMBOTS = b.comment("In-game days between destroying the Doombots and Doom arriving in person.")
                .defineInRange("daysAfterDoombots", 2, 0, 100);
        DOOM_REMATCH_DAYS = b.comment("Doom always returns. In-game days before he comes back after a defeat (0 = never).")
                .defineInRange("rematchDays", 40, 0, 10000);
        DOOM_DOOMBOT_COUNT = b.defineInRange("doombotCount", 3, 1, 10);
        b.pop();

        b.comment("Doomsday hunts Kryptonians.").push("doomsday");
        DOOMSDAY_ENABLED = b.define("enabled", true);
        DOOMSDAY_SKILL_LEVEL = b.comment("FSang skill level a Kryptonian needs before Doomsday breaks out of the earth.")
                .defineInRange("skillLevelTrigger", 15, 0, 1000);
        DOOMSDAY_RESURRECTIONS = b.comment("How many times Doomsday comes back from death (reactive evolution).")
                .defineInRange("resurrections", 1, 0, 10);
        DOOMSDAY_MAX_ADAPTATION = b.comment("Maximum resistance Doomsday can evolve against one kind of damage.")
                .defineInRange("maxAdaptation", 0.75, 0.0, 0.95);
        DOOMSDAY_ADAPTATION_PER_HIT = b.comment("Resistance gained against a damage kind every time it hurts him.")
                .defineInRange("adaptationPerHit", 0.035, 0.0, 1.0);
        KRYPTONIAN_POWERS = b.defineListAllowEmpty(List.of("kryptonianPowers"), () -> List.of("fsang:kryptonian*"), o -> o instanceof String);
        b.pop();

        b.comment("Zoom hunts speedsters to steal their speed.").push("zoom");
        ZOOM_ENABLED = b.define("enabled", true);
        ZOOM_SPEED_DISTANCE = b.comment("Blocks a speedster must cover at super speed before Zoom notices them (0 disables this trigger).")
                .defineInRange("speedDistanceTrigger", 25000, 0, 100000000);
        ZOOM_SKILL_LEVEL = b.comment("Alternative trigger: FSang skill level of a speedster (0 disables this trigger).")
                .defineInRange("skillLevelTrigger", 25, 0, 1000);
        SPEEDSTER_POWERS = b.defineListAllowEmpty(List.of("speedsterPowers"),
                () -> List.of("fsang:speedforce*", "fsang:savitar", "fsang:speedster_chem*", "fsang:negative_speedforce_chem"), o -> o instanceof String);
        b.pop();

        b.comment("The Sentinel program hunts mutants (X-Gene powers).").push("sentinels");
        SENTINELS_ENABLED = b.define("enabled", true);
        SENTINELS_SKILL_LEVEL = b.comment("FSang skill level at which a mutant shows up on the Sentinels' scanners.")
                .defineInRange("skillLevelTrigger", 10, 0, 1000);
        SENTINELS_RAID_INTERVAL_DAYS = b.comment("Average in-game days between Sentinel raids.")
                .defineInRange("raidIntervalDays", 4, 1, 1000);
        SENTINELS_BEFORE_MASTER_MOLD = b.comment("Sentinels a mutant has to destroy before Master Mold comes for them.")
                .defineInRange("sentinelsBeforeMasterMold", 6, 1, 1000);
        MUTANT_POWERS = b.defineListAllowEmpty(List.of("mutantPowers"), () -> List.of(
                "fsang:colossus", "fsang:colossus2", "fsang:cyclops", "fsang:teleportation", "fsang:storm", "fsang:wolverine",
                "fsang:wolverine2", "fsang:wolverine3", "fsang:phasing", "fsang:pyrokinesis", "fsang:electrokinesis",
                "fsang:cryokinesis", "fsang:angel", "fsang:self_detonation", "fsang:apocalypse", "fsang:invisibility",
                "fsang:regenerative_healing", "fsang:magnetism", "fsang:eye_mutation", "fsang:face_change", "fsang:triple_face",
                "fsang:darwin", "fsang:havok", "fsang:mimicry", "fsang:luck_mutation", "fsang:reality_warping", "fsang:gambit",
                "fsang:telepathy", "fsang:telekinesis", "fsang:sabretooth", "fsang:speed_mutation", "fsang:size_change",
                "fsang:forgetmenot", "fsang:sound_mutation", "fsang:vulcan", "fsang:telep_telek", "fsang:telep_col",
                "fsang:time", "fsang:leech_mutation"), o -> o instanceof String);
        b.pop();

        b.comment("The Spirit of Vengeance hunts the guilty. Uses FSang's 'fsang_karma' property.").push("ghost_rider");
        GHOST_RIDER_ENABLED = b.define("enabled", true);
        GHOST_RIDER_KARMA = b.comment("Karma at or below which the Spirit of Vengeance comes for you (killing villagers, golems and players lowers karma).")
                .defineInRange("karmaThreshold", -300, -1000000, 0);
        SPIRIT_OF_VENGEANCE_POWERS = b.comment("Powers that make you a Spirit of Vengeance yourself (exempt from being hunted).")
                .defineListAllowEmpty(List.of("spiritOfVengeancePowers"),
                        () -> List.of("fsang_secondary:spirit_of_vengeance", "fsang:spirit_of_vengence*", "fsang:penance"), o -> o instanceof String);
        b.pop();

        b.comment("Integration with other mods").push("compat");
        USE_FSANG_SUITS = b.comment("Bosses wear the matching FSang18's Heroes suit (Doom, Thanos, Loki, Zoom, Viltrumite uniforms...) when that mod is installed.")
                .define("useFsangSuits", true);
        JAM_PORTAL_GUNS = b.comment("Rick's Portal Gun (mod id 'ricksportalgun') can't be fired while a nemesis is hunting you nearby.")
                .define("jamPortalGuns", true);
        TESSERACT_REFUELS_PORTAL_GUNS = b.comment("Holding the Tesseract in your off hand slowly refuels a Rick's Portal Gun in your main hand.")
                .define("tesseractRefuelsPortalGuns", true);
        HULK_POWERS = b.comment("Powers that make you a Hulk (Loki takes double damage from them - 'Puny god.').")
                .defineListAllowEmpty(List.of("hulkPowers"), () -> List.of("fsang:hulk*"), o -> o instanceof String);
        b.pop();

        SPEC = b.build();
    }

    private EndgameConfig() {
    }

    /** True once the server config is loaded. Config values throw if read before that. */
    public static boolean isLoaded() {
        return SPEC.isLoaded();
    }
}
