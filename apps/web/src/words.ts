/** "1 card", "2 cards", "212,345 words": every count the owner reads is phrased here. */
export function count(n: number, one: string, many: string) {
  return `${n.toLocaleString("en")} ${n === 1 ? one : many}`;
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

/** A whole number of US cents as dollars, "$0.70", "$1,234.05": the cents stay whole, only this display splits them. */
export function dollarWords(cents: number): string {
  const whole = Math.max(0, Math.round(cents));
  return `$${Math.floor(whole / 100).toLocaleString("en")}.${String(whole % 100).padStart(2, "0")}`;
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
