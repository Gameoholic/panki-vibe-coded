/** @panki The account's day, its one home for the API and the web: the zone's wall clock (`wallAt`), the day an instant falls in (`dayOf`), days apart (`daysBetween`). Intl alone, no library. */
import type { Day } from "./history";

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

/**
 * The wall clock's reading in the zone at an instant, re-encoded as if it were UTC, so the calendar maths is Date.UTC's.
 * Throws for a zone Intl doesn't know.
 */
export function wallAt(instant: number, timeZone: string): number {
  const parts = formatterFor(timeZone).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
}

/**
 * The account's day an instant falls in: the zone's calendar date once the clock is wound back by the hour the day
 * turns over at. The clock is read first and wound back after: wound back before the reading, the night the clocks
 * change read the hour before the day's start on the wrong day.
 */
export function dayOf(instant: number, hour: number, timeZone: string): Day {
  return new Date(wallAt(instant, timeZone) - hour * 3_600_000).toISOString().slice(0, 10);
}

/** How many days `to` is after `from`; negative when it's before. */
export function daysBetween(from: Day, to: Day): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
