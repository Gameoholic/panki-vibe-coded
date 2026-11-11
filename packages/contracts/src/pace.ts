/** @panki How long what's left of a review takes, at the deck's pace and where each card's word falls in its clip (`timeLeftMs`, `cardLeftMs`, `countsLeft`, `countedMs`). */
/*
 * How long what's left of a review takes: each card's time at its deck's pace (`DeckPace`, worked out by the API from
 * the past answers), its showings stretched by how far into the clip on its front the picked word starts. Pure, shared
 * by the review and by the API's backtest of it.
 */
import type { DeckPace } from "./deck";
import { CARD_TIME_MAX_MS } from "./history";

/**
 * What's left of one card in a review: a new card's day, a review's day (its misses included, as the pace counts
 * them), or the showings a card being asked again still takes; with how far into its front's clip the picked word
 * starts (`Card.wordAtMs`), when that's known.
 */
export type CardLeft = ({ kind: "new" } | { kind: "review" } | { kind: "again"; steps: number }) & { wordAtMs?: number | null };

/** How long a showing counts for, as the pace and the stats count it: front and back, at most `CARD_TIME_MAX_MS`. */
export const countedMs = (thinkMs: number | null, decideMs: number | null) => Math.min((thinkMs ?? 0) + (decideMs ?? 0), CARD_TIME_MAX_MS);

/** How many showings what's left of a card takes, as the pace has it: an asked-again one its steps, a day's time over a showing's otherwise, at least one. */
function showingsOf(left: CardLeft, pace: DeckPace): number {
  if (left.kind === "again") return left.steps;
  const day = left.kind === "new" ? pace.newMs : pace.reviewMs;
  return day === null || pace.showingMs === null || pace.showingMs === 0 ? 1 : Math.max(1, day / pace.showingMs);
}

/** How much longer than the deck's usual one showing of this card is, in ms, by where its word falls (shorter, below 0); 0 where either isn't known. */
function wordStretchMs(left: CardLeft, pace: DeckPace): number {
  if (left.wordAtMs === undefined || left.wordAtMs === null || pace.wordAtMsPerS === null || pace.wordAtMeanMs === null) return 0;
  return (pace.wordAtMsPerS * (left.wordAtMs - pace.wordAtMeanMs)) / 1000;
}

/**
 * How long what's left of one card takes at the pace, in ms, not yet rounded: its kind's time (a kind the pace has
 * nothing for, one showing's), each of its showings stretched by where its word falls, never below nothing; null while
 * the pace has nothing for it.
 */
export function cardLeftMs(left: CardLeft, pace: DeckPace): number | null {
  const showing = pace.showingMs;
  const base = left.kind === "new" ? (pace.newMs ?? showing) : left.kind === "review" ? (pace.reviewMs ?? showing) : (pace.againMs ?? showing);
  if (base === null) return null;
  const plain = left.kind === "again" ? left.steps * base : base;
  return Math.max(0, plain + showingsOf(left, pace) * wordStretchMs(left, pace));
}

/** About how long the cards left take, in ms: each at the pace, rounded once; null while the pace has nothing. */
export function timeLeftMs(left: readonly CardLeft[], pace: DeckPace): number | null {
  let sum = 0;
  for (const card of left) {
    const ms = cardLeftMs(card, pace);
    if (ms === null) return null;
    sum += ms;
  }
  return Math.round(sum);
}

/** What's left of a deck known only by its counts (the deck list): each new card a new card's day, each due card the deck's review day. */
export function countsLeft(newCount: number, dueCount: number): CardLeft[] {
  return [...Array.from({ length: newCount }, (): CardLeft => ({ kind: "new" })), ...Array.from({ length: dueCount }, (): CardLeft => ({ kind: "review" }))];
}
