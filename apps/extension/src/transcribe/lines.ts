import { cutLines, lineWidthOf, type PlacedWord, type Transcript, type TranscriptWord } from "@panki/contracts";
import type { Line } from "../capture/captions";

/**
 * A transcript's words as lines under the player, in the same shape the site's captions come in (`captions.ts` →
 * `Line`), so the rows under the player, a pick, a sentence and a clip all read a transcript exactly as they read
 * captions. Each word is a mark, so the word being said carries the mark and a clip's ends know every word's time:
 * when it began and when it was over, as the engine heard it. Where a line ends is the contracts' `cutLines`, the
 * server's Proofread by a rule cutting the same lines. A transcript line's id is negative, so it's never taken for a
 * caption line's.
 */

/** A silence longer than this starts a new stretch of talk (`Line.run`), as the captions' own `NEAR` does. */
const NEAR = 4;

export type TranscriptLine = Line & { words: readonly PlacedWord[] };

export function linesOf(words: readonly TranscriptWord[]): TranscriptLine[] {
  const lines: TranscriptLine[] = [];
  for (const cut of cutLines(words)) {
    const id = -(lines.length + 1);
    const before = lines.at(-1);
    const follows = before !== undefined && before.end !== null && cut.start - before.end <= NEAR;
    lines.push({ id, text: cut.text, start: cut.start, end: cut.end, marks: cut.marks, run: follows ? before.run : id, seq: follows ? before.seq + 1 : 0, words: cut.words });
  }
  return lines;
}

/** The widest line, in full-width characters, so the rows under the player are cut to fit it. */
export function widestOf(lines: readonly TranscriptLine[]): number {
  return lines.reduce((widest, line) => Math.max(widest, Math.ceil(lineWidthOf(line.text))), 0);
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
