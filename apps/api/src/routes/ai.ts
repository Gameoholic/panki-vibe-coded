import express, { Router, type Response } from "express";
import {
  AI_PROVIDERS,
  APP_LANGUAGES,
  AiKeyUpdate,
  AiProviderId,
  ExplainAsk,
  PankiAiUpdate,
  TRANSCRIBE_LANGUAGES,
  aiModelOf,
  explainSent,
  isModelOf,
  piecesAsSent,
  sentLength,
  tokenCostMicros,
  type ExplainProblem,
  type PankiAiStatus,
} from "@panki/contracts";
import { AiError, safetyIdOf, type AiAnswer, type AiClient } from "../ai";
import type { DbOf } from "../app";
import { requireAdmin, signedIn } from "../session";
import type { Shared } from "../shared";

/**
 * The most an explanation's body can be: its follow-ups carry the conversation so far, past the 64 KB every other JSON
 * body is held to. Read here, once the sender is known to be signed in; `app.ts` lets this one route by its own parser.
 */
export const EXPLAIN_BODY_MAX = "1mb";
export const EXPLAIN_PATH = "/api/ai/explain";

/**
 * Panki AI, for everyone (2026-10-30): whether it's on, the provider and its model, whose key the provider has, and,
 * for an admin, the key itself. Read by anyone signed in; changed by an admin alone. Explain (step 2) is the one call
 * to a provider, with the key an admin typed or the server's own.
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

  /** Why Explain didn't answer, with Panki AI as it stands, so the pop-up says it and keeps its copy of the settings. */
  const refuse = (res: Response, status: number, problem: ExplainProblem, message: string) => {
    res.status(status).json({ error: { message, problem }, ai: statusOf(res) });
  };

  /**
   * Explain (step 2): the prompt filled from the pieces of the word pointed at, and, for a follow-up, the conversation
   * so far, sent to the provider; its answer back with the tokens and the cost, and one row of the usage ledger. Every
   * limit is held here, whatever the extension held already. Nothing of the conversation is kept, nor logged.
   */
  router.post("/explain", express.json({ limit: EXPLAIN_BODY_MAX }), async (req, res) => {
    const parsed = ExplainAsk.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "That request isn't valid." } });
      return;
    }
    const settings = shared.getAi();
    const { name } = AI_PROVIDERS[settings.aiProvider];
    if (!settings.aiOn) return refuse(res, 409, "off", "Panki AI is off.");
    const key = shared.key(settings.aiProvider) ?? serverKeys[settings.aiProvider];
    if (key === null) return refuse(res, 409, "noKey", `No key for ${name}.`);
    const questions = parsed.data.said.filter((m) => m.role === "user");
    if (questions.length > settings.aiMaxFollowUps) return refuse(res, 409, "followUps", "That's the most follow-ups an explanation takes.");
    if (questions.some((m) => m.text.length > settings.aiMaxQuestionChars)) {
      return refuse(res, 413, "tooLong", `That question is longer than the ${settings.aiMaxQuestionChars.toLocaleString("en")} characters Panki sends.`);
    }
    // Cut as the page's Details say it was (`piecesAsSent`, the one cut): what the owner reads there is what went.
    // The two languages are the account's own, whatever came with the ask.
    const account = dbOf(res).getSettings();
    const languages = { learningLanguage: TRANSCRIBE_LANGUAGES[account.language], language: APP_LANGUAGES[account.appLanguage] };
    const ask = { ...parsed.data, pieces: piecesAsSent({ ...parsed.data.pieces, ...languages }, settings) };
    const [prompt = "", ...said] = explainSent(settings.aiExplainPrompt, ask);
    const length = sentLength([prompt, ...said]);
    if (length > settings.aiMaxRequestChars) {
      return refuse(res, 413, "tooLong", `Too long to send: ${length.toLocaleString("en")} characters, more than the ${settings.aiMaxRequestChars.toLocaleString("en")} Panki sends.`);
    }

    const model = aiModelOf(settings);
    const userId = signedIn(res).user.id;
    let answer: AiAnswer;
    try {
      answer = await ai.answer({
        provider: settings.aiProvider,
        key,
        model,
        messages: [{ role: "user", text: prompt }, ...ask.said],
        maxTokens: settings.aiMaxAnswerTokens,
        safetyId: safetyIdOf(signedIn(res).user.id),
      });
    } catch (e) {
      if (e instanceof AiError) return refuse(res, 502, "provider", e.message);
      throw e;
    }
    const { text, cut, inputTokens, outputTokens } = answer;
    const costMicros = tokenCostMicros(model, inputTokens, outputTokens);
    shared.meter(
      {
        kind: "ai",
        service: settings.aiProvider,
        model: model.id,
        what: "explain",
        ref: (ask.pieces.dictForm || ask.pieces.word || "").slice(0, 100) || null,
        userId,
        inputTokens,
        outputTokens,
        costMicros,
      },
      now(),
    );
    res.json({ explain: { text, cut, inputTokens, outputTokens, costMicros }, ai: statusOf(res) });
  });

  return router;
}
