// The game modes and difficulties, as the later CastleMiner Z has them (its GameModeMenu and
// DifficultyLevelScreen, and what its code does with them), in one place:
//
//   Endurance          a new world every time, never kept; the awards and stats count only here
//   Survival           a world of your own, kept; a difficulty to choose
//   Dragon Endurance   your world, kept, and wave after wave of dragons (unlocked by killing the
//                      Undead Dragon in Endurance)
//   Creative           Survival with nothing used up (in the original, Survival with its
//                      InfiniteResourceMode on; here it isn't locked behind a promotional code)
//
// The difficulties (Survival and Creative; the other two play as Easy, as the original sets them):
// No Enemies, Easy, Normal and Hardcore.

export const MODES = {
  endurance: { name: 'Endurance', desc: 'Earn awards by seeing how far you can travel from the start point. Changes to the world will not be saved in this mode.' },
  survival: { name: 'Survival', desc: 'Mine resources and build your fortress while defending yourself from the undead horde. Your creations will be saved in this mode. You can play with or without enemies.' },
  dragon: { name: 'Dragon Endurance', desc: 'Fend off wave after wave of dragons. Unlock this mode by defeating the undead dragon in Endurance Mode. Your creations will be saved in this mode.' },
  creative: { name: 'Creative', desc: 'Build structures with unlimited resources. You can play with or without enemies.' },
};

export const DIFFICULTIES = {
  noenemies: { name: 'No Enemies', desc: 'Build freely without enemy attacks.' },
  easy: { name: 'Easy', desc: 'Enemies do less damage. Zombies only appear at night. Dragons will not damage your structures.' },
  normal: { name: 'Normal', desc: 'Enemies appear when you cover fresh ground and swarm at night. Dragons will damage your structures.' },
  hardcore: { name: 'Hardcore', desc: 'Start with nothing and drop all items when you die.' },
};

// the name a game goes by (Creative is Survival with nothing used up)
export function modeName(g) {
  if (g.creative) return MODES.creative.name;
  return MODES[g.mode]?.name ?? MODES.endurance.name;
}

// The rules, by what the original checks (g: anything with mode, difficulty and creative).
export const RULES = {
  // EnemyManager.OnUpdate: no one comes at all
  noEnemies: (g) => g.difficulty === 'noenemies',
  // the dead for new ground (every 40 m further out): Endurance, or a Normal or Hardcore game
  freshGround: (g) => g.mode === 'endurance' || g.difficulty === 'normal' || g.difficulty === 'hardcore',
  // GetMinEnemySpawnTime: the quick waits (5 s down to 1 s further out) or the slow (45 down to 20)
  quickSpawns: (g) => g.mode === 'endurance' || g.mode === 'dragon' || g.difficulty === 'normal' || g.difficulty === 'hardcore',
  // Dragon Endurance: no dead on the surface, only the dragons (and what's underground)
  surfaceDead: (g) => g.mode !== 'dragon',
  // the original's world isn't kept in Endurance
  kept: (g) => g.mode !== 'endurance',
  // the awards and stats: Endurance only (and not in Creative, which can't be Endurance)
  counts: (g) => g.mode === 'endurance' && !g.creative,
  // the in-game Teleport menu: not in Endurance, nor on Hardcore
  teleport: (g) => g.mode !== 'endurance' && g.difficulty !== 'hardcore',
  // dying: everything you carry falls, and you start again with nothing
  hardcore: (g) => g.difficulty === 'hardcore',
};
