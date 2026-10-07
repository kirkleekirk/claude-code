#!/usr/bin/env python3
"""
Writes the JSON data/asset files that are pure boilerplate: damage types and their tags, entity loot tables,
advancements, global loot modifiers, Ad Astra entity tags, recipes and item models.

Run from the project root:  python3 tools/generate_data.py
"""
import json
import os

MODID = "heroes_endgame"
RES = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src", "main", "resources")
DATA = os.path.join(RES, "data")
ASSETS = os.path.join(RES, "assets", MODID)


def write(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(obj, f, indent=2)
        f.write("\n")


# ======================================================================================================================
# Damage types
# ======================================================================================================================
DAMAGE_TYPES = {
    "nemesis": {}, "viltrumite": {}, "infinity": {}, "power_stone": {"effects": "burning"},
    "doom_sorcery": {}, "doom_tech": {}, "doomsday": {}, "speed_force": {}, "sentinel": {},
    "penance": {"effects": "burning"}, "hellfire": {"effects": "burning"}, "snap": {}, "dark_dimension": {"effects": "burning"},
    "telekinesis": {},
}
for name, extra in DAMAGE_TYPES.items():
    # scaling "never": nemesis damage is already solved exactly against the target, difficulty must not skew it.
    obj = {"message_id": f"{MODID}.{name}", "exhaustion": 0.1, "scaling": "never"}
    obj.update(extra)
    write(os.path.join(DATA, MODID, "damage_type", name + ".json"), obj)

# Internal damage that armour can't stop.
write(os.path.join(DATA, "minecraft", "tags", "damage_type", "bypasses_armor.json"),
      {"replace": False, "values": [f"{MODID}:snap", f"{MODID}:power_stone", f"{MODID}:hellfire"]})
write(os.path.join(DATA, "minecraft", "tags", "damage_type", "bypasses_enchantments.json"),
      {"replace": False, "values": [f"{MODID}:snap"]})
write(os.path.join(DATA, "minecraft", "tags", "damage_type", "bypasses_shield.json"),
      {"replace": False, "values": [f"{MODID}:snap", f"{MODID}:power_stone", f"{MODID}:hellfire", f"{MODID}:penance"]})
write(os.path.join(DATA, "minecraft", "tags", "damage_type", "no_knockback.json"),
      {"replace": False, "values": [f"{MODID}:snap", f"{MODID}:power_stone", f"{MODID}:hellfire"]})
write(os.path.join(DATA, "minecraft", "tags", "damage_type", "witch_resistant_to.json"),
      {"replace": False, "values": [f"{MODID}:doom_sorcery", f"{MODID}:dark_dimension"]})

# ======================================================================================================================
# Entity loot tables
# ======================================================================================================================


def item(name, lo=1, hi=1, chance=None):
    entry = {"type": "minecraft:item", "name": name}
    functions = []
    if lo != 1 or hi != 1:
        functions.append({"function": "minecraft:set_count", "count": {"type": "minecraft:uniform", "min": lo, "max": hi}})
    if functions:
        entry["functions"] = functions
    pool = {"rolls": 1, "entries": [entry]}
    if chance is not None:
        pool["conditions"] = [{"condition": "minecraft:random_chance", "chance": chance}]
    return pool


def table(*pools):
    return {"type": "minecraft:entity", "pools": list(pools)}


M = MODID
LOOT = {
    "viltrumite_enforcer": table(item(f"{M}:viltrumite_sigil"), item("minecraft:diamond", 1, 3)),
    "conquest": table(item(f"{M}:conquest_medal"), item("minecraft:diamond", 2, 5), item("minecraft:netherite_scrap", 1, 2)),
    "thragg": table(item(f"{M}:regent_crest"), item("minecraft:netherite_ingot"), item("minecraft:diamond", 4, 8)),
    "loki": table(item("minecraft:emerald", 4, 8), item("minecraft:golden_apple")),
    "chitauri": table(item("minecraft:iron_nugget", 0, 3), item("minecraft:amethyst_shard", 1, 1, 0.15)),
    "ebony_maw": table(item(f"{M}:black_order_insignia"), item("minecraft:diamond", 1, 3)),
    "cull_obsidian": table(item(f"{M}:black_order_insignia"), item("minecraft:diamond", 1, 3), item("minecraft:crying_obsidian", 2, 6)),
    "proxima_midnight": table(item(f"{M}:black_order_insignia"), item("minecraft:diamond", 1, 3)),
    "corvus_glaive": table(item(f"{M}:black_order_insignia"), item("minecraft:diamond", 1, 3)),
    "thanos": table(item("minecraft:netherite_ingot", 2, 2), item("minecraft:enchanted_golden_apple"), item("minecraft:diamond", 8, 16)),
    "mindless_one": table(item("minecraft:blaze_powder", 0, 2), item("minecraft:magma_cream", 0, 1)),
    "doombot": table(item(f"{M}:doombot_core"), item("minecraft:iron_ingot", 2, 5), item("minecraft:redstone", 4, 8)),
    "doctor_doom": table(item(f"{M}:doom_mask"), item("minecraft:netherite_ingot"), item("minecraft:diamond", 4, 8)),
    "doomsday": table(item(f"{M}:doomsday_bone", 1, 2), item("minecraft:netherite_scrap", 2, 4)),
    "zoom": table(item(f"{M}:velocity_9", 1, 3), item("minecraft:glowstone_dust", 4, 8)),
    "sentinel": table(item(f"{M}:sentinel_eye"), item("minecraft:iron_ingot", 4, 8), item("minecraft:redstone", 4, 10)),
    "master_mold": table(item(f"{M}:master_mold_core"), item("minecraft:netherite_ingot", 2, 2), item("minecraft:iron_block", 2, 4)),
    "ghost_rider": table(item(f"{M}:penance_chain"), item("minecraft:blaze_rod", 2, 4)),
}
for name, obj in LOOT.items():
    write(os.path.join(DATA, MODID, "loot_tables", "entities", name + ".json"), obj)
for name in ("illusion", "stonekeeper", "dormammu"):
    write(os.path.join(DATA, MODID, "loot_tables", "entities", name + ".json"), {"type": "minecraft:entity", "pools": []})

# ======================================================================================================================
# Global loot modifiers: where the Infinity Stones hide
# ======================================================================================================================
GLM = {
    "space_stone_end_city": ("minecraft:chests/end_city_treasure", "space_stone", "space", None, None),
    "reality_stone_ancient_city": ("minecraft:chests/ancient_city", "reality_stone", "reality", None, None),
    "power_stone_mars_temple": ("ad_astra:chests/temple/mars/temple", "power_stone", "power_mars", "ad_astra", None),
    "power_stone_ocean_ruins": ("minecraft:chests/underwater_ruin_big", "power_stone", "power_ocean", None, "ad_astra"),
    "eye_of_agamotto_stronghold": ("minecraft:chests/stronghold_library", "sealed_eye_of_agamotto", "eye", None, None),
}
for name, (table_id, reward, chance, requires, forbids) in GLM.items():
    obj = {
        "type": f"{MODID}:infinity_loot",
        "conditions": [{"condition": "forge:loot_table_id", "loot_table_id": table_id}],
        "reward": reward,
        "chance": chance,
    }
    if requires:
        obj["requires_mod"] = requires
    if forbids:
        obj["forbids_mod"] = forbids
    write(os.path.join(DATA, MODID, "loot_modifiers", name + ".json"), obj)
write(os.path.join(DATA, "forge", "loot_modifiers", "global_loot_modifiers.json"),
      {"replace": False, "entries": [f"{MODID}:{n}" for n in GLM]})

# ======================================================================================================================
# Ad Astra: nemeses follow you into space
# ======================================================================================================================
LIVING = ["viltrumite_enforcer", "conquest", "thragg", "loki", "illusion", "chitauri", "ebony_maw", "cull_obsidian",
          "proxima_midnight", "corvus_glaive", "thanos", "stonekeeper", "dormammu", "mindless_one", "doombot",
          "doctor_doom", "doomsday", "zoom", "sentinel", "master_mold", "ghost_rider"]
for tag in ("lives_without_oxygen", "can_survive_in_space", "can_survive_extreme_cold", "can_survive_extreme_heat",
            "can_survive_in_acid_rain"):
    write(os.path.join(DATA, "ad_astra", "tags", "entity_types", tag + ".json"),
          {"replace": False, "values": [{"id": f"{MODID}:{e}", "required": False} for e in LIVING]})
write(os.path.join(DATA, "minecraft", "tags", "entity_types", "freeze_immune_entity_types.json"),
      {"replace": False, "values": [f"{MODID}:{e}" for e in LIVING]})

# ======================================================================================================================
# Recipes
# ======================================================================================================================
gauntlet_pattern = [" U ", "UNU", "GUG"]
write(os.path.join(DATA, MODID, "recipes", "infinity_gauntlet_uru.json"), {
    "conditions": [{"type": "forge:mod_loaded", "modid": "fsang"}],
    "type": "minecraft:crafting_shaped",
    "category": "equipment",
    "pattern": gauntlet_pattern,
    "key": {"U": {"item": "fsang:uru_ingot"}, "N": {"item": "minecraft:nether_star"}, "G": {"item": "minecraft:gold_block"}},
    "result": {"item": f"{MODID}:infinity_gauntlet"},
})
write(os.path.join(DATA, MODID, "recipes", "infinity_gauntlet.json"), {
    "conditions": [{"type": "forge:not", "value": {"type": "forge:mod_loaded", "modid": "fsang"}}],
    "type": "minecraft:crafting_shaped",
    "category": "equipment",
    "pattern": gauntlet_pattern,
    "key": {"U": {"item": "minecraft:netherite_ingot"}, "N": {"item": "minecraft:nether_star"}, "G": {"item": "minecraft:gold_block"}},
    "result": {"item": f"{MODID}:infinity_gauntlet"},
})
write(os.path.join(DATA, MODID, "recipes", "watcher_log.json"), {
    "type": "minecraft:crafting_shapeless",
    "category": "misc",
    "ingredients": [{"item": "minecraft:book"}, {"item": "minecraft:ender_eye"}, {"item": "minecraft:spyglass"}],
    "result": {"item": f"{MODID}:watcher_log"},
})

# ======================================================================================================================
# Advancements ("endgame goals")
# ======================================================================================================================


def adv(path, parent, icon, frame="task", hidden=False, xp=0, background=None, toast=True, chat=True):
    display = {
        "icon": {"item": icon},
        "title": {"translate": f"advancements.{MODID}.{path.replace('/', '.')}.title"},
        "description": {"translate": f"advancements.{MODID}.{path.replace('/', '.')}.description"},
        "frame": frame,
        "show_toast": toast,
        "announce_to_chat": chat,
        "hidden": hidden,
    }
    if background:
        display["background"] = background
    obj = {"display": display, "criteria": {"granted_by_code": {"trigger": "minecraft:impossible"}}}
    if parent:
        obj["parent"] = f"{MODID}:{parent}"
    if xp:
        obj["rewards"] = {"experience": xp}
    write(os.path.join(DATA, MODID, "advancements", path + ".json"), obj)


write(os.path.join(DATA, MODID, "advancements", "root.json"), {
    "display": {
        "icon": {"item": f"{MODID}:watcher_log"},
        "title": {"translate": f"advancements.{MODID}.root.title"},
        "description": {"translate": f"advancements.{MODID}.root.description"},
        "frame": "task", "show_toast": False, "announce_to_chat": False, "hidden": False,
        "background": "minecraft:textures/block/crying_obsidian.png",
    },
    "criteria": {"tick": {"trigger": "minecraft:tick"}},
})
adv("nemesis/viltrumite_trial", "root", f"{MODID}:viltrumite_sigil", "goal", xp=200)
adv("nemesis/conquest", "nemesis/viltrumite_trial", f"{MODID}:conquest_medal", "goal", xp=400)
adv("nemesis/thragg", "nemesis/conquest", f"{MODID}:regent_crest", "challenge", xp=800)
adv("first_stone", "root", f"{MODID}:space_stone", "task", xp=50)
adv("nemesis/loki", "first_stone", f"{MODID}:mind_stone", "goal", xp=200)
adv("puny_god", "nemesis/loki", "minecraft:green_dye", "challenge", hidden=True, xp=100)
adv("nemesis/black_order", "nemesis/loki", f"{MODID}:black_order_insignia", "goal", xp=300)
adv("soul_for_a_soul", "first_stone", f"{MODID}:soul_stone", "goal", xp=300)
adv("nemesis/dormammu", "first_stone", f"{MODID}:time_stone", "goal", xp=300)
adv("perfectly_balanced", "first_stone", f"{MODID}:infinity_gauntlet", "challenge", xp=500)
adv("nemesis/thanos", "nemesis/black_order", f"{MODID}:power_stone", "challenge", xp=1000)
adv("snap", "perfectly_balanced", f"{MODID}:reality_stone", "challenge", xp=200)
adv("bring_them_back", "snap", "minecraft:totem_of_undying", "challenge", hidden=True, xp=500)
adv("nemesis/doombots", "root", f"{MODID}:doombot_core", "task", xp=100)
adv("nemesis/doctor_doom", "nemesis/doombots", f"{MODID}:doom_mask", "challenge", xp=800)
adv("nemesis/doomsday", "root", f"{MODID}:doomsday_bone", "challenge", xp=700)
adv("nemesis/zoom", "root", f"{MODID}:velocity_9", "goal", xp=400)
adv("nemesis/sentinels", "root", f"{MODID}:sentinel_eye", "task", xp=100)
adv("nemesis/master_mold", "nemesis/sentinels", f"{MODID}:master_mold_core", "challenge", xp=700)
adv("nemesis/ghost_rider", "root", f"{MODID}:penance_chain", "goal", xp=300)
adv("endgame", "root", "minecraft:nether_star", "challenge", xp=2000)

# Invisible per-boss kill advancements (handy for quest packs: heroes_endgame:kills/<entity>)
for e in LIVING:
    write(os.path.join(DATA, MODID, "advancements", "kills", e + ".json"),
          {"criteria": {"granted_by_code": {"trigger": "minecraft:impossible"}}})

# ======================================================================================================================
# Item models
# ======================================================================================================================


def generated(name, texture=None):
    write(os.path.join(ASSETS, "models", "item", name + ".json"),
          {"parent": "minecraft:item/generated", "textures": {"layer0": f"{MODID}:item/{texture or name}"}})


for stone in ("space", "mind", "reality", "power", "time", "soul"):
    generated(stone + "_stone")
for name in ("sealed_eye_of_agamotto", "watcher_log", "viltrumite_sigil", "conquest_medal", "regent_crest",
             "black_order_insignia", "doombot_core", "doom_mask", "doomsday_bone", "sentinel_eye", "master_mold_core",
             "penance_chain", "velocity_9", "infinity_gauntlet_partial", "infinity_gauntlet_full"):
    generated(name)
write(os.path.join(ASSETS, "models", "item", "infinity_gauntlet.json"), {
    "parent": "minecraft:item/handheld",
    "textures": {"layer0": f"{MODID}:item/infinity_gauntlet"},
    "overrides": [
        {"predicate": {f"{MODID}:stones": 0.1}, "model": f"{MODID}:item/infinity_gauntlet_partial"},
        {"predicate": {f"{MODID}:stones": 1.0}, "model": f"{MODID}:item/infinity_gauntlet_full"},
    ],
})
for egg in ("viltrumite_enforcer", "conquest", "thragg", "loki", "chitauri", "ebony_maw", "cull_obsidian",
            "proxima_midnight", "corvus_glaive", "thanos", "stonekeeper", "dormammu", "mindless_one", "doombot",
            "doctor_doom", "doomsday", "zoom", "sentinel", "master_mold", "ghost_rider"):
    write(os.path.join(ASSETS, "models", "item", egg + "_spawn_egg.json"), {"parent": "minecraft:item/template_spawn_egg"})

print("data written to", os.path.normpath(RES))
