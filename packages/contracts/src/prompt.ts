import { z } from "zod";
import { PankiAiStatus, tokenCostMicros, type AiModel, type PankiAi } from "./ai";
import { PIECE_NAMES, PROMPT_PIECE_IDS, PromptPieceId } from "./pieces";

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
      return "Every meaning of the dictionaries that are on, numbered";
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
  }
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
 * What Explain sends: the pieces of the word pointed at and, for a follow-up, the conversation so far (an answer
 * first, then a question and an answer in turn, ending with the new question). The server holds every limit.
 */
export const ExplainAsk = z.object({
  pieces: PromptPieces,
  said: z
    .array(ExplainMessage)
    .max(200)
    .refine((said) => said.every((m, i) => m.role === (i % 2 === 0 ? "assistant" : "user")) && (said.length === 0 || said.length % 2 === 0), {
      message: "The conversation doesn't read in turns.",
    }),
});
export type ExplainAsk = z.infer<typeof ExplainAsk>;

/** Why Explain didn't answer, for the pop-up to say: Panki AI off, no key, too long, too many follow-ups, the provider's own failure. */
export const ExplainProblem = z.enum(["off", "noKey", "tooLong", "followUps", "provider"]);
export type ExplainProblem = z.infer<typeof ExplainProblem>;
export const ExplainError = z.object({ error: z.object({ message: z.string(), problem: ExplainProblem }), ai: PankiAiStatus });

/**
 * An answer: its words, whether it was cut short at Max answer length (the provider's own word), the tokens in and
 * out as the provider counted them and what that came to at the listed price; and Panki AI as it stood for this call,
 * so the extension's kept copy follows any change an admin made.
 */
export const Explained = z.object({
  text: z.string(),
  cut: z.boolean(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  costMicros: z.number().int().nonnegative(),
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

/** The whole of what a call sends: the filled prompt, then the conversation so far; how long it is is what Max request length holds. */
export function explainSent(template: string, ask: ExplainAsk): string[] {
  return [fillTemplate(template, ask.pieces), ...ask.said.map((m) => m.text)];
}
export const sentLength = (sent: readonly string[]): number => sent.reduce((sum, text) => sum + text.length, 0);
