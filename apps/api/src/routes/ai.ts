import express, { Router, type Response } from "express";
import type { z } from "zod";
import {
  AI_PROVIDERS,
  APP_LANGUAGES,
  AiKeyUpdate,
  AiProviderId,
  type AiRanOn,
  ExplainAsk,
  ExplainShape,
  PankiAiUpdate,
  TRANSCRIBE_LANGUAGES,
  TouchUpAsk,
  aiModelOf,
  answerOfWire,
  fillTemplate,
  isError,
  isModelOf,
  meaningsPiece,
  explainRuleBroken,
  FollowUpShape,
  followUpRuleBroken,
  piecesAsSent,
  sentLength,
  tokenCostMicros,
  touchUpProblem,
  touchUpShape,
  type AiActionId,
  type AiUnread,
  type ExplainMessage,
  type ExplainProblem,
  type PankiAi,
  type PankiAiStatus,
  type PromptPieces,
} from "@panki/contracts";
import { AiError, safetyIdOf, type AiClient } from "../ai";
import type { DbOf } from "../app";
import { requireAdmin, signedIn } from "../session";
import type { Shared } from "../shared";

/**
 * The most a call's body can be: an explanation's follow-ups carry the conversation so far, and a touch-up the card and
 * every meaning, past the 64 KB every other JSON body is held to. Read here, once the sender is known to be signed in;
 * `app.ts` lets these routes by its own parser.
 */
export const AI_BODY_MAX = "1mb";
export const AI_CALL_PATHS: ReadonlySet<string> = new Set(["/api/ai/explain", "/api/ai/touch-up"]);

/** Max answer length as each action's is called in Admin → Panki AI → Limits, for the failure that says to raise it. */
const LIMIT_NAMES: Record<AiActionId, string> = { explain: "Max answer length", touchUp: "Max Touch up answer length" };

/**
 * Panki AI, for everyone (2026-10-30): whether it's on, the provider and its model, whose key the provider has, and,
 * for an admin, the key itself. Read by anyone signed in; changed by an admin alone. Each action (Explain, Touch up) is
 * a call to the provider with the key an admin typed or the server's own, read through the one reader.
 */
export function aiRouter(dbOf: DbOf, shared: Shared, serverKeys: Record<AiProviderId, string | null>, ai: AiClient, now: () => number) {
  const router = Router();

  // The key typed in Settings goes back to an admin, to see what's there; the server's own never does, nor anything to anyone else.
  const statusOf = (res: Response): PankiAiStatus => {
    const settings = shared.getAi();
    const saved = shared.key(settings.aiProvider);
    const account = dbOf(res).getSettings();
    return {
      settings,
      key: saved !== null ? "settings" : serverKeys[settings.aiProvider] !== null ? "server" : null,
      ...(saved !== null && signedIn(res).user.admin ? { saved } : {}),
      learningLanguage: account.language,
      language: account.appLanguage,
    };
  };

  router.get("/", (_req, res) => {
    res.json({ ai: statusOf(res) });
  });

  router.patch("/", requireAdmin, (req, res) => {
    const parsed = PankiAiUpdate.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "That setting isn't valid.", path: parsed.error.issues[0]?.path ?? [] } });
      return;
    }
    // A provider changed alone takes its own first model; a model named is one of the provider's, or nothing changes.
    const patch = parsed.data;
    const merged = { ...shared.getAi(), ...patch };
    if (!isModelOf(merged.aiProvider, merged.aiModel)) {
      if (patch.aiModel !== undefined) {
        res.status(400).json({ error: { message: "That model isn't one of this provider's.", path: ["aiModel"] } });
        return;
      }
      const first = AI_PROVIDERS[merged.aiProvider].models[0];
      if (first) patch.aiModel = first.id;
    }
    shared.updateAi(patch, now(), signedIn(res).user.id);
    res.json({ ai: statusOf(res) });
  });

  // A provider's key, typed once; null forgets it.
  router.put("/keys/:providerId", requireAdmin, (req, res) => {
    const provider = AiProviderId.safeParse(req.params.providerId);
    if (!provider.success) {
      res.status(400).json({ error: { message: "That provider doesn't exist." } });
      return;
    }
    const parsed = AiKeyUpdate.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "That isn't a key.", path: ["key"] } });
      return;
    }
    shared.setKey(provider.data, parsed.data.key, now(), signedIn(res).user.id);
    res.json({ ai: statusOf(res) });
  });

  /**
   * Why an action didn't answer, with Panki AI as it stands, so the page says it and keeps its copy of the settings; for
   * an answer that came back unusable, what it was, for Details' Log (`unread`).
   */
  const refuse = (res: Response, status: number, problem: ExplainProblem, message: string, unread?: AiUnread) => {
    res.status(status).json({ error: { message, problem, ...(unread ? { unread } : {}) }, ai: statusOf(res) });
  };

  /** The pieces as they're sent: cut as the page's Details say (`piecesAsSent`, the one cut), the account's two languages its own whatever came. */
  const piecesFor = (res: Response, pieces: PromptPieces, settings: PankiAi): PromptPieces => {
    const account = dbOf(res).getSettings();
    return piecesAsSent({ ...pieces, learningLanguage: TRANSCRIBE_LANGUAGES[account.language], language: APP_LANGUAGES[account.appLanguage] }, settings);
  };

  type Run<T> = {
    action: AiActionId;
    /** The filled prompt, then the conversation so far. */
    prompt: string;
    said: readonly ExplainMessage[];
    maxTokens: number;
    shape: z.ZodType<T>;
    /** What it was done to, for the ledger: the word. */
    ref: string;
  };
  /**
   * One action's call, the same for every action: Panki AI on and keyed, the whole held to Max request length, the
   * provider asked through the one reader, and one usage row whatever came back that the provider billed (an answer
   * read whole, or one cut short or in the wrong shape). Answers the value and what it cost, or null once it has
   * refused with the reason.
   */
  async function run<T>(res: Response, settings: PankiAi, { action, prompt, said, maxTokens, shape, ref }: Run<T>): Promise<{ value: T; raw: string; inputTokens: number; outputTokens: number; costMicros: number; ranOn: AiRanOn } | null> {
    const { name } = AI_PROVIDERS[settings.aiProvider];
    if (!settings.aiOn) {
      refuse(res, 409, "off", "Panki AI is off.");
      return null;
    }
    const key = shared.key(settings.aiProvider) ?? serverKeys[settings.aiProvider];
    if (key === null) {
      refuse(res, 409, "noKey", `No key for ${name}.`);
      return null;
    }
    const length = sentLength([prompt, ...said.map((m) => m.text)]);
    if (length > settings.aiMaxRequestChars) {
      refuse(res, 413, "tooLong", `Too long to send: ${length.toLocaleString("en")} characters, more than the ${settings.aiMaxRequestChars.toLocaleString("en")} Panki sends.`);
      return null;
    }
    const model = aiModelOf(settings);
    // What it runs on, told with the answer and with an answer that couldn't be used, so Details name it whatever the page last knew.
    const ranOn: AiRanOn = { provider: settings.aiProvider, model: model.id };
    const userId = signedIn(res).user.id;
    const meter = (inputTokens: number, outputTokens: number) => {
      const costMicros = tokenCostMicros(model, inputTokens, outputTokens);
      shared.meter({ kind: "ai", service: settings.aiProvider, model: model.id, what: action, ref: ref.slice(0, 100) || null, userId, inputTokens, outputTokens, costMicros }, now());
      return costMicros;
    };
    try {
      const answer = await ai.answer({
        provider: settings.aiProvider,
        key,
        model,
        messages: [{ role: "user", text: prompt }, ...said],
        maxTokens,
        safetyId: safetyIdOf(userId),
        shape,
        name: action,
        limit: LIMIT_NAMES[action],
      });
      return { value: answer.value, raw: answer.raw, inputTokens: answer.inputTokens, outputTokens: answer.outputTokens, costMicros: meter(answer.inputTokens, answer.outputTokens), ranOn };
    } catch (e) {
      if (!(e instanceof AiError)) throw e;
      const costMicros = e.tokens ? meter(e.tokens.input, e.tokens.output) : 0;
      // An answer that came back and couldn't be used goes to the page whole, with why, for the Log alone.
      const unread: AiUnread | undefined =
        e.raw !== null ? { raw: e.raw, detail: e.detail ?? "", inputTokens: e.tokens?.input ?? 0, outputTokens: e.tokens?.output ?? 0, costMicros, ranOn } : undefined;
      refuse(res, 502, "provider", e.message, unread);
      return null;
    }
  }

  /**
   * Explain (step 2, its fixed shape since step 3): the prompt filled from the pieces of the word pointed at and, for a
   * follow-up, the conversation so far; its answer the explanation, a verdict on every meaning sent (the indexes
   * checked against them) and, when none fits, the meaning it proposes in its own words. Every limit is held here, whatever the extension held already. Nothing of the conversation is
   * kept, nor logged.
   */
  router.post("/explain", express.json({ limit: AI_BODY_MAX }), async (req, res) => {
    const parsed = ExplainAsk.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "That request isn't valid." } });
      return;
    }
    const settings = shared.getAi();
    const questions = parsed.data.said.filter((m) => m.role === "user");
    if (questions.length > settings.aiMaxFollowUps) return refuse(res, 409, "followUps", "That's the most follow-ups an explanation takes.");
    if (questions.some((m) => m.text.length > settings.aiMaxQuestionChars)) {
      return refuse(res, 413, "tooLong", `That question is longer than the ${settings.aiMaxQuestionChars.toLocaleString("en")} characters Panki sends.`);
    }
    const { meanings } = parsed.data;
    // Sent with its meanings, `{Meaning}` is the list made here (`meaningsPiece`), the
    // one the answer's rows are checked against: exactly one for each, each index once; and a meaning of its own
    // proposed exactly when none of them fits.
    const pieces = piecesFor(res, { ...parsed.data.pieces, ...(meanings.length > 0 ? { dictMeaning: meaningsPiece(meanings) } : {}) }, settings);
    const prompt = fillTemplate(settings.aiExplainPrompt, pieces);
    const ref = pieces.dictForm || pieces.word || "";
    const { said } = parsed.data;
    // A follow-up answers in its own one-key shape (the owner, 2026-10-31): the first answer's verdicts stand for the
    // whole conversation, so nothing of them can fail it. A rule broken is named in the issue, so the Log says which.
    if (said.length > 0) {
      const followUp = FollowUpShape.superRefine((answer, ctx) => {
        const broken = followUpRuleBroken(answer);
        if (broken !== null) ctx.addIssue({ code: "custom", message: broken });
      });
      const answer = await run(res, settings, { action: "explain", prompt, said, maxTokens: settings.aiMaxAnswerTokens, shape: followUp, ref });
      if (!answer) return;
      const { value, raw, inputTokens, outputTokens, costMicros, ranOn } = answer;
      res.json({ explain: { text: value.answer, raw, meanings: [], proposedMeaning: null, cut: false, inputTokens, outputTokens, costMicros, ranOn }, ai: statusOf(res) });
      return;
    }
    const shape = ExplainShape.superRefine((answer, ctx) => {
      const broken = explainRuleBroken(answer, meanings.length);
      if (broken !== null) ctx.addIssue({ code: "custom", message: broken });
    });
    const answer = await run(res, settings, { action: "explain", prompt, said, maxTokens: settings.aiMaxAnswerTokens, shape, ref });
    if (!answer) return;
    const { value, raw, inputTokens, outputTokens, costMicros, ranOn } = answer;
    const rows = [...value.meanings].sort((a, b) => a.meaning - b.meaning);
    res.json({ explain: { text: value.explanation, raw, meanings: rows, proposedMeaning: value.proposedMeaning ? { meaning: value.proposedMeaning.meaning.trim(), reason: value.proposedMeaning.reason.trim() } : null, cut: false, inputTokens, outputTokens, costMicros, ranOn }, ai: statusOf(res) });
  });

  /**
   * Touch up (step 3): the card being added, as `{Card}` says it, with what the dictionary, the page and the video say,
   * sent with its own template; the answer one entry for each key whose field the deck has, each proposal checked
   * against what was sent (a meaning's number against the meanings). Nothing of it is kept: the page shows each
   * proposal, and only what's accepted goes onto the card, its source Panki AI.
   */
  router.post("/touch-up", express.json({ limit: AI_BODY_MAX }), async (req, res) => {
    const parsed = TouchUpAsk.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "That request isn't valid." } });
      return;
    }
    const settings = shared.getAi();
    const { meanings, keys, now } = parsed.data;
    // `{Meaning}` is the one meanings list, Explain's (`meaningsPiece`); what's ticked is in `{Card}`, for the Meaning's
    // own why. The answer is held to the card as it was sent (`touchUpProblem`); the page draws it from there.
    const pieces = piecesFor(res, { ...parsed.data.pieces, ...(meanings.length > 0 ? { dictMeaning: meaningsPiece(meanings) } : {}) }, settings);
    const prompt = fillTemplate(settings.aiTouchUpPrompt, pieces);
    // Asked on the wire, which has no union, nothing optional and nothing nullable (a provider refuses a schema past 16
    // of those); read into the owner's shapes at once (`answerOfWire`), and every rule held to those.
    const shape = touchUpShape(keys, now, meanings.length).superRefine((wire, ctx) => {
      const broken = touchUpProblem(answerOfWire(wire), meanings, now);
      if (broken !== null) ctx.addIssue({ code: "custom", message: broken });
    });
    const answer = await run(res, settings, { action: "touchUp", prompt, said: [], maxTokens: settings.aiMaxTouchUpTokens, shape, ref: pieces.dictForm || pieces.word || "" });
    if (!answer) return;
    const { raw, inputTokens, outputTokens, costMicros, ranOn } = answer;
    const read = answerOfWire(answer.value);
    // The Meaning's rows in the list's order, as Explain's are sent on.
    const meaning = read.meaning;
    const value = meaning && !isError(meaning) ? { ...read, meaning: { ...meaning, meanings: [...meaning.meanings].sort((a, b) => a.meaning - b.meaning) } } : read;
    res.json({ touchUp: { answer: value, raw, inputTokens, outputTokens, costMicros, ranOn }, ai: statusOf(res) });
  });

  return router;
}
