/**
 * An account's day turns over at an hour of its own clock, not the server's: the VPS may run on UTC while the account
 * lives on another zone. The zone comes from the environment and the maths is Intl alone, no library.
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

/** A day on the account's clock as "YYYY-MM-DD"; the keys compare as text, oldest first. */
export type Day = string;

function dayKey(wall: number): Day {
  return new Date(wall).toISOString().slice(0, 10);
}

/**
 * The account's day an instant falls in: the zone's calendar date once the clock is wound back by the hour the day
 * turns over at. The clock is read first and wound back after, as `dayStartAt` and `hourReader` do: wound back before
 * the reading, the night the clocks change read the hour before the day's start on the wrong day.
 */
export function dayOf(instant: number, hour: number, timeZone: string): Day {
  return dayKey(wallAt(instant, timeZone) - hour * 3_600_000);
}

/**
 * `dayOf` for a whole history read at once: the stats ask it of every answer and every stretch watched. Every zone's
 * offset is a whole number of quarter hours and changes only on a quarter hour, as the day's hour does, so the day an
 * instant falls in is the same across each quarter hour of UTC; it's worked out once per quarter hour, never guessed.
 */
export function dayReader(hour: number, timeZone: string): (instant: number) => Day {
  const QUARTER = 900_000;
  const known = new Map<number, Day>();
  return (instant) => {
    const quarter = Math.floor(instant / QUARTER);
    let day = known.get(quarter);
    if (day === undefined) {
      day = dayOf(instant, hour, timeZone);
      known.set(quarter, day);
    }
    return day;
  };
}

/**
 * The hour of the day an instant falls in, in the day's order: 0 the hour the day turns over at, 23 the last before it
 * turns again. Worked out once per quarter hour of UTC, as `dayReader` is.
 */
export function hourReader(hour: number, timeZone: string): (instant: number) => number {
  const QUARTER = 900_000;
  const known = new Map<number, number>();
  return (instant) => {
    const quarter = Math.floor(instant / QUARTER);
    let index = known.get(quarter);
    if (index === undefined) {
      index = (new Date(wallAt(instant, timeZone)).getUTCHours() - hour + 24) % 24;
      known.set(quarter, index);
    }
    return index;
  };
}

/** The instant a day of the account's begins: `hour`:00 on the zone's clock on that date. */
export function dayBeginsAt(day: Day, hour: number, timeZone: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return instantOf(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1, hour), timeZone);
}

/** The first day of the calendar month a day is in. */
export function monthOf(day: Day): Day {
  return `${day.slice(0, 7)}-01`;
}

/** The same day of the month `n` months on (or back), held to that month's last day (31 Mar back one month is 28 or 29 Feb). */
export function shiftMonths(day: Day, n: number): Day {
  const [y, m, d] = day.split("-").map(Number);
  const first = Date.UTC(y ?? 1970, (m ?? 1) - 1 + n, 1);
  const last = new Date(Date.UTC(new Date(first).getUTCFullYear(), new Date(first).getUTCMonth() + 1, 0)).getUTCDate();
  return dayKey(first + (Math.min(d ?? 1, last) - 1) * DAY);
}

/** The first day of the calendar month `n` months on (or back) from the one a day is in. */
export function addMonths(day: Day, n: number): Day {
  const [y, m] = day.split("-").map(Number);
  return dayKey(Date.UTC(y ?? 1970, (m ?? 1) - 1 + n, 1));
}

/**
 * The run the periods that counted make, each named by the day it starts on and `days` long: how many in a row up to
 * the one going on (`now` only once it counts, so a streak isn't broken before the period is over), and the longest
 * run ever.
 */
export function runOf(counted: ReadonlySet<Day>, now: Day, days: number): { current: number; best: number } {
  let current = 0;
  for (let d = counted.has(now) ? now : addDays(now, -days); counted.has(d); d = addDays(d, -days)) current += 1;
  const best = runsOf([...counted].sort(), days).reduce((most, r) => Math.max(most, r.n), 0);
  return { current, best };
}

/** The runs sorted periods make, `days` long each, oldest first: each its first and last period and how many. */
export function runsOf(sorted: readonly Day[], days: number): { from: Day; to: Day; n: number }[] {
  const runs: { from: Day; to: Day; n: number }[] = [];
  for (const d of sorted) {
    const last = runs[runs.length - 1];
    if (last && daysBetween(last.to, d) === days) {
      last.to = d;
      last.n += 1;
    } else runs.push({ from: d, to: d, n: 1 });
  }
  return runs;
}

/** The day `n` days on (or back, for a negative `n`). */
export function addDays(day: Day, n: number): Day {
  return dayKey(Date.parse(`${day}T00:00:00Z`) + n * DAY);
}

/** How many days `to` is after `from`; negative when it's before. */
export function daysBetween(from: Day, to: Day): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);
}
