// Endgame: the Crown (military) and the Ledger (political). Sandbox continues after credits.
import { COUNCIL_SEATS, SEATS_NEEDED, SEAT_COST } from '../data/businesses.js';
import { log, fx, stat, spend, addRep, rank, D, journal } from './state.js';
import { holds } from './jobs.js';
import { cleanAssets } from './business.js';
import { planRaid } from './rivals.js';
import { onJob, combatPower } from './crew.js';
import { rchance } from '../core/rng.js';

export const LEDGER_ASSETS = 2000000;

export function crownReady(S) {
  if (rank(S) < 5) return 'Kingpin rank required.';
  if (holds(S).length < 3) return `Hold 3 settlements (now ${holds(S).length}).`;
  if (S.defense) return 'Deal with the current threat first.';
  if (S.compact.daybreak === 'pending' || S.compact.daybreak === 'repelled') return null;
  if (S.compact.daybreak === 'failed' && S.day < (S.compact.daybreakRetry || 0)) return `The Compact regroups until day ${S.compact.daybreakRetry}.`;
  return null;
}

export function declareCrown(S) {
  const why = crownReady(S);
  if (why) return { ok: false, msg: why };
  if (S.compact.daybreak === 'repelled') return { ok: false, msg: 'Daybreak is already broken. Storm the Council Hall.' };
  S.compact.daybreak = 'pending';
  const power = 70 * D(S).enemy * (1 + S.notoriety / 200);
  planRaid(S, 'compact', power, { daybreak: true, waves: 3, hour: 5 });
  S.defense.name = 'Operation Daybreak';
  journal(S, `Declared yourself against the Council on day ${S.day}. Operation Daybreak is coming.`);
  log(S, 'You declared war on the Council. OPERATION DAYBREAK will siege the Hollow at dawn tomorrow: 3 waves.', 'rank');
  fx(S, 'daybreak');
  return { ok: true, msg: 'The Compact is coming.' };
}

export function councilAssaultReady(S) { return S.compact.daybreak === 'repelled' && !S.ending; }

// Abstract council assault (headless / delegated finale).
export function assaultCouncilAbstract(S, ids) {
  const crew = ids.length ? ids : onJob(S, 'squad').map((c) => c.id);
  const power = crew.reduce((a, id) => a + combatPower(S, S.crew.find((c) => c.id === id)), 0) + 30 + S.level * 2;
  const ok = rchance(S, Math.max(0.15, Math.min(0.9, power / (110 * D(S).enemy))));
  if (ok) winEnding(S, 'crown');
  else log(S, 'The Council Hall assault failed. Regroup and try again.', 'bad');
  return ok;
}

export function seatPrice(S) { return SEAT_COST(S.compact.seats); }

export function buySeat(S) {
  if (rank(S) < 5) return { ok: false, msg: 'Only a Kingpin gets an audience with the Council.' };
  if (S.compact.seats >= COUNCIL_SEATS) return { ok: false, msg: 'Every seat is yours.' };
  const c = seatPrice(S);
  if (S.favors < c.favors) return { ok: false, msg: `Seat ${S.compact.seats + 1} needs ${c.favors} favors.` };
  if (!spend(S, 'clean', c.clean, 'council')) return { ok: false, msg: `Seat ${S.compact.seats + 1} costs $${c.clean} clean.` };
  S.favors -= c.favors;
  S.compact.seats++;
  S.goodwill = Math.min(100, S.goodwill + 4);
  stat(S, 'seats');
  log(S, `A councillor now votes your way (${S.compact.seats}/${SEATS_NEEDED}).`, 'good');
  return { ok: true, msg: `Seat ${S.compact.seats} bought.` };
}

export function ledgerReady(S) {
  if (rank(S) < 5) return 'Kingpin rank required.';
  if (holds(S).length < 3) return `Hold 3 settlements (now ${holds(S).length}).`;
  if (cleanAssets(S) < LEDGER_ASSETS) return `Clean assets $${Math.round(cleanAssets(S)).toLocaleString()} / $2,000,000.`;
  if (S.compact.seats < SEATS_NEEDED) return `Council seats ${S.compact.seats}/${SEATS_NEEDED}.`;
  return null;
}

export function legalize(S) {
  const why = ledgerReady(S);
  if (why) return { ok: false, msg: why };
  winEnding(S, 'ledger');
  return { ok: true, msg: 'The Council votes. Your empire is legal.' };
}

export function winEnding(S, which) {
  if (S.ending) { S.flags[which === 'crown' ? 'endCrown' : 'endLedger'] = true; return; }
  S.ending = which;
  S.flags[which === 'crown' ? 'endCrown' : 'endLedger'] = true;
  addRep(S, 500, which === 'crown' ? 'The Crown' : 'The Ledger');
  journal(S, which === 'crown' ? `Day ${S.day}: Chancellor Hale fell. The Crown is yours.` : `Day ${S.day}: the Council legalized your empire. The Ledger balances.`);
  stat(S, 'endings');
  fx(S, 'ending', { which });
}

export function enterSandbox(S) { S.sandbox = true; log(S, 'Sandbox: every system stays live. The wastes are yours.', 'info'); }
