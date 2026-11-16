/** @panki A transcript's words cut into lines, the one rule of where a line ends, for the page's rows and the server's Proofread alike (`cutLines`, `lineWidthOf`). */
import type { TranscriptWord } from "./transcription";

/**
 * Where a transcript's lines end, one home for the page (the rows under the player, `linesOf`) and the server (a rule's
 * Proofread, which sends the lines a person sees). A line is a sentence or a clause: it ends at a full stop, at a pause
 * between words, or when it's long enough that it wouldn't fit a row.
 *
 * Lines are kept from coming out a word or two long, which would flash by too fast to read: a short pause cuts a line
 * only once the line is `ENOUGH` long, so a hesitation inside a sentence doesn't cut it in two, and a line may run to
 * `LONG` before its length cuts it.
 */

/** A pause between two words this long ends a line whatever its length: a breath between two thoughts. Seconds. */
const PAUSE_LONG = 2;
/** A pause this long ends a line once the line is `ENOUGH` long, in full-width characters. Seconds. */
const PAUSE = 0.7;
const ENOUGH = 14;
/** A line is cut at a word boundary once it's this long, in full-width characters; after a comma sooner. */
const LONG = 36;
const LONG_AT_COMMA = 26;
const ENDS = /[。！？!?…」]$/;
const COMMA = /[、,]$/;

/** How wide a text is drawn, in full-width characters: a kana or a kanji is one, a Latin letter or a digit a bit over half. */
export function lineWidthOf(text: string): number {
  let width = 0;
  for (const char of text) width += (char.codePointAt(0) ?? 0) >= 0x2e80 ? 1 : 0.6;
  return width;
}

/** Where a word of a line stands in its text, for a word pressed to be known by its id. */
export type PlacedWord = { id: number; from: number; to: number };
/** A line as cut: its text, when it begins and ends in seconds, a mark at each word's start (`at` in the text), and its words placed. */
export type CutLine = { text: string; start: number; end: number; marks: { at: number; time: number; over: number }[]; words: PlacedWord[] };

/** A transcript's words, in the video's order, cut into lines; a word with no text is passed over. */
export function cutLines(words: readonly TranscriptWord[]): CutLine[] {
  const lines: CutLine[] = [];
  let open: CutLine | null = null;
  const close = () => {
    if (open) lines.push(open);
    open = null;
  };
  for (const word of words) {
    const text = word.text.trim();
    if (text === "") continue;
    const start = word.startMs / 1000;
    const end = Math.max(start, word.endMs / 1000);
    if (open) {
      const current: CutLine = open;
      const width = lineWidthOf(current.text);
      const last = current.text;
      const pause = start - current.end;
      // A line split or joined by hand at this word (`LineMark`) decides before anything else.
      if (word.line === "break") close();
      else if (word.line !== "join" && (ENDS.test(last) || pause >= PAUSE_LONG || (pause >= PAUSE && width >= ENOUGH) || width >= LONG || (width >= LONG_AT_COMMA && COMMA.test(last)))) close();
    }
    const line: CutLine = open ?? { text: "", start, end, marks: [], words: [] };
    open = line;
    const at = line.text.length;
    line.marks.push({ at, time: start, over: end });
    line.words.push({ id: word.id, from: at, to: at + text.length });
    line.text += text;
    line.end = Math.max(line.end, end);
  }
  close();
  return lines;
}
