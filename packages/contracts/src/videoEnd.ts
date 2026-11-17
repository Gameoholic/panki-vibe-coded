/** @panki Find where the video ends as shapes: its answer, Panki's check, what it's sent (`VideoEndShape`, `videoEndProblem`, `videoEndLines`, `videoEndPieces`, `VideoEndAsk`). */
import { z } from "zod";
import { AiRanOn, PankiAiStatus, adminPromptOf, type AdminPromptPlaceId } from "./ai";
import type { AiVerdict } from "./aiCall";
import { PromptPieces, type PromptPieces as Pieces } from "./prompt";
import { FIND_VIDEO_END, Transcript, VIDEO_END_LINES_LEAST, VIDEO_END_TAIL_MS, VideoId, WHOLE_MAX_MS, type TranscriptWord } from "./transcription";
import { cutLines } from "./transcriptLines";
import { expectedGot } from "./unread";

/**
 * Find where the video ends (`docs/OUTRO.md`): where a video's own content ends, found by Panki AI from the end of its
 * finished transcript, so it counts as finished from there (`VideoEnd`, `watching.ts` → `finishesAt`). The server reads
 * the lines as they stand, numbers the last `VIDEO_END_TAIL_MS` of them into the admin's prompt with when each starts
 * (`videoEndPieces`), and the model names the last line of the content (`VideoEndShape`); Panki puts the Video end
 * where that line's words end, so no time the model writes is ever used. One per video, everyone's: an automation finds
 * it once, a press asks again (the new answer standing, the latest placing), and a person moves it by hand to fix it.
 */

/**
 * The answer's one fixed shape, plain and required: the last line of the content by its number in `{Transcript}`, and
 * why. Read with `videoEndProblem`.
 */
export const VideoEndShape = z.object({
  line: z.number().int().describe("the number of the last line of the video's own content, in <transcript>; Panki puts the Video end where that line's words end"),
  reason: z.string().max(2_000).describe("why there, in a few words; kept with the Video end"),
});
export type VideoEndShape = z.infer<typeof VideoEndShape>;

/** Which of Panki's rules an answer breaks, as expected against got (`unread.ts`), or null: a line that wasn't sent, an empty reason. `count` is how many lines were sent, numbered from 1. */
export function videoEndProblem(answer: VideoEndShape, count: number): string | null {
  if (answer.line < 1 || answer.line > count) return expectedGot(`a line number from 1 to ${count}`, `${answer.line}`);
  if (answer.reason.trim() === "") return expectedGot("a reason", "an empty one");
  return null;
}

/** A line as Find where the video ends reads it: when its words start and end in the video, in ms, and what it says. */
export type EndLine = { startMs: number; endMs: number; text: string };
/** A transcript's lines as a person sees them (`cutLines`, the one rule of where a line ends), as it reads them. */
export const endLinesOf = (words: readonly TranscriptWord[]): EndLine[] =>
  cutLines(words).map((line) => ({ startMs: Math.round(line.start * 1000), endMs: Math.round(line.end * 1000), text: line.text }));
/**
 * The lines it's sent, in order: those reaching into the video's last `VIDEO_END_TAIL_MS` (every line of a shorter
 * video), and never fewer than the last `VIDEO_END_LINES_LEAST`.
 */
export function videoEndLines<L extends EndLine>(lines: readonly L[], lengthMs: number): L[] {
  const first = lines.findIndex((line) => line.endMs > lengthMs - VIDEO_END_TAIL_MS);
  const from = Math.max(0, Math.min(first < 0 ? lines.length : first, lines.length - VIDEO_END_LINES_LEAST));
  return lines.slice(from);
}

/** Find where the video ends' prompt as it stands (the admin's, else Panki's own), as a call runs it: no follow-ups, a run finds. */
export const videoEndPromptOf = (settings: { aiPrompts: Partial<Record<AdminPromptPlaceId, string>> }): { name: string; prompt: string; followUp: string } => ({
  name: FIND_VIDEO_END,
  prompt: adminPromptOf(settings, "videoEnd"),
  followUp: "",
});

/** A moment of the video as the prompt writes it: "12:34", "1:02:03" from an hour on. */
function stampOf(ms: number): string {
  const all = Math.floor(ms / 1000);
  const [h, m, s] = [Math.floor(all / 3600), Math.floor((all % 3600) / 60), all % 60];
  const two = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`;
}

/**
 * The pieces a call fills the prompt with, from the lines sent (`videoEndLines`): `{Transcript}`, each line its number,
 * a tab, when it starts, a tab and its text; `{Video length}`, how long the whole video is. The server builds them from
 * the stored transcript; the page builds the same from what it shows, for Details.
 */
export function videoEndPieces(lines: readonly EndLine[], lengthMs: number): Pieces {
  return {
    transcript: lines.map((line, i) => `${i + 1}\t${stampOf(line.startMs)}\t${line.text}`).join("\n"),
    videoLength: stampOf(lengthMs),
  };
}

/** What a press of Find where the video ends sends: the video, its length as the player says it, and the pieces only the page has (its link and description). */
export const VideoEndAsk = z.object({ videoId: VideoId, lengthMs: z.number().int().positive().max(WHOLE_MAX_MS), pieces: PromptPieces });
export type VideoEndAsk = z.infer<typeof VideoEndAsk>;

/** A Video end found: the line named, by its number in the lines sent, why, where that puts the Video end, the answer as it came, the tokens and what they cost, and what it ran on. */
export const VideoEndFound = z.object({
  line: z.number().int().positive(),
  reason: z.string(),
  atMs: z.number().int().nonnegative(),
  raw: z.string(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  costMicros: z.number().int().nonnegative(),
  ranOn: AiRanOn.optional(),
});
export type VideoEndFound = z.infer<typeof VideoEndFound>;
export const VideoEndResponse = z.object({ found: VideoEndFound, transcript: Transcript, ai: PankiAiStatus });
export type VideoEndResponse = z.infer<typeof VideoEndResponse>;

/** What the answer said, as Details' Log lists it: the line named, where that puts the Video end, and why. */
export const videoEndVerdicts = (found: Pick<VideoEndFound, "line" | "reason" | "atMs">): AiVerdict[] => [
  { name: `Line ${found.line}`, tag: { words: "Video end", look: "accent" }, value: stampOf(found.atMs), reason: found.reason },
];
