import assert from "node:assert/strict";
import { test } from "node:test";
import { NO_PACE, type DeckPace } from "../src/deck";
import { CARD_TIME_MAX_MS } from "../src/history";
import { cardLeftMs, countedMs, countsLeft, timeLeftMs } from "../src/pace";

/*
 * A review's time left from its deck's pace and each card's clips (`pace.ts`). Run with `pnpm --dir packages/contracts test`.
 */

const PACE: DeckPace = { newMs: 30_000, reviewMs: 10_000, showingMs: 8_000, againMs: 4_000, clipMsPerS: null, clipMeanMs: null };

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

test("each showing stretches by the clips against the deck's mean clip, a day's showings as many as its time over a showing's", () => {
  const clips: DeckPace = { ...PACE, clipMsPerS: 1_000, clipMeanMs: 5_000 };
  // A review day is 1.25 showings: 3 s more clip is 3.75 s more.
  assert.equal(cardLeftMs({ kind: "review", clipMs: 8_000 }, clips), 13_750);
  // An asked-again card: each step one showing.
  assert.equal(cardLeftMs({ kind: "again", steps: 2, clipMs: 3_000 }, clips), 4_000);
  // Shorter than nothing is nothing.
  assert.equal(cardLeftMs({ kind: "again", steps: 1, clipMs: 0 }, clips), 0);
  // No clip known, or no fit: the plain time.
  assert.equal(cardLeftMs({ kind: "review", clipMs: null }, clips), 10_000);
  assert.equal(cardLeftMs({ kind: "review", clipMs: 8_000 }, PACE), 10_000);
});

test("the time left is every card at the pace, rounded once", () => {
  const clips: DeckPace = { ...PACE, clipMsPerS: 333, clipMeanMs: 5_000 };
  assert.equal(timeLeftMs([{ kind: "new" }, { kind: "review" }, { kind: "again", steps: 1 }], PACE), 44_000);
  // 4 333⅓ each: two of them 8 666⅔, rounded once, never 4 333 twice.
  assert.equal(timeLeftMs([{ kind: "again", steps: 1, clipMs: 6_001 }, { kind: "again", steps: 1, clipMs: 6_001 }], clips), 8_667);
});

test("a deck known by its counts: each new card a new card's day, each due one a review's", () => {
  assert.equal(timeLeftMs(countsLeft(2, 3), PACE), 90_000);
});
