/** @panki Words, dates and times in the account's formats (`count`, `dateWords`, `daysOf`); every time and share, done down, left up (`durationWords`, `percentOf`, `durationLeftWords`). */
import { DEFAULT_SETTINGS, dayOf, daysBetween, type DateFormat, type Day, type Settings, type TimeFormat } from "@panki/contracts";
/**
 * What Video tracking does, said under it in the extension, where it's switched, and in Panki's Settings, where it's
 * shown: the same words in both, so the two read exactly alike.
 */
export const VIDEO_TRACKING_WHY =
  "Records every YouTube video you watch: which one, when, how long you watched and where you stopped. Continue watching, Recently watched, your watch time and Panki's other watching stats use it.";

/**
 * The tag beside what's kept on this device alone (`PerDevice`), so it's always known what's per device; everything
 * untagged is the account's.
 */
export const PER_DEVICE = "This device";

/** "1 card", "2 cards", "212,345 words": every count Panki shows is phrased here. */
export function count(n: number, one: string, many: string) {
  return `${n.toLocaleString("en")} ${wordFor(n, one, many)}`;
}
/** A place in a row as said in words: "1st", "2nd", "3rd", "11th", "22nd". */
export function ordinalWords(n: number) {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n.toLocaleString("en")}${suffix}`;
}
/** The word alone for a count, with no number: "meaning" for one, "meanings" for any other. The one plural rule, `count`'s. */
export function wordFor(n: number, one: string, many: string) {
  return n === 1 ? one : many;
}

const LIST_WORDS = new Intl.ListFormat("en", { style: "long", type: "conjunction" });
/** A few things named in a row, "mp3, m4a, and ogg". */
export function listWords(items: readonly string[]): string {
  return LIST_WORDS.format(items);
}

/** Whether text is Japanese, so it gets the Japanese font. Looked at, never set: one less thing to configure. */
export function isJapanese(text: string) {
  return /[぀-ヿ㐀-鿿ｦ-ﾟ]/.test(text);
}

/** The `lang` an element gets for its text: Japanese, or nothing. */
export function langOf(text: string): "ja" | undefined {
  return isJapanese(text) ? "ja" : undefined;
}

const KEY_NAMES: Record<string, string> = { " ": "Space", ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→" };
/**
 * A key as its keycap reads: "Space", "↑", "A", "1", "Enter", and one pressed with Ctrl or Alt as it's kept
 * (`keys.ts` → `keyOf`, the held keys before a "+") "Ctrl+Z". The last "+" but the key itself is where it splits, so
 * "Ctrl++" is Ctrl with "+".
 */
export function keyWords(key: string): string {
  const at = key.length < 2 ? -1 : key.lastIndexOf("+", key.length - 2);
  const own = key.slice(at + 1);
  const cap = KEY_NAMES[own] ?? (own.length === 1 ? own.toUpperCase() : own);
  return at < 0 ? cap : `${key.slice(0, at)}+${cap}`;
}

// ---------- Time and shares: the one rounding ----------
//
// Every length of time and every share Panki shows is rounded here, in the app and the extension alike, and never by
// hand where it's shown. Time done and a share of something done round down, so nothing reads as more than it is: 59.6
// minutes watched is "59 min", as a streak's condition counts it, never "1 h" beside "Time watching ≥ 1 h" not met, and
// nothing reads 100% before it's all of it. Time still to go rounds up, so it never reads as less than it is and never
// "0 min" while something remains. A streak's condition says its minutes through the contracts' `minutesWords`, by the
// same rule (`Rounding`).

/** A length of time in whole hours, minutes and seconds, rounded down to the second. */
function partsOf(seconds: number): { hours: number; minutes: number; seconds: number } {
  const whole = Math.max(0, Math.floor(seconds));
  return { hours: Math.floor(whole / 3600), minutes: Math.floor(whole / 60) % 60, seconds: whole % 60 };
}

/** Seconds as a time on a player, "0:03", "12:34", and past the hour "1:02:03". */
export function clock(seconds: number): string {
  const { hours, minutes, seconds: rest } = partsOf(seconds);
  const ss = String(rest).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${ss}` : `${minutes}:${ss}`;
}

/** Time done as a figure's parts, to the whole minute down: [["48", "min"]], [["3", "h"], ["12", "min"]], [["3", "h"]]. */
export function durationParts(seconds: number): [string, string][] {
  const { hours, minutes } = partsOf(seconds);
  if (hours === 0) return [[String(minutes), "min"]];
  const h: [string, string] = [hours.toLocaleString("en"), "h"];
  return minutes === 0 ? [h] : [h, [String(minutes), "min"]];
}

/**
 * Time done in words, to the whole minute down: "3 h 12 min", "48 min", "3 h". Under a minute, `under` says how: "0 min"
 * (`zero`, as a day's total reads), "<1 min" (`less`, a clock that's started), or the whole seconds down, "45 s"
 * (`seconds`, where seconds matter).
 */
export function durationWords(seconds: number, under: "zero" | "less" | "seconds" = "zero"): string {
  const parts = partsOf(seconds);
  if (parts.hours === 0 && parts.minutes === 0) return under === "seconds" ? `${parts.seconds} s` : under === "less" ? "<1 min" : "0 min";
  return durationParts(seconds)
    .map(([n, unit]) => `${n} ${unit}`)
    .join(" ");
}

/**
 * Time still to go in words, rounded up: to the whole minute, "3 min", "1 h 5 min"; with `seconds`, under a minute and a
 * half in whole seconds, "40 s". A streak's hours left, a video's time left, a review's, a wait.
 */
export function durationLeftWords(seconds: number, under: "minute" | "seconds" = "minute"): string {
  const left = Math.max(0, seconds);
  if (under === "seconds" && left < 90) return `${Math.ceil(left)} s`;
  return durationWords(Math.ceil(left / 60) * 60);
}

/** A wait that's only roughly known, "~40 s", "~3 min", rounded up as time left is: how long transcribing takes, as measured so far. */
export function aboutWords(seconds: number): string {
  return `~${durationLeftWords(seconds, "seconds")}`;
}

/** Time done to the tenth of a second down, from ms, as a number: 2.3. Whole ms to start with, so the division is exact. */
export function tenthsOf(ms: number): number {
  return Math.floor(Math.max(0, ms) / 100) / 10;
}
/** Time done to the tenth of a second down, from ms: "2.3 s", "0.0 s". How long an answer or a step took. */
export function tenthsWords(ms: number): string {
  return `${tenthsOf(ms).toFixed(1)} s`;
}

/**
 * A share of a whole as a percent, rounded down to `decimals` places, so nothing reads 100% before it's all of it: 99.6%
 * done is 99. Nothing to share of is 0. Multiplied before it's divided, so a whole share comes out whole.
 */
export function percentOf(part: number, of: number, decimals = 0): number {
  if (!(of > 0)) return 0;
  const scale = 10 ** decimals;
  return Math.floor((Math.max(0, part) * 100 * scale) / of) / scale;
}
/** A share of a whole as said, rounded down (`percentOf`): "84%", "87.5%". */
export function percentWords(part: number, of: number, decimals = 0): string {
  return `${percentOf(part, of, decimals)}%`;
}

/**
 * What's left of a video stopped part-way, and how much of it was watched: "3 min left · 84%". The time left rounded up
 * (`durationLeftWords`), the share down and never 100% before the video's done. Continue watching's cards and tiles all
 * say it this way.
 */
export function leftWords(stoppedAtMs: number, lengthMs: number): string {
  const left = durationLeftWords(Math.max(0, lengthMs - stoppedAtMs) / 1000);
  return `${left} left · ${Math.min(99, percentOf(stoppedAtMs, lengthMs))}%`;
}

/** How long something took, in full words, rounded down: "26 seconds", "2 minutes 5 seconds", "1 hour 3 minutes" (seconds left out past the hour). */
export function tookWords(seconds: number): string {
  const { hours, minutes, seconds: rest } = partsOf(seconds);
  const parts = hours > 0 ? [count(hours, "hour", "hours"), minutes > 0 ? count(minutes, "minute", "minutes") : ""] : [minutes > 0 ? count(minutes, "minute", "minutes") : "", rest > 0 || minutes === 0 ? count(rest, "second", "seconds") : ""];
  return parts.filter(Boolean).join(" ");
}

/** A length of time packed tight, rounded down: "21m49s", "1h3m5s", "49s", the hours and the minutes left out while they're 0. */
export function hmsWords(seconds: number): string {
  const { hours, minutes, seconds: rest } = partsOf(seconds);
  return `${hours > 0 ? `${hours}h` : ""}${minutes > 0 ? `${minutes}m` : ""}${rest}s`;
}

/**
 * What something costs at a listed price, from whole micro-dollars (the usage ledger's unit, `MICROS_PER_CENT` to the
 * cent), one of two ways everywhere: from a cent up, dollars and cents, "$0.70 (est.)",
 * "$1,234.05 (est.)"; under a cent, four decimals, "$0.0006 (est.)", "$0.0040 (est.)", and under the fourth,
 * "<$0.0001 (est.)". Nothing at all is "$0.00 (est.)". Every dollar amount Panki shows is worked out from a listed
 * price, never told by the provider, so each says so. The micro-dollars stay whole; only this display splits them.
 */
export function estimateWords(micros: number): string {
  const whole = Math.max(0, Math.round(micros));
  if (whole > 0 && whole < 100) return "<$0.0001 (est.)";
  // A ten-thousandth of a dollar is 100 micro-dollars; one that rounds up to a whole cent is said as cents, below.
  const tenThousandths = Math.round(whole / 100);
  if (whole > 0 && tenThousandths < 100) return `$0.${String(tenThousandths).padStart(4, "0")} (est.)`;
  const cents = Math.round(whole / 10_000);
  return `$${Math.floor(cents / 100).toLocaleString("en")}.${String(cents % 100).padStart(2, "0")} (est.)`;
}

/** A count of tokens packed tight: "820", "744K", "1.2M". */
export function tokenWords(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}K`;
  return String(tokens);
}

// ---------- Dates and times: the one home ----------

/**
 * How the account reads dates and times (`Settings.timeFormat`, `dateFormat`, Settings → General → Display), held here
 * for every formatter below: the app hands them in as its settings arrive (`setFormats`). Until then, and wherever
 * nothing hands them in (the extension), 24-hour and day month, what the app always showed.
 */
let formats: { time: TimeFormat; date: DateFormat } = { time: DEFAULT_SETTINGS.timeFormat, date: DEFAULT_SETTINGS.dateFormat };
const formatters = new Map<string, Intl.DateTimeFormat>();
export function setFormats(time: TimeFormat, date: DateFormat) {
  if (time === formats.time && date === formats.date) return;
  formats = { time, date };
  formatters.clear();
}
/**
 * A formatter for these fields in the account's field order: day month is British English's order, month day American
 * English's, chosen by the setting and never guessed from the browser; the words are English either way.
 */
function formatter(key: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(formats.date === "dayMonth" ? "en-GB" : "en-US", options);
    formatters.set(key, f);
  }
  return f;
}
/** An account day ("YYYY-MM-DD") as the moment it names, read in UTC so no zone moves it. */
const ofDay = (day: string) => new Date(`${day}T00:00:00Z`);

/** A moment (ms since epoch) as a date in words, "10 October 2026" or "October 10, 2026", never a raw number. */
export function dateWords(at: number): string {
  return formatter("date", { day: "numeric", month: "long", year: "numeric" }).format(new Date(at));
}
/** An account day with its weekday: "Wed 11 Nov", "Wed, Nov 11". */
export const dayWords = (day: string) => formatter("day", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(ofDay(day));
/** An account day short: "11 Nov", "Nov 11". */
export const shortDayWords = (day: string) => formatter("short", { day: "numeric", month: "short", timeZone: "UTC" }).format(ofDay(day));
/** An account day with its year: "11 Nov 2026", "Nov 11, 2026". */
export const fullDayWords = (day: string) => formatter("full", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(ofDay(day));
/** The month an account day is in, with its year: "November 2026". */
export const monthYearWords = (day: string) => formatter("monthYear", { month: "long", year: "numeric", timeZone: "UTC" }).format(ofDay(day));
/** The month an account day is in, as a label: its three letters, "Nov", never an initial. */
export const monthWords = (day: string) => formatter("month", { month: "short", timeZone: "UTC" }).format(ofDay(day));

/** An hour and minutes on the clock, in the account's hour cycle: "21:47" or "9:47 pm". */
function clockWords(hour: number, minute: number): string {
  const mm = String(minute).padStart(2, "0");
  if (formats.time === "h24") return `${String(hour).padStart(2, "0")}:${mm}`;
  return `${hour % 12 === 0 ? 12 : hour % 12}:${mm} ${hour < 12 ? "am" : "pm"}`;
}
/** A moment (ms since epoch) as the time of day on this device's clock, "21:47" or "9:47 pm": when a video will end. */
export function hourWords(at: number): string {
  const d = new Date(at);
  return clockWords(d.getHours(), d.getMinutes());
}
/** An hour of the day as a label, on the hour: "06:00", "18:00", or "6 am", "6 pm". */
export function hourOfDayWords(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  if (formats.time === "h24") return clockWords(h, 0);
  return `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "am" : "pm"}`;
}
/**
 * An hour of the day as the span it covers, an en dash between and no spaces: "15:00–16:00", midnight's
 * "23:00–00:00"; or "3–4 pm", "11 am–12 pm", "11 pm–12 am", the am or pm said once where both ends share it.
 */
export function hourSpanWords(hour: number): string {
  const from = ((hour % 24) + 24) % 24;
  const to = (from + 1) % 24;
  if (formats.time === "h24") return `${clockWords(from, 0)}–${clockWords(to, 0)}`;
  const half = (h: number) => (h < 12 ? "am" : "pm");
  const twelve = (h: number) => (h % 12 === 0 ? 12 : h % 12);
  return half(from) === half(to) ? `${twelve(from)}–${twelve(to)} ${half(to)}` : `${hourOfDayWords(from)}–${hourOfDayWords(to)}`;
}

/** The zone this device is in, by its name in the time zone database: what an account's zone starts as (`App.tsx` writes it the first time the account opens Panki). */
export const DEVICE_ZONE = new Intl.DateTimeFormat().resolvedOptions().timeZone;

/** The day an instant falls in on some calendar: the account's, from `daysOf`. */
export type DayReader = (at: number) => Day;
/**
 * The account's days as every "yesterday" and "3 days ago" reads them: its day start in its zone (`dayOf`, the API's
 * own). Its settings not known yet (the extension before they arrive), the day starts as an account's begins, in this
 * device's zone, as the formats fall back.
 */
export function daysOf(settings: Pick<Settings, "dayStartHour" | "timeZone"> | null): DayReader {
  const hour = settings?.dayStartHour ?? DEFAULT_SETTINGS.dayStartHour;
  const zone = settings?.timeZone || DEVICE_ZONE;
  return (at) => dayOf(at, hour, zone);
}

/**
 * How long ago a moment was, to end a sentence ("Finished just now"): "just now" under an hour,
 * "1 hour ago", "5 hours ago" under a day, then by the account's days (`day`) "yesterday", "3 days ago" within the
 * week, and the date after ("on 10 October 2026").
 */
export function sinceWords(at: number, now: number, day: DayReader): string {
  const hours = Math.floor((now - at) / 3_600_000);
  if (hours < 1) return "just now";
  if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  const days = Math.max(1, daysBetween(day(at), day(now)));
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return `on ${dateWords(at)}`;
}

/** How long ago a moment was, by the account's days (`day`): "Today", "Yesterday", "3 days ago", then the date in words. */
export function agoWords(at: number, now: number, day: DayReader): string {
  const days = daysBetween(day(at), day(now));
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return dateWords(at);
}
