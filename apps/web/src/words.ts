/**
 * What Video tracking does, said under it in the extension, where it's switched, and in Panki's Settings, where it's
 * shown: the same words in both (the owner, 2026-10-28: "read exactly like the extension setting one").
 */
export const VIDEO_TRACKING_WHY =
  "Records every YouTube video you watch: which one, when, how long you watched and where you stopped. Continue watching, Recently watched, your watch time and Panki's other watching stats use it.";

// `VIDEO_TRACKING_OFF` ("Video tracking is off", the tiles' and YouTube's shelves' while the account's was) went when
// Video tracking became each browser's own, 2026-11-02.

/**
 * The tag beside what's kept on this device alone (`PerDevice`, the owner, 2026-11-02: "I want as a user to know what's
 * per device"); everything untagged is the account's.
 */
export const PER_DEVICE = "This device";

/** "1 card", "2 cards", "212,345 words": every count the owner reads is phrased here. */
export function count(n: number, one: string, many: string) {
  return `${n.toLocaleString("en")} ${wordFor(n, one, many)}`;
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

/** Seconds as a time on a player, "0:03", "12:34", and past the hour "1:02:03". */
export function clock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor(whole / 60) % 60;
  const rest = String(whole % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`;
}

/** A wait that's only roughly known, "~40 s", "~3 min": how long transcribing takes, as measured so far. */
export function aboutWords(seconds: number): string {
  return seconds < 90 ? `~${Math.max(1, Math.round(seconds))} s` : `~${Math.round(seconds / 60)} min`;
}

/** Seconds as a length of time in words, to the minute: "3 h 12 min", "48 min", "3 h", "0 min". */
export function durationWords(seconds: number): string {
  const minutes = Math.round(Math.max(0, seconds) / 60);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/**
 * What's left of a video stopped part-way, and how much of it was watched: "3 min left · 84%" (the owner, 2026-10-25:
 * "add the % of the video next to the X min left"). The time left is to the whole minute up, so a few seconds short is
 * never "0 min"; the share is to the whole percent down, so a video never reads 100% before it's done. Continue
 * watching's cards and tiles all say it this way.
 */
export function leftWords(stoppedAtMs: number, lengthMs: number): string {
  const left = durationWords(Math.ceil(Math.max(0, lengthMs - stoppedAtMs) / 60_000) * 60);
  const share = lengthMs > 0 ? Math.min(99, Math.floor((stoppedAtMs / lengthMs) * 100)) : 0;
  return `${left} left · ${share}%`;
}

/** How long something took, in full words: "26 seconds", "2 minutes 5 seconds", "1 hour 3 minutes" (seconds left out past the hour). */
export function tookWords(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor(whole / 60) % 60;
  const rest = whole % 60;
  const parts = hours > 0 ? [count(hours, "hour", "hours"), minutes > 0 ? count(minutes, "minute", "minutes") : ""] : [minutes > 0 ? count(minutes, "minute", "minutes") : "", rest > 0 || minutes === 0 ? count(rest, "second", "seconds") : ""];
  return parts.filter(Boolean).join(" ");
}

/** A length of time packed tight, "21m49s", "1h3m5s", "49s": the hours and the minutes left out while they're 0. */
export function hmsWords(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor(whole / 60) % 60;
  return `${hours > 0 ? `${hours}h` : ""}${minutes > 0 ? `${minutes}m` : ""}${whole % 60}s`;
}

/**
 * What something costs at a listed price, from whole micro-dollars (the usage ledger's unit, `MICROS_PER_CENT` to the
 * cent), one of two ways everywhere (the owner, 2026-10-30): from a cent up, dollars and cents, "$0.70 (est.)",
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

const DATE_WORDS = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "long", year: "numeric" });
/** A moment (ms since epoch) as a date in words, "10 October 2026", never a raw number. */
export function dateWords(at: number): string {
  return DATE_WORDS.format(new Date(at));
}

const HOUR_WORDS = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
/** A moment (ms since epoch) as the time of day on this device's clock, "21:47": when a video will end. */
export function hourWords(at: number): string {
  return HOUR_WORDS.format(new Date(at));
}

/**
 * How long ago a moment was, to end a sentence ("Finished just now"; the owner, 2026-10-25): "just now" under an hour,
 * "1 hour ago", "5 hours ago" under a day, then by the device's calendar "yesterday", "3 days ago" within the week,
 * and the date after ("on 10 October 2026").
 */
export function sinceWords(at: number, now: number): string {
  const hours = Math.floor((now - at) / 3_600_000);
  if (hours < 1) return "just now";
  if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  const dayStart = (ms: number) => new Date(new Date(ms).toDateString()).getTime();
  const days = Math.max(1, Math.round((dayStart(now) - dayStart(at)) / 86_400_000));
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return `on ${dateWords(at)}`;
}

/** How long ago a moment was, by the device's calendar: "Today", "Yesterday", "3 days ago", then the date in words. */
export function agoWords(at: number, now: number): string {
  const dayStart = (ms: number) => new Date(new Date(ms).toDateString()).getTime();
  const days = Math.round((dayStart(now) - dayStart(at)) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return dateWords(at);
}
