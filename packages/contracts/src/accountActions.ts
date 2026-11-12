/** @panki Each account's own Panki AI actions as kept and told: the places with actions, what one requires or leaves out (`AccountActions`, `KeptAction`, `TOUCH_UP_KEYS`). */
import { z } from "zod";

/**
 * Each account's Panki AI actions as they're kept and told ("Touch up, steered" step 2): the places that have actions,
 * what an action can require or leave, and the account's own actions beside Panki's. Apart from `aiActions.ts`, which
 * reads `ai.ts`, so that `ai.ts` can tell the account's actions with the rest of Panki AI (`PankiAiStatus.actions`): this
 * file reads nothing of Panki's.
 */

/**
 * The places that have actions, whose prompt is the admin's (`ai.ts` → `ADMIN_PROMPT_PLACE_IDS` is this list): the word
 * and the card. The transcript's Proofread still runs templates.
 */
export const ACTION_PLACE_IDS = ["word", "card"] as const;
export const ActionPlaceId = z.enum(ACTION_PLACE_IDS);
export type ActionPlaceId = z.infer<typeof ActionPlaceId>;

/**
 * Touch up's keys (`touchUp.ts` → `TOUCH_UP`, each a field mapping role and its name): what a card's answer can judge,
 * one registry. A new key is one entry here, one line of the answer and its words in the default prompt. Here so an
 * action's knobs can name them.
 */
export const TOUCH_UP_KEYS = ["meaning", "reading", "dictionaryForm", "pitchAccent", "line", "explanation", "examples"] as const;
export const TouchUpKey = z.enum(TOUCH_UP_KEYS);
export type TouchUpKey = z.infer<typeof TouchUpKey>;

/**
 * The parts of a word's answer a message can require to come back, one registry: the reply, and the meanings judged (a
 * row for each, or the meaning it proposes when there are none to judge). One that didn't come back is named under the
 * reply, with Try again (`prompt.ts` → `EXPLAIN_PART_NAMES`).
 */
export const EXPLAIN_PARTS = ["reply", "meanings"] as const;
export const ExplainPart = z.enum(EXPLAIN_PARTS);
export type ExplainPart = z.infer<typeof ExplainPart>;

/**
 * What an action can require to come back: a card's field by its Touch up key, or a part of a word's answer. The Line's
 * key was "sentence" until 2026-11-12: an action kept from then reads it as "line".
 */
export const ActionPart = z.preprocess((part) => (part === "sentence" ? "line" : part), z.union([TouchUpKey, ExplainPart]));
export type ActionPart = z.infer<typeof ActionPart>;

/**
 * An action's id: Panki's own by its name in the registry (`aiActions.ts` → `AI_ACTION_IDS`, "touchUp"), an account's
 * own by the id Panki gave it as it was made.
 */
export const AiActionId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, { message: "That action id isn't valid." });
export type AiActionId = z.infer<typeof AiActionId>;
/** The longest an action's name can be. */
export const ACTION_NAME_MAX = 60;
/** The longest an action's words can be: a message, held to Max message length besides when it's sent. */
export const ACTION_WORDS_MAX = 4_000;
/** How many actions an account can have of its own, edited or made: far past any real use, so a broken list is refused. */
export const ACTIONS_MAX = 200;
/** How many seconds of video subtitles an action sends each way to begin with, and a message with no action ticked. */
export const DEFAULT_ACTION_SECONDS = 30;
/** The most seconds of video subtitles an action can send each way: five minutes before and after. */
export const ACTION_SECONDS_MAX = 300;

/**
 * An action as the account keeps it: an edited copy of one of Panki's (by Panki's id) or one of its own. Its place, its
 * name, its words (what it says in a message, before what was typed; "" for one that's only knobs), and its knobs:
 * what must come back (`requires`: a card's Touch up keys and the reply, or a word's parts), what must not
 * (`leaves`, Leave out: a card's Touch up keys, or a word's parts; one that comes back answered is dropped and named),
 * and how many seconds of video subtitles it sends each way, either place's (`seconds`). Which knobs a place takes is
 * `knobsProblem`'s to say. A `seconds` kept as null (Admin's Surrounding video subtitles, when that was the reach)
 * reads as the default, and one past the most as the most. An `under` kept from when an action could stand under
 * another is read by nothing.
 */
export const KeptAction = z.object({
  id: AiActionId,
  place: ActionPlaceId,
  name: z.string().trim().min(1, { message: "An action needs a name." }).max(ACTION_NAME_MAX, { message: `At most ${ACTION_NAME_MAX} characters.` }),
  words: z.string().max(ACTION_WORDS_MAX, { message: `At most ${ACTION_WORDS_MAX.toLocaleString("en")} characters.` }),
  requires: z.array(ActionPart).max(TOUCH_UP_KEYS.length + EXPLAIN_PARTS.length).default([]),
  leaves: z.array(ActionPart).max(TOUCH_UP_KEYS.length + EXPLAIN_PARTS.length).default([]),
  seconds: z.preprocess(
    (value) => (value === null || value === undefined ? DEFAULT_ACTION_SECONDS : typeof value === "number" ? Math.min(value, ACTION_SECONDS_MAX) : value),
    z.number().int().min(0).max(ACTION_SECONDS_MAX),
  ),
});
export type KeptAction = z.infer<typeof KeptAction>;

/**
 * The account's actions as Panki tells them, what every place's composer and Settings → Panki AI read beside Panki's
 * registry: the account's copies (`saved`: each of Panki's it edited, by Panki's id, and each of its own), Panki's it
 * deleted (`hidden`), and each place's order and defaults as the account set them (`order`, `defaults`: a place left
 * out is Panki's own; every id there is the place's, any it doesn't have read as gone).
 */
export const AccountActions = z.object({
  saved: z.array(KeptAction).max(ACTIONS_MAX).default([]),
  hidden: z.array(AiActionId).max(ACTIONS_MAX).default([]),
  order: z.partialRecord(ActionPlaceId, z.array(AiActionId).max(ACTIONS_MAX * 2)).default({}),
  defaults: z.partialRecord(ActionPlaceId, z.array(AiActionId).max(ACTIONS_MAX * 2)).default({}),
});
export type AccountActions = z.infer<typeof AccountActions>;
/** An account that changed nothing: Panki's actions, in Panki's order, Panki's defaults lit. */
export const NO_ACCOUNT_ACTIONS: AccountActions = { saved: [], hidden: [], order: {}, defaults: {} };

/** What's sent to make an action of the account's own: everything but its id, which Panki gives it. */
export const NewAiAction = KeptAction.omit({ id: true });
export type NewAiAction = z.infer<typeof NewAiAction>;
/** What's sent to save an action, the account's own or one of Panki's (an edited copy then): all of it but its id and place, which never change. */
export const AiActionUpdate = KeptAction.omit({ id: true, place: true });
export type AiActionUpdate = z.infer<typeof AiActionUpdate>;
/** A place's order and defaults as Settings → Panki AI sets them: every action of the place in its order, and those lit as a conversation opens. */
export const AiActionsArrange = z.object({
  place: ActionPlaceId,
  order: z.array(AiActionId).max(ACTIONS_MAX * 2).optional(),
  defaults: z.array(AiActionId).max(ACTIONS_MAX * 2).optional(),
});
export type AiActionsArrange = z.infer<typeof AiActionsArrange>;
/** The account's actions as they stand after a change (`GET`, `PUT /api/ai/actions`, a delete, a restore). */
export const AiActionsResponse = z.object({ actions: AccountActions });
/** An action made or saved, as it stands now (one of Panki's saved as Panki has it is Panki's own), with the account's actions. */
export const AiActionResponse = z.object({ action: KeptAction, actions: AccountActions });
