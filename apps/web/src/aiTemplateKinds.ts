import {
  AI_ACTIONS,
  ASK_OVER,
  DEFAULT_FOLLOW_UPS,
  aiModelOf,
  ceilingMicros,
  copyNameOf,
  proofreadPieces,
  proofreadTokens,
  type AiActionId,
  type AiTemplate,
  type PankiAi,
} from "@panki/contracts";
import { estimateWords } from "./words";

/**
 * Panki AI's templates in words and looks (AI step 5), as `srsKinds.ts` is the SRS's: which actions let a template
 * choose whether it judges the meanings, what a row says under a template's name, what a run of it can cost, how a new
 * one starts, and Ask before a run over's choices. The templates themselves, and Panki's starters, are the contracts'
 * (`aiTemplates.ts`).
 */

/**
 * Whether an action's templates choose to judge the meanings (Explain's alone: the owner, 2026-11-01). Where it isn't a
 * choice, a template always does (Touch up's every answer judges the Meaning).
 */
export const MEANINGS_CHOICE: Record<AiActionId, boolean> = { explain: true, touchUp: false, proofread: false };
/**
 * Whether an action's runs take follow-ups, so its templates' editor shows the Follow-up prompt (Proofread's don't: a
 * run edits, asking further is running it again; AI step 6). A template keeps its `followUp` either way, unused there.
 */
export const TAKES_FOLLOW_UPS: Record<AiActionId, boolean> = { explain: true, touchUp: true, proofread: false };
/** The Meanings switch, in the editor, and the line under a template's name in a list, for an action whose templates choose. */
export const MEANINGS_SAYS = { on: "Judged", off: "Not judged" } as const;
export const JUDGES_WORDS = { on: "Judges the meanings", off: "Plain answer" } as const;
/** The line under a template's name: whether it judges the meanings, where that's a choice; none otherwise. */
export const templateSub = (template: Pick<AiTemplate, "action" | "judges">): string | null =>
  MEANINGS_CHOICE[template.action] ? (template.judges ? JUDGES_WORDS.on : JUDGES_WORDS.off) : null;

/**
 * The video a Proofread row's "Up to" is for, since a run's size is the video's: 15 minutes of Japanese, about 350
 * characters and 14 lines a minute, so 212 lines of 25 characters. Written as the server writes `{Transcript}`
 * (`proofreadPieces`), so it's counted as a real run's is.
 */
const SAMPLE_VIDEO = { minutes: 15, lines: 212, lineChars: 25 } as const;
const sampleTranscript = (): string =>
  proofreadPieces(Array.from({ length: SAMPLE_VIDEO.lines }, () => [{ text: "あ".repeat(SAMPLE_VIDEO.lineChars), hand: false, unsure: false }])).transcript ?? "";

/**
 * How big a run of an action is, for its "Up to": the limit its answer is held to (as the extension's buttons and the
 * server work it out), what's sent on top of the prompt's own words, and what the number is for when it depends on more
 * than the template. One entry per action.
 */
type RunSize = {
  answerTokens: (settings: PankiAi) => number;
  sentWith: () => string;
  /** What the number is for, after it ("for 15 minutes"), and how its (?) says what was counted; null for a run the template alone sizes. */
  sample: { words: string; how: string } | null;
};
const RUN_SIZES: Record<AiActionId, RunSize> = {
  explain: { answerTokens: (s) => s.aiMaxAnswerTokens, sentWith: () => "", sample: null },
  touchUp: { answerTokens: (s) => s.aiMaxTouchUpTokens, sentWith: () => "", sample: null },
  proofread: {
    answerTokens: (s) => proofreadTokens(SAMPLE_VIDEO.lines, s.aiMaxProofreadTokens),
    sentWith: sampleTranscript,
    sample: {
      words: `for ${SAMPLE_VIDEO.minutes} minutes`,
      how: `a ${SAMPLE_VIDEO.minutes}-minute video's transcript, about ${(SAMPLE_VIDEO.lines * SAMPLE_VIDEO.lineChars).toLocaleString("en")} characters in ${SAMPLE_VIDEO.lines} lines`,
    },
  },
};

/**
 * What a run of a template can cost at most, on the model an admin set: "Up to $0.0006 (est.)", or for a run sized by
 * the video "Up to $0.0027 (est.) for 15 minutes". Its prompt as written, before Prompt context fills it, so a little
 * under what a real run's button says.
 */
export function ceilingWords(template: Pick<AiTemplate, "action" | "prompt">, settings: PankiAi): string {
  const size = RUN_SIZES[template.action];
  const micros = ceilingMicros(aiModelOf(settings), [template.prompt + size.sentWith()], size.answerTokens(settings));
  return `Up to ${estimateWords(micros)}${size.sample ? ` ${size.sample.words}` : ""}`;
}

/** A price per million tokens, from whole cents: "$0.10". */
const perMillion = (cents: number): string => `$${(cents / 100).toFixed(2)}`;
/**
 * How Each run's number is worked out, as its (?) says it (the owner, 2026-11-01: "explaining how the number is
 * calculated briefly, because right now it seems arbitrarily small"): exactly what `ceilingWords` counts, the prompt's
 * own words and the longest answer allowed, each at the model's listed price, and that what the variables hold comes on
 * top, which the button's own "Up to" on a page counts.
 */
export function ceilingHow(action: AiActionId, settings: PankiAi): string {
  const model = aiModelOf(settings);
  const size = RUN_SIZES[action];
  const answer = size.answerTokens(settings).toLocaleString("en");
  const sent = size.sample ? `The prompt's own words and ${size.sample.how},` : "The prompt's own words";
  const longest = size.sample ? "the longest answer allowed for that many lines" : "the longest answer allowed";
  const others = size.sample ? "its other variables" : "its variables";
  return `${sent} at ${model.name}'s listed ${perMillion(model.inCentsPerMTok)} per million tokens in, plus ${longest}, ${answer} tokens, at ${perMillion(model.outCentsPerMTok)} per million out. What ${others} hold comes on top: the Up to beside the button on a page counts them.`;
}

/** A new template's name before it's given one: "New Explain template". */
export const newTemplateName = (action: AiActionId): string => `New ${AI_ACTIONS[action].name} template`;
/**
 * A template that isn't kept yet, on the screen alone until its first Save, under an id of the page's own (Panki gives
 * it its real one then): empty (no prompt, the action's own follow-up), or a copy of another, named as a copy among
 * the names already taken.
 */
export function draftTemplate(action: AiActionId, base: AiTemplate | null, taken: readonly string[]): AiTemplate {
  const id = crypto.randomUUID();
  if (base) return { ...base, id, name: copyNameOf(base.name, taken), builtin: false };
  return { id, action, name: newTemplateName(action), prompt: "", followUp: DEFAULT_FOLLOW_UPS[action], judges: !MEANINGS_CHOICE[action], builtin: false };
}

/** Ask before a run over's choices as a `Dropdown` takes them: null (never) and 0 (always) by name, an amount by its id in words. */
export const askOverId = (askOver: number | null): string => (askOver === null ? "never" : askOver === 0 ? "always" : String(askOver));
export const ASK_OVER_OPTIONS = ASK_OVER.map((askOver) => ({ id: askOverId(askOver), label: askOver === null ? "Never" : askOver === 0 ? "Always" : estimateWords(askOver) }));
/** The amount a choice stands for (null: never). */
export const askOverOf = (id: string): number | null => ASK_OVER.find((askOver) => askOverId(askOver) === id) ?? null;
