import assert from "node:assert/strict";
import { test } from "node:test";
import { placeInWeek, weekdaysInOrder, weekStartOf } from "@panki/contracts";
import { dayBeginsAt, dayOf } from "../src/time";

/*
 * The account's week (`packages/contracts/src/week.ts`): the week a day falls in, named by its first day, for any day it
 * ends on, read off the account's days, so the day start and a clock change decide where a week ends. Run with
 * `pnpm --dir apps/api test`.
 */

const H = 3_600_000;
const ZONE = "Asia/Jerusalem";
// 2026-11-01 is a Sunday; 11-07 the Saturday after, 11-08 the Sunday after that.

test("a week ending Saturday runs Sunday to Saturday; one ending Sunday, Monday to Sunday", () => {
  assert.equal(weekStartOf("2026-11-01", "sat"), "2026-11-01");
  assert.equal(weekStartOf("2026-11-07", "sat"), "2026-11-01");
  assert.equal(weekStartOf("2026-11-08", "sat"), "2026-11-08");
  assert.equal(weekStartOf("2026-11-01", "sun"), "2026-10-26");
  assert.equal(weekStartOf("2026-11-02", "sun"), "2026-11-02");
  assert.equal(weekStartOf("2026-11-07", "sun"), "2026-11-02");
  assert.equal(weekStartOf("2026-11-08", "sun"), "2026-11-02");
  // Its last day is the one it ends on, its place 6.
  assert.equal(placeInWeek("2026-11-07", "sat"), 6);
  assert.equal(placeInWeek("2026-11-08", "sun"), 6);
  assert.equal(placeInWeek("2026-11-02", "sun"), 0);
});

test("every ending day gives seven weeks' worth of days the same first day, and the weekdays in the week's order", () => {
  for (const endsOn of ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const) {
    const first = weekStartOf("2026-11-04", endsOn);
    const days = Array.from({ length: 7 }, (_, i) => new Date(Date.parse(`${first}T00:00:00Z`) + i * 24 * H).toISOString().slice(0, 10));
    assert.ok(days.includes("2026-11-04"));
    for (const d of days) assert.equal(weekStartOf(d, endsOn), first);
    assert.deepEqual(
      days.map((d) => new Date(`${d}T00:00:00Z`).getUTCDay()),
      weekdaysInOrder(endsOn),
    );
  }
  assert.deepEqual(weekdaysInOrder("sat"), [0, 1, 2, 3, 4, 5, 6]);
  assert.deepEqual(weekdaysInOrder("sun"), [1, 2, 3, 4, 5, 6, 0]);
});

test("with the day starting at 4:00, Saturday 02:00 is still Friday's day, so a week ending Friday hasn't ended", () => {
  // Saturday 2026-11-07, 02:00 in Jerusalem (UTC+2) is 00:00 UTC.
  const saturdayNight = Date.UTC(2026, 10, 7, 0);
  assert.equal(dayOf(saturdayNight, 4, ZONE), "2026-11-06");
  assert.equal(weekStartOf(dayOf(saturdayNight, 4, ZONE), "fri"), "2026-10-31");
  // At 04:00 the new day, and with it the new week, begins.
  const saturdayDawn = dayBeginsAt("2026-11-07", 4, ZONE);
  assert.equal(saturdayDawn, Date.UTC(2026, 10, 7, 2));
  assert.equal(weekStartOf(dayOf(saturdayDawn - 1, 4, ZONE), "fri"), "2026-10-31");
  assert.equal(weekStartOf(dayOf(saturdayDawn, 4, ZONE), "fri"), "2026-11-07");
  // The same for the week ending Saturday: Sunday 02:00 is still in it.
  assert.equal(weekStartOf(dayOf(Date.UTC(2026, 10, 8, 0), 4, ZONE), "sat"), "2026-11-01");
});

test("across a clock change the week still ends at its last day's end, an hour longer", () => {
  // Israel's clocks go back an hour at 02:00 on Sunday 2026-10-25, before the 4:00 day start: still Saturday's day.
  const sundayDawn = dayBeginsAt("2026-10-25", 4, ZONE);
  assert.equal(sundayDawn, Date.UTC(2026, 9, 25, 2));
  assert.equal(weekStartOf(dayOf(sundayDawn - 1, 4, ZONE), "sat"), "2026-10-18");
  assert.equal(weekStartOf(dayOf(sundayDawn, 4, ZONE), "sat"), "2026-10-25");
  // The week of 18 to 24 October holds the change: 7 days and one hour from its first day's start to the next week's.
  assert.equal(sundayDawn - dayBeginsAt("2026-10-18", 4, ZONE), 7 * 24 * H + H);
});
