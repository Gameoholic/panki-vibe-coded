/** @panki Panki's own actions, one registry, and how a message's actions are sent (`AI_ACTIONS`, `AiAction`, `PANKI_DEFAULTS`, `ExplainSend`, `TouchUpSend`). */
import { z } from "zod";
import {
  EXPLAIN_PARTS,
  ExplainPart,
  TOUCH_UP_KEYS,
  TouchUpKey,
  AiActionId,
  ACTION_SECONDS_MAX,
  DEFAULT_ACTION_SECONDS,
  type AccountActions,
  type ActionPart,
  type ActionPlaceId,
  type KeptAction,
} from "./accountActions";
import { adminPromptOf, type AdminPromptPlaceId } from "./ai";
import { taggedOf, variableOf } from "./pieces";
import { PIECE_MAX, PromptPieces, Said } from "./prompt";
import { TRIAL_ACTION_IDS, TRIAL_BASES, TRIAL_SETS, TrialPick, isTrialAction, type TrialActionId, type TrialBase, type TrialRating, type TrialResults } from "./promptTrial";
import { RuleCall } from "./rules";
import { MEANINGS_MAX, TouchUpNow, numberedSubtitles, subtitleLinesOf, type SubtitleLine } from "./touchUp";
import { VALUE_MAX } from "./type";

/**
 * A conversation's messages ("Touch up, steered"): what each one of them is, the drawer's about a card and the pop-up's
 * about a word. Each block is a conversation over the admin's prompt (`ai.ts` → `adminPromptOf`), and every message is
 * one call in it, made of the actions ticked on the composer and what was typed. Every message is answered in its
 * place's one shape (`touchUp.ts` → `touchUpShape`: a reply and each field judged, changed or left untouched;
 * `prompt.ts` → `ExplainShape`: a reply and the meanings judged or left untouched). What an action adds is its words and
 * its knobs, never more words for what words can't carry: what must come back (`requires`), and how far the video
 * subtitles reach (`seconds`, either place's: a message's reach is the most of its ticked actions', `reachOf`).
 *
 * Panki's own actions are one registry (`AI_ACTIONS`), the source of their words. Each account can edit one (its copy
 * stands in its place, by Panki's id), delete one (hidden for it, never destroyed), bring either back as Panki's own, add
 * its own, and set each place's order and the actions ticked as a conversation opens (`accountActions.ts` →
 * `AccountActions`). Everything below reads an action through the account's (`actionOf`, `actionsOf`), never the
 * registry alone.
 */
export const AI_ACTION_IDS = [
  "touchUp",
  "cardExplain",
  "cardGrammar",
  "cardConjugation",
  "cardNuance",
  "cardContext",
  "explain",
  "explainGrammar",
  "explainConjugation",
  "explainNuance",
  "explainContext",
  ...TRIAL_ACTION_IDS,
] as const;
export const PankiActionId = z.enum(AI_ACTION_IDS);
export type PankiActionId = z.infer<typeof PankiActionId>;
/** An action as a message is made of it: Panki's own or the account's, its knobs whole. */
export type AiAction = {
  id: AiActionId;
  /** The place whose conversation it's sent in, its composer the one that shows it. */
  place: ActionPlaceId;
  name: string;
  /** What it says in the message, before what was typed; "" for an action that's only knobs. */
  words: string;
  /** What must come back answered: one left untouched is named under the reply, with Try again. */
  requires: readonly ActionPart[];
  /**
   * What must not come back (Leave out): the model is told never to answer it, and one that comes back answered is
   * dropped, never reaching the card or the pop-up, and named under the reply, with Try again. Another action ticked
   * with it that requires the same part wins.
   */
  leaves: readonly ActionPart[];
  /** How many seconds of video subtitles it sends each way (`DEFAULT_ACTION_SECONDS` to begin with), either place's. */
  seconds: number;
};
/**
 * What every one of Panki's actions that wants no reply says of it: when a reply is wanted at all, said concretely, in
 * the action's own words rather than the prompt's (`AI.md` → Settled).
 */
export const QUIET_REPLY = "Leave the reply empty, unless something I asked couldn't be done, or was done differently from what I asked or would expect.";
/** One of Panki's, its knobs as given and the rest the defaults. */
const panki = (action: Pick<AiAction, "place" | "name" | "words"> & Partial<Omit<AiAction, "id" | "place" | "name" | "words">>, id: PankiActionId): AiAction => ({
  id,
  requires: [],
  leaves: [],
  seconds: DEFAULT_ACTION_SECONDS,
  ...action,
});
/** The word's Explain, as it says it: the trial's control says it too. */
const EXPLAIN_WORDS =
  "Explain what the word means here: which dictionary meaning fits (or what it means, if none does) and the nuance it has in this sentence. Leave out grammar, the word's form, its register and anything else; I can ask for those.";
/** The word's Context, as it says it: the trial's control says it too. */
const CONTEXT_WORDS =
  "Translate the sentence the word is in, naturally, then say in a line or two what it means where it stands: what the speaker means, or what they're answering or reacting to in the lines around it. Don't explain the word itself; I know it.";
/** A trial's variant: a word's action under its codename, unticked, needing what the action it stands for needs. */
const trial = (id: TrialActionId, of: "Explain" | "Context", codename: string, words: string): AiAction =>
  panki({ place: "word", name: `${of} · ${codename}`, words, requires: of === "Explain" ? EXPLAIN_PARTS : ["reply"] }, id);
/**
 * TEMPORARY, a blind A/B trial: when the owner pastes Prompt trial results, pick each set's winner and remove this whole
 * feature, by the checklist at the end of this comment.
 *
 * What it is: a blind trial of the Word pop-up's Explain and Context wordings (the owner, 2026-11-20), to find which
 * wording's answers the owner likes best, what bothered them being extra they didn't need and answers too long. Each
 * set is five wordings, Panki actions of the Word pop-up named "Explain · <codename>" or "Context · <codename>", one of
 * them the action's wording word for word (the control), each needing what its action needs so every answer has the
 * same shape. Nothing of this key is ever on screen: the results name codenames alone.
 *
 * The key, each codename and what it tests:
 *
 * Explain:
 * - Pebble: one sentence, nothing else.
 * - Teapot: the dictionary meaning that fits, then one line of nuance only if there's one worth knowing.
 * - Lantern: the control, `explain`'s words.
 * - Walrus: a plain English paraphrase of the word here, 15 words at most, no dictionary talk.
 * - Ladder: only the dictionary meaning that fits, in its own words; more only when none fits.
 *
 * Context:
 * - Mitten: the translation, then one short line on what it answers or reacts to.
 * - Acorn: translation and what it means there, 40 words at most in all.
 * - Kettle: the translation alone.
 * - Button: the control, `explainContext`'s words.
 * - Harbor: one sentence on what the speaker means there, no translation.
 *
 * How it runs (2026-11-21): Panki runs it, the owner picks nothing by hand. The variants are never listed (`actionsOf`,
 * `restorableOf` skip `isTrialAction`); the composer shows plain Explain and Context. A message in the Word pop-up with
 * Explain or Context ticked (Panki's as it comes, never an account's edited copy) goes with one wording of that set,
 * picked by the server the first time it's sent (`routes/ai.ts` → `/word`, `trialPickFor`: the least used so far, a
 * random one among ties, the control among them) and carried with it after (`ExplainSend.trial`, `withTrial`), so a
 * later message rebuilds the first prompt as it went. Blind: the bubble and Details name "Explain" / "Context" (Details'
 * prompt has the words that went). Each answer that went with a wording is a use, kept with its pick, and under it a
 * quiet thumb up and thumb down (`TrialThumbs`), one press, again to take it back; uses and ratings are rows of the
 * account's `events` ledger, no migration (`apps/api/src/promptTrial.ts`). Settings' Prompt trial tab shows per set
 * each codename's uses, 👍 and 👎, with Copy results and Clear results (`PromptTrialPanel`): a clear is a third kind of
 * row, and every read counts only the rows after the latest one, so the counts, the picks and the results start over
 * and a thumb under an answer from before it is refused (the page puts it back). The card's actions are untouched.
 *
 * Choosing the winners, once the owner pastes the results (Settings → Prompt trial → Copy results: per set, each
 * codename's "used", 👍, Meh and 👎): each wording's score is (👍 − 👎) / (👍 + Meh + 👎), that is per answer rated, 👍
 * counting +1, Meh 0 and 👎 −1; an answer left unrated says nothing and counts nowhere. The highest score in its set
 * wins. Ask the owner instead of deciding when it's near: the top two within 0.1 of each other, or the top one rated
 * fewer than 5 times. The control winning (Lantern, Button) means the words stay as they are; the rest of the checklist
 * still applies.
 *
 * The checklist, everything to change or take out (then `pnpm typecheck`, `pnpm build`, `pnpm docs:check`, the contracts
 * and API tests):
 * 1. The winners' words. Explain's into `EXPLAIN_WORDS` (what `explain` says), Context's into `CONTEXT_WORDS` (what
 *    `explainContext` says), word for word. Then the card's pair, `cardExplain` and `cardContext`, in the card's way of
 *    saying it: "In the reply, " first, "the card's word" for "the word", "the card's sentence" for "the sentence the
 *    word is in", "in its sentence" for "here"; their `requires` stay `["reply"]`. The two constants may then be inlined
 *    back into `explain` / `explainContext` as Panki's other actions are.
 * 2. Contracts (`packages/contracts/src/`):
 *    - `aiActions.ts`: this whole comment; `TRIAL_ACTIONS` and its spread at the end of `AI_ACTIONS`; `trial`;
 *      `...TRIAL_ACTION_IDS` in `AI_ACTION_IDS`; every id of the trial (`explainPebble`, `explainTeapot`,
 *      `explainLantern`, `explainWalrus`, `explainLadder`, `contextMitten`, `contextAcorn`, `contextKettle`,
 *      `contextButton`, `contextHarbor`) added to `RETIRED_ACTION_IDS` (its comment saying why), so an account's rows of
 *      them are read by nothing; the `!isTrialAction(id)` in `actionsOf` and `restorableOf`; the section "The blind
 *      trial, run by Panki" (`codenameOf`, `onTrial`, `withTrial`, `trialPickFor`, `trialResultsOf`); `trial` in
 *      `ExplainSend` and its comment; `withTrial(...)` in `explainSendPieces` (back to `litNow(book, "word",
 *      send.actions)`); the `./promptTrial` import.
 *    - `promptTrial.ts`: the whole file, and `export * from "./promptTrial"` in `index.ts`.
 *    - `prompt.ts`: `trial` in `Explained` and the `./promptTrial` import.
 *    - `test/actions.test.ts`: the tests "The blind trial…", "The trial's pick…", "A message sent with its pick…", the
 *      trial's imports (`trialPickFor`, `trialResultsOf`, `withTrial`, `ExplainSend` if unused, `../src/promptTrial`),
 *      and `.slice(0, 5)` taken off the word's lists where it was only there for the trial.
 * 3. API (`apps/api/`):
 *    - `src/promptTrial.ts`: the whole file; in `src/db.ts` its import and `promptTrial: promptTrialStore(db)`.
 *    - `src/routes/ai.ts`: in `/word`, `trialOf`, the `opening` / `send` it builds (back to `const send = sendOf(ask)`
 *      and `ask.opening`), the `pick` / `trial` kept after the answer and `...(trial ? { trial } : {})` in the reply; the
 *      routes `GET /trial`, `POST /trial/clear`, `POST /trial/:use`; the imports `TrialRate`, `trialPickFor`,
 *      `trialPicked`, `trialResultsOf`, `type ExplainSend`.
 *    - `test/promptTrial.test.ts`, and `test/promptTrial.test.ts` in `package.json`'s test script.
 *    - The ledger's rows of kind `promptTrialUse`, `promptTrialRating` and `promptTrialClear` stay in `events`, read by
 *      nothing: no migration, nothing deleted.
 * 4. Extension (`apps/extension/src/`):
 *    - `messages.ts`: the `trialRate` ask, `askTrialRate`, the `TrialRating` import.
 *    - `background.ts`: the `trialRate` branch. `panki.ts`: `trialRate` and the `TrialRating` import.
 *    - `ui/Explain.tsx`: the `trials` state, `rateTrial`, the `TrialThumbs` in `notes` (back to `notesOf(made,
 *      conversation)`), in `sendExplain` the `pick` / `asSent` rebuild (back to `answeredCall(call, …)`), the
 *      `setOpening` with the pick and `setTrials`, `setTrials(new Map())` in `clearConversation`; the imports
 *      `TrialThumbs`, `askTrialRate`, `type TrialRating`.
 *    - `EXTENSION_PROTOCOL` stays as it is: an older extension never sent or read the trial.
 * 5. Web (`apps/web/src/`):
 *    - `components/TrialThumbs.tsx` and `views/PromptTrialPanel.tsx`: the whole files.
 *    - `views/SettingsView.tsx`: the Prompt trial tab, its `TABS` entry, `"trial"` in `SettingsTab`, its
 *      `.settings-tab`, the `PromptTrialPanel` import; the tabs' comment back to six.
 *    - `api.ts`: `trialResults`, `clearTrial`, the `TrialResultsResponse` / `TrialResults` imports.
 *    - `components/Icon.tsx`: `thumbUp`, `meh` and `thumbDown`, if nothing else draws them.
 *    - `components/AiRun.tsx`: `QuietIconButton`'s `pressed`, if nothing else passes it (and `aria-expanded` back to
 *      `open`). `components/PromptContext.tsx`: `CopyButton`'s `words`, if nothing else names one.
 *    - `app.css`: `.prompt-trial-table…`, `.trial-thumbs` and `.quiet-icon > .btn-icon[aria-pressed="true"]`.
 * 6. Docs: the TrialThumbs and promptTrial rows of `docs/COMPONENTS.md`; the line under Under way in `docs/STATUS.md`
 *    (a line of what changed under built-not-yet-seen in its place, the winners named); the entry in `docs/BACKLOG.md`.
 */
const TRIAL_ACTIONS: Record<TrialActionId, AiAction> = {
  explainPebble: trial("explainPebble", "Explain", "Pebble", "In one sentence, say what the word means here. Nothing else: no grammar, no form, no register, no other meanings; I can ask for those."),
  explainTeapot: trial(
    "explainTeapot",
    "Explain",
    "Teapot",
    "Give the dictionary meaning that fits here, then one line on the nuance it has in this sentence, only if there's one worth knowing. Nothing else.",
  ),
  explainLantern: trial("explainLantern", "Explain", "Lantern", EXPLAIN_WORDS),
  explainWalrus: trial(
    "explainWalrus",
    "Explain",
    "Walrus",
    "Say what the word means here as a plain English paraphrase, the way a friend would put it, in 15 words at most. No dictionary talk, nothing else.",
  ),
  explainLadder: trial(
    "explainLadder",
    "Explain",
    "Ladder",
    "Name only the dictionary meaning that fits here, in its own words, and stop. Only if none fits, say what it means here in a few words.",
  ),
  contextMitten: trial(
    "contextMitten",
    "Context",
    "Mitten",
    "Translate the sentence the word is in, naturally, then one short line on what it's answering or reacting to in the lines before it. Nothing else; I know the word.",
  ),
  contextAcorn: trial(
    "contextAcorn",
    "Context",
    "Acorn",
    "Translate the sentence the word is in, naturally, and say what it means where it stands, in 40 words at most in all. Nothing on the word itself; I know it.",
  ),
  contextKettle: trial("contextKettle", "Context", "Kettle", "Translate the sentence the word is in, naturally. Only the translation: nothing on the word, the grammar or the lines around it."),
  contextButton: trial("contextButton", "Context", "Button", CONTEXT_WORDS),
  contextHarbor: trial(
    "contextHarbor",
    "Context",
    "Harbor",
    "In one sentence, say what the speaker means here, in the flow of the lines around it. No translation, and nothing on the word itself; I know it.",
  ),
};
export const AI_ACTIONS: Record<PankiActionId, AiAction> = {
  // What the card's own fields want rides here, not in User instructions, which the word's conversation sends too.
  touchUp: panki(
    {
      place: "card",
      name: "Touch up",
      words: `Touch up the card. Leave the Explanation empty when the Meaning and the sentence already show it all, and keep it to a few words otherwise. Three example sentences, each short, everyday, and nothing to do with the video. ${QUIET_REPLY}`,
      requires: TOUCH_UP_KEYS,
    },
    "touchUp",
  ),
  // The word's reply actions on the card: about the card's word in the card's sentence, each requiring the reply, so
  // these come back with words said whatever the fields do.
  cardExplain: panki(
    {
      place: "card",
      name: "Explain",
      words:
        "In the reply, explain what the card's word means in its sentence: which meaning fits (or what it means, if none does) and the nuance it has there. Leave out grammar, the word's form, its register and anything else; I can ask for those.",
      requires: ["reply"],
    },
    "cardExplain",
  ),
  cardGrammar: panki(
    {
      place: "card",
      name: "Grammar",
      words: "In the reply, name the grammar point the card's word is part of in its sentence and say what it does there. One short example of it elsewhere only if it helps.",
      requires: ["reply"],
    },
    "cardGrammar",
  ),
  cardConjugation: panki(
    {
      place: "card",
      name: "Conjugation",
      words:
        'In the reply, say how the card\'s word, as its sentence has it, is formed from its dictionary form: the steps as one short chain (作る → 作ろう, volitional, "let\'s" / "I\'ll"), then one sentence on what the final form means there. Nothing else.',
      requires: ["reply"],
    },
    "cardConjugation",
  ),
  cardNuance: panki(
    {
      place: "card",
      name: "Nuance",
      words: "In the reply, say what nuance the card's word carries in its sentence: its tone or register and who would say it. Name at most one word it's confused with, and the one difference.",
      requires: ["reply"],
    },
    "cardNuance",
  ),
  // About the sentence, not the word: the word's meaning is known, the rest of the sentence and the lines around it
  // aren't. The default reach, the few lines either side: the conversation's Video context length widens it.
  cardContext: panki(
    {
      place: "card",
      name: "Context",
      words:
        "In the reply, translate the card's sentence naturally, then say in a line or two what it means where it stands: what the speaker means, or what they're answering or reacting to in the lines around it. Don't explain the card's word itself; I know it.",
      requires: ["reply"],
    },
    "cardContext",
  ),
  // The word's, each its starter's ask while Explain had templates: the words of each starter's own paragraph.
  explain: panki(
    {
      place: "word",
      name: "Explain",
      words: EXPLAIN_WORDS,
      requires: EXPLAIN_PARTS,
    },
    "explain",
  ),
  explainGrammar: panki(
    {
      place: "word",
      name: "Grammar",
      words: "Name the grammar point the word is part of in this sentence and say what it does here. One short example of it elsewhere only if it helps.",
      requires: ["reply"],
    },
    "explainGrammar",
  ),
  explainConjugation: panki(
    {
      place: "word",
      name: "Conjugation",
      words:
        'Say how the word is formed from its dictionary form: the steps from the dictionary form to the form in the sentence as one short chain (作る → 作ろう, volitional, "let\'s" / "I\'ll"), then one sentence on what the final form means here. Nothing else.',
      requires: ["reply"],
    },
    "explainConjugation",
  ),
  explainNuance: panki(
    {
      place: "word",
      name: "Nuance",
      words: "Say what nuance the word carries in this sentence: its tone or register and who would say it. Name at most one word it's confused with, and the one difference.",
      requires: ["reply"],
    },
    "explainNuance",
  ),
  // The card's Context, of the sentence the word is in.
  explainContext: panki(
    {
      place: "word",
      name: "Context",
      words: CONTEXT_WORDS,
      requires: ["reply"],
    },
    "explainContext",
  ),
  ...TRIAL_ACTIONS,
};
/** The actions ticked as a place's conversation opens, until the account sets its own: Explain, and Touch up. */
export const PANKI_DEFAULTS: Record<ActionPlaceId, readonly PankiActionId[]> = { word: ["explain"], card: ["touchUp"] };
/** Whether an id is one of Panki's own actions. */
export const isPankiAction = (id: string): id is PankiActionId => (AI_ACTION_IDS as readonly string[]).includes(id);
/**
 * The ids of Panki's actions taken away (Explain the grammar, No explanation; Wider context, whose reach the
 * conversation's Video context length sets now; each field's own Touch up, since Touch up leaves an Explanation empty
 * when it isn't needed): an account's copy of one, or its hiding of one, is kept in its row and read by nothing, never
 * taken for an action of the account's own.
 */
export const RETIRED_ACTION_IDS: readonly string[] = [
  "grammar",
  "noExplanation",
  "widerContext",
  "touchUpMeaning",
  "touchUpReading",
  "touchUpDictionaryForm",
  "touchUpPitchAccent",
  "touchUpSentence",
  "touchUpExplanation",
  "touchUpExamples",
];
/** Whether an id is one an account's action can be read under: anything but a retired one of Panki's. */
export const isLiveActionId = (id: string): boolean => !RETIRED_ACTION_IDS.includes(id);

// ---------- The account's actions

/** An action the account keeps, as a message is made of it. */
const actionOfKept = (kept: KeptAction): AiAction => ({ ...kept });
/** An action as the account would keep it: one of Panki's as it comes, to edit or delete. */
export const keptActionOf = ({ id, place, name, words, requires, leaves, seconds }: AiAction): KeptAction => ({
  id,
  place,
  name,
  words,
  requires: [...requires],
  leaves: [...leaves],
  seconds,
});
/** An action as the account has it: its copy first (Panki's edited, or its own), then Panki's; null for one it deleted, or none by that id. */
export function actionOf(book: AccountActions, id: string): AiAction | null {
  if (book.hidden.includes(id) || !isLiveActionId(id)) return null;
  const kept = book.saved.find((each) => each.id === id);
  if (kept) return actionOfKept(kept);
  return isPankiAction(id) ? AI_ACTIONS[id] : null;
}
/**
 * A place's actions as the account has them, in its order: those it set in order first, then the rest (Panki's in the
 * registry's order, then its own in the order they were made); one it deleted left out. One flat list.
 */
export function actionsOf(book: AccountActions, place: ActionPlaceId): AiAction[] {
  const own = book.saved.filter((each) => each.place === place && !isPankiAction(each.id) && isLiveActionId(each.id)).map((each) => each.id);
  // The blind trial's wordings are never listed: Panki picks one in a message's stead (`trialPickFor`).
  const all = [...AI_ACTION_IDS.filter((id) => AI_ACTIONS[id].place === place && !isTrialAction(id)), ...own];
  const ordered = [...(book.order[place] ?? []).filter((id) => all.includes(id)), ...all];
  return [...new Set(ordered)].flatMap((id) => {
    const action = actionOf(book, id);
    return action && action.place === place ? [action] : [];
  });
}
/** The actions ticked as a place's conversation opens, by id in the place's order: the account's defaults, Panki's until it sets them. */
export function openingActionsOf(book: AccountActions, place: ActionPlaceId): AiActionId[] {
  const defaults: readonly string[] = book.defaults[place] ?? PANKI_DEFAULTS[place];
  return actionsOf(book, place)
    .filter((action) => defaults.includes(action.id))
    .map((action) => action.id);
}
/** How one of a place's actions stands for the account, as Settings → Panki AI lists it: Panki's as it comes, one of Panki's it edited, or its own. */
export type ActionKind = "panki" | "edited" | "own";
export const actionKindOf = (book: AccountActions, id: string): ActionKind =>
  !isPankiAction(id) ? "own" : book.saved.some((each) => each.id === id) ? "edited" : "panki";
/** Panki's actions of a place the account edited or deleted, in the registry's order: what Restore brings back as Panki's own. */
export const restorableOf = (book: AccountActions, place: ActionPlaceId): PankiActionId[] =>
  AI_ACTION_IDS.filter((id) => AI_ACTIONS[id].place === place && !isTrialAction(id) && (book.hidden.includes(id) || book.saved.some((each) => each.id === id)));
/**
 * The actions a message is made of, by its ids, in the place's order (so their words come in it); null when one of them
 * isn't the place's for this account (deleted on another device, or another place's), so a message is never sent with
 * less than was ticked.
 */
export function litOf(book: AccountActions, place: ActionPlaceId, ids: readonly string[]): AiAction[] | null {
  const placed = actionsOf(book, place);
  if (ids.some((id) => !placed.some((action) => action.id === id))) return null;
  return placed.filter((action) => ids.includes(action.id));
}
/** A message's ticked actions as far as they're the place's: what the page draws and costs, the server holding them to `litOf`. */
export const litNow = (book: AccountActions, place: ActionPlaceId, ids: readonly string[]): AiAction[] => actionsOf(book, place).filter((action) => ids.includes(action.id));
/**
 * The name a message goes by in Details when it carries one of the place's defaults ("Touch up", "Touch up 2"): the
 * first of them it carries, in the place's order; null for any other message ("Message 3").
 */
export function runNameOf(book: AccountActions, place: ActionPlaceId, ids: readonly string[]): string | null {
  const opening = openingActionsOf(book, place);
  const first = actionsOf(book, place).find((action) => opening.includes(action.id) && ids.includes(action.id));
  return first?.name ?? null;
}
/**
 * A message's actions as its bubble heads with them: every one by name, in the place's order, a default or not
 * ("Touch up, Grammar", "Nuance"), one look for all.
 */
export const actionNamesOf = (book: AccountActions, place: ActionPlaceId, ids: readonly string[]): string[] => litNow(book, place, ids).map((action) => action.name);

/**
 * What a place takes of an action's knobs, said as what's wrong; null when it holds. A word's action requires parts of
 * the word's answer (the reply, the meanings) and nothing else; a card's requires its fields by their Touch up keys, and
 * the reply. Leave out takes a word's parts, or a card's fields. Nothing twice, and nothing both required and left out.
 * Either place's seconds are the shape's to hold.
 */
export function knobsProblem(action: Pick<AiAction, "place" | "requires" | "leaves">): string | null {
  if (new Set(action.requires).size !== action.requires.length || new Set(action.leaves).size !== action.leaves.length) return "A field named twice.";
  if (action.leaves.some((part) => action.requires.includes(part))) return "A field both required and left out.";
  if (action.place === "word") {
    if (!action.requires.every((part) => ExplainPart.safeParse(part).success)) return "A word's action requires the answer or the meanings.";
    if (!action.leaves.every((part) => ExplainPart.safeParse(part).success)) return "A word's action leaves out the answer or the meanings.";
    return null;
  }
  if (!action.requires.every((part) => part === "reply" || TouchUpKey.safeParse(part).success)) return "A card's action requires the answer or its fields.";
  if (!action.leaves.every((part) => TouchUpKey.safeParse(part).success)) return "A card's action leaves out its fields.";
  return null;
}
/** What a card's action can require, in the order its editor offers them: the reply, then each field by its Touch up key. */
export const CARD_PARTS: readonly ActionPart[] = ["reply", ...TOUCH_UP_KEYS];
/** What a card's action can leave out, in the order its editor offers them: each field by its Touch up key. */
export const CARD_LEAVES: readonly ActionPart[] = TOUCH_UP_KEYS;
/** Whether a message's ticked actions require a reply (the card's Explain, Grammar…): one that came back empty is named, with Try again. */
export const replyRequired = (lit: readonly AiAction[]): boolean => lit.some((action) => action.requires.includes("reply"));
/**
 * The parts a message's ticked actions leave out, of those given, in their order: any one of them leaves it out and none
 * of them requires it (Requires wins, so an action leaving a field out and Touch up ticked together answer it).
 */
const leftOf = <P extends ActionPart>(parts: readonly P[], lit: readonly AiAction[]): P[] =>
  parts.filter((part) => lit.some((action) => action.leaves.includes(part)) && !lit.some((action) => action.requires.includes(part)));

// ---------- A card's messages

/** The keys a card's message may answer: every one the deck maps, in the keys' own order. */
export function keysFor(mapped: readonly TouchUpKey[]): TouchUpKey[] {
  return TOUCH_UP_KEYS.filter((key) => mapped.includes(key));
}
/** The keys a card's message requires to come back: the union of the ticked actions' `requires`, among those it may answer. */
export function requiredFor(mapped: readonly TouchUpKey[], lit: readonly AiAction[]): TouchUpKey[] {
  return keysFor(mapped).filter((key) => lit.some((action) => action.requires.includes(key)));
}
/** The keys a card's message leaves out, among those it may answer: one a ticked action leaves out and none requires. */
export const leftOutFor = (mapped: readonly TouchUpKey[], lit: readonly AiAction[]): TouchUpKey[] => leftOf(keysFor(mapped), lit);
/** A card's actions a deck's composer shows, in the place's order: one requiring fields only where the deck maps one of them. */
export const actionsFor = (book: AccountActions, mapped: readonly TouchUpKey[]): AiAction[] =>
  actionsOf(book, "card").filter((action) => {
    const fields = action.requires.filter((part): part is TouchUpKey => TouchUpKey.safeParse(part).success);
    return fields.length === 0 || fields.some((key) => mapped.includes(key));
  });
/** The ticked actions' words, in the place's order, then what was typed: what the message says in the user's terms. */
const wordsOf = (lit: readonly AiAction[], text: string): string[] => [...lit.map((action) => action.words), text.trim()].filter((line) => line.trim() !== "");
/** Whether a card's message asks anything: a field it requires, or words to say. */
export const asksSomething = (mapped: readonly TouchUpKey[], lit: readonly AiAction[], text: string): boolean =>
  requiredFor(mapped, lit).length > 0 || wordsOf(lit, text).length > 0;
/**
 * Panki's own line after a card's message, its `{Answer requirements}`, apart from the message so it's plainly Panki's
 * and never the user's: the keys that must be answered, and whether the rest may stay untouched; or, with none
 * required, that only what the message asks about is answered; then, absolutely, the keys left out.
 */
export function requirementsOf(mapped: readonly TouchUpKey[], lit: readonly AiAction[]): string {
  const may = keysFor(mapped);
  const required = requiredFor(mapped, lit);
  const left = leftOutFor(mapped, lit);
  const reply = replyRequired(lit) ? "Reply to this message: the reply can't be empty. " : "";
  const never = left.length > 0 ? ` Do not answer ${left.join(", ")}, whatever this message says: leave ${left.length === 1 ? "it" : "each"} exactly as it is.` : "";
  if (required.length === 0) {
    const rest = left.length > 0 ? "Answer only the other keys this message asks about, and leave the rest untouched." : "Answer only the keys this message asks about, and leave the rest untouched.";
    return `${reply}${rest}${never}`;
  }
  const answer = `${reply}Answer ${required.join(", ")}: judge each that holds a value, and write each that's empty.`;
  const others = required.length + left.length < may.length ? " Leave the other keys untouched unless this message asks about them." : "";
  return `${answer}${others}${never}`;
}
/**
 * What a message says in the user's terms, its `{Message}`, the card's and the word's alike: each ticked action's words
 * in the place's order (the account's to write), then what was typed. Sent inside `<user_message>` as the user's own,
 * Panki's requirements apart after it. Built the same way by the server and the page.
 */
export const messageOf = (lit: readonly AiAction[], text: string): string => wordsOf(lit, text).join("\n");

/** The least a message's answer may be, however few fields it requires: room for one field's proposal, its why and a reply. */
const SEND_TOKENS_MIN = 400;
/**
 * A card's message's answer limit: Max Touch up answer length shared by the fields it requires out of the deck's, so an
 * action requiring fewer lowers "Up to" too, never under `SEND_TOKENS_MIN`. A message with words of its own (typed, or an
 * action's that requires nothing) may answer any field, so it has the whole of it, as one requiring
 * nothing does.
 */
export function sendTokens(max: number, mapped: readonly TouchUpKey[], lit: readonly AiAction[], text: string): number {
  const required = requiredFor(mapped, lit).length;
  const free = text.trim() !== "" || lit.some((action) => action.words.trim() !== "" && action.requires.length === 0);
  if (free || required === 0 || mapped.length === 0) return max;
  return Math.min(max, Math.max(SEND_TOKENS_MIN, Math.round((max * required) / mapped.length)));
}
/**
 * How far a message's video subtitles reach each way, in seconds, the card's and the word's alike: the most its ticked
 * actions ask (`seconds`), or `DEFAULT_ACTION_SECONDS` for a message with none ticked (typed alone); and at least the
 * conversation's own reach when one was set for it (`at`, How much of the video in the conversation's settings,
 * `CONVERSATION_REACHES`). The conversation's first message's reach is what its prompt's `{Surrounding video subtitles}`
 * are cut to.
 */
export function reachOf(lit: readonly AiAction[], at: number | null = null): number {
  const actions = lit.length === 0 ? (at ?? DEFAULT_ACTION_SECONDS) : Math.max(...lit.map((action) => action.seconds));
  return Math.min(ACTION_SECONDS_MAX, Math.max(actions, at ?? 0));
}
/**
 * How far a later message's own subtitles reach (`{Wider video subtitles}`, in that message alone): its reach, when
 * that's further than the first message's, whose subtitles every message already carries in the first prompt; null
 * otherwise. `at` and `openingAt` are the conversation's own reach as each was sent (null where none was set).
 */
export function widerOf(lit: readonly AiAction[], opening: readonly AiAction[], at: number | null = null, openingAt: number | null = null): number | null {
  const reach = reachOf(lit, at);
  return reach > reachOf(opening, openingAt) ? reach : null;
}
/**
 * How much of the video a conversation hears, as its settings offer it, in seconds each way (as every reach is kept):
 * on screen each is its whole length around the moment, half before and half after (Video context length, 30 s, 1 min,
 * 3 min, 6 min, 10 min; `contextLengthOf`), the default 1 min, up to the most an action can send
 * (`ACTION_SECONDS_MAX`). The whole video isn't one: a transcript's length is unbounded, past what one message may
 * carry (`PIECE_MAX`) and what Panki sends (Max request length).
 */
export const CONVERSATION_REACHES = [15, DEFAULT_ACTION_SECONDS, 90, 180, ACTION_SECONDS_MAX] as const;
/**
 * A reach as it's shown, Video context length: the whole length around the moment, in seconds, twice what's kept (each
 * way). An action's `seconds` and a message's `reach` stay kept each way; only what's shown and typed is the whole.
 */
export const contextLengthOf = (eachWay: number): number => eachWay * 2;
/** A Video context length typed (the whole, in seconds) as it's kept: each way, a whole second. */
export const eachWayOf = (length: number): number => Math.round(length / 2);
/** A conversation's own reach as a message carries it: seconds each way, within what an action can send. */
const ReachSent = z.number().int().min(0).max(ACTION_SECONDS_MAX).optional();

/**
 * The longest a message's own text can be; the server holds it to Max message length too. Far past it, refused whole.
 */
const TEXT_MAX = 20_000;
/** A message's actions by their ids, each ticked once. */
const actionsSent = z
  .array(AiActionId)
  .max(AI_ACTION_IDS.length + 200)
  .refine((ids) => new Set(ids).size === ids.length, { message: "An action ticked twice." });
/**
 * One message of a card's conversation as the drawer sends it: the actions ticked, what was typed, the card as it stood
 * then (`{Card}`, its fields marked with the keys `keysFor` gives this message), the field it was asked from, by the
 * card's own name for it, when it was (`{Follow-up field}`), the conversation's own reach as it was sent, when one was
 * set (`reach`, seconds each way), and, for a later message reaching further than the first message (`widerOf`), the
 * subtitles that far each way (`{Wider video subtitles}`).
 */
export const TouchUpSend = z.object({
  actions: actionsSent,
  text: z.string().max(TEXT_MAX),
  card: z.string().max(PIECE_MAX),
  field: z.string().max(200).optional(),
  reach: ReachSent,
  wider: z.string().max(PIECE_MAX).optional(),
});
export type TouchUpSend = z.infer<typeof TouchUpSend>;
/**
 * A message's own pieces, its actions read through the account's: its message (the user's), Panki's requirements apart
 * from it, its card, its field and its wider subtitles, numbered a line each as the Sentence is picked from them
 * (`numberedSubtitles`).
 */
export const sendPieces = (send: TouchUpSend, mapped: readonly TouchUpKey[], book: AccountActions): PromptPieces => {
  const lit = litNow(book, "card", send.actions);
  return {
    message: messageOf(lit, send.text),
    requirements: requirementsOf(mapped, lit),
    card: send.card,
    ...(send.field ? { field: send.field } : {}),
    ...(send.wider ? { wider: numberedSubtitles(send.wider) } : {}),
  };
};
/**
 * A card's conversation's first pieces as its prompt has them: the surrounding video subtitles numbered a line each
 * (`numberedSubtitles`), what a Sentence's line numbers name. What the page sends stays as the page has it; the server
 * and the page each number it here before the prompt is filled.
 */
export const cardPiecesOf = (pieces: PromptPieces): PromptPieces => (pieces.surrounding ? { ...pieces, surrounding: numberedSubtitles(pieces.surrounding) } : pieces);
/**
 * The subtitles a card's message picks its Sentence from, a line each by its number: the surrounding ones of the
 * conversation's first message and its own wider ones together, each number once, in order (every line has one number
 * in every message, so either list can be picked from); none off a video.
 */
export function sentenceLinesOf(pieces: PromptPieces, send: Pick<TouchUpSend, "wider">): SubtitleLine[] {
  const byNumber = new Map<number, SubtitleLine>();
  for (const line of [...subtitleLinesOf(pieces.surrounding ?? ""), ...subtitleLinesOf(send.wider ?? "")]) byNumber.set(line.n, line);
  return [...byNumber.values()].sort((a, b) => a.n - b.n);
}
/**
 * The keys a card's message may answer as it's sent: the deck's, the Line only where there are subtitle lines to
 * pick it from (`sentenceLinesOf`), since it's answered as lines and never written.
 */
export const keysWithLines = (mapped: readonly TouchUpKey[], lines: readonly SubtitleLine[]): TouchUpKey[] =>
  lines.length > 0 ? [...mapped] : mapped.filter((key) => key !== "line");

/**
 * The user's words inside a tag that names them so, the one way both places send them: what a user, or an action the
 * account wrote, says is plainly theirs, never one of Panki's instructions. A line that comes out empty is left out.
 */
const USER_MESSAGE = `<user_message>${variableOf("message")}</user_message>`;
/**
 * Each message's own part, Panki's, never edited (an admin's prompt is never changed for it): the user's words
 * (`<user_message>`), then Panki's requirements apart from them (`<answer_requirements>`), the field it was asked from,
 * the wider subtitles its actions asked for, and the card last. A line whose variables all come out empty is left out.
 */
const SEND_MESSAGE = `${USER_MESSAGE}
${taggedOf("requirements")}
${taggedOf("field")}
${taggedOf("wider")}
${taggedOf("card")}`;
/** What Panki sends after the admin's prompt with every message, by place: shown under the prompt in Admin, read-only. */
export const messagePartOf = (place: ActionPlaceId): string => (place === "card" ? SEND_MESSAGE : WORD_MESSAGE);
/** Where the admin's prompt puts a conversation's first message: its first `{First message}`. */
const FIRST_MESSAGE = variableOf("firstMessage");
/**
 * An admin's prompt with a conversation's first message in it (`part`, the message part, filled with the prompt): where
 * the prompt has `{First message}`, there; at the prompt's end otherwise, so a prompt saved without it still works.
 */
const withFirstMessage = (prompt: string, part: string): string =>
  prompt.includes(FIRST_MESSAGE) ? prompt.replace(FIRST_MESSAGE, () => part) : `${prompt}

${part}`;

/**
 * What a card's conversation sends, as a template for `aiSent`: the first prompt is the admin's prompt (its
 * `{User instructions}` where it stands in it, the account's standing message) with the conversation's first message
 * where it has `{First message}`, after it otherwise (`withFirstMessage`); every later message is its own. Built the
 * same way by the server, which sends it, and the page, which says what it costs and what went (Details).
 */
export function cardPromptOf(settings: { aiPrompts: Partial<Record<AdminPromptPlaceId, string>> }): { name: string; prompt: string; followUp: string } {
  return { name: AI_ACTIONS.touchUp.name, prompt: withFirstMessage(adminPromptOf(settings, "card"), SEND_MESSAGE), followUp: SEND_MESSAGE };
}

/**
 * What a card's message sends: the pieces as the conversation's first message had them (the dictionary, the page, the
 * video), every meaning of the dictionaries in `{Meaning}`'s order (so a number in the answer is checked against the real
 * list), the keys whose roles have a field on the deck, and the card as it stands, what the answer is held to; then the
 * conversation's first message (`opening`), which the first prompt ends with, the conversation so far (`Said`) and, for
 * every message after the first, this one (`send`). The server fills the admin's prompt, the standing message and the
 * actions' words itself, by the account's actions, never text the page sends.
 */
export const TouchUpAsk = z.object({
  pieces: PromptPieces,
  meanings: z.array(z.string().max(VALUE_MAX)).max(MEANINGS_MAX),
  keys: z.array(TouchUpKey).min(1).max(TOUCH_UP_KEYS.length),
  now: TouchUpNow,
  opening: TouchUpSend,
  said: Said.default([]),
  send: TouchUpSend.optional(),
  /** Sent for a rule (a card added), the card it's about: held to the rule's caps and kept as its run. */
  rule: RuleCall.optional(),
});
export type TouchUpAsk = z.infer<typeof TouchUpAsk>;
/** The message being answered: the conversation's first, or the one after it. The card's and the word's alike. */
export const sendOf = <S>(ask: { opening: S; said: readonly unknown[]; send?: S | undefined }): S => (ask.said.length > 0 && ask.send ? ask.send : ask.opening);

// ---------- The blind trial, run by Panki
// Temporary: the prompt trial, removed whole once the owner picks (aiActions.ts → the key above TRIAL_ACTIONS).

/** A wording's codename, as the results name it: its name after the dot ("Explain · Pebble" → "Pebble"). */
const codenameOf = (id: TrialActionId): string => AI_ACTIONS[id].name.split(" · ")[1] ?? id;
/** Whether an action is on trial for this account: one of `TRIAL_SETS`, Panki's as it comes (an edited one is the account's own words). */
const onTrial = (book: AccountActions, id: string): id is TrialBase => id in TRIAL_SETS && actionKindOf(book, id) === "panki";
/**
 * A message's actions with the trial's wordings in: each one the pick names says its wording's words under its own id
 * and name, so the bubble and Details still say "Explain"; every knob the same, so the answer's shape is too.
 */
export function withTrial(book: AccountActions, lit: readonly AiAction[], pick: TrialPick | undefined): AiAction[] {
  return lit.map((action) => {
    const variant = pick && onTrial(book, action.id) ? pick[action.id] : undefined;
    return variant ? { ...action, words: AI_ACTIONS[variant].words } : action;
  });
}
/**
 * The wordings for a message's actions on trial: for each, the least used of its set so far (`uses`, by wording), a
 * random one among those tied, so they even out. Empty for a message with none on trial.
 */
export function trialPickFor(book: AccountActions, actions: readonly string[], uses: Readonly<Record<string, number>>, random: () => number = Math.random): TrialPick {
  const pick: TrialPick = {};
  for (const base of TRIAL_BASES) {
    if (!actions.includes(base) || !onTrial(book, base)) continue;
    const set = TRIAL_SETS[base];
    const least = Math.min(...set.map((id) => uses[id] ?? 0));
    const tied = set.filter((id) => (uses[id] ?? 0) === least);
    const chosen = tied[Math.min(tied.length - 1, Math.floor(random() * tied.length))];
    if (chosen) pick[base] = chosen;
  }
  return pick;
}
/** The trial's results from what's kept: each use's pick, and every rating in the order given, an answer's latest standing. */
export function trialResultsOf(uses: readonly { id: number; pick: TrialPick }[], ratings: readonly { use: number; rating: TrialRating | null }[]): TrialResults {
  const latest = new Map<number, TrialRating | null>();
  for (const each of ratings) latest.set(each.use, each.rating);
  return {
    sets: TRIAL_BASES.map((base) => ({
      name: AI_ACTIONS[base].name,
      rows: TRIAL_SETS[base].map((id) => {
        const went = uses.filter((use) => use.pick[base] === id);
        const rated = went.map((use) => latest.get(use.id) ?? null);
        const count = (rating: TrialRating) => rated.filter((r) => r === rating).length;
        return { codename: codenameOf(id), used: went.length, up: count("up"), meh: count("meh"), down: count("down") };
      }),
    })),
  };
}
// ---------- A word's messages ("Touch up, steered" step 4)

/** The parts a word's message requires to come back: the union of its ticked actions' `requires`, in the parts' order. */
export const explainRequiredFor = (lit: readonly AiAction[]): ExplainPart[] => EXPLAIN_PARTS.filter((part) => lit.some((action) => action.requires.includes(part)));
/** Whether a word's message asks anything: a part it requires, or words to say. */
export const explainAsks = (lit: readonly AiAction[], text: string): boolean => explainRequiredFor(lit).length > 0 || wordsOf(lit, text).length > 0;
/**
 * Panki's own line after a word's message, its `{Answer requirements}`, apart from the message so it's plainly Panki's:
 * whether the meanings must be judged, and, absolutely, what's left out.
 */
export function explainRequirementsOf(lit: readonly AiAction[]): string {
  const required = explainRequiredFor(lit);
  const left = explainLeftOutFor(lit);
  const silent = left.includes("reply");
  const lines = [
    required.includes("meanings") ? (silent ? "Judge every meaning in <meaning>." : "Reply, and judge every meaning in <meaning>.") : silent ? "" : "Reply to this message.",
    required.includes("meanings") || left.includes("meanings") ? "" : "Leave the meanings untouched unless it asks about them.",
    silent ? 'Do not reply, whatever this message says: leave the reply exactly "".' : "",
    left.includes("meanings") ? "Do not judge the meanings or propose one, whatever this message says: leave them exactly as they are." : "",
  ];
  return lines.filter((line) => line !== "").join(" ");
}
/** The parts a word's message leaves out: one a ticked action leaves out and none requires, in the parts' order. */
export const explainLeftOutFor = (lit: readonly AiAction[]): ExplainPart[] => leftOf(EXPLAIN_PARTS, lit);

/**
 * One message of a word's conversation as the pop-up sends it: the actions ticked, what was typed, the conversation's
 * own reach as it was sent when one was set, and, for a later message reaching further than the first's (`widerOf`),
 * the subtitles that far each way; and, once Panki picked them, the blind trial's wordings it went with (`trial`).
 */
export const ExplainSend = z.object({ actions: actionsSent, text: z.string().max(TEXT_MAX), reach: ReachSent, wider: z.string().max(PIECE_MAX).optional(), trial: TrialPick.optional() });
export type ExplainSend = z.infer<typeof ExplainSend>;
/** A message's own pieces, its actions read through the account's (the trial's wordings in, `withTrial`): its message (the user's), Panki's requirements apart from it, and its wider subtitles. */
export const explainSendPieces = (send: ExplainSend, book: AccountActions): PromptPieces => {
  const lit = withTrial(book, litNow(book, "word", send.actions), send.trial);
  return { message: messageOf(lit, send.text), requirements: explainRequirementsOf(lit), ...(send.wider ? { wider: send.wider } : {}) };
};
/**
 * A word's message's own part, Panki's, never edited: the user's words (`<user_message>`), the wider subtitles it asked
 * for, then Panki's requirements apart from them, last. A line that comes out empty is left out.
 */
const WORD_MESSAGE = `${USER_MESSAGE}
${taggedOf("wider")}
${taggedOf("requirements")}`;
/**
 * What a word's conversation sends, as a template for `aiSent`: the first prompt is the admin's (its
 * `{User instructions}` where it stands in it) with the conversation's first message where it has `{First message}`,
 * after it otherwise (`withFirstMessage`); every later message is its own. Built the same way by the server, which
 * sends it, and the page, which says what it costs and what went (Details).
 */
export function wordPromptOf(settings: { aiPrompts: Partial<Record<AdminPromptPlaceId, string>> }): { name: string; prompt: string; followUp: string } {
  return { name: AI_ACTIONS.explain.name, prompt: withFirstMessage(adminPromptOf(settings, "word"), WORD_MESSAGE), followUp: WORD_MESSAGE };
}
/**
 * What a word's message sends: the pieces of the word pointed at, every meaning of the dictionaries in `{Meaning}`'s
 * order (so an answer's rows are checked against the real list, one for each), the conversation's first message
 * (`opening`), which the first prompt ends with, the conversation so far (`Said`) and, for every message after the first,
 * this one (`send`). The server fills the admin's prompt, the standing message and the actions' words itself, by the
 * account's actions, never text the page sends.
 */
export const ExplainAsk = z.object({
  pieces: PromptPieces,
  meanings: z.array(z.string().max(PIECE_MAX)).max(MEANINGS_MAX).default([]),
  opening: ExplainSend,
  said: Said.default([]),
  send: ExplainSend.optional(),
  /** Sent for a rule (the Word pop-up opening), the word it's about: held to the rule's caps and kept as its run. */
  rule: RuleCall.optional(),
});
export type ExplainAsk = z.infer<typeof ExplainAsk>;
