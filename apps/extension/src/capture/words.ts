import { clock, isJapanese } from "@web/words";

/** A piece of a line: a word that can be picked, or what stands between words (a comma, a space). Its place is in characters of the line. */
export type Token = { text: string; word: boolean; start: number; end: number };
/** A run of tokens, first and last, both counted in. */
export type Span = readonly [first: number, last: number];

/**
 * A line split into words by the browser's own splitter, which knows Japanese has no spaces. It splits finer than a
 * dictionary would (a verb and its ending come apart: 探 · し · てい · た), which is why a pick can be widened to the
 * piece beside it. With a dictionary the line is split by `dictionary/split.ts` instead, and these pieces only stand
 * in where no word of it fits.
 */
export function tokensOf(text: string): Token[] {
  if (text === "") return [];
  if (typeof Intl.Segmenter !== "function") return [{ text, word: true, start: 0, end: text.length }];
  const segmenter = new Intl.Segmenter(isJapanese(text) ? "ja" : undefined, { granularity: "word" });
  return Array.from(segmenter.segment(text), (piece) => ({ text: piece.segment, word: piece.isWordLike === true, start: piece.index, end: piece.index + piece.segment.length }));
}

/** What a press on a word picks: that word alone, or, when it stands right beside what's picked, the run of both. */
export function pick(picked: Span | null, at: number): Span {
  if (picked && (at === picked[0] - 1 || at === picked[1] + 1)) return [Math.min(picked[0], at), Math.max(picked[1], at)];
  return [at, at];
}

export function textOf(tokens: readonly Token[], span: Span | null): string {
  return span ? tokens.slice(span[0], span[1] + 1).map((token) => token.text).join("") : "";
}

/** The words a stretch of characters touches, as a run; null when it touches none. */
export function spanOver(tokens: readonly Token[], from: number, to: number): Span | null {
  let first = -1;
  let last = -1;
  tokens.forEach((token, i) => {
    if (!token.word || token.end <= from || token.start >= to) return;
    if (first < 0) first = i;
    last = i;
  });
  return first < 0 ? null : [first, last];
}

/** A moment of a video to the hundredth of a second, "12:34.56": where a clip begins and ends. The app's own `clock`, with the hundredths after it. */
export function stamp(seconds: number): string {
  const hundredths = Math.max(0, Math.round(seconds * 100));
  return `${clock(Math.floor(hundredths / 100))}.${String(hundredths % 100).padStart(2, "0")}`;
}

/**
 * A moment of a video as it's typed, in seconds: "12:34.56" as `stamp` writes it, and also "1:02:03", "34.5", "34".
 * A comma is taken for the point. Null when what's typed isn't a moment.
 */
export function parseStamp(text: string): number | null {
  const parts = text.trim().replace(",", ".").split(":");
  if (parts.length > 3) return null;
  // Whole numbers but for the last, which may have a fraction: the seconds.
  const whole = parts.slice(0, -1).every((part) => /^\d+$/.test(part));
  if (!whole || !/^\d+(\.\d*)?$/.test(parts.at(-1) ?? "")) return null;
  return parts.reduce((total, part) => total * 60 + Number(part), 0);
}
