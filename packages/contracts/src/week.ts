/** @panki The account's week, its one home: the weekdays (`WEEK_DAYS`, `WEEK_DAY_NAMES`) and the week a day falls in (`weekStartOf`, `placeInWeek`, `weekdaysInOrder`). */
import { z } from "zod";
import type { Day } from "./history";

/** The days of the week in the calendar's order, Sunday first, each its index as `Date.getUTCDay` counts it. */
export const WEEK_DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
export const WeekDay = z.enum(WEEK_DAYS);
export type WeekDay = z.infer<typeof WeekDay>;
/** Each day's name, as **Week ends on** lists it. */
export const WEEK_DAY_NAMES: Record<WeekDay, string> = { sun: "Sunday", mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday" };

const DAY_MS = 86_400_000;

/** A day's place in the calendar week, 0 Sunday to 6 Saturday, whatever day the account's week ends on. */
export function weekdayOf(day: Day): number {
  return new Date(`${day}T00:00:00Z`).getUTCDay();
}

/**
 * A day's place in the account's week, 0 its first day to 6 its last (`endsOn`). A day is the account's day, already
 * turned over at its day start in its zone (`dayOf`), so the week ends when its last day does and a clock change moves
 * nothing.
 */
export function placeInWeek(day: Day, endsOn: WeekDay): number {
  const first = (WEEK_DAYS.indexOf(endsOn) + 1) % 7;
  return (weekdayOf(day) - first + 7) % 7;
}

/** The week a day falls in, named by its first day: the day after the last `endsOn` before it. */
export function weekStartOf(day: Day, endsOn: WeekDay): Day {
  return new Date(Date.parse(`${day}T00:00:00Z`) - placeInWeek(day, endsOn) * DAY_MS).toISOString().slice(0, 10);
}

/** The calendar weekdays (0 Sunday) in the account's week's order, its first day first: how a chart by weekday lays its columns. */
export function weekdaysInOrder(endsOn: WeekDay): number[] {
  const first = (WEEK_DAYS.indexOf(endsOn) + 1) % 7;
  return Array.from({ length: 7 }, (_, i) => (first + i) % 7);
}
