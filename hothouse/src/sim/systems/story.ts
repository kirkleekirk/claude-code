import { fail, ok } from '@/core/types';
import type { ContactId, CustomerId } from '@/content/ids';
import { HINTS, IDLE_NOTES } from '@/content/notes';
import { PROLOGUE_DELAYS, PROLOGUE_TEXTS } from '@/content/prologue';
import { rankDef } from '@/content/ranks';
import { NEWS } from '@/content/texts';
import type { MessageId, PrologueStatus, RequestState, SimResult, StoryBeat } from '../api';
import type { SimCtx } from '../ctx';
import { t } from '../strings';
import { createRequest, replyRequest, unlockCustomer } from './customers';
import { addXp } from './progression';

/** The scripted first ten minutes, story texts, chips and the Herald's headlines. */

const START_CUSTOMERS: readonly CustomerId[] = ['gus', 'tiffani', 'zeke', 'jojo'];

function step(ctx: SimCtx) {
  return ctx.content.prologue[ctx.state.story.prologue] ?? null;
}

export function prologueDone(ctx: SimCtx): boolean {
  return ctx.state.story.beats.prologueDone !== undefined;
}

export function prologueStatus(ctx: SimCtx): PrologueStatus {
  const s = ctx.state.story;
  const cur = step(ctx);
  const done = prologueDone(ctx);
  return {
    step: s.prologue,
    beat: cur ? (cur.beat as StoryBeat) : null,
    objective: done || !cur ? '' : cur.objective,
    place: done || !cur ? null : cur.place,
    hint: done || !cur ? null : cur.hint,
    clockPinned: !done && s.beats.duskFalls === undefined && (cur?.pinned ?? false),
    done,
  };
}

/** Side effects of finishing a prologue step, whether it finished now or earlier out of order. */
function completeStep(ctx: SimCtx, beat: string): void {
  if (beat === 'kikiDelivered') ctx.text('kiki', 'kiki', PROLOGUE_TEXTS.kikiThanks);
  if (beat === 'secondDelivered') {
    ctx.text('marisol', 'marisol', PROLOGUE_TEXTS.marisolThanks);
    // The scripted pacing anchor: Rank 2 lands right here.
    const need = rankDef(2).xp - ctx.state.progression.xp;
    if (need > 0) addXp(ctx, need + 5, 'prologue');
  }
  if (beat === 'brandNamed') ctx.beat('duskFalls');
}

/** Enter the next step; auto-complete steps whose beat already happened (any order works). */
function advance(ctx: SimCtx): void {
  const s = ctx.state.story;
  for (let guard = 0; guard < 20; guard++) {
    s.prologue += 1;
    s.prologueStepAt = ctx.now;
    ctx.bump('story');
    const cur = step(ctx);
    if (!cur) return;
    onEnterStep(ctx, cur.beat);
    if (s.beats[cur.beat as StoryBeat] === undefined) return;
    completeStep(ctx, cur.beat);
  }
}

function onEnterStep(ctx: SimCtx, beat: string): void {
  if (beat === 'dripBought') ctx.beat('dripPitch');
}

/** Called for every story beat (via `ctx.onBeat`). */
export function onBeat(ctx: SimCtx, beat: StoryBeat): void {
  const cur = step(ctx);
  if (!prologueDone(ctx) && cur && cur.beat === beat) {
    completeStep(ctx, beat);
    advance(ctx);
  }
  if (beat === 'brandNamed') addNews(ctx, NEWS.brand.replace('{brand}', ctx.state.brand?.name ?? ''));
  if (beat === 'prologueDone') onPrologueDone(ctx);
}

function onPrologueDone(ctx: SimCtx): void {
  for (const id of START_CUSTOMERS) unlockCustomer(ctx, id, 'start');
  const m = ctx.state.missions.progress;
  m.inheritance.status = 'done';
  m.inheritance.completedAt = ctx.now;
  m.paella.status = 'available';
  ctx.state.missions.active = null;
  ctx.emit('sim:mission', { mission: 'inheritance', status: 'done', objective: 0 });
  ctx.emit('sim:mission', { mission: 'paella', status: 'available', objective: 0 });
  ctx.bump('missions', 'customers');
}

/** Called for request acceptance, purchases and so on (via `ctx.onAction`). */
export function onStoryAction(ctx: SimCtx, action: string, data: unknown): void {
  if (action === 'requestAccepted') {
    const r = data as RequestState;
    if (r.story === 'kikiDelivered') ctx.beat('kikiAccepted');
    if (r.story === 'secondDelivered') ctx.beat('secondAccepted');
  }
}

export function onRankStory(ctx: SimCtx, rank: number): void {
  if (rank === 2) ctx.beat('rank2');
  if (rank === 3) addNews(ctx, NEWS.rank3);
  if (rank === 5) addNews(ctx, NEWS.rank5);
  if (rank === 7) addNews(ctx, NEWS.rank7);
  if (rank === 9) {
    addNews(ctx, NEWS.rank9);
    ctx.beat('hurricaneWatch');
  }
}

/** Timed prologue texts. */
export function tickStory(ctx: SimCtx): void {
  const s = ctx.state.story;
  const f = s.flags;
  if (!f.syWelcome && ctx.now >= PROLOGUE_DELAYS.syWelcome) {
    f.syWelcome = true;
    ctx.text('sy', 'sy', PROLOGUE_TEXTS.syWelcome, { kind: 'story' });
    addNews(ctx, NEWS.start);
  }
  if (prologueDone(ctx)) return;
  const cur = step(ctx);
  if (!cur) return;
  const since = ctx.now - s.prologueStepAt;
  if (cur.beat === 'kikiAccepted' && !f.kikiTexted && since >= PROLOGUE_DELAYS.kikiText) {
    f.kikiTexted = true;
    unlockCustomer(ctx, 'kiki', 'story');
    createRequest(ctx, 'kiki', {
      effects: ['sunkissed'], qty: 2, tier: 'bloom', place: 'boardwalk', offer: 70, life: null, story: 'kikiDelivered',
      text: PROLOGUE_TEXTS.kiki, kind: 'busker',
    });
    ctx.beat('kikiText');
  }
  if (cur.beat === 'secondAccepted' && !f.marisolTexted && since >= PROLOGUE_DELAYS.marisolText) {
    f.marisolTexted = true;
    unlockCustomer(ctx, 'marisol', 'story');
    createRequest(ctx, 'marisol', {
      effects: ['mellowTide'], qty: 3, tier: 'bloom', place: 'palmettoPlaza', offer: 105, life: null, story: 'secondDelivered',
      text: PROLOGUE_TEXTS.marisol, kind: 'driveBy',
    });
    ctx.beat('secondCustomer');
  }
  if (cur.timeout !== undefined && since >= cur.timeout && s.beats[cur.beat as StoryBeat] === undefined) {
    // Soft step: the objective stays a suggestion and the story moves on.
    advance(ctx);
    return;
  }
  if (cur.beat === 'valeText' && !f.valeTexted && since >= PROLOGUE_DELAYS.valeText) {
    f.valeTexted = true;
    ctx.text('vale', 'vale', PROLOGUE_TEXTS.vale, { kind: 'story' });
    ctx.beat('valeText');
    ctx.beat('prologueDone');
  }
}

// ── messages ────────────────────────────────────────────────────────────────

export function replyChip(ctx: SimCtx, messageId: MessageId, chip: string): SimResult {
  const found = ctx.findMessage(messageId);
  if (!found) return fail('notFound');
  const m = found.message;
  if (!m.chips || !m.chips.some((c) => c.id === chip)) return fail('invalid');
  if (m.chosen) return fail('alreadyDone', t('alreadyDone'));
  if (m.request) {
    const r = replyRequest(ctx, m.request, chip as 'accept' | 'counter' | 'decline');
    if (!r.ok) return r;
    m.chosen = chip;
    return ok(undefined);
  }
  m.chosen = chip;
  ctx.bump('messages');
  ctx.onAction('chip', { message: messageId, chip, thread: found.thread });
  return ok(undefined);
}

export function markRead(ctx: SimCtx, thread: ContactId): SimResult {
  const th = ctx.state.threads[thread];
  if (!th) return fail('notFound');
  if (th.unread !== 0) {
    th.unread = 0;
    ctx.bump('messages');
  }
  return ok(undefined);
}

// ── news ────────────────────────────────────────────────────────────────────

export function addNews(ctx: SimCtx, headline: string, source = 'Halcyon Herald'): void {
  const item = { id: ctx.id('n'), at: ctx.now, day: ctx.world.day, headline, source, read: false };
  ctx.state.news.unshift(item);
  if (ctx.state.news.length > 40) ctx.state.news.length = 40;
  ctx.emit('sim:news', { id: item.id, headline });
  ctx.bump('news');
}

/** Fire a one-time headline keyed by trigger. */
export function newsOnce(ctx: SimCtx, key: keyof typeof NEWS, vars: Record<string, string> = {}): void {
  const flag = `news_${key}`;
  if (ctx.state.story.flags[flag]) return;
  ctx.state.story.flags[flag] = true;
  let text: string = NEWS[key];
  for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{${k}}`, v);
  addNews(ctx, text);
}

export function readNews(ctx: SimCtx): SimResult {
  let changed = false;
  for (const n of ctx.state.news) {
    if (!n.read) {
      n.read = true;
      changed = true;
    }
  }
  if (changed) ctx.bump('news');
  return ok(undefined);
}

export function idleNote(ctx: SimCtx): string {
  return IDLE_NOTES[Math.floor(ctx.now / 120) % IDLE_NOTES.length]!;
}

export function hintFor(key: keyof typeof HINTS): string {
  return HINTS[key]!;
}
