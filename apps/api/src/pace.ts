/**
 * How long a deck's cards tend to take, worked out from its answers of the past `PACE_DAYS` (`DeckPace`). Pure: the
 * answers come in oldest first, with the account's day reader.
 */
import { CARD_TIME_MAX_MS, NO_PACE, countedMs, type DeckPace } from "@panki/contracts";

/** How far back a pace looks. */
export const PACE_DAYS = 30;

/** The fewest showings with the word's place the front's stretch is fitted from; with fewer, where a card's word falls changes nothing. */
export const WORD_AT_MIN = 10;

/**
 * An answer as a pace reads it: its card and deck, when, whether it started a new card, the spans the browser
 * measured, and how far into the clip on the card's front the picked word started as it was shown (`clips.ts`), when
 * that's known.
 */
export type PaceAnswer = { cardId: string; deckId: string; at: number; start: boolean; thinkMs: number | null; decideMs: number | null; wordAtMs: number | null };

/** A card's showings on one day: whether the first started it, and the time each took. */
type Run = { deckId: string; start: boolean; times: number[]; measured: boolean };

/** The front's stretch by where the word falls: whole ms of front a second, and the mean place, rounded once. */
type WordAtFit = Pick<DeckPace, "wordAtMsPerS" | "wordAtMeanMs">;
const NO_WORD_AT_FIT: WordAtFit = { wordAtMsPerS: null, wordAtMeanMs: null };

const sumOf = (values: readonly number[]) => values.reduce((sum, v) => sum + v, 0);

/** The mean of whole ms, rounded once; null with nothing to take it of. */
function meanOf(values: readonly number[]): number | null {
  return values.length === 0 ? null : Math.round(sumOf(values) / values.length);
}

function paceOf(runs: readonly Run[]): Omit<DeckPace, keyof WordAtFit> {
  const measured = runs.filter((r) => r.measured);
  return {
    newMs: meanOf(measured.filter((r) => r.start).map((r) => sumOf(r.times))),
    reviewMs: meanOf(measured.filter((r) => !r.start).map((r) => sumOf(r.times))),
    showingMs: meanOf(measured.flatMap((r) => r.times)),
    againMs: meanOf(measured.flatMap((r) => r.times.slice(1))),
  };
}

/**
 * The front's time against where the word falls in its clip, a line by least squares over every measured showing that
 * has it: its slope never below 0 (a word further in never makes a card quicker). None with fewer than `WORD_AT_MIN`
 * or all at one place.
 */
export function wordAtFitOf(answers: readonly PaceAnswer[]): WordAtFit {
  const points = answers.flatMap((a) => (a.wordAtMs === null || a.thinkMs === null || a.decideMs === null ? [] : [{ x: a.wordAtMs, y: Math.min(a.thinkMs, CARD_TIME_MAX_MS) }]));
  if (points.length < WORD_AT_MIN) return NO_WORD_AT_FIT;
  const meanX = sumOf(points.map((p) => p.x)) / points.length;
  const meanY = sumOf(points.map((p) => p.y)) / points.length;
  const spread = sumOf(points.map((p) => (p.x - meanX) ** 2));
  if (spread === 0) return NO_WORD_AT_FIT;
  const share = sumOf(points.map((p) => (p.x - meanX) * (p.y - meanY))) / spread;
  return { wordAtMsPerS: Math.round(Math.max(0, share) * 1000), wordAtMeanMs: Math.round(meanX) };
}

/**
 * Each deck's pace, and the account's over every deck. A card's answers on one day are one run, a new card's when the
 * first of them started it: a run's time is every showing in it, each at most `CARD_TIME_MAX_MS` as the stats count
 * it, so the times a card was missed and asked again are in it; a showing after a run's first is an asked-again one.
 * A run with a showing the browser didn't measure counts for nothing, rather than as quicker than it was. The front's
 * stretch by where the word falls is fitted over the deck's showings (`wordAtFitOf`). A deck's value it has none of is
 * the account's.
 */
export function pacesOf(answers: readonly PaceAnswer[], dayOf: (at: number) => string): { byDeck: Map<string, DeckPace>; all: DeckPace } {
  const runs = new Map<string, Run>();
  for (const a of answers) {
    const key = `${a.cardId}|${dayOf(a.at)}`;
    const run = runs.get(key) ?? { deckId: a.deckId, start: a.start, times: [], measured: true };
    run.measured &&= a.thinkMs !== null && a.decideMs !== null;
    run.times.push(countedMs(a.thinkMs, a.decideMs));
    runs.set(key, run);
  }
  const all: DeckPace = { ...paceOf([...runs.values()]), ...wordAtFitOf(answers) };
  const byDeckRuns = new Map<string, Run[]>();
  for (const run of runs.values()) byDeckRuns.set(run.deckId, [...(byDeckRuns.get(run.deckId) ?? []), run]);
  const byDeck = new Map<string, DeckPace>();
  for (const [deckId, deckRuns] of byDeckRuns) {
    const own = paceOf(deckRuns);
    const wordAt = wordAtFitOf(answers.filter((a) => a.deckId === deckId));
    byDeck.set(deckId, {
      newMs: own.newMs ?? all.newMs,
      reviewMs: own.reviewMs ?? all.reviewMs,
      showingMs: own.showingMs ?? all.showingMs,
      againMs: own.againMs ?? all.againMs,
      ...(wordAt.wordAtMsPerS === null ? { wordAtMsPerS: all.wordAtMsPerS, wordAtMeanMs: all.wordAtMeanMs } : wordAt),
    });
  }
  return { byDeck, all };
}

/** A deck's pace out of `pacesOf`: its own, else the account's, else none. */
export function paceFor(paces: { byDeck: ReadonlyMap<string, DeckPace>; all: DeckPace } | null, deckId: string): DeckPace {
  return paces?.byDeck.get(deckId) ?? paces?.all ?? NO_PACE;
}
