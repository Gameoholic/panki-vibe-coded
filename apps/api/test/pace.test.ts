import assert from "node:assert/strict";
import { test } from "node:test";
import { CARD_TIME_MAX_MS } from "@panki/contracts";
import { paceFor, pacesOf, type PaceAnswer } from "../src/pace";

/*
 * A deck's pace from its answers (`pace.ts`). Run with `pnpm --dir apps/api test`.
 */

const H = 3_600_000;
const D = 24 * H;
const DAY1 = Date.UTC(2026, 10, 2);
const at = (day: number, hour: number) => DAY1 + (day - 1) * D + hour * H;
const dayOf = (instant: number) => new Date(instant).toISOString().slice(0, 10);
const answer = (cardId: string, instant: number, ms: number, over: Partial<PaceAnswer> = {}): PaceAnswer => ({
  cardId,
  deckId: "deck",
  at: instant,
  start: false,
  thinkMs: ms / 2,
  decideMs: ms / 2,
  ...over,
});

test("a new card's day is every showing of it that day; a review's likewise", () => {
  const { byDeck } = pacesOf(
    [
      answer("a", at(1, 9), 20_000, { start: true }),
      answer("a", at(1, 9.1), 10_000),
      answer("b", at(1, 9.2), 6_000),
      answer("c", at(1, 9.3), 8_000),
      answer("c", at(1, 9.4), 4_000),
    ],
    dayOf,
  );
  assert.deepEqual(byDeck.get("deck"), { newMs: 30_000, reviewMs: 9_000, showingMs: 9_600 });
});

test("the same card on another day is another run, a review once it's started", () => {
  const { byDeck } = pacesOf([answer("a", at(1, 9), 20_000, { start: true }), answer("a", at(2, 9), 8_000)], dayOf);
  assert.deepEqual(byDeck.get("deck"), { newMs: 20_000, reviewMs: 8_000, showingMs: 14_000 });
});

test("a showing is at most CARD_TIME_MAX_MS, and a run with one unmeasured counts for nothing", () => {
  const { byDeck } = pacesOf(
    [answer("a", at(1, 9), CARD_TIME_MAX_MS * 3), answer("b", at(1, 9), 6_000), answer("b", at(1, 10), 0, { thinkMs: null })],
    dayOf,
  );
  assert.deepEqual(byDeck.get("deck"), { newMs: null, reviewMs: CARD_TIME_MAX_MS, showingMs: CARD_TIME_MAX_MS });
});

test("a deck without a kind of run takes the account's; a deck with no answers is the account's whole", () => {
  const paces = pacesOf([answer("a", at(1, 9), 20_000, { start: true, deckId: "other" }), answer("b", at(1, 9), 6_000)], dayOf);
  assert.deepEqual(paceFor(paces, "deck"), { newMs: 20_000, reviewMs: 6_000, showingMs: 6_000 });
  assert.deepEqual(paceFor(paces, "empty"), { newMs: 20_000, reviewMs: 6_000, showingMs: 13_000 });
  assert.deepEqual(paceFor(null, "deck"), { newMs: null, reviewMs: null, showingMs: null });
});
