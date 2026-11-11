import assert from "node:assert/strict";
import { test } from "node:test";
import { makeStarter, type CardPlace } from "@panki/contracts";
import type { Changed, ReplayHold, ReplayPlace } from "../src/cleared";
import { newDoneMoments, type NewDoneInput } from "../src/newDone";

/*
 * All new cards done replayed from the history (`newDone.ts`). Run with `pnpm --dir apps/api test`.
 */

let n = 0;
const mint = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
const H = 3_600_000;
const D = 24 * H;
/** Day 1 begins at this instant; the account's days here are UTC dates. */
const DAY1 = Date.UTC(2026, 10, 2);
const at = (day: number, hour: number) => DAY1 + (day - 1) * D + hour * H;
const dayOf = (instant: number) => new Date(instant).toISOString().slice(0, 10);
const daysOf = (moments: number[]) => [...new Set(moments.map(dayOf))];
const day = (d: number) => dayOf(at(d, 12));

const LADDER = makeStarter("anki", mint);
const onFirst = (): CardPlace => ({ stageId: LADDER.stages[0]?.id ?? null, past: 0, node: [], burned: false });
/** A card's answer: the first for a new card is its start, the rest are reviews. */
const answer = (cardId: string, instant: number, start = false): ReplayPlace => ({ cardId, at: instant, answer: true, to: onFirst(), start });
/** A card made before day 1, in the one deck unless said otherwise. */
const card = (id: string, over: Partial<NewDoneInput["cards"][number]> = {}) => ({ id, deckId: "deck", createdAt: 0, removedAt: null, ...over });
const deck = (id: string, newPerDay: number, removedAt: number | null = null) => ({ id, removedAt, newPerDay });

function input(over: Partial<NewDoneInput> & { places: ReplayPlace[] }): NewDoneInput {
  return {
    cards: ["a", "b", "c"].map((id) => card(id)),
    decks: [deck("deck", 10)],
    holds: [],
    limitChanges: new Map(),
    dayOf,
    ...over,
  };
}

test("a day is done once the new cards started reach the deck's New cards a day, cards left or not", () => {
  const moments = newDoneMoments(input({ decks: [deck("deck", 2)], places: [answer("a", at(1, 10), true), answer("b", at(1, 11), true)] }));
  // One of two started: not done; the second reaches the limit with c still to start.
  assert.ok(!moments.includes(at(1, 10)));
  assert.ok(moments.includes(at(1, 11)));
  assert.deepEqual(daysOf(moments), [day(1)]);
});

test("a deck with no new card left to start is done short of its limit", () => {
  const moments = newDoneMoments(input({ cards: [card("a"), card("b")], places: [answer("a", at(1, 10), true), answer("b", at(1, 11), true)] }));
  assert.ok(!moments.includes(at(1, 10)));
  assert.ok(moments.includes(at(1, 11)));
  // The next day a review lands with nothing new anywhere: done again.
  const next = newDoneMoments(input({ cards: [card("a"), card("b")], places: [answer("a", at(1, 10), true), answer("b", at(1, 11), true), answer("a", at(2, 9))] }));
  assert.deepEqual(daysOf(next), [day(1), day(2)]);
});

test("a deck whose New cards a day is 0 needs nothing", () => {
  const places = [answer("x", at(1, 10), true)];
  const cards = [card("a"), card("b"), card("x", { deckId: "other" })];
  // The one deck at 0 with two cards never started holds nothing up.
  const atZero = newDoneMoments(input({ cards, decks: [deck("deck", 0), deck("other", 1)], places }));
  assert.ok(atZero.includes(at(1, 10)));
  const atOne = newDoneMoments(input({ cards, decks: [deck("deck", 1), deck("other", 1)], places }));
  assert.ok(!atOne.includes(at(1, 10)));
});

test("a card added after the day was done undoes nothing; one added before holds it up", () => {
  const made = (hour: number) => [card("a"), card("d", { createdAt: at(1, hour) })];
  // a is the only card at 10:00: done. d, made at 14:00, is to start at a's review at 15:00, but the day stands.
  const later = newDoneMoments(input({ cards: made(14), places: [answer("a", at(1, 10), true), answer("a", at(1, 15))] }));
  assert.ok(later.includes(at(1, 10)));
  assert.ok(!later.includes(at(1, 15)));
  assert.deepEqual(daysOf(later), [day(1)]);
  const earlier = newDoneMoments(input({ cards: made(9), places: [answer("a", at(1, 10), true), answer("a", at(1, 15))] }));
  assert.deepEqual(earlier, []);
});

test("a new card held out isn't one to start while its hold stands", () => {
  const cards = [card("a"), card("b")];
  const bury: ReplayHold = { cardId: "b", at: at(1, 10.5), kind: "bury", until: at(2, 10.5), liftedAt: null };
  // The bury is given as an answer, and with b out nothing is left to start.
  const held = newDoneMoments(input({ cards, places: [answer("a", at(1, 10), true), answer("a", at(1, 12))], holds: [bury] }));
  assert.ok(!held.includes(at(1, 10)));
  assert.ok(held.includes(at(1, 10.5)));
  assert.ok(held.includes(at(1, 12)));
  const lifted = newDoneMoments(input({ cards, places: [answer("a", at(1, 10), true), answer("a", at(1, 12))], holds: [{ ...bury, liftedAt: at(1, 11) }] }));
  assert.ok(lifted.includes(at(1, 10.5)));
  assert.ok(!lifted.includes(at(1, 12)));
});

test("a deck removed, or a card removed, has nothing left to start from its removal on", () => {
  const cards = [card("a"), card("b"), card("x", { deckId: "gone" })];
  const places = [answer("a", at(1, 10), true), answer("b", at(1, 12), true)];
  const deckGone = newDoneMoments(input({ cards, decks: [deck("deck", 10), deck("gone", 10, at(1, 11))], places }));
  assert.ok(!deckGone.includes(at(1, 10)));
  assert.ok(deckGone.includes(at(1, 12)));
  const cardGone = newDoneMoments(input({ cards: [card("a"), card("b"), card("x", { removedAt: at(1, 11) })], places }));
  assert.ok(!cardGone.includes(at(1, 10)));
  assert.ok(cardGone.includes(at(1, 12)));
});

test("an answer taken back never happened: the start that would have finished the day isn't in the history", () => {
  // b's start at 11:00 was undone, so the history holds a's alone and b is still to start.
  const moments = newDoneMoments(input({ cards: [card("a"), card("b")], places: [answer("a", at(1, 10), true)] }));
  assert.deepEqual(moments, []);
});

test("the limit is the one in force at the moment: raised that evening, the morning's done stands", () => {
  const changes: Changed<number>[] = [{ at: at(1, 20), from: 1, to: 5 }];
  const places = [answer("a", at(1, 10), true), answer("b", at(2, 10), true)];
  const moments = newDoneMoments(input({ decks: [deck("deck", 5)], limitChanges: new Map([["deck", changes]]), places }));
  // Under 1 a day, a's start finished day 1; under 5, b's start on day 2 leaves c to start.
  assert.ok(moments.includes(at(1, 10)));
  assert.ok(!moments.includes(at(2, 10)));
});
