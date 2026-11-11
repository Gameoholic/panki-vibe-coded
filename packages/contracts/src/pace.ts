/** @panki How long what's left of a review takes, at the deck's pace and today's speed (`timeLeftMs`, `cardLeftMs`, `paceAfter`, `todaySpeed`, `countsLeft`, `countedMs`). */
/*
 * How long what's left of a review takes: each card's time at its deck's pace (`DeckPace`, worked out by the API from
 * the past answers), stretched or shrunk by how fast this session is going against what the pace said. Pure, shared
 * by the review and by the API's backtest of it.
 */
import type { DeckPace } from "./deck";
import { CARD_TIME_MAX_MS } from "./history";

/**
 * What's left of one card in a review: a new card's day, a review's day (its misses included, as the pace counts
 * them), or the showings a card being asked again still takes.
 */
export type CardLeft = { kind: "new" } | { kind: "review" } | { kind: "again"; steps: number };

/** How long a showing counts for, as the pace and the stats count it: front and back, at most `CARD_TIME_MAX_MS`. */
export const countedMs = (thinkMs: number | null, decideMs: number | null) => Math.min((thinkMs ?? 0) + (decideMs ?? 0), CARD_TIME_MAX_MS);

/** How long what's left of one card takes at the pace, in ms; null while the pace has nothing for it. */
export function cardLeftMs(left: CardLeft, pace: DeckPace): number | null {
  const showing = pace.showingMs;
  if (left.kind === "new") return pace.newMs ?? showing;
  if (left.kind === "review") return pace.reviewMs ?? showing;
  const again = pace.againMs ?? showing;
  return again === null ? null : left.steps * again;
}

/** The cards a session is done with: how many, what the pace said each would take as it first came up, and what each took. */
export type Tally = { cards: number; predictedMs: number; spentMs: number };
/**
 * How the session stands for its speed: the cards done with (`done`), and each card shown and not yet done with (asked
 * again), with what the pace said it would take as it first came up and the time it has taken so far.
 */
export type SessionPace = { done: Tally; open: Readonly<Record<string, { predictedMs: number; spentMs: number }>> };
export const NEW_SESSION_PACE: SessionPace = { done: { cards: 0, predictedMs: 0, spentMs: 0 }, open: {} };

/**
 * The session after a card's showing: its time added to the card's, and the card done with once it leaves the review
 * (`leaves`), its whole time then set against what the pace said it would take. `predictedMs` is what's left of the
 * card at the pace as it's answered, used only when it's the card's first showing; null leaves the card out (the pace
 * had nothing to say).
 */
export function paceAfter(session: SessionPace, cardId: string, predictedMs: number | null, shownMs: number, leaves: boolean): SessionPace {
  const was = session.open[cardId] ?? (predictedMs === null ? null : { predictedMs, spentMs: 0 });
  if (was === null) return session;
  const card = { predictedMs: was.predictedMs, spentMs: was.spentMs + shownMs };
  const open = { ...session.open };
  if (!leaves) return { done: session.done, open: { ...open, [cardId]: card } };
  delete open[cardId];
  const done = session.done;
  return { done: { cards: done.cards + 1, predictedMs: done.predictedMs + card.predictedMs, spentMs: done.spentMs + card.spentMs }, open };
}

/**
 * How many cards done with weigh as much as the past answers do in today's speed: after one card today's speed counts
 * for a sixth, after five for half, after twenty for four fifths. Tuned by the backtest (`pnpm pace:backtest`).
 */
export const TODAY_EASE = 5;

/**
 * How much faster or slower than the pace this session is going, as a factor: the time the cards done with took over
 * what the pace said they would, eased in by how many there are (`TODAY_EASE`); 1 before the first.
 */
export function todaySpeed(done: Tally, ease: number = TODAY_EASE): number {
  if (done.cards === 0 || done.predictedMs <= 0) return 1;
  const weight = done.cards / (done.cards + ease);
  return 1 + weight * (done.spentMs / done.predictedMs - 1);
}

/** About how long the cards left take, in ms: each at the pace, all at today's speed, rounded once; null while the pace has nothing. */
export function timeLeftMs(left: readonly CardLeft[], pace: DeckPace, done: Tally = NEW_SESSION_PACE.done, ease: number = TODAY_EASE): number | null {
  let sum = 0;
  for (const card of left) {
    const ms = cardLeftMs(card, pace);
    if (ms === null) return null;
    sum += ms;
  }
  return Math.round(sum * todaySpeed(done, ease));
}

/** What's left of a deck known only by its counts (the deck list): each new card a new card's day, each due card the deck's review day. */
export function countsLeft(newCount: number, dueCount: number): CardLeft[] {
  return [...Array.from({ length: newCount }, (): CardLeft => ({ kind: "new" })), ...Array.from({ length: dueCount }, (): CardLeft => ({ kind: "review" }))];
}
