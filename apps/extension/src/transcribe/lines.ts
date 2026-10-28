import type { Transcript, TranscriptWord } from "@panki/contracts";
import type { Line } from "../capture/captions";

/**
 * A transcript's words as lines under the player, in the same shape the site's captions come in (`captions.ts` →
 * `Line`), so the rows under the player, a pick, a sentence and a clip all read a transcript exactly as they read
 * captions. Each word is a mark, so the word being said carries the mark and a clip's ends know every word's time:
 * when it began and when it was over, as the engine heard it.
 *
 * A line is a sentence or a clause: it ends at a full stop, at a pause between words, or when it's long enough that it
 * wouldn't fit a row. A transcript line's id is negative, so it's never taken for a caption line's.
 *
 * Lines are kept from coming out a word or two long (the owner, 2026-10-17: "sometimes there's only one word and it
 * appears and disappears really fast… the old text ends up disappearing a lot quicker than I'd like"): a short pause
 * cuts a line only once the line is `ENOUGH` long, so a hesitation inside a sentence doesn't cut it in two, and a
 * line may run to `LONG` before its length cuts it. Before that day a pause of 0.7 cut a line whatever its length,
 * `LONG` was 30 and `LONG_AT_COMMA` 20: the five numbers below are the whole of the change, should it be unwanted.
 */

/** A pause between two words this long ends a line whatever its length: a breath between two thoughts. Seconds. */
const PAUSE_LONG = 2;
/** A pause this long ends a line once the line is `ENOUGH` long, in full-width characters. Seconds. */
const PAUSE = 0.7;
const ENOUGH = 14;
/** A line is cut at a word boundary once it's this long, in full-width characters; after a comma sooner. */
const LONG = 36;
const LONG_AT_COMMA = 26;
/** A silence longer than this starts a new stretch of talk (`Line.run`), as the captions' own `NEAR` does. */
const NEAR = 4;
const ENDS = /[。！？!?…」]$/;
const COMMA = /[、,]$/;

/** How wide a text is drawn, in full-width characters: a kana or a kanji is one, a Latin letter or a digit a bit over half. */
function widthOf(text: string): number {
  let width = 0;
  for (const char of text) width += (char.codePointAt(0) ?? 0) >= 0x2e80 ? 1 : 0.6;
  return width;
}

/** Where each word of a line stands in its text, for a word pressed to be known by its id. */
type Placed = { id: number; from: number; to: number };
export type TranscriptLine = Line & { words: readonly Placed[] };

export function linesOf(words: readonly TranscriptWord[]): TranscriptLine[] {
  const lines: TranscriptLine[] = [];
  let open: { text: string; start: number; end: number; marks: { at: number; time: number; over: number }[]; placed: Placed[] } | null = null;
  const close = () => {
    if (!open) return;
    const id = -(lines.length + 1);
    const before = lines.at(-1);
    const follows = before !== undefined && before.end !== null && open.start - before.end <= NEAR;
    lines.push({ id, text: open.text, start: open.start, end: open.end, marks: open.marks, run: follows ? before.run : id, seq: follows ? before.seq + 1 : 0, words: open.placed });
    open = null;
  };
  for (const word of words) {
    const text = word.text.trim();
    if (text === "") continue;
    const start = word.startMs / 1000;
    const end = Math.max(start, word.endMs / 1000);
    if (open) {
      const width = widthOf(open.text);
      const last = open.text;
      const pause = start - open.end;
      if (ENDS.test(last) || pause >= PAUSE_LONG || (pause >= PAUSE && width >= ENOUGH) || width >= LONG || (width >= LONG_AT_COMMA && COMMA.test(last))) close();
    }
    if (!open) open = { text: "", start, end, marks: [], placed: [] };
    const at = open.text.length;
    open.marks.push({ at, time: start, over: end });
    open.placed.push({ id: word.id, from: at, to: at + text.length });
    open.text += text;
    open.end = Math.max(open.end, end);
  }
  close();
  return lines;
}

/** The widest line, in full-width characters, so the rows under the player are cut to fit it. */
export function widestOf(lines: readonly TranscriptLine[]): number {
  return lines.reduce((widest, line) => Math.max(widest, Math.ceil(widthOf(line.text))), 0);
}

/** Whether a moment of the video lies in a stretch that has been transcribed. */
export function coveredAt(transcript: Transcript | null, seconds: number): boolean {
  if (!transcript) return false;
  const ms = seconds * 1000;
  return transcript.covered.some((stretch) => ms >= stretch.startMs && ms < stretch.endMs);
}

/** The first moment at or after `seconds` that hasn't been transcribed; null when everything from there to `end` has. */
export function nextUncovered(transcript: Transcript | null, seconds: number, end: number | null): number | null {
  let at = Math.max(0, seconds);
  if (!transcript) return at;
  for (const stretch of transcript.covered) {
    if (at * 1000 >= stretch.startMs && at * 1000 < stretch.endMs) at = stretch.endMs / 1000;
  }
  return end !== null && at >= end - 0.5 ? null : at;
}

/** The end, in seconds, of the transcribed stretch a moment lies in; null when it lies in none. */
export function coveredUntil(transcript: Transcript | null, seconds: number): number | null {
  if (!transcript) return null;
  const ms = seconds * 1000;
  const stretch = transcript.covered.find((s) => ms >= s.startMs && ms < s.endMs);
  return stretch ? stretch.endMs / 1000 : null;
}
