/**
 * The backtest of a review's time left (`pnpm pace:backtest`): each past session replayed answer by answer, its time
 * left worked out before each answer from the pace of the `PACE_DAYS` before the session, and set against the time it
 * really took. Pure: the answers come in oldest first, with the account's day reader.
 *
 * Its variants are the live way (`timeLeftMs` and `pacesOf`, as the review has them) with parts taken out or put in:
 * the asked-again showing, the front's clips (or, in their place, where the picked word starts in the clip), and
 * today's speed, which the live way leaves out: the time left stretched by how the session's cards done with went
 * against what the pace said of them, eased in.
 */
import { NO_PACE, cardLeftMs, countedMs, type CardLeft, type DeckPace } from "@panki/contracts";
import { PACE_DAYS, paceFor, pacesOf, type PaceAnswer } from "./pace";

/**
 * An answer as the backtest replays it: a pace's, with its session, whether it was answered inside an ask-again and
 * left the card in one, and where the picked word starts in the front's clip, when that's known.
 */
export type ReplayAnswer = PaceAnswer & { sessionId: string | null; fromAgain: boolean; toAgain: boolean; wordMs: number | null };

/** What stretches a card's front: its clips' lengths, where its word starts in its clip, or nothing. */
export type FrontMeasure = "clips" | "word" | "none";

/** A way of working out the time left: whether a card asked again takes the asked-again showing, what stretches its front, and how fast today's speed comes in. */
export type Variant = { name: string; again: boolean; front: FrontMeasure; ease: number };

/** How far off a variant was: over the sessions, at their start and before every answer, in ms. */
export type VariantError = { name: string; sessions: number; startMs: number; startShare: number; throughMs: number };

/** No today's speed at all: what an ease this large weighs is nothing. */
export const NO_TODAY = Number.POSITIVE_INFINITY;

/** The cards a session is done with: what the pace said each would take as it first came up, and what each took. */
type Tally = { cards: number; predictedMs: number; spentMs: number };

/** Today's speed as a factor: the time the cards done with took over what the pace said, weighed by cards / (cards + ease); 1 before the first. */
function todaySpeed(done: Tally, ease: number): number {
  if (done.cards === 0 || done.predictedMs <= 0) return 1;
  return 1 + (done.cards / (done.cards + ease)) * (done.spentMs / done.predictedMs - 1);
}

/** An answer as a variant sees it: the front's measure in place of its clips, or nothing. */
function viewOf(a: ReplayAnswer, front: FrontMeasure): ReplayAnswer {
  return front === "clips" ? a : { ...a, clipMs: front === "word" ? a.wordMs : null };
}

/** What's left of a card as the review counts it as it first comes up: an ask-again from before takes one showing, the fewest it can. */
const leftOf = (a: ReplayAnswer): CardLeft => ({ ...(a.start ? { kind: "new" as const } : a.fromAgain ? { kind: "again" as const, steps: 1 } : { kind: "review" as const }), clipMs: a.clipMs });

/** A session's time left before each of its answers, under one variant, beside the time really left; none when the pace has nothing. */
function replay(session: readonly ReplayAnswer[], pace: DeckPace, ease: number): { predicted: number; actual: number }[] | null {
  const firstOf = new Map<string, CardLeft>();
  for (const a of session) if (!firstOf.has(a.cardId)) firstOf.set(a.cardId, leftOf(a));
  const askedOf = (id: string): CardLeft => ({ kind: "again", steps: 1, clipMs: firstOf.get(id)?.clipMs ?? null });
  const pending = new Set(firstOf.keys());
  const asked = new Set<string>();
  const open = new Map<string, { predictedMs: number; spentMs: number }>();
  let done: Tally = { cards: 0, predictedMs: 0, spentMs: 0 };
  let actualLeft = session.reduce((sum, a) => sum + countedMs(a.thinkMs, a.decideMs), 0);
  const points: { predicted: number; actual: number }[] = [];
  for (const a of session) {
    let sum = 0;
    for (const id of pending) sum += cardLeftMs(firstOf.get(id) ?? { kind: "new" }, pace) ?? Number.NaN;
    for (const id of asked) sum += cardLeftMs(askedOf(id), pace) ?? Number.NaN;
    if (Number.isNaN(sum)) return null;
    points.push({ predicted: Math.round(sum * todaySpeed(done, ease)), actual: actualLeft });
    const shown = countedMs(a.thinkMs, a.decideMs);
    const was = open.get(a.cardId) ?? { predictedMs: cardLeftMs(pending.has(a.cardId) ? (firstOf.get(a.cardId) ?? { kind: "new" }) : askedOf(a.cardId), pace) ?? 0, spentMs: 0 };
    const card = { predictedMs: was.predictedMs, spentMs: was.spentMs + shown };
    if (a.toAgain) open.set(a.cardId, card);
    else {
      open.delete(a.cardId);
      done = { cards: done.cards + 1, predictedMs: done.predictedMs + card.predictedMs, spentMs: done.spentMs + card.spentMs };
    }
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
    const deckId = session[0]?.deckId ?? "";
    const before = answers.filter((a) => a.at < startAt && a.at >= startAt - PACE_DAYS * 86_400_000);
    const paces = new Map<FrontMeasure, DeckPace>();
    variants.forEach((v, i) => {
      const fitted = paces.get(v.front) ?? paceFor(pacesOf(before.map((a) => viewOf(a, v.front)), dayOf), deckId);
      paces.set(v.front, fitted);
      const pace = v.again ? fitted : { ...fitted, againMs: NO_PACE.againMs };
      const points = replay(session.map((a) => viewOf(a, v.front)), pace, v.ease);
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

/** The variants the backtest sets side by side, the live way among them ("Asked-again + clip lengths"). */
export function variantsOf(eases: readonly number[]): Variant[] {
  return [
    { name: "Before (deck means)", again: false, front: "none", ease: NO_TODAY },
    { name: "+ asked-again showing", again: true, front: "none", ease: NO_TODAY },
    ...eases.map((ease) => ({ name: `+ today's speed, ease ${ease}`, again: false, front: "none" as const, ease })),
    ...eases.map((ease) => ({ name: `Both, ease ${ease}`, again: true, front: "none" as const, ease })),
    { name: "Asked-again + clip lengths", again: true, front: "clips", ease: NO_TODAY },
    { name: "Asked-again + word's place", again: true, front: "word", ease: NO_TODAY },
    { name: "Both, ease 5 + clip lengths", again: true, front: "clips", ease: 5 },
  ];
}
