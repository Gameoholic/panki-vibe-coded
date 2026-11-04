import express, { Router, type Response } from "express";
import type { z } from "zod";
import {
  AI_ACTIONS,
  AI_PROVIDERS,
  APP_LANGUAGES,
  AiKeyUpdate,
  AiProviderId,
  AiTemplateUpdate,
  type AiRanOn,
  ExplainAsk,
  ExplainFollowUpShape,
  ExplainShape,
  NewAiTemplate,
  PankiAiUpdate,
  PlainShape,
  ProofreadAsk,
  ProofreadShape,
  TRANSCRIBE_LANGUAGES,
  TemplateId,
  TouchUpAsk,
  aiModelOf,
  aiSent,
  answerOfWire,
  defaultIdsOf,
  explainFollowUpRuleBroken,
  explainRuleBroken,
  followOfWire,
  isError,
  isFollowUp,
  isModelOf,
  lineTextOf,
  meaningsPiece,
  piecesAsSent,
  plainRuleBroken,
  proofreadPieces,
  proofreadProblem,
  proofreadTokens,
  sentLength,
  templateById,
  tokenCostMicros,
  touchUpFollowProblem,
  touchUpFollowShape,
  touchUpProblem,
  touchUpShape,
  type AiActionId,
  type AiTemplate,
  type AiUnread,
  type ExplainMessage,
  type ExplainProblem,
  type Explained,
  type PankiAi,
  type PankiAiStatus,
  type PromptPieces,
  type ProposedMeaning,
  type TouchUpAnswer,
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
const AI_CALL_PATHS: ReadonlySet<string> = new Set(["/api/ai/explain", "/api/ai/touch-up", "/api/ai/proofread"]);
/** A template saved: a prompt and a Follow-up prompt of up to `PROMPT_MAX` characters each, which in Japanese run past 64 KB. */
const TEMPLATE_BODY_MAX = "256kb";
const TEMPLATES_PATH = "/api/ai/templates";
/** Whether a path's body is read by its own route here, past the 64 KB every other is held to (`app.ts`): a call's, or a template's. */
export const readsOwnBody = (path: string): boolean => AI_CALL_PATHS.has(path) || path === TEMPLATES_PATH || path.startsWith(`${TEMPLATES_PATH}/`);

/** Max answer length as each action's is called in Admin → Panki AI → Limits, for the failure that says to raise it. */
const LIMIT_NAMES: Record<AiActionId, string> = { explain: "Max answer length", touchUp: "Max Touch up answer length", proofread: "Max Proofread answer length" };

/** A shape with one of Panki's rules on top: a rule broken is named in the issue, so the Log says which, as expected against got. */
function ruled<T>(shape: z.ZodType<T>, broken: (value: T) => string | null): z.ZodType<T> {
  return shape.superRefine((value, ctx) => {
    const reason = broken(value);
    if (reason !== null) ctx.addIssue({ code: "custom", message: reason });
  });
}

/** Meaning rows in the list's order, as every answer's are sent on. */
const inOrder = <R extends { meaning: number }>(rows: readonly R[]): R[] => [...rows].sort((a, b) => a.meaning - b.meaning);
/** A touch-up's Meaning with its rows in the list's order, when it was judged and isn't the error. */
function meaningsInOrder(answer: TouchUpAnswer): TouchUpAnswer {
  const meaning = answer.meaning;
  return meaning && !isError(meaning) ? { ...answer, meaning: { ...meaning, meanings: inOrder(meaning.meanings) } } : answer;
}
/** The meaning Explain proposes, its words trimmed; null when a row fits. */
const proposedOf = (proposed: ProposedMeaning | null): ProposedMeaning | null => (proposed ? { meaning: proposed.meaning.trim(), reason: proposed.reason.trim() } : null);
/** What each action's answer is called where Max follow-ups is reached: "That's the most follow-ups an explanation takes." */
const FOLLOW_UPS_OF: Record<AiActionId, string> = { explain: "an explanation", touchUp: "a touch-up", proofread: "a proofread" };

/**
 * Panki AI, for everyone (2026-10-30): whether it's on, the provider and its model, whose key the provider has, and,
 * for an admin, the key itself. Read by anyone signed in; changed by an admin alone. Each action (Explain, Touch up) is
 * a call to the provider with the key an admin typed or the server's own, read through the one reader, running a
 * template of the account's own or one of Panki's starters (AI step 5); the account's templates are its own to manage.
 */
export function aiRouter(dbOf: DbOf, shared: Shared, serverKeys: Record<AiProviderId, string | null>, ai: AiClient, now: () => number) {
  const router = Router();

  // The key typed in Settings goes back to an admin, to see what's there; the server's own never does, nor anything to
  // anyone else. With it, what's the account's own: its two languages, its templates, which each action runs, and above
  // what a run asks first.
  const statusOf = (res: Response): PankiAiStatus => {
    const settings = shared.getAi();
    const saved = shared.key(settings.aiProvider);
    const db = dbOf(res);
    const account = db.getSettings();
    const templates = db.listAiTemplates();
    return {
      settings,
      key: saved !== null ? "settings" : serverKeys[settings.aiProvider] !== null ? "server" : null,
      ...(saved !== null && signedIn(res).user.admin ? { saved } : {}),
      learningLanguage: account.language,
      language: account.appLanguage,
      templates,
      defaults: defaultIdsOf(account.aiDefaults, templates),
      askOverMicros: account.aiAskOverMicros,
      showCostOverMicros: account.aiShowCostOverMicros,
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

  // The account's own templates (AI step 5): anyone signed in makes, saves and deletes their own. Panki's starters are
  // never stored, so a starter's id is never one here: changing or deleting one is refused as one that isn't there.
  router.post("/templates", express.json({ limit: TEMPLATE_BODY_MAX }), (req, res) => {
    const parsed = NewAiTemplate.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "That template isn't valid.", path: parsed.error.issues[0]?.path ?? [] } });
      return;
    }
    res.status(201).json({ template: dbOf(res).insertAiTemplate(parsed.data, now()) });
  });

  router.put("/templates/:templateId", express.json({ limit: TEMPLATE_BODY_MAX }), (req, res) => {
    const id = TemplateId.safeParse(req.params.templateId);
    if (!id.success) {
      res.status(400).json({ error: { message: "That template id isn't valid." } });
      return;
    }
    const parsed = AiTemplateUpdate.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "That template isn't valid.", path: parsed.error.issues[0]?.path ?? [] } });
      return;
    }
    const template = dbOf(res).updateAiTemplate(id.data, parsed.data, now());
    if (!template) {
      res.status(404).json({ error: { message: "That template doesn't exist." } });
      return;
    }
    res.json({ template });
  });

  // Delete hides the template; nothing is destroyed. The default deleted, its action runs its first starter again
  // (`defaultTemplateOf`), the account's setting left naming it, read as gone.
  router.delete("/templates/:templateId", (req, res) => {
    const id = TemplateId.safeParse(req.params.templateId);
    if (!id.success) {
      res.status(400).json({ error: { message: "That template id isn't valid." } });
      return;
    }
    if (!dbOf(res).removeAiTemplate(id.data, now())) {
      res.status(404).json({ error: { message: "That template doesn't exist." } });
      return;
    }
    res.status(204).end();
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
  /** An answer read whole, what it came as, its tokens and what they cost, and what it ran on. */
  type Ran<T> = { value: T; raw: string; inputTokens: number; outputTokens: number; costMicros: number; ranOn: AiRanOn };
  /**
   * One action's call, the same for every action: Panki AI on and keyed, the whole held to Max request length, the
   * provider asked through the one reader, and one usage row whatever came back that the provider billed (an answer
   * read whole, or one cut short or in the wrong shape). Answers the value and what it cost, or null once it has
   * refused with the reason.
   */
  async function run<T>(res: Response, settings: PankiAi, { action, prompt, said, maxTokens, shape, ref }: Run<T>): Promise<Ran<T> | null> {
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

  /** What an ask comes to before it's sent: the template it runs, whether it's a follow-up, the messages, and what the ledger names it by. */
  type Prepared = {
    template: AiTemplate;
    followUp: boolean;
    /** The template's prompt filled, then the conversation so far with, for a follow-up, its Follow-up prompt filled last. */
    prompt: string;
    said: ExplainMessage[];
    /** A follow-up's Follow-up prompt as filled and sent, handed back for the page to keep in `Said`; "" for a first ask. */
    asked: string;
    ref: string;
  };
  /**
   * An ask made ready the same way for every action (AI step 5): the template it names, the account's own or a starter
   * and the action's, filled by the server, never text the page sends; a follow-up held to Max follow-ups and Max
   * follow-up length, its question the asker's (`asking`), filled into the template's Follow-up prompt over the pieces.
   * `{Meaning}` is the list made here (`meaningsPiece`), the one an answer's rows are checked against, in the Follow-up
   * prompt as in the first; the account's two languages its own whatever came (`piecesFor`). Null once it has refused.
   */
  function prepare(res: Response, settings: PankiAi, action: AiActionId, ask: Pick<ExplainAsk, "templateId" | "pieces" | "meanings" | "said" | "asking">): Prepared | null {
    const template = templateById(ask.templateId, dbOf(res).listAiTemplates());
    if (!template || template.action !== action) {
      // With Panki AI as it stands, so the page takes the templates as they are now (one deleted on another device).
      const message = template ? `That template isn't ${AI_ACTIONS[action].name}'s.` : "That template doesn't exist.";
      res.status(400).json({ error: { message }, ai: statusOf(res) });
      return null;
    }
    const followUp = isFollowUp(ask);
    if (followUp) {
      const question = ask.asking?.question?.trim() ?? "";
      if (question === "") {
        res.status(400).json({ error: { message: "A follow-up needs a question." } });
        return null;
      }
      // Every follow-up so far is a question in the conversation sent, and this one the next.
      if (ask.said.filter((m) => m.role === "user").length + 1 > settings.aiMaxFollowUps) {
        refuse(res, 409, "followUps", `That's the most follow-ups ${FOLLOW_UPS_OF[action]} takes.`);
        return null;
      }
      if (question.length > settings.aiMaxQuestionChars) {
        refuse(res, 413, "tooLong", `That question is longer than the ${settings.aiMaxQuestionChars.toLocaleString("en")} characters Panki sends.`);
        return null;
      }
    }
    const meanings = ask.meanings.length > 0 ? { dictMeaning: meaningsPiece(ask.meanings) } : {};
    const pieces = piecesFor(res, { ...ask.pieces, ...meanings }, settings);
    const asking = piecesFor(res, { ...ask.asking, ...meanings }, settings);
    // What's sent and what Max request length counts are one list (`aiSent`), as the page's "Up to" is worked out from.
    const sent = aiSent(template, pieces, ask.said, asking);
    const asked = followUp ? (sent[sent.length - 1] ?? "") : "";
    if (followUp && asked.trim() === "") {
      res.status(400).json({ error: { message: "This template's Follow-up prompt comes out empty." } });
      return null;
    }
    const said: ExplainMessage[] = followUp ? [...ask.said, { role: "user", text: asked }] : [];
    return { template, followUp, prompt: sent[0] ?? "", said, asked, ref: pieces.dictForm || pieces.word || "" };
  }
  /** The tokens and cost of an answer, and what it ran on, as every action's reply carries them. */
  const spent = ({ raw, inputTokens, outputTokens, costMicros, ranOn }: Ran<unknown>) => ({ raw, inputTokens, outputTokens, costMicros, ranOn });

  /**
   * Explain (step 2, its fixed shape since step 3, its template since step 5): the template's prompt filled from the
   * pieces of the word pointed at and, for a follow-up, the conversation so far and its Follow-up prompt. A template
   * that judges the meanings answers the explanation, a verdict on every meaning sent (the indexes checked against
   * them) and, when none fits, the meaning it proposes; a follow-up the answer, and the meanings only when it judges
   * them again. One that doesn't judge answers plainly, first and after. Every limit is held here, whatever the
   * extension held already. Nothing of the conversation is kept, nor logged.
   */
  router.post("/explain", express.json({ limit: AI_BODY_MAX }), async (req, res) => {
    const parsed = ExplainAsk.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "That request isn't valid." } });
      return;
    }
    const settings = shared.getAi();
    const ask = prepare(res, settings, "explain", parsed.data);
    if (!ask) return;
    const count = parsed.data.meanings.length;
    const call = { action: "explain", prompt: ask.prompt, said: ask.said, maxTokens: settings.aiMaxAnswerTokens, ref: ask.ref } as const;
    const send = (explain: Pick<Explained, "text" | "meanings" | "proposedMeaning" | "judgedAgain">, answer: Ran<unknown>) => {
      res.json({ explain: { ...explain, asked: ask.asked, cut: false, ...spent(answer) }, ai: statusOf(res) });
    };
    if (!ask.template.judges) {
      const answer = await run(res, settings, { ...call, shape: ruled(PlainShape, plainRuleBroken) });
      if (answer) send({ text: answer.value.answer, meanings: [], proposedMeaning: null, judgedAgain: false }, answer);
      return;
    }
    if (ask.followUp) {
      // The verdicts stand unless the question changes them (`meanings` []); judged again, they're held to the first
      // answer's rules and marked afresh.
      const answer = await run(res, settings, { ...call, shape: ruled(ExplainFollowUpShape, (value) => explainFollowUpRuleBroken(value, count)) });
      if (!answer) return;
      const judgedAgain = answer.value.meanings.length > 0;
      send({ text: answer.value.answer, meanings: judgedAgain ? inOrder(answer.value.meanings) : [], proposedMeaning: judgedAgain ? proposedOf(answer.value.proposedMeaning) : null, judgedAgain }, answer);
      return;
    }
    const answer = await run(res, settings, { ...call, shape: ruled(ExplainShape, (value) => explainRuleBroken(value, count)) });
    if (answer) send({ text: answer.value.explanation, meanings: inOrder(answer.value.meanings), proposedMeaning: proposedOf(answer.value.proposedMeaning), judgedAgain: false }, answer);
  });

  /**
   * Touch up (step 3, its template since step 5): the card being added, as `{Card}` says it, with what the dictionary,
   * the page and the video say; the answer one entry for each key whose field the deck has, each proposal checked
   * against what was sent (a meaning's number against the meanings). A follow-up sends the card as it stands now in
   * its own pieces and answers its reply and only what it changes. Nothing of it is kept: the page shows each proposal,
   * and only what's accepted goes onto the card, its source Panki AI.
   */
  router.post("/touch-up", express.json({ limit: AI_BODY_MAX }), async (req, res) => {
    const parsed = TouchUpAsk.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "That request isn't valid." } });
      return;
    }
    const settings = shared.getAi();
    const ask = prepare(res, settings, "touchUp", parsed.data);
    if (!ask) return;
    const { meanings, keys, now: card } = parsed.data;
    const call = { action: "touchUp", prompt: ask.prompt, said: ask.said, maxTokens: settings.aiMaxTouchUpTokens, ref: ask.ref } as const;
    // Asked on the wire, which has no union, nothing optional and nothing nullable (a provider refuses a schema past 16
    // of those); read into the owner's shapes at once (`answerOfWire`, `followOfWire`), and every rule held to those.
    if (ask.followUp) {
      const answer = await run(res, settings, { ...call, shape: ruled(touchUpFollowShape(keys), (wire) => touchUpFollowProblem(wire, meanings)) });
      if (!answer) return;
      const { reply, answer: changes } = followOfWire(answer.value);
      res.json({ touchUp: { answer: meaningsInOrder(changes), reply, asked: ask.asked, ...spent(answer) }, ai: statusOf(res) });
      return;
    }
    // `{Meaning}` is the one meanings list, Explain's; what's ticked is in `{Card}`, for the Meaning's own why. The
    // answer is held to the card as it was sent (`touchUpProblem`); the page draws it from there.
    const answer = await run(res, settings, { ...call, shape: ruled(touchUpShape(keys, card, meanings.length), (wire) => touchUpProblem(answerOfWire(wire), meanings, card)) });
    if (!answer) return;
    res.json({ touchUp: { answer: meaningsInOrder(answerOfWire(answer.value)), reply: "", asked: "", ...spent(answer) }, ai: statusOf(res) });
  });

  /**
   * Proofread (AI step 6): a video's Panki subtitles put right. The page names the lines it shows by their words' ids;
   * the server reads each as it stands now and fills the template's `{Transcript}`, `{Edited by hand}`, `{Unsure words}`
   * and, for a row alone, the lines either side (`proofreadPieces`), never text the page sends. The answer is the lines
   * the model changes (`ProofreadShape`, held to `proofreadProblem`); each is laid onto its words as the pencil's edit
   * is, every word changed a fix of Panki AI's beside the engine's word (`shared.proofreadFix`), whichever came later
   * winning. Held to the admin's Editing Panki subtitles as a hand edit is. No follow-ups: a run edits.
   */
  router.post("/proofread", express.json({ limit: AI_BODY_MAX }), async (req, res) => {
    const parsed = ProofreadAsk.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "That request isn't valid." } });
      return;
    }
    if (!shared.getTranscription().fixes) {
      refuse(res, 403, "editingOff", "Editing Panki subtitles is switched off.");
      return;
    }
    const { videoId, run: runId } = parsed.data;
    const lines = shared.proofreadLines(videoId, parsed.data.lines);
    if (!lines) {
      refuse(res, 409, "gone", "The transcript changed. Try again.");
      return;
    }
    const around = shared.proofreadLines(videoId, parsed.data.around) ?? [];
    const settings = shared.getAi();
    const ask = prepare(res, settings, "proofread", { templateId: parsed.data.templateId, pieces: { ...parsed.data.pieces, ...proofreadPieces(lines, around) }, meanings: [], said: [] });
    if (!ask) return;
    const before = lines.map(lineTextOf);
    const answer = await run(res, settings, {
      action: "proofread",
      prompt: ask.prompt,
      said: [],
      maxTokens: proofreadTokens(lines.length, settings.aiMaxProofreadTokens),
      shape: ruled(ProofreadShape, (value) => proofreadProblem(value, before)),
      ref: videoId,
    });
    if (!answer) return;
    // A line given back as it already reads changes nothing and isn't told of.
    const changed = answer.value.lines
      .map((l) => ({ line: l.line, text: l.text.trim(), reason: l.reason.trim() }))
      .filter((l) => l.text !== before[l.line - 1])
      .sort((a, b) => a.line - b.line);
    const words = shared.proofreadFix(
      videoId,
      changed.map((l) => ({ wordIds: parsed.data.lines[l.line - 1] ?? [], text: l.text, reason: l.reason })),
      { run: runId, model: answer.ranOn.model, templateId: ask.template.id, userId: signedIn(res).user.id },
      now(),
    );
    res.json({ proofread: { lines: changed, words, ...spent(answer) }, transcript: shared.transcript(videoId), ai: statusOf(res) });
  });

  return router;
}
