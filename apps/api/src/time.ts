/**
 * The owner's day turns over at an hour of their own clock, not the server's: the VPS may run on UTC while they live
 * on another zone. The zone comes from the environment and the maths is Intl alone, no library.
 */

const DAY = 86_400_000;

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

/** Throws for a zone Intl doesn't know, so a wrong PANKI_TIME_ZONE fails at startup and not on the first review. */
export function checkTimeZone(timeZone: string): void {
  formatterFor(timeZone);
}

/** The wall clock's reading in the zone at an instant, re-encoded as if it were UTC, so the calendar maths is Date.UTC's. */
function wallAt(instant: number, timeZone: string): number {
  const parts = formatterFor(timeZone).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
}

/** The zone's offset from UTC at an instant, in ms, east positive. */
function offsetAt(instant: number, timeZone: string): number {
  return wallAt(instant, timeZone) - Math.floor(instant / 1000) * 1000;
}

/** The instant a wall reading names: the reading minus the offset in force then, found in two passes because the offset itself depends on the instant. */
function instantOf(wall: number, timeZone: string): number {
  const guess = wall - offsetAt(wall, timeZone);
  return wall - offsetAt(guess, timeZone);
}

/** The most recent moment at `hour`:00 on the zone's clock that is at or before `now`, ms since epoch. */
export function dayStartAt(now: number, hour: number, timeZone: string): number {
  const local = new Date(wallAt(now, timeZone));
  const daysBack = local.getUTCHours() < hour ? 1 : 0;
  const wall = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - daysBack, hour);
  const start = instantOf(wall, timeZone);
  // Only a clock change between that hour and now can leave the start ahead of now; then the day began the day before.
  return start <= now ? start : instantOf(wall - DAY, timeZone);
}

/** A day on the owner's clock as "YYYY-MM-DD"; the keys compare as text, oldest first. */
export type Day = string;

function dayKey(wall: number): Day {
  return new Date(wall).toISOString().slice(0, 10);
}

/** The owner's day an instant falls in: the zone's calendar date once the clock is wound back by the hour the day turns over at. */
export function dayOf(instant: number, hour: number, timeZone: string): Day {
  return dayKey(wallAt(instant - hour * 3_600_000, timeZone));
}

/** The day's place in its week, 0 = Sunday. */
export function weekdayOf(day: Day): number {
  return new Date(`${day}T00:00:00Z`).getUTCDay();
}

/** The day `n` days on (or back, for a negative `n`). */
export function addDays(day: Day, n: number): Day {
  return dayKey(Date.parse(`${day}T00:00:00Z`) + n * DAY);
}

/** How many days `to` is after `from`; negative when it's before. */
export function daysBetween(from: Day, to: Day): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);
}
