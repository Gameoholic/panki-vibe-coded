import assert from "node:assert/strict";
import { test } from "node:test";
import { makeStarter, type CardPlace, type SrsLadder } from "@panki/contracts";
import { clearedMoments, type Changed, type ReplayHold, type ReplayInput, type ReplayPlace } from "../src/cleared";

/*
 * All reviews done replayed from the history (`cleared.ts`). Run with `pnpm --dir apps/api test`.
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

/** A ladder whose first stage waits `days` days. */
function ladderWaiting(days: number, base: SrsLadder = makeStarter("anki", mint)): SrsLadder {
  const [first, ...rest] = base.stages;
  if (!first) throw new Error("A starter with no stages.");
  return { ...base, stages: [{ ...first, wait: { n: days, unit: "d" } }, ...rest] };
}
const LADDER = ladderWaiting(1);
const onFirst = (): CardPlace => ({ stageId: LADDER.stages[0]?.id ?? null, past: 0, node: [], burned: false });
/** A card's answer: the first for a new card is its start, the rest are reviews. */
const answer = (cardId: string, instant: number, start = false): ReplayPlace => ({ cardId, at: instant, answer: true, to: onFirst(), start });

function input(over: Partial<ReplayInput> & { places: ReplayPlace[] }): ReplayInput {
  return {
    cards: ["a", "b", "c"].map((id) => ({ id, deckId: "deck", removedAt: null })),
    decks: [{ id: "deck", removedAt: null, srsTypeId: "type", reviewsPerDay: null }],
    holds: [],
    ladders: new Map([["type", LADDER]]),
    ladderChanges: new Map(),
    deckTypeChanges: new Map(),
    capChanges: new Map(),
    dayOf,
    ...over,
  };
}

test("a day clears when an answer lands with nothing due, and not while a card waits", () => {
  const moments = clearedMoments(
    input({
      places: [
        answer("a", at(1, 10), true), // a is due again on day 2 at 10:00
        answer("b", at(2, 11), true), // a is due: nothing cleared
        answer("a", at(2, 12)), // a answered: nothing left
      ],
    }),
  );
  assert.deepEqual(daysOf(moments), [day(1), day(2)]);
  assert.ok(!moments.includes(at(2, 11)));
});

test("an answer taken back never happened: the day it would have cleared doesn't", () => {
  // The answer to a at 12:00 on day 2 was undone, so it isn't in the history.
  const moments = clearedMoments(input({ places: [answer("a", at(1, 10), true), answer("b", at(2, 11), true)] }));
  assert.deepEqual(daysOf(moments), [day(1)]);
});

test("a card deleted mid-day is due no longer from its removal on", () => {
  const moments = clearedMoments(
    input({
      cards: [
        { id: "a", deckId: "deck", removedAt: at(2, 11) },
        { id: "b", deckId: "deck", removedAt: null },
      ],
      // a is due on day 2 from 10:00 and deleted at 11:00; b is answered before and after.
      places: [answer("a", at(1, 10), true), answer("b", at(1, 9), true), answer("b", at(2, 10.5)), answer("b", at(2, 11.5))],
    }),
  );
  assert.ok(!moments.includes(at(2, 10.5)));
  assert.ok(moments.includes(at(2, 11.5)));
});

test("a wait changed between two days moves no due moment already set", () => {
  const longer = ladderWaiting(3, LADDER);
  const changes: Changed<SrsLadder | null>[] = [{ at: at(1, 20), from: LADDER, to: longer }];
  const moments = clearedMoments(input({ ladders: new Map([["type", longer]]), ladderChanges: new Map([["type", changes]]), places: [answer("a", at(1, 10), true), answer("b", at(2, 11), true)] }));
  // a was answered under the 1-day wait: it's due on day 2 whatever the wait became that evening.
  assert.ok(!moments.includes(at(2, 11)));
  // A card answered after the change waits the 3 days.
  const later = clearedMoments(input({ ladders: new Map([["type", longer]]), ladderChanges: new Map([["type", changes]]), places: [answer("a", at(1, 21), true), answer("b", at(2, 22), true)] }));
  assert.ok(later.includes(at(2, 22)));
});

test("a card held out isn't due while its hold stands", () => {
  const bury: ReplayHold = { cardId: "a", at: at(2, 10.5), kind: "bury", until: at(3, 10.5), liftedAt: null };
  const moments = clearedMoments(input({ places: [answer("a", at(1, 10), true), answer("b", at(2, 11), true)], holds: [bury] }));
  // The bury is given as an answer, and with a out nothing is due at it or after.
  assert.ok(moments.includes(at(2, 10.5)));
  assert.ok(moments.includes(at(2, 11)));
  const lifted = clearedMoments(input({ places: [answer("a", at(1, 10), true), answer("b", at(2, 11), true)], holds: [{ ...bury, liftedAt: at(2, 10.75) }] }));
  assert.ok(!lifted.includes(at(2, 11)));
});

test("a deck whose reviews a day are done has nothing due, as its review count says", () => {
  const places = [answer("a", at(1, 10), true), answer("c", at(1, 10), true), answer("a", at(2, 11))];
  // With a cap of one review a day, a's review on day 2 leaves c due but not reviewable: cleared.
  const capped = clearedMoments(input({ places, decks: [{ id: "deck", removedAt: null, srsTypeId: "type", reviewsPerDay: 1 }] }));
  assert.ok(capped.includes(at(2, 11)));
  const open = clearedMoments(input({ places }));
  assert.ok(!open.includes(at(2, 11)));
  // The cap as it stood that day: raised to 5 the evening before, c is still to review.
  const raised = clearedMoments(input({ places, decks: [{ id: "deck", removedAt: null, srsTypeId: "type", reviewsPerDay: 5 }], capChanges: new Map([["deck", [{ at: at(1, 20), from: 1, to: 5 }]]]) }));
  assert.ok(!raised.includes(at(2, 11)));
});
