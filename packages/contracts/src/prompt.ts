import { z } from "zod";
import { ACTION_SECONDS_MAX, DEFAULT_ACTION_SECONDS, EXPLAIN_PARTS, ExplainPart } from "./accountActions";
import { AiRanOn, PankiAiStatus, tokenCostMicros, type AiModel, type PankiAi } from "./ai";
import { Judgement } from "./judgement";
import { PIECE_NAMES, PROMPT_PIECE_IDS, PromptPieceId } from "./pieces";
import { KNOB_BREACHES, expectedGot, knobsBroken } from "./unread";

/**
 * Filling a Panki AI prompt from Prompt context's pieces (`pieces.ts`, the registry), what Explain sends and answers,
 * and what a call can cost before it runs. The API fills a template, so all of it lives here.
 */

/** The limits a piece's description says, as they're set (Admin → Panki AI → Limits). */
type PieceLimits = Pick<PankiAi, "aiMaxDescriptionChars">;
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
      // The one meanings list, every place's (`meaningsPiece`).
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
      return `What's said around the word, from the subtitles showing, as long as the first message's Video context length (${DEFAULT_ACTION_SECONDS * 2} seconds to begin with, half before and half after)`;
    case "description":
      return `The video's description (max ${limits.aiMaxDescriptionChars.toLocaleString("en")} characters)`;
    case "learningLanguage":
      return "The language you're learning, as your Settings → General → Learning language says";
    case "language":
      return "The language Panki speaks to you in, as your Settings → General → Language says";
    case "card":
      return "The card being added: each of its fields by name, with what it holds now";
    case "question":
      return "What you typed in a message after the first";
    case "field":
      return "The field a message was sent from, by its name on the card";
    case "transcript":
      return "The lines of Panki subtitles being proofread, numbered, each as it reads now";
    case "handEdited":
      return "The words of those lines a person edited last, by line number";
    case "unsure":
      return "The words of those lines the engine was unsure of, by line number, from its own confidence";
    case "message":
      return "What a message says in your words: its actions' words, then what you typed; sent as yours, inside <user_message>";
    case "requirements":
      return "Panki's own line after a message: what the answer must hold, never yours to change";
    case "instructions":
      return "Your standing message to Panki AI, as Settings → Panki AI → User instructions says; empty, its line isn't sent";
    case "wider":
      return `What's said further around the word, for a later message whose Video context length is longer than the first's (up to ${ACTION_SECONDS_MAX * 2} seconds, half before and half after), in that message alone`;
  }
}

/**
 * Every meaning of the dictionaries as a prompt is sent them (`{Meaning}`, one format for every place, Explain's and
 * Touch up's): a JSON list, one entry each in the list's order, its words and its index from 1,
 * nothing more. What's ticked on the card is never in it: the model judges each meaning against
 * the sentence alone, and Panki holds its verdicts against the ticks on its own side (`meaningVerdictOf`). One home for
 * the shape: the page building the piece and the server checking each index agree by construction. Touch up adds the
 * Meaning field's own meanings after the dictionary's (`custom`, `touchUp.ts` → `readMeaning`), numbered on from them and
 * marked `"custom": true`, so the model judges them as rows of their own and knows they're the user's.
 */
export function meaningsPiece(meanings: readonly string[], custom: readonly string[] = []): string {
  return JSON.stringify([
    ...meanings.map((meaning, i) => ({ meaning, index: i + 1 })),
    ...custom.map((meaning, i) => ({ meaning, index: meanings.length + i + 1, custom: true })),
  ]);
}

/**
 * A meaning's judgement as Explain's prompt asks the model for it, on the wire: the words fits, close and wrong under
 * the key "accuracy", as the prompt says them, so the prompt reads as it always has. Panki reads them at once as its
 * one judgement (`explainOfWire`), and nothing past the reader sees these words.
 */
const MEANING_WIRE_WORDS = ["fits", "close", "wrong"] as const;
const JUDGEMENT_OF_WIRE: Record<(typeof MEANING_WIRE_WORDS)[number], Judgement> = { fits: "good", close: "meh", wrong: "bad" };
/** One dictionary meaning as the model judges it on Explain's wire: by its index, how it stands in this sentence, and why. */
export const MeaningWireRow = z.object({
  meaning: z.number().int().describe("the meaning's index in <meaning>"),
  accuracy: z.enum(MEANING_WIRE_WORDS).describe("fits, close (near, but not quite) or wrong; Panki marks the meaning green, orange or red"),
  reason: z.string().max(2_000).describe("why, in a few words; shown under the meaning"),
});
/** One dictionary meaning as Panki reads a judgement of it: by its index, its judgement, and why. */
export const JudgedMeaning = z.object({ meaning: z.number().int(), judgement: Judgement, reason: z.string().max(2_000) });
export type JudgedMeaning = z.infer<typeof JudgedMeaning>;
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
 * The meanings' rules, every place's that judges them (Explain's, Touch up's Meaning), said as expected against got:
 * exactly one row for each meaning sent, each index once (`meaningsWhole`); a proposed meaning beside a fitting row, or
 * none when nothing fits. Null when they hold.
 */
export function meaningsRuleBroken(rows: readonly { meaning: number; judgement: Judgement }[], proposed: ProposedMeaning | null, count: number): string | null {
  if (!meaningsWhole(rows, count)) {
    return rows.length !== count
      ? expectedGot(`one row per meaning (${count})`, `${rows.length}`)
      : expectedGot(`one row per meaning (${count}), each index once from 1 to ${count}`, `indexes ${rows.map((row) => row.meaning).join(", ")}`);
  }
  const fits = rows.some((row) => row.judgement === "good");
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

/** Whether an ask is a follow-up with a question in it, which the server holds every follow-up to. */
export const isFollowUp = (ask: { said: readonly unknown[] }): boolean => ask.said.length > 0;

/**
 * Why a place didn't answer, for the page to say: Panki AI off, no key, too long, too many follow-ups, the provider's
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
/** Why a place didn't answer: its reason, and for an answer that came back unusable, what it was (`unread`). Explain's and Touch up's alike. */
export const ExplainError = z.object({ error: z.object({ message: z.string(), problem: ExplainProblem, unread: AiUnread.optional() }), ai: PankiAiStatus });

/** Each part of a word's answer (`accountActions.ts` → `EXPLAIN_PARTS`) by its name: an action's Requires and Leave out chips, and Details. */
export const EXPLAIN_PART_NAMES: Record<ExplainPart, string> = { reply: "Answer", meanings: "Meanings" };

/**
 * Explain's one fixed shape, every send's whatever it asks ("Touch up, steered" step 4): the reply, "" for none; a row
 * for each meaning sent when it judges them, [] when it leaves them untouched (the verdicts standing); and the meaning it
 * proposes when it judged them and none fits, "" in both parts otherwise. Plain and required on the wire: no union, nothing
 * nullable. Read with `explainOfWire`, held to `explainProblem`.
 */
export const ExplainShape = z.object({
  // What each key holds and what Panki does with it, in plain words, said in Admin under the prompt
  // (`answerShapesOf`); never sent to the provider (`schemaFor` leaves descriptions out: the prompt is the admin's alone).
  reply: z.string().max(AI_TEXT_MAX).describe('the reply to the message: what the message asked to be said (what the word does here, its grammar, …); "" otherwise, unless there is something of note. Panki shows it as the answer'),
  meanings: z
    .array(MeaningWireRow)
    .max(200)
    .describe("one row for every meaning in <meaning>, each index once, when it judges them; [] when it leaves them untouched. Panki marks each meaning in the pop-up by its judgement"),
  proposedMeaning: ProposedMeaning.describe('when it judged the meanings and none fits, the meaning it proposes; "" in both parts otherwise'),
});
export type ExplainShape = z.infer<typeof ExplainShape>;

/** The meanings as an answer judged them: a row each in the list's order, and the meaning it proposed when none fits. */
export type ExplainJudged = { meanings: JudgedMeaning[]; proposed: ProposedMeaning | null };
/** An Explain answer as Panki reads it: the reply ("" for none), and the meanings judged, or null when it left them untouched. */
export type ExplainRead = { reply: string; judged: ExplainJudged | null };
/** The answer as Panki reads it, from the wire: the one translation, run before any rule. No rows and nothing proposed is untouched. */
export function explainOfWire(wire: ExplainShape): ExplainRead {
  const meaning = wire.proposedMeaning.meaning.trim();
  const proposed = meaning === "" ? null : { meaning, reason: wire.proposedMeaning.reason.trim() };
  const judged = wire.meanings.length === 0 && proposed === null ? null : {
          meanings: wire.meanings
            .map((row) => ({ meaning: row.meaning, judgement: JUDGEMENT_OF_WIRE[row.accuracy], reason: row.reason }))
            .sort((a, b) => a.meaning - b.meaning),
          proposed,
        };
  return { reply: wire.reply.trim(), judged };
}
/**
 * What an Explain answer is held to: how many meanings were sent, the parts this send requires to come back, and those
 * it leaves out (`aiActions.ts` → `explainLeftOutFor`).
 */
export type ExplainHeld = { count: number; requires: readonly ExplainPart[]; leaves?: readonly ExplainPart[] };
/**
 * What's wrong with an answer: `broken`, why it fails whole as expected against got, or null; `plain`, the same in
 * Panki's plain words when it's the message's knobs that were broken, else null; and the parts behind a knob's breach,
 * required and missing (`missing`) or left out and answered (`leftOut`).
 */
export type ExplainProblems = { broken: string | null; plain: string | null; missing: ExplainPart[]; leftOut: ExplainPart[] };
/** Whether an answer holds a part: a reply said, or the meanings judged. */
const holds = (read: ExplainRead, part: ExplainPart): boolean => (part === "reply" ? read.reply !== "" : read.judged !== null);
/**
 * The one checker of every Explain send's answer, as read (`explainOfWire`). First the message's knobs: a part it
 * requires that didn't come back, or one it leaves out that did, fails the whole message (nothing of it lands), said in
 * Panki's words (`plain`, `unread.ts` → `KNOB_BREACHES`) and as expected against got. Then `broken`, as expected
 * against got for Details' Log (`unread.ts` → `expectedGot`), or null: something said (a reply, or the meanings
 * judged); judged, the meanings' rules (`meaningsRuleBroken`: a row for each meaning sent, each index once, a proposed
 * meaning exactly when none fits). Such an answer fails whole.
 */
export function explainProblem(read: ExplainRead, held: ExplainHeld): ExplainProblems {
  const leftOut = EXPLAIN_PARTS.filter((part) => (held.leaves ?? []).includes(part) && holds(read, part));
  const missing = EXPLAIN_PARTS.filter((part) => held.requires.includes(part) && !holds(read, part));
  const knobs = knobsBroken([
    ...(missing.includes("reply") ? [KNOB_BREACHES.unreplied] : []),
    ...(missing.includes("meanings") ? [KNOB_BREACHES.unjudged] : []),
    ...(leftOut.includes("reply") ? [KNOB_BREACHES.replied] : []),
    ...(leftOut.includes("meanings") ? [KNOB_BREACHES.judged] : []),
  ]);
  if (knobs) return { broken: knobs.detail, plain: knobs.plain, missing, leftOut };
  if (read.reply === "" && read.judged === null) return { broken: expectedGot("a reply or the meanings judged", "neither"), plain: null, missing, leftOut };
  return { broken: read.judged ? meaningsRuleBroken(read.judged.meanings, read.judged.proposed, held.count) : null, plain: null, missing, leftOut };
}

/**
 * An answer: the reply, the meanings as it judged them (none when it left them untouched; an answer that broke the
 * message's Requires or Leave out failed whole, `explainProblem`), whether it was cut short (always false since every answer is read whole: one cut is a failure),
 * the tokens in and out as the provider counted them and what that came to at the listed price; and Panki AI as it
 * stood for this call, so the extension's kept copy follows any change an admin made.
 */
export const Explained = z.object({
  /** The reply; "" for none. */
  text: z.string(),
  /** The answer exactly as it came back, the JSON of its fixed shape: what Details' Conversation shows, and what a later send sends back. */
  raw: z.string().default(""),
  meanings: z.array(JudgedMeaning).default([]),
  /** The meaning Panki AI proposes, in its own words with why, when no row fits; null when one does or it didn't judge them. */
  proposedMeaning: ProposedMeaning.nullable().default(null),
  /** Whether it judged the meanings (`meanings` then the verdicts, `proposedMeaning` with them); false when it left them standing. */
  judged: z.boolean().default(false),
  /** A send after the first, its own message as it was filled and sent: what the page keeps in `Said`. "" for the first. */
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
 * holds. The server sends this, and the page works out "Up to" from it. A first ask never holds a follow-up's pieces,
 * but for `opening`: a card's conversation's first send (Touch up's), whose own message stands at the end of the first
 * prompt, filled from its own pieces (`{Message}`, `{Card}` as it stood then).
 */
export function aiSent(
  template: { prompt: string; followUp: string },
  pieces: PromptPieces,
  said: readonly ExplainMessage[],
  asking: PromptPieces = {},
  opening: PromptPieces = {},
): string[] {
  const first = fillTemplate(template.prompt, { ...pieces, question: "", field: "", message: "", ...opening });
  return said.length === 0 ? [first] : [first, ...said.map((m) => m.text), fillTemplate(template.followUp, { ...pieces, ...asking })];
}
export const sentLength = (sent: readonly string[]): number => sent.reduce((sum, text) => sum + text.length, 0);
