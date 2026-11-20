import type { MissionId } from '@/content/ids';
import { MISSIONS } from '@/content/missions';
import type { Bot } from './bot';

/**
 * Story missions as a player runs them: briefings, drives, set-pieces (played for a while, sometimes
 * failed and retried), deliveries and choices. Missions the bot cannot finish yet (no product, no
 * cash) are set aside for a few minutes, as a player would.
 */

const SET_ASIDE = 300;

function pick(bot: Bot): MissionId | null {
  const sim = bot.sim;
  if (sim.state.missions.active) return sim.state.missions.active;
  const now = sim.state.time;
  let later: MissionId | null = null;
  for (const id of Object.keys(sim.state.missions.progress) as MissionId[]) {
    const s = sim.state.missions.progress[id].status;
    if ((s !== 'available' && s !== 'failed') || (bot.missionCooldown.get(id) ?? 0) > now) continue;
    const r = sim.cmd.missionStart(id);
    if (r.ok) return id;
    if (r.error === 'closed') later ??= id;
  }
  // Only a time-window mission is left: some players rest at home until it opens.
  const window = later ? MISSIONS[later].window : undefined;
  if (later && window && bot.rng.chance(bot.profile.restForMissions)) {
    bot.go('ofelias');
    bot.ui(4);
    if (sim.waitUntil(window[0] + 0.25).seconds > 0) {
      bot.syncClock();
      if (sim.cmd.missionStart(later).ok) return later;
    }
  }
  return null;
}

function setAside(bot: Bot, id: MissionId, reason: string, seconds = SET_ASIDE): void {
  bot.sim.cmd.missionFail(id, reason);
  bot.missionCooldown.set(id, bot.sim.state.time + seconds);
}

function choose(bot: Bot, id: MissionId, options: ReadonlyArray<{ id: string }>): string {
  const d = bot.sim.state.money.debt;
  if (id === 'paidInFull') return bot.afford(d.principal - d.paid) ? 'pay' : d.respect >= 60 ? 'partner' : 'defy';
  if (id === 'podcast') return 'zenith';
  if (id === 'morningAfter') return bot.kind === 'riskTaker' ? 'crown' : 'legit';
  return options[0]!.id;
}

/** Deliver a mission's request: pack the right tier, drive to the buyer, sell. */
function deliver(bot: Bot, id: MissionId, tier: string): boolean {
  const sim = bot.sim;
  const index = sim.state.missions.progress[id].objective;
  for (let tries = 0; tries < 6; tries++) {
    const req = sim.state.requests.find((r) => r.mission === id && r.status === 'accepted');
    if (!req) return sim.state.missions.active !== id || sim.state.missions.progress[id].objective !== index;
    if (bot.bagTier(tier) < req.wants.qty) bot.packFromStash();
    if (bot.bagTier(tier) < 1) return false;
    bot.go(req.place);
    const deal = sim.cmd.openDeal({ request: req.id });
    if (!deal.ok || !bot.sell(deal.value.id)) return false;
  }
  return true;
}

export function playMission(bot: Bot): void {
  const sim = bot.sim;
  const id = pick(bot);
  if (!id) return;
  const def = MISSIONS[id];
  bot.ui(15); // briefing
  let last = -1;
  for (let guard = 0; guard < 16 && sim.state.missions.active === id; guard++) {
    const index = sim.state.missions.progress[id].objective;
    const obj = def.objectives[index];
    if (!obj) break;
    if (index === last) return setAside(bot, id, 'stuck');
    last = index;
    if (obj.kind === 'goto' || obj.kind === 'talk') {
      bot.go(obj.place);
      bot.ui(obj.kind === 'talk' ? 30 : 8);
      sim.cmd.objectiveDone(id, index);
    } else if (obj.kind === 'setpiece' || obj.kind === 'escape') {
      if (obj.kind === 'setpiece' && obj.place) bot.go(obj.place);
      const time = obj.kind === 'escape' ? bot.profile.missionTime * 0.4 : bot.profile.missionTime;
      bot.busy = true;
      bot.wait(time, true);
      if (bot.rng.chance(bot.kind === 'casual' ? 0.25 : 0.1)) {
        sim.cmd.missionFail(id, 'set-piece failed');
        bot.ui(10);
        sim.cmd.missionRetry(id);
        bot.wait(time * 0.6, true);
      }
      bot.busy = false;
      sim.cmd.objectiveDone(id, sim.state.missions.progress[id].objective);
    } else if (obj.kind === 'deliver') {
      if (!deliver(bot, id, obj.tier ?? 'bloom')) return setAside(bot, id, 'not enough product');
    } else if (obj.kind === 'harvest') {
      return setAside(bot, id, 'waiting for a harvest', 120);
    } else if (obj.kind === 'buyFront') {
      if (!sim.cmd.buyFront(obj.front).ok) {
        bot.saveFor = Math.max(bot.saveFor, sim.content.fronts[obj.front].price * 1.1);
        return setAside(bot, id, 'cannot afford', 600);
      }
      bot.saveFor = 0;
      bot.ui(10);
    } else if (obj.kind === 'pay') {
      const short = obj.amount - sim.state.money.debt.paid;
      if (short > 0 && !(sim.state.money.dirty >= short && sim.cmd.payDebt(short, 'dirty').ok)) return setAside(bot, id, 'cannot pay', 600);
    } else if (obj.kind === 'choice') {
      bot.ui(20);
      if (!sim.cmd.missionComplete(id, choose(bot, id, obj.options)).ok) return setAside(bot, id, 'choice blocked');
    }
  }
}
