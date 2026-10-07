package com.kirkleekirk.heroesendgame.weapon;

import com.kirkleekirk.heroesendgame.weapon.stats.WeaponDefinition;

/** Implemented by every item the gunsmith can modify (guns and melee weapons). */
public interface WeaponItem {
    WeaponDefinition weaponDefinition();
}
