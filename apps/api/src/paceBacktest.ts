/**
 * The backtest of a review's time left (`pnpm pace:backtest`): each past session replayed answer by answer, its time
 * left worked out as the review would have before each answer, from the pace of the `PACE_DAYS` before the session,
 * and set against the time it really took. Pure: the answers come in oldest first, with the account's day reader.
 */
import { NEW_SESSION_PACE, cardLeftMs, countedMs, paceAfter, timeLeftMs, type CardLeft, type DeckPace, type SessionPace } from "@panki/contracts";
import { PACE_DAYS, paceFor, pacesOf, type PaceAnswer } from "./pace";

/** An answer as the backtest replays it: a pace's, with its session and whether it left the card inside an ask-again. */
export type ReplayAnswer = PaceAnswer & { sessionId: string | null; fromAgain: boolean; toAgain: boolean };

/** A way of working out the time left: which of the pace it uses, and how fast today's speed comes in (`TODAY_EASE`). */
export type Variant = { name: string; pace: (pace: DeckPace) => DeckPace; ease: number };

/** How far off a variant was: over the sessions, at their start and before every answer, in ms. */
export type VariantError = { name: string; sessions: number; startMs: number; startShare: number; throughMs: number };

/** What's left of a card as the review counts it as it first comes up: an ask-again from before takes one showing, the fewest it can. */
const leftOf = (a: ReplayAnswer): CardLeft => (a.start ? { kind: "new" } : a.fromAgain ? { kind: "again", steps: 1 } : { kind: "review" });

/** A session's time left before each of its answers, under one variant, beside the time really left; none when the pace has nothing. */
function replay(session: readonly ReplayAnswer[], pace: DeckPace, ease: number): { predicted: number; actual: number }[] | null {
  const firstOf = new Map<string, CardLeft>();
  for (const a of session) if (!firstOf.has(a.cardId)) firstOf.set(a.cardId, leftOf(a));
  const pending = new Set(firstOf.keys());
  const asked = new Set<string>();
  let state: SessionPace = NEW_SESSION_PACE;
  let actualLeft = session.reduce((sum, a) => sum + countedMs(a.thinkMs, a.decideMs), 0);
  const points: { predicted: number; actual: number }[] = [];
  for (const a of session) {
    const left: CardLeft[] = [...[...pending].map((id) => firstOf.get(id) ?? { kind: "new" as const }), ...[...asked].map((): CardLeft => ({ kind: "again", steps: 1 }))];
    const predicted = timeLeftMs(left, pace, state.done, ease);
    if (predicted === null) return null;
    points.push({ predicted, actual: actualLeft });
    const shown = countedMs(a.thinkMs, a.decideMs);
    const now: CardLeft = pending.has(a.cardId) ? (firstOf.get(a.cardId) ?? { kind: "new" }) : { kind: "again", steps: 1 };
    state = paceAfter(state, a.cardId, cardLeftMs(now, pace), shown, !a.toAgain);
    pending.delete(a.cardId);
    if (a.toAgain) asked.add(a.cardId);
    else asked.delete(a.cardId);
    actualLeft -= shown;
  }
  return points;
}

/**
 * Each variant's error over the sessions that started from `since` with at least `minAnswers` answers, every one
 * measured: the mean miss at the start (and as a share of the time the sessions took) and the mean miss before every
 * answer. Each session is worked out from the pace of the `PACE_DAYS` before it, as the review then would have.
 */
export function backtest(answers: readonly ReplayAnswer[], dayOf: (at: number) => string, since: number, variants: readonly Variant[], minAnswers = 3): VariantError[] {
  const sessions = new Map<string, ReplayAnswer[]>();
  for (const a of answers) if (a.sessionId !== null) sessions.set(a.sessionId, [...(sessions.get(a.sessionId) ?? []), a]);
  const picked = [...sessions.values()].filter((s) => (s[0]?.at ?? 0) >= since && s.length >= minAnswers && s.every((a) => a.thinkMs !== null && a.decideMs !== null));
  const errors = variants.map((v) => ({ name: v.name, sessions: 0, start: 0, took: 0, through: 0, points: 0 }));
  for (const session of picked) {
    const startAt = session[0]?.at ?? 0;
    const before = answers.filter((a) => a.at < startAt && a.at >= startAt - PACE_DAYS * 86_400_000);
    const pace = paceFor(pacesOf(before, dayOf), session[0]?.deckId ?? "");
    variants.forEach((v, i) => {
      const points = replay(session, v.pace(pace), v.ease);
      const e = errors[i];
      if (!points || !e || points.length === 0) return;
      const first = points[0] ?? { predicted: 0, actual: 0 };
      e.sessions += 1;
      e.start += Math.abs(first.predicted - first.actual);
      e.took += first.actual;
      e.through += points.reduce((sum, p) => sum + Math.abs(p.predicted - p.actual), 0);
      e.points += points.length;
    });
  }
  return errors.map((e) => ({
    name: e.name,
    sessions: e.sessions,
    startMs: e.sessions === 0 ? 0 : Math.round(e.start / e.sessions),
    startShare: e.took === 0 ? 0 : e.start / e.took,
    throughMs: e.points === 0 ? 0 : Math.round(e.through / e.points),
  }));
}

/** No today's speed at all: what an ease this large weighs is nothing. */
export const NO_TODAY = Number.POSITIVE_INFINITY;

/** The variants the backtest sets side by side: the time left as it was worked out before, each part alone, and both. */
export function variantsOf(eases: readonly number[]): Variant[] {
  const plain = (p: DeckPace): DeckPace => ({ ...p, againMs: null });
  const whole = (p: DeckPace): DeckPace => p;
  return [
    { name: "Before (deck means)", pace: plain, ease: NO_TODAY },
    { name: "+ asked-again showing", pace: whole, ease: NO_TODAY },
    ...eases.map((ease) => ({ name: `+ today's speed, ease ${ease}`, pace: plain, ease })),
    ...eases.map((ease) => ({ name: `Both, ease ${ease}`, pace: whole, ease })),
  ];
}
