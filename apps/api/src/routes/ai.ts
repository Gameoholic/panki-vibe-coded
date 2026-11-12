import express, { Router, type Response } from "express";
import type { z } from "zod";
import {
  AI_PLACES,
  AI_PROVIDERS,
  APP_LANGUAGES,
  AiActionId,
  AiActionUpdate,
  AiActionsArrange,
  AiKeyUpdate,
  NewAiAction,
  actionOf,
  actionsOf,
  knobsProblem,
  litNow,
  litOf,
  replyRequired,
  leftOutFor,
  explainLeftOutFor,
  widerOf,
  AiProviderId,
  AiTemplateUpdate,
  type AiRanOn,
  ExplainAsk,
  ExplainShape,
  NewAiTemplate,
  PankiAiUpdate,
  ProofreadAsk,
  ProofreadShape,
  TEMPLATED_PLACE_IDS,
  TRANSCRIBE_LANGUAGES,
  TemplateId,
  TouchUpAsk,
  aiModelOf,
  aiSent,
  answerOfWire,
  customOf,
  defaultIdsOf,
  explainAsks,
  explainOfWire,
  explainProblem,
  explainRequiredFor,
  explainSendPieces,
  wordPromptOf,
  asksSomething,
  isError,
  isFollowUp,
  isModelOf,
  keysFor,
  lineTextOf,
  meaningsPiece,
  requiredFor,
  sendOf,
  sendPieces,
  sendTokens,
  cardPromptOf,
  piecesAsSent,
  proofreadPieces,
  proofreadProblem,
  proofreadTokens,
  sentLength,
  cardPiecesOf,
  keysWithLines,
  sentenceLinesOf,
  templateById,
  tokenCostMicros,
  touchUpProblem,
  touchUpShape,
  type AiPlaceId,
  type AiTemplate,
  type AiUnread,
  type ExplainMessage,
  type ExplainProblem,
  type PankiAi,
  type PankiAiStatus,
  type PromptPieces,
  type TouchUpAnswer,
} from "@panki/contracts";
import { AiError, PLAIN_ISSUE, safetyIdOf, type AiClient } from "../ai";
import type { DbOf } from "../app";
import { requireAdmin, signedIn } from "../session";
import type { Shared } from "../shared";

/**
 * The most a call's body can be: an explanation's follow-ups carry the conversation so far, and a touch-up the card and
 * every meaning, past the 64 KB every other JSON body is held to. Read here, once the sender is known to be signed in;
 * `app.ts` lets these routes by its own parser.
 */
export const AI_BODY_MAX = "1mb";
const AI_CALL_PATHS: ReadonlySet<string> = new Set(["/api/ai/word", "/api/ai/card", "/api/ai/transcript"]);
/** A template saved: a prompt and a Follow-up prompt of up to `PROMPT_MAX` characters each, which in Japanese run past 64 KB. */
const TEMPLATE_BODY_MAX = "256kb";
const TEMPLATES_PATH = "/api/ai/templates";
/** Whether a path's body is read by its own route here, past the 64 KB every other is held to (`app.ts`): a call's, or a template's. */
export const readsOwnBody = (path: string): boolean => AI_CALL_PATHS.has(path) || path === TEMPLATES_PATH || path.startsWith(`${TEMPLATES_PATH}/`);

/** Max answer length as each place's is called in Admin → Panki AI → Limits, for the failure that says to raise it. */
const LIMIT_NAMES: Record<AiPlaceId, string> = { word: "Max answer length", card: "Max Touch up answer length", transcript: "Max Proofread answer length" };

/**
 * A shape with one of Panki's rules on top: a rule broken is named in the issue, so the Log says which, as expected
 * against got. A message's knobs broken (`plain` set: Requires, Leave out) carry Panki's plain words too, which the
 * reader makes the failure's own message (`ai/index.ts`, `PLAIN_ISSUE`).
 */
function ruled<T>(shape: z.ZodType<T>, problem: (value: T) => { broken: string | null; plain?: string | null }): z.ZodType<T> {
  return shape.superRefine((value, ctx) => {
    const { broken, plain } = problem(value);
    if (broken === null) return;
    ctx.addIssue({ code: "custom", message: broken, ...(plain ? { params: { [PLAIN_ISSUE]: plain } } : {}) });
  });
}

/** A message without its wider subtitles: the first one, whose subtitles are the prompt's own. */
function withoutWider<S extends { wider?: string | undefined }>(each: S): S {
  const plain = { ...each };
  delete plain.wider;
  return plain;
}
/** A message with its wider subtitles where it may carry them (`widerOf`), without them otherwise. */
const widenedOr = <S extends { wider?: string | undefined }>(each: S, may: boolean): S => (may ? each : withoutWider(each));

/** Meaning rows in the list's order, as every answer's are sent on. */
const inOrder = <R extends { meaning: number }>(rows: readonly R[]): R[] => [...rows].sort((a, b) => a.meaning - b.meaning);
/** A touch-up's Meaning with its rows in the list's order, when it was judged and isn't the error. */
function meaningsInOrder(answer: TouchUpAnswer): TouchUpAnswer {
  const meaning = answer.meaning;
  return meaning && !isError(meaning) ? { ...answer, meaning: { ...meaning, meanings: inOrder(meaning.meanings) } } : answer;
}
/** Each place's conversation as it's named where Max messages is reached: "That's the most messages a word's conversation takes." */
const CONVERSATION_OF: Record<AiPlaceId, string> = { word: "a word's conversation", card: "a card's conversation", transcript: "a transcript's conversation" };

/**
 * Panki AI, for everyone: whether it's on, the provider and its model, whose key the provider has, and,
 * for an admin, the key itself. Read by anyone signed in; changed by an admin alone. Each place (Explain, Touch up) is
 * a call to the provider with the key an admin typed or the server's own, read through the one reader, running a
 * template of the account's own or one of Panki's starters (AI step 5); the account's templates are its own to manage.
 */
export function aiRouter(dbOf: DbOf, shared: Shared, serverKeys: Record<AiProviderId, string | null>, ai: AiClient, now: () => number) {
  const router = Router();

  // The key typed in Settings goes back to an admin, to see what's there; the server's own never does, nor anything to
  // anyone else. With it, what's the account's own: its two languages, its templates, which each place runs, and above
  // what a run asks first.
  const statusOf = (res: Response): PankiAiStatus => {
    const settings = shared.getAi();
    const saved = shared.key(settings.aiProvider);
    const db = dbOf(res);
    const account = db.getSettings();
    // Only the templates of places that still run them: an Explain or Touch up template kept is retired, unlisted.
    const templates = db.listAiTemplates().filter((t) => TEMPLATED_PLACE_IDS.includes(t.place));
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
      instructions: account.aiInstructions,
      actions: db.aiActions(),
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
    // A place whose prompt is the admin's takes no templates of an account's own (Touch up's).
    if (!TEMPLATED_PLACE_IDS.includes(parsed.data.place)) {
      res.status(400).json({ error: { message: `${AI_PLACES[parsed.data.place].name}'s prompt is set in Admin → Panki AI.`, path: ["place"] } });
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

  // Delete hides the template; nothing is destroyed. The default deleted, its place runs its first starter again
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

  // The account's actions ("Touch up, steered" step 2): anyone signed in makes, edits, deletes and arranges their own,
  // and edits, deletes and brings back Panki's (each kept as the account's copy, never Panki's registry). Each answers
  // the account's actions as they stand.
  const bad = (res: Response, message: string, path: readonly PropertyKey[] = []) => res.status(400).json({ error: { message, path } });
  router.get("/actions", (_req, res) => {
    res.json({ actions: dbOf(res).aiActions() });
  });

  router.post("/actions", (req, res) => {
    const parsed = NewAiAction.safeParse(req.body);
    if (!parsed.success) {
      bad(res, parsed.error.issues[0]?.message ?? "That action isn't valid.", parsed.error.issues[0]?.path ?? []);
      return;
    }
    const problem = knobsProblem(parsed.data);
    if (problem !== null) {
      bad(res, problem, ["requires"]);
      return;
    }
    const db = dbOf(res);
    res.status(201).json({ action: db.insertAiAction(parsed.data, now()), actions: db.aiActions() });
  });

  // Each place's order and the actions ticked as its conversation opens: every id one of the place's, each once.
  router.put("/actions", (req, res) => {
    const parsed = AiActionsArrange.safeParse(req.body);
    if (!parsed.success) {
      bad(res, "That order isn't valid.");
      return;
    }
    const { place, order, defaults } = parsed.data;
    const db = dbOf(res);
    const placed = actionsOf(db.aiActions(), place).map((action) => action.id);
    const fits = (ids: readonly string[] | undefined) => ids === undefined || (new Set(ids).size === ids.length && ids.every((id) => placed.includes(id)));
    if (!fits(order) || !fits(defaults)) {
      bad(res, `Those aren't ${AI_PLACES[place].name}'s actions.`);
      return;
    }
    const settings = db.getSettings();
    db.updateSettings(
      {
        ...(order ? { aiActionOrder: { ...settings.aiActionOrder, [place]: order } } : {}),
        ...(defaults ? { aiActionDefaults: { ...settings.aiActionDefaults, [place]: defaults } } : {}),
      },
      now(),
    );
    res.json({ actions: db.aiActions() });
  });

  router.put("/actions/:actionId", (req, res) => {
    const id = AiActionId.safeParse(req.params.actionId);
    const parsed = AiActionUpdate.safeParse(req.body);
    if (!id.success || !parsed.success) {
      bad(res, parsed.success ? "That action id isn't valid." : (parsed.error.issues[0]?.message ?? "That action isn't valid."), parsed.success ? [] : (parsed.error.issues[0]?.path ?? []));
      return;
    }
    const db = dbOf(res);
    const standing = actionOf(db.aiActions(), id.data);
    if (!standing) {
      res.status(404).json({ error: { message: "That action doesn't exist." } });
      return;
    }
    const problem = knobsProblem({ ...parsed.data, place: standing.place });
    if (problem !== null) {
      bad(res, problem, ["requires"]);
      return;
    }
    const action = db.saveAiAction(id.data, parsed.data, now());
    if (!action) {
      res.status(404).json({ error: { message: "That action doesn't exist." } });
      return;
    }
    res.json({ action, actions: db.aiActions() });
  });

  // Delete hides the action for the account; nothing is destroyed, and one of Panki's is brought back by restore.
  router.delete("/actions/:actionId", (req, res) => {
    const id = AiActionId.safeParse(req.params.actionId);
    const db = dbOf(res);
    if (!id.success || !db.removeAiAction(id.data, now())) {
      res.status(404).json({ error: { message: "That action doesn't exist." } });
      return;
    }
    res.json({ actions: db.aiActions() });
  });

  router.post("/actions/:actionId/restore", (req, res) => {
    const id = AiActionId.safeParse(req.params.actionId);
    const db = dbOf(res);
    if (!id.success || !db.restoreAiAction(id.data, now())) {
      res.status(404).json({ error: { message: "That isn't one of Panki's actions edited or deleted." } });
      return;
    }
    res.json({ actions: db.aiActions() });
  });

  /**
   * Why a place didn't answer, with Panki AI as it stands, so the page says it and keeps its copy of the settings; for
   * an answer that came back unusable, what it was, for Details' Log (`unread`).
   */
  const refuse = (res: Response, status: number, problem: ExplainProblem, message: string, unread?: AiUnread) => {
    res.status(status).json({ error: { message, problem, ...(unread ? { unread } : {}) }, ai: statusOf(res) });
  };
  /** A message with an action the account no longer has (deleted on another device): with Panki AI as it stands, so the page takes its actions as they are now. */
  const gone = (res: Response) => {
    res.status(400).json({ error: { message: "One of those actions isn't there any more." }, ai: statusOf(res) });
  };

  /**
   * The pieces as they're sent: cut as the page's Details say (`piecesAsSent`, the one cut), the account's two languages
   * and its standing message (User instructions) its own whatever came.
   */
  const piecesFor = (res: Response, pieces: PromptPieces, settings: PankiAi): PromptPieces => {
    const account = dbOf(res).getSettings();
    return piecesAsSent(
      { ...pieces, learningLanguage: TRANSCRIBE_LANGUAGES[account.language], language: APP_LANGUAGES[account.appLanguage], instructions: account.aiInstructions },
      settings,
    );
  };

  type Run<T> = {
    place: AiPlaceId;
    /** The filled prompt, then the conversation so far. */
    prompt: string;
    said: readonly ExplainMessage[];
    maxTokens: number;
    shape: z.ZodType<T>;
    /** What it was done to, for the ledger: the word. */
    ref: string;
    /** The actions a card's conversation's send went with, for the ledger. */
    actions?: readonly string[];
  };
  /** An answer read whole, what it came as, its tokens and what they cost, and what it ran on. */
  type Ran<T> = { value: T; raw: string; inputTokens: number; outputTokens: number; costMicros: number; ranOn: AiRanOn };
  /**
   * One place's call, the same for every place: Panki AI on and keyed, the whole held to Max request length, the
   * provider asked through the one reader, and one usage row whatever came back that the provider billed (an answer
   * read whole, or one cut short or in the wrong shape). Answers the value and what it cost, or null once it has
   * refused with the reason.
   */
  async function run<T>(res: Response, settings: PankiAi, { place, prompt, said, maxTokens, shape, ref, actions }: Run<T>): Promise<Ran<T> | null> {
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
      shared.meter({ kind: "ai", service: settings.aiProvider, model: model.id, what: place, ref: ref.slice(0, 100) || null, userId, inputTokens, outputTokens, costMicros, ...(actions ? { actions } : {}) }, now());
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
        name: place,
        limit: LIMIT_NAMES[place],
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
    /** The pieces as they were sent (`piecesAsSent`): what an answer is held to beyond its shape. */
    pieces: PromptPieces;
  };
  /** An ask that runs a template: the template by its id, the pieces, the meanings, and for a follow-up the conversation so far and its question. */
  type TemplatedAsk = { templateId: TemplateId; pieces: PromptPieces; meanings: readonly string[]; said: readonly ExplainMessage[]; asking?: PromptPieces };
  /**
   * An ask made ready the same way for every templated place (Proofread's, since Explain's and Touch up's prompts are
   * the admin's): the template it names, the account's own or a starter
   * and the place's, filled by the server, never text the page sends; a follow-up held to Max follow-ups and Max
   * follow-up length, its question the asker's (`asking`), filled into the template's Follow-up prompt over the pieces.
   * `{Meaning}` is the list made here (`meaningsPiece`), the one an answer's rows are checked against, in the Follow-up
   * prompt as in the first; the account's two languages its own whatever came (`piecesFor`). Null once it has refused.
   */
  function prepare(res: Response, settings: PankiAi, place: AiPlaceId, ask: TemplatedAsk, custom: readonly string[] = []): Prepared | null {
    const template = templateById(ask.templateId, dbOf(res).listAiTemplates());
    if (!template || template.place !== place) {
      // With Panki AI as it stands, so the page takes the templates as they are now (one deleted on another device).
      const message = template ? `That template isn't ${AI_PLACES[place].name}'s.` : "That template doesn't exist.";
      res.status(400).json({ error: { message }, ai: statusOf(res) });
      return null;
    }
    const followUp = isFollowUp(ask);
    if (followUp) {
      const question = ask.asking?.question?.trim() ?? "";
      if (question === "") {
        res.status(400).json({ error: { message: "A message needs words." } });
        return null;
      }
      // Every follow-up so far is a question in the conversation sent, and this one the next.
      if (ask.said.filter((m) => m.role === "user").length + 1 > settings.aiMaxFollowUps) {
        refuse(res, 409, "followUps", `That's the most messages ${CONVERSATION_OF[place]} takes.`);
        return null;
      }
      if (question.length > settings.aiMaxQuestionChars) {
        refuse(res, 413, "tooLong", `That question is longer than the ${settings.aiMaxQuestionChars.toLocaleString("en")} characters Panki sends.`);
        return null;
      }
    }
    const meanings = ask.meanings.length + custom.length > 0 ? { dictMeaning: meaningsPiece(ask.meanings, custom) } : {};
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
    return { template, followUp, prompt: sent[0] ?? "", said, asked, ref: pieces.dictForm || pieces.word || "", pieces };
  }
  /** The tokens and cost of an answer, and what it ran on, as every place's reply carries them. */
  const spent = ({ raw, inputTokens, outputTokens, costMicros, ranOn }: Ran<unknown>) => ({ raw, inputTokens, outputTokens, costMicros, ranOn });

  /**
   * Explain (step 2; a word's conversation over the admin's prompt since "Touch up, steered" step 4): every send is one
   * message of the conversation about the word pointed at. The first prompt is the admin's (`adminPromptOf`), filled
   * from the word, what the dictionaries say of it, its sentence and what's around it, and the account's User
   * instructions, then the conversation's first send; every later send is its own message after the conversation so far.
   * Every send answers in the one shape (`ExplainShape`): a reply, and the meanings judged or left untouched, the rows
   * checked against the meanings sent; the parts its actions require (`explainRequiredFor`: Explain the reply and the
   * meanings, Grammar the reply) and those they leave out held to it, the whole message failing when they aren't. The prompt, the standing message and the actions'
   * words are the server's, never text the page sends. Nothing of the conversation is kept, nor logged.
   */
  router.post("/word", express.json({ limit: AI_BODY_MAX }), async (req, res) => {
    const parsed = ExplainAsk.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "That request isn't valid." } });
      return;
    }
    const settings = shared.getAi();
    const ask = parsed.data;
    const later = ask.said.length > 0;
    if (later && !ask.send) {
      res.status(400).json({ error: { message: "A message after the first needs its own words." } });
      return;
    }
    const send = sendOf(ask);
    // The actions by the account's own, each its words and knobs; one it no longer has refuses the message whole.
    const book = dbOf(res).aiActions();
    const lit = litOf(book, "word", send.actions);
    if (!lit) {
      gone(res);
      return;
    }
    if (!explainAsks(lit, send.text)) {
      res.status(400).json({ error: { message: "A message needs words." } });
      return;
    }
    if (send.text.trim().length > settings.aiMaxQuestionChars) {
      refuse(res, 413, "tooLong", `That message is longer than the ${settings.aiMaxQuestionChars.toLocaleString("en")} characters Panki sends.`);
      return;
    }
    // Every message after the first counts against Max messages: each is a question in the conversation sent, and this one the next.
    if (later && ask.said.filter((m) => m.role === "user").length + 1 > settings.aiMaxFollowUps) {
      refuse(res, 409, "followUps", `That's the most messages ${CONVERSATION_OF.word} takes.`);
      return;
    }
    // `{Meaning}` is the one meanings list (`meaningsPiece`), the one an answer's rows are checked against.
    const meanings = ask.meanings.length > 0 ? { dictMeaning: meaningsPiece(ask.meanings) } : {};
    const pieces = piecesFor(res, { ...ask.pieces, ...meanings }, settings);
    // Wider subtitles go only with a later message whose actions reach further than the first's (`widerOf`).
    const own = widenedOr(send, later && widerOf(lit, litNow(book, "word", ask.opening.actions), send.reach ?? null, ask.opening.reach ?? null) !== null);
    const sent = aiSent(wordPromptOf(settings), pieces, ask.said, explainSendPieces(own, book), explainSendPieces(withoutWider(ask.opening), book));
    const asked = later ? (sent[sent.length - 1] ?? "") : "";
    // Read into Panki's own shape at once (`explainOfWire`) and held to what was sent (`explainProblem`): a rule broken
    // fails it whole, and so does a part the send required that didn't come back or one it leaves out
    // (`explainLeftOutFor`) that did, said in Panki's words.
    const held = { count: ask.meanings.length, requires: explainRequiredFor(lit), leaves: explainLeftOutFor(lit) };
    const answer = await run(res, settings, {
      place: "word",
      prompt: sent[0] ?? "",
      said: later ? [...ask.said, { role: "user", text: asked }] : [],
      maxTokens: settings.aiMaxAnswerTokens,
      shape: ruled(ExplainShape, (wire) => explainProblem(explainOfWire(wire), held)),
      ref: pieces.dictForm || pieces.word || "",
      actions: send.actions,
    });
    if (!answer) return;
    const read = explainOfWire(answer.value);
    res.json({
      explain: { text: read.reply, meanings: read.judged?.meanings ?? [], proposedMeaning: read.judged?.proposed ?? null, judged: read.judged !== null, asked, cut: false, ...spent(answer) },
      ai: statusOf(res),
    });
  });

  /**
   * Touch up (step 3; a card's conversation over the admin's prompt since "Touch up, steered"): every send is one message
   * of the conversation about the card being added. The first prompt is the admin's (`adminPromptOf`), filled from what
   * the dictionary, the page and the video say and the account's User instructions, then the conversation's first send;
   * every later send is its own message after the conversation so far. Every send answers in the one shape: a reply and
   * each key it may answer (every one the deck maps, `keysFor`) answered or untouched, each proposal
   * checked against what was sent, and the keys its actions require (`requiredFor`: Touch up every one) and leave out
   * held to it, the whole message failing when they aren't. The prompt, the standing message and the actions' words are the server's, never text the page sends.
   * Nothing of it is kept: the page shows each proposal, and only what's accepted goes onto the card, its source Panki AI.
   */
  router.post("/card", express.json({ limit: AI_BODY_MAX }), async (req, res) => {
    const parsed = TouchUpAsk.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "That request isn't valid." } });
      return;
    }
    const settings = shared.getAi();
    const ask = parsed.data;
    const { meanings, now: card } = ask;
    const later = ask.said.length > 0;
    if (later && !ask.send) {
      res.status(400).json({ error: { message: "A message after the first needs its own words." } });
      return;
    }
    // The actions by the account's own, each its words and knobs; one it no longer has refuses the message whole. Wider
    // subtitles go only with a later message whose actions reach further than the first's (`widerOf`).
    const book = dbOf(res).aiActions();
    const lit = litOf(book, "card", sendOf(ask).actions);
    if (!lit) {
      gone(res);
      return;
    }
    const opening = withoutWider(ask.opening);
    const plain = sendOf(ask);
    const send = widenedOr(plain, later && widerOf(lit, litNow(book, "card", ask.opening.actions), plain.reach ?? null, ask.opening.reach ?? null) !== null);
    // The Sentence is picked as subtitle lines by their numbers, from the subtitles this message holds; with none, it
    // isn't asked at all.
    const lines = sentenceLinesOf(ask.pieces, send);
    const mapped = keysWithLines(ask.keys, lines);
    const keys = keysFor(mapped);
    if (!asksSomething(mapped, lit, send.text)) {
      res.status(400).json({ error: { message: "A message needs words." } });
      return;
    }
    if (send.text.trim().length > settings.aiMaxQuestionChars) {
      refuse(res, 413, "tooLong", `That message is longer than the ${settings.aiMaxQuestionChars.toLocaleString("en")} characters Panki sends.`);
      return;
    }
    // Every message after the first counts against Max messages: each is a question in the conversation sent, and this one the next.
    if (later && ask.said.filter((m) => m.role === "user").length + 1 > settings.aiMaxFollowUps) {
      refuse(res, 409, "followUps", `That's the most messages ${CONVERSATION_OF.card} takes.`);
      return;
    }
    // The Meaning's own meanings, read off its text as sent, are listed after the dictionary's: rows of their own.
    const custom = customOf(card, meanings);
    const meaningsSent = meanings.length + custom.length > 0 ? { dictMeaning: meaningsPiece(meanings, custom) } : {};
    const pieces = piecesFor(res, { ...ask.pieces, ...meaningsSent }, settings);
    const sent = aiSent(cardPromptOf(settings), cardPiecesOf(pieces), ask.said, sendPieces(send, mapped, book), sendPieces(opening, mapped, book));
    const asked = later ? (sent[sent.length - 1] ?? "") : "";
    const call = {
      place: "card",
      prompt: sent[0] ?? "",
      said: later ? [...ask.said, { role: "user" as const, text: asked }] : [],
      maxTokens: sendTokens(settings.aiMaxTouchUpTokens, mapped, lit, send.text),
      ref: pieces.dictForm || pieces.word || "",
      actions: send.actions,
    } as const;
    // A proposed Sentence is the lines its numbers name, copied, never words the model wrote; lines that can't be used
    // (none picked, or without the word) are that part alone set aside as the `rewrote` error, the rest standing.
    const sentence = { lines, word: pieces.word ?? "" };
    // `{Meaning}` is the one meanings list, Explain's, with the Meaning's custom ones after; what it holds is in
    // `{Card}`, for the Meaning's own why. Every send answers in the one shape, asked on the wire, which has no union,
    // nothing optional and nothing nullable (a provider refuses a schema past 16 of those), read into Panki's own shapes
    // at once (`answerOfWire`) and held to the card as it was sent (`touchUpProblem`): a rule broken fails it whole, and
    // so do the message's knobs broken, said in Panki's words: a key it requires untouched, a reply it requires (the
    // card's Explain, Grammar…) empty, a key it leaves out (`leftOutFor`) answered. Nothing of such a message lands.
    const held = { meanings, now: card, requires: requiredFor(mapped, lit), reply: replyRequired(lit), leaves: leftOutFor(mapped, lit) };
    const shape = ruled(touchUpShape(keys, card, meanings.length + custom.length), (wire) => touchUpProblem(answerOfWire(wire, sentence), held));
    const answer = await run(res, settings, { ...call, shape });
    if (!answer) return;
    const read = answerOfWire(answer.value, sentence);
    res.json({ touchUp: { answer: meaningsInOrder(read.answer), reply: read.reply, asked, ...spent(answer) }, ai: statusOf(res) });
  });

  /**
   * Proofread (AI step 6): a video's Panki subtitles put right. The page names the lines it shows by their words' ids;
   * the server reads each as it stands now and fills the template's `{Transcript}`, `{Edited by hand}`, `{Unsure words}`
   * and, for a row alone, the lines either side (`proofreadPieces`), never text the page sends. The answer is the lines
   * the model changes (`ProofreadShape`, held to `proofreadProblem`); each is laid onto its words as the pencil's edit
   * is, every word changed a fix of Panki AI's beside the engine's word (`shared.proofreadFix`), whichever came later
   * winning. Held to the admin's Editing Panki subtitles as a hand edit is. No follow-ups: a run edits.
   */
  router.post("/transcript", express.json({ limit: AI_BODY_MAX }), async (req, res) => {
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
    const ask = prepare(res, settings, "transcript", { templateId: parsed.data.templateId, pieces: { ...parsed.data.pieces, ...proofreadPieces(lines, around) }, meanings: [], said: [] });
    if (!ask) return;
    const before = lines.map(lineTextOf);
    const answer = await run(res, settings, {
      place: "transcript",
      prompt: ask.prompt,
      said: [],
      maxTokens: proofreadTokens(lines.length, settings.aiMaxProofreadTokens),
      shape: ruled(ProofreadShape, (value) => ({ broken: proofreadProblem(value, before) })),
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
