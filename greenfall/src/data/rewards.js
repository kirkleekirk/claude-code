// Match rewards. Shared by the game (offline mode) and the server (online mode) so both
// always agree on what a match is worth.
export const REWARD_CAPS = { quick: 900, standard: 1800, marathon: 3600 };
export function computeRewards(r) {
  const mins = Math.max(0, r.time) / 60;
  const extracted = r.outcome === 'extracted';
  const loot = extracted ? Math.max(0, Math.min(2000, r.loot || 0)) : 0;
  const shards = Math.round(40 + r.kills * 30 + r.zombieKills * 1.5 + mins * 3 + (extracted ? 350 + loot : 0) + (r.outcome === 'left' ? 60 : 0));
  const xp = Math.round(120 + r.kills * 80 + r.zombieKills * 6 + mins * 25 + (extracted ? 900 : 0) + (r.boarded || 0) * 10 + (r.searched || 0) * 4);
  return { shards, xp };
}
export function xpForLevel(l) { return 600 + l * 150; }
export function applyXp(profile, xp) {
  profile.xp += xp;
  let ups = 0;
  while (profile.xp >= xpForLevel(profile.level)) { profile.xp -= xpForLevel(profile.level); profile.level++; ups++; profile.shards += 100; }
  return ups;
}
