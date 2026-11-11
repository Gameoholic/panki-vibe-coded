import assert from "node:assert/strict";
import { test } from "node:test";
import { NO_PACE, type DeckPace } from "../src/deck";
import { CARD_TIME_MAX_MS } from "../src/history";
import { NEW_SESSION_PACE, cardLeftMs, countedMs, countsLeft, paceAfter, timeLeftMs, todaySpeed } from "../src/pace";

/*
 * A review's time left from its deck's pace and today's speed (`pace.ts`). Run with `pnpm --dir packages/contracts test`.
 */

const PACE: DeckPace = { newMs: 30_000, reviewMs: 10_000, showingMs: 8_000, againMs: 4_000 };

test("each card takes its kind's time; an asked-again one its showings left", () => {
  assert.equal(cardLeftMs({ kind: "new" }, PACE), 30_000);
  assert.equal(cardLeftMs({ kind: "review" }, PACE), 10_000);
  assert.equal(cardLeftMs({ kind: "again", steps: 3 }, PACE), 12_000);
});

test("a kind the pace has nothing for takes one showing; with nothing at all there's no time", () => {
  const thin: DeckPace = { ...NO_PACE, showingMs: 8_000 };
  assert.equal(cardLeftMs({ kind: "new" }, thin), 8_000);
  assert.equal(cardLeftMs({ kind: "again", steps: 2 }, thin), 16_000);
  assert.equal(timeLeftMs([{ kind: "review" }], NO_PACE), null);
  assert.equal(timeLeftMs([], NO_PACE), 0);
});

test("a showing counts front and back, at most CARD_TIME_MAX_MS", () => {
  assert.equal(countedMs(3_000, 2_000), 5_000);
  assert.equal(countedMs(CARD_TIME_MAX_MS, 9_000), CARD_TIME_MAX_MS);
  assert.equal(countedMs(null, 2_000), 2_000);
});

test("a card is set against the pace once it's done with, its every showing counted, at what the pace said as it first came up", () => {
  let s = paceAfter(NEW_SESSION_PACE, "a", 10_000, 6_000, false);
  assert.deepEqual(s.done, { cards: 0, predictedMs: 0, spentMs: 0 });
  // Asked again: what the pace says of it now is passed over, its first word stands.
  s = paceAfter(s, "a", 4_000, 3_000, true);
  assert.deepEqual(s, { done: { cards: 1, predictedMs: 10_000, spentMs: 9_000 }, open: {} });
  // A card the pace had nothing for is left out.
  assert.equal(paceAfter(s, "b", null, 5_000, true), s);
});

test("today's speed comes in eased: none before the first card, half of it after as many as the ease", () => {
  assert.equal(todaySpeed({ cards: 0, predictedMs: 0, spentMs: 0 }), 1);
  assert.equal(todaySpeed({ cards: 5, predictedMs: 50_000, spentMs: 100_000 }, 5), 1.5);
  assert.equal(todaySpeed({ cards: 1, predictedMs: 10_000, spentMs: 20_000 }, 0), 2);
});

test("the time left is every card at the pace, at today's speed, rounded once", () => {
  const left = [{ kind: "new" as const }, { kind: "review" as const }, { kind: "again" as const, steps: 1 }];
  assert.equal(timeLeftMs(left, PACE), 44_000);
  assert.equal(timeLeftMs(left, PACE, { cards: 3, predictedMs: 30_000, spentMs: 20_000 }, 3), 36_667);
});

test("a deck known by its counts: each new card a new card's day, each due one a review's", () => {
  assert.equal(timeLeftMs(countsLeft(2, 3), PACE), 90_000);
});
