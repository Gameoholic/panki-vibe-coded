import type { z } from "zod";
import {
  AI_PLACES,
  AI_PROVIDERS,
  APP_LANGUAGES,
  ProofreadShape,
  TRANSCRIBE_LANGUAGES,
  VideoEndShape,
  aiModelOf,
  aiSent,
  ceilingMicros,
  endLinesOf,
  lineTextOf,
  transcriptFinished,
  videoEndLines,
  videoEndPieces,
  videoEndProblem,
  videoEndPromptOf,
  piecesAsSent,
  proofreadPieces,
  proofreadProblem,
  proofreadTokens,
  sentLength,
  templateById,
  tokenCostMicros,
  tokensAbout,
  type AiPlaceId,
  type AiRanOn,
  type AiTemplate,
  type AiUnread,
  type ExplainMessage,
  type ExplainProblem,
  type PankiAi,
  type ProofreadLineAnswer,
  type PromptPieces,
} from "@panki/contracts";
import type { Db } from "../db";
import type { Shared } from "../shared";
import { STOPPED } from "./call";
import { AiError, PLAIN_ISSUE, safetyIdOf, type AiClient } from "./index";

/**
 * Panki AI's calls with nothing of a request in them, so a place's route and a rule on the server make the very same
 * call: Panki AI on and keyed, the whole held to Max request length, the provider asked through the one reader, one
 * usage row for whatever the provider billed. A route turns a refusal into its answer; a rule keeps it as its run's why.
 */

/** Max answer length as each place's is called in Admin → Panki AI → Limits, for the failure that says to raise it. */
const LIMIT_NAMES: Record<AiPlaceId, string> = { word: "Max answer length", card: "Max Touch up answer length", transcript: "Max Proofread answer length", videoEnd: "Max answer length" };

/**
 * A shape with one of Panki's rules on top: a rule broken is named in the issue, so the Log says which, as expected
 * against got. A message's knobs broken (`plain` set: Requires, Leave out) carry Panki's plain words too, which the
 * reader makes the failure's own message (`ai/index.ts`, `PLAIN_ISSUE`).
 */
export function ruled<T>(shape: z.ZodType<T>, problem: (value: T) => { broken: string | null; plain?: string | null }): z.ZodType<T> {
  return shape.superRefine((value, ctx) => {
    const { broken, plain } = problem(value);
    if (broken === null) return;
    ctx.addIssue({ code: "custom", message: broken, ...(plain ? { params: { [PLAIN_ISSUE]: plain } } : {}) });
  });
}

/** Why a call didn't answer: the status a route answers with, the problem the page reads, the owner's words, and for an answer that came back unusable, what it was. */
export type Refused = { status: number; problem: ExplainProblem; message: string; unread?: AiUnread };
/** An answer read whole, what it came as, its tokens and what they cost, and what it ran on. */
export type Ran<T> = { value: T; raw: string; inputTokens: number; outputTokens: number; costMicros: number; ranOn: AiRanOn };
/** `stopped`: the person pressed Stop while it was on its way (`Call.signal`); no one waits for its answer. */
export type Called<T> = { ok: true; ran: Ran<T> } | { ok: false; refused: Refused; costMicros: number; stopped?: boolean };

export type Call<T> = {
  place: AiPlaceId;
  /** The filled prompt, then the conversation so far. */
  prompt: string;
  said: readonly ExplainMessage[];
  maxTokens: number;
  shape: z.ZodType<T>;
  /** What it was done to, for the ledger: the word, the video. */
  ref: string;
  /** The actions a card's conversation's send went with, for the ledger. */
  actions?: readonly string[];
  /**
   * Asked with the call's most (`ceilingMicros`) once it's known to be sendable, right before it's sent: the account's daily cap over every rule.
   * A reason stops it there, nothing spent.
   */
  before?: (ceilingMicros: number) => Refused | null;
  /**
   * The person's Stop: the page that asked gave up on it (its request closed). The provider's request is cut, and what
   * it had taken is metered as Panki counts it, kept high: the whole prompt in, since it was sent, and nothing out,
   * since nothing came back to count. A message an automation sent has none: Stop never stops an automation.
   */
  signal?: AbortSignal;
};

/** A Video end found: the line named, by its number in the lines sent, why, and where that put it. */
export type VideoEndDone = { line: number; reason: string; atMs: number; ran: Ran<unknown> };
export type VideoEndAskCore = {
  videoId: string;
  /** The video's length as the player said it, or as the account's watching last read it. */
  lengthMs: number;
  /** The pieces only a page has (the video's link and description). */
  pieces: PromptPieces;
  before?: Call<unknown>["before"];
};

/** What a Proofread's lines came to: the lines it changed, by their number in the lines sent, and how many words. */
export type ProofreadDone = { lines: ProofreadLineAnswer[]; words: number; template: AiTemplate; ran: Ran<unknown> };
export type ProofreadAskCore = {
  templateId: string;
  videoId: string;
  /** The lines to proofread, each its words' ids in order. */
  lines: readonly (readonly number[])[];
  /** For a row alone, the lines either side, to read. */
  around: readonly (readonly number[])[];
  /** The pieces only a page has (the video's link and description). */
  pieces: PromptPieces;
  /** The run's id: one across a long video's calls, so Undo all takes the whole run back. */
  run: string;
  before?: Call<unknown>["before"];
};

export function createAiCalls(shared: Shared, serverKeys: Readonly<Record<string, string | null>>, ai: AiClient, now: () => number) {
  /** One place's call, the same for every place and every rule. */
  async function call<T>(settings: PankiAi, userId: string, { place, prompt, said, maxTokens, shape, ref, actions, before, signal }: Call<T>): Promise<Called<T>> {
    const { name } = AI_PROVIDERS[settings.aiProvider];
    if (!settings.aiOn) return { ok: false, refused: { status: 409, problem: "off", message: "Panki AI is off." }, costMicros: 0 };
    const key = shared.key(settings.aiProvider) ?? serverKeys[settings.aiProvider] ?? null;
    if (key === null) return { ok: false, refused: { status: 409, problem: "noKey", message: `No key for ${name}.` }, costMicros: 0 };
    const length = sentLength([prompt, ...said.map((m) => m.text)]);
    if (length > settings.aiMaxRequestChars) {
      const message = `Too long to send: ${length.toLocaleString("en")} characters, more than the ${settings.aiMaxRequestChars.toLocaleString("en")} Panki sends.`;
      return { ok: false, refused: { status: 413, problem: "tooLong", message }, costMicros: 0 };
    }
    const model = aiModelOf(settings);
    const stopped = before?.(ceilingMicros(model, [prompt, ...said.map((m) => m.text)], maxTokens)) ?? null;
    if (stopped) return { ok: false, refused: stopped, costMicros: 0 };
    // What it runs on, told with the answer and with an answer that couldn't be used, so Details name it whatever the page last knew.
    const ranOn: AiRanOn = { provider: settings.aiProvider, model: model.id };
    const meter = (inputTokens: number, outputTokens: number) => {
      const costMicros = tokenCostMicros(model, inputTokens, outputTokens);
      shared.meter({ kind: "ai", service: settings.aiProvider, model: model.id, what: place, ref: ref.slice(0, 100) || null, userId, inputTokens, outputTokens, costMicros, ...(actions ? { actions } : {}) }, now());
      return costMicros;
    };
    const messages = [{ role: "user" as const, text: prompt }, ...said];
    const stoppedWith = (costMicros: number): Called<T> => ({ ok: false, refused: { status: 499, problem: "provider", message: STOPPED }, costMicros, stopped: true });
    // Stopped before it went: nothing sent, nothing spent.
    if (signal?.aborted) return stoppedWith(0);
    try {
      const answer = await ai.answer({
        provider: settings.aiProvider,
        key,
        model,
        messages,
        maxTokens,
        safetyId: safetyIdOf(userId),
        signal,
        shape,
        name: place,
        limit: LIMIT_NAMES[place],
      });
      return { ok: true, ran: { value: answer.value, raw: answer.raw, inputTokens: answer.inputTokens, outputTokens: answer.outputTokens, costMicros: meter(answer.inputTokens, answer.outputTokens), ranOn } };
    } catch (e) {
      if (!(e instanceof AiError)) throw e;
      if (e.stopped) return stoppedWith(meter(messages.reduce((sum, m) => sum + tokensAbout(m.text), 0), 0));
      const costMicros = e.tokens ? meter(e.tokens.input, e.tokens.output) : 0;
      // An answer that came back and couldn't be used goes to the page whole, with why, for the Log alone.
      const unread: AiUnread | undefined =
        e.raw !== null ? { raw: e.raw, detail: e.detail ?? "", inputTokens: e.tokens?.input ?? 0, outputTokens: e.tokens?.output ?? 0, costMicros, ranOn } : undefined;
      return { ok: false, refused: { status: 502, problem: "provider", message: e.message, ...(unread ? { unread } : {}) }, costMicros };
    }
  }

  /**
   * The pieces as they're sent: cut as the page's Details say (`piecesAsSent`, the one cut), the account's two languages
   * and its standing message (User instructions) its own whatever came.
   */
  function piecesFor(db: Db, pieces: PromptPieces, settings: PankiAi): PromptPieces {
    const account = db.getSettings();
    return piecesAsSent(
      { ...pieces, learningLanguage: TRANSCRIBE_LANGUAGES[account.language], language: APP_LANGUAGES[account.appLanguage], instructions: account.aiInstructions },
      settings,
    );
  }

  /**
   * One Proofread call: the lines as they stand now (`409` when a word isn't living any more), the account's template
   * for the transcript, `{Transcript}` and its lists filled from the store, the answer held to `proofreadProblem`, and
   * each line it changed laid onto its words (`shared.proofreadFix`), every word changed a fix of Panki AI's with the
   * run. Held to the admin's Editing Panki subtitles as a hand edit is.
   */
  async function proofread(db: Db, userId: string, ask: ProofreadAskCore): Promise<{ ok: true; done: ProofreadDone } | { ok: false; refused: Refused; costMicros: number }> {
    const no = (status: number, problem: ExplainProblem, message: string) => ({ ok: false as const, refused: { status, problem, message }, costMicros: 0 });
    if (!shared.getTranscription().fixes) return no(403, "editingOff", "Editing Panki subtitles is switched off.");
    const lines = shared.proofreadLines(ask.videoId, ask.lines);
    if (!lines) return no(409, "gone", "The transcript changed. Try again.");
    const around = shared.proofreadLines(ask.videoId, ask.around) ?? [];
    const template = templateById(ask.templateId, db.listAiTemplates());
    if (!template || template.place !== "transcript") return no(400, "gone", template ? `That template isn't ${AI_PLACES.transcript.name}'s.` : "That template doesn't exist.");
    const settings = shared.getAi();
    const pieces = piecesFor(db, { ...ask.pieces, ...proofreadPieces(lines, around) }, settings);
    const before = lines.map(lineTextOf);
    const called = await call(settings, userId, {
      place: "transcript",
      prompt: aiSent(template, pieces, [], {})[0] ?? "",
      said: [],
      maxTokens: proofreadTokens(lines.length, settings.aiMaxProofreadTokens),
      shape: ruled(ProofreadShape, (value) => ({ broken: proofreadProblem(value, before) })),
      ref: ask.videoId,
      ...(ask.before ? { before: ask.before } : {}),
    });
    if (!called.ok) return called;
    // A line given back as it already reads changes nothing and isn't told of.
    const changed = called.ran.value.lines
      .map((l) => ({ line: l.line, text: l.text.trim(), reason: l.reason.trim() }))
      .filter((l) => l.text !== before[l.line - 1])
      .sort((a, b) => a.line - b.line);
    const words = shared.proofreadFix(
      ask.videoId,
      changed.map((l) => ({ wordIds: ask.lines[l.line - 1] ?? [], text: l.text, reason: l.reason })),
      { run: ask.run, model: called.ran.ranOn.model, templateId: template.id, userId },
      now(),
    );
    return { ok: true, done: { lines: changed, words, template, ran: called.ran } };
  }

  /**
   * Find where the video ends, everyone's: asked again of a video that has its Video end already (a press), the new
   * answer standing as the latest placing; never twice at once for a video. The transcript must be finished, its lines
   * read as they stand now; the end of them goes into the admin's prompt (`videoEndLines`, `videoEndPieces`), the
   * answer is held to `videoEndProblem`, and the Video end is put where the line it names ends, kept beside the
   * transcript with the line, why, the model and who asked. An automation passes over a video that has one (`rules.ts`).
   */
  async function findVideoEnd(db: Db, userId: string, ask: VideoEndAskCore): Promise<{ ok: true; done: VideoEndDone } | { ok: false; refused: Refused; costMicros: number }> {
    const no = (message: string) => ({ ok: false as const, refused: { status: 409, problem: "gone" as const, message }, costMicros: 0 });
    const transcript = shared.transcript(ask.videoId);
    if (!transcriptFinished(transcript.covered, ask.lengthMs)) return no("The transcript isn't finished.");
    const lines = videoEndLines(endLinesOf(transcript.words), ask.lengthMs);
    if (lines.length === 0) return no("Nothing transcribed yet.");
    if (!shared.findingEnd.start(ask.videoId)) return no("Panki AI is already finding where this video ends.");
    try {
      const settings = shared.getAi();
      const pieces = piecesFor(db, { ...ask.pieces, ...videoEndPieces(lines, ask.lengthMs) }, settings);
      const called = await call(settings, userId, {
        place: "videoEnd",
        prompt: aiSent(videoEndPromptOf(settings), pieces, [], {})[0] ?? "",
        said: [],
        maxTokens: settings.aiMaxAnswerTokens,
        shape: ruled(VideoEndShape, (value) => ({ broken: videoEndProblem(value, lines.length) })),
        ref: ask.videoId,
        ...(ask.before ? { before: ask.before } : {}),
      });
      if (!called.ok) return called;
      const { line, reason } = called.ran.value;
      const atMs = lines[line - 1]?.endMs ?? ask.lengthMs;
      shared.keepFoundEnd(ask.videoId, { atMs, line, reason: reason.trim(), model: called.ran.ranOn.model }, userId, now());
      return { ok: true, done: { line, reason: reason.trim(), atMs, ran: called.ran } };
    } finally {
      shared.findingEnd.end(ask.videoId);
    }
  }

  return { call, piecesFor, proofread, findVideoEnd };
}
export type AiCalls = ReturnType<typeof createAiCalls>;
