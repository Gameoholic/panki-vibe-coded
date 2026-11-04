import { z } from "zod";
import { AiRanOn, PankiAiStatus, TemplateId } from "./ai";
import type { AiVerdict } from "./aiCall";
import { PromptPieces, type PromptPieces as Pieces } from "./prompt";
import { LINE_FIX_TEXT_MAX, LINE_FIX_WORDS_MAX, Transcript, VideoId, type TranscriptWord } from "./transcription";
import { expectedGot } from "./unread";

/**
 * Proofread (AI step 6): a video's Panki subtitles put right by Panki AI. The page sends the lines it shows, as their
 * words' ids (`linesOf`); the server reads each word as it stands now, numbers the lines into the prompt
 * (`proofreadPieces`, one home for how they're written, so the page's Details say what went), and lays each corrected
 * line the model sends back onto its words as the pencil's edit is (`realignLine`): every word it changes is a fix of
 * the AI's, kept beside the engine's word. Whichever came later wins (the owner, 2026-11-03), and an AI edit is
 * undone a word at a time or a run at a time (`TranscriptUndo`), one step back.
 */

/** The most lines one ask can carry: a long video's run goes as several calls (`batchesOf`). */
export const PROOFREAD_LINES_MAX = 2_000;
/** How much transcript one call sends at most, in characters: about 35 minutes of Japanese, well inside Max request length's 30,000 with the prompt. */
export const PROOFREAD_CALL_CHARS = 12_000;
/** The lines either side of a row proofread alone, sent to read (its `{Surrounding video subtitles}`). */
export const PROOFREAD_AROUND = 3;

/** One line as Proofread corrects it: its number in `{Transcript}`, the whole of it as it should read, and why. */
export const ProofreadLineAnswer = z.object({
  line: z.number().int().describe("the line's number in <transcript>"),
  text: z.string().max(LINE_FIX_TEXT_MAX).describe("the whole line as it should read; Panki lays it back onto the line's words, and every word that changes gets the spark"),
  reason: z.string().max(2_000).describe("why, in a few words; shown with the word when it's opened to edit"),
});
export type ProofreadLineAnswer = z.infer<typeof ProofreadLineAnswer>;
/**
 * Proofread's fixed shape, plain and required, nothing nullable: the lines it changes and only those, `[]` when every
 * line is right. A line given back as it already reads changes nothing and is passed over.
 */
export const ProofreadShape = z.object({
  lines: z.array(ProofreadLineAnswer).max(PROOFREAD_LINES_MAX).describe("one entry for each line that needs correcting, and only those; [] when every line is right"),
});
export type ProofreadShape = z.infer<typeof ProofreadShape>;

/** How far a corrected line may stray from the line's own length before it reads as rewritten: half of it, and never less than this. */
const STRAY_MIN = 6;
/**
 * Which of Panki's rules a Proofread answer breaks, as expected against got (`unread.ts`), or null: a line not sent or
 * named twice, an empty line or reason, a line rewritten past a correction's length. `before` is each line sent as it
 * read, in order, numbered from 1.
 */
export function proofreadProblem(answer: ProofreadShape, before: readonly string[]): string | null {
  const seen = new Set<number>();
  for (const { line, text, reason } of answer.lines) {
    if (line < 1 || line > before.length) return expectedGot(`line numbers from 1 to ${before.length}`, `${line}`);
    if (seen.has(line)) return expectedGot(`each line once`, `line ${line} twice`);
    seen.add(line);
    if (text.trim() === "") return expectedGot(`the corrected text of line ${line}`, "an empty one");
    if (reason.trim() === "") return expectedGot(`a reason for line ${line}`, "an empty one");
    const was = [...(before[line - 1] ?? "")].length;
    const now = [...text.trim()].length;
    if (Math.abs(now - was) > Math.max(STRAY_MIN, Math.ceil(was / 2))) return expectedGot(`line ${line} corrected, near its ${was} characters`, `${now} characters`);
  }
  return null;
}

/** A call's answer limit: 300 tokens and 40 a line sent, at most Max Proofread answer length. What its "Up to" is worked out from, and what the server asks for. */
export const proofreadTokens = (lines: number, max: number): number => Math.min(max, 300 + 40 * Math.max(1, lines));

/** A word of a line as Proofread reads it: what it says now, whether a person edited it last, whether the engine was unsure of it. */
export type ProofreadWord = { text: string; hand: boolean; unsure: boolean };
export const proofreadWordOf = (word: Pick<TranscriptWord, "text" | "fix" | "unsure">): ProofreadWord => ({
  text: word.text,
  hand: word.fix?.by === "hand",
  unsure: word.unsure === true,
});
/** A line's text from its words, as the rows under the player read it (`linesOf`): each word trimmed, run together. */
export const lineTextOf = (words: readonly { text: string }[]): string => words.map((w) => w.text.trim()).join("");

/**
 * The pieces a Proofread call fills its template with, from the lines as they stand: `{Transcript}`, each line its
 * number, a tab and its text; `{Edited by hand}` and `{Unsure words}`, by line number, "2: 氏, 茶筅"; and for a row
 * proofread alone, the lines either side as `{Surrounding video subtitles}`. The server builds them from the stored
 * transcript; the page builds the same from what it shows, for Details.
 */
export function proofreadPieces(lines: readonly (readonly ProofreadWord[])[], around: readonly (readonly ProofreadWord[])[] = []): Pieces {
  const listed = (pick: (w: ProofreadWord) => boolean) =>
    lines
      .flatMap((words, i) => {
        const picked = words.filter((w) => pick(w) && w.text.trim() !== "").map((w) => w.text.trim());
        return picked.length > 0 ? [`${i + 1}: ${picked.join(", ")}`] : [];
      })
      .join("\n");
  return {
    transcript: lines.map((words, i) => `${i + 1}\t${lineTextOf(words)}`).join("\n"),
    handEdited: listed((w) => w.hand),
    unsure: listed((w) => w.unsure),
    surrounding: around.map(lineTextOf).filter((text) => text !== "").join("\n"),
  };
}

/** A run's lines split into calls of at most `PROOFREAD_CALL_CHARS` of text each, in order, each at least one line; their indexes. */
export function batchesOf(lines: readonly string[], most = PROOFREAD_CALL_CHARS): number[][] {
  const batches: number[][] = [];
  let open: number[] = [];
  let size = 0;
  lines.forEach((text, i) => {
    if (open.length > 0 && size + text.length > most) {
      batches.push(open);
      open = [];
      size = 0;
    }
    open.push(i);
    size += text.length;
  });
  if (open.length > 0) batches.push(open);
  return batches;
}

/** A line as it's sent: its words by id, in order. */
const LineIds = z.array(z.number().int()).min(1).max(LINE_FIX_WORDS_MAX);
/**
 * What a Proofread call sends: the template, the video, the lines to proofread as their words' ids, for a row alone the
 * lines either side to read (`around`), the pieces only the page has (the video's metadata and description), and the
 * run it belongs to, minted by the page (one id across a long video's calls, so Undo all takes the whole run back).
 * `{Transcript}`, `{Edited by hand}`, `{Unsure words}` and the surrounding lines are the server's, from the store.
 */
export const ProofreadAsk = z.object({
  templateId: TemplateId,
  videoId: VideoId,
  lines: z.array(LineIds).min(1).max(PROOFREAD_LINES_MAX),
  around: z.array(LineIds).max(PROOFREAD_AROUND * 2).default([]),
  pieces: PromptPieces,
  run: z.uuid(),
});
export type ProofreadAsk = z.infer<typeof ProofreadAsk>;

/**
 * A Proofread call answered: the lines it changed, by their number in the lines sent, with what each reads as now and
 * why; how many words that came to; the answer as it came; the tokens and what they cost; what it ran on.
 */
export const Proofread = z.object({
  lines: z.array(ProofreadLineAnswer),
  words: z.number().int().nonnegative(),
  raw: z.string(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  costMicros: z.number().int().nonnegative(),
  ranOn: AiRanOn.optional(),
});
export type Proofread = z.infer<typeof Proofread>;
export const ProofreadResponse = z.object({ proofread: Proofread, transcript: Transcript, ai: PankiAiStatus });
export type ProofreadResponse = z.infer<typeof ProofreadResponse>;

/** Panki AI's edits taken back, one step each: one word's latest, or every word a run edited that it's still the latest of. */
export const TranscriptUndo = z.union([z.object({ wordId: z.number().int() }).strict(), z.object({ run: z.uuid() }).strict()]);
export type TranscriptUndo = z.infer<typeof TranscriptUndo>;

/** What a Proofread answer said, as Details' Log lists it: a row a line changed, its text and why. */
export const proofreadVerdicts = (lines: readonly ProofreadLineAnswer[]): AiVerdict[] =>
  lines.map((l) => ({ name: `Line ${l.line}`, tag: { words: "Edited", look: "accent" }, value: l.text, reason: l.reason }));
