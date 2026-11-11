/**
 * How long a deck's cards tend to take, worked out from its answers of the past `PACE_DAYS` (`DeckPace`). Pure: the
 * answers come in oldest first, with the account's day reader.
 */
import { CARD_TIME_MAX_MS, type DeckPace } from "@panki/contracts";

/** How far back a pace looks. */
export const PACE_DAYS = 30;

/** An answer as a pace reads it: its card and deck, when, whether it started a new card, and the spans the browser measured. */
export type PaceAnswer = { cardId: string; deckId: string; at: number; start: boolean; thinkMs: number | null; decideMs: number | null };

const NO_PACE: DeckPace = { newMs: null, reviewMs: null, showingMs: null };

/** A card's showings on one day: whether the first started it, and the time each took. */
type Run = { deckId: string; start: boolean; times: number[]; measured: boolean };

/** The mean of whole ms, rounded once; null with nothing to take it of. */
function meanOf(values: readonly number[]): number | null {
  return values.length === 0 ? null : Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}

function paceOf(runs: readonly Run[]): DeckPace {
  const measured = runs.filter((r) => r.measured);
  const total = (r: Run) => r.times.reduce((sum, t) => sum + t, 0);
  return {
    newMs: meanOf(measured.filter((r) => r.start).map(total)),
    reviewMs: meanOf(measured.filter((r) => !r.start).map(total)),
    showingMs: meanOf(measured.flatMap((r) => r.times)),
  };
}

/**
 * Each deck's pace, and the account's over every deck. A card's answers on one day are one run, a new card's when the
 * first of them started it: a run's time is every showing in it, each at most `CARD_TIME_MAX_MS` as the stats count
 * it, so the times a card was missed and asked again are in it. A run with a showing the browser didn't measure counts
 * for nothing, rather than as quicker than it was. A deck's value it has none of is the account's.
 */
export function pacesOf(answers: readonly PaceAnswer[], dayOf: (at: number) => string): { byDeck: Map<string, DeckPace>; all: DeckPace } {
  const runs = new Map<string, Run>();
  for (const a of answers) {
    const key = `${a.cardId}|${dayOf(a.at)}`;
    const run = runs.get(key) ?? { deckId: a.deckId, start: a.start, times: [], measured: true };
    run.measured &&= a.thinkMs !== null && a.decideMs !== null;
    run.times.push(Math.min((a.thinkMs ?? 0) + (a.decideMs ?? 0), CARD_TIME_MAX_MS));
    runs.set(key, run);
  }
  const all = paceOf([...runs.values()]);
  const byDeckRuns = new Map<string, Run[]>();
  for (const run of runs.values()) byDeckRuns.set(run.deckId, [...(byDeckRuns.get(run.deckId) ?? []), run]);
  const byDeck = new Map<string, DeckPace>();
  for (const [deckId, deckRuns] of byDeckRuns) {
    const own = paceOf(deckRuns);
    byDeck.set(deckId, { newMs: own.newMs ?? all.newMs, reviewMs: own.reviewMs ?? all.reviewMs, showingMs: own.showingMs ?? all.showingMs });
  }
  return { byDeck, all };
}

/** A deck's pace out of `pacesOf`: its own, else the account's, else none. */
export function paceFor(paces: { byDeck: ReadonlyMap<string, DeckPace>; all: DeckPace } | null, deckId: string): DeckPace {
  return paces?.byDeck.get(deckId) ?? paces?.all ?? NO_PACE;
}
