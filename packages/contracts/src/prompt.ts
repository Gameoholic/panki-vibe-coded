import { z } from "zod";
import { AiRanOn, PankiAiStatus, TemplateId, tokenCostMicros, type AiModel, type PankiAi } from "./ai";
import { PIECE_NAMES, PROMPT_PIECE_IDS, PromptPieceId } from "./pieces";
import { expectedGot } from "./unread";

/**
 * Filling a Panki AI prompt from Prompt context's pieces (`pieces.ts`, the registry), what Explain sends and answers,
 * and what a call can cost before it runs. The API fills a template, so all of it lives here.
 */

/** The limits a piece's description says, as they're set (Admin → Panki AI → Limits). */
type PieceLimits = Pick<PankiAi, "aiMaxDescriptionChars" | "aiSurroundingSeconds">;
/** What each piece is, in Prompt context's Description column: in the words of what it holds, its limit read from the settings. */
export function pieceAbout(id: PromptPieceId, limits: PieceLimits): string {
  switch (id) {
    case "word":
      return "The word as it stands on the page";
    case "dictForm":
      return "The word as the dictionary lists it";
    case "dictReading":
      return "How it's read";
    case "dictMeaning":
      // The one meanings list, every action's (`meaningsPiece`).
      return 'Every meaning of the dictionaries that are on, as a JSON list, one entry each: "meaning" its words, "index" its number from 1';
    case "dictTags":
      return "The dictionary's labels on the word, as it explains them";
    case "dictWordType":
      return "Which kind of verb or adjective it is";
    case "dictFrequency":
      return "How common it is: the band, then each list's number";
    case "dictPitch":
      return "Where the voice falls, as the reading and its number";
    case "sentence":
      return "The sentence the word was pointed at in";
    case "source":
      return "The video's title, its channel, and its link with the timestamp";
    case "surrounding":
      return `What's said in the ${limits.aiSurroundingSeconds} seconds before and after the word, from the subtitles showing`;
    case "description":
      return `The video's description (max ${limits.aiMaxDescriptionChars.toLocaleString("en")} characters)`;
    case "learningLanguage":
      return "The language you're learning, as your Settings → General → Learning language says";
    case "language":
      return "The language Panki speaks to you in, as your Settings → General → Language says";
    case "card":
      return "The card being added: each of its fields by name, with what it holds now";
    case "question":
      return "What you asked in a follow-up";
    case "field":
      return "The field a follow-up was asked on, by its name on the card";
    case "transcript":
      return "The lines of Panki subtitles being proofread, numbered, each as it reads now";
    case "handEdited":
      return "The words of those lines a person edited last, by line number";
    case "unsure":
      return "The words of those lines the engine was unsure of, by line number, from its own confidence";
  }
}

/**
 * Every meaning of the dictionaries as a prompt is sent them (`{Meaning}`, one format for every action, Explain's and
 * Touch up's): a JSON list, one entry each in the list's order, its words and its index from 1,
 * nothing more. What's ticked on the card is never in it: the model judges each meaning against
 * the sentence alone, and Panki holds its verdicts against the ticks on its own side (`meaningVerdictOf`). One home for
 * the shape: the page building the piece and the server checking each index agree by construction.
 */
export function meaningsPiece(meanings: readonly string[]): string {
  return JSON.stringify(meanings.map((meaning, i) => ({ meaning, index: i + 1 })));
}

/** How a meaning stands in the sentence, one registry: its name on screen. The colours and the strike are `app.css`'s, by `.ai-accuracy.is-…`. */
export const ACCURACY_IDS = ["fits", "close", "wrong"] as const;
export const MeaningAccuracyId = z.enum(ACCURACY_IDS);
export type MeaningAccuracyId = z.infer<typeof MeaningAccuracyId>;
export const ACCURACY_NAMES: Record<MeaningAccuracyId, string> = { fits: "Fits", close: "Close", wrong: "Doesn't fit" };
/** One dictionary meaning as an answer judges it: by its index, how well it fits this sentence, and why. */
export const MeaningAccuracy = z.object({
  meaning: z.number().int().describe("the meaning's index in <meaning>"),
  accuracy: MeaningAccuracyId.describe("fits, close (near, but not quite) or wrong; Panki marks the meaning green, orange or red"),
  reason: z.string().max(2_000).describe("why, in a few words; shown under the meaning"),
});
export type MeaningAccuracy = z.infer<typeof MeaningAccuracy>;
/** Whether an answer's rows are exactly one for each meaning sent, each index once: what the server holds Explain's and Touch up's answers to. */
export const meaningsWhole = (rows: readonly { meaning: number }[], count: number): boolean =>
  rows.length === count && new Set(rows.map((row) => row.meaning)).size === count && rows.every((row) => row.meaning >= 1 && row.meaning <= count);
/**
 * The meaning Explain proposes when none of the dictionary's fits, in its own words, and why it fits. Shown as one more
 * meaning under the dictionary's, numbered after them, with the spark; never a dictionary meaning (never in `{Meaning}`).
 */
export const ProposedMeaning = z.object({
  meaning: z
    .string()
    .max(2_000)
    .describe("written as a dictionary entry in your Language, terse glosses separated by semicolons, no sentence or commentary; Panki shows it as one more meaning, after the dictionary's, with the spark"),
  reason: z.string().max(2_000).describe("why it fits this sentence, and any commentary; shown under it"),
});
export type ProposedMeaning = z.infer<typeof ProposedMeaning>;
/**
 * Which of Panki's rules an Explain answer that read as its shape breaks, said as expected against got for Details' Log
 * (`unread.ts` → `expectedGot`), or null: an explanation with nothing in it; rows that aren't exactly one for each
 * meaning sent, each index once (`meaningsWhole`); a proposed meaning beside a fitting row, or none when nothing fits.
 * What no schema can say.
 */
export function explainRuleBroken(answer: Pick<ExplainShape, "explanation" | "meanings" | "proposedMeaning">, count: number): string | null {
  if (answer.explanation.trim() === "") return expectedGot("an explanation", "an empty one");
  return meaningsRuleBroken(answer.meanings, answer.proposedMeaning, count);
}
/**
 * The meanings' rules, every action's that judges them (Explain's, Touch up's Meaning), said as expected against got:
 * exactly one row for each meaning sent, each index once (`meaningsWhole`); a proposed meaning beside a fitting row, or
 * none when nothing fits. Null when they hold.
 */
export function meaningsRuleBroken(rows: readonly MeaningAccuracy[], proposed: ProposedMeaning | null, count: number): string | null {
  if (!meaningsWhole(rows, count)) {
    return rows.length !== count
      ? expectedGot(`one row per meaning (${count})`, `${rows.length}`)
      : expectedGot(`one row per meaning (${count}), each index once from 1 to ${count}`, `indexes ${rows.map((row) => row.meaning).join(", ")}`);
  }
  const fits = rows.some((row) => row.accuracy === "fits");
  if (fits && proposed !== null) return expectedGot("no proposed meaning beside a fitting row", "one");
  if (!fits && proposed === null) return expectedGot("a proposed meaning when no row fits", "null");
  if (!fits && proposed?.meaning.trim() === "") return expectedGot("a proposed meaning when no row fits", "an empty one");
  return null;
}

/** The most any one piece can be as it's sent: far past every limit, so a broken value is refused, never kept whole. */
export const PIECE_MAX = 20_000;
export const PromptPieces = z.partialRecord(PromptPieceId, z.string().max(PIECE_MAX));
export type PromptPieces = z.infer<typeof PromptPieces>;

/** A variable in a template: a name in braces, on one line. */
const VARIABLE = /\{([^{}\n]+)\}/g;
const PIECE_BY_NAME = new Map<string, PromptPieceId>(PROMPT_PIECE_IDS.map((id) => [PIECE_NAMES[id], id]));
/** The piece a variable's name is; null for a name Panki doesn't know, which is sent as typed. */
export const pieceNamed = (name: string): PromptPieceId | null => PIECE_BY_NAME.get(name) ?? null;
/** Every variable in a template, with where it stands and the piece it is (null when it's no piece's name). */
export function variablesIn(template: string): { from: number; to: number; name: string; piece: PromptPieceId | null }[] {
  return [...template.matchAll(VARIABLE)].map((m) => ({ from: m.index, to: m.index + m[0].length, name: m[1] ?? "", piece: pieceNamed(m[1] ?? "") }));
}

/**
 * A template filled with the pieces: each variable that's a piece's name takes its value, one Panki doesn't know stays
 * as typed. A line whose variables all come out empty is left out, so one template serves a video and a page (off a
 * video, "The video: {Video metadata}" isn't sent at all).
 */
export function fillTemplate(template: string, pieces: PromptPieces): string {
  return template
    .split("\n")
    .flatMap((line) => {
      const known = variablesIn(line).filter((v) => v.piece !== null);
      if (known.length > 0 && known.every((v) => v.piece === null || !pieces[v.piece]?.trim())) return [];
      return [line.replace(VARIABLE, (all, name: string) => {
        const piece = pieceNamed(name);
        return piece === null ? all : (pieces[piece]?.trim() ?? "");
      })];
    })
    .join("\n");
}

/**
 * One message of an explanation's conversation after its prompt: the model's answers and the follow-up questions
 * between them. Each answer is the model's own words as Panki got them, sent back with the next question, since a
 * model keeps nothing between calls.
 */
export const AI_TEXT_MAX = 40_000;
export const ExplainMessage = z.object({ role: z.enum(["assistant", "user"]), text: z.string().min(1).max(AI_TEXT_MAX) });
export type ExplainMessage = z.infer<typeof ExplainMessage>;

/**
 * The conversation so far after the prompt, as it was sent (AI step 5): the first answer, then each follow-up as its
 * template's Follow-up prompt filled it and its answer, in turn, ending with an answer. The new follow-up isn't in it:
 * it's `asking` (`{Follow-up question}`, and Touch up's `{Follow-up field}` and `{Card}` as the card stands now), which the server fills
 * into the template's Follow-up prompt and hands back as `asked`, so the page keeps exactly what went. The first
 * prompt is filled from `pieces` as they were first sent, every time, so it reads as it went.
 */
export const Said = z
  .array(ExplainMessage)
  .max(200)
  .refine((said) => said.every((m, i) => m.role === (i % 2 === 0 ? "assistant" : "user")) && (said.length === 0 || said.length % 2 === 1), {
    message: "The conversation doesn't read in turns.",
  });

/**
 * What Explain sends: the template to run, the pieces of the word pointed at and, for a follow-up, the conversation so
 * far (`Said`) with the question in `asking` (`{Follow-up question}`). The server holds every limit.
 */
export const ExplainAsk = z.object({
  templateId: TemplateId,
  pieces: PromptPieces,
  /** Every meaning of the dictionaries, in `{Meaning}`'s order (`meaningsPiece`): the answer's rows are checked against it, one for each. */
  meanings: z.array(z.string().max(PIECE_MAX)).max(200).default([]),
  said: Said,
  /** A follow-up's own pieces (`{Follow-up question}`), laid over `pieces` for its Follow-up prompt; none for a first ask. */
  asking: PromptPieces.optional(),
});
export type ExplainAsk = z.infer<typeof ExplainAsk>;
/** Whether an ask is a follow-up with a question in it, which the server holds every follow-up to. */
export const isFollowUp = (ask: { said: readonly unknown[] }): boolean => ask.said.length > 0;

/**
 * Why an action didn't answer, for the page to say: Panki AI off, no key, too long, too many follow-ups, the provider's
 * own failure; for Proofread, editing Panki subtitles switched off (Admin's), or the transcript changed under the page.
 */
export const ExplainProblem = z.enum(["off", "noKey", "tooLong", "followUps", "provider", "editingOff", "gone"]);
export type ExplainProblem = z.infer<typeof ExplainProblem>;
/**
 * An answer the provider gave that couldn't be used, as Details' Log tells of it, so what Panki AI answered shows
 * even when the answer failed: the text exactly as it came, the technical reason (not JSON; not
 * the shape, with Zod's path and message; which of Panki's rules; cut short; declined), and what was metered for it.
 * Never on screen but in the Log: the failure's message stays plain.
 */
export const AiUnread = z.object({
  raw: z.string(),
  detail: z.string(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  costMicros: z.number().int().nonnegative(),
  /** The provider and model the call ran on (`AiRanOn`): Details name it, never the page's own copy. */
  ranOn: AiRanOn.optional(),
});
export type AiUnread = z.infer<typeof AiUnread>;
/** Why an action didn't answer: its reason, and for an answer that came back unusable, what it was (`unread`). Explain's and Touch up's alike. */
export const ExplainError = z.object({ error: z.object({ message: z.string(), problem: ExplainProblem, unread: AiUnread.optional() }), ai: PankiAiStatus });

/**
 * Explain's fixed shape (every call answers in one, with a verdict on every meaning): the
 * explanation, a row for each dictionary meaning sent, by its index, how well it fits this sentence and why, and, when
 * none fits, the meaning it proposes in its own words, with why. Read by the API's one reader; rows that aren't exactly
 * one for each meaning sent (`meaningsWhole`), or a proposed meaning beside a fitting row or missing without one
 * (`explainRuleBroken`), fail the answer whole.
 */
export const ExplainShape = z.object({
  // What each key holds and what Panki does with it, in plain words, said in Admin under the prompt
  // (`answerPartsOf`); never sent to the provider (`schemaFor` leaves descriptions out: the prompt is the template's alone).
  explanation: z.string().max(AI_TEXT_MAX).describe("what the word means in this sentence; Panki shows it as the answer"),
  meanings: z.array(MeaningAccuracy).max(200).describe("one row for every meaning in <meaning>, each index once; Panki marks each meaning in the pop-up by its accuracy"),
  proposedMeaning: ProposedMeaning.nullable().describe("when no row fits, the meaning it proposes; null when one does"),
});
export type ExplainShape = z.infer<typeof ExplainShape>;

/**
 * A plain answer's fixed shape: the answer and nothing else. What a template that doesn't judge the meanings answers in,
 * first and in every follow-up (AI step 5: Grammar, Conjugation, Nuance); read by the same one reader, a cut, a refusal
 * or broken JSON caught as any answer's are. Explain's follow-ups answered in it alone until step 5 (`FollowUpShape`).
 */
export const PlainShape = z.object({
  answer: z.string().max(AI_TEXT_MAX).describe("the answer; Panki shows it as it is, under the question for a follow-up"),
});
export type PlainShape = z.infer<typeof PlainShape>;
/** Whether a plain answer holds anything, said as expected against got for the Log, or null. */
export const plainRuleBroken = (answer: PlainShape): string | null => (answer.answer.trim() === "" ? expectedGot("an answer", "an empty one") : null);

/**
 * A follow-up's fixed shape on a template that judges the meanings, so a follow-up can change
 * them again: the answer, and the meanings judged again only when the question changes them. `meanings`
 * empty is the verdicts standing as they were, and then no proposed meaning; otherwise a row for every meaning again,
 * by the first answer's rules (`meaningsRuleBroken`), and Panki marks the rows afresh where they stand.
 */
export const ExplainFollowUpShape = z.object({
  answer: z.string().max(AI_TEXT_MAX).describe("the answer to the follow-up question; Panki shows it under the question"),
  meanings: z.array(MeaningAccuracy).max(200).describe("[] when the verdicts stand; otherwise one row for every meaning in <meaning> again, each index once, and Panki marks them afresh"),
  proposedMeaning: ProposedMeaning.nullable().describe("null when the verdicts stand or a row fits; the meaning it proposes when it judged again and none fits"),
});
export type ExplainFollowUpShape = z.infer<typeof ExplainFollowUpShape>;
/** Which of Panki's rules an Explain follow-up's answer breaks, as expected against got, or null. */
export function explainFollowUpRuleBroken(answer: ExplainFollowUpShape, count: number): string | null {
  if (answer.answer.trim() === "") return expectedGot("an answer", "an empty one");
  if (answer.meanings.length === 0) return answer.proposedMeaning === null ? null : expectedGot("no proposed meaning while the verdicts stand (meanings [])", "one");
  return meaningsRuleBroken(answer.meanings, answer.proposedMeaning, count);
}

/**
 * An answer: its words, a verdict on each meaning sent (none from a Panki from before), whether it was cut short (always
 * false since every answer is read whole: one cut is a failure), the tokens in and out as the provider counted them and
 * what that came to at the listed price; and Panki AI as it stood for this call, so the extension's kept copy follows
 * any change an admin made.
 */
export const Explained = z.object({
  text: z.string(),
  /** The answer exactly as it came back, the JSON of its fixed shape: what Details' Conversation shows, and what a follow-up sends back. Empty from a Panki from before. */
  raw: z.string().default(""),
  meanings: z.array(MeaningAccuracy).default([]),
  /** The meaning Panki AI proposes, in its own words with why, when no row fits; null when one does (and from a Panki from before). */
  proposedMeaning: ProposedMeaning.nullable().default(null),
  /**
   * For a follow-up, whether it judged the meanings again (`meanings` then the new verdicts, `proposedMeaning` with
   * them); false for a first answer and for a follow-up that left them standing.
   */
  judgedAgain: z.boolean().default(false),
  /** For a follow-up, the template's Follow-up prompt as it was filled and sent: what the page keeps in `Said`. "" for a first ask. */
  asked: z.string().default(""),
  cut: z.boolean(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  costMicros: z.number().int().nonnegative(),
  /** The provider and model the call ran on (`AiRanOn`): Details name it, never the page's own copy. */
  ranOn: AiRanOn.optional(),
});
export type Explained = z.infer<typeof Explained>;
export const ExplainResponse = z.object({ explain: Explained, ai: PankiAiStatus });

/**
 * How many tokens some text comes to, about, before a provider counts it: kept on the high side, since what the
 * button says is the most a call can cost. A Japanese letter is about a token; anything else about a third of one
 * (English runs nearer a quarter). The real count is the provider's, and that's what the ledger keeps.
 */
export function tokensAbout(text: string): number {
  const japanese = text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}　-〿＀-￯]/gu)?.length ?? 0;
  return japanese + Math.ceil((text.length - japanese) / 3);
}
/** Each message carries a few tokens of its own besides its words. */
const PER_MESSAGE = 8;

/** The most a call can cost, in micro-dollars: what it sends, about, and the answer at its cap, at the model's listed prices. */
export function ceilingMicros(model: Pick<AiModel, "inCentsPerMTok" | "outCentsPerMTok">, sent: readonly string[], maxAnswerTokens: number): number {
  const tokensIn = sent.reduce((sum, text) => sum + tokensAbout(text) + PER_MESSAGE, 0);
  return tokenCostMicros(model, tokensIn, maxAnswerTokens);
}

/**
 * The whole of what a call sends: the template's prompt filled, then the conversation so far, then for a follow-up its
 * Follow-up prompt filled from the pieces with `asking` laid over them; how long it is is what Max request length
 * holds. The server sends this, and the page works out "Up to" from it. A first ask never holds a follow-up's pieces.
 */
export function aiSent(template: { prompt: string; followUp: string }, pieces: PromptPieces, said: readonly ExplainMessage[], asking: PromptPieces = {}): string[] {
  const first = fillTemplate(template.prompt, { ...pieces, question: "", field: "" });
  return said.length === 0 ? [first] : [first, ...said.map((m) => m.text), fillTemplate(template.followUp, { ...pieces, ...asking })];
}
export const sentLength = (sent: readonly string[]): number => sent.reduce((sum, text) => sum + text.length, 0);
