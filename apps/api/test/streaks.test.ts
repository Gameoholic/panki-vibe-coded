import assert from "node:assert/strict";
import { test } from "node:test";
import { GOAL_KINDS, type StreakRule } from "@panki/contracts";
import { dayTalliesOf, streakStatesOf, type TallyInput } from "../src/streaks";

/*
 * The day tallies the streaks read (`streaks.ts` → `dayTalliesOf`) and Cards added over them. Run with
 * `pnpm --dir apps/api test`.
 */

const H = 3_600_000;
const D = 24 * H;
/** Day 1 begins at this instant, a Sunday; the account's days here are UTC dates. */
const DAY1 = Date.UTC(2026, 10, 1);
const at = (day: number, hour: number) => DAY1 + (day - 1) * D + hour * H;
const dayOf = (instant: number) => new Date(instant).toISOString().slice(0, 10);
const day = (d: number) => dayOf(at(d, 12));
const CLOCK = { on: true, pastStart: false, hoursLeft: 5 };

function tallies(over: Partial<TallyInput>): ReturnType<typeof dayTalliesOf> {
  return dayTalliesOf({ answers: [], showings: [], stretches: [], cleared: [], newDone: [], cards: [], dayOf, ...over });
}
/** A streak of Cards added ≥ n alone, from the whole history. */
const addedStreak = (n: number, per: StreakRule["per"] = "day"): StreakRule => ({ id: "s", name: "Adding", per, countFrom: "all", groups: [[{ kind: "added", n }]] });

test("a card counts for the day it was made, in any deck, and still once deleted", () => {
  const made = tallies({ cards: [{ createdAt: at(1, 9) }, { createdAt: at(1, 23) }, { createdAt: at(2, 9) }] });
  assert.equal(made.get(day(1))?.added, 2);
  assert.equal(made.get(day(2))?.added, 1);
  // The input carries no deck and no removal: a card deleted since is one more card made that day, the same.
  assert.equal(tallies({ cards: [{ createdAt: at(1, 9) }, { createdAt: at(1, 10) }] }).get(day(1))?.added, 2);
});

test("a day with no card made has nothing added, and the other facts stay as they were", () => {
  const made = tallies({ answers: [{ at: at(1, 9), started: true }, { at: at(1, 10), started: false }], showings: [{ at: at(1, 9), ms: 90_000 }], stretches: [{ at: at(1, 11), spentMs: 60_000 }], cleared: [at(1, 10)], newDone: [at(1, 10)] });
  assert.deepEqual(made.get(day(1)), { reviews: 1, started: 1, reviewMs: 90_000, watchMs: 60_000, cleared: 1, newDone: 1, added: 0 });
  assert.equal(made.get(day(2)), undefined);
});

test("Cards added ≥ n counts a day once n cards were made that day", () => {
  const made = tallies({ cards: [{ createdAt: at(1, 9) }, { createdAt: at(1, 10) }, { createdAt: at(2, 9) }, { createdAt: at(3, 9) }, { createdAt: at(3, 10) }] });
  const [state] = streakStatesOf([addedStreak(2)], made, day(3), "sat", CLOCK);
  assert.ok(state);
  // Days 1 and 3 count, day 2 falls short: a run of 1 going, the best 1.
  assert.deepEqual(state.counted, [day(1), day(3)]);
  assert.equal(state.current, 1);
  assert.equal(state.now, true);
  assert.deepEqual(state.groups, [[{ kind: "added", have: 2, need: 2 }]]);
  // On day 2 the one card made leaves one to add.
  const [onDay2] = streakStatesOf([addedStreak(2)], made, day(2), "sat", CLOCK);
  assert.deepEqual(onDay2?.groups, [[{ kind: "added", have: 1, need: 2 }]]);
  assert.equal(onDay2?.now, false);
});

test("over a week the cards made on its days are summed", () => {
  const made = tallies({ cards: [{ createdAt: at(1, 9) }, { createdAt: at(3, 9) }, { createdAt: at(7, 9) }, { createdAt: at(8, 9) }] });
  // Day 1 is a Sunday: a week ending Saturday has days 1 to 7 as one week, day 8 the next.
  const [state] = streakStatesOf([addedStreak(3, "week")], made, day(8), "sat", CLOCK);
  assert.deepEqual(state?.counted, [day(1)]);
  assert.deepEqual(state?.groups, [[{ kind: "added", have: 1, need: 3 }]]);
});

test("a week ending Sunday runs Monday to Sunday: the same days fall in other weeks, and the row starts on Monday", () => {
  const made = tallies({ cards: [{ createdAt: at(1, 9) }, { createdAt: at(3, 9) }, { createdAt: at(7, 9) }, { createdAt: at(8, 9) }] });
  // Day 1, a Sunday, ends the week before; days 2 (Monday) to 8 (Sunday) are one week, holding days 3, 7 and 8.
  const [weekly] = streakStatesOf([addedStreak(3, "week")], made, day(8), "sun", CLOCK);
  assert.deepEqual(weekly?.counted, [day(2)]);
  assert.equal(weekly?.now, true);
  assert.equal(weekly?.daysLeft, 1);
  // A daily streak's row is this week's days, Monday first: Sunday, today, is its last.
  const [daily] = streakStatesOf([addedStreak(1)], made, day(8), "sun", CLOCK);
  assert.deepEqual(
    daily?.row.map((p) => p.start),
    [2, 3, 4, 5, 6, 7, 8].map(day),
  );
  assert.equal(daily?.rowNow, 6);
});

test("the kind is a count that reviewing doesn't help, offered to daily and weekly streaks alike", () => {
  const kind = GOAL_KINDS.added;
  assert.equal(kind.numbered, true);
  assert.equal(kind.byReviewing, false);
  assert.deepEqual([...kind.fits], ["day", "week"]);
});
