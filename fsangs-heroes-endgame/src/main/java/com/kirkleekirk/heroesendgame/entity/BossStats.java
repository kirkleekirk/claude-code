package com.kirkleekirk.heroesendgame.entity;

/**
 * Tuning numbers for a nemesis.
 *
 * @param baseHealth    minimum health, no matter how weak the hunted player is
 * @param baseDamage    minimum damage per normal hit (also used against non-players)
 * @param hitsToKill    how many normal hits it takes to kill the hunted player from full health
 * @param fightSeconds  how long the hunted player should need to bring it down
 * @param damageCap     max fraction of its health a single hit can remove (stops one-shot powers)
 * @param armor         armor attribute
 * @param speed         movement speed attribute (ground) / base flight speed (blocks per tick) for flyers
 */
public record BossStats(double baseHealth, double baseDamage, float hitsToKill, float fightSeconds,
                        float damageCap, double armor, double speed) {
}
